// Email and Telegram, against the real server with fake Brevo and Telegram APIs (same requests and answers as the
// real services; nothing leaves this machine). Covers: welcome + confirm email, account messages, reminders on both
// channels, preferences, no duplicates, failures and retries, Telegram linking / test / disconnect, isolation
// between accounts, rate limits, and secrets never leaving the server.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");
const { startServer, client, signup, fakeMail, fakeTelegram } = require("./srv");

let s, mail, tg;
const SECRET = "test-webhook-secret_123";
const wait = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 5000){ for (let t = 0; t < ms; t += 50) { const v = await fn(); if (v) return v; await wait(50); } return fn(); }
before(async () => {
  mail = await fakeMail().start(); tg = await fakeTelegram().start();
  s = await startServer({ EMAIL_PROVIDER: "brevo", EMAIL_API_KEY: "k", EMAIL_FROM: "Deadline Tracker <noreply@example.com>", EMAIL_API_URL: mail.url + "/v3/smtp/email",
    APP_BASE_URL: "https://site.example", TELEGRAM_BOT_TOKEN: tg.token, TELEGRAM_API_URL: tg.url, TELEGRAM_MODE: "webhook", TELEGRAM_WEBHOOK_SECRET: SECRET,
    REMINDER_INTERVAL_MS: "200", OUTBOX_INTERVAL_MS: "150" });
});
after(() => { s.stop(); mail.close(); tg.close(); });
// The test's own look into the database waits for the server's writes instead of failing with "database is locked".
const db = () => { const d = new DatabaseSync(path.join(s.dataDir, "deadline.db")); d.exec("PRAGMA busy_timeout = 5000"); return d; };
const mailsTo = to => mail.sent.filter(m => JSON.stringify(m.body.to || "").includes(to));
const verifyTokenFor = to => { const m = [...mailsTo(to)].reverse().find(x => /#verify=/.test(JSON.stringify(x.body))); return m && JSON.stringify(m.body).match(/#verify=([A-Za-z0-9_-]{43})/)[1]; };
const hook = (update, secret = SECRET) => fetch(s.base + "/api/telegram/webhook", { method: "POST", headers: Object.assign({ "Content-Type": "application/json" }, secret ? { "X-Telegram-Bot-Api-Secret-Token": secret } : {}), body: JSON.stringify(update) });
async function verified(name, email){ const c = await signup(s.base, name, email); const t = await until(() => verifyTokenFor(email)); const r = await client(s.base).post("/api/auth/verify-email", { token: t }); assert.equal(r.status, 200, JSON.stringify(r.json) + " " + JSON.stringify(mailsTo(email).map(m => m.body.subject))); return c; }
async function linkTelegram(c, chat){
  const l = await c.post("/api/telegram/link"); assert.equal(l.status, 200, JSON.stringify(l.json));
  const token = l.json.url.split("start=")[1];
  assert.equal((await hook(tg.message(chat, "/start " + token))).status, 200);
  return token;
}
const dueSoon = (mins = 30) => { const d = new Date(Date.now() + mins * 60e3); const loc = new Date(d.toLocaleString("en-US", { timeZone: "Asia/Kolkata" })); return { dueDate: `${loc.getFullYear()}-${String(loc.getMonth() + 1).padStart(2, "0")}-${String(loc.getDate()).padStart(2, "0")}`, dueTime: `${String(loc.getHours()).padStart(2, "0")}:${String(loc.getMinutes()).padStart(2, "0")}` }; };

test("email: sign-up sends one branded welcome email with a one-time confirm link (and never the password)", async () => {
  await signup(s.base, "Asha Rao", "asha@example.com", "secret-pass-123");
  const m = await until(() => mailsTo("asha@example.com")[0]);
  const subj = mailsTo("asha@example.com").map(x => x.body.subject);
  assert.equal(subj.filter(x => /Welcome/.test(x)).length, 1, "one welcome email: " + JSON.stringify(subj));
  assert.match(m.body.subject, /Welcome to Deadline Tracker, Asha/);
  assert.match(m.body.htmlContent, /Confirm my email/); assert.match(m.body.htmlContent, /#a4501c/, "site branding");
  assert.match(m.body.textContent, /https:\/\/site\.example\/#verify=[A-Za-z0-9_-]{43}/);
  assert.doesNotMatch(JSON.stringify(m.body), /secret-pass-123/);
  const d = db(); const row = d.prepare("SELECT o.* FROM outbox o JOIN users u ON u.id = o.user_id WHERE u.email = ? AND kind = 'welcome'").get("asha@example.com");
  const v = d.prepare("SELECT token_hash FROM email_verifications").all(); d.close();
  assert.equal(row.status, "sent"); assert.doesNotMatch(row.body_text, /verify=/, "the link isn't stored");
  assert.ok(v.every(x => x.token_hash.length === 64), "only token hashes stored");
});

test("email: a slow email service doesn't cause a second copy (the background job leaves direct sends alone)", async () => {
  // its own server and mail service (this file's server is near its sign-up limit of 20 per 15 minutes)
  const m2 = await fakeMail().start(); m2.delay = 700;   // several runs of the outbox job (every 150 ms) happen while the welcome email is being sent
  const s2 = await startServer({ EMAIL_PROVIDER: "brevo", EMAIL_API_KEY: "k", EMAIL_FROM: "Deadline Tracker <noreply@example.com>", EMAIL_API_URL: m2.url + "/v3/smtp/email", APP_BASE_URL: "https://site.example", OUTBOX_INTERVAL_MS: "150" });
  try {
    await signup(s2.base, "Slow Mail", "slow@example.com");
    await until(() => m2.sent.length);
    await wait(1200);
    const got = m2.sent;
    assert.equal(got.length, 1, "one email: " + JSON.stringify(got.map(m => m.body.subject)));
    assert.doesNotMatch(JSON.stringify(got[0].body), /not stored/, "never the placeholder text");
    const d = new DatabaseSync(path.join(s2.dataDir, "deadline.db")); d.exec("PRAGMA busy_timeout = 5000");
    const r = d.prepare("SELECT o.status FROM outbox o JOIN users u ON u.id = o.user_id WHERE u.email = ? AND o.kind = 'welcome'").get("slow@example.com"); d.close();
    assert.equal(r.status, "sent");
  } finally { s2.stop(); m2.close(); }
});

test("email: the confirm link works once, then says it's used; tampered and expired links are refused", async () => {
  const c = await signup(s.base, "Ravi", "ravi@example.com");
  assert.equal((await c.get("/api/channels")).json.email.verified, false);
  const t = await until(() => verifyTokenFor("ravi@example.com"));
  assert.equal((await client(s.base).post("/api/auth/verify-email", { token: t.slice(0, -1) + (t.endsWith("A") ? "B" : "A") })).status, 400);
  const ok = await client(s.base).post("/api/auth/verify-email", { token: t });
  assert.equal(ok.status, 200); assert.equal(ok.json.email, "ravi@example.com");
  assert.equal((await client(s.base).post("/api/auth/verify-email", { token: t })).json.code, "bad_token", "single use");
  assert.equal((await c.get("/api/channels")).json.email.verified, true);
  assert.equal((await c.get("/api/me")).json.user.emailVerified, true);
  const c2 = await signup(s.base, "Exp", "exp@example.com"); const t2 = await until(() => verifyTokenFor("exp@example.com"));
  const d = db(); d.prepare("UPDATE email_verifications SET expires_at = ? WHERE user_id = ?").run(Date.now() - 1000, c2.user.id); d.close();
  assert.equal((await client(s.base).post("/api/auth/verify-email", { token: t2 })).json.code, "bad_token", "expired");
});

test("email: 'send the confirmation again' works and is limited to 3 an hour", async () => {
  const c = await signup(s.base, "Lim", "lim@example.com");
  const kinds = () => mailsTo("lim@example.com").map(m => /Welcome/.test(m.body.subject) ? "welcome" : /Confirm your email/.test(m.body.subject) ? "confirm" : m.body.subject);
  assert.ok(await until(() => kinds().includes("welcome"), 15000), "welcome email arrived");
  for (let k = 0; k < 3; k++) assert.equal((await c.post("/api/profile/verify-email")).status, 200, "send " + k);
  assert.equal((await c.post("/api/profile/verify-email")).status, 429);
  await wait(300);
  assert.deepEqual(kinds().sort(), ["confirm", "confirm", "confirm", "welcome"], "exactly one welcome and three confirmation emails");
});

test("reminders: email and Telegram get each reminder once; an unconfirmed email gets none", async () => {
  const a = await verified("Kiran", "kiran@example.com"); await linkTelegram(a, 5001);
  const u = await signup(s.base, "Unconf", "unconf@example.com");
  await a.post("/api/tasks", Object.assign({ title: "Java lab report" }, dueSoon(30)));
  await u.post("/api/tasks", Object.assign({ title: "Unconfirmed task" }, dueSoon(30)));
  assert.ok(await until(() => mailsTo("kiran@example.com").some(m => /Java lab report/.test(m.body.textContent))), "reminder email");
  assert.ok(await until(() => tg.to(5001).some(m => /Java lab report/.test(m.text))), "reminder in Telegram");
  await wait(900);   // several more runs of both jobs
  // Each kind of reminder arrives once. (Just after midnight India time a "Due today" message is also correct,
  // so the check is per message, not per task: that made this test fail at night only.)
  const em = mailsTo("kiran@example.com").filter(m => /Java lab report/.test(m.body.textContent)).map(m => m.body.subject);
  assert.equal(em.length, new Set(em).size, "no duplicate email: " + JSON.stringify(em));
  assert.ok(em.includes("Deadline reminder"));
  const tm = tg.to(5001).filter(m => /Java lab report/.test(m.text)).map(m => m.text);
  assert.equal(tm.length, new Set(tm).size, "no duplicate Telegram message");
  assert.equal(tm.length, em.length, "the same reminders on both channels");
  assert.ok(!mailsTo("unconf@example.com").some(m => /Unconfirmed task/.test(JSON.stringify(m.body))), "unconfirmed address gets no reminders");
  const d = db(); const sk = d.prepare("SELECT o.status, o.last_error FROM outbox o JOIN users x ON x.id = o.user_id WHERE x.email = ? AND o.channel = 'email' AND o.kind = 'reminder'").get("unconf@example.com"); d.close();
  assert.equal(sk.status, "skipped"); assert.match(sk.last_error, /not confirmed/);
});

test("preferences: turning off email, Telegram, or deadline messages is respected; the in-app bell still works", async () => {
  const a = await verified("Pref", "pref@example.com"); await linkTelegram(a, 5002);
  assert.equal((await a.patch("/api/profile", { notifyPrefs: { email: false } })).status, 200);
  await a.post("/api/tasks", Object.assign({ title: "No email for this" }, dueSoon(40)));
  assert.ok(await until(() => tg.to(5002).some(m => /No email for this/.test(m.text))), "Telegram still gets it");
  await wait(500); assert.ok(!mailsTo("pref@example.com").some(m => /No email for this/.test(JSON.stringify(m.body))));
  await a.patch("/api/profile", { notifyPrefs: { email: true, deadline: false } });
  await a.post("/api/tasks", Object.assign({ title: "No deadline messages" }, dueSoon(45)));
  await wait(1000);
  assert.ok(!tg.to(5002).some(m => /No deadline messages/.test(m.text)) && !mailsTo("pref@example.com").some(m => /No deadline messages/.test(JSON.stringify(m.body))));
  assert.ok((await a.get("/api/notifications")).json.notifications.some(n => /No deadline messages/.test(n.message)), "the bell still shows it");
  assert.equal((await a.patch("/api/profile", { notifyPrefs: { telegram: "yes" } })).status, 400, "only true/false accepted");
});

test("Telegram: Connect makes a t.me link with a one-time token; the webhook needs the secret; the chat is linked", async () => {
  const c = await signup(s.base, "Tara", "tara@example.com");
  const st0 = (await c.get("/api/channels")).json.telegram;
  assert.deepEqual([st0.configured, st0.linked, st0.bot], [true, false, "DeadlineTrackerTestBot"]);
  const l = await c.post("/api/telegram/link");
  assert.match(l.json.url, /^https:\/\/t\.me\/DeadlineTrackerTestBot\?start=[A-Za-z0-9_-]{43}$/);
  const token = l.json.url.split("start=")[1];
  assert.equal((await hook(tg.message(6001, "/start " + token), null)).status, 401, "no secret, refused");
  assert.equal((await hook(tg.message(6001, "/start " + token), "wrong-secret")).status, 401);
  assert.equal((await c.get("/api/channels")).json.telegram.linked, false);
  assert.equal((await hook(tg.message(6001, "/start " + token, "tara_tg"))).status, 200);
  const st = (await c.get("/api/channels")).json.telegram;
  assert.equal(st.linked, true); assert.equal(st.username, "tara_tg");
  assert.match(tg.to(6001).at(-1).text, /Connected! Hi Tara/);
  await hook(tg.message(6002, "/start " + token));
  assert.match(tg.to(6002).at(-1).text, /expired or was already used/, "one-time");
  const d = db(); assert.equal(d.prepare("SELECT chat_id FROM telegram_links WHERE user_id = ?").get(c.user.id).chat_id, "6001"); d.close();
});

test("Telegram: expired links, bad links, group chats and someone else's chat are refused", async () => {
  const a = await signup(s.base, "A1", "a1@example.com"), b = await signup(s.base, "B1", "b1@example.com");
  const ta = (await a.post("/api/telegram/link")).json.url.split("start=")[1];
  const d = db(); d.prepare("UPDATE telegram_link_tokens SET expires_at = ? WHERE user_id = ?").run(Date.now() - 1, a.user.id); d.close();
  await hook(tg.message(7001, "/start " + ta)); assert.match(tg.to(7001).at(-1).text, /expired/);
  await hook(tg.message(7001, "/start not-a-token")); assert.match(tg.to(7001).at(-1).text, /isn't valid/);
  const ta2 = (await a.post("/api/telegram/link")).json.url.split("start=")[1];
  await hook(tg.message(-100, "/start " + ta2, "grp", "group")); assert.match(tg.to(-100).at(-1).text, /private chat/);
  assert.equal((await a.get("/api/channels")).json.telegram.linked, false);
  await hook(tg.message(7002, "/start " + ta2)); assert.equal((await a.get("/api/channels")).json.telegram.linked, true);
  const tb = (await b.post("/api/telegram/link")).json.url.split("start=")[1];
  await hook(tg.message(7002, "/start " + tb));
  assert.match(tg.to(7002).at(-1).text, /already connected to another/);
  assert.equal((await b.get("/api/channels")).json.telegram.linked, false, "B can't take over A's chat");
});

test("Telegram: test message goes only to your own chat; limited; disconnect from the site or with /stop", async () => {
  const a = await signup(s.base, "Tst", "tst@example.com"), b = await signup(s.base, "Oth", "oth@example.com");
  await linkTelegram(a, 8001); await linkTelegram(b, 8002);
  const before8002 = tg.to(8002).length;
  assert.equal((await a.post("/api/telegram/test")).status, 200);
  assert.match(tg.to(8001).at(-1).text, /Test message/); assert.equal(tg.to(8002).length, before8002, "the other user's chat got nothing");
  await a.post("/api/telegram/test"); await a.post("/api/telegram/test");
  assert.equal((await a.post("/api/telegram/test")).status, 429, "limited");
  assert.equal((await a.del("/api/telegram")).status, 200);
  assert.equal((await a.get("/api/channels")).json.telegram.linked, false);
  assert.match(tg.to(8001).at(-1).text, /disconnected/);
  assert.equal((await b.post("/api/telegram/test")).status, 200);
  await hook(tg.message(8002, "/stop")); assert.equal((await b.get("/api/channels")).json.telegram.linked, false);
  assert.equal((await b.post("/api/telegram/test")).json.code, "rate_limited" === "x" ? "" : "not_ready", "nothing to send to now");
});

test("isolation: with 6 accounts on both channels, each person's reminders reach only their own inbox and chat", async () => {
  const people = [];
  for (let k = 0; k < 6; k++) { const c = await verified("Iso" + k, `iso${k}@example.com`); await linkTelegram(c, 9100 + k); await c.post("/api/tasks", Object.assign({ title: `Private task of iso${k}` }, dueSoon(35))); people.push(c); }
  for (let k = 0; k < 6; k++) assert.ok(await until(() => tg.to(9100 + k).some(m => m.text.includes(`Private task of iso${k}`)) && mailsTo(`iso${k}@example.com`).some(m => m.body.textContent.includes(`Private task of iso${k}`))), "iso" + k);
  for (let k = 0; k < 6; k++) {
    const mine = tg.to(9100 + k).map(m => m.text).join("\n") + mailsTo(`iso${k}@example.com`).map(m => JSON.stringify(m.body)).join("\n");
    for (let j = 0; j < 6; j++) if (j !== k) assert.ok(!mine.includes(`Private task of iso${j}`), `iso${k} got iso${j}'s reminder`);
  }
});

test("account messages: password reset and change are announced by email and Telegram, with no link or token in Telegram", async () => {
  const a = await verified("Sec", "sec@example.com"); await linkTelegram(a, 9300);
  assert.equal((await a.post("/api/profile/password", { currentPassword: "password123", newPassword: "password456" })).status, 200);
  assert.ok(await until(() => tg.to(9300).some(m => /password was changed/i.test(m.text))));
  assert.ok(await until(() => mailsTo("sec@example.com").some(m => /password was changed/i.test(m.body.subject))));
  await client(s.base).post("/api/auth/forgot", { email: "sec@example.com" });
  const link = await until(() => mail.linkFor("sec@example.com"));
  const token = link.split("#reset=")[1];
  assert.equal((await client(s.base).post("/api/auth/reset", { token, password: "password789" })).status, 200);
  assert.ok(await until(() => tg.to(9300).some(m => /reset with an emailed link/.test(m.text))));
  assert.ok(!tg.to(9300).some(m => m.text.includes(token) || /reset=/.test(m.text)), "never a reset link in Telegram");
});

test("delivery failures: a failed email is retried and its reason recorded; a blocked bot disconnects that chat", async () => {
  const a = await verified("Fail", "fail@example.com"); await linkTelegram(a, 9400);
  mail.fail = true;
  await a.post("/api/tasks", Object.assign({ title: "Retry me" }, dueSoon(30)));
  const d = db();
  const row = await until(() => { const r = d.prepare("SELECT * FROM outbox WHERE user_id = ? AND channel = 'email' AND kind = 'reminder'").get(a.user.id); return r && r.attempts >= 1 && r; });
  assert.equal(row.status, "queued"); assert.match(row.last_error, /500/);
  mail.fail = false; d.prepare("UPDATE outbox SET not_before = 0 WHERE id = ?").run(row.id);
  assert.ok(await until(() => d.prepare("SELECT status FROM outbox WHERE id = ?").get(row.id).status === "sent"), "sent on retry");
  tg.blocked.add("9400");
  await a.post("/api/tasks", Object.assign({ title: "Blocked bot" }, dueSoon(31)));
  assert.ok(await until(() => !d.prepare("SELECT 1 FROM telegram_links WHERE user_id = ?").get(a.user.id)), "chat disconnected after Telegram said blocked");
  d.close();
});

test("security: the bot token and webhook secret never leave the server; webhook ignores bad bodies; routes need log-in", async () => {
  const c = await signup(s.base, "Leak", "leak@example.com");
  const all = [await c.get("/api/channels"), await c.get("/api/me"), await client(s.base).get("/api/health"), await c.post("/api/telegram/link")].map(r => r.text).join(" ");
  const page = await (await fetch(s.base + "/")).text();
  for (const secret of [tg.token, SECRET, tg.token.split(":")[1]]) { assert.ok(!all.includes(secret), "not in API answers"); assert.ok(!page.includes(secret), "not in the page"); }
  assert.doesNotMatch(s.out(), new RegExp(tg.token.split(":")[1]), "not in the server log");
  assert.equal((await hook({ junk: true })).status, 200, "unknown updates are ignored safely");
  const big = await fetch(s.base + "/api/telegram/webhook", { method: "POST", headers: { "Content-Type": "application/json", "X-Telegram-Bot-Api-Secret-Token": SECRET }, body: JSON.stringify({ message: { text: "x".repeat(70000) } }) }).catch(() => ({ status: 413 }));
  assert.ok([400, 413].includes(big.status), "oversized update refused: " + big.status);
  const anon = client(s.base);
  for (const [m, u] of [["GET", "/api/channels"], ["POST", "/api/telegram/link"], ["DELETE", "/api/telegram"], ["POST", "/api/telegram/test"], ["POST", "/api/channels/email/test"], ["POST", "/api/profile/verify-email"]]) assert.equal((await anon.call(m, u, m === "GET" || m === "DELETE" ? undefined : {})).status, 401, `${m} ${u}`);
  assert.ok(tg.webhook && tg.webhook.url === "https://site.example/api/telegram/webhook" && tg.webhook.secret_token === SECRET, "webhook registered with the secret");
});

test("without a bot token or email provider, the site says so plainly and sends nothing", async () => {
  const s2 = await startServer({});
  try {
    const c = await signup(s2.base, "None", "none@example.com");
    const st = (await c.get("/api/channels")).json;
    assert.equal(st.telegram.configured, false); assert.equal(st.email.configured, false);
    const l = await c.post("/api/telegram/link"); assert.equal(l.status, 503); assert.match(l.json.error, /isn't set up/);
    const v = await c.post("/api/profile/verify-email"); assert.equal(v.status, 503); assert.match(v.json.error, /Email isn't set up/);
    const t = await c.post("/api/channels/email/test"); assert.equal(t.status, 409);
  } finally { s2.stop(); }
});

test("polling mode (no public address, e.g. your laptop): pressing Start in Telegram links the chat", async () => {
  const tg2 = await fakeTelegram().start();
  const s3 = await startServer({ TELEGRAM_BOT_TOKEN: tg2.token, TELEGRAM_API_URL: tg2.url, TELEGRAM_MODE: "polling", TELEGRAM_POLL_SECONDS: "0" });
  try {
    const c = await signup(s3.base, "Poll", "poll@example.com");
    const token = (await c.post("/api/telegram/link")).json.url.split("start=")[1];
    tg2.updates.push(tg2.message(9900, "/start " + token, "poller"));
    assert.ok(await until(async () => (await c.get("/api/channels")).json.telegram.linked), "linked via getUpdates");
    assert.ok(tg2.calls.some(x => x.method === "deleteWebhook"));
  } finally { s3.stop(); tg2.close(); }
});
