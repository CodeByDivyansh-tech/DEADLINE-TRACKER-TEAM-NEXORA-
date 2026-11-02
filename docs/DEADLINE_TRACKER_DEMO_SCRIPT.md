# Deadline Tracker: Demo Script (Team Nexora)

## Before the demo (10 minutes before)
1. Open **https://deadline-tracker-team-nexora.vercel.app**. If it says "Starting up…", wait. The free server wakes in up to a minute.
2. Log in. Make sure the account still exists: the free Render plan resets data on redeploy; re-create it if needed.
3. Use a **Student** workspace **with sample data** (Settings → Profile → New workspace if needed).
4. Open the **Deadline AI → Help** tab once to confirm it says "Help guide + Google Gemini". If it says "Gemini off", check `GEMINI_API_KEY` on Render.
5. Clear the bell (Mark all read). Zoom the browser to 110–125%. Keep a second tab on `/admin`.
6. **Backup:** the app running locally (`node build.js` then `node server.js`) in case the internet fails.

## Five-minute script
### 1. Introduction (0:00–0:30)
**Do:** show the Today page.
**Say:** "We're Team Nexora. This is Deadline Tracker, a task app that tells you whether you'll finish on time, not just what's due."

### 2. Problem (0:30–1:00)
**Do:** point at the "things need your attention" line.
**Say:** "Students rarely forget deadlines completely. We start too late, or three deadlines land in the same week. A normal list only turns red when it's already too late."

### 3. Website overview (1:00–1:40)
**Do:** move over the sidebar (Today, Assistant, Calendar, Deadlines, More), the Today tabs and Next deadlines.
**Say:** "Today answers one question: what should I do now? Today's tasks, the next deadlines and anything risky. Only four main pages."

### 4. Adding and managing a task (1:40–2:20)
**Do:** type `Java assignment due Friday 5pm ~4h, buy notes, call teammate tomorrow` → **Add**. Tick one to-do; show **Undo**.
**Say:** "One box, like sending a message. It found one deadline with a 4-hour estimate and two to-dos. Ticking completes a task, and there's always Undo."

### 5. Deadline management (2:20–3:00)
**Do:** open **Deadlines** → point at the radar → open an **At risk** item → read its reason → **Suggest a backward plan**.
**Say:** "Every deadline gets a risk level with a reason: the work left compared with the hours I have before it's due. It's a clear rule we can explain. Here it splits the work into steps before the deadline."

### 6. Important features (3:00–3:30)
**Do:** open an **Overdue** item → **Rescue**. Show the four steps and the extension message.
**Say:** "If I'm already late, Rescue mode breaks the rest into small steps, makes a new schedule and drafts an extension request that I send myself. My deadline never changes unless I confirm."

### 7. AI demonstration (3:30–4:20)
**Do:** click **Deadline AI** → **My Plan** → type `plan my tomorrow` → show the reasons → **Save to my tasks**. Then **Help** → `How do I delete a task?` → point at the source.
**Say:** "My Plan plans from my own tasks, on our server. My tasks never go to an outside AI, and nothing is saved until I approve. Help uses Google Gemini, but website answers come only from our help guide, with the source shown. If it doesn't know, it says so."
**If AI is slow or out of quota:** "Help falls back to the guide, and My Plan doesn't need Gemini at all."

### 8. Differentiation (4:20–4:45)
**Do:** open the bell, then **More → Reports**.
**Say:** "Reminders come from the server at the right time in my time zone, even when the app is closed. Statistics come from real data. Compared with a calendar or a to-do list, we focus on finishing on time, we explain every warning, and we keep your tasks private."

### 9. Conclusion (4:45–5:00)
**Do:** return to Today.
**Say:** "Deadline Tracker warns you before you fall behind, explains why and helps you fix it, privately. Thank you. We're happy to take questions."

## Two-minute version
1. **0:00:** "Deadline Tracker tells you if you'll finish on time." Show Today.
2. **0:20:** Add `DBMS assignment due Fri 5pm ~5h, Maths test Monday`. "One box, two deadlines."
3. **0:45:** Deadlines → radar → read an At risk reason. "Work left versus hours available."
4. **1:10:** Deadline AI → My Plan → `plan my tomorrow` → Save. "Suggestions from my own tasks; saved only when I approve; no outside AI."
5. **1:35:** Help → `How do I set a reminder?` "Gemini answers from our help guide, with sources."
6. **1:50:** "Warns early, explains why, plans the fix. Thank you."

## Key speaking points
- **Warns before**, **explains why**, **you approve**, **private by design**.
- Risk = work left ÷ hours available, a clear rule.
- My Plan = our rules; Help = Gemini + help guide.
- Server reminders in your time zone, even when the app is closed.
- Be honest about limits: free hosting resets data, reminders are in-app, team invites are planned.

## Who says what (suggested split for 4 people)
| Person | Part |
|---|---|
| 1 | Intro + problem (sections 1–2) |
| 2 | Overview + adding tasks + deadlines (3–5) |
| 3 | Rescue + AI (6–7) |
| 4 | Differentiation + conclusion + leads Q&A (8–9) |
