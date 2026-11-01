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
