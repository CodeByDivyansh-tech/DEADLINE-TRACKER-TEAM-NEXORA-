// Engine specs: parser, Deadline Radar, planner, backward planning, reminders, conflicts.
// These run the real app code in the browser through the ?dt-test seam, with the clock fixed at Fri 30 Oct 2026 12:00 IST.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { setup, newPage } = require("./helpers");

let env, page;
before(async () => { env = await setup(); page = await newPage(env); });
after(async () => { await env.close(); });

// Runs fn(T, w, now, helpers) inside the page with a fresh workspace of the given mode.
function run(mode, fn, arg) {
  return page.evaluate(([mode, src, arg]) => {
    const T = window.__DT_TEST__;
    T.state = { v: 2, user: { name: "Tester" }, active: null, workspaces: [], read: {} };
    const w = T.newWorkspace(mode, "Test", mode === "company", mode === "student" ? ["DBMS", "Maths"] : []);
    T.state.workspaces.push(w); T.state.active = w.id;
    const now = Date.now();
    const at = (days, h, m) => { const d = new Date(now); d.setDate(d.getDate() + days); d.setHours(h, m, 0, 0); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
    const add = o => { const it = T.mkItem(w, o); w.items.push(it); return it; };
    return (new Function("T", "w", "now", "at", "add", "arg", src))(T, w, now, at, add, arg);
  }, [mode, `return (${fn.toString()})(T, w, now, at, add, arg);`, arg]);
}
const parse = (text, mode = "student") => run(mode, (T, w, now, at, add, text) => {
  const r = T.parseQuick(text, w, now);
  const g = w.groups.find(x => x.id === r.groupId);
  return { ...r, groupName: g ? g.name : null };
}, text);

/* ---------- Smart Inbox parser ---------- */
test("parser: reads the example from the brief", async () => {
  const r = await parse("Submit DBMS assignment next Friday at 5 PM ~4h");
  assert.equal(r.title, "Submit DBMS assignment");
  assert.equal(r.date, "2026-11-06");
  assert.equal(r.time, "17:00");
  assert.equal(r.estimate, 4);
  assert.equal(r.type, "assignment");
  assert.equal(r.groupName, "DBMS");
});
test("parser: never invents a date when there isn't one", async () => {
  const r = await parse("Read chapter 5");
  assert.equal(r.date, null);
  assert.equal(r.title, "Read chapter 5");
});
test("parser: tomorrow with a time", async () => {
  const r = await parse("Physics lab report tomorrow 11:59pm");
  assert.equal(r.date, "2026-10-31"); assert.equal(r.time, "23:59");
  assert.equal(r.title, "Physics lab report");
});
test("parser: relative days, exam type, default time and suggested priority", async () => {
  const r = await parse("Quiz in 3 days");
  assert.equal(r.date, "2026-11-02"); assert.equal(r.type, "exam");
  assert.equal(r.time, "09:00"); assert.equal(r.timeDefault, true);
  assert.equal(r.priority, "high"); assert.equal(r.prioritySuggested, true);
});
test("parser: #subject, day-month date and am time", async () => {
  const r = await parse("Maths midterm #maths 20 Nov 10am");
  assert.equal(r.groupName, "Maths"); assert.equal(r.date, "2026-11-20"); assert.equal(r.time, "10:00");
  assert.equal(r.title, "Maths midterm");
});
test("parser: dd/mm for Indian locale", async () => {
  const r = await parse("Pay fee 20/11");
  assert.equal(r.date, "2026-11-20");
});
test("parser: a date already past this year rolls to next year", async () => {
  const r = await parse("Renew passport 5 Jan");
  assert.equal(r.date, "2027-01-05");
});
test("parser: weekday words (today is Friday 30 Oct)", async () => {
  assert.equal((await parse("Monday standup")).date, "2026-11-02");
  assert.equal((await parse("Report this Friday")).date, "2026-10-30");
  assert.equal((await parse("Report next Monday")).date, "2026-11-02");
  assert.equal((await parse("Report Friday")).date, "2026-11-06");
});
test("parser: repeat and explicit priority", async () => {
  const r = await parse("Team sync every week !high");
  assert.equal(r.repeat, "weekly"); assert.equal(r.priority, "high"); assert.equal(r.prioritySuggested, false);
  assert.equal(r.title, "Team sync");
});
test("parser: @person in a company workspace", async () => {
  const r = await parse("Fix login bug today @rahul ~2h", "company");
  assert.equal(r.assignee, "r"); assert.equal(r.date, "2026-10-30"); assert.equal(r.estimate, 2);
});
test("parser: an impossible date is not accepted", async () => {
  const r = await parse("Submit form 31/02");
  assert.equal(r.date, null);
});
test("parser: a time alone does not create a date", async () => {
  const r = await parse("Call bank 9am");
  assert.equal(r.date, null); assert.equal(r.time, "09:00"); assert.equal(r.title, "Call bank");
});
test("parser: ordinal dates are not mistaken for hours", async () => {
  const r = await parse("Essay due 4th Nov");
  assert.equal(r.date, "2026-11-04"); assert.equal(r.estimate, null);
});
test("paste extraction: only sentences with clear dates get one", async () => {
  const rows = await run("student", (T, w, now) => T.extractFromText("Lab report due Monday 11:59 pm.\nPlease read the handout.\nProject proposal by 20 Nov.", w, now).map(x => x.p.date));
  assert.deepEqual(rows, ["2026-11-02", null, "2026-11-20"]);
});

/* ---------- Deadline Radar ---------- */
test("radar: overdue item is Overdue and explains when it was due", async () => {
  const r = await run("student", (T, w, now, at, add) => { const it = add({ title: "Late", due: at(-1, 23, 59), estimate: 2 }); return T.radar(w, now)[it.id]; });
  assert.equal(r.level, "overdue");
  assert.match(r.reasons[0], /due/i);
});
test("radar: unfinished dependency close to the deadline is Critical, and says why", async () => {
  const r = await run("student", (T, w, now, at, add) => {
    const dep = add({ title: "Design", due: at(3, 18, 0) });
    const it = add({ title: "Build", due: at(1, 18, 0), estimate: 1, dependsOn: [dep.id] });
    return T.radar(w, now)[it.id];
  });
  assert.equal(r.level, "critical");
  assert.match(r.reasons[0], /depends on "Design"/);
});
test("radar: more work than available time is Critical with numbers in the reason", async () => {
  const r = await run("student", (T, w, now, at, add) => { const it = add({ title: "Big", due: at(1, 18, 0), estimate: 10 }); return T.radar(w, now)[it.id]; });
  assert.equal(r.level, "critical");
  assert.ok(r.reasons.some(x => /study time/.test(x) && /10h/.test(r.reasons.join(" "))), r.reasons.join(" | "));
});
test("radar: small task far away is On track", async () => {
  const r = await run("student", (T, w, now, at, add) => { const it = add({ title: "Small", due: at(10, 18, 0), estimate: 1 }); return T.radar(w, now)[it.id]; });
  assert.equal(r.level, "ontrack");
});
test("radar: completed items are not scored", async () => {
  const r = await run("student", (T, w, now, at, add) => { const it = add({ title: "Done", due: at(-1, 10, 0), status: "done", doneAt: new Date(now).toISOString() }); return [T.radar(w, now)[it.id] || null, T.levelOf(T.radar(w, now), it)]; });
  assert.equal(r[0], null); assert.equal(r[1], "done");
});
test("radar: Blocked status is at least At risk", async () => {
  const r = await run("student", (T, w, now, at, add) => { const it = add({ title: "Blocked", due: at(12, 18, 0), estimate: 1, status: "blocked" }); return T.radar(w, now)[it.id].level; });
  assert.ok(["risk", "critical"].includes(r), r);
});
test("radar: thresholds are adjustable", async () => {
  const r = await run("student", (T, w, now, at, add) => {
    const it = add({ title: "Big", due: at(1, 18, 0), estimate: 10, progress: 10 });
    w.settings.thresholds = { critical: 1000, risk: 1000, attention: 1000 };
    return T.radar(w, now)[it.id].level;
  });
  assert.equal(r, "ontrack");
});
test("radar: earlier deadlines use up time for later ones", async () => {
  const r = await run("student", (T, w, now, at, add) => {
    const later = add({ title: "Later", due: at(3, 18, 0), estimate: 4 });
    const alone = T.radar(w, now)[later.id].level;
    add({ title: "Earlier", due: at(2, 18, 0), estimate: 6 });
    return [alone, T.radar(w, now)[later.id].level];
  });
  const order = ["ontrack", "attention", "risk", "critical", "overdue"];
  assert.ok(order.indexOf(r[1]) > order.indexOf(r[0]), `alone=${r[0]} withEarlier=${r[1]}`);
});

/* ---------- Planner ---------- */
test("planner: never plans more than the daily capacity", async () => {
  const days = await run("student", (T, w, now, at, add) => {
    add({ title: "A", due: at(2, 18, 0), estimate: 6 }); add({ title: "B", due: at(4, 18, 0), estimate: 8 }); add({ title: "C", due: at(6, 18, 0), estimate: 5 });
    return T.planFor(w, now, "me", 14).days.map(d => [d.total, d.cap]);
  });
  days.forEach(([t, c], k) => assert.ok(t <= c + 1e-9, `day ${k}: ${t} > ${c}`));
});
test("planner: never schedules work after the deadline day", async () => {
  const bad = await run("student", (T, w, now, at, add) => {
    const a = add({ title: "A", due: at(2, 18, 0), estimate: 20 });
    const P = T.planFor(w, now, "me", 14);
    return P.days.filter(d => d.sessions.some(s => s.id === a.id) && d.date > new Date(a.due)).length;
  });
  assert.equal(bad, 0);
});
test("planner: reports a shortfall when work doesn't fit", async () => {
  const short = await run("student", (T, w, now, at, add) => { const a = add({ title: "A", due: at(1, 18, 0), estimate: 20 }); return T.planFor(w, now, "me", 14).short[a.id]; });
  assert.ok(short > 10, String(short));
});
test("planner: lists active items without an estimate", async () => {
  const n = await run("student", (T, w, now, at, add) => { add({ title: "No estimate", due: at(3, 18, 0) }); return T.planFor(w, now, "me", 14).noEst.map(i => i.title); });
  assert.deepEqual(n, ["No estimate"]);
});

/* ---------- Backward planning ---------- */
test("backward plan: steps fall between today and the deadline, hours add up, deadline untouched", async () => {
  const r = await run("student", (T, w, now, at, add) => {
    const it = add({ title: "Java project", type: "project", due: at(20, 23, 59), estimate: 10 });
    const before = it.due; const steps = T.backwardPlan(it, now);
    return { steps, due: it.due, before, today: new Date(now).toISOString().slice(0, 10) };
  });
  assert.equal(r.due, r.before);
  assert.equal(r.steps.length, 5);
  const dueDay = r.due.slice(0, 10);
  r.steps.forEach(s => { assert.ok(s.date >= "2026-10-30" && s.date <= dueDay, s.date); });
  for (let k = 1; k < r.steps.length; k++) assert.ok(r.steps[k].date >= r.steps[k - 1].date, "dates go forward");
  const sum = r.steps.reduce((a, s) => a + s.hours, 0);
  assert.ok(Math.abs(sum - 10) <= 1, `sum ${sum}`);
});
test("backward plan: no estimate means no suggestion", async () => {
  const n = await run("student", (T, w, now, at, add) => T.backwardPlan(add({ title: "X", due: at(5, 18, 0) }), now).length);
  assert.equal(n, 0);
});
test("rescue steps: overdue work gets steps spread over the coming days, not all today", async () => {
  const dates = await run("student", (T, w, now, at, add) => T.chunkPlan(add({ title: "Late", due: at(-1, 23, 59), estimate: 4 }), now).map(s => s.date));
  assert.ok(new Set(dates).size >= 2, dates.join(","));
  dates.forEach(d => assert.ok(d >= "2026-10-30", d));
});

/* ---------- Reminders & conflicts ---------- */
test("reminders: completed deadlines never get reminders", async () => {
  const keys = await run("student", (T, w, now, at, add) => {
    const it = add({ title: "Finished", due: at(0, 18, 0), status: "done", doneAt: new Date(now).toISOString() });
    return T.notifs(w, now, T.radar(w, now)).filter(n => n.id === it.id).length;
  });
  assert.equal(keys, 0);
});
test("reminders: overdue alerts follow the setting", async () => {
  const r = await run("student", (T, w, now, at, add) => {
    const it = add({ title: "Late", due: at(-1, 10, 0) });
    const on = T.notifs(w, now, T.radar(w, now)).some(n => n.key === it.id + ":od");
    w.settings.overdueAlerts = false;
    const off = T.notifs(w, now, T.radar(w, now)).some(n => n.key === it.id + ":od");
    return [on, off];
  });
  assert.deepEqual(r, [true, false]);
});
test("reminders: the 1-day reminder fires for something due in 20 hours", async () => {
  const has = await run("student", (T, w, now, at, add) => {
    const it = add({ title: "Soon", due: at(1, 8, 0) });
    return T.notifs(w, now, T.radar(w, now)).some(n => n.key === it.id + ":1440");
  });
  assert.equal(has, true);
});
test("reminders: daily summary can be turned off", async () => {
  const r = await run("student", (T, w, now) => { const a = T.notifs(w, now, T.radar(w, now)).some(n => n.key.startsWith("sum:")); w.settings.dailySummary = false; const b = T.notifs(w, now, T.radar(w, now)).some(n => n.key.startsWith("sum:")); return [a, b]; });
  assert.deepEqual(r, [true, false]);
});
test("conflicts: two assignments and an exam within 24 hours are flagged", async () => {
  const c = await run("student", (T, w, now, at, add) => {
    add({ title: "Essay", type: "assignment", due: at(1, 23, 59) });
    add({ title: "Quiz", type: "exam", due: at(2, 9, 30) });
    add({ title: "Lab", type: "assignment", due: at(2, 17, 0) });
    return T.conflicts(w, now).filter(x => x.kind === "clash").map(x => x.text);
  });
  assert.equal(c.length, 1);
  assert.match(c[0], /2 assignments and 1 exam/);
});
