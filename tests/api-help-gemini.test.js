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
  s = await startServer({ GEMINI_API_KEY: "test-key", GEMINI_BASE_URL: g.url, GEMINI_MODEL: "gemini-3.5-flash-lite", AI_USER_DAILY: "20", GEMINI_RPM: "100" });
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
  assert.equal(call.body.generationConfig.responseMimeType, undefined, "plain Markdown answers (JSON mode cut long answers off)");
  assert.ok(g.seen.some(x => /batchEmbedContents/.test(x.url) && x.body.requests[0].taskType === "RETRIEVAL_QUERY"), "the question is embedded for semantic search");
});
test("help: Hinglish and spelling mistakes still find the right part of the guide", async () => {
  g.seen = []; g.respond = () => ({ text: JSON.stringify({ found: true, kind: "website", answer: "Task ke row par bin button dabaiye.", sources: [1] }) });
  for (const q of ["task kaise delete kare", "how to delte a taks"]) { await ask(a, q); assert.match(g.chats().pop().body.systemInstruction.parts[0].text, /bin \(trash\)/, q); }
});
test("help: answers any general question with Gemini (default 'answer anything' mode)", async () => {
  g.seen = []; g.respond = () => ({ text: JSON.stringify({ found: true, kind: "general", answer: "Paris is the capital of France.", sources: [] }) });
  const r = await ask(a, "What is the capital of France?");
  assert.equal(r.json.message.found, true); assert.equal(r.json.message.kind, "general"); assert.match(r.json.message.text, /Paris/);
  assert.match(g.chats().pop().body.systemInstruction.parts[0].text, /any other question/i, "the prompt allows any topic");
});
test("help: website features still come only from the guide; the model can't invent one", async () => {
  g.respond = () => ({ text: JSON.stringify({ found: true, kind: "website", answer: "Use the Teleport button.", sources: [] }) });
  const r = await ask(a, "How do I teleport my tasks to Jupiter?");
  assert.match(r.json.message.text, /don't know/); assert.doesNotMatch(r.json.message.text, /Teleport/);
  assert.ok((await admin.get("/api/admin/questions")).json.unanswered.some(x => /teleport/i.test(x.question)), "the admin sees it");
  g.respond = () => ({ text: JSON.stringify({ found: false, kind: "other", answer: "", sources: [] }) });
  assert.match((await ask(a, "zxqv blorp?")).json.message.text, /don't know/, "if the model can't answer, it says so");
});
test("admin: 'focused' mode limits Help to the website and productivity tips", async () => {
  assert.equal((await admin.get("/api/admin/settings")).json.scope, "all");
  assert.equal((await admin.put("/api/admin/settings", { scope: "everything" })).status, 400);
  assert.equal((await admin.put("/api/admin/settings", { scope: "focused" })).status, 200);
  g.respond = () => ({ text: JSON.stringify({ found: true, kind: "general", answer: "Paris.", sources: [] }) });
  const sys = (await ask(a, "What is the capital of France?"), g.chats().pop().body.systemInstruction.parts[0].text);
  assert.match(sys, /Anything else[^\n]*NOT_IN_GUIDE/);
  g.respond = () => ({ text: JSON.stringify({ found: false, kind: "other", answer: "", sources: [] }) });
  assert.match((await ask(a, "Who won the cricket match yesterday?")).json.message.text, /don't know/);
  await admin.put("/api/admin/settings", { scope: "all" });
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
  // Plain text is now the normal answer format (it used to be thrown away because it wasn't JSON).
  g.respond = () => ({ text: "Tick the round box next to the task." });
  const r2 = await ask(a, "How do I mark a task as complete?");
  assert.equal(r2.json.message.via, "ai"); assert.match(r2.json.message.text, /round box/);
  g.respond = () => ({ text: "" });
  const r3 = await ask(a, "How do I change a deadline?"); assert.equal(r3.status, 200); assert.equal(r3.json.message.via, "kb");
  const u = (await admin.get("/api/admin/usage")).json; assert.ok(u.days[0].quota >= 1 && u.days[0].error >= 1);
});
test("limits: each user has a daily AI allowance; after it, answers come from the guide", async () => {
  const c = await signup(s.base, "Kiran", "kiran@example.com");
  g.respond = () => ({ text: JSON.stringify({ found: true, kind: "website", answer: "ok", sources: [1] }) });
  let last; for (let k = 0; k < 21; k++) last = await ask(c, "How do reminders work?");
  assert.equal(last.json.message.via, "kb"); assert.match(last.json.message.text, /used your 20 AI answers/);
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

/* ---------- Reply language (bug: an English question got a Hinglish answer) ---------- */
// The old prompt said "If the user writes in Hinglish, reply in Hinglish" and also sent the earlier Help messages,
// so one Hinglish question earlier made later English questions come back in Hinglish.
const sysOf = () => g.chats().pop().body.systemInstruction.parts[0].text;
test("language: an English question gets an English answer, even after earlier Hinglish messages", async () => {
  const c = await signup(s.base, "Lang", "lang@example.com");
  g.respond = () => ({ text: JSON.stringify({ found: true, kind: "general", answer: "ok", sources: [] }) });
  const r1 = await ask(c, "task kaise delete kare bhai, mujhe samajh nahi aa raha");
  assert.match(sysOf(), /LATEST message is in Hinglish/);
  await ask(c, "How do I set a reminder for tomorrow?", r1.json.conversationId);
  const sys = sysOf();
  assert.match(sys, /LATEST message is in English/);
  assert.match(sys, /Reply in English/);
  assert.doesNotMatch(sys, /If the user writes in Hinglish, reply in simple Hinglish; otherwise reply in English\./, "the old rule is gone from the default");
});
test("language: Hindi in Devanagari gets Hindi; the rule can't be removed by the admin's instructions", async () => {
  const c = await signup(s.base, "Lang2", "lang2@example.com");
  g.respond = () => ({ text: JSON.stringify({ found: true, kind: "general", answer: "ok", sources: [] }) });
  await ask(c, "मैं पढ़ाई का समय कैसे बनाऊँ?");
  assert.match(sysOf(), /LATEST message is in Hindi/);
  assert.equal((await admin.put("/api/admin/settings", { instructions: "Always answer in Hinglish." })).status, 200);
  try {
    await ask(c, "What is a good way to plan my week?");
    const sys = sysOf();
    assert.ok(sys.indexOf("Always answer in Hinglish.") < sys.indexOf("LATEST message is in English"), "the fixed language rule comes after the admin's text");
    assert.match(sys, /This rule overrides/);
  } finally { await admin.put("/api/admin/settings", { instructions: (await admin.get("/api/admin/settings")).json.default }); }
});


/* ---------- General assistant (9 Nov 2026): why answers went missing, and the fixes ----------
   Answers had to be a JSON object capped at 900 tokens. Long answers (timetables, code) were cut off, the JSON
   broke, and people saw "I don't know" or a pasted help-guide paragraph instead. Code was also forbidden, and
   "$" inside code was turned into "₹". Now: plain Markdown, room for long answers, code allowed and left alone. */
const lastBody = () => g.chats().pop().body;
test("general assistant: code answers keep their code blocks and $ signs; no JSON wrapper; room for long answers", async () => {
  const c = await signup(s.base, "Coder", "coder@example.com");
  g.respond = () => ({ text: "Here's a function:\n\n```js\nconst greet = name => `Hi ${name}`;\nconsole.log(\"$5\");\n```\n\nIt costs $5 to run." });
  const r = await ask(c, "Write a JavaScript function that greets someone");
  const t = r.json.message.text;
  assert.match(t, /```js\nconst greet = name => `Hi \$\{name\}`;\nconsole\.log\("\$5"\);\n```/, "code untouched: " + t);
  assert.match(t, /It costs ₹5 to run\./, "money outside code still in rupees");
  assert.equal(r.json.message.found, true); assert.equal(r.json.message.via, "ai"); assert.equal(r.json.message.kind, "general");
  const b = lastBody();
  assert.equal(b.generationConfig.responseMimeType, undefined, "no JSON mode");
  assert.ok(b.generationConfig.maxOutputTokens >= 4096, "room for long answers: " + b.generationConfig.maxOutputTokens);
  assert.match(b.systemInstruction.parts[0].text, /code block/i, "code is allowed");
});
test("general assistant: a greeting gets a friendly answer, not 'I don't know'", async () => {
  g.respond = () => ({ text: "Hello! How can I help you today?" });
  const r = await ask(a, "hallo");
  assert.match(r.json.message.text, /Hello! How can I help/); assert.equal(r.json.message.found, true);
});
test("general assistant: long answers are kept whole; an answer cut off at the length limit is shown with a note", async () => {
  const long = "## Timetable\n" + Array.from({ length: 300 }, (_, i) => `- Day ${i % 7 + 1}: study block ${i}`).join("\n");
  g.respond = () => ({ text: long });
  const r = await ask(a, "Make me a study timetable for the next seven days");
  assert.ok(r.json.message.text.length >= long.length - 5, `kept ${r.json.message.text.length} of ${long.length}`);
  g.respond = () => ({ text: "Part one of a very long answer", finishReason: "MAX_TOKENS" });
  const r2 = await ask(a, "Explain the whole history of computing");
  assert.match(r2.json.message.text, /Part one/); assert.match(r2.json.message.text, /cut short/i);
});
test("website answers: a 'Sources:' line becomes the help-guide note; NOT_IN_GUIDE becomes an honest answer the admin sees", async () => {
  g.respond = () => ({ text: "Open the bell at the top to see reminders.\n\nSources: [1]" });
  const r = await ask(a, "How do reminders work?");
  assert.doesNotMatch(r.json.message.text, /Sources:/); assert.equal(r.json.message.sources.length, 1); assert.equal(r.json.message.kind, "website");
  g.respond = () => ({ text: "NOT_IN_GUIDE" });
  const r2 = await ask(a, "How do I export my tasks to a smartwatch in Deadline Tracker?");
  assert.match(r2.json.message.text, /help guide doesn't cover/i); assert.equal(r2.json.message.found, false);
  assert.ok((await admin.get("/api/admin/questions")).json.unanswered.some(x => /smartwatch/.test(x.question)));
});
test("follow-ups: the last 12 messages of the conversation go with each question", async () => {
  const c = await signup(s.base, "Follow", "follow@example.com");
  g.respond = () => ({ text: "Answer." });
  let conv; for (let k = 1; k <= 8; k++) { const r = await ask(c, "Question number " + k, conv); conv = r.json.conversationId; }
  const b = lastBody();
  assert.equal(b.contents.length, 13, "12 earlier messages + the new question");
  assert.equal(b.contents[b.contents.length - 1].parts[0].text, "Question number 8");
});
test("a slow AI: the server stops waiting at its time limit and offers 'Try again'", async () => {
  const s4 = await startServer({ GEMINI_API_KEY: "test-key", GEMINI_BASE_URL: g.url, GEMINI_TIMEOUT_MS: "400" });
  try {
    const c = await signup(s4.base, "Slow", "slow@example.com");
    g.respond = () => ({ text: "late", delay: 1500 });
    const t0 = Date.now(); const r = await ask(c, "What is photosynthesis?");
    assert.ok(Date.now() - t0 < 3000, "doesn't hang");
    assert.equal(r.json.message.error, "timeout"); assert.equal(r.json.message.retry, "What is photosynthesis?");
    assert.match(r.json.message.text, /took too long/i);
  } finally { s4.stop(); }
});

test("website answers: guide numbers written inside sentences ('… study hours [4].') become sources, not text", async () => {
  // seen live on 9 Nov: Gemini cited "[4]" in the middle of a sentence instead of in a last "Sources:" line
  g.respond = () => ({ text: "Open the bell at the top to see reminders [1]. They also arrive by email if you turn it on [1][2].\n\n```python\nprint(items[1])\n```" });
  const c = await signup(s.base, "Cite", "cite@example.com");   // its own user: the shared one has used its daily AI allowance by now
  const r = await ask(c, "How do reminders work?");
  const t = r.json.message.text;
  assert.doesNotMatch(t.replace(/```[\s\S]*?```/g, ""), /\[\d+\]/, "no [n] left in the text: " + t);
  assert.match(t, /see reminders\. They also arrive by email if you turn it on\./);
  assert.match(t, /print\(items\[1\]\)/, "code is untouched");
  assert.ok(r.json.message.sources.length >= 1); assert.equal(r.json.message.kind, "website");
});
