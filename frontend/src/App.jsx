import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { supabase } from './supabaseClient';

const API_URL = 'https://wayfarer-weather.onrender.com';

// --- VISUAL UTILITIES FROM YOUR APP ---
function WeatherIcon({ condition, iconCode, size = 48, animated = false }) {
  const c = (condition || '').toLowerCase();
  const isNight = iconCode?.endsWith('n');
  const isRainy = c.includes('rain') || c.includes('drizzle') || c.includes('shower');
  const isCloudy = c.includes('cloud') || c.includes('overcast');
  const isStormy = c.includes('storm') || c.includes('thunder');

  const animStyle = animated ? { animation: 'floatIcon 3s ease-in-out infinite' } : {};

  if (isNight && !isRainy && !isStormy && !isCloudy) return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" style={animStyle}>
      <path d="M28 10 A14 14 0 1 0 38 34 A12 12 0 0 1 28 10 Z" fill="#fff59d"/>
      <circle cx="16" cy="20" r="1.5" fill="#ffffff" opacity="0.6"/>
      <circle cx="24" cy="12" r="1" fill="#ffffff" opacity="0.4"/>
      <circle cx="30" cy="40" r="1" fill="#ffffff" opacity="0.5"/>
    </svg>
  );

  if (isRainy) return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" style={animStyle}>
      <ellipse cx="28" cy="17" rx="12" ry="9" fill={isNight ? "#455a64" : "#78909c"}/>
      <ellipse cx="18" cy="20" rx="10" ry="8" fill={isNight ? "#546e7a" : "#90a4ae"}/>
      <ellipse cx="24" cy="24" rx="14" ry="7" fill={isNight ? "#78909c" : "#b0bec5"}/>
      <line x1="16" y1="30" x2="13" y2="40" stroke="#4fc3f7" strokeWidth="2" strokeLinecap="round"/>
      <line x1="23" y1="30" x2="20" y2="42" stroke="#4fc3f7" strokeWidth="2" strokeLinecap="round"/>
      <line x1="30" y1="30" x2="27" y2="40" stroke="#4fc3f7" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );

  if (isCloudy) return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" style={animStyle}>
      <ellipse cx="29" cy="20" rx="13" ry="10" fill={isNight ? "#455a64" : "#90a4ae"}/>
      <ellipse cx="17" cy="23" rx="11" ry="9" fill={isNight ? "#546e7a" : "#b0bec5"}/>
      <ellipse cx="24" cy="27" rx="16" ry="8" fill={isNight ? "#78909c" : "#cfd8dc"}/>
    </svg>
  );

  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" style={animStyle}>
      <circle cx="24" cy="24" r="10" fill="#fdd835"/>
      {[0,45,90,135,180,225,270,315].map((deg,i) => (
        <line key={i}
          x1={24+14*Math.cos(deg*Math.PI/180)} y1={24+14*Math.sin(deg*Math.PI/180)}
          x2={24+18*Math.cos(deg*Math.PI/180)} y2={24+18*Math.sin(deg*Math.PI/180)}
          stroke="#f9a825" strokeWidth="2.5" strokeLinecap="round"/>
      ))}
    </svg>
  );
}

function getConditionLabel(weather) {
  if (!weather) return 'Clear'
  const c = (weather.description || weather.condition || '').toLowerCase()
  if (c.includes('rain')) return 'Rainy'
  if (c.includes('cloud')) return 'Cloudy'
  if (c.includes('storm')) return 'Stormy'
  if (c.includes('snow')) return 'Snowy'
  if (c.includes('fog') || c.includes('mist')) return 'Foggy'
  if (c.includes('partly')) return 'Partly Cloudy'
  if (c.includes('wind')) return 'Windy'
  return 'Sunny'
}

function getSkyGradient(condition, iconCode) {
  const c = (condition || '').toLowerCase();
  const isNight = iconCode?.endsWith('n');
  if (isNight) {
    if (c.includes('rain') || c.includes('storm')) return 'linear-gradient(160deg, #101820 0%, #2b3a4a 100%)';
    if (c.includes('cloud')) return 'linear-gradient(160deg, #1c2530 0%, #34495e 100%)';
    return 'linear-gradient(160deg, #091221 0%, #1b2a47 100%)';
  }
  if (c.includes('rain') || c.includes('storm')) return 'linear-gradient(160deg, #546e7a 0%, #78909c 100%)';
  if (c.includes('cloud')) return 'linear-gradient(160deg, #607d8b 0%, #90a4ae 100%)';
  return 'linear-gradient(160deg, #2979c8 0%, #5ba8f5 100%)';
}

function MiniIcon({ condition, iconCode, size = 20 }) {
  const c = (condition || '').toLowerCase();
  const isNight = iconCode?.endsWith('n');
  if (c.includes('rain')) return <span style={{fontSize:size, lineHeight:1}}>🌧</span>
  if (c.includes('storm')) return <span style={{fontSize:size, lineHeight:1}}>⛈</span>
  if (c.includes('snow')) return <span style={{fontSize:size, lineHeight:1}}>❄️</span>
  if (c.includes('cloud')) return <span style={{fontSize:size, lineHeight:1}}>☁️</span>
  if (c.includes('fog') || c.includes('mist')) return <span style={{fontSize:size, lineHeight:1}}>🌫</span>
  if (isNight) return <span style={{fontSize:size, lineHeight:1}}>🌙</span>
  if (c.includes('partly')) return <span style={{fontSize:size, lineHeight:1}}>⛅</span>
  return <span style={{fontSize:size, lineHeight:1}}>☀️</span>
}

// Fixed algorithm handling lat/lon explicitly
function estimateUVIndex(lat, iconCode, condition) {
  if (lat == null) return 0;
  let uv = 10;
  const safeLat = parseFloat(lat) || 0; 
  const latFactor = Math.cos(safeLat * (Math.PI / 180));
  uv = uv * latFactor;
  const c = (condition || '').toLowerCase();
  if (c.includes('cloud')) uv *= 0.5;
  if (c.includes('rain') || c.includes('storm')) uv *= 0.2;
  return Math.max(1, Math.round(uv));
}

function getUVLabel(uv) {
  if (uv <= 2) return { text: 'low', color: '#5ba8f5' };
  if (uv <= 5) return { text: 'medium', color: '#f9a825' };
  if (uv <= 7) return { text: 'high', color: '#e65100' };
  return { text: 'extreme', color: '#d50000' };
}

function getAQILabel(aqi) {
  if ((aqi || 1) === 1) return { text: 'Good', color: '#4caf50' };
  if ((aqi || 1) === 2) return { text: 'Fair', color: '#8bc34a' };
  if ((aqi || 1) === 3) return { text: 'Moderate', color: '#ffeb3b' };
  if ((aqi || 1) === 4) return { text: 'Poor', color: '#ff9800' };
  return { text: 'Very Poor', color: '#f44336' };
}

