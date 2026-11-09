# Test report: Deadline Tracker

**Latest full run (9 Nov 2026, inline citations): 445 of 445 tests pass, twice in a row.** Earlier first report: 140 of 140 (two full runs in a row, about 3.5 minutes each).
Every test runs the real app in Chromium with the clock fixed at **Friday 30 Oct 2026, 12:00 IST**, so dates are predictable.

## How it was done (test-driven)
1. Wrote the tests first, describing how each feature should behave.
2. Ran them: **61 passed, 6 failed**.
3. For each failure, decided whether the app or the test was wrong, fixed it, and ran everything again.
4. Repeated until all passed, then ran the full suite a second time to check for flaky tests.

## Bugs the tests found and fixed in the app
| Bug | Effect for users | Fix |
|---|---|---|
| Settings page wider than a phone screen (+231 to 272 px) | Settings scrolled sideways on phones | Settings sections and rows now shrink and wrap |
| Focus-session controls on the Planner wider than a phone (+18 px) | Planner scrolled sideways on phones | The deadline picker now shrinks to fit |
| Calendar deadlines were `<button>` elements | Drag-to-reschedule could fail (browsers often refuse to drag buttons) | Calendar items are now draggable elements that still open with Enter/Space |

## Test mistakes corrected (the app was right)
- **Radar thresholds test:** the "no progress yet" nudge correctly still applied. The test now records some progress so it only checks the thresholds.
- **Calendar drag test:** dropped on 27 Nov, which isn't shown in the October view. It now uses a visible day.
- **Exam topic and drag tests:** acted on elements while the page was still fading in or re-drawing. The helper now waits for the fade-in to finish.

