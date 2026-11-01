
VIEWS.all = () => viewList(false);
PAGE.all = "All deadlines";
const _navFor = navFor;
function routeAllowed(r){ const w = W(); return _navFor(w).some(x => x[0] === r) || (r === "all" && w.mode === "company" && canManage(w)); }
setRoute = function(r, push = true){
  if (r === "todo") UI.todoTab = UI.todoTab || "today"; // To-Do now lives on Today
  UI.route = routeAllowed(r) ? r : "overview";
  if (push) { try { if (location.hash !== "#" + UI.route) location.hash = UI.route; } catch (e) {} }
  UI.animate = true; closeNotif(); render();
  const v = $("#view"); if (v) v.scrollTop = 0;
};
const listRoute = () => { const w = W(); return w.mode === "company" ? (canManage(w) ? "all" : "mywork") : "deadlines"; };

/* =========================================================
   Toast, burst, modal helpers
   ========================================================= */
let toastT = null, undoFn = null;
function toast(msg, undo, label){
  $("#toastMsg").textContent = msg; undoFn = undo || null;
  const b = $("#toastUndo"); b.hidden = !undo; b.textContent = label || "Undo";
  $("#toast").classList.add("on"); clearTimeout(toastT);
  toastT = setTimeout(() => { $("#toast").classList.remove("on"); undoFn = null; }, undo ? 6500 : 4200);
}
function burst(el){
  if (!el || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const r = el.getBoundingClientRect(); const b = document.createElement("div"); b.className = "burst";
  b.style.left = r.left + r.width / 2 + "px"; b.style.top = r.top + r.height / 2 + "px";
  const cols = ["var(--ok)", "var(--accent)", "var(--att)", "var(--crit)"];
  for (let k = 0; k < 12; k++) { const i = document.createElement("i"); const a = k / 12 * Math.PI * 2; const d = 26 + Math.random() * 22; i.style.setProperty("--dx", Math.cos(a) * d + "px"); i.style.setProperty("--dy", Math.sin(a) * d + "px"); i.style.setProperty("--c", cols[k % 4]); b.appendChild(i); }
  document.body.appendChild(b); setTimeout(() => b.remove(), 800);
}
let modalKind = null, lastFocus = null;
function openModal(kind, html, wide){
  if (!modalKind) lastFocus = document.activeElement;
  modalKind = kind;
  const m = $("#modal"); m.className = "modal" + (wide ? " wide" : ""); m.innerHTML = html;
  $("#modalWrap").classList.add("on");
  setTimeout(() => { const f = m.querySelector("[data-autofocus]") || m.querySelector("input,textarea,select,button"); if (f) f.focus(); }, 40);
}
function closeModal(){
  modalKind = null; $("#modalWrap").classList.remove("on"); UI.rescue = null;
  if (lastFocus && document.contains(lastFocus)) { try { lastFocus.focus(); } catch (e) {} }
}
const mHead = (title, extra = "") => `<div class="m-h"><h2 id="modalTitle">${title}</h2>${extra}<button class="ib" type="button" data-act="mclose" aria-label="Close">${IC.x}</button></div>`;
function confirmModal(title, body, okLabel, onOk, danger){
  UI.onConfirm = onOk;
  openModal("confirm", `${mHead(esc(title))}<div class="m-b"><p>${body}</p></div><div class="m-f"><button class="btn ghost" type="button" data-act="mclose">Cancel</button><button class="btn ${danger ? "danger" : "primary"}" type="button" data-act="confirmok" data-autofocus>${esc(okLabel)}</button></div>`);
}

/* =========================================================
   Mutations
   ========================================================= */
function replaceItem(w, obj){ const k = w.items.findIndex(x => x.id === obj.id); if (k >= 0) w.items[k] = obj; else w.items.push(obj); }
function touch(it){ it.updatedAt = nowIso(); }
function addRepeat(due, rep){
  const d = new Date(due);
  if (rep === "daily") d.setDate(d.getDate() + 1);
  else if (rep === "weekly") d.setDate(d.getDate() + 7);
  else if (rep === "monthly") { const day = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + 1); d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())); }
  return toLocalIso(d);
}
function completeItem(id, el){
  const w = W(); const it = findItem(id); if (!it) return;
  if (!canEditItem(w, it)) { toast("Only the assignee or a manager can change this."); return; }
  if (isDone(it)) {
    const before = clone(it);
    it.status = progressOf({ ...it, status: "todo" }) > 0 ? "doing" : "todo"; it.doneAt = null; touch(it);
    logItem(w, it, `Reopened "${it.title}"`); save(); render();
    toast(`"${it.title}" is active again.`, () => { replaceItem(w, before); save(); render(); });
    return;
  }
  if (w.mode === "company" && it.needsApproval && !canManage(w)) { openDrawer(id, "proof"); toast("Add your evidence, then submit it for review."); return; }
  const before = clone(it); let spawned = null;
  it.status = "done"; it.doneAt = nowIso(); touch(it);
  if (it.approval && it.approval.state === "pending") { it.approval.state = "approved"; it.approval.history.unshift({ t: nowIso(), by: viewerId(w), text: "Approved" }); }
  if (it.repeat && it.repeat !== "none" && !it.spawnedNext && (it.due || it.plan)) {
    // the next one keeps the same shape: a deadline repeats its deadline, a planned task its day
    const next = it.due ? { kind: "deadline", due: addRepeat(it.due, it.repeat) } : { kind: "todo", plan: addRepeat(it.plan + "T12:00", it.repeat).slice(0, 10), time: it.time, reminders: it.reminders };
    spawned = mkItem(w, Object.assign({ title: it.title, type: it.type, groupId: it.groupId, notes: it.notes, estimate: it.estimate, priority: it.priority, assignee: it.assignee, reviewer: it.reviewer, needsApproval: it.needsApproval, repeat: it.repeat,
      milestones: (it.milestones || []).map(m => ({ ...m, id: rid("m"), done: false, date: null })) }, next));
    w.items.push(spawned); it.spawnedNext = spawned.id;
  }
  const late = !!it.due && new Date(it.doneAt) > new Date(it.due);
  logItem(w, it, `Completed "${it.title}"${late ? " after the deadline" : ""}`);
  burst(el); save(); render(); celebrateIfAllDone(w);
  toast(spawned ? (spawned.due ? `Done. The next one is due ${fmtDate(spawned.due)}.` : `Done. The next one is on ${fmtDate(spawned.plan + "T12:00")}.`) : `Nice. "${it.title}" is done${late || !it.due ? "" : " on time"}.`, () => {
    replaceItem(w, before); if (spawned) w.items = w.items.filter(x => x.id !== spawned.id); save(); render();
  });
}
function deleteItem(id){
  const w = W(); const it = findItem(id); if (!it) return;
  const idx = w.items.indexOf(it); const before = clone(it);
  w.items.splice(idx, 1);
  w.items.forEach(x => { if (x.dependsOn) x.dependsOn = x.dependsOn.filter(d => d !== id); });
  closeDrawer(); save(); render();
  toast(`Deleted "${it.title}".`, () => { w.items.splice(idx, 0, before); save(); render(); });
}
function setStatus(id, st){
  const w = W(); const it = findItem(id); if (!it || it.status === st) return;
  if (!canEditItem(w, it)) { toast("You can only move your own cards."); return; }
  if (st === "done") { completeItem(id); return; }
  if (st === "review") { if (!canManage(w) || !it.evidence) { openDrawer(id, "proof"); toast("Add evidence and submit it for review."); return; } }
  const before = clone(it); const from = STATUSES[it.status];
  if (isDone(it)) it.doneAt = null;
  it.status = st; touch(it);
  logItem(w, it, `Moved "${it.title}" from ${from} to ${STATUSES[st]}`); save(); render();
  toast(`Moved to ${STATUSES[st]}.`, () => { replaceItem(w, before); save(); render(); });
}
function moveDue(id, dayKey){
  const w = W(); const it = findItem(id); if (!it || !canEditItem(w, it)) return;
  if (!it.due) { if (it.plan === dayKey) return; const before = moveTodo(it, dayKey); save(); render(); toast(`Planned for ${fmtDate(dayKey + "T12:00")}.`, () => { replaceItem(w, before); save(); render(); }); return; }
  const old = new Date(it.due); if (ymd(old) === dayKey) return;
  const before = clone(it);
  it.due = `${dayKey}T${pad(old.getHours())}:${pad(old.getMinutes())}`; touch(it);
  logItem(w, it, `Moved the deadline of "${it.title}" from ${fmtDate(old)} to ${fmtDate(it.due)}`); save(); render();
  toast(`Deadline moved to ${fmtDue(it.due)}.`, () => { replaceItem(w, before); save(); render(); });
}
function reassign(id, to){
  const w = W(); const it = findItem(id); const m = memberOf(w, to); if (!it || !m) return;
  const before = clone(it); const from = memberOf(w, it.assignee);
  it.assignee = to; touch(it); logItem(w, it, `Reassigned "${it.title}" from ${from ? from.name : "nobody"} to ${m.name}`); save(); render();
  toast(`Reassigned to ${m.name}.`, () => { replaceItem(w, before); save(); render(); });
}
function submitReview(id, link, note){
  const w = W(); const it = findItem(id); if (!it) return;
  it.evidence = { link: link || "", note: note || "", at: nowIso(), by: viewerId(w) };
  it.status = "review"; it.progress = Math.max(it.progress || 0, 100); touch(it);
  it.approval = it.approval || { state: "pending", history: [] }; it.approval.state = "pending";
  it.approval.history.unshift({ t: nowIso(), by: viewerId(w), text: "Submitted for review" + (note ? `: ${note}` : "") });
  logItem(w, it, `Submitted "${it.title}" for review`); UI.forceNotice = true; save(); render();
  toast("Submitted. Your manager will see it in Approvals.");
}
function decide(id, approve, note){
  const w = W(); const it = findItem(id); if (!it || !canManage(w)) return;
  it.approval = it.approval || { state: "pending", history: [] };
  if (approve) { it.approval.state = "approved"; it.status = "done"; it.doneAt = it.doneAt || nowIso(); it.approval.history.unshift({ t: nowIso(), by: viewerId(w), text: "Approved" + (note ? `: ${note}` : "") }); logItem(w, it, `Approved "${it.title}"`); }
  else { it.approval.state = "changes"; it.status = "doing"; it.approval.history.unshift({ t: nowIso(), by: viewerId(w), text: "Requested changes" + (note ? `: ${note}` : "") }); logItem(w, it, `Requested changes on "${it.title}"`); }
  touch(it); save(); render();
  toast(approve ? `Approved "${it.title}".` : "Changes requested. It's back with the assignee.");
}

/* =========================================================
   Drawer
   ========================================================= */
