// The productivity engine: plain, explainable scheduling rules that run on our own server.
// It works without any outside AI, never invents deadlines or durations, and only *suggests*:
// every change it proposes is shown to the user and saved only after they confirm.
//
// Rules in short
// - Work left on a task = its estimate x (1 - progress). Tasks without an estimate are listed, never guessed.
// - Available time = the user's hours per day on their work days (today: only what's left of the day).
// - Work is spread over the days before each deadline, earliest deadline first, at most 2 hours per task per day.
// - A day is overloaded when the planned work is more than the hours available that day.
// - Priority order: overdue first, then by how soon it's due, then by priority, then work left.
const T = require("../time");

const PRI_W = { high: 0, medium: 1, low: 2 };
const remaining = t => t.estimate_hours > 0 && t.status !== "done" ? Math.max(0, t.estimate_hours * (1 - (t.progress || 0) / 100)) : null;
const hrs = h => { if (h == null) return ""; const m = Math.round(h * 60); return m < 60 ? `${m} min` : `${Math.round(h * 4) / 4}h`; };
const dayOfTask = t => t.plan_date || t.due_date;

function ctx(settings, now, tz){
  const today = T.localDate(now, tz);
  const company = settings.mode === "company";
  const winStart = company ? 9 : 7, winLen = company ? 9 : 16;
  const hpd = Number(settings.hoursPerDay) > 0 ? Number(settings.hoursPerDay) : 3;
  const workdays = Array.isArray(settings.workdays) && settings.workdays.length ? settings.workdays : [0, 1, 2, 3, 4, 5, 6];
  // Hours available on a date: the day's hours on a work day; for today only the part of the day that's left.
  const capacity = date => {
    if (!workdays.includes(T.weekday(date))) return 0;
    if (date !== today) return hpd;
    const start = T.zonedToUtc(today, `${T.pad(winStart)}:00`, tz), end = start + winLen * 3600e3;
    return Math.round(hpd * Math.min(1, Math.max(0, (end - Math.max(now, start)) / (winLen * 3600e3))) * 4) / 4;
  };
  return { now, tz, today, hpd, workdays, capacity, winStart };
}

// Spread the remaining work of each deadline over the days before it.
function schedule(tasks, settings, now, tz, horizon = 14){
  const c = ctx(settings, now, tz);
  const work = tasks.filter(t => t.status !== "done" && t.due_at != null && remaining(t) > .01).sort((a, b) => a.due_at - b.due_at);
  const left = new Map(work.map(t => [t.id, remaining(t)]));
  const days = [];
  for (let k = 0; k < horizon; k++) {
    const date = T.addDays(c.today, k); const cap = c.capacity(date);
    let free = cap; const per = new Map();
    let moved = true;
    while (free >= .25 && moved) {
      moved = false;
      for (const t of work) {
        if (free < .25) break;
        if (left.get(t.id) <= .01) continue;
        if (t.due_at > now && date > t.due_date) continue;                                            // after its deadline
        if (t.due_at > now && date === t.due_date && t.due_time && t.due_time < `${T.pad(c.winStart + 2)}:00`) continue; // due early that morning
        const done = per.get(t.id) || 0; if (done >= 2) continue;
        const h = Math.floor(Math.min(left.get(t.id), 1, 2 - done, free) * 4) / 4;
        if (h < .25) { if (left.get(t.id) < .25) left.set(t.id, 0); continue; }
        per.set(t.id, done + h); left.set(t.id, left.get(t.id) - h); free -= h; moved = true;
      }
    }
    const fixed = tasks.filter(t => t.status !== "done" && t.due_at == null && t.plan_date === date).reduce((s, t) => s + (remaining(t) || 0), 0);
    const sessions = [...per].map(([id, h]) => ({ taskId: id, title: work.find(t => t.id === id).title, hours: h }));
    const planned = sessions.reduce((s, x) => s + x.hours, 0) + fixed;
    days.push({ date, capacity: cap, sessions, plannedHours: Math.round(planned * 100) / 100, otherPlannedHours: fixed, overloaded: planned > cap + .01 });
  }
  const wontFit = work.filter(t => left.get(t.id) > .1).map(t => ({ taskId: t.id, title: t.title, hoursShort: Math.round(left.get(t.id) * 4) / 4, dueDate: t.due_date }));
  const noEstimate = tasks.filter(t => t.status !== "done" && t.due_at != null && !(t.estimate_hours > 0)).map(t => ({ taskId: t.id, title: t.title, dueDate: t.due_date }));
  return { today: c.today, hoursPerDay: c.hpd, days, wontFit, noEstimate };
}

