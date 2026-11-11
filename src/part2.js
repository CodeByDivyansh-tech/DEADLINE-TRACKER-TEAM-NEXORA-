<script>
(function(){
"use strict";
/* =========================================================
   Utilities
   ========================================================= */
const DAY = 864e5, HOUR = 36e5, MIN = 6e4;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const pad = n => String(n).padStart(2, "0");
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
const clone = o => JSON.parse(JSON.stringify(o));
const rid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const startOfDay = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const ymd = d => { d = new Date(d); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const toLocalIso = d => { d = new Date(d); return `${ymd(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const nowIso = () => new Date().toISOString();
const fmtDate = (d, o) => new Date(d).toLocaleDateString(undefined, o || { weekday: "short", day: "numeric", month: "short" });
const fmtTime = d => new Date(d).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
const fmtDue = s => `${fmtDate(s)} · ${fmtTime(s)}`;
const fmtH = h => {
  h = Number(h) || 0;
  if (h <= 0) return "0h";
  if (h < 1) return `${Math.max(5, Math.round(h * 60 / 5) * 5)} min`;
  const r = Math.round(h * 2) / 2;
  return `${r % 1 ? r.toFixed(1) : r}h`;
};
function countdown(due, now){
  let ms = new Date(due).getTime() - now; const past = ms < 0; ms = Math.abs(ms);
  const d = Math.floor(ms / DAY), h = Math.floor(ms % DAY / HOUR), m = Math.floor(ms % HOUR / MIN), s = Math.floor(ms % MIN / 1000);
  const t = d >= 1 ? `${d}d ${h}h` : h >= 1 ? `${h}h ${m}m` : m >= 1 ? `${m}m` : "under 1m";
  return past ? `${t} late` : `${t} left`;
}
function relDay(due, now){
  const diff = Math.round((startOfDay(due) - startOfDay(now)) / DAY);
  if (diff === 0) return "today"; if (diff === 1) return "tomorrow"; if (diff === -1) return "yesterday";
  return diff > 0 ? `in ${diff} days` : `${-diff} days ago`;
}
function ago(t, now){
  const ms = now - new Date(t).getTime();
  if (ms < MIN) return "just now"; if (ms < HOUR) return `${Math.floor(ms / MIN)}m ago`;
  if (ms < DAY) return `${Math.floor(ms / HOUR)}h ago`; return `${Math.floor(ms / DAY)}d ago`;
}
const initials = n => (n || "?").split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0].toUpperCase()).join("");
const hueOf = s => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
const avatarHTML = (m, lg) => m ? `<span class="avatar${lg ? " lg" : ""}" style="background:hsl(${hueOf(m.name)} 55% 46%)" title="${esc(m.name)}">${esc(initials(m.name))}</span>` : "";
const sleep = ms => new Promise(r => setTimeout(r, ms));


/* =========================================================
   Theme: light or dark, chosen by the viewer and remembered
   ========================================================= */
const THEME_KEY = "dt-theme";
let themePref = null;
try { const t = localStorage.getItem(THEME_KEY); if (t === "light" || t === "dark") themePref = t; } catch (e) {}
function systemTheme(){ const a = document.documentElement.getAttribute("data-theme"); if (a === "light" || a === "dark") return a; return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"; }
function currentTheme(){ return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light"; }
function applyTheme(t){ document.documentElement.setAttribute("data-theme", t); }
applyTheme(themePref || systemTheme());
new MutationObserver(() => { const a = document.documentElement.getAttribute("data-theme"); if (themePref && a !== themePref) applyTheme(themePref); else if (a !== "light" && a !== "dark") applyTheme(themePref || systemTheme()); })
  .observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

/* =========================================================
   Vocabulary
   ========================================================= */
const LEVELS = ["ontrack", "attention", "risk", "critical", "overdue"];
const LV = { ontrack: "On track", attention: "Needs attention", risk: "At risk", critical: "Critical", overdue: "Overdue", done: "Done" };
const TYPES = { assignment: "Assignment", exam: "Exam", project: "Project", application: "Application", fee: "Fee / payment", task: "Task", meeting: "Meeting", personal: "Personal" };
const TYPES_BY_MODE = { student: ["assignment", "exam", "project", "application", "fee", "personal"], company: ["task", "project", "meeting", "personal"], personal: ["personal", "task", "fee", "application", "meeting"] };
const DEFAULT_TYPE = { student: "assignment", company: "task", personal: "personal" };
const STATUSES = { todo: "To do", doing: "In progress", blocked: "Blocked", review: "In review", done: "Done" };
const STATUS_COLOR = { todo: "var(--muted)", doing: "var(--accent)", blocked: "var(--risk)", review: "var(--att)", done: "var(--ok)" };
const COLORS = ["#46617a", "#14a39a", "#d9822b", "#c0476b", "#8e4a7a", "#2f9e44", "#b8900c", "#1f7f8c"];
const GROUP_WORD = { student: "Subject", company: "Project", personal: "List" };
const MODE_LABEL = { student: "Student", company: "Company", personal: "Personal" };
const MODE_COLOR = { student: "#46617a", company: "#8e4a7a", personal: "#14806f" };
const PRI = { high: { label: "High", rank: 0 }, medium: { label: "Medium", rank: 1 }, low: { label: "Low", rank: 2 } };
const REMINDER_OPTS = [[10080, "1 week before"], [4320, "3 days before"], [1440, "1 day before"], [60, "1 hour before"]];
const TEMPLATES = {
  assignment: [["Research & plan", .2], ["Write first draft", .4], ["Review & fix", .25], ["Final check & submit", .15]],
  project: [["Plan & split the work", .15], ["Build first version", .4], ["Test it", .2], ["Fix & polish", .15], ["Submit", .1]],
  exam: [["Collect notes & syllabus", .1], ["Revise all topics", .5], ["Practice past papers", .3], ["Final quick revision", .1]],
  application: [["Collect documents", .3], ["Write answers / statement", .4], ["Get it reviewed", .2], ["Submit application", .1]],
  task: [["Scope & plan", .15], ["Do the main work", .5], ["Self-review", .15], ["Revisions", .1], ["Deliver", .1]],
  meeting: [["Prepare agenda & notes", .6], ["Send follow-ups", .4]],
  fee: [["Check amount & details", .4], ["Make the payment & save receipt", .6]],
  personal: [["Prepare", .5], ["Get it done", .5]]
};

/* =========================================================
   State
   ========================================================= */
let state = null;
const CLIENT = rid("c");
const UI = {
  route: "overview", q: "",
  f: { type: "all", group: "all", risk: "all", status: "active", who: "all" },
  groupBy: "time", sort: "due",
  calView: "month", calMonth: null, calWeek: null,
  drawerId: null, drawerTab: "overview", wsMenu: false, notifOpen: false,
  sugg: {}, focus: null, boardGroup: "all"
};
const W = () => state.workspaces.find(w => w.id === state.active) || state.workspaces[0];
const findItem = (id, w = W()) => w.items.find(i => i.id === id);
const groupOf = (w, id) => w.groups.find(g => g.id === id);
const memberOf = (w, id) => w.members.find(m => m.id === id);
const isDone = it => it.status === "done";
const viewerId = w => w.mode === "company" ? (w.viewAs === "manager" ? "me" : w.viewAs) : "me";
const canManage = w => w.mode !== "company" || w.viewAs === "manager";
const canEditItem = (w, it) => canManage(w) || it.assignee === viewerId(w);

function progressOf(it){
  if (isDone(it)) return 100;
  const ms = it.milestones || [];
  if (ms.length) {
    const tot = ms.reduce((a, m) => a + (Number(m.hours) || 1), 0);
    const dn = ms.filter(m => m.done).reduce((a, m) => a + (Number(m.hours) || 1), 0);
    return Math.round(dn / tot * 100);
  }
  return clamp(Math.round(Number(it.progress) || 0), 0, 100);
}
const remainingH = it => (Number(it.estimate) > 0 && !isDone(it)) ? Number(it.estimate) * (1 - progressOf(it) / 100) : 0;

function logItem(w, it, text){
  it.log = it.log || [];
  it.log.unshift({ t: nowIso(), text });
  if (it.log.length > 40) it.log.length = 40;
  w.activity = w.activity || [];
  const who = memberOf(w, viewerId(w));
  w.activity.unshift({ t: nowIso(), text, itemId: it.id, who: who ? who.id : "me" });
  if (w.activity.length > 80) w.activity.length = 80;
}

// The Deadline Tracker logo: the glass cube app icon (icons/logo-mark.webp, 96 px). build.js puts the image
// into the page, so it shows with no server too. Decorative: the name is always written next to it.
const LOGO_SRC = "%%DT_LOGO%%";
function logoSVG(size){
  return `<img class="dt-logo" src="${LOGO_SRC}" width="${size}" height="${size}" alt="" decoding="async" draggable="false">`;
}
function defaultSettings(mode){
  return {
    hoursPerDay: mode === "company" ? 6 : 3,
    workdays: mode === "company" ? [1, 2, 3, 4, 5] : [0, 1, 2, 3, 4, 5, 6],
    reminders: [4320, 1440, 60], customReminder: 0,
    overdueAlerts: true, dailySummary: true, quietOn: true, quietFrom: "22:00", quietTo: "07:00",
    tz: (Intl.DateTimeFormat().resolvedOptions().timeZone) || "UTC",
    thresholds: { critical: 100, risk: 70, attention: 40 }
  };
}
function mkItem(w, o){
  return Object.assign({
    id: rid("d-"), kind: "deadline", plan: null, time: null, reminders: null, title: "", type: DEFAULT_TYPE[w.mode], groupId: null, notes: "", due: null,
    estimate: null, progress: 0, status: "todo", priority: "medium", assignee: "me", reviewer: null,
    needsApproval: false, dependsOn: [], milestones: [], repeat: "none", link: "", evidence: null,
    approval: null, createdAt: nowIso(), updatedAt: nowIso(), doneAt: null, loggedMin: 0, log: []
  }, o);
}
function newWorkspace(mode, name, demo, extraGroups){
  const s = defaultSettings(mode);
  const w = { id: rid("w"), name, mode, demo: !!demo, createdAt: nowIso(), groups: [], members: [], items: [], activity: [], notices: [], viewAs: "manager", settings: s };
  const me = state.user.name || "You";
  w.members = mode === "company"
    ? [{ id: "me", name: me, role: "Manager", dept: "Management", capacity: 40 }]
    : [{ id: "me", name: me, role: "Owner", capacity: s.hoursPerDay * 7 }];
  (extraGroups || []).forEach((g, i) => w.groups.push({ id: rid("g"), name: g, color: COLORS[i % COLORS.length] }));
  if (demo) seed(w);
  return w;
}

/* =========================================================
   Sample data (relative to now, clearly marked as sample)
   ========================================================= */
function seed(w){
  const now = new Date();
  const at = (days, h, m) => { const d = addDays(now, days); d.setHours(h, m, 0, 0); return toLocalIso(d); };
  const ms = arr => arr.map(([text, hours, done, dOff]) => ({ id: rid("m"), text, hours, done: !!done, date: dOff != null ? ymd(addDays(now, dOff)) : null }));
  const G = (name, color) => { const g = { id: rid("g"), name, color }; w.groups.push(g); return g.id; };
  const add = o => { const it = mkItem(w, o); it.createdAt = new Date(now.getTime() - 6 * DAY).toISOString(); w.items.push(it); return it; };
  const history = (rows) => rows.forEach(([title, gid, daysAgo, lateH, extra]) => {
    const due = addDays(now, -daysAgo); due.setHours(23, 59, 0, 0);
    const doneAt = new Date(due.getTime() + (lateH || -(6 + (daysAgo % 5) * 5)) * HOUR);
    const est = 2 + (daysAgo % 3);
    const type = (extra && extra.type) || DEFAULT_TYPE[w.mode];
    const factor = w.mode === "student" ? (type === "exam" ? 1.05 : 1.4) : w.mode === "company" ? 1.25 : 1;
    add(Object.assign({ title, groupId: gid, due: toLocalIso(due), status: "done", doneAt: doneAt.toISOString(), progress: 100, estimate: est, loggedMin: Math.round(est * 60 * factor) }, extra || {}));
  });

  if (w.mode === "student") {
    const dbms = G("DBMS", "#46617a"), phy = G("Physics", "#14a39a"), math = G("Mathematics", "#b8900c"), java = G("Java Programming", "#8e4a7a"), eng = G("English", "#d14d8b");
    add({ title: "DBMS normalization assignment", type: "assignment", groupId: dbms, due: at(2, 17, 0), estimate: 3, priority: "high", link: "https://portal.example.edu/dbms/assignment-3",
      notes: "Normalize the library schema to 3NF. Include the ER diagram as a PDF.",
      milestones: ms([["Read chapter 7 notes", 1, 1, -1], ["Solve questions 1–5", 1, 1, 0], ["Draw ER diagram", .5, 0, 1], ["Submit on portal", .5, 0, 2]]) });
    add({ title: "Physics lab report: simple pendulum", type: "assignment", groupId: phy, due: at(-1, 23, 59), estimate: 3, progress: 40, priority: "high", status: "doing",
      notes: "Late submissions lose 10% per day. Upload the PDF on the course portal." });
    add({ title: "English essay: climate and cities", type: "assignment", groupId: eng, due: at(1, 23, 59), estimate: 5, progress: 70, status: "doing", priority: "medium", notes: "1,500 words, Harvard referencing." });
    add({ title: "DBMS quiz (Unit 3)", type: "exam", groupId: dbms, due: at(2, 9, 30), estimate: 2, priority: "high",
      milestones: ms([["SQL joins", .75, 0], ["Normalization", .5, 1], ["Transactions & ACID", .75, 0]]) });
    add({ title: "Mathematics midterm", type: "exam", groupId: math, due: at(6, 10, 0), estimate: 8, priority: "high",
      milestones: ms([["Limits & continuity", 1.5, 1], ["Differentiation", 2, 1], ["Integration", 2, 0], ["Differential equations", 1.5, 0], ["Two past papers", 1, 0]]) });
    add({ title: "Java group project: library system", type: "project", groupId: java, due: at(20, 23, 59), estimate: 12, priority: "medium",
      notes: "Team: Aarav (UI), Meera (database), me (backend APIs). Demo in lab.",
      milestones: ms([["Plan & split the work", 2, 1, -3], ["Build first version", 5, 0, 9], ["Test it", 2, 0, 14], ["Fix & polish", 2, 0, 17], ["Submit", 1, 0, 19]]) });
    add({ title: "Merit scholarship application", type: "application", due: at(9, 17, 0), estimate: 3, priority: "high", notes: "Needs marksheet, income certificate and a 300-word statement." });
    add({ title: "Semester fee payment", type: "fee", due: at(4, 16, 0), estimate: .5, priority: "medium" });
    add({ title: "Summer internship application: product role", type: "application", due: at(13, 23, 59), estimate: 2, priority: "medium" });
    add({ title: "Physics problem set 4", type: "assignment", groupId: phy, due: at(8, 23, 59), estimate: 2.5, priority: "low" });
    history([["Maths homework 3", math, 2], ["DBMS lab exercise 2", dbms, 5], ["English reading response", eng, 8, 10], ["Physics quiz", phy, 12, 0, { type: "exam" }], ["Java lab: loops", java, 15],
      ["Maths homework 2", math, 19, 20], ["DBMS lab exercise 1", dbms, 23], ["English presentation", eng, 29], ["Java lab: arrays", java, 34], ["Physics problem set 3", phy, 38]]);
  } else if (w.mode === "company") {
    w.members.push(
      { id: "p", name: "Priya Sharma", role: "Product Designer", dept: "Design", capacity: 40 },
      { id: "r", name: "Rahul Verma", role: "Frontend Developer", dept: "Engineering", capacity: 40 },
      { id: "a", name: "Ananya Iyer", role: "Marketing Lead", dept: "Marketing", capacity: 32 },
      { id: "k", name: "Karan Mehta", role: "Backend Developer", dept: "Engineering", capacity: 40 });
    const web = G("Website Redesign", "#46617a"), camp = G("Q4 Launch Campaign", "#e2762b"), app = G("Mobile App v2", "#14a39a");
    const mock = add({ title: "Homepage design mockups", type: "task", groupId: web, assignee: "p", reviewer: "me", needsApproval: true, due: at(1, 18, 0), estimate: 10, progress: 70, status: "doing", priority: "high" });
    add({ title: "Build homepage components", type: "task", groupId: web, assignee: "r", due: at(4, 18, 0), estimate: 8, progress: 10, priority: "high", dependsOn: [mock.id], notes: "Needs final mockups before layout work can start." });
    add({ title: "CMS content migration", type: "task", groupId: web, assignee: "k", due: at(6, 18, 0), estimate: 12, progress: 30, status: "doing" });
    const email = add({ title: "Launch email sequence (3 emails)", type: "task", groupId: camp, assignee: "a", reviewer: "me", needsApproval: true, due: at(2, 12, 0), estimate: 6, progress: 100, status: "review", priority: "high",
      evidence: { link: "https://docs.example.com/launch-emails-v2", note: "All three emails drafted with subject line options.", at: new Date(now.getTime() - 3 * HOUR).toISOString(), by: "a" } });
    email.approval = { state: "pending", history: [{ t: new Date(now.getTime() - 3 * HOUR).toISOString(), by: "a", text: "Submitted for review" }] };
    add({ title: "Campaign landing page", type: "task", groupId: camp, assignee: "r", due: at(3, 17, 0), estimate: 6, progress: 40, status: "doing", priority: "high" });
    add({ title: "Ad creatives (5 sizes)", type: "task", groupId: camp, assignee: "p", due: at(3, 17, 0), estimate: 6, progress: 50, status: "doing" });
    add({ title: "API: push notifications", type: "task", groupId: app, assignee: "k", due: at(5, 18, 0), estimate: 14, progress: 20, status: "blocked", notes: "Waiting for Firebase credentials from IT." });
    add({ title: "App store screenshots", type: "task", groupId: app, assignee: "p", due: at(9, 17, 0), estimate: 4, priority: "low" });
    add({ title: "Fix checkout crash on Android", type: "task", groupId: app, assignee: "r", due: at(-1, 18, 0), estimate: 5, progress: 40, status: "doing", priority: "high" });
    add({ title: "Weekly client status report", type: "task", groupId: web, assignee: "me", due: at(3, 16, 0), estimate: 1.5, repeat: "weekly" });
    add({ title: "Sprint review meeting", type: "meeting", assignee: "me", due: at(2, 15, 0), estimate: 1 });
    add({ title: "Q4 budget sign-off", type: "task", groupId: camp, assignee: "me", due: at(7, 12, 0), estimate: 2, priority: "high" });
    add({ title: "Image optimisation pass", type: "task", groupId: web, assignee: "r", due: at(8, 17, 0), estimate: 3 });
    const pol = add({ title: "Database backup policy doc", type: "task", groupId: app, assignee: "k", reviewer: "me", needsApproval: true, due: at(4, 17, 0), estimate: 3, progress: 100, status: "review",
      evidence: { link: "https://docs.example.com/backup-policy", note: "Covers daily snapshots and 30-day retention.", at: new Date(now.getTime() - 26 * HOUR).toISOString(), by: "k" } });
    pol.approval = { state: "pending", history: [{ t: new Date(now.getTime() - 26 * HOUR).toISOString(), by: "k", text: "Submitted for review" }] };
    history([["Brand colour refresh", web, 3, 0, { assignee: "p" }], ["Pricing page copy", camp, 6, 0, { assignee: "a" }], ["Login API rate limits", app, 9, 30, { assignee: "k" }],
      ["Navigation prototype", web, 11, 0, { assignee: "p" }], ["Social media calendar", camp, 16, 0, { assignee: "a" }], ["Crash reporting setup", app, 18, 0, { assignee: "r" }],
      ["Sitemap & IA", web, 24, 40, { assignee: "me" }], ["Competitor teardown", camp, 30, 0, { assignee: "a" }], ["Push token storage", app, 33, 0, { assignee: "k" }], ["Footer redesign", web, 40, 0, { assignee: "r" }]]);
  } else {
    const home = G("Home", "#14a39a"), money = G("Money", "#e2762b"), health = G("Health", "#d14d8b");
    add({ title: "Pay credit card bill", type: "fee", groupId: money, due: at(1, 10, 0), estimate: .25, repeat: "monthly", priority: "high" });
    add({ title: "Submit expense claims", type: "task", groupId: money, due: at(-2, 18, 0), estimate: 1, priority: "medium" });
    add({ title: "Dentist appointment", type: "meeting", groupId: health, due: at(3, 16, 30), estimate: 1, notes: "Bring previous X-ray." });
    add({ title: "Birthday gift for Mom", type: "personal", groupId: home, due: at(6, 12, 0), estimate: 2, milestones: ms([["Shortlist 3 ideas", .5, 1], ["Order online", .5, 0], ["Wrap & write card", 1, 0]]) });
    add({ title: "Car insurance renewal", type: "fee", groupId: money, due: at(10, 17, 0), estimate: 1, priority: "high" });
    add({ title: "Renew passport", type: "application", groupId: home, due: at(18, 12, 0), estimate: 3, notes: "Book the appointment slot first; needs address proof." });
    add({ title: "Gym membership renewal", type: "fee", groupId: health, due: at(25, 20, 0), estimate: .25, priority: "low" });
    history([["Electricity bill", money, 3], ["Book eye test", health, 9], ["Clear out storage room", home, 16, 30], ["Phone plan switch", money, 25]]);
  }
  const seedLog = w.items.filter(i => !isDone(i)).slice(0, 4);
  seedLog.forEach((it, k) => w.activity.push({ t: new Date(now.getTime() - (k + 1) * 5 * HOUR).toISOString(), text: k === 0 && it.status === "review" ? `Submitted "${it.title}" for review` : `Added "${it.title}"`, itemId: it.id, who: it.assignee || "me" }));
}

/* =========================================================
   Deadline Radar: transparent, rule-based risk
   ========================================================= */
function availHours(nowMs, dueMs, w, memberId){
  if (dueMs <= nowMs) return 0;
  const s = w.settings;
  let hpd = s.hoursPerDay;
  if (w.mode === "company" && memberId) { const m = memberOf(w, memberId); if (m && m.capacity) hpd = m.capacity / Math.max(1, s.workdays.length); }
  const winStart = w.mode === "company" ? 9 : 7, winLen = w.mode === "company" ? 9 : 16;
  let tot = 0, d = startOfDay(new Date(nowMs)), guard = 0;
  while (d.getTime() < dueMs && guard++ < 400) {
    if (s.workdays.includes(d.getDay())) {
      const ds = d.getTime(), a = Math.max(ds + winStart * HOUR, nowMs), b = Math.min(ds + (winStart + winLen) * HOUR, dueMs);
      if (b > a) tot += hpd * (b - a) / (winLen * HOUR);
    }
    d = addDays(d, 1);
  }
  return tot;
}
const lvMax = (a, b) => LEVELS.indexOf(a) >= LEVELS.indexOf(b) ? a : b;
function radar(w, now){
  const th = w.settings.thresholds;
  const out = {};
  const active = w.items.filter(i => !isDone(i) && i.due).sort((a, b) => new Date(a.due) - new Date(b.due));
  const cum = {};
  const timeWord = w.mode === "company" ? "working" : "study";
  for (const it of active) {
    const key = w.mode === "company" ? (it.assignee || "_") : "_";
    const rem = remainingH(it);
    cum[key] = (cum[key] || 0) + rem;
    const dueMs = new Date(it.due).getTime();
    const reasons = []; let level = "ontrack";
    const blockers = (it.dependsOn || []).map(id => findItem(id, w)).filter(d => d && !isDone(d));
    if (dueMs < now) {
      level = "overdue";
      reasons.push(`It was due ${relDay(it.due, now) === "today" ? "earlier today" : relDay(it.due, now)} (${fmtDue(it.due)}).`);
      if (rem > 0) reasons.push(`About ${fmtH(rem)} of work is still estimated.`);
      else if (!it.estimate) reasons.push(`${progressOf(it)}% done so far.`);
      if (it.status === "review") reasons.push("It's waiting for review.");
    } else {
      const avail = availHours(now, dueMs, w, it.assignee);
      const daysLeft = (dueMs - now) / DAY;
      const need = cum[key];
      if (Number(it.estimate) > 0) {
        const ratio = need / Math.max(avail, .01) * 100;
        if (rem <= 0.01) { level = "ontrack"; reasons.push(it.status === "review" ? "Work is finished and waiting for review." : "All estimated work is finished."); }
        else {
          if (ratio >= th.critical) level = "critical"; else if (ratio >= th.risk) level = "risk"; else if (ratio >= th.attention) level = "attention";
          const earlier = need - rem;
          const who = w.mode === "company" && it.assignee !== viewerId(w) ? (memberOf(w, it.assignee) || {}).name || "The assignee" : "You";
          reasons.push(`About ${fmtH(rem)} of work is left${earlier > .05 ? `, plus ${fmtH(earlier)} for ${who === "You" ? "your" : "their"} deadlines due before it` : ""}.`);
          reasons.push(`${who} ${who === "You" ? "have" : "has"} roughly ${fmtH(avail)} of ${timeWord} time before it's due (${Math.round(ratio)}% of it needed).`);
        }
      } else {
        if (daysLeft < 1 && progressOf(it) < 50) { level = "attention"; reasons.push(`Due in under a day and ${progressOf(it)}% done.`); }
        else reasons.push(`Due ${relDay(it.due, now)}.`);
        reasons.push("Add an effort estimate to get a sharper risk check.");
      }
      if (blockers.length) {
        level = lvMax(level, daysLeft < 2 ? "critical" : "risk");
        reasons.unshift(`It depends on "${blockers[0].title}"${blockers.length > 1 ? ` and ${blockers.length - 1} more` : ""}, which isn't finished yet.`);
      }
      if (it.status === "blocked") { level = lvMax(level, "risk"); reasons.unshift("It's marked as blocked."); }
      if (Number(it.estimate) > 0 && daysLeft < 3 && progressOf(it) === 0 && rem > 0) { level = lvMax(level, "attention"); reasons.push("No progress has been recorded yet."); }
    }
    out[it.id] = { level, reasons };
  }
  return out;
}
const levelOf = (R, it) => isDone(it) ? "done" : (R[it.id] ? R[it.id].level : "ontrack");

