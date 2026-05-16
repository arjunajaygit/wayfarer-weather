from dotenv import load_dotenv
load_dotenv()  # loads backend/.env into environment for local dev
from fastapi import FastAPI, Depends, HTTPException
from pydantic import BaseModel
from google import genai
from sqlalchemy.orm import Session
from sqlalchemy import desc
from typing import Optional
import os
from sqlalchemy import text, inspect
import csv
from io import StringIO
import requests # We need this to make external API calls
import datetime
try:
    from . import models, database
    from .database import engine
except ImportError:
    import models, database
    from database import engine
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
models.Base.metadata.create_all(bind=engine)
actual_uvi = None
# Ensure optional columns exist for deployments using an existing DB table
def ensure_optional_columns():
    alter_stmts = [
        "ALTER TABLE weather_searches ADD COLUMN IF NOT EXISTS humidity INTEGER",
        "ALTER TABLE weather_searches ADD COLUMN IF NOT EXISTS wind_speed REAL",
        "ALTER TABLE weather_searches ADD COLUMN IF NOT EXISTS wind_direction VARCHAR",
        "ALTER TABLE weather_searches ADD COLUMN IF NOT EXISTS feels_like REAL",
        "ALTER TABLE weather_searches ADD COLUMN IF NOT EXISTS condition VARCHAR",
        "ALTER TABLE weather_searches ADD COLUMN IF NOT EXISTS icon VARCHAR",
        "ALTER TABLE weather_searches ADD COLUMN IF NOT EXISTS aqi INTEGER",
        "ALTER TABLE weather_searches ADD COLUMN IF NOT EXISTS precipitation REAL",
        "ALTER TABLE weather_searches ADD COLUMN IF NOT EXISTS uv_index REAL",
        "ALTER TABLE weather_searches ADD COLUMN IF NOT EXISTS sunrise VARCHAR",
        "ALTER TABLE weather_searches ADD COLUMN IF NOT EXISTS sunset VARCHAR",
    ]
    try:
        # Use a transaction block and SQLAlchemy text() for raw SQL execution
        with engine.begin() as conn:
            for stmt in alter_stmts:
                try:
                    conn.execute(text(stmt))
                except Exception as e:
                    # Log and continue — some DBs may not support IF NOT EXISTS syntax
                    print(f"Could not run migration statement: {stmt} — {e}")
    except Exception as e:
        print("DB migration helper failed to connect:", e)

ensure_optional_columns()


def get_wind_direction(degrees: float) -> str:
    dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
    ix = round(degrees / (360. / len(dirs)))
    return dirs[ix % len(dirs)]

app = FastAPI(title="Traveler's Weather API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Allows any frontend to connect temporarily
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 1. Define what we expect from the frontend (ONLY the location)
class WeatherRequest(BaseModel):
    location: str
    lat: Optional[float] = None
    lon: Optional[float] = None

class SearchUpdate(BaseModel):
    location_query: str


# --- NEW: AI Insight Route ---
# Make sure to paste your real Gemini API key here or set GEMINI_API_KEY in backend/.env
gemini_client = genai.Client(api_key=os.getenv("GEMINI_API_KEY", "GEMINI_API_KEY"))


class WeatherContext(BaseModel):
    location: str
    temp: float
    aqi: int
    wind: float
    rain_chance: int
    uv: float

@app.get("/")
def read_root():
    return {"message": "Welcome to the Weather API"}


@app.post("/api/insight")
def generate_ai_insight(data: WeatherContext):
    # This is the "Prompt Engineering" that tells the AI how to act
    prompt = f"""
    You are 'Wayfarer', a highly intelligent travel and weather assistant.
    The user is currently looking at the weather for {data.location}.
    
    LIVE DATA:
    - Temperature: {data.temp}°C
    - Air Quality (1=Good, 5=Severe): {data.aqi}
    - Wind: {data.wind} km/h
    - Chance of Rain: {data.rain_chance}%
    - UV Index: {data.uv}
    
    TASK: Write a 1 to 2 sentence practical recommendation for someone visiting or living in this area today. 
    Focus on combining the most critical factors (e.g., if it's hot AND rainy, mention humidity). 
    Keep it conversational, helpful, and concise. Do NOT use markdown formatting like asterisks.
    """

    try:
        response = gemini_client.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt,
        )
        return {"insight": response.text}
    except Exception as e:
        print("GEMINI ERROR:", e)
        return {"insight": "AI atmospheric analysis is temporarily offline."}


