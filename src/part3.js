
/* =========================================================
   Icons
   ========================================================= */
const svg = p => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const IC = {
  overview: svg('<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>'),
  list: svg('<path d="M9 6h11M9 12h11M9 18h11"/><path d="m3.5 6 1 1 2-2M3.5 12l1 1 2-2M3.5 18l1 1 2-2"/>'),
  exam: svg('<path d="M4 4h12l4 4v12H4z"/><path d="M8 12h8M8 16h5M8 8h4"/>'),
  calendar: svg('<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>'),
  planner: svg('<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9.5 2.5h5"/>'),
  reports: svg('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
  prefs: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  team: svg('<rect x="3" y="4" width="5" height="16" rx="1.5"/><rect x="10" y="4" width="5" height="10" rx="1.5"/><rect x="17" y="4" width="4" height="13" rx="1.5"/>'),
  workload: svg('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M17 11h5M17 15h4M17 7h3"/>'),
  approvals: svg('<path d="M9 11.5 11.5 14 16 9"/><path d="M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6z"/>'),
  mywork: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
  play: svg('<path d="M7 4.5v15l12-7.5z" fill="currentColor"/>'),
  pause: svg('<path d="M8 5v14M16 5v14"/>'),
  rescue: svg('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="m5.6 5.6 3.6 3.6M14.8 14.8l3.6 3.6M18.4 5.6l-3.6 3.6M9.2 14.8l-3.6 3.6"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  x: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
  chev: svg('<path d="m8 10 4 4 4-4"/>'),
  alert: svg('<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17.5v.5"/>'),
  info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.5"/>'),
  spark: svg('<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>'),
  trash: svg('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>'),
  link: svg('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'),
  more: svg('<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>'),
  inbox: svg('<path d="M3 13h5l1.5 3h5L16 13h5"/><path d="M5 5h14l2 8v6H3v-6z"/>'),
  student: svg('<path d="M2 9 12 4l10 5-10 5z"/><path d="M6 11v5c3 2.5 9 2.5 12 0v-5"/>'),
  company: svg('<rect x="4" y="3" width="11" height="18" rx="1.5"/><path d="M15 9h5v12h-5M8 7h3M8 11h3M8 15h3"/>'),
  personal: svg('<path d="M12 21s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.6-7 10-7 10z"/>'),
  sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  moon: svg('<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>'),
  edit: svg('<path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="m13.5 6.5 4 4"/>'),
  bell: svg('<path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>'),
  forward: svg('<path d="M5 12h12M13 6l6 6-6 6"/>'),
  flag: svg('<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>'),
  send: svg('<path d="M4 12 20 4l-6 16-3-7z"/>'),
  mail: svg('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>'),
  todo: svg('<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="m8 12.5 3 3 5-6"/>'),
  assistant: svg('<path d="M12 3c.6 3.7 2.3 5.4 6 6-3.7.6-5.4 2.3-6 6-.6-3.7-2.3-5.4-6-6 3.7-.6 5.4-2.3 6-6z"/><path d="M19 15c.3 1.6 1 2.3 2.5 2.5-1.5.3-2.2 1-2.5 2.5-.3-1.5-1-2.2-2.5-2.5 1.5-.2 2.2-.9 2.5-2.5z"/>'),
  copy: svg('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>')
};

/* =========================================================
   Navigation
   ========================================================= */
// [route, label, inMore]: four main items (plus team pages for company), the rest folded under "More".
function navFor(w){
  const M = true;
  if (w.mode === "student") return [["overview", "Today"], ["daily", "Daily tasks"], ["assistant", "Assistant"], ["calendar", "Calendar"], ["deadlines", "Deadlines"], ["exams", "Exams", M], ["planner", "Study Planner", M], ["reports", "Reports", M], ["prefs", "Settings", M]];
  if (w.mode === "company") {
    const n = [["overview", "Today"], ["daily", "Daily tasks"], ["assistant", "Assistant"], ["calendar", "Calendar"], ["mywork", "My Work"], ["team", "Team Deadlines"]];
    if (canManage(w)) n.push(["workload", "Workload"], ["approvals", "Needs attention"]);
    n.push(["planner", "My Planner", M]);
    if (canManage(w)) n.push(["reports", "Reports", M]);
    n.push(["prefs", "Settings", M]);
    return n;
  }
  return [["overview", "Today"], ["daily", "Daily tasks"], ["assistant", "Assistant"], ["calendar", "Calendar"], ["deadlines", "Deadlines"], ["planner", "Planner", M], ["reports", "Reports", M], ["prefs", "Settings", M]];
}
const NAV_GROUP = {};
const NAV_ICON = { assistant: IC.assistant, todo: IC.todo, daily: IC.todo, overview: IC.overview, deadlines: IC.list, mywork: IC.mywork, exams: IC.exam, calendar: IC.calendar, planner: IC.planner, reports: IC.reports, prefs: IC.prefs, team: IC.team, workload: IC.workload, approvals: IC.approvals };
function setRoute(r, push = true){
  const w = W();
  const valid = navFor(w).map(x => x[0]);
  UI.route = valid.includes(r) ? r : "overview";
  if (push) { try { if (location.hash !== "#" + UI.route) location.hash = UI.route; } catch (e) {} }
  UI.animate = true;
  closeNotif();
  render();
  const v = $("#view"); if (v) v.scrollTop = 0;
}

/* =========================================================
   Render core
   ========================================================= */
let CTX = null;
function render(opts = {}){
  if (ACCOUNT.on && !ACCOUNT.user) return; // the log in screen stays until you log in
  queueMicrotask(renderWidget);
  if (!state || !state.workspaces || !state.workspaces.length) { showOnboarding(); return; }
  $("#onb").hidden = true; $("#app").hidden = false;
  const ae = document.activeElement;
  const aid = ae && ae.id, selS = ae && ae.selectionStart, selE = ae && ae.selectionEnd;
  const w = W(); const now = Date.now();
  CTX = { w, now, R: radar(w, now) };
  MOTION.railShell(); renderSide(); renderTop(); renderBnav();
  const drawerHasFocus = $("#drawer").contains(document.activeElement);
  $("#viewInner").innerHTML = VIEWS[UI.route] ? VIEWS[UI.route]() : VIEWS.overview();
  $("#viewInner").style.animation = UI.animate ? "" : "none";
  if (UI.animate) { countUp(); MOTION.view($("#viewInner")); UI.animate = false; }
  if (!(opts.soft && drawerHasFocus)) renderDrawer();
  renderFocusMini();
  if (UI.route === "assistant") scrollChat();
  if (aid) { const el = document.getElementById(aid); if (el && el !== document.activeElement) { el.focus({ preventScroll: true }); try { if (selS != null) el.setSelectionRange(selS, selE); } catch (e) {} } }
}
function countUp(){
  $$("[data-count]").forEach(el => {
    const n = +el.dataset.count; if (!n || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t0 = performance.now();
    const step = t => { const k = clamp((t - t0) / 550, 0, 1); el.textContent = Math.round(n * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  });
}

function renderSide(){
  const w = W();
  const nav = navFor(w);
  const R = CTX.R;
  const badge = r => {
    if (r === "overview") { const n = todayTodos(w, CTX.now).filter(i => !isDone(i)).length; return n ? `<span class="badge soft">${n}</span>` : ""; }
    if (r === "approvals") { const n = attentionCount(attentionOf(w, CTX.now)); return n ? `<span class="badge">${n}</span>` : ""; }
    if (r === "deadlines" || r === "mywork") { const n = w.items.filter(i => !isDone(i) && (r !== "mywork" || i.assignee === viewerId(w)) && ["overdue", "critical"].includes(levelOf(R, i))).length; return n ? `<span class="badge">${n}</span>` : ""; }
    return "";
  };
  const rail = MOTION.isRail();
  const link = (r, l) => `<a href="#${r}" data-route="${r}" data-flip="nav-${r}" aria-current="${UI.route === r ? "page" : "false"}" class="${r === "assistant" ? "nav-ai" : ""}"${rail ? ` title="${esc(l)}"` : ""}>${NAV_ICON[r]}<span class="lbl">${l}</span>${badge(r)}</a>`;
  $("#side").innerHTML = `
    <div class="brand" data-flip="brand">${logoSVG(28)}<span class="lbl">Deadline Tracker</span></div>
    <button class="ws-btn" type="button" data-act="wsmenu" data-flip="ws" aria-expanded="${UI.wsMenu}"${rail ? ` title="${esc(w.name)} · switch workspace"` : ""}>
      <span class="ws-ico" style="background:${MODE_COLOR[w.mode]}">${esc(initials(w.name))}</span>
      <span class="lbl" style="min-width:0"><span class="wn">${esc(w.name)}</span><span class="wm">${MODE_LABEL[w.mode]} workspace</span></span>
      <span class="chev">${IC.chev}</span>
    </button>
    ${UI.wsMenu && !rail ? `<div class="ws-menu">${state.workspaces.map(x => `<button type="button" data-act="wsswitch" data-ws="${x.id}" aria-current="${x.id === w.id}"><span class="ws-ico" style="background:${MODE_COLOR[x.mode]}">${esc(initials(x.name))}</span><span>${esc(x.name)}<br><small style="color:var(--side-muted)">${MODE_LABEL[x.mode]}</small></span></button>`).join("")}
      <button type="button" data-act="wsnew"><span class="ws-ico" style="background:var(--side-hover)">${IC.plus}</span>New workspace</button></div>` : ""}
    <nav class="nav" aria-label="Sections">
      ${nav.filter(x => !x[2]).map(([r, l]) => link(r, l)).join("")}
      <details class="nav-more"${nav.some(x => x[2] && x[0] === UI.route) || UI.navMore ? " open" : ""}><summary data-flip="more"${rail ? ` title="More"` : ""}>${IC.more}<span class="lbl">More</span></summary>${nav.filter(x => x[2]).map(([r, l]) => link(r, l)).join("")}</details>
    </nav>
    <div class="side-foot">
      ${w.mode === "company" ? `<div class="viewas"><label for="viewAs">Viewing as (prototype role switch)</label>
        <select id="viewAs">${[["manager", `${memberOf(w, "me").name} · Manager`]].concat(w.members.filter(m => m.id !== "me").map(m => [m.id, `${m.name} · Employee`])).map(([v, l]) => `<option value="${v}" ${w.viewAs === v ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>
        <span>Permissions are simulated here. A real build checks them on the server.</span></div>` : ""}
      <p class="tagline">Never miss a deadline. Always know what comes next.<br><span id="syncLine">${syncText()}</span>${ACCOUNT.user ? ` · <button type="button" class="linkish" data-act="logout">Log out</button>` : ""}</p>
    </div>`;
}
/* Email and Telegram (server only). Status comes from /api/channels; nothing secret is in the page. */
function channelsHTML(){
  if (Store.mode !== "server") return `<p class="note">${IC.info}<span>Email and Telegram reminders need the Deadline Tracker server (log in with an account).</span></p>`;
  const C = UI.channels, p = (ACCOUNT.user && ACCOUNT.user.notifyPrefs) || {};
  if (!C || UI.channelsStale) { loadChannels(); if (!C) return `<div class="chan" aria-busy="true"><p class="muted">Loading email and Telegram…</p></div>`; }
  const e = C.email, t = C.telegram;
  const emailLine = !e.configured ? "Email isn't set up on this site yet." : e.verified ? `${esc(e.address)} · Confirmed` : `${esc(e.address)} · Not confirmed yet`;
  const tgLine = !t.configured ? "Telegram isn't set up on this site yet." : t.linked ? `Connected as ${t.username ? "@" + esc(t.username) : "your Telegram account"}` : "Not connected";
  const tgBtns = !t.configured ? "" : t.linked
    ? `<button class="btn sm" type="button" data-act="tgtest">Send test</button><button class="btn sm ghost" type="button" data-act="tgunlink">Disconnect</button>`
    : UI.tgLink ? `<a class="btn sm primary" id="tgOpen" href="${esc(UI.tgLink.url)}" target="_blank" rel="noopener">${IC.send}Open Telegram and press Start</a>`
    : `<button class="btn sm primary" type="button" data-act="tglink">${IC.send}Connect Telegram</button>`;
  return `<div class="chan">
      <div class="int" id="chEmail"><span class="lg">${IC.mail}</span><div><b>Email</b><span>${emailLine}</span></div>
        ${e.configured && !e.verified ? `<button class="btn sm" type="button" data-act="chverify">Send confirmation email</button>` : ""}${e.configured && e.verified ? `<button class="btn sm" type="button" data-act="chtestemail">Send test</button>` : ""}
        <label class="toggle"><input type="checkbox" id="ch-email" ${p.email !== false ? "checked" : ""} ${e.configured ? "" : "disabled"}><span class="ch-on">Reminders</span><span class="sr"> (send reminders by email)</span></label></div>
      <div class="int" id="chTg"><span class="lg">${IC.send}</span><div><b>Telegram</b><span>${tgLine}${UI.tgLink && !t.linked ? ". Press Start in the bot; this page updates by itself." : ""}</span></div>${tgBtns}
        <label class="toggle"><input type="checkbox" id="ch-tg" ${p.telegram !== false ? "checked" : ""} ${t.configured ? "" : "disabled"}><span class="ch-on">Reminders</span><span class="sr"> (send reminders to telegram)</span></label></div>
      <p class="muted chan-h">What goes to email and Telegram:</p>
      <div class="f2">
        <label class="toggle"><input type="checkbox" id="pf-deadline" ${p.deadline !== false ? "checked" : ""}>Deadline reminders</label>
        <label class="toggle"><input type="checkbox" id="pf-study" ${p.study !== false ? "checked" : ""}>Study reminders and daily summary</label>
        <label class="toggle"><input type="checkbox" id="pf-account" ${p.account !== false ? "checked" : ""}>Account messages (password changes)</label>
      </div>
      ${e.configured && !e.verified ? `<p class="note">${IC.info}<span>Reminders go to your email once you confirm the address. Password reset emails always arrive.</span></p>` : ""}
    </div>`;
}
const PAGE = { overview: "Overview", deadlines: "My Deadlines", mywork: "My Work", exams: "Exams", calendar: "Calendar", planner: "Planner", reports: "Reports", prefs: "Settings", team: "Team Deadlines", workload: "Workload", approvals: "Approvals" };
function renderTop(){
  const w = W();
  const label = (navFor(w).find(x => x[0] === UI.route) || [0, PAGE[UI.route]])[1];
  $("#pageTitle").textContent = label;
  $("#pageSub").textContent = `${w.name} · ${MODE_LABEL[w.mode]}`;
  const dark = currentTheme() === "dark"; const tb = $("#themeBtn");
  const lbl = `Switch to ${dark ? "light" : "dark"} mode`;
  if (tb.getAttribute("aria-label") !== lbl || !tb.innerHTML) { tb.setAttribute("aria-label", lbl); tb.title = lbl; tb.innerHTML = dark ? IC.sun : IC.moon; }
  $("#demoTag").innerHTML = w.demo ? `<span class="demo-tag hide-m">Sample data<button type="button" data-act="cleardemo">Clear</button></span>` : "";
  renderBell();
}
function renderBnav(){
  const w = W(); const nav = navFor(w);
  // phone bar: Today, Daily tasks, the deadlines list and the Assistant; everything else is under More
  const pick = ["overview", "daily", "deadlines", "mywork", "assistant"]; const main = pick.map(r => nav.find(x => x[0] === r && !x[2])).filter(Boolean).slice(0, 4);
  $("#bnav").innerHTML = main.map(([r, l]) => `<a href="#${r}" data-route="${r}" aria-current="${UI.route === r ? "page" : "false"}">${NAV_ICON[r]}<span>${l.replace("My ", "").replace("Team Deadlines", "Team").replace("Daily tasks", "Daily")}</span></a>`).join("") +
    `<button type="button" data-act="morenav">${IC.more}<span>More</span></button>`;
}

/* =========================================================
   Item row
   ========================================================= */
function riskBadge(lv, id, asButton){
  const tag = asButton ? "button" : "span";
  return `<${tag} class="risk lv-${lv}" ${asButton ? `type="button" data-act="open" data-id="${id}" title="See why"` : ""}>${LV[lv]}</${tag}>`;
}
function rowHTML(it){
  const { w, R } = CTX;
  const lv = levelOf(R, it), g = groupOf(w, it.groupId), m = memberOf(w, it.assignee), p = progressOf(it), done = isDone(it);
  const mgrReview = it.status === "review";
  const checkLbl = done ? "Mark as not done" : (w.mode === "company" && it.needsApproval && !canManage(w)) ? "Submit for review" : "Mark as done";
  return `<div class="item lv-${lv}${done ? " done" : ""}" data-id="${it.id}">
    <span class="edge" aria-hidden="true"></span>
    <button class="check${mgrReview ? " review" : ""}" type="button" data-act="toggle" aria-label="${checkLbl}: ${esc(it.title)}" ${canEditItem(w, it) ? "" : "disabled"}>${IC.check}</button>
    <button class="body" type="button" data-act="open">
      <span class="t">${esc(it.title)}</span>
      <span class="m">
        ${done ? "" : riskBadge(lv)}
        ${g ? `<span class="chip" style="--c:${g.color}"><i></i>${esc(g.name)}</span>` : ""}
        <span>${TYPES[it.type] || "Task"}</span>
        <span class="pill pr-${it.priority}">${PRI[it.priority].label}</span>
        ${w.mode === "company" && m ? `<span class="row-flex" style="gap:5px">${avatarHTML(m)}${esc(m.id === viewerId(w) ? "You" : m.name.split(" ")[0])}</span>` : ""}
        ${!done && (p > 0 || it.estimate) ? `<span class="row-flex" style="gap:5px"><span class="ring" style="--p:${p}"></span>${p}%${it.estimate ? ` of ${fmtH(it.estimate)}` : ""}</span>` : ""}
        ${it.status === "blocked" ? `<span style="color:var(--risk);font-weight:600">Blocked</span>` : ""}
        ${it.status === "review" ? `<span style="color:var(--att);font-weight:600">In review</span>` : ""}
        ${it.repeat && it.repeat !== "none" ? `<span>Repeats ${it.repeat}</span>` : ""}
        ${it.extension && it.extension.status === "approved" ? `<span class="chip">Extended</span>` : ""}
      </span>
    </button>
    <div class="due">
      <span class="cd lv-${lv}" ${done ? "" : `data-cd="${esc(it.due)}"`}>${done ? (it.doneAt ? `Done ${fmtDate(it.doneAt)}` : "Done") : countdown(it.due, CTX.now)}</span>
      <span class="abs">${fmtDate(it.due)}</span>
    </div>
    <div class="acts">
      ${!done && ["critical", "overdue"].includes(lv) && canEditItem(w, it) ? `<button class="ib" type="button" data-act="rescue" aria-label="Rescue mode" title="Rescue mode" style="color:var(--crit)">${IC.rescue}</button>` : ""}
      ${!done && canEditItem(w, it) ? `<button class="ib" type="button" data-act="focus" aria-label="Start a focus session" title="Start a 25-minute focus session">${IC.planner}</button>` : ""}
      <button class="ib more-ib" type="button" data-act="open" aria-label="Open details" title="Open details">${IC.more}</button>
    </div>
  </div>`;
}

/* =========================================================
   Overview
   ========================================================= */
function greeting(){ const h = new Date().getHours(); return h < 5 ? "Working late" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"; }
function scopeItems(w){ return w.mode === "company" && !canManage(w) ? w.items.filter(i => i.assignee === viewerId(w)) : w.items; }
function radarHTML(w, items){
  const { R, now } = CTX;
  const act = items.filter(i => !isDone(i) && i.due && new Date(i.due).getTime() < now + 21 * DAY);
  const groups = w.groups.length ? w.groups.slice(0, 6) : [];
  const sectors = groups.length ? groups.map(g => ({ id: g.id, name: g.name, color: g.color })) : [{ id: null, name: "", color: "var(--accent)" }];
  const hasOther = act.some(i => !sectors.find(s => s.id === i.groupId));
  if (groups.length && hasOther) sectors.push({ id: "__other", name: "Other", color: "var(--muted)" });
  const n = sectors.length, C = 150, R0 = 22, RMAX = 132;
  const rad = days => days <= 0 ? R0 * .6 : R0 + (RMAX - R0) * Math.sqrt(Math.min(days, 21) / 21);
  const rings = [[1, "1d"], [3, "3d"], [7, "7d"], [14, "14d"], [21, "21d"]];
  let blips = ""; const placed = [];
  act.forEach(it => {
    const si = Math.max(0, sectors.findIndex(s => s.id === it.groupId || (s.id === "__other" && !groups.find(g => g.id === it.groupId)) || (s.id === null)));
    const days = (new Date(it.due).getTime() - now) / DAY;
    const r = rad(days);
    const jitter = (hueOf(it.id) % 100) / 100;
    const size = it.priority === "high" ? 7 : it.priority === "medium" ? 5.5 : 4.5;
    // Dots due at the same time in the same sector would sit on top of each other (the lower one couldn't be
    // clicked): move a colliding dot sideways within its sector, then slightly outward if the sector is full.
    let a = (si + .15 + jitter * .7) / n * Math.PI * 2 - Math.PI / 2, rr = r, x = C + Math.cos(a) * rr, y = C + Math.sin(a) * rr;
    const hits = () => placed.some(p => Math.hypot(p.x - x, p.y - y) < p.s + size + 1.5);
    for (let k = 1; k <= 40 && hits(); k++) {
      const step = (size * 2.2) / Math.max(rr, 12), off = Math.ceil(k / 2) * step * (k % 2 ? 1 : -1);
      const lo = (si + .04) / n * Math.PI * 2 - Math.PI / 2, hi = (si + .96) / n * Math.PI * 2 - Math.PI / 2;
      a = Math.min(hi, Math.max(lo, (si + .15 + jitter * .7) / n * Math.PI * 2 - Math.PI / 2 + off));
      if (k > 20) rr = Math.min(RMAX + 10, r + (k - 20) * 1.5);
      x = C + Math.cos(a) * rr; y = C + Math.sin(a) * rr;
    }
    placed.push({ x, y, s: size });
    const lv = R[it.id].level; const col = `var(--${{ ontrack: "ok", attention: "att", risk: "risk", critical: "crit", overdue: "over" }[lv]})`;
    if (lv === "critical" || lv === "overdue") blips += `<circle class="halo" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${size}" fill="${col}"/>`;
    blips += `<circle class="blip" data-act="open" data-id="${it.id}" data-tip="${esc(it.title)} · ${LV[lv]} · ${esc(countdown(it.due, now))}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${size}" fill="${col}" stroke="var(--surface)" stroke-width="1.5" tabindex="0" role="button" aria-label="${esc(it.title)}, ${LV[lv]}"/>`;
  });
  const secLines = n > 1 ? sectors.map((s, i) => { const a = i / n * Math.PI * 2 - Math.PI / 2; return `<line class="sector" x1="${C}" y1="${C}" x2="${C + Math.cos(a) * RMAX}" y2="${C + Math.sin(a) * RMAX}"/>`; }).join("") : "";
  const secLbls = n > 1 ? sectors.map((s, i) => { const a = (i + .5) / n * Math.PI * 2 - Math.PI / 2; const x = C + Math.cos(a) * (RMAX + 12), y = C + Math.sin(a) * (RMAX + 12); return `<text class="seclbl" x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${Math.abs(Math.cos(a)) < .3 ? "middle" : Math.cos(a) > 0 ? "start" : "end"}" dominant-baseline="middle">${esc(s.name.length > 14 ? s.name.slice(0, 13) + "…" : s.name)}</text>`; }).join("") : "";
  const counts = {}; LEVELS.forEach(l => counts[l] = 0); act.forEach(i => counts[R[i.id].level]++);
  const allAct = items.filter(i => !isDone(i) && i.due); const allCounts = {}; LEVELS.forEach(l => allCounts[l] = 0); allAct.forEach(i => allCounts[R[i.id].level]++);
  return `<div class="radar-wrap">
    <div class="radar" id="radar">
      <svg viewBox="-30 -20 360 340" role="img" aria-label="Deadline radar: deadlines placed by time left, coloured by risk">
        <defs><radialGradient id="sweepGrad" cx="150" cy="150" r="132" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="var(--accent)" stop-opacity=".0"/><stop offset="1" stop-color="var(--accent)" stop-opacity=".12"/></radialGradient></defs>
        ${rings.map(([d, l]) => `<circle class="ring" cx="${C}" cy="${C}" r="${rad(d).toFixed(1)}"/><text class="ringlbl" x="${C + 3}" y="${(C - rad(d) + 10).toFixed(1)}">${l}</text>`).join("")}
        <path class="sweep" d="M${C} ${C} L${C} ${C - RMAX} A${RMAX} ${RMAX} 0 0 1 ${(C + RMAX * Math.sin(Math.PI / 5)).toFixed(1)} ${(C - RMAX * Math.cos(Math.PI / 5)).toFixed(1)} Z">${matchMedia("(prefers-reduced-motion: reduce)").matches ? "" : `<animateTransform attributeName="transform" type="rotate" from="0 ${C} ${C}" to="360 ${C} ${C}" dur="7s" repeatCount="indefinite"/>`}</path>
        ${secLines}${secLbls}
        <circle cx="${C}" cy="${C}" r="${R0 * .6}" fill="color-mix(in srgb,var(--over) 14%,transparent)"/>
        ${blips}
      </svg>
      <div class="radar-tip" id="radarTip" hidden></div>
    </div>
    <div class="legend">
      ${["overdue", "critical", "risk", "attention", "ontrack"].map(l => `<button type="button" class="lv-${l}" data-act="riskgo" data-lv="${l}"><i></i><span class="lt">${LV[l]}</span><b>${allCounts[l]}</b></button>`).join("")}
    </div>
    <p class="note">${IC.info}<span>Closer to the centre means less time left (next 21 days). Risk uses your estimates, progress, available hours and blockers. It's rule-based; tune it in Settings.</span></p>
  </div>`;
}
function timelineHTML(w, items){
  const { R, now } = CTX; const sod = startOfDay(now);
  return `<div class="timeline">${Array.from({ length: 14 }, (_, k) => {
    const d = addDays(sod, k); const key = ymd(d);
    const list = items.filter(i => !isDone(i) && i.due && ymd(new Date(i.due)) === key);
    return `<div class="tl-day${k === 0 ? " today" : ""}${[0, 6].includes(d.getDay()) ? " wkend" : ""}"><span class="tl-d">${d.toLocaleDateString(undefined, { weekday: "short" })}<b>${d.getDate()}</b></span>
      ${list.slice(0, 4).map(i => { const g = groupOf(w, i.groupId); return `<button class="tl-pip lv-${levelOf(R, i)}" type="button" data-act="open" data-id="${i.id}" style="--c:${g ? g.color : "var(--accent)"}" title="${esc(i.title)} · ${fmtTime(i.due)}" aria-label="${esc(i.title)}"></button>`; }).join("")}
      ${list.length > 4 ? `<span class="tl-d">+${list.length - 4}</span>` : ""}</div>`;
  }).join("")}</div>`;
}
function loadBarsHTML(w){
  const { now } = CTX;
  const P = planFor(w, now, viewerId(w), 7);
  const max = Math.max(P.hpd * 1.25, ...P.days.map(d => d.total), 1);
  const H = 92;
  return `<div class="load-bars">${P.days.map((d, k) => {
    const segs = d.sessions.map(s => { const it = findItem(s.id, w); const g = it && groupOf(w, it.groupId); return `<span style="--c:${g ? g.color : "var(--accent)"};height:${(s.h / max * H).toFixed(1)}px" title="${esc(it ? it.title : "")}: ${fmtH(s.h)}"></span>`; }).join("");
    return `<div class="lb${d.total > d.cap + .01 ? " over" : ""}"><span class="val">${d.total ? fmtH(d.total) : ""}</span><div class="stackb" style="height:${Math.max(d.total / max * H, 2).toFixed(1)}px">${segs}</div><span class="lbl">${k === 0 ? "Today" : d.date.toLocaleDateString(undefined, { weekday: "short" })}</span></div>`;
  }).join("")}<div class="cap" style="bottom:${(18 + P.hpd / max * H).toFixed(1)}px" title="Daily capacity ${fmtH(P.hpd)}"></div></div>
  <p class="note" style="margin-top:8px">${IC.info}<span>Planned hours per day from your estimates. The dashed line is your ${fmtH(P.hpd)} daily capacity. <a href="#planner" data-route="planner">Open the planner</a></span></p>`;
}
function headsHTML(w){
  const list = conflicts(w, CTX.now);
  if (!list.length) return "";
  const open = !!UI.headsOpen;
  return `<section class="card heads-card"><button class="heads-sum" id="headsToggle" type="button" data-act="headstoggle" aria-expanded="${open}" aria-controls="headsList"><span class="warn">${IC.alert}</span>${list.length} thing${list.length > 1 ? "s" : ""} need${list.length > 1 ? "" : "s"} your attention<span class="chev">${IC.chev}</span></button>
    ${open ? `<div class="heads" id="headsList">${list.slice(0, 5).map(c => `<div class="head">${IC.alert}<div><p>${esc(c.text)}</p><p class="muted" style="font-size:12.5px;margin-top:2px">${esc(c.tip)}</p>
      <div class="row-flex">${c.kind === "over" && canManage(w) ? `<button class="btn xs" type="button" data-route="workload">Open workload</button>` : `<button class="btn xs" type="button" data-route="planner">Open planner</button>`}
      ${c.kind === "short" ? `<button class="btn xs" type="button" data-act="rescue" data-id="${c.ids[0]}">Rescue mode</button>` : ""}</div></div></div>`).join("")}</div>` : ""}</section>`;
}
// Four plain numbers for the week, from your own deadlines (in a team workspace: the ones assigned to you).
function weekStats(w, now, R){
  const mine = w.items.filter(i => w.mode !== "company" || i.assignee === viewerId(w));
  const open = mine.filter(i => !isDone(i) && i.due), t = i => new Date(i.due).getTime();
  return { week: open.filter(i => t(i) >= now && t(i) < now + 7 * 864e5).length,
    risk: open.filter(i => ["risk", "critical"].includes(levelOf(R, i))).length,
    over: open.filter(i => t(i) < now).length,
    done: mine.filter(i => isDone(i) && i.doneAt && now - new Date(i.doneAt).getTime() <= 7 * 864e5).length };
}
function weekStatsHTML(w){
  const S = weekStats(w, CTX.now, CTX.R), r = listRoute();
  const tile = (n, label, cls) => `<a class="wk ${cls}${n ? "" : " zero"}" href="#${r}" data-route="${r}"><b>${n}</b><span>${label}</span></a>`;
  return `<nav class="wk-stats" aria-label="This week">${tile(S.week, "Due this week", "k-week")}${tile(S.risk, "At risk", "k-risk")}${tile(S.over, "Overdue", "k-over")}${tile(S.done, "Done in 7 days", "k-done")}</nav>`;
}
function helloHTML(name, w){
  return `<div class="hello hero">
    <div class="hero-main"><p class="today">${esc(new Date(CTX.now).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" }))}</p><h2>${greeting()}, ${esc((name || "there").split(" ")[0])}</h2>
      ${addBoxHTML("addText")}</div>
    ${w ? weekStatsHTML(w) : ""}
  </div>`;
}
// Today's tasks: planned for today, due today, or unfinished from an earlier day.
function todayCard(w){
  const P = todayProgress(w, CTX.now);
  return `<section class="card today-card" id="todayCard"><div class="card-h"><div class="th-ring sm">${progressRing(P.done, P.total, 40)}</div><h3>${P.total && P.done === P.total ? "All done for today" : "Today"}</h3><span class="sub" id="todoProgress">${P.done} of ${P.total} done</span></div>
    ${todoTabsHTML(w)}</section>`;
}
// The next few deadlines: overdue first, then soonest. The progress check-in sits here as one compact row.
function nextDlHTML(w){
  const { now, R } = CTX;
  const list = w.items.filter(i => !isDone(i) && i.due && (w.mode !== "company" || i.assignee === viewerId(w)))
    .sort((a, b) => (new Date(b.due) < now) - (new Date(a.due) < now) || new Date(a.due) - new Date(b.due)).slice(0, 5);
  const when = i => { const t = new Date(i.due).getTime(); if (t < now) return `<span class="nd-late">Overdue · was due ${esc(fmtDate(i.due))}</span>`; const d = relDay(i.due, now); return `Due ${d === "today" || d === "tomorrow" ? d : esc(fmtDate(i.due))}, ${esc(fmtTime(i.due))}`; };
  return `<section class="card" id="nextDl"><div class="card-h"><h3>Next deadlines</h3><a class="sub" href="#${listRoute()}" data-route="${listRoute()}">All deadlines</a></div>
    ${checkinHTML(w)}
    ${list.length ? `<div class="nd-list">${list.map(i => { const lv = levelOf(R, i); return `<div class="nd-row lv-${lv}" data-id="${i.id}"><span class="edge" aria-hidden="true"></span><button class="nd-main" type="button" data-act="open"><span class="t">${esc(i.title)}</span><span class="m">${when(i)}</span></button>${["risk", "critical"].includes(lv) ? riskBadge(lv) : ""}</div>`; }).join("")}</div>`
      : `<div class="empty sm"><p>No deadlines coming up. Say “due” in the box above to add one.</p></div>`}</section>`;
}
function checkinHTML(w){
  const it = checkinCandidate(w, CTX.now); if (!it) return "";
  const p = progressOf(it); const late = new Date(it.due).getTime() < CTX.now;
  return `<div class="checkin" id="checkin" data-id="${it.id}"><p class="ck-q">How far along is <b>${esc(it.title)}</b>? It ${late ? "was due" : "is due"} ${relDay(it.due, CTX.now)}${p ? `; last update said ${p}%` : ""}.</p>
    <div class="ck-a" role="group" aria-label="Progress for ${esc(it.title)}">${[0, 25, 50, 75].map(v => `<button class="btn xs${v === p ? " on" : ""}" type="button" data-act="checkin" data-v="${v}">${v}%</button>`).join("")}<button class="btn xs primary" type="button" data-act="checkin" data-v="done">Done</button><button class="btn xs ghost" type="button" data-act="checkinlater">Not now</button></div></div>`;
}
function radarCard(w, items, sub){ return `<section class="card"><div class="card-h"><h3>Deadline Radar</h3><span class="sub">${sub}</span></div>${radarHTML(w, items)}</section>`; }
// Home for every workspace: greeting + Add box, one heads-up line, today's tasks, next deadlines.
function todayView(w){
  const me = memberOf(w, viewerId(w));
  const n = w.mode === "company" && canManage(w) ? attentionCount(attentionOf(w, CTX.now)) : 0;
  return `${helloHTML(w.mode === "company" && me ? me.name : state.user.name, w)}
    ${w.mode === "company" && canManage(w) ? (n ? `<button class="card heads-sum attn-line" id="attnLine" type="button" data-route="approvals"><span class="warn">${IC.alert}</span>${n} thing${n === 1 ? "" : "s"} need${n === 1 ? "s" : ""} your attention<span class="chev">${IC.forward}</span></button>` : "") : headsHTML(w)}
    <div class="grid-2">${todayCard(w)}${nextDlHTML(w)}</div>`;
}
function activityHTML(w, n){
  const list = (w.activity || []).slice(0, n);
  if (!list.length) return `<p class="muted">No activity yet.</p>`;
  return `<div class="feed"><ul>${list.map(a => { const m = memberOf(w, a.who); return `<li>${avatarHTML(m || { name: "?" })}<div style="flex:1;min-width:0"><span>${esc(a.text)}</span></div><time>${ago(a.t, CTX.now)}</time></li>`; }).join("")}</ul></div>`;
}

/* =========================================================
   Deadline list
   ========================================================= */
function listItems(w, mine){
  const { now, R } = CTX; const q = UI.q.trim().toLowerCase(); const f = UI.f;
  return w.items.filter(it => {
    if (!it.due) return false;
    if (mine && it.assignee !== viewerId(w)) return false;
    if (f.status === "active" && isDone(it)) return false;
    if (f.status === "done" && !isDone(it)) return false;
    if (f.type !== "all" && it.type !== f.type) return false;
    if (f.group !== "all" && (it.groupId || "none") !== f.group) return false;
    if (f.who !== "all" && it.assignee !== f.who) return false;
    if (f.risk !== "all") {
      const lv = levelOf(R, it);
      if (f.risk === "today") { const t = new Date(it.due).getTime(); if (isDone(it) || t < now || t >= startOfDay(now).getTime() + DAY) return false; }
      else if (f.risk === "week") { const t = new Date(it.due).getTime(); if (isDone(it) || t < now || t >= now + 7 * DAY) return false; }
      else if (f.risk === "risk") { if (!["risk", "critical"].includes(lv)) return false; }
      else if (f.risk === "needs") { if (!["risk", "critical", "overdue"].includes(lv)) return false; }
      else if (lv !== f.risk) return false;
    }
    if (q) { const g = groupOf(w, it.groupId); const m = memberOf(w, it.assignee); if (!`${it.title} ${it.notes} ${g ? g.name : ""} ${m ? m.name : ""} ${TYPES[it.type]}`.toLowerCase().includes(q)) return false; }
    return true;
  });
}
function sortItems(list){
  const { R } = CTX;
  const by = {
    due: (a, b) => new Date(a.due) - new Date(b.due),
    priority: (a, b) => PRI[a.priority].rank - PRI[b.priority].rank || new Date(a.due) - new Date(b.due),
    risk: (a, b) => LEVELS.indexOf(levelOf(R, b)) - LEVELS.indexOf(levelOf(R, a)) || new Date(a.due) - new Date(b.due),
    created: (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  }[UI.sort];
  return list.sort((a, b) => isDone(a) && isDone(b) ? new Date(b.doneAt || 0) - new Date(a.doneAt || 0) : by(a, b));
}
function viewList(mine){
  const w = W(); const { now, R } = CTX;
  const items = sortItems(listItems(w, mine));
  const f = UI.f; const gw = GROUP_WORD[w.mode];
  const types = TYPES_BY_MODE[w.mode];
  const nOn = (f.type !== "all") + (f.group !== "all") + (f.who !== "all") + (UI.groupBy !== "time") + (UI.sort !== "due");
  const filtersActive = nOn || f.risk !== "all" || UI.q;
  const riskLbl = { today: "Due today", week: "Next 7 days", risk: "At risk", needs: "At risk or late", overdue: "Overdue", critical: "Critical", attention: "Needs attention", ontrack: "On track" };
  let groups = [];
  if (UI.groupBy === "time") {
    const sod = startOfDay(now).getTime();
    const B = it => { if (isDone(it)) return "done"; const t = new Date(it.due).getTime(); if (t < now) return "overdue"; if (t < sod + DAY) return "today"; if (t < sod + 2 * DAY) return "tomorrow"; if (t < sod + 8 * DAY) return "week"; return "later"; };
    const lbl = { overdue: ["Overdue", "var(--over)"], today: ["Due today", "var(--att)"], tomorrow: ["Tomorrow", "var(--accent)"], week: ["This week", "var(--accent)"], later: ["Later", "var(--ok)"], done: ["Completed", "var(--muted)"] };
    Object.keys(lbl).forEach(k => { const l = items.filter(i => B(i) === k); if (l.length) groups.push([lbl[k][0], lbl[k][1], l]); });
  } else if (UI.groupBy === "risk") {
    ["overdue", "critical", "risk", "attention", "ontrack", "done"].forEach(lv => { const l = items.filter(i => levelOf(R, i) === lv); if (l.length) groups.push([LV[lv], `var(--${{ overdue: "over", critical: "crit", risk: "risk", attention: "att", ontrack: "ok", done: "muted" }[lv]})`, l]); });
  } else {
    w.groups.forEach(g => { const l = items.filter(i => i.groupId === g.id); if (l.length) groups.push([g.name, g.color, l]); });
    const none = items.filter(i => !groupOf(w, i.groupId)); if (none.length) groups.push([`No ${gw.toLowerCase()}`, "var(--muted)", none]);
  }
  const radarItems = mine ? w.items.filter(i => i.assignee === viewerId(w)) : scopeItems(w);
  return `
    ${radarItems.some(i => !isDone(i) && i.due) ? radarCard(w, radarItems, w.mode === "company" && !mine ? "Whole team, next 3 weeks" : "Next 3 weeks") : ""}
    <div class="filters">
      <label class="search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input id="listSearch" type="search" placeholder="Search deadlines" value="${esc(UI.q)}" aria-label="Search deadlines"></label>
      <div class="seg" role="group" aria-label="Status">${[["active", "Active"], ["done", "Completed"], ["all", "All"]].map(([v, l]) => `<button type="button" data-act="fstatus" data-v="${v}" aria-pressed="${f.status === v}">${l}</button>`).join("")}</div>
      <button class="btn" id="filtersBtn" type="button" data-act="filters" aria-expanded="${!!UI.filtersOpen}" aria-controls="filterPanel"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M7 12h10M10 18h4"/></svg>Filters${nOn ? ` · ${nOn}` : ""}</button>
      ${f.risk !== "all" ? `<button class="activef" type="button" data-act="frisk" data-v="all" aria-label="Remove filter ${riskLbl[f.risk] || f.risk}">${riskLbl[f.risk] || f.risk} ✕</button>` : ""}
      ${filtersActive ? `<button class="btn ghost sm" type="button" data-act="fclear">Clear</button>` : ""}
    </div>
    ${UI.filtersOpen ? `<div class="filter-panel" id="filterPanel">
      <div class="row-flex">
        <div class="seg" role="group" aria-label="Group by">${[["time", "By time"], ["risk", "By risk"], ["group", `By ${gw.toLowerCase()}`]].map(([v, l]) => `<button type="button" data-act="groupby" data-v="${v}" aria-pressed="${UI.groupBy === v}">${l}</button>`).join("")}</div>
        <select id="sortSel" aria-label="Sort">${[["due", "Sort: due date"], ["risk", "Sort: risk"], ["priority", "Sort: priority"], ["created", "Sort: newest"]].map(([v, l]) => `<option value="${v}" ${UI.sort === v ? "selected" : ""}>${l}</option>`).join("")}</select>
        ${w.mode === "company" && !mine ? `<select id="whoSel" aria-label="Assignee"><option value="all">Everyone</option>${w.members.map(m => `<option value="${m.id}" ${f.who === m.id ? "selected" : ""}>${esc(m.name)}</option>`).join("")}</select>` : ""}
      </div>
      <div class="fchips">
        ${types.map(t => `<button class="fchip" type="button" data-act="ftype" data-v="${t}" aria-pressed="${f.type === t}">${TYPES[t]}</button>`).join("")}
        ${w.groups.length ? `<span style="width:8px"></span>` : ""}
        ${w.groups.map(g => `<button class="fchip" type="button" data-act="fgroup" data-v="${g.id}" aria-pressed="${f.group === g.id}" style="--c:${g.color}"><i></i>${esc(g.name)}</button>`).join("")}
      </div>
    </div>` : ""}
    <div class="list">
      ${groups.length ? groups.map(([l, c, list]) => `<div class="ghead" style="--rc:${c}"><i></i>${esc(l)}<span class="n">${list.length}</span></div>${list.map(rowHTML).join("")}`).join("")
        : (() => { const dl = w.items.filter(i => i.due && (!mine || i.assignee === viewerId(w)));
          // "Nothing matches" only when the person narrowed the list; otherwise say what's actually true.
          if (filtersActive || f.status === "done") return `<div class="empty">${IC.inbox}<h3>Nothing matches</h3><p>Try a different filter or search.</p><button class="btn" type="button" data-act="fclear">Clear filters</button></div>`;
          if (dl.length) return `<div class="empty">${IC.check}<h3>All done</h3><p>Every deadline here is finished.</p><button class="btn" type="button" data-act="fstatus" data-v="done">See completed</button></div>`;
          return `<div class="empty">${IC.inbox}<h3>No deadlines yet</h3><p>Type something like “DBMS assignment due next Friday 5pm”. Say “due” and it becomes a deadline.</p><button class="btn primary" type="button" data-act="qa">${IC.plus}Add a deadline</button></div>`; })()}
    </div>`;
}

/* =========================================================
   Exams
   ========================================================= */
function examCountdown(due, now){
  const ms = Math.max(0, new Date(due).getTime() - now);
  return [Math.floor(ms / DAY), Math.floor(ms % DAY / HOUR), Math.floor(ms % HOUR / MIN), Math.floor(ms % MIN / 1000)];
}
function viewExams(){
  const w = W(); const { now, R } = CTX;
  const up = w.items.filter(i => i.type === "exam" && !isDone(i)).sort((a, b) => new Date(a.due) - new Date(b.due));
  const past = w.items.filter(i => i.type === "exam" && isDone(i)).sort((a, b) => new Date(b.due) - new Date(a.due)).slice(0, 6);
  return `<div class="row-flex"><p class="muted" style="margin-right:auto">Topics are your revision checklist. Preparation progress comes from the topics you tick, weighted by their hours.</p>
      <button class="btn primary" type="button" data-act="qa" data-type="exam">${IC.plus}Add exam</button></div>
    ${up.length ? `<div class="exam-grid">${up.map(e => {
      const g = groupOf(w, e.groupId); const [d, h, m, s] = examCountdown(e.due, now); const p = progressOf(e); const lv = levelOf(R, e);
      return `<article class="exam" style="--c:${g ? g.color : "var(--accent)"}" data-id="${e.id}">
        <div class="eh"><div style="flex:1;min-width:0"><h3>${esc(e.title)}</h3><p>${esc(g ? g.name : "Exam")} · ${fmtDue(e.due)}</p><div class="row-flex" style="margin-top:6px">${riskBadge(lv, e.id, true)}</div></div>
          <span class="ring-wrap"><span class="ring big" style="--p:${p}"></span><span>${p}%</span></span></div>
        <div class="countdown" data-ecd="${esc(e.due)}"><div><b>${d}</b><span>days</span></div><div><b>${h}</b><span>hours</span></div><div><b>${m}</b><span>min</span></div></div>
        <ul class="topics">${(e.milestones || []).map(t => `<li><label><input type="checkbox" id="tp-${t.id}" data-act="mstoggle" data-ms="${t.id}" ${t.done ? "checked" : ""}><span class="${t.done ? "dn" : ""}">${esc(t.text)}</span><span class="muted mono" style="margin-left:auto;font-size:11px">${fmtH(t.hours)}</span></label></li>`).join("") || `<li class="muted" style="font-size:13px">No topics yet. Add the syllabus below.</li>`}</ul>
        <div class="ef"><input type="text" id="addtopic-${e.id}" placeholder="Add a topic" aria-label="Add topic to ${esc(e.title)}" data-addtopic="${e.id}" style="flex:1"><button class="btn sm" type="button" data-act="focus" data-id="${e.id}">${IC.play}Revise</button><button class="btn sm ghost" type="button" data-act="open" data-id="${e.id}">Details</button></div>
      </article>`; }).join("")}</div>`
    : `<div class="card"><div class="empty">${IC.exam}<h3>No upcoming exams</h3><p>Add your next exam and its syllabus topics to get a live countdown and a revision plan.</p><button class="btn primary" type="button" data-act="qa" data-type="exam">${IC.plus}Add exam</button></div></div>`}
    ${past.length ? `<section class="card"><div class="card-h"><h3>Past exams</h3></div><div class="list" style="border:0">${past.map(rowHTML).join("")}</div></section>` : ""}`;
}

/* =========================================================
   Calendar
   ========================================================= */
function viewCalendar(){
  const w = W(); const { now, R } = CTX;
  if (!UI.calMonth) UI.calMonth = new Date(new Date(now).getFullYear(), new Date(now).getMonth(), 1);
  if (!UI.calWeek) { const t = startOfDay(now); UI.calWeek = addDays(t, -((t.getDay() + 6) % 7)); }
  // Deadlines on their due day; tasks without a deadline on the day they're planned for.
  const vis = scopeItems(w).filter(i => i.due || i.plan);
  const calKey = i => i.due ? ymd(new Date(i.due)) : i.plan;
  const calT = i => i.due ? fmtTime(i.due) : i.time ? fmtTime(`${i.plan}T${i.time}`) : "Task";
  const byDay = {}; vis.forEach(i => { const k = calKey(i); (byDay[k] = byDay[k] || []).push(i); });
  Object.values(byDay).forEach(a => a.sort((x, y) => (!x.due) - (!y.due) || (x.due ? new Date(x.due) - new Date(y.due) : (x.time || "").localeCompare(y.time || ""))));
  const P = planFor(w, now, viewerId(w), 21);
  const sessByDay = {}; P.days.forEach(d => sessByDay[d.key] = d.sessions);
  const todayKey = ymd(now);
  const ev = (i) => { const g = groupOf(w, i.groupId); const lv = levelOf(R, i); const what = i.due ? LV[lv] : "Planned task"; return `<div class="ev lv-${lv}${isDone(i) ? " done" : ""}${i.due ? "" : " task"}" role="button" tabindex="0" draggable="${canEditItem(w, i) && !isDone(i)}" data-drag="${i.id}" data-act="open" data-id="${i.id}" style="--c:${g ? g.color : "var(--accent)"}" title="${esc(i.title)} · ${calT(i)} · ${what}" aria-label="${esc(i.title)}, ${calT(i)}, ${what}">${esc(i.title)}</div>`; };
  let body;
  if (UI.calView === "month") {
    const m = UI.calMonth; const first = new Date(m.getFullYear(), m.getMonth(), 1); const start = addDays(first, -((first.getDay() + 6) % 7));
    let cells = "";
    for (let k = 0; k < 42; k++) {
      const d = addDays(start, k); const key = ymd(d); const list = byDay[key] || [];
      cells += `<div class="mday${d.getMonth() !== m.getMonth() ? " out" : ""}${key === todayKey ? " today" : ""}" data-day="${key}">
        <div class="dh"><span class="dn">${d.getDate()}</span><button class="add" type="button" data-act="qa" data-date="${key}" aria-label="Add on ${esc(fmtDate(d, { day: "numeric", month: "long" }))}">+</button></div>
        ${list.slice(0, 3).map(ev).join("")}${list.length > 3 ? `<button class="more" type="button" data-act="calweek" data-date="${key}">+${list.length - 3} more</button>` : ""}</div>`;
    }
    body = `<div class="dow">${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(d => `<div>${d}</div>`).join("")}</div><div class="mgrid">${cells}</div>`;
  } else {
    body = `<div class="wgrid">${Array.from({ length: 7 }, (_, k) => {
      const d = addDays(UI.calWeek, k); const key = ymd(d); const list = byDay[key] || []; const ss = sessByDay[key] || [];
      return `<div class="wcol${key === todayKey ? " today" : ""}" data-day="${key}"><h4>${d.toLocaleDateString(undefined, { weekday: "short", day: "numeric" })}<span>${list.length ? list.length + " due" : ""}</span></h4>
        ${list.map(i => { const g = groupOf(w, i.groupId); const lv = levelOf(R, i); const what = i.due ? LV[lv] : "Planned task"; return `<div class="wcard${i.due ? "" : " task"}" role="button" tabindex="0" draggable="${canEditItem(w, i) && !isDone(i)}" data-drag="${i.id}" data-act="open" data-id="${i.id}" style="--c:${g ? g.color : "var(--accent)"}" aria-label="${esc(i.title)}, ${calT(i)}, ${what}"><b>${esc(i.title)}</b><span>${calT(i)} · ${what}</span></div>`; }).join("")}
        ${ss.map(s => { const it = findItem(s.id, w); if (!it) return ""; const g = groupOf(w, it.groupId); return `<div class="wcard sess" style="--c:${g ? g.color : "var(--accent)"}"><b>Work on: ${esc(it.title)}</b><span>Planned ${fmtH(s.h)}</span></div>`; }).join("")}
        <button class="btn ghost xs" type="button" data-act="qa" data-date="${key}" style="margin-top:auto">${IC.plus}Add</button></div>`;
    }).join("")}</div>`;
  }
  const title = UI.calView === "month" ? UI.calMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" }) : `${fmtDate(UI.calWeek, { day: "numeric", month: "short" })} – ${fmtDate(addDays(UI.calWeek, 6), { day: "numeric", month: "short", year: "numeric" })}`;
  return `<div class="cal"><div class="cal-h"><h2>${esc(title)}</h2>
      <div class="seg" role="group" aria-label="Calendar view">${[["month", "Month"], ["week", "Week"]].map(([v, l]) => `<button type="button" data-act="calview" data-v="${v}" aria-pressed="${UI.calView === v}">${l}</button>`).join("")}</div>
      <button class="btn sm" type="button" data-act="calprev" aria-label="Previous">‹</button><button class="btn sm" type="button" data-act="caltoday">Today</button><button class="btn sm" type="button" data-act="calnext" aria-label="Next">›</button></div>
      ${body}</div>
    <p class="note">${IC.info}<span>Drag a deadline or task to another day to reschedule it (you can undo). Tasks without a deadline have a lighter outline. ${UI.calView === "week" ? "Dotted cards are suggested work sessions from the planner." : "Switch to Week to see suggested work sessions."}</span></p>`;
}

/* =========================================================
   Planner & focus
   ========================================================= */
function viewPlanner(){
  const w = W(); const { now, R } = CTX; const who = viewerId(w);
  const P = planFor(w, now, who, 7);
  const word = w.mode === "company" ? "working" : "study";
  const active = w.items.filter(i => !isDone(i) && (w.mode !== "company" || i.assignee === who)).sort((a, b) => new Date(a.due) - new Date(b.due));
  const F = UI.focus;
  const fItem = F ? findItem(F.id, w) : null;
  const left = F ? Math.max(0, F.running ? (F.endAt - now) / 1000 : F.left) : 25 * 60;
  const tot = F ? F.total : 25 * 60;
  const circ = 2 * Math.PI * 56;
  const shortList = Object.entries(P.short).map(([id, h]) => [findItem(id, w), h]).filter(x => x[0]);
  const planEmpty = !active.some(i => i.due);
  const emptyCard = `<section class="card empty-card"><h3>Nothing to plan yet</h3>
    <p class="muted">Add a deadline and say how long it takes, like “Essay due Friday 5pm ~3h”. The planner then spreads the work over your free ${word} time before it's due, and you can start a focus session from here.</p>
    <div class="row-flex"><button class="btn primary" type="button" data-act="qa" data-type="deadline">${IC.plus}Add a deadline</button><a class="btn ghost" href="#prefs" data-route="prefs">Set your ${word} hours</a></div></section>`;
  return `
    <section class="card focus-card">
      <div class="fring"><svg viewBox="0 0 132 132"><circle class="tr" cx="66" cy="66" r="56"/><circle class="pr" id="fringPr" cx="66" cy="66" r="56" stroke-dasharray="${circ.toFixed(1)}" stroke-dashoffset="${(circ * (1 - left / tot)).toFixed(1)}"/></svg><div class="tm mono" id="fringTm">${pad(Math.floor(left / 60))}:${pad(Math.floor(left % 60))}</div></div>
      <div style="display:grid;gap:10px">
        <h3 style="font-size:18px">${F ? (F.running ? "Focusing on" : "Paused:") + " " + esc(fItem ? fItem.title : "") : "Focus session"}</h3>
        <p class="muted" style="font-size:13.5px">${F ? "Time you finish is logged on the deadline and moves its progress forward." : "Pick a deadline and work without switching tasks. Finished minutes are logged and count toward progress."}</p>
        ${F ? `<div class="row-flex"><button class="btn primary" type="button" data-act="fpause">${F.running ? IC.pause + "Pause" : IC.play + "Resume"}</button><button class="btn" type="button" data-act="ffinish">Finish & log</button><button class="btn ghost" type="button" data-act="fstop">Discard</button></div>`
          : !active.length ? `<p class="muted" style="font-size:13.5px">Add a task or deadline first, then pick it here.</p>`
          : `<div class="row-flex"><select id="focusItem" aria-label="Deadline to focus on">${active.map(i => `<option value="${i.id}">${esc(i.title)} (${relDay(i.due, now)})</option>`).join("")}</select>
            <div class="seg" role="group" aria-label="Length">${[25, 50].map(n => `<button type="button" data-act="flen" data-v="${n}" aria-pressed="${(UI.flen || 25) === n}">${n} min</button>`).join("")}</div>
            <button class="btn primary" type="button" data-act="fstart" ${active.length ? "" : "disabled"}>${IC.play}Start</button></div>`}
      </div>
    </section>
    ${planEmpty ? emptyCard : ""}
    <div class="row-flex"><p class="muted" style="margin-right:auto">Suggested sessions for the next 7 days, earliest deadline first, within your ${fmtH(P.hpd)} of ${word} time per day. <a href="#prefs" data-route="prefs">Change availability</a></p></div>
    <div class="plan-days">${P.days.map((d, k) => {
      const segs = d.sessions.map(s => { const it = findItem(s.id, w); const g = it && groupOf(w, it.groupId); return `<span style="--c:${g ? g.color : "var(--accent)"};width:${d.cap ? s.h / d.cap * 100 : 0}%"></span>`; }).join("");
      return `<div class="pday${k === 0 ? " today" : ""}"><div class="ph"><b>${k === 0 ? "Today" : k === 1 ? "Tomorrow" : d.date.toLocaleDateString(undefined, { weekday: "short", day: "numeric" })}</b><span>${fmtH(d.total)} / ${fmtH(d.cap)}</span></div>
        <div class="cap-track">${segs}</div>
        ${d.sessions.length ? d.sessions.map(s => { const it = findItem(s.id, w); if (!it) return ""; const g = groupOf(w, it.groupId); return `<div class="sess" style="--c:${g ? g.color : "var(--accent)"}"><b>${esc(it.title)}</b><div class="sm"><span>${fmtH(s.h)} · due ${relDay(it.due, now)}</span><button class="play" type="button" data-act="focus" data-id="${it.id}">Start</button></div></div>`; }).join("") : `<p class="muted" style="font-size:12.5px">${d.cap ? "Free. Nothing to schedule." : "Day off"}</p>`}
      </div>`; }).join("")}</div>
    <div class="grid-2"${planEmpty ? " hidden" : ""}>
      <section class="card"><div class="card-h"><h3>Won't fit in time</h3><span class="sub">${shortList.length}</span></div>
        ${shortList.length ? shortList.map(([it, h]) => `<div class="head">${IC.alert}<div style="flex:1"><p><b>${esc(it.title)}</b> is about ${fmtH(h)} short before ${fmtDue(it.due)}.</p><div class="row-flex"><button class="btn xs" type="button" data-act="rescue" data-id="${it.id}">Rescue mode</button><button class="btn xs" type="button" data-act="open" data-id="${it.id}">Open</button></div></div></div>`).join("") : `<p class="muted">Everything with an estimate fits before its deadline.</p>`}
      </section>
      <section class="card"><div class="card-h"><h3>Needs an estimate</h3><span class="sub">${P.noEst.length}</span></div>
        ${P.noEst.length ? `<div style="display:grid;gap:8px">${P.noEst.slice(0, 6).map(it => `<div class="row-flex" style="justify-content:space-between"><span style="flex:1;min-width:0;overflow-wrap:anywhere">${esc(it.title)} <span class="muted" style="font-size:12px">· ${relDay(it.due, now)}</span></span><span class="row-flex" style="gap:4px">${[1, 2, 4].map(h => `<button class="btn xs" type="button" data-act="setest" data-id="${it.id}" data-v="${h}">${h}h</button>`).join("")}</span></div>`).join("")}</div>
          <p class="note" style="margin-top:10px">${IC.info}<span>Estimates let the planner schedule work and let the radar warn you early.</span></p>` : `<p class="muted">Every active deadline has an estimate.</p>`}
      </section>
    </div>`;
}

/* =========================================================
   Team board
   ========================================================= */
function viewTeam(){
  const w = W(); const { now, R } = CTX;
  const items = w.items.filter(i => i.due && (UI.boardGroup === "all" || i.groupId === UI.boardGroup) && (UI.f.who === "all" || i.assignee === UI.f.who))
    .filter(i => !isDone(i) || (i.doneAt && now - new Date(i.doneAt).getTime() < 14 * DAY));
  const cols = ["todo", "doing", "blocked", "review", "done"];
  return `<div class="filters">
      <select id="boardGroup" aria-label="Project"><option value="all">All projects</option>${w.groups.map(g => `<option value="${g.id}" ${UI.boardGroup === g.id ? "selected" : ""}>${esc(g.name)}</option>`).join("")}</select>
      <select id="whoSel" aria-label="Assignee"><option value="all">Everyone</option>${w.members.map(m => `<option value="${m.id}" ${UI.f.who === m.id ? "selected" : ""}>${esc(m.name)}</option>`).join("")}</select>
      <span class="muted" style="font-size:13px">Drag cards between columns. ${canManage(w) ? "Dropping a reviewed card on Done approves it." : "You can move your own cards. Done goes through review."}</span>
    </div>
    <div class="board">${cols.map(st => {
      const list = items.filter(i => i.status === st).sort((a, b) => new Date(a.due) - new Date(b.due));
      return `<div class="col" data-col="${st}"><div class="col-h" style="--c:${STATUS_COLOR[st]}"><i></i>${STATUSES[st]}<b>${list.length}</b></div>
        ${list.map(i => { const g = groupOf(w, i.groupId); const m = memberOf(w, i.assignee); const lv = levelOf(R, i); const can = canEditItem(w, i); const p = progressOf(i);
          return `<div class="kcard" draggable="${can}" data-drag="${i.id}" data-act="open" data-id="${i.id}" role="button" tabindex="0" aria-label="${esc(i.title)}, ${STATUSES[st]}">
            ${can ? "" : `<span class="ro">View only</span>`}
            <span class="kt">${esc(i.title)}</span>
            <span class="km">${g ? `<span class="chip" style="--c:${g.color}"><i></i>${esc(g.name)}</span>` : ""}${isDone(i) ? "" : riskBadge(lv)}</span>
            ${p > 0 && !isDone(i) ? `<div class="bar-track"><div class="bar-fill" style="width:${p}%"></div></div>` : ""}
            <span class="kf"><span class="row-flex" style="gap:6px">${avatarHTML(m)}<span style="font-size:12px">${esc(m ? (m.id === viewerId(w) ? "You" : m.name.split(" ")[0]) : "")}</span></span><span class="mono" style="font-size:11.5px;color:${["overdue", "critical"].includes(lv) ? "var(--crit)" : "var(--muted)"}">${isDone(i) ? "Done" : countdown(i.due, now).replace(" left", "")}</span></span>
          </div>`; }).join("") || `<p class="muted" style="font-size:12.5px;padding:6px">Nothing here.</p>`}
      </div>`; }).join("")}</div>`;
}

/* =========================================================
   Workload
   ========================================================= */
function viewWorkload(){
  const w = W(); const { now, R } = CTX; const sod = startOfDay(now);
  const days = Array.from({ length: 14 }, (_, k) => addDays(sod, k));
  const perDayCap = m => (m.capacity || 40) / Math.max(1, w.settings.workdays.length);
  const sugg = rebalance(w, now);
  return `<section class="card"><div class="card-h"><h3>This week's load</h3><span class="sub">Remaining estimated hours due in 7 days vs weekly capacity</span></div>
      ${w.members.map(m => { const L = weekLoad(w, now, m.id); const cls = L.pct > 100 ? "over" : L.pct > 80 ? "warn" : ""; return `<div class="wl-row"><span class="who">${avatarHTML(m)}<span>${esc(m.name)}${m.id === "me" ? " (you)" : ""}</span></span><div class="wl-bar ${cls}"><span style="width:${Math.min(L.pct, 140) / 1.4}%"></span><i style="left:${100 / 1.4}%"></i></div><span class="v">${L.pct}% · ${fmtH(L.hours)}</span></div>`; }).join("")}
    </section>
    ${sugg.length ? `<section class="card"><div class="card-h"><h3>Suggestions</h3><span class="sug-tag">Suggestion</span></div><div class="heads">${sugg.map((s, k) => `<div class="head" style="background:color-mix(in srgb,var(--accent) 7%,transparent);border-color:color-mix(in srgb,var(--accent) 25%,transparent)">${IC.spark}<div style="flex:1"><p>Move <b>${esc(s.item.title)}</b> (${fmtH(remainingH(s.item))}, due ${relDay(s.item.due, now)}) from ${esc(s.from.name)} to ${esc(s.to.name)}, who has about ${fmtH(s.spare)} spare this week.</p>
      <div class="row-flex"><button class="btn xs primary" type="button" data-act="applyreassign" data-id="${s.item.id}" data-to="${s.to.id}">Reassign</button><button class="btn xs" type="button" data-act="open" data-id="${s.item.id}">Open task</button></div></div></div>`).join("")}</div>
      <p class="note" style="margin-top:10px">${IC.info}<span>Nothing changes until you choose Reassign. Talk to both people first.</span></p></section>` : ""}
    <section class="card"><div class="card-h"><h3>Next 14 days</h3><span class="sub">Hours of work due each day. Red means more than one day's capacity.</span></div>
      <div class="heat"><span></span>${days.map(d => `<span class="hd">${d.toLocaleDateString(undefined, { weekday: "narrow" })}<br>${d.getDate()}</span>`).join("")}
      ${w.members.map(m => { const cap = perDayCap(m); return `<span class="who">${avatarHTML(m)}<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(m.name.split(" ")[0])}</span></span>${days.map((d, k) => {
        const h = w.items.filter(i => !isDone(i) && i.assignee === m.id && i.due && ymd(new Date(i.due)) === ymd(d)).reduce((a, i) => a + remainingH(i), 0) + (k === 0 ? w.items.filter(i => !isDone(i) && i.assignee === m.id && new Date(i.due).getTime() < now).reduce((a, i) => a + remainingH(i), 0) : 0);
        return `<span class="cell${h > cap ? " over" : ""}" style="--i:${Math.min(h / cap, 1) * .55}" title="${esc(m.name)} · ${fmtDate(d)}: ${fmtH(h)}">${h ? Math.round(h) : ""}</span>`; }).join("")}`; }).join("")}
      </div></section>
    <div class="member-grid">${w.members.map(m => { const L = weekLoad(w, now, m.id); const act = w.items.filter(i => !isDone(i) && i.assignee === m.id).sort((a, b) => new Date(a.due) - new Date(b.due)); const done30 = w.items.filter(i => isDone(i) && i.assignee === m.id && i.doneAt && now - new Date(i.doneAt).getTime() < 30 * DAY).length;
      return `<section class="card member"><div class="mh">${avatarHTML(m, true)}<div style="flex:1;min-width:0"><b>${esc(m.name)}</b><span>${esc(m.role || "")}${m.dept ? " · " + esc(m.dept) : ""}</span></div><span class="mono" style="font-size:12px;color:${L.pct > 100 ? "var(--crit)" : "var(--muted)"}">${L.pct}%</span></div>
        <div class="row-flex" style="font-size:12px;color:var(--muted);gap:14px"><span>${act.length} active</span><span>${act.filter(i => levelOf(R, i) === "overdue").length} overdue</span><span>${done30} done in 30 days</span></div>
        <ul>${act.slice(0, 5).map(i => `<li><button type="button" data-act="open" data-id="${i.id}"><span>${esc(i.title)}</span>${riskBadge(levelOf(R, i))}</button></li>`).join("") || `<li class="muted" style="font-size:12.5px">No active work.</li>`}</ul></section>`; }).join("")}</div>`;
}
function rebalance(w, now){
  const out = [];
  const loads = w.members.map(m => ({ m, L: weekLoad(w, now, m.id) }));
  loads.filter(x => x.L.pct > 100).forEach(({ m, L }) => {
    const cand = L.items.filter(i => i.status === "todo" && !(i.dependsOn || []).length && i.assignee !== "me").sort((a, b) => PRI[b.priority].rank - PRI[a.priority].rank || new Date(b.due) - new Date(a.due))[0];
    if (!cand) return;
    const best = loads.filter(x => x.m.id !== m.id && x.m.id !== "me").map(x => ({ m: x.m, spare: x.L.cap - x.L.hours })).sort((a, b) => b.spare - a.spare)[0];
    if (best && best.spare >= remainingH(cand)) out.push({ item: cand, from: m, to: best.m, spare: best.spare });
  });
  return out;
}

/* =========================================================
   Approvals
   ========================================================= */
// One queue for managers: work waiting for approval, overdue and blocked work, and people with too much this week.
function attentionOf(w, now){
  return { reviews: w.items.filter(i => i.status === "review"),
    overdue: w.items.filter(i => !isDone(i) && i.due && i.status !== "review" && new Date(i.due).getTime() < now),
    blocked: w.items.filter(i => !isDone(i) && i.status === "blocked"),
    over: w.members.map(m => ({ m, L: weekLoad(w, now, m.id) })).filter(x => x.L.items.length && x.L.pct > 100) };
}
const attentionCount = A => A.reviews.length + A.overdue.length + A.blocked.length + A.over.length;
function viewApprovals(){
  const w = W(); const { now, R } = CTX; const A = attentionOf(w, now);
  const who = i => { const m = memberOf(w, i.assignee); return m ? (m.id === viewerId(w) ? "You" : m.name) : ""; };
  const row = (i, extra) => `<div class="appr" data-id="${i.id}"><div><h4>${esc(i.title)}</h4><div class="row-flex" style="font-size:12.5px;color:var(--muted);margin-top:4px">${avatarHTML(memberOf(w, i.assignee))}${esc(who(i))} · ${extra}</div></div>
    <div class="acts">${["critical", "overdue"].includes(levelOf(R, i)) ? `<button class="btn sm" type="button" data-act="rescue">${IC.rescue}Rescue</button>` : ""}<button class="btn sm ghost" type="button" data-act="open">Open</button></div></div>`;
  const sugg = rebalance(w, now);
  const queue = `<p class="muted">${attentionCount(A) ? `${attentionCount(A)} thing${attentionCount(A) === 1 ? "" : "s"} across the team need${attentionCount(A) === 1 ? "s" : ""} a decision from you.` : "Nothing needs you right now."}</p>
    ${A.overdue.length ? `<section class="card"><div class="card-h"><h3>Overdue</h3><span class="sub">${A.overdue.length}</span></div>${A.overdue.map(i => row(i, `was due ${esc(fmtDue(i.due))}`)).join("")}</section>` : ""}
    ${A.blocked.length ? `<section class="card"><div class="card-h"><h3>Blocked</h3><span class="sub">${A.blocked.length}</span></div>${A.blocked.map(i => row(i, esc(i.notes || "Marked as blocked"))).join("")}</section>` : ""}
    ${A.over.length ? `<section class="card"><div class="card-h"><h3>Overloaded this week</h3><span class="sub">${A.over.length}</span></div>${A.over.map(({ m, L }) => { const s = sugg.find(x => x.from.id === m.id);
      return `<div class="appr"><div><h4>${avatarHTML(m)} ${esc(m.name)}</h4><p class="muted" style="font-size:12.5px">${L.pct}% of capacity: about ${fmtH(L.hours)} due in 7 days.${s ? ` Could move "${esc(s.item.title)}" to ${esc(s.to.name)}.` : ""}</p></div>
        <div class="acts">${s ? `<button class="btn sm primary" type="button" data-act="applyreassign" data-id="${s.item.id}" data-to="${s.to.id}">Reassign</button>` : ""}<button class="btn sm ghost" type="button" data-route="workload">Workload</button></div></div>`; }).join("")}</section>` : ""}`;
  const [intro, rest] = [queue.slice(0, queue.indexOf("</p>") + 4), queue.slice(queue.indexOf("</p>") + 4)];
  const list = viewApprovalsList(w, now); const cut = list.indexOf('<section class="card"><div class="card-h"><h3>Recently decided');
  return intro + (cut < 0 ? list + rest : list.slice(0, cut) + rest + list.slice(cut));
}
function viewApprovalsList(w, now){
  const pending = w.items.filter(i => i.status === "review");
  const decided = w.items.filter(i => i.approval && i.approval.state !== "pending").sort((a, b) => new Date(b.approval.history[0] ? b.approval.history[0].t : 0) - new Date(a.approval.history[0] ? a.approval.history[0].t : 0)).slice(0, 8);
  const hist = i => `<ul class="hist">${(i.approval ? i.approval.history : []).map(h => { const m = memberOf(w, h.by); return `<li>${fmtDue(h.t)} · ${esc(m ? m.name : "")}: ${esc(h.text)}</li>`; }).join("")}</ul>`;
  return `<section class="card"><div class="card-h"><h3>Waiting for your approval</h3><span class="sub">${pending.length}</span></div>
      ${pending.length ? pending.map(i => { const m = memberOf(w, i.assignee); const ev = i.evidence || {}; const late = ev.at && new Date(ev.at) > new Date(i.due);
        return `<div class="appr" data-id="${i.id}"><div><h4>${esc(i.title)}</h4><div class="row-flex" style="font-size:12.5px;color:var(--muted);margin-top:4px">${avatarHTML(m)}${esc(m ? m.name : "")} · submitted ${ev.at ? ago(ev.at, now) : "recently"} · due ${fmtDue(i.due)} ${ev.at ? `<span class="pill ${late ? "pr-high" : "pr-low"}">${late ? "After deadline" : "Before deadline"}</span>` : ""}</div>
          <div class="ev-box">${ev.link ? `<a href="${esc(ev.link)}" target="_blank" rel="noopener">${IC.link.replace("<svg", '<svg width="13" height="13"')} ${esc(ev.link)}</a>` : `<span class="muted">No link attached</span>`}${ev.note ? `<span>${esc(ev.note)}</span>` : ""}</div>${hist(i)}</div>
          <div class="acts"><button class="btn sm primary" type="button" data-act="approve">Approve</button><button class="btn sm" type="button" data-act="changes">Request changes</button><button class="btn sm ghost" type="button" data-act="open">Open</button></div></div>`; }).join("")
        : `<div class="empty">${IC.approvals}<h3>All caught up</h3><p>When someone submits work for review it shows up here.</p></div>`}
    </section>
    ${decided.length ? `<section class="card"><div class="card-h"><h3>Recently decided</h3></div>${decided.map(i => `<div class="appr" data-id="${i.id}"><div><h4>${esc(i.title)}</h4>${hist(i)}</div><div class="acts"><span class="pill ${i.approval.state === "approved" ? "pr-low" : "pr-medium"}" style="${i.approval.state === "approved" ? "color:var(--ok)" : ""}">${i.approval.state === "approved" ? "Approved" : "Changes requested"}</span></div></div>`).join("")}</section>` : ""}`;
}

/* =========================================================
   Reports
   ========================================================= */
// Statistics for the whole account, calculated by the server from the tasks table (all workspaces).
function accountStatsHTML(){
  if (Store.mode !== "server") return "";
  const S = UI.acctStats;
  // Refetched after every save (S.stale) so it matches what you just did on other pages, and at most every 30 s otherwise.
  if (!S || S.stale || Date.now() - S.at > 30000) { if (!UI.acctStatsLoading) { UI.acctStatsLoading = true; apiJSON("GET", "/api/stats").then(r => { UI.acctStatsLoading = false; if (r.ok) { UI.acctStats = { at: Date.now(), d: r.json }; if (UI.route === "reports") render({ soft: true }); } }).catch(() => { UI.acctStatsLoading = false; }); } if (!S) return `<section class="card acct-stats" aria-busy="true"><div class="card-h"><h3>Your account</h3><span class="sub">Loading…</span></div></section>`; }
  const d = S.d; if (!d.total) return "";   // no tasks in any workspace yet: the page's own empty state explains what to do
  const maxW = Math.max(1, ...d.weekly.map(x => x.completed));
  const pr = ["high", "medium", "low"].map(k => `<div class="as-pri"><span class="pdot p-${k}"></span>${k[0].toUpperCase() + k.slice(1)}<b>${d.priorities[k].pending}</b><span class="muted">pending of ${d.priorities[k].total}</span></div>`).join("");
  return `<section class="card acct-stats"><div class="card-h"><h3>Your account</h3><span class="sub">All workspaces · from your saved data</span></div>
    <div class="as-grid">
      <div class="as-k"><span>Total tasks</span><b>${d.total}</b></div><div class="as-k"><span>Completed</span><b>${d.completed}</b></div>
      <div class="as-k"><span>Pending</span><b>${d.pending}</b></div><div class="as-k"><span>Overdue</span><b style="color:${d.overdue ? "var(--over)" : "inherit"}">${d.overdue}</b></div>
      <div class="as-k"><span>Done of all tasks</span><b>${d.completionRate}%</b></div><div class="as-k"><span>On time</span><b>${d.onTimeRate == null ? "–" : d.onTimeRate + "%"}</b></div>
    </div>
    <div class="as-row"><div><p class="as-cap">Completed per week (last 8 weeks)</p><div class="as-weeks" role="img" aria-label="Tasks completed per week, last 8 weeks: ${d.weekly.map(x => `week of ${fmtDate(x.weekStart + "T12:00")} ${x.completed}`).join(", ")}">${d.weekly.map(x => `<span title="Week of ${fmtDate(x.weekStart + "T12:00")}: ${x.completed} completed"><i style="height:${Math.round(x.completed / maxW * 100)}%"></i><em>${x.completed}</em><small>${new Date(x.weekStart + "T12:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</small></span>`).join("")}</div></div>
      <div class="as-pris">${pr}</div></div>
    <p class="muted" style="font-size:12.5px;margin:0">Completed per month: ${d.monthly.map(m => `${new Date(m.month + "-15T12:00").toLocaleDateString("en-GB", { month: "short", year: "2-digit" })}: ${m.completed}`).join(" · ")}</p></section>`;
}
function viewReports(){
  const w = W(); const { now, R } = CTX;
  const items = w.items.filter(i => i.due);
  const done = items.filter(isDone);
  const onTime = done.filter(i => i.doneAt && new Date(i.doneAt) <= new Date(i.due));
  const missed = items.filter(i => !isDone(i) && new Date(i.due).getTime() < now);
  const dueSoFar = done.length + missed.length;
  const compRate = dueSoFar ? Math.round(done.length / dueSoFar * 100) : 0;
  const otRate = done.length ? Math.round(onTime.length / done.length * 100) : 0;
  const lateDays = done.filter(i => i.doneAt).map(i => (new Date(i.doneAt) - new Date(i.due)) / DAY);
  const avgLead = lateDays.length ? -lateDays.reduce((a, b) => a + b, 0) / lateDays.length : 0;
  const weeks = Array.from({ length: 8 }, (_, k) => { const end = startOfDay(now).getTime() + DAY - (7 - k) * 7 * DAY; const start = end - 7 * DAY; return { start, end, on: 0, late: 0 }; });
  done.forEach(i => { const t = new Date(i.doneAt || i.due).getTime(); const wk = weeks.find(x => t >= x.start && t < x.end); if (wk) { if (new Date(i.doneAt || 0) <= new Date(i.due)) wk.on++; else wk.late++; } });
  const maxW = Math.max(3, ...weeks.map(x => x.on + x.late));
  const W_ = 560, H_ = 180, bw = 40, gap = (W_ - 40 - 8 * bw) / 7;
  const chart = `<svg viewBox="0 0 ${W_} ${H_ + 24}" role="img" aria-label="Completed per week, on time and late">
    ${[0, .5, 1].map(f => `<line class="gl" x1="30" x2="${W_}" y1="${(10 + (1 - f) * H_).toFixed(1)}" y2="${(10 + (1 - f) * H_).toFixed(1)}"/><text class="ax" x="24" y="${(14 + (1 - f) * H_).toFixed(1)}" text-anchor="end">${Math.round(maxW * f)}</text>`).join("")}
    ${weeks.map((x, k) => { const X = 40 + k * (bw + gap); const hOn = x.on / maxW * H_, hL = x.late / maxW * H_; return `<rect x="${X}" y="${(10 + H_ - hOn).toFixed(1)}" width="${bw}" height="${hOn.toFixed(1)}" rx="4" fill="var(--ok)"><title>${x.on} on time</title></rect><rect x="${X}" y="${(10 + H_ - hOn - hL).toFixed(1)}" width="${bw}" height="${hL.toFixed(1)}" rx="4" fill="var(--risk)"><title>${x.late} late</title></rect>${x.on + x.late ? `<text class="bv" x="${X + bw / 2}" y="${(4 + H_ - hOn - hL).toFixed(1)}" text-anchor="middle">${x.on + x.late}</text>` : ""}<text class="ax" x="${X + bw / 2}" y="${H_ + 24}" text-anchor="middle">${fmtDate(x.start, { day: "numeric", month: "short" })}</text>`; }).join("")}
  </svg>`;
  const gw = GROUP_WORD[w.mode];
  const byGroup = w.groups.map(g => { const its = items.filter(i => i.groupId === g.id); const d = its.filter(isDone); const ot = d.filter(i => i.doneAt && new Date(i.doneAt) <= new Date(i.due)); const act = its.filter(i => !isDone(i));
    return { g, total: its.length, done: d.length, ot: d.length ? Math.round(ot.length / d.length * 100) : null, prog: its.length ? Math.round(its.reduce((a, i) => a + progressOf(i), 0) / its.length) : 0, risk: act.filter(i => ["risk", "critical", "overdue"].includes(levelOf(R, i))).length }; });
  const dist = {}; LEVELS.forEach(l => dist[l] = 0); items.filter(i => !isDone(i)).forEach(i => dist[levelOf(R, i)]++);
  const distTot = Object.values(dist).reduce((a, b) => a + b, 0) || 1;
  const exams = w.items.filter(i => i.type === "exam" && !isDone(i));
  // A new member with no deadlines: say so plainly instead of showing rates of nothing.
  if (!items.length) return `${accountStatsHTML()}<section class="card empty-card"><h3>No deadlines to report on yet</h3>
    <p class="muted">Reports show how many deadlines you finish, how many on time, and what's at risk. Add a deadline and finish it, and this page fills in by itself.</p>
    <div class="row-flex"><button class="btn primary" type="button" data-act="qa" data-type="deadline">${IC.plus}Add a deadline</button></div></section>`;
  const dash = `<span class="v">–</span>`;
  return `${accountStatsHTML()}<div class="kpis">
      <div class="kpi"><span class="l">Completion rate</span>${dueSoFar ? `<span class="v">${compRate}%</span>` : dash}<span class="h">${dueSoFar ? `${done.length} of ${dueSoFar} deadlines that are already due` : "None of your deadlines is due yet"}</span></div>
      <div class="kpi"><span class="l">On-time rate</span>${done.length ? `<span class="v">${otRate}%</span>` : dash}<span class="h">${done.length ? `${onTime.length} of ${done.length} finished before the deadline` : "Nothing finished yet"}</span></div>
      <div class="kpi"><span class="l">Overdue now</span><span class="v" style="color:${missed.length ? "var(--over)" : "inherit"}">${missed.length}</span><span class="h">${items.filter(i => !isDone(i)).length ? Math.round(missed.length / items.filter(i => !isDone(i)).length * 100) : 0}% of active deadlines</span></div>
      <div class="kpi"><span class="l">Average finish</span>${lateDays.length ? `<span class="v">${Math.abs(avgLead) < .05 ? "On the day" : `${Math.abs(avgLead).toFixed(1)}d`}</span><span class="h">${avgLead >= 0 ? "before" : "after"} the deadline</span>` : `${dash}<span class="h">Nothing finished yet</span>`}</div>
    </div>
    <div class="grid-2">
      <section class="card chart"><div class="card-h"><h3>Completed per week</h3><span class="sub"><span style="color:var(--ok)">■</span> on time <span style="color:var(--risk)">■</span> late</span></div>${chart}</section>
      <section class="card"><div class="card-h"><h3>Current risk mix</h3><span class="sub">${distTot === 1 && !items.filter(i => !isDone(i)).length ? 0 : items.filter(i => !isDone(i)).length} active</span></div>
        <div style="display:flex;height:14px;border-radius:8px;overflow:hidden;margin-bottom:12px">${LEVELS.slice().reverse().map(l => dist[l] ? `<span class="lv-${l}" style="background:var(--rc);width:${dist[l] / distTot * 100}%" title="${LV[l]}: ${dist[l]}"></span>` : "").join("")}</div>
        <div class="legend">${["overdue", "critical", "risk", "attention", "ontrack"].map(l => `<button type="button" class="lv-${l}" data-act="riskgo" data-lv="${l}"><i></i><span class="lt">${LV[l]}</span><b>${dist[l]}</b></button>`).join("")}</div>
      </section>
    </div>
    ${(() => { const rows = TYPES_BY_MODE[w.mode].map(t => ({ t, s: estimateSamples(w, t) })).filter(x => x.s.length);
      if (!rows.length) return "";
      return `<section class="card" id="estAccuracy"><div class="card-h"><h3>Estimate accuracy</h3><span class="sub">From focus time logged on finished work</span></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Type</th><th class="r">Finished</th><th class="r">Actual vs estimate</th><th>What it means</th></tr></thead><tbody>
        ${rows.map(({ t, s }) => { const r = s.reduce((a, i) => a + (i.loggedMin / 60) / i.estimate, 0) / s.length; return `<tr><td>${TYPES[t]}</td><td class="r">${s.length}</td><td class="r">${r.toFixed(1)}×</td><td class="muted">${Math.abs(r - 1) < .15 ? "Your estimates are about right" : r > 1 ? `Plan about ${Math.round((r - 1) * 100)}% more time` : `You finish about ${Math.round((1 - r) * 100)}% faster`}</td></tr>`; }).join("")}
      </tbody></table></div><p class="note" style="margin-top:10px">${IC.info}<span>Use focus sessions while you work so this gets more accurate.</span></p></section>`; })()}
    <section class="card"><div class="card-h"><h3>By ${gw.toLowerCase()}</h3></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>${gw}</th><th class="r">Deadlines</th><th class="r">Done</th><th class="r">On time</th><th>Average progress</th><th class="r">At risk</th></tr></thead><tbody>
      ${byGroup.map(x => `<tr><td><span class="chip" style="--c:${x.g.color}"><i></i>${esc(x.g.name)}</span></td><td class="r">${x.total}</td><td class="r">${x.done}</td><td class="r">${x.ot == null ? "–" : x.ot + "%"}</td><td><div class="row-flex" style="flex-wrap:nowrap"><div class="bar-track" style="flex:1;min-width:80px"><div class="bar-fill" style="width:${x.prog}%;background:${x.g.color}"></div></div><span class="mono" style="font-size:12px">${x.prog}%</span></div></td><td class="r" style="color:${x.risk ? "var(--crit)" : "inherit"}">${x.risk}</td></tr>`).join("") || `<tr><td colspan="6" class="muted">No ${gw.toLowerCase()}s yet.</td></tr>`}
    </tbody></table></div></section>
    ${w.mode === "company" ? `<section class="card"><div class="card-h"><h3>Team capacity & delivery</h3></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Person</th><th class="r">Active</th><th class="r">Done (30 days)</th><th class="r">On time</th><th class="r">Load this week</th></tr></thead><tbody>
      ${w.members.map(m => { const its = w.items.filter(i => i.assignee === m.id); const d = its.filter(i => isDone(i) && i.doneAt && now - new Date(i.doneAt).getTime() < 30 * DAY); const ot = d.filter(i => new Date(i.doneAt) <= new Date(i.due)); const L = weekLoad(w, now, m.id);
        return `<tr><td><span class="row-flex">${avatarHTML(m)}${esc(m.name)}</span></td><td class="r">${its.filter(i => !isDone(i)).length}</td><td class="r">${d.length}</td><td class="r">${d.length ? Math.round(ot.length / d.length * 100) + "%" : "–"}</td><td class="r" style="color:${L.pct > 100 ? "var(--crit)" : "inherit"}">${L.pct}%</td></tr>`; }).join("")}
    </tbody></table></div><p class="note" style="margin-top:10px">${IC.info}<span>Counts don't capture task difficulty, blockers or help given to others. Use this to spot overload and bottlenecks, not to rank people.</span></p></section>` : ""}
    ${w.mode === "student" && exams.length ? `<section class="card"><div class="card-h"><h3>Exam preparation</h3></div>${exams.map(e => { const g = groupOf(w, e.groupId); const p = progressOf(e); return `<div class="wl-row"><span class="who"><span class="chip" style="--c:${g ? g.color : "var(--accent)"}"><i></i>${esc(g ? g.name : "Exam")}</span></span><div class="bar-track"><div class="bar-fill" style="width:${p}%;background:${g ? g.color : "var(--accent)"}"></div></div><span class="v">${p}% · ${relDay(e.due, now)}</span></div>`; }).join("")}</section>` : ""}`;
}

/* =========================================================
   Settings
   ========================================================= */
function viewPrefs(){
  const w = W(); const s = w.settings; const gw = GROUP_WORD[w.mode]; const mgr = canManage(w);
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const secs = [["s-profile", "Profile"], ["s-avail", "Availability"], ["s-notif", "Notifications"], ["s-ai", "Assistant"], ["s-groups", gw + "s"]].concat(w.mode === "company" ? [["s-team", "Team"]] : []).concat([["s-data", "Data"]]);
  const cur = secs.some(s => s[0] === UI.setTab) ? UI.setTab : secs[0][0];
  // One short section at a time instead of one long page.
  return settingsHTML(w, s, gw, mgr, days).replace(/<section class="card set-sec" id="([\w-]+)"/g, (m, id) => id === cur ? m : `${m} hidden`)
    .replace("%%SETNAV%%", `<nav class="set-nav" role="tablist" aria-label="Settings sections">${secs.map(([id, l]) => `<button type="button" role="tab" data-act="settab" data-v="${id}" aria-selected="${id === cur}">${l}</button>`).join("")}</nav>`);
}
function settingsHTML(w, s, gw, mgr, days){
  return `<div class="set-grid">
    %%SETNAV%%
    <div class="stack">
      <section class="card set-sec" id="s-profile"><h3>Profile & workspace</h3>
        <div class="f2"><div class="field"><label for="pf-name">Your name</label><input type="text" id="pf-name" value="${esc(state.user.name)}" maxlength="60"></div>
        <div class="field"><label for="pf-ws">Workspace name</label><input type="text" id="pf-ws" value="${esc(w.name)}" maxlength="60" ${mgr ? "" : "disabled"}></div></div>
        <p class="muted" style="font-size:13px">${MODE_LABEL[w.mode]} workspace · created ${fmtDate(w.createdAt, { day: "numeric", month: "short", year: "numeric" })}. You belong to ${state.workspaces.length} workspace${state.workspaces.length > 1 ? "s" : ""}; switch from the top of the sidebar.</p>
        <div class="field"><label for="pf-currency">Currency for money in answers</label><select id="pf-currency">${[["INR", "₹ Indian Rupee (INR)"], ["USD", "$ US Dollar (USD)"], ["EUR", "€ Euro (EUR)"], ["GBP", "£ British Pound (GBP)"], ["AED", "AED UAE Dirham"], ["SGD", "S$ Singapore Dollar"], ["AUD", "A$ Australian Dollar"], ["CAD", "C$ Canadian Dollar"], ["JPY", "¥ Japanese Yen"]].map(([v, l]) => `<option value="${v}" ${(state.user.currency || "INR") === v ? "selected" : ""}>${l}</option>`).join("")}</select></div>
        <label class="switch" for="pf-sound"><span><b>Sound effects</b><span>Soft clicks and chimes when you act. Saved on this device.</span></span><input type="checkbox" id="pf-sound" role="switch" ${SFX.on ? "checked" : ""}></label>
        <div class="row-flex">${w.demo ? `<button class="btn sm" type="button" data-act="cleardemo">Clear sample data</button>` : ""}<button class="btn sm" type="button" data-act="wsnew">${IC.plus}New workspace</button>${state.workspaces.length > 1 && mgr ? `<button class="btn sm danger" type="button" data-act="wsdelete">Delete this workspace</button>` : ""}</div>
      ${ACCOUNT.user ? `<div class="acct-row">${IC.check}<span>Signed in as <b>${esc(ACCOUNT.user.email)}</b>${ACCOUNT.user.role === "admin" ? " · admin" : ""}</span>${ACCOUNT.user.role === "admin" ? `<a class="btn sm" href="/admin" target="_blank" rel="noopener">Open admin</a>` : ""}<button class="btn sm" type="button" data-act="pwopen" aria-expanded="${!!UI.pwOpen}" aria-controls="pwBox">Change password</button><button class="btn sm" type="button" data-act="logout">Log out</button></div>
      ${UI.pwOpen ? `<form class="pw-box" id="pwBox" novalidate><h4>Change password</h4>
        <div class="f2"><div class="field"><label for="pw-cur">Current password</label><div class="pw-wrap"><input type="password" id="pw-cur" autocomplete="current-password" maxlength="200"><button type="button" class="pw-eye" data-act="pwtoggle" aria-controls="pw-cur" aria-pressed="false" aria-label="Show password">${EYE}</button></div></div>
        <div class="field"><label for="pw-new">New password</label><div class="pw-wrap"><input type="password" id="pw-new" autocomplete="new-password" maxlength="200" aria-describedby="pw-hint"><button type="button" class="pw-eye" data-act="pwtoggle" aria-controls="pw-new" aria-pressed="false" aria-label="Show password">${EYE}</button></div><span class="hint" id="pw-hint">At least 8 characters. Other devices will be signed out.</span></div></div>
        <p class="auth-err" id="pwErr" role="alert" hidden></p>
        <div class="row-flex"><button class="btn sm primary" type="submit" id="pwSave">Save new password</button><button class="btn sm" type="button" data-act="pwopen">Cancel</button></div></form>` : ""}` : ""}
      </section>
      <section class="card set-sec" id="s-avail"><h3>Availability</h3><p>Used by the planner and the radar to judge whether work fits before each deadline.</p>
        <div class="field"><label for="pf-hpd">${w.mode === "company" ? "Focus hours per working day (your default)" : "Study hours per day"}</label><div class="range"><input type="range" id="pf-hpd" min="0.5" max="10" step="0.5" value="${s.hoursPerDay}"><output id="pf-hpd-o">${fmtH(s.hoursPerDay)}</output></div></div>
        <div class="field"><span class="lbl">Days you work${w.mode === "student" ? " or study" : ""}</span><div class="daychips">${days.map((d, k) => `<label><input type="checkbox" id="wd-${k}" data-wd="${k}" ${s.workdays.includes(k) ? "checked" : ""}><span>${d}</span></label>`).join("")}</div></div>
        <button class="more-btn" id="advToggle" type="button" data-act="advtoggle" aria-expanded="${!!UI.advOpen}" aria-controls="advBox">Advanced: risk rules ${IC.chev}</button>
        <div class="more-box" id="advBox" ${UI.advOpen ? "" : "hidden"}><p class="muted" style="font-size:13px">Risk compares the work left (including deadlines due earlier) with the time you have. Blocked dependencies raise the level. It's a simple rule, not AI.</p>
        ${[["critical", "Critical when work needs at least", 60, 200], ["risk", "At risk from", 30, 150], ["attention", "Needs attention from", 10, 100]].map(([k, l, a, b]) => `<div class="field"><label for="th-${k}">${l} … of available time</label><div class="range"><input type="range" id="th-${k}" data-th="${k}" min="${a}" max="${b}" step="5" value="${s.thresholds[k]}"><output>${s.thresholds[k]}%</output></div></div>`).join("")}
        <button class="btn sm" type="button" data-act="thdefault" style="justify-self:start">Reset to defaults</button>
        </div>
      </section>
      <section class="card set-sec" id="s-notif"><h3>Notifications</h3><p>Reminders always show in the bell menu. Completed deadlines never get reminders.</p>
        ${channelsHTML()}
        <div class="f2">${REMINDER_OPTS.map(([v, l]) => `<label class="toggle"><input type="checkbox" id="rm-${v}" data-rem="${v}" ${s.reminders.includes(v) ? "checked" : ""}>${l}</label>`).join("")}</div>
        <label class="toggle"><input type="checkbox" id="pf-od" ${s.overdueAlerts ? "checked" : ""}>Overdue alerts</label>
        <label class="toggle"><input type="checkbox" id="pf-sum" ${s.dailySummary ? "checked" : ""}>Daily summary of upcoming deadlines</label>
        <label class="toggle"><input type="checkbox" id="pf-today" ${s.dueToday !== false ? "checked" : ""}>Morning reminder on the day something is due</label>
        <label class="toggle"><input type="checkbox" id="pf-high" ${s.highDone !== false ? "checked" : ""}>Tell me when all of today's high-priority tasks are done</label>
        <label class="toggle"><input type="checkbox" id="pf-quiet" ${s.quietOn ? "checked" : ""}>Quiet hours (no pop-up reminders)</label>
        <div class="f2" style="max-width:360px"><div class="field"><label for="pf-qf">From</label><input type="time" id="pf-qf" value="${s.quietFrom}"></div><div class="field"><label for="pf-qt">To</label><input type="time" id="pf-qt" value="${s.quietTo}"></div></div>
        <div class="int"><span class="lg">${IC.bell}</span><div><b>Desktop alerts</b><span>${esc(desktopStatus().text)}</span></div>${desktopStatus().can ? `<label class="toggle"><input type="checkbox" id="pf-desktop" ${desktopStatus().on ? "checked" : ""}><span class="sr">Desktop alerts</span></label>` : ""}</div>
        <p class="note">${IC.info}<span>${Store.mode === "server" ? `Reminders are created by your Deadline Tracker server at the right time in your time zone (${esc(ACCOUNT.user && ACCOUNT.user.timezone || "")}), even while this app is closed. They appear in the bell menu the next time you open the app, and as desktop alerts while it's open. With email or Telegram turned on above, they also arrive there.` : "Reminders arrive while the app is open in a browser tab, even in the background. When the tab or browser is closed, nothing can be delivered. Run the Deadline Tracker server for reminders that are created even while the app is closed."}</span></p>
        ${w.mode === "company" ? `<p class="note">${IC.info}<span>Manager escalation: when someone uses "Notify my manager" in Rescue mode, the manager sees it in their notifications.</span></p>` : ""}
      </section>
      <section class="card set-sec" id="s-ai"><h3>Assistant (AI)</h3><p>${ACCOUNT.on ? `<b>My Plan</b> uses the planning engine on your Deadline Tracker server: it reads only your own tasks and never sends them to an outside AI. <b>Help</b> answers questions about the website from the help guide${AI.gemini ? `, written up by Google Gemini (${esc(AI.model || "")}, free tier). Only your Help question is sent to Gemini, never your tasks; don't type private details there.` : `. Google Gemini is off: the server admin can add a GEMINI_API_KEY to the .env file to turn it on.`}` : "Planning runs in this browser with simple rules. Start the Deadline Tracker server (node server.js) for accounts, server reminders, the planning engine and Help."}</p>
      </section>
      <section class="card set-sec" id="s-groups"><h3>${gw}s</h3><p>${w.mode === "student" ? "Colour-code your subjects or courses. Add the teacher's name if you like." : w.mode === "company" ? "Projects group related deliverables." : "Lists keep related deadlines together."}</p>
        <div class="glist">${w.groups.map(g => `<div class="grow"><input type="color" id="gc-${g.id}" data-gcolor="${g.id}" value="${g.color}" aria-label="Colour for ${esc(g.name)}"><input type="text" id="gn-${g.id}" data-gname="${g.id}" value="${esc(g.name)}" maxlength="40" aria-label="${gw} name"><input type="text" id="gt-${g.id}" data-gteacher="${g.id}" value="${esc(g.teacher || "")}" maxlength="40" placeholder="${w.mode === "student" ? "Teacher (optional)" : w.mode === "company" ? "Project manager (optional)" : "Note (optional)"}" aria-label="Detail"><button class="ib del" type="button" data-act="gdel" data-g="${g.id}" aria-label="Delete ${esc(g.name)}">${IC.trash}</button></div>`).join("")}</div>
        <div class="grow"><input type="text" id="gnew" placeholder="New ${gw.toLowerCase()} name" maxlength="40"><button class="btn sm" type="button" data-act="gadd">${IC.plus}Add ${gw.toLowerCase()}</button></div>
      </section>
      ${w.mode === "company" ? `<section class="card set-sec" id="s-team"><h3>Team & roles</h3><p>Roles decide what people can see and change. Invitations need a sign-in service, so new people here are placeholders until the app has accounts.</p>
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Name</th><th>Role</th><th>Department</th><th class="r">Capacity (h/week)</th><th></th></tr></thead><tbody>
        ${w.members.map(m => `<tr><td><span class="row-flex">${avatarHTML(m)}${esc(m.name)}</span></td><td>${m.id === "me" ? "Manager (owner)" : `<select id="mr-${m.id}" data-mrole="${m.id}" ${mgr ? "" : "disabled"}>${["Employee", "Manager", "Admin", "Guest"].map(r => `<option ${((m.access || "Employee") === r) ? "selected" : ""}>${r}</option>`).join("")}</select>`}</td><td>${esc(m.dept || "")}</td><td class="r"><input type="number" id="mc-${m.id}" data-mcap="${m.id}" value="${m.capacity}" min="1" max="80" style="width:80px" ${mgr ? "" : "disabled"}></td><td>${m.id !== "me" && mgr ? `<button class="ib del" type="button" data-act="mdel" data-m="${m.id}" aria-label="Remove ${esc(m.name)}">${IC.trash}</button>` : ""}</td></tr>`).join("")}
        </tbody></table></div>
        ${mgr ? `<div class="grow"><input type="text" id="mnew" placeholder="Full name" maxlength="50"><input type="text" id="mdept" placeholder="Department" maxlength="40"><button class="btn sm" type="button" data-act="madd">${IC.plus}Add person</button></div>` : ""}
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th>What they can do</th><th>Owner / Admin</th><th>Manager</th><th>Employee</th><th>Guest</th></tr></thead><tbody>
          ${[["See all team deadlines", "✓", "✓", "✓", "Shared only"], ["Edit any task", "✓", "✓", "Own tasks", "–"], ["Approve submitted work", "✓", "✓", "–", "–"], ["Reassign work", "✓", "✓", "–", "–"], ["Workload & reports", "✓", "✓", "–", "–"], ["Manage people & roles", "✓", "–", "–", "–"]].map(r => `<tr>${r.map((c, k) => k ? `<td class="muted">${c}</td>` : `<td>${c}</td>`).join("")}</tr>`).join("")}
        </tbody></table></div></section>` : ""}
      <section class="card set-sec" id="s-data"><h3>Export & data</h3><p>${esc(syncText())}. ${Store.mode === "server" ? "Reminders show in the app, and by email or Telegram if you turn them on under Notifications." : "Reminders show inside the app; email and Telegram need the Deadline Tracker server."} Calendar sync isn't available yet.</p>
        <div class="row-flex"><button class="btn sm" type="button" data-act="exportics">Export to calendar (.ics)</button><button class="btn sm" type="button" data-act="copybackup">${IC.copy}Copy backup</button><button class="btn sm" type="button" data-act="importbackup">Restore from backup</button><button class="btn sm danger" type="button" data-act="resetall">Reset everything</button></div>
      </section>
    </div></div>`;
}

const VIEWS = {
  overview: () => todayView(W()),
  deadlines: () => viewList(false), mywork: () => viewList(true), exams: viewExams, calendar: viewCalendar, planner: viewPlanner,
  team: viewTeam, workload: viewWorkload, approvals: viewApprovals, reports: viewReports, prefs: viewPrefs
};
