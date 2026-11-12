// Voice in Deadline AI: the microphone button, listening panel, transcript review, permission and unsupported
// browsers, the confirm card for spoken task commands (saved for real, still there after a reload), and spoken
// answers. The browser's speech recognition and speech synthesis are replaced by small fakes the test drives.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const { startServer, fakeGemini } = require("./srv");
const { onboard, pollPage } = require("./helpers");

let g, s, browser, n = 0;
before(async () => { g = await fakeGemini().start(); s = await startServer({ GEMINI_API_KEY: "test-key", GEMINI_BASE_URL: g.url, GEMINI_RPM: "300", GEMINI_RETRY_MS: "60" }); browser = await chromium.launch(); });
after(async () => { await browser.close(); s.stop(); g.close(); });
const isExtract = b => b.generationConfig && b.generationConfig.responseMimeType === "application/json";

// Fakes: window.__sr drives recognition (say, error), window.__tts records what was spoken.
function fakes({ speech = true, deny = false, tts = true } = {}){
  return `(() => {
    const sr = window.__sr = { live: null, started: 0, stopped: 0, aborted: 0, deny: ${deny} };
    class Rec { constructor(){ this.continuous = false; this.interimResults = false; this.lang = ""; }
      start(){ sr.started++; sr.live = this; this.finals = []; setTimeout(() => { if (sr.deny) { this.onerror && this.onerror({ error: "not-allowed" }); sr.live = null; this.onend && this.onend(); } else this.onstart && this.onstart(); }, 20); }
      stop(){ sr.stopped++; setTimeout(() => { if (sr.live === this) { sr.live = null; this.onend && this.onend(); } }, 30); }
      abort(){ sr.aborted++; if (sr.live === this) { sr.live = null; this.onend && this.onend(); } } }
    sr.say = (text, final = true) => { const r = sr.live; if (!r) return false; const list = r.finals.map(t => Object.assign([{ transcript: t, confidence: .9 }], { isFinal: true })); list.push(Object.assign([{ transcript: text, confidence: .9 }], { isFinal: final })); if (final) r.finals.push(text); r.onresult && r.onresult({ resultIndex: list.length - 1, results: list }); return true; };
    sr.fail = code => { const r = sr.live; if (!r) return; r.onerror && r.onerror({ error: code }); sr.live = null; r.onend && r.onend(); };
    ${speech ? "window.SpeechRecognition = Rec; window.webkitSpeechRecognition = Rec;" : "try { delete window.SpeechRecognition; delete window.webkitSpeechRecognition; Object.defineProperty(window, 'SpeechRecognition', { value: undefined }); Object.defineProperty(window, 'webkitSpeechRecognition', { value: undefined }); } catch (e) {}"}
    const tts = window.__tts = { said: [], speaking: false, paused: false, cancelled: 0 };
    ${tts ? `window.SpeechSynthesisUtterance = function(t){ this.text = t; };
    Object.defineProperty(window, "speechSynthesis", { configurable: true, value: {
      get speaking(){ return tts.speaking; }, get paused(){ return tts.paused; }, getVoices: () => [],
      speak(u){ tts.said.push(u.text); tts.speaking = true; tts.paused = false; tts.u = u; u.onstart && u.onstart(); },
      pause(){ tts.paused = true; }, resume(){ tts.paused = false; },
      cancel(){ tts.cancelled++; const u = tts.u; tts.speaking = false; tts.paused = false; tts.u = null; u && u.onend && u.onend(); } } });
    tts.finish = () => { const u = tts.u; tts.speaking = false; tts.u = null; u && u.onend && u.onend(); };` : `Object.defineProperty(window, "speechSynthesis", { configurable: true, value: undefined });`}
  })();`;
}
async function newUser(opts = {}, viewport){
  const ctx = await browser.newContext({ viewport: viewport || { width: 1280, height: 800 }, permissions: ["clipboard-read", "clipboard-write"] });
  await ctx.addInitScript(fakes(opts));
  const page = await ctx.newPage(); ctx.__errors = []; page.on("pageerror", e => ctx.__errors.push(String(e)));
  await page.goto(s.base + "/?dt-test"); await page.waitForSelector(".auth-card"); await page.click("[data-act=authmode][data-v=signup]");
  await page.fill("#au-name", "Voice " + (++n)); await page.fill("#au-email", `voiceui${n}@example.com`); await page.fill("#au-pass", "password123");
  await page.click("#authGo"); await page.waitForSelector("#onb-name");
  await onboard(page, { mode: "student", demo: false, name: "Voice" });
  await pollPage(page, async () => (await (await fetch("/api/state")).json()).version >= 1, null, 5000);
  await page.click("#dwBtn"); await page.waitForSelector("#dw:not([hidden])");
  return page;
}
const answers = page => page.locator("#dwMsgs .msg.ai:not(.typing-msg):not(.streaming)");
async function waitAnswer(page, k){ await page.waitForFunction(k => document.querySelectorAll("#dwMsgs .msg.ai:not(.typing-msg):not(.streaming)").length > k && !document.querySelector("#dwMsgs .typing-msg, #dwMsgs .streaming"), k, { timeout: 10000 }); return answers(page).last(); }
// speak a sentence: mic, live words, Done, then the transcript is in the box
async function speak(page, text){
  await page.click("#dwMic"); await page.waitForSelector("#dwVoice");
  await page.waitForFunction(() => /Listening/.test(document.querySelector("#dwVoiceStatus").textContent));
  await page.evaluate(t => window.__sr.say(t, true), text);
  await page.click("[data-act=dwvoicedone]"); await page.waitForSelector("#dwVoice", { state: "detached" });
}
const tasksOf = page => page.evaluate(async () => (await (await fetch("/api/tasks")).json()).tasks);

