/**
 * Acceptance & Unit Tests: Source-Derived Labels, Paired Comparisons, Study Types,
 * Plain-Language Conclusions & Unverified-Source Flag (Prompt 3f)
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { generatePresentationDeck } = require('../../lib/synthesize.js');
const { validatePresentationOutput } = require('../../lib/validator.js');
const { compressFindingPreservingNumbers } = require('../../lib/text-rules.js');

function runTests() {
  console.log('--- TEST: Labels, Pairing, Study Types & Unverified Source (Prompt 3f) ---');

  const req15 = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../fixtures/ai-art-15papers.request.json'), 'utf8'));

  // (a) Metric & group labels from source (never "Outcome" or "control" when source says accuracy & embryologists)
  console.log('1. Testing source-derived metric and group labels (Salih 77.8% vs 64%)...');
  const salihSent77 = 'Similarly, AI models had a median accuracy of 77.8% (range 68-90%) in predicting clinical pregnancy through the use of patient clinical treatment information compared to 64% (range 58-76%) when performed by embryologists.';
  const resA = compressFindingPreservingNumbers('', salihSent77, 18);
  assert(
    /Clinical pregnancy prediction accuracy: 77\.8% AI(?:\s*\([^)]+\))? vs 64% embryologists/i.test(resA.text),
    `Expected "Clinical pregnancy prediction accuracy: 77.8% AI vs 64% embryologists", got: "${resA.text}"`
  );
  assert(!/\bOutcome:/i.test(resA.text) && !/\bcontrol\b/i.test(resA.text), 'Must not use fallback "Outcome" or "control"');
  console.log(`   ✓ Rendered: "${resA.text}"`);

  // (b) Paired adjacent sentences in Salih merged into one bullet
  console.log('2. Testing paired adjacent comparison sentences (Salih 75.5% vs 65.4%)...');
  const deck15 = generatePresentationDeck(req15);
  const allOnSlide15 = deck15.slides.map(s => s.on_slide_text || '').join('\n');
  assert(
    /Morphology grade prediction accuracy: 75\.5% AI \(range 59[–-]94%\) vs 65\.4% embryologists \(range 47[–-]75%\)/i.test(allOnSlide15),
    `Expected paired Salih 75.5% vs 65.4% bullet in 15-paper deck! Found:\n${allOnSlide15}`
  );
  console.log('   ✓ Paired 75.5% AI vs 65.4% embryologists bullet verified.');

  // (c) Study type classification on 15-paper deck (narrative reviews must not be labelled observational/other)
  console.log('3. Testing study type classification on 15-paper deck...');
  const concSlide = deck15.slides.find(s => s.stage === 8 || /conclusion/i.test(s.title || ''));
  assert(concSlide, 'Conclusion slide must exist');
  assert(!/13 observational\/other studies/i.test(concSlide.on_slide_text), 'Must not misclassify reviews as 13 observational/other studies');
  assert(!/limited to 13 primary studies/i.test(concSlide.on_slide_text), 'Must not claim 13 primary studies');
  console.log('   ✓ Study-type counts no longer misclassify reviews as observational/primary studies.');

  // (d) Conclusion wording uses plain-language comparison instead of "(favours intervention)"
  console.log('4. Testing plain-language conclusion wording...');
  assert(!/\(favours intervention\)/i.test(concSlide.on_slide_text), 'Conclusion must not contain "(favours intervention)"');
  assert(
    /AI accuracy higher than embryologists/i.test(concSlide.on_slide_text),
    `Expected plain-language diagnostic conclusion, got:\n${concSlide.on_slide_text}`
  );
  console.log('   ✓ Plain-language conclusion wording verified.');

  // (e) Source-verification flag: Tier C excluded, Tier B tagged [not PubMed-indexed] & never bullet #1
  console.log('5. Testing low_assurance_source_used check & [not PubMed-indexed] slide tag...');
  const tierCPaper = {
    id: 'u1',
    title: 'AI embryo model thesis',
    authors: ['Doe J'],
    journal: 'Hispana',
    year: 2023,
    doi: '',
    pmid: '',
    abstract: 'RESULTS: AI prediction achieved AUC 0.81 (95% CI 0.74–0.88) across 200 embryos.'
  };
  const tierBPaper = {
    id: 'b1',
    title: 'AI embryo selection cohort',
    authors: ['Agboola O'],
    journal: 'Path of Science',
    year: 2025,
    doi: '10.22178/pos.122-2',
    pmid: '',
    indexedIn: 'none',
    abstract: 'RESULTS: Clinical pregnancy was 45.7% AI-assisted vs 38.1% conventional (p=0.004).'
  };
  const verifiedPaper = {
    id: 'v1',
    title: 'Peer-reviewed RCT of AI in IVF',
    authors: ['Smith A'],
    journal: 'Human Reproduction',
    year: 2024,
    doi: '10.1093/humrep/test001',
    pmid: '39000001',
    abstract: 'RESULTS: Implantation was 50.0% AI vs 45.0% morphology (p=0.04).'
  };
  const unvDeck = generatePresentationDeck({
    topic: 'AI in IVF',
    papers: [tierCPaper, tierBPaper, verifiedPaper],
    slideCount: 8,
    density: 'Short bullet points'
  });
  const slide4 = unvDeck.slides.find(s => s.stage === 4);
  assert(slide4, 'Findings slide must exist');
  const firstBullet = (slide4.on_slide_text || '').split('\n')[0] || '';
  assert(!firstBullet.includes('[not PubMed-indexed]'), 'Tier B source must NEVER be the first bullet of a findings slide');
  assert(!slide4.on_slide_text.includes('0.81'), 'Tier C Hispana paper must be excluded from synthesis');
  assert((unvDeck.slides.map(s => s.on_slide_text).join('\n')).includes('[not PubMed-indexed]'), 'Tier B bullet must carry [not PubMed-indexed] tag');

  const unvVal = validatePresentationOutput({
    deck: unvDeck,
    papers: [tierCPaper, tierBPaper, verifiedPaper],
    requestedSlideCount: 8,
    topic: 'AI in IVF'
  });
  const unvCheck = unvVal.checks.find(c => c.id === 'low_assurance_source_used');
  assert(unvCheck && unvCheck.status === 'warning', `Expected low_assurance_source_used WARNING, got ${unvCheck ? unvCheck.status : 'missing'}`);
  console.log('   ✓ Tier C excluded, Tier B tagged [not PubMed-indexed], non-first placement, and low_assurance_source_used WARNING verified.');

  console.log('\nPassed: All Prompt 3f tests verified.\n');
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
