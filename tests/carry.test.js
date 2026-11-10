// Smart carry-forward and date-wise history (owner's brief, 11 Nov 2026):
// unfinished tasks show on the next day as "Carried forward" with their original day, never as copies;
// completing one completes the original; rescheduling keeps a movement history; History lists each day's tasks.
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

test("next day: unfinished tasks are in today's list as 'Carried forward' with their original day; counted in today; no copies", async () => {
  await open(YDAY);
  for (const t of ["Python 5 lectures", "Java 4 lectures and notes", "Chemistry 1.5 hours", "Biology 1 hour"]) {
    const r = await row(t).textContent();
    assert.match(r, /Carried forward/); assert.match(r, /originally due Thu,? (Oct 29|29 Oct)/i);
  }
  const s = await txt("#dailyStats");
  assert.match(s, /4\s*Total/); assert.match(s, /0\s*Completed/); assert.match(s, /4\s*Pending/);
  assert.match(await txt("#dailyOverdue"), /4 carried forward from earlier days/);
  assert.equal((await ws(page)).items.length, 5, "no duplicates");
  assert.match(await txt("#histStats"), /0 of 4 completed/);
  assert.deepEqual(await hist("pending"), ["Biology 1 hour", "Chemistry 1.5 hours", "Java 4 lectures and notes", "Python 5 lectures"]);
  assert.match(await txt("#histList"), /Carried from Thu 29 Oct/);
  // the Today page counts the same tasks
  await go(page, "overview"); assert.match(await txt("#todoProgress"), /0 of 4 done/);
});

test("completing a carried task completes the original (same task); history shows it done today and not done on its first day", async () => {
  await open(YDAY);
  const before = (await ws(page)).items.find(i => i.title === "Biology 1 hour");
  await page.click('[aria-label="Mark as done: Biology 1 hour"]');
  const w = await ws(page); const it = w.items.find(i => i.title === "Biology 1 hour");
  assert.equal(w.items.length, 5); assert.equal(it.id, before.id); assert.equal(it.status, "done");
  assert.equal(it.createdAt, before.createdAt, "creation date untouched"); assert.equal(it.plan, "2026-10-29", "its day is not rewritten");
  assert.equal(it.doneAt.slice(0, 10), "2026-10-30");
  assert.equal(await row("Biology 1 hour").count(), 0, "gone from Pending");
  assert.match(await txt("#dailyProgress"), /1 of 4 completed — 25%/);
  assert.deepEqual(await hist("done"), ["Biology 1 hour"]);
  assert.match(await page.locator('#histList [data-st="done"]').textContent(), /Carried from Thu 29 Oct/);
  await page.click("[data-act=histday][data-v=yesterday]");
  assert.match(await txt("#histStats"), /1 of 5 completed — 20%/);
  assert.deepEqual(await hist("done"), ["Coursera Java"]);
  assert.deepEqual(await hist("pending"), ["Biology 1 hour", "Chemistry 1.5 hours", "Java 4 lectures and notes", "Python 5 lectures"], "not falsely done on 29 Oct");
  assert.match(await txt("#histList"), /Finished Fri 30 Oct/);
});

test("rescheduling keeps the movement history: when, from and to; the day it left shows it as moved", async () => {
  await open(YDAY);
  await row("Chemistry 1.5 hours").locator("[data-act=dailymove]").click();
  await page.fill("#dtMoveDate", "2026-11-04"); await page.click("[data-act=dailymovego]");
  let it = (await ws(page)).items.find(i => i.title === "Chemistry 1.5 hours");
  assert.equal(it.plan, "2026-11-04");
  assert.equal(it.moves.length, 1); assert.equal(it.moves[0].from, "2026-10-29"); assert.equal(it.moves[0].to, "2026-11-04"); assert.equal(it.moves[0].at.slice(0, 10), "2026-10-30");
  assert.equal(it.createdAt, IST("2026-10-29", 8));
  const r = await row("Chemistry 1.5 hours").textContent();
  assert.match(r, /Rescheduled/); assert.match(r, /originally due Thu,? (Oct 29|29 Oct)/i); assert.doesNotMatch(r, /Carried forward/);
  assert.match(await txt("#dailyStats"), /3\s*Total/);
  assert.deepEqual(await hist("moved"), ["Chemistry 1.5 hours"]);
  assert.match(await page.locator('#histList [data-st="moved"]').textContent(), /Moved to Wed 4 Nov/);
  // a second move adds to the history
  await row("Chemistry 1.5 hours").locator("[data-act=dailymove]").click();
  await page.fill("#dtMoveDate", "2026-11-06"); await page.click("[data-act=dailymovego]");
  it = (await ws(page)).items.find(i => i.title === "Chemistry 1.5 hours");
  assert.deepEqual(it.moves.map(m => [m.from, m.to]), [["2026-10-29", "2026-11-04"], ["2026-11-04", "2026-11-06"]]);
  assert.deepEqual(it.movedFrom, ["2026-10-29", "2026-11-04"]);
  await page.click("[data-act=histday][data-v=yesterday]");
  assert.deepEqual(await hist("pending"), ["Biology 1 hour", "Chemistry 1.5 hours", "Java 4 lectures and notes", "Python 5 lectures"], "on 29 Oct it was still that day's unfinished task");
});

