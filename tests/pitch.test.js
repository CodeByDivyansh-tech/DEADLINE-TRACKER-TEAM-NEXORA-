// NEXORA pitch (/pitch): three different 3D scenes, 3D type, every control, direct links and refresh,
// phone layout, reduced motion, no-WebGL fallback, glass and contrast, page budget, honest content.
const { test, before, after, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const { startServer, ROOT } = require("./srv");

let s, browser; const ctxs = [];
before(async () => { s = await startServer({}); browser = await chromium.launch(); });
after(async () => { await browser.close(); s.stop(); });
afterEach(async () => { while (ctxs.length) { const c = ctxs.pop(); const errs = c.__errors; await c.close(); assert.deepEqual(errs, [], "no errors or warnings in the browser"); } });

async function open(opts = {}){
  const ctx = await browser.newContext({ viewport: opts.viewport || { width: 1920, height: 1080 }, reducedMotion: opts.reducedMotion || "no-preference", hasTouch: !!opts.touch, isMobile: !!opts.mobile });
  ctx.__errors = []; ctxs.push(ctx);
  const page = await ctx.newPage();
  page.on("pageerror", e => ctx.__errors.push(e.message));
  page.on("console", m => { if ((m.type() === "error" || m.type() === "warning") && !/fonts\.(googleapis|gstatic)|net::ERR_(NAME|INTERNET|CONNECTION)|GPU stall|GL Driver Message|swiftshader/i.test(m.text())) ctx.__errors.push(m.type() + ": " + m.text()); });
  if (opts.init) await page.addInitScript(opts.init);
  // warm-up of the other 3D scenes is its own test; elsewhere it's switched off to keep this CPU-only test machine responsive
  const url = opts.path || "/pitch"; const [p0, hash] = url.split("#");
  // this test machine has no GPU (software WebGL), where the page shows still pictures; tests that check the live 3D force it on
  const q = [opts.warm ? "" : "warm=0", opts.gl ? "gl=force" : ""].filter(Boolean).join("&");
  await page.goto(s.base + p0 + (q ? (p0.includes("?") ? "&" : "?") + q : "") + (hash ? "#" + hash : ""));
  await page.waitForFunction(() => window.NEXORA && window.NEXORA.ready);
  return page;
}
const cur = page => page.evaluate(() => window.NEXORA.current());
const kicker = page => page.evaluate(() => document.querySelector(".slide.on .kicker").textContent);

test("pitch: /pitch, /pitch/ and /pitch.html open; three.js loads once from a cached file; page budget", async () => {
  for (const p of ["/pitch", "/pitch/", "/pitch.html"]) assert.equal((await fetch(s.base + p)).status, 200, p);
  const lib = await fetch(s.base + "/pitch-assets/three.min.js");
  assert.equal(lib.status, 200); assert.match(lib.headers.get("cache-control"), /max-age=\d+/);
  const html = fs.readFileSync(path.join(ROOT, "pitch.html"), "utf8");
  assert.ok(html.length < 140 * 1024, `pitch.html is ${Math.round(html.length / 1024)} KB`);
  assert.equal((html.match(/Three\.js Authors/g) || []).length, 0, "three.js not pasted inline");
  assert.doesNotMatch(html, /gsap|Cinzel|Instrument Serif|ff2e88/i, "nothing left of the earlier deck's libraries, fonts or colours");
  const page = await open();
  const reqs = await page.evaluate(() => performance.getEntriesByType("resource").map(r => ({ n: r.name.split("/").pop(), b: r.transferSize || r.encodedBodySize })));
  assert.equal(reqs.filter(r => r.n === "three.min.js").length, 1);
  assert.ok(reqs.filter(r => /\.(png|webp)$/.test(r.n)).every(r => r.n.endsWith(".webp")), "pictures are WebP");
  const total = reqs.reduce((a, r) => a + (r.b || 0), 0) + Buffer.byteLength(html);
  assert.ok(total < 2 * 1048576, `first load ${(total / 1048576).toFixed(2)} MB`);
});

test("pitch: three different 3D scenes: the visible one runs, the others are prepared quietly and paused", async () => {
  // Compare times: when the browser first painted text (first-contentful-paint) and when the first 3D scene appeared.
  // (Checking "right after opening" was a race that failed when the machine was busy, and didn't prove the order.)
  const page = await open({ warm: true, gl: true, init: () => {
    window.__t = {};
    try { new PerformanceObserver(l => { for (const e of l.getEntries()) if (e.name === "first-contentful-paint") window.__t.fcp = e.startTime; }).observe({ type: "paint", buffered: true }); } catch (e) {}
    const tick = () => { if (window.NEXORA && window.NEXORA.stages().length) { window.__t.stage = performance.now(); return; } requestAnimationFrame(tick); }; requestAnimationFrame(tick);
  } });
  const hosts = await page.$$eval("[data-3d]", hs => hs.map(h => h.dataset["3d"]));
  assert.deepEqual(hosts, ["orbit", "radar", "week", "orbit2"]);
  await page.waitForFunction(() => window.__t.fcp != null && window.__t.stage != null, null, { timeout: 15000 });
  const t = await page.evaluate(() => window.__t);
  assert.ok(t.stage > t.fcp, `the 3D waits until the text has painted (text ${t.fcp.toFixed(0)} ms, 3D ${t.stage.toFixed(0)} ms)`);
  await page.waitForFunction(() => window.NEXORA.stages().length > 0);
  let st = await page.evaluate(() => window.NEXORA.stages());
  assert.deepEqual(st.map(x => x.id), ["orbit"], "then only the first slide's scene is built");
  await page.waitForFunction(() => window.NEXORA.warm, null, { timeout: 45000 });
  st = await page.evaluate(() => window.NEXORA.stages());
  assert.deepEqual(st.map(x => x.id).sort(), ["orbit", "orbit2", "radar", "week"], "the others are prepared in idle time");
  assert.deepEqual(st.filter(x => x.running).map(x => x.id), ["orbit"], "but only the visible one runs");
  await page.waitForTimeout(400);
  assert.ok((await page.evaluate(() => window.NEXORA.stages()))[0].frames > 3, "it animates");
  await page.evaluate(() => window.NEXORA.go(2)); await page.waitForTimeout(400);
  await page.evaluate(() => window.NEXORA.go(4)); await page.waitForTimeout(400);
  st = await page.evaluate(() => window.NEXORA.stages());
  const by = Object.fromEntries(st.map(x => [x.id, x]));
  assert.ok(by.radar && by.week, "radar and week scenes built");
  assert.equal(by.orbit.running, false); assert.equal(by.radar.running, false); assert.equal(by.week.running, true, "only the visible scene runs");
  const shapes = new Set(st.filter(x => x.id !== "orbit2").map(x => x.objects + ":" + x.triangles));
  assert.equal(shapes.size, 3, "three different scenes, not one repeated: " + [...shapes]);
  assert.ok(by.orbit2 && by.orbit2.triangles !== by.orbit.triangles, "the closing ring is the finished version (with the check)");
  // the week labels follow the columns
  assert.deepEqual(await page.$$eval(".slide.on .stage3d .tag", t => t.map(e => e.textContent)), ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
});

test("pitch: 3D title has depth layers but reads as one word; headings flip in word by word", async () => {
  const page = await open();
  const t = await page.evaluate(() => { const h = document.querySelector(".title3d"); return { label: h.getAttribute("aria-label"), letters: h.querySelectorAll(".ch").length, layers: h.querySelectorAll(".ch:first-child .layer").length, hidden: h.querySelector(".rig").getAttribute("aria-hidden"), face: getComputedStyle(h).fontFamily }; });
  assert.equal(t.label, "NEXORA"); assert.equal(t.letters, 6); assert.ok(t.layers >= 8, "extrusion layers"); assert.equal(t.hidden, "true");
  assert.match(t.face, /Bricolage Grotesque/);
  await page.keyboard.press("ArrowRight");
  const w = await page.evaluate(() => { const h = document.querySelector(".slide.on h2"); return { words: h.querySelectorAll(".w3d").length, text: h.textContent.replace(/\s+/g, " ").trim(), anim: getComputedStyle(h.querySelector(".w3d")).animationName }; });
  assert.ok(w.words >= 8); assert.equal(w.text, "Every student has goals. But managing everything isn't easy."); assert.equal(w.anim, "wordUp");
});

test("pitch: next, previous, keys, chapter rail, chapter menu, logo and Begin move between the 8 slides", async () => {
  const page = await open();
  assert.equal(await page.locator(".slide").count(), 8);
  await page.click("#beginBtn"); assert.equal(await cur(page), 1);
  await page.click(".nav [data-nav=next]"); assert.equal(await cur(page), 2);
  await page.click(".nav [data-nav=prev]"); assert.equal(await cur(page), 1);
  await page.keyboard.press("ArrowRight"); assert.equal(await cur(page), 2);
  await page.keyboard.press("Space"); assert.equal(await cur(page), 3);
  await page.keyboard.press("ArrowLeft"); assert.equal(await cur(page), 2);
  await page.keyboard.press("End"); assert.equal(await cur(page), 7);
  await page.keyboard.press("Home"); assert.equal(await cur(page), 0);
  const rail = page.locator("#rail button");
  assert.equal(await rail.count(), 8);
  await rail.nth(5).click(); assert.equal(await cur(page), 5);
  assert.equal(await rail.nth(5).getAttribute("aria-current"), "step");
  assert.match(await page.textContent("#chapterBtn"), /06 \/ 08/);
  await page.click("#chapterBtn"); assert.ok(await page.isVisible("#chapterMenu"));
  assert.equal(await page.getAttribute("#chapterBtn", "aria-expanded"), "true");
  await page.click("#chapterMenu button >> nth=6"); assert.equal(await cur(page), 6);
  assert.equal(await page.isVisible("#chapterMenu"), false);
  await page.click(".brand"); assert.equal(await cur(page), 0);
  await rail.nth(3).focus(); await page.keyboard.press("Enter"); assert.equal(await cur(page), 3);
  assert.ok(await page.evaluate(() => [...document.querySelectorAll(".slide:not(.on)")].every(s => s.inert)), "hidden slides can't be tabbed into");
  await page.keyboard.press("End"); await page.click(".nav [data-nav=next]"); assert.equal(await cur(page), 7, "stays on the last slide");
});

test("pitch: refresh keeps the slide and #slide-N links open it", async () => {
  const page = await open({});
  for (let k = 0; k < 3; k++) await page.keyboard.press("ArrowRight");
  assert.match(page.url(), /#slide-4$/);
  await page.reload(); await page.waitForFunction(() => window.NEXORA && window.NEXORA.ready);
  assert.equal(await cur(page), 3);
  const p2 = await open({ path: "/pitch#slide-7" });
  assert.equal(await cur(p2), 6); assert.match(await kicker(p2), /Behind NEXORA/i);
});

test("pitch: product tabs and keys 1-7 change the picture, title and points; every picture loads", async () => {
  const page = await open({ path: "/pitch#slide-4" });
  const tabs = page.locator("#showcaseNav button");
  assert.equal(await tabs.count(), 7);
  const seen = new Set();
  for (let i = 0; i < 7; i++) {
    await tabs.nth(i).click(); await page.waitForTimeout(260);
    const st = await page.evaluate(() => { const im = document.getElementById("showcaseImg"); return { src: im.getAttribute("src"), ok: im.complete && im.naturalWidth > 0, title: document.querySelector("#showcaseTitle b").textContent, sel: document.querySelector("#showcaseNav [aria-selected=true]").textContent, points: document.querySelectorAll("#showcaseBullets .point").length }; });
    assert.ok(st.ok, "picture loaded: " + st.src); seen.add(st.src); assert.ok(st.sel.includes(st.title)); assert.equal(st.points, 3);
  }
  assert.equal(seen.size, 7);
  await page.keyboard.press("3"); await page.waitForTimeout(260);
  assert.match(await page.textContent("#showcaseTitle"), /Calendar/);
});

test("pitch: notes, Q&A, timer and full screen do what they say; app links are safe", async () => {
  const page = await open({ init: () => { window.__fs = 0; Element.prototype.requestFullscreen = function(){ window.__fs++; return Promise.resolve(); }; } });
  await page.click("#notesBtn");
  assert.ok(await page.isVisible("#notes.open")); assert.equal(await page.getAttribute("#notesBtn", "aria-pressed"), "true");
  await page.keyboard.press("ArrowRight"); assert.match(await page.textContent("#notesTitle"), /Slide 02/);
  assert.match(await page.textContent("#notesBody"), /Divyansh/);
  await page.keyboard.press("n"); assert.equal(await page.isVisible("#notes.open"), false);
  await page.keyboard.press("End"); await page.waitForTimeout(200);
  await page.click("text=Judges' Q&A"); assert.ok(await page.isVisible("#qa.open"));
  assert.equal(await page.locator("#qaList dt").count(), 5);
  await page.keyboard.press("Escape"); assert.equal(await page.isVisible("#qa.open"), false);
  await page.keyboard.press("q"); assert.ok(await page.isVisible("#qa.open")); await page.click("#qa .x"); assert.equal(await page.isVisible("#qa.open"), false);
  const total = await page.evaluate(() => window.NEXORA.scriptSeconds);
  assert.equal(total, 205, "matches the speaker script (ends at 3:25)");
  assert.equal(await page.textContent("#timerDisplay"), "03:25");
  await page.clock.install();
  await page.click("#timerBtn"); await page.clock.runFor(3000);
  const t1 = await page.textContent("#timerDisplay"); assert.equal(t1, "03:22");
  await page.click("#timerBtn"); await page.clock.runFor(3000); assert.equal(await page.textContent("#timerDisplay"), t1, "paused");
  await page.click("#timerReset"); assert.equal(await page.textContent("#timerDisplay"), "03:25");
  await page.click("#fullscreenBtn"); await page.keyboard.press("f"); assert.equal(await page.evaluate(() => window.__fs), 2);
  for (const a of await page.$$("a[target=_blank]")) { assert.equal(await a.getAttribute("href"), "/"); assert.match(await a.getAttribute("rel"), /noopener/); }
});

test("pitch: phone: controls reachable, every slide starts at its heading, comparison readable, no sideways scroll", async () => {
  const page = await open({ viewport: { width: 390, height: 844 }, touch: true, mobile: true });
  for (const id of ["#timerBtn", "#notesBtn", "#launchApp", ".nav [data-nav=next]", "#chapterBtn"]) {
    const v = await page.$eval(id, e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.left >= 0 && r.right <= innerWidth ? "ok" : `off ${Math.round(r.left)}-${Math.round(r.right)}`; });
    assert.equal(v, "ok", id);
    assert.ok((await page.$eval(id, e => e.getBoundingClientRect().height)) >= 36, id + " tall enough to tap");
  }
  for (let i = 0; i < 8; i++) {
    const r = await page.evaluate(() => { const sc = document.querySelector(".slide.on"); const k = sc.querySelector(".kicker"); return { top: sc.scrollTop, k: Math.round(k.getBoundingClientRect().top), head: Math.round(document.querySelector(".top").getBoundingClientRect().bottom), sw: document.documentElement.scrollWidth }; });
    assert.equal(r.top, 0, `slide ${i + 1} starts at the top`);
    assert.ok(r.k >= r.head, `slide ${i + 1}: label below the top bar`);
    assert.ok(r.sw <= 391, `slide ${i + 1}: no sideways scroll`);
    if (i === 5) assert.equal(await page.$$eval(".compare td.us", cs => cs.filter(c => { const q = c.getBoundingClientRect(); return q.width > 0 && q.right <= innerWidth; }).length), 5, "our answers visible");
    await page.evaluate(i => window.NEXORA.go(i), i + 1); await page.waitForTimeout(60);   // clicking is covered above; here only the layout matters
  }
});

test("pitch: phone: swipes change slides, but not inside the table, the tabs or a 3D scene", async () => {
  const page = await open({ viewport: { width: 390, height: 844 }, touch: true, mobile: true, path: "/pitch#slide-2" });
  const swipe = (sel, dx, dy = 0) => page.evaluate(([sel, dx, dy]) => { const el = document.querySelector(sel); const t = (x, y) => new Touch({ identifier: 1, target: el, screenX: x, screenY: y, clientX: x, clientY: y });
    el.dispatchEvent(new TouchEvent("touchstart", { bubbles: true, touches: [t(300, 400)], changedTouches: [t(300, 400)] }));
    el.dispatchEvent(new TouchEvent("touchend", { bubbles: true, touches: [], changedTouches: [t(300 + dx, 400 + dy)] })); }, [sel, dx, dy]);
  await swipe(".slide.on", -120); assert.equal(await cur(page), 2);
  await swipe(".slide.on", 120); assert.equal(await cur(page), 1);
  await swipe(".slide.on", -80, -160); assert.equal(await cur(page), 1, "vertical scroll isn't a swipe");
  await page.evaluate(() => window.NEXORA.go(5)); await swipe(".compare", -120); assert.equal(await cur(page), 5);
  await page.evaluate(() => window.NEXORA.go(3)); await swipe(".tabs", -120); assert.equal(await cur(page), 3);
});

test("pitch: reduced motion: 3D scenes draw one still frame, nothing loops, slides change instantly", async () => {
  const page = await open({ reducedMotion: "reduce", gl: true });
  await page.waitForTimeout(300);
  const st = await page.evaluate(() => ({ anim: window.NEXORA.animating(), frames: window.NEXORA.stages()[0].frames, dur: getComputedStyle(document.querySelector(".slide")).transitionDuration }));
  assert.equal(st.anim, false); assert.ok(st.frames >= 1 && st.frames <= 3, "a still frame: " + st.frames); assert.match(st.dur, /^0s/);
  await page.keyboard.press("ArrowRight"); assert.equal(await cur(page), 1);
});

test("pitch: on a computer without graphics acceleration the page shows still pictures instead of freezing", async () => {
  const page = await open();   // this machine renders WebGL in software
  assert.equal(await page.evaluate(() => document.documentElement.dataset.gl), "software");
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains("no-webgl")), true);
  assert.equal(await page.evaluate(() => window.NEXORA.stages().length), 0, "no 3D scene built");
  const still = await page.evaluate(() => { const e = document.querySelector(".slide.on .still"); const cs = getComputedStyle(e); return { d: cs.display, img: cs.backgroundImage }; });
  assert.equal(still.d, "block"); assert.match(still.img, /pitch-assets\/3d\/orbit\.webp/, "a real picture of the scene");
  const ok = await page.evaluate(() => Promise.all(["orbit", "orbit2", "radar", "week"].map(k => new Promise(r => { const i = new Image(); i.onload = () => r(i.naturalWidth > 100); i.onerror = () => r(false); i.src = "pitch-assets/3d/" + k + ".webp"; }))));
  assert.deepEqual(ok, [true, true, true, true]);
  await page.keyboard.press("ArrowRight"); assert.equal(await cur(page), 1);
});

test("pitch: without WebGL the slides, controls and still pictures still work", async () => {
  const page = await open({ init: () => { const g = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function(t, o){ return /webgl/i.test(t) ? null : g.call(this, t, o); }; } });
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains("no-webgl")), true);
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector(".slide.on .still")).display), "block");
  assert.equal(await page.locator("#rail button").count(), 8);
  await page.keyboard.press("ArrowRight"); await page.keyboard.press("ArrowRight"); assert.equal(await cur(page), 2);
});

test("pitch: glass panels blur what's behind, have a fallback, and keep text readable", async () => {
  const page = await open({ path: "/pitch#slide-2" });
  const g = await page.evaluate(() => { const cs = getComputedStyle(document.querySelector(".card")); return cs.backdropFilter || cs.webkitBackdropFilter; });
  assert.match(g, /blur\((1[0-6])px\)/);
  const css = fs.readFileSync(path.join(ROOT, "pitch.html"), "utf8");
  assert.match(css, /@supports not \(\(backdrop-filter:blur\(1px\)\) or \(-webkit-backdrop-filter:blur\(1px\)\)\)/);
  // text colours vs the darkest-to-lightest glass over the ink background
  const r = await page.evaluate(() => {
    const parse = c => c.match(/[\d.]+/g).map(Number); const lum = ([r, g, b]) => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }; return .2126 * f(r) + .7152 * f(g) + .0722 * f(b); };
    const glassTop = [255 * .085 + 19 * .915, 255 * .085 + 26 * .915, 255 * .085 + 51 * .915];   // lightest part of a panel over ink-2
    return [...document.querySelectorAll(".slide.on .card p, .slide.on .card h3, .slide.on .flaw p, .slide.on .stat span, .slide.on .card .n")].map(el => { const fg = parse(getComputedStyle(el).color); const L1 = lum(fg), L2 = lum(glassTop); return { t: el.textContent.slice(0, 24), r: (Math.max(L1, L2) + .05) / (Math.min(L1, L2) + .05) }; });
  });
  for (const x of r) assert.ok(x.r >= 4.5, `contrast ${x.r.toFixed(2)} for "${x.t}"`);
});

test("pitch: content is honest: four team members, real test count, nothing that doesn't exist", async () => {
  const html = fs.readFileSync(path.join(ROOT, "pitch.html"), "utf8");
  for (const n of ["Divyansh", "Ishant", "Noni Gopal", "Aashi"]) assert.ok(html.split(n).length - 1 >= 3, n + " on the title slide, team slide and notes");
  const real = fs.readdirSync(path.join(ROOT, "tests")).filter(f => f.endsWith(".test.js")).map(f => fs.readFileSync(path.join(ROOT, "tests", f), "utf8").match(/\btest\(\s*[`"']/g) || []).flat().length;
  const claims = [...html.matchAll(/(\d{3})\+? (?:automated|passing|tests)/g), ...html.matchAll(/More than (\d{3}) automated/g)].map(m => Number(m[1]));
  assert.ok(claims.length >= 2 && claims.every(c => c <= real), `claims ${claims} vs ${real} tests`);
  assert.doesNotMatch(html, /\b269\b|5 core problems|confidence progress rings/);
  assert.match(html, /server sleeps after 15 minutes/, "the reminder answer mentions the free-hosting limit");
});
