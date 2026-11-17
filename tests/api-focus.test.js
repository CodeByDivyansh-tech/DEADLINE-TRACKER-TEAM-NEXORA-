// Deep Focus sessions on the server: one open session per person, timestamps kept in the database, focused time
// worked out from them, recovery after a closed browser, finished sessions locked, statistics, and privacy between
// accounts. The server's clock is moved forward through DT_TEST_CLOCK_FILE (a test-only setting).
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs"); const os = require("os"); const path = require("path");
const { startServer, signup, client } = require("./srv");

const MIN = 60000;
const clockFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "dt-clock-")), "offset");
let offset = 0;
const advance = ms => { offset += ms; fs.writeFileSync(clockFile, String(offset)); };
let s, a, b, n = 0;
before(async () => { fs.writeFileSync(clockFile, "0"); s = await startServer({ DT_TEST_CLOCK_FILE: clockFile }); a = await signup(s.base, "Asha", "asha@example.com"); b = await signup(s.base, "Ben", "ben@example.com"); });
after(() => s.stop());
const fresh = () => signup(s.base, "Student" + (++n), `student${n}@example.com`);
const start = (c, o = {}) => c.post("/api/focus/sessions", Object.assign({ minutes: 45, mode: "strict", title: "Complete assignment operators practical", subject: "Java Programming", topic: "Assignment operators", clientKey: "k" + Math.random() }, o));
const act = (c, id, action, body = {}) => c.post(`/api/focus/sessions/${id}/${action}`, body);
// real time passes too (a few milliseconds per request), so timings are compared to within 3 seconds
const near = (actual, expected, msg) => assert.ok(Math.abs(actual - expected) <= 3000, `${msg || ""} expected about ${expected}, got ${actual}`);
const cur = async c => (await c.get("/api/focus")).json;
// time passing with the study page open: the page sends a heartbeat at least every 30 seconds
async function run(c, id, ms){ while (ms > 0) { const step = Math.min(30000, ms); advance(step); ms -= step; await act(c, id, "beat"); } }

test("you must be logged in", async () => {
  const anon = client(s.base);
  for (const [m, u] of [["GET", "/api/focus"], ["POST", "/api/focus/sessions"], ["GET", "/api/focus/stats"], ["GET", "/api/focus/sessions"], ["POST", "/api/focus/sessions/x/pause"]]) assert.equal((await anon.call(m, u, m === "POST" ? {} : undefined)).status, 401, u);
});

test("start: a saved ACTIVE session with its details; checks what it is given", async () => {
  const c = await fresh();
  assert.deepEqual(await cur(c).then(x => [x.session, typeof x.serverNow]), [null, "number"]);
  const r = await start(c); assert.equal(r.status, 201);
  const ss = r.json.session;
  assert.equal(ss.status, "ACTIVE"); assert.equal(ss.mode, "strict"); assert.equal(ss.plannedMs, 45 * MIN); assert.equal(ss.title, "Complete assignment operators practical");
  assert.equal(ss.subject, "Java Programming"); assert.equal(ss.topic, "Assignment operators"); assert.ok(ss.startedAt > 0); near(ss.report.remainingMs, 45 * MIN);
  assert.equal((await cur(c)).session.id, ss.id);
  for (const bad of [{ minutes: 0 }, { minutes: 500 }, { minutes: 2.5 }, { mode: "lazy" }, { title: "" }, { title: 7 }]) {
    const x = await start(await fresh(), bad); assert.equal(x.status, 400, JSON.stringify(bad));
  }
});

test("duplicates: a second start while one is open is refused (409, with the open one); the same click sent twice makes one session", async () => {
  const c = await fresh();
  const r1 = await start(c, { clientKey: "click-1" }); const r2 = await start(c, { clientKey: "click-1" });
  assert.equal(r1.status, 201); assert.equal(r2.status, 200); assert.equal(r2.json.session.id, r1.json.session.id); assert.equal(r2.json.duplicate, true);
  const r3 = await start(c, { clientKey: "click-2", title: "Another one" });
  assert.equal(r3.status, 409); assert.equal(r3.json.code, "session_open"); assert.equal(r3.json.session.id, r1.json.session.id);
  // twenty starts at once still leave exactly one open session
  const d = await fresh(); const rs = await Promise.all(Array.from({ length: 20 }, (_, k) => start(d, { clientKey: "race-" + k })));
  assert.equal(rs.filter(x => x.status === 201).length, 1); assert.ok(rs.every(x => x.status === 201 || x.status === 409));
  assert.equal((await d.get("/api/focus/sessions")).json.sessions.length, 0, "history lists finished sessions only");
});

