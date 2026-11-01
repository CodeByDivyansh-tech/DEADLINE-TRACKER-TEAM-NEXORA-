// Tasks and deadlines: the tasks table, the task API, and the bridge that lets the existing app
// load and save its whole state while tasks live in their own table.
// Every query is scoped with "user_id = ?" using the logged-in user from the session, never an id sent by the browser.
const crypto = require("crypto");
const { ApiError, V } = require("../http");
const T = require("../time");

const PRIORITIES = ["high", "medium", "low"];
const STATUSES = ["todo", "doing", "review", "blocked", "done"];
const COLUMNS_FROM_ITEM = new Set(["id", "title", "notes", "due", "plan", "time", "priority", "status", "estimate", "progress", "reminders", "createdAt", "updatedAt", "doneAt", "kind", "_ws"]);
const newTaskId = () => "t_" + crypto.randomBytes(9).toString("base64url");
const iso = ms => ms == null ? null : new Date(ms).toISOString();
const msOf = s => { const t = s ? Date.parse(s) : NaN; return Number.isFinite(t) ? t : null; };

function defaultSettings(mode, tz){
  return { hoursPerDay: mode === "company" ? 6 : 3, workdays: mode === "company" ? [1, 2, 3, 4, 5] : [0, 1, 2, 3, 4, 5, 6],
    reminders: [4320, 1440, 60], customReminder: 0, overdueAlerts: true, dailySummary: true, quietOn: true, quietFrom: "22:00", quietTo: "07:00", tz: tz || "UTC",
    thresholds: { critical: 100, risk: 70, attention: 40 } };
}
function newWorkspaceMeta(user){
  return { id: "w_" + crypto.randomBytes(6).toString("base64url"), name: "My tasks", mode: "personal", demo: false, createdAt: new Date().toISOString(), groups: [],
    members: [{ id: "me", name: (user.name || "You").split(" ")[0], role: "Owner", capacity: 21 }], items: [], activity: [], notices: [], viewAs: "manager", settings: defaultSettings("personal", user.timezone) };
}

// ---------- row <-> API task <-> app item ----------
function rowToTask(r){
  return { id: r.id, workspaceId: r.workspace_id, title: r.title, description: r.description, dueDate: r.due_date, dueTime: r.due_time, dueAt: iso(r.due_at),
    planDate: r.plan_date, planTime: r.plan_time, priority: r.priority, status: r.status, category: r.category, estimateHours: r.estimate_hours, progress: r.progress,
    reminders: r.reminders ? JSON.parse(r.reminders) : null, createdAt: iso(r.created_at), updatedAt: iso(r.updated_at), completedAt: iso(r.completed_at) };
}
function rowToItem(r){
  const extra = JSON.parse(r.extra || "{}");
  return Object.assign(extra, { id: r.id, title: r.title, notes: r.description, due: r.due_date ? `${r.due_date}T${r.due_time || "23:59"}` : null,
    plan: r.plan_date, time: r.plan_time, priority: r.priority, status: r.status, estimate: r.estimate_hours, progress: r.progress,
    reminders: r.reminders ? JSON.parse(r.reminders) : null, createdAt: iso(r.created_at), updatedAt: iso(r.updated_at), doneAt: iso(r.completed_at),
    kind: r.due_date ? "deadline" : "todo", type: extra.type || r.category || undefined });
}
function cleanReminders(v, field = "reminders"){
  if (v == null) return null;
  if (!Array.isArray(v) || v.length > 8 || !v.every(m => Number.isInteger(m) && m >= 0 && m <= 20160)) throw new ApiError(400, "invalid_" + field, `${field} must be a list of up to 8 whole minutes (0–20160).`, { field });
  return JSON.stringify([...new Set(v)].sort((a, b) => b - a));
}
const dueAtOf = (date, time, tz) => date ? T.zonedToUtc(date, time || "23:59", tz) : null;

