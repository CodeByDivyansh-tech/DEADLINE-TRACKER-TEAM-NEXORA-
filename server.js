// Deadline Tracker server (Node.js 22.5+; no packages to install).
//   node server.js        then open the link it prints
// Settings: environment variables or a .env file (see .env.example). API reference: docs/API.md.
//
// Modules (lib/modules, lib/ai):
//   auth           accounts, sessions, profile           tasks          task API + the app's saved state
//   plan           private planning assistant (My Plan)  productivity   scheduling rules used by plan
//   notifications  reminder worker + notification API    stats          productivity statistics
//   conversations  chat history                          admin          admin-only operations
//   ai/gemini      Google Gemini (free tier) client      ai/rag         knowledge base + retrieval
//   ai/help        Help answers (website + general tips)
const http = require("http");
const fs = require("fs");
const path = require("path");
const cfg = require("./lib/config");
const { openDb } = require("./lib/db");
const { ApiError, send, readJson, router, limiter, SECURITY_HEADERS, CSP } = require("./lib/http");
const { createAuth } = require("./lib/modules/auth");
const Tasks = require("./lib/modules/tasks");
const Notifs = require("./lib/modules/notifications");
const Convs = require("./lib/modules/conversations");
const Stats = require("./lib/modules/stats");
const Plan = require("./lib/modules/plan");
const Admin = require("./lib/modules/admin");
const { createGemini } = require("./lib/ai/gemini");
const { createRag } = require("./lib/ai/rag");
const Help = require("./lib/ai/help");
const { createPersistence } = require("./lib/persist");
const { createMail } = require("./lib/mail");
const { createTelegram } = require("./lib/telegram");
const { createOutbox } = require("./lib/outbox");
const Channels = require("./lib/modules/channels");
const VERSION = require("./package.json").version;

