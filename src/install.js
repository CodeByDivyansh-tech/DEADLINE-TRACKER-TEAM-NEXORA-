/* =========================================================
   Install App (Settings → Profile)
   Uses the browser's own install window when the browser offers one ("beforeinstallprompt": Chrome, Edge, Android).
   Where it doesn't (iPhone and iPad, Firefox, Safari), the button shows the manual steps for that device.
   Nothing prompts by itself: the browser's banner is held back until the person clicks Install App.
   The pieces the browser needs are at the site root: manifest.webmanifest, icons/, sw.js and offline.html.
   ========================================================= */
IC.download = svg('<path d="M12 4v11M7 11l5 5 5-5"/><path d="M5 20h14"/>');
const INSTALL = { evt: null, installed: false, how: false, busy: false, told: false };
try { INSTALL.installed = localStorage.getItem("dt-installed") === "1"; } catch (e) {}
const instStandalone = () => !!((window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true);
function instMark(on){ INSTALL.installed = on; try { on ? localStorage.setItem("dt-installed", "1") : localStorage.removeItem("dt-installed"); } catch (e) {} }
function instDone(){
  INSTALL.evt = null; INSTALL.how = false; instMark(true); refreshInstall();
  if (!INSTALL.told) { INSTALL.told = true; toast("Deadline Tracker is installed. Open it from your home screen or your apps."); if (typeof sfx === "function") sfx("success"); }
}
// The browser says the site can be installed. It only does this while the app is NOT installed.
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); INSTALL.evt = e; INSTALL.told = false; instMark(false); refreshInstall(); });
window.addEventListener("appinstalled", instDone);

function instPlatform(){
  const ua = navigator.userAgent || "";
  if (/iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) return "ios";
  if (/Android/.test(ua)) return /Firefox/.test(ua) ? "android-firefox" : "android";
  if (/Firefox\//.test(ua)) return "firefox";
  if (/Edg\//.test(ua)) return "edge";
  if (/Chrome\//.test(ua)) return "chrome";
  if (/Safari\//.test(ua) && /Macintosh/.test(ua)) return "safari-mac";
  return "other";
}
const INSTALL_STEPS = {
  "ios": ["On iPhone and iPad", ["Open this page in Safari.", "Tap the Share button (the square with an arrow).", "Tap “Add to Home Screen”, then “Add”."]],
  "android": ["On Android", ["Tap the ⋮ menu at the top right of the browser.", "Tap “Install app” or “Add to Home screen”.", "Tap “Install”."]],
  "android-firefox": ["On Android (Firefox)", ["Tap the ⋮ menu.", "Tap “Install” or “Add to Home screen”.", "Tap “Add”."]],
  "chrome": ["In Chrome", ["Look for the install icon at the right end of the address bar and click it.", "Or open the ⋮ menu, then “Cast, save and share”, then “Install Deadline Tracker”.", "Click “Install”."]],
  "edge": ["In Edge", ["Look for the install icon at the right end of the address bar and click it.", "Or open the … menu, then “Apps”, then “Install this site as an app”.", "Click “Install”."]],
  "safari-mac": ["In Safari on a Mac", ["Open the File menu.", "Choose “Add to Dock”.", "Click “Add”."]],
  "firefox": ["Firefox on a computer can't install web apps", null, "Open this site in Chrome or Edge and use Install App there. On a phone, Firefox can add it to the home screen from its menu."],
  "other": ["In your browser", ["Open the browser's menu.", "Look for “Install app” or “Add to Home screen”.", "Confirm with “Install” or “Add”."]]
};
function installHTML(){
  const alone = instStandalone();
  if (alone || INSTALL.installed) return `<div class="inst-wrap" id="installBox"><div class="switch inst"><span><b>Deadline Tracker app</b><span>${alone ? "You're using the installed app." : "Installed on this device. Open it from your home screen or your apps."}</span></span><span class="inst-ok" id="installDone">${IC.check}App installed</span></div></div>`;
  const web = /^https?:$/.test(location.protocol);
  const [title, steps, note] = web ? INSTALL_STEPS[instPlatform()] : ["Open the website first", null, "Installing works from the website's address, not from a file or a preview."];
  return `<div class="inst-wrap" id="installBox"><div class="switch inst"><span><b>Install app</b><span>Put Deadline Tracker on your home screen or desktop. It opens in its own window, with the same account and data.</span></span>
      <button class="btn primary sm" type="button" id="installBtn" data-act="installapp" aria-expanded="${INSTALL.how}" aria-controls="installHow">${IC.download}Install App</button></div>
      ${INSTALL.how ? `<div class="inst-how" id="installHow"><b>${esc(title)}</b>${steps ? `<ol>${steps.map(x => `<li>${esc(x)}</li>`).join("")}</ol>` : `<p>${esc(note)}</p>`}</div>` : ""}</div>`;
}
// update just this row (the Settings form may have unsaved typing elsewhere)
function refreshInstall(){ const box = document.getElementById("installBox"); if (box) box.outerHTML = installHTML(); }
async function installApp(){
  if (INSTALL.busy) return;
  const e = INSTALL.evt;
  if (!e) { INSTALL.how = !INSTALL.how; refreshInstall(); const b = $("#installBtn"); if (b) b.focus(); return; }   // no direct install here: show or hide the steps
  INSTALL.busy = true;
  try {
    await e.prompt();
    const choice = await e.userChoice;
    INSTALL.evt = null;   // a prompt can be used once
    if (choice && choice.outcome === "accepted") instDone();
    else { toast("Not installed. You can install it any time from here."); refreshInstall(); }
  } catch (err) {
    INSTALL.evt = null; INSTALL.how = true; refreshInstall();
    toast("Couldn't open the install window. Follow the steps shown instead.", null, null, "error");
  }
  INSTALL.busy = false;
}
document.addEventListener("click", e => {
  const a = e.target.closest("[data-act]"); if (!a) return;
  switch (a.dataset.act) {
    case "installapp": installApp(); break;
  }
});

// The service worker (sw.js): needed for a proper installed app and the "You're offline" page.
// Not on test pages unless asked (&dt-sw), and only on a real web address.
if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol) && (!/[?&]dt-test\b/.test(location.search) || /[?&]dt-sw\b/.test(location.search))) {
  window.addEventListener("load", () => { navigator.serviceWorker.register("/sw.js").catch(() => {}); });
}
