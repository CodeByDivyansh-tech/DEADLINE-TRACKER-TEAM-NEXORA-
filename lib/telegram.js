// Telegram Bot API client (official HTTPS API, no packages). The bot token lives only in TELEGRAM_BOT_TOKEN on the
// server; it is never sent to the browser, logged, or included in error messages.
// Updates (people pressing "Start" in the bot) arrive either by webhook (TELEGRAM_WEBHOOK_URL set: Telegram calls
// POST /api/telegram/webhook with our secret header) or, without a public address (your laptop), by long polling.
const crypto = require("crypto");

function createTelegram(cfg, { fetchImpl = fetch, log = () => {} } = {}){
  const token = cfg.token || "", base = (cfg.apiUrl || "https://api.telegram.org").replace(/\/$/, "");
  const configured = () => /^\d{5,}:[A-Za-z0-9_-]{30,}$/.test(token);
  // Secret Telegram must send back with each webhook call (only [A-Za-z0-9_-], up to 256 chars).
  const webhookSecret = cfg.webhookSecret || (configured() ? crypto.createHmac("sha256", token).update("dt-webhook").digest("base64url") : "");
  const clean = s => String(s || "").split(token).join("[bot token]");
  let me = null, polling = false, offset = 0, stopped = false;

  async function call(method, body, timeoutMs = 15000){
    if (!configured()) { const e = new Error("Telegram isn't set up on this server (TELEGRAM_BOT_TOKEN)."); e.code = "no_telegram"; throw e; }
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const r = await fetchImpl(`${base}/bot${token}/${method}`, { method: "POST", signal: ctrl.signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j || !j.ok) { const e = new Error(`Telegram ${method} failed (${r.status}): ${clean(j && j.description || "no details").slice(0, 200)}`); e.code = r.status === 403 ? "blocked" : "telegram_failed"; e.status = r.status; throw e; }
      return j.result;
    } catch (e) { if (e.name === "AbortError") { const x = new Error(`Telegram ${method} didn't answer in time`); x.code = "telegram_failed"; throw x; } e.message = clean(e.message); throw e; }
    finally { clearTimeout(t); }
  }
  async function botUsername(){ if (!configured()) return null; if (!me) { try { me = await call("getMe"); } catch (e) { log("telegram", e); return null; } } return me.username || null; }
  const send = (chatId, text) => call("sendMessage", { chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true });

  // Start receiving updates. onUpdate(update) handles each one.
  async function start(onUpdate){
    if (!configured()) return { mode: "off" };
    if (cfg.webhookUrl) {
      try { await call("setWebhook", { url: cfg.webhookUrl, secret_token: webhookSecret, allowed_updates: ["message"], drop_pending_updates: false }); return { mode: "webhook" }; }
      catch (e) { log("telegram", e); return { mode: "webhook", error: e.message }; }
    }
    if (cfg.polling === false) return { mode: "off" };
    try { await call("deleteWebhook", { drop_pending_updates: false }); } catch (e) { log("telegram", e); }
    polling = true;
    (async function loop(){
      while (!stopped) {
        try {
          const ups = await call("getUpdates", { offset, timeout: cfg.pollSeconds == null ? 25 : cfg.pollSeconds, allowed_updates: ["message"] }, ((cfg.pollSeconds == null ? 25 : cfg.pollSeconds) + 10) * 1000);
          for (const u of ups || []) { offset = Math.max(offset, u.update_id + 1); try { await onUpdate(u); } catch (e) { log("telegram", e); } }
          if (cfg.pollSeconds === 0) await new Promise(r => setTimeout(r, 300));
        } catch (e) { if (!stopped) { log("telegram", e); await new Promise(r => setTimeout(r, 5000)); } }
      }
    })();
    return { mode: "polling" };
  }
  const checkSecret = h => { const a = Buffer.from(String(h || "")), b = Buffer.from(webhookSecret); return !!webhookSecret && a.length === b.length && crypto.timingSafeEqual(a, b); };
  return { configured, call, send, botUsername, start, stop(){ stopped = true; }, checkSecret, status: () => ({ configured: configured(), mode: !configured() ? "off" : cfg.webhookUrl ? "webhook" : polling ? "polling" : "off", bot: me && me.username || null }) };
}
module.exports = { createTelegram };
