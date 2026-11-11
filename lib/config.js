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

// DATABASE_URL as people paste it: Neon's dialog also offers `psql 'postgresql://...'`, and hosts sometimes keep quotes
// or the "DATABASE_URL=" part. Take the postgresql://... address out of whatever was pasted; otherwise keep it as is.
function cleanDbUrl(v){
  const t = String(v || "").trim(); if (!t) return "";
  const m = /postgres(?:ql)?:\/\/[^\s'"`]+/i.exec(t);
  return m ? m[0] : t.replace(/^DATABASE_URL\s*=\s*/i, "").replace(/^['"`]|['"`]$/g, "");
}
module.exports = {
  ROOT, prod,
  port: num(env.PORT, 8000),
  host: env.HOST || (prod ? "0.0.0.0" : "127.0.0.1"),
  dataDir: env.DATA_DIR || env.DT_DATA_DIR || path.join(ROOT, "data"),
  // Permanent copy of the database in Neon Postgres (for hosts that wipe the disk, like Render's free plan).
  persist: { dbUrl: cleanDbUrl(env.DATABASE_URL), httpUrl: (env.NEON_HTTP_URL || "").trim() || null,
    intervalMs: num(env.PERSIST_INTERVAL_MS, 3000), retryMs: num(env.PERSIST_RETRY_MS, 3000),
    // how long to wait for Neon before starting anyway (without saving to it), and how often to check again after that
    startTimeoutMs: num(env.PERSIST_START_TIMEOUT_MS, 60000), recheckMs: num(env.PERSIST_RECHECK_MS, 30000) },
  cookieSecure: env.COOKIE_SECURE ? env.COOKIE_SECURE === "true" : prod,
  trustProxy: env.TRUST_PROXY === "true",
  // Extra sites allowed to send changes (for example the Vercel address that forwards /api here).
  allowedOrigins: (env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim().replace(/\/$/, "")).filter(Boolean),
  adminEmail: (env.ADMIN_EMAIL || env.DT_ADMIN_EMAIL || "").toLowerCase(),
  reminderIntervalMs: num(env.REMINDER_INTERVAL_MS, 60000),
  // Address of the site people use (for links in emails), e.g. https://deadline-tracker.vercel.app. Optional.
  publicUrl: (env.APP_BASE_URL || env.PUBLIC_URL || "").trim().replace(/\/$/, ""),
  // Email for password reset links (see lib/mail.js). Optional: without it an admin can make a reset link.
  mail: { provider: (env.EMAIL_PROVIDER || "").trim().toLowerCase(), apiKey: (env.EMAIL_API_KEY || "").trim(), from: (env.EMAIL_FROM || "").trim(), apiUrl: (env.EMAIL_API_URL || "").trim() || null },
  resetTokenMinutes: num(env.RESET_TOKEN_MINUTES, 30),
  // Telegram bot (optional). Token from @BotFather; only on the server. Updates arrive by webhook when the site has
  // a public address (APP_BASE_URL) in production, otherwise by polling (your laptop). TELEGRAM_MODE=off disables.
  telegram: { token: (env.TELEGRAM_BOT_TOKEN || "").trim(), apiUrl: (env.TELEGRAM_API_URL || "").trim() || null,
    mode: (env.TELEGRAM_MODE || "").trim().toLowerCase(), webhookSecret: (env.TELEGRAM_WEBHOOK_SECRET || "").trim() || null,
    pollSeconds: env.TELEGRAM_POLL_SECONDS != null ? num(env.TELEGRAM_POLL_SECONDS, 25) : null },
  outboxIntervalMs: num(env.OUTBOX_INTERVAL_MS, 15000),
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
    timeoutMs: num(env.GEMINI_TIMEOUT_MS, 30000),
    // Streamed answers: how long to wait for the first words, between pieces, and for the whole answer.
    firstTokenMs: num(env.GEMINI_FIRST_TOKEN_MS, 20000), idleMs: num(env.GEMINI_IDLE_MS, 20000), streamMs: num(env.GEMINI_STREAM_MS, 120000),
    // Pause before the first retry after a server fault (the next pause is 3x this).
    retryMs: num(env.GEMINI_RETRY_MS, 600),
    // Optional thinking level ("minimal", "low", "medium", "high"). Empty = the model's own default (minimal for Flash-Lite, the fastest).
    thinking: /^(minimal|low|medium|high)$/.test(env.GEMINI_THINKING || "") ? env.GEMINI_THINKING : "",
    // Room for long answers (timetables, code). Was 900, which cut answers off mid-way.
    maxTokens: num(env.GEMINI_MAX_TOKENS, 4096)
  }
};
