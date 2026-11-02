// Accounts: sign up, log in, log out, profile, time zone, password change, privacy of passwords and sessions.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");
const { startServer, client, signup } = require("./srv");

let s;
before(async () => { s = await startServer({}); });
after(() => s.stop());

test("sign up: logs you in with an HttpOnly cookie; first account is the admin; time zone and default reminders saved", async () => {
  const c = await signup(s.base, "Divyansh", "Div@Example.com", "password123", "Asia/Kolkata");
  assert.equal(c.res.status, 201);
  assert.equal(c.user.email, "div@example.com"); assert.equal(c.user.role, "admin"); assert.equal(c.user.timezone, "Asia/Kolkata");
  assert.deepEqual(c.user.notifyPrefs.before, [1440, 60]);
  assert.match(c.res.setCookie, /HttpOnly/); assert.match(c.res.setCookie, /SameSite=Lax/);
  assert.equal((await c.get("/api/me")).json.user.name, "Divyansh");
  assert.equal((await signup(s.base, "Riya", "riya@example.com")).user.role, "user");
});
test("sign up / log in: clear errors for bad input, duplicates and wrong passwords", async () => {
  const c = client(s.base);
  assert.equal((await c.post("/api/auth/signup", { name: "", email: "a@b.co", password: "password123" })).json.field, "name");
  assert.equal((await c.post("/api/auth/signup", { name: "A", email: "nope", password: "password123" })).json.code, "email");
  assert.equal((await c.post("/api/auth/signup", { name: "A", email: "a@b.co", password: "short" })).json.code, "password");
  assert.equal((await c.post("/api/auth/signup", { name: { $ne: 1 }, email: "a@b.co", password: "password123" })).status, 400, "objects are rejected");
  await signup(s.base, "Kabir", "kabir@example.com", "correct-horse");
  assert.equal((await c.post("/api/auth/signup", { name: "K", email: "KABIR@example.com", password: "password123" })).status, 409);
  const bad = await c.post("/api/auth/login", { email: "kabir@example.com", password: "wrong-password" });
  assert.equal(bad.status, 401); assert.match(bad.json.error, /Email or password is wrong/);
  assert.equal((await c.post("/api/auth/login", { email: "nobody@example.com", password: "x12345678" })).json.error, bad.json.error, "no hint whether the email exists");
  assert.equal((await c.post("/api/auth/login", { email: "Kabir@example.com", password: "correct-horse" })).status, 200);
});
test("passwords and sessions are stored only as hashes", async () => {
  await signup(s.base, "Meera", "meera@example.com", "my-plain-password");
  const db = new DatabaseSync(path.join(s.dataDir, "deadline.db"));
  const u = db.prepare("SELECT * FROM users WHERE email = ?").get("meera@example.com");
  assert.ok(!JSON.stringify(u).includes("my-plain-password")); assert.equal(u.pass_hash.length, 128);
  assert.ok(db.prepare("SELECT token_hash FROM sessions").all().every(x => x.token_hash.length === 64));
  db.close();
});
test("log out ends the session; a guessed cookie never works", async () => {
  const a = await signup(s.base, "Om", "om@example.com"); const cookie = a.cookie();
  await a.post("/api/auth/logout");
  assert.equal((await a.get("/api/me")).json.user, null);
  const reuse = client(s.base); reuse.setCookie(cookie); assert.equal((await reuse.get("/api/tasks")).status, 401);
  const fake = client(s.base); fake.setCookie("dt_session=made-up"); assert.equal((await fake.get("/api/tasks")).status, 401);
});
test("profile: change name, time zone and reminder preferences, with validation", async () => {
  const a = await signup(s.base, "Tara", "tara@example.com");
  const r = await a.patch("/api/profile", { name: "Tara S", timezone: "Europe/London", notifyPrefs: { before: [4320, 60], dailySummary: false, quietOn: true, quietFrom: "23:00", quietTo: "06:30" } });
  assert.equal(r.status, 200); assert.equal(r.json.user.timezone, "Europe/London"); assert.deepEqual(r.json.user.notifyPrefs.before, [4320, 60]); assert.equal(r.json.user.notifyPrefs.dailySummary, false);
  assert.equal((await a.patch("/api/profile", { timezone: "Mars/Olympus" })).status, 400);
  assert.equal((await a.patch("/api/profile", { notifyPrefs: { before: [99] } })).status, 400);
  assert.equal((await a.patch("/api/profile", { notifyPrefs: { quietFrom: "25:00" } })).status, 400);
});
test("password change: needs the current password and signs out other devices", async () => {
  const a = await signup(s.base, "Neha", "neha@example.com", "first-password");
  const other = client(s.base); await other.post("/api/auth/login", { email: "neha@example.com", password: "first-password" });
  assert.equal((await a.post("/api/profile/password", { currentPassword: "wrong", newPassword: "second-password" })).status, 400);
  assert.equal((await a.post("/api/profile/password", { currentPassword: "first-password", newPassword: "second-password" })).status, 200);
  assert.equal((await other.get("/api/tasks")).status, 401, "the other device is signed out");
  assert.equal((await a.get("/api/tasks")).status, 200, "this device stays signed in");
  assert.equal((await client(s.base).post("/api/auth/login", { email: "neha@example.com", password: "second-password" })).status, 200);
});
test("rate limiting: repeated wrong passwords are slowed down", async () => {
  await signup(s.base, "Ira", "ira@example.com");
  const c = client(s.base); let last;
  for (let k = 0; k < 11; k++) last = await c.post("/api/auth/login", { email: "ira@example.com", password: "nope-nope-" + k });
  assert.equal(last.status, 429);
});
test("log in: empty fields get a clear message (not 'wrong password'); spaces around the email are ignored", async () => {
  const t = await signup(s.base, "Tanvi", "tanvi.login@example.com", "tara-password"); assert.equal(t.res.status, 201, JSON.stringify(t.res.json));
  const c = client(s.base);
  const e1 = await c.post("/api/auth/login", { email: "", password: "" });
  assert.equal(e1.status, 400); assert.equal(e1.json.field, "email"); assert.match(e1.json.error, /email/i);
  const e2 = await c.post("/api/auth/login", { email: "tanvi.login@example.com", password: "" });
  assert.equal(e2.status, 400); assert.equal(e2.json.field, "password");
  const e3 = await c.post("/api/auth/login", { email: "not-an-email", password: "whatever1" });
  assert.equal(e3.status, 400); assert.equal(e3.json.field, "email");
  assert.equal((await c.post("/api/auth/login", { email: "  TANVI.login@example.com ", password: "tara-password" })).status, 200);
});
test("an expired session is refused and removed", async () => {
  const a = await signup(s.base, "Ishan", "ishan@example.com");
  assert.equal((await a.get("/api/tasks")).status, 200);
  const db = new DatabaseSync(path.join(s.dataDir, "deadline.db"));
  db.prepare("UPDATE sessions SET expires_at = ? WHERE user_id = (SELECT id FROM users WHERE email = ?)").run(Date.now() - 1000, "ishan@example.com");
  db.close();
  const r = await a.get("/api/tasks"); assert.equal(r.status, 401); assert.equal(r.json.code, "signed_out");
  assert.equal((await a.get("/api/me")).json.user, null);
  const db2 = new DatabaseSync(path.join(s.dataDir, "deadline.db"));
  assert.equal(db2.prepare("SELECT COUNT(*) n FROM sessions WHERE user_id = (SELECT id FROM users WHERE email = ?)").get("ishan@example.com").n, 0);
  db2.close();
});
test("signed out: every private route answers 401 and leaks nothing", async () => {
  const c = client(s.base);
  const routes = [["GET","/api/tasks"],["POST","/api/tasks"],["GET","/api/profile"],["PATCH","/api/profile"],["POST","/api/profile/password"],
    ["GET","/api/state"],["PUT","/api/state"],["GET","/api/notifications"],["GET","/api/conversations"],["GET","/api/stats"],
    ["POST","/api/plan/apply"],["GET","/api/admin/users"],["GET","/api/admin/settings"]];
  for (const [m, u] of routes) {
    const r = await c.call(m, u, m === "GET" ? undefined : {});
    assert.ok(r.status === 401 || r.status === 404, `${m} ${u} -> ${r.status}`);
    if (r.status === 401) assert.equal(r.json.code, "signed_out", `${m} ${u}`);
    assert.ok(!/@example\.com/.test(r.text || JSON.stringify(r.json || {})), `${m} ${u} leaks an email`);
  }
});
