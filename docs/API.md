# Deadline Tracker API

Base URL: the server (for example `http://localhost:8000`). All request and response bodies are JSON.
Requests that change something must send `Content-Type: application/json`, and requests from other websites are refused.
Errors look like `{ "code": "invalid_title", "error": "Readable message", "field": "title" }` with a suitable HTTP status
(400 invalid input, 401 not logged in, 403 not allowed, 404 not found or not yours, 409 conflict, 413 too large, 415 not JSON, 429 too many requests, 5xx server or AI service problem).

**Authentication**: log in or sign up; the server sets an HttpOnly cookie `dt_session` (30 days). Send it with every request (browsers do this automatically). 🔒 = needs login, 🛡 = admin only.

## Health
| Method | Path | |
|---|---|---|
| GET | `/api/health` | `{ ok, version, database, reminders.lastRun, ai.configured, ai.model }` (503 if the database fails) |
| GET | `/api/status` | `{ accounts: true, ai, provider: "gemini", model }` |

## Accounts and profile
| Method | Path | Body / notes |
|---|---|---|
| POST | `/api/auth/signup` | `{ name, email, password (8–200), timezone? }` → 201 `{ user }` + cookie. The first account becomes admin. |
| POST | `/api/auth/login` | `{ email, password, timezone? }` → `{ user }` + cookie. 10 wrong tries in 15 min → 429. |
| POST | `/api/auth/logout` | Ends this session. |
| GET | `/api/me` | `{ user }` or `{ user: null }` |
| GET 🔒 | `/api/profile` | `{ user: { id, email, name, role, timezone, notifyPrefs } }` |
| PATCH 🔒 | `/api/profile` | `{ name?, timezone? (IANA, e.g. Asia/Kolkata), notifyPrefs? }` |
| POST 🔒 | `/api/profile/password` | `{ currentPassword, newPassword }`; signs out your other devices |

`notifyPrefs`: `{ before: [minutes…] (from 10080, 4320, 2880, 1440, 180, 60, 30, 15, 0), dueToday, overdue, dailySummary, highDone, quietOn, quietFrom: "22:00", quietTo: "07:00" }`

## Tasks 🔒
A task: `{ id, workspaceId, title, description, dueDate "YYYY-MM-DD", dueTime "HH:MM", dueAt (UTC ISO), planDate, planTime, priority (high|medium|low), status (todo|doing|review|blocked|done), category, estimateHours, progress (0–100), reminders [minutes], createdAt, updatedAt, completedAt }`
Dates and times are in the user's time zone.

| Method | Path | |
|---|---|---|
| GET | `/api/tasks` | Filters: `status` (comma list, or `open`), `priority`, `q` (search title and description), `due` (today, tomorrow, overdue, upcoming, week, none), `days` (for upcoming, default 14), `from`/`to` (due dates), `workspaceId`, `sort` (due, priority, created, updated, title), `limit` (≤500), `offset` → `{ tasks, total, limit, offset }` |
| GET | `/api/tasks/today` · `/tomorrow` · `/overdue` · `/upcoming` | Shortcuts for the `due` filter |
| POST | `/api/tasks` | `{ title, description?, dueDate?, dueTime?, planDate?, planTime?, priority?, status?, category?, estimateHours?, progress?, reminders?, workspaceId? }` → 201 `{ task }` |
| GET | `/api/tasks/:id` | `{ task }` (404 if it isn't yours) |
| PATCH | `/api/tasks/:id` | Any task fields → `{ task }` |
| DELETE | `/api/tasks/:id` | 204 |
| POST | `/api/tasks/:id/complete` · `/reopen` | `{ task }` |
| GET | `/api/tasks/:id/breakdown` | Suggested work sessions (not saved) |
| GET / PUT / DELETE | `/api/state` | The app's whole saved state (`{ state, version }`). PUT `{ state, base: version }`; 409 with the newest copy if it changed elsewhere. Used by the web app. |

## Planning (My Plan) 🔒
Runs on the server's planning engine; your tasks are never sent to an outside AI. Suggestions are saved only through `/api/plan/apply`.
| Method | Path | |
|---|---|---|
| POST | `/api/plan/chat` | `{ message, conversationId? }` → `{ conversationId, userMessage, message: { id, text, via: "engine", proposal: { status, actions } } }` |
| POST | `/api/plan/apply` | `{ messageId, actions?: [{ keep, title?, date?, time?, priority? }], discard? }` → `{ status: "saved", result: { created, updated, completed, ids } }` |
| GET | `/api/plan/day?date=` · `/api/plan/tomorrow` | Day plan from your saved tasks |
| GET | `/api/plan/priorities` | Open tasks in order, with reasons |
| GET | `/api/plan/workload?days=14` | Hours per day, capacity, overloaded days, tasks that won't fit |
| GET | `/api/plan/organise` | "Too much work" plan |

Action types in a proposal: `create` (new task), `plan` (plan an existing task for a day), `deadline` (change a hard deadline: only when you said so), `complete`, `steps` (add work sessions to a task).

## Help (Deadline AI) 🔒
| Method | Path | |
|---|---|---|
| POST | `/api/chat` | `{ message, conversationId? }` → `{ conversationId, message: { text, found, kind (website/general), via (ai/kb), sources, qid } }`. Uses Gemini with the matching help-guide text; never your tasks. If the AI is unavailable or out of quota, answers from the guide and says why. |
| POST | `/api/chat/rate` | `{ id: qid, rating: 1 | -1 | 0 }` |
| GET | `/api/help/suggestions` | Suggested questions (public) |
| GET | `/api/conversations?kind=help|plan` | Your conversations |
| GET | `/api/conversations/:id/messages` | Messages in one conversation |
| POST / DELETE | `/api/conversations` · `/api/conversations/:id` | New / delete |

## Notifications 🔒
| Method | Path | |
|---|---|---|
| GET | `/api/notifications?unread=1&since=&limit=` | Delivered notifications `{ notifications: [{ id, taskId, kind, message, scheduledAt, deliveryStatus, read }], unread, quietNow }` |
| GET | `/api/notifications/upcoming` | Scheduled, not yet delivered |
| POST | `/api/notifications/read` | `{ ids: [...] }` or `{ all: true }` → `{ unread }` |
| DELETE | `/api/notifications/:id` | 204 |

## Statistics 🔒
`GET /api/stats` → `{ total, completed, pending, overdue, completionRate, onTimeRate, dueToday, priorities: { high|medium|low: { total, pending, completed } }, weekly: [8 weeks], monthly: [6 months] }`

## Admin 🛡
| Method | Path | |
|---|---|---|
| GET | `/api/admin/overview` | Counts, AI status and limits, errors, last reminder run |
| GET / PATCH / DELETE | `/api/admin/users` · `/api/admin/users/:id` | List; `{ role, disabled }`; delete. The last admin can't be removed. |
| GET / POST | `/api/admin/kb` | List; add `{ kind: faq|doc, title, body }` or upload `{ filename (.md/.txt/.html), body }`, optional `fromQuestion` |
| GET / PUT / DELETE | `/api/admin/kb/:id` | One source; edit `{ title, body }`; delete |
| POST | `/api/admin/kb/reindex` | `{ all?: true }`: re-chunk and embed |
| GET / PUT | `/api/admin/questions` · `/api/admin/questions/:id` | Unanswered, common, rated, recent; mark resolved |
| GET / PUT | `/api/admin/settings` | AI instructions `{ instructions }` |
| GET | `/api/admin/usage?days=14` | Gemini calls per day by status, tokens, recent calls |
| GET | `/api/admin/errors` | Recent server errors |
