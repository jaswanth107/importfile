# importfile

CSV/XLSX bulk import tool. React + Vite client, Express + Prisma (Postgres) server.

## Local development

Requires a local Postgres instance reachable at the URL in `server/.env`.

```powershell
npm install
npm run dev:server   # http://localhost:4000
npm run dev:client   # http://localhost:5173
```

Vite's dev server proxies `/api` to `http://localhost:4000` (see `client/vite.config.ts`), so the frontend code always uses relative `/api/...` paths.

## Deployment

Backend on **Render**, frontend on **Vercel**.

### Backend (Render)

This repo includes a `render.yaml` Blueprint that provisions:
- A free Postgres database (`importfile-db`)
- The backend as a native Node web service (`importfile-backend`) — no Docker involved. It runs `prisma migrate deploy` on every deploy before starting the server.

Steps:
1. In the Render dashboard: **New** → **Blueprint** → select this GitHub repo. Render reads `render.yaml` and provisions the database and backend.
2. Once live, note the backend's actual URL (Render appends a suffix if `importfile-backend` is already taken elsewhere).
3. Health check: `https://<your-backend>.onrender.com/api/health`

Notes:
- Render's free Postgres plan expires after 30 days unless upgraded — fine for testing, not for anything long-lived.
- Free web services spin down after inactivity and cold-start on the next request.
- No secrets are committed; `DATABASE_URL` is injected by Render from the database resource automatically.

### Frontend (Vercel)

1. In Vercel: **Add New** → **Project** → import this GitHub repo.
2. Set **Root Directory** to `client`.
3. Framework preset: Vite (Build Command `npm run build`, Output Directory `dist` — Vercel usually detects these automatically).
4. Deploy.

`client/vercel.json` rewrites `/api/*` requests to the Render backend, so the frontend's existing relative API calls keep working with no code changes. If your backend's actual Render URL differs from `https://importfile-backend.onrender.com` (see step 2 above), update the `destination` in `client/vercel.json` to match, then push — Vercel redeploys automatically.
