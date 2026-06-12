# v0.15 Auth and Event Favorites Audit

## Scope

This document prepares the v0.15 implementation. It does not add authentication,
database access, migrations, or favorite behavior.

The first supported favorite type should be external events. Venue and artist
favorites should remain out of scope until the event flow is stable.

## Current Backend

### Application structure

- FastAPI application in `backend/app/main.py`.
- API routers are assembled under `/api` in `backend/app/api/router.py`.
- Routes currently cover events, direct Shotgun access, and Spotify artists.
- Provider integrations live under `backend/app/services`.
- Pydantic response schemas currently cover events and Spotify artists.
- Configuration uses `pydantic-settings` and a backend `.env` file.
- External API failures are translated to `HTTPException` in route modules.

### Database and persistence

The repository has a PostgreSQL 16 service in `docker-compose.yml`, but the
application does not connect to it.

There is currently:

- no `DATABASE_URL` setting;
- no SQLAlchemy or other ORM dependency;
- no database engine or session dependency;
- no database models;
- no Alembic configuration or migrations;
- no users, authentication, or authorization code;
- no persistent event or favorite storage.

The only in-memory persistence is temporary caching, such as the Spotify token
and discovery data. It is process-local and is not suitable for user data.

PostgreSQL is therefore the cleanest database choice because it is already
provisioned locally and fits the expected Render deployment. SQLite can be used
only as an isolated test database where practical.

### Existing tests

`backend/tests/test_spotify_service.py` contains service and route tests for
Spotify. There is no shared database test setup and no coverage for event
routes, authentication, or persistence.

### Event contract

`EventResponse` currently contains:

- `id`, `source`;
- `name`, `artist`;
- `city`, `country`, `venue`;
- `date`, `time`;
- `latitude`, `longitude`;
- `ticket_url`;
- `is_location_approximate`;
- `genres`.

Events are assembled at request time from external providers and are not
canonical database records. A favorite must therefore store a small event
snapshot rather than a foreign key to a local event table.

## Current Frontend

### Routing and state

- The frontend renders only `HomePage`.
- There is no routing library and no pathname-based routing.
- State is local to components, mainly `HomePage`, `MapPreview`, and modals.
- There is no React context for application or user state.
- There is no use of `localStorage`, `sessionStorage`, or client cookies.
- API calls use `fetch`, but are split between `api.js` and a lightly used
  `httpClient.js`.

### Authentication entry points

`AppNavbar` already contains a disabled `Sign in` button and a `Get started`
link. `FinalCTA` also contains disabled or placeholder auth actions. These are
the correct entry points for an auth modal:

- `Sign in` opens the modal in login mode;
- `Get started` opens it in registration mode;
- the final CTA uses the same shared actions.

When authenticated, navbar actions should become:

- `My favorites`;
- a compact user/display-name indicator;
- `Sign out`.

### Favorite entry points

The primary favorite action belongs in `EventCard`, ideally as a small icon
button in the card header. It should not compete with the provider ticket link.

The featured-event component already has a disabled heart button and can reuse
the same favorite behavior after the primary card flow is complete.

The map sidebar uses a separate compact event rendering. It does not reuse
`EventCard`. A compact heart can be added later in v0.15.6, after favorite state
is centralized. Adding it before that would duplicate logic in a dense layout.

### Favorites page

A dedicated `/favorites` page is recommended. The current list can remain a
single page, but persisted favorites need a stable destination that works after
reload and can show empty, loading, and signed-out states.

Adding `react-router-dom` in the frontend auth phase is justified once this
second page exists. It should not be added during the backend/database phases.

## Recommended Architecture

### Backend dependencies

Add these in the database/auth phases:

- `sqlalchemy>=2`;
- `alembic`;
- `psycopg[binary]`;
- `pwdlib[argon2]` for password hashing;
- `PyJWT` for signed tokens;
- `email-validator` for Pydantic email validation.

