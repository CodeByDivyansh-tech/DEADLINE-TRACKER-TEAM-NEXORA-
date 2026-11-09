// Signature motion (GSAP): a panel keeps its full box while its visible edge travels (clip-path), and what is
// attached to that edge (page, handle, arrow, labels) moves with it. Used differently in each place:
// sidebar rail, Deadline AI window, the heads-up panel, section cards, and the log-in tabs.
// Also: the warm palette (no black-and-blue), reduced motion, phone layout.
const { test, before, after, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { setup, newPage, onboard, go } = require("./helpers");

let env, page;
before(async () => { env = await setup(); });
after(async () => { await env.close(); });
beforeEach(async () => { page = await newPage(env); });
afterEach(async () => { if (page) { assert.deepEqual(page.errors, [], "no errors in the browser"); await page.context().close(); page = null; } });

const insetRight = s => { const m = /inset\(\s*0(?:px)?\s+([\d.]+)px/.exec(s || ""); return m ? +m[1] : null; };
const rot = el => page.evaluate(sel => { const m = getComputedStyle(document.querySelector(sel)).transform; if (!m || m === "none") return 0; const v = m.match(/matrix\(([^)]+)\)/)[1].split(",").map(Number); return Math.round(Math.atan2(v[1], v[0]) * 180 / Math.PI); }, el);
const tx = sel => page.evaluate(s => { const m = getComputedStyle(document.querySelector(s)).transform; return m && m !== "none" ? +m.match(/matrix\(([^)]+)\)/)[1].split(",")[4] : 0; }, sel);
const idle = () => page.waitForFunction(() => !document.querySelector("[data-rv]") && !window.__DT_TEST__.motion.busy(), null, { timeout: 5000 });

test("GSAP is part of the page itself (no outside download) and drives the motion", async () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  const g = (html.match(/src="\/assets\/(gsap\.[0-9a-f]{10}\.js)"/) || [])[1];
  assert.ok(g, "GSAP is served from our own site by the build");
  assert.match(fs.readFileSync(path.join(__dirname, "..", "assets", g), "utf8"), /GSAP 3\.\d+\.\d+/);
  assert.doesNotMatch(html, /<script[^>]+src=["']https?:/i, "no script from another site");
  assert.ok(await page.evaluate(() => typeof window.gsap === "object" && window.__DT_TEST__.motion.on()));
});

test("sidebar rail: the box stays wide while its edge travels; page, handle and arrow move with it", async () => {
  await onboard(page); await idle();
  const side0 = await page.evaluate(() => { const s = document.getElementById("side").getBoundingClientRect(); return { w: s.width, main: document.querySelector("#app .main").getBoundingClientRect().left }; });
  assert.equal(await page.getAttribute("#railBtn", "aria-expanded"), "true");
  await page.click("#railBtn");
  await page.waitForTimeout(170);
  const mid = await page.evaluate(() => ({ clip: document.getElementById("side").style.clipPath, w: document.getElementById("side").getBoundingClientRect().width }));
  const r = insetRight(mid.clip);
  assert.ok(r > 4 && r < 168, "edge is part-way: " + mid.clip);
  assert.equal(Math.round(mid.w), Math.round(side0.w), "the sidebar keeps its full width while the edge moves");
  assert.ok(await tx("#app .main") > 4, "the page is still gliding left with the edge");
  assert.ok(await tx("#railBtn") > 4, "the handle follows the edge");
  const a = await rot("#railBtn svg"); assert.ok(Math.abs(a) > 5 && Math.abs(a) < 175, "arrow turning: " + a);
  await idle();
  const end = await page.evaluate(() => ({ rail: document.getElementById("app").classList.contains("rail"), clip: getComputedStyle(document.getElementById("side")).clipPath, w: document.getElementById("side").getBoundingClientRect().width, main: document.querySelector("#app .main").getBoundingClientRect().left, handle: document.getElementById("railBtn").getBoundingClientRect(), lbl: document.querySelector("#side .nav a .lbl").getBoundingClientRect().width, mainT: getComputedStyle(document.querySelector("#app .main")).transform }));
  assert.ok(end.rail); assert.equal(insetRight(end.clip), 172, end.clip);
  assert.equal(Math.round(end.w), 248);
  assert.equal(Math.round(end.main), 76, "page now starts at the rail");
  assert.ok(Math.abs(end.handle.left + end.handle.width / 2 - 76) <= 1, "handle sits on the edge");
  assert.equal(end.mainT, "none", "no leftover transform");
  assert.ok(end.lbl <= 1, "labels are hidden visually");
  assert.equal(Math.abs(await rot("#railBtn svg")), 180);
  assert.equal(await page.getAttribute("#railBtn", "aria-expanded"), "false");
  assert.match(await page.getAttribute("#railBtn", "aria-label"), /expand/i);
  // Still usable: names are there for screen readers and as tooltips, links still work.
  const cal = page.locator('#side a[data-route="calendar"]');
  assert.match(await cal.textContent(), /Calendar/); assert.equal(await cal.getAttribute("title"), "Calendar");
  await cal.click(); await page.waitForFunction(() => location.hash === "#calendar");
  // Remembered after a reload.
  await page.reload(); await page.waitForSelector("#app:not([hidden])");
  assert.ok(await page.evaluate(() => document.getElementById("app").classList.contains("rail")));
});

test("sidebar rail: opening again slides the labels back in one after another", async () => {
  await onboard(page); await idle();
  await page.click("#railBtn"); await idle();
  await page.click("#railBtn");
  await page.waitForTimeout(330);
  const ops = await page.$$eval("#side .nav a .lbl", xs => xs.map(x => +getComputedStyle(x).opacity));
  assert.ok(ops.length >= 4);
  assert.ok(ops[0] > ops[ops.length - 1] || ops[0] < 1, "staggered: " + ops.join(","));
  await idle();
  const fin = await page.evaluate(() => ({ ops: [...document.querySelectorAll("#side .lbl")].map(x => +getComputedStyle(x).opacity), clip: getComputedStyle(document.getElementById("side")).clipPath, main: document.querySelector("#app .main").getBoundingClientRect().left }));
  assert.ok(fin.ops.every(o => o === 1)); assert.equal(fin.clip, "none"); assert.equal(Math.round(fin.main), 248);
  assert.equal(Math.abs(await rot("#railBtn svg")), 0);
});

test("Deadline AI window opens as a circle growing out of its button and closes back into it", async () => {
  await onboard(page); await idle();
  const fab = await page.locator("#dwBtn").boundingBox();
  await page.click("#dwBtn");
  await page.waitForTimeout(90);
  const c = await page.evaluate(() => document.getElementById("dw").style.clipPath);
  const m = /circle\(([\d.]+)px at ([\d.]+)px ([\d.]+)px\)/.exec(c); assert.ok(m, "circular reveal: " + c);
  const box = await page.locator("#dw").boundingBox();
  assert.ok(Math.abs(box.x + +m[2] - (fab.x + fab.width / 2)) < 3 && Math.abs(box.y + +m[3] - (fab.y + fab.height / 2)) < 3, "centred on the button");
  await idle();
  assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById("dw")).clipPath), "none");
  assert.equal(await page.evaluate(() => +getComputedStyle(document.querySelector("#dw .dw-h h2")).opacity), 1);
  await page.click("[data-act=dwclose]");
  await page.waitForTimeout(120);
  assert.equal(await page.evaluate(() => document.getElementById("dw").hidden), false, "still closing");
  assert.match(await page.evaluate(() => document.getElementById("dw").style.clipPath), /circle/);
  assert.equal(await page.getAttribute("#dwBtn", "aria-expanded"), "false", "state changes at once");
  await page.waitForSelector("#dw[hidden]", { state: "attached" });
});