// Rank open tasks: overdue first, then the soonest deadline, then priority, then work left. Each comes with its reason.
function prioritise(tasks, settings, now, tz){
  const c = ctx(settings, now, tz);
  return tasks.filter(t => t.status !== "done").map(t => {
    const overdue = t.due_at != null && t.due_at < now;
    const hoursLeft = t.due_at != null ? (t.due_at - now) / 3600e3 : null;
    const rem = remaining(t);
    const reasons = [];
    if (overdue) reasons.push(`overdue since ${T.niceDate(t.due_date, c.today)} ${T.niceTime(t.due_time)}`);
    else if (t.due_date) reasons.push(`due ${T.niceDate(t.due_date, c.today)} ${T.niceTime(t.due_time)}`);
    else if (t.plan_date) reasons.push(t.plan_date < c.today ? `left over from ${T.niceDate(t.plan_date, c.today)}` : `planned ${T.niceDate(t.plan_date, c.today)}`);
    if (t.priority === "high") reasons.push("high priority");
    if (rem) reasons.push(`about ${hrs(rem)} of work left`);
    const rank = overdue ? 0 : t.due_at != null ? 1 : t.plan_date && t.plan_date <= c.today ? 2 : 3;
    return { t, rank, hoursLeft, rem, reason: reasons.join(", ") };
  }).sort((a, b) => a.rank - b.rank || (a.hoursLeft ?? 1e9) - (b.hoursLeft ?? 1e9) || PRI_W[a.t.priority] - PRI_W[b.t.priority] || (b.rem || 0) - (a.rem || 0));
}

// A suggested plan for one day, built only from the user's saved tasks.
function dayPlan(tasks, settings, now, tz, date){
  const c = ctx(settings, now, tz); const name = T.niceDate(date, c.today);
  const open = tasks.filter(t => t.status !== "done");
  const nextDay = T.addDays(date, 1);
  const already = open.filter(t => t.plan_date === date || (!t.plan_date && t.due_date === date));
  const seen = new Set(already.map(t => t.id)); const picks = [];
  const add = (t, why, h, rank) => { if (seen.has(t.id)) return; seen.add(t.id); picks.push({ t, why, h, rank }); };
  open.filter(t => t.due_at != null && t.due_at < now).sort((a, b) => a.due_at - b.due_at)
    .forEach(t => add(t, `overdue since ${T.niceDate(t.due_date, c.today)} ${T.niceTime(t.due_time)}`, remaining(t), 0));
  open.filter(t => t.due_at != null && t.due_at >= now && (t.due_date === date || t.due_date === nextDay)).sort((a, b) => a.due_at - b.due_at)
    .forEach(t => add(t, `due ${T.niceDate(t.due_date, c.today)} ${T.niceTime(t.due_time)}`, remaining(t), 1));
  const sch = schedule(tasks, settings, now, tz, Math.max(14, T.daysBetween(c.today, date) + 1));
  const d = sch.days.find(x => x.date === date);
  (d ? d.sessions : []).forEach(s => { const t = open.find(x => x.id === s.taskId); if (t) add(t, `about ${hrs(s.hours)} toward the ${T.niceDate(t.due_date, c.today)} deadline`, s.hours, 2); });
  if (date >= c.today) open.filter(t => t.due_at == null && t.plan_date && t.plan_date < c.today).forEach(t => add(t, `left over from ${T.niceDate(t.plan_date, c.today)}`, remaining(t), 3));
  picks.sort((a, b) => a.rank - b.rank || PRI_W[a.t.priority] - PRI_W[b.t.priority]);
  const cap = c.capacity(date) || c.hpd;
  let hours = already.reduce((s, t) => s + (remaining(t) || 0), 0); const off = [];
  picks.forEach(p => { const h = p.h || 0; if (p.rank >= 2 && hours + h > cap + .01) { p.keep = false; off.push(p.t.title); } else hours += h; });
  if (!picks.length) {
    const reply = already.length
      ? `${name.charAt(0).toUpperCase() + name.slice(1)} already has ${already.length} task${already.length === 1 ? "" : "s"} planned (${already.map(t => t.title).join(", ")}). Nothing else is due soon, so you're set.`
      : `Nothing is due or planned for ${name} yet. Tell me what you need to do, for example "${date === c.today ? "Today" : "Tomorrow"} I have to finish my report and go to the gym."`;
    return { reply, actions: [], hours, capacity: cap };
  }
  let reply = `Here's a plan for ${name} from your saved tasks, most urgent first.`;
  if (already.length) reply += ` Already planned: ${already.map(t => t.title).join(", ")}.`;
  if (hours) reply += hours > cap + .01 ? ` That's about ${hrs(hours)} of work, more than the ${hrs(cap)} you have, so start from the top.` : ` That's about ${hrs(hours)} of work.`;
  if (off.length) reply += ` I left ${off.join(", ")} unticked so the day isn't overloaded.`;
  reply += " Deadlines stay where they are.";
  return { reply, hours, capacity: cap, actions: picks.map(p => ({ type: "plan", keep: p.keep !== false, id: p.t.id, title: p.t.title, date, why: p.why + (p.h ? ` · ~${hrs(p.h)}` : "") })) };
}

