// Deep Focus in the app: setup in the Study Planner, Normal and Strict Focus, real fullscreen, leaving the tab or
// window, the away screen, manual resume, refresh and reopen, end early, completion, break, statistics, phones,
// and the server version (saved in the account, isolated per person).
// The page clock is a controllable fake (time moves only when the test says so); tab switching is simulated by
// setting document.visibilityState, which is what the browser itself reports.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs"); const os = require("os"); const path = require("path");
const { setup, onboard, go: goReal, ws, pollPage, FIXED_NOW } = require("./helpers");
const { startServer } = require("./srv");

let env;
before(async () => { env = await setup(); });
after(async () => { await env.close(); });
const MIN = 60000;
// the page clock is paused, so animations (and the app's card reveals) only finish when time is moved on
async function go(page, route){ await page.evaluate(r => { location.hash = r; }, route); await page.clock.runFor(1500); await goReal(page, route); }
async function tap(page, sel){ await page.clock.runFor(800); await page.click(sel); }

async function newFocusPage(opts = {}){
  const ctx = await env.browser.newContext({ viewport: opts.viewport || { width: 1366, height: 900 }, timezoneId: "Asia/Kolkata", locale: "en-IN", colorScheme: opts.dark ? "dark" : "light" });
  const page = await ctx.newPage(); page.errors = [];
  page.on("pageerror", e => page.errors.push("pageerror: " + e.message));
  page.on("console", m => { if (m.type() === "error" && !/Failed to load resource|fonts\.(googleapis|gstatic)/.test(m.text())) page.errors.push("console: " + m.text()); });
  page.on("dialog", d => { page.lastDialog = d.type(); d.accept(); });
  await page.clock.install({ time: FIXED_NOW });
  await page.goto((opts.base || env.base) + "?dt-test");
  await page.clock.pauseAt(new Date(FIXED_NOW.getTime() + 1000));
  if (!opts.noOnboard) await onboard(page, { mode: "student", demo: true });
  return page;
}
// time passing with the page open (15-second steps, so the page's heartbeat keeps running)
async function pass(page, ms){ for (let t = 0; t < ms; t += 15000) await page.clock.fastForward(Math.min(15000, ms - t)); await page.clock.runFor(300); }
const vis = (page, v) => page.evaluate(v => { Object.defineProperty(document, "visibilityState", { configurable: true, get: () => v }); Object.defineProperty(document, "hidden", { configurable: true, get: () => v === "hidden" }); document.dispatchEvent(new Event("visibilitychange")); }, v);
const timeShown = page => page.textContent("#fzTime");
const local = page => page.evaluate(() => JSON.parse(localStorage.getItem("dt-focus-v1") || '{"sessions":[]}').sessions);
async function startFocus(page, { mode = "normal", minutes = 45, task, topic } = {}){
  await go(page, "planner"); await page.waitForSelector("#fzSetup");
  if (task) await page.selectOption("#fzTask", { label: task });
  if (topic) await page.fill("#fzTopic", topic);
  if ([25, 45, 60, 90].includes(minutes)) await page.click(`[data-act=fzlen][data-v="${minutes}"]`);
  else { await page.click('[data-act=fzlen][data-v="other"]'); await page.fill("#fzMins", String(minutes)); }
  await page.click(`[data-act=fzmode][data-v=${mode}]`);
  await page.click("#fzStart");
  if (mode === "strict") { await page.waitForSelector("[data-act=fzcommit]"); await page.click("[data-act=fzcommit]"); }
  await page.waitForSelector("#fzTime");
}

