/**
 * Acceptance & Unit Tests: Venue Assurance Tiers with Mocked Europe PMC (Addition)
 *
 * Verifies:
 * 1. Agboola 2025 (doi: 10.22178/pos.122-2, no PMID, not in Europe PMC) -> Tier B
 * 2. Salih 2023 (doi: 10.1093/hropen/hoad031, PMID 37588797, Europe PMC MED) -> Tier A
 * 3. Hispana thesis (journal: Hispana, no DOI, no PMID) -> Tier C (excluded)
 * 4. Network failure on Europe PMC lookup -> 'unknown' tier (treated like B for display, does not block)
 * 5. Conclusion slide states "from a study not indexed in PubMed" when quantitative finding is Tier B only
 */

const assert = require('assert');
const { enrichPapersWithAssurance } = require('../../lib/venue-assurance.js');
const { generatePresentationDeck } = require('../../lib/synthesize.js');
const { validatePresentationOutput } = require('../../lib/validator.js');

async function runTests() {
  console.log('--- TEST: Venue Assurance Tiers & Mocked Europe PMC Lookup ---');

  const agboola = {
    id: 'agboola-2025',
    title: 'Artificial Intelligence in Embryo Selection',
    authors: ['Olasoji O. Agboola'],
    journal: 'Path of Science',
    year: 2025,
    doi: '10.22178/pos.122-2',
    pmid: '',
    abstract: 'This multi-centre prospective cohort study enrolled 1,172 patients. Clinical pregnancy rates were significantly higher in the AI-assisted group (45.7%, 268/587) compared to the conventional group (38.1%, 223/585), with an adjusted odds ratio of 1.40 (95% confidence interval, 1.11-1.77; p = 0.004).'
  };

  const salih = {
    id: 'salih-2023',
    title: 'Embryo selection through artificial intelligence versus embryologists: a systematic review',
    authors: ['Mohamed Salih'],
    journal: 'Human Reproduction Open',
    year: 2023,
    doi: '10.1093/hropen/hoad031',
    pmid: '37588797',
    abstract: 'MAIN RESULTS: AI models had a median accuracy of 77.8% (range 68-90%) in predicting clinical pregnancy compared to 64% (range 58-76%) when performed by embryologists.'
  };

  const hispana = {
    id: 'hispana-2023',
    title: 'Development of an artificial intelligence model based on Machine Learning',
    authors: ['Aitana Eugenia Salvo Jiménez'],
    journal: 'Hispana',
    year: 2023,
    doi: '',
    pmid: '',
    abstract: 'RESULTS: Model achieved 88% accuracy on test images.'
  };

  // Mock Europe PMC HTTP client
  const mockHttpGet = async (cleanDoi) => {
    if (cleanDoi === '10.22178/pos.122-2') {
      return { ok: true, indexedIn: 'none', journalIssn: '2413-9009', inNlmCatalogue: false, pmid: '' };
    }
    if (cleanDoi === '10.1093/hropen/hoad031') {
      return { ok: true, indexedIn: 'MED', journalIssn: '2399-3529', inNlmCatalogue: true, pmid: '37588797' };
    }
    throw new Error('Simulated network timeout');
  };

  // 1. Test Tier A, B, C assignment
  console.log('1. Testing Tier A, B, and C assignment with mocked Europe PMC...');
  const enriched = await enrichPapersWithAssurance([agboola, salih, hispana], { httpGetImpl: mockHttpGet });
  assert.strictEqual(enriched[0].assuranceTier, 'B', 'Agboola must be Tier B');
  assert.strictEqual(enriched[0].assuranceBadge, 'Not indexed in PubMed');
  assert.strictEqual(enriched[1].assuranceTier, 'A', 'Salih 2023 must be Tier A');
  assert.strictEqual(enriched[2].assuranceTier, 'C', 'Hispana thesis must be Tier C');
  console.log('   ✓ Tiers verified: Agboola -> B, Salih -> A, Hispana -> C.');

  // 2. Test network failure -> 'unknown' tier (does not block)
  console.log('2. Testing Europe PMC network failure -> unknown tier...');
  const failingPaper = {
    id: 'net-fail',
    title: 'Prospective cohort of AI in IVF',
    authors: ['Test Author'],
    journal: 'Some Journal',
    year: 2024,
    doi: '10.9999/network-fail',
    pmid: '',
    abstract: 'RESULTS: Clinical pregnancy was 44.0% AI vs 40.0% morphology (p=0.05).'
  };
  const enrichedFail = await enrichPapersWithAssurance([failingPaper], { httpGetImpl: mockHttpGet });
  assert.strictEqual(enrichedFail[0].assuranceTier, 'unknown', 'Network failure must assign unknown tier');
  console.log('   ✓ Network failure safely assigned assuranceTier: "unknown".');

  // 3. Test synthesis: Tier C excluded, Tier A ranked before Tier B, Tier B tagged [not PubMed-indexed]
  console.log('3. Testing synthesis ordering, Tier C exclusion, and Conclusion disclaimer...');
  const deck = generatePresentationDeck({
    topic: 'AI in Embryo Selection',
    papers: enriched,
    slideCount: 8,
    density: 'Short bullet points'
  });
  const allSlideText = deck.slides.map(s => s.on_slide_text || '').join('\n');
  assert(!allSlideText.includes('88%'), 'Tier C Hispana paper must be excluded');
  const slide4 = deck.slides.find(s => s.stage === 4);
  const s4Lines = (slide4.on_slide_text || '').split('\n').filter(Boolean);
  assert(s4Lines[0].includes('Salih 2023') && !s4Lines[0].includes('[not PubMed-indexed]'), 'Tier A Salih must be first on Slide 4');
  assert(allSlideText.includes('[not PubMed-indexed]'), 'Tier B Agboola bullet must end with [not PubMed-indexed]');

  // 4. Test Tier B-only quantitative deck: exact notice first, then Tier B findings marked [not PubMed-indexed], plus Conclusion
  const tierBOnlyDeck = generatePresentationDeck({
    topic: 'AI in Embryo Selection',
    papers: [enriched[0]],
    slideCount: 8,
    density: 'Short bullet points'
  });
  const bSlide4Lines = (tierBOnlyDeck.slides.find(s => s.stage === 4).on_slide_text || '').split('\n').filter(Boolean);
  assert.strictEqual(
    bSlide4Lines[0].replace(/^•\s*/, '').trim(),
    'No finding from a PubMed-indexed study in the selected papers.',
    `Expected exact Tier-B-only headline notice, got: ${bSlide4Lines[0]}`
  );
  assert(
    bSlide4Lines[1] && bSlide4Lines[1].includes('[not PubMed-indexed]'),
    `Expected Tier B finding marked [not PubMed-indexed] after notice, got: ${bSlide4Lines[1]}`
  );
  const bConc = tierBOnlyDeck.slides.find(s => s.stage === 8);
  assert(bConc.on_slide_text.includes('from a study not indexed in PubMed'), 'Conclusion must note when quantitative finding is from a study not indexed in PubMed');

  // 5. Verify enrichPapersWithAssurance enforces max 5 concurrent lookups
  let activeLookups = 0;
  let maxActiveLookups = 0;
  const manyPapers = Array.from({ length: 12 }, (_, i) => ({
    id: `m${i}`,
    title: `Study ${i}`,
    journal: 'Test Journal',
    doi: `10.1000/test.${i}`,
    pmid: ''
  }));
  await enrichPapersWithAssurance(manyPapers, {
    concurrency: 5,
    httpGetImpl: async () => {
      activeLookups++;
      if (activeLookups > maxActiveLookups) maxActiveLookups = activeLookups;
      await new Promise(r => setTimeout(r, 15));
      activeLookups--;
      return { ok: true, indexedIn: 'none', journalIssn: '', inNlmCatalogue: false, pmid: '' };
    }
  });
  assert(maxActiveLookups <= 5 && maxActiveLookups > 1, `Expected max 5 concurrent lookups, saw ${maxActiveLookups}`);

  const val = validatePresentationOutput({
    deck: tierBOnlyDeck,
    papers: [enriched[0]],
    requestedSlideCount: 8,
    topic: 'AI in Embryo Selection'
  });
  const check = val.checks.find(c => c.id === 'low_assurance_source_used');
  assert.strictEqual(check.status, 'warning', 'low_assurance_source_used must emit WARNING when Tier B is used');
  console.log('   ✓ Synthesis ordering, Tier-B-only notice, Tier C exclusion, max-5 concurrency, Conclusion wording, and low_assurance_source_used WARNING verified.');

  console.log('\nPassed: All Venue Assurance Tier tests verified.\n');
}

if (require.main === module) {
  runTests().catch(err => {
    console.error(`✗ Test failed: ${err.message}`);
    process.exit(1);
  });
}

module.exports = { runTests };
