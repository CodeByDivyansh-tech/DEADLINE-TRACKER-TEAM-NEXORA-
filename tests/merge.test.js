// A1: one task model. Every task can have a day (plan) and/or a deadline (due).
// Anything with a deadline shows in deadline views, the radar, Today and reminders, whatever it was created as.
const { test, before, after, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { setup, newPage, onboard, go, ws, itemByTitle } = require("./helpers");

let env, page;
before(async () => { env = await setup(); });
after(async () => { await env.close(); });
afterEach(async () => { if (page) { assert.deepEqual(page.errors, [], "no errors in the browser"); await page.context().close(); page = null; } });

async function open(opts = {}) { page = await newPage(env, opts); await onboard(page, { demo: false }); }
async function addItem(o) {
  await page.evaluate(o => { const T = window.__DT_TEST__; const w = T.W(); const it = T.mkItem(w, o); w.items.push(it); T.save(); T.render(); }, o);
  await page.waitForTimeout(80);
}
const inbox = () => page.evaluate(() => (window.__DT_TEST__.state.inbox || []).map(n => n.text));
const listText = async route => { await go(page, route); return page.textContent("#viewInner"); };
const todayTitles = async () => { await go(page, "todo"); await page.click("[data-act=todotab][data-v=today]"); return page.$$eval("#todoList .todo .t", xs => xs.map(x => x.textContent.trim())); };

/* ---------- Old saved data keeps working ---------- */
// A state saved by the previous version: one item from before to-dos existed (no kind, few fields),
// to-dos with and without a deadline, a deadline due today, and a finished deadline.
const SETTINGS = { hoursPerDay: 3, workdays: [0, 1, 2, 3, 4, 5, 6], reminders: [4320, 1440, 60], customReminder: 0, overdueAlerts: true, dailySummary: true, quietOn: true, quietFrom: "22:00", quietTo: "07:00", tz: "Asia/Kolkata", thresholds: { critical: 100, risk: 70, attention: 40 } };
const OLD_STATE = {
  v: 2, user: { name: "Divyansh" }, active: "w1", read: {}, updatedAt: 1, inbox: [], fired: {},
  workspaces: [{ id: "w1", name: "My Studies", mode: "student", demo: false, createdAt: "2026-10-01T10:00:00.000Z", viewAs: "manager",
    groups: [{ id: "g1", name: "DBMS", color: "#5b6cf0" }], members: [{ id: "me", name: "Divyansh", role: "Owner", capacity: 21 }],
    activity: [], notices: [], settings: SETTINGS,
    items: [
      { id: "old1", title: "Old DBMS assignment", type: "assignment", groupId: "g1", due: "2026-11-02T17:00", status: "todo", priority: "high", progress: 0, estimate: 3, createdAt: "2026-10-01T10:00:00.000Z" },
      { id: "t1", kind: "todo", title: "Call teammate", plan: "2026-10-30", time: null, due: null, reminders: [], status: "todo", priority: "medium", type: "assignment", createdAt: "2026-10-29T10:00:00.000Z", log: [] },
      { id: "t2", kind: "todo", title: "Physics viva", plan: "2026-10-29", time: null, due: "2026-10-31T15:00", reminders: [], status: "todo", priority: "medium", type: "assignment", createdAt: "2026-10-28T10:00:00.000Z", log: [] },
      { id: "d2", kind: "deadline", title: "Fee payment", type: "fee", due: "2026-10-30T16:00", status: "todo", priority: "high", milestones: [], dependsOn: [], createdAt: "2026-10-20T10:00:00.000Z", log: [] },
      { id: "done1", kind: "deadline", title: "Old quiz", type: "exam", due: "2026-10-20T09:00", status: "done", doneAt: "2026-10-20T02:00:00.000Z", createdAt: "2026-10-10T10:00:00.000Z", log: [] }
    ] }]
};
const seedOld = state => `if (!localStorage.getItem("deadline-tracker-v2")) localStorage.setItem("deadline-tracker-v2", ${JSON.stringify(JSON.stringify(state))});`;

test("A1 old data: every saved item loads with the same id, title, day and deadline", async () => {
  page = await newPage(env, { init: seedOld(OLD_STATE) });
  await page.waitForSelector("#app:not([hidden])");
  const w = await ws(page);
  assert.equal(w.items.length, 5);
  for (const o of OLD_STATE.workspaces[0].items) {
    const it = w.items.find(i => i.id === o.id);
    assert.ok(it, o.id);
    assert.equal(it.title, o.title); assert.equal(it.due || null, o.due || null); assert.equal(it.plan || null, o.plan || null); assert.equal(it.status, o.status);
  }
  await page.reload(); await page.waitForSelector("#app:not([hidden])");
  assert.equal((await ws(page)).items.length, 5, "still there after a reload");
});

test("A1 old data: deadline views, radar and Today all use the merged model", async () => {
  page = await newPage(env, { init: seedOld(OLD_STATE) });
  await page.waitForSelector("#app:not([hidden])");
  const dl = await listText("deadlines");
  for (const t of ["Old DBMS assignment", "Physics viva", "Fee payment"]) assert.match(dl, new RegExp(t), `${t} in My Deadlines`);
  assert.doesNotMatch(dl, /Call teammate/, "a task with no deadline stays out of deadline views");
  await go(page, "deadlines"); // the radar lives on the Deadlines page since A4
  const blips = await page.$$eval(".radar .blip", bs => bs.map(b => b.getAttribute("aria-label")));
  for (const t of ["Old DBMS assignment", "Physics viva", "Fee payment"]) assert.ok(blips.some(b => b.startsWith(t)), `${t} on the radar`);
  await go(page, "overview");
  const today = await todayTitles();
  assert.ok(today.includes("Call teammate"), "planned today");
  assert.ok(today.includes("Fee payment"), "a deadline due today is on today's list");
  assert.ok(today.includes("Physics viva"), "unfinished from yesterday is carried over");
  assert.ok(!today.includes("Old DBMS assignment"), "due Monday, not today");
  assert.match(await page.textContent("#todoProgress"), /0 of 2 done/);
});

test("A1 old data: the very first format (v1) is still brought over", async () => {
  const v1 = { items: [{ title: "Library fine", due: "2026-11-01T12:00", category: "Admin", priority: "low", done: false }] };
  page = await newPage(env, { init: `if (!localStorage.getItem("deadline-tracker-v2")) localStorage.setItem("deadline-tracker-v1", ${JSON.stringify(JSON.stringify(v1))});` });
  await page.waitForSelector("#app:not([hidden])");
  assert.ok(await itemByTitle(page, "Library fine"));
  assert.match(await listText("deadlines"), /Library fine/);
});

/* ---------- Reminders follow the deadline ---------- */
test("A1 reminders: a task that has a deadline gets overdue alerts too", async () => {
  await open();
  await addItem({ kind: "todo", title: "Lab record", plan: "2026-10-29", due: "2026-10-29T18:00", reminders: [] });
  await page.waitForTimeout(1300);
  assert.ok((await inbox()).some(t => /"Lab record" is overdue/.test(t)), (await inbox()).join(" | "));
});

/* ---------- Details panel: any task can get a deadline, any deadline a day ---------- */
test("A1 details: giving a task a deadline puts it in deadline views and reminders", async () => {
  await open();
  await go(page, "todo");
  await page.fill("#addText", "Physics viva prep"); await page.press("#addText", "Enter"); await page.waitForTimeout(60);
  await page.locator(".todo", { hasText: "Physics viva prep" }).getByRole("button", { name: "Edit", exact: true }).click();
  await page.waitForSelector(".drawer.on");
  assert.equal(await page.isVisible("#dr-deadline"), true, "deadline field is in plain sight");
  await page.fill("#dr-deadline", "2026-10-31"); // the panel switches to the deadline layout straight away
  await page.waitForSelector("#dr-date");
  assert.equal(await page.inputValue("#dr-date"), "2026-10-31");
  await page.waitForTimeout(1400);
  const it = await itemByTitle(page, "Physics viva prep");
  assert.equal(it.due, "2026-10-31T23:59");
  assert.equal(it.plan, "2026-10-30", "its day is kept");
  assert.ok((await inbox()).some(t => /Physics viva prep deadline is tomorrow/.test(t)), (await inbox()).join(" | "));
  await page.click("[data-act=drclose]");
  assert.match(await listText("deadlines"), /Physics viva prep/);
});

test("A1 details: a deadline can be planned for a day without moving the deadline", async () => {
  await open();
  await addItem({ kind: "deadline", title: "DBMS assignment", due: "2026-11-03T17:00" });
  await go(page, "deadlines");
  await page.locator(".item", { hasText: "DBMS assignment" }).locator(".body").click();
  await page.waitForSelector(".drawer.on");
  assert.equal(await page.isVisible("#dr-plan"), true, "a 'work on it' day field");
  await page.fill("#dr-plan", "2026-10-30"); await page.locator("#dr-plan").dispatchEvent("change");
  await page.waitForTimeout(80);
  const it = await itemByTitle(page, "DBMS assignment");
  assert.equal(it.plan, "2026-10-30"); assert.equal(it.due, "2026-11-03T17:00", "deadline unchanged");
  await page.click("[data-act=drclose]");
  assert.ok((await todayTitles()).includes("DBMS assignment"));
});

test("A1 details: a deadline is only removed when you ask, and the task stays", async () => {
  await open();
  await addItem({ kind: "deadline", title: "Club form", due: "2026-11-04T17:00" });
  await go(page, "deadlines");
  await page.locator(".item", { hasText: "Club form" }).locator(".body").click();
  await page.waitForSelector(".drawer.on");
  await page.click("#drMore");
  await page.click("[data-act=dlremove]");
  await page.click("[data-act=confirmok]");
  const it = await itemByTitle(page, "Club form");
  assert.ok(it, "task kept");
  assert.equal(it.due, null);
  assert.ok(it.log.some(l => /Removed the deadline/.test(l.text)));
  assert.equal(await page.isVisible("#dr-plan"), true, "the panel now shows it as a plain task");
  await page.click("[data-act=drclose]");
  assert.doesNotMatch(await listText("deadlines"), /Club form/);
  await go(page, "todo"); await page.click("[data-act=todotab][data-v=upcoming]");
  assert.match(await page.textContent("#todoList"), /Club form/);
});

/* ---------- To-Do lists show deadlines and tasks together ---------- */
test("A1 upcoming: deadlines and tasks are grouped together by day", async () => {
  await open();
  await addItem({ kind: "deadline", title: "Maths quiz", type: "exam", due: "2026-10-31T10:00" });
  await addItem({ kind: "todo", title: "Buy lab coat", plan: "2026-10-31" });
  await go(page, "todo"); await page.click("[data-act=todotab][data-v=upcoming]");
  const tomorrow = page.locator(".tgroup", { has: page.locator("h4", { hasText: "Tomorrow" }) });
  const txt = await tomorrow.textContent();
  assert.match(txt, /Maths quiz/); assert.match(txt, /Buy lab coat/);
  assert.match(await tomorrow.locator(".todo", { hasText: "Maths quiz" }).textContent(), /Due/, "the deadline is marked as due");
});

/* ---------- The assistant never moves a hard deadline by itself ---------- */
test("A1 assistant: 'move it to tomorrow' on a deadline moves the work day, not the deadline", async () => {
  await open();
  await addItem({ kind: "deadline", title: "DBMS assignment", due: "2026-11-02T17:00" });
  await go(page, "assistant");
  const n = await page.locator(".msg.ai:not(.typing-msg)").count();
  await page.fill("#aiInput", "I couldn't work on the DBMS assignment today. Move it to tomorrow.");
  await page.click("#aiSend");
  await page.waitForFunction(n => document.querySelectorAll(".msg.ai:not(.typing-msg)").length > n && !document.querySelector(".typing"), n, { timeout: 8000 });
  assert.match(await page.textContent(".proposal:not(.saved)"), /deadline stays/i);
  await page.click("[data-act=propsave]");
  const it = await itemByTitle(page, "DBMS assignment");
  assert.equal(it.plan, "2026-10-31");
  assert.equal(it.due, "2026-11-02T17:00", "hard deadline untouched");
});
