// Reminders: friendly messages, real timing, no duplicates, notification center, desktop notifications with permission on demand.
const { test, before, after, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { setup, newPage, onboard, go, ws } = require("./helpers");

let env, page;
before(async () => { env = await setup(); });
after(async () => { await env.close(); });
afterEach(async () => { if (page) { assert.deepEqual(page.errors, [], "no errors in the browser"); await page.context().close(); page = null; } });

// Records desktop notifications instead of showing them.
const FAKE_NOTIFICATION = `
  window.__notes = []; window.__permAsked = 0; window.__perm = "default";
  window.Notification = class { constructor(title, o) { window.__notes.push({ title, body: o && o.body, tag: o && o.tag }); }
    static get permission() { return window.__perm; }
    static requestPermission() { window.__permAsked++; window.__perm = "granted"; return Promise.resolve("granted"); } };`;

async function open(opts = {}) { page = await newPage(env, opts); await onboard(page, { demo: false }); }
// Adds a task directly through the app's own state, then lets the reminder engine run.
async function addItem(o) {
  await page.evaluate(o => { const T = window.__DT_TEST__; const w = T.W(); const it = T.mkItem(w, o); w.items.push(it); T.save(); T.render(); }, o);
  await page.waitForTimeout(1300);
}
const inbox = () => page.evaluate(() => (window.__DT_TEST__.state.inbox || []).map(n => n.text));
const later = async iso => { await page.clock.setFixedTime(new Date(iso)); await page.waitForTimeout(1400); };

test("reminder: deadline tomorrow gets the friendly message", async () => {
  await open();
  await addItem({ title: "Java assignment", kind: "deadline", due: "2026-10-31T10:00", reminders: [1440] });
  const msgs = await inbox();
  assert.ok(msgs.includes("Your Java assignment deadline is tomorrow. Don't forget to complete and submit it!"), msgs.join(" | "));
});

test("reminder: fires at the right moment, not before", async () => {
  await open();
  await addItem({ title: "Team call", kind: "todo", plan: "2026-10-30", time: "12:30", reminders: [15] });
  assert.ok(!(await inbox()).some(t => /Team call/.test(t)), "not yet at 12:00");
  await later("2026-10-30T12:16:00+05:30");
  assert.ok((await inbox()).some(t => /Team call/.test(t) && /15 minutes/.test(t)), (await inbox()).join(" | "));
});

test("reminder: one-hour and approaching messages", async () => {
  await open();
  await addItem({ title: "Project report", kind: "deadline", due: "2026-10-30T12:45", reminders: [60] });
  await addItem({ title: "Lab record", kind: "deadline", due: "2026-11-02T10:00", reminders: [4320] });
  const msgs = await inbox();
  assert.ok(msgs.some(t => /Project report/.test(t) && /due in one hour/.test(t)), msgs.join(" | "));
  assert.ok(msgs.some(t => /Lab record/.test(t) && /deadline is approaching/.test(t)), msgs.join(" | "));
});

test("reminder: daily summary of pending tasks", async () => {
  await open();
  for (const t of ["A", "B", "C"]) await page.evaluate(t => { const T = window.__DT_TEST__; const w = T.W(); w.items.push(T.mkItem(w, { title: t, kind: "todo", plan: "2026-10-30" })); T.save(); }, t);
  await later("2026-10-30T12:01:00+05:30");
  assert.ok((await inbox()).includes("You have 3 pending tasks today."), (await inbox()).join(" | "));
});

test("reminder: never duplicated, even after reloading", async () => {
  await open();
  await addItem({ title: "Java assignment", kind: "deadline", due: "2026-10-31T10:00", reminders: [1440] });
  await page.waitForTimeout(1500);
  const n1 = (await inbox()).filter(t => /Java assignment/.test(t)).length;
  await page.reload(); await page.waitForSelector("#app:not([hidden])"); await page.waitForTimeout(1500);
  const n2 = (await inbox()).filter(t => /Java assignment/.test(t)).length;
  assert.equal(n1, 1); assert.equal(n2, 1);
});

test("reminder: completed tasks don't remind", async () => {
  await open();
  await addItem({ title: "Done thing", kind: "deadline", due: "2026-10-31T10:00", reminders: [1440], status: "done", doneAt: "2026-10-30T06:00:00.000Z" });
  assert.ok(!(await inbox()).some(t => /Done thing/.test(t)));
});

test("notification center: read, dismiss, and both persist", async () => {
  await open();
  await addItem({ title: "Java assignment", kind: "deadline", due: "2026-10-31T10:00", reminders: [1440] });
  await page.click("#bellBtn");
  const item = page.locator("#notifPanel li", { hasText: "Java assignment" });
  assert.equal(await item.count(), 1);
  await item.locator("[data-act=ndismiss]").click();
  assert.equal(await page.locator("#notifPanel li", { hasText: "Java assignment" }).count(), 0);
  await page.click("[data-act=readall]");
  assert.equal(await page.isHidden("#bellDot"), true);
  await page.reload(); await page.waitForSelector("#app:not([hidden])"); await page.waitForTimeout(1300);
  assert.equal(await page.isHidden("#bellDot"), true);
  await page.click("#bellBtn");
  assert.equal(await page.locator("#notifPanel li", { hasText: "Java assignment" }).count(), 0);
});

test("desktop notifications: permission is asked only on click, then reminders arrive as real notifications", async () => {
  await open({ init: FAKE_NOTIFICATION });
  await page.waitForTimeout(1300);
  assert.equal(await page.evaluate(() => window.__permAsked), 0, "not asked on load");
  await page.click("#bellBtn");
  await page.click("#desktopAlertsBtn");
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(() => window.__permAsked), 1);
  await addItem({ title: "Team call", kind: "todo", plan: "2026-10-30", time: "12:30", reminders: [15] });
  assert.equal((await page.evaluate(() => window.__notes)).filter(n => /Team call/.test(n.body)).length, 0);
  await later("2026-10-30T12:16:00+05:30");
  const notes = await page.evaluate(() => window.__notes);
  assert.equal(notes.filter(n => /Team call/.test(n.body)).length, 1, JSON.stringify(notes));
  await page.waitForTimeout(1500);
  assert.equal((await page.evaluate(() => window.__notes)).filter(n => /Team call/.test(n.body)).length, 1, "only once");
});

test("desktop notifications: settings explain the limits honestly", async () => {
  await open();
  await go(page, "prefs");
  const t = await page.textContent("#s-notif");
  assert.match(t, /while the app is open/i);
  assert.match(t, /closed/i);
});