# --- 1. NEW ROUTE: Fetch City Suggestions ---
@app.get("/suggestions/{query}")
def get_suggestions(query: str):
    if len(query) < 2:
        return []

    GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY", "YOUR_GOOGLE_API_KEY")

    url = f"https://maps.googleapis.com/maps/api/geocode/json?address={query}&key={GOOGLE_API_KEY}"

    response = requests.get(url)
    if response.status_code == 200:
        data = response.json()

        # --- NEW: Catch Google's silent errors ---
        if data.get("status") != "OK":
            print("GOOGLE API ERROR:", data.get("error_message", data.get("status")))
            return []

        formatted_suggestions = []

        # Loop through the top 5 Google results
        for item in data.get("results", [])[:5]:
            # Google gives us a perfectly formatted string (e.g., "New Delhi, Delhi, India")
            address_parts = item["formatted_address"].split(",")

            # The first part is the city name
            main_name = address_parts[0].strip()

            # The rest of the string is the state/country
            subtitle = ", ".join(address_parts[1:]).strip() if len(address_parts) > 1 else ""

            # Package it exactly how React expects it!
            formatted_suggestions.append({
                "name": main_name,
                "state": "", # Left blank because 'subtitle' handles it
                "country": subtitle,
                "lat": item["geometry"]["location"]["lat"],
                "lon": item["geometry"]["location"]["lng"]
            })

        return formatted_suggestions
    return []

@app.get("/export/csv")
def export_searches_csv(db: Session = Depends(database.get_db)):
    # Fetch all search history records sorted by date
    searches = db.query(models.WeatherSearch).order_by(desc(models.WeatherSearch.search_date)).all()
    
    # Create an in-memory text stream
    stream = StringIO()
    writer = csv.writer(stream)
    
    # Write the CSV headers (the column titles)
    writer.writerow([
        "ID", "City", "Country/State", "Latitude", "Longitude", 
        "Temperature (°C)", "Humidity (%)", "Wind Speed (km/h)", 
        "Condition", "AQI Level", "Search Date (UTC)"
    ])
    
    # Write the data rows
    for s in searches:
        writer.writerow([
            s.id, s.location_query, s.wind_direction, s.latitude, s.longitude,
            s.temperature, s.humidity, s.wind_speed, 
            s.condition, s.aqi, s.search_date
        ])
        
    # Reset the stream pointer to the beginning
    stream.seek(0)
    
    # Return the data as a downloadable attachment file
    response = StreamingResponse(stream, media_type="text/csv")
    response.headers["Content-Disposition"] = "attachment; filename=weather_search_history.csv"
    return response

# --- NEW ROUTE: Fetch YouTube Travel Videos ---
@app.get("/videos/{location}")
def get_videos(location: str):
    try:
        # Prefer API keys from environment for security
        GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY", "YOUR_GOOGLE_API_KEY")

        # We append "travel vlog" to the query so we get cinematic videos instead of news reports
        search_query = f"{location} travel vlog 4k"
        url = f"https://www.googleapis.com/youtube/v3/search?part=snippet&q={search_query}&type=video&maxResults=2&key={GOOGLE_API_KEY}"

        response = requests.get(url, timeout=6)
        response.raise_for_status()
        data = response.json()
        videos = []
        for item in data.get("items", []):
            # Defensive access in case structure varies
            vid = item.get("id", {}).get("videoId")
            snip = item.get("snippet", {})
            if not vid:
                continue
            videos.append({
                "id": vid,
                "title": snip.get("title", ""),
                "channel": snip.get("channelTitle", "")
            })
        return videos
    except Exception as e:
        # If we hit the quota limit or any network error, catch it and log
        print(f"YOUTUBE API ERROR: {e}")
        # Return an empty list so the React frontend doesn't crash
        return []

