// Deadline AI (Gemini) upgrade: streamed answers, retries with backoff, time limits, stopping, cut-off streams,
// conversation memory limits, fewer API calls, the system instructions, and the "see my tasks" permission.
// A fake Gemini API stands in for Google.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startServer, signup, fakeGemini } = require("./srv");

let g, s, a, n = 0;
const ENV = () => ({ GEMINI_API_KEY: "test-key", GEMINI_BASE_URL: g.url, GEMINI_RPM: "500", AI_USER_DAILY: "200", GEMINI_RETRY_MS: "40" });
before(async () => { g = await fakeGemini().start(); s = await startServer(ENV()); a = await signup(s.base, "Riya", "riya@example.com"); });
after(() => { s.stop(); g.close(); });
const user = (base = s.base) => signup(base, "User" + (++n), `u${n}@example.com`);

// Reads a streamed answer. Returns the events in order, each with the time it arrived.
async function stream(c, body, { onEvent, signal } = {}){
  const r = await c.raw("/api/chat/stream", body, signal);
  const out = { status: r.status, type: r.headers.get("content-type"), events: [], t0: Date.now() };
  if (!r.ok || !/event-stream/.test(out.type || "")) { out.json = await r.json().catch(() => null); return out; }
  const rd = r.body.getReader(); const dec = new TextDecoder(); let buf = "";
  try {
    for (;;) {
      const { done, value } = await rd.read(); if (done) break;
      buf += dec.decode(value, { stream: true });
      let k;
      while ((k = buf.indexOf("\n\n")) >= 0) {
        const block = buf.slice(0, k); buf = buf.slice(k + 2);
        const ev = (block.match(/^event: (.*)$/m) || [])[1]; const data = (block.match(/^data: (.*)$/m) || [])[1];
        if (!ev) continue;
        const e = { event: ev, data: data ? JSON.parse(data) : {}, at: Date.now() - out.t0 }; out.events.push(e); if (onEvent) onEvent(e, out);
      }
    }
  } catch (e) { out.aborted = true; }
  out.of = name => out.events.filter(e => e.event === name);
  out.done = (out.of ? out.of("done")[0] : null); out.done = out.done && out.done.data;
  out.shown = out.events.reduce((t, e) => e.event === "delta" ? t + e.data.text : e.event === "replace" ? e.data.text : t, "");
  return out;
}
// an unbuffered POST with the same login cookie as the test client
function rawClient(c){
  const cookie = c.res && c.res.setCookie ? c.res.setCookie.split(";")[0] : "";
  c.raw = (url, body, signal) => fetch(c.base + url, { method: "POST", headers: Object.assign({ "Content-Type": "application/json" }, cookie ? { Cookie: cookie } : {}), body: JSON.stringify(body), signal });
  return c;
}
const mk = async (base = s.base) => { const c = await user(base); c.base = base; return rawClient(c); };
const sysOf = x => x.body.systemInstruction.parts[0].text;

test("streaming: the answer arrives piece by piece as server-sent events, then the saved message", async () => {
  const c = await mk();
  g.seen = []; const embeds = g.embeds;
  g.respond = () => ({ chunks: ["Artificial intelligence ", "is software that ", "learns from examples."], chunkDelay: 250 });
  const r = await stream(c, { message: "What is artificial intelligence?" });
  assert.equal(r.status, 200); assert.match(r.type, /^text\/event-stream/);
  assert.equal(r.events[0].event, "start"); assert.ok(r.events[0].data.conversationId); assert.equal(r.events[0].data.userMessage.text, "What is artificial intelligence?");
  const d = r.of("delta"); assert.ok(d.length >= 3, "several pieces");
  assert.equal(d[0].data.text, "Artificial intelligence ");
  const end = r.of("done")[0];
  assert.ok(end.at - d[0].at >= 350, "the first words are shown well before the answer is complete");
  assert.equal(r.done.message.text, "Artificial intelligence is software that learns from examples.");
  assert.equal(r.shown, r.done.message.text);
  assert.equal(r.done.message.via, "ai"); assert.equal(r.done.message.kind, "general"); assert.ok(r.done.message.qid);
  // one request to Google: no extra "search the guide" call for a general question
  assert.equal(g.streams().length, 1); assert.equal(g.embeds, embeds, "no embedding request for a general question");
  assert.equal(g.streams()[0].headers["x-goog-api-key"], "test-key");
  const cfg = g.streams()[0].body.generationConfig;
  assert.ok(cfg.maxOutputTokens >= 4096); for (const k of ["temperature", "topP", "topK", "candidateCount"]) assert.ok(!(k in cfg), k + " isn't sent (Gemini 3 ignores or rejects it)");
  const hist = (await c.get(`/api/conversations/${r.done.conversationId}/messages`)).json.messages;
  assert.deepEqual(hist.map(m => m.role), ["user", "assistant"]); assert.equal(hist[1].text, r.done.message.text);
});

