// Voice assistant, server side: Deadline AI (Gemini) understands a spoken or typed command and pulls out the task
// details; our own code works out the dates; nothing is saved until the person confirms, and saving goes through
// the existing /api/plan/apply (validated, the user's own tasks only). A fake Gemini API stands in for Google.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startServer, signup, fakeGemini } = require("./srv");

let g, s, n = 0;
const ENV = () => ({ GEMINI_API_KEY: "test-key", GEMINI_BASE_URL: g.url, GEMINI_RPM: "500", AI_USER_DAILY: "300", GEMINI_RETRY_MS: "30" });
before(async () => { g = await fakeGemini().start(); s = await startServer(ENV()); TZ = (await (await user()).get("/api/me")).json.user.timezone; });
after(() => { s.stop(); g.close(); });
const user = (base = s.base) => signup(base, "Voice" + (++n), `v${n}@example.com`);
const isExtract = b => b.generationConfig && b.generationConfig.responseMimeType === "application/json";
// what the fake "Gemini" answers: `json` for the task-details request, `text` for a normal chat answer
const reply = (json, text = "A normal answer.") => { g.respond = b => isExtract(b) ? { text: JSON.stringify(json) } : { text }; };
const ask = async (c, message, conversationId) => { const r = await c.post("/api/chat", { message, conversationId }); assert.equal(r.status, 200, JSON.stringify(r.json)); return r.json; };
// dates as the test users see them (their time zone comes from the sign-up helper)
let TZ = "UTC";
const localParts = ms => { const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(ms)).map(x => [x.type, x.value])); return { date: `${p.year}-${p.month}-${p.day}`, mins: +p.hour * 60 + +p.minute }; };
const day = (k, wd) => { const d = new Date(localParts(Date.now()).date + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + k); if (wd != null) while (d.getUTCDay() !== wd) d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };
const tasksOf = async c => (await c.get("/api/tasks")).json.tasks;

test("one spoken task: Gemini pulls out the details, a confirm card comes back, and nothing is saved until Confirm", async () => {
  const c = await user(); g.seen = [];
  reply({ intent: "create", tasks: [{ title: "Study chemistry", when: "tomorrow", priority: "", hours: null }] });
  const r = await ask(c, "Add a task to study chemistry tomorrow.");
  const p = r.message.proposal; assert.ok(p, "a suggestion to confirm"); assert.equal(p.status, "pending");
  assert.equal(p.actions.length, 1);
  assert.deepEqual({ type: p.actions[0].type, title: p.actions[0].title, date: p.actions[0].date, time: p.actions[0].time, priority: p.actions[0].priority, keep: p.actions[0].keep },
    { type: "create", title: "Study chemistry", date: day(1), time: null, priority: "medium", keep: true });
  assert.equal(r.message.via, "ai"); assert.equal(r.message.kind, "tasks"); assert.match(r.message.text, /Study chemistry/);
  assert.equal(g.chats().length, 1, "an obvious command needs one AI request"); assert.ok(isExtract(g.chats()[0].body));
  assert.equal((await tasksOf(c)).length, 0, "not saved yet");
  // confirm: saved by the existing backend, and still there afterwards
  const ok = await c.post("/api/plan/apply", { messageId: r.message.id }); assert.equal(ok.status, 200); assert.equal(ok.json.result.created, 1);
  const t = await tasksOf(c); assert.equal(t.length, 1); assert.equal(t[0].title, "Study chemistry"); assert.equal(t[0].planDate, day(1)); assert.equal(t[0].status, "todo");
  assert.equal((await c.post("/api/plan/apply", { messageId: r.message.id })).status, 409, "a second Confirm can't save it twice");
  assert.equal((await tasksOf(c)).length, 1);
  // someone else can't confirm my card
  const other = await user(); assert.equal((await other.post("/api/plan/apply", { messageId: r.message.id })).status, 404);
});

test("date, time, priority and hours: worked out by our own code from the words Gemini picked", async () => {
  const c = await user();
  reply({ intent: "create", tasks: [{ title: "Complete Java assignment", when: "Friday at 6 PM", priority: "", hours: null, deadline: true }] });
  let a = (await ask(c, "Remind me to complete my Java assignment on Friday at 6 PM.")).message.proposal.actions[0];
  assert.equal(a.title, "Complete Java assignment"); assert.equal(a.date, day(1, 5)); assert.equal(a.time, "18:00");
  reply({ intent: "create", tasks: [{ title: "Maths practice", when: "today", priority: "high", hours: null }] });
  a = (await ask(c, "Add maths practice for today with high priority.")).message.proposal.actions[0];
  assert.equal(a.date, day(0)); assert.equal(a.priority, "high"); assert.equal(a.time, null, "no time said, none invented");
  reply({ intent: "create", tasks: [{ title: "Study biology", when: "tomorrow", hours: 2 }, { title: "Revise chemistry", when: "tomorrow", hours: 1 }] }, "TASK_COMMAND");   // not an obvious command by its first words: the chat model flags it
  const two = (await ask(c, "I have to study biology for two hours tomorrow and revise chemistry for one hour.")).message.proposal.actions;
  assert.deepEqual(two.map(x => [x.title, x.date, x.estimate]), [["Study biology", day(1), 2], ["Revise chemistry", day(1), 1]]);
  for (const [when, want] of [["day after tomorrow", day(2)], ["next Monday", null], ["this Friday", day(0, 5)]]) {
    reply({ intent: "create", tasks: [{ title: "Thing", when }] });
    const x = (await ask(c, `Add thing ${when}`)).message.proposal.actions[0];
    if (want) assert.equal(x.date, want, when); else { assert.equal(new Date(x.date + "T12:00Z").getUTCDay(), 1, when); assert.ok(x.date > day(0)); }
  }
  // "in two hours": today's date (or tomorrow's near midnight) and a time about two hours from now
  reply({ intent: "create", tasks: [{ title: "Call the bank", when: "in two hours" }] });
  const soon = (await ask(c, "Remind me to call the bank in two hours")).message.proposal.actions[0];
  const at = localParts(Date.now() + 2 * 3600e3); assert.equal(soon.date, at.date);
  assert.ok(Math.abs((+soon.time.slice(0, 2) * 60 + +soon.time.slice(3)) - at.mins) <= 2, soon.time);
});

