// Security checks (own app, test accounts only): brute force behind a proxy, HSTS, CORS, IDOR,
// stored XSS in the app and the admin page, private files.
const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const { startServer, client, signup } = require("./srv");
const { onboard, go, FIXED_NOW } = require("./helpers");

const servers = []; after(() => servers.forEach(s => s.stop()));
const start = async env => { const s = await startServer(env); servers.push(s); return s; };

test("brute force: faking a different IP on every try (X-Forwarded-For) doesn't get around the log-in limit", async () => {
  const s = await start({ TRUST_PROXY: "true" });
  await signup(s.base, "Victim", "victim@example.com", "the-real-password");
  const statuses = [];
  for (let k = 0; k < 40; k++) {
    const r = await fetch(s.base + "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json", "X-Forwarded-For": `10.0.${k}.${k}` }, body: JSON.stringify({ email: "victim@example.com", password: "guess-" + k }) });
    statuses.push(r.status);
  }
  assert.ok(statuses.includes(429), "the account gets rate limited: " + statuses.join(","));
  assert.ok(statuses.filter(x => x === 401).length <= 30, "at most 30 guesses per account per 15 minutes");
});

test("HSTS: in production every response tells browsers to use HTTPS only", async () => {
  const s = await start({ NODE_ENV: "production", COOKIE_SECURE: "false", HOST: "127.0.0.1" });
  for (const u of ["/", "/api/health", "/api/me", "/nope"]) {
    const r = await fetch(s.base + u);
    assert.match(r.headers.get("strict-transport-security") || "", /max-age=\d{7,}/, u);
  }
  const dev = await start({});
  assert.equal((await fetch(dev.base + "/api/health")).headers.get("strict-transport-security"), null, "not on plain http://localhost");
});

test("CORS: other websites can't read API answers (no Access-Control-Allow-Origin, preflights refused)", async () => {
  const s = await start({});
  const a = await signup(s.base, "Cora", "cora@example.com");
  const r = await a.call("GET", "/api/tasks", undefined, { Origin: "https://evil.example" });
  assert.equal(r.headers.get("access-control-allow-origin"), null);
  const pre = await fetch(s.base + "/api/tasks", { method: "OPTIONS", headers: { Origin: "https://evil.example", "Access-Control-Request-Method": "POST" } });
  assert.equal(pre.headers.get("access-control-allow-origin"), null);
  assert.ok(pre.status >= 400, "preflight refused: " + pre.status);
  const post = await a.call("POST", "/api/tasks", { title: "x", kind: "todo" }, { Origin: "https://evil.example" });
  assert.equal(post.status, 403, "cross-site change blocked even with the cookie");
});

test("IDOR: another account's task ids, conversations and admin routes are out of reach", async () => {
  const s = await start({});
  const admin = await signup(s.base, "Admin", "admin@example.com");
  const a = await signup(s.base, "Amit", "amit@example.com"), b = await signup(s.base, "Bela", "bela@example.com");
  const t = await a.post("/api/tasks", { title: "Amit secret", kind: "todo" });
  assert.equal(t.status, 201);
  const id = t.json.task.id;
  assert.equal((await b.get("/api/tasks/" + id)).status, 404);
  assert.equal((await b.patch("/api/tasks/" + id, { title: "pwned" })).status, 404);
  assert.equal((await b.del("/api/tasks/" + id)).status, 404);
  assert.ok(!JSON.stringify((await b.get("/api/tasks")).json).includes("Amit secret"));
  assert.ok(!JSON.stringify((await b.get("/api/state")).json).includes("Amit secret"));
  for (const u of ["/api/admin/users", "/api/admin/overview", "/api/admin/errors"]) assert.equal((await b.get(u)).status, 403, u);
  const users = (await admin.get("/api/admin/users")).json;
  assert.ok(!JSON.stringify(users).includes("Amit secret"), "even an admin doesn't get task contents");
  assert.ok(!/pass_hash|salt|token/.test(JSON.stringify(users)), "no password hashes or tokens in admin answers");
});

test("stored XSS: task titles, notes and names with HTML are shown as text in the app and the admin page", async () => {
  const s = await start({});
  const PAY = `<img src=x onerror="window.__xss=1"><script>window.__xss=2</script>"'><svg onload=window.__xss=3>`;
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, timezoneId: "Asia/Kolkata" });
    const page = await ctx.newPage(); let dialogs = 0; page.on("dialog", d => { dialogs++; d.dismiss(); });
    await page.clock.setFixedTime(FIXED_NOW);
    await page.goto(s.base + "/?dt-test"); await page.waitForSelector(".auth-card");
    await page.click("[data-act=authmode][data-v=signup]");
    await page.fill("#au-name", "Admin " + PAY); await page.fill("#au-email", "x@example.com"); await page.fill("#au-pass", "password123");
    await page.click("#authGo"); await page.waitForSelector("#onb-name");
    await onboard(page, { mode: "student", demo: false, name: "Eve " + PAY });
    for (const text of [`${PAY} due Fri 5pm`, `Plan ${PAY}`]) { await page.fill("#addText", text); await page.press("#addText", "Enter"); await page.waitForTimeout(150); }
    await page.evaluate(p => { const T = window.__DT_TEST__; T.W().items.forEach(i => { i.notes = p; }); T.W().name = "WS " + p; T.save(); T.render(); }, PAY);
    for (const r of ["overview", "todo", "deadlines", "calendar", "planner", "reports", "prefs"]) { await go(page, r); await page.waitForTimeout(80); }
    await go(page, "deadlines");
    const row = page.locator("[data-act=open]").first(); if (await row.count()) { await row.click(); await page.waitForTimeout(200); }
    assert.equal(await page.evaluate(() => window.__xss), undefined, "no injected script ran in the app");
    assert.ok((await page.textContent("body")).includes("onerror="), "the HTML is shown as plain text");
    await page.waitForTimeout(1500); // let the account save
    await page.goto(s.base + "/admin"); await page.waitForTimeout(800);
    for (const tab of ["users", "overview", "errors"]) { const b = page.locator(`[data-tab=${tab}]`); if (await b.count()) { await b.click(); await page.waitForTimeout(200); } }
    assert.equal(await page.evaluate(() => window.__xss), undefined, "no injected script ran on the admin page");
    assert.equal(dialogs, 0);
  } finally { await browser.close(); }
});

test("private files and odd paths: no source, data, settings or directory listings, even with encoded tricks", async () => {
  const s = await start({});
  for (const u of ["/.env", "/data/", "/data/deadline.db", "/data/deadline.db-wal", "/lib/persist.js", "/%2e%2e/server.js", "/..%2f..%2fetc%2fpasswd", "/.git/config", "/render.yaml", "/telegram-token.txt", "/ai-key.txt", "/node_modules/", "/index.html%00.js"]) {
    const r = await fetch(s.base + u); assert.ok([400, 404].includes(r.status), `${u} -> ${r.status}`);
  }
});
