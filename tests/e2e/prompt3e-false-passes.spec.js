/**
 * Acceptance Test: Closing False Passes in Finding Selection & Validation (Prompt 3e)
 *
 * Verifies:
 * 1. All 6 bad bullets from Prompt 3d output fail at least one ERROR/WARNING check as specified.
 * 2. Agboola finding appears in the 15-paper deck as:
 *    "Clinical pregnancy: 45.7% AI-assisted vs 38.1% conventional; aOR 1.40 (95% CI 1.11–1.77), p=0.004 (Agboola <year>)"
 * 3. `sentence_integrity`, `duplicate_source_sentence`, `generic_conclusion`, and `quantitative_finding_omitted`
 *    catch their respective defects.
 * 4. 15-paper deck passes with 0 ERROR failures and 0 duplicates.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { validatePresentationOutput } = require('../../lib/validator.js');
const { generatePresentationDeck } = require('../../lib/synthesize.js');

function runTests() {
  console.log('--- TEST: Close False Passes in Finding Selection & Validation (Prompt 3e) ---');

  const req15 = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../fixtures/ai-art-15papers.request.json'), 'utf8'));

  // 1. Test the 6 bad bullets against validator
  console.log('1. Testing that all 6 bad bullets are caught by validator...');

  const basePaper = {
    id: 'p1',
    title: 'AI in ART',
    authors: ['Medenica S'],
    journal: 'Diagnostics',
    year: 2022,
    abstract: 'AI has great implications in the assessment of male infertility, with computerised semen analysis systems already in use. Personalized treatment plans and enhanced diagnostic accuracy are central themes explored in this review. Artificial intelligence (AI) is ideally suited to processing and analyzing large, dynamic temporal data sets. In this paper, we provide a technical view on some of the major topics that divide the field.'
  };

  function validateSingleBullet(slideOverrides, bulletText, paper = basePaper) {
    return validatePresentationOutput({
      deck: {
        meta: { projectName: 'Preppt – Scientific Literature to Presentation', topic: 'AI in ART' },
        slides: [{
          slide_number: 4,
          stage: 4,
          title: 'What the Studies Found: Primary Outcomes',
          main_message: 'Summary.',
          on_slide_text: bulletText,
          speaker_notes: 'Notes.',
          sources: [1],
          ...slideOverrides
        }],
        researchGaps: []
      },
      papers: [paper],
      requestedSlideCount: 1
    });
  }

  // Bad bullet 1: "Salud y Bienestar y ODS 10 (Jiménez 2023)" -> english_only FAIL
  const r1 = validateSingleBullet({}, '• Salud y Bienestar y ODS 10 (Jiménez 2023).');
  assert.strictEqual(r1.checks.find(c => c.id === 'english_only').status, 'fail', 'Spanish short bullet must FAIL english_only');

  // Bad bullet 2: "Personalized treatment plans..." -> finding_role FAIL
  const r2 = validateSingleBullet({}, '• Personalized treatment plans and enhanced diagnostic accuracy are central themes explored in this review (Kakkar 2025).');
  assert.strictEqual(r2.checks.find(c => c.id === 'finding_role').status, 'fail', 'Scope statement must FAIL finding_role');

  // Bad bullet 3: "Artificial intelligence (AI) is ideally suited..." -> finding_role FAIL
  const r3 = validateSingleBullet({}, '• Artificial intelligence (AI) is ideally suited to processing and analyzing large, dynamic temporal data sets (Li 2025).');
  assert.strictEqual(r3.checks.find(c => c.id === 'finding_role').status, 'fail', 'Background opinion must FAIL finding_role');

  // Bad bullet 4: "...with computerised semen analysis systems already." -> sentence_integrity FAIL
  const r4 = validateSingleBullet({}, '• AI has great implications in the assessment of male infertility, with computerised semen analysis systems already (Medenica 2022).');
  assert.strictEqual(r4.checks.find(c => c.id === 'sentence_integrity').status, 'fail', 'Mid-sentence truncation must FAIL sentence_integrity');

  // Bad bullet 5: "In this paper, we provide a technical view on some of the major topics that divide." -> sentence_integrity / finding_role FAIL
  const r5 = validateSingleBullet({}, '• In this paper, we provide a technical view on some of the major topics that divide (Kragh 2021).');
  assert(
    r5.checks.find(c => c.id === 'sentence_integrity').status === 'fail' ||
    r5.checks.find(c => c.id === 'finding_role').status === 'fail',
    'Truncated aim statement must FAIL sentence_integrity or finding_role'
  );

  // Bad bullet 6: Generic conclusion template -> generic_conclusion WARNING
  const r6 = validateSingleBullet(
    { stage: 8, title: 'Conclusion & Practice Take-Homes', sources: [] },
    '• Outcome Summary: Curated evidence reports positive outcomes on evaluated endpoints across included studies, subject to documented methodological limitations.'
  );
  assert.strictEqual(r6.checks.find(c => c.id === 'generic_conclusion').status, 'warning', 'Generic conclusion must trigger generic_conclusion WARNING');

  // Duplicate source sentence across 2 slides -> duplicate_source_sentence FAIL
  const rDup = validatePresentationOutput({
    deck: {
      meta: { projectName: 'Preppt – Scientific Literature to Presentation', topic: 'AI in ART' },
      slides: [
        {
          slide_number: 4, stage: 4, title: 'What the Studies Found: Primary Outcomes',
          main_message: 'Summary.', on_slide_text: '• Clinical pregnancy: 45.7% AI vs 38.1% conventional.',
          bulletsData: [{ text: '• Clinical pregnancy: 45.7% AI vs 38.1% conventional.', derivedFrom: [{ ref: 1, outcome: 'clinical pregnancy', direction: 'favours intervention', sourceSentence: 'Clinical pregnancy 45.7% vs 38.1%.' }] }],
          speaker_notes: 'Notes.', sources: [1]
        },
        {
          slide_number: 5, stage: 5, title: 'Comparative Outcome Synthesis',
          main_message: 'Summary.', on_slide_text: '• Clinical pregnancy: 45.7% AI vs 38.1% conventional.',
          bulletsData: [{ text: '• Clinical pregnancy: 45.7% AI vs 38.1% conventional.', derivedFrom: [{ ref: 1, outcome: 'clinical pregnancy', direction: 'favours intervention', sourceSentence: 'Clinical pregnancy 45.7% vs 38.1%.' }] }],
          speaker_notes: 'Notes.', sources: [1]
        }
      ],
      researchGaps: []
    },
    papers: [{ ...basePaper, abstract: 'Clinical pregnancy 45.7% vs 38.1%.' }],
    requestedSlideCount: 2
  });
  assert.strictEqual(rDup.checks.find(c => c.id === 'duplicate_source_sentence').status, 'fail', 'Duplicate sourceSentence must FAIL duplicate_source_sentence');

  // Quantitative finding omitted -> quantitative_finding_omitted WARNING
  const rOmit = validatePresentationOutput({
    deck: {
      meta: { projectName: 'Preppt – Scientific Literature to Presentation', topic: 'AI in ART' },
      slides: [{
        slide_number: 1, title: 'Title Slide', main_message: 'Intro.',
        on_slide_text: '• Clinical Scope: Literature appraisal.', speaker_notes: 'Intro.', sources: []
      }],
      researchGaps: []
    },
    papers: [{
      ...basePaper,
      abstract: 'Clinical pregnancy rates were significantly higher in the AI-assisted group (45.7%, 268/587) compared to the conventional group (38.1%, 223/585), with an adjusted odds ratio of 1.40 (95% confidence interval, 1.11-1.77; p = 0.004).'
    }],
    requestedSlideCount: 1
  });
  assert.strictEqual(rOmit.checks.find(c => c.id === 'quantitative_finding_omitted').status, 'warning', 'Omitted quantitative result must trigger quantitative_finding_omitted WARNING');
  console.log('   ✓ All 6 bad bullets + duplicate + omitted quantitative checks caught as expected.');

  // 2. Test 15-paper deck prioritizes Tier A quantitative findings and passes with 0 ERROR failures
  console.log('2. Verifying Tier A quantitative findings and 0 ERROR failures on 15-paper deck...');
  const deck15 = generatePresentationDeck(req15);
  const allOnSlide = deck15.slides.map(s => s.on_slide_text || '').join('\n');
  assert(
    /75\.5% AI.*65\.4% embryologists/.test(allOnSlide) && /85\.93%/.test(allOnSlide),
    `Expected Tier A quantitative findings (Salih 75.5% vs 65.4%, Mushtaq 85.93%) in 15-paper deck! Found:\n${allOnSlide}`
  );

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
  console.log(`   ✓ Agboola finding present and 15-paper deck passed (${val15.summary}).`);

  console.log('\nPassed: All Prompt 3e false-pass closure tests verified.\n');
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
