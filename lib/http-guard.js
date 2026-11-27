/**
 * Preppt HTTP guard (lib/http-guard.js) — audit D-20
 *
 * Shared by every /api/* handler:
 *  - CORS limited to the app's own origins (production, its Vercel previews, localhost, plus
 *    PREPPT_ALLOWED_ORIGINS); browser requests from any other site get HTTP 403, so third-party
 *    pages cannot spend this deployment's Semantic Scholar / OpenAlex / LLM quota.
 *  - Best-effort per-IP rate limit (fixed one-minute window, per serverless instance).
 *  - Request bodies capped (default 3 MB) and parsed safely.
 */

const DEFAULT_ORIGINS = [
  'https://preppt-ai.vercel.app'
];
const PREVIEW_ORIGIN = /^https:\/\/preppt[a-z0-9-]*\.vercel\.app$/i;
const LOCAL_ORIGIN = /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i;

const LIMITS = {
  proxy: 40,      // literature search proxies
  light: 60,      // keyword / strategy / validation
  heavy: 12       // synthesis and Word export
};

const buckets = new Map();

function allowedOrigins() {
  const extra = String(process.env.PREPPT_ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  return new Set([...DEFAULT_ORIGINS, ...extra]);
}

function isAllowedOrigin(origin) {
  if (!origin) return true; // same-origin navigations and server-side callers send no Origin header
  return allowedOrigins().has(origin) || PREVIEW_ORIGIN.test(origin) || LOCAL_ORIGIN.test(origin);
}

function clientIp(req) {
  const fwd = String((req.headers && req.headers['x-forwarded-for']) || '').split(',')[0].trim();
  return fwd || (req.socket && req.socket.remoteAddress) || 'unknown';
}

function rateLimited(req, kind) {
  const limit = LIMITS[kind] || LIMITS.light;
  const now = Date.now();
  const key = `${kind}:${clientIp(req)}`;
  const b = buckets.get(key);
  if (!b || now - b.start >= 60000) {
    buckets.set(key, { start: now, count: 1 });
    if (buckets.size > 5000) {
      for (const [k, v] of buckets) if (now - v.start >= 60000) buckets.delete(k);
    }
    return false;
  }
  b.count += 1;
  return b.count > limit;
}

function sendJson(res, status, obj) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(obj));
}

/**
 * Applies CORS, preflight, method and rate-limit rules.
 * @returns {boolean} true when the handler may continue
 */
function guard(req, res, { methods = ['GET'], kind = 'light' } = {}) {
  const origin = req.headers && req.headers.origin;
  res.setHeader('Vary', 'Origin');
  if (origin && isAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', [...methods, 'OPTIONS'].join(', '));
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
  if (origin && !isAllowedOrigin(origin)) {
    sendJson(res, 403, { error: 'Origin not allowed.' });
    return false;
  }
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return false;
  }
  if (!methods.includes(req.method)) {
    res.setHeader('Allow', [...methods, 'OPTIONS'].join(', '));
    sendJson(res, 405, { error: `Method ${req.method} not allowed.` });
    return false;
  }
  if (rateLimited(req, kind)) {
    res.setHeader('Retry-After', '60');
    sendJson(res, 429, { error: 'Too many requests. Please wait a minute and try again.' });
    return false;
  }
  return true;
}

const MAX_BODY_BYTES = Number(process.env.PREPPT_MAX_BODY_BYTES) || 3 * 1024 * 1024;

class BodyTooLargeError extends Error {}

/**
 * Parses a JSON body with a size cap. Resolves {} for empty/invalid JSON; rejects BodyTooLargeError when too big.
 */
function parseJsonBody(req, maxBytes = MAX_BODY_BYTES) {
  if (req.body && typeof req.body === 'object') {
    const size = Buffer.byteLength(JSON.stringify(req.body));
    if (size > maxBytes) return Promise.reject(new BodyTooLargeError('Request body too large.'));
    return Promise.resolve(req.body);
  }
  if (typeof req.body === 'string') {
    if (Buffer.byteLength(req.body) > maxBytes) return Promise.reject(new BodyTooLargeError('Request body too large.'));
    try { return Promise.resolve(JSON.parse(req.body)); } catch (e) { return Promise.resolve({}); }
  }
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    let aborted = false;
    req.on('data', chunk => {
      if (aborted) return;
      size += chunk.length;
      if (size > maxBytes) {
        aborted = true;
        reject(new BodyTooLargeError('Request body too large.'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (aborted) return;
      const body = Buffer.concat(chunks).toString('utf8');
      try { resolve(body ? JSON.parse(body) : {}); } catch (e) { resolve({}); }
    });
    req.on('error', () => { if (!aborted) resolve({}); });
  });
}

module.exports = { guard, parseJsonBody, BodyTooLargeError, isAllowedOrigin, sendJson, _buckets: buckets };
