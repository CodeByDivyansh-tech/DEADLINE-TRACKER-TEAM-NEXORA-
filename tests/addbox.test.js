// A3: one Add box everywhere (Home, To-Do, the N / + shortcut, calendar days), with the same parser
// as the assistant's offline rules. Enter saves (with Undo); no date means today's list; deadlines only when the words say so.
const { test, before, after, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { setup, newPage, onboard, go, ws, itemByTitle } = require("./helpers");

let env, page;
before(async () => { env = await setup(); });
after(async () => { await env.close(); });
afterEach(async () => { if (page) { assert.deepEqual(page.errors, [], "no errors in the browser"); await page.context().close(); page = null; } });

async function open(opts = {}) { page = await newPage(env, opts); await onboard(page, { mode: opts.mode || "student", demo: opts.demo ?? false }); }
const hint = id => page.textContent(`#${id}-hint`);
async function type(id, text) { await page.fill(`#${id}`, text); await page.waitForTimeout(40); }
async function enter(id) { await page.press(`#${id}`, "Enter"); await page.waitForTimeout(80); }

test("A3: the same Add box is on Home, on To-Do and behind N, and understands text the same way", async () => {
  await open();
  const text = "DBMS assignment due Friday 5pm";
  const seen = [];
  await go(page, "overview"); await type("addText", text); seen.push(await hint("addText"));
  await go(page, "todo"); await type("addText", text); seen.push(await hint("addText"));
  await page.fill("#addText", ""); await page.locator("#addText").blur();
  await page.keyboard.press("n"); await page.waitForSelector("#qaText"); await type("qaText", text); seen.push(await hint("qaText"));
  seen.forEach(h => { assert.match(h, /DBMS assignment/); assert.match(h, /Deadline/); assert.match(h, /6 Nov/); assert.match(h, /5:00\s?pm/i); });
  assert.equal(new Set(seen).size, 1, "identical understanding in every place");
});

test("A3: the old Quick add form and the Paste tab are gone", async () => {
  await open();
  await page.click("#qaBtn"); await page.waitForSelector("#qaText");
  for (const sel of ["#qa-title", "#qa-date", "#qaMore", "[data-act=qatab]", "#qaPaste"]) assert.equal(await page.locator(sel).count(), 0, sel);
});

test("A3: Enter saves; with no date it goes on today's list; Undo takes it back", async () => {
  await open();
  await go(page, "todo");
  await type("addText", "Call Priya");
  assert.match(await hint("addText"), /Today/);
  assert.doesNotMatch(await hint("addText"), /Deadline/);
  await enter("addText");
  const it = await itemByTitle(page, "Call Priya");
  assert.equal(it.plan, "2026-10-30"); assert.equal(it.due, null);
  assert.equal(await page.inputValue("#addText"), "", "box is cleared for the next one");
  assert.ok((await page.$$eval("#todoList .todo .t", xs => xs.map(x => x.textContent))).includes("Call Priya"));
  await page.click("#toastUndo");
  assert.equal(await itemByTitle(page, "Call Priya"), undefined);
});

test("A3: a deadline keeps its date, time, effort and priority, and shows in My Deadlines", async () => {
  await open();
  await type("addText", "DBMS assignment due Friday 5pm ~3h !high");
  await enter("addText");
  const it = await itemByTitle(page, "DBMS assignment");
  assert.equal(it.due, "2026-11-06T17:00"); assert.equal(it.estimate, 3); assert.equal(it.priority, "high"); assert.equal(it.plan, null);
  await go(page, "deadlines");
  assert.match(await page.textContent(".list"), /DBMS assignment/);
});

test("A3: several things at once, separated by commas or new lines", async () => {
  await open();
  await type("addText", "DBMS assignment due Friday 5pm, Java lab tomorrow");
  assert.match(await hint("addText"), /2 things/);
  await enter("addText");
  assert.equal((await itemByTitle(page, "DBMS assignment")).due, "2026-11-06T17:00");
  assert.equal((await itemByTitle(page, "Java lab")).plan, "2026-10-31");
  assert.equal(await page.evaluate(() => document.activeElement.id), "addText", "ready for the next one");
  await page.click("#qaBtn"); await page.waitForSelector("#qaText");
  await page.fill("#qaText", "Lab report due Monday 11:59 pm\nPlease read the handout\nQuiz on chapter 4 next Thursday at 9am");
  await enter("qaText");
  assert.equal(await page.locator("#modalWrap.on").count(), 0, "the box closes after adding");
  assert.equal((await itemByTitle(page, "Lab report")).due, "2026-11-02T23:59");
  assert.equal((await itemByTitle(page, "Please read the handout")).plan, "2026-10-30");
  assert.equal((await itemByTitle(page, "Quiz on chapter 4")).due, "2026-11-05T09:00");
});

test("A3: never invents a deadline; a plain task with no date stays a plain task", async () => {
  await open();
  await type("addText", "Read chapter 5");
  await enter("addText");
  const it = await itemByTitle(page, "Read chapter 5");
  assert.equal(it.due, null); assert.equal(it.plan, "2026-10-30");
});

test("A3: 'Ask the assistant' sends the same text to the assistant as a suggestion", async () => {
  await open();
  await type("addText", "I have to study Python today.");
  await page.click("#addText-ask");
  await page.waitForSelector(".proposal");
  assert.equal(await page.textContent("#pageTitle"), "Assistant");
  assert.match(await page.textContent(".msg.user"), /study Python/);
  assert.equal(await itemByTitle(page, "Study Python"), undefined, "nothing saved until approved");
});

test("A3 (company): @name and 'assign to' set the person, and the box says who", async () => {
  await open({ mode: "company", demo: true });
  await page.click("#qaBtn"); await page.waitForSelector("#qaText");
  await type("qaText", "Write release notes due tomorrow 4pm @karan ~2h");
  assert.match(await hint("qaText"), /Karan Mehta/);
  await enter("qaText");
  const it = await itemByTitle(page, "Write release notes");
  assert.equal(it.assignee, "k"); assert.equal(it.due, "2026-10-31T16:00");
  await go(page, "overview");
  await type("addText", "Fix login bug tomorrow, assign to Rahul");
  assert.match(await hint("addText"), /Rahul Verma/);
  await enter("addText");
  assert.equal((await itemByTitle(page, "Fix login bug")).assignee, "r");
});

test("A3: '+' on a calendar day adds to that day, and the task shows on the calendar", async () => {
  await open();
  await go(page, "calendar");
  await page.click('.mday[data-day="2026-11-04"] [data-act=qa]');
  await page.waitForSelector("#qaText");
  await type("qaText", "Call the bank");
  assert.match(await hint("qaText"), /4 Nov/);
  await enter("qaText");
  assert.equal((await itemByTitle(page, "Call the bank")).plan, "2026-11-04");
  assert.match(await page.textContent('.mday[data-day="2026-11-04"]'), /Call the bank/);
});

test("A3: a repeating task without a deadline repeats on its day", async () => {
  await open();
  await type("addText", "Water the plants every week");
  await enter("addText");
  await go(page, "todo");
  await page.locator(".todo", { hasText: "Water the plants" }).locator(".tcheck").click();
  const list = (await ws(page)).items.filter(i => i.title === "Water the plants");
  assert.equal(list.length, 2);
  assert.ok(list.some(i => i.plan === "2026-11-06" && i.status !== "done"), JSON.stringify(list.map(i => [i.plan, i.status])));
});
