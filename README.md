<p align="center">
  <img src="frontend/src/assets/soundspot-logo.png" alt="SoundSpot logo" width="220" />
</p>

<p align="center">
  Discover live music events worldwide through a map-first experience.
</p>

<p align="center">
  <strong>Data sources and integrations</strong><br />
  <img src="frontend/public/providers/ticketmaster.png" alt="Ticketmaster" height="50" />
  <img src="frontend/public/providers/shotgun.png" alt="Shotgun" height="50" />
  <img src="frontend/public/providers/openagenda.png" alt="OpenAgenda" height="50" />
  <img src="frontend/public/providers/spotify.png" alt="Spotify" height="50" />
</p>

SoundSpot is a fullstack product/portfolio project built to help users discover live music, nightlife and cultural events through an interactive map. It combines external event sources, Spotify artist enrichment, account features and a responsive React interface into a live V1 discovery experience.

SoundSpot does not sell tickets directly. When available, event actions redirect users to official provider or ticketing pages. Event availability, pricing and metadata depend on third-party sources.

## Live Demo

SoundSpot V1 is live in production on the `soundspot.app` domain.

- Web app: https://www.soundspot.app
- API health: https://api.soundspot.app/health

## Product Overview

SoundSpot is designed for people who want a faster way to understand what is happening around a city, artist or scene.

The V1 experience lets users:

- Explore events on an interactive map.
- Search by city or artist.
- Filter events by date, category and style.
- Switch between map and list views.
- Open provider pages for official event details.
- Save favorite events after creating an account.
- View Spotify-powered artist context when a reliable match is available.

The product focuses on discovery and redirection rather than ticket checkout. Provider pages remain the source of truth for purchases, refunds, final event details and availability.

## Screenshots / Preview

### Landing page

![SoundSpot landing page](docs/screenshots/landing.png)

### Discovery map

![SoundSpot discovery map](docs/screenshots/discovery-map.png)

### Real discovery highlights

![SoundSpot discovery highlights](docs/screenshots/discovery-highlights.png)

### My Favorites

![SoundSpot My Favorites](docs/screenshots/my-favorites.png)

## Key Features

- Map-based event discovery
- City search
- Artist search
- Venue search placeholder prepared for a future release
- Date, category and style filters
- Map/List mode
- Event images when available
- Dynamic map sidebar
- Trending cities based on real loaded events
- Featured events based on real discovery data
- Spotify artist enrichment
- User registration and login
- Email verification
- Forgot/reset password
- Event favorites
- My Favorites page
- Responsive UI
- Production custom domain
- Resend transactional emails
- Basic in-memory rate limiting
- Provider failure handling
- Ticketmaster 429 cooldown
- CARTO/Leaflet map tile bounds hardening
- Public pages: About, Contact, Privacy, Legal

## Tech Stack

### Frontend

- React
- Vite
- Leaflet
- React Leaflet
- CSS

### Backend

- FastAPI
- SQLAlchemy
- Alembic
- PostgreSQL
- Pydantic
- JWT authentication with HttpOnly cookies
- Argon2 password hashing

### External APIs

- Ticketmaster
- Shotgun
- OpenAgenda
- Spotify
- Resend

### Deployment

- Vercel frontend
- Render backend
- PostgreSQL database on Render

## Architecture Overview

```text
React/Vite frontend on Vercel
https://www.soundspot.app
        |
        | HTTPS API calls
        v
FastAPI backend on Render
https://api.soundspot.app
        |
        | SQLAlchemy / Alembic
        v
PostgreSQL database on Render

External data:
  - Ticketmaster
  - Shotgun
  - OpenAgenda
  - Spotify
```

The frontend consumes the backend API. The backend normalizes external provider data, keeps provider credentials server-side, handles authentication flows and persists user accounts, auth tokens and favorites in PostgreSQL.

