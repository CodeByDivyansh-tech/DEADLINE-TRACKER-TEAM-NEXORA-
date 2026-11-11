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
  // Turns a failed HTTP answer from Google into one of our error codes (never the raw message for server faults).
  function failure(status, j){
    const msg = (j && j.error && j.error.message) || `HTTP ${status}`; const st = j && j.error && j.error.status;
    if (status === 429 || st === "RESOURCE_EXHAUSTED") {
      const det = (j && j.error && j.error.details || []).find(d => d.retryDelay); const sec = det ? parseInt(det.retryDelay, 10) || 60 : 60;
      coolUntil = Date.now() + sec * 1000; return new AiError("quota", "The free AI limit was reached. Try again in a little while.", sec);
    }
    if (status === 401 || status === 403 || /API key not valid|API_KEY_INVALID/i.test(msg)) return new AiError("bad_key", "The Gemini API key on the server isn't valid.");
    if (status === 404) return new AiError("bad_model", `The AI model isn't available: ${msg}`);
    if (status >= 500) return new AiError("unavailable", "Google's AI service is having problems. Try again soon.");
    return new AiError("upstream_error", msg);
  }
  const netError = e => e instanceof AiError ? e : new AiError(e.name === "AbortError" || e.name === "TimeoutError" ? "timeout" : "unavailable", e.name === "AbortError" || e.name === "TimeoutError" ? "The AI took too long to answer." : "Couldn't reach Google's AI service. Check the internet connection.");
  async function call(path, body){
    const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), g.timeoutMs);
    try {
      const r = await fetch(`${g.baseUrl}/v1beta/${path}`, { method: "POST", signal: ctrl.signal, headers: { "content-type": "application/json", "x-goog-api-key": g.key }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => null);
      if (r.ok) return j;
      throw failure(r.status, j);
    } catch (e) { throw netError(e); } finally { clearTimeout(timer); }
  }
  // Retries: a server fault or network problem is tried up to 3 times in all (pauses of retryMs, then 3x that);
  // a timeout once more; limits, bad keys and bad requests never (retrying those only makes things worse).
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const mayRetry = (e, attempt) => (e.code === "unavailable" && attempt < 2) || (e.code === "timeout" && attempt < 1);
  const pause = attempt => g.retryMs * Math.pow(3, attempt);
  function toContents(messages){
    const contents = [];
    messages.filter(m => m.text).forEach(m => { const role = m.role === "user" ? "user" : "model"; const last = contents[contents.length - 1];
      if (last && last.role === role) last.parts[0].text += "\n" + m.text; else contents.push({ role, parts: [{ text: m.text }] }); });
    while (contents.length && contents[0].role !== "user") contents.shift();
    if (!contents.length || contents[contents.length - 1].role !== "user") throw new AiError("invalid_request", "The conversation must end with a question.");
    return contents;
  }
  // Only settings Gemini 3 models accept: no temperature/topP/topK (ignored now, rejected by later models).
  function requestBody({ system, messages, json, maxTokens }){
    const cfgGen = Object.assign({ maxOutputTokens: maxTokens || g.maxTokens || 4096 }, json ? { responseMimeType: "application/json" } : {});
    if (g.thinking) cfgGen.thinkingConfig = { thinkingLevel: g.thinking };
    const body = { contents: toContents(messages), generationConfig: cfgGen };
    if (system) body.systemInstruction = { parts: [{ text: system }] };
    return body;
  }
  const textOf = cand => cand && cand.content && Array.isArray(cand.content.parts) ? cand.content.parts.filter(p => !p.thought).map(p => p.text || "").join("") : "";
  const errStatus = e => e.code === "quota" ? "quota" : e.code === "limited" ? "limited" : "error";
  function emptyError(why, userId, t0){
    record({ userId, kind: "chat", model: g.model, status: "error", ms: Date.now() - t0, error: "invalid_response: " + why });
    return /SAFETY|BLOCK|PROHIBITED/i.test(why) ? new AiError("blocked", "I can't help with that one.") : new AiError("invalid_response", "The AI gave an empty answer.");
  }
  // Text answer in one piece. messages: [{ role: "user"|"assistant", text }]; must end with a user message.
  async function generate({ system, messages, json = false, maxTokens, userId }){
    check("chat", userId); recent.push(Date.now()); const t0 = Date.now();
    const body = requestBody({ system, messages, json, maxTokens });
    let j, attempt = 0;
    for (;;) {
      try { j = await call(`models/${encodeURIComponent(g.model)}:generateContent`, body); break; }
      catch (e) {
        if (mayRetry(e, attempt)) { await sleep(pause(attempt++)); continue; }
        record({ userId, kind: "chat", model: g.model, status: errStatus(e), ms: Date.now() - t0, error: e.code + ": " + e.message });
        log("ai", e); throw e;
      }
    }
    const cand = j && j.candidates && j.candidates[0];
    const text = textOf(cand);
    const u = (j && j.usageMetadata) || {};
    const finish = (cand && cand.finishReason) || "";
    if (!text.trim()) throw emptyError((j && j.promptFeedback && j.promptFeedback.blockReason) || finish || "empty", userId, t0);
    record({ userId, kind: "chat", model: g.model, status: "ok", prompt: u.promptTokenCount, output: u.candidatesTokenCount, ms: Date.now() - t0 });
    return { text, model: g.model, truncated: finish === "MAX_TOKENS" };
  }
  // Text answer as a stream: onText(piece) is called as each piece arrives, so the person sees the first words
  // straight away. Three time limits: the first words (firstTokenMs), a gap between pieces (idleMs), the whole
  // answer (streamMs). `signal` (the person pressed Stop or left) ends the call to Google at once.
  // Returns { text, model, truncated, partial, stopped }: partial = the stream broke after some text had arrived.
  async function generateStream({ system, messages, maxTokens, userId, onText, onRetry, signal }){
    check("chat", userId); recent.push(Date.now()); const t0 = Date.now();
    const body = requestBody({ system, messages, maxTokens });
    let attempt = 0;
    for (;;) {
      let text = "", finish = "", usage = {}, block = "", why = null;
      const ctrl = new AbortController();
      const stop = () => { why = why || "stopped"; ctrl.abort(); };
      if (signal) { if (signal.aborted) stop(); else signal.addEventListener("abort", stop, { once: true }); }
      let timer = setTimeout(() => { why = why || "timeout"; ctrl.abort(); }, g.firstTokenMs);
      const total = setTimeout(() => { why = why || "timeout"; ctrl.abort(); }, g.streamMs);
      const idle = () => { clearTimeout(timer); timer = setTimeout(() => { why = why || "idle"; ctrl.abort(); }, g.idleMs); };
      try {
        const r = await fetch(`${g.baseUrl}/v1beta/models/${encodeURIComponent(g.model)}:streamGenerateContent?alt=sse`, { method: "POST", signal: ctrl.signal, headers: { "content-type": "application/json", "x-goog-api-key": g.key }, body: JSON.stringify(body) });
        if (!r.ok) throw failure(r.status, await r.json().catch(() => null));
        const dec = new TextDecoder(); let buf = "";
        const take = line => {
          if (!line.startsWith("data:")) return;
          let j; try { j = JSON.parse(line.slice(5).trim()); } catch (e) { return; }   // a damaged piece is skipped, the rest still counts
          if (j.error) throw failure(j.error.code || 500, j);
          const cand = j.candidates && j.candidates[0]; const piece = textOf(cand);
          if (cand && cand.finishReason) finish = cand.finishReason;
          if (j.usageMetadata) usage = j.usageMetadata;
          if (j.promptFeedback && j.promptFeedback.blockReason) block = j.promptFeedback.blockReason;
          if (piece) { text += piece; idle(); if (onText) onText(piece); }
        };
        for await (const chunk of r.body) {
          buf += dec.decode(chunk, { stream: true });
          let k; while ((k = buf.search(/\r?\n/)) >= 0) { const line = buf.slice(0, k); buf = buf.slice(k + (buf[k] === "\r" ? 2 : 1)); take(line); }
        }
        if (buf) take(buf);
        if (!text.trim()) throw emptyError(block || finish || "empty", userId, t0);
        record({ userId, kind: "chat", model: g.model, status: "ok", prompt: usage.promptTokenCount, output: usage.candidatesTokenCount, ms: Date.now() - t0 });
        return { text, model: g.model, truncated: finish === "MAX_TOKENS" };
      } catch (e0) {
        if (why === "stopped") { record({ userId, kind: "chat", model: g.model, status: "ok", ms: Date.now() - t0, error: "stopped by the user" }); return { text, model: g.model, stopped: true }; }
        // some of the answer already arrived: keep it instead of starting again (the person has read it)
        if (text.trim()) { record({ userId, kind: "chat", model: g.model, status: "ok", ms: Date.now() - t0, error: "stream ended early: " + (why || e0.code || e0.name) }); return { text, model: g.model, partial: true }; }
        const e = e0 instanceof AiError ? e0 : why ? new AiError("timeout", "The AI took too long to answer.") : netError(e0);
        if (e.code !== "blocked" && e.code !== "invalid_response" && mayRetry(e, attempt)) { if (onRetry) onRetry(attempt + 1); await sleep(pause(attempt++)); if (signal && signal.aborted) return { text: "", model: g.model, stopped: true }; continue; }
        if (e.code !== "blocked" && e.code !== "invalid_response") record({ userId, kind: "chat", model: g.model, status: errStatus(e), ms: Date.now() - t0, error: e.code + ": " + e.message });
        log("ai", e); throw e;
      } finally { clearTimeout(timer); clearTimeout(total); if (signal) signal.removeEventListener("abort", stop); }
    }
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
  return { configured, generate, generateStream, embed, maxTokens: g.maxTokens || 4096, model: g.model, embedModel: g.embedModel, status: () => ({ configured: configured(), model: g.model, embedModel: g.embedModel, coolingDownSeconds: Math.max(0, Math.ceil((coolUntil - Date.now()) / 1000)), limits: { rpm: g.rpm, rpd: g.rpd, perUserDaily: g.userDaily } }) };
}
module.exports = { createGemini, AiError };
