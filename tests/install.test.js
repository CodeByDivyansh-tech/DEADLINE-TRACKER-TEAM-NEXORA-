// "Install App" in Settings: uses the browser's own install window when it offers one, shows plain steps when it
// doesn't, shows "App installed" afterwards, and never prompts by itself.
const { test, before, after, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { setup, newPage, onboard, go } = require("./helpers");

let env, page;
before(async () => { env = await setup(); });
after(async () => { await env.close(); });
afterEach(async () => { if (page) { assert.deepEqual(page.errors, [], "no errors in the browser"); await page.context().close(); page = null; } });

async function open(opts = {}) {
  if (opts.userAgent) {
    const ctx = await env.browser.newContext({ viewport: opts.viewport || { width: 1366, height: 900 }, userAgent: opts.userAgent, timezoneId: "Asia/Kolkata" });
    page = await ctx.newPage(); page.errors = []; page.on("pageerror", e => page.errors.push(e.message));
    await page.goto(env.base + "/index.html?dt-test"); await page.waitForSelector("#onb-name, #app:not([hidden])");
  } else page = await newPage(env, opts);
  await onboard(page, { demo: false });
  await go(page, "prefs");
}
// what Chrome/Edge do when the site can be installed: fire "beforeinstallprompt" with prompt() and userChoice
const offer = outcome => page.evaluate(outcome => {
  window.__prompts = 0;
  const e = new Event("beforeinstallprompt", { cancelable: true });
  e.prompt = () => { window.__prompts++; return outcome === "throw" ? Promise.reject(new Error("blocked")) : Promise.resolve(); };
  e.userChoice = Promise.resolve({ outcome });
  window.dispatchEvent(e); window.__prevented = e.defaultPrevented;
}, outcome);
const txt = async sel => (await page.textContent(sel)).replace(/\s+/g, " ").trim();

test("Settings has an 'Install App' button with an icon; the Today page has none; nothing prompts by itself", async () => {
  await open();
  const b = page.locator("#s-profile #installBtn");
  assert.ok(await b.isVisible()); assert.equal((await b.textContent()).trim(), "Install App");
  assert.equal(await b.locator("svg").count(), 1, "download icon");
  assert.ok(await b.evaluate(e => e.classList.contains("btn") && e.classList.contains("primary")), "the app's own button style");
  await offer("accepted");
  assert.equal(await page.evaluate(() => window.__prevented), true, "the browser's own banner is held back");
  assert.equal(await page.evaluate(() => window.__prompts), 0, "no prompt until the user clicks");
  await go(page, "overview"); assert.equal(await page.locator("#installBtn").count(), 0);
});

test("click → the browser's install window; accepted → success message and 'App installed' instead of the button, also after a reload", async () => {
  await open(); await offer("accepted");
  await page.click("#installBtn");
  await page.waitForSelector("#installDone");
  assert.equal(await page.evaluate(() => window.__prompts), 1);
  assert.match(await txt("#installDone"), /App installed/);
  assert.equal(await page.locator("#installBtn").count(), 0);
  assert.match(await page.textContent("#toastMsg"), /Deadline Tracker is installed/);
  await page.evaluate(() => window.dispatchEvent(new Event("appinstalled")));
  assert.equal(await page.locator("#installDone").count(), 1);
  await page.reload(); await page.waitForSelector("#app:not([hidden])"); await go(page, "prefs");
  assert.equal(await page.locator("#installBtn").count(), 0, "not offered again");
  assert.match(await txt("#installBox"), /Installed on this device/);
});

test("installed from the browser's own menu: the 'appinstalled' event alone switches to 'App installed' with one message", async () => {
  await open();
  await page.evaluate(() => window.dispatchEvent(new Event("appinstalled")));
  await page.waitForSelector("#installDone");
  assert.match(await page.textContent("#toastMsg"), /Deadline Tracker is installed/);
});

test("dismissed → the button stays, a calm message; uninstalled later (browser offers again) → the button returns", async () => {
  await open(); await offer("dismissed");
  await page.click("#installBtn");
  await page.waitForFunction(() => /Not installed/.test(document.getElementById("toastMsg").textContent));
  assert.ok(await page.locator("#installBtn").isVisible());
  await offer("accepted"); await page.click("#installBtn"); await page.waitForSelector("#installDone");
  await offer("accepted");   // the browser only offers again when the app is no longer installed
  await page.waitForSelector("#installBtn");
  assert.equal(await page.locator("#installDone").count(), 0);
});

test("the install window fails → an error message and the manual steps, no crash", async () => {
  await open(); await offer("throw");
  await page.click("#installBtn");
  await page.waitForSelector("#installHow");
  assert.match(await page.textContent("#toastMsg"), /Couldn't open the install window/);
});

test("no direct install offered: the button shows simple steps for this device (iPhone, Android, Firefox, Chrome)", async () => {
  const cases = [
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1", /Share/, /Add to Home Screen/],
    ["Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36", /menu/i, /Install app|Add to Home screen/],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0", /Firefox/, /Chrome or Edge/],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36", /address bar/, /Install/]
  ];
  for (const [ua, a, b] of cases) {
    await open({ userAgent: ua, viewport: /iPhone|Android/.test(ua) ? { width: 390, height: 844 } : undefined });
    assert.equal(await page.locator("#installHow").count(), 0, "steps are hidden until asked for");
    await page.click("#installBtn");
    const how = await txt("#installHow");
    assert.match(how, a, ua.slice(13, 40)); assert.match(how, b);
    assert.equal(await page.getAttribute("#installBtn", "aria-expanded"), "true");
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "no sideways scrolling");
    await page.click("#installBtn"); assert.equal(await page.locator("#installHow").count(), 0, "click again to hide");
    assert.deepEqual(page.errors, []); await page.context().close(); page = null;
  }
});

test("opened as the installed app (its own window): 'App installed', no button", async () => {
  await open();
  // an installed app's window reports display-mode: standalone
  await page.addInitScript(() => { const mm = window.matchMedia.bind(window); window.matchMedia = q => /display-mode:\s*standalone/.test(q) ? { matches: true, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} } : mm(q); });
  await page.reload(); await page.waitForSelector("#app:not([hidden])"); await go(page, "prefs");
  assert.equal(await page.locator("#installBtn").count(), 0);
  assert.match(await txt("#installBox"), /You're using the installed app/);
  assert.match(await txt("#installDone"), /App installed/);
});

test("both themes: the install row is readable", async () => {
  await open();
  for (const t of ["light", "dark"]) {
    await page.evaluate(t => document.documentElement.setAttribute("data-theme", t), t); await page.waitForTimeout(300);
    const r = await page.$eval("#installBtn", e => { const c = getComputedStyle(e); const lum = s => { const [r, g, b] = s.match(/[\d.]+/g).slice(0, 3).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }); return .2126 * r + .7152 * g + .0722 * b; }; const a = lum(c.color), b = lum(c.backgroundColor); return (Math.max(a, b) + .05) / (Math.min(a, b) + .05); });
    assert.ok(r >= 4.5, `${t}: ${r.toFixed(1)}`);
  }
});
