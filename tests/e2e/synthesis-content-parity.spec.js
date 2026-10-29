/**
 * Preppt E2E Test: Synthesis Content Parity (BUG-1 Remediated)
 * Asserts that synthesis on non-AI clinical topics (such as SGLT2 inhibitors in HFpEF)
 * generates domain-appropriate clinical content with ZERO hardcoded AI template phrases.
 */

const assert = require('assert');
const { generatePresentationDeck } = require('../../lib/synthesize.js');

const samplePapers = [
  {
    title: 'Dapagliflozin in Heart Failure with Preserved Ejection Fraction',
    authors: 'Solomon SD, McMurray JJV, Claggett B, et al.',
    journal: 'New England Journal of Medicine',
    year: 2022,
    abstract: 'In patients with heart failure and preserved ejection fraction, dapagliflozin reduced the composite risk of cardiovascular death or worsening heart failure by 18% (HR 0.82; 95% CI 0.73-0.92; P<0.001). Benefits were consistent across predefined subgroups regardless of diabetes status.',
    citationCount: 1420
  },
  {
    title: 'Empagliflozin in Heart Failure with a Preserved Ejection Fraction',
    authors: 'Anker SD, Butler J, Filippatos G, et al.',
    journal: 'New England Journal of Medicine',
    year: 2021,
    abstract: 'Empagliflozin significantly reduced the combined risk of cardiovascular death or hospitalization for heart failure in patients with heart failure and a preserved ejection fraction (HR 0.79; 95% CI 0.69-0.90; P<0.001).',
    citationCount: 2150
  },
  {
    title: 'Mechanisms of SGLT2 Inhibitor Cardioprotection in HFpEF',
    authors: 'Packer M, Butler J, Zannad F',
    journal: 'Circulation',
    year: 2021,
    abstract: 'Sodium-glucose cotransporter 2 inhibitors exert direct cardioprotective effects through attenuation of myocardial inflammation, reduction of left ventricular filling pressures, and improvement of systemic microvascular endothelial function.',
    citationCount: 480
  }
];

const forbiddenAiPhrases = [
  'Core AI Applications',
  'Predictive Modeling',
  'Algorithmic Bias',
  'Foundation Models',
  'Multimodal Data',
  'Deep neural networks',
  'machine learning',
  'HL7/FHIR',
  'AI ethics'
];

console.log('Running Preppt Synthesis Content Parity Test (BUG-1)...');

const nonAiTopic = 'SGLT2 inhibitors in Heart Failure with preserved ejection fraction';
const deck = generatePresentationDeck({
  topic: nonAiTopic,
  shortTitle: 'SGLT2i in HFpEF',
  papers: samplePapers,
  slideCount: 8,
  audience: 'Postgraduate',
  density: 'Balanced',
  visualStyle: 'Scientific pictorial'
});

// 1. Verify slide count >= 8
assert(Array.isArray(deck.slides), 'Deck must contain slides array');
assert(deck.slides.length >= 8, `Expected at least 8 slides, got ${deck.slides.length}`);
console.log(`✓ Slide count verified: ${deck.slides.length} slides generated (minimum 8 enforced).`);

// 2. Scan every slide for forbidden generic AI strings
deck.slides.forEach((slide, idx) => {
  const combinedSlideContent = [
    slide.title,
    slide.objective,
    slide.mainMessage,
    slide.onSlideText,
    slide.speakerNotes,
    slide.suggestedVisualType,
    slide.detailedVisualDescription
  ].join(' ');

  for (const phrase of forbiddenAiPhrases) {
    const regex = new RegExp(`\\b${phrase}\\b`, 'i');
    assert(
      !regex.test(combinedSlideContent),
      `Slide ${idx + 1} ("${slide.title}") contains forbidden AI template phrase: "${phrase}". Full content snippet: ${combinedSlideContent.substring(0, 150)}...`
    );
  }
});
console.log('✓ Zero forbidden generic AI phrases found across all slides for non-AI topic.');

// 3. Verify clinical narrative arc stages
const slideTitles = deck.slides.map(s => s.title);
console.log('Slide titles generated:');
slideTitles.forEach((t, i) => console.log(`  Slide ${i + 1}: ${t}`));

assert(slideTitles[0].includes('SGLT2i in HFpEF'), 'Slide 1 should reflect title');
assert(slideTitles[1].includes('The Hook'), 'Slide 2 should be The Hook');
assert(slideTitles[2].includes('Definition & Scope'), 'Slide 3 should be Definition & Scope');
assert(slideTitles[3].includes('Mechanistic Targets') || slideTitles[3].includes('Biological Action'), 'Slide 4 should be clinical mechanistic targets on non-AI topic');
assert(slideTitles[4].includes('Clinical Impacts'), 'Slide 5 should be Clinical Impacts & Use Cases');
assert(slideTitles[5].includes('Safety') || slideTitles[5].includes('Tolerability'), 'Slide 6 should be Clinical Safety & Limitations on non-AI topic');
assert(slideTitles[6].includes('Future Outlook'), 'Slide 7 should be Future Outlook');
assert(slideTitles[7].includes('Conclusion & Call to Action'), 'Slide 8 should be Conclusion & Call to Action');
console.log('✓ Strict 8-stage clinical narrative arc validated.');

console.log('\n✅ ALL SYNTHESIS CONTENT PARITY TESTS PASSED SUCCESSFULLY.');
