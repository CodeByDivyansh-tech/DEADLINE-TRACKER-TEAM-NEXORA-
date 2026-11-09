
/* =========================================================
   Deadline AI: the floating chat window
   Two clearly separate parts:
   - Help: questions about using Deadline Tracker, answered only from the
     help guide on the server (it says "I don't know" otherwise).
   - My Plan: your own tasks. The same assistant as the Assistant page:
     it suggests, you approve, then it saves.
   ========================================================= */
const DW = { open: false, tab: "help", busy: false, timeoutMs: 60000, draft: { help: "", plan: "" }, sugg: null, helpConv: null, helpMsgs: [], helpLoaded: false };
// With the server, Help conversations are stored on the server (history); without it they stay in this browser.
const helpChat = () => { if (ACCOUNT.on) return DW.helpMsgs; state.helpChat = state.helpChat || []; return state.helpChat; };
const fromServerMsg = m => ({ id: m.id, role: m.role === "user" ? "user" : "ai", text: m.text, t: m.createdAt, found: m.found, sources: m.sources || [], via: m.via, qid: m.qid, error: !!m.error, retry: m.retry, kind: m.kind });
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
  return `<div class="msg ai${m.error ? " error" : ""}${m.found === false ? " unknown" : ""}" data-hmsg="${m.id}"><span class="orb sm" aria-hidden="true"></span><div class="bubble">${dwText(m.text)}
    ${m.sources && m.sources.length ? `<p class="dw-src">${IC.info}<span>From the help guide: ${m.sources.map(s => esc(s.title)).join(" · ")}</span></p>` : ""}
    ${m.error ? `<button class="btn sm" type="button" data-act="dwretry">Try again</button>` : ""}
    <div class="dw-meta"><time>${dwTime(m.t)}</time>${m.via ? `<span class="via">${m.via === "ai" ? (m.kind === "general" ? "Google Gemini" : "Google Gemini · from the help guide") : m.via === "kb" ? "Help guide" : ""}</span>` : ""}
      ${m.qid ? `<span class="dw-rate" role="group" aria-label="Was this helpful?"><button type="button" class="ib" data-act="dwrate" data-v="1" aria-pressed="${m.rating === 1}" aria-label="Helpful" title="Helpful">👍</button><button type="button" class="ib" data-act="dwrate" data-v="-1" aria-pressed="${m.rating === -1}" aria-label="Not helpful" title="Not helpful">👎</button></span>` : ""}</div></div></div>`;
}
const planMsgHTML = m => msgHTML(m);
function dwShell(){
  if ($("#dw")) return;
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
    <div class="dw-msgs" id="dwMsgs" role="tabpanel" aria-live="polite"></div>
    <form class="dw-in" id="dwForm"><textarea id="dwInput" rows="1" maxlength="2000" aria-label="Message Deadline AI"></textarea>
      <button class="btn primary" type="submit" id="dwSend" aria-label="Send">${IC.send}</button></form>
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
  const w = W(); const msgs = help ? helpChat() : chatOf(w);
  $("#dwClear").hidden = !msgs.length;
  const busy = help ? DW.busy : AI.busy;
  const name = (state.user.name || "").split(" ")[0];
  const empty = help
    ? `<div class="dw-empty"><h3>${name ? `Hi ${esc(name)}! ` : ""}How can I help?</h3><p>Ask me anything: coding, maths, science, studies, planning, or how Deadline Tracker works. I remember the conversation, so you can ask follow-ups.</p>
       ${AI.gemini ? `<p class="dw-privacy">${IC.info}<span>Help questions are answered with Google Gemini's free tier, which Google may use to improve its products. Your tasks are never sent; don't type private details here.</span></p>` : ""}
       <div class="dw-sugg">${(DW.sugg || HELP_SUGG).map(s => `<button type="button" data-act="dwsuggest" data-v="${esc(s)}">${esc(s)}</button>`).join("")}</div></div>`
    : `<div class="dw-empty"><h3>Plan with your own tasks</h3><p>Tell me your work in English or Hinglish, or ask what to do next. I only save after you approve.</p>
       <div class="dw-sugg">${(PLAN_SUGG[w.mode] || PLAN_SUGG.student).map(s => `<button type="button" data-act="dwsuggest" data-v="${esc(s)}">${esc(s)}</button>`).join("")}</div></div>`;
  const typing = busy ? `<div class="msg ai typing-msg"><span class="orb sm spin" aria-hidden="true"></span><div class="bubble"><span class="typing" aria-hidden="true"><i></i><i></i><i></i></span><span class="typing-l">Thinking…</span></div></div>` : "";
  const list = $("#dwMsgs"); const atEnd = list.scrollHeight - list.scrollTop - list.clientHeight < 40;
  list.innerHTML = (msgs.length ? msgs.map(help ? helpMsgHTML : planMsgHTML).join("") : empty) + typing;
  list.setAttribute("aria-labelledby", help ? "dwTabHelp" : "dwTabPlan");
  if (atEnd || busy || DW.scroll) { list.scrollTop = list.scrollHeight; DW.scroll = false; }
  const inp = $("#dwInput");
  inp.placeholder = help ? "Ask me anything…" : "e.g. What should I complete tomorrow?";
  inp.disabled = busy; $("#dwSend").disabled = busy;
  if (document.activeElement !== inp && inp.value !== DW.draft[DW.tab]) inp.value = DW.draft[DW.tab];
}
function openWidget(tab){
  const fresh = !DW.open; DW.closing = false;
  DW.open = true; if (tab) DW.tab = tab; DW.scroll = true; renderWidget();
  if (fresh) MOTION.dwOpen($("#dw"), $("#dwBtn"));
  setTimeout(() => { const i = $("#dwInput"); if (i && !i.disabled) i.focus(); }, 60);
  if (ACCOUNT.on && !DW.helpLoaded) loadHelpHistory();
  if (ACCOUNT.on && !DW.sugg) apiJSON("GET", "/api/help/suggestions").then(r => { if (r.ok && r.json.help && r.json.help.length) { DW.sugg = r.json.help.slice(0, 2).concat(["Explain recursion with a Python example", "Solve 2x + 5 = 17 step by step"]); if (DW.tab === "help") renderWidget(); } }).catch(() => {});
}
// Closing folds the window back into its button first (instant with reduced motion).
function closeWidget(){
  if (!DW.open) return;
  DW.open = false; DW.closing = true; renderWidget();
  MOTION.dwClose($("#dw"), $("#dwBtn"), () => { if (!DW.closing) return; DW.closing = false; renderWidget(); const b = $("#dwBtn"); if (b && !b.hidden) b.focus(); });
}

