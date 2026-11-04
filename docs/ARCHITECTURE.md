# Deadline Tracker: architecture

## What was there before
- A single-page web app (`index.html`, built from `src/` by `build.js`): plain HTML, CSS and JavaScript, no framework.
- Data saved in the browser (localStorage) or, on claude.ai, in the artifact's storage.
- A small Node server that only served the page.

## What the backend adds, and why this design
The project already used **Node.js** with no packages, and runs on a Windows laptop. So the backend stays in Node and uses only built-in modules:

| Need | Choice | Why |
|---|---|---|
| Web server | `node:http` with a small router (`lib/http.js`) | No install step; easy to read |
| Database | **SQLite** via `node:sqlite` (Node 22.5+) | A real SQL database in one file, nothing to install; easy to move to PostgreSQL later |
| Passwords | `scrypt` (`node:crypto`), random salt per user | Modern memory-hard hash, built in |
| Sessions | Random 256-bit token in an HttpOnly, SameSite=Lax cookie; only its SHA-256 is stored | Can't be read by page scripts; stolen database rows can't be replayed |
| Reminders | Background job inside the server process (every minute) | Works while the app is closed; no extra service |
| AI | Google Gemini API, free tier only | As required; called only from the server |
| Search for Help | Gemini embeddings + vectors stored in SQLite + keyword (BM25) search | Real semantic search without a separate vector database |

The existing app keeps working: it still loads and saves "the whole state" through `/api/state`, but the server splits that state so **tasks live in their own table** (with constraints and indexes) and everything else (workspaces, settings, chat) in `app_state`. The task API, reminder job, planning engine and statistics all read the same tasks table.

## Modules
```
server.js                 wiring, request handling, security headers, static files
lib/config.js             settings from environment variables / .env
lib/db.js                 SQLite connection + numbered migrations
lib/persist.js            optional permanent copy of the SQLite file in Neon Postgres (DATABASE_URL), for hosts that wipe the disk
lib/http.js               JSON helpers, validation, rate limiter, router
lib/time.js               time-zone maths (no packages)
lib/modules/auth.js       registration, login, logout, sessions, profile, password change
lib/modules/tasks.js      task API, ownership checks, /api/state bridge
lib/modules/productivity.js  scheduling rules (no AI): schedule, prioritise, day plan, organise, breakdown, workload
lib/modules/parse.js      reads typed text (English + Hinglish) into task suggestions
lib/modules/plan.js       My Plan chat: suggestions + confirm-then-save (/api/plan/*)
lib/modules/notifications.js  reminder job + notification API
lib/modules/conversations.js  chat history
lib/modules/stats.js      productivity statistics
lib/modules/admin.js      admin-only routes
lib/ai/gemini.js          Gemini client: free-tier model, our limits, quota/error handling, usage log
lib/ai/rag.js             knowledge base: chunk, embed, store vectors, hybrid retrieval
lib/ai/help.js            Help answers (website from the guide; general productivity tips)
lib/ai/format.js          tidies answers: money in the person's currency (₹ with Indian grouping by default), no code fences or stray labels
admin.html                admin dashboard (uses /api/admin/*)
knowledge/*.md            the help guide loaded on first run
```

## Permanent storage on hosts without a disk (lib/persist.js)
Render's free plan erases the disk on sleep, restart and redeploy. With `DATABASE_URL` set, `server.js` first loads the saved copy of `deadline.db` from a Neon table (`dt_snapshot`: one row with the gzip+base64 file and a version number), then opens SQLite as usual. It checks `total_changes()` every 3 s; after a change it makes a consistent copy with `VACUUM INTO`, compresses it and saves it with a version-checked `UPDATE` (Neon's HTTPS SQL endpoint, no driver). One last save runs on SIGTERM.
Rules: never save before the load succeeded (load is retried); on a version conflict the server that started later wins and the older one stops saving; the connection string is never logged or returned. Limits: one instance; up to ~3 s of changes can be lost in a crash; best for databases up to a few MB.

