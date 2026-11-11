
/* =========================================================
   To-Do system: Today / Upcoming / Completed
   ========================================================= */
const REM_OPTS = [[0, "At the time"], [15, "15 min before"], [60, "1 hour before"], [1440, "1 day before"]];
// One task model: any task can have a day to work on it (plan) and/or a hard deadline (due).
// "kind" is kept on saved items for older versions, but behaviour only looks at plan and due.
const isTodo = it => !it.due;
const dueDay = it => it.due ? ymd(new Date(it.due)) : null;
const dayOf = it => it.plan || dueDay(it);
const todayKey = now => ymd(new Date(now));
const tomorrowKey = now => ymd(addDays(startOfDay(now), 1));
function myTasks(w){ return w.items.filter(i => w.mode !== "company" || i.assignee === viewerId(w)); }
// On today's list: planned for today or due today (plus anything finished today).
// A task whose day has passed without being finished is "missed": it is NOT carried to today. It stays on its own
// day, where History and the Calendar show it as Missed. Nothing is deleted or copied.
// Anything with a hard deadline is different: it keeps showing until it is done, so a deadline can't go unnoticed.
function isForToday(i, t){
  const d = dayOf(i); if (!d) return false;
  if (d === t || dueDay(i) === t) return true;
  if (d > t) return false;
  if (isDone(i)) return !!i.doneAt && ymd(i.doneAt) === t;
  return !!i.due;
}
// a plain task (no deadline) left unfinished on a day that is now over
const isMissed = (i, t) => !i.due && !isDone(i) && !!i.plan && i.plan < t;
function todayTodos(w, now){ const t = todayKey(now); return myTasks(w).filter(i => isForToday(i, t)); }
// counts exactly what the Today list shows
function todayProgress(w, now){
  const list = todayTodos(w, now);
  return { done: list.filter(isDone).length, total: list.length };
}
const timeOf = it => it.time || (it.due && !it.plan ? it.due.slice(11, 16) : "");
function todoSort(a, b){
  if (isDone(a) !== isDone(b)) return isDone(a) ? 1 : -1;
  const ta = timeOf(a), tb = timeOf(b);
  if (ta !== tb) return !ta ? 1 : !tb ? -1 : ta.localeCompare(tb);
  return PRI[a.priority].rank - PRI[b.priority].rank || (a.order || 0) - (b.order || 0) || new Date(a.createdAt) - new Date(b.createdAt);
}
function todoRowHTML(it, opts = {}){
  const w = W(); const now = CTX.now; const done = isDone(it); const can = canEditItem(w, it);
  const t = todayKey(now);
  const when = [];
  const late = !done && it.due && new Date(it.due).getTime() < now;
  if (opts.showDay && it.plan) when.push(it.plan === tomorrowKey(now) ? "Tomorrow" : fmtDate(it.plan + "T12:00"));
  if (it.time) when.push(fmtTime(`${it.plan || t}T${it.time}`));
  if (late) when.push(`<span class="tdue late">Overdue · was due ${fmtDate(it.due)}</span>`);
  else if (it.due) when.push(`<span class="tdue">${IC.flag}Due ${dueDay(it) === t ? "today" : dueDay(it) === tomorrowKey(now) ? "tomorrow" : fmtDate(it.due)} ${fmtTime(it.due)}</span>`);
  const rem = (it.reminders || []).length;
  return `<div class="todo tp-${it.priority}${done ? " done" : ""}" data-id="${it.id}">
    <button class="tcheck" type="button" data-act="toggle" aria-label="${done ? "Mark as not done" : "Complete"}: ${esc(it.title)}" ${can ? "" : "disabled"}>${IC.check}</button>
    <button class="tbody" type="button" data-act="open" aria-label="Edit ${esc(it.title)}">
      <span class="t">${esc(it.title)}</span>
      <span class="tm">
        <span class="pdot" title="${PRI[it.priority].label} priority"></span><span>${PRI[it.priority].label}</span>
        ${when.map(x => `<span>${x}</span>`).join("")}
        ${it.status === "doing" && !done ? `<span class="tstatus">In progress</span>` : ""}
        ${rem && !done ? `<span class="tbell" title="${rem} reminder${rem > 1 ? "s" : ""}">${IC.bell}</span>` : ""}
        ${it.source === "ai" ? `<span class="tai" title="Created with the AI assistant">AI</span>` : ""}
        ${done && it.doneAt && opts.showDone ? `<span>Done ${fmtDate(it.doneAt)}</span>` : ""}
      </span>
    </button>
    <div class="tacts">
      ${!done && can && it.plan !== tomorrowKey(now) ? `<button class="ib" type="button" data-act="todotomorrow" aria-label="Move to tomorrow" title="Move to tomorrow">${IC.forward}</button>` : ""}
      <button class="ib" type="button" data-act="open" aria-label="Edit" title="Edit">${IC.edit}</button>
      ${can ? `<button class="ib del" type="button" data-act="tododel" aria-label="Delete" title="Delete">${IC.trash}</button>` : ""}
    </div>
  </div>`;
}
function progressRing(done, total, size = 64){
  const p = total ? done / total : 0; const r = size / 2 - 6; const c = 2 * Math.PI * r;
  return `<svg class="pring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="pr-track"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="pr-val" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${(c * (1 - p)).toFixed(1)}"/></svg>`;
}
// Today / Upcoming / Done tabs and their list; lives in the Today card on Home.
function todoTabsHTML(w){
  const now = CTX.now; const tab = UI.todoTab || "today";
  const all = myTasks(w); const t = todayKey(now), tm = tomorrowKey(now);
  const up = all.filter(i => !isDone(i) && !isForToday(i, t));
  let body = "";
  if (tab === "today") {
    const list = todayTodos(w, now).sort(todoSort);
    body = list.length ? `<div class="tgroup">${list.map(i => todoRowHTML(i)).join("")}</div>`
      : `<div class="todo-empty"><h3>Nothing planned for today</h3><p>Add something in the box above.</p></div>`;
  } else if (tab === "upcoming") {
    const wk = ymd(addDays(startOfDay(now), 7));
    const groups = [
      ["Tomorrow", up.filter(i => dayOf(i) === tm)],
      ["Later this week", up.filter(i => dayOf(i) > tm && dayOf(i) <= wk)],
      ["Later", up.filter(i => dayOf(i) > wk)],
      ["No date", up.filter(i => !dayOf(i))]
    ].filter(g => g[1].length);
    body = groups.map(([l, list]) => `<div class="tgroup"><h4>${l}<span>${list.length}</span></h4>${list.sort((a, b) => (dayOf(a) || "9").localeCompare(dayOf(b) || "9") || todoSort(a, b)).map(i => todoRowHTML(i, { showDay: l !== "Tomorrow" })).join("")}</div>`).join("")
      || `<div class="todo-empty">${IC.calendar}<h3>Nothing coming up</h3><p>Tasks and deadlines for later days show here.</p></div>`;
  } else {
    const list = all.filter(isDone).sort((a, b) => new Date(b.doneAt || 0) - new Date(a.doneAt || 0)).slice(0, 60);
    body = list.length ? `<div class="tgroup">${list.map(i => todoRowHTML(i, { showDone: true, showDay: true })).join("")}</div>` : `<div class="todo-empty">${IC.check}<h3>No completed tasks yet</h3><p>Tick a task to finish it. It'll show up here.</p></div>`;
  }
  const counts = { today: todayTodos(w, now).filter(i => !isDone(i)).length, upcoming: up.length, done: all.filter(isDone).length };
  return `<div class="todo-bar"><div class="seg" role="tablist" aria-label="Task views">${[["today", "Today"], ["upcoming", "Upcoming"], ["done", "Done"]].map(([v, l]) => `<button type="button" role="tab" data-act="todotab" data-v="${v}" aria-pressed="${tab === v}" aria-selected="${tab === v}">${l}${counts[v] ? ` <span class="cnt">${counts[v]}</span>` : ""}</button>`).join("")}</div></div>
    <div class="todo-list" id="todoList">${body}</div>`;
}