/* =========================================================
   Planner: earliest-deadline-first sessions within availability
   ========================================================= */
function planFor(w, now, who, horizon = 14){
  const s = w.settings;
  let hpd = s.hoursPerDay;
  if (w.mode === "company") { const m = memberOf(w, who); if (m && m.capacity) hpd = m.capacity / Math.max(1, s.workdays.length); }
  const items = w.items.filter(i => !isDone(i) && i.due && Number(i.estimate) > 0 && remainingH(i) > .01 && (w.mode !== "company" || i.assignee === who))
    .sort((a, b) => new Date(a.due) - new Date(b.due));
  const rem = {}; items.forEach(i => rem[i.id] = remainingH(i));
  const sod = startOfDay(now), days = [];
  const winStart = w.mode === "company" ? 9 : 7, winLen = w.mode === "company" ? 9 : 16;
  for (let d = 0; d < horizon; d++) {
    const date = addDays(sod, d);
    let cap = s.workdays.includes(date.getDay()) ? hpd : 0;
    if (d === 0 && cap) { const end = date.getTime() + (winStart + winLen) * HOUR, start = Math.max(now, date.getTime() + winStart * HOUR); cap = hpd * clamp((end - start) / (winLen * HOUR), 0, 1); }
    cap = Math.round(cap * 4) / 4;
    let left = cap; const per = {};
    let moved = true;
    while (left >= .25 && moved) {
      moved = false;
      for (const it of items) {
        if (left < .25) break;
        if (rem[it.id] <= .01) continue;
        const dueMs = new Date(it.due).getTime();
        if (dueMs > now && date.getTime() > startOfDay(dueMs).getTime()) continue;
        if (dueMs > now && date.getTime() === startOfDay(dueMs).getTime() && new Date(it.due).getHours() < winStart + 2) continue;
        const done = per[it.id] || 0;
        if (done >= 2) continue;
        const h = Math.floor(Math.min(rem[it.id], 1, 2 - done, left) * 4) / 4;
        if (h < .25) { if (rem[it.id] < .25) { rem[it.id] = 0; } continue; }
        per[it.id] = done + h; rem[it.id] -= h; left -= h; moved = true;
      }
    }
    const sessions = Object.entries(per).map(([id, h]) => ({ id, h }));
    days.push({ date, key: ymd(date), cap, sessions, total: sessions.reduce((a, x) => a + x.h, 0) });
  }
  const short = {};
  items.forEach(i => { if (rem[i.id] > .1) short[i.id] = rem[i.id]; });
  const noEst = w.items.filter(i => !isDone(i) && i.due && !(Number(i.estimate) > 0) && (w.mode !== "company" || i.assignee === who));
  return { days, short, noEst, hpd };
}

