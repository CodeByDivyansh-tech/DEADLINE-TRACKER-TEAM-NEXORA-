// Productivity statistics, calculated from the tasks table for the logged-in user only.
const T = require("../time");

function createStats(db){
  function summary(user){
    const now = Date.now(), tz = user.timezone, today = T.localDate(now, tz);
    const rows = db.prepare("SELECT status, priority, due_at, due_date, plan_date, created_at, completed_at FROM tasks WHERE user_id = ?").all(user.id);
    const done = rows.filter(r => r.status === "done"), open = rows.filter(r => r.status !== "done");
    const overdue = open.filter(r => r.due_at != null && r.due_at < now);
    const withDue = done.filter(r => r.due_at != null && r.completed_at);
    const onTime = withDue.filter(r => r.completed_at <= r.due_at);
    // weeks run Monday to Sunday in the user's time zone
    const dow = T.weekday(today), monday = T.addDays(today, -((dow + 6) % 7));
    const weekly = Array.from({ length: 8 }, (_, k) => { const start = T.addDays(monday, -7 * (7 - k)); const end = T.addDays(start, 6);
      const inW = ms => { const d = T.localDate(ms, tz); return d >= start && d <= end; };
      return { weekStart: start, completed: done.filter(r => r.completed_at && inW(r.completed_at)).length, created: rows.filter(r => inW(r.created_at)).length }; });
    const ym = d => d.slice(0, 7);
    const months = []; { let [y, m] = today.split("-").map(Number); for (let k = 0; k < 6; k++) { months.unshift(`${y}-${T.pad(m)}`); m--; if (!m) { m = 12; y--; } } }
    const monthly = months.map(mo => { const c = done.filter(r => r.completed_at && ym(T.localDate(r.completed_at, tz)) === mo);
      const dueIn = rows.filter(r => r.due_date && ym(r.due_date) === mo);
      return { month: mo, completed: c.length, created: rows.filter(r => ym(T.localDate(r.created_at, tz)) === mo).length,
        onTimeRate: dueIn.filter(r => r.status === "done").length ? Math.round(dueIn.filter(r => r.status === "done" && r.completed_at <= r.due_at).length / dueIn.filter(r => r.status === "done").length * 100) : null }; });
    const pri = p => ({ total: rows.filter(r => r.priority === p).length, pending: open.filter(r => r.priority === p).length, completed: done.filter(r => r.priority === p).length });
    return {
      total: rows.length, completed: done.length, pending: open.length, overdue: overdue.length,
      completionRate: rows.length ? Math.round(done.length / rows.length * 100) : 0,
      onTimeRate: withDue.length ? Math.round(onTime.length / withDue.length * 100) : null,
      dueToday: open.filter(r => r.due_date === today || r.plan_date === today).length,
      priorities: { high: pri("high"), medium: pri("medium"), low: pri("low") },
      weekly, monthly, generatedAt: new Date(now).toISOString(), timezone: tz
    };
  }
  return { summary };
}
function routes(r, { stats }){ r.add("GET", "/api/stats", (c) => stats.summary(c.user), { auth: true }); }
module.exports = { createStats, routes };