test("a day's history: scheduled for the day, carried in, completed and still pending are all listed", async () => {
  await open(YDAY.concat([{ t: "Maths practice", plan: "2026-10-30" }, { t: "Read notes", plan: "2026-10-30", doneAt: IST("2026-10-30", 9) }, { t: "Next week task", plan: "2026-11-05" }]));
  await page.click('[aria-label="Mark as done: Python 5 lectures"]');
  assert.match(await txt("#histStats"), /2 of 6 completed — 33%/);
  assert.deepEqual(await hist("done"), ["Python 5 lectures", "Read notes"]);
  assert.deepEqual(await hist("pending"), ["Biology 1 hour", "Chemistry 1.5 hours", "Java 4 lectures and notes", "Maths practice"]);
  assert.match(await txt("#histSum"), /2 scheduled for this day/); assert.match(await txt("#histSum"), /4 carried forward/);
  assert.doesNotMatch(await txt("#histList"), /Next week task/);
  const tags = await page.$$eval("#histList li", r => Object.fromEntries(r.map(x => [x.querySelector(".hl-t").textContent.trim(), x.querySelector(".hl-m").textContent.trim()])));
  assert.match(tags["Maths practice"], /Scheduled/); assert.match(tags["Biology 1 hour"], /Carried from Thu 29 Oct/);
});

test("time zone: a task finished at 00:30 India time counts for that India day, not the day before", async () => {
  await open([{ t: "Late night revision", plan: "2026-10-29", doneAt: IST("2026-10-30", 0, 30) }]);
  assert.match(await txt("#histStats"), /1 of 1 completed/);
  await page.click("[data-act=histday][data-v=yesterday]");
  assert.match(await txt("#histStats"), /0 of 1 completed/);
});

test("the day changes while the app is open: yesterday's record is kept with its task list, even after a task is deleted", async () => {
  await open([]);
  for (const t of ["Keep me", "Delete me later", "Done one"]) { await page.fill("#dailyTitle", t); await page.click("#dailyAdd"); }
  await page.click('[aria-label="Mark as done: Done one"]');
  await page.clock.setFixedTime(new Date("2026-10-31T09:00:00+05:30"));
  await page.evaluate(() => { const T = window.__DT_TEST__; T.save(); T.render(); });
  assert.match(await row("Keep me").textContent(), /Carried forward/);
  assert.match(await txt("#dailyStats"), /2\s*Total/);
  await row("Delete me later").locator("[data-act=dailydel]").click();
  await page.fill("#histDate", "2026-10-30"); await page.dispatchEvent("#histDate", "change");
  assert.match(await txt("#histStats"), /1 of 3 completed — 33%/);
  assert.deepEqual(await hist("pending"), ["Delete me later", "Keep me"], "the deleted task is still in that day's record");
  const rec = (await ws(page)).dayLog["2026-10-30"];
  assert.equal(rec.total, 3); assert.equal(rec.done, 1); assert.equal(rec.items.length, 3);
  await page.reload(); await page.waitForSelector("#app:not([hidden])"); await go(page, "daily");
  assert.deepEqual((await ws(page)).dayLog["2026-10-30"], rec, "never rewritten");
});

test("older saved records (numbers only) keep their numbers", async () => {
  await open(YDAY, { "2026-10-28": { total: 4, done: 1 } });
  await page.fill("#histDate", "2026-10-28"); await page.dispatchEvent("#histDate", "change");
  assert.match(await txt("#histStats"), /1 of 4 completed — 25%/);
  assert.match(await txt("#histNote"), /saved before task lists were kept/i);
  assert.deepEqual((await ws(page)).dayLog["2026-10-28"], { total: 4, done: 1 });
});

test("calendar: a carried task shows on today (marked) and stays on its first day; one task in the data", async () => {
  await open(YDAY);
  await go(page, "calendar");
  assert.match(await page.textContent('[data-day="2026-10-30"]'), /Python 5 lectures/);
  assert.ok(await page.locator('[data-day="2026-10-30"] .ev.carried').count() >= 1);
  assert.match(await page.textContent('[data-day="2026-10-29"]'), /Python 5 lectures/, "still on its first day");
  assert.equal((await ws(page)).items.filter(i => i.title === "Python 5 lectures").length, 1);
});