# 2. Update the POST route to use the Pydantic model
@app.post("/searches/")
def create_search(search: WeatherRequest, db: Session = Depends(database.get_db)):
    
    # --- STEP 1: Get the location from the user's request ---
    city = search.location
    
    # --- STEP 2: Call the real Weather API ---
    # (You will need to sign up for a free OpenWeatherMap API key and replace the string below)
    API_KEY = os.getenv("OPENWEATHER_API_KEY", "YOUR_OPENWEATHER_API_KEY")
    
    # --- BULLETPROOF ROUTING ---
    # If React sends us exact coordinates from the dropdown, use them!
    if search.lat is not None and search.lon is not None:
        url = f"http://api.openweathermap.org/data/2.5/weather?lat={search.lat}&lon={search.lon}&appid={API_KEY}&units=metric"
    # Otherwise, fallback to the standard name search (if they just typed and hit Enter)
    else:
        url = f"http://api.openweathermap.org/data/2.5/weather?q={city}&appid={API_KEY}&units=metric"
    
    response = requests.get(url)
    
    # If the user typed a city that doesn't exist, handle the error gracefully!
    if response.status_code != 200:
        # ADD THIS PRINT STATEMENT:
        print("OPENWEATHER REJECTED US. HERE IS WHY:", response.json())
        raise HTTPException(status_code=404, detail="City not found by Weather API")
    weather_data = response.json()

    # Initialize UV variable for update
    actual_uvi = None
    try:
        onecall_url = f"http://api.openweathermap.org/data/2.5/onecall?lat={weather_data['coord']['lat']}&lon={weather_data['coord']['lon']}&exclude=minutely,hourly,daily,alerts&appid={API_KEY}"
        onecall_resp = requests.get(onecall_url)
        if onecall_resp.status_code == 200:
            actual_uvi = onecall_resp.json().get('current', {}).get('uvi')
    except Exception as e:
        print('UV fetch failed (update):', e)
    
    # --- STEP 3: Extract the standard data ---
    actual_temp = weather_data["main"]["temp"]
    actual_lat = weather_data["coord"]["lat"]
    actual_lon = weather_data["coord"]["lon"]

    # --- STEP 3.5: Extract the NEW detail data ---
    actual_humidity = weather_data["main"]["humidity"]

    # Safely get the rain volume for the last 1 hour (in mm). Default to 0.0 if no rain.
    rain_data = weather_data.get("rain", {})
    actual_precip = rain_data.get("1h", 0.0)

    actual_feels_like = weather_data["main"]["feels_like"]

    # OpenWeather uses meters/sec for metric wind. Multiply by 3.6 for km/h.
    actual_wind_speed = round(weather_data["wind"]["speed"] * 3.6, 1)
    actual_wind_dir = get_wind_direction(weather_data["wind"].get("deg", 0))

    actual_condition = weather_data["weather"][0]["main"]
    
    # --- NEW: FETCH AQI DATA ---
    aqi_url = f"http://api.openweathermap.org/data/2.5/air_pollution?lat={actual_lat}&lon={actual_lon}&appid={API_KEY}"
    aqi_response = requests.get(aqi_url)
    actual_aqi = 1 # Default fallback
    if aqi_response.status_code == 200:
        aqi_data = aqi_response.json()
        actual_aqi = aqi_data["list"][0]["main"]["aqi"] # Returns 1 (Good) to 5 (Hazardous)

    actual_icon = weather_data["weather"][0]["icon"]

    # --- FETCH UV INDEX FOR UPDATED CITY ---
    actual_uvi = None
    try:
        onecall_url = f"http://api.openweathermap.org/data/2.5/onecall?lat={weather_data['coord']['lat']}&lon={weather_data['coord']['lon']}&exclude=minutely,hourly,daily,alerts&appid={API_KEY}"
        onecall_resp = requests.get(onecall_url)
        if onecall_resp.status_code == 200:
            onecall_data = onecall_resp.json()
            actual_uvi = onecall_data.get('current', {}).get('uvi')
    except Exception as e:
        print('UV fetch failed (update):', e)

    # --- FETCH UV INDEX FOR UPDATED CITY ---
    actual_uvi = None
    try:
        onecall_url = f"http://api.openweathermap.org/data/2.5/onecall?lat={weather_data['coord']['lat']}&lon={weather_data['coord']['lon']}&exclude=minutely,hourly,daily,alerts&appid={API_KEY}"
        onecall_resp = requests.get(onecall_url)
        if onecall_resp.status_code == 200:
            onecall_data = onecall_resp.json()
            actual_uvi = onecall_data.get('current', {}).get('uvi')
    except Exception as e:
        print('UV fetch failed (update):', e)

    # --- NEW: FETCH UV INDEX FOR UPDATED CITY ---
    actual_uvi = None
    try:
        onecall_url = f"http://api.openweathermap.org/data/2.5/onecall?lat={weather_data['coord']['lat']}&lon={weather_data['coord']['lon']}&exclude=minutely,hourly,daily,alerts&appid={API_KEY}"
        onecall_resp = requests.get(onecall_url)
        if onecall_resp.status_code == 200:
            onecall_data = onecall_resp.json()
            actual_uvi = onecall_data.get('current', {}).get('uvi')
    except Exception as e:
        print('UV fetch failed (update):', e)

    # --- NEW: FETCH UV INDEX FOR UPDATED CITY ---
    actual_uvi = None
    try:
        onecall_url = f"http://api.openweathermap.org/data/2.5/onecall?lat={weather_data['coord']['lat']}&lon={weather_data['coord']['lon']}&exclude=minutely,hourly,daily,alerts&appid={API_KEY}"
        onecall_resp = requests.get(onecall_url)
        if onecall_resp.status_code == 200:
            onecall_data = onecall_resp.json()
            actual_uvi = onecall_data.get('current', {}).get('uvi')
    except Exception as e:
        print('UV fetch failed (update):', e)

    # --- NEW: FETCH UV INDEX (One Call Current) ---
    actual_uvi = None
    try:
        onecall_url = f"http://api.openweathermap.org/data/2.5/onecall?lat={actual_lat}&lon={actual_lon}&exclude=minutely,hourly,daily,alerts&appid={API_KEY}"
        onecall_resp = requests.get(onecall_url)
        if onecall_resp.status_code == 200:
            onecall_data = onecall_resp.json()
            actual_uvi = onecall_data.get('current', {}).get('uvi')
    except Exception as e:
        print('UV fetch failed:', e)

    # --- DYNAMIC SUNRISE / SUNSET MATH ---
    tz_offset = weather_data["timezone"] # The city's offset from UTC in seconds
    
    # Add the offset to the raw timestamp
    sunrise_ts = weather_data["sys"]["sunrise"] + tz_offset
    sunset_ts = weather_data["sys"]["sunset"] + tz_offset
    
    # Convert to a readable "HH:MM" string
    actual_sunrise = datetime.datetime.fromtimestamp(sunrise_ts, tz=datetime.timezone.utc).strftime('%H:%M')
    actual_sunset = datetime.datetime.fromtimestamp(sunset_ts, tz=datetime.timezone.utc).strftime('%H:%M')

    existing_search = db.query(models.WeatherSearch).filter(
        models.WeatherSearch.location_query.ilike(city)
    ).first()

    if existing_search:
        existing_search.temperature = actual_temp
        existing_search.latitude = actual_lat
        existing_search.longitude = actual_lon
        existing_search.humidity = actual_humidity
        existing_search.precipitation = actual_precip
        existing_search.feels_like = actual_feels_like
        existing_search.wind_speed = actual_wind_speed
        existing_search.wind_direction = actual_wind_dir
        existing_search.condition = actual_condition
        existing_search.aqi = actual_aqi
        existing_search.icon = actual_icon
        existing_search.uv_index = actual_uvi
        existing_search.sunrise = actual_sunrise
        existing_search.sunset = actual_sunset
        existing_search.search_date = datetime.datetime.utcnow()

        db.commit()
        db.refresh(existing_search)
        return existing_search
    
    # --- STEP 4: Save it all to your Supabase Database ---
    new_search = models.WeatherSearch(
        location_query=city.capitalize(), 
        temperature=actual_temp, 
        latitude=actual_lat, 
        longitude=actual_lon,
        humidity=actual_humidity,
        precipitation=actual_precip,
        feels_like=actual_feels_like,
        wind_speed=actual_wind_speed,
        wind_direction=actual_wind_dir,
        condition=actual_condition,
        aqi=actual_aqi,
        uv_index=actual_uvi,
        icon=actual_icon,
        sunrise=actual_sunrise,
        sunset=actual_sunset
    )
    db.add(new_search)
    db.commit()
    db.refresh(new_search)
    
    # --- STEP 5: Send the complete data back to the frontend ---
    return new_search