test("the Study Planner has the Deep Focus setup: a task, a length, Normal or Strict, and honest empty statistics", async () => {
  const page = await newFocusPage();
  await go(page, "planner");
  const setupText = await page.textContent("#fzSetup");
  assert.match(setupText, /What will you work on/); assert.match(setupText, /Normal Focus/); assert.match(setupText, /Strict Focus/);
  const opts = await page.$$eval("#fzTask option", os => os.map(o => o.textContent));
  assert.ok(opts.length >= 3 && opts.includes("Something else…"));
  assert.equal(await page.locator('[data-act=fzlen][aria-pressed="true"]').textContent(), "45 min");
  assert.match(await page.textContent("#fzStats"), /No focus sessions yet/);
  // "Something else" needs a name before it can start
  await page.selectOption("#fzTask", "other"); await page.click("#fzStart");
  assert.match(await page.textContent(".fz-msg"), /type what you'll work on/); assert.equal(await page.locator("#focusRoom:not([hidden])").count(), 0);
  // the focus button on a task opens the setup with that task chosen
  await go(page, "deadlines"); const row = page.locator("[data-act=focus]").first(); const id = await row.evaluate(b => b.closest("[data-id]").dataset.id);
  await row.click(); await page.waitForSelector("#fzSetup");
  assert.equal(await page.$eval("#fzTask", s => s.value), id);
  assert.deepEqual(page.errors, []);
});

test("Normal Focus: the dedicated room, an accurate countdown, pause and resume, leaving the tab pauses it and it carries on when you're back", async () => {
  const page = await newFocusPage();
  await startFocus(page, { mode: "normal", minutes: 45, topic: "Simple pendulum" });
  assert.ok(await page.evaluate(() => document.body.classList.contains("in-focus")), "the app behind is hidden");
  assert.ok(await page.evaluate(() => [[20, 200], [683, 450], [1340, 880]].every(([x, y]) => document.elementFromPoint(x, y).closest("#focusRoom"))), "the room covers the whole screen: no navigation");
  assert.equal(await timeShown(page), "45:00"); assert.match(await page.textContent(".fz-topic"), /Simple pendulum/);
  assert.match(await page.textContent("#fzState"), /Focusing/); assert.match(await page.textContent(".fz-subject"), /\w/);
  await pass(page, 10 * MIN); assert.equal(await timeShown(page), "35:00");
  await page.click("[data-act=fzpause]"); assert.match(await page.textContent("#fzState"), /Paused/);
  await pass(page, 5 * MIN); assert.equal(await timeShown(page), "35:00", "paused time isn't study time");
  await page.click("[data-act=fzresume]"); await pass(page, 5 * MIN); assert.equal(await timeShown(page), "30:00");
  // another tab: paused while away, resumes on return, says so gently
  await vis(page, "hidden"); await pass(page, 3 * MIN); await vis(page, "visible"); await page.clock.runFor(300);
  assert.equal(await timeShown(page), "30:00"); assert.match(await page.textContent(".fz-note"), /Welcome back[\s\S]*3 min/);
  assert.match(await page.textContent("#fzState"), /Focusing/);
  const s = (await local(page))[0];
  assert.equal(s.breaks.length, 2); assert.equal(s.breaks[1].kind, "tab");
  // minimise: back to the app with a small timer; open again
  await page.click("[data-act=fzmin]"); await page.waitForSelector(".focus-mini");
  assert.ok(await page.isVisible("#side")); assert.equal(await page.textContent("#fmTm"), "30:00");
  const free = await page.evaluate(() => { const b = document.querySelector(".focus-mini [data-act=fzopen]").getBoundingClientRect(); const top = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2); return !!top.closest(".focus-mini"); });
  assert.ok(free, "the small timer isn't covered by the Deadline AI button");
  await page.click(".focus-mini [data-act=fzopen]"); await page.waitForSelector("#fzTime");
  assert.deepEqual(page.errors, []);
});

