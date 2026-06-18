# SoundSpot V1 Deployment

This guide prepares the V1 deployment without storing secrets in the repository.

## Frontend on Vercel

Use `frontend` as the Vercel project root.

- Build command: `npm run build`
- Output directory: `dist`
- Environment variable:
  - `VITE_API_BASE_URL=https://your-render-api.onrender.com`

`frontend/vercel.json` rewrites all routes to `/index.html` so direct refreshes work for client-side routes such as `/about`, `/verify-email?token=...`, and `/reset-password?token=...`.

## Backend on Render

Create a Render Web Service with `backend` as the service root.

- Build command: `pip install -r requirements.txt`
- Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`

Recommended Render environment variables:

```text
APP_ENV=production
DATABASE_URL=<Render PostgreSQL URL>
JWT_SECRET_KEY=<secret>
FRONTEND_URL=https://your-vercel-app.vercel.app
RATE_LIMIT_ENABLED=true
EMAIL_PROVIDER=resend
RESEND_API_KEY=<secret>
EMAIL_FROM=SoundSpot <onboarding@resend.dev>
TICKETMASTER_API_KEY=<secret>
SPOTIFY_CLIENT_ID=<secret>
SPOTIFY_CLIENT_SECRET=<secret>
```

`FRONTEND_URL` must point to the Vercel frontend, not the Render backend. It is used for CORS and for verification/reset links.

## CORS and Cookies

The backend adds `FRONTEND_URL` to the allowed CORS origins and enables credentials for auth cookies. Do not use wildcard CORS origins with credentials.

Cookie behavior:

- Local development: `Secure=false`, `SameSite=Lax`
- Production: `Secure=true`, `SameSite=None`

This is required because the Vercel frontend and Render backend are on different domains. `AUTH_COOKIE_SAMESITE` can override the default if needed, but leaving it empty uses the environment-based defaults.

## Rate Limiting

The V1 backend includes simple in-memory rate limiting for sensitive auth and provider endpoints. Keep `RATE_LIMIT_ENABLED=true` in production.

This is suitable for a single Render instance. If the backend is scaled to multiple instances later, replace the in-memory store with a shared store such as Redis or Upstash so limits are enforced across instances.

## PostgreSQL and Alembic

Create a PostgreSQL database on Render or another provider, then copy its connection string into Render as `DATABASE_URL`.

Run Alembic migrations before first production use.

From the backend root:

```bash
python -m alembic upgrade head
```

From the repository root:

```bash
python -m alembic -c backend/alembic.ini upgrade head
```

Do not add automatic migrations to application startup unless that deployment policy is explicitly chosen later.

## Resend

For production email delivery:

```text
EMAIL_PROVIDER=resend
RESEND_API_KEY=<secret>
EMAIL_FROM=SoundSpot <onboarding@resend.dev>
FRONTEND_URL=https://your-vercel-app.vercel.app
```

`onboarding@resend.dev` is useful for testing without a custom domain. For a cleaner production setup, verify a domain in Resend later and replace `EMAIL_FROM` with an address such as `SoundSpot <noreply@your-domain.com>`.
