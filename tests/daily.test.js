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
const rows = () => page.$$eval("#dailyList .dt-row", rs => rs.map(r => ({ t: r.querySelector(".dt-t").textContent.trim(), done: r.classList.contains("done") })));
const progress = () => page.textContent("#dailyProgress");

test("daily: a 'Daily tasks' page in the main menu with a simple add form and filters", async () => {
  await open();
  assert.equal(await page.textContent("#pageTitle"), "Daily tasks");
  assert.equal(await page.locator("#side .nav > a[data-route=daily]").count(), 1, "in the main menu");
  for (const id of ["#dailyTitle", "#dailyDesc", "#dailyAdd"]) assert.equal(await page.isVisible(id), true, id);
  assert.deepEqual(await page.$$eval("[data-act=dailyf]", b => b.map(x => x.textContent.trim().replace(/\s*\d+$/, ""))), ["All", "Today", "Pending", "Completed"]);
  assert.match(await page.textContent("#dailyList"), /No tasks yet/i);
  assert.equal(await page.locator("#modal input[type=date], #dailyForm input[type=date], #dailyForm input[type=time]").count(), 0, "no date or time options");
});

test("daily: add four tasks, tick one, progress shows 1 of 4 — 25%; untick undoes it", async () => {
  await open();
  await add("Complete today's study plan", "Chapters 3 and 4");
  await add("Finish the project work"); await add("Attend the scheduled meeting"); await add("Review today's progress");
  assert.equal((await rows()).length, 4);
  assert.match(await page.textContent("#dailyList"), /Chapters 3 and 4/, "description shown");
  assert.match(await progress(), /0 of 4 completed\s*[—-]\s*0%/);
  assert.match(await page.textContent("#dailyCounts"), /4 pending/); assert.match(await page.textContent("#dailyCounts"), /0 completed/);
  await page.locator(".dt-row", { hasText: "Complete today's study plan" }).locator(".dt-check").click();
  assert.match(await progress(), /1 of 4 completed\s*[—-]\s*25%/);
  assert.equal(await page.$eval("#dailyBar", b => b.style.width), "25%");
  assert.ok((await rows()).find(r => r.t === "Complete today's study plan").done, "looks completed");
  assert.match(await page.textContent("#dailyCounts"), /3 pending/); assert.match(await page.textContent("#dailyCounts"), /1 completed/);
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

test("daily: filters All, Today, Pending, Completed", async () => {
  await open();
  await page.evaluate(() => { const T = window.__DT_TEST__; const w = T.W(); w.items.push(T.mkItem(w, { kind: "todo", title: "Yesterday's reading", plan: "2026-10-29" })); T.save(); T.render(); });
  await add("Today A"); await add("Today B");
  await page.locator(".dt-row", { hasText: "Today A" }).locator(".dt-check").click();
  const f = async v => { await page.click(`[data-act=dailyf][data-v=${v}]`); await page.waitForTimeout(40); return (await rows()).map(r => r.t).sort(); };
  assert.deepEqual(await f("all"), ["Today A", "Today B", "Yesterday's reading"]);
  assert.deepEqual(await f("today"), ["Today A", "Today B"]);
  assert.deepEqual(await f("pending"), ["Today B", "Yesterday's reading"]);
  assert.deepEqual(await f("completed"), ["Today A"]);
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