## Privacy rules built into the design
- Every query on private data includes `user_id = ?` taken from the session, never from the request. Someone else's task id returns 404.
- **My Plan never uses an outside AI.** Planning with a person's tasks runs in `productivity.js` on your server.
- **Gemini only sees public text**: the Help question, the recent Help conversation, and matching parts of the public help guide. Never tasks or schedules. Google may use free-tier requests to improve its products; the Help window says so.
- Suggestions are stored on the server; `/api/plan/apply` re-checks ownership and validates every field before writing. Only `keep`, `title`, `date`, `time` and `priority` can be edited by the browser.
- Admins manage accounts and public knowledge; they can't read other people's tasks.
- Log-in limits: 10 tries per IP + email and 30 per email per 15 minutes (the second can't be dodged with a fake `X-Forwarded-For`). Only the site's file types are served (.html, .css, .svg, .png, .ico, .webmanifest). HSTS in production.

## Database schema
All times are UTC milliseconds unless noted. Local dates (`YYYY-MM-DD`) and times (`HH:MM`) are in the user's time zone.

**users**: `id` PK · `email` UNIQUE · `name` · `pass_hash` · `salt` · `role` (user/admin, CHECK) · `timezone` (IANA) · `notify_prefs` (JSON) · `disabled` · `created_at` · `updated_at`

**sessions**: `token_hash` PK (SHA-256) · `user_id` → users ON DELETE CASCADE · `created_at` · `expires_at` (30 days)

**app_state**: `user_id` PK → users · `json` (workspaces, settings, chat; no tasks) · `version` (optimistic locking) · `updated_at`

**tasks**: `id` PK · `user_id` → users CASCADE · `workspace_id` · `title` (1–200) · `description` · `due_date` · `due_time` · `due_at` (UTC) · `plan_date` · `plan_time` · `priority` (high/medium/low) · `status` (todo/doing/review/blocked/done) · `category` · `estimate_hours` · `progress` (0–100) · `reminders` (JSON minutes) · `extra` (JSON: milestones, links, log…) · `created_at` · `updated_at` · `completed_at`
Indexes: (user_id, status), (user_id, due_at), (user_id, plan_date), (due_at) for open tasks.

**notifications**: `id` PK · `user_id` → users CASCADE · `task_id` → tasks SET NULL · `kind` (reminder/due_today/overdue/summary/high_done) · `message` · `scheduled_at` · `delivery_status` (pending/delivered/skipped/cancelled) · `delivered_at` · `read_at` · `channel` (in_app) · `dedupe_key` · UNIQUE(user_id, dedupe_key)

**conversations**: `id` PK · `user_id` → users CASCADE · `kind` (help/plan) · `title` · `created_at` · `updated_at`
**messages**: `id` PK · `conversation_id` → conversations CASCADE · `role` (user/assistant) · `text` · `meta` (JSON: sources, proposal, via) · `created_at`

**kb_sources**: `id` PK · `kind` (doc/faq) · `title` · `body` · `source` · `updated_at` · `indexed_at`
**kb_chunks**: `id` PK · `source_id` → kb_sources CASCADE · `ord` · `heading` · `text` · `embedding` (BLOB, Float32 vector) · `embed_model`

**questions** (Help questions for the admin): `id` · `user_id` → users SET NULL · `question` · `answer` · `answered` (0 no, 1 yes, 2 resolved) · `sources` · `rating` (−1/1) · `via` · `created_at`

**ai_usage**: `id` · `user_id` · `kind` (chat/embed) · `model` · `status` (ok/quota/error/limited) · tokens · `latency_ms` · `error` · `created_at`
**error_log**: `id` · `area` · `message` · `detail` · `created_at` (kept 30 days)
**settings**: `k` PK · `v` (AI instructions, seed flag)
**schema_migrations**: `version` PK · `name` · `applied_at`

## Reminder rules
Every minute (and right after a task changes) the job works out which notifications each user should have and stores them with a scheduled time and a unique key, so nothing is ever sent twice:
- **reminder**: the task's own reminder times, or the user's defaults (1 day and 1 hour before). If the server was off and several are due at once, only the latest is delivered; the rest are marked *skipped*.
- **due_today**: 08:00 local time on the due day (or 1 hour before, if earlier).
- **overdue**: when the deadline passes.
- **summary**: from 08:00 local time, "You have N pending tasks today", once a day.
- **high_done**: "You've completed all your high-priority tasks for today", once a day.
Finishing, deleting or moving a task cancels its pending notifications. Delivery is in-app (the bell) plus desktop alerts while the app is open. Email and phone push would need extra services (an email provider, or web-push keys and a service worker) and aren't configured.

## Productivity engine rules
- Work left = estimate × (1 − progress). No estimate means "add an estimate"; it is never guessed.
- Hours available = hours per day on work days (Settings → Availability); today counts only what's left of the day.
- Work is spread over the days before each deadline, earliest deadline first, at most 2 h per task per day.
- A day is overloaded when its planned work is more than its hours.
- Priority order: overdue → soonest deadline → priority → most work left. Each suggestion shows its reason.