test("never invents: a date Gemini adds that the person didn't say is dropped; odd values are cleaned", async () => {
  const c = await user();
  reply({ intent: "create", tasks: [{ title: "Buy graph paper", when: "tomorrow at 9 AM", priority: "urgent!!", hours: "lots" }, { title: "", when: "today" }, { title: "x".repeat(400), when: "" }] });
  const acts = (await ask(c, "Add buy graph paper and something else")).message.proposal.actions;
  assert.equal(acts.length, 2, "a task with no title is dropped");
  assert.equal(acts[0].date, null); assert.equal(acts[0].time, null); assert.equal(acts[0].priority, "medium"); assert.equal(acts[0].estimate, null);
  assert.ok(acts[1].title.length <= 200);
  // more tasks than a sentence could hold are capped
  reply({ intent: "create", tasks: Array.from({ length: 40 }, (_, k) => ({ title: "Task " + k, when: "" })) });
  assert.ok((await ask(c, "Add lots of tasks")).message.proposal.actions.length <= 12);
});

test("a command the quick check misses is still caught: the chat model flags it, then the details are pulled out", async () => {
  const c = await user(); g.seen = [];
  g.respond = b => isExtract(b) ? { text: JSON.stringify({ intent: "create", tasks: [{ title: "Chemistry revision", when: "tomorrow at 5 PM" }, { title: "Java practice", when: "Saturday" }] }) } : { chunks: ["TASK_", "COMMAND"] };
  const login = c.res.setCookie.split(";")[0];
  const res = await fetch(s.base + "/api/chat/stream", { method: "POST", headers: { "Content-Type": "application/json", Cookie: login }, body: JSON.stringify({ message: "Hey, chemistry revision tomorrow at 5 PM and Java practice Saturday, put both on my list" }) });
  const body = await res.text();
  assert.doesNotMatch(body.split("event: done")[0], /TASK_|COMMAND/, "the marker is never shown");
  const done = JSON.parse(body.split("event: done\ndata: ")[1].split("\n")[0]);
  assert.deepEqual(done.message.proposal.actions.map(a => [a.title, a.date, a.time]), [["Chemistry revision", day(1), "17:00"], ["Java practice", day(1, 6), null]]);
  assert.equal(g.chats().length, 2);
  assert.match(g.chats()[0].body.systemInstruction.parts[0].text, /TASK_COMMAND/);
  // a general question is still answered normally, with one request and no card
  g.seen = []; reply({}, "Machine learning finds patterns in data.");
  const q = await ask(c, "What is machine learning?");
  assert.equal(q.message.text, "Machine learning finds patterns in data."); assert.equal(q.message.proposal, undefined); assert.equal(g.chats().length, 1);
  g.seen = []; reply({}, "Open Quick add and type the task.");
  const how = await ask(c, "How do I add a task?"); assert.equal(how.message.proposal, undefined, "a how-to question is not a command"); assert.ok(!isExtract(g.chats()[0].body));
});

test("unclear commands get one short question instead of a guess; the next message can answer it", async () => {
  const c = await user();
  reply({ intent: "unclear", question: "Which task should I add for Friday?" });
  const r = await ask(c, "Add it for Friday");
  assert.equal(r.message.text, "Which task should I add for Friday?"); assert.equal(r.message.proposal, undefined); assert.equal((await tasksOf(c)).length, 0);
  g.seen = []; reply({ intent: "create", tasks: [{ title: "Physics lab record", when: "Friday" }] }, "TASK_COMMAND");
  const r2 = await ask(c, "The physics lab record", r.conversationId);
  assert.equal(r2.message.proposal.actions[0].title, "Physics lab record"); assert.equal(r2.message.proposal.actions[0].date, day(1, 5));
  const ex = g.chats().find(x => isExtract(x.body)); assert.match(JSON.stringify(ex.body.contents), /Add it for Friday/, "the earlier turn is sent so 'it' can be understood");
  // an empty or broken reply from the AI never becomes a task
  g.respond = b => isExtract(b) ? { text: "not json at all" } : { text: "x" };
  const r3 = await ask(c, "Add zzz qqq"); assert.ok(r3.message.text.length > 5);
  reply({ intent: "create", tasks: [] });
  const r4 = await ask(c, "Add"); assert.equal(r4.message.proposal, undefined); assert.match(r4.message.text, /what|which|tell me/i);
});

