# wayfarer-weather

# 🧭 Wayfarer Weather Dashboard

A full-stack, AI-powered travel and weather companion. This application provides real-time meteorological data, dynamic user-specific search histories, and context-aware AI travel recommendations.

## 🚀 Features
* **Live Weather Engine:** Integrates OpenWeather API for real-time conditions, UV Index, AQI, and 5-day predictive forecasts.
* **Smart UI/UX:** Dynamic React interface that transitions states, calculates progress bars, and renders interactive SVG charts natively based on atmospheric data.
* **AI-Powered Insights:** Utilizes Google Gemini to process live weather variables and generate tailored, conversational recommendations.
* **Multi-Media Explorer:** Embeds dynamic Google Maps and localized YouTube travel vlogs based on the searched destination.
* **Secure User Vault:** Implements Supabase Authentication to isolate and save personalized search histories for individual users.

## 🛠️ Tech Stack
* **Frontend:** React, Vite, CSS Grid/Flexbox
* **Backend:** Python, FastAPI, SQLAlchemy
* **Database & Auth:** Supabase (PostgreSQL)
* **AI & External APIs:** Google Gemini 2.5 Flash, OpenWeatherMap, Google Maps Geocoding, YouTube Data API v3

## ⚙️ Local Installation

### 1. Clone the repository
\`\`\`bash
git clone https://github.com/YOUR_USERNAME/wayfarer-weather.git
\`\`\`

### 2. Setup the Backend
\`\`\`bash
cd backend
python -m venv venv
source venv/bin/activate  # Or `venv\Scripts\activate` on Windows
pip install -r requirements.txt
uvicorn main:app --reload
\`\`\`

### 3. Setup the Frontend
Open a new terminal window:
\`\`\`bash
cd frontend
npm install
npm run dev
\`\`\`
