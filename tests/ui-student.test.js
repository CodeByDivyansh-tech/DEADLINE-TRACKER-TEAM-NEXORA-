// Student workflows end to end, through the real interface.
const { test, before, after, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { setup, newPage, onboard, go, ws, itemByTitle } = require("./helpers");

let env, page;
before(async () => { env = await setup(); });
after(async () => { await env.close(); });
beforeEach(async () => { page = await newPage(env); });
afterEach(async () => { assert.deepEqual(page.errors, [], "no errors in the browser"); await page.context().close(); });

test("onboarding with sample data lands on a working student dashboard", async () => {
  await onboard(page, { mode: "student", demo: true });
  await page.waitForTimeout(700);
  assert.match(await page.textContent(".hello h2"), /Divyansh/);
  assert.ok(await page.locator("#nextDl .nd-row").count() >= 3, "next deadlines listed");
  assert.equal(await page.locator("#todayCard").count(), 1);
  await go(page, "deadlines");
  assert.ok(await page.locator(".radar .blip").count() > 3, "radar shows deadlines");
  await go(page, "overview");
  assert.equal(await page.textContent("#pageTitle"), "Today");
});

test("starting empty shows a helpful empty state and the first deadline can be added in seconds", async () => {
  await onboard(page, { mode: "student", demo: false });
  await go(page, "deadlines");
  assert.match(await page.textContent(".list .empty"), /No deadlines yet/);
  await page.click(".list .empty [data-act=qa]");
  await page.fill("#qaText", "DBMS assignment due tomorrow 5pm ~3h");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(150);
  const it = await itemByTitle(page, "DBMS assignment");
  assert.ok(it, "item created");
  assert.equal(it.due, "2026-10-31T17:00");
  assert.equal(it.estimate, 3);
  assert.equal(await page.locator(".list .item").count(), 1);
});

test("the Add box reads natural language and says what it understood before saving", async () => {
  await onboard(page);
  await page.keyboard.press("n");
  await page.fill("#qaText", "Submit DBMS assignment due next Friday at 5 PM ~4h");
  const h = await page.textContent("#qaText-hint");
  assert.match(h, /Submit DBMS assignment/); assert.match(h, /Deadline/); assert.match(h, /6 Nov/); assert.match(h, /5:00\s?pm/i); assert.match(h, /4h/);
  await page.press("#qaText", "Enter");
  const it = await itemByTitle(page, "Submit DBMS assignment");
  assert.equal(it.due, "2026-11-06T17:00"); assert.equal(it.estimate, 4);
});

test("completing a deadline moves it to Completed, and Undo brings it back", async () => {
  await onboard(page);
  await go(page, "deadlines");
  const title = await page.locator(".list .item .t").first().textContent();
  await page.locator(".list .item .check").first().click();
  let it = await itemByTitle(page, title);
  assert.equal(it.status, "done"); assert.ok(it.doneAt);
  await page.click("#toastUndo");
  it = await itemByTitle(page, title);
  assert.notEqual(it.status, "done"); assert.equal(it.doneAt, null);
});

test("completing a repeating deadline creates the next one; Undo removes it", async () => {
  await onboard(page, { demo: false });
  await page.click("#qaBtn");
  await page.fill("#qaText", "Lab sheet due tomorrow 5pm every week");
  await page.press("#qaText", "Enter");
  await go(page, "deadlines");
  await page.locator(".list .item .check").first().click();
  let items = (await ws(page)).items.filter(i => i.title === "Lab sheet");
  assert.equal(items.length, 2);
  assert.ok(items.some(i => i.due === "2026-11-07T17:00" && i.status !== "done"));
  await page.click("#toastUndo");
  items = (await ws(page)).items.filter(i => i.title === "Lab sheet");
  assert.equal(items.length, 1);
  assert.notEqual(items[0].status, "done");
});

test("changing the deadline in details is recorded in Activity", async () => {
  await onboard(page);
  await go(page, "deadlines");
  await page.locator(".list .item .body").first().click();
  await page.waitForSelector(".drawer.on");
  await page.fill("#dr-date", "2026-11-25");
  await page.locator("#dr-date").dispatchEvent("change");
  await page.waitForTimeout(80);
  await page.click("[data-act=tab][data-v=activity]");
  assert.match(await page.textContent(".act-log"), /Changed the deadline/);
});

test("backward plan: suggest, accept, and the hard deadline stays the same", async () => {
  await onboard(page);
  const essay = await itemByTitle(page, "English essay: climate and cities");
  await page.evaluate(id => { location.hash = "deadlines"; }, essay.id);
  await page.waitForTimeout(120);
  await page.locator(".item", { hasText: "English essay" }).first().locator(".body").click();
  await page.click("[data-act=tab][data-v=plan]");
  await page.click("[data-act=suggest]");
  assert.equal(await page.locator(".sug-box li.sug").count(), 4);
  // untick one step before adding
  await page.locator("[data-sk]").nth(2).uncheck();
  await page.click("[data-act=sugaccept]");
  const after = await itemByTitle(page, "English essay: climate and cities");
  assert.equal(after.milestones.length, 3);
  assert.equal(after.due, essay.due);
});

test("rescue mode on an overdue deadline adds steps and logs an extension request without moving the deadline", async () => {
  await onboard(page);
  await go(page, "deadlines");
  const late = await itemByTitle(page, "Physics lab report: simple pendulum");
  await page.locator(".item", { hasText: "Physics lab report" }).first().locator("[data-act=rescue]").click();
  await page.waitForSelector(".rescue-steps");
  await page.click("[data-act=rsChunk]");
  await page.click("[data-act=rsLogExt]");
  const it = await itemByTitle(page, "Physics lab report: simple pendulum");
  assert.ok(it.milestones.length >= 2);
  assert.ok(it.extension && it.extension.requested);
  assert.equal(it.due, late.due);
  assert.ok(it.log.some(l => /extension/i.test(l.text)));
});

test("calendar: dragging a deadline to another day moves it; Undo restores it", async () => {
  await onboard(page);
  await go(page, "calendar");
  const ev = page.locator(".mday:not(.out) .ev:not(.done)").first();
  const id = await ev.getAttribute("data-id");
  const before = (await ws(page)).items.find(i => i.id === id).due;
  await page.dragAndDrop(`.ev[data-drag="${id}"]`, '.mday[data-day="2026-11-04"] .dh');
  let due = (await ws(page)).items.find(i => i.id === id).due;
  assert.equal(due.slice(0, 10), "2026-11-04");
  assert.equal(due.slice(11), before.slice(11), "time of day kept");
  await page.click("#toastUndo");
  due = (await ws(page)).items.find(i => i.id === id).due;
  assert.equal(due, before);
});

test("search narrows the list", async () => {
  await onboard(page);
  await go(page, "deadlines");
  await page.fill("#listSearch", "scholarship");
  await page.waitForTimeout(80);
  const titles = await page.$$eval(".list .item .t", xs => xs.map(x => x.textContent));
  assert.deepEqual(titles, ["Merit scholarship application"]);
  assert.equal(await page.inputValue("#listSearch"), "scholarship", "search box keeps its text");
});

test("data survives a reload", async () => {
  await onboard(page);
  const n = (await ws(page)).items.length;
  await page.reload();
  await page.waitForSelector("#app:not([hidden])");
  assert.equal((await ws(page)).items.length, n);
  assert.equal(await page.isHidden("#onb"), true);
});

test("changing study hours changes the planner", async () => {
  await onboard(page);
  await go(page, "prefs");
  await page.click("[data-act=settab][data-v=s-avail]");
  await page.locator("#pf-hpd").fill("5");
  await page.locator("#pf-hpd").dispatchEvent("change");
  await page.waitForTimeout(80);
  await go(page, "planner");
  assert.match(await page.textContent(".view-inner"), /within your 5h of study time per day/);
});

test("ticking an exam topic raises preparation progress", async () => {
  await onboard(page);
  await go(page, "exams");
  const card = page.locator(".exam", { hasText: "Mathematics midterm" });
  const before = await card.locator(".ring-wrap span:not(.ring)").textContent();
  const tid = await card.locator(".topics input:not(:checked)").first().getAttribute("id");
  await page.click("#" + tid);
  await page.waitForTimeout(80);
  const after = await page.locator(".exam", { hasText: "Mathematics midterm" }).locator(".ring-wrap span:not(.ring)").textContent();
  assert.ok(parseInt(after) > parseInt(before), `${before} -> ${after}`);
});

test("notifications: unread count shows, and Mark all read clears it", async () => {
  await onboard(page);
  assert.equal(await page.isVisible("#bellDot"), false, "calm first day: no unread dot right after setup (A5)");
  await page.evaluate(() => { const T = window.__DT_TEST__; const w = T.W(); w.items.push(T.mkItem(w, { title: "Java assignment", kind: "deadline", due: "2026-10-31T10:00", reminders: [1440] })); T.save(); T.render(); });
  await page.waitForFunction(() => { const d = document.getElementById("bellDot"); return d && d.offsetParent !== null; }, null, { timeout: 4000 });
  await page.click("#bellBtn");
  await page.click("[data-act=readall]");
  assert.equal(await page.isHidden("#bellDot"), true);
});

test("keyboard: N opens quick add and Escape closes it", async () => {
  await onboard(page);
  await page.keyboard.press("n");
  assert.equal(await page.isVisible("#qaText"), true);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);
  assert.equal(await page.locator("#modalWrap.on").count(), 0);
});

test("clearing sample data leaves an empty, usable workspace", async () => {
  await onboard(page);
  await page.click("[data-act=cleardemo]");
  await page.click("[data-act=confirmok]");
  const w = await ws(page);
  assert.equal(w.items.length, 0); assert.equal(w.demo, false);
  assert.match(await page.textContent("#nextDl"), /No deadlines coming up/i);
});

test("every button on the dashboard has an accessible name", async () => {
  await onboard(page);
  await page.waitForTimeout(300);
  const unnamed = await page.$$eval("button", bs => bs.filter(b => b.offsetParent !== null && !(b.getAttribute("aria-label") || b.textContent.trim() || b.title)).map(b => b.outerHTML.slice(0, 80)));
  assert.deepEqual(unnamed, []);
});

test("calendar events can be opened from the keyboard", async () => {
  await onboard(page);
  await go(page, "calendar");
  const ev = page.locator(".mday:not(.out) .ev").first();
  await ev.focus();
  await page.keyboard.press("Enter");
  await page.waitForSelector(".drawer.on");
  assert.equal(await page.inputValue("#dr-title"), await ev.textContent());
});