function openDrawer(id, tab){
  UI.drawerId = id; UI.drawerTab = tab || "overview";
  renderDrawer();
  $("#drawer").classList.add("on"); $("#scrim").classList.add("on"); $("#drawer").setAttribute("aria-hidden", "false");
  setTimeout(() => { const c = $("#drClose"); if (c) c.focus({ preventScroll: true }); }, 60);
}
function closeDrawer(){
  UI.drawerId = null;
  $("#drawer").classList.remove("on"); $("#scrim").classList.remove("on"); $("#drawer").setAttribute("aria-hidden", "true");
}
function renderDrawer(){
  const el = $("#drawer");
  if (!UI.drawerId) return;
  const w = W(); const it = findItem(UI.drawerId);
  if (!it) { closeDrawer(); return; }
  if (isTodo(it)) { el.innerHTML = todoDrawerHTML(w, it); return; }
  const { now, R } = CTX; const lv = levelOf(R, it); const g = groupOf(w, it.groupId);
  const can = canEditItem(w, it); const dis = can ? "" : "disabled";
  const tabs = [["overview", "Overview"], ["plan", `Plan<span class="cnt">${(it.milestones || []).length}</span>`], ["proof", w.mode === "company" ? "Review" : "Proof"], ["activity", "Activity"]];
  const d = new Date(it.due);
  let body = "";
  if (UI.drawerTab === "overview") {
    const reasons = isDone(it) ? [`Completed ${fmtDue(it.doneAt || it.updatedAt)}${it.doneAt && new Date(it.doneAt) > new Date(it.due) ? `, ${Math.max(1, Math.round((new Date(it.doneAt) - new Date(it.due)) / DAY))} day(s) after the deadline` : ", before the deadline"}.`] : (R[it.id] || { reasons: [] }).reasons;
    const others = w.items.filter(x => x.id !== it.id && !isDone(x) && !(it.dependsOn || []).includes(x.id));
    body = `
      <div class="why lv-${lv}"><div class="wh"><b>${LV[lv]}</b><span class="mono" style="margin-left:auto;font-size:13px;font-weight:600;color:var(--rc)" ${isDone(it) ? "" : `data-cd="${esc(it.due)}"`}>${isDone(it) ? "" : countdown(it.due, now)}</span></div>
        <ul>${reasons.map(r => `<li>${esc(r)}</li>`).join("")}</ul>
        <div class="row-flex"><span class="tiny">Deadline Radar · a transparent rule, not AI</span>${!isDone(it) && ["critical", "overdue"].includes(lv) && can ? `<button class="btn xs" type="button" data-act="rescue" data-id="${it.id}" style="margin-left:auto">${IC.rescue}Open Rescue mode</button>` : ""}</div></div>
      ${it.extension ? `<div class="ext-box" id="extBox">${it.extension.status === "approved" ? `<span>${IC.check.replace("<svg", '<svg width="14" height="14"')}</span><p>Deadline extended from <b>${fmtDue(it.originalDue)}</b> to <b>${fmtDue(it.due)}</b>.</p>`
        : it.extension.status === "declined" ? `<p>Extension to ${fmtDate(it.extension.requested + "T12:00")} was declined. Your deadline is still <b>${fmtDue(it.due)}</b>.</p>`
        : `<p><b>Extension requested</b> to ${fmtDate(it.extension.requested + "T12:00")} (asked ${fmtDate(it.extension.at)}). Did they agree?</p>${can ? `<div class="row-flex"><button class="btn sm primary" type="button" data-act="extyes">Yes, move my deadline</button><button class="btn sm" type="button" data-act="extno">No</button></div>` : ""}`}</div>` : ""}
      ${can ? "" : `<p class="note">${IC.info}<span>Only the assignee or a manager can edit this deadline.</span></p>`}
      <div class="f2"><div class="field"><label for="dr-date">Hard deadline</label><input type="date" id="dr-date" value="${ymd(d)}" ${dis}></div><div class="field"><label for="dr-time">Time</label><input type="time" id="dr-time" value="${pad(d.getHours())}:${pad(d.getMinutes())}" ${dis}></div></div>
      ${isDone(it) ? "" : `<div class="field"><label for="dr-plan">Work on it (optional)</label><input type="date" id="dr-plan" value="${it.plan || ""}" ${dis}><p class="muted" style="font-size:12px">Puts it on that day's list. The deadline stays the same.</p></div>`}
      <div class="f2">
        <div class="field"><label for="dr-pri">Priority</label><select id="dr-pri" ${dis}>${Object.keys(PRI).map(p => `<option value="${p}" ${it.priority === p ? "selected" : ""}>${PRI[p].label}</option>`).join("")}</select></div>
        <div class="field"><label for="dr-status">Status</label><select id="dr-status" ${dis}>${Object.keys(STATUSES).filter(s => w.mode === "company" || s !== "review" || it.status === "review").map(s => `<option value="${s}" ${it.status === s ? "selected" : ""}>${STATUSES[s]}</option>`).join("")}</select></div>
      </div>
      ${w.mode === "company" ? `<div class="f2">
        <div class="field"><label for="dr-assignee">Responsible</label><select id="dr-assignee" ${canManage(w) ? "" : "disabled"}>${w.members.map(m => `<option value="${m.id}" ${it.assignee === m.id ? "selected" : ""}>${esc(m.name)}</option>`).join("")}</select></div>
      </div>` : ""}
      <div class="f2">
        <div class="field"><label for="dr-est">Estimated effort (hours)</label><input type="number" id="dr-est" min="0" max="500" step="0.5" value="${it.estimate ?? ""}" placeholder="e.g. 4" ${dis}>${(() => { const ins = !isDone(it) && estimateInsight(w, it.type); if (!ins) return ""; const sug = it.estimate ? ins.suggest(it.estimate) : null; return `<p class="note est-hint" id="drEstHint">${IC.spark}<span>${esc(ins.text)}${sug && sug !== Number(it.estimate) && can ? ` <button class="more-btn" id="drEstUse" type="button" data-act="drestuse" data-v="${sug}">Use ${fmtH(sug)}</button>` : ""}</span></p>`; })()}</div>
        <div class="field"><label for="dr-prog">Progress${(it.milestones || []).length ? " (from plan steps)" : ""}</label><div class="prog-row"><input type="range" id="dr-prog" min="0" max="100" step="5" value="${progressOf(it)}" ${(it.milestones || []).length || !can ? "disabled" : ""}><output class="mono" id="dr-prog-o">${progressOf(it)}%</output></div></div>
      </div>
      ${it.loggedMin ? `<p class="muted" style="font-size:12.5px">Focus time logged: ${fmtH(it.loggedMin / 60)}</p>` : ""}
      <div class="field"><label for="dr-notes">Notes</label><textarea id="dr-notes" rows="4" placeholder="Requirements, who to send it to, anything useful" ${dis}>${esc(it.notes || "")}</textarea></div>
      <button class="more-btn" id="drMore" type="button" data-act="drmore" aria-expanded="${!!UI.drMore}" aria-controls="drMoreBox">More details ${IC.chev}</button>
      <div class="more-box" id="drMoreBox" ${UI.drMore ? "" : "hidden"}>
        <div class="f2">
        <div class="field"><label for="dr-type">Type</label><select id="dr-type" ${dis}>${TYPES_BY_MODE[w.mode].concat(TYPES_BY_MODE[w.mode].includes(it.type) ? [] : [it.type]).map(t => `<option value="${t}" ${it.type === t ? "selected" : ""}>${TYPES[t]}</option>`).join("")}</select></div>
        <div class="field"><label for="dr-group">${GROUP_WORD[w.mode]}</label><select id="dr-group" ${dis}><option value="">None</option>${w.groups.map(x => `<option value="${x.id}" ${it.groupId === x.id ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select></div>
        </div>
        <div class="f2">
        <div class="field"><label for="dr-repeat">Repeats</label><select id="dr-repeat" ${dis}>${[["none", "Does not repeat"], ["daily", "Every day"], ["weekly", "Every week"], ["monthly", "Every month"]].map(([v, l]) => `<option value="${v}" ${it.repeat === v ? "selected" : ""}>${l}</option>`).join("")}</select></div>
        </div>
        ${w.mode === "company" ? `<div class="f2">
        <div class="field"><label for="dr-reviewer">Reviewer</label><select id="dr-reviewer" ${canManage(w) ? "" : "disabled"}><option value="">None</option>${w.members.map(m => `<option value="${m.id}" ${it.reviewer === m.id ? "selected" : ""}>${esc(m.name)}</option>`).join("")}</select></div>
        <div class="field"><span class="lbl">Approval</span><label class="toggle" style="margin-top:6px"><input type="checkbox" id="dr-needs" ${it.needsApproval ? "checked" : ""} ${canManage(w) ? "" : "disabled"}>Needs approval</label></div>
        </div>` : ""}
      <div class="field"><span class="lbl">Waiting on</span>
        <div class="deps">${(it.dependsOn || []).map(id => { const x = findItem(id, w); if (!x) return ""; return `<span class="dep${isDone(x) ? "" : " open"}">${isDone(x) ? "✓ " : ""}<a href="#" data-act="open" data-id="${x.id}" style="color:inherit">${esc(x.title)}</a>${can ? `<button type="button" data-act="depdel" data-dep="${x.id}" aria-label="Remove dependency">×</button>` : ""}</span>`; }).join("") || `<span class="muted" style="font-size:13px">Nothing. Add a task this one depends on.</span>`}</div>
        ${can && others.length ? `<select id="dr-dep" aria-label="Add a dependency"><option value="">Add a dependency…</option>${others.map(x => `<option value="${x.id}">${esc(x.title)}</option>`).join("")}</select>` : ""}</div>
      <div class="field"><label for="dr-link">${w.mode === "student" ? "Submission link" : "Link"}</label><input type="url" id="dr-link" value="${esc(it.link || "")}" placeholder="https://" ${dis}></div>
      ${can ? `<button class="btn ghost sm" type="button" data-act="dlremove" style="justify-self:start">Remove the deadline (keep the task)</button>` : ""}
      </div>`;
  } else if (UI.drawerTab === "plan") {
    const ms = it.milestones || [];
    const sug = UI.sugg[it.id];
    const P = planFor(w, now, it.assignee || "me", 21);
    const sess = P.days.map(d => ({ d, s: d.sessions.find(x => x.id === it.id) })).filter(x => x.s);
    body = `
      <div class="row-flex"><span class="ring-wrap"><span class="ring big" style="--p:${progressOf(it)}"></span><span>${progressOf(it)}%</span></span>
        <div><b style="font-size:15px">${ms.filter(m => m.done).length} of ${ms.length} steps done</b><p class="muted" style="font-size:13px">${it.estimate ? `${fmtH(remainingH(it))} of ${fmtH(it.estimate)} left` : "No estimate yet"}</p></div></div>
      <ul class="ms">${ms.map(m => `<li><input type="checkbox" id="ms-c-${m.id}" data-act="mstoggle" data-ms="${m.id}" ${m.done ? "checked" : ""} ${dis} aria-label="Done"><input type="text" id="ms-t-${m.id}" data-mstext="${m.id}" value="${esc(m.text)}" ${dis} aria-label="Step"><input type="number" id="ms-h-${m.id}" data-mshours="${m.id}" value="${m.hours ?? 1}" min="0.25" step="0.25" ${dis} aria-label="Hours"><button class="ib del" type="button" data-act="msdel" data-ms="${m.id}" aria-label="Remove step" ${dis}>${IC.trash}</button></li>`).join("") || `<li class="muted" style="background:transparent;grid-template-columns:1fr;font-size:13px">No steps yet. Add your own or let the planner suggest some.</li>`}</ul>
      ${can ? `<div class="grow"><input type="text" id="ms-new" placeholder="Add a step and press Enter" maxlength="120" style="flex:1"><button class="btn sm" type="button" data-act="msadd">Add</button></div>` : ""}
      ${can ? `<div class="sug-box"><div class="sh"><span class="sug-tag">Suggestion</span>Backward plan</div>
        ${!it.estimate ? `<p class="muted" style="font-size:13px">How much work is this? Add an estimate and the plan works backwards from your deadline.</p><div class="row-flex">${[2, 4, 8, 12].map(h => `<button class="btn xs" type="button" data-act="setest" data-id="${it.id}" data-v="${h}">${h}h</button>`).join("")}</div>`
          : sug ? `<ul class="ms">${sug.map((s, k) => `<li class="sug" style="grid-template-columns:auto minmax(0,1fr) 62px 128px"><input type="checkbox" id="sg-k-${k}" data-sk="${k}" ${s.keep ? "checked" : ""} aria-label="Keep this step"><input type="text" id="sg-t-${k}" data-st="${k}" value="${esc(s.text)}" aria-label="Step"><input type="number" id="sg-h-${k}" data-sh="${k}" value="${s.hours}" min="0.25" step="0.25" aria-label="Hours"><input type="date" id="sg-d-${k}" data-sd="${k}" value="${s.date}" aria-label="Target date"></li>`).join("")}</ul>
            <div class="row-flex"><button class="btn sm primary" type="button" data-act="sugaccept">Add ${sug.filter(s => s.keep).length} steps to plan</button><button class="btn sm ghost" type="button" data-act="sugdiscard">Discard</button></div>
            <p class="note">${IC.info}<span>Built from your ${fmtH(it.estimate)} estimate and the deadline, with a buffer before it. Nothing is saved until you add it, and your hard deadline doesn't change.</span></p>`
          : `<p class="muted" style="font-size:13px">Split ${fmtH(it.milestones && it.milestones.length ? remainingH(it) : it.estimate)} of work into steps with target dates before ${fmtDate(it.due)}.</p><button class="btn sm" type="button" data-act="suggest" style="justify-self:start">${IC.spark}Suggest a backward plan</button>`}
      </div>` : ""}
      <div class="field"><span class="lbl">Scheduled sessions (from the planner)</span>
        ${sess.length ? `<div class="deps">${sess.map(x => `<span class="dep">${x.d.date.toLocaleDateString(undefined, { weekday: "short", day: "numeric" })} · ${fmtH(x.s.h)}</span>`).join("")}</div>` : `<p class="muted" style="font-size:13px">${it.estimate ? (P.short[it.id] ? `Doesn't fit: about ${fmtH(P.short[it.id])} short.` : "Nothing left to schedule.") : "Add an estimate to schedule work sessions."}</p>`}
      </div>`;
  } else if (UI.drawerTab === "proof") {
    const ev = it.evidence; const ap = it.approval;
    const evBox = ev ? `<div class="ev-box" style="background:var(--surface-2);border-radius:10px;padding:10px 12px;display:grid;gap:4px;font-size:13px"><b>Recorded ${fmtDue(ev.at)} ${new Date(ev.at) <= new Date(it.due) ? `<span class="pill pr-low" style="color:var(--ok)">Before deadline</span>` : `<span class="pill pr-high">After deadline</span>`}</b>${ev.link ? `<a href="${esc(ev.link)}" target="_blank" rel="noopener" style="color:var(--accent);overflow-wrap:anywhere">${esc(ev.link)}</a>` : ""}${ev.note ? `<span>${esc(ev.note)}</span>` : ""}${w.mode === "company" ? `<span class="muted">By ${esc((memberOf(w, ev.by) || {}).name || "")}</span>` : ""}</div>` : "";
    if (w.mode === "company" && (it.needsApproval || ap)) {
      body = `<p class="muted" style="font-size:13px">${it.reviewer ? `Reviewer: ${esc((memberOf(w, it.reviewer) || {}).name || "")}` : "Any manager can review."}</p>
        ${ap ? `<div class="row-flex"><span class="lbl muted" style="font-size:12.5px;font-weight:600">Status</span><span class="pill ${ap.state === "approved" ? "pr-low" : ap.state === "changes" ? "pr-medium" : "pr-medium"}" style="${ap.state === "approved" ? "color:var(--ok)" : ""}">${ap.state === "approved" ? "Approved" : ap.state === "changes" ? "Changes requested" : "Waiting for review"}</span></div>` : ""}
        ${evBox}
        ${it.status !== "review" && !isDone(it) && can ? `<div class="field"><label for="ev-link">Link to the work</label><input type="url" id="ev-link" placeholder="https://"></div><div class="field"><label for="ev-note">Note for the reviewer</label><textarea id="ev-note" rows="3" placeholder="What changed, what to look at"></textarea></div><button class="btn primary" type="button" data-act="submitreview" style="justify-self:start">Submit for review</button>` : ""}
        ${it.status === "review" && canManage(w) ? `<div class="field"><label for="ap-note">Note (optional)</label><textarea id="ap-note" rows="2" placeholder="Feedback for ${esc((memberOf(w, it.assignee) || {}).name || "the assignee")}"></textarea></div><div class="row-flex"><button class="btn primary" type="button" data-act="approve">Approve</button><button class="btn" type="button" data-act="changes">Request changes</button></div>` : ""}
        ${it.status === "review" && !canManage(w) ? `<p class="note">${IC.info}<span>Waiting for a manager to review.</span></p>` : ""}
        <div class="field"><span class="lbl">Submission history</span><ul class="hist">${(ap ? ap.history : []).map(h => `<li>${fmtDue(h.t)} · ${esc((memberOf(w, h.by) || {}).name || "")}: ${esc(h.text)}</li>`).join("") || "<li>No submissions yet.</li>"}</ul></div>`;
    } else {
      body = `<p class="muted" style="font-size:13px">${w.mode === "student" ? "Keep a record of what you submitted and when: the link, a note, and the time are saved." : "Record proof that this is done: a link, a note and the time."}${w.mode === "company" ? " This task doesn't need approval. A manager can turn that on in Overview." : ""}</p>
        ${evBox}
        ${can ? `<div class="field"><label for="ev-link">${w.mode === "student" ? "Submission link or file location" : "Link"}</label><input type="url" id="ev-link" value="${esc(ev ? ev.link : it.link || "")}" placeholder="https://"></div>
        <div class="field"><label for="ev-note">Note</label><textarea id="ev-note" rows="3" placeholder="${w.mode === "student" ? "e.g. Uploaded PDF, confirmation number 4821" : "Anything worth remembering"}">${esc(ev ? ev.note : "")}</textarea></div>
        <p class="note">${IC.info}<span>File uploads need storage on a server; for now, paste a link to where the file lives.</span></p>
        <button class="btn primary" type="button" data-act="recordproof" style="justify-self:start">${isDone(it) ? "Update record" : "Record submission & mark done"}</button>` : ""}`;
    }
  } else {
    body = `<ul class="act-log">${(it.log || []).map(l => `<li><div>${esc(l.text)}<time>${fmtDue(l.t)}</time></div></li>`).join("")}<li><div>Created<time>${fmtDue(it.createdAt)}</time></div></li></ul>`;
  }
  const primary = isDone(it) ? `<button class="btn" type="button" data-act="toggle" data-id="${it.id}" ${dis}>Reopen</button>`
    : (w.mode === "company" && it.needsApproval && !canManage(w)) ? (it.status === "review" ? `<button class="btn" type="button" disabled>In review</button>` : `<button class="btn primary" type="button" data-act="tab" data-v="proof">Submit for review</button>`)
    : `<button class="btn primary" type="button" data-act="toggle" data-id="${it.id}" ${dis}>${IC.check.replace('width', 'w')}Mark as done</button>`;
  el.innerHTML = `
    <div class="dr-h">
      <div class="dr-top">${isDone(it) ? riskBadge("done") : riskBadge(lv)}${g ? `<span class="chip" style="--c:${g.color}"><i></i>${esc(g.name)}</span>` : ""}<span class="chip">${TYPES[it.type] || "Task"}</span><span class="sp"></span>
        <button class="ib" type="button" id="drClose" data-act="drclose" aria-label="Close details">${IC.x}</button></div>
      <input class="dr-title" id="dr-title" value="${esc(it.title)}" aria-label="Title" ${dis}>
      <div class="tabs" role="tablist">${tabs.map(([k, l]) => `<button type="button" role="tab" data-act="tab" data-v="${k}" aria-selected="${UI.drawerTab === k}">${l}</button>`).join("")}</div>
    </div>
    <div class="dr-b">${body}</div>
    <div class="dr-f">${can && (canManage(w) || it.assignee === viewerId(w)) ? `<button class="btn ghost danger sm" type="button" data-act="delete" data-id="${it.id}">${IC.trash}Delete</button>` : ""}<span class="sp"></span>
      ${!isDone(it) && can ? `<button class="btn sm" type="button" data-act="focus" data-id="${it.id}">${IC.play}Focus</button>` : ""}
      ${!isDone(it) && ["critical", "overdue", "risk"].includes(lv) && can ? `<button class="btn sm" type="button" data-act="rescue" data-id="${it.id}">${IC.rescue}Rescue</button>` : ""}
      ${primary}</div>`;
}

/* =========================================================
   Add box: one place to add tasks and deadlines (Home, To-Do, N / +, calendar days)
   Same reading as the assistant's offline rules. Enter saves with Undo.
   ========================================================= */
const AB = { drafts: {}, day: null, ph: null, who: {} };
// The day a task without a date goes to: the calendar day it was opened from, otherwise today.
const addDay = id => (id === "qaText" && AB.day) || ymd(Date.now());
function addBoxHTML(id, o = {}){
  const ph = o.placeholder || "Add a task or deadline… e.g. Essay due Fri 5pm";
  return `<form class="addbox" data-addbox="${id}"><span class="ab-ico" aria-hidden="true">${IC.plus}</span>
      <textarea id="${id}" class="ab-input" rows="1" placeholder="${esc(ph)}" aria-label="Add a task or deadline" aria-describedby="${id}-hint" autocomplete="off" ${o.autofocus ? "data-autofocus" : ""}>${esc(AB.drafts[id] || "")}</textarea>
      <span class="ab-btns">${W().mode === "company" && canManage(W()) ? `<label class="sr" for="${id}-who">For</label><select id="${id}-who" class="ab-who" data-abwho="${id}" title="Who it's for">${W().members.map(m => `<option value="${m.id}" ${(AB.who[id] || viewerId(W())) === m.id ? "selected" : ""}>${m.id === viewerId(W()) ? "For me" : `For ${esc(m.name.split(" ")[0])}`}</option>`).join("")}</select>` : ""}<button class="btn primary" type="submit" id="${id}-go">Add</button>${o.ask === false ? "" : `<button class="btn ghost" type="button" data-act="abask" id="${id}-ask">${IC.spark}<span>Ask the assistant</span></button>`}</span>
    </form><p class="ab-hint" id="${id}-hint" aria-live="polite">${addHint(id)}</p>`;
}
// The manager's "For" picker applies unless the text names someone ("assign to Karan", "@karan").
function addActions(id){
  const w = W(); const t = (AB.drafts[id] || "").trim(); if (!t) return [];
  const who = w.mode === "company" && canManage(w) ? AB.who[id] : null;
  return extractTasks(t, w, Date.now()).map(a => (who && who !== viewerId(w) && !a.assignee && !a.assigneeMiss ? Object.assign(a, { assignee: who }) : a));
}
// One line per thing found: what it is, when, and for whom. Nothing is saved yet.
function addHint(id){
  const acts = addActions(id); const now = Date.now(); const w = W();
  if (!(AB.drafts[id] || "").trim()) return `Say <b>due</b> for a deadline. No date means today. Separate several with commas.`;
  if (!acts.length) return "Type what you need to do.";
  const day = d => d === ymd(now) ? "Today" : d === ymd(addDays(startOfDay(now), 1)) ? "Tomorrow" : fmtDate(d + "T12:00");
  const line = a => {
    const bits = [`<b>${esc(a.title)}</b>`];
    if (a.isDeadline) bits.push(`<span class="ab-dl">${IC.flag}Deadline ${esc(fmtDate(a.date + "T12:00"))}, ${esc(fmtTime(`${a.date}T${a.time || "23:59"}`))}</span>`);
    else bits.push(esc(day(a.date || addDay(id))) + (a.time ? `, ${esc(fmtTime(`${a.date || addDay(id)}T${a.time}`))}` : ""));
    const m = a.assignee && memberOf(w, a.assignee); if (m) bits.push(`for ${esc(m.name)}`);
    if (a.estimate) bits.push(`~${fmtH(a.estimate)}`);
    if (a.repeat && a.repeat !== "none") bits.push(`repeats ${a.repeat}`);
    if (a.assigneeMiss) bits.push(`<span class="ab-warn">No one called ${esc(a.assigneeMiss)}</span>`);
    return bits.join(" · ");
  };
  return acts.length === 1 ? line(acts[0]) : `<span class="ab-n">${acts.length} things:</span> ${acts.map(line).join(`<span class="ab-sep"> | </span>`)}`;
}
function refreshAddHint(id){ const h = document.getElementById(id + "-hint"); if (h) h.innerHTML = addHint(id); }
function submitAddBox(id){
  const w = W(); const acts = addActions(id);
  const el = document.getElementById(id);
  if (!acts.length) { toast("Type what you need to do."); if (el) el.focus(); return; }
  const made = acts.map(a => { const it = taskFromAction(w, a, { day: addDay(id) }); logItem(w, it, `Added "${it.title}"`); return it; });
  AB.drafts[id] = ""; if (el) { el.value = ""; el.style.height = ""; }
  const inModal = id === "qaText"; if (inModal) closeModal();
  save(); render(); refreshAddHint(id);
  const one = made[0]; const now = Date.now();
  const where = it => it.due ? `due ${fmtDue(it.due)}` : `for ${it.plan === ymd(now) ? "today" : it.plan === ymd(addDays(startOfDay(now), 1)) ? "tomorrow" : fmtDate(it.plan + "T12:00")}`;
  toast(made.length === 1 ? `Added "${one.title}" ${where(one)}.` : `Added ${made.length} things.`, () => { const ids = made.map(x => x.id); W().items = W().items.filter(x => !ids.includes(x.id)); save(); render(); });
  if (!inModal) setTimeout(() => { const i = document.getElementById(id); if (i) i.focus({ preventScroll: true }); }, 0);
}
function askFromAddBox(id){
  const t = (AB.drafts[id] || "").trim(); if (!t) { toast("Type what you want to ask the assistant."); return; }
  AB.drafts[id] = ""; if (modalKind) closeModal();
  setRoute("assistant"); sendToAssistant(t);
}
function openQuickAdd(preset = {}){
  AB.day = preset.date || null; AB.drafts.qaText = "";
  const title = preset.date ? `Add to ${fmtDate(preset.date + "T12:00", { weekday: "long", day: "numeric", month: "short" })}` : "Add";
  const ph = preset.type === "exam" ? "e.g. Maths midterm 20 Nov 10am" : preset.date ? "e.g. Call the bank, or Lab file due 5pm" : undefined;
  openModal("qa", `${mHead(esc(title))}<div class="m-b">${addBoxHTML("qaText", { autofocus: true, placeholder: ph })}
    <p class="note">${IC.info}<span>Tips: <b>~2h</b> effort, <b>!high</b> priority, <b>#subject</b>${W().mode === "company" ? ", <b>@name</b> or “assign to Rahul”" : ""}, <b>every week</b>. Shift+Enter for a new line.</span></p></div>`);
}

/* =========================================================
   Rescue mode
   ========================================================= */
function openRescue(id){
  const w = W(); const it = findItem(id); if (!it) return;
  const now = Date.now();
  const dueMs = new Date(it.due).getTime();
  const target = dueMs > now + DAY ? ymd(it.due) : ymd(addDays(now, 2));
  UI.rescue = { id, chunks: chunkPlan(it, now), target, done: {}, ext: target, note: "" };
  closeDrawer();
  renderRescue();
}
function rescueSchedule(it, w, targetKey){
  const now = Date.now(); const end = new Date(targetKey + "T21:00").getTime();
  let rem = remainingH(it) || (Number(it.estimate) || 2) * (1 - progressOf(it) / 100) || 1;
  const hpd = w.mode === "company" ? ((memberOf(w, it.assignee) || {}).capacity || 40) / Math.max(1, w.settings.workdays.length) : w.settings.hoursPerDay;
  const out = []; let d = startOfDay(now);
  while (d.getTime() <= end && rem > .01 && out.length < 30) {
    if (w.settings.workdays.includes(d.getDay()) || out.length === 0) {
      const cap = ymd(d) === ymd(now) ? Math.max(.5, hpd * clamp((startOfDay(now).getTime() + 22 * HOUR - now) / (14 * HOUR), 0, 1)) : hpd;
      const h = Math.min(rem, Math.round(cap * 4) / 4); if (h >= .25) { out.push({ date: ymd(d), h }); rem -= h; }
    }
    d = addDays(d, 1);
  }
  return { out, short: rem > .05 ? rem : 0 };
}
function renderRescue(){
  const S = UI.rescue; if (!S) return;
  const w = W(); const it = findItem(S.id); if (!it) { closeModal(); return; }
  const now = Date.now(); const R = radar(w, now); const lv = levelOf(R, it);
  const blockers = (it.dependsOn || []).map(id => findItem(id, w)).filter(x => x && !isDone(x));
  const sch = rescueSchedule(it, w, S.target);
  const me = memberOf(w, viewerId(w)); const mgr = canManage(w);
  const toWhom = w.mode === "student" ? "[Teacher's name]" : w.mode === "company" ? ((memberOf(w, it.reviewer || "me") || {}).name || "[Manager]") : "[Name]";
  const msg = S.msg ?? `Hi ${toWhom},\n\nI'm working on "${it.title}", due ${fmtDue(it.due)}. I've finished about ${progressOf(it)}% so far${remainingH(it) ? ` and have roughly ${fmtH(remainingH(it))} of work left` : ""}${blockers.length ? `; part of it is waiting on "${blockers[0].title}"` : ""}.\n\nCould I have until ${fmtDate(S.ext + "T12:00", { weekday: "long", day: "numeric", month: "long" })} to finish it properly?\n\nThank you,\n${(me && me.name) || state.user.name || ""}`;
  const loads = w.mode === "company" ? w.members.map(m => ({ m, L: weekLoad(w, now, m.id) })).sort((a, b) => a.L.pct - b.L.pct) : [];
  const step = (n, key, title, desc, inner) => `<div class="rstep${S.done[key] ? " doneStep" : ""}"><div class="rh"><span class="rn">${S.done[key] ? "✓" : n}</span><b>${title}</b></div><p>${desc}</p>${inner}</div>`;
  let n = 0;
  const html = `${mHead(`Rescue plan`)}
    <div class="m-b">
      <div class="why lv-${lv}"><div class="wh"><b>${esc(it.title)}</b><span class="risk lv-${lv}" style="margin-left:auto">${LV[lv]}</span></div><ul>${(R[it.id] ? R[it.id].reasons : []).slice(0, 3).map(r => `<li>${esc(r)}</li>`).join("")}</ul></div>
      <p class="muted" style="font-size:13px">Pick what helps. Nothing here changes your recorded deadline on its own.</p>
      <div class="rescue-steps">
        ${step(++n, "chunk", "Break the remaining work into small steps", "Smaller steps are easier to start and finish in the time you have.",
          `<ul class="ms">${S.chunks.map(c => `<li style="grid-template-columns:minmax(0,1fr) auto"><span class="mt">${esc(c.text)}</span><span class="md">${fmtH(c.hours)} · by ${fmtDate(c.date + "T12:00")}</span></li>`).join("")}</ul><div class="row-flex"><button class="btn sm" type="button" data-act="rsChunk" ${S.done.chunk ? "disabled" : ""}>Add these steps to the plan</button></div>`)}
        ${step(++n, "sched", "Make a revised schedule", "Plan focused sessions from today until a target finish.",
          `<div class="row-flex"><label for="rs-target" style="font-size:13px;font-weight:600;color:var(--muted)">Target finish</label><input type="date" id="rs-target" value="${S.target}" min="${ymd(now)}"></div>
           <div class="deps">${sch.out.map(x => `<span class="dep">${fmtDate(x.date + "T12:00", { weekday: "short", day: "numeric" })} · ${fmtH(x.h)}</span>`).join("")}</div>
           ${sch.short ? `<p style="color:var(--crit);font-size:13px">Still about ${fmtH(sch.short)} short. Pick a later target, add hours, or ask for an extension.</p>` : ""}
           ${S.target > ymd(it.due) ? `<p class="muted" style="font-size:12.5px">This target is after the recorded deadline (${fmtDate(it.due)}). The deadline stays as it is unless you change it yourself.</p>` : ""}
           <div class="row-flex"><button class="btn sm" type="button" data-act="rsSched" ${S.done.sched || !sch.out.length ? "disabled" : ""}>Add sessions to the plan</button></div>`)}
        ${step(++n, "block", "Clear blockers", blockers.length || it.status === "blocked" ? "These are holding it up right now." : "Nothing is recorded as blocking this.",
          `${blockers.map(b => { const m = memberOf(w, b.assignee); return `<div class="row-flex"><span class="dep open">${esc(b.title)}</span>${w.mode === "company" && m ? `<span class="muted" style="font-size:12.5px">${esc(m.name)} · due ${relDay(b.due, now)}</span>` : ""}<button class="btn xs" type="button" data-act="rsOpen" data-id="${b.id}">Open</button></div>`; }).join("")}
           ${it.status === "blocked" ? `<div class="row-flex"><span class="muted" style="font-size:13px">Status is Blocked.</span><button class="btn xs" type="button" data-act="rsUnblock">Mark as in progress</button></div>` : ""}`)}
        ${step(++n, "ext", w.mode === "company" ? "Ask for more time" : "Ask for an extension", "Copy this message and send it yourself. Nothing is sent from here.",
          `<div class="row-flex"><label for="rs-ext" style="font-size:13px;font-weight:600;color:var(--muted)">Ask for</label><input type="date" id="rs-ext" value="${S.ext}" min="${ymd(now)}"></div>
           <textarea id="rs-msg" rows="7" style="width:100%">${esc(msg)}</textarea>
           <div class="row-flex"><button class="btn sm" type="button" data-act="rsCopy">${IC.copy}Copy message</button><button class="btn sm ghost" type="button" data-act="rsLogExt" ${S.done.ext ? "disabled" : ""}>Log that I asked</button></div>`)}
        ${w.mode === "company" && mgr ? step(++n, "reassign", "Reassign the work", "People sorted by how much room they have this week.",
          `<div class="row-flex"><select id="rs-who" style="flex:1">${loads.filter(x => x.m.id !== it.assignee).map(x => `<option value="${x.m.id}">${esc(x.m.name)} · ${x.L.pct}% loaded</option>`).join("")}</select><button class="btn sm" type="button" data-act="rsReassign" ${S.done.reassign ? "disabled" : ""}>Reassign</button></div>`) : ""}
        ${w.mode === "company" && !mgr ? step(++n, "notify", "Tell your manager", "Sends an in-app notice to your manager with the current status.",
          `<textarea id="rs-note" rows="2" style="width:100%" placeholder="Optional note, e.g. what you need"></textarea><div class="row-flex"><button class="btn sm" type="button" data-act="rsNotify" ${S.done.notify ? "disabled" : ""}>Send in-app notice</button></div>`) : ""}
      </div>
    </div>
    <div class="m-f"><span class="sp"></span><button class="btn primary" type="button" data-act="mclose">Done</button></div>`;
  const keepScroll = $("#modalWrap").scrollTop;
  openModal("rescue", html, true);
  $("#modalWrap").scrollTop = keepScroll;
}

/* =========================================================
   Onboarding & new workspace
   ========================================================= */
const ONB = { step: 0, name: "", mode: null, ws: "", demo: true, groups: "" };
const MODE_CARDS = [
  ["student", "Student", "Assignments, exams, projects, scholarships and fees, organised by subject.", IC.student],
  ["company", "Company / team", "Team deadlines, owners, approvals, workload and project progress.", IC.company],
  ["personal", "Personal", "Bills, renewals, appointments and everything else with a date.", IC.personal]
];
const WS_DEFAULT = { student: "My Studies", company: "My Team", personal: "Personal" };
function showOnboarding(){
  $("#app").hidden = true; const o = $("#onb"); o.hidden = false; o.classList.remove("auth");
  const dots = `<div class="steps-dots">${[0, 1, 2].map(k => `<i class="${k <= ONB.step ? "on" : ""}"></i>`).join("")}</div>`;
  let inner;
  if (ONB.step === 0) inner = `<div class="brandline">${IC.planner.replace("<svg", '<svg width="18" height="18"')} Deadline Tracker</div>
    <h1>Never miss a deadline.<br>Always know what comes next.</h1>
    <p class="lead">See what's due, what's at risk and what to do first. Works for coursework, team projects and life admin.</p>
    <div class="field" style="max-width:420px"><label for="onb-name">What should we call you?</label><input type="text" id="onb-name" value="${esc(ONB.name)}" placeholder="Your first name" maxlength="40" autocomplete="given-name"></div>
    <div class="row-flex"><button class="btn primary" type="button" data-act="onbnext">Continue</button>${dots}</div>`;
  else if (ONB.step === 1) inner = `<h1 style="font-size:32px">What will you track?</h1><p class="lead">This sets up the right screens. You can add more workspaces later and switch between them.</p>
    <div class="modes">${MODE_CARDS.map(([k, t, d, ic]) => `<button class="mode" type="button" data-act="onbmode" data-v="${k}" aria-pressed="${ONB.mode === k}"><span class="mi" style="background:${MODE_COLOR[k]}">${ic}</span><b>${t}</b><span>${d}</span></button>`).join("")}</div>
    <div class="row-flex"><button class="btn ghost" type="button" data-act="onbback">Back</button><button class="btn primary" type="button" data-act="onbnext" ${ONB.mode ? "" : "disabled"}>Continue</button>${dots}</div>`;
  else inner = `<h1 style="font-size:32px">What's due this week?</h1>
    <p class="lead">Type it the way you'd say it. Say “due” for a deadline. You can skip this and add things later.</p>
    <div class="field"><label class="sr" for="onb-due">What's due this week?</label><textarea id="onb-due" rows="3" placeholder="${ONB.mode === "company" ? "e.g. Client report due Friday 4pm, review the landing page tomorrow" : "e.g. DBMS assignment due Friday 5pm, Java lab tomorrow"}">${esc(ONB.due || "")}</textarea>
      <p class="ab-hint" id="onb-due-hint" aria-live="polite">${onbHint()}</p></div>
    <label class="toggle"><input type="checkbox" id="onb-demo" ${ONB.demo ? "checked" : ""}>Also add sample deadlines so I can explore (clearly marked, clear them any time)</label>
    <div class="row-flex"><button class="btn ghost" type="button" data-act="onbback">Back</button><button class="btn primary" type="button" data-act="onbdone">Get started</button>${dots}</div>`;
  o.innerHTML = `<div class="onb-card">${inner}</div>`;
  setTimeout(() => { const f = o.querySelector("input,button.mode"); if (f) f.focus(); }, 40);
}
// The setup box reads text like the Add box does, against a stand-in workspace (none exists yet).
function onbHint(){
  const t = (ONB.due || "").trim(); if (!t) return "";
  const w = { mode: ONB.mode || "student", members: [{ id: "me", name: ONB.name || "You" }], groups: [], viewAs: "manager", settings: defaultSettings(ONB.mode || "student") };
  const acts = extractTasks(t, w, Date.now()); if (!acts.length) return "";
  return `${acts.length} thing${acts.length === 1 ? "" : "s"}: ` + acts.map(a => `<b>${esc(a.title)}</b> · ${a.isDeadline ? `Deadline ${esc(fmtDate(a.date + "T12:00"))}, ${esc(fmtTime(`${a.date}T${a.time || "23:59"}`))}` : a.date ? esc(fmtDate(a.date + "T12:00")) : "Today"}`).join(" | ");
}
function finishOnboarding(){
  const name = (ONB.name || "").trim();
  state = state && state.workspaces ? state : { v: 2, user: { name }, active: null, workspaces: [], read: {}, updatedAt: Date.now() };
  state.user.name = name || state.user.name || "";
  const groups = ONB.groups.split(",").map(x => x.trim()).filter(Boolean).slice(0, 12);
  const w = newWorkspace(ONB.mode, (ONB.ws || WS_DEFAULT[ONB.mode]).trim(), ONB.demo, groups);
  state.workspaces.push(w); state.active = w.id;
  save(); UI.route = "overview"; UI.animate = true; seenInit = false;
  state.inbox = state.inbox || []; state.fired = state.fired || {}; w.chat = [];
  render(); reminderBoot = true; UI.forceNotice = true; muteWs = w.id; runReminders(); muteWs = null;
  // what the person typed in "What's due this week?" becomes their first tasks (after the sample data was quieted)
  const mine = (ONB.due || "").trim() ? extractTasks(ONB.due, w, Date.now()).map(a => { const it = taskFromAction(w, a, { day: ymd(Date.now()) }); logItem(w, it, `Added "${it.title}"`); return it; }) : [];
  ONB.due = ""; if (mine.length) { save(); render(); toast(`Added ${mine.length} thing${mine.length === 1 ? "" : "s"} from your list.`); renderBell(); return; }
  renderBell();
  toast(ONB.demo ?"Your workspace is ready with sample deadlines. Press N to add your own." : "Your workspace is ready. Press N to add your first deadline.");
}
function openWsModal(){
  UI.newWs = UI.newWs || { mode: "student", name: "", demo: false };
  const N = UI.newWs;
  openModal("ws", `${mHead("New workspace")}<div class="m-b">
    <div class="modes" style="grid-template-columns:repeat(3,minmax(0,1fr))">${MODE_CARDS.map(([k, t, d, ic]) => `<button class="mode" type="button" data-act="wsmode" data-v="${k}" aria-pressed="${N.mode === k}" style="color:var(--ink);border-color:var(--line);background:var(--surface)"><span class="mi" style="background:${MODE_COLOR[k]}">${ic}</span><b>${t}</b><span style="color:var(--muted)">${d}</span></button>`).join("")}</div>
    <div class="field"><label for="nw-name">Name</label><input type="text" id="nw-name" value="${esc(N.name || WS_DEFAULT[N.mode])}" maxlength="50" data-autofocus></div>
    <label class="toggle"><input type="checkbox" id="nw-demo" ${N.demo ? "checked" : ""}>Include sample deadlines</label>
    <p class="note">${IC.info}<span>Each workspace keeps its own deadlines, ${N.mode === "company" ? "people, " : ""}settings and reports.</span></p>
  </div><div class="m-f"><button class="btn ghost" type="button" data-act="mclose">Cancel</button><button class="btn primary" type="button" data-act="wscreate">Create workspace</button></div>`, true);
}

/* =========================================================
   Notifications
   ========================================================= */
function inQuiet(s){
  if (!s.quietOn) return false;
  const n = new Date(); const cur = n.getHours() * 60 + n.getMinutes();
  const [fh, fm] = s.quietFrom.split(":").map(Number), [th, tm] = s.quietTo.split(":").map(Number);
  const a = fh * 60 + fm, b = th * 60 + tm;
  return a <= b ? cur >= a && cur < b : cur >= a || cur < b;
}
function notifs(w, now, R){
  const s = w.settings; const out = [];
  const mine = w.items.filter(i => !isDone(i) && i.due && (w.mode !== "company" || i.assignee === viewerId(w)));
  const offs = s.reminders.concat(s.customReminder ? [s.customReminder] : []).sort((a, b) => a - b);
  mine.forEach(i => {
    const due = new Date(i.due).getTime();
    if (due < now) { if (s.overdueAlerts) out.push({ key: i.id + ":od", id: i.id, lv: "overdue", t: due, text: `Overdue: ${i.title}` }); return; }
    const o = offs.find(o => now >= due - o * MIN);
    if (o) out.push({ key: i.id + ":" + o, id: i.id, lv: levelOf(R, i), t: due - o * MIN, text: `Due ${countdown(i.due, now).replace(" left", "")} from now: ${i.title}` });
  });
  conflicts(w, now).forEach(c => out.push({ key: c.key, id: c.ids[0], lv: "risk", t: now - 1000, text: c.text, route: c.kind === "over" ? "workload" : "planner" }));
  if (w.mode === "company" && canManage(w)) {
    w.items.filter(i => i.status === "review").forEach(i => { const m = memberOf(w, i.assignee); out.push({ key: i.id + ":rv:" + (i.evidence ? i.evidence.at : ""), id: i.id, lv: "attention", t: i.evidence ? new Date(i.evidence.at).getTime() : now, text: `${m ? m.name : "Someone"} submitted "${i.title}" for review`, route: "approvals" }); });
    (w.notices || []).forEach(n => out.push({ key: n.id, id: n.itemId, lv: "critical", t: new Date(n.t).getTime(), text: n.text }));
  }
  out.sort((a, b) => b.t - a.t);
  if (s.dailySummary) {
    const sod = startOfDay(now).getTime();
    const today = mine.filter(i => { const t = new Date(i.due).getTime(); return t >= now && t < sod + DAY; }).length;
    const risk = mine.filter(i => ["risk", "critical"].includes(levelOf(R, i))).length;
    const od = mine.filter(i => levelOf(R, i) === "overdue").length;
    out.unshift({ key: "sum:" + ymd(now) + ":" + w.id, lv: od ? "overdue" : risk ? "risk" : "ontrack", t: sod + 7 * HOUR, text: `Today's summary: ${today} due today, ${risk} at risk, ${od} overdue.`, route: "overview" });
  }
  return out;
}
function closeNotif(){ UI.notifOpen = false; const p = $("#notifPanel"); if (p) p.hidden = true; }
let seenInit = false; const seen = new Set();
function checkNewNotifs(){ runReminders(); }

/* =========================================================
   Focus sessions
   ========================================================= */
function startFocus(id, mins){
  const w = W(); const it = findItem(id); if (!it) return;
  if (UI.focus) finishFocus(false);
  UI.focus = { id, total: mins * 60, left: mins * 60, running: true, endAt: Date.now() + mins * 60000 };
  render(); toast(`Focus session started: ${mins} minutes on "${it.title}".`);
}
function focusLeft(){ const F = UI.focus; return F ? Math.max(0, F.running ? (F.endAt - Date.now()) / 1000 : F.left) : 0; }
function finishFocus(log = true, auto = false){
  const F = UI.focus; if (!F) return;
  const w = W(); const it = findItem(F.id);
  const mins = Math.round((F.total - focusLeft()) / 60);
  UI.focus = null;
  if (log && it && mins >= 1) {
    it.loggedMin = (it.loggedMin || 0) + mins;
    if (Number(it.estimate) > 0 && !(it.milestones || []).length && !isDone(it)) it.progress = clamp(Math.round((Number(it.progress) || 0) + mins / 60 / Number(it.estimate) * 100), 0, 100);
    if (it.status === "todo") it.status = "doing";
    touch(it); logItem(w, it, `Focused for ${mins} min on "${it.title}"`); save();
    toast(auto ? `Session complete. Logged ${mins} min on "${it.title}".` : `Logged ${mins} min on "${it.title}".`);
    burst($(".focus-mini") || $("#fringTm"));
  } else if (log) toast("Session ended. Less than a minute, so nothing was logged.");
  render();
}
function renderFocusMini(){
  const host = $("#focusMini"); const F = UI.focus;
  if (!F || UI.route === "planner") { host.innerHTML = ""; return; }
  const it = findItem(F.id); const left = focusLeft(); const c = 2 * Math.PI * 14;
  host.innerHTML = `<div class="focus-mini" role="status"><div class="mr"><svg viewBox="0 0 34 34"><circle cx="17" cy="17" r="14" fill="none" stroke="rgba(255,255,255,.15)" stroke-width="4"/><circle id="fmPr" cx="17" cy="17" r="14" fill="none" stroke="#7d93ff" stroke-width="4" stroke-linecap="round" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${(c * (1 - left / F.total)).toFixed(1)}"/></svg></div>
    <div><div class="t" id="fmTm">${pad(Math.floor(left / 60))}:${pad(Math.floor(left % 60))}</div><div class="n">${esc(it ? it.title : "")}</div></div>
    <button type="button" data-act="fpause">${F.running ? "Pause" : "Resume"}</button><button type="button" data-act="ffinish">Finish</button></div>`;
}

/* =========================================================
   Export & backup
   ========================================================= */
function icsText(w){
  const z = d => { d = new Date(d); return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`; };
  const e = s => String(s || "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/[,;]/g, m => "\\" + m);
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Deadline Tracker//EN", "CALSCALE:GREGORIAN"];
  w.items.filter(i => !isDone(i) && i.due).forEach(i => {
    const due = new Date(i.due).getTime();
    lines.push("BEGIN:VEVENT", `UID:${i.id}@deadline-tracker`, `DTSTAMP:${z(Date.now())}`, `DTSTART:${z(due - 30 * MIN)}`, `DTEND:${z(due)}`, `SUMMARY:${e("Due: " + i.title)}`, `DESCRIPTION:${e((TYPES[i.type] || "") + (i.notes ? " · " + i.notes : ""))}`,
      "BEGIN:VALARM", "TRIGGER:-P1D", "ACTION:DISPLAY", `DESCRIPTION:${e(i.title + " is due tomorrow")}`, "END:VALARM", "END:VEVENT");
  });
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}
function showTextModal(title, desc, text){
  openModal("text", `${mHead(esc(title))}<div class="m-b"><p class="muted">${desc}</p><textarea id="txtOut" rows="12" style="width:100%;font-family:var(--font-mono);font-size:12px" readonly>${esc(text)}</textarea></div><div class="m-f"><button class="btn primary" type="button" data-act="copytxt">${IC.copy}Copy</button><button class="btn" type="button" data-act="mclose">Close</button></div>`, true);
  setTimeout(() => { const t = $("#txtOut"); if (t) { t.focus(); t.select(); } }, 60);
}
async function copyText(text, okMsg){
  try { await navigator.clipboard.writeText(text); toast(okMsg); return true; } catch (e) { return false; }
}

/* =========================================================
   Events
   ========================================================= */
document.addEventListener("click", async e => {
  const routeEl = e.target.closest("[data-route]");
  const a = e.target.closest("[data-act]");
  if (UI.notifOpen && !e.target.closest("#notifPanel") && !e.target.closest("#bellBtn")) closeNotif();
  if (routeEl && !a) { e.preventDefault(); closeDrawer(); if (modalKind) closeModal(); setRoute(routeEl.dataset.route); return; }
  const sc = e.target.closest("[data-scroll]");
  if (sc) { e.preventDefault(); const t = document.getElementById(sc.dataset.scroll); if (t) t.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
  if (!a) { if (e.target === $("#modalWrap")) closeModal(); return; }
  const act = a.dataset.act;
  const host = a.closest("[data-id]");
  const id = a.dataset.id || (host && host.dataset.id);
  const w = state && state.workspaces.length ? W() : null;
  if (a.tagName === "A") e.preventDefault();
  switch (act) {
    /* onboarding */
    case "onbnext": if (ONB.step === 0) ONB.name = ($("#onb-name") || {}).value || ""; ONB.step++; showOnboarding(); break;
    case "onbback": ONB.step = Math.max(0, ONB.step - 1); showOnboarding(); break;
    case "onbmode": ONB.mode = a.dataset.v; ONB.ws = ""; showOnboarding(); break;
    case "authmode": ACCOUNT.mode = a.dataset.v; showAuth(); break;
    case "logout": logout(); break;
    case "onbdone": ONB.due = $("#onb-due").value; ONB.demo = $("#onb-demo").checked; finishOnboarding(); break;
    /* shell */
    case "wsmenu": UI.wsMenu = !UI.wsMenu; renderSide(); break;
    case "wsswitch": state.active = a.dataset.ws; UI.wsMenu = false; UI.f = { type: "all", group: "all", risk: "all", status: "active", who: "all" }; UI.q = ""; UI.boardGroup = "all"; closeDrawer(); save(); setRoute(UI.route); seenInit = false; break;
    case "wsnew": UI.wsMenu = false; UI.newWs = null; openWsModal(); break;
    case "wsmode": UI.newWs.mode = a.dataset.v; UI.newWs.name = ""; openWsModal(); break;
    case "wscreate": { const N = UI.newWs; const nw = newWorkspace(N.mode, ($("#nw-name").value || WS_DEFAULT[N.mode]).trim(), $("#nw-demo").checked); state.workspaces.push(nw); state.active = nw.id; closeModal(); UI.forceNotice = true; muteWs = nw.id; runReminders(); muteWs = null; save(); setRoute("overview"); toast(`Created "${nw.name}".`); break; }
    case "wsdelete": confirmModal(`Delete "${w.name}"?`, "This removes the workspace and all its deadlines from this account. It can't be undone.", "Delete workspace", () => { state.workspaces = state.workspaces.filter(x => x.id !== w.id); state.active = state.workspaces[0].id; save(); setRoute("overview"); toast("Workspace deleted."); }, true); break;
    case "morenav": { const nav = navFor(w); openModal("more", `${mHead("Menu")}<div class="m-b"><div class="nav" style="margin:0">${nav.map(([r, l]) => `<a href="#${r}" data-route="${r}" style="color:var(--ink)" aria-current="${UI.route === r ? "page" : "false"}">${NAV_ICON[r]}${l}</a>`).join("")}</div>
        <div class="field"><span class="lbl">Workspace</span>${state.workspaces.map(x => `<button class="btn" type="button" data-act="wsswitch" data-ws="${x.id}" style="justify-content:flex-start">${esc(x.name)} · ${MODE_LABEL[x.mode]}${x.id === w.id ? " ✓" : ""}</button>`).join("")}<button class="btn ghost" type="button" data-act="wsnew">${IC.plus}New workspace</button></div>
        ${w.mode === "company" ? `<div class="field"><label for="viewAsM">Viewing as</label><select id="viewAsM">${[["manager", "Manager"]].concat(w.members.filter(m => m.id !== "me").map(m => [m.id, m.name + " (employee)"])).map(([v, l]) => `<option value="${v}" ${w.viewAs === v ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></div>` : ""}</div>`); break; }
    case "mclose": closeModal(); break;
    case "confirmok": { const f = UI.onConfirm; closeModal(); if (f) f(); break; }
    case "cleardemo": confirmModal("Clear sample data?", `This removes all sample deadlines${w.mode === "company" ? ", people" : ""} and ${GROUP_WORD[w.mode].toLowerCase()}s from "${esc(w.name)}". Your settings stay.`, "Clear sample data", () => { w.items = []; w.groups = []; w.activity = []; w.notices = []; w.members = w.members.filter(m => m.id === "me"); w.viewAs = "manager"; w.demo = false; closeDrawer(); save(); render(); toast("Sample data cleared. Press N to add your first deadline."); }, true); break;
    case "qa": closeDrawer(); openQuickAdd({ date: a.dataset.date, type: a.dataset.type }); break;
    case "drclose": closeDrawer(); break;
    case "settab": UI.setTab = a.dataset.v; render(); { const v = $("#view"); if (v) v.scrollTop = 0; } break;
    case "dlremove": { const it = findItem(UI.drawerId); if (!it || !it.due || !canEditItem(w, it)) break;
      confirmModal("Remove the deadline?", `"${esc(it.title)}" stays as a task${it.plan ? ` on ${esc(fmtDate(it.plan + "T12:00"))}` : ""}, without a deadline. It was due ${esc(fmtDue(it.due))}.`, "Remove deadline", () => {
        const before = clone(it); const was = fmtDue(it.due);
        it.due = null; it.kind = "todo"; touch(it); logItem(w, it, `Removed the deadline (was ${was})`); save(); render();
        toast(`"${it.title}" no longer has a deadline.`, () => { replaceItem(w, before); save(); render(); }); });
      break; }
    /* items */
    case "open": closeNotif(); if (modalKind === "rescue") closeModal(); if (id) openDrawer(id); break;
    case "toggle": completeItem(id, a); break;
    case "delete": deleteItem(id); break;
    case "focus": closeDrawer(); startFocus(id, 25); break;
    case "rescue": openRescue(id); break;
    case "tab": UI.drawerTab = a.dataset.v; renderDrawer(); break;
    case "setest": { const it = findItem(id); if (it) { it.estimate = +a.dataset.v; touch(it); logItem(w, it, `Estimated ${fmtH(it.estimate)} of work`); save(); render(); } break; }
    case "checkin": { const it = findItem(id); if (!it) break; const v = a.dataset.v;
      if (v === "done") { completeItem(it.id, a); break; }
      const before = clone(it); it.progress = +v; it.checkedAt = nowIso(); if (+v > 0 && it.status === "todo") it.status = "doing";
      touch(it); logItem(w, it, `Checked in: ${v}% done on "${it.title}"`); save(); render();
      const lv = levelOf(radar(w, Date.now()), it);
      toast(`Saved. "${it.title}" is now ${LV[lv].toLowerCase()}.`, () => { replaceItem(w, before); save(); render(); }); break; }
    case "checkinlater": { const it = findItem(id); if (!it) break; it.checkinSnooze = new Date(Date.now() + DAY).toISOString(); save(); render(); break; }
    case "abask": { const f = a.closest("[data-addbox]"); if (f) askFromAddBox(f.dataset.addbox); break; }
    case "drestuse": { const it = findItem(UI.drawerId); if (!it) break; const before = clone(it); it.estimate = +a.dataset.v; touch(it); logItem(w, it, `Updated estimate to ${fmtH(it.estimate)} based on past work`); save(); render(); toast(`Estimate set to ${fmtH(it.estimate)}.`, () => { replaceItem(w, before); save(); render(); }); break; }
    case "extyes": { const it = findItem(UI.drawerId); if (!it || !it.extension) break; const before = clone(it); const time = it.due.slice(10);
      it.originalDue = it.originalDue || it.due; it.due = it.extension.requested + time; it.extension.status = "approved"; it.extension.decidedAt = nowIso();
      touch(it); logItem(w, it, `Extension approved: deadline moved from ${fmtDue(it.originalDue)} to ${fmtDue(it.due)}`); save(); render();
      toast(`Deadline moved to ${fmtDue(it.due)}.`, () => { replaceItem(w, before); save(); render(); }); break; }
    case "extno": { const it = findItem(UI.drawerId); if (!it || !it.extension) break; it.extension.status = "declined"; it.extension.decidedAt = nowIso(); touch(it); logItem(w, it, "Extension declined; deadline unchanged"); save(); render(); toast("Noted. Your deadline stays the same; Rescue mode can help you finish."); break; }
    case "headstoggle": UI.headsOpen = !UI.headsOpen; render(); break;
    case "filters": UI.filtersOpen = !UI.filtersOpen; render(); break;
    case "advtoggle": { UI.advOpen = !UI.advOpen; a.setAttribute("aria-expanded", UI.advOpen); $("#advBox").hidden = !UI.advOpen; break; }
    case "drmore": { UI.drMore = !UI.drMore; a.setAttribute("aria-expanded", UI.drMore); $("#drMoreBox").hidden = !UI.drMore; break; }
    case "statgo": { const fv = a.dataset.filter; if (fv === "approvals") { setRoute("approvals"); break; } UI.f = { type: "all", group: "all", risk: "all", status: "active", who: "all" }; UI.q = ""; if (fv === "done") UI.f.status = "done"; else if (fv !== "active") UI.f.risk = fv; UI.groupBy = "time"; setRoute(listRoute()); break; }
    case "riskgo": UI.f = { type: "all", group: "all", risk: a.dataset.lv, status: "active", who: "all" }; UI.q = ""; setRoute(listRoute()); break;
    /* list filters */
    case "fstatus": UI.f.status = a.dataset.v; render(); break;
    case "groupby": UI.groupBy = a.dataset.v; render(); break;
    case "ftype": UI.f.type = UI.f.type === a.dataset.v ? "all" : a.dataset.v; render(); break;
    case "fgroup": UI.f.group = UI.f.group === a.dataset.v ? "all" : a.dataset.v; render(); break;
    case "frisk": UI.f.risk = "all"; render(); break;
    case "fclear": UI.f = { type: "all", group: "all", risk: "all", status: UI.f.status, who: "all" }; UI.q = ""; UI.groupBy = "time"; UI.sort = "due"; const gs = $("#gsearch"); if (gs) gs.value = ""; render(); break;
    /* calendar */
    case "calview": UI.calView = a.dataset.v; render(); break;
    case "calprev": if (UI.calView === "month") UI.calMonth = new Date(UI.calMonth.getFullYear(), UI.calMonth.getMonth() - 1, 1); else UI.calWeek = addDays(UI.calWeek, -7); render(); break;
    case "calnext": if (UI.calView === "month") UI.calMonth = new Date(UI.calMonth.getFullYear(), UI.calMonth.getMonth() + 1, 1); else UI.calWeek = addDays(UI.calWeek, 7); render(); break;
    case "caltoday": UI.calMonth = null; UI.calWeek = null; render(); break;
    case "calweek": { const d = new Date(a.dataset.date + "T12:00"); UI.calView = "week"; UI.calWeek = addDays(startOfDay(d), -((d.getDay() + 6) % 7)); render(); break; }
    /* planner/focus */
    case "flen": UI.flen = +a.dataset.v; render(); break;
    case "fstart": { const sel = $("#focusItem"); if (sel && sel.value) startFocus(sel.value, UI.flen || 25); break; }
    case "fpause": { const F = UI.focus; if (!F) break; if (F.running) { F.left = focusLeft(); F.running = false; } else { F.endAt = Date.now() + F.left * 1000; F.running = true; } render(); break; }
    case "ffinish": finishFocus(true); break;
    case "fstop": UI.focus = null; render(); toast("Session discarded."); break;
    /* plan tab */
    case "mstoggle": break;
    case "msdel": { const it = findItem(UI.drawerId); if (!it) break; const before = clone(it); it.milestones = it.milestones.filter(m => m.id !== a.dataset.ms); touch(it); save(); render(); toast("Step removed.", () => { replaceItem(w, before); save(); render(); }); break; }
    case "msadd": addStep(); break;
    case "suggest": { const it = findItem(UI.drawerId); if (it) { UI.sugg[it.id] = backwardPlan(it, Date.now()); renderDrawer(); } break; }
    case "sugdiscard": delete UI.sugg[UI.drawerId]; renderDrawer(); break;
    case "sugaccept": { const it = findItem(UI.drawerId); const sug = UI.sugg[UI.drawerId]; if (!it || !sug) break; const keep = sug.filter(s => s.keep && s.text.trim());
      it.milestones = (it.milestones || []).concat(keep.map(s => ({ id: s.id, text: s.text.trim(), hours: Number(s.hours) || 1, date: s.date, done: false })));
      if (!it.milestones.some(m => m.done) && it.progress) it.progress = 0;
      delete UI.sugg[it.id]; touch(it); logItem(w, it, `Added ${keep.length} planned steps to "${it.title}"`); save(); render(); toast(`Added ${keep.length} steps. Your deadline is unchanged.`); break; }
    case "depdel": { const it = findItem(UI.drawerId); if (it) { it.dependsOn = it.dependsOn.filter(x => x !== a.dataset.dep); touch(it); save(); render(); } break; }
    /* proof & approvals */
    case "recordproof": { const it = findItem(UI.drawerId); if (!it) break; it.evidence = { link: $("#ev-link").value.trim(), note: $("#ev-note").value.trim(), at: nowIso(), by: viewerId(w) }; touch(it); logItem(w, it, `Recorded submission for "${it.title}"`); if (!isDone(it)) completeItem(it.id, a); else { save(); render(); toast("Submission record updated."); } break; }
    case "submitreview": submitReview(UI.drawerId, $("#ev-link").value.trim(), $("#ev-note").value.trim()); break;
    case "approve": decide(UI.drawerId && $("#drawer").contains(a) ? UI.drawerId : id, true, ($("#drawer").contains(a) && $("#ap-note")) ? $("#ap-note").value.trim() : ""); break;
    case "changes": { const tid = $("#drawer").contains(a) ? UI.drawerId : id; const note = $("#drawer").contains(a) && $("#ap-note") ? $("#ap-note").value.trim() : ""; if (!note && !$("#drawer").contains(a)) { openDrawer(tid, "proof"); toast("Add a note explaining what to change."); break; } decide(tid, false, note); break; }
    case "applyreassign": reassign(id, a.dataset.to); break;
    /* rescue */
    case "rsChunk": { const it = findItem(UI.rescue.id); it.milestones = (it.milestones || []).filter(m => m.done).concat(UI.rescue.chunks.map(c => ({ id: c.id, text: c.text, hours: c.hours, date: c.date, done: false })));
      if (!(Number(it.estimate) > 0)) it.estimate = UI.rescue.chunks.reduce((s, c) => s + c.hours, 0);
      touch(it); logItem(w, it, `Split remaining work into ${UI.rescue.chunks.length} steps (Rescue mode)`); UI.rescue.done.chunk = true; save(); render(); renderRescue(); toast("Steps added to the plan."); break; }
    case "rsSched": { const it = findItem(UI.rescue.id); const sch = rescueSchedule(it, w, UI.rescue.target); it.milestones = (it.milestones || []).filter(m => m.done).concat(sch.out.map((x, k) => ({ id: rid("m"), text: `Work session ${k + 1}`, hours: x.h, date: x.date, done: false })));
      it.plannedFinish = UI.rescue.target; touch(it); logItem(w, it, `Made a revised schedule to finish by ${fmtDate(UI.rescue.target + "T12:00")}`); UI.rescue.done.sched = true; save(); render(); renderRescue(); toast("Revised schedule added. The recorded deadline is unchanged."); break; }
    case "rsOpen": closeModal(); openDrawer(id); break;
    case "rsUnblock": { const it = findItem(UI.rescue.id); it.status = "doing"; touch(it); logItem(w, it, `Marked "${it.title}" as in progress`); UI.rescue.done.block = true; save(); render(); renderRescue(); break; }
    case "rsCopy": { const t = $("#rs-msg").value; if (!(await copyText(t, "Message copied. Send it from your email or chat."))) { $("#rs-msg").select(); toast("Copying was blocked. The message is selected: press Ctrl+C (or ⌘C)."); } break; }
    case "rsLogExt": { const it = findItem(UI.rescue.id); it.extension = { requested: UI.rescue.ext, at: nowIso(), status: "pending" }; touch(it); logItem(w, it, `Asked for an extension to ${fmtDate(UI.rescue.ext + "T12:00")}`); UI.rescue.done.ext = true; save(); render(); renderRescue(); toast("Logged. Change the deadline yourself if the extension is approved."); break; }
    case "rsReassign": { const to = $("#rs-who").value; reassign(UI.rescue.id, to); UI.rescue.done.reassign = true; renderRescue(); break; }
    case "rsNotify": { const it = findItem(UI.rescue.id); const me = memberOf(w, viewerId(w)); const note = $("#rs-note").value.trim();
      w.notices = w.notices || []; w.notices.unshift({ id: rid("n"), t: nowIso(), itemId: it.id, from: viewerId(w), text: `${me ? me.name : "Someone"} needs help with "${it.title}" (${LV[levelOf(radar(w, Date.now()), it)]})${note ? `: ${note}` : ""}` });
      logItem(w, it, "Notified manager (Rescue mode)"); UI.rescue.done.notify = true; UI.forceNotice = true; save(); render(); renderRescue(); runReminders(); toast("Your manager will see this in their notifications."); break; }
    /* notifications */
    case "readall": inboxFor(w).forEach(n => n.read = true); markRead("all"); save(); renderBell(); render(); break;
    case "notifgo": { const n = (state.inbox || []).find(x => x.key === a.dataset.key); if (n) { n.read = true; markRead([n.key]); } save(); closeNotif(); if (a.dataset.id && findItem(a.dataset.id)) { render(); openDrawer(a.dataset.id); } else render(); break; }
    /* settings */
    case "thdefault": w.settings.thresholds = { critical: 100, risk: 70, attention: 40 }; save(); render(); toast("Radar rules reset."); break;
    case "gadd": { const v = $("#gnew").value.trim(); if (!v) { $("#gnew").focus(); break; } w.groups.push({ id: rid("g"), name: v.slice(0, 40), color: COLORS[w.groups.length % COLORS.length] }); save(); render(); toast(`Added ${GROUP_WORD[w.mode].toLowerCase()} "${v}".`); break; }
    case "gdel": { const g = groupOf(w, a.dataset.g); confirmModal(`Delete "${g.name}"?`, `Deadlines in it are kept and moved to no ${GROUP_WORD[w.mode].toLowerCase()}.`, "Delete", () => { w.groups = w.groups.filter(x => x.id !== g.id); w.items.forEach(i => { if (i.groupId === g.id) i.groupId = null; }); save(); render(); }, true); break; }
    case "madd": { const n = $("#mnew").value.trim(); if (!n) { $("#mnew").focus(); break; } w.members.push({ id: rid("u"), name: n.slice(0, 50), role: "Team member", dept: $("#mdept").value.trim(), capacity: 40, access: "Employee" }); save(); render(); toast(`Added ${n} as a placeholder. Invitations need accounts.`); break; }
    case "mdel": { const m = memberOf(w, a.dataset.m); confirmModal(`Remove ${m.name}?`, "Their deadlines are reassigned to you.", "Remove", () => { w.items.forEach(i => { if (i.assignee === m.id) i.assignee = "me"; if (i.reviewer === m.id) i.reviewer = null; }); w.members = w.members.filter(x => x.id !== m.id); if (w.viewAs === m.id) w.viewAs = "manager"; save(); render(); }, true); break; }
    case "exportics": { const text = icsText(w); let ok = false;
      try { const dl = window.claude && window.claude.use ? await window.claude.use("downloads") : null; if (dl) { await dl.save({ filename: `${w.name.replace(/[^\w-]+/g, "-")}-deadlines.ics`, data: text }); ok = true; toast("Calendar file ready."); } } catch (err) { if (err && err.code === "declined") { toast("Download cancelled."); break; } }
      if (!ok) showTextModal("Calendar export", "Downloads aren't available here. Copy this text into a file named deadlines.ics and open it with your calendar app.", text); break; }
    case "copybackup": { const text = JSON.stringify(state); if (!(await copyText(text, "Backup copied. Paste it somewhere safe."))) showTextModal("Backup", "Copy all of this text and keep it somewhere safe.", text); break; }
    case "copytxt": { const t = $("#txtOut"); if (t && !(await copyText(t.value, "Copied."))) { t.select(); toast("Press Ctrl+C (or ⌘C) to copy the selected text."); } break; }
    case "importbackup": openModal("import", `${mHead("Restore from backup")}<div class="m-b"><p class="muted">Paste a backup you copied earlier. This replaces everything currently saved.</p><textarea id="impText" rows="8" style="width:100%;font-family:var(--font-mono);font-size:12px" data-autofocus></textarea><p class="note" id="impErr" style="color:var(--over)"></p></div><div class="m-f"><button class="btn ghost" type="button" data-act="mclose">Cancel</button><button class="btn primary" type="button" data-act="impgo">Restore</button></div>`); break;
    case "impgo": { let o; try { o = JSON.parse($("#impText").value); } catch (err) { $("#impErr").textContent = "That isn't a valid backup. Paste the whole text you copied."; break; }
      if (!o || !Array.isArray(o.workspaces) || !o.workspaces.length || !o.workspaces.every(x => x && Array.isArray(x.items) && x.settings)) { $("#impErr").textContent = "This text doesn't look like a Deadline Tracker backup."; break; }
      state = o; state.read = state.read || {}; if (!state.workspaces.find(x => x.id === state.active)) state.active = state.workspaces[0].id; closeModal(); save(); setRoute("overview"); toast("Backup restored."); break; }
    case "resetall": confirmModal("Reset everything?", "All workspaces, deadlines and settings saved for you will be deleted. Copy a backup first if you might want them.", "Delete everything", () => { state = null; try { localStorage.removeItem(LS_V2); localStorage.removeItem(LS_V1); } catch (err) {} if (Store.mode === "db" && Store.ref) Store.ref.delete().catch(() => {}); if (Store.mode === "server") apiJSON("DELETE", "/api/state").then(r => { if (r.ok) ACCOUNT.version = 0; }).catch(() => {}); ONB.step = 0; ONB.mode = null; closeDrawer(); render(); }, true); break;
  }
});
function addStep(){
  const w = W(); const it = findItem(UI.drawerId); const inp = $("#ms-new"); if (!it || !inp) return;
  const v = inp.value.trim(); if (!v) return;
  it.milestones = it.milestones || []; it.milestones.push({ id: rid("m"), text: v.slice(0, 120), hours: 1, date: null, done: false });
  touch(it); save(); render(); setTimeout(() => { const n = $("#ms-new"); if (n) n.focus(); }, 0);
}
$("#toastUndo").addEventListener("click", () => { if (undoFn) { const f = undoFn; undoFn = null; f(); } $("#toast").classList.remove("on"); });
$("#qaBtn").addEventListener("click", () => openQuickAdd());
$("#themeBtn").addEventListener("click", () => {
  const next = currentTheme() === "dark" ? "light" : "dark";
  themePref = next; try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
  applyTheme(next); if (state && state.workspaces && state.workspaces.length) render();
  toast(next === "dark" ? "Dark mode on." : "Light mode on.");
});
$("#fab").addEventListener("click", () => openQuickAdd());
$("#scrim").addEventListener("click", closeDrawer);
$("#bellBtn").addEventListener("click", e => { e.stopPropagation(); UI.notifOpen = !UI.notifOpen; if (UI.notifOpen) renderNotif(); else closeNotif(); });
$("#gsearch").addEventListener("input", e => { UI.q = e.target.value; const lr = listRoute(); if (UI.route !== lr && UI.route !== "mywork") { UI.f.status = "all"; setRoute(lr); setTimeout(() => { const g = $("#gsearch"); g.focus(); }, 0); } else render(); });

document.addEventListener("input", e => {
  const t = e.target; const id = t.id || "";
  if (t.classList.contains("ab-input")) { AB.drafts[id] = t.value; refreshAddHint(id); t.style.height = "auto"; t.style.height = Math.min(t.scrollHeight, 140) + "px"; return; }
  if (t.dataset.abwho) { AB.who[t.dataset.abwho] = t.value; refreshAddHint(t.dataset.abwho); return; }
  if (id === "onb-due") { ONB.due = t.value; const h = $("#onb-due-hint"); if (h) h.innerHTML = onbHint(); return; }
  if (id === "listSearch") { UI.q = t.value; const g = $("#gsearch"); if (g) g.value = t.value; render(); return; }
  if (id === "dr-prog") { const o = $("#dr-prog-o"); if (o) o.textContent = t.value + "%"; return; }
  if (id === "pf-hpd") { $("#pf-hpd-o").textContent = fmtH(+t.value); return; }
  if (t.dataset.th) { t.nextElementSibling.textContent = t.value + "%"; return; }
  if (t.dataset.st != null && UI.sugg[UI.drawerId]) { UI.sugg[UI.drawerId][+t.dataset.st].text = t.value; return; }
});
document.addEventListener("submit", e => { if (e.target.id === "authForm") { e.preventDefault(); submitAuth(); } });
document.addEventListener("submit", e => { const f = e.target.closest && e.target.closest("[data-addbox]"); if (f) { e.preventDefault(); submitAddBox(f.dataset.addbox); } });
document.addEventListener("change", e => {
  const t = e.target; const id = t.id || ""; if (!state || !state.workspaces.length) return;
  if (t.closest && t.closest(".topics")) return;
  const w = W();
  // drawer fields
  if (id.startsWith("dr-") || t.dataset.mstext || t.dataset.mshours || t.dataset.act === "mstoggle") {
    const it = findItem(UI.drawerId || (t.closest("[data-id]") || {}).dataset?.id); if (!it || !canEditItem(w, it)) return;
    const msId = t.dataset.ms || t.dataset.mstext || t.dataset.mshours;
    if (t.dataset.act === "mstoggle") { const m = it.milestones.find(x => x.id === msId); if (m) { m.done = t.checked; touch(it); logItem(w, it, `${m.done ? "Finished" : "Reopened"} step "${m.text}"`); if (progressOf(it) === 100 && !isDone(it)) toast(`All steps done. Mark "${it.title}" as done when it's submitted.`); save(); render(); } return; }
    if (t.dataset.mstext) { const m = it.milestones.find(x => x.id === msId); if (m && t.value.trim()) { m.text = t.value.trim(); touch(it); save(); render(); } return; }
    if (t.dataset.mshours) { const m = it.milestones.find(x => x.id === msId); if (m) { m.hours = Math.max(.25, +t.value || 1); touch(it); save(); render(); } return; }
    const v = t.value; let txt = null;
    switch (id) {
      case "dr-title": if (!v.trim()) { t.value = it.title; return; } it.title = v.trim().slice(0, 140); break;
      case "dr-date": case "dr-time": { const dv = $("#dr-date").value, tv = $("#dr-time").value || "23:59"; if (!dv) { toast("A deadline needs a date."); render(); return; } const old = it.due; it.due = `${dv}T${tv}`; if (old !== it.due) txt = `Changed the deadline from ${fmtDue(old)} to ${fmtDue(it.due)}`; break; }
      case "dr-type": it.type = v; break;
      case "dr-group": it.groupId = v || null; break;
      case "dr-pri": it.priority = v; txt = `Set priority to ${PRI[v].label}`; break;
      case "dr-status": if (v === "done") { completeItem(it.id); return; } if (v === "review") { if (!canManage(w)) { UI.drawerTab = "proof"; render(); return; } } if (isDone(it)) it.doneAt = null; txt = `Changed status from ${STATUSES[it.status]} to ${STATUSES[v]}`; it.status = v; break;
      case "dr-repeat": it.repeat = v; break;
      case "dr-assignee": { const m = memberOf(w, v); txt = `Reassigned to ${m ? m.name : ""}`; it.assignee = v; break; }
      case "dr-reviewer": it.reviewer = v || null; break;
      case "dr-needs": it.needsApproval = t.checked; break;
      case "dr-est": it.estimate = v === "" ? null : Math.max(0, +v); txt = it.estimate ? `Estimated ${fmtH(it.estimate)} of work` : null; break;
      case "dr-prog": it.progress = +v; txt = `Updated progress to ${v}%`; if (it.status === "todo" && +v > 0) it.status = "doing"; break;
      case "dr-link": it.link = v.trim(); break;
      case "dr-notes": it.notes = v; break;
      case "dr-dep": if (v) { it.dependsOn = (it.dependsOn || []).concat(v); const d = findItem(v, w); txt = `Now waits on "${d ? d.title : ""}"`; } break;
      default: return;
    }
    touch(it); if (txt) logItem(w, it, txt); save(); setTimeout(render, 0); return;
  }
  if (t.dataset.act === "mstoggle" || t.closest(".topics")) return;
  if (t.dataset.sk != null && UI.sugg[UI.drawerId]) { UI.sugg[UI.drawerId][+t.dataset.sk].keep = t.checked; renderDrawer(); return; }
  if (t.dataset.sh != null && UI.sugg[UI.drawerId]) { UI.sugg[UI.drawerId][+t.dataset.sh].hours = Math.max(.25, +t.value || .5); return; }
  if (t.dataset.sd != null && UI.sugg[UI.drawerId]) { UI.sugg[UI.drawerId][+t.dataset.sd].date = t.value; return; }
  if (id === "rs-target") { UI.rescue.target = t.value || UI.rescue.target; UI.rescue.done.sched = false; renderRescue(); return; }
  if (id === "rs-ext") { UI.rescue.ext = t.value || UI.rescue.ext; UI.rescue.msg = null; renderRescue(); return; }
  if (id === "rs-msg") { UI.rescue.msg = t.value; return; }
  if (id === "viewAs" || id === "viewAsM") { w.viewAs = t.value; UI.f.who = "all"; closeDrawer(); if (modalKind) closeModal(); save(); setRoute(routeAllowed(UI.route) ? UI.route : "overview"); seenInit = false; reminderBoot = true; UI.forceNotice = true; runReminders(); renderBell(); toast(t.value === "manager" ? "Viewing as manager." : `Viewing as ${memberOf(w, t.value).name} (employee).`); return; }
  if (id === "sortSel") { UI.sort = t.value; render(); return; }
  if (id === "whoSel") { UI.f.who = t.value; render(); return; }
  if (id === "boardGroup") { UI.boardGroup = t.value; render(); return; }
  // settings
  const s = w.settings;
  if (id === "pf-name") { state.user.name = t.value.trim(); state.workspaces.forEach(x => { const me = memberOf(x, "me"); if (me && t.value.trim()) me.name = t.value.trim(); }); }
  else if (id === "pf-ws") { if (t.value.trim()) w.name = t.value.trim(); }
  else if (id === "pf-hpd") { s.hoursPerDay = +t.value; if (w.mode !== "company") memberOf(w, "me").capacity = s.hoursPerDay * s.workdays.length; }
  else if (t.dataset.wd != null) { const k = +t.dataset.wd; if (t.checked) s.workdays = [...new Set(s.workdays.concat(k))].sort(); else if (s.workdays.length > 1) s.workdays = s.workdays.filter(x => x !== k); else { t.checked = true; toast("Keep at least one day."); return; } }
  else if (id === "pf-tz") s.tz = t.value;
  else if (t.dataset.th) { s.thresholds[t.dataset.th] = +t.value; const th = s.thresholds; if (th.risk > th.critical) th.risk = th.critical; if (th.attention > th.risk) th.attention = th.risk; }
  else if (t.dataset.rem) { const v = +t.dataset.rem; s.reminders = t.checked ? [...new Set(s.reminders.concat(v))] : s.reminders.filter(x => x !== v); }
  else if (id === "rm-custom") s.customReminder = Math.max(0, Math.round(+t.value * 60) || 0);
  else if (id === "pf-desktop") { if (t.checked) { t.checked = false; enableDesktop(); } else { state.desktopAlerts = false; save(); toast("Desktop alerts are off."); } return; }
  else if (id === "pf-od") s.overdueAlerts = t.checked;
  else if (id === "pf-sum") s.dailySummary = t.checked;
  else if (id === "pf-quiet") s.quietOn = t.checked;
  else if (id === "pf-qf") s.quietFrom = t.value || s.quietFrom;
  else if (id === "pf-qt") s.quietTo = t.value || s.quietTo;
  else if (id === "pf-today") s.dueToday = t.checked;
  else if (id === "pf-high") s.highDone = t.checked;
  else if (t.dataset.gcolor) { groupOf(w, t.dataset.gcolor).color = t.value; }
  else if (t.dataset.gname) { if (t.value.trim()) groupOf(w, t.dataset.gname).name = t.value.trim(); }
  else if (t.dataset.gteacher != null) { groupOf(w, t.dataset.gteacher).teacher = t.value.trim(); }
  else if (t.dataset.mrole) { memberOf(w, t.dataset.mrole).access = t.value; }
  else if (t.dataset.mcap) { memberOf(w, t.dataset.mcap).capacity = clamp(+t.value || 40, 1, 80); }
  else return;
  save(); setTimeout(render, 0);
  if (t.dataset.rem || /^(rm-custom|pf-od|pf-sum|pf-quiet|pf-qf|pf-qt|pf-today|pf-high)$/.test(id)) syncPrefs();
});
// topic checkboxes on the exams page and add-topic inputs
document.addEventListener("change", e => {
  const t = e.target; if (!t.closest || !t.closest(".topics")) return;
  const w = W(); const card = t.closest("[data-id]"); const it = card && findItem(card.dataset.id); if (!it) return;
  const m = it.milestones.find(x => x.id === t.dataset.ms); if (!m) return;
  m.done = t.checked; touch(it); logItem(w, it, `${m.done ? "Revised" : "Unticked"} topic "${m.text}"`); save(); render();
  if (m.done) burst(t);
}, true);
document.addEventListener("keydown", e => {
  const t = e.target;
  if (e.key === "Enter" && t.dataset && t.dataset.addtopic) { e.preventDefault(); const w = W(); const it = findItem(t.dataset.addtopic); const v = t.value.trim(); if (it && v) { it.milestones = it.milestones || []; it.milestones.push({ id: rid("m"), text: v.slice(0, 100), hours: 1, done: false, date: null }); if (it.estimate) it.estimate = Number(it.estimate) + 1; touch(it); save(); render(); setTimeout(() => { const n = document.getElementById("addtopic-" + it.id); if (n) n.focus(); }, 0); } return; }
  if (e.key === "Enter" && t.id === "ms-new") { e.preventDefault(); addStep(); return; }
  if (e.key === "Enter" && !e.shiftKey && t.classList && t.classList.contains("ab-input")) { e.preventDefault(); submitAddBox(t.id); return; }
  if (e.key === "Enter" && t.id === "onb-name") { e.preventDefault(); const b = document.querySelector("[data-act=onbnext]"); if (b) b.click(); return; }
  if ((e.key === "Enter" || e.key === " ") && t.getAttribute && t.getAttribute("role") === "button" && t.dataset.act) { e.preventDefault(); t.click(); return; }
  if (e.key === "Escape") { if (modalKind) { closeModal(); return; } if (UI.notifOpen) { closeNotif(); return; } if (UI.drawerId) { closeDrawer(); return; } if (UI.wsMenu) { UI.wsMenu = false; renderSide(); return; } }
  const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName) || t.isContentEditable;
  if (!state || !state.workspaces.length || modalKind) return;
  if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) { e.preventDefault(); openQuickAdd(); return; }
  if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === "n" || e.key === "N") { e.preventDefault(); openQuickAdd(); }
  else if (e.key === "/") { e.preventDefault(); const s = $("#listSearch") || $("#gsearch"); if (s && s.offsetParent) s.focus(); else { setRoute(listRoute()); setTimeout(() => { const l = $("#listSearch"); if (l) l.focus(); }, 0); } }
});
// drag & drop (board columns, calendar days)
let dragId = null;
document.addEventListener("dragstart", e => { const d = e.target.closest && e.target.closest("[data-drag]"); if (!d || d.getAttribute("draggable") !== "true") return; dragId = d.dataset.drag; d.classList.add("dragging"); try { e.dataTransfer.setData("text/plain", dragId); e.dataTransfer.effectAllowed = "move"; } catch (err) {} });
document.addEventListener("dragend", () => { dragId = null; $$(".dragging").forEach(x => x.classList.remove("dragging")); $$(".drop").forEach(x => x.classList.remove("drop")); });
document.addEventListener("dragover", e => { if (!dragId) return; const z = e.target.closest("[data-col],[data-day]"); if (!z) return; e.preventDefault(); $$(".drop").forEach(x => x !== z && x.classList.remove("drop")); z.classList.add("drop"); });
document.addEventListener("drop", e => { if (!dragId) return; const z = e.target.closest("[data-col],[data-day]"); if (!z) return; e.preventDefault(); const id = dragId; dragId = null; z.classList.remove("drop"); if (z.dataset.col) setStatus(id, z.dataset.col); else moveDue(id, z.dataset.day); });
// radar tooltip
document.addEventListener("mouseover", e => { const b = e.target.closest && e.target.closest(".blip"); const tip = $("#radarTip"); if (!tip) return; if (!b) { tip.hidden = true; return; } const box = $("#radar").getBoundingClientRect(); const r = b.getBoundingClientRect(); tip.textContent = b.dataset.tip; tip.style.left = (r.left + r.width / 2 - box.left) + "px"; tip.style.top = (r.top - box.top) + "px"; tip.hidden = false; });
document.addEventListener("focusin", e => { if (e.target.classList && e.target.classList.contains("blip")) e.target.dispatchEvent(new MouseEvent("mouseover", { bubbles: true })); });
document.addEventListener("toggle", e => { if (e.target.classList && e.target.classList.contains("nav-more")) UI.navMore = e.target.open; }, true);
window.addEventListener("hashchange", () => { const h = location.hash.slice(1); if (h && h !== UI.route && state && state.workspaces.length && /^[a-z]+$/.test(h)) setRoute(h, false); });

