<p align="center"><img src="logo.svg" width="96" alt="Deadline Tracker logo"></p>

# Deadline Tracker

A planner that tells you **whether you'll finish on time**, not just what's due. For students, teams and personal life.

- Tasks and deadlines with a risk radar, backward planning, clash warnings and progress check-ins
- **Accounts**: your tasks are saved on the server, private to you
- **Reminders that arrive even while the app is closed** (in the bell, in your time zone)
- **Deadline AI**
  - *My Plan*: "plan my tomorrow", "I have too much work", "kal Java assignment submit karna hai" → suggestions you confirm. Runs on your own server; your tasks never go to an outside AI.
  - *Help*: questions about the website, answered from the help guide with Google Gemini (free tier). Says "I don't know" instead of guessing.
- Admin dashboard (`/admin`): users, help guide and FAQs, unanswered questions, AI usage, errors
- Statistics on the Reports page

## Start
Needs **Node.js 22.5 or newer**.
```
copy .env.example .env      (Mac/Linux: cp .env.example .env)
node build.js
node server.js
```
Open the link it prints and create an account (the first account is the admin).
To turn on Gemini for Help, put a free key from https://aistudio.google.com/apikey in `.env` as `GEMINI_API_KEY=...` and restart.

More: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · [docs/API.md](docs/API.md) · [docs/DEPLOY.md](docs/DEPLOY.md)

## Tests
```
npm install
npx playwright install chromium
npm test
```
