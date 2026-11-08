// Start-up speed of the real server + app: first visit (empty cache) and return visit (cached), on a simulated
// phone (CPU 4x slower) with 4G-like network (100 ms latency, 10 Mbit/s). Reports first paint and the moment the
// log-in screen (visitor) or the app (signed in) is usable. Run: node tests/load/speed.js [runs=5]
const { chromium } = require("playwright");
const { startServer } = require("../srv");
const RUNS = Number(process.argv[2]) || 5;
const med = a => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
(async () => {
  const s = await startServer({}); const b = await chromium.launch();
  const out = {};
  async function measure(label, ctx, ready){
    const p = await ctx.newPage(); const cdp = await ctx.newCDPSession(p);
    await cdp.send("Network.enable"); await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 100, downloadThroughput: 10e6 / 8, uploadThroughput: 5e6 / 8 });
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    const t0 = Date.now(); await p.goto(s.base + "/", { waitUntil: "commit" }); await p.waitForSelector(ready, { timeout: 30000 }); const usable = Date.now() - t0;
    const fcp = await p.evaluate(() => { const e = performance.getEntriesByName("first-contentful-paint")[0]; return e ? Math.round(e.startTime) : null; });
    const kb = await p.evaluate(() => Math.round(performance.getEntriesByType("resource").concat(performance.getEntriesByType("navigation")).reduce((a, r) => a + (r.transferSize || 0), 0) / 1024));
    (out[label] = out[label] || { fcp: [], usable: [], kb: [] }); out[label].fcp.push(fcp); out[label].usable.push(usable); out[label].kb.push(kb);
    await p.close();
  }
  // a signed-in member (cookie kept in the context)
  const member = await b.newContext();
  { const p = await member.newPage(); await p.goto(s.base + "/"); await p.waitForSelector(".auth-card"); await p.click("[data-act=authmode][data-v=signup]");
    await p.fill("#au-name", "Speed"); await p.fill("#au-email", "speed@example.com"); await p.fill("#au-pass", "password123"); await p.click("#authGo");
    await p.waitForSelector("#onb-name"); await p.fill("#onb-name", "Speed"); await p.click("[data-act=onbnext]"); await p.click("[data-act=onbmode][data-v=student]"); await p.click("[data-act=onbnext]"); await p.click("[data-act=onbdone]"); await p.waitForSelector("#app:not([hidden])"); await p.waitForTimeout(1500); await p.close(); }
  for (let k = 0; k < RUNS; k++) {
    const fresh = await b.newContext(); await measure("visitor, first visit", fresh, ".auth-card #authGo"); await measure("visitor, return visit", fresh, ".auth-card #authGo"); await fresh.close();
    await measure("member, return visit", member, "#app:not([hidden]) #viewInner > *");
  }
  for (const [k, v] of Object.entries(out)) console.log(`${k.padEnd(24)} first paint ${String(med(v.fcp)).padStart(5)} ms · usable ${String(med(v.usable)).padStart(5)} ms · downloaded ${med(v.kb)} KB`);
  await b.close(); s.stop();
})().catch(e => { console.error(e); process.exit(1); });
