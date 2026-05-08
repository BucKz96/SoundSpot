# Backend structure convention

This backend uses a simple, junior-friendly structure:

- `app/main.py`: FastAPI app creation, middleware, and router mounting
- `app/core/`: shared configuration and app-level settings
- `app/api/router.py`: central API router
- `app/api/routes/`: HTTP endpoints grouped by feature (`health.py`, later `events.py`, etc.)
- `app/schemas/`: Pydantic request/response models

Suggested rule of thumb:

- Put HTTP concerns in `api/routes`
- Put data shapes in `schemas`
- Keep `main.py` short and focused on app setup
