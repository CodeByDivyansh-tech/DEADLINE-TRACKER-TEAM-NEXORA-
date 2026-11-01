// A5: a calm first day: no flood of notifications, and sample data that looks like a normal week.
const { test, before, after, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { setup, newPage, onboard } = require("./helpers");

let env, page;
before(async () => { env = await setup(); });
after(async () => { await env.close(); });
afterEach(async () => { if (page) { assert.deepEqual(page.errors, [], "no errors in the browser"); await page.context().close(); page = null; } });

const levels = () => page.evaluate(() => { const T = window.__DT_TEST__; const w = T.W(); const R = T.radar(w, Date.now()); const c = {}; w.items.filter(i => i.status !== "done" && i.due).forEach(i => { const l = R[i.id].level; c[l] = (c[l] || 0) + 1; }); return c; });
const unread = () => page.evaluate(() => (window.__DT_TEST__.state.inbox || []).filter(n => !n.read && !n.dismissed).map(n => n.text));

for (const mode of ["student", "company", "personal"]) {
  test(`A5 (${mode}): at most one unread notification right after setup`, async () => {
    page = await newPage(env); await onboard(page, { mode, demo: true });
    await page.waitForTimeout(1500);
    const u = await unread();
    assert.ok(u.length <= 1, u.join(" | "));
  });
  test(`A5 (${mode}): sample data is a normal week: one overdue at most, few critical or at risk`, async () => {
    page = await newPage(env); await onboard(page, { mode, demo: true });
    const c = await levels();    assert.ok((c.overdue || 0) <= 1, JSON.stringify(c));
    assert.ok((c.critical || 0) + (c.risk || 0) <= 2, JSON.stringify(c));
  });
}

test("A5: new reminders still arrive after the first run", async () => {
  page = await newPage(env); await onboard(page, { demo: true });
  await page.evaluate(() => { const T = window.__DT_TEST__; const w = T.W(); w.items.push(T.mkItem(w, { title: "Java viva", due: "2026-10-31T10:00", reminders: [1440] })); T.save(); });
  await page.waitForTimeout(1500);
  assert.ok((await unread()).some(t => /Java viva/.test(t)));
});
