
/* =========================================================
   Deadline AI - My Plan (your own tasks)
   With the Deadline Tracker server: the server's private planning engine
   (no outside AI). Without it: simple rules in this browser (labelled).
   Help (website questions) lives in widget.js and uses the server.
   ========================================================= */
const AI = { kind: "rules", label: "Simple rules (on this device)", ready: false, busy: false, gemini: false, model: null };
// My Plan never sends your tasks to an outside AI. With the Deadline Tracker server it uses the server's
// planning engine (private, on your own server); without it, the same kind of simple rules run in this browser.
// Google Gemini is used only by Help (website questions and general tips), through the server.
async function detectAI(){
  if (ACCOUNT.on) {
    try { const r = await fetch("/api/status", { cache: "no-store" }); const j = await r.json(); AI.gemini = !!(j && j.ai); AI.model = j && j.model || null; } catch (e) {}
    Object.assign(AI, { kind: "engine", label: "Private planner on your server", ready: true });
  } else Object.assign(AI, { kind: "rules", label: "Simple rules (on this device)", ready: true });
  refreshAiMode(); if (typeof renderWidget === "function" && DW.open) renderWidget();
}
function refreshAiMode(){ const el = $("#aiMode"); if (el) { el.innerHTML = aiModeHTML(); } }
function aiModeHTML(){ return `<i class="on"></i>${esc(AI.label)}`; }
const validYmd = s => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && ymd(new Date(s + "T12:00")) === s;
const normTitle = s => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/* ---------- offline helper: simple, transparent rules ---------- */
const STOPW = new Set("i me my mine we our you your it its this that these those the a an to of for on in at by with and or but so is are was were be been am do did does doesn didn couldn couldnt cant can won wont not no have has had need needs must should would could will shall today tomorrow tonight yesterday week next day days please also just then still yet again move moved shift reschedule postpone push carry put them all everything finish finished complete completed get got".split(" "));
const toks = s => (String(s).toLowerCase().match(/[a-z0-9+#]+/g) || []).filter(x => x.length >= 2 && !STOPW.has(x)).map(x => x.replace(/(ing|ed|es|s)$/, ""));
const WORDN = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, half: .5 };
const dayWord = (key, now) => key === ymd(now) ? "today" : key === ymd(addDays(startOfDay(now), 1)) ? "tomorrow" : fmtDate(key + "T12:00", { weekday: "long", day: "numeric", month: "short" });
function cleanTitle(s){
  s = String(s).replace(/^\s*(plan|organi[sz]e|schedule)\b[^:]{0,24}:\s*/i, "").replace(/^\s*(and|then|also|plus|but)\s+/i, "")
    .replace(/^\s*(i\s+)?(have to|need to|must|should|want to|will|gotta|got to|plan to|am going to|'m going to|have got to)\s+/i, "")
    .replace(/^\s*i\s+/i, "").replace(/^\s*to\s+/i, "")
    .replace(/\b(my|our)\s+/gi, "").replace(/\s+/g, " ").trim().replace(/[.,;:!?]+$/, "").trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
}
function rulesPlan(text, w, now){
  const visible = w.items.filter(i => !isDone(i) && (w.mode !== "company" || i.assignee === viewerId(w)));
  const tKey = ymd(now);
  // 1) moving something that already exists
  const mv = text.match(/\b(move|shift|reschedule|postpone|push|carry|put)\b([\s\S]*)$/i);
  if (mv) {
    const target = parseQuick("x " + mv[2], w, now).date;
    if (!target) return { reply: "", question: "Which day should I move it to?", actions: [], skipped: 0 };
    let picks;
    if (/\b(all|everything|unfinished|remaining|rest|leftover)\b/i.test(text)) picks = visible.filter(i => i.plan && i.plan <= tKey);
    else {
      const want = toks(text.slice(0, mv.index) + " " + mv[2]);
      const scored = visible.map(i => ({ i, s: toks(i.title).filter(x => want.includes(x)).length + (i.plan === tKey ? .1 : 0) })).filter(x => x.s >= 1).sort((a, b) => b.s - a.s);
      picks = scored.length ? [scored[0].i] : [];
    }
    if (!picks.length) return { reply: "", question: "Which task should I move? I couldn't match it to anything on your list.", actions: [], skipped: 0 };
    // Moving plans the work for another day. Only "the deadline is now…" moves a deadline, and that still needs approval.
    const moveDeadline = /\b(deadline|due date)\b/i.test(text);
    const one = picks.length === 1 ? picks[0] : null;
    const reply = one && one.due && !moveDeadline ? `I'll plan "${one.title}" for ${dayWord(target, now)}. Its deadline stays ${fmtDue(one.due)}.`
      : `I'll move ${one ? `"${one.title}"` : `${picks.length} tasks`} to ${dayWord(target, now)}.`;
    return { reply, question: null, skipped: 0,
      actions: picks.map(i => moveDeadline && i.due ? { type: "update", keep: true, id: i.id, title: i.title, changes: { deadline: target }, date: null }
        : { type: "update", keep: true, id: i.id, title: i.title, changes: { date: target }, date: target }) };
  }
  // 2) new tasks and deadlines (the same reading the Add box uses)
  const actions = extractTasks(text, w, now);
  actions.forEach(a => { const dup = visible.find(i => normTitle(i.title) === normTitle(a.title) && dayOf(i) === a.date); if (dup) { a.keep = false; a.dupOf = dup.id; } });
  if (!actions.length) return { reply: "I couldn't find any tasks in that. Try something like “Tomorrow I have to finish my report and call Priya.”", question: null, actions: [], skipped: 0 };
  if (actions.length === 1 && actions[0].isDeadline) { const a = actions[0];
    return { reply: `Got it. I'll track "${a.title}" as a deadline on ${dayWord(a.date, now)}, with reminders 1 day and 1 hour before.`, question: null, skipped: 0, actions }; }
  const dates = [...new Set(actions.map(a => a.date).filter(Boolean))];
  const day = dates.length === 1 ? dates[0] : (actions[0] && actions[0].date);
  const hours = actions.filter(a => a.date === day).reduce((s, a) => s + (a.estimate || 0), 0);
  const nDl = actions.filter(a => a.isDeadline).length;
  let reply = nDl && nDl < actions.length ? `Here's what I found: ${nDl} deadline${nDl === 1 ? "" : "s"} and ${actions.length - nDl} task${actions.length - nDl === 1 ? "" : "s"}.`
    : day ? (day === tKey ? "Here's your list for today." : `I've organised your work for ${dayWord(day, now)}.`) : "Here's what I found. None of these have a day yet, so add one if they're due on a specific day.";
  const miss = actions.filter(a => a.assigneeMiss);
  if (miss.length) reply += ` I couldn't find ${miss.map(a => a.assigneeMiss).join(" or ")} in your team, so ${miss.length === 1 ? "that task stays" : "those stay"} with you.`;
  if (hours > w.settings.hoursPerDay) reply += ` That's about ${fmtH(hours)} of focused work, more than your usual ${fmtH(w.settings.hoursPerDay)}, so consider moving something.`;
  return { reply, question: null, actions, skipped: 0 };
}
// Reads free text into tasks and deadlines: commas, "and", "then" and new lines separate them; a date said once
// applies to the whole list; "due"/"deadline"/exam words make a deadline; "assign … to <name>" sets the person.
// Used by the Add box and by the assistant's offline rules, so both understand text the same way.
function extractTasks(text, w, now){
  const prepped = String(text || "").replace(/\bfor\s+(\d+(?:\.\d+)?|an?|one|two|three|four|five|six|seven|eight|nine|ten|half an?)\s+(hours?|hrs?|minutes?|mins?)\b/gi, (m, n, u) => {
    const v = WORDN[String(n).toLowerCase().split(" ")[0]] ?? parseFloat(n);
    return /^h/i.test(u) ? `~${v}h` : `~${v}min`;
  });
  const frags = prepped.split(/\s*[,;\n]\s*(?:and\s+|then\s+)?|\.\s+(?=[A-Z])|\s+and\s+(?=(?:also\s+)?[a-z])|\s+then\s+/i).map(s => s.trim()).filter(Boolean);
  const parsed = frags.map(f => ({ f, p: parseQuick(f, w, now) }));
  const dates = [...new Set(parsed.map(x => x.p.date).filter(Boolean))];
  const shared = dates.length === 1 ? dates[0] : null;
  const actions = []; const mgr = canManage(w);
  parsed.forEach(({ f, p }, k) => {
    // "My project submission deadline is 5 Nov" -> "Project submission"
    const dm = f.match(/^(.*?)\b(deadline|is due|due on|due by|due date)\b/i);
    const title = cleanTitle(dm && p.date && dm[1].trim() && !/[@#~!]/.test(dm[1]) ? dm[1].replace(/^\s*(the|a)\s+/i, "") : p.title);
    // "…, and assign it to Rahul" on its own belongs to the task before it
    if ((!title || title.length < 2) && (p.assignee || p.assigneeMiss) && actions.length) { const prev = actions[actions.length - 1]; if (p.assignee && mgr) prev.assignee = p.assignee; else prev.assigneeMiss = p.assigneeMiss || null; return; }
    if (!title || title.length < 2) return;
    const date = p.date || shared;
    const isDeadline = !!(p.deadline && date);
    const low = f.toLowerCase();
    let pr = !p.prioritySuggested ? p.priority : /\b(submit|submission|deadline|exam|test|quiz|pay|fee|interview)\b/.test(low) || (isDeadline && new Date(date + "T23:59").getTime() - now < 2 * DAY) ? "high" : /\b(maybe|optional|if time)\b/.test(low) ? "low" : "medium";
    const time = p.timeDefault ? null : p.time;
    const event = /\b(attend|class|college|lecture|school|office|meeting)\b/.test(low);
    const a = { type: "create", keep: true, title, date, time, isDeadline, priority: pr, estimate: p.estimate, reminders: isDeadline ? [1440, 60] : time ? [15] : pr === "high" && date ? [0] : [], description: "",
      kind: p.type, groupId: p.groupId || null, repeat: p.repeat || "none", _o: (time ? 0 : event ? 1 : pr === "high" ? 2 : 3) * 100 + k };
    if (p.assignee && mgr) a.assignee = p.assignee; else if (p.assigneeMiss) a.assigneeMiss = p.assigneeMiss;
    actions.push(a);
  });
  actions.sort((a, b) => a._o - b._o).forEach(a => delete a._o);
  return actions;
}
// Turns one approved suggestion (from the assistant or the Add box) into a saved task.
function taskFromAction(w, a, opts = {}){
  const who = a.assignee && canManage(w) && memberOf(w, a.assignee) ? a.assignee : viewerId(w);
  const base = { title: a.title.trim().slice(0, 140), notes: a.description || "", priority: PRI[a.priority] ? a.priority : "medium", estimate: a.estimate || null, assignee: who,
    type: TYPES_BY_MODE[w.mode].includes(a.kind) ? a.kind : DEFAULT_TYPE[w.mode], groupId: a.groupId && groupOf(w, a.groupId) ? a.groupId : null, repeat: a.repeat || "none",
    reviewer: w.mode === "company" && who !== viewerId(w) ? viewerId(w) : null };
  const it = a.isDeadline && a.date
    ? mkItem(w, Object.assign(base, { kind: "deadline", due: `${a.date}T${a.time || "23:59"}`, reminders: a.reminders && a.reminders.length ? a.reminders : null }))
    : mkItem(w, Object.assign(base, { kind: "todo", plan: a.date || opts.day || null, time: a.time || null, due: null, reminders: a.reminders && a.reminders.length ? a.reminders : (a.time ? [15] : []) }));
  if (opts.source) it.source = opts.source;
  w.items.push(it);
  return it;
}

/* ---------- "plan my day / plan my tomorrow": built from the user's own list ---------- */
// Common misspellings of tomorrow ("tommorw", "tomorow", "tmrw"...) are read as tomorrow, and
// Hinglish (Hindi written in English letters) is turned into the words the rules understand.
const HINGLISH_RE = /\b(hai|hain|karna|karni|karne|karo|kal|aaj|parso|mujhe|kya|aur|bana|banao|padhna|padhai|baje|ghante|ghanta|subah|shaam|raat)\b/i;
function fixHinglish(s){
  s = String(s || "");
  if (!HINGLISH_RE.test(s)) return s;
  const am = /\bsubah\b/i.test(s), pm = /\b(shaam|raat)\b/i.test(s);
  return s
    .replace(/\bparso\b/gi, "day after tomorrow").replace(/\bkal\b/gi, "tomorrow").replace(/\baaj\b/gi, "today")
    .replace(/\b(\d{1,2})\s*baje\b/gi, (m, h) => { h = +h; return `${h}${am ? "am" : pm ? "pm" : h >= 8 && h <= 11 ? "am" : "pm"}`; })
    .replace(/\b(\d+(?:\.\d+)?|ek|do|teen|char|chaar|paanch)\s*(ghante|ghanta)\b/gi, (m, n) => `for ${({ ek: 1, do: 2, teen: 3, char: 4, chaar: 4, paanch: 5 })[String(n).toLowerCase()] || n} hours`)
    .replace(/\b(subah|shaam)\b/gi, "").replace(/\braat\s+ko\b/gi, "tonight")
    .replace(/\b(padhai|padhna|padhni)\b/gi, "study")
    .replace(/\b(karna|karni|karne|krna)\s+(hai|h|he|hain|padega|padegi)\b/gi, "").replace(/\b(hai|hain|mujhe|bhi)\b/gi, "")
    .replace(/\baur\b/gi, "and").replace(/\b(mera|meri|mere)\b/gi, "my").replace(/\s+(ka|ki|ke|ko)\s+/gi, " ")
    .replace(/\s{2,}/g, " ").trim();
}
const fixDayTypos = s => fixHinglish(String(s || "").replace(/\b(t+o?m+o?r+o*w+|tmrw|tmr|tmw)\b/gi, "tomorrow"));
const PLAN_FILL = new Set("please can could would you help me to plan planning organise organize schedule arrange make a an out my the for of whole full entire day today tomorrow tonight what should shall i do work on complete finish focus start first next it everything all tasks task have too much lot so i'm im am feel overwhelmed overloaded busy m kya karna karu karoon karun bana banao bana do de dena sakta sakti hu hoon".split(" "));
// Returns the day to plan ("YYYY-MM-DD") when the message only asks to plan a day, otherwise null.
function planIntent(text, w, now){
  const s = fixDayTypos(text).toLowerCase().replace(/[^a-z0-9 ]+/g, " ");
  const raw = String(text || "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\bkal\b/g, "tomorrow").replace(/\baaj\b/g, "today") + " " + s;
  if (!/\b(plan|planning|organi[sz]e|schedule|arrange)\b[\s\S]*\b(day|today|tomorrow|tonight)\b|\bwhat should i (do|work on|complete|finish|focus on|start)\b|\btoo much (work|to do)\b|\b(overwhelmed|overloaded)\b|\b(organi[sz]e|prioriti[sz]e) (it|my work|everything|my tasks)\b|\b(today|tomorrow) kya (karna|karu|karoon|karun)\b|\bplan (bana|banao)\b/.test(raw)) return null;
  const rest = s.split(/\s+/).filter(x => x && !PLAN_FILL.has(x) && !WD_NAMES.includes(x));
  if (rest.length) return null;
  const d = parseQuick("x " + fixDayTypos(text), w, now).date;
  return d || todayKey(now);
}
const WD_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "next", "this", "on"];
function planDay(w, now, key){
  const me = viewerId(w);
  const open = w.items.filter(i => !isDone(i) && (w.mode !== "company" || i.assignee === me));
  const t = todayKey(now), dayName = dayWord(key, now);
  const nextKey = ymd(addDays(new Date(key + "T12:00"), 1));
  const already = open.filter(i => i.plan === key || (!i.plan && dueDay(i) === key));
  const picks = []; const seen = new Set(already.map(i => i.id));
  const add = (i, why, h, rank) => { if (seen.has(i.id)) return; seen.add(i.id); picks.push({ i, why, h, rank }); };
  const priN = i => ({ high: 0, medium: 1, low: 2 }[i.priority] ?? 1);
  // 1) overdue deadlines first
  open.filter(i => i.due && new Date(i.due).getTime() < now).sort((a, b) => new Date(a.due) - new Date(b.due))
    .forEach(i => add(i, `overdue since ${fmtDue(i.due)}`, remainingH(i) || null, 0));
  // 2) deadlines due that day or the day after
  open.filter(i => i.due && new Date(i.due).getTime() >= now && (dueDay(i) === key || dueDay(i) === nextKey)).sort((a, b) => new Date(a.due) - new Date(b.due))
    .forEach(i => add(i, `due ${dueDay(i) === key ? dayName : dayWord(nextKey, now)} ${fmtTime(i.due)}`, remainingH(i) || null, 1));
  // 3) work the planner already set aside for that day, so later deadlines aren't left to the last night
  const pf = planFor(w, now, me); const day = pf.days.find(d => d.key === key);
  (day ? day.sessions : []).forEach(s => { const i = findItem(s.id, w); if (i && !isDone(i)) add(i, `about ${fmtH(s.h)} toward the ${fmtDue(i.due)} deadline`, s.h, 2); });
  // 4) to-dos left over from earlier days
  open.filter(i => !i.due && i.plan && i.plan < t && key >= t).forEach(i => add(i, `left over from ${fmtDate(i.plan + "T12:00")}`, Number(i.estimate) || null, 3));
  picks.sort((a, b) => a.rank - b.rank || priN(a.i) - priN(b.i));
  if (!picks.length) {
    if (already.length) return { reply: `${dayName.charAt(0).toUpperCase() + dayName.slice(1)} already has ${already.length} task${already.length === 1 ? "" : "s"} planned (${already.map(i => i.title).join(", ")}). Nothing else is due soon, so you're set.`, question: null, actions: [], skipped: 0 };
    return { reply: `Nothing is due or planned for ${dayName} yet. Tell me what you need to do, for example “${key === t ? "Today" : "Tomorrow"} I have to finish my report and go to the gym.”`, question: null, actions: [], skipped: 0 };
  }
  // Keep the day realistic: past the usual hours, later low-urgency items are left unticked (you can tick them back).
  const cap = w.settings.hoursPerDay || 0;
  let hours = already.reduce((s, i) => s + (remainingH(i) || Number(i.estimate) || 0), 0); const off = [];
  picks.forEach(p => { const h = p.h || 0; if (cap && p.rank >= 2 && hours + h > cap + .01) { p.keep = false; off.push(p.i.title); } else hours += h; });
  const actions = picks.map(p => ({ type: "update", keep: p.keep !== false, id: p.i.id, title: p.i.title, changes: { date: key }, date: key, why: p.why + (p.h ? ` · ~${fmtH(p.h)}` : "") }));
  let reply = `Here's a plan for ${dayName} from your list, most urgent first.`;
  if (already.length) reply += ` Already planned: ${already.map(i => i.title).join(", ")}.`;
  if (hours) reply += cap && hours > cap + .01 ? ` That's about ${fmtH(hours)} of work, more than your usual ${fmtH(cap)}, so start from the top.` : ` That's about ${fmtH(hours)} of work.`;
  if (off.length) reply += ` I left ${off.join(", ")} unticked so the day isn't overloaded.`;
  reply += " Deadlines stay where they are.";
  return { reply, question: null, actions, skipped: 0 };
}

/* ---------- conversation ---------- */
function chatOf(w){ w.chat = w.chat || []; return w.chat; }
// Server actions -> what the suggestion card shows. (Saving goes back to the server, which re-checks everything.)
function fromServerAction(a){
  if (a.type === "plan") return Object.assign({}, a, { type: "update", changes: { date: a.date } });
  if (a.type === "deadline") return Object.assign({}, a, { type: "update", changes: { deadline: a.date }, date: null, _deadline: a.date });
  return Object.assign({}, a);
}
async function sendToAssistant(text, opts = {}){
  const w = W(); text = String(text || "").trim();
  if (!text || AI.busy) return;
  const chat = chatOf(w);
  if (!opts.retry) chat.push({ id: rid("m"), role: "user", text, t: nowIso() });
  if (chat.length > 80) chat.splice(0, chat.length - 80);
  UI.aiDraft = ""; AI.busy = true; save(); render();
  if (Store.mode === "server") {
    // The server's planning engine reads your saved tasks there; nothing goes to an outside AI.
    let r;
    try {
      r = await apiJSON("POST", "/api/plan/chat", { message: text, conversationId: w.planConv || undefined });
      if (r.status === 404 && w.planConv) { w.planConv = null; r = await apiJSON("POST", "/api/plan/chat", { message: text }); }
    } catch (e) { r = { ok: false, json: {} }; }
    AI.busy = false;
    if (!r.ok) { chat.push({ id: rid("m"), role: "ai", error: true, retry: text, t: nowIso(), text: `I couldn't reach the server just now (${r.json.error || "connection problem"}). Try again.` }); save(); render(); return; }
    const m = r.json.message; w.planConv = r.json.conversationId;
    chat.push({ id: rid("m"), serverId: m.id, role: "ai", via: "engine", t: m.createdAt || nowIso(), text: m.text, proposal: m.proposal ? { status: m.proposal.status, actions: m.proposal.actions.map(fromServerAction) } : null });
    save(); render(); return;
  }
  // No server: the same kind of rules, run in this browser.
  await sleep(250);
  const planKey = planIntent(text, w, Date.now());
  const res = planKey ? planDay(w, Date.now(), planKey) : rulesPlan(fixDayTypos(text), w, Date.now());
  AI.busy = false;
  let reply = res.reply || (res.actions.length ? "Here's what I'd suggest." : "");
  if (res.question) reply = (reply ? reply + " " : "") + res.question;
  if (res.actions.some(a => a.dupOf)) reply += " Anything already on your list is unticked.";
  chat.push({ id: rid("m"), role: "ai", via: planKey ? "local" : "rules", t: nowIso(), text: reply || "Okay.", proposal: res.actions.length ? { status: "pending", actions: res.actions } : null });
  save(); render();
}
// Saving a suggestion that came from the server: the server validates it and writes the tasks.
async function applyServerProposal(msg, discard){
  const send = { messageId: msg.serverId };
  if (discard) send.discard = true;
  else send.actions = msg.proposal.actions.map(a => a.type === "create" ? { keep: !!a.keep, title: a.title, date: a.date || null, time: a.time || null, priority: a.priority } : { keep: !!a.keep, date: a._deadline || a.date || null });
  await flushNow();
  const r = await apiJSON("POST", "/api/plan/apply", send).catch(() => ({ ok: false, json: {} }));
  if (!r.ok) { toast(r.json.error || "Couldn't save. Check your connection and try again.", null, null, "error"); return; }
  const id = msg.id;
  await reloadFromServer();
  const again = chatOf(W()).find(m => m.id === id) || msg;
  if (again.proposal) { again.proposal.status = discard ? "discarded" : "saved"; if (!discard) again.proposal.result = { created: r.json.result.created, updated: r.json.result.updated, done: r.json.result.completed, ids: r.json.result.ids }; }
  save(); render();
  if (!discard) { const x = r.json.result; toast([x.created && `Saved ${x.created} task${x.created === 1 ? "" : "s"}`, x.updated && `updated ${x.updated}`, x.completed && `completed ${x.completed}`].filter(Boolean).join(", ") + "."); }
}
function applyProposal(msg){
  const w = W(); const p = msg.proposal; if (!p || p.status !== "pending") return;
  let created = 0, updated = 0, done = 0, removed = 0; const ids = [];
  p.actions.filter(a => a.keep).forEach(a => {
    if (a.type === "create") {
      if (!a.title || !a.title.trim()) return;
      if (a.date && !validYmd(a.date)) return;
      const it = taskFromAction(w, a.isDeadline && !(a.reminders && a.reminders.length) ? Object.assign({}, a, { reminders: [1440, 60] }) : a, { source: msg.via === "ai" ? "ai" : "assistant" });
      it.order = created;
      logItem(w, it, `Added "${it.title}" from the assistant`); created++; ids.push(it.id);
    } else {
      const it = findItem(a.id, w); if (!it) return;
      if (a.type === "update") {
        const c = Object.assign({}, a.changes, a.date ? { date: a.date } : {});
        const parts = [];
        if (c.date) { it.plan = c.date; if (isDone(it)) { it.status = "todo"; it.doneAt = null; } parts.push(`planned for ${fmtDate(c.date + "T12:00")}`); }
        if (c.deadline && it.due) { it.originalDue = it.originalDue || it.due; const was = fmtDue(it.due); it.due = c.deadline + it.due.slice(10); parts.push(`deadline moved from ${was} to ${fmtDue(it.due)}`); }
        if (c.time !== undefined) { if (c.deadline && it.due && c.time) it.due = it.due.slice(0, 11) + c.time; else if (!c.deadline) it.time = c.time; }
        if (c.priority) { it.priority = c.priority; parts.push(`priority ${PRI[c.priority].label}`); }
        if (c.title) { it.title = c.title; parts.push("renamed"); }
        if (c.status) { if (c.status === "completed") { it.status = "done"; it.doneAt = nowIso(); } else it.status = c.status === "in_progress" ? "doing" : "todo"; }
        touch(it); logItem(w, it, `Assistant: ${parts.join(", ") || "updated"} "${it.title}"`); updated++; ids.push(it.id);
      } else if (a.type === "complete") { it.status = "done"; it.doneAt = nowIso(); touch(it); logItem(w, it, `Completed "${it.title}" via the assistant`); done++; }
      else if (a.type === "delete") { w.items = w.items.filter(x => x.id !== it.id); removed++; }
    }
  });
  p.status = "saved"; p.result = { created, updated, done, removed, ids };
  save(); render(); celebrateIfAllDone(w);
  toast([created && `Saved ${created} task${created === 1 ? "" : "s"}`, updated && `updated ${updated}`, done && `completed ${done}`, removed && `deleted ${removed}`].filter(Boolean).join(", ") + ".", null, null, "success");
}
function proposalHTML(msg){
  const p = msg.proposal; if (!p) return "";
  const now = Date.now(); const w = W();
  if (p.status !== "pending") {
    const r = p.result || {};
    const head = p.status === "saved" ? `${IC.check}${[r.created ? `Saved ${r.created} task${r.created === 1 ? "" : "s"}` : "", r.updated ? `updated ${r.updated}` : "", r.done ? `completed ${r.done}` : "", r.removed ? `deleted ${r.removed}` : ""].filter(Boolean).join(", ") || "Saved"}` : "Discarded";
    return `<div class="proposal ${p.status}"><div class="prop-head"><span class="prop-tag ${p.status}">${head}</span>${p.status === "saved" ? `<button class="btn xs" type="button" data-route="overview">View on Today</button>` : ""}</div>
      <ul class="prop-done">${p.actions.filter(a => a.keep).map(a => `<li>${esc(a.type === "update" ? `${a.title} → ${a.date ? dayWord(a.date, now) : "updated"}` : a.title)}</li>`).join("")}</ul></div>`;
  }
  const remLbl = m => m >= 1440 ? `${m / 1440 === 1 ? "1 day" : m / 1440 + " days"} before` : m >= 60 ? `${m / 60 === 1 ? "1 hour" : m / 60 + " hours"} before` : m > 0 ? `${m} min before` : "On the day";
  return `<div class="proposal" data-msg="${msg.id}">
    <div class="prop-head"><span class="prop-tag">${IC.spark}Suggestion · not saved yet</span><span class="muted" style="font-size:12px">Edit anything, untick what you don't want</span></div>
    ${p.actions.map((a, k) => {
      if (a.type === "create") return `<div class="prop-row${a.keep ? "" : " off"}">
        <input type="checkbox" data-pk="${k}" ${a.keep ? "checked" : ""} aria-label="Include ${esc(a.title)}">
        <div class="pr-main"><input type="text" class="pr-title" data-pt="${k}" value="${esc(a.title)}" aria-label="Task title">
          <div class="pr-meta"><span class="pr-kind ${a.isDeadline ? "dl" : ""}">${a.isDeadline ? "Deadline" : "To-do"}</span>
            <label class="pr-f"><span class="sr">${a.isDeadline ? "Due date" : "Day"}</span><input type="date" data-pd="${k}" value="${a.date || ""}" aria-label="${a.isDeadline ? "Due date" : "Day"}"></label>
            <label class="pr-f"><span class="sr">Time</span><input type="time" data-ptm="${k}" value="${a.time || ""}" aria-label="Time"></label>
            <select data-pp="${k}" aria-label="Priority">${Object.keys(PRI).map(x => `<option value="${x}" ${a.priority === x ? "selected" : ""}>${PRI[x].label}</option>`).join("")}</select>
            ${a.estimate ? `<span class="pr-est">~${fmtH(a.estimate)}</span>` : ""}
            ${(a.reminders || []).map(m => `<span class="prop-rem">${IC.bell}${remLbl(m)}</span>`).join("")}
            ${a.assignee && memberOf(w, a.assignee) ? `<span class="pr-who">${avatarHTML(memberOf(w, a.assignee))}For ${esc(memberOf(w, a.assignee).name)}</span>` : ""}
            ${a.assigneeMiss ? `<span class="pr-dup">No one called ${esc(a.assigneeMiss)}</span>` : ""}
            ${a.dupOf ? `<span class="pr-dup">Already on your list</span>` : ""}
          </div></div></div>`;
      const it = findItem(a.id, w);
      const label = a.type === "update" ? (a.why ? "Plan" : a.date ? "Move" : "Change") : a.type === "complete" ? "Mark done" : "Delete";
      const ch = a.changes || {};
      const extra = a.type === "update" ? Object.entries(ch).filter(([k2]) => k2 !== "date" && k2 !== "deadline").map(([k2, v]) => `${k2} → ${v}`).join(", ") : "";
      return `<div class="prop-row update${a.keep ? "" : " off"}">
        <input type="checkbox" data-pk="${k}" ${a.keep ? "checked" : ""} aria-label="Include change to ${esc(a.title)}">
        <div class="pr-main"><p><b>${ch.deadline ? "Move the deadline of" : label}</b> "${esc(a.title)}"${a.type === "update" && a.date ? ` ${a.why ? "for" : "to"} <input type="date" data-pd="${k}" value="${a.date}" aria-label="New day">` : ""}${ch.deadline ? ` to ${esc(fmtDate(ch.deadline + "T12:00"))}` : ""}${extra ? ` · ${esc(extra)}` : ""}${a.why ? `<span class="pr-why muted"> · ${esc(a.why)}</span>` : ""}</p>
          ${it && it.due && ch.deadline ? `<p class="pr-warn">${IC.alert}This changes a hard deadline from ${fmtDue(it.due)}. Only save it if the deadline really moved.</p>`
            : it && it.due && a.date ? `<p class="muted" style="font-size:12.5px">Plans the work for that day. The deadline stays ${fmtDue(it.due)}.</p>` : ""}</div></div>`;
    }).join("")}
    <div class="prop-foot"><button class="btn primary sm" type="button" data-act="propsave">${IC.check}Save to my tasks</button><button class="btn ghost sm" type="button" data-act="propdiscard">Discard</button></div>
  </div>`;
}
function msgHTML(m){
  if (m.role === "user") return `<div class="msg user"><div class="bubble">${esc(m.text)}${m.t ? `<time>${dwTime(m.t)}</time>` : ""}</div></div>`;
  return `<div class="msg ai${m.error ? " error" : ""}" data-msg="${m.id}"><span class="orb sm" aria-hidden="true"></span><div class="bubble">${m.text ? `<p class="ai-text">${esc(m.text)}</p>` : ""}${proposalHTML(m)}
    ${m.error ? `<div class="row-flex"><button class="btn sm" type="button" data-act="airetry">Try again</button></div>` : ""}
    <div class="dw-meta">${m.t ? `<time>${dwTime(m.t)}</time>` : ""}${m.via === "rules" && !m.error ? `<span class="via">Simple rules (on this device)</span>` : m.via === "local" && !m.error ? `<span class="via">From your saved tasks</span>` : m.via === "engine" && !m.error ? `<span class="via">Planned on your server (private)</span>` : ""}</div></div></div>`;
}
const SUGGEST = {
  student: ["Tomorrow I have to complete my Java assignment, attend college, practice DSA for two hours, and submit my project report.", "I have to study Python, finish my website homepage, and call my project teammate today.", "My project submission deadline is 5 November.", "Move my unfinished tasks to tomorrow."],
  company: ["Today I need to review the landing page, reply to the client and prepare the sprint demo.", "The Q4 report deadline is next Friday.", "Tomorrow I have a team sync at 10am and need to finish the API docs.", "Move my unfinished tasks to tomorrow."],
  personal: ["Tomorrow I need to pay the electricity bill, go to the gym and call mom.", "My passport renewal deadline is 20 November.", "Today I have to buy groceries and clean the kitchen.", "Move my unfinished tasks to tomorrow."]
};
function viewAssistant(){
  const w = W(); const chat = chatOf(w); const now = CTX.now;
  const P = todayProgress(w, now); const today = todayTodos(w, now).sort(todoSort).slice(0, 6);
  const name = (state.user.name || "").split(" ")[0];
  const msgs = chat.map(msgHTML).join("") + (AI.busy ? `<div class="msg ai typing-msg"><span class="orb sm spin" aria-hidden="true"></span><div class="bubble"><span class="typing" aria-label="Thinking"><i></i><i></i><i></i></span><span class="muted">Planning…</span></div></div>` : "");
  const welcome = !chat.length ? `<div class="ai-welcome"><span class="orb lg" aria-hidden="true"></span><h3>${name ? `Hi ${esc(name)}, what` : "What"}'s on your plate?</h3><p>Tell me your work in your own words. I'll turn it into a to-do list you can check before anything is saved.</p>
      <div class="ai-suggest">${(SUGGEST[w.mode] || SUGGEST.student).map(s => `<button type="button" data-act="aisuggest" data-v="${esc(s)}">${esc(s)}</button>`).join("")}</div></div>` : "";
  return `<div class="ai-wrap">
    <section class="ai-chat">
      <header class="ai-head"><span class="orb" aria-hidden="true"></span><div><h2>Assistant</h2><p class="ai-mode" id="aiMode">${aiModeHTML()}</p></div>
        ${chat.length ? `<button class="btn ghost sm" type="button" data-act="aiclear">New chat</button>` : ""}</header>
      <div class="ai-msgs" id="aiMsgs" aria-live="polite">${welcome}${msgs}</div>
      <div class="ai-quick" role="group" aria-label="Quick actions">
        <button class="chip-btn" type="button" data-act="aiadd">${IC.plus}Add task</button>
        <button class="chip-btn" type="button" data-act="aitoday">${IC.list}View today</button>
        <button class="chip-btn" type="button" data-act="aireschedule">${IC.forward}Reschedule unfinished</button>
      </div>
      <form class="ai-compose" id="aiForm"><textarea id="aiInput" rows="1" placeholder="e.g. Tomorrow I have to finish my report and practise DSA for 2 hours" aria-label="Message the assistant" ${AI.busy ? "disabled" : ""}>${esc(UI.aiDraft || "")}</textarea>
        <button class="btn primary" id="aiSend" type="submit" aria-label="Send" ${AI.busy ? "disabled" : ""}>${IC.send}<span class="hide-m">Send</span></button></form>
    </section>
    <aside class="ai-side">
      <section class="card ai-today"><div class="card-h"><h3>Today</h3><a class="sub" href="#overview" data-route="overview">Open Today</a></div>
        <div class="row-flex"><div class="th-ring sm">${progressRing(P.done, P.total, 52)}<span>${P.done}/${P.total}</span></div><p class="muted" style="font-size:13px">${P.total ? `${P.done} of ${P.total} tasks completed` : "Nothing planned yet. Tell me what you need to do."}</p></div>
        <div class="mini-todos">${today.map(i => todoRowHTML(i)).join("")}</div></section>
      <section class="card ai-how"><h3>How it works</h3><ol><li>Tell me your work, the way you'd say it.</li><li>I suggest tasks, days, priorities and reminders.</li><li>You edit and approve. Only then is anything saved.</li></ol>
        <p class="note">${IC.info}<span>${AI.kind === "engine" ? "My Plan runs on your Deadline Tracker server and reads only your own saved tasks. They are never sent to an outside AI." : "Planning runs in this browser with simple rules. Start the Deadline Tracker server to use the full planning engine, accounts and reminders."}</span></p></section>
    </aside></div>`;
}
VIEWS.assistant = viewAssistant;
PAGE.assistant = "Assistant";

function rescheduleUnfinished(){
  const w = W(); const now = Date.now(); const t = todayKey(now), tm = tomorrowKey(now);
  const left = myTasks(w).filter(i => !isDone(i) && i.plan && i.plan <= t);
  chatOf(w).push({ id: rid("m"), role: "user", text: "Move my unfinished tasks to tomorrow.", t: nowIso() });
  chatOf(w).push({ id: rid("m"), role: "ai", via: "local", t: nowIso(), text: left.length ? `Here's what I'd move to tomorrow (${left.length}).` : "Nothing unfinished on today's list, so there's nothing to move.",
    proposal: left.length ? { status: "pending", actions: left.map(i => ({ type: "update", keep: true, id: i.id, title: i.title, changes: { date: tm }, date: tm })) } : null });
  save(); render();
}
function scrollChat(){ const m = $("#aiMsgs"); if (m && chatOf(W()).length) m.scrollTop = m.scrollHeight; else if (m) m.scrollTop = 0; }

/* ---------- events ---------- */
document.addEventListener("submit", e => {
  if (e.target.id === "aiForm") { e.preventDefault(); const v = $("#aiInput").value; sendToAssistant(v); }
});
document.addEventListener("keydown", e => {
  if (e.target.id === "aiInput" && e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendToAssistant(e.target.value); }
});
document.addEventListener("input", e => {
  if (e.target.id === "aiInput") { UI.aiDraft = e.target.value; e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px"; }
});
document.addEventListener("change", e => {
  const t = e.target; const box = t.closest && t.closest(".proposal[data-msg]"); if (!box) return;
  const msg = chatOf(W()).find(m => m.id === box.dataset.msg); if (!msg || !msg.proposal) return;
  const k = +(t.dataset.pk ?? t.dataset.pt ?? t.dataset.pd ?? t.dataset.ptm ?? t.dataset.pp); const a = msg.proposal.actions[k]; if (!a) return;
  if (t.dataset.pk != null) { a.keep = t.checked; t.closest(".prop-row").classList.toggle("off", !a.keep); }
  else if (t.dataset.pt != null) a.title = t.value.trim().slice(0, 140) || a.title;
  else if (t.dataset.pd != null) { a.date = t.value || null; if (a.type === "update") { a.changes = Object.assign({}, a.changes, { date: a.date }); } }
  else if (t.dataset.ptm != null) a.time = t.value || null;
  else if (t.dataset.pp != null) a.priority = t.value;
  save();
});
document.addEventListener("click", e => {
  const a = e.target.closest("[data-act]"); if (!a || !state || !state.workspaces || !state.workspaces.length) return;
  const w = W();
  switch (a.dataset.act) {
    case "aisuggest": sendToAssistant(a.dataset.v); break;
    case "propsave": case "propdiscard": {
      const box = a.closest(".proposal[data-msg]"); const msg = box && chatOf(w).find(m => m.id === box.dataset.msg);
      if (!msg) break;
      if (a.dataset.act === "propsave") { if (!msg.proposal.actions.some(x => x.keep)) { toast("Tick at least one suggestion to save.", null, null, "error"); break; } if (msg.serverId) applyServerProposal(msg); else applyProposal(msg); }
      else if (msg.serverId) applyServerProposal(msg, true);
      else { msg.proposal.status = "discarded"; save(); render(); }
      break; }
    case "airetry": { const box = a.closest("[data-msg]"); const chat = chatOf(w); const k = chat.findIndex(m => m.id === (box && box.dataset.msg)); const msg = chat[k];
      if (!msg) break; chat.splice(k, 1); sendToAssistant(msg.retry, { retry: true }); break; }
    case "aiclear": { const before = chatOf(w).slice(); w.chat = []; save(); render(); toast("Started a new chat. Your tasks are unchanged.", () => { w.chat = before; save(); render(); }); break; }
    case "aiadd": openQuickAdd(); break;
    case "aitoday": UI.todoTab = "today"; setRoute("overview"); break;
    case "aireschedule": rescheduleUnfinished(); break;
  }
});
