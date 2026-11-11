// Renders the Deadline Tracker app icon from the 3D scene in brand/icon-scene.html.
//   node brand/render-icon.js <preset> <size> <samples-per-axis> <out.png> [json overrides]
// Presets: "master" (the 1024 master), "small" (closer, thicker check, no trail: for 16-48 px),
//          "maskable" (further back, so cube and check sit inside the 80% safe circle).
const fs = require("fs"); const path = require("path");
const { chromium } = require("playwright");
const PRESETS = {
  master:   { yaw: 0.38, pitch: 0.30, kyaw: 0.38, kpitch: 0.30, ring: 1.1, ringR: 1.24, violet: 1.15, zoom: 0.84, checkR: 0.064, glow: 0.80, floor: 1.0, body: 0.55 },
  small:    { yaw: 0.38, pitch: 0.30, kyaw: 0.38, kpitch: 0.30, ring: 0.0, ringR: 1.24, violet: 1.0, zoom: 0.62, panX: 0.025, panY: 0.025, checkR: 0.10, glow: 1.1, floor: 0.5, body: 0.32 },
  maskable: { yaw: 0.38, pitch: 0.30, kyaw: 0.38, kpitch: 0.30, ring: 1.0, ringR: 1.10, violet: 1.15, zoom: 1.10, checkR: 0.066, glow: 0.85, floor: 1.0, body: 0.55 }
};
(async () => {
  const [preset = "master", size = "1024", spp = "3", out = "out.png", extra = "{}"] = process.argv.slice(2);
  const params = Object.assign({}, PRESETS[preset] || PRESETS.master, JSON.parse(extra));
  const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const page = await browser.newPage();
  page.on("pageerror", e => { console.error(e.message); process.exitCode = 1; });
  await page.goto("file://" + path.join(__dirname, "icon-scene.html"));
  const t0 = Date.now();
  const url = await page.evaluate(([p, s, n]) => window.renderIcon(p, s, n), [params, +size, +spp]);
  fs.writeFileSync(out, Buffer.from(url.split(",")[1], "base64"));
  console.log(`${out}: ${size}px, ${spp}x${spp} samples, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  await browser.close();
})();
