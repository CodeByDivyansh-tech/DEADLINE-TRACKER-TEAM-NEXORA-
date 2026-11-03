// New members who start without sample data: Reports and the Study Planner explain what to do instead of showing
// made-up numbers ("0%", "On the day") or an empty picker. Once there is data, the normal views come back.
const { test, before, after, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { setup, newPage, onboard, go } = require("./helpers");

let env, page;
before(async () => { env = await setup(); });
after(async () => { await env.close(); });
beforeEach(async () => { page = await newPage(env); });
afterEach(async () => { assert.deepEqual(page.errors, [], "no errors in the browser"); await page.context().close(); });
const text = () => page.$eval("#viewInner", e => e.innerText.replace(/\s+/g, " "));

test("Reports with no deadlines: a clear empty state, no invented rates", async () => {
  await onboard(page, { demo: false });
  await go(page, "reports");
  const t = await text();
  assert.match(t, /No deadlines to report on yet/);
  assert.doesNotMatch(t, /On the day/, "no 'average finish' without any finished work");
  assert.doesNotMatch(t, /Completion rate\s*0%/);
  assert.equal(await page.locator("#viewInner [data-act=qa]").count() >= 1, true, "a button to add the first deadline");
});

test("links inside pages use the app's colour in both themes (not the browser's default blue)", async () => {
  await onboard(page, { demo: false });
  await go(page, "planner");
  for (const t of ["light", "dark"]) {
    await page.evaluate(t => document.documentElement.setAttribute("data-theme", t), t);
    const [link, accent] = await page.evaluate(() => { const a = [...document.querySelectorAll("#viewInner a")].find(x => /Change availability/.test(x.textContent)); const c = document.createElement("canvas").getContext("2d"); c.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim(); return [getComputedStyle(a).color, c.fillStyle]; });
    const hex = link.match(/\d+/g).slice(0, 3).map(n => (+n).toString(16).padStart(2, "0")).join("");
    assert.equal("#" + hex, accent, t + ": link colour");
  }
});

test("Reports with deadlines but nothing finished yet: rates show a dash, not 0%", async () => {
  await onboard(page, { demo: false });
  await page.fill("#addText", "Essay due tomorrow 5pm ~2h"); await page.waitForTimeout(40); await page.press("#addText", "Enter");
  await go(page, "reports");
  const t = await text();
  assert.doesNotMatch(t, /No deadlines to report on yet/);
  assert.match(t, /On-time rate\s*–/); assert.match(t, /Average finish\s*–/);
});

test("Study Planner with no deadlines: explains how to get a plan; the focus picker isn't an empty box", async () => {
  await onboard(page, { demo: false });
  await go(page, "planner");
  const t = await text();
  assert.match(t, /Nothing to plan yet/);
  assert.match(t, /~3h/, "shows how to give a time estimate");
  assert.equal(await page.locator("#focusItem").count(), 0, "no empty dropdown");
  assert.ok(await page.locator("#viewInner [data-act=qa]").count() >= 1);
});

test("Study Planner: a new deadline with an estimate appears in the plan at once and stays after a reload", async () => {
  await onboard(page, { demo: false });
  await page.fill("#addText", "Physics report due Friday 5pm ~3h"); await page.waitForTimeout(40); await page.press("#addText", "Enter");
  await go(page, "planner");
  assert.ok(await page.locator(".pday .sess:has-text('Physics report')").count() >= 1, "planned straight away");
  await page.reload(); await page.waitForSelector("#app:not([hidden])"); await go(page, "planner");
  assert.ok(await page.locator(".pday .sess:has-text('Physics report')").count() >= 1, "still there after a reload");
  assert.ok(await page.locator("#focusItem option:has-text('Physics report')").count() === 1);
});

test("with sample data the usual Reports and Planner are unchanged", async () => {
  await onboard(page, { demo: true });
  await go(page, "reports"); assert.match(await text(), /Completion rate\s*\d+%/);
  await go(page, "planner"); assert.ok(await page.locator(".pday .sess").count() > 3);
});

// Audit bug (3 Nov): two deadlines due at the same time in the same subject were drawn on the same spot of the
// Deadline Radar, so the one underneath couldn't be clicked or hovered.
test("Deadline Radar: no two dots overlap, so every deadline can be clicked", async () => {
  for (const mode of ["student", "company", "personal"]) {
    if (mode !== "student") { await page.context().close(); page = await newPage(env); }
    await onboard(page, { mode, demo: true });
    await go(page, mode === "company" ? "mywork" : "deadlines");
    const dots = await page.$$eval("svg .blip", cs => cs.map(c => ({ x: +c.getAttribute("cx"), y: +c.getAttribute("cy"), r: +c.getAttribute("r"), t: c.getAttribute("aria-label") })));
    assert.ok(dots.length >= 3, mode + ": dots drawn");
    for (let i = 0; i < dots.length; i++) for (let j = i + 1; j < dots.length; j++) {
      const a = dots[i], b = dots[j];
      assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= a.r + b.r, `${mode}: "${a.t}" and "${b.t}" overlap`);
    }
    for (const d of dots.slice(0, 6)) await page.locator(`svg .blip[aria-label="${d.t.replace(/"/g, '\\"')}"]`).click({ trial: true, timeout: 2000 });
  }
});