test("heads-up panel unfolds downward with its rows, the chevron turns, and it folds back without a jump", async () => {
  await onboard(page); await idle();
  await page.click("#headsToggle");
  await page.waitForTimeout(140);
  const mid = await page.evaluate(() => { const l = document.getElementById("headsList"); return { clip: l.style.clipPath, h: l.getBoundingClientRect().height, full: l.scrollHeight }; });
  assert.match(mid.clip, /inset/); assert.ok(mid.h < mid.full, "height grows");
  await idle();
  assert.equal(await rot("#headsToggle .chev"), 180);
  const card = page.locator(".heads-card");
  await page.click("#headsToggle");
  await page.waitForTimeout(120);
  assert.ok(await page.locator("#headsList").count() === 1, "still folding");
  await idle();
  assert.equal(await page.locator("#headsList").count(), 0);
  assert.equal(await page.getAttribute("#headsToggle", "aria-expanded"), "false");
  assert.ok((await card.boundingBox()).height < 80);
});

test("switching sections: cards rise and unfold from their top edge, then nothing is left clipped", async () => {
  await onboard(page); await idle();
  await page.evaluate(() => { location.hash = "deadlines"; });
  await page.waitForTimeout(120);
  const running = await page.evaluate(() => [...document.querySelectorAll("#viewInner > *")].map(x => x.style.clipPath).filter(Boolean));
  assert.ok(running.length >= 1 && running.every(c => /inset/.test(c)), JSON.stringify(running));
  await idle();
  const left = await page.evaluate(() => [...document.querySelectorAll("#viewInner *")].filter(x => x.style.clipPath || (x.style.transform && x.style.transform !== "none")).length);
  assert.equal(left, 0, "everything returns to normal");
});