// Smart Logic: Determine the most critical weather advice based on live data
function generateSmartInsight(weather, uv, rainChance) {
  if (!weather) return "Analyzing atmospheric conditions...";

  const temp = weather.temperature || 0;
  const aqi = weather.aqi || 1;
  const wind = weather.wind_speed || 0;

  // Rule hierarchy: It evaluates the most extreme conditions first
  if (rainChance > 60) return "🌧️ High chance of rain. Don't forget your umbrella and a waterproof jacket if heading out!";
  if (aqi >= 4) return "😷 Air quality is poor today. Sensitive groups should wear a mask and limit heavy outdoor exertion.";
  if (temp > 32 || uv >= 8) return "☀️ Extreme heat and UV levels. Stay hydrated, seek shade, and apply sunscreen!";
  if (temp < 15) return "❄️ Temperatures are quite chilly. Bundle up in warm layers before leaving.";
  if (wind > 25) return "💨 It's notably windy out there! A windbreaker is recommended, and secure loose outdoor items.";
  if (rainChance > 20 && rainChance <= 60) return "🌦️ Slight chance of scattered showers later. Carrying a light rain jacket might be handy.";

  // Default fallback for nice weather
  return "✨ Conditions look highly favorable! It is a great day for standard outdoor activities or travel.";
}

