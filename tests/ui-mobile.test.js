// Phone-size layout checks.
const { test, before, after, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { setup, newPage, onboard, go } = require("./helpers");

let env, page;
before(async () => { env = await setup(); });
after(async () => { await env.close(); });
beforeEach(async () => { page = await newPage(env, { viewport: { width: 390, height: 844 } }); });
afterEach(async () => { assert.deepEqual(page.errors, [], "no errors in the browser"); await page.context().close(); });

test("phone: bottom navigation replaces the sidebar and the + button opens quick add", async () => {
  await onboard(page);
  assert.equal(await page.isVisible("#bnav"), true);
  assert.equal(await page.isVisible("#side"), false);
  await page.click("#fab");
  assert.equal(await page.isVisible("#qaText"), true);
});

for (const mode of ["student", "company"]) {
  test(`phone: no page scrolls sideways (${mode})`, async () => {
    await onboard(page, { mode });
    const routes = await page.evaluate(() => [...document.querySelectorAll("#side .nav a")].map(a => a.dataset.route));
    const wide = [];
    for (const r of routes) {
      await go(page, r);
      const o = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth - window.innerWidth, view: (() => { const v = document.getElementById("view"); return v.scrollWidth - v.clientWidth; })() }));
      if (o.doc > 1 || o.view > 1) wide.push(`${r}: page +${o.doc}px, view +${o.view}px`);
    }
    assert.deepEqual(wide, []);
  });
}

test("phone: the details panel fills the screen and closes", async () => {
  await onboard(page);
  await go(page, "deadlines");
  await page.locator(".list .item .body").first().click();
  await page.waitForSelector(".drawer.on");
  const box = await page.locator("#drawer").boundingBox();
  assert.ok(box.width >= 389, `drawer width ${box.width}`);
  await page.click("[data-act=drclose]");
  await page.waitForTimeout(350);
  assert.equal(await page.locator(".drawer.on").count(), 0);
});

test("phone: every button at the bottom of the details panel is on screen", async () => {
  await onboard(page);
  await go(page, "deadlines");
  await page.locator(".item", { hasText: "DBMS normalization assignment" }).locator(".body").click(); // critical: Delete, Focus, Rescue, Mark as done
  await page.waitForSelector(".drawer.on"); await page.waitForTimeout(350);
  const off = await page.$$eval(".dr-f .btn", bs => bs.filter(b => { const r = b.getBoundingClientRect(); return r.right > window.innerWidth + 1 || r.left < -1; }).map(b => b.textContent.trim()));
  assert.deepEqual(off, []);
});

test("phone: nothing on the home screen or assistant is wider than its card", async () => {
  await onboard(page);
  for (const r of ["overview", "assistant", "todo"]) {
    await go(page, r);
    const bad = await page.evaluate(() => [...document.querySelectorAll(".hero *, .ai-chat *, .todo-head *, .todo-bar *")].filter(el => {
      const box = el.closest(".hero, .ai-chat, .todo-head, .todo-bar").getBoundingClientRect(); const r = el.getBoundingClientRect();
      return r.width > 0 && r.right > box.right + 1 && getComputedStyle(el).position !== "absolute";
    }).map(el => el.tagName + "." + el.className).slice(0, 5));
    assert.deepEqual(bad, [], r);
  }
});

test("phone: the Add box shows its whole example text (bug: the placeholder was cut off mid-word)", async () => {
  await onboard(page);
  await go(page, "overview");
  const m = await page.$eval("#addText", e => ({ sh: e.scrollHeight, ch: e.clientHeight }));
  assert.ok(m.sh <= m.ch + 1, `placeholder fits: scrollHeight ${m.sh}, clientHeight ${m.ch}`);
  await page.fill("#addText", "Call mom");
  const one = await page.$eval("#addText", e => e.getBoundingClientRect().height);
  assert.ok(one < 60, `with short text the box goes back to one line (${one}px)`);
});
