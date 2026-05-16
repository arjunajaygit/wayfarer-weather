from sqlalchemy import Column, Integer, String, Float, DateTime
try:
    from .database import Base
except ImportError:
    from database import Base
import datetime

class WeatherSearch(Base):
    __tablename__ = "weather_searches"

    id = Column(Integer, primary_key=True, index=True)
    location_query = Column(String, index=True)
    latitude = Column(Float)
    longitude = Column(Float)
    temperature = Column(Float)
    
    # --- NEW COLUMNS ---
    humidity = Column(Integer, nullable=True)
    wind_speed = Column(Float, nullable=True)
    wind_direction = Column(String, nullable=True)
    feels_like = Column(Float, nullable=True)
    
    condition = Column(String, nullable=True)
    icon = Column(String, nullable=True)
    aqi = Column(Integer, nullable=True)
    precipitation = Column(Float, default=0.0)
    uv_index = Column(Float, nullable=True)
    
    # --- ADD THESE TWO ---
    sunrise = Column(String, nullable=True)
    sunset = Column(String, nullable=True)
    
    search_date = Column(DateTime, default=datetime.datetime.utcnow)