test("reduced motion: everything changes instantly, no clipping or movement", async () => {
  await page.context().close();
  const ctx = await env.browser.newContext({ viewport: { width: 1366, height: 900 }, reducedMotion: "reduce", timezoneId: "Asia/Kolkata" });
  const p = await ctx.newPage(); p.errors = []; p.on("pageerror", e => p.errors.push(e.message)); page = p;
  await p.goto(env.base + "?dt-test"); await onboard(p);
  assert.equal(await p.evaluate(() => window.__DT_TEST__.motion.on()), false);
  await p.click("#railBtn");
  const s = await p.evaluate(() => ({ inline: document.getElementById("side").style.clipPath, main: document.querySelector("#app .main").getBoundingClientRect().left }));
  assert.equal(s.inline, ""); assert.equal(Math.round(s.main), 76);
  await p.click("#dwBtn"); assert.equal(await p.evaluate(() => document.getElementById("dw").style.clipPath), "");
  await p.click("[data-act=dwclose]"); assert.equal(await p.evaluate(() => document.getElementById("dw").hidden), true);
});

test("phone: no rail handle, no sideways scrolling, the AI window still opens", async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  await onboard(page); await idle();
  assert.equal(await page.locator("#railBtn").isVisible(), false);
  for (const r of ["overview", "deadlines", "calendar"]) { await go(page, r); await idle(); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= 390), r); }
  await page.click("#dwBtn"); await idle();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= 390));
});

test("log-in screen: the tab pill slides and the form is revealed from the side of the chosen tab", async () => {
  // Without the server the log-in screen isn't shown; render it directly with the app's own function.
  await page.evaluate(() => window.__DT_TEST__.showAuth());
  await idle();
  const pill = () => page.evaluate(() => document.querySelector(".auth-pill").getBoundingClientRect().left);
  const p0 = await pill();
  await page.click("[data-act=authmode][data-v=signup]");
  await page.waitForTimeout(140);
  const mid = await page.evaluate(() => document.getElementById("authForm").style.clipPath);
  assert.match(mid, /inset\(0(px|%)? 0(px|%)? 0(px|%)? [\d.]+/, "form edge travelling: " + mid);
  await idle();
  const sel = await page.locator("[data-act=authmode][data-v=signup]").boundingBox();
  assert.ok(Math.abs((await pill()) - sel.x) < 2 && (await pill()) > p0, "pill under the chosen tab");
  assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById("authForm")).clipPath), "none");
  assert.ok(await page.locator("#au-name").isVisible());
});

test("palette (Portale): white and near-black ink in light, neutral near-black in dark, a pale steel-blue accent; never navy or indigo", async () => {
  await onboard(page);
  const col = v => page.evaluate(v => { const c = document.createElement("canvas").getContext("2d"); c.fillStyle = getComputedStyle(document.documentElement).getPropertyValue(v).trim(); const h = c.fillStyle; const [r, g, b] = h.startsWith("#") ? [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255) : h.match(/[\d.]+/g).slice(0, 3).map(x => x / 255); const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; if (mx === mn) return { h: 0, s: 0, l }; const d = mx - mn; let hh = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return { h: (hh * 60 + 360) % 360, s: d / (1 - Math.abs(2 * l - 1)), l }; }, v);
  for (const t of ["light", "dark"]) {
    await page.evaluate(t => document.documentElement.setAttribute("data-theme", t), t);
    const bg = await col("--bg"), ink = await col("--ink"), acc = await col("--steel");
    assert.ok(bg.s < .1, `${t}: background is neutral (saturation ${bg.s.toFixed(2)})`);
    assert.ok(t === "light" ? bg.l > .97 && ink.l < .12 : bg.l < .09 && ink.l > .9, `${t}: white/ink or ink/white`);
    assert.ok(acc.h >= 195 && acc.h <= 220 && acc.s < .5, `${t}: steel accent (hue ${acc.h.toFixed(0)}, saturation ${acc.s.toFixed(2)})`);
  }
  // CLAUDE.md: never navy or indigo. Blues are allowed only as soft steel (hue 195–220, saturation under 0.5); no violet at all.
  const src = ["part1.html", "part2.js", "part3.js", "todo.js", "account.js", "widget.js", "portal.js"].map(f => fs.readFileSync(path.join(__dirname, "..", "src", f), "utf8")).join("");
  const bad = (src.match(/#[0-9a-f]{6}\b/gi) || []).filter(h => { const [r, g, b] = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255); const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, l = (mx + mn) / 2; if (d < .12) return false; const sat = d / (1 - Math.abs(2 * l - 1)); const hh = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; const deg = (hh * 60 + 360) % 360; return (deg > 220 && deg <= 290) || (deg >= 195 && deg <= 220 && sat >= .5); });
  assert.deepEqual([...new Set(bad)], [], "no navy, indigo or violet in the app's code");
});
