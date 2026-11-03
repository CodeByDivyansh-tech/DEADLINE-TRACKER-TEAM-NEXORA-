// The reported bug (3 Nov): "I create an account, log in again with the same email and password, and it says
// wrong password." Root cause on the live site: the server couldn't save to Neon (wrong DATABASE_URL password), so
// accounts lived only on Render's temporary disk and vanished when it slept. These tests pin down every part of the
// flow, the stronger password hashing with its upgrade-on-login migration, and the new honest refusal: while
// permanent storage is broken, new accounts are refused instead of being created and then lost.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const crypto = require("crypto");
const { DatabaseSync } = require("node:sqlite");
const { startServer, client, signup, fakeNeon } = require("./srv");

let s;
before(async () => { s = await startServer({}); });
after(() => s.stop());

test("sign up, log out, log in with exactly the same email and password works; refresh keeps you logged in", async () => {
  const pw = "  Spaces & ünïcödé + symbols!  ";   // passwords are used exactly as typed (no trimming or changes)
  const a = await signup(s.base, "Asha Rao", "  Asha.Rao@Example.COM ", pw);
  assert.equal(a.res.status, 201); assert.equal(a.user.email, "asha.rao@example.com");
  assert.equal((await a.post("/api/auth/logout")).status, 200);
  assert.equal((await a.get("/api/me")).json.user, null, "logged out");
  const b = client(s.base);
  const ok = await b.post("/api/auth/login", { email: "asha.rao@example.com", password: pw });
  assert.equal(ok.status, 200, JSON.stringify(ok.json)); assert.equal(ok.json.user.email, "asha.rao@example.com");
  assert.equal((await b.get("/api/me")).json.user.email, "asha.rao@example.com", "a refresh (/api/me) keeps the session");
  assert.equal((await client(s.base).post("/api/auth/login", { email: "ASHA.RAO@example.com ", password: pw })).status, 200, "email case and spaces don't matter");
  assert.equal((await client(s.base).post("/api/auth/login", { email: "asha.rao@example.com", password: pw.trim() })).status, 401, "the password itself is exact");
});

test("the same account logs in many times in a row (no double hashing, no overwriting)", async () => {
  await signup(s.base, "Ravi", "ravi.loop@example.com", "loop-password-1");
  for (let k = 0; k < 4; k++) assert.equal((await client(s.base).post("/api/auth/login", { email: "ravi.loop@example.com", password: "loop-password-1" })).status, 200, "try " + k);
  const db = new DatabaseSync(path.join(s.dataDir, "deadline.db"));
  assert.equal(db.prepare("SELECT COUNT(*) n FROM users WHERE email = ?").get("ravi.loop@example.com").n, 1, "one record");
  db.close();
});

test("password hashing: scrypt at the OWASP-equivalent cost (N=2^14, r=8, p=5) with a random salt per user", async () => {
  await signup(s.base, "Hash One", "hash1@example.com", "same-password-1");
  await signup(s.base, "Hash Two", "hash2@example.com", "same-password-1");
  const db = new DatabaseSync(path.join(s.dataDir, "deadline.db"));
  const [u1, u2] = ["hash1@example.com", "hash2@example.com"].map(e => db.prepare("SELECT * FROM users WHERE email = ?").get(e));
  db.close();
  assert.equal(u1.pass_algo, "s2");
  assert.notEqual(u1.salt, u2.salt); assert.notEqual(u1.pass_hash, u2.pass_hash, "same password, different hashes");
  const expect = crypto.scryptSync("same-password-1", u1.salt, 64, { N: 16384, r: 8, p: 5, maxmem: 64 * 1024 * 1024 }).toString("hex");
  assert.equal(u1.pass_hash, expect);
});

test("existing accounts with the older, cheaper hash still log in and are upgraded on that login (no resets)", async () => {
  await signup(s.base, "Old Hash", "oldhash@example.com", "old-password-1");
  const file = path.join(s.dataDir, "deadline.db");
  const db = new DatabaseSync(file);
  const salt = crypto.randomBytes(16).toString("hex");
  const old = crypto.scryptSync("old-password-1", salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }).toString("hex");
  db.prepare("UPDATE users SET pass_hash = ?, salt = ?, pass_algo = 's1' WHERE email = ?").run(old, salt, "oldhash@example.com");
  db.close();
  assert.equal((await client(s.base).post("/api/auth/login", { email: "oldhash@example.com", password: "wrong-one" })).status, 401);
  assert.equal((await client(s.base).post("/api/auth/login", { email: "oldhash@example.com", password: "old-password-1" })).status, 200);
  const db2 = new DatabaseSync(file);
  const u = db2.prepare("SELECT * FROM users WHERE email = ?").get("oldhash@example.com"); db2.close();
  assert.equal(u.pass_algo, "s2", "upgraded"); assert.notEqual(u.pass_hash, old);
  assert.equal((await client(s.base).post("/api/auth/login", { email: "oldhash@example.com", password: "old-password-1" })).status, 200, "still the same password");
});

test("wrong password and unknown email get the same clear message; a duplicate sign-up is refused", async () => {
  await signup(s.base, "Dup", "dup@example.com", "dup-password-1");
  const w = await client(s.base).post("/api/auth/login", { email: "dup@example.com", password: "nope-nope-1" });
  const n = await client(s.base).post("/api/auth/login", { email: "nobody-here@example.com", password: "nope-nope-1" });
  assert.equal(w.status, 401); assert.equal(n.status, 401); assert.equal(w.json.error, n.json.error);
  const d = await client(s.base).post("/api/auth/signup", { name: "Dup 2", email: " DUP@example.com", password: "other-password-1" });
  assert.equal(d.status, 409); assert.match(d.json.error, /already exists/);
  assert.equal((await client(s.base).post("/api/auth/login", { email: "dup@example.com", password: "dup-password-1" })).status, 200, "the first account is untouched");
});

test("accounts survive a server restart on the same disk", async () => {
  const s2 = await startServer({});
  await signup(s2.base, "Keep", "keep@example.com", "keep-password-1");
  s2.stop(); await new Promise(r => setTimeout(r, 300));
  const s3 = await startServer({ DATA_DIR: s2.dataDir });
  try { assert.equal((await client(s3.base).post("/api/auth/login", { email: "keep@example.com", password: "keep-password-1" })).status, 200); }
  finally { s3.stop(); }
});

test("while permanent storage is broken, new sign-ups are refused plainly instead of vanishing later", async () => {
  const neon = await fakeNeon().start(); neon.down = true;
  const sb = await startServer(Object.assign(neon.env(), { PERSIST_RETRY_MS: "100", PERSIST_START_TIMEOUT_MS: "600", PERSIST_RECHECK_MS: "60000" }));
  try {
    const r = await client(sb.base).post("/api/auth/signup", { name: "Lost", email: "lost@example.com", password: "password123" });
    assert.equal(r.status, 503); assert.equal(r.json.code, "storage_unavailable");
    assert.match(r.json.error, /can't create new accounts right now/i);
    assert.equal((await client(sb.base).get("/api/health")).json.persistence.fallback, true);
  } finally { sb.stop(); neon.close(); }
});
