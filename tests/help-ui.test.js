// Deadline AI Help in the browser, against the real server and a fake Gemini: code and tables shown properly,
// a clear "Thinking…" state, no double sends, failures with "Try again", and a browser-side time limit.
const { test, before, after, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const { startServer, fakeGemini } = require("./srv");
const { onboard, pollPage } = require("./helpers");

let s, g, browser; const ctxs = [];
before(async () => { g = await fakeGemini().start(); s = await startServer({ GEMINI_API_KEY: "test-key", GEMINI_BASE_URL: g.url }); browser = await chromium.launch(); });
after(async () => { await browser.close(); s.stop(); g.close(); });
afterEach(async () => { while (ctxs.length) { const c = ctxs.pop(); const errs = c.__errors; await c.close(); assert.deepEqual(errs, [], "no errors in the browser"); } });

let n = 0;
async function newUser(){
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, timezoneId: "Asia/Kolkata", locale: "en-IN", permissions: ["clipboard-read", "clipboard-write"] });
  ctx.__errors = []; ctxs.push(ctx);
  const page = await ctx.newPage();
  page.on("pageerror", e => ctx.__errors.push(e.message));
  page.on("console", m => { if (m.type() === "error" && !/Failed to load resource|fonts\./.test(m.text())) ctx.__errors.push(m.text()); });
  await page.goto(s.base + "/?dt-test");
  await page.waitForSelector(".auth-card");
  await page.click("[data-act=authmode][data-v=signup]");
  await page.fill("#au-name", "Help " + (++n)); await page.fill("#au-email", `help${n}@example.com`); await page.fill("#au-pass", "password123");
  await page.click("#authGo"); await page.waitForSelector("#onb-name");
  await onboard(page, { mode: "student", demo: false, name: "Help" });
  await pollPage(page, async () => (await (await fetch("/api/state")).json()).version >= 1, null, 5000);
  await page.click("#dwBtn"); await page.waitForSelector("#dw:not([hidden])");
  return page;
}
const answers = page => page.locator("#dwMsgs .msg.ai:not(.typing-msg)");
async function send(page, text){
  const k = await answers(page).count();
  await page.fill("#dwInput", text); await page.press("#dwInput", "Enter");
  await page.waitForFunction(k => document.querySelectorAll("#dwMsgs .msg.ai:not(.typing-msg)").length > k && !document.querySelector("#dwMsgs .typing-msg"), k, { timeout: 10000 });
  return answers(page).last();
}

test("code and tables: a fenced code block keeps its exact text, shows the language and a Copy button; tables are tables", async () => {
  const page = await newUser();
  const code = 'def greet(name):\n    return f"Hi {name}, you owe $5"\n\nprint(greet("Asha"))';
  g.respond = () => ({ text: "Here you go:\n\n```python\n" + code + "\n```\n\nUse `greet()` like this.\n\n| Type | Example |\n|---|---|\n| int | 5 |\n| str | \"hi\" |" });
  const m = await send(page, "Write a Python greeting function");
  assert.equal(await m.locator("pre code").textContent(), code);
  assert.match(await m.locator(".code-h").textContent(), /python/);
  assert.equal(await m.locator("td").count(), 4); assert.equal(await m.locator("th").first().textContent(), "Type");
  assert.equal(await m.locator(":scope .md > p code").first().textContent(), "greet()");
  await m.locator("[data-act=dwcopy]").click();
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), code);
  assert.match(await page.textContent("#toastMsg"), /Copied/);
  assert.equal(await page.evaluate(() => document.querySelector("#dwMsgs pre").scrollWidth <= document.querySelector("#dwMsgs pre").clientWidth || getComputedStyle(document.querySelector("#dwMsgs pre")).overflowX === "auto"), true, "long lines scroll inside the block");
});

