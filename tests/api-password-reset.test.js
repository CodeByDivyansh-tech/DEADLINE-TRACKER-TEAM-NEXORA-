// Forgot password and password reset: one-time links by email, safe answers that don't reveal who has an account,
// expiry, single use, all devices signed out, rate limits, an admin-made link when email isn't set up.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const fs = require("fs");
const { DatabaseSync } = require("node:sqlite");
const { startServer, client, signup, fakeMail } = require("./srv");

let s, mail;
const ORIGIN = "https://deadline-tracker.example";
before(async () => {
  mail = await fakeMail().start();
  s = await startServer({ EMAIL_PROVIDER: "brevo", EMAIL_API_KEY: "test-mail-key", EMAIL_FROM: "Deadline Tracker <noreply@example.com>", EMAIL_API_URL: mail.url + "/v3/smtp/email", ALLOWED_ORIGINS: ORIGIN });
});
after(() => { s.stop(); mail.close(); });
const forgot = (c, email, origin = ORIGIN) => c.call("POST", "/api/auth/forgot", { email }, { Origin: origin });
const tokenOf = link => link.split("#reset=")[1];
// Emails go out in the background (so timing doesn't reveal which addresses have accounts): wait for them.
const until = async (fn, ms = 3000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await fn(); if (v) return v; await new Promise(r => setTimeout(r, 40)); } return fn(); };
const linkFor = email => until(() => mail.linkFor(email));

test("forgot password: emails a one-time link; the answer is the same whether or not the account exists", async () => {
  await signup(s.base, "Asha", "asha@example.com", "first-password");
  const c = client(s.base);
  const yes = await forgot(c, "Asha@Example.com "), no = await forgot(c, "nobody@example.com");
  assert.equal(yes.status, 200); assert.equal(no.status, 200);
  assert.deepEqual(yes.json, no.json, "no hint about which emails have accounts");
  assert.equal(yes.json.emailEnabled, true);
  await linkFor("asha@example.com"); await new Promise(r => setTimeout(r, 150));
  // (sign-up also sends a welcome email now; count only the reset emails)
  const isReset = m => /#reset=/.test(JSON.stringify(m.body));
  const sent = mail.sent.filter(m => JSON.stringify(m.body).includes("asha@example.com") && isReset(m));
  assert.equal(sent.length, 1, "one reset email for the real account");
  assert.equal(mail.sent.filter(m => JSON.stringify(m.body).includes("nobody@example.com")).length, 0, "none for an unknown address");
  assert.equal(sent[0].headers["api-key"], "test-mail-key");
  const link = await linkFor("asha@example.com");
  assert.ok(link && link.startsWith(ORIGIN + "/#reset="), "link points at this site: " + link);
  assert.ok(tokenOf(link).length >= 40, "long random token");
  assert.match(JSON.stringify(sent[0].body), /30 minutes/);
});

test("reset: the link sets a new password once, signs out every device, and the old password stops working", async () => {
  const a = await signup(s.base, "Ravi", "ravi@example.com", "old-password-1");
  const other = client(s.base); await other.post("/api/auth/login", { email: "ravi@example.com", password: "old-password-1" });
  await forgot(client(s.base), "ravi@example.com");
  const token = tokenOf(await linkFor("ravi@example.com"));
  const c = client(s.base);
  assert.equal((await c.post("/api/auth/reset", { token, password: "short" })).json.field, "password", "weak password refused");
  const ok = await c.post("/api/auth/reset", { token, password: "new-password-2" });
  assert.equal(ok.status, 200); assert.equal(ok.json.ok, true); assert.equal(ok.json.email, "ravi@example.com", "email returned to fill in the log-in form");
  assert.equal(ok.setCookie, null, "doesn't log you in by itself");
  assert.equal((await a.get("/api/state")).status, 401, "old session ended"); assert.equal((await other.get("/api/state")).status, 401);
  assert.equal((await c.post("/api/auth/login", { email: "ravi@example.com", password: "old-password-1" })).status, 401);
  assert.equal((await c.post("/api/auth/login", { email: "ravi@example.com", password: "new-password-2" })).status, 200);
  const again = await client(s.base).post("/api/auth/reset", { token, password: "another-password-3" });
  assert.equal(again.status, 400); assert.equal(again.json.code, "bad_token", "single use");
});

