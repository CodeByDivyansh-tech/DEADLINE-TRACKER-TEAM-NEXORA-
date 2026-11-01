// Small helpers for the HTTP layer: JSON responses, body parsing, validation errors, rate limits, headers.
class ApiError extends Error {
  constructor(status, code, message, extra){ super(message); this.status = status; this.code = code; this.extra = extra; }
}
const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff", "Referrer-Policy": "same-origin", "X-Frame-Options": "DENY",
  "Cross-Origin-Opener-Policy": "same-origin", "Permissions-Policy": "camera=(), microphone=(), geolocation=()"
};
const CSP = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";
function send(res, status, obj, headers = {}){
  if (res.headersSent) return;
  res.writeHead(status, Object.assign({ "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }, SECURITY_HEADERS, headers));
  res.end(JSON.stringify(obj));
}
function readBody(req, limit){
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on("data", c => { size += c.length; if (size > limit) { reject(new ApiError(413, "too_large", "That's too large.")); req.destroy(); } else chunks.push(c); });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}
async function readJson(req, limit = 256 * 1024){
  const ct = String(req.headers["content-type"] || "");
  const text = await readBody(req, limit);
  if (!text) return {};
  if (!/application\/json/i.test(ct)) throw new ApiError(415, "json_required", "Send the request as JSON.");
  try { const j = JSON.parse(text); if (!j || typeof j !== "object" || Array.isArray(j)) throw 0; return j; }
  catch (e) { throw new ApiError(400, "invalid_json", "The request body isn't valid JSON."); }
}
// Validation: returns cleaned values or throws a 400 that says which field is wrong.
const V = {
  str(v, field, { min = 0, max = 1000, required = false, trim = true } = {}){
    if (v == null || v === "") { if (required) throw new ApiError(400, "invalid_" + field, `${field} is required.`, { field }); return null; }
    if (typeof v !== "string") throw new ApiError(400, "invalid_" + field, `${field} must be text.`, { field });
    const s = trim ? v.trim() : v;
    if (s.length < min || s.length > max) throw new ApiError(400, "invalid_" + field, `${field} must be ${min}–${max} characters.`, { field });
    return s;
  },
  oneOf(v, field, list, def){ if (v == null || v === "") return def; if (!list.includes(v)) throw new ApiError(400, "invalid_" + field, `${field} must be one of: ${list.join(", ")}.`, { field }); return v; },
  num(v, field, { min = -Infinity, max = Infinity, int = false } = {}){
    if (v == null || v === "") return null; const n = Number(v);
    if (!Number.isFinite(n) || n < min || n > max || (int && !Number.isInteger(n))) throw new ApiError(400, "invalid_" + field, `${field} must be a number from ${min} to ${max}.`, { field });
    return n;
  },
  bool(v, field){ if (v == null) return null; if (typeof v !== "boolean") throw new ApiError(400, "invalid_" + field, `${field} must be true or false.`, { field }); return v; }
};
// Sliding-window limiter kept in memory (fine for one server process).
function limiter(limit, windowMs){
  const hits = new Map();
  const fn = key => {
    const now = Date.now(); const a = (hits.get(key) || []).filter(t => now - t < windowMs);
    if (a.length >= limit) { hits.set(key, a); return { ok: false, retryAfter: Math.ceil((windowMs - (now - a[0])) / 1000) }; }
    a.push(now); hits.set(key, a); return { ok: true };
  };
  setInterval(() => { const now = Date.now(); for (const [k, a] of hits) if (!a.some(t => now - t < windowMs)) hits.delete(k); }, windowMs).unref();
  return fn;
}
// Tiny router: add("GET", "/api/tasks/:id", handler)
function router(){
  const routes = [];
  return {
    add(method, pattern, handler, opts = {}){
      const keys = []; const re = new RegExp("^" + pattern.replace(/:(\w+)/g, (m, k) => { keys.push(k); return "([^/]+)"; }) + "$");
      routes.push({ method, re, keys, handler, opts });
    },
    match(method, url){
      let pathOnly = false;
      for (const r of routes) { const m = url.match(r.re); if (!m) continue; pathOnly = true; if (r.method !== method) continue;
        const params = {}; r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); }); return { route: r, params }; }
      return pathOnly ? { methodNotAllowed: true } : null;
    }
  };
}
module.exports = { ApiError, send, readJson, V, limiter, router, SECURITY_HEADERS, CSP };