async function main(){
  const persist = createPersistence(Object.assign({ dataDir: cfg.dataDir, log: (a, e) => log(a, e) }, cfg.persist));
  // Open the port first and answer "starting" (503) until the database is ready. Before, the server waited for
  // Neon before listening; when Neon couldn't be used it never answered, so every Render deploy timed out.
  let ready = null;
  const server = http.createServer((req, res) => {
    if (ready) return ready(req, res);
    send(res, 503, { ok: false, starting: true, code: "starting", error: "The server is starting up. Try again in a few seconds.", persistence: persist.status() }, { "Retry-After": "5" });
  });
  let tryPort = cfg.port, tries = 0;
  server.on("error", e => {
    if ((e.code === "EACCES" || e.code === "EADDRINUSE") && cfg.port !== 0 && tries < 20) { console.log(`Port ${tryPort} is not available (${e.code}), trying ${tryPort + 1}...`); tries++; tryPort++; server.listen(tryPort, cfg.host); }
    else { console.error("Could not start the server:", e.message); process.exit(1); }
  });
  await new Promise(r => { server.once("listening", r); server.listen(cfg.port, cfg.host); });
  const port = server.address().port;
  console.log(`Starting at http://localhost:${port} ...`);
  if (persist.enabled) console.log("Permanent storage: Neon Postgres. Loading the saved database...");
  await persist.restore();   // finishes before the database is opened, so a wiped disk gets its data back (or times out: see lib/persist.js)
  const db = openDb(cfg.dataDir);
  persist.start(db);
  function log(area, err){
    const msg = err && err.message ? err.message : String(err);
    try { db.prepare("INSERT INTO error_log (area, message, detail, created_at) VALUES (?, ?, ?, ?)").run(area, msg.slice(0, 500), err && err.code ? String(err.code) : (err && err.stack ? String(err.stack).slice(0, 2000) : null), Date.now());
      db.prepare("DELETE FROM error_log WHERE created_at < ?").run(Date.now() - 30 * 864e5); } catch (e) {}
    if (!(err && err.code && /quota|limited|no_key/.test(err.code))) console.error(`[${area}]`, msg);
  }
  const mail = createMail(cfg.mail);
  const events = new (require("events").EventEmitter)();
  // New accounts are refused while permanent storage (Neon) is configured but not working: they would vanish later.
  const auth = createAuth(db, cfg, { mail, log, events, storageOk: () => { const p = persist.status(); return !(persist.enabled && (p.fallback || p.stoppedBecauseNewer)); } });
  const tgMode = cfg.telegram.mode || (cfg.prod && cfg.publicUrl ? "webhook" : "polling");
  const telegram = createTelegram({ token: cfg.telegram.token, apiUrl: cfg.telegram.apiUrl, webhookSecret: cfg.telegram.webhookSecret, pollSeconds: cfg.telegram.pollSeconds,
    webhookUrl: tgMode === "webhook" && cfg.publicUrl ? cfg.publicUrl + "/api/telegram/webhook" : null, polling: tgMode === "polling" }, { log });
  const outbox = createOutbox(db, { mail, telegram, log, prefsOf: auth.prefsOf, inQuiet: Notifs.inQuiet });
  const channels = Channels.createChannels({ db, cfg, mail, telegram, outbox, events, log });
  const notifications = Notifs.createNotifications(db, { prefsOf: auth.prefsOf, log, onDelivered: channels.onDelivered });
  const tasks = Tasks.createTasks(db, { onChange: uid => notifications.touch(uid) });
  const conversations = Convs.createConversations(db);
  const stats = Stats.createStats(db);
  const plan = Plan.createPlan({ db, tasks, conversations, stats, notifications });
  const gemini = createGemini(cfg, db, log);
  const rag = createRag(db, gemini, { root: cfg.ROOT, log });
  const help = Help.createHelp({ db, gemini, rag, conversations });

  // ---------- routes ----------
  const R = router();
  const A = { auth: true };
  R.add("GET", "/api/health", () => {
    let dbOk = true; try { db.prepare("SELECT 1").get(); } catch (e) { dbOk = false; }
    return { status: dbOk ? 200 : 503, body: { ok: dbOk, version: VERSION, time: new Date().toISOString(), database: dbOk ? "ok" : "error", reminders: notifications.status(), persistence: persist.status(), email: { configured: mail.configured(), provider: mail.provider }, telegram: telegram.status(), ai: { configured: gemini.configured(), model: gemini.model } } };
  });
  R.add("GET", "/api/status", () => ({ accounts: true, ai: gemini.configured(), provider: "gemini", model: gemini.configured() ? gemini.model : null }));
  R.add("GET", "/api/me", (c) => ({ accounts: true, user: auth.publicUser(c.user) }));
  R.add("POST", "/api/auth/signup", async (c) => { const r = await auth.signup(await c.json(), c.ip); return { status: 201, body: { user: r.user }, headers: { "Set-Cookie": r.cookie } }; });
  R.add("POST", "/api/auth/login", async (c) => { const r = await auth.login(await c.json(), c.ip); return { body: { user: r.user }, headers: { "Set-Cookie": r.cookie } }; });
  R.add("POST", "/api/auth/forgot", async (c) => auth.requestReset(await c.json(), c.ip, c.req));
  R.add("POST", "/api/auth/reset", async (c) => auth.resetPassword(await c.json(), c.ip));
  R.add("POST", "/api/auth/logout", (c) => ({ body: { ok: true }, headers: { "Set-Cookie": auth.logout(c.req) } }));
  R.add("GET", "/api/profile", (c) => ({ user: auth.publicUser(c.user) }), A);
  R.add("PATCH", "/api/profile", async (c) => { const u = auth.updateProfile(c.user, await c.json()); notifications.touch(c.user.id); return { user: u }; }, A);
  R.add("POST", "/api/profile/password", async (c) => { await auth.changePassword(c.user, await c.json(), c.req); return { ok: true }; }, A);
  Tasks.routes(R, { tasks });
  Plan.routes(R, { plan, tasks });
  Notifs.routes(R, { db, notifications, auth });
  Convs.routes(R, { db, conversations });
  Stats.routes(R, { stats });
  Help.routes(R, { help });
  Admin.routes(R, { db, rag, help, gemini, notifications, auth });
  Channels.routes(R, { channels, telegram });

  // ---------- request handling ----------
  const apiLimit = limiter(Number(process.env.API_RPM) || 600, 60e3);
  const ipOf = req => (cfg.trustProxy && String(req.headers["x-forwarded-for"] || "").split(",")[0].trim()) || req.socket.remoteAddress || "?";
  // State-changing requests must come from this site (stops other websites from using a logged-in cookie).
  function sameOrigin(req){
    const o = req.headers.origin; if (!o) return true;
    try {
      if (cfg.allowedOrigins.includes(o.replace(/\/$/, ""))) return true;
      const host = cfg.trustProxy && String(req.headers["x-forwarded-host"] || "").split(",")[0].trim() || req.headers.host; return new URL(o).host === host;
    } catch (e) { return false; }
  }
  async function handleApi(req, res, url, query){
    const ip = ipOf(req);
    const rl = apiLimit(ip); if (!rl.ok) return send(res, 429, { code: "rate_limited", error: "Too many requests. Slow down a little." }, { "Retry-After": String(rl.retryAfter) });
    if (req.method !== "GET" && req.method !== "HEAD" && !sameOrigin(req)) return send(res, 403, { code: "bad_origin", error: "Request from another site was blocked." });
    const m = R.match(req.method, url);
    if (!m) return send(res, 404, { code: "not_found", error: "Unknown API route." });
    if (m.methodNotAllowed) return send(res, 405, { code: "method_not_allowed", error: "That method isn't allowed here." });
    const user = auth.userOf(req);
    if (m.route.opts.auth && !user) return send(res, 401, { code: "signed_out", error: "Please log in." });
    if (m.route.opts.admin && user.role !== "admin") return send(res, 403, { code: "not_admin", error: "Only an admin can do this." });
    const c = { req, res, user, ip, params: m.params, query, json: limit => readJson(req, limit) };
    const out = await m.route.handler(c);
    if (out && typeof out.status === "number" && (out.status === 204 || "body" in out)) {
      if (out.status === 204) { res.writeHead(204, Object.assign({ "Cache-Control": "no-store" }, SECURITY_HEADERS, out.headers || {})); return res.end(); }
      return send(res, out.status, out.body || {}, out.headers || {});
    }
    if (out && out.headers && "body" in out) return send(res, 200, out.body, out.headers);
    return send(res, 200, out || {});
  }
  const PRIVATE = /(^|[\\/])(\.env.*|ai-key\.txt|data|lib|tests|node_modules|knowledge|docs|src|\.git)([\\/]|$)|\.(db|db-wal|db-shm|md|bak|ps1|bat|sh|json|js)$/i;
  const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json" };
  // The pitch's public libraries (three.js, GSAP) are the only .js files served; all other .js is source code.
  const PUBLIC_JS = /^(pitch-assets[\\/][\w.-]+\.min\.js|assets[\\/](app|gsap)\.[0-9a-f]{10}\.js|sw\.js)$/;   // sw.js: the service worker (install as an app)
  const BUILT = /^assets[\\/](app|gsap)\.[0-9a-f]{10}\.js$/;   // content-named by build.js: safe to keep for a year
  const etags = new Map();   // file -> { mtime, size, tag }
  const handle = async (req, res) => {
    let url, query = {};
    try { const u = new URL(req.url || "/", "http://x"); url = decodeURIComponent(u.pathname); u.searchParams.forEach((v, k) => { query[k] = v; }); }
    catch (e) { res.writeHead(400); return res.end("Bad request"); }
    if (url.startsWith("/api/")) {
      try { return await handleApi(req, res, url, query); }
      catch (e) {
        if (e instanceof ApiError) return send(res, e.status, Object.assign({ code: e.code, error: e.message }, e.extra || {}));
        if (e && e.code && e.message && /^(quota|limited|no_key|bad_key|bad_model|unavailable|timeout|invalid_response|upstream_error|invalid_request)$/.test(e.code))
          return send(res, e.code === "quota" || e.code === "limited" ? 429 : e.code === "no_key" ? 503 : 502, { code: e.code, error: e.message }, e.retryAfter ? { "Retry-After": String(e.retryAfter) } : {});
        log("api", e); return send(res, 500, { code: "server_error", error: "Something went wrong on the server." });
      }
    }
    if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405); return res.end(); }
    const rel = url === "/" ? "index.html" : url === "/admin" ? "admin.html" : url === "/pitch" || url === "/pitch/" ? "pitch.html" : url.replace(/^\/+/, "");
    const file = path.resolve(cfg.ROOT, rel);
    if (!file.startsWith(cfg.ROOT + path.sep) || (PRIVATE.test(path.relative(cfg.ROOT, file)) && !PUBLIC_JS.test(path.relative(cfg.ROOT, file))) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404, Object.assign({ "Content-Type": "text/plain" }, SECURITY_HEADERS)); return res.end("Not found"); }
    const pub = PUBLIC_JS.test(path.relative(cfg.ROOT, file));
    const type = pub ? "text/javascript; charset=utf-8" : MIME[path.extname(file).toLowerCase()];   // only the file types the site uses; everything else stays private
    if (!type) { res.writeHead(404, Object.assign({ "Content-Type": "text/plain" }, SECURITY_HEADERS)); return res.end("Not found"); }
    const relf = path.relative(cfg.ROOT, file);
    // app code: a year (its name changes with its content). Pages: kept but re-checked each visit (ETag → 304).
    const cache = BUILT.test(relf) ? "public, max-age=31536000, immutable" : /^(pitch-assets|icons)[\\/]/.test(relf) ? "public, max-age=86400" : /html|manifest/.test(type) || relf === "sw.js" ? "no-cache" : "no-store";
    const st = fs.statSync(file); let e = etags.get(file);
    if (!e || e.mtime !== st.mtimeMs || e.size !== st.size) { e = { mtime: st.mtimeMs, size: st.size, tag: '"' + require("crypto").createHash("sha1").update(fs.readFileSync(file)).digest("base64url").slice(0, 22) + '"' }; etags.set(file, e); }
    const head = Object.assign({ "Content-Type": type, "Cache-Control": cache, ETag: e.tag }, SECURITY_HEADERS, /html/.test(type) ? { "Content-Security-Policy": CSP } : {});
    if ((req.headers["if-none-match"] || "").split(/\s*,\s*/).includes(e.tag)) { res.writeHead(304, head); return res.end(); }
    // text files are sent compressed (about a quarter of the size); the compressed copy is kept until the file changes
    if (/^(text\/|image\/svg|application\/manifest)/.test(type) && /\bgzip\b/.test(req.headers["accept-encoding"] || "")) {
      if (!e.gz) e.gz = require("zlib").gzipSync(fs.readFileSync(file), { level: 9 });
      res.writeHead(200, Object.assign(head, { "Content-Encoding": "gzip", "Content-Length": e.gz.length, Vary: "Accept-Encoding" }));
      return res.end(req.method === "HEAD" ? undefined : e.gz);
    }
    res.writeHead(200, Object.assign(head, { "Content-Length": st.size, Vary: "Accept-Encoding" }));
    if (req.method === "HEAD") return res.end();
    fs.createReadStream(file).pipe(res);
  };

  // ---------- start ----------
  notifications.start(cfg.reminderIntervalMs);
  outbox.start(cfg.outboxIntervalMs);
  if (tgMode !== "off") telegram.start(channels.handleUpdate).then(r => { if (telegram.configured()) console.log(`Telegram bot: ${r.mode}${r.error ? " (" + r.error + ")" : ""}`); }).catch(e => log("telegram", e));
  rag.refresh().then(r => { if (r && r.embedded) console.log(`Knowledge base: added ${r.embedded} embeddings.`); }).catch(e => log("rag", e));
  ready = handle;
  console.log(`Deadline Tracker running at http://localhost:${port}`);
  console.log(gemini.configured() ? `Deadline AI Help: Google Gemini (${gemini.model}, free tier)` : "Deadline AI Help: AI off (add GEMINI_API_KEY to .env to turn on Gemini). My Plan works without it.");
  console.log(`Database: ${path.join(cfg.dataDir, "deadline.db")}`);
  const ps = persist.status(); if (ps.fallback) console.error(`Permanent storage is NOT working: ${ps.error}`);
  let stopping = false;
  const stop = async () => {
    if (stopping) return; stopping = true;
    notifications.stop(); outbox.stop(); telegram.stop(); server.close();
    setTimeout(() => process.exit(0), 8000).unref();
    try { await persist.stop(); } catch (e) {}   // last save to Neon before the host shuts us down
    try { db.close(); } catch (e) {}
    process.exit(0);
  };
  process.on("SIGTERM", stop); process.on("SIGINT", stop);
}
main().catch(e => { console.error("Could not start the server:", e && e.message); process.exit(1); });