test("loading and double sends: 'Thinking…' shows while waiting, and pressing send twice sends one question", async () => {
  const page = await newUser();
  g.respond = () => ({ text: "Water boils at 100 °C at sea level.", delay: 1200 });
  const before = g.chats().length;
  await page.fill("#dwInput", "At what temperature does water boil?");
  await page.press("#dwInput", "Enter"); await page.press("#dwInput", "Enter"); await page.click("#dwSend", { force: true }).catch(() => {});
  await page.waitForSelector("#dwMsgs .typing-msg");
  assert.match(await page.textContent("#dwMsgs .typing-msg"), /Thinking/);
  assert.ok(await page.$eval("#dwSend", b => b.disabled), "send is off while waiting");
  await page.waitForSelector("#dwMsgs .typing-msg", { state: "detached", timeout: 8000 });
  assert.equal(g.chats().length - before, 1, "one request");
  assert.equal(await page.locator("#dwMsgs .msg.user").count(), 1);
  // several messages in a row
  g.respond = () => ({ text: "Second answer." }); await send(page, "Second question");
  g.respond = () => ({ text: "Third answer." }); await send(page, "Third question");
  assert.deepEqual(await page.$$eval("#dwMsgs .msg.ai .md", m => m.map(x => x.textContent.trim())), ["Water boils at 100 °C at sea level.", "Second answer.", "Third answer."]);
});

test("failure and retry: a clear message with 'Try again'; trying again gets the answer and removes the error", async () => {
  const page = await newUser();
  g.respond = () => ({ status: 503, error: { error: { status: "UNAVAILABLE", message: "overloaded" } } });
  const m = await send(page, "What is the speed of light?");
  assert.match(await m.textContent(), /isn't available right now/);
  assert.ok(await m.locator("[data-act=dwretry]").isVisible());
  g.respond = () => ({ text: "About 299,792 km per second." });
  await m.locator("[data-act=dwretry]").click();
  await page.waitForFunction(() => /299,792/.test(document.querySelector("#dwMsgs").textContent) && !document.querySelector("#dwMsgs .typing-msg"));
  assert.equal(await page.locator("#dwMsgs .msg.ai.error").count(), 0, "the error is replaced");
  assert.equal(await page.locator("#dwMsgs .msg.user").count(), 1, "the question isn't repeated");
});

test("the browser stops waiting after its own time limit (e.g. the server is asleep) and offers 'Try again'", async () => {
  const page = await newUser();
  await page.evaluate(() => { window.__DT_TEST__.DW.timeoutMs = 800; });
  await page.route("**/api/chat", () => {});   // never answers
  const m = await send(page, "Explain gravity");
  assert.match(await m.textContent(), /took too long/i);
  assert.ok(await m.locator("[data-act=dwretry]").isVisible());
  await page.unroute("**/api/chat");
  g.respond = () => ({ text: "Gravity pulls masses together." });
  await m.locator("[data-act=dwretry]").click();
  await page.waitForFunction(() => /Gravity pulls/.test(document.querySelector("#dwMsgs").textContent));
});

test("network failure: a clear message and 'Try again', no browser errors", async () => {
  const page = await newUser();
  await page.route("**/api/chat", r => r.abort("failed"));
  const m = await send(page, "What is 12 × 12?");
  assert.match(await m.textContent(), /couldn't reach the server/i);
  assert.ok(await m.locator("[data-act=dwretry]").isVisible());
});

test("long code lines scroll inside the code box; the answer never spills out of the window (desktop and phone)", async () => {
  const page = await newUser();
  g.respond = () => ({ text: "```js\nconst veryLongLine = [" + Array.from({ length: 60 }, (_, i) => i).join(", ") + "];\n```\n\n| a | b | c | d | e | f |\n|---|---|---|---|---|---|\n| one long cell value | two long cell value | three long cell value | four | five | six |" });
  const m = await send(page, "Show me a long line");
  const fit = () => page.evaluate(() => { const dw = document.getElementById("dw").getBoundingClientRect(); const els = [...document.querySelectorAll("#dwMsgs .msg.ai:last-child .bubble, #dwMsgs .msg.ai:last-child .md-code, #dwMsgs .msg.ai:last-child .md-table, #dwMsgs .msg.ai:last-child [data-act=dwcopy]")]; return els.map(e => e.getBoundingClientRect()).every(r => r.right <= dw.right + 0.5 && r.left >= dw.left - 0.5); });
  assert.ok(await fit(), "inside the window on desktop");
  assert.ok(await m.locator("pre").evaluate(e => e.scrollWidth > e.clientWidth && getComputedStyle(e).overflowX === "auto"), "the code scrolls sideways inside its box");
  await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(300);
  assert.ok(await fit(), "inside the window on a phone");
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
});
