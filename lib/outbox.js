// Email and Telegram delivery.
// Every message is a row in `outbox`, unique per (user, channel, key), so the same reminder is never sent twice,
// even after restarts. A worker sends what's due: success -> 'sent'; a temporary failure is retried with growing
// waits (1, 2, 4, 8 minutes), then 'failed' with the reason; a message that can't be sent (no verified email, no
// linked Telegram, turned off, over the hourly limit) -> 'skipped' with the reason. Quiet hours postpone messages.
// Messages that contain a one-time link (verify email, reset password) are sent at once and only their status is
// stored, never the link.
const crypto = require("crypto");
const T = require("./time");

const esc = t => String(t == null ? "" : t).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
// One branded template for every email (Ivory & Copper, like the site). Plain-text version alongside.
function emailHTML({ title, paras = [], button = null, note = "" }){
  return `<!doctype html><html><body style="margin:0;background:#f6f1e7;padding:24px 12px;font-family:Segoe UI,Arial,sans-serif;color:#1f1a14">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:540px;background:#fffdf9;border:1px solid #eadfcd;border-radius:16px">
<tr><td style="padding:22px 26px 6px"><div style="display:inline-block;width:32px;height:32px;border-radius:9px;background:#a4501c;color:#fff;font-weight:700;text-align:center;line-height:32px;font-size:16px">✓</div>
<span style="font-weight:700;font-size:16px;margin-left:8px;vertical-align:middle">Deadline Tracker</span></td></tr>
<tr><td style="padding:8px 26px 4px"><h1 style="font-size:21px;line-height:1.3;margin:0 0 10px;color:#1f1a14">${esc(title)}</h1>
${paras.map(p => `<p style="font-size:15px;line-height:1.55;margin:0 0 12px;color:#463d33">${esc(p)}</p>`).join("")}
${button ? `<p style="margin:18px 0 8px"><a href="${esc(button.url)}" style="display:inline-block;background:#a4501c;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600;font-size:15px">${esc(button.label)}</a></p>
<p style="font-size:12.5px;color:#6a5e4f;margin:0 0 12px;word-break:break-all">Or open this link: ${esc(button.url)}</p>` : ""}
${note ? `<p style="font-size:12.5px;line-height:1.5;color:#6a5e4f;margin:14px 0 0">${esc(note)}</p>` : ""}</td></tr>
<tr><td style="padding:14px 26px 22px;border-top:1px solid #f0e6d6;font-size:12px;color:#8a7c69">You get this because you have a Deadline Tracker account. Change which messages you get in Settings → Notifications.</td></tr>
</table></td></tr></table></body></html>`;
}
function emailText({ title, paras = [], button = null, note = "" }){
  return [title, "", ...paras, ...(button ? ["", `${button.label}: ${button.url}`] : []), ...(note ? ["", note] : []), "", "Deadline Tracker · Settings → Notifications changes which messages you get."].join("\n");
}
const tgText = ({ title, paras = [], button = null }) => [`<b>${esc(title)}</b>`, ...paras.map(esc), ...(button ? [`<a href="${esc(button.url)}">${esc(button.label)}</a>`] : [])].join("\n");