/* =========================================================
   Conflicts & workload
   ========================================================= */
function weekLoad(w, now, memberId){
  const end = now + 7 * DAY;
  const items = w.items.filter(i => !isDone(i) && i.assignee === memberId && i.due && new Date(i.due).getTime() <= end);
  const hours = items.reduce((a, i) => a + remainingH(i), 0);
  const m = memberOf(w, memberId);
  const cap = m ? (m.capacity || 40) : 40;
  return { items, hours, cap, pct: cap ? Math.round(hours / cap * 100) : 0 };
}
function conflicts(w, now){
  const out = [];
  const act = w.items.filter(i => !isDone(i) && i.due && new Date(i.due).getTime() > now && new Date(i.due).getTime() < now + 14 * DAY)
    .sort((a, b) => new Date(a.due) - new Date(b.due));
  const pool = w.mode === "company" ? act.filter(i => i.assignee === viewerId(w)) : act;
  for (let i = 0; i < pool.length; i++) {
    const t0 = new Date(pool[i].due).getTime();
    const win = pool.filter(x => { const t = new Date(x.due).getTime(); return t >= t0 && t <= t0 + DAY; });
    const hasExam = win.some(x => x.type === "exam");
    if (win.length >= 3 || (win.length >= 2 && hasExam)) {
      const counts = {};
      win.forEach(x => counts[x.type] = (counts[x.type] || 0) + 1);
      const parts = Object.entries(counts).map(([t, n]) => `${n} ${n > 1 ? (TYPES[t] || t).toLowerCase().replace(/y$/, "ie") + "s" : (TYPES[t] || t).toLowerCase()}`);
      const txt = parts.length > 1 ? parts.slice(0, -1).join(", ") + " and " + parts.slice(-1) : parts[0];
      const first = win.slice().sort((a, b) => (Number(b.estimate) || 0) - (Number(a.estimate) || 0))[0];
      out.push({ key: "c" + win.map(x => x.id).join(""), kind: "clash", ids: win.map(x => x.id),
        text: `You have ${txt} due within 24 hours (${fmtDate(pool[i].due)}–${fmtDate(win[win.length - 1].due)}).`,
        tip: `Start "${first.title}" earlier. The planner can spread the work out.` });
      i += win.length - 1;
    }
  }
  if (w.mode === "company") {
    w.members.forEach(m => {
      const L = weekLoad(w, now, m.id);
      if (L.items.length && L.pct > 100) out.push({ key: "o" + m.id + L.items.length, kind: "over", member: m.id, ids: L.items.map(i => i.id),
        text: `${m.id === "me" ? "You have" : m.name + " has"} ${L.items.length} active deliverable${L.items.length > 1 ? "s" : ""} due this week: about ${fmtH(L.hours)} of work, ${L.pct}% of ${m.id === "me" ? "your" : "their"} ${m.capacity}h capacity.`,
        tip: canManage(w) ? "Consider reassigning or re-planning one of them. Nothing changes until you decide." : "Talk to your manager about priorities." });
    });
  }
  const P = planFor(w, now, viewerId(w), 14);
  Object.entries(P.short).forEach(([id, h]) => {
    const it = findItem(id, w); if (!it) return;
    if (new Date(it.due).getTime() - now < 10 * DAY) out.push({ key: "s" + id, kind: "short", ids: [id],
      text: `"${it.title}" doesn't fit before its deadline: about ${fmtH(h)} short with your current hours.`,
      tip: "Open Rescue mode for options, or raise your available hours in Settings." });
  });
  return out;
}