Production authentication uses JWT sessions stored in Secure HttpOnly cookies, with SameSite=None configured for the Vercel frontend and Render API domains. V1 also includes basic in-memory rate limiting on backend endpoints.

Most event data is fetched or derived from external providers, so coverage and freshness depend on third-party availability.

## Data Providers

SoundSpot V1 uses multiple event data sources and artist enrichment integrations:

- **Ticketmaster**: event discovery and ticket links.
- **Shotgun**: nightlife and music event discovery.
- **OpenAgenda**: public/open event data.
- **Spotify**: artist enrichment, including images, genres, popularity and external artist links when a reliable match is available.

Provider data is normalized into a shared event model before it reaches the frontend. The app also includes provider stability work so one unavailable source does not necessarily block the full discovery experience.

## Authentication & User Features

SoundSpot includes a complete V1 account flow:

- User registration
- Login/logout
- JWT session stored in an HttpOnly cookie
- Email verification
- Forgot/reset password flow
- Temporary hashed verification/reset tokens
- Event favorites
- My Favorites page

Passwords are hashed and are never stored in plain text.

## Production Deployment

Current production deployment:

- Frontend: React/Vite on Vercel
- Web domain: https://www.soundspot.app
- Backend API: FastAPI on Render
- API domain: https://api.soundspot.app
- Database: PostgreSQL on Render
- Migrations: Alembic
- Emails: Resend
- Auth: JWT HttpOnly cookies

Production notes:

- CORS must match the Vercel frontend domain.
- Production cookies must be Secure and SameSite=None for cross-site Vercel to Render auth.
- Provider API keys must be stored as backend environment variables.
- Email verification and password reset are handled through Resend transactional emails.
- V1 rate limiting is in-memory and should move to Redis or Upstash if traffic scales.
- Deployment setup details are documented in `docs/deployment.md`.

## Product Status

SoundSpot V1 is live in production at https://www.soundspot.app.

Live V1 scope:

- Landing page
- Public pages
- Map discovery
- City and artist search
- Provider integrations
- Spotify enrichment
- Authentication
- Email verification
- Password reset
- Favorites
- My Favorites
- Responsive UI polish
- Provider stability improvements
- Production deployment on Vercel and Render
- Custom domain
- Resend transactional emails
- Basic backend rate limiting
- Real event data from Ticketmaster, Shotgun and OpenAgenda

## Known Limitations

- Event data depends on third-party providers.
- Provider rate limits can affect availability.
- Not every event has an image.
- Venue search is prepared but not fully available.
- V1 rate limiting is in-memory and should move to Redis or Upstash if traffic scales.
- Map styling is Leaflet-based, not a fully custom vector map.
- External provider links may change, expire or become unavailable.

## Roadmap

### Post-V1

- Better venue search
- Account settings and deletion
- Improved provider monitoring
- Monitoring and analytics
- Distributed Redis/Upstash rate limiting
- Advanced filters
- Recommendations
- Alerts and notifications
- Deeper personalization
- More event sources
- MapLibre/vector map exploration
- Portfolio case study

## Local Development

This repository is mainly presented as a fullstack product/portfolio project. The app can still be run locally with a React/Vite frontend, FastAPI backend and PostgreSQL database.

Main commands:

```bash
npm --prefix frontend run dev
backend\venv\Scripts\python.exe -m uvicorn app.main:app --reload --app-dir backend
```

Local setup also requires backend environment variables, a PostgreSQL database and Alembic migrations. Production secrets and `.env` files must not be committed.

Validation commands:

```bash
npm.cmd --prefix frontend run lint
npm.cmd --prefix frontend run build
backend\venv\Scripts\python.exe -m compileall backend\app
backend\venv\Scripts\python.exe -m unittest discover backend\tests
```

## Contact / Project Note

SoundSpot is built as a fullstack product/portfolio project to demonstrate product thinking, frontend implementation, backend API design, external API integration, authentication, persistence, production deployment and release-focused polish.

Contact and portfolio links can be added as the public case study evolves.
