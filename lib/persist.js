// Permanent storage for hosts whose disk is wiped on restart (Render's free plan wipes it when the service
// sleeps, restarts or redeploys; that's what made accounts disappear and correct passwords "fail").
//
// With DATABASE_URL set to a Neon Postgres connection string:
//   - on start, the saved copy of the SQLite database is loaded from Neon *before* the server opens it;
//   - a few seconds after anything changes, a compressed copy is saved back to Neon (and once more on shutdown).
// The app keeps using SQLite in-process (fast, all existing code and tests unchanged); Neon holds the durable copy.
// It talks to Neon over HTTPS ("SQL over HTTP": POST https://<endpoint-host>/sql), so no database driver is needed.
//
// Safety rules
//   - Nothing is ever saved until the saved copy has been loaded (or Neon confirmed there is none), so a network
//     problem at start can't overwrite real data with an empty database.
//   - Loading is retried for up to PERSIST_START_TIMEOUT_MS (60 s). If Neon still can't be used, the server starts
//     anyway without saving to Neon ("fallback"), shows the reason in /api/health, and checks again every
//     PERSIST_RECHECK_MS: if Neon then turns out to be empty, saving starts; if it holds a saved copy, that copy is
//     never overwritten and /api/health asks for a restart so it gets loaded. (Before this, the server waited
//     forever and never opened its port, so every Render deploy failed and the old server kept running.)
//   - Every save is version-checked. During a redeploy two servers run for a moment; the newer one wins and the
//     older one stops saving.
// Limits: one server instance; a change made in the last few seconds before a crash (not a normal shutdown) can be
// lost; the whole database is copied each time, which is fine up to a few MB (warned in /api/health above 8 MB).
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const crypto = require("crypto");

function neonEndpoint(dbUrl){
  const u = new URL(dbUrl);
  if (!/^postgres(ql)?:$/.test(u.protocol)) throw new Error("DATABASE_URL must start with postgresql://");
  const host = u.hostname.replace(/^([^.]+)-pooler\./, "$1."); // the HTTP endpoint uses the direct host
  return `https://${host}/sql`;
}

