// A8: managers pick who a task is for in the Add box, and have one "Needs your attention" queue.
const { test, before, after, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { setup, newPage, onboard, go, itemByTitle } = require("./helpers");

let env, page;
before(async () => { env = await setup(); });
after(async () => { await env.close(); });
afterEach(async () => { if (page) { assert.deepEqual(page.errors, [], "no errors in the browser"); await page.context().close(); page = null; } });

async function open() { page = await newPage(env); await onboard(page, { mode: "company", demo: true }); }

test("A8: a manager's Add box has a visible 'For' picker; employees don't", async () => {
  await open();
  assert.equal(await page.isVisible("#addText-who"), true);
  await page.selectOption("#addText-who", "r");
  await page.fill("#addText", "Fix login bug tomorrow");
  assert.match(await page.textContent("#addText-hint"), /Rahul Verma/);
  await page.press("#addText", "Enter");
  assert.equal((await itemByTitle(page, "Fix login bug")).assignee, "r");
  await page.fill("#addText", "Write docs, assign to Karan");
  await page.press("#addText", "Enter");
  assert.equal((await itemByTitle(page, "Write docs")).assignee, "k", "typed name wins over the picker");
  await page.selectOption("#viewAs", "p"); await page.waitForTimeout(120);
  assert.equal(await page.locator("#addText-who").count(), 0);
});

test("A8: one 'Needs your attention' queue: approvals, overdue, blocked, overloaded people", async () => {
  await open();
  await page.evaluate(() => { const T = window.__DT_TEST__; const w = T.W(); for (let k = 0; k < 4; k++) w.items.push(T.mkItem(w, { title: "Extra work " + k, assignee: "a", due: "2026-11-02T17:00", estimate: 12 })); T.save(); T.render(); });
  await go(page, "approvals");
  assert.equal(await page.textContent("#pageTitle"), "Needs attention");
  const t = await page.textContent("#viewInner");
  assert.match(t, /Waiting for your approval/); assert.match(t, /Launch email sequence/);
  assert.match(t, /Overdue/); assert.match(t, /Fix checkout crash on Android/);
  assert.match(t, /Blocked/); assert.match(t, /API: push notifications/);
  assert.match(t, /Overloaded/); assert.match(t, /Ananya Iyer/);
  await page.locator(".appr", { hasText: "Launch email sequence" }).locator("[data-act=approve]").click();
  assert.equal((await itemByTitle(page, "Launch email sequence (3 emails)")).status, "done");
});

test("A8: the manager's Today shows the queue as one line that links to it", async () => {
  await open();
  const line = page.locator("#attnLine");
  assert.match(await line.textContent(), /\d+ things? need your attention/);
  await line.click();
  assert.equal(await page.textContent("#pageTitle"), "Needs attention");
});

test("A8: employees don't get the manager queue", async () => {
  await open();
  await page.selectOption("#viewAs", "p"); await page.waitForTimeout(120);
  assert.equal(await page.locator("#attnLine").count(), 0);
  assert.equal(await page.locator("#side a[data-route=approvals]").count(), 0);
});
