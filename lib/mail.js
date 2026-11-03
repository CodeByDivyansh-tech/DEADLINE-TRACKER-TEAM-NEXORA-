// Sending email (password reset links) through a free email API over HTTPS, with no packages.
// Supported: Brevo (free: 300 emails a day; you verify one sender address, no domain needed) and Resend.
// Settings (.env): EMAIL_PROVIDER=brevo|resend, EMAIL_API_KEY, EMAIL_FROM="Deadline Tracker <you@example.com>".
// Not configured -> configured() is false and nothing is sent; the app says so plainly.
const PROVIDERS = {
  brevo: { url: "https://api.brevo.com/v3/smtp/email",
    req: (m, key) => ({ headers: { "api-key": key }, body: { sender: m.from, to: [{ email: m.to }], subject: m.subject, textContent: m.text, htmlContent: m.html } }) },
  resend: { url: "https://api.resend.com/emails",
    req: (m, key) => ({ headers: { Authorization: "Bearer " + key }, body: { from: m.from.name ? `${m.from.name} <${m.from.email}>` : m.from.email, to: [m.to], subject: m.subject, text: m.text, html: m.html } }) }
};
function parseFrom(s){ const m = /^\s*(.*?)\s*<\s*([^<>\s]+@[^<>\s]+)\s*>\s*$/.exec(s || ""); return m ? { name: m[1].replace(/^"|"$/g, "") || undefined, email: m[2] } : { email: String(s || "").trim() }; }
function createMail(cfg, { fetchImpl = fetch } = {}){
  const p = PROVIDERS[cfg.provider];
  const configured = () => !!(p && cfg.apiKey && cfg.from);
  async function send(m){
    if (!configured()) { const e = new Error("Email isn't set up on this server."); e.code = "no_email"; throw e; }
    const r = p.req(Object.assign({}, m, { from: parseFrom(cfg.from) }), cfg.apiKey);
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 15000);
    try {
      const res = await fetchImpl(cfg.apiUrl || p.url, { method: "POST", signal: ctrl.signal, headers: Object.assign({ "Content-Type": "application/json", Accept: "application/json" }, r.headers), body: JSON.stringify(r.body) });
      if (!res.ok) { let msg = ""; try { const j = await res.json(); msg = j.message || j.error || ""; } catch (e) {} const e = new Error(`Email provider answered ${res.status}${msg ? ": " + String(msg).slice(0, 200) : ""}`); e.code = "mail_failed"; throw e; }
    } catch (e) { if (e.name === "AbortError") { const x = new Error("Email provider didn't answer in time"); x.code = "mail_failed"; throw x; } throw e; }
    finally { clearTimeout(t); }
  }
  return { configured, send, provider: configured() ? cfg.provider : null };
}
module.exports = { createMail, parseFrom };