/* =========================================================
   Estimates that learn & progress check-ins
   ========================================================= */
const PLURAL = { assignment: "assignments", exam: "exams", project: "projects", application: "applications", fee: "payments", task: "tasks", meeting: "meetings", personal: "personal tasks" };
function estimateSamples(w, type){
  return w.items.filter(i => isDone(i) && i.type === type && Number(i.estimate) > 0 && (Number(i.loggedMin) || 0) >= 15);
}
function estimateInsight(w, type){
  const s = estimateSamples(w, type);
  if (s.length < 2) return null;
  const ratio = s.reduce((a, i) => a + (Number(i.loggedMin) / 60) / Number(i.estimate), 0) / s.length;
  if (Math.abs(ratio - 1) < .15) return null;
  const pct = Math.round(Math.abs(ratio - 1) * 100);
  return { ratio, n: s.length, pct,
    text: `You usually take ${pct}% ${ratio > 1 ? "longer" : "less time"} on ${PLURAL[type] || "tasks"} than you estimate (from ${s.length} finished).`,
    suggest: h => Math.max(.5, Math.round(Number(h) * ratio * 2) / 2) };
}
function checkinCandidate(w, now){
  return w.items.filter(i => !isDone(i) && i.status !== "review" && i.due && canEditItem(w, i) && (w.mode !== "company" || i.assignee === viewerId(w))
      && Number(i.estimate) > 0 && !(i.milestones || []).length && new Date(i.due).getTime() - now < 4 * DAY
      && (!i.checkedAt || now - new Date(i.checkedAt).getTime() > DAY) && (!i.checkinSnooze || now >= new Date(i.checkinSnooze).getTime()))
    .sort((a, b) => new Date(a.due) - new Date(b.due))[0] || null;
}

