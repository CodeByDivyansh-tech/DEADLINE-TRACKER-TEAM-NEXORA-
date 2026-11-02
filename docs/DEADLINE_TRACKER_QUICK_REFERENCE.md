# Deadline Tracker: Quick Reference (Team Nexora)

**Live:** https://deadline-tracker-team-nexora.vercel.app · **Admin:** /admin · **Code:** github.com/CodeByDivyansh-tech/DEADLINE-TRACKER-TEAM-NEXORA-

## In one line
A task app that tells you **whether you'll finish on time**, not just what is due.

## 30-second intro
Students rarely forget deadlines completely; we start too late or have three in one week. Deadline Tracker lets you type tasks naturally ("Java assignment due Friday 5pm ~4h"), compares the work left with the hours you have, and warns early with the reason. Deadline AI plans your day from your own tasks, and the server reminds you even when the app is closed.

## Main features (all working)
- **One Add box:** several tasks at once, deadlines vs to-dos, effort `~3h`, priority `!high`, Hinglish, typos
- **Today page:** today's tasks, next deadlines, progress check-ins
- **Deadline Radar:** On track → Overdue, **with the reason** (clear rules, not AI)
- **Planning:** backward plan, study planner, clash warnings, calendar drag, **Rescue mode** (steps, schedule, extension message you send yourself)
- **Deadline AI:** **My Plan** (private planning on our server, you approve) + **Help** (Gemini + help guide, with sources)
- **Reminders:** server job every minute, in your time zone, even while the app is closed (bell + desktop alerts)
- **Accounts, Reports and statistics, admin dashboard, light/dark theme, phone layout, .ics export, backup**

## USP
Warns **before** you fall behind, **explains why**, **plans the fix**, and your tasks **never go to an outside AI**.

## Tech stack
Plain JavaScript/HTML/CSS (no framework) · Node.js 22.5+ built-ins (no npm runtime packages) · SQLite · Vercel (frontend) + Render (backend) · Google Gemini free tier (`gemini-3.5-flash-lite`, `gemini-embedding-001`) · 269 automated tests (Playwright + Node test runner)

## Security in one breath
scrypt password hashes · HttpOnly + SameSite + Secure session cookie · every query limited to the logged-in user · AI key only on the server · input validation + parameterised SQL · rate limits · CSP

## Top answers
| Question | Answer |
|---|---|
| Why not Google Calendar? | It shows when; we check if the remaining work fits, warn early and plan the fix. You can export to Calendar too. |
| Does AI see my tasks? | No. My Plan uses our rules on our server; Gemini only gets Help questions + public guide text. |
| Does AI change tasks by itself? | Never. It suggests; you click Save; the server re-checks. |
| How is risk calculated? | Work left (estimate × (1 − progress)) vs hours available before the due date. |
| Gemini down or over the limit? | Help answers from the guide and says so; My Plan keeps working; no paid fallback. |
| Biggest limits? | Free Render: data resets on redeploy and the server sleeps; reminders in-app only; teams aren't real invites yet. |
| What's next? | Persistent DB, email/Telegram reminders, shared teams, calendar sync, phone app. |

## Never say
"AI does all planning" · "we send email/WhatsApp reminders" · "no one else can do this" · made-up user numbers.
