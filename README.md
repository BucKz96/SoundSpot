
<p align="center">
  <img src="frontend/src/assets/soundspot-logo.png" alt="SoundSpot logo" width="260" />
</p>

<p align="center">
  Discover live events across cities and scenes.
</p>

SoundSpot is a fullstack web application for exploring live music events by city or artist.

The app aggregates real event data from multiple providers, normalizes it through a FastAPI backend, and displays the results in a modern React interface with filters, provider badges, an interactive map, and a paginated event list.

SoundSpot is built as a portfolio-grade fullstack project, with a focus on clean architecture, multi-source API integration, map-based discovery, Git workflow, and progressive product releases.

---

## 🌐 Live demo

Frontend production URL:

https://soundspot-live.vercel.app

---

## 🚀 Current version

**v0.8.0 — Event filters & global discovery map**

This version improves event exploration with genre/source/date filters, backend genre normalization, and a real global discovery map powered by live provider data.

### What works today

- Search events by city
- Search events by artist
- Switch between City and Artist search modes
- Fetch real event data from Ticketmaster and Shotgun
- Multi-source city search
- Ticketmaster-based artist search
- Normalize external API data into a clean backend response
- Display events in a modern React frontend
- Display events on an interactive Leaflet map
- Show event markers and grouped markers
- Show compact map popups
- Display provider badges for Shotgun and Ticketmaster
- Open events on their original provider
- Show a real global discovery map before search
- Filter results by genre/style
- Filter results by source
- Filter results by date range
- Reset filters
- Paginate event results
- Sort events by closest date first
- Handle loading, error and empty states
- Support simple city aliases such as `Londres` → `London`
- Use a dark, music-oriented, neon-inspired UI

---

## 🎯 Project goal

SoundSpot is designed to demonstrate practical fullstack development skills through a real-world product.

The main goals are to:

- Build a backend API with FastAPI
- Connect to multiple external event providers
- Protect external API keys through a backend layer
- Normalize third-party data into a clean internal format
- Merge multi-source event results
- Build a frontend with React
- Manage frontend/backend communication
- Display dynamic data on an interactive map
- Handle incomplete external API data gracefully
- Provide useful frontend filters
- Use Git and GitHub with a feature-branch workflow
- Deploy a fullstack project with separate frontend and backend hosting

The long-term goal is to turn SoundSpot into a richer live event discovery app with stronger European coverage, better data quality, and artist enrichment.

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
Provider services
 ├─ Ticketmaster Discovery API
 └─ Shotgun Events API
 ↓
Normalized EventResponse
 ↓
React filters + map + paginated event list
````

The frontend does not call external event providers directly.
Instead, it calls the internal FastAPI backend.

This keeps API keys hidden, centralizes business logic, and allows the backend to normalize incomplete or inconsistent provider data before sending it to the frontend.

---

## 🔎 Main features

### City search

Users can search for events by city.

Example:

```http
GET /api/events/search?city=Lyon
```

For city searches, SoundSpot can combine events from Ticketmaster and Shotgun.

The backend normalizes both providers into the same response format, merges the results, removes obvious duplicates, sorts events by date, and returns a clean list to the frontend.

---



Users can also search for events by artist.

Example:

```http
GET /api/events/search?artist=Coldplay
```

Artist search currently relies mainly on Ticketmaster, while city search benefits from the multi-source architecture.

The frontend uses a single search bar with a City / Artist mode selector.

---

### Global discovery map

Before a search is made, SoundSpot displays a global discovery map powered by real event data.

This gives the homepage a more dynamic feel and allows users to immediately see live event activity across different regions.

The global discovery data is handled separately from search results, so it does not pollute the event list before the user performs a search.

---

### Interactive map

SoundSpot includes an interactive map built with Leaflet and React Leaflet.

The map supports:

* Dark midnight map style
* Neon-inspired event markers
* Provider-aware marker colors
* Grouped markers for events at the same location
* Compact popups
* Provider badges
* Smooth map transitions
* Global discovery state before search
* Filtered event display after search

When exact event coordinates are missing, the backend can fallback to approximate city or area coordinates when reliable data is available.

---

### Filters

SoundSpot includes frontend filters to refine already loaded results without making additional backend requests.

Available filters:

* Genre / style
* Source
* Date from
* Date to
* Reset filters

The map, event list, event counter, and pagination all update from the same filtered result set.

---

## 📦 Event response format

The backend returns normalized event objects.

Example:

```json
[
  {
    "id": "shotgun:479164",
    "name": "TRIBUTE NIGHT : SLIPKNOT x LINKIN PARK x EVANESCENCE",
    "artist": "METEORA☄️",
    "city": "Villeurbanne",
    "country": "France",
    "venue": "La Rayonne",
    "date": "2026-05-23",
    "time": "17:30",
    "latitude": 45.7567337,
    "longitude": 4.9170007,
    "ticket_url": "https://shotgun.live/events/tribute-night-slipknot-linkin-park-evanescence",
    "is_location_approximate": false,
    "source": "shotgun",
    "genres": ["rock", "metal"]
  }
]
```

