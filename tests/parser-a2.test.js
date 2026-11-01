// A2: the parser and the offline rules understand "due …" inside a list and "assign … to <name>".
const { test, before, after, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { setup, newPage, onboard, go, ws, itemByTitle } = require("./helpers");

let env, page;
before(async () => { env = await setup(); });
after(async () => { await env.close(); });
afterEach(async () => { if (page) { assert.deepEqual(page.errors, [], "no errors in the browser"); await page.context().close(); page = null; } });

// Runs fn(T, w, now) in the page against a fresh workspace (company has the sample team: Priya, Rahul, Ananya, Karan).
async function run(mode, fn, arg) {
  if (!page) page = await newPage(env);
  return page.evaluate(([mode, src, arg]) => {
    const T = window.__DT_TEST__;
    T.state = { v: 2, user: { name: "Tester" }, active: null, workspaces: [], read: {} };
    const w = T.newWorkspace(mode, "Test", mode === "company", []);
    T.state.workspaces.push(w); T.state.active = w.id;
    return (new Function("T", "w", "now", "arg", src))(T, w, Date.now(), arg);
  }, [mode, `return (${fn.toString()})(T, w, now, arg);`, arg]);
}
const parse = (text, mode = "student") => run(mode, (T, w, now, text) => T.parseQuick(text, w, now), text);
const rules = (text, mode = "student") => run(mode, (T, w, now, text) => T.rulesPlan(text, w, now).actions.map(a => ({ title: a.title, date: a.date, time: a.time, isDeadline: a.isDeadline, reminders: a.reminders, assignee: a.assignee || null, assigneeMiss: a.assigneeMiss || null })), text);
const pick = (acts, t) => acts.find(a => a.title === t);

/* ---------- "due" inside a list ---------- */
test("A2 parser: 'due' marks a deadline and keeps its day and time", async () => {
  const r = await parse("DBMS assignment due Friday 5pm");
  assert.equal(r.title, "DBMS assignment");
  assert.equal(r.date, "2026-11-06"); assert.equal(r.time, "17:00");
  assert.equal(r.deadline, true);
  assert.equal((await parse("Java lab tomorrow")).deadline, false);
});

test("A2 rules: the walkthrough sentence gives one deadline and one task", async () => {
  const a = await rules("DBMS assignment due Friday 5pm, Java lab tomorrow");
  assert.equal(a.length, 2);
  const d = pick(a, "DBMS assignment"), j = pick(a, "Java lab");
  assert.equal(d.isDeadline, true); assert.equal(d.date, "2026-11-06"); assert.equal(d.time, "17:00");
  assert.deepEqual(d.reminders, [1440, 60]);
  assert.equal(j.isDeadline, false); assert.equal(j.date, "2026-10-31");
});

test("A2 rules: two deadlines joined by 'and' are both kept", async () => {
  const a = await rules("Physics report is due on 5 Nov and DBMS quiz on Monday");
  assert.deepEqual(a.map(x => x.title).sort(), ["DBMS quiz", "Physics report"]);
  assert.equal(pick(a, "Physics report").date, "2026-11-05"); assert.equal(pick(a, "Physics report").isDeadline, true);
  assert.equal(pick(a, "DBMS quiz").date, "2026-11-02"); assert.equal(pick(a, "DBMS quiz").isDeadline, true, "a quiz is a fixed date");
});

test("A2 rules: 'due' with no date never gets one invented", async () => {
  const a = await rules("Lab report due, buy pens");
  assert.equal(a.length, 2);
  a.forEach(x => { assert.equal(x.date, null, x.title); assert.equal(x.isDeadline, false, x.title); });
});

test("A2 rules: studying for an exam is a task, not the exam's deadline", async () => {
  const a = await rules("Study for the maths exam tomorrow, submit lab file by Monday");
  const s = a.find(x => /^Study/.test(x.title));
  assert.equal(s.isDeadline, false); assert.equal(s.date, "2026-10-31");
  const l = a.find(x => /lab file/i.test(x.title));
  assert.equal(l.isDeadline, true, "'submit … by' is a deadline"); assert.equal(l.date, "2026-11-02");
});

/* ---------- "assign … to <name>" ---------- */
test("A2 parser: 'assign to Rahul' picks the team member and keeps the title clean", async () => {
  const r = await parse("Fix login bug tomorrow, assign to Rahul", "company");
  assert.equal(r.assignee, "r"); assert.equal(r.title, "Fix login bug"); assert.equal(r.date, "2026-10-31");
  const r2 = await parse("Assign the landing page copy to Ananya by Friday", "company");
  assert.equal(r2.assignee, "a"); assert.equal(r2.title, "Landing page copy"); assert.equal(r2.date, "2026-11-06");
  const r3 = await parse("Review sprint board and give it to Karan Mehta", "company");
  assert.equal(r3.assignee, "k"); assert.equal(r3.title, "Review sprint board");
});

test("A2 parser: an unknown name is reported, not guessed", async () => {
  const r = await parse("Write tests, assign to Zoya", "company");
  assert.equal(r.assignee, null); assert.equal(r.assigneeMiss, "Zoya"); assert.equal(r.title, "Write tests");
});

test("A2 rules: assignment inside a list goes to the right task", async () => {
  const a = await rules("Fix login bug tomorrow and assign it to Rahul, review the API docs", "company");
  assert.equal(a.length, 2);
  assert.equal(pick(a, "Fix login bug").assignee, "r");
  assert.equal(pick(a, "Review the API docs").assignee, null);
});

/* ---------- Through the assistant ---------- */
async function say(text) {
  const n = await page.locator(".msg.ai:not(.typing-msg)").count();
  await page.fill("#aiInput", text); await page.click("#aiSend");
  await page.waitForFunction(n => document.querySelectorAll(".msg.ai:not(.typing-msg)").length > n && !document.querySelector(".typing"), n, { timeout: 8000 });
}

test("A2 walkthrough: the deadline is saved as a deadline and Home is not 'all caught up'", async () => {
  page = await newPage(env); await onboard(page, { demo: false });
  await go(page, "assistant");
  await say("DBMS assignment due Friday 5pm, Java lab tomorrow");
  await page.click("[data-act=propsave]");
  const d = await itemByTitle(page, "DBMS assignment");
  assert.equal(d.due, "2026-11-06T17:00");
  assert.equal((await itemByTitle(page, "Java lab")).plan, "2026-10-31");
  await go(page, "deadlines");
  assert.match(await page.textContent(".list"), /DBMS assignment/);
  await go(page, "overview");
  assert.doesNotMatch(await page.textContent("#viewInner"), /all caught up/i);
});

test("A2 walkthrough: a manager's 'assign to Rahul' is shown and saved", async () => {
  page = await newPage(env); await onboard(page, { mode: "company", demo: true });
  await go(page, "assistant");
  await say("Fix login bug tomorrow, assign to Rahul");
  assert.match(await page.textContent(".proposal:not(.saved)"), /Rahul/);
  await page.click("[data-act=propsave]");
  assert.equal((await itemByTitle(page, "Fix login bug")).assignee, "r");
});
