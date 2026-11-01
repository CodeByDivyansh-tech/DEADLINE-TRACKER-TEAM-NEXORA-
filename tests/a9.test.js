// A9: the right empty state on My Deadlines, and Settings in short sections.
const { test, before, after, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { setup, newPage, onboard, go } = require("./helpers");

let env, page;
before(async () => { env = await setup(); });
after(async () => { await env.close(); });
afterEach(async () => { if (page) { assert.deepEqual(page.errors, [], "no errors in the browser"); await page.context().close(); page = null; } });

const add = o => page.evaluate(o => { const T = window.__DT_TEST__; const w = T.W(); w.items.push(T.mkItem(w, o)); T.save(); T.render(); }, o);

test("A9: with only plain tasks and no filters, My Deadlines says 'No deadlines yet', not 'Nothing matches'", async () => {
  page = await newPage(env); await onboard(page, { demo: false });
  await add({ kind: "todo", title: "Call teammate", plan: "2026-10-30" });
  await go(page, "deadlines");
  const t = await page.textContent(".list");
  assert.match(t, /No deadlines yet/); assert.doesNotMatch(t, /Nothing matches|Clear filters/);
});

test("A9: when every deadline is done, it says so and offers Completed", async () => {
  page = await newPage(env); await onboard(page, { demo: false });
  await add({ kind: "deadline", title: "Old quiz", due: "2026-10-20T09:00", status: "done", doneAt: "2026-10-20T02:00:00.000Z" });
  await go(page, "deadlines");
  const t = await page.textContent(".list");
  assert.match(t, /All done/i); assert.doesNotMatch(t, /Nothing matches/);
});

test("A9: 'Nothing matches' only when a search or filter is on", async () => {
  page = await newPage(env); await onboard(page);
  await go(page, "deadlines");
  await page.fill("#listSearch", "zzzz"); await page.waitForTimeout(80);
  assert.match(await page.textContent(".list"), /Nothing matches/);
});

test("A9: Settings shows one short section at a time", async () => {
  page = await newPage(env, { viewport: { width: 390, height: 844 } }); await onboard(page);
  await go(page, "prefs");
  const tabs = await page.$$eval(".set-nav [data-act=settab]", xs => xs.map(x => x.textContent.trim()));
  assert.ok(tabs.length >= 5, tabs.join());
  assert.equal(await page.locator(".set-sec:not([hidden])").count(), 1);
  for (const v of await page.$$eval(".set-nav [data-act=settab]", xs => xs.map(x => x.dataset.v))) {
    await page.click(`.set-nav [data-act=settab][data-v=${v}]`); await page.waitForTimeout(60);
    assert.equal(await page.isVisible("#" + v), true, v);
    const screens = await page.evaluate(() => { const v = document.getElementById("view"); return v.scrollHeight / v.clientHeight; });
    assert.ok(screens <= 2.2, `${v} is ${screens.toFixed(1)} screens`);
  }
});
