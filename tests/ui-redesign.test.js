// Redesign requirements: theme toggle, glass panels, less on screen, fewer options, every control works.
const { test, before, after, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { setup, newPage, onboard, go, settle } = require("./helpers");

let env, page;
before(async () => { env = await setup(); });
after(async () => { await env.close(); });
beforeEach(async () => { page = await newPage(env); });
afterEach(async () => { assert.deepEqual(page.errors, [], "no errors in the browser"); await page.context().close(); });

const theme = () => page.evaluate(() => document.documentElement.getAttribute("data-theme"));
// WCAG contrast between two CSS colours, read from the live page.
const contrast = (fg, bg) => page.evaluate(([fg, bg]) => {
  const c = document.createElement("canvas").getContext("2d");
  const rgb = v => { c.fillStyle = "#000"; c.fillStyle = v; const h = c.fillStyle; if (h.startsWith("#")) return [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)); return h.match(/[\d.]+/g).slice(0, 3).map(Number); };
  const L = v => { const [r, g, b] = rgb(v).map(x => { x /= 255; return x <= .03928 ? x / 12.92 : Math.pow((x + .055) / 1.055, 2.4); }); return .2126 * r + .7152 * g + .0722 * b; };
  const s = getComputedStyle(document.documentElement);
  const a = L(s.getPropertyValue(fg).trim()), b = L(s.getPropertyValue(bg).trim());
  return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
}, [fg, bg]);

/* ---------- Light and dark mode ---------- */
test("a clearly labelled theme toggle is in the top bar and switches light and dark", async () => {
  await onboard(page);
  const btn = page.locator("#themeBtn");
  assert.equal(await btn.isVisible(), true);
  const t0 = await theme();
  assert.ok(["light", "dark"].includes(t0), `theme set: ${t0}`);
  assert.match(await btn.getAttribute("aria-label"), /switch to (dark|light) mode/i);
  await btn.click();
  const t1 = await theme();
  assert.notEqual(t1, t0);
  assert.match(await btn.getAttribute("aria-label"), new RegExp(`switch to ${t0} mode`, "i"));
  await btn.click();
  assert.equal(await theme(), t0);
});

test("the chosen theme is remembered after a reload", async () => {
  await onboard(page);
  if ((await theme()) !== "dark") await page.click("#themeBtn");
  assert.equal(await theme(), "dark");
  await page.reload();
  await page.waitForSelector("#app:not([hidden])");
  assert.equal(await theme(), "dark");
});

test("both themes are properly redesigned, not just a background swap", async () => {
  await onboard(page);
  const look = () => page.evaluate(() => { const s = getComputedStyle(document.documentElement); const side = getComputedStyle(document.getElementById("side")); const card = getComputedStyle(document.querySelector(".card,.stat")); return { ink: s.getPropertyValue("--ink").trim(), glass: s.getPropertyValue("--glass").trim(), side: side.backgroundColor, card: card.backgroundColor, accent: s.getPropertyValue("--accent").trim() }; });
  if ((await theme()) !== "light") await page.click("#themeBtn");
  const L = await look();
  await page.click("#themeBtn");
  const D = await look();
  for (const k of ["ink", "glass", "side", "card", "accent"]) assert.notEqual(L[k], D[k], `${k} differs between themes`);
});

test("text stays readable in both themes", async () => {
  await onboard(page);
  for (let k = 0; k < 2; k++) {
    const t = await theme();
    assert.ok(await contrast("--ink", "--bg") >= 7, `${t}: main text`);
    assert.ok(await contrast("--muted", "--bg") >= 4.5, `${t}: secondary text`);
    assert.ok(await contrast("--side-ink", "--bg") >= 4.5, `${t}: sidebar text`);
    assert.ok(await contrast("--accent-ink", "--accent") >= 4.5, `${t}: text on primary buttons`);
    await page.click("#themeBtn");
  }
});

