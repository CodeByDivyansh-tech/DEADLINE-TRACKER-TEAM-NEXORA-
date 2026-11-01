// Productivity engine and text reader: plain rules, tested with a fixed clock (Fri 30 Oct 2026, 12:00 India time).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const E = require("../lib/modules/productivity");
const P = require("../lib/modules/parse");
const T = require("../lib/time");

const tz = "Asia/Kolkata", now = Date.parse("2026-10-30T12:00:00+05:30"), today = "2026-10-30";
const S = { hoursPerDay: 3, workdays: [0, 1, 2, 3, 4, 5, 6], mode: "student" };
let n = 0;
const task = o => Object.assign({ id: "t" + (++n), title: "Task " + n, status: "todo", priority: "medium", progress: 0, estimate_hours: null, due_date: null, due_time: null, due_at: null, plan_date: null, plan_time: null },
  o, o.due_date ? { due_time: o.due_time || "23:59", due_at: T.zonedToUtc(o.due_date, o.due_time || "23:59", tz) } : {});

test("time zones: local dates and times convert to the right UTC moment", () => {
  assert.equal(new Date(T.zonedToUtc("2026-10-31", "17:00", "Asia/Kolkata")).toISOString(), "2026-10-31T11:30:00.000Z");
  assert.equal(new Date(T.zonedToUtc("2026-11-01", "09:00", "America/New_York")).toISOString(), "2026-11-01T14:00:00.000Z", "after the US clock change");
  assert.equal(new Date(T.zonedToUtc("2026-10-31", "09:00", "America/New_York")).toISOString(), "2026-10-31T13:00:00.000Z", "before it");
  assert.equal(T.localDate(Date.parse("2026-10-30T20:00:00Z"), "Asia/Kolkata"), "2026-10-31");
});
test("schedule: spreads work before each deadline, max 2h per task per day, and flags what won't fit", () => {
  const a = task({ title: "DBMS assignment", due_date: "2026-11-02", due_time: "17:00", estimate_hours: 5 });
  const b = task({ title: "Huge project", due_date: "2026-10-31", estimate_hours: 10 });
  const sch = E.schedule([a, b], S, now, tz, 7);
  sch.days.forEach(d => { const per = {}; d.sessions.forEach(x => { per[x.taskId] = (per[x.taskId] || 0) + x.hours; }); Object.values(per).forEach(h => assert.ok(h <= 2)); assert.ok(d.sessions.reduce((s, x) => s + x.hours, 0) <= d.capacity + 1e-9); });
  assert.ok(sch.days.filter(d => d.date > "2026-10-31").every(d => !d.sessions.some(x => x.taskId === b.id)), "no work planned after its deadline");
  assert.ok(sch.wontFit.some(w => w.title === "Huge project"), "10h in 1.5 days at 3h/day doesn't fit");
  assert.ok(sch.days[0].capacity < 3, "today only counts the hours left");
});
test("prioritise: overdue first, then the soonest deadline, with a reason for each", () => {
  const r = E.prioritise([task({ title: "Later", due_date: "2026-11-10" }), task({ title: "Late", due_date: "2026-10-29" }), task({ title: "Soon", due_date: "2026-10-31", priority: "high" }), task({ title: "No date" })], S, now, tz);
  assert.deepEqual(r.map(x => x.t.title), ["Late", "Soon", "Later", "No date"]);
  assert.match(r[0].reason, /overdue since yesterday/); assert.match(r[1].reason, /due tomorrow.*high priority/);
});
test("day plan: tomorrow from saved tasks only: overdue first, due soon next, nothing invented, deadlines unchanged", () => {
  const tasks = [task({ title: "Overdue lab", due_date: "2026-10-29", estimate_hours: 2 }), task({ title: "Quiz", due_date: "2026-11-01", due_time: "09:30" }), task({ title: "Far away", due_date: "2026-12-20" }), task({ title: "Already tomorrow", plan_date: "2026-10-31" })];
  const r = E.dayPlan(tasks, S, now, tz, "2026-10-31");
  assert.match(r.reply, /plan for tomorrow/); assert.match(r.reply, /Already planned: Already tomorrow/);
  assert.deepEqual(r.actions.map(a => a.title), ["Overdue lab", "Quiz"]);
  assert.ok(r.actions.every(a => a.type === "plan" && a.date === "2026-10-31"));
  assert.match(r.actions[0].why, /overdue/);
  const empty = E.dayPlan([], S, now, tz, "2026-10-31"); assert.equal(empty.actions.length, 0); assert.match(empty.reply, /Nothing is due or planned for tomorrow/);
});
test("organise: order of urgency, overloaded days, missing estimates", () => {
  const r = E.organise([task({ title: "A", due_date: "2026-10-31", estimate_hours: 6 }), task({ title: "B", due_date: "2026-11-05" }), task({ title: "C", due_date: "2026-10-29" })], S, now, tz);
  assert.match(r.reply, /1\. C \(overdue/); assert.match(r.reply, /won't fit/); assert.match(r.reply, /Add a time estimate to .*B/);
});
test("breakdown: splits remaining work into sessions before the deadline, and asks instead of guessing an estimate", () => {
  const r = E.breakdown(task({ title: "Report", due_date: "2026-11-05", estimate_hours: 6, progress: 25 }), S, now, tz);
  const steps = r.actions[0].steps; assert.equal(steps.length, 3);
  assert.ok(steps.every(s => s.date >= today && s.date < "2026-11-05"));
  assert.equal(Math.round(steps.reduce((s, x) => s + x.hours, 0) * 4) / 4, 4.5, "6h minus 25% progress");
  const q = E.breakdown(task({ title: "Mystery" }), S, now, tz); assert.equal(q.actions.length, 0); assert.match(q.reply, /How many hours/);
});
test("workload: available hours and overloaded days", () => {
  const w = E.workload([task({ title: "X", plan_date: "2026-11-01", estimate_hours: 5 })], S, now, tz, 7);
  assert.ok(w.overloadedDays.includes("2026-11-01")); assert.ok(w.availableHours > 15);
});
test("reader: English, lists, Hinglish, spelling, deadlines vs to-dos, and no invented dates", () => {
  const ex = s => P.extract(s, { today, now, tz }).map(a => [a.title, a.date, a.isDeadline ? "deadline" : "todo"].join("|"));
  assert.deepEqual(ex("I have a Java assignment tomorrow and a Maths test on Friday."), ["Java assignment|2026-10-31|deadline", "Maths test|2026-11-06|deadline"]);
  assert.deepEqual(ex("Tomorrow I have to complete my Java assignment, attend college and practice DSA for two hours"), ["Complete Java assignment|2026-10-31|deadline", "Attend college|2026-10-31|todo", "Practice DSA|2026-10-31|todo"]);
  assert.deepEqual(ex("kal Java assignment submit karna hai aur DSA practice 2 ghante"), ["Java assignment submit|2026-10-31|deadline", "DSA practice|2026-10-31|todo"]);
  assert.deepEqual(ex("call priya tommorow 6pm"), ["Call priya|2026-10-31|todo"]);
  assert.deepEqual(ex("buy notes"), ["Buy notes||todo"], "no day given, no day invented");
  assert.deepEqual(ex("a project to complete by Sunday"), ["Complete project|2026-11-01|deadline"]);
  assert.equal(P.extract("Practice DSA for two hours tomorrow", { today, now, tz })[0].estimate, 2);
});
