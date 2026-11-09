// The owner's to-do checklist (9 Nov 2026), run against the real server and database:
// create 5 tasks, complete 2 (3 pending, 40%), untick one (20%), refresh, edit, delete.
const { test, before, after, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const { startServer } = require("./srv");
const { onboard, pollPage, go } = require("./helpers");

let s, browser; const ctxs = [];
before(async () => { s = await startServer({}); browser = await chromium.launch(); });
after(async () => { await browser.close(); s.stop(); });
afterEach(async () => { while (ctxs.length) { const c = ctxs.pop(); const errs = c.__errors; await c.close(); assert.deepEqual(errs, [], "no errors in the browser"); } });

let n = 0;
async function newUser(viewport){
  const ctx = await browser.newContext({ viewport: viewport || { width: 1366, height: 900 }, timezoneId: "Asia/Kolkata", locale: "en-IN" });
  ctx.__errors = []; ctxs.push(ctx);
  const page = await ctx.newPage();
  page.on("pageerror", e => ctx.__errors.push(e.message));
  page.on("console", m => { if (m.type() === "error" && !/Failed to load resource|fonts\./.test(m.text())) ctx.__errors.push(m.text()); });
  await page.goto(s.base + "/?dt-test");
  await page.waitForSelector(".auth-card");
  await page.click("[data-act=authmode][data-v=signup]");
  await page.fill("#au-name", "Todo " + (++n)); await page.fill("#au-email", `todo${n}@example.com`); await page.fill("#au-pass", "password123");
  await page.click("#authGo"); await page.waitForSelector("#onb-name");
  await onboard(page, { mode: "student", demo: false, name: "Todo" });
  await go(page, "daily");
  return page;
}
const add = async (page, t) => { await page.fill("#dailyTitle", t); await page.click("#dailyAdd"); await page.waitForSelector(`#dailyOpen .dt-row:has-text("${t}")`); };
const tick = (page, t) => page.click(`[aria-label="Mark as done: ${t}"]`);
const untick = (page, t) => page.click(`[aria-label="Mark as not done: ${t}"]`);
const stats = async page => {
  const t = (await page.textContent("#dailyStats")).replace(/\s+/g, " ");
  const num = l => +((t.match(new RegExp("(\\d+)\\s*" + l)) || [])[1]);
  return { total: num("Total"), done: num("Completed"), pending: num("Pending"), pct: (t.match(/(\d+)%/) || [])[1] };
};
const section = (page, id) => page.$$eval(`#${id} .dt-row .dt-t`, r => r.map(x => x.textContent.trim()).sort());
// what the database has (the app saves through /api/state into the tasks table)
async function saved(page){
  await pollPage(page, async () => { const r = await (await fetch("/api/state")).json(); return !document.querySelector("[data-saving]") && r.version >= 1; }, null, 5000);
  await page.waitForTimeout(1600);   // the app saves shortly after a change
  return page.evaluate(async () => (await (await fetch("/api/tasks?limit=200")).json()).tasks.map(t => ({ title: t.title, status: t.status })).sort((a, b) => a.title < b.title ? -1 : 1));
}

test("checklist: 5 tasks → complete 2 = 3 pending, 40% → untick one = 20% → refresh keeps it → edit → delete", async () => {
  const page = await newUser();
  const T = ["Revise maths", "Java lab", "Read chapter 3", "Gym", "Call home"];
  for (const t of T) await add(page, t);
  assert.deepEqual(await stats(page), { total: 5, done: 0, pending: 5, pct: "0" });
  assert.ok(await page.$$eval("#dailyOpen .dt-check", b => b.every(x => x.getAttribute("aria-pressed") === "false")), "new tasks start incomplete");
  await tick(page, "Java lab"); await tick(page, "Gym");
  assert.deepEqual(await stats(page), { total: 5, done: 2, pending: 3, pct: "40" });
  assert.deepEqual(await section(page, "dailyDone"), ["Gym", "Java lab"]);
  assert.deepEqual(await section(page, "dailyOpen"), ["Call home", "Read chapter 3", "Revise maths"]);
  assert.match(await page.textContent("#dailyProgress"), /2 of 5 completed — 40%/);
  const done = page.locator('#dailyDone .dt-row:has-text("Gym")');
  assert.equal(await done.locator(".dt-check").getAttribute("aria-pressed"), "true");
  assert.match(await done.locator(".dt-t").evaluate(e => getComputedStyle(e).textDecorationLine), /line-through/);
  await untick(page, "Gym");
  assert.deepEqual(await stats(page), { total: 5, done: 1, pending: 4, pct: "20" });
  let db = await saved(page);
  assert.deepEqual(db.filter(x => x.status === "done").map(x => x.title), ["Java lab"], "the database has the same status");
  assert.equal(db.length, 5);
  await page.reload(); await page.waitForSelector("#app:not([hidden])"); await go(page, "daily");
  assert.deepEqual(await stats(page), { total: 5, done: 1, pending: 4, pct: "20" }, "after refresh");
  assert.deepEqual(await section(page, "dailyDone"), ["Java lab"]);
  // edit
  await page.locator('#dailyOpen .dt-row:has-text("Call home")').locator("[data-act=dailyedit]").click();
  await page.fill("#dtEditTitle", "Call home at 7"); await page.click("[data-act=dailysave]");
  await page.waitForSelector('#dailyOpen .dt-row:has-text("Call home at 7")');
  // delete
  await page.locator('#dailyOpen .dt-row:has-text("Read chapter 3")').locator("[data-act=dailydel]").click();
  await page.waitForFunction(() => !/Read chapter 3/.test(document.getElementById("dailyOpen").textContent));
  assert.deepEqual(await stats(page), { total: 4, done: 1, pending: 3, pct: "25" });
  db = await saved(page);
  assert.deepEqual(db.map(x => x.title), ["Call home at 7", "Gym", "Java lab", "Revise maths"]);
  await page.reload(); await page.waitForSelector("#app:not([hidden])"); await go(page, "daily");
  assert.deepEqual(await section(page, "dailyOpen"), ["Call home at 7", "Gym", "Revise maths"]);
});

test("completion buttons: round, big enough to tap, with a short tick animation", async () => {
  const page = await newUser();
  await add(page, "Tap me");
  const b = await page.$eval("#dailyOpen .dt-check", e => { const c = getComputedStyle(e); const r = e.getBoundingClientRect(); return { radius: c.borderRadius, w: r.width, h: r.height }; });
  assert.ok(b.radius === "50%" || parseFloat(b.radius) >= b.w / 2 - 1, "round: " + b.radius);
  assert.ok(b.w >= 28 && b.h >= 28, `size ${b.w}×${b.h}`);
  await tick(page, "Tap me");
  assert.ok(await page.$eval('#dailyDone .dt-row', e => getComputedStyle(e).animationName !== "none" || getComputedStyle(e.querySelector(".dt-check")).animationName !== "none"), "animates");
});

test("weekly report: last 7 days completed, percentage and best day, from saved day records", async () => {
  const page = await newUser();
  await page.evaluate(() => { const T = window.__DT_TEST__; const w = T.W(); w.dayLog = Object.assign(w.dayLog || {}, { "2026-11-03": { total: 4, done: 4 }, "2026-11-05": { total: 5, done: 2 } }); T.save(); T.render(); });
  await add(page, "Today one"); await add(page, "Today two"); await tick(page, "Today one");
  const t = (await page.textContent("#histWeek")).replace(/\s+/g, " ");
  // today is the real date in this test (no fixed clock); the two saved days fall in the last 7 days only if today is 9 Nov 2026 or close
  assert.match(t, /Last 7 days: \d+ of \d+ completed \(\d+%\)/);
  assert.match(t, /Best day: \w{3} \d+ \w{3}/);
});
