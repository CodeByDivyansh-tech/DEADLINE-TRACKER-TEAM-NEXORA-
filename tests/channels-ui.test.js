// Settings → Notifications in the browser, connected to the real server with fake Brevo and Telegram APIs:
// confirm email, connect / test / disconnect Telegram, choose what goes to email and Telegram, confirm-email link.
const { test, before, after, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const { startServer, fakeMail, fakeTelegram } = require("./srv");
const { onboard, pollPage } = require("./helpers");

let s, mail, tg, browser; const ctxs = [];
const SECRET = "ui-webhook-secret";
before(async () => {
  mail = await fakeMail().start(); tg = await fakeTelegram().start();
  s = await startServer({ EMAIL_PROVIDER: "brevo", EMAIL_API_KEY: "k", EMAIL_FROM: "Deadline Tracker <noreply@example.com>", EMAIL_API_URL: mail.url + "/v3/smtp/email",
    APP_BASE_URL: "http://127.0.0.1:1", TELEGRAM_BOT_TOKEN: tg.token, TELEGRAM_API_URL: tg.url, TELEGRAM_MODE: "webhook", TELEGRAM_WEBHOOK_SECRET: SECRET });
  browser = await chromium.launch();
});
after(async () => { await browser.close(); s.stop(); mail.close(); tg.close(); });
afterEach(async () => { while (ctxs.length) { const c = ctxs.pop(); const errs = c.__errors; await c.close(); assert.deepEqual(errs, [], "no errors in the browser"); } });

let n = 0;
async function newUser(opts = {}){
  const ctx = await browser.newContext({ viewport: opts.viewport || { width: 1280, height: 900 }, timezoneId: "Asia/Kolkata" });
  ctx.__errors = []; ctxs.push(ctx);
  const page = await ctx.newPage();
  page.on("pageerror", e => ctx.__errors.push(e.message));
  page.on("console", m => { if (m.type() === "error" && !/Failed to load resource|fonts\./.test(m.text())) ctx.__errors.push(m.text()); });
  await page.goto(s.base + "/?dt-test"); await page.waitForSelector(".auth-card");
  await page.click("[data-act=authmode][data-v=signup]");
  const email = `ui${++n}@example.com`;
  await page.fill("#au-name", "Ui " + n); await page.fill("#au-email", email); await page.fill("#au-pass", "password123"); await page.click("#authGo");
  await page.waitForSelector("#onb-name"); await onboard(page, { demo: false, name: "Ui" });
  page.email = email; return page;
}
const openNotif = async page => { await page.evaluate(() => { location.hash = "prefs"; }); await page.waitForSelector(".set-nav"); await page.click("[data-act=settab][data-v=s-notif]"); await page.waitForSelector("#chEmail"); };
const toastText = page => page.textContent("#toastMsg");
const verifyToken = email => { const m = [...mail.sent].reverse().find(x => JSON.stringify(x.body.to).includes(email) && /#verify=/.test(JSON.stringify(x.body))); return m && JSON.stringify(m.body).match(/#verify=([A-Za-z0-9_-]{43})/)[1]; };

test("Notifications shows email and Telegram status; 'Send confirmation email' sends one", async () => {
  const page = await newUser(); await openNotif(page);
  assert.match(await page.textContent("#s-notif h3"), /Notifications/);
  assert.match(await page.textContent("#chEmail"), new RegExp(page.email.replace(".", "\\.")));
  assert.match(await page.textContent("#chEmail"), /Not confirmed yet/);
  assert.match(await page.textContent("#chTg"), /Not connected/);
  const before = mail.sent.length;
  await page.click("[data-act=chverify]");
  await pollPage(page, () => /sent/i.test(document.getElementById("toastMsg").textContent), null, 4000);
  assert.equal(mail.sent.length, before + 1);
});

test("the confirm link from the email confirms the address and the settings say so", async () => {
  const page = await newUser();
  await pollPage(page, () => true, null, 100);
  const t = verifyToken(page.email); assert.ok(t, "welcome email has a link");
  await page.goto(s.base + "/?dt-test#verify=" + t);
  await page.waitForSelector("#app:not([hidden])");
  await pollPage(page, () => /Email confirmed/.test(document.getElementById("toastMsg").textContent), null, 4000);
  assert.equal(await page.evaluate(() => location.hash), "", "token removed from the address bar");
  await openNotif(page);
  await pollPage(page, () => /Confirmed/.test(document.getElementById("chEmail").textContent), null, 4000);
});

test("Connect Telegram: a button opens the bot with a one-time link; the page shows Connected; test; disconnect", async () => {
  const page = await newUser(); await openNotif(page);
  await page.click("[data-act=tglink]");
  const a = page.locator("#tgOpen"); await a.waitFor();
  const href = await a.getAttribute("href");
  assert.match(href, /^https:\/\/t\.me\/DeadlineTrackerTestBot\?start=[A-Za-z0-9_-]{43}$/); assert.equal(await a.getAttribute("target"), "_blank");
  // the person presses Start in Telegram:
  await fetch(s.base + "/api/telegram/webhook", { method: "POST", headers: { "Content-Type": "application/json", "X-Telegram-Bot-Api-Secret-Token": SECRET }, body: JSON.stringify(tg.message(4242, "/start " + href.split("start=")[1], "ui_person")) });
  await pollPage(page, () => /Connected as @ui_person/.test(document.getElementById("chTg").textContent), null, 8000);
  await page.click("[data-act=tgtest]");
  await pollPage(page, () => /Test message sent/i.test(document.getElementById("toastMsg").textContent), null, 4000);
  assert.match(tg.to(4242).at(-1).text, /Test message/);
  await page.click("[data-act=tgunlink]");
  await pollPage(page, () => /Not connected/.test(document.getElementById("chTg").textContent), null, 4000);
});

test("choosing what goes to email and Telegram saves to the account", async () => {
  const page = await newUser(); await openNotif(page);
  for (const id of ["#pf-deadline", "#pf-study", "#pf-account", "#ch-email", "#ch-tg"]) assert.equal(await page.isChecked(id), true, id + " on by default");
  await page.click("#pf-study"); await page.click("#ch-tg");
  await pollPage(page, async () => { const p = (await (await fetch("/api/profile")).json()).user.notifyPrefs; return p.study === false && p.telegram === false && p.deadline === true; }, null, 4000);
  await page.reload(); await page.waitForSelector("#app:not([hidden])"); await openNotif(page);
  assert.equal(await page.isChecked("#pf-study"), false); assert.equal(await page.isChecked("#ch-tg"), false);
});

test("phone: the Notifications settings fit without sideways scrolling", async () => {
  const page = await newUser({ viewport: { width: 390, height: 844 } }); await openNotif(page);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= 390));
  await page.screenshot({ path: "/tmp/ux/notif-phone.png", fullPage: false }).catch(() => {});
});

test("a confirm link opened in a new tab (logged out) confirms the address and says so on the log-in page", async () => {
  const page = await newUser();
  const t = verifyToken(page.email);
  const ctx = await browser.newContext(); ctx.__errors = []; ctxs.push(ctx);
  const p2 = await ctx.newPage(); p2.on("pageerror", e => ctx.__errors.push(e.message));
  await p2.goto(s.base + "/#verify=" + t);
  await p2.waitForSelector("#authOk:not([hidden])");
  assert.match(await p2.textContent("#authOk"), /Email confirmed/);
  assert.equal(await p2.evaluate(() => location.hash), "");
  assert.equal((await (await fetch(s.base + "/api/auth/verify-email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: t }) })).json()).code, "bad_token", "used up");
});
