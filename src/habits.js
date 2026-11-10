/* =========================================================
   Habit Tracker
   Habits live in the workspace (w.habits) and are saved with everything else (to the account when signed in):
     { id, name, createdAt, archivedAt, days: { "YYYY-MM-DD": 1 } }
   Each date is its own tick, so a day can be done or undone without touching any other day.
   Every number on the page is worked out from those ticks. A habit counts from the first day it was tracked
   (the day it was added, or an earlier day the user ticked) up to today, or up to the day it was archived.
   ========================================================= */
IC.back = svg('<path d="M19 12H7M11 6l-6 6 6 6"/>');
IC.archive = svg('<rect x="3" y="4" width="18" height="5" rx="1.5"/><path d="M5 9v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9M10 13h4"/>');
IC.habits = svg('<path d="M4 12a8 8 0 0 1 13.7-5.6M20 12a8 8 0 0 1-13.7 5.6"/><path d="M18 3v4h-4M6 21v-4h4"/><path d="m9.5 12 2 2 3.5-4"/>');
NAV_ICON.habits = IC.habits;
const HB_MAX = 30;
const habitsAll = w => Array.isArray(w.habits) ? w.habits : (w.habits = []);
const habitsActive = w => habitsAll(w).filter(h => !h.archivedAt);
const hbDone = (h, d) => !!(h.days && h.days[d]);
const hbStart = h => { const c = ymd(h.createdAt || Date.now()); const first = Object.keys(h.days || {}).sort()[0]; return first && first < c ? first : c; };
const hbEnd = (h, t) => h.archivedAt && ymd(h.archivedAt) < t ? ymd(h.archivedAt) : t;
const hbCounts = (h, d, t) => d >= hbStart(h) && d <= hbEnd(h, t);
function hbRange(h, a, b, t){ let n = 0, done = 0; for (let d = a; d <= b; d = shiftDay(d, 1)) if (hbCounts(h, d, t)) { n++; if (hbDone(h, d)) done++; } return { n, done }; }
// current run: up to today, or up to yesterday while today isn't ticked yet
function hbStreak(h, t){ let d = hbDone(h, t) ? t : shiftDay(t, -1), n = 0; while (hbDone(h, d)) { n++; d = shiftDay(d, -1); } return n; }
function hbBest(h){ let best = 0, run = 0, prev = null; for (const d of Object.keys(h.days || {}).sort()) { run = prev && shiftDay(prev, 1) === d ? run + 1 : 1; if (run > best) best = run; prev = d; } return best; }
const hbPct = r => r.n ? Math.round(r.done / r.n * 100) : null;
const hbRing = (p, size = 46) => { const r = size / 2 - 4, c = 2 * Math.PI * r;
  return `<svg class="hb-ring" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="trk"/>${p ? `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="val" stroke-dasharray="${(c * p / 100).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 ${size / 2} ${size / 2})"/>` : ""}</svg>`; };