// An item from the app -> a validated row. Throws with the item's title so the user knows which one is wrong.
function itemToRow(it, wsId, user, prev){
  const where = `Task "${String(it && it.title || "").slice(0, 40)}"`;
  if (!it || typeof it !== "object") throw new ApiError(400, "invalid_task", "A task in the list isn't valid.");
  if (typeof it.id !== "string" || !/^[\w.-]{3,64}$/.test(it.id)) throw new ApiError(400, "invalid_task_id", `${where} has an invalid id.`);
  const title = typeof it.title === "string" ? it.title.trim().slice(0, 200) : "";
  if (!title) throw new ApiError(400, "invalid_title", "Every task needs a title.");
  let dueDate = null, dueTime = null;
  if (it.due) {
    const m = String(it.due).match(/^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}))?/);
    if (!m || !T.validDate(m[1]) || (m[2] && !T.validTime(m[2]))) throw new ApiError(400, "invalid_due", `${where} has an invalid deadline.`);
    dueDate = m[1]; dueTime = m[2] || "23:59";
  }
  if (it.plan && !T.validDate(it.plan)) throw new ApiError(400, "invalid_plan", `${where} has an invalid day.`);
  if (it.time && !T.validTime(it.time)) throw new ApiError(400, "invalid_time", `${where} has an invalid time.`);
  const est = it.estimate == null || it.estimate === "" ? null : Number(it.estimate);
  if (est != null && !(est >= 0 && est <= 1000)) throw new ApiError(400, "invalid_estimate", `${where} has an invalid estimate.`);
  const extra = {}; Object.keys(it).forEach(k => { if (!COLUMNS_FROM_ITEM.has(k)) extra[k] = it[k]; });
  const extraJson = JSON.stringify(extra);
  if (extraJson.length > 100000) throw new ApiError(413, "too_large", `${where} has too much attached data.`);
  const status = STATUSES.includes(it.status) ? it.status : "todo";
  const now = Date.now();
  return { id: it.id, user_id: user.id, workspace_id: wsId, title, description: typeof it.notes === "string" ? it.notes.slice(0, 20000) : "",
    due_date: dueDate, due_time: dueTime, due_at: dueAtOf(dueDate, dueTime, user.timezone), plan_date: it.plan || null, plan_time: it.time || null,
    priority: PRIORITIES.includes(it.priority) ? it.priority : "medium", status, category: typeof it.type === "string" ? it.type.slice(0, 40) : null,
    estimate_hours: est, progress: Math.max(0, Math.min(100, Math.round(Number(it.progress) || 0))), reminders: cleanReminders(it.reminders),
    extra: extraJson, created_at: msOf(it.createdAt) || (prev && prev.created_at) || now,
    updated_at: msOf(it.updatedAt) || now, completed_at: status === "done" ? (msOf(it.doneAt) || (prev && prev.completed_at) || now) : null };
}
const ROW_COLS = ["id", "user_id", "workspace_id", "title", "description", "due_date", "due_time", "due_at", "plan_date", "plan_time", "priority", "status", "category", "estimate_hours", "progress", "reminders", "extra", "created_at", "updated_at", "completed_at"];

