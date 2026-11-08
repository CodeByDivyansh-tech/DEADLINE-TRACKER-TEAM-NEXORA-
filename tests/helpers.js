// Shared test helpers: static server, browser, fixed clock, onboarding.
const http = require("http");
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..");
// Every test runs at this exact moment so dates are predictable: Friday 30 Oct 2026, 12:00 India time.
const FIXED_NOW = new Date("2026-10-30T12:00:00+05:30");

function startServer() {
  const srv = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split("?")[0]);
    if (p === "/") p = "/index.html";
    const f = path.join(ROOT, p);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end("Not found"); }
    res.writeHead(200, { "Content-Type": f.endsWith(".html") ? "text/html; charset=utf-8" : f.endsWith(".js") ? "text/javascript; charset=utf-8" : "application/octet-stream", "Cache-Control": "no-store" });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise(r => srv.listen(0, "127.0.0.1", () => r({ srv, url: `http://127.0.0.1:${srv.address().port}/` })));
}

async function setup() {
  const server = await startServer();
  const browser = await chromium.launch();
  return { server, browser, base: server.url, async close() { await browser.close(); server.srv.close(); } };
}

async function newPage(env, opts = {}) {
  const ctx = await env.browser.newContext({ viewport: opts.viewport || { width: 1366, height: 900 }, timezoneId: "Asia/Kolkata", locale: "en-IN" });
  if (opts.permissions) await ctx.grantPermissions(opts.permissions);
  const page = await ctx.newPage();
  if (opts.init) await page.addInitScript(opts.init);
  await page.clock.setFixedTime(opts.now || FIXED_NOW);
  page.errors = [];
  page.on("pageerror", e => page.errors.push("pageerror: " + e.message));
  page.on("console", m => { if (m.type() === "error" && !/Failed to load resource|fonts\.(googleapis|gstatic)/.test(m.text())) page.errors.push("console: " + m.text()); });
  await page.goto((opts.base || env.base) + "?dt-test");
  return page;
}

async function onboard(page, { mode = "student", demo = true, name = "Divyansh", groups = "" } = {}) {
  await page.fill("#onb-name", name);
  await page.click("[data-act=onbnext]");
  await page.click(`[data-act=onbmode][data-v=${mode}]`);
  await page.click("[data-act=onbnext]");
  if (groups) await page.fill("#onb-groups", groups);
  const box = page.locator("#onb-demo");
  if ((await box.isChecked()) !== demo) await box.click();
  await page.click("[data-act=onbdone]");
  await page.waitForSelector("#app:not([hidden])");
}

// Switch section, then wait for the section's short fade-in to finish (drags don't start on a moving element).
// The GSAP card reveal (src/motion.js) marks moving cards with data-rv until they have landed.
const settle = page => page.waitForFunction(() => { const v = document.getElementById("viewInner"); return !v || (v.getAnimations().every(a => a.playState !== "running") && !v.querySelector("[data-rv]")); }, null, { timeout: 8000 });
const go = async (page, route) => { await page.evaluate(r => { location.hash = r; }, route); await page.waitForTimeout(50); await settle(page); };
const state = page => page.evaluate(() => JSON.parse(JSON.stringify(window.__DT_TEST__.state)));
const ws = async page => { const s = await state(page); return s.workspaces.find(w => w.id === s.active); };
const itemByTitle = async (page, title) => (await ws(page)).items.find(i => i.title === title);

// Wait until an async check in the page is true. (page.waitForFunction treats a returned Promise as "true" at once,
// so it can't be used with fetch-based checks.)
async function pollPage(page, fn, arg, ms = 5000){
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await page.evaluate(fn, arg)) return true; await new Promise(r => setTimeout(r, 100)); }
  throw new Error(`pollPage: condition not met within ${ms} ms: ${String(fn).slice(0, 120)}`);
}

module.exports = { pollPage, setup, newPage, onboard, go, settle, state, ws, itemByTitle, FIXED_NOW };
