// 100 different member accounts against a real local server (test data only, a fresh temporary database).
// Every account goes through the real browser sign-up and setup, then the 14 scenarios from the brief:
//  1 sign-up · 2 first login · 3 sample data · 4 existing member log-in · 5 wrong password · 6 forgot password ·
//  7 password reset · 8 log out and in again · 9 Reports · 10 Study Planner · 11 create, edit, delete tasks ·
//  12 refresh keeps data · 13 protected pages without log-in · 14 no access to another member's data.
// Each simulated member has their own address (X-Forwarded-For with TRUST_PROXY on), like real visitors do,
// so the per-address limits on sign-ups and resets apply per member, as on the live site.
// Run: node tests/load/hundred-users.js [count=100] [parallel=4]   (writes tests/load/hundred-users-result.json)
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const { startServer, client, fakeMail } = require("../srv");
const { onboard } = require("../helpers");

const COUNT = Number(process.argv[2]) || 100, PAR = Number(process.argv[3]) || 4;
const MODES = ["student", "company", "personal"];
const SCEN = ["1 sign-up", "2 first login", "3 sample data", "4 existing login", "5 wrong password", "6 forgot password", "7 password reset",
  "8 log out and in", "9 reports", "10 study planner", "11 create/edit/delete", "12 refresh keeps data", "13 protected without login", "14 other member's data"];

