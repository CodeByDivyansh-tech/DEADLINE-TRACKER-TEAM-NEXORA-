// Accounts: registration, login, logout, sessions, profile, password change, forgot password / reset links.
// Passwords: scrypt with a random salt per user. Sessions: random token in an HttpOnly cookie; only its SHA-256 is stored.
const crypto = require("crypto");
const { ApiError, V, limiter } = require("../http");
const { validTz } = require("../time");

const COOKIE = "dt_session";
const SESSION_DAYS = 30;
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const REMINDER_CHOICES = [10080, 4320, 2880, 1440, 180, 60, 30, 15, 0];
// email / telegram: send reminders there too (once the address is confirmed / Telegram is connected).
// deadline / study / account: which kinds of messages go to email and Telegram (the bell in the app always shows them).
const DEFAULT_PREFS = { before: [1440, 60], dueToday: true, overdue: true, dailySummary: true, highDone: true, quietOn: false, quietFrom: "22:00", quietTo: "07:00",
  email: true, telegram: true, deadline: true, study: true, account: true };
const sha = s => crypto.createHash("sha256").update(s).digest("hex");
// Password hashing: scrypt (memory-hard; built into Node, no packages) with a random 16-byte salt per user.
// s2 = N 2^14, r 8, p 5: one of OWASP's equivalent scrypt settings (~16 MiB, ~0.25 s). s1 was the older, cheaper
// setting; those hashes still verify and are upgraded to s2 at the next successful login.
const HASH = { s1: { N: 16384, r: 8, p: 1 }, s2: { N: 16384, r: 8, p: 5 } }, ALGO = "s2";
const scrypt = (pw, salt, algo = ALGO) => new Promise((res, rej) => crypto.scrypt(pw, salt, 64, Object.assign({ maxmem: 64 * 1024 * 1024 }, HASH[algo] || HASH.s1), (e, k) => e ? rej(e) : res(k.toString("hex"))));
const sameHash = (a, b) => typeof a === "string" && typeof b === "string" && a.length === b.length && crypto.timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
const newId = p => p + "_" + crypto.randomBytes(9).toString("base64url");

function cleanPrefs(input, base = DEFAULT_PREFS){
  const p = Object.assign({}, DEFAULT_PREFS, base);
  if (input == null) return p;
  if (typeof input !== "object") throw new ApiError(400, "invalid_notifyPrefs", "notifyPrefs must be an object.");
  if (input.before !== undefined) {
    if (!Array.isArray(input.before) || input.before.length > 6 || !input.before.every(m => REMINDER_CHOICES.includes(m))) throw new ApiError(400, "invalid_before", `before must be a list of minutes from: ${REMINDER_CHOICES.join(", ")}.`);
    p.before = [...new Set(input.before)].sort((a, b) => b - a);
  }
  ["dueToday", "overdue", "dailySummary", "highDone", "quietOn", "email", "telegram", "deadline", "study", "account"].forEach(k => { if (input[k] !== undefined) p[k] = V.bool(input[k], k); });
  ["quietFrom", "quietTo"].forEach(k => { if (input[k] !== undefined) { if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(input[k])) throw new ApiError(400, "invalid_" + k, `${k} must look like 22:00.`); p[k] = input[k]; } });
  return p;
}