function createTasks(db, { onChange } = {}){
  const insert = db.prepare(`INSERT INTO tasks (${ROW_COLS.join(", ")}) VALUES (${ROW_COLS.map(() => "?").join(", ")})`);
  const update = db.prepare(`UPDATE tasks SET ${ROW_COLS.slice(2).map(c => c + " = ?").join(", ")} WHERE id = ? AND user_id = ?`);
  const own = (user, id) => { const r = db.prepare("SELECT * FROM tasks WHERE id = ? AND user_id = ?").get(String(id), user.id); if (!r) throw new ApiError(404, "not_found", "Task not found."); return r; };
  const bump = userId => {
    const r = db.prepare("SELECT version FROM app_state WHERE user_id = ?").get(userId);
    if (r) db.prepare("UPDATE app_state SET version = version + 1, updated_at = ? WHERE user_id = ?").run(Date.now(), userId);
    if (onChange) onChange(userId);
  };
  const changed = (a, b) => ROW_COLS.some(c => c !== "created_at" && c !== "updated_at" && a[c] !== b[c]);

  // ----- the app's state (workspaces + settings) joined with the tasks table -----
  function loadState(user){
    const row = db.prepare("SELECT json, version FROM app_state WHERE user_id = ?").get(user.id);
    if (!row) return { state: null, version: 0 };
    const state = JSON.parse(row.json);
    const rows = db.prepare("SELECT * FROM tasks WHERE user_id = ? ORDER BY created_at").all(user.id);
    const byWs = new Map(); rows.forEach(r => { if (!byWs.has(r.workspace_id)) byWs.set(r.workspace_id, []); byWs.get(r.workspace_id).push(rowToItem(r)); });
    (state.workspaces || []).forEach(w => { w.items = byWs.get(w.id) || []; });
    return { state, version: row.version };
  }
  // Saves the app's state. Tasks are written to the tasks table (only this user's rows), the rest to app_state.
  function saveState(user, body){
    const st = body && body.state;
    if (!st || typeof st !== "object" || !Array.isArray(st.workspaces)) throw new ApiError(400, "invalid_state", "Missing state.");
    if (st.workspaces.length > 50) throw new ApiError(400, "invalid_state", "Too many workspaces.");
    const base = Number(body.base);
    return db.tx(() => {
      const cur = db.prepare("SELECT json, version FROM app_state WHERE user_id = ?").get(user.id);
      const version = cur ? cur.version : 0;
      if (base !== version) { const latest = loadState(user); throw new ApiError(409, "conflict", "Changed on another device.", latest); }
      const existing = new Map(db.prepare("SELECT * FROM tasks WHERE user_id = ?").all(user.id).map(r => [r.id, r]));
      const keep = new Set(); let writes = 0;
      st.workspaces.forEach(w => {
        if (!w || typeof w.id !== "string" || !/^[\w.-]{2,64}$/.test(w.id)) throw new ApiError(400, "invalid_workspace", "A workspace has an invalid id.");
        const items = Array.isArray(w.items) ? w.items : [];
        if (items.length > 5000) throw new ApiError(400, "too_many_tasks", "Too many tasks in one workspace.");
        items.forEach(it => {
          if (keep.has(it && it.id)) throw new ApiError(400, "duplicate_task_id", "Two tasks share the same id.");
          const prev = existing.get(it && it.id);
          if (!prev && it && typeof it.id === "string" && db.prepare("SELECT 1 FROM tasks WHERE id = ?").get(it.id)) throw new ApiError(409, "id_taken", "A task id is already used. Reload the page and try again.");
          const row = itemToRow(it, w.id, user, prev); keep.add(row.id);
          if (!prev) { insert.run(...ROW_COLS.map(c => row[c])); writes++; }
          else if (changed(prev, row) || prev.extra !== row.extra) { update.run(...ROW_COLS.slice(2).map(c => row[c]), row.id, user.id); writes++; }
        });
      });
      for (const id of existing.keys()) if (!keep.has(id)) { db.prepare("DELETE FROM tasks WHERE id = ? AND user_id = ?").run(id, user.id); writes++; }
      const meta = Object.assign({}, st, { workspaces: st.workspaces.map(w => Object.assign({}, w, { items: [] })) });
      delete meta.inbox; delete meta.fired; delete meta.muted; // notifications live in their own table
      const json = JSON.stringify(meta);
      if (json.length > 4 * 1024 * 1024) throw new ApiError(413, "too_large", "Your saved data is too large.");
      if (cur) db.prepare("UPDATE app_state SET json = ?, version = ?, updated_at = ? WHERE user_id = ?").run(json, version + 1, Date.now(), user.id);
      else db.prepare("INSERT INTO app_state (user_id, json, version, updated_at) VALUES (?, ?, ?, ?)").run(user.id, json, 1, Date.now());
      if (writes && onChange) onChange(user.id);
      return { version: version + 1 };
    });
  }
  function clearState(user){ db.tx(() => { db.prepare("DELETE FROM tasks WHERE user_id = ?").run(user.id); db.prepare("DELETE FROM app_state WHERE user_id = ?").run(user.id); }); if (onChange) onChange(user.id); }
  function settingsOf(user){
    const row = db.prepare("SELECT json FROM app_state WHERE user_id = ?").get(user.id);
    const st = row ? JSON.parse(row.json) : null;
    const w = st && (st.workspaces.find(x => x.id === st.active) || st.workspaces[0]);
    return Object.assign(defaultSettings(w ? w.mode : "personal", user.timezone), w ? w.settings : {}, { workspaceId: w ? w.id : null, mode: w ? w.mode : "personal" });
  }
  function ensureWorkspace(user, wsId){
    const row = db.prepare("SELECT json, version FROM app_state WHERE user_id = ?").get(user.id);
    const st = row ? JSON.parse(row.json) : { v: 2, user: { name: (user.name || "").split(" ")[0] }, active: null, workspaces: [], read: {} };
    if (wsId) { if (!st.workspaces.some(w => w.id === wsId)) throw new ApiError(400, "invalid_workspaceId", "That workspace doesn't exist."); return wsId; }
    if (st.workspaces.length) return (st.workspaces.find(w => w.id === st.active) || st.workspaces[0]).id;
    const w = newWorkspaceMeta(user); st.workspaces.push(w); st.active = w.id; st.updatedAt = Date.now();
    if (row) db.prepare("UPDATE app_state SET json = ?, version = version + 1, updated_at = ? WHERE user_id = ?").run(JSON.stringify(st), Date.now(), user.id);
    else db.prepare("INSERT INTO app_state (user_id, json, version, updated_at) VALUES (?, ?, 1, ?)").run(user.id, JSON.stringify(st), Date.now());
    return w.id;
  }

  // ----- task API -----
  function fromBody(user, b, prev){
    const r = prev ? Object.assign({}, prev) : { id: newTaskId(), user_id: user.id, description: "", priority: "medium", status: "todo", progress: 0, extra: "{}", created_at: Date.now(), completed_at: null, reminders: null, category: null, estimate_hours: null, due_date: null, due_time: null, plan_date: null, plan_time: null };
    if (!prev || b.title !== undefined) r.title = V.str(b.title, "title", { min: 1, max: 200, required: true });
    if (b.description !== undefined) r.description = V.str(b.description, "description", { max: 20000 }) || "";
    if (b.dueDate !== undefined) { if (b.dueDate !== null && !T.validDate(b.dueDate)) throw new ApiError(400, "invalid_dueDate", "dueDate must be YYYY-MM-DD.", { field: "dueDate" }); r.due_date = b.dueDate; if (!b.dueDate) r.due_time = null; }
    if (b.dueTime !== undefined) { if (b.dueTime !== null && !T.validTime(b.dueTime)) throw new ApiError(400, "invalid_dueTime", "dueTime must be HH:MM (24-hour).", { field: "dueTime" }); r.due_time = b.dueTime; }
    if (r.due_time && !r.due_date) throw new ApiError(400, "invalid_dueTime", "A due time needs a due date.", { field: "dueTime" });
    if (r.due_date && !r.due_time) r.due_time = "23:59";
    if (b.planDate !== undefined) { if (b.planDate !== null && !T.validDate(b.planDate)) throw new ApiError(400, "invalid_planDate", "planDate must be YYYY-MM-DD.", { field: "planDate" }); r.plan_date = b.planDate; }
    if (b.planTime !== undefined) { if (b.planTime !== null && !T.validTime(b.planTime)) throw new ApiError(400, "invalid_planTime", "planTime must be HH:MM.", { field: "planTime" }); r.plan_time = b.planTime; }
    if (b.priority !== undefined) r.priority = V.oneOf(b.priority, "priority", PRIORITIES, "medium");
    if (b.status !== undefined) r.status = V.oneOf(b.status, "status", STATUSES, "todo");
    if (b.category !== undefined) r.category = V.str(b.category, "category", { max: 40 });
    if (b.estimateHours !== undefined) r.estimate_hours = V.num(b.estimateHours, "estimateHours", { min: 0, max: 1000 });
    if (b.progress !== undefined) r.progress = V.num(b.progress, "progress", { min: 0, max: 100, int: true }) || 0;
    if (b.reminders !== undefined) r.reminders = cleanReminders(b.reminders);
    r.due_at = dueAtOf(r.due_date, r.due_time, user.timezone);
    if (r.status === "done") { r.completed_at = r.completed_at || Date.now(); r.progress = 100; } else r.completed_at = null;
    r.updated_at = Date.now();
    return r;
  }
  function create(user, b){
    const r = fromBody(user, b);
    r.workspace_id = ensureWorkspace(user, b.workspaceId ? V.str(b.workspaceId, "workspaceId", { max: 64 }) : null);
    const x = JSON.parse(r.extra); x.assignee = "me"; x.type = r.category || undefined; r.extra = JSON.stringify(x);
    insert.run(...ROW_COLS.map(c => r[c])); bump(user.id);
    return rowToTask(own(user, r.id));
  }
  function patch(user, id, b){
    const prev = own(user, id); const r = fromBody(user, b, prev);
    update.run(...ROW_COLS.slice(2).map(c => r[c]), r.id, user.id); bump(user.id);
    return rowToTask(own(user, id));
  }
  function setDone(user, id, done){
    const prev = own(user, id);
    db.prepare("UPDATE tasks SET status = ?, completed_at = ?, progress = ?, updated_at = ? WHERE id = ? AND user_id = ?")
      .run(done ? "done" : "todo", done ? Date.now() : null, done ? 100 : Math.min(prev.progress, 99), Date.now(), id, user.id);
    bump(user.id); return rowToTask(own(user, id));
  }
  function remove(user, id){ own(user, id); db.prepare("DELETE FROM tasks WHERE id = ? AND user_id = ?").run(id, user.id); bump(user.id); }
  // Filters: status, priority, q (search), due=today|tomorrow|overdue|upcoming|week|none, from/to (due dates), workspaceId, sort, limit, offset
  function list(user, q){
    const where = ["user_id = ?"], args = [user.id];
    const today = T.localDate(Date.now(), user.timezone), now = Date.now();
    if (q.status) { const s = String(q.status).split(","); s.forEach(x => V.oneOf(x, "status", STATUSES.concat(["open"]))); if (s.includes("open")) where.push("status <> 'done'"); else { where.push(`status IN (${s.map(() => "?").join(",")})`); args.push(...s); } }
    if (q.priority) { const p = String(q.priority).split(","); p.forEach(x => V.oneOf(x, "priority", PRIORITIES)); where.push(`priority IN (${p.map(() => "?").join(",")})`); args.push(...p); }
    if (q.q) { const s = V.str(q.q, "q", { max: 100 }); where.push("(title LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\')"); const like = "%" + s.replace(/[\\%_]/g, m => "\\" + m) + "%"; args.push(like, like); }
    if (q.workspaceId) { where.push("workspace_id = ?"); args.push(String(q.workspaceId)); }
    if (q.from) { if (!T.validDate(q.from)) throw new ApiError(400, "invalid_from", "from must be YYYY-MM-DD."); where.push("due_date >= ?"); args.push(q.from); }
    if (q.to) { if (!T.validDate(q.to)) throw new ApiError(400, "invalid_to", "to must be YYYY-MM-DD."); where.push("due_date <= ?"); args.push(q.to); }
    switch (q.due) {
      case undefined: case "": break;
      case "today": where.push("status <> 'done' AND (due_date = ? OR plan_date = ?)"); args.push(today, today); break;
      case "tomorrow": { const tm = T.addDays(today, 1); where.push("status <> 'done' AND (due_date = ? OR plan_date = ?)"); args.push(tm, tm); break; }
      case "overdue": where.push("status <> 'done' AND due_at IS NOT NULL AND due_at < ?"); args.push(now); break;
      case "upcoming": where.push("status <> 'done' AND due_at IS NOT NULL AND due_at >= ? AND due_date <= ?"); args.push(now, T.addDays(today, Number(q.days) > 0 && Number(q.days) <= 365 ? Number(q.days) : 14)); break;
      case "week": where.push("status <> 'done' AND due_date >= ? AND due_date <= ?"); args.push(today, T.addDays(today, 6)); break;
      case "none": where.push("due_date IS NULL"); break;
      default: throw new ApiError(400, "invalid_due", "due must be one of: today, tomorrow, overdue, upcoming, week, none.");
    }
    const SORTS = { due: "due_at IS NULL, due_at", priority: "CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, due_at IS NULL, due_at", created: "created_at DESC", updated: "updated_at DESC", title: "title COLLATE NOCASE" };
    const sort = SORTS[q.sort || "due"]; if (!sort) throw new ApiError(400, "invalid_sort", `sort must be one of: ${Object.keys(SORTS).join(", ")}.`);
    const limit = V.num(q.limit, "limit", { min: 1, max: 500, int: true }) || 200, offset = V.num(q.offset, "offset", { min: 0, max: 1e6, int: true }) || 0;
    const total = db.prepare(`SELECT COUNT(*) n FROM tasks WHERE ${where.join(" AND ")}`).get(...args).n;
    const rows = db.prepare(`SELECT * FROM tasks WHERE ${where.join(" AND ")} ORDER BY ${sort} LIMIT ? OFFSET ?`).all(...args, limit, offset);
    return { tasks: rows.map(rowToTask), total, limit, offset };
  }
  const openRows = user => db.prepare("SELECT * FROM tasks WHERE user_id = ? AND status <> 'done'").all(user.id);
  const allRows = user => db.prepare("SELECT * FROM tasks WHERE user_id = ?").all(user.id);
  return { loadState, saveState, clearState, settingsOf, ensureWorkspace, create, patch, setDone, remove, list, get: (u, id) => rowToTask(own(u, id)), own, openRows, allRows, bump, insert, update, ROW_COLS, fromBody, rowToTask };
}

