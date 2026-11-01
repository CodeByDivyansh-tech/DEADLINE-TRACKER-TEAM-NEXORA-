// Deadline AI Help with Google Gemini (a fake Gemini API stands in): RAG retrieval, answers with sources,
// unknown questions, general tips, quota and error handling, limits, privacy of tasks, history, ratings.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");
const { startServer, signup, fakeGemini } = require("./srv");

let g, s, a, admin;
const ask = (c, message, conversationId) => c.post("/api/chat", { message, conversationId });
before(async () => {
  g = await fakeGemini().start();
  s = await startServer({ GEMINI_API_KEY: "test-key", GEMINI_BASE_URL: g.url, GEMINI_MODEL: "gemini-3.5-flash-lite", AI_USER_DAILY: "12", GEMINI_RPM: "100" });
  admin = await signup(s.base, "Admin", "admin@example.com"); a = await signup(s.base, "Riya", "riya@example.com");
  for (let k = 0; k < 40; k++) { const o = (await admin.get("/api/admin/overview")).json; if (o.knowledge.embedded === o.knowledge.chunks && o.knowledge.chunks) break; await new Promise(r => setTimeout(r, 100)); }
});
after(() => { s.stop(); g.close(); });

test("RAG: the help guide is chunked and embedded with Gemini, stored as vectors", async () => {
  const db = new DatabaseSync(path.join(s.dataDir, "deadline.db"));
  const c = db.prepare("SELECT COUNT(*) n, SUM(embedding IS NOT NULL) e FROM kb_chunks").get();
  assert.ok(c.n > 20); assert.equal(c.e, c.n, "every chunk has a vector");
  assert.equal(db.prepare("SELECT DISTINCT embed_model m FROM kb_chunks").get().m, "gemini-embedding-001");
  db.close();
  const e = g.seen.find(x => /batchEmbedContents/.test(x.url));
  assert.equal(e.body.requests[0].taskType, "RETRIEVAL_DOCUMENT"); assert.equal(e.headers["x-goog-api-key"], "test-key");
});
test("help: a website question is answered by Gemini from the matching guide text only, with sources", async () => {
  g.seen = []; g.respond = () => ({ text: JSON.stringify({ found: true, kind: "website", answer: "Press the bin button on the task row. Press Undo if it was a mistake.", sources: [1] }) });
  const r = await ask(a, "How do I delete a task?");
  assert.equal(r.status, 200); const m = r.json.message;
  assert.equal(m.via, "ai"); assert.equal(m.found, true); assert.match(m.text, /bin button/); assert.ok(m.sources.length);
  const call = g.chats()[0];
  assert.match(call.url, /models\/gemini-3\.5-flash-lite:generateContent$/);
  const sys = call.body.systemInstruction.parts[0].text;
  assert.match(sys, /answer ONLY from the HELP GUIDE/); assert.match(sys, /bin \(trash\)/, "the retrieved section is in the prompt");
  assert.doesNotMatch(sys, /Workload page shows/, "unrelated sections aren't sent");
  assert.equal(call.body.generationConfig.responseMimeType, "application/json");
  assert.ok(g.seen.some(x => /batchEmbedContents/.test(x.url) && x.body.requests[0].taskType === "RETRIEVAL_QUERY"), "the question is embedded for semantic search");
});
test("help: Hinglish and spelling mistakes still find the right part of the guide", async () => {
  g.seen = []; g.respond = () => ({ text: JSON.stringify({ found: true, kind: "website", answer: "Task ke row par bin button dabaiye.", sources: [1] }) });
  for (const q of ["task kaise delete kare", "how to delte a taks"]) { await ask(a, q); assert.match(g.chats().pop().body.systemInstruction.parts[0].text, /bin \(trash\)/, q); }
});
test("help: unknown questions get an honest 'I don't know' and are listed for the admin", async () => {
  g.respond = () => ({ text: JSON.stringify({ found: false, kind: "other", answer: "", sources: [] }) });
  const r = await ask(a, "Who won the cricket match yesterday?");
  assert.equal(r.json.message.found, false); assert.match(r.json.message.text, /don't know/);
  assert.ok((await admin.get("/api/admin/questions")).json.unanswered.some(x => /cricket/.test(x.question)));
  // even if the model claims to know a website feature the guide doesn't have, it isn't shown
  g.respond = () => ({ text: JSON.stringify({ found: true, kind: "website", answer: "Use the Teleport button.", sources: [] }) });
  const r2 = await ask(a, "How do I teleport my tasks to Jupiter?");
  assert.match(r2.json.message.text, /don't know/); assert.doesNotMatch(r2.json.message.text, /Teleport/);
});
test("help: general productivity tips are allowed without the guide", async () => {
  g.respond = () => ({ text: JSON.stringify({ found: true, kind: "general", answer: "Try 25-minute focus blocks with short breaks.", sources: [] }) });
  const r = await ask(a, "How can I stop procrastinating?");
  assert.equal(r.json.message.found, true); assert.equal(r.json.message.kind, "general"); assert.match(r.json.message.text, /focus blocks/);
});
test("privacy: Help never sends the user's tasks to Gemini", async () => {
  await a.post("/api/tasks", { title: "SECRET-medical-appointment", description: "PRIVATE-NOTE" });
  g.seen = []; g.respond = () => ({ text: JSON.stringify({ found: true, kind: "website", answer: "Use the My Plan tab for that.", sources: [] }) });
  await ask(a, "What tasks do I have?"); await ask(a, "How do reminders work?");
  assert.ok(g.seen.length > 0);
  for (const x of g.seen) assert.doesNotMatch(x.raw, /SECRET-medical|PRIVATE-NOTE/);
});
test("help: follow-up questions use the conversation, stored per user", async () => {
  g.seen = []; g.respond = () => ({ text: JSON.stringify({ found: true, kind: "website", answer: "Press Undo straight after.", sources: [1] }) });
  const r1 = await ask(a, "How do I delete a task?");
  const r2 = await ask(a, "and if it was a mistake?", r1.json.conversationId);
  assert.equal(r2.json.conversationId, r1.json.conversationId);
  const b = g.chats().pop().body;
  assert.equal(b.contents[0].parts[0].text, "How do I delete a task?"); assert.equal(b.contents[1].role, "model"); assert.equal(b.contents[b.contents.length - 1].parts[0].text, "and if it was a mistake?");
  const hist = (await a.get(`/api/conversations/${r1.json.conversationId}/messages`)).json.messages; assert.equal(hist.length, 4);
  const other = await signup(s.base, "Om", "om@example.com");
  assert.equal((await other.get(`/api/conversations/${r1.json.conversationId}/messages`)).status, 404);
  assert.equal((await ask(other, "hi", r1.json.conversationId)).status, 404);
});
test("errors: quota (429) pauses AI calls and still shows the guide; bad and empty answers are handled", async () => {
  g.respond = () => ({ status: 429, error: { error: { code: 429, status: "RESOURCE_EXHAUSTED", message: "Quota exceeded", details: [{ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "2s" }] } } });
  const r = await ask(a, "How do reminders work?");
  assert.equal(r.status, 200); assert.equal(r.json.message.via, "kb"); assert.match(r.json.message.text, /free AI limit/); assert.match(r.json.message.text, /bell/i, "the matching guide text is shown");
  const n = g.chats().length; await ask(a, "How do I create a task?"); assert.equal(g.chats().length, n, "no calls while paused");
  await new Promise(x => setTimeout(x, 2100));
  g.respond = () => ({ text: "Sure! Here is some text that is not JSON." });
  const r2 = await ask(a, "How do I mark a task as complete?");
  assert.equal(r2.json.message.via, "kb", "unchecked text isn't shown; the guide is"); assert.match(r2.json.message.text, /round box/);
  g.respond = () => ({ text: "" });
  const r3 = await ask(a, "How do I change a deadline?"); assert.equal(r3.status, 200); assert.equal(r3.json.message.via, "kb");
  const u = (await admin.get("/api/admin/usage")).json; assert.ok(u.days[0].quota >= 1 && u.days[0].error >= 1);
});
test("limits: each user has a daily AI allowance; after it, answers come from the guide", async () => {
  const c = await signup(s.base, "Kiran", "kiran@example.com");
  g.respond = () => ({ text: JSON.stringify({ found: true, kind: "website", answer: "ok", sources: [1] }) });
  let last; for (let k = 0; k < 13; k++) last = await ask(c, "How do reminders work?");
  assert.equal(last.json.message.via, "kb"); assert.match(last.json.message.text, /used your 12 AI answers/);
});
test("a bad API key is reported clearly", async () => {
  const s2 = await startServer({ GEMINI_API_KEY: "bad-key", GEMINI_BASE_URL: g.url });
  try { const c = await signup(s2.base, "X", "x@example.com");
    const r = await ask(c, "How do reminders work?"); assert.equal(r.json.message.via, "kb"); assert.match(r.json.message.text, /key on the server isn't valid/);
    assert.ok((await c.get("/api/admin/errors")).json.errors.some(e => /isn't valid/.test(e.message)));
  } finally { s2.stop(); }
});
test("ratings: users rate answers; the admin sees them; you can't rate someone else's", async () => {
  g.respond = () => ({ text: JSON.stringify({ found: true, kind: "website", answer: "ok", sources: [1] }) });
  const m = (await ask(a, "How do I create a task?")).json.message;
  assert.equal((await a.post("/api/chat/rate", { id: m.qid, rating: -1 })).status, 200);
  assert.equal((await admin.post("/api/chat/rate", { id: m.qid, rating: 1 })).status, 404);
  assert.ok((await admin.get("/api/admin/questions")).json.rated.some(x => x.id === m.qid && x.rating === -1));
});
test("without a Gemini key, Help answers straight from the guide (labelled), and says when it doesn't know", async () => {
  const s3 = await startServer({});
  try { const c = await signup(s3.base, "Y", "y@example.com");
    const r = await ask(c, "How do I delete a task?"); assert.equal(r.json.message.via, "kb"); assert.match(r.json.message.text, /bin/);
    assert.match((await ask(c, "What's the capital of France?")).json.message.text, /don't know/);
  } finally { s3.stop(); }
});