/* =========================================================
   Clock
   ========================================================= */
let lastSig = "", tickN = 0;
setInterval(() => {
  if (!state || !state.workspaces || !state.workspaces.length) return;
  const now = Date.now(); tickN++;
  $$("[data-cd]").forEach(el => { el.textContent = countdown(el.dataset.cd, now); });
  $$("[data-ecd]").forEach(el => { const v = examCountdown(el.dataset.ecd, now); const bs = el.querySelectorAll("b"); bs[0].textContent = v[0]; bs[1].textContent = v[1]; bs[2].textContent = v[2]; if (bs[3]) bs[3].textContent = pad(v[3]); });
  if (UI.focus) {
    const left = focusLeft();
    if (UI.focus.running && left <= 0) { finishFocus(true, true); return; }
    const tm = `${pad(Math.floor(left / 60))}:${pad(Math.floor(left % 60))}`;
    const a = $("#fringTm"), b = $("#fmTm"); if (a) a.textContent = tm; if (b) b.textContent = tm;
    const p1 = $("#fringPr"); if (p1) p1.style.strokeDashoffset = (2 * Math.PI * 56 * (1 - left / UI.focus.total)).toFixed(1);
    const p2 = $("#fmPr"); if (p2) p2.style.strokeDashoffset = (2 * Math.PI * 14 * (1 - left / UI.focus.total)).toFixed(1);
  }
  runReminders();
  if (tickN % 15 === 0) {
    const w = W(); const R = radar(w, now);
    const sig = w.items.map(i => levelOf(R, i)).join("") + ymd(now);
    if (sig !== lastSig) { lastSig = sig; if (!modalKind && !(UI.route === "assistant" && document.activeElement && document.activeElement.id === "aiInput")) render({ soft: true }); }
  }
}, 1000);

