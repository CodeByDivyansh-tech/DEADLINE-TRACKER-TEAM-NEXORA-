// Tidies assistant answers before anyone sees them:
// - money in the person's currency (Indian Rupees by default, with Indian digit grouping: ₹1,50,000),
//   unless they asked about another currency themselves;
// - no code fences, "Answer:" labels or long runs of blank lines.
const CURRENCIES = {
  INR: { symbol: "₹", locale: "en-IN", name: "Indian Rupees" },
  USD: { symbol: "$", locale: "en-US", name: "US Dollars" },
  EUR: { symbol: "€", locale: "en-IE", name: "Euros" },
  GBP: { symbol: "£", locale: "en-GB", name: "British Pounds" },
  AED: { symbol: "AED ", locale: "en-AE", name: "UAE Dirhams" },
  SGD: { symbol: "S$", locale: "en-SG", name: "Singapore Dollars" },
  AUD: { symbol: "A$", locale: "en-AU", name: "Australian Dollars" },
  CAD: { symbol: "C$", locale: "en-CA", name: "Canadian Dollars" },
  JPY: { symbol: "¥", locale: "ja-JP", name: "Japanese Yen" }
};
const pickCurrency = c => { const k = String(c || "").toUpperCase(); return CURRENCIES[k] ? k : "INR"; };
function formatMoney(n, currency){
  const c = CURRENCIES[pickCurrency(currency)];
  const cents = currency !== "JPY" && Math.round(n * 100) % 100 !== 0;
  return c.symbol + new Intl.NumberFormat(c.locale, { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 }).format(n);
}
// Words that show the person asked about a particular currency.
const MENTIONS = { USD: /\$|\busd\b|\bdollars?\b/i, EUR: /€|\beur\b|\beuros?\b/i, GBP: /£|\bgbp\b|\bpounds?\b/i, AED: /\baed\b|\bdirhams?\b/i, JPY: /¥|\bjpy\b|\byen\b/i,
  SGD: /\bsgd\b/i, AUD: /\baud\b/i, CAD: /\bcad\b/i, INR: /₹|\binr\b|\brs\.?|\brupees?\b/i };
const NUM = "(\\d[\\d,]*(?:\\.\\d+)?)";
const MONEY_RE = new RegExp(`(?:(?:US\\s?)?\\$|\\b(?:USD|INR|EUR|GBP|Rs\\.?)\\s?|[₹€£])\\s?${NUM}|${NUM}\\s?(?:USD|INR|dollars?|rupees?|euros?)\\b`, "gi");
// Code (``` blocks and `inline`) is left exactly as written: "$" there is code, not money.
const CODE_RE = /```[\s\S]*?(?:```|$)|`[^`\n]*`/g;
function outsideCode(text, fn){
  const t = String(text); let out = "", last = 0, m;
  CODE_RE.lastIndex = 0;
  while ((m = CODE_RE.exec(t))) { out += fn(t.slice(last, m.index)) + m[0]; last = m.index + m[0].length; }
  return out + fn(t.slice(last));
}
function localizeMoney(text, { currency, question } = {}){
  const cur = pickCurrency(currency);
  // They asked about a different currency (e.g. "100 USD in rupees?"): keep the answer's own amounts.
  if (question && Object.keys(MENTIONS).some(k => k !== cur && MENTIONS[k].test(question))) return String(text);
  return outsideCode(text, part => part.replace(MONEY_RE, (m, a, b) => {
    const n = parseFloat(String(a || b).replace(/,/g, ""));
    return Number.isFinite(n) ? formatMoney(n, cur) : m;
  }));
}
function cleanAnswer(text){
  let t = String(text || "").trim();
  // a whole answer wrapped in one ```markdown fence: unwrap it (real code blocks inside answers are kept)
  const w = t.match(/^```(?:markdown|md|text)?\s*\n([\s\S]*)\n```$/i); if (w && !/```/.test(w[1])) t = w[1];
  return outsideCode(t.replace(/^\s*(?:answer|response|reply)\s*:\s*/i, ""), p => p.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n")).trim();
}
// The style and money part of the system prompt.
function styleRules(currency){
  const cur = pickCurrency(currency), c = CURRENCIES[cur];
  return `STYLE
- Sound like a friendly, knowledgeable person. Start with a direct answer in one or two sentences.
- Then add what helps: short paragraphs, "- " bullets, or "1." for steps. Use "## " headings only for longer answers with several parts. Use **bold** sparingly. A small Markdown table is fine when comparing things.
- Match the length to the question: a short question gets a short answer; "explain in detail", timetables and step-by-step guides can be long.
- Code: put it in a fenced code block with the language name (\`\`\`python ... \`\`\`), keep it complete and runnable, then explain the key lines briefly.
- Maths: show the steps, one per line, and give the final answer clearly. Use plain text like x^2 and sqrt(x), not LaTeX.
- Plain words. Explain any necessary term in a few words.
MONEY
- The user's currency is ${c.name} (${cur}, ${c.symbol.trim()}). Write amounts like ${formatMoney(150000, cur)}${cur === "INR" ? " (Indian digit grouping: lakhs and crores)" : ""}. Never use $ or USD unless the user asks about dollars.`;
}
module.exports = { CURRENCIES, pickCurrency, formatMoney, localizeMoney, cleanAnswer, styleRules };
