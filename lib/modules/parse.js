// Reads what someone types ("I have a Java assignment tomorrow and a Maths test on Friday") into task suggestions.
// Simple, explainable rules; runs on our server, so private plans never go to an outside AI.
// It never invents a date: a task with no day mentioned gets no day.
const T = require("../time");

const WD = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const WD_RE = "(sun(?:day)?|mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?)";
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MON_RE = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const WORDN = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, half: .5 };
const wdIndex = s => WD.findIndex(d => d.startsWith(s.toLowerCase().slice(0, 3)));
const DEADLINE_RE = /\b(due|deadline|submit(?:ted)?\s+(?:it\s+)?by|submission|last date)\b/i;
const EXAM_RE = /\b(exam|midterm|mid-term|mid sem|end sem|finals?|quiz|viva|test)\b/i;
const STUDY_RE = /\b(study|studying|revise|revision|prepare|preparation|practice|practise|prep)\b/i;

// Hinglish (Hindi in English letters) -> words the rules understand. Only applied when the text looks Hinglish.
const HINGLISH_RE = /\b(hai|hain|karna|karni|karne|karo|kal|aaj|parso|mujhe|kya|aur|bana|banao|padhna|padhai|baje|ghante|ghanta|subah|shaam|raat)\b/i;
function fixHinglish(s){
  s = String(s || "");
  if (!HINGLISH_RE.test(s)) return s;
  const am = /\bsubah\b/i.test(s), pm = /\b(shaam|raat)\b/i.test(s);
  return s.replace(/\bparso\b/gi, "day after tomorrow").replace(/\bkal\b/gi, "tomorrow").replace(/\baaj\b/gi, "today")
    .replace(/\b(\d{1,2})\s*baje\b/gi, (m, h) => { h = +h; return `${h}${am ? "am" : pm ? "pm" : h >= 8 && h <= 11 ? "am" : "pm"}`; })
    .replace(/\b(\d+(?:\.\d+)?|ek|do|teen|char|chaar|paanch)\s*(ghante|ghanta)\b/gi, (m, n) => `for ${({ ek: 1, do: 2, teen: 3, char: 4, chaar: 4, paanch: 5 })[String(n).toLowerCase()] || n} hours`)
    .replace(/\b(subah|shaam)\b/gi, "").replace(/\braat\s+ko\b/gi, "tonight").replace(/\b(padhai|padhna|padhni)\b/gi, "study")
    .replace(/\b(karna|karni|karne|krna)\s+(hai|h|he|hain|padega|padegi)\b/gi, "").replace(/\b(hai|hain|mujhe|bhi)\b/gi, "")
    .replace(/\baur\b/gi, "and").replace(/\b(mera|meri|mere)\b/gi, "my").replace(/\s+(ka|ki|ke|ko)\s+/gi, " ").replace(/\s{2,}/g, " ").trim();
}
// "tommorow", "tommorw", "tmrw" ... -> tomorrow
const fixTypos = s => String(s || "").replace(/\b(t+o?m+o?r+o*w+|tmrw|tmr|tmw|tomorow|tommorrow)\b/gi, "tomorrow");
const normalize = s => fixHinglish(fixTypos(s));

