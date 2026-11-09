// The landing page (Portale style) that logged-out visitors see before the log-in card:
// loader counting to 100%, a sunset scene with a glass Deadline Tracker card, words blurring in, and scrolling
// "through" the card into a second screen that leads to sign-up. Real server, real Chromium.
const { test, before, after, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const { startServer } = require("./srv");
const { pollPage } = require("./helpers");

let s, browser; const ctxs = [];
before(async () => { s = await startServer({}); browser = await chromium.launch(); });
after(async () => { await browser.close(); s.stop(); });
afterEach(async () => { while (ctxs.length) { const c = ctxs.pop(); const errs = c.__errors; await c.close(); assert.deepEqual(errs, [], "no errors in the browser"); } });

async function visit(q = "?dt-test&dt-landing", opts = {}){
  const ctx = await browser.newContext({ viewport: opts.viewport || { width: 1440, height: 900 }, reducedMotion: opts.reduced ? "reduce" : "no-preference", timezoneId: "Asia/Kolkata", hasTouch: !!opts.touch, isMobile: !!opts.touch });
  ctx.__errors = []; ctxs.push(ctx);
  const page = await ctx.newPage();
  page.on("pageerror", e => ctx.__errors.push(e.message));
  page.on("console", m => { if (m.type() === "error" && !/Failed to load resource|fonts\./.test(m.text())) ctx.__errors.push(m.text()); });
  await page.goto(s.base + "/" + q);
  return page;
}
const introDone = page => page.waitForSelector('#portal[data-intro="done"]', { timeout: 10000 });
async function scrollTo(page, f){
  await page.evaluate(f => { const el = document.getElementById("portal"); el.scrollTop = f * (el.scrollHeight - el.clientHeight); }, f);
}
const progress = page => page.evaluate(() => +document.getElementById("portal").dataset.p);

test("a logged-out visitor sees the loader count to 100%, then the scene, the nav and the headline word by word", async () => {
  const page = await visit();
  await page.waitForSelector("#portal:not([hidden])");
  assert.ok(await page.locator("#ptCount").isVisible(), "counter shows while starting");
  const seen = await page.evaluate(() => new Promise(r => { const el = document.getElementById("ptCount"); const all = [el.textContent]; new MutationObserver(() => { all.push(el.textContent); if (el.textContent === "100%") r(all); }).observe(el, { childList: true, characterData: true, subtree: true }); setTimeout(() => r(all), 8000); }));
  assert.equal(seen[seen.length - 1], "100%");
  const nums = seen.map(t => parseInt(t, 10));
  assert.ok(nums.every((n, i) => i === 0 || n >= nums[i - 1]), "never goes backwards: " + seen.join(" "));
  assert.ok(seen.every(t => /^\d{2,3}%$/.test(t)), "at least two digits: " + seen.join(" "));
  await introDone(page);
  assert.equal(await page.getAttribute("#ptTitle", "aria-label"), "Every Deadline In One Calm Place");
  const words = await page.$$eval("#ptTitle [data-word]", w => w.map(x => [x.textContent, getComputedStyle(x).opacity, getComputedStyle(x).filter]));
  assert.deepEqual(words.map(w => w[0]), ["Every", "Deadline", "In", "One", "Calm", "Place"]);
  assert.ok(words.every(w => w[1] === "1" && w[2] === "none"), "all words shown, no blur left over");
  for (const sel of ["#ptNav", "#ptBadge", "#ptLead", "#ptButtons"]) assert.equal(await page.$eval(sel, e => getComputedStyle(e).opacity), "1", sel);
  assert.equal(await page.$eval("#ptNav", e => getComputedStyle(e).filter), "none", "nav glass keeps blurring (no leftover filter)");
  assert.ok(await page.$eval(".pt-light", e => +getComputedStyle(e).opacity > .9), "the card's light is on");
  assert.equal(await page.locator(".auth-card").count(), 0, "log-in card waits behind the landing");
  assert.equal(await page.evaluate(() => document.title), "Deadline Tracker — Every deadline in one calm place");
});

test("'Log in' and 'Get started' open the log-in card in the right mode, and the landing goes away", async () => {
  let page = await visit(); await introDone(page);
  await page.click("#ptNav [data-pt=login]");
  await page.waitForSelector(".auth-card"); await page.waitForSelector("#portal", { state: "hidden" });
  assert.equal(await page.getAttribute("[data-act=authmode][data-v=login]", "aria-selected"), "true");
  assert.equal(await page.evaluate(() => document.activeElement.id), "au-email");
  page = await visit(); await introDone(page);
  await page.click("#ptButtons [data-pt=signup]");
  await page.waitForSelector("#au-name");
  assert.equal(await page.getAttribute("[data-act=authmode][data-v=signup]", "aria-selected"), "true");
});

test("scrolling goes through the card: it turns, lights up, fills white, grows past the screen, and the second screen appears; scrolling back reverses it", async () => {
  const page = await visit(); await introDone(page);
  const box0 = await page.$eval(".pt-portal", e => e.getBoundingClientRect().toJSON());
  assert.ok(box0.width < 400 && box0.height < 700, "starts as the glass card in the scene");
  assert.ok(box0.top > 70, "clear of the nav");
  await scrollTo(page, .25);
  await pollPage(page, () => +document.getElementById("portal").dataset.p > .2);
  assert.ok(await page.$eval(".pt-rim", e => +getComputedStyle(e).opacity > .3), "rim lights up");
  await scrollTo(page, 1);
  await pollPage(page, () => +document.getElementById("portal").dataset.p > .99, null, 6000);
  const box1 = await page.$eval(".pt-portal", e => e.getBoundingClientRect().toJSON());
  assert.ok(box1.left < 0 && box1.right > 1440 && box1.top < 0 && box1.bottom > 900, "the white card covers the whole screen: " + JSON.stringify(box1));
  await page.waitForFunction(() => getComputedStyle(document.getElementById("ptReady")).visibility === "visible" && getComputedStyle(document.getElementById("ptReady")).opacity === "1");
  assert.equal(await page.getAttribute("#ptReadyTitle", "aria-label"), "Everything Planned Before It's Due");
  await page.waitForFunction(() => [...document.querySelectorAll("#ptReadyTitle [data-word]")].every(w => getComputedStyle(w).opacity === "1"));
  assert.equal(await page.getAttribute("#ptNav", "data-theme"), "dark", "nav turns dark on the white screen");
  await page.click("#ptReady [data-pt=signup]");
  await page.waitForSelector("#au-name");
});

test("scrolling back up returns to the scene", async () => {
  const page = await visit(); await introDone(page);
  await scrollTo(page, 1); await pollPage(page, () => +document.getElementById("portal").dataset.p > .99, null, 6000);
  await scrollTo(page, 0); await pollPage(page, () => +document.getElementById("portal").dataset.p < .01, null, 6000);
  await page.waitForFunction(() => getComputedStyle(document.getElementById("ptReady")).visibility === "hidden");
  assert.equal(await page.getAttribute("#ptNav", "data-theme"), "light");
  assert.ok(await page.$eval(".pt-light", e => +getComputedStyle(e).opacity > .9));
});

test("reduced motion: no counter and no zoom; the screens cross-fade", async () => {
  const page = await visit("?dt-test&dt-landing", { reduced: true }); await introDone(page);
  assert.equal(await page.locator("#ptCount").isVisible(), false);
  const t = await page.$eval(".pt-media", e => getComputedStyle(e).transform);
  assert.ok(t === "none" || t === "matrix(1, 0, 0, 1, 0, 0)", "no zoom: " + t);
  await scrollTo(page, 1); await pollPage(page, () => +document.getElementById("portal").dataset.p > .99, null, 6000);
  await page.waitForFunction(() => getComputedStyle(document.getElementById("ptReady")).opacity === "1");
  const box = await page.$eval(".pt-portal", e => e.getBoundingClientRect().toJSON());
  assert.ok(box.width < 400, "the card doesn't grow");
});

test("phone (390 × 844): fits with no sideways scrolling; buttons are big enough to tap; no custom cursor", async () => {
  const page = await visit("?dt-test&dt-landing", { viewport: { width: 390, height: 844 }, touch: true }); await introDone(page);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.getElementById("portal").scrollWidth <= innerWidth));
  for (const b of await page.$$("#ptButtons button[data-pt], #ptNav button[data-pt]")) { const r = await b.boundingBox(); assert.ok(r.height >= 38 && r.x >= 0 && r.x + r.width <= 390, JSON.stringify(r)); }
  const title = await page.$eval("#ptTitle", e => e.getBoundingClientRect().toJSON());
  const card = await page.$eval(".pt-portal", e => e.getBoundingClientRect().toJSON());
  const lead = await page.$eval("#ptLead", e => e.getBoundingClientRect().toJSON());
  assert.ok(title.bottom <= card.top + 4 && card.bottom <= lead.top + 4, "headline, card and text don't overlap");
  assert.equal(await page.locator("#ptCursor").isVisible(), false);
});

test("who skips it: test pages without dt-landing, reset links, and people who are logged in", async () => {
  let page = await visit("?dt-test"); await page.waitForSelector(".auth-card");
  assert.ok(await page.locator("#portal").isHidden());
  page = await visit("?dt-test&dt-landing#reset=abcdefghijklmnopqrstuvwx"); await page.waitForSelector(".auth-card");
  assert.ok(await page.locator("#portal").isHidden());
  page = await visit(); await introDone(page);
  await page.click("#ptNav [data-pt=signup]");
  await page.fill("#au-name", "Landing"); await page.fill("#au-email", "landing@example.com"); await page.fill("#au-pass", "password123"); await page.click("#authGo");
  await page.waitForSelector("#onb-name, #app:not([hidden])");
  await page.reload(); await page.waitForSelector("#onb-name, #app:not([hidden])");
  assert.ok(await page.locator("#portal").isHidden(), "logged in: straight to the app");
});
