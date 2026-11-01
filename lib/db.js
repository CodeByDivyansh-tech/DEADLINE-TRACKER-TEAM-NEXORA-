// Database: one SQLite file (built into Node 22.5+, nothing to install). Default location: data/deadline.db
// Schema changes are numbered migrations; each runs once, in order, inside a transaction.
const fs = require("fs");
const path = require("path");

// Node prints a one-line "SQLite is experimental" warning on some versions; hide only that one.
const emit = process.emitWarning;
process.emitWarning = function (w, ...a) { if (String(w && w.message || w).includes("SQLite")) return; return emit.call(process, w, ...a); };
const { DatabaseSync } = require("node:sqlite");

const MIGRATIONS = [
  { version: 1, name: "accounts, tasks, notifications, conversations, knowledge, monitoring", sql: `
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE CHECK (length(email) BETWEEN 3 AND 254),
      name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
      pass_hash TEXT NOT NULL, salt TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
      timezone TEXT NOT NULL DEFAULT 'UTC',
      notify_prefs TEXT NOT NULL DEFAULT '{}',
      disabled INTEGER NOT NULL DEFAULT 0 CHECK (disabled IN (0, 1)),
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);

    CREATE TABLE sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL);
    CREATE INDEX idx_sessions_user ON sessions(user_id);

    -- The app's workspaces, settings and preferences (everything except tasks), one row per user.
    CREATE TABLE app_state (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      json TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL);

    CREATE TABLE tasks (
      id TEXT PRIMARY KEY CHECK (length(id) BETWEEN 3 AND 64),
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      workspace_id TEXT NOT NULL,
      title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
      description TEXT NOT NULL DEFAULT '',
      due_date TEXT CHECK (due_date IS NULL OR due_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
      due_time TEXT CHECK (due_time IS NULL OR due_time GLOB '[0-2][0-9]:[0-5][0-9]'),
      due_at INTEGER,                      -- the deadline as a UTC moment (from due_date, due_time and the user's time zone)
      plan_date TEXT CHECK (plan_date IS NULL OR plan_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
      plan_time TEXT CHECK (plan_time IS NULL OR plan_time GLOB '[0-2][0-9]:[0-5][0-9]'),
      priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
      status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'doing', 'review', 'blocked', 'done')),
      category TEXT,
      estimate_hours REAL CHECK (estimate_hours IS NULL OR (estimate_hours >= 0 AND estimate_hours <= 1000)),
      progress INTEGER NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
      reminders TEXT,                      -- JSON list of minutes before the deadline, or NULL for the user's defaults
      extra TEXT NOT NULL DEFAULT '{}',    -- other app fields (milestones, links, log...)
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, completed_at INTEGER);
    CREATE INDEX idx_tasks_user_status ON tasks(user_id, status);
    CREATE INDEX idx_tasks_user_due ON tasks(user_id, due_at);
    CREATE INDEX idx_tasks_user_plan ON tasks(user_id, plan_date);
    CREATE INDEX idx_tasks_due_open ON tasks(due_at) WHERE status <> 'done';

    CREATE TABLE notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
      kind TEXT NOT NULL CHECK (kind IN ('reminder', 'due_today', 'overdue', 'summary', 'high_done')),
      message TEXT NOT NULL,
      scheduled_at INTEGER NOT NULL,       -- UTC milliseconds
      delivery_status TEXT NOT NULL DEFAULT 'pending' CHECK (delivery_status IN ('pending', 'delivered', 'skipped', 'cancelled')),
      delivered_at INTEGER, read_at INTEGER,
      channel TEXT NOT NULL DEFAULT 'in_app',
      dedupe_key TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      UNIQUE (user_id, dedupe_key));
    CREATE INDEX idx_notif_due ON notifications(delivery_status, scheduled_at);
    CREATE INDEX idx_notif_user ON notifications(user_id, delivery_status, scheduled_at);

    CREATE TABLE conversations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK (kind IN ('help', 'plan')),
      title TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    CREATE INDEX idx_conv_user ON conversations(user_id, kind, updated_at);
    CREATE TABLE messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
      text TEXT NOT NULL,
      meta TEXT NOT NULL DEFAULT '{}',     -- sources, proposal, via...
      created_at INTEGER NOT NULL);
    CREATE INDEX idx_msg_conv ON messages(conversation_id, created_at);

    -- Public knowledge for website help (never private user data).
    CREATE TABLE kb_sources (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL CHECK (kind IN ('doc', 'faq')),
      title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
      body TEXT NOT NULL,
      source TEXT, updated_at INTEGER NOT NULL, indexed_at INTEGER);
    CREATE TABLE kb_chunks (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL REFERENCES kb_sources(id) ON DELETE CASCADE,
      ord INTEGER NOT NULL, heading TEXT NOT NULL, text TEXT NOT NULL,
      embedding BLOB, embed_model TEXT);
    CREATE INDEX idx_chunks_source ON kb_chunks(source_id);

    -- Help questions, for the admin: unanswered ones, common ones and ratings.
    CREATE TABLE questions (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      question TEXT NOT NULL, answer TEXT,
      answered INTEGER NOT NULL CHECK (answered IN (0, 1, 2)),   -- 0 no, 1 yes, 2 resolved by the admin
      sources TEXT, rating INTEGER CHECK (rating IS NULL OR rating IN (-1, 1)), via TEXT,
      created_at INTEGER NOT NULL);
    CREATE INDEX idx_questions_created ON questions(created_at);

    CREATE TABLE ai_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT, kind TEXT NOT NULL, model TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('ok', 'quota', 'error', 'limited')),
      prompt_tokens INTEGER, output_tokens INTEGER, latency_ms INTEGER, error TEXT,
      created_at INTEGER NOT NULL);
    CREATE INDEX idx_usage_created ON ai_usage(created_at);

    CREATE TABLE error_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      area TEXT NOT NULL, message TEXT NOT NULL, detail TEXT, created_at INTEGER NOT NULL);
    CREATE INDEX idx_errors_created ON error_log(created_at);

    CREATE TABLE settings (k TEXT PRIMARY KEY, v TEXT NOT NULL);
  ` }
];

function openDb(dir){
  fs.mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(path.join(dir, "deadline.db"));
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at INTEGER NOT NULL)");
  const done = new Set(db.prepare("SELECT version FROM schema_migrations").all().map(r => r.version));
  for (const m of MIGRATIONS) {
    if (done.has(m.version)) continue;
    db.exec("BEGIN");
    try { db.exec(m.sql); db.prepare("INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)").run(m.version, m.name, Date.now()); db.exec("COMMIT"); }
    catch (e) { db.exec("ROLLBACK"); throw new Error(`Database migration ${m.version} failed: ${e.message}`); }
  }
  db.tx = fn => { db.exec("BEGIN"); try { const r = fn(); db.exec("COMMIT"); return r; } catch (e) { db.exec("ROLLBACK"); throw e; } };
  return db;
}
module.exports = { openDb, MIGRATIONS };