function createPersistence({ dbUrl, httpUrl, dataDir, intervalMs = 3000, retryMs = 3000, startTimeoutMs = 60000, recheckMs = 30000, log = () => {}, fetchImpl = fetch }){
  const enabled = !!dbUrl;
  const dbFile = path.join(dataDir, "deadline.db");
  const instance = crypto.randomBytes(6).toString("hex"), startedAt = Date.now();
  const st = { mode: enabled ? "neon" : "local", restored: false, fallback: false, version: 0, lastSavedAt: null, lastError: null, sizeKB: null, stoppedBecauseNewer: false, saving: false };
  let endpoint = null, db = null, timer = null, recheck = null, lastChanges = -1, pending = null, badUrl = null;
  if (enabled) { try { endpoint = httpUrl || neonEndpoint(dbUrl); } catch (e) { badUrl = "DATABASE_URL isn't a Neon connection string. It should look like postgresql://user:password@ep-....neon.tech/neondb?sslmode=require (copy it from Neon's Connect dialog)."; } }
  const safeMsg = e => String(e && e.message || e).split(dbUrl).join("[DATABASE_URL]").slice(0, 300);

  async function sql(query, params = []){
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 20000);
    try {
      const r = await fetchImpl(endpoint, { method: "POST", signal: ctrl.signal,
        headers: { "Content-Type": "application/json", "Neon-Connection-String": dbUrl, "Neon-Raw-Text-Output": "true", "Neon-Array-Mode": "true" },
        body: JSON.stringify({ query, params: params.map(p => p == null ? null : String(p)) }) });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(`Neon error ${r.status}: ${(j && j.message) || "no details"}`);
      const fields = (j && j.fields || []).map(f => f.name);
      return (j && j.rows || []).map(row => Array.isArray(row) ? Object.fromEntries(fields.map((n, i) => [n, row[i]])) : row);
    } catch (e) { throw new Error(e.name === "AbortError" ? "Neon didn't answer in time" : safeMsg(e)); }
    finally { clearTimeout(t); }
  }

  // Load the saved copy into data/deadline.db. Retries until Neon answers or startTimeoutMs passes; then the
  // server starts without saving to Neon (fallback) and recheck() keeps trying in the background.
  async function restore(){
    if (!enabled) return;
    fs.mkdirSync(dataDir, { recursive: true });
    if (badUrl) { st.lastError = badUrl; st.fallback = true; console.error("[persist] " + badUrl + " Starting without permanent storage."); return; }
    const giveUpAt = Date.now() + startTimeoutMs;
    for (let attempt = 1; ; attempt++) {
      try {
        await sql("CREATE TABLE IF NOT EXISTS dt_snapshot (id INT PRIMARY KEY, data TEXT NOT NULL, version BIGINT NOT NULL, instance TEXT NOT NULL, started_at BIGINT NOT NULL, saved_at BIGINT NOT NULL)");
        const rows = await sql("SELECT data, version, instance, started_at FROM dt_snapshot WHERE id = 1");
        for (const f of [dbFile, dbFile + "-wal", dbFile + "-shm"]) { try { fs.unlinkSync(f); } catch (e) {} }
        if (rows.length) {
          const buf = zlib.gunzipSync(Buffer.from(rows[0].data, "base64"));
          fs.writeFileSync(dbFile, buf);
          st.version = Number(rows[0].version); st.sizeKB = Math.round(buf.length / 1024);
        } else st.version = 0;
        st.restored = true; st.lastError = null;
        return;
      } catch (e) {
        st.lastError = safeMsg(e);
        if (Date.now() >= giveUpAt) {
          st.fallback = true;
          console.error(`[persist] Neon still can't be used after ${Math.round(startTimeoutMs / 1000)} s (${st.lastError}). Starting WITHOUT permanent storage; nothing is saved to Neon until it answers. See /api/health.`);
          return;
        }
        console.error(`[persist] couldn't load the saved database from Neon (attempt ${attempt}): ${st.lastError}. Retrying...`);
        await new Promise(r => setTimeout(r, Math.min(retryMs * attempt, 30000, Math.max(50, giveUpAt - Date.now()))));
      }
    }
  }

  async function save(){
    if (!enabled || !db || !st.restored || st.stoppedBecauseNewer) return;
    if (st.saving) { pending = true; return; }
    st.saving = true; pending = false;
    try {
      const changes = db.prepare("SELECT total_changes() AS n").get().n;
      const tmp = path.join(dataDir, `.snapshot-${instance}.db`);
      try { fs.unlinkSync(tmp); } catch (e) {}
      db.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`);   // a consistent copy, even while the app keeps running
      const raw = fs.readFileSync(tmp); fs.unlinkSync(tmp);
      const data = zlib.gzipSync(raw, { level: 9 }).toString("base64");
      const now = Date.now();
      let rows;
      if (st.version === 0) rows = await sql("INSERT INTO dt_snapshot (id, data, version, instance, started_at, saved_at) VALUES (1, $1, 1, $2, $3, $4) ON CONFLICT (id) DO NOTHING RETURNING version", [data, instance, startedAt, now]);
      else rows = await sql("UPDATE dt_snapshot SET data = $1, version = version + 1, instance = $2, started_at = $3, saved_at = $4 WHERE id = 1 AND version = $5 RETURNING version", [data, instance, startedAt, now, st.version]);
      if (!rows.length) {
        // someone else saved since we loaded: the newer server keeps saving, the older one stops
        const cur = (await sql("SELECT data, version, instance, started_at FROM dt_snapshot WHERE id = 1"))[0];
        if (cur && cur.instance !== instance && Number(cur.started_at) > startedAt) {
          st.stoppedBecauseNewer = true;
          st.newer = { instance: String(cur.instance).slice(0, 6), startedAt: new Date(Number(cur.started_at)).toISOString() };
          console.error(`[persist] a newer server (${st.newer.instance}, started ${st.newer.startedAt}) is saving to the same database; this one (${instance.slice(0, 6)}, started ${new Date(startedAt).toISOString()}) stops saving to avoid overwriting it.`);
          return;
        }
        rows = await sql("UPDATE dt_snapshot SET data = $1, version = version + 1, instance = $2, started_at = $3, saved_at = $4 WHERE id = 1 RETURNING version", [data, instance, startedAt, now]);
      }
      st.version = Number(rows[0].version); st.lastSavedAt = new Date(now).toISOString(); st.sizeKB = Math.round(raw.length / 1024); st.lastError = null;
      lastChanges = changes;
      if (raw.length > 8 * 1024 * 1024) log("persist", new Error(`The database is ${st.sizeKB} KB; copies to Neon get slow above a few MB.`));
    } catch (e) { st.lastError = safeMsg(e); log("persist", new Error("Saving to Neon failed: " + st.lastError)); }
    finally { st.saving = false; if (pending) setTimeout(save, 200); }
  }
  // After a fallback start: is Neon usable now? Empty -> start saving. Holding a saved copy -> never overwrite it.
  async function check(){
    if (!st.fallback || badUrl) return;
    try {
      await sql("CREATE TABLE IF NOT EXISTS dt_snapshot (id INT PRIMARY KEY, data TEXT NOT NULL, version BIGINT NOT NULL, instance TEXT NOT NULL, started_at BIGINT NOT NULL, saved_at BIGINT NOT NULL)");
      const rows = await sql("SELECT data, version, instance, started_at FROM dt_snapshot WHERE id = 1");
      clearInterval(recheck); recheck = null;
      if (rows.length) {
        st.lastError = "Neon answers now and holds a saved copy that wasn't loaded when this server started. Restart the service (Render: Manual Deploy → Restart) to load it; this server won't overwrite it.";
        console.error("[persist] " + st.lastError);
        return;
      }
      st.fallback = false; st.restored = true; st.version = 0; st.lastError = null;
      console.log("[persist] Neon answers now and is empty: saving to it from now on.");
      tick();
    } catch (e) { st.lastError = safeMsg(e); }
  }
  function tick(){
    if (!db) return;
    let n; try { n = db.prepare("SELECT total_changes() AS n").get().n; } catch (e) { return; }
    if (n !== lastChanges) save();
  }
  return {
    enabled, restore,
    start(database){ db = database; if (!enabled) return; timer = setInterval(tick, intervalMs); timer.unref(); if (st.fallback && !badUrl) { recheck = setInterval(check, recheckMs); recheck.unref(); } tick(); },
    async stop(){ clearInterval(timer); clearInterval(recheck); if (enabled && db) { tick(); for (let k = 0; k < 50 && (st.saving || pending); k++) await new Promise(r => setTimeout(r, 100)); } },
    status: () => ({ mode: st.mode, restored: enabled ? st.restored : null, fallback: st.fallback || undefined, lastSavedAt: st.lastSavedAt, sizeKB: st.sizeKB, ok: !st.lastError && !st.fallback, error: st.lastError, stoppedBecauseNewer: st.stoppedBecauseNewer || undefined,
      // which server this is, and (when stopped) which newer one took over, so two writers can be told apart
      instance: enabled ? { id: instance.slice(0, 6), startedAt: new Date(startedAt).toISOString() } : undefined, newer: st.newer || undefined })
  };
}
module.exports = { createPersistence, neonEndpoint };
