// Builds the app from the source parts in src/.
//  - index.html: markup + CSS, plus two script files the browser downloads in parallel and keeps
//    (assets/gsap.<hash>.js and assets/app.<hash>.js, with `defer`). The name changes when the content changes,
//    so they can be cached for a year; return visits then download only the small page (or nothing).
//    Before: one 550 KB page with everything inline, sent with "no-store" and re-read on every visit.
//  - standalone.html: everything in one file, as before, for places that can only show one file (previews).
// GSAP (vendor/gsap.min.js, GreenSock's standard no-charge licence) runs before the app; the app works without it.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const ROOT = __dirname, ASSETS = path.join(ROOT, "assets");
const parts = ["part1.html", "part2.js", "part3.js", "todo.js", "ai.js", "account.js", "widget.js", "motion.js", "portal.js", "part4.js"];
const read = p => fs.readFileSync(path.join(ROOT, "src", p), "utf8");

const html = read("part1.html");
const code = parts.slice(1).map(read).join("");
// the app code sits between "<script>" (start of part2.js) and "</script></body></html>" (end of part4.js)
const open = code.indexOf("<script>"), close = code.lastIndexOf("</script>");
if (open !== 0 || close < 0) throw new Error("src/part2.js must start with <script> and src/part4.js must end with </script></body></html>");
const appJs = code.slice("<script>".length, close).trim() + "\n";
const tail = code.slice(close + "</script>".length);   // "</body></html>"
const gsapFile = path.join(ROOT, "vendor", "gsap.min.js");
const gsapJs = fs.existsSync(gsapFile) ? fs.readFileSync(gsapFile, "utf8") : "";
for (const [n, js] of [["app", appJs], ["gsap", gsapJs]]) if (/<\/script/i.test(js)) throw new Error(`${n} code must not contain </script>`);

const hash = s => crypto.createHash("sha256").update(s).digest("hex").slice(0, 10);
fs.mkdirSync(ASSETS, { recursive: true });
for (const f of fs.readdirSync(ASSETS)) if (/^(app|gsap)\.[0-9a-f]{10}\.js$/.test(f)) fs.unlinkSync(path.join(ASSETS, f));   // old builds
const files = [];
if (gsapJs) { const f = `gsap.${hash(gsapJs)}.js`; fs.writeFileSync(path.join(ASSETS, f), gsapJs); files.push(f); }
const appName = `app.${hash(appJs)}.js`; fs.writeFileSync(path.join(ASSETS, appName), appJs); files.push(appName);

// in <head>, so the download starts with the first bytes of the page; `defer` still runs them after the markup, in order
if (!html.includes("</head>")) throw new Error("src/part1.html needs a </head>");
const tags = files.map(f => `<script defer src="/assets/${f}"></script>\n`).join("");
const page = html.replace("</head>", tags + "</head>") + tail;
fs.writeFileSync(path.join(ROOT, "index.html"), page);
const single = html + (gsapJs ? `<script>\n${gsapJs}\n</script>\n` : "") + `<script>\n${appJs}</script>\n` + tail;
fs.writeFileSync(path.join(ROOT, "standalone.html"), single);
const kb = n => (n / 1024).toFixed(0) + " KB";
console.log(`Built index.html (${kb(page.length)}) + assets/${files.join(", assets/")} (${kb(appJs.length + gsapJs.length)}); standalone.html (${kb(single.length)})`);