# --- READ: Get saved searches for a specific user ---
@app.get("/searches/")
def read_searches(user_id: str, db: Session = Depends(database.get_db)):
    # Require user_id from frontend and only return that user's rows
    searches = db.query(models.WeatherSearch).filter(models.WeatherSearch.user_id == user_id).order_by(models.WeatherSearch.id.desc()).all()
    return searches


# --- UPDATE: Modify a specific search by its ID ---
@app.put("/searches/{search_id}")
def update_search(search_id: int, update_data: SearchUpdate, db: Session = Depends(database.get_db)):
    search = db.query(models.WeatherSearch).filter(models.WeatherSearch.id == search_id).first()

    if not search:
        print("DEBUG: The database couldn't find a record with ID:", search_id)
        raise HTTPException(status_code=404, detail="Record not found")

    new_city = update_data.location_query

    # Prefer API keys from environment for security
    API_KEY = os.getenv("OPENWEATHER_API_KEY", "YOUR_OPENWEATHER_API_KEY")
    url = f"http://api.openweathermap.org/data/2.5/weather?q={new_city}&appid={API_KEY}&units=metric"

    response = requests.get(url)

    if response.status_code != 200:
        print("DEBUG: OpenWeather rejected the update. Reason:", response.json())
        raise HTTPException(status_code=404, detail="New city not found by Weather API")

    weather_data = response.json()

    actual_humidity = weather_data["main"]["humidity"]

    # Safely get the rain volume for the last 1 hour (in mm). Default to 0.0 if no rain.
    rain_data = weather_data.get("rain", {})
    actual_precip = rain_data.get("1h", 0.0)

    actual_feels_like = weather_data["main"]["feels_like"]
    actual_wind_speed = round(weather_data["wind"]["speed"] * 3.6, 1)
    actual_wind_dir = get_wind_direction(weather_data["wind"].get("deg", 0))
    actual_condition = weather_data["weather"][0]["main"]

    # --- NEW: FETCH AQI DATA ---
    aqi_url = f"http://api.openweathermap.org/data/2.5/air_pollution?lat={weather_data['coord']['lat']}&lon={weather_data['coord']['lon']}&appid={API_KEY}"
    aqi_response = requests.get(aqi_url)
    actual_aqi = 1 # Default fallback
    if aqi_response.status_code == 200:
        aqi_data = aqi_response.json()
        actual_aqi = aqi_data["list"][0]["main"]["aqi"] # Returns 1 (Good) to 5 (Hazardous)

    actual_icon = weather_data["weather"][0]["icon"]

    # --- DYNAMIC SUNRISE / SUNSET MATH ---
    tz_offset = weather_data["timezone"] # The city's offset from UTC in seconds
    
    # Add the offset to the raw timestamp
    sunrise_ts = weather_data["sys"]["sunrise"] + tz_offset
    sunset_ts = weather_data["sys"]["sunset"] + tz_offset
    
    # Convert to a readable "HH:MM" string
    actual_sunrise = datetime.datetime.fromtimestamp(sunrise_ts, tz=datetime.timezone.utc).strftime('%H:%M')
    actual_sunset = datetime.datetime.fromtimestamp(sunset_ts, tz=datetime.timezone.utc).strftime('%H:%M')

    search.location_query = new_city.capitalize()
    search.temperature = weather_data["main"]["temp"]
    search.latitude = weather_data["coord"]["lat"]
    search.longitude = weather_data["coord"]["lon"]
    search.humidity = actual_humidity
    search.precipitation = actual_precip
    search.feels_like = actual_feels_like
    search.wind_speed = actual_wind_speed
    search.wind_direction = actual_wind_dir
    search.condition = actual_condition
    search.aqi = actual_aqi
    search.uv_index = actual_uvi
    search.icon = actual_icon
    search.sunrise = actual_sunrise
    search.sunset = actual_sunset

    db.commit()
    db.refresh(search)

    return search


