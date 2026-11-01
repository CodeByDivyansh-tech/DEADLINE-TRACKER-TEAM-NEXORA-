// Task API: create, read, update, delete, complete/reopen, filters, search, date views, validation, ownership.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startServer, signup } = require("./srv");
const T = require("../lib/time");

let s, a, b; const tz = "Asia/Kolkata";
const today = () => T.localDate(Date.now(), tz), plus = n => T.addDays(today(), n);
before(async () => { s = await startServer({}); a = await signup(s.base, "Asha", "asha@example.com"); b = await signup(s.base, "Bilal", "bilal@example.com"); });
after(() => s.stop());

test("tasks: create with validation, read back, and the deadline time is stored for the user's time zone", async () => {
  const r = await a.post("/api/tasks", { title: "  Java assignment ", description: "Chapter 4", dueDate: plus(2), dueTime: "17:00", priority: "high", category: "assignment", estimateHours: 4 });
  assert.equal(r.status, 201);
  const t = r.json.task;
  assert.equal(t.title, "Java assignment"); assert.equal(t.priority, "high"); assert.equal(t.status, "todo");
  assert.equal(t.dueAt, new Date(T.zonedToUtc(plus(2), "17:00", tz)).toISOString(), "17:00 India time");
  assert.equal((await a.get("/api/tasks/" + t.id)).json.task.title, "Java assignment");
  for (const [body, field] of [[{}, "title"], [{ title: "x", dueDate: "2026-02-31" }, "dueDate"], [{ title: "x", dueDate: plus(1), dueTime: "25:00" }, "dueTime"], [{ title: "x", priority: "urgent" }, "priority"], [{ title: "x", status: "finished" }, "status"], [{ title: "x".repeat(201) }, "title"], [{ title: "x", estimateHours: -2 }, "estimateHours"], [{ title: "x", dueTime: "10:00" }, "dueTime"]]) {
    const e = await a.post("/api/tasks", body); assert.equal(e.status, 400, JSON.stringify(body)); assert.match(e.json.code, new RegExp(field), field);
  }
});
test("tasks: update, complete, reopen and delete", async () => {
  const t = (await a.post("/api/tasks", { title: "Lab record", planDate: today() })).json.task;
  const u = await a.patch("/api/tasks/" + t.id, { title: "Physics lab record", dueDate: plus(1), dueTime: "10:00", priority: "low", progress: 40 });
  assert.equal(u.json.task.title, "Physics lab record"); assert.equal(u.json.task.progress, 40); assert.equal(u.json.task.dueDate, plus(1));
  const d = await a.post(`/api/tasks/${t.id}/complete`); assert.equal(d.json.task.status, "done"); assert.ok(d.json.task.completedAt); assert.equal(d.json.task.progress, 100);
  const o = await a.post(`/api/tasks/${t.id}/reopen`); assert.equal(o.json.task.status, "todo"); assert.equal(o.json.task.completedAt, null);
  assert.equal((await a.del("/api/tasks/" + t.id)).status, 204);
  assert.equal((await a.get("/api/tasks/" + t.id)).status, 404);
});
test("tasks: filters by status and priority, search, and today / tomorrow / overdue / upcoming views", async () => {
  const mk = o => a.post("/api/tasks", o);
  const past = T.addDays(today(), -1);
  await mk({ title: "Overdue essay", dueDate: past, dueTime: "09:00", priority: "high" });
  const soon = Date.now() + 90 * 60e3;   // not overdue whatever the time of day the tests run
  await mk({ title: "Due today report", dueDate: T.localDate(soon, tz), dueTime: T.localTime(soon, tz) });
  await mk({ title: "Gym", planDate: today(), priority: "low" });
  await mk({ title: "Call Priya", planDate: plus(1) });
  await mk({ title: "Quiz prep 100% done", dueDate: plus(5), status: "done" });
  await mk({ title: "Hackathon submission", dueDate: plus(10) });
  const titles = async q => (await a.get("/api/tasks" + q)).json.tasks.map(t => t.title);
  assert.ok((await titles("/overdue")).includes("Overdue essay"));
  assert.ok(!(await titles("/overdue")).includes("Due today report"));
  const tdy = await titles("/today"); assert.ok(tdy.includes("Gym") && !tdy.includes("Call Priya"));
  assert.equal(tdy.includes("Due today report"), T.localDate(soon, tz) === today(), "a deadline due today is in Today");
  assert.ok((await titles("/tomorrow")).includes("Call Priya"));
  const up = await titles("/upcoming?days=14"); assert.ok(up.includes("Hackathon submission") && !up.includes("Quiz prep 100% done") && !up.includes("Overdue essay"));
  assert.deepEqual(await titles("?status=done"), ["Quiz prep 100% done"]);
  assert.ok((await titles("?priority=low")).every(t => t === "Gym"));
  assert.deepEqual(await titles("?q=essay"), ["Overdue essay"]);
  assert.deepEqual(await titles("?q=" + encodeURIComponent("100%")), ["Quiz prep 100% done"], "% is matched literally");
  assert.deepEqual(await titles("?q=" + encodeURIComponent("' OR 1=1 --")), [], "SQL in search is just text");
  assert.equal((await a.get("/api/tasks?status=bogus")).status, 400);
  assert.equal((await a.get("/api/tasks?sort=password")).status, 400);
  const from = await titles(`?from=${plus(3)}&to=${plus(12)}`); assert.ok(from.includes("Hackathon submission") && !from.includes("Due today report"));
  const pg = (await a.get("/api/tasks?limit=2&offset=0")).json; assert.equal(pg.tasks.length, 2); assert.ok(pg.total > 2);
});
test("privacy: another account can't see, change, complete or delete your task", async () => {
  const t = (await a.post("/api/tasks", { title: "Asha secret plan" })).json.task;
  assert.equal((await b.get("/api/tasks/" + t.id)).status, 404);
  assert.equal((await b.patch("/api/tasks/" + t.id, { title: "hacked" })).status, 404);
  assert.equal((await b.post(`/api/tasks/${t.id}/complete`)).status, 404);
  assert.equal((await b.del("/api/tasks/" + t.id)).status, 404);
  assert.ok(!(await b.get("/api/tasks?q=secret")).json.tasks.length);
  assert.equal((await a.get("/api/tasks/" + t.id)).json.task.title, "Asha secret plan", "unchanged");
  // can't take over someone's task id through the app's save either
  const st = (await b.get("/api/state")).json;
  const ws = { id: "w_b1", name: "B", mode: "personal", items: [{ id: t.id, title: "stolen" }], settings: {} };
  const put = await b.put("/api/state", { state: { v: 2, active: "w_b1", workspaces: [ws] }, base: st.version });
  assert.equal(put.status, 409); assert.equal(put.json.code, "id_taken");
  assert.equal((await a.get("/api/tasks/" + t.id)).json.task.title, "Asha secret plan");
});
test("the app's save (/api/state) and the task API share the same tasks table", async () => {
  const c = await signup(s.base, "Dev", "dev@example.com");
  const state = { v: 2, user: { name: "Dev" }, active: "w1", workspaces: [{ id: "w1", name: "Studies", mode: "student", groups: [], members: [{ id: "me", name: "Dev" }], settings: { hoursPerDay: 3, workdays: [0,1,2,3,4,5,6] },
    items: [{ id: "d-1", title: "DBMS assignment", due: `${plus(3)}T17:00`, priority: "high", status: "doing", estimate: 5, progress: 20, type: "assignment", milestones: [{ id: "m1", text: "ER diagram", done: true }] }] }] };
  assert.equal((await c.put("/api/state", { state, base: 0 })).json.version, 1);
  const t = (await c.get("/api/tasks/d-1")).json.task;
  assert.equal(t.dueDate, plus(3)); assert.equal(t.dueTime, "17:00"); assert.equal(t.status, "doing"); assert.equal(t.estimateHours, 5); assert.equal(t.category, "assignment");
  await c.post("/api/tasks/d-1/complete");
  await c.post("/api/tasks", { title: "Made through the API", planDate: today(), workspaceId: "w1" });
  const back = (await c.get("/api/state")).json;
  assert.ok(back.version > 1, "API changes bump the version so the app reloads");
  const items = back.state.workspaces[0].items;
  const d = items.find(i => i.id === "d-1"); assert.equal(d.status, "done"); assert.equal(d.milestones[0].text, "ER diagram", "app-only fields survive");
  assert.ok(items.some(i => i.title === "Made through the API" && i.plan === today()));
  // removing it in the app deletes the row
  back.state.workspaces[0].items = items.filter(i => i.id !== "d-1");
  assert.equal((await c.put("/api/state", { state: back.state, base: back.version })).status, 200);
  assert.equal((await c.get("/api/tasks/d-1")).status, 404);
  // an old copy can't overwrite newer data
  const stale = await c.put("/api/state", { state: back.state, base: back.version });
  assert.equal(stale.status, 409); assert.ok(stale.json.state, "the newest copy comes back");
  // invalid items are rejected with a clear message
  const bad = JSON.parse(JSON.stringify(stale.json.state)); bad.workspaces[0].items.push({ id: "d-9", title: "Broken", due: "2026-13-45T10:00" });
  const r = await c.put("/api/state", { state: bad, base: stale.json.version }); assert.equal(r.status, 400); assert.match(r.json.error, /Broken/);
});
test("a task created through the API without any workspace gets a default one", async () => {
  const c = await signup(s.base, "New", "new@example.com");
  const t = (await c.post("/api/tasks", { title: "First task" })).json.task;
  const st = (await c.get("/api/state")).json.state;
  assert.equal(st.workspaces.length, 1); assert.equal(st.workspaces[0].id, t.workspaceId); assert.equal(st.workspaces[0].items[0].title, "First task");
});