function createOutbox(db, { mail, telegram, log = () => {}, prefsOf, inQuiet, perHour = 30 }){
  const id = () => "m_" + crypto.randomBytes(9).toString("base64url");
  const ins = db.prepare(`INSERT OR IGNORE INTO outbox (id, user_id, channel, dedupe_key, kind, subject, body_text, body_html, status, not_before, created_at)
                          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?, ?)`);
  const linkOf = uid => db.prepare("SELECT * FROM telegram_links WHERE user_id = ?").get(uid);
  const userOf = uid => db.prepare("SELECT * FROM users WHERE id = ?").get(uid);

  // Queue a message for one channel. msg = { title, paras, button?, note? }. Returns true if newly queued.
  function enqueue(user, channel, key, kind, msg, notBefore = Date.now()){
    const text = channel === "email" ? emailText(msg) : tgText(msg);
    const html = channel === "email" ? emailHTML(msg) : null;
    return ins.run(id(), user.id, channel, key, kind, msg.title, text, html, notBefore, Date.now()).changes > 0;
  }
  // Can this user get this kind of message on this channel right now? Returns null or the reason why not.
  function blocked(user, channel, kind, category){
    const p = prefsOf(user);
    if (channel === "email") {
      if (!mail || !mail.configured()) return "email isn't set up on this server";
      if (!user.email_verified_at && !["welcome", "verify", "reset", "reset_done", "password_changed"].includes(kind)) return "email address not confirmed";
      if (p.email === false && !["welcome", "verify", "reset", "reset_done", "password_changed"].includes(kind)) return "email messages turned off";
    } else {
      if (!telegram || !telegram.configured()) return "Telegram isn't set up on this server";
      if (!linkOf(user.id)) return "Telegram not connected";
      if (p.telegram === false && kind !== "telegram_test") return "Telegram messages turned off";
    }
    if (category && p[category] === false) return `${category} messages turned off`;
    return null;
  }
  const overLimit = (uid, channel) => db.prepare("SELECT COUNT(*) n FROM outbox WHERE user_id = ? AND channel = ? AND status = 'sent' AND sent_at > ?").get(uid, channel, Date.now() - 3600e3).n >= perHour;

  async function deliver(row){
    const user = userOf(row.user_id); if (!user || user.disabled) return mark(row, "skipped", "account gone or turned off");
    if (row.channel === "email") await mail.send({ to: user.email, subject: row.subject, text: row.body_text, html: row.body_html });
    else { const l = linkOf(user.id); if (!l) return mark(row, "skipped", "Telegram not connected"); await telegram.send(l.chat_id, row.body_text); }
    mark(row, "sent");
  }
  function mark(row, status, err){ db.prepare("UPDATE outbox SET status = ?, last_error = ?, sent_at = CASE WHEN ? = 'sent' THEN ? ELSE sent_at END, attempts = attempts + (CASE WHEN ? IN ('sent','failed') THEN 1 ELSE 0 END) WHERE id = ?").run(status, err || null, status, Date.now(), status, row.id); }

  let running = false;
  async function tick(now = Date.now()){
    if (running) return; running = true;
    try {
      const rows = db.prepare("SELECT * FROM outbox WHERE status = 'queued' AND not_before <= ? ORDER BY not_before LIMIT 25").all(now);
      for (const row of rows) {
        const user = userOf(row.user_id); if (!user) { mark(row, "skipped", "account gone"); continue; }
        const cat = row.dedupe_key.split("|")[1] || null;
        const why = blocked(user, row.channel, row.kind, cat);
        if (why) { mark(row, "skipped", why); continue; }
        const p = prefsOf(user);
        if (!["reset", "verify", "welcome", "reset_done", "password_changed", "telegram_test", "telegram_linked"].includes(row.kind) && inQuiet(p, T.localTime(now, user.timezone))) {
          db.prepare("UPDATE outbox SET not_before = ? WHERE id = ?").run(now + 15 * 60e3, row.id); continue;
        }
        if (overLimit(user.id, row.channel)) { mark(row, "skipped", `more than ${perHour} messages in an hour`); continue; }
        try { await deliver(row); }
        catch (e) {
          const tries = row.attempts + 1;
          if (e.code === "blocked") { db.prepare("DELETE FROM telegram_links WHERE user_id = ?").run(user.id); mark(row, "failed", "the bot was blocked in Telegram; disconnected"); continue; }
          if (tries >= 5) { db.prepare("UPDATE outbox SET status = 'failed', attempts = ?, last_error = ? WHERE id = ?").run(tries, String(e.message).slice(0, 300), row.id); log(row.channel, e); }
          else db.prepare("UPDATE outbox SET attempts = ?, last_error = ?, not_before = ? WHERE id = ?").run(tries, String(e.message).slice(0, 300), now + Math.pow(2, tries - 1) * 60e3, row.id);
        }
      }
      db.prepare("DELETE FROM outbox WHERE created_at < ? AND (status <> 'queued' OR not_before >= 8.64e15)").run(now - 60 * 864e5);
    } finally { running = false; }
  }
  // Send right away (messages with one-time links). Only the status is stored, never the text with the link.
  // A direct send is "queued" only while it is being sent. Its not_before is set beyond any real time so the
  // background job (tick) never picks it up: before this, a slow email service let tick send a second copy
  // whose text was the "[not stored]" placeholder.
  const NEVER = 8.64e15;
  async function sendNow(user, channel, key, kind, msg){
    const why = blocked(user, channel, kind, null);
    const rowId = id(); const now = Date.now();
    db.prepare(`INSERT INTO outbox (id, user_id, channel, dedupe_key, kind, subject, body_text, status, not_before, created_at, last_error)
                VALUES (?, ?, ?, ?, ?, ?, '[contains a one-time link; not stored]', ?, ?, ?, ?)
                ON CONFLICT (user_id, channel, dedupe_key) DO UPDATE SET status = excluded.status, last_error = excluded.last_error, created_at = excluded.created_at, not_before = excluded.not_before`).run(rowId, user.id, channel, key, kind, msg.title, why ? "skipped" : "queued", NEVER, now, why);
    const row = db.prepare("SELECT * FROM outbox WHERE user_id = ? AND channel = ? AND dedupe_key = ?").get(user.id, channel, key);
    if (why) return { ok: false, reason: why };
    try {
      if (channel === "email") await mail.send({ to: user.email, subject: msg.title, text: emailText(msg), html: emailHTML(msg) });
      else { const l = linkOf(user.id); await telegram.send(l.chat_id, tgText(msg)); }
      mark(row, "sent"); return { ok: true };
    } catch (e) { db.prepare("UPDATE outbox SET status = 'failed', attempts = 1, not_before = created_at, last_error = ? WHERE id = ?").run(String(e.message).slice(0, 300), row.id); log(channel, e); return { ok: false, reason: e.message }; }
  }
  let timer = null;
  return { enqueue, sendNow, tick, blocked, start(ms = 15000){ timer = setInterval(() => tick().catch(e => log("outbox", e)), ms); timer.unref(); }, stop(){ clearInterval(timer); } };
}
module.exports = { createOutbox, emailHTML, emailText, tgText, esc };
