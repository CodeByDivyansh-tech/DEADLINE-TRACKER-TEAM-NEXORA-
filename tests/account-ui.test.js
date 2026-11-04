// Accounts in the browser: log in screen, saving to the account, privacy between accounts, logging out.
const { test, before, after, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const { startServer } = require("./srv");
const { onboard, FIXED_NOW, pollPage } = require("./helpers");

let s, browser; const ctxs = [];
before(async () => { s = await startServer({}); browser = await chromium.launch(); });
after(async () => { await browser.close(); s.stop(); });
afterEach(async () => { while (ctxs.length) { const c = ctxs.pop(); const errs = c.__errors; await c.close(); assert.deepEqual(errs, [], "no errors in the browser"); } });

async function open(opts = {}){
  const ctx = await browser.newContext({ viewport: opts.viewport || { width: 1280, height: 860 }, timezoneId: "Asia/Kolkata", locale: "en-IN" });
  ctx.__errors = []; ctxs.push(ctx);
  const page = await ctx.newPage();
  page.on("pageerror", e => ctx.__errors.push(e.message));
  page.on("console", m => { if (m.type() === "error" && !/Failed to load resource|fonts\./.test(m.text())) ctx.__errors.push(m.text()); });
  if (opts.init) await page.addInitScript(opts.init);
  await page.clock.setFixedTime(FIXED_NOW);
  await page.goto(s.base + "/?dt-test");
  return page;
}
async function signupUI(page, name, email, password = "password123"){
  await page.waitForSelector(".auth-card");
  await page.click("[data-act=authmode][data-v=signup]");
  await page.fill("#au-name", name); await page.fill("#au-email", email); await page.fill("#au-pass", password);
  await page.click("#authGo");
  await page.waitForSelector("#onb-name, #app:not([hidden]), #authErr:not([hidden])");
  if (await page.isVisible("#authErr")) throw new Error("sign up failed: " + await page.textContent("#authErr") + " | fields: " + JSON.stringify(await page.evaluate(() => [...document.querySelectorAll(".auth-card input")].map(i => i.id + "=" + i.value))) + " title " + await page.textContent(".auth-card h1"));
}
async function loginUI(page, email, password = "password123"){
  await page.waitForSelector(".auth-card");
  await page.fill("#au-email", email); await page.fill("#au-pass", password);
  await page.click("#authGo");
}
const addTask = async (page, text) => { await page.fill("#addText", text); await page.press("#addText", "Enter"); await page.waitForTimeout(150); };
const titles = page => page.evaluate(() => window.__DT_TEST__.state.workspaces.flatMap(w => w.items.map(i => i.title)));
const serverVersion = page => page.evaluate(async () => (await (await fetch("/api/state")).json()).version);

test("account UI: the server asks you to log in first, and sign-up leads into setup with your name filled in", async () => {
  const page = await open();
  await page.waitForSelector(".auth-card");
  assert.equal(await page.isHidden("#app"), true, "nothing of the app before logging in");
  assert.match(await page.textContent(".auth-card h1"), /Welcome back/);
  await signupUI(page, "Divyansh Roy", "div@example.com");
  assert.equal(await page.inputValue("#onb-name"), "Divyansh");
});

test("account UI: tasks are saved to the account (not the browser) and come back after logging in elsewhere", async () => {
  const page = await open();
  await signupUI(page, "Asha", "asha@example.com");
  await onboard(page, { mode: "student", demo: false, name: "Asha" });
  await addTask(page, "Asha private essay due Fri 5pm");
  // the set-up and the new task may go to the server in one save, so wait for the task itself
  await pollPage(page, async () => JSON.stringify((await (await fetch("/api/state")).json()).state || "").includes("Asha private essay"), null, 5000);
  assert.equal(await page.evaluate(() => localStorage.getItem("deadline-tracker-v2")), null, "nothing left in this browser's storage");
  assert.match(await page.textContent("#syncLine"), /Saved to your account \(asha@example.com\)/);
  // another computer
  const other = await open();
  await loginUI(other, "asha@example.com");
  await other.waitForSelector("#app:not([hidden])");
  assert.ok((await titles(other)).includes("Asha private essay"));
});

test("account UI: another account never sees your tasks", async () => {
  const a = await open(); await signupUI(a, "Kiran", "kiran@example.com"); await onboard(a, { demo: false, name: "Kiran" });
  await addTask(a, "Kiran secret plan tomorrow");
  await pollPage(a, async () => JSON.stringify((await (await fetch("/api/state")).json()).state || "").includes("Kiran secret plan"), null, 5000);
  const b = await open(); await signupUI(b, "Bilal", "bilal@example.com");
  await onboard(b, { demo: false, name: "Bilal" });
  assert.ok(!(await titles(b)).some(t => /Kiran/.test(t)));
  assert.ok(!(await b.evaluate(async () => JSON.stringify(await (await fetch("/api/state")).json()))).includes("Kiran"));
});

test("account UI: wrong password shows a clear message; log out returns to the log in screen", async () => {
  const page = await open(); await signupUI(page, "Om", "om@example.com"); await onboard(page, { demo: false, name: "Om" });
  await page.click("[data-act=logout]");
  await page.waitForSelector(".auth-card");
  await loginUI(page, "om@example.com", "wrong-password");
  await page.waitForSelector("#authErr:not([hidden])");
  assert.match(await page.textContent("#authErr"), /Email or password is wrong/);
  await page.fill("#au-pass", "password123"); await page.click("#authGo");
  await page.waitForSelector("#app:not([hidden])");
});

test("account UI: tasks saved in this browser before having an account can be brought in", async () => {
  const seed = () => { if (!localStorage.getItem("seeded")) { localStorage.setItem("seeded", "1"); localStorage.setItem("deadline-tracker-v2", JSON.stringify({ v: 2, user: { name: "Old" }, active: "w1", workspaces: [{ id: "w1", name: "Old work", mode: "personal", items: [{ id: "x1", title: "Pay electricity bill", plan: "2026-10-30", status: "todo", priority: "medium" }], groups: [], members: [{ id: "me", name: "Old", role: "Owner" }], settings: { hoursPerDay: 3, workdays: [0,1,2,3,4,5,6], reminders: [1440, 60] } }] })); } };
  const page = await open({ init: seed });
  await signupUI(page, "Neha", "neha@example.com");
  await page.waitForSelector("#modalWrap.on");
  assert.match(await page.textContent("#modalWrap"), /Bring your saved tasks into your account/);
  await page.click("[data-act=confirmok]");
  await page.waitForSelector("#app:not([hidden])");
  assert.ok((await titles(page)).includes("Pay electricity bill"));
  await pollPage(page, async () => (await (await fetch("/api/state")).json()).version >= 1, null, 5000);
  assert.equal(await page.evaluate(() => localStorage.getItem("deadline-tracker-v2")), null, "moved, not copied");
});

// Audit bug (3 Nov): the browser's copy was deleted before the account had saved it; when the server refused the
// save (here an old short task id; also a network error), those tasks were lost from both places.
test("account UI: if the account can't save the brought-in tasks, the browser keeps its copy and says so", async () => {
  const seed = () => { if (!localStorage.getItem("seeded")) { localStorage.setItem("seeded", "1"); localStorage.setItem("deadline-tracker-v2", JSON.stringify({ v: 2, user: { name: "Old" }, active: "w1", workspaces: [{ id: "w1", name: "Old work", mode: "personal", items: [{ id: "x2", title: "Renew passport", plan: "2026-10-30", status: "todo", priority: "medium" }], groups: [], members: [{ id: "me", name: "Old", role: "Owner" }], settings: { hoursPerDay: 3, workdays: [0,1,2,3,4,5,6], reminders: [1440, 60] } }] })); } };
  const page = await open({ init: seed });
  await page.route("**/api/state", r => r.request().method() === "PUT" ? r.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ code: "starting", error: "The server is starting up." }) }) : r.continue());
  await signupUI(page, "Ravi", "ravi-import@example.com");
  await page.waitForSelector("#modalWrap.on"); await page.click("[data-act=confirmok]");
  await page.waitForSelector("#app:not([hidden])");
  await pollPage(page, () => /couldn't be saved to your account/i.test(document.getElementById("toastMsg").textContent), null, 6000);
  assert.ok(await page.evaluate(() => !!localStorage.getItem("deadline-tracker-v2")), "the browser still has the tasks");
  await page.unroute("**/api/state");
});

test("account UI: the log in screen fits a phone", async () => {
  const page = await open({ viewport: { width: 390, height: 844 } });
  await page.waitForSelector(".auth-card");
  const w = await page.evaluate(() => document.documentElement.scrollWidth);
  assert.ok(w <= 390, "no sideways scrolling: " + w);
  await page.screenshot({ path: "/tmp/ux/auth-phone.png" });
});
