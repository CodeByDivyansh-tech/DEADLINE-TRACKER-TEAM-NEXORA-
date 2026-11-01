// Settings come from environment variables, or from a .env file next to server.js (never committed).
// See .env.example for every option.
const fs = require("fs");
const path = require("path");

function loadEnvFile(file){
  let text; try { text = fs.readFileSync(file, "utf8"); } catch (e) { return; }
  text.split(/\r?\n/).forEach(line => {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (!m || line.trim().startsWith("#")) return;
    let v = m[2]; if (/^(["']).*\1$/.test(v)) v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v; // real environment variables win
  });
}
const ROOT = path.join(__dirname, "..");
loadEnvFile(process.env.ENV_FILE || path.join(ROOT, ".env"));
const env = process.env;
const num = (v, d) => { const n = Number(v); return Number.isFinite(n) && v !== "" && v != null ? n : d; };
const prod = env.NODE_ENV === "production";

module.exports = {
  ROOT, prod,
  port: num(env.PORT, 8000),
  host: env.HOST || (prod ? "0.0.0.0" : "127.0.0.1"),
  dataDir: env.DATA_DIR || env.DT_DATA_DIR || path.join(ROOT, "data"),
  cookieSecure: env.COOKIE_SECURE ? env.COOKIE_SECURE === "true" : prod,
  trustProxy: env.TRUST_PROXY === "true",
  // Extra sites allowed to send changes (for example the Vercel address that forwards /api here).
  allowedOrigins: (env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim().replace(/\/$/, "")).filter(Boolean),
  adminEmail: (env.ADMIN_EMAIL || env.DT_ADMIN_EMAIL || "").toLowerCase(),
  reminderIntervalMs: num(env.REMINDER_INTERVAL_MS, 60000),
  gemini: {
    key: (env.GEMINI_API_KEY || "").trim(),
    baseUrl: (env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com").replace(/\/$/, ""),
    // Free-tier text model (checked Nov 2026 on Google's pricing page: "Free of charge").
    model: env.GEMINI_MODEL || "gemini-3.5-flash-lite",
    embedModel: env.GEMINI_EMBED_MODEL || "gemini-embedding-001",
    embedDims: num(env.GEMINI_EMBED_DIMS, 768),
    // Our own limits, kept under Google's free-tier limits so the key is never pushed into errors or billing.
    rpm: num(env.GEMINI_RPM, 8),
    rpd: num(env.GEMINI_RPD, 400),
    embedRpm: num(env.GEMINI_EMBED_RPM, 60),
    userDaily: num(env.AI_USER_DAILY, 40),
    timeoutMs: num(env.GEMINI_TIMEOUT_MS, 20000)
  }
};
