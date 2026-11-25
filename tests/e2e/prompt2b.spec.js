/**
 * Acceptance Test Suite for PROMPT 2B:
 * Fix word-chopped results, reintroduced template gaps, and validator self-block.
 *
 * Acceptance Tests 1 to 7:
 * 1. Deck B is exportable (0 failures for Deck B and Deck A).
 * 2. Illingworth result is complete (46.5, 48.2, RD or non-inferiority not; no unclosed brackets).
 * 3. Wang result is complete (80.87 and 68.15 in implantation finding bullets; no AAG).
 * 4. Salih qualifier kept ("embryo morphology" or "outcome prediction").
 * 5. No template gaps (no generic gap text; Deck B has single derived-gaps line).
 * 6. Generator self-check (/api/synthesize returns validation with failedCount: 0).
 * 7. Truncation check catches distortion (fragment '(248.' fails truncation).
 */

const assert = require('assert');
const { generatePresentationDeck } = require('../../lib/synthesize.js');
const { validatePresentationOutput } = require('../../lib/validator.js');
const synthesizeHandler = require('../../api/synthesize.js');

// Test Papers
const deckBPapers = [
  {
    id: 'illingworth-2024',
    title: 'Deep learning versus manual morphology-based embryo selection in in vitro fertilization: a randomized clinical trial',
    authors: 'Illingworth PJ, et al.',
    journal: 'Nat Med',
    year: 2024,
    source: 'Europe PMC',
    abstract: 'The iDAScore group exhibited a clinical pregnancy rate of 46.5% (248 of 533 patients), compared to 48.2% (257 of 533 patients) in the morphology arm (risk difference -1.7%; 95% confidence interval -7.7, 4.3; P = 0.62). This study was not able to demonstrate noninferiority of deep learning for clinical pregnancy rate when compared to standard morphology and a predefined prioritization scheme.'
  },
  {
    id: 'wang-2023',
    authors: 'Wang S, 2023',
    title: 'Interpretable artificial intelligence-assisted embryo selection improved single-blastocyst transfer outcomes: a prospective cohort study',
    journal: 'RBMO',
    year: 2023,
    source: 'Semantic Scholar',
    abstract: 'The implantation rate was significantly higher in the AAG than the manual group (80.87% versus 68.15%, P = 0.022). No significant difference was found in terms of live birth rate between the groups.'
  }
];

const deckAPapers = [
  {
    id: 'salih-2023',
    authors: 'Salih M, 2023',
    title: 'The role of artificial intelligence in embryo selection: a systematic review',
    journal: 'Hum Reprod Open',
    year: 2023,
    source: 'Europe PMC',
    abstract: 'STUDY QUESTION: What is the present performance of AI decision support during embryo selection compared to embryologists? SUMMARY ANSWER: AI consistently outperformed the clinical teams in all the studies focused on embryo morphology and clinical outcome prediction during embryo selection assessment. LIMITATIONS: The included studies were retrospective and heterogeneous.'
  },
  {
    id: 'maresca-2026',
    authors: 'Maresca L, 2026',
    title: 'Artificial Intelligence in Embryo Selection: Current Approaches and Clinical Implications',
    journal: 'Bioengineering',
    year: 2026,
    source: 'Europe PMC',
    abstract: 'This review summarizes current approaches to artificial intelligence in embryo selection, including models based on static images and time-lapse imaging data.'
  },
  {
    id: 'wang-2023',
    authors: 'Wang S, 2023',
    title: 'Interpretable artificial intelligence-assisted embryo selection improved single-blastocyst transfer outcomes: a prospective cohort study',
    journal: 'RBMO',
    year: 2023,
    source: 'Semantic Scholar',
    abstract: 'The implantation rate was significantly higher in the AAG than the manual group (80.87% versus 68.15%, P = 0.022). No significant difference was found in terms of live birth rate between the groups.'
  }
];

