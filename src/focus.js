/* =========================================================
   Deep Focus: study sessions with Normal and Strict modes
   ========================================================= */
// The timing rules are in FocusCore (src/focus-core.js, also used by the server). With an account the server keeps
// the sessions (/api/focus); without a server they are kept in this browser with the same rules.
// A website can't lock a device: Strict Focus makes leaving visible (fullscreen, pausing whenever the page is left,
// a manual Resume) and keeps the time honest. It never claims to block other tabs or apps.
// Styles for the setup card, the focus room and the statistics. Added by the script (like the voice styles) so the
// page itself stays small (tests keep index.html under 160 KB).
const FOCUS_CSS = `.fz-setup .fz-form{display:grid;gap:14px;margin-bottom:14px}
.fz-f{display:grid;gap:6px;min-width:0}
.fz-f > span{font-size:13px;font-weight:600;color:var(--ink-2)}
.fz-f em{font-style:normal;font-weight:450;color:var(--muted)}
.fz-f select,.fz-f input{width:100%;max-width:520px}
.fz-f .seg{flex-wrap:wrap;max-width:100%}
.fz-mins{display:inline-flex;align-items:center;gap:8px;font-size:13px;color:var(--muted);margin-top:6px}
.fz-mins input{width:90px}
.fz-modes{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;max-width:640px}
.fz-modes button{display:grid;gap:4px;text-align:left;padding:12px 14px;border-radius:14px;border:1px solid var(--line);background:var(--surface);color:var(--ink);font:inherit;cursor:pointer;transition:border-color .15s,box-shadow .15s}
.fz-modes button b{font-size:14px}
.fz-modes button span{font-size:12.5px;line-height:1.4;color:var(--muted)}
.fz-modes button[aria-checked="true"]{border-color:var(--steel-ink);box-shadow:0 0 0 1px var(--steel-ink) inset}
.fz-msg{display:flex;gap:6px;align-items:flex-start;font-size:13px;color:var(--risk);margin:0 0 12px}
.fz-msg svg{width:15px;height:15px;flex:none;margin-top:2px}
.btn.lg{min-height:44px;padding:10px 20px;font-size:15px}

.fz-room{position:fixed;inset:0;z-index:95;background:var(--bg);color:var(--ink);overflow-y:auto;overscroll-behavior:contain;display:flex;align-items:center;justify-content:center;padding:max(16px,env(safe-area-inset-top)) 16px max(16px,env(safe-area-inset-bottom));animation:fzIn .32s ease both}
.fz-room[hidden]{display:none}
@keyframes fzIn{from{opacity:0}to{opacity:1}}
body.in-focus{overflow:hidden}
body.in-focus #dwBtn,body.in-focus #focusMini{visibility:hidden}
.fz-stage{width:100%;max-width:760px;min-height:100%;display:flex;flex-direction:column}
.fz-top{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:4px 0 8px}
.fz-mode{font-size:12px;font-weight:650;letter-spacing:.06em;text-transform:uppercase;color:var(--steel-ink)}
.fz-state{display:inline-flex;align-items:center;gap:7px;font-size:13px;font-weight:600;padding:5px 11px;border-radius:var(--pill);background:var(--surface-2)}
.fz-state i{width:8px;height:8px;border-radius:50%;background:var(--muted)}
.fz-state.st-active i{background:var(--ok);animation:fzPulse 2s ease-in-out infinite}
.fz-state.st-paused i{background:var(--att)}
.fz-state.st-interrupted i{background:var(--risk)}
@keyframes fzPulse{50%{opacity:.35}}
.fz-top-r{margin-left:auto;display:flex;gap:6px}
.fz-center{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:10px;padding:8px 0 24px}
.fz-subject{margin:0;font-size:12.5px;font-weight:650;letter-spacing:.12em;text-transform:uppercase;color:var(--steel-ink)}
.fz-task{margin:0;font-family:var(--font-display);font-size:clamp(22px,4.2vw,34px);line-height:1.15;font-weight:600;letter-spacing:-.01em;max-width:22ch;overflow-wrap:anywhere}
.fz-topic{margin:0;color:var(--muted);font-size:15px}
.fz-ring{position:relative;width:clamp(220px,38vh,320px);aspect-ratio:1;margin:14px 0 6px}
.fz-ring.sm{width:clamp(180px,30vh,240px)}
.fz-ring-svg{width:100%;height:100%;transform:rotate(-90deg)}
.fz-ring-svg circle{fill:none;stroke-width:9}
.fz-ring-svg .trk{stroke:var(--line)}
.fz-ring-svg .prg{stroke:var(--steel-ink);stroke-linecap:round;transition:stroke-dashoffset .35s linear}
.fz-room.strict .fz-ring-svg .prg{stroke:var(--ink)}
.fz-time{position:absolute;inset:0;display:grid;place-content:center;gap:4px}
.fz-time b{font-family:var(--font-mono);font-size:clamp(48px,10vh,76px);font-weight:500;letter-spacing:-.03em;font-variant-numeric:tabular-nums;line-height:1}
.fz-ring.sm .fz-time b{font-size:clamp(38px,7vh,52px)}
.fz-time span{font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
.fz-facts{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:4px 22px;margin:0;width:min(100%,520px)}
.fz-facts div{display:grid;gap:2px}
.fz-facts dt{font-size:11.5px;color:var(--muted)}
.fz-facts dd{margin:0;font-weight:600;font-size:15px;font-variant-numeric:tabular-nums}
.fz-progress{width:min(100%,520px);height:4px;border-radius:4px;background:var(--line);overflow:hidden;margin:6px 0}
.fz-progress span{display:block;height:100%;background:var(--steel-ink);transition:width .35s linear}
.fz-controls{display:flex;gap:10px;flex-wrap:wrap;justify-content:center;margin-top:8px}
.fz-controls .btn svg{width:16px;height:16px}
.fz-note{display:flex;gap:8px;align-items:center;max-width:520px;margin:4px 0 0;padding:8px 10px 8px 12px;border-radius:12px;background:var(--surface-2);font-size:13px;text-align:left}
.fz-note svg{width:15px;height:15px;flex:none;color:var(--steel-ink)}
.fz-note .ib{margin-left:auto}
.fz-confirm{margin-top:8px;padding:12px 14px;border-radius:14px;border:1px solid var(--line);background:var(--surface);box-shadow:var(--shadow);max-width:420px;text-align:left}
.fz-confirm p{margin:0 0 10px;font-size:14px}
.fz-panel{width:min(100%,560px);background:var(--surface);border:1px solid var(--line);border-radius:22px;box-shadow:var(--shadow-lg);padding:clamp(20px,4vw,32px);display:flex;flex-direction:column;gap:14px;animation:fzRise .38s cubic-bezier(.2,.8,.2,1) both}
@keyframes fzRise{from{opacity:0;transform:translateY(10px) scale(.985)}to{opacity:1;transform:none}}
.fz-panel h2{margin:0;font-family:var(--font-display);font-size:clamp(21px,3.6vw,27px);line-height:1.2;font-weight:600;letter-spacing:-.01em}
.fz-eyebrow{margin:0;font-size:12px;font-weight:650;letter-spacing:.08em;text-transform:uppercase;color:var(--steel-ink)}
.fz-lead{margin:0;color:var(--ink-2);font-size:15px;line-height:1.5}
.fz-what{margin:0;font-weight:600;font-size:15px}
.fz-rules{margin:0;padding-left:20px;display:grid;gap:6px;font-size:14.5px;line-height:1.45;color:var(--ink-2)}
.fz-honest{display:flex;gap:8px;align-items:flex-start;margin:0;font-size:13px;line-height:1.45;color:var(--muted)}
.fz-honest svg{width:15px;height:15px;flex:none;margin-top:2px}
.fz-actions{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.fz-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px 18px;margin:0}
.fz-grid div{display:grid;gap:3px;min-width:0}
.fz-grid .wide{grid-column:1 / -1}
.fz-grid dt{font-size:12px;color:var(--muted)}
.fz-grid dd{margin:0;font-size:16px;font-weight:600;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
.fz-grid dd small{display:block;font-size:12.5px;font-weight:450;color:var(--muted)}
.fz-away-mark,.fz-done-mark{width:52px;height:52px;border-radius:50%;display:grid;place-items:center;background:var(--surface-2);color:var(--risk)}
.fz-away-mark svg,.fz-done-mark svg{width:24px;height:24px}
.fz-done-mark{background:var(--ok);color:#fff;animation:fzPop .5s cubic-bezier(.2,1.4,.4,1) both}
.fz-done-mark.early{background:var(--surface-2);color:var(--muted)}
@keyframes fzPop{from{transform:scale(.4);opacity:0}to{transform:none;opacity:1}}
.fz-break{align-items:center;text-align:center}
.fz-break .fz-actions{justify-content:center}
@media (prefers-reduced-motion:reduce){.fz-room,.fz-panel,.fz-done-mark,.fz-state.st-active i{animation:none}.fz-ring-svg .prg,.fz-progress span{transition:none}}
@media (max-width:600px){
  .fz-modes{grid-template-columns:1fr}
  .fz-facts{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 18px}
  .fz-controls .btn{flex:1 1 auto}
  .fz-panel{border-radius:18px}
}

.fz-kpis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;margin-bottom:16px}
.fz-kpis div{display:grid;gap:2px;padding:12px;border-radius:14px;background:var(--surface-2);min-width:0}
.fz-kpis span{font-size:12px;color:var(--muted)}
.fz-kpis b{font-size:20px;font-weight:650;font-variant-numeric:tabular-nums;letter-spacing:-.01em}
.fz-kpis small{font-size:11.5px;color:var(--muted);line-height:1.3}
.fz-chart{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:8px;align-items:end;height:150px}
.fz-day{display:grid;grid-template-rows:1fr auto auto;gap:3px;height:100%;text-align:center;min-width:0}
.fz-col{position:relative;border-bottom:1px solid var(--line);overflow:hidden}
.fz-col span{position:absolute;left:0;right:0;bottom:0;border-radius:8px 8px 0 0}
.fz-col .pl{background:var(--steel-soft)}
.fz-col .fo{left:22%;right:22%;background:var(--steel-ink);transition:height .4s ease}
.fz-day.today .fz-col .fo{background:var(--ink)}
.fz-day b{font-size:11.5px;font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap}
.fz-day small{font-size:11px;color:var(--muted)}
.fz-legend{display:flex;gap:14px;font-size:12px;color:var(--muted);margin:8px 0 4px}
.fz-legend i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:5px;vertical-align:-1px}
.fz-legend .fo{background:var(--steel-ink)}.fz-legend .pl{background:var(--steel-soft)}
.fz-h4{margin:16px 0 8px;font-size:13px;font-weight:650}
.fz-subs{display:grid;gap:8px}
.fz-sub{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(60px,2fr) auto auto;gap:10px;align-items:center;font-size:13px}
.fz-sub .nm{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:550}
.fz-sub .bar-track span{display:block;height:100%;background:var(--steel-ink);border-radius:4px}
.fz-sub .v{font-weight:600;font-variant-numeric:tabular-nums}
.fz-recent{list-style:none;margin:0 0 10px;padding:0;display:grid;gap:2px}
.fz-recent li{display:grid;grid-template-columns:auto minmax(0,1fr) auto auto auto;gap:10px;align-items:center;font-size:13px;padding:7px 0;border-bottom:1px solid var(--line)}
.fz-recent li:last-child{border-bottom:0}
.fz-recent .tt{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:550}
.fz-recent .tt small{margin-left:6px;font-weight:450;color:var(--muted)}
.fz-dot{width:8px;height:8px;border-radius:50%}.fz-dot.ok{background:var(--ok)}.fz-dot.early{background:var(--muted)}
@media (max-width:900px){.fz-kpis{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media (max-width:600px){
  .fz-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}
  .fz-chart{gap:4px;height:130px}
  .fz-day b{font-size:10.5px}
  .fz-sub{grid-template-columns:minmax(0,1fr) auto;row-gap:4px}
  .fz-sub .bar-track{grid-column:1 / -1;order:3}
  .fz-sub .muted{display:none}
  .fz-recent li{grid-template-columns:auto minmax(0,1fr) auto;row-gap:2px}
  .fz-recent li > span:nth-child(3),.fz-recent li > span:nth-child(5){display:none}
}
/* the minimised Normal session (replaces the old focus timer's colours) */
/* sits above the Deadline AI button (it used to be underneath it, so its buttons couldn't be pressed) */
.focus-mini{background:var(--surface);color:var(--ink);border:1px solid var(--line);right:22px;bottom:88px}
@media (max-width:900px){.focus-mini{right:16px;bottom:196px}}
.focus-mini .n{color:var(--muted)}
.focus-mini button{background:var(--surface-2);color:var(--ink)}
.focus-mini .mr svg{width:34px;height:34px;transform:rotate(-90deg)}
.focus-mini .trk{fill:none;stroke:var(--line);stroke-width:4}
.focus-mini .prg{fill:none;stroke:var(--steel-ink);stroke-width:4;stroke-linecap:round}`;
(function(){ const st = document.createElement("style"); st.id = "fzCss"; st.textContent = FOCUS_CSS; document.head.appendChild(st); })();
const FC = FocusCore;
const FOCUS = {
  s: null,              // the open session, or the finished one whose report is on screen
  view: "",             // "" (closed or minimised), "commit", "room", "away", "done", "break"
  setup: { taskId: "", minutes: 45, custom: false, mode: "normal", topic: "", title: "" },   // NOT_STARTED: the setup card
  offset: 0,            // server clock minus this device's clock
  owner: false,         // this tab runs the session (only it reports leaving)
  busy: false, msg: "", note: "", confirmEnd: false, completing: false, unloading: false,
  q: Promise.resolve(), stats: null, statsAt: 0, history: null, breakEnd: 0, breakLen: 5, blurTimer: 0, lastDone: null
};
const fnow = () => Date.now() + FOCUS.offset;
const fsSupported = () => !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
const inFullscreen = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
function enterFullscreen(){
  const el = document.documentElement; const f = el.requestFullscreen || el.webkitRequestFullscreen;
  if (!f || !fsSupported()) return Promise.resolve(false);
  try { const p = f.call(el, { navigationUI: "hide" }); return p && p.then ? p.then(() => true, () => false) : Promise.resolve(inFullscreen()); } catch (e) { return Promise.resolve(false); }
}
function exitFullscreen(){ try { if (inFullscreen()) (document.exitFullscreen || document.webkitExitFullscreen).call(document); } catch (e) {} }