Keep the architecture small:

```text
backend/app/
  api/
    dependencies/auth.py
    routes/auth.py
    routes/favorites.py
  core/
    config.py
    security.py
  db/
    base.py
    session.py
  models/
    user.py
    event_favorite.py
  schemas/
    auth.py
    favorite.py
    user.py
  services/
    auth_service.py
    favorite_service.py
```

Routes should own HTTP translation, services should own business rules, and
SQLAlchemy sessions/models should own persistence. A repository layer is not
needed yet.

### Database sessions

Use SQLAlchemy 2 with a PostgreSQL `DATABASE_URL`. Synchronous sessions are
adequate for the current project and simpler to test and operate. FastAPI can
provide one session per request through a dependency with commit/rollback
handled explicitly by services or route-level transaction boundaries.

Alembic must be introduced with the first models. Do not rely on
`Base.metadata.create_all()` outside tests.

### Authentication choice

Use a signed JWT stored in an HttpOnly cookie.

This is recommended over storing a bearer token in `localStorage` because:

- JavaScript cannot directly read an HttpOnly cookie;
- authentication survives page reloads;
- the frontend only needs `credentials: "include"` and `/api/auth/me`;
- logout can clear the cookie cleanly.

For v0.15, use one access/session JWT with a seven-day expiry and no refresh
token. This is a reasonable portfolio tradeoff. Logout is client-side cookie
removal; already issued JWTs cannot be revoked until expiry. Token revocation
and refresh tokens can be added later if the product requires them.

Cookie settings:

- `HttpOnly=true`;
- `Secure=true` in production;
- `SameSite=Lax` when frontend and API are same-site;
- if Vercel and Render remain cross-site, use `SameSite=None; Secure` and check
  the `Origin` header on mutating authenticated requests;
- set an explicit cookie name, path, and max age.

Production is simpler and safer if frontend and API use subdomains of the same
parent domain.

### Frontend authentication state

Create an `AuthProvider` at the application root with:

- `user`;
- `status`: `loading`, `authenticated`, or `anonymous`;
- `openAuth(mode)`;
- `register`, `login`, `logout`;
- `refreshUser`.

On initial mount, call `/api/auth/me` with credentials. A `401` means anonymous,
not a global application error.

Do not duplicate the user in `localStorage`. The cookie is the persisted
credential and `/me` is the source of truth.

Create a separate `FavoritesProvider` only when favorites are implemented. It
can hold favorite rows and a lookup keyed by `source:event_id`. This keeps
favorite buttons consistent between `EventCard`, featured events, the map
sidebar, and the favorites page.

## Recommended Tables

### `users`

| Column | Type | Rules |
| --- | --- | --- |
| `id` | UUID | primary key |
| `email` | varchar(320) | normalized lowercase, unique, indexed |
| `hashed_password` | varchar | required |
| `display_name` | varchar(80) | nullable |
| `created_at` | timestamptz | server default, required |

Do not store raw passwords. Do not expose `hashed_password` in any response.

### `event_favorites`

| Column | Type | Rules |
| --- | --- | --- |
| `id` | UUID | primary key |
| `user_id` | UUID | foreign key to `users.id`, cascade delete |
| `event_id` | varchar(255) | provider event identifier |
| `source` | varchar(50) | normalized provider key |
| `event_name` | varchar(500) | required snapshot |
| `artist` | varchar(500) | nullable snapshot |
| `city` | varchar(255) | nullable snapshot |
| `country` | varchar(255) | nullable snapshot |
| `venue` | varchar(500) | nullable snapshot |
| `event_date` | date | nullable |
| `event_time` | time | nullable |
| `ticket_url` | text | nullable |
| `image_url` | text | nullable |
| `created_at` | timestamptz | server default, required |

Add:

- unique constraint on `(user_id, source, event_id)`;
- index on `(user_id, created_at)`;
- validation that `event_id`, `source`, and `event_name` are not blank.

