// Admin-only operations. Every route here requires an account with role "admin" (checked on the server).
// Admins manage accounts and public knowledge; they can't read other people's tasks.
const { ApiError, V } = require("../http");
const T = require("../time");

function routes(r, { db, rag, help, gemini, notifications, auth }){
  const A = { auth: true, admin: true };
  r.add("GET", "/api/admin/overview", () => {
    const n = sql => db.prepare(sql).get().n; const day = Date.now() - 864e5;
    return { users: n("SELECT COUNT(*) n FROM users"), admins: n("SELECT COUNT(*) n FROM users WHERE role = 'admin'"), tasks: n("SELECT COUNT(*) n FROM tasks"),
      knowledge: { sources: n("SELECT COUNT(*) n FROM kb_sources"), chunks: n("SELECT COUNT(*) n FROM kb_chunks"), embedded: n("SELECT COUNT(*) n FROM kb_chunks WHERE embedding IS NOT NULL") },
      questions: { total: n("SELECT COUNT(*) n FROM questions"), unanswered: n("SELECT COUNT(*) n FROM questions WHERE answered = 0"), up: n("SELECT COUNT(*) n FROM questions WHERE rating = 1"), down: n("SELECT COUNT(*) n FROM questions WHERE rating = -1") },
      ai: Object.assign(gemini.status(), { last24h: db.prepare("SELECT status, COUNT(*) n FROM ai_usage WHERE created_at > ? GROUP BY status").all(day) }),
      errors24h: db.prepare("SELECT COUNT(*) n FROM error_log WHERE created_at > ?").get(day).n, reminders: notifications.status() };
  }, A);
  // ----- users -----
  r.add("GET", "/api/admin/users", (c) => {
    const q = c.query.q ? "%" + String(c.query.q).slice(0, 100).replace(/[\\%_]/g, m => "\\" + m) + "%" : null;
    const rows = db.prepare(`SELECT u.id, u.email, u.name, u.role, u.disabled, u.timezone, u.created_at, (SELECT COUNT(*) FROM tasks t WHERE t.user_id = u.id) tasks,
      (SELECT MAX(created_at) FROM sessions s WHERE s.user_id = u.id) last_login FROM users u ${q ? "WHERE u.email LIKE ? ESCAPE '\\' OR u.name LIKE ? ESCAPE '\\'" : ""} ORDER BY u.created_at DESC LIMIT 500`).all(...(q ? [q, q] : []));
    return { users: rows.map(u => ({ id: u.id, email: u.email, name: u.name, role: u.role, disabled: !!u.disabled, timezone: u.timezone, tasks: u.tasks, createdAt: new Date(u.created_at).toISOString(), lastLogin: u.last_login ? new Date(u.last_login).toISOString() : null })) };
  }, A);
  const lastAdminGuard = (target) => { if (target.role === "admin" && db.prepare("SELECT COUNT(*) n FROM users WHERE role = 'admin' AND disabled = 0").get().n <= 1) throw new ApiError(400, "last_admin", "This is the only admin. Make someone else an admin first."); };
  r.add("PATCH", "/api/admin/users/:id", async (c) => {
    const b = await c.json(); const u = db.prepare("SELECT * FROM users WHERE id = ?").get(c.params.id);
    if (!u) throw new ApiError(404, "not_found", "User not found.");
    const role = V.oneOf(b.role, "role", ["user", "admin"], u.role); const disabled = b.disabled === undefined ? !!u.disabled : V.bool(b.disabled, "disabled");
    if ((role !== "admin" || disabled) && u.role === "admin" && !u.disabled) lastAdminGuard(u);
    db.prepare("UPDATE users SET role = ?, disabled = ?, updated_at = ? WHERE id = ?").run(role, disabled ? 1 : 0, Date.now(), u.id);
    if (disabled) db.prepare("DELETE FROM sessions WHERE user_id = ?").run(u.id);
    return { ok: true };
  }, A);
  // A one-time "set a new password" link for someone who can't log in (for when reset emails aren't set up).
  // The admin sends it to the person; it works once, for 24 hours. The admin never sees or sets the password.
  r.add("POST", "/api/admin/users/:id/reset-link", (c) => auth.adminResetLink(c.params.id, c.req), A);
  r.add("DELETE", "/api/admin/users/:id", (c) => {
    const u = db.prepare("SELECT * FROM users WHERE id = ?").get(c.params.id);
    if (!u) throw new ApiError(404, "not_found", "User not found.");
    if (u.id === c.user.id) throw new ApiError(400, "self", "You can't delete your own account here.");
    if (u.role === "admin") lastAdminGuard(u);
    db.prepare("DELETE FROM users WHERE id = ?").run(u.id); // tasks, sessions, notifications and chats go with it
    return { status: 204 };
  }, A);
  // ----- knowledge -----
  const kbOut = s => ({ id: s.id, kind: s.kind, title: s.title, body: s.body, source: s.source, updatedAt: new Date(s.updated_at).toISOString(), indexedAt: s.indexed_at ? new Date(s.indexed_at).toISOString() : null,
    chunks: db.prepare("SELECT COUNT(*) n FROM kb_chunks WHERE source_id = ?").get(s.id).n, embedded: db.prepare("SELECT COUNT(*) n FROM kb_chunks WHERE source_id = ? AND embedding IS NOT NULL").get(s.id).n });
  r.add("GET", "/api/admin/kb", () => ({ items: db.prepare("SELECT * FROM kb_sources ORDER BY kind, title").all().map(kbOut) }), A);
  r.add("GET", "/api/admin/kb/:id", (c) => { const s = db.prepare("SELECT * FROM kb_sources WHERE id = ?").get(c.params.id); if (!s) throw new ApiError(404, "not_found", "Not found."); return { item: kbOut(s) }; }, A);
  async function afterChange(id){ rag.rechunk(id); const e = await rag.refresh(); return e; }
  r.add("POST", "/api/admin/kb", async (c) => {
    const b = await c.json(3 * 1024 * 1024);
    const kind = V.oneOf(b.kind, "kind", ["doc", "faq"], "doc");
    let title = b.title ? V.str(b.title, "title", { max: 200 }) : null, body = typeof b.body === "string" ? b.body : "";
    if (b.filename !== undefined) {
      const fn = V.str(b.filename, "filename", { max: 200, required: true });
      if (/\.html?$/i.test(fn)) {
        const h1 = body.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || body.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        if (h1 && !title) title = h1[1].replace(/<[^>]+>/g, "").trim();
        body = body.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<h([1-4])[^>]*>([\s\S]*?)<\/h\1>/gi, (m, n, t) => `\n${"#".repeat(+n)} ${t.replace(/<[^>]+>/g, "")}\n`)
          .replace(/<\/(p|div|li|tr)>/gi, "\n").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/[ \t]+/g, " ");
        if (h1) body = body.replace(new RegExp("^\\s*#\\s*" + title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*$", "m"), "");
      } else if (!/\.(md|markdown|txt)$/i.test(fn)) throw new ApiError(400, "file_type", "Upload a .txt, .md or .html file.");
      if (!title) title = (body.match(/^#\s+(.*)$/m) || [, fn.replace(/\.\w+$/, "")])[1].trim();
    }
    body = body.trim().slice(0, 200000);
    if (!title || !body) throw new ApiError(400, "invalid_request", "Add a title and some text.");
    const nid = "kb_" + require("crypto").randomBytes(8).toString("base64url");
    db.prepare("INSERT INTO kb_sources (id, kind, title, body, source, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run(nid, kind, title.slice(0, 200), body, b.filename || ("admin:" + c.user.email), Date.now());
    if (b.fromQuestion) db.prepare("UPDATE questions SET answered = 2 WHERE id = ?").run(String(b.fromQuestion));
    const index = await afterChange(nid);
    return { status: 201, body: { item: kbOut(db.prepare("SELECT * FROM kb_sources WHERE id = ?").get(nid)), index } };
  }, A);
  r.add("PUT", "/api/admin/kb/:id", async (c) => {
    const b = await c.json(3 * 1024 * 1024);
    const title = V.str(b.title, "title", { min: 1, max: 200, required: true }), body = V.str(b.body, "body", { min: 1, max: 200000, required: true });
    const x = db.prepare("UPDATE kb_sources SET title = ?, body = ?, updated_at = ? WHERE id = ?").run(title, body, Date.now(), c.params.id);
    if (!x.changes) throw new ApiError(404, "not_found", "Not found.");
    return { ok: true, index: await afterChange(c.params.id) };
  }, A);
  r.add("DELETE", "/api/admin/kb/:id", (c) => { const x = db.prepare("DELETE FROM kb_sources WHERE id = ?").run(c.params.id); if (!x.changes) throw new ApiError(404, "not_found", "Not found."); rag.reset(); return { status: 204 }; }, A);
  r.add("POST", "/api/admin/kb/reindex", async (c) => { const b = await c.json(); return rag.refresh({ all: b.all === true }); }, A);
  // ----- questions -----
  r.add("GET", "/api/admin/questions", () => {
    const all = db.prepare("SELECT q.id, q.question, q.answer, q.answered, q.sources, q.rating, q.via, q.created_at FROM questions q ORDER BY q.created_at DESC LIMIT 1000").all()
      .map(x => ({ id: x.id, question: x.question, answer: x.answer, answered: x.answered, sources: JSON.parse(x.sources || "[]"), rating: x.rating, via: x.via, createdAt: new Date(x.created_at).toISOString() }));
    const counts = new Map();
    all.forEach(x => { const k = String(x.question).toLowerCase().replace(/[^a-z0-9 ]+/g, "").replace(/\s+/g, " ").trim(); const c = counts.get(k) || { question: x.question, count: 0, answered: 0 }; c.count++; if (x.answered) c.answered++; counts.set(k, c); });
    return { unanswered: all.filter(x => x.answered === 0), rated: all.filter(x => x.rating), recent: all.slice(0, 50), common: [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 20) };
  }, A);
  r.add("PUT", "/api/admin/questions/:id", (c) => { const x = db.prepare("UPDATE questions SET answered = 2 WHERE id = ?").run(c.params.id); if (!x.changes) throw new ApiError(404, "not_found", "Not found."); return { ok: true }; }, A);
  // ----- AI instructions -----
  r.add("GET", "/api/admin/settings", () => ({ instructions: help.instructions(), default: help.DEFAULT_INSTRUCTIONS, scope: help.scope() }), A);
  r.add("PUT", "/api/admin/settings", async (c) => {
    const b = await c.json();
    const set = (k, v) => db.prepare("INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").run(k, v);
    if (b.scope !== undefined) set("help_scope", V.oneOf(b.scope, "scope", ["all", "focused"], "all"));
    if (b.instructions !== undefined || b.scope === undefined) set("instructions", V.str(b.instructions, "instructions", { min: 1, max: 8000, required: true }));
    return { ok: true };
  }, A);
  // ----- monitoring -----
  r.add("GET", "/api/admin/usage", (c) => {
    const days = V.num(c.query.days, "days", { min: 1, max: 90, int: true }) || 14; const since = Date.now() - days * 864e5;
    const rows = db.prepare("SELECT created_at, kind, model, status, prompt_tokens, output_tokens, latency_ms FROM ai_usage WHERE created_at > ?").all(since);
    const byDay = new Map();
    rows.forEach(x => { const d = T.localDate(x.created_at, c.user.timezone); const e = byDay.get(d) || { date: d, chat: 0, embed: 0, ok: 0, quota: 0, limited: 0, error: 0, promptTokens: 0, outputTokens: 0 };
      e[x.kind === "embed" ? "embed" : "chat"]++; e[x.status]++; e.promptTokens += x.prompt_tokens || 0; e.outputTokens += x.output_tokens || 0; byDay.set(d, e); });
    const recent = db.prepare("SELECT created_at, kind, model, status, latency_ms, error FROM ai_usage ORDER BY id DESC LIMIT 30").all().map(x => Object.assign(x, { created_at: new Date(x.created_at).toISOString() }));
    return { days: [...byDay.values()].sort((a, b) => a.date < b.date ? 1 : -1), recent, status: gemini.status() };
  }, A);
  r.add("GET", "/api/admin/errors", () => ({ errors: db.prepare("SELECT id, area, message, detail, created_at FROM error_log ORDER BY id DESC LIMIT 100").all().map(x => Object.assign(x, { created_at: new Date(x.created_at).toISOString() })) }), A);
}
module.exports = { routes };