test("type: Geist for headings and text, Geist Mono for numbers; main buttons are ink pills", async () => {
  await onboard(page);
  const f = await page.evaluate(() => ({ body: getComputedStyle(document.body).fontFamily, h: getComputedStyle(document.querySelector("h1, h2")).fontFamily, mono: getComputedStyle(document.documentElement).getPropertyValue("--font-mono") }));
  assert.match(f.body, /^"?Geist"?,/); assert.match(f.h, /^"?Geist"?,/); assert.match(f.mono, /Geist Mono/);
  assert.match(await page.evaluate(() => [...document.querySelectorAll('link[href*="fonts.googleapis.com"]')].map(l => l.href).join(" ")), /family=Geist:wght@300;400;500;600.*family=Geist\+Mono/);
  const b = await page.$eval(".btn.primary", el => { const c = getComputedStyle(el); return { r: parseFloat(c.borderTopLeftRadius), h: el.getBoundingClientRect().height }; });
  assert.ok(b.r >= b.h / 2 - 1, "pill-shaped");
});

test("panels are glass: translucent with a background blur", async () => {
  await onboard(page);
  for (const sel of [".card", ".hero", ".topbar", "#side"]) {
    const s = await page.$eval(sel, el => { const c = getComputedStyle(el); return { blur: c.backdropFilter || c.webkitBackdropFilter, bg: c.backgroundColor }; });
    assert.match(s.blur, /blur/, `${sel} blurs the background`);
    const alpha = (s.bg.match(/rgba?\(([^)]+)\)/)[1].split(",")[3] || "1").trim();
    assert.ok(parseFloat(alpha) < 1, `${sel} is translucent (${s.bg})`);
  }
});

/* ---------- Less on screen ---------- */
test("student overview shows only the essentials", async () => {
  await onboard(page);
  for (const sel of [".stat", ".timeline", ".load-bars", ".exam-strip"]) assert.equal(await page.locator(`#viewInner ${sel}`).count(), 0, sel);
  const cards = await page.locator(".view-inner > section, .view-inner > div").count();
  assert.ok(cards <= 4, `top-level blocks: ${cards}`);
});

test("heads-up warnings are folded into one line until opened", async () => {
  await onboard(page);
  const sum = page.locator("#headsToggle");
  assert.match(await sum.textContent(), /\d+ things? need/i);
  assert.equal(await page.locator(".heads .head").count(), 0);
  await sum.click();
  assert.ok(await page.locator(".heads .head").count() >= 1);
  assert.equal(await sum.getAttribute("aria-expanded"), "true");
});

test("company overview is focused too", async () => {
  await onboard(page, { mode: "company" });
  assert.equal(await page.locator(".stat").count(), 0, "no summary tiles");
  assert.equal(await page.locator(".feed").count(), 0, "no activity feed on overview");
});

test("deadline rows show a short date and no ticking seconds", async () => {
  await onboard(page);
  await go(page, "deadlines");
  const due = await page.$$eval(".list .item .due", xs => xs.map(x => x.textContent.replace(/\s+/g, " ").trim()));
  assert.ok(due.length > 5);
  due.forEach(t => {
    assert.doesNotMatch(t, /\d+m \d{2}s/, `no seconds: ${t}`);
    assert.doesNotMatch(t, /\d{1,2}:\d{2}/, `no clock time in the row: ${t}`);
  });
});

test("the page subtitle doesn't repeat today's date", async () => {
  await onboard(page);
  await go(page, "deadlines");
  assert.doesNotMatch(await page.textContent("#pageSub"), /October|Friday/);
});

