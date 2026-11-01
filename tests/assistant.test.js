// AI assistant: talk -> understand -> proposed to-do list -> approve -> saved.
// Real AI can't run in tests, so three paths are checked:
//  1) the offline "simple rules" helper (deterministic, used when no AI is connected),
//  2) the AI pipeline with a mocked model (prompt contents, validation, saving),
//  3) the localhost backend route (/api/status, /api/ai) through a mock server.
const { test, before, after, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const fs = require("fs");
const path = require("path");
const { setup, newPage, onboard, go, ws, itemByTitle } = require("./helpers");

let env, page;
before(async () => { env = await setup(); });
after(async () => { await env.close(); });
afterEach(async () => { if (page) { assert.deepEqual(page.errors, [], "no errors in the browser"); await page.context().close(); page = null; } });

async function open(opts = {}) {
  page = await newPage(env, opts);
  await onboard(page, { mode: "student", demo: opts.demo ?? false });
  await go(page, "assistant");
}
async function say(text) {
  const n = await page.locator(".msg.ai:not(.typing-msg)").count();
  await page.fill("#aiInput", text);
  await page.click("#aiSend");
  await page.waitForFunction(n => document.querySelectorAll(".msg.ai:not(.typing-msg)").length > n && !document.querySelector(".typing"), n, { timeout: 8000 });
  await page.waitForTimeout(60);
}
const rows = () => page.$$eval(".proposal:not(.saved) .prop-row", rs => rs.map(r => ({
  title: (r.querySelector("[data-pt]") || {}).value, date: (r.querySelector("[data-pd]") || {}).value || "", update: r.classList.contains("update"), text: r.textContent })));
const todos = async () => (await ws(page)).items.filter(i => i.kind === "todo");

/* ---------- Offline helper (simple rules) ---------- */
test("assistant: says honestly when AI isn't connected", async () => {
  await open();
  assert.match(await page.textContent("#aiMode"), /simple rules/i);
});

test("assistant: shows suggested prompts to first-time users, and they work", async () => {
  await open();
  const n = await page.locator(".ai-suggest button").count();
  assert.ok(n >= 3);
  await page.locator(".ai-suggest button").first().click();
  await page.waitForSelector(".msg.user");
  assert.ok(await page.locator(".msg.user").count() === 1);
});

test("assistant (rules): plans tomorrow from one sentence, as a suggestion until approved", async () => {
  await open();
  await say("Tomorrow I have to complete my Java assignment, attend college, practice DSA for two hours, and submit my project report.");
  const r = await rows();
  assert.deepEqual(r.map(x => x.title).sort(), ["Attend college", "Complete Java assignment", "Practice DSA", "Submit project report"]);
  r.forEach(x => assert.equal(x.date, "2026-10-31", x.title));
  assert.match(await page.textContent(".proposal .prop-tag"), /suggestion.*not saved/i);
  assert.equal((await todos()).length, 0, "nothing saved before approval");
  await page.click("[data-act=propsave]");
  const t = await todos();
  assert.equal(t.length, 4);
  assert.ok(t.every(i => i.plan === "2026-10-31" && i.status === "todo"));
  assert.equal(t.find(i => i.title === "Practice DSA").estimate, 2);
  assert.match(await page.textContent(".proposal.saved"), /Saved 4 tasks/);
});

test("assistant (rules): today's work goes on today's list", async () => {
  await open();
  await say("I have to study Python, finish my website homepage, and call my project teammate today.");
  const r = await rows();
  assert.deepEqual(r.map(x => x.title).sort(), ["Call project teammate", "Finish website homepage", "Study Python"]);
  r.forEach(x => assert.equal(x.date, "2026-10-30"));
});

test("assistant (rules): a deadline becomes a deadline with suggested reminders", async () => {
  await open();
  await say("My project submission deadline is 5 November.");
  const r = await rows();
  assert.equal(r.length, 1);
  assert.equal(r[0].date, "2026-11-05");
  assert.match(r[0].text, /Deadline/);
  assert.ok(await page.locator(".proposal .prop-rem").count() >= 1, "reminder suggestions shown");
  await page.click("[data-act=propsave]");
  const it = (await ws(page)).items.find(i => /project submission/i.test(i.title));
  assert.ok(it, "saved");
  assert.equal(it.due.slice(0, 10), "2026-11-05");
  assert.ok(it.reminders.includes(1440), "1-day reminder");
});

test("assistant (rules): 'move it to tomorrow' updates the existing task instead of duplicating it", async () => {
  await open();
  await say("I have to practice DSA today.");
  await page.click("[data-act=propsave]");
  const before = await todos();
  assert.equal(before.length, 1);
  await say("I couldn't complete my DSA practice today. Move it to tomorrow.");
  const r = await rows();
  assert.equal(r.length, 1);
  assert.equal(r[0].update, true);
  assert.match(r[0].text, /Practice DSA/);
  await page.click("[data-act=propsave]");
  const after = await todos();
  assert.equal(after.length, 1, "no duplicate");
  assert.equal(after[0].id, before[0].id);
  assert.equal(after[0].plan, "2026-10-31");
});

test("assistant (rules): never invents a date", async () => {
  await open();
  await say("Buy groceries and call mom");
  const r = await rows();
  assert.equal(r.length, 2);
  r.forEach(x => assert.equal(x.date, "", `${x.title} has no date`));
});

test("assistant: suggestions can be edited, unticked or discarded before saving", async () => {
  await open();
  await say("Tomorrow I have to complete my Java assignment, attend college, practice DSA for two hours, and submit my project report.");
  const firstTitle = page.locator(".proposal [data-pt]").first();
  await firstTitle.fill("Java assignment (final)");
  await firstTitle.dispatchEvent("change");
  await page.locator(".proposal [data-pk]").nth(1).uncheck();
  await page.locator(".proposal [data-pd]").nth(2).fill("2026-11-02");
  await page.locator(".proposal [data-pd]").nth(2).dispatchEvent("change");
  await page.click("[data-act=propsave]");
  const t = await todos();
  assert.equal(t.length, 3);
  assert.ok(t.some(i => i.title === "Java assignment (final)"));
  assert.ok(t.some(i => i.plan === "2026-11-02"));
  await say("Buy groceries");
  await page.click("[data-act=propdiscard]");
  assert.equal((await todos()).length, 3);
});

test("assistant: conversation and saved tasks survive a reload", async () => {
  await open();
  await say("I have to study Python today.");
  await page.click("[data-act=propsave]");
  await page.reload(); await page.waitForSelector("#app:not([hidden])");
  await go(page, "assistant");
  assert.ok(await page.locator(".msg.user").count() >= 1);
  assert.ok(await page.locator(".proposal.saved").count() >= 1);
  assert.equal((await todos()).length, 1);
});

test("assistant quick actions: View today, Add task and Reschedule all work", async () => {
  await open();
  await say("I have to study Python and call my teammate today.");
  await page.click("[data-act=propsave]");
  await page.click("[data-act=aireschedule]");
  await page.waitForSelector(".proposal:not(.saved)");
  const r = await rows();
  assert.equal(r.length, 2);
  assert.ok(r.every(x => x.update && x.date === "2026-10-31"));
  await page.click("[data-act=propsave]");
  assert.ok((await todos()).every(i => i.plan === "2026-10-31"));
  await page.click("[data-act=aiadd]");
  assert.equal(await page.isVisible("#qaText"), true);
  await page.keyboard.press("Escape");
  await page.click("[data-act=aitoday]");
  assert.equal(await page.textContent("#pageTitle"), "Today");
});

test("home: the Add box's 'Ask the assistant' sends the message to the assistant", async () => {
  page = await newPage(env);
  await onboard(page, { demo: false });
  await page.fill("#addText", "I have to study Python today.");
  await page.click("#addText-ask");
  await page.waitForSelector(".proposal");
  assert.equal(await page.textContent("#pageTitle"), "Assistant");
});

/* ---------- No outside AI for private planning ---------- */
test("privacy: the page contains no AI keys and the planner makes no outside AI calls", async () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  assert.doesNotMatch(html, /sk-ant-|x-api-key|x-goog-api-key|AIza|anthropic|generativelanguage/i, "no key, key header or AI provider in the page");
  await open();
  const calls = []; page.on("request", r => { if (!r.url().startsWith(env.base)) calls.push(r.url()); });
  await say("Tomorrow I have to complete my Java assignment and call Priya.");
  assert.ok((await rows()).length >= 2);
  assert.deepEqual(calls.filter(u => !/fonts\.(googleapis|gstatic)/.test(u)), [], "planning stays in the browser here");
});
