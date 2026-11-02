// The welcome page with log in / create account (server mode): landing content, 3D scene, password show/hide,
// checks before sending, clear errors, switching between log in and sign up, password change in Settings.
const { test, before, after, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const { startServer } = require("./srv");
const { onboard, go, FIXED_NOW } = require("./helpers");

let s, browser; const ctxs = [];
before(async () => { s = await startServer({}); browser = await chromium.launch(); });
after(async () => { await browser.close(); s.stop(); });
afterEach(async () => { while (ctxs.length) { const c = ctxs.pop(); const errs = c.__errors; await c.close(); assert.deepEqual(errs, [], "no errors in the browser"); } });

async function open(opts = {}){
  const ctx = await browser.newContext({ viewport: opts.viewport || { width: 1280, height: 860 }, timezoneId: "Asia/Kolkata", locale: "en-IN", reducedMotion: opts.reducedMotion || "no-preference", colorScheme: opts.colorScheme || "dark" });
  ctx.__errors = []; ctxs.push(ctx);
  const page = await ctx.newPage();
  page.on("pageerror", e => ctx.__errors.push(e.message));
  page.on("console", m => { if (m.type() === "error" && !/Failed to load resource|fonts\./.test(m.text())) ctx.__errors.push(m.text()); });
  page.__authCalls = 0;
  page.on("request", r => { if (/\/api\/auth\/(login|signup)$/.test(r.url())) page.__authCalls++; });
  await page.clock.setFixedTime(FIXED_NOW);
  await page.goto(s.base + "/?dt-test");
  await page.waitForSelector(".auth-card");
  return page;
}
const noSideScroll = page => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

test("welcome page: says what the app does, shows the 3D scene and the log-in panel side by side", async () => {
  const page = await open();
  assert.match(await page.textContent(".landing h1"), /deadline/i);
  assert.ok(await page.isVisible(".hero3d"), "3D scene visible on desktop");
  assert.ok((await page.$$(".hero3d .float-card")).length >= 3);
  assert.ok(await page.isVisible(".auth-wrap .features"));
  const [l, c] = await Promise.all([page.$eval(".landing", e => e.getBoundingClientRect().left), page.$eval(".auth-card", e => e.getBoundingClientRect().left)]);
  assert.ok(c > l + 300, "panel sits to the right of the landing text");
  assert.equal(await page.$eval(".hero3d", e => e.getAttribute("aria-hidden")), "true", "decoration is hidden from screen readers");
  assert.ok(await noSideScroll(page));
});

test("welcome page: phone and tablet fit without sideways scrolling; the log-in panel is easy to reach", async () => {
  for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }]) {
    const page = await open({ viewport });
    assert.ok(await noSideScroll(page), `no sideways scroll at ${viewport.width}px`);
    const top = await page.$eval(".auth-card", e => e.getBoundingClientRect().top + window.scrollY);
    assert.ok(top < viewport.height * 1.2, `panel starts near the top at ${viewport.width}px (${top})`);
    const box = await page.$eval("#authGo", e => { const r = e.getBoundingClientRect(); return { w: r.width, h: r.height }; });
    assert.ok(box.h >= 44, "button is big enough to tap");
  }
});

test("welcome page: with reduced motion the floating cards stand still", async () => {
  const moving = await open();
  assert.notEqual(await moving.$eval(".hero3d .float-card", e => getComputedStyle(e).animationName), "none");
  const still = await open({ reducedMotion: "reduce" });
  assert.equal(await still.$eval(".hero3d .float-card", e => getComputedStyle(e).animationName), "none");
});

test("password can be shown and hidden", async () => {
  const page = await open();
  await page.fill("#au-pass", "secret-123");
  const t = "#au-pass-toggle";
  assert.equal(await page.getAttribute(t, "aria-label"), "Show password");
  assert.equal(await page.getAttribute(t, "aria-pressed"), "false");
  await page.click(t);
  assert.equal(await page.getAttribute("#au-pass", "type"), "text");
  assert.equal(await page.getAttribute(t, "aria-label"), "Hide password");
  assert.equal(await page.getAttribute(t, "aria-pressed"), "true");
  assert.equal(await page.inputValue("#au-pass"), "secret-123", "typed password kept");
  await page.click(t);
  assert.equal(await page.getAttribute("#au-pass", "type"), "password");
});

test("checks before sending: empty fields, a bad email and a short password get clear messages without a server call", async () => {
  const page = await open();
  await page.click("#authGo");
  assert.match(await page.textContent("#authErr"), /enter your email/i);
  assert.equal(await page.getAttribute("#au-email", "aria-invalid"), "true");
  assert.equal(await page.evaluate(() => document.activeElement.id), "au-email");
  await page.fill("#au-email", "not-an-email"); await page.click("#authGo");
  assert.match(await page.textContent("#authErr"), /valid email/i);
  await page.fill("#au-email", "x@example.com"); await page.click("#authGo");
  assert.match(await page.textContent("#authErr"), /enter your password/i);
  assert.equal(await page.getAttribute("#au-pass", "aria-invalid"), "true");
  assert.equal(await page.getAttribute("#au-email", "aria-invalid"), null, "fixed field no longer marked");
  await page.click("[data-act=authmode][data-v=signup]");
  await page.click("#authGo");
  assert.match(await page.textContent("#authErr"), /your name/i);
  await page.fill("#au-name", "Asha"); await page.fill("#au-pass", "short"); await page.click("#authGo");
  assert.match(await page.textContent("#authErr"), /at least 8/i);
  assert.equal(page.__authCalls, 0, "nothing was sent to the server");
});