## What's covered
**Engine (34 tests):** natural-language parsing (relative days, weekdays, dd/mm, ordinals, impossible dates, no invented dates, #subject, @person, ~hours, !priority, repeats), paste extraction, Deadline Radar levels and reasons (overdue, dependencies, work vs. available time, blocked, adjustable thresholds, earlier deadlines using up time), planner capacity and shortfalls, backward planning (dates and hours, deadline untouched), rescue steps, reminders (none for completed work, overdue setting, 1-day reminder, daily summary), and conflict detection.

**Student flows (20 tests):** onboarding with and without sample data, first deadline in seconds, quick add with editable fields (manual edits win), no saving without a date, paste import, complete and undo, repeating deadlines, activity log, backward plan accept, Rescue mode (deadline unchanged), calendar drag and undo, keyboard open on the calendar, search, reload persistence, study hours affecting the planner, exam topics, notifications, keyboard shortcuts, clearing sample data, accessible button names.

**Company flows (10 tests):** manager vs. employee navigation, blocking manager pages for employees, board drag, employees dragging only their own cards, submit-for-review then approve, request changes with a note, workload view, reassigning from Rescue mode, notifying a manager, quick add with @name.

**Phone (4 tests):** bottom navigation and + button, no sideways scrolling on any page (student and company), full-screen details panel.

## Not covered yet
Real sign-in, server sync, email or push reminders and file uploads: these don't exist in the prototype yet. Firefox and Safari: tests run in Chromium only.

## Redesign (glass UI, light/dark, simplification)
Done test-first. The 18 new tests were written before any design change. Against the old design, 17 failed and 1 passed (the check that every button has working code: all 79 actions already did). After the changes, all 86 pass, the original 68 included.

**What the new tests check**
- A visible light/dark toggle in the top bar: it switches, its label says what it will do, and the choice is remembered after a reload.
- Both themes are separately designed (text, glass, sidebar, cards and accent colours all differ).
- Text is readable: main text at least 7:1 contrast, secondary and sidebar text at least 4.5:1, primary button text at least 4.5:1, in both themes.
- Panels are glass (translucent with a background blur).
- Less on screen: four summary numbers; the overview has at most five blocks; no timeline, workload chart or exam strip on the overview; heads-up warnings folded into one line; no activity feed on the company overview.
- Less date/time noise: list rows show a short date (no clock time, no ticking seconds), and the page subtitle no longer repeats today's date.
- Fewer options: Quick add shows title, date and time, with the rest under "More options"; the details panel shows core fields, with the rest under "More details"; list filters are hidden until "Filters" is clicked; Settings no longer has the time zone picker, the custom reminder or the "Not connected" rows; risk rules are under "Advanced".
- Every page opens cleanly in both themes, for student, company and personal workspaces, with no unnamed buttons and no browser errors.

**Not built:** the Reader system from the brief. You asked to skip it.

## New features: check-ins, estimates that learn, extension tracking
Done test-first. All 16 new tests failed before any code was written; all 102 tests pass now.

- **Progress check-ins:** a one-tap card on the overview asks how far along a deadline is when it's due within 4 days, has an estimate and has no plan steps. Choosing 0, 25, 50 or 75% updates progress, logs it and moves on to the next deadline. "Done" completes it. "Not now" hides that deadline for a day, even after a reload. It never asks about finished work or deadlines with plan steps.
- **Estimates that learn:** compares focus time logged against the estimate on finished work of the same type. It needs at least 2 examples, stays quiet when estimates are within 15%, and notices both under- and overestimates. Hints with a "Use Xh" button appear in Quick add and the details panel. Reports gain an "Estimate accuracy" table.
- **Extension tracking:** after "Log that I asked" in Rescue mode, the details panel asks whether the extension was approved. Yes moves the deadline to the new date, keeps the time of day, remembers the original deadline and shows an "Extended" tag in lists; Undo works. No keeps the deadline and records the decision.

## AI assistant, To-Do system and reminders
Done test-first: 32 new browser tests and 5 server tests, written before the code. Then everything was run until green, plus two full runs of all 140 tests.

**Assistant (14 tests)**
- With no AI connected it says so ("Simple rules (AI off)") and still works with on-device rules.
- The brief's three examples: tomorrow's four tasks with the right date and a 2h estimate for DSA; today's three tasks; "deadline is 5 November" becomes a deadline with 1-day and 1-hour reminders.
- "Move it to tomorrow" updates the existing task (same id); it doesn't create a duplicate.
- It never invents a date ("Buy groceries and call mom" stays undated).
- Suggestions are clearly marked "not saved yet". You can edit titles and dates, untick items or discard; nothing is saved until you approve.
- With a (mocked) real model, the prompt contains today's date, weekday, time zone, your saved tasks and the rule "never invent". Invalid suggestions (impossible dates, unknown task ids, empty titles) are dropped and you're told. A typing indicator shows while it thinks. Failures show a clear message with Try again.
- On localhost the page calls `/api/ai`. No API key is in the page or in what the browser sends.
- Chat and saved tasks survive a reload. Quick actions (Add task, View today, Reschedule unfinished) work. The home screen's ask bar sends to the assistant.

**To-Do (9 tests)**: Today, Upcoming and Completed with "X of Y tasks completed"; quick add understands "tomorrow 6pm !high"; one-click complete; finishing everything today is celebrated; edit title, priority, status, time and reminders; delete with Undo; move to tomorrow; upcoming deadlines listed; plain to-dos stay out of deadline views; reload keeps everything; correct day just before midnight in India time.

**Reminders (9 tests)**: the brief's messages ("Your Java assignment deadline is tomorrow. Don't forget to complete and submit it!", "due in one hour", "deadline is approaching!", "You have 3 pending tasks today."); a reminder fires when its time arrives, not before (tested by moving the clock); no duplicates, even after reloading; nothing for completed work; read and dismiss persist; the browser asks for notification permission only after you click "Turn on desktop alerts", and then a real desktop notification is sent exactly once; Settings explains that alerts need the app open.

**Local server (5 tests, against a fake Claude API)**: serves the app; can't escape the folder; without a key reports AI off and refuses politely; with a key relays to Claude with the key in a server-side header, and the key never appears in responses; a wrong key gives a clear error; ai-key.txt is never served.

**Bugs found and fixed along the way**
- Dismissing a notification closed the whole panel.
- A manager's "needs help" notice could take 15 seconds to appear.
- A background reminder toast could replace an Undo toast before you could click it.
- Seen on screenshots and now covered by a new phone test: to-do rows tinted by priority, notification text wrapping one word per line, the home ask bar overflowing on phones, and the assistant welcome cut off on phones.

**Not tested here**
- serve.ps1's relay to Claude: PowerShell isn't available in the test machine. It mirrors server.js, which is tested.
- Real Claude answers: tests use a stand-in model so results are repeatable.
- Notifications when the browser is closed: not supported by this version.

## Part A: fixes from the November 2026 walkthrough
Each item was done test-first: new tests written and run red against the previous build, then the change, then the item's tests and the full suite green.
Before starting: **140 of 140** passed (baseline run, 17 min on this laptop).

### A1 · One task model (to-dos and deadlines merged)
**What changed:** a task can have a day to work on it and/or a hard deadline. Having a deadline is now what puts a task in My Deadlines, the radar, the deadline reminders and overdue alerts, however it was created. Today shows tasks planned for today, deadlines due today, and unfinished work from earlier days (marked "Overdue" or "From Thu"). Upcoming groups tasks and deadlines together by day. In the details panel the deadline field is in plain sight for any task (adding one turns on the usual deadline reminders), a deadline can be given a "Work on it" day without changing it, and "Remove the deadline (keep the task)" needs a click and a confirmation, with Undo. In the assistant, "move it to tomorrow" on a deadline plans the work for tomorrow and says "the deadline stays …"; only "the deadline is now …" moves a deadline, and that still shows a warning before you save.
**Old data:** saved items keep their ids, titles, days and deadlines. Fields added later are filled in only where they're missing; nothing is overwritten. The old `kind` field is kept for older copies of the app but no longer decides anything.
**Tests (9 new, `tests/merge.test.js`):** a saved state from the previous version (an item from before to-dos existed, to-dos with and without deadlines, a deadline due today, a finished one) loads unchanged and survives a reload; deadline views, radar and Today use the merged model; the first (v1) format still converts; a to-do with a deadline gets overdue alerts; adding a deadline from the details panel; planning a deadline for a day; removing a deadline only on request; Upcoming groups by day; the assistant moves the day, not the deadline. Red before the change: 7 failed, 2 passed (the two "old data loads" checks, which guard against regressions).
**Changed test:** "Upcoming also lists upcoming deadlines" now checks that the deadline appears in the day groups with a "Due" marker instead of under a separate "Upcoming deadlines" heading (the requirement changed).
**Bug found on the screenshots and fixed:** on a phone, the bottom of the details panel ran off screen ("Mark as done" was cut off when Rescue was also shown). The buttons now wrap. New phone test: red before the fix, green after.
**Full suite after A1:** 149 of 149 pass.

### A2 · Offline rules understand "due …" in a list and "assign … to Rahul"
**What changed:** the parser marks something as a deadline when the words say so: "due", "deadline", "last date", "submission", "submit … by", or an exam/quiz/viva date (but "study for the maths exam" stays a task). "DBMS assignment due Friday 5pm, Java lab tomorrow" now gives one deadline (Fri 6 Nov, 5 pm, reminders 1 day and 1 hour before) and one task for tomorrow. Two deadlines joined by "and" are both kept (before, the second was lost). "Due" with no date never gets a date. "Assign X to Rahul", "X, assign to Rahul", "…and give it to Karan Mehta" and @name pick the team member (first name or full name); an unknown name is shown as "No one called Zoya" and the task stays with you. Only managers can assign to others. The AI prompt now explains "due" inside lists, lists the team, and accepts an "assignee" name, which is checked against the team before anything is saved.
**Tests (11 new, `tests/parser-a2.test.js`):** parser and rules for both cases, the walkthrough sentence end to end (saved as a deadline; Home is not "all caught up"), a manager's "assign to Rahul" shown and saved, and the AI prompt/answer check with a stand-in model. Red before the change: 10 failed, 1 passed (the "never invent a date" guard).
**Bug found while writing the tests:** a title could end in "is" ("Physics report is"); fixed.
**Note:** one full run during A2 had a single failure in the old Quick add "manual edit wins" test while two test runs were sharing the laptop; it passed when run alone (a timing flake under load, not a bug). Since then, test runs never overlap.

### A3 · One Add box
**What changed:** one box replaces Quick add, the To-Do box and the home ask bar. N, + and a calendar day's "+" open the same box. It uses the same reading as the assistant's offline rules (one shared function), so "due …", commas, new lines, "assign to …", ~2h, !high and "every week" work everywhere. A line under the box says what it understood before you press Enter; Enter saves, Undo is in the toast. No date means today's list (your choice); deadlines only when the words say so; deadlines without a time are end of day. "Ask the assistant" sends the text to the assistant as a suggestion instead. The field-by-field form and the Paste tab are gone. Tasks without a deadline now show on the calendar (dashed) and can be dragged to another day; a repeating task without a deadline repeats on its day.
**Tests (10 new, `tests/addbox.test.js`):** same understanding in every place, old form gone, Enter + Undo, deadlines with effort/priority, several at once (commas and new lines), never inventing a deadline, Ask the assistant, @name and "assign to" for managers, calendar day "+", repeating tasks. Red before: 10 of 10 failed.
**Changed or removed tests (requirement changed):** the Quick add form tests ("editable fields", "won't save without a date", "paste text", "More options", the estimate hint inside Quick add) were replaced by Add box tests; texts that meant a deadline now say "due". The estimate hint is still tested in the details panel.

### A4 · Home is one calm Today view
**What changed:** Home is the greeting with the Add box, one heads-up line, Today (tasks with progress) and Next deadlines (at most five, overdue first; the progress check-in sits there as one compact row). The four number tiles, "Next recommended action", the radar and the duplicate priority list are gone from Home; the radar is at the top of the Deadlines page (your choice). Company Home is the same.
**Tests (7 new, `tests/today.test.js`):** only the four parts, progress count matches the list, next-deadline order, **phone height: was 3.8 screens, now under 2**, no contradictions ("all caught up" never shows next to an overdue item; honest empty states), radar and its legend on Deadlines, company Home. Red before: 7 of 7 failed.

### A9 · Deadlines empty state and Settings sections
**What changed:** "Nothing matches" only appears when a search or filter is on; otherwise My Deadlines says "No deadlines yet" (with Add) or "All done" (with See completed). Settings shows one short section at a time behind tabs (Profile, Availability, Reminders, Assistant, Subjects/Projects, Team, Data); on a phone the tabs wrap as chips.
**Tests (4 new, `tests/a9.test.js`):** the three empty states, and every Settings section under 2.2 phone screens. Red before: 3 failed, 1 passed (the "filter on" guard).

### A5 · A calm first day
**What changed:** when a workspace is set up, reminders that are already due in its sample data are recorded as seen; only the daily summary arrives (was 7 unread). Anything after that notifies as usual. Sample data is a normal week: one overdue example (kept for Rescue mode), at most two at risk; student and company workloads were lightened.
**Tests (7 new, `tests/a5.test.js`):** at most one unread after setup in all three modes, calm risk levels in all three, and new reminders still arrive. Red before: 5 failed. One old test now expects at least one heads-up warning instead of two (calmer data).

### A6 · First run asks "What's due this week?"
**What changed:** the last setup step is one box with the same live hint as the Add box; what you type becomes tasks and deadlines when you press Get started. The workspace name and subjects fields were dropped from setup (both are in Settings).
**Tests (3 new, `tests/a6.test.js`):** the box, the answer becoming tasks shown on Today, and skipping. Red before: all failed.

### A7 · Short sidebar
**What changed:** Today, Assistant, Calendar, Deadlines, then a folded "More" (Exams, Planner, Reports, Settings). Company: My Work and Team Deadlines stay in view, plus Workload and Needs attention for managers. To-Do is part of Today (Today / Upcoming / Done tabs, your choice); old #todo links land there. The phone bar shows the same four plus More.
**Tests (4 new, `tests/a7.test.js`):** student, company manager/employee, To-Do on Today, phone bar. Red before: 4 of 4 failed. Old navigation and page-title tests updated to the new names.

### A8 · Managers
**What changed:** a manager's Add box has a visible "For" picker (typed "assign to"/@name still wins). Approvals became **Needs attention**: one queue with Waiting for your approval, Overdue, Blocked and Overloaded this week (with a Reassign suggestion). The manager's Today shows it as one line with the count.
**Tests (4 new, `tests/a8.test.js`):** picker, the four groups and approving from the queue, the Today line, employees don't see it. Red before: 3 failed, 1 passed (the employee guard).
**Bug found:** with the queue added, "Request changes" picked the wrong row; approvals now come first, as specified.

### Screenshots
Taken in light, dark and at 390 px for every changed page. Problems found and fixed: the details panel footer on phones (A1), and the Add box placeholder being cut off (shortened).

### Not done / not covered
Part B (server, accounts, Telegram) was not started, as asked.

## Fix: "plan my tomorrow" (1 Nov 2026)
- Bug: "plan my tommorw day" was saved as a new task called "Plan my tommorw day" with no day.
- Fix: asking to plan a day now builds the plan from your own list: overdue work first, then deadlines due that day or the next, then work the planner set aside for that day, then left-over to-dos. It is a suggestion you approve, it invents nothing, and deadlines never move.
- Spellings like "tommorow", "tommorw", "tomorrw" and "tmrw" now mean tomorrow everywhere (Add box too).
- server.js now tries the next port when 8000 is blocked or busy.
- Tests: new tests/planday.test.js (6). Two outdated tests updated for A4/A5 (radar on Deadlines; calm first day).
- Full suite: 203 of 203 pass.

## Backend + Google Gemini (1 Nov 2026)
Built test-first in stages; each stage's tests pass before the next. Full suite run twice: **263 of 263 pass** both times (57 backend tests also pass on the laptop copy).

| Area | Test file | What is checked |
|---|---|---|
| Server & security | api-server | serves only index.html/admin.html (source, .env, data, docs 404); health check; CSP and security headers; cross-site requests blocked (403); JSON only (415); bad JSON (400); every private route needs a login (401); migrations, constraints and indexes exist; the Gemini key never appears in any response or page |
| Accounts | api-accounts | sign up (201, HttpOnly cookie, first user admin, time zone), validation, duplicates, wrong password, same error for unknown emails, hashes only (scrypt, SHA-256 session tokens), logout ends the session, guessed cookie fails, profile + time zone + reminder preferences, password change signs out other devices, login rate limit |
| Tasks | api-tasks | create/read/update/delete, complete/reopen, validation per field, deadline stored for the user's time zone, filters (status, priority, dates), search (% and SQL text treated literally), today/tomorrow/overdue/upcoming, paging, cross-user access → 404 (also through the app's save), app save ↔ tasks table, version conflicts (409), default workspace |
| Engine | engine-server | time-zone maths incl. US clock change; schedule (max 2h/task/day, nothing after a deadline, won't-fit), priorities with reasons, day plan (overdue first, nothing invented, deadlines unchanged), organise, breakdown (asks for an estimate instead of guessing), workload; text reader incl. Hinglish and typos |
| My Plan | api-plan | suggestions saved only after confirm, edits validated, can't save twice, plan tomorrow / Hinglish follow-ups with history, organise, overdue, break down, move unfinished, mark done, duplicates unticked, **no Gemini calls for private planning**, can't apply another user's suggestion |
| Reminders | reminders-server, api-notifications | right local time (India and New York), delivered only when due, no duplicates, due-today and overdue, finished tasks cancel pending reminders, server-off catch-up sends only the latest, daily summary from 08:00, high-priority-done once, preferences, notification API (read, unread count, dismiss, other users can't touch yours) |
| Gemini + RAG | api-help-gemini (fake Gemini API) | guide chunked + embedded (vectors in SQLite), query embedded, prompt contains only matching extracts, sources shown, Hinglish/typos, unknown → "I don't know" + logged, model claiming non-existent features is blocked, general tips allowed, **tasks never sent to Gemini**, follow-ups, quota 429 → pause + guide fallback, invalid/empty answers, per-user daily limit, bad key, no key |
| Admin & stats | api-admin-stats | all 15 admin routes refuse users (403) and visitors (401), user list without task contents, roles, turn off/on, delete, last-admin protection, knowledge add/upload/edit/delete answers immediately, instructions, usage, errors; statistics from real data, per user |
| Browser | account-ui, ui-server | log in/sign up, data saved to the account, privacy between accounts, import browser data, Deadline AI window (My Plan saves real tasks; Help with sources, rating, history after reload, personal questions routed to My Plan), bell shows server notifications, Mark all read syncs, Reports account statistics, reminder settings → account preferences, phone full-screen window |

Removed: the Anthropic relay (`/api/ai`), its prompt/validation code and tests, `serve.ps1` and `ai-key.txt` (moved to `_to_delete/`). Not covered: real Gemini calls (tests use a fake Gemini API with the same request/response format); email or phone push delivery (not configured).

## Help answers any question (2 Nov 2026)
- New default: Help answers **any question** with Gemini. Website questions still come only from the help guide (the model can't invent a feature), and tasks are still never sent.
- Admin → AI instructions → "What Help answers": **Any question** or **Focused** (website + planning tips only, saves the free quota).
- Tests (api-help-gemini): general question answered; invented website feature blocked and shown to the admin; model can't answer → "I don't know"; focused mode prompt and refusal; invalid scope rejected. Full suite twice: 266 of 266.

## Logo (2 Nov 2026)
- New logo (`logo.svg`): a countdown ring that is almost full, a check mark, and a gold deadline dot, on the app's blue-violet gradient.
- Shown as the browser tab icon, on the log-in and setup screens, at the top of the sidebar, in the phone top bar, on the admin page and in the README.
- Tests (logo.test.js): tab icon, setup screen, sidebar, unique SVG ids, phone top bar with no sideways scrolling, log-in screen, admin page, logo file. Screenshots checked in light, dark and 390px. Full suite twice: 269 of 269.

## Audit, login fix, security fixes and redesign (2 Nov 2026, branch `audit-redesign`)
Test-first throughout; every bug below had a failing test before the fix. Full suite run twice: **296 of 296 pass** both times. Details and the bug log: `AUDIT-REPORT.md`.

| Area | Test file | What is checked |
|---|---|---|
| Permanent storage (the login bug) | persist (fake Neon SQL-over-HTTP) | bug reproduced: without `DATABASE_URL` a wiped disk makes the right password fail; with it accounts, sessions and tasks survive a wiped disk; Neon down at start → server waits, never overwrites the saved copy; older server during a redeploy can't overwrite newer data; the database password never appears in responses or logs |
| Log-in edge cases | api-accounts | empty email/password → 400 with the field (not "wrong password"); invalid email; spaces/capitals in the email; expired session refused and deleted; every private route answers 401 when signed out without leaking data |
| Security | api-security | 40 guesses with a different fake `X-Forwarded-For` each → limited after 30 per account; HSTS on every production response, not on localhost; no CORS headers, preflights refused, cross-site POST 403; another user's task → 404 for read/change/delete, not in their list or state, admin routes 403, admin answers have no task contents or hashes; stored XSS payloads in task title, notes, user name, workspace name → shown as text on 7 pages, the drawer and the admin page, no script runs; private files and encoded path tricks → 404 |
| Welcome page | auth-ui | landing text, 3D scene (hidden from screen readers) next to the panel; no sideways scroll at 390/768 px, 44 px tap targets; reduced motion stops the animation; password show/hide (labels, aria-pressed, value kept); checks before sending (name, email, valid email, password, 8 characters) with aria-invalid and focus, no request sent; email kept when switching tabs; duplicate account and wrong password messages, wrong password cleared; Settings → change password (wrong current, short new, success, old password fails, new works) |
| Home | today, todo, merge | four real numbers in the greeting panel match an independent count and open the deadline list; Home still ≤ 4 blocks; Today progress counts carried-over work (was "0 of 0 done"); manager attention bar styled as a card; Add box example text not cut off |
| Phone | ui-mobile | Add box shows its whole example text at 390 px and shrinks back with short text |
| Company | ui-company | Workload member cards: nothing sticks out, badges not clipped, card headers line up |

Manual checks: screenshots of the welcome page (desktop, tablet, phone, sign-up error), Home (light, dark, phone; student and manager), Workload, Needs attention and Reports; a sweep of every page for student, manager, employee and personal at 1440 and 390 px (no browser errors, no sideways scrolling).
Not covered: real Neon (the workspace can't reach neon.tech; tests use a fake with Neon's request/response format), real Render/Vercel after deploy (not deployed yet), real Gemini, screen-reader walkthrough, Safari/Firefox (tests run Chromium only).

## Original NEXORA pitch and shared design system (2 Nov 2026, branch `original-redesign`)
The earlier pitch (made with Antigravity) was replaced by an original one built on the app's own identity (`docs/DESIGN-SYSTEM.md`). The team's slide text and speaker notes were kept; wrong claims were corrected (4 problems, not 5; no "confidence rings"; 300+ tests, not 269; the reminder answer now mentions the free-hosting sleep).

| Area | Test file | What is checked |
|---|---|---|
| 3D scenes | pitch | three different scenes (Countdown Orbit, Risk Radar, Week Rebalance) plus the finished ring on the closing slide; the 3D waits until the text has painted; the others are prepared in idle time; only the visible one runs; week day labels follow the columns |
| 3D type | pitch, auth-ui | NEXORA title: 6 letters with 12 depth layers each, read as one word; slide headings flip in word by word; the app's welcome headline uses the same 3D type |
| Controls | pitch | Begin, next/previous, arrows, Space, Home/End, chapter rail, chapter menu, logo, keyboard focus, hidden slides inert, stays on the last slide; #slide-N links and refresh; 7 product tabs and keys 1–7, all pictures load; notes follow the slide; judges' Q&A (button, Q, Esc); timer matches the script (3:25), pauses and resets; full screen; app links open safely |
| Phone | pitch | controls on screen and ≥36 px; every slide starts at its heading; comparison as cards with our answer first; no sideways scroll; swipes, but not inside the table, tabs or a 3D scene |
| Fallbacks | pitch | reduced motion: one still frame, no loops, instant changes; no graphics acceleration (software WebGL): still pictures rendered from the real scenes, no freezing; no WebGL at all: same stills |
| Glass, contrast, budget | pitch | 14 px blur, solid fallback without blur support; text on glass ≥ 4.5:1; pitch.html < 140 KB, first load < 2 MB, three.js once from a cached file, WebP pictures; nothing left of the earlier deck (GSAP, Cinzel, pink) |
| Design tokens | auth-ui | teal, amber and coral tokens in light and dark; the old pink landing gradient is gone |

Performance found and fixed: building the title scene blocked the page for ~9 s on software graphics (ready at 10.5 s, now 0.67 s); slide changes stuttered while shaders compiled (now prepared in idle time); weak GPUs get lower resolution, no shadows and a frame cap automatically.
Manual: screenshots of every slide at 1920×1080, 1366×768, 820×1180 and 390×844; the still-picture fallback; the app's welcome page and Home in light, dark and phone.
Not covered: real GPU frame rates (this machine has none; 3D was checked with software WebGL), Safari and Firefox, a screen reader walkthrough.

## Signature GSAP motion and warm palette (3 Nov 2026, branch `gsap-panels`)
**Result: 321 of 321 tests pass, two full runs in a row** (10 new tests in `tests/motion.test.js`).

Reference: an Instagram clip of a GSAP sidebar where the panel keeps its wide box while its edge travels (`clip-path`), the page, handle and arrow move with it, shifted items follow by y, and labels fade back in with a stagger. Built as our own version in five places, each with its own motion (see `docs/DESIGN-SYSTEM.md`).

What was tested (written first, run red: 0 of 10 passed):
- GSAP is inlined by the build; no script from another site; it drives the motion.
- Sidebar rail, mid-animation: the edge is part-way, the sidebar stays 248 px wide, the page and handle are still moving, the arrow is turning. At the end: 76 px rail, handle on the edge, no leftover transforms, labels hidden visually but still in the link text and as tooltips, links work, the choice is remembered after a reload.
- Opening the rail: labels come back one after another; nothing stays clipped.
- Deadline AI window: a circle centred on its button grows to the full window; closing shrinks it back while the state changes at once.
- Heads-up panel: height and clip grow together, the chevron turns, folding back leaves no jump.
- Changing section: cards unfold from their top edge, then nothing is left clipped or moved.
- Reduced motion: every change is instant, no clip or movement.
- Phone (390 px): no rail handle, no sideways scrolling, the AI window opens.
- Log-in tabs: the pill slides under the chosen tab; the form is revealed from that side.
- Palette: copper accent and warm background in both themes; no blue or violet colour left in the app's code.

Found and fixed along the way:
- The calendar drag test started a drag while the new card reveal was still moving. The shared `settle` helper now also waits for GSAP reveals (cards are marked while they move), which is what it was meant to do.
- GSAP's own clock uses `Date.now`, which the tests freeze. GSAP now runs on `performance.now()` and only while something is moving, so it works the same in tests and for users and never runs an idle loop.
- Switching log-in tabs replayed the headline's word animation; it now stays still.

Screenshots checked: light and dark (Today, heads-up open, rail mid-move and finished, Deadlines, AI window mid-open and open, log-in and sign-up switch), and 390 px phone (Today, AI window, log-in).

Not covered: real GPUs, Safari and Firefox (tests use Chromium only); how the motion feels at low frame rates on old phones. The `/pitch` page still uses the indigo palette.

## Full audit: login, password reset, new members, Reports, Planner, security (3 Nov 2026, branch `audit-fixes-nov3`)
**Result:** the full suite, run twice in a row (see the final line of this section for the numbers); 100 test accounts × 14 scenarios against a real server; security sweep 24 of 24 checks.

### Main cause of "login not working", "sample data missing", "Reports/Planner empty" on the live site
The live backend on Render was still running code from before 2 Nov. Every Render deploy since commit `fd11854` failed after ~15 minutes (GitHub deployment statuses show 5 failures in a row). The new server waited for Neon *before* opening its port and retried forever; when Neon couldn't be used it never answered Render's health check, so Render kept the old server, which loses its database whenever it restarts (free plan). Accounts, sample data and reports disappeared with it.
Fix (`server.js`, `lib/persist.js`, `lib/config.js`): the port opens first and answers 503 "starting" until the data is loaded; after 60 s without Neon the server starts anyway **without** saving to Neon, shows the reason in `/api/health` (`persistence.fallback`, `error`), and checks again every 30 s (empty Neon → starts saving; Neon holding a saved copy → never overwritten, asks for a restart). A `DATABASE_URL` pasted as `psql '…'`, with quotes or with `DATABASE_URL=` is cleaned. 5 new tests in `tests/persist.test.js` (they hung before the fix).

### Bugs found and fixed
| Bug | Effect | Fix | Test |
|---|---|---|---|
| Render deploys never finished (above) | Old server kept running; data lost on every restart | Listen first, time-limited Neon load, fallback + recheck, cleaned `DATABASE_URL` | `persist.test.js` (5 new) |
| No way to recover a forgotten password | Members locked out | One-time reset links by email (Brevo/Resend, free) or made by the admin; `#reset=` page; token hashed, single use, 30 min, signs out all devices; rate limited | `api-password-reset.test.js` (11), `forgot-ui.test.js` (7) |
| Bringing browser tasks into a new account deleted the browser copy *before* the server saved it | A refused save (old short ids) or network error lost those tasks | Copy removed only after a confirmed save; old ids repaired | `account-ui.test.js` (2) |
| Reports "Your account" totals cached up to 30 s | Finished a task, Reports still showed the old numbers | Refreshed after every save | `ui-server.test.js` (verified red without the fix) |
| Weekly bars in "Your account" had no labels; "Completion" contradicted "Completion rate" | Chart unreadable, numbers confusing | Week labels, "Done of all tasks", month names | `ui-server.test.js` |
| Reports for a member with no deadlines showed "0%" rates and "Average finish: On the day" | Invented results | Empty state with "Add a deadline"; dashes when nothing is finished; empty account panel hidden | `empty-states.test.js`, `ui-server.test.js` |
| Study Planner with no deadlines: empty picker, no guidance | Looked broken | "Nothing to plan yet" with an example and buttons | `empty-states.test.js` |
| Deadline Radar drew deadlines due at the same time on the same spot | The lower dot couldn't be clicked | Colliding dots moved apart within their sector | `empty-states.test.js` (3 modes) |
| Links inside pages used the browser's default blue | Hard to read in dark mode, off-palette | Accent colour for plain links | `empty-states.test.js` |
| A reset link pasted into a tab with the site open did nothing | Reset page didn't appear | Handled on `hashchange` | `forgot-ui.test.js` |

### Test mistakes found and fixed
- **7 waits never waited:** `page.waitForFunction(async () => …)` returns at once because Playwright treats the returned Promise as "true" (checked: 31 ms while the condition was false). Replaced by `pollPage()` in `tests/helpers.js`. With real waits, two account tests' expectation "version ≥ 2" turned out wrong (setup and the first task are saved together); they now wait for the task itself. The import data-loss bug above had been hidden by this.
- The earlier run's reset UI test used an "too short" password that was exactly 8 characters, and read error messages before the server answered.
- The fake Neon crashed when a stopping server saved after the next test cleared its data (real Postgres just updates 0 rows).
- A pitch test checked "no 3D yet" right after opening, a race that failed once when the machine was busy. It now compares the browser's first-paint time with the time the first scene appears. (On this machine the 3D appears after the text even without the built-in delay, so the test checks the result people see, not the delay itself.)

### Security sweep (`/tmp` script, real server, test data only): 24 of 24
All 52 private routes refuse visitors who aren't logged in (`/api/help/suggestions` is public on purpose: titles of the public help guide's FAQs). All admin routes refuse members. Another member's task and conversation ids return 404; lists, saved state and statistics hold only the member's own data. Profile/sign-up can't set role or email; SQL injection strings in log-in and filters are refused and the database is intact; XSS text is stored as text and shown escaped; session cookie HttpOnly + SameSite=Lax (+ Secure in production); logged-out and made-up sessions are refused; cross-site POSTs blocked (403); wrong passwords and reset-token guessing are rate limited (429); no hashes/salts/tokens in any response; a 3 MB body is refused; `.env`, the database and source files aren't served.

### 100 accounts (`tests/load/hundred-users.js`, result in `tests/load/hundred-users-result.json`)
Each account: browser sign-up and setup with sample data, Reports, Planner, create (Add box) / edit / delete (task API), refresh, log out and in, existing log-in, wrong password, forgot password email, reset page, protected routes; then every member tried every other member's task (9,900 checks). All 14 scenarios passed 100/100.

### Crawl
4 set-ups (student 1366 light, student 390 dark, company 1366 dark, personal 1024 light): every page, every kind of button clicked: no JavaScript errors, no server errors, no sideways scrolling.

### Not covered / remaining risks
- The live site was only read (health page, one unknown route); no accounts were created on it. Render's logs weren't readable (not signed in), so the exact Neon error on Render is unknown until the fixed server is deployed and `/api/health` shows it.
- Reset emails need an email provider in Render's settings (`docs/DEPLOY.md` step 4); until then "Forgot password?" says to ask the admin, who can make a link.
- Accounts made on the live site since its last restart will be lost when the new server deploys (the old server keeps them only on a disk Render wipes); with Neon working, nothing is lost after that.
- Chromium only (no Safari/Firefox); one server instance; a change in the last ~3 s before a crash can be lost.

**Final numbers:** full suite **354 of 354, twice in a row** (two earlier runs: 353/354 with the pitch race above, then 354/354). 100 accounts × 14 scenarios: **all 100/100**, 9,900 cross-member checks, 349 s (re-run on the final code).

## "Wrong password after sign-up", email and Telegram (3 Nov 2026, branch `email-telegram`)

### Root cause of "wrong password"
Not the password code. The live server's `/api/health` (checked 18:29 IST) says `password authentication failed for user 'neondb_owner'`: the `DATABASE_URL` in Render has a wrong Neon password, so nothing is saved permanently. Render's free server sleeps after 15 minutes and wipes its disk; the account no longer exists, and logging in answers "Email or password is wrong". **The fix needs the correct connection string in Render (the owner's step).** In code: while permanent storage is configured but not working, sign-up now answers 503 "can't create new accounts right now" instead of creating an account that later vanishes.
Checked and ruled out by tests: double hashing, different algorithms, wrong comparison, wrong record, email case/spaces, password changed before checking, uncommitted writes, overwritten records (`tests/api-login-bug.test.js`, 7 tests; the flow tests passed before any change, confirming the code wasn't the cause).

### Password hashing
scrypt with a random 16-byte salt per user, raised from N=2^14, r=8, p=1 to **N=2^14, r=8, p=5** (one of OWASP's equivalent scrypt settings; ~16 MiB, ~0.25 s). Migration 3 adds `users.pass_algo`; existing hashes (`s1`) still verify and are upgraded to `s2` at the next successful login. No account was deleted and no password reset. (Argon2id isn't in Node 22 and the project uses no packages; bcrypt likewise needs a package.)

### Email (Brevo or Resend, `lib/mail.js`; delivery in `lib/outbox.js`)
Welcome email with a one-time "Confirm my email" link (24 h, hashed, single use); resend (3/hour); password-reset link (earlier work); "your password was changed" after a reset or change; deadline and study reminders and the daily summary from the reminder job, **only to confirmed addresses**; test email. Branded HTML + plain text. Each message is unique per user/channel/key (no duplicates), failures are retried 4 times with growing waits and the reason is stored (`outbox.status`, `last_error`), quiet hours postpone, more than 30 an hour per channel are skipped. Messages with one-time links are sent at once and the link is never stored.

### Telegram (official Bot API, `lib/telegram.js`, `lib/modules/channels.js`)
Settings → Notifications → Connect Telegram → one-time token (10 min, hashed) in a `t.me/<bot>?start=` link → the bot receives `/start <token>` by webhook (secret header, production) or polling (laptop) → that chat is linked to that account only (a chat already linked elsewhere is refused) → "Connected" shows on the page (it checks every 3 s). Test message, Disconnect (site or `/stop`), reminders, password-change notices (never links or tokens), a blocked bot disconnects itself. Bot token only in `TELEGRAM_BOT_TOKEN` on the server.

### Notification settings
Email row (address, confirmed or not, Send confirmation / Send test, on/off), Telegram row (Connect / Connected as @name, Send test, Disconnect, on/off), and three kinds: deadline reminders, study reminders and daily summary, account messages. The bell in the app always shows everything.

### Database (migration 3, `lib/db.js`)
`users.pass_algo`, `users.email_verified_at`; tables `email_verifications`, `telegram_links` (chat id unique), `telegram_link_tokens`, `outbox` (unique per user + channel + key).

### Tests actually run
- `tests/api-login-bug.test.js` (7): the reported flow, exact passwords (spaces, accents), repeated log-ins, hashing settings, upgrade of old hashes, same message for wrong password and unknown email, duplicate sign-up, restart, sign-up refused while storage is broken.
- `tests/api-channels.test.js` (14), real server with fake Brevo and Telegram APIs (same requests and answers): welcome email, confirm link (once, tampered, expired), resend limit, reminders on both channels once each, unconfirmed address gets none, preferences, Telegram linking with secret, expired/bad/group/foreign chat refused, test + rate limit, disconnect and /stop, **6 accounts: each person's reminders only in their own inbox and chat**, account notices without tokens, retry after a failed email, blocked bot, secrets never in answers/page/log, unconfigured server says so, polling mode.
- `tests/channels-ui.test.js` (6): settings status, send confirmation, confirm link in an open tab and in a new tab (logged out), Connect → Connected → Test → Disconnect, preferences saved and kept after reload, phone layout.
- Mutation checks: removing the webhook secret check and sending to the wrong chat each made a test fail.
- `tests/persist.test.js`: 3 tests updated for the new sign-up refusal.
- Screenshots: Notifications in light, dark and 390 px.

### Not tested with real credentials (none were available)
- **Email:** no Brevo/Resend key exists yet; real delivery is untested. Needs `EMAIL_PROVIDER`, `EMAIL_API_KEY`, `EMAIL_FROM` (verified sender), `APP_BASE_URL` in Render.
- **Telegram:** no bot token was found (`telegram-token.txt` isn't in Documents on the laptop). Needs `TELEGRAM_BOT_TOKEN` from @BotFather and `APP_BASE_URL`.
- **Neon:** the live `DATABASE_URL` password is wrong (see above).
- Full suite: first two runs 377/381 and 378/381 (three test-side problems: reset tests counted the new welcome email, a test's own database connection didn't wait for the server's writes, one count that couldn't tell a slow welcome email from a duplicate; the welcome email is now also strictly once per account in code). After the fixes: **381 of 381, twice in a row**. Security sweep: 24 of 24 (58 private routes refuse visitors; the webhook refuses calls without the secret).

## Full visual redesign, Daily tasks, sounds and a friendlier assistant (4 Nov 2026, branch `feature/redesign`)
**Visual identity "Tide & Apricot"** (replaces the navy/indigo look): warm paper + deep teal by day, green-charcoal with teal and amber light by night; apricot as the second colour. Fonts: Sora (headings), Manrope (text), JetBrains Mono (small figures). Logo, favicon and admin page recoloured.
**Glass that actually works:** a slowly drifting colour field (four soft lights + fine grain) sits behind every page, so the panels have something to frost. Panels use a tinted translucent fill, `backdrop-filter: blur(22px) saturate(170%)`, a light sheen from the top-left, a hairline edge and an inner highlight. Applied to cards, the Today panel, top bar, sidebar, drawer, modals, Deadline AI window, Add box, Daily tasks and the log-in and setup screens. Text contrast is still checked by the theme tests (≥7:1 main text, ≥4.5:1 secondary, sidebar and button text).
**Motion:** panels rise in softly; buttons lift on hover and press in on click; the current page in the menu is a lit pill; all of it is off with "reduce motion".
**Sound effects:** soft click on buttons, a two-note chime for success (task added, completed, suggestions saved), a low tone for errors. Made with Web Audio (no files). Silent until the first click/key press, never while typing, switch in Settings → Profile (saved on the device).
**Daily tasks** (new page, second in the menu, "Daily" on phones): title + optional short description, tick/untick, inline edit, delete with Undo, pending and completed counts, today's progress bar ("Progress: 1 of 4 completed — 25%"), filters All / Today / Pending / Completed. No date, time or reminder options. Uses the existing task model, so it saves to the account through `/api/state` like every other task; no schema change.
**Assistant:** money is shown in Indian Rupees by default with Indian grouping (₹1,50,000); dollar amounts the model writes are converted to the chosen currency's symbol and grouping unless the person asked about dollars themselves (no exchange-rate maths: these are the model's own example amounts). Currency choice in Settings → Profile (INR, USD, EUR, GBP, AED, SGD, AUD, CAD, JPY), sent with each Help question and validated on the server (unknown → INR). Answers are cleaned (code fences, "Answer:" labels, blank-line runs) and shown with headings, lists and bold; everything is escaped first, so no HTML from an answer can run. Better default instructions (warm, plain, answer first) and a style section in the prompt. Friendlier error and empty-answer messages with Try again.
**Help guide:** new page "Daily tasks, sounds and display settings". Servers that were set up earlier now pick up new guide pages on restart (pages the admin edited stay as they are).

**New tests (all written before the code unless noted):**
| Area | Test file | What is checked | Red first |
|---|---|---|---|
| Sounds | sound | silent before interaction; click on buttons; success on add; silent while typing; error tone; Settings switch off + remembered | 4/4 failed |
| Daily tasks | daily | menu entry and simple form; 4 tasks, tick → "1 of 4 completed — 25%", bar 25%, counts; untick; edit; delete + Undo; filters; empty title refused; reload; **server: survives log-out/log-in, second account sees nothing, GET/PATCH/DELETE of another user's task → 404, description not leaked** | 6/6 failed |
| Currency + answers | api-currency | $ → ₹ with Indian grouping, Rs./INR/₹ regrouped, chosen currency (USD, EUR), dollars kept when asked about, non-money numbers untouched, cleaning; prompt asks for rupees and structure; chosen currency respected, unknown → INR | module missing → failed |
| Assistant window | assistant-ui | headings/lists/bold render, ₹ by default, `<img onerror>` shown as text; GBP from Settings; AI outage → friendly message + Try again | written after the code |
| Help guide updates | api-knowledge-update | a guide page missing from an older database is added and indexed on restart; admin edits kept; no duplicates | written after the code |

**Changed tests (requirement changed):** menu tests now include Daily tasks (A7, company menu); the phone bar is Today, Daily, Deadlines, Assistant, More.
**Test bugs found and fixed:** `waitForFunction` with an async function returns a Promise, which counts as true at once, so the server notification test sometimes reloaded before the reminder existed and then timed out waiting for the bell; it now polls properly.
**Flaky under load:** in the first full run, two tests timed out inside `page.goto` (log-in page and a Daily reload) after the laptop had been busy for two hours; both pass when run again.
**Test bug found in the second full run:** `api-plan` "turns a sentence into suggested tasks" assumed "Java assignment tomorrow" is listed before "Maths test on Friday". On a Thursday both are the same day and the engine lists the test first (a sensible order), so it failed only after midnight going into Thursday 5 Nov. The test now compares the two items without depending on order. The planning code itself was not changed.
**Full suite:** run 1: **317 of 317 pass** (49 min). Run 2: 316 of 317 (only that date-dependent test, which ran before the fix). After the fix, `api-plan` alone: 7 of 7 pass.

### Merged with main (5 Nov 2026): Ivory & Copper kept
Main had moved on (GSAP "travelling edge" motion, Ivory & Copper palette, password reset, audit fixes). On the owner's choice the merged app uses **Ivory & Copper**: main's tokens, fonts and logo; this branch's Daily tasks, sounds, ₹ assistant, glass layer and Help guide page kept. The design layer's extra tokens (`--accent-2`, `--accent-soft`, `--glass-sheen`, `--blob-4`, `--ease`) were given copper/gold values in all three theme blocks; this branch's teal login/setup overrides were removed so main's styling stands; `logo.svg` and the admin page now use the copper logo too (they were still indigo on main).
After resolving: motion, sound, daily, menu, Today, theme/contrast, phone, logo and empty-state tests: **68 of 68 pass**. Screenshots checked: Today (light, dark), Daily tasks, Settings, log-in screen (desktop, phone, after the entrance motion), Deadline AI window with ₹ amounts.

## Release 5 Nov 2026: email/Telegram + the laptop's redesign branch
Merged `email-telegram` (email and Telegram notifications, stronger password hashing, sign-ups refused while storage is broken) with the laptop's `feature/redesign` (Daily tasks, sound effects, rupee-aware assistant; Ivory & Copper kept). One conflict (this report). Full suite: 401/402 (a 3-second animation wait in the shared `settle` helper ran out under load; raised to 8 s, a maximum only), then **402/402 twice in a row**. Screenshots checked: Today, Daily tasks, Settings in light, dark and 390 px; no browser errors, no sideways scrolling.

## 9 Nov 2026: faster loading, Help language, Incomplete/Completed, daily progress and history
**Speed** (`tests/load/speed.js`: real server, Chromium at 4× slower CPU, 100 ms latency, 10 Mbit/s; median of 5):
| Visit | Before: first paint · usable · downloaded | After |
|---|---|---|
| Visitor, first visit | 676 ms · 1100 ms · 553 KB | 328 ms · 650 ms · 162 KB |
| Visitor, return visit | 736 ms · 1113 ms · 553 KB | 336 ms · 583 ms · 1 KB |
| Member (logged in), return visit | 704 ms · 1557 ms · 568 KB | 332 ms · ~850 ms · 16 KB |

Causes found: (1) all 436 KB of code was inside the page and sent with `no-store`, so every visit downloaded and re-read everything; (2) the Google Fonts stylesheet blocked the first paint; (3) `/api/me` and `/api/state` only started after the whole script had been read (≈400 ms); (4) nothing was compressed by our server.
Changes: the build writes the code to content-named files (`assets/app.<hash>.js`, `assets/gsap.<hash>.js`, `defer`, in `<head>`), cached for a year (`immutable`) by `server.js` and Vercel; the page uses `no-cache` + ETag (unchanged → 304); text files are gzip-compressed (kept until the file changes); fonts load without blocking; a tiny script in `<head>` starts `/api/me` and `/api/state` at once and the app uses those answers; a "Opening Deadline Tracker…" screen appears only if starting takes over ~0.45 s. `standalone.html` keeps the old one-file build for previews.
**Deadline AI Help:** the live check showed Gemini working (200, ~1.7 s) but answering an English question in Hinglish. Cause: the instructions said "reply in Hinglish if the user writes Hinglish" and the earlier Help messages were sent along, so one Hinglish question set the language for later ones. Fix: a fixed rule after the (admin-editable) instructions: reply in the language of the latest message (English / Hinglish / Hindi, detected on the server). Key handling was checked: key only in the server's environment, sent as `x-goog-api-key` header, never in the page or app files (tested); missing key → answers come from the help guide and Settings says "Gemini is off… add GEMINI_API_KEY"; invalid key, quota, timeouts and bad answers already had tests.
**Daily tasks:** Incomplete and Completed sections with counts (the tick moves a task between them), overdue tasks first and marked, "Move to tomorrow" and "Move to a day" (same task, notes kept, the old day recorded once in `movedFrom`, Undo, past days refused). Nothing is completed, moved or deleted by itself.
**Progress and history:** today's Total / Completed / Incomplete / % and bar; History card with Today, Yesterday, any past day, comparison with the day before, 7-day chart. Each day's numbers are saved in the workspace (`dayLog`, saved with the account through `/api/state`) while that day is today and never changed afterwards. No schema change.
**Bug found by a time-dependent test failure (real, fixed):** an email sent straight away (welcome, confirm, reset) was stored as "queued" while being sent; with a slow email service the background job could send a second copy whose text was the "[not stored]" placeholder. Now direct sends are never picked up by the job. New test with a slow fake mail service: red before, green after.
**Test fixed (app was right):** "each reminder once" failed only just after midnight India time, when a correct "Due today" message also arrives; it now checks for duplicates per message.

| Area | Test file | Red first |
|---|---|---|
| Asset build, caching, ETag/304, gzip, private files, no secrets | api-assets (7) | server part failed |
| Help reply language | api-help-gemini (+2) | 2/2 failed |
| Sections, overdue, move to tomorrow/date | daily (rewritten, 9) | 8/9 failed |
| Progress + history | progress (5) | 5/5 failed |
| Slow email duplicate | api-channels (+1) | failed |

Screenshots checked: Daily tasks in light, dark, and 390 px (light and dark): no sideways scrolling, no browser errors.
**Not covered / open:** real email and Telegram still untested with real credentials (not set on Render yet); speed was measured locally, not on Render/Vercel; days before this release have no saved record, so their history is worked out from the tasks (tasks deleted earlier aren't counted).

## 9 Nov 2026 (2): "Portale" redesign: new look for the whole app + landing page
**What changed:** colours, type and shapes for every page, the log-in and setup screens: white and near-black ink, soft grey glass, pale steel-blue accent (`#99b6d2`, with `#46617a` for steel text), Geist / Geist Mono, pill buttons (main buttons ink). Dark theme: neutral near-black (no navy). New landing page for logged-out visitors (`src/portal.js`): loader counting to 100%, a sunset desert drawn in SVG with a glass Deadline Tracker card, the headline blurring in word by word, then scrolling through the card into a white second screen ("Everything Planned / Before It's Due") that leads to sign-up. No outside images; the card shows today's real date only. Email branding changed from copper to ink.
**Not changed:** app code structure, features, accounts, data. No React rewrite (the prompt's stack); the landing is plain JS like the rest of the app.

| Area | Test | Red first |
|---|---|---|
| Palette: white/ink, neutral dark, steel accent; no navy/indigo/violet anywhere in `src/` | motion.test.js (rewritten palette test) | failed |
| Geist + Geist Mono loaded, pill-shaped main buttons | ui-redesign.test.js (+1) | failed |
| Landing: counter never goes back and reaches 100%, words revealed with no leftover blur, Log in / Get started open the right mode, scroll covers the screen and reveals the second screen, scroll back reverses, reduced motion, 390 px phone, who skips it | landing.test.js (7) | 7/7 failed |
| Email branding | api-channels | failed |

Updated for the intended design change: page title, flat headline (no 3D shadow), tests that open "/" now click "Log in" on the landing first.
Screenshots checked: landing at 1440×900 (loader, intro, 5 scroll points), 390×844, 1280×720, 1920×1080, 2560×1080, 768×1024, 375×667 (no sideways scrolling, no errors, Geist loaded); app pages light/dark/phone; log-in light/dark/phone; setup. Fixed after looking: headline running off phones, card covering the headline, sideways tick on the card, a spinner-like ring, phone copy sliding under the nav, white-on-white log-in headline.
**Open:** the pitch page keeps its older look; the landing is light-only (like the original), the app follows the chosen theme.

## 9 Nov 2026 (3): deploy fix
The Vercel deploy of the redesign failed (Render was fine). Cause: Vercel allows a build command of at most 256 characters, and adding the `assets/` copy made it 274. Fix: the copying moved into `node build.js --public`; `vercel.json` now runs only that. New test (api-assets): the command fits the limit, and running it on exactly the files `.vercelignore` uploads produces a complete `public/` (app files, admin, pitch) without source files. The page and app files are byte-identical to before.

## 9 Nov 2026 (4): Deadline AI as a general assistant; to-do completion tracking
**Why Deadline AI "didn't answer"** (checked on the live server's own logs: Google answered every call that morning; the answers were lost in our code):
1. Every answer had to be a JSON object and was capped at 900 tokens. Long answers (timetables, code, explanations) were cut off, the JSON broke, and people saw "I don't know that one" or a pasted help-guide paragraph. Live example: "make a schedule time table next seven days" got a help-guide paragraph.
2. The model could mark normal questions (even "hallo") as "not found" → "I don't know".
3. The style rules forbade code and tables, and the money converter turned "$" in code into "₹".
4. The browser waited forever if the server didn't answer (e.g. asleep).
**Fixes:** plain Markdown answers; up to 4096 tokens (GEMINI_MAX_TOKENS) and 12,000 characters, with a "cut short, ask me to continue" note if Google stops early; code blocks and tables allowed and shown properly (language label, Copy button, sideways scroll inside the block); money conversion skips code; 12 earlier messages for follow-ups (max ~16,000 characters); website questions still only from the guide (`NOT_IN_GUIDE` → honest answer + admin sees it; "Sources: [n]" line → "From the help guide"); server time limit 30 s, browser 60 s; every failure (outage, quota, timeout, network) gets a plain message and "Try again"; "Thinking…" while waiting; one request per question even with double presses. Tasks are still never sent to Gemini (test).
**To-do:** round 30 px tick buttons (bigger touch area), short arrival animation, "Pending" wording, Progress tile, and a weekly line under the 7-day chart ("Last 7 days: X of Y completed (Z%) · Best day").

| Area | Test | Red first |
|---|---|---|
| Code/$ kept, no JSON mode, long answers, cut-short note, greetings, sources/NOT_IN_GUIDE, 12-message history, server timeout | api-help-gemini (+6, 3 updated) | 6/6 failed |
| Code block + Copy + table, Thinking…, no double send, several messages, failure + Try again, browser timeout, network failure, nothing spills out of the window | help-ui (6) | 4/5 failed; overflow test confirmed red against the old CSS |
| Owner's checklist on the real server: 5 tasks, 2 done = 40%, untick = 20%, database status, refresh, edit, delete; round buttons; weekly line | todo-tracking (3) | 3/3 failed |

**Not tested here:** real Gemini answers (the test server uses a fake Gemini; real answers can only be checked on the live site after deploying). No streaming (answers appear whole after "Thinking…").

## 9 Nov 2026 (5): live check after deploy, and inline citations
Deployed `223acc8` (Vercel + Render). Live tests with the real Gemini through the owner's account (they appear in the owner's Help history): general knowledge ("capital of Australia, and why not Sydney?") answered in 2.1 s; a Python prime checker with a code block in 3.1 s; the follow-up "Now write the same thing in Java." understood in 2.3 s (same conversation); the question that failed in the morning ("make a schulde time table next seven days") answered fully with all 7 days in 2.6 s.
Found live: Gemini sometimes cites guide numbers inside sentences ("… study hours [4]."), which showed as "[4]" in the text. Fix (branch `inline-sources`): such numbers become "From the help guide" sources and are removed from the text (not inside code). Test: api-help-gemini (red first).