// One phrase -> { title, date, time, estimate, priority, deadline }
function parseOne(text, today){
  const r = { date: null, time: null, estimate: null, priority: null, deadline: false };
  let s = " " + text.replace(/\s+/g, " ") + " ";
  const cut = (re, fn) => { const m = s.match(re); if (m && fn(m) !== false) s = s.replace(m[0], " "); return m; };
  const nextWd = (target, kind) => { const cur = T.weekday(today); let diff = (target - cur + 7) % 7; if (kind === "this") return T.addDays(today, diff); if (diff === 0) diff = 7; let d = T.addDays(today, diff); if (kind === "next" && diff <= 6 - ((cur + 6) % 7)) d = T.addDays(d, 7); return d; };
  const mkDate = (dd, mi, yy) => { const y = yy ? (String(yy).length === 2 ? 2000 + +yy : +yy) : +today.slice(0, 4); let d = `${y}-${T.pad(mi + 1)}-${T.pad(dd)}`; if (!T.validDate(d)) return null; if (!yy && d < today) d = `${y + 1}-${T.pad(mi + 1)}-${T.pad(dd)}`; return T.validDate(d) ? d : null; };
  // effort
  cut(/\s(?:for\s+)?(?:~|about |around |approx\.? )?(\d+(?:\.\d+)?|an?|one|two|three|four|five|six|seven|eight|half an?)\s?(?:h|hr|hrs|hour|hours)\b(?: of work)?/i, m => { const v = WORDN[m[1].toLowerCase().split(" ")[0]] ?? parseFloat(m[1]); r.estimate = v; });
  if (r.estimate == null) cut(/\s(?:for\s+)?(?:~|about )?(\d+)\s?(?:min|mins|minutes)\b/i, m => { r.estimate = Math.round(+m[1] / 60 * 100) / 100; });
  // priority
  cut(/\s(!{1,3}high|urgent|asap|high priority|important)(?=\s)/i, () => { r.priority = "high"; });
  if (!r.priority) cut(/\s(!low|low priority|optional|if (?:i have )?time)(?=\s)/i, () => { r.priority = "low"; });
  // time
  cut(/\s(?:at |by )?(\d{1,2})(?:[:.](\d{2}))?\s?(am|pm|a\.m\.|p\.m\.)(?=[\s,.;]|$)/i, m => { let h = +m[1]; const mi = m[2] ? +m[2] : 0; if (h < 1 || h > 12 || mi > 59) return false; h = h % 12 + (/p/i.test(m[3]) ? 12 : 0); r.time = `${T.pad(h)}:${T.pad(mi)}`; });
  if (!r.time) cut(/\s(?:at |by )([01]?\d|2[0-3]):([0-5]\d)\b/, m => { r.time = `${T.pad(+m[1])}:${m[2]}`; });
  if (!r.time) cut(/\s(?:at |by )?(noon|midday)\b/i, () => { r.time = "12:00"; });
  if (!r.time) cut(/\s(?:at |by )?midnight\b/i, () => { r.time = "23:59"; });
  if (!r.time) cut(/\s(?:by )?(eod|end of (?:the )?day)\b/i, () => { r.time = "18:00"; });
  if (!r.time) cut(/\s(?:in the )?(morning|afternoon|evening)\b/i, m => { r.time = { morning: "09:00", afternoon: "15:00", evening: "18:00" }[m[1].toLowerCase()]; });
  // date
  const pre = "(?:by |on |due |before |for |till |until )?";
  const set = d => { if (d) r.date = d; return !!d; };
  if (!r.date) cut(new RegExp("\\s" + pre + "(day after tomorrow)\\b", "i"), () => set(T.addDays(today, 2)));
  if (!r.date) cut(new RegExp("\\s" + pre + "(today)\\b", "i"), () => set(today));
  if (!r.date) cut(new RegExp("\\s" + pre + "(tonight)\\b", "i"), () => { set(today); if (!r.time) r.time = "21:00"; });
  if (!r.date) cut(new RegExp("\\s" + pre + "(tomorrow)\\b", "i"), () => set(T.addDays(today, 1)));
  if (!r.date) cut(/\s(?:in|within) (\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten) (days?|weeks?)\b/i, m => { const n = WORDN[m[1].toLowerCase()] || +m[1]; return set(T.addDays(today, /week/i.test(m[2]) ? n * 7 : n)); });
  if (!r.date) cut(new RegExp("\\s" + pre + "(next week)\\b", "i"), () => set(nextWd(1, "plain")));
  if (!r.date) cut(new RegExp("\\s" + pre + "(end of (?:the |this )?week)\\b", "i"), () => set(nextWd(5, "this")));
  if (!r.date) cut(new RegExp("\\s" + pre + "(this weekend|the weekend|weekend)\\b", "i"), () => set(nextWd(6, "this")));
  if (!r.date) cut(new RegExp("\\s" + pre + "(next|this|coming) " + WD_RE + "\\b", "i"), m => set(nextWd(wdIndex(m[2]), m[1].toLowerCase() === "coming" ? "plain" : m[1].toLowerCase())));
  if (!r.date) cut(/\s(?:by |on |due |before )?(\d{4})-(\d{2})-(\d{2})\b/, m => set(T.validDate(`${m[1]}-${m[2]}-${m[3]}`) ? `${m[1]}-${m[2]}-${m[3]}` : null));
  if (!r.date) cut(new RegExp("\\s" + pre + "(\\d{1,2})(?:st|nd|rd|th)?(?: of)? " + MON_RE + "(?:,? (\\d{4}))?\\b", "i"), m => set(mkDate(+m[1], MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()), m[3])));
  if (!r.date) cut(new RegExp("\\s" + pre + MON_RE + " (\\d{1,2})(?:st|nd|rd|th)?(?:,? (\\d{4}))?\\b", "i"), m => set(mkDate(+m[2], MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()), m[3])));
  if (!r.date) cut(/\s(?:by |on |due |before )?(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/, m => { const a = +m[1], b = +m[2]; const dd = a > 12 ? a : b > 12 ? b : a, mm = a > 12 ? b : b > 12 ? a : b; return mm >= 1 && mm <= 12 ? set(mkDate(dd, mm - 1, m[3])) : false; });
  if (!r.date) cut(new RegExp("\\s" + pre + WD_RE + "\\b", "i"), m => set(nextWd(wdIndex(m[1]), "plain")));
  // A deadline when the words say so ("due", "deadline", "submit by", "complete by Sunday"), for exams and tests,
  // and for coursework like an assignment or report given a date (unless it's only working on it).
  const working = /\b(work on|working on|start|continue|practi[cs]e|study|revise|read)\b/i.test(text);
  r.deadline = DEADLINE_RE.test(text) || (EXAM_RE.test(text) && !STUDY_RE.test(text))
    || /\b(by|before|till|until)\s+(today|tonight|tomorrow|next|this|end|\d|(?:sun|mon|tue|wed|thu|fri|sat)\w*|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*)/i.test(text)
    || (/\b(assignment|homework|report|essay|thesis|lab record|project)\b/i.test(text) && !working);
  r.exam = EXAM_RE.test(text) && !STUDY_RE.test(text);
  // title
  let t = s.replace(/\s+/g, " ").trim()
    .replace(/^(and|then|also|plus|but)\s+/i, "")
    .replace(/^(?:i\s+)?(?:have got to|have to|need to|must|should|want to|will|gotta|got to|plan to|am going to|have)\s+/i, "")
    .replace(/^(?:remind me to|remember to|please|add|todo:?)\s+/i, "")
    .replace(/\b(?:is|are)?\s*(?:due|deadline)\b/gi, " ").replace(/\b(my|our)\s+/gi, "")
    .replace(/^(a|an|the)\s+/i, "").replace(/\s+/g, " ").trim();
  for (let k = 0; k < 3; k++) t = t.replace(/[\s,;:.\-–]+$/, "").replace(/\s(by|on|at|before|for|in|and|the|is|are|of|to|till|until)$/i, "").trim();
  const m2 = t.match(/^(.+?)\s+to\s+(complete|finish|submit|do|prepare|study for|review)$/i);
  if (m2) t = `${m2[2]} ${m2[1].replace(/^(a|an|the)\s+/i, "")}`;
  r.title = t ? t.charAt(0).toUpperCase() + t.slice(1) : "";
  return r;
}