test("timer accuracy: focused time comes from saved timestamps; paused minutes are break time and don't count", async () => {
  const c = await fresh(); const id = (await start(c)).json.session.id;
  await run(c, id, 10 * MIN);
  let x = (await cur(c)).session; near(x.report.focusedMs, 10 * MIN); near(x.report.remainingMs, 35 * MIN);
  assert.equal((await act(c, id, "pause")).json.session.status, "PAUSED");
  advance(5 * MIN);
  x = (await cur(c)).session; assert.equal(x.status, "PAUSED"); near(x.report.focusedMs, 10 * MIN);
  assert.equal((await act(c, id, "resume")).json.session.status, "ACTIVE");
  await run(c, id, 5 * MIN);
  x = (await cur(c)).session; near(x.report.focusedMs, 15 * MIN); near(x.report.breakMs, 5 * MIN); assert.equal(x.report.interruptions, 0);
  // pressing Pause twice is harmless
  await act(c, id, "pause"); const again = await act(c, id, "pause"); assert.equal(again.status, 200); assert.equal(again.json.session.breaks.length, 2);
});

test("interruptions: leaving the tab or fullscreen pauses and is recorded; only a manual Resume starts it again", async () => {
  const c = await fresh(); const id = (await start(c)).json.session.id;
  await run(c, id, 4 * MIN);
  const now = (await cur(c)).serverNow;
  const r = await act(c, id, "interrupt", { kind: "tab", at: now - 3000 });   // sent a moment after it happened
  assert.equal(r.json.session.status, "INTERRUPTED");
  near(r.json.session.breaks[0].from, now - 3000, "the time the page reported is used when it is recent"); assert.ok(r.json.session.breaks[0].from < now - 2000);
  advance(3 * MIN);
  let x = (await cur(c)).session; assert.equal(x.status, "INTERRUPTED", "still paused: nothing resumes by itself");
  assert.equal(x.report.interruptions, 1); assert.equal(x.report.lastInterruption.kind, "tab");
  await act(c, id, "resume"); await run(c, id, MIN); await act(c, id, "interrupt", { kind: "fullscreen" }); advance(MIN); await act(c, id, "resume");
  x = (await cur(c)).session; assert.equal(x.report.interruptions, 2); near(x.report.awayMs, 3 * MIN + 3000 + MIN);
  assert.equal((await act(c, id, "interrupt", { kind: "teleport" })).status, 400);
  assert.equal((await act(c, id, "fly")).status, 404);
});

test("complete: refused before the time is focused; then the success report, locked for good, shown once", async () => {
  const c = await fresh(); const r0 = await start(c, { minutes: 25 }); const id = r0.json.session.id; const t0 = r0.json.session.startedAt;
  await run(c, id, 10 * MIN);
  const early = await act(c, id, "complete"); assert.equal(early.status, 409); assert.equal(early.json.code, "not_finished");
  await run(c, id, 15 * MIN);
  const done = await act(c, id, "complete"); assert.equal(done.status, 200);
  assert.equal(done.json.session.status, "COMPLETED"); assert.equal(done.json.session.endedAt, t0 + 25 * MIN); near(done.json.session.report.focusedMs, 25 * MIN);
  for (const a2 of ["resume", "pause", "end"]) { const y = await act(c, id, a2); assert.equal(y.status, 409, a2); assert.equal(y.json.code, "finished"); }
  const twice = await act(c, id, "complete"); assert.equal(twice.status, 200, "completing again is harmless"); assert.equal(twice.json.session.endedAt, t0 + 25 * MIN);
  const now = await cur(c); assert.equal(now.session, null); assert.equal(now.unseen.id, id, "the report waits until it has been seen");
  const k1 = await act(c, id, "ack"); assert.equal(k1.json.first, true); const k2 = await act(c, id, "ack"); assert.equal(k2.json.first, false);
  assert.equal((await cur(c)).unseen, null);
  const h = (await c.get("/api/focus/sessions")).json.sessions; assert.equal(h.length, 1); assert.equal(h[0].id, id);
});

test("end early keeps the focused part; a new session can start afterwards", async () => {
  const c = await fresh(); const id = (await start(c)).json.session.id;
  await run(c, id, 12 * MIN); await act(c, id, "interrupt", { kind: "window" }); advance(2 * MIN);
  const e = await act(c, id, "end"); assert.equal(e.json.session.status, "ENDED_EARLY");
  near(e.json.session.report.focusedMs, 12 * MIN); near(e.json.session.report.awayMs, 2 * MIN);
  assert.equal((await start(c)).status, 201);
});

test("closed or crashed browser: the clock stops at the last heartbeat and the session waits, interrupted, to be resumed", async () => {
  const c = await fresh(); const id = (await start(c)).json.session.id;
  await run(c, id, 5 * MIN);
  advance(20 * MIN);   // no heartbeats: the browser was closed
  // reopen: log in again from a new browser (new cookie)
  const again = client(s.base); await again.post("/api/auth/login", { email: c.user.email, password: "password123" });
  const x = (await cur(again)).session;
  assert.equal(x.id, id); assert.equal(x.status, "INTERRUPTED"); near(x.report.focusedMs, 5 * MIN);
  assert.equal(x.report.lastInterruption.kind, "closed");
  await act(again, id, "resume"); await run(again, id, MIN); near((await cur(again)).session.report.focusedMs, 6 * MIN);
});

