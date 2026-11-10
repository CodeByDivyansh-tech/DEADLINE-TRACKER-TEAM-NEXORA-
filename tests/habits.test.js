// Habit Tracker: own habits, a daily checklist with undo, each date saved separately, month grid, weekly view,
// per-habit percentages, streaks, and statistics that come only from saved data.
const { test, before, after, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { setup, newPage, onboard, go, ws } = require("./helpers");

let env, page;
before(async () => { env = await setup(); });
after(async () => { await env.close(); });
afterEach(async () => { if (page) { assert.deepEqual(page.errors, [], "no errors in the browser"); await page.context().close(); page = null; } });

const range = (a, b) => Array.from({ length: b - a + 1 }, (_, k) => `2026-10-${String(a + k).padStart(2, "0")}`);
async function open(habits, opts = {}) {
  page = await newPage(env, opts); await onboard(page, { demo: false });
  if (habits) await page.evaluate(list => {
    const T = window.__DT_TEST__; const w = T.W();
    w.habits = list.map((h, k) => ({ id: "h" + k, name: h.name, createdAt: h.created || "2026-10-01T08:00:00+05:30", archivedAt: h.archived || null, days: Object.fromEntries((h.days || []).map(d => [d, 1])) }));
    T.save(); T.render();
  }, habits);
  await go(page, "habits");
}
const txt = async sel => (await page.textContent(sel)).replace(/\s+/g, " ").trim();
const addHabit = async n => { await page.fill("#habitName", n); await page.click("#habitAdd"); await page.waitForSelector(`#habitToday .hb-row:has-text("${n}")`); };
const hrow = n => page.locator("#habitToday .hb-row", { hasText: n });
const habit = async n => (await ws(page)).habits.find(h => h.name === n);

test("a 'Habit Tracker' page in the sidebar; add habits with the button or Enter; an empty name is refused", async () => {
  await open();
  assert.equal((await page.textContent("#side a[data-route=habits]")).trim(), "Habit Tracker");
  assert.equal(await page.textContent("#pageTitle"), "Habit Tracker");
  assert.match(await txt("#habitToday"), /No habits yet/);
  await page.click("#habitAdd"); assert.match(await page.textContent("#toastMsg"), /name/i);
  await addHabit("Wake up early"); await addHabit("Study Java");
  await page.fill("#habitName", "Exercise"); await page.press("#habitName", "Enter"); await page.waitForSelector('#habitToday .hb-row:has-text("Exercise")');
  assert.deepEqual(await page.$$eval("#habitToday .hb-row .hb-n", r => r.map(x => x.textContent.trim())), ["Wake up early", "Study Java", "Exercise"]);
  const s = await txt("#habitStats");
  assert.match(s, /3\s*Active habits/); assert.match(s, /0 of 3\s*Done today/);
  await page.fill("#habitName", "study java"); await page.click("#habitAdd");
  assert.match(await page.textContent("#toastMsg"), /already have/i);
  assert.equal((await ws(page)).habits.length, 3);
});

test("one click completes a habit for today, another click undoes it; it is saved and survives a reload", async () => {
  await open([{ name: "Read books" }, { name: "Practice English" }]);
  await hrow("Read books").locator(".dt-check").click();
  assert.equal(await hrow("Read books").locator(".dt-check").getAttribute("aria-pressed"), "true");
  assert.match(await txt("#habitStats"), /1 of 2\s*Done today/);
  assert.deepEqual(Object.keys((await habit("Read books")).days), ["2026-10-30"]);
  await page.reload(); await page.waitForSelector("#app:not([hidden])"); await go(page, "habits");
  assert.equal(await hrow("Read books").locator(".dt-check").getAttribute("aria-pressed"), "true");
  await hrow("Read books").locator(".dt-check").click();
  assert.equal(await hrow("Read books").locator(".dt-check").getAttribute("aria-pressed"), "false");
  assert.deepEqual(Object.keys((await habit("Read books")).days), []);
  assert.match(await txt("#habitStats"), /0 of 2\s*Done today/);
});

test("each date is saved separately: the month grid ticks past days, future days are locked", async () => {
  await open([{ name: "Practice Python", created: "2026-10-30T08:00:00+05:30" }, { name: "Exercise", created: "2026-10-30T08:00:00+05:30" }]);
  assert.equal(await txt("#habitMonth"), "October 2026");
  const cell = (n, d) => page.locator(`#habitGrid tr[data-id]:has-text("${n}") [data-day="${d}"]`);
  await cell("Practice Python", "2026-10-28").click(); await cell("Practice Python", "2026-10-29").click(); await cell("Practice Python", "2026-10-30").click();
  assert.deepEqual(Object.keys((await habit("Practice Python")).days).sort(), ["2026-10-28", "2026-10-29", "2026-10-30"]);
  assert.deepEqual(Object.keys((await habit("Exercise")).days), []);
  assert.equal(await cell("Practice Python", "2026-10-29").getAttribute("aria-pressed"), "true");
  assert.ok(await cell("Practice Python", "2026-10-31").isDisabled(), "tomorrow can't be ticked");
  assert.equal(await hrow("Practice Python").locator(".dt-check").getAttribute("aria-pressed"), "true", "today's tick shows in the checklist too");
  assert.match(await hrow("Practice Python").textContent(), /3-day streak/);
  // percentages count from the first day a habit was tracked
  const rank = await txt("#habitRank");
  assert.match(rank, /Practice Python 100% 3 of 3 days/); assert.match(rank, /Exercise 0% 0 of 1 days/);
  assert.match(await page.getAttribute('#habitGrid .hb-bar[data-day="2026-10-29"]', "aria-label"), /Thu 29 Oct: 1 of 1 habits \(100%\)/);
  assert.match(await page.getAttribute('#habitGrid .hb-bar[data-day="2026-10-30"]', "aria-label"), /Fri 30 Oct: 1 of 2 habits \(50%\)/);
  await cell("Practice Python", "2026-10-29").click();
  assert.deepEqual(Object.keys((await habit("Practice Python")).days).sort(), ["2026-10-28", "2026-10-30"], "undo for one day only");
});

test("streaks: the current run (today or up to yesterday) and the best run", async () => {
  await open([{ name: "Study Java", days: range(20, 24).concat(range(28, 29)) }]);
  assert.match(await hrow("Study Java").textContent(), /2-day streak/);
  assert.match(await txt("#habitRank"), /Streak 2 · Best 5/);
  await hrow("Study Java").locator(".dt-check").click();
  assert.match(await hrow("Study Java").textContent(), /3-day streak/);
  await page.evaluate(() => { const T = window.__DT_TEST__; delete T.W().habits[0].days["2026-10-29"]; delete T.W().habits[0].days["2026-10-30"]; T.save(); T.render(); });
  assert.match(await txt("#habitRank"), /Streak 0 · Best 5/);
  assert.doesNotMatch(await hrow("Study Java").textContent(), /streak/);
});

test("edit, archive (history kept), restore, and delete with undo", async () => {
  await open([{ name: "Wake up early", days: range(26, 29) }, { name: "Read books" }]);
  await hrow("Wake up early").locator("[data-act=habitedit]").click();
  await page.fill("#hbEditName", "Wake up at 6"); await page.click("[data-act=habitsave]");
  assert.equal((await ws(page)).habits[0].name, "Wake up at 6");
  await hrow("Wake up at 6").locator("[data-act=habitarchive]").click();
  assert.equal(await hrow("Wake up at 6").count(), 0);
  assert.match(await txt("#habitStats"), /1\s*Active habits/);
  let h = await habit("Wake up at 6"); assert.ok(h.archivedAt); assert.equal(Object.keys(h.days).length, 4, "its history is kept");
  await page.click("#habitArchived summary");
  await page.locator("#habitArchived .hb-row", { hasText: "Wake up at 6" }).locator("[data-act=habitrestore]").click();
  assert.equal(await hrow("Wake up at 6").count(), 1); assert.equal((await habit("Wake up at 6")).archivedAt, null);
  await hrow("Read books").locator("[data-act=habitdel]").click();
  assert.equal((await ws(page)).habits.length, 1);
  await page.click("#toastUndo");
  assert.equal((await ws(page)).habits.length, 2);
});

test("statistics come from the saved ticks: month and week percentages, weeks of the month, best and weakest habits", async () => {
  await open([{ name: "Alpha", days: range(1, 25) }, { name: "Beta", days: range(1, 15) }, { name: "Gamma", days: range(1, 3) }]);
  // October so far: 30 days × 3 habits = 90 chances, 43 done
  assert.match(await txt("#habitStats"), /48%\s*This month/);
  // this week (Mon 26 – Fri 30): no ticks → 0%
  assert.match(await txt("#habitStats"), /0%\s*This week/);
  const rank = await txt("#habitRank");
  assert.match(rank, /Alpha 83% 25 of 30 days/); assert.match(rank, /Beta 50% 15 of 30 days/); assert.match(rank, /Gamma 10% 3 of 30 days/);
  assert.deepEqual(await page.$$eval("#habitBest li b", r => r.map(x => x.textContent.trim())), ["Alpha", "Beta"]);
  assert.deepEqual(await page.$$eval("#habitNeeds li b", r => r.map(x => x.textContent.trim())), ["Gamma"]);
  const weeks = await page.$$eval("#habitWeeks .hb-week", r => r.map(x => x.textContent.replace(/\s+/g, " ").trim()));
  assert.equal(weeks.length, 5);
  assert.match(weeks[0], /Week 1 1–4 Oct 92%/);   // 4 + 4 + 3 of 12
  assert.match(weeks[4], /Week 5 26–31 Oct 0%/);
  // earlier month: nothing tracked there
  await page.click("[data-act=habitprev]");
  assert.equal(await txt("#habitMonth"), "September 2026");
  assert.equal(await page.locator("#habitGrid thead th[data-day]").count(), 30);
  assert.match(await txt("#habitRank"), /Not tracked in this month/);
  await page.click("[data-act=habitnext]");
  assert.ok(await page.locator("[data-act=habitnext]").isDisabled(), "no future months");
});

test("no made-up numbers: with nothing tracked the page says so", async () => {
  await open([{ name: "New habit", created: "2026-10-30T08:00:00+05:30" }]);
  assert.match(await txt("#habitBest"), /Track for at least 3 days/);
  assert.doesNotMatch(await txt("#view"), /NaN|undefined|Infinity/);
});

test("phone (390 px): the page doesn't scroll sideways (the month grid scrolls inside its card); found under More", async () => {
  await open([{ name: "Alpha", days: range(1, 25) }, { name: "A habit with quite a long name to wrap", days: range(1, 5) }], { viewport: { width: 390, height: 844 } });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "no sideways scrolling");
  assert.ok(await page.$eval("#habitGridWrap", e => e.scrollWidth > e.clientWidth && getComputedStyle(e).overflowX === "auto"));
  const b = await hrow("Alpha").locator(".dt-check").boundingBox(); assert.ok(b.width >= 28 && b.height >= 28);
  await page.click("[data-act=morenav]");
  assert.ok(await page.locator('a[data-route=habits]:visible').count() >= 1);
});

test("both themes: habit names and numbers are readable (contrast 4.5:1 or more)", async () => {
  await open([{ name: "Alpha", days: range(1, 25) }]);
  for (const t of ["light", "dark"]) {
    await page.evaluate(t => document.documentElement.setAttribute("data-theme", t), t); await page.waitForTimeout(350);
    const bad = await page.evaluate(() => {
      const lum = c => { const [r, g, b] = c.match(/[\d.]+/g).slice(0, 3).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }); return .2126 * r + .7152 * g + .0722 * b; };
      const bg = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
      const probe = document.createElement("i"); probe.style.color = bg; document.body.append(probe); const bgc = getComputedStyle(probe).color; probe.remove();
      return [...document.querySelectorAll("#view .hb-n, #habitStats b, #habitStats span, #habitRank .hr-p, #habitRank .hr-s, #habitMonth")].map(e => { const a = lum(getComputedStyle(e).color), b = lum(bgc); return [e.textContent.trim().slice(0, 20), (Math.max(a, b) + .05) / (Math.min(a, b) + .05)]; }).filter(x => x[1] < 4.5);
    });
    assert.deepEqual(bad, [], t);
  }
});