/* =========================================================
   Start
   ========================================================= */
function afterLoad(){
  if (!state || !state.workspaces || !state.workspaces.length) { render(); return; }
  state.read = state.read || {}; state.inbox = state.inbox || []; state.fired = state.fired || {};
  // Older saves may lack fields that were added later; fill only what's missing, never overwrite.
  state.workspaces.forEach(x => { x.chat = x.chat || []; x.items.forEach(i => {
    const base = mkItem(x, {}); Object.keys(base).forEach(k => { if (i[k] === undefined) i[k] = base[k]; });
    i.kind = i.due ? "deadline" : "todo";
  }); });
  if (!state.workspaces.find(x => x.id === state.active)) state.active = state.workspaces[0].id;
  if (Store.mode !== "server") { try { localStorage.setItem(LS_V2, JSON.stringify(state)); } catch (e) {} }
  const h = location.hash.slice(1);
  UI.route = routeAllowed(h) ? h : (routeAllowed(UI.route) ? UI.route : "overview");
  UI.animate = true; closeModalIfOnb();
  render(); reminderBoot = true; UI.forceNotice = true; runReminders(); renderBell();
}
function closeModalIfOnb(){ $("#onb").hidden = true; }
/* Test seam: only exposed when the page is opened with ?dt-test (used by the automated tests). */
if (/[?&]dt-test\b/.test(location.search)) {
  window.__DT_TEST__ = { parseQuick, extractFromText, radar, estimateInsight, checkinCandidate, rulesPlan, runReminders, AI, planFor, backwardPlan, chunkPlan, conflicts, notifs, availHours, progressOf, remainingH, mkItem, newWorkspace, levelOf,
    get state(){ return state; }, set state(v){ state = v; }, W, render, save };
}
// Start: with the Deadline Tracker server you log in and your data comes from your account;
// anywhere else (claude.ai, a plain file server) it's saved in this browser as before.
(async function boot(){
  const acct = await checkAccounts();
  if (acct) {
    ACCOUNT.on = true; ACCOUNT.user = acct.user;
    if (!acct.user) { showAuth(); detectAI(); return; }
    await initServerStore();
  } else initStore();
  afterLoad();
  if (ACCOUNT.importable && !state) offerImport();
  detectAI();
})();
})();
</script>
</body>
</html>
