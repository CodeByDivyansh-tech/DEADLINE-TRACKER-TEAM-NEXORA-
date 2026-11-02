// Bug fix: on Render's free plan the server's disk is wiped when it sleeps or redeploys, so accounts vanished
// and correct passwords "failed". With DATABASE_URL set, the database is saved to Neon Postgres and restored on start.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startServer, client, signup, fakeNeon } = require("./srv");
const wait = ms => new Promise(r => setTimeout(r, ms));
let neon;
before(async () => { neon = await fakeNeon().start(); });
after(() => neon.close());
const savedVersion = () => neon.row ? neon.row.version : 0;
async function waitSaved(prev){ for (let k = 0; k < 40 && savedVersion() <= prev; k++) await wait(100); assert.ok(savedVersion() > prev, "the database was saved to Neon"); }

test("the reported bug: without permanent storage, a wiped disk makes a correct password fail", async () => {
  const a = await startServer({});
  await signup(a.base, "Riya", "riya@example.com", "correct-password");
  a.stop();
  const b = await startServer({});            // a fresh, empty disk, like Render after sleeping
  try { assert.equal((await client(b.base).post("/api/auth/login", { email: "riya@example.com", password: "correct-password" })).status, 401); }
  finally { b.stop(); }
});

test("fixed: accounts, sessions and tasks survive a restart on a wiped disk", async () => {
  neon.row = null;
  const a = await startServer(neon.env());
  const c = await signup(a.base, "Asha", "asha@example.com", "correct-password");
  assert.equal(c.res.status, 201);
  let v = savedVersion(); await waitSaved(v - 1);
  v = savedVersion();
  await c.post("/api/tasks", { title: "Java assignment", dueDate: "2026-11-20", dueTime: "17:00" });
  await waitSaved(v);
  const cookie = c.cookie();
  a.stop(); await wait(300);
  const b = await startServer(neon.env());     // new instance, new empty data folder
  try {
    const login = await client(b.base).post("/api/auth/login", { email: "asha@example.com", password: "correct-password" });
    assert.equal(login.status, 200, "the same email and password work after the restart");
    const still = client(b.base); still.setCookie(cookie);
    assert.equal((await still.get("/api/me")).json.user.email, "asha@example.com", "the old session is still valid");
    assert.equal((await still.get("/api/tasks")).json.tasks[0].title, "Java assignment");
    assert.equal((await client(b.base).post("/api/auth/login", { email: "asha@example.com", password: "wrong-password" })).status, 401, "wrong passwords still fail");
    const h = (await (await fetch(b.base + "/api/health")).json());
    assert.equal(h.persistence.mode, "neon"); assert.equal(h.persistence.restored, true);
  } finally { b.stop(); }
});

test("safety: if Neon can't be reached at start, the server waits and never overwrites the saved copy with an empty one", async () => {
  const before = JSON.parse(JSON.stringify(neon.row));
  neon.failNext = 4;
  const s = await startServer(Object.assign(neon.env(), { PERSIST_RETRY_MS: "200" }));
  try {
    assert.equal(neon.row.version, before.version, "nothing was written while the restore was failing");
    assert.equal((await client(s.base).post("/api/auth/login", { email: "asha@example.com", password: "correct-password" })).status, 200, "data restored once Neon answered");
  } finally { s.stop(); }
});

test("safety: an older server still running during a redeploy doesn't overwrite the newer one's data", async () => {
  const oldS = await startServer(neon.env());
  await wait(50);
  const newS = await startServer(neon.env());
  try {
    const n = await signup(newS.base, "New", "new@example.com");
    let v = savedVersion(); await waitSaved(v - 1); v = savedVersion();
    await signup(oldS.base, "Old", "old@example.com");   // a write on the old instance
    await wait(900);
    const fresh = await startServer(neon.env());
    try {
      assert.equal((await client(fresh.base).post("/api/auth/login", { email: "new@example.com", password: "password123" })).status, 200, "the newer instance's data is kept");
    } finally { fresh.stop(); }
    assert.ok(n);
  } finally { oldS.stop(); newS.stop(); }
});

test("the database password never appears in responses or logs", async () => {
  const s = await startServer(neon.env());
  try {
    const c = await signup(s.base, "Ira", "ira@example.com");
    for (const u of ["/api/health", "/api/status", "/api/me"]) assert.doesNotMatch((await c.get(u)).text, /secret-pw|dt_user/);
    assert.doesNotMatch(s.out(), /secret-pw/);
  } finally { s.stop(); }
});
