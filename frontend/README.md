# SoundSpot Frontend

Frontend app built with React + Vite.

## Structure convention

- `src/main.jsx`: app entry point (React mount)
- `src/App.jsx`: top-level app composition (simple and short)
- `src/pages/`: page-level components (`HomePage`, later `CityPage`, etc.)
- `src/components/`: reusable UI components (`SearchBar`, `EventCard`, etc.)
- `src/services/`: API calls and HTTP helpers
- `src/config/`: frontend app configuration

## Simple rules

- Keep pages focused on composition and page data flow
- Keep reusable UI in `components`
- Put fetch/API logic in `services` (not in UI components)
- Keep `App.jsx` minimal while there is no routing

## Local development

```bash
npm install
npm run dev
```