function routes(r, { tasks }){
  r.add("GET", "/api/tasks", (c) => tasks.list(c.user, c.query), { auth: true });
  for (const due of ["today", "tomorrow", "overdue", "upcoming"]) r.add("GET", "/api/tasks/" + due, (c) => tasks.list(c.user, Object.assign({}, c.query, { due })), { auth: true });
  r.add("POST", "/api/tasks", async (c) => ({ status: 201, body: { task: tasks.create(c.user, await c.json()) } }), { auth: true });
  r.add("GET", "/api/tasks/:id", (c) => ({ task: tasks.get(c.user, c.params.id) }), { auth: true });
  r.add("PATCH", "/api/tasks/:id", async (c) => ({ task: tasks.patch(c.user, c.params.id, await c.json()) }), { auth: true });
  r.add("DELETE", "/api/tasks/:id", (c) => { tasks.remove(c.user, c.params.id); return { status: 204 }; }, { auth: true });
  r.add("POST", "/api/tasks/:id/complete", (c) => ({ task: tasks.setDone(c.user, c.params.id, true) }), { auth: true });
  r.add("POST", "/api/tasks/:id/reopen", (c) => ({ task: tasks.setDone(c.user, c.params.id, false) }), { auth: true });
  r.add("GET", "/api/state", (c) => tasks.loadState(c.user), { auth: true });
  r.add("PUT", "/api/state", async (c) => tasks.saveState(c.user, await c.json(8 * 1024 * 1024)), { auth: true });
  r.add("DELETE", "/api/state", (c) => { tasks.clearState(c.user); return { version: 0 }; }, { auth: true });
}
module.exports = { createTasks, routes, rowToTask, rowToItem, PRIORITIES, STATUSES, defaultSettings };
