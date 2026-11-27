/**
 * HTTP guard regression (audit D-20): origin allow-list, method check, rate limit, body cap, no client API keys.
 */
const assert = require('assert');
const { Readable } = require('stream');
const { guard, parseJsonBody, BodyTooLargeError, isAllowedOrigin, _buckets } = require('../../lib/http-guard.js');

function mockRes() {
  const headers = {};
  return { statusCode: 200, headers, body: '', setHeader(k, v) { headers[k.toLowerCase()] = v; }, end(b) { this.body = b || ''; this.ended = true; } };
}
function req(method, origin, ip = '1.2.3.4') {
  return { method, headers: { ...(origin ? { origin } : {}), 'x-forwarded-for': ip }, socket: {} };
}

assert.ok(isAllowedOrigin('https://preppt-ai.vercel.app'));
assert.ok(isAllowedOrigin('https://preppt-git-fix-audit-roroleaks.vercel.app'));
assert.ok(isAllowedOrigin('http://localhost:3080') && isAllowedOrigin('http://127.0.0.1:51234'));
assert.ok(!isAllowedOrigin('https://evil.example.com'));
console.log('   ✓ Origin allow-list: production, previews, localhost allowed; other sites refused.');

let res = mockRes();
assert.strictEqual(guard(req('GET', 'https://evil.example.com'), res, { methods: ['GET'], kind: 'proxy' }), false);
assert.strictEqual(res.statusCode, 403);
res = mockRes();
assert.strictEqual(guard(req('GET', 'https://preppt-ai.vercel.app'), res, { methods: ['GET'], kind: 'proxy' }), true);
assert.strictEqual(res.headers['access-control-allow-origin'], 'https://preppt-ai.vercel.app');
assert.notStrictEqual(res.headers['access-control-allow-origin'], '*');
res = mockRes();
assert.strictEqual(guard(req('GET'), res, { methods: ['POST'], kind: 'light' }), false);
assert.strictEqual(res.statusCode, 405);
console.log('   ✓ Foreign origin → 403; allowed origin echoed (never "*"); wrong method → 405.');

_buckets.clear();
let last;
for (let i = 0; i < 13; i++) { last = mockRes(); guard(req('POST', null, '9.9.9.9'), last, { methods: ['POST'], kind: 'heavy' }); }
assert.strictEqual(last.statusCode, 429, 'the 13th synthesis request in a minute is rate-limited');
assert.strictEqual(last.headers['retry-after'], '60');
console.log('   ✓ Rate limit: 13th heavy request per minute per IP → 429 with Retry-After.');

(async () => {
  const big = Readable.from([Buffer.alloc(1024 * 1024, 'a'), Buffer.alloc(1024 * 1024, 'a'), Buffer.alloc(1200 * 1024, 'a')]);
  await assert.rejects(parseJsonBody(big), BodyTooLargeError);
  assert.deepStrictEqual(await parseJsonBody(Readable.from([Buffer.from('{"a":1}')])), { a: 1 });
  console.log('   ✓ Bodies above 3 MB rejected; normal JSON parsed.');

  const s2Source = require('fs').readFileSync(require('path').join(__dirname, '../../api/s2.js'), 'utf8');
  assert.ok(!/req\.headers\[['"]x-api-key['"]\]/.test(s2Source), '/api/s2 must not forward client-supplied API keys');
  console.log('   ✓ /api/s2 no longer forwards client-supplied API keys.');
  console.log('\nPassed: HTTP guard tests verified.');
})().catch(e => { console.error(e); process.exit(1); });