test("switching between log in and create account keeps the email you typed", async () => {
  const page = await open();
  await page.fill("#au-email", "keep@example.com");
  await page.click("[data-act=authmode][data-v=signup]");
  assert.match(await page.textContent(".auth-card h1"), /Create your account/);
  assert.equal(await page.inputValue("#au-email"), "keep@example.com");
  assert.equal(await page.evaluate(() => document.activeElement.id), "au-name");
  await page.click("[data-act=authmode][data-v=login]");
  assert.equal(await page.inputValue("#au-email"), "keep@example.com");
  assert.equal(await page.evaluate(() => document.activeElement.id), "au-pass", "email already there, so the password is next");
});

test("server errors are shown plainly: duplicate account, wrong password; the right password then works", async () => {
  const page = await open();
  await page.click("[data-act=authmode][data-v=signup]");
  await page.fill("#au-name", "Neha"); await page.fill("#au-email", "neha@example.com"); await page.fill("#au-pass", "neha-pass-1");
  await page.click("#authGo");
  await page.waitForSelector("#onb-name");
  await page.evaluate(() => fetch("/api/auth/logout", { method: "POST" }));
  const p2 = await open();
  await p2.click("[data-act=authmode][data-v=signup]");
  await p2.fill("#au-name", "Neha 2"); await p2.fill("#au-email", "NEHA@example.com"); await p2.fill("#au-pass", "another-pass");
  await p2.click("#authGo");
  await p2.waitForSelector("#authErr:not([hidden])");
  assert.match(await p2.textContent("#authErr"), /already exists/);
  await p2.click("[data-act=authmode][data-v=login]");
  await p2.fill("#au-pass", "wrong-pass-1"); await p2.click("#authGo");
  await p2.waitForFunction(() => /wrong/.test(document.querySelector("#authErr").textContent));
  assert.equal(await p2.inputValue("#au-email"), "NEHA@example.com", "email kept");
  assert.equal(await p2.inputValue("#au-pass"), "", "wrong password cleared");
  await p2.fill("#au-pass", "neha-pass-1"); await p2.click("#authGo");
  await p2.waitForSelector("#onb-name, #app:not([hidden])");
});

test("Settings: change your password; the old one stops working and the new one logs in", async () => {
  const page = await open();
  await page.click("[data-act=authmode][data-v=signup]");
  await page.fill("#au-name", "Ravi"); await page.fill("#au-email", "ravi@example.com"); await page.fill("#au-pass", "old-password");
  await page.click("#authGo");
  await page.waitForSelector("#onb-name");
  await onboard(page, { mode: "student", demo: false, name: "Ravi" });
  await go(page, "prefs");
  await page.click("[data-act=pwopen]");
  await page.fill("#pw-cur", "nope-nope"); await page.fill("#pw-new", "new-password-1"); await page.click("#pwSave");
  await page.waitForFunction(() => /current password is wrong/i.test((document.querySelector("#pwErr") || {}).textContent || ""));
  await page.fill("#pw-cur", "old-password"); await page.fill("#pw-new", "short"); await page.click("#pwSave");
  await page.waitForFunction(() => /8/.test((document.querySelector("#pwErr") || {}).textContent || ""));
  await page.fill("#pw-new", "new-password-1"); await page.click("#pwSave");
  await page.waitForFunction(() => /Password changed/.test(document.querySelector("#toastMsg").textContent) && !document.querySelector("#pwBox"));
  const r = await page.evaluate(async () => {
    const t = async p => (await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "ravi@example.com", password: p }) })).status;
    return [await t("old-password"), await t("new-password-1")];
  });
  assert.deepEqual(r, [401, 200]);
});

test("design system: the welcome headline is 3D type (depth + word flip) and the app shares the pitch's colour tokens", async () => {
  const page = await open();
  const h = await page.evaluate(() => { const h = document.querySelector(".landing h1"); return { words: h.querySelectorAll(".w3d").length, text: h.textContent.replace(/\s+/g, " ").trim(), shadow: getComputedStyle(h).textShadow, anim: getComputedStyle(h.querySelector(".w3d")).animationName, label: h.getAttribute("aria-label") }; });
  assert.ok(h.words >= 5, "words split for the flip"); assert.equal(h.text, "Never miss a deadline again.");
  assert.notEqual(h.shadow, "none", "layered depth"); assert.equal(h.anim, "dtWordUp");
  for (const theme of ["light", "dark"]) {
    const tok = await page.evaluate(t => { document.documentElement.setAttribute("data-theme", t); const r = getComputedStyle(document.documentElement); return ["--teal", "--amber", "--coral"].map(v => r.getPropertyValue(v).trim()); }, theme);
    assert.ok(tok.every(Boolean), theme + " tokens: " + tok);
  }
  assert.doesNotMatch(require("fs").readFileSync(require("path").join(__dirname, "..", "src", "part1.html"), "utf8"), /#ff9ec4|#c79bff/i, "no leftover pink from the old landing gradient");
});
