// Faster loading: the app code lives in content-named files the browser may keep for a year,
// the page itself is re-checked cheaply (ETag → 304), and the first server calls start before the code has loaded.
const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { startServer } = require("./srv");

const ROOT = path.join(__dirname, "..");
const servers = []; after(() => servers.forEach(s => s.stop()));
const start = async env => { const s = await startServer(env); servers.push(s); return s; };
const html = () => fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const scripts = () => [...html().matchAll(/<script defer src="\/assets\/([\w.]+\.js)"><\/script>/g)].map(m => m[1]);

test("build: the page loads GSAP then the app from content-named files, with defer", () => {
  const s = scripts();
  assert.equal(s.length, 2, "two script files: " + s.join(", "));
  assert.match(s[0], /^gsap\.[0-9a-f]{10}\.js$/);
  assert.match(s[1], /^app\.[0-9a-f]{10}\.js$/);
  for (const f of s) assert.ok(fs.existsSync(path.join(ROOT, "assets", f)), f + " exists");
  assert.ok(html().length < 160 * 1024, "the page itself is small now: " + Math.round(html().length / 1024) + " KB");
  assert.doesNotMatch(html(), /function render\(|"use strict"/, "no app code inline in the page");
  const others = fs.readdirSync(path.join(ROOT, "assets")).filter(f => /^(app|gsap)\./.test(f));
  assert.deepEqual(others.sort(), s.slice().sort(), "old builds are removed");
});

test("build: a single-file copy (standalone.html) still has everything inline for one-file previews", () => {
  const one = fs.readFileSync(path.join(ROOT, "standalone.html"), "utf8");
  assert.doesNotMatch(one, /<script[^>]+src=/i);
  assert.match(one, /GSAP 3\.\d+\.\d+/);
  assert.match(one, /function render\(/);
});

test("build: fonts don't block the first paint, and the first server calls start in the page head", () => {
  const h = html(), head = h.slice(0, h.indexOf("</head>"));
  assert.match(head, /fonts\.googleapis\.com\/css2[^"]*"[^>]*media="print"[^>]*onload=/, "font stylesheet loads without blocking");
  assert.doesNotMatch(head.replace(/<noscript>[\s\S]*?<\/noscript>/g, ""), /<link href="https:\/\/fonts\.googleapis\.com\/css2[^>]*rel="stylesheet">/, "no blocking font link");
  assert.match(head, /__dtBoot[\s\S]*fetch\("\/api\/me"[\s\S]*fetch\("\/api\/state"/, "early /api/me and /api/state");
  assert.match(h, /id="bootSplash"/, "a loading screen exists for slow starts");
});

test("server: app files are cached for a year (immutable); the page is re-checked with an ETag (304)", async () => {
  const s = await start({});
  for (const f of scripts()) {
    const r = await fetch(s.base + "/assets/" + f);
    assert.equal(r.status, 200, f);
    assert.match(r.headers.get("content-type"), /^text\/javascript/);
    assert.match(r.headers.get("cache-control"), /max-age=31536000.*immutable/);
    assert.equal(r.headers.get("x-content-type-options"), "nosniff");
    assert.equal((await r.arrayBuffer()).byteLength, fs.statSync(path.join(ROOT, "assets", f)).size);
  }
  const p = await fetch(s.base + "/");
  assert.equal(p.status, 200);
  assert.match(p.headers.get("cache-control"), /no-cache/);
  assert.doesNotMatch(p.headers.get("cache-control"), /no-store/);
  const tag = p.headers.get("etag"); assert.ok(tag, "the page has an ETag");
  assert.ok(p.headers.get("content-security-policy"), "the page keeps its CSP");
  await p.text();
  const again = await fetch(s.base + "/", { headers: { "If-None-Match": tag } });
  assert.equal(again.status, 304, "unchanged page → 304, nothing re-downloaded");
  assert.equal((await again.text()).length, 0);
});

test("server: text files are sent compressed when the browser accepts it", async () => {
  const s = await start({});
  const http = require("http");
  const get = (u, enc) => new Promise((ok, no) => http.get(s.base + u, { headers: enc ? { "Accept-Encoding": enc } : {} }, r => { const b = []; r.on("data", c => b.push(c)); r.on("end", () => ok({ h: r.headers, len: Buffer.concat(b).length, body: Buffer.concat(b) })); }).on("error", no));
  const app = "/assets/" + scripts()[1], size = fs.statSync(path.join(ROOT, app.slice(1))).size;
  const z = await get(app, "gzip, br");
  assert.equal(z.h["content-encoding"], "gzip");
  assert.ok(z.len < size / 3, `compressed ${z.len} of ${size} bytes`);
  assert.equal(require("zlib").gunzipSync(z.body).length, size, "unpacks to the same file");
  const plain = await get(app, "");
  assert.equal(plain.h["content-encoding"], undefined);
  assert.equal(plain.len, size);
  assert.match(plain.h.vary || "", /Accept-Encoding/);
});

test("server: only built app files are public under /assets; other code stays private", async () => {
  const s = await start({});
  for (const u of ["/assets/app.js", "/assets/nothere.0123456789.js", "/assets/../server.js", "/assets/%2e%2e/lib/db.js", "/src/part2.js", "/lib/db.js", "/build.js", "/vendor/gsap.min.js", "/standalone.html.js"]) {
    const r = await fetch(s.base + u);
    assert.equal(r.status, 404, u);
  }
});

test("server: no keys or tokens in the page or the app files", async () => {
  for (const f of ["index.html", "standalone.html", ...scripts().map(f => "assets/" + f)]) {
    const t = fs.readFileSync(path.join(ROOT, f), "utf8");
    assert.doesNotMatch(t, /AIza[0-9A-Za-z_-]{20,}|sk-ant-|xkeysib-|re_[A-Za-z0-9]{20,}|\d{8,10}:AA[0-9A-Za-z_-]{30,}|postgres(ql)?:\/\/[^"'\s]*:[^"'\s]*@/, f);
  }
});
