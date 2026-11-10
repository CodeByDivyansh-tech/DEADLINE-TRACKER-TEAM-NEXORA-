// A7: a short sidebar: four main items + More; managers keep their team pages; To-Do lives on Today.
const { test, before, after, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { setup, newPage, onboard, go } = require("./helpers");

let env, page;
before(async () => { env = await setup(); });
after(async () => { await env.close(); });
afterEach(async () => { if (page) { assert.deepEqual(page.errors, [], "no errors in the browser"); await page.context().close(); page = null; } });

const main = () => page.$$eval("#side .nav > a", as => as.map(a => a.textContent.trim().replace(/\d+$/, "").trim()));
const more = () => page.$$eval("#side .nav-more a", as => as.map(a => a.dataset.route));

test("A7 (student): Today, Assistant, Calendar, Deadlines, and the rest under More", async () => {
  page = await newPage(env); await onboard(page);
  assert.deepEqual(await main(), ["Today", "Daily tasks", "Habit Tracker", "Assistant", "Calendar", "Deadlines"]);
  assert.deepEqual(await more(), ["exams", "planner", "reports", "prefs"]);
  assert.equal(await page.isVisible("#side .nav-more a[data-route=reports]"), false, "More is folded");
  await page.click("#side .nav-more summary");
  assert.equal(await page.isVisible("#side .nav-more a[data-route=reports]"), true);
});

test("A7 (company): managers keep the team pages in view; employees don't see them", async () => {
  page = await newPage(env); await onboard(page, { mode: "company" });
  assert.deepEqual(await main(), ["Today", "Daily tasks", "Habit Tracker", "Assistant", "Calendar", "My Work", "Team Deadlines", "Workload", "Needs attention"]);
  assert.deepEqual(await more(), ["planner", "reports", "prefs"]);
  await page.selectOption("#viewAs", "p"); await page.waitForTimeout(120);
  assert.deepEqual(await main(), ["Today", "Daily tasks", "Habit Tracker", "Assistant", "Calendar", "My Work", "Team Deadlines"]);
  assert.deepEqual(await more(), ["planner", "prefs"]);
});

test("A7: To-Do is part of Today (tabs), and old To-Do links land there", async () => {
  page = await newPage(env); await onboard(page, { demo: false });
  await go(page, "todo");
  assert.equal(await page.textContent("#pageTitle"), "Today");
  for (const v of ["today", "upcoming", "done"]) assert.equal(await page.locator(`#todayCard [data-act=todotab][data-v=${v}]`).count(), 1);
  assert.equal(await page.locator("#side a[data-route=todo]").count(), 0);
});

test("A7 (phone): the bottom bar has the same four plus More", async () => {
  page = await newPage(env, { viewport: { width: 390, height: 844 } }); await onboard(page);
  const items = await page.$$eval("#bnav > *", xs => xs.map(x => x.textContent.trim()));
  assert.deepEqual(items, ["Today", "Daily", "Deadlines", "Assistant", "More"]);
});
