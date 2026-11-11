// The pieces a browser needs to install Deadline Tracker as an app: manifest, icons, service worker, offline page.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const { startServer } = require("./srv");
const { pollPage } = require("./helpers");

const ROOT = path.join(__dirname, "..");
let s, browser;
before(async () => { s = await startServer({}); browser = await chromium.launch(); });
after(async () => { await browser.close(); s.stop(); });
const pngSize = b => ({ ok: b.slice(0, 8).toString("hex") === "89504e470d0a1a0a", w: b.readUInt32BE(16), h: b.readUInt32BE(20) });

test("manifest: name, colours, standalone display, start page, and icons that exist at the stated sizes (192, 512, maskable)", async () => {
  const r = await fetch(s.base + "/manifest.webmanifest");
  assert.equal(r.status, 200); assert.match(r.headers.get("content-type"), /application\/manifest\+json/);
  const m = await r.json();
  assert.equal(m.name, "Deadline Tracker"); assert.ok(m.short_name && m.short_name.length <= 12);
  assert.equal(m.display, "standalone"); assert.equal(m.start_url, "/"); assert.equal(m.scope, "/"); assert.equal(m.id, "/");
  assert.match(m.theme_color, /^#[0-9a-f]{6}$/i); assert.match(m.background_color, /^#[0-9a-f]{6}$/i);
  const sizes = m.icons.map(i => `${i.sizes} ${i.purpose || "any"}`).sort();
  assert.deepEqual(sizes, ["192x192 any", "192x192 maskable", "512x512 any", "512x512 maskable"]);
  for (const i of m.icons) {
    const p = await fetch(s.base + i.src); assert.equal(p.status, 200, i.src); assert.equal(p.headers.get("content-type"), "image/png");
    const png = pngSize(Buffer.from(await p.arrayBuffer())); const n = +i.sizes.split("x")[0];
    assert.ok(png.ok, "a real PNG"); assert.equal(png.w, n); assert.equal(png.h, n);
  }
  for (const sc of m.shortcuts || []) assert.match(sc.url, /^\/#\w+$/);
});

test("the page links the manifest, a theme colour for each theme and an Apple touch icon", async () => {
  const h = await (await fetch(s.base + "/")).text();
  assert.match(h, /<link rel="manifest" href="\/manifest\.webmanifest">/);
  assert.match(h, /<meta name="theme-color" content="#ffffff" media="\(prefers-color-scheme: light\)">/);
  assert.match(h, /<meta name="theme-color" content="#0d0e0f" media="\(prefers-color-scheme: dark\)">/);
  assert.match(h, /<link rel="apple-touch-icon" href="\/icons\/apple-touch-icon\.png">/);
  const a = await fetch(s.base + "/icons/apple-touch-icon.png"); const png = pngSize(Buffer.from(await a.arrayBuffer()));
  assert.equal(png.w, 180); assert.equal(png.h, 180);
});

test("service worker and offline page are served (worker always re-checked); private files stay private", async () => {
  const w = await fetch(s.base + "/sw.js");
  assert.equal(w.status, 200); assert.match(w.headers.get("content-type"), /^text\/javascript/); assert.match(w.headers.get("cache-control"), /no-cache/);
  const src = await w.text();
  assert.match(src, /\/api\//, "the worker leaves /api alone"); assert.doesNotMatch(src, /AIza|xkeysib-|postgres(ql)?:\/\//);
  const o = await fetch(s.base + "/offline.html"); assert.equal(o.status, 200); assert.match(await o.text(), /offline/i);
  for (const u of ["/server.js", "/build.js", "/lib/db.js", "/package.json", "/sw.js.map", "/icons/../server.js"]) assert.equal((await fetch(s.base + u)).status, 404, u);
});

test("in a real browser: Chrome finds nothing missing for installing; the worker takes control, never stores /api answers, and shows the offline page without a connection", async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } }); const page = await ctx.newPage(); const errs = []; page.on("pageerror", e => errs.push(e.message));
  await page.goto(s.base + "/?dt-test&dt-sw"); await page.waitForSelector(".auth-card");
  await pollPage(page, async () => !!(await navigator.serviceWorker.getRegistration()) && !!(await navigator.serviceWorker.ready).active, null, 10000);
  const cdp = await ctx.newCDPSession(page);
  const inst = await cdp.send("Page.getInstallabilityErrors");
  assert.deepEqual((inst.installabilityErrors || []).map(e => e.errorId).filter(e => e !== "in-incognito"), [], "installable");
  await page.reload(); await page.waitForSelector(".auth-card");
  assert.ok(await page.evaluate(() => !!navigator.serviceWorker.controller), "the worker controls the page");
  // sign up and use the app through the worker: accounts and saving still work
  await page.click("[data-act=authmode][data-v=signup]"); await page.fill("#au-name", "Pwa"); await page.fill("#au-email", "pwa@example.com"); await page.fill("#au-pass", "password123"); await page.click("#authGo");
  await page.waitForSelector("#onb-name");
  assert.equal(await page.evaluate(async () => (await fetch("/api/me")).status), 200);
  const cached = await page.evaluate(async () => { const out = []; for (const k of await caches.keys()) for (const r of await (await caches.open(k)).keys()) out.push(new URL(r.url).pathname); return out; });
  assert.ok(cached.includes("/offline.html")); assert.ok(cached.some(p => /^\/assets\/app\.[0-9a-f]{10}\.js$/.test(p)), "app code kept for fast starts");
  assert.ok(!cached.some(p => p.startsWith("/api") || p === "/"), "no account data or pages stored: " + cached.join(", "));
  await ctx.setOffline(true);
  await page.goto(s.base + "/").catch(() => {});
  assert.match(await page.textContent("body"), /You're offline/);
  await ctx.setOffline(false);
  await page.click("a[href='/']"); await page.waitForSelector("#onb-name, #app:not([hidden])");
  assert.deepEqual(errs, []);
  await ctx.close();
});
