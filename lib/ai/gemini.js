// Google Gemini, through our server only. The key (GEMINI_API_KEY) never reaches the browser.
// Used for public website help and general productivity tips, never for users' private tasks.
// Free tier only: we keep our own limits below Google's free-tier limits, stop after a 429 until Google says
// we may retry, and there is no paid fallback.
class AiError extends Error { constructor(code, message, retryAfter){ super(message); this.code = code; this.retryAfter = retryAfter; } }

function createGemini(cfg, db, log){
  const g = cfg.gemini;
  const recent = []; const recentEmbed = []; let coolUntil = 0;
  const configured = () => !!g.key;
  const record = (row) => { try { db.prepare("INSERT INTO ai_usage (user_id, kind, model, status, prompt_tokens, output_tokens, latency_ms, error, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(row.userId || null, row.kind, row.model, row.status, row.prompt ?? null, row.output ?? null, row.ms ?? null, row.error ? String(row.error).slice(0, 500) : null, Date.now()); } catch (e) {} };
  const windowCount = (arr, ms) => { const now = Date.now(); while (arr.length && now - arr[0] > ms) arr.shift(); return arr.length; };
  function check(kind, userId){
    if (!configured()) throw new AiError("no_key", "AI isn't set up on this server (no GEMINI_API_KEY).");
    if (Date.now() < coolUntil) throw new AiError("quota", "The free AI limit was reached. Try again in a little while.", Math.ceil((coolUntil - Date.now()) / 1000));
    if (kind === "chat") {
      if (windowCount(recent, 60e3) >= g.rpm) throw new AiError("limited", "The assistant is busy. Try again in a minute.", 60);
      const day = db.prepare("SELECT COUNT(*) n FROM ai_usage WHERE kind = 'chat' AND status IN ('ok', 'error') AND created_at > ?").get(Date.now() - 864e5).n;
      if (day >= g.rpd) throw new AiError("quota", "Today's free AI limit for this site has been used. Help answers from the guide still work.", 3600);
      if (userId) { const mine = db.prepare("SELECT COUNT(*) n FROM ai_usage WHERE kind = 'chat' AND user_id = ? AND status = 'ok' AND created_at > ?").get(userId, Date.now() - 864e5).n;
        if (mine >= g.userDaily) throw new AiError("limited", `You've used your ${g.userDaily} AI answers for today. Answers from the help guide still work.`, 3600); }
    } else if (windowCount(recentEmbed, 60e3) >= g.embedRpm) throw new AiError("limited", "Too many indexing requests. Try again in a minute.", 60);
  }
  async function call(path, body){
    const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), g.timeoutMs);
    try {
      const r = await fetch(`${g.baseUrl}/v1beta/${path}`, { method: "POST", signal: ctrl.signal, headers: { "content-type": "application/json", "x-goog-api-key": g.key }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => null);
      if (r.ok) return j;
      const msg = (j && j.error && j.error.message) || `HTTP ${r.status}`; const status = j && j.error && j.error.status;
      if (r.status === 429 || status === "RESOURCE_EXHAUSTED") {
        const det = (j && j.error && j.error.details || []).find(d => d.retryDelay); const sec = det ? parseInt(det.retryDelay, 10) || 60 : 60;
        coolUntil = Date.now() + sec * 1000; throw new AiError("quota", "The free AI limit was reached. Try again in a little while.", sec);
      }
      if (r.status === 401 || r.status === 403 || /API key not valid|API_KEY_INVALID/i.test(msg)) throw new AiError("bad_key", "The Gemini API key on the server isn't valid.");
      if (r.status === 404) throw new AiError("bad_model", `The AI model isn't available: ${msg}`);
      if (r.status >= 500) throw new AiError("unavailable", "Google's AI service is having problems. Try again soon.");
      throw new AiError("upstream_error", msg);
    } catch (e) {
      if (e instanceof AiError) throw e;
      throw new AiError(e.name === "AbortError" ? "timeout" : "unavailable", e.name === "AbortError" ? "The AI took too long to answer." : "Couldn't reach Google's AI service. Check the internet connection.");
    } finally { clearTimeout(timer); }
  }
  // Text answer. messages: [{ role: "user"|"assistant", text }]; must end with a user message.
  async function generate({ system, messages, json = false, maxTokens = 900, userId }){
    check("chat", userId); recent.push(Date.now()); const t0 = Date.now();
    const contents = [];
    messages.filter(m => m.text).forEach(m => { const role = m.role === "user" ? "user" : "model"; const last = contents[contents.length - 1];
      if (last && last.role === role) last.parts[0].text += "\n" + m.text; else contents.push({ role, parts: [{ text: m.text }] }); });
    while (contents.length && contents[0].role !== "user") contents.shift();
    if (!contents.length || contents[contents.length - 1].role !== "user") throw new AiError("invalid_request", "The conversation must end with a question.");
    const body = { contents, generationConfig: Object.assign({ maxOutputTokens: maxTokens }, json ? { responseMimeType: "application/json" } : {}) };
    if (system) body.systemInstruction = { parts: [{ text: system }] };
    let j, attempt = 0;
    for (;;) {
      try { j = await call(`models/${encodeURIComponent(g.model)}:generateContent`, body); break; }
      catch (e) {
        if (e.code === "unavailable" && attempt++ < 1) { await new Promise(r => setTimeout(r, 800)); continue; }
        record({ userId, kind: "chat", model: g.model, status: e.code === "quota" ? "quota" : e.code === "limited" ? "limited" : "error", ms: Date.now() - t0, error: e.code + ": " + e.message });
        log("ai", e); throw e;
      }
    }
    const cand = j && j.candidates && j.candidates[0];
    const text = cand && cand.content && Array.isArray(cand.content.parts) ? cand.content.parts.map(p => p.text || "").join("") : "";
    const u = (j && j.usageMetadata) || {};
    if (!text.trim()) {
      const why = (j && j.promptFeedback && j.promptFeedback.blockReason) || (cand && cand.finishReason) || "empty";
      record({ userId, kind: "chat", model: g.model, status: "error", ms: Date.now() - t0, error: "invalid_response: " + why });
      throw new AiError("invalid_response", "The AI gave an empty answer.");
    }
    record({ userId, kind: "chat", model: g.model, status: "ok", prompt: u.promptTokenCount, output: u.candidatesTokenCount, ms: Date.now() - t0 });
    return { text, model: g.model };
  }
  // Embeddings for the knowledge base (documents) and for questions (queries).
  async function embed(texts, taskType){
    const out = [];
    for (let i = 0; i < texts.length; i += 100) {
      check("embed"); recentEmbed.push(Date.now()); const t0 = Date.now();
      const batch = texts.slice(i, i + 100);
      let j;
      try { j = await call(`models/${encodeURIComponent(g.embedModel)}:batchEmbedContents`, { requests: batch.map(t => ({ model: `models/${g.embedModel}`, content: { parts: [{ text: t.slice(0, 8000) }] }, taskType, outputDimensionality: g.embedDims })) }); }
      catch (e) { record({ kind: "embed", model: g.embedModel, status: e.code === "quota" ? "quota" : "error", ms: Date.now() - t0, error: e.code + ": " + e.message }); throw e; }
      const vecs = (j && j.embeddings || []).map(e => e.values);
      if (vecs.length !== batch.length || vecs.some(v => !Array.isArray(v) || !v.length)) { record({ kind: "embed", model: g.embedModel, status: "error", error: "invalid_response" }); throw new AiError("invalid_response", "The embedding answer was incomplete."); }
      record({ kind: "embed", model: g.embedModel, status: "ok", ms: Date.now() - t0 });
      out.push(...vecs);
    }
    return out;
  }
  return { configured, generate, embed, model: g.model, embedModel: g.embedModel, status: () => ({ configured: configured(), model: g.model, embedModel: g.embedModel, coolingDownSeconds: Math.max(0, Math.ceil((coolUntil - Date.now()) / 1000)), limits: { rpm: g.rpm, rpd: g.rpd, perUserDaily: g.userDaily } }) };
}
module.exports = { createGemini, AiError };