This snapshot is deliberate. Provider events can disappear or change, while a
user still expects a useful favorites list. Do not introduce an `events` table
in v0.15.

## Recommended API

### Auth

#### `POST /api/auth/register`

Request:

```json
{
  "email": "user@example.com",
  "password": "correct horse battery staple",
  "display_name": "Max"
}
```

Response `201`:

```json
{
  "id": "uuid",
  "email": "user@example.com",
  "display_name": "Max",
  "created_at": "2026-06-12T12:00:00Z"
}
```

Set the auth cookie on successful registration. Return `409` for an existing
email with a generic message.

#### `POST /api/auth/login`

Use a JSON body with `email` and `password`. On success, set the cookie and
return the same public user shape. Invalid email and invalid password must both
return the same `401` response.

#### `GET /api/auth/me`

Return the public user for a valid cookie. Return `401` when missing, expired,
invalid, or when the user no longer exists.

#### `POST /api/auth/logout`

Clear the auth cookie and return `204`. The endpoint can be idempotent.

### Event favorites

#### `GET /api/favorites/events`

Authenticated. Return favorites ordered by `created_at DESC`.

#### `POST /api/favorites/events`

Authenticated request:

```json
{
  "event_id": "provider-event-id",
  "source": "ticketmaster",
  "event_name": "Event name",
  "artist": "Artist name",
  "city": "Paris",
  "country": "France",
  "venue": "Venue name",
  "event_date": "2026-06-15",
  "event_time": "20:00:00",
  "ticket_url": "https://provider.example/event",
  "image_url": null
}
```

Return `201` with the favorite row. Return `409` if the same
`(user_id, source, event_id)` already exists. The backend must derive `user_id`
from the authenticated user, never from the request.

#### `DELETE /api/favorites/events/{favorite_id}`

Authenticated. Delete only when the favorite belongs to the current user.
Return `204`; return `404` for both missing and other-user rows to avoid leaking
ownership information.

Deleting by `favorite_id` is preferable for the first version because the GET
response already supplies it and the route remains simple. The frontend lookup
can still use `source:event_id`.

## Security Baseline

- Hash passwords with Argon2 through `pwdlib`; never encrypt or log passwords.
- Normalize emails with `strip().casefold()` before lookup and storage.
- Validate with `EmailStr`.
- Require at least 10 characters and cap password input, for example at 128
  characters, to prevent abusive hashing workloads.
- Use a random `JWT_SECRET_KEY` of at least 32 bytes from environment variables.
- Include `sub`, `iat`, and `exp` claims; use one configured algorithm.
- Never return whether an email exists during login.
- Keep CORS origins explicit. Never combine credentialed requests with `*`.
- Add `credentials: "include"` only to the shared frontend API client.
- Validate `Origin` for cookie-authenticated POST/DELETE requests when deployed
  cross-site.
- Do not put provider credentials, JWTs, or password hashes in frontend code.
- Limit auth payload sizes and add rate limiting later if the public deployment
  attracts abuse.

Required settings:

```env
DATABASE_URL=postgresql+psycopg://soundspot:soundspot@localhost:5432/soundspot
JWT_SECRET_KEY=replace_with_a_long_random_secret
JWT_ALGORITHM=HS256
AUTH_TOKEN_EXPIRE_MINUTES=10080
AUTH_COOKIE_NAME=soundspot_session
AUTH_COOKIE_SECURE=false
AUTH_COOKIE_SAMESITE=lax
```

Production values must enable secure cookies. Cross-site deployment requires
`AUTH_COOKIE_SAMESITE=none`.

## Error Contract

Auth and favorite routes should use consistent JSON errors through FastAPI's
standard `{"detail": "..."}` shape:

- `400`: malformed business input;
- `401`: missing or invalid authentication;
- `404`: favorite not found or not owned;
- `409`: duplicate email or duplicate favorite;
- `422`: schema validation;
- `500`: unexpected database failure, logged server-side without leaking SQL.

