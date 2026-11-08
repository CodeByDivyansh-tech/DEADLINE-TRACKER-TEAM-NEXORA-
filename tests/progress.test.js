// Daily progress and history: today's totals and percentage, any past day, comparison with the day before,
// a 7-day chart, and saved day records that are never rewritten later.
const { test, before, after, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { setup, newPage, onboard, go, ws } = require("./helpers");

let env, page;
before(async () => { env = await setup(); });
after(async () => { await env.close(); });
afterEach(async () => { if (page) { assert.deepEqual(page.errors, [], "no errors in the browser"); await page.context().close(); page = null; } });

const IST = (d, h = 10) => new Date(`${d}T${String(h).padStart(2, "0")}:00:00+05:30`).toISOString();
async function open(seed) {
  page = await newPage(env); await onboard(page, { demo: false });
  if (seed) await page.evaluate(([list, log]) => {
    const T = window.__DT_TEST__; const w = T.W();
    for (const o of list) { const it = T.mkItem(w, { kind: "todo", title: o.t, plan: o.plan }); if (o.doneAt) { it.status = "done"; it.doneAt = o.doneAt; } w.items.push(it); }
    if (log) w.dayLog = log;
    T.save(); T.render();
  }, seed);
  await go(page, "daily");
}
const SEED = [[
  { t: "F", plan: "2026-10-27", doneAt: IST("2026-10-27") },
  { t: "A", plan: "2026-10-29", doneAt: IST("2026-10-29") }, { t: "B", plan: "2026-10-29" },
  { t: "C", plan: "2026-10-30", doneAt: IST("2026-10-30", 9) }, { t: "D", plan: "2026-10-30" }, { t: "E", plan: "2026-10-30" }
], null];
const txt = sel => page.textContent(sel);

test("today: total, completed, incomplete and percentage (completed / total × 100) with a bar", async () => {
  await open(SEED);
  const s = await txt("#dailyStats");
  assert.match(s, /3\s*Total/); assert.match(s, /1\s*Completed/); assert.match(s, /2\s*Incomplete/); assert.match(s, /33%/);
  assert.match(await txt("#dailyProgress"), /1 of 3 completed\s*[—-]\s*33%/);
  assert.equal(await page.$eval("#dailyBar", b => b.style.width), "33%");
  assert.match(await txt("#dailyOverdue"), /1 overdue/, "yesterday's open task is pointed out, not counted in today");
});

test("history: yesterday, a picked date, comparison with the day before, and the 7-day chart", async () => {
  await open(SEED);
  assert.match(await txt("#histStats"), /1 of 3 completed\s*[—-]\s*33%/, "starts on today");
  assert.match(await txt("#histCompare"), /down 17 points from Thu 29 Oct \(50%\)/i);
  await page.click("[data-act=histday][data-v=yesterday]");
  assert.match(await txt("#histTitle"), /Thursday, 29 October/);
  assert.match(await txt("#histStats"), /1 of 2 completed\s*[—-]\s*50%/);
  assert.match(await txt("#histCompare"), /no tasks on Wed 28 Oct/i);
  await page.fill("#histDate", "2026-10-27"); await page.dispatchEvent("#histDate", "change");
  assert.match(await txt("#histStats"), /1 of 1 completed\s*[—-]\s*100%/);
  const bars = await page.$$eval("#histChart [data-day]", b => b.map(x => [x.dataset.day, x.getAttribute("aria-label")]));
  assert.equal(bars.length, 7);
  assert.deepEqual(bars.map(b => b[0]), ["2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25", "2026-10-26", "2026-10-27"]);
  assert.match(bars[6][1], /Tue 27 Oct: 1 of 1 completed \(100%\)/);
  assert.match(bars[0][1], /no tasks/);
  await page.click("[data-act=histday][data-v=today]");
  const week = await page.$$eval("#histChart [data-day]", b => b.map(x => x.getAttribute("aria-label")));
  assert.match(week[5], /Thu 29 Oct: 1 of 2 completed \(50%\)/); assert.match(week[6], /Fri 30 Oct: 1 of 3 completed \(33%\)/);
  assert.equal(await page.$eval("#histDate", i => i.max), "2026-10-30", "no future days");
});

test("history: a saved day record is never rewritten; finishing an old task today counts for today", async () => {
  await open([SEED[0].concat([{ t: "G", plan: "2026-10-28", doneAt: IST("2026-10-28") }]), { "2026-10-28": { total: 4, done: 1 } }]);
  await page.fill("#histDate", "2026-10-28"); await page.dispatchEvent("#histDate", "change");
  assert.match(await txt("#histStats"), /1 of 4 completed\s*[—-]\s*25%/, "the saved record wins over today's view of the tasks");
  // finish yesterday's open task B today
  await page.click('#dailyOpen [aria-label="Mark as done: B"]');
  const w = await ws(page);
  assert.deepEqual(w.dayLog["2026-10-28"], { total: 4, done: 1 }, "past record unchanged");
  assert.deepEqual({ total: w.dayLog["2026-10-30"].total, done: w.dayLog["2026-10-30"].done }, { total: 4, done: 2 }, "today's record saved");
  assert.match(await txt("#dailyProgress"), /2 of 4 completed\s*[—-]\s*50%/);
  await page.click("[data-act=histday][data-v=yesterday]");
  assert.match(await txt("#histStats"), /1 of 2 completed\s*[—-]\s*50%/, "yesterday still shows B as not done that day");
  await page.reload(); await page.waitForSelector("#app:not([hidden])"); await go(page, "daily");
  assert.deepEqual((await ws(page)).dayLog["2026-10-28"], { total: 4, done: 1 }, "kept after reload");
});

test("history: moving a task to tomorrow takes it off today's total and is shown as moved", async () => {
  await open(SEED);
  await page.click('[aria-label="Move D to tomorrow"]');   // single-letter titles: pick the row by its button label
  assert.match(await txt("#dailyProgress"), /1 of 2 completed\s*[—-]\s*50%/);
  assert.match(await txt("#histStats"), /1 moved to another day/);
});

test("history: empty days say so plainly (no made-up numbers)", async () => {
  await open();
  assert.match(await txt("#dailyProgress"), /No tasks for today yet/);
  assert.match(await txt("#histStats"), /No tasks on this day/);
  assert.doesNotMatch(await txt("#histCard"), /NaN|undefined/);
});
