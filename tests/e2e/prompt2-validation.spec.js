/**
 * Acceptance Test Suite for PROMPT 2: Honest Pre-Export Checks & Truthful Labels
 * Tests 1 through 9 verifying:
 * - D-04 (validator false assurance remediation)
 * - D-09 (misleading labels remediation)
 * - D-23 (integrity panel rebuilt)
 * - Part A carry-over fixes from Prompt 1B
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { generatePresentationDeck } = require('../../lib/synthesize.js');
const { validatePresentationOutput } = require('../../lib/validator.js');
const { generatePresentationDocx } = require('../../lib/docx-generator.js');
const { detectIsConferenceAbstract } = require('../../lib/evidence-extractor.js');
const exportDocxHandler = require('../../api/export-docx.js');

// Standard test papers
const test9Papers = [
  {
    authors: 'Salih M, 2023',
    title: 'Embryo selection through artificial intelligence versus embryologists: a systematic review',
    journal: 'Hum Reprod Open',
    year: 2023,
    source: 'Europe PMC',
    abstract: 'STUDY QUESTION: What is the present performance of AI decision support during embryo selection compared to embryologists? SUMMARY ANSWER: AI consistently outperformed the clinical teams in all the studies focused on embryo morphology and clinical outcome prediction during embryo selection assessment. LIMITATIONS: The included studies were retrospective and heterogeneous.'
  },
  {
    authors: 'Maresca L, 2026',
    title: 'Artificial Intelligence in Embryo Selection: Current Approaches and Clinical Implications',
    journal: 'Bioengineering',
    year: 2026,
    source: 'Europe PMC',
    abstract: 'This review summarizes current approaches to artificial intelligence in embryo selection, including models based on static images and time-lapse imaging data.'
  },
  {
    authors: 'Wang S, 2023',
    title: 'Interpretable artificial intelligence-assisted embryo selection improved single-blastocyst transfer outcomes: a prospective cohort study',
    journal: 'RBMO',
    year: 2023,
    source: 'Semantic Scholar',
    abstract: 'Embryos were selected by an AI-assisted group (AAG) or a manual group. The implantation rate was significantly higher in the AAG than the manual group (80.87% versus 68.15%, P = 0.022). No significant difference was found in terms of live birth rate between the groups.'
  }
];

const illingworthPaper = {
  id: 'illingworth-2024',
  title: 'Deep learning versus manual morphology-based embryo selection in in vitro fertilization: a randomized clinical trial',
  authors: 'Illingworth PJ, et al.',
  journal: 'Nat Med',
  year: 2024,
  source: 'Europe PMC',
  abstract: 'In a double-blind non-inferiority randomized trial of 1,066 patients, clinical pregnancy rate was 46.5% with artificial intelligence versus 48.2% with manual embryologist evaluation (risk difference -1.7%, 95% CI -7.7% to 4.3%). Because the lower bound of the 95% confidence interval crossed the prespecified non-inferiority margin of -5.0%, non-inferiority was not demonstrated.'
};

async function runPrompt2Tests() {
  console.log('================================================================');
  console.log('🧪 RUNNING PROMPT 2 ACCEPTANCE TESTS: HONEST CHECKS & LABELS');
  console.log('================================================================\n');

  // --------------------------------------------------------------------------
  // TEST 1: Old template deck fails
  // --------------------------------------------------------------------------
  console.log('▶️ TEST 1: Old template deck fails on source_coverage & vocabulary_drift');
  const oldTemplateDeck = {
    title: 'Cardiology Management Update',
    topic: 'Artificial Intelligence in IVF Embryo Selection',
    requestedSlideCount: 2,
    references: [
      { referenceNumber: 1, authors: 'Wang S', year: 2023, title: 'Wang Study', journal: 'RBMO' }
    ],
    slides: [
      {
        slideNumber: 1,
        stage: 1,
        title: 'Title Slide',
        objective: 'Introductory framing',
        mainMessage: 'Evidence Overview',
        onSlideText: '• Background context\n• Study scope',
        speakerNotes: 'Welcome to this session.',
        sources: []
      },
      {
        slideNumber: 2,
        stage: 4,
        title: 'Clinical Outcomes',
        objective: 'Evaluate hospital admissions and trial data',
        mainMessage: 'Consistent relative and absolute risk reductions across multicenter trials establish guideline-directed therapeutic adoption',
        onSlideText: '• Measurable decreases in acute emergency department visits and repeat unplanned hospital readmissions',
        speakerNotes: 'Cardiovascular outcomes show substantial reductions.',
        sources: []
      }
    ]
  };

  const res1 = validatePresentationOutput({
    deck: oldTemplateDeck,
    papers: test9Papers,
    requestedSlideCount: 2,
    topic: 'Artificial Intelligence in IVF Embryo Selection'
  });

  const failedIds1 = res1.checks.filter(c => c.status === 'fail').map(c => c.id);
  assert(failedIds1.includes('source_coverage'), 'Test 1 must fail on source_coverage');
  assert(failedIds1.includes('vocabulary_drift'), 'Test 1 must fail on vocabulary_drift');
  assert.strictEqual(res1.canExport, false, 'Test 1 must block export (canExport: false)');
  assert.strictEqual(res1.isValid, false, 'Test 1 must have isValid: false');
  console.log('  ✓ Failed checks:', failedIds1);
  console.log('  ✓ Export blocked message:', res1.summary);
  console.log('  ✅ TEST 1 PASSED.\n');

  // --------------------------------------------------------------------------
  // TEST 2: Benefit on null evidence fails
  // --------------------------------------------------------------------------
  console.log('▶️ TEST 2: Benefit on null evidence fails direction_fidelity');
  const nullBenefitDeck = {
    title: 'Trial Findings',
    topic: 'AI in IVF',
    requestedSlideCount: 1,
    references: [
      { referenceNumber: 1, authors: illingworthPaper.authors, year: illingworthPaper.year, title: illingworthPaper.title, journal: illingworthPaper.journal }
    ],
    slides: [
      {
        slideNumber: 1,
        stage: 4,
        title: 'RCT Pregnancy Outcomes',
        objective: 'Report clinical pregnancy findings',
        mainMessage: 'Trial results demonstrate efficacy',
        onSlideText: '• AI selection improved clinical pregnancy',
        speakerNotes: 'The study demonstrated positive pregnancy differences.',
        sources: [1]
      }
    ]
  };

  const res2 = validatePresentationOutput({
    deck: nullBenefitDeck,
    papers: [illingworthPaper],
    requestedSlideCount: 1,
    topic: 'AI in IVF'
  });

  const failedIds2 = res2.checks.filter(c => c.status === 'fail').map(c => c.id);
  assert(failedIds2.includes('direction_fidelity'), 'Test 2 must fail on direction_fidelity');
  assert.strictEqual(res2.canExport, false, 'Test 2 must block export');
  console.log('  ✓ direction_fidelity status:', res2.checks.find(c => c.id === 'direction_fidelity')?.status);
  console.log('  ✓ Details:', res2.checks.find(c => c.id === 'direction_fidelity')?.details);
  console.log('  ✅ TEST 2 PASSED.\n');

  // --------------------------------------------------------------------------
  // TEST 3: Invented number fails
  // --------------------------------------------------------------------------
  console.log('▶️ TEST 3: Invented number fails unsupported_numbers');
  const wangPaper = test9Papers[2];
  const inventedNumberDeck = {
    title: 'Wang Study Findings',
    topic: 'AI in IVF',
    requestedSlideCount: 1,
    references: [
      { referenceNumber: 1, authors: wangPaper.authors, year: wangPaper.year, title: wangPaper.title, journal: wangPaper.journal }
    ],
    slides: [
      {
        slideNumber: 1,
        stage: 4,
        title: 'Implantation Results',
        objective: 'Report implantation data',
        mainMessage: 'Cohort analysis findings',
        onSlideText: '• Implantation rose by 25%',
        speakerNotes: 'Implantation increased markedly.',
        sources: [1]
      }
    ]
  };

  const res3 = validatePresentationOutput({
    deck: inventedNumberDeck,
    papers: [wangPaper],
    requestedSlideCount: 1,
    topic: 'AI in IVF'
  });

  const failedIds3 = res3.checks.filter(c => c.status === 'fail').map(c => c.id);
  assert(failedIds3.includes('unsupported_numbers'), 'Test 3 must fail on unsupported_numbers');
  assert.strictEqual(res3.canExport, false, 'Test 3 must block export');
  console.log('  ✓ unsupported_numbers status:', res3.checks.find(c => c.id === 'unsupported_numbers')?.status);
  console.log('  ✓ Details:', res3.checks.find(c => c.id === 'unsupported_numbers')?.details);
  console.log('  ✅ TEST 3 PASSED.\n');

  // --------------------------------------------------------------------------
  // TEST 4: Author-year citation fails; study prefix passes
  // --------------------------------------------------------------------------
  console.log('▶️ TEST 4: Author-year citation fails no_intext_citations; label prefix passes');
  const failDeck4 = {
    title: 'Deck 4 Citation Test',
    topic: 'AI in IVF',
    requestedSlideCount: 1,
    references: [
      { referenceNumber: 1, authors: wangPaper.authors, year: wangPaper.year, title: wangPaper.title, journal: wangPaper.journal }
    ],
    slides: [
      {
        slideNumber: 1,
        stage: 4,
        title: 'Evidence Review',
        objective: 'Examine citations',
        mainMessage: 'Evidence synthesis',
        onSlideText: '• Wang S, 2023: Implantation was higher in the AAG group (80.87% versus 68.15%, P = 0.022).',
        speakerNotes: 'Doe J et al. (2020) found positive results in initial investigations.',
        sources: [1]
      }
    ]
  };

  const res4Fail = validatePresentationOutput({
    deck: failDeck4,
    papers: [wangPaper],
    requestedSlideCount: 1,
    topic: 'AI in IVF'
  });
  assert(res4Fail.checks.find(c => c.id === 'no_intext_citations')?.status === 'fail', 'Test 4 must fail on author-year citation');

  const passDeck4 = {
    title: 'Deck 4 Citation Test Pass',
    topic: 'AI in IVF',
    requestedSlideCount: 1,
    references: [
      { referenceNumber: 1, authors: wangPaper.authors, year: wangPaper.year, title: wangPaper.title, journal: wangPaper.journal }
    ],
    slides: [
      {
        slideNumber: 1,
        stage: 4,
        title: 'Evidence Review',
        objective: 'Examine citations',
        mainMessage: 'Evidence synthesis',
        onSlideText: '• Wang S, 2023: Implantation was higher in the AAG group (80.87% versus 68.15%, P = 0.022).',
        speakerNotes: 'Cohort analysis confirms higher blastocyst implantation without live birth difference.',
        sources: [1]
      }
    ]
  };

  const res4Pass = validatePresentationOutput({
    deck: passDeck4,
    papers: [wangPaper],
    requestedSlideCount: 1,
    topic: 'AI in IVF'
  });
  assert(res4Pass.checks.find(c => c.id === 'no_intext_citations')?.status === 'pass', 'Wang S, 2023: label at bullet start must pass');
  console.log('  ✓ In-text author-year citation fails as expected');
  console.log('  ✓ Study label prefix "Wang S, 2023:" passes as expected');
  console.log('  ✅ TEST 4 PASSED.\n');

  // --------------------------------------------------------------------------
  // TEST 5: Framing slide with numeric sources fails
  // --------------------------------------------------------------------------
  console.log('▶️ TEST 5: Framing slide with numeric sources fails framing_sources');
  const framingDeck = {
    title: 'Framing Source Test',
    topic: 'AI in IVF',
    requestedSlideCount: 1,
    references: [
      { referenceNumber: 1, authors: wangPaper.authors, year: wangPaper.year, title: wangPaper.title, journal: wangPaper.journal }
    ],
    slides: [
      {
        slideNumber: 1,
        stage: 1,
        title: 'Title Slide',
        objective: 'Introductory session',
        mainMessage: 'Evidence summary on AI in IVF',
        onSlideText: '• Narrative summary of selected studies\n• Evaluated evidence scope',
        speakerNotes: 'Welcome to this session.',
        sources: [1] // Numeric source on framing slide!
      }
    ]
  };

  const res5 = validatePresentationOutput({
    deck: framingDeck,
    papers: [wangPaper],
    requestedSlideCount: 1,
    topic: 'AI in IVF'
  });
  const failedIds5 = res5.checks.filter(c => c.status === 'fail').map(c => c.id);
  assert(failedIds5.includes('framing_sources'), 'Framing slide with numeric sources must fail framing_sources');
  console.log('  ✓ framing_sources failed on slide 1:', res5.checks.find(c => c.id === 'framing_sources')?.details);
  console.log('  ✅ TEST 5 PASSED.\n');

  // --------------------------------------------------------------------------
  // TEST 6: Genuine deck passes with 0 fails
  // --------------------------------------------------------------------------
  console.log('▶️ TEST 6: Genuine deck passes with 0 fails');
  const deck6 = generatePresentationDeck({
    topic: 'Artificial Intelligence in IVF Embryo Selection',
    shortTitle: 'AI in IVF Embryo Selection',
    papers: test9Papers,
    requestedSlideCount: 10,
    audience: 'Postgraduate'
  });

  const res6 = validatePresentationOutput({
    deck: deck6,
    papers: test9Papers,
    requestedSlideCount: 10,
    topic: 'Artificial Intelligence in IVF Embryo Selection'
  });

  console.log('  Total checks:', res6.totalChecks);
  console.log('  Passed checks count:', res6.passedCount);
  console.log('  Warning checks count:', res6.warningCount);
  console.log('  Failed checks count:', res6.failedCount);
  console.log('  Summary:', res6.summary);
  assert.strictEqual(res6.failedCount, 0, `Genuine deck must have 0 failed checks, had ${res6.failedCount}`);
  assert.strictEqual(res6.canExport, true, 'Genuine deck must be eligible for export (canExport: true)');

  // Verify no forbidden assurance buzzwords in output
  const deckJson = JSON.stringify(deck6);
  const validatorJson = JSON.stringify(res6);
  const bannedBuzzwords = ['100%', 'freshly synthesized', 'Zero generic AI', 'Standards Verified'];
  bannedBuzzwords.forEach(buzzword => {
    assert(!deckJson.includes(buzzword), `Deck text must not contain "${buzzword}"`);
    assert(!validatorJson.includes(buzzword), `Validator text must not contain "${buzzword}"`);
  });
  console.log('  ✓ Zero banned assurance phrases found in deck or validator output');
  console.log('  ✅ TEST 6 PASSED.\n');

  // --------------------------------------------------------------------------
  // TEST 7: Part A checks on Test 9 deck
  // --------------------------------------------------------------------------
  console.log('▶️ TEST 7: Part A checks on Test 9 deck');
  // (a) Wang appraisal main message mentions both implantation and live birth
  const wangSlide = deck6.slides.find(s => s.sources && s.sources.includes(3) && s.title && s.title.includes('Wang S'));
  assert(wangSlide, 'Wang appraisal slide must exist');
  console.log('  Wang appraisal title:', wangSlide.title);
  console.log('  Wang appraisal main message:', wangSlide.main_message);
  assert(/implantation/i.test(wangSlide.main_message), 'Wang main message must mention implantation');
  assert(/live birth/i.test(wangSlide.main_message), 'Wang main message must mention live birth');

  // (b) No "consistent findings" statement lists both [1] and [3]
  const consistentFindingsStatements = [];
  const walkObj = (obj) => {
    if (!obj) return;
    if (typeof obj === 'string') {
      if (/consistent findings|consistent positive findings/i.test(obj) && !/not consistent/i.test(obj)) {
        consistentFindingsStatements.push(obj);
      }
    } else if (Array.isArray(obj)) {
      obj.forEach(walkObj);
    } else if (typeof obj === 'object') {
      Object.values(obj).forEach(walkObj);
    }
  };
  walkObj(deck6);
  consistentFindingsStatements.forEach(stmt => {
    assert(!/\[1\].*\[3\]|\[3\].*\[1\]/.test(stmt), `Statement claiming consistent findings must not list both [1] and [3]: "${stmt}"`);
  });

  // (c) None of "quality-of-life", "health-economic", "survival" appear
  const researchGapsText = (deck6.researchGaps || []).join(' ').toLowerCase();
  assert(!/quality-of-life|health-economic|survival/i.test(researchGapsText), 'Research gaps must not mention unrequested outcomes (QoL, survival, health-economic)');

  // (d) No findings bullet starts with "The primary endpoint was"
  const allBullets = deck6.slides.flatMap(s => (s.on_slide_text || '').split('\n')).filter(Boolean);
  const designAsFinding = allBullets.filter(b => /•\s*The primary endpoint was/i.test(b));
  assert.strictEqual(designAsFinding.length, 0, 'No bullet may start with "The primary endpoint was"');

  // (e) Every Balanced on-slide bullet has 15 words or fewer
  const longBullets = allBullets.filter(b => {
    const words = b.replace(/^[•\s-]+/, '').trim().split(/\s+/).filter(Boolean);
    return words.length > 15;
  });
  assert.strictEqual(longBullets.length, 0, `All Balanced bullets must be <= 15 words. Found ${longBullets.length} long bullets:\n${longBullets.join('\n')}`);

  // (f) No "systematic evidence synthesis" and no "Topic-neutral extractive"
  const fullSerializedDeck = JSON.stringify(deck6);
  assert(!/systematic evidence synthesis/i.test(fullSerializedDeck), 'Must not claim "systematic evidence synthesis"');
  assert(!/Topic-neutral extractive/i.test(fullSerializedDeck), 'Must not use developer phrase "Topic-neutral extractive"');
  console.log('  ✓ Wang slide mentions both implantation and live birth');
  console.log('  ✓ No consistent findings falsely lumping [1] and [3]');
  console.log('  ✓ No irrelevant QoL / survival / health-economic gaps');
  console.log('  ✓ No "The primary endpoint was" findings bullet');
  console.log('  ✓ 100% of Balanced on-slide bullets <= 15 words');
  console.log('  ✓ Developer and systematic review claims removed');
  console.log('  ✅ TEST 7 PASSED.\n');

  // --------------------------------------------------------------------------
  // TEST 8: Honest labels verified across files
  // --------------------------------------------------------------------------
  console.log('▶️ TEST 8: Honest labels verified across files');
  const indexHtml = fs.readFileSync(path.join(__dirname, '../../public/index.html'), 'utf8');
  const appJs = fs.readFileSync(path.join(__dirname, '../../public/app.js'), 'utf8');

  // Generate docx and inspect text content
  const docxBuffer = await generatePresentationDocx({
    topic: 'Artificial Intelligence in IVF Embryo Selection',
    deck: deck6,
    papers: test9Papers,
    meta: deck6.meta
  });
  const docxText = docxBuffer.toString('utf8');

  // Banned user-visible strings
  assert(!indexHtml.includes('The AI suggests'), 'public/index.html must not contain "The AI suggests"');
  assert(!indexHtml.includes('PROMPT 13'), 'public/index.html must not contain "PROMPT 13"');
  assert(!indexHtml.includes('Prompt 10'), 'public/index.html must not contain "Prompt 10"');
  assert(!docxText.includes('peer-reviewed studies were retrieved'), 'Word references preamble must not claim peer-reviewed studies were retrieved');

  // Conference abstract badge check
  const confPaper = {
    title: 'P-170 Clinical evaluation of time-lapse embryo imaging algorithms',
    journal: 'Hum Reprod (Suppl 1)',
    year: 2023,
    abstract: 'Abstract for conference presentation.'
  };
  assert.strictEqual(detectIsConferenceAbstract(confPaper), true, 'Conference abstract code P-170 must be detected');
  console.log('  ✓ User-visible banned template phrases verified absent');
  console.log('  ✓ Conference abstract detection verified for "P-170..."');
  console.log('  ✅ TEST 8 PASSED.\n');

  // --------------------------------------------------------------------------
  // TEST 9: Server-side block on /api/export-docx
  // --------------------------------------------------------------------------
  console.log('▶️ TEST 9: Server-side block on /api/export-docx');
  let responseStatusCode = null;
  let responseHeaders = {};
  let responseData = '';

  const mockReq = {
    method: 'POST',
    body: {
      topic: 'AI in IVF',
      deck: nullBenefitDeck, // Failing deck from Test 2 (asserts benefit on null evidence)
      papers: [illingworthPaper]
    }
  };

  const mockRes = {
    statusCode: 200,
    setHeader(k, v) { responseHeaders[k] = v; },
    end(data) {
      responseStatusCode = this.statusCode;
      responseData = data;
    }
  };

  await exportDocxHandler(mockReq, mockRes);

  assert.strictEqual(responseStatusCode, 400, `Direct POST of failing deck must return HTTP 400, got ${responseStatusCode}`);
  const parsedResp = JSON.parse(responseData || '{}');
  assert(parsedResp.error && parsedResp.error.includes('Pre-export validation failed'), 'Response error must state validation failed');
  assert(
    (parsedResp.failingChecks && parsedResp.failingChecks.includes('direction_fidelity')) ||
    (parsedResp.error && parsedResp.error.includes('direction_fidelity')),
    'Response body must name the failing check (direction_fidelity)'
  );
  console.log(`  ✓ Blocked with HTTP ${responseStatusCode}`);
  console.log('  ✓ Error message:', parsedResp.error);
  console.log('  ✅ TEST 9 PASSED.\n');

  console.log('================================================================');
  console.log('🎉 ALL 9 PROMPT 2 ACCEPTANCE TESTS PASSED SUCCESSFULLY!');
  console.log('================================================================\n');

  return {
    test6Results: res6,
    res1,
    res2,
    res3,
    wangSlide,
    conclusionSlide: deck6.slides[deck6.slides.length - 1]
  };
}

if (require.main === module) {
  runPrompt2Tests().catch(err => {
    console.error('❌ Test suite failed:', err);
    process.exit(1);
  });
}

module.exports = { runPrompt2Tests };
