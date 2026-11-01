// Server reminder job: right time in the user's time zone, no duplicates, overdue, summaries, preferences, read/unread.
const { test, before } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs"); const os = require("os"); const path = require("path");
const { openDb } = require("../lib/db");
const { createAuth } = require("../lib/modules/auth");
const Tasks = require("../lib/modules/tasks");
const Notifs = require("../lib/modules/notifications");
const T = require("../lib/time");

let db, auth, tasks, notifs;
before(() => {
  db = openDb(fs.mkdtempSync(path.join(os.tmpdir(), "dt-rem-")));
  auth = createAuth(db, { cookieSecure: false, adminEmail: "" });
  notifs = Notifs.createNotifications(db, { prefsOf: auth.prefsOf, log: () => {} });
  tasks = Tasks.createTasks(db, {});
});
const userFor = async (email, tz) => { const r = await auth.signup({ name: "U", email, password: "password123", timezone: tz }, "1.1.1." + email.length); return db.prepare("SELECT * FROM users WHERE id = ?").get(r.user.id); };
const list = (u, status = "delivered") => db.prepare("SELECT * FROM notifications WHERE user_id = ? AND delivery_status = ? ORDER BY scheduled_at").all(u.id, status);
const at = (date, time, tz) => T.zonedToUtc(date, time, tz);

test("reminders: scheduled at the right local time, delivered only when due", async () => {
  const u = await userFor("a@x.io", "Asia/Kolkata");
  tasks.create(u, { title: "Java assignment", dueDate: "2026-11-05", dueTime: "17:00" });
  notifs.runOnce(at("2026-11-01", "10:00", "Asia/Kolkata"));
  const pend = list(u, "pending");
  const day = pend.find(n => n.dedupe_key.includes(":r1440:"));
  assert.equal(new Date(day.scheduled_at).toISOString(), "2026-11-04T11:30:00.000Z", "1 day before 17:00 India time");
  assert.equal(list(u).length, 0, "nothing delivered yet");
  notifs.runOnce(at("2026-11-04", "17:05", "Asia/Kolkata"));
  const got = list(u); assert.equal(got.length, 1); assert.match(got[0].message, /deadline is tomorrow at 5:00 pm/);
  notifs.runOnce(at("2026-11-04", "17:06", "Asia/Kolkata")); notifs.runOnce(at("2026-11-04", "17:07", "Asia/Kolkata"));
  assert.equal(list(u).length, 1, "no duplicates");
});
test("reminders: the same task in two time zones fires at each user's own local time", async () => {
  const ny = await userFor("ny@x.io", "America/New_York");
  tasks.create(ny, { title: "Essay", dueDate: "2026-11-03", dueTime: "09:00" });
  notifs.runOnce(at("2026-11-01", "12:00", "America/New_York"));
  const r = list(ny, "pending").find(n => n.dedupe_key.includes(":r60:"));
  assert.equal(new Date(r.scheduled_at).toISOString(), "2026-11-03T13:00:00.000Z", "08:00 New York after the clock change");
});
test("reminders: due today in the morning, then overdue; finishing a task cancels what's left", async () => {
  const u = await userFor("b@x.io", "Asia/Kolkata");
  const t1 = tasks.create(u, { title: "Lab record", dueDate: "2026-11-02", dueTime: "18:00" });
  const t2 = tasks.create(u, { title: "Fee payment", dueDate: "2026-11-02", dueTime: "16:00" });
  notifs.runOnce(at("2026-11-02", "08:30", "Asia/Kolkata"));
  assert.ok(list(u).some(n => n.kind === "due_today" && /Lab record" is due today at 6:00 pm/.test(n.message)));
  tasks.setDone(u, t2.id, true);
  notifs.runOnce(at("2026-11-02", "08:31", "Asia/Kolkata"));
  assert.ok(list(u, "cancelled").some(n => n.task_id === t2.id), "a finished task's reminders are cancelled");
  notifs.runOnce(at("2026-11-02", "18:30", "Asia/Kolkata"));
  assert.ok(list(u).some(n => n.kind === "overdue" && n.task_id === t1.id));
  assert.ok(!list(u).some(n => n.kind === "overdue" && n.task_id === t2.id));
});
test("reminders: when the server was off, only the latest reminder is delivered (no pile-up)", async () => {
  const u = await userFor("c@x.io", "Asia/Kolkata");
  tasks.create(u, { title: "Quiz", dueDate: "2026-11-10", dueTime: "12:00", reminders: [4320, 1440, 60] });
  notifs.runOnce(at("2026-11-01", "09:00", "Asia/Kolkata"));
  notifs.runOnce(at("2026-11-10", "11:30", "Asia/Kolkata"));   // the server comes back 30 minutes before
  const got = list(u).filter(n => n.kind === "reminder");
  assert.equal(got.length, 1); assert.match(got[0].dedupe_key, /:r60:/);
  assert.equal(list(u, "skipped").filter(n => n.kind === "reminder").length, 2);
});
test("reminders: daily summary and 'all high-priority done', once a day, from 08:00 local time", async () => {
  const u = await userFor("d@x.io", "Asia/Kolkata");
  const h = tasks.create(u, { title: "Important", planDate: "2026-11-03", priority: "high" });
  tasks.create(u, { title: "Small", planDate: "2026-11-03", priority: "low" });
  notifs.runOnce(at("2026-11-03", "07:30", "Asia/Kolkata"));
  assert.ok(!list(u).some(n => n.kind === "summary"), "not before 08:00");
  notifs.runOnce(at("2026-11-03", "08:05", "Asia/Kolkata"));
  assert.ok(list(u).some(n => n.kind === "summary" && /2 pending tasks today/.test(n.message)));
  tasks.setDone(u, h.id, true);
  notifs.runOnce(at("2026-11-03", "10:00", "Asia/Kolkata")); notifs.runOnce(at("2026-11-03", "11:00", "Asia/Kolkata"));
  assert.equal(list(u).filter(n => n.kind === "high_done").length, 1);
});
test("reminders: preferences turn types off and change default times", async () => {
  const u0 = await userFor("e@x.io", "Asia/Kolkata");
  auth.updateProfile(u0, { notifyPrefs: { before: [180], overdue: false, dueToday: false, dailySummary: false } });
  const u = db.prepare("SELECT * FROM users WHERE id = ?").get(u0.id);
  tasks.create(u, { title: "Thing", dueDate: "2026-11-04", dueTime: "15:00" });
  notifs.runOnce(at("2026-11-05", "09:00", "Asia/Kolkata"));
  const all = db.prepare("SELECT * FROM notifications WHERE user_id = ?").all(u.id);
  assert.ok(all.every(n => n.kind === "reminder" && /:r180:/.test(n.dedupe_key)), all.map(n => n.dedupe_key).join());
});
