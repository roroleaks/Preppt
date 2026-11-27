/**
 * Evidence verdict & conclusion regression (audit D-01 / D-10) on REAL PubMed abstracts from the audit.
 * Before the fix both decks concluded "no statistically significant difference … routine adoption cannot be
 * recommended", contradicting DELIVER / EMPEROR-Preserved and WHO-endorsed tranexamic acid evidence.
 */
const assert = require('assert');
const { generatePresentationDeck } = require('../../lib/synthesize.js');
const { proposeKeywords, buildSearchStrategy } = require('../../lib/keywords.js');
const { classifySentenceDirection, deriveEvidenceVerdict } = require('../../lib/evidence-verdict.js');
const { validatePresentationOutput } = require('../../lib/validator.js');

// 1. Sentence-level direction
const cases = [
  ['Dapagliflozin reduced the combined risk of worsening heart failure or cardiovascular death among patients with heart failure and a mildly reduced or preserved ejection fraction.', 'benefit'],
  ['the primary outcome occurred in 512 of 3131 patients (16.4%) in the dapagliflozin group and in 610 of 3132 patients (19.5%) in the placebo group (hazard ratio, 0.82; 95% confidence interval [CI], 0.73 to 0.92; P<0.001).', 'benefit'],
  ['No significant differences were reported between SGLT2i and placebo for VA [relative risk (RR): 1.02, 95% CI: 0.83-1.25].', 'no benefit'],
  ['TXA did not reduce death or hysterectomy (RR 0.97, 95% CI 0.87-1.09) but reduced death due to bleeding (RR 0.81, 95% CI 0.65-1.00).', 'mixed'],
  ['While trends toward reduced pigmentation were observed in the TXA-prevention group, none reached statistical significance.', 'no benefit'],
  ['In conclusion, TA is considered useful and is recommended or advised for treating PPH.', 'benefit']
];
cases.forEach(([s, want]) => assert.strictEqual(classifySentenceDirection(s), want, `${want} expected for: ${s.slice(0, 70)}`));
console.log(`   ✓ ${cases.length} sentence directions (effect estimates, negations, "but" clauses, recommendations).`);

function build(fixture) {
  const fx = require(`../fixtures/${fixture}.json`);
  const k = proposeKeywords(fx.topic);
  const st = buildSearchStrategy({ topic: fx.topic, ...k, startYear: 2017 });
  const deck = generatePresentationDeck({ topic: fx.topic, shortTitle: fixture, papers: fx.papers, slideCount: 10, approvedKeywords: k, approvedStrategy: st });
  return { fx, deck };
}

// 2. SGLT2i in HFpEF: two positive landmark RCTs + an arrhythmia NMA with a null HFpEF subgroup + an HFrEF paper
{
  const { fx, deck } = build('audit-sglt2-hfpef');
  const concl = deck.slides[deck.slides.length - 1];
  assert.ok(/favours SGLT2 inhibitors/i.test(concl.main_message), `conclusion must favour SGLT2i: ${concl.main_message}`);
  assert.ok(!/no statistically significant difference|cannot be recommended|non-inferiority/i.test(concl.main_message + concl.on_slide_text));
  assert.ok(!deck.slides.some(s => /Null Trial|Trials Without a Significant Benefit/i.test(s.title)), 'no "null trials" slide: no trial/MA was neutral on the main efficacy outcome');
  const outcomeSlide = deck.slides.find(s => /Outcomes Without a Significant Difference/.test(s.title));
  assert.ok(outcomeSlide && /arrhythmias/i.test(outcomeSlide.main_message), 'the arrhythmia NMA is reported as a neutral result on a DIFFERENT outcome');
  assert.ok(/favours SGLT2 inhibitors on primary outcome/i.test(concl.main_message) && /no significant difference on arrhythmias/i.test(concl.main_message), `outcome-specific conclusion: ${concl.main_message}`);
  const slide4 = deck.slides.find(s => /What the Studies Found/.test(s.title));
  assert.ok(/16\.4% dapagliflozin vs 19\.5% placebo; HR 0\.82 \(95% CI 0\.73–0\.92\)/.test(slide4.on_slide_text), 'DELIVER primary result rendered in structured form');
  assert.ok(!/\(Solomon 2022\)|We included|A total of/.test(slide4.on_slide_text), 'no trailing citations or sample descriptions on the findings slide');
  const zannadRef = fx.papers.findIndex(p => /reduced ejection fraction: a meta-analysis/.test(p.title)) + 1;
  assert.ok(!new RegExp(`\\b${zannadRef}\\b`).test(concl.main_message.match(/\[([^\]]+)\]/)[1]), 'HFrEF paper must not support the HFpEF conclusion');
  console.log('   ✓ SGLT2i/HFpEF: conclusion favours SGLT2i (DELIVER, EMPEROR-Preserved); HFrEF paper excluded; no false null slide.');
}

