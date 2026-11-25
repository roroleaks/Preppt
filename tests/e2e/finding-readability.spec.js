/**
 * Acceptance & Regression Test: Finding Readability, Role Provenance & Sentence Classification (Prompt 3d)
 *
 * Verifies:
 * 1. The 3 bad Prompt 3c outputs FAIL `finding_readability`.
 * 2. Example 3 renders as "Clinical pregnancy: 45.7% AI-assisted vs 38.1% conventional; aOR 1.40 (95% CI 1.11–1.77), p=0.004"
 *    with raw counts moved to overflow/speaker notes.
 * 3. Examples 1 and 2 (background sentences) do NOT appear as finding bullets in the 15-paper deck.
 * 4. "AUC 0.79 (95% CI 0.71–0.86)" preserves labelled AUC and 95% CI.
 * 5. Null result ("non-inferiority was not demonstrated; RD −1.7% (95% CI −7.7 to 4.3)") keeps direction words.
 * 6. `finding_role` FAILS when a background sentence is placed on a findings slide.
 * 7. Sentence role classifier achieves >= 90% accuracy on tests/fixtures/sentence-roles.json (22 sentences).
 * 8. The 15-paper fixture deck passes ALL ERROR checks, including `finding_readability` and `finding_role`.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { validatePresentationOutput } = require('../../lib/validator.js');
const { generatePresentationDeck } = require('../../lib/synthesize.js');
const { parseAbstractSentences } = require('../../lib/evidence-extractor.js');
const { compressFindingPreservingNumbers } = require('../../lib/text-rules.js');

function runTests() {
  console.log('--- TEST: Finding Readability, Role Provenance & Sentence Roles (Prompt 3d) ---');

  const dummyPaper = {
    id: 'p1',
    title: 'AI in Assisted Reproduction',
    authors: ['Olasoji O. Agboola', 'Jane Doe'],
    journal: 'Hum Reprod',
    year: 2025,
    abstract: 'Despite four decades of refinement, in vitro fertilisation live birth rates plateau at 25-30% globally. Clinical pregnancy rates were significantly higher in the AI-assisted group (45.7%, 268/587) compared to the conventional group (38.1%, 223/585), with an adjusted odds ratio of 1.40 (95% confidence interval, 1.11-1.77; p = 0.004).'
  };

  // 1. The 3 bad outputs must FAIL finding_readability
  console.log('1. Verifying the 3 bad Prompt 3c outputs FAIL finding_readability...');
  const badBullets = [
    '• Qiuyao Li et al.: However, invitro: 50%',
    '• Olasoji O. Agboola et al.: Despite four: 25-30%',
    '• Olasoji O. Agboola et al.: Clinical pregnancy: 45.7%, 268, 587, 38.1%, 223, 585, 1.40, 95%, 1.11-1.77, p = 0.004'
  ];

  for (const bad of badBullets) {
    const rep = validatePresentationOutput({
      deck: {
        meta: { projectName: 'Preppt – Scientific Literature to Presentation', topic: 'AI in ART' },
        slides: [{
          slide_number: 1,
          title: 'What the Studies Found: Primary Outcomes',
          main_message: 'Summary of outcomes.',
          on_slide_text: bad,
          speaker_notes: 'Speaker notes for this slide.',
          sources: [1]
        }],
        researchGaps: []
      },
      papers: [dummyPaper],
      requestedSlideCount: 1
    });
    const fr = rep.checks.find(c => c.id === 'finding_readability');
    assert.strictEqual(fr.status, 'fail', `Expected "${bad}" to FAIL finding_readability, got ${fr.status}`);
  }
  console.log('   ✓ All 3 unreadable outputs failed finding_readability.');

  // 2. Example 3 source sentence renders exactly as target
  console.log('2. Testing structured rendering of Example 3 source sentence...');
  const ex3Src = 'Clinical pregnancy rates were significantly higher in the AI-assisted group (45.7%, 268/587) compared to the conventional group (38.1%, 223/585), with an adjusted odds ratio of 1.40 (95% confidence interval, 1.11-1.77; p = 0.004).';
  const ex3Rendered = compressFindingPreservingNumbers('', ex3Src, 18);
  assert(
    /^Clinical pregnancy: 45\.7% AI-assisted vs 38\.1% conventional; aOR 1\.40 \(95% CI 1\.11[–-]1\.77\), p=0\.004$/.test(ex3Rendered.text),
    `Unexpected Example 3 output: "${ex3Rendered.text}"`
  );
  assert(ex3Rendered.overflow.includes('268/587') && ex3Rendered.overflow.includes('223/585'), 'Raw counts must move to overflow/speaker notes');
  console.log(`   ✓ Rendered: "${ex3Rendered.text}"`);

  // 3. AUC 0.79 (95% CI 0.71–0.86)
  console.log('3. Testing AUC 0.79 (95% CI 0.71–0.86) preservation...');
  const aucSrc = 'Embryo prediction achieved AUC 0.79 (95% CI 0.71–0.86) across validation cohorts.';
  const aucRendered = compressFindingPreservingNumbers('', aucSrc, 18);
  assert(
    /AUC 0\.79 \(95% CI 0\.71[–-]0\.86\)/.test(aucRendered.text),
    `Expected AUC 0.79 (95% CI 0.71–0.86) in output, got: "${aucRendered.text}"`
  );
  console.log(`   ✓ Rendered: "${aucRendered.text}"`);

  // 4. Null result keeps direction words
  console.log('4. Testing null result direction-word preservation...');
  const nullSrc = 'Non-inferiority was not demonstrated; RD -1.7% (95% CI -7.7 to 4.3).';
  const nullRendered = compressFindingPreservingNumbers('', nullSrc, 18);
  assert(
    /non-inferiority not demonstrated/i.test(nullRendered.text) && nullRendered.text.includes('RD -1.7%'),
    `Expected null direction words + RD preserved, got: "${nullRendered.text}"`
  );
  console.log(`   ✓ Rendered: "${nullRendered.text}"`);

  // 5. finding_role fails when background sentence is placed on a findings slide
  console.log('5. Testing finding_role rejects background sentence on findings slide...');
  const roleRep = validatePresentationOutput({
    deck: {
      meta: { projectName: 'Preppt – Scientific Literature to Presentation', topic: 'AI in ART' },
      slides: [{
        slide_number: 4,
        stage: 4,
        title: 'What the Studies Found: Primary Outcomes',
        main_message: 'Summary.',
        on_slide_text: '• In vitro fertilisation live birth rates plateau at 25-30% globally due to subjective selection (Agboola 2025).',
        speaker_notes: 'Notes.',
        sources: [1]
      }],
      researchGaps: []
    },
    papers: [dummyPaper],
    requestedSlideCount: 1
  });
  const roleCheck = roleRep.checks.find(c => c.id === 'finding_role');
  assert.strictEqual(roleCheck.status, 'fail', `Expected finding_role to FAIL on background sentence, got ${roleCheck.status}`);
  console.log('   ✓ finding_role correctly failed on background sentence.');

  // 6. Sentence role classification >= 90% accuracy on tests/fixtures/sentence-roles.json
  console.log('6. Evaluating sentence role classifier on tests/fixtures/sentence-roles.json...');
  const rolesFixturePath = path.resolve(__dirname, '../fixtures/sentence-roles.json');
  const labelled = JSON.parse(fs.readFileSync(rolesFixturePath, 'utf8'));
  assert(labelled.length >= 20, 'sentence-roles.json must have at least 20 labelled sentences');
  let correct = 0;
  for (const item of labelled) {
    const parsed = parseAbstractSentences(item.raw);
    const got = parsed[0] ? parsed[0].role : 'unknown';
    if (got === item.expectedRole) correct++;
  }
  const accuracy = (correct / labelled.length) * 100;
  console.log(`   ✓ Role accuracy: ${correct}/${labelled.length} (${accuracy.toFixed(1)}%)`);
  assert(accuracy >= 90, `Expected >= 90% role accuracy, got ${accuracy.toFixed(1)}%`);

  // 7. 15-paper fixture deck: Examples 1 & 2 absent as findings; passes ALL ERROR checks
  console.log('7. Testing 15-paper fixture deck passes all ERROR checks without background findings...');
  const req15 = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../fixtures/ai-art-15papers.request.json'), 'utf8'));
  const deck15 = generatePresentationDeck(req15);
  const allOnSlide = deck15.slides.map(s => s.on_slide_text || '').join('\n');
  assert(!allOnSlide.includes('However, invitro'), 'Example 1 background sentence must NOT appear as finding bullet');
  assert(!allOnSlide.includes('Despite four'), 'Example 2 background sentence must NOT appear as finding bullet');

  const val15 = validatePresentationOutput({
    deck: deck15,
    papers: req15.papers,
    removedPapers: [],
    requestedSlideCount: req15.slideCount,
    topic: req15.topic
  });
  assert.strictEqual(
    val15.failedCount,
    0,
    `Expected 0 ERROR failures on 15-paper deck, got: ${JSON.stringify(val15.checks.filter(c => c.status === 'fail'))}`
  );
  console.log(`   ✓ 15-paper deck passed all ERROR checks (${val15.summary}).`);

  console.log('\nPassed: Finding readability, role provenance, and sentence classification verified.\n');
}

if (require.main === module) {
  try {
    runTests();
  } catch (err) {
    console.error(`✗ Test failed: ${err.message}`);
    process.exit(1);
  }
}

module.exports = { runTests };
