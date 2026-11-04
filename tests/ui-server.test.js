// The app in the browser, connected to the real server: Deadline AI window (Help + My Plan), notifications,
// account statistics and reminder settings.
const { test, before, after, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const { startServer, fakeGemini } = require("./srv");
const { onboard, pollPage } = require("./helpers");
const T = require("../lib/time");

let s, g, browser; const ctxs = [];
before(async () => { g = await fakeGemini().start(); s = await startServer({ GEMINI_API_KEY: "test-key", GEMINI_BASE_URL: g.url, REMINDER_INTERVAL_MS: "500" }); browser = await chromium.launch(); });
after(async () => { await browser.close(); s.stop(); g.close(); });
afterEach(async () => { while (ctxs.length) { const c = ctxs.pop(); const errs = c.__errors; await c.close(); assert.deepEqual(errs, [], "no errors in the browser"); } });

let n = 0;
async function newUser(opts = {}){
  const ctx = await browser.newContext({ viewport: opts.viewport || { width: 1366, height: 900 }, timezoneId: "Asia/Kolkata", locale: "en-IN" });
  ctx.__errors = []; ctxs.push(ctx);
  const page = await ctx.newPage();
  page.on("pageerror", e => ctx.__errors.push(e.message));
  page.on("console", m => { if (m.type() === "error" && !/Failed to load resource|fonts\./.test(m.text())) ctx.__errors.push(m.text()); });
  await page.goto(s.base + "/?dt-test");
  await page.waitForSelector(".auth-card");
  await page.click("[data-act=authmode][data-v=signup]");
  await page.fill("#au-name", "User " + (++n)); await page.fill("#au-email", `user${n}@example.com`); await page.fill("#au-pass", "password123");
  await page.click("#authGo");
  await page.waitForSelector("#onb-name");
  await onboard(page, { mode: "student", demo: false, name: "User" });
  await pollPage(page, async () => (await (await fetch("/api/state")).json()).version >= 1, null, 5000);
  return page;
}
const api = (page, method, url, body) => page.evaluate(async ([m, u, b]) => { const r = await fetch(u, { method: m, headers: b ? { "Content-Type": "application/json" } : {}, body: b ? JSON.stringify(b) : undefined }); return r.json(); }, [method, url, body]);
async function openAI(page, tab){ await page.click("#dwBtn"); await page.waitForSelector("#dw:not([hidden])"); if (tab) await page.click(`[data-act=dwtab][data-v=${tab}]`); }
async function sendAI(page, text){
  const k = await page.locator("#dwMsgs .msg.ai:not(.typing-msg)").count();
  await page.fill("#dwInput", text); await page.press("#dwInput", "Enter");
  await page.waitForFunction(k => document.querySelectorAll("#dwMsgs .msg.ai:not(.typing-msg)").length > k && !document.querySelector("#dwMsgs .typing"), k, { timeout: 8000 });
}

test("Deadline AI window: My Plan suggests from the server engine; saving creates real tasks", async () => {
  const page = await newUser();
  await openAI(page, "plan");
  assert.match(await page.textContent("#dwMode"), /Private planner on your server/);
  await sendAI(page, "I have a Java assignment tomorrow and a Maths test on Friday.");
  assert.match(await page.textContent("#dwMsgs .msg.ai:last-child"), /Planned on your server/);
  assert.ok(await page.locator("#dwMsgs .proposal .prop-row").count() >= 2);
  await page.click("#dwMsgs [data-act=propsave]");
  await page.waitForSelector("#dwMsgs .prop-tag.saved");
  const tasks = await api(page, "GET", "/api/tasks");
  assert.ok(tasks.tasks.some(t => t.title === "Java assignment"));
  const titles = await page.evaluate(() => window.__DT_TEST__.state.workspaces.flatMap(w => w.items.map(i => i.title)));
  assert.ok(titles.includes("Java assignment"), "the app shows the saved tasks");
  await page.waitForTimeout(800);
  const st = await api(page, "GET", "/api/state");
  assert.ok(st.state.workspaces[0].chat.some(m => m.proposal && m.proposal.status === "saved"), "the conversation shows it was saved");
});
test("Deadline AI window: Help answers from the guide with Gemini, shows sources, keeps history, and sends personal questions to My Plan", async () => {
  const page = await newUser();
  g.respond = () => ({ text: JSON.stringify({ found: true, kind: "website", answer: "1. Find the task.\n2. Press the bin button.", sources: [1] }) });
  await openAI(page, "help");
  assert.match(await page.textContent("#dwMode"), /Help guide \+ Google Gemini/);
  assert.match(await page.textContent("#dwMsgs"), /Your tasks are never sent/);
  await sendAI(page, "How do I delete a task?");
  const last = page.locator("#dwMsgs .msg.ai").last();
  assert.equal(await last.locator("ol li").count(), 2, "steps shown as a list");
  assert.match(await last.textContent(), /From the help guide/); assert.match(await last.textContent(), /Google Gemini/);
  await last.locator("[data-act=dwrate][data-v='1']").click();
  await page.reload(); await page.waitForSelector("#app:not([hidden])");
  await openAI(page, "help");
  await page.waitForFunction(() => /bin button/.test(document.querySelector("#dwMsgs").textContent));
  await page.fill("#dwInput", "what should I complete tomorrow?"); await page.press("#dwInput", "Enter");
  await page.waitForSelector("[data-act=dwtab][data-v=plan][aria-selected=true]");
  await page.waitForFunction(() => /tomorrow/i.test((document.querySelector("#dwMsgs .msg.ai:last-child") || {}).textContent || ""), null, { timeout: 6000 });
});
test("notifications: reminders made by the server's job appear in the bell; Mark all read updates the server", async () => {
  const page = await newUser();
  const soon = Date.now() + 40 * 60e3, tz = "Asia/Kolkata";
  await api(page, "POST", "/api/tasks", { title: "Submit scholarship form", dueDate: T.localDate(soon, tz), dueTime: T.localTime(soon, tz) });
  await pollPage(page, async () => (await (await fetch("/api/notifications")).json()).unread > 0, null, 6000);
  await page.reload(); await page.waitForSelector("#app:not([hidden])");
  await page.waitForSelector("#bellDot:not([hidden])");
  await page.click("#bellBtn");
  assert.match(await page.textContent("#notifPanel"), /Submit scholarship form" is due in/);
  await page.click("[data-act=readall]");
  await pollPage(page, async () => (await (await fetch("/api/notifications")).json()).unread === 0, null, 4000);
});
test("reports: account statistics come from the server; reminder settings update the account", async () => {
  const page = await newUser();
  const t = await api(page, "POST", "/api/tasks", { title: "Done thing", planDate: T.localDate(Date.now(), "Asia/Kolkata") });
  await api(page, "POST", `/api/tasks/${t.task.id}/complete`); await api(page, "POST", "/api/tasks", { title: "Open thing" });
  await page.evaluate(() => { location.hash = "reports"; });
  await page.waitForSelector(".acct-stats .as-grid");
  const txt = await page.textContent(".acct-stats");
  assert.match(txt, /Total tasks\s*2/); assert.match(txt, /Completed\s*1/); assert.match(txt, /Done of all tasks\s*50%/);
  await page.evaluate(() => { location.hash = "prefs"; }); await page.waitForSelector(".set-nav");
  await page.click("[data-act=settab][data-v=s-notif]");
  await page.click("#pf-sum");
  await pollPage(page, async () => (await (await fetch("/api/profile")).json()).user.notifyPrefs.dailySummary === false, null, 4000);
  assert.match(await page.textContent("#s-notif"), /even while this app is closed/);
});
test("reports: the account panel updates right after you finish a task, and its weekly bars are labelled", async () => {
  const page = await newUser();
  await page.fill("#addText", "Read chapter 4"); await page.waitForTimeout(40); await page.press("#addText", "Enter"); await page.waitForSelector(".todo:has-text(\"Read chapter 4\")");
  await page.evaluate(() => { location.hash = "reports"; });
  await page.waitForSelector(".acct-stats .as-grid");
  assert.match(await page.textContent(".acct-stats"), /Completed\s*0/);
  await page.evaluate(() => { location.hash = "overview"; });
  await page.click(".todo:has-text(\"Read chapter 4\") [data-act=toggle]");
  await page.evaluate(() => { location.hash = "reports"; });
  await page.waitForFunction(() => /Completed\s*1/.test(document.querySelector(".acct-stats") && document.querySelector(".acct-stats").textContent || ""), null, { timeout: 4000 });
  const labels = await page.$$eval(".as-weeks span small", xs => xs.map(x => x.textContent.trim()));
  assert.equal(labels.length, 8); assert.ok(labels.every(Boolean), "every bar names its week: " + labels.join(","));
  assert.match(await page.textContent(".acct-stats"), /Completed per week/);
});

test("reports for a brand-new member: no empty account panel full of zeros, just a clear next step", async () => {
  const page = await newUser();
  await page.evaluate(() => { location.hash = "reports"; });
  await page.waitForSelector(".empty-card");
  await pollPage(page, () => !document.querySelector(".acct-stats[aria-busy]"), null, 4000);
  assert.equal(await page.locator(".acct-stats").count(), 0);
});

test("phone: the Deadline AI window fills the screen without sideways scrolling", async () => {
  const page = await newUser({ viewport: { width: 390, height: 844 } });
  await openAI(page, "help");
  await page.waitForFunction(() => document.getElementById("dw").getAnimations().every(a => a.playState !== "running"));
  const box = await page.locator("#dw").boundingBox();
  assert.ok(box.width >= 389 && box.height >= 840, JSON.stringify(box));
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= 390));
  await page.screenshot({ path: "/tmp/ux/dw-phone.png" });
});
