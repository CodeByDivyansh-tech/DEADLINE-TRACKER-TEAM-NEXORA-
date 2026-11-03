// Email and Telegram for each account: confirming the email address, account messages (welcome, password reset or
// change), connecting Telegram, test messages, and sending reminders from the reminder job to the channels each
// person turned on. Every query is limited to the logged-in user's own rows.
const crypto = require("crypto");
const { ApiError, limiter } = require("../http");

const sha = s => crypto.createHash("sha256").update(s).digest("hex");
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
const VERIFY_HOURS = 24, LINK_MINUTES = 10;

function createChannels({ db, cfg, mail, telegram, outbox, events, log = () => {} }){
  const site = () => cfg.publicUrl || (cfg.allowedOrigins && cfg.allowedOrigins[0]) || null;
  const appButton = () => site() ? { label: "Open Deadline Tracker", url: site() + "/" } : null;
  const resendLimit = limiter(3, 60 * 60e3), verifyLimit = limiter(30, 15 * 60e3), linkLimit = limiter(10, 60 * 60e3), testLimit = limiter(3, 10 * 60e3);
  const userById = id => db.prepare("SELECT * FROM users WHERE id = ?").get(id);

  /* ---------- confirming the email address ---------- */
  function verifyLink(user){
    if (!site()) return null;
    const token = crypto.randomBytes(32).toString("base64url"), now = Date.now();
    db.tx(() => {
      db.prepare("DELETE FROM email_verifications WHERE user_id = ? AND used_at IS NULL").run(user.id);
      db.prepare("INSERT INTO email_verifications (token_hash, user_id, email, created_at, expires_at) VALUES (?, ?, ?, ?, ?)").run(sha(token), user.id, user.email, now, now + VERIFY_HOURS * 3600e3);
    });
    return `${site()}/#verify=${token}`;
  }
  async function sendWelcome(user){
    // once per account, whatever happens (a repeated event can't send it twice)
    if (db.prepare("SELECT 1 FROM outbox WHERE user_id = ? AND channel = 'email' AND dedupe_key = 'welcome' AND status IN ('sent', 'queued')").get(user.id)) return { ok: true, already: true };
    const first = String(user.name || "").split(" ")[0] || "there", link = verifyLink(user);
    return outbox.sendNow(user, "email", "welcome", "welcome", { title: `Welcome to Deadline Tracker, ${first}!`,
      paras: ["Your account is ready. Tell it about your work: it builds your to-do list, shows what's at risk, and reminds you before things are due.",
        link ? "Please confirm this email address so we can send you reminders here." : "Reminders by email start once this address is confirmed in Settings → Notifications."],
      button: link ? { label: "Confirm my email", url: link } : appButton(), note: `The confirmation link works once, for ${VERIFY_HOURS} hours. If you didn't create this account, ignore this email.` });
  }
  async function resendVerify(user){
    if (user.email_verified_at) return { ok: true, already: true };
    if (!resendLimit(user.id).ok) throw new ApiError(429, "rate_limited", "You asked for several emails already. Wait an hour and try again.");
    if (!mail || !mail.configured()) throw new ApiError(503, "no_email", "Email isn't set up on this site yet, so we can't send the confirmation email.");
    const link = verifyLink(user); if (!link) throw new ApiError(503, "no_address", "The site's address isn't set (APP_BASE_URL), so the link can't be made.");
    const r = await outbox.sendNow(user, "email", "verify:" + Date.now(), "verify", { title: "Confirm your email address", paras: ["Tap the button to confirm this is your email address. Then your reminders can arrive here too."],
      button: { label: "Confirm my email", url: link }, note: `The link works once, for ${VERIFY_HOURS} hours. If you didn't ask for this, ignore this email.` });
    if (!r.ok) throw new ApiError(502, "send_failed", "We couldn't send the email just now. Please try again in a few minutes.");
    return { ok: true };
  }
  function confirmEmail(b, ip){
    if (!verifyLimit(ip).ok) throw new ApiError(429, "rate_limited", "Too many tries. Wait 15 minutes and try again.");
    const token = b && typeof b.token === "string" ? b.token : "";
    const bad = () => new ApiError(400, "bad_token", "This confirmation link has expired or isn't valid. Ask for a new one in Settings → Notifications.");
    if (!TOKEN_RE.test(token)) throw bad();
    const row = db.prepare("SELECT * FROM email_verifications WHERE token_hash = ?").get(sha(token));
    if (!row || row.used_at || row.expires_at < Date.now()) throw bad();
    const u = userById(row.user_id); if (!u || u.email !== row.email) throw bad();   // the address changed since
    db.tx(() => {
      if (!db.prepare("UPDATE email_verifications SET used_at = ? WHERE token_hash = ? AND used_at IS NULL").run(Date.now(), row.token_hash).changes) throw bad();
      db.prepare("UPDATE users SET email_verified_at = COALESCE(email_verified_at, ?) WHERE id = ?").run(Date.now(), u.id);
    });
    return { ok: true, email: u.email };
  }

  /* ---------- account messages ---------- */
  function account(user, key, kind, msg){
    for (const ch of ["email", "telegram"]) outbox.enqueue(user, ch, `${key}|account`, kind, msg);
    outbox.tick().catch(e => log("outbox", e));
  }
  if (events) {
    events.on("signup", u => { sendWelcome(u).catch(e => log("mail", e)); });
    events.on("password_reset", u => account(u, "reset_done:" + Date.now(), "reset_done", { title: "Your password was changed", paras: ["The password for your Deadline Tracker account was just reset with an emailed link, and every device was signed out.", "If this wasn't you, reset it again now and check who can read your email."], button: appButton() }));
    events.on("password_changed", u => account(u, "pw_changed:" + Date.now(), "password_changed", { title: "Your password was changed", paras: ["The password for your Deadline Tracker account was changed in Settings, and other devices were signed out.", "If this wasn't you, use \"Forgot password?\" on the log-in page right away."], button: appButton() }));
  }

  /* ---------- reminders from the reminder job ---------- */
  // rows: notifications that just became due for this user. Old ones (the server was asleep) aren't sent outside the app.
  function onDelivered(user, rows, now = Date.now()){
    let n = 0;
    for (const r of rows) {
      if (r.scheduled_at < now - 2 * 3600e3) continue;
      const cat = r.kind === "summary" || r.kind === "high_done" || /:p\d+:/.test(r.dedupe_key) ? "study" : "deadline";
      const title = { reminder: cat === "study" ? "Study reminder" : "Deadline reminder", due_today: "Due today", overdue: "Overdue", summary: "Your day", high_done: "Nice work" }[r.kind] || "Reminder";
      for (const ch of ["email", "telegram"]) if (outbox.enqueue(user, ch, `n:${r.dedupe_key}|${cat}`, r.kind, { title, paras: [r.message], button: appButton() })) n++;
    }
    if (n) outbox.tick().catch(e => log("outbox", e));
  }

  /* ---------- Telegram ---------- */
  const tgOf = uid => db.prepare("SELECT * FROM telegram_links WHERE user_id = ?").get(uid);
  async function status(user){
    const l = tgOf(user.id);
    return { email: { address: user.email, verified: !!user.email_verified_at, configured: !!(mail && mail.configured()) },
      telegram: { configured: telegram.configured(), bot: telegram.configured() ? await telegram.botUsername() : null, linked: !!l, username: l ? l.tg_username : null, linkedAt: l ? new Date(l.linked_at).toISOString() : null } };
  }
  async function makeLink(user){
    if (!telegram.configured()) throw new ApiError(503, "no_telegram", "Telegram isn't set up on this site yet. The site's admin needs to add a bot token.");
    if (!linkLimit(user.id).ok) throw new ApiError(429, "rate_limited", "Too many tries. Wait an hour and try again.");
    const bot = await telegram.botUsername(); if (!bot) throw new ApiError(502, "telegram_failed", "Couldn't reach Telegram just now. Try again in a minute.");
    const token = crypto.randomBytes(32).toString("base64url"), now = Date.now();
    db.tx(() => {
      db.prepare("DELETE FROM telegram_link_tokens WHERE user_id = ? OR expires_at < ?").run(user.id, now - 864e5);
      db.prepare("INSERT INTO telegram_link_tokens (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)").run(sha(token), user.id, now, now + LINK_MINUTES * 60e3);
    });
    return { url: `https://t.me/${bot}?start=${token}`, bot, expiresAt: new Date(now + LINK_MINUTES * 60e3).toISOString() };
  }
  async function unlink(user){
    const l = tgOf(user.id); if (!l) return { ok: true };
    db.prepare("DELETE FROM telegram_links WHERE user_id = ?").run(user.id);
    try { await telegram.send(l.chat_id, "You disconnected this chat from Deadline Tracker. You won't get messages here any more."); } catch (e) {}
    return { ok: true };
  }
  async function test(user, channel){
    if (!testLimit(user.id + channel).ok) throw new ApiError(429, "rate_limited", "You sent a few test messages already. Wait 10 minutes.");
    const why = outbox.blocked(user, channel, channel === "telegram" ? "telegram_test" : "email_test", null);
    if (why) throw new ApiError(409, "not_ready", `Can't send a test: ${why}.`);
    const r = await outbox.sendNow(user, channel, `test:${Date.now()}`, channel === "telegram" ? "telegram_test" : "email_test", { title: "Test message", paras: [`This is a test from Deadline Tracker. Reminders you turn on will arrive here${channel === "email" ? "" : " in Telegram"}.`], button: appButton() });
    if (!r.ok) throw new ApiError(502, "send_failed", `Couldn't send it: ${r.reason}`);
    return { ok: true };
  }
  // One update from Telegram (webhook or polling). Only private chats; "/start <token>" links, "/stop" unlinks.
  async function handleUpdate(u){
    const m = u && u.message; if (!m || !m.chat || typeof m.text !== "string") return;
    const chatId = String(m.chat.id);
    const reply = text => telegram.send(chatId, text).catch(e => log("telegram", e));
    if (m.chat.type !== "private") return reply("Please message me in a private chat to connect Deadline Tracker.");
    const [cmd, arg] = m.text.trim().split(/\s+/, 2);
    if (cmd === "/start" && arg) {
      if (!TOKEN_RE.test(arg)) return reply("That link isn't valid. Open Deadline Tracker → Settings → Notifications and tap “Connect Telegram” again.");
      const row = db.prepare("SELECT * FROM telegram_link_tokens WHERE token_hash = ?").get(sha(arg));
      if (!row || row.used_at || row.expires_at < Date.now()) return reply("That link has expired or was already used. Open Deadline Tracker → Settings → Notifications and tap “Connect Telegram” again.");
      const user = userById(row.user_id); if (!user || user.disabled) return reply("That account can't be connected.");
      const other = db.prepare("SELECT user_id FROM telegram_links WHERE chat_id = ?").get(chatId);
      if (other && other.user_id !== user.id) return reply("This Telegram account is already connected to another Deadline Tracker account. Disconnect it there first (Settings → Notifications), then try again.");
      db.tx(() => {
        if (!db.prepare("UPDATE telegram_link_tokens SET used_at = ? WHERE token_hash = ? AND used_at IS NULL").run(Date.now(), row.token_hash).changes) throw new Error("token used twice");
        db.prepare("DELETE FROM telegram_links WHERE user_id = ?").run(user.id);
        db.prepare("INSERT INTO telegram_links (user_id, chat_id, tg_username, linked_at) VALUES (?, ?, ?, ?)").run(user.id, chatId, m.from && m.from.username ? String(m.from.username).slice(0, 64) : null, Date.now());
      });
      return reply(`Connected! Hi ${String(user.name || "").split(" ")[0] || "there"}, your Deadline Tracker reminders will arrive here.\nChoose which ones in Settings → Notifications. Send /stop to disconnect.`);
    }
    if (cmd === "/stop") {
      const l = db.prepare("SELECT user_id FROM telegram_links WHERE chat_id = ?").get(chatId);
      if (l) db.prepare("DELETE FROM telegram_links WHERE chat_id = ?").run(chatId);
      return reply(l ? "Disconnected. You won't get Deadline Tracker messages here any more." : "This chat isn't connected to Deadline Tracker.");
    }
    return reply("I send your Deadline Tracker reminders. To connect, open Deadline Tracker → Settings → Notifications and tap “Connect Telegram”.");
  }
  return { status, resendVerify, confirmEmail, makeLink, unlink, test, handleUpdate, onDelivered, sendWelcome };
}

function routes(r, { channels, telegram }){
  const A = { auth: true };
  r.add("GET", "/api/channels", (c) => channels.status(c.user), A);
  r.add("POST", "/api/auth/verify-email", async (c) => channels.confirmEmail(await c.json(), c.ip));
  r.add("POST", "/api/profile/verify-email", (c) => channels.resendVerify(c.user), A);
  r.add("POST", "/api/channels/email/test", (c) => channels.test(c.user, "email"), A);
  r.add("POST", "/api/telegram/link", (c) => channels.makeLink(c.user), A);
  r.add("DELETE", "/api/telegram", (c) => channels.unlink(c.user), A);
  r.add("POST", "/api/telegram/test", (c) => channels.test(c.user, "telegram"), A);
  // Telegram calls this (webhook mode). Only requests carrying our secret header are accepted.
  r.add("POST", "/api/telegram/webhook", async (c) => {
    if (!telegram.configured() || !telegram.checkSecret(c.req.headers["x-telegram-bot-api-secret-token"])) throw new ApiError(401, "bad_secret", "Not allowed.");
    const u = await c.json(64 * 1024);
    await channels.handleUpdate(u);
    return { ok: true };
  });
}
module.exports = { createChannels, routes };
