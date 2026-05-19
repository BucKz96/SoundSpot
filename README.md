<p align="center">
  <img src="frontend/src/assets/soundspot-logo.png" alt="SoundSpot logo" width="260" />
</p>

<p align="center">
  Explore live music events by city or artist.
</p>

SoundSpot is a fullstack web application for exploring live music events by city or artist.

The idea is simple: search for a city or an artist, fetch real event data from Ticketmaster, normalize it through a FastAPI backend, and display the results in a clean React interface with an interactive map.

The project is built as a portfolio project during my fullstack developer training, with a focus on clean architecture, API integration, Git workflow, and progressive feature delivery.

---

## 🌐 Live demo

Frontend production URL:

https://soundspot-live.vercel.app

---

## 🚀 Current version

**v0.5.0 — Search improvements**

This version improves the search experience and makes the map more reliable when external event data is incomplete.

### What works today

- Search events by city
- Search events by artist
- Switch between City and Artist search modes
- Fetch real event data from the Ticketmaster Discovery API
- Normalize external API data into a clean backend response
- Display events in a modern React frontend
- Display event locations on an interactive Leaflet map
- Show event markers and popups
- Use a world map as the default empty state
- Handle loading, error and empty states
- Improve city search with radius-based location search
- Add fallback coordinates when Ticketmaster does not provide exact event geolocation
- Support simple city aliases such as `Londres` → `London`
- Use a dark, music-oriented UI

---

## 🎯 Project goal

SoundSpot is designed to demonstrate practical fullstack development skills through a real-world project.

The main goals are to:

- Build a backend API with FastAPI
- Connect to external APIs
- Protect external API keys through a backend layer
- Normalize third-party data into a clean internal format
- Build a frontend with React
- Manage frontend/backend communication
- Display dynamic data on an interactive map
- Handle incomplete external API data gracefully
- Use Git and GitHub with a feature-branch workflow
- Deploy a fullstack project with separate frontend and backend hosting

The long-term goal is to turn SoundSpot into a richer live music discovery app with better French event coverage, favorites, and artist enrichment.

---

## 🧱 Tech stack

### Frontend

- React
- Vite
- JavaScript
- CSS
- Leaflet
- React Leaflet

### Backend

- Python
- FastAPI
- Pydantic
- HTTPX

### External services

- Ticketmaster Discovery API
- Geocoding service for location-based search and fallback coordinates

### Deployment

- Vercel for the frontend
- Render for the backend

### Tools

- Git
- GitHub
- Node.js
- Python virtual environment

---

## 🧭 Architecture overview

SoundSpot uses a separated frontend/backend architecture.

```txt
User
 ↓
React frontend on Vercel
 ↓
FastAPI backend on Render
 ↓
Ticketmaster Discovery API
 ↓
Normalized event response
 ↓
React event list + interactive map
```

The frontend does not call Ticketmaster directly.  
Instead, it calls the internal FastAPI backend.

This keeps the external API key hidden, centralizes the business logic, and allows the backend to normalize incomplete or complex external data before sending it to the frontend.

---

## 🔎 Main features

### City search

Users can search for concerts by city.

Example:

```http
GET /api/events/search?city=London
```

The backend handles city normalization and improves search relevance with a location-based radius search when possible.

This helps avoid strict administrative city limits, where nearby venues can be excluded even though they are relevant to the searched city.

---

### Artist search

Users can also search for events by artist.

Example:

```http
GET /api/events/search?artist=Coldplay
```

The frontend uses a single search bar with a City / Artist mode selector.

The results keep the same event format, so the list and map continue to work without a separate rendering flow.

---

### Interactive map

SoundSpot includes an interactive map built with Leaflet and React Leaflet.

The map supports:

- Dark map style
- Event markers
- Marker popups
- Smooth map transitions
- World map default view
- Fallback markers when exact event coordinates are missing

When Ticketmaster does not provide exact latitude/longitude for an event, the backend can fallback to an approximate city-level location. This keeps the map useful without pretending the marker is the exact venue position.

---

## 📦 Event response format

The backend returns normalized event objects.

Example:

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
    "ticket_url": "https://example.com",
    "is_location_approximate": false
  }
]
```

The goal is to keep the frontend simple.  
It receives clean data and does not need to understand the full Ticketmaster response structure.

---

## 🗺️ Version history

### v0.1.0 — Event Search MVP

- First functional version
- Search concerts by city
- Ticketmaster API integration
- FastAPI backend
- React frontend
- Basic dark UI
- Initial README

### v0.2.0 — Deployment setup

- Frontend deployed on Vercel
- Backend deployed on Render
- Public production URL available
- Environment configuration improved

### v0.3.0 — UI redesign

- Professional landing page
- Improved header and branding
- SoundSpot logo integration
- Hero section polish
- How it works, About and Contact sections
- Improved footer
- Favicon added
- Better spacing and visual consistency

### v0.4.0 — Interactive map

- Leaflet map integration
- Event markers
- Marker popups
- Dark map style
- World map default view
- Smooth map transitions
- Better loading and empty states
- City fallback marker for events without exact coordinates

### v0.5.0 — Search improvements

- City / Artist search mode
- Integrated search mode selector
- Artist search through the backend
- Radius-based city search
- Geocoding fallback for incomplete location data
- Approximate markers for events without exact coordinates
- Better handling of Ticketmaster data limitations

---

## ⚠️ Known limitations

Ticketmaster does not always provide complete event coverage or reliable geolocation data, especially for some French events.

This can lead to:

- fewer results for some French cities;
- events without exact venue coordinates;
- limited accuracy for map markers when fallback coordinates are used.

A future version should add a complementary French event source, such as OpenAgenda, to improve local coverage.

---

## 🧭 Roadmap

### Done

- [x] FastAPI backend
- [x] React/Vite frontend
- [x] Frontend/backend communication
- [x] Ticketmaster API integration
- [x] Event data normalization
- [x] Search by city
- [x] Search by artist
- [x] City / Artist search mode
- [x] Loading, error and empty states
- [x] City alias normalization
- [x] Modern dark UI
- [x] Frontend deployment
- [x] Backend deployment
- [x] Interactive map
- [x] Event markers
- [x] Map popups
- [x] Radius-based city search
- [x] Fallback coordinates for incomplete geolocation data

---

## 🌍 Future improvements

Planned improvements include:

- Favorites system
- Better French event coverage with OpenAgenda
- Multi-source event architecture
- Event source field in the response
- Spotify artist enrichment
- Artist images, genres and popularity
- Better filters by date, genre or country
- Backend tests

---

## 🧑‍💻 About this project

SoundSpot is being built as a learning and portfolio project during my fullstack developer training.

The goal is not only to build a working application, but also to practice a professional development workflow:

- clean Git branches;
- pull requests;
- progressive releases;
- readable code;
- API integration;
- deployment;
- documentation;
- technical decision-making.

This project is still in active development and will continue to evolve step by step.

---

## 📌 Status

Current status: **active development**

Current release: **v0.5.0**
