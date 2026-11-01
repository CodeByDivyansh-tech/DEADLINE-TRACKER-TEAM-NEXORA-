// My Plan: the private planning assistant. Runs entirely on our server with the productivity engine
// (no outside AI sees the user's tasks). It only suggests; changes are saved by /api/plan/apply after the
// user confirms, and every change is validated and ownership-checked here.
const { ApiError, V } = require("../http");
const T = require("../time");
const P = require("./parse");
const E = require("./productivity");

const STOP = new Set("i me my mine we our you your it its this that the a an to of for on in at by with and or but so is are was were be am do did please also just then can could would should will task tasks into smaller small steps parts pieces break down split mark as done complete completed finished move shift reschedule postpone push".split(" "));
const toks = s => (String(s).toLowerCase().match(/[a-z0-9+#]+/g) || []).filter(x => x.length >= 2 && !STOP.has(x)).map(x => x.replace(/(ing|ed|es|s)$/, ""));
const norm = s => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
function matchTask(open, text){
  const want = toks(text); if (!want.length) return null;
  const scored = open.map(t => ({ t, s: toks(t.title).filter(x => want.includes(x)).length / Math.max(1, toks(t.title).length) + toks(t.title).filter(x => want.includes(x)).length })).filter(x => x.s >= 1).sort((a, b) => b.s - a.s);
  return scored.length ? scored[0].t : null;
}
const PLAN_FILL = new Set("please can could would you help me to plan planning organise organize schedule arrange make a an out my the for of whole full entire day today tomorrow tonight what should shall i do work on complete finish focus start first next it everything all tasks task have too much lot so m im am feel overwhelmed overloaded busy kya karna karu karoon karun bana banao de dena sakta sakti hu hoon".split(" "));
const WDS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "next", "this", "on"];

// What kind of request is this?
function intent(raw, today){
  const s = P.normalize(raw).toLowerCase().replace(/[^a-z0-9 ]+/g, " ");
  const both = String(raw).toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9 ]+/g, " ").replace(/\bkal\b/g, "tomorrow").replace(/\baaj\b/g, "today") + " " + s;
  const onlyFill = () => !s.split(/\s+/).some(x => x && !PLAN_FILL.has(x) && !WDS.includes(x));
  const dayOf = () => P.parseOne(" x " + P.normalize(raw), today).date || today;
  if (/\b(too much (work|to do)|overwhelmed|overloaded|(organi[sz]e|prioriti[sz]e) (it|my work|everything|my tasks|all)|help me prioriti[sz]e)\b/.test(both)) return { kind: "organise" };
  if (/\b(break|split|divide)\b[\s\S]*\b(into|in)\b[\s\S]*\b(smaller|steps?|parts?|tasks?|pieces?|sessions?)\b|\bbreak down\b|\bchhote parts\b/.test(both)) return { kind: "breakdown" };
  if (/\b(move|shift|reschedule|postpone|push|carry)\b[\s\S]*\b(unfinished|remaining|leftover|incomplete|pending)\b/.test(both)) return { kind: "carry", date: dayOf() === today ? T.addDays(today, 1) : dayOf() };
  if (/\bmark\b[\s\S]*\b(done|complete|completed|finished)\b|\bi (have )?(finished|completed|done)\b/.test(both)) return { kind: "complete" };
  if (/\b(move|shift|reschedule|postpone|push)\b/.test(both)) return { kind: "move", date: P.parseOne(" x " + P.normalize(raw.replace(/^.*?\b(to|for)\b/i, " ")), today).date };
  if (/\b(whats? overdue|what is overdue|overdue tasks?|anything overdue|am i late|missed deadlines?)\b/.test(both)) return { kind: "overdue" };
  if (/\b(how am i doing|my progress|my stats|statistics|productivity report|kitna kaam)\b/.test(both)) return { kind: "stats" };
  if (/\b(whats? (due|pending|left)|what is (due|pending|left)|upcoming deadlines|deadlines? (this|next) week|what do i have)\b/.test(both)) return { kind: "due", date: /tomorrow/.test(s) ? T.addDays(today, 1) : /today/.test(s) ? today : null };
  if ((/\b(plan|planning|organi[sz]e|schedule|arrange)\b[\s\S]*\b(day|today|tomorrow|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b|\bwhat should i (do|work on|complete|finish|focus on|start)\b|\b(today|tomorrow) kya (karna|karu|karoon|karun)\b|\bplan (bana|banao)\b/.test(both)) && onlyFill()) return { kind: "day", date: dayOf() };
  return { kind: "extract" };
}

function createPlan({ db, tasks, conversations, stats, notifications }){
  const ctxOf = user => { const now = Date.now(); return { now, tz: user.timezone, today: T.localDate(now, user.timezone), settings: tasks.settingsOf(user) }; };
  // Answer one message. Returns { reply, actions } (actions are suggestions, nothing is saved here).
  function respond(user, text){
    const c = ctxOf(user); const rows = tasks.allRows(user); const open = rows.filter(t => t.status !== "done");
    const it = intent(text, c.today);
    switch (it.kind) {
      case "day": return E.dayPlan(rows, c.settings, c.now, c.tz, it.date);
      case "organise": return E.organise(rows, c.settings, c.now, c.tz);
      case "breakdown": {
        const t = matchTask(open, text);
        if (!t) return { reply: open.length ? `Which task should I break down? For example "break ${open[0].title} into steps".` : "You have no open tasks to break down yet.", actions: [] };
        const est = P.parseOne(" " + P.normalize(text), c.today).estimate;
        return E.breakdown(est && !(t.estimate_hours > 0) ? Object.assign({}, t, { estimate_hours: est }) : t, c.settings, c.now, c.tz);
      }
      case "carry": {
        const left = open.filter(t => t.plan_date && t.plan_date <= c.today);
        return left.length ? { reply: `Here's what I'd move to ${T.niceDate(it.date, c.today)} (${left.length}). Deadlines stay where they are.`, actions: left.map(t => ({ type: "plan", keep: true, id: t.id, title: t.title, date: it.date, why: `planned ${T.niceDate(t.plan_date, c.today)}` })) }
          : { reply: "Nothing unfinished on today's list, so there's nothing to move.", actions: [] };
      }
      case "move": {
        const t = matchTask(open, text.replace(/\b(to|for)\s+\S+.*$/i, ""));
        if (!t) return { reply: "Which task should I move? I couldn't match it to anything on your list.", actions: [] };
        if (!it.date) return { reply: `Which day should I move "${t.title}" to?`, actions: [] };
        const dl = /\b(deadline|due date)\b/i.test(text) && t.due_date;
        return { reply: dl ? `This would change the hard deadline of "${t.title}" from ${T.niceDate(t.due_date, c.today)} to ${T.niceDate(it.date, c.today)}. Only save it if the deadline really moved.` : `I'll plan "${t.title}" for ${T.niceDate(it.date, c.today)}.${t.due_date ? ` Its deadline stays ${T.niceDate(t.due_date, c.today)}.` : ""}`,
          actions: [{ type: dl ? "deadline" : "plan", keep: true, id: t.id, title: t.title, date: it.date }] };
      }
      case "complete": {
        const t = matchTask(open, text);
        return t ? { reply: `Mark "${t.title}" as done?`, actions: [{ type: "complete", keep: true, id: t.id, title: t.title }] } : { reply: "Which task did you finish? I couldn't match it to anything open.", actions: [] };
      }
      case "overdue": {
        const od = E.prioritise(rows, c.settings, c.now, c.tz).filter(x => x.rank === 0);
        return { reply: od.length ? `You have ${od.length} overdue task${od.length === 1 ? "" : "s"}:\n${od.map((x, i) => `${i + 1}. ${x.t.title} (${x.reason})`).join("\n")}\nSay "plan my day" and I'll put them first.` : "Nothing is overdue. Nice work!", actions: [] };
      }
      case "due": {
        const end = it.date || T.addDays(c.today, 6);
        const list = open.filter(t => t.due_date && t.due_date <= end && (!it.date || t.due_date === it.date || t.plan_date === it.date)).sort((a, b) => a.due_at - b.due_at);
        const when = it.date ? T.niceDate(it.date, c.today) : "in the next 7 days";
        return { reply: list.length ? `Due ${when}:\n${list.map((t, i) => `${i + 1}. ${t.title} (${T.niceDate(t.due_date, c.today)} ${T.niceTime(t.due_time)}, ${t.priority} priority)`).join("\n")}` : `Nothing is due ${when}.`, actions: [] };
      }
      case "stats": {
        const s = stats.summary(user);
        return { reply: `You've completed ${s.completed} of ${s.total} tasks (${s.completionRate}%). ${s.pending} are pending and ${s.overdue} overdue. This week you finished ${s.weekly[s.weekly.length - 1].completed}.`, actions: [] };
      }
      default: {
        const acts = P.extract(text, c);
        if (!acts.length) return { reply: "I can turn your work into tasks (\"Tomorrow I have to finish my report and call Priya\"), plan a day (\"plan my tomorrow\"), organise everything (\"I have too much work\"), break a task into steps, or list what's overdue. For questions about using the website, use the Help tab.", actions: [] };
        acts.forEach(a => { const dup = open.find(t => norm(t.title) === norm(a.title) && (t.plan_date || t.due_date || null) === a.date); if (dup) { a.keep = false; a.dupOf = dup.id; } });
        // A test or exam a few days away: suggest (unticked) a revision session the day before.
        acts.filter(a => a.exam && a.date && T.daysBetween(c.today, a.date) >= 2).forEach(a => acts.push({ type: "create", keep: false, title: `Prepare for ${a.title}`, date: T.addDays(a.date, -1), time: null, isDeadline: false, priority: "medium", estimate: null, reminders: [], suggested: true }));
        const nDl = acts.filter(a => a.isDeadline && a.type === "create" && !a.suggested).length, nTodo = acts.filter(a => !a.isDeadline && !a.suggested).length;
        let reply = acts.length === 1 && acts[0].isDeadline ? `Got it. I'll track "${acts[0].title}" as a deadline on ${T.niceDate(acts[0].date, c.today)}, with reminders 1 day and 1 hour before. Save it?`
          : `Here's your suggested plan${nDl && nTodo ? `: ${nDl} deadline${nDl === 1 ? "" : "s"} and ${nTodo} task${nTodo === 1 ? "" : "s"}` : ""}, most urgent first. Check it and save what you want.`;
        if (acts.some(a => !a.date && !a.suggested)) reply += " Some have no day yet; add one if they're due on a specific day.";
        if (acts.some(a => a.suggested)) reply += " I also suggested a revision session the day before your test, unticked; tick it if you want it.";
        if (acts.some(a => a.dupOf)) reply += " Anything already on your list is unticked.";
        acts.sort((a, b) => (a.suggested - b.suggested) || ((a.date || "9") > (b.date || "9") ? 1 : -1) || ({ high: 0, medium: 1, low: 2 }[a.priority] - { high: 0, medium: 1, low: 2 }[b.priority]));
        return { reply, actions: acts.map(a => { const x = Object.assign({}, a); delete x.exam; return x; }) };
      }
    }
  }

  function chat(user, b){
    const message = V.str(b.message, "message", { min: 1, max: 2000, required: true });
    const conv = conversations.getOrCreate(user, "plan", b.conversationId, message);
    const userMsg = conversations.add(conv, "user", message);
    const r = respond(user, message);
    const reply = conversations.add(conv, "assistant", r.reply, { via: "engine", proposal: r.actions.length ? { status: "pending", actions: r.actions } : null });
    return { conversationId: conv.id, userMessage: userMsg, message: reply };
  }

  // Save the confirmed parts of a suggestion. Edits from the browser are limited to: keep, title, date, time, priority.
  function apply(user, b){
    const m = conversations.message(user, V.str(b.messageId, "messageId", { required: true, max: 64 }));
    const meta = JSON.parse(m.meta || "{}"); const p = meta.proposal;
    if (!p) throw new ApiError(400, "no_proposal", "That message has nothing to save.");
    if (p.status !== "pending") throw new ApiError(409, "already_" + p.status, `This suggestion was already ${p.status}.`);
    if (b.discard === true) { p.status = "discarded"; conversations.setMeta(m.id, meta); return { status: "discarded" }; }
    const edits = Array.isArray(b.actions) ? b.actions : [];
    if (edits.length > p.actions.length) throw new ApiError(400, "invalid_actions", "Too many actions.");
    const acts = p.actions.map((a, i) => {
      const e = edits[i] || {}; const x = Object.assign({}, a);
      if (e.keep !== undefined) x.keep = V.bool(e.keep, "keep");
      if (e.title !== undefined && x.type === "create") x.title = V.str(e.title, "title", { min: 1, max: 200, required: true });
      if (e.date !== undefined) { if (e.date !== null && !T.validDate(e.date)) throw new ApiError(400, "invalid_date", "date must be YYYY-MM-DD."); x.date = e.date; }
      if (e.time !== undefined && x.type === "create") { if (e.time !== null && !T.validTime(e.time)) throw new ApiError(400, "invalid_time", "time must be HH:MM."); x.time = e.time; }
      if (e.priority !== undefined && x.type === "create") x.priority = V.oneOf(e.priority, "priority", ["high", "medium", "low"], "medium");
      return x;
    });
    if (!acts.some(a => a.keep)) throw new ApiError(400, "nothing_selected", "Tick at least one suggestion to save.");
    const result = { created: 0, updated: 0, completed: 0, ids: [] };
    const wsId = tasks.ensureWorkspace(user, null);
    db.tx(() => {
      for (const a of acts.filter(x => x.keep)) {
        if (a.type === "create") {
          const body = { title: a.title, priority: a.priority, estimateHours: a.estimate || null, reminders: a.reminders && a.reminders.length ? a.reminders : null };
          if (a.isDeadline && a.date) Object.assign(body, { dueDate: a.date, dueTime: a.time || "23:59" }); else Object.assign(body, { planDate: a.date || null, planTime: a.time || null });
          const r = tasks.fromBody(user, body); r.workspace_id = wsId; r.extra = JSON.stringify({ assignee: "me", source: "assistant" });
          tasks.insert.run(...tasks.ROW_COLS.map(k => r[k])); result.created++; result.ids.push(r.id);
        } else {
          const t = tasks.own(user, a.id);   // ownership check: only the user's own task
          if (a.type === "plan") { if (!a.date) throw new ApiError(400, "invalid_date", `Pick a day for "${t.title}".`); db.prepare("UPDATE tasks SET plan_date = ?, status = CASE status WHEN 'done' THEN 'todo' ELSE status END, updated_at = ? WHERE id = ? AND user_id = ?").run(a.date, Date.now(), t.id, user.id); result.updated++; }
          else if (a.type === "deadline") { const r = tasks.fromBody(user, { dueDate: a.date }, t); tasks.update.run(...tasks.ROW_COLS.slice(2).map(k => r[k]), t.id, user.id); result.updated++; }
          else if (a.type === "complete") { db.prepare("UPDATE tasks SET status = 'done', progress = 100, completed_at = ?, updated_at = ? WHERE id = ? AND user_id = ?").run(Date.now(), Date.now(), t.id, user.id); result.completed++; }
          else if (a.type === "steps") {
            const x = JSON.parse(t.extra || "{}"); x.milestones = (x.milestones || []).concat(a.steps.map((s, k) => ({ id: "m_" + Date.now().toString(36) + k, text: String(s.text).slice(0, 200), hours: Number(s.hours) || null, date: T.validDate(s.date) ? s.date : null, done: false })));
            db.prepare("UPDATE tasks SET extra = ?, updated_at = ? WHERE id = ? AND user_id = ?").run(JSON.stringify(x), Date.now(), t.id, user.id); result.updated++;
          } else throw new ApiError(400, "invalid_action", "Unknown action.");
          result.ids.push(t.id);
        }
      }
      p.actions = acts; p.status = "saved"; p.result = result; conversations.setMeta(m.id, meta);
      tasks.bump(user.id);
    });
    if (notifications) notifications.touch(user.id);
    return { status: "saved", result };
  }
  return { chat, apply, respond, intent, ctxOf };
}

function routes(r, { plan, tasks }){
  r.add("POST", "/api/plan/chat", async (c) => plan.chat(c.user, await c.json()), { auth: true });
  r.add("POST", "/api/plan/apply", async (c) => plan.apply(c.user, await c.json()), { auth: true });
  const run = (c, fn) => { const x = plan.ctxOf(c.user); return fn(tasks.allRows(c.user), x.settings, x.now, x.tz, x); };
  r.add("GET", "/api/plan/day", (c) => run(c, (rows, s, now, tz, x) => { const d = c.query.date || x.today; if (!T.validDate(d)) throw new ApiError(400, "invalid_date", "date must be YYYY-MM-DD."); return Object.assign({ date: d }, E.dayPlan(rows, s, now, tz, d)); }), { auth: true });
  r.add("GET", "/api/plan/tomorrow", (c) => run(c, (rows, s, now, tz, x) => Object.assign({ date: T.addDays(x.today, 1) }, E.dayPlan(rows, s, now, tz, T.addDays(x.today, 1)))), { auth: true });
  r.add("GET", "/api/plan/priorities", (c) => run(c, (rows, s, now, tz) => ({ tasks: E.prioritise(rows, s, now, tz).map(x => ({ id: x.t.id, title: x.t.title, reason: x.reason, overdue: x.rank === 0 })) })), { auth: true });
  r.add("GET", "/api/plan/workload", (c) => run(c, (rows, s, now, tz) => E.workload(rows, s, now, tz, V.num(c.query.days, "days", { min: 1, max: 60, int: true }) || 14)), { auth: true });
  r.add("GET", "/api/plan/organise", (c) => run(c, (rows, s, now, tz) => E.organise(rows, s, now, tz)), { auth: true });
  r.add("GET", "/api/tasks/:id/breakdown", (c) => run(c, (rows, s, now, tz) => E.breakdown(tasks.own(c.user, c.params.id), s, now, tz)), { auth: true });
}
module.exports = { createPlan, routes, intent };
