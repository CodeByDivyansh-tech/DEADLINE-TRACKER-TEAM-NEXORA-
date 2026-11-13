
/* =========================================================
   Deadline AI: the floating chat window
   Two clearly separate parts:
   - Help: questions about using Deadline Tracker, answered only from the
     help guide on the server (it says "I don't know" otherwise).
   - My Plan: your own tasks. The same assistant as the Assistant page:
     it suggests, you approve, then it saves.
   ========================================================= */
const DW = { open: false, tab: "help", busy: false, timeoutMs: 60000, live: null, ctrl: null, share: null, shareAsk: false, draft: { help: "", plan: "" }, sugg: null, helpConv: null, helpMsgs: [], helpLoaded: false };
// With the server, Help conversations are stored on the server (history); without it they stay in this browser.
const helpChat = () => { if (ACCOUNT.on) return DW.helpMsgs; state.helpChat = state.helpChat || []; return state.helpChat; };
const fromServerMsg = m => ({ id: m.id, role: m.role === "user" ? "user" : "ai", text: m.text, t: m.createdAt, found: m.found, sources: m.sources || [], via: m.via, qid: m.qid, error: !!m.error, retry: m.retry, kind: m.kind, stopped: !!m.stopped, partial: !!m.partial, usedTasks: !!m.usedTasks,
  serverId: m.id, proposal: m.proposal ? { status: m.proposal.status, result: m.proposal.result ? { created: m.proposal.result.created, updated: m.proposal.result.updated, done: m.proposal.result.completed } : null, actions: (m.proposal.actions || []).map(fromServerAction) } : null });