/* ---------- Fewer options ---------- */
test("adding is one box: no form fields, one line says what it understood", async () => {
  await onboard(page);
  await page.click("#qaBtn");
  assert.equal(await page.isVisible("#qaText"), true);
  assert.equal(await page.locator("#modal input, #modal select").count(), 0, "no form fields to fill in");
  await page.fill("#qaText", "Essay due tomorrow 5pm ~3h #maths");
  const h = await page.textContent("#qaText-hint");
  assert.match(h, /Deadline/); assert.match(h, /3h/, "parsed values are shown");
  assert.equal(await page.inputValue("#qaText"), "Essay due tomorrow 5pm ~3h #maths", "typed text kept");
});

test("details panel shows core fields; the rest is under More details", async () => {
  await onboard(page);
  await go(page, "deadlines");
  await page.locator(".list .item .body").first().click();
  await page.waitForSelector(".drawer.on");
  for (const id of ["#dr-date", "#dr-time", "#dr-pri", "#dr-status", "#dr-est", "#dr-notes"]) assert.equal(await page.isVisible(id), true, id);
  for (const id of ["#dr-type", "#dr-group", "#dr-repeat", "#dr-link"]) assert.equal(await page.isVisible(id), false, `${id} hidden`);
  assert.doesNotMatch(await page.textContent(".dr-b"), /Asia\/|UTC/, "no time zone noise");
  await page.click("#drMore");
  assert.equal(await page.isVisible("#dr-group"), true);
});

test("list filters stay out of the way until asked for", async () => {
  await onboard(page);
  await go(page, "deadlines");
  assert.equal(await page.locator(".fchips").isVisible().catch(() => false), false);
  await page.click("#filtersBtn");
  assert.equal(await page.isVisible(".fchips"), true);
  await page.locator(".fchip", { hasText: "Exam" }).click();
  const types = await page.$$eval(".list .item .m", xs => xs.map(x => x.textContent));
  assert.ok(types.length > 0 && types.every(t => /Exam/.test(t)));
  assert.match(await page.textContent("#filtersBtn"), /1/, "button shows how many filters are on");
});

test("settings drop options that do nothing", async () => {
  await onboard(page);
  await go(page, "prefs");
  assert.equal(await page.locator("#pf-tz").count(), 0, "no time zone picker");
  assert.equal(await page.locator("#rm-custom").count(), 0, "no custom reminder field");
  assert.equal(await page.locator(".status-tag:not(.on)").count(), 0, "no 'Not connected' rows");
  await page.click("[data-act=settab][data-v=s-avail]");
  assert.equal(await page.isVisible("#th-critical"), false, "risk rules tucked under Advanced");
  await page.click("#advToggle");
  assert.equal(await page.isVisible("#th-critical"), true);
});

/* ---------- Every control works ---------- */
test("every clickable action in the app has working code behind it", async () => {
  const dir = path.join(__dirname, "..", "src");
  const src = fs.readdirSync(dir).filter(f => f.endsWith(".js")).map(f => fs.readFileSync(path.join(dir, f), "utf8")).join("\n");
  const handled = new Set([...src.matchAll(/case "([a-zA-Z]+)"/g)].map(m => m[1]));
  const used = new Set([...src.matchAll(/data-act="([a-zA-Z]+)"/g)].map(m => m[1]));
  const missing = [...used].filter(a => !handled.has(a));
  assert.deepEqual(missing, []);
});

for (const mode of ["student", "company", "personal"]) {
  test(`every page opens cleanly in both themes (${mode})`, async () => {
    await onboard(page, { mode });
    const routes = await page.$$eval("#side .nav a", as => as.map(a => a.dataset.route));
    for (let k = 0; k < 2; k++) {
      for (const r of routes) {
        await go(page, r);
        assert.ok((await page.textContent("#viewInner")).trim().length > 20, `${r} has content`);
        const unnamed = await page.$$eval("button,[role=button]", bs => bs.filter(b => b.offsetParent !== null && !(b.getAttribute("aria-label") || b.textContent.trim() || b.title)).map(b => b.outerHTML.slice(0, 60)));
        assert.deepEqual(unnamed, [], `${r}: buttons have names`);
      }
      await page.click("#themeBtn");
    }
  });
}
