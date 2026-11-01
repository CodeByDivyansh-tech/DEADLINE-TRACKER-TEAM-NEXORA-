// Server basics and security: serving the app, private files, health check, headers, cross-site requests.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const { startServer, client, signup } = require("./srv");

let s;
before(async () => { s = await startServer({ GEMINI_API_KEY: "AIza-test-secret-key-123" , GEMINI_BASE_URL: "http://127.0.0.1:9" }); });
after(() => s.stop());

test("server: serves the app and the admin page, but never source, data, settings or keys", async () => {
  const r = await fetch(s.base + "/");
  assert.equal(r.status, 200); assert.match(await r.text(), /<title>Deadline Tracker<\/title>/);
  assert.match(r.headers.get("content-security-policy"), /frame-ancestors 'none'/);
  assert.equal(r.headers.get("x-content-type-options"), "nosniff");
  assert.equal((await fetch(s.base + "/admin")).status, 200);
  for (const u of ["/server.js", "/lib/modules/auth.js", "/data/deadline.db", "/.env", "/.env.example", "/knowledge/02-tasks.md", "/CLAUDE.md", "/package.json", "/tests/srv.js", "/src/ai.js", "/%2e%2e/%2e%2e/etc/passwd"])
    assert.equal((await fetch(s.base + u)).status, 404, u);
});
test("server: health check and status; the Gemini key never appears in any response or page", async () => {
  const h = await (await fetch(s.base + "/api/health")).json();
  assert.equal(h.ok, true); assert.equal(h.database, "ok"); assert.ok(h.reminders.lastRun, "the reminder job has run");
  const st = await fetch(s.base + "/api/status"); const txt = await st.text();
  assert.equal(JSON.parse(txt).provider, "gemini");
  const c = await signup(s.base, "Asha", "asha@example.com");
  for (const u of ["/api/status", "/api/health", "/api/me", "/api/profile", "/api/state"]) assert.doesNotMatch((await c.get(u)).text, /AIza-test-secret/, u);
  assert.doesNotMatch(await (await fetch(s.base + "/")).text(), /AIza-test-secret/);
  assert.doesNotMatch(await (await fetch(s.base + "/admin")).text(), /AIza/);
});
test("security: requests from another website are blocked; unknown routes and methods are handled", async () => {
  const c = await signup(s.base, "Bo", "bo@example.com");
  assert.equal((await c.call("POST", "/api/tasks", { title: "x" }, { Origin: "https://evil.example" })).status, 403);
  assert.equal((await c.get("/api/nope")).status, 404);
  assert.equal((await c.call("PUT", "/api/health", {})).status, 405);
  assert.equal((await c.call("POST", "/api/tasks", "{not json", { "Content-Type": "application/json" })).status, 400);
  assert.equal((await c.call("POST", "/api/tasks", "title=x", { "Content-Type": "application/x-www-form-urlencoded" })).status, 415, "only JSON is accepted");
});
test("security: every private route needs a login", async () => {
  const anon = client(s.base);
  for (const [m, u] of [["GET", "/api/tasks"], ["POST", "/api/tasks"], ["GET", "/api/state"], ["GET", "/api/notifications"], ["POST", "/api/plan/chat"], ["POST", "/api/chat"], ["GET", "/api/stats"], ["GET", "/api/profile"], ["GET", "/api/conversations"], ["GET", "/api/admin/overview"]])
    assert.equal((await anon.call(m, u, m === "GET" ? undefined : {})).status, 401, `${m} ${u}`);
});
test("database: migrations are recorded, and the schema has constraints and indexes", () => {
  const { DatabaseSync } = require("node:sqlite");
  const db = new DatabaseSync(require("path").join(s.dataDir, "deadline.db"));
  assert.ok(db.prepare("SELECT version FROM schema_migrations").all().length >= 1);
  const idx = db.prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all().map(x => x.name);
  for (const i of ["idx_tasks_user_status", "idx_tasks_user_due", "idx_notif_due"]) assert.ok(idx.includes(i), i);
  assert.throws(() => db.prepare("INSERT INTO tasks (id, user_id, workspace_id, title, priority, created_at, updated_at) VALUES ('t1', 'nobody', 'w', 'x', 'urgent', 1, 1)").run(), /CHECK|FOREIGN/);
  db.close();
});
test("security: a site listed in ALLOWED_ORIGINS (the Vercel front end) may send changes; others may not", async () => {
  const s2 = await startServer({ ALLOWED_ORIGINS: "https://deadline-tracker.vercel.app/" });
  try {
    const c = await signup(s2.base, "Vi", "vi@example.com");
    assert.equal((await c.call("POST", "/api/tasks", { title: "From Vercel" }, { Origin: "https://deadline-tracker.vercel.app" })).status, 201);
    assert.equal((await c.call("POST", "/api/tasks", { title: "x" }, { Origin: "https://evil.example" })).status, 403);
  } finally { s2.stop(); }
});
