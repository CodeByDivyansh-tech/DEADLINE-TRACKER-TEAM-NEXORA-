// To-Do system: Today, Upcoming, Completed; one-click complete; edit; delete; move; persistence; time zones.
const { test, before, after, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { setup, newPage, onboard, go, ws } = require("./helpers");

let env, page;
before(async () => { env = await setup(); });
after(async () => { await env.close(); });
afterEach(async () => { if (page) { assert.deepEqual(page.errors, [], "no errors in the browser"); await page.context().close(); page = null; } });

async function open(opts = {}) { page = await newPage(env, opts); await onboard(page, { demo: opts.demo ?? false }); await go(page, "todo"); }
async function add(text) { await page.fill("#addText", text); await page.press("#addText", "Enter"); await page.waitForTimeout(60); }
const todos = async () => (await ws(page)).items.filter(i => i.kind === "todo");
const tab = async v => { await page.click(`[data-act=todotab][data-v=${v}]`); await page.waitForTimeout(60); };
const titles = () => page.$$eval(".todo .t", xs => xs.map(x => x.textContent.trim()));

test("to-do: Today, Upcoming and Completed tabs with a progress line", async () => {
  await open();
  assert.equal(await page.textContent("#pageTitle"), "Today");
  for (const v of ["today", "upcoming", "done"]) assert.equal(await page.locator(`[data-act=todotab][data-v=${v}]`).count(), 1);
  assert.match(await page.textContent("#todoProgress"), /0 of 0 done/);
  assert.match(await page.textContent(".todo-empty"), /nothing planned/i);
});

test("to-do: adding in Today plans it for today; words like 'tomorrow' are understood", async () => {
  await open();
  await add("Call project teammate");
  await add("Study Python tomorrow 6pm !high");
  const t = await todos();
  const a = t.find(i => i.title === "Call project teammate"), b = t.find(i => i.title === "Study Python");
  assert.equal(a.plan, "2026-10-30");
  assert.equal(b.plan, "2026-10-31"); assert.equal(b.time, "18:00"); assert.equal(b.priority, "high");
  assert.deepEqual(await titles(), ["Call project teammate"]);
  assert.match(await page.textContent("#todoProgress"), /0 of 1 done/);
  await tab("upcoming");
  assert.match(await page.textContent(".tgroup"), /Tomorrow/);
  assert.ok((await titles()).includes("Study Python"));
});

test("to-do: one click completes; progress updates; finishing everything today is celebrated", async () => {
  await open();
  await add("Study Python"); await add("Call teammate");
  await page.locator(".todo", { hasText: "Study Python" }).locator(".tcheck").click();
  assert.match(await page.textContent("#todoProgress"), /1 of 2 done/);
  assert.equal((await todos()).find(i => i.title === "Study Python").status, "done");
  await page.locator(".todo", { hasText: "Call teammate" }).locator(".tcheck").click();
  assert.match(await page.textContent("#todoProgress"), /2 of 2 done/);
  const inbox = (await ws(page)).inbox || (await page.evaluate(() => window.__DT_TEST__.state.inbox));
  const all = await page.evaluate(() => window.__DT_TEST__.state.inbox.map(n => n.text));
  assert.ok(all.some(t => /successfully completed all your tasks for today\. Great work!/.test(t)), all.join(" | "));
  await tab("done");
  assert.deepEqual((await titles()).sort(), ["Call teammate", "Study Python"]);
});

test("to-do: edit title, priority, status and reminder from the details panel", async () => {
  await open();
  await add("Finish homepage");
  await page.locator(".todo", { hasText: "Finish homepage" }).getByRole("button", { name: "Edit", exact: true }).click();
  await page.waitForSelector(".drawer.on");
  assert.equal(await page.isVisible("#dr-plan"), true);
  await page.fill("#dr-title", "Finish website homepage"); await page.locator("#dr-title").dispatchEvent("change");
  await page.selectOption("#dr-pri", "high");
  await page.selectOption("#dr-status", "doing");
  await page.fill("#dr-time", "16:00"); await page.locator("#dr-time").dispatchEvent("change");
  await page.click('[data-rem-opt="15"]');
  const it = (await todos())[0];
  assert.equal(it.title, "Finish website homepage"); assert.equal(it.priority, "high"); assert.equal(it.status, "doing");
  assert.equal(it.time, "16:00"); assert.ok(it.reminders.includes(15));
  assert.match(await page.locator("#dr-status option:checked").textContent(), /In progress/);
  await page.click("[data-act=drclose]");
  assert.match(await page.textContent(".todo"), /In progress/);
});

test("to-do: delete with undo, and move to tomorrow", async () => {
  await open();
  await add("Study Python"); await add("Call teammate");
  await page.locator(".todo", { hasText: "Study Python" }).locator("[data-act=tododel]").click();
  assert.deepEqual(await titles(), ["Call teammate"]);
  await page.click("#toastUndo");
  assert.equal((await todos()).length, 2);
  await page.locator(".todo", { hasText: "Call teammate" }).locator("[data-act=todotomorrow]").click();
  assert.equal((await todos()).find(i => i.title === "Call teammate").plan, "2026-10-31");
  assert.deepEqual(await titles(), ["Study Python"]);
});

test("to-do: Upcoming also lists upcoming deadlines, in the same day groups as tasks", async () => {
  await open({ demo: true });
  await tab("upcoming");
  const row = page.locator("#todoList .todo", { hasText: "DBMS normalization assignment" });
  assert.equal(await row.count(), 1);
  assert.match(await row.textContent(), /Due/);
});

test("to-do: plain to-dos stay out of deadline views, which keep working", async () => {
  await open({ demo: true });
  await add("Water the plants");
  for (const r of ["deadlines", "calendar", "planner", "reports", "overview"]) {
    await go(page, r);
    if (r === "deadlines") assert.doesNotMatch(await page.textContent(".list"), /Water the plants/);
  }
});

test("to-do: everything survives a reload", async () => {
  await open();
  await add("Study Python"); await page.locator(".todo .tcheck").first().click();
  await add("Call teammate tomorrow");
  await page.reload(); await page.waitForSelector("#app:not([hidden])");
  const t = await todos();
  assert.equal(t.length, 2);
  assert.equal(t.find(i => i.title === "Study Python").status, "done");
  assert.equal(t.find(i => i.title === "Call teammate").plan, "2026-10-31");
});

test("to-do: dates follow the local day just before midnight (time zone)", async () => {
  await open({ now: new Date("2026-10-30T23:50:00+05:30") });
  await add("Late task");
  await add("Early task tomorrow");
  const t = await todos();
  assert.equal(t.find(i => i.title === "Late task").plan, "2026-10-30");
  assert.equal(t.find(i => i.title === "Early task").plan, "2026-10-31");
});