/* ---------- formatting ---------- */
function fClock(ms){ const t = Math.max(0, Math.ceil(ms / 1000)); const h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), s = t % 60; return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`; }
function fDur(ms){ const m = Math.round(ms / MIN); if (ms > 0 && ms < MIN) return `${Math.max(1, Math.round(ms / 1000))} s`; if (m < 60) return `${m} min`; const h = Math.floor(m / 60), r = m % 60; return r ? `${h} h ${r} min` : `${h} h`; }
const fMin = m => fDur(m * MIN);
const fAt = ms => new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const KIND_WORD = { tab: "Left the page (another tab or app)", fullscreen: "Left fullscreen", window: "Switched to another window", reload: "Reloaded the page", closed: "Closed the page or lost connection" };

/* ---------- storage: the server with an account, this browser without one ---------- */
const FLOCAL = "dt-focus-v1", FTASKS = "dt-focus-tasks";
const lread = () => { try { const d = JSON.parse(localStorage.getItem(FLOCAL)); return d && Array.isArray(d.sessions) ? d : { sessions: [] }; } catch (e) { return { sessions: [] }; } };
const lwrite = d => { try { d.sessions = d.sessions.slice(-500); localStorage.setItem(FLOCAL, JSON.stringify(d)); } catch (e) {} };
// which to-do item each session was started from (the minutes are logged on it when the report is shown)
const taskMap = () => { try { return JSON.parse(localStorage.getItem(FTASKS)) || {}; } catch (e) { return {}; } };
function rememberTask(sid, itemId){ if (!itemId) return; const m = taskMap(); m[sid] = itemId; const k = Object.keys(m); if (k.length > 200) delete m[k[0]]; try { localStorage.setItem(FTASKS, JSON.stringify(m)); } catch (e) {} }
const withReport = s => Object.assign({}, s, { report: FC.report(s, fnow()) });
async function fpost(url, body, keepalive){
  const r = await fetch(url, { method: "POST", credentials: "same-origin", cache: "no-store", keepalive: !!keepalive, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });
  let j = null; try { j = await r.json(); } catch (e) {}
  if (r.status === 401 && ACCOUNT.user) signedOut();
  return { ok: r.ok, status: r.status, json: j || {} };
}
const clockFrom = j => { if (j && typeof j.serverNow === "number") FOCUS.offset = j.serverNow - Date.now(); };
const FStore = {
  server: () => !!ACCOUNT.on,
  async current(){
    if (this.server()) { const r = await apiJSON("GET", "/api/focus"); if (!r.ok) throw new Error("load"); clockFrom(r.json); return r.json; }
    const d = lread(); const t = Date.now(); let open = null, unseen = null;
    d.sessions = d.sessions.map(s => FC.settle(s, t));
    for (const s of d.sessions) { if (FC.isOpen(s)) open = s; else if (!s.ackedAt && s.endReason !== "expired" && s.endedAt > t - 2 * DAY && (!unseen || s.endedAt > unseen.endedAt)) unseen = s; }
    lwrite(d); return { session: open && withReport(open), unseen: unseen && withReport(unseen) };
  },
  async start(b){
    if (this.server()) { const r = await apiJSON("POST", "/api/focus/sessions", b); clockFrom(r.json); return r; }
    const d = lread(); const t = Date.now(); d.sessions = d.sessions.map(s => FC.settle(s, t));
    const open = d.sessions.find(FC.isOpen);
    if (open) return { ok: false, status: 409, json: { code: "session_open", session: withReport(open) } };
    try { const s = FC.create(Object.assign({}, b, { id: "f" + t.toString(36) + Math.random().toString(36).slice(2, 7), now: t })); d.sessions.push(s); lwrite(d); return { ok: true, status: 201, json: { session: withReport(s) } }; }
    catch (e) { return { ok: false, status: 400, json: { error: e.message } }; }
  },
  async act(id, action, body, keepalive){
    if (this.server()) {
      let last;
      for (let k = 0; k < 3; k++) {
        try { const r = await fpost(`/api/focus/sessions/${encodeURIComponent(id)}/${action}`, body, keepalive); clockFrom(r.json); return r; }
        catch (e) { last = e; if (keepalive) break; await new Promise(res => setTimeout(res, 1000 * (k * 2 + 1))); }
      }
      return { ok: false, status: 0, json: { error: "offline" }, offline: !!last };
    }
    const d = lread(); const t = Date.now(); const i = d.sessions.findIndex(s => s.id === id);
    if (i < 0) return { ok: false, status: 404, json: {} };
    let s = FC.settle(d.sessions[i], t);
    if (action === "ack") { if (!FC.isFinished(s)) return { ok: false, status: 409, json: { code: "not_finished" } }; const first = !s.ackedAt; s.ackedAt = s.ackedAt || t; d.sessions[i] = s; lwrite(d); return { ok: true, status: 200, json: { session: withReport(s), first } }; }
    try {
      if (!(FC.isFinished(s) && (action === "beat" || (action === "complete" && s.status === FC.COMPLETED)))) s = FC.apply(s, action, { now: action === "beat" ? t : FC.clampTime(s, body && body.at, t), kind: body && body.kind });
    } catch (e) { d.sessions[i] = s; lwrite(d); return { ok: false, status: e.code === "bad_kind" ? 400 : 409, json: { code: e.code, session: withReport(s) } }; }
    d.sessions[i] = s; lwrite(d); return { ok: true, status: 200, json: { session: withReport(s) } };
  },
  async stats(days){
    if (this.server()) { const r = await apiJSON("GET", "/api/focus/stats?days=" + days); return r.ok ? r.json : null; }
    const t = Date.now(); return FC.stats(lread().sessions.map(s => FC.settle(s, t)), { now: t, tz: undefined, days });
  },
  async history(){
    if (this.server()) { const r = await apiJSON("GET", "/api/focus/sessions?limit=6"); return r.ok ? r.json.sessions : []; }
    const t = Date.now(); return lread().sessions.map(s => FC.settle(s, t)).filter(FC.isFinished).sort((a, b) => b.startedAt - a.startedAt).slice(0, 6).map(withReport);
  }
};

/* ---------- state changes ---------- */
// Takes the stored session as the truth (the server's, or this browser's).
function adopt(s){
  if (!s) return;
  const was = FOCUS.s; FOCUS.s = s;
  if (FC.isFinished(s) && (!was || !FC.isFinished(was) || was.id !== s.id)) return showDone(s, s.status === "COMPLETED" && !!was && was.id === s.id);
  if (s.status === "INTERRUPTED" && FOCUS.view === "room" && s.mode === "strict" && document.visibilityState === "visible") FOCUS.view = "away";
  paintFocus();
}
// One action: shown at once (the same rules run here), then saved; saved answers win.
function fact(action, extra = {}, keepalive = false){
  const s = FOCUS.s; if (!s || FC.isFinished(s)) return Promise.resolve();
  const at = fnow();
  try { FOCUS.s = FC.apply(s, action, Object.assign({ now: at }, extra)); }
  catch (e) { if (e.code === "not_finished") return Promise.resolve(); }
  const id = s.id;
  // saved in order: this change is queued before anything the report screen sends (the "seen" mark)
  FOCUS.q = FOCUS.q.then(() => FStore.act(id, action, Object.assign({ at }, extra), keepalive)).then(r => {
    if (!r) return;
    if (r.offline) { FOCUS.note = "Couldn't reach the server. Your session is safe up to the last saved change; it will be checked again when you're back online."; paintFocus(); return; }
    if (r.json && r.json.session && FOCUS.s && FOCUS.s.id === id) adopt(stripReport(r.json.session));
  }).catch(() => {});
  const p = FOCUS.q;
  if (FC.isFinished(FOCUS.s) && action !== "beat") showDone(FOCUS.s, true); else paintFocus();
  return p;
}
const stripReport = s => { const c = Object.assign({}, s); delete c.report; return c; };

async function focusBoot(){
  if (!state || !state.workspaces || !state.workspaces.length) return;
  let cur; try { cur = await FStore.current(); } catch (e) { return; }
  if (cur.session) {
    FOCUS.s = stripReport(cur.session); FOCUS.owner = true;
    const s = FOCUS.s;
    // reopened during a Strict session: fullscreen is gone, so the session waits for Resume
    if (s.status === "ACTIVE" && s.mode === "strict" && fsSupported() && !inFullscreen()) fact("interrupt", { kind: "reload" });
    FOCUS.view = FOCUS.s.status === "INTERRUPTED" && FOCUS.s.mode === "strict" ? "away" : "room";
    if (FOCUS.s.status === "INTERRUPTED" && FOCUS.s.mode === "normal") welcomeBack();
    paintFocus();
  } else if (cur.unseen) showDone(stripReport(cur.unseen));
  else if (FOCUS.view && !FOCUS.s) { FOCUS.view = ""; paintFocus(); }
}
// Normal Focus: back on the page, the timer carries on by itself, with a short note
function welcomeBack(){
  const s = FOCUS.s; if (!s || s.status !== "INTERRUPTED") return;
  const b = s.breaks[s.breaks.length - 1]; const away = b ? fnow() - b.from : 0;
  FOCUS.note = `Welcome back. The timer was paused while you were away (${fDur(away)}).`;
  fact("resume");
}
async function startSession(){
  if (FOCUS.busy) return;
  const st = FOCUS.setup; const w = W();
  const it = st.taskId && st.taskId !== "other" ? findItem(st.taskId, w) : null;
  const g = it ? groupOf(w, it.groupId) : null;
  const title = it ? it.title : (st.title || "").trim();
  if (!title) { FOCUS.msg = "Choose a task or type what you'll work on."; FOCUS.view = ""; paintFocus(); render(); return false; }
  FOCUS.busy = true; FOCUS.msg = "";
  const body = { minutes: st.minutes, mode: st.mode, title, subject: g ? g.name : "", topic: st.topic || "", taskId: it ? it.id : undefined, clientKey: "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8) };
  let r; try { r = await FStore.start(body); } catch (e) { r = { ok: false, status: 0, json: { error: "Couldn't reach the server. Check your connection and try again." } }; }
  FOCUS.busy = false;
  if (r.ok && r.json.session) {
    FOCUS.s = stripReport(r.json.session); FOCUS.owner = true; FOCUS.view = "room"; FOCUS.note = ""; FOCUS.confirmEnd = false;
    rememberTask(FOCUS.s.id, it && it.id);
    sfx("click"); paintFocus(); render(); return true;
  }
  if (r.status === 409 && r.json.session) {
    FOCUS.s = stripReport(r.json.session); FOCUS.owner = true; FOCUS.view = FOCUS.s.status === "INTERRUPTED" && FOCUS.s.mode === "strict" ? "away" : "room";
    FOCUS.note = "You already had a focus session open, so it's back on screen."; paintFocus(); render(); return false;
  }
  exitFullscreen();
  FOCUS.view = ""; FOCUS.msg = (r.json && r.json.error) || "The session couldn't start. Please try again."; paintFocus(); render(); return false;
}
// The finished report. Seen once: the first time, the focused minutes are logged on the task (as before).
function showDone(s, fresh){
  FOCUS.s = s; FOCUS.view = "done"; FOCUS.confirmEnd = false; FOCUS.completing = false; FOCUS.lastDone = s;
  exitFullscreen(); paintFocus();
  if (s.status === "COMPLETED" && fresh) { sfx("success"); setTimeout(() => burst($("#fzDoneMark")), 60); }
  FOCUS.q = FOCUS.q.then(() => FStore.act(s.id, "ack", {})).then(r => {
    if (!r || !r.ok || !r.json.first) return;
    const rep = FC.report(s, fnow()); const mins = Math.round(rep.focusedMs / MIN);
    const itemId = taskMap()[s.id] || s.taskId; const w = W(); const it = itemId && findItem(itemId, w);
    if (it && mins >= 1) {
      it.loggedMin = (it.loggedMin || 0) + mins;
      if (Number(it.estimate) > 0 && !(it.milestones || []).length && !isDone(it)) it.progress = clamp(Math.round((Number(it.progress) || 0) + mins / 60 / Number(it.estimate) * 100), 0, 100);
      if (it.status === "todo") it.status = "doing";
      touch(it); logItem(w, it, `Focused for ${mins} min on "${it.title}"`); save();
    }
    FOCUS.stats = null; if (UI.route === "planner" || UI.route === "reports") loadFocusStats(true);
  }).catch(() => {});
}
function closeRoom(route){
  exitFullscreen(); FOCUS.view = ""; FOCUS.confirmEnd = false; FOCUS.note = "";
  if (FOCUS.s && FC.isFinished(FOCUS.s)) FOCUS.s = null;
  paintFocus();
  if (route) { location.hash = route; UI.route = route; }
  render();
}
// "Start another session": back to the setup with the same choices; nothing starts by itself
function setupAgain(){
  const d = FOCUS.lastDone; FOCUS.view = ""; FOCUS.s = null; exitFullscreen(); paintFocus();
  if (d) { const itemId = taskMap()[d.id] || d.taskId; Object.assign(FOCUS.setup, { minutes: Math.round(d.plannedMs / MIN), mode: d.mode, topic: d.topic || "" });
    if (itemId && findItem(itemId)) FOCUS.setup.taskId = itemId; else { FOCUS.setup.taskId = "other"; FOCUS.setup.title = d.title; } }
  openFocusSetup();
}
// Opens the Study Planner with the setup card ready (from a task's focus button too).
function openFocusSetup(itemId){
  if (itemId) { FOCUS.setup.taskId = itemId; FOCUS.setup.title = ""; }
  if (FOCUS.s && FC.isOpen(FOCUS.s)) { FOCUS.view = FOCUS.s.status === "INTERRUPTED" && FOCUS.s.mode === "strict" ? "away" : "room"; paintFocus(); return; }
  location.hash = "planner"; UI.route = "planner"; render();
  setTimeout(() => { const b = $("#fzStart"); if (b) { b.scrollIntoView({ block: "center", behavior: "smooth" }); b.focus({ preventScroll: true }); } }, 80);
}

/* ---------- noticing when the study page is left ---------- */
function leave(kind){
  const s = FOCUS.s; if (!FOCUS.owner || !s || s.status !== "ACTIVE") return;
  fact("interrupt", { kind }, true);
  if (s.mode === "strict") FOCUS.view = "away";
}
document.addEventListener("visibilitychange", () => {
  const s = FOCUS.s; if (!s || !FOCUS.owner) return;
  if (document.visibilityState === "hidden") { leave(FOCUS.unloading ? "reload" : "tab"); return; }
  FOCUS.unloading = false;
  if (s.status === "INTERRUPTED") { if (s.mode === "normal") welcomeBack(); else { FOCUS.view = "away"; paintFocus(); } }
  if (FStore.server() && FC.isOpen(s)) FStore.current().then(c => { if (c.session && FOCUS.s && c.session.id === FOCUS.s.id) adopt(stripReport(c.session)); else if (!c.session && c.unseen && FOCUS.s && c.unseen.id === FOCUS.s.id) adopt(stripReport(c.unseen)); }).catch(() => {});
});
function onFsChange(){
  const s = FOCUS.s; paintFocus();
  if (!s || !FOCUS.owner || s.mode !== "strict" || inFullscreen() || document.visibilityState !== "visible") return;
  if (s.status === "ACTIVE") leave("fullscreen");
  if (FOCUS.view === "room" && s.status === "INTERRUPTED") FOCUS.view = "away";
  paintFocus();
}
document.addEventListener("fullscreenchange", onFsChange); document.addEventListener("webkitfullscreenchange", onFsChange);
// Strict only: another window in front (the page still visible) for more than 2 seconds
window.addEventListener("blur", () => {
  const s = FOCUS.s; if (!s || s.mode !== "strict" || s.status !== "ACTIVE" || !FOCUS.owner) return;
  clearTimeout(FOCUS.blurTimer);
  FOCUS.blurTimer = setTimeout(() => { if (!document.hasFocus() && document.visibilityState === "visible") { leave("window"); paintFocus(); } }, 2000);
});
window.addEventListener("focus", () => { clearTimeout(FOCUS.blurTimer); });
// Strict: the browser asks "Leave site?" before closing or reloading during a running session
window.addEventListener("beforeunload", e => {
  FOCUS.unloading = true; setTimeout(() => { FOCUS.unloading = false; }, 1500);
  const s = FOCUS.s; if (s && FOCUS.owner && s.mode === "strict" && s.status === "ACTIVE") { e.preventDefault(); e.returnValue = ""; }
});

/* ---------- the clock: numbers on screen, heartbeat, finishing ---------- */
setInterval(() => {
  const s = FOCUS.s;
  if (s && FC.isOpen(s)) {
    const t = fnow(); const rem = FC.remainingMs(s, t);
    if (s.status === "ACTIVE" && rem <= 0 && !FOCUS.completing) { FOCUS.completing = true; fact("complete").then(() => { FOCUS.completing = false; }); return; }
    paintNumbers(t);
  }
  if (FOCUS.view === "break") paintBreak();
}, 250);
setInterval(() => {
  const s = FOCUS.s;
  if (s && FOCUS.owner && s.status === "ACTIVE" && document.visibilityState === "visible")
    FStore.act(s.id, "beat", {}).then(r => { if (r && r.json && r.json.session && FOCUS.s && FOCUS.s.id === s.id) { const n = stripReport(r.json.session); if (n.status !== FOCUS.s.status) adopt(n); else FOCUS.s.lastSeen = n.lastSeen; } }).catch(() => {});
}, 15000);

/* ---------- screens ---------- */
const RING_R = 112, RING_C = 2 * Math.PI * RING_R;
function ringSvg(id){ return `<svg class="fz-ring-svg" viewBox="0 0 256 256" aria-hidden="true"><circle class="trk" cx="128" cy="128" r="${RING_R}"/><circle class="prg" id="${id}" cx="128" cy="128" r="${RING_R}" stroke-dasharray="${RING_C.toFixed(1)}" stroke-dashoffset="${RING_C.toFixed(1)}"/></svg>`; }
function statusWord(s){ return s.status === "ACTIVE" ? "Focusing" : s.status === "PAUSED" ? "Paused" : s.status === "INTERRUPTED" ? "Away" : s.status === "COMPLETED" ? "Completed" : "Ended"; }
function roomHTML(){
  const s = FOCUS.s, v = FOCUS.view, t = fnow();
  if (v === "commit") {
    const st = FOCUS.setup; const it = st.taskId && st.taskId !== "other" ? findItem(st.taskId) : null; const title = it ? it.title : st.title;
    return `<div class="fz-panel fz-commit" role="dialog" aria-modal="true" aria-labelledby="fzH">
      <p class="fz-eyebrow">Strict Focus</p>
      <h2 id="fzH">Ready to focus for ${fMin(st.minutes)}?</h2>
      <p class="fz-what">${esc(title || "")}</p>
      <ul class="fz-rules">
        <li>${fsSupported() ? "The page goes fullscreen and hides everything else." : "Everything else in the app is hidden while you study."}</li>
        <li>If you switch tabs, open another app${fsSupported() ? " or leave fullscreen" : ""}, the timer stops.</li>
        <li>It starts again only when you come back and press Resume.</li>
        <li>Every interruption goes into your session report.</li>
      </ul>
      <p class="fz-honest">${IC.info}<span>A website can't lock your device, so this can't stop you opening other tabs or apps. It stops your timer and keeps your study time honest.${fsSupported() ? "" : " Fullscreen isn't available in this browser."}</span></p>
      <div class="fz-actions"><button class="btn primary lg" type="button" data-act="fzcommit"${FOCUS.busy ? " disabled" : ""}>${fsSupported() ? "Enter fullscreen and start" : "Start Strict Focus"}</button><button class="btn ghost" type="button" data-act="fzcancel">Not now</button></div>
    </div>`;
  }
  if (!s) return "";
  const r = FC.report(s, t);
  if (v === "away") {
    const last = r.lastInterruption; const needFs = s.mode === "strict" && fsSupported() && !inFullscreen();
    return `<div class="fz-panel fz-away" role="dialog" aria-modal="true" aria-labelledby="fzH">
      <span class="fz-away-mark" aria-hidden="true">${IC.pause}</span>
      <h2 id="fzH">You left your study session!</h2>
      <p class="fz-lead">Your focus timer has been paused. Come back to your goal and continue studying.</p>
      <dl class="fz-grid">
        <div><dt>Interruptions</dt><dd>${r.interruptions}</dd></div>
        <div><dt>Last interruption</dt><dd>${last ? `${fAt(last.at)}<small>${esc(KIND_WORD[last.kind] || "")}</small>` : "–"}</dd></div>
        <div><dt>Total time away</dt><dd id="fzAway">${fDur(r.awayMs)}</dd></div>
        <div><dt>Time left</dt><dd>${fClock(r.remainingMs)}</dd></div>
      </dl>
      ${needFs ? `<p class="fz-honest">${IC.info}<span>Strict Focus runs in fullscreen. Resuming takes you back into it.</span></p>` : ""}
      <div class="fz-actions"><button class="btn primary lg" type="button" data-act="fzresume" id="fzResume">${needFs ? "Resume focus in fullscreen" : "Resume focus"}</button><button class="btn ghost" type="button" data-act="fzend">End session</button></div>
      ${endConfirmHTML(r)}
    </div>`;
  }
  if (v === "done") {
    const ok = s.status === "COMPLETED";
    return `<div class="fz-panel fz-done" role="dialog" aria-modal="true" aria-labelledby="fzH">
      <span class="fz-done-mark${ok ? "" : " early"}" id="fzDoneMark" aria-hidden="true">${ok ? IC.check : IC.pause}</span>
      <h2 id="fzH">${ok ? "Excellent work! You completed your study session." : s.endReason === "expired" ? "This session was closed after 12 hours without use." : "Session ended early."}</h2>
      ${ok ? "" : `<p class="fz-lead">${r.focusedMs >= MIN ? `You still focused for ${fDur(r.focusedMs)}. That counts.` : "Less than a minute was focused this time."}</p>`}
      <dl class="fz-grid fz-report">
        <div><dt>Subject</dt><dd>${esc(s.subject || "–")}</dd></div>
        <div class="wide"><dt>Task</dt><dd>${esc(s.title)}${s.topic ? `<small>${esc(s.topic)}</small>` : ""}</dd></div>
        <div><dt>Planned</dt><dd>${fDur(r.plannedMs)}</dd></div>
        <div><dt>Focused</dt><dd>${fDur(r.focusedMs)}</dd></div>
        <div><dt>Break time</dt><dd>${fDur(r.breakMs)}</dd></div>
        <div><dt>Time away</dt><dd>${fDur(r.awayMs)}</dd></div>
        <div><dt>Interruptions</dt><dd>${r.interruptions}</dd></div>
        <div><dt>Status</dt><dd>${ok ? "Completed" : "Ended early"}</dd></div>
      </dl>
      <div class="fz-actions"><button class="btn primary" type="button" data-act="fzbreak">Take a short break</button><button class="btn" type="button" data-act="fzagain">Start another session</button><button class="btn ghost" type="button" data-act="fzclose">Back to planner</button></div>
    </div>`;
  }
  // the study room
  const strict = s.mode === "strict";
  return `<div class="fz-stage" role="dialog" aria-modal="true" aria-label="Focus session">
    <header class="fz-top">
      <span class="fz-mode">${strict ? "Strict Focus" : "Normal Focus"}</span>
      <span class="fz-state st-${s.status.toLowerCase()}" id="fzState" role="status"><i aria-hidden="true"></i>${statusWord(s)}</span>
      <span class="fz-top-r">${!strict && fsSupported() ? `<button class="btn ghost sm" type="button" data-act="fzfs">${inFullscreen() ? "Exit fullscreen" : "Fullscreen"}</button>` : ""}${!strict ? `<button class="btn ghost sm" type="button" data-act="fzmin" aria-label="Minimise the session and go back to the app">Minimise</button>` : ""}</span>
    </header>
    <div class="fz-center">
      ${s.subject ? `<p class="fz-subject">${esc(s.subject)}</p>` : ""}
      <h1 class="fz-task">${esc(s.title)}</h1>
      ${s.topic ? `<p class="fz-topic">${esc(s.topic)}</p>` : ""}
      <div class="fz-ring">${ringSvg("fzPr")}<div class="fz-time"><b id="fzTime">${fClock(r.remainingMs)}</b><span>time remaining</span></div></div>
      <dl class="fz-facts">
        <div><dt>Started</dt><dd>${fAt(s.startedAt)}</dd></div>
        <div><dt>Finishes</dt><dd id="fzEnds">${fAt(FC.endsAt(s, t))}</dd></div>
        <div><dt>Focused</dt><dd id="fzFocused">${fDur(r.focusedMs)}</dd></div>
        <div><dt>Interruptions</dt><dd>${r.interruptions}</dd></div>
      </dl>
      <div class="fz-progress" aria-hidden="true"><span id="fzBar" style="width:${(r.focusedMs / r.plannedMs * 100).toFixed(1)}%"></span></div>
      ${FOCUS.note ? `<p class="fz-note" role="status">${IC.info}<span>${esc(FOCUS.note)}</span><button type="button" class="ib" data-act="fznote" aria-label="Dismiss">×</button></p>` : ""}
      <div class="fz-controls">
        ${s.status === "ACTIVE" ? `<button class="btn lg" type="button" data-act="fzpause">${IC.pause}Pause</button>` : `<button class="btn primary lg" type="button" data-act="fzresume" id="fzResume">${IC.play}Resume</button>`}
        ${r.remainingMs <= 0 ? `<button class="btn primary lg" type="button" data-act="fzcomplete">${IC.check}Complete session</button>` : ""}
        <button class="btn ghost lg" type="button" data-act="fzend">End early</button>
      </div>
      ${endConfirmHTML(r)}
    </div>
  </div>`;
}
function endConfirmHTML(r){
  if (!FOCUS.confirmEnd) return "";
  return `<div class="fz-confirm" role="alertdialog" aria-labelledby="fzEndQ"><p id="fzEndQ"><b>End this session now?</b> ${r.focusedMs >= MIN ? `${fDur(r.focusedMs)} of focus will be saved.` : "Less than a minute has been focused so far."}</p>
    <div class="fz-actions"><button class="btn sm danger" type="button" data-act="fzendyes">End session</button><button class="btn sm" type="button" data-act="fzendno">Keep studying</button></div></div>`;
}
function breakHTML(){
  const left = FOCUS.breakEnd - Date.now(); const over = left <= 0;
  return `<div class="fz-panel fz-break" role="dialog" aria-modal="true" aria-labelledby="fzH">
    <p class="fz-eyebrow">Short break</p>
    <h2 id="fzH">${over ? "Break's over." : "Rest your eyes. Stretch. Drink some water."}</h2>
    <div class="fz-ring sm">${ringSvg("fzBrPr")}<div class="fz-time"><b id="fzBrTime">${fClock(Math.max(0, left))}</b><span>${over ? "ready when you are" : "of break left"}</span></div></div>
    ${over ? "" : `<div class="seg" role="group" aria-label="Break length">${[5, 10, 15].map(n => `<button type="button" data-act="fzbreaklen" data-v="${n}" aria-pressed="${FOCUS.breakLen === n}">${n} min</button>`).join("")}</div>`}
    <div class="fz-actions">${over ? `<button class="btn primary" type="button" data-act="fzagain">Start another session</button>` : `<button class="btn" type="button" data-act="fzbreakend">End break now</button>`}<button class="btn ghost" type="button" data-act="fzclose">Back to planner</button></div>
  </div>`;
}
// Draws the room (or hides it) and the small timer shown when a Normal session is minimised.
function paintFocus(){
  let host = $("#focusRoom");
  if (!host) { host = document.createElement("div"); host.id = "focusRoom"; host.hidden = true; document.body.appendChild(host); }
  const v = FOCUS.view;
  const show = v && (v === "commit" || v === "break" || FOCUS.s);
  host.hidden = !show; document.body.classList.toggle("in-focus", !!show);
  host.className = "fz-room" + (FOCUS.s && FOCUS.s.mode === "strict" ? " strict" : "") + (v ? " v-" + v : "");
  if (show) {
    const html = v === "break" ? breakHTML() : roomHTML();
    if (host.__html !== html) { host.innerHTML = html; host.__html = html; }
    paintNumbers(fnow());
  } else { host.innerHTML = ""; host.__html = ""; }
  renderFocusMini();
}
// Only the numbers change every quarter second (no full redraw).
function paintNumbers(t){
  const s = FOCUS.s; if (!s) return;
  const r = FC.report(s, t); const frac = r.plannedMs ? r.focusedMs / r.plannedMs : 0;
  const set = (id, v) => { const el = document.getElementById(id); if (el && el.textContent !== v) el.textContent = v; };
  set("fzTime", fClock(r.remainingMs)); set("fzFocused", fDur(r.focusedMs)); set("fzAway", fDur(r.awayMs));
  if (s.status === "ACTIVE" || FC.isOpen(s)) set("fzEnds", fAt(FC.endsAt(s, t)));
  const pr = document.getElementById("fzPr"); if (pr) pr.style.strokeDashoffset = (RING_C * (1 - frac)).toFixed(1);
  const bar = document.getElementById("fzBar"); if (bar) bar.style.width = (frac * 100).toFixed(1) + "%";
  set("fmTm", fClock(r.remainingMs)); const mp = document.getElementById("fmPr"); if (mp) mp.style.strokeDashoffset = (2 * Math.PI * 14 * (1 - frac)).toFixed(1);
}
function paintBreak(){
  const left = FOCUS.breakEnd - Date.now();
  if (left <= 0 && !FOCUS.breakOver) { FOCUS.breakOver = true; sfx("success"); paintFocus(); return; }
  const el = document.getElementById("fzBrTime"); if (el) el.textContent = fClock(Math.max(0, left));
  const pr = document.getElementById("fzBrPr"); if (pr) pr.style.strokeDashoffset = (RING_C * Math.max(0, left) / (FOCUS.breakLen * MIN)).toFixed(1);
}
// A minimised Normal session: a small timer in the corner (was the old focus timer's mini view).
function renderFocusMini(){
  const host = $("#focusMini"); if (!host) return;
  const s = FOCUS.s;
  if (!s || !FC.isOpen(s) || FOCUS.view) { host.innerHTML = ""; return; }
  const r = FC.report(s, fnow()); const c = 2 * Math.PI * 14;
  host.innerHTML = `<div class="focus-mini" role="status"><div class="mr"><svg viewBox="0 0 34 34" aria-hidden="true"><circle cx="17" cy="17" r="14" class="trk"/><circle id="fmPr" cx="17" cy="17" r="14" class="prg" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${(c * (1 - r.focusedMs / r.plannedMs)).toFixed(1)}"/></svg></div>
    <div><div class="t" id="fmTm">${fClock(r.remainingMs)}</div><div class="n">${esc(s.title)}</div></div>
    <button type="button" data-act="fzopen">Open</button>${s.status === "ACTIVE" ? `<button type="button" data-act="fzpause">Pause</button>` : `<button type="button" data-act="fzresume">Resume</button>`}</div>`;
}

/* ---------- Study Planner: the setup card and the statistics ---------- */
function focusSetupHTML(w){
  const st = FOCUS.setup; const word = w.mode === "company" ? "work" : "study";
  const open = FOCUS.s && FC.isOpen(FOCUS.s) ? FOCUS.s : null;
  if (open) {
    const r = FC.report(open, fnow());
    return `<section class="card fz-setup" id="fzSetup"><div class="card-h"><h3>Deep Focus</h3><span class="sub">${open.mode === "strict" ? "Strict" : "Normal"} · ${statusWord(open)}</span></div>
      <p>You have a focus session open: <b>${esc(open.title)}</b>, ${fClock(r.remainingMs)} left.</p>
      <div class="row-flex"><button class="btn primary" type="button" data-act="fzopen" id="fzStart">Return to session</button></div></section>`;
  }
  const items = w.items.filter(i => !isDone(i) && (w.mode !== "company" || i.assignee === viewerId(w))).sort((a, b) => (a.due ? new Date(a.due) : Infinity) - (b.due ? new Date(b.due) : Infinity));
  if (st.taskId && st.taskId !== "other" && !items.some(i => i.id === st.taskId)) st.taskId = "";
  if (!st.taskId) st.taskId = items.length ? items[0].id : "other";
  const opt = i => { const g = groupOf(w, i.groupId); return `<option value="${i.id}"${st.taskId === i.id ? " selected" : ""}>${esc(i.title)}${g ? " · " + esc(g.name) : ""}</option>`; };
  const lens = [25, 45, 60, 90];
  return `<section class="card fz-setup" id="fzSetup"><div class="card-h"><h3>Deep Focus</h3><span class="sub">Only real ${word} time counts</span></div>
    <div class="fz-form">
      ${items.length ? `<label class="fz-f"><span>What will you work on?</span><select id="fzTask" aria-label="Task to focus on">${items.map(opt).join("")}<option value="other"${st.taskId === "other" ? " selected" : ""}>Something else…</option></select></label>` : ""}
      ${st.taskId === "other" ? `<label class="fz-f"><span>${items.length ? "Task" : "What will you work on?"}</span><input id="fzTitle" maxlength="200" placeholder="For example: Revise organic chemistry" value="${esc(st.title)}"></label>` : ""}
      <label class="fz-f"><span>Topic <em>(optional)</em></span><input id="fzTopic" maxlength="160" placeholder="For example: Assignment operators" value="${esc(st.topic)}"></label>
      <div class="fz-f"><span id="fzLenL">How long?</span><div class="seg" role="group" aria-labelledby="fzLenL">${lens.map(n => `<button type="button" data-act="fzlen" data-v="${n}" aria-pressed="${!st.custom && st.minutes === n}">${n} min</button>`).join("")}<button type="button" data-act="fzlen" data-v="other" aria-pressed="${st.custom}">Other</button></div>
        ${st.custom ? `<label class="fz-mins"><input id="fzMins" type="number" inputmode="numeric" min="5" max="240" step="5" value="${st.minutes}" aria-label="Minutes"> minutes</label>` : ""}</div>
      <div class="fz-f"><span id="fzModeL">Mode</span><div class="fz-modes" role="radiogroup" aria-labelledby="fzModeL">
        <button type="button" role="radio" data-act="fzmode" data-v="normal" aria-checked="${st.mode === "normal"}"><b>Normal Focus</b><span>The timer pauses while you're away and carries on when you're back.</span></button>
        <button type="button" role="radio" data-act="fzmode" data-v="strict" aria-checked="${st.mode === "strict"}"><b>Strict Focus</b><span>Fullscreen. Leaving pauses the timer until you come back and press Resume.</span></button>
      </div></div>
    </div>
    ${FOCUS.msg ? `<p class="fz-msg" role="alert">${IC.alert}<span>${esc(FOCUS.msg)}</span></p>` : ""}
    <div class="row-flex"><button class="btn primary lg" type="button" data-act="fzstart" id="fzStart"${FOCUS.busy ? " disabled" : ""}>${IC.play}${st.mode === "strict" ? "Start Strict Focus" : "Start focus session"}</button></div>
  </section>`;
}
function loadFocusStats(force){
  if (FOCUS.loading || (!force && FOCUS.stats && Date.now() - FOCUS.statsAt < 30000)) return;
  FOCUS.loading = true;
  Promise.all([FStore.stats(7), FStore.history()]).then(([st, h]) => { FOCUS.stats = st; FOCUS.history = h; FOCUS.statsAt = Date.now(); })
    .catch(() => {}).finally(() => { FOCUS.loading = false; if ((UI.route === "planner" || UI.route === "reports") && !modalKind) render({ soft: true }); });
}
function focusStatsHTML(compact){
  const st = FOCUS.stats;
  if (!st) { loadFocusStats(); return `<section class="card fz-stats" id="fzStats"><div class="card-h"><h3>Focus statistics</h3></div><p class="muted">Loading…</p></section>`; }
  if (!st.total.sessions) return `<section class="card fz-stats" id="fzStats"><div class="card-h"><h3>Focus statistics</h3></div><p class="muted">No focus sessions yet. Your study time, streak and interruptions appear here after your first session.</p></section>`;
  const W7 = st.week; const max = Math.max(1, ...st.days.map(d => Math.max(d.focusedMin, d.plannedMin)));
  const wd = d => new Date(d + "T12:00:00").toLocaleDateString(undefined, { weekday: "short" });
  const bars = st.days.map((d, k) => `<div class="fz-day${k === st.days.length - 1 ? " today" : ""}" title="${esc(wd(d.date))}: ${fMin(d.focusedMin)} focused${d.plannedMin ? ` of ${fMin(d.plannedMin)} planned` : ""}">
      <div class="fz-col"><span class="pl" style="height:${(d.plannedMin / max * 100).toFixed(1)}%"></span><span class="fo" style="height:${(d.focusedMin / max * 100).toFixed(1)}%"></span></div>
      <b>${d.focusedMin ? fMin(d.focusedMin).replace(" min", "m").replace(" h ", "h ").replace(" h", "h") : "–"}</b><small>${k === st.days.length - 1 ? "Today" : esc(wd(d.date))}</small></div>`).join("");
  const smax = Math.max(1, ...st.subjects.map(x => x.focusedMin));
  const subjects = st.subjects.slice(0, 6).map(x => `<div class="fz-sub"><span class="nm">${esc(x.subject)}</span><span class="bar-track"><span style="width:${(x.focusedMin / smax * 100).toFixed(1)}%"></span></span><span class="v">${fMin(x.focusedMin)}</span><span class="muted">${x.sessions} session${x.sessions === 1 ? "" : "s"}</span></div>`).join("");
  const recent = (FOCUS.history || []).map(s => `<li><span class="fz-dot ${s.status === "COMPLETED" ? "ok" : "early"}" aria-hidden="true"></span><span class="tt">${esc(s.title)}${s.subject ? `<small>${esc(s.subject)}</small>` : ""}</span>
      <span class="muted">${new Date(s.startedAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</span><span>${fDur(s.report.focusedMs)} / ${fDur(s.plannedMs)}</span><span class="muted">${s.status === "COMPLETED" ? "Completed" : "Ended early"}${s.report.interruptions ? ` · ${s.report.interruptions} interruption${s.report.interruptions === 1 ? "" : "s"}` : ""}</span></li>`).join("");
  return `<section class="card fz-stats" id="fzStats"><div class="card-h"><h3>Focus statistics</h3><span class="sub">Last 7 days</span></div>
    <div class="fz-kpis">
      <div><span>Focused today</span><b>${fMin(st.today.focusedMin)}</b><small>${st.today.sessions} session${st.today.sessions === 1 ? "" : "s"}</small></div>
      <div><span>This week</span><b>${fMin(W7.focusedMin)}</b><small>${W7.pctOfPlan == null ? "nothing finished yet" : `${W7.pctOfPlan}% of ${fMin(W7.plannedMin)} planned`}</small></div>
      <div><span>Completed</span><b>${W7.completed}</b><small>${W7.endedEarly} ended early</small></div>
      <div><span>Streak</span><b>${st.streak} day${st.streak === 1 ? "" : "s"}</b><small>studied on ${st.activeDays} of 7 days</small></div>
      <div><span>Interruptions</span><b>${W7.interruptions}</b><small>${fMin(W7.awayMin)} away</small></div>
    </div>
    <div class="fz-chart" role="img" aria-label="Focused minutes for each of the last 7 days">${bars}</div>
    <p class="fz-legend"><span><i class="fo"></i>Focused</span><span><i class="pl"></i>Planned</span></p>
    ${!compact && subjects ? `<h4 class="fz-h4">By subject</h4><div class="fz-subs">${subjects}</div>` : ""}
    ${!compact && recent ? `<h4 class="fz-h4">Recent sessions</h4><ul class="fz-recent">${recent}</ul>` : ""}
    <p class="note">${IC.info}<span>All time: ${fMin(st.total.focusedMin)} focused, ${st.total.completed} session${st.total.completed === 1 ? "" : "s"} completed.</span></p>
  </section>`;
}

/* ---------- buttons ---------- */
document.addEventListener("change", e => {
  const t = e.target;
  if (t.id === "fzTask") { FOCUS.setup.taskId = t.value; FOCUS.msg = ""; render(); }
});
document.addEventListener("input", e => {
  const t = e.target;
  if (t.id === "fzTitle") FOCUS.setup.title = t.value;
  else if (t.id === "fzTopic") FOCUS.setup.topic = t.value;
  else if (t.id === "fzMins") { const n = Math.round(Number(t.value)); if (n >= 5 && n <= 240) FOCUS.setup.minutes = n; }
});
document.addEventListener("click", e => {
  const a = e.target.closest("[data-act]"); if (!a) return;
  const st = FOCUS.setup;
  switch (a.dataset.act) {
    case "fzlen": if (a.dataset.v === "other") st.custom = true; else { st.custom = false; st.minutes = +a.dataset.v; } render(); if (st.custom) setTimeout(() => { const i = $("#fzMins"); if (i) i.focus(); }, 30); break;
    case "fzmode": st.mode = a.dataset.v === "strict" ? "strict" : "normal"; render(); break;
    case "fzstart": {
      const ti = $("#fzTitle"); if (ti) st.title = ti.value; const tp = $("#fzTopic"); if (tp) st.topic = tp.value;
      const mi = $("#fzMins"); if (st.custom && mi) { const n = Math.round(Number(mi.value)); if (!(n >= 5 && n <= 240)) { FOCUS.msg = "Choose between 5 and 240 minutes."; render(); break; } st.minutes = n; }
      const it = st.taskId && st.taskId !== "other" ? findItem(st.taskId) : null;
      if (!it && !(st.title || "").trim()) { FOCUS.msg = "Choose a task or type what you'll work on."; render(); break; }
      FOCUS.msg = "";
      if (st.mode === "strict") { FOCUS.view = "commit"; paintFocus(); setTimeout(() => { const b = $("[data-act=fzcommit]"); if (b) b.focus(); }, 30); }
      else startSession();
      break; }
    case "fzcommit":
      // fullscreen has to be asked for straight from the click
      enterFullscreen().then(ok => { if (!ok && fsSupported()) FOCUS.note = "Fullscreen didn't start. The timer still stops whenever you leave this page."; startSession(); });
      break;
    case "fzcancel": FOCUS.view = ""; paintFocus(); break;
    case "fzpause": fact("pause"); break;
    case "fzresume": {
      const s = FOCUS.s; if (!s) break; FOCUS.confirmEnd = false;
      const go = () => { FOCUS.view = "room"; fact("resume"); };
      if (s.mode === "strict" && fsSupported() && !inFullscreen()) enterFullscreen().then(ok => { if (!ok) FOCUS.note = "Fullscreen didn't start. The timer still stops whenever you leave this page."; go(); });
      else go();
      break; }
    case "fzcomplete": fact("complete"); break;
    case "fzend": FOCUS.confirmEnd = true; paintFocus(); setTimeout(() => { const b = $("[data-act=fzendno]"); if (b) b.focus(); }, 30); break;
    case "fzendno": FOCUS.confirmEnd = false; paintFocus(); break;
    case "fzendyes": FOCUS.confirmEnd = false; fact("end"); break;
    case "fzmin": if (FOCUS.s && FOCUS.s.mode === "normal") { exitFullscreen(); FOCUS.view = ""; paintFocus(); render(); } break;
    case "fzopen": if (FOCUS.s && FC.isOpen(FOCUS.s)) { FOCUS.owner = true; FOCUS.view = FOCUS.s.status === "INTERRUPTED" && FOCUS.s.mode === "strict" ? "away" : "room"; paintFocus(); } break;
    case "fzfs": if (inFullscreen()) exitFullscreen(); else enterFullscreen().then(() => paintFocus()); break;
    case "fznote": FOCUS.note = ""; paintFocus(); break;
    case "fzbreak": FOCUS.breakLen = 5; FOCUS.breakEnd = Date.now() + 5 * MIN; FOCUS.breakOver = false; FOCUS.view = "break"; paintFocus(); break;
    case "fzbreaklen": { const n = +a.dataset.v; FOCUS.breakEnd += (n - FOCUS.breakLen) * MIN; FOCUS.breakLen = n; FOCUS.breakOver = false; paintFocus(); break; }
    case "fzbreakend": FOCUS.breakEnd = Date.now(); paintBreak(); break;
    case "fzagain": setupAgain(); break;
    case "fzclose": closeRoom("planner"); break;
  }
});
document.addEventListener("keydown", e => { if (e.key === "Escape" && FOCUS.view === "commit") { FOCUS.view = ""; paintFocus(); } });