// 3. Tranexamic acid in PPH with off-topic dermatology and dental papers
{
  const { fx, deck } = build('audit-txa-pph');
  const concl = deck.slides[deck.slides.length - 1];
  assert.ok(/favours tranexamic acid/i.test(concl.main_message), `conclusion must favour TXA: ${concl.main_message}`);
  assert.ok(!/cannot be recommended|no statistically significant difference/i.test(concl.main_message));
  const offTopic = deck.meta.evidenceVerdict.excludedOffTopic;
  ['hyperpigmentation', 'dental'].forEach(word => {
    const ref = fx.papers.findIndex(p => p.title.toLowerCase().includes(word)) + 1;
    assert.ok(offTopic.includes(ref), `${word} paper must be excluded from the verdict`);
  });
  const v = validatePresentationOutput({ deck, papers: fx.papers, requestedSlideCount: 10, topic: fx.topic });
  assert.strictEqual(v.checks.find(c => c.id === 'direction_fidelity').status, 'pass');
  console.log('   ✓ TXA/PPH: conclusion favours TXA; dermatology & dental papers excluded; direction_fidelity passes.');
}

// 4. The validator must now FAIL the inverted conclusion the audit found
{
  const { fx, deck } = build('audit-sglt2-hfpef');
  const concl = deck.slides[deck.slides.length - 1];
  concl.main_message = 'Randomized trial evidence demonstrates no statistically significant difference for SGLT2i in HFpEF; routine adoption cannot be recommended without positive randomized trials.';
  const v = validatePresentationOutput({ deck, papers: fx.papers, requestedSlideCount: 10, topic: fx.topic });
  const df = v.checks.find(c => c.id === 'direction_fidelity');
  assert.strictEqual(df.status, 'fail', 'inverted conclusion must fail direction_fidelity');
  assert.ok(/states no benefit although/.test(df.details));
  console.log('   ✓ Validator blocks the audit\'s inverted "no significant difference" conclusion.');
}

// 5. Aggregation rules
{
  const rec = (ref, design, text) => ({ refNumber: ref, designFromSource: design, classifiedSentences: [{ text, role: 'conclusion', label: 'CONCLUSIONS' }] });
  const v1 = deriveEvidenceVerdict([rec(1, 'Randomised controlled trial', 'X significantly reduced mortality.'), rec(2, 'Randomised controlled trial', 'X did not reduce mortality.')], { intervention: 'X' });
  assert.strictEqual(v1.verdict, 'mixed');
  const v2 = deriveEvidenceVerdict([rec(1, 'Cohort study', 'X was associated with significantly reduced mortality.')], { intervention: 'X' });
  assert.strictEqual(v2.verdict, 'insufficient');
  assert.ok(/provisional/.test(v2.headline));
  console.log('   ✓ Mixed high-quality evidence → "mixed"; observational-only evidence → "provisional".');
}
console.log('\nPassed: Evidence verdict & conclusion tests verified.');
