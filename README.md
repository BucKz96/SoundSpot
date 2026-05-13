# SoundSpot 🎧

SoundSpot is a fullstack web application designed to explore live music events by city.

The idea is simple: search for a city, fetch real events from Ticketmaster, and display them in a clean, modern interface. The project is currently in active development and is being built as a portfolio project during my fullstack developer training.

---

## 🚀 Current version

**v0.1.0 — Event Search MVP**

This first version focuses on the core feature of the application: searching for live music events by city using real external data.

### What works today

- Search events by city
- Fetch real event data from the Ticketmaster API
- Normalize external API data into a clean backend response
- Display events in a React frontend
- Handle loading, error and empty states
- Support simple city aliases such as `Londres` → `London`
- Use a modern dark UI with a tech/music-oriented style

---

## 🎯 Project goal

SoundSpot is designed to demonstrate practical fullstack development skills through a real-world project.

The main goals are to:

- Build a backend API with FastAPI
- Connect to an external API
- Normalize and expose third-party data through a clean internal format
- Build a frontend with React
- Manage frontend/backend communication
- Use Git and GitHub with a feature-branch workflow
- Prepare the project for deployment and future improvements

The long-term goal is to turn SoundSpot into an interactive music discovery app with a map-based experience and artist enrichment through Spotify.

---

## 🧱 Tech stack

### Frontend

- React
- Vite
- JavaScript
- CSS

### Backend

- Python
- FastAPI
- Pydantic
- HTTPX

### External API

- Ticketmaster Discovery API

### Tools

- Git
- GitHub
- Node.js with `.nvmrc`
- Python virtual environment

---

## ⚙️ Installation

### 1. Clone the repository

```bash
git clone https://github.com/BucKz96/SoundSpot.git
cd SoundSpot
```

---

## 🐍 Backend setup

Go to the backend folder:

```bash
cd backend
```

Create and activate a virtual environment:

```bash
python -m venv .venv
source .venv/bin/activate
```

Install dependencies:

```bash
pip install -r requirements.txt
```

Create a local environment file:

```bash
cp .env.example .env
```

Add your Ticketmaster API key:

```env
TICKETMASTER_API_KEY=your_ticketmaster_api_key
```

Run the backend:

```bash
uvicorn app.main:app --reload
```

The API is available at:

```txt
http://localhost:8000
```

Swagger documentation is available at:

```txt
http://localhost:8000/docs
```

---

## ⚛️ Frontend setup

Go to the frontend folder:

```bash
cd frontend
```

Use the expected Node.js version:

```bash
nvm use
```

Install dependencies:

```bash
npm install
```

Create a local environment file:

```bash
cp .env.example .env
```

Make sure the frontend points to the backend:

```env
VITE_API_BASE_URL=http://localhost:8000
```

Run the frontend:

```bash
npm run dev
```

The app is available at:

```txt
http://localhost:5173
```

---

## 🔎 API overview

### Search events by city

```http
GET /api/events/search?city=London
```

Example response:

```json
[
  {
    "id": "string",
    "name": "Event name",
    "artist": "Artist name",
    "city": "London",
    "country": "United Kingdom",
    "venue": "Venue name",
    "date": "2026-06-15",
    "time": "20:00",
    "latitude": 51.5072,
    "longitude": -0.1276,
    "ticket_url": "https://example.com"
  }
]
```

### Development endpoint

```http
GET /api/events
```

This endpoint currently returns mock events and is mainly used as a development fallback.

---

## 🧭 Roadmap

### Done

- [x] Project initialization
- [x] FastAPI backend
- [x] React/Vite frontend
- [x] Frontend/backend communication
- [x] Event search by city
- [x] Ticketmaster API integration
- [x] Event data normalization
- [x] Loading, error and empty states
- [x] City alias normalization
- [x] Modern dark UI

### Next steps

- [ ] Deploy the frontend and backend
- [ ] Add an interactive map
- [ ] Display event markers on the map
- [ ] Improve event details
- [ ] Add Spotify artist enrichment
- [ ] Add screenshots to the README
- [ ] Add basic backend tests

---

## 🌍 Future improvements

Planned improvements include:

- Interactive map with event markers
- Artist pages enriched with Spotify data
- Better city search using geocoding
- Event filters by date or genre
- Favorites system
- Database caching
- Public demo deployment

---

## 🧑‍💻 About this project

SoundSpot is being built as a learning and portfolio project during my fullstack developer training.

The goal is not only to build a working application, but also to practice a professional development workflow: clean Git branches, readable code, API integration, documentation, and progressive feature delivery.

---

## 📌 Status

Current status: **active development**

Current release: **v0.1.0**
