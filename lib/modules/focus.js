// Deep Focus sessions: the server keeps each person's sessions and is the judge of time.
// Every query is scoped with "user_id = ?" from the logged-in session; another person's session id answers 404.
// The timing rules live in src/focus-core.js (shared with the page). The server's own clock is used for every
// change; a time sent by the page is accepted only when it is recent (see FocusCore.clampTime).
const crypto = require("crypto");
const Core = require("../../src/focus-core");   // shared with the page
const clock = require("../clock");
const { V, ApiError } = require("../http");

const OPEN = "('ACTIVE', 'PAUSED', 'INTERRUPTED')";
const ACTIONS = ["pause", "interrupt", "resume", "complete", "end", "beat"];

function createFocus(db, { now = clock.now } = {}){
  const fromRow = r => ({ id: r.id, status: r.status, mode: r.mode, title: r.title, subject: r.subject, topic: r.topic, taskId: r.task_id,
    plannedMs: r.planned_ms, focusedMs: r.focused_ms, activeSince: r.active_since, startedAt: r.started_at, endedAt: r.ended_at,
    endReason: r.end_reason, lastSeen: r.last_seen, updatedAt: r.updated_at, breaks: JSON.parse(r.breaks || "[]"), ackedAt: r.acked_at });
  // what the page gets: the session plus its report worked out at this moment
  const view = (s, t) => Object.assign({}, s, { report: Core.report(s, t) });
  const save = (userId, s) => db.prepare(`UPDATE focus_sessions SET status = ?, focused_ms = ?, active_since = ?, ended_at = ?, end_reason = ?, last_seen = ?, breaks = ?, updated_at = ?
    WHERE id = ? AND user_id = ?`).run(s.status, s.focusedMs, s.activeSince, s.endedAt, s.endReason, s.lastSeen, JSON.stringify(s.breaks), s.updatedAt, s.id, userId);
  const changed = (a, b) => a.status !== b.status || a.focusedMs !== b.focusedMs || a.breaks.length !== b.breaks.length || a.endedAt !== b.endedAt;
  // brings a stored session up to date (time ran out, browser closed, left for 12 hours) and saves what changed
  function settled(userId, row, t){
    const s = fromRow(row); const s2 = Core.settle(s, t);
    if (changed(s, s2)) save(userId, s2);
    return s2;
  }
  function openOf(user, t){
    const r = db.prepare(`SELECT * FROM focus_sessions WHERE user_id = ? AND status IN ${OPEN}`).get(user.id);
    if (!r) return null;
    const s = settled(user.id, r, t);
    return Core.isOpen(s) ? s : null;
  }
  function own(user, id){
    const r = typeof id === "string" && id.length <= 64 ? db.prepare("SELECT * FROM focus_sessions WHERE id = ? AND user_id = ?").get(id, user.id) : null;
    if (!r) throw new ApiError(404, "not_found", "That focus session doesn't exist.");
    return r;
  }
  // The open session (if any) and the latest finished one whose report hasn't been seen yet.
  function current(user){
    const t = now(); const session = openOf(user, t);
    const r = db.prepare(`SELECT * FROM focus_sessions WHERE user_id = ? AND status IN ('COMPLETED', 'ENDED_EARLY') AND acked_at IS NULL
      AND (end_reason IS NULL OR end_reason <> 'expired') AND ended_at > ? ORDER BY ended_at DESC LIMIT 1`).get(user.id, t - 2 * 864e5);
    return { session: session ? view(session, t) : null, unseen: r ? view(fromRow(r), t) : null, serverNow: t };
  }
  function start(user, b){
    const t = now();
    const clientKey = V.str(b.clientKey, "clientKey", { max: 64 });
    if (clientKey) {
      const same = db.prepare("SELECT * FROM focus_sessions WHERE user_id = ? AND client_key = ?").get(user.id, clientKey);
      if (same) return { status: 200, body: { session: view(settled(user.id, same, t), t), duplicate: true, serverNow: t } };
    }
    const open = openOf(user, t);
    if (open) throw new ApiError(409, "session_open", "You already have a focus session open. Finish or end it first.", { session: view(open, t), serverNow: t });
    if (b.title != null && typeof b.title !== "string") throw new ApiError(400, "invalid_title", "title must be text.", { field: "title" });
    let taskId = V.str(b.taskId, "taskId", { max: 64 });
    // only the person's own task is linked; anything else is simply not linked
    if (taskId && !db.prepare("SELECT 1 FROM tasks WHERE id = ? AND user_id = ?").get(taskId, user.id)) taskId = null;
    let s;
    try { s = Core.create({ id: crypto.randomUUID(), minutes: b.minutes, mode: b.mode, title: b.title, subject: b.subject, topic: b.topic, taskId, now: t }); }
    catch (e) { const f = { bad_minutes: "minutes", bad_mode: "mode", bad_title: "title" }[e.code] || "body"; throw new ApiError(400, "invalid_" + f, e.message, { field: f }); }
    try {
      db.prepare(`INSERT INTO focus_sessions (id, user_id, client_key, task_id, mode, status, title, subject, topic, planned_ms, focused_ms, active_since, started_at,
        ended_at, end_reason, last_seen, breaks, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(s.id, user.id, clientKey, s.taskId, s.mode, s.status, s.title, s.subject, s.topic, s.plannedMs, s.focusedMs, s.activeSince, s.startedAt, null, null, s.lastSeen, "[]", t, t);
    } catch (e) {
      // two starts at the same moment: the database lets only one through
      if (!/UNIQUE/i.test(String(e.message))) throw e;
      const again = clientKey && db.prepare("SELECT * FROM focus_sessions WHERE user_id = ? AND client_key = ?").get(user.id, clientKey);
      if (again) return { status: 200, body: { session: view(settled(user.id, again, t), t), duplicate: true, serverNow: t } };
      const o = openOf(user, t);
      throw new ApiError(409, "session_open", "You already have a focus session open. Finish or end it first.", { session: o ? view(o, t) : null, serverNow: t });
    }
    return { status: 201, body: { session: view(s, t), serverNow: t } };
  }
  function act(user, id, action, b){
    const t = now(); const s = settled(user.id, own(user, id), t);
    // a heartbeat, or "complete" for a session the server already completed (the time ran out), is fine to repeat
    if (Core.isFinished(s) && (action === "beat" || (action === "complete" && s.status === Core.COMPLETED))) return { session: view(s, t), serverNow: t };
    const at = action === "beat" ? t : Core.clampTime(s, typeof b.at === "number" ? b.at : NaN, t);
    let s2;
    try { s2 = Core.apply(s, action, { now: at, kind: b.kind }); }
    catch (e) {
      if (e.code === "finished") throw new ApiError(409, "finished", "This session has finished and can't be changed.", { session: view(s, t), serverNow: t });
      if (e.code === "not_finished") throw new ApiError(409, "not_finished", "There is still time left in this session.", { session: view(s, t), serverNow: t });
      if (e.code === "bad_kind") throw new ApiError(400, "invalid_kind", e.message, { field: "kind" });
      throw e;
    }
    if (action === "beat") s2.lastSeen = t;
    save(user.id, s2);
    return { session: view(s2, t), serverNow: t };
  }
  // The finished report was shown. first: true only the first time (the page logs the minutes on the task then).
  function ack(user, id){
    const t = now(); const s = settled(user.id, own(user, id), t);
    if (!Core.isFinished(s)) throw new ApiError(409, "not_finished", "This session is still open.");
    const first = db.prepare("UPDATE focus_sessions SET acked_at = ? WHERE id = ? AND user_id = ? AND acked_at IS NULL").run(t, s.id, user.id).changes === 1;
    return { session: view(s, t), first, serverNow: t };
  }
  function all(user, t){
    return db.prepare("SELECT * FROM focus_sessions WHERE user_id = ? ORDER BY started_at").all(user.id).map(r => Core.isOpen({ status: r.status }) ? settled(user.id, r, t) : fromRow(r));
  }
  function history(user, q){
    const limit = V.num(q.limit, "limit", { min: 1, max: 100, int: true }) || 20; const t = now();
    const list = all(user, t).filter(Core.isFinished).sort((x, y) => y.startedAt - x.startedAt).slice(0, limit);
    return { sessions: list.map(s => view(s, t)), serverNow: t };
  }
  function stats(user, q){
    const days = V.num(q.days, "days", { min: 1, max: 90, int: true }) || 7; const t = now();
    return Object.assign(Core.stats(all(user, t), { now: t, tz: user.timezone || "UTC", days }), { serverNow: t });
  }
  return { current, start, act, ack, history, stats };
}

function routes(r, { focus }){
  const A = { auth: true };
  r.add("GET", "/api/focus", (c) => focus.current(c.user), A);
  r.add("GET", "/api/focus/stats", (c) => focus.stats(c.user, c.query), A);
  r.add("GET", "/api/focus/sessions", (c) => focus.history(c.user, c.query), A);
  r.add("POST", "/api/focus/sessions", async (c) => focus.start(c.user, await c.json()), A);
  for (const action of ACTIONS) r.add("POST", `/api/focus/sessions/:id/${action}`, async (c) => focus.act(c.user, c.params.id, action, await c.json()), A);
  r.add("POST", "/api/focus/sessions/:id/ack", (c) => focus.ack(c.user, c.params.id), A);
}
module.exports = { createFocus, routes };
