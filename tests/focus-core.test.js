// Deep Focus timing core (src/focus-core.js): the same code runs on the server and in the page.
// Time is always worked out from stored timestamps, never by counting timer ticks.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const F = require("../src/focus-core");

const T0 = Date.UTC(2026, 9, 30, 6, 30);   // 30 Oct 2026 12:00 IST
const MIN = 60000;
const mk = (o = {}) => F.create(Object.assign({ id: "s1", minutes: 45, mode: "strict", title: "Assignment operators practical", subject: "Java Programming", topic: "Assignment operators", now: T0 }, o));

test("a new session is ACTIVE, with the planned length and nothing focused yet", () => {
  const s = mk();
  assert.equal(s.status, F.ACTIVE); assert.equal(s.plannedMs, 45 * MIN); assert.equal(s.startedAt, T0);
  assert.equal(F.focusedMs(s, T0), 0); assert.equal(F.remainingMs(s, T0), 45 * MIN);
  assert.equal(F.focusedMs(s, T0 + 10 * MIN), 10 * MIN); assert.equal(F.remainingMs(s, T0 + 10 * MIN), 35 * MIN);
  assert.deepEqual(F.STATES, ["NOT_STARTED", "ACTIVE", "PAUSED", "INTERRUPTED", "COMPLETED", "ENDED_EARLY"]);
  assert.throws(() => mk({ minutes: 0 }), /minutes/); assert.throws(() => mk({ minutes: 600 }), /minutes/); assert.throws(() => mk({ mode: "lazy" }), /mode/);
});

test("pausing stops the focused time; the paused minutes are break time, not study time; resume continues from what was left", () => {
  let s = mk();
  s = F.apply(s, "pause", { now: T0 + 10 * MIN });
  assert.equal(s.status, F.PAUSED);
  assert.equal(F.focusedMs(s, T0 + 25 * MIN), 10 * MIN, "nothing counts while paused");
  s = F.apply(s, "resume", { now: T0 + 15 * MIN });
  assert.equal(s.status, F.ACTIVE);
  assert.equal(F.focusedMs(s, T0 + 20 * MIN), 15 * MIN); assert.equal(F.remainingMs(s, T0 + 20 * MIN), 30 * MIN);
  const r = F.report(s, T0 + 20 * MIN);
  assert.equal(r.breakMs, 5 * MIN); assert.equal(r.awayMs, 0); assert.equal(r.interruptions, 0);
  assert.equal(F.endsAt(s, T0 + 20 * MIN), T0 + 50 * MIN, "planned finish moves by the pause");
});

test("an interruption (tab, fullscreen, window, closed) pauses and is recorded with its time; time away isn't study time", () => {
  let s = mk();
  s = F.apply(s, "interrupt", { now: T0 + 5 * MIN, kind: "tab" });
  assert.equal(s.status, F.INTERRUPTED);
  // a second signal while already away (fullscreen exit right after hiding) doesn't add another interruption
  s = F.apply(s, "interrupt", { now: T0 + 5 * MIN + 200, kind: "fullscreen" });
  s = F.apply(s, "resume", { now: T0 + 8 * MIN });
  s = F.apply(s, "interrupt", { now: T0 + 10 * MIN, kind: "fullscreen" });
  s = F.apply(s, "resume", { now: T0 + 11 * MIN });
  const r = F.report(s, T0 + 12 * MIN);
  assert.equal(r.interruptions, 2); assert.equal(r.awayMs, 4 * MIN); assert.equal(r.breakMs, 0);
  assert.equal(r.lastInterruption.kind, "fullscreen"); assert.equal(r.lastInterruption.at, T0 + 10 * MIN);
  assert.equal(F.focusedMs(s, T0 + 12 * MIN), 8 * MIN);
  assert.throws(() => F.apply(mk(), "interrupt", { now: T0, kind: "nap" }), /kind/);
  // an interruption during a manual pause is ignored (they had already stopped)
  let p = F.apply(mk(), "pause", { now: T0 + MIN }); p = F.apply(p, "interrupt", { now: T0 + 2 * MIN, kind: "tab" });
  assert.equal(p.status, F.PAUSED); assert.equal(F.report(p, T0 + 3 * MIN).interruptions, 0);
});

test("completing: only when the planned time is really focused; it finishes at the exact moment the timer reached zero", () => {
  let s = mk({ minutes: 25 });
  assert.throws(() => F.apply(s, "complete", { now: T0 + 10 * MIN }), /not finished/);
  s = F.apply(s, "complete", { now: T0 + 40 * MIN });   // reported late (tab was asleep): ends at 25 min, not 40
  assert.equal(s.status, F.COMPLETED); assert.equal(s.endedAt, T0 + 25 * MIN); assert.equal(F.focusedMs(s, T0 + 99 * MIN), 25 * MIN);
  // finished sessions never start again
  for (const a of ["resume", "pause", "interrupt", "complete", "end"]) assert.throws(() => F.apply(s, a, { now: T0 + 50 * MIN, kind: "tab" }), /finished/);
});

test("ending early keeps the focused part and closes an open pause", () => {
  let s = mk();
  s = F.apply(s, "interrupt", { now: T0 + 12 * MIN, kind: "tab" });
  s = F.apply(s, "end", { now: T0 + 20 * MIN });
  assert.equal(s.status, F.ENDED_EARLY); assert.equal(s.endedAt, T0 + 20 * MIN);
  const r = F.report(s, T0 + 99 * MIN);
  assert.equal(r.focusedMs, 12 * MIN); assert.equal(r.awayMs, 8 * MIN); assert.equal(r.completed, false);
});

