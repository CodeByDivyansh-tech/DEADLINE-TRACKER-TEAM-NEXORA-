
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
  o.innerHTML = `<div class="onb-card auth-card" id="waking" role="status"><div class="brandline">${IC.planner.replace("<svg", '<svg width="18" height="18"')} Deadline Tracker</div>
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

/* ---------- sign up / log in screen ---------- */
function showAuth(note){
  $("#app").hidden = true; const o = $("#onb"); o.hidden = false; o.classList.add("auth");
  const login = ACCOUNT.mode === "login";
  o.innerHTML = `<div class="onb-card auth-card" role="main">
    <div class="brandline">${IC.planner.replace("<svg", '<svg width="18" height="18"')} Deadline Tracker</div>
    <h1>${login ? "Welcome back." : "Create your account."}</h1>
    <p class="lead">${login ? "Log in to see your tasks and deadlines." : "Your tasks are saved to your account, so you can log in from any browser. Only you can see them."}</p>
    <div class="auth-tabs" role="tablist" aria-label="Log in or create an account">
      <button type="button" role="tab" data-act="authmode" data-v="login" aria-selected="${login}">Log in</button>
      <button type="button" role="tab" data-act="authmode" data-v="signup" aria-selected="${!login}">Create account</button>
    </div>
    <form id="authForm" class="auth-form" novalidate>
      ${login ? "" : `<div class="field"><label for="au-name">Your name</label><input type="text" id="au-name" autocomplete="name" maxlength="80" required></div>`}
      <div class="field"><label for="au-email">Email</label><input type="email" id="au-email" autocomplete="email" maxlength="200" required></div>
      <div class="field"><label for="au-pass">Password</label><input type="password" id="au-pass" autocomplete="${login ? "current-password" : "new-password"}" minlength="8" maxlength="200" required>
        ${login ? "" : `<span class="hint">At least 8 characters.</span>`}</div>
      <p class="auth-err" id="authErr" role="alert" ${note ? "" : "hidden"}>${esc(note || "")}</p>
      <button class="btn primary" type="submit" id="authGo">${login ? "Log in" : "Create account"}</button>
    </form>
    <p class="auth-foot">${IC.info}<span>Passwords are stored securely as a hash. The AI key stays on the server.</span></p>
  </div>`;
  const f = $(login ? "#au-email" : "#au-name"); if (f) f.focus();
}
async function submitAuth(){
  const login = ACCOUNT.mode === "login";
  const body = { email: $("#au-email").value, password: $("#au-pass").value, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone };
  if (!login) body.name = $("#au-name").value;
  const err = $("#authErr"), go = $("#authGo");
  go.disabled = true; err.hidden = true;
  let r;
  try { r = await apiJSON("POST", login ? "/api/auth/login" : "/api/auth/signup", body); }
  catch (e) { r = { ok: false, json: { error: "Couldn't reach the server. Is it still running?" } }; }
  go.disabled = false;
  if (!r.ok) { err.textContent = r.json.error || "Something went wrong. Try again."; err.hidden = false; const bad = { name: "#au-name", email: "#au-email", password: "#au-pass" }[r.json.code]; if (bad && $(bad)) $(bad).focus(); return; }
  location.reload();
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
  confirmModal("Bring your saved tasks into your account?", `This browser has ${n} task${n === 1 ? "" : "s"} in ${L.workspaces.length} workspace${L.workspaces.length === 1 ? "" : "s"} from before you had an account. Bring them in, or start fresh and leave them here.`, "Bring them in", () => {
    state = L; state.user = state.user || {}; state.user.name = state.user.name || (ACCOUNT.user.name || "").split(" ")[0];
    ACCOUNT.importable = null; save(); try { localStorage.removeItem(LS_V2); } catch (e) {}
    afterLoad(); toast(`Brought ${n} task${n === 1 ? "" : "s"} into your account.`);
  });
  ACCOUNT.importable = null;
}
function saveServer(){ ACCOUNT.pending = true; clearTimeout(ACCOUNT.timer); ACCOUNT.timer = setTimeout(flushServer, 500); }
async function flushServer(){
  if (Store.mode !== "server" || !state) return;
  if (ACCOUNT.saving) { ACCOUNT.dirty = true; return; }
  ACCOUNT.saving = true; ACCOUNT.pending = false;
  try {
    const r = await apiJSON("PUT", "/api/state", { state: clone(state), base: ACCOUNT.version });
    if (r.ok) ACCOUNT.version = r.json.version;
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