// "I have too much work": what to do first, which days are overloaded, and what won't fit.
function organise(tasks, settings, now, tz){
  const c = ctx(settings, now, tz);
  const ranked = prioritise(tasks, settings, now, tz);
  if (!ranked.length) return { reply: "You have no open tasks right now. Tell me what you need to do and I'll organise it.", actions: [] };
  const sch = schedule(tasks, settings, now, tz, 14);
  const lines = ranked.slice(0, 5).map((x, i) => `${i + 1}. ${x.t.title} (${x.reason})`);
  const over = sch.days.filter(d => d.overloaded).map(d => `${T.niceDate(d.date, c.today)} (${hrs(d.plannedHours)} planned, ${hrs(d.capacity)} available)`);
  let reply = `Let's take it one step at a time. Your work in order of urgency:\n${lines.join("\n")}`;
  if (ranked.length > 5) reply += `\n…and ${ranked.length - 5} more.`;
  if (sch.wontFit.length) reply += `\nThese won't fit before their deadline at your current hours: ${sch.wontFit.map(w => `${w.title} (${hrs(w.hoursShort)} short)`).join(", ")}. Consider more hours, asking for help or asking for more time.`;
  if (over.length) reply += `\nOverloaded days: ${over.join("; ")}.`;
  if (sch.noEstimate.length) reply += `\nAdd a time estimate to ${sch.noEstimate.slice(0, 3).map(x => x.title).join(", ")} so I can plan them properly.`;
  const today = dayPlan(tasks, settings, now, tz, c.today);
  if (today.actions.length) reply += "\nBelow is a plan for today you can save.";
  return { reply, actions: today.actions };
}

// Split a big task into work sessions spread before its deadline. Needs an estimate; never guesses one.
function breakdown(task, settings, now, tz){
  const c = ctx(settings, now, tz);
  const rem = remaining(task);
  if (!rem) return { reply: `How many hours do you think "${task.title}" will take? Tell me (for example "about 6 hours") and I'll split it into sessions. I won't guess.`, actions: [], needEstimate: task.id };
  const n = Math.min(12, Math.max(2, Math.ceil(rem / 1.5)));
  const size = Math.round(rem / n * 4) / 4 || .25;
  // dates: work days from today up to the day before the deadline (or the deadline day), spread evenly
  const last = task.due_date ? (task.due_date > c.today ? T.addDays(task.due_date, -1) : c.today) : T.addDays(c.today, n - 1);
  const avail = []; for (let d = c.today; d <= last && avail.length < 60; d = T.addDays(d, 1)) if (c.capacity(d) > 0) avail.push(d);
  if (!avail.length) avail.push(c.today);
  const steps = Array.from({ length: n }, (_, k) => ({
    text: k === 0 ? `Plan the work and gather what you need (part 1 of ${n})` : k === n - 1 ? `Finish, check and submit (part ${n} of ${n})` : `Work session (part ${k + 1} of ${n})`,
    hours: size, date: avail[Math.min(avail.length - 1, Math.floor(k * avail.length / n))] }));
  const tight = task.due_date && avail.length < n / 2;
  return { reply: `I split "${task.title}" (about ${hrs(rem)} left) into ${n} sessions of about ${hrs(size)}${task.due_date ? `, all before the ${T.niceDate(task.due_date, c.today)} deadline` : ""}.${tight ? " Time is tight, so some days have more than one session." : ""} Save them as steps on the task?`,
    actions: [{ type: "steps", keep: true, id: task.id, title: task.title, steps }] };
}

function workload(tasks, settings, now, tz, days = 14){
  const sch = schedule(tasks, settings, now, tz, days);
  return { today: sch.today, hoursPerDay: sch.hoursPerDay, days: sch.days.map(d => ({ date: d.date, capacity: d.capacity, plannedHours: d.plannedHours, overloaded: d.overloaded, sessions: d.sessions })),
    overloadedDays: sch.days.filter(d => d.overloaded).map(d => d.date), wontFit: sch.wontFit, noEstimate: sch.noEstimate,
    availableHours: Math.round(sch.days.reduce((s, d) => s + d.capacity, 0) * 4) / 4 };
}
module.exports = { schedule, prioritise, dayPlan, organise, breakdown, workload, remaining, hrs, ctx };