# --- DELETE: Remove a search by its ID ---
@app.delete("/searches/{search_id}")
def delete_search(search_id: int, db: Session = Depends(database.get_db)):
    db_search = db.query(models.WeatherSearch).filter(models.WeatherSearch.id == search_id).first()

    if not db_search:
        raise HTTPException(status_code=404, detail="Search record not found")

    db.delete(db_search)
    db.commit()
    return {"message": f"Record {search_id} successfully deleted."}

@app.get("/forecast/{city}")
def get_forecast(city: str, lat: Optional[float] = None, lon: Optional[float] = None):
    API_KEY = os.getenv("OPENWEATHER_API_KEY", "YOUR_OPENWEATHER_API_KEY")
    
    # --- BULLETPROOF ROUTING FOR FORECAST ---
    if lat is not None and lon is not None:
        url = f"http://api.openweathermap.org/data/2.5/forecast?lat={lat}&lon={lon}&appid={API_KEY}&units=metric"
    else:
        url = f"http://api.openweathermap.org/data/2.5/forecast?q={city}&appid={API_KEY}&units=metric"
    
    response = requests.get(url)
    
    if response.status_code != 200:
        print("FORECAST ERROR:", response.json())
        raise HTTPException(status_code=404, detail="Forecast not found")
        
    return response.json()


@app.get("/health")
def health_check(db: Session = Depends(database.get_db)):
    """Simple health endpoint to verify env keys, DB columns, and latest UV sample."""
    info = {
        "openweather_key_present": bool(os.getenv("OPENWEATHER_API_KEY")),
        "google_key_present": bool(os.getenv("GOOGLE_API_KEY")),
        "db": {
            "connected": False,
            "weather_searches_columns": [],
            "last_uv_index": None,
        }
    }
    try:
        info["db"]["connected"] = True
        # list columns for weather_searches using SQLAlchemy inspector (avoid Engine.execute compatibility issues)
        try:
            inspector = inspect(engine)
            cols = [c['name'] for c in inspector.get_columns('weather_searches')]
        except Exception as e:
            print('Inspector failed to list columns:', e)
            cols = []
        info["db"]["weather_searches_columns"] = cols
        # latest uv index sample
        row = db.query(models.WeatherSearch).order_by(desc(models.WeatherSearch.search_date)).first()
        if row:
            info["db"]["last_uv_index"] = row.uv_index
    except Exception as e:
        info["db"]["error"] = str(e)

    return info