test("Strict Focus: commitment screen, real fullscreen, and leaving fullscreen, the tab or the window pauses until a manual Resume", async () => {
  const page = await newFocusPage();
  await go(page, "planner"); await page.click("[data-act=fzmode][data-v=strict]");
  assert.match(await page.textContent("#fzStart"), /Start Strict Focus/);
  await page.click("#fzStart"); await page.waitForSelector(".fz-commit");
  const commit = await page.textContent(".fz-commit");
  assert.match(commit, /fullscreen/i); assert.match(commit, /can't stop you opening other tabs or apps/, "honest about what a website can do");
  assert.equal((await local(page)).length, 0, "nothing starts before the commitment");
  await page.click("[data-act=fzcommit]"); await page.waitForSelector("#fzTime");
  assert.ok(await page.evaluate(() => !!document.fullscreenElement), "really fullscreen");
  assert.equal(await page.locator("[data-act=fzmin]").count(), 0, "no minimise in Strict");
  await pass(page, 5 * MIN); assert.equal(await timeShown(page), "40:00");
  // leave fullscreen (Esc)
  await page.evaluate(() => document.exitFullscreen()); await page.waitForSelector(".fz-away");
  assert.match(await page.textContent(".fz-away h2"), /You left your study session!/);
  assert.match(await page.textContent(".fz-away"), /Your focus timer has been paused/);
  await pass(page, 2 * MIN);
  let away = await page.textContent(".fz-away");
  assert.match(away, /Interruptions\s*1/); assert.match(away, /Left fullscreen/); assert.match(away, /Total time away\s*2 min/); assert.match(away, /Time left\s*40:00/);
  // it does not start again by itself
  await pass(page, MIN); assert.equal(await page.locator(".fz-away").count(), 1);
  await page.click("#fzResume"); await page.waitForSelector("#fzTime");
  assert.ok(await page.evaluate(() => !!document.fullscreenElement), "Resume goes back into fullscreen");
  await pass(page, MIN); assert.equal(await timeShown(page), "39:00");
  // another tab: on return the away screen waits for Resume
  await vis(page, "hidden"); await pass(page, 2 * MIN); await vis(page, "visible"); await page.waitForSelector(".fz-away");
  assert.match(await page.textContent(".fz-away"), /Interruptions\s*2/); assert.match(await page.textContent(".fz-away"), /another tab or app/);
  await page.click("#fzResume"); await page.waitForSelector("#fzTime");
  // another window in front for more than 2 seconds (the page still visible)
  await page.evaluate(() => { document.hasFocus = () => false; window.dispatchEvent(new Event("blur")); });
  await page.clock.runFor(2500); await page.waitForSelector(".fz-away");
  assert.match(await page.textContent(".fz-away"), /another window/);
  await page.evaluate(() => { document.hasFocus = () => true; });
  const s = (await local(page))[0];
  assert.deepEqual(s.breaks.map(b => b.kind), ["fullscreen", "tab", "window"]); assert.equal(s.status, "INTERRUPTED");
  assert.equal(Math.round(FocusFocused(s) / MIN), 6, "6 minutes focused, the time away isn't counted");
  assert.deepEqual(page.errors, []);
  function FocusFocused(x){ return x.focusedMs; }
});

test("refresh and reopen: a Strict session asks before leaving and comes back paused; a Normal session carries on", async () => {
  const page = await newFocusPage();
  await startFocus(page, { mode: "strict", minutes: 25 });
  await pass(page, 4 * MIN);
  page.lastDialog = null; await page.reload(); await page.waitForSelector(".fz-away");
  assert.equal(page.lastDialog, "beforeunload", "the browser asked before leaving a running Strict session");
  assert.match(await page.textContent(".fz-away"), /Reloaded the page|another tab or app/);
  assert.match(await page.textContent(".fz-away"), /Time left\s*21:00/);
  await page.click("#fzResume"); await page.waitForSelector("#fzTime"); assert.equal(await timeShown(page), "21:00");
  await page.click("[data-act=fzend]"); await page.click("[data-act=fzendyes]"); await page.waitForSelector(".fz-done");
  await page.click("[data-act=fzclose]");
  // Normal: a refresh doesn't stop the session
  await startFocus(page, { mode: "normal", minutes: 25 }); await pass(page, 3 * MIN);
  await page.reload(); await page.waitForSelector("#fzTime"); await page.clock.runFor(300);
  assert.equal(await timeShown(page), "22:00"); assert.match(await page.textContent("#fzState"), /Focusing/);
  assert.equal((await local(page)).filter(s => ["ACTIVE", "PAUSED", "INTERRUPTED"].includes(s.status)).length, 1, "still one open session");
});

test("end early asks first, keeps the focused minutes and logs them on the task once", async () => {
  const page = await newFocusPage();
  await go(page, "planner"); const taskId = await page.$eval("#fzTask", s => s.value);
  const before = (await ws(page)).items.find(i => i.id === taskId).loggedMin || 0;
  await startFocus(page, { mode: "normal", minutes: 45 }); await pass(page, 12 * MIN);
  await page.click("[data-act=fzend]"); assert.match(await page.textContent(".fz-confirm"), /End this session now\?[\s\S]*12 min/);
  await page.click("[data-act=fzendno]"); assert.equal(await page.locator(".fz-confirm").count(), 0); assert.match(await page.textContent("#fzState"), /Focusing/);
  await page.click("[data-act=fzend]"); await page.click("[data-act=fzendyes]"); await page.waitForSelector(".fz-done");
  const done = await page.textContent(".fz-done");
  assert.match(done, /Session ended early/); assert.match(done, /Focused\s*12 min/); assert.match(done, /Planned\s*45 min/); assert.match(done, /Status\s*Ended early/);
  await pollPage(page, async () => true, null, 200);
  await page.waitForFunction(([id, b]) => { const w = window.__DT_TEST__.state.workspaces.find(x => x.id === window.__DT_TEST__.state.active); return (w.items.find(i => i.id === id).loggedMin || 0) === b + 12; }, [taskId, before]);
  await page.reload(); await page.waitForSelector("#app:not([hidden])"); await page.clock.runFor(500);
  assert.equal(await page.locator(".fz-done").count(), 0, "the report is shown once");
  assert.equal(((await ws(page)).items.find(i => i.id === taskId).loggedMin || 0), before + 12, "logged once, not again after a reload");
});

test("completing: the success report, no way to restart it, then a break that doesn't start another session by itself", async () => {
  const page = await newFocusPage();
  await startFocus(page, { mode: "normal", minutes: 25, topic: "Oscillations" });
  await pass(page, 5 * MIN); await page.click("[data-act=fzpause]"); await pass(page, 2 * MIN); await page.click("[data-act=fzresume]");
  await vis(page, "hidden"); await pass(page, MIN); await vis(page, "visible");
  await pass(page, 20 * MIN + 15000); await page.waitForSelector(".fz-done");
  const rep = await page.textContent(".fz-done");
  assert.match(rep, /Excellent work! You completed your study session\./);
  for (const re of [/Subject/, /Task[\s\S]*Oscillations/, /Planned\s*25 min/, /Focused\s*25 min/, /Break time\s*2 min/, /Time away\s*1 min/, /Interruptions\s*1/, /Status\s*Completed/]) assert.match(rep, re);
  assert.ok(!(await page.evaluate(() => !!document.fullscreenElement)));
  const s = (await local(page))[0]; assert.equal(s.status, "COMPLETED"); assert.equal(s.focusedMs, 25 * MIN);
  assert.ok(Math.abs(s.endedAt - s.startedAt - 28 * MIN) < 2000, "ended the moment the timer reached zero (25 min focus + 2 min break + 1 min away)");
  assert.equal(await page.locator("[data-act=fzresume], [data-act=fzpause]").count(), 0);
  // break
  await page.click("[data-act=fzbreak]"); await page.waitForSelector(".fz-break");
  assert.equal(await page.textContent("#fzBrTime"), "05:00");
  await page.click('[data-act=fzbreaklen][data-v="10"]'); await pass(page, MIN); assert.equal(await page.textContent("#fzBrTime"), "09:00");
  await page.click("[data-act=fzbreakend]"); await page.waitForSelector("text=Break's over.");
  await pass(page, 5 * MIN); assert.equal((await local(page)).length, 1, "no new session starts by itself");
  await page.click(".fz-break [data-act=fzagain]"); await page.waitForSelector("#fzSetup");
  assert.equal(await page.locator("#focusRoom:not([hidden])").count(), 0);
  assert.equal(await page.locator('[data-act=fzlen][aria-pressed="true"]').textContent(), "25 min", "the same choices, ready to start again");
  assert.equal(await page.inputValue("#fzTopic"), "Oscillations");
  assert.deepEqual(page.errors, []);
});

test("one session at a time: a double click starts one, and Start with a session open brings it back", async () => {
  const page = await newFocusPage();
  await go(page, "planner");
  await page.click("#fzStart", { clickCount: 2 }); await page.waitForSelector("#fzTime");
  await page.evaluate(() => document.querySelector("[data-act=fzstart]") && document.querySelector("[data-act=fzstart]").click());
  assert.equal((await local(page)).length, 1);
  await page.click("[data-act=fzmin]"); await go(page, "planner");
  assert.match(await page.textContent("#fzSetup"), /You have a focus session open/);
  await page.click("#fzStart"); await page.waitForSelector("#fzTime");
  assert.equal((await local(page)).length, 1);
});

test("statistics in the Study Planner and Reports come from the sessions: today, week, planned vs actual, subjects, streak, interruptions", async () => {
  const page = await newFocusPage();
  await go(page, "planner"); const label = await page.$eval("#fzTask", s => s.selectedOptions[0].textContent); const subject = label.split(" · ")[1];
  await startFocus(page, { mode: "normal", minutes: 25 }); await vis(page, "hidden"); await pass(page, 2 * MIN); await vis(page, "visible");
  await pass(page, 25 * MIN + 15000); await page.waitForSelector(".fz-done"); await page.click("[data-act=fzclose]");
  await startFocus(page, { mode: "normal", minutes: 45 }); await pass(page, 15 * MIN); await page.click("[data-act=fzend]"); await page.click("[data-act=fzendyes]"); await page.waitForSelector(".fz-done"); await page.click("[data-act=fzclose]");
  await page.waitForFunction(() => /Focused today/.test((document.querySelector("#fzStats") || {}).textContent || ""));
  const st = await page.textContent("#fzStats");
  assert.match(st, /Focused today\s*40 min\s*2 sessions/); assert.match(st, /This week\s*40 min\s*57% of 1 h 10 min planned/);
  assert.match(st, /Completed\s*1\s*1 ended early/); assert.match(st, /Streak\s*1 day/); assert.match(st, /Interruptions\s*1\s*2 min away/);
  assert.match(st, new RegExp("By subject[\\s\\S]*" + subject.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "[\\s\\S]*40 min"));
  assert.match(st, /Recent sessions/);
  assert.equal(await page.locator("#fzStats .fz-day").count(), 7);
  const h = await page.$eval("#fzStats .fz-day.today .fo", e => e.style.height); assert.equal(h, "57.1%", "today's bar: 40 of 70 planned minutes (the tallest bar is the plan)");
  await go(page, "reports"); await page.waitForFunction(() => /Focused today/.test((document.querySelector("#fzStats") || {}).textContent || ""));
  assert.match(await page.textContent("#fzStats"), /This week\s*40 min/);
});

for (const [name, opts] of [["phone (390 px)", { viewport: { width: 390, height: 844 } }], ["phone (390 px), dark theme", { viewport: { width: 390, height: 844 }, dark: true }]]) {
  test(`${name}: setup, room, away screen, report and statistics fit with no sideways scrolling`, async () => {
    const page = await newFocusPage(opts);
    const fits = async what => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= 390 && [...document.querySelectorAll("#focusRoom, #fzSetup, #fzStats")].every(e => e.scrollWidth <= e.clientWidth + 1)), what);
    await go(page, "planner"); await fits("setup");
    await startFocus(page, { mode: "strict", minutes: 25 }); await fits("room");
    await page.evaluate(() => document.exitFullscreen()); await page.waitForSelector(".fz-away"); await fits("away");
    await page.click("#fzResume"); await page.waitForSelector("#fzTime");
    await pass(page, 25 * MIN + 15000); await page.waitForSelector(".fz-done"); await fits("report");
    await page.click("[data-act=fzclose]"); await page.waitForFunction(() => /Focused today/.test((document.querySelector("#fzStats") || {}).textContent || "")); await fits("statistics");
    assert.deepEqual(page.errors, []);
  });
}

