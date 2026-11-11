// Run from the project folder: node tests/load/make-icons.js icons
// Draws the app icons from the same mark as the logo (ink square, ring, tick) and saves them as PNG.
const { chromium } = require("playwright"); const path = require("path");
const mark = (scale) => `<g transform="translate(256 256) scale(${scale}) translate(-32 -32)"><circle cx="32" cy="33" r="17" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="5"/><path d="M32 16 A17 17 0 1 1 17.28 24.5" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round"/><path d="M24.5 33.5 30 39 40.5 27.5" fill="none" stroke="#fff" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="32" cy="16" r="4" fill="#99b6d2" stroke="#fff" stroke-width="1.5"/></g>`;
const grad = `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2a2d31"/><stop offset="1" stop-color="#151515"/></linearGradient></defs>`;
const any = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${grad}<rect width="512" height="512" rx="116" fill="url(#g)"/>${mark(8)}</svg>`;
const full = s => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${grad}<rect width="512" height="512" fill="url(#g)"/>${mark(s)}</svg>`;   // full-bleed: the device cuts its own shape
(async () => {
  const b = await chromium.launch(); const out = process.argv[2];
  for (const [name, size, svg, transparent] of [["icon-192", 192, any, true], ["icon-512", 512, any, true], ["maskable-192", 192, full(5.6), false], ["maskable-512", 512, full(5.6), false], ["apple-touch-icon", 180, full(6.6), false]]) {
    const p = await b.newPage({ viewport: { width: size, height: size } });
    await p.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
    await p.screenshot({ path: path.join(out, name + ".png"), omitBackground: transparent, clip: { x: 0, y: 0, width: size, height: size } }); await p.close();
  }
  await b.close();
})();
