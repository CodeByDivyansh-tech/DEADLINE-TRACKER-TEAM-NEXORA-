// Admin operations (admins only) and productivity statistics (from real task data).
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startServer, client, signup } = require("./srv");
const T = require("../lib/time");

let s, admin, u;
before(async () => { s = await startServer({}); admin = await signup(s.base, "Admin", "admin@example.com"); u = await signup(s.base, "Riya", "riya@example.com"); });
after(() => s.stop());

test("admin: every admin route is refused to normal users and to visitors", async () => {
  const routes = [["GET", "/api/admin/overview"], ["GET", "/api/admin/users"], ["PATCH", "/api/admin/users/x"], ["DELETE", "/api/admin/users/x"], ["GET", "/api/admin/kb"], ["POST", "/api/admin/kb"], ["PUT", "/api/admin/kb/x"], ["DELETE", "/api/admin/kb/x"], ["POST", "/api/admin/kb/reindex"], ["GET", "/api/admin/questions"], ["PUT", "/api/admin/questions/x"], ["GET", "/api/admin/settings"], ["PUT", "/api/admin/settings"], ["GET", "/api/admin/usage"], ["GET", "/api/admin/errors"]];
  for (const [m, p] of routes) { assert.equal((await u.call(m, p, m === "GET" || m === "DELETE" ? undefined : {})).status, 403, `${m} ${p}`); assert.equal((await client(s.base).call(m, p, m === "GET" || m === "DELETE" ? undefined : {})).status, 401); }
});
test("admin: users list (no task contents), roles, turning an account off, deleting; the last admin is protected", async () => {
  await u.post("/api/tasks", { title: "Riya private task" });
  const list = (await admin.get("/api/admin/users")).json.users;
  const riya = list.find(x => x.email === "riya@example.com"); assert.equal(riya.tasks, 1);
  assert.doesNotMatch(JSON.stringify(list), /Riya private task|pass_hash|salt/);
  assert.equal((await admin.patch("/api/admin/users/" + admin.user.id, { role: "user" })).json.code, "last_admin");
  assert.equal((await admin.patch("/api/admin/users/" + riya.id, { disabled: true })).status, 200);
  assert.equal((await u.get("/api/tasks")).status, 401, "turned-off accounts are signed out");
  assert.equal((await client(s.base).post("/api/auth/login", { email: "riya@example.com", password: "password123" })).status, 403);
  await admin.patch("/api/admin/users/" + riya.id, { disabled: false, role: "admin" });
  assert.equal((await u.post("/api/auth/login", { email: "riya@example.com", password: "password123" })).status, 200, "can log in again once turned back on");
  assert.equal((await admin.get("/api/admin/users")).json.users.find(x => x.id === riya.id).role, "admin");
  const tmp = await signup(s.base, "Temp", "temp@example.com"); await tmp.post("/api/tasks", { title: "temp" });
  assert.equal((await admin.del("/api/admin/users/" + tmp.user.id)).status, 204);
  assert.equal((await client(s.base).post("/api/auth/login", { email: "temp@example.com", password: "password123" })).status, 401);
  assert.equal((await admin.del("/api/admin/users/" + admin.user.id)).status, 400, "can't delete yourself");
});
test("admin: knowledge add / upload / edit / delete, and a new FAQ answers straight away", async () => {
  const q = await u.post("/api/chat", { message: "Can I invite my classmates?" });
  assert.equal(q.json.message.found, false);
  const add = await admin.post("/api/admin/kb", { kind: "faq", title: "Can I invite my classmates?", body: "Inviting classmates isn't available yet. Each person creates their own account.", fromQuestion: q.json.message.qid });
  assert.equal(add.status, 201); assert.ok(add.json.item.chunks >= 1);
  assert.match((await u.post("/api/chat", { message: "can i invite classmates" })).json.message.text, /isn't available yet/);
  assert.ok(!(await admin.get("/api/admin/questions")).json.unanswered.some(x => x.id === q.json.message.qid), "marked resolved");
  const up = await admin.post("/api/admin/kb", { filename: "holidays.html", body: "<h1>Holiday calendar</h1><p>College holidays show on the Calendar page.</p><script>alert(1)</script>" });
  assert.equal(up.json.item.title, "Holiday calendar"); assert.doesNotMatch(up.json.item.body, /script|alert/);
  assert.equal((await admin.post("/api/admin/kb", { filename: "virus.exe", body: "MZ" })).status, 400);
  assert.equal((await admin.put("/api/admin/kb/" + up.json.item.id, { title: "Holiday calendar", body: "Holidays appear on the Calendar page in purple." })).status, 200);
  assert.match((await u.post("/api/chat", { message: "where do college holidays appear" })).json.message.text, /purple/);
  assert.equal((await admin.del("/api/admin/kb/" + up.json.item.id)).status, 204);
  assert.equal((await admin.post("/api/admin/kb/reindex", { all: true })).json.skipped, "no_key");
  const o = (await admin.get("/api/admin/overview")).json; assert.ok(o.knowledge.sources > 10); assert.equal(o.ai.configured, false);
});
test("admin: instructions, usage and errors pages work", async () => {
  assert.equal((await admin.put("/api/admin/settings", { instructions: "" })).status, 400);
  assert.equal((await admin.put("/api/admin/settings", { instructions: "Be brief." })).status, 200);
  assert.equal((await admin.get("/api/admin/settings")).json.instructions, "Be brief.");
  assert.ok(Array.isArray((await admin.get("/api/admin/usage")).json.days));
  assert.ok(Array.isArray((await admin.get("/api/admin/errors")).json.errors));
  const qs = (await admin.get("/api/admin/questions")).json; assert.ok(qs.common.length && qs.recent.length);
});
test("statistics: totals, completion, overdue, priorities, weekly and monthly, from the user's own tasks", async () => {
  const c = await signup(s.base, "Stat", "stat@example.com"); const tz = "Asia/Kolkata", today = T.localDate(Date.now(), tz);
  const mk = o => c.post("/api/tasks", o);
  const t1 = (await mk({ title: "a", priority: "high" })).json.task; await mk({ title: "b", priority: "high" }); await mk({ title: "c", priority: "low", dueDate: T.addDays(today, -2) });
  await mk({ title: "d", dueDate: T.addDays(today, 3) }); await c.post(`/api/tasks/${t1.id}/complete`);
  const st = (await c.get("/api/stats")).json;
  assert.equal(st.total, 4); assert.equal(st.completed, 1); assert.equal(st.pending, 3); assert.equal(st.overdue, 1); assert.equal(st.completionRate, 25);
  assert.deepEqual(st.priorities.high, { total: 2, pending: 1, completed: 1 });
  assert.equal(st.weekly.length, 8); assert.equal(st.weekly[7].completed, 1); assert.equal(st.monthly.length, 6);
  assert.equal((await u.get("/api/stats")).json.total, 1, "each account sees only its own numbers");
});