Database integrity errors should be translated deliberately. Do not expose raw
driver or SQLAlchemy exception messages.

## Technical Risks

1. **Cross-site cookies:** Vercel and Render are different sites. Production
   cookies require HTTPS, `SameSite=None`, credentialed CORS, and CSRF/Origin
   protection.
2. **External event identity:** event IDs are unique only within a provider.
   Always key favorites by both `source` and `event_id`.
3. **Snapshot staleness:** saved event details can become outdated. This is an
   accepted v0.15 tradeoff and should be visible in the data model.
4. **Inconsistent event images:** `EventResponse` does not currently define
   `image_url`, although some frontend code probes optional image fields.
   Keep `image_url` optional until the event contract is standardized.
5. **Frontend API duplication:** `api.js` and `httpClient.js` overlap. Introduce
   one shared request helper during frontend auth, but avoid a broad refactor.
6. **No database test foundation:** v0.15.2 must establish isolated session
   overrides and migration/model tests before auth logic depends on them.
7. **JWT logout semantics:** clearing the cookie does not revoke an issued JWT.
   Shorter expiry or token revocation can be considered after v0.15.

## Implementation Roadmap

### v0.15.1 - Audit

- Record current constraints and architecture.
- Confirm PostgreSQL, cookie strategy, schemas, and endpoint contracts.
- Run existing backend and frontend validations.

### v0.15.2 - Database and users

- Add SQLAlchemy, Alembic, PostgreSQL driver, and email validation.
- Add database settings, engine, session dependency, and declarative base.
- Add `User` and `EventFavorite` models.
- Create the initial Alembic migration.
- Add public user and favorite Pydantic schemas.
- Add model, constraint, and database-session tests.
- Do not add login/register routes yet.

### v0.15.3 - Backend auth

- Add Argon2 password hashing and JWT cookie helpers.
- Add register, login, me, and logout routes.
- Add `get_current_user` dependency.
- Add auth route and security tests, including expired and invalid tokens.

### v0.15.4 - Backend favorites

- Add favorite service and protected routes.
- Enforce ownership and duplicate constraints.
- Add CRUD, isolation, and unauthorized-request tests.

### v0.15.5 - Frontend auth

- Add the shared credentialed API client.
- Add `AuthProvider` and initial `/me` hydration.
- Add accessible login/register modal.
- Connect navbar and final CTA states.
- Add routing when `/favorites` is introduced.

### v0.15.6 - Frontend favorites

- Add `FavoritesProvider`.
- Add favorite toggle to `EventCard`.
- Add `/favorites` page with empty/loading/error states.
- Reuse the toggle in featured events.
- Add a compact sidebar action only after shared behavior is stable.
- Opening a favorite action while signed out should open the auth modal and
  preserve the intended event for completion after login.

### v0.15.7 - Polish and tests

- Verify mobile auth and favorites UX.
- Add frontend component/API tests if a test runner is introduced.
- Test CORS and cookies in local and deployed environments.
- Verify duplicate, expired-session, network-error, and ownership cases.
- Update README and deployment environment documentation.

## Exact Next Codex Task

Use this scope for v0.15.2:

> On a new branch from `dev`, implement only the database foundation and models
> for SoundSpot v0.15.2. Add SQLAlchemy 2, Alembic, psycopg, and email-validator;
> configure `DATABASE_URL`; create the engine/session dependency and declarative
> base; add `User` and `EventFavorite` models with UUID primary keys, timestamps,
> foreign key cascade, and unique `(user_id, source, event_id)` constraint;
> create the initial Alembic migration; add public Pydantic schemas and isolated
> database tests. Do not implement auth routes, JWTs, password hashing, frontend
> forms, or favorite endpoints. Do not modify Spotify, event providers, or map
> behavior. Run compileall, migrations/tests, and existing backend tests. Do not
> push.
