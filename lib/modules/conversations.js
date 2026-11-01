// Conversation history for Deadline AI (Help and My Plan), stored per user.
const crypto = require("crypto");
const { ApiError, V } = require("../http");
const id = p => p + "_" + crypto.randomBytes(9).toString("base64url");

function createConversations(db){
  function getOrCreate(user, kind, convId, firstText){
    if (convId) {
      const c = db.prepare("SELECT * FROM conversations WHERE id = ? AND user_id = ? AND kind = ?").get(String(convId), user.id, kind);
      if (!c) throw new ApiError(404, "not_found", "Conversation not found.");
      return c;
    }
    const c = { id: id("c"), user_id: user.id, kind, title: String(firstText || "").slice(0, 80), created_at: Date.now(), updated_at: Date.now() };
    db.prepare("INSERT INTO conversations (id, user_id, kind, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run(c.id, c.user_id, c.kind, c.title, c.created_at, c.updated_at);
    return c;
  }
  function add(conv, role, text, meta = {}){
    const m = { id: id("m"), conversation_id: conv.id, role, text: String(text).slice(0, 20000), meta: JSON.stringify(meta), created_at: Date.now() };
    db.prepare("INSERT INTO messages (id, conversation_id, role, text, meta, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(m.id, m.conversation_id, m.role, m.text, m.meta, m.created_at);
    db.prepare("UPDATE conversations SET updated_at = ? WHERE id = ?").run(m.created_at, conv.id);
    return msgOut(m);
  }
  const msgOut = m => Object.assign({ id: m.id, role: m.role, text: m.text, createdAt: new Date(m.created_at).toISOString() }, JSON.parse(m.meta || "{}"));
  function history(conv, n = 8){ return db.prepare("SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?").all(conv.id, n).reverse(); }
  function message(user, msgId){
    const m = db.prepare("SELECT m.* FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE m.id = ? AND c.user_id = ?").get(String(msgId), user.id);
    if (!m) throw new ApiError(404, "not_found", "Message not found.");
    return m;
  }
  function setMeta(msgId, meta){ db.prepare("UPDATE messages SET meta = ? WHERE id = ?").run(JSON.stringify(meta), msgId); }
  return { getOrCreate, add, history, message, setMeta, msgOut };
}
function routes(r, { db, conversations }){
  r.add("GET", "/api/conversations", (c) => {
    const kind = V.oneOf(c.query.kind, "kind", ["help", "plan"], null);
    const rows = db.prepare(`SELECT c.*, (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) n FROM conversations c WHERE c.user_id = ?${kind ? " AND c.kind = ?" : ""} ORDER BY c.updated_at DESC LIMIT 50`).all(...[c.user.id].concat(kind ? [kind] : []));
    return { conversations: rows.map(x => ({ id: x.id, kind: x.kind, title: x.title, messages: x.n, createdAt: new Date(x.created_at).toISOString(), updatedAt: new Date(x.updated_at).toISOString() })) };
  }, { auth: true });
  r.add("POST", "/api/conversations", async (c) => {
    const b = await c.json(); const kind = V.oneOf(b.kind, "kind", ["help", "plan"], "help");
    const conv = conversations.getOrCreate(c.user, kind, null, "");
    return { status: 201, body: { conversation: { id: conv.id, kind } } };
  }, { auth: true });
  r.add("GET", "/api/conversations/:id/messages", (c) => {
    const conv = db.prepare("SELECT * FROM conversations WHERE id = ? AND user_id = ?").get(c.params.id, c.user.id);
    if (!conv) throw new ApiError(404, "not_found", "Conversation not found.");
    return { conversation: { id: conv.id, kind: conv.kind, title: conv.title }, messages: db.prepare("SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at, rowid").all(conv.id).map(conversations.msgOut) };
  }, { auth: true });
  r.add("DELETE", "/api/conversations/:id", (c) => {
    const x = db.prepare("DELETE FROM conversations WHERE id = ? AND user_id = ?").run(c.params.id, c.user.id);
    if (!x.changes) throw new ApiError(404, "not_found", "Conversation not found.");
    return { status: 204 };
  }, { auth: true });
}
module.exports = { createConversations, routes };
