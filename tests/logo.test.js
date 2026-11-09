// The Deadline Tracker logo: browser tab icon, setup screen, sidebar, phone top bar, log-in screen and admin page.
const { test, before, after, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs"); const path = require("path");
const { setup, newPage, onboard } = require("./helpers");
const { startServer } = require("./srv");

let env, page;
before(async () => { env = await setup(); });
after(async () => { await env.close(); });
afterEach(async () => { if (page) { assert.deepEqual(page.errors, []); await page.context().close(); page = null; } });

test("logo: a tab icon, and the logo on the setup screen and in the sidebar", async () => {
  page = await newPage(env);
  assert.match(await page.getAttribute('link[rel="icon"]', "href"), /^data:image\/svg\+xml/);
  assert.equal(await page.locator(".onb .brandline .dt-logo").count(), 1);
  await onboard(page, { demo: false });
  const brand = page.locator("#side .brand");
  assert.equal(await brand.locator(".dt-logo").count(), 1);
  assert.match(await brand.textContent(), /Deadline Tracker/);
  assert.equal(await brand.locator(".dt-logo").getAttribute("role"), null, "decorative next to the name");
  // several logos on one page don't share SVG ids
  const ids = await page.$$eval(".dt-logo linearGradient", gs => gs.map(g => g.id));
  assert.equal(new Set(ids).size, ids.length);
});
test("logo: shown in the top bar on a phone, where the sidebar is hidden", async () => {
  page = await newPage(env, { viewport: { width: 390, height: 844 } });
  await onboard(page, { demo: false });
  assert.ok(await page.locator(".topbar .m-brand .dt-logo").isVisible());
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= 390));
});
test("logo: on the log-in screen and the admin page; a logo file for the README", async () => {
  const s = await startServer({});
  try {
    const p = await env.browser.newPage(); await p.goto(s.base);
    await p.waitForSelector("#ptNav .pt-logo svg");   // the landing page's nav
    await p.click('#ptNav [data-pt="login"]');
    await p.waitForSelector(".auth-wrap .brandline .dt-logo");
    await p.goto(s.base + "/admin"); await p.waitForSelector("header .dt-logo");
    await p.close();
  } finally { s.stop(); }
  assert.match(fs.readFileSync(path.join(__dirname, "..", "logo.svg"), "utf8"), /<svg[\s\S]*Deadline Tracker/);
});
