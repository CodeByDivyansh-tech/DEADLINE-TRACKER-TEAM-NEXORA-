// Deadline AI - Help: a general assistant (any subject: coding, maths, science, studies, everyday questions,
// planning) that also knows how Deadline Tracker works from the help guide.
// Gemini sees the question, the recent Help conversation and the matching help-guide text; never the user's tasks
// or schedule. Answers are plain Markdown (no JSON wrapper: that used to cut long answers off and lose them).
const crypto = require("crypto");
const { V, ApiError, SECURITY_HEADERS } = require("../http");
const F = require("./format");

const DEFAULT_INSTRUCTIONS = `You are Deadline AI, the assistant inside Deadline Tracker, a planning app used mostly by students and teams in India.
Be warm, clear and practical, like a helpful senior who explains things simply. Answer the actual question first, then add only what helps.
Use short sentences; for steps, a short numbered list. Avoid jargon; if a term is needed, explain it in a few words.
Never invent features, buttons, menus, dates, prices or deadlines. If you are not sure, say so briefly.`;
const NOT_IN_GUIDE = "The help guide doesn't cover that yet, so I don't want to guess about Deadline Tracker. I've passed your question to the admin so the guide can be improved. Anything else I can help with?";
const DONT_KNOW = "I don't know that one, and I don't want to guess. I've passed your question to the admin so the help guide can cover it. You can ask me how to use Deadline Tracker, for study or planning tips, or about almost anything else.";

// Which language the latest message is in. Hinglish = Hindi written in Latin letters ("kaise", "nahi", "mujhe").
const HINGLISH = /^(kya|kaise|kaisa|kaun|kab|kahan|kyu|kyun|kyon|hai|hain|ho|hoga|tha|thi|nahi|nahin|nhi|mujhe|mera|meri|mere|tum|tumhe|aap|aapka|apna|karna|karo|karu|karun|kare|karein|kar|raha|rahi|rahe|bata|batao|bataiye|samajh|chahiye|sakta|sakti|wala|wali|aur|bhi|kuch|bahut|accha|acha|theek|thik|bhai|yaar|matlab|kaam|padhai|abhi|jaldi|kal|aaj|se|ko|ka|ki|ke|mein|me|par|ye|yeh|wo|woh|ab|na|ji)$/;
function languageOf(text){
  const t = String(text || "");
  if (/[\u0900-\u097F]/.test(t)) return "Hindi";
  const words = t.toLowerCase().match(/[a-z]+/g) || [];
  const hits = words.filter(w => HINGLISH.test(w)).length;
  return hits >= 2 && hits / words.length >= 0.2 ? "Hinglish" : "English";
}
// Fixed rule, added after the (admin-editable) instructions so it can't be lost by editing them.
function languageRule(text){
  const lang = languageOf(text);
  const how = { English: "Reply in English.", Hinglish: "Reply in simple Hinglish (Hindi in Latin letters, the way the user wrote).", Hindi: "Reply in simple Hindi (Devanagari)." }[lang];
  return `LANGUAGE: The user's LATEST message is in ${lang}. ${how} Earlier messages in other languages don't matter; always match the latest message. This rule overrides any other language instruction above.`;
}

