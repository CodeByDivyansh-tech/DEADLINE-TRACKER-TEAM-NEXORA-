// Sound effects: a soft click on buttons, a chime for success, a low tone for errors; never while typing;
// silent until the person interacts; a switch in Settings turns them off (remembered).
const { test, before, after, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { setup, newPage, onboard, go } = require("./helpers");

let env, page;
before(async () => { env = await setup(); });
after(async () => { await env.close(); });
afterEach(async () => { if (page) { assert.deepEqual(page.errors, [], "no errors in the browser"); await page.context().close(); page = null; } });

const log = () => page.evaluate(() => window.__DT_TEST__.SFX.log.slice());
const clear = () => page.evaluate(() => { window.__DT_TEST__.SFX.log.length = 0; });

test("sound: nothing plays before the first interaction", async () => {
  page = await newPage(env);
  assert.deepEqual(await log(), []);
  assert.equal(await page.evaluate(() => window.__DT_TEST__.SFX.armed), false);
});

test("sound: click on a button, success when a task is added, no sound while typing", async () => {
  page = await newPage(env); await onboard(page, { demo: false });
  await clear();
  await page.click("#themeBtn");
  assert.deepEqual(await log(), ["click"]);
  await clear();
  await page.click("#addText"); await page.keyboard.type("Call Priya");
  assert.deepEqual(await log(), [], "typing and focusing a field are silent");
  await page.keyboard.press("Enter");
  assert.deepEqual(await log(), ["success"]);
});

test("sound: an error gets its own tone", async () => {
  page = await newPage(env); await onboard(page, { demo: false });
  await clear();
  await page.click("#addText-go"); // nothing typed
  assert.ok((await log()).includes("error"));
});

test("sound: the Settings switch turns sounds off, and it's remembered", async () => {
  page = await newPage(env); await onboard(page, { demo: false });
  await go(page, "prefs");
  const sw = page.locator("#pf-sound");
  assert.equal(await sw.isChecked(), true, "on by default");
  await sw.uncheck();
  await clear();
  await page.click("#themeBtn");
  assert.deepEqual(await log(), []);
  await page.reload(); await page.waitForSelector("#app:not([hidden])");
  await go(page, "prefs");
  assert.equal(await page.isChecked("#pf-sound"), false);
});
