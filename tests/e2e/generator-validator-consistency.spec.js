/**
 * Regression & Property Test: Generator–Validator Consistency (Prompt 3b)
 *
 * Covers:
 * 1. End-to-end consistency on tests/fixtures/ai-art-15papers.request.json:
 *    synthesize -> validate (isValid === true, 0 ERROR failures) -> export-docx (HTTP 200, > 10 KB)
 * 2. Unit tests for citation stripping and numeric preservation in lib/text-rules.js
 * 3. Property check on both 3-paper and 15-paper fixtures: generator output passes all ERROR-level checks
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const synthesizeHandler = require('../../api/synthesize.js');
const validateHandler = require('../../api/validate.js');
const exportDocxHandler = require('../../api/export-docx.js');
const { validatePresentationOutput } = require('../../lib/validator.js');
const { stripCitations, compressFindingPreservingNumbers } = require('../../lib/text-rules.js');

function invokeHandler(handler, body) {
  return new Promise((resolve) => {
    const chunks = [];
    const res = {
      statusCode: 200,
      headers: {},
      setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
      end(chunk) {
        if (chunk) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
        }
        resolve({
          statusCode: this.statusCode,
          headers: this.headers,
          buffer: Buffer.concat(chunks)
        });
      }
    };
    handler({ method: 'POST', body }, res);
  });
}

async function runTests() {
  console.log('--- TEST: Generator–Validator Consistency & Unit Checks (Prompt 3b) ---');

  // 1. Unit tests: citation stripping & number preservation
  console.log('1. Running unit tests for stripCitations & compressFindingPreservingNumbers...');
  const s1 = stripCitations('AI improved embryo grading accuracy (Smith et al., 2020) across clinics.');
  assert(!/\(Smith et al\., 2020\)/.test(s1) && !/2020/.test(s1), `Expected citation-free string, got: "${s1}"`);

  const s2 = stripCitations('Blastocyst prediction outperformed morphology [12].');
  assert(!/\[\d+\]/.test(s2) && !s2.includes('12'), `Expected numeric bracket citation stripped, got: "${s2}"`);

  const s3 = stripCitations('Smith et al. (2020) reported comparable outcomes.');
  assert(!/2020/.test(s3), `Expected prose author-year citation stripped, got: "${s3}"`);

  const compressed = compressFindingPreservingNumbers(
    'Smith et al.',
    'Machine learning embryo selection achieved AUC 0.79 (95% CI 0.71–0.86) for clinical pregnancy prediction across multiple IVF centers.',
    8
  );
  assert(
    compressed.text.includes('0.79') && compressed.text.includes('95%') && compressed.text.includes('0.71') && compressed.text.includes('0.86'),
    `Expected all statistical numbers preserved in compressed finding, got: "${compressed.text}"`
  );
  console.log('   ✓ Unit tests passed: citations stripped and AUC/CI numbers preserved.');

  // 2. Full 15-paper fixture pipeline: synthesize -> validate -> export-docx
  console.log('2. Testing 15-paper fixture pipeline (synthesize -> validate -> export-docx)...');
  const req15Path = path.resolve(__dirname, '../fixtures/ai-art-15papers.request.json');
  assert(fs.existsSync(req15Path), 'tests/fixtures/ai-art-15papers.request.json must exist');
  const req15 = JSON.parse(fs.readFileSync(req15Path, 'utf8'));

  const synthRes = await invokeHandler(synthesizeHandler, req15);
  assert.strictEqual(synthRes.statusCode, 200, `Expected synthesize HTTP 200, got ${synthRes.statusCode}`);
  const deck15 = JSON.parse(synthRes.buffer.toString('utf8'));
  assert(Array.isArray(deck15.slides) && deck15.slides.length === 15, 'Expected 15 slides');

  const valRes = await invokeHandler(validateHandler, {
    topic: req15.topic,
    deck: deck15,
    papers: req15.papers,
    removedPapers: [],
    slideCount: req15.slideCount,
    meta: deck15.meta
  });
  assert.strictEqual(valRes.statusCode, 200, `Expected validate HTTP 200, got ${valRes.statusCode}`);
  const report15 = JSON.parse(valRes.buffer.toString('utf8'));
  assert.strictEqual(report15.isValid, true, `Expected isValid === true, got failures: ${JSON.stringify(report15.checks.filter(c => c.status === 'fail'))}`);
  assert.strictEqual(report15.failedCount, 0, `Expected 0 ERROR failures, got ${report15.failedCount}`);

  const exportRes = await invokeHandler(exportDocxHandler, {
    topic: req15.topic,
    deck: deck15,
    papers: req15.papers,
    meta: deck15.meta,
    removedPapers: [],
    slideCount: req15.slideCount,
    reviewedWarnings: true
  });
  assert.strictEqual(exportRes.statusCode, 200, `Expected export-docx HTTP 200, got ${exportRes.statusCode}: ${exportRes.buffer.toString('utf8')}`);
  assert(exportRes.buffer.length > 10240, `Expected .docx > 10 KB, got ${exportRes.buffer.length} bytes`);
  console.log(`   ✓ 15-paper pipeline passed: isValid=true, 0 failures, exported ${exportRes.buffer.length} bytes .docx.`);

  // 3. Property check on 3-paper fixture
  console.log('3. Running property check on 3-paper fixture...');
  const papers3Path = path.resolve(__dirname, '../fixtures/ai-art-3papers.json');
  const papers3 = JSON.parse(fs.readFileSync(papers3Path, 'utf8'));
  const synth3Res = await invokeHandler(synthesizeHandler, {
    topic: req15.topic,
    papers: papers3,
    audience: 'Consultants',
    density: 'Short bullet points',
    slideCount: 8
  });
  assert.strictEqual(synth3Res.statusCode, 200, `Expected 3-paper synthesize HTTP 200, got ${synth3Res.statusCode}`);
  const deck3 = JSON.parse(synth3Res.buffer.toString('utf8'));
  const report3 = validatePresentationOutput({
    deck: deck3,
    papers: papers3,
    topic: req15.topic,
    requestedSlideCount: 8
  });
  assert.strictEqual(report3.failedCount, 0, `Expected 0 ERROR failures on 3-paper deck, got: ${JSON.stringify(report3.checks.filter(c => c.status === 'fail'))}`);
  console.log('   ✓ 3-paper property check passed: 0 ERROR failures.');

  console.log('\nPassed: Generator–validator consistency & unit tests verified.\n');
}

if (require.main === module) {
  runTests().catch(err => {
    console.error(`✗ Test failed: ${err.message}`);
    process.exit(1);
  });
}

module.exports = { runTests };
