/**
 * Regression Test: Validator Provenance Direction & Synthesis Crash (P0-2)
 *
 * Reproduces the production HTTP 400 {"error":"detectOutcomeDirection is not defined"}
 * crash caused by lib/validator.js calling detectOutcomeDirection(recFull) without
 * importing it from ./evidence-extractor.js.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { validatePresentationOutput } = require('../../lib/validator.js');
const synthesizeHandler = require('../../api/synthesize.js');

async function testValidatorProvenanceDirection() {
  console.log('--- TEST: Validator Provenance Direction & Synthesis (P0-2) ---');

  // Part (a): Minimal deck and paper set where derivedFrom.direction is NOT matched
  // by recExtracted.outcomes, forcing validator.js to reach detectOutcomeDirection(recFull)
  console.log('1. Testing validatePresentationOutput with derivedFrom provenance fallback...');
  const minimalPapers = [
    {
      id: 'p1',
      title: 'Evaluation of AI embryo selection in IVF',
      authors: ['Smith J'],
      journal: 'Hum Reprod',
      year: 2023,
      abstract: 'Background: We evaluated an artificial intelligence system for embryo grading. No comparative outcome percentages were reported in this pilot summary.'
    }
  ];

  const minimalDeck = {
    meta: {
      projectName: 'Preppt – Scientific Literature to Presentation',
      topic: 'AI in Embryo Selection'
    },
    slides: [
      {
        slide_number: 1,
        title: 'AI Embryo Selection',
        main_message: 'Pilot evaluation of AI embryo grading.',
        on_slide_text: '• Smith J: AI selection improved accuracy 85% across embryos.',
        sources: [1],
        bulletsData: [
          {
            text: '• Smith J: AI selection improved accuracy 85% across embryos.',
            derivedFrom: [{ ref: 1, direction: 'unclear' }]
          }
        ]
      }
    ]
  };

  const report = validatePresentationOutput({
    deck: minimalDeck,
    papers: minimalPapers,
    topic: 'AI in Embryo Selection',
    requestedSlideCount: 1
  });

  assert(report && Array.isArray(report.checks), 'validatePresentationOutput must return a report with a checks array');
  console.log(`   ✓ validatePresentationOutput returned ${report.checks.length} checks without throwing.`);

  // Part (b): Call api/synthesize.js in-process with the 3 real papers fixture
  console.log('2. Testing api/synthesize.js handler in-process with tests/fixtures/ai-art-3papers.json...');
  const fixturePath = path.resolve(__dirname, '../fixtures/ai-art-3papers.json');
  assert(fs.existsSync(fixturePath), 'tests/fixtures/ai-art-3papers.json must exist');
  const papers = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  assert.strictEqual(papers.length, 3, 'Fixture must contain 3 papers');

  let statusCode = 0;
  let responseBody = '';
  const mockReq = {
    method: 'POST',
    body: {
      topic: 'Artificial Intelligence in Assisted Reproduction: Clinical Evidence, Current Limitations, Bias, and the Future of Embryo Selection',
      papers,
      audience: 'Consultants',
      density: 'Short bullet points',
      slideCount: 8
    }
  };
  const mockRes = {
    headers: {},
    statusCode: 200,
    setHeader(k, v) { this.headers[k] = v; },
    end(chunk) {
      statusCode = this.statusCode;
      responseBody = chunk || '';
    }
  };

  await synthesizeHandler(mockReq, mockRes);

  let parsed = null;
  try {
    parsed = JSON.parse(responseBody);
  } catch (e) {
    assert.fail(`Response body was not valid JSON: ${responseBody}`);
  }

  assert.strictEqual(
    statusCode,
    200,
    `Expected HTTP 200 from /api/synthesize, got ${statusCode}: ${JSON.stringify(parsed)}`
  );
  assert(Array.isArray(parsed.slides), 'Response deck must have a slides array');
  assert.strictEqual(parsed.slides.length, 8, `Expected deck.slides.length === 8, got ${parsed.slides.length}`);
  console.log(`   ✓ /api/synthesize returned HTTP 200 with ${parsed.slides.length} slides.`);

  console.log('\nPassed: Validator provenance direction & synthesis handler verified.\n');
}

if (require.main === module) {
  testValidatorProvenanceDirection().catch(err => {
    console.error(`✗ Test failed: ${err.message}`);
    process.exit(1);
  });
}

module.exports = { testValidatorProvenanceDirection };