/* =========================================================
   Backward planning
   ========================================================= */
function backwardPlan(it, now){
  const total = it.milestones && it.milestones.length ? remainingH(it) : Number(it.estimate) || 0;
  if (total <= 0 || !it.due) return [];
  const tpl = TEMPLATES[it.type] || TEMPLATES.task;
  const dueMs = new Date(it.due).getTime();
  const span = Math.max(dueMs - now, 2 * HOUR);
  const finishBy = dueMs - Math.min(span * .12, 1.5 * DAY);
  let cum = 0;
  return tpl.map(([text, share], i) => {
    cum += share;
    const t = i === tpl.length - 1 ? dueMs - Math.min(span * .02, 2 * HOUR) : now + (finishBy - now) * cum;
    return { id: rid("m"), text, hours: Math.max(.5, Math.round(total * share * 2) / 2), date: ymd(new Date(Math.max(t, now))), done: false, keep: true };
  });
}
function chunkPlan(it, now){
  const rem = remainingH(it) || (Number(it.estimate) || 2) * .5;
  const n = clamp(Math.ceil(rem / 1), 2, 8);
  const per = Math.round(rem / n * 4) / 4 || .5;
  const dueMs = new Date(it.due).getTime() > now + n * 6 * HOUR ? new Date(it.due).getTime() : now + n * .8 * DAY;
  return Array.from({ length: n }, (_, k) => ({ id: rid("m"), text: `Focused session ${k + 1} of ${n}`, hours: per, date: ymd(new Date(now + (dueMs - now) * (k + 1) / (n + .5))), done: false, keep: true }));
}

