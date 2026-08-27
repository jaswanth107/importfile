# importfile

CSV/XLSX bulk import tool. React + Vite client, Express + Prisma (Postgres) server.

## Local development (without Docker)

Requires a local Postgres instance reachable at the URL in `server/.env`.

```powershell
npm install
npm run dev:server   # http://localhost:4000
npm run dev:client   # http://localhost:5173
```

## Local development (with Docker)

Requires Docker Desktop with the WSL2 backend enabled.

```powershell
docker compose up --build
```

This starts a Postgres container and the backend container together:
- Backend: http://localhost:4000
- Health check: http://localhost:4000/api/health

Other useful commands:
```powershell
docker compose down            # stop everything
docker compose logs -f         # tail logs
docker compose build --no-cache # force a clean rebuild
```

The frontend still runs outside Docker via `npm run dev:client` (Vite's dev server proxies `/api` to `http://localhost:4000`, see `client/vite.config.ts`).

## Deploying to Render

This repo includes a `render.yaml` Blueprint that provisions:
- A free Postgres database (`importfile-db`)
- The backend as a Dockerized web service (`importfile-backend`)
- The frontend as a static site (`importfile-frontend`), with `/api/*` requests rewritten/proxied to the backend

### Steps
1. Push this repo to GitHub (already done).
2. In the Render dashboard: **New** → **Blueprint**, select this repo. Render reads `render.yaml` and provisions all three resources.
3. Wait for the backend and database to finish deploying first (the backend runs `prisma migrate deploy` on startup).
4. Once both services are live, confirm their actual URLs (Render may append a suffix if `importfile-backend`/`importfile-frontend` are already taken). If either name differs from the default, update to match:
   - `render.yaml` → `CORS_ORIGIN` (backend env var) → your actual frontend URL
   - `render.yaml` → `routes[0].destination` (frontend) → your actual backend URL
   - Commit and push; Render redeploys automatically.

### Notes
- Render's free Postgres plan expires after 30 days unless upgraded to a paid plan — for anything beyond a demo, plan to upgrade before then.
- Free web services spin down after inactivity and cold-start on the next request.
- No secrets are committed; `DATABASE_URL` is injected by Render from the database resource automatically.
