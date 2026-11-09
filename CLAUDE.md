# Deadline Tracker: project guide for Claude Code

A deadline + to-do app for students, companies and personal use, with a Node + SQLite backend (accounts, task API, reminder job, private planning engine, admin) and Deadline AI (My Plan + Help with Google Gemini), light/dark glass UI.
Core promise: **Talk to the assistant → it understands your work → it builds your to-do list → you track progress → the app reminds you.**
Owner: Divyansh (India, Asia/Kolkata). Windows laptop.

## Commands
```
npm install                      # first time (Playwright, for tests only)
npx playwright install chromium  # first time
npm run build                    # src/ -> index.html
npm test                         # build + every test
npm run test:api                 # backend tests only (fast)
node server.js                   # backend + app: http://localhost:8000 (settings in .env, see .env.example)
```
Node 22.5+ is required (built-in `node:sqlite`). `serve.ps1` only serves the page (no accounts, no backend); prefer `node server.js`.
Docs: `docs/ARCHITECTURE.md` (modules, schema, rules), `docs/API.md`, `docs/DEPLOY.md`.

## Architecture
- **Backend** (`server.js`, `lib/`): plain Node, no packages. SQLite file in `data/` with numbered migrations (`lib/db.js`). Modules: `auth` (scrypt passwords, HttpOnly session cookie storing only a SHA-256 of the token), `tasks` (task API + `/api/state` bridge: the app saves its whole state, the server writes tasks to the `tasks` table and the rest to `app_state`), `productivity` + `parse` + `plan` (My Plan: rule-based engine, suggestions saved only via `/api/plan/apply` after the user confirms), `notifications` (reminder job every minute, time-zone aware, deduped by key), `stats`, `conversations`, `admin`, `ai/gemini` (free-tier client with our own limits), `ai/rag` (chunks + Gemini embeddings in SQLite + BM25), `ai/help` (Help answers). Admin dashboard: `admin.html` at `/admin`.
- **Frontend:** single-page app, no framework. `build.js` concatenates `src/` in this order into `index.html`:
  `part1.html` (markup + CSS) → `part2.js` (utils, state, engines, `parseQuick`, storage) → `part3.js` (icons, nav, render core, views) → `todo.js` (to-do views, reminders, bell) → `ai.js` (My Plan assistant: server engine or browser rules) → `account.js` (login screen, server save/load, notifications from the server, profile sync) → `widget.js` (floating Deadline AI window: Help + My Plan) → `motion.js` (GSAP panel animations: sidebar rail, AI window, heads-up panel, card reveals, log-in tabs) → `portal.js` (landing page before log-in) → `part4.js` (modals, handlers, onboarding, boot). GSAP itself (`vendor/gsap.min.js`, GreenSock's free standard licence) is inlined by `build.js` before the app; the app works without it.
  One IIFE. The build writes `index.html` (markup + CSS) plus `assets/gsap.<hash>.js` and `assets/app.<hash>.js` (loaded with `defer`, cached for a year by the server and Vercel), and `standalone.html` (everything inline, for one-file previews). **Edit `src/`, never `index.html`, `assets/` or `standalone.html`.** `render()` rebuilds views from HTML strings; clicks are delegated via `data-act`.
- **Two ways the app runs:** with the server (`/api/me` answers) → log-in screen, `Store.mode = "server"`, data from the account, reminders from the server job; without it (claude.ai, plain file server, tests) → saves in the browser, reminders from `runReminders()` while the tab is open, planning with browser rules.
- **AI:** Google Gemini **only**, through the server (`GEMINI_API_KEY` in `.env`). Used **only for Help**, which is a general assistant (any subject: coding, maths, science, studies, everyday questions) that answers Deadline Tracker questions only from the knowledge base (`NOT_IN_GUIDE` otherwise). Answers are plain Markdown (code blocks, tables), never a JSON wrapper (that cut long answers off). **Never send users' tasks, schedules or private data to Gemini** (free-tier data may be used by Google). My Plan uses the server's own engine. No Anthropic or other paid AI APIs, no paid fallbacks.

## Rules (must follow)
1. **Test-first.** Write or adjust tests in `tests/` before changing behaviour, run them red, implement, run green. Run the **full suite twice** before calling something done.
2. Tests run real Chromium with the clock fixed at **Fri 30 Oct 2026 12:00 IST** (`tests/helpers.js`). Use `?dt-test` (`window.__DT_TEST__`) to reach internals. Use `go(page, route)`, which waits for the fade-in.
3. **Never invent dates, times or task details.** Missing date → no date.
4. **No secrets in the frontend.** Keys and tokens live only in `.env` on the server (in `.gitignore`, never served). Every private query is scoped by the session's user id; another user's id returns 404.
5. **Never move a hard deadline automatically.** Only after explicit user approval, with the change shown.
6. **No fake features.** Unconnected integrations aren't shown as connected; limits are stated plainly.
7. Keep both themes readable (tests check contrast) and the phone layout free of sideways scrolling (tests check every page at 390px).
8. After UI changes, take screenshots (light, dark, 390px phone) with Playwright and look at them; tests don't catch visual problems.
9. Backend changes need API tests (`tests/api-*.test.js`, `tests/srv.js` starts a real server with a fake Gemini). Schema changes go in a new numbered migration in `lib/db.js`, never by editing an old one.
10. UI copy: plain words, short sentences, no jargon. Simplicity over features.

## Design
Identity "Portale" (since 9 Nov 2026, see `docs/DESIGN-SYSTEM.md`): tokens at the top of `src/part1.html` (light: white `#ffffff`, ink `#151515`, steel `#99b6d2` with `--steel-ink` `#46617a` for text; dark: neutral near-black `#0d0e0f`, steel light). Font Geist / Geist Mono. Main buttons are ink pills (`--btn`), glass is soft grey. The shared design layer is "Design system v3" at the end of the stylesheet (over v2). Landing page for logged-out visitors: `src/portal.js` + the "Landing page" CSS block (skipped on `?dt-test` pages unless `&dt-landing`). GSAP motion in `src/motion.js`. Sounds: `sfx()` in `part4.js`. Never use navy, indigo or violet; blues only as soft steel (tests check).

## Status
Part A (merged task model, one Add box, calm Today, short sidebar, manager queue) is done. Backend done: accounts, task API, reminders while the app is closed, planning engine, Gemini Help with RAG, admin, statistics.
Next ideas: Telegram/email delivery for reminders (needs a bot token or email provider in `.env`), team invites with real shared workspaces, PostgreSQL for several server instances.

## Files you'll touch most
`lib/modules/*.js`, `lib/ai/*.js` (backend) · `src/part2.js` (`parseQuick`, `mkItem`, engines) · `src/ai.js` (`rulesPlan`, assistant UI) · `src/account.js`, `src/widget.js` · `src/todo.js` (to-do views, reminders) · `src/part3.js` (views, nav, overview) · `src/part4.js` (handlers, drawer, quick add) · `src/part1.html` (CSS) · `tests/*.test.js`.
After each piece of work, update `TEST-REPORT.md` (what was tested, bugs found, what's not covered).