test("microphone: listening panel with live words, timer, Done puts the words in the box to check and edit; nothing is sent by itself", async () => {
  const page = await newUser();
  const mic = page.locator("#dwMic"); assert.ok(await mic.isVisible()); assert.match(await mic.getAttribute("aria-label"), /speak/i);
  assert.equal(await page.evaluate(() => window.__sr.started), 0, "the microphone is never used before the button is pressed");
  await mic.click(); await page.waitForSelector("#dwVoice");
  await page.waitForFunction(() => /Listening/.test(document.querySelector("#dwVoiceStatus").textContent));
  assert.ok(await page.locator("#dwVoice .vwave i").count() >= 5, "a sound-wave animation");
  await page.emulateMedia({ reducedMotion: "no-preference" }); assert.equal(await page.$eval("#dwVoice .vwave i", e => getComputedStyle(e).animationName), "vwave"); assert.match(await page.textContent("#dwVoiceTime"), /^0:0\d$/);
  assert.ok(await page.isHidden("#dwInput"), "the panel takes the place of the typing box");
  await page.evaluate(() => window.__sr.say("what is machine", false));
  await page.waitForFunction(() => /what is machine/.test(document.querySelector("#dwVoiceText").textContent));
  await page.evaluate(() => window.__sr.say("What is machine learning", true));
  await page.click("[data-act=dwvoicedone]");
  await page.waitForSelector("#dwVoice", { state: "detached" });
  assert.equal(await page.inputValue("#dwInput"), "What is machine learning");
  assert.equal(await page.evaluate(() => window.__sr.stopped), 1); assert.equal(await page.evaluate(() => window.__sr.live), null, "the microphone is released");
  assert.equal(await page.locator("#dwMsgs .msg.user").count(), 0, "not sent until the person presses Send");
  assert.equal(await page.evaluate(() => document.activeElement.id), "dwInput");
  // edit, then send: a general question asked by voice is answered as usual
  await page.fill("#dwInput", "What is machine learning?"); g.respond = () => ({ text: "It finds patterns in data." });
  await page.press("#dwInput", "Enter"); assert.match(await (await waitAnswer(page, 0)).textContent(), /finds patterns/);
  // speaking again adds to what is already typed
  await page.fill("#dwInput", "Also"); await speak(page, "explain it simply");
  assert.equal(await page.inputValue("#dwInput"), "Also explain it simply");
});

