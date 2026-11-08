// Deadline AI - Help: questions about using Deadline Tracker, and general productivity tips.
// Website answers come only from the knowledge base. Gemini sees the question, the recent Help conversation
// and the matching help-guide text; never the user's tasks or schedule.
const crypto = require("crypto");
const { V, ApiError } = require("../http");
const F = require("./format");

const DEFAULT_INSTRUCTIONS = `You are Deadline AI, the assistant inside Deadline Tracker, a planning app used mostly by students and teams in India.
Be warm, clear and practical, like a helpful senior who explains things simply. Answer the actual question first, then add only what helps.
Use short sentences; for steps, a short numbered list. Avoid jargon; if a term is needed, explain it in a few words.
Never invent features, buttons, menus, dates, prices or deadlines. If you are not sure, say so briefly.`;
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
    const prev = conversations.history(conv, 6).map(m => ({ role: m.role, text: m.text }));
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
    const system = `${instructions()}

${languageRule(message)}

You answer in the Help section of Deadline Tracker.
1. Questions about how to use Deadline Tracker (the website): answer ONLY from the HELP GUIDE extracts below (kind "website"). If they don't contain the answer, set "found" to false. Never describe features that aren't in the extracts.
2. General productivity, study or time-management advice: answer from general knowledge in a few practical tips (kind "general").
${scope() === "all" ? `3. Any other question (studies, coding, science, general knowledge, writing, everyday help): answer helpfully, accurately and briefly from general knowledge (kind "general"). If you aren't sure of a fact, say so instead of guessing. Refuse anything harmful or illegal politely. If you truly can't answer, set "found" to false.` : `Anything else (other topics, or a website question the extracts don't answer): set "found" to false.`}
You don't have access to the user's tasks. If they ask about their own tasks or schedule, tell them to use the My Plan tab.

${F.styleRules(currency)}

Reply with only this JSON: {"found": true|false, "kind": "website"|"general"|"other", "answer": "your answer", "sources": [numbers of the extracts you used]}

HELP GUIDE
${ctx || "(no matching extracts)"}`;
    let out;
    try { out = await gemini.generate({ system, messages: prev.concat([{ role: "user", text: message }]), json: true, maxTokens: 900, userId: user.id }); }
    catch (e) {
      // The AI is unavailable (quota, outage): say so honestly and still show the matching part of the guide.
      const why = e.code === "quota" || e.code === "limited" ? e.message : e.code === "bad_key" ? "The AI key on the server isn't valid, so the admin needs to fix it." : "The AI isn't available right now.";
      if (r.found) return fromGuide(`${why} Here's the matching part of the help guide:`);
      if (e.code === "quota" || e.code === "limited" || e.code === "unavailable" || e.code === "timeout" || e.code === "bad_key" || e.code === "bad_model") {
        const reply = conversations.add(conv, "assistant", `${why} Please try again later.`, { error: e.code, retry: message, via: "kb" });
        return { conversationId: conv.id, userMessage: userMsg, message: reply, error: e.code };
      }
      throw e;
    }
    const j = parseJson(out.text);
    if (!j || typeof j.answer !== "string") {
      // not the JSON we asked for: don't show unchecked text
      if (r.found) return fromGuide();
      return finish(DONT_KNOW, { found: false, via: "ai", sources: [], invalid: true });
    }
    if (j.found === false || !j.answer.trim() || j.kind === "other") return finish(DONT_KNOW, { found: false, via: "ai", sources: [] });
    if (j.kind !== "general" && !r.found) return finish(DONT_KNOW, { found: false, via: "ai", sources: [] }); // website claims need the guide
    const used = (Array.isArray(j.sources) ? j.sources : []).map(Number).filter(n => n >= 1 && n <= sources.length).map(n => sources[n - 1]);
    const answer = F.localizeMoney(F.cleanAnswer(j.answer), { currency, question: message });
    if (!answer) return finish(DONT_KNOW, { found: false, via: "ai", sources: [] });
    return finish(answer.slice(0, 4000), { found: true, via: "ai", kind: j.kind === "general" ? "general" : "website", model: out.model, sources: j.kind === "general" ? [] : (used.length ? used : sources.slice(0, 1)) });
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