function createAuth(db, cfg, { mail = null, log = () => {}, storageOk = () => true, events = null } = {}){
  // Two log-in limits: per IP + email, and per email alone. The second one can't be dodged by faking the
  // X-Forwarded-For header (which a client can set when TRUST_PROXY is on).
  const accountLimit = limiter(30, 15 * 60e3);
  const loginLimit = limiter(10, 15 * 60e3), signupLimit = limiter(20, 15 * 60e3), pwLimit = limiter(10, 15 * 60e3);
  const publicUser = u => u ? { id: u.id, email: u.email, name: u.name, role: u.role, timezone: u.timezone, notifyPrefs: Object.assign({}, DEFAULT_PREFS, JSON.parse(u.notify_prefs || "{}")), emailVerified: !!u.email_verified_at, createdAt: u.created_at } : null;
  const prefsOf = u => Object.assign({}, DEFAULT_PREFS, JSON.parse(u.notify_prefs || "{}"));
  function newSession(userId){
    const token = crypto.randomBytes(32).toString("base64url");
    db.prepare("INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)").run(sha(token), userId, Date.now(), Date.now() + SESSION_DAYS * 864e5);
    db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(Date.now());
    return token;
  }
  const cookieFor = (token, maxAge = SESSION_DAYS * 86400) => `${COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${cfg.cookieSecure ? "; Secure" : ""}`;
  function tokenOf(req){
    const pair = String(req.headers.cookie || "").split(/;\s*/).map(x => x.split("=")).find(([k]) => k === COOKIE);
    return pair ? pair.slice(1).join("=") : null;
  }
  // Who is making this request? Checked on the server for every call; the browser can't choose its user id.
  function userOf(req){
    const t = tokenOf(req); if (!t || t.length > 100) return null;
    const row = db.prepare("SELECT u.*, s.expires_at AS s_exp FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?").get(sha(t));
    if (!row) return null;
    if (row.s_exp < Date.now() || row.disabled) { db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(sha(t)); return null; }
    return row;
  }
  async function signup(b, ip){
    const name = V.str(b.name, "name", { min: 1, max: 80, required: true });
    const email = String(b.email || "").trim().toLowerCase();
    if (!EMAIL_RE.test(email) || email.length > 254) throw new ApiError(400, "email", "Please enter a valid email address.", { field: "email" });
    const password = typeof b.password === "string" ? b.password : "";
    if (password.length < 8) throw new ApiError(400, "password", "Use at least 8 characters for your password.", { field: "password" });
    if (password.length > 200) throw new ApiError(400, "password", "That password is too long.", { field: "password" });
    const tz = b.timezone && validTz(b.timezone) ? b.timezone : "UTC";
    if (!signupLimit(ip).ok) throw new ApiError(429, "rate_limited", "Too many tries. Wait 15 minutes and try again.");
    // An account the server can't keep would disappear at the next restart, and logging in would then say
    // "wrong password". Refuse it plainly instead (the admin sees why in /api/health).
    if (!storageOk()) throw new ApiError(503, "storage_unavailable", "Sorry, we can't create new accounts right now because the server can't save them permanently. Please try again later.");
    if (db.prepare("SELECT 1 FROM users WHERE email = ?").get(email)) throw new ApiError(409, "exists", "An account with this email already exists. Log in instead.", { field: "email" });
    const salt = crypto.randomBytes(16).toString("hex"); const hash = await scrypt(password, salt);
    const first = !db.prepare("SELECT 1 FROM users LIMIT 1").get();
    const role = first || (cfg.adminEmail && cfg.adminEmail === email) ? "admin" : "user";
    const id = newId("u"); const now = Date.now();
    db.prepare("INSERT INTO users (id, email, name, pass_hash, salt, pass_algo, role, timezone, notify_prefs, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(id, email, name, hash, salt, ALGO, role, tz, JSON.stringify(DEFAULT_PREFS), now, now);
    if (events) events.emit("signup", db.prepare("SELECT * FROM users WHERE id = ?").get(id));
    return { user: publicUser(db.prepare("SELECT * FROM users WHERE id = ?").get(id)), cookie: cookieFor(newSession(id)) };
  }
  async function login(b, ip){
    const email = String(b.email || "").trim().toLowerCase(); const password = typeof b.password === "string" ? b.password : "";
    if (!email) throw new ApiError(400, "email", "Please enter your email.", { field: "email" });
    if (!EMAIL_RE.test(email) || email.length > 254) throw new ApiError(400, "email", "Please enter a valid email address.", { field: "email" });
    if (!password) throw new ApiError(400, "password", "Please enter your password.", { field: "password" });
    if (!loginLimit(ip + "|" + email).ok || !accountLimit(email).ok) throw new ApiError(429, "rate_limited", "Too many tries. Wait 15 minutes and try again.");
    const u = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
    const hash = await scrypt(password.slice(0, 200), u ? u.salt : "00000000000000000000000000000000", u ? u.pass_algo : ALGO); // same work either way
    if (!u || !sameHash(hash, u.pass_hash)) throw new ApiError(401, "wrong", "Email or password is wrong.");
    if (u.disabled) throw new ApiError(403, "disabled", "This account has been turned off. Contact the admin.");
    if (u.pass_algo !== ALGO) {   // upgrade an older hash now that we know the password is right
      const salt = crypto.randomBytes(16).toString("hex");
      db.prepare("UPDATE users SET pass_hash = ?, salt = ?, pass_algo = ? WHERE id = ? AND pass_hash = ?").run(await scrypt(password.slice(0, 200), salt, ALGO), salt, ALGO, u.id, u.pass_hash);
    }
    if (b.timezone && validTz(b.timezone) && b.timezone !== u.timezone) db.prepare("UPDATE users SET timezone = ?, updated_at = ? WHERE id = ?").run(b.timezone, Date.now(), u.id);
    return { user: publicUser(db.prepare("SELECT * FROM users WHERE id = ?").get(u.id)), cookie: cookieFor(newSession(u.id)) };
  }
  function logout(req){ const t = tokenOf(req); if (t) db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(sha(t)); return cookieFor("", 0); }
  function updateProfile(user, b){
    const name = b.name !== undefined ? V.str(b.name, "name", { min: 1, max: 80, required: true }) : user.name;
    let tz = user.timezone;
    if (b.timezone !== undefined) { if (!validTz(b.timezone)) throw new ApiError(400, "invalid_timezone", "Unknown time zone. Use a name like Asia/Kolkata."); tz = b.timezone; }
    const prefs = b.notifyPrefs !== undefined ? cleanPrefs(b.notifyPrefs, prefsOf(user)) : prefsOf(user);
    db.prepare("UPDATE users SET name = ?, timezone = ?, notify_prefs = ?, updated_at = ? WHERE id = ?").run(name, tz, JSON.stringify(prefs), Date.now(), user.id);
    return publicUser(db.prepare("SELECT * FROM users WHERE id = ?").get(user.id));
  }
  async function changePassword(user, b, req){
    if (!pwLimit(user.id).ok) throw new ApiError(429, "rate_limited", "Too many tries. Wait 15 minutes and try again.");
    const cur = await scrypt(String(b.currentPassword || "").slice(0, 200), user.salt, user.pass_algo);
    if (!sameHash(cur, user.pass_hash)) throw new ApiError(400, "wrong_password", "Your current password is wrong.", { field: "currentPassword" });
    const next = typeof b.newPassword === "string" ? b.newPassword : "";
    if (next.length < 8 || next.length > 200) throw new ApiError(400, "password", "Use 8 to 200 characters for the new password.", { field: "newPassword" });
    const salt = crypto.randomBytes(16).toString("hex");
    db.prepare("UPDATE users SET pass_hash = ?, salt = ?, pass_algo = ?, updated_at = ? WHERE id = ?").run(await scrypt(next, salt), salt, ALGO, Date.now(), user.id);
    if (events) events.emit("password_changed", user);
    // sign out every other device
    db.prepare("DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?").run(user.id, sha(tokenOf(req) || ""));
  }

  /* ---------- Forgot password: one-time links ----------
     The token (32 random bytes) is only in the link; the database keeps its SHA-256. A link works once, for
     RESET_TOKEN_MINUTES (30 by default; admin-made links: 24 hours), and a newer link replaces older ones.
     Using it sets the new password and signs out every device. The answer to "forgot password" is the same
     whether or not the email has an account, and the email is sent in the background so timing doesn't tell either. */
  const forgotIpLimit = limiter(20, 15 * 60e3), forgotEmailLimit = limiter(3, 60 * 60e3), resetLimit = limiter(30, 15 * 60e3);
  const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
  const BAD_TOKEN = () => new ApiError(400, "bad_token", "This reset link has expired or isn't valid. Ask for a new one.");
  // Where links point. Only trusted addresses: PUBLIC_URL, an ALLOWED_ORIGINS entry, or (outside production) this server.
  // Never the Host header in production, which anyone can set (that would let someone send your link to their site).
  function linkBase(req){
    if (cfg.publicUrl) return cfg.publicUrl;
    const o = String(req.headers.origin || "").replace(/\/$/, "");
    if (o && cfg.allowedOrigins.includes(o)) return o;
    if (cfg.allowedOrigins.length) return cfg.allowedOrigins[0];
    if (cfg.prod) return null;
    return o || `http://${req.headers.host}`;
  }
  function makeResetLink(userId, via, req){
    const base = linkBase(req); if (!base) return null;
    const token = crypto.randomBytes(32).toString("base64url"), now = Date.now();
    const minutes = via === "admin" ? Math.max(cfg.resetTokenMinutes, 24 * 60) : cfg.resetTokenMinutes;
    const expires = now + minutes * 60e3;
    db.tx(() => {
      db.prepare("DELETE FROM password_resets WHERE user_id = ? AND used_at IS NULL").run(userId);
      db.prepare("DELETE FROM password_resets WHERE expires_at < ?").run(now - 7 * 864e5);
      db.prepare("INSERT INTO password_resets (token_hash, user_id, via, created_at, expires_at) VALUES (?, ?, ?, ?, ?)").run(sha(token), userId, via, now, expires);
    });
    return { link: `${base}/#reset=${token}`, expiresAt: new Date(expires).toISOString() };
  }
  const minutesText = m => { const n = Math.max(1, Math.round(m)); return n % 60 === 0 && n >= 60 ? `${n / 60} hour${n === 60 ? "" : "s"}` : `${n} minute${n === 1 ? "" : "s"}`; };
  const escHtml = t => String(t).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  function resetEmail(u, link){
    const life = minutesText(cfg.resetTokenMinutes), first = String(u.name || "").split(" ")[0] || "there";
    const text = `Hi ${first},\n\nSomeone (hopefully you) asked to reset the password for your Deadline Tracker account (${u.email}).\n\nSet a new password here:\n${link}\n\nThe link works once, for ${life}. If you didn't ask for this, ignore this email; your password stays the same.\n\nDeadline Tracker`;
    const html = `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:15px;line-height:1.5;color:#1f1a14;max-width:520px">
<p>Hi ${escHtml(first)},</p><p>Someone (hopefully you) asked to reset the password for your Deadline Tracker account (${escHtml(u.email)}).</p>
<p><a href="${escHtml(link)}" style="display:inline-block;background:#a4501c;color:#fff;text-decoration:none;padding:11px 18px;border-radius:10px;font-weight:600">Set a new password</a></p>
<p style="color:#6a5e4f;font-size:13px">Or copy this link: ${escHtml(link)}</p>
<p style="color:#6a5e4f;font-size:13px">The link works once, for ${life}. If you didn't ask for this, ignore this email; your password stays the same.</p></div>`;
    return { to: u.email, subject: "Reset your Deadline Tracker password", text, html };
  }
  function requestReset(b, ip, req){
    if (!b || typeof b.email !== "string" || !b.email.trim()) throw new ApiError(400, "email", "Please enter your email.", { field: "email" });
    const email = b.email.trim().toLowerCase();
    if (!EMAIL_RE.test(email) || email.length > 254) throw new ApiError(400, "email", "Please enter a valid email address.", { field: "email" });
    if (!forgotIpLimit(ip).ok) throw new ApiError(429, "rate_limited", "Too many tries. Wait 15 minutes and try again.");
    if (!mail || !mail.configured()) return { ok: true, emailEnabled: false, message: "Reset emails aren't set up on this site yet. Ask the site's admin for a reset link." };
    const answer = { ok: true, emailEnabled: true, message: `If an account uses this email, we've sent it a link to set a new password. The link works for ${minutesText(cfg.resetTokenMinutes)}. Check your spam folder too.` };
    if (!forgotEmailLimit(email).ok) return answer;
    const u = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
    if (!u || u.disabled) return answer;
    const made = makeResetLink(u.id, "email", req);
    if (!made) { log("mail", new Error("No address for reset links: set PUBLIC_URL or ALLOWED_ORIGINS.")); return answer; }
    mail.send(resetEmail(u, made.link)).catch(e => log("mail", e));
    return answer;
  }
  async function resetPassword(b, ip){
    if (!resetLimit(ip).ok) throw new ApiError(429, "rate_limited", "Too many tries. Wait 15 minutes and try again.");
    const token = b && typeof b.token === "string" ? b.token : "";
    if (!TOKEN_RE.test(token)) throw BAD_TOKEN();
    const row = db.prepare("SELECT * FROM password_resets WHERE token_hash = ?").get(sha(token));
    if (!row || row.used_at || row.expires_at < Date.now()) throw BAD_TOKEN();
    const u = db.prepare("SELECT * FROM users WHERE id = ?").get(row.user_id);
    if (!u || u.disabled) throw BAD_TOKEN();
    const pw = b && typeof b.password === "string" ? b.password : "";
    if (pw.length < 8) throw new ApiError(400, "password", "Use at least 8 characters for your password.", { field: "password" });
    if (pw.length > 200) throw new ApiError(400, "password", "That password is too long.", { field: "password" });
    const salt = crypto.randomBytes(16).toString("hex"), hash = await scrypt(pw, salt), now = Date.now();
    db.tx(() => {
      const used = db.prepare("UPDATE password_resets SET used_at = ? WHERE token_hash = ? AND used_at IS NULL").run(now, row.token_hash);
      if (!used.changes) throw BAD_TOKEN();   // used by a parallel request a moment ago
      db.prepare("UPDATE users SET pass_hash = ?, salt = ?, pass_algo = ?, updated_at = ? WHERE id = ?").run(hash, salt, ALGO, now, u.id);
      db.prepare("DELETE FROM password_resets WHERE user_id = ? AND used_at IS NULL").run(u.id);
      db.prepare("DELETE FROM sessions WHERE user_id = ?").run(u.id);   // every device signs in again
    });
    if (events) events.emit("password_reset", u);
    return { ok: true, email: u.email };   // only to whoever holds the valid link, so the log-in form can be filled in
  }
  function adminResetLink(userId, req){
    const u = db.prepare("SELECT id FROM users WHERE id = ?").get(userId);
    if (!u) throw new ApiError(404, "not_found", "No such user.");
    const made = makeResetLink(u.id, "admin", req);
    if (!made) throw new ApiError(500, "no_address", "Set PUBLIC_URL (your site's address) so reset links point to the right place.");
    return made;
  }
  return { signup, login, logout, userOf, publicUser, prefsOf, updateProfile, changePassword, requestReset, resetPassword, adminResetLink, DEFAULT_PREFS };
}
module.exports = { createAuth, DEFAULT_PREFS, cleanPrefs, newId };