test("cancel throws the words away; silence, a blocked microphone and a missing microphone each get a clear message", async () => {
  const page = await newUser();
  await page.click("#dwMic"); await page.waitForSelector("#dwVoice"); await page.evaluate(() => window.__sr.say("add something secret", true));
  await page.click("[data-act=dwvoicecancel]"); await page.waitForSelector("#dwVoice", { state: "detached" });
  assert.equal(await page.inputValue("#dwInput"), ""); assert.equal(await page.evaluate(() => window.__sr.live), null);
  // nothing heard
  await page.click("#dwMic"); await page.waitForSelector("#dwVoice"); await page.click("[data-act=dwvoicedone]"); await page.waitForSelector("#dwVoice", { state: "detached" });
  assert.match(await page.textContent("#dwVoiceNote"), /didn't hear anything/i);
  // no microphone
  await page.click("#dwMic"); await page.waitForSelector("#dwVoice"); await page.evaluate(() => window.__sr.fail("audio-capture")); await page.waitForSelector("#dwVoice", { state: "detached" });
  assert.match(await page.textContent("#dwVoiceNote"), /no microphone/i);
  // closing the window while listening stops the microphone
  await page.click("#dwMic"); await page.waitForSelector("#dwVoice"); await page.click("[data-act=dwclose]");
  await page.waitForFunction(() => window.__sr.live === null);
  // permission denied
  const p2 = await newUser({ deny: true });
  await p2.click("#dwMic"); await p2.waitForSelector("#dwVoiceNote");
  assert.match(await p2.textContent("#dwVoiceNote"), /microphone[\s\S]*blocked[\s\S]*allow/i); assert.equal(await p2.locator("#dwVoice").count(), 0);
  assert.equal(await p2.getAttribute("#dwVoiceNote", "role"), "alert"); assert.ok(await p2.isEnabled("#dwInput"), "typing still works");
});

test("a browser without speech recognition says so plainly and never pretends to listen", async () => {
  const page = await newUser({ speech: false });
  await page.click("#dwMic");
  await page.waitForSelector("#dwVoiceNote"); assert.match(await page.textContent("#dwVoiceNote"), /can't turn speech into text[\s\S]*(Chrome|keyboard)/i);
  assert.equal(await page.locator("#dwVoice").count(), 0);
  g.respond = () => ({ text: "Typed still works." }); await page.fill("#dwInput", "hello there friend"); await page.press("#dwInput", "Enter");
  assert.match(await (await waitAnswer(page, 0)).textContent(), /Typed still works/);
});

test("say a task: a confirm card shows task, date and priority; Confirm and add saves it for real and it is still there after a reload", async () => {
  const page = await newUser();
  g.respond = b => isExtract(b) ? { text: JSON.stringify({ intent: "create", tasks: [{ title: "Study chemistry", when: "tomorrow", priority: "high" }] }) } : { text: "x" };
  await speak(page, "Add a task to study chemistry tomorrow with high priority");
  await page.press("#dwInput", "Enter");
  const m = await waitAnswer(page, 0); const card = m.locator(".vc-card");
  await card.waitFor(); const t = await card.textContent();
  assert.match(t, /Study chemistry/); assert.match(t, /Tomorrow/i); assert.match(t, /High/);
  assert.equal(await page.getAttribute("#dwTabHelp", "aria-selected"), "true", "stays in the same chat");
  assert.equal((await tasksOf(page)).length, 0, "nothing saved before Confirm");
  await card.locator("[data-act=vcconfirm]").click();
  await pollPage(page, async () => (await (await fetch("/api/tasks")).json()).tasks.length === 1, null, 6000);
  await page.waitForFunction(() => /Added 1 task/.test(document.querySelector("#dwMsgs").textContent));
  assert.equal(await page.locator("#dwMsgs [data-act=vcconfirm]").count(), 0, "can't be confirmed twice");
  const saved = (await tasksOf(page))[0]; assert.equal(saved.title, "Study chemistry"); assert.equal(saved.priority, "high"); assert.ok(saved.planDate);
  await page.reload(); await page.waitForSelector("#dwBtn:not([hidden])");
  assert.equal((await tasksOf(page)).length, 1); assert.ok(await page.evaluate(() => window.__DT_TEST__.W().items.some(i => i.title === "Study chemistry")), "on the to-do list in the app");
  await page.click("#dwBtn"); await page.waitForFunction(() => /Added 1 task/.test((document.querySelector("#dwMsgs") || {}).textContent || ""));
});

test("several tasks at once, Edit details before saving, Cancel, and an unclear command asks a question", async () => {
  const page = await newUser();
  g.respond = b => isExtract(b) ? { text: JSON.stringify({ intent: "create", tasks: [{ title: "Chemistry revision", when: "tomorrow at 5 PM" }, { title: "Java practice", when: "Saturday" }] }) } : { text: "TASK_COMMAND" };
  await speak(page, "Hey, chemistry revision tomorrow at 5 PM and Java practice Saturday, put both on my list"); await page.press("#dwInput", "Enter");
  let m = await waitAnswer(page, 0); let card = m.locator(".vc-card"); await card.waitFor();
  assert.equal(await card.locator(".vc-task").count(), 2); assert.match(await card.textContent(), /5:00 pm/i);
  await card.locator("[data-act=vcedit]").click();
  const title = m.locator(".proposal input.pr-title").first(); await title.waitFor(); await title.fill("Chemistry revision unit 3"); await title.dispatchEvent("change");
  await m.locator(".proposal input[type=checkbox]").nth(1).uncheck();
  await m.locator("[data-act=propsave]").click();
  await pollPage(page, async () => (await (await fetch("/api/tasks")).json()).tasks.length === 1, null, 6000);
  const saved = (await tasksOf(page))[0]; assert.equal(saved.title, "Chemistry revision unit 3"); assert.equal(saved.planTime, "17:00");
  // Cancel on a card: nothing saved
  g.respond = b => isExtract(b) ? { text: JSON.stringify({ intent: "create", tasks: [{ title: "Buy pens", when: "" }] }) } : { text: "x" };
  await page.fill("#dwInput", "Add buy pens"); await page.press("#dwInput", "Enter"); m = await waitAnswer(page, 1);
  await m.locator("[data-act=vcdiscard]").click(); await page.waitForFunction(() => /Not added/.test(document.querySelector("#dwMsgs").textContent));
  assert.equal((await tasksOf(page)).length, 1);
  // unclear
  g.respond = b => isExtract(b) ? { text: JSON.stringify({ intent: "unclear", question: "Which task should I add for Friday?" }) } : { text: "x" };
  await page.fill("#dwInput", "Add it for Friday"); await page.press("#dwInput", "Enter"); m = await waitAnswer(page, 2);
  assert.match(await m.textContent(), /Which task should I add for Friday\?/); assert.equal(await m.locator(".vc-card").count(), 0);
  // the same sentence caught twice within a moment is sent once
  g.seen = []; g.respond = b => isExtract(b) ? { text: JSON.stringify({ intent: "create", tasks: [{ title: "Call mom", when: "today" }] }) } : { text: "x" };
  await page.fill("#dwInput", "Add call mom today"); await page.press("#dwInput", "Enter"); await waitAnswer(page, 3);
  await page.fill("#dwInput", "Add call mom today"); await page.press("#dwInput", "Enter"); await page.waitForTimeout(600);
  assert.equal(g.chats().length, 1);
  assert.equal(await page.locator('#dwMsgs .msg.user:has-text("Add call mom today")').count(), 1);
});

test("spoken answers: Listen reads an answer, Pause and Stop work; reading aloud by itself is a switch that is off at first and skips long answers", async () => {
  const page = await newUser();
  g.respond = () => ({ text: "## Short answer\n\nAI is **software** that learns. Use `print()`.\n\n```python\nprint('hi')\n```" });
  await page.fill("#dwInput", "What is AI?"); await page.press("#dwInput", "Enter"); const m = await waitAnswer(page, 0);
  assert.equal(await page.evaluate(() => window.__tts.said.length), 0, "nothing is read aloud unless asked");
  await m.locator("[data-act=dwspeak]").click();
  await page.waitForFunction(() => window.__tts.said.length === 1);
  const said = await page.evaluate(() => window.__tts.said[0]);
  assert.match(said, /AI is software that learns/); assert.doesNotMatch(said, /[#*`]|print\('hi'\)/, "no symbols or code read out");
  assert.match(await m.locator("[data-act=dwspeak]").getAttribute("aria-label"), /pause/i);
  await m.locator("[data-act=dwspeak]").click(); assert.equal(await page.evaluate(() => window.__tts.paused), true);
  await m.locator("[data-act=dwspeak]").click(); assert.equal(await page.evaluate(() => window.__tts.paused), false);
  await m.locator("[data-act=dwspeakstop]").click(); assert.equal(await page.evaluate(() => window.__tts.speaking), false);
  assert.equal(await m.locator("[data-act=dwspeakstop]").count(), 0);
  // the switch
  const sw = page.locator("#dwSpeakAuto"); assert.equal(await sw.isChecked(), false);
  await sw.check();
  g.respond = () => ({ text: "Paris is the capital of France." }); await page.fill("#dwInput", "Capital of France?"); await page.press("#dwInput", "Enter"); await waitAnswer(page, 1);
  await page.waitForFunction(() => window.__tts.said.includes("Paris is the capital of France."));
  await page.evaluate(() => window.__tts.finish());
  g.respond = () => ({ text: "Long. " + "Many words here. ".repeat(80) }); await page.fill("#dwInput", "Tell me everything"); await page.press("#dwInput", "Enter"); await waitAnswer(page, 2);
  await page.waitForTimeout(300); assert.equal(await page.evaluate(() => window.__tts.said.length), 2, "a long answer is not read out by itself");
  await page.reload(); await page.waitForSelector("#dwBtn:not([hidden])"); await page.click("#dwBtn"); await page.locator("#dwSpeakAuto").waitFor();
  assert.equal(await page.locator("#dwSpeakAuto").isChecked(), true, "the choice is remembered");
  // a browser that can't speak shows no Listen button and no switch
  const p2 = await newUser({ tts: false }); g.respond = () => ({ text: "Hello." });
  await p2.fill("#dwInput", "hello there"); await p2.press("#dwInput", "Enter"); await waitAnswer(p2, 0);
  assert.equal(await p2.locator("[data-act=dwspeak]").count(), 0); assert.equal(await p2.locator("#dwSpeakAuto").count(), 0);
});

test("phone (390 px): the microphone, listening panel and confirm card fit with no sideways scrolling, in the dark theme too", async () => {
  const page = await newUser({}, { width: 390, height: 844 });
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
  const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= 390 && document.querySelector("#dw").scrollWidth <= document.querySelector("#dw").clientWidth + 1);
  assert.ok(await fits());
  const box = await page.locator("#dwMic").boundingBox(); assert.ok(box.width >= 40 && box.height >= 40, "big enough to tap");
  await page.click("#dwMic"); await page.waitForSelector("#dwVoice"); await page.evaluate(() => window.__sr.say("Add a task to finish the very long physics lab record write-up with all diagrams tomorrow morning", true));
  assert.ok(await fits());
  g.respond = b => isExtract(b) ? { text: JSON.stringify({ intent: "create", tasks: [{ title: "Finish the very long physics lab record write-up with all diagrams", when: "tomorrow" }] }) } : { text: "x" };
  await page.click("[data-act=dwvoicedone]"); await page.waitForSelector("#dwVoice", { state: "detached" }); await page.press("#dwInput", "Enter");
  await (await waitAnswer(page, 0)).locator(".vc-card").waitFor(); assert.ok(await fits());
  assert.deepEqual(page.context().__errors, []);
});
