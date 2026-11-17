// Deep Focus timing core. Pure functions with no packages, used both by the page (build.js puts this file into the
// app) and by the server (lib/modules/focus.js requires it from src/), so the two always agree. It lives in src/
// because Vercel builds the page from src/ and never receives the server folder lib/.
//
// Time is never counted by timer ticks. A session stores timestamps:
//   focusedMs    study time already banked from earlier active stretches
//   activeSince  when the current active stretch began (null while paused, away or finished)
//   breaks       [{ kind, from, to }]: kind "manual" = the person pressed Pause (break time);
//                any other kind = an interruption (tab, fullscreen, window, reload, closed) = time away
//   lastSeen     the last sign of life from the page (heartbeat or any change)
// Focused time = focusedMs + (now - activeSince) while ACTIVE, never more than the planned length.
//
// States: NOT_STARTED (the setup screen, before anything is saved) -> ACTIVE <-> PAUSED / INTERRUPTED
//         -> COMPLETED (the planned time was really focused) or ENDED_EARLY. Finished sessions never change again.
var FocusCore = (function(){
  var MIN = 60000, DAY = 24 * 60 * MIN;
  var NOT_STARTED = "NOT_STARTED", ACTIVE = "ACTIVE", PAUSED = "PAUSED", INTERRUPTED = "INTERRUPTED", COMPLETED = "COMPLETED", ENDED_EARLY = "ENDED_EARLY";
  var STATES = [NOT_STARTED, ACTIVE, PAUSED, INTERRUPTED, COMPLETED, ENDED_EARLY];
  var MODES = ["normal", "strict"];
  var KINDS = ["tab", "fullscreen", "window", "reload", "closed"];
  var GRACE_MS = 45000;            // a page quiet for longer than this (no heartbeat) is treated as closed
  var IDLE_LIMIT_MS = 12 * 60 * MIN; // an open session unused for 12 hours is closed as ended early
  var CLIENT_SKEW_MS = 2 * MIN;    // how old a time reported by the page may be (sent late after a short drop)
  var MIN_MINUTES = 1, MAX_MINUTES = 240;

  function fail(code, msg){ var e = new Error(msg); e.code = code; return e; }
  var isOpen = function(s){ return s.status === ACTIVE || s.status === PAUSED || s.status === INTERRUPTED; };
  var isFinished = function(s){ return s.status === COMPLETED || s.status === ENDED_EARLY; };
  var clone = function(s){ var c = {}; for (var k in s) c[k] = s[k]; c.breaks = (s.breaks || []).map(function(b){ return { kind: b.kind, from: b.from, to: b.to }; }); return c; };
  var str = function(v, max){ return typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : ""; };

  function create(o){
    var minutes = Number(o.minutes);
    if (!(minutes >= MIN_MINUTES && minutes <= MAX_MINUTES) || Math.round(minutes) !== minutes) throw fail("bad_minutes", "minutes must be a whole number from " + MIN_MINUTES + " to " + MAX_MINUTES + ".");
    if (MODES.indexOf(o.mode) < 0) throw fail("bad_mode", "mode must be normal or strict.");
    var title = str(o.title, 200); if (!title) throw fail("bad_title", "Say what you will work on.");
    var now = o.now;
    return { id: o.id, status: ACTIVE, mode: o.mode, title: title, subject: str(o.subject, 80), topic: str(o.topic, 160), taskId: o.taskId || null,
      plannedMs: minutes * MIN, focusedMs: 0, activeSince: now, startedAt: now, endedAt: null, endReason: null, lastSeen: now, updatedAt: now, breaks: [] };
  }
  function focusedMs(s, now){
    var f = s.focusedMs + (s.status === ACTIVE && s.activeSince != null ? Math.max(0, now - s.activeSince) : 0);
    return Math.min(s.plannedMs, f);
  }
  function remainingMs(s, now){ return Math.max(0, s.plannedMs - focusedMs(s, now)); }
  // the moment the countdown reaches zero if nothing else happens (only while ACTIVE)
  function zeroAt(s){ return s.activeSince + (s.plannedMs - s.focusedMs); }
  function endsAt(s, now){ return s.status === ACTIVE ? zeroAt(s) : now + remainingMs(s, now); }
  function lastChange(s){
    var t = Math.max(s.startedAt, s.activeSince || 0);
    for (var i = 0; i < s.breaks.length; i++) t = Math.max(t, s.breaks[i].from, s.breaks[i].to || 0);
    return t;
  }
  // A time reported by the page is used only if it is after the last change, not in the future and not too old.
  function clampTime(s, at, now){
    if (typeof at !== "number" || !isFinite(at) || at > now || now - at > CLIENT_SKEW_MS) return now;
    return Math.max(at, lastChange(s));
  }
  function fold(s, at){ s.focusedMs = Math.min(s.plannedMs, s.focusedMs + Math.max(0, at - s.activeSince)); s.activeSince = null; }
  function closeBreak(s, at){ var b = s.breaks[s.breaks.length - 1]; if (b && b.to == null) b.to = Math.max(b.from, at); }
  function finish(s, status, at, reason){
    if (s.status === ACTIVE) fold(s, at);
    closeBreak(s, at);
    s.status = status; s.endedAt = at; s.endReason = reason; s.activeSince = null;
    if (status === COMPLETED) s.focusedMs = s.plannedMs;
    return s;
  }

  // Applies one action and returns the new session (the old one is not changed).
  // Actions: beat, pause, interrupt (with kind), resume, complete, end. Repeating an action is harmless.
  function apply(s0, action, o){
    var now = o.now; var s = clone(s0);
    if (isFinished(s)) throw fail("finished", "This session is finished.");
    if (action === "beat") { if (s.status === ACTIVE) s.lastSeen = Math.max(s.lastSeen, now); return s; }
    // the time ran out before this action: it is a completed session, whatever the action was
    if (s.status === ACTIVE && zeroAt(s) <= now && action !== "end") return touch(finish(s, COMPLETED, zeroAt(s), "completed"), now);
    if (action === "pause" || action === "interrupt") {
      var kind = action === "pause" ? "manual" : o.kind;
      if (action === "interrupt" && KINDS.indexOf(kind) < 0) throw fail("bad_kind", "kind must be one of: " + KINDS.join(", ") + ".");
      if (s.status !== ACTIVE) return s;                 // already stopped: nothing more to record
      fold(s, now); s.status = kind === "manual" ? PAUSED : INTERRUPTED; s.breaks.push({ kind: kind, from: now, to: null });
      if (s.breaks.length > 300) s.breaks.splice(0, s.breaks.length - 300);
      return touch(s, now);
    }
    if (action === "resume") {
      if (s.status === ACTIVE) return s;
      closeBreak(s, now); s.status = ACTIVE; s.activeSince = now;
      return touch(s, now);
    }
    if (action === "complete") {
      if (focusedMs(s, now) < s.plannedMs - 1000) throw fail("not_finished", "The session is not finished yet.");
      return touch(finish(s, COMPLETED, s.status === ACTIVE ? Math.min(now, zeroAt(s)) : lastChange(s), "completed"), now);
    }
    if (action === "end") {
      if (s.status === ACTIVE && zeroAt(s) <= now) return touch(finish(s, COMPLETED, zeroAt(s), "completed"), now);
      return touch(finish(s, ENDED_EARLY, now, "early"), now);
    }
    throw fail("bad_action", "Unknown action.");
  }
  function touch(s, now){ s.lastSeen = Math.max(s.lastSeen || 0, now); s.updatedAt = now; return s; }

  // Brings a stored session up to date when it is read: time that ran out while nobody looked completes it;
  // a page that went quiet (closed, crashed, lost power) stops the clock at its last heartbeat as an interruption;
  // a session unused for 12 hours is closed.
  function settle(s0, now){
    var s = clone(s0);
    if (!isOpen(s)) return s;
    if (s.status === ACTIVE) {
      var quiet = s.lastSeen + GRACE_MS;
      if (zeroAt(s) <= Math.min(now, quiet)) return finish(s, COMPLETED, zeroAt(s), "completed");
      if (now > quiet) { fold(s, s.lastSeen); s.status = INTERRUPTED; s.breaks.push({ kind: "closed", from: s.lastSeen, to: null }); s.updatedAt = now; }
    }
    if (now - Math.max(s.lastSeen, lastChange(s)) > IDLE_LIMIT_MS) {
      var at = Math.max(s.lastSeen, lastChange(s));
      return finish(s, ENDED_EARLY, at, "expired");
    }
    return s;
  }

  // What the session report shows.
  function report(s, now){
    var end = isFinished(s) ? s.endedAt : now, breakMs = 0, awayMs = 0, n = 0, last = null;
    for (var i = 0; i < s.breaks.length; i++) {
      var b = s.breaks[i], len = Math.max(0, (b.to == null ? end : b.to) - b.from);
      if (b.kind === "manual") breakMs += len; else { awayMs += len; n++; last = { kind: b.kind, at: b.from, to: b.to }; }
    }
    return { status: s.status, plannedMs: s.plannedMs, focusedMs: focusedMs(s, now), remainingMs: remainingMs(s, now), breakMs: breakMs, awayMs: awayMs,
      interruptions: n, lastInterruption: last, completed: s.status === COMPLETED, startedAt: s.startedAt, endedAt: s.endedAt };
  }

  // "YYYY-MM-DD" in a time zone (works in Node and in browsers)
  var fmts = {};
  function localDate(ms, tz){
    var key = tz || "";
    if (!fmts[key]) { try { fmts[key] = new Intl.DateTimeFormat("en-CA", { timeZone: tz || undefined, year: "numeric", month: "2-digit", day: "2-digit" }); } catch (e) { fmts[key] = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }); } }
    var p = {}; fmts[key].formatToParts(new Date(ms)).forEach(function(x){ p[x.type] = x.value; });
    return p.year + "-" + p.month + "-" + p.day;
  }
  function addDays(date, n){ var a = date.split("-").map(Number); var t = new Date(Date.UTC(a[0], a[1] - 1, a[2] + n)); return t.toISOString().slice(0, 10); }
  var mins = function(ms){ return Math.round(ms / MIN); };

  // Statistics from real sessions only. days = how many days back the "week" view covers (today included).
  function stats(list, o){
    var now = o.now, tz = o.tz, days = o.days || 7, today = localDate(now, tz);
    var dates = []; for (var k = days - 1; k >= 0; k--) dates.push(addDays(today, -k));
    var first = dates[0];
    var byDay = {}; dates.forEach(function(d){ byDay[d] = { date: d, focusedMs: 0, plannedMs: 0, sessions: 0, completed: 0 }; });
    var allDays = {}, total = { focusedMs: 0, completed: 0, sessions: 0 };
    var week = { focusedMs: 0, plannedMs: 0, doneFocusedMs: 0, completed: 0, endedEarly: 0, interruptions: 0, awayMs: 0, breakMs: 0, sessions: 0 };
    var subj = {};
    list.forEach(function(s){
      var r = report(s, now), d = localDate(s.startedAt, tz);
      total.focusedMs += r.focusedMs; total.sessions++; if (r.completed) total.completed++;
      if (r.focusedMs >= MIN) allDays[d] = true;
      if (d < first || d > today) return;
      var day = byDay[d]; day.focusedMs += r.focusedMs; day.sessions++; if (r.completed) day.completed++;
      week.focusedMs += r.focusedMs; week.sessions++; week.interruptions += r.interruptions; week.awayMs += r.awayMs; week.breakMs += r.breakMs;
      if (isFinished(s)) { week.plannedMs += s.plannedMs; week.doneFocusedMs += r.focusedMs; day.plannedMs += s.plannedMs; }
      if (s.status === COMPLETED) week.completed++; else if (s.status === ENDED_EARLY) week.endedEarly++;
      var name = s.subject || "No subject"; var x = subj[name] || (subj[name] = { subject: name, focusedMs: 0, sessions: 0, completed: 0 });
      x.focusedMs += r.focusedMs; x.sessions++; if (r.completed) x.completed++;
    });
    // streak: days in a row with study time, up to today (or up to yesterday if nothing yet today)
    var streak = 0, d0 = allDays[today] ? today : addDays(today, -1);
    while (allDays[d0]) { streak++; d0 = addDays(d0, -1); }
    var dayList = dates.map(function(d){ var x = byDay[d]; return { date: d, focusedMin: mins(x.focusedMs), plannedMin: mins(x.plannedMs), sessions: x.sessions, completed: x.completed }; });
    var t = byDay[today];
    return {
      today: { date: today, focusedMin: mins(t.focusedMs), sessions: t.sessions, completed: t.completed },
      week: { days: days, focusedMin: mins(week.focusedMs), plannedMin: mins(week.plannedMs), pctOfPlan: week.plannedMs ? Math.round(week.doneFocusedMs / week.plannedMs * 100) : null,
        completed: week.completed, endedEarly: week.endedEarly, sessions: week.sessions, interruptions: week.interruptions, awayMin: mins(week.awayMs), breakMin: mins(week.breakMs) },
      days: dayList,
      subjects: Object.keys(subj).map(function(k){ var x = subj[k]; return { subject: x.subject, focusedMin: mins(x.focusedMs), sessions: x.sessions, completed: x.completed }; })
        .sort(function(a, b){ return b.focusedMin - a.focusedMin || a.subject.localeCompare(b.subject); }),
      streak: streak,
      activeDays: dayList.filter(function(x){ return x.focusedMin > 0; }).length,
      total: { focusedMin: mins(total.focusedMs), completed: total.completed, sessions: total.sessions }
    };
  }

  return { STATES: STATES, NOT_STARTED: NOT_STARTED, ACTIVE: ACTIVE, PAUSED: PAUSED, INTERRUPTED: INTERRUPTED, COMPLETED: COMPLETED, ENDED_EARLY: ENDED_EARLY,
    MODES: MODES, KINDS: KINDS, GRACE_MS: GRACE_MS, IDLE_LIMIT_MS: IDLE_LIMIT_MS, MIN_MINUTES: MIN_MINUTES, MAX_MINUTES: MAX_MINUTES,
    create: create, apply: apply, settle: settle, report: report, stats: stats, focusedMs: focusedMs, remainingMs: remainingMs, endsAt: endsAt,
    clampTime: clampTime, isOpen: isOpen, isFinished: isFinished, localDate: localDate };
})();
if (typeof module !== "undefined" && module.exports) module.exports = FocusCore;