test("reset: bad, tampered or missing tokens are refused with one plain message", async () => {
  const c = client(s.base);
  for (const token of ["", "x", "a".repeat(43), { $ne: null }, "../../etc", "' OR 1=1 --"]) {
    const r = await c.post("/api/auth/reset", { token, password: "new-password-9" });
    assert.equal(r.status, 400, JSON.stringify(token)); assert.match(r.json.error, /link (is|has) (expired|not valid)|isn't valid|expired/i);
  }
});

test("reset: a newer link replaces the older one", async () => {
  await signup(s.base, "Neha", "neha@example.com", "neha-password-1");
  await forgot(client(s.base), "neha@example.com"); const t1 = tokenOf(await linkFor("neha@example.com"));
  await forgot(client(s.base), "neha@example.com"); const t2 = tokenOf(await until(() => { const l = mail.linkFor("neha@example.com"); return l && tokenOf(l) !== t1 && l; }));
  assert.notEqual(t1, t2);
  assert.equal((await client(s.base).post("/api/auth/reset", { token: t1, password: "neha-password-2" })).status, 400);
  assert.equal((await client(s.base).post("/api/auth/reset", { token: t2, password: "neha-password-2" })).status, 200);
});

test("tokens are stored only as hashes and never appear in API answers or the server log", async () => {
  await signup(s.base, "Om", "om@example.com", "om-password-1");
  const r = await forgot(client(s.base), "om@example.com");
  const token = tokenOf(await linkFor("om@example.com"));
  assert.ok(!JSON.stringify(r.json).includes(token));
  const db = new DatabaseSync(path.join(s.dataDir, "deadline.db"), { readOnly: true });
  const rows = db.prepare("SELECT * FROM password_resets").all(); db.close();
  assert.ok(rows.length >= 1); assert.ok(!JSON.stringify(rows).includes(token), "raw token not in the database");
  assert.ok(!s.out().includes(token)); assert.ok(!s.out().includes("test-mail-key"));
});

test("input checks: an invalid email gets a clear message; objects and huge bodies are refused", async () => {
  const c = client(s.base);
  assert.equal((await forgot(c, "not-an-email")).json.field, "email");
  assert.equal((await forgot(c, "")).json.field, "email");
  assert.equal((await c.post("/api/auth/forgot", { email: { $gt: "" } })).status, 400);
});

test("a link from another site's Origin isn't used for the email (falls back to this site's address)", async () => {
  await signup(s.base, "Ivy", "ivy@example.com", "ivy-password-1");
  const r = await client(s.base).call("POST", "/api/auth/forgot", { email: "ivy@example.com" }, { Origin: "https://evil.example" });
  assert.equal(r.status, 403, "cross-site request blocked");
});

test("email not set up: the answer says so plainly; an admin can make a one-time link instead", async () => {
  const s2 = await startServer({});
  try {
    const admin = await signup(s2.base, "Admin", "admin@example.com", "admin-password");
    const u = await signup(s2.base, "Lena", "lena@example.com", "lena-password-1");
    const r = await client(s2.base).post("/api/auth/forgot", { email: "lena@example.com" });
    assert.equal(r.status, 200); assert.equal(r.json.emailEnabled, false); assert.match(r.json.message, /admin/i);
    assert.equal((await u.post(`/api/admin/users/${u.user.id}/reset-link`)).status, 403, "only admins");
    const l = await admin.call("POST", `/api/admin/users/${u.user.id}/reset-link`, {}, { Origin: s2.base });
    assert.equal(l.status, 200); assert.match(l.json.link, /#reset=/); assert.match(l.json.expiresAt, /^\d{4}-/);
    assert.equal((await client(s2.base).post("/api/auth/reset", { token: tokenOf(l.json.link), password: "lena-password-2" })).status, 200);
    assert.equal((await client(s2.base).post("/api/auth/login", { email: "lena@example.com", password: "lena-password-2" })).status, 200);
    assert.equal((await admin.post("/api/admin/users/nope/reset-link")).status, 404);
  } finally { s2.stop(); }
});

test("expired links are refused", async () => {
  const s3 = await startServer({ EMAIL_PROVIDER: "resend", EMAIL_API_KEY: "k2", EMAIL_FROM: "noreply@example.com", EMAIL_API_URL: mail.url + "/emails", RESET_TOKEN_MINUTES: "0.02" });
  try {
    await signup(s3.base, "Tom", "tom@example.com", "tom-password-1");
    await client(s3.base).post("/api/auth/forgot", { email: "tom@example.com" });
    const token = tokenOf(await linkFor("tom@example.com"));
    const m = [...mail.sent].reverse().find(x => /#reset=/.test(JSON.stringify(x.body))); assert.equal(m.url, "/emails"); assert.equal(m.headers.authorization, "Bearer k2");
    await new Promise(r => setTimeout(r, 1600));
    const r = await client(s3.base).post("/api/auth/reset", { token, password: "tom-password-2" });
    assert.equal(r.status, 400); assert.equal(r.json.code, "bad_token");
  } finally { s3.stop(); }
});

test("a failed email send is logged for the admin and the person gets the same calm answer", async () => {
  await signup(s.base, "Fay", "fay@example.com", "fay-password-1");
  mail.fail = true;
  let e = [];
  try {
    const r = await forgot(client(s.base), "fay@example.com"); assert.equal(r.status, 200);
    e = await until(() => { const db = new DatabaseSync(path.join(s.dataDir, "deadline.db"), { readOnly: true }); const x = db.prepare("SELECT * FROM error_log WHERE area = 'mail'").all(); db.close(); return x.length ? x : null; }) || [];
  } finally { mail.fail = false; }
  assert.ok(e.length >= 1); assert.ok(!JSON.stringify(e).includes("test-mail-key"));
});

// Last: it uses up this address's allowance.
test("forgot password is rate limited per email and per address, still without revealing anything", async () => {
  await signup(s.base, "Zed", "zed@example.com", "zed-password-1");
  const resets = () => mail.sent.filter(m => JSON.stringify(m.body).includes("zed@example.com") && /#reset=/.test(JSON.stringify(m.body))).length;
  let last;
  for (let k = 0; k < 6; k++) last = await forgot(client(s.base), "zed@example.com");
  await new Promise(r => setTimeout(r, 400));
  assert.ok(resets() <= 3, "at most 3 reset emails an hour to one address");
  assert.equal(last.status, 200, "same calm answer");
  const c = client(s.base); let limited = false;
  for (let k = 0; k < 25; k++) { const x = await c.call("POST", "/api/auth/forgot", { email: `p${k}@example.com` }, { Origin: ORIGIN }); if (x.status === 429) { limited = true; break; } }
  assert.ok(limited, "one address can't send unlimited requests");
});