test("duplicates: a command heard twice doesn't add the task twice", async () => {
  const c = await user();
  reply({ intent: "create", tasks: [{ title: "Study chemistry", when: "tomorrow" }] });
  const r1 = await ask(c, "Add a task to study chemistry tomorrow.");
  await c.post("/api/plan/apply", { messageId: r1.message.id });
  const r2 = await ask(c, "Add a task to study chemistry tomorrow.", r1.conversationId);
  const a = r2.message.proposal.actions[0]; assert.equal(a.keep, false); assert.ok(a.dupOf); assert.match(r2.message.text, /already on your list/i);
  assert.equal((await c.post("/api/plan/apply", { messageId: r2.message.id })).status, 400, "nothing ticked, nothing saved");
  assert.equal((await tasksOf(c)).length, 1);
});

test("changing a task: Gemini names the task and the change, our server finds the user's own task; saved only on Confirm", async () => {
  const c = await user(); const other = await user();
  await c.post("/api/tasks", { title: "Java assignment", dueDate: day(5), priority: "medium" });
  await other.post("/api/tasks", { title: "Java assignment OTHER", priority: "low" });
  g.seen = []; reply({ intent: "change", change: { target: "Java assignment", priority: "high" } });
  const r = await ask(c, "Make my Java assignment high priority");
  const a = r.message.proposal.actions[0]; assert.equal(a.type, "priority"); assert.equal(a.priority, "high"); assert.equal(a.title, "Java assignment");
  assert.doesNotMatch(g.chats().map(x => x.raw).join(""), /OTHER/);
  assert.equal((await tasksOf(c))[0].priority, "medium", "unchanged until confirmed");
  assert.equal((await c.post("/api/plan/apply", { messageId: r.message.id })).status, 200);
  assert.equal((await tasksOf(c))[0].priority, "high"); assert.equal((await tasksOf(other))[0].priority, "low");
  reply({ intent: "change", change: { target: "Java assignment", done: true } });
  const d = await ask(c, "Mark the Java assignment as done"); assert.equal(d.message.proposal.actions[0].type, "complete");
  reply({ intent: "change", change: { target: "Java assignment", when: "Sunday" } });
  const mv = await ask(c, "Move the Java assignment to Sunday"); assert.equal(mv.message.proposal.actions[0].type, "plan"); assert.equal(mv.message.proposal.actions[0].date, day(1, 0), "planned for that day; the hard deadline is not moved");
  reply({ intent: "change", change: { target: "trip to the moon", priority: "low" } });
  const none = await ask(c, "Set the trip to the moon task to low priority"); assert.equal(none.message.proposal, undefined); assert.match(none.message.text, /couldn't find|which task/i);
});

test("privacy: saved tasks are not sent to Gemini to understand a command; 'what are my tasks' is answered on our server when sharing is off", async () => {
  const c = await user();
  await c.post("/api/tasks", { title: "SECRETPLAN chemistry", planDate: day(1) }); await c.post("/api/tasks", { title: "Other day thing", planDate: day(3) });
  await c.put("/api/ai/prefs", { shareTasks: true });
  g.seen = []; reply({ intent: "create", tasks: [{ title: "Buy pens", when: "today" }] });
  await ask(c, "Add buy pens today");
  assert.doesNotMatch(g.seen.map(x => x.raw).join(""), /SECRETPLAN/, "even with sharing on, pulling out task details needs no saved tasks");
  await c.put("/api/ai/prefs", { shareTasks: false });
  g.seen = []; g.respond = b => ({ text: "MY_TASKS" });
  const r = await ask(c, "Which things are on my list for tomorrow?");
  assert.match(r.message.text, /SECRETPLAN chemistry/); assert.doesNotMatch(r.message.text, /Other day thing/); assert.equal(r.message.via, "engine");
  assert.doesNotMatch(g.seen.map(x => x.raw).join(""), /SECRETPLAN/);
  assert.match(g.chats()[0].body.systemInstruction.parts[0].text, /MY_TASKS/);
});

test("if the AI is down, commands still work with the built-in rules; without any AI key too", async () => {
  const c = await user();
  g.respond = () => ({ status: 500, error: { error: { status: "INTERNAL", message: "down" } } });
  const r = await ask(c, "Add a task to study chemistry tomorrow.");
  assert.equal(r.message.via, "engine"); assert.equal(r.message.proposal.actions[0].date, day(1)); assert.match(r.message.proposal.actions[0].title, /chemistry/i);
  const s2 = await startServer({});
  try { const c2 = await user(s2.base); const r2 = await ask(c2, "Remind me to call mom tomorrow"); assert.equal(r2.message.proposal.actions[0].date, day(1)); assert.equal(r2.message.via, "engine"); } finally { s2.stop(); }
});