async function loadHelpHistory(){
  DW.helpLoaded = true;
  try {
    const r = await apiJSON("GET", "/api/conversations?kind=help");
    const last = r.ok && r.json.conversations && r.json.conversations[0];
    if (!last) return;
    const m = await apiJSON("GET", `/api/conversations/${encodeURIComponent(last.id)}/messages`);
    if (m.ok && !DW.helpMsgs.length) { DW.helpConv = last.id; DW.helpMsgs = m.json.messages.map(fromServerMsg); DW.scroll = true; renderWidget(); }
  } catch (e) {}
}
const PLAN_SUGG = { student: ["What should I complete tomorrow?", "I have too much work. Help me organise it.", "kal Java assignment submit karna hai aur DSA practice 2 ghante"], company: ["What should I complete tomorrow?", "I have too much work. Help me organise it.", "Tomorrow I need to finish the API docs and prepare the demo"], personal: ["What should I complete tomorrow?", "I have too much work. Help me organise it.", "Tomorrow I need to pay the electricity bill and call mom"] };
const HELP_SUGG = ["How do reminders work?", "Explain recursion with a Python example", "Solve 2x + 5 = 17 step by step", "How can I stop procrastinating?"];
// Questions about the person's own tasks belong in My Plan, not the help guide.
const looksPersonal = t => planIntent(t, W(), Date.now()) || /\b(my|mere|meri|mera|mujhe)\b[\s\S]*\b(tasks?|deadlines?|work|kaam|day|schedule|exams?|assignments?)\b[\s\S]*\b(today|tomorrow|aaj|kal|this week|pending|left|due)\b|\bwhat('s| is) (due|pending|left)\b|\bwhat should i (do|complete|finish|focus on|start)\b/i.test(t);

function dwTime(iso){ try { return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); } catch (e) { return ""; } }
// Answers use Markdown: "## " headings, "- " or "1." lists, **bold**, *italic*, `code`, ``` code blocks ```
// (with the language and a Copy button) and | tables |. Everything is escaped first, so nothing runs as HTML.
function dwText(t){
  const inline = s => s.replace(/`([^`\n]+)`/g, (m, c) => `\u0000${c}\u0001`).replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>").replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, "$1<em>$2</em>").replace(/\u0000([^\u0001]*)\u0001/g, "<code>$1</code>");
  const out = []; let para = [], list = null, code = null, table = null;
  const flushP = () => { if (para.length) { out.push(`<p>${inline(para.join(" "))}</p>`); para = []; } };
  const flushL = () => { if (list) { out.push(`<${list.tag}>${list.items.map(i => `<li>${inline(i)}</li>`).join("")}</${list.tag}>`); list = null; } };
  const cells = l => l.replace(/^\|/, "").replace(/\|$/, "").split("|").map(c => c.trim());
  const flushT = () => { if (!table) return;
    const rows = table.filter(l => !/^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$/.test(l));
    if (table.length > 1 && rows.length < table.length) { const [h, ...b] = rows; out.push(`<div class="md-table"><table><thead><tr>${cells(h).map(c => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>${b.map(r => `<tr>${cells(r).map(c => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`); }
    else para.push(...table);
    table = null; };
  esc(String(t || "")).split("\n").forEach(raw => {
    if (code) { if (/^\s*```\s*$/.test(raw)) { out.push(`<div class="md-code"><div class="code-h"><span>${code.lang || "code"}</span><button type="button" class="btn ghost xs" data-act="dwcopy">${IC.copy || ""}Copy</button></div><pre><code>${code.lines.join("\n")}</code></pre></div>`); code = null; } else code.lines.push(raw); return; }
    const l = raw.trim(); let m;
    if ((m = l.match(/^```\s*([\w#+.-]*)\s*$/))) { flushP(); flushL(); flushT(); code = { lang: m[1], lines: [] }; return; }
    if (/^\|.*\|$/.test(l)) { flushP(); flushL(); (table = table || []).push(l); return; }
    flushT();
    if (!l) { flushP(); flushL(); }
    else if ((m = l.match(/^#{1,6}\s+(.*)$/))) { flushP(); flushL(); out.push(`<h4>${inline(m[1].replace(/\s*#+$/, ""))}</h4>`); }
    else if ((m = l.match(/^(?:[-•*])\s+(.*)$/)) || (m = l.match(/^\d+[.)]\s+(.*)$/))) {
      const tag = /^\d/.test(l) ? "ol" : "ul"; flushP(); if (list && list.tag !== tag) flushL(); if (!list) list = { tag, items: [] }; list.items.push(m[1]);
    } else { flushL(); para.push(l); }
  });
  if (code) out.push(`<div class="md-code"><div class="code-h"><span>${code.lang || "code"}</span><button type="button" class="btn ghost xs" data-act="dwcopy">Copy</button></div><pre><code>${code.lines.join("\n")}</code></pre></div>`);
  flushT(); flushP(); flushL();
  return `<div class="md">${out.join("")}</div>`;
}
function helpMsgHTML(m){
  if (m.role === "user") return `<div class="msg user"><div class="bubble">${esc(m.text)}<time>${dwTime(m.t)}</time></div></div>`;
  // an answer that is still being written: just the text so far (no buttons until it is complete)
  if (m.streaming) return `<div class="msg ai streaming" data-hmsg="${m.id}"><span class="orb sm spin" aria-hidden="true"></span><div class="bubble">${dwText(m.text)}</div></div>`;
  const retry = m.error || (m.partial && m.retry);
  const speaking = SPK.id === m.id;
  return `<div class="msg ai${m.error ? " error" : ""}${m.found === false ? " unknown" : ""}" data-hmsg="${m.id}"><span class="orb sm" aria-hidden="true"></span><div class="bubble">${dwText(m.text)}
    ${m.proposal ? vcHTML(m) : ""}
    ${m.stopped ? `<p class="dw-src">${IC.info}<span>Stopped. Ask again if you want the rest.</span></p>` : ""}
    ${m.sources && m.sources.length ? `<p class="dw-src">${IC.info}<span>From the help guide: ${m.sources.map(s => esc(s.title)).join(" · ")}</span></p>` : ""}
    ${retry ? `<button class="btn sm" type="button" data-act="dwretry">Try again</button>` : ""}
    <div class="dw-meta"><time>${dwTime(m.t)}</time>${m.via ? `<span class="via">${m.kind === "tasks" ? (m.via === "ai" ? "Understood with Google Gemini · saved only when you confirm" : "Read with built-in rules · saved only when you confirm") : m.via === "engine" ? "From your saved tasks (private)" : m.via === "ai" ? (m.usedTasks ? "Google Gemini · used your task list" : m.kind === "general" ? "Google Gemini" : "Google Gemini · from the help guide") : m.via === "kb" ? "Help guide" : ""}</span>` : ""}
      ${!m.error && m.text && canSpeak() ? `<button type="button" class="btn ghost xs dw-copy" data-act="dwspeak" aria-label="${speaking ? (SPK.paused ? "Resume reading" : "Pause reading") : "Listen to this answer"}">${speaking ? (SPK.paused ? IC.play + "Resume" : IC.pause + "Pause") : VC_IC.speaker + "Listen"}</button>${speaking ? `<button type="button" class="btn ghost xs dw-copy" data-act="dwspeakstop" aria-label="Stop reading">Stop</button>` : ""}` : ""}
      ${!m.error && m.text ? `<button type="button" class="btn ghost xs dw-copy" data-act="dwcopymsg" aria-label="Copy this answer">${IC.copy || ""}Copy</button>` : ""}
      ${m.qid ? `<span class="dw-rate" role="group" aria-label="Was this helpful?"><button type="button" class="ib" data-act="dwrate" data-v="1" aria-pressed="${m.rating === 1}" aria-label="Helpful" title="Helpful">👍</button><button type="button" class="ib" data-act="dwrate" data-v="-1" aria-pressed="${m.rating === -1}" aria-label="Not helpful" title="Not helpful">👎</button></span>` : ""}</div></div></div>`;
}
// Leaving the page or switching away stops the microphone at once.
document.addEventListener("visibilitychange", () => { if (document.hidden) voiceCancel(); });
window.addEventListener("pagehide", () => { voiceCancel(); stopSpeaking(); });
// Styles for the voice parts. They live with the code (not in the page) so the page itself stays small; they are
// added once, when the Deadline AI window is first built.
const VOICE_CSS = ".dw-mic{background:var(--surface-2);color:var(--steel-ink);border:1px solid var(--line);transition:transform .15s ease,background .15s ease}.dw-mic:hover{background:var(--line)}.dw-mic:active{transform:scale(.94)}.dw-mic:disabled{opacity:.45}.dw-vnote{margin:0 12px 8px;padding:8px 10px;border-radius:12px;background:var(--surface-2);border:1px solid var(--line);font-size:12.5px;line-height:1.45;color:var(--ink);display:flex;gap:8px;align-items:flex-start}.dw-vnote svg{width:14px;height:14px;flex:none;margin-top:2px}.dw-vnote span{flex:1;min-width:0}.dw-vnote .ib{flex:none;width:22px;height:22px;font-size:15px;line-height:1}.dw-voice{margin:0 12px 12px;padding:12px;border-radius:16px;background:var(--surface-2);border:1px solid var(--line);display:flex;flex-direction:column;gap:10px}.dw-voice .vhead{display:flex;align-items:center;gap:10px;font-size:13px;font-weight:600;color:var(--ink)}.dw-voice .vstatus{flex:1}.dw-voice time{font:500 12px/1 var(--mono,ui-monospace,monospace);color:var(--muted)}.vwave{display:inline-flex;align-items:center;gap:3px;height:22px}.vwave i{width:3px;height:6px;border-radius:2px;background:var(--steel-ink);opacity:.45}.dw-voice.listening .vwave i{opacity:.7}.dw-voice.listening.hearing .vwave i{opacity:1;animation:vwave 1.1s ease-in-out infinite}.dw-vnote .vretry{margin-left:6px;flex:none}.vwave i:nth-child(2){animation-delay:.12s}.vwave i:nth-child(3){animation-delay:.3s}.vwave i:nth-child(4){animation-delay:.05s}.vwave i:nth-child(5){animation-delay:.22s}.vwave i:nth-child(6){animation-delay:.4s}.vwave i:nth-child(7){animation-delay:.16s}@keyframes vwave{0%,100%{height:5px}35%{height:20px}65%{height:11px}}.dw-voice.processing .vwave i{animation:vpulse 1s ease-in-out infinite}@keyframes vpulse{50%{opacity:.25}}.dw-voice .vtext{margin:0;font-size:14px;line-height:1.5;color:var(--ink);max-height:96px;overflow-y:auto;overflow-wrap:anywhere}.dw-voice .vtext.empty{color:var(--muted);font-size:13px}.dw-voice .vtext span{color:var(--muted)}.dw-voice .vfoot{display:flex;justify-content:flex-end;gap:8px}@media (prefers-reduced-motion:reduce){.dw-voice .vwave i{animation:none!important;height:12px}}.vc-card{margin-top:8px;border:1px solid var(--line);border-radius:14px;padding:10px;background:var(--surface-2);display:flex;flex-direction:column;gap:8px}.vc-card.done{flex-direction:row;align-items:center;flex-wrap:wrap;font-size:13px;font-weight:600;color:var(--ink)}.vc-card.done svg{width:15px;height:15px;flex:none}.vc-card.done span{flex:1;min-width:0}.vc-card.done.off{font-weight:500;color:var(--muted)}.vc-task{padding-bottom:8px;border-bottom:1px solid var(--line)}.vc-task:last-of-type{border-bottom:0;padding-bottom:0}.vc-task b{display:block;font-size:14px;color:var(--ink);overflow-wrap:anywhere}.vc-task.off b{text-decoration:line-through;color:var(--muted)}.vc-task dl{margin:4px 0 0;display:flex;flex-wrap:wrap;gap:4px 14px;font-size:12.5px}.vc-task dl div{display:flex;gap:5px}.vc-task dt{color:var(--muted)}.vc-task dd{margin:0;font-weight:600;color:var(--ink)}.vc-dup{margin:4px 0 0;font-size:12px;color:var(--muted)}.vc-foot{display:flex;flex-wrap:wrap;gap:8px}";
function voiceCss(){ if (!document.getElementById("dwVoiceCss")) { const st = document.createElement("style"); st.id = "dwVoiceCss"; st.textContent = VOICE_CSS; document.head.appendChild(st); } }
/* ---------- voice: speaking to Deadline AI, confirm cards for spoken tasks, answers read aloud ---------- */
const VC_IC = {
  mic: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7"/></svg>',
  speaker: '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9.5v5h3.5L12 18V6L7.5 9.5z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>'
};
// The confirm card for a spoken or typed task command. Nothing is saved until "Confirm and add".
const vcTime = t => { if (!t) return ""; let [h, m] = t.split(":").map(Number); const ap = h >= 12 ? "pm" : "am"; h = h % 12 || 12; return `${h}:${pad2(m)} ${ap}`; };
const pad2 = n => String(n).padStart(2, "0");
const capFirst = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
function vcHTML(m){
  const p = m.proposal, now = Date.now();
  if (p.status === "saved") { const r = p.result || {}; const head = r.created ? `Added ${r.created} task${r.created === 1 ? "" : "s"}` : "Saved";
    return `<div class="vc-card done">${IC.check}<span>${head}${r.created && (r.updated || r.done) ? " and saved your changes" : ""}. ${r.created ? (r.created === 1 ? "It's" : "They're") + " on your to-do list." : ""}</span><button class="btn xs" type="button" data-route="overview">View on Today</button></div>`; }
  if (p.status !== "pending") return `<div class="vc-card done off"><span>Not added.</span></div>`;
  if (m.editing) return proposalHTML(m);
  const rows = p.actions.map(a => {
    if (a.type === "create") return `<div class="vc-task${a.keep ? "" : " off"}"><b>${esc(a.title)}</b>
      <dl><div><dt>${a.isDeadline ? "Due" : "Date"}</dt><dd>${a.date ? esc(capFirst(dayWord(a.date, now))) : "No day"}</dd></div>${a.time ? `<div><dt>Time</dt><dd>${vcTime(a.time)}</dd></div>` : ""}<div><dt>Priority</dt><dd>${esc(PRI[a.priority] ? PRI[a.priority].label : "Medium")}</dd></div>${a.estimate ? `<div><dt>Time needed</dt><dd>${fmtH(a.estimate)}</dd></div>` : ""}</dl>
      ${a.dupOf ? `<p class="vc-dup">Already on your list, so it won't be added again.</p>` : ""}</div>`;
    const ch = a.changes || {};
    const what = a.type === "complete" ? "Mark as done" : ch.priority ? `Priority: ${esc(PRI[ch.priority] ? PRI[ch.priority].label : ch.priority)}` : a.date ? `Plan for ${esc(dayWord(a.date, now))}` : "Change";
    return `<div class="vc-task"><b>${esc(a.title)}</b><dl><div><dt>Change</dt><dd>${what}</dd></div></dl></div>`;
  }).join("");
  const any = p.actions.some(a => a.keep); const creates = p.actions.some(a => a.type === "create");
  return `<div class="vc-card" data-vc="${m.id}">${rows}
    <div class="vc-foot">${any ? `<button class="btn primary sm" type="button" data-act="vcconfirm">${IC.check}${creates ? "Confirm and add" : "Confirm"}</button>` : ""}<button class="btn sm" type="button" data-act="vcedit">Edit details</button><button class="btn ghost sm" type="button" data-act="vcdiscard">Cancel</button></div></div>`;
}
// Speech to text: the browser's own speech recognition (Chrome, Edge, Safari). The microphone is used only between
// pressing the button and Done / Cancel / silence; no audio is stored or sent by this app.
const VOICE = { rec: null, state: "", finals: "", interim: "", t0: 0, tick: null, note: "", retry: false, err: "", cancelled: false, perm: "", sound: false, lastWord: 0 };
// The browser's microphone permission for this site ("granted", "prompt", "denied", or "" when it can't be asked).
// Looked up when the window opens and kept up to date, so pressing the mic can start listening at once.
function micPermission(){
  try { if (!navigator.permissions || !navigator.permissions.query) return Promise.resolve("");
    return Promise.resolve(navigator.permissions.query({ name: "microphone" })).then(st => { VOICE.perm = (st && st.state) || ""; try { st.onchange = () => { VOICE.perm = st.state || ""; }; } catch (e) {} return VOICE.perm; }).catch(() => "");
  } catch (e) { return Promise.resolve(""); }
}
// false only when the site's own settings (its Permissions-Policy header) forbid the microphone
function micAllowedBySite(){ try { const pol = document.featurePolicy || document.permissionsPolicy; return !(pol && pol.allowsFeature) || pol.allowsFeature("microphone"); } catch (e) { return true; } }
const voiceHearing = () => VOICE.state === "listening" && (VOICE.sound || Date.now() - VOICE.lastWord < 1500);
const voiceNote = (text, retry) => { VOICE.note = text; VOICE.retry = !!retry; };
const MIC_DENIED = "Microphone permission is required. Allow the microphone for this site (the lock or settings icon next to the address), then try again. You can keep typing meanwhile.";
const speechCtor = () => window.SpeechRecognition || window.webkitSpeechRecognition;
const voiceClock = () => { const s = VOICE.t0 ? Math.max(0, Math.floor((Date.now() - VOICE.t0) / 1000)) : 0; return `${Math.floor(s / 60)}:${pad2(s % 60)}`; };
function voiceHTML(){
  const text = (VOICE.finals + " " + VOICE.interim).trim();
  return `<div class="dw-voice ${VOICE.state}${voiceHearing() ? " hearing" : ""}" id="dwVoice" role="group" aria-label="Voice input">
    <div class="vhead"><span class="vwave" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span><span class="vstatus" id="dwVoiceStatus" role="status">${VOICE.state === "processing" ? "Processing…" : VOICE.state === "listening" ? "Listening…" : "Starting…"}</span><time id="dwVoiceTime">${voiceClock()}</time></div>
    <p class="vtext${text ? "" : " empty"}" id="dwVoiceText">${text ? `${esc(VOICE.finals)} <span>${esc(VOICE.interim)}</span>` : "Speak now. For example: “Add chemistry revision for tomorrow at 5 PM”."}</p>
    <div class="vfoot"><button class="btn ghost sm" type="button" data-act="dwvoicecancel">Cancel</button><button class="btn primary sm" type="button" data-act="dwvoicedone">${IC.check}Done</button></div></div>`;
}
function paintVoice(){
  const box = $("#dwVoice"); if (!box || !VOICE.rec) { renderWidget(); return; }
  const text = (VOICE.finals + " " + VOICE.interim).trim();
  box.className = "dw-voice " + VOICE.state + (voiceHearing() ? " hearing" : "");
  $("#dwVoiceStatus").textContent = VOICE.state === "processing" ? "Processing…" : VOICE.state === "listening" ? "Listening…" : "Starting…";
  $("#dwVoiceTime").textContent = voiceClock();
  const t = $("#dwVoiceText"); if (text) { t.classList.remove("empty"); t.innerHTML = `${esc(VOICE.finals)} <span>${esc(VOICE.interim)}</span>`; t.scrollTop = t.scrollHeight; }
}
function voiceStart(){
  if (VOICE.rec || DW.busy) return;
  voiceNote(""); stopSpeaking();
  const C = speechCtor();
  if (!C) { voiceNote("Voice recognition is unavailable in this browser. Try Chrome, Edge or Safari. On a phone you can also tap the microphone key on the keyboard and speak into the message box."); renderWidget(); return; }
  if (window.isSecureContext === false) { voiceNote("The microphone only works on a secure (https) page."); renderWidget(); return; }
  if (!micAllowedBySite()) { voiceNote("Voice input is switched off for this site, so the microphone can't be used here. This is a site setting, not your device. Please tell the site's owner."); renderWidget(); return; }
  // Blocked earlier: check again (the person may have just allowed it) before saying so; never show a listening panel that can't listen.
  if (VOICE.perm === "denied") { micPermission().then(st => { if (st === "denied") { voiceNote(MIC_DENIED, true); renderWidget(); } else voiceListen(C); }); return; }
  voiceListen(C);
}
function voiceListen(C){
  if (VOICE.rec) return;
  let rec; try { rec = new C(); } catch (e) { voiceNote("Voice input couldn't start in this browser.", true); renderWidget(); return; }
  // Phones end after one sentence (their continuous mode repeats words); computers listen until Done.
  rec.continuous = !/Android|iPhone|iPad|iPod/i.test(navigator.userAgent); rec.interimResults = true; rec.maxAlternatives = 1;
  rec.lang = (navigator.language && navigator.language.length >= 2 ? navigator.language : "en-IN");
  Object.assign(VOICE, { rec, state: "starting", finals: "", interim: "", t0: 0, err: "", cancelled: false, sound: false, lastWord: 0 });
  // the wave moves only while the browser reports sound or words (not just because the panel is open)
  const heard = on => () => { if (VOICE.rec !== rec) return; VOICE.sound = on; paintVoice(); };
  rec.onsoundstart = heard(true); rec.onspeechstart = heard(true); rec.onspeechend = heard(false); rec.onsoundend = heard(false);
  rec.onstart = () => { if (VOICE.rec !== rec) return; VOICE.state = "listening"; VOICE.t0 = Date.now(); clearInterval(VOICE.tick); VOICE.tick = setInterval(() => { if (VOICE.rec === rec) paintVoice(); if (Date.now() - VOICE.t0 > 120000) voiceDone(); }, 500); paintVoice(); };
  rec.onresult = e => { if (VOICE.rec !== rec) return; let fin = "", inter = "";
    for (let i = 0; i < e.results.length; i++) { const r = e.results[i]; const t = (r[0] && r[0].transcript || "").trim(); if (!t) continue; if (r.isFinal) fin += (fin ? " " : "") + t; else inter += (inter ? " " : "") + t; }
    VOICE.finals = fin.slice(0, 1900); VOICE.interim = inter.slice(0, 400); VOICE.lastWord = Date.now(); paintVoice(); };
  rec.onerror = e => { if (VOICE.rec === rec && e && e.error && e.error !== "aborted" && !(e.error === "no-speech" && VOICE.finals)) VOICE.err = e.error; };
  rec.onend = () => { if (VOICE.rec === rec) voiceEnded(); };
  try { rec.start(); } catch (e) { VOICE.rec = null; voiceNote("Voice input couldn't start.", true); }
  // a browser that never answers (no start, no error) must not leave "Starting…" on screen forever
  setTimeout(() => { if (VOICE.rec === rec && VOICE.state === "starting") { VOICE.err = VOICE.err || "no-start"; try { rec.abort(); } catch (e) {} if (VOICE.rec === rec) voiceEnded(); } }, 8000);
  renderWidget();
}
function voiceDone(){ const rec = VOICE.rec; if (!rec) return; VOICE.state = "processing"; paintVoice(); try { rec.stop(); } catch (e) { voiceEnded(); } }
function voiceCancel(){ const rec = VOICE.rec; if (!rec) return; VOICE.cancelled = true; try { rec.abort(); } catch (e) {} if (VOICE.rec === rec) voiceEnded(); }
function voiceEnded(){
  const text = (VOICE.finals + " " + VOICE.interim).replace(/\s+/g, " ").trim(); const err = VOICE.err, cancelled = VOICE.cancelled;
  clearInterval(VOICE.tick); Object.assign(VOICE, { rec: null, state: "", finals: "", interim: "", err: "", cancelled: false, tick: null, sound: false, lastWord: 0 });
  if (cancelled) { if (DW.open) renderWidget(); return; }
  if (err === "not-allowed" || err === "service-not-allowed") { voiceNote(micAllowedBySite() ? "The microphone is blocked for this site. " + MIC_DENIED : "Voice input is switched off for this site, so the microphone can't be used here.", true); micPermission(); }
  else if (err === "audio-capture") voiceNote("No microphone was found. Connect one or check your device's sound settings.", true);
  else if (err === "network") voiceNote("Couldn't reach the browser's speech service. Check your internet connection and try again. Browsers built into other apps often can't do voice: open the site in Chrome, Edge or Safari.", true);
  else if (err === "language-not-supported") voiceNote("Voice input doesn't support this device's language. Type your message instead.");
  else if (err === "no-start") voiceNote("Voice input didn't start. Try again, or open the site in Chrome, Edge or Safari.", true);
  else if (!text) voiceNote("I couldn't hear you. Please try again.", true);
  if (text) { const tab = DW.tab; const cur = (DW.draft[tab] || "").trim(); DW.draft[tab] = (cur ? cur + " " : "") + text; DW.voiceText = DW.draft[tab]; }
  if (!DW.open) return;
  renderWidget();
  const i = $("#dwInput"); if (i && text) { i.value = DW.draft[DW.tab]; i.style.height = "auto"; i.style.height = Math.min(i.scrollHeight, 120) + "px"; i.focus(); try { i.setSelectionRange(i.value.length, i.value.length); } catch (e) {} }
}
// Text to speech (the browser's own voices). Only when the person presses Listen, or turned on "Read answers aloud"
// (then only short answers are read; long ones wait for Listen).
const canSpeak = () => !!(window.speechSynthesis && window.SpeechSynthesisUtterance);
const SPK = { id: null, paused: false };
const speakAuto = () => { try { return localStorage.getItem("dt-speak-auto") === "1"; } catch (e) { return false; } };
const speechText = md => String(md || "").replace(/```[\s\S]*?(```|$)/g, " ").replace(/`([^`]*)`/g, "$1").replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/^\s{0,3}#{1,6}\s*(.*)$/gm, "$1.").replace(/^\s*\|?[\s:|-]{3,}\|?\s*$/gm, " ").replace(/\|/g, ", ").replace(/[*_~>#]/g, "").replace(/^\s*[-•]\s+/gm, "").replace(/\s*\n+\s*/g, " ").replace(/\.\s*\./g, ".").replace(/\s+/g, " ").trim();
function stopSpeaking(){ if (!canSpeak() || !SPK.id) return; SPK.id = null; SPK.paused = false; try { window.speechSynthesis.cancel(); } catch (e) {} }
function speakMsg(m){
  if (!canSpeak()) return; stopSpeaking();
  const text = speechText(m.text).slice(0, 3000); if (!text) return;
  const u = new SpeechSynthesisUtterance(text); if (navigator.language) u.lang = navigator.language;
  const end = () => { if (SPK.id === m.id) { SPK.id = null; SPK.paused = false; if (DW.open) renderWidget(); } };
  u.onend = end; u.onerror = end;
  SPK.id = m.id; SPK.paused = false;
  try { window.speechSynthesis.speak(u); } catch (e) { SPK.id = null; }
  if (DW.open) renderWidget();
}
// While an answer streams in, only its own bubble is redrawn (not the whole window), and the view follows the text
// unless the person has scrolled up to read.
function paintLive(){
  const m = DW.live, list = $("#dwMsgs"); if (!m || !list || DW.tab !== "help" || !DW.open) return;
  const box = list.querySelector(`[data-hmsg="${m.id}"] .bubble`);
  if (!box) { renderWidget(); return; }
  const atEnd = list.scrollHeight - list.scrollTop - list.clientHeight < 60;
  box.innerHTML = dwText(m.text);
  if (atEnd) list.scrollTop = list.scrollHeight;
}
const planMsgHTML = m => msgHTML(m);
function dwShell(){
  if ($("#dw")) return;
  voiceCss();
  document.body.insertAdjacentHTML("beforeend", `
  <button type="button" class="dw-fab" id="dwBtn" data-act="dwtoggle" aria-expanded="false" aria-controls="dw" hidden><span class="orb sm" aria-hidden="true"></span><span class="dw-fab-l">Deadline AI</span></button>
  <section class="dw" id="dw" role="dialog" aria-modal="false" aria-labelledby="dwTitle" hidden>
    <header class="dw-h"><span class="orb sm" aria-hidden="true"></span><div><h2 id="dwTitle">Deadline AI</h2><p class="dw-mode" id="dwMode"></p></div>
      <button type="button" class="btn ghost xs" data-act="dwclear" id="dwClear">Clear</button>
      <button type="button" class="ib" data-act="dwclose" aria-label="Close Deadline AI">${IC.x}</button></header>
    <div class="dw-tabs" role="tablist" aria-label="What do you need?">
      <button type="button" role="tab" id="dwTabHelp" data-act="dwtab" data-v="help" aria-controls="dwMsgs">Help</button>
      <button type="button" role="tab" id="dwTabPlan" data-act="dwtab" data-v="plan" aria-controls="dwMsgs">My Plan</button>
    </div>
    <div class="dw-share" id="dwShare" hidden></div>
    <div class="dw-msgs" id="dwMsgs" role="tabpanel" aria-live="polite"></div>
    <div id="dwVoiceSlot"></div>
    <form class="dw-in" id="dwForm"><textarea id="dwInput" rows="1" maxlength="2000" aria-label="Message Deadline AI"></textarea>
      <button class="btn dw-mic" type="button" id="dwMic" data-act="dwmic" aria-label="Speak your message" title="Speak">${VC_IC.mic}</button>
      <button class="btn primary" type="submit" id="dwSend" aria-label="Send">${IC.send}</button>
      <button class="btn" type="button" id="dwStop" data-act="dwstop" aria-label="Stop answering" title="Stop" hidden><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2.5" fill="currentColor"/></svg></button></form>
  </section>`);
}
function renderWidget(){
  dwShell();
  const btn = $("#dwBtn"), box = $("#dw");
  const show = !!(state && state.workspaces && state.workspaces.length) && !$("#app").hidden;
  btn.hidden = !show || UI.route === "assistant";
  if (!show || UI.route === "assistant") { box.hidden = true; DW.open = false; }
  btn.setAttribute("aria-expanded", DW.open);
  document.body.classList.toggle("dw-on", DW.open);
  if (!DW.open) { if (!DW.closing) box.hidden = true; return; }
  box.hidden = false;
  const help = DW.tab === "help";
  $("#dwTabHelp").setAttribute("aria-selected", help); $("#dwTabPlan").setAttribute("aria-selected", !help);
  $("#dwMode").innerHTML = help ? (ACCOUNT.on ? `<i class="${AI.gemini ? "on" : ""}"></i>${AI.gemini ? "Help guide + Google Gemini" : "Help guide (Gemini off)"}` : `<i></i>Help needs the Deadline Tracker server`) : aiModeHTML();
  // "Let Deadline AI see my tasks": each person's own choice, off until they turn it on and confirm.
  const sh = $("#dwShare"); const canShare = help && ACCOUNT.on && AI.gemini && DW.share !== null; const canRead = help && ACCOUNT.on && canSpeak();
  sh.hidden = !(canShare || canRead);
  if (canShare || canRead) {
    const html = `${canShare ? `<label class="dw-share-l"><input type="checkbox" role="switch" id="dwShareTasks" data-act="dwshare"${DW.share ? " checked" : ""}><span>Let Deadline AI see my tasks</span></label><span class="dw-share-s">${DW.share ? "On: task titles and dates go to Google Gemini with questions about your work." : "Off: your tasks are never sent."}</span>
      ${DW.shareAsk ? `<div class="dw-share-ask" id="dwShareAsk" role="group" aria-label="Share tasks with Deadline AI?"><p>With this on, questions about your work (like "what should I do tomorrow?") are answered from your real tasks. Only open tasks' <b>titles, dates, priority and status</b> are sent to Google Gemini. Notes are never sent. Google may use free-tier data to improve its products. You can turn it off any time.</p><div><button type="button" class="btn sm primary" data-act="dwshareok">Turn on</button><button type="button" class="btn sm ghost" data-act="dwsharecancel">Cancel</button></div></div>` : ""}` : ""}
      ${canRead ? `<label class="dw-share-l"><input type="checkbox" role="switch" id="dwSpeakAuto" data-act="dwspeakauto"${speakAuto() ? " checked" : ""}><span>Read answers aloud</span></label>` : ""}`;
    if (sh.__html !== html) { sh.innerHTML = html; sh.__html = html; }
  }
  // voice: a note (blocked microphone, nothing heard…) and, while listening, the panel in place of the typing box
  const vs = $("#dwVoiceSlot"); const vhtml = (VOICE.note ? `<p class="dw-vnote" id="dwVoiceNote" role="alert">${IC.info}<span>${esc(VOICE.note)}</span>${VOICE.retry ? `<button type="button" class="btn xs vretry" data-act="dwmic">Try again</button>` : ""}<button type="button" class="ib" data-act="dwvoicenote" aria-label="Dismiss">×</button></p>` : "") + (VOICE.rec ? voiceHTML() : "");
  if (vs.__html !== vhtml || (VOICE.rec && !$("#dwVoice"))) { vs.innerHTML = vhtml; vs.__html = vhtml; }
  $("#dwForm").hidden = !!VOICE.rec;
  const w = W(); let msgs = help ? helpChat() : chatOf(w);
  if (help && DW.live && DW.live.text) msgs = msgs.concat([DW.live]);
  $("#dwClear").hidden = !msgs.length;
  const busy = help ? DW.busy : AI.busy;
  const name = (state.user.name || "").split(" ")[0];
  const empty = help
    ? `<div class="dw-empty"><h3>${name ? `Hi ${esc(name)}! ` : ""}How can I help?</h3><p>Ask me anything: coding, maths, science, studies, planning, or how Deadline Tracker works. I remember the conversation, so you can ask follow-ups.</p>
       ${AI.gemini ? `<p class="dw-privacy">${IC.info}<span>Answers come from Google Gemini's free tier, which Google may use to improve its products. Your tasks are sent only if you turn on "Let Deadline AI see my tasks". Don't type private details here.</span></p>` : ""}
       <div class="dw-sugg">${(DW.sugg || HELP_SUGG).map(s => `<button type="button" data-act="dwsuggest" data-v="${esc(s)}">${esc(s)}</button>`).join("")}</div></div>`
    : `<div class="dw-empty"><h3>Plan with your own tasks</h3><p>Tell me your work in English or Hinglish, or ask what to do next. I only save after you approve.</p>
       <div class="dw-sugg">${(PLAN_SUGG[w.mode] || PLAN_SUGG.student).map(s => `<button type="button" data-act="dwsuggest" data-v="${esc(s)}">${esc(s)}</button>`).join("")}</div></div>`;
  const typing = busy && !(help && DW.live && DW.live.text) ? `<div class="msg ai typing-msg"><span class="orb sm spin" aria-hidden="true"></span><div class="bubble"><span class="typing" aria-hidden="true"><i></i><i></i><i></i></span><span class="typing-l">${help && DW.waitNote ? "Still working…" : "Thinking…"}</span></div></div>` : "";
  const list = $("#dwMsgs"); const atEnd = list.scrollHeight - list.scrollTop - list.clientHeight < 40;
  list.innerHTML = (msgs.length ? msgs.map(help ? helpMsgHTML : planMsgHTML).join("") : empty) + typing;
  list.setAttribute("aria-labelledby", help ? "dwTabHelp" : "dwTabPlan");
  if (atEnd || busy || DW.scroll) { list.scrollTop = list.scrollHeight; DW.scroll = false; }
  const inp = $("#dwInput");
  inp.placeholder = help ? "Ask me anything…" : "e.g. What should I complete tomorrow?";
  inp.disabled = busy; $("#dwSend").disabled = busy; $("#dwMic").disabled = busy;
  const stoppable = help && DW.busy && !!DW.ctrl; $("#dwStop").hidden = !stoppable; $("#dwSend").hidden = stoppable;
  if (document.activeElement !== inp && inp.value !== DW.draft[DW.tab]) inp.value = DW.draft[DW.tab];
}
function openWidget(tab){
  const fresh = !DW.open; DW.closing = false;
  DW.open = true; if (tab) DW.tab = tab; DW.scroll = true; renderWidget();
  if (fresh) MOTION.dwOpen($("#dw"), $("#dwBtn"));
  setTimeout(() => { const i = $("#dwInput"); if (i && !i.disabled) i.focus(); }, 60);
  micPermission();
  if (ACCOUNT.on && !DW.helpLoaded) loadHelpHistory();
  if (ACCOUNT.on && DW.share === null) apiJSON("GET", "/api/ai/prefs").then(r => { DW.share = !!(r.ok && r.json.shareTasks); if (DW.open) renderWidget(); }).catch(() => {});
  if (ACCOUNT.on && !DW.sugg) apiJSON("GET", "/api/help/suggestions").then(r => { if (r.ok && r.json.help && r.json.help.length) { DW.sugg = r.json.help.slice(0, 2).concat(["Explain recursion with a Python example", "Solve 2x + 5 = 17 step by step"]); if (DW.tab === "help") renderWidget(); } }).catch(() => {});
}
// Closing folds the window back into its button first (instant with reduced motion).
function closeWidget(){
  if (!DW.open) return;
  voiceCancel(); stopSpeaking();   // the microphone and the voice never keep going after the window closes
  DW.open = false; DW.closing = true; renderWidget();
  MOTION.dwClose($("#dw"), $("#dwBtn"), () => { if (!DW.closing) return; DW.closing = false; renderWidget(); const b = $("#dwBtn"); if (b && !b.hidden) b.focus(); });
}

// Telling it to change tasks ("add a task…", "delete the task…") always goes to My Plan, which saves only after the person approves.
const isTaskCommand = t => { const s = String(t || "").replace(/^\s*((hey|hi|hello|ok|okay|please|pls|kindly)[,!. ]+)*/i, "");
  return /^(add|create|schedule|note down|put|remind me|set (a |up a )?(reminder|task)|make a (task|reminder|note)|new task)\b/i.test(s)
    || /^(mark|make|set|change|move|reschedule|postpone|shift)\b[\s\S]*\b(tasks?|priority|done|complete[d]?|finished|deadline|assignment|(to|for) (today|tomorrow|tonight|next \w+|this \w+|\w+day))\b/i.test(s); };
const wantsTaskChange = t => /^\s*(please\s+|pls\s+)?(add|create|save|make|set|remind me|delete|remove|complete|mark|reschedule|move|postpone)\b[\s\S]*\b(tasks?|deadlines?|reminders?|to-?do)\b/i.test(t);
// One streamed answer. Reads the server's events (start, delta, replace, wait, done) and shows the text as it comes.
// The browser gives up when nothing at all arrives for DW.timeoutMs (60 s), so a sleeping server never leaves a spinner forever.
async function askStream(body, live){
  const ctrl = DW.ctrl; let timer, timedOut = false;
  const alive = () => { clearTimeout(timer); timer = setTimeout(() => { timedOut = true; ctrl.abort(); }, DW.timeoutMs); };
  alive();
  try {
    const x = await fetch("/api/chat/stream", { method: "POST", credentials: "same-origin", cache: "no-store", signal: ctrl.signal, headers: { "Content-Type": "application/json", Accept: "text/event-stream" }, body: JSON.stringify(body) });
    if (!x.ok || !/event-stream/.test(x.headers.get("content-type") || "") || !x.body) {
      let j = null; try { j = await x.json(); } catch (e) {}
      if (x.status === 401 && ACCOUNT.user) signedOut();
      // a server from before streaming: ask the old way (the whole answer in one piece)
      if ((x.status === 404 && /route/i.test((j && j.error) || "")) || x.status === 405 || (x.ok && j && j.message)) { if (x.ok && j && j.message) return { ok: true, json: j }; return { old: true }; }
      return { ok: false, status: x.status, json: j || {} };
    }
    const rd = x.body.getReader(), dec = new TextDecoder(); let buf = "", done = null;
    for (;;) {
      const { done: end, value } = await rd.read(); if (end) break;
      alive(); buf += dec.decode(value, { stream: true });
      let k;
      while ((k = buf.indexOf("\n\n")) >= 0) {
        const block = buf.slice(0, k); buf = buf.slice(k + 2);
        const ev = (block.match(/^event: (.*)$/m) || [])[1]; let d = {}; try { d = JSON.parse((block.match(/^data: (.*)$/m) || [])[1] || "{}"); } catch (e) {}
        if (ev === "start") { if (d.conversationId) DW.helpConv = d.conversationId; }
        else if (ev === "delta" || ev === "replace") { const first = !live.text; live.text = ev === "delta" ? live.text + (d.text || "") : (d.text || ""); DW.waitNote = false; if (first) { DW.scroll = true; renderWidget(); } else paintLive(); }
        else if (ev === "wait") { DW.waitNote = true; if (!live.text) renderWidget(); }
        else if (ev === "done") done = d;
      }
    }
    if (done) return { ok: true, json: done };
    return { ok: false, cut: true, json: { error: "The connection dropped." } };
  } catch (e) {
    if (DW.stopped) return { stopped: true };
    return { ok: false, cut: !!live.text, json: { error: timedOut || e.name === "AbortError" ? "It took too long to get an answer." : "Couldn't reach the server. Check your internet connection." } };
  } finally { clearTimeout(timer); }
}
async function sendHelp(text, opts = {}){
  text = String(text || "").trim(); if (!text || DW.busy) return;
  // the same words again within a few seconds (the microphone caught a sentence twice, a double tap): sent once
  if (!opts.retry && DW.lastSent && DW.lastSent.text === text && Date.now() - DW.lastSent.at < 6000) { $("#dwInput").value = ""; DW.draft.help = ""; return; }
  if (!opts.retry) DW.lastSent = { text, at: Date.now() };
  VOICE.note = "";
  const chat = helpChat();
  if (!opts.retry) chat.push({ id: rid("h"), role: "user", text, t: nowIso() });
  if (chat.length > 60) chat.splice(0, chat.length - 60);
  DW.draft.help = ""; $("#dwInput").value = ""; $("#dwInput").style.height = "auto";
  // Their own tasks: My Plan answers on our server. With "see my tasks" on, Deadline AI answers from the task list
  // instead; changing tasks is always My Plan's job.
  const sharing = ACCOUNT.on && AI.gemini && DW.share === true;
  // ("How do I delete a task?" is a question about the app, not an instruction, so it stays here.)
  // With Gemini on, a task command ("Add…", "Remind me to…") stays here: Deadline AI reads it and shows a card to confirm.
  const commandHere = ACCOUNT.on && AI.gemini && isTaskCommand(text);
  if (!commandHere && (looksPersonal(text) ? (!sharing || wantsTaskChange(text)) : wantsTaskChange(text))) {
    chat.push({ id: rid("h"), role: "ai", text: "That's about your own tasks, so I've asked it in My Plan.", t: nowIso() });
    save(); DW.tab = "plan"; renderWidget(); sendToAssistant(text); return;
  }
  if (!ACCOUNT.on) {
    chat.push({ id: rid("h"), role: "ai", found: false, text: "Help answers come from the help guide on the Deadline Tracker server, which isn't running here. Start it with node server.js and open the link it prints.", t: nowIso() });
    save(); renderWidget(); return;
  }
  const live = { id: rid("h"), role: "ai", text: "", t: nowIso(), streaming: true };
  DW.busy = true; DW.live = live; DW.ctrl = new AbortController(); DW.stopped = false; DW.waitNote = false; renderWidget();
  let r;
  const currency = (state.user && state.user.currency) || "INR";
  const body = () => ({ message: text, conversationId: DW.helpConv || undefined, currency, workspaceId: (W() || {}).id });
  // older servers: the whole answer in one piece
  const askOld = b => { const ctrl = DW.ctrl, timer = setTimeout(() => ctrl.abort(), DW.timeoutMs);
    return fetch("/api/chat", { method: "POST", credentials: "same-origin", cache: "no-store", signal: ctrl.signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) })
      .then(async x => { let j = null; try { j = await x.json(); } catch (e) {} if (x.status === 401 && ACCOUNT.user) signedOut(); return { ok: x.ok, status: x.status, json: j || {} }; })
      .catch(e => DW.stopped ? { stopped: true } : { ok: false, json: { error: e.name === "AbortError" ? "It took too long to get an answer." : "Couldn't reach the server. Check your internet connection." } })
      .finally(() => clearTimeout(timer)); };
  r = await askStream(body(), live);
  if (r.old) r = await askOld(body());
  if (r.status === 404 && DW.helpConv) { DW.helpConv = null; DW.ctrl = new AbortController(); r = await askStream(body(), live); if (r.old) r = await askOld(body()); }
  DW.busy = false; DW.live = null; DW.ctrl = null; DW.waitNote = false;
  if (r.stopped) chat.push({ id: live.id, role: "ai", via: "ai", text: live.text, stopped: true, t: nowIso() });
  else if (!r.ok && r.cut && live.text) chat.push({ id: live.id, role: "ai", via: "ai", partial: true, retry: text, t: nowIso(), text: live.text + "\n\n*The connection dropped before the answer finished. You can try again.*" });
  else if (!r.ok) { chat.push({ id: rid("h"), role: "ai", error: true, retry: text, t: nowIso(), text: `Sorry, I couldn't answer just now. ${r.json.error || "The server didn't respond."} Please try again.` }); sfx("error"); }
  else if (!r.json.message || !String(r.json.message.text || "").trim()) chat.push({ id: rid("h"), role: "ai", error: true, retry: text, t: nowIso(), text: "I didn't get an answer that time. Please try again." });
  else { DW.helpConv = r.json.conversationId || DW.helpConv; const m = fromServerMsg(r.json.message); if (m.id === "local") { m.id = rid("h"); m.serverId = null; } chat.push(m);
    // read short answers aloud only if the person turned that on
    if (speakAuto() && canSpeak() && !m.error && speechText(m.text).length <= 600) setTimeout(() => speakMsg(m), 0); }
  DW.scroll = true; renderWidget();
  setTimeout(() => { const i = $("#dwInput"); if (i && DW.open && !i.disabled) i.focus(); }, 30);
}
function sendWidget(){
  const v = $("#dwInput").value;
  if (DW.tab === "help") sendHelp(v);
  else { DW.draft.plan = ""; $("#dwInput").value = ""; DW.scroll = true; sendToAssistant(v); }
}

document.addEventListener("submit", e => { if (e.target.id === "dwForm") { e.preventDefault(); sendWidget(); } });
document.addEventListener("keydown", e => {
  if (e.target.id === "dwInput" && e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendWidget(); }
  else if (e.key === "Escape" && DW.open && !modalKind && e.target.closest && e.target.closest("#dw")) { e.preventDefault(); closeWidget(); }
});
document.addEventListener("input", e => {
  if (e.target.id === "dwInput") { DW.draft[DW.tab] = e.target.value; e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 140) + "px"; }
});
document.addEventListener("click", e => {
  const a = e.target.closest("[data-act]"); if (!a || !state || !state.workspaces || !state.workspaces.length) return;
  switch (a.dataset.act) {
    case "dwtoggle": DW.open ? closeWidget() : openWidget(); break;
    case "dwclose": closeWidget(); break;
    case "dwtab": DW.tab = a.dataset.v; DW.scroll = true; renderWidget(); setTimeout(() => $("#dwInput").focus(), 30); break;
    case "dwsuggest": if (DW.tab === "help") sendHelp(a.dataset.v); else { DW.scroll = true; sendToAssistant(a.dataset.v); } break;
    case "dwclear": {
      const w = W();
      if (DW.tab === "help") {
        if (ACCOUNT.on) { DW.helpConv = null; DW.helpMsgs = []; renderWidget(); toast("Started a new Help conversation. Earlier ones are kept in your history."); }
        else { const before = helpChat().slice(); state.helpChat = []; save(); renderWidget(); toast("Cleared the help conversation.", () => { state.helpChat = before; save(); renderWidget(); }); }
      }
      else { const before = chatOf(w).slice(), conv = w.planConv; w.chat = []; w.planConv = null; save(); render(); toast("Cleared the My Plan conversation. Your tasks are unchanged.", () => { w.chat = before; w.planConv = conv; save(); render(); }); }
      break; }
    case "dwmic": voiceStart(); break;
    case "dwvoicedone": voiceDone(); break;
    case "dwvoicecancel": voiceCancel(); break;
    case "dwvoicenote": VOICE.note = ""; renderWidget(); break;
    case "dwspeak": {
      const box = a.closest("[data-hmsg]"); const m = helpChat().find(x => x.id === (box && box.dataset.hmsg)); if (!m || !canSpeak()) break;
      if (SPK.id === m.id) { if (SPK.paused) { window.speechSynthesis.resume(); SPK.paused = false; } else { window.speechSynthesis.pause(); SPK.paused = true; } renderWidget(); }
      else speakMsg(m);
      break; }
    case "dwspeakstop": stopSpeaking(); renderWidget(); break;
    case "dwspeakauto": try { localStorage.setItem("dt-speak-auto", a.checked ? "1" : "0"); } catch (err) {} if (!a.checked) stopSpeaking(); $("#dwShare").__html = ""; renderWidget(); break;
    case "vcconfirm": case "vcedit": case "vcdiscard": {
      const box = a.closest("[data-hmsg]"); const m = helpChat().find(x => x.id === (box && box.dataset.hmsg)); if (!m || !m.proposal || m.proposal.status !== "pending") break;
      if (a.dataset.act === "vcedit") { m.editing = true; renderWidget(); break; }
      if (m.busy) break; m.busy = true;   // one save per card, however fast the taps
      applyServerProposal(m, a.dataset.act === "vcdiscard").then(() => { m.busy = false; m.editing = false; if (DW.open) renderWidget(); });
      break; }
    case "dwstop": if (DW.ctrl && DW.busy) { DW.stopped = true; DW.ctrl.abort(); } break;
    case "dwcopymsg": {
      const box = a.closest("[data-hmsg]"); const m = helpChat().find(x => x.id === (box && box.dataset.hmsg)); if (!m) break;
      const fail = () => toast("Couldn't copy. Select the text and copy it yourself.", null, null, "error");
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(m.text).then(() => toast("Copied the answer."), fail); else fail();
      break; }
    case "dwshare": {
      // turning on asks first (the box stays off until "Turn on"); turning off is immediate
      if (DW.share) { DW.share = false; DW.shareAsk = false; renderWidget(); apiJSON("PUT", "/api/ai/prefs", { shareTasks: false }).then(r => { if (r.ok) toast("Deadline AI can no longer see your tasks."); else { DW.share = true; renderWidget(); toast("Couldn't change that. Please try again.", null, null, "error"); } }).catch(() => { DW.share = true; renderWidget(); }); }
      else { e.preventDefault(); DW.shareAsk = true; renderWidget(); }
      break; }
    case "dwsharecancel": DW.shareAsk = false; renderWidget(); break;
    case "dwshareok":
      DW.shareAsk = false; renderWidget();
      apiJSON("PUT", "/api/ai/prefs", { shareTasks: true }).then(r => { if (r.ok && r.json.shareTasks) { DW.share = true; renderWidget(); toast("Deadline AI can now use your task list for questions about your work."); } else toast("Couldn't turn that on. Please try again.", null, null, "error"); }).catch(() => toast("Couldn't turn that on. Please try again.", null, null, "error"));
      break;
    case "dwcopy": {
      const pre = a.closest(".md-code"); const code = pre && pre.querySelector("code"); if (!code) break;
      const done = () => toast("Copied the code.");
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(code.textContent).then(done, () => toast("Couldn't copy. Select the code and copy it yourself.", null, null, "error"));
      else toast("Couldn't copy. Select the code and copy it yourself.", null, null, "error");
      break; }
    case "dwretry": { const box = a.closest("[data-hmsg]"); const chat = helpChat(); const k = chat.findIndex(m => m.id === (box && box.dataset.hmsg)); if (k < 0) break; const msg = chat[k]; chat.splice(k, 1); sendHelp(msg.retry, { retry: true }); break; }
    case "dwrate": {
      const box = a.closest("[data-hmsg]"); const m = helpChat().find(x => x.id === (box && box.dataset.hmsg)); if (!m || !m.qid) break;
      const v = +a.dataset.v; m.rating = m.rating === v ? 0 : v; save(); renderWidget();
      apiJSON("POST", "/api/chat/rate", { id: m.qid, rating: m.rating }).then(r => { if (r.ok && m.rating) toast(m.rating > 0 ? "Thanks! Glad it helped." : "Thanks. The admin will see this and improve the answer."); }).catch(() => {});
      break; }
  }
});
