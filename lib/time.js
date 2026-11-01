// Time zones without extra packages. Dates are "YYYY-MM-DD" and times "HH:MM" in the user's own time zone;
// moments are stored as UTC milliseconds.
const pad = n => String(n).padStart(2, "0");
function validTz(tz){ try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return typeof tz === "string" && tz.length < 64; } catch (e) { return false; } }
const fmts = new Map();
function parts(ms, tz){
  let f = fmts.get(tz);
  if (!f) { f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", weekday: "short" }); fmts.set(tz, f); }
  const p = {}; f.formatToParts(new Date(ms)).forEach(x => { p[x.type] = x.value; });
  return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour % 24, mi: +p.minute, s: +p.second, wd: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday) };
}
const offsetMs = (ms, tz) => { const p = parts(ms, tz); return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - Math.floor(ms / 1000) * 1000; };
// "2026-10-31", "17:00", "Asia/Kolkata" -> UTC milliseconds
function zonedToUtc(date, time, tz){
  const [y, m, d] = date.split("-").map(Number); const [hh, mm] = (time || "00:00").split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  let t = guess - offsetMs(guess, tz);
  const o2 = offsetMs(t, tz); if (guess - o2 !== t) t = guess - o2;
  return t;
}
function localDate(ms, tz){ const p = parts(ms, tz); return `${p.y}-${pad(p.mo)}-${pad(p.d)}`; }
function localTime(ms, tz){ const p = parts(ms, tz); return `${pad(p.h)}:${pad(p.mi)}`; }
function weekday(date){ const [y, m, d] = date.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); }
function addDays(date, n){ const [y, m, d] = date.split("-").map(Number); const t = new Date(Date.UTC(y, m - 1, d + n)); return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`; }
function daysBetween(a, b){ const p = s => { const [y, m, d] = s.split("-").map(Number); return Date.UTC(y, m - 1, d); }; return Math.round((p(b) - p(a)) / 864e5); }
const validDate = s => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && addDays(s, 0) === s;
const validTime = s => typeof s === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
const WD = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function niceDate(date, today){
  if (today) { const k = daysBetween(today, date); if (k === 0) return "today"; if (k === 1) return "tomorrow"; if (k === -1) return "yesterday"; }
  const [, m, d] = date.split("-").map(Number); return `${WD[weekday(date)].slice(0, 3)}, ${d} ${MON[m - 1]}`;
}
function niceTime(t){ if (!t) return ""; let [h, m] = t.split(":").map(Number); const ap = h >= 12 ? "pm" : "am"; h = h % 12 || 12; return `${h}:${pad(m)} ${ap}`; }
module.exports = { pad, validTz, parts, zonedToUtc, localDate, localTime, weekday, addDays, daysBetween, validDate, validTime, niceDate, niceTime, WD, MON };