function habitRowHTML(h, t, archived){
  if (UI.habitEdit === h.id && !archived) return `<li class="dt-row hb-row editing" data-id="${h.id}"><div class="dt-edit"><label class="sr" for="hbEditName">Habit name</label><input id="hbEditName" type="text" maxlength="60" value="${esc(h.name)}">
      <div class="row-flex"><button class="btn primary sm" type="button" data-act="habitsave">Save</button><button class="btn ghost sm" type="button" data-act="habitcancel">Cancel</button></div></div></li>`;
  const done = hbDone(h, t), st = hbStreak(h, t);
  if (archived) return `<li class="dt-row hb-row arch" data-id="${h.id}"><div class="dt-body"><span class="hb-n">${esc(h.name)}</span><span class="dt-day">Archived ${esc(fmtDate(h.archivedAt))} · ${Object.keys(h.days || {}).length} days done</span></div>
      <div class="dt-acts"><button class="btn ghost sm" type="button" data-act="habitrestore">Restore</button><button class="ib del" type="button" data-act="habitdel" aria-label="Delete ${esc(h.name)}" title="Delete">${IC.trash}</button></div></li>`;
  return `<li class="dt-row hb-row${done ? " done" : ""}${UI.habitJust === h.id ? " just" : ""}" data-id="${h.id}">
      <button class="dt-check" type="button" data-act="habittoggle" aria-pressed="${done}" aria-label="${done ? "Mark as not done" : "Mark as done"}: ${esc(h.name)}">${IC.check}</button>
      <div class="dt-body"><span class="hb-n">${esc(h.name)}</span>${st ? `<span class="dt-day hb-s">${st}-day streak</span>` : ""}</div>
      <div class="dt-acts"><button class="ib" type="button" data-act="habitedit" aria-label="Edit ${esc(h.name)}" title="Edit">${IC.edit}</button><button class="ib" type="button" data-act="habitarchive" aria-label="Archive ${esc(h.name)}" title="Archive (keeps its history)">${IC.archive}</button><button class="ib del" type="button" data-act="habitdel" aria-label="Delete ${esc(h.name)}" title="Delete">${IC.trash}</button></div>
    </li>`;
}
function viewHabits(){
  const w = W(), t = todayKey(CTX.now), act = habitsActive(w), arch = habitsAll(w).filter(h => h.archivedAt);
  const cur = t.slice(0, 7), m = UI.habitMonth && UI.habitMonth <= cur ? UI.habitMonth : cur;
  const [Y, Mo] = m.split("-").map(Number), nDays = new Date(Y, Mo, 0).getDate();
  const days = Array.from({ length: nDays }, (_, k) => `${m}-${pad(k + 1)}`);
  const mEnd = days[nDays - 1] < t ? days[nDays - 1] : t;
  const D = k => new Date(k + "T12:00");
  const mon = D(days[0]).toLocaleDateString("en-GB", { month: "short" });
  const sum = (a, b) => act.reduce((s, h) => { const r = hbRange(h, a, b, t); s.n += r.n; s.done += r.done; return s; }, { n: 0, done: 0 });
  const doneToday = act.filter(h => hbDone(h, t)).length, todayPct = act.length ? Math.round(doneToday / act.length * 100) : 0;
  const wkStart = shiftDay(t, -((D(t).getDay() + 6) % 7));
  const week = hbPct(sum(wkStart, t)), month = hbPct(sum(days[0], mEnd));
  const show = p => p === null ? "–" : p + "%";
  // weeks of the month (Monday to Sunday)
  const weeks = []; days.forEach(d => { if (!weeks.length || D(d).getDay() === 1) weeks.push([]); weeks[weeks.length - 1].push(d); });
  const wkOf = {}; weeks.forEach((ds, k) => ds.forEach(d => wkOf[d] = k));
  const weeksHTML = weeks.map((ds, k) => { const a = ds[0], b = ds[ds.length - 1]; const p = a > t ? null : hbPct(sum(a, b < t ? b : t));
    const lab = `${D(a).getDate()}${a === b ? "" : "–" + D(b).getDate()} ${mon}`;
    return `<li class="hb-week${wkStart >= a && wkStart <= b && m === cur ? " now" : ""}" title="Week ${k + 1}, ${lab}: ${p === null ? "nothing tracked" : p + "% of habits done"}">${hbRing(p)}<span><b>Week ${k + 1}</b> <i>${lab}</i></span> <span class="hw-p">${show(p)}</span></li>`; }).join("");
  // per-habit numbers for the shown month
  const rows = act.map(h => ({ h, r: hbRange(h, days[0], mEnd, t), st: hbStreak(h, t), best: hbBest(h) })).map(x => Object.assign(x, { p: hbPct(x.r) }));
  const ranked = rows.slice().sort((a, b) => (b.p === null ? -1 : b.p) - (a.p === null ? -1 : a.p) || b.st - a.st);
  const rankHTML = ranked.map(x => `<li><div class="hr-top"><b class="hr-n">${esc(x.h.name)}</b> ${x.p === null ? `<span class="hr-c">Not tracked in this month</span>` : `<span class="hr-p">${x.p}%</span> <span class="hr-c">${x.r.done} of ${x.r.n} days</span>`}</div>
      <div class="dh-bar sm" role="progressbar" aria-label="${esc(x.h.name)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${x.p || 0}"><i style="width:${x.p || 0}%"></i></div>
      <span class="hr-s">Streak ${x.st} · Best ${x.best}</span></li>`).join("");
  const enough = rows.filter(x => x.r.n >= 3);
  const best = enough.filter(x => x.p >= 50).sort((a, b) => b.p - a.p || b.st - a.st).slice(0, 3);
  const needs = enough.filter(x => x.p < 50).sort((a, b) => a.p - b.p).slice(0, 3);
  const pick = L => L.map(x => `<li><b>${esc(x.h.name)}</b> <span>${x.p}% · ${x.r.done} of ${x.r.n} days</span></li>`).join("");
  // month grid
  const dayTotal = d => { let n = 0, done = 0; act.forEach(h => { if (hbCounts(h, d, t)) { n++; if (hbDone(h, d)) done++; } }); return { n, done }; };
  const head = days.map(d => `<th data-day="${d}" scope="col" class="${wkOf[d] % 2 ? "alt" : ""}${d === t ? " today" : ""}"><span>${D(d).toLocaleDateString("en-GB", { weekday: "narrow" })}</span><b>${D(d).getDate()}</b></th>`).join("");
  const body = act.map(h => `<tr data-id="${h.id}"><th scope="row"><span class="hb-n">${esc(h.name)}</span></th>${days.map(d => { const on = hbDone(h, d), fut = d > t;
    return `<td class="${wkOf[d] % 2 ? "alt" : ""}${d === t ? " today" : ""}"><button type="button" class="hb-cell${hbCounts(h, d, t) || on ? "" : " pre"}" data-act="habitcell" data-day="${d}" aria-pressed="${on}" aria-label="${esc(h.name)}, ${dShort(d)}: ${on ? "done" : fut ? "not yet" : "not done"}" title="${dShort(d)}" ${fut ? "disabled" : ""}>${on ? IC.check : ""}</button></td>`; }).join("")}</tr>`).join("");
  const foot = days.map(d => { const s = dayTotal(d), p = hbPct(s); const lab = d > t ? `${dShort(d)}: not yet` : p === null ? `${dShort(d)}: nothing tracked` : `${dShort(d)}: ${s.done} of ${s.n} habits (${p}%)`;
    return `<td class="${wkOf[d] % 2 ? "alt" : ""}${d === t ? " today" : ""}"><div class="hb-bar" data-day="${d}" role="img" aria-label="${esc(lab)}" title="${esc(lab)}"><i style="height:${p ? Math.max(3, Math.round(p / 100 * 34)) : 0}px"></i></div></td>`; }).join("");
  const tiles = [[act.length, "Active habits"], [`${doneToday} of ${act.length}`, "Done today"], [show(week), "This week"], [show(month), m === cur ? "This month" : D(days[0]).toLocaleDateString("en-GB", { month: "long" })]];
  return `<div class="hb-page">
    <div class="hb-top">
      <div class="hb-left">
        <section class="daily-head hb-head" aria-labelledby="hbHeadT">
          <div class="dh-top"><div><p class="dh-date">${esc(new Date(CTX.now).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" }))}</p><h2 id="hbHeadT">${act.length && doneToday === act.length ? "All habits done today" : "Today's habits"}</h2></div></div>
          <div class="dh-stats" id="habitStats">${tiles.map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`).join("")}</div>
          <div class="dh-bar" role="progressbar" aria-label="Habits done today" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${todayPct}"><i style="width:${todayPct}%"></i></div>
        </section>
        <form class="daily-form card" id="habitForm" autocomplete="off">
          <div class="df-fields one"><label class="sr" for="habitName">New habit</label><input id="habitName" type="text" maxlength="60" placeholder="New habit, like “Practice Python” or “Read 10 pages”" value="${esc(UI.habitDraft || "")}"></div>
          <button class="btn primary" type="button" id="habitAdd" data-act="habitadd">${IC.plus}Add habit</button>
        </form>
        <section class="dl-sec" aria-label="Today's checklist">
          <ul class="dt-list" id="habitToday">${act.length ? act.map(h => habitRowHTML(h, t)).join("") : `<li class="dt-empty"><span class="dt-empty-ico">${IC.habits}</span><h3>No habits yet</h3><p>Add one or two small things you want to do every day. Tick them off here.</p></li>`}</ul>
          ${arch.length ? `<details class="hb-arch" id="habitArchived"><summary>Archived (${arch.length})</summary><ul class="dt-list">${arch.map(h => habitRowHTML(h, t, true)).join("")}</ul></details>` : ""}
        </section>
      </div>
      <section class="card hb-card" aria-labelledby="hbRankT"><h3 id="hbRankT">Each habit <span>${esc(D(days[0]).toLocaleDateString("en-GB", { month: "long" }))}</span></h3>
        ${act.length ? `<ul class="hb-rank" id="habitRank">${rankHTML}</ul>` : `<p class="hb-none" id="habitRank">Your habits and their percentages will show here.</p>`}</section>
    </div>
    <section class="card hb-card hb-month" aria-labelledby="habitMonth">
      <div class="hb-mh"><h3 id="habitMonth">${esc(D(days[0]).toLocaleDateString("en-GB", { month: "long", year: "numeric" }))}</h3>
        <div class="row-flex"><button class="ib" type="button" data-act="habitprev" aria-label="Earlier month" title="Earlier month">${IC.back}</button><button class="ib" type="button" data-act="habitnext" aria-label="Later month" title="Later month" ${m >= cur ? "disabled" : ""}>${IC.forward}</button></div></div>
      <ul class="hb-weeks" id="habitWeeks">${weeksHTML}</ul>
      ${act.length ? `<div class="hb-gridwrap" id="habitGridWrap" tabindex="0" role="group" aria-label="Month grid, scrolls sideways"><table class="hb-table" id="habitGrid"><thead><tr><th scope="col" class="hb-c0">Habit</th>${head}</tr></thead><tbody>${body}</tbody><tfoot><tr><th scope="row">Day total</th>${foot}</tr></tfoot></table></div>
      <p class="hb-hint">Tick any day up to today. The bars under the grid show how many habits were done each day.</p>` : `<p class="hb-none">Add a habit to start filling the month.</p>`}
    </section>
    <div class="hb-two">
      <section class="card hb-card" aria-labelledby="hbBestT"><h3 id="hbBestT">Going well</h3><ul class="hb-pick" id="habitBest">${best.length ? pick(best) : `<li class="hb-none">${enough.length ? "No habit is at 50% or more yet this month." : "Track for at least 3 days to see your strongest habits."}</li>`}</ul></section>
      <section class="card hb-card" aria-labelledby="hbNeedsT"><h3 id="hbNeedsT">Needs attention</h3><ul class="hb-pick" id="habitNeeds">${needs.length ? pick(needs) : `<li class="hb-none">${enough.length ? "Nothing is below 50% this month." : "Nothing to show yet."}</li>`}</ul></section>
    </div>
  </div>`;
}
VIEWS.habits = viewHabits;
PAGE.habits = "Habit Tracker";

function habitAdd(){
  const w = W(), inp = $("#habitName"); const name = (inp ? inp.value : "").replace(/\s+/g, " ").trim().slice(0, 60);
  if (!name) { toast("Give the habit a name first.", null, null, "error"); if (inp) inp.focus(); return; }
  if (habitsActive(w).some(h => h.name.toLowerCase() === name.toLowerCase())) { toast("You already have that habit.", null, null, "error"); return; }
  if (habitsActive(w).length >= HB_MAX) { toast(`You can track up to ${HB_MAX} habits. Archive one first.`, null, null, "error"); return; }
  habitsAll(w).push({ id: rid("hb"), name, createdAt: nowIso(), archivedAt: null, days: {} });
  UI.habitDraft = ""; save(); render(); sfx("success");
  setTimeout(() => { const i = $("#habitName"); if (i) i.focus(); }, 0);
}
function habitTick(h, d){
  if (!h || d > todayKey(Date.now())) return;
  h.days = h.days || {}; const on = !h.days[d]; if (on) h.days[d] = 1; else delete h.days[d];
  UI.habitJust = h.id; save(); render(); UI.habitJust = null; if (on) sfx("success");
}
function habitSave(id){
  const w = W(), h = habitsAll(w).find(x => x.id === id); if (!h) return;
  const name = ($("#hbEditName").value || "").replace(/\s+/g, " ").trim().slice(0, 60);
  if (!name) { toast("A habit needs a name.", null, null, "error"); return; }
  if (habitsActive(w).some(x => x !== h && x.name.toLowerCase() === name.toLowerCase())) { toast("You already have that habit.", null, null, "error"); return; }
  h.name = name; UI.habitEdit = null; save(); render(); toast("Saved.");
}
document.addEventListener("click", e => {
  const a = e.target.closest("[data-act^=habit]"); if (!a || !state || !state.workspaces || !state.workspaces.length) return;
  const w = W(), holder = a.closest("[data-id]"), h = holder && habitsAll(w).find(x => x.id === holder.dataset.id), t = todayKey(Date.now());
  const month = n => { const cur = t.slice(0, 7), m = UI.habitMonth && UI.habitMonth <= cur ? UI.habitMonth : cur; const [y, mo] = m.split("-").map(Number); const d = new Date(y, mo - 1 + n, 1); const k = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; if (k <= cur) { UI.habitMonth = k; render(); } };
  switch (a.dataset.act) {
    case "habitadd": habitAdd(); break;
    case "habittoggle": habitTick(h, t); break;
    case "habitcell": habitTick(h, a.dataset.day); break;
    case "habitedit": UI.habitEdit = h && h.id; render(); setTimeout(() => { const i = $("#hbEditName"); if (i) { i.focus(); i.select(); } }, 0); break;
    case "habitcancel": UI.habitEdit = null; render(); break;
    case "habitsave": if (h) habitSave(h.id); break;
    case "habitarchive": if (h) { h.archivedAt = nowIso(); save(); render(); toast(`Archived "${h.name}". Its history is kept.`, () => { h.archivedAt = null; save(); render(); }); } break;
    case "habitrestore": if (h) { if (habitsActive(w).length >= HB_MAX) { toast(`You can track up to ${HB_MAX} habits.`, null, null, "error"); break; } h.archivedAt = null; save(); render(); toast(`"${h.name}" is back in your habits.`); } break;
    case "habitdel": if (h) { const list = habitsAll(w), at = list.indexOf(h); list.splice(at, 1); save(); render(); toast(`Deleted "${h.name}" and its history.`, () => { habitsAll(W()).splice(at, 0, h); save(); render(); }); } break;
    case "habitprev": month(-1); break;
    case "habitnext": month(1); break;
  }
});
document.addEventListener("input", e => { if (e.target.id === "habitName") UI.habitDraft = e.target.value; });
document.addEventListener("keydown", e => {
  const t = e.target; if (!t || !t.id) return;
  if (t.id === "habitName" && e.key === "Enter") { e.preventDefault(); habitAdd(); }
  else if (t.id === "hbEditName" && (e.key === "Enter" || e.key === "Escape")) { e.preventDefault(); const b = t.closest(".hb-row").querySelector(e.key === "Enter" ? "[data-act=habitsave]" : "[data-act=habitcancel]"); if (b) b.click(); }
});
