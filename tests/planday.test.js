// "Plan my day / plan my tomorrow": the assistant builds the day from the user's own list.
// It never invents tasks, never moves a deadline, and copes with common spellings like "tommorw".
const { test, before, after, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { setup, newPage, onboard, go, ws } = require("./helpers");

let env, page;
before(async () => { env = await setup(); });
after(async () => { await env.close(); });
afterEach(async () => { if (page) { assert.deepEqual(page.errors, [], "no errors in the browser"); await page.context().close(); page = null; } });

async function open(opts = {}) {
  page = await newPage(env, opts);
  await onboard(page, { mode: opts.mode || "student", demo: opts.demo ?? true });
  await go(page, "assistant");
}
async function say(text) {
  const n = await page.locator(".msg.ai:not(.typing-msg)").count();
  await page.fill("#aiInput", text);
  await page.click("#aiSend");
  await page.waitForFunction(n => document.querySelectorAll(".msg.ai:not(.typing-msg)").length > n && !document.querySelector(".typing"), n, { timeout: 8000 });
  await page.waitForTimeout(60);
}
const lastReply = () => page.locator(".msg.ai .ai-text").last().textContent();
const rows = () => page.$$eval(".proposal:not(.saved) .prop-row", rs => rs.map(r => ({ update: r.classList.contains("update"), text: r.textContent, day: (r.querySelector("[data-pd]") || {}).value || "" })));

test("plan day: 'plan my tommorw day' plans tomorrow from my own list, not a new task", async () => {
  await open();
  const before = await ws(page);
  await say("plan my tommorw day");
  const reply = await lastReply();
  assert.match(reply, /tomorrow/i);
  assert.doesNotMatch(reply, /none of these have a day/i);
  const r = await rows();
  assert.ok(r.length >= 1, "suggests something from the list");
  assert.ok(r.every(x => x.update), "only plans existing tasks, creates nothing");
  assert.ok(r.every(x => x.day === "2026-10-31"), "every suggestion is for tomorrow");
  assert.ok(r.some(x => /overdue/i.test(x.text)), "the overdue lab report comes first with a reason");
  assert.equal((await ws(page)).items.length, before.items.length, "nothing saved before approval");
  await page.click("[data-act=propsave]");
  const after = await ws(page);
  assert.equal(after.items.length, before.items.length, "no task invented");
  const planned = after.items.filter(i => i.plan === "2026-10-31");
  assert.ok(planned.length >= 1);
  planned.forEach(i => { const was = before.items.find(b => b.id === i.id); assert.equal(i.due, was.due, `deadline of ${i.title} not moved`); });
});

test("plan day: built from the saved list only, with no outside calls", async () => {
  page = await newPage(env);
  await onboard(page, { mode: "student", demo: true });
  await go(page, "assistant");
  const calls = []; page.on("request", r => { if (!r.url().startsWith(env.base)) calls.push(r.url()); });
  await say("Plan my tomorrow");
  const r = await rows();
  assert.ok(r.length >= 1 && r.every(x => x.update && x.day === "2026-10-31"));
  assert.deepEqual(calls.filter(u => !/fonts\.(googleapis|gstatic)/.test(u)), []);
});

test("plan day: 'plan my day' plans today", async () => {
  await open();
  await say("plan my day");
  assert.match(await lastReply(), /today/i);
  const r = await rows();
  r.forEach(x => assert.equal(x.day, "2026-10-30"));
});

test("plan day: with an empty list it says so and asks, instead of making up tasks", async () => {
  await open({ demo: false });
  await say("plan my tomorrow day");
  assert.match(await lastReply(), /nothing .*(due|planned).*tomorrow/i);
  assert.equal(await page.locator(".proposal").count(), 0);
  assert.equal((await ws(page)).items.length, 0);
});

test("plan day: a sentence with real tasks is still read as tasks", async () => {
  await open({ demo: false });
  await say("plan my tomorrow: gym, call mom");
  const r = await page.$$eval(".proposal .prop-row [data-pt]", xs => xs.map(x => x.value));
  assert.deepEqual(r.sort(), ["Call mom", "Gym"]);
});

test("typos: 'tommorow', 'tommorw' and 'tomorrw' all mean tomorrow", async () => {
  await open({ demo: false });
  for (const [k, word] of ["tommorow", "tommorw", "tomorrw"].entries()) {
    await say(`call priya${k} ${word}`);
    const d = await page.$eval(".proposal:not(.saved) .prop-row [data-pd]", x => x.value);
    assert.equal(d, "2026-10-31", word);
    await page.click("[data-act=propdiscard]");
  }
});