// --- MAIN APPLICATION CORE ---
export default function App() {
  // Auth State
  const [user, setUser] = useState(null);
  const [authMode, setAuthMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // Dashboard Application State
  const [location, setLocation] = useState('')
  const [currentWeather, setCurrentWeather] = useState(null)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')
  const [forecast, setForecast] = useState(null)
  const [suggestions, setSuggestions] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [viewMode, setViewMode] = useState('hourly')
  const [videos, setVideos] = useState([])
  const [chartMetric, setChartMetric] = useState('temp') // 'temp' or 'precip'
  const [aiInsight, setAiInsight] = useState('Waiting for localized atmospheric data...')

  // Watch security validation session
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (user) { fetchHistory(); }
  }, [user]);

  // Query location text recommendations loop
  useEffect(() => {
    const delayDebounceFn = setTimeout(async () => {
      if (location.length > 2) {
        try {
          const res = await axios.get(`${API_URL}/suggestions/${location}`);
          setSuggestions(res.data);
          setShowSuggestions(true);
        } catch {
          console.error("Failed to fetch suggestions");
        }
      } else {
        setSuggestions([]);
        setShowSuggestions(false);
      }
    }, 400);
    return () => clearTimeout(delayDebounceFn);
  }, [location])

  // --- IDENTITY & SECURITY ROUTINES ---
  const handleAuth = async (e) => {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);
    try {
      if (authMode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        if (data?.user) setUser(data.user);
      }
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setCurrentWeather(null);
    setHistory([]);
  };

  // --- METEOROLOGICAL WORKFLOWS ---
  const fetchHistory = async () => {
    try {
      const res = await axios.get(`${API_URL}/searches/?user_id=${user.id}`)
      setHistory(res.data)
    } catch { console.error('Failed to fetch history') }
  }

  const handleSearch = async (searchTarget = location, lat = null, lon = null) => {
    if (!searchTarget) return;
    setLoading(true);
    setError('');
    setShowSuggestions(false);
    try {
      const payload = { location: searchTarget, user_id: user.id };
      if (lat !== null && lon !== null) {
        payload.lat = lat;
        payload.lon = lon;
      }
      const res = await axios.post(`${API_URL}/searches/`, payload);
      setCurrentWeather(res.data);
      const forecastRes = await axios.get(
        `${API_URL}/forecast/${res.data.location_query}?lat=${res.data.latitude}&lon=${res.data.longitude}`
      );
      setForecast(forecastRes.data);
      try {
        const videoRes = await axios.get(`${API_URL}/videos/${res.data.location_query}`);
        setVideos(videoRes.data);
      } catch {
        setVideos([]);
      }

      // --- NEW: Trigger the AI Insight Generator ---
      try {
        setAiInsight('✨ Consulting Gemini AI...');

        // We have to calculate the rain and UV here to send to Python
        const upcomingRain = Math.max(...forecastRes.data.list.slice(0, 8).map(h => Math.round(h.pop * 100)));
        const calculatedUV = estimateUVIndex(res.data.latitude, res.data.icon || '01d', res.data.condition);

        const insightRes = await axios.post(`${API_URL}/api/insight`, {
          location: res.data.location_query,
          temp: res.data.temperature,
          aqi: res.data.aqi || 1,
          wind: res.data.wind_speed || 0,
          rain_chance: upcomingRain,
          uv: calculatedUV
        });

        setAiInsight(insightRes.data.insight);
      } catch (err) {
        console.error("AI Insight failed", err);
        setAiInsight('Could not connect to the AI engine.');
      }
      setLocation('');
      fetchHistory();
    } catch {
      setError('Could not find that location. Try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id) => {
    try {
      await axios.delete(`${API_URL}/searches/${id}`)
      fetchHistory()
    } catch { console.error('Failed to delete') }
  }

  const startEdit = (item) => { setEditingId(item.id); setEditName(item.location_query) }

  const saveEdit = async (id) => {
    try {
      await axios.put(`${API_URL}/searches/${id}`, { location_query: editName })
      setEditingId(null)
      fetchHistory()
    } catch { console.error('Failed to update') }
  }

  // --- VISUAL ARCHITECTURE PROCESSING ---
  const condition = currentWeather?.condition || 'Clear'
  const isNightFallback = new Date().getHours() < 6 || new Date().getHours() >= 18
  const iconCode = currentWeather?.icon || (isNightFallback ? '01n' : '01d')
  const conditionLabel = getConditionLabel(currentWeather)
  const skyGrad = getSkyGradient(condition, iconCode)

  let hourly = [];
  let daily = [];

  if (forecast && forecast.list && forecast.city) {
    const tzOffset = forecast.city.timezone;
    // CHANGED: slice(0, 16) gives us 48 hours of data!
    hourly = forecast.list.slice(0, 16).map((item, index) => {
      const localDate = new Date((item.dt + tzOffset) * 1000);
      const hours = localDate.getUTCHours().toString().padStart(2, '0');
      const minutes = localDate.getUTCMinutes().toString().padStart(2, '0');
      const exactTime = `${hours}:${minutes}`;
      const dayName = localDate.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
      const nowLocal = new Date((Date.now() / 1000 + tzOffset) * 1000);
      const isNextDay = localDate.getUTCDate() !== nowLocal.getUTCDate();
      let timeString = '';
      if (index === 0) timeString = 'Now';
      else if (isNextDay) timeString = `${dayName}\n${exactTime}`;
      else timeString = exactTime;
      return {
        time: timeString,
        temp: Math.round(item.main.temp),
        condition: item.weather[0].main,
        iconCode: item.weather[0].icon,
        pct: Math.round(item.pop * 100)
      };
    });

    const dailyMap = new Map();
    forecast.list.forEach(item => {
      const localDate = new Date((item.dt + tzOffset) * 1000);
      const dateKey = localDate.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
      if (!dailyMap.has(dateKey)) {
        dailyMap.set(dateKey, {
          time: dateKey,
          temp: Math.round(item.main.temp),
          condition: item.weather[0].main,
          iconCode: item.weather[0].icon.replace('n', 'd'),
          pct: Math.round(item.pop * 100)
        });
      } else {
        const existing = dailyMap.get(dateKey);
        existing.temp = Math.max(existing.temp, Math.round(item.main.temp));
        existing.pct = Math.max(existing.pct, Math.round(item.pop * 100));
      }
    });
    daily = Array.from(dailyMap.values()).slice(0, 5);
  }

  const activeData = viewMode === 'hourly' ? hourly : daily;

  let currentRainChance = 0;
  if (hourly.length > 0) {
    currentRainChance = Math.max(...hourly.map(h => h.pct));
  }

  const currentUV = currentWeather ? (currentWeather.uv_index ?? estimateUVIndex(currentWeather.latitude, iconCode, condition)) : 0;
  const uvStatus = getUVLabel(currentUV);
  const uvSource = currentWeather ? (currentWeather.uv_index != null ? 'server' : 'est') : null;
  const sunrise = currentWeather?.sunrise || '--:--'
  const sunset = currentWeather?.sunset || '--:--'

  // ─────────────────────────────────────────────────────────────────────────
  // NEW RESPONSIVE AUTH SCREEN (login / signup)
  // ─────────────────────────────────────────────────────────────────────────
  if (!user) {
    return (
      <>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700;800&display=swap');

          *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

          .ww-auth-root {
            min-height: 100vh;
            width: 100%;
            display: flex;
            font-family: 'Sora', system-ui, sans-serif;
            background: #0b1220;
            overflow-x: hidden;
          }

          /* ── LEFT PANEL ── */
          .ww-left {
            flex: 1.15;
            min-height: 100vh;
            background: linear-gradient(145deg, #0b1220 0%, #112240 55%, #0d3060 100%);
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            padding: 52px 60px;
            position: relative;
            overflow: hidden;
          }
          .ww-left::before {
            content: '';
            position: absolute;
            width: 520px; height: 520px;
            border-radius: 50%;
            background: radial-gradient(circle, rgba(41,121,200,0.22) 0%, transparent 70%);
            top: -120px; left: -100px;
            pointer-events: none;
          }
          .ww-left::after {
            content: '';
            position: absolute;
            width: 380px; height: 380px;
            border-radius: 50%;
            background: radial-gradient(circle, rgba(91,168,245,0.14) 0%, transparent 70%);
            bottom: 60px; right: -60px;
            pointer-events: none;
          }

          .ww-left-inner { position: relative; z-index: 1; }

          .ww-logo-mark {
            display: flex; align-items: center; gap: 10px;
            font-size: 15px; font-weight: 600;
            color: rgba(255,255,255,0.5);
            letter-spacing: 0.3px;
          }
          .ww-logo-dot {
            width: 8px; height: 8px; border-radius: 50%;
            background: #5ba8f5;
            box-shadow: 0 0 10px rgba(91,168,245,0.8);
          }

          .ww-headline {
            font-size: clamp(34px, 4vw, 56px);
            font-weight: 800;
            color: #ffffff;
            line-height: 1.08;
            letter-spacing: -1.5px;
            margin-top: 52px;
            max-width: 480px;
          }
          .ww-headline .hl-accent {
            background: linear-gradient(90deg, #5ba8f5 0%, #a8d8ff 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
          }

          .ww-sub {
            font-size: 15px;
            color: rgba(255,255,255,0.42);
            margin-top: 18px;
            max-width: 360px;
            line-height: 1.75;
            font-weight: 400;
          }

          .ww-pills {
            display: flex; flex-wrap: wrap; gap: 10px;
            margin-top: 38px;
          }
          .ww-pill {
            display: inline-flex; align-items: center; gap: 7px;
            padding: 7px 15px;
            border-radius: 100px;
            background: rgba(91,168,245,0.1);
            border: 1px solid rgba(91,168,245,0.2);
            color: rgba(255,255,255,0.6);
            font-size: 13px; font-weight: 500;
          }
          .ww-pill-dot { width: 5px; height: 5px; border-radius: 50%; background: #5ba8f5; }

          .ww-left-footer {
            position: relative; z-index: 1;
            font-size: 12px;
            color: rgba(255,255,255,0.18);
          }

          /* ── RIGHT PANEL ── */
          .ww-right {
            width: min(520px, 100%);
            min-height: 100vh;
            background: #ffffff;
            display: flex;
            flex-direction: column;
            justify-content: center;
            padding: 64px 56px;
            position: relative;
            flex-shrink: 0;
          }
          /* Blue accent bar at top */
          .ww-right::before {
            content: '';
            position: absolute;
            top: 0; left: 0; right: 0;
            height: 4px;
            background: linear-gradient(90deg, #2979c8, #5ba8f5, #a8d8ff);
          }

          .ww-eyebrow {
            font-size: 11px; font-weight: 700;
            letter-spacing: 1.6px; text-transform: uppercase;
            color: #5ba8f5;
            margin-bottom: 12px;
          }
          .ww-form-title {
            font-size: clamp(24px, 2.8vw, 34px);
            font-weight: 800;
            color: #0b1220;
            letter-spacing: -0.7px;
            line-height: 1.15;
          }
          .ww-form-desc {
            font-size: 14px;
            color: #7a90a8;
            margin-top: 8px;
            margin-bottom: 34px;
            font-weight: 400;
            line-height: 1.6;
          }

          .ww-field { margin-bottom: 18px; }
          .ww-label {
            display: block;
            font-size: 13px; font-weight: 600;
            color: #0b1220;
            margin-bottom: 8px;
          }
          .ww-input-wrap { position: relative; }
          .ww-input-icon {
            position: absolute;
            left: 15px; top: 50%;
            transform: translateY(-50%);
            font-size: 15px;
            pointer-events: none;
            opacity: 0.4;
          }
          .ww-input {
            width: 100%;
            padding: 13px 16px 13px 42px;
            border: 1.5px solid #e2eaf3;
            border-radius: 13px;
            font-size: 15px;
            font-family: 'Sora', system-ui, sans-serif;
            outline: none;
            color: #0b1220;
            background: #f7faff;
            transition: border-color 0.2s, box-shadow 0.2s, background 0.2s;
            -webkit-appearance: none;
            appearance: none;
          }
          .ww-input:focus {
            border-color: #2979c8;
            box-shadow: 0 0 0 4px rgba(41,121,200,0.1);
            background: #ffffff;
          }
          .ww-input::placeholder { color: #b8cad8; }

          .ww-forgot {
            display: block; text-align: right;
            font-size: 12px; color: #5ba8f5; font-weight: 500;
            text-decoration: none; margin-top: 7px;
            transition: color 0.15s;
          }
          .ww-forgot:hover { color: #2979c8; }

          .ww-error {
            display: flex; align-items: flex-start; gap: 8px;
            background: #fff5f5; border: 1px solid #fecaca;
            border-radius: 10px; padding: 11px 14px;
            font-size: 13px; color: #c0392b;
            margin-bottom: 16px; line-height: 1.5;
          }

          .ww-btn {
            width: 100%; padding: 15px;
            background: #0b1220;
            border: none; border-radius: 13px;
            color: #ffffff;
            font-size: 15px; font-weight: 700;
            font-family: 'Sora', system-ui, sans-serif;
            cursor: pointer; letter-spacing: 0.1px;
            transition: background 0.2s, transform 0.1s, box-shadow 0.2s;
            display: flex; align-items: center; justify-content: center; gap: 8px;
            margin-top: 4px;
            -webkit-appearance: none;
          }
          .ww-btn:hover { background: #182840; box-shadow: 0 8px 24px rgba(11,18,32,0.18); }
          .ww-btn:active { transform: scale(0.985); }
          .ww-btn:disabled { background: #a0b4c8; cursor: not-allowed; box-shadow: none; }

          @keyframes ww-spin { to { transform: rotate(360deg); } }
          .ww-spin {
            width: 16px; height: 16px;
            border: 2px solid rgba(255,255,255,0.3);
            border-top-color: #fff;
            border-radius: 50%;
            animation: ww-spin 0.65s linear infinite;
          }

          .ww-divider {
            display: flex; align-items: center; gap: 14px;
            margin: 26px 0 0;
          }
          .ww-divider::before, .ww-divider::after { content: ''; flex: 1; height: 1px; background: #edf2f7; }
          .ww-divider span { font-size: 12px; color: #c0cdd8; white-space: nowrap; }

          .ww-switch-row {
            text-align: center; font-size: 14px;
            color: #7a90a8; margin-top: 22px; font-weight: 400;
          }
          .ww-switch-btn {
            background: none; border: none;
            color: #2979c8; font-weight: 700;
            cursor: pointer;
            font-family: 'Sora', system-ui, sans-serif;
            font-size: 14px; padding: 0;
            transition: color 0.15s;
          }
          .ww-switch-btn:hover { color: #0b1220; }

          .ww-form-footer {
            position: absolute;
            bottom: 24px; left: 56px; right: 56px;
            display: flex; justify-content: space-between; align-items: center;
            font-size: 12px; color: #c0cdd8;
          }

          /* ─── RESPONSIVE ─── */
          @media (max-width: 1024px) and (min-width: 641px) {
            .ww-left { padding: 44px; flex: 1; }
            .ww-right { width: min(440px, 100%); padding: 52px 44px; }
            .ww-headline { margin-top: 36px; }
          }
          @media (max-width: 640px) {
            .ww-auth-root { flex-direction: column; min-height: 100vh; }
            .ww-left {
              min-height: auto;
              padding: 36px 24px 44px;
              flex: none;
            }
            .ww-left::before { width: 280px; height: 280px; top: -80px; left: -60px; }
            .ww-left::after { display: none; }
            .ww-headline { font-size: 30px; margin-top: 28px; letter-spacing: -0.8px; }
            .ww-sub { font-size: 14px; margin-top: 12px; }
            .ww-pills { margin-top: 22px; gap: 8px; }
            .ww-pill { font-size: 12px; padding: 6px 12px; }
            .ww-left-footer { display: none; }
            .ww-right {
              width: 100%;
              min-height: auto;
              flex: 1;
              padding: 36px 24px 72px;
              border-radius: 28px 28px 0 0;
              margin-top: -24px;
              overflow: hidden; /* <-- This forces the 4px bar to stay perfectly inside the curve */
            }
            .ww-form-title { font-size: 26px; }
            .ww-form-footer { left: 24px; right: 24px; }
          }
          @media (max-width: 380px) {
            .ww-left { padding: 28px 18px 36px; }
            .ww-right { padding: 28px 18px 64px; }
            .ww-headline { font-size: 26px; }
          }
        `}</style>

        <div className="ww-auth-root">
          <div className="ww-left">
            <div className="ww-left-inner">
              <div className="ww-logo-mark">
                <div className="ww-logo-dot" />
                Wayfarer Weather
              </div>
              <h1 className="ww-headline">
                Your travel<br/>
                <span className="hl-accent">weather</span><br/>
                companion.
              </h1>
              <p className="ww-sub">
                Real-time forecasts, air quality, UV index and city exploration — all in one beautiful dashboard.
              </p>
              <div className="ww-pills">
                {[
                  ['🌡', 'Live weather'],
                  ['📅', '5-day forecast'],
                  ['🌬', 'Wind & AQI'],
                  ['📍', 'Any city'],
                  ['🎥', 'City explorer'],
                ].map(([icon, label]) => (
                  <span className="ww-pill" key={label}>
                    {icon}
                    <span className="ww-pill-dot" />
                    {label}
                  </span>
                ))}
              </div>
            </div>
            <div className="ww-left-footer">© 2026 Wayfarer Weather Inc.</div>
          </div>
          <div className="ww-right">
            <p className="ww-eyebrow">
              {authMode === 'login' ? '— Welcome back' : '— Get started'}
            </p>
            <h2 className="ww-form-title">
              {authMode === 'login' ? 'Sign in to your account' : 'Create your free account'}
            </h2>
            <p className="ww-form-desc">
              {authMode === 'login'
                ? 'Enter your credentials to continue to your dashboard.'
                : 'Start tracking weather for any city worldwide.'}
            </p>
            <form onSubmit={handleAuth} noValidate>
              <div className="ww-field">
                <label className="ww-label" htmlFor="ww-email">Email address</label>
                <div className="ww-input-wrap">
                  <span className="ww-input-icon">✉️</span>
                  <input
                    id="ww-email"
                    type="email"
                    className="ww-input"
                    placeholder="you@example.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                  />
                </div>
              </div>
              <div className="ww-field">
                <label className="ww-label" htmlFor="ww-password">Password</label>
                <div className="ww-input-wrap">
                  <span className="ww-input-icon">🔒</span>
                  <input
                    id="ww-password"
                    type="password"
                    className="ww-input"
                    placeholder="••••••••"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    autoComplete={authMode === 'login' ? 'current-password' : 'new-password'}
                  />
                </div>
                {authMode === 'login' && (
                  <a href="#forgot" className="ww-forgot">Forgot password?</a>
                )}
              </div>
              {authError && (
                <div className="ww-error">
                  <span>⚠️</span>
                  <span>{authError}</span>
                </div>
              )}
              <button type="submit" className="ww-btn" disabled={authLoading}>
                {authLoading
                  ? <><div className="ww-spin" /> Please wait…</>
                  : authMode === 'login' ? 'Sign in →' : 'Create account →'
                }
              </button>
            </form>
            <div className="ww-divider"><span>or</span></div>
            <div className="ww-switch-row">
              {authMode === 'login' ? "Don't have an account? " : 'Already have an account? '}
              <button
                className="ww-switch-btn"
                onClick={() => { setAuthMode(authMode === 'login' ? 'signup' : 'login'); setAuthError(''); }}
              >
                {authMode === 'login' ? 'Sign up free' : 'Sign in'}
              </button>
            </div>
            <div className="ww-form-footer">
              <span>🧭 Wayfarer Weather</span>
              <span>© 2026</span>
            </div>
          </div>
        </div>
      </>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // YOUR ORIGINAL DASHBOARD — 100% UNCHANGED
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Mono&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'DM Sans', system-ui, sans-serif; }
        :root { --blue: #2979c8; --sky: #5ba8f5; --panel: #f0f6ff; --white: #ffffff; --text: #1a2a3a; --muted: #7a90a8; --border: #d4e4f7; --card: #ffffff; }
        .app-shell {
          width: 100%; height: 100vh; overflow: hidden; background: #e8f1fb;
          display: flex; align-items: stretch; padding: 24px; gap: 20px;
        }
        .left-panel {
          width: 280px; flex-shrink: 0; border-radius: 28px; display: flex; flex-direction: column;
          padding: 28px 24px; position: relative; overflow: hidden; color: #fff; transition: background 0.8s ease;
        }
        .left-panel::before { content: ''; position: absolute; bottom: 0; left: 0; right: 0; height: 200px; background: rgba(0,0,0,0.08); border-radius: 28px; pointer-events: none; }
        .panel-top-bar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 28px; }
        .add-btn { width: 36px; height: 36px; border-radius: 12px; background: rgba(255,255,255,0.22); border: none; color: white; font-size: 22px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: background 0.2s; }
        .add-btn:hover { background: rgba(255,255,255,0.32); }
        .loc-row { display: flex; align-items: flex-start; gap: 6px; margin-bottom: 4px; }
        .loc-name { font-size: 15px; font-weight: 600; }
        .loc-date { font-size: 12px; color: rgba(255,255,255,0.75); }
        .sun-times { margin-top: 4px; font-size: 11px; color: rgba(255,255,255,0.75); display: flex; gap: 12px; }
        .big-temp { font-size: 72px; font-weight: 300; line-height: 1; margin: auto 0; letter-spacing: -2px; }
        .condition-row { display: flex; align-items: center; gap: 10px; font-size: 18px; font-weight: 400; margin-top: 10px; }
        .right-panel { flex: 1; display: flex; flex-direction: column; gap: 20px; min-width: 0; overflow-y: auto; padding-right: 12px; padding-bottom: 24px; }
        .right-panel::-webkit-scrollbar { width: 6px; }
        .right-panel::-webkit-scrollbar-track { background: transparent; }
        .right-panel::-webkit-scrollbar-thumb { background: #d4e4f7; border-radius: 10px; }
        .right-panel::-webkit-scrollbar-thumb:hover { background: #a0b4c8; }
        .welcome-row { display: flex; align-items: center; justify-content: space-between; }
        .welcome-title { font-size: 22px; font-weight: 600; color: #1a2a3a; }
        .welcome-sub { font-size: 14px; color: var(--muted); margin-top: 2px; }
        .search-bar { display: flex; background: white; border-radius: 16px; padding: 8px 8px 8px 16px; gap: 8px; align-items: center; box-shadow: 0 2px 12px rgba(41,121,200,0.08); }
        .search-input { flex: 1; border: none; outline: none; font-size: 14px; font-family: inherit; color: #1a2a3a; background: transparent; }
        .search-input::placeholder { color: #a0b4c8; }
        .search-btn { background: var(--blue); color: white; border: none; border-radius: 10px; padding: 8px 18px; font-size: 13px; font-weight: 500; cursor: pointer; font-family: inherit; display: flex; align-items: center; gap: 6px; transition: background 0.2s; }
        .search-btn:hover { background: #1e65b0; }
        .search-btn:disabled { background: #90bce0; cursor: not-allowed; }
        .hourly-card { background: white; border-radius: 20px; padding: 20px 22px; box-shadow: 0 2px 12px rgba(41,121,200,0.06); }
        .card-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
        .card-title { font-size: 15px; font-weight: 600; color: #1a2a3a; }
        .hourly-row { display: flex; gap: 0; overflow-x: auto; padding-bottom: 4px; }
        .hourly-row::-webkit-scrollbar { height: 3px; }
        .hourly-row::-webkit-scrollbar-thumb { background: #d4e4f7; border-radius: 3px; }
        .hour-col { flex: 1; min-width: 64px; display: flex; flex-direction: column; align-items: center; gap: 4px; font-size: 12px; color: var(--muted); position: relative; }
        .hour-time { font-size: 11px; color: var(--muted); }
        .hour-temp { font-size: 13px; font-weight: 600; color: #1a2a3a; }
        .precip-bar-wrap { width: 100%; display: flex; flex-direction: column; align-items: center; gap: 4px; margin-top: 4px; }
        .area-chart { width: 100%; height: 56px; margin: 0 -2px; }
        .details-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; }
        .detail-card { background: white; border-radius: 18px; padding: 16px 18px; box-shadow: 0 2px 10px rgba(41,121,200,0.06); }
        .detail-label { font-size: 13px; color: var(--muted); margin-bottom: 6px; display: flex; align-items: center; justify-content: space-between; }
        .detail-icon { width: 28px; height: 28px; border-radius: 8px; background: #e8f1fb; display: flex; align-items: center; justify-content: center; font-size: 14px; }
        .detail-val { font-size: 22px; font-weight: 600; color: #1a2a3a; }
        .detail-sub { font-size: 11px; color: var(--muted); margin-top: 2px; }
        .detail-bar-row { display: flex; gap: 6px; margin-top: 10px; align-items: center; }
        .bar-seg { height: 4px; border-radius: 2px; flex: 1; }
        .bar-label { font-size: 10px; color: var(--muted); }
        .history-card { background: white; border-radius: 20px; padding: 18px 20px; box-shadow: 0 2px 12px rgba(41,121,200,0.06); }
        .history-item { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; border-radius: 12px; transition: background 0.15s; cursor: pointer; }
        .history-item:hover { background: #f0f6ff; }
        .history-loc { font-size: 13px; font-weight: 600; color: #1a2a3a; }
        .history-meta { font-size: 11px; color: var(--muted); }
        .history-actions { display: flex; gap: 4px; opacity: 0; transition: opacity 0.15s; }
        .history-item:hover .history-actions { opacity: 1; }
        .icon-btn { width: 28px; height: 28px; border-radius: 8px; border: none; background: transparent; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 13px; transition: background 0.15s; }
        .icon-btn:hover { background: #e8f1fb; }
        .icon-btn.red:hover { background: #ffeaea; }
        .edit-input { border: 1.5px solid #5ba8f5; border-radius: 8px; padding: 4px 8px; font-size: 13px; font-family: inherit; outline: none; color: #1a2a3a; flex: 1; }
        .empty-state { text-align: center; padding: 28px 0; color: var(--muted); font-size: 13px; }
        .badge-btn { background: #f0f6ff; border: none; border-radius: 10px; padding: 5px 12px; font-size: 12px; color: var(--blue); font-weight: 500; cursor: pointer; font-family: inherit; display: flex; align-items: center; gap: 4px; }
        .badge-btn:hover { background: #deeaf9; }
        @keyframes floatIcon { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-6px); } }
        .fade-in { animation: fadeIn 0.4s ease forwards; }
        
        /* New class for the map/video section so it can respond to screen size */
        .media-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 10px; }

        /* TABLET VIEW */
        @media (max-width: 900px) {
          .app-shell { flex-direction: column; padding: 16px; height: auto; overflow: visible; }
          .left-panel { width: 100%; min-height: auto; flex-direction: row; justify-content: space-between; align-items: center; padding: 24px; gap: 20px; }
          .panel-top-bar { margin-bottom: 0; }
          .right-panel { overflow-y: visible; padding-right: 0; }
          .media-grid { grid-template-columns: 1fr; } /* Stack Map and Video on tablet */
        }

        /* MOBILE VIEW */
        @media (max-width: 600px) {
          .app-shell { padding: 12px; background: #e8f1fb; }
          
          /* Transform Left Panel into a cohesive top banner */
          .left-panel { flex-direction: column; text-align: center; border-radius: 24px; padding: 20px 16px; gap: 12px; }
          .panel-top-bar { width: 100%; }
          .loc-row { align-items: center; flex-direction: column; width: 100%; margin-bottom: 8px; }
          .sun-times { justify-content: center; width: 100%; }
          .big-temp { font-size: 64px; margin: 10px 0; }
          
          /* Search Bar Adapts */
          .search-bar { flex-wrap: wrap; padding: 8px 12px; border-radius: 12px; }
          .search-input { width: 100%; font-size: 16px; /* 16px prevents iOS auto-zoom */ }
          .search-btn { width: 100%; justify-content: center; margin-top: 4px; padding: 12px; }

          /* Unified Grid shrinks padding to fit nicely */
          .details-grid { grid-template-columns: repeat(2, 1fr); gap: 10px; }
          .detail-card { padding: 14px 12px; border-radius: 16px; }
          .detail-val { font-size: 18px; }
          .detail-icon { width: 24px; height: 24px; font-size: 12px; }
          
          /* Make AI card span full width on tiny screens */
          .detail-card:last-child { grid-column: span 2; }
          
          /* Timeline fixes */
          .hourly-card { padding: 16px 14px; border-radius: 16px; }
          .card-header { flex-direction: column; align-items: flex-start; gap: 12px; }
          .card-header > div { width: 100%; display: flex; justify-content: space-between; }
        }
      `}</style>

      <div className="app-shell">
        {/* LEFT PANEL */}
        <div className="left-panel" style={{ background: skyGrad }}>
          <div className="panel-top-bar">
            <button onClick={handleLogout} className="badge-btn" style={{background:'rgba(255,255,255,0.2)', color:'white'}}>🚪 Logout</button>
          </div>

          <div className="loc-row">
            <span style={{ fontSize: 14, marginTop: 1 }}>📍</span>
            <div>
              <div className="loc-name">{currentWeather?.location_query || 'Search a city'}</div>
              <div className="loc-date">{new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</div>
              <div className="sun-times">
                <span>🌅 {sunrise}</span>
                <span>🌇 {sunset}</span>
              </div>
            </div>
          </div>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 10, padding: '24px 0' }}>
            <div style={{ animation: currentWeather ? 'floatIcon 3s ease-in-out infinite' : 'none' }}>
              <WeatherIcon condition={condition} iconCode={iconCode} size={90} />
            </div>
            <div className="big-temp">
              {currentWeather ? `${currentWeather.temperature}°` : '—°'}
            </div>
            <div className="condition-row">
              <WeatherIcon condition={condition} size={20} />
              <span style={{ fontSize: 16 }}>{conditionLabel}</span>
            </div>
          </div>

          <svg viewBox="0 0 240 80" width="100%" style={{ marginBottom: -28, marginLeft: -24, marginRight: -24, width: 'calc(100% + 48px)', opacity: 0.18 }}>
            <rect x="10" y="30" width="20" height="50" fill="white"/><rect x="14" y="20" width="12" height="12" fill="white"/><rect x="35" y="40" width="25" height="40" fill="white"/><rect x="65" y="20" width="18" height="60" fill="white"/><rect x="68" y="10" width="6" height="12" fill="white"/><rect x="88" y="35" width="22" height="45" fill="white"/><rect x="115" y="25" width="30" height="55" fill="white"/><rect x="150" y="38" width="20" height="42" fill="white"/><rect x="175" y="28" width="16" height="52" fill="white"/><rect x="195" y="42" width="28" height="38" fill="white"/>
          </svg>
        </div>

        {/* RIGHT PANEL */}
        <div className="right-panel">
          <div className="welcome-row">
            <div>
              <div className="welcome-title">
                {currentWeather ? `Weather for ${currentWeather.location_query}` : "Wayfarer Travel Dashboard"}
              </div>
              <div className="welcome-sub">Logged in securely as {user.email}</div>
            </div>
          </div>

          {/* Search Engine */}
          <div style={{ position: 'relative', zIndex: 50 }}>
            <div className="search-bar">
              <span style={{ fontSize: 16, color: '#a0b4c8' }}>🔍</span>
              <input
                className="search-input"
                placeholder="Search a new location..."
                value={location}
                onChange={e => setLocation(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch(location)}
              />
              <button className="search-btn" onClick={() => handleSearch(location)} disabled={loading}>
                {loading ? '...' : 'Search'}
              </button>
            </div>

            {showSuggestions && suggestions.length > 0 && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '8px',
                background: 'white', borderRadius: '16px', padding: '8px 0',
                boxShadow: '0 4px 20px rgba(41,121,200,0.15)', border: '1px solid #e8f1fb'
              }}>
                {suggestions.map((item, index) => (
                  <div
                    key={index}
                    onClick={() => { setLocation(item.name); handleSearch(item.name, item.lat, item.lon); }}
                    style={{ padding: '10px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', transition: 'background 0.2s', borderBottom: index !== suggestions.length - 1 ? '1px solid #f0f6ff' : 'none' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f0f6ff'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <span style={{ fontSize: '16px' }}>📍</span>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: '500', color: '#1a2a3a' }}>{item.name}</div>
                      <div style={{ fontSize: '11px', color: '#7a90a8' }}>{item.state ? `${item.state}, ` : ''}{item.country}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          {error && <p style={{ color: '#e24b4a', fontSize: 13, textAlign: 'center', marginTop: -8 }}>{error}</p>}

          {/* Timeline Trend Line & Dynamic Precipitation Overview */}
          {currentWeather && (
            <div className="hourly-card fade-in">
              <div className="card-header">
                <span className="card-title">{viewMode === 'hourly' ? 'Upcoming hours' : 'Next 5 days'}</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  
                  {/* DYNAMIC METRIC TOGGLE BUTTON */}
                  <button 
                    className="badge-btn" 
                    onClick={() => setChartMetric(chartMetric === 'temp' ? 'precip' : 'temp')}
                    style={chartMetric === 'precip' ? { background: '#5ba8f5', color: '#ffffff' } : {}}
                  >
                    {chartMetric === 'temp' ? '🌧 Show Precipitation' : '🌡 Show Temperature'}
                  </button>
                  
                  <button className="badge-btn" onClick={() => setViewMode(viewMode === 'hourly' ? 'daily' : 'hourly')}>
                    {viewMode === 'hourly' ? 'Next days ›' : '‹ Upcoming hours'}
                  </button>
                </div>
              </div>

              {/* THE NEW SCROLL WRAPPER */}
              <div style={{ overflowX: 'auto', paddingBottom: '12px' }}>
                <div style={{ width: `${activeData.length * 64}px`, minWidth: '100%' }}>
                  
                  {/* The Text Columns */}
                  <div className="hourly-row" style={{ overflowX: 'visible', paddingBottom: 0 }}>
                    {activeData.map((h, i) => (
                      <div className="hour-col" key={i}>
                        <div className="hour-time" style={{ whiteSpace: 'pre-line', textAlign: 'center' }}>{h.time}</div>
                        <MiniIcon condition={h.condition} iconCode={h.iconCode} size={18} />
                        <div className="hour-temp">{h.temp}°</div>
                        <div className="precip-bar-wrap">
                          <div style={{ fontSize: 10, color: '#a0b4c8', fontWeight: h.pct > 0 ? 600 : 400 }}>{h.pct}%</div>
                          <div style={{ width: '24px', height: '4px', background: '#e8f1fb', borderRadius: '2px', overflow: 'hidden', marginTop: '2px' }}>
                            <div style={{ width: `${h.pct}%`, height: '100%', background: '#5ba8f5', transition: 'width 0.3s ease' }} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* The Graph */}
                  <svg className="area-chart" viewBox={`0 0 ${activeData.length * 64} 56`} preserveAspectRatio="none">
                {(() => {
                  if (!activeData.length) return null;
                  
                  // RENDERING LOGIC: TEMPERATURE CURVE
                  if (chartMetric === 'temp') {
                    const temps = activeData.map(h => h.temp);
                    const min = Math.min(...temps) - 1;
                    const max = Math.max(...temps) + 1;
                    const pts = activeData.map((h, i) => {
                      const x = i * 64 + 32;
                      const y = 48 - ((h.temp - min) / (max - min)) * 40;
                      return `${x},${y}`;
                    });
                    const w = activeData.length * 64;
                    return (
                      <>
                        <defs>
                          <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#5ba8f5" stopOpacity="0.35"/>
                            <stop offset="100%" stopColor="#5ba8f5" stopOpacity="0.04"/>
                          </linearGradient>
                        </defs>
                        <path d={`M${pts[0]} ${pts.slice(1).map(p=>'L'+p).join(' ')} L${w-32},56 L32,56 Z`} fill="url(#areaGrad)" />
                        <polyline points={pts.join(' ')} fill="none" stroke="#5ba8f5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        {pts.map((p, i) => {
                          const [x, y] = p.split(',');
                          return <circle key={i} cx={x} cy={y} r="3" fill="white" stroke="#5ba8f5" strokeWidth="1.5"/>
                        })}
                      </>
                    );
                  } 
                  
                  // RENDERING LOGIC: PRECIPITATION BAR CHART
                  else {
                    return (
                      <>
                        {activeData.map((h, i) => {
                          // Math to scale the bar correctly inside the SVG
                          const barHeight = Math.max((h.pct / 100) * 44, 2); // 44px max height, 2px min height
                          const x = i * 64 + 22; // Centers the 20px wide bar under the 64px column
                          const y = 52 - barHeight; 
                          
                          return (
                            <g key={i}>
                              <rect 
                                x={x} y={y} 
                                width="20" height={barHeight} 
                                fill="#5ba8f5" rx="4" 
                                opacity={h.pct > 0 ? 0.85 : 0.15} 
                                style={{ transition: 'all 0.4s ease' }}
                              />
                            </g>
                          );
                        })}
                      </>
                    );
                  }
                })()}
              </svg>
                </div>
              </div>
            </div>
          )}

          {/* Unified Analytics Cards Grid */}
          {currentWeather && (
            <div className="details-grid fade-in">
              <div className="detail-card">
                <div className="detail-label">Humidity<div className="detail-icon">💧</div></div>
                <div className="detail-val">{currentWeather.humidity ?? 72}% <span style={{fontSize:13,fontWeight:400,color:'#e24b4a'}}>bad</span></div>
                <div className="detail-bar-row">
                  {[['good','#5ba8f5',40],['normal','#b0d4f4',30],['bad','#e8f1fb',30]].map(([l,c,w]) => (
                    <div key={l} style={{display:'flex',flexDirection:'column',alignItems:'center',gap:3,flex:w}}>
                      <div className="bar-seg" style={{background:c}}/><span className="bar-label">{l}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="detail-card">
                <div className="detail-label">Wind<div className="detail-icon">💨</div></div>
                <div style={{display:'flex',alignItems:'center',gap:10,marginTop:4}}>
                  <svg width="48" height="48" viewBox="0 0 48 48">
                    <circle cx="24" cy="24" r="20" stroke="#e8f1fb" strokeWidth="4" fill="none"/>
                    <circle cx="24" cy="24" r="20" stroke="#5ba8f5" strokeWidth="4" fill="none" strokeDasharray="30 96" strokeLinecap="round" transform="rotate(-90 24 24)"/>
                    <line x1="24" y1="24" x2="24" y2="10" stroke="#2979c8" strokeWidth="2" strokeLinecap="round"/>
                    <line x1="24" y1="24" x2="34" y2="30" stroke="#90bce0" strokeWidth="2" strokeLinecap="round"/>
                    <circle cx="24" cy="24" r="3" fill="#2979c8"/>
                  </svg>
                  <div>
                    <div className="detail-val">{currentWeather.wind_speed ?? 8} km/h</div>
                    <div className="detail-sub">{currentWeather.wind_direction ?? 'NE'}</div>
                  </div>
                </div>
              </div>

              <div className="detail-card">
                <div className="detail-label">UV Index<div className="detail-icon">☀️</div></div>
                <div className="detail-val">{currentUV} <span style={{fontSize:13, fontWeight:400, color: uvStatus.color}}>{uvStatus.text}</span>{uvSource === 'est' && <span style={{fontSize:12, color:'#7a90a8', marginLeft:8}}>(est.)</span>}</div>
                <div style={{display:'flex',gap:4,marginTop:8,alignItems:'center'}}>
                  {[['0–2','#5ba8f5'],['3–5','#2979c8'],['6–7','#e8f1fb'],['8–10','#e8f1fb'],['11+','#e8f1fb']].map(([l,c])=>(
                    <div key={l} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:3}}>
                      <div style={{height:4,width:'100%',background:c,borderRadius:2}}/><span style={{fontSize:9,color:'#a0b4c8'}}>{l}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="detail-card">
                <div className="detail-label">Feels like<div className="detail-icon">🌡</div></div>
                <div className="detail-val">{currentWeather.feels_like ?? Math.round((currentWeather.temperature || 0) + 2)}°</div>
                <div style={{marginTop:10}}>
                  <div style={{height:4,borderRadius:2,background:'#e8f1fb',position:'relative'}}>
                    <div style={{ position:'absolute',top:0,left:0,height:'100%', width: `${Math.min(100,Math.max(0,((currentWeather.feels_like ?? currentWeather.temperature+2)/50)*100))}%`, background:'#5ba8f5',borderRadius:2 }}/>
                  </div>
                  <div style={{display:'flex',justifyContent:'space-between',fontSize:10,color:'#a0b4c8',marginTop:4}}><span>0°</span><span>25°</span><span>50°</span></div>
                </div>
              </div>

              <div className="detail-card">
                <div className="detail-label">Chance of rain<div className="detail-icon">☔</div></div>
                <div className="detail-val">{currentRainChance}%</div>
                <div style={{marginTop:10}}>
                  <div style={{height:4,borderRadius:2,background:'#e8f1fb',position:'relative'}}>
                    <div style={{ position:'absolute',top:0,left:0,height:'100%', width:`${currentRainChance}%`, background:'#5ba8f5',borderRadius:2 }}/>
                  </div>
                  <div style={{display:'flex',justifyContent:'space-between',fontSize:10,color:'#a0b4c8',marginTop:4}}><span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span></div>
                </div>
              </div>

              {/* --- NEW CARD 6: AI Weather Insight --- */}
              <div className="detail-card" style={{ background: 'linear-gradient(135deg, #f8fbff 0%, #ffffff 100%)', border: '1px solid #d4e4f7', display: 'flex', flexDirection: 'column' }}>
                <div className="detail-label">
                  Wayfarer AI Insight
                  <div className="detail-icon" style={{ background: 'linear-gradient(135deg, #5ba8f5 0%, #2979c8 100%)', color: 'white' }}>✨</div>
                </div>
                
                {/* Replaced the old function with the live state */}
                <div style={{ marginTop: '14px', fontSize: '14.5px', lineHeight: '1.5', color: '#1a2a3a', fontWeight: '500', flex: 1 }}>
                  {aiInsight}
                </div>
                
                <div style={{ marginTop: '16px', fontSize: '11px', color: '#7a90a8', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: '#4caf50', boxShadow: '0 0 6px rgba(76, 175, 80, 0.5)' }}></span>
                  Powered by Google Gemini
                </div>
              </div>

            </div>
          )}

          {/* Multi-Resource Geo and Media Platform Embed Layout */}
          {currentWeather && (
            <div className="media-grid">
              <div className="detail-card" style={{ padding: 0, overflow: 'hidden', height: '100%', minHeight: '320px' }}>
                <iframe width="100%" height="100%" frameBorder="0" style={{ border: 0, display: 'block' }} src={`https://maps.google.com/maps?q=${currentWeather.latitude},${currentWeather.longitude}&z=12&output=embed`} allowFullScreen></iframe>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div className="detail-card">
                  <div className="detail-label">Air Quality Index (AQI)<div className="detail-icon">🍃</div></div>
                  <div className="detail-val">Level {currentWeather.aqi || 1} <span style={{fontSize:14, fontWeight:500, color: getAQILabel(currentWeather.aqi).color, marginLeft: '8px'}}>({getAQILabel(currentWeather.aqi).text})</span></div>
                  <div style={{display:'flex', gap:3, marginTop:12}}>
                    {['#4caf50', '#8bc34a', '#ffeb3b', '#ff9800', '#f44336'].map((color, idx) => (
                      <div key={color} style={{flex:1, height:6, borderRadius:3, background: color, opacity: (currentWeather.aqi || 1) === idx + 1 ? 1 : 0.2}} />
                    ))}
                  </div>
                </div>

                <div className="detail-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div className="detail-label">Explore {currentWeather.location_query}<div className="detail-icon">🎥</div></div>
                  {videos.length > 0 ? (
                    <div style={{ display: 'flex', gap: '12px', height: '100%', minHeight: '140px' }}>
                      {videos.map((vid, index) => (
                        <div key={index} style={{ flex: 1, borderRadius: '12px', overflow: 'hidden', background: '#e8f1fb' }}>
                          <iframe width="100%" height="100%" src={`https://www.youtube.com/embed/${vid.id}`} title={vid.title} frameBorder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen style={{ display: 'block' }}></iframe>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#a0b4c8', fontSize: '13px' }}>Loading exploration feeds...</div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Account Explicit Search History Panel */}
          <div className="history-card">
            <div className="card-header">
              <span className="card-title">🕐 Personal History Vault</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <button onClick={() => window.open(`${API_URL}/export/csv?user_id=${user.id}`, '_blank')} className="badge-btn" style={{ background: '#4caf50', color: '#ffffff' }} onMouseEnter={e => e.currentTarget.style.background = '#43a047'} onMouseLeave={e => e.currentTarget.style.background = '#4caf50'}>📥 Export CSV</button>
                <span style={{fontSize:12, color:'var(--muted)'}}>{history.length} saved</span>
              </div>
            </div>
            {history.length === 0 ? (
              <div className="empty-state">Your history is clear. Run a search to store metrics safely!</div>
            ) : (
              <div style={{display:'flex',flexDirection:'column',gap:2}}>
                {history.map(item => (
                  <div
                    className="history-item"
                    key={item.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => editingId !== item.id && handleSearch(item.location_query, item.latitude, item.longitude)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && editingId !== item.id) handleSearch(item.location_query, item.latitude, item.longitude) }}
                  >
                    {editingId === item.id ? (
                      <div style={{display:'flex',gap:8,flex:1,alignItems:'center'}}>
                        <input value={editName} onChange={e => setEditName(e.target.value)} autoFocus onKeyDown={e => e.key === 'Enter' && saveEdit(item.id)} className="edit-input" style={{ background: '#ffffff', color: '#1a2a3a' }} />
                        <button onClick={() => saveEdit(item.id)} title="Save" style={{ width: '32px', height: '32px', borderRadius: '8px', border: 'none', background: '#5ba8f5', color: '#ffffff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', flexShrink: 0 }}>✓</button>
                      </div>
                    ) : (
                      <>
                        <div style={{display:'flex',alignItems:'center',gap:10,flex:1}}>
                          <div style={{width:32,height:32,borderRadius:10,background:'#f0f6ff',display:'flex',alignItems:'center',justifyContent:'center'}}>
                            <WeatherIcon condition={item.condition || 'sunny'} iconCode={item.icon || '01d'} size={18}/>
                          </div>
                          <div>
                            <div className="history-loc">{item.location_query}</div>
                            <div className="history-meta">{Math.round(item.temperature)}°C · {item.latitude ? `${Number(item.latitude).toFixed(2)}°N` : 'Saved'}</div>
                          </div>
                        </div>
                        <div className="history-actions" onClick={(e) => e.stopPropagation()}>
                          <button className="icon-btn" onClick={(e) => { e.stopPropagation(); startEdit(item); }} title="Edit">✏️</button>
                          <button className="icon-btn red" onClick={(e) => { e.stopPropagation(); handleDelete(item.id); }} title="Delete">🗑</button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}