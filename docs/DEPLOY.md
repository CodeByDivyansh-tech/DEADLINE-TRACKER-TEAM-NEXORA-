# Setting up and deploying Deadline Tracker

## Requirements
- **Node.js 22.5 or newer** (Node 24 recommended). Nothing else to install for the server: it uses Node's built-in SQLite.
- Optional: a free Google Gemini API key for Deadline AI Help.

## Run it on your computer (Windows, Mac or Linux)
1. Open a terminal in the project folder.
2. Copy the example settings: Windows `copy .env.example .env`, Mac/Linux `cp .env.example .env`.
3. (Optional) Get a free Gemini key at https://aistudio.google.com/apikey and paste it after `GEMINI_API_KEY=` in `.env`.
4. Start it: `node build.js` then `node server.js`.
5. Open the link it prints (for example http://localhost:8000). Create an account. **The first account is the admin**; the admin dashboard is at `/admin`.

The database is created automatically in `data/deadline.db` and updated by migrations on every start. **Back it up** by copying the `data` folder while the server is stopped. To start completely fresh, stop the server and delete the `data` folder.

Tests: `npm install` (once, for Playwright), then `npm test`.

## Your current hosting
Right now the app runs on your laptop at localhost. Only you can open it, and reminders are only created while the server is running. To let others use it, or to get reminders while your laptop is off, run it on a host.

## Deploying to a host
Any host that runs Node 22.5+ works if it keeps a **persistent disk** (SQLite is a file) **or** you set `DATABASE_URL` to a Neon database (see step 3 below). Free/cheap options: a small VPS, Render (with a persistent disk), Railway (with a volume), Fly.io (with a volume). Static-only hosts such as GitHub Pages or Netlify can't run the backend.

Settings on the host (environment variables, never in GitHub):
```
NODE_ENV=production        # HTTPS cookies, listen on 0.0.0.0
PORT=<the port the host gives you>
DATA_DIR=/var/data         # the persistent disk's path
TRUST_PROXY=true           # behind the host's load balancer
GEMINI_API_KEY=<your key>
ADMIN_EMAIL=<your email>
```
Start command: `node build.js && node server.js`. Health check path: `/api/health`.
Keep **one** server instance (the reminder job and rate limits run inside the process; SQLite is one file).

### Render (example)
1. Push the project to GitHub (`.env` and `data/` are already in `.gitignore`).
2. New → Web Service → your repo. Runtime Node. Build command `npm install --omit=dev || true`. Start command `node build.js && node server.js`.
3. Add a Disk mounted at `/var/data`; set `DATA_DIR=/var/data`.
4. Add the environment variables above. Set Health Check Path `/api/health`.

### A VPS (Ubuntu example)
1. Install Node 24, copy the project, create `.env` with the production values.
2. Run it with a process manager (for example `pm2 start "node server.js" --name deadline-tracker`, or a systemd service).
3. Put Nginx or Caddy in front for HTTPS (Caddy gets certificates automatically) and set `TRUST_PROXY=true`.

## Frontend on Vercel + backend on Render (this repo is set up for it)
The browser only ever talks to the Vercel address. Vercel forwards every `/api/...` request to Render (`vercel.json` → `rewrites`), so log-in cookies work and there's no cross-site setup.

**1. Backend on Render**
1. Render → New → **Blueprint** → choose this GitHub repo. It reads `render.yaml` and creates `deadline-tracker-api`.
2. Fill in the secret values it asks for: `GEMINI_API_KEY` (optional), `ADMIN_EMAIL`, and `ALLOWED_ORIGINS` = your Vercel address (you can add this after step 2).
3. Wait for "Live", then open `https://<your-service>.onrender.com/api/health`; it should say `"ok": true`.

**2. Frontend on Vercel**
1. If your Render address isn't `https://deadline-tracker-api.onrender.com`, change it in `vercel.json` and push.
2. Vercel → Add New → Project → import this repo → Deploy (settings come from `vercel.json`).
3. Copy the Vercel address into Render's `ALLOWED_ORIGINS`, then open the Vercel address and create your account.

**3. Keep accounts and tasks permanently (Neon, free) — required on Render's free plan**
Render's free plan has **no persistent disk**: the database file is erased whenever the service sleeps (15 minutes without visits), restarts or redeploys. Without the step below, accounts disappear and a correct password then fails with "Email or password is wrong". This was the cause of the login bug.
1. Go to <https://neon.tech> → sign up (free, no card) → **Create project** (any name, region close to your Render region).
2. On the project dashboard click **Connect**, copy the connection string (`postgresql://...neon.tech/neondb?sslmode=require`).
3. Render → your service → **Environment** → add `DATABASE_URL` = that string → Save (Render redeploys).
4. Open `https://<your-service>.onrender.com/api/health`. It should show `"persistence": {"mode": "neon", "restored": true, "ok": true}`.

How it works: the server still uses SQLite while running. On start it loads the saved copy from Neon before opening the database; a few seconds after any change it saves a compressed copy back (and once more on shutdown). It talks to Neon over HTTPS, so no extra packages. Safety: it never saves before the saved copy has loaded, so a network problem at start can't overwrite your data; if two servers overlap during a redeploy, the newer one wins.
Limits: keep one instance; a change made in the last ~3 seconds before a crash (not a normal shutdown) can be lost; the whole database is copied each time, which suits databases up to a few MB (the health check warns above 8 MB). Neon's free plan includes 0.5 GB storage.
The connection string is a password: keep it only in Render's Environment, never in GitHub or the frontend. The server never prints it.

**If `/api/health` shows `"fallback": true` or `"ok": false` under `persistence`:** the server started but can't use Neon, so nothing is being saved permanently. The `error` line says why. Common causes: the value was pasted with extra text (the server now removes `psql '...'`, quotes and `DATABASE_URL=` itself), a typo in the password, or the Neon project was deleted. Fix the value in Render → Environment; Render redeploys. (Before 3 Nov 2026 the server waited for Neon forever and never started, so every Render deploy failed after 15 minutes and the old server kept running.)

**4. "Forgot password?" emails (optional, free)**
1. Sign up at <https://www.brevo.com> (free: 300 emails a day). Add and verify a sender address (Senders & IP → Senders); a Gmail address works, no domain needed.
2. SMTP & API → API keys → create a key.
3. Render → Environment: `EMAIL_PROVIDER=brevo`, `EMAIL_API_KEY=<the key>`, `EMAIL_FROM=Deadline Tracker <the verified address>`, `PUBLIC_URL=https://<your Vercel address>`.
4. `/api/health` shows `"email": {"configured": true}`. Without these, "Forgot password?" tells people to ask the admin, and the admin page (Users → Reset link) makes a one-time link to send them.

**Other Render free plan limits:**
- The service **sleeps after 15 minutes without visits**; the next visit takes up to a minute (the app shows "Starting up…"). While it sleeps, the reminder job doesn't run; reminders catch up when it wakes.

## Gemini free tier notes
- The server uses `gemini-3.5-flash-lite` for answers and `gemini-embedding-001` for search. Google's pricing page lists both as free of charge on the free tier (checked November 2026). Google doesn't publish fixed free-tier limits any more; your actual limits are shown in Google AI Studio for your project.
- The server keeps its own limits below the free tier (`GEMINI_RPM`, `GEMINI_RPD`, `AI_USER_DAILY`) and pauses after a quota error. There is no paid fallback. Don't link a billing account to the key's project if you want to be sure it stays free.
- Google may use free-tier prompts to improve its products. That's why only public help text and the Help question are ever sent; tasks never are.

## Moving to PostgreSQL later
All SQL lives in the modules under `lib/` and uses standard statements with parameters. To scale to several server instances, move the database to PostgreSQL, move the reminder job to a single worker, and move rate limits to a shared store such as Redis.
