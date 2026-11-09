// Deadline AI - Help: a general assistant (any subject: coding, maths, science, studies, everyday questions,
// planning) that also knows how Deadline Tracker works from the help guide.
// Gemini sees the question, the recent Help conversation and the matching help-guide text; never the user's tasks
// or schedule. Answers are plain Markdown (no JSON wrapper: that used to cut long answers off and lose them).
const crypto = require("crypto");
const { V, ApiError } = require("../http");
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
// Earlier messages sent with a question: the last 12, but at most ~16,000 characters (newest kept).
function trimHistory(list){
  let n = 0; const out = [];
  for (let k = list.length - 1; k >= 0; k--) { n += (list[k].text || "").length; if (n > 16000) break; out.unshift(list[k]); }
  return out;
}
function parseJson(text){ const t = String(text || "").trim(); const a = t.indexOf("{"), b = t.lastIndexOf("}"); if (a < 0 || b < a) return null; try { return JSON.parse(t.slice(a, b + 1)); } catch (e) { return null; } }

function createHelp({ db, gemini, rag, conversations }){
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

  async function chat(user, b){
    const message = V.str(b.message, "message", { min: 1, max: 2000, required: true });
    const currency = F.pickCurrency(b.currency); // INR unless the person chose another currency
    const conv = conversations.getOrCreate(user, "help", b.conversationId, message);
    const prev = trimHistory(conversations.history(conv, 12).map(m => ({ role: m.role, text: m.text })));
    const userMsg = conversations.add(conv, "user", message);
    // follow-ups ("and if it was a mistake?") are searched together with the previous question
    const lastQ = [...prev].reverse().find(m => m.role === "user");
    let r = await rag.retrieve(message);
    if (!r.found && lastQ) r = await rag.retrieve(lastQ.text + " " + message);
    const sources = r.hits.map(srcOf);
    const finish = (text, meta) => {
      const qid = logQ(user, message, meta.found ? text : "", meta.found, meta.sources || [], meta.via);
      const reply = conversations.add(conv, "assistant", text, Object.assign({ qid }, meta));
      return { conversationId: conv.id, userMessage: userMsg, message: reply };
    };
    const fromGuide = (note) => { const top = r.hits[0]; return finish(`${note ? note + "\n" : ""}${top.heading}\n${top.text}`, { found: true, via: "kb", sources: [srcOf(top)] }); };

    if (!gemini.configured()) return r.found ? fromGuide() : finish(DONT_KNOW, { found: false, via: "kb", sources: [] });
    const ctx = r.hits.map((d, i) => `[${i + 1}] ${d.title} > ${d.heading}\n${d.text}`).join("\n\n");
    const focused = scope() === "focused";
    const system = `${instructions()}

${languageRule(message)}

You are a helpful general assistant, like Google Gemini, inside Deadline Tracker's Help section.
1. Questions about how to use Deadline Tracker (the website): answer ONLY from the HELP GUIDE extracts below. Never describe features, buttons or menus that aren't in them. If the extracts don't answer a Deadline Tracker question, reply with exactly NOT_IN_GUIDE and nothing else.
2. Study, productivity and time-management questions: give practical, specific advice.
${focused ? `3. Anything else (other topics): reply with exactly NOT_IN_GUIDE.` : `3. Any other question (programming, maths, science, general knowledge, writing, technology, everyday life): answer it fully and accurately from your own knowledge, like a good teacher. If you aren't sure of a fact, say so instead of guessing. Politely refuse anything harmful or illegal.`}
Use the earlier messages for follow-ups ("and in Java?", "explain the second step"). Greet back briefly if greeted.
You can't see or change the user's tasks. If they ask about their own tasks or schedule, or want you to add one, tell them to use the My Plan tab, which can.
If you used any HELP GUIDE extract, end with a last line like "Sources: [1], [2]". Otherwise don't add a sources line.

${F.styleRules(currency)}

HELP GUIDE
${ctx || "(no matching extracts)"}`;
    let out;
    try { out = await gemini.generate({ system, messages: prev.concat([{ role: "user", text: message }]), maxTokens: gemini.maxTokens, userId: user.id }); }
    catch (e) {
      // The AI is unavailable (quota, outage, timeout): say so honestly, offer "Try again", and show the matching
      // part of the guide when there is one.
      const why = e.code === "quota" || e.code === "limited" || e.code === "blocked" ? e.message
        : e.code === "bad_key" ? "The AI key on the server isn't valid, so the admin needs to fix it."
        : e.code === "bad_model" ? "The AI model set on the server isn't available, so the admin needs to change it."
        : e.code === "timeout" ? "The AI took too long to answer." : "The AI isn't available right now.";
      if (r.found && e.code !== "blocked" && e.code !== "timeout") {
        // show the closest part of the help guide too, but still offer "Try again" (the question may not be about the website)
        const top = r.hits[0];
        return finish(`${why} You can try again${e.retryAfter && e.retryAfter > 60 ? " later" : " in a moment"}. Meanwhile, this part of the help guide might help:\n${top.heading}\n${top.text}`,
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
    if (/^NOT_IN_GUIDE\.?$/.test(text)) return finish(focused ? DONT_KNOW : NOT_IN_GUIDE, { found: false, via: "ai", sources: [] });
    text = text.replace(/\n?NOT_IN_GUIDE\.?\s*$/, "");
    // a last "Sources: [1], [2]" line: shown as "From the help guide: …", not in the text
    let used = [];
    const sm = text.match(/\n\s*\**sources?\**\s*:\s*([\[\]\d,\s]*|none)\s*$/i);
    if (sm) { used = (sm[1].match(/\d+/g) || []).map(Number).filter(n => n >= 1 && n <= sources.length).map(n => sources[n - 1]); text = text.slice(0, sm.index); }
    let answer = F.localizeMoney(F.cleanAnswer(text), { currency, question: message });
    if (!answer) return finish(DONT_KNOW, { found: false, via: "ai", sources: [] });
    if (answer.length > MAX_ANSWER) answer = answer.slice(0, MAX_ANSWER);
    if (out.truncated || answer.length >= MAX_ANSWER) answer += `\n\n*This answer was cut short because it's very long. Ask me to "continue" for the rest.*`;
    const seen = [...new Map(used.map(x => [x.title + "|" + x.article, x])).values()];
    return finish(answer, { found: true, via: "ai", kind: seen.length ? "website" : "general", model: out.model, sources: seen, truncated: !!out.truncated || undefined });
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
  return { chat, rate, suggestions, instructions, scope, DEFAULT_INSTRUCTIONS };
}
function routes(r, { help }){
  r.add("POST", "/api/chat", async (c) => help.chat(c.user, await c.json()), { auth: true });
  r.add("POST", "/api/help/chat", async (c) => help.chat(c.user, await c.json()), { auth: true });
  r.add("POST", "/api/chat/rate", async (c) => help.rate(c.user, await c.json()), { auth: true });
  r.add("GET", "/api/help/suggestions", () => help.suggestions());
}
module.exports = { createHelp, routes, DEFAULT_INSTRUCTIONS, languageOf };
