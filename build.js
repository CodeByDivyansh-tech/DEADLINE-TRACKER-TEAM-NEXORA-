// Builds index.html from the source parts in src/.
// GSAP (vendor/gsap.min.js, GreenSock's standard no-charge licence) is inlined in its own <script> before the app,
// so the page stays one file and needs no outside download. The app still works if it is missing.
const fs = require("fs");
const path = require("path");
const parts = ["part1.html", "part2.js", "part3.js", "todo.js", "ai.js", "account.js", "widget.js", "motion.js", "part4.js"];
const read = p => fs.readFileSync(path.join(__dirname, "src", p), "utf8");
const gsapFile = path.join(__dirname, "vendor", "gsap.min.js");
const gsap = fs.existsSync(gsapFile) ? `<script>\n${fs.readFileSync(gsapFile, "utf8")}\n</script>\n` : "";
if (/<\/script/i.test(gsap.slice(8, -10))) throw new Error("vendor/gsap.min.js must not contain </script>");
const out = parts.map((p, i) => (i === 1 ? gsap : "") + read(p)).join("");
fs.writeFileSync(path.join(__dirname, "index.html"), out);
console.log(`Built index.html (${(out.length / 1024).toFixed(0)} KB${gsap ? ", GSAP inlined" : ""})`);
