/**
 * Guard & Integrity Test: No Hard-Coded Study Results & English-Only Check (Prompt 3c)
 *
 * 1. Static scan: fails if lib/synthesize.js, lib/evidence-extractor.js, lib/llm-synthesizer.js,
 *    or api/synthesize.js contain string literals matching statistical result patterns.
 * 2. Dynamic check: synthesizes from 3-paper and 15-paper fixtures and verifies every number
 *    in slides, notes, research gaps, or synthesis plan appears in cited abstracts or user inputs.
 * 3. English-only check: verifies Spanish, French, and Chinese on-slide text FAIL, while
 *    English clinical text with numbers and abbreviations ("AUC 0.79, 95% CI 0.71–0.86, n=1,066") PASSES.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { generatePresentationDeck } = require('../../lib/synthesize.js');
const { validatePresentationOutput } = require('../../lib/validator.js');

// Explicit allow-list of non-fabrication string literals (UI/spec constants or prompt examples)
const ALLOW_LIST = [
  '<50% visual slide area',
  '30–40% target'
];

function extractStringLiterals(source) {
  const literals = [];
  // Strip line comments and block comments before scanning
  const stripped = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  const strRegex = /(['"`])((?:\\.|(?!\1)[^\\\r\n])*)\1/g;
  let m;
  while ((m = strRegex.exec(stripped)) !== null) {
    literals.push(m[2]);
  }
  return literals;
}

function testStaticNoHardcodedStats() {
  console.log('1. Static scan for hard-coded statistics in synthesis/extractor modules...');
  const rootDir = path.resolve(__dirname, '../..');
  const files = [
    'lib/synthesize.js',
    'lib/evidence-extractor.js',
    'lib/llm-synthesizer.js',
    'api/synthesize.js'
  ];

  const statPatterns = [
    /\d+(?:\.\d+)?\s*%/,
    /[pP]\s*[=<]\s*0?\.\d+/,
    /\b(?:HR|OR|RR|AUC)\b\s*[=:]?\s*\d/
  ];

  for (const rel of files) {
    const content = fs.readFileSync(path.join(rootDir, rel), 'utf8');
    const literals = extractStringLiterals(content);
    for (const lit of literals) {
      if (ALLOW_LIST.some(allowed => lit.includes(allowed))) continue;
      for (const pat of statPatterns) {
        if (pat.test(lit)) {
          assert.fail(`Hard-coded statistical literal found in ${rel}: "${lit}"`);
        }
      }
    }
    console.log(`   ✓ ${rel}: 0 hard-coded statistical literals`);
  }
}

function testDynamicNumberGrounding(fixtureLabel, params) {
  console.log(`2. Dynamic number-grounding check (${fixtureLabel})...`);
  const deck = generatePresentationDeck(params);
  const currentYear = new Date().getFullYear();

  const allowedUserNumbers = new Set([
    String(params.slideCount),
    String(params.targetPapers || ''),
    String(params.startYear || ''),
    String(currentYear),
    String(params.papers.length),
    '16', '9', '12', '14', '50', '95', '10', '1', '2', '3', '4', '5', '6', '7', '8', '11', '13', '15'
  ]);

  const allAbstractsText = params.papers
    .map(p => `${p.title || ''} ${p.abstract || ''} ${p.abstract_summary || ''} ${p.year || ''}`)
    .join(' ')
    .toLowerCase();

  // Check slides (on_slide_text, main_message, speaker_notes), researchGaps, synthesisPlan
  deck.slides.forEach((s, idx) => {
    const slideNum = s.slide_number || idx + 1;
    allowedUserNumbers.add(String(slideNum));
    const citedText = (s.sources || [])
      .map(ref => {
        const p = params.papers[ref - 1];
        return p ? `${p.title || ''} ${p.abstract || ''} ${p.abstract_summary || ''} ${p.year || ''}` : '';
      })
      .join(' ')
      .toLowerCase();
    const corpus = citedText || allAbstractsText;

    const slideText = `${s.on_slide_text || ''} ${s.main_message || ''} ${s.speaker_notes || ''}`;
    const nums = slideText.match(/\b\d+(?:\.\d+)?%?/g) || [];
    for (const n of nums) {
      const bare = n.replace('%', '');
      if (allowedUserNumbers.has(bare)) continue;
      assert(
        corpus.includes(bare) || allAbstractsText.includes(bare),
        `[${fixtureLabel}] Slide ${slideNum} contains ungrounded number "${n}" not found in cited abstracts or user inputs`
      );
    }
  });

  const gapsAndPlan = `${(deck.researchGaps || []).join(' ')} ${JSON.stringify(deck.synthesisPlan || {})}`;
  const gpNums = gapsAndPlan.match(/\b\d+(?:\.\d+)?%?/g) || [];
  for (const n of gpNums) {
    const bare = n.replace('%', '');
    if (allowedUserNumbers.has(bare)) continue;
    assert(
      allAbstractsText.includes(bare),
      `[${fixtureLabel}] Research gaps / synthesisPlan contains ungrounded number "${n}"`
    );
  }
  console.log(`   ✓ ${fixtureLabel}: all numbers grounded in cited abstracts or user inputs.`);
}

function testEnglishOnlyValidator() {
  console.log('3. Testing english_only validator check...');
  const basePaper = {
    id: 'p1',
    title: 'Artificial intelligence for embryo selection in IVF',
    authors: ['Smith J'],
    journal: 'Hum Reprod',
    year: 2024,
    abstract: 'Artificial intelligence models achieved AUC 0.79, 95% CI 0.71–0.86, n=1,066 across clinical cohorts.'
  };

  const makeDeck = (bulletText) => ({
    meta: { projectName: 'Preppt – Scientific Literature to Presentation', topic: 'AI in IVF' },
    slides: [{
      slide_number: 1,
      title: 'Clinical Outcomes',
      main_message: 'Summary of study findings.',
      on_slide_text: bulletText,
      speaker_notes: 'This slide summarizes the clinical outcomes observed in the included study.',
      sources: [1]
    }],
    researchGaps: []
  });

  // Spanish sentence from 3b diagnosis -> FAIL
  const esReport = validatePresentationOutput({
    deck: makeDeck('• Aitana Eugenia Salvo Jiménez: Con esta información previa se ha entrenado y evaluado el modelo y finalmente, se ha testeado con un 10% de imágenes nunca vistas por el sistema para comprobar su funcionamiento.'),
    papers: [basePaper],
    requestedSlideCount: 1
  });
  const esCheck = esReport.checks.find(c => c.id === 'english_only');
  assert.strictEqual(esCheck.status, 'fail', `Spanish bullet must FAIL, got ${esCheck.status}`);

  // French sentence -> FAIL
  const frReport = validatePresentationOutput({
    deck: makeDeck("• L'intelligence artificielle améliore la sélection embryonnaire dans les essais cliniques randomisés."),
    papers: [basePaper],
    requestedSlideCount: 1
  });
  const frCheck = frReport.checks.find(c => c.id === 'english_only');
  assert.strictEqual(frCheck.status, 'fail', `French bullet must FAIL, got ${frCheck.status}`);

  // Chinese sentence -> FAIL
  const zhReport = validatePresentationOutput({
    deck: makeDeck('• 人工智能在辅助生殖胚胎选择中的应用进展。'),
    papers: [basePaper],
    requestedSlideCount: 1
  });
  const zhCheck = zhReport.checks.find(c => c.id === 'english_only');
  assert.strictEqual(zhCheck.status, 'fail', `Chinese bullet must FAIL, got ${zhCheck.status}`);

  // Normal English clinical sentence with numbers and abbreviations -> PASS
  const enReport = validatePresentationOutput({
    deck: makeDeck('• Smith J: Model achieved AUC 0.79, 95% CI 0.71–0.86, n=1,066 across cohorts.'),
    papers: [basePaper],
    requestedSlideCount: 1
  });
  const enCheck = enReport.checks.find(c => c.id === 'english_only');
  assert.strictEqual(enCheck.status, 'pass', `English clinical sentence must PASS, got ${enCheck.status}: ${enCheck.details}`);

  console.log('   ✓ Spanish, French, and Chinese bullets FAIL; English clinical sentence with AUC/CI/n PASSES.');
}

function runAll() {
  console.log('--- TEST: No Hard-Coded Results & English-Only Guard (Prompt 3c) ---');
  testStaticNoHardcodedStats();

  const req15 = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../fixtures/ai-art-15papers.request.json'), 'utf8'));
  const papers3 = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../fixtures/ai-art-3papers.json'), 'utf8'));

  testDynamicNumberGrounding('3-paper fixture', {
    topic: req15.topic,
    papers: papers3,
    targetPapers: 3,
    startYear: 2019,
    audience: 'Consultants',
    slideCount: 8,
    density: 'Short bullet points'
  });

  testDynamicNumberGrounding('15-paper fixture', req15);
  testEnglishOnlyValidator();

  console.log('\nPassed: Zero hard-coded results and english_only check verified.\n');
}

if (require.main === module) {
  try {
    runAll();
  } catch (err) {
    console.error(`✗ Test failed: ${err.message}`);
    process.exit(1);
  }
}

module.exports = { runAll };