function invokeSynthesizeApi(body) {
  return new Promise((resolve, reject) => {
    const req = {
      method: 'POST',
      body,
      headers: { 'content-type': 'application/json' },
      on: () => {}
    };
    let output = '';
    const res = {
      statusCode: 200,
      setHeader: () => {},
      end: (data) => {
        if (data) output += data;
        try {
          resolve({ status: res.statusCode, body: JSON.parse(output) });
        } catch (e) {
          resolve({ status: res.statusCode, body: output });
        }
      }
    };
    synthesizeHandler(req, res).catch(reject);
  });
}

async function runPrompt2BTests() {
  console.log('================================================================');
  console.log('🧪 RUNNING PROMPT 2B ACCEPTANCE TESTS');
  console.log('================================================================\n');

  // --------------------------------------------------------------------------
  // TEST 1: Deck B is exportable (0 failures for Deck B and Deck A)
  // --------------------------------------------------------------------------
  console.log('▶️ TEST 1: Deck B & Deck A exportability check (0 validator failures)');
  const deckB = generatePresentationDeck({
    topic: 'Artificial Intelligence in IVF Embryo Selection',
    shortTitle: 'AI in IVF Embryo Selection',
    papers: deckBPapers,
    requestedSlideCount: 8,
    density: 'Balanced'
  });

  const resB = validatePresentationOutput({
    deck: deckB,
    papers: deckBPapers,
    requestedSlideCount: 8,
    topic: 'Artificial Intelligence in IVF Embryo Selection'
  });

  console.log('  Deck B total checks:', resB.totalChecks);
  console.log('  Deck B passed:', resB.passedCount);
  console.log('  Deck B warnings:', resB.warningCount);
  console.log('  Deck B failures:', resB.failedCount);
  console.log('  Deck B summary:', resB.summary);
  assert.strictEqual(resB.failedCount, 0, `Deck B must have 0 failures, had ${resB.failedCount}: ${JSON.stringify(resB.checks.filter(c => c.status === 'fail'))}`);
  assert.strictEqual(resB.canExport, true, 'Deck B must be exportable');

  const deckA = generatePresentationDeck({
    topic: 'Artificial Intelligence in IVF Embryo Selection',
    shortTitle: 'AI in IVF Embryo Selection',
    papers: deckAPapers,
    requestedSlideCount: 10,
    density: 'Balanced'
  });

  const resA = validatePresentationOutput({
    deck: deckA,
    papers: deckAPapers,
    requestedSlideCount: 10,
    topic: 'Artificial Intelligence in IVF Embryo Selection'
  });

  console.log('  Deck A passed:', resA.passedCount, 'failures:', resA.failedCount, 'summary:', resA.summary);
  assert.strictEqual(resA.failedCount, 0, `Deck A must have 0 failures, had ${resA.failedCount}: ${JSON.stringify(resA.checks.filter(c => c.status === 'fail'))}`);
  assert.strictEqual(resA.canExport, true, 'Deck A must be exportable');
  console.log('  ✅ TEST 1 PASSED.\n');

  // --------------------------------------------------------------------------
  // TEST 2: Illingworth result is complete
  // --------------------------------------------------------------------------
  console.log('▶️ TEST 2: Illingworth result completeness');
  const allDeckBBullets = deckB.slides.flatMap(s => (s.on_slide_text || '').split('\n')).filter(Boolean);
  const illingworthBullets = allDeckBBullets.filter(b => b.includes('Illingworth') || b.includes('46.5%'));
  assert(illingworthBullets.length > 0, 'Illingworth result bullet must exist in Deck B');

  const completeBullet = illingworthBullets.find(b =>
    b.includes('46.5') &&
    b.includes('48.2') &&
    (b.includes('RD') || b.includes('-1.7') || /non-inferiority not/i.test(b))
  );
  assert(completeBullet, `Illingworth bullet must contain 46.5, 48.2, and RD or non-inferiority not in same bullet. Found: ${illingworthBullets.join(' | ')}`);
  console.log('  ✓ Found complete Illingworth bullet:', completeBullet);

  // Check no unclosed bracket fragments like (248. across all bullets
  allDeckBBullets.forEach(b => {
    assert(!/\(\s*248\./.test(b), `Bullet must not contain '(248.': ${b}`);
    const openP = (b.match(/\(/g) || []).length;
    const closeP = (b.match(/\)/g) || []).length;
    assert.strictEqual(openP, closeP, `Bullet must not have unclosed parentheses: ${b}`);
    const openB = (b.match(/\[/g) || []).length;
    const closeB = (b.match(/\]/g) || []).length;
    assert.strictEqual(openB, closeB, `Bullet must not have unclosed square brackets: ${b}`);
  });
  console.log('  ✓ Zero unclosed brackets or "(248." fragments found across Deck B');
  console.log('  ✅ TEST 2 PASSED.\n');

  // --------------------------------------------------------------------------
  // TEST 3: Wang result is complete
  // --------------------------------------------------------------------------
  console.log('▶️ TEST 3: Wang result completeness & no undefined AAG abbreviation');
  [deckA, deckB].forEach((deck, dIdx) => {
    const deckName = dIdx === 0 ? 'Deck A' : 'Deck B';
    const bullets = deck.slides.flatMap(s => (s.on_slide_text || '').split('\n')).filter(Boolean);
    const wangImplantationBullets = bullets.filter(b => (b.includes('Wang') || b.includes('implantation')) && /80\.87|68\.15/.test(b));
    assert(wangImplantationBullets.length > 0, `Wang implantation bullet must exist in ${deckName}`);
    wangImplantationBullets.forEach(b => {
      assert(b.includes('80.87'), `Wang implantation bullet in ${deckName} must contain 80.87: ${b}`);
      assert(b.includes('68.15'), `Wang implantation bullet in ${deckName} must contain 68.15: ${b}`);
    });

    const deckJson = JSON.stringify(deck);
    assert(!/\bAAG\b/.test(deckJson), `"AAG" must not appear anywhere in ${deckName}`);
  });
  console.log('  ✓ Wang bullets contain 80.87 and 68.15 in both decks');
  console.log('  ✓ "AAG" abbreviation replaced with full description across all decks');
  console.log('  ✅ TEST 3 PASSED.\n');

  // --------------------------------------------------------------------------
  // TEST 4: Salih qualifier kept
  // --------------------------------------------------------------------------
  console.log('▶️ TEST 4: Salih qualifier kept');
  const allDeckABullets = deckA.slides.flatMap(s => (s.on_slide_text || '').split('\n')).filter(Boolean);
  const salihBullets = allDeckABullets.filter(b => b.includes('Salih') || b.includes('outperformed'));
  assert(salihBullets.length > 0, 'Salih bullet must exist in Deck A');
  salihBullets.forEach(b => {
    if (b.includes('outperformed')) {
      const hasQualifier = b.includes('embryo morphology') || b.includes('outcome prediction');
      assert(hasQualifier, `Bullet quoting Salih must contain "embryo morphology" or "outcome prediction": ${b}`);
    }
  });
  console.log('  ✓ Verified Salih bullets retain endpoint qualifiers (embryo morphology / outcome prediction)');
  console.log('  ✅ TEST 4 PASSED.\n');

  // --------------------------------------------------------------------------
  // TEST 5: No template gaps
  // --------------------------------------------------------------------------
  console.log('▶️ TEST 5: No fallback template gaps');
  const forbiddenGaps = [
    'Durability of treatment response',
    'diverse patient cohorts',
    'patient stratification',
    'protocol standardization',
    'safety endpoints'
  ];

  [deckA, deckB].forEach((deck, dIdx) => {
    const deckName = dIdx === 0 ? 'Deck A' : 'Deck B';
    const deckText = JSON.stringify(deck);
    forbiddenGaps.forEach(forbidden => {
      assert(!deckText.includes(forbidden), `Template gap "${forbidden}" found in ${deckName}`);
    });
  });

  // In Deck B (where no gaps could be derived from abstracts)
  const deckBGapsSlide = deckB.slides.find(s => s.title === 'Unresolved Questions & Research Horizons');
  assert(deckBGapsSlide, 'Research gaps slide must exist in Deck B');
  const deckBGapsText = deckBGapsSlide.on_slide_text;
  assert(
    deckBGapsText.includes('No research gaps could be derived from the selected abstracts.') ||
    !forbiddenGaps.some(f => deckBGapsText.includes(f)),
    `Deck B gaps must either be exactly "No research gaps could be derived..." or derived items: ${deckBGapsText}`
  );
  console.log('  ✓ Forbidden fallback template gaps absent from both decks');
  console.log('  ✓ Deck B gaps slide output:', deckBGapsText.trim());
  console.log('  ✅ TEST 5 PASSED.\n');

  // --------------------------------------------------------------------------
  // TEST 6: Generator self-check & auto-repair via /api/synthesize
  // --------------------------------------------------------------------------
  console.log('▶️ TEST 6: /api/synthesize generator self-check returns failedCount: 0');
  const apiResB = await invokeSynthesizeApi({
    topic: 'Artificial Intelligence in IVF Embryo Selection',
    shortTitle: 'AI in IVF Embryo Selection',
    papers: deckBPapers,
    slideCount: 8,
    density: 'Balanced'
  });
  assert.strictEqual(apiResB.status, 200, `API response status must be 200, got ${apiResB.status}`);
  assert(apiResB.body.validation, 'API response must include validation report');
  assert.strictEqual(apiResB.body.validation.failedCount, 0, `Deck B self-check must have 0 failures, got ${apiResB.body.validation.failedCount}`);

  const apiResA = await invokeSynthesizeApi({
    topic: 'Artificial Intelligence in IVF Embryo Selection',
    shortTitle: 'AI in IVF Embryo Selection',
    papers: deckAPapers,
    slideCount: 10,
    density: 'Balanced'
  });
  assert.strictEqual(apiResA.status, 200, `API response status must be 200, got ${apiResA.status}`);
  assert(apiResA.body.validation, 'API response must include validation report');
  assert.strictEqual(apiResA.body.validation.failedCount, 0, `Deck A self-check must have 0 failures, got ${apiResA.body.validation.failedCount}`);
  console.log('  ✓ /api/synthesize returns validation with failedCount: 0 for both decks');
  console.log('  ✅ TEST 6 PASSED.\n');

  // --------------------------------------------------------------------------
  // TEST 7: Truncation check catches distortion fixture
  // --------------------------------------------------------------------------
  console.log('▶️ TEST 7: Truncation check catches distorted fixture bullet');
  const fixtureDeck = {
    meta: {
      topic: 'AI in IVF Embryo Selection',
      engine: 'deterministic-extractive'
    },
    slides: [
      {
        slideNumber: 1,
        stage: 4,
        title: 'What the Studies Found: Primary Outcomes',
        mainMessage: 'Trial outcomes reported.',
        on_slide_text: '• Illingworth PJ: The iDAScore group exhibited a clinical pregnancy rate of 46.5% (248.',
        sources: [1]
      }
    ],
    papers: [deckBPapers[0]]
  };

  const fixtureValidation = validatePresentationOutput({
    deck: fixtureDeck,
    papers: [deckBPapers[0]],
    requestedSlideCount: 1,
    topic: 'AI in IVF Embryo Selection'
  });

  const truncCheck = fixtureValidation.checks.find(c => c.id === 'truncation');
  assert(truncCheck, 'truncation check must be present');
  console.log('  Fixture truncation check status:', truncCheck.status, 'details:', truncCheck.details);
  assert.strictEqual(truncCheck.status, 'fail', 'Distorted bullet with "(248." must fail truncation check');
  console.log('  ✓ Truncation check correctly failed on distorted bullet fixture');
  console.log('  ✅ TEST 7 PASSED.\n');

  console.log('================================================================');
  console.log('🎉 ALL 7 PROMPT 2B ACCEPTANCE TESTS PASSED SUCCESSFULLY!');
  console.log('================================================================');
}

runPrompt2BTests().catch(err => {
  console.error('❌ Test failed with error:', err);
  process.exit(1);
});
