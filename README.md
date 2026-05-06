# SoundSpot

SoundSpot is a fullstack monorepo for exploring concerts by city on an interactive map.

## Structure

- `backend/`: FastAPI API
- `frontend/`: React + Vite web app
- `docs/`: project documentation

## Backend quick start

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Health check:

```bash
curl http://127.0.0.1:8000/health
```

## Frontend quick start

```bash
cd frontend
npm install
npm run dev
```

## Database quick start

```bash
docker compose up -d
```
