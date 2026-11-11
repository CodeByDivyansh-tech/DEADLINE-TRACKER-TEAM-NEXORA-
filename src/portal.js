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
    <a class="pt-logo" href="#" data-pt="top" aria-label="Deadline Tracker home">${logoSVG(30)}<span>Deadline Tracker</span></a>
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
