// Notification API: history, unread count, mark read, dismiss; only your own.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startServer, signup } = require("./srv");
const T = require("../lib/time");

let s, a, b;
before(async () => { s = await startServer({ REMINDER_INTERVAL_MS: "300" }); a = await signup(s.base, "Asha", "asha@example.com"); b = await signup(s.base, "Bilal", "bilal@example.com"); });
after(() => s.stop());
const wait = ms => new Promise(r => setTimeout(r, ms));

test("notifications: a task due within the hour is delivered by the background job; read and dismiss work", async () => {
  const soon = Date.now() + 30 * 60e3, tz = "Asia/Kolkata";
  await a.post("/api/tasks", { title: "Submit form", dueDate: T.localDate(soon, tz), dueTime: T.localTime(soon, tz) });
  let n; for (let k = 0; k < 20; k++) { n = (await a.get("/api/notifications")).json; if (n.notifications.some(x => x.kind === "reminder")) break; await wait(150); }
  const r = n.notifications.find(x => x.kind === "reminder");
  assert.ok(r, JSON.stringify(n)); assert.match(r.message, /Submit form" is due in/); assert.equal(r.read, false); assert.equal(r.deliveryStatus, "delivered");
  assert.ok(n.unread >= 1);
  assert.ok((await a.get("/api/notifications/upcoming")).json.notifications.some(x => x.kind === "overdue"), "the overdue one is scheduled for later");
  assert.equal((await b.get("/api/notifications")).json.notifications.length, 0, "other people don't see it");
  assert.equal((await b.post("/api/notifications/read", { ids: [r.id] })).json.unread, 0);
  assert.equal((await a.get("/api/notifications")).json.notifications.find(x => x.id === r.id).read, false, "someone else can't mark yours read");
  assert.equal((await a.post("/api/notifications/read", { ids: [r.id] })).status, 200);
  assert.equal((await a.get("/api/notifications?unread=1")).json.notifications.some(x => x.id === r.id), false);
  assert.equal((await b.del("/api/notifications/" + r.id)).status, 404);
  assert.equal((await a.del("/api/notifications/" + r.id)).status, 204);
  assert.equal((await a.post("/api/notifications/read", { all: true })).json.unread, 0);
  assert.equal((await a.post("/api/notifications/read", {})).status, 400);
});