(async () => {
  const mail = await fakeMail().start();
  const s = await startServer({ TRUST_PROXY: "true", EMAIL_PROVIDER: "brevo", EMAIL_API_KEY: "k", EMAIL_FROM: "Deadline Tracker <noreply@example.com>", EMAIL_API_URL: mail.url + "/v3/smtp/email" });
  const browser = await chromium.launch();
  const results = []; const users = [];
  const t0 = Date.now();
  const ipOf = i => `10.${Math.floor(i / 250)}.${i % 250}.7`;
  const api = (i) => { const c = client(s.base); const call = c.call; c.call = (m, u, b, h = {}) => call(m, u, b, Object.assign({ "X-Forwarded-For": ipOf(i) }, h)); c.get = u => c.call("GET", u); c.post = (u, b) => c.call("POST", u, b === undefined ? {} : b); c.patch = (u, b) => c.call("PATCH", u, b); c.del = u => c.call("DELETE", u); return c; };

  async function one(i){
    const r = { user: i, mode: MODES[i % 3], pass: {}, notes: [] };
    const ok = (k, cond, why) => { r.pass[k] = r.pass[k] === false ? false : !!cond; if (!cond && why) r.notes.push(`${k}: ${why}`); };
    const email = `member${i}@example.com`, pw1 = `first-pass-${i}`, pw2 = `second-pass-${i}`;
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, timezoneId: "Asia/Kolkata", extraHTTPHeaders: { "X-Forwarded-For": ipOf(i) } });
    const page = await ctx.newPage(); const errs = [];
    page.on("pageerror", e => errs.push(e.message));
    page.on("console", m => { if (m.type() === "error" && !/Failed to load resource|fonts\./.test(m.text())) errs.push(m.text()); });
    page.on("response", x => { if (x.url().includes("/api/") && x.status() >= 500) errs.push(`${x.status()} ${x.url()}`); });
    // Poll in Node (page.waitForFunction doesn't wait for an async check).
    const until = async (fn, ms = 10000, what = "condition") => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await new Promise(z => setTimeout(z, 120)); } throw new Error("timed out waiting for " + what); };
    const state = () => page.evaluate(async () => (await (await fetch("/api/state")).json()));
    const items = async () => { const st = (await state()).state; return st ? st.workspaces.reduce((a, w) => a + w.items.length, 0) : 0; };
    try {
      // 1 + 2: sign up in the browser, then the first-time setup with sample data
      await page.goto(s.base + "/?dt-test"); await page.waitForSelector(".auth-card");
      await page.click("[data-act=authmode][data-v=signup]");
      await page.fill("#au-name", `Member ${i}`); await page.fill("#au-email", email); await page.fill("#au-pass", pw1); await page.click("#authGo");
      await page.waitForSelector("#onb-name", { timeout: 10000 });
      ok("1 sign-up", true);
      await onboard(page, { mode: r.mode, demo: true, name: `Member${i}` });
      await until(async () => (await state()).version >= 1, 10000, "the first save");
      ok("2 first login", await page.isVisible("#app"), "app not shown after setup");
      // 3: sample data, saved to this member's own account
      const n0 = await items(); ok("3 sample data", n0 >= 10, `only ${n0} items`);
      const tasksApi = (await page.evaluate(async () => (await (await fetch("/api/tasks")).json()).tasks.length));
      ok("3 sample data", tasksApi >= 10, `tasks table has ${tasksApi}`);
      // 9: Reports (server statistics match this member's data)
      const route = r.mode === "company" ? "reports" : "reports";
      await page.evaluate(x => { location.hash = x; }, route); await page.waitForSelector(".acct-stats .as-grid", { timeout: 8000 });
      const stats = await page.evaluate(async () => (await (await fetch("/api/stats")).json()));
      const shown = await page.$eval(".acct-stats", e => e.textContent);
      ok("9 reports", stats.total === tasksApi && new RegExp(`Total tasks\\s*${stats.total}`).test(shown), `stats ${stats.total} vs tasks ${tasksApi}`);
      ok("9 reports", await page.locator(".kpis .kpi").count() >= 4, "workspace report missing");
      // 10: Study Planner shows sessions from the sample deadlines
      await page.evaluate(() => { location.hash = "planner"; }); await page.waitForSelector(".plan-days");
      ok("10 study planner", await page.locator(".pday .sess").count() > 0, "no planned sessions");
      // 11: create in the app, edit and delete through the task API, and see it in the app
      await page.evaluate(() => { location.hash = "overview"; }); await page.waitForSelector("#addText");
      await page.fill("#addText", `Lab report ${i} due tomorrow 5pm ~2h`); await page.waitForTimeout(40); await page.press("#addText", "Enter");
      await until(async () => (await page.evaluate(async () => (await (await fetch("/api/tasks")).json()).tasks)).some(x => x.title === `Lab report ${i}`), 10000, "the new task to be saved");
      const mine = (await page.evaluate(async () => (await (await fetch("/api/tasks")).json()).tasks)).find(x => x.title === `Lab report ${i}`);
      ok("11 create/edit/delete", mine && mine.dueDate, "created task has no due date");
      const ed = await page.evaluate(async id => (await fetch(`/api/tasks/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Lab report edited" }) })).status, mine.id);
      // 12: refresh shows the edit and keeps everything, no duplicated sample data
      await page.reload(); await page.waitForSelector("#app:not([hidden])");
      const st1 = (await state()).state; const all1 = st1.workspaces.flatMap(w => w.items);
      ok("11 create/edit/delete", ed === 200 && all1.some(x => x.title === "Lab report edited"), `edit ${ed}, not in app after reload`);
      ok("12 refresh keeps data", all1.length === n0 + 1, `${all1.length} items after reload, expected ${n0 + 1}`);
      const del = await page.evaluate(async id => (await fetch(`/api/tasks/${id}`, { method: "DELETE" })).status, mine.id);
      await page.reload(); await page.waitForSelector("#app:not([hidden])");
      ok("11 create/edit/delete", (del === 200 || del === 204) && !(await state()).state.workspaces.flatMap(w => w.items).some(x => x.title === "Lab report edited"), `delete ${del}`);
      // 8: log out with the button, log in again in the browser: same data, sample data not added twice
      await page.evaluate(() => document.querySelector("[data-act=logout]").click());
      await page.waitForSelector(".auth-card", { timeout: 8000 });
      ok("13 protected without login", (await page.evaluate(async () => (await fetch("/api/state")).status)) === 401, "state readable after log out");
      await page.fill("#au-email", email); await page.fill("#au-pass", pw1); await page.click("#authGo");
      await page.waitForSelector("#app:not([hidden])", { timeout: 10000 });
      ok("8 log out and in", (await items()) === n0, `${await items()} items after logging in again, expected ${n0}`);
      ok("12 refresh keeps data", true);
      users.push({ i, email, pw1, pw2, taskId: (await page.evaluate(async () => (await (await fetch("/api/tasks")).json()).tasks[0].id)) });
      // 4 + 5: existing member log-in and a wrong password, through the API (a second device)
      const c = api(i);
      const wrong = await c.post("/api/auth/login", { email, password: "not-my-password" });
      ok("5 wrong password", wrong.status === 401 && /wrong/i.test(wrong.json.error), `${wrong.status} ${wrong.json && wrong.json.error}`);
      const good = await c.post("/api/auth/login", { email, password: pw1 });
      ok("4 existing login", good.status === 200 && good.json.user.email === email, String(good.status));
      // 6 + 7: forgot password email, then the reset page in the browser
      const fg = await api(i).post("/api/auth/forgot", { email });
      let link = null; for (let k = 0; k < 50 && !link; k++) { link = mail.linkFor(email); if (!link) await new Promise(z => setTimeout(z, 60)); }
      ok("6 forgot password", fg.status === 200 && link, `status ${fg.status}, link ${!!link}`);
      const p2 = await ctx.newPage();
      await p2.goto(s.base + "/?dt-test" + link.slice(link.indexOf("#"))); await p2.waitForSelector("#au-pass2", { timeout: 8000 });
      await p2.fill("#au-pass", pw2); await p2.fill("#au-pass2", pw2); await p2.click("#authGo");
      await p2.waitForSelector("#authOk:not([hidden])", { timeout: 8000 });
      const oldPw = await api(i).post("/api/auth/login", { email, password: pw1 }), newPw = await api(i).post("/api/auth/login", { email, password: pw2 });
      ok("7 password reset", oldPw.status === 401 && newPw.status === 200, `old ${oldPw.status}, new ${newPw.status}`);
      ok("4 existing login", (await c.get("/api/state")).status === 401, "old session survived the reset");
      await p2.close();
      // 13: no log-in, no data
      const anon = api(i);
      ok("13 protected without login", (await anon.get("/api/state")).status === 401 && (await anon.get("/api/tasks")).status === 401 && (await anon.get("/api/stats")).status === 401 && (await anon.get("/api/admin/users")).status === 401, "a private route answered");
    } catch (e) { r.notes.push("stopped: " + e.message.split("\n")[0]); for (const k of SCEN) if (r.pass[k] === undefined) r.pass[k] = false; }
    if (errs.length) r.notes.push("browser errors: " + errs.slice(0, 3).join(" | "));
    r.browserErrors = errs.length;
    await ctx.close();
    results[i] = r;
  }

  let next = 0; await Promise.all(Array.from({ length: PAR }, async () => { while (next < COUNT) { const i = next++; await one(i); process.stdout.write(`${i + 1} `); } }));
  // 14: every member tries every other member's task id, and lists only their own tasks (all through the API)
  const sessions = await Promise.all(users.map(async u => { const c = api(u.i); await c.post("/api/auth/login", { email: u.email, password: u.pw2 }); return { u, c }; }));
  for (const { u, c } of sessions) {
    const r = results[u.i]; let leaks = 0;
    for (const o of users) { if (o.i === u.i) continue; const g = await c.get(`/api/tasks/${o.taskId}`); if (g.status !== 404) leaks++; }
    const own = (await c.get("/api/tasks")).json.tasks; const st = JSON.stringify((await c.get("/api/state")).json);
    const others = users.filter(o => o.i !== u.i && (st.includes(o.email) || own.some(t => t.id === o.taskId))).length;
    r.pass["14 other member's data"] = leaks === 0 && others === 0;
    if (leaks || others) r.notes.push(`14: ${leaks} other tasks readable, ${others} others' data in own state`);
  }
  for (const r of results) if (r && r.pass["14 other member's data"] === undefined) r.pass["14 other member's data"] = false;
  const summary = SCEN.map(k => ({ scenario: k, passed: results.filter(r => r && r.pass[k] === true).length, of: COUNT }));
  const out = { when: new Date().toISOString(), accounts: COUNT, parallel: PAR, seconds: Math.round((Date.now() - t0) / 1000), summary,
    failures: results.filter(r => r && (r.notes.length || SCEN.some(k => r.pass[k] !== true))).map(r => ({ user: r.user, mode: r.mode, notes: r.notes })),
    crossChecks: users.length * (users.length - 1) };
  fs.writeFileSync(path.join(__dirname, "hundred-users-result.json"), JSON.stringify(out, null, 2));
  console.log("\n" + summary.map(x => `${x.scenario.padEnd(28)} ${x.passed}/${x.of}`).join("\n"));
  console.log(`cross-member checks: ${out.crossChecks} · failures: ${out.failures.length} · ${out.seconds}s`);
  if (out.failures.length) console.log(JSON.stringify(out.failures.slice(0, 8), null, 1));
  await browser.close(); s.stop(); mail.close();
})().catch(e => { console.error(e); process.exit(1); });
