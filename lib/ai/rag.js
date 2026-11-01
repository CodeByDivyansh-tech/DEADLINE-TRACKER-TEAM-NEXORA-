// Knowledge base for website help (retrieval-augmented generation).
// 1 collect: Markdown files in /knowledge on first run, then whatever the admin adds or uploads
// 2 process: clean text      3 chunk: by heading, long sections in overlapping ~150-word pieces
// 4 embed: Gemini embeddings (when a key is set)      5 store: vectors in SQLite (kb_chunks.embedding)
// 6 retrieve: meaning (cosine similarity) + keywords (BM25, with Hinglish words and spelling fixes)
// 7 the help answer is written by Gemini from the retrieved chunks only (see help.js)
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

/* ---------- words, Hinglish, spelling ---------- */
const STOP = new Set(("a an the is are was were be been am do does did to of in on at for by with and or but if it its this that these those i me my we our you your he she they them can could would should will shall how what when where why which who whom there here from as into about up down out so than then too very just also not no yes please " +
  "hai ho hain kya ka ki ke ko se me mein main mai mera meri mere hum tum aap kar karo karna karne karte kare kaise pe par sakta sakti skta hu hoon hun bhi na nahi chahiye chahte wala wali raha rahi").split(" "));
const SYN = { kaise: "how", kese: "how", kab: "when", kahan: "where", kyu: "why", kyun: "why", hatana: "delete", hatao: "delete", mitana: "delete", remove: "delete", erase: "delete", trash: "delete", bin: "delete",
  banana: "create", banao: "create", banaye: "create", jodna: "add", jodo: "add", dalna: "add", dalo: "add", make: "create", new: "create", naya: "create", nayi: "create",
  kaam: "task", kam: "task", todo: "task", tasks: "task", item: "task", khatam: "complete", poora: "complete", pura: "complete", finish: "complete", done: "complete", tick: "complete",
  badalna: "edit", badlo: "edit", change: "edit", modify: "edit", update: "edit", rename: "edit",
  yaad: "reminder", alert: "reminder", alerts: "reminder", notify: "reminder", notification: "reminder", notifications: "reminder", reminders: "reminder",
  aaj: "today", kal: "tomorrow", parso: "tomorrow", safe: "private", secure: "private", privacy: "private", security: "private",
  dark: "theme", light: "theme", signup: "account", register: "account", login: "log", logout: "log", signin: "log", password: "account",
  phone: "mobile", android: "mobile", iphone: "mobile", ai: "assistant", bot: "assistant", chatbot: "assistant", chat: "assistant", gemini: "assistant" };
const words = t => String(t || "").toLowerCase().match(/[a-z0-9]+(?:-[a-z0-9]+)?/g) || [];
const stem = w => w.length <= 4 ? w : (w.replace(/(ings|ing|edly|ed|es|s)$/, "") || w);
const terms = t => words(t).map(w => SYN[w] || w).filter(w => !STOP.has(w) && w.length > 1).map(stem);
function editDistance(a, b, max){
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i].concat(Array(b.length).fill(0)));
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1); // swapped letters
  }
  return d[a.length][b.length];
}

/* ---------- chunking ---------- */
function sections(title, body){
  const out = []; let head = title, buf = [];
  const push = () => { const t = buf.join("\n").trim(); if (t) out.push({ heading: head, text: t }); buf = []; };
  String(body).split(/\r?\n/).forEach(line => { const m = line.match(/^#{1,4}\s+(.*)$/); if (m) { push(); head = m[1].trim(); } else buf.push(line); });
  push();
  return out.length ? out : [{ heading: title, text: String(body).trim() }];
}
function chunk(src){
  if (src.kind === "faq") return [{ heading: src.title, text: src.body.trim() }];
  const out = [];
  sections(src.title, src.body).forEach(s => {
    const w = s.text.split(/\s+/);
    if (w.length <= 180) { out.push(s); return; }
    for (let i = 0; i < w.length; i += 150) out.push({ heading: s.heading, text: w.slice(Math.max(0, i - 30), i + 150).join(" ") });
  });
  return out;
}
const toBlob = v => Buffer.from(new Float32Array(v).buffer);
const fromBlob = b => b ? new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)) : null;
function cosine(a, b){ let d = 0, x = 0, y = 0; for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; x += a[i] * a[i]; y += b[i] * b[i]; } return x && y ? d / Math.sqrt(x * y) : 0; }

