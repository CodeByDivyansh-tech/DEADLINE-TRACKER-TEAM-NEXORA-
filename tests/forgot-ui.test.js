// Forgot password in the browser: the link on the log-in screen, the email, the "set a new password" page,
// clear errors, the token removed from the address bar, and the message when email isn't set up.
const { test, before, after, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const { startServer, signup, fakeMail } = require("./srv");
const { FIXED_NOW } = require("./helpers");

let s, s2, mail, browser; const ctxs = [];
before(async () => {
  mail = await fakeMail().start();
  s = await startServer({ EMAIL_PROVIDER: "brevo", EMAIL_API_KEY: "k", EMAIL_FROM: "Deadline Tracker <noreply@example.com>", EMAIL_API_URL: mail.url + "/v3/smtp/email" });
  s2 = await startServer({});
  browser = await chromium.launch();
});
after(async () => { await browser.close(); s.stop(); s2.stop(); mail.close(); });
afterEach(async () => { while (ctxs.length) { const c = ctxs.pop(); const errs = c.__errors; await c.close(); assert.deepEqual(errs, [], "no errors in the browser"); } });

async function open(base, path = "/", opts = {}){
  const ctx = await browser.newContext({ viewport: opts.viewport || { width: 1280, height: 860 }, timezoneId: "Asia/Kolkata", colorScheme: "dark" });
  ctx.__errors = []; ctxs.push(ctx);
  const page = await ctx.newPage();
  page.on("pageerror", e => ctx.__errors.push(e.message));
  page.on("console", m => { if (m.type() === "error" && !/Failed to load resource|fonts\./.test(m.text())) ctx.__errors.push(m.text()); });
  await page.clock.setFixedTime(FIXED_NOW);
  await page.goto(base + path + (path.includes("?") ? "&" : "?") + "dt-test".replace(/^/, "") );
  await page.waitForSelector(".auth-card");
  return page;
}
const errOf = page => until(async () => { const t = await page.evaluate(() => { const e = document.getElementById("authErr"); return e && !e.hidden ? e.textContent : ""; }); return t || null; });
const until = async (fn, ms = 3000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await fn(); if (v) return v; await new Promise(r => setTimeout(r, 40)); } return fn(); };

test("log-in screen: 'Forgot password?' sends a reset link with clear checks first", async () => {
  await signup(s.base, "Asha", "asha@example.com", "first-password");
  const page = await open(s.base);
  await page.click("[data-act=authforgot]");
  assert.match(await page.textContent(".auth-card h1"), /reset your password/i);
  assert.equal(await page.locator("#au-pass").count(), 0, "no password field here");
  await page.click("#authGo");
  assert.match(await page.textContent("#authErr"), /enter your email/i);
  await page.fill("#au-email", "asha@");
  await page.click("#authGo");
  assert.match(await page.textContent("#authErr"), /valid email/i);
  await page.fill("#au-email", "asha@example.com");
  await page.click("#authGo");
  await page.waitForSelector("#authOk:not([hidden])");
  assert.match(await page.textContent("#authOk"), /If an account uses this email/);
  assert.ok(await until(() => mail.linkFor("asha@example.com")), "email sent");
  await page.click("[data-act=authmode][data-v=login]");
  assert.match(await page.textContent(".auth-card h1"), /welcome back/i);
});

