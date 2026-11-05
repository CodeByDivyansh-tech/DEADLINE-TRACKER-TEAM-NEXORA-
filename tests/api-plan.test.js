// My Plan on the server: suggestions from the productivity engine, saved only after confirmation; never sent to Gemini.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startServer, signup, fakeGemini } = require("./srv");
const T = require("../lib/time");

let s, g, a, b; const tz = "Asia/Kolkata";
const today = () => T.localDate(Date.now(), tz), plus = n => T.addDays(today(), n);
before(async () => { g = await fakeGemini().start(); s = await startServer({ GEMINI_API_KEY: "test-key", GEMINI_BASE_URL: g.url });
  a = await signup(s.base, "Asha", "asha@example.com"); b = await signup(s.base, "Bilal", "bilal@example.com"); });
after(() => { s.stop(); g.close(); });
const say = (c, message, conversationId) => c.post("/api/plan/chat", { message, conversationId });

test("plan chat: turns a sentence into suggested tasks; nothing is saved until confirmed", async () => {
  const r = await say(a, "I have a Java assignment tomorrow and a Maths test on Friday.");
  assert.equal(r.status, 200);
  const m = r.json.message; const acts = m.proposal.actions;
  assert.equal(m.via, "engine"); assert.match(m.text, /suggested plan/);
  // order-free: on a Thursday "tomorrow" and "Friday" are the same day and the engine may list either first
  assert.deepEqual(acts.filter(x => !x.suggested).map(x => [x.title, x.isDeadline]).sort(), [["Java assignment", true], ["Maths test", true]]);
  assert.equal((await a.get("/api/tasks")).json.total, 0, "nothing saved yet");
  const ok = await a.post("/api/plan/apply", { messageId: m.id });
  assert.equal(ok.json.status, "saved"); assert.equal(ok.json.result.created, acts.filter(x => x.keep).length);
  const saved = (await a.get("/api/tasks")).json.tasks;
  assert.ok(saved.some(t => t.title === "Java assignment" && t.dueDate === plus(1)));
  assert.equal((await a.post("/api/plan/apply", { messageId: m.id })).status, 409, "can't save twice");
});
test("plan chat: the user can edit or untick suggestions before saving; edits are validated", async () => {
  const m = (await say(a, "buy notes, call Priya tomorrow")).json.message;
  assert.equal((await a.post("/api/plan/apply", { messageId: m.id, actions: [{ date: "2026-02-31" }] })).status, 400);
  assert.equal((await a.post("/api/plan/apply", { messageId: m.id, actions: [{ keep: false }, { keep: false }] })).status, 400, "nothing ticked");
  const r = await a.post("/api/plan/apply", { messageId: m.id, actions: [{ keep: true, title: "Buy DBMS notes", date: plus(2) }, { keep: false }] });
  assert.equal(r.json.result.created, 1);
  const t = (await a.get("/api/tasks?q=DBMS%20notes")).json.tasks[0]; assert.equal(t.planDate, plus(2));
  assert.ok(!(await a.get("/api/tasks?q=Priya")).json.tasks.length);
});
test("plan chat: plan my tomorrow, follow-ups in the same conversation, Hinglish and typos", async () => {
  await a.post("/api/tasks", { title: "Physics lab report", dueDate: T.addDays(today(), -1), dueTime: "23:59", estimateHours: 2 });
  const r = await say(a, "plan my tommorw day");
  assert.match(r.json.message.text, /plan for tomorrow/);
  const acts = r.json.message.proposal.actions;
  assert.ok(acts.every(x => x.type === "plan" && x.date === plus(1)));
  assert.match(acts[0].title, /Physics lab report/); assert.match(acts[0].why, /overdue/);
  const conv = r.json.conversationId;
  const r2 = await say(a, "kal kya karna hai", conv);
  assert.equal(r2.json.conversationId, conv); assert.match(r2.json.message.text, /tomorrow/);
  const hist = (await a.get(`/api/conversations/${conv}/messages`)).json.messages;
  assert.equal(hist.length, 4); assert.equal(hist[0].text, "plan my tommorw day");
  const before = (await a.get("/api/tasks?q=Physics")).json.tasks[0];
  await a.post("/api/plan/apply", { messageId: r.json.message.id });
  const after = (await a.get("/api/tasks?q=Physics")).json.tasks[0];
  assert.equal(after.planDate, plus(1)); assert.equal(after.dueDate, before.dueDate, "the deadline itself never moves");
});
test("plan chat: organise, overdue, due, break down, move unfinished, mark done", async () => {
  assert.match((await say(a, "I have too much work. Help me organise it.")).json.message.text, /order of urgency/);
  assert.match((await say(a, "what's overdue?")).json.message.text, /overdue task/);
  const t = (await a.post("/api/tasks", { title: "Website homepage", dueDate: plus(6), estimateHours: 6 })).json.task;
  const br = (await say(a, "break website homepage into smaller steps")).json.message;
  assert.equal(br.proposal.actions[0].type, "steps"); assert.ok(br.proposal.actions[0].steps.length >= 2);
  await a.post("/api/plan/apply", { messageId: br.id });
  const st = (await a.get("/api/state")).json.state; const item = st.workspaces.flatMap(w => w.items).find(i => i.id === t.id);
  assert.ok(item.milestones.length >= 2, "steps are saved on the task");
  await a.post("/api/tasks", { title: "Read chapter 5", planDate: today() });
  const mv = (await say(a, "move my unfinished tasks to tomorrow")).json.message;
  assert.ok(mv.proposal.actions.some(x => x.title === "Read chapter 5" && x.date === plus(1)));
  const dn = (await say(a, "mark read chapter 5 as done")).json.message;
  assert.equal(dn.proposal.actions[0].type, "complete");
  await a.post("/api/plan/apply", { messageId: dn.id });
  assert.equal((await a.get("/api/tasks?q=chapter%205")).json.tasks[0].status, "done");
});
test("plan chat: duplicates are unticked", async () => {
  await a.post("/api/tasks", { title: "Pay hostel fee", planDate: plus(1) });
  const acts = (await say(a, "pay hostel fee tomorrow")).json.message.proposal.actions;
  assert.equal(acts[0].keep, false); assert.ok(acts[0].dupOf);
});
test("privacy: My Plan never sends anything to Gemini, and you can't save someone else's suggestion", async () => {
  g.seen = [];
  await say(a, "plan my day"); await say(a, "I have a Java assignment tomorrow");
  assert.equal(g.chats().length, 0, "no AI call for private planning");
  const m = (await say(a, "call mom tomorrow")).json.message;
  assert.equal((await b.post("/api/plan/apply", { messageId: m.id })).status, 404);
  assert.equal((await b.get("/api/conversations")).json.conversations.length, 0);
});
test("planning endpoints: day, tomorrow, priorities, workload, breakdown", async () => {
  assert.equal((await a.get("/api/plan/tomorrow")).json.date, plus(1));
  assert.ok(Array.isArray((await a.get(`/api/plan/day?date=${today()}`)).json.actions));
  assert.equal((await a.get("/api/plan/day?date=nope")).status, 400);
  assert.ok((await a.get("/api/plan/priorities")).json.tasks.length);
  const w = (await a.get("/api/plan/workload?days=7")).json; assert.equal(w.days.length, 7);
  const t = (await a.get("/api/tasks?q=Website")).json.tasks[0];
  assert.ok((await a.get(`/api/tasks/${t.id}/breakdown`)).json.actions.length);
  assert.equal((await b.get(`/api/tasks/${t.id}/breakdown`)).status, 404);
});
