// Daily To-Do: add (title + optional description), tick/untick, edit, delete, counts, progress, filters;
// saved across reloads and log-ins, and private to each account.
const { test, before, after, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const { setup, newPage, onboard, go, ws } = require("./helpers");
const { startServer } = require("./srv");

let env, page;
before(async () => { env = await setup(); });
after(async () => { await env.close(); });
afterEach(async () => { if (page) { assert.deepEqual(page.errors, [], "no errors in the browser"); await page.context().close(); page = null; } });

async function open() { page = await newPage(env); await onboard(page, { demo: false }); await go(page, "daily"); }
async function add(title, desc) {
  await page.fill("#dailyTitle", title);
  if (desc) await page.fill("#dailyDesc", desc);
  await page.click("#dailyAdd"); await page.waitForTimeout(60);
}
const rows = () => page.$$eval("#dailyOpen .dt-row, #dailyDone .dt-row", rs => rs.map(r => ({ t: r.querySelector(".dt-t").textContent.trim(), done: r.classList.contains("done") })));
const progress = () => page.textContent("#dailyProgress");

test("daily: a 'Daily tasks' page in the main menu with a simple add form and Pending / Completed sections", async () => {
  await open();
  assert.equal(await page.textContent("#pageTitle"), "Daily tasks");
  assert.equal(await page.locator("#side .nav > a[data-route=daily]").count(), 1, "in the main menu");
  for (const id of ["#dailyTitle", "#dailyDesc", "#dailyAdd"]) assert.equal(await page.isVisible(id), true, id);
  assert.match(await page.textContent("#dailyOpenH"), /Pending\s*0/);
  assert.match(await page.textContent("#dailyDoneH"), /Completed\s*0/);
  assert.match(await page.textContent("#dailyOpen"), /No tasks yet/i);
  assert.equal(await page.locator("#modal input[type=date], #dailyForm input[type=date], #dailyForm input[type=time]").count(), 0, "no date or time options");
});

test("daily: add four tasks, tick one, progress shows 1 of 4 — 25%; untick undoes it", async () => {
  await open();
  await add("Complete today's study plan", "Chapters 3 and 4");
  await add("Finish the project work"); await add("Attend the scheduled meeting"); await add("Review today's progress");
  assert.equal((await rows()).length, 4);
  assert.match(await page.textContent("#dailyOpen"), /Chapters 3 and 4/, "description shown");
  assert.match(await progress(), /0 of 4 completed\s*[—-]\s*0%/);
  assert.match(await page.textContent("#dailyStats"), /4\s*Pending/); assert.match(await page.textContent("#dailyStats"), /0\s*Completed/);
  await page.locator(".dt-row", { hasText: "Complete today's study plan" }).locator(".dt-check").click();
  assert.match(await progress(), /1 of 4 completed\s*[—-]\s*25%/);
  assert.equal(await page.$eval("#dailyBar", b => b.style.width), "25%");
  assert.ok((await rows()).find(r => r.t === "Complete today's study plan").done, "looks completed");
  assert.match(await page.textContent("#dailyStats"), /3\s*Pending/); assert.match(await page.textContent("#dailyStats"), /1\s*Completed/);
  await page.locator(".dt-row", { hasText: "Complete today's study plan" }).locator(".dt-check").click();
  assert.match(await progress(), /0 of 4 completed/);
  assert.equal((await ws(page)).items.find(i => i.title === "Complete today's study plan").status, "todo");
});

test("daily: edit and delete (with Undo)", async () => {
  await open();
  await add("Finish the project work");
  const row = page.locator(".dt-row", { hasText: "Finish the project work" });
  await row.locator("[data-act=dailyedit]").click();
  await page.fill("#dtEditTitle", "Finish the project report"); await page.fill("#dtEditDesc", "Send to Priya");
  await page.click("[data-act=dailysave]");
  const it = (await ws(page)).items.find(i => i.title === "Finish the project report");
  assert.ok(it); assert.equal(it.notes, "Send to Priya");
  await page.locator(".dt-row", { hasText: "Finish the project report" }).locator("[data-act=dailydel]").click();
  assert.equal((await rows()).length, 0);
  await page.click("#toastUndo");
  assert.equal((await rows()).length, 1);
});

const sec = async id => (await page.$$eval(`#${id} .dt-row .dt-t`, r => r.map(x => x.textContent.trim())));
const seed = (title, plan, extra) => page.evaluate(([title, plan, extra]) => { const T = window.__DT_TEST__; const w = T.W(); w.items.push(T.mkItem(w, Object.assign({ kind: "todo", title, plan }, extra || {}))); T.save(); T.render(); }, [title, plan, extra || null]);

test("daily: ticking moves a task between Pending and Completed, with counts; unticking moves it back", async () => {
  await open();
  await add("Today A"); await add("Today B");
  assert.deepEqual((await sec("dailyOpen")).sort(), ["Today A", "Today B"]);
  await page.locator(".dt-row", { hasText: "Today A" }).locator(".dt-check").click();
  assert.deepEqual(await sec("dailyOpen"), ["Today B"]);
  assert.deepEqual(await sec("dailyDone"), ["Today A"]);
  assert.match(await page.textContent("#dailyOpenH"), /Pending\s*1/); assert.match(await page.textContent("#dailyDoneH"), /Completed\s*1/);
  await page.locator("#dailyDone .dt-row", { hasText: "Today A" }).locator(".dt-check").click();
  assert.deepEqual((await sec("dailyOpen")).sort(), ["Today A", "Today B"]);
  assert.deepEqual(await sec("dailyDone"), []);
});

test("daily: overdue tasks stay in Pending, first and clearly marked; nothing is completed or deleted by itself", async () => {
  await open();
  await seed("Yesterday's reading", "2026-10-29"); await add("Today A"); await seed("Next week", "2026-11-05");
  assert.deepEqual(await sec("dailyOpen"), ["Yesterday's reading", "Today A", "Next week"]);
  const over = page.locator("#dailyOpen .dt-row", { hasText: "Yesterday's reading" });
  assert.ok(await over.evaluate(r => r.classList.contains("overdue")));
  assert.match(await over.textContent(), /Carried forward/);
  assert.doesNotMatch(await page.locator("#dailyOpen .dt-row", { hasText: "Today A" }).textContent(), /Carried forward/);
  const it = (await ws(page)).items.find(i => i.title === "Yesterday's reading");
  assert.equal(it.status, "todo"); assert.equal(it.plan, "2026-10-29", "not moved by itself");
  assert.match(await page.textContent("#dailyOverdue"), /1 carried forward/);
});

test("daily: move to tomorrow keeps the same task (same id, notes), records where it came from, no duplicate", async () => {
  await open();
  await seed("Read chapter 5", "2026-10-29", { notes: "pages 40-60", priority: "high" });
  const id0 = (await ws(page)).items.find(i => i.title === "Read chapter 5").id;
  await page.locator("#dailyOpen .dt-row", { hasText: "Read chapter 5" }).locator("[data-act=dailytomorrow]").click();
  const items = (await ws(page)).items.filter(i => i.title === "Read chapter 5");
  assert.equal(items.length, 1, "no copy made");
  assert.equal(items[0].id, id0); assert.equal(items[0].plan, "2026-10-31"); assert.equal(items[0].notes, "pages 40-60"); assert.equal(items[0].priority, "high");
  assert.deepEqual(items[0].movedFrom, ["2026-10-29"]);
  assert.equal(items[0].status, "todo", "still incomplete");
  assert.doesNotMatch(await page.locator("#dailyOpen .dt-row", { hasText: "Read chapter 5" }).textContent(), /Carried forward/);
  assert.match(await page.textContent("#toastMsg"), /tomorrow/i);
  await page.click("#toastUndo");
  const back = (await ws(page)).items.find(i => i.title === "Read chapter 5");
  assert.equal(back.plan, "2026-10-29"); assert.ok(!back.movedFrom || !back.movedFrom.length, "undo restores it exactly");
});

test("daily: move to a chosen date; past dates are refused; moving twice doesn't repeat the history", async () => {
  await open();
  await add("Plan the trip");
  const row = () => page.locator("#dailyOpen .dt-row", { hasText: "Plan the trip" });
  await row().locator("[data-act=dailymove]").click();
  await page.fill("#dtMoveDate", "2026-10-20"); await page.click("[data-act=dailymovego]");
  assert.match(await page.textContent("#toastMsg"), /today or a later day/i);
  assert.equal((await ws(page)).items.find(i => i.title === "Plan the trip").plan, "2026-10-30");
  await page.fill("#dtMoveDate", "2026-11-04"); await page.click("[data-act=dailymovego]");
  let it = (await ws(page)).items.find(i => i.title === "Plan the trip");
  assert.equal(it.plan, "2026-11-04"); assert.deepEqual(it.movedFrom, ["2026-10-30"]);
  assert.match(await row().textContent(), /4 Nov/);
  await row().locator("[data-act=dailytomorrow]").click();
  await row().locator("[data-act=dailymove]").click(); await page.fill("#dtMoveDate", "2026-11-04"); await page.click("[data-act=dailymovego]");
  it = (await ws(page)).items.find(i => i.title === "Plan the trip");
  assert.deepEqual(it.movedFrom, ["2026-10-30", "2026-11-04", "2026-10-31"], "each day once, in order");
  assert.equal((await ws(page)).items.filter(i => i.title === "Plan the trip").length, 1);
});

test("daily: empty title is refused politely; everything survives a reload", async () => {
  await open();
  await page.click("#dailyAdd");
  assert.match(await page.textContent("#toastMsg"), /title/i);
  await add("Water the plants");
  await page.locator(".dt-row", { hasText: "Water the plants" }).locator(".dt-check").click();
  await page.reload(); await page.waitForSelector("#app:not([hidden])"); await go(page, "daily");
  assert.deepEqual(await rows(), [{ t: "Water the plants", done: true }]);
});

/* ---------- With accounts: saved on the server, private to each person ---------- */
test("daily (server): tasks stay after log-out and log-in, and other users can't see or change them", async () => {
  const s = await startServer({});
  const browser = await chromium.launch();
  try {
    let n = 0;
    const signup = async (email) => {
      const ctx = await browser.newContext({ timezoneId: "Asia/Kolkata" }); const p = await ctx.newPage();
      await p.goto(s.base + "/?dt-test"); await p.waitForSelector(".auth-card");
      await p.click("[data-act=authmode][data-v=signup]");
      await p.fill("#au-name", "User " + (++n)); await p.fill("#au-email", email); await p.fill("#au-pass", "password123");
      await p.click("#authGo"); await p.waitForSelector("#onb-name");
      await onboard(p, { demo: false, name: "User" });
      return p;
    };
    const a = await signup("asha@example.com");
    await a.evaluate(() => { location.hash = "daily"; }); await a.waitForSelector("#dailyTitle");
    await a.fill("#dailyTitle", "Asha's private task"); await a.fill("#dailyDesc", "secret notes"); await a.click("#dailyAdd");
    await a.locator(".dt-row", { hasText: "Asha's private task" }).locator(".dt-check").click();
    // wait until the server has the task, completed (the app saves a moment after each change)
    const id = await a.evaluate(async () => {
      for (let k = 0; k < 40; k++) { const t = (await (await fetch("/api/tasks")).json()).tasks.find(x => x.title === "Asha's private task" && x.status === "done"); if (t) return t.id; await new Promise(r => setTimeout(r, 250)); }
      return null;
    });
    assert.ok(id, "saved to the account");
    // log out and back in
    await a.evaluate(() => { location.hash = "prefs"; }); await a.click("[data-act=logout]");
    await a.waitForSelector(".auth-card");
    await a.fill("#au-email", "asha@example.com"); await a.fill("#au-pass", "password123"); await a.click("#authGo");
    await a.waitForSelector("#app:not([hidden])");
    await a.evaluate(() => { location.hash = "daily"; }); await a.waitForSelector("#dailyList");
    const row = a.locator(".dt-row", { hasText: "Asha's private task" });
    assert.equal(await row.count(), 1, "still there after logging back in");
    assert.ok(await row.evaluate(r => r.classList.contains("done")), "still completed");
    // another account
    const b = await signup("bilal@example.com");
    await b.evaluate(() => { location.hash = "daily"; }); await b.waitForSelector("#dailyList");
    assert.equal(await b.locator(".dt-row").count(), 0, "Bilal sees none of Asha's tasks");
    const tries = await b.evaluate(async id => {
      const g = await fetch("/api/tasks/" + id); const p = await fetch("/api/tasks/" + id, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "hacked" }) });
      const d = await fetch("/api/tasks/" + id, { method: "DELETE" }); const list = await (await fetch("/api/tasks")).json();
      return { g: g.status, p: p.status, d: d.status, leaked: JSON.stringify(list).includes("secret notes") };
    }, id);
    assert.deepEqual(tries, { g: 404, p: 404, d: 404, leaked: false });
    const still = await a.evaluate(async id => (await (await fetch("/api/tasks/" + id)).json()), id);
    assert.equal((still.task || still).title, "Asha's private task", "unchanged");
  } finally { await browser.close(); s.stop(); }
});
