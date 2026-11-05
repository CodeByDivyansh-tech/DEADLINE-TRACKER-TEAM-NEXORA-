// New help-guide pages that ship with a newer version reach existing servers; pages already there aren't touched.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");
const { startServer } = require("./srv");

test("knowledge: a guide page missing from an existing database is added on restart; edited pages stay", async () => {
  const s1 = await startServer({});
  const dir = s1.dataDir; s1.stop(); await new Promise(r => setTimeout(r, 400));
  const db = new DatabaseSync(path.join(dir, "deadline.db"));
  assert.ok(db.prepare("SELECT 1 FROM kb_sources WHERE source = '08-daily-tasks-and-settings.md'").get(), "seeded on the first run");
  db.prepare("DELETE FROM kb_sources WHERE source = '08-daily-tasks-and-settings.md'").run(); // as on a server set up before this page existed
  db.prepare("UPDATE kb_sources SET body = 'Edited by the admin' WHERE source = '02-tasks.md'").run();
  db.close();
  const s2 = await startServer({ DATA_DIR: dir });
  s2.stop(); await new Promise(r => setTimeout(r, 400));
  const db2 = new DatabaseSync(path.join(dir, "deadline.db"));
  const added = db2.prepare("SELECT title FROM kb_sources WHERE source = '08-daily-tasks-and-settings.md'").get();
  assert.equal(added && added.title, "Daily tasks, sounds and display settings");
  assert.ok(db2.prepare("SELECT COUNT(*) n FROM kb_chunks c JOIN kb_sources s ON s.id = c.source_id WHERE s.source = '08-daily-tasks-and-settings.md'").get().n > 3, "split into searchable parts");
  assert.equal(db2.prepare("SELECT body FROM kb_sources WHERE source = '02-tasks.md'").get().body, "Edited by the admin", "admin edits kept");
  assert.equal(db2.prepare("SELECT COUNT(*) n FROM kb_sources WHERE source = '02-tasks.md'").get().n, 1, "no duplicates");
  db2.close();
});