test("the emailed link opens 'Set a new password'; mistakes are explained; then you log in with the new password", async () => {
  await signup(s.base, "Ravi", "ravi@example.com", "old-password-1");
  await fetch(s.base + "/api/auth/forgot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "ravi@example.com" }) });
  const link = await until(() => mail.linkFor("ravi@example.com"));
  const page = await open(s.base, "/" + link.slice(link.indexOf("#")).replace(/^/, "?dt-test").replace("?dt-test#", "?dt-test#"));
  assert.match(await page.textContent(".auth-card h1"), /set a new password/i);
  assert.equal(await page.evaluate(() => location.hash), "", "token removed from the address bar");
  await page.fill("#au-pass", "short-1"); await page.fill("#au-pass2", "short-1");
  await page.click("#authGo"); assert.match(await errOf(page), /8 characters/);
  await page.fill("#au-pass", "new-password-2"); await page.fill("#au-pass2", "new-password-3");
  await page.click("#authGo"); assert.match(await errOf(page), /don't match/i);
  await page.fill("#au-pass2", "new-password-2");
  await page.click("#authGo");
  await page.waitForSelector("#authOk:not([hidden])");
  assert.match(await page.textContent("#authOk"), /Password changed/i);
  assert.match(await page.textContent(".auth-card h1"), /welcome back/i);
  assert.equal(await page.inputValue("#au-email"), "ravi@example.com", "email filled in");
  await page.fill("#au-pass", "new-password-2"); await page.click("#authGo");
  await page.waitForSelector("#onb:not([hidden]) #onb-name, #app:not([hidden])");
});

test("an old or broken link says so and offers a new one", async () => {
  const page = await open(s.base, "/?dt-test#reset=" + "a".repeat(43));
  await page.fill("#au-pass", "new-password-2"); await page.fill("#au-pass2", "new-password-2");
  await page.click("#authGo");
  assert.match(await errOf(page), /expired or isn't valid/);
  await page.click("[data-act=authforgot]");
  assert.match(await page.textContent(".auth-card h1"), /reset your password/i);
});

test("email not set up: the page says to ask the admin, plainly", async () => {
  const page = await open(s2.base);
  await page.click("[data-act=authforgot]");
  await page.fill("#au-email", "someone@example.com"); await page.click("#authGo");
  await page.waitForSelector("#authOk:not([hidden])");
  assert.match(await page.textContent("#authOk"), /admin/i);
});

test("phone: forgot and reset pages fit without sideways scrolling", async () => {
  const page = await open(s.base, "/", { viewport: { width: 390, height: 844 } });
  await page.click("[data-act=authforgot]");
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= 390));
  const p2 = await open(s.base, "/?dt-test#reset=" + "b".repeat(43), { viewport: { width: 390, height: 844 } });
  assert.ok(await p2.evaluate(() => document.documentElement.scrollWidth <= 390));
  assert.ok(await p2.locator("#au-pass2").isVisible());
});

test("admin page: 'Reset link' makes a one-time link to give to someone who can't log in", async () => {
  const sa = await startServer({});
  try {
    await signup(sa.base, "Admin", "boss@example.com", "admin-password");
    await signup(sa.base, "Lena", "lena@example.com", "lena-password-1");
    const ctx = await browser.newContext(); ctx.__errors = []; ctxs.push(ctx);
    const page = await ctx.newPage(); page.on("pageerror", e => ctx.__errors.push(e.message));
    await page.goto(sa.base + "/"); await page.waitForSelector(".auth-card");
    await page.fill("#au-email", "boss@example.com"); await page.fill("#au-pass", "admin-password"); await page.click("#authGo");
    await page.waitForSelector("#onb-name, #app:not([hidden])");
    await page.goto(sa.base + "/admin"); await page.click("[data-tab=users]");
    await page.click('[data-reset-link][data-email="lena@example.com"]');
    const out = page.locator("#resetLinkOut"); await out.waitFor();
    assert.match(await out.inputValue(), /#reset=[A-Za-z0-9_-]{43}$/);
  } finally { sa.stop(); }
});

test("a reset link pasted into a tab that already has the site open still opens 'Set a new password'", async () => {
  const page = await open(s.base);
  await page.evaluate(() => { location.hash = "reset=" + "c".repeat(43); });
  await page.waitForSelector("#au-pass2");
  assert.match(await page.textContent(".auth-card h1"), /set a new password/i);
  assert.equal(await page.evaluate(() => location.hash), "", "token removed from the address bar");
});