test("a quick refresh keeps the session running; a session whose time ran out while away is completed at the right time", async () => {
  const c = await fresh(); const r = await start(c, { minutes: 5 }); const id = r.json.session.id;
  await run(c, id, 2 * MIN); advance(20000);
  assert.equal((await cur(c)).session.status, "ACTIVE", "a refresh a few seconds long changes nothing");
  await act(c, id, "beat");   // the reloaded page says it is back
  await run(c, id, 2 * MIN + 30000); advance(10 * MIN);
  const now = await cur(c); assert.equal(now.session, null);
  assert.equal(now.unseen.status, "COMPLETED"); assert.equal(now.unseen.endedAt, r.json.session.startedAt + 5 * MIN);
});

test("the session survives a server restart (it is in the database)", async () => {
  const c = await fresh(); const id = (await start(c)).json.session.id; await run(c, id, 3 * MIN); await act(c, id, "pause");
  const s2 = await startServer({ DT_TEST_CLOCK_FILE: clockFile, DATA_DIR: s.dataDir });
  try {
    const c2 = client(s2.base); await c2.post("/api/auth/login", { email: c.user.email, password: "password123" });
    const x = (await cur(c2)).session; assert.equal(x.id, id); assert.equal(x.status, "PAUSED"); near(x.report.focusedMs, 3 * MIN);
  } finally { s2.stop(); }
});

test("an open session left for 12 hours is closed as ended early", async () => {
  const c = await fresh(); const id = (await start(c)).json.session.id; await run(c, id, 4 * MIN); await act(c, id, "pause");
  advance(13 * 60 * MIN);
  const now = await cur(c); assert.equal(now.session, null);
  const h = (await c.get("/api/focus/sessions")).json.sessions; assert.equal(h[0].id, id); assert.equal(h[0].status, "ENDED_EARLY"); assert.equal(h[0].endReason, "expired");
  assert.equal(now.unseen, null, "an expired session doesn't pop up a report");
});

test("privacy: nobody can see or change another person's sessions or statistics; a task link must be your own task", async () => {
  const mine = await a.post("/api/tasks", { title: "Asha's Java practical" }); assert.equal(mine.status, 201);
  const theirs = await b.post("/api/tasks", { title: "Ben's private task" });
  const r = await start(a, { taskId: mine.json.task.id }); const id = r.json.session.id;
  assert.equal(r.json.session.taskId, mine.json.task.id);
  for (const action of ["pause", "resume", "interrupt", "end", "complete", "beat", "ack"]) assert.equal((await act(b, id, action, { kind: "tab" })).status, 404, action);
  assert.equal((await cur(b)).session, null, "Ben has no open session of his own");
  assert.equal((await start(b, { taskId: mine.json.task.id })).json.session.taskId, null, "someone else's task is not linked");
  assert.equal((await cur(a)).session.id, id, "Ben starting a session doesn't touch Asha's");
  await act(b, (await cur(b)).session.id, "end");
  await run(a, id, 5 * MIN); await act(a, id, "end");
  const hb = (await b.get("/api/focus/sessions")).json.sessions; assert.ok(hb.every(x => x.id !== id));
  const sb = (await b.get("/api/focus/stats")).json; assert.ok(sb.total.focusedMin < 5, "Ben's statistics don't include Asha's 5 minutes");
  assert.ok(theirs.status === 201);
});

test("statistics are worked out from real sessions in the person's time zone", async () => {
  const c = await fresh();
  const e0 = (await c.get("/api/focus/stats")).json;
  assert.equal(e0.total.focusedMin, 0); assert.equal(e0.week.pctOfPlan, null); assert.equal(e0.days.length, 7); assert.equal(e0.streak, 0);
  let id = (await start(c, { minutes: 30, subject: "Chemistry", title: "Organic revision" })).json.session.id;
  await run(c, id, 30 * MIN); await act(c, id, "complete");
  id = (await start(c, { minutes: 60, subject: "Java Programming", title: "Practical" })).json.session.id;
  await run(c, id, 20 * MIN); await act(c, id, "interrupt", { kind: "tab" }); advance(4 * MIN); await act(c, id, "end");
  const st = (await c.get("/api/focus/stats?days=7")).json;
  assert.equal(st.week.focusedMin, 50); assert.equal(st.week.completed, 1); assert.equal(st.week.endedEarly, 1); assert.equal(st.week.interruptions, 1); assert.equal(st.week.awayMin, 4);
  assert.equal(st.week.plannedMin, 90); assert.equal(st.week.pctOfPlan, 56);
  assert.deepEqual(st.subjects.map(x => [x.subject, x.focusedMin]), [["Chemistry", 30], ["Java Programming", 20]]);
  assert.equal(st.streak, 1); assert.equal(st.days[6].focusedMin, 50);
  assert.equal((await c.get("/api/focus/stats?days=30")).json.days.length, 30);
  assert.equal((await c.get("/api/focus/stats?days=900")).status, 400);
});
