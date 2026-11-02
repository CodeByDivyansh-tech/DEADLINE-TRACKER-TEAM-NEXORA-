# Deadline Tracker: product audit, bug fixing, security testing and redesign

Date: 2 Nov 2026 · Branch: `audit-redesign` (not merged, not deployed) · Tests: **296 of 296 pass, run twice**

## 1. Summary
- **The login bug is fixed at its root.** The code was fine; the database was being erased. Render's free plan has no permanent disk, so every time the backend slept (15 minutes idle), restarted or redeployed, all accounts disappeared. A correct password then got "Email or password is wrong". The server now keeps a permanent copy of the database in Neon Postgres (free). **It only works after you add `DATABASE_URL` in Render** (section 9).
- **3 security problems fixed:**
  - log-in limit bypass (high);
  - missing HSTS (low);
  - config and token files downloadable (low).
- **6 other bugs fixed:**
  - wrong Today progress count;
  - phone Add box text cut off;
  - manager attention bar unstyled;
  - Workload cards broken;
  - empty log-in fields reported as a "wrong password";
  - unused code.
- **New:**
  - a welcome page with a 3D scene and a glass log-in panel;
  - password show/hide and checks before sending;
  - password change in Settings;
  - four "this week" numbers on Home;
  - softer depth on the dashboard.

