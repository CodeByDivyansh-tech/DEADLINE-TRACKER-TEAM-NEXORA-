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

const pngInfo = b => Object.assign(pngSize(b), { colorType: b[25] });   // colour type 2 = RGB without transparency
const icoSizes = b => { assert.equal(b.readUInt16LE(0), 0); assert.equal(b.readUInt16LE(2), 1, "an .ico file"); const n = b.readUInt16LE(4); return Array.from({ length: n }, (_, i) => b[6 + i * 16] || 256).sort((x, y) => x - y); };
const V = "?v=2";   // version on icon links, so browsers and the server's one-day icon cache pick up the new icon

test("manifest: name, colours, standalone display, start page, and the glass icon at every stated size (any + maskable)", async () => {
  const r = await fetch(s.base + "/manifest.webmanifest");
  assert.equal(r.status, 200); assert.match(r.headers.get("content-type"), /application\/manifest\+json/);
  const m = await r.json();
  assert.equal(m.name, "Deadline Tracker"); assert.ok(m.short_name && m.short_name.length <= 12);
  assert.equal(m.display, "standalone"); assert.equal(m.start_url, "/"); assert.equal(m.scope, "/"); assert.equal(m.id, "/");
  assert.match(m.theme_color, /^#[0-9a-f]{6}$/i); assert.match(m.background_color, /^#[0-9a-f]{6}$/i);
  assert.equal(m.theme_color, "#ffffff", "title bar matches the app's white top");
  assert.notEqual(m.background_color, "#ffffff", "splash screen uses the icon's dark background");
  const sizes = m.icons.map(i => `${i.sizes} ${i.purpose || "any"}`).sort();
  assert.deepEqual(sizes, ["144x144 any", "192x192 any", "192x192 maskable", "256x256 any", "512x512 any", "512x512 maskable", "96x96 any"]);
  assert.deepEqual(m.icons.filter(i => i.purpose === "maskable").map(i => i.src).sort(), ["/icons/icon-192-maskable.png" + V, "/icons/icon-512-maskable.png" + V]);
  for (const i of m.icons) {
    assert.ok(i.src.endsWith(V), "versioned: " + i.src);
    const p = await fetch(s.base + i.src); assert.equal(p.status, 200, i.src); assert.equal(p.headers.get("content-type"), "image/png");
    const png = pngInfo(Buffer.from(await p.arrayBuffer())); const n = +i.sizes.split("x")[0];
    assert.ok(png.ok, "a real PNG"); assert.equal(png.w, n); assert.equal(png.h, n);
    assert.equal(png.colorType, 2, i.src + " is opaque (no see-through corners)");
  }
  for (const sc of m.shortcuts || []) { assert.match(sc.url, /^\/#\w+$/); for (const ic of sc.icons) { assert.ok(ic.src.endsWith(V)); assert.equal((await fetch(s.base + ic.src)).status, 200); } }
  // the old icon files are gone, so nothing can still point at them
  for (const f of ["maskable-192.png", "maskable-512.png"]) assert.ok(!fs.existsSync(path.join(ROOT, "icons", f)), f);
});

test("the page links the manifest, a theme colour for each theme, the tab icons (.ico + 16/32 PNG) and an Apple touch icon", async () => {
  const h = await (await fetch(s.base + "/")).text();
  assert.match(h, /<link rel="manifest" href="\/manifest\.webmanifest">/);
  assert.match(h, /<meta name="theme-color" content="#ffffff" media="\(prefers-color-scheme: light\)">/);
  assert.match(h, /<meta name="theme-color" content="#0d0e0f" media="\(prefers-color-scheme: dark\)">/);
  assert.match(h, /<link rel="icon" href="\/favicon\.ico\?v=2" sizes="48x48">/);
  assert.match(h, /<link rel="icon" type="image\/png" sizes="32x32" href="\/icons\/favicon-32x32\.png\?v=2">/);
  assert.match(h, /<link rel="icon" type="image\/png" sizes="16x16" href="\/icons\/favicon-16x16\.png\?v=2">/);
  assert.match(h, /<link rel="apple-touch-icon" sizes="180x180" href="\/icons\/apple-touch-icon\.png\?v=2">/);
  assert.doesNotMatch(h, /rel="icon" type="image\/svg\+xml"/, "the old drawn tab icon is gone");
  const a = await fetch(s.base + "/icons/apple-touch-icon.png" + V); const png = pngInfo(Buffer.from(await a.arrayBuffer()));
  assert.equal(png.w, 180); assert.equal(png.h, 180); assert.equal(png.colorType, 2, "Apple icons must be opaque");
  for (const n of [16, 32]) { const f = pngInfo(Buffer.from(await (await fetch(s.base + `/icons/favicon-${n}x${n}.png` + V)).arrayBuffer())); assert.equal(f.w, n); assert.equal(f.h, n); }
  const ico = await fetch(s.base + "/favicon.ico" + V);
  assert.equal(ico.status, 200); assert.equal(ico.headers.get("content-type"), "image/x-icon");
  assert.match(ico.headers.get("cache-control"), /max-age=86400/, "kept for a day, like the other icons");
  assert.deepEqual(icoSizes(Buffer.from(await ico.arrayBuffer())), [16, 32, 48]);
  // admin page and the offline page use the same icon
  const adm = await (await fetch(s.base + "/admin")).text();
  assert.match(adm, /<link rel="icon" href="\/favicon\.ico\?v=2"/); assert.match(adm, /<img class="dt-logo" src="\/icons\/icon-96\.png\?v=2"/);
  assert.match(await (await fetch(s.base + "/offline.html")).text(), /src="\/icons\/icon-192\.png\?v=2"/);
});

test("the master icon (1024 x 1024, opaque) is kept in brand/ as the source, with the script that makes every size", () => {
  const b = fs.readFileSync(path.join(ROOT, "brand", "deadline-tracker-master.png")); const png = pngInfo(b);
  assert.ok(png.ok); assert.equal(png.w, 1024); assert.equal(png.h, 1024); assert.equal(png.colorType, 2);
  for (const f of ["icon-scene.html", "render-icon.js", "make-icons.py"]) assert.ok(fs.existsSync(path.join(ROOT, "brand", f)), f);
  assert.ok(!fs.existsSync(path.join(ROOT, "tests", "load", "make-icons.js")), "the old icon drawer is removed");
});

test("maskable icon: the cube, the check and the light trail stay inside the 80% safe circle, so Android's round or squircle crop never cuts them", async () => {
  const page = await browser.newPage();
  for (const [file, inner] of [["icon-512-maskable.png", 0.40], ["icon-192-maskable.png", 0.40]]) {
    await page.goto(s.base + "/icons/" + file + V);
    const r = await page.evaluate(async () => {
      const img = document.querySelector("img"); await img.decode(); const n = img.naturalWidth;
      const c = document.createElement("canvas"); c.width = c.height = n; const g = c.getContext("2d"); g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, n, n).data; let bright = 0, check = 0, corner = 0;
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const i = (y * n + x) * 4, lum = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255, rad = Math.hypot(x - n / 2 + .5, y - n / 2 + .5) / n;
        if (lum > 0.5) bright = Math.max(bright, rad);          // glass highlights, the check, the trail
        if (lum > 0.9) check = Math.max(check, rad);            // the glowing check itself
        if (d[i + 3] !== 255) corner++;
      }
      return { bright, check, corner };
    });
    assert.ok(r.bright < inner, `${file}: bright parts reach ${r.bright.toFixed(3)} of the width from the centre (safe: under ${inner})`);
    assert.ok(r.check < 0.3, `${file}: the check sits well inside (${r.check.toFixed(3)})`);
    assert.equal(r.corner, 0, file + ": fully opaque to the edges (the device cuts the shape)");
  }
  await page.close();
});

test("service worker and offline page are served (worker always re-checked); private files stay private", async () => {
  const w = await fetch(s.base + "/sw.js");
  assert.equal(w.status, 200); assert.match(w.headers.get("content-type"), /^text\/javascript/); assert.match(w.headers.get("cache-control"), /no-cache/);
  const src = await w.text();
  assert.match(src, /const CACHE = "dt-app-v2"/, "new cache name, so installed apps drop the old icon");
  assert.match(src, /\/api\//, "the worker leaves /api alone"); assert.doesNotMatch(src, /AIza|xkeysib-|postgres(ql)?:\/\//);
  const o = await fetch(s.base + "/offline.html"); assert.equal(o.status, 200); assert.match(await o.text(), /offline/i);
  for (const u of ["/server.js", "/build.js", "/lib/db.js", "/package.json", "/sw.js.map", "/icons/../server.js", "/brand/icon-scene.html", "/brand/deadline-tracker-master.png", "/brand/make-icons.py"]) assert.equal((await fetch(s.base + u)).status, 404, u);
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
