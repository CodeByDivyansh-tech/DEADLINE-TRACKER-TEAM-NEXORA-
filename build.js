// Builds index.html from the source parts in src/.
const fs = require("fs");
const path = require("path");
const parts = ["part1.html", "part2.js", "part3.js", "todo.js", "ai.js", "account.js", "widget.js", "part4.js"];
const out = parts.map(p => fs.readFileSync(path.join(__dirname, "src", p), "utf8")).join("");
fs.writeFileSync(path.join(__dirname, "index.html"), out);
console.log(`Built index.html (${(out.length / 1024).toFixed(0)} KB)`);