// Whole message -> list of suggested tasks.
function extract(text, { today, now, tz }){
  const prepped = normalize(text);
  const frags = prepped.split(/\s*[,;\n]\s*(?:and\s+|then\s+)?|\.\s+(?=[A-Z])|\s+and\s+(?=(?:also\s+)?(?:a|an|the|my|i|to|\w+\s))|\s+then\s+/i).map(x => x.trim()).filter(Boolean);
  const parsed = frags.map(f => ({ f, p: parseOne(f, today) }));
  // "Tomorrow I have to X, Y and Z": a day said once at the start applies to the whole list
  const lead = parseOne(prepped.split(/[,;\n]/)[0], today);
  const shared = parsed.filter(x => x.p.date).length === 1 && parsed[0].p.date && lead.date ? lead.date : null;
  const out = [];
  parsed.forEach(({ f, p }) => {
    if (!p.title || p.title.length < 2 || /^(i|it|that|this|so|ok|okay|please|thanks?)$/i.test(p.title)) return;
    const date = p.date || shared;
    const isDeadline = !!(p.deadline && date);
    const time = p.time || (isDeadline ? (p.exam ? "09:00" : "23:59") : null);
    const soon = date && T.zonedToUtc(date, time || "23:59", tz) - now < 2 * 864e5;
    const priority = p.priority || (p.exam || /\b(submit|submission|pay|fee|interview)\b/i.test(f) || (isDeadline && soon) ? "high" : "medium");
    out.push({ type: "create", keep: true, title: p.title.slice(0, 200), date, time, isDeadline, exam: p.exam, priority, estimate: p.estimate,
      reminders: isDeadline ? [1440, 60] : time ? [15] : [] });
  });
  return out;
}
module.exports = { extract, parseOne, normalize, fixHinglish, fixTypos };
