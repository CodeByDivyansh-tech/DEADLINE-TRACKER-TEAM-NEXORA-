
/* =========================================================
   Accounts (when the app runs on the Deadline Tracker server)
   The server decides who you are from an HttpOnly cookie. Your data is
   loaded from and saved to your own account; nothing is shared between
   accounts. Without the server (claude.ai, a plain file server) the app
   keeps working as before, saving in this browser.
   ========================================================= */
const ACCOUNT = { on: false, user: null, version: 0, timer: null, saving: false, dirty: false, poll: null, mode: "login" };
async function checkAccounts(){
  if (!/^https?:$/.test(location.protocol)) return null;
  const local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  // On a hosted site the server may be asleep (free hosting) and need up to a minute to wake: wait for it
  // rather than quietly saving in this browser only.
  for (let k = 0; ; k++) {
    let r = null;
    try { r = await fetch("/api/me", { cache: "no-store", credentials: "same-origin" }); } catch (e) {}
    if (r && r.ok) { let j = null; try { j = await r.json(); } catch (e) {} hideWaking(); return j && j.accounts ? j : null; }
    if (r && r.status === 404) { hideWaking(); return null; }   // a plain file host: no server here
    if (local || k >= 40) { hideWaking(); if (!local && k >= 40) showWakingFailed(); return null; }
    showWaking(); await sleep(3000);
  }
}
function showWaking(){
  const o = $("#onb"); $("#app").hidden = true; o.hidden = false; o.classList.add("auth");
  if ($("#waking")) return;
  o.innerHTML = `<div class="onb-card auth-card" id="waking" role="status"><div class="brandline">${logoSVG(26)} Deadline Tracker</div>
    <h1>Starting up…</h1><p class="lead">The server is waking up. This can take up to a minute the first time; the page will continue by itself.</p><span class="typing" aria-hidden="true"><i></i><i></i><i></i></span></div>`;
}
function hideWaking(){ const w = $("#waking"); if (w) { $("#onb").innerHTML = ""; $("#onb").hidden = true; } }
function showWakingFailed(){ toast("Couldn't reach the server, so your changes are saved in this browser only. Reload the page to try again."); }
async function apiJSON(method, url, body){
  const r = await fetch(url, { method, credentials: "same-origin", cache: "no-store", headers: body === undefined ? {} : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  let j = null; try { j = await r.json(); } catch (e) {}
  if (r.status === 401 && ACCOUNT.user && url !== "/api/auth/login") signedOut();
  return { ok: r.ok, status: r.status, json: j || {} };
}
function signedOut(){
  if (ACCOUNT.signedOutShown) return; ACCOUNT.signedOutShown = true;
  ACCOUNT.user = null; clearInterval(ACCOUNT.poll); showAuth("You were signed out. Please log in again.");
}

/* ---------- welcome page: sign up / log in ---------- */
const EYE = svg('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>');
const EYE_OFF = svg('<path d="M3 3l18 18"/><path d="M10.6 6.1A10.6 10.6 0 0 1 12 6c6.4 0 10 6 10 6a17 17 0 0 1-3.2 3.9M6.5 7.6A16.7 16.7 0 0 0 2 12s3.6 7 10 7a9.8 9.8 0 0 0 4.4-1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>');
// Decorative 3D scene. The sample cards are illustrations, clearly not the visitor's data.
function hero3dHTML(){
  return `<div class="hero3d" aria-hidden="true"><div class="scene">
    <div class="glow"></div>
    <div class="float-card fc-task" style="--z:60px;--d:0s"><span class="fc-dot" style="--c:#ff8a5c"></span><div><b>Lab report</b><small>Due Friday · 5:00 PM</small></div><span class="fc-chip risk">At risk</span></div>
    <div class="float-card fc-ring" style="--z:110px;--d:-2s"><svg viewBox="0 0 44 44"><circle cx="22" cy="22" r="18" class="trk"/><circle cx="22" cy="22" r="18" class="val" style="stroke-dasharray:113;stroke-dashoffset:36"/></svg><div><b>68%</b><small>This week</small></div></div>
    <div class="float-card fc-rem" style="--z:30px;--d:-4s">${IC.bell}<div><b>Reminder</b><small>Essay draft · in 1 hour</small></div></div>
    <div class="float-card fc-todo" style="--z:85px;--d:-1s"><div class="fc-line done"><i>${IC.check}</i>Read chapter 4</div><div class="fc-line done"><i>${IC.check}</i>Outline slides</div><div class="fc-line"><i></i>Practice talk</div></div>
  </div></div>`;
}
// 3D type (shared with the pitch): each word becomes a span that flips up; [word] gets the amber accent
function words3d(t){ let w = 0; return t.split(" ").map(x => { const hi = /^\[.*\]/.test(x); const txt = x.replace(/[\[\]]/g, ""); return `<span class="w3d${hi ? " grad" : ""}" style="--w:${w++}">${esc(txt)}</span>`; }).join(" "); }
// The log-in screen has four modes: log in, create account, forgot password (ask for a link), and reset
// (set a new password from the emailed link; the token is kept in memory and removed from the address bar).
function showAuth(note, switching, ok){
  $("#app").hidden = true; const o = $("#onb"); o.hidden = false; o.classList.add("auth");
  const mode = ACCOUNT.mode, login = mode === "login", signup = mode === "signup", forgot = mode === "forgot", reset = mode === "reset";
  const keep = ACCOUNT.keepEmail || ($("#au-email") ? $("#au-email").value : ""); ACCOUNT.keepEmail = "";
  const T = { login: ["Welcome back.", "Log in to see your tasks and deadlines.", "Log in"],
    signup: ["Create your account.", "Your tasks are saved to your account, so you can log in from any browser. Only you can see them.", "Create account"],
    forgot: ["Reset your password.", "Enter the email you signed up with. We'll send you a link to set a new password.", "Send reset link"],
    reset: ["Set a new password.", "Choose a new password for your account. You'll then log in with it on every device.", "Save new password"] }[mode];
  const pw = (id, label, auto, hint) => `<div class="field"><label for="${id}">${label}</label>
        <div class="pw-wrap"><input type="password" id="${id}" autocomplete="${auto}" minlength="8" maxlength="200" required ${hint ? `aria-describedby="${id}-hint"` : ""}>
        <button type="button" class="pw-eye" id="${id}-toggle" data-act="pwtoggle" aria-controls="${id}" aria-pressed="false" aria-label="Show password">${EYE}</button></div>
        ${hint ? `<span class="hint" id="${id}-hint">${hint}</span>` : ""}</div>`;
  o.innerHTML = `<div class="auth-wrap">
  <section class="landing">
    <div class="brandline">${logoSVG(30)} <span>Deadline Tracker</span></div>
    <h1${switching ? ' class="still"' : ""}>${words3d("Never miss a [deadline] again.")}</h1>
    <p class="lead">Tell it about your work. It builds your to-do list, shows what's at risk, and reminds you before things are due.</p>
    ${hero3dHTML()}
  </section>
  <div class="onb-card auth-card" role="main">
    <h1>${T[0]}</h1>
    <p class="lead">${T[1]}</p>
    <div class="auth-tabs" role="tablist" aria-label="Log in or create an account" data-v="${mode}"><span class="auth-pill" aria-hidden="true"></span>
      <button type="button" role="tab" data-act="authmode" data-v="login" aria-selected="${login}">Log in</button>
      <button type="button" role="tab" data-act="authmode" data-v="signup" aria-selected="${signup}">Create account</button>
    </div>
    <form id="authForm" class="auth-form" novalidate>
      ${signup ? `<div class="field"><label for="au-name">Your name</label><input type="text" id="au-name" autocomplete="name" maxlength="80" required></div>` : ""}
      ${reset ? "" : `<div class="field"><label for="au-email">Email</label><input type="email" id="au-email" autocomplete="email" inputmode="email" maxlength="200" required value="${esc(keep)}"></div>`}
      ${login ? pw("au-pass", "Password", "current-password") + `<button type="button" class="linkish auth-forgot" data-act="authforgot">Forgot password?</button>` : ""}
      ${signup ? pw("au-pass", "Password", "new-password", "At least 8 characters.") : ""}
      ${reset ? pw("au-pass", "New password", "new-password", "At least 8 characters.") + pw("au-pass2", "Type it again", "new-password") : ""}
      <p class="auth-err" id="authErr" role="alert" ${note ? "" : "hidden"}>${esc(note || "")}</p>
      <p class="auth-ok" id="authOk" role="status" ${ok ? "" : "hidden"}>${esc(ok || "")}</p>
      <button class="btn primary" type="submit" id="authGo">${T[2]}</button>
      ${forgot || reset ? `<div class="auth-links">${reset ? `<button type="button" class="linkish auth-forgot" data-act="authforgot">Ask for a new link</button>` : ""}<button type="button" class="linkish auth-forgot" data-act="authmode" data-v="login">Back to log in</button></div>` : ""}
    </form>
    <p class="auth-foot">${IC.info}<span>Passwords are stored securely as a hash. The AI key stays on the server.</span></p>
  </div>
  <ul class="features">
    <li><span class="fi" style="--c:#e8a06a">${IC.spark}</span><div><b>Type it the way you'd say it</b><span>"Essay due Fri 5pm" becomes a task with its date.</span></div></li>
    <li><span class="fi" style="--c:#ff8a5c">${IC.alert}</span><div><b>See what's at risk</b><span>It checks whether the work fits before each deadline.</span></div></li>
    <li><span class="fi" style="--c:#3ecf8e">${IC.bell}</span><div><b>Reminders that arrive</b><span>Even when the app is closed, from your account.</span></div></li>
  </ul>
</div>`;
  const f = signup ? $("#au-name") : reset ? $("#au-pass") : login && keep ? $("#au-pass") : $("#au-email"); if (f) f.focus();
  heroTilt();
  if (!switching) MOTION.authIntro();
}
// A gentle tilt of the 3D scene that follows the pointer (off with reduced motion and on touch screens).
function heroTilt(){
  const sc = $(".hero3d .scene"), wrap = $(".auth-wrap");
  if (!sc || !wrap || matchMedia("(prefers-reduced-motion: reduce)").matches || !matchMedia("(hover: hover)").matches) return;
  let raf = 0;
  wrap.addEventListener("pointermove", e => {
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = 0;
      const x = e.clientX / innerWidth - .5, y = e.clientY / innerHeight - .5;
      sc.style.setProperty("--ry", (-16 + x * 10).toFixed(2) + "deg"); sc.style.setProperty("--rx", (12 - y * 8).toFixed(2) + "deg"); });
  });
}
function togglePw(btn){
  const inp = $("#" + btn.getAttribute("aria-controls")); if (!inp) return;
  const show = inp.type === "password"; inp.type = show ? "text" : "password";
  btn.setAttribute("aria-pressed", String(show)); btn.setAttribute("aria-label", show ? "Hide password" : "Show password");
  btn.innerHTML = show ? EYE_OFF : EYE; inp.focus();
}
const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function authFail(msg, field){
  const err = $("#authErr"); err.textContent = msg; err.hidden = false;
  ["#au-name", "#au-email", "#au-pass", "#au-pass2"].forEach(id => { const el = $(id); if (el) { el.removeAttribute("aria-invalid"); if (el.getAttribute("aria-errormessage")) el.removeAttribute("aria-errormessage"); } });
  const el = field && $(field); if (el) { el.setAttribute("aria-invalid", "true"); el.setAttribute("aria-errormessage", "authErr"); el.focus(); }
}
async function submitAuth(){
  const mode = ACCOUNT.mode, login = mode === "login";
  const err = $("#authErr"), okEl = $("#authOk"), go = $("#authGo");
  if (okEl) okEl.hidden = true;
  const busy = on => { go.disabled = on; go.classList.toggle("busy", on); if (on) err.hidden = true; };
  const call = async (url, body) => { busy(true); let r; try { r = await apiJSON("POST", url, body); } catch (e) { r = { ok: false, json: { error: "Couldn't reach the server. Check your connection and try again." } }; } busy(false); return r; };
  if (mode === "forgot") {
    const email = $("#au-email").value.trim();
    if (!email) return authFail("Please enter your email.", "#au-email");
    if (!EMAIL_OK.test(email)) return authFail("Please enter a valid email address, like name@example.com.", "#au-email");
    const r = await call("/api/auth/forgot", { email });
    if (!r.ok) return authFail(r.json.error || "Something went wrong. Try again.", r.json.field === "email" ? "#au-email" : null);
    okEl.textContent = r.json.message || "If an account uses this email, we've sent it a reset link."; okEl.hidden = false; return;
  }
  if (mode === "reset") {
    const p1 = $("#au-pass").value, p2 = $("#au-pass2").value;
    if (p1.length < 8) return authFail("Use at least 8 characters for your password.", "#au-pass");
    if (p1 !== p2) return authFail("The two passwords don't match.", "#au-pass2");
    const r = await call("/api/auth/reset", { token: ACCOUNT.resetToken || "", password: p1 });
    if (!r.ok) return authFail(r.json.error || "Something went wrong. Try again.", r.json.field === "password" ? "#au-pass" : null);
    ACCOUNT.resetToken = null; ACCOUNT.mode = "login"; ACCOUNT.keepEmail = r.json.email || "";
    return showAuth(null, true, "Password changed. Log in with your new password.");
  }
  const name = login ? "" : $("#au-name").value.trim(), email = $("#au-email").value.trim(), password = $("#au-pass").value;
  // checks before sending (the server checks again)
  if (!login && !name) return authFail("Please enter your name.", "#au-name");
  if (!email) return authFail("Please enter your email.", "#au-email");
  if (!EMAIL_OK.test(email)) return authFail("Please enter a valid email address, like name@example.com.", "#au-email");
  if (!password) return authFail("Please enter your password.", "#au-pass");
  if (!login && password.length < 8) return authFail("Use at least 8 characters for your password.", "#au-pass");
  const body = { email, password, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone };
  if (!login) body.name = name;
  const r = await call(login ? "/api/auth/login" : "/api/auth/signup", body);
  if (!r.ok) {
    const code = r.json.code, field = { name: "#au-name", email: "#au-email", exists: "#au-email", password: "#au-pass", wrong: "#au-pass" }[r.json.field || code] || (code === "wrong" ? "#au-pass" : null);
    if (code === "wrong") $("#au-pass").value = "";
    return authFail(r.json.error || "Something went wrong. Try again.", field);
  }
  location.reload();
}
// A reset link opens the site at #reset=<token>. Keep the token in memory only and clear it from the address bar
// (so it isn't left in history or shown on screen).
function takeResetToken(){
  const m = /^#reset=([A-Za-z0-9_-]{20,100})/.exec(location.hash || "");
  if (!m) return false;
  ACCOUNT.resetToken = m[1]; ACCOUNT.mode = "reset";
  try { history.replaceState(null, "", location.pathname + location.search); } catch (e) { try { location.hash = ""; } catch (x) {} }
  return true;
}
async function changePassword(){
  const cur = $("#pw-cur").value, next = $("#pw-new").value, err = $("#pwErr"), go = $("#pwSave");
  const fail = (m, f) => { err.textContent = m; err.hidden = false; ["#pw-cur", "#pw-new"].forEach(x => $(x).removeAttribute("aria-invalid")); if (f) { $(f).setAttribute("aria-invalid", "true"); $(f).focus(); } };
  if (!cur) return fail("Please enter your current password.", "#pw-cur");
  if (next.length < 8) return fail("Use at least 8 characters for the new password.", "#pw-new");
  if (next === cur) return fail("The new password is the same as the current one.", "#pw-new");
  go.disabled = true; err.hidden = true;
  let r; try { r = await apiJSON("POST", "/api/profile/password", { currentPassword: cur, newPassword: next }); } catch (e) { r = { ok: false, json: { error: "Couldn't reach the server. Try again." } }; }
  go.disabled = false;
  if (!r.ok) return fail(r.json.error || "Couldn't change the password.", r.json.field === "currentPassword" ? "#pw-cur" : r.json.field === "newPassword" ? "#pw-new" : null);
  UI.pwOpen = false; render(); toast("Password changed. Other devices were signed out.");
}
async function logout(){
  // send any change that's still waiting to be saved before the session ends
  if (Store.mode === "server" && (ACCOUNT.pending || ACCOUNT.dirty || ACCOUNT.saving)) {
    clearTimeout(ACCOUNT.timer);
    for (let k = 0; k < 40 && ACCOUNT.saving; k++) await sleep(50);
    if (ACCOUNT.pending || ACCOUNT.dirty) { ACCOUNT.dirty = false; await flushServer(); }
  }
  await apiJSON("POST", "/api/auth/logout").catch(() => {});
  try { localStorage.removeItem(LS_V2); } catch (e) {}
  location.reload();
}