/* =========================================================
   Daily tasks: a simple list for today's activities.
   Plain tasks (no deadline) with a title and an optional short description; new ones go on today.
   They're ordinary items, so they save with everything else (to the account when signed in).
   ========================================================= */
const dailyAll = w => myTasks(w).filter(i => !i.due);

/* ---------- Day records (carry-forward, Daily progress, History) ----------
   One task is one item; it is never copied. Three dates are kept apart: createdAt (never changed), plan (the day
   it is scheduled for) and doneAt (when it was really finished). Every change of plan is added to it.moves
   ({ at, from, to }), so we can tell which day a task belonged to on any date.
   For a day D a task is:
     done     finished on D (whatever day it was scheduled for)
     pending  scheduled for D and not finished on D. Once D is over this is "missed"; it is not carried to D+1
     moved    it was D's task, and on D it was rescheduled to a later day (not counted in D's total)
   A task finished after D is still "pending" for D: nothing is counted as done on a day it wasn't done.
   Each day's record (numbers + task list) is saved in w.dayLog[D] while D is today and never changed afterwards,
   so history survives later edits and deletions. Days without a record are worked out from the tasks. */
const doneDay = i => isDone(i) ? (i.doneAt ? ymd(i.doneAt) : i.plan || null) : null;
const origPlan = i => (Array.isArray(i.moves) && i.moves.length && i.moves[0].from) || (Array.isArray(i.movedFrom) && i.movedFrom[0]) || i.plan || null;
// the day a task was scheduled for, as things stood at the end of day d
function planOn(i, d){
  const m = Array.isArray(i.moves) ? i.moves : [];
  if (!m.length) return i.plan || null;
  let p = m[0].from || null;
  for (const x of m) if (ymd(x.at) <= d) p = x.to;
  return p;
}
// Every change of a task's day goes through here, so the movement history is always kept.
function setPlan(it, dayKey){
  const from = it.plan || null; dayKey = dayKey || null; if (from === dayKey) return;
  if (from) { const m = Array.isArray(it.movedFrom) ? it.movedFrom.slice() : []; if (!m.includes(from)) m.push(from); it.movedFrom = m.slice(-60); }
  const mv = (Array.isArray(it.moves) ? it.moves.slice() : []).concat([{ at: nowIso(), from, to: dayKey }]);
  while (mv.length > 40) mv.splice(1, 1);   // keep the first (the original day) and the latest
  it.moves = mv; it.plan = dayKey;
}
function dayEntries(w, d){
  const out = [];
  for (const i of dailyAll(w)) {
    const dd = doneDay(i), p = planOn(i, d), mv = Array.isArray(i.moves) ? i.moves : [];
    const e = { id: i.id, title: i.title };
    if (dd === d) out.push(Object.assign(e, { st: "done", from: p && p < d ? p : null }));
    else if (dd && dd < d) continue;
    else if (!mv.length && (i.movedFrom || []).includes(d) && p > d) out.push(Object.assign(e, { st: "moved", to: i.plan }));   // moved before movement times were kept
    else if (p === d) out.push(Object.assign(e, { st: "pending", from: null }));
    else if (p && p > d && mv.some(x => ymd(x.at) === d && x.from && x.from <= d)) out.push(Object.assign(e, { st: "moved", to: p }));
  }
  return out;
}
const countEntries = list => ({ total: list.filter(e => e.st !== "moved").length, done: list.filter(e => e.st === "done").length, moved: list.filter(e => e.st === "moved").length });
function dayStatsLive(w, d){ return countEntries(dayEntries(w, d)); }
// numbers and task list for a day: the saved record for past days, live for today
function dayData(w, d){
  const t = todayKey(CTX ? CTX.now : Date.now()), r = d < t && w.dayLog && w.dayLog[d];
  if (r && Array.isArray(r.items)) {
    // records saved on 11 Nov 2026 could hold tasks carried in from earlier days; those belong to their own day only
    const entries = r.items.map(x => ({ id: x[0], title: x[1], st: x[2] === "d" ? "done" : x[2] === "m" ? "moved" : "pending", from: x[2] !== "m" ? x[3] || null : null, to: x[2] === "m" ? x[3] || null : null })).filter(e => !(e.st === "pending" && e.from));
    return Object.assign(countEntries(entries), { entries, saved: true });
  }
  const entries = dayEntries(w, d);
  if (r) return { total: +r.total || 0, done: +r.done || 0, moved: +r.moved || 0, entries, saved: true, numbersOnly: true };
  return Object.assign(countEntries(entries), { entries });
}
const dayStats = dayData;
const pctOf = s => s.total ? Math.round(s.done / s.total * 100) : 0;
// called from save(): keeps today's record up to date; past days are left exactly as they were
function recordDay(w){
  if (!w || !Array.isArray(w.items)) return;
  const t = todayKey(Date.now()), list = dayEntries(w, t);
  if (!list.length && !(w.dayLog && w.dayLog[t])) return;
  w.dayLog = w.dayLog || {};
  w.dayLog[t] = Object.assign(countEntries(list), { items: list.slice(0, 80).map(e => [e.id, String(e.title || "").slice(0, 80), e.st === "done" ? "d" : e.st === "moved" ? "m" : "p", (e.st === "moved" ? e.to : e.from) || ""]) });
  const keys = Object.keys(w.dayLog).sort(); if (keys.length > 800) keys.slice(0, keys.length - 800).forEach(k => delete w.dayLog[k]);   // about two years
}
const dShort = k => new Date(k + "T12:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }).replace(",", "");
const dLong = k => { const d = new Date(k + "T12:00"); return `${d.toLocaleDateString("en-GB", { weekday: "long" })}, ${d.getDate()} ${d.toLocaleDateString("en-GB", { month: "long" })}`; };
const shiftDay = (k, n) => ymd(addDays(new Date(k + "T12:00"), n));
function statLine(s){ return s.total ? `${s.done} of ${s.total} completed — ${pctOf(s)}%` : "No tasks on this day"; }
// The tasks of one day: completed, not finished (scheduled that day or carried in), and moved away.
function histListHTML(w, d, s, t){
  const E = s.entries || []; if (!E.length) return s.numbersOnly ? `<p class="hist-note" id="histNote">These numbers were saved before task lists were kept, so the tasks aren't listed.</p>` : "";
  const past = d < t;
  const sched = E.filter(e => e.st !== "moved" && !e.from).length, late = E.filter(e => e.st === "done" && e.from).length, moved = E.filter(e => e.st === "moved").length;
  const sum = [sched ? `${sched} scheduled for this day` : "", late ? `${late} finished from earlier days` : "", moved ? `${moved} moved to another day` : ""].filter(Boolean).join(" · ");
  const fin = e => { const it = w.items.find(i => i.id === e.id); const dd = it && doneDay(it); return dd && dd > d ? ` · Finished ${dShort(dd)}` : ""; };
  const meta = e => e.st === "moved" ? (e.to ? `Moved to ${dShort(e.to)}` : "Moved to another day") : e.st === "done" ? (e.from ? `From ${dShort(e.from)}` : "Scheduled") : past ? "Missed" + fin(e) : "Scheduled";
  const group = (st, label, icon) => { const L = E.filter(e => e.st === st); if (!L.length) return "";
    return `<h4 class="hl-g">${label} <span class="cnt">${L.length}</span></h4><ul>${L.map(e => `<li data-st="${st}"${st === "pending" && past ? ` class="missed"` : ""}><span class="hl-i" aria-hidden="true">${icon}</span><span class="hl-t">${esc(e.title)}</span><span class="hl-m">${esc(meta(e))}</span></li>`).join("")}</ul>`; };
  return `<p class="hist-sum" id="histSum">${esc(sum)}</p>
      <div class="hist-list" id="histList">${group("done", "Completed", IC.check)}${group("pending", past ? "Missed" : "Still pending", "")}${group("moved", "Moved", IC.forward)}</div>
      ${s.numbersOnly ? `<p class="hist-note" id="histNote">This day's numbers were saved before task lists were kept, so the list may not match them exactly.</p>` : ""}`;
}
function historyHTML(w){
  const t = todayKey(CTX.now), y = shiftDay(t, -1);
  const d = UI.histDay && UI.histDay <= t ? UI.histDay : t;
  const s = dayStats(w, d), p = shiftDay(d, -1), ps = dayStats(w, p);
  const diff = pctOf(s) - pctOf(ps);
  const cmp = !s.total ? "" : !ps.total ? `No tasks on ${dShort(p)} to compare with.`
    : diff === 0 ? `Same as ${dShort(p)} (${pctOf(ps)}%).` : `${diff > 0 ? "Up" : "Down"} ${Math.abs(diff)} points from ${dShort(p)} (${pctOf(ps)}%).`;
  const days = Array.from({ length: 7 }, (_, k) => shiftDay(d, k - 6)).map(k => ({ k, s: dayStats(w, k) }));
  const H = 96;
  const bars = days.map(({ k, s }, n) => {
    const pc = pctOf(s), h = s.total ? Math.max(4, Math.round(pc / 100 * H)) : 0;
    const lab = s.total ? `${dShort(k)}: ${s.done} of ${s.total} completed (${pc}%)` : `${dShort(k)}: no tasks`;
    return `<li class="hc-col${k === d ? " sel" : ""}" data-day="${k}" aria-label="${esc(lab)}" title="${esc(lab)}">
        <span class="hc-v">${s.total ? pc + "%" : "–"}</span><span class="hc-track"><i style="height:${h}px"></i></span>
        <span class="hc-d">${esc(new Date(k + "T12:00").toLocaleDateString("en-GB", { weekday: "narrow" }))}<b>${new Date(k + "T12:00").getDate()}</b></span><span class="hc-n">${s.total ? `${s.done}/${s.total}` : ""}</span></li>`;
  }).join("");
  return `<section class="card hist-card" id="histCard" aria-labelledby="histTitle">
      <div class="hist-top"><div><p class="dh-date">History</p><h2 id="histTitle">${esc(dLong(d))}</h2></div>
        <div class="hist-pick"><div class="seg" role="group" aria-label="Day">${[["today", "Today", t], ["yesterday", "Yesterday", y]].map(([v, l, k]) => `<button type="button" data-act="histday" data-v="${v}" aria-pressed="${d === k}">${l}</button>`).join("")}</div>
          <label class="sr" for="histDate">Pick a day</label><input type="date" id="histDate" value="${d}" max="${t}"></div></div>
      <p class="hist-stats" id="histStats"><b>${esc(statLine(s))}</b>${s.moved ? ` · ${s.moved} moved to another day` : ""}</p>
      <div class="dh-bar sm" role="progressbar" aria-label="Completed on ${esc(dShort(d))}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pctOf(s)}"><i style="width:${pctOf(s)}%"></i></div>
      <p class="hist-cmp" id="histCompare">${esc(cmp)}</p>
      ${histListHTML(w, d, s, t)}
      <h3 class="hc-h">7 days to ${esc(dShort(d))} <span>% completed each day</span></h3>
      <ol class="hist-chart" id="histChart">${bars}</ol>
      ${(() => { const act = days.filter(x => x.s.total); if (!act.length) return `<p class="hist-week" id="histWeek">No tasks in these 7 days yet.</p>`;
        const tot = act.reduce((a, x) => a + x.s.total, 0), dn = act.reduce((a, x) => a + x.s.done, 0);
        const best = act.slice().sort((a, b) => pctOf(b.s) - pctOf(a.s) || b.s.done - a.s.done)[0];
        return `<p class="hist-week" id="histWeek"><b>Last 7 days: ${dn} of ${tot} completed (${Math.round(dn / tot * 100)}%)</b><span>Best day: ${esc(dShort(best.k))} (${pctOf(best.s)}%) · ${act.length} active ${act.length === 1 ? "day" : "days"}</span></p>`; })()}
    </section>`;
}

function dailyRowHTML(it, t){
  const done = isDone(it); const editing = UI.dailyEdit === it.id; const over = !done && it.plan && it.plan < t;
  if (editing) return `<li class="dt-row editing" data-id="${it.id}">
      <div class="dt-edit"><label class="sr" for="dtEditTitle">Title</label><input id="dtEditTitle" type="text" maxlength="140" value="${esc(it.title)}">
        <label class="sr" for="dtEditDesc">Description</label><input id="dtEditDesc" type="text" maxlength="300" placeholder="Short description (optional)" value="${esc(it.notes || "")}">
        <div class="row-flex"><button class="btn primary sm" type="button" data-act="dailysave">Save</button><button class="btn ghost sm" type="button" data-act="dailycancel">Cancel</button></div></div></li>`;
  const moving = UI.dailyMove === it.id && !done;
  const op = origPlan(it), fd = k => esc(fmtDate(k + "T12:00"));
  // rescheduled (moved by the user), or simply planned for another day; missed tasks aren't listed here
  const day = done ? "" : over ? `<span class="dt-day"><b class="dt-over">Missed</b> · was due ${fd(it.plan)}</span>`
    : it.plan && op && op !== it.plan ? `<span class="dt-day"><b class="dt-res">Rescheduled</b> · originally due ${fd(op)} · now ${it.plan === t ? "today" : fd(it.plan)}</span>`
    : it.plan && it.plan !== t ? `<span class="dt-day">${fd(it.plan)}</span>` : "";
  const acts = done ? "" : `<button class="ib" type="button" data-act="dailytomorrow" aria-label="Move ${esc(it.title)} to tomorrow" title="Move to tomorrow" ${it.plan === tomorrowKey(CTX.now) ? "hidden" : ""}>${IC.forward}</button><button class="ib" type="button" data-act="dailymove" aria-label="Move ${esc(it.title)} to another day" title="Move to a day" aria-expanded="${moving}">${IC.calendar}</button>`;
  return `<li class="dt-row${done ? " done" : ""}${over ? " overdue" : ""}${UI.dailyJust === it.id ? " just" : ""}" data-id="${it.id}">
      <button class="dt-check" type="button" data-act="dailytoggle" aria-pressed="${done}" aria-label="${done ? "Mark as not done" : "Mark as done"}: ${esc(it.title)}">${IC.check}</button>
      <div class="dt-body"><span class="dt-t">${esc(it.title)}</span>${it.notes ? `<span class="dt-d">${esc(it.notes)}</span>` : ""}${day}${done && it.doneAt ? `<span class="dt-day">Done ${esc(fmtDate(it.doneAt))}${op && doneDay(it) > op ? ` · originally due ${fd(op)}` : ""}</span>` : ""}</div>
      <div class="dt-acts">${acts}<button class="ib" type="button" data-act="dailyedit" aria-label="Edit ${esc(it.title)}" title="Edit">${IC.edit}</button><button class="ib del" type="button" data-act="dailydel" aria-label="Delete ${esc(it.title)}" title="Delete">${IC.trash}</button></div>
      ${moving ? `<div class="dt-move"><label for="dtMoveDate">Move to</label><input type="date" id="dtMoveDate" min="${t}" value="${tomorrowKey(CTX.now)}"><button class="btn primary sm" type="button" data-act="dailymovego">Move</button><button class="btn ghost sm" type="button" data-act="dailymovecancel">Cancel</button></div>` : ""}
    </li>`;
}
function viewDaily(){
  const w = W(); const t = todayKey(CTX.now);
  const all = dailyAll(w);
  const s = dayStatsLive(w, t), pct = pctOf(s);
  // Pending: today, then later days, then undated. Tasks missed on earlier days stay on their own day (History, Calendar).
  const rank = i => !i.plan ? 3 : i.plan === t ? 1 : 2;
  const open = all.filter(i => !isDone(i) && !isMissed(i, t)).sort((a, b) => rank(a) - rank(b) || (a.plan || "").localeCompare(b.plan || "") || new Date(a.createdAt) - new Date(b.createdAt));
  const doneAll = all.filter(isDone).sort((a, b) => new Date(b.doneAt || 0) - new Date(a.doneAt || 0));
  const doneShown = doneAll.slice(0, UI.dailyMoreDone ? 500 : 30);
  const missed = all.filter(i => isMissed(i, t)).length;
  const empty = (h, p) => `<li class="dt-empty"><span class="dt-empty-ico">${IC.todo}</span><h3>${h}</h3><p>${p}</p></li>`;
  return `<div class="daily-grid">
    <div class="daily-main">
    <section class="daily-head" aria-labelledby="dailyHeadT">
      <div class="dh-top"><div><p class="dh-date">${esc(new Date(CTX.now).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" }))}</p><h2 id="dailyHeadT">${s.total && s.done === s.total ? "All done for today" : "Today's progress"}</h2></div>
</div>
      <div class="dh-stats" id="dailyStats">${[["Total", s.total], ["Completed", s.done], ["Pending", s.total - s.done], ["Progress", s.total ? pct + "%" : "–"]].map(([l, v]) => `<div><b>${v}</b><span>${l}</span></div>`).join("")}</div>
      <div class="dh-bar" role="progressbar" aria-label="Today's progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i id="dailyBar" style="width:${pct}%"></i></div>
      <p class="dh-prog" id="dailyProgress">${s.total ? `Progress: ${s.done} of ${s.total} completed — ${pct}%` : "No tasks for today yet. Add one below."}</p>
      ${missed ? `<p class="dh-missed" id="dailyMissed">${missed} missed on earlier days. ${missed === 1 ? "It stays" : "They stay"} on ${missed === 1 ? "its" : "their"} own day: open that day in History or the Calendar.</p>` : ""}
    </section>
    <form class="daily-form card" id="dailyForm" autocomplete="off">
      <div class="df-fields"><label class="sr" for="dailyTitle">Task</label><input id="dailyTitle" type="text" maxlength="140" placeholder="What do you want to get done today?" value="${esc(UI.dailyDraft || "")}">
        <label class="sr" for="dailyDesc">Short description (optional)</label><input id="dailyDesc" type="text" maxlength="300" placeholder="Short description (optional)" value="${esc(UI.dailyDesc || "")}"></div>
      <button class="btn primary" type="button" id="dailyAdd" data-act="dailyadd">${IC.plus}Add task</button>
    </form>
    <div class="daily-list" id="dailyList">
      <section class="dl-sec" aria-labelledby="dailyOpenH"><h3 class="dl-h" id="dailyOpenH">Pending <span class="cnt">${open.length}</span></h3>
        <ul class="dt-list" id="dailyOpen">${open.length ? open.map(i => dailyRowHTML(i, t)).join("") : all.length ? empty("All caught up", "Nothing is waiting. Nice work.") : empty("No tasks yet", "Add your first one above. Keep it short, like “Finish the project work”.")}</ul></section>
      <section class="dl-sec" aria-labelledby="dailyDoneH"><h3 class="dl-h" id="dailyDoneH">Completed <span class="cnt">${doneAll.length}</span></h3>
        <ul class="dt-list" id="dailyDone">${doneShown.length ? doneShown.map(i => dailyRowHTML(i, t)).join("") : `<li class="dt-none">Tick a task when it's done and it moves here.</li>`}</ul>
        ${doneAll.length > doneShown.length ? `<button class="btn ghost sm" type="button" data-act="dailymoredone">Show all ${doneAll.length} completed</button>` : ""}</section>
    </div>
    </div>
    <div class="daily-side">${historyHTML(w)}</div>
  </div>`;
}
VIEWS.daily = viewDaily;
PAGE.daily = "Daily tasks";
function dailyAdd(){
  const w = W(); const ti = $("#dailyTitle"), de = $("#dailyDesc");
  const title = (ti ? ti.value : "").replace(/\s+/g, " ").trim();
  if (!title) { toast("Give the task a title first.", null, null, "error"); if (ti) ti.focus(); return; }
  const it = mkItem(w, { kind: "todo", title: title.slice(0, 140), notes: (de ? de.value : "").trim().slice(0, 300), plan: todayKey(Date.now()), due: null, reminders: [], assignee: viewerId(w), type: DEFAULT_TYPE[w.mode], priority: "medium", source: "daily" });
  w.items.push(it); logItem(w, it, `Added "${it.title}"`);
  UI.dailyDraft = ""; UI.dailyDesc = "";
  save(); render(); sfx("success");
  setTimeout(() => { const i = $("#dailyTitle"); if (i) i.focus(); }, 0);
}
function dailySave(id){
  const w = W(); const it = findItem(id); if (!it) return;
  const title = ($("#dtEditTitle").value || "").replace(/\s+/g, " ").trim();
  if (!title) { toast("A task needs a title.", null, null, "error"); return; }
  it.title = title.slice(0, 140); it.notes = ($("#dtEditDesc").value || "").trim().slice(0, 300); touch(it); logItem(w, it, `Edited "${it.title}"`);
  UI.dailyEdit = null; save(); render(); toast("Saved.");
}
document.addEventListener("click", e => {
  const a = e.target.closest("[data-act]"); if (!a || !state || !state.workspaces || !state.workspaces.length) return;
  const row = a.closest(".dt-row"); const id = row && row.dataset.id; const w = W();
  switch (a.dataset.act) {
    case "dailyadd": dailyAdd(); break;
    case "dailymoredone": UI.dailyMoreDone = true; render(); break;
    case "histday": UI.histDay = a.dataset.v === "yesterday" ? shiftDay(todayKey(CTX.now), -1) : todayKey(CTX.now); render(); break;
    case "dailytomorrow": { const it = findItem(id); if (!it || isDone(it)) break; UI.dailyMove = null;
      const before = moveTodo(it, tomorrowKey(Date.now())); save(); render();
      toast(`Moved "${it.title}" to tomorrow.`, () => { replaceItem(W(), before); save(); render(); }); break; }
    case "dailymove": UI.dailyMove = UI.dailyMove === id ? null : id; render(); setTimeout(() => { const i = $("#dtMoveDate"); if (i) i.focus(); }, 0); break;
    case "dailymovecancel": UI.dailyMove = null; render(); break;
    case "dailymovego": { const it = findItem(id); const v = ($("#dtMoveDate") || {}).value || "";
      if (!it || isDone(it)) break;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) { toast("Pick a day first.", null, null, "error"); break; }
      if (v < todayKey(Date.now())) { toast("Pick today or a later day.", null, null, "error"); break; }
      UI.dailyMove = null; if (v === it.plan) { render(); break; }
      const before = moveTodo(it, v); save(); render();
      toast(`Moved "${it.title}" to ${fmtDate(v + "T12:00")}.`, () => { replaceItem(W(), before); save(); render(); }); break; }
    case "dailytoggle": { const it = findItem(id); if (!it) break; const was = isDone(it);
      it.status = was ? "todo" : "done"; it.doneAt = was ? null : nowIso(); touch(it); logItem(w, it, was ? `Reopened "${it.title}"` : `Completed "${it.title}"`);
      UI.dailyJust = it.id; save(); render(); UI.dailyJust = null; if (!was) { sfx("success"); celebrateIfAllDone(w); } break; }
    case "dailyedit": UI.dailyEdit = id; render(); setTimeout(() => { const i = $("#dtEditTitle"); if (i) { i.focus(); i.select(); } }, 0); break;
    case "dailycancel": UI.dailyEdit = null; render(); break;
    case "dailysave": dailySave(id); break;
    case "dailydel": { const it = findItem(id); if (!it) break; const idx = w.items.indexOf(it); const before = clone(it);
      w.items.splice(idx, 1); save(); render();
      toast(`Deleted "${it.title}".`, () => { W().items.splice(idx, 0, before); save(); render(); }); break; }
  }
});
document.addEventListener("keydown", e => {
  const t = e.target;
  if (e.key === "Enter" && (t.id === "dailyTitle" || t.id === "dailyDesc")) { e.preventDefault(); dailyAdd(); }
  else if (t.id === "dtMoveDate" && (e.key === "Enter" || e.key === "Escape")) { e.preventDefault(); const b = t.closest(".dt-row").querySelector(e.key === "Enter" ? "[data-act=dailymovego]" : "[data-act=dailymovecancel]"); if (b) b.click(); }
  else if (t.id === "dtEditTitle" || t.id === "dtEditDesc") { if (e.key === "Enter") { e.preventDefault(); const r = t.closest(".dt-row"); if (r) dailySave(r.dataset.id); } else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); UI.dailyEdit = null; render(); } }
}, true);
document.addEventListener("change", e => {
  if (e.target.id !== "histDate") return;
  const v = e.target.value, t = todayKey(CTX.now);
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) { UI.histDay = v > t ? t : v; render(); }
});
document.addEventListener("input", e => { if (e.target.id === "dailyTitle") UI.dailyDraft = e.target.value; else if (e.target.id === "dailyDesc") UI.dailyDesc = e.target.value; });

function todoDrawerHTML(w, it){
  const can = canEditItem(w, it); const dis = can ? "" : "disabled"; const now = CTX.now;
  const tab = UI.drawerTab === "activity" ? "activity" : "overview";
  const rem = it.reminders || [];
  const body = tab === "activity" ? `<ul class="act-log">${(it.log || []).map(l => `<li><div>${esc(l.text)}<time>${fmtDue(l.t)}</time></div></li>`).join("")}<li><div>Created<time>${fmtDue(it.createdAt)}</time></div></li></ul>`
    : `${can ? "" : `<p class="note">${IC.info}<span>Only the assignee or a manager can edit this.</span></p>`}
      <div class="f2"><div class="field"><label for="dr-plan">Day</label><input type="date" id="dr-plan" value="${it.plan || ""}" ${dis}></div><div class="field"><label for="dr-time">Time (optional)</label><input type="time" id="dr-time" value="${it.time || ""}" ${dis}></div></div>
      <div class="field"><label for="dr-deadline">Deadline (optional)</label><input type="date" id="dr-deadline" value="" ${dis}><p class="muted" style="font-size:12px">Set one if this has to be done by a certain date. It then shows in your deadlines and gets deadline reminders.</p></div>
      <div class="f2">
        <div class="field"><label for="dr-pri">Priority</label><select id="dr-pri" ${dis}>${Object.keys(PRI).map(p => `<option value="${p}" ${it.priority === p ? "selected" : ""}>${PRI[p].label}</option>`).join("")}</select></div>
        <div class="field"><label for="dr-status">Status</label><select id="dr-status" ${dis}>${[["todo", "Pending"], ["doing", "In progress"], ["done", "Completed"]].map(([v, l]) => `<option value="${v}" ${it.status === v ? "selected" : ""}>${l}</option>`).join("")}</select></div>
      </div>
      <div class="field"><span class="lbl">Remind me</span><div class="remchips" id="drRem">${REM_OPTS.map(([v, l]) => `<button type="button" class="fchip" data-rem-opt="${v}" aria-pressed="${rem.includes(v)}" ${dis}>${l}</button>`).join("")}</div>
        <p class="muted" style="font-size:12px">${it.time || it.due ? "" : "No time set, so reminders count from 9:00 on that day."}</p></div>
      <div class="field"><label for="dr-notes">Description</label><textarea id="dr-notes" rows="3" placeholder="Optional details" ${dis}>${esc(it.notes || "")}</textarea></div>
      <button class="more-btn" id="drMore" type="button" data-act="drmore" aria-expanded="${!!UI.drMore}" aria-controls="drMoreBox">More details ${IC.chev}</button>
      <div class="more-box" id="drMoreBox" ${UI.drMore ? "" : "hidden"}>
        <div class="field"><label for="dr-est">Effort (hours)</label><input type="number" id="dr-est" min="0" step="0.5" value="${it.estimate ?? ""}" ${dis}></div>
      </div>`;
  const st = isDone(it) ? ["Completed", "var(--ok)"] : it.status === "doing" ? ["In progress", "var(--accent)"] : ["Pending", "var(--muted)"];
  return `<div class="dr-h">
      <div class="dr-top"><span class="chip"><i style="background:${st[1]}"></i>${st[0]}</span><span class="chip">To-do</span>${it.source === "ai" ? `<span class="chip">Made with AI</span>` : ""}<span class="sp"></span>
        <button class="ib" type="button" id="drClose" data-act="drclose" aria-label="Close details">${IC.x}</button></div>
      <input class="dr-title" id="dr-title" value="${esc(it.title)}" aria-label="Title" ${dis}>
      <div class="tabs" role="tablist">${[["overview", "Details"], ["activity", "Activity"]].map(([k, l]) => `<button type="button" role="tab" data-act="tab" data-v="${k}" aria-selected="${tab === k}">${l}</button>`).join("")}</div>
    </div>
    <div class="dr-b">${body}</div>
    <div class="dr-f">${can ? `<button class="btn ghost danger sm" type="button" data-act="delete" data-id="${it.id}">${IC.trash}Delete</button>` : ""}<span class="sp"></span>
      ${!isDone(it) && can ? `<button class="btn sm" type="button" data-act="todotomorrow" data-id="${it.id}">${IC.forward}Tomorrow</button><button class="btn sm" type="button" data-act="focus" data-id="${it.id}">${IC.play}Focus</button>` : ""}
      <button class="btn ${isDone(it) ? "" : "primary"}" type="button" data-act="toggle" data-id="${it.id}" ${dis}>${isDone(it) ? "Reopen" : "Mark as done"}</button></div>`;
}
function moveTodo(it, dayKey, why){
  const w = W(); const before = clone(it);
  // the same task moves (no copy); the day it left is remembered once, for the history
  setPlan(it, dayKey); if (it.status === "done") { it.status = "todo"; it.doneAt = null; } touch(it);
  logItem(w, it, why || `Moved "${it.title}" to ${fmtDate(dayKey + "T12:00")}`);
  return before;
}

/* =========================================================
   Reminder engine & notification center
   ========================================================= */
const DESK = { supported: typeof window.Notification === "function" && window.isSecureContext !== false && window.top === window };
let reminderBoot = true;
function anchorOf(it){
  if (it.due) return new Date(it.due).getTime();
  if (it.plan) return new Date(`${it.plan}T${it.time || "09:00"}`).getTime();
  return null;
}
function remindersOf(w, it){
  if (Array.isArray(it.reminders)) return it.reminders;
  if (isTodo(it)) return it.time ? [15] : [];
  return w.settings.reminders.concat(w.settings.customReminder ? [w.settings.customReminder] : []);
}
function reminderText(it, o, now){
  const left = anchorOf(it) - now;
  if (isTodo(it)) {
    if (o === 0 || left <= 0) return `It's time for "${it.title}".`;
    if (o >= 1440) return `Coming up tomorrow: "${it.title}".`;
    if (o >= 60) return `Your scheduled task "${it.title}" is due in one hour.`;
    return `"${it.title}" starts in ${o} minutes.`;
  }
  if (o >= 1440 && relDay(it.due, now) === "tomorrow") return `Your ${it.title} deadline is tomorrow. Don't forget to complete and submit it!`;
  if (o === 60 || (left <= 65 * MIN && left > 30 * MIN)) return `"${it.title}" is due in one hour.`;
  if (o < 60) return `"${it.title}" is due in ${Math.max(1, Math.round(left / MIN))} minutes.`;
  return `Your ${it.title} deadline is approaching! It's due ${relDay(it.due, now)}.`;
}
// While a new workspace is set up, what's already due in its sample data is recorded as seen instead of
// flooding the bell; only the daily summary gets through. Anything that happens afterwards notifies as usual.
let muteWs = null;
function pushInbox(entry, fireAt){
  state.inbox = state.inbox || []; state.muted = state.muted || {};
  if (state.inbox.some(n => n.key === entry.key) || state.muted[entry.key]) return false;
  if (muteWs && entry.ws === muteWs && entry.kind !== "summary") { state.muted[entry.key] = 1; return true; }
  const n = Object.assign({ t: new Date().toISOString(), read: false, dismissed: false }, entry);
  state.inbox.unshift(n);
  if (state.inbox.length > 150) state.inbox.length = 150;
  if (!reminderBoot) announce(n, fireAt);
  return true;
}
function announce(n, fireAt){
  const w = W(); if (!visibleTo(w, n)) return;
  const quiet = inQuiet(w.settings);
  if (!quiet && !modalKind && !undoFn) toast(n.text, n.itemId ? () => openDrawer(n.itemId) : null, n.itemId ? "Open" : undefined);
  const fresh = !fireAt || Date.now() - fireAt < 10 * MIN;
  if (state.desktopAlerts && DESK.supported && fresh && !quiet) {
    try { if (window.Notification.permission === "granted") new window.Notification("Deadline Tracker", { body: n.text, tag: n.key }); } catch (e) {}
  }
}
function visibleTo(w, n){
  if (n.ws && n.ws !== w.id) return false;
  if (!n.for) return true;
  if (n.for === "manager") return canManage(w);
  return n.for === viewerId(w);
}
function runReminders(){
  if (!state || !state.workspaces || !state.workspaces.length) return;
  if (Store.mode === "server") return; // the server's reminder job creates notifications (even while the app is closed)
  const now = Date.now(); let changed = false;
  state.fired = state.fired || {};
  state.workspaces.forEach(w => {
    w.items.forEach(it => {
      if (isDone(it)) return;
      const a = anchorOf(it); if (a == null) return;
      if (a < now) {
        if (w.settings.overdueAlerts && it.due) changed = pushInbox({ key: it.id + ":od:" + it.due, ws: w.id, for: it.assignee || "me", itemId: it.id, kind: "overdue", text: `"${it.title}" is overdue. Open it to make a recovery plan.` }, a) || changed;
        return;
      }
      const offs = remindersOf(w, it).slice().sort((x, y) => x - y);
      const passed = offs.filter(o => now >= a - o * MIN);
      if (!passed.length) return;
      const o = passed[0];
      const key = `${it.id}:r${o}:${it.due || it.plan + (it.time || "")}`;
      offs.filter(x => x > o).forEach(x => { state.fired[`${it.id}:r${x}:${it.due || it.plan + (it.time || "")}`] = 1; });
      if (state.fired[key]) return;
      state.fired[key] = 1; changed = true;
      pushInbox({ key, ws: w.id, for: it.assignee || "me", itemId: it.id, kind: "reminder", text: reminderText(it, o, now) }, a - o * MIN);
    });
    const t = todayKey(now);
    if (new Date(now).getHours() >= 8) {
      const pending = myTasks(w).filter(i => !isDone(i) && (i.plan === t || (dueDay(i) === t && new Date(i.due).getTime() >= now))).length;
      if (pending && w.settings.dailySummary !== false) changed = pushInbox({ key: `sum:${t}:${w.id}`, ws: w.id, for: viewerId(w), kind: "summary", text: `You have ${pending} pending task${pending === 1 ? "" : "s"} today.` }) || changed;
    }
    // heads-up warnings, approvals and manager notices, once each (checked every 15 seconds)
    if (Date.now() - (UI.lastNotice || 0) > 15000 || UI.forceNotice) {
      const noticeIds = new Set((w.notices || []).map(x => x.id));
      notifs(w, now, radar(w, now)).forEach(n => {
        if (/^sum:/.test(n.key) || /:od$/.test(n.key) || /:\d+$/.test(n.key)) return;
        const kind = noticeIds.has(n.key) ? "notice" : n.route === "approvals" ? "review" : "heads-up";
        changed = pushInbox({ key: "x:" + n.key, ws: w.id, for: kind === "heads-up" ? viewerId(w) : "manager", itemId: n.id || null, kind, text: n.text }) || changed;
      });
    }
  });
  if (Date.now() - (UI.lastNotice || 0) > 15000 || UI.forceNotice) { UI.lastNotice = Date.now(); UI.forceNotice = false; }
  if (changed) { save(); renderBell(); }
  reminderBoot = false;
}
function celebrateIfAllDone(w){
  const now = Date.now(); const P = todayProgress(w, now);
  if (P.total && P.done === P.total) pushInbox({ key: `alldone:${todayKey(now)}:${w.id}`, ws: w.id, for: viewerId(w), kind: "success", text: "You have successfully completed all your tasks for today. Great work!" });
}
function inboxFor(w){ return (state.inbox || []).filter(n => !n.dismissed && visibleTo(w, n)); }
function renderBell(){
  if (!state || !state.workspaces || !state.workspaces.length) return;
  const w = W(); const unread = inboxFor(w).filter(n => !n.read).length;
  const dot = $("#bellDot"); dot.hidden = !unread; dot.textContent = unread > 9 ? "9+" : unread;
  $("#bellBtn").setAttribute("aria-label", `Notifications${unread ? `, ${unread} unread` : ""}`);
  if (UI.notifOpen) renderNotif();
}
function desktopStatus(){
  if (!DESK.supported) return { can: false, text: "Desktop alerts aren't available in this view. They work when you run the app on localhost in Chrome or Edge." };
  const p = window.Notification.permission;
  if (state.desktopAlerts && p === "granted") return { can: true, on: true, text: "Desktop alerts are on while the app is open in a tab." };
  if (p === "denied") return { can: false, text: "Desktop alerts are blocked for this site. Allow notifications in your browser's site settings to use them." };
  return { can: true, on: false, text: "Get reminders as desktop notifications while the app is open in a tab." };
}
async function enableDesktop(){
  if (!DESK.supported) { toast(desktopStatus().text); return; }
  try {
    const p = window.Notification.permission === "granted" ? "granted" : await window.Notification.requestPermission();
    if (p === "granted") { state.desktopAlerts = true; save(); toast("Desktop alerts are on."); }
    else toast("Notifications weren't allowed. You can change this in your browser's site settings.");
  } catch (e) { toast("This browser couldn't turn on notifications.", null, null, "error"); }
  renderBell(); if (UI.route === "prefs") render();
}
function renderNotif(){
  const w = W(); const list = inboxFor(w).slice(0, 60); const d = desktopStatus();
  const p = $("#notifPanel"); p.className = "notif"; p.hidden = false;
  const ico = { reminder: IC.bell, overdue: IC.alert, summary: IC.calendar, success: IC.check, review: IC.approvals, notice: IC.alert, "heads-up": IC.alert };
  p.innerHTML = `<div class="nh"><b>Notifications</b><button class="btn ghost xs" type="button" data-act="readall">Mark all read</button></div>
    <ul>${list.length ? list.map(n => `<li class="${n.read ? "" : "unread"} k-${n.kind || "reminder"}"><button type="button" class="nmain" data-act="notifgo" data-key="${esc(n.key)}" ${n.itemId ? `data-id="${n.itemId}"` : ""}><span class="nico">${ico[n.kind] || IC.bell}</span><span>${esc(n.text)}<time>${ago(n.t, Date.now())}</time></span></button><button class="ib ndis" type="button" data-act="ndismiss" data-key="${esc(n.key)}" aria-label="Dismiss notification">${IC.x}</button></li>`).join("")
      : `<li class="nempty">${IC.bell}<p>You're all caught up.</p></li>`}</ul>
    <div class="nfoot">${d.on ? `<span class="status-tag on">Desktop alerts on</span>` : d.can ? `<button class="btn sm" id="desktopAlertsBtn" type="button" data-act="desktopon">${IC.bell}Turn on desktop alerts</button>` : ""}<p class="note">${IC.info}<span>${esc(d.text)} <a href="#prefs" data-route="prefs">Reminder settings</a></span></p></div>`;
}

/* ---------- events for to-dos, reminders and the inbox ---------- */
document.addEventListener("click", e => {
  const a = e.target.closest("[data-act],[data-rem-opt]"); if (!a || !state || !state.workspaces || !state.workspaces.length) return;
  const w = W(); const host = a.closest("[data-id]"); const id = a.dataset.id || (host && host.dataset.id);
  if (a.dataset.remOpt != null) {
    const it = findItem(UI.drawerId); if (!it || !canEditItem(w, it)) return;
    const v = +a.dataset.remOpt; const cur = Array.isArray(it.reminders) ? it.reminders.slice() : remindersOf(w, it).slice();
    it.reminders = cur.includes(v) ? cur.filter(x => x !== v) : cur.concat(v).sort((x, y) => x - y);
    touch(it); logItem(w, it, it.reminders.includes(v) ? `Added a reminder: ${REM_OPTS.find(r => r[0] === v)[1].toLowerCase()}` : "Removed a reminder"); save(); render(); return;
  }
  switch (a.dataset.act) {
    case "todotab": UI.todoTab = a.dataset.v; render(); break;
    case "todotomorrow": { const it = findItem(id); if (!it) break; const before = moveTodo(it, tomorrowKey(Date.now())); save(); render(); toast(`Moved "${it.title}" to tomorrow.`, () => { replaceItem(w, before); save(); render(); }); break; }
    case "tododel": deleteItem(id); break;
    case "desktopon": e.stopImmediatePropagation(); enableDesktop(); break;
    case "ndismiss": { e.stopImmediatePropagation(); const n = (state.inbox || []).find(x => x.key === a.dataset.key); if (n) { n.dismissed = true; n.read = true; dismissNotif(n.key); save(); renderBell(); } break; }
  }
});
// Day and deadline fields in the details panel (handled before the deadline handler sees them).
// The day works for every task; the time and "add a deadline" fields belong to tasks without a deadline.
document.addEventListener("change", e => {
  const t = e.target; if (!t.id || !["dr-plan", "dr-time", "dr-deadline"].includes(t.id)) return;
  if (!state || !UI.drawerId) return;
  const w = W(); const it = findItem(UI.drawerId); if (!it || (t.id !== "dr-plan" && !isTodo(it))) return;
  e.stopImmediatePropagation();
  if (!canEditItem(w, it)) return;
  if (t.id === "dr-plan") { setPlan(it, t.value || null); logItem(w, it, it.plan ? `Planned for ${fmtDate(it.plan + "T12:00")}` : "Removed the day"); }
  if (t.id === "dr-time") { it.time = t.value || null; if (it.time && !Array.isArray(it.reminders)) it.reminders = [15]; logItem(w, it, it.time ? `Time set to ${fmtTime((it.plan || ymd(new Date())) + "T" + it.time)}` : "Removed the time"); }
  if (t.id === "dr-deadline" && t.value) {
    it.due = `${t.value}T${it.time || "23:59"}`; it.kind = "deadline";
    // A new deadline gets the usual deadline reminders unless reminders were chosen for this task.
    if (Array.isArray(it.reminders) && !it.reminders.length) it.reminders = null;
    logItem(w, it, `Deadline set to ${fmtDue(it.due)}`);
  }
  touch(it); save(); setTimeout(render, 0);
}, true);
