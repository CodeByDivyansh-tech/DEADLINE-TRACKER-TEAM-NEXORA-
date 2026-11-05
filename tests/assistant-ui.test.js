// The Deadline AI window: readable formatting (headings, lists, bold), nothing in an answer runs as HTML,
// money in the chosen currency, and a friendly message on errors.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const { startServer, fakeGemini } = require("./srv");
const { onboard } = require("./helpers");

let s, g, browser, page; const errors = [];
before(async () => {
  g = await fakeGemini().start(); s = await startServer({ GEMINI_API_KEY: "test-key", GEMINI_BASE_URL: g.url, AI_USER_DAILY: "50", GEMINI_RPM: "100" });
  browser = await chromium.launch();
  page = await (await browser.newContext({ timezoneId: "Asia/Kolkata" })).newPage();
  page.on("pageerror", e => errors.push(e.message));
  await page.goto(s.base + "/?dt-test"); await page.waitForSelector(".auth-card");
  await page.click("[data-act=authmode][data-v=signup]");
  await page.fill("#au-name", "Meera"); await page.fill("#au-email", "meera@example.com"); await page.fill("#au-pass", "password123");
  await page.click("#authGo"); await page.waitForSelector("#onb-name");
  await onboard(page, { demo: false, name: "Meera" });
});
after(async () => { await browser.close(); s.stop(); g.close(); assert.deepEqual(errors, []); });

async function ask(text){
  if (!(await page.isVisible("#dw"))) { await page.click("#dwBtn"); await page.waitForSelector("#dw:not([hidden])"); }
  await page.click("[data-act=dwtab][data-v=help]");
  const k = await page.locator("#dwMsgs .msg.ai:not(.typing-msg)").count();
  await page.fill("#dwInput", text); await page.press("#dwInput", "Enter");
  await page.waitForFunction(k => document.querySelectorAll("#dwMsgs .msg.ai:not(.typing-msg)").length > k && !document.querySelector("#dwMsgs .typing"), k, { timeout: 8000 });
  return page.locator("#dwMsgs .msg.ai:not(.typing-msg)").last();
}

test("assistant window: headings, lists and bold render; ₹ by default; HTML stays text", async () => {
  g.respond = () => ({ text: JSON.stringify({ found: true, kind: "general", answer: "## A simple monthly budget\nStart small and stay steady.\n- **Rent:** $5000\n- Savings: $150000 a year\n<img src=x onerror=alert(1)>", sources: [] }) });
  const m = await ask("How should a student make a monthly budget?");
  assert.equal(await m.locator(".md h4").textContent(), "A simple monthly budget");
  assert.equal(await m.locator(".md li").count(), 2);
  assert.equal(await m.locator(".md strong").textContent(), "Rent:");
  const txt = await m.textContent();
  assert.match(txt, /₹5,000/); assert.match(txt, /₹1,50,000/); assert.doesNotMatch(txt, /\$/);
  assert.equal(await m.locator("img").count(), 0, "no HTML from the answer");
  assert.match(txt, /<img src=x/, "shown as text instead");
});

test("assistant window: the currency chosen in Settings is used", async () => {
  await page.click("[data-act=dwclose]");
  await page.waitForSelector("#dw", { state: "hidden" }); // the window folds back into its button first
  await page.evaluate(() => { location.hash = "prefs"; }); await page.waitForSelector("#pf-currency");
  await page.selectOption("#pf-currency", "GBP");
  g.respond = () => ({ text: JSON.stringify({ found: true, kind: "general", answer: "Put $200 aside each week.", sources: [] }) });
  const m = await ask("A tip for saving money?");
  assert.match(await m.textContent(), /£200/);
});

test("assistant window: when the AI fails, a friendly message with Try again", async () => {
  g.respond = () => ({ status: 503, error: { error: { code: 503, message: "overloaded", status: "UNAVAILABLE" } } });
  const m = await ask("Explain photosynthesis in one line");
  assert.match(await m.textContent(), /try again/i);
  assert.equal(await m.locator("[data-act=dwretry]").count(), 1);
});