/* ---------- loading and saving your data ---------- */
async function initServerStore(){
  Store.mode = "server";
  const r = await apiJSON("GET", "/api/state");
  ACCOUNT.version = r.json.version || 0;
  state = r.json.state || null;
  // Used the app in this browser before having an account? Offer to bring that data in (once).
  const local = lsGet(LS_V2);
  if (!state && local && local.workspaces && local.workspaces.length) ACCOUNT.importable = local;
  if (!state) ONB.name = ONB.name || (ACCOUNT.user.name || "").split(" ")[0];
  ACCOUNT.poll = setInterval(pullServer, 20000);
  // keep the account's time zone in step with this device, so reminders arrive at the right local time
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (tz && ACCOUNT.user.timezone !== tz) apiJSON("PATCH", "/api/profile", { timezone: tz }).then(r => { if (r.ok) ACCOUNT.user = r.json.user; }).catch(() => {});
  pullNotifications(true); setInterval(pullNotifications, 30000);
  // a change made just before closing the tab is still sent
  window.addEventListener("pagehide", () => { if (ACCOUNT.pending && state) { try { fetch("/api/state", { method: "PUT", keepalive: true, credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ state, base: ACCOUNT.version }) }); } catch (e) {} } });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) pullServer(); });
}
function offerImport(){
  const L = ACCOUNT.importable; if (!L) return;
  const n = L.workspaces.reduce((a, w) => a + (w.items || []).length, 0);
  confirmModal("Bring your saved tasks into your account?", `This browser has ${n} task${n === 1 ? "" : "s"} in ${L.workspaces.length} workspace${L.workspaces.length === 1 ? "" : "s"} from before you had an account. Bring them in, or start fresh and leave them here.`, "Bring them in", async () => {
    state = fixImportIds(L); state.user = state.user || {}; state.user.name = state.user.name || (ACCOUNT.user.name || "").split(" ")[0];
    ACCOUNT.importable = null; ACCOUNT.importN = n; afterLoad();
    // The browser's copy is removed only after the account has really saved it (see flushServer). Before, it was
    // removed first, so a refused or failed save lost these tasks from both places.
    save(); await flushNow();
    if (ACCOUNT.importN) toast(`Your ${n} task${n === 1 ? "" : "s"} couldn't be saved to your account yet. They're still in this browser too, and the app keeps trying.`);
  });
  ACCOUNT.importable = null;
}
// Older saves can have short or repeated task ids that the server doesn't accept: give those new ids (and update
// "depends on" links) so everything can be saved.
function fixImportIds(L){
  const seen = new Set(), map = {};
  L.workspaces.forEach(w => (w.items || []).forEach(it => { if (typeof it.id !== "string" || !/^[\w.-]{3,64}$/.test(it.id) || seen.has(it.id)) { const old = it.id; it.id = rid("d-"); if (old != null) map[old] = it.id; } seen.add(it.id); }));
  if (Object.keys(map).length) L.workspaces.forEach(w => (w.items || []).forEach(it => { if (Array.isArray(it.dependsOn)) it.dependsOn = it.dependsOn.map(d => map[d] || d); }));
  return L;
}
function importSaved(){
  if (!ACCOUNT.importN) return;
  const n = ACCOUNT.importN; ACCOUNT.importN = 0;
  try { localStorage.removeItem(LS_V2); } catch (e) {}
  toast(`Brought ${n} task${n === 1 ? "" : "s"} into your account.`);
}
function saveServer(){ ACCOUNT.pending = true; clearTimeout(ACCOUNT.timer); ACCOUNT.timer = setTimeout(flushServer, 500); }
async function flushServer(){
  if (Store.mode !== "server" || !state) return;
  if (ACCOUNT.saving) { ACCOUNT.dirty = true; return; }
  ACCOUNT.saving = true; ACCOUNT.pending = false;
  try {
    const r = await apiJSON("PUT", "/api/state", { state: clone(state), base: ACCOUNT.version });
    if (r.ok) { ACCOUNT.version = r.json.version; importSaved(); if (UI.acctStats) { UI.acctStats.stale = true; if (UI.route === "reports") render({ soft: true }); } }
    else if (r.status === 409) {
      // Changed on another device since we loaded: show the newest copy rather than overwrite it.
      ACCOUNT.version = r.json.version; if (r.json.state) { state = r.json.state; afterLoad(); }
      toast("Your tasks were changed on another device, so this page now shows the latest version. Please check your last change.");
      ACCOUNT.dirty = false;
    } else if (r.status !== 401 && !ACCOUNT.warned) { ACCOUNT.warned = true; toast(r.json.error || "Couldn't save to your account. Your change will be retried."); ACCOUNT.dirty = true; }
  } catch (e) { if (!ACCOUNT.warned) { ACCOUNT.warned = true; toast("Couldn't reach the server, so your last change isn't saved yet. Keep this tab open; it will retry."); } ACCOUNT.dirty = true; }
  ACCOUNT.saving = false;
  if (ACCOUNT.dirty) { ACCOUNT.dirty = false; setTimeout(flushServer, 3000); }
}
async function pullServer(){
  if (Store.mode !== "server" || ACCOUNT.saving || ACCOUNT.pending || ACCOUNT.dirty) return;
  try {
    const r = await apiJSON("GET", "/api/state");
    if (r.ok && r.json.version > ACCOUNT.version && !ACCOUNT.saving) {
      ACCOUNT.version = r.json.version;
      if (r.json.state) { state = r.json.state; afterLoad(); }
    }
  } catch (e) {}
}