async function sendHelp(text, opts = {}){
  text = String(text || "").trim(); if (!text || DW.busy) return;
  const chat = helpChat();
  if (!opts.retry) chat.push({ id: rid("h"), role: "user", text, t: nowIso() });
  if (chat.length > 60) chat.splice(0, chat.length - 60);
  DW.draft.help = ""; $("#dwInput").value = "";
  if (looksPersonal(text)) {
    chat.push({ id: rid("h"), role: "ai", text: "That's about your own tasks, so I've asked it in My Plan.", t: nowIso() });
    save(); DW.tab = "plan"; renderWidget(); sendToAssistant(text); return;
  }
  if (!ACCOUNT.on) {
    chat.push({ id: rid("h"), role: "ai", found: false, text: "Help answers come from the help guide on the Deadline Tracker server, which isn't running here. Start it with node server.js and open the link it prints.", t: nowIso() });
    save(); renderWidget(); return;
  }
  DW.busy = true; renderWidget();
  let r;
  const currency = (state.user && state.user.currency) || "INR";
  // The browser gives up after DW.timeoutMs (60 s) so a sleeping or unreachable server never leaves a spinner forever.
  const ask = body => { const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), DW.timeoutMs);
    return fetch("/api/chat", { method: "POST", credentials: "same-origin", cache: "no-store", signal: ctrl.signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(async x => { let j = null; try { j = await x.json(); } catch (e) {} if (x.status === 401 && ACCOUNT.user) signedOut(); return { ok: x.ok, status: x.status, json: j || {} }; })
      .finally(() => clearTimeout(timer)); };
  try { r = await ask({ message: text, conversationId: DW.helpConv || undefined, currency }); if (r.status === 404 && DW.helpConv) { DW.helpConv = null; r = await ask({ message: text, currency }); } }
  catch (e) { r = { ok: false, json: { error: e.name === "AbortError" ? "It took too long to get an answer." : "Couldn't reach the server. Check your internet connection." } }; }
  DW.busy = false;
  if (!r.ok) { chat.push({ id: rid("h"), role: "ai", error: true, retry: text, t: nowIso(), text: `Sorry, I couldn't answer just now. ${r.json.error || "The server didn't respond."} Please try again.` }); sfx("error"); }
  else if (!r.json.message || !String(r.json.message.text || "").trim()) chat.push({ id: rid("h"), role: "ai", error: true, retry: text, t: nowIso(), text: "I didn't get an answer that time. Please try again." });
  else { DW.helpConv = r.json.conversationId; chat.push(fromServerMsg(r.json.message)); }
  DW.scroll = true; renderWidget();
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
