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

// The Deadline Tracker logo (also in logo.svg). Each copy gets its own gradient id.
let logoN = 0;
function logoSVG(size){
  const id = "dtg" + (++logoN);
  return `<svg class="dt-logo" width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true" focusable="false"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2a2d31"/><stop offset="1" stop-color="#151515"/></linearGradient></defs><rect width="64" height="64" rx="16" fill="url(#${id})"/><circle cx="32" cy="33" r="17" fill="none" stroke="#fff" stroke-opacity=".28" stroke-width="5"/><path d="M32 16 A17 17 0 1 1 17.28 24.5" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round"/><path d="M24.5 33.5 30 39 40.5 27.5" fill="none" stroke="#fff" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="32" cy="16" r="4" fill="#99b6d2" stroke="#fff" stroke-width="1.5"/></svg>`;
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

/* =========================================================
   Icons
   ========================================================= */
const svg = p => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const IC = {
  overview: svg('<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>'),
  list: svg('<path d="M9 6h11M9 12h11M9 18h11"/><path d="m3.5 6 1 1 2-2M3.5 12l1 1 2-2M3.5 18l1 1 2-2"/>'),
  exam: svg('<path d="M4 4h12l4 4v12H4z"/><path d="M8 12h8M8 16h5M8 8h4"/>'),
  calendar: svg('<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>'),
  planner: svg('<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9.5 2.5h5"/>'),
  reports: svg('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
  prefs: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  team: svg('<rect x="3" y="4" width="5" height="16" rx="1.5"/><rect x="10" y="4" width="5" height="10" rx="1.5"/><rect x="17" y="4" width="4" height="13" rx="1.5"/>'),
  workload: svg('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M17 11h5M17 15h4M17 7h3"/>'),
  approvals: svg('<path d="M9 11.5 11.5 14 16 9"/><path d="M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6z"/>'),
  mywork: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
  play: svg('<path d="M7 4.5v15l12-7.5z" fill="currentColor"/>'),
  pause: svg('<path d="M8 5v14M16 5v14"/>'),
  rescue: svg('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="m5.6 5.6 3.6 3.6M14.8 14.8l3.6 3.6M18.4 5.6l-3.6 3.6M9.2 14.8l-3.6 3.6"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  x: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
  chev: svg('<path d="m8 10 4 4 4-4"/>'),
  alert: svg('<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17.5v.5"/>'),
  info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.5"/>'),
  spark: svg('<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>'),
  trash: svg('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>'),
  link: svg('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'),
  more: svg('<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>'),
  inbox: svg('<path d="M3 13h5l1.5 3h5L16 13h5"/><path d="M5 5h14l2 8v6H3v-6z"/>'),
  student: svg('<path d="M2 9 12 4l10 5-10 5z"/><path d="M6 11v5c3 2.5 9 2.5 12 0v-5"/>'),
  company: svg('<rect x="4" y="3" width="11" height="18" rx="1.5"/><path d="M15 9h5v12h-5M8 7h3M8 11h3M8 15h3"/>'),
  personal: svg('<path d="M12 21s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.6-7 10-7 10z"/>'),
  sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  moon: svg('<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>'),
  edit: svg('<path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="m13.5 6.5 4 4"/>'),
  bell: svg('<path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>'),
  forward: svg('<path d="M5 12h12M13 6l6 6-6 6"/>'),
  flag: svg('<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>'),
  send: svg('<path d="M4 12 20 4l-6 16-3-7z"/>'),
  mail: svg('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>'),
  todo: svg('<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="m8 12.5 3 3 5-6"/>'),
  assistant: svg('<path d="M12 3c.6 3.7 2.3 5.4 6 6-3.7.6-5.4 2.3-6 6-.6-3.7-2.3-5.4-6-6 3.7-.6 5.4-2.3 6-6z"/><path d="M19 15c.3 1.6 1 2.3 2.5 2.5-1.5.3-2.2 1-2.5 2.5-.3-1.5-1-2.2-2.5-2.5 1.5-.2 2.2-.9 2.5-2.5z"/>'),
  copy: svg('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>')
};

/* =========================================================
   Navigation
   ========================================================= */
// [route, label, inMore]: four main items (plus team pages for company), the rest folded under "More".
function navFor(w){
  const M = true;
  if (w.mode === "student") return [["overview", "Today"], ["daily", "Daily tasks"], ["habits", "Habit Tracker"], ["assistant", "Assistant"], ["calendar", "Calendar"], ["deadlines", "Deadlines"], ["exams", "Exams", M], ["planner", "Study Planner", M], ["reports", "Reports", M], ["prefs", "Settings", M]];
  if (w.mode === "company") {
    const n = [["overview", "Today"], ["daily", "Daily tasks"], ["habits", "Habit Tracker"], ["assistant", "Assistant"], ["calendar", "Calendar"], ["mywork", "My Work"], ["team", "Team Deadlines"]];
    if (canManage(w)) n.push(["workload", "Workload"], ["approvals", "Needs attention"]);
    n.push(["planner", "My Planner", M]);
    if (canManage(w)) n.push(["reports", "Reports", M]);
    n.push(["prefs", "Settings", M]);
    return n;
  }
  return [["overview", "Today"], ["daily", "Daily tasks"], ["habits", "Habit Tracker"], ["assistant", "Assistant"], ["calendar", "Calendar"], ["deadlines", "Deadlines"], ["planner", "Planner", M], ["reports", "Reports", M], ["prefs", "Settings", M]];
}
const NAV_GROUP = {};
const NAV_ICON = { assistant: IC.assistant, todo: IC.todo, daily: IC.todo, overview: IC.overview, deadlines: IC.list, mywork: IC.mywork, exams: IC.exam, calendar: IC.calendar, planner: IC.planner, reports: IC.reports, prefs: IC.prefs, team: IC.team, workload: IC.workload, approvals: IC.approvals };
function setRoute(r, push = true){
  const w = W();
  const valid = navFor(w).map(x => x[0]);
  UI.route = valid.includes(r) ? r : "overview";
  if (push) { try { if (location.hash !== "#" + UI.route) location.hash = UI.route; } catch (e) {} }
  UI.animate = true;
  closeNotif();
  render();
  const v = $("#view"); if (v) v.scrollTop = 0;
}

/* =========================================================
   Render core
   ========================================================= */
let CTX = null;
function render(opts = {}){
  const bs = document.getElementById("bootSplash"); if (bs) bs.remove();   // the loading screen is only for the first start
  if (ACCOUNT.on && !ACCOUNT.user) return; // the log in screen stays until you log in
  queueMicrotask(renderWidget);
  if (!state || !state.workspaces || !state.workspaces.length) { showOnboarding(); return; }
  $("#onb").hidden = true; $("#app").hidden = false;
  const ae = document.activeElement;
  const aid = ae && ae.id, selS = ae && ae.selectionStart, selE = ae && ae.selectionEnd;
  const w = W(); const now = Date.now();
  CTX = { w, now, R: radar(w, now) };
  MOTION.railShell(); renderSide(); renderTop(); renderBnav();
  const drawerHasFocus = $("#drawer").contains(document.activeElement);
  $("#viewInner").innerHTML = VIEWS[UI.route] ? VIEWS[UI.route]() : VIEWS.overview();
  $("#viewInner").style.animation = UI.animate ? "" : "none";
  if (UI.animate) { countUp(); MOTION.view($("#viewInner")); UI.animate = false; }
  if (!(opts.soft && drawerHasFocus)) renderDrawer();
  renderFocusMini();
  if (UI.route === "assistant") scrollChat();
  if (aid) { const el = document.getElementById(aid); if (el && el !== document.activeElement) { el.focus({ preventScroll: true }); try { if (selS != null) el.setSelectionRange(selS, selE); } catch (e) {} } }
}
function countUp(){
  $$("[data-count]").forEach(el => {
    const n = +el.dataset.count; if (!n || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t0 = performance.now();
    const step = t => { const k = clamp((t - t0) / 550, 0, 1); el.textContent = Math.round(n * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  });
}

function renderSide(){
  const w = W();
  const nav = navFor(w);
  const R = CTX.R;
  const badge = r => {
    if (r === "overview") { const n = todayTodos(w, CTX.now).filter(i => !isDone(i)).length; return n ? `<span class="badge soft">${n}</span>` : ""; }
    if (r === "approvals") { const n = attentionCount(attentionOf(w, CTX.now)); return n ? `<span class="badge">${n}</span>` : ""; }
    if (r === "deadlines" || r === "mywork") { const n = w.items.filter(i => !isDone(i) && (r !== "mywork" || i.assignee === viewerId(w)) && ["overdue", "critical"].includes(levelOf(R, i))).length; return n ? `<span class="badge">${n}</span>` : ""; }
    return "";
  };
  const rail = MOTION.isRail();
  const link = (r, l) => `<a href="#${r}" data-route="${r}" data-flip="nav-${r}" aria-current="${UI.route === r ? "page" : "false"}" class="${r === "assistant" ? "nav-ai" : ""}"${rail ? ` title="${esc(l)}"` : ""}>${NAV_ICON[r]}<span class="lbl">${l}</span>${badge(r)}</a>`;
  $("#side").innerHTML = `
    <div class="brand" data-flip="brand">${logoSVG(28)}<span class="lbl">Deadline Tracker</span></div>
    <button class="ws-btn" type="button" data-act="wsmenu" data-flip="ws" aria-expanded="${UI.wsMenu}"${rail ? ` title="${esc(w.name)} · switch workspace"` : ""}>
      <span class="ws-ico" style="background:${MODE_COLOR[w.mode]}">${esc(initials(w.name))}</span>
      <span class="lbl" style="min-width:0"><span class="wn">${esc(w.name)}</span><span class="wm">${MODE_LABEL[w.mode]} workspace</span></span>
      <span class="chev">${IC.chev}</span>
    </button>
    ${UI.wsMenu && !rail ? `<div class="ws-menu">${state.workspaces.map(x => `<button type="button" data-act="wsswitch" data-ws="${x.id}" aria-current="${x.id === w.id}"><span class="ws-ico" style="background:${MODE_COLOR[x.mode]}">${esc(initials(x.name))}</span><span>${esc(x.name)}<br><small style="color:var(--side-muted)">${MODE_LABEL[x.mode]}</small></span></button>`).join("")}
      <button type="button" data-act="wsnew"><span class="ws-ico" style="background:var(--side-hover)">${IC.plus}</span>New workspace</button></div>` : ""}
    <nav class="nav" aria-label="Sections">
      ${nav.filter(x => !x[2]).map(([r, l]) => link(r, l)).join("")}
      <details class="nav-more"${nav.some(x => x[2] && x[0] === UI.route) || UI.navMore ? " open" : ""}><summary data-flip="more"${rail ? ` title="More"` : ""}>${IC.more}<span class="lbl">More</span></summary>${nav.filter(x => x[2]).map(([r, l]) => link(r, l)).join("")}</details>
    </nav>
    <div class="side-foot">
      ${w.mode === "company" ? `<div class="viewas"><label for="viewAs">Viewing as (prototype role switch)</label>
        <select id="viewAs">${[["manager", `${memberOf(w, "me").name} · Manager`]].concat(w.members.filter(m => m.id !== "me").map(m => [m.id, `${m.name} · Employee`])).map(([v, l]) => `<option value="${v}" ${w.viewAs === v ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>
        <span>Permissions are simulated here. A real build checks them on the server.</span></div>` : ""}
      <p class="tagline">Never miss a deadline. Always know what comes next.<br><span id="syncLine">${syncText()}</span>${ACCOUNT.user ? ` · <button type="button" class="linkish" data-act="logout">Log out</button>` : ""}</p>
    </div>`;
}
/* Email and Telegram (server only). Status comes from /api/channels; nothing secret is in the page. */
function channelsHTML(){
  if (Store.mode !== "server") return `<p class="note">${IC.info}<span>Email and Telegram reminders need the Deadline Tracker server (log in with an account).</span></p>`;
  const C = UI.channels, p = (ACCOUNT.user && ACCOUNT.user.notifyPrefs) || {};
  if (!C || UI.channelsStale) { loadChannels(); if (!C) return `<div class="chan" aria-busy="true"><p class="muted">Loading email and Telegram…</p></div>`; }
  const e = C.email, t = C.telegram;
  const emailLine = !e.configured ? "Email isn't set up on this site yet." : e.verified ? `${esc(e.address)} · Confirmed` : `${esc(e.address)} · Not confirmed yet`;
  const tgLine = !t.configured ? "Telegram isn't set up on this site yet." : t.linked ? `Connected as ${t.username ? "@" + esc(t.username) : "your Telegram account"}` : "Not connected";
  const tgBtns = !t.configured ? "" : t.linked
    ? `<button class="btn sm" type="button" data-act="tgtest">Send test</button><button class="btn sm ghost" type="button" data-act="tgunlink">Disconnect</button>`
    : UI.tgLink ? `<a class="btn sm primary" id="tgOpen" href="${esc(UI.tgLink.url)}" target="_blank" rel="noopener">${IC.send}Open Telegram and press Start</a>`
    : `<button class="btn sm primary" type="button" data-act="tglink">${IC.send}Connect Telegram</button>`;
  return `<div class="chan">
      <div class="int" id="chEmail"><span class="lg">${IC.mail}</span><div><b>Email</b><span>${emailLine}</span></div>
        ${e.configured && !e.verified ? `<button class="btn sm" type="button" data-act="chverify">Send confirmation email</button>` : ""}${e.configured && e.verified ? `<button class="btn sm" type="button" data-act="chtestemail">Send test</button>` : ""}
        <label class="toggle"><input type="checkbox" id="ch-email" ${p.email !== false ? "checked" : ""} ${e.configured ? "" : "disabled"}><span class="ch-on">Reminders</span><span class="sr"> (send reminders by email)</span></label></div>
      <div class="int" id="chTg"><span class="lg">${IC.send}</span><div><b>Telegram</b><span>${tgLine}${UI.tgLink && !t.linked ? ". Press Start in the bot; this page updates by itself." : ""}</span></div>${tgBtns}
        <label class="toggle"><input type="checkbox" id="ch-tg" ${p.telegram !== false ? "checked" : ""} ${t.configured ? "" : "disabled"}><span class="ch-on">Reminders</span><span class="sr"> (send reminders to telegram)</span></label></div>
      <p class="muted chan-h">What goes to email and Telegram:</p>
      <div class="f2">
        <label class="toggle"><input type="checkbox" id="pf-deadline" ${p.deadline !== false ? "checked" : ""}>Deadline reminders</label>
        <label class="toggle"><input type="checkbox" id="pf-study" ${p.study !== false ? "checked" : ""}>Study reminders and daily summary</label>
        <label class="toggle"><input type="checkbox" id="pf-account" ${p.account !== false ? "checked" : ""}>Account messages (password changes)</label>
      </div>
      ${e.configured && !e.verified ? `<p class="note">${IC.info}<span>Reminders go to your email once you confirm the address. Password reset emails always arrive.</span></p>` : ""}
    </div>`;
}
const PAGE = { overview: "Overview", deadlines: "My Deadlines", mywork: "My Work", exams: "Exams", calendar: "Calendar", planner: "Planner", reports: "Reports", prefs: "Settings", team: "Team Deadlines", workload: "Workload", approvals: "Approvals" };
function renderTop(){
  const w = W();
  const label = (navFor(w).find(x => x[0] === UI.route) || [0, PAGE[UI.route]])[1];
  $("#pageTitle").textContent = label;
  $("#pageSub").textContent = `${w.name} · ${MODE_LABEL[w.mode]}`;
  const dark = currentTheme() === "dark"; const tb = $("#themeBtn");
  const lbl = `Switch to ${dark ? "light" : "dark"} mode`;
  if (tb.getAttribute("aria-label") !== lbl || !tb.innerHTML) { tb.setAttribute("aria-label", lbl); tb.title = lbl; tb.innerHTML = dark ? IC.sun : IC.moon; }
  $("#demoTag").innerHTML = w.demo ? `<span class="demo-tag hide-m">Sample data<button type="button" data-act="cleardemo">Clear</button></span>` : "";
  renderBell();
}
function renderBnav(){
  const w = W(); const nav = navFor(w);
  // phone bar: Today, Daily tasks, the deadlines list and the Assistant; everything else is under More
  const pick = ["overview", "daily", "deadlines", "mywork", "assistant"]; const main = pick.map(r => nav.find(x => x[0] === r && !x[2])).filter(Boolean).slice(0, 4);
  $("#bnav").innerHTML = main.map(([r, l]) => `<a href="#${r}" data-route="${r}" aria-current="${UI.route === r ? "page" : "false"}">${NAV_ICON[r]}<span>${l.replace("My ", "").replace("Team Deadlines", "Team").replace("Daily tasks", "Daily")}</span></a>`).join("") +
    `<button type="button" data-act="morenav">${IC.more}<span>More</span></button>`;
}

/* =========================================================
   Item row
   ========================================================= */
function riskBadge(lv, id, asButton){
  const tag = asButton ? "button" : "span";
  return `<${tag} class="risk lv-${lv}" ${asButton ? `type="button" data-act="open" data-id="${id}" title="See why"` : ""}>${LV[lv]}</${tag}>`;
}
function rowHTML(it){
  const { w, R } = CTX;
  const lv = levelOf(R, it), g = groupOf(w, it.groupId), m = memberOf(w, it.assignee), p = progressOf(it), done = isDone(it);
  const mgrReview = it.status === "review";
  const checkLbl = done ? "Mark as not done" : (w.mode === "company" && it.needsApproval && !canManage(w)) ? "Submit for review" : "Mark as done";
  return `<div class="item lv-${lv}${done ? " done" : ""}" data-id="${it.id}">
    <span class="edge" aria-hidden="true"></span>
    <button class="check${mgrReview ? " review" : ""}" type="button" data-act="toggle" aria-label="${checkLbl}: ${esc(it.title)}" ${canEditItem(w, it) ? "" : "disabled"}>${IC.check}</button>
    <button class="body" type="button" data-act="open">
      <span class="t">${esc(it.title)}</span>
      <span class="m">
        ${done ? "" : riskBadge(lv)}
        ${g ? `<span class="chip" style="--c:${g.color}"><i></i>${esc(g.name)}</span>` : ""}
        <span>${TYPES[it.type] || "Task"}</span>
        <span class="pill pr-${it.priority}">${PRI[it.priority].label}</span>
        ${w.mode === "company" && m ? `<span class="row-flex" style="gap:5px">${avatarHTML(m)}${esc(m.id === viewerId(w) ? "You" : m.name.split(" ")[0])}</span>` : ""}
        ${!done && (p > 0 || it.estimate) ? `<span class="row-flex" style="gap:5px"><span class="ring" style="--p:${p}"></span>${p}%${it.estimate ? ` of ${fmtH(it.estimate)}` : ""}</span>` : ""}
        ${it.status === "blocked" ? `<span style="color:var(--risk);font-weight:600">Blocked</span>` : ""}
        ${it.status === "review" ? `<span style="color:var(--att);font-weight:600">In review</span>` : ""}
        ${it.repeat && it.repeat !== "none" ? `<span>Repeats ${it.repeat}</span>` : ""}
        ${it.extension && it.extension.status === "approved" ? `<span class="chip">Extended</span>` : ""}
      </span>
    </button>
    <div class="due">
      <span class="cd lv-${lv}" ${done ? "" : `data-cd="${esc(it.due)}"`}>${done ? (it.doneAt ? `Done ${fmtDate(it.doneAt)}` : "Done") : countdown(it.due, CTX.now)}</span>
      <span class="abs">${fmtDate(it.due)}</span>
    </div>
    <div class="acts">
      ${!done && ["critical", "overdue"].includes(lv) && canEditItem(w, it) ? `<button class="ib" type="button" data-act="rescue" aria-label="Rescue mode" title="Rescue mode" style="color:var(--crit)">${IC.rescue}</button>` : ""}
      ${!done && canEditItem(w, it) ? `<button class="ib" type="button" data-act="focus" aria-label="Start a focus session" title="Start a 25-minute focus session">${IC.planner}</button>` : ""}
      <button class="ib more-ib" type="button" data-act="open" aria-label="Open details" title="Open details">${IC.more}</button>
    </div>
  </div>`;
}

/* =========================================================
   Overview
   ========================================================= */
function greeting(){ const h = new Date().getHours(); return h < 5 ? "Working late" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"; }
function scopeItems(w){ return w.mode === "company" && !canManage(w) ? w.items.filter(i => i.assignee === viewerId(w)) : w.items; }
function radarHTML(w, items){
  const { R, now } = CTX;
  const act = items.filter(i => !isDone(i) && i.due && new Date(i.due).getTime() < now + 21 * DAY);
  const groups = w.groups.length ? w.groups.slice(0, 6) : [];
  const sectors = groups.length ? groups.map(g => ({ id: g.id, name: g.name, color: g.color })) : [{ id: null, name: "", color: "var(--accent)" }];
  const hasOther = act.some(i => !sectors.find(s => s.id === i.groupId));
  if (groups.length && hasOther) sectors.push({ id: "__other", name: "Other", color: "var(--muted)" });
  const n = sectors.length, C = 150, R0 = 22, RMAX = 132;
  const rad = days => days <= 0 ? R0 * .6 : R0 + (RMAX - R0) * Math.sqrt(Math.min(days, 21) / 21);
  const rings = [[1, "1d"], [3, "3d"], [7, "7d"], [14, "14d"], [21, "21d"]];
  let blips = ""; const placed = [];
  act.forEach(it => {
    const si = Math.max(0, sectors.findIndex(s => s.id === it.groupId || (s.id === "__other" && !groups.find(g => g.id === it.groupId)) || (s.id === null)));
    const days = (new Date(it.due).getTime() - now) / DAY;
    const r = rad(days);
    const jitter = (hueOf(it.id) % 100) / 100;
    const size = it.priority === "high" ? 7 : it.priority === "medium" ? 5.5 : 4.5;
    // Dots due at the same time in the same sector would sit on top of each other (the lower one couldn't be
    // clicked): move a colliding dot sideways within its sector, then slightly outward if the sector is full.
    let a = (si + .15 + jitter * .7) / n * Math.PI * 2 - Math.PI / 2, rr = r, x = C + Math.cos(a) * rr, y = C + Math.sin(a) * rr;
    const hits = () => placed.some(p => Math.hypot(p.x - x, p.y - y) < p.s + size + 1.5);
    for (let k = 1; k <= 40 && hits(); k++) {
      const step = (size * 2.2) / Math.max(rr, 12), off = Math.ceil(k / 2) * step * (k % 2 ? 1 : -1);
      const lo = (si + .04) / n * Math.PI * 2 - Math.PI / 2, hi = (si + .96) / n * Math.PI * 2 - Math.PI / 2;
      a = Math.min(hi, Math.max(lo, (si + .15 + jitter * .7) / n * Math.PI * 2 - Math.PI / 2 + off));
      if (k > 20) rr = Math.min(RMAX + 10, r + (k - 20) * 1.5);
      x = C + Math.cos(a) * rr; y = C + Math.sin(a) * rr;
    }
    placed.push({ x, y, s: size });
    const lv = R[it.id].level; const col = `var(--${{ ontrack: "ok", attention: "att", risk: "risk", critical: "crit", overdue: "over" }[lv]})`;
    if (lv === "critical" || lv === "overdue") blips += `<circle class="halo" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${size}" fill="${col}"/>`;
    blips += `<circle class="blip" data-act="open" data-id="${it.id}" data-tip="${esc(it.title)} · ${LV[lv]} · ${esc(countdown(it.due, now))}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${size}" fill="${col}" stroke="var(--surface)" stroke-width="1.5" tabindex="0" role="button" aria-label="${esc(it.title)}, ${LV[lv]}"/>`;
  });
  const secLines = n > 1 ? sectors.map((s, i) => { const a = i / n * Math.PI * 2 - Math.PI / 2; return `<line class="sector" x1="${C}" y1="${C}" x2="${C + Math.cos(a) * RMAX}" y2="${C + Math.sin(a) * RMAX}"/>`; }).join("") : "";
  const secLbls = n > 1 ? sectors.map((s, i) => { const a = (i + .5) / n * Math.PI * 2 - Math.PI / 2; const x = C + Math.cos(a) * (RMAX + 12), y = C + Math.sin(a) * (RMAX + 12); return `<text class="seclbl" x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${Math.abs(Math.cos(a)) < .3 ? "middle" : Math.cos(a) > 0 ? "start" : "end"}" dominant-baseline="middle">${esc(s.name.length > 14 ? s.name.slice(0, 13) + "…" : s.name)}</text>`; }).join("") : "";
  const counts = {}; LEVELS.forEach(l => counts[l] = 0); act.forEach(i => counts[R[i.id].level]++);
  const allAct = items.filter(i => !isDone(i) && i.due); const allCounts = {}; LEVELS.forEach(l => allCounts[l] = 0); allAct.forEach(i => allCounts[R[i.id].level]++);
  return `<div class="radar-wrap">
    <div class="radar" id="radar">
      <svg viewBox="-30 -20 360 340" role="img" aria-label="Deadline radar: deadlines placed by time left, coloured by risk">
        <defs><radialGradient id="sweepGrad" cx="150" cy="150" r="132" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="var(--accent)" stop-opacity=".0"/><stop offset="1" stop-color="var(--accent)" stop-opacity=".12"/></radialGradient></defs>
        ${rings.map(([d, l]) => `<circle class="ring" cx="${C}" cy="${C}" r="${rad(d).toFixed(1)}"/><text class="ringlbl" x="${C + 3}" y="${(C - rad(d) + 10).toFixed(1)}">${l}</text>`).join("")}
        <path class="sweep" d="M${C} ${C} L${C} ${C - RMAX} A${RMAX} ${RMAX} 0 0 1 ${(C + RMAX * Math.sin(Math.PI / 5)).toFixed(1)} ${(C - RMAX * Math.cos(Math.PI / 5)).toFixed(1)} Z">${matchMedia("(prefers-reduced-motion: reduce)").matches ? "" : `<animateTransform attributeName="transform" type="rotate" from="0 ${C} ${C}" to="360 ${C} ${C}" dur="7s" repeatCount="indefinite"/>`}</path>
        ${secLines}${secLbls}
        <circle cx="${C}" cy="${C}" r="${R0 * .6}" fill="color-mix(in srgb,var(--over) 14%,transparent)"/>
        ${blips}
      </svg>
      <div class="radar-tip" id="radarTip" hidden></div>
    </div>
    <div class="legend">
      ${["overdue", "critical", "risk", "attention", "ontrack"].map(l => `<button type="button" class="lv-${l}" data-act="riskgo" data-lv="${l}"><i></i><span class="lt">${LV[l]}</span><b>${allCounts[l]}</b></button>`).join("")}
    </div>
    <p class="note">${IC.info}<span>Closer to the centre means less time left (next 21 days). Risk uses your estimates, progress, available hours and blockers. It's rule-based; tune it in Settings.</span></p>
  </div>`;
}
function timelineHTML(w, items){
  const { R, now } = CTX; const sod = startOfDay(now);
  return `<div class="timeline">${Array.from({ length: 14 }, (_, k) => {
    const d = addDays(sod, k); const key = ymd(d);
    const list = items.filter(i => !isDone(i) && i.due && ymd(new Date(i.due)) === key);
    return `<div class="tl-day${k === 0 ? " today" : ""}${[0, 6].includes(d.getDay()) ? " wkend" : ""}"><span class="tl-d">${d.toLocaleDateString(undefined, { weekday: "short" })}<b>${d.getDate()}</b></span>
      ${list.slice(0, 4).map(i => { const g = groupOf(w, i.groupId); return `<button class="tl-pip lv-${levelOf(R, i)}" type="button" data-act="open" data-id="${i.id}" style="--c:${g ? g.color : "var(--accent)"}" title="${esc(i.title)} · ${fmtTime(i.due)}" aria-label="${esc(i.title)}"></button>`; }).join("")}
      ${list.length > 4 ? `<span class="tl-d">+${list.length - 4}</span>` : ""}</div>`;
  }).join("")}</div>`;
}
function loadBarsHTML(w){
  const { now } = CTX;
  const P = planFor(w, now, viewerId(w), 7);
  const max = Math.max(P.hpd * 1.25, ...P.days.map(d => d.total), 1);
  const H = 92;
  return `<div class="load-bars">${P.days.map((d, k) => {
    const segs = d.sessions.map(s => { const it = findItem(s.id, w); const g = it && groupOf(w, it.groupId); return `<span style="--c:${g ? g.color : "var(--accent)"};height:${(s.h / max * H).toFixed(1)}px" title="${esc(it ? it.title : "")}: ${fmtH(s.h)}"></span>`; }).join("");
    return `<div class="lb${d.total > d.cap + .01 ? " over" : ""}"><span class="val">${d.total ? fmtH(d.total) : ""}</span><div class="stackb" style="height:${Math.max(d.total / max * H, 2).toFixed(1)}px">${segs}</div><span class="lbl">${k === 0 ? "Today" : d.date.toLocaleDateString(undefined, { weekday: "short" })}</span></div>`;
  }).join("")}<div class="cap" style="bottom:${(18 + P.hpd / max * H).toFixed(1)}px" title="Daily capacity ${fmtH(P.hpd)}"></div></div>
  <p class="note" style="margin-top:8px">${IC.info}<span>Planned hours per day from your estimates. The dashed line is your ${fmtH(P.hpd)} daily capacity. <a href="#planner" data-route="planner">Open the planner</a></span></p>`;
}
function headsHTML(w){
  const list = conflicts(w, CTX.now);
  if (!list.length) return "";
  const open = !!UI.headsOpen;
  return `<section class="card heads-card"><button class="heads-sum" id="headsToggle" type="button" data-act="headstoggle" aria-expanded="${open}" aria-controls="headsList"><span class="warn">${IC.alert}</span>${list.length} thing${list.length > 1 ? "s" : ""} need${list.length > 1 ? "" : "s"} your attention<span class="chev">${IC.chev}</span></button>
    ${open ? `<div class="heads" id="headsList">${list.slice(0, 5).map(c => `<div class="head">${IC.alert}<div><p>${esc(c.text)}</p><p class="muted" style="font-size:12.5px;margin-top:2px">${esc(c.tip)}</p>
      <div class="row-flex">${c.kind === "over" && canManage(w) ? `<button class="btn xs" type="button" data-route="workload">Open workload</button>` : `<button class="btn xs" type="button" data-route="planner">Open planner</button>`}
      ${c.kind === "short" ? `<button class="btn xs" type="button" data-act="rescue" data-id="${c.ids[0]}">Rescue mode</button>` : ""}</div></div></div>`).join("")}</div>` : ""}</section>`;
}
// Four plain numbers for the week, from your own deadlines (in a team workspace: the ones assigned to you).
function weekStats(w, now, R){
  const mine = w.items.filter(i => w.mode !== "company" || i.assignee === viewerId(w));
  const open = mine.filter(i => !isDone(i) && i.due), t = i => new Date(i.due).getTime();
  return { week: open.filter(i => t(i) >= now && t(i) < now + 7 * 864e5).length,
    risk: open.filter(i => ["risk", "critical"].includes(levelOf(R, i))).length,
    over: open.filter(i => t(i) < now).length,
    done: mine.filter(i => isDone(i) && i.doneAt && now - new Date(i.doneAt).getTime() <= 7 * 864e5).length };
}
function weekStatsHTML(w){
  const S = weekStats(w, CTX.now, CTX.R), r = listRoute();
  const tile = (n, label, cls) => `<a class="wk ${cls}${n ? "" : " zero"}" href="#${r}" data-route="${r}"><b>${n}</b><span>${label}</span></a>`;
  return `<nav class="wk-stats" aria-label="This week">${tile(S.week, "Due this week", "k-week")}${tile(S.risk, "At risk", "k-risk")}${tile(S.over, "Overdue", "k-over")}${tile(S.done, "Done in 7 days", "k-done")}</nav>`;
}
function helloHTML(name, w){
  return `<div class="hello hero">
    <div class="hero-main"><p class="today">${esc(new Date(CTX.now).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" }))}</p><h2>${greeting()}, ${esc((name || "there").split(" ")[0])}</h2>
      ${addBoxHTML("addText")}</div>
    ${w ? weekStatsHTML(w) : ""}
  </div>`;
}
// Today's tasks: planned for today or due today (and overdue deadlines). Missed plain tasks stay on their own day.
function todayCard(w){
  const P = todayProgress(w, CTX.now);
  return `<section class="card today-card" id="todayCard"><div class="card-h"><div class="th-ring sm">${progressRing(P.done, P.total, 40)}</div><h3>${P.total && P.done === P.total ? "All done for today" : "Today"}</h3><span class="sub" id="todoProgress">${P.done} of ${P.total} done</span></div>
    ${todoTabsHTML(w)}</section>`;
}
// The next few deadlines: overdue first, then soonest. The progress check-in sits here as one compact row.
function nextDlHTML(w){
  const { now, R } = CTX;
  const list = w.items.filter(i => !isDone(i) && i.due && (w.mode !== "company" || i.assignee === viewerId(w)))
    .sort((a, b) => (new Date(b.due) < now) - (new Date(a.due) < now) || new Date(a.due) - new Date(b.due)).slice(0, 5);
  const when = i => { const t = new Date(i.due).getTime(); if (t < now) return `<span class="nd-late">Overdue · was due ${esc(fmtDate(i.due))}</span>`; const d = relDay(i.due, now); return `Due ${d === "today" || d === "tomorrow" ? d : esc(fmtDate(i.due))}, ${esc(fmtTime(i.due))}`; };
  return `<section class="card" id="nextDl"><div class="card-h"><h3>Next deadlines</h3><a class="sub" href="#${listRoute()}" data-route="${listRoute()}">All deadlines</a></div>
    ${checkinHTML(w)}
    ${list.length ? `<div class="nd-list">${list.map(i => { const lv = levelOf(R, i); return `<div class="nd-row lv-${lv}" data-id="${i.id}"><span class="edge" aria-hidden="true"></span><button class="nd-main" type="button" data-act="open"><span class="t">${esc(i.title)}</span><span class="m">${when(i)}</span></button>${["risk", "critical"].includes(lv) ? riskBadge(lv) : ""}</div>`; }).join("")}</div>`
      : `<div class="empty sm"><p>No deadlines coming up. Say “due” in the box above to add one.</p></div>`}</section>`;
}
function checkinHTML(w){
  const it = checkinCandidate(w, CTX.now); if (!it) return "";
  const p = progressOf(it); const late = new Date(it.due).getTime() < CTX.now;
  return `<div class="checkin" id="checkin" data-id="${it.id}"><p class="ck-q">How far along is <b>${esc(it.title)}</b>? It ${late ? "was due" : "is due"} ${relDay(it.due, CTX.now)}${p ? `; last update said ${p}%` : ""}.</p>
    <div class="ck-a" role="group" aria-label="Progress for ${esc(it.title)}">${[0, 25, 50, 75].map(v => `<button class="btn xs${v === p ? " on" : ""}" type="button" data-act="checkin" data-v="${v}">${v}%</button>`).join("")}<button class="btn xs primary" type="button" data-act="checkin" data-v="done">Done</button><button class="btn xs ghost" type="button" data-act="checkinlater">Not now</button></div></div>`;
}
function radarCard(w, items, sub){ return `<section class="card"><div class="card-h"><h3>Deadline Radar</h3><span class="sub">${sub}</span></div>${radarHTML(w, items)}</section>`; }
// Home for every workspace: greeting + Add box, one heads-up line, today's tasks, next deadlines.
function todayView(w){
  const me = memberOf(w, viewerId(w));
  const n = w.mode === "company" && canManage(w) ? attentionCount(attentionOf(w, CTX.now)) : 0;
  return `${helloHTML(w.mode === "company" && me ? me.name : state.user.name, w)}
    ${w.mode === "company" && canManage(w) ? (n ? `<button class="card heads-sum attn-line" id="attnLine" type="button" data-route="approvals"><span class="warn">${IC.alert}</span>${n} thing${n === 1 ? "" : "s"} need${n === 1 ? "s" : ""} your attention<span class="chev">${IC.forward}</span></button>` : "") : headsHTML(w)}
    <div class="grid-2">${todayCard(w)}${nextDlHTML(w)}</div>`;
}
function activityHTML(w, n){
  const list = (w.activity || []).slice(0, n);
  if (!list.length) return `<p class="muted">No activity yet.</p>`;
  return `<div class="feed"><ul>${list.map(a => { const m = memberOf(w, a.who); return `<li>${avatarHTML(m || { name: "?" })}<div style="flex:1;min-width:0"><span>${esc(a.text)}</span></div><time>${ago(a.t, CTX.now)}</time></li>`; }).join("")}</ul></div>`;
}

/* =========================================================
   Deadline list
   ========================================================= */
function listItems(w, mine){
  const { now, R } = CTX; const q = UI.q.trim().toLowerCase(); const f = UI.f;
  return w.items.filter(it => {
    if (!it.due) return false;
    if (mine && it.assignee !== viewerId(w)) return false;
    if (f.status === "active" && isDone(it)) return false;
    if (f.status === "done" && !isDone(it)) return false;
    if (f.type !== "all" && it.type !== f.type) return false;
    if (f.group !== "all" && (it.groupId || "none") !== f.group) return false;
    if (f.who !== "all" && it.assignee !== f.who) return false;
    if (f.risk !== "all") {
      const lv = levelOf(R, it);
      if (f.risk === "today") { const t = new Date(it.due).getTime(); if (isDone(it) || t < now || t >= startOfDay(now).getTime() + DAY) return false; }
      else if (f.risk === "week") { const t = new Date(it.due).getTime(); if (isDone(it) || t < now || t >= now + 7 * DAY) return false; }
      else if (f.risk === "risk") { if (!["risk", "critical"].includes(lv)) return false; }
      else if (f.risk === "needs") { if (!["risk", "critical", "overdue"].includes(lv)) return false; }
      else if (lv !== f.risk) return false;
    }
    if (q) { const g = groupOf(w, it.groupId); const m = memberOf(w, it.assignee); if (!`${it.title} ${it.notes} ${g ? g.name : ""} ${m ? m.name : ""} ${TYPES[it.type]}`.toLowerCase().includes(q)) return false; }
    return true;
  });
}
function sortItems(list){
  const { R } = CTX;
  const by = {
    due: (a, b) => new Date(a.due) - new Date(b.due),
    priority: (a, b) => PRI[a.priority].rank - PRI[b.priority].rank || new Date(a.due) - new Date(b.due),
    risk: (a, b) => LEVELS.indexOf(levelOf(R, b)) - LEVELS.indexOf(levelOf(R, a)) || new Date(a.due) - new Date(b.due),
    created: (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  }[UI.sort];
  return list.sort((a, b) => isDone(a) && isDone(b) ? new Date(b.doneAt || 0) - new Date(a.doneAt || 0) : by(a, b));
}
function viewList(mine){
  const w = W(); const { now, R } = CTX;
  const items = sortItems(listItems(w, mine));
  const f = UI.f; const gw = GROUP_WORD[w.mode];
  const types = TYPES_BY_MODE[w.mode];
  const nOn = (f.type !== "all") + (f.group !== "all") + (f.who !== "all") + (UI.groupBy !== "time") + (UI.sort !== "due");
  const filtersActive = nOn || f.risk !== "all" || UI.q;
  const riskLbl = { today: "Due today", week: "Next 7 days", risk: "At risk", needs: "At risk or late", overdue: "Overdue", critical: "Critical", attention: "Needs attention", ontrack: "On track" };
  let groups = [];
  if (UI.groupBy === "time") {
    const sod = startOfDay(now).getTime();
    const B = it => { if (isDone(it)) return "done"; const t = new Date(it.due).getTime(); if (t < now) return "overdue"; if (t < sod + DAY) return "today"; if (t < sod + 2 * DAY) return "tomorrow"; if (t < sod + 8 * DAY) return "week"; return "later"; };
    const lbl = { overdue: ["Overdue", "var(--over)"], today: ["Due today", "var(--att)"], tomorrow: ["Tomorrow", "var(--accent)"], week: ["This week", "var(--accent)"], later: ["Later", "var(--ok)"], done: ["Completed", "var(--muted)"] };
    Object.keys(lbl).forEach(k => { const l = items.filter(i => B(i) === k); if (l.length) groups.push([lbl[k][0], lbl[k][1], l]); });
  } else if (UI.groupBy === "risk") {
    ["overdue", "critical", "risk", "attention", "ontrack", "done"].forEach(lv => { const l = items.filter(i => levelOf(R, i) === lv); if (l.length) groups.push([LV[lv], `var(--${{ overdue: "over", critical: "crit", risk: "risk", attention: "att", ontrack: "ok", done: "muted" }[lv]})`, l]); });
  } else {
    w.groups.forEach(g => { const l = items.filter(i => i.groupId === g.id); if (l.length) groups.push([g.name, g.color, l]); });
    const none = items.filter(i => !groupOf(w, i.groupId)); if (none.length) groups.push([`No ${gw.toLowerCase()}`, "var(--muted)", none]);
  }
  const radarItems = mine ? w.items.filter(i => i.assignee === viewerId(w)) : scopeItems(w);
  return `
    ${radarItems.some(i => !isDone(i) && i.due) ? radarCard(w, radarItems, w.mode === "company" && !mine ? "Whole team, next 3 weeks" : "Next 3 weeks") : ""}
    <div class="filters">
      <label class="search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input id="listSearch" type="search" placeholder="Search deadlines" value="${esc(UI.q)}" aria-label="Search deadlines"></label>
      <div class="seg" role="group" aria-label="Status">${[["active", "Active"], ["done", "Completed"], ["all", "All"]].map(([v, l]) => `<button type="button" data-act="fstatus" data-v="${v}" aria-pressed="${f.status === v}">${l}</button>`).join("")}</div>
      <button class="btn" id="filtersBtn" type="button" data-act="filters" aria-expanded="${!!UI.filtersOpen}" aria-controls="filterPanel"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M7 12h10M10 18h4"/></svg>Filters${nOn ? ` · ${nOn}` : ""}</button>
      ${f.risk !== "all" ? `<button class="activef" type="button" data-act="frisk" data-v="all" aria-label="Remove filter ${riskLbl[f.risk] || f.risk}">${riskLbl[f.risk] || f.risk} ✕</button>` : ""}
      ${filtersActive ? `<button class="btn ghost sm" type="button" data-act="fclear">Clear</button>` : ""}
    </div>
    ${UI.filtersOpen ? `<div class="filter-panel" id="filterPanel">
      <div class="row-flex">
        <div class="seg" role="group" aria-label="Group by">${[["time", "By time"], ["risk", "By risk"], ["group", `By ${gw.toLowerCase()}`]].map(([v, l]) => `<button type="button" data-act="groupby" data-v="${v}" aria-pressed="${UI.groupBy === v}">${l}</button>`).join("")}</div>
        <select id="sortSel" aria-label="Sort">${[["due", "Sort: due date"], ["risk", "Sort: risk"], ["priority", "Sort: priority"], ["created", "Sort: newest"]].map(([v, l]) => `<option value="${v}" ${UI.sort === v ? "selected" : ""}>${l}</option>`).join("")}</select>
        ${w.mode === "company" && !mine ? `<select id="whoSel" aria-label="Assignee"><option value="all">Everyone</option>${w.members.map(m => `<option value="${m.id}" ${f.who === m.id ? "selected" : ""}>${esc(m.name)}</option>`).join("")}</select>` : ""}
      </div>
      <div class="fchips">
        ${types.map(t => `<button class="fchip" type="button" data-act="ftype" data-v="${t}" aria-pressed="${f.type === t}">${TYPES[t]}</button>`).join("")}
        ${w.groups.length ? `<span style="width:8px"></span>` : ""}
        ${w.groups.map(g => `<button class="fchip" type="button" data-act="fgroup" data-v="${g.id}" aria-pressed="${f.group === g.id}" style="--c:${g.color}"><i></i>${esc(g.name)}</button>`).join("")}
      </div>
    </div>` : ""}
    <div class="list">
      ${groups.length ? groups.map(([l, c, list]) => `<div class="ghead" style="--rc:${c}"><i></i>${esc(l)}<span class="n">${list.length}</span></div>${list.map(rowHTML).join("")}`).join("")
        : (() => { const dl = w.items.filter(i => i.due && (!mine || i.assignee === viewerId(w)));
          // "Nothing matches" only when the person narrowed the list; otherwise say what's actually true.
          if (filtersActive || f.status === "done") return `<div class="empty">${IC.inbox}<h3>Nothing matches</h3><p>Try a different filter or search.</p><button class="btn" type="button" data-act="fclear">Clear filters</button></div>`;
          if (dl.length) return `<div class="empty">${IC.check}<h3>All done</h3><p>Every deadline here is finished.</p><button class="btn" type="button" data-act="fstatus" data-v="done">See completed</button></div>`;
          return `<div class="empty">${IC.inbox}<h3>No deadlines yet</h3><p>Type something like “DBMS assignment due next Friday 5pm”. Say “due” and it becomes a deadline.</p><button class="btn primary" type="button" data-act="qa">${IC.plus}Add a deadline</button></div>`; })()}
    </div>`;
}

/* =========================================================
   Exams
   ========================================================= */
function examCountdown(due, now){
  const ms = Math.max(0, new Date(due).getTime() - now);
  return [Math.floor(ms / DAY), Math.floor(ms % DAY / HOUR), Math.floor(ms % HOUR / MIN), Math.floor(ms % MIN / 1000)];
}
function viewExams(){
  const w = W(); const { now, R } = CTX;
  const up = w.items.filter(i => i.type === "exam" && !isDone(i)).sort((a, b) => new Date(a.due) - new Date(b.due));
  const past = w.items.filter(i => i.type === "exam" && isDone(i)).sort((a, b) => new Date(b.due) - new Date(a.due)).slice(0, 6);
  return `<div class="row-flex"><p class="muted" style="margin-right:auto">Topics are your revision checklist. Preparation progress comes from the topics you tick, weighted by their hours.</p>
      <button class="btn primary" type="button" data-act="qa" data-type="exam">${IC.plus}Add exam</button></div>
    ${up.length ? `<div class="exam-grid">${up.map(e => {
      const g = groupOf(w, e.groupId); const [d, h, m, s] = examCountdown(e.due, now); const p = progressOf(e); const lv = levelOf(R, e);
      return `<article class="exam" style="--c:${g ? g.color : "var(--accent)"}" data-id="${e.id}">
        <div class="eh"><div style="flex:1;min-width:0"><h3>${esc(e.title)}</h3><p>${esc(g ? g.name : "Exam")} · ${fmtDue(e.due)}</p><div class="row-flex" style="margin-top:6px">${riskBadge(lv, e.id, true)}</div></div>
          <span class="ring-wrap"><span class="ring big" style="--p:${p}"></span><span>${p}%</span></span></div>
        <div class="countdown" data-ecd="${esc(e.due)}"><div><b>${d}</b><span>days</span></div><div><b>${h}</b><span>hours</span></div><div><b>${m}</b><span>min</span></div></div>
        <ul class="topics">${(e.milestones || []).map(t => `<li><label><input type="checkbox" id="tp-${t.id}" data-act="mstoggle" data-ms="${t.id}" ${t.done ? "checked" : ""}><span class="${t.done ? "dn" : ""}">${esc(t.text)}</span><span class="muted mono" style="margin-left:auto;font-size:11px">${fmtH(t.hours)}</span></label></li>`).join("") || `<li class="muted" style="font-size:13px">No topics yet. Add the syllabus below.</li>`}</ul>
        <div class="ef"><input type="text" id="addtopic-${e.id}" placeholder="Add a topic" aria-label="Add topic to ${esc(e.title)}" data-addtopic="${e.id}" style="flex:1"><button class="btn sm" type="button" data-act="focus" data-id="${e.id}">${IC.play}Revise</button><button class="btn sm ghost" type="button" data-act="open" data-id="${e.id}">Details</button></div>
      </article>`; }).join("")}</div>`
    : `<div class="card"><div class="empty">${IC.exam}<h3>No upcoming exams</h3><p>Add your next exam and its syllabus topics to get a live countdown and a revision plan.</p><button class="btn primary" type="button" data-act="qa" data-type="exam">${IC.plus}Add exam</button></div></div>`}
    ${past.length ? `<section class="card"><div class="card-h"><h3>Past exams</h3></div><div class="list" style="border:0">${past.map(rowHTML).join("")}</div></section>` : ""}`;
}

/* =========================================================
   Calendar
   ========================================================= */
function viewCalendar(){
  const w = W(); const { now, R } = CTX;
  if (!UI.calMonth) UI.calMonth = new Date(new Date(now).getFullYear(), new Date(now).getMonth(), 1);
  if (!UI.calWeek) { const t = startOfDay(now); UI.calWeek = addDays(t, -((t.getDay() + 6) % 7)); }
  // Deadlines on their due day; tasks without a deadline on the day they're planned for.
  const vis = scopeItems(w).filter(i => i.due || i.plan);
  const calKey = i => i.due ? ymd(new Date(i.due)) : i.plan;
  const calT = i => i.due ? fmtTime(i.due) : i.time ? fmtTime(`${i.plan}T${i.time}`) : "Task";
  const byDay = {}; vis.forEach(i => { const k = calKey(i); (byDay[k] = byDay[k] || []).push(i); });
  // A plain task left unfinished on a day that is over is "Missed". It stays on that day; it is not shown on today.
  const tk = ymd(now); const isMiss = i => isMissed(i, tk);
  Object.values(byDay).forEach(a => a.sort((x, y) => (!x.due) - (!y.due) || (x.due ? new Date(x.due) - new Date(y.due) : (x.time || "").localeCompare(y.time || ""))));
  const P = planFor(w, now, viewerId(w), 21);
  const sessByDay = {}; P.days.forEach(d => sessByDay[d.key] = d.sessions);
  const todayKey = ymd(now);
  const ev = (i, key) => { const g = groupOf(w, i.groupId); const lv = levelOf(R, i); const what = i.due ? LV[lv] : isMiss(i) ? "Missed" : "Planned task"; return `<div class="ev lv-${lv}${isDone(i) ? " done" : ""}${i.due ? "" : " task"}${isMiss(i) ? " missed" : ""}" role="button" tabindex="0" draggable="${canEditItem(w, i) && !isDone(i)}" data-drag="${i.id}" data-act="open" data-id="${i.id}" style="--c:${g ? g.color : "var(--accent)"}" title="${esc(i.title)} · ${calT(i)} · ${what}" aria-label="${esc(i.title)}, ${calT(i)}, ${what}">${esc(i.title)}</div>`; };
  let body;
  if (UI.calView === "month") {
    const m = UI.calMonth; const first = new Date(m.getFullYear(), m.getMonth(), 1); const start = addDays(first, -((first.getDay() + 6) % 7));
    let cells = "";
    for (let k = 0; k < 42; k++) {
      const d = addDays(start, k); const key = ymd(d); const list = byDay[key] || [];
      cells += `<div class="mday${d.getMonth() !== m.getMonth() ? " out" : ""}${key === todayKey ? " today" : ""}" data-day="${key}">
        <div class="dh"><span class="dn">${d.getDate()}</span><button class="add" type="button" data-act="qa" data-date="${key}" aria-label="Add on ${esc(fmtDate(d, { day: "numeric", month: "long" }))}">+</button></div>
        ${list.slice(0, 3).map(i => ev(i, key)).join("")}${list.length > 3 ? `<button class="more" type="button" data-act="calweek" data-date="${key}">+${list.length - 3} more</button>` : ""}</div>`;
    }
    body = `<div class="dow">${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(d => `<div>${d}</div>`).join("")}</div><div class="mgrid">${cells}</div>`;
  } else {
    body = `<div class="wgrid">${Array.from({ length: 7 }, (_, k) => {
      const d = addDays(UI.calWeek, k); const key = ymd(d); const list = byDay[key] || []; const ss = sessByDay[key] || [];
      return `<div class="wcol${key === todayKey ? " today" : ""}" data-day="${key}"><h4>${d.toLocaleDateString(undefined, { weekday: "short", day: "numeric" })}<span>${list.length ? list.length + " due" : ""}</span></h4>
        ${list.map(i => { const g = groupOf(w, i.groupId); const lv = levelOf(R, i); const what = i.due ? LV[lv] : isMiss(i) ? "Missed" : "Planned task"; return `<div class="wcard${i.due ? "" : " task"}${isMiss(i) ? " missed" : ""}" role="button" tabindex="0" draggable="${canEditItem(w, i) && !isDone(i)}" data-drag="${i.id}" data-act="open" data-id="${i.id}" style="--c:${g ? g.color : "var(--accent)"}" aria-label="${esc(i.title)}, ${calT(i)}, ${what}"><b>${esc(i.title)}</b><span>${calT(i)} · ${what}</span></div>`; }).join("")}
        ${ss.map(s => { const it = findItem(s.id, w); if (!it) return ""; const g = groupOf(w, it.groupId); return `<div class="wcard sess" style="--c:${g ? g.color : "var(--accent)"}"><b>Work on: ${esc(it.title)}</b><span>Planned ${fmtH(s.h)}</span></div>`; }).join("")}
        <button class="btn ghost xs" type="button" data-act="qa" data-date="${key}" style="margin-top:auto">${IC.plus}Add</button></div>`;
    }).join("")}</div>`;
  }
  const title = UI.calView === "month" ? UI.calMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" }) : `${fmtDate(UI.calWeek, { day: "numeric", month: "short" })} – ${fmtDate(addDays(UI.calWeek, 6), { day: "numeric", month: "short", year: "numeric" })}`;
  return `<div class="cal"><div class="cal-h"><h2>${esc(title)}</h2>
      <div class="seg" role="group" aria-label="Calendar view">${[["month", "Month"], ["week", "Week"]].map(([v, l]) => `<button type="button" data-act="calview" data-v="${v}" aria-pressed="${UI.calView === v}">${l}</button>`).join("")}</div>
      <button class="btn sm" type="button" data-act="calprev" aria-label="Previous">‹</button><button class="btn sm" type="button" data-act="caltoday">Today</button><button class="btn sm" type="button" data-act="calnext" aria-label="Next">›</button></div>
      ${body}</div>
    <p class="note">${IC.info}<span>Drag a deadline or task to another day to reschedule it (you can undo). Tasks without a deadline have a lighter outline. ${UI.calView === "week" ? "Dotted cards are suggested work sessions from the planner." : "Switch to Week to see suggested work sessions."}</span></p>`;
}

/* =========================================================
   Planner & focus
   ========================================================= */
function viewPlanner(){
  const w = W(); const { now, R } = CTX; const who = viewerId(w);
  const P = planFor(w, now, who, 7);
  const word = w.mode === "company" ? "working" : "study";
  const active = w.items.filter(i => !isDone(i) && (w.mode !== "company" || i.assignee === who)).sort((a, b) => new Date(a.due) - new Date(b.due));
  const F = UI.focus;
  const fItem = F ? findItem(F.id, w) : null;
  const left = F ? Math.max(0, F.running ? (F.endAt - now) / 1000 : F.left) : 25 * 60;
  const tot = F ? F.total : 25 * 60;
  const circ = 2 * Math.PI * 56;
  const shortList = Object.entries(P.short).map(([id, h]) => [findItem(id, w), h]).filter(x => x[0]);
  const planEmpty = !active.some(i => i.due);
  const emptyCard = `<section class="card empty-card"><h3>Nothing to plan yet</h3>
    <p class="muted">Add a deadline and say how long it takes, like “Essay due Friday 5pm ~3h”. The planner then spreads the work over your free ${word} time before it's due, and you can start a focus session from here.</p>
    <div class="row-flex"><button class="btn primary" type="button" data-act="qa" data-type="deadline">${IC.plus}Add a deadline</button><a class="btn ghost" href="#prefs" data-route="prefs">Set your ${word} hours</a></div></section>`;
  return `
    <section class="card focus-card">
      <div class="fring"><svg viewBox="0 0 132 132"><circle class="tr" cx="66" cy="66" r="56"/><circle class="pr" id="fringPr" cx="66" cy="66" r="56" stroke-dasharray="${circ.toFixed(1)}" stroke-dashoffset="${(circ * (1 - left / tot)).toFixed(1)}"/></svg><div class="tm mono" id="fringTm">${pad(Math.floor(left / 60))}:${pad(Math.floor(left % 60))}</div></div>
      <div style="display:grid;gap:10px">
        <h3 style="font-size:18px">${F ? (F.running ? "Focusing on" : "Paused:") + " " + esc(fItem ? fItem.title : "") : "Focus session"}</h3>
        <p class="muted" style="font-size:13.5px">${F ? "Time you finish is logged on the deadline and moves its progress forward." : "Pick a deadline and work without switching tasks. Finished minutes are logged and count toward progress."}</p>
        ${F ? `<div class="row-flex"><button class="btn primary" type="button" data-act="fpause">${F.running ? IC.pause + "Pause" : IC.play + "Resume"}</button><button class="btn" type="button" data-act="ffinish">Finish & log</button><button class="btn ghost" type="button" data-act="fstop">Discard</button></div>`
          : !active.length ? `<p class="muted" style="font-size:13.5px">Add a task or deadline first, then pick it here.</p>`
          : `<div class="row-flex"><select id="focusItem" aria-label="Deadline to focus on">${active.map(i => `<option value="${i.id}">${esc(i.title)} (${relDay(i.due, now)})</option>`).join("")}</select>
            <div class="seg" role="group" aria-label="Length">${[25, 50].map(n => `<button type="button" data-act="flen" data-v="${n}" aria-pressed="${(UI.flen || 25) === n}">${n} min</button>`).join("")}</div>
            <button class="btn primary" type="button" data-act="fstart" ${active.length ? "" : "disabled"}>${IC.play}Start</button></div>`}
      </div>
    </section>
    ${planEmpty ? emptyCard : ""}
    <div class="row-flex"><p class="muted" style="margin-right:auto">Suggested sessions for the next 7 days, earliest deadline first, within your ${fmtH(P.hpd)} of ${word} time per day. <a href="#prefs" data-route="prefs">Change availability</a></p></div>
    <div class="plan-days">${P.days.map((d, k) => {
      const segs = d.sessions.map(s => { const it = findItem(s.id, w); const g = it && groupOf(w, it.groupId); return `<span style="--c:${g ? g.color : "var(--accent)"};width:${d.cap ? s.h / d.cap * 100 : 0}%"></span>`; }).join("");
      return `<div class="pday${k === 0 ? " today" : ""}"><div class="ph"><b>${k === 0 ? "Today" : k === 1 ? "Tomorrow" : d.date.toLocaleDateString(undefined, { weekday: "short", day: "numeric" })}</b><span>${fmtH(d.total)} / ${fmtH(d.cap)}</span></div>
        <div class="cap-track">${segs}</div>
        ${d.sessions.length ? d.sessions.map(s => { const it = findItem(s.id, w); if (!it) return ""; const g = groupOf(w, it.groupId); return `<div class="sess" style="--c:${g ? g.color : "var(--accent)"}"><b>${esc(it.title)}</b><div class="sm"><span>${fmtH(s.h)} · due ${relDay(it.due, now)}</span><button class="play" type="button" data-act="focus" data-id="${it.id}">Start</button></div></div>`; }).join("") : `<p class="muted" style="font-size:12.5px">${d.cap ? "Free. Nothing to schedule." : "Day off"}</p>`}
      </div>`; }).join("")}</div>
    <div class="grid-2"${planEmpty ? " hidden" : ""}>
      <section class="card"><div class="card-h"><h3>Won't fit in time</h3><span class="sub">${shortList.length}</span></div>
        ${shortList.length ? shortList.map(([it, h]) => `<div class="head">${IC.alert}<div style="flex:1"><p><b>${esc(it.title)}</b> is about ${fmtH(h)} short before ${fmtDue(it.due)}.</p><div class="row-flex"><button class="btn xs" type="button" data-act="rescue" data-id="${it.id}">Rescue mode</button><button class="btn xs" type="button" data-act="open" data-id="${it.id}">Open</button></div></div></div>`).join("") : `<p class="muted">Everything with an estimate fits before its deadline.</p>`}
      </section>
      <section class="card"><div class="card-h"><h3>Needs an estimate</h3><span class="sub">${P.noEst.length}</span></div>
        ${P.noEst.length ? `<div style="display:grid;gap:8px">${P.noEst.slice(0, 6).map(it => `<div class="row-flex" style="justify-content:space-between"><span style="flex:1;min-width:0;overflow-wrap:anywhere">${esc(it.title)} <span class="muted" style="font-size:12px">· ${relDay(it.due, now)}</span></span><span class="row-flex" style="gap:4px">${[1, 2, 4].map(h => `<button class="btn xs" type="button" data-act="setest" data-id="${it.id}" data-v="${h}">${h}h</button>`).join("")}</span></div>`).join("")}</div>
          <p class="note" style="margin-top:10px">${IC.info}<span>Estimates let the planner schedule work and let the radar warn you early.</span></p>` : `<p class="muted">Every active deadline has an estimate.</p>`}
      </section>
    </div>`;
}

/* =========================================================
   Team board
   ========================================================= */
function viewTeam(){
  const w = W(); const { now, R } = CTX;
  const items = w.items.filter(i => i.due && (UI.boardGroup === "all" || i.groupId === UI.boardGroup) && (UI.f.who === "all" || i.assignee === UI.f.who))
    .filter(i => !isDone(i) || (i.doneAt && now - new Date(i.doneAt).getTime() < 14 * DAY));
  const cols = ["todo", "doing", "blocked", "review", "done"];
  return `<div class="filters">
      <select id="boardGroup" aria-label="Project"><option value="all">All projects</option>${w.groups.map(g => `<option value="${g.id}" ${UI.boardGroup === g.id ? "selected" : ""}>${esc(g.name)}</option>`).join("")}</select>
      <select id="whoSel" aria-label="Assignee"><option value="all">Everyone</option>${w.members.map(m => `<option value="${m.id}" ${UI.f.who === m.id ? "selected" : ""}>${esc(m.name)}</option>`).join("")}</select>
      <span class="muted" style="font-size:13px">Drag cards between columns. ${canManage(w) ? "Dropping a reviewed card on Done approves it." : "You can move your own cards. Done goes through review."}</span>
    </div>
    <div class="board">${cols.map(st => {
      const list = items.filter(i => i.status === st).sort((a, b) => new Date(a.due) - new Date(b.due));
      return `<div class="col" data-col="${st}"><div class="col-h" style="--c:${STATUS_COLOR[st]}"><i></i>${STATUSES[st]}<b>${list.length}</b></div>
        ${list.map(i => { const g = groupOf(w, i.groupId); const m = memberOf(w, i.assignee); const lv = levelOf(R, i); const can = canEditItem(w, i); const p = progressOf(i);
          return `<div class="kcard" draggable="${can}" data-drag="${i.id}" data-act="open" data-id="${i.id}" role="button" tabindex="0" aria-label="${esc(i.title)}, ${STATUSES[st]}">
            ${can ? "" : `<span class="ro">View only</span>`}
            <span class="kt">${esc(i.title)}</span>
            <span class="km">${g ? `<span class="chip" style="--c:${g.color}"><i></i>${esc(g.name)}</span>` : ""}${isDone(i) ? "" : riskBadge(lv)}</span>
            ${p > 0 && !isDone(i) ? `<div class="bar-track"><div class="bar-fill" style="width:${p}%"></div></div>` : ""}
            <span class="kf"><span class="row-flex" style="gap:6px">${avatarHTML(m)}<span style="font-size:12px">${esc(m ? (m.id === viewerId(w) ? "You" : m.name.split(" ")[0]) : "")}</span></span><span class="mono" style="font-size:11.5px;color:${["overdue", "critical"].includes(lv) ? "var(--crit)" : "var(--muted)"}">${isDone(i) ? "Done" : countdown(i.due, now).replace(" left", "")}</span></span>
          </div>`; }).join("") || `<p class="muted" style="font-size:12.5px;padding:6px">Nothing here.</p>`}
      </div>`; }).join("")}</div>`;
}

/* =========================================================
   Workload
   ========================================================= */
function viewWorkload(){
  const w = W(); const { now, R } = CTX; const sod = startOfDay(now);
  const days = Array.from({ length: 14 }, (_, k) => addDays(sod, k));
  const perDayCap = m => (m.capacity || 40) / Math.max(1, w.settings.workdays.length);
  const sugg = rebalance(w, now);
  return `<section class="card"><div class="card-h"><h3>This week's load</h3><span class="sub">Remaining estimated hours due in 7 days vs weekly capacity</span></div>
      ${w.members.map(m => { const L = weekLoad(w, now, m.id); const cls = L.pct > 100 ? "over" : L.pct > 80 ? "warn" : ""; return `<div class="wl-row"><span class="who">${avatarHTML(m)}<span>${esc(m.name)}${m.id === "me" ? " (you)" : ""}</span></span><div class="wl-bar ${cls}"><span style="width:${Math.min(L.pct, 140) / 1.4}%"></span><i style="left:${100 / 1.4}%"></i></div><span class="v">${L.pct}% · ${fmtH(L.hours)}</span></div>`; }).join("")}
    </section>
    ${sugg.length ? `<section class="card"><div class="card-h"><h3>Suggestions</h3><span class="sug-tag">Suggestion</span></div><div class="heads">${sugg.map((s, k) => `<div class="head" style="background:color-mix(in srgb,var(--accent) 7%,transparent);border-color:color-mix(in srgb,var(--accent) 25%,transparent)">${IC.spark}<div style="flex:1"><p>Move <b>${esc(s.item.title)}</b> (${fmtH(remainingH(s.item))}, due ${relDay(s.item.due, now)}) from ${esc(s.from.name)} to ${esc(s.to.name)}, who has about ${fmtH(s.spare)} spare this week.</p>
      <div class="row-flex"><button class="btn xs primary" type="button" data-act="applyreassign" data-id="${s.item.id}" data-to="${s.to.id}">Reassign</button><button class="btn xs" type="button" data-act="open" data-id="${s.item.id}">Open task</button></div></div></div>`).join("")}</div>
      <p class="note" style="margin-top:10px">${IC.info}<span>Nothing changes until you choose Reassign. Talk to both people first.</span></p></section>` : ""}
    <section class="card"><div class="card-h"><h3>Next 14 days</h3><span class="sub">Hours of work due each day. Red means more than one day's capacity.</span></div>
      <div class="heat"><span></span>${days.map(d => `<span class="hd">${d.toLocaleDateString(undefined, { weekday: "narrow" })}<br>${d.getDate()}</span>`).join("")}
      ${w.members.map(m => { const cap = perDayCap(m); return `<span class="who">${avatarHTML(m)}<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(m.name.split(" ")[0])}</span></span>${days.map((d, k) => {
        const h = w.items.filter(i => !isDone(i) && i.assignee === m.id && i.due && ymd(new Date(i.due)) === ymd(d)).reduce((a, i) => a + remainingH(i), 0) + (k === 0 ? w.items.filter(i => !isDone(i) && i.assignee === m.id && new Date(i.due).getTime() < now).reduce((a, i) => a + remainingH(i), 0) : 0);
        return `<span class="cell${h > cap ? " over" : ""}" style="--i:${Math.min(h / cap, 1) * .55}" title="${esc(m.name)} · ${fmtDate(d)}: ${fmtH(h)}">${h ? Math.round(h) : ""}</span>`; }).join("")}`; }).join("")}
      </div></section>
    <div class="member-grid">${w.members.map(m => { const L = weekLoad(w, now, m.id); const act = w.items.filter(i => !isDone(i) && i.assignee === m.id).sort((a, b) => new Date(a.due) - new Date(b.due)); const done30 = w.items.filter(i => isDone(i) && i.assignee === m.id && i.doneAt && now - new Date(i.doneAt).getTime() < 30 * DAY).length;
      return `<section class="card member"><div class="mh">${avatarHTML(m, true)}<div style="flex:1;min-width:0"><b>${esc(m.name)}</b><span>${esc(m.role || "")}${m.dept ? " · " + esc(m.dept) : ""}</span></div><span class="mono" style="font-size:12px;color:${L.pct > 100 ? "var(--crit)" : "var(--muted)"}">${L.pct}%</span></div>
        <div class="row-flex" style="font-size:12px;color:var(--muted);gap:14px"><span>${act.length} active</span><span>${act.filter(i => levelOf(R, i) === "overdue").length} overdue</span><span>${done30} done in 30 days</span></div>
        <ul>${act.slice(0, 5).map(i => `<li><button type="button" data-act="open" data-id="${i.id}"><span>${esc(i.title)}</span>${riskBadge(levelOf(R, i))}</button></li>`).join("") || `<li class="muted" style="font-size:12.5px">No active work.</li>`}</ul></section>`; }).join("")}</div>`;
}
function rebalance(w, now){
  const out = [];
  const loads = w.members.map(m => ({ m, L: weekLoad(w, now, m.id) }));
  loads.filter(x => x.L.pct > 100).forEach(({ m, L }) => {
    const cand = L.items.filter(i => i.status === "todo" && !(i.dependsOn || []).length && i.assignee !== "me").sort((a, b) => PRI[b.priority].rank - PRI[a.priority].rank || new Date(b.due) - new Date(a.due))[0];
    if (!cand) return;
    const best = loads.filter(x => x.m.id !== m.id && x.m.id !== "me").map(x => ({ m: x.m, spare: x.L.cap - x.L.hours })).sort((a, b) => b.spare - a.spare)[0];
    if (best && best.spare >= remainingH(cand)) out.push({ item: cand, from: m, to: best.m, spare: best.spare });
  });
  return out;
}

/* =========================================================
   Approvals
   ========================================================= */
// One queue for managers: work waiting for approval, overdue and blocked work, and people with too much this week.
function attentionOf(w, now){
  return { reviews: w.items.filter(i => i.status === "review"),
    overdue: w.items.filter(i => !isDone(i) && i.due && i.status !== "review" && new Date(i.due).getTime() < now),
    blocked: w.items.filter(i => !isDone(i) && i.status === "blocked"),
    over: w.members.map(m => ({ m, L: weekLoad(w, now, m.id) })).filter(x => x.L.items.length && x.L.pct > 100) };
}
const attentionCount = A => A.reviews.length + A.overdue.length + A.blocked.length + A.over.length;
function viewApprovals(){
  const w = W(); const { now, R } = CTX; const A = attentionOf(w, now);
  const who = i => { const m = memberOf(w, i.assignee); return m ? (m.id === viewerId(w) ? "You" : m.name) : ""; };
  const row = (i, extra) => `<div class="appr" data-id="${i.id}"><div><h4>${esc(i.title)}</h4><div class="row-flex" style="font-size:12.5px;color:var(--muted);margin-top:4px">${avatarHTML(memberOf(w, i.assignee))}${esc(who(i))} · ${extra}</div></div>
    <div class="acts">${["critical", "overdue"].includes(levelOf(R, i)) ? `<button class="btn sm" type="button" data-act="rescue">${IC.rescue}Rescue</button>` : ""}<button class="btn sm ghost" type="button" data-act="open">Open</button></div></div>`;
  const sugg = rebalance(w, now);
  const queue = `<p class="muted">${attentionCount(A) ? `${attentionCount(A)} thing${attentionCount(A) === 1 ? "" : "s"} across the team need${attentionCount(A) === 1 ? "s" : ""} a decision from you.` : "Nothing needs you right now."}</p>
    ${A.overdue.length ? `<section class="card"><div class="card-h"><h3>Overdue</h3><span class="sub">${A.overdue.length}</span></div>${A.overdue.map(i => row(i, `was due ${esc(fmtDue(i.due))}`)).join("")}</section>` : ""}
    ${A.blocked.length ? `<section class="card"><div class="card-h"><h3>Blocked</h3><span class="sub">${A.blocked.length}</span></div>${A.blocked.map(i => row(i, esc(i.notes || "Marked as blocked"))).join("")}</section>` : ""}
    ${A.over.length ? `<section class="card"><div class="card-h"><h3>Overloaded this week</h3><span class="sub">${A.over.length}</span></div>${A.over.map(({ m, L }) => { const s = sugg.find(x => x.from.id === m.id);
      return `<div class="appr"><div><h4>${avatarHTML(m)} ${esc(m.name)}</h4><p class="muted" style="font-size:12.5px">${L.pct}% of capacity: about ${fmtH(L.hours)} due in 7 days.${s ? ` Could move "${esc(s.item.title)}" to ${esc(s.to.name)}.` : ""}</p></div>
        <div class="acts">${s ? `<button class="btn sm primary" type="button" data-act="applyreassign" data-id="${s.item.id}" data-to="${s.to.id}">Reassign</button>` : ""}<button class="btn sm ghost" type="button" data-route="workload">Workload</button></div></div>`; }).join("")}</section>` : ""}`;
  const [intro, rest] = [queue.slice(0, queue.indexOf("</p>") + 4), queue.slice(queue.indexOf("</p>") + 4)];
  const list = viewApprovalsList(w, now); const cut = list.indexOf('<section class="card"><div class="card-h"><h3>Recently decided');
  return intro + (cut < 0 ? list + rest : list.slice(0, cut) + rest + list.slice(cut));
}
function viewApprovalsList(w, now){
  const pending = w.items.filter(i => i.status === "review");
  const decided = w.items.filter(i => i.approval && i.approval.state !== "pending").sort((a, b) => new Date(b.approval.history[0] ? b.approval.history[0].t : 0) - new Date(a.approval.history[0] ? a.approval.history[0].t : 0)).slice(0, 8);
  const hist = i => `<ul class="hist">${(i.approval ? i.approval.history : []).map(h => { const m = memberOf(w, h.by); return `<li>${fmtDue(h.t)} · ${esc(m ? m.name : "")}: ${esc(h.text)}</li>`; }).join("")}</ul>`;
  return `<section class="card"><div class="card-h"><h3>Waiting for your approval</h3><span class="sub">${pending.length}</span></div>
      ${pending.length ? pending.map(i => { const m = memberOf(w, i.assignee); const ev = i.evidence || {}; const late = ev.at && new Date(ev.at) > new Date(i.due);
        return `<div class="appr" data-id="${i.id}"><div><h4>${esc(i.title)}</h4><div class="row-flex" style="font-size:12.5px;color:var(--muted);margin-top:4px">${avatarHTML(m)}${esc(m ? m.name : "")} · submitted ${ev.at ? ago(ev.at, now) : "recently"} · due ${fmtDue(i.due)} ${ev.at ? `<span class="pill ${late ? "pr-high" : "pr-low"}">${late ? "After deadline" : "Before deadline"}</span>` : ""}</div>
          <div class="ev-box">${ev.link ? `<a href="${esc(ev.link)}" target="_blank" rel="noopener">${IC.link.replace("<svg", '<svg width="13" height="13"')} ${esc(ev.link)}</a>` : `<span class="muted">No link attached</span>`}${ev.note ? `<span>${esc(ev.note)}</span>` : ""}</div>${hist(i)}</div>
          <div class="acts"><button class="btn sm primary" type="button" data-act="approve">Approve</button><button class="btn sm" type="button" data-act="changes">Request changes</button><button class="btn sm ghost" type="button" data-act="open">Open</button></div></div>`; }).join("")
        : `<div class="empty">${IC.approvals}<h3>All caught up</h3><p>When someone submits work for review it shows up here.</p></div>`}
    </section>
    ${decided.length ? `<section class="card"><div class="card-h"><h3>Recently decided</h3></div>${decided.map(i => `<div class="appr" data-id="${i.id}"><div><h4>${esc(i.title)}</h4>${hist(i)}</div><div class="acts"><span class="pill ${i.approval.state === "approved" ? "pr-low" : "pr-medium"}" style="${i.approval.state === "approved" ? "color:var(--ok)" : ""}">${i.approval.state === "approved" ? "Approved" : "Changes requested"}</span></div></div>`).join("")}</section>` : ""}`;
}

/* =========================================================
   Reports
   ========================================================= */
// Statistics for the whole account, calculated by the server from the tasks table (all workspaces).
function accountStatsHTML(){
  if (Store.mode !== "server") return "";
  const S = UI.acctStats;
  // Refetched after every save (S.stale) so it matches what you just did on other pages, and at most every 30 s otherwise.
  if (!S || S.stale || Date.now() - S.at > 30000) { if (!UI.acctStatsLoading) { UI.acctStatsLoading = true; apiJSON("GET", "/api/stats").then(r => { UI.acctStatsLoading = false; if (r.ok) { UI.acctStats = { at: Date.now(), d: r.json }; if (UI.route === "reports") render({ soft: true }); } }).catch(() => { UI.acctStatsLoading = false; }); } if (!S) return `<section class="card acct-stats" aria-busy="true"><div class="card-h"><h3>Your account</h3><span class="sub">Loading…</span></div></section>`; }
  const d = S.d; if (!d.total) return "";   // no tasks in any workspace yet: the page's own empty state explains what to do
  const maxW = Math.max(1, ...d.weekly.map(x => x.completed));
  const pr = ["high", "medium", "low"].map(k => `<div class="as-pri"><span class="pdot p-${k}"></span>${k[0].toUpperCase() + k.slice(1)}<b>${d.priorities[k].pending}</b><span class="muted">pending of ${d.priorities[k].total}</span></div>`).join("");
  return `<section class="card acct-stats"><div class="card-h"><h3>Your account</h3><span class="sub">All workspaces · from your saved data</span></div>
    <div class="as-grid">
      <div class="as-k"><span>Total tasks</span><b>${d.total}</b></div><div class="as-k"><span>Completed</span><b>${d.completed}</b></div>
      <div class="as-k"><span>Pending</span><b>${d.pending}</b></div><div class="as-k"><span>Overdue</span><b style="color:${d.overdue ? "var(--over)" : "inherit"}">${d.overdue}</b></div>
      <div class="as-k"><span>Done of all tasks</span><b>${d.completionRate}%</b></div><div class="as-k"><span>On time</span><b>${d.onTimeRate == null ? "–" : d.onTimeRate + "%"}</b></div>
    </div>
    <div class="as-row"><div><p class="as-cap">Completed per week (last 8 weeks)</p><div class="as-weeks" role="img" aria-label="Tasks completed per week, last 8 weeks: ${d.weekly.map(x => `week of ${fmtDate(x.weekStart + "T12:00")} ${x.completed}`).join(", ")}">${d.weekly.map(x => `<span title="Week of ${fmtDate(x.weekStart + "T12:00")}: ${x.completed} completed"><i style="height:${Math.round(x.completed / maxW * 100)}%"></i><em>${x.completed}</em><small>${new Date(x.weekStart + "T12:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</small></span>`).join("")}</div></div>
      <div class="as-pris">${pr}</div></div>
    <p class="muted" style="font-size:12.5px;margin:0">Completed per month: ${d.monthly.map(m => `${new Date(m.month + "-15T12:00").toLocaleDateString("en-GB", { month: "short", year: "2-digit" })}: ${m.completed}`).join(" · ")}</p></section>`;
}
function viewReports(){
  const w = W(); const { now, R } = CTX;
  const items = w.items.filter(i => i.due);
  const done = items.filter(isDone);
  const onTime = done.filter(i => i.doneAt && new Date(i.doneAt) <= new Date(i.due));
  const missed = items.filter(i => !isDone(i) && new Date(i.due).getTime() < now);
  const dueSoFar = done.length + missed.length;
  const compRate = dueSoFar ? Math.round(done.length / dueSoFar * 100) : 0;
  const otRate = done.length ? Math.round(onTime.length / done.length * 100) : 0;
  const lateDays = done.filter(i => i.doneAt).map(i => (new Date(i.doneAt) - new Date(i.due)) / DAY);
  const avgLead = lateDays.length ? -lateDays.reduce((a, b) => a + b, 0) / lateDays.length : 0;
  const weeks = Array.from({ length: 8 }, (_, k) => { const end = startOfDay(now).getTime() + DAY - (7 - k) * 7 * DAY; const start = end - 7 * DAY; return { start, end, on: 0, late: 0 }; });
  done.forEach(i => { const t = new Date(i.doneAt || i.due).getTime(); const wk = weeks.find(x => t >= x.start && t < x.end); if (wk) { if (new Date(i.doneAt || 0) <= new Date(i.due)) wk.on++; else wk.late++; } });
  const maxW = Math.max(3, ...weeks.map(x => x.on + x.late));
  const W_ = 560, H_ = 180, bw = 40, gap = (W_ - 40 - 8 * bw) / 7;
  const chart = `<svg viewBox="0 0 ${W_} ${H_ + 24}" role="img" aria-label="Completed per week, on time and late">
    ${[0, .5, 1].map(f => `<line class="gl" x1="30" x2="${W_}" y1="${(10 + (1 - f) * H_).toFixed(1)}" y2="${(10 + (1 - f) * H_).toFixed(1)}"/><text class="ax" x="24" y="${(14 + (1 - f) * H_).toFixed(1)}" text-anchor="end">${Math.round(maxW * f)}</text>`).join("")}
    ${weeks.map((x, k) => { const X = 40 + k * (bw + gap); const hOn = x.on / maxW * H_, hL = x.late / maxW * H_; return `<rect x="${X}" y="${(10 + H_ - hOn).toFixed(1)}" width="${bw}" height="${hOn.toFixed(1)}" rx="4" fill="var(--ok)"><title>${x.on} on time</title></rect><rect x="${X}" y="${(10 + H_ - hOn - hL).toFixed(1)}" width="${bw}" height="${hL.toFixed(1)}" rx="4" fill="var(--risk)"><title>${x.late} late</title></rect>${x.on + x.late ? `<text class="bv" x="${X + bw / 2}" y="${(4 + H_ - hOn - hL).toFixed(1)}" text-anchor="middle">${x.on + x.late}</text>` : ""}<text class="ax" x="${X + bw / 2}" y="${H_ + 24}" text-anchor="middle">${fmtDate(x.start, { day: "numeric", month: "short" })}</text>`; }).join("")}
  </svg>`;
  const gw = GROUP_WORD[w.mode];
  const byGroup = w.groups.map(g => { const its = items.filter(i => i.groupId === g.id); const d = its.filter(isDone); const ot = d.filter(i => i.doneAt && new Date(i.doneAt) <= new Date(i.due)); const act = its.filter(i => !isDone(i));
    return { g, total: its.length, done: d.length, ot: d.length ? Math.round(ot.length / d.length * 100) : null, prog: its.length ? Math.round(its.reduce((a, i) => a + progressOf(i), 0) / its.length) : 0, risk: act.filter(i => ["risk", "critical", "overdue"].includes(levelOf(R, i))).length }; });
  const dist = {}; LEVELS.forEach(l => dist[l] = 0); items.filter(i => !isDone(i)).forEach(i => dist[levelOf(R, i)]++);
  const distTot = Object.values(dist).reduce((a, b) => a + b, 0) || 1;
  const exams = w.items.filter(i => i.type === "exam" && !isDone(i));
  // A new member with no deadlines: say so plainly instead of showing rates of nothing.
  if (!items.length) return `${accountStatsHTML()}<section class="card empty-card"><h3>No deadlines to report on yet</h3>
    <p class="muted">Reports show how many deadlines you finish, how many on time, and what's at risk. Add a deadline and finish it, and this page fills in by itself.</p>
    <div class="row-flex"><button class="btn primary" type="button" data-act="qa" data-type="deadline">${IC.plus}Add a deadline</button></div></section>`;
  const dash = `<span class="v">–</span>`;
  return `${accountStatsHTML()}<div class="kpis">
      <div class="kpi"><span class="l">Completion rate</span>${dueSoFar ? `<span class="v">${compRate}%</span>` : dash}<span class="h">${dueSoFar ? `${done.length} of ${dueSoFar} deadlines that are already due` : "None of your deadlines is due yet"}</span></div>
      <div class="kpi"><span class="l">On-time rate</span>${done.length ? `<span class="v">${otRate}%</span>` : dash}<span class="h">${done.length ? `${onTime.length} of ${done.length} finished before the deadline` : "Nothing finished yet"}</span></div>
      <div class="kpi"><span class="l">Overdue now</span><span class="v" style="color:${missed.length ? "var(--over)" : "inherit"}">${missed.length}</span><span class="h">${items.filter(i => !isDone(i)).length ? Math.round(missed.length / items.filter(i => !isDone(i)).length * 100) : 0}% of active deadlines</span></div>
      <div class="kpi"><span class="l">Average finish</span>${lateDays.length ? `<span class="v">${Math.abs(avgLead) < .05 ? "On the day" : `${Math.abs(avgLead).toFixed(1)}d`}</span><span class="h">${avgLead >= 0 ? "before" : "after"} the deadline</span>` : `${dash}<span class="h">Nothing finished yet</span>`}</div>
    </div>
    <div class="grid-2">
      <section class="card chart"><div class="card-h"><h3>Completed per week</h3><span class="sub"><span style="color:var(--ok)">■</span> on time <span style="color:var(--risk)">■</span> late</span></div>${chart}</section>
      <section class="card"><div class="card-h"><h3>Current risk mix</h3><span class="sub">${distTot === 1 && !items.filter(i => !isDone(i)).length ? 0 : items.filter(i => !isDone(i)).length} active</span></div>
        <div style="display:flex;height:14px;border-radius:8px;overflow:hidden;margin-bottom:12px">${LEVELS.slice().reverse().map(l => dist[l] ? `<span class="lv-${l}" style="background:var(--rc);width:${dist[l] / distTot * 100}%" title="${LV[l]}: ${dist[l]}"></span>` : "").join("")}</div>
        <div class="legend">${["overdue", "critical", "risk", "attention", "ontrack"].map(l => `<button type="button" class="lv-${l}" data-act="riskgo" data-lv="${l}"><i></i><span class="lt">${LV[l]}</span><b>${dist[l]}</b></button>`).join("")}</div>
      </section>
    </div>
    ${(() => { const rows = TYPES_BY_MODE[w.mode].map(t => ({ t, s: estimateSamples(w, t) })).filter(x => x.s.length);
      if (!rows.length) return "";
      return `<section class="card" id="estAccuracy"><div class="card-h"><h3>Estimate accuracy</h3><span class="sub">From focus time logged on finished work</span></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Type</th><th class="r">Finished</th><th class="r">Actual vs estimate</th><th>What it means</th></tr></thead><tbody>
        ${rows.map(({ t, s }) => { const r = s.reduce((a, i) => a + (i.loggedMin / 60) / i.estimate, 0) / s.length; return `<tr><td>${TYPES[t]}</td><td class="r">${s.length}</td><td class="r">${r.toFixed(1)}×</td><td class="muted">${Math.abs(r - 1) < .15 ? "Your estimates are about right" : r > 1 ? `Plan about ${Math.round((r - 1) * 100)}% more time` : `You finish about ${Math.round((1 - r) * 100)}% faster`}</td></tr>`; }).join("")}
      </tbody></table></div><p class="note" style="margin-top:10px">${IC.info}<span>Use focus sessions while you work so this gets more accurate.</span></p></section>`; })()}
    <section class="card"><div class="card-h"><h3>By ${gw.toLowerCase()}</h3></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>${gw}</th><th class="r">Deadlines</th><th class="r">Done</th><th class="r">On time</th><th>Average progress</th><th class="r">At risk</th></tr></thead><tbody>
      ${byGroup.map(x => `<tr><td><span class="chip" style="--c:${x.g.color}"><i></i>${esc(x.g.name)}</span></td><td class="r">${x.total}</td><td class="r">${x.done}</td><td class="r">${x.ot == null ? "–" : x.ot + "%"}</td><td><div class="row-flex" style="flex-wrap:nowrap"><div class="bar-track" style="flex:1;min-width:80px"><div class="bar-fill" style="width:${x.prog}%;background:${x.g.color}"></div></div><span class="mono" style="font-size:12px">${x.prog}%</span></div></td><td class="r" style="color:${x.risk ? "var(--crit)" : "inherit"}">${x.risk}</td></tr>`).join("") || `<tr><td colspan="6" class="muted">No ${gw.toLowerCase()}s yet.</td></tr>`}
    </tbody></table></div></section>
    ${w.mode === "company" ? `<section class="card"><div class="card-h"><h3>Team capacity & delivery</h3></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Person</th><th class="r">Active</th><th class="r">Done (30 days)</th><th class="r">On time</th><th class="r">Load this week</th></tr></thead><tbody>
      ${w.members.map(m => { const its = w.items.filter(i => i.assignee === m.id); const d = its.filter(i => isDone(i) && i.doneAt && now - new Date(i.doneAt).getTime() < 30 * DAY); const ot = d.filter(i => new Date(i.doneAt) <= new Date(i.due)); const L = weekLoad(w, now, m.id);
        return `<tr><td><span class="row-flex">${avatarHTML(m)}${esc(m.name)}</span></td><td class="r">${its.filter(i => !isDone(i)).length}</td><td class="r">${d.length}</td><td class="r">${d.length ? Math.round(ot.length / d.length * 100) + "%" : "–"}</td><td class="r" style="color:${L.pct > 100 ? "var(--crit)" : "inherit"}">${L.pct}%</td></tr>`; }).join("")}
    </tbody></table></div><p class="note" style="margin-top:10px">${IC.info}<span>Counts don't capture task difficulty, blockers or help given to others. Use this to spot overload and bottlenecks, not to rank people.</span></p></section>` : ""}
    ${w.mode === "student" && exams.length ? `<section class="card"><div class="card-h"><h3>Exam preparation</h3></div>${exams.map(e => { const g = groupOf(w, e.groupId); const p = progressOf(e); return `<div class="wl-row"><span class="who"><span class="chip" style="--c:${g ? g.color : "var(--accent)"}"><i></i>${esc(g ? g.name : "Exam")}</span></span><div class="bar-track"><div class="bar-fill" style="width:${p}%;background:${g ? g.color : "var(--accent)"}"></div></div><span class="v">${p}% · ${relDay(e.due, now)}</span></div>`; }).join("")}</section>` : ""}`;
}

/* =========================================================
   Settings
   ========================================================= */
function viewPrefs(){
  const w = W(); const s = w.settings; const gw = GROUP_WORD[w.mode]; const mgr = canManage(w);
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const secs = [["s-profile", "Profile"], ["s-avail", "Availability"], ["s-notif", "Notifications"], ["s-ai", "Assistant"], ["s-groups", gw + "s"]].concat(w.mode === "company" ? [["s-team", "Team"]] : []).concat([["s-data", "Data"]]);
  const cur = secs.some(s => s[0] === UI.setTab) ? UI.setTab : secs[0][0];
  // One short section at a time instead of one long page.
  return settingsHTML(w, s, gw, mgr, days).replace(/<section class="card set-sec" id="([\w-]+)"/g, (m, id) => id === cur ? m : `${m} hidden`)
    .replace("%%SETNAV%%", `<nav class="set-nav" role="tablist" aria-label="Settings sections">${secs.map(([id, l]) => `<button type="button" role="tab" data-act="settab" data-v="${id}" aria-selected="${id === cur}">${l}</button>`).join("")}</nav>`);
}
function settingsHTML(w, s, gw, mgr, days){
  return `<div class="set-grid">
    %%SETNAV%%
    <div class="stack">
      <section class="card set-sec" id="s-profile"><h3>Profile & workspace</h3>
        <div class="f2"><div class="field"><label for="pf-name">Your name</label><input type="text" id="pf-name" value="${esc(state.user.name)}" maxlength="60"></div>
        <div class="field"><label for="pf-ws">Workspace name</label><input type="text" id="pf-ws" value="${esc(w.name)}" maxlength="60" ${mgr ? "" : "disabled"}></div></div>
        <p class="muted" style="font-size:13px">${MODE_LABEL[w.mode]} workspace · created ${fmtDate(w.createdAt, { day: "numeric", month: "short", year: "numeric" })}. You belong to ${state.workspaces.length} workspace${state.workspaces.length > 1 ? "s" : ""}; switch from the top of the sidebar.</p>
        <div class="field"><label for="pf-currency">Currency for money in answers</label><select id="pf-currency">${[["INR", "₹ Indian Rupee (INR)"], ["USD", "$ US Dollar (USD)"], ["EUR", "€ Euro (EUR)"], ["GBP", "£ British Pound (GBP)"], ["AED", "AED UAE Dirham"], ["SGD", "S$ Singapore Dollar"], ["AUD", "A$ Australian Dollar"], ["CAD", "C$ Canadian Dollar"], ["JPY", "¥ Japanese Yen"]].map(([v, l]) => `<option value="${v}" ${(state.user.currency || "INR") === v ? "selected" : ""}>${l}</option>`).join("")}</select></div>
        <label class="switch" for="pf-sound"><span><b>Sound effects</b><span>Soft clicks and chimes when you act. Saved on this device.</span></span><input type="checkbox" id="pf-sound" role="switch" ${SFX.on ? "checked" : ""}></label>
        <div class="row-flex">${w.demo ? `<button class="btn sm" type="button" data-act="cleardemo">Clear sample data</button>` : ""}<button class="btn sm" type="button" data-act="wsnew">${IC.plus}New workspace</button>${state.workspaces.length > 1 && mgr ? `<button class="btn sm danger" type="button" data-act="wsdelete">Delete this workspace</button>` : ""}</div>
      ${ACCOUNT.user ? `<div class="acct-row">${IC.check}<span>Signed in as <b>${esc(ACCOUNT.user.email)}</b>${ACCOUNT.user.role === "admin" ? " · admin" : ""}</span>${ACCOUNT.user.role === "admin" ? `<a class="btn sm" href="/admin" target="_blank" rel="noopener">Open admin</a>` : ""}<button class="btn sm" type="button" data-act="pwopen" aria-expanded="${!!UI.pwOpen}" aria-controls="pwBox">Change password</button><button class="btn sm" type="button" data-act="logout">Log out</button></div>
      ${UI.pwOpen ? `<form class="pw-box" id="pwBox" novalidate><h4>Change password</h4>
        <div class="f2"><div class="field"><label for="pw-cur">Current password</label><div class="pw-wrap"><input type="password" id="pw-cur" autocomplete="current-password" maxlength="200"><button type="button" class="pw-eye" data-act="pwtoggle" aria-controls="pw-cur" aria-pressed="false" aria-label="Show password">${EYE}</button></div></div>
        <div class="field"><label for="pw-new">New password</label><div class="pw-wrap"><input type="password" id="pw-new" autocomplete="new-password" maxlength="200" aria-describedby="pw-hint"><button type="button" class="pw-eye" data-act="pwtoggle" aria-controls="pw-new" aria-pressed="false" aria-label="Show password">${EYE}</button></div><span class="hint" id="pw-hint">At least 8 characters. Other devices will be signed out.</span></div></div>
        <p class="auth-err" id="pwErr" role="alert" hidden></p>
        <div class="row-flex"><button class="btn sm primary" type="submit" id="pwSave">Save new password</button><button class="btn sm" type="button" data-act="pwopen">Cancel</button></div></form>` : ""}` : ""}
      </section>
      <section class="card set-sec" id="s-avail"><h3>Availability</h3><p>Used by the planner and the radar to judge whether work fits before each deadline.</p>
        <div class="field"><label for="pf-hpd">${w.mode === "company" ? "Focus hours per working day (your default)" : "Study hours per day"}</label><div class="range"><input type="range" id="pf-hpd" min="0.5" max="10" step="0.5" value="${s.hoursPerDay}"><output id="pf-hpd-o">${fmtH(s.hoursPerDay)}</output></div></div>
        <div class="field"><span class="lbl">Days you work${w.mode === "student" ? " or study" : ""}</span><div class="daychips">${days.map((d, k) => `<label><input type="checkbox" id="wd-${k}" data-wd="${k}" ${s.workdays.includes(k) ? "checked" : ""}><span>${d}</span></label>`).join("")}</div></div>
        <button class="more-btn" id="advToggle" type="button" data-act="advtoggle" aria-expanded="${!!UI.advOpen}" aria-controls="advBox">Advanced: risk rules ${IC.chev}</button>
        <div class="more-box" id="advBox" ${UI.advOpen ? "" : "hidden"}><p class="muted" style="font-size:13px">Risk compares the work left (including deadlines due earlier) with the time you have. Blocked dependencies raise the level. It's a simple rule, not AI.</p>
        ${[["critical", "Critical when work needs at least", 60, 200], ["risk", "At risk from", 30, 150], ["attention", "Needs attention from", 10, 100]].map(([k, l, a, b]) => `<div class="field"><label for="th-${k}">${l} … of available time</label><div class="range"><input type="range" id="th-${k}" data-th="${k}" min="${a}" max="${b}" step="5" value="${s.thresholds[k]}"><output>${s.thresholds[k]}%</output></div></div>`).join("")}
        <button class="btn sm" type="button" data-act="thdefault" style="justify-self:start">Reset to defaults</button>
        </div>
      </section>
      <section class="card set-sec" id="s-notif"><h3>Notifications</h3><p>Reminders always show in the bell menu. Completed deadlines never get reminders.</p>
        ${channelsHTML()}
        <div class="f2">${REMINDER_OPTS.map(([v, l]) => `<label class="toggle"><input type="checkbox" id="rm-${v}" data-rem="${v}" ${s.reminders.includes(v) ? "checked" : ""}>${l}</label>`).join("")}</div>
        <label class="toggle"><input type="checkbox" id="pf-od" ${s.overdueAlerts ? "checked" : ""}>Overdue alerts</label>
        <label class="toggle"><input type="checkbox" id="pf-sum" ${s.dailySummary ? "checked" : ""}>Daily summary of upcoming deadlines</label>
        <label class="toggle"><input type="checkbox" id="pf-today" ${s.dueToday !== false ? "checked" : ""}>Morning reminder on the day something is due</label>
        <label class="toggle"><input type="checkbox" id="pf-high" ${s.highDone !== false ? "checked" : ""}>Tell me when all of today's high-priority tasks are done</label>
        <label class="toggle"><input type="checkbox" id="pf-quiet" ${s.quietOn ? "checked" : ""}>Quiet hours (no pop-up reminders)</label>
        <div class="f2" style="max-width:360px"><div class="field"><label for="pf-qf">From</label><input type="time" id="pf-qf" value="${s.quietFrom}"></div><div class="field"><label for="pf-qt">To</label><input type="time" id="pf-qt" value="${s.quietTo}"></div></div>
        <div class="int"><span class="lg">${IC.bell}</span><div><b>Desktop alerts</b><span>${esc(desktopStatus().text)}</span></div>${desktopStatus().can ? `<label class="toggle"><input type="checkbox" id="pf-desktop" ${desktopStatus().on ? "checked" : ""}><span class="sr">Desktop alerts</span></label>` : ""}</div>
        <p class="note">${IC.info}<span>${Store.mode === "server" ? `Reminders are created by your Deadline Tracker server at the right time in your time zone (${esc(ACCOUNT.user && ACCOUNT.user.timezone || "")}), even while this app is closed. They appear in the bell menu the next time you open the app, and as desktop alerts while it's open. With email or Telegram turned on above, they also arrive there.` : "Reminders arrive while the app is open in a browser tab, even in the background. When the tab or browser is closed, nothing can be delivered. Run the Deadline Tracker server for reminders that are created even while the app is closed."}</span></p>
        ${w.mode === "company" ? `<p class="note">${IC.info}<span>Manager escalation: when someone uses "Notify my manager" in Rescue mode, the manager sees it in their notifications.</span></p>` : ""}
      </section>
      <section class="card set-sec" id="s-ai"><h3>Assistant (AI)</h3><p>${ACCOUNT.on ? `<b>My Plan</b> uses the planning engine on your Deadline Tracker server: it reads only your own tasks and never sends them to an outside AI. <b>Help</b> answers questions about the website from the help guide${AI.gemini ? `, written up by Google Gemini (${esc(AI.model || "")}, free tier). Only your Help question is sent to Gemini, never your tasks; don't type private details there.` : `. Google Gemini is off: the server admin can add a GEMINI_API_KEY to the .env file to turn it on.`}` : "Planning runs in this browser with simple rules. Start the Deadline Tracker server (node server.js) for accounts, server reminders, the planning engine and Help."}</p>
      </section>
      <section class="card set-sec" id="s-groups"><h3>${gw}s</h3><p>${w.mode === "student" ? "Colour-code your subjects or courses. Add the teacher's name if you like." : w.mode === "company" ? "Projects group related deliverables." : "Lists keep related deadlines together."}</p>
        <div class="glist">${w.groups.map(g => `<div class="grow"><input type="color" id="gc-${g.id}" data-gcolor="${g.id}" value="${g.color}" aria-label="Colour for ${esc(g.name)}"><input type="text" id="gn-${g.id}" data-gname="${g.id}" value="${esc(g.name)}" maxlength="40" aria-label="${gw} name"><input type="text" id="gt-${g.id}" data-gteacher="${g.id}" value="${esc(g.teacher || "")}" maxlength="40" placeholder="${w.mode === "student" ? "Teacher (optional)" : w.mode === "company" ? "Project manager (optional)" : "Note (optional)"}" aria-label="Detail"><button class="ib del" type="button" data-act="gdel" data-g="${g.id}" aria-label="Delete ${esc(g.name)}">${IC.trash}</button></div>`).join("")}</div>
        <div class="grow"><input type="text" id="gnew" placeholder="New ${gw.toLowerCase()} name" maxlength="40"><button class="btn sm" type="button" data-act="gadd">${IC.plus}Add ${gw.toLowerCase()}</button></div>
      </section>
      ${w.mode === "company" ? `<section class="card set-sec" id="s-team"><h3>Team & roles</h3><p>Roles decide what people can see and change. Invitations need a sign-in service, so new people here are placeholders until the app has accounts.</p>
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Name</th><th>Role</th><th>Department</th><th class="r">Capacity (h/week)</th><th></th></tr></thead><tbody>
        ${w.members.map(m => `<tr><td><span class="row-flex">${avatarHTML(m)}${esc(m.name)}</span></td><td>${m.id === "me" ? "Manager (owner)" : `<select id="mr-${m.id}" data-mrole="${m.id}" ${mgr ? "" : "disabled"}>${["Employee", "Manager", "Admin", "Guest"].map(r => `<option ${((m.access || "Employee") === r) ? "selected" : ""}>${r}</option>`).join("")}</select>`}</td><td>${esc(m.dept || "")}</td><td class="r"><input type="number" id="mc-${m.id}" data-mcap="${m.id}" value="${m.capacity}" min="1" max="80" style="width:80px" ${mgr ? "" : "disabled"}></td><td>${m.id !== "me" && mgr ? `<button class="ib del" type="button" data-act="mdel" data-m="${m.id}" aria-label="Remove ${esc(m.name)}">${IC.trash}</button>` : ""}</td></tr>`).join("")}
        </tbody></table></div>
        ${mgr ? `<div class="grow"><input type="text" id="mnew" placeholder="Full name" maxlength="50"><input type="text" id="mdept" placeholder="Department" maxlength="40"><button class="btn sm" type="button" data-act="madd">${IC.plus}Add person</button></div>` : ""}
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th>What they can do</th><th>Owner / Admin</th><th>Manager</th><th>Employee</th><th>Guest</th></tr></thead><tbody>
          ${[["See all team deadlines", "✓", "✓", "✓", "Shared only"], ["Edit any task", "✓", "✓", "Own tasks", "–"], ["Approve submitted work", "✓", "✓", "–", "–"], ["Reassign work", "✓", "✓", "–", "–"], ["Workload & reports", "✓", "✓", "–", "–"], ["Manage people & roles", "✓", "–", "–", "–"]].map(r => `<tr>${r.map((c, k) => k ? `<td class="muted">${c}</td>` : `<td>${c}</td>`).join("")}</tr>`).join("")}
        </tbody></table></div></section>` : ""}
      <section class="card set-sec" id="s-data"><h3>Export & data</h3><p>${esc(syncText())}. ${Store.mode === "server" ? "Reminders show in the app, and by email or Telegram if you turn them on under Notifications." : "Reminders show inside the app; email and Telegram need the Deadline Tracker server."} Calendar sync isn't available yet.</p>
        <div class="row-flex"><button class="btn sm" type="button" data-act="exportics">Export to calendar (.ics)</button><button class="btn sm" type="button" data-act="copybackup">${IC.copy}Copy backup</button><button class="btn sm" type="button" data-act="importbackup">Restore from backup</button><button class="btn sm danger" type="button" data-act="resetall">Reset everything</button></div>
      </section>
    </div></div>`;
}

const VIEWS = {
  overview: () => todayView(W()),
  deadlines: () => viewList(false), mywork: () => viewList(true), exams: viewExams, calendar: viewCalendar, planner: viewPlanner,
  team: viewTeam, workload: viewWorkload, approvals: viewApprovals, reports: viewReports, prefs: viewPrefs
};

/* =========================================================
   To-Do system: Today / Upcoming / Completed
   ========================================================= */
const REM_OPTS = [[0, "At the time"], [15, "15 min before"], [60, "1 hour before"], [1440, "1 day before"]];
// One task model: any task can have a day to work on it (plan) and/or a hard deadline (due).
// "kind" is kept on saved items for older versions, but behaviour only looks at plan and due.
const isTodo = it => !it.due;
const dueDay = it => it.due ? ymd(new Date(it.due)) : null;
const dayOf = it => it.plan || dueDay(it);
const todayKey = now => ymd(new Date(now));
const tomorrowKey = now => ymd(addDays(startOfDay(now), 1));
function myTasks(w){ return w.items.filter(i => w.mode !== "company" || i.assignee === viewerId(w)); }
// On today's list: planned for today or due today (plus anything finished today).
// A task whose day has passed without being finished is "missed": it is NOT carried to today. It stays on its own
// day, where History and the Calendar show it as Missed. Nothing is deleted or copied.
// Anything with a hard deadline is different: it keeps showing until it is done, so a deadline can't go unnoticed.
function isForToday(i, t){
  const d = dayOf(i); if (!d) return false;
  if (d === t || dueDay(i) === t) return true;
  if (d > t) return false;
  if (isDone(i)) return !!i.doneAt && ymd(i.doneAt) === t;
  return !!i.due;
}
// a plain task (no deadline) left unfinished on a day that is now over
const isMissed = (i, t) => !i.due && !isDone(i) && !!i.plan && i.plan < t;
function todayTodos(w, now){ const t = todayKey(now); return myTasks(w).filter(i => isForToday(i, t)); }
// counts exactly what the Today list shows
function todayProgress(w, now){
  const list = todayTodos(w, now);
  return { done: list.filter(isDone).length, total: list.length };
}
const timeOf = it => it.time || (it.due && !it.plan ? it.due.slice(11, 16) : "");
function todoSort(a, b){
  if (isDone(a) !== isDone(b)) return isDone(a) ? 1 : -1;
  const ta = timeOf(a), tb = timeOf(b);
  if (ta !== tb) return !ta ? 1 : !tb ? -1 : ta.localeCompare(tb);
  return PRI[a.priority].rank - PRI[b.priority].rank || (a.order || 0) - (b.order || 0) || new Date(a.createdAt) - new Date(b.createdAt);
}
function todoRowHTML(it, opts = {}){
  const w = W(); const now = CTX.now; const done = isDone(it); const can = canEditItem(w, it);
  const t = todayKey(now);
  const when = [];
  const late = !done && it.due && new Date(it.due).getTime() < now;
  if (opts.showDay && it.plan) when.push(it.plan === tomorrowKey(now) ? "Tomorrow" : fmtDate(it.plan + "T12:00"));
  if (it.time) when.push(fmtTime(`${it.plan || t}T${it.time}`));
  if (late) when.push(`<span class="tdue late">Overdue · was due ${fmtDate(it.due)}</span>`);
  else if (it.due) when.push(`<span class="tdue">${IC.flag}Due ${dueDay(it) === t ? "today" : dueDay(it) === tomorrowKey(now) ? "tomorrow" : fmtDate(it.due)} ${fmtTime(it.due)}</span>`);
  const rem = (it.reminders || []).length;
  return `<div class="todo tp-${it.priority}${done ? " done" : ""}" data-id="${it.id}">
    <button class="tcheck" type="button" data-act="toggle" aria-label="${done ? "Mark as not done" : "Complete"}: ${esc(it.title)}" ${can ? "" : "disabled"}>${IC.check}</button>
    <button class="tbody" type="button" data-act="open" aria-label="Edit ${esc(it.title)}">
      <span class="t">${esc(it.title)}</span>
      <span class="tm">
        <span class="pdot" title="${PRI[it.priority].label} priority"></span><span>${PRI[it.priority].label}</span>
        ${when.map(x => `<span>${x}</span>`).join("")}
        ${it.status === "doing" && !done ? `<span class="tstatus">In progress</span>` : ""}
        ${rem && !done ? `<span class="tbell" title="${rem} reminder${rem > 1 ? "s" : ""}">${IC.bell}</span>` : ""}
        ${it.source === "ai" ? `<span class="tai" title="Created with the AI assistant">AI</span>` : ""}
        ${done && it.doneAt && opts.showDone ? `<span>Done ${fmtDate(it.doneAt)}</span>` : ""}
      </span>
    </button>
    <div class="tacts">
      ${!done && can && it.plan !== tomorrowKey(now) ? `<button class="ib" type="button" data-act="todotomorrow" aria-label="Move to tomorrow" title="Move to tomorrow">${IC.forward}</button>` : ""}
      <button class="ib" type="button" data-act="open" aria-label="Edit" title="Edit">${IC.edit}</button>
      ${can ? `<button class="ib del" type="button" data-act="tododel" aria-label="Delete" title="Delete">${IC.trash}</button>` : ""}
    </div>
  </div>`;
}
function progressRing(done, total, size = 64){
  const p = total ? done / total : 0; const r = size / 2 - 6; const c = 2 * Math.PI * r;
  return `<svg class="pring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="pr-track"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="pr-val" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${(c * (1 - p)).toFixed(1)}"/></svg>`;
}
// Today / Upcoming / Done tabs and their list; lives in the Today card on Home.
function todoTabsHTML(w){
  const now = CTX.now; const tab = UI.todoTab || "today";
  const all = myTasks(w); const t = todayKey(now), tm = tomorrowKey(now);
  const up = all.filter(i => !isDone(i) && !isForToday(i, t));
  let body = "";
  if (tab === "today") {
    const list = todayTodos(w, now).sort(todoSort);
    body = list.length ? `<div class="tgroup">${list.map(i => todoRowHTML(i)).join("")}</div>`
      : `<div class="todo-empty"><h3>Nothing planned for today</h3><p>Add something in the box above.</p></div>`;
  } else if (tab === "upcoming") {
    const wk = ymd(addDays(startOfDay(now), 7));
    const groups = [
      ["Tomorrow", up.filter(i => dayOf(i) === tm)],
      ["Later this week", up.filter(i => dayOf(i) > tm && dayOf(i) <= wk)],
      ["Later", up.filter(i => dayOf(i) > wk)],
      ["No date", up.filter(i => !dayOf(i))]
    ].filter(g => g[1].length);
    body = groups.map(([l, list]) => `<div class="tgroup"><h4>${l}<span>${list.length}</span></h4>${list.sort((a, b) => (dayOf(a) || "9").localeCompare(dayOf(b) || "9") || todoSort(a, b)).map(i => todoRowHTML(i, { showDay: l !== "Tomorrow" })).join("")}</div>`).join("")
      || `<div class="todo-empty">${IC.calendar}<h3>Nothing coming up</h3><p>Tasks and deadlines for later days show here.</p></div>`;
  } else {
    const list = all.filter(isDone).sort((a, b) => new Date(b.doneAt || 0) - new Date(a.doneAt || 0)).slice(0, 60);
    body = list.length ? `<div class="tgroup">${list.map(i => todoRowHTML(i, { showDone: true, showDay: true })).join("")}</div>` : `<div class="todo-empty">${IC.check}<h3>No completed tasks yet</h3><p>Tick a task to finish it. It'll show up here.</p></div>`;
  }
  const counts = { today: todayTodos(w, now).filter(i => !isDone(i)).length, upcoming: up.length, done: all.filter(isDone).length };
  return `<div class="todo-bar"><div class="seg" role="tablist" aria-label="Task views">${[["today", "Today"], ["upcoming", "Upcoming"], ["done", "Done"]].map(([v, l]) => `<button type="button" role="tab" data-act="todotab" data-v="${v}" aria-pressed="${tab === v}" aria-selected="${tab === v}">${l}${counts[v] ? ` <span class="cnt">${counts[v]}</span>` : ""}</button>`).join("")}</div></div>
    <div class="todo-list" id="todoList">${body}</div>`;
}

/* =========================================================
   Daily tasks: a simple list for today's activities.
   Plain tasks (no deadline) with a title and an optional short description; new ones go on today.
   They're ordinary items, so they save with everything else (to the account when signed in).
   ========================================================= */
const dailyAll = w => myTasks(w).filter(i => !i.due);

/* ---------- Day records (carry-forward, Daily progress, History) ----------
   One task is one item; it is never copied. Three dates are kept apart: createdAt (never changed), plan (the day
   it is scheduled for) and doneAt (when it was really finished). Every change of plan is added to it.moves
   ({ at, from, to }), so we can tell which day a task belonged to on any date.
   For a day D a task is:
     done     finished on D (whatever day it was scheduled for)
     pending  scheduled for D and not finished on D. Once D is over this is "missed"; it is not carried to D+1
     moved    it was D's task, and on D it was rescheduled to a later day (not counted in D's total)
   A task finished after D is still "pending" for D: nothing is counted as done on a day it wasn't done.
   Each day's record (numbers + task list) is saved in w.dayLog[D] while D is today and never changed afterwards,
   so history survives later edits and deletions. Days without a record are worked out from the tasks. */
const doneDay = i => isDone(i) ? (i.doneAt ? ymd(i.doneAt) : i.plan || null) : null;
const origPlan = i => (Array.isArray(i.moves) && i.moves.length && i.moves[0].from) || (Array.isArray(i.movedFrom) && i.movedFrom[0]) || i.plan || null;
// the day a task was scheduled for, as things stood at the end of day d
function planOn(i, d){
  const m = Array.isArray(i.moves) ? i.moves : [];
  if (!m.length) return i.plan || null;
  let p = m[0].from || null;
  for (const x of m) if (ymd(x.at) <= d) p = x.to;
  return p;
}
// Every change of a task's day goes through here, so the movement history is always kept.
function setPlan(it, dayKey){
  const from = it.plan || null; dayKey = dayKey || null; if (from === dayKey) return;
  if (from) { const m = Array.isArray(it.movedFrom) ? it.movedFrom.slice() : []; if (!m.includes(from)) m.push(from); it.movedFrom = m.slice(-60); }
  const mv = (Array.isArray(it.moves) ? it.moves.slice() : []).concat([{ at: nowIso(), from, to: dayKey }]);
  while (mv.length > 40) mv.splice(1, 1);   // keep the first (the original day) and the latest
  it.moves = mv; it.plan = dayKey;
}
function dayEntries(w, d){
  const out = [];
  for (const i of dailyAll(w)) {
    const dd = doneDay(i), p = planOn(i, d), mv = Array.isArray(i.moves) ? i.moves : [];
    const e = { id: i.id, title: i.title };
    if (dd === d) out.push(Object.assign(e, { st: "done", from: p && p < d ? p : null }));
    else if (dd && dd < d) continue;
    else if (!mv.length && (i.movedFrom || []).includes(d) && p > d) out.push(Object.assign(e, { st: "moved", to: i.plan }));   // moved before movement times were kept
    else if (p === d) out.push(Object.assign(e, { st: "pending", from: null }));
    else if (p && p > d && mv.some(x => ymd(x.at) === d && x.from && x.from <= d)) out.push(Object.assign(e, { st: "moved", to: p }));
  }
  return out;
}
const countEntries = list => ({ total: list.filter(e => e.st !== "moved").length, done: list.filter(e => e.st === "done").length, moved: list.filter(e => e.st === "moved").length });
function dayStatsLive(w, d){ return countEntries(dayEntries(w, d)); }
// numbers and task list for a day: the saved record for past days, live for today
function dayData(w, d){
  const t = todayKey(CTX ? CTX.now : Date.now()), r = d < t && w.dayLog && w.dayLog[d];
  if (r && Array.isArray(r.items)) {
    // records saved on 11 Nov 2026 could hold tasks carried in from earlier days; those belong to their own day only
    const entries = r.items.map(x => ({ id: x[0], title: x[1], st: x[2] === "d" ? "done" : x[2] === "m" ? "moved" : "pending", from: x[2] !== "m" ? x[3] || null : null, to: x[2] === "m" ? x[3] || null : null })).filter(e => !(e.st === "pending" && e.from));
    return Object.assign(countEntries(entries), { entries, saved: true });
  }
  const entries = dayEntries(w, d);
  if (r) return { total: +r.total || 0, done: +r.done || 0, moved: +r.moved || 0, entries, saved: true, numbersOnly: true };
  return Object.assign(countEntries(entries), { entries });
}
const dayStats = dayData;
const pctOf = s => s.total ? Math.round(s.done / s.total * 100) : 0;
// called from save(): keeps today's record up to date; past days are left exactly as they were
function recordDay(w){
  if (!w || !Array.isArray(w.items)) return;
  const t = todayKey(Date.now()), list = dayEntries(w, t);
  if (!list.length && !(w.dayLog && w.dayLog[t])) return;
  w.dayLog = w.dayLog || {};
  w.dayLog[t] = Object.assign(countEntries(list), { items: list.slice(0, 80).map(e => [e.id, String(e.title || "").slice(0, 80), e.st === "done" ? "d" : e.st === "moved" ? "m" : "p", (e.st === "moved" ? e.to : e.from) || ""]) });
  const keys = Object.keys(w.dayLog).sort(); if (keys.length > 800) keys.slice(0, keys.length - 800).forEach(k => delete w.dayLog[k]);   // about two years
}
const dShort = k => new Date(k + "T12:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }).replace(",", "");
const dLong = k => { const d = new Date(k + "T12:00"); return `${d.toLocaleDateString("en-GB", { weekday: "long" })}, ${d.getDate()} ${d.toLocaleDateString("en-GB", { month: "long" })}`; };
const shiftDay = (k, n) => ymd(addDays(new Date(k + "T12:00"), n));
function statLine(s){ return s.total ? `${s.done} of ${s.total} completed — ${pctOf(s)}%` : "No tasks on this day"; }
// The tasks of one day: completed, not finished (scheduled that day or carried in), and moved away.
function histListHTML(w, d, s, t){
  const E = s.entries || []; if (!E.length) return s.numbersOnly ? `<p class="hist-note" id="histNote">These numbers were saved before task lists were kept, so the tasks aren't listed.</p>` : "";
  const past = d < t;
  const sched = E.filter(e => e.st !== "moved" && !e.from).length, late = E.filter(e => e.st === "done" && e.from).length, moved = E.filter(e => e.st === "moved").length;
  const sum = [sched ? `${sched} scheduled for this day` : "", late ? `${late} finished from earlier days` : "", moved ? `${moved} moved to another day` : ""].filter(Boolean).join(" · ");
  const fin = e => { const it = w.items.find(i => i.id === e.id); const dd = it && doneDay(it); return dd && dd > d ? ` · Finished ${dShort(dd)}` : ""; };
  const meta = e => e.st === "moved" ? (e.to ? `Moved to ${dShort(e.to)}` : "Moved to another day") : e.st === "done" ? (e.from ? `From ${dShort(e.from)}` : "Scheduled") : past ? "Missed" + fin(e) : "Scheduled";
  const group = (st, label, icon) => { const L = E.filter(e => e.st === st); if (!L.length) return "";
    return `<h4 class="hl-g">${label} <span class="cnt">${L.length}</span></h4><ul>${L.map(e => `<li data-st="${st}"${st === "pending" && past ? ` class="missed"` : ""}><span class="hl-i" aria-hidden="true">${icon}</span><span class="hl-t">${esc(e.title)}</span><span class="hl-m">${esc(meta(e))}</span></li>`).join("")}</ul>`; };
  return `<p class="hist-sum" id="histSum">${esc(sum)}</p>
      <div class="hist-list" id="histList">${group("done", "Completed", IC.check)}${group("pending", past ? "Missed" : "Still pending", "")}${group("moved", "Moved", IC.forward)}</div>
      ${s.numbersOnly ? `<p class="hist-note" id="histNote">This day's numbers were saved before task lists were kept, so the list may not match them exactly.</p>` : ""}`;
}
function historyHTML(w){
  const t = todayKey(CTX.now), y = shiftDay(t, -1);
  const d = UI.histDay && UI.histDay <= t ? UI.histDay : t;
  const s = dayStats(w, d), p = shiftDay(d, -1), ps = dayStats(w, p);
  const diff = pctOf(s) - pctOf(ps);
  const cmp = !s.total ? "" : !ps.total ? `No tasks on ${dShort(p)} to compare with.`
    : diff === 0 ? `Same as ${dShort(p)} (${pctOf(ps)}%).` : `${diff > 0 ? "Up" : "Down"} ${Math.abs(diff)} points from ${dShort(p)} (${pctOf(ps)}%).`;
  const days = Array.from({ length: 7 }, (_, k) => shiftDay(d, k - 6)).map(k => ({ k, s: dayStats(w, k) }));
  const H = 96;
  const bars = days.map(({ k, s }, n) => {
    const pc = pctOf(s), h = s.total ? Math.max(4, Math.round(pc / 100 * H)) : 0;
    const lab = s.total ? `${dShort(k)}: ${s.done} of ${s.total} completed (${pc}%)` : `${dShort(k)}: no tasks`;
    return `<li class="hc-col${k === d ? " sel" : ""}" data-day="${k}" aria-label="${esc(lab)}" title="${esc(lab)}">
        <span class="hc-v">${s.total ? pc + "%" : "–"}</span><span class="hc-track"><i style="height:${h}px"></i></span>
        <span class="hc-d">${esc(new Date(k + "T12:00").toLocaleDateString("en-GB", { weekday: "narrow" }))}<b>${new Date(k + "T12:00").getDate()}</b></span><span class="hc-n">${s.total ? `${s.done}/${s.total}` : ""}</span></li>`;
  }).join("");
  return `<section class="card hist-card" id="histCard" aria-labelledby="histTitle">
      <div class="hist-top"><div><p class="dh-date">History</p><h2 id="histTitle">${esc(dLong(d))}</h2></div>
        <div class="hist-pick"><div class="seg" role="group" aria-label="Day">${[["today", "Today", t], ["yesterday", "Yesterday", y]].map(([v, l, k]) => `<button type="button" data-act="histday" data-v="${v}" aria-pressed="${d === k}">${l}</button>`).join("")}</div>
          <label class="sr" for="histDate">Pick a day</label><input type="date" id="histDate" value="${d}" max="${t}"></div></div>
      <p class="hist-stats" id="histStats"><b>${esc(statLine(s))}</b>${s.moved ? ` · ${s.moved} moved to another day` : ""}</p>
      <div class="dh-bar sm" role="progressbar" aria-label="Completed on ${esc(dShort(d))}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pctOf(s)}"><i style="width:${pctOf(s)}%"></i></div>
      <p class="hist-cmp" id="histCompare">${esc(cmp)}</p>
      ${histListHTML(w, d, s, t)}
      <h3 class="hc-h">7 days to ${esc(dShort(d))} <span>% completed each day</span></h3>
      <ol class="hist-chart" id="histChart">${bars}</ol>
      ${(() => { const act = days.filter(x => x.s.total); if (!act.length) return `<p class="hist-week" id="histWeek">No tasks in these 7 days yet.</p>`;
        const tot = act.reduce((a, x) => a + x.s.total, 0), dn = act.reduce((a, x) => a + x.s.done, 0);
        const best = act.slice().sort((a, b) => pctOf(b.s) - pctOf(a.s) || b.s.done - a.s.done)[0];
        return `<p class="hist-week" id="histWeek"><b>Last 7 days: ${dn} of ${tot} completed (${Math.round(dn / tot * 100)}%)</b><span>Best day: ${esc(dShort(best.k))} (${pctOf(best.s)}%) · ${act.length} active ${act.length === 1 ? "day" : "days"}</span></p>`; })()}
    </section>`;
}

function dailyRowHTML(it, t){
  const done = isDone(it); const editing = UI.dailyEdit === it.id; const over = !done && it.plan && it.plan < t;
  if (editing) return `<li class="dt-row editing" data-id="${it.id}">
      <div class="dt-edit"><label class="sr" for="dtEditTitle">Title</label><input id="dtEditTitle" type="text" maxlength="140" value="${esc(it.title)}">
        <label class="sr" for="dtEditDesc">Description</label><input id="dtEditDesc" type="text" maxlength="300" placeholder="Short description (optional)" value="${esc(it.notes || "")}">
        <div class="row-flex"><button class="btn primary sm" type="button" data-act="dailysave">Save</button><button class="btn ghost sm" type="button" data-act="dailycancel">Cancel</button></div></div></li>`;
  const moving = UI.dailyMove === it.id && !done;
  const op = origPlan(it), fd = k => esc(fmtDate(k + "T12:00"));
  // rescheduled (moved by the user), or simply planned for another day; missed tasks aren't listed here
  const day = done ? "" : over ? `<span class="dt-day"><b class="dt-over">Missed</b> · was due ${fd(it.plan)}</span>`
    : it.plan && op && op !== it.plan ? `<span class="dt-day"><b class="dt-res">Rescheduled</b> · originally due ${fd(op)} · now ${it.plan === t ? "today" : fd(it.plan)}</span>`
    : it.plan && it.plan !== t ? `<span class="dt-day">${fd(it.plan)}</span>` : "";
  const acts = done ? "" : `<button class="ib" type="button" data-act="dailytomorrow" aria-label="Move ${esc(it.title)} to tomorrow" title="Move to tomorrow" ${it.plan === tomorrowKey(CTX.now) ? "hidden" : ""}>${IC.forward}</button><button class="ib" type="button" data-act="dailymove" aria-label="Move ${esc(it.title)} to another day" title="Move to a day" aria-expanded="${moving}">${IC.calendar}</button>`;
  return `<li class="dt-row${done ? " done" : ""}${over ? " overdue" : ""}${UI.dailyJust === it.id ? " just" : ""}" data-id="${it.id}">
      <button class="dt-check" type="button" data-act="dailytoggle" aria-pressed="${done}" aria-label="${done ? "Mark as not done" : "Mark as done"}: ${esc(it.title)}">${IC.check}</button>
      <div class="dt-body"><span class="dt-t">${esc(it.title)}</span>${it.notes ? `<span class="dt-d">${esc(it.notes)}</span>` : ""}${day}${done && it.doneAt ? `<span class="dt-day">Done ${esc(fmtDate(it.doneAt))}${op && doneDay(it) > op ? ` · originally due ${fd(op)}` : ""}</span>` : ""}</div>
      <div class="dt-acts">${acts}<button class="ib" type="button" data-act="dailyedit" aria-label="Edit ${esc(it.title)}" title="Edit">${IC.edit}</button><button class="ib del" type="button" data-act="dailydel" aria-label="Delete ${esc(it.title)}" title="Delete">${IC.trash}</button></div>
      ${moving ? `<div class="dt-move"><label for="dtMoveDate">Move to</label><input type="date" id="dtMoveDate" min="${t}" value="${tomorrowKey(CTX.now)}"><button class="btn primary sm" type="button" data-act="dailymovego">Move</button><button class="btn ghost sm" type="button" data-act="dailymovecancel">Cancel</button></div>` : ""}
    </li>`;
}
function viewDaily(){
  const w = W(); const t = todayKey(CTX.now);
  const all = dailyAll(w);
  const s = dayStatsLive(w, t), pct = pctOf(s);
  // Pending: today, then later days, then undated. Tasks missed on earlier days stay on their own day (History, Calendar).
  const rank = i => !i.plan ? 3 : i.plan === t ? 1 : 2;
  const open = all.filter(i => !isDone(i) && !isMissed(i, t)).sort((a, b) => rank(a) - rank(b) || (a.plan || "").localeCompare(b.plan || "") || new Date(a.createdAt) - new Date(b.createdAt));
  const doneAll = all.filter(isDone).sort((a, b) => new Date(b.doneAt || 0) - new Date(a.doneAt || 0));
  const doneShown = doneAll.slice(0, UI.dailyMoreDone ? 500 : 30);
  const missed = all.filter(i => isMissed(i, t)).length;
  const empty = (h, p) => `<li class="dt-empty"><span class="dt-empty-ico">${IC.todo}</span><h3>${h}</h3><p>${p}</p></li>`;
  return `<div class="daily-grid">
    <div class="daily-main">
    <section class="daily-head" aria-labelledby="dailyHeadT">
      <div class="dh-top"><div><p class="dh-date">${esc(new Date(CTX.now).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" }))}</p><h2 id="dailyHeadT">${s.total && s.done === s.total ? "All done for today" : "Today's progress"}</h2></div>
</div>
      <div class="dh-stats" id="dailyStats">${[["Total", s.total], ["Completed", s.done], ["Pending", s.total - s.done], ["Progress", s.total ? pct + "%" : "–"]].map(([l, v]) => `<div><b>${v}</b><span>${l}</span></div>`).join("")}</div>
      <div class="dh-bar" role="progressbar" aria-label="Today's progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i id="dailyBar" style="width:${pct}%"></i></div>
      <p class="dh-prog" id="dailyProgress">${s.total ? `Progress: ${s.done} of ${s.total} completed — ${pct}%` : "No tasks for today yet. Add one below."}</p>
      ${missed ? `<p class="dh-missed" id="dailyMissed">${missed} missed on earlier days. ${missed === 1 ? "It stays" : "They stay"} on ${missed === 1 ? "its" : "their"} own day: open that day in History or the Calendar.</p>` : ""}
    </section>
    <form class="daily-form card" id="dailyForm" autocomplete="off">
      <div class="df-fields"><label class="sr" for="dailyTitle">Task</label><input id="dailyTitle" type="text" maxlength="140" placeholder="What do you want to get done today?" value="${esc(UI.dailyDraft || "")}">
        <label class="sr" for="dailyDesc">Short description (optional)</label><input id="dailyDesc" type="text" maxlength="300" placeholder="Short description (optional)" value="${esc(UI.dailyDesc || "")}"></div>
      <button class="btn primary" type="button" id="dailyAdd" data-act="dailyadd">${IC.plus}Add task</button>
    </form>
    <div class="daily-list" id="dailyList">
      <section class="dl-sec" aria-labelledby="dailyOpenH"><h3 class="dl-h" id="dailyOpenH">Pending <span class="cnt">${open.length}</span></h3>
        <ul class="dt-list" id="dailyOpen">${open.length ? open.map(i => dailyRowHTML(i, t)).join("") : all.length ? empty("All caught up", "Nothing is waiting. Nice work.") : empty("No tasks yet", "Add your first one above. Keep it short, like “Finish the project work”.")}</ul></section>
      <section class="dl-sec" aria-labelledby="dailyDoneH"><h3 class="dl-h" id="dailyDoneH">Completed <span class="cnt">${doneAll.length}</span></h3>
        <ul class="dt-list" id="dailyDone">${doneShown.length ? doneShown.map(i => dailyRowHTML(i, t)).join("") : `<li class="dt-none">Tick a task when it's done and it moves here.</li>`}</ul>
        ${doneAll.length > doneShown.length ? `<button class="btn ghost sm" type="button" data-act="dailymoredone">Show all ${doneAll.length} completed</button>` : ""}</section>
    </div>
    </div>
    <div class="daily-side">${historyHTML(w)}</div>
  </div>`;
}
VIEWS.daily = viewDaily;
PAGE.daily = "Daily tasks";
function dailyAdd(){
  const w = W(); const ti = $("#dailyTitle"), de = $("#dailyDesc");
  const title = (ti ? ti.value : "").replace(/\s+/g, " ").trim();
  if (!title) { toast("Give the task a title first.", null, null, "error"); if (ti) ti.focus(); return; }
  const it = mkItem(w, { kind: "todo", title: title.slice(0, 140), notes: (de ? de.value : "").trim().slice(0, 300), plan: todayKey(Date.now()), due: null, reminders: [], assignee: viewerId(w), type: DEFAULT_TYPE[w.mode], priority: "medium", source: "daily" });
  w.items.push(it); logItem(w, it, `Added "${it.title}"`);
  UI.dailyDraft = ""; UI.dailyDesc = "";
  save(); render(); sfx("success");
  setTimeout(() => { const i = $("#dailyTitle"); if (i) i.focus(); }, 0);
}
function dailySave(id){
  const w = W(); const it = findItem(id); if (!it) return;
  const title = ($("#dtEditTitle").value || "").replace(/\s+/g, " ").trim();
  if (!title) { toast("A task needs a title.", null, null, "error"); return; }
  it.title = title.slice(0, 140); it.notes = ($("#dtEditDesc").value || "").trim().slice(0, 300); touch(it); logItem(w, it, `Edited "${it.title}"`);
  UI.dailyEdit = null; save(); render(); toast("Saved.");
}
document.addEventListener("click", e => {
  const a = e.target.closest("[data-act]"); if (!a || !state || !state.workspaces || !state.workspaces.length) return;
  const row = a.closest(".dt-row"); const id = row && row.dataset.id; const w = W();
  switch (a.dataset.act) {
    case "dailyadd": dailyAdd(); break;
    case "dailymoredone": UI.dailyMoreDone = true; render(); break;
    case "histday": UI.histDay = a.dataset.v === "yesterday" ? shiftDay(todayKey(CTX.now), -1) : todayKey(CTX.now); render(); break;
    case "dailytomorrow": { const it = findItem(id); if (!it || isDone(it)) break; UI.dailyMove = null;
      const before = moveTodo(it, tomorrowKey(Date.now())); save(); render();
      toast(`Moved "${it.title}" to tomorrow.`, () => { replaceItem(W(), before); save(); render(); }); break; }
    case "dailymove": UI.dailyMove = UI.dailyMove === id ? null : id; render(); setTimeout(() => { const i = $("#dtMoveDate"); if (i) i.focus(); }, 0); break;
    case "dailymovecancel": UI.dailyMove = null; render(); break;
    case "dailymovego": { const it = findItem(id); const v = ($("#dtMoveDate") || {}).value || "";
      if (!it || isDone(it)) break;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) { toast("Pick a day first.", null, null, "error"); break; }
      if (v < todayKey(Date.now())) { toast("Pick today or a later day.", null, null, "error"); break; }
      UI.dailyMove = null; if (v === it.plan) { render(); break; }
      const before = moveTodo(it, v); save(); render();
      toast(`Moved "${it.title}" to ${fmtDate(v + "T12:00")}.`, () => { replaceItem(W(), before); save(); render(); }); break; }
    case "dailytoggle": { const it = findItem(id); if (!it) break; const was = isDone(it);
      it.status = was ? "todo" : "done"; it.doneAt = was ? null : nowIso(); touch(it); logItem(w, it, was ? `Reopened "${it.title}"` : `Completed "${it.title}"`);
      UI.dailyJust = it.id; save(); render(); UI.dailyJust = null; if (!was) { sfx("success"); celebrateIfAllDone(w); } break; }
    case "dailyedit": UI.dailyEdit = id; render(); setTimeout(() => { const i = $("#dtEditTitle"); if (i) { i.focus(); i.select(); } }, 0); break;
    case "dailycancel": UI.dailyEdit = null; render(); break;
    case "dailysave": dailySave(id); break;
    case "dailydel": { const it = findItem(id); if (!it) break; const idx = w.items.indexOf(it); const before = clone(it);
      w.items.splice(idx, 1); save(); render();
      toast(`Deleted "${it.title}".`, () => { W().items.splice(idx, 0, before); save(); render(); }); break; }
  }
});
document.addEventListener("keydown", e => {
  const t = e.target;
  if (e.key === "Enter" && (t.id === "dailyTitle" || t.id === "dailyDesc")) { e.preventDefault(); dailyAdd(); }
  else if (t.id === "dtMoveDate" && (e.key === "Enter" || e.key === "Escape")) { e.preventDefault(); const b = t.closest(".dt-row").querySelector(e.key === "Enter" ? "[data-act=dailymovego]" : "[data-act=dailymovecancel]"); if (b) b.click(); }
  else if (t.id === "dtEditTitle" || t.id === "dtEditDesc") { if (e.key === "Enter") { e.preventDefault(); const r = t.closest(".dt-row"); if (r) dailySave(r.dataset.id); } else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); UI.dailyEdit = null; render(); } }
}, true);
document.addEventListener("change", e => {
  if (e.target.id !== "histDate") return;
  const v = e.target.value, t = todayKey(CTX.now);
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) { UI.histDay = v > t ? t : v; render(); }
});
document.addEventListener("input", e => { if (e.target.id === "dailyTitle") UI.dailyDraft = e.target.value; else if (e.target.id === "dailyDesc") UI.dailyDesc = e.target.value; });

function todoDrawerHTML(w, it){
  const can = canEditItem(w, it); const dis = can ? "" : "disabled"; const now = CTX.now;
  const tab = UI.drawerTab === "activity" ? "activity" : "overview";
  const rem = it.reminders || [];
  const body = tab === "activity" ? `<ul class="act-log">${(it.log || []).map(l => `<li><div>${esc(l.text)}<time>${fmtDue(l.t)}</time></div></li>`).join("")}<li><div>Created<time>${fmtDue(it.createdAt)}</time></div></li></ul>`
    : `${can ? "" : `<p class="note">${IC.info}<span>Only the assignee or a manager can edit this.</span></p>`}
      <div class="f2"><div class="field"><label for="dr-plan">Day</label><input type="date" id="dr-plan" value="${it.plan || ""}" ${dis}></div><div class="field"><label for="dr-time">Time (optional)</label><input type="time" id="dr-time" value="${it.time || ""}" ${dis}></div></div>
      <div class="field"><label for="dr-deadline">Deadline (optional)</label><input type="date" id="dr-deadline" value="" ${dis}><p class="muted" style="font-size:12px">Set one if this has to be done by a certain date. It then shows in your deadlines and gets deadline reminders.</p></div>
      <div class="f2">
        <div class="field"><label for="dr-pri">Priority</label><select id="dr-pri" ${dis}>${Object.keys(PRI).map(p => `<option value="${p}" ${it.priority === p ? "selected" : ""}>${PRI[p].label}</option>`).join("")}</select></div>
        <div class="field"><label for="dr-status">Status</label><select id="dr-status" ${dis}>${[["todo", "Pending"], ["doing", "In progress"], ["done", "Completed"]].map(([v, l]) => `<option value="${v}" ${it.status === v ? "selected" : ""}>${l}</option>`).join("")}</select></div>
      </div>
      <div class="field"><span class="lbl">Remind me</span><div class="remchips" id="drRem">${REM_OPTS.map(([v, l]) => `<button type="button" class="fchip" data-rem-opt="${v}" aria-pressed="${rem.includes(v)}" ${dis}>${l}</button>`).join("")}</div>
        <p class="muted" style="font-size:12px">${it.time || it.due ? "" : "No time set, so reminders count from 9:00 on that day."}</p></div>
      <div class="field"><label for="dr-notes">Description</label><textarea id="dr-notes" rows="3" placeholder="Optional details" ${dis}>${esc(it.notes || "")}</textarea></div>
      <button class="more-btn" id="drMore" type="button" data-act="drmore" aria-expanded="${!!UI.drMore}" aria-controls="drMoreBox">More details ${IC.chev}</button>
      <div class="more-box" id="drMoreBox" ${UI.drMore ? "" : "hidden"}>
        <div class="field"><label for="dr-est">Effort (hours)</label><input type="number" id="dr-est" min="0" step="0.5" value="${it.estimate ?? ""}" ${dis}></div>
      </div>`;
  const st = isDone(it) ? ["Completed", "var(--ok)"] : it.status === "doing" ? ["In progress", "var(--accent)"] : ["Pending", "var(--muted)"];
  return `<div class="dr-h">
      <div class="dr-top"><span class="chip"><i style="background:${st[1]}"></i>${st[0]}</span><span class="chip">To-do</span>${it.source === "ai" ? `<span class="chip">Made with AI</span>` : ""}<span class="sp"></span>
        <button class="ib" type="button" id="drClose" data-act="drclose" aria-label="Close details">${IC.x}</button></div>
      <input class="dr-title" id="dr-title" value="${esc(it.title)}" aria-label="Title" ${dis}>
      <div class="tabs" role="tablist">${[["overview", "Details"], ["activity", "Activity"]].map(([k, l]) => `<button type="button" role="tab" data-act="tab" data-v="${k}" aria-selected="${tab === k}">${l}</button>`).join("")}</div>
    </div>
    <div class="dr-b">${body}</div>
    <div class="dr-f">${can ? `<button class="btn ghost danger sm" type="button" data-act="delete" data-id="${it.id}">${IC.trash}Delete</button>` : ""}<span class="sp"></span>
      ${!isDone(it) && can ? `<button class="btn sm" type="button" data-act="todotomorrow" data-id="${it.id}">${IC.forward}Tomorrow</button><button class="btn sm" type="button" data-act="focus" data-id="${it.id}">${IC.play}Focus</button>` : ""}
      <button class="btn ${isDone(it) ? "" : "primary"}" type="button" data-act="toggle" data-id="${it.id}" ${dis}>${isDone(it) ? "Reopen" : "Mark as done"}</button></div>`;
}
function moveTodo(it, dayKey, why){
  const w = W(); const before = clone(it);
  // the same task moves (no copy); the day it left is remembered once, for the history
  setPlan(it, dayKey); if (it.status === "done") { it.status = "todo"; it.doneAt = null; } touch(it);
  logItem(w, it, why || `Moved "${it.title}" to ${fmtDate(dayKey + "T12:00")}`);
  return before;
}

/* =========================================================
   Reminder engine & notification center
   ========================================================= */
const DESK = { supported: typeof window.Notification === "function" && window.isSecureContext !== false && window.top === window };
let reminderBoot = true;
function anchorOf(it){
  if (it.due) return new Date(it.due).getTime();
  if (it.plan) return new Date(`${it.plan}T${it.time || "09:00"}`).getTime();
  return null;
}
function remindersOf(w, it){
  if (Array.isArray(it.reminders)) return it.reminders;
  if (isTodo(it)) return it.time ? [15] : [];
  return w.settings.reminders.concat(w.settings.customReminder ? [w.settings.customReminder] : []);
}
function reminderText(it, o, now){
  const left = anchorOf(it) - now;
  if (isTodo(it)) {
    if (o === 0 || left <= 0) return `It's time for "${it.title}".`;
    if (o >= 1440) return `Coming up tomorrow: "${it.title}".`;
    if (o >= 60) return `Your scheduled task "${it.title}" is due in one hour.`;
    return `"${it.title}" starts in ${o} minutes.`;
  }
  if (o >= 1440 && relDay(it.due, now) === "tomorrow") return `Your ${it.title} deadline is tomorrow. Don't forget to complete and submit it!`;
  if (o === 60 || (left <= 65 * MIN && left > 30 * MIN)) return `"${it.title}" is due in one hour.`;
  if (o < 60) return `"${it.title}" is due in ${Math.max(1, Math.round(left / MIN))} minutes.`;
  return `Your ${it.title} deadline is approaching! It's due ${relDay(it.due, now)}.`;
}
// While a new workspace is set up, what's already due in its sample data is recorded as seen instead of
// flooding the bell; only the daily summary gets through. Anything that happens afterwards notifies as usual.
let muteWs = null;
function pushInbox(entry, fireAt){
  state.inbox = state.inbox || []; state.muted = state.muted || {};
  if (state.inbox.some(n => n.key === entry.key) || state.muted[entry.key]) return false;
  if (muteWs && entry.ws === muteWs && entry.kind !== "summary") { state.muted[entry.key] = 1; return true; }
  const n = Object.assign({ t: new Date().toISOString(), read: false, dismissed: false }, entry);
  state.inbox.unshift(n);
  if (state.inbox.length > 150) state.inbox.length = 150;
  if (!reminderBoot) announce(n, fireAt);
  return true;
}
function announce(n, fireAt){
  const w = W(); if (!visibleTo(w, n)) return;
  const quiet = inQuiet(w.settings);
  if (!quiet && !modalKind && !undoFn) toast(n.text, n.itemId ? () => openDrawer(n.itemId) : null, n.itemId ? "Open" : undefined);
  const fresh = !fireAt || Date.now() - fireAt < 10 * MIN;
  if (state.desktopAlerts && DESK.supported && fresh && !quiet) {
    try { if (window.Notification.permission === "granted") new window.Notification("Deadline Tracker", { body: n.text, tag: n.key }); } catch (e) {}
  }
}
function visibleTo(w, n){
  if (n.ws && n.ws !== w.id) return false;
  if (!n.for) return true;
  if (n.for === "manager") return canManage(w);
  return n.for === viewerId(w);
}
function runReminders(){
  if (!state || !state.workspaces || !state.workspaces.length) return;
  if (Store.mode === "server") return; // the server's reminder job creates notifications (even while the app is closed)
  const now = Date.now(); let changed = false;
  state.fired = state.fired || {};
  state.workspaces.forEach(w => {
    w.items.forEach(it => {
      if (isDone(it)) return;
      const a = anchorOf(it); if (a == null) return;
      if (a < now) {
        if (w.settings.overdueAlerts && it.due) changed = pushInbox({ key: it.id + ":od:" + it.due, ws: w.id, for: it.assignee || "me", itemId: it.id, kind: "overdue", text: `"${it.title}" is overdue. Open it to make a recovery plan.` }, a) || changed;
        return;
      }
      const offs = remindersOf(w, it).slice().sort((x, y) => x - y);
      const passed = offs.filter(o => now >= a - o * MIN);
      if (!passed.length) return;
      const o = passed[0];
      const key = `${it.id}:r${o}:${it.due || it.plan + (it.time || "")}`;
      offs.filter(x => x > o).forEach(x => { state.fired[`${it.id}:r${x}:${it.due || it.plan + (it.time || "")}`] = 1; });
      if (state.fired[key]) return;
      state.fired[key] = 1; changed = true;
      pushInbox({ key, ws: w.id, for: it.assignee || "me", itemId: it.id, kind: "reminder", text: reminderText(it, o, now) }, a - o * MIN);
    });
    const t = todayKey(now);
    if (new Date(now).getHours() >= 8) {
      const pending = myTasks(w).filter(i => !isDone(i) && (i.plan === t || (dueDay(i) === t && new Date(i.due).getTime() >= now))).length;
      if (pending && w.settings.dailySummary !== false) changed = pushInbox({ key: `sum:${t}:${w.id}`, ws: w.id, for: viewerId(w), kind: "summary", text: `You have ${pending} pending task${pending === 1 ? "" : "s"} today.` }) || changed;
    }
    // heads-up warnings, approvals and manager notices, once each (checked every 15 seconds)
    if (Date.now() - (UI.lastNotice || 0) > 15000 || UI.forceNotice) {
      const noticeIds = new Set((w.notices || []).map(x => x.id));
      notifs(w, now, radar(w, now)).forEach(n => {
        if (/^sum:/.test(n.key) || /:od$/.test(n.key) || /:\d+$/.test(n.key)) return;
        const kind = noticeIds.has(n.key) ? "notice" : n.route === "approvals" ? "review" : "heads-up";
        changed = pushInbox({ key: "x:" + n.key, ws: w.id, for: kind === "heads-up" ? viewerId(w) : "manager", itemId: n.id || null, kind, text: n.text }) || changed;
      });
    }
  });
  if (Date.now() - (UI.lastNotice || 0) > 15000 || UI.forceNotice) { UI.lastNotice = Date.now(); UI.forceNotice = false; }
  if (changed) { save(); renderBell(); }
  reminderBoot = false;
}
function celebrateIfAllDone(w){
  const now = Date.now(); const P = todayProgress(w, now);
  if (P.total && P.done === P.total) pushInbox({ key: `alldone:${todayKey(now)}:${w.id}`, ws: w.id, for: viewerId(w), kind: "success", text: "You have successfully completed all your tasks for today. Great work!" });
}
function inboxFor(w){ return (state.inbox || []).filter(n => !n.dismissed && visibleTo(w, n)); }
function renderBell(){
  if (!state || !state.workspaces || !state.workspaces.length) return;
  const w = W(); const unread = inboxFor(w).filter(n => !n.read).length;
  const dot = $("#bellDot"); dot.hidden = !unread; dot.textContent = unread > 9 ? "9+" : unread;
  $("#bellBtn").setAttribute("aria-label", `Notifications${unread ? `, ${unread} unread` : ""}`);
  if (UI.notifOpen) renderNotif();
}
function desktopStatus(){
  if (!DESK.supported) return { can: false, text: "Desktop alerts aren't available in this view. They work when you run the app on localhost in Chrome or Edge." };
  const p = window.Notification.permission;
  if (state.desktopAlerts && p === "granted") return { can: true, on: true, text: "Desktop alerts are on while the app is open in a tab." };
  if (p === "denied") return { can: false, text: "Desktop alerts are blocked for this site. Allow notifications in your browser's site settings to use them." };
  return { can: true, on: false, text: "Get reminders as desktop notifications while the app is open in a tab." };
}
async function enableDesktop(){
  if (!DESK.supported) { toast(desktopStatus().text); return; }
  try {
    const p = window.Notification.permission === "granted" ? "granted" : await window.Notification.requestPermission();
    if (p === "granted") { state.desktopAlerts = true; save(); toast("Desktop alerts are on."); }
    else toast("Notifications weren't allowed. You can change this in your browser's site settings.");
  } catch (e) { toast("This browser couldn't turn on notifications.", null, null, "error"); }
  renderBell(); if (UI.route === "prefs") render();
}
function renderNotif(){
  const w = W(); const list = inboxFor(w).slice(0, 60); const d = desktopStatus();
  const p = $("#notifPanel"); p.className = "notif"; p.hidden = false;
  const ico = { reminder: IC.bell, overdue: IC.alert, summary: IC.calendar, success: IC.check, review: IC.approvals, notice: IC.alert, "heads-up": IC.alert };
  p.innerHTML = `<div class="nh"><b>Notifications</b><button class="btn ghost xs" type="button" data-act="readall">Mark all read</button></div>
    <ul>${list.length ? list.map(n => `<li class="${n.read ? "" : "unread"} k-${n.kind || "reminder"}"><button type="button" class="nmain" data-act="notifgo" data-key="${esc(n.key)}" ${n.itemId ? `data-id="${n.itemId}"` : ""}><span class="nico">${ico[n.kind] || IC.bell}</span><span>${esc(n.text)}<time>${ago(n.t, Date.now())}</time></span></button><button class="ib ndis" type="button" data-act="ndismiss" data-key="${esc(n.key)}" aria-label="Dismiss notification">${IC.x}</button></li>`).join("")
      : `<li class="nempty">${IC.bell}<p>You're all caught up.</p></li>`}</ul>
    <div class="nfoot">${d.on ? `<span class="status-tag on">Desktop alerts on</span>` : d.can ? `<button class="btn sm" id="desktopAlertsBtn" type="button" data-act="desktopon">${IC.bell}Turn on desktop alerts</button>` : ""}<p class="note">${IC.info}<span>${esc(d.text)} <a href="#prefs" data-route="prefs">Reminder settings</a></span></p></div>`;
}

/* ---------- events for to-dos, reminders and the inbox ---------- */
document.addEventListener("click", e => {
  const a = e.target.closest("[data-act],[data-rem-opt]"); if (!a || !state || !state.workspaces || !state.workspaces.length) return;
  const w = W(); const host = a.closest("[data-id]"); const id = a.dataset.id || (host && host.dataset.id);
  if (a.dataset.remOpt != null) {
    const it = findItem(UI.drawerId); if (!it || !canEditItem(w, it)) return;
    const v = +a.dataset.remOpt; const cur = Array.isArray(it.reminders) ? it.reminders.slice() : remindersOf(w, it).slice();
    it.reminders = cur.includes(v) ? cur.filter(x => x !== v) : cur.concat(v).sort((x, y) => x - y);
    touch(it); logItem(w, it, it.reminders.includes(v) ? `Added a reminder: ${REM_OPTS.find(r => r[0] === v)[1].toLowerCase()}` : "Removed a reminder"); save(); render(); return;
  }
  switch (a.dataset.act) {
    case "todotab": UI.todoTab = a.dataset.v; render(); break;
    case "todotomorrow": { const it = findItem(id); if (!it) break; const before = moveTodo(it, tomorrowKey(Date.now())); save(); render(); toast(`Moved "${it.title}" to tomorrow.`, () => { replaceItem(w, before); save(); render(); }); break; }
    case "tododel": deleteItem(id); break;
    case "desktopon": e.stopImmediatePropagation(); enableDesktop(); break;
    case "ndismiss": { e.stopImmediatePropagation(); const n = (state.inbox || []).find(x => x.key === a.dataset.key); if (n) { n.dismissed = true; n.read = true; dismissNotif(n.key); save(); renderBell(); } break; }
  }
});
// Day and deadline fields in the details panel (handled before the deadline handler sees them).
// The day works for every task; the time and "add a deadline" fields belong to tasks without a deadline.
document.addEventListener("change", e => {
  const t = e.target; if (!t.id || !["dr-plan", "dr-time", "dr-deadline"].includes(t.id)) return;
  if (!state || !UI.drawerId) return;
  const w = W(); const it = findItem(UI.drawerId); if (!it || (t.id !== "dr-plan" && !isTodo(it))) return;
  e.stopImmediatePropagation();
  if (!canEditItem(w, it)) return;
  if (t.id === "dr-plan") { setPlan(it, t.value || null); logItem(w, it, it.plan ? `Planned for ${fmtDate(it.plan + "T12:00")}` : "Removed the day"); }
  if (t.id === "dr-time") { it.time = t.value || null; if (it.time && !Array.isArray(it.reminders)) it.reminders = [15]; logItem(w, it, it.time ? `Time set to ${fmtTime((it.plan || ymd(new Date())) + "T" + it.time)}` : "Removed the time"); }
  if (t.id === "dr-deadline" && t.value) {
    it.due = `${t.value}T${it.time || "23:59"}`; it.kind = "deadline";
    // A new deadline gets the usual deadline reminders unless reminders were chosen for this task.
    if (Array.isArray(it.reminders) && !it.reminders.length) it.reminders = null;
    logItem(w, it, `Deadline set to ${fmtDue(it.due)}`);
  }
  touch(it); save(); setTimeout(render, 0);
}, true);
/* =========================================================
   Habit Tracker
   Habits live in the workspace (w.habits) and are saved with everything else (to the account when signed in):
     { id, name, createdAt, archivedAt, days: { "YYYY-MM-DD": 1 } }
   Each date is its own tick, so a day can be done or undone without touching any other day.
   Every number on the page is worked out from those ticks. A habit counts from the first day it was tracked
   (the day it was added, or an earlier day the user ticked) up to today, or up to the day it was archived.
   ========================================================= */
IC.back = svg('<path d="M19 12H7M11 6l-6 6 6 6"/>');
IC.archive = svg('<rect x="3" y="4" width="18" height="5" rx="1.5"/><path d="M5 9v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9M10 13h4"/>');
IC.habits = svg('<path d="M4 12a8 8 0 0 1 13.7-5.6M20 12a8 8 0 0 1-13.7 5.6"/><path d="M18 3v4h-4M6 21v-4h4"/><path d="m9.5 12 2 2 3.5-4"/>');
NAV_ICON.habits = IC.habits;
const HB_MAX = 30;
const habitsAll = w => Array.isArray(w.habits) ? w.habits : (w.habits = []);
const habitsActive = w => habitsAll(w).filter(h => !h.archivedAt);
const hbDone = (h, d) => !!(h.days && h.days[d]);
const hbStart = h => { const c = ymd(h.createdAt || Date.now()); const first = Object.keys(h.days || {}).sort()[0]; return first && first < c ? first : c; };
const hbEnd = (h, t) => h.archivedAt && ymd(h.archivedAt) < t ? ymd(h.archivedAt) : t;
const hbCounts = (h, d, t) => d >= hbStart(h) && d <= hbEnd(h, t);
function hbRange(h, a, b, t){ let n = 0, done = 0; for (let d = a; d <= b; d = shiftDay(d, 1)) if (hbCounts(h, d, t)) { n++; if (hbDone(h, d)) done++; } return { n, done }; }
// current run: up to today, or up to yesterday while today isn't ticked yet
function hbStreak(h, t){ let d = hbDone(h, t) ? t : shiftDay(t, -1), n = 0; while (hbDone(h, d)) { n++; d = shiftDay(d, -1); } return n; }
function hbBest(h){ let best = 0, run = 0, prev = null; for (const d of Object.keys(h.days || {}).sort()) { run = prev && shiftDay(prev, 1) === d ? run + 1 : 1; if (run > best) best = run; prev = d; } return best; }
const hbPct = r => r.n ? Math.round(r.done / r.n * 100) : null;
const hbRing = (p, size = 46) => { const r = size / 2 - 4, c = 2 * Math.PI * r;
  return `<svg class="hb-ring" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="trk"/>${p ? `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="val" stroke-dasharray="${(c * p / 100).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 ${size / 2} ${size / 2})"/>` : ""}</svg>`; };

function habitRowHTML(h, t, archived){
  if (UI.habitEdit === h.id && !archived) return `<li class="dt-row hb-row editing" data-id="${h.id}"><div class="dt-edit"><label class="sr" for="hbEditName">Habit name</label><input id="hbEditName" type="text" maxlength="60" value="${esc(h.name)}">
      <div class="row-flex"><button class="btn primary sm" type="button" data-act="habitsave">Save</button><button class="btn ghost sm" type="button" data-act="habitcancel">Cancel</button></div></div></li>`;
  const done = hbDone(h, t), st = hbStreak(h, t);
  if (archived) return `<li class="dt-row hb-row arch" data-id="${h.id}"><div class="dt-body"><span class="hb-n">${esc(h.name)}</span><span class="dt-day">Archived ${esc(fmtDate(h.archivedAt))} · ${Object.keys(h.days || {}).length} days done</span></div>
      <div class="dt-acts"><button class="btn ghost sm" type="button" data-act="habitrestore">Restore</button><button class="ib del" type="button" data-act="habitdel" aria-label="Delete ${esc(h.name)}" title="Delete">${IC.trash}</button></div></li>`;
  return `<li class="dt-row hb-row${done ? " done" : ""}${UI.habitJust === h.id ? " just" : ""}" data-id="${h.id}">
      <button class="dt-check" type="button" data-act="habittoggle" aria-pressed="${done}" aria-label="${done ? "Mark as not done" : "Mark as done"}: ${esc(h.name)}">${IC.check}</button>
      <div class="dt-body"><span class="hb-n">${esc(h.name)}</span>${st ? `<span class="dt-day hb-s">${st}-day streak</span>` : ""}</div>
      <div class="dt-acts"><button class="ib" type="button" data-act="habitedit" aria-label="Edit ${esc(h.name)}" title="Edit">${IC.edit}</button><button class="ib" type="button" data-act="habitarchive" aria-label="Archive ${esc(h.name)}" title="Archive (keeps its history)">${IC.archive}</button><button class="ib del" type="button" data-act="habitdel" aria-label="Delete ${esc(h.name)}" title="Delete">${IC.trash}</button></div>
    </li>`;
}
function viewHabits(){
  const w = W(), t = todayKey(CTX.now), act = habitsActive(w), arch = habitsAll(w).filter(h => h.archivedAt);
  const cur = t.slice(0, 7), m = UI.habitMonth && UI.habitMonth <= cur ? UI.habitMonth : cur;
  const [Y, Mo] = m.split("-").map(Number), nDays = new Date(Y, Mo, 0).getDate();
  const days = Array.from({ length: nDays }, (_, k) => `${m}-${pad(k + 1)}`);
  const mEnd = days[nDays - 1] < t ? days[nDays - 1] : t;
  const D = k => new Date(k + "T12:00");
  const mon = D(days[0]).toLocaleDateString("en-GB", { month: "short" });
  const sum = (a, b) => act.reduce((s, h) => { const r = hbRange(h, a, b, t); s.n += r.n; s.done += r.done; return s; }, { n: 0, done: 0 });
  const doneToday = act.filter(h => hbDone(h, t)).length, todayPct = act.length ? Math.round(doneToday / act.length * 100) : 0;
  const wkStart = shiftDay(t, -((D(t).getDay() + 6) % 7));
  const week = hbPct(sum(wkStart, t)), month = hbPct(sum(days[0], mEnd));
  const show = p => p === null ? "–" : p + "%";
  // weeks of the month (Monday to Sunday)
  const weeks = []; days.forEach(d => { if (!weeks.length || D(d).getDay() === 1) weeks.push([]); weeks[weeks.length - 1].push(d); });
  const wkOf = {}; weeks.forEach((ds, k) => ds.forEach(d => wkOf[d] = k));
  const weeksHTML = weeks.map((ds, k) => { const a = ds[0], b = ds[ds.length - 1]; const p = a > t ? null : hbPct(sum(a, b < t ? b : t));
    const lab = `${D(a).getDate()}${a === b ? "" : "–" + D(b).getDate()} ${mon}`;
    return `<li class="hb-week${wkStart >= a && wkStart <= b && m === cur ? " now" : ""}" title="Week ${k + 1}, ${lab}: ${p === null ? "nothing tracked" : p + "% of habits done"}">${hbRing(p)}<span><b>Week ${k + 1}</b> <i>${lab}</i></span> <span class="hw-p">${show(p)}</span></li>`; }).join("");
  // per-habit numbers for the shown month
  const rows = act.map(h => ({ h, r: hbRange(h, days[0], mEnd, t), st: hbStreak(h, t), best: hbBest(h) })).map(x => Object.assign(x, { p: hbPct(x.r) }));
  const ranked = rows.slice().sort((a, b) => (b.p === null ? -1 : b.p) - (a.p === null ? -1 : a.p) || b.st - a.st);
  const rankHTML = ranked.map(x => `<li><div class="hr-top"><b class="hr-n">${esc(x.h.name)}</b> ${x.p === null ? `<span class="hr-c">Not tracked in this month</span>` : `<span class="hr-p">${x.p}%</span> <span class="hr-c">${x.r.done} of ${x.r.n} days</span>`}</div>
      <div class="dh-bar sm" role="progressbar" aria-label="${esc(x.h.name)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${x.p || 0}"><i style="width:${x.p || 0}%"></i></div>
      <span class="hr-s">Streak ${x.st} · Best ${x.best}</span></li>`).join("");
  const enough = rows.filter(x => x.r.n >= 3);
  const best = enough.filter(x => x.p >= 50).sort((a, b) => b.p - a.p || b.st - a.st).slice(0, 3);
  const needs = enough.filter(x => x.p < 50).sort((a, b) => a.p - b.p).slice(0, 3);
  const pick = L => L.map(x => `<li><b>${esc(x.h.name)}</b> <span>${x.p}% · ${x.r.done} of ${x.r.n} days</span></li>`).join("");
  // month grid
  const dayTotal = d => { let n = 0, done = 0; act.forEach(h => { if (hbCounts(h, d, t)) { n++; if (hbDone(h, d)) done++; } }); return { n, done }; };
  const head = days.map(d => `<th data-day="${d}" scope="col" class="${wkOf[d] % 2 ? "alt" : ""}${d === t ? " today" : ""}"><span>${D(d).toLocaleDateString("en-GB", { weekday: "narrow" })}</span><b>${D(d).getDate()}</b></th>`).join("");
  const body = act.map(h => `<tr data-id="${h.id}"><th scope="row"><span class="hb-n">${esc(h.name)}</span></th>${days.map(d => { const on = hbDone(h, d), fut = d > t;
    return `<td class="${wkOf[d] % 2 ? "alt" : ""}${d === t ? " today" : ""}"><button type="button" class="hb-cell${hbCounts(h, d, t) || on ? "" : " pre"}" data-act="habitcell" data-day="${d}" aria-pressed="${on}" aria-label="${esc(h.name)}, ${dShort(d)}: ${on ? "done" : fut ? "not yet" : "not done"}" title="${dShort(d)}" ${fut ? "disabled" : ""}>${on ? IC.check : ""}</button></td>`; }).join("")}</tr>`).join("");
  const foot = days.map(d => { const s = dayTotal(d), p = hbPct(s); const lab = d > t ? `${dShort(d)}: not yet` : p === null ? `${dShort(d)}: nothing tracked` : `${dShort(d)}: ${s.done} of ${s.n} habits (${p}%)`;
    return `<td class="${wkOf[d] % 2 ? "alt" : ""}${d === t ? " today" : ""}"><div class="hb-bar" data-day="${d}" role="img" aria-label="${esc(lab)}" title="${esc(lab)}"><i style="height:${p ? Math.max(3, Math.round(p / 100 * 34)) : 0}px"></i></div></td>`; }).join("");
  const tiles = [[act.length, "Active habits"], [`${doneToday} of ${act.length}`, "Done today"], [show(week), "This week"], [show(month), m === cur ? "This month" : D(days[0]).toLocaleDateString("en-GB", { month: "long" })]];
  return `<div class="hb-page">
    <div class="hb-top">
      <div class="hb-left">
        <section class="daily-head hb-head" aria-labelledby="hbHeadT">
          <div class="dh-top"><div><p class="dh-date">${esc(new Date(CTX.now).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" }))}</p><h2 id="hbHeadT">${act.length && doneToday === act.length ? "All habits done today" : "Today's habits"}</h2></div></div>
          <div class="dh-stats" id="habitStats">${tiles.map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`).join("")}</div>
          <div class="dh-bar" role="progressbar" aria-label="Habits done today" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${todayPct}"><i style="width:${todayPct}%"></i></div>
        </section>
        <form class="daily-form card" id="habitForm" autocomplete="off">
          <div class="df-fields one"><label class="sr" for="habitName">New habit</label><input id="habitName" type="text" maxlength="60" placeholder="New habit, like “Practice Python” or “Read 10 pages”" value="${esc(UI.habitDraft || "")}"></div>
          <button class="btn primary" type="button" id="habitAdd" data-act="habitadd">${IC.plus}Add habit</button>
        </form>
        <section class="dl-sec" aria-label="Today's checklist">
          <ul class="dt-list" id="habitToday">${act.length ? act.map(h => habitRowHTML(h, t)).join("") : `<li class="dt-empty"><span class="dt-empty-ico">${IC.habits}</span><h3>No habits yet</h3><p>Add one or two small things you want to do every day. Tick them off here.</p></li>`}</ul>
          ${arch.length ? `<details class="hb-arch" id="habitArchived"><summary>Archived (${arch.length})</summary><ul class="dt-list">${arch.map(h => habitRowHTML(h, t, true)).join("")}</ul></details>` : ""}
        </section>
      </div>
      <section class="card hb-card" aria-labelledby="hbRankT"><h3 id="hbRankT">Each habit <span>${esc(D(days[0]).toLocaleDateString("en-GB", { month: "long" }))}</span></h3>
        ${act.length ? `<ul class="hb-rank" id="habitRank">${rankHTML}</ul>` : `<p class="hb-none" id="habitRank">Your habits and their percentages will show here.</p>`}</section>
    </div>
    <section class="card hb-card hb-month" aria-labelledby="habitMonth">
      <div class="hb-mh"><h3 id="habitMonth">${esc(D(days[0]).toLocaleDateString("en-GB", { month: "long", year: "numeric" }))}</h3>
        <div class="row-flex"><button class="ib" type="button" data-act="habitprev" aria-label="Earlier month" title="Earlier month">${IC.back}</button><button class="ib" type="button" data-act="habitnext" aria-label="Later month" title="Later month" ${m >= cur ? "disabled" : ""}>${IC.forward}</button></div></div>
      <ul class="hb-weeks" id="habitWeeks">${weeksHTML}</ul>
      ${act.length ? `<div class="hb-gridwrap" id="habitGridWrap" tabindex="0" role="group" aria-label="Month grid, scrolls sideways"><table class="hb-table" id="habitGrid"><thead><tr><th scope="col" class="hb-c0">Habit</th>${head}</tr></thead><tbody>${body}</tbody><tfoot><tr><th scope="row">Day total</th>${foot}</tr></tfoot></table></div>
      <p class="hb-hint">Tick any day up to today. The bars under the grid show how many habits were done each day.</p>` : `<p class="hb-none">Add a habit to start filling the month.</p>`}
    </section>
    <div class="hb-two">
      <section class="card hb-card" aria-labelledby="hbBestT"><h3 id="hbBestT">Going well</h3><ul class="hb-pick" id="habitBest">${best.length ? pick(best) : `<li class="hb-none">${enough.length ? "No habit is at 50% or more yet this month." : "Track for at least 3 days to see your strongest habits."}</li>`}</ul></section>
      <section class="card hb-card" aria-labelledby="hbNeedsT"><h3 id="hbNeedsT">Needs attention</h3><ul class="hb-pick" id="habitNeeds">${needs.length ? pick(needs) : `<li class="hb-none">${enough.length ? "Nothing is below 50% this month." : "Nothing to show yet."}</li>`}</ul></section>
    </div>
  </div>`;
}
VIEWS.habits = viewHabits;
PAGE.habits = "Habit Tracker";

function habitAdd(){
  const w = W(), inp = $("#habitName"); const name = (inp ? inp.value : "").replace(/\s+/g, " ").trim().slice(0, 60);
  if (!name) { toast("Give the habit a name first.", null, null, "error"); if (inp) inp.focus(); return; }
  if (habitsActive(w).some(h => h.name.toLowerCase() === name.toLowerCase())) { toast("You already have that habit.", null, null, "error"); return; }
  if (habitsActive(w).length >= HB_MAX) { toast(`You can track up to ${HB_MAX} habits. Archive one first.`, null, null, "error"); return; }
  habitsAll(w).push({ id: rid("hb"), name, createdAt: nowIso(), archivedAt: null, days: {} });
  UI.habitDraft = ""; save(); render(); sfx("success");
  setTimeout(() => { const i = $("#habitName"); if (i) i.focus(); }, 0);
}
function habitTick(h, d){
  if (!h || d > todayKey(Date.now())) return;
  h.days = h.days || {}; const on = !h.days[d]; if (on) h.days[d] = 1; else delete h.days[d];
  UI.habitJust = h.id; save(); render(); UI.habitJust = null; if (on) sfx("success");
}
function habitSave(id){
  const w = W(), h = habitsAll(w).find(x => x.id === id); if (!h) return;
  const name = ($("#hbEditName").value || "").replace(/\s+/g, " ").trim().slice(0, 60);
  if (!name) { toast("A habit needs a name.", null, null, "error"); return; }
  if (habitsActive(w).some(x => x !== h && x.name.toLowerCase() === name.toLowerCase())) { toast("You already have that habit.", null, null, "error"); return; }
  h.name = name; UI.habitEdit = null; save(); render(); toast("Saved.");
}
document.addEventListener("click", e => {
  const a = e.target.closest("[data-act^=habit]"); if (!a || !state || !state.workspaces || !state.workspaces.length) return;
  const w = W(), holder = a.closest("[data-id]"), h = holder && habitsAll(w).find(x => x.id === holder.dataset.id), t = todayKey(Date.now());
  const month = n => { const cur = t.slice(0, 7), m = UI.habitMonth && UI.habitMonth <= cur ? UI.habitMonth : cur; const [y, mo] = m.split("-").map(Number); const d = new Date(y, mo - 1 + n, 1); const k = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; if (k <= cur) { UI.habitMonth = k; render(); } };
  switch (a.dataset.act) {
    case "habitadd": habitAdd(); break;
    case "habittoggle": habitTick(h, t); break;
    case "habitcell": habitTick(h, a.dataset.day); break;
    case "habitedit": UI.habitEdit = h && h.id; render(); setTimeout(() => { const i = $("#hbEditName"); if (i) { i.focus(); i.select(); } }, 0); break;
    case "habitcancel": UI.habitEdit = null; render(); break;
    case "habitsave": if (h) habitSave(h.id); break;
    case "habitarchive": if (h) { h.archivedAt = nowIso(); save(); render(); toast(`Archived "${h.name}". Its history is kept.`, () => { h.archivedAt = null; save(); render(); }); } break;
    case "habitrestore": if (h) { if (habitsActive(w).length >= HB_MAX) { toast(`You can track up to ${HB_MAX} habits.`, null, null, "error"); break; } h.archivedAt = null; save(); render(); toast(`"${h.name}" is back in your habits.`); } break;
    case "habitdel": if (h) { const list = habitsAll(w), at = list.indexOf(h); list.splice(at, 1); save(); render(); toast(`Deleted "${h.name}" and its history.`, () => { habitsAll(W()).splice(at, 0, h); save(); render(); }); } break;
    case "habitprev": month(-1); break;
    case "habitnext": month(1); break;
  }
});
document.addEventListener("input", e => { if (e.target.id === "habitName") UI.habitDraft = e.target.value; });
document.addEventListener("keydown", e => {
  const t = e.target; if (!t || !t.id) return;
  if (t.id === "habitName" && e.key === "Enter") { e.preventDefault(); habitAdd(); }
  else if (t.id === "hbEditName" && (e.key === "Enter" || e.key === "Escape")) { e.preventDefault(); const b = t.closest(".hb-row").querySelector(e.key === "Enter" ? "[data-act=habitsave]" : "[data-act=habitcancel]"); if (b) b.click(); }
});

/* =========================================================
   Deadline AI - My Plan (your own tasks)
   With the Deadline Tracker server: the server's private planning engine
   (no outside AI). Without it: simple rules in this browser (labelled).
   Help (website questions) lives in widget.js and uses the server.
   ========================================================= */
const AI = { kind: "rules", label: "Simple rules (on this device)", ready: false, busy: false, gemini: false, model: null };
// My Plan never sends your tasks to an outside AI. With the Deadline Tracker server it uses the server's
// planning engine (private, on your own server); without it, the same kind of simple rules run in this browser.
// Google Gemini is used only by Help (website questions and general tips), through the server.
async function detectAI(){
  if (ACCOUNT.on) {
    try { const r = await fetch("/api/status", { cache: "no-store" }); const j = await r.json(); AI.gemini = !!(j && j.ai); AI.model = j && j.model || null; } catch (e) {}
    Object.assign(AI, { kind: "engine", label: "Private planner on your server", ready: true });
  } else Object.assign(AI, { kind: "rules", label: "Simple rules (on this device)", ready: true });
  refreshAiMode(); if (typeof renderWidget === "function" && DW.open) renderWidget();
}
function refreshAiMode(){ const el = $("#aiMode"); if (el) { el.innerHTML = aiModeHTML(); } }
function aiModeHTML(){ return `<i class="on"></i>${esc(AI.label)}`; }
const validYmd = s => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && ymd(new Date(s + "T12:00")) === s;
const normTitle = s => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/* ---------- offline helper: simple, transparent rules ---------- */
const STOPW = new Set("i me my mine we our you your it its this that these those the a an to of for on in at by with and or but so is are was were be been am do did does doesn didn couldn couldnt cant can won wont not no have has had need needs must should would could will shall today tomorrow tonight yesterday week next day days please also just then still yet again move moved shift reschedule postpone push carry put them all everything finish finished complete completed get got".split(" "));
const toks = s => (String(s).toLowerCase().match(/[a-z0-9+#]+/g) || []).filter(x => x.length >= 2 && !STOPW.has(x)).map(x => x.replace(/(ing|ed|es|s)$/, ""));
const WORDN = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, half: .5 };
const dayWord = (key, now) => key === ymd(now) ? "today" : key === ymd(addDays(startOfDay(now), 1)) ? "tomorrow" : fmtDate(key + "T12:00", { weekday: "long", day: "numeric", month: "short" });
function cleanTitle(s){
  s = String(s).replace(/^\s*(plan|organi[sz]e|schedule)\b[^:]{0,24}:\s*/i, "").replace(/^\s*(and|then|also|plus|but)\s+/i, "")
    .replace(/^\s*(i\s+)?(have to|need to|must|should|want to|will|gotta|got to|plan to|am going to|'m going to|have got to)\s+/i, "")
    .replace(/^\s*i\s+/i, "").replace(/^\s*to\s+/i, "")
    .replace(/\b(my|our)\s+/gi, "").replace(/\s+/g, " ").trim().replace(/[.,;:!?]+$/, "").trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
}
function rulesPlan(text, w, now){
  const visible = w.items.filter(i => !isDone(i) && (w.mode !== "company" || i.assignee === viewerId(w)));
  const tKey = ymd(now);
  // 1) moving something that already exists
  const mv = text.match(/\b(move|shift|reschedule|postpone|push|carry|put)\b([\s\S]*)$/i);
  if (mv) {
    const target = parseQuick("x " + mv[2], w, now).date;
    if (!target) return { reply: "", question: "Which day should I move it to?", actions: [], skipped: 0 };
    let picks;
    if (/\b(all|everything|unfinished|remaining|rest|leftover)\b/i.test(text)) picks = visible.filter(i => i.plan && i.plan <= tKey);
    else {
      const want = toks(text.slice(0, mv.index) + " " + mv[2]);
      const scored = visible.map(i => ({ i, s: toks(i.title).filter(x => want.includes(x)).length + (i.plan === tKey ? .1 : 0) })).filter(x => x.s >= 1).sort((a, b) => b.s - a.s);
      picks = scored.length ? [scored[0].i] : [];
    }
    if (!picks.length) return { reply: "", question: "Which task should I move? I couldn't match it to anything on your list.", actions: [], skipped: 0 };
    // Moving plans the work for another day. Only "the deadline is now…" moves a deadline, and that still needs approval.
    const moveDeadline = /\b(deadline|due date)\b/i.test(text);
    const one = picks.length === 1 ? picks[0] : null;
    const reply = one && one.due && !moveDeadline ? `I'll plan "${one.title}" for ${dayWord(target, now)}. Its deadline stays ${fmtDue(one.due)}.`
      : `I'll move ${one ? `"${one.title}"` : `${picks.length} tasks`} to ${dayWord(target, now)}.`;
    return { reply, question: null, skipped: 0,
      actions: picks.map(i => moveDeadline && i.due ? { type: "update", keep: true, id: i.id, title: i.title, changes: { deadline: target }, date: null }
        : { type: "update", keep: true, id: i.id, title: i.title, changes: { date: target }, date: target }) };
  }
  // 2) new tasks and deadlines (the same reading the Add box uses)
  const actions = extractTasks(text, w, now);
  actions.forEach(a => { const dup = visible.find(i => normTitle(i.title) === normTitle(a.title) && dayOf(i) === a.date); if (dup) { a.keep = false; a.dupOf = dup.id; } });
  if (!actions.length) return { reply: "I couldn't find any tasks in that. Try something like “Tomorrow I have to finish my report and call Priya.”", question: null, actions: [], skipped: 0 };
  if (actions.length === 1 && actions[0].isDeadline) { const a = actions[0];
    return { reply: `Got it. I'll track "${a.title}" as a deadline on ${dayWord(a.date, now)}, with reminders 1 day and 1 hour before.`, question: null, skipped: 0, actions }; }
  const dates = [...new Set(actions.map(a => a.date).filter(Boolean))];
  const day = dates.length === 1 ? dates[0] : (actions[0] && actions[0].date);
  const hours = actions.filter(a => a.date === day).reduce((s, a) => s + (a.estimate || 0), 0);
  const nDl = actions.filter(a => a.isDeadline).length;
  let reply = nDl && nDl < actions.length ? `Here's what I found: ${nDl} deadline${nDl === 1 ? "" : "s"} and ${actions.length - nDl} task${actions.length - nDl === 1 ? "" : "s"}.`
    : day ? (day === tKey ? "Here's your list for today." : `I've organised your work for ${dayWord(day, now)}.`) : "Here's what I found. None of these have a day yet, so add one if they're due on a specific day.";
  const miss = actions.filter(a => a.assigneeMiss);
  if (miss.length) reply += ` I couldn't find ${miss.map(a => a.assigneeMiss).join(" or ")} in your team, so ${miss.length === 1 ? "that task stays" : "those stay"} with you.`;
  if (hours > w.settings.hoursPerDay) reply += ` That's about ${fmtH(hours)} of focused work, more than your usual ${fmtH(w.settings.hoursPerDay)}, so consider moving something.`;
  return { reply, question: null, actions, skipped: 0 };
}
// Reads free text into tasks and deadlines: commas, "and", "then" and new lines separate them; a date said once
// applies to the whole list; "due"/"deadline"/exam words make a deadline; "assign … to <name>" sets the person.
// Used by the Add box and by the assistant's offline rules, so both understand text the same way.
function extractTasks(text, w, now){
  const prepped = String(text || "").replace(/\bfor\s+(\d+(?:\.\d+)?|an?|one|two|three|four|five|six|seven|eight|nine|ten|half an?)\s+(hours?|hrs?|minutes?|mins?)\b/gi, (m, n, u) => {
    const v = WORDN[String(n).toLowerCase().split(" ")[0]] ?? parseFloat(n);
    return /^h/i.test(u) ? `~${v}h` : `~${v}min`;
  });
  const frags = prepped.split(/\s*[,;\n]\s*(?:and\s+|then\s+)?|\.\s+(?=[A-Z])|\s+and\s+(?=(?:also\s+)?[a-z])|\s+then\s+/i).map(s => s.trim()).filter(Boolean);
  const parsed = frags.map(f => ({ f, p: parseQuick(f, w, now) }));
  const dates = [...new Set(parsed.map(x => x.p.date).filter(Boolean))];
  const shared = dates.length === 1 ? dates[0] : null;
  const actions = []; const mgr = canManage(w);
  parsed.forEach(({ f, p }, k) => {
    // "My project submission deadline is 5 Nov" -> "Project submission"
    const dm = f.match(/^(.*?)\b(deadline|is due|due on|due by|due date)\b/i);
    const title = cleanTitle(dm && p.date && dm[1].trim() && !/[@#~!]/.test(dm[1]) ? dm[1].replace(/^\s*(the|a)\s+/i, "") : p.title);
    // "…, and assign it to Rahul" on its own belongs to the task before it
    if ((!title || title.length < 2) && (p.assignee || p.assigneeMiss) && actions.length) { const prev = actions[actions.length - 1]; if (p.assignee && mgr) prev.assignee = p.assignee; else prev.assigneeMiss = p.assigneeMiss || null; return; }
    if (!title || title.length < 2) return;
    const date = p.date || shared;
    const isDeadline = !!(p.deadline && date);
    const low = f.toLowerCase();
    let pr = !p.prioritySuggested ? p.priority : /\b(submit|submission|deadline|exam|test|quiz|pay|fee|interview)\b/.test(low) || (isDeadline && new Date(date + "T23:59").getTime() - now < 2 * DAY) ? "high" : /\b(maybe|optional|if time)\b/.test(low) ? "low" : "medium";
    const time = p.timeDefault ? null : p.time;
    const event = /\b(attend|class|college|lecture|school|office|meeting)\b/.test(low);
    const a = { type: "create", keep: true, title, date, time, isDeadline, priority: pr, estimate: p.estimate, reminders: isDeadline ? [1440, 60] : time ? [15] : pr === "high" && date ? [0] : [], description: "",
      kind: p.type, groupId: p.groupId || null, repeat: p.repeat || "none", _o: (time ? 0 : event ? 1 : pr === "high" ? 2 : 3) * 100 + k };
    if (p.assignee && mgr) a.assignee = p.assignee; else if (p.assigneeMiss) a.assigneeMiss = p.assigneeMiss;
    actions.push(a);
  });
  actions.sort((a, b) => a._o - b._o).forEach(a => delete a._o);
  return actions;
}
// Turns one approved suggestion (from the assistant or the Add box) into a saved task.
function taskFromAction(w, a, opts = {}){
  const who = a.assignee && canManage(w) && memberOf(w, a.assignee) ? a.assignee : viewerId(w);
  const base = { title: a.title.trim().slice(0, 140), notes: a.description || "", priority: PRI[a.priority] ? a.priority : "medium", estimate: a.estimate || null, assignee: who,
    type: TYPES_BY_MODE[w.mode].includes(a.kind) ? a.kind : DEFAULT_TYPE[w.mode], groupId: a.groupId && groupOf(w, a.groupId) ? a.groupId : null, repeat: a.repeat || "none",
    reviewer: w.mode === "company" && who !== viewerId(w) ? viewerId(w) : null };
  const it = a.isDeadline && a.date
    ? mkItem(w, Object.assign(base, { kind: "deadline", due: `${a.date}T${a.time || "23:59"}`, reminders: a.reminders && a.reminders.length ? a.reminders : null }))
    : mkItem(w, Object.assign(base, { kind: "todo", plan: a.date || opts.day || null, time: a.time || null, due: null, reminders: a.reminders && a.reminders.length ? a.reminders : (a.time ? [15] : []) }));
  if (opts.source) it.source = opts.source;
  w.items.push(it);
  return it;
}

/* ---------- "plan my day / plan my tomorrow": built from the user's own list ---------- */
// Common misspellings of tomorrow ("tommorw", "tomorow", "tmrw"...) are read as tomorrow, and
// Hinglish (Hindi written in English letters) is turned into the words the rules understand.
const HINGLISH_RE = /\b(hai|hain|karna|karni|karne|karo|kal|aaj|parso|mujhe|kya|aur|bana|banao|padhna|padhai|baje|ghante|ghanta|subah|shaam|raat)\b/i;
function fixHinglish(s){
  s = String(s || "");
  if (!HINGLISH_RE.test(s)) return s;
  const am = /\bsubah\b/i.test(s), pm = /\b(shaam|raat)\b/i.test(s);
  return s
    .replace(/\bparso\b/gi, "day after tomorrow").replace(/\bkal\b/gi, "tomorrow").replace(/\baaj\b/gi, "today")
    .replace(/\b(\d{1,2})\s*baje\b/gi, (m, h) => { h = +h; return `${h}${am ? "am" : pm ? "pm" : h >= 8 && h <= 11 ? "am" : "pm"}`; })
    .replace(/\b(\d+(?:\.\d+)?|ek|do|teen|char|chaar|paanch)\s*(ghante|ghanta)\b/gi, (m, n) => `for ${({ ek: 1, do: 2, teen: 3, char: 4, chaar: 4, paanch: 5 })[String(n).toLowerCase()] || n} hours`)
    .replace(/\b(subah|shaam)\b/gi, "").replace(/\braat\s+ko\b/gi, "tonight")
    .replace(/\b(padhai|padhna|padhni)\b/gi, "study")
    .replace(/\b(karna|karni|karne|krna)\s+(hai|h|he|hain|padega|padegi)\b/gi, "").replace(/\b(hai|hain|mujhe|bhi)\b/gi, "")
    .replace(/\baur\b/gi, "and").replace(/\b(mera|meri|mere)\b/gi, "my").replace(/\s+(ka|ki|ke|ko)\s+/gi, " ")
    .replace(/\s{2,}/g, " ").trim();
}
const fixDayTypos = s => fixHinglish(String(s || "").replace(/\b(t+o?m+o?r+o*w+|tmrw|tmr|tmw)\b/gi, "tomorrow"));
const PLAN_FILL = new Set("please can could would you help me to plan planning organise organize schedule arrange make a an out my the for of whole full entire day today tomorrow tonight what should shall i do work on complete finish focus start first next it everything all tasks task have too much lot so i'm im am feel overwhelmed overloaded busy m kya karna karu karoon karun bana banao bana do de dena sakta sakti hu hoon".split(" "));
// Returns the day to plan ("YYYY-MM-DD") when the message only asks to plan a day, otherwise null.
function planIntent(text, w, now){
  const s = fixDayTypos(text).toLowerCase().replace(/[^a-z0-9 ]+/g, " ");
  const raw = String(text || "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\bkal\b/g, "tomorrow").replace(/\baaj\b/g, "today") + " " + s;
  if (!/\b(plan|planning|organi[sz]e|schedule|arrange)\b[\s\S]*\b(day|today|tomorrow|tonight)\b|\bwhat should i (do|work on|complete|finish|focus on|start)\b|\btoo much (work|to do)\b|\b(overwhelmed|overloaded)\b|\b(organi[sz]e|prioriti[sz]e) (it|my work|everything|my tasks)\b|\b(today|tomorrow) kya (karna|karu|karoon|karun)\b|\bplan (bana|banao)\b/.test(raw)) return null;
  const rest = s.split(/\s+/).filter(x => x && !PLAN_FILL.has(x) && !WD_NAMES.includes(x));
  if (rest.length) return null;
  const d = parseQuick("x " + fixDayTypos(text), w, now).date;
  return d || todayKey(now);
}
const WD_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "next", "this", "on"];
function planDay(w, now, key){
  const me = viewerId(w);
  const open = w.items.filter(i => !isDone(i) && (w.mode !== "company" || i.assignee === me));
  const t = todayKey(now), dayName = dayWord(key, now);
  const nextKey = ymd(addDays(new Date(key + "T12:00"), 1));
  const already = open.filter(i => i.plan === key || (!i.plan && dueDay(i) === key));
  const picks = []; const seen = new Set(already.map(i => i.id));
  const add = (i, why, h, rank) => { if (seen.has(i.id)) return; seen.add(i.id); picks.push({ i, why, h, rank }); };
  const priN = i => ({ high: 0, medium: 1, low: 2 }[i.priority] ?? 1);
  // 1) overdue deadlines first
  open.filter(i => i.due && new Date(i.due).getTime() < now).sort((a, b) => new Date(a.due) - new Date(b.due))
    .forEach(i => add(i, `overdue since ${fmtDue(i.due)}`, remainingH(i) || null, 0));
  // 2) deadlines due that day or the day after
  open.filter(i => i.due && new Date(i.due).getTime() >= now && (dueDay(i) === key || dueDay(i) === nextKey)).sort((a, b) => new Date(a.due) - new Date(b.due))
    .forEach(i => add(i, `due ${dueDay(i) === key ? dayName : dayWord(nextKey, now)} ${fmtTime(i.due)}`, remainingH(i) || null, 1));
  // 3) work the planner already set aside for that day, so later deadlines aren't left to the last night
  const pf = planFor(w, now, me); const day = pf.days.find(d => d.key === key);
  (day ? day.sessions : []).forEach(s => { const i = findItem(s.id, w); if (i && !isDone(i)) add(i, `about ${fmtH(s.h)} toward the ${fmtDue(i.due)} deadline`, s.h, 2); });
  // 4) to-dos left over from earlier days
  open.filter(i => !i.due && i.plan && i.plan < t && key >= t).forEach(i => add(i, `left over from ${fmtDate(i.plan + "T12:00")}`, Number(i.estimate) || null, 3));
  picks.sort((a, b) => a.rank - b.rank || priN(a.i) - priN(b.i));
  if (!picks.length) {
    if (already.length) return { reply: `${dayName.charAt(0).toUpperCase() + dayName.slice(1)} already has ${already.length} task${already.length === 1 ? "" : "s"} planned (${already.map(i => i.title).join(", ")}). Nothing else is due soon, so you're set.`, question: null, actions: [], skipped: 0 };
    return { reply: `Nothing is due or planned for ${dayName} yet. Tell me what you need to do, for example “${key === t ? "Today" : "Tomorrow"} I have to finish my report and go to the gym.”`, question: null, actions: [], skipped: 0 };
  }
  // Keep the day realistic: past the usual hours, later low-urgency items are left unticked (you can tick them back).
  const cap = w.settings.hoursPerDay || 0;
  let hours = already.reduce((s, i) => s + (remainingH(i) || Number(i.estimate) || 0), 0); const off = [];
  picks.forEach(p => { const h = p.h || 0; if (cap && p.rank >= 2 && hours + h > cap + .01) { p.keep = false; off.push(p.i.title); } else hours += h; });
  const actions = picks.map(p => ({ type: "update", keep: p.keep !== false, id: p.i.id, title: p.i.title, changes: { date: key }, date: key, why: p.why + (p.h ? ` · ~${fmtH(p.h)}` : "") }));
  let reply = `Here's a plan for ${dayName} from your list, most urgent first.`;
  if (already.length) reply += ` Already planned: ${already.map(i => i.title).join(", ")}.`;
  if (hours) reply += cap && hours > cap + .01 ? ` That's about ${fmtH(hours)} of work, more than your usual ${fmtH(cap)}, so start from the top.` : ` That's about ${fmtH(hours)} of work.`;
  if (off.length) reply += ` I left ${off.join(", ")} unticked so the day isn't overloaded.`;
  reply += " Deadlines stay where they are.";
  return { reply, question: null, actions, skipped: 0 };
}

/* ---------- conversation ---------- */
function chatOf(w){ w.chat = w.chat || []; return w.chat; }
// Server actions -> what the suggestion card shows. (Saving goes back to the server, which re-checks everything.)
function fromServerAction(a){
  if (a.type === "plan") return Object.assign({}, a, { type: "update", changes: { date: a.date } });
  if (a.type === "deadline") return Object.assign({}, a, { type: "update", changes: { deadline: a.date }, date: null, _deadline: a.date });
  return Object.assign({}, a);
}
async function sendToAssistant(text, opts = {}){
  const w = W(); text = String(text || "").trim();
  if (!text || AI.busy) return;
  const chat = chatOf(w);
  if (!opts.retry) chat.push({ id: rid("m"), role: "user", text, t: nowIso() });
  if (chat.length > 80) chat.splice(0, chat.length - 80);
  UI.aiDraft = ""; AI.busy = true; save(); render();
  if (Store.mode === "server") {
    // The server's planning engine reads your saved tasks there; nothing goes to an outside AI.
    let r;
    try {
      r = await apiJSON("POST", "/api/plan/chat", { message: text, conversationId: w.planConv || undefined });
      if (r.status === 404 && w.planConv) { w.planConv = null; r = await apiJSON("POST", "/api/plan/chat", { message: text }); }
    } catch (e) { r = { ok: false, json: {} }; }
    AI.busy = false;
    if (!r.ok) { chat.push({ id: rid("m"), role: "ai", error: true, retry: text, t: nowIso(), text: `I couldn't reach the server just now (${r.json.error || "connection problem"}). Try again.` }); save(); render(); return; }
    const m = r.json.message; w.planConv = r.json.conversationId;
    chat.push({ id: rid("m"), serverId: m.id, role: "ai", via: "engine", t: m.createdAt || nowIso(), text: m.text, proposal: m.proposal ? { status: m.proposal.status, actions: m.proposal.actions.map(fromServerAction) } : null });
    save(); render(); return;
  }
  // No server: the same kind of rules, run in this browser.
  await sleep(250);
  const planKey = planIntent(text, w, Date.now());
  const res = planKey ? planDay(w, Date.now(), planKey) : rulesPlan(fixDayTypos(text), w, Date.now());
  AI.busy = false;
  let reply = res.reply || (res.actions.length ? "Here's what I'd suggest." : "");
  if (res.question) reply = (reply ? reply + " " : "") + res.question;
  if (res.actions.some(a => a.dupOf)) reply += " Anything already on your list is unticked.";
  chat.push({ id: rid("m"), role: "ai", via: planKey ? "local" : "rules", t: nowIso(), text: reply || "Okay.", proposal: res.actions.length ? { status: "pending", actions: res.actions } : null });
  save(); render();
}
// Saving a suggestion that came from the server: the server validates it and writes the tasks.
async function applyServerProposal(msg, discard){
  const send = { messageId: msg.serverId };
  if (discard) send.discard = true;
  else send.actions = msg.proposal.actions.map(a => a.type === "create" ? { keep: !!a.keep, title: a.title, date: a.date || null, time: a.time || null, priority: a.priority } : { keep: !!a.keep, date: a._deadline || a.date || null });
  await flushNow();
  const r = await apiJSON("POST", "/api/plan/apply", send).catch(() => ({ ok: false, json: {} }));
  if (!r.ok) { toast(r.json.error || "Couldn't save. Check your connection and try again.", null, null, "error"); return; }
  const id = msg.id;
  await reloadFromServer();
  const again = chatOf(W()).find(m => m.id === id) || msg;
  if (again.proposal) { again.proposal.status = discard ? "discarded" : "saved"; if (!discard) again.proposal.result = { created: r.json.result.created, updated: r.json.result.updated, done: r.json.result.completed, ids: r.json.result.ids }; }
  save(); render();
  if (!discard) { const x = r.json.result; toast([x.created && `Saved ${x.created} task${x.created === 1 ? "" : "s"}`, x.updated && `updated ${x.updated}`, x.completed && `completed ${x.completed}`].filter(Boolean).join(", ") + "."); }
}
function applyProposal(msg){
  const w = W(); const p = msg.proposal; if (!p || p.status !== "pending") return;
  let created = 0, updated = 0, done = 0, removed = 0; const ids = [];
  p.actions.filter(a => a.keep).forEach(a => {
    if (a.type === "create") {
      if (!a.title || !a.title.trim()) return;
      if (a.date && !validYmd(a.date)) return;
      const it = taskFromAction(w, a.isDeadline && !(a.reminders && a.reminders.length) ? Object.assign({}, a, { reminders: [1440, 60] }) : a, { source: msg.via === "ai" ? "ai" : "assistant" });
      it.order = created;
      logItem(w, it, `Added "${it.title}" from the assistant`); created++; ids.push(it.id);
    } else {
      const it = findItem(a.id, w); if (!it) return;
      if (a.type === "update") {
        const c = Object.assign({}, a.changes, a.date ? { date: a.date } : {});
        const parts = [];
        if (c.date) { setPlan(it, c.date); if (isDone(it)) { it.status = "todo"; it.doneAt = null; } parts.push(`planned for ${fmtDate(c.date + "T12:00")}`); }
        if (c.deadline && it.due) { it.originalDue = it.originalDue || it.due; const was = fmtDue(it.due); it.due = c.deadline + it.due.slice(10); parts.push(`deadline moved from ${was} to ${fmtDue(it.due)}`); }
        if (c.time !== undefined) { if (c.deadline && it.due && c.time) it.due = it.due.slice(0, 11) + c.time; else if (!c.deadline) it.time = c.time; }
        if (c.priority) { it.priority = c.priority; parts.push(`priority ${PRI[c.priority].label}`); }
        if (c.title) { it.title = c.title; parts.push("renamed"); }
        if (c.status) { if (c.status === "completed") { it.status = "done"; it.doneAt = nowIso(); } else it.status = c.status === "in_progress" ? "doing" : "todo"; }
        touch(it); logItem(w, it, `Assistant: ${parts.join(", ") || "updated"} "${it.title}"`); updated++; ids.push(it.id);
      } else if (a.type === "complete") { it.status = "done"; it.doneAt = nowIso(); touch(it); logItem(w, it, `Completed "${it.title}" via the assistant`); done++; }
      else if (a.type === "delete") { w.items = w.items.filter(x => x.id !== it.id); removed++; }
    }
  });
  p.status = "saved"; p.result = { created, updated, done, removed, ids };
  save(); render(); celebrateIfAllDone(w);
  toast([created && `Saved ${created} task${created === 1 ? "" : "s"}`, updated && `updated ${updated}`, done && `completed ${done}`, removed && `deleted ${removed}`].filter(Boolean).join(", ") + ".", null, null, "success");
}
function proposalHTML(msg){
  const p = msg.proposal; if (!p) return "";
  const now = Date.now(); const w = W();
  if (p.status !== "pending") {
    const r = p.result || {};
    const head = p.status === "saved" ? `${IC.check}${[r.created ? `Saved ${r.created} task${r.created === 1 ? "" : "s"}` : "", r.updated ? `updated ${r.updated}` : "", r.done ? `completed ${r.done}` : "", r.removed ? `deleted ${r.removed}` : ""].filter(Boolean).join(", ") || "Saved"}` : "Discarded";
    return `<div class="proposal ${p.status}"><div class="prop-head"><span class="prop-tag ${p.status}">${head}</span>${p.status === "saved" ? `<button class="btn xs" type="button" data-route="overview">View on Today</button>` : ""}</div>
      <ul class="prop-done">${p.actions.filter(a => a.keep).map(a => `<li>${esc(a.type === "update" ? `${a.title} → ${a.date ? dayWord(a.date, now) : "updated"}` : a.title)}</li>`).join("")}</ul></div>`;
  }
  const remLbl = m => m >= 1440 ? `${m / 1440 === 1 ? "1 day" : m / 1440 + " days"} before` : m >= 60 ? `${m / 60 === 1 ? "1 hour" : m / 60 + " hours"} before` : m > 0 ? `${m} min before` : "On the day";
  return `<div class="proposal" data-msg="${msg.id}">
    <div class="prop-head"><span class="prop-tag">${IC.spark}Suggestion · not saved yet</span><span class="muted" style="font-size:12px">Edit anything, untick what you don't want</span></div>
    ${p.actions.map((a, k) => {
      if (a.type === "create") return `<div class="prop-row${a.keep ? "" : " off"}">
        <input type="checkbox" data-pk="${k}" ${a.keep ? "checked" : ""} aria-label="Include ${esc(a.title)}">
        <div class="pr-main"><input type="text" class="pr-title" data-pt="${k}" value="${esc(a.title)}" aria-label="Task title">
          <div class="pr-meta"><span class="pr-kind ${a.isDeadline ? "dl" : ""}">${a.isDeadline ? "Deadline" : "To-do"}</span>
            <label class="pr-f"><span class="sr">${a.isDeadline ? "Due date" : "Day"}</span><input type="date" data-pd="${k}" value="${a.date || ""}" aria-label="${a.isDeadline ? "Due date" : "Day"}"></label>
            <label class="pr-f"><span class="sr">Time</span><input type="time" data-ptm="${k}" value="${a.time || ""}" aria-label="Time"></label>
            <select data-pp="${k}" aria-label="Priority">${Object.keys(PRI).map(x => `<option value="${x}" ${a.priority === x ? "selected" : ""}>${PRI[x].label}</option>`).join("")}</select>
            ${a.estimate ? `<span class="pr-est">~${fmtH(a.estimate)}</span>` : ""}
            ${(a.reminders || []).map(m => `<span class="prop-rem">${IC.bell}${remLbl(m)}</span>`).join("")}
            ${a.assignee && memberOf(w, a.assignee) ? `<span class="pr-who">${avatarHTML(memberOf(w, a.assignee))}For ${esc(memberOf(w, a.assignee).name)}</span>` : ""}
            ${a.assigneeMiss ? `<span class="pr-dup">No one called ${esc(a.assigneeMiss)}</span>` : ""}
            ${a.dupOf ? `<span class="pr-dup">Already on your list</span>` : ""}
          </div></div></div>`;
      const it = findItem(a.id, w);
      const label = a.type === "update" ? (a.why ? "Plan" : a.date ? "Move" : "Change") : a.type === "complete" ? "Mark done" : "Delete";
      const ch = a.changes || {};
      const extra = a.type === "update" ? Object.entries(ch).filter(([k2]) => k2 !== "date" && k2 !== "deadline").map(([k2, v]) => `${k2} → ${v}`).join(", ") : "";
      return `<div class="prop-row update${a.keep ? "" : " off"}">
        <input type="checkbox" data-pk="${k}" ${a.keep ? "checked" : ""} aria-label="Include change to ${esc(a.title)}">
        <div class="pr-main"><p><b>${ch.deadline ? "Move the deadline of" : label}</b> "${esc(a.title)}"${a.type === "update" && a.date ? ` ${a.why ? "for" : "to"} <input type="date" data-pd="${k}" value="${a.date}" aria-label="New day">` : ""}${ch.deadline ? ` to ${esc(fmtDate(ch.deadline + "T12:00"))}` : ""}${extra ? ` · ${esc(extra)}` : ""}${a.why ? `<span class="pr-why muted"> · ${esc(a.why)}</span>` : ""}</p>
          ${it && it.due && ch.deadline ? `<p class="pr-warn">${IC.alert}This changes a hard deadline from ${fmtDue(it.due)}. Only save it if the deadline really moved.</p>`
            : it && it.due && a.date ? `<p class="muted" style="font-size:12.5px">Plans the work for that day. The deadline stays ${fmtDue(it.due)}.</p>` : ""}</div></div>`;
    }).join("")}
    <div class="prop-foot"><button class="btn primary sm" type="button" data-act="propsave">${IC.check}Save to my tasks</button><button class="btn ghost sm" type="button" data-act="propdiscard">Discard</button></div>
  </div>`;
}
function msgHTML(m){
  if (m.role === "user") return `<div class="msg user"><div class="bubble">${esc(m.text)}${m.t ? `<time>${dwTime(m.t)}</time>` : ""}</div></div>`;
  return `<div class="msg ai${m.error ? " error" : ""}" data-msg="${m.id}"><span class="orb sm" aria-hidden="true"></span><div class="bubble">${m.text ? `<p class="ai-text">${esc(m.text)}</p>` : ""}${proposalHTML(m)}
    ${m.error ? `<div class="row-flex"><button class="btn sm" type="button" data-act="airetry">Try again</button></div>` : ""}
    <div class="dw-meta">${m.t ? `<time>${dwTime(m.t)}</time>` : ""}${m.via === "rules" && !m.error ? `<span class="via">Simple rules (on this device)</span>` : m.via === "local" && !m.error ? `<span class="via">From your saved tasks</span>` : m.via === "engine" && !m.error ? `<span class="via">Planned on your server (private)</span>` : ""}</div></div></div>`;
}
const SUGGEST = {
  student: ["Tomorrow I have to complete my Java assignment, attend college, practice DSA for two hours, and submit my project report.", "I have to study Python, finish my website homepage, and call my project teammate today.", "My project submission deadline is 5 November.", "Move my unfinished tasks to tomorrow."],
  company: ["Today I need to review the landing page, reply to the client and prepare the sprint demo.", "The Q4 report deadline is next Friday.", "Tomorrow I have a team sync at 10am and need to finish the API docs.", "Move my unfinished tasks to tomorrow."],
  personal: ["Tomorrow I need to pay the electricity bill, go to the gym and call mom.", "My passport renewal deadline is 20 November.", "Today I have to buy groceries and clean the kitchen.", "Move my unfinished tasks to tomorrow."]
};
function viewAssistant(){
  const w = W(); const chat = chatOf(w); const now = CTX.now;
  const P = todayProgress(w, now); const today = todayTodos(w, now).sort(todoSort).slice(0, 6);
  const name = (state.user.name || "").split(" ")[0];
  const msgs = chat.map(msgHTML).join("") + (AI.busy ? `<div class="msg ai typing-msg"><span class="orb sm spin" aria-hidden="true"></span><div class="bubble"><span class="typing" aria-label="Thinking"><i></i><i></i><i></i></span><span class="muted">Planning…</span></div></div>` : "");
  const welcome = !chat.length ? `<div class="ai-welcome"><span class="orb lg" aria-hidden="true"></span><h3>${name ? `Hi ${esc(name)}, what` : "What"}'s on your plate?</h3><p>Tell me your work in your own words. I'll turn it into a to-do list you can check before anything is saved.</p>
      <div class="ai-suggest">${(SUGGEST[w.mode] || SUGGEST.student).map(s => `<button type="button" data-act="aisuggest" data-v="${esc(s)}">${esc(s)}</button>`).join("")}</div></div>` : "";
  return `<div class="ai-wrap">
    <section class="ai-chat">
      <header class="ai-head"><span class="orb" aria-hidden="true"></span><div><h2>Assistant</h2><p class="ai-mode" id="aiMode">${aiModeHTML()}</p></div>
        ${chat.length ? `<button class="btn ghost sm" type="button" data-act="aiclear">New chat</button>` : ""}</header>
      <div class="ai-msgs" id="aiMsgs" aria-live="polite">${welcome}${msgs}</div>
      <div class="ai-quick" role="group" aria-label="Quick actions">
        <button class="chip-btn" type="button" data-act="aiadd">${IC.plus}Add task</button>
        <button class="chip-btn" type="button" data-act="aitoday">${IC.list}View today</button>
        <button class="chip-btn" type="button" data-act="aireschedule">${IC.forward}Reschedule unfinished</button>
      </div>
      <form class="ai-compose" id="aiForm"><textarea id="aiInput" rows="1" placeholder="e.g. Tomorrow I have to finish my report and practise DSA for 2 hours" aria-label="Message the assistant" ${AI.busy ? "disabled" : ""}>${esc(UI.aiDraft || "")}</textarea>
        <button class="btn primary" id="aiSend" type="submit" aria-label="Send" ${AI.busy ? "disabled" : ""}>${IC.send}<span class="hide-m">Send</span></button></form>
    </section>
    <aside class="ai-side">
      <section class="card ai-today"><div class="card-h"><h3>Today</h3><a class="sub" href="#overview" data-route="overview">Open Today</a></div>
        <div class="row-flex"><div class="th-ring sm">${progressRing(P.done, P.total, 52)}<span>${P.done}/${P.total}</span></div><p class="muted" style="font-size:13px">${P.total ? `${P.done} of ${P.total} tasks completed` : "Nothing planned yet. Tell me what you need to do."}</p></div>
        <div class="mini-todos">${today.map(i => todoRowHTML(i)).join("")}</div></section>
      <section class="card ai-how"><h3>How it works</h3><ol><li>Tell me your work, the way you'd say it.</li><li>I suggest tasks, days, priorities and reminders.</li><li>You edit and approve. Only then is anything saved.</li></ol>
        <p class="note">${IC.info}<span>${AI.kind === "engine" ? "My Plan runs on your Deadline Tracker server and reads only your own saved tasks. They are never sent to an outside AI." : "Planning runs in this browser with simple rules. Start the Deadline Tracker server to use the full planning engine, accounts and reminders."}</span></p></section>
    </aside></div>`;
}
VIEWS.assistant = viewAssistant;
PAGE.assistant = "Assistant";

function rescheduleUnfinished(){
  const w = W(); const now = Date.now(); const t = todayKey(now), tm = tomorrowKey(now);
  const left = myTasks(w).filter(i => !isDone(i) && i.plan && i.plan <= t);
  chatOf(w).push({ id: rid("m"), role: "user", text: "Move my unfinished tasks to tomorrow.", t: nowIso() });
  chatOf(w).push({ id: rid("m"), role: "ai", via: "local", t: nowIso(), text: left.length ? `Here's what I'd move to tomorrow (${left.length}).` : "Nothing unfinished on today's list, so there's nothing to move.",
    proposal: left.length ? { status: "pending", actions: left.map(i => ({ type: "update", keep: true, id: i.id, title: i.title, changes: { date: tm }, date: tm })) } : null });
  save(); render();
}
function scrollChat(){ const m = $("#aiMsgs"); if (m && chatOf(W()).length) m.scrollTop = m.scrollHeight; else if (m) m.scrollTop = 0; }

/* ---------- events ---------- */
document.addEventListener("submit", e => {
  if (e.target.id === "aiForm") { e.preventDefault(); const v = $("#aiInput").value; sendToAssistant(v); }
});
document.addEventListener("keydown", e => {
  if (e.target.id === "aiInput" && e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendToAssistant(e.target.value); }
});
document.addEventListener("input", e => {
  if (e.target.id === "aiInput") { UI.aiDraft = e.target.value; e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px"; }
});
document.addEventListener("change", e => {
  const t = e.target; const box = t.closest && t.closest(".proposal[data-msg]"); if (!box) return;
  const msg = chatOf(W()).find(m => m.id === box.dataset.msg); if (!msg || !msg.proposal) return;
  const k = +(t.dataset.pk ?? t.dataset.pt ?? t.dataset.pd ?? t.dataset.ptm ?? t.dataset.pp); const a = msg.proposal.actions[k]; if (!a) return;
  if (t.dataset.pk != null) { a.keep = t.checked; t.closest(".prop-row").classList.toggle("off", !a.keep); }
  else if (t.dataset.pt != null) a.title = t.value.trim().slice(0, 140) || a.title;
  else if (t.dataset.pd != null) { a.date = t.value || null; if (a.type === "update") { a.changes = Object.assign({}, a.changes, { date: a.date }); } }
  else if (t.dataset.ptm != null) a.time = t.value || null;
  else if (t.dataset.pp != null) a.priority = t.value;
  save();
});
document.addEventListener("click", e => {
  const a = e.target.closest("[data-act]"); if (!a || !state || !state.workspaces || !state.workspaces.length) return;
  const w = W();
  switch (a.dataset.act) {
    case "aisuggest": sendToAssistant(a.dataset.v); break;
    case "propsave": case "propdiscard": {
      const box = a.closest(".proposal[data-msg]"); const msg = box && chatOf(w).find(m => m.id === box.dataset.msg);
      if (!msg) break;
      if (a.dataset.act === "propsave") { if (!msg.proposal.actions.some(x => x.keep)) { toast("Tick at least one suggestion to save.", null, null, "error"); break; } if (msg.serverId) applyServerProposal(msg); else applyProposal(msg); }
      else if (msg.serverId) applyServerProposal(msg, true);
      else { msg.proposal.status = "discarded"; save(); render(); }
      break; }
    case "airetry": { const box = a.closest("[data-msg]"); const chat = chatOf(w); const k = chat.findIndex(m => m.id === (box && box.dataset.msg)); const msg = chat[k];
      if (!msg) break; chat.splice(k, 1); sendToAssistant(msg.retry, { retry: true }); break; }
    case "aiclear": { const before = chatOf(w).slice(); w.chat = []; save(); render(); toast("Started a new chat. Your tasks are unchanged.", () => { w.chat = before; save(); render(); }); break; }
    case "aiadd": openQuickAdd(); break;
    case "aitoday": UI.todoTab = "today"; setRoute("overview"); break;
    case "aireschedule": rescheduleUnfinished(); break;
  }
});

/* =========================================================
   Accounts (when the app runs on the Deadline Tracker server)
   The server decides who you are from an HttpOnly cookie. Your data is
   loaded from and saved to your own account; nothing is shared between
   accounts. Without the server (claude.ai, a plain file server) the app
   keeps working as before, saving in this browser.
   ========================================================= */
const ACCOUNT = { on: false, user: null, version: 0, timer: null, saving: false, dirty: false, poll: null, mode: "login" };
// The page's first lines already asked for /api/me and /api/state (index.html head); use those answers once.
const BOOT = (() => { const b = window.__dtBoot || {}; try { delete window.__dtBoot; } catch (e) {} return b; })();
async function checkAccounts(){
  if (!/^https?:$/.test(location.protocol)) return null;
  const local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  // On a hosted site the server may be asleep (free hosting) and need up to a minute to wake: wait for it
  // rather than quietly saving in this browser only.
  for (let k = 0; ; k++) {
    let r = null;
    try { r = k === 0 && BOOT.me ? await BOOT.me : await fetch("/api/me", { cache: "no-store", credentials: "same-origin" }); } catch (e) {}
    BOOT.me = null;
    if (r && r.ok) { let j = null; try { j = await r.json(); } catch (e) {} hideWaking(); return j && j.accounts ? j : null; }
    if (r && r.status === 404) { hideWaking(); return null; }   // a plain file host: no server here
    if (local || k >= 40) { hideWaking(); if (!local && k >= 40) showWakingFailed(); return null; }
    showWaking(); await sleep(3000);
  }
}
function showWaking(){
  const o = $("#onb"); $("#app").hidden = true; o.hidden = false; o.classList.add("auth");
  if ($("#waking")) return;
  o.innerHTML = `<div class="onb-card auth-card" id="waking" role="status"><div class="brandline">${logoSVG(26)} Deadline Tracker</div>
    <h1>Starting up…</h1><p class="lead">The server is waking up. This can take up to a minute the first time; the page will continue by itself.</p><span class="typing" aria-hidden="true"><i></i><i></i><i></i></span></div>`;
}
function hideWaking(){ const w = $("#waking"); if (w) { $("#onb").innerHTML = ""; $("#onb").hidden = true; } }
function showWakingFailed(){ toast("Couldn't reach the server, so your changes are saved in this browser only. Reload the page to try again.", null, null, "error"); }
async function apiJSON(method, url, body){
  const r = await fetch(url, { method, credentials: "same-origin", cache: "no-store", headers: body === undefined ? {} : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  let j = null; try { j = await r.json(); } catch (e) {}
  if (r.status === 401 && ACCOUNT.user && url !== "/api/auth/login") signedOut();
  return { ok: r.ok, status: r.status, json: j || {} };
}
function signedOut(){
  if (ACCOUNT.signedOutShown) return; ACCOUNT.signedOutShown = true;
  ACCOUNT.user = null; clearInterval(ACCOUNT.poll); showAuth("You were signed out. Please log in again.");
}

/* ---------- welcome page: sign up / log in ---------- */
const EYE = svg('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>');
const EYE_OFF = svg('<path d="M3 3l18 18"/><path d="M10.6 6.1A10.6 10.6 0 0 1 12 6c6.4 0 10 6 10 6a17 17 0 0 1-3.2 3.9M6.5 7.6A16.7 16.7 0 0 0 2 12s3.6 7 10 7a9.8 9.8 0 0 0 4.4-1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>');
// Decorative 3D scene. The sample cards are illustrations, clearly not the visitor's data.
function hero3dHTML(){
  return `<div class="hero3d" aria-hidden="true"><div class="scene">
    <div class="glow"></div>
    <div class="float-card fc-task" style="--z:60px;--d:0s"><span class="fc-dot" style="--c:#ff8a5c"></span><div><b>Lab report</b><small>Due Friday · 5:00 PM</small></div><span class="fc-chip risk">At risk</span></div>
    <div class="float-card fc-ring" style="--z:110px;--d:-2s"><svg viewBox="0 0 44 44"><circle cx="22" cy="22" r="18" class="trk"/><circle cx="22" cy="22" r="18" class="val" style="stroke-dasharray:113;stroke-dashoffset:36"/></svg><div><b>68%</b><small>This week</small></div></div>
    <div class="float-card fc-rem" style="--z:30px;--d:-4s">${IC.bell}<div><b>Reminder</b><small>Essay draft · in 1 hour</small></div></div>
    <div class="float-card fc-todo" style="--z:85px;--d:-1s"><div class="fc-line done"><i>${IC.check}</i>Read chapter 4</div><div class="fc-line done"><i>${IC.check}</i>Outline slides</div><div class="fc-line"><i></i>Practice talk</div></div>
  </div></div>`;
}
// 3D type (shared with the pitch): each word becomes a span that flips up; [word] gets the amber accent
function words3d(t){ let w = 0; return t.split(" ").map(x => { const hi = /^\[.*\]/.test(x); const txt = x.replace(/[\[\]]/g, ""); return `<span class="w3d${hi ? " grad" : ""}" style="--w:${w++}">${esc(txt)}</span>`; }).join(" "); }
// The log-in screen has four modes: log in, create account, forgot password (ask for a link), and reset
// (set a new password from the emailed link; the token is kept in memory and removed from the address bar).
function showAuth(note, switching, ok){
  $("#app").hidden = true; const o = $("#onb"); o.hidden = false; o.classList.add("auth");
  const mode = ACCOUNT.mode, login = mode === "login", signup = mode === "signup", forgot = mode === "forgot", reset = mode === "reset";
  const keep = ACCOUNT.keepEmail || ($("#au-email") ? $("#au-email").value : ""); ACCOUNT.keepEmail = "";
  const T = { login: ["Welcome back.", "Log in to see your tasks and deadlines.", "Log in"],
    signup: ["Create your account.", "Your tasks are saved to your account, so you can log in from any browser. Only you can see them.", "Create account"],
    forgot: ["Reset your password.", "Enter the email you signed up with. We'll send you a link to set a new password.", "Send reset link"],
    reset: ["Set a new password.", "Choose a new password for your account. You'll then log in with it on every device.", "Save new password"] }[mode];
  const pw = (id, label, auto, hint) => `<div class="field"><label for="${id}">${label}</label>
        <div class="pw-wrap"><input type="password" id="${id}" autocomplete="${auto}" minlength="8" maxlength="200" required ${hint ? `aria-describedby="${id}-hint"` : ""}>
        <button type="button" class="pw-eye" id="${id}-toggle" data-act="pwtoggle" aria-controls="${id}" aria-pressed="false" aria-label="Show password">${EYE}</button></div>
        ${hint ? `<span class="hint" id="${id}-hint">${hint}</span>` : ""}</div>`;
  o.innerHTML = `<div class="auth-wrap">
  <section class="landing">
    <div class="brandline">${logoSVG(30)} <span>Deadline Tracker</span></div>
    <h1${switching ? ' class="still"' : ""}>${words3d("Never miss a [deadline] again.")}</h1>
    <p class="lead">Tell it about your work. It builds your to-do list, shows what's at risk, and reminds you before things are due.</p>
    ${hero3dHTML()}
  </section>
  <div class="onb-card auth-card" role="main">
    <h1>${T[0]}</h1>
    <p class="lead">${T[1]}</p>
    <div class="auth-tabs" role="tablist" aria-label="Log in or create an account" data-v="${mode}"><span class="auth-pill" aria-hidden="true"></span>
      <button type="button" role="tab" data-act="authmode" data-v="login" aria-selected="${login}">Log in</button>
      <button type="button" role="tab" data-act="authmode" data-v="signup" aria-selected="${signup}">Create account</button>
    </div>
    <form id="authForm" class="auth-form" novalidate>
      ${signup ? `<div class="field"><label for="au-name">Your name</label><input type="text" id="au-name" autocomplete="name" maxlength="80" required></div>` : ""}
      ${reset ? "" : `<div class="field"><label for="au-email">Email</label><input type="email" id="au-email" autocomplete="email" inputmode="email" maxlength="200" required value="${esc(keep)}"></div>`}
      ${login ? pw("au-pass", "Password", "current-password") + `<button type="button" class="linkish auth-forgot" data-act="authforgot">Forgot password?</button>` : ""}
      ${signup ? pw("au-pass", "Password", "new-password", "At least 8 characters.") : ""}
      ${reset ? pw("au-pass", "New password", "new-password", "At least 8 characters.") + pw("au-pass2", "Type it again", "new-password") : ""}
      <p class="auth-err" id="authErr" role="alert" ${note ? "" : "hidden"}>${esc(note || "")}</p>
      <p class="auth-ok" id="authOk" role="status" ${ok ? "" : "hidden"}>${esc(ok || "")}</p>
      <button class="btn primary" type="submit" id="authGo">${T[2]}</button>
      ${forgot || reset ? `<div class="auth-links">${reset ? `<button type="button" class="linkish auth-forgot" data-act="authforgot">Ask for a new link</button>` : ""}<button type="button" class="linkish auth-forgot" data-act="authmode" data-v="login">Back to log in</button></div>` : ""}
    </form>
    <p class="auth-foot">${IC.info}<span>Passwords are stored securely as a hash. The AI key stays on the server.</span></p>
  </div>
  <ul class="features">
    <li><span class="fi" style="--c:#e8a06a">${IC.spark}</span><div><b>Type it the way you'd say it</b><span>"Essay due Fri 5pm" becomes a task with its date.</span></div></li>
    <li><span class="fi" style="--c:#ff8a5c">${IC.alert}</span><div><b>See what's at risk</b><span>It checks whether the work fits before each deadline.</span></div></li>
    <li><span class="fi" style="--c:#3ecf8e">${IC.bell}</span><div><b>Reminders that arrive</b><span>Even when the app is closed, from your account.</span></div></li>
  </ul>
</div>`;
  const f = signup ? $("#au-name") : reset ? $("#au-pass") : login && keep ? $("#au-pass") : $("#au-email"); if (f) f.focus();
  heroTilt();
  if (!switching) MOTION.authIntro();
}
// A gentle tilt of the 3D scene that follows the pointer (off with reduced motion and on touch screens).
function heroTilt(){
  const sc = $(".hero3d .scene"), wrap = $(".auth-wrap");
  if (!sc || !wrap || matchMedia("(prefers-reduced-motion: reduce)").matches || !matchMedia("(hover: hover)").matches) return;
  let raf = 0;
  wrap.addEventListener("pointermove", e => {
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = 0;
      const x = e.clientX / innerWidth - .5, y = e.clientY / innerHeight - .5;
      sc.style.setProperty("--ry", (-16 + x * 10).toFixed(2) + "deg"); sc.style.setProperty("--rx", (12 - y * 8).toFixed(2) + "deg"); });
  });
}
function togglePw(btn){
  const inp = $("#" + btn.getAttribute("aria-controls")); if (!inp) return;
  const show = inp.type === "password"; inp.type = show ? "text" : "password";
  btn.setAttribute("aria-pressed", String(show)); btn.setAttribute("aria-label", show ? "Hide password" : "Show password");
  btn.innerHTML = show ? EYE_OFF : EYE; inp.focus();
}
const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function authFail(msg, field){
  const err = $("#authErr"); err.textContent = msg; err.hidden = false;
  ["#au-name", "#au-email", "#au-pass", "#au-pass2"].forEach(id => { const el = $(id); if (el) { el.removeAttribute("aria-invalid"); if (el.getAttribute("aria-errormessage")) el.removeAttribute("aria-errormessage"); } });
  const el = field && $(field); if (el) { el.setAttribute("aria-invalid", "true"); el.setAttribute("aria-errormessage", "authErr"); el.focus(); }
}
async function submitAuth(){
  const mode = ACCOUNT.mode, login = mode === "login";
  const err = $("#authErr"), okEl = $("#authOk"), go = $("#authGo");
  if (okEl) okEl.hidden = true;
  const busy = on => { go.disabled = on; go.classList.toggle("busy", on); if (on) err.hidden = true; };
  const call = async (url, body) => { busy(true); let r; try { r = await apiJSON("POST", url, body); } catch (e) { r = { ok: false, json: { error: "Couldn't reach the server. Check your connection and try again." } }; } busy(false); return r; };
  if (mode === "forgot") {
    const email = $("#au-email").value.trim();
    if (!email) return authFail("Please enter your email.", "#au-email");
    if (!EMAIL_OK.test(email)) return authFail("Please enter a valid email address, like name@example.com.", "#au-email");
    const r = await call("/api/auth/forgot", { email });
    if (!r.ok) return authFail(r.json.error || "Something went wrong. Try again.", r.json.field === "email" ? "#au-email" : null);
    okEl.textContent = r.json.message || "If an account uses this email, we've sent it a reset link."; okEl.hidden = false; return;
  }
  if (mode === "reset") {
    const p1 = $("#au-pass").value, p2 = $("#au-pass2").value;
    if (p1.length < 8) return authFail("Use at least 8 characters for your password.", "#au-pass");
    if (p1 !== p2) return authFail("The two passwords don't match.", "#au-pass2");
    const r = await call("/api/auth/reset", { token: ACCOUNT.resetToken || "", password: p1 });
    if (!r.ok) return authFail(r.json.error || "Something went wrong. Try again.", r.json.field === "password" ? "#au-pass" : null);
    ACCOUNT.resetToken = null; ACCOUNT.mode = "login"; ACCOUNT.keepEmail = r.json.email || "";
    return showAuth(null, true, "Password changed. Log in with your new password.");
  }
  const name = login ? "" : $("#au-name").value.trim(), email = $("#au-email").value.trim(), password = $("#au-pass").value;
  // checks before sending (the server checks again)
  if (!login && !name) return authFail("Please enter your name.", "#au-name");
  if (!email) return authFail("Please enter your email.", "#au-email");
  if (!EMAIL_OK.test(email)) return authFail("Please enter a valid email address, like name@example.com.", "#au-email");
  if (!password) return authFail("Please enter your password.", "#au-pass");
  if (!login && password.length < 8) return authFail("Use at least 8 characters for your password.", "#au-pass");
  const body = { email, password, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone };
  if (!login) body.name = name;
  const r = await call(login ? "/api/auth/login" : "/api/auth/signup", body);
  if (!r.ok) {
    const code = r.json.code, field = { name: "#au-name", email: "#au-email", exists: "#au-email", password: "#au-pass", wrong: "#au-pass" }[r.json.field || code] || (code === "wrong" ? "#au-pass" : null);
    if (code === "wrong") $("#au-pass").value = "";
    return authFail(r.json.error || "Something went wrong. Try again.", field);
  }
  location.reload();
}
// A reset link opens the site at #reset=<token>. Keep the token in memory only and clear it from the address bar
// (so it isn't left in history or shown on screen).
function takeResetToken(){
  const m = /^#reset=([A-Za-z0-9_-]{20,100})/.exec(location.hash || "");
  if (!m) return false;
  ACCOUNT.resetToken = m[1]; ACCOUNT.mode = "reset";
  try { history.replaceState(null, "", location.pathname + location.search); } catch (e) { try { location.hash = ""; } catch (x) {} }
  return true;
}
async function changePassword(){
  const cur = $("#pw-cur").value, next = $("#pw-new").value, err = $("#pwErr"), go = $("#pwSave");
  const fail = (m, f) => { err.textContent = m; err.hidden = false; ["#pw-cur", "#pw-new"].forEach(x => $(x).removeAttribute("aria-invalid")); if (f) { $(f).setAttribute("aria-invalid", "true"); $(f).focus(); } };
  if (!cur) return fail("Please enter your current password.", "#pw-cur");
  if (next.length < 8) return fail("Use at least 8 characters for the new password.", "#pw-new");
  if (next === cur) return fail("The new password is the same as the current one.", "#pw-new");
  go.disabled = true; err.hidden = true;
  let r; try { r = await apiJSON("POST", "/api/profile/password", { currentPassword: cur, newPassword: next }); } catch (e) { r = { ok: false, json: { error: "Couldn't reach the server. Try again." } }; }
  go.disabled = false;
  if (!r.ok) return fail(r.json.error || "Couldn't change the password.", r.json.field === "currentPassword" ? "#pw-cur" : r.json.field === "newPassword" ? "#pw-new" : null);
  UI.pwOpen = false; render(); toast("Password changed. Other devices were signed out.");
}
async function logout(){
  // send any change that's still waiting to be saved before the session ends
  if (Store.mode === "server" && (ACCOUNT.pending || ACCOUNT.dirty || ACCOUNT.saving)) {
    clearTimeout(ACCOUNT.timer);
    for (let k = 0; k < 40 && ACCOUNT.saving; k++) await sleep(50);
    if (ACCOUNT.pending || ACCOUNT.dirty) { ACCOUNT.dirty = false; await flushServer(); }
  }
  await apiJSON("POST", "/api/auth/logout").catch(() => {});
  try { localStorage.removeItem(LS_V2); } catch (e) {}
  location.reload();
}

/* ---------- loading and saving your data ---------- */
async function initServerStore(){
  Store.mode = "server";
  let r = null;
  if (BOOT.state) { try { const x = await BOOT.state; if (x.ok) r = { ok: true, status: x.status, json: await x.json() }; } catch (e) {} BOOT.state = null; }
  if (!r) r = await apiJSON("GET", "/api/state");
  ACCOUNT.version = r.json.version || 0;
  state = r.json.state || null;
  // Used the app in this browser before having an account? Offer to bring that data in (once).
  const local = lsGet(LS_V2);
  if (!state && local && local.workspaces && local.workspaces.length) ACCOUNT.importable = local;
  if (!state) ONB.name = ONB.name || (ACCOUNT.user.name || "").split(" ")[0];
  ACCOUNT.poll = setInterval(pullServer, 20000);
  // keep the account's time zone in step with this device, so reminders arrive at the right local time
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (tz && ACCOUNT.user.timezone !== tz) apiJSON("PATCH", "/api/profile", { timezone: tz }).then(r => { if (r.ok) ACCOUNT.user = r.json.user; }).catch(() => {});
  pullNotifications(true); setInterval(pullNotifications, 30000);
  // a change made just before closing the tab is still sent
  window.addEventListener("pagehide", () => { if (ACCOUNT.pending && state) { try { fetch("/api/state", { method: "PUT", keepalive: true, credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ state, base: ACCOUNT.version }) }); } catch (e) {} } });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) pullServer(); });
}
function offerImport(){
  const L = ACCOUNT.importable; if (!L) return;
  const n = L.workspaces.reduce((a, w) => a + (w.items || []).length, 0);
  confirmModal("Bring your saved tasks into your account?", `This browser has ${n} task${n === 1 ? "" : "s"} in ${L.workspaces.length} workspace${L.workspaces.length === 1 ? "" : "s"} from before you had an account. Bring them in, or start fresh and leave them here.`, "Bring them in", async () => {
    state = fixImportIds(L); state.user = state.user || {}; state.user.name = state.user.name || (ACCOUNT.user.name || "").split(" ")[0];
    ACCOUNT.importable = null; ACCOUNT.importN = n; afterLoad();
    // The browser's copy is removed only after the account has really saved it (see flushServer). Before, it was
    // removed first, so a refused or failed save lost these tasks from both places.
    save(); await flushNow();
    if (ACCOUNT.importN) toast(`Your ${n} task${n === 1 ? "" : "s"} couldn't be saved to your account yet. They're still in this browser too, and the app keeps trying.`);
  });
  ACCOUNT.importable = null;
}
// Older saves can have short or repeated task ids that the server doesn't accept: give those new ids (and update
// "depends on" links) so everything can be saved.
function fixImportIds(L){
  const seen = new Set(), map = {};
  L.workspaces.forEach(w => (w.items || []).forEach(it => { if (typeof it.id !== "string" || !/^[\w.-]{3,64}$/.test(it.id) || seen.has(it.id)) { const old = it.id; it.id = rid("d-"); if (old != null) map[old] = it.id; } seen.add(it.id); }));
  if (Object.keys(map).length) L.workspaces.forEach(w => (w.items || []).forEach(it => { if (Array.isArray(it.dependsOn)) it.dependsOn = it.dependsOn.map(d => map[d] || d); }));
  return L;
}
function importSaved(){
  if (!ACCOUNT.importN) return;
  const n = ACCOUNT.importN; ACCOUNT.importN = 0;
  try { localStorage.removeItem(LS_V2); } catch (e) {}
  toast(`Brought ${n} task${n === 1 ? "" : "s"} into your account.`);
}
function saveServer(){ ACCOUNT.pending = true; clearTimeout(ACCOUNT.timer); ACCOUNT.timer = setTimeout(flushServer, 500); }
async function flushServer(){
  if (Store.mode !== "server" || !state) return;
  if (ACCOUNT.saving) { ACCOUNT.dirty = true; return; }
  ACCOUNT.saving = true; ACCOUNT.pending = false;
  try {
    const r = await apiJSON("PUT", "/api/state", { state: clone(state), base: ACCOUNT.version });
    if (r.ok) { ACCOUNT.version = r.json.version; importSaved(); if (UI.acctStats) { UI.acctStats.stale = true; if (UI.route === "reports") render({ soft: true }); } }
    else if (r.status === 409) {
      // Changed on another device since we loaded: show the newest copy rather than overwrite it.
      ACCOUNT.version = r.json.version; if (r.json.state) { state = r.json.state; afterLoad(); }
      toast("Your tasks were changed on another device, so this page now shows the latest version. Please check your last change.");
      ACCOUNT.dirty = false;
    } else if (r.status !== 401 && !ACCOUNT.warned) { ACCOUNT.warned = true; toast(r.json.error || "Couldn't save to your account. Your change will be retried.", null, null, "error"); ACCOUNT.dirty = true; }
  } catch (e) { if (!ACCOUNT.warned) { ACCOUNT.warned = true; toast("Couldn't reach the server, so your last change isn't saved yet. Keep this tab open; it will retry.", null, null, "error"); } ACCOUNT.dirty = true; }
  ACCOUNT.saving = false;
  if (ACCOUNT.dirty) { ACCOUNT.dirty = false; setTimeout(flushServer, 3000); }
}
async function pullServer(){
  if (Store.mode !== "server" || ACCOUNT.saving || ACCOUNT.pending || ACCOUNT.dirty) return;
  try {
    const r = await apiJSON("GET", "/api/state");
    if (r.ok && r.json.version > ACCOUNT.version && !ACCOUNT.saving) {
      ACCOUNT.version = r.json.version;
      if (r.json.state) { state = r.json.state; afterLoad(); }
    }
  } catch (e) {}
}

async function flushNow(){
  if (Store.mode !== "server") return;
  clearTimeout(ACCOUNT.timer);
  for (let k = 0; k < 60 && ACCOUNT.saving; k++) await sleep(50);
  if (ACCOUNT.pending || ACCOUNT.dirty) { ACCOUNT.dirty = false; await flushServer(); }
}
async function reloadFromServer(){
  const r = await apiJSON("GET", "/api/state");
  if (r.ok) { ACCOUNT.version = r.json.version || 0; if (r.json.state) { state = r.json.state; afterLoad(); pullNotifications(true); } }
}
// Workspace reminder settings -> the account's notification preferences used by the server's reminder job.
const PREF_CHOICES = [10080, 4320, 2880, 1440, 180, 60, 30, 15, 0];
function syncPrefs(){
  if (Store.mode !== "server") return;
  clearTimeout(ACCOUNT.prefTimer);
  ACCOUNT.prefTimer = setTimeout(() => {
    const s = W().settings;
    const before = [...new Set(s.reminders.concat(s.customReminder ? [s.customReminder] : []))].filter(m => PREF_CHOICES.includes(m)).slice(0, 6);
    apiJSON("PATCH", "/api/profile", { notifyPrefs: { before, overdue: !!s.overdueAlerts, dailySummary: s.dailySummary !== false, dueToday: s.dueToday !== false, highDone: s.highDone !== false, quietOn: !!s.quietOn, quietFrom: s.quietFrom, quietTo: s.quietTo } })
      .then(r => { if (r.ok) ACCOUNT.user = r.json.user; else toast(r.json.error || "Couldn't save your reminder settings.", null, null, "error"); }).catch(() => {});
  }, 400);
}
// Notifications come from the server's reminder job (they're created even while the app is closed).
async function pullNotifications(first){
  if (Store.mode !== "server" || !state) return;
  let r; try { r = await apiJSON("GET", "/api/notifications?limit=80"); } catch (e) { return; }
  if (!r.ok) return;
  const known = new Set((state.inbox || []).map(n => n.key));
  state.inbox = r.json.notifications.map(n => { const it = n.taskId && findItemAny(n.taskId);
    return { key: n.id, server: true, ws: it ? it.ws : null, for: null, itemId: n.taskId, kind: n.kind, text: n.message, t: n.deliveredAt || n.scheduledAt, read: n.read, dismissed: false }; });
  if (!first) state.inbox.filter(n => !known.has(n.key) && !n.read && Date.now() - Date.parse(n.t) < 10 * 60000).forEach(n => announce(n, Date.parse(n.t)));
  renderBell();
}
function findItemAny(id){ for (const w of state.workspaces) { if (w.items.some(i => i.id === id)) return { ws: w.id }; } return null; }
function markRead(ids){ if (Store.mode === "server") apiJSON("POST", "/api/notifications/read", ids === "all" ? { all: true } : { ids }).catch(() => {}); }
function dismissNotif(id){ if (Store.mode === "server") apiJSON("DELETE", "/api/notifications/" + encodeURIComponent(id)).catch(() => {}); }

/* ---------- email confirmation and Telegram (Settings → Notifications) ---------- */
async function loadChannels(){
  if (UI.channelsLoading) return; UI.channelsLoading = true; UI.channelsStale = false;
  try { const r = await apiJSON("GET", "/api/channels"); if (r.ok) { UI.channels = r.json; if (r.json.telegram.linked) UI.tgLink = null; if (UI.route === "prefs") render({ soft: true }); } } catch (e) {}
  UI.channelsLoading = false;
}
async function channelAction(act){
  const call = async (m, u) => { try { return await apiJSON(m, u); } catch (e) { return { ok: false, json: { error: "Couldn't reach the server. Try again." } }; } };
  if (act === "chverify") { const r = await call("POST", "/api/profile/verify-email"); toast(r.ok ? (r.json.already ? "Your email is already confirmed." : "Confirmation email sent. Open it and tap the button.") : r.json.error || "Couldn't send it."); }
  else if (act === "chtestemail") { const r = await call("POST", "/api/channels/email/test"); toast(r.ok ? "Test email sent. Check your inbox." : r.json.error || "Couldn't send it."); }
  else if (act === "tgtest") { const r = await call("POST", "/api/telegram/test"); toast(r.ok ? "Test message sent to Telegram." : r.json.error || "Couldn't send it."); }
  else if (act === "tgunlink") { const r = await call("DELETE", "/api/telegram"); if (r.ok) toast("Telegram disconnected."); else toast(r.json.error || "Couldn't disconnect."); UI.tgLink = null; }
  else if (act === "tglink") {
    const r = await call("POST", "/api/telegram/link");
    if (!r.ok) return toast(r.json.error || "Couldn't start connecting.");
    UI.tgLink = r.json; render({ soft: true });
    // check every 3 s, for as long as the link is valid, until the bot reports the chat as connected
    clearInterval(UI.tgPoll); const until = Date.parse(r.json.expiresAt);
    UI.tgPoll = setInterval(async () => {
      if (Date.now() > until || !UI.tgLink) { clearInterval(UI.tgPoll); UI.tgLink = null; return loadChannels(); }
      const s = await call("GET", "/api/channels");
      if (s.ok && s.json.telegram.linked) { clearInterval(UI.tgPoll); UI.tgLink = null; UI.channels = s.json; toast("Telegram connected."); if (UI.route === "prefs") render({ soft: true }); }
    }, 3000);
    return;
  }
  UI.channelsStale = true; loadChannels();
}
// Turn a channel or a kind of message on/off for email and Telegram.
const CH_PREF = { "ch-email": "email", "ch-tg": "telegram", "pf-deadline": "deadline", "pf-study": "study", "pf-account": "account" };
async function saveChannelPref(id, on){
  const k = CH_PREF[id]; if (!k || Store.mode !== "server") return;
  const r = await apiJSON("PATCH", "/api/profile", { notifyPrefs: { [k]: on } }).catch(() => ({ ok: false, json: {} }));
  if (r.ok) ACCOUNT.user = r.json.user; else toast(r.json.error || "Couldn't save that setting.");
}
// A confirm-email link opens the site at #verify=<token>: confirm it, then clear it from the address bar.
async function takeVerifyToken(){
  const m = /^#verify=([A-Za-z0-9_-]{20,100})/.exec(location.hash || ""); if (!m) return null;
  try { history.replaceState(null, "", location.pathname + location.search); } catch (e) { try { location.hash = ""; } catch (x) {} }
  let r; try { r = await apiJSON("POST", "/api/auth/verify-email", { token: m[1] }); } catch (e) { r = { ok: false, json: { error: "Couldn't reach the server. Open the link again." } }; }
  if (r.ok && ACCOUNT.user) { ACCOUNT.user.emailVerified = true; UI.channelsStale = true; }
  return r.ok ? `Email confirmed${r.json.email ? ` (${r.json.email})` : ""}. Reminders can now arrive there too.` : (r.json.error || "That confirmation link didn't work.");
}

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

/* =========================================================
   Motion (GSAP)
   One idea, used differently in each place: a panel keeps its full box
   while its visible edge travels (clip-path), and everything attached to
   that edge (the page, a handle, an arrow, labels) moves with it in the
   same timeline. Where it's used:
   - sidebar: collapse to an icon rail and back (the signature move)
   - Deadline AI window: a circle that grows out of its button
   - heads-up panel: unfolds downward, rows drop into place
   - section cards: rise and unfold from their top edge
   - log-in tabs: the pill slides, the form is revealed from that side
   With reduced motion, or if GSAP is missing, every change is instant.
   ========================================================= */
const MOTION = (() => {
  const G = window.gsap && typeof window.gsap.timeline === "function" ? window.gsap : null;
  const reduced = () => { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; } };
  const on = () => !!G && !reduced();
  // GSAP runs on our own clock (performance.now) and only while something moves: no idle animation loop.
  let base = 0, p0 = 0, busyUntil = 0, raf = 0;
  if (G) { G.ticker.remove(G.updateRoot); base = G.globalTimeline.time(); p0 = performance.now(); document.documentElement.classList.add("gs"); }
  const sync = () => G.updateRoot(base + (performance.now() - p0) / 1000);
  const loop = () => { sync(); raf = performance.now() < busyUntil ? requestAnimationFrame(loop) : 0; };
  const timeline = opts => { sync(); return G.timeline(opts); };
  const run = tl => { busyUntil = Math.max(busyUntil, performance.now() + tl.totalDuration() * 1000 + 120); if (!raf) raf = requestAnimationFrame(loop); return tl; };
  const busy = () => !!raf;
  const rectOf = el => el.getBoundingClientRect();

  /* ---------- 1. Sidebar rail ---------- */
  const WIDE = 248, RAIL = 76, CUT = WIDE - RAIL, RAIL_D = 0.62, RAIL_KEY = "dt-rail";
  const edge = r => `inset(0px ${r}px 0px 0px)`;
  const ARROW = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m14.5 6-6 6 6 6"/></svg>`;
  let railTl = null;
  const isRail = () => { const a = document.getElementById("app"); return !!a && a.classList.contains("rail"); };
  function railShell(){
    const app = document.getElementById("app"); if (!app || document.getElementById("railBtn")) return;
    app.insertAdjacentHTML("beforeend", `<button type="button" class="rail-handle" id="railBtn" data-act="rail" aria-controls="side">${ARROW}</button>`);
    let saved = false; try { saved = localStorage.getItem(RAIL_KEY) === "1"; } catch (e) {}
    applyRail(saved);
  }
  function applyRail(rail){
    const app = document.getElementById("app"), btn = document.getElementById("railBtn"); if (!app || !btn) return;
    app.classList.toggle("rail", rail);
    btn.setAttribute("aria-expanded", String(!rail));
    const l = rail ? "Expand the sidebar" : "Collapse the sidebar to icons";
    btn.setAttribute("aria-label", l); btn.title = l;
    if (G) G.set(btn.firstElementChild, { rotation: rail ? 180 : 0 });
  }
  function rail(want){
    const app = document.getElementById("app"), side = document.getElementById("side"), btn = document.getElementById("railBtn");
    if (!app || !side || !btn) return;
    const to = typeof want === "boolean" ? want : !isRail();
    if (to === isRail()) return;
    const main = app.querySelector(".main"), arrow = btn.firstElementChild;
    if (railTl) { railTl.progress(1).kill(); railTl = null; }
    const flips = [...side.querySelectorAll("[data-flip]")];
    const before = { main: rectOf(main).left, handle: rectOf(btn).left, at: flips.map(rectOf) };
    applyRail(to);
    try { localStorage.setItem(RAIL_KEY, to ? "1" : "0"); } catch (e) {}
    renderSide();
    if (!on()) return;
    const fresh = [...side.querySelectorAll("[data-flip]")];
    const tw = { duration: RAIL_D, ease: "power3.inOut" };
    const tl = railTl = timeline({ onComplete(){ G.set([side, main, btn, ...fresh], { clearProps: "clipPath,transform" }); railTl = null; } });
    // the side keeps its wide box while its edge travels
    tl.fromTo(side, { clipPath: edge(to ? 0 : CUT) }, { clipPath: edge(to ? CUT : 0), ...tw }, 0);
    // the page and the handle glide with the edge; the arrow turns over
    tl.fromTo(main, { x: before.main - rectOf(main).left }, { x: 0, ...tw }, 0);
    tl.fromTo(btn, { x: before.handle - rectOf(btn).left }, { x: 0, ...tw }, 0);
    tl.fromTo(arrow, { rotation: to ? 0 : 180 }, { rotation: to ? 180 : 0, ...tw }, 0);
    // whatever moved up, down or sideways follows (matched by its data-flip name)
    fresh.forEach(el => {
      const k = flips.findIndex(f => f.dataset.flip === el.dataset.flip); if (k < 0) return;
      const r = rectOf(el), dx = before.at[k].left - r.left, dy = before.at[k].top - r.top;
      if (Math.abs(dx) > .5 || Math.abs(dy) > .5) tl.fromTo(el, { x: dx, y: dy }, { x: 0, y: 0, ...tw }, 0);
    });
    // labels come back once the edge has passed them
    if (!to) tl.fromTo(side.querySelectorAll(".lbl"), { opacity: 0, x: -10 }, { opacity: 1, x: 0, duration: 0.45, ease: "power2.out", stagger: 0.012, clearProps: "opacity,transform" }, RAIL_D * 0.35);
    run(tl);
  }

  /* ---------- 2. Deadline AI window: a circle out of its button ---------- */
  let dwTl = null;
  function circleFrom(box, fab){
    const b = rectOf(box), f = rectOf(fab);
    const x = f.left + f.width / 2 - b.left, y = f.top + f.height / 2 - b.top;
    const r = Math.hypot(Math.max(x, b.width - x), Math.max(y, b.height - y)) + 2;
    return { at: `at ${x.toFixed(1)}px ${y.toFixed(1)}px`, r };
  }
  function dwOpen(box, fab){
    if (!on() || !box || !fab || box.hidden) return;
    if (dwTl) dwTl.kill(); box.inert = false;
    const c = circleFrom(box, fab);
    const tl = dwTl = timeline({ onComplete(){ G.set(box, { clearProps: "clipPath" }); dwTl = null; } });
    tl.fromTo(box, { clipPath: `circle(24px ${c.at})` }, { clipPath: `circle(${c.r.toFixed(1)}px ${c.at})`, duration: 0.62, ease: "expo.out" }, 0)
      .fromTo(box.querySelectorAll(".dw-h > *"), { opacity: 0, y: -10 }, { opacity: 1, y: 0, duration: 0.4, ease: "power2.out", stagger: 0.04, clearProps: "opacity,transform" }, 0.12)
      .fromTo(box.querySelector(".dw-tabs"), { opacity: 0, scaleX: 0.92 }, { opacity: 1, scaleX: 1, duration: 0.45, ease: "power3.out", clearProps: "opacity,transform" }, 0.18)
      .fromTo(box.querySelectorAll(".dw-msgs > *:nth-last-child(-n+3), .dw-in"), { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.45, ease: "power2.out", stagger: 0.05, clearProps: "opacity,transform" }, 0.24);
    run(tl);
  }
  function dwClose(box, fab, done){
    if (!on() || !box || box.hidden || !fab) { done(); return; }
    if (dwTl) dwTl.kill();
    box.inert = true;
    const c = circleFrom(box, fab);
    const tl = dwTl = timeline({ onComplete(){ box.inert = false; G.set(box, { clearProps: "clipPath" }); dwTl = null; done(); } });
    tl.fromTo(box, { clipPath: `circle(${c.r.toFixed(1)}px ${c.at})` }, { clipPath: `circle(24px ${c.at})`, duration: 0.4, ease: "power3.in" }, 0)
      .to(box.querySelectorAll(".dw-h > *, .dw-tabs, .dw-in"), { opacity: 0, duration: 0.2, ease: "power1.in" }, 0);
    run(tl);
  }

  /* ---------- 3. Heads-up panel: unfolds downward ---------- */
  function unfold(list, chev){
    if (!list) return;
    if (!on()) return;
    const h = list.offsetHeight, mt = getComputedStyle(list).marginTop;
    const tl = timeline({ onComplete(){ G.set([list, ...list.children, chev].filter(Boolean), { clearProps: "height,marginTop,clipPath,transform,opacity,overflow" }); } });
    list.dataset.rv = "1";
    tl.fromTo(list, { height: 0, marginTop: 0, overflow: "hidden", clipPath: "inset(0% 0% 100% 0%)" }, { height: h, marginTop: mt, clipPath: "inset(0% 0% 0% 0%)", duration: 0.55, ease: "power3.out" }, 0)
      .fromTo(list.children, { y: -18, opacity: 0, rotationX: -28, transformPerspective: 700, transformOrigin: "50% 0%" }, { y: 0, opacity: 1, rotationX: 0, duration: 0.5, ease: "back.out(1.4)", stagger: 0.06 }, 0.08)
      .call(() => delete list.dataset.rv);
    if (chev) tl.fromTo(chev, { rotation: 0 }, { rotation: 180, duration: 0.5, ease: "power3.inOut" }, 0);
    run(tl);
  }
  function fold(list, chev, done){
    if (!list || !on()) { done(); return; }
    list.dataset.rv = "1";
    const tl = timeline({ onComplete: done });
    tl.to(list.children, { y: -12, opacity: 0, duration: 0.22, ease: "power2.in", stagger: { each: 0.04, from: "end" } }, 0)
      .to(list, { height: 0, marginTop: 0, overflow: "hidden", clipPath: "inset(0% 0% 100% 0%)", duration: 0.42, ease: "power3.inOut" }, 0.08);
    if (chev) tl.fromTo(chev, { rotation: 180 }, { rotation: 0, duration: 0.42, ease: "power3.inOut" }, 0);
    run(tl);
  }

  /* ---------- 4. Section cards: rise and unfold from their top edge ---------- */
  let io = null;
  function reveal(els, delay){
    els = els.filter(Boolean); if (!els.length) return;
    els.forEach(el => { el.dataset.rv = "1"; });
    const tl = timeline({ onComplete(){ els.forEach(el => { delete el.dataset.rv; }); } });
    tl.fromTo(els, { clipPath: "inset(0% 0% 100% 0% round 16px)", y: 26, rotationX: -9, transformPerspective: 1100, transformOrigin: "50% 0%" },
      { clipPath: "inset(0% 0% 0% 0% round 16px)", y: 0, rotationX: 0, duration: 0.7, ease: "expo.out", stagger: 0.07, delay: delay || 0, clearProps: "clipPath,transform" }, 0);
    const heads = els.map(el => el.querySelector("h2, h3, .card-h")).filter(Boolean);
    if (heads.length) tl.fromTo(heads, { opacity: 0, x: -12 }, { opacity: 1, x: 0, duration: 0.45, ease: "power2.out", stagger: 0.07, clearProps: "opacity,transform" }, (delay || 0) + 0.14);
    run(tl);
  }
  function view(root){
    if (io) { io.disconnect(); io = null; }
    if (!root || !on()) return;
    const port = document.getElementById("view"), vh = port ? port.clientHeight : innerHeight;
    const blocks = [...root.children].filter(el => el.offsetHeight > 0);
    const seen = blocks.filter(el => el.getBoundingClientRect().top < (port ? port.getBoundingClientRect().top : 0) + vh);
    reveal(seen.slice(0, 8));
    const later = blocks.filter(el => !seen.includes(el));
    if (!later.length || !("IntersectionObserver" in window)) return;
    later.forEach(el => G.set(el, { clipPath: "inset(0% 0% 100% 0% round 16px)" }));
    io = new IntersectionObserver(es => es.forEach(e => { if (!e.isIntersecting) return; io.unobserve(e.target); reveal([e.target]); }), { root: port, threshold: 0.08 });
    later.forEach(el => io.observe(el));
  }

  /* ---------- 5. Log-in tabs: the pill slides, the form wipes in from that side ---------- */
  function authSwitch(prevPillLeft, toSignup){
    const pill = document.querySelector(".auth-pill"), form = document.getElementById("authForm"); if (!pill || !form || !on()) return;
    const tl = timeline({ onComplete(){ G.set([pill, form, ...form.children], { clearProps: "transform,clipPath,opacity" }); } });
    form.dataset.rv = "1";
    tl.fromTo(pill, { x: prevPillLeft - rectOf(pill).left }, { x: 0, duration: 0.5, ease: "power3.inOut" }, 0)
      .fromTo(form, { clipPath: toSignup ? "inset(0% 0% 0% 100%)" : "inset(0% 100% 0% 0%)" }, { clipPath: "inset(0% 0% 0% 0%)", duration: 0.6, ease: "power3.inOut" }, 0)
      .fromTo(form.children, { opacity: 0, x: toSignup ? 22 : -22 }, { opacity: 1, x: 0, duration: 0.45, ease: "power2.out", stagger: 0.045 }, 0.16)
      .fromTo(".auth-card > h1, .auth-card > p.lead", { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.4, stagger: 0.05, clearProps: "opacity,transform" }, 0.05)
      .call(() => delete form.dataset.rv);
    run(tl);
  }
  function authIntro(){
    const card = document.querySelector(".auth-card"); if (!card || !on()) return;
    card.dataset.rv = "1";
    const tl = timeline({ onComplete(){ delete card.dataset.rv; } });
    tl.fromTo(card, { clipPath: "inset(0% 100% 0% 0% round 24px)" }, { clipPath: "inset(0% 0% 0% 0% round 24px)", duration: 0.9, ease: "expo.inOut", clearProps: "clipPath" }, 0.1)
      .fromTo(card.children, { opacity: 0, x: -18 }, { opacity: 1, x: 0, duration: 0.5, ease: "power2.out", stagger: 0.06, clearProps: "opacity,transform" }, 0.4)
      .fromTo(".auth-wrap .features li", { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.5, ease: "power2.out", stagger: 0.08, clearProps: "opacity,transform" }, 0.6);
    run(tl);
  }

  return { on, busy, isRail, railShell, rail, dwOpen, dwClose, unfold, fold, view, authSwitch, authIntro };
})();
/* ---------- Landing page ("Portale" style), shown to logged-out visitors before the log-in card ----------
   A white loader counts to 100%, a sunset scene grows out of the centre with a glass Deadline Tracker card standing
   in it, and the copy blurs in word by word. Scrolling keeps the screen still while the camera moves in, the card
   turns to face you, lights up, fills with white and grows past the screen; the white becomes a second screen that
   leads to sign-up. The scene and both cards are drawn in code (no outside images). No GSAP needed: a small rAF
   loop drives it, so it also runs where GSAP isn't loaded. With reduced motion: no counter, no zoom, a cross-fade. */
const PT = {
  // Motion numbers (seconds, or fractions of the scroll progress p)
  COUNT_END: .5, COUNT_FADE: .5, GROW_AT: .6, GROW_DUR: .85, MARK_FADE: .7, LIGHT_AT: 1.05, DONE_AT: 2.5,
  DOLLY: .18, SCROLL_SCREENS: 1.5, SCRUB: .2,
  CORNERS: [[1738, 944], [2359, 994], [2359, 1984], [1738, 2052]],   // the glass card in the scene (4096 × 2640 units)
  W: 652, H: 1024,                                                    // card plane, upright (card px)
  state: { scale: 0, face: 0, flash: 0, p: 0 }, raf: 0, on: false
};
const ptSeg = (t, a, b) => Math.min(1, Math.max(0, (t - a) / (b - a)));
const ptInOut = t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
const ptLerpQ = (a, b, t) => a.map((p, i) => ({ x: p.x + (b[i].x - p.x) * t, y: p.y + (b[i].y - p.y) * t }));
const ptScaleQ = (q, c, s) => q.map(p => ({ x: c.x + (p.x - c.x) * s, y: c.y + (p.y - c.y) * s }));
const ptRect = (cx, cy, w, h) => [{ x: cx - w / 2, y: cy - h / 2 }, { x: cx + w / 2, y: cy - h / 2 }, { x: cx + w / 2, y: cy + h / 2 }, { x: cx - w / 2, y: cy + h / 2 }];
// A CSS matrix3d that maps the rectangle (0, 0, w, h) onto four corners (element with transform-origin 0 0).
function ptMatrix(w, h, [p0, p1, p2, p3]){
  const dx1 = p1.x - p2.x, dy1 = p1.y - p2.y, dx2 = p3.x - p2.x, dy2 = p3.y - p2.y;
  const sx = p0.x - p1.x + p2.x - p3.x, sy = p0.y - p1.y + p2.y - p3.y;
  const det = dx1 * dy2 - dx2 * dy1;
  const g = (sx * dy2 - dx2 * sy) / det, k = (dx1 * sy - sx * dy1) / det;
  const a = p1.x - p0.x + g * p1.x, b = p3.x - p0.x + k * p3.x, d = p1.y - p0.y + g * p1.y, e = p3.y - p0.y + k * p3.y;
  return `matrix3d(${[a / w, d / w, 0, g / w, b / h, e / h, 0, k / h, 0, 0, 1, 0, p0.x, p0.y, 0, 1].map(v => +v.toFixed(8)).join(",")})`;
}
const ptWords = (line, from) => line.split(" ").map((w, i) => `<span class="pt-w" data-word style="--i:${from + i}">${esc(w)}</span>`).join(" ");
const ptReduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
function portalWanted(){
  const q = location.search;
  return !/[?&]dt-test\b/.test(q) || /[?&]dt-landing\b/.test(q);
}

// The sunset scene (sky, sun, dunes, the glass card and its shadow), in the same 4096 × 2640 units as CORNERS.
function ptSceneSVG(){
  const c = PT.CORNERS.map(p => p.join(",")).join(" ");
  return `<svg class="pt-scene" viewBox="0 0 4096 2640" preserveAspectRatio="none" aria-hidden="true" focusable="false">
  <defs>
    <linearGradient id="ptSky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2a1720"/><stop offset=".26" stop-color="#5c2430"/><stop offset=".48" stop-color="#a8402a"/>
      <stop offset=".62" stop-color="#e07a38"/><stop offset=".7" stop-color="#f4ad62"/><stop offset=".76" stop-color="#fbd9a0"/></linearGradient>
    <radialGradient id="ptSun" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff7e2"/><stop offset=".18" stop-color="#ffe7b3" stop-opacity=".95"/><stop offset=".5" stop-color="#ffb867" stop-opacity=".35"/><stop offset="1" stop-color="#ff9a4a" stop-opacity="0"/></radialGradient>
    <linearGradient id="ptFar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c4643a"/><stop offset="1" stop-color="#8f3d22"/></linearGradient>
    <linearGradient id="ptMid" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9a4526"/><stop offset="1" stop-color="#5b2414"/></linearGradient>
    <linearGradient id="ptNear" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6c2d17"/><stop offset=".35" stop-color="#3d180d"/><stop offset="1" stop-color="#1c0a05"/></linearGradient>
    <linearGradient id="ptGlass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity=".34"/><stop offset=".45" stop-color="#ffe2bf" stop-opacity=".12"/><stop offset="1" stop-color="#ffffff" stop-opacity=".2"/></linearGradient>
    <linearGradient id="ptRefl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5c2430" stop-opacity=".25"/><stop offset=".6" stop-color="#f4ad62" stop-opacity=".3"/><stop offset="1" stop-color="#3d180d" stop-opacity=".35"/></linearGradient>
    <filter id="ptSoft" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="28"/></filter>
    <filter id="ptGrain"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .5 0"/></filter>
  </defs>
  <rect width="4096" height="2640" fill="url(#ptSky)"/>
  <circle cx="2980" cy="1780" r="900" fill="url(#ptSun)"/>
  <path d="M0 1840 C420 1760 820 1740 1260 1790 C1700 1840 2100 1720 2560 1735 C3020 1750 3500 1820 4096 1760 L4096 2640 L0 2640Z" fill="url(#ptFar)"/>
  <path d="M0 1990 C520 1890 980 1930 1480 1985 C1980 2040 2500 1900 3040 1925 C3500 1945 3800 2010 4096 1975 L4096 2640 L0 2640Z" fill="url(#ptMid)"/>
  <path d="M0 2190 C600 2080 1250 2130 1900 2105 C2550 2080 3200 2160 4096 2120 L4096 2640 L0 2640Z" fill="url(#ptNear)"/>
  <polygon points="1738,2052 2359,1984 1760,2205 1020,2330" fill="#140603" opacity=".42" filter="url(#ptSoft)"/>
  <polygon points="${c}" fill="url(#ptRefl)"/>
  <polygon points="${c}" fill="url(#ptGlass)" stroke="#ffffff" stroke-opacity=".55" stroke-width="5"/>
  <polygon points="2359,994 2384,1001 2384,1981 2359,1984" fill="#ffffff" opacity=".28"/>
  <rect width="4096" height="2640" filter="url(#ptGrain)" opacity=".06"/>
</svg>`;
}
// The card's light: a landscape face (1024 × 652) turned upright. White marks only.
function ptFaceHTML(){
  const day = new Date().toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }).replace(",", "").toUpperCase();
  return `<div class="pt-face">
      <svg class="pt-face-name" viewBox="0 0 448 78"><text x="0" y="62" textLength="448" lengthAdjust="spacingAndGlyphs">DEADLINE TRACKER</text></svg>
      <svg class="pt-face-mark" viewBox="0 0 64 64" fill="none" stroke="#fff" stroke-linecap="round"><circle cx="32" cy="33" r="21" stroke-width="3.5" stroke-opacity=".45"/><path d="M32 12 A21 21 0 1 1 13.8 22.5" stroke-width="3.5"/><path d="M23 33.5 29.5 40 42 26.5" stroke-width="3.5" stroke-linejoin="round"/></svg>
      <span class="pt-face-l">TODAY</span><span class="pt-face-r">${esc(day)}</span>
    </div>`;
}
function ptMarkup(){
  const mark = `<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false"><rect width="64" height="64" rx="16" fill="currentColor"/><circle cx="32" cy="33" r="17" fill="none" stroke="var(--pt-mark-ink)" stroke-opacity=".35" stroke-width="5"/><path d="M32 16 A17 17 0 1 1 17.28 24.5" fill="none" stroke="var(--pt-mark-ink)" stroke-width="5" stroke-linecap="round"/><path d="M24.5 33.5 30 39 40.5 27.5" fill="none" stroke="var(--pt-mark-ink)" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const word = cls => `<svg class="${cls}" viewBox="0 0 1400 192" aria-hidden="true" focusable="false"><text x="4" y="168" textLength="1392" lengthAdjust="spacingAndGlyphs">DEADLINE TRACKER</text></svg>`;
  const day = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  return `<div class="pt-track">
  <div><main class="pt-stage" id="ptStage">
    <div class="pt-loader" id="ptLoader">${word("pt-mark-big")}<div class="pt-count" id="ptCount">00%</div></div>
    <div class="pt-media" id="ptMedia"><div class="pt-photo" id="ptPhoto">${ptSceneSVG()}</div><div class="pt-plane pt-light" id="ptLight">${ptFaceHTML()}</div></div>
    <div class="pt-copy" id="ptCopy">
      <div class="pt-col">
        <p class="pt-badge" id="ptBadge"><i></i><span>Free for students, teams and personal use</span></p>
        <h1 class="pt-h1" id="ptTitle" aria-label="Every Deadline In One Calm Place"><span aria-hidden="true">${ptWords("Every Deadline", 0)}</span><span aria-hidden="true">${ptWords("In One Calm Place", 2)}</span></h1>
      </div>
      <div class="pt-buttons" id="ptButtons"><button type="button" class="pt-btn pt-btn-light" data-pt="signup">Get started free</button><button type="button" class="pt-btn pt-btn-line" data-pt="login">Log in</button></div>
      <p class="pt-lead" id="ptLead">Tell Deadline Tracker what you need to do. It builds your to-do list, tracks your progress and reminds you before anything is due.</p>
    </div>
    <div class="pt-over" id="ptOver"><div class="pt-plane pt-portal" id="ptPortal"><i class="pt-fill" id="ptFill"></i><i class="pt-rim" id="ptRim"></i></div></div>
    <section class="pt-ready" id="ptReady" aria-labelledby="ptReadyTitle">
      <div class="pt-r-mark pt-r-el">${word("pt-mark-wide")}</div>
      <div class="pt-r-cardbox"><div class="pt-r-float" id="ptFloat"><div class="pt-r-card" id="ptCardImg">
        <span class="pt-rc-mark">${mark}</span><span class="pt-rc-name">Deadline Tracker</span>
        <span class="pt-rc-list" aria-hidden="true"><i class="d"></i><b></b><i class="d"></i><b class="s"></b><i></i><b class="m"></b></span>
        <span class="pt-rc-l">YOUR DAY</span><span class="pt-rc-r">${esc(day.toUpperCase())}</span></div></div></div>
      <h2 class="pt-h2" id="ptReadyTitle" aria-label="Everything Planned Before It's Due"><span class="pt-h2a" aria-hidden="true">${ptWords("Everything Planned", 0)}</span><span class="pt-h2b" aria-hidden="true">${ptWords("Before It's Due", 2)}</span></h2>
      <p class="pt-r-text pt-r-el">Write tasks the way you'd say them. Deadline Tracker sorts your day, shows what's at risk, and keeps your progress for every day.</p>
      <button type="button" class="pt-btn pt-btn-ink pt-r-go pt-r-el" data-pt="signup">Create free account</button>
      <p class="pt-r-login pt-r-el">Already have an account? <button type="button" class="pt-link" data-pt="login">Log in</button></p>
    </section>
  </main></div></div>
  <header class="pt-nav" id="ptNav" data-theme="light">
    <a class="pt-logo" href="#" data-pt="top" aria-label="Deadline Tracker home">${mark}<span>Deadline Tracker</span></a>
    <div class="pt-nav-r"><button type="button" class="pt-pill pt-glass" data-pt="login">Log in</button><button type="button" class="pt-pill pt-cta" data-pt="signup">Get started</button></div>
  </header>
  <div class="pt-cursor" id="ptCursor" aria-hidden="true"></div>`;
}

function showPortal(){
  const el = $("#portal"); if (!el) return showAuth();
  el.innerHTML = ptMarkup(); el.hidden = false; el.dataset.intro = "load"; el.dataset.p = "0"; el.scrollTop = 0;
  const reduced = ptReduced(); el.classList.toggle("pt-reduced", reduced);
  document.documentElement.classList.add("pt-open");
  const S = PT.state; Object.assign(S, { scale: reduced ? 1 : 0, face: reduced ? 1 : 0, flash: 0, p: 0 });
  PT.on = true; PT.target = 0; PT.layoutDirty = true;
  const cnt = $("#ptCount"); let shown = 0, goal = 0;
  const setCount = n => { const v = Math.max(shown, Math.min(100, Math.round(n))); if (v !== shown || cnt.textContent === "00%") { shown = v; cnt.textContent = String(v).padStart(2, "0") + "%"; } };
  // Loading: the fonts (each weight) and the app; the counter follows progress × 0.9, never backwards.
  const jobs = ["300", "400", "500"].map(w => ptFont(w)); let done = 0;
  jobs.forEach(j => j.then(() => { done++; goal = done / (jobs.length + 1) * 90; }));
  const t0 = performance.now(); let tl = null, last = t0;
  const frame = now => {
    if (!PT.on) return;
    const dt = Math.min(64, now - last); last = now;
    if (!tl) { shown < goal && setCount(shown + Math.max(1, (goal - shown) * (1 - Math.pow(.6, dt / 100)))); }
    else ptIntro(now - tl, setCount, reduced);
    ptScroll(dt, reduced);
    ptDraw(reduced);
    PT.raf = requestAnimationFrame(frame);
  };
  Promise.all(jobs).then(() => { goal = 90; tl = performance.now(); PT.from = shown; });
  PT.raf = requestAnimationFrame(frame);
  ptBind(el);
}
// Wait for a Geist weight (or give up after 1.5 s: the system font is a fine fallback).
function ptFont(w){
  const go = () => document.fonts && document.fonts.load ? document.fonts.load(`${w} 1em "Geist"`) : Promise.resolve();
  return Promise.race([new Promise(r => setTimeout(r, 1500)), (async () => {
    for (let k = 0; k < 15 && ![...document.querySelectorAll('link[href*="family=Geist"]')].some(l => l.media === "all"); k++) await sleep(100);
    try { await go(); } catch (e) {}
  })()]);
}
const ptEase = { p1out: t => 1 - (1 - t) * (1 - t), p2out: t => 1 - Math.pow(1 - t, 3), p1in: t => t * t };
function ptKeys(vals, t){ const n = vals.length - 1, x = Math.min(n, Math.max(0, t * n)), i = Math.min(n - 1, Math.floor(x)); return vals[i] + (vals[i + 1] - vals[i]) * (x - i); }
// The intro timeline (ms since everything loaded).
function ptIntro(ms, setCount, reduced){
  const t = ms / 1000, S = PT.state, el = $("#portal"); if (!el) return;
  if (reduced) {
    if (el.dataset.intro === "load") el.dataset.intro = "play";
    if (t >= .45 && el.dataset.intro === "play") ptDone(el);
    return;
  }
  setCount(PT.from + (100 - PT.from) * ptEase.p1out(Math.min(1, t / PT.COUNT_END)));
  if (t >= PT.COUNT_FADE && el.dataset.intro === "load") el.dataset.intro = "play";   // CSS: counter and wordmark fade, copy blurs in with delays
  S.scale = ptEase.p2out(ptSeg(t, PT.GROW_AT, PT.GROW_AT + PT.GROW_DUR));
  if (t >= PT.LIGHT_AT) {
    S.face = ptKeys([0, .8, .15, 1, .55, 1], ptSeg(t, PT.LIGHT_AT, PT.LIGHT_AT + .45));
    S.flash = ptKeys([0, 1, 0], ptEase.p1out(ptSeg(t, PT.LIGHT_AT, PT.LIGHT_AT + .7)));
  }
  if (t >= PT.DONE_AT && el.dataset.intro === "play") ptDone(el);
}
function ptDone(el){ el.dataset.intro = "done"; Object.assign(PT.state, { scale: 1, face: 1, flash: 0 }); PT.layoutDirty = true; }
// Scroll progress, eased like a scrub; nothing moves until the intro is done.
function ptScroll(dt, reduced){
  const el = $("#portal"); if (!el || el.dataset.intro !== "done") return;
  const max = innerHeight * PT.SCROLL_SCREENS;
  PT.target = Math.min(1, Math.max(0, el.scrollTop / max));
  const S = PT.state, d = PT.target - S.p;
  if (Math.abs(d) < .0008) S.p = PT.target; else S.p += d * (1 - Math.exp(-dt / 1000 / (reduced ? .05 : PT.SCRUB)));
  el.dataset.p = S.p.toFixed(3);
}
function ptDraw(reduced){
  const S = PT.state, key = [S.scale, S.face, S.flash, S.p].map(v => v.toFixed(4)).join("|") + "|" + innerWidth + "x" + innerHeight;
  if (key === PT.lastKey && !PT.layoutDirty) return;
  PT.lastKey = key; PT.layoutDirty = false;
  const media = $("#ptMedia"), over = $("#ptOver"), photo = $("#ptPhoto"), light = $("#ptLight"), portal = $("#ptPortal"); if (!media || !photo) return;
  const p = reduced ? 0 : S.p;
  if (!reduced) { media.style.transform = over.style.transform = `scale(${S.scale})`; }
  const W = media.offsetWidth, H = media.offsetHeight, bx = photo.offsetLeft, by = photo.offsetTop, bw = photo.offsetWidth, bh = photo.offsetHeight;
  const base = PT.CORNERS.map(([x, y]) => ({ x: bx + x / 4096 * bw, y: by + y / 2640 * bh }));
  const c = { x: base.reduce((a, q) => a + q.x, 0) / 4, y: base.reduce((a, q) => a + q.y, 0) / 4 };
  const d = 1 + PT.DOLLY * ptInOut(ptSeg(p, 0, .7));
  photo.style.transformOrigin = `${c.x - bx}px ${c.y - by}px`; photo.style.transform = d === 1 ? "" : `scale(${d})`;
  const inPhoto = ptScaleQ(base, c, d);
  const h = (inPhoto[3].y - inPhoto[0].y + inPhoto[2].y - inPhoto[1].y) / 2 * 1.06;
  const turned = ptLerpQ(inPhoto, ptRect(c.x, c.y, h * PT.W / PT.H, h), ptInOut(ptSeg(p, 0, .45)));
  const coverH = Math.max(H, W * PT.H / PT.W) * 1.2;
  const quad = ptLerpQ(turned, ptRect(W / 2, H / 2, coverH * PT.W / PT.H, coverH), Math.pow(ptSeg(p, .5, .82), 3));
  light.style.transform = portal.style.transform = ptMatrix(PT.W, PT.H, quad);
  light.style.opacity = (S.face * (1 - ptSeg(p, .15, .4))).toFixed(3);
  $("#ptRim").style.opacity = Math.max(S.flash, ptSeg(p, .1, .4)).toFixed(3);
  $("#ptFill").style.opacity = ptSeg(p, .35, .62).toFixed(3);
  const copy = $("#ptCopy"); copy.style.transform = reduced ? "" : `translateY(calc(-120 * ${ptSeg(p, .2, .8).toFixed(4)} * var(--u)))`;
  // second screen
  const rp = reduced ? ptSeg(S.p, .3, .6) : ptSeg(p, .79, .81), ready = $("#ptReady");
  ready.style.opacity = rp.toFixed(3); ready.style.visibility = rp > 0 ? "visible" : "hidden";
  if (reduced) copy.style.opacity = (1 - rp).toFixed(3);
  else if (innerWidth < 1024) copy.style.opacity = (1 - ptSeg(p, .15, .45)).toFixed(3);   // phones: the copy is at the top, under the nav; fade it as it rises
  const showIn = reduced ? S.p >= .6 : S.p >= .8, showOut = reduced ? S.p < .3 : S.p < .74;
  if (showIn && !ready.classList.contains("in")) ready.classList.add("in");
  else if (showOut && ready.classList.contains("in")) ready.classList.remove("in");
  $("#ptNav").dataset.theme = (reduced ? S.p >= .6 : S.p >= .76) ? "dark" : "light";
}
function ptBind(el){
  const ro = new ResizeObserver(() => { PT.layoutDirty = true; }); ro.observe($("#ptMedia")); ro.observe($("#ptPhoto")); PT.ro = ro;
  el.onclick = e => {
    const b = e.target.closest("[data-pt]"); if (!b) return;
    e.preventDefault();
    if (b.dataset.pt === "top") { el.scrollTo({ top: 0, behavior: ptReduced() ? "auto" : "smooth" }); return; }
    if (typeof sfx === "function") sfx("tap");
    closePortal(b.dataset.pt === "signup" ? "signup" : "login");
  };
  // pointer tilt for the second screen's card, and the glass cursor disc (mouse only)
  const fine = matchMedia("(hover: hover) and (pointer: fine)").matches, cur = $("#ptCursor");
  let cx = -100, cy = -100, tx = -100, ty = -100, rx = 0, ry = 0, seen = false, lt = performance.now();
  el.onpointermove = e => {
    tx = e.clientX; ty = e.clientY;
    if (fine && !seen) { seen = true; cx = tx; cy = ty; cur.classList.add("on"); }
    ry = (e.clientX / innerWidth - .5) * 2 * 8; rx = -(e.clientY / innerHeight - .5) * 2 * 6;
  };
  el.onmouseout = e => { if (!e.relatedTarget) { cur.classList.remove("on"); seen = false; } };
  if (fine) document.documentElement.classList.add("pt-fine");
  const card = $("#ptCardImg"); let crx = 0, cry = 0;
  const loop = now => {
    if (!PT.on) return;
    const dt = now - lt; lt = now;
    if (fine && seen) { const k = 1 - Math.pow(.7, dt / 16.67); cx += (tx - cx) * k; cy += (ty - cy) * k; cur.style.transform = `translate(${cx}px, ${cy}px) translate(-50%, -50%)`; }
    if (card && !ptReduced()) { const k = 1 - Math.pow(.05, dt / 800); crx += (rx - crx) * k; cry += (ry - cry) * k; card.style.setProperty("--rx", crx.toFixed(2) + "deg"); card.style.setProperty("--ry", cry.toFixed(2) + "deg"); }
    PT.raf2 = requestAnimationFrame(loop);
  };
  PT.raf2 = requestAnimationFrame(loop);
}
function closePortal(mode){
  const el = $("#portal"); if (!el || el.hidden) return;
  ACCOUNT.mode = mode;
  showAuth();                       // the log-in card is built underneath, then the landing fades away
  el.classList.add("pt-leaving");
  const end = () => {
    PT.on = false; cancelAnimationFrame(PT.raf); cancelAnimationFrame(PT.raf2); if (PT.ro) PT.ro.disconnect();
    el.hidden = true; el.innerHTML = ""; el.classList.remove("pt-leaving", "pt-reduced"); el.onclick = el.onpointermove = el.onmouseout = null;
    document.documentElement.classList.remove("pt-open", "pt-fine");
    const f = mode === "signup" ? $("#au-name") : $("#au-email"); if (f) f.focus();
  };
  if (ptReduced()) end(); else setTimeout(end, 380);
}

VIEWS.all = () => viewList(false);
PAGE.all = "All deadlines";
const _navFor = navFor;
function routeAllowed(r){ const w = W(); return _navFor(w).some(x => x[0] === r) || (r === "all" && w.mode === "company" && canManage(w)); }
setRoute = function(r, push = true){
  if (r === "todo") UI.todoTab = UI.todoTab || "today"; // To-Do now lives on Today
  UI.route = routeAllowed(r) ? r : "overview";
  if (push) { try { if (location.hash !== "#" + UI.route) location.hash = UI.route; } catch (e) {} }
  UI.animate = true; closeNotif(); render();
  const v = $("#view"); if (v) v.scrollTop = 0;
};
const listRoute = () => { const w = W(); return w.mode === "company" ? (canManage(w) ? "all" : "mywork") : "deadlines"; };

/* =========================================================
   Toast, burst, modal helpers
   ========================================================= */
let toastT = null, undoFn = null;
/* Sounds: tiny tones made with Web Audio (no files). Silent until the first click or key press (browsers require it),
   never while typing, and switched off in Settings (remembered on this device). */
const SND_KEY = "dt-sound";
const SFX = { ctx: null, on: true, armed: false, last: 0, log: [] };
try { SFX.on = localStorage.getItem(SND_KEY) !== "off"; } catch (e) {}
function tone(c, t0, f, dur, gain, type, f2){
  const o = c.createOscillator(), g = c.createGain(); o.type = type || "sine";
  o.frequency.setValueAtTime(f, t0); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
  g.gain.setValueAtTime(.0001, t0); g.gain.exponentialRampToValueAtTime(gain, t0 + .008); g.gain.exponentialRampToValueAtTime(.0001, t0 + dur);
  o.connect(g).connect(c.destination); o.start(t0); o.stop(t0 + dur + .02);
}
function sfx(kind){
  if (!SFX.on || !SFX.armed) return;
  const t = performance.now(); if (kind === "click" && t - SFX.last < 70) return; SFX.last = t;
  SFX.log.push(kind); if (SFX.log.length > 50) SFX.log.shift();
  try {
    const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
    const c = SFX.ctx || (SFX.ctx = new C()); if (c.state === "suspended") c.resume();
    const s = c.currentTime + .005;
    if (kind === "click") tone(c, s, 1900, .04, .035, "sine", 1400);
    else if (kind === "success") { tone(c, s, 784, .14, .05); tone(c, s + .075, 1175, .22, .045); }
    else if (kind === "error") { tone(c, s, 311, .14, .05, "triangle", 277); tone(c, s + .1, 233, .2, .045, "triangle", 208); }
  } catch (e) {}
}
["pointerdown", "keydown"].forEach(ev => document.addEventListener(ev, () => { SFX.armed = true; }, { capture: true, once: true }));
// A soft click for anything you press that acts; fields, typing and scrolling stay silent.
document.addEventListener("click", e => {
  const b = e.target.closest && e.target.closest("button, [role=button], [role=tab], a[data-route], a[href], summary, [data-act]");
  if (!b || b.disabled || b.matches("input, textarea, select, label") || b.closest("[data-nosfx]")) return;
  sfx("click");
}, true);
function toast(msg, undo, label, kind){
  if (kind === "error") sfx("error"); else if (kind === "success") sfx("success");
  $("#toast").classList.toggle("err", kind === "error"); $("#toast").classList.toggle("ok", kind === "success");
  $("#toastMsg").textContent = msg; undoFn = undo || null;
  const b = $("#toastUndo"); b.hidden = !undo; b.textContent = label || "Undo";
  $("#toast").classList.add("on"); clearTimeout(toastT);
  toastT = setTimeout(() => { $("#toast").classList.remove("on"); undoFn = null; }, undo ? 6500 : 4200);
}
function burst(el){
  if (!el || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const r = el.getBoundingClientRect(); const b = document.createElement("div"); b.className = "burst";
  b.style.left = r.left + r.width / 2 + "px"; b.style.top = r.top + r.height / 2 + "px";
  const cols = ["var(--ok)", "var(--accent)", "var(--att)", "var(--crit)"];
  for (let k = 0; k < 12; k++) { const i = document.createElement("i"); const a = k / 12 * Math.PI * 2; const d = 26 + Math.random() * 22; i.style.setProperty("--dx", Math.cos(a) * d + "px"); i.style.setProperty("--dy", Math.sin(a) * d + "px"); i.style.setProperty("--c", cols[k % 4]); b.appendChild(i); }
  document.body.appendChild(b); setTimeout(() => b.remove(), 800);
}
let modalKind = null, lastFocus = null;
function openModal(kind, html, wide){
  if (!modalKind) lastFocus = document.activeElement;
  modalKind = kind;
  const m = $("#modal"); m.className = "modal" + (wide ? " wide" : ""); m.innerHTML = html;
  $("#modalWrap").classList.add("on");
  setTimeout(() => { const f = m.querySelector("[data-autofocus]") || m.querySelector("input,textarea,select,button"); if (f) f.focus(); }, 40);
}
function closeModal(){
  modalKind = null; $("#modalWrap").classList.remove("on"); UI.rescue = null;
  if (lastFocus && document.contains(lastFocus)) { try { lastFocus.focus(); } catch (e) {} }
}
const mHead = (title, extra = "") => `<div class="m-h"><h2 id="modalTitle">${title}</h2>${extra}<button class="ib" type="button" data-act="mclose" aria-label="Close">${IC.x}</button></div>`;
function confirmModal(title, body, okLabel, onOk, danger){
  UI.onConfirm = onOk;
  openModal("confirm", `${mHead(esc(title))}<div class="m-b"><p>${body}</p></div><div class="m-f"><button class="btn ghost" type="button" data-act="mclose">Cancel</button><button class="btn ${danger ? "danger" : "primary"}" type="button" data-act="confirmok" data-autofocus>${esc(okLabel)}</button></div>`);
}

/* =========================================================
   Mutations
   ========================================================= */
function replaceItem(w, obj){ const k = w.items.findIndex(x => x.id === obj.id); if (k >= 0) w.items[k] = obj; else w.items.push(obj); }
function touch(it){ it.updatedAt = nowIso(); }
function addRepeat(due, rep){
  const d = new Date(due);
  if (rep === "daily") d.setDate(d.getDate() + 1);
  else if (rep === "weekly") d.setDate(d.getDate() + 7);
  else if (rep === "monthly") { const day = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + 1); d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())); }
  return toLocalIso(d);
}
function completeItem(id, el){
  const w = W(); const it = findItem(id); if (!it) return;
  if (!canEditItem(w, it)) { toast("Only the assignee or a manager can change this.", null, null, "error"); return; }
  if (isDone(it)) {
    const before = clone(it);
    it.status = progressOf({ ...it, status: "todo" }) > 0 ? "doing" : "todo"; it.doneAt = null; touch(it);
    logItem(w, it, `Reopened "${it.title}"`); save(); render();
    toast(`"${it.title}" is active again.`, () => { replaceItem(w, before); save(); render(); });
    return;
  }
  if (w.mode === "company" && it.needsApproval && !canManage(w)) { openDrawer(id, "proof"); toast("Add your evidence, then submit it for review."); return; }
  const before = clone(it); let spawned = null;
  it.status = "done"; it.doneAt = nowIso(); touch(it);
  if (it.approval && it.approval.state === "pending") { it.approval.state = "approved"; it.approval.history.unshift({ t: nowIso(), by: viewerId(w), text: "Approved" }); }
  if (it.repeat && it.repeat !== "none" && !it.spawnedNext && (it.due || it.plan)) {
    // the next one keeps the same shape: a deadline repeats its deadline, a planned task its day
    const next = it.due ? { kind: "deadline", due: addRepeat(it.due, it.repeat) } : { kind: "todo", plan: addRepeat(it.plan + "T12:00", it.repeat).slice(0, 10), time: it.time, reminders: it.reminders };
    spawned = mkItem(w, Object.assign({ title: it.title, type: it.type, groupId: it.groupId, notes: it.notes, estimate: it.estimate, priority: it.priority, assignee: it.assignee, reviewer: it.reviewer, needsApproval: it.needsApproval, repeat: it.repeat,
      milestones: (it.milestones || []).map(m => ({ ...m, id: rid("m"), done: false, date: null })) }, next));
    w.items.push(spawned); it.spawnedNext = spawned.id;
  }
  const late = !!it.due && new Date(it.doneAt) > new Date(it.due);
  logItem(w, it, `Completed "${it.title}"${late ? " after the deadline" : ""}`);
  burst(el); save(); render(); celebrateIfAllDone(w);
  toast(spawned ? (spawned.due ? `Done. The next one is due ${fmtDate(spawned.due)}.` : `Done. The next one is on ${fmtDate(spawned.plan + "T12:00")}.`) : `Nice. "${it.title}" is done${late || !it.due ? "" : " on time"}.`, () => {
    replaceItem(w, before); if (spawned) w.items = w.items.filter(x => x.id !== spawned.id); save(); render();
  }, undefined, "success");
}
function deleteItem(id){
  const w = W(); const it = findItem(id); if (!it) return;
  const idx = w.items.indexOf(it); const before = clone(it);
  w.items.splice(idx, 1);
  w.items.forEach(x => { if (x.dependsOn) x.dependsOn = x.dependsOn.filter(d => d !== id); });
  closeDrawer(); save(); render();
  toast(`Deleted "${it.title}".`, () => { w.items.splice(idx, 0, before); save(); render(); });
}
function setStatus(id, st){
  const w = W(); const it = findItem(id); if (!it || it.status === st) return;
  if (!canEditItem(w, it)) { toast("You can only move your own cards.", null, null, "error"); return; }
  if (st === "done") { completeItem(id); return; }
  if (st === "review") { if (!canManage(w) || !it.evidence) { openDrawer(id, "proof"); toast("Add evidence and submit it for review."); return; } }
  const before = clone(it); const from = STATUSES[it.status];
  if (isDone(it)) it.doneAt = null;
  it.status = st; touch(it);
  logItem(w, it, `Moved "${it.title}" from ${from} to ${STATUSES[st]}`); save(); render();
  toast(`Moved to ${STATUSES[st]}.`, () => { replaceItem(w, before); save(); render(); });
}
function moveDue(id, dayKey){
  const w = W(); const it = findItem(id); if (!it || !canEditItem(w, it)) return;
  if (!it.due) { if (it.plan === dayKey) return; const before = moveTodo(it, dayKey); save(); render(); toast(`Planned for ${fmtDate(dayKey + "T12:00")}.`, () => { replaceItem(w, before); save(); render(); }); return; }
  const old = new Date(it.due); if (ymd(old) === dayKey) return;
  const before = clone(it);
  it.due = `${dayKey}T${pad(old.getHours())}:${pad(old.getMinutes())}`; touch(it);
  logItem(w, it, `Moved the deadline of "${it.title}" from ${fmtDate(old)} to ${fmtDate(it.due)}`); save(); render();
  toast(`Deadline moved to ${fmtDue(it.due)}.`, () => { replaceItem(w, before); save(); render(); });
}
function reassign(id, to){
  const w = W(); const it = findItem(id); const m = memberOf(w, to); if (!it || !m) return;
  const before = clone(it); const from = memberOf(w, it.assignee);
  it.assignee = to; touch(it); logItem(w, it, `Reassigned "${it.title}" from ${from ? from.name : "nobody"} to ${m.name}`); save(); render();
  toast(`Reassigned to ${m.name}.`, () => { replaceItem(w, before); save(); render(); });
}
function submitReview(id, link, note){
  const w = W(); const it = findItem(id); if (!it) return;
  it.evidence = { link: link || "", note: note || "", at: nowIso(), by: viewerId(w) };
  it.status = "review"; it.progress = Math.max(it.progress || 0, 100); touch(it);
  it.approval = it.approval || { state: "pending", history: [] }; it.approval.state = "pending";
  it.approval.history.unshift({ t: nowIso(), by: viewerId(w), text: "Submitted for review" + (note ? `: ${note}` : "") });
  logItem(w, it, `Submitted "${it.title}" for review`); UI.forceNotice = true; save(); render();
  toast("Submitted. Your manager will see it in Approvals.");
}
function decide(id, approve, note){
  const w = W(); const it = findItem(id); if (!it || !canManage(w)) return;
  it.approval = it.approval || { state: "pending", history: [] };
  if (approve) { it.approval.state = "approved"; it.status = "done"; it.doneAt = it.doneAt || nowIso(); it.approval.history.unshift({ t: nowIso(), by: viewerId(w), text: "Approved" + (note ? `: ${note}` : "") }); logItem(w, it, `Approved "${it.title}"`); }
  else { it.approval.state = "changes"; it.status = "doing"; it.approval.history.unshift({ t: nowIso(), by: viewerId(w), text: "Requested changes" + (note ? `: ${note}` : "") }); logItem(w, it, `Requested changes on "${it.title}"`); }
  touch(it); save(); render();
  toast(approve ? `Approved "${it.title}".` : "Changes requested. It's back with the assignee.");
}

/* =========================================================
   Drawer
   ========================================================= */
function openDrawer(id, tab){
  UI.drawerId = id; UI.drawerTab = tab || "overview";
  renderDrawer();
  $("#drawer").classList.add("on"); $("#scrim").classList.add("on"); $("#drawer").setAttribute("aria-hidden", "false");
  setTimeout(() => { const c = $("#drClose"); if (c) c.focus({ preventScroll: true }); }, 60);
}
function closeDrawer(){
  UI.drawerId = null;
  $("#drawer").classList.remove("on"); $("#scrim").classList.remove("on"); $("#drawer").setAttribute("aria-hidden", "true");
}
function renderDrawer(){
  const el = $("#drawer");
  if (!UI.drawerId) return;
  const w = W(); const it = findItem(UI.drawerId);
  if (!it) { closeDrawer(); return; }
  if (isTodo(it)) { el.innerHTML = todoDrawerHTML(w, it); return; }
  const { now, R } = CTX; const lv = levelOf(R, it); const g = groupOf(w, it.groupId);
  const can = canEditItem(w, it); const dis = can ? "" : "disabled";
  const tabs = [["overview", "Overview"], ["plan", `Plan<span class="cnt">${(it.milestones || []).length}</span>`], ["proof", w.mode === "company" ? "Review" : "Proof"], ["activity", "Activity"]];
  const d = new Date(it.due);
  let body = "";
  if (UI.drawerTab === "overview") {
    const reasons = isDone(it) ? [`Completed ${fmtDue(it.doneAt || it.updatedAt)}${it.doneAt && new Date(it.doneAt) > new Date(it.due) ? `, ${Math.max(1, Math.round((new Date(it.doneAt) - new Date(it.due)) / DAY))} day(s) after the deadline` : ", before the deadline"}.`] : (R[it.id] || { reasons: [] }).reasons;
    const others = w.items.filter(x => x.id !== it.id && !isDone(x) && !(it.dependsOn || []).includes(x.id));
    body = `
      <div class="why lv-${lv}"><div class="wh"><b>${LV[lv]}</b><span class="mono" style="margin-left:auto;font-size:13px;font-weight:600;color:var(--rc)" ${isDone(it) ? "" : `data-cd="${esc(it.due)}"`}>${isDone(it) ? "" : countdown(it.due, now)}</span></div>
        <ul>${reasons.map(r => `<li>${esc(r)}</li>`).join("")}</ul>
        <div class="row-flex"><span class="tiny">Deadline Radar · a transparent rule, not AI</span>${!isDone(it) && ["critical", "overdue"].includes(lv) && can ? `<button class="btn xs" type="button" data-act="rescue" data-id="${it.id}" style="margin-left:auto">${IC.rescue}Open Rescue mode</button>` : ""}</div></div>
      ${it.extension ? `<div class="ext-box" id="extBox">${it.extension.status === "approved" ? `<span>${IC.check.replace("<svg", '<svg width="14" height="14"')}</span><p>Deadline extended from <b>${fmtDue(it.originalDue)}</b> to <b>${fmtDue(it.due)}</b>.</p>`
        : it.extension.status === "declined" ? `<p>Extension to ${fmtDate(it.extension.requested + "T12:00")} was declined. Your deadline is still <b>${fmtDue(it.due)}</b>.</p>`
        : `<p><b>Extension requested</b> to ${fmtDate(it.extension.requested + "T12:00")} (asked ${fmtDate(it.extension.at)}). Did they agree?</p>${can ? `<div class="row-flex"><button class="btn sm primary" type="button" data-act="extyes">Yes, move my deadline</button><button class="btn sm" type="button" data-act="extno">No</button></div>` : ""}`}</div>` : ""}
      ${can ? "" : `<p class="note">${IC.info}<span>Only the assignee or a manager can edit this deadline.</span></p>`}
      <div class="f2"><div class="field"><label for="dr-date">Hard deadline</label><input type="date" id="dr-date" value="${ymd(d)}" ${dis}></div><div class="field"><label for="dr-time">Time</label><input type="time" id="dr-time" value="${pad(d.getHours())}:${pad(d.getMinutes())}" ${dis}></div></div>
      ${isDone(it) ? "" : `<div class="field"><label for="dr-plan">Work on it (optional)</label><input type="date" id="dr-plan" value="${it.plan || ""}" ${dis}><p class="muted" style="font-size:12px">Puts it on that day's list. The deadline stays the same.</p></div>`}
      <div class="f2">
        <div class="field"><label for="dr-pri">Priority</label><select id="dr-pri" ${dis}>${Object.keys(PRI).map(p => `<option value="${p}" ${it.priority === p ? "selected" : ""}>${PRI[p].label}</option>`).join("")}</select></div>
        <div class="field"><label for="dr-status">Status</label><select id="dr-status" ${dis}>${Object.keys(STATUSES).filter(s => w.mode === "company" || s !== "review" || it.status === "review").map(s => `<option value="${s}" ${it.status === s ? "selected" : ""}>${STATUSES[s]}</option>`).join("")}</select></div>
      </div>
      ${w.mode === "company" ? `<div class="f2">
        <div class="field"><label for="dr-assignee">Responsible</label><select id="dr-assignee" ${canManage(w) ? "" : "disabled"}>${w.members.map(m => `<option value="${m.id}" ${it.assignee === m.id ? "selected" : ""}>${esc(m.name)}</option>`).join("")}</select></div>
      </div>` : ""}
      <div class="f2">
        <div class="field"><label for="dr-est">Estimated effort (hours)</label><input type="number" id="dr-est" min="0" max="500" step="0.5" value="${it.estimate ?? ""}" placeholder="e.g. 4" ${dis}>${(() => { const ins = !isDone(it) && estimateInsight(w, it.type); if (!ins) return ""; const sug = it.estimate ? ins.suggest(it.estimate) : null; return `<p class="note est-hint" id="drEstHint">${IC.spark}<span>${esc(ins.text)}${sug && sug !== Number(it.estimate) && can ? ` <button class="more-btn" id="drEstUse" type="button" data-act="drestuse" data-v="${sug}">Use ${fmtH(sug)}</button>` : ""}</span></p>`; })()}</div>
        <div class="field"><label for="dr-prog">Progress${(it.milestones || []).length ? " (from plan steps)" : ""}</label><div class="prog-row"><input type="range" id="dr-prog" min="0" max="100" step="5" value="${progressOf(it)}" ${(it.milestones || []).length || !can ? "disabled" : ""}><output class="mono" id="dr-prog-o">${progressOf(it)}%</output></div></div>
      </div>
      ${it.loggedMin ? `<p class="muted" style="font-size:12.5px">Focus time logged: ${fmtH(it.loggedMin / 60)}</p>` : ""}
      <div class="field"><label for="dr-notes">Notes</label><textarea id="dr-notes" rows="4" placeholder="Requirements, who to send it to, anything useful" ${dis}>${esc(it.notes || "")}</textarea></div>
      <button class="more-btn" id="drMore" type="button" data-act="drmore" aria-expanded="${!!UI.drMore}" aria-controls="drMoreBox">More details ${IC.chev}</button>
      <div class="more-box" id="drMoreBox" ${UI.drMore ? "" : "hidden"}>
        <div class="f2">
        <div class="field"><label for="dr-type">Type</label><select id="dr-type" ${dis}>${TYPES_BY_MODE[w.mode].concat(TYPES_BY_MODE[w.mode].includes(it.type) ? [] : [it.type]).map(t => `<option value="${t}" ${it.type === t ? "selected" : ""}>${TYPES[t]}</option>`).join("")}</select></div>
        <div class="field"><label for="dr-group">${GROUP_WORD[w.mode]}</label><select id="dr-group" ${dis}><option value="">None</option>${w.groups.map(x => `<option value="${x.id}" ${it.groupId === x.id ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select></div>
        </div>
        <div class="f2">
        <div class="field"><label for="dr-repeat">Repeats</label><select id="dr-repeat" ${dis}>${[["none", "Does not repeat"], ["daily", "Every day"], ["weekly", "Every week"], ["monthly", "Every month"]].map(([v, l]) => `<option value="${v}" ${it.repeat === v ? "selected" : ""}>${l}</option>`).join("")}</select></div>
        </div>
        ${w.mode === "company" ? `<div class="f2">
        <div class="field"><label for="dr-reviewer">Reviewer</label><select id="dr-reviewer" ${canManage(w) ? "" : "disabled"}><option value="">None</option>${w.members.map(m => `<option value="${m.id}" ${it.reviewer === m.id ? "selected" : ""}>${esc(m.name)}</option>`).join("")}</select></div>
        <div class="field"><span class="lbl">Approval</span><label class="toggle" style="margin-top:6px"><input type="checkbox" id="dr-needs" ${it.needsApproval ? "checked" : ""} ${canManage(w) ? "" : "disabled"}>Needs approval</label></div>
        </div>` : ""}
      <div class="field"><span class="lbl">Waiting on</span>
        <div class="deps">${(it.dependsOn || []).map(id => { const x = findItem(id, w); if (!x) return ""; return `<span class="dep${isDone(x) ? "" : " open"}">${isDone(x) ? "✓ " : ""}<a href="#" data-act="open" data-id="${x.id}" style="color:inherit">${esc(x.title)}</a>${can ? `<button type="button" data-act="depdel" data-dep="${x.id}" aria-label="Remove dependency">×</button>` : ""}</span>`; }).join("") || `<span class="muted" style="font-size:13px">Nothing. Add a task this one depends on.</span>`}</div>
        ${can && others.length ? `<select id="dr-dep" aria-label="Add a dependency"><option value="">Add a dependency…</option>${others.map(x => `<option value="${x.id}">${esc(x.title)}</option>`).join("")}</select>` : ""}</div>
      <div class="field"><label for="dr-link">${w.mode === "student" ? "Submission link" : "Link"}</label><input type="url" id="dr-link" value="${esc(it.link || "")}" placeholder="https://" ${dis}></div>
      ${can ? `<button class="btn ghost sm" type="button" data-act="dlremove" style="justify-self:start">Remove the deadline (keep the task)</button>` : ""}
      </div>`;
  } else if (UI.drawerTab === "plan") {
    const ms = it.milestones || [];
    const sug = UI.sugg[it.id];
    const P = planFor(w, now, it.assignee || "me", 21);
    const sess = P.days.map(d => ({ d, s: d.sessions.find(x => x.id === it.id) })).filter(x => x.s);
    body = `
      <div class="row-flex"><span class="ring-wrap"><span class="ring big" style="--p:${progressOf(it)}"></span><span>${progressOf(it)}%</span></span>
        <div><b style="font-size:15px">${ms.filter(m => m.done).length} of ${ms.length} steps done</b><p class="muted" style="font-size:13px">${it.estimate ? `${fmtH(remainingH(it))} of ${fmtH(it.estimate)} left` : "No estimate yet"}</p></div></div>
      <ul class="ms">${ms.map(m => `<li><input type="checkbox" id="ms-c-${m.id}" data-act="mstoggle" data-ms="${m.id}" ${m.done ? "checked" : ""} ${dis} aria-label="Done"><input type="text" id="ms-t-${m.id}" data-mstext="${m.id}" value="${esc(m.text)}" ${dis} aria-label="Step"><input type="number" id="ms-h-${m.id}" data-mshours="${m.id}" value="${m.hours ?? 1}" min="0.25" step="0.25" ${dis} aria-label="Hours"><button class="ib del" type="button" data-act="msdel" data-ms="${m.id}" aria-label="Remove step" ${dis}>${IC.trash}</button></li>`).join("") || `<li class="muted" style="background:transparent;grid-template-columns:1fr;font-size:13px">No steps yet. Add your own or let the planner suggest some.</li>`}</ul>
      ${can ? `<div class="grow"><input type="text" id="ms-new" placeholder="Add a step and press Enter" maxlength="120" style="flex:1"><button class="btn sm" type="button" data-act="msadd">Add</button></div>` : ""}
      ${can ? `<div class="sug-box"><div class="sh"><span class="sug-tag">Suggestion</span>Backward plan</div>
        ${!it.estimate ? `<p class="muted" style="font-size:13px">How much work is this? Add an estimate and the plan works backwards from your deadline.</p><div class="row-flex">${[2, 4, 8, 12].map(h => `<button class="btn xs" type="button" data-act="setest" data-id="${it.id}" data-v="${h}">${h}h</button>`).join("")}</div>`
          : sug ? `<ul class="ms">${sug.map((s, k) => `<li class="sug" style="grid-template-columns:auto minmax(0,1fr) 62px 128px"><input type="checkbox" id="sg-k-${k}" data-sk="${k}" ${s.keep ? "checked" : ""} aria-label="Keep this step"><input type="text" id="sg-t-${k}" data-st="${k}" value="${esc(s.text)}" aria-label="Step"><input type="number" id="sg-h-${k}" data-sh="${k}" value="${s.hours}" min="0.25" step="0.25" aria-label="Hours"><input type="date" id="sg-d-${k}" data-sd="${k}" value="${s.date}" aria-label="Target date"></li>`).join("")}</ul>
            <div class="row-flex"><button class="btn sm primary" type="button" data-act="sugaccept">Add ${sug.filter(s => s.keep).length} steps to plan</button><button class="btn sm ghost" type="button" data-act="sugdiscard">Discard</button></div>
            <p class="note">${IC.info}<span>Built from your ${fmtH(it.estimate)} estimate and the deadline, with a buffer before it. Nothing is saved until you add it, and your hard deadline doesn't change.</span></p>`
          : `<p class="muted" style="font-size:13px">Split ${fmtH(it.milestones && it.milestones.length ? remainingH(it) : it.estimate)} of work into steps with target dates before ${fmtDate(it.due)}.</p><button class="btn sm" type="button" data-act="suggest" style="justify-self:start">${IC.spark}Suggest a backward plan</button>`}
      </div>` : ""}
      <div class="field"><span class="lbl">Scheduled sessions (from the planner)</span>
        ${sess.length ? `<div class="deps">${sess.map(x => `<span class="dep">${x.d.date.toLocaleDateString(undefined, { weekday: "short", day: "numeric" })} · ${fmtH(x.s.h)}</span>`).join("")}</div>` : `<p class="muted" style="font-size:13px">${it.estimate ? (P.short[it.id] ? `Doesn't fit: about ${fmtH(P.short[it.id])} short.` : "Nothing left to schedule.") : "Add an estimate to schedule work sessions."}</p>`}
      </div>`;
  } else if (UI.drawerTab === "proof") {
    const ev = it.evidence; const ap = it.approval;
    const evBox = ev ? `<div class="ev-box" style="background:var(--surface-2);border-radius:10px;padding:10px 12px;display:grid;gap:4px;font-size:13px"><b>Recorded ${fmtDue(ev.at)} ${new Date(ev.at) <= new Date(it.due) ? `<span class="pill pr-low" style="color:var(--ok)">Before deadline</span>` : `<span class="pill pr-high">After deadline</span>`}</b>${ev.link ? `<a href="${esc(ev.link)}" target="_blank" rel="noopener" style="color:var(--accent);overflow-wrap:anywhere">${esc(ev.link)}</a>` : ""}${ev.note ? `<span>${esc(ev.note)}</span>` : ""}${w.mode === "company" ? `<span class="muted">By ${esc((memberOf(w, ev.by) || {}).name || "")}</span>` : ""}</div>` : "";
    if (w.mode === "company" && (it.needsApproval || ap)) {
      body = `<p class="muted" style="font-size:13px">${it.reviewer ? `Reviewer: ${esc((memberOf(w, it.reviewer) || {}).name || "")}` : "Any manager can review."}</p>
        ${ap ? `<div class="row-flex"><span class="lbl muted" style="font-size:12.5px;font-weight:600">Status</span><span class="pill ${ap.state === "approved" ? "pr-low" : ap.state === "changes" ? "pr-medium" : "pr-medium"}" style="${ap.state === "approved" ? "color:var(--ok)" : ""}">${ap.state === "approved" ? "Approved" : ap.state === "changes" ? "Changes requested" : "Waiting for review"}</span></div>` : ""}
        ${evBox}
        ${it.status !== "review" && !isDone(it) && can ? `<div class="field"><label for="ev-link">Link to the work</label><input type="url" id="ev-link" placeholder="https://"></div><div class="field"><label for="ev-note">Note for the reviewer</label><textarea id="ev-note" rows="3" placeholder="What changed, what to look at"></textarea></div><button class="btn primary" type="button" data-act="submitreview" style="justify-self:start">Submit for review</button>` : ""}
        ${it.status === "review" && canManage(w) ? `<div class="field"><label for="ap-note">Note (optional)</label><textarea id="ap-note" rows="2" placeholder="Feedback for ${esc((memberOf(w, it.assignee) || {}).name || "the assignee")}"></textarea></div><div class="row-flex"><button class="btn primary" type="button" data-act="approve">Approve</button><button class="btn" type="button" data-act="changes">Request changes</button></div>` : ""}
        ${it.status === "review" && !canManage(w) ? `<p class="note">${IC.info}<span>Waiting for a manager to review.</span></p>` : ""}
        <div class="field"><span class="lbl">Submission history</span><ul class="hist">${(ap ? ap.history : []).map(h => `<li>${fmtDue(h.t)} · ${esc((memberOf(w, h.by) || {}).name || "")}: ${esc(h.text)}</li>`).join("") || "<li>No submissions yet.</li>"}</ul></div>`;
    } else {
      body = `<p class="muted" style="font-size:13px">${w.mode === "student" ? "Keep a record of what you submitted and when: the link, a note, and the time are saved." : "Record proof that this is done: a link, a note and the time."}${w.mode === "company" ? " This task doesn't need approval. A manager can turn that on in Overview." : ""}</p>
        ${evBox}
        ${can ? `<div class="field"><label for="ev-link">${w.mode === "student" ? "Submission link or file location" : "Link"}</label><input type="url" id="ev-link" value="${esc(ev ? ev.link : it.link || "")}" placeholder="https://"></div>
        <div class="field"><label for="ev-note">Note</label><textarea id="ev-note" rows="3" placeholder="${w.mode === "student" ? "e.g. Uploaded PDF, confirmation number 4821" : "Anything worth remembering"}">${esc(ev ? ev.note : "")}</textarea></div>
        <p class="note">${IC.info}<span>File uploads need storage on a server; for now, paste a link to where the file lives.</span></p>
        <button class="btn primary" type="button" data-act="recordproof" style="justify-self:start">${isDone(it) ? "Update record" : "Record submission & mark done"}</button>` : ""}`;
    }
  } else {
    body = `<ul class="act-log">${(it.log || []).map(l => `<li><div>${esc(l.text)}<time>${fmtDue(l.t)}</time></div></li>`).join("")}<li><div>Created<time>${fmtDue(it.createdAt)}</time></div></li></ul>`;
  }
  const primary = isDone(it) ? `<button class="btn" type="button" data-act="toggle" data-id="${it.id}" ${dis}>Reopen</button>`
    : (w.mode === "company" && it.needsApproval && !canManage(w)) ? (it.status === "review" ? `<button class="btn" type="button" disabled>In review</button>` : `<button class="btn primary" type="button" data-act="tab" data-v="proof">Submit for review</button>`)
    : `<button class="btn primary" type="button" data-act="toggle" data-id="${it.id}" ${dis}>${IC.check.replace('width', 'w')}Mark as done</button>`;
  el.innerHTML = `
    <div class="dr-h">
      <div class="dr-top">${isDone(it) ? riskBadge("done") : riskBadge(lv)}${g ? `<span class="chip" style="--c:${g.color}"><i></i>${esc(g.name)}</span>` : ""}<span class="chip">${TYPES[it.type] || "Task"}</span><span class="sp"></span>
        <button class="ib" type="button" id="drClose" data-act="drclose" aria-label="Close details">${IC.x}</button></div>
      <input class="dr-title" id="dr-title" value="${esc(it.title)}" aria-label="Title" ${dis}>
      <div class="tabs" role="tablist">${tabs.map(([k, l]) => `<button type="button" role="tab" data-act="tab" data-v="${k}" aria-selected="${UI.drawerTab === k}">${l}</button>`).join("")}</div>
    </div>
    <div class="dr-b">${body}</div>
    <div class="dr-f">${can && (canManage(w) || it.assignee === viewerId(w)) ? `<button class="btn ghost danger sm" type="button" data-act="delete" data-id="${it.id}">${IC.trash}Delete</button>` : ""}<span class="sp"></span>
      ${!isDone(it) && can ? `<button class="btn sm" type="button" data-act="focus" data-id="${it.id}">${IC.play}Focus</button>` : ""}
      ${!isDone(it) && ["critical", "overdue", "risk"].includes(lv) && can ? `<button class="btn sm" type="button" data-act="rescue" data-id="${it.id}">${IC.rescue}Rescue</button>` : ""}
      ${primary}</div>`;
}

/* =========================================================
   Add box: one place to add tasks and deadlines (Home, To-Do, N / +, calendar days)
   Same reading as the assistant's offline rules. Enter saves with Undo.
   ========================================================= */
const AB = { drafts: {}, day: null, ph: null, who: {} };
// The day a task without a date goes to: the calendar day it was opened from, otherwise today.
const addDay = id => (id === "qaText" && AB.day) || ymd(Date.now());
function addBoxHTML(id, o = {}){
  const ph = o.placeholder || "Add a task or deadline… e.g. Essay due Fri 5pm";
  return `<form class="addbox" data-addbox="${id}"><span class="ab-ico" aria-hidden="true">${IC.plus}</span>
      <textarea id="${id}" class="ab-input" rows="1" placeholder="${esc(ph)}" aria-label="Add a task or deadline" aria-describedby="${id}-hint" autocomplete="off" ${o.autofocus ? "data-autofocus" : ""}>${esc(AB.drafts[id] || "")}</textarea>
      <span class="ab-btns">${W().mode === "company" && canManage(W()) ? `<label class="sr" for="${id}-who">For</label><select id="${id}-who" class="ab-who" data-abwho="${id}" title="Who it's for">${W().members.map(m => `<option value="${m.id}" ${(AB.who[id] || viewerId(W())) === m.id ? "selected" : ""}>${m.id === viewerId(W()) ? "For me" : `For ${esc(m.name.split(" ")[0])}`}</option>`).join("")}</select>` : ""}<button class="btn primary" type="submit" id="${id}-go">Add</button>${o.ask === false ? "" : `<button class="btn ghost" type="button" data-act="abask" id="${id}-ask">${IC.spark}<span>Ask the assistant</span></button>`}</span>
    </form><p class="ab-hint" id="${id}-hint" aria-live="polite">${addHint(id)}</p>`;
}
// The manager's "For" picker applies unless the text names someone ("assign to Karan", "@karan").
function addActions(id){
  const w = W(); const t = (AB.drafts[id] || "").trim(); if (!t) return [];
  const who = w.mode === "company" && canManage(w) ? AB.who[id] : null;
  return extractTasks(t, w, Date.now()).map(a => (who && who !== viewerId(w) && !a.assignee && !a.assigneeMiss ? Object.assign(a, { assignee: who }) : a));
}
// One line per thing found: what it is, when, and for whom. Nothing is saved yet.
function addHint(id){
  const acts = addActions(id); const now = Date.now(); const w = W();
  if (!(AB.drafts[id] || "").trim()) return `Say <b>due</b> for a deadline. No date means today. Separate several with commas.`;
  if (!acts.length) return "Type what you need to do.";
  const day = d => d === ymd(now) ? "Today" : d === ymd(addDays(startOfDay(now), 1)) ? "Tomorrow" : fmtDate(d + "T12:00");
  const line = a => {
    const bits = [`<b>${esc(a.title)}</b>`];
    if (a.isDeadline) bits.push(`<span class="ab-dl">${IC.flag}Deadline ${esc(fmtDate(a.date + "T12:00"))}, ${esc(fmtTime(`${a.date}T${a.time || "23:59"}`))}</span>`);
    else bits.push(esc(day(a.date || addDay(id))) + (a.time ? `, ${esc(fmtTime(`${a.date || addDay(id)}T${a.time}`))}` : ""));
    const m = a.assignee && memberOf(w, a.assignee); if (m) bits.push(`for ${esc(m.name)}`);
    if (a.estimate) bits.push(`~${fmtH(a.estimate)}`);
    if (a.repeat && a.repeat !== "none") bits.push(`repeats ${a.repeat}`);
    if (a.assigneeMiss) bits.push(`<span class="ab-warn">No one called ${esc(a.assigneeMiss)}</span>`);
    return bits.join(" · ");
  };
  return acts.length === 1 ? line(acts[0]) : `<span class="ab-n">${acts.length} things:</span> ${acts.map(line).join(`<span class="ab-sep"> | </span>`)}`;
}
function refreshAddHint(id){ const h = document.getElementById(id + "-hint"); if (h) h.innerHTML = addHint(id); }
function submitAddBox(id){
  const w = W(); const acts = addActions(id);
  const el = document.getElementById(id);
  if (!acts.length) { toast("Type what you need to do.", null, null, "error"); if (el) el.focus(); return; }
  const made = acts.map(a => { const it = taskFromAction(w, a, { day: addDay(id) }); logItem(w, it, `Added "${it.title}"`); return it; });
  AB.drafts[id] = ""; if (el) { el.value = ""; el.style.height = ""; }
  const inModal = id === "qaText"; if (inModal) closeModal();
  save(); render(); refreshAddHint(id);
  const one = made[0]; const now = Date.now();
  const where = it => it.due ? `due ${fmtDue(it.due)}` : `for ${it.plan === ymd(now) ? "today" : it.plan === ymd(addDays(startOfDay(now), 1)) ? "tomorrow" : fmtDate(it.plan + "T12:00")}`;
  toast(made.length === 1 ? `Added "${one.title}" ${where(one)}.` : `Added ${made.length} things.`, () => { const ids = made.map(x => x.id); W().items = W().items.filter(x => !ids.includes(x.id)); save(); render(); }, undefined, "success");
  if (!inModal) setTimeout(() => { const i = document.getElementById(id); if (i) i.focus({ preventScroll: true }); }, 0);
}
function askFromAddBox(id){
  const t = (AB.drafts[id] || "").trim(); if (!t) { toast("Type what you want to ask the assistant.", null, null, "error"); return; }
  AB.drafts[id] = ""; if (modalKind) closeModal();
  setRoute("assistant"); sendToAssistant(t);
}
function openQuickAdd(preset = {}){
  AB.day = preset.date || null; AB.drafts.qaText = "";
  const title = preset.date ? `Add to ${fmtDate(preset.date + "T12:00", { weekday: "long", day: "numeric", month: "short" })}` : "Add";
  const ph = preset.type === "exam" ? "e.g. Maths midterm 20 Nov 10am" : preset.date ? "e.g. Call the bank, or Lab file due 5pm" : undefined;
  openModal("qa", `${mHead(esc(title))}<div class="m-b">${addBoxHTML("qaText", { autofocus: true, placeholder: ph })}
    <p class="note">${IC.info}<span>Tips: <b>~2h</b> effort, <b>!high</b> priority, <b>#subject</b>${W().mode === "company" ? ", <b>@name</b> or “assign to Rahul”" : ""}, <b>every week</b>. Shift+Enter for a new line.</span></p></div>`);
}

/* =========================================================
   Rescue mode
   ========================================================= */
function openRescue(id){
  const w = W(); const it = findItem(id); if (!it) return;
  const now = Date.now();
  const dueMs = new Date(it.due).getTime();
  const target = dueMs > now + DAY ? ymd(it.due) : ymd(addDays(now, 2));
  UI.rescue = { id, chunks: chunkPlan(it, now), target, done: {}, ext: target, note: "" };
  closeDrawer();
  renderRescue();
}
function rescueSchedule(it, w, targetKey){
  const now = Date.now(); const end = new Date(targetKey + "T21:00").getTime();
  let rem = remainingH(it) || (Number(it.estimate) || 2) * (1 - progressOf(it) / 100) || 1;
  const hpd = w.mode === "company" ? ((memberOf(w, it.assignee) || {}).capacity || 40) / Math.max(1, w.settings.workdays.length) : w.settings.hoursPerDay;
  const out = []; let d = startOfDay(now);
  while (d.getTime() <= end && rem > .01 && out.length < 30) {
    if (w.settings.workdays.includes(d.getDay()) || out.length === 0) {
      const cap = ymd(d) === ymd(now) ? Math.max(.5, hpd * clamp((startOfDay(now).getTime() + 22 * HOUR - now) / (14 * HOUR), 0, 1)) : hpd;
      const h = Math.min(rem, Math.round(cap * 4) / 4); if (h >= .25) { out.push({ date: ymd(d), h }); rem -= h; }
    }
    d = addDays(d, 1);
  }
  return { out, short: rem > .05 ? rem : 0 };
}
function renderRescue(){
  const S = UI.rescue; if (!S) return;
  const w = W(); const it = findItem(S.id); if (!it) { closeModal(); return; }
  const now = Date.now(); const R = radar(w, now); const lv = levelOf(R, it);
  const blockers = (it.dependsOn || []).map(id => findItem(id, w)).filter(x => x && !isDone(x));
  const sch = rescueSchedule(it, w, S.target);
  const me = memberOf(w, viewerId(w)); const mgr = canManage(w);
  const toWhom = w.mode === "student" ? "[Teacher's name]" : w.mode === "company" ? ((memberOf(w, it.reviewer || "me") || {}).name || "[Manager]") : "[Name]";
  const msg = S.msg ?? `Hi ${toWhom},\n\nI'm working on "${it.title}", due ${fmtDue(it.due)}. I've finished about ${progressOf(it)}% so far${remainingH(it) ? ` and have roughly ${fmtH(remainingH(it))} of work left` : ""}${blockers.length ? `; part of it is waiting on "${blockers[0].title}"` : ""}.\n\nCould I have until ${fmtDate(S.ext + "T12:00", { weekday: "long", day: "numeric", month: "long" })} to finish it properly?\n\nThank you,\n${(me && me.name) || state.user.name || ""}`;
  const loads = w.mode === "company" ? w.members.map(m => ({ m, L: weekLoad(w, now, m.id) })).sort((a, b) => a.L.pct - b.L.pct) : [];
  const step = (n, key, title, desc, inner) => `<div class="rstep${S.done[key] ? " doneStep" : ""}"><div class="rh"><span class="rn">${S.done[key] ? "✓" : n}</span><b>${title}</b></div><p>${desc}</p>${inner}</div>`;
  let n = 0;
  const html = `${mHead(`Rescue plan`)}
    <div class="m-b">
      <div class="why lv-${lv}"><div class="wh"><b>${esc(it.title)}</b><span class="risk lv-${lv}" style="margin-left:auto">${LV[lv]}</span></div><ul>${(R[it.id] ? R[it.id].reasons : []).slice(0, 3).map(r => `<li>${esc(r)}</li>`).join("")}</ul></div>
      <p class="muted" style="font-size:13px">Pick what helps. Nothing here changes your recorded deadline on its own.</p>
      <div class="rescue-steps">
        ${step(++n, "chunk", "Break the remaining work into small steps", "Smaller steps are easier to start and finish in the time you have.",
          `<ul class="ms">${S.chunks.map(c => `<li style="grid-template-columns:minmax(0,1fr) auto"><span class="mt">${esc(c.text)}</span><span class="md">${fmtH(c.hours)} · by ${fmtDate(c.date + "T12:00")}</span></li>`).join("")}</ul><div class="row-flex"><button class="btn sm" type="button" data-act="rsChunk" ${S.done.chunk ? "disabled" : ""}>Add these steps to the plan</button></div>`)}
        ${step(++n, "sched", "Make a revised schedule", "Plan focused sessions from today until a target finish.",
          `<div class="row-flex"><label for="rs-target" style="font-size:13px;font-weight:600;color:var(--muted)">Target finish</label><input type="date" id="rs-target" value="${S.target}" min="${ymd(now)}"></div>
           <div class="deps">${sch.out.map(x => `<span class="dep">${fmtDate(x.date + "T12:00", { weekday: "short", day: "numeric" })} · ${fmtH(x.h)}</span>`).join("")}</div>
           ${sch.short ? `<p style="color:var(--crit);font-size:13px">Still about ${fmtH(sch.short)} short. Pick a later target, add hours, or ask for an extension.</p>` : ""}
           ${S.target > ymd(it.due) ? `<p class="muted" style="font-size:12.5px">This target is after the recorded deadline (${fmtDate(it.due)}). The deadline stays as it is unless you change it yourself.</p>` : ""}
           <div class="row-flex"><button class="btn sm" type="button" data-act="rsSched" ${S.done.sched || !sch.out.length ? "disabled" : ""}>Add sessions to the plan</button></div>`)}
        ${step(++n, "block", "Clear blockers", blockers.length || it.status === "blocked" ? "These are holding it up right now." : "Nothing is recorded as blocking this.",
          `${blockers.map(b => { const m = memberOf(w, b.assignee); return `<div class="row-flex"><span class="dep open">${esc(b.title)}</span>${w.mode === "company" && m ? `<span class="muted" style="font-size:12.5px">${esc(m.name)} · due ${relDay(b.due, now)}</span>` : ""}<button class="btn xs" type="button" data-act="rsOpen" data-id="${b.id}">Open</button></div>`; }).join("")}
           ${it.status === "blocked" ? `<div class="row-flex"><span class="muted" style="font-size:13px">Status is Blocked.</span><button class="btn xs" type="button" data-act="rsUnblock">Mark as in progress</button></div>` : ""}`)}
        ${step(++n, "ext", w.mode === "company" ? "Ask for more time" : "Ask for an extension", "Copy this message and send it yourself. Nothing is sent from here.",
          `<div class="row-flex"><label for="rs-ext" style="font-size:13px;font-weight:600;color:var(--muted)">Ask for</label><input type="date" id="rs-ext" value="${S.ext}" min="${ymd(now)}"></div>
           <textarea id="rs-msg" rows="7" style="width:100%">${esc(msg)}</textarea>
           <div class="row-flex"><button class="btn sm" type="button" data-act="rsCopy">${IC.copy}Copy message</button><button class="btn sm ghost" type="button" data-act="rsLogExt" ${S.done.ext ? "disabled" : ""}>Log that I asked</button></div>`)}
        ${w.mode === "company" && mgr ? step(++n, "reassign", "Reassign the work", "People sorted by how much room they have this week.",
          `<div class="row-flex"><select id="rs-who" style="flex:1">${loads.filter(x => x.m.id !== it.assignee).map(x => `<option value="${x.m.id}">${esc(x.m.name)} · ${x.L.pct}% loaded</option>`).join("")}</select><button class="btn sm" type="button" data-act="rsReassign" ${S.done.reassign ? "disabled" : ""}>Reassign</button></div>`) : ""}
        ${w.mode === "company" && !mgr ? step(++n, "notify", "Tell your manager", "Sends an in-app notice to your manager with the current status.",
          `<textarea id="rs-note" rows="2" style="width:100%" placeholder="Optional note, e.g. what you need"></textarea><div class="row-flex"><button class="btn sm" type="button" data-act="rsNotify" ${S.done.notify ? "disabled" : ""}>Send in-app notice</button></div>`) : ""}
      </div>
    </div>
    <div class="m-f"><span class="sp"></span><button class="btn primary" type="button" data-act="mclose">Done</button></div>`;
  const keepScroll = $("#modalWrap").scrollTop;
  openModal("rescue", html, true);
  $("#modalWrap").scrollTop = keepScroll;
}

/* =========================================================
   Onboarding & new workspace
   ========================================================= */
const ONB = { step: 0, name: "", mode: null, ws: "", demo: true, groups: "" };
const MODE_CARDS = [
  ["student", "Student", "Assignments, exams, projects, scholarships and fees, organised by subject.", IC.student],
  ["company", "Company / team", "Team deadlines, owners, approvals, workload and project progress.", IC.company],
  ["personal", "Personal", "Bills, renewals, appointments and everything else with a date.", IC.personal]
];
const WS_DEFAULT = { student: "My Studies", company: "My Team", personal: "Personal" };
function showOnboarding(){
  $("#app").hidden = true; const o = $("#onb"); o.hidden = false; o.classList.remove("auth");
  const dots = `<div class="steps-dots">${[0, 1, 2].map(k => `<i class="${k <= ONB.step ? "on" : ""}"></i>`).join("")}</div>`;
  let inner;
  if (ONB.step === 0) inner = `<div class="brandline">${logoSVG(26)} Deadline Tracker</div>
    <h1>Never miss a deadline.<br>Always know what comes next.</h1>
    <p class="lead">See what's due, what's at risk and what to do first. Works for coursework, team projects and life admin.</p>
    <div class="field" style="max-width:420px"><label for="onb-name">What should we call you?</label><input type="text" id="onb-name" value="${esc(ONB.name)}" placeholder="Your first name" maxlength="40" autocomplete="given-name"></div>
    <div class="row-flex"><button class="btn primary" type="button" data-act="onbnext">Continue</button>${dots}</div>`;
  else if (ONB.step === 1) inner = `<h1 style="font-size:32px">What will you track?</h1><p class="lead">This sets up the right screens. You can add more workspaces later and switch between them.</p>
    <div class="modes">${MODE_CARDS.map(([k, t, d, ic]) => `<button class="mode" type="button" data-act="onbmode" data-v="${k}" aria-pressed="${ONB.mode === k}"><span class="mi" style="background:${MODE_COLOR[k]}">${ic}</span><b>${t}</b><span>${d}</span></button>`).join("")}</div>
    <div class="row-flex"><button class="btn ghost" type="button" data-act="onbback">Back</button><button class="btn primary" type="button" data-act="onbnext" ${ONB.mode ? "" : "disabled"}>Continue</button>${dots}</div>`;
  else inner = `<h1 style="font-size:32px">What's due this week?</h1>
    <p class="lead">Type it the way you'd say it. Say “due” for a deadline. You can skip this and add things later.</p>
    <div class="field"><label class="sr" for="onb-due">What's due this week?</label><textarea id="onb-due" rows="3" placeholder="${ONB.mode === "company" ? "e.g. Client report due Friday 4pm, review the landing page tomorrow" : "e.g. DBMS assignment due Friday 5pm, Java lab tomorrow"}">${esc(ONB.due || "")}</textarea>
      <p class="ab-hint" id="onb-due-hint" aria-live="polite">${onbHint()}</p></div>
    <label class="toggle"><input type="checkbox" id="onb-demo" ${ONB.demo ? "checked" : ""}>Also add sample deadlines so I can explore (clearly marked, clear them any time)</label>
    <div class="row-flex"><button class="btn ghost" type="button" data-act="onbback">Back</button><button class="btn primary" type="button" data-act="onbdone">Get started</button>${dots}</div>`;
  o.innerHTML = `<div class="onb-card">${inner}</div>`;
  setTimeout(() => { const f = o.querySelector("input,button.mode"); if (f) f.focus(); }, 40);
}
// The setup box reads text like the Add box does, against a stand-in workspace (none exists yet).
function onbHint(){
  const t = (ONB.due || "").trim(); if (!t) return "";
  const w = { mode: ONB.mode || "student", members: [{ id: "me", name: ONB.name || "You" }], groups: [], viewAs: "manager", settings: defaultSettings(ONB.mode || "student") };
  const acts = extractTasks(t, w, Date.now()); if (!acts.length) return "";
  return `${acts.length} thing${acts.length === 1 ? "" : "s"}: ` + acts.map(a => `<b>${esc(a.title)}</b> · ${a.isDeadline ? `Deadline ${esc(fmtDate(a.date + "T12:00"))}, ${esc(fmtTime(`${a.date}T${a.time || "23:59"}`))}` : a.date ? esc(fmtDate(a.date + "T12:00")) : "Today"}`).join(" | ");
}
function finishOnboarding(){
  const name = (ONB.name || "").trim();
  state = state && state.workspaces ? state : { v: 2, user: { name }, active: null, workspaces: [], read: {}, updatedAt: Date.now() };
  state.user.name = name || state.user.name || "";
  const groups = ONB.groups.split(",").map(x => x.trim()).filter(Boolean).slice(0, 12);
  const w = newWorkspace(ONB.mode, (ONB.ws || WS_DEFAULT[ONB.mode]).trim(), ONB.demo, groups);
  state.workspaces.push(w); state.active = w.id;
  save(); UI.route = "overview"; UI.animate = true; seenInit = false;
  state.inbox = state.inbox || []; state.fired = state.fired || {}; w.chat = [];
  render(); reminderBoot = true; UI.forceNotice = true; muteWs = w.id; runReminders(); muteWs = null;
  // what the person typed in "What's due this week?" becomes their first tasks (after the sample data was quieted)
  const mine = (ONB.due || "").trim() ? extractTasks(ONB.due, w, Date.now()).map(a => { const it = taskFromAction(w, a, { day: ymd(Date.now()) }); logItem(w, it, `Added "${it.title}"`); return it; }) : [];
  ONB.due = ""; if (mine.length) { save(); render(); toast(`Added ${mine.length} thing${mine.length === 1 ? "" : "s"} from your list.`); renderBell(); return; }
  renderBell();
  toast(ONB.demo ?"Your workspace is ready with sample deadlines. Press N to add your own." : "Your workspace is ready. Press N to add your first deadline.");
}
function openWsModal(){
  UI.newWs = UI.newWs || { mode: "student", name: "", demo: false };
  const N = UI.newWs;
  openModal("ws", `${mHead("New workspace")}<div class="m-b">
    <div class="modes" style="grid-template-columns:repeat(3,minmax(0,1fr))">${MODE_CARDS.map(([k, t, d, ic]) => `<button class="mode" type="button" data-act="wsmode" data-v="${k}" aria-pressed="${N.mode === k}" style="color:var(--ink);border-color:var(--line);background:var(--surface)"><span class="mi" style="background:${MODE_COLOR[k]}">${ic}</span><b>${t}</b><span style="color:var(--muted)">${d}</span></button>`).join("")}</div>
    <div class="field"><label for="nw-name">Name</label><input type="text" id="nw-name" value="${esc(N.name || WS_DEFAULT[N.mode])}" maxlength="50" data-autofocus></div>
    <label class="toggle"><input type="checkbox" id="nw-demo" ${N.demo ? "checked" : ""}>Include sample deadlines</label>
    <p class="note">${IC.info}<span>Each workspace keeps its own deadlines, ${N.mode === "company" ? "people, " : ""}settings and reports.</span></p>
  </div><div class="m-f"><button class="btn ghost" type="button" data-act="mclose">Cancel</button><button class="btn primary" type="button" data-act="wscreate">Create workspace</button></div>`, true);
}

/* =========================================================
   Notifications
   ========================================================= */
function inQuiet(s){
  if (!s.quietOn) return false;
  const n = new Date(); const cur = n.getHours() * 60 + n.getMinutes();
  const [fh, fm] = s.quietFrom.split(":").map(Number), [th, tm] = s.quietTo.split(":").map(Number);
  const a = fh * 60 + fm, b = th * 60 + tm;
  return a <= b ? cur >= a && cur < b : cur >= a || cur < b;
}
function notifs(w, now, R){
  const s = w.settings; const out = [];
  const mine = w.items.filter(i => !isDone(i) && i.due && (w.mode !== "company" || i.assignee === viewerId(w)));
  const offs = s.reminders.concat(s.customReminder ? [s.customReminder] : []).sort((a, b) => a - b);
  mine.forEach(i => {
    const due = new Date(i.due).getTime();
    if (due < now) { if (s.overdueAlerts) out.push({ key: i.id + ":od", id: i.id, lv: "overdue", t: due, text: `Overdue: ${i.title}` }); return; }
    const o = offs.find(o => now >= due - o * MIN);
    if (o) out.push({ key: i.id + ":" + o, id: i.id, lv: levelOf(R, i), t: due - o * MIN, text: `Due ${countdown(i.due, now).replace(" left", "")} from now: ${i.title}` });
  });
  conflicts(w, now).forEach(c => out.push({ key: c.key, id: c.ids[0], lv: "risk", t: now - 1000, text: c.text, route: c.kind === "over" ? "workload" : "planner" }));
  if (w.mode === "company" && canManage(w)) {
    w.items.filter(i => i.status === "review").forEach(i => { const m = memberOf(w, i.assignee); out.push({ key: i.id + ":rv:" + (i.evidence ? i.evidence.at : ""), id: i.id, lv: "attention", t: i.evidence ? new Date(i.evidence.at).getTime() : now, text: `${m ? m.name : "Someone"} submitted "${i.title}" for review`, route: "approvals" }); });
    (w.notices || []).forEach(n => out.push({ key: n.id, id: n.itemId, lv: "critical", t: new Date(n.t).getTime(), text: n.text }));
  }
  out.sort((a, b) => b.t - a.t);
  if (s.dailySummary) {
    const sod = startOfDay(now).getTime();
    const today = mine.filter(i => { const t = new Date(i.due).getTime(); return t >= now && t < sod + DAY; }).length;
    const risk = mine.filter(i => ["risk", "critical"].includes(levelOf(R, i))).length;
    const od = mine.filter(i => levelOf(R, i) === "overdue").length;
    out.unshift({ key: "sum:" + ymd(now) + ":" + w.id, lv: od ? "overdue" : risk ? "risk" : "ontrack", t: sod + 7 * HOUR, text: `Today's summary: ${today} due today, ${risk} at risk, ${od} overdue.`, route: "overview" });
  }
  return out;
}
function closeNotif(){ UI.notifOpen = false; const p = $("#notifPanel"); if (p) p.hidden = true; }
let seenInit = false; const seen = new Set();
function checkNewNotifs(){ runReminders(); }

/* =========================================================
   Focus sessions
   ========================================================= */
function startFocus(id, mins){
  const w = W(); const it = findItem(id); if (!it) return;
  if (UI.focus) finishFocus(false);
  UI.focus = { id, total: mins * 60, left: mins * 60, running: true, endAt: Date.now() + mins * 60000 };
  render(); toast(`Focus session started: ${mins} minutes on "${it.title}".`);
}
function focusLeft(){ const F = UI.focus; return F ? Math.max(0, F.running ? (F.endAt - Date.now()) / 1000 : F.left) : 0; }
function finishFocus(log = true, auto = false){
  const F = UI.focus; if (!F) return;
  const w = W(); const it = findItem(F.id);
  const mins = Math.round((F.total - focusLeft()) / 60);
  UI.focus = null;
  if (log && it && mins >= 1) {
    it.loggedMin = (it.loggedMin || 0) + mins;
    if (Number(it.estimate) > 0 && !(it.milestones || []).length && !isDone(it)) it.progress = clamp(Math.round((Number(it.progress) || 0) + mins / 60 / Number(it.estimate) * 100), 0, 100);
    if (it.status === "todo") it.status = "doing";
    touch(it); logItem(w, it, `Focused for ${mins} min on "${it.title}"`); save();
    toast(auto ? `Session complete. Logged ${mins} min on "${it.title}".` : `Logged ${mins} min on "${it.title}".`);
    burst($(".focus-mini") || $("#fringTm"));
  } else if (log) toast("Session ended. Less than a minute, so nothing was logged.");
  render();
}
function renderFocusMini(){
  const host = $("#focusMini"); const F = UI.focus;
  if (!F || UI.route === "planner") { host.innerHTML = ""; return; }
  const it = findItem(F.id); const left = focusLeft(); const c = 2 * Math.PI * 14;
  host.innerHTML = `<div class="focus-mini" role="status"><div class="mr"><svg viewBox="0 0 34 34"><circle cx="17" cy="17" r="14" fill="none" stroke="rgba(255,255,255,.15)" stroke-width="4"/><circle id="fmPr" cx="17" cy="17" r="14" fill="none" stroke="#e8a06a" stroke-width="4" stroke-linecap="round" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${(c * (1 - left / F.total)).toFixed(1)}"/></svg></div>
    <div><div class="t" id="fmTm">${pad(Math.floor(left / 60))}:${pad(Math.floor(left % 60))}</div><div class="n">${esc(it ? it.title : "")}</div></div>
    <button type="button" data-act="fpause">${F.running ? "Pause" : "Resume"}</button><button type="button" data-act="ffinish">Finish</button></div>`;
}

/* =========================================================
   Export & backup
   ========================================================= */
function icsText(w){
  const z = d => { d = new Date(d); return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`; };
  const e = s => String(s || "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/[,;]/g, m => "\\" + m);
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Deadline Tracker//EN", "CALSCALE:GREGORIAN"];
  w.items.filter(i => !isDone(i) && i.due).forEach(i => {
    const due = new Date(i.due).getTime();
    lines.push("BEGIN:VEVENT", `UID:${i.id}@deadline-tracker`, `DTSTAMP:${z(Date.now())}`, `DTSTART:${z(due - 30 * MIN)}`, `DTEND:${z(due)}`, `SUMMARY:${e("Due: " + i.title)}`, `DESCRIPTION:${e((TYPES[i.type] || "") + (i.notes ? " · " + i.notes : ""))}`,
      "BEGIN:VALARM", "TRIGGER:-P1D", "ACTION:DISPLAY", `DESCRIPTION:${e(i.title + " is due tomorrow")}`, "END:VALARM", "END:VEVENT");
  });
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}
function showTextModal(title, desc, text){
  openModal("text", `${mHead(esc(title))}<div class="m-b"><p class="muted">${desc}</p><textarea id="txtOut" rows="12" style="width:100%;font-family:var(--font-mono);font-size:12px" readonly>${esc(text)}</textarea></div><div class="m-f"><button class="btn primary" type="button" data-act="copytxt">${IC.copy}Copy</button><button class="btn" type="button" data-act="mclose">Close</button></div>`, true);
  setTimeout(() => { const t = $("#txtOut"); if (t) { t.focus(); t.select(); } }, 60);
}
async function copyText(text, okMsg){
  try { await navigator.clipboard.writeText(text); toast(okMsg); return true; } catch (e) { return false; }
}

/* =========================================================
   Events
   ========================================================= */
document.addEventListener("click", async e => {
  const routeEl = e.target.closest("[data-route]");
  const a = e.target.closest("[data-act]");
  if (UI.notifOpen && !e.target.closest("#notifPanel") && !e.target.closest("#bellBtn")) closeNotif();
  if (routeEl && !a) { e.preventDefault(); closeDrawer(); if (modalKind) closeModal(); setRoute(routeEl.dataset.route); return; }
  const sc = e.target.closest("[data-scroll]");
  if (sc) { e.preventDefault(); const t = document.getElementById(sc.dataset.scroll); if (t) t.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
  if (!a) { if (e.target === $("#modalWrap")) closeModal(); return; }
  const act = a.dataset.act;
  const host = a.closest("[data-id]");
  const id = a.dataset.id || (host && host.dataset.id);
  const w = state && state.workspaces.length ? W() : null;
  if (a.tagName === "A") e.preventDefault();
  switch (act) {
    /* onboarding */
    case "onbnext": if (ONB.step === 0) ONB.name = ($("#onb-name") || {}).value || ""; ONB.step++; showOnboarding(); break;
    case "onbback": ONB.step = Math.max(0, ONB.step - 1); showOnboarding(); break;
    case "onbmode": ONB.mode = a.dataset.v; ONB.ws = ""; showOnboarding(); break;
    case "authmode": { if (ACCOUNT.mode === a.dataset.v) break; const pl = $(".auth-pill"); const from = pl ? pl.getBoundingClientRect().left : 0; ACCOUNT.mode = a.dataset.v; showAuth(null, true); if (pl) MOTION.authSwitch(from, ACCOUNT.mode === "signup"); break; }
    case "pwtoggle": togglePw(a); break;
    case "chverify": case "chtestemail": case "tglink": case "tgtest": case "tgunlink": channelAction(act); break;
    case "authforgot": ACCOUNT.mode = "forgot"; ACCOUNT.keepEmail = $("#au-email") ? $("#au-email").value.trim() : ""; showAuth(null, true); break;
    case "pwopen": UI.pwOpen = !UI.pwOpen; render(); if (UI.pwOpen && $("#pw-cur")) $("#pw-cur").focus(); break;
    case "logout": logout(); break;
    case "onbdone": ONB.due = $("#onb-due").value; ONB.demo = $("#onb-demo").checked; finishOnboarding(); break;
    /* shell */
    case "wsmenu": if (MOTION.isRail()) { UI.wsMenu = true; MOTION.rail(false); break; } UI.wsMenu = !UI.wsMenu; renderSide(); break;
    case "wsswitch": state.active = a.dataset.ws; UI.wsMenu = false; UI.f = { type: "all", group: "all", risk: "all", status: "active", who: "all" }; UI.q = ""; UI.boardGroup = "all"; closeDrawer(); save(); setRoute(UI.route); seenInit = false; break;
    case "wsnew": UI.wsMenu = false; UI.newWs = null; openWsModal(); break;
    case "wsmode": UI.newWs.mode = a.dataset.v; UI.newWs.name = ""; openWsModal(); break;
    case "wscreate": { const N = UI.newWs; const nw = newWorkspace(N.mode, ($("#nw-name").value || WS_DEFAULT[N.mode]).trim(), $("#nw-demo").checked); state.workspaces.push(nw); state.active = nw.id; closeModal(); UI.forceNotice = true; muteWs = nw.id; runReminders(); muteWs = null; save(); setRoute("overview"); toast(`Created "${nw.name}".`); break; }
    case "wsdelete": confirmModal(`Delete "${w.name}"?`, "This removes the workspace and all its deadlines from this account. It can't be undone.", "Delete workspace", () => { state.workspaces = state.workspaces.filter(x => x.id !== w.id); state.active = state.workspaces[0].id; save(); setRoute("overview"); toast("Workspace deleted."); }, true); break;
    case "morenav": { const nav = navFor(w); openModal("more", `${mHead("Menu")}<div class="m-b"><div class="nav" style="margin:0">${nav.map(([r, l]) => `<a href="#${r}" data-route="${r}" style="color:var(--ink)" aria-current="${UI.route === r ? "page" : "false"}">${NAV_ICON[r]}${l}</a>`).join("")}</div>
        <div class="field"><span class="lbl">Workspace</span>${state.workspaces.map(x => `<button class="btn" type="button" data-act="wsswitch" data-ws="${x.id}" style="justify-content:flex-start">${esc(x.name)} · ${MODE_LABEL[x.mode]}${x.id === w.id ? " ✓" : ""}</button>`).join("")}<button class="btn ghost" type="button" data-act="wsnew">${IC.plus}New workspace</button></div>
        ${w.mode === "company" ? `<div class="field"><label for="viewAsM">Viewing as</label><select id="viewAsM">${[["manager", "Manager"]].concat(w.members.filter(m => m.id !== "me").map(m => [m.id, m.name + " (employee)"])).map(([v, l]) => `<option value="${v}" ${w.viewAs === v ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></div>` : ""}</div>`); break; }
    case "mclose": closeModal(); break;
    case "confirmok": { const f = UI.onConfirm; closeModal(); if (f) f(); break; }
    case "cleardemo": confirmModal("Clear sample data?", `This removes all sample deadlines${w.mode === "company" ? ", people" : ""} and ${GROUP_WORD[w.mode].toLowerCase()}s from "${esc(w.name)}". Your settings stay.`, "Clear sample data", () => { w.items = []; w.groups = []; w.activity = []; w.notices = []; w.members = w.members.filter(m => m.id === "me"); w.viewAs = "manager"; w.demo = false; closeDrawer(); save(); render(); toast("Sample data cleared. Press N to add your first deadline."); }, true); break;
    case "qa": closeDrawer(); openQuickAdd({ date: a.dataset.date, type: a.dataset.type }); break;
    case "drclose": closeDrawer(); break;
    case "settab": UI.setTab = a.dataset.v; render(); { const v = $("#view"); if (v) v.scrollTop = 0; } break;
    case "dlremove": { const it = findItem(UI.drawerId); if (!it || !it.due || !canEditItem(w, it)) break;
      confirmModal("Remove the deadline?", `"${esc(it.title)}" stays as a task${it.plan ? ` on ${esc(fmtDate(it.plan + "T12:00"))}` : ""}, without a deadline. It was due ${esc(fmtDue(it.due))}.`, "Remove deadline", () => {
        const before = clone(it); const was = fmtDue(it.due);
        it.due = null; it.kind = "todo"; touch(it); logItem(w, it, `Removed the deadline (was ${was})`); save(); render();
        toast(`"${it.title}" no longer has a deadline.`, () => { replaceItem(w, before); save(); render(); }); });
      break; }
    /* items */
    case "open": closeNotif(); if (modalKind === "rescue") closeModal(); if (id) openDrawer(id); break;
    case "toggle": completeItem(id, a); break;
    case "delete": deleteItem(id); break;
    case "focus": closeDrawer(); startFocus(id, 25); break;
    case "rescue": openRescue(id); break;
    case "tab": UI.drawerTab = a.dataset.v; renderDrawer(); break;
    case "setest": { const it = findItem(id); if (it) { it.estimate = +a.dataset.v; touch(it); logItem(w, it, `Estimated ${fmtH(it.estimate)} of work`); save(); render(); } break; }
    case "checkin": { const it = findItem(id); if (!it) break; const v = a.dataset.v;
      if (v === "done") { completeItem(it.id, a); break; }
      const before = clone(it); it.progress = +v; it.checkedAt = nowIso(); if (+v > 0 && it.status === "todo") it.status = "doing";
      touch(it); logItem(w, it, `Checked in: ${v}% done on "${it.title}"`); save(); render();
      const lv = levelOf(radar(w, Date.now()), it);
      toast(`Saved. "${it.title}" is now ${LV[lv].toLowerCase()}.`, () => { replaceItem(w, before); save(); render(); }); break; }
    case "checkinlater": { const it = findItem(id); if (!it) break; it.checkinSnooze = new Date(Date.now() + DAY).toISOString(); save(); render(); break; }
    case "abask": { const f = a.closest("[data-addbox]"); if (f) askFromAddBox(f.dataset.addbox); break; }
    case "drestuse": { const it = findItem(UI.drawerId); if (!it) break; const before = clone(it); it.estimate = +a.dataset.v; touch(it); logItem(w, it, `Updated estimate to ${fmtH(it.estimate)} based on past work`); save(); render(); toast(`Estimate set to ${fmtH(it.estimate)}.`, () => { replaceItem(w, before); save(); render(); }); break; }
    case "extyes": { const it = findItem(UI.drawerId); if (!it || !it.extension) break; const before = clone(it); const time = it.due.slice(10);
      it.originalDue = it.originalDue || it.due; it.due = it.extension.requested + time; it.extension.status = "approved"; it.extension.decidedAt = nowIso();
      touch(it); logItem(w, it, `Extension approved: deadline moved from ${fmtDue(it.originalDue)} to ${fmtDue(it.due)}`); save(); render();
      toast(`Deadline moved to ${fmtDue(it.due)}.`, () => { replaceItem(w, before); save(); render(); }); break; }
    case "extno": { const it = findItem(UI.drawerId); if (!it || !it.extension) break; it.extension.status = "declined"; it.extension.decidedAt = nowIso(); touch(it); logItem(w, it, "Extension declined; deadline unchanged"); save(); render(); toast("Noted. Your deadline stays the same; Rescue mode can help you finish."); break; }
    case "headstoggle":
      if (UI.headsOpen) { const b = $("#headsToggle"); if (b) b.setAttribute("aria-expanded", "false"); MOTION.fold($("#headsList"), $("#headsToggle .chev"), () => { UI.headsOpen = false; render(); }); }
      else { UI.headsOpen = true; render(); MOTION.unfold($("#headsList"), $("#headsToggle .chev")); }
      break;
    case "rail": MOTION.rail(); break;
    case "filters": UI.filtersOpen = !UI.filtersOpen; render(); break;
    case "advtoggle": { UI.advOpen = !UI.advOpen; a.setAttribute("aria-expanded", UI.advOpen); $("#advBox").hidden = !UI.advOpen; break; }
    case "drmore": { UI.drMore = !UI.drMore; a.setAttribute("aria-expanded", UI.drMore); $("#drMoreBox").hidden = !UI.drMore; break; }
    case "statgo": { const fv = a.dataset.filter; if (fv === "approvals") { setRoute("approvals"); break; } UI.f = { type: "all", group: "all", risk: "all", status: "active", who: "all" }; UI.q = ""; if (fv === "done") UI.f.status = "done"; else if (fv !== "active") UI.f.risk = fv; UI.groupBy = "time"; setRoute(listRoute()); break; }
    case "riskgo": UI.f = { type: "all", group: "all", risk: a.dataset.lv, status: "active", who: "all" }; UI.q = ""; setRoute(listRoute()); break;
    /* list filters */
    case "fstatus": UI.f.status = a.dataset.v; render(); break;
    case "groupby": UI.groupBy = a.dataset.v; render(); break;
    case "ftype": UI.f.type = UI.f.type === a.dataset.v ? "all" : a.dataset.v; render(); break;
    case "fgroup": UI.f.group = UI.f.group === a.dataset.v ? "all" : a.dataset.v; render(); break;
    case "frisk": UI.f.risk = "all"; render(); break;
    case "fclear": UI.f = { type: "all", group: "all", risk: "all", status: UI.f.status, who: "all" }; UI.q = ""; UI.groupBy = "time"; UI.sort = "due"; const gs = $("#gsearch"); if (gs) gs.value = ""; render(); break;
    /* calendar */
    case "calview": UI.calView = a.dataset.v; render(); break;
    case "calprev": if (UI.calView === "month") UI.calMonth = new Date(UI.calMonth.getFullYear(), UI.calMonth.getMonth() - 1, 1); else UI.calWeek = addDays(UI.calWeek, -7); render(); break;
    case "calnext": if (UI.calView === "month") UI.calMonth = new Date(UI.calMonth.getFullYear(), UI.calMonth.getMonth() + 1, 1); else UI.calWeek = addDays(UI.calWeek, 7); render(); break;
    case "caltoday": UI.calMonth = null; UI.calWeek = null; render(); break;
    case "calweek": { const d = new Date(a.dataset.date + "T12:00"); UI.calView = "week"; UI.calWeek = addDays(startOfDay(d), -((d.getDay() + 6) % 7)); render(); break; }
    /* planner/focus */
    case "flen": UI.flen = +a.dataset.v; render(); break;
    case "fstart": { const sel = $("#focusItem"); if (sel && sel.value) startFocus(sel.value, UI.flen || 25); break; }
    case "fpause": { const F = UI.focus; if (!F) break; if (F.running) { F.left = focusLeft(); F.running = false; } else { F.endAt = Date.now() + F.left * 1000; F.running = true; } render(); break; }
    case "ffinish": finishFocus(true); break;
    case "fstop": UI.focus = null; render(); toast("Session discarded."); break;
    /* plan tab */
    case "mstoggle": break;
    case "msdel": { const it = findItem(UI.drawerId); if (!it) break; const before = clone(it); it.milestones = it.milestones.filter(m => m.id !== a.dataset.ms); touch(it); save(); render(); toast("Step removed.", () => { replaceItem(w, before); save(); render(); }); break; }
    case "msadd": addStep(); break;
    case "suggest": { const it = findItem(UI.drawerId); if (it) { UI.sugg[it.id] = backwardPlan(it, Date.now()); renderDrawer(); } break; }
    case "sugdiscard": delete UI.sugg[UI.drawerId]; renderDrawer(); break;
    case "sugaccept": { const it = findItem(UI.drawerId); const sug = UI.sugg[UI.drawerId]; if (!it || !sug) break; const keep = sug.filter(s => s.keep && s.text.trim());
      it.milestones = (it.milestones || []).concat(keep.map(s => ({ id: s.id, text: s.text.trim(), hours: Number(s.hours) || 1, date: s.date, done: false })));
      if (!it.milestones.some(m => m.done) && it.progress) it.progress = 0;
      delete UI.sugg[it.id]; touch(it); logItem(w, it, `Added ${keep.length} planned steps to "${it.title}"`); save(); render(); toast(`Added ${keep.length} steps. Your deadline is unchanged.`); break; }
    case "depdel": { const it = findItem(UI.drawerId); if (it) { it.dependsOn = it.dependsOn.filter(x => x !== a.dataset.dep); touch(it); save(); render(); } break; }
    /* proof & approvals */
    case "recordproof": { const it = findItem(UI.drawerId); if (!it) break; it.evidence = { link: $("#ev-link").value.trim(), note: $("#ev-note").value.trim(), at: nowIso(), by: viewerId(w) }; touch(it); logItem(w, it, `Recorded submission for "${it.title}"`); if (!isDone(it)) completeItem(it.id, a); else { save(); render(); toast("Submission record updated."); } break; }
    case "submitreview": submitReview(UI.drawerId, $("#ev-link").value.trim(), $("#ev-note").value.trim()); break;
    case "approve": decide(UI.drawerId && $("#drawer").contains(a) ? UI.drawerId : id, true, ($("#drawer").contains(a) && $("#ap-note")) ? $("#ap-note").value.trim() : ""); break;
    case "changes": { const tid = $("#drawer").contains(a) ? UI.drawerId : id; const note = $("#drawer").contains(a) && $("#ap-note") ? $("#ap-note").value.trim() : ""; if (!note && !$("#drawer").contains(a)) { openDrawer(tid, "proof"); toast("Add a note explaining what to change."); break; } decide(tid, false, note); break; }
    case "applyreassign": reassign(id, a.dataset.to); break;
    /* rescue */
    case "rsChunk": { const it = findItem(UI.rescue.id); it.milestones = (it.milestones || []).filter(m => m.done).concat(UI.rescue.chunks.map(c => ({ id: c.id, text: c.text, hours: c.hours, date: c.date, done: false })));
      if (!(Number(it.estimate) > 0)) it.estimate = UI.rescue.chunks.reduce((s, c) => s + c.hours, 0);
      touch(it); logItem(w, it, `Split remaining work into ${UI.rescue.chunks.length} steps (Rescue mode)`); UI.rescue.done.chunk = true; save(); render(); renderRescue(); toast("Steps added to the plan."); break; }
    case "rsSched": { const it = findItem(UI.rescue.id); const sch = rescueSchedule(it, w, UI.rescue.target); it.milestones = (it.milestones || []).filter(m => m.done).concat(sch.out.map((x, k) => ({ id: rid("m"), text: `Work session ${k + 1}`, hours: x.h, date: x.date, done: false })));
      it.plannedFinish = UI.rescue.target; touch(it); logItem(w, it, `Made a revised schedule to finish by ${fmtDate(UI.rescue.target + "T12:00")}`); UI.rescue.done.sched = true; save(); render(); renderRescue(); toast("Revised schedule added. The recorded deadline is unchanged."); break; }
    case "rsOpen": closeModal(); openDrawer(id); break;
    case "rsUnblock": { const it = findItem(UI.rescue.id); it.status = "doing"; touch(it); logItem(w, it, `Marked "${it.title}" as in progress`); UI.rescue.done.block = true; save(); render(); renderRescue(); break; }
    case "rsCopy": { const t = $("#rs-msg").value; if (!(await copyText(t, "Message copied. Send it from your email or chat."))) { $("#rs-msg").select(); toast("Copying was blocked. The message is selected: press Ctrl+C (or ⌘C)."); } break; }
    case "rsLogExt": { const it = findItem(UI.rescue.id); it.extension = { requested: UI.rescue.ext, at: nowIso(), status: "pending" }; touch(it); logItem(w, it, `Asked for an extension to ${fmtDate(UI.rescue.ext + "T12:00")}`); UI.rescue.done.ext = true; save(); render(); renderRescue(); toast("Logged. Change the deadline yourself if the extension is approved."); break; }
    case "rsReassign": { const to = $("#rs-who").value; reassign(UI.rescue.id, to); UI.rescue.done.reassign = true; renderRescue(); break; }
    case "rsNotify": { const it = findItem(UI.rescue.id); const me = memberOf(w, viewerId(w)); const note = $("#rs-note").value.trim();
      w.notices = w.notices || []; w.notices.unshift({ id: rid("n"), t: nowIso(), itemId: it.id, from: viewerId(w), text: `${me ? me.name : "Someone"} needs help with "${it.title}" (${LV[levelOf(radar(w, Date.now()), it)]})${note ? `: ${note}` : ""}` });
      logItem(w, it, "Notified manager (Rescue mode)"); UI.rescue.done.notify = true; UI.forceNotice = true; save(); render(); renderRescue(); runReminders(); toast("Your manager will see this in their notifications."); break; }
    /* notifications */
    case "readall": inboxFor(w).forEach(n => n.read = true); markRead("all"); save(); renderBell(); render(); break;
    case "notifgo": { const n = (state.inbox || []).find(x => x.key === a.dataset.key); if (n) { n.read = true; markRead([n.key]); } save(); closeNotif(); if (a.dataset.id && findItem(a.dataset.id)) { render(); openDrawer(a.dataset.id); } else render(); break; }
    /* settings */
    case "thdefault": w.settings.thresholds = { critical: 100, risk: 70, attention: 40 }; save(); render(); toast("Radar rules reset."); break;
    case "gadd": { const v = $("#gnew").value.trim(); if (!v) { $("#gnew").focus(); break; } w.groups.push({ id: rid("g"), name: v.slice(0, 40), color: COLORS[w.groups.length % COLORS.length] }); save(); render(); toast(`Added ${GROUP_WORD[w.mode].toLowerCase()} "${v}".`); break; }
    case "gdel": { const g = groupOf(w, a.dataset.g); confirmModal(`Delete "${g.name}"?`, `Deadlines in it are kept and moved to no ${GROUP_WORD[w.mode].toLowerCase()}.`, "Delete", () => { w.groups = w.groups.filter(x => x.id !== g.id); w.items.forEach(i => { if (i.groupId === g.id) i.groupId = null; }); save(); render(); }, true); break; }
    case "madd": { const n = $("#mnew").value.trim(); if (!n) { $("#mnew").focus(); break; } w.members.push({ id: rid("u"), name: n.slice(0, 50), role: "Team member", dept: $("#mdept").value.trim(), capacity: 40, access: "Employee" }); save(); render(); toast(`Added ${n} as a placeholder. Invitations need accounts.`); break; }
    case "mdel": { const m = memberOf(w, a.dataset.m); confirmModal(`Remove ${m.name}?`, "Their deadlines are reassigned to you.", "Remove", () => { w.items.forEach(i => { if (i.assignee === m.id) i.assignee = "me"; if (i.reviewer === m.id) i.reviewer = null; }); w.members = w.members.filter(x => x.id !== m.id); if (w.viewAs === m.id) w.viewAs = "manager"; save(); render(); }, true); break; }
    case "exportics": { const text = icsText(w); let ok = false;
      try { const dl = window.claude && window.claude.use ? await window.claude.use("downloads") : null; if (dl) { await dl.save({ filename: `${w.name.replace(/[^\w-]+/g, "-")}-deadlines.ics`, data: text }); ok = true; toast("Calendar file ready."); } } catch (err) { if (err && err.code === "declined") { toast("Download cancelled."); break; } }
      if (!ok) showTextModal("Calendar export", "Downloads aren't available here. Copy this text into a file named deadlines.ics and open it with your calendar app.", text); break; }
    case "copybackup": { const text = JSON.stringify(state); if (!(await copyText(text, "Backup copied. Paste it somewhere safe."))) showTextModal("Backup", "Copy all of this text and keep it somewhere safe.", text); break; }
    case "copytxt": { const t = $("#txtOut"); if (t && !(await copyText(t.value, "Copied."))) { t.select(); toast("Press Ctrl+C (or ⌘C) to copy the selected text."); } break; }
    case "importbackup": openModal("import", `${mHead("Restore from backup")}<div class="m-b"><p class="muted">Paste a backup you copied earlier. This replaces everything currently saved.</p><textarea id="impText" rows="8" style="width:100%;font-family:var(--font-mono);font-size:12px" data-autofocus></textarea><p class="note" id="impErr" style="color:var(--over)"></p></div><div class="m-f"><button class="btn ghost" type="button" data-act="mclose">Cancel</button><button class="btn primary" type="button" data-act="impgo">Restore</button></div>`); break;
    case "impgo": { let o; try { o = JSON.parse($("#impText").value); } catch (err) { $("#impErr").textContent = "That isn't a valid backup. Paste the whole text you copied."; break; }
      if (!o || !Array.isArray(o.workspaces) || !o.workspaces.length || !o.workspaces.every(x => x && Array.isArray(x.items) && x.settings)) { $("#impErr").textContent = "This text doesn't look like a Deadline Tracker backup."; break; }
      state = o; state.read = state.read || {}; if (!state.workspaces.find(x => x.id === state.active)) state.active = state.workspaces[0].id; closeModal(); save(); setRoute("overview"); toast("Backup restored."); break; }
    case "resetall": confirmModal("Reset everything?", "All workspaces, deadlines and settings saved for you will be deleted. Copy a backup first if you might want them.", "Delete everything", () => { state = null; try { localStorage.removeItem(LS_V2); localStorage.removeItem(LS_V1); } catch (err) {} if (Store.mode === "db" && Store.ref) Store.ref.delete().catch(() => {}); if (Store.mode === "server") apiJSON("DELETE", "/api/state").then(r => { if (r.ok) ACCOUNT.version = 0; }).catch(() => {}); ONB.step = 0; ONB.mode = null; closeDrawer(); render(); }, true); break;
  }
});
function addStep(){
  const w = W(); const it = findItem(UI.drawerId); const inp = $("#ms-new"); if (!it || !inp) return;
  const v = inp.value.trim(); if (!v) return;
  it.milestones = it.milestones || []; it.milestones.push({ id: rid("m"), text: v.slice(0, 120), hours: 1, date: null, done: false });
  touch(it); save(); render(); setTimeout(() => { const n = $("#ms-new"); if (n) n.focus(); }, 0);
}
$("#toastUndo").addEventListener("click", () => { if (undoFn) { const f = undoFn; undoFn = null; f(); } $("#toast").classList.remove("on"); });
$("#qaBtn").addEventListener("click", () => openQuickAdd());
$("#themeBtn").addEventListener("click", () => {
  const next = currentTheme() === "dark" ? "light" : "dark";
  themePref = next; try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
  applyTheme(next); if (state && state.workspaces && state.workspaces.length) render();
  toast(next === "dark" ? "Dark mode on." : "Light mode on.");
});
$("#fab").addEventListener("click", () => openQuickAdd());
$("#scrim").addEventListener("click", closeDrawer);
$("#bellBtn").addEventListener("click", e => { e.stopPropagation(); UI.notifOpen = !UI.notifOpen; if (UI.notifOpen) renderNotif(); else closeNotif(); });
$("#gsearch").addEventListener("input", e => { UI.q = e.target.value; const lr = listRoute(); if (UI.route !== lr && UI.route !== "mywork") { UI.f.status = "all"; setRoute(lr); setTimeout(() => { const g = $("#gsearch"); g.focus(); }, 0); } else render(); });

document.addEventListener("input", e => {
  const t = e.target; const id = t.id || "";
  if (t.classList.contains("ab-input")) { AB.drafts[id] = t.value; refreshAddHint(id); t.style.height = "auto"; t.style.height = Math.min(t.scrollHeight, 140) + "px"; return; }
  if (t.dataset.abwho) { AB.who[t.dataset.abwho] = t.value; refreshAddHint(t.dataset.abwho); return; }
  if (id === "onb-due") { ONB.due = t.value; const h = $("#onb-due-hint"); if (h) h.innerHTML = onbHint(); return; }
  if (id === "listSearch") { UI.q = t.value; const g = $("#gsearch"); if (g) g.value = t.value; render(); return; }
  if (id === "dr-prog") { const o = $("#dr-prog-o"); if (o) o.textContent = t.value + "%"; return; }
  if (id === "pf-hpd") { $("#pf-hpd-o").textContent = fmtH(+t.value); return; }
  if (t.dataset.th) { t.nextElementSibling.textContent = t.value + "%"; return; }
  if (t.dataset.st != null && UI.sugg[UI.drawerId]) { UI.sugg[UI.drawerId][+t.dataset.st].text = t.value; return; }
});
document.addEventListener("submit", e => { if (e.target.id === "authForm") { e.preventDefault(); submitAuth(); } else if (e.target.id === "pwBox") { e.preventDefault(); changePassword(); } });
document.addEventListener("submit", e => { const f = e.target.closest && e.target.closest("[data-addbox]"); if (f) { e.preventDefault(); submitAddBox(f.dataset.addbox); } });
document.addEventListener("change", e => {
  const t = e.target; const id = t.id || ""; if (!state || !state.workspaces.length) return;
  if (CH_PREF[id]) { saveChannelPref(id, t.checked); return; }
  if (t.closest && t.closest(".topics")) return;
  const w = W();
  // drawer fields
  if (id.startsWith("dr-") || t.dataset.mstext || t.dataset.mshours || t.dataset.act === "mstoggle") {
    const it = findItem(UI.drawerId || (t.closest("[data-id]") || {}).dataset?.id); if (!it || !canEditItem(w, it)) return;
    const msId = t.dataset.ms || t.dataset.mstext || t.dataset.mshours;
    if (t.dataset.act === "mstoggle") { const m = it.milestones.find(x => x.id === msId); if (m) { m.done = t.checked; touch(it); logItem(w, it, `${m.done ? "Finished" : "Reopened"} step "${m.text}"`); if (progressOf(it) === 100 && !isDone(it)) toast(`All steps done. Mark "${it.title}" as done when it's submitted.`); save(); render(); } return; }
    if (t.dataset.mstext) { const m = it.milestones.find(x => x.id === msId); if (m && t.value.trim()) { m.text = t.value.trim(); touch(it); save(); render(); } return; }
    if (t.dataset.mshours) { const m = it.milestones.find(x => x.id === msId); if (m) { m.hours = Math.max(.25, +t.value || 1); touch(it); save(); render(); } return; }
    const v = t.value; let txt = null;
    switch (id) {
      case "dr-title": if (!v.trim()) { t.value = it.title; return; } it.title = v.trim().slice(0, 140); break;
      case "dr-date": case "dr-time": { const dv = $("#dr-date").value, tv = $("#dr-time").value || "23:59"; if (!dv) { toast("A deadline needs a date.", null, null, "error"); render(); return; } const old = it.due; it.due = `${dv}T${tv}`; if (old !== it.due) txt = `Changed the deadline from ${fmtDue(old)} to ${fmtDue(it.due)}`; break; }
      case "dr-type": it.type = v; break;
      case "dr-group": it.groupId = v || null; break;
      case "dr-pri": it.priority = v; txt = `Set priority to ${PRI[v].label}`; break;
      case "dr-status": if (v === "done") { completeItem(it.id); return; } if (v === "review") { if (!canManage(w)) { UI.drawerTab = "proof"; render(); return; } } if (isDone(it)) it.doneAt = null; txt = `Changed status from ${STATUSES[it.status]} to ${STATUSES[v]}`; it.status = v; break;
      case "dr-repeat": it.repeat = v; break;
      case "dr-assignee": { const m = memberOf(w, v); txt = `Reassigned to ${m ? m.name : ""}`; it.assignee = v; break; }
      case "dr-reviewer": it.reviewer = v || null; break;
      case "dr-needs": it.needsApproval = t.checked; break;
      case "dr-est": it.estimate = v === "" ? null : Math.max(0, +v); txt = it.estimate ? `Estimated ${fmtH(it.estimate)} of work` : null; break;
      case "dr-prog": it.progress = +v; txt = `Updated progress to ${v}%`; if (it.status === "todo" && +v > 0) it.status = "doing"; break;
      case "dr-link": it.link = v.trim(); break;
      case "dr-notes": it.notes = v; break;
      case "dr-dep": if (v) { it.dependsOn = (it.dependsOn || []).concat(v); const d = findItem(v, w); txt = `Now waits on "${d ? d.title : ""}"`; } break;
      default: return;
    }
    touch(it); if (txt) logItem(w, it, txt); save(); setTimeout(render, 0); return;
  }
  if (t.dataset.act === "mstoggle" || t.closest(".topics")) return;
  if (t.dataset.sk != null && UI.sugg[UI.drawerId]) { UI.sugg[UI.drawerId][+t.dataset.sk].keep = t.checked; renderDrawer(); return; }
  if (t.dataset.sh != null && UI.sugg[UI.drawerId]) { UI.sugg[UI.drawerId][+t.dataset.sh].hours = Math.max(.25, +t.value || .5); return; }
  if (t.dataset.sd != null && UI.sugg[UI.drawerId]) { UI.sugg[UI.drawerId][+t.dataset.sd].date = t.value; return; }
  if (id === "rs-target") { UI.rescue.target = t.value || UI.rescue.target; UI.rescue.done.sched = false; renderRescue(); return; }
  if (id === "rs-ext") { UI.rescue.ext = t.value || UI.rescue.ext; UI.rescue.msg = null; renderRescue(); return; }
  if (id === "rs-msg") { UI.rescue.msg = t.value; return; }
  if (id === "viewAs" || id === "viewAsM") { w.viewAs = t.value; UI.f.who = "all"; closeDrawer(); if (modalKind) closeModal(); save(); setRoute(routeAllowed(UI.route) ? UI.route : "overview"); seenInit = false; reminderBoot = true; UI.forceNotice = true; runReminders(); renderBell(); toast(t.value === "manager" ? "Viewing as manager." : `Viewing as ${memberOf(w, t.value).name} (employee).`); return; }
  if (id === "sortSel") { UI.sort = t.value; render(); return; }
  if (id === "whoSel") { UI.f.who = t.value; render(); return; }
  if (id === "boardGroup") { UI.boardGroup = t.value; render(); return; }
  if (id === "pf-currency") { state.user.currency = t.value; save(); toast(`Money in answers will be shown in ${t.options[t.selectedIndex].text}.`); return; }
  if (id === "pf-sound") { SFX.on = t.checked; try { localStorage.setItem(SND_KEY, t.checked ? "on" : "off"); } catch (err) {} if (t.checked) sfx("success"); toast(t.checked ? "Sound effects on." : "Sound effects off."); return; }
  // settings
  const s = w.settings;
  if (id === "pf-name") { state.user.name = t.value.trim(); state.workspaces.forEach(x => { const me = memberOf(x, "me"); if (me && t.value.trim()) me.name = t.value.trim(); }); }
  else if (id === "pf-ws") { if (t.value.trim()) w.name = t.value.trim(); }
  else if (id === "pf-hpd") { s.hoursPerDay = +t.value; if (w.mode !== "company") memberOf(w, "me").capacity = s.hoursPerDay * s.workdays.length; }
  else if (t.dataset.wd != null) { const k = +t.dataset.wd; if (t.checked) s.workdays = [...new Set(s.workdays.concat(k))].sort(); else if (s.workdays.length > 1) s.workdays = s.workdays.filter(x => x !== k); else { t.checked = true; toast("Keep at least one day."); return; } }
  else if (id === "pf-tz") s.tz = t.value;
  else if (t.dataset.th) { s.thresholds[t.dataset.th] = +t.value; const th = s.thresholds; if (th.risk > th.critical) th.risk = th.critical; if (th.attention > th.risk) th.attention = th.risk; }
  else if (t.dataset.rem) { const v = +t.dataset.rem; s.reminders = t.checked ? [...new Set(s.reminders.concat(v))] : s.reminders.filter(x => x !== v); }
  else if (id === "rm-custom") s.customReminder = Math.max(0, Math.round(+t.value * 60) || 0);
  else if (id === "pf-desktop") { if (t.checked) { t.checked = false; enableDesktop(); } else { state.desktopAlerts = false; save(); toast("Desktop alerts are off."); } return; }
  else if (id === "pf-od") s.overdueAlerts = t.checked;
  else if (id === "pf-sum") s.dailySummary = t.checked;
  else if (id === "pf-quiet") s.quietOn = t.checked;
  else if (id === "pf-qf") s.quietFrom = t.value || s.quietFrom;
  else if (id === "pf-qt") s.quietTo = t.value || s.quietTo;
  else if (id === "pf-today") s.dueToday = t.checked;
  else if (id === "pf-high") s.highDone = t.checked;
  else if (t.dataset.gcolor) { groupOf(w, t.dataset.gcolor).color = t.value; }
  else if (t.dataset.gname) { if (t.value.trim()) groupOf(w, t.dataset.gname).name = t.value.trim(); }
  else if (t.dataset.gteacher != null) { groupOf(w, t.dataset.gteacher).teacher = t.value.trim(); }
  else if (t.dataset.mrole) { memberOf(w, t.dataset.mrole).access = t.value; }
  else if (t.dataset.mcap) { memberOf(w, t.dataset.mcap).capacity = clamp(+t.value || 40, 1, 80); }
  else return;
  save(); setTimeout(render, 0);
  if (t.dataset.rem || /^(rm-custom|pf-od|pf-sum|pf-quiet|pf-qf|pf-qt|pf-today|pf-high)$/.test(id)) syncPrefs();
});
// topic checkboxes on the exams page and add-topic inputs
document.addEventListener("change", e => {
  const t = e.target; if (!t.closest || !t.closest(".topics")) return;
  const w = W(); const card = t.closest("[data-id]"); const it = card && findItem(card.dataset.id); if (!it) return;
  const m = it.milestones.find(x => x.id === t.dataset.ms); if (!m) return;
  m.done = t.checked; touch(it); logItem(w, it, `${m.done ? "Revised" : "Unticked"} topic "${m.text}"`); save(); render();
  if (m.done) burst(t);
}, true);
document.addEventListener("keydown", e => {
  const t = e.target;
  if (e.key === "Enter" && t.dataset && t.dataset.addtopic) { e.preventDefault(); const w = W(); const it = findItem(t.dataset.addtopic); const v = t.value.trim(); if (it && v) { it.milestones = it.milestones || []; it.milestones.push({ id: rid("m"), text: v.slice(0, 100), hours: 1, done: false, date: null }); if (it.estimate) it.estimate = Number(it.estimate) + 1; touch(it); save(); render(); setTimeout(() => { const n = document.getElementById("addtopic-" + it.id); if (n) n.focus(); }, 0); } return; }
  if (e.key === "Enter" && t.id === "ms-new") { e.preventDefault(); addStep(); return; }
  if (e.key === "Enter" && !e.shiftKey && t.classList && t.classList.contains("ab-input")) { e.preventDefault(); submitAddBox(t.id); return; }
  if (e.key === "Enter" && t.id === "onb-name") { e.preventDefault(); const b = document.querySelector("[data-act=onbnext]"); if (b) b.click(); return; }
  if ((e.key === "Enter" || e.key === " ") && t.getAttribute && t.getAttribute("role") === "button" && t.dataset.act) { e.preventDefault(); t.click(); return; }
  if (e.key === "Escape") { if (modalKind) { closeModal(); return; } if (UI.notifOpen) { closeNotif(); return; } if (UI.drawerId) { closeDrawer(); return; } if (UI.wsMenu) { UI.wsMenu = false; renderSide(); return; } }
  const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName) || t.isContentEditable;
  if (!state || !state.workspaces.length || modalKind) return;
  if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) { e.preventDefault(); openQuickAdd(); return; }
  if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === "n" || e.key === "N") { e.preventDefault(); openQuickAdd(); }
  else if (e.key === "/") { e.preventDefault(); const s = $("#listSearch") || $("#gsearch"); if (s && s.offsetParent) s.focus(); else { setRoute(listRoute()); setTimeout(() => { const l = $("#listSearch"); if (l) l.focus(); }, 0); } }
});
// drag & drop (board columns, calendar days)
let dragId = null;
document.addEventListener("dragstart", e => { const d = e.target.closest && e.target.closest("[data-drag]"); if (!d || d.getAttribute("draggable") !== "true") return; dragId = d.dataset.drag; d.classList.add("dragging"); try { e.dataTransfer.setData("text/plain", dragId); e.dataTransfer.effectAllowed = "move"; } catch (err) {} });
document.addEventListener("dragend", () => { dragId = null; $$(".dragging").forEach(x => x.classList.remove("dragging")); $$(".drop").forEach(x => x.classList.remove("drop")); });
document.addEventListener("dragover", e => { if (!dragId) return; const z = e.target.closest("[data-col],[data-day]"); if (!z) return; e.preventDefault(); $$(".drop").forEach(x => x !== z && x.classList.remove("drop")); z.classList.add("drop"); });
document.addEventListener("drop", e => { if (!dragId) return; const z = e.target.closest("[data-col],[data-day]"); if (!z) return; e.preventDefault(); const id = dragId; dragId = null; z.classList.remove("drop"); if (z.dataset.col) setStatus(id, z.dataset.col); else moveDue(id, z.dataset.day); });
// radar tooltip
document.addEventListener("mouseover", e => { const b = e.target.closest && e.target.closest(".blip"); const tip = $("#radarTip"); if (!tip) return; if (!b) { tip.hidden = true; return; } const box = $("#radar").getBoundingClientRect(); const r = b.getBoundingClientRect(); tip.textContent = b.dataset.tip; tip.style.left = (r.left + r.width / 2 - box.left) + "px"; tip.style.top = (r.top - box.top) + "px"; tip.hidden = false; });
document.addEventListener("focusin", e => { if (e.target.classList && e.target.classList.contains("blip")) e.target.dispatchEvent(new MouseEvent("mouseover", { bubbles: true })); });
document.addEventListener("toggle", e => { if (e.target.classList && e.target.classList.contains("nav-more")) UI.navMore = e.target.open; }, true);
// A reset link pasted into a tab that already has the site open only changes the #part, so catch it here too.
window.addEventListener("hashchange", async () => {
  if (!ACCOUNT.on) return;
  if (/^#verify=/.test(location.hash)) { const msg = await takeVerifyToken(); if (msg) { if (ACCOUNT.user) { toast(msg); if (UI.route === "prefs") render({ soft: true }); } else showAuth(null, true, msg); } return; }
  if (takeResetToken()) showAuth();
});
window.addEventListener("hashchange", () => { const h = location.hash.slice(1); if (h && h !== UI.route && state && state.workspaces.length && /^[a-z]+$/.test(h)) setRoute(h, false); });

/* =========================================================
   Clock
   ========================================================= */
let lastSig = "", tickN = 0;
setInterval(() => {
  if (!state || !state.workspaces || !state.workspaces.length) return;
  const now = Date.now(); tickN++;
  $$("[data-cd]").forEach(el => { el.textContent = countdown(el.dataset.cd, now); });
  $$("[data-ecd]").forEach(el => { const v = examCountdown(el.dataset.ecd, now); const bs = el.querySelectorAll("b"); bs[0].textContent = v[0]; bs[1].textContent = v[1]; bs[2].textContent = v[2]; if (bs[3]) bs[3].textContent = pad(v[3]); });
  if (UI.focus) {
    const left = focusLeft();
    if (UI.focus.running && left <= 0) { finishFocus(true, true); return; }
    const tm = `${pad(Math.floor(left / 60))}:${pad(Math.floor(left % 60))}`;
    const a = $("#fringTm"), b = $("#fmTm"); if (a) a.textContent = tm; if (b) b.textContent = tm;
    const p1 = $("#fringPr"); if (p1) p1.style.strokeDashoffset = (2 * Math.PI * 56 * (1 - left / UI.focus.total)).toFixed(1);
    const p2 = $("#fmPr"); if (p2) p2.style.strokeDashoffset = (2 * Math.PI * 14 * (1 - left / UI.focus.total)).toFixed(1);
  }
  runReminders();
  if (tickN % 15 === 0) {
    const w = W(); const R = radar(w, now);
    const sig = w.items.map(i => levelOf(R, i)).join("") + ymd(now);
    if (sig !== lastSig) { lastSig = sig; if (!modalKind && !(UI.route === "assistant" && document.activeElement && document.activeElement.id === "aiInput")) render({ soft: true }); }
  }
}, 1000);

/* =========================================================
   Start
   ========================================================= */
function afterLoad(){
  if (!state || !state.workspaces || !state.workspaces.length) { render(); return; }
  state.read = state.read || {}; state.inbox = state.inbox || []; state.fired = state.fired || {};
  // Older saves may lack fields that were added later; fill only what's missing, never overwrite.
  state.workspaces.forEach(x => { x.chat = x.chat || []; x.items.forEach(i => {
    const base = mkItem(x, {}); Object.keys(base).forEach(k => { if (i[k] === undefined) i[k] = base[k]; });
    i.kind = i.due ? "deadline" : "todo";
  }); });
  if (!state.workspaces.find(x => x.id === state.active)) state.active = state.workspaces[0].id;
  if (Store.mode !== "server") { try { localStorage.setItem(LS_V2, JSON.stringify(state)); } catch (e) {} }
  const h = location.hash.slice(1);
  UI.route = routeAllowed(h) ? h : (routeAllowed(UI.route) ? UI.route : "overview");
  UI.animate = true; closeModalIfOnb();
  render(); reminderBoot = true; UI.forceNotice = true; runReminders(); renderBell();
}
function closeModalIfOnb(){ $("#onb").hidden = true; }
/* Test seam: only exposed when the page is opened with ?dt-test (used by the automated tests). */
if (/[?&]dt-test\b/.test(location.search)) {
  window.__DT_TEST__ = { motion: MOTION, showAuth: () => { ACCOUNT.mode = "login"; showAuth(); }, weekStats, parseQuick, extractFromText, radar, estimateInsight, checkinCandidate, rulesPlan, runReminders, AI, planFor, backwardPlan, chunkPlan, conflicts, notifs, availHours, progressOf, remainingH, mkItem, newWorkspace, levelOf,
    SFX, DW, get state(){ return state; }, set state(v){ state = v; }, W, render, save };
}
// Start: with the Deadline Tracker server you log in and your data comes from your account;
// anywhere else (claude.ai, a plain file server) it's saved in this browser as before.
(async function boot(){
  const acct = await checkAccounts();
  if (acct) {
    ACCOUNT.on = true; ACCOUNT.user = acct.user;
    const verified = await takeVerifyToken();
    const resetting = takeResetToken();
    if (resetting || !acct.user) {
      if (!resetting && !verified && portalWanted()) showPortal();   // logged-out visitors first see the landing page
      else showAuth(null, false, verified);
      detectAI(); return;
    }
    if (verified) setTimeout(() => toast(verified), 600);
    await initServerStore();
  } else initStore();
  afterLoad();
  if (ACCOUNT.importable && !state) offerImport();
  detectAI();
})();
})();