async function flushNow(){
  if (Store.mode !== "server") return;
  clearTimeout(ACCOUNT.timer);
  for (let k = 0; k < 60 && ACCOUNT.saving; k++) await sleep(50);
  if (ACCOUNT.pending || ACCOUNT.dirty) { ACCOUNT.dirty = false; await flushServer(); }
}
async function reloadFromServer(){
  const r = await apiJSON("GET", "/api/state");
  if (r.ok) { ACCOUNT.version = r.json.version || 0; if (r.json.state) { state = r.json.state; afterLoad(); pullNotifications(true); } }
}
// Workspace reminder settings -> the account's notification preferences used by the server's reminder job.
const PREF_CHOICES = [10080, 4320, 2880, 1440, 180, 60, 30, 15, 0];
function syncPrefs(){
  if (Store.mode !== "server") return;
  clearTimeout(ACCOUNT.prefTimer);
  ACCOUNT.prefTimer = setTimeout(() => {
    const s = W().settings;
    const before = [...new Set(s.reminders.concat(s.customReminder ? [s.customReminder] : []))].filter(m => PREF_CHOICES.includes(m)).slice(0, 6);
    apiJSON("PATCH", "/api/profile", { notifyPrefs: { before, overdue: !!s.overdueAlerts, dailySummary: s.dailySummary !== false, dueToday: s.dueToday !== false, highDone: s.highDone !== false, quietOn: !!s.quietOn, quietFrom: s.quietFrom, quietTo: s.quietTo } })
      .then(r => { if (r.ok) ACCOUNT.user = r.json.user; else toast(r.json.error || "Couldn't save your reminder settings."); }).catch(() => {});
  }, 400);
}
// Notifications come from the server's reminder job (they're created even while the app is closed).
async function pullNotifications(first){
  if (Store.mode !== "server" || !state) return;
  let r; try { r = await apiJSON("GET", "/api/notifications?limit=80"); } catch (e) { return; }
  if (!r.ok) return;
  const known = new Set((state.inbox || []).map(n => n.key));
  state.inbox = r.json.notifications.map(n => { const it = n.taskId && findItemAny(n.taskId);
    return { key: n.id, server: true, ws: it ? it.ws : null, for: null, itemId: n.taskId, kind: n.kind, text: n.message, t: n.deliveredAt || n.scheduledAt, read: n.read, dismissed: false }; });
  if (!first) state.inbox.filter(n => !known.has(n.key) && !n.read && Date.now() - Date.parse(n.t) < 10 * 60000).forEach(n => announce(n, Date.parse(n.t)));
  renderBell();
}
function findItemAny(id){ for (const w of state.workspaces) { if (w.items.some(i => i.id === id)) return { ws: w.id }; } return null; }
function markRead(ids){ if (Store.mode === "server") apiJSON("POST", "/api/notifications/read", ids === "all" ? { all: true } : { ids }).catch(() => {}); }
function dismissNotif(id){ if (Store.mode === "server") apiJSON("DELETE", "/api/notifications/" + encodeURIComponent(id)).catch(() => {}); }
