// Reminders and notifications.
// A background job runs every minute (and right after any task change). For each user it works out which
// notifications *should* exist, in the user's own time zone, and stores them with a scheduled time:
//   reminder   - before a deadline (the task's own reminder times, or the user's defaults)
//   due_today  - on the morning of the due day
//   overdue    - when the deadline passes
//   summary    - "You have N pending tasks today", once a day
//   high_done  - "You've completed all your high-priority tasks for today", once a day
// Each one has a unique key per user, so it can never be created twice. When its time comes it is marked
// "delivered" and shows in the app's bell (in-app delivery). Email or phone push would need extra services
// and are not set up.
const crypto = require("crypto");
const { ApiError, V } = require("../http");
const T = require("../time");

const MIN = 60000;
const nid = () => "n_" + crypto.randomBytes(9).toString("base64url");
function inQuiet(prefs, hhmm){
  if (!prefs.quietOn) return false;
  const a = prefs.quietFrom, b = prefs.quietTo;
  return a <= b ? hhmm >= a && hhmm < b : hhmm >= a || hhmm < b;
}
function beforeText(title, mins, dueAt, tz, now){
  const today = T.localDate(now, tz), dd = T.localDate(dueAt, tz), tt = T.niceTime(T.localTime(dueAt, tz));
  const k = T.daysBetween(today, dd);
  if (mins >= 2880) return `Your "${title}" deadline is approaching: it's due ${k <= 1 ? T.niceDate(dd, today) : `in ${k} days (${T.niceDate(dd)})`} at ${tt}.`;
  if (mins >= 1440) return k === 1 ? `Your "${title}" deadline is tomorrow at ${tt}. Don't forget to complete and submit it!` : `Your "${title}" deadline is ${T.niceDate(dd, today)} at ${tt}.`;
  if (mins >= 60) return `"${title}" is due in ${Math.round(mins / 60)} hour${mins >= 120 ? "s" : ""} (${tt}).`;
  if (mins > 0) return `"${title}" is due in ${mins} minutes (${tt}).`;
  return `"${title}" is due now.`;
}

function createNotifications(db, { prefsOf, log }){
  let lastRun = null, running = false;
  const ins = db.prepare(`INSERT OR IGNORE INTO notifications (id, user_id, task_id, kind, message, scheduled_at, delivery_status, dedupe_key, created_at)
                          VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)`);
  // Works out every notification a user should have, from the tasks table.
  function desired(user, now){
    const tz = user.timezone, prefs = prefsOf(user);
    const today = T.localDate(now, tz), nowHHMM = T.localTime(now, tz);
    const out = [];
    const tasks = db.prepare("SELECT * FROM tasks WHERE user_id = ? AND status <> 'done'").all(user.id);
    for (const t of tasks) {
      if (t.due_at != null) {
        const offs = (t.reminders ? JSON.parse(t.reminders) : prefs.before).filter(m => m > 0 || t.reminders).sort((a, b) => b - a);
        // Only the most recent reminder that is already due is delivered; earlier ones it replaces are skipped,
        // so someone opening the app late gets one message, not three.
        const due = offs.filter(m => now >= t.due_at - m * MIN && now < t.due_at);
        const latest = due.length ? Math.min(...due) : null;
        for (const m of offs) {
          const at = t.due_at - m * MIN;
          if (at > t.due_at) continue;
          out.push({ key: `${t.id}:r${m}:${t.due_at}`, task: t.id, kind: "reminder", at, skip: now >= t.due_at || (latest != null && m > latest && now >= at),
            text: beforeText(t.title, m, t.due_at, tz, Math.max(now, at)) });
        }
        if (prefs.dueToday) {
          const morning = T.zonedToUtc(t.due_date, "08:00", tz);
          out.push({ key: `${t.id}:today:${t.due_date}`, task: t.id, kind: "due_today", at: Math.min(morning, t.due_at - 60 * MIN), skip: now >= t.due_at, text: `"${t.title}" is due today at ${T.niceTime(t.due_time)}.` });
        }
        if (prefs.overdue) out.push({ key: `${t.id}:od:${t.due_at}`, task: t.id, kind: "overdue", at: t.due_at, text: `"${t.title}" is overdue (it was due ${T.niceDate(t.due_date, T.localDate(t.due_at, tz) === today ? today : null)} at ${T.niceTime(t.due_time)}). Open it to make a recovery plan.` });
      } else if (t.plan_date && t.plan_time) {
        const at = T.zonedToUtc(t.plan_date, t.plan_time, tz);
        const offs = t.reminders ? JSON.parse(t.reminders) : [15];
        for (const m of offs) out.push({ key: `${t.id}:p${m}:${at}`, task: t.id, kind: "reminder", at: at - m * MIN, text: m ? `"${t.title}" starts in ${m} minutes (${T.niceTime(t.plan_time)}).` : `Time for "${t.title}".` });
      }
    }
    // once-a-day messages, from 08:00 in the user's time zone
    if (nowHHMM >= "08:00") {
      const todays = db.prepare("SELECT status, priority, due_at FROM tasks WHERE user_id = ? AND (plan_date = ? OR due_date = ?)").all(user.id, today, today);
      const pending = todays.filter(x => x.status !== "done" && (x.due_at == null || x.due_at >= now)).length;
      if (prefs.dailySummary && pending) out.push({ key: `sum:${today}`, task: null, kind: "summary", at: now, text: `You have ${pending} pending task${pending === 1 ? "" : "s"} today.` });
      const high = todays.filter(x => x.priority === "high");
      if (prefs.highDone && high.length && high.every(x => x.status === "done")) out.push({ key: `high:${today}`, task: null, kind: "high_done", at: now, text: `You've completed all your high-priority tasks for today. Well done!` });
    }
    return out;
  }
  function syncUser(user, now = Date.now()){
    const want = desired(user, now); const keys = new Set(want.map(w => w.key));
    db.tx(() => {
      for (const w of want) {
        ins.run(nid(), user.id, w.task, w.kind, w.text, w.at, w.key, now);
        if (w.skip) db.prepare("UPDATE notifications SET delivery_status = 'skipped' WHERE user_id = ? AND dedupe_key = ? AND delivery_status = 'pending'").run(user.id, w.key);
        else db.prepare("UPDATE notifications SET message = ?, scheduled_at = ? WHERE user_id = ? AND dedupe_key = ? AND delivery_status = 'pending'").run(w.text, w.at, user.id, w.key);
      }
      // a task was finished, deleted or moved: its future notifications are cancelled
      const pend = db.prepare("SELECT id, dedupe_key FROM notifications WHERE user_id = ? AND delivery_status = 'pending'").all(user.id);
      for (const p of pend) if (!keys.has(p.dedupe_key)) db.prepare("UPDATE notifications SET delivery_status = 'cancelled' WHERE id = ?").run(p.id);
      // deliver what is due now
      db.prepare("UPDATE notifications SET delivery_status = 'delivered', delivered_at = ? WHERE user_id = ? AND delivery_status = 'pending' AND scheduled_at <= ?").run(now, user.id, now);
    });
  }
  function runOnce(now = Date.now()){
    if (running) return; running = true;
    try {
      const users = db.prepare("SELECT * FROM users WHERE disabled = 0").all();
      for (const u of users) { try { syncUser(u, now); } catch (e) { log("reminders", e); } }
      // keep history for 90 days
      db.prepare("DELETE FROM notifications WHERE created_at < ? AND delivery_status <> 'pending'").run(now - 90 * 864e5);
      lastRun = now;
    } finally { running = false; }
  }
  let timer = null; const soon = new Map();
  return {
    start(intervalMs){ runOnce(); timer = setInterval(() => runOnce(), intervalMs); timer.unref(); },
    stop(){ clearInterval(timer); },
    runOnce, syncUser,
    // after a task change: refresh that user's schedule shortly (batched)
    touch(userId){ if (soon.has(userId)) return; soon.set(userId, setTimeout(() => { soon.delete(userId); const u = db.prepare("SELECT * FROM users WHERE id = ? AND disabled = 0").get(userId); if (u) { try { syncUser(u); } catch (e) { log("reminders", e); } } }, 300)); },
    status: () => ({ lastRun: lastRun ? new Date(lastRun).toISOString() : null }),
    inQuiet
  };
}

