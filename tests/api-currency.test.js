// Assistant answers: Indian Rupees by default (₹1,50,000), other currencies only when chosen or asked about,
// and clean, readable text (no raw JSON fences or stray markup).
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startServer, signup, fakeGemini } = require("./srv");
const F = require("../lib/ai/format");

/* ---------- The formatter on its own ---------- */
test("money: amounts in dollars become rupees with Indian grouping when the person uses INR", () => {
  assert.equal(F.localizeMoney("Set aside $1500 a month and $150000 a year.", { currency: "INR" }), "Set aside ₹1,500 a month and ₹1,50,000 a year.");
  assert.equal(F.localizeMoney("A budget of USD 2,500.50 is fine", { currency: "INR" }), "A budget of ₹2,500.50 is fine");
  assert.equal(F.localizeMoney("about 300 dollars", { currency: "INR" }), "about ₹300");
  assert.equal(F.localizeMoney("Rs. 150000 or INR 1200000", { currency: "INR" }), "₹1,50,000 or ₹12,00,000");
  assert.equal(F.localizeMoney("₹150000", { currency: "INR" }), "₹1,50,000");
});
test("money: another chosen currency is used and formatted its own way", () => {
  assert.equal(F.localizeMoney("Save $1500 or ₹2000", { currency: "USD" }), "Save $1,500 or $2,000");
  assert.equal(F.localizeMoney("Costs $1500", { currency: "EUR" }), "Costs €1,500");
});
test("money: when the person asks about dollars, dollars are kept", () => {
  assert.equal(F.localizeMoney("100 USD is about $100.", { currency: "INR", question: "How much is 100 USD in rupees?" }), "100 USD is about $100.");
});
test("money: numbers that aren't money are left alone", () => {
  assert.equal(F.localizeMoney("Study 2 hours on 5 Nov, 3 chapters.", { currency: "INR" }), "Study 2 hours on 5 Nov, 3 chapters.");
});
test("clean: code fences, 'Answer:' labels and runs of blank lines are removed", () => {
  assert.equal(F.cleanAnswer("```markdown\nAnswer: Hello\n\n\n\nWorld\n```"), "Hello\n\nWorld");
});

/* ---------- Through Help ---------- */
let g, s, a;
before(async () => { g = await fakeGemini().start(); s = await startServer({ GEMINI_API_KEY: "test-key", GEMINI_BASE_URL: g.url, AI_USER_DAILY: "50", GEMINI_RPM: "100" }); a = await signup(s.base, "Riya", "riya@example.com"); });
after(() => { s.stop(); g.close(); });

test("help: the prompt asks for rupees and a friendly, structured answer; the reply is in ₹", async () => {
  g.respond = () => ({ text: JSON.stringify({ found: true, kind: "general", answer: "## A simple budget\nKeep $5000 for rent and save $150000 a year.", sources: [] }) });
  const r = await a.post("/api/chat", { message: "How should a student budget money each month?" });
  assert.equal(r.status, 200);
  assert.match(r.json.message.text, /₹5,000/); assert.match(r.json.message.text, /₹1,50,000/); assert.doesNotMatch(r.json.message.text, /\$/);
  const sys = g.chats().pop().body.systemInstruction.parts[0].text;
  assert.match(sys, /Indian Rupees/); assert.match(sys, /₹1,50,000/); assert.match(sys, /short paragraphs/i);
});
test("help: a chosen currency is respected", async () => {
  g.respond = () => ({ text: JSON.stringify({ found: true, kind: "general", answer: "Keep $500 aside.", sources: [] }) });
  const r = await a.post("/api/chat", { message: "Budget tip?", currency: "EUR" });
  assert.match(r.json.message.text, /€500/);
  const bad = await a.post("/api/chat", { message: "Budget tip?", currency: "XYZ" });
  assert.equal(bad.status, 200); assert.match(bad.json.message.text, /₹500/, "unknown currency falls back to INR");
});