test("settle: a session whose time ran out while nobody looked is completed at the right moment", () => {
  let s = mk({ minutes: 25 }); s.lastSeen = T0 + 24 * MIN + 40000;   // the page was alive until just before the end
  s = F.settle(s, T0 + 30 * MIN);
  assert.equal(s.status, F.COMPLETED); assert.equal(s.endedAt, T0 + 25 * MIN);
});

test("settle: a closed or crashed browser stops the clock at the last sign of life (heartbeat), as an interruption", () => {
  let s = mk(); s.lastSeen = T0 + 7 * MIN;
  s = F.settle(s, T0 + 20 * MIN);
  assert.equal(s.status, F.INTERRUPTED);
  assert.equal(F.focusedMs(s, T0 + 20 * MIN), 7 * MIN, "time after the browser went quiet isn't counted");
  const r = F.report(s, T0 + 20 * MIN); assert.equal(r.interruptions, 1); assert.equal(r.lastInterruption.kind, "closed"); assert.equal(r.lastInterruption.at, T0 + 7 * MIN);
  // a quick refresh (seen a few seconds ago) keeps running
  let q = mk(); q.lastSeen = T0 + 9 * MIN + 50000; q = F.settle(q, T0 + 10 * MIN);
  assert.equal(q.status, F.ACTIVE);
});

test("settle: a session left open for more than 12 hours is closed as ended early (expired)", () => {
  let s = mk(); s = F.apply(s, "pause", { now: T0 + 5 * MIN });
  s = F.settle(s, T0 + 13 * 60 * MIN);
  assert.equal(s.status, F.ENDED_EARLY); assert.equal(s.endReason, "expired"); assert.equal(F.focusedMs(s, T0 + 14 * 60 * MIN), 5 * MIN);
  assert.equal(s.endedAt, T0 + 5 * MIN, "ends when it was last used, not 12 hours later");
});

test("client times are trusted only within limits (never before the last change, never in the future, never long ago)", () => {
  let s = mk();
  const at = F.clampTime(s, T0 + 10 * MIN, T0 + 30 * MIN);   // 20 min old: too old, use now
  assert.equal(at, T0 + 30 * MIN);
  assert.equal(F.clampTime(s, T0 + 29 * MIN, T0 + 30 * MIN), T0 + 29 * MIN);
  assert.equal(F.clampTime(s, T0 + 40 * MIN, T0 + 30 * MIN), T0 + 30 * MIN);
  s = F.apply(s, "pause", { now: T0 + 5 * MIN });
  assert.equal(F.clampTime(s, T0 + 4 * MIN, T0 + 5 * MIN + 30000), T0 + 5 * MIN, "not before the last change");
});

test("statistics: totals, today, the last 7 days, subjects, planned vs actual, interruptions and the study streak (in the person's time zone)", () => {
  const tz = "Asia/Kolkata"; const DAY = 24 * 60 * MIN;
  const done = (id, startOffDays, mins, subject, extra = {}) => { let s = F.create({ id, minutes: mins, mode: "normal", title: "t" + id, subject, now: T0 - startOffDays * DAY }); if (extra.away) { s = F.apply(s, "interrupt", { now: s.startedAt + 2 * MIN, kind: "tab" }); s = F.apply(s, "resume", { now: s.startedAt + 2 * MIN + extra.away }); } return F.apply(s, "complete", { now: s.startedAt + 3 * 60 * MIN }); };
  const sessions = [
    done("a", 0, 45, "Java Programming", { away: 3 * MIN }), done("b", 0, 25, "Chemistry"),
    done("c", 1, 60, "Java Programming"), done("d", 2, 30, "Chemistry"),
    F.apply(F.apply(F.create({ id: "e", minutes: 50, mode: "strict", title: "te", subject: "Chemistry", now: T0 - 4 * DAY }), "interrupt", { now: T0 - 4 * DAY + 20 * MIN, kind: "tab" }), "end", { now: T0 - 4 * DAY + 30 * MIN }),
    done("old", 30, 90, "Biology"),
  ];
  const st = F.stats(sessions, { now: T0 + MIN, tz, days: 7 });
  assert.equal(st.today.focusedMin, 70); assert.equal(st.today.sessions, 2);
  assert.equal(st.week.focusedMin, 45 + 25 + 60 + 30 + 20); assert.equal(st.week.completed, 4); assert.equal(st.week.endedEarly, 1);
  assert.equal(st.week.interruptions, 2); assert.equal(st.week.awayMin, 3 + 10);
  assert.equal(st.week.plannedMin, 45 + 25 + 60 + 30 + 50); assert.equal(st.week.pctOfPlan, Math.round(180 / 210 * 100));
  assert.equal(st.days.length, 7); assert.equal(st.days[6].date, "2026-10-30"); assert.equal(st.days[6].focusedMin, 70); assert.equal(st.days[5].focusedMin, 60); assert.equal(st.days[3].focusedMin, 0);
  assert.deepEqual(st.subjects.map(x => [x.subject, x.focusedMin, x.sessions]), [["Java Programming", 105, 2], ["Chemistry", 75, 3]]);
  assert.equal(st.streak, 3, "today, yesterday and the day before"); assert.equal(st.activeDays, 4);
  assert.equal(st.total.focusedMin, 180 + 90); assert.equal(st.total.completed, 5);
  // nothing yet: zeros, never made-up numbers
  const e = F.stats([], { now: T0, tz, days: 7 });
  assert.equal(e.total.focusedMin, 0); assert.equal(e.week.pctOfPlan, null); assert.equal(e.streak, 0); assert.deepEqual(e.subjects, []);
});