The goal is to keep the frontend simple.
It receives clean data and does not need to understand the full Ticketmaster or Shotgun response structure.

### Spotify artist search

```http
GET /api/artists/spotify/search?name=Daft%20Punk
```

Spotify credentials remain on the backend and use the Client Credentials Flow.
The endpoint enriches an artist on demand and does not provide event data.

Example response:

```json
{
  "id": "4tZwfgrHOc3mvqYlEYSvVi",
  "name": "Daft Punk",
  "spotify_url": "https://open.spotify.com/artist/4tZwfgrHOc3mvqYlEYSvVi",
  "image_url": "https://example.com/artist.jpg",
  "genres": ["electro", "filter house"],
  "popularity": 82,
  "followers": 1234567,
  "provider": "spotify"
}
```

---

## 🗺️ Version history

### v0.1.0 — Event Search MVP

* First functional version
* Search concerts by city
* Ticketmaster API integration
* FastAPI backend
* React frontend
* Basic dark UI
* Initial README

### v0.2.0 — Deployment setup

* Frontend deployed on Vercel
* Backend deployed on Render
* Public production URL available
* Environment configuration improved

### v0.3.0 — UI redesign

* Professional landing page
* Improved header and branding
* SoundSpot logo integration
* Hero section polish
* How it works, About and Contact sections
* Improved footer
* Favicon added
* Better spacing and visual consistency

### v0.4.0 — Interactive map

* Leaflet map integration
* Event markers
* Marker popups
* Dark map style
* World map default view
* Smooth map transitions
* Better loading and empty states
* City fallback marker for events without exact coordinates

### v0.5.0 — Search improvements

* City / Artist search mode
* Integrated search mode selector
* Artist search through the backend
* Radius-based city search
* Geocoding fallback for incomplete location data
* Approximate markers for events without exact coordinates
* Better handling of Ticketmaster data limitations

### v0.6.0 — Result pagination

* Fetch more Ticketmaster results with a safe backend limit
* Display all available events on the map
* Paginate the event list
* Show 12 event cards per page
* Add Previous / Next controls
* Sort events by closest date first
* Improve list and map stability

### v0.7.0 — Multi-source discovery

* Add Shotgun Events API integration
* Add isolated Shotgun backend service
* Normalize Shotgun events into the existing response format
* Add `source` field to events
* Merge Shotgun and Ticketmaster results for city searches
* Keep artist search Ticketmaster-based
* Add provider badges
* Add dynamic provider links
* Add Event Sources section on the homepage
* Reposition homepage wording toward a product experience

### v0.8.0 — Event filters & global discovery map

* Add backend genre normalization
* Add `genres` field to normalized events
* Add genre/style filter
* Add source filter
* Add date range filter
* Add reset filters action
* Fix Date To filtering behavior
* Synchronize filters with map, list, counter and pagination
* Add real global discovery events before search
* Improve map visual identity with a dark midnight style
* Improve neon marker styling
* Improve map popups and controls

---

## ⚠️ Known limitations

External event data depends on provider availability and data quality.

Current limitations include:

* Ticketmaster can have limited coverage for some French/local events.
* Ticketmaster does not always provide complete geolocation data.
* Some external provider links may become unavailable or return a 404.
* Artist search is currently stronger through Ticketmaster than Shotgun.
* Genre normalization is useful but still depends on provider metadata quality.
* Multi-source duplicate detection is still simple and can be improved.

Shotgun improves French and local event coverage, especially for clubs, concerts, independent scenes and local organizers.



---

## 🧭 Roadmap

### Done


---

## 🌍 Future improvements

Planned improvements include:

* Audit additional European concert/event providers
* Improve global discovery coverage
* Improve multi-source deduplication
* Add better provider priority rules
* Add stronger data quality checks
* Add backend tests
* Add screenshots to the README
* Improve mobile filter UX
* Add Spotify artist enrichment later
* Add artist images, genres, popularity and Spotify links
* Add favorites later, possibly with user accounts in a future version

---

## 🧑‍💻 About this project

SoundSpot is being built as a portfolio-grade fullstack project during my fullstack developer training.

The goal is not only to build a working application, but also to practice a professional development workflow:

* clean Git branches;
* pull requests;
* progressive releases;
* readable code;
* API integration;
* data normalization;
* multi-source architecture;
* deployment;
* documentation;
* technical decision-making.

This project is still in active development and will continue to evolve step by step.

---

## 📌 Status

Current status: **active development**

Current release: **v0.8.0**

## License

This project is proprietary.
The source code may not be copied, modified, distributed, or reused without prior written permission.
