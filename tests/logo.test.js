// The Deadline Tracker logo (the glass cube icon): browser tab icon, setup screen, sidebar, phone top bar, log-in screen and admin page.
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
  assert.equal(await page.getAttribute('link[rel="icon"]', "href"), "/favicon.ico?v=2");
  assert.equal(await page.locator(".onb .brandline .dt-logo").count(), 1);
  await onboard(page, { demo: false });
  const brand = page.locator("#side .brand");
  assert.equal(await brand.locator(".dt-logo").count(), 1);
  assert.match(await brand.textContent(), /Deadline Tracker/);
  const logo = brand.locator(".dt-logo");
  assert.equal(await logo.getAttribute("alt"), "", "decorative next to the name");
  // the app icon itself, built into the page (works with no server too), and actually drawn
  assert.equal(await logo.evaluate(e => e.tagName), "IMG");
  assert.match(await logo.getAttribute("src"), /^data:image\/webp;base64,/);
  assert.ok(await logo.evaluate(e => e.complete && e.naturalWidth >= 96), "the image loaded at a sharp size");
  const box = await logo.boundingBox(); assert.ok(Math.abs(box.width - 28) < 1 && Math.abs(box.height - 28) < 1);
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
    await p.waitForSelector("#ptNav .pt-logo img.dt-logo");   // the landing page's nav
    await p.click('#ptNav [data-pt="login"]');
    await p.waitForSelector(".auth-wrap .brandline .dt-logo");
    await p.goto(s.base + "/admin"); await p.waitForSelector("header img.dt-logo");
    assert.ok(await p.$eval("header img.dt-logo", e => e.complete && e.naturalWidth === 96));
    await p.close();
  } finally { s.stop(); }
  assert.match(fs.readFileSync(path.join(__dirname, "..", "README.md"), "utf8"), /<img src="icons\/icon-192\.png"/, "README shows the app icon");
});
