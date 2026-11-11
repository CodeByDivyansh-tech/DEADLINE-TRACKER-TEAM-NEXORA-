// Missed tasks and date-wise history (owner's brief, 11 Nov 2026, second version):
// a task not finished on its day is NOT carried to the next day. It leaves the Today and Daily lists and stays
// on its own day as "Missed" (History and Calendar). Nothing is deleted or copied; rescheduling keeps its history.
const { test, before, after, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { setup, newPage, onboard, go, ws } = require("./helpers");

let env, page;
before(async () => { env = await setup(); });
after(async () => { await env.close(); });
afterEach(async () => { if (page) { assert.deepEqual(page.errors, [], "no errors in the browser"); await page.context().close(); page = null; } });

const IST = (d, h = 10, m = 0) => new Date(`${d}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00+05:30`).toISOString();
async function open(list, log) {
  page = await newPage(env); await onboard(page, { demo: false });
  await page.evaluate(([list, log]) => {
    const T = window.__DT_TEST__; const w = T.W();
    for (const o of list || []) { const it = T.mkItem(w, { kind: "todo", title: o.t, plan: o.plan }); if (o.created) it.createdAt = o.created; if (o.doneAt) { it.status = "done"; it.doneAt = o.doneAt; } w.items.push(it); }
    if (log) w.dayLog = log;
    T.save(); T.render();
  }, [list, log || null]);
  await go(page, "daily");
}
// The brief's example, one day on: four tasks from yesterday (29 Oct) not finished, one finished yesterday.
const YDAY = [
  { t: "Python 5 lectures", plan: "2026-10-29", created: IST("2026-10-29", 8) }, { t: "Java 4 lectures and notes", plan: "2026-10-29", created: IST("2026-10-29", 8) },
  { t: "Chemistry 1.5 hours", plan: "2026-10-29", created: IST("2026-10-29", 8) }, { t: "Biology 1 hour", plan: "2026-10-29", created: IST("2026-10-29", 8) },
  { t: "Coursera Java", plan: "2026-10-29", created: IST("2026-10-29", 8), doneAt: IST("2026-10-29", 18) }
];
const txt = async sel => (await page.textContent(sel)).replace(/\s+/g, " ").trim();
const hist = st => page.$$eval(`#histList [data-st="${st}"]`, r => r.map(x => x.querySelector(".hl-t").textContent.trim()).sort());
const row = t => page.locator("#dailyOpen .dt-row", { hasText: t });


test("next day: missed tasks are not on the Today page or in Daily tasks; today's tasks are; nothing is deleted or copied", async () => {
  await open(YDAY.concat([{ t: "Java notes", plan: "2026-10-30" }, { t: "Maths practice", plan: "2026-10-30" }, { t: "Next week task", plan: "2026-11-05" }]));
  assert.deepEqual(await page.$$eval("#dailyOpen .dt-row .dt-t", r => r.map(x => x.textContent.trim())), ["Java notes", "Maths practice"]);
  assert.match(await txt("#dailyLater"), /1 planned for later days/);
  const s = await txt("#dailyStats");
  assert.match(s, /2\s*Total/); assert.match(s, /0\s*Completed/); assert.match(s, /2\s*Pending/);
  assert.doesNotMatch(await txt("#dailyList"), /Carried forward|Python 5 lectures/);
  assert.match(await txt("#dailyMissed"), /4 missed on earlier days/);
  await go(page, "overview");
  assert.deepEqual((await page.$$eval("#todayCard .todo .t", r => r.map(x => x.textContent.trim()))).sort(), ["Java notes", "Maths practice"]);
  assert.match(await txt("#todoProgress"), /0 of 2 done/);
  assert.doesNotMatch(await txt("#todayCard"), /Carried from/);
  const w = await ws(page);
  assert.equal(w.items.length, 8, "nothing deleted, nothing copied");
  for (const t of ["Python 5 lectures", "Java 4 lectures and notes", "Chemistry 1.5 hours", "Biology 1 hour"]) { const it = w.items.find(i => i.title === t); assert.equal(it.status, "todo"); assert.equal(it.plan, "2026-10-29", "still on its own day"); assert.equal(it.createdAt, IST("2026-10-29", 8)); }
  assert.equal(w.items.find(i => i.title === "Coursera Java").status, "done", "completed stays completed");
});

test("history: the missed day lists its tasks as Missed; today lists only today's", async () => {
  await open(YDAY.concat([{ t: "Java notes", plan: "2026-10-30" }, { t: "Read notes", plan: "2026-10-30", doneAt: IST("2026-10-30", 9) }]));
  assert.match(await txt("#histStats"), /1 of 2 completed — 50%/);
  assert.deepEqual(await hist("pending"), ["Java notes"]); assert.deepEqual(await hist("done"), ["Read notes"]);
  assert.match(await txt("#histList"), /Still pending/); assert.doesNotMatch(await txt("#histList"), /Missed|Carried/);
  await page.click("[data-act=histday][data-v=yesterday]");
  assert.match(await txt("#histStats"), /1 of 5 completed — 20%/);
  assert.deepEqual(await hist("done"), ["Coursera Java"]);
  assert.deepEqual(await hist("pending"), ["Biology 1 hour", "Chemistry 1.5 hours", "Java 4 lectures and notes", "Python 5 lectures"]);
  assert.match(await page.textContent("#histList .hl-g:has(+ ul li[data-st=pending])"), /Missed\s*4/);
  assert.ok((await page.$$eval('#histList li[data-st="pending"] .hl-m', r => r.map(x => x.textContent.trim()))).every(x => /^Missed/.test(x)));
});

test("calendar: a missed task stays on its own day marked Missed, and is not shown on today", async () => {
  await open(YDAY.concat([{ t: "Java notes", plan: "2026-10-30" }]));
  await go(page, "calendar");
  const cell = d => page.locator(`[data-day="${d}"]`);
  assert.match(await cell("2026-10-29").textContent(), /Python 5 lectures/);
  const ev = cell("2026-10-29").locator(".ev", { hasText: "Python 5 lectures" });
  assert.ok(await ev.evaluate(e => e.classList.contains("missed")));
  assert.match(await ev.getAttribute("aria-label"), /Missed/);
  assert.doesNotMatch(await cell("2026-10-30").textContent(), /Python 5 lectures|Biology/);
  assert.match(await cell("2026-10-30").textContent(), /Java notes/);
  assert.equal(await cell("2026-10-30").locator(".ev.missed").count(), 0, "today's own task isn't missed yet");
  // week view too
  await page.click("[data-act=calview][data-v=week]");
  assert.ok(await page.locator('[data-day="2026-10-29"] .wcard.missed').count() >= 1);
  assert.match(await page.locator('[data-day="2026-10-29"] .wcard.missed').first().textContent(), /Missed/);
});

test("a missed task finished later still belongs to its own day: not listed or counted on the day it was finished", async () => {
  await open(YDAY);
  await go(page, "calendar");
  await page.locator('[data-day="2026-10-29"] .ev', { hasText: "Python 5 lectures" }).click();
  await page.waitForSelector("#drawer [data-act=toggle]"); await page.locator("#drawer [data-act=toggle]").dispatchEvent("click");
  await page.keyboard.press("Escape");
  const it = (await ws(page)).items.find(i => i.title === "Python 5 lectures");
  assert.equal(it.status, "done"); assert.equal(it.plan, "2026-10-29"); assert.equal(it.doneAt.slice(0, 10), "2026-10-30");
  await go(page, "daily");
  assert.equal(await page.locator("#dailyDone .dt-row").count(), 0, "not in today's Completed");
  assert.match(await txt("#histStats"), /No tasks on this day/);
  await page.click("[data-act=histday][data-v=yesterday]");
  assert.match(await txt("#histStats"), /1 of 5 completed — 20%/, "not counted as done on the day it was missed");
  assert.match(await page.locator('#histList li[data-st="pending"]', { hasText: "Python 5 lectures" }).textContent(), /Missed · Finished Fri 30 Oct/);
  await go(page, "overview"); assert.doesNotMatch(await txt("#todayCard"), /Python 5 lectures/);
});

test("rescheduling keeps the movement history; the task leaves today's list and shows again on its new day", async () => {
  await open([{ t: "Chemistry 1.5 hours", plan: "2026-10-30", created: IST("2026-10-29", 8) }]);
  await row("Chemistry 1.5 hours").locator("[data-act=dailymove]").click();
  await page.fill("#dtMoveDate", "2026-11-04"); await page.click("[data-act=dailymovego]");
  let it = (await ws(page)).items.find(i => i.title === "Chemistry 1.5 hours");
  assert.equal(it.plan, "2026-11-04");
  assert.equal(it.moves.length, 1); assert.equal(it.moves[0].from, "2026-10-30"); assert.equal(it.moves[0].to, "2026-11-04"); assert.equal(it.moves[0].at.slice(0, 10), "2026-10-30");
  assert.equal(it.createdAt, IST("2026-10-29", 8));
  assert.equal(await row("Chemistry 1.5 hours").count(), 0, "it now belongs to 4 Nov");
  assert.match(await txt("#dailyLater"), /1 planned for later days/);
  assert.deepEqual(await hist("moved"), ["Chemistry 1.5 hours"]);
  assert.match(await page.locator('#histList [data-st="moved"]').textContent(), /Moved to Wed 4 Nov/);
  await page.clock.setFixedTime(new Date("2026-11-04T10:00:00+05:30"));
  await page.evaluate(() => { const T = window.__DT_TEST__; T.save(); T.render(); });
  const r = await row("Chemistry 1.5 hours").textContent();
  assert.match(r, /Rescheduled/); assert.match(r, /originally due Fri,? (Oct 30|30 Oct)/i);
  await row("Chemistry 1.5 hours").locator("[data-act=dailymove]").click();
  await page.fill("#dtMoveDate", "2026-11-06"); await page.click("[data-act=dailymovego]");
  it = (await ws(page)).items.find(i => i.title === "Chemistry 1.5 hours");
  assert.deepEqual(it.moves.map(m => [m.from, m.to]), [["2026-10-30", "2026-11-04"], ["2026-11-04", "2026-11-06"]]);
  assert.deepEqual(it.movedFrom, ["2026-10-30", "2026-11-04"]);
});

test("time zone: a task finished at 00:30 or 23:30 India time counts as done on its India day", async () => {
  await open([{ t: "Just after midnight", plan: "2026-10-30", doneAt: IST("2026-10-30", 0, 30) }, { t: "Late night revision", plan: "2026-10-29", doneAt: IST("2026-10-29", 23, 30) }]);
  assert.match(await txt("#histStats"), /1 of 1 completed/);
  assert.deepEqual(await page.$$eval("#dailyDone .dt-row .dt-t", r => r.map(x => x.textContent.trim())), ["Just after midnight"]);
  await page.click("[data-act=histday][data-v=yesterday]");
  assert.match(await txt("#histStats"), /1 of 1 completed/); assert.deepEqual(await hist("done"), ["Late night revision"]);
});

test("the day changes (app open, then reloaded): yesterday's unfinished tasks leave today's lists and stay in yesterday's record, even if deleted later", async () => {
  await open([]);
  for (const t of ["Keep me", "Delete me later", "Done one"]) { await page.fill("#dailyTitle", t); await page.click("#dailyAdd"); }
  await page.click('[aria-label="Mark as done: Done one"]');
  assert.equal(await row("Keep me").count(), 1, "today's task shows normally on its day");
  await page.clock.setFixedTime(new Date("2026-10-31T00:10:00+05:30"));   // just after midnight, India time
  await page.evaluate(() => { const T = window.__DT_TEST__; T.save(); T.render(); });
  assert.equal(await row("Keep me").count(), 0); assert.equal(await row("Delete me later").count(), 0);
  assert.match(await txt("#dailyStats"), /0\s*Total/);
  await page.fill("#histDate", "2026-10-30"); await page.dispatchEvent("#histDate", "change");
  assert.match(await txt("#histStats"), /1 of 3 completed — 33%/);
  assert.deepEqual(await hist("pending"), ["Delete me later", "Keep me"]);
  await page.evaluate(() => { const T = window.__DT_TEST__; const w = T.W(); w.items = w.items.filter(i => i.title !== "Delete me later"); T.save(); T.render(); });
  assert.deepEqual(await hist("pending"), ["Delete me later", "Keep me"], "the deleted task is still in that day's record");
  const rec = (await ws(page)).dayLog["2026-10-30"];
  assert.equal(rec.total, 3); assert.equal(rec.done, 1); assert.equal(rec.items.length, 3);
  await page.reload(); await page.waitForSelector("#app:not([hidden])"); await go(page, "daily");
  assert.deepEqual((await ws(page)).dayLog["2026-10-30"], rec, "never rewritten");
  assert.equal(await row("Keep me").count(), 0, "still hidden after a reload");
  assert.equal((await ws(page)).items.find(i => i.title === "Keep me").plan, "2026-10-30");
  await go(page, "overview"); assert.match(await txt("#todoProgress"), /0 of 0 done/);
});

test("older saved records: numbers-only records keep their numbers; records saved with carried tasks no longer list them", async () => {
  await open(YDAY, { "2026-10-28": { total: 4, done: 1 }, "2026-10-27": { total: 3, done: 1, moved: 0, items: [["a", "Done then", "d", ""], ["b", "Its own task", "p", ""], ["c", "Carried in", "p", "2026-10-26"]] } });
  await page.fill("#histDate", "2026-10-28"); await page.dispatchEvent("#histDate", "change");
  assert.match(await txt("#histStats"), /1 of 4 completed — 25%/);
  assert.match(await txt("#histNote"), /saved before task lists were kept/i);
  await page.fill("#histDate", "2026-10-27"); await page.dispatchEvent("#histDate", "change");
  assert.match(await txt("#histStats"), /1 of 2 completed — 50%/);
  assert.deepEqual(await hist("pending"), ["Its own task"]);
  assert.deepEqual((await ws(page)).dayLog["2026-10-28"], { total: 4, done: 1 });
});

test("tasks moved before move times were kept: only a task whose day is later counts as 'moved' today", async () => {
  await open([{ t: "Back and forth", plan: "2026-10-29" }, { t: "Really moved", plan: "2026-11-02" }]);
  await page.evaluate(() => { const T = window.__DT_TEST__; const w = T.W();
    w.items.find(i => i.title === "Back and forth").movedFrom = ["2026-10-28", "2026-10-30"];
    w.items.find(i => i.title === "Really moved").movedFrom = ["2026-10-30"]; T.save(); T.render(); });
  assert.match(await txt("#dailyStats"), /0\s*Total/);
  assert.deepEqual(await hist("pending"), []);
  assert.deepEqual(await hist("moved"), ["Really moved"]);
  await page.click("[data-act=histday][data-v=yesterday]");
  assert.deepEqual(await hist("pending"), ["Back and forth"]);
});

test("deadlines are not hidden: an overdue deadline still shows on the Today page", async () => {
  await open([]);
  await page.evaluate(() => { const T = window.__DT_TEST__; const w = T.W(); w.items.push(T.mkItem(w, { title: "Submit lab file", due: "2026-10-29T17:00" })); T.save(); T.render(); });
  await go(page, "overview");
  assert.match(await txt("#todayCard"), /Submit lab file/);
  assert.match(await txt("#todayCard"), /Overdue/);
});

test("the owner's example: today's to-do list shows only tasks scheduled for today, pending and completed; yesterday's completed tasks stay in yesterday", async () => {
  await open([
    { t: "Chemistry study", plan: "2026-10-29", doneAt: IST("2026-10-29", 17) }, { t: "Python practice", plan: "2026-10-29", doneAt: IST("2026-10-29", 19) },
    { t: "Java notes", plan: "2026-10-30" }, { t: "Maths practice", plan: "2026-10-30", doneAt: IST("2026-10-30", 9) }]);
  const names = id => page.$$eval(`#${id} .dt-row .dt-t`, r => r.map(x => x.textContent.trim()));
  assert.deepEqual(await names("dailyOpen"), ["Java notes"]);
  assert.deepEqual(await names("dailyDone"), ["Maths practice"]);
  assert.match(await txt("#dailyOpenH"), /Pending 1/); assert.match(await txt("#dailyDoneH"), /Completed 1/);
  assert.doesNotMatch(await txt("#dailyList"), /Chemistry study|Python practice/);
  assert.match(await txt("#dailyProgress"), /1 of 2 completed — 50%/);
  await page.click("[data-act=histday][data-v=yesterday]");
  assert.match(await txt("#histStats"), /2 of 2 completed — 100%/);
  assert.deepEqual(await hist("done"), ["Chemistry study", "Python practice"]);
  await go(page, "overview");
  assert.deepEqual((await page.$$eval("#todayCard .todo .t", r => r.map(x => x.textContent.trim()))).sort(), ["Java notes", "Maths practice"]);
  await go(page, "calendar");
  assert.match(await page.textContent('[data-day="2026-10-29"]'), /Chemistry study/);
  assert.doesNotMatch(await page.textContent('[data-day="2026-10-30"]'), /Chemistry study|Python practice/);
  const w = await ws(page); assert.equal(w.items.length, 4);
  for (const t of ["Chemistry study", "Python practice"]) { const it = w.items.find(i => i.title === t); assert.equal(it.status, "done"); assert.equal(it.plan, "2026-10-29"); }
});

test("a task moved to another day and finished there belongs to that day; the day does not come from when it was ticked", async () => {
  // like "coursera java" on the live site: first planned for the 28th, moved to the 29th, done on the 29th
  await open([{ t: "Coursera Java", plan: "2026-10-29", doneAt: IST("2026-10-29", 18) }, { t: "Done early", plan: "2026-10-31", doneAt: IST("2026-10-30", 9) }]);
  await page.evaluate(() => { const T = window.__DT_TEST__; T.W().items.find(i => i.title === "Coursera Java").movedFrom = ["2026-10-28"]; T.save(); T.render(); });
  assert.equal(await page.locator("#dailyDone .dt-row").count(), 0);
  assert.match(await txt("#histStats"), /No tasks on this day/, "a task planned for tomorrow and ticked today still belongs to tomorrow");
  await page.click("[data-act=histday][data-v=yesterday]");
  assert.deepEqual(await hist("done"), ["Coursera Java"]);
});
