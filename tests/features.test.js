// New features: progress check-ins, estimates that learn, extension tracking.
const { test, before, after, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { setup, newPage, onboard, go, ws, itemByTitle } = require("./helpers");

let env, page;
before(async () => { env = await setup(); });
after(async () => { await env.close(); });
beforeEach(async () => { page = await newPage(env); });
afterEach(async () => { assert.deepEqual(page.errors, [], "no errors in the browser"); await page.context().close(); });

// Runs fn inside the page against a fresh, empty student workspace.
function engine(fn) {
  return page.evaluate(src => {
    const T = window.__DT_TEST__;
    T.state = { v: 2, user: { name: "T" }, active: null, workspaces: [], read: {} };
    const w = T.newWorkspace("student", "S", false, []); T.state.workspaces.push(w); T.state.active = w.id;
    const add = o => { const it = T.mkItem(w, o); w.items.push(it); return it; };
    const done = (type, est, mins) => add({ title: type + est + mins, type, estimate: est, loggedMin: mins, status: "done", due: "2026-10-20T23:59", doneAt: "2026-10-20T20:00:00.000Z" });
    return (new Function("T", "w", "add", "done", src))(T, w, add, done);
  }, `return (${fn.toString()})(T, w, add, done);`);
}

/* ---------- Estimates that learn ---------- */
test("estimates: no advice until at least two finished deadlines of that type have logged time", async () => {
  const r = await engine((T, w, add, done) => { done("assignment", 2, 168); return T.estimateInsight(w, "assignment"); });
  assert.equal(r, null);
});
test("estimates: spots a consistent underestimate and suggests a better number", async () => {
  const r = await engine((T, w, add, done) => { done("assignment", 2, 168); done("assignment", 3, 252); done("assignment", 4, 336); const x = T.estimateInsight(w, "assignment"); return x && { pct: x.pct, n: x.n, text: x.text, s5: x.suggest(5) }; });
  assert.equal(r.n, 3); assert.equal(r.pct, 40);
  assert.match(r.text, /40% longer on assignments/);
  assert.equal(r.s5, 7);
});
test("estimates: stays quiet when estimates are already close", async () => {
  const r = await engine((T, w, add, done) => { done("exam", 2, 125); done("exam", 3, 175); return T.estimateInsight(w, "exam"); });
  assert.equal(r, null);
});
test("estimates: only uses finished work of the same type with real logged time", async () => {
  const r = await engine((T, w, add, done) => {
    done("assignment", 2, 168); done("exam", 2, 300); done("assignment", 2, 5);
    add({ title: "active", type: "assignment", estimate: 2, loggedMin: 400, due: "2026-11-20T23:59" });
    return T.estimateInsight(w, "assignment");
  });
  assert.equal(r, null, "only one usable assignment sample");
});
test("estimates: also notices overestimates", async () => {
  const r = await engine((T, w, add, done) => { done("project", 10, 360); done("project", 8, 300); return T.estimateInsight(w, "project").text; });
  assert.match(r, /less time on projects/);
});

/* ---------- Progress check-ins ---------- */
test("check-in: overview asks how far along a soon-due deadline is, and one tap updates it", async () => {
  await onboard(page);
  const card = page.locator("#checkin");
  assert.equal(await card.isVisible(), true);
  const id = await card.getAttribute("data-id");
  const before = (await ws(page)).items.find(i => i.id === id);
  assert.ok(before.estimate > 0 && !before.milestones.length);
  assert.match(await card.textContent(), new RegExp(before.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  await card.locator('[data-act=checkin][data-v="50"]').click();
  const after = (await ws(page)).items.find(i => i.id === id);
  assert.equal(after.progress, 50);
  assert.ok(after.checkedAt);
  assert.ok(after.log.some(l => /Checked in: 50% done/.test(l.text)));
  assert.notEqual(await page.locator("#checkin").getAttribute("data-id").catch(() => null), id, "moves on to the next deadline");
});
test("check-in: 'Not now' hides that deadline for a day, even after a reload", async () => {
  await onboard(page);
  const id = await page.getAttribute("#checkin", "data-id");
  await page.click("[data-act=checkinlater]");
  assert.notEqual(await page.locator("#checkin").getAttribute("data-id").catch(() => null), id);
  await page.reload(); await page.waitForSelector("#app:not([hidden])");
  assert.notEqual(await page.locator("#checkin").getAttribute("data-id").catch(() => null), id);
});
test("check-in: never asks about finished work or deadlines with plan steps", async () => {
  await onboard(page);
  const asked = new Set();
  for (let k = 0; k < 12; k++) {
    const card = page.locator("#checkin");
    if (!(await card.count())) break;
    const id = await card.getAttribute("data-id"); asked.add(id);
    await page.click("[data-act=checkinlater]");
  }
  const w = await ws(page);
  for (const id of asked) { const it = w.items.find(i => i.id === id); assert.notEqual(it.status, "done"); assert.equal(it.milestones.length, 0, it.title); }
  assert.ok(asked.size >= 1);
});
test("check-in: 'Done' completes the deadline", async () => {
  await onboard(page);
  const id = await page.getAttribute("#checkin", "data-id");
  await page.click('#checkin [data-act=checkin][data-v="done"]');
  assert.equal((await ws(page)).items.find(i => i.id === id).status, "done");
});

/* ---------- Estimate hints in the interface ---------- */
test("details panel: shows the estimate hint and applies it", async () => {
  await onboard(page);
  await go(page, "deadlines");
  await page.locator(".item", { hasText: "English essay" }).first().locator(".body").click();
  await page.waitForSelector("#drEstHint");
  assert.match(await page.textContent("#drEstHint"), /longer on assignments/);
  await page.click("#drEstUse");
  assert.equal((await itemByTitle(page, "English essay: climate and cities")).estimate, 7);
});
test("reports: shows how accurate past estimates were", async () => {
  await onboard(page);
  await go(page, "reports");
  const card = page.locator("#estAccuracy");
  assert.equal(await card.isVisible(), true);
  assert.match(await card.textContent(), /Assignment/);
  assert.match(await card.textContent(), /1\.4×/);
});

/* ---------- Extension tracking ---------- */
async function requestExtension() {
  await go(page, "deadlines");
  await page.locator(".item", { hasText: "Physics lab report" }).first().locator("[data-act=rescue]").click();
  await page.fill("#rs-ext", "2026-11-03"); await page.locator("#rs-ext").dispatchEvent("change");
  await page.click("[data-act=rsLogExt]");
  await page.click("[data-act=mclose]");
  await page.locator(".item", { hasText: "Physics lab report" }).first().locator(".body").click();
  await page.waitForSelector("#extBox");
}
test("extension: after asking, the details panel asks whether it was approved", async () => {
  await onboard(page);
  await requestExtension();
  const t = await page.textContent("#extBox");
  assert.match(t, /Extension requested/);
  assert.match(t, /3 Nov/);
  const it = await itemByTitle(page, "Physics lab report: simple pendulum");
  assert.equal(it.extension.status, "pending");
});
test("extension approved: deadline moves to the new date, keeps the time, remembers the original", async () => {
  await onboard(page);
  const orig = (await itemByTitle(page, "Physics lab report: simple pendulum")).due;
  await requestExtension();
  await page.click("[data-act=extyes]");
  const it = await itemByTitle(page, "Physics lab report: simple pendulum");
  assert.equal(it.due, "2026-11-03" + orig.slice(10));
  assert.equal(it.originalDue, orig);
  assert.equal(it.extension.status, "approved");
  assert.ok(it.log.some(l => /Extension approved/.test(l.text)));
  assert.match(await page.textContent("#extBox"), /extended from/i);
  await page.click("[data-act=drclose]");
  assert.match(await page.locator(".item", { hasText: "Physics lab report" }).first().textContent(), /Extended/);
});
test("extension declined: deadline stays, and the panel says so", async () => {
  await onboard(page);
  const orig = (await itemByTitle(page, "Physics lab report: simple pendulum")).due;
  await requestExtension();
  await page.click("[data-act=extno]");
  const it = await itemByTitle(page, "Physics lab report: simple pendulum");
  assert.equal(it.due, orig);
  assert.equal(it.extension.status, "declined");
  assert.match(await page.textContent("#extBox"), /declined/i);
  assert.equal(await page.locator("#extBox [data-act=extyes]").count(), 0);
});
test("extension approved: Undo puts the original deadline back", async () => {
  await onboard(page);
  const orig = (await itemByTitle(page, "Physics lab report: simple pendulum")).due;
  await requestExtension();
  await page.click("[data-act=extyes]");
  await page.click("#toastUndo");
  const it = await itemByTitle(page, "Physics lab report: simple pendulum");
  assert.equal(it.due, orig); assert.equal(it.extension.status, "pending");
});
