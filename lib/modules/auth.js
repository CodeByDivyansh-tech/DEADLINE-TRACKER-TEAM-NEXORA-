// Accounts: registration, login, logout, sessions, profile, password change.
// Passwords: scrypt with a random salt per user. Sessions: random token in an HttpOnly cookie; only its SHA-256 is stored.
const crypto = require("crypto");
const { ApiError, V, limiter } = require("../http");
const { validTz } = require("../time");

const COOKIE = "dt_session";
const SESSION_DAYS = 30;
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const REMINDER_CHOICES = [10080, 4320, 2880, 1440, 180, 60, 30, 15, 0];
const DEFAULT_PREFS = { before: [1440, 60], dueToday: true, overdue: true, dailySummary: true, highDone: true, quietOn: false, quietFrom: "22:00", quietTo: "07:00" };
const sha = s => crypto.createHash("sha256").update(s).digest("hex");
const scrypt = (pw, salt) => new Promise((res, rej) => crypto.scrypt(pw, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (e, k) => e ? rej(e) : res(k.toString("hex"))));
const newId = p => p + "_" + crypto.randomBytes(9).toString("base64url");

function cleanPrefs(input, base = DEFAULT_PREFS){
  const p = Object.assign({}, DEFAULT_PREFS, base);
  if (input == null) return p;
  if (typeof input !== "object") throw new ApiError(400, "invalid_notifyPrefs", "notifyPrefs must be an object.");
  if (input.before !== undefined) {
    if (!Array.isArray(input.before) || input.before.length > 6 || !input.before.every(m => REMINDER_CHOICES.includes(m))) throw new ApiError(400, "invalid_before", `before must be a list of minutes from: ${REMINDER_CHOICES.join(", ")}.`);
    p.before = [...new Set(input.before)].sort((a, b) => b - a);
  }
  ["dueToday", "overdue", "dailySummary", "highDone", "quietOn"].forEach(k => { if (input[k] !== undefined) p[k] = V.bool(input[k], k); });
  ["quietFrom", "quietTo"].forEach(k => { if (input[k] !== undefined) { if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(input[k])) throw new ApiError(400, "invalid_" + k, `${k} must look like 22:00.`); p[k] = input[k]; } });
  return p;
}

function createAuth(db, cfg){
  const loginLimit = limiter(10, 15 * 60e3), signupLimit = limiter(20, 15 * 60e3), pwLimit = limiter(10, 15 * 60e3);
  const publicUser = u => u ? { id: u.id, email: u.email, name: u.name, role: u.role, timezone: u.timezone, notifyPrefs: Object.assign({}, DEFAULT_PREFS, JSON.parse(u.notify_prefs || "{}")), createdAt: u.created_at } : null;
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
    if (db.prepare("SELECT 1 FROM users WHERE email = ?").get(email)) throw new ApiError(409, "exists", "An account with this email already exists. Log in instead.", { field: "email" });
    const salt = crypto.randomBytes(16).toString("hex"); const hash = await scrypt(password, salt);
    const first = !db.prepare("SELECT 1 FROM users LIMIT 1").get();
    const role = first || (cfg.adminEmail && cfg.adminEmail === email) ? "admin" : "user";
    const id = newId("u"); const now = Date.now();
    db.prepare("INSERT INTO users (id, email, name, pass_hash, salt, role, timezone, notify_prefs, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(id, email, name, hash, salt, role, tz, JSON.stringify(DEFAULT_PREFS), now, now);
    return { user: publicUser(db.prepare("SELECT * FROM users WHERE id = ?").get(id)), cookie: cookieFor(newSession(id)) };
  }
  async function login(b, ip){
    const email = String(b.email || "").trim().toLowerCase(); const password = typeof b.password === "string" ? b.password : "";
    if (!email) throw new ApiError(400, "email", "Please enter your email.", { field: "email" });
    if (!EMAIL_RE.test(email) || email.length > 254) throw new ApiError(400, "email", "Please enter a valid email address.", { field: "email" });
    if (!password) throw new ApiError(400, "password", "Please enter your password.", { field: "password" });
    if (!loginLimit(ip + "|" + email).ok) throw new ApiError(429, "rate_limited", "Too many tries. Wait 15 minutes and try again.");
    const u = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
    const hash = await scrypt(password.slice(0, 200), u ? u.salt : "00000000000000000000000000000000"); // same work either way
    if (!u || !crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(u.pass_hash, "hex"))) throw new ApiError(401, "wrong", "Email or password is wrong.");
    if (u.disabled) throw new ApiError(403, "disabled", "This account has been turned off. Contact the admin.");
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
    const cur = await scrypt(String(b.currentPassword || "").slice(0, 200), user.salt);
    if (!crypto.timingSafeEqual(Buffer.from(cur, "hex"), Buffer.from(user.pass_hash, "hex"))) throw new ApiError(400, "wrong_password", "Your current password is wrong.", { field: "currentPassword" });
    const next = typeof b.newPassword === "string" ? b.newPassword : "";
    if (next.length < 8 || next.length > 200) throw new ApiError(400, "password", "Use 8 to 200 characters for the new password.", { field: "newPassword" });
    const salt = crypto.randomBytes(16).toString("hex");
    db.prepare("UPDATE users SET pass_hash = ?, salt = ?, updated_at = ? WHERE id = ?").run(await scrypt(next, salt), salt, Date.now(), user.id);
    // sign out every other device
    db.prepare("DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?").run(user.id, sha(tokenOf(req) || ""));
  }
  return { signup, login, logout, userOf, publicUser, prefsOf, updateProfile, changePassword, DEFAULT_PREFS };
}
module.exports = { createAuth, DEFAULT_PREFS, cleanPrefs, newId };
