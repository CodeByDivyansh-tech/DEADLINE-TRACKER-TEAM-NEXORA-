// Starts the real server.js with its own empty database, and a fake Google Gemini API, for server tests.
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const ROOT = path.join(__dirname, "..");

// A tiny stand-in for embeddings: words hashed into 64 numbers, so texts sharing words are "close".
function fakeVector(text){
  const v = new Array(64).fill(0);
  (String(text).toLowerCase().match(/[a-z]{3,}/g) || []).forEach(w => { let h = 0; for (const ch of w.slice(0, 6)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; v[h % 64] += 1; });
  const n = Math.sqrt(v.reduce((a, b) => a + b * b, 0)) || 1; return v.map(x => x / n);
}
// Fake Gemini: records requests; `respond(body)` decides the generateContent answer.
function fakeGemini(){
  const f = { seen: [], embeds: 0, respond: () => ({ text: JSON.stringify({ found: true, kind: "website", answer: "ok", sources: [1] }) }) };
  f.server = http.createServer((req, res) => {
    let b = ""; req.on("data", c => b += c); req.on("end", () => {
      const body = JSON.parse(b || "{}"); f.seen.push({ url: req.url, headers: req.headers, body, raw: b });
      const send = (s, j) => { res.writeHead(s, { "Content-Type": "application/json" }); res.end(JSON.stringify(j)); };
      if (req.headers["x-goog-api-key"] === "bad-key") return send(400, { error: { code: 400, status: "INVALID_ARGUMENT", message: "API key not valid. Please pass a valid API key." } });
      if (/:batchEmbedContents$/.test(req.url)) { f.embeds++; if (f.embedFail) return send(503, { error: { status: "UNAVAILABLE", message: "down" } }); return send(200, { embeddings: body.requests.map(r => ({ values: fakeVector(r.content.parts[0].text) })) }); }
      if (/:generateContent$/.test(req.url)) {
        const r = f.respond(body);
        if (r.status) return send(r.status, r.error);
        return send(200, { candidates: [{ content: { role: "model", parts: [{ text: r.text }] }, finishReason: "STOP" }], usageMetadata: { promptTokenCount: 120, candidatesTokenCount: 30 } });
      }
      send(404, { error: { message: "not found" } });
    });
  });
  f.start = () => new Promise(r => f.server.listen(0, "127.0.0.1", () => { f.url = `http://127.0.0.1:${f.server.address().port}`; r(f); }));
  f.close = () => f.server.close();
  f.chats = () => f.seen.filter(s => /:generateContent$/.test(s.url));
  return f;
}
// opts.early: resolve as soon as the port is open (before the database is ready), to test the "starting" state.
function startServer(env = {}, opts = {}){
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "dt-data-"));
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [path.join(ROOT, "server.js")], { env: Object.assign({}, process.env,
      { PORT: "0", HOST: "127.0.0.1", GEMINI_API_KEY: "", ENV_FILE: path.join(dataDir, "none.env"), DATA_DIR: dataDir, NODE_ENV: "test" }, env) });
    let out = "";
    const re = opts.early ? /(?:Starting|running) at http:\/\/localhost:(\d+)/ : /running at http:\/\/localhost:(\d+)/;
    p.stdout.on("data", d => { out += d; const m = out.match(re); if (m) resolve({ p, dataDir, base: `http://127.0.0.1:${m[1]}`, out: () => out, stop: () => p.kill() }); });
    p.stderr.on("data", d => { out += d; });
    p.on("exit", c => reject(new Error("server exited " + c + out)));
    setTimeout(() => reject(new Error("server didn't start: " + out)), 8000);
  });
}
// A cookie-keeping client, like one browser.
function client(base){
  let cookie = "";
  const call = async (method, url, body, headers = {}) => {
    const r = await fetch(base + url, { method, headers: Object.assign(body === undefined ? {} : { "Content-Type": "application/json" }, cookie ? { Cookie: cookie } : {}, headers), body: body === undefined ? undefined : (typeof body === "string" ? body : JSON.stringify(body)) });
    const sc = r.headers.get("set-cookie"); if (sc) cookie = sc.split(";")[0].endsWith("=") ? "" : sc.split(";")[0];
    let j = null; const text = await r.text(); try { j = text ? JSON.parse(text) : null; } catch (e) {}
    return { status: r.status, json: j, text, setCookie: sc, headers: r.headers };
  };
  return { call, get: u => call("GET", u), post: (u, b) => call("POST", u, b === undefined ? {} : b), put: (u, b) => call("PUT", u, b), patch: (u, b) => call("PATCH", u, b), del: u => call("DELETE", u), cookie: () => cookie, setCookie: c => { cookie = c; } };
}
async function signup(base, name, email, password = "password123", timezone = "Asia/Kolkata"){
  const c = client(base); const r = await c.post("/api/auth/signup", { name, email, password, timezone });
  return Object.assign(c, { user: r.json && r.json.user, res: r });
}
// Fake Neon "SQL over HTTP" endpoint (POST /sql, Neon-Connection-String header, {query, params}),
// answering in raw-text array mode like Neon does. It understands the few statements lib/persist.js sends.
function fakeNeon(){
  const f = { row: null, requests: [], failNext: 0, down: false };
  f.server = http.createServer((req, res) => {
    let b = ""; req.on("data", c => b += c); req.on("end", () => {
      const send = (s, j) => { res.writeHead(s, { "Content-Type": "application/json" }); res.end(JSON.stringify(j)); };
      f.requests.push({ url: req.url, headers: req.headers, raw: b });
      if (req.url !== "/sql" || !/^postgres(ql)?:\/\//.test(req.headers["neon-connection-string"] || "")) return send(400, { message: "bad request" });
      if (f.down || f.failNext > 0) { f.failNext--; return send(503, { message: "endpoint unavailable" }); }
      const { query, params = [] } = JSON.parse(b || "{}");
      const q = query.replace(/\s+/g, " ").trim();
      const out = (cols, rows, command) => send(200, { command, rowCount: rows.length, fields: cols.map(([name, dataTypeID]) => ({ name, dataTypeID })), rows, rowAsArray: true });
      if (/^CREATE TABLE IF NOT EXISTS dt_snapshot/i.test(q)) return out([], [], "CREATE");
      if (/^SELECT data, version, instance, started_at FROM dt_snapshot WHERE id = 1/i.test(q))
        return out([["data", 25], ["version", 20], ["instance", 25], ["started_at", 20]], f.row ? [[f.row.data, String(f.row.version), f.row.instance, String(f.row.started_at)]] : [], "SELECT");
      if (/^INSERT INTO dt_snapshot/i.test(q)) {
        if (f.row) return out([["version", 20]], [], "INSERT");
        f.row = { data: params[0], version: 1, instance: params[1], started_at: Number(params[2]), saved_at: Number(params[3]) };
        return out([["version", 20]], [["1"]], "INSERT");
      }
      if (/^UPDATE dt_snapshot SET .* WHERE id = 1 AND version = \$5/i.test(q)) {
        if (!f.row || String(f.row.version) !== String(params[4])) return out([["version", 20]], [], "UPDATE");
        Object.assign(f.row, { data: params[0], version: f.row.version + 1, instance: params[1], started_at: Number(params[2]), saved_at: Number(params[3]) });
        return out([["version", 20]], [[String(f.row.version)]], "UPDATE");
      }
      if (/^UPDATE dt_snapshot SET .* WHERE id = 1 RETURNING/i.test(q)) {
        if (!f.row) return out([["version", 20]], [], "UPDATE");   // like Postgres: no row, nothing updated
        Object.assign(f.row, { data: params[0], version: f.row.version + 1, instance: params[1], started_at: Number(params[2]), saved_at: Number(params[3]) });
        return out([["version", 20]], [[String(f.row.version)]], "UPDATE");
      }
      send(400, { message: "unexpected query: " + q.slice(0, 80) });
    });
  });
  f.start = () => new Promise(r => f.server.listen(0, "127.0.0.1", () => { f.url = `http://127.0.0.1:${f.server.address().port}`; r(f); }));
  f.close = () => f.server.close();
  f.env = () => ({ DATABASE_URL: "postgresql://dt_user:secret-pw@ep-test-123-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require", NEON_HTTP_URL: f.url + "/sql", PERSIST_INTERVAL_MS: "300" });
  return f;
}
// Fake email provider (Brevo- or Resend-style JSON API): records every message instead of sending it.
function fakeMail(){
  const f = { sent: [], fail: false };
  f.server = http.createServer((req, res) => {
    let b = ""; req.on("data", c => b += c); req.on("end", () => {
      const body = JSON.parse(b || "{}"); f.sent.push({ url: req.url, headers: req.headers, body });
      res.writeHead(f.fail ? 500 : 201, { "Content-Type": "application/json" }); res.end(JSON.stringify(f.fail ? { message: "down" } : { messageId: "m" + f.sent.length }));
    });
  });
  f.start = () => new Promise(r => f.server.listen(0, "127.0.0.1", () => { f.url = `http://127.0.0.1:${f.server.address().port}`; r(f); }));
  f.close = () => f.server.close();
  // The reset link from the last email to this address (Brevo: htmlContent/textContent; Resend: html/text).
  f.linkFor = email => { const m = [...f.sent].reverse().find(x => JSON.stringify(x.body).toLowerCase().includes(email.toLowerCase())); if (!m) return null; const t = JSON.stringify(m.body).match(/https?:\/\/[^"\s<>\\]+#reset=[A-Za-z0-9_-]+/); return t ? t[0] : null; };
  return f;
}
module.exports = { fakeMail, fakeGemini, fakeVector, fakeNeon, startServer, client, signup, ROOT };