function createRag(db, gemini, { root, log, semMin = 0.62 }){
  const id = p => p + "_" + crypto.randomBytes(8).toString("base64url");
  const getSetting = k => { const r = db.prepare("SELECT v FROM settings WHERE k = ?").get(k); return r ? r.v : null; };
  const setSetting = (k, v) => db.prepare("INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").run(k, v);
  let index = null; const reset = () => { index = null; };

  // first run: the help guide that ships with the app
  if (!getSetting("kb_seeded")) {
    const dir = path.join(root, "knowledge");
    const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => /\.md$/i.test(f)).sort() : [];
    db.tx(() => files.forEach(f => {
      const body = fs.readFileSync(path.join(dir, f), "utf8");
      const title = (body.match(/^#\s+(.*)$/m) || [, f.replace(/\.md$/i, "")])[1].trim();
      const rest = body.replace(/^#\s+.*$/m, "").trim();
      if (/faq/i.test(f)) sections(title, rest).forEach(s => db.prepare("INSERT INTO kb_sources (id, kind, title, body, source, updated_at) VALUES (?, 'faq', ?, ?, ?, ?)").run(id("kb"), s.heading, s.text, f, Date.now()));
      else db.prepare("INSERT INTO kb_sources (id, kind, title, body, source, updated_at) VALUES (?, 'doc', ?, ?, ?, ?)").run(id("kb"), title, rest, f, Date.now());
    }));
    setSetting("kb_seeded", "1");
  }
  // (Re)build the chunks of one source, or of all sources. Embeddings are added when Gemini is configured.
  function rechunk(sourceId){
    const srcs = sourceId ? db.prepare("SELECT * FROM kb_sources WHERE id = ?").all(sourceId) : db.prepare("SELECT * FROM kb_sources").all();
    db.tx(() => srcs.forEach(s => {
      db.prepare("DELETE FROM kb_chunks WHERE source_id = ?").run(s.id);
      chunk(s).forEach((c, i) => db.prepare("INSERT INTO kb_chunks (id, source_id, ord, heading, text) VALUES (?, ?, ?, ?, ?)").run(id("ch"), s.id, i, c.heading, c.text));
      db.prepare("UPDATE kb_sources SET indexed_at = ? WHERE id = ?").run(Date.now(), s.id);
    }));
    reset();
  }
  async function embedMissing(){
    if (!gemini.configured()) return { embedded: 0, skipped: "no_key" };
    const rows = db.prepare("SELECT c.id, c.heading, c.text, s.title FROM kb_chunks c JOIN kb_sources s ON s.id = c.source_id WHERE c.embedding IS NULL OR c.embed_model IS NOT ?").all(gemini.embedModel);
    if (!rows.length) return { embedded: 0 };
    const vecs = await gemini.embed(rows.map(r => `${r.title} > ${r.heading}\n${r.text}`), "RETRIEVAL_DOCUMENT");
    db.tx(() => rows.forEach((r, i) => db.prepare("UPDATE kb_chunks SET embedding = ?, embed_model = ? WHERE id = ?").run(toBlob(vecs[i]), gemini.embedModel, r.id)));
    reset(); return { embedded: rows.length };
  }
  async function refresh({ all = false } = {}){
    if (all) rechunk();
    else { const stale = db.prepare("SELECT id FROM kb_sources WHERE indexed_at IS NULL OR indexed_at < updated_at").all(); stale.forEach(s => rechunk(s.id)); }
    try { return Object.assign({ ok: true }, await embedMissing()); } catch (e) { log("rag", e); return { ok: false, error: e.code || "error", message: e.message }; }
  }
  if (!db.prepare("SELECT 1 FROM kb_chunks LIMIT 1").get()) rechunk();

  function build(){
    const docs = db.prepare("SELECT c.id, c.heading, c.text, c.embedding, s.title, s.id AS source_id, s.kind FROM kb_chunks c JOIN kb_sources s ON s.id = c.source_id").all()
      .map(d => Object.assign(d, { vec: fromBlob(d.embedding), embedding: undefined }));
    const df = new Map(); let total = 0;
    docs.forEach(d => { const tk = terms(d.heading + " " + d.heading + " " + d.text); d.tf = new Map(); tk.forEach(t => d.tf.set(t, (d.tf.get(t) || 0) + 1)); d.len = tk.length; total += d.len; d.head = new Set(terms(d.heading)); new Set(tk).forEach(t => df.set(t, (df.get(t) || 0) + 1)); });
    return { docs, df, vocab: [...df.keys()], avg: total / Math.max(1, docs.length), N: docs.length };
  }
  const idx = () => index || (index = build());
  function keyword(q){
    const I = idx();
    const qt = [...new Set(terms(q).map(t => { if (I.df.has(t) || t.length < 4) return t; const max = t.length >= 7 ? 2 : 1; let best = null, bd = max + 1;
      for (const v of I.vocab) { if (Math.abs(v.length - t.length) > max) continue; const d = editDistance(t, v, max); if (d < bd) { bd = d; best = v; } } return best || t; }))];
    if (!qt.length) return [];
    const idf = t => Math.log(1 + (I.N - I.df.get(t) + .5) / (I.df.get(t) + .5));
    return I.docs.map(d => { let s = 0, matched = 0;
      qt.forEach(t => { const f = d.tf.get(t); if (!f) return; s += idf(t) * (f * 2.4) / (f + 1.4 * (.25 + .75 * d.len / I.avg)); matched++; if (d.head.has(t)) s += idf(t) * .8; });
      return { d, s, cover: matched / qt.length }; }).filter(x => x.s > 0).sort((a, b) => b.s - a.s);
  }
  const strong = h => (h.s >= 3 && h.cover >= .6) || (h.s >= 6 && h.cover >= .5);
  // Best matching chunks for a question. found=false means the guide doesn't cover it.
  async function retrieve(q, k = 4){
    const kw = keyword(q).slice(0, 12);
    let sem = [], semUsed = false;
    const I = idx();
    if (gemini.configured() && I.docs.some(d => d.vec)) {
      try { const [qv] = await gemini.embed([q], "RETRIEVAL_QUERY"); sem = I.docs.filter(d => d.vec).map(d => ({ d, c: cosine(qv, d.vec) })).sort((a, b) => b.c - a.c).slice(0, 12); semUsed = true; }
      catch (e) { log("rag", e); }
    }
    const kwOk = kw.length && strong(kw[0]); const semOk = sem.length && sem[0].c >= semMin;
    if (!kwOk && !semOk) return { hits: [], found: false, semantic: semUsed };
    // combine both rankings (reciprocal rank fusion), keeping only reasonable matches
    const score = new Map();
    if (kwOk) kw.filter(h => strong(h) || h.s >= kw[0].s * .6).forEach((h, i) => score.set(h.d.id, { d: h.d, s: (score.get(h.d.id) || { s: 0 }).s + 1 / (5 + i) }));
    if (semOk) sem.filter(h => h.c >= semMin - .05).forEach((h, i) => { const cur = score.get(h.d.id); score.set(h.d.id, { d: h.d, s: (cur ? cur.s : 0) + 1 / (5 + i) }); });
    const hits = [...score.values()].sort((a, b) => b.s - a.s).slice(0, k).map(x => x.d);
    return { hits, found: true, semantic: semUsed };
  }
  return { retrieve, refresh, rechunk, reset, embedMissing, chunk, sections };
}
module.exports = { createRag, chunk, sections, cosine, terms };