/* =========================================================
   Smart Inbox: rule-based natural-language parsing
   ========================================================= */
const WD_RE = "(sun(?:day)?|mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?)";
const MON_RE = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const wdIndex = s => ["sun", "mon", "tue", "wed", "thu", "fri", "sat"].indexOf(s.slice(0, 3).toLowerCase());
const monIndex = s => ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(s.slice(0, 3).toLowerCase());
const WORDNUM = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const TYPE_KW = [
  ["exam", /\b(exam|midterm|mid-term|mid sem|end sem|finals?|test|quiz|viva)\b/i],
  ["assignment", /\b(assignment|homework|hw|essay|lab report|report|worksheet|problem set|lab)\b/i],
  ["project", /\b(project|capstone|thesis|dissertation)\b/i],
  ["application", /\b(apply|application|internship|scholarship|placement|registration|register|admission|form)\b/i],
  ["fee", /\b(fees?|payment|pay|bill|tuition|emi|rent|premium)\b/i],
  ["meeting", /\b(meeting|call|standup|sync|interview|appointment|presentation)\b/i]
];
// Words that make something a hard deadline rather than a task planned for a day.
const DEADLINE_RE = /\b(due|deadline|last date|submission)\b|\bsubmit\b[^,;]*\bby\b/i;
const STUDY_RE = /^\s*(study|revise|revision|prepare|prep|practi[cs]e|read|review|learn)\b/i;
// "Rahul" or "Rahul Verma" (first name or start of the full name) -> member, or null.
function memberByName(w, name){
  const q = String(name || "").trim().toLowerCase(); if (!q) return null;
  return w.members.find(m => m.name.toLowerCase() === q) || w.members.find(m => m.name.toLowerCase().split(" ")[0] === q) || w.members.find(m => q.length >= 3 && m.name.toLowerCase().startsWith(q)) || null;
}
function parseQuick(text, w, now){
  const r = { title: "", date: null, time: null, timeDefault: false, type: null, typeSuggested: false, groupId: null, newGroup: null,
    priority: null, prioritySuggested: false, estimate: null, assignee: null, assigneeMiss: null, repeat: "none", deadline: false };
  let s = " " + String(text || "").replace(/\s+/g, " ") + " ";
  const today = startOfDay(new Date(now));
  const cut = (re, fn) => { const m = s.match(re); if (m) { if (fn(m) !== false) s = s.replace(m[0], " "); return m; } return null; };
  const mkDate = (dd, mi, yy) => {
    let y = yy ? (String(yy).length === 2 ? 2000 + +yy : +yy) : today.getFullYear();
    let d = new Date(y, mi, dd);
    if (d.getMonth() !== mi || d.getDate() !== dd) return null;
    if (!yy && d < today) d = new Date(y + 1, mi, dd);
    return d;
  };
  const resolveWd = (target, kind) => {
    const cur = today.getDay(); let diff = (target - cur + 7) % 7;
    if (kind === "this") return addDays(today, diff);
    if (diff === 0) diff = 7;
    let d = addDays(today, diff);
    if (kind === "next") { const daysToSunday = 6 - ((cur + 6) % 7); if (diff <= daysToSunday) d = addDays(d, 7); }
    return d;
  };
  const setD = d => { if (d) r.date = ymd(d); return !!d; };
  s = s.replace(/^\s*(remind me to|remember to|i need to|i have to|add|todo:?)\s+/i, " ");
  // effort
  cut(/\s(?:~|about |approx\.? |around )?(\d+(?:\.\d+)?)\s?(?:h|hr|hrs|hour|hours)\b(?: of work)?/i, m => { r.estimate = parseFloat(m[1]); });
  if (r.estimate == null) cut(/\s(?:~|about )?(\d+)\s?(?:min|mins|minutes)\b(?: of work)?/i, m => { r.estimate = Math.round(parseInt(m[1], 10) / 60 * 100) / 100; });
  // priority
  cut(/\s(!{1,3}high|!{2,3}|p1|urgent|asap|high priority|important)(?=\s)/i, () => { r.priority = "high"; });
  if (!r.priority) cut(/\s(!low|p3|low priority)(?=\s)/i, () => { r.priority = "low"; });
  if (!r.priority) cut(/\s(!medium|!med|p2|medium priority)(?=\s)/i, () => { r.priority = "medium"; });
  // repeat
  cut(new RegExp("\\severy " + WD_RE + "\\b", "i"), m => { r.repeat = "weekly"; setD(resolveWd(wdIndex(m[1]), "plain")); });
  cut(/\s(every day|daily)\b/i, () => { r.repeat = "daily"; });
  cut(/\s(every week|weekly)\b/i, () => { r.repeat = "weekly"; });
  cut(/\s(every month|monthly)\b/i, () => { r.repeat = "monthly"; });
  // people & groups
  cut(/\s@([\p{L}\d._-]+)/u, m => {
    const q = m[1].toLowerCase();
    const mem = w.members.find(x => (q === "me" && x.id === "me") || x.name.toLowerCase().split(" ")[0] === q || x.name.toLowerCase().startsWith(q));
    if (mem) r.assignee = mem.id; else r.assigneeMiss = m[1];
  });
  cut(/\s#([\p{L}\d._-]+)/u, m => {
    const q = m[1].toLowerCase();
    const g = w.groups.find(x => x.name.toLowerCase() === q || x.name.toLowerCase().replace(/\s+/g, "") === q || x.name.toLowerCase().startsWith(q));
    if (g) r.groupId = g.id; else r.newGroup = m[1];
  });
  // time
  cut(/\s(?:at |by |@)?(\d{1,2})(?:[:.](\d{2}))?\s?(am|pm|a\.m\.|p\.m\.)(?=[\s,.;]|$)/i, m => {
    let h = +m[1]; const mi = m[2] ? +m[2] : 0; if (h < 1 || h > 12 || mi > 59) return false;
    h = h % 12 + (/p/i.test(m[3]) ? 12 : 0); r.time = `${pad(h)}:${pad(mi)}`;
  });
  if (!r.time) cut(/\s(?:at |by )?([01]?\d|2[0-3]):([0-5]\d)\b/, m => { r.time = `${pad(+m[1])}:${m[2]}`; });
  if (!r.time) cut(/\s(?:at |by )?(noon|midday)\b/i, () => { r.time = "12:00"; });
  if (!r.time) cut(/\s(?:at |by )?midnight\b/i, () => { r.time = "23:59"; });
  if (!r.time) cut(/\s(?:by )?(eod|end of day|end of the day)\b/i, () => { r.time = "18:00"; });
  if (!r.time) cut(/\s(?:in the )?(morning|afternoon|evening)\b/i, m => { r.time = { morning: "09:00", afternoon: "15:00", evening: "18:00" }[m[1].toLowerCase()]; });
  // date
  const pre = "(?:by |on |due |before |for )?";
  if (!r.date) cut(new RegExp("\\s" + pre + "(day after tomorrow)\\b", "i"), () => setD(addDays(today, 2)));
  if (!r.date) cut(new RegExp("\\s" + pre + "(today)\\b", "i"), () => setD(today));
  if (!r.date) cut(new RegExp("\\s" + pre + "(tonight)\\b", "i"), () => { setD(today); if (!r.time) r.time = "21:00"; });
  if (!r.date) cut(new RegExp("\\s" + pre + "(tomorrow|t+o?m+o?r+o*w+|tmr|tmw)\\b", "i"), () => setD(addDays(today, 1)));
  if (!r.date) cut(/\s(?:in|within) (\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten) (days?|weeks?)\b/i, m => { const n = WORDNUM[m[1].toLowerCase()] || +m[1]; return setD(addDays(today, /week/i.test(m[2]) ? n * 7 : n)); });
  if (!r.date) cut(new RegExp("\\s" + pre + "(next week)\\b", "i"), () => setD(resolveWd(1, "plain")));
  if (!r.date) cut(new RegExp("\\s" + pre + "(end of (?:the |this )?week)\\b", "i"), () => setD(resolveWd(5, "this")));
  if (!r.date) cut(new RegExp("\\s" + pre + "(this weekend|the weekend|weekend)\\b", "i"), () => setD(resolveWd(6, "this")));
  if (!r.date) cut(new RegExp("\\s" + pre + "(end of (?:the |this )?month)\\b", "i"), () => setD(new Date(today.getFullYear(), today.getMonth() + 1, 0)));
  if (!r.date) cut(new RegExp("\\s" + pre + "(next|this|coming) " + WD_RE + "\\b", "i"), m => setD(resolveWd(wdIndex(m[2]), m[1].toLowerCase() === "coming" ? "plain" : m[1].toLowerCase())));
  if (!r.date) cut(/\s(?:by |on |due |before )?(\d{4})-(\d{2})-(\d{2})\b/, m => setD(new Date(+m[1], +m[2] - 1, +m[3])));
  if (!r.date) cut(new RegExp("\\s" + pre + "(\\d{1,2})(?:st|nd|rd|th)?(?: of)? " + MON_RE + "(?:,? (\\d{4}))?\\b", "i"), m => setD(mkDate(+m[1], monIndex(m[2]), m[3])));
  if (!r.date) cut(new RegExp("\\s" + pre + MON_RE + " (\\d{1,2})(?:st|nd|rd|th)?(?:,? (\\d{4}))?\\b", "i"), m => setD(mkDate(+m[2], monIndex(m[1]), m[3])));
  if (!r.date) cut(/\s(?:by |on |due |before )?(\d{1,2})[\/.](\d{1,2})(?:[\/.](\d{2,4}))?\b/, m => {
    const a = +m[1], b = +m[2]; let dd, mm; const us = (navigator.language || "").toLowerCase() === "en-us";
    if (a > 12) { dd = a; mm = b; } else if (b > 12) { dd = b; mm = a; } else if (us) { mm = a; dd = b; } else { dd = a; mm = b; }
    if (mm < 1 || mm > 12) return false;
    return setD(mkDate(dd, mm - 1, m[3]));
  });
  if (!r.date) cut(new RegExp("\\s" + pre + WD_RE + "\\b", "i"), m => setD(resolveWd(wdIndex(m[1]), "plain")));
  // assignment: "assign <task> to Rahul", "<task>, assign (it) to Rahul", "<task> and give it to Karan Mehta"
  if (!r.assignee) {
    const NAME = "([\\p{L}][\\p{L}'.-]*)(?:\\s+([\\p{L}][\\p{L}'.-]*))?";
    const lead = s.match(new RegExp("^\\s*(?:please\\s+)?assign\\s+(?!(?:it|this|that)\\s+to\\b)(.+?)\\s+to\\s+" + NAME, "iu"));
    const tail = lead ? null : s.match(new RegExp("(?:^|\\s|,)\\s*(?:and\\s+)?(?:please\\s+)?(?:assign(?:ed)?|give|hand(?:\\s+over)?)\\s+(?:(?:it|this|that)\\s+)?to\\s+" + NAME, "iu"));
    const m = lead || tail;
    if (m) {
      const n1 = lead ? m[2] : m[1], n2 = lead ? m[3] : m[2];
      const two = n2 ? memberByName(w, `${n1} ${n2}`) : null;
      const mem = two || memberByName(w, n1);
      if (mem || w.mode === "company") {
        if (mem) r.assignee = mem.id; else r.assigneeMiss = n1;
        const rest = s.slice(m.index + m[0].length);
        const keep2 = n2 && !two ? " " + n2 : "";
        s = lead ? " " + m[1].replace(/^(the|a|an)\s+/i, "") + keep2 + rest : s.slice(0, m.index) + " " + keep2 + rest;
      }
    }
  }
  // type
  const allowed = TYPES_BY_MODE[w.mode];
  for (const [t, re] of TYPE_KW) if (re.test(text) && allowed.includes(t)) { r.type = t; break; }
  if (!r.type) {
    if (TYPE_KW[0][1].test(text) || TYPE_KW[1][1].test(text)) r.type = allowed[0];
    else { r.type = DEFAULT_TYPE[w.mode]; r.typeSuggested = true; }
  }
  // group by name mention
  if (!r.groupId && !r.newGroup) {
    const low = text.toLowerCase();
    const g = w.groups.find(x => { const n = x.name.toLowerCase(); if (low.includes(n)) return true; const fw = n.split(/\s+/)[0]; return fw.length >= 3 && new RegExp("\\b" + fw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b").test(low); });
    if (g) r.groupId = g.id;
  }
  // title
  let t = s.replace(/\s+/g, " ").trim();
  for (let k = 0; k < 3; k++) t = t.replace(/[\s,;:.\-–]+$/, "").replace(/\s(by|on|due|at|before|for|in|and|the|is|are)$/i, "").trim();
  t = t.replace(/^(to|due)\s+/i, "");
  r.title = t ? t.charAt(0).toUpperCase() + t.slice(1) : "";
  // A deadline when the words say so ("due", "deadline", "submit … by"), or an exam/quiz date (not studying for one).
  r.deadline = DEADLINE_RE.test(text) || (w.mode !== "company" && /\b(exam|midterm|mid-term|mid sem|end sem|finals?|quiz|viva)\b|\w\s+test\b/i.test(text) && !STUDY_RE.test(r.title));
  if (r.date && !r.time) { r.time = r.type === "exam" ? "09:00" : r.type === "assignment" ? "23:59" : w.mode === "company" ? "18:00" : "17:00"; r.timeDefault = true; }
  if (!r.priority) {
    r.prioritySuggested = true;
    const dueMs = r.date ? new Date(`${r.date}T${r.time || "23:59"}`).getTime() : null;
    r.priority = r.type === "exam" || (dueMs && dueMs - now < 2 * DAY) ? "high" : "medium";
  }
  return r;
}
function extractFromText(text, w, now){
  const parts = String(text || "").split(/\n+|(?<=[.!?])\s+(?=[A-Z0-9])/).map(x => x.trim()).filter(x => x.length > 4);
  return parts.map(src => ({ src, p: parseQuick(src, w, now) }));
}

/* =========================================================
   Saving: per-person store when available, then browser, then memory
   ========================================================= */
const LS_V2 = "deadline-tracker-v2", LS_V1 = "deadline-tracker-v1";
const Store = { mode: "memory", ref: null, saving: false, dirty: false, timer: null, ready: false };
function lsOk(){ try { localStorage.setItem("__dt", "1"); localStorage.removeItem("__dt"); return true; } catch (e) { return false; } }
function lsGet(k){ try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
function save(){
  if (!state) return;
  state.updatedAt = Date.now(); state.writer = CLIENT;
  try { (state.workspaces || []).forEach(recordDay); } catch (e) {}   // today's progress record (todo.js)
  if (Store.mode === "server") { saveServer(); return; }
  if (Store.mode === "local" || Store.mode === "db") { try { localStorage.setItem(LS_V2, JSON.stringify(state)); } catch (e) {} }
  if (Store.mode === "db") { clearTimeout(Store.timer); Store.timer = setTimeout(flush, 600); }
}
async function withRetry(f){ try { return await f(); } catch (e) { if (e && e.code === "unavailable") { await sleep(400 + Math.random() * 700); return f(); } throw e; } }
let warned = false;
async function flush(){
  if (Store.mode !== "db" || !Store.ref) return;
  if (Store.saving) { Store.dirty = true; return; }
  Store.saving = true;
  try { await withRetry(() => Store.ref.set(clone(state))); }
  catch (e) {
    const c = e && e.code;
    if (c === "quota_exceeded") toast("Your saved data is too large. Remove completed deadlines or old workspaces, then try again.", null, null, "error");
    else if (!warned) { warned = true; toast(c === "invalid_argument" || c === "revoked" ? "Changes can't be saved to your account in this view. They're kept in this browser." : "Couldn't save to your account. Check your connection; your changes are kept in this browser.", null, null, "error"); }
  }
  Store.saving = false;
  if (Store.dirty) { Store.dirty = false; flush(); }
}
function legacyToWorkspace(items){
  const w = newWorkspace("personal", "Personal", false);
  const cats = {};
  items.forEach(o => {
    if (!o || !o.title || !o.due) return;
    let gid = null;
    if (o.category) { if (!cats[o.category]) { const g = { id: rid("g"), name: o.category, color: COLORS[Object.keys(cats).length % COLORS.length] }; w.groups.push(g); cats[o.category] = g.id; } gid = cats[o.category]; }
    w.items.push(mkItem(w, { title: o.title, due: o.due, notes: o.notes || "", priority: PRI[o.priority] ? o.priority : "medium", groupId: gid,
      repeat: o.repeat || "none", status: o.done ? "done" : "todo", doneAt: o.doneAt || null, createdAt: o.createdAt || nowIso(),
      milestones: (o.subtasks || []).map(s => ({ id: rid("m"), text: s.text, hours: 1, done: !!s.done, date: null })) }));
  });
  return w;
}
function initStore(){
  if (lsOk()) {
    Store.mode = "local";
    state = lsGet(LS_V2);
    if (!state) {
      const v1 = lsGet(LS_V1);
      if (v1 && Array.isArray(v1.items) && v1.items.length) {
        state = { v: 2, user: { name: "" }, active: null, workspaces: [], read: {}, updatedAt: Date.now() };
        const w = legacyToWorkspace(v1.items); state.workspaces.push(w); state.active = w.id;
      }
    }
  }
  connectDb();
}
async function connectDb(){
  if (!window.claude || typeof window.claude.use !== "function") return;
  try {
    const [db, user] = await Promise.all([window.claude.use("db"), window.claude.use("user")]);
    if (!db || !user) return;
    const uid = await user.id();
    if (!uid) return;
    const col = db.collection("data/users/" + uid);
    const ref = col.doc("state");
    ref.onSnapshot(async snap => {
      if (snap.metadata && snap.metadata.fromCache && !Store.ready) return;
      const remote = snap.exists ? snap.data() : null;
      if (!Store.ready) {
        Store.ready = true; Store.ref = ref; Store.mode = "db";
        if (remote && remote.workspaces && remote.workspaces.length) {
          if (!state || !state.workspaces.length || (remote.updatedAt || 0) >= (state.updatedAt || 0)) { state = clone(remote); afterLoad(); }
          else flush();
        } else if (state && state.workspaces.length) { flush(); }
        else {
          try {
            const qs = await col.get();
            const legacy = qs.docs.filter(d => d.id.startsWith("d-")).map(d => clone(d.data() || {}));
            if (legacy.length) {
              state = { v: 2, user: { name: "" }, active: null, workspaces: [], read: {}, updatedAt: Date.now() };
              const w = legacyToWorkspace(legacy); state.workspaces.push(w); state.active = w.id;
              save(); afterLoad(); toast(`Brought over ${legacy.length} deadlines from the earlier version.`);
            }
          } catch (e) {}
        }
        renderSync(); return;
      }
      if (remote && remote.writer !== CLIENT && (remote.updatedAt || 0) > (state ? state.updatedAt || 0 : 0) && !Store.saving && !Store.dirty) {
        state = clone(remote); afterLoad();
      }
    }, () => {});
  } catch (e) {}
}
function renderSync(){ const el = $("#syncLine"); if (el) el.textContent = syncText(); }
const syncText = () => Store.mode === "server" ? `Saved to your account${ACCOUNT.user ? ` (${ACCOUNT.user.email})` : ""}` : Store.mode === "db" ? "Saved to your account" : Store.mode === "local" ? "Saved in this browser" : "Not saved: storage is off here";