const MAX_ANSWER = 12000;
// Earlier messages sent with a question (the conversation's memory): the last 12, newest kept, at most ~12,000
// characters. Long old answers are shortened to their start and end (the newest answer keeps more), because the
// gist is enough for follow-ups and sending everything again makes every answer slower.
const shorten = (t, max) => t.length <= max ? t : t.slice(0, Math.round(max * .7)).trimEnd() + "\n[…shortened…]\n" + t.slice(-Math.round(max * .25)).trimStart();
function trimHistory(list){
  let n = 0; const out = []; let newestAnswer = true;
  for (let k = list.length - 1; k >= 0; k--) {
    let text = list[k].text || "";
    if (list[k].role !== "user") { text = shorten(text, newestAnswer ? 3000 : 900); newestAnswer = false; } else text = shorten(text, 1500);
    n += text.length; if (n > 12000) break; out.unshift({ role: list[k].role, text });
  }
  return out;
}
// Words that suggest a question is about the app itself (then the help guide is searched more thoroughly).
const APPISH = /\b(deadline tracker|deadline ai|this (app|site|website)|the (app|site|website)|apps?|website|tasks?|deadlines?|remind\w*|notif\w*|alerts?|habits?|calendar|workspaces?|accounts?|passwords?|log ?in|log ?out|sign ?up|sign ?in|install\w*|settings?|my plan|quick add|to-?do|daily tasks?|telegram|themes?|dark mode|export|import|undo|priorit\w*|progress|admin|carry|missed|overdue)\b/i;
// An instruction to add or change tasks, clear from its first words ("Add…", "Remind me to…", "Mark … as done").
// Anything less obvious is left to the chat model, which answers TASK_COMMAND when it is one.
const isCommand = t => { const s = String(t || "").replace(/^\s*((hey|hi|hello|ok|okay|please|pls|kindly)[,!. ]+)*/i, "");
  return /^(add|create|schedule|note down|put|remind me|set (a |up a )?(reminder|task)|make a (task|reminder|note)|new task)\b/i.test(s)
    || /^(mark|make|set|change|move|reschedule|postpone|shift)\b[\s\S]*\b(tasks?|priority|done|complete[d]?|finished|deadline|assignment|(to|for) (today|tomorrow|tonight|next \w+|this \w+|\w+day))\b/i.test(s); };
// What Gemini is asked when a message is a task command: only to pick out the words. Dates are worked out by our code.
const EXTRACT = `You turn what a person said to their to-do app into JSON. The text may come from speech recognition, so fix obvious mis-heard words and spelling and ignore fillers ("hey", "um", "please"). Reply with JSON only, in this shape:
{"intent":"create"|"change"|"unclear"|"none","tasks":[{"title":"","when":"","priority":"","hours":null,"deadline":false}],"change":{"target":"","priority":"","when":"","done":false},"question":""}

intent "create": they want one or more tasks added, or they list things they have to do.
- One item in "tasks" for each separate piece of work ("study biology and revise chemistry" is two).
- title: short and clear, in their words, starting with the verb if they gave one ("Study chemistry", "Complete Java assignment"). No date, time, priority or duration words in the title. Keep the language they used for the title.
- when: the day and time words THEY said for that task, written in plain English: "today", "tomorrow", "day after tomorrow", "Friday", "this Friday", "next Monday", "next week", "12 November", "tomorrow at 5 PM", "at 6 PM", "in two hours". Translate other languages ("kal" -> "tomorrow", "aaj" -> "today", "parso" -> "day after tomorrow"). If one day clearly covers several tasks, repeat it for each. If they gave no day or time for a task, use "". NEVER make up a day or a time.
- priority: "high", "medium" or "low" only if they said it ("urgent", "important" -> "high"); otherwise "".
- hours: how long they said it takes, as a number (2 for "two hours", 0.5 for "30 minutes"); otherwise null.
- deadline: true only if it must be handed in or finished by that moment ("due", "submit by", "by Friday", an exam); otherwise false.
intent "change": they want an existing task changed. target = the task's name as they said it; done = true to mark it finished; priority and when as above ("" if not said).
intent "unclear": it is a task instruction but you cannot tell which task or what to add (for example "add it for Friday" when nothing earlier says what "it" is). Put one short question in "question". Use the earlier messages to understand words like "it" or "that".
intent "none": it is not an instruction about tasks.`;
// A question about the person's own work (their saved tasks could help answer it).
const aboutMyWork = t => /\b(my|mere|meri|mera|mujhe|i have|i've got|i need to|help me)\b[\s\S]*\b(tasks?|deadlines?|work|kaam|day|week|schedule|exams?|assignments?|study|studies|padhai|plan|routine|priorit\w*|pending|to-?do|homework|projects?|workload)\b|\bwhat('s| is| are)? ?(due|pending|left|overdue)\b|\bwhat (should|do) i (do|complete|finish|focus on|start|study|have)\b|\b(plan|organi[sz]e|schedule|prioriti[sz]e)\b[\s\S]*\b(today|tomorrow|week|day|kal|aaj)\b|\b(today|tomorrow|aaj|kal|this week)\b[\s\S]*\b(plan|schedule|study|tasks?|work|deadlines?)\b/i.test(String(t || ""));
function parseJson(text){ const t = String(text || "").trim(); const a = t.indexOf("{"), b = t.lastIndexOf("}"); if (a < 0 || b < a) return null; try { return JSON.parse(t.slice(a, b + 1)); } catch (e) { return null; } }

