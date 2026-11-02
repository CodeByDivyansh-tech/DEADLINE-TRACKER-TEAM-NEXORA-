
/* =========================================================
   Motion (GSAP)
   One idea, used differently in each place: a panel keeps its full box
   while its visible edge travels (clip-path), and everything attached to
   that edge (the page, a handle, an arrow, labels) moves with it in the
   same timeline. Where it's used:
   - sidebar: collapse to an icon rail and back (the signature move)
   - Deadline AI window: a circle that grows out of its button
   - heads-up panel: unfolds downward, rows drop into place
   - section cards: rise and unfold from their top edge
   - log-in tabs: the pill slides, the form is revealed from that side
   With reduced motion, or if GSAP is missing, every change is instant.
   ========================================================= */
const MOTION = (() => {
  const G = window.gsap && typeof window.gsap.timeline === "function" ? window.gsap : null;
  const reduced = () => { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; } };
  const on = () => !!G && !reduced();
  // GSAP runs on our own clock (performance.now) and only while something moves: no idle animation loop.
  let base = 0, p0 = 0, busyUntil = 0, raf = 0;
  if (G) { G.ticker.remove(G.updateRoot); base = G.globalTimeline.time(); p0 = performance.now(); document.documentElement.classList.add("gs"); }
  const sync = () => G.updateRoot(base + (performance.now() - p0) / 1000);
  const loop = () => { sync(); raf = performance.now() < busyUntil ? requestAnimationFrame(loop) : 0; };
  const timeline = opts => { sync(); return G.timeline(opts); };
  const run = tl => { busyUntil = Math.max(busyUntil, performance.now() + tl.totalDuration() * 1000 + 120); if (!raf) raf = requestAnimationFrame(loop); return tl; };
  const busy = () => !!raf;
  const rectOf = el => el.getBoundingClientRect();

  /* ---------- 1. Sidebar rail ---------- */
  const WIDE = 248, RAIL = 76, CUT = WIDE - RAIL, RAIL_D = 0.62, RAIL_KEY = "dt-rail";
  const edge = r => `inset(0px ${r}px 0px 0px)`;
  const ARROW = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m14.5 6-6 6 6 6"/></svg>`;
  let railTl = null;
  const isRail = () => { const a = document.getElementById("app"); return !!a && a.classList.contains("rail"); };
  function railShell(){
    const app = document.getElementById("app"); if (!app || document.getElementById("railBtn")) return;
    app.insertAdjacentHTML("beforeend", `<button type="button" class="rail-handle" id="railBtn" data-act="rail" aria-controls="side">${ARROW}</button>`);
    let saved = false; try { saved = localStorage.getItem(RAIL_KEY) === "1"; } catch (e) {}
    applyRail(saved);
  }
  function applyRail(rail){
    const app = document.getElementById("app"), btn = document.getElementById("railBtn"); if (!app || !btn) return;
    app.classList.toggle("rail", rail);
    btn.setAttribute("aria-expanded", String(!rail));
    const l = rail ? "Expand the sidebar" : "Collapse the sidebar to icons";
    btn.setAttribute("aria-label", l); btn.title = l;
    if (G) G.set(btn.firstElementChild, { rotation: rail ? 180 : 0 });
  }
  function rail(want){
    const app = document.getElementById("app"), side = document.getElementById("side"), btn = document.getElementById("railBtn");
    if (!app || !side || !btn) return;
    const to = typeof want === "boolean" ? want : !isRail();
    if (to === isRail()) return;
    const main = app.querySelector(".main"), arrow = btn.firstElementChild;
    if (railTl) { railTl.progress(1).kill(); railTl = null; }
    const flips = [...side.querySelectorAll("[data-flip]")];
    const before = { main: rectOf(main).left, handle: rectOf(btn).left, at: flips.map(rectOf) };
    applyRail(to);
    try { localStorage.setItem(RAIL_KEY, to ? "1" : "0"); } catch (e) {}
    renderSide();
    if (!on()) return;
    const fresh = [...side.querySelectorAll("[data-flip]")];
    const tw = { duration: RAIL_D, ease: "power3.inOut" };
    const tl = railTl = timeline({ onComplete(){ G.set([side, main, btn, ...fresh], { clearProps: "clipPath,transform" }); railTl = null; } });
    // the side keeps its wide box while its edge travels
    tl.fromTo(side, { clipPath: edge(to ? 0 : CUT) }, { clipPath: edge(to ? CUT : 0), ...tw }, 0);
    // the page and the handle glide with the edge; the arrow turns over
    tl.fromTo(main, { x: before.main - rectOf(main).left }, { x: 0, ...tw }, 0);
    tl.fromTo(btn, { x: before.handle - rectOf(btn).left }, { x: 0, ...tw }, 0);
    tl.fromTo(arrow, { rotation: to ? 0 : 180 }, { rotation: to ? 180 : 0, ...tw }, 0);
    // whatever moved up, down or sideways follows (matched by its data-flip name)
    fresh.forEach(el => {
      const k = flips.findIndex(f => f.dataset.flip === el.dataset.flip); if (k < 0) return;
      const r = rectOf(el), dx = before.at[k].left - r.left, dy = before.at[k].top - r.top;
      if (Math.abs(dx) > .5 || Math.abs(dy) > .5) tl.fromTo(el, { x: dx, y: dy }, { x: 0, y: 0, ...tw }, 0);
    });
    // labels come back once the edge has passed them
    if (!to) tl.fromTo(side.querySelectorAll(".lbl"), { opacity: 0, x: -10 }, { opacity: 1, x: 0, duration: 0.45, ease: "power2.out", stagger: 0.012, clearProps: "opacity,transform" }, RAIL_D * 0.35);
    run(tl);
  }

  /* ---------- 2. Deadline AI window: a circle out of its button ---------- */
  let dwTl = null;
  function circleFrom(box, fab){
    const b = rectOf(box), f = rectOf(fab);
    const x = f.left + f.width / 2 - b.left, y = f.top + f.height / 2 - b.top;
    const r = Math.hypot(Math.max(x, b.width - x), Math.max(y, b.height - y)) + 2;
    return { at: `at ${x.toFixed(1)}px ${y.toFixed(1)}px`, r };
  }
  function dwOpen(box, fab){
    if (!on() || !box || !fab || box.hidden) return;
    if (dwTl) dwTl.kill(); box.inert = false;
    const c = circleFrom(box, fab);
    const tl = dwTl = timeline({ onComplete(){ G.set(box, { clearProps: "clipPath" }); dwTl = null; } });
    tl.fromTo(box, { clipPath: `circle(24px ${c.at})` }, { clipPath: `circle(${c.r.toFixed(1)}px ${c.at})`, duration: 0.62, ease: "expo.out" }, 0)
      .fromTo(box.querySelectorAll(".dw-h > *"), { opacity: 0, y: -10 }, { opacity: 1, y: 0, duration: 0.4, ease: "power2.out", stagger: 0.04, clearProps: "opacity,transform" }, 0.12)
      .fromTo(box.querySelector(".dw-tabs"), { opacity: 0, scaleX: 0.92 }, { opacity: 1, scaleX: 1, duration: 0.45, ease: "power3.out", clearProps: "opacity,transform" }, 0.18)
      .fromTo(box.querySelectorAll(".dw-msgs > *:nth-last-child(-n+3), .dw-in"), { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.45, ease: "power2.out", stagger: 0.05, clearProps: "opacity,transform" }, 0.24);
    run(tl);
  }
  function dwClose(box, fab, done){
    if (!on() || !box || box.hidden || !fab) { done(); return; }
    if (dwTl) dwTl.kill();
    box.inert = true;
    const c = circleFrom(box, fab);
    const tl = dwTl = timeline({ onComplete(){ box.inert = false; G.set(box, { clearProps: "clipPath" }); dwTl = null; done(); } });
    tl.fromTo(box, { clipPath: `circle(${c.r.toFixed(1)}px ${c.at})` }, { clipPath: `circle(24px ${c.at})`, duration: 0.4, ease: "power3.in" }, 0)
      .to(box.querySelectorAll(".dw-h > *, .dw-tabs, .dw-in"), { opacity: 0, duration: 0.2, ease: "power1.in" }, 0);
    run(tl);
  }

  /* ---------- 3. Heads-up panel: unfolds downward ---------- */
  function unfold(list, chev){
    if (!list) return;
    if (!on()) return;
    const h = list.offsetHeight, mt = getComputedStyle(list).marginTop;
    const tl = timeline({ onComplete(){ G.set([list, ...list.children, chev].filter(Boolean), { clearProps: "height,marginTop,clipPath,transform,opacity,overflow" }); } });
    list.dataset.rv = "1";
    tl.fromTo(list, { height: 0, marginTop: 0, overflow: "hidden", clipPath: "inset(0% 0% 100% 0%)" }, { height: h, marginTop: mt, clipPath: "inset(0% 0% 0% 0%)", duration: 0.55, ease: "power3.out" }, 0)
      .fromTo(list.children, { y: -18, opacity: 0, rotationX: -28, transformPerspective: 700, transformOrigin: "50% 0%" }, { y: 0, opacity: 1, rotationX: 0, duration: 0.5, ease: "back.out(1.4)", stagger: 0.06 }, 0.08)
      .call(() => delete list.dataset.rv);
    if (chev) tl.fromTo(chev, { rotation: 0 }, { rotation: 180, duration: 0.5, ease: "power3.inOut" }, 0);
    run(tl);
  }
  function fold(list, chev, done){
    if (!list || !on()) { done(); return; }
    list.dataset.rv = "1";
    const tl = timeline({ onComplete: done });
    tl.to(list.children, { y: -12, opacity: 0, duration: 0.22, ease: "power2.in", stagger: { each: 0.04, from: "end" } }, 0)
      .to(list, { height: 0, marginTop: 0, overflow: "hidden", clipPath: "inset(0% 0% 100% 0%)", duration: 0.42, ease: "power3.inOut" }, 0.08);
    if (chev) tl.fromTo(chev, { rotation: 180 }, { rotation: 0, duration: 0.42, ease: "power3.inOut" }, 0);
    run(tl);
  }

  /* ---------- 4. Section cards: rise and unfold from their top edge ---------- */
  let io = null;
  function reveal(els, delay){
    els = els.filter(Boolean); if (!els.length) return;
    els.forEach(el => { el.dataset.rv = "1"; });
    const tl = timeline({ onComplete(){ els.forEach(el => { delete el.dataset.rv; }); } });
    tl.fromTo(els, { clipPath: "inset(0% 0% 100% 0% round 16px)", y: 26, rotationX: -9, transformPerspective: 1100, transformOrigin: "50% 0%" },
      { clipPath: "inset(0% 0% 0% 0% round 16px)", y: 0, rotationX: 0, duration: 0.7, ease: "expo.out", stagger: 0.07, delay: delay || 0, clearProps: "clipPath,transform" }, 0);
    const heads = els.map(el => el.querySelector("h2, h3, .card-h")).filter(Boolean);
    if (heads.length) tl.fromTo(heads, { opacity: 0, x: -12 }, { opacity: 1, x: 0, duration: 0.45, ease: "power2.out", stagger: 0.07, clearProps: "opacity,transform" }, (delay || 0) + 0.14);
    run(tl);
  }
  function view(root){
    if (io) { io.disconnect(); io = null; }
    if (!root || !on()) return;
    const port = document.getElementById("view"), vh = port ? port.clientHeight : innerHeight;
    const blocks = [...root.children].filter(el => el.offsetHeight > 0);
    const seen = blocks.filter(el => el.getBoundingClientRect().top < (port ? port.getBoundingClientRect().top : 0) + vh);
    reveal(seen.slice(0, 8));
    const later = blocks.filter(el => !seen.includes(el));
    if (!later.length || !("IntersectionObserver" in window)) return;
    later.forEach(el => G.set(el, { clipPath: "inset(0% 0% 100% 0% round 16px)" }));
    io = new IntersectionObserver(es => es.forEach(e => { if (!e.isIntersecting) return; io.unobserve(e.target); reveal([e.target]); }), { root: port, threshold: 0.08 });
    later.forEach(el => io.observe(el));
  }

  /* ---------- 5. Log-in tabs: the pill slides, the form wipes in from that side ---------- */
  function authSwitch(prevPillLeft, toSignup){
    const pill = document.querySelector(".auth-pill"), form = document.getElementById("authForm"); if (!pill || !form || !on()) return;
    const tl = timeline({ onComplete(){ G.set([pill, form, ...form.children], { clearProps: "transform,clipPath,opacity" }); } });
    form.dataset.rv = "1";
    tl.fromTo(pill, { x: prevPillLeft - rectOf(pill).left }, { x: 0, duration: 0.5, ease: "power3.inOut" }, 0)
      .fromTo(form, { clipPath: toSignup ? "inset(0% 0% 0% 100%)" : "inset(0% 100% 0% 0%)" }, { clipPath: "inset(0% 0% 0% 0%)", duration: 0.6, ease: "power3.inOut" }, 0)
      .fromTo(form.children, { opacity: 0, x: toSignup ? 22 : -22 }, { opacity: 1, x: 0, duration: 0.45, ease: "power2.out", stagger: 0.045 }, 0.16)
      .fromTo(".auth-card > h1, .auth-card > p.lead", { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.4, stagger: 0.05, clearProps: "opacity,transform" }, 0.05)
      .call(() => delete form.dataset.rv);
    run(tl);
  }
  function authIntro(){
    const card = document.querySelector(".auth-card"); if (!card || !on()) return;
    card.dataset.rv = "1";
    const tl = timeline({ onComplete(){ delete card.dataset.rv; } });
    tl.fromTo(card, { clipPath: "inset(0% 100% 0% 0% round 24px)" }, { clipPath: "inset(0% 0% 0% 0% round 24px)", duration: 0.9, ease: "expo.inOut", clearProps: "clipPath" }, 0.1)
      .fromTo(card.children, { opacity: 0, x: -18 }, { opacity: 1, x: 0, duration: 0.5, ease: "power2.out", stagger: 0.06, clearProps: "opacity,transform" }, 0.4)
      .fromTo(".auth-wrap .features li", { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.5, ease: "power2.out", stagger: 0.08, clearProps: "opacity,transform" }, 0.6);
    run(tl);
  }

  return { on, busy, isRail, railShell, rail, dwOpen, dwClose, unfold, fold, view, authSwitch, authIntro };
})();
