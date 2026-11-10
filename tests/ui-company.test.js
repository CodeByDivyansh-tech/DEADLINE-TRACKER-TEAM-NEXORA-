// Company workflows: roles, board, approvals, workload, reassigning.
const { test, before, after, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { setup, newPage, onboard, go, ws, itemByTitle } = require("./helpers");

let env, page;
before(async () => { env = await setup(); });
after(async () => { await env.close(); });
beforeEach(async () => { page = await newPage(env); await onboard(page, { mode: "company", demo: true }); });
afterEach(async () => { assert.deepEqual(page.errors, [], "no errors in the browser"); await page.context().close(); });

const navRoutes = () => page.$$eval("#side .nav a", as => as.map(a => a.dataset.route));
const viewAs = async v => { await page.selectOption("#viewAs", v); await page.waitForTimeout(120); };

test("managers see Workload, Approvals and Reports; employees don't", async () => {
  assert.deepEqual(await navRoutes(), ["overview", "daily", "habits", "assistant", "calendar", "mywork", "team", "workload", "approvals", "planner", "reports", "prefs"]);
  await viewAs("p");
  assert.deepEqual(await navRoutes(), ["overview", "daily", "habits", "assistant", "calendar", "mywork", "team", "planner", "prefs"]);
});

test("an employee who opens a manager-only page by address is sent to Overview", async () => {
  await viewAs("p");
  await go(page, "approvals");
  assert.equal(await page.textContent("#pageTitle"), "Today");
});

test("dragging a card from To do to In progress changes its status", async () => {
  await go(page, "team");
  const id = await page.locator('.col[data-col="todo"] .kcard').first().getAttribute("data-id");
  await page.dragAndDrop(`.kcard[data-drag="${id}"]`, '.col[data-col="doing"] .col-h');
  assert.equal((await ws(page)).items.find(i => i.id === id).status, "doing");
});

test("employees can only drag their own cards", async () => {
  await viewAs("p");
  await go(page, "team");
  const cards = await page.$$eval(".kcard", cs => cs.map(c => ({ draggable: c.getAttribute("draggable"), mine: !c.querySelector(".ro") })));
  assert.ok(cards.length > 5);
  cards.forEach(c => assert.equal(c.draggable === "true", c.mine));
});

test("employee submits work for review, manager approves it", async () => {
  await viewAs("p");
  await go(page, "mywork");
  await page.locator(".item", { hasText: "Homepage design mockups" }).locator(".check").click();
  await page.waitForSelector(".drawer.on");
  assert.equal(await page.getAttribute('[data-act=tab][data-v=proof]', "aria-selected"), "true");
  await page.fill("#ev-link", "https://figma.example.com/homepage-v3");
  await page.fill("#ev-note", "Final desktop and mobile frames");
  await page.click("[data-act=submitreview]");
  let it = await itemByTitle(page, "Homepage design mockups");
  assert.equal(it.status, "review");
  assert.equal(it.evidence.link, "https://figma.example.com/homepage-v3");
  await page.click("[data-act=drclose]");
  await viewAs("manager");
  await go(page, "approvals");
  const row = page.locator(".appr", { hasText: "Homepage design mockups" });
  assert.match(await row.textContent(), /figma\.example\.com/);
  await row.locator("[data-act=approve]").click();
  it = await itemByTitle(page, "Homepage design mockups");
  assert.equal(it.status, "done");
  assert.equal(it.approval.state, "approved");
  assert.ok(it.approval.history.length >= 2);
});

test("requesting changes without a note asks for one first", async () => {
  await go(page, "approvals");
  await page.locator(".appr").first().locator("[data-act=changes]").click();
  await page.waitForSelector(".drawer.on");
  assert.equal(await page.isVisible("#ap-note"), true);
  await page.fill("#ap-note", "Please add the unsubscribe footer");
  await page.click(".drawer [data-act=changes]");
  const w = await ws(page);
  const it = w.items.find(i => i.approval && i.approval.state === "changes");
  assert.ok(it);
  assert.equal(it.status, "doing");
  assert.match(it.approval.history[0].text, /unsubscribe footer/);
});

test("workload shows every team member and a 14-day heat map", async () => {
  await go(page, "workload");
  const members = (await ws(page)).members.length;
  assert.equal(await page.locator(".wl-row").count(), members);
  assert.equal(await page.locator(".heat .cell").count(), members * 14);
});

test("manager can reassign from Rescue mode", async () => {
  await go(page, "all");
  await page.locator(".item", { hasText: "Fix checkout crash on Android" }).locator("[data-act=rescue]").click();
  await page.waitForSelector("#rs-who");
  await page.selectOption("#rs-who", "k");
  await page.click("[data-act=rsReassign]");
  assert.equal((await itemByTitle(page, "Fix checkout crash on Android")).assignee, "k");
});

test("employee in Rescue mode can notify the manager, who sees it in notifications", async () => {
  await viewAs("r");
  await go(page, "mywork");
  await page.locator(".item", { hasText: "Fix checkout crash on Android" }).locator("[data-act=rescue]").click();
  await page.fill("#rs-note", "Need a test device");
  await page.click("[data-act=rsNotify]");
  await page.click("[data-act=mclose]");
  await viewAs("manager");
  await page.click("#bellBtn");
  assert.match(await page.textContent("#notifPanel"), /Rahul Verma needs help with "Fix checkout crash on Android".*Need a test device/);
});

test("the Add box with @name assigns the right person (manager only)", async () => {
  await page.click("#qaBtn");
  await page.fill("#qaText", "Write release notes tomorrow 4pm @karan ~2h");
  assert.match(await page.textContent("#qaText-hint"), /for Karan Mehta/);
  await page.press("#qaText", "Enter");
  assert.equal((await itemByTitle(page, "Write release notes")).assignee, "k");
});

test("workload: member cards keep their contents inside, badges keep their size, cards line up (bug: % and badges spilled out)", async () => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await go(page, "workload");
  const bad = await page.$$eval(".member", cards => cards.flatMap(c => { const cr = c.getBoundingClientRect();
    return [...c.querySelectorAll("*")].filter(e => { const r = e.getBoundingClientRect(); return r.width && (r.right > cr.right + 1 || r.left < cr.left - 1); }).map(e => `${c.querySelector("b").textContent}: ${e.tagName}.${e.className}`); }));
  assert.deepEqual(bad, [], "nothing sticks out of a card");
  const badges = await page.$$eval(".member .badge, .member [class*=risk-badge], .member li button > :not(:first-child)", xs => xs.map(x => x.scrollWidth <= x.clientWidth + 1));
  assert.ok(badges.length && badges.every(Boolean), "badges aren't clipped");
  const tops = await page.$$eval(".member .mh", xs => xs.map(x => Math.round(x.getBoundingClientRect().top)));
  const rows = {}; tops.forEach(t => { rows[t] = 1; });
  assert.ok(Object.keys(rows).length <= Math.ceil(tops.length / 2), "card headers in a row line up: " + tops.join(","));
});
