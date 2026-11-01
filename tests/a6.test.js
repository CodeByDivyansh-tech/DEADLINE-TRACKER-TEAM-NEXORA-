// A6: the first run asks "What's due this week?" in one box and turns the answer into tasks.
const { test, before, after, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { setup, newPage, ws, itemByTitle } = require("./helpers");

let env, page;
before(async () => { env = await setup(); });
after(async () => { await env.close(); });
afterEach(async () => { if (page) { assert.deepEqual(page.errors, [], "no errors in the browser"); await page.context().close(); page = null; } });

async function toLastStep(mode = "student") {
  page = await newPage(env);
  await page.fill("#onb-name", "Divyansh"); await page.click("[data-act=onbnext]");
  await page.click(`[data-act=onbmode][data-v=${mode}]`); await page.click("[data-act=onbnext]");
}

test("A6: the last setup step is one box asking what's due this week", async () => {
  await toLastStep();
  assert.match(await page.textContent("#onb"), /What's due this week\?/);
  assert.equal(await page.isVisible("#onb-due"), true);
  assert.equal(await page.locator("#onb input[type=text]").count(), 0, "no other text fields to fill in");
  await page.fill("#onb-due", "DBMS assignment due Friday 5pm, Java lab tomorrow");
  const h = await page.textContent("#onb-due-hint");
  assert.match(h, /DBMS assignment/); assert.match(h, /Deadline/); assert.match(h, /Java lab/);
});

test("A6: the answer becomes tasks and deadlines, shown on Today", async () => {
  await toLastStep();
  await page.fill("#onb-due", "DBMS assignment due Friday 5pm, Java lab tomorrow");
  if (await page.isChecked("#onb-demo")) await page.click("#onb-demo");
  await page.click("[data-act=onbdone]"); await page.waitForSelector("#app:not([hidden])");
  assert.equal((await itemByTitle(page, "DBMS assignment")).due, "2026-11-06T17:00");
  assert.equal((await itemByTitle(page, "Java lab")).plan, "2026-10-31");
  assert.match(await page.textContent("#nextDl"), /DBMS assignment/);
});

test("A6: leaving the box empty is fine", async () => {
  await toLastStep();
  if (await page.isChecked("#onb-demo")) await page.click("#onb-demo");
  await page.click("[data-act=onbdone]"); await page.waitForSelector("#app:not([hidden])");
  assert.equal((await ws(page)).items.length, 0);
});