test("streaming: the model's thinking, a 'Sources:' line, guide numbers and NOT_IN_GUIDE never reach the screen", async () => {
  const c = await mk();
  g.respond = () => ({ thought: "SECRET-THINKING about the plan", chunks: ["Open Settings, then ", "Reminders [1]. Pick the times.", "\nSour", "ces: [1]"] });
  const r = await stream(c, { message: "How do reminders work?" });
  const seen = r.events.filter(e => e.event === "delta" || e.event === "replace").map(e => e.data.text).join("|");
  assert.doesNotMatch(seen, /SECRET-THINKING|Sour|\[1\]/);
  assert.equal(r.done.message.text, "Open Settings, then Reminders. Pick the times.");
  assert.ok(r.done.message.sources.length >= 1); assert.equal(r.done.message.kind, "website");
  g.respond = () => ({ chunks: ["NOT_", "IN_GUIDE"] });
  const r2 = await stream(c, { message: "How do I connect Deadline Tracker to my smart fridge?" });
  assert.equal(r2.of("delta").length, 0, "nothing of the marker is shown");
  assert.match(r2.done.message.text, /help guide doesn't cover that/); assert.equal(r2.done.message.found, false);
});

test("memory: follow-ups get the earlier messages; long old answers are shortened; other users can't use the conversation", async () => {
  const c = await mk();
  g.respond = () => ({ text: "Start with syntax, then OOP, then small projects. " + "Detail. ".repeat(900) });
  const r1 = await stream(c, { message: "I want to learn Java." });
  g.seen = []; g.respond = () => ({ text: "About 1 to 2 hours a day for Java." });
  const r2 = await stream(c, { message: "How many hours daily?", conversationId: r1.done.conversationId });
  assert.equal(r2.done.conversationId, r1.done.conversationId);
  const b = g.streams()[0].body;
  assert.equal(b.contents[0].parts[0].text, "I want to learn Java."); assert.equal(b.contents[1].role, "model");
  assert.equal(b.contents[2].parts[0].text, "How many hours daily?");
  assert.match(b.contents[1].parts[0].text, /^Start with syntax/);
  assert.ok(b.contents[1].parts[0].text.length < 5000, "an old long answer is shortened, not sent whole (" + b.contents[1].parts[0].text.length + ")");
  assert.match(sysOf(g.streams()[0]), /follow-up/i);
  // many turns: what is sent stays bounded
  let conv = r2.done.conversationId; g.respond = () => ({ text: "Answer. " + "More. ".repeat(600) });
  for (let k = 0; k < 9; k++) await stream(c, { message: "Next question " + k, conversationId: conv });
  g.seen = []; await stream(c, { message: "Last one", conversationId: conv });
  const last = g.streams()[0].body; const size = last.contents.reduce((t, x) => t + x.parts[0].text.length, 0);
  assert.ok(last.contents.length <= 13); assert.ok(size < 14000, "history stays small (" + size + " characters)");
  const other = await mk();
  const x = await stream(other, { message: "hi", conversationId: conv }); assert.equal(x.status, 404);
  const fresh = await stream(c, { message: "A new topic" }); assert.notEqual(fresh.done.conversationId, conv);
});

test("the instructions tell Gemini how to answer: intent, typos, direct answers, teaching, honesty about live data, today's date", async () => {
  const c = await mk();
  g.seen = []; g.respond = () => ({ text: "Start with Python." });
  await stream(c, { message: "how i start coding i dont know anything" });
  const sys = sysOf(g.streams()[0]);
  for (const re of [/spelling|typos/i, /grammar/i, /intent|what they mean/i, /simple question/i, /step by step/i, /code/i, /one short (clarifying )?question/i, /don't repeat the question|do not repeat the question/i,
    /can't browse|cannot browse|no live/i, /Today is \w+day, \d{1,2} \w+ 20\d\d/, /never claim|don't pretend|never pretend/i]) assert.match(sys, re);
  assert.doesNotMatch(sys, /riya@|u\d+@example\.com/, "no email or account details in the instructions");
});

test("reliability: a failing AI is retried with a pause (limited), then answers; the person is told it's still working", async () => {
  const c = await mk();
  let k = 0; g.seen = []; g.respond = () => ++k <= 2 ? { status: 503, error: { error: { status: "UNAVAILABLE", message: "overloaded" } } } : { text: "Recovered answer." };
  const r = await stream(c, { message: "What is machine learning?" });
  assert.equal(r.done.message.text, "Recovered answer."); assert.equal(g.streams().length, 3);
  assert.ok(r.of("wait").length >= 1);
  // always failing: stops after 3 tries with a friendly message and "Try again"
  g.seen = []; g.respond = () => ({ status: 500, error: { error: { status: "INTERNAL", message: "boom at /srv/internal/stack.js:12 key=AIza-SECRET" } } });
  const f = await stream(c, { message: "What is deep learning?" });
  assert.equal(g.streams().length, 3, "no endless retries");
  assert.equal(f.done.message.error, "unavailable"); assert.equal(f.done.message.retry, "What is deep learning?");
  assert.match(f.done.message.text, /isn't available right now|try again/i);
  assert.doesNotMatch(JSON.stringify(f.events), /stack\.js|AIza|test-key/, "no internal details or keys");
  // a rate limit from Google is not retried (it would only make it worse)
  const s2 = await startServer(ENV()); try {
    const c2 = await mk(s2.base); g.seen = [];
    g.respond = () => ({ status: 429, error: { error: { code: 429, status: "RESOURCE_EXHAUSTED", message: "quota", details: [{ retryDelay: "30s" }] } } });
    const q = await stream(c2, { message: "What is an API?" });
    assert.equal(g.streams().length, 1); assert.equal(q.done.message.error, "quota"); assert.match(q.done.message.text, /limit was reached/i);
    const again = await stream(c2, { message: "What is an API?" }); assert.equal(g.streams().length, 1, "paused until Google allows it"); assert.equal(again.done.message.error, "quota");
  } finally { s2.stop(); }
});

test("reliability: a stream that breaks half-way keeps what arrived and offers 'Try again'; an empty answer is an honest error", async () => {
  const c = await mk();
  g.respond = () => ({ chunks: ["Java is compiled. ", "Python is interpreted. ", "never sent"], dropAfter: 2, chunkDelay: 80 });
  const r = await stream(c, { message: "Explain the difference between Java and Python." });
  assert.match(r.done.message.text, /^Java is compiled\. Python is interpreted\./);
  assert.match(r.done.message.text, /connection dropped|cut off/i); assert.equal(r.done.message.partial, true);
  assert.equal(r.done.message.retry, "Explain the difference between Java and Python.");
  g.seen = []; g.respond = () => ({ chunks: [] });
  const e = await stream(c, { message: "Say nothing" });
  assert.equal(e.done.message.error, "invalid_response"); assert.ok(e.done.message.retry); assert.ok(e.done.message.text.trim().length > 10, "never an empty bubble");
  g.respond = () => ({ chunks: [], finishReason: "SAFETY" });
  const b = await stream(c, { message: "Something blocked" });
  assert.match(b.done.message.text, /can't help with that/i); assert.equal(b.done.message.retry, undefined);
});

test("time limits: a silent AI gives up at the first-words limit; a stalled stream ends with what arrived", async () => {
  const s3 = await startServer(Object.assign(ENV(), { GEMINI_FIRST_TOKEN_MS: "300", GEMINI_IDLE_MS: "300" }));
  try {
    const c = await mk(s3.base);
    g.seen = []; g.respond = () => ({ text: "late", delay: 3000 });
    const t0 = Date.now(); const r = await stream(c, { message: "What is photosynthesis?" });
    assert.ok(Date.now() - t0 < 2500, "doesn't hang"); assert.equal(r.done.message.error, "timeout"); assert.match(r.done.message.text, /took too long/i);
    assert.ok(g.streams().length <= 2, "at most one retry after a timeout");
    g.respond = () => ({ chunks: ["First part. ", "second"], chunkDelay: 2500 });
    const t1 = Date.now(); const p = await stream(c, { message: "Tell me about volcanoes" });
    assert.ok(Date.now() - t1 < 2000); assert.match(p.done.message.text, /^First part\./); assert.equal(p.done.message.partial, true);
  } finally { s3.stop(); }
});

test("stop: closing the request stops the AI call and keeps the part already written", async () => {
  const c = await mk();
  g.closed = 0; g.respond = () => ({ chunks: ["One. ", "Two. ", "Three. ", "Four. ", "Five."], chunkDelay: 300 });
  const ctrl = new AbortController(); let conv;
  const r = await stream(c, { message: "Count slowly" }, { signal: ctrl.signal, onEvent: e => { if (e.event === "start") conv = e.data.conversationId; if (e.event === "delta") ctrl.abort(); } });
  assert.ok(r.aborted); assert.equal(r.of("done").length, 0);
  for (let k = 0; k < 30 && !g.closed; k++) await new Promise(r => setTimeout(r, 50));
  assert.ok(g.closed >= 1, "the request to Google was closed");
  await new Promise(r => setTimeout(r, 200));
  const hist = (await c.get(`/api/conversations/${conv}/messages`)).json.messages;
  assert.equal(hist.length, 2); assert.match(hist[1].text, /^One\./); assert.doesNotMatch(hist[1].text, /Five/); assert.equal(hist[1].stopped, true);
});

test("stream endpoint: needs a login, validates the message, and answers from the guide when there is no AI key", async () => {
  const anon = rawClient(Object.assign(require("./srv").client(s.base), { base: s.base }));
  assert.equal((await anon.raw("/api/chat/stream", { message: "hi" })).status, 401);
  const c = await mk();
  const bad = await stream(c, { message: "" }); assert.equal(bad.status, 400);
  const s5 = await startServer({});
  try { const c5 = await mk(s5.base); const r = await stream(c5, { message: "How do reminders work?" });
    assert.equal(r.of("delta").length, 0); assert.equal(r.done.message.via, "kb"); assert.ok(r.done.message.text.length > 20);
  } finally { s5.stop(); }
});

test("task permission: off by default (no task ever goes to Gemini); on, only titles and dates go, and only with questions about the user's work", async () => {
  const c = await mk(); const other = await mk();
  await c.post("/api/tasks", { title: "Chemistry revision SECRETTITLE", description: "PRIVATE-NOTE-123", dueDate: "2026-11-13", dueTime: "17:00", priority: "high" });
  await c.post("/api/tasks", { title: "Old finished DONETITLE", status: "done" });
  await other.post("/api/tasks", { title: "OTHERUSER-task" });
  assert.equal((await rawClient(Object.assign(require("./srv").client(s.base), { base: s.base })).get("/api/ai/prefs")).status, 401);
  assert.deepEqual((await c.get("/api/ai/prefs")).json, { shareTasks: false });
  g.respond = () => ({ text: "Here is a plan." });
  g.seen = []; await stream(c, { message: "Help me plan my study tomorrow." }); await c.post("/api/chat", { message: "what are my deadlines this week" });
  assert.equal(g.chats().length, 2);
  for (const x of g.seen) assert.doesNotMatch(x.raw, /SECRETTITLE|PRIVATE-NOTE|DONETITLE|OTHERUSER/);
  assert.match(sysOf(g.chats()[0]), /can't see (the user's|their) tasks/i);
  // a general question is answered normally with sharing off
  g.seen = []; const gen = await stream(c, { message: "What is artificial intelligence?" }); assert.equal(gen.done.message.text, "Here is a plan."); assert.equal(gen.done.message.error, undefined);
  // turn it on
  assert.equal((await c.put("/api/ai/prefs", { shareTasks: "yes" })).status, 400);
  assert.deepEqual((await c.put("/api/ai/prefs", { shareTasks: true })).json, { shareTasks: true });
  assert.deepEqual((await c.get("/api/ai/prefs")).json, { shareTasks: true });
  assert.deepEqual((await other.get("/api/ai/prefs")).json, { shareTasks: false }, "one person's choice doesn't change another's");
  g.seen = []; const r = await stream(c, { message: "Help me plan my study tomorrow." });
  const raw = g.streams()[0].raw;
  assert.match(raw, /Chemistry revision SECRETTITLE/); assert.match(raw, /2026-11-13|13 Nov/); assert.match(raw, /high/);
  assert.doesNotMatch(raw, /PRIVATE-NOTE|OTHERUSER|DONETITLE/, "no notes, no finished tasks, nobody else's tasks");
  assert.match(sysOf(g.streams()[0]), /cannot (add|create|change)|can't (add|create|change)/i);
  assert.equal(r.done.message.usedTasks, true);
  // general questions still don't carry tasks
  g.seen = []; const r2 = await stream(c, { message: "Explain recursion with a Python example" });
  assert.doesNotMatch(g.streams()[0].raw, /SECRETTITLE/); assert.equal(r2.done.message.usedTasks, undefined);
  // the other user, with sharing on, only ever gets their own
  await other.put("/api/ai/prefs", { shareTasks: true }); g.seen = []; await stream(other, { message: "What should I do today?" });
  assert.match(g.streams()[0].raw, /OTHERUSER-task/); assert.doesNotMatch(g.streams()[0].raw, /SECRETTITLE/);
  // off again
  await c.put("/api/ai/prefs", { shareTasks: false }); g.seen = []; await stream(c, { message: "Help me plan my study tomorrow." });
  assert.doesNotMatch(g.streams()[0].raw, /SECRETTITLE/);
});

test("the old one-piece endpoint still works and retries the same way", async () => {
  const c = await mk(); let k = 0; g.seen = [];
  g.respond = () => ++k <= 2 ? { status: 503, error: { error: { status: "UNAVAILABLE", message: "x" } } } : { text: "Plain answer." };
  const r = await c.post("/api/chat", { message: "What is gravity?" });
  assert.equal(r.json.message.text, "Plain answer."); assert.equal(g.chats().length, 3);
});
