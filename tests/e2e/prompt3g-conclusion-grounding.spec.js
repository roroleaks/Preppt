/**
 * Prompt 3g E2E Acceptance Tests:
 * 1. Conclusion grounding (no study-type templates; grounded in findings slides + abstract)
 * 2. New ERROR check conclusion_grounding (Mushtaq false comparison FAILS; Salih PASSES)
 * 3. Mandatory Study Pool (with primary + RCT counts) and Evidence Limit bullets exempt from cap
 * 4. Technical vs clinical outcome separation on Slide 4
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { generatePresentationDeck } = require('../../lib/synthesize.js');
const { validatePresentationOutput } = require('../../lib/validator.js');
const { classifyMetricDomain } = require('../../lib/evidence-extractor.js');

function runTests() {
  console.log('--- TEST: Prompt 3g Conclusion Grounding, Mandatory Limits & Metric Classification ---');
  const req15 = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../fixtures/ai-art-15papers.request.json'), 'utf8')
  );

  // 1. Technical vs clinical classification
  assert.strictEqual(
    classifyMetricDomain('The proposed ECS-Net is providing a mean Jaccard Index (Mean JI) of 85.93% for embryological analysis.'),
    'technical',
    'Jaccard Index segmentation must classify as technical'
  );
  assert.strictEqual(
    classifyMetricDomain('Clinical pregnancy rates were significantly higher in the AI-assisted group (45.7%, 268/587) compared to conventional (38.1%, 223/585).'),
    'clinical',
    'Clinical pregnancy comparison must classify as clinical'
  );
  console.log('   ✓ classifyMetricDomain separates technical segmentation from clinical outcomes.');

  // 2. 15-paper Short bullet points deck: Slide 4 excludes technical-only Mushtaq & Kakkar; Slide 15 has grounded conclusion + mandatory Study Pool & Evidence Limit
  const deck15 = generatePresentationDeck(req15);
  const slide4 = deck15.slides.find(s => s.stage === 4);
  const slide15 = deck15.slides.find(s => s.stage === 8);
  assert(slide4 && slide15, 'Slide 4 and Slide 15 must exist');

  assert(!slide4.on_slide_text.includes('Kakkar 2025'), 'Kakkar opinion must not appear on Slide 4');
  assert(!slide4.on_slide_text.includes('85.93%'), 'Technical Jaccard Index (Mushtaq) must not appear as a primary clinical outcome on Slide 4 when clinical findings exist');

  const s15Text = slide15.on_slide_text || '';
  assert(/Study Pool:.*primary stud(?:y|ies)\s*\(\d+\s*RCT/i.test(s15Text), `Slide 15 must include Study Pool with primary & RCT counts. Got:\n${s15Text}`);
  assert(/Evidence Limit/i.test(s15Text), `Slide 15 must include mandatory Evidence Limit bullet even under Short bullet points. Got:\n${s15Text}`);
  assert(!/Mushtaq 2022.*embryologists/i.test(s15Text), 'Slide 15 must NOT fabricate Mushtaq embryologist comparison');

  const val15 = validatePresentationOutput({
    deck: deck15,
    papers: req15.papers,
    requestedSlideCount: req15.slideCount,
    topic: req15.topic
  });
  assert.strictEqual(val15.failedCount, 0, `15-paper deck must have 0 ERROR failures, got: ${val15.errors.join(' | ')}`);
  console.log('   ✓ 15-paper deck Slide 4 & Slide 15 verified with 0 ERROR failures.');

  // 3. conclusion_grounding: false Mushtaq bullet FAILS; grounded Salih bullet PASSES
  const salihPaper = req15.papers.find(p => JSON.stringify(p.authors || []).includes('Salih'));
  const mushtaqPaper = req15.papers.find(p => JSON.stringify(p.authors || []).includes('Mushtaq'));

  const badConcVal = validatePresentationOutput({
    deck: {
      meta: { projectName: 'Preppt – Scientific Literature to Presentation', topic: 'AI in ART' },
      slides: [
        {
          slide_number: 4, stage: 4, title: 'What the Studies Found: Primary Outcomes', main_message: 'Findings.',
          on_slide_text: '• Morphology grade prediction accuracy: 75.5% AI vs 65.4% embryologists (Salih 2023).',
          bulletsData: [{ text: '• Morphology grade prediction accuracy: 75.5% AI vs 65.4% embryologists (Salih 2023).', isFinding: true, derivedFrom: [{ ref: 1 }] }],
          speaker_notes: 'Notes.', sources: [1]
        },
        {
          slide_number: 8, stage: 8, title: 'Conclusion & Practice Take-Homes', main_message: 'Conclusion.',
          on_slide_text: '• Finding (Mushtaq 2022, diagnostic accuracy study): AI accuracy higher than embryologists in included studies.',
          bulletsData: [{ text: '• Finding (Mushtaq 2022, diagnostic accuracy study): AI accuracy higher than embryologists in included studies.', isFinding: false, derivedFrom: [{ ref: 2 }] }],
          speaker_notes: 'Notes.', sources: [2]
        }
      ],
      researchGaps: []
    },
    papers: [salihPaper, mushtaqPaper],
    requestedSlideCount: 2
  });
  assert.strictEqual(
    badConcVal.checks.find(c => c.id === 'conclusion_grounding').status,
    'fail',
    'False Mushtaq embryologist conclusion bullet must FAIL conclusion_grounding'
  );

  const goodConcVal = validatePresentationOutput({
    deck: {
      meta: { projectName: 'Preppt – Scientific Literature to Presentation', topic: 'AI in ART' },
      slides: [
        {
          slide_number: 4, stage: 4, title: 'What the Studies Found: Primary Outcomes', main_message: 'Findings.',
          on_slide_text: '• Morphology grade prediction accuracy: 75.5% AI vs 65.4% embryologists (Salih 2023).',
          bulletsData: [{ text: '• Morphology grade prediction accuracy: 75.5% AI vs 65.4% embryologists (Salih 2023).', isFinding: true, derivedFrom: [{ ref: 1 }] }],
          speaker_notes: 'Notes.', sources: [1]
        },
        {
          slide_number: 8, stage: 8, title: 'Conclusion & Practice Take-Homes', main_message: 'Conclusion.',
          on_slide_text: '• Salih 2023 (systematic review): AI accuracy higher than embryologists for morphology grade and clinical pregnancy prediction.',
          bulletsData: [{ text: '• Salih 2023 (systematic review): AI accuracy higher than embryologists for morphology grade and clinical pregnancy prediction.', isFinding: false, derivedFrom: [{ ref: 1 }] }],
          speaker_notes: 'Notes.', sources: [1]
        }
      ],
      researchGaps: []
    },
    papers: [salihPaper, mushtaqPaper],
    requestedSlideCount: 2
  });
  assert.strictEqual(
    goodConcVal.checks.find(c => c.id === 'conclusion_grounding').status,
    'pass',
    `Grounded Salih conclusion bullet must PASS conclusion_grounding, got: ${goodConcVal.checks.find(c => c.id === 'conclusion_grounding').details}`
  );
  console.log('   ✓ conclusion_grounding FAILS on false Mushtaq bullet and PASSES on grounded Salih bullet.');
  console.log('\nPassed: All Prompt 3g tests verified.\n');
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
