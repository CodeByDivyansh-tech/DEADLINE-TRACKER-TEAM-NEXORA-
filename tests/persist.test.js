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
    const hp = (await client(oldS.base).get("/api/health")).json.persistence, hn = (await client(newS.base).get("/api/health")).json.persistence;
    assert.equal(hp.stoppedBecauseNewer, true, "the old server stopped saving");
    assert.equal(hp.newer.instance, hn.instance.id, "and says which newer server took over");
    assert.ok(Date.parse(hp.newer.startedAt) > Date.parse(hp.instance.startedAt));
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

/* ---------- Bug (3 Nov): every Render deploy since the Neon change failed after 15 minutes ----------
   The server waited for Neon *before* opening its port and retried forever, so when Neon couldn't be used
   (a pasted connection string with extra text, a network problem) the new server never answered Render's
   health check and the old server, which loses everything on restart, kept running. */
const health = async base => { const r = await client(base).get("/api/health"); return { status: r.status, json: r.json }; };
async function waitFor(fn, ms = 6000){ for (let t = 0; t < ms; t += 100) { if (await fn()) return true; await wait(100); } return false; }

test("Neon unreachable for good: the server still starts, says why in /api/health, and never writes to Neon", async () => {
  neon.row = { data: "keep-me", version: 7, instance: "x", started_at: 1, saved_at: 1 };
  neon.down = true;
  const t0 = Date.now();
  const s = await startServer(Object.assign(neon.env(), { PERSIST_RETRY_MS: "100", PERSIST_START_TIMEOUT_MS: "1200", PERSIST_RECHECK_MS: "300" }));
  try {
    assert.ok(Date.now() - t0 < 7000, "started instead of waiting forever");
    const h = await health(s.base);
    assert.equal(h.status, 200);
    assert.equal(h.json.persistence.ok, false); assert.equal(h.json.persistence.restored, false); assert.equal(h.json.persistence.fallback, true);
    assert.match(h.json.persistence.error, /503|unavailable/i, "the real reason is shown");
    assert.equal((await signup(s.base, "Temp", "temp@example.com")).res.status, 503, "new accounts are refused: they couldn't be kept");
    assert.equal((await client(s.base).post("/api/auth/login", { email: "x@example.com", password: "password123" })).status, 401, "the rest of the site answers");
    await wait(900);
    assert.equal(neon.row.data, "keep-me", "the saved copy was not overwritten");
    neon.down = false; await wait(900);
    assert.equal(neon.row.data, "keep-me", "still not overwritten after Neon came back, because it holds saved data");
    assert.match((await health(s.base)).json.persistence.error, /restart/i, "tells the admin to restart to load the saved data");
  } finally { s.stop(); neon.down = false; }
});

test("Neon unreachable at start but empty when it comes back: saving starts by itself", async () => {
  neon.row = null; neon.down = true;
  const s = await startServer(Object.assign(neon.env(), { PERSIST_RETRY_MS: "100", PERSIST_START_TIMEOUT_MS: "800", PERSIST_RECHECK_MS: "300", PERSIST_INTERVAL_MS: "200" }));
  try {
    assert.equal((await signup(s.base, "Kavi", "kavi@example.com")).res.status, 503, "refused while Neon is down");
    neon.down = false;
    assert.ok(await waitFor(async () => (await health(s.base)).json.persistence.ok === true), "Neon usable again");
    assert.equal((await signup(s.base, "Kavi", "kavi@example.com")).res.status, 201, "accepted again");
    assert.ok(await waitFor(() => neon.row && neon.row.version >= 1), "saved once Neon answered");
    const h = await health(s.base);
    assert.equal(h.json.persistence.ok, true); assert.equal(h.json.persistence.restored, true); assert.ok(!h.json.persistence.fallback);
  } finally { s.stop(); }
});

test("while the saved database is loading, the API says 'starting' (503) instead of answering with empty data", async () => {
  neon.row = null; neon.down = true;
  const s = await startServer(Object.assign(neon.env(), { PERSIST_RETRY_MS: "100", PERSIST_START_TIMEOUT_MS: "60000" }), { early: true });
  try {
    const me = await client(s.base).get("/api/me");
    assert.equal(me.status, 503); assert.equal(me.json.code, "starting"); assert.ok(me.headers.get("retry-after"));
    const h = await health(s.base);
    assert.equal(h.status, 503, "Render waits instead of sending people to a server without their data");
    assert.equal(h.json.starting, true); assert.match(h.json.persistence.error || "", /503|unavailable/i);
    neon.down = false;
    assert.ok(await waitFor(async () => (await client(s.base).get("/api/me")).status === 200), "ready once Neon answers");
  } finally { s.stop(); }
});

test("a connection string pasted with extra text (psql '...' or quotes) still works", async () => {
  neon.row = null;
  const e = neon.env();
  for (const v of [`psql '${e.DATABASE_URL}'`, `"${e.DATABASE_URL}"`, `DATABASE_URL=${e.DATABASE_URL}`]) {
    const s = await startServer(Object.assign({}, e, { DATABASE_URL: v }));
    try { const h = await health(s.base); assert.equal(h.json.persistence.mode, "neon", v); assert.equal(h.json.persistence.ok, true, v); assert.equal(h.json.persistence.restored, true, v); }
    finally { s.stop(); await wait(200); }
  }
});

test("a DATABASE_URL that isn't a Postgres address: the server starts and explains, it doesn't crash", async () => {
  const s = await startServer({ DATABASE_URL: "https://console.neon.tech/app/projects/abc", PERSIST_START_TIMEOUT_MS: "800" });
  try {
    const h = await health(s.base);
    assert.equal(h.status, 200); assert.equal(h.json.persistence.ok, false);
    assert.match(h.json.persistence.error, /postgresql:\/\//, "says what the value should look like");
    assert.equal((await signup(s.base, "Lin", "lin@example.com")).res.status, 503, "no accounts that would vanish");
  } finally { s.stop(); }
});
