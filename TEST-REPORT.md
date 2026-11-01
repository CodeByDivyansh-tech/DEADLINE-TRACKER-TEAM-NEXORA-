# Test report: Deadline Tracker

**Result: 140 of 140 tests pass** (two full runs in a row, about 3.5 minutes each).
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