test("with an account: sessions are saved on the server, come back after the browser is closed and reopened, and stay private", async () => {
  const clockFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "dt-clock-")), "offset"); fs.writeFileSync(clockFile, "0");
  const s = await startServer({ DT_TEST_CLOCK_FILE: clockFile });
  try {
    const signupPage = async (name, email) => {
      const page = await newFocusPage({ base: s.base + "/", noOnboard: true });
      await page.waitForSelector(".auth-card"); await tap(page, "[data-act=authmode][data-v=signup]");
      await page.fill("#au-name", name); await page.fill("#au-email", email); await page.fill("#au-pass", "password123");
      await tap(page, "#authGo"); await page.waitForSelector("#onb-name"); await onboard(page, { mode: "student", demo: true, name });
      return page;
    };
    const page = await signupPage("Asha", "asha.focus@example.com");
    await startFocus(page, { mode: "normal", minutes: 45, topic: "Assignment operators" });
    const sv = await page.evaluate(async () => (await (await fetch("/api/focus")).json()).session);
    assert.equal(sv.status, "ACTIVE"); assert.equal(sv.topic, "Assignment operators"); assert.equal(await page.evaluate(() => localStorage.getItem("dt-focus-v1")), null, "kept in the account, not the browser");
    // close the browser without a word (no events), wait two minutes, open it again and log in
    await page.context().close(); fs.writeFileSync(clockFile, String(2 * MIN));
    const again = await newFocusPage({ base: s.base + "/", noOnboard: true });
    await again.waitForSelector(".auth-card"); await again.clock.runFor(800); await again.fill("#au-email", "asha.focus@example.com"); await again.fill("#au-pass", "password123"); await tap(again, "#authGo");
    await again.waitForSelector("#fzTime"); await again.clock.runFor(300);
    assert.match(await again.textContent(".fz-task"), /\w/); assert.match(await again.textContent(".fz-topic"), /Assignment operators/);
    const back = await again.evaluate(async () => (await (await fetch("/api/focus")).json()).session);
    assert.equal(back.id, sv.id); assert.equal(back.report.lastInterruption.kind, "closed");
    // another person sees nothing of it
    const ben = await signupPage("Ben", "ben.focus@example.com");
    assert.equal(await ben.locator("#focusRoom:not([hidden])").count(), 0);
    assert.equal(await ben.evaluate(async () => (await (await fetch("/api/focus")).json()).session), null);
    assert.equal(await ben.evaluate(async id => (await fetch(`/api/focus/sessions/${id}/end`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).status, back.id), 404);
    assert.deepEqual(again.errors, []);
  } finally { s.stop(); }
});