function createHelp({ db, gemini, rag, conversations, plan }){
  const getSetting = (k, d) => { const r = db.prepare("SELECT v FROM settings WHERE k = ?").get(k); return r ? r.v : d; };
  const instructions = () => getSetting("instructions", DEFAULT_INSTRUCTIONS);
  // "all": answer any question (website ones still only from the guide). "focused": website + productivity tips only.
  const scope = () => getSetting("help_scope", "all") === "focused" ? "focused" : "all";
  const logQ = (user, q, answer, answered, sources, via) => {
    const qid = "q_" + crypto.randomBytes(8).toString("base64url");
    db.prepare("INSERT INTO questions (id, user_id, question, answer, answered, sources, via, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(qid, user.id, q.slice(0, 1000), (answer || "").slice(0, 4000), answered ? 1 : 0, JSON.stringify(sources || []), via, Date.now());
    return qid;
  };
  const srcOf = d => ({ title: d.heading, article: d.title });

  // ---- what Gemini is told ----
  const todayLine = tz => { let p; try { p = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: tz || "UTC" }).formatToParts(new Date()); } catch (e) { p = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).formatToParts(new Date()); }
    const v = k => p.find(x => x.type === k).value; return `Today is ${v("weekday")}, ${v("day")} ${v("month")} ${v("year")} for the user.`; };
  // Open tasks only, titles and dates only (never notes), the user's own rows only, soonest first.
  function taskContext(user, workspaceId){
    const rows = db.prepare(`SELECT title, due_date, due_time, plan_date, priority, status, progress, estimate_hours FROM tasks WHERE user_id = ? AND status <> 'done'${workspaceId ? " AND workspace_id = ?" : ""} ORDER BY due_at IS NULL, due_at, created_at LIMIT 30`).all(...[user.id].concat(workspaceId ? [workspaceId] : []));
    if (!rows.length) return "USER'S OPEN TASKS: none saved in Deadline Tracker right now.";
    return "USER'S OPEN TASKS (shared by the user for this question; soonest deadline first)\n" + rows.map(t =>
      `- ${String(t.title).slice(0, 90)} | ${t.due_date ? "due " + t.due_date + (t.due_time ? " " + t.due_time : "") : "no deadline"}${t.plan_date ? " | planned for " + t.plan_date : ""} | priority ${t.priority} | ${t.status}${t.progress ? " " + t.progress + "% done" : ""}${t.estimate_hours ? " | about " + t.estimate_hours + " h of work" : ""}`).join("\n");
  }
  // A task command: Gemini picks out the details (one short JSON request), our planner checks them and builds the
  // suggestion. If the AI is off, busy or answers nonsense, the planner's own rules read the sentence instead.
  // Nothing is saved here: the card is saved by /api/plan/apply after the person confirms.
  async function understand(P){
    const { user, message, conv, userMsg, prev } = P; let res = null, via = "engine";
    if (gemini.configured()) {
      try {
        const out = await gemini.generate({ system: EXTRACT, messages: prev.concat([{ role: "user", text: message }]), json: true, maxTokens: 1024, userId: user.id });
        const said = prev.filter(m => m.role === "user").slice(-3).map(m => m.text).concat([message]).join(" . ");
        res = plan.fromAi(user, parseJson(out.text), said); if (res) via = "ai";
      } catch (e) { res = null; }
    }
    if (!res) res = plan.respond(user, message);
    return engineReply(P, res, via);
  }
  function engineReply(P, res, via){
    const meta = Object.assign({ via, kind: "tasks", found: true }, res.actions && res.actions.length ? { proposal: { status: "pending", actions: res.actions } } : {});
    const reply = conversations.add(P.conv, "assistant", res.reply || "Okay.", meta);
    return { conversationId: P.conv.id, userMessage: P.userMsg, message: reply };
  }
  const sharing = user => { const r = db.prepare("SELECT ai_share_tasks v FROM users WHERE id = ?").get(user.id); return !!(r && r.v); };
  function systemPrompt({ message, currency, ctx, focused, tz, tasks }){
    return `${instructions()}

${languageRule(message)}

${todayLine(tz)}

You are a capable general-purpose assistant (like Google Gemini) that lives inside Deadline Tracker.

UNDERSTAND THE PERSON
- People write quickly: expect spelling mistakes, typos, missing words, loose grammar and informal or mixed language. Work out what they mean (their intent) and answer that. Never comment on their spelling or grammar.
- Short messages after an earlier answer are follow-up questions ("how many hours daily?", "give a real-life example", "and in Java?", "explain step 2"): answer them about the topic already being discussed. Never ask what subject they mean when the conversation shows it.
- Ask one short clarifying question only when you truly cannot give a useful answer without it. Otherwise make the most sensible assumption, say it in a few words, and answer.

HOW TO ANSWER
- Start with the answer. No greeting, no "Great question", don't repeat the question back, no long introduction, no closing summary that repeats what you said.
- Simple question: answer directly in one to three sentences.
- Complicated question: explain step by step in simple words, with one practical example.
- Technical or programming question: be accurate; give a short working code example in a fenced code block with the language name; for an error message, say the most likely cause first, then numbered steps to fix it, then how to check it worked.
- Learning question: teach the idea (what it is, why it works, a small example) instead of only giving the final answer; for maths, show the working.
- Advice, plans and recommendations: be specific and practical for this person's situation, using everything they told you in this conversation (subjects, time available, level, goal). Give real times, amounts and next actions, not generic tips. If they gave no details, give a sensible ready-to-use plan and say what you assumed.
- Use plain words and short sentences. Explain any necessary term in a few words. Use a heading, numbered steps, a table or a code block only when it makes the answer easier to read. Leave out disclaimers unless there is a real risk.

HONESTY
- You can't browse the internet and have no live data: for news, prices, scores, weather, results or anything that changes, say what you know up to your training, say it may be out of date, and suggest where to check. Never pretend to have looked something up, opened a link or read a file.
- If you are not sure of a fact, say so briefly instead of guessing. Never invent sources, quotes or numbers.

WHAT YOU COVER
1. How to use Deadline Tracker (the website or app itself): answer ONLY from the HELP GUIDE extracts below. Never describe features, buttons or menus that aren't in them. If the extracts don't answer a question about Deadline Tracker itself, reply with exactly NOT_IN_GUIDE and nothing else.
2. Study, productivity, planning and time management: give practical, specific advice and ready-to-use schedules.
${focused ? `3. Anything else (other topics): reply with exactly NOT_IN_GUIDE.` : `3. Everything else (general knowledge, science, maths, programming and debugging, AI and technology, English and writing, careers, business and startups, everyday questions, casual chat): answer fully and accurately from your own knowledge, like a good teacher. Politely refuse only what is harmful or illegal.`}
Greet back briefly if greeted.
${plan ? `
TASK COMMANDS
If the message tells you to add, save, note, schedule or be reminded of one or more tasks, lists things the user has to do so that they get put on their list, or tells you to change one of their tasks (mark it done, move it, change its priority), reply with exactly TASK_COMMAND and nothing else. The app then shows them the tasks to confirm. Never reply TASK_COMMAND to a question (including how to use the app), or to a request for advice, an explanation or a study plan.` : ""}

${tasks ? `${tasks}
These are the user's real tasks from Deadline Tracker. Use them for questions about their work, deadlines, priorities and schedule: name the actual tasks, respect the deadlines and priorities, and be realistic about time. Never invent tasks, deadlines or progress that aren't listed. You can only read this list: you cannot add, complete, delete, change or reschedule tasks. If they want that done, tell them to use the My Plan tab or Quick add, which save only after they confirm.`
  : `You can't see the user's tasks, deadlines or schedule in Deadline Tracker, and you can't change them. Still help fully with whatever they tell you in the chat (for example "I have chemistry and Java tomorrow": make the plan from that). ${plan ? `If they ask what is on their own saved list (their tasks, to-dos or deadlines for a day or week), reply with exactly MY_TASKS and nothing else; the app then answers from their list privately.` : `Only if they need their saved tasks looked at, tell them in one sentence that the My Plan tab does that.`} Never refuse a general question because of this.`}
If you used any HELP GUIDE extract, end with a last line like "Sources: [1], [2]". Otherwise don't add a sources line.

${F.styleRules(currency)}

HELP GUIDE
${ctx || "(no matching extracts)"}`;
  }

  // ---- one question, in steps: prepare (save the question, find guide text, build the request) -> ask -> shape ----
  async function prepare(user, b){
    const message = V.str(b.message, "message", { min: 1, max: 2000, required: true });
    const currency = F.pickCurrency(b.currency); // INR unless the person chose another currency
    const conv = conversations.getOrCreate(user, "help", b.conversationId, message);
    const prev = trimHistory(conversations.history(conv, 12).map(m => ({ role: m.role, text: m.text })));
    const userMsg = conversations.add(conv, "user", message);
    // follow-ups ("and if it was a mistake?") are searched together with the previous question
    const lastQ = [...prev].reverse().find(m => m.role === "user");
    // The embedding request to Google is only made when the question may be about the app and plain word matching
    // didn't already find the page. A general question ("what is AI?") goes straight to the answer.
    if (plan && isCommand(message)) return { user, message, currency, conv, prev, userMsg, command: true, r: { hits: [], found: false }, sources: [] };
    const km = rag.keywordMatch(message);
    const semantic = !(km && km.strong) && (APPISH.test(message) || (km && km.cover >= .5) || (!!lastQ && message.length < 60 && APPISH.test(lastQ.text)));
    let r = await rag.retrieve(message, 4, { semantic });
    if (!r.found && lastQ && (semantic || APPISH.test(lastQ.text))) r = await rag.retrieve(lastQ.text + " " + message, 4, { semantic });
    const sources = r.hits.map(srcOf);
    const P = { user, message, currency, conv, prev, userMsg, r, sources, focused: scope() === "focused" };
    P.finish = (text, meta) => {
      const qid = logQ(user, message, meta.found ? text : "", meta.found, meta.sources || [], meta.via);
      const reply = conversations.add(conv, "assistant", text, Object.assign({ qid }, meta, P.usedTasks ? { usedTasks: true } : {}));
      return { conversationId: conv.id, userMessage: userMsg, message: reply };
    };
    P.fromGuide = () => { const top = r.hits[0]; return P.finish(`${top.heading}\n${top.text}`, { found: true, via: "kb", sources: [srcOf(top)] }); };
    if (!gemini.configured()) return P;
    // the person's tasks go along only if they turned that on, and only with a question about their own work
    const tasks = sharing(user) && aboutMyWork(message) ? taskContext(user, typeof b.workspaceId === "string" ? b.workspaceId.slice(0, 64) : null) : "";
    P.usedTasks = !!tasks;
    const ctx = r.hits.map((d, i) => `[${i + 1}] ${d.title} > ${d.heading}\n${d.text}`).join("\n\n");
    P.request = { system: systemPrompt({ message, currency, ctx, focused: P.focused, tz: user.timezone, tasks }), messages: prev.concat([{ role: "user", text: message }]), maxTokens: gemini.maxTokens, userId: user.id };
    return P;
  }
  // The AI is unavailable (quota, outage, timeout): say so honestly, offer "Try again", and show the matching
  // part of the guide when there is one. Never a stack trace or Google's raw message.
  function failed(P, e){
    const { r, message, conv, userMsg } = P;
    const why = e.code === "quota" || e.code === "limited" || e.code === "blocked" ? e.message
      : e.code === "bad_key" ? "The AI key on the server isn't valid, so the admin needs to fix it."
      : e.code === "bad_model" ? "The AI model set on the server isn't available, so the admin needs to change it."
      : e.code === "timeout" ? "The AI took too long to answer."
      : e.code === "invalid_response" ? "I didn't get an answer that time." : "The AI isn't available right now.";
    if (r.found && e.code !== "blocked" && e.code !== "timeout") {
      const top = r.hits[0];
      return P.finish(`${why} You can try again${e.retryAfter && e.retryAfter > 60 ? " later" : " in a moment"}. Meanwhile, this part of the help guide might help:\n${top.heading}\n${top.text}`,
        { found: true, via: "kb", sources: [srcOf(top)], error: e.code, retry: message, retryAfter: e.retryAfter || 0 });
    }
    if (["quota", "limited", "unavailable", "timeout", "bad_key", "bad_model", "invalid_response", "upstream_error", "blocked"].includes(e.code)) {
      const tail = e.code === "blocked" ? "" : e.code === "timeout" ? " Please try again; shorter questions are quicker." : " Please try again in a moment.";
      const meta = e.code === "blocked" ? { via: "ai", found: false } : { error: e.code, retry: message, via: "kb", retryAfter: e.retryAfter || 0 };
      const reply = conversations.add(conv, "assistant", why + tail, meta);
      return { conversationId: conv.id, userMessage: userMsg, message: reply, error: e.code === "blocked" ? undefined : e.code };
    }
    throw e;
  }
  // Turns the model's raw text into the saved answer (sources, markers, money, length).
  function shape(P, out){
    const { r, sources, currency, message, focused, finish } = P;
    // Older answer format (a JSON object), still understood.
    const j = /^\s*\{[\s\S]*"answer"[\s\S]*\}\s*$/.test(out.text) ? parseJson(out.text) : null;
    if (j && typeof j.answer === "string") {
      if (j.found === false || !j.answer.trim() || j.kind === "other") return finish(DONT_KNOW, { found: false, via: "ai", sources: [] });
      if (j.kind !== "general" && !r.found) return finish(DONT_KNOW, { found: false, via: "ai", sources: [] }); // website claims need the guide
      const used = (Array.isArray(j.sources) ? j.sources : []).map(Number).filter(n => n >= 1 && n <= sources.length).map(n => sources[n - 1]);
      const answer = F.localizeMoney(F.cleanAnswer(j.answer), { currency, question: message });
      if (!answer) return finish(DONT_KNOW, { found: false, via: "ai", sources: [] });
      return finish(answer.slice(0, MAX_ANSWER), { found: true, via: "ai", kind: j.kind === "general" ? "general" : "website", model: out.model, sources: j.kind === "general" ? [] : (used.length ? used : sources.slice(0, 1)) });
    }
    let text = String(out.text || "").trim();
    if (plan && /^TASK_COMMAND\.?$/.test(text)) return { again: "command" };
    if (plan && /^MY_TASKS\.?$/.test(text)) return { again: "mine" };
    text = text.replace(/\n?(TASK_COMMAND|MY_TASKS)\.?\s*$/, "");
    if (/^NOT_IN_GUIDE\.?$/.test(text)) return finish(focused ? DONT_KNOW : NOT_IN_GUIDE, { found: false, via: "ai", sources: [] });
    text = text.replace(/\n?NOT_IN_GUIDE\.?\s*$/, "");
    // a last "Sources: [1], [2]" line: shown as "From the help guide: …", not in the text
    let used = [];
    const sm = text.match(/\n\s*\**sources?\**\s*:\s*([\[\]\d,\s]*|none)\s*$/i);
    if (sm) { used = (sm[1].match(/\d+/g) || []).map(Number).filter(n => n >= 1 && n <= sources.length).map(n => sources[n - 1]); text = text.slice(0, sm.index); }
    // guide numbers written inside sentences ("… study hours [4].") count as sources and are taken out of the text
    if (sources.length) text = F.outsideCode(text, part => part.replace(/\s?((?:\[\d{1,2}\])+)/g, (m, refs) => {
      const nums = (refs.match(/\d+/g) || []).map(Number);
      if (!nums.every(n => n >= 1 && n <= sources.length)) return m;
      nums.forEach(n => used.push(sources[n - 1])); return "";
    }));
    let answer = F.localizeMoney(F.cleanAnswer(text), { currency, question: message });
    if (!answer) return out.stopped ? finish("*Stopped before the answer started.*", { found: true, via: "ai", stopped: true, sources: [] }) : finish(DONT_KNOW, { found: false, via: "ai", sources: [] });
    if (answer.length > MAX_ANSWER) answer = answer.slice(0, MAX_ANSWER);
    if (out.partial) answer += `\n\n*The connection dropped before the answer finished. You can try again.*`;
    else if (!out.stopped && (out.truncated || answer.length >= MAX_ANSWER)) answer += `\n\n*This answer was cut short because it's very long. Ask me to "continue" for the rest.*`;
    const seen = [...new Map(used.map(x => [x.title + "|" + x.article, x])).values()];
    return finish(answer, Object.assign({ found: true, via: "ai", kind: seen.length ? "website" : "general", model: out.model, sources: seen, truncated: !!out.truncated || undefined },
      out.partial ? { partial: true, retry: message } : {}, out.stopped ? { stopped: true } : {}));
  }
  const noAi = P => P.r.found ? P.fromGuide() : P.finish(DONT_KNOW, { found: false, via: "kb", sources: [] });
  // The chat model said the message is a task command or a question about the person's own list.
  const followUp = (P, res) => !res.again ? res : res.again === "command" ? understand(P) : engineReply(P, plan.respond(P.user, P.message), "engine");
  async function chat(user, b){
    const P = await prepare(user, b);
    if (P.command) return understand(P);
    if (!P.request) return noAi(P);
    let out;
    try { out = await gemini.generate(P.request); } catch (e) { return failed(P, e); }
    return followUp(P, shape(P, out));
  }
  // What may be shown while the answer is still arriving: never the NOT_IN_GUIDE marker, a "Sources:" line,
  // guide numbers like [2], or the old JSON wrapper. The finished, tidied answer replaces it at the end.
  function visible(raw, nSources){
    let t = raw;
    if (/^\s*\{/.test(t)) return "";
    if (t.trim().length <= 13 && ["NOT_IN_GUIDE.", "TASK_COMMAND.", "MY_TASKS."].some(m => m.startsWith(t.trim()))) return "";
    t = t.replace(/\n?(NOT_IN_GUIDE|TASK_COMMAND|MY_TASKS)\.?\s*$/, "");
    const nl = t.lastIndexOf("\n"); const bare = t.slice(nl + 1).trim().replace(/\*/g, "").toLowerCase();
    if (bare && (/^sources?\s*:/.test(bare) || "sources:".startsWith(bare))) t = t.slice(0, Math.max(nl, 0));
    if (nSources) t = F.outsideCode(t, part => part.replace(/\s?((?:\[\d{1,2}\])+)/g, "")).replace(/\s?\[\d{0,2}$/, "");
    return t;
  }
  // Streamed answer. emit(event, data): "delta" { text } pieces to add, "replace" { text } when shown text must be
  // corrected, "wait" while a retry is running. Resolves to the same result as chat(). `signal` = the person stopped.
  async function chatStream(P, emit, signal){
    if (P.command) return understand(P);
    if (!P.request) return noAi(P);
    let raw = "", sent = "";
    const onText = piece => { raw += piece; const v = visible(raw, P.sources.length);
      if (v === sent) return;
      if (v.startsWith(sent)) emit("delta", { text: v.slice(sent.length) }); else emit("replace", { text: v });
      sent = v; };
    let out;
    try { out = await gemini.generateStream(Object.assign({}, P.request, { onText, signal, onRetry: n => emit("wait", { attempt: n }) })); }
    catch (e) { return failed(P, e); }
    return followUp(P, shape(P, out));
  }
  function getPrefs(user){ return { shareTasks: sharing(user) }; }
  function setPrefs(user, b){
    const v = V.bool(b.shareTasks, "shareTasks"); if (v === null) throw new ApiError(400, "invalid_shareTasks", "shareTasks must be true or false.", { field: "shareTasks" });
    db.prepare("UPDATE users SET ai_share_tasks = ?, updated_at = ? WHERE id = ?").run(v ? 1 : 0, Date.now(), user.id);
    return getPrefs(user);
  }
  function rate(user, b){
    const v = Number(b.rating);
    if (![1, -1, 0].includes(v)) throw new ApiError(400, "invalid_rating", "Rating must be 1, -1 or 0.");
    const r = db.prepare("UPDATE questions SET rating = ? WHERE id = ? AND user_id = ?").run(v || null, String(b.id || ""), user.id);
    if (!r.changes) throw new ApiError(404, "not_found", "Not found.");
    return { ok: true };
  }
  function suggestions(){
    const faqs = db.prepare("SELECT title FROM kb_sources WHERE kind = 'faq' ORDER BY updated_at, rowid LIMIT 4").all().map(r => r.title);
    return { help: faqs.length ? faqs : ["How do I create a task?", "How do reminders work?"] };
  }
  return { chat, prepare, chatStream, getPrefs, setPrefs, rate, suggestions, instructions, scope, DEFAULT_INSTRUCTIONS };
}
function routes(r, { help }){
  r.add("POST", "/api/chat", async (c) => help.chat(c.user, await c.json()), { auth: true });
  r.add("POST", "/api/help/chat", async (c) => help.chat(c.user, await c.json()), { auth: true });
  // The same answer, streamed as server-sent events so the first words show at once:
  //   start { conversationId, userMessage } -> delta { text }… (replace { text }, wait {}) -> done { conversationId, userMessage, message }
  r.add("POST", "/api/chat/stream", async (c) => {
    const P = await help.prepare(c.user, await c.json());   // a bad request still gets a normal JSON error
    const res = c.res;
    res.writeHead(200, Object.assign({}, SECURITY_HEADERS, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store, no-transform", "X-Accel-Buffering": "no", Connection: "keep-alive" }));
    const emit = (ev, data) => { if (!res.writableEnded && !res.destroyed) res.write(`event: ${ev}\ndata: ${JSON.stringify(data)}\n\n`); };
    const ctrl = new AbortController(); res.on("close", () => { if (!res.writableEnded) ctrl.abort(); });   // the person pressed Stop or left
    emit("start", { conversationId: P.conv.id, userMessage: P.userMsg });
    let out;
    try { out = await help.chatStream(P, emit, ctrl.signal); }
    catch (e) { out = { conversationId: P.conv.id, userMessage: P.userMsg, error: "error", message: { id: "local", role: "assistant", text: "Unable to connect right now. Please try again.", error: "error", retry: P.message, createdAt: new Date().toISOString() } }; }
    emit("done", out); res.end();
  }, { auth: true });
  r.add("GET", "/api/ai/prefs", (c) => help.getPrefs(c.user), { auth: true });
  r.add("PUT", "/api/ai/prefs", async (c) => help.setPrefs(c.user, await c.json()), { auth: true });
  r.add("POST", "/api/chat/rate", async (c) => help.rate(c.user, await c.json()), { auth: true });
  r.add("GET", "/api/help/suggestions", () => help.suggestions());
}
module.exports = { createHelp, routes, DEFAULT_INSTRUCTIONS, languageOf, trimHistory, aboutMyWork };