const notifRow = r => ({ id: r.id, taskId: r.task_id, kind: r.kind, message: r.message, scheduledAt: new Date(r.scheduled_at).toISOString(),
  deliveryStatus: r.delivery_status, deliveredAt: r.delivered_at ? new Date(r.delivered_at).toISOString() : null, read: !!r.read_at, channel: r.channel });
function routes(r, { db, notifications, auth }){
  r.add("GET", "/api/notifications", (c) => {
    const where = ["user_id = ?", "delivery_status = 'delivered'"], args = [c.user.id];
    if (c.query.unread === "1" || c.query.unread === "true") where.push("read_at IS NULL");
    if (c.query.since) { const s = Date.parse(c.query.since); if (!Number.isFinite(s)) throw new ApiError(400, "invalid_since", "since must be a date-time."); where.push("delivered_at > ?"); args.push(s); }
    const limit = V.num(c.query.limit, "limit", { min: 1, max: 200, int: true }) || 60;
    const rows = db.prepare(`SELECT * FROM notifications WHERE ${where.join(" AND ")} ORDER BY scheduled_at DESC LIMIT ?`).all(...args, limit);
    const unread = db.prepare("SELECT COUNT(*) n FROM notifications WHERE user_id = ? AND delivery_status = 'delivered' AND read_at IS NULL").get(c.user.id).n;
    const p = auth.prefsOf(c.user);
    return { notifications: rows.map(notifRow), unread, quietNow: notifications.inQuiet(p, require("../time").localTime(Date.now(), c.user.timezone)) };
  }, { auth: true });
  r.add("GET", "/api/notifications/upcoming", (c) => {
    const rows = db.prepare("SELECT * FROM notifications WHERE user_id = ? AND delivery_status = 'pending' ORDER BY scheduled_at LIMIT 100").all(c.user.id);
    return { notifications: rows.map(notifRow) };
  }, { auth: true });
  r.add("POST", "/api/notifications/read", async (c) => {
    const b = await c.json();
    if (b.all === true) db.prepare("UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL AND delivery_status = 'delivered'").run(Date.now(), c.user.id);
    else {
      if (!Array.isArray(b.ids) || !b.ids.length || b.ids.length > 200) throw new ApiError(400, "invalid_ids", "Send ids (a list) or all: true.");
      const st = db.prepare("UPDATE notifications SET read_at = COALESCE(read_at, ?) WHERE id = ? AND user_id = ?");
      b.ids.forEach(id => st.run(Date.now(), String(id), c.user.id));
    }
    return { unread: db.prepare("SELECT COUNT(*) n FROM notifications WHERE user_id = ? AND delivery_status = 'delivered' AND read_at IS NULL").get(c.user.id).n };
  }, { auth: true });
  r.add("DELETE", "/api/notifications/:id", (c) => {
    const x = db.prepare("DELETE FROM notifications WHERE id = ? AND user_id = ? AND delivery_status <> 'pending'").run(c.params.id, c.user.id);
    if (!x.changes) throw new ApiError(404, "not_found", "Notification not found.");
    return { status: 204 };
  }, { auth: true });
}
module.exports = { createNotifications, routes, inQuiet };
