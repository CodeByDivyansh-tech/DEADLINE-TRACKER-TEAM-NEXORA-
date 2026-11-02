// A4: Home is one calm "Today" view: greeting + Add box, today's tasks with progress, next deadlines,
// one heads-up line. The radar lives on the Deadlines page.
const { test, before, after, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { setup, newPage, onboard, go, ws } = require("./helpers");

let env, page;
before(async () => { env = await setup(); });
after(async () => { await env.close(); });
afterEach(async () => { if (page) { assert.deepEqual(page.errors, [], "no errors in the browser"); await page.context().close(); page = null; } });

async function open(opts = {}) { page = await newPage(env, opts); await onboard(page, { mode: opts.mode || "student", demo: opts.demo ?? true }); await go(page, "overview"); }

test("A4: Home has only the four parts, in this order", async () => {
  await open();
  assert.match(await page.textContent(".hello h2"), /Divyansh/);
  assert.equal(await page.isVisible("#addText"), true, "add/ask bar");
  assert.equal(await page.locator("#todayCard").count(), 1, "today's tasks");
  assert.equal(await page.locator("#nextDl").count(), 1, "next deadlines");
  assert.equal(await page.locator("#headsToggle").count(), 1, "one heads-up line");
  for (const sel of [".stat", ".radar", ".next", ".timeline", ".load-bars", ".proj", ".wl-row"]) assert.equal(await page.locator(`#viewInner ${sel}`).count(), 0, `${sel} is not on Home`);
  const blocks = await page.locator("#viewInner > *").count();
  assert.ok(blocks <= 4, `top-level blocks: ${blocks}`);
});

test("A4: today's tasks show progress, and the count matches the list", async () => {
  await open();
  await page.evaluate(() => { const T = window.__DT_TEST__; const w = T.W(); ["Call teammate", "Buy lab coat"].forEach(t => w.items.push(T.mkItem(w, { kind: "todo", title: t, plan: "2026-10-30" }))); T.save(); T.render(); });
  const rows = await page.locator("#todayCard .todo").count();
  const open_ = await page.locator("#todayCard .todo:not(.done)").count();
  assert.ok(rows >= 2);
  assert.match(await page.textContent("#todoProgress"), new RegExp(`^0 of ${rows} done`));
  await page.locator("#todayCard .todo", { hasText: "Call teammate" }).locator(".tcheck").click();
  assert.match(await page.textContent("#todoProgress"), new RegExp(`^1 of ${rows} done`));
  assert.equal(await page.locator("#todayCard .todo:not(.done)").count(), open_ - 1);
});

test("A4: next deadlines: at most five, overdue first, soonest next, and they open", async () => {
  await open();
  const rows = page.locator("#nextDl .nd-row");
  const n = await rows.count();
  assert.ok(n >= 3 && n <= 5, `rows: ${n}`);
  assert.match(await rows.first().textContent(), /Physics lab report/, "the overdue one comes first");
  assert.match(await rows.first().textContent(), /Overdue/);
  assert.match(await rows.nth(1).textContent(), /English essay/, "then the soonest");
  await rows.nth(1).locator("[data-act=open]").click();
  await page.waitForSelector(".drawer.on");
  assert.equal(await page.inputValue("#dr-title"), "English essay: climate and cities");
});

test("A4: Home is short on a phone (sample data)", async () => {
  page = await newPage(env, { viewport: { width: 390, height: 844 } }); await onboard(page, { demo: true }); await go(page, "overview");
  const screens = await page.evaluate(() => { const v = document.getElementById("view"); return v.scrollHeight / v.clientHeight; });
  assert.ok(screens <= 2, `Home is ${screens.toFixed(1)} phone screens tall`);
});

test("A4: Home never contradicts itself", async () => {
  await open();
  const txt = await page.textContent("#viewInner");
  assert.doesNotMatch(txt, /all caught up|nothing urgent/i, "not with an overdue deadline on the list");
  await page.click("[data-act=cleardemo]"); await page.click("[data-act=confirmok]");
  const empty = await page.textContent("#viewInner");
  assert.match(empty, /No deadlines coming up/i);
  assert.match(empty, /Nothing planned for today/i);
  assert.equal(await page.locator("#headsToggle").count(), 0, "no heads-up when there's nothing to say");
});

test("A4: the radar is on the Deadlines page, and its legend still filters", async () => {
  await open();
  await go(page, "deadlines");
  assert.ok(await page.locator(".radar .blip").count() > 3);
  await page.locator(".legend [data-act=riskgo][data-lv=overdue]").click();
  const titles = await page.$$eval(".list .item .t", xs => xs.map(x => x.textContent));
  assert.deepEqual(titles, ["Physics lab report: simple pendulum"]);
});

test("A4 (company): a manager's Home is the same calm Today view", async () => {
  await open({ mode: "company" });
  assert.equal(await page.isVisible("#addText"), true);
  assert.equal(await page.locator("#todayCard").count(), 1);
  assert.equal(await page.locator("#nextDl").count(), 1);
  for (const sel of [".stat", ".radar", ".proj", ".wl-row", ".feed"]) assert.equal(await page.locator(`#viewInner ${sel}`).count(), 0, `${sel} is not on Home`);
});

test("Home: a slim row of real numbers in the greeting panel (due this week, at risk, overdue, done in 7 days)", async () => {
  await open();
  const shown = await page.$$eval(".hero .wk-stats .wk", xs => xs.map(x => ({ n: Number(x.querySelector("b").textContent), l: x.querySelector("span").textContent.trim(), route: x.getAttribute("data-route") })));
  assert.deepEqual(shown.map(x => x.l), ["Due this week", "At risk", "Overdue", "Done in 7 days"]);
  const expect = await page.evaluate(() => {
    const T = window.__DT_TEST__, w = T.W(), now = Date.now(), R = T.radar(w, now);
    const open = w.items.filter(i => i.status !== "done" && i.due);
    return [open.filter(i => { const t = new Date(i.due).getTime(); return t >= now && t < now + 7 * 864e5; }).length,
      open.filter(i => ["risk", "critical"].includes(T.levelOf(R, i))).length,
      open.filter(i => new Date(i.due).getTime() < now).length,
      w.items.filter(i => i.status === "done" && i.doneAt && now - new Date(i.doneAt).getTime() <= 7 * 864e5).length];
  });
  assert.deepEqual(shown.map(x => x.n), expect);
  assert.ok(expect[0] > 0 && expect[2] > 0, "sample data gives non-zero numbers");
  assert.ok(shown.every(x => x.route === "deadlines"), "each number opens the deadline list");
  assert.ok((await page.locator("#viewInner > *").count()) <= 4, "still a calm Home: no extra blocks");
  await page.click(".hero .wk-stats .wk >> nth=2");
  await page.waitForFunction(() => location.hash === "#deadlines");
});

test("manager Home: the 'needs your attention' bar looks like a card and the Add box example text isn't cut off", async () => {
  await open({ mode: "company" });
  await page.setViewportSize({ width: 1440, height: 900 }); await page.waitForTimeout(100);
  const bar = await page.$eval("#attnLine", e => { const c = getComputedStyle(e); return { pad: parseFloat(c.paddingLeft), border: c.borderTopWidth, bg: c.backgroundColor, h: e.getBoundingClientRect().height }; });
  assert.ok(bar.pad >= 12, `padding ${bar.pad}`); assert.notEqual(bar.border, "0px"); assert.notEqual(bar.bg, "rgba(0, 0, 0, 0)"); assert.ok(bar.h >= 44, `height ${bar.h}`);
  const m = await page.$eval("#addText", e => ({ sh: e.scrollHeight, ch: e.clientHeight }));
  assert.ok(m.sh <= m.ch + 1, `placeholder fits: ${m.sh} vs ${m.ch}`);
});