## 2. The login bug: root cause
| | |
|---|---|
| Symptom | Create an account, come back later, log in with the right password → "Email or password is wrong". |
| Investigation | Read `lib/modules/auth.js`: signup lowercases and trims the email and hashes with scrypt + salt. Login does the same lookup and `timingSafeEqual`. Correct, and covered by tests. Then checked where the database lives: SQLite file `data/deadline.db` on Render, plan `free`. Render's docs: free web services have an ephemeral filesystem, spin down after 15 minutes idle, and lose local files on spin-down, restart and redeploy. Persistent disks need a paid plan; free Render Postgres expires after 30 days. |
| Root cause | The account no longer existed. The database file was erased between sign-up and log-in. Unknown emails get the same message as wrong passwords (on purpose, so nobody can probe which emails have accounts), which is why it looked like a password problem. |
| Reproduced | `tests/persist.test.js` test 1: sign up, restart on a fresh disk, log in with the right password → 401. |
| Fix | `lib/persist.js`: on start, load the saved database from Neon before opening it. A few seconds after any change, save a compressed, version-checked copy, and once more on shutdown. Uses Neon's HTTPS SQL endpoint, so no new packages. |
| Safety | Never saves before a successful load (a network problem at start can't wipe your data; the load is retried). During a redeploy the newer server wins and the older one stops saving. The connection string is never logged or returned. |
| Verified | Tests 2–5: accounts, sessions and tasks survive a wiped disk; Neon down at start; overlapping servers; no password leaks. **Not verified against real Neon** (this workspace can't reach neon.tech); check `/api/health` after deploying. |
| Limits | One server instance. Up to ~3 s of changes can be lost if the server crashes (a normal shutdown saves). The whole database is copied each time, fine up to a few MB. Neon free: 0.5 GB. |

Also tested in the full flow:
- wrong password, unknown email, empty fields (now a clear "Please enter…" instead of "wrong password"), invalid email, duplicate registration, capital letters and spaces in the email;
- expired session (refused and deleted), signed-out access to every private route (401, nothing leaked);
- log out, password change (other devices signed out).

## 3. Bug log
| # | Title | Severity | Location | Steps | Root cause | Fix | Verified by |
|---|---|---|---|---|---|---|---|
| 1 | Correct password fails after a while | Critical | Render free plan + `server.js` startup | Sign up on the live site, wait 15+ min or redeploy, log in | Ephemeral disk erased the SQLite file | `lib/persist.js` (Neon copy), async startup, health shows `persistence` | persist.test.js (5) |
| 2 | Unlimited password guesses with a fake IP | High | `lib/modules/auth.js` | With `TRUST_PROXY=true` (render.yaml), send each guess with a different `X-Forwarded-For` | Limit keyed only by IP + email, and the IP comes from a header the client can set | Extra limit: 30 tries per email per 15 min, whatever the IP | api-security "brute force" |
| 3 | No HSTS | Low | `lib/http.js`, `vercel.json` | Check response headers | Header never set | `Strict-Transport-Security` in production and on Vercel | api-security "HSTS" |
| 4 | `render.yaml` and any `.txt` in the project folder downloadable | Low (would be High for `telegram-token.txt` on the laptop) | `server.js` static files | GET `/render.yaml` → 200 | Blocklist of private paths missed `.yaml` and `.txt` | Serve only the site's file types (allowlist); token files added to `.gitignore` | api-security "private files" |
| 5 | Empty log-in says "Email or password is wrong" | Low | `auth.js`, `account.js` | Press Log in with empty fields | No check for empty fields | Server returns 400 with the field; the page checks before sending | api-accounts, auth-ui |
| 6 | "0 of 0 done" next to a task listed under Today | Medium | `src/todo.js` `todayProgress` | Have an unfinished task from yesterday; open Home | Count used only tasks dated today; the list also shows carried-over work | Count = exactly the Today list | todo, today, merge tests |
| 7 | Phone Add box example text cut off mid-word | Low | `src/part1.html` | Open Home at 390 px | One-line textarea; the placeholder wraps | Two lines while empty on phones; one line with no wrap on desktop | ui-mobile |
| 8 | Manager "N things need your attention" bar unstyled | Low | `src/part1.html` | Company workspace as manager, Home | `.heads-sum` (padding 0, transparent) overrode `.card` | `.card.attn-line` styles | today "manager Home" |
| 9 | Workload member cards broken | Medium | `src/part1.html` | Manager → Workload | Over-broad selectors (`.member li button span`, `.member .mh span`) also hit badge and avatar spans; grid items had no min-width | Scoped to direct children, `minmax(0,1fr)`, `align-content:start` | ui-company "member cards" |
| 10 | Leftover `airules` handler | Info | `src/ai.js` | n/a | No button uses it; option ignored | Removed | full suite |

## 4. Security review (own app, test accounts and local servers only; no production testing)
| Area | Result |
|---|---|
| Password storage | scrypt with a random salt per user, 128-char hash; plain passwords never stored or logged. Pass. |
| Sessions | random token, only its SHA-256 stored; cookie HttpOnly, SameSite=Lax, Secure in production, 30 days; logout deletes; password change signs out other devices; expired sessions deleted. Pass. |
| Brute force | **Fixed (bug 2).** Now 10 per IP + email and 30 per email per 15 min; sign-up 20 per IP. |
| Access control / IDOR | every private query uses the session's user id; another user's task → 404 for read, change and delete; admin routes 403 for users; admin answers contain no task contents or hashes. Pass. |
| XSS | code review of every template: user text goes through `esc()` or `textContent`. Browser test with payloads in title, notes, user name and workspace name on 7 pages, the drawer and the admin page: no script ran. CSP blocks other origins (still allows inline scripts because the app is one file). Pass. |
| CSRF | changes need same-origin (or an `ALLOWED_ORIGINS` site); SameSite=Lax cookie; JSON-only bodies. Cross-site POST → 403. Pass. |
| CORS | no `Access-Control-Allow-Origin`; preflights refused. Pass. |
| Secrets | Gemini key, Neon URL and admin email only in env vars; never in pages or responses (tests). Telegram token file now git-ignored and never served. |
| Headers | CSP, nosniff, X-Frame-Options DENY, Referrer-Policy, COOP, Permissions-Policy; **HSTS added**. |
| Files and uploads | path traversal and encoded tricks → 404; only site file types served. The only upload is admin knowledge text (admin-only, 3 MB limit, stored as text). |
| Logs | errors kept 30 days, no passwords or tokens; the persistence error text has the connection string removed. |
| Dependencies | no runtime npm packages (Node built-ins only); Playwright is test-only. |
| Accepted risk | Sign-up says when an email already has an account (needed to be helpful; rate-limited). The "Viewing as" role switch in company workspaces is a **prototype simulation in the browser**: it says so on screen, and the server doesn't enforce team roles (each account's data is private to that account). |

## 5. UI/UX and 3D changes
- **Welcome page:** headline and one-line promise, plus three feature cards. A 3D scene of floating glass cards (sample task, weekly ring, reminder, checklist) uses CSS perspective and depth with a gentle float, and tilts slightly with the pointer. It is hidden from screen readers, stops under reduced motion, and is hidden on phones and tablets so the log-in panel comes first.
- **Glass log-in panel:**
  - tabs that keep the typed email;
  - password show/hide button (44 px, labelled, `aria-pressed`);
  - checks before sending, with `aria-invalid` and focus on the field;
  - clear server errors; the wrong password is cleared;
  - a gradient button with white text at ≥ 4.5:1 contrast.
- **Settings:** "Change password" with show/hide, checks and a confirmation.
- **Home:** four numbers (due this week, at risk, overdue, done in 7 days) as small glass tiles inside the greeting panel; each opens the deadline list. Home stays at four blocks (Part A's calm-Home rule). Soft depth on cards; hover states.
- Screenshots checked:
  - welcome page at 1440, 820 and 390 px;
  - Home in light, dark and 390 px, for student and manager;
  - Workload, Needs attention and Reports.
- Sweep: every page for student, manager, employee and personal at 1440 and 390 px: no browser errors, no sideways scrolling.

## 6. Performance and reliability
- The page is one file (no framework), about 20 KB larger (5%) for the welcome page, password form, Home numbers and fixes. 3D uses CSS transforms only (GPU-friendly), animates 4 elements, and the pointer tilt is throttled to one update per frame.
- Saving to Neon: a check every 3 s (`total_changes()`, microseconds); copy and upload only after a change, never two at once, one final save on shutdown.
- Free-plan cold start: up to ~1 minute on Render (the app shows "Starting up…"), plus the Neon load (normally under a second).

## 7. Test results
| Kind | Result |
|---|---|
| Automated, full suite | **296 / 296 pass**, run twice (`npm test`) |
| New tests this round | persist 5, api-security 6, auth-ui 8, api-accounts +3, today +2, todo +1, ui-mobile +1, ui-company +1 |
| Manual (screenshots, role sweep) | Pass; problems found were fixed (bugs 6–9) |
| Not tested | real Neon, real Render/Vercel after deploy, real Gemini, Safari/Firefox, a screen reader walkthrough, load testing |

## 8. Incomplete features and risks
- **Needs your action:** `DATABASE_URL` in Render (section 9). Until then the live site keeps losing accounts.
- Team workspaces are not shared between accounts (the role switch is a prototype); real invites need a shared-workspace backend.
- Reminders reach you only inside the app (bell). Email and Telegram delivery are not built (they need a provider or bot token).
- On the free plan the server sleeps; reminders made while it sleeps arrive when it wakes.
- One server instance only (limits and the reminder job live in the process).
- 3D scene and glass effects need a modern browser; older browsers get flat panels (still usable).

## 9. Deployment (after you approve the merge)
1. **Neon (free, no card):** neon.tech → sign up → Create project → **Connect** → copy the connection string `postgresql://…`.
2. **Render:** service → Environment → add `DATABASE_URL` = that string → Save.
3. **Merge:** merge branch `audit-redesign` into `main` on GitHub. Render and Vercel deploy automatically.
4. **Check:** open `https://deadline-tracker-api.onrender.com/api/health`. It should show `"persistence": {"mode": "neon", "restored": true, "ok": true}`. Then create an account on the Vercel site, wait 20 minutes (the server sleeps), and log in again: it should work.
5. Existing live accounts were already erased by the old setup, so people need to sign up once more. From then on, accounts are kept.
