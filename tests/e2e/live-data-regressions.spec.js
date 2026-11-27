/**
 * Regressions found when re-running the audit scenarios against the real APIs (Step 11).
 */
const assert = require('assert');
const { normalizeAbstractText, parseAbstractSentences } = require('../../lib/evidence-extractor.js');
const { isEnglishText, parseStructuredResultSentence } = require('../../lib/text-rules.js');
const { generatePresentationDeck } = require('../../lib/synthesize.js');
const { sanitizeAbstract } = require('../../public/evidence-rules.js');

// 1. Semantic Scholar / OpenAlex abstracts with glued section headers
const glued = 'BackgroundSGLT2 inhibitors reduce hospitalization in HFrEF, but effects in HFpEF are uncertain.MethodsIn this double-blind trial, we randomly assigned 5988 patients.ResultsA primary outcome event occurred in 415 of 2997 patients (13.8%) in the empagliflozin group and in 511 of 2991 patients (17.1%) in the placebo group (hazard ratio, 0.79; 95% confidence interval [CI], 0.69 to 0.90; P<0.001).ConclusionsEmpagliflozin reduced the combined risk of cardiovascular death or hospitalization for heart failure.';
const roles = parseAbstractSentences(glued).map(p => p.role);
assert.deepStrictEqual(roles, ['background', 'methods', 'results', 'conclusion'], roles.join(','));
assert.ok(/^BACKGROUND: SGLT2/.test(normalizeAbstractText(glued)) && /\. METHODS: In this/.test(sanitizeAbstract(glued)));
console.log('   ✓ Glued "Background…Methods…Results" headers are split server- and client-side.');

// 2. Counts in front of percentages and CIs from a neighbouring sentence
const p = parseStructuredResultSentence('Adverse events were similar between dapagliflozin and placebo (44 (27.2%) versus 38 (23.5%) patients, respectively).; Dapagliflozin improved KCCQ-CS (effect size, 5.8 points (95% confidence interval (CI) 2.3-9.2, P = 0.001)');
assert.deepStrictEqual(p.comparisons.map(c => c.value), ['27.2%', '23.5%']);
assert.strictEqual(p.effect, null, 'a CI from the next sentence must not be attached');
console.log('   ✓ "44 (27.2%)" parsed as 27.2%; no CI borrowed from a neighbouring sentence.');

// 3. Author names are not language evidence
assert.ok(isEnglishText('Study Appraisal: Pujade-Lauraine E et al. (2023)').ok);
assert.ok(!isEnglishText('El sistema de salud fue evaluado con los pacientes para la mejora del bienestar').ok);
console.log('   ✓ English check ignores author names but still rejects Spanish text.');

// 4. Cross-study conflicting outcomes no longer crash the synthesis plan
const deck = generatePresentationDeck({
  topic: 'Drug X for condition Y',
  shortTitle: 'Drug X',
  slideCount: 8,
  papers: [
    { id: 'a', title: 'Drug X versus placebo in condition Y: a randomized trial', authors: 'Alpha A', year: 2022, journal: 'J A', abstract: 'METHODS: We randomly assigned 400 patients. RESULTS: Mortality was significantly reduced with drug X (hazard ratio, 0.70; 95% CI, 0.55 to 0.89; P=0.003).' },
    { id: 'b', title: 'Drug X in condition Y: a randomised controlled trial', authors: 'Beta B', year: 2023, journal: 'J B', abstract: 'METHODS: We randomly assigned 380 patients. RESULTS: Mortality did not differ between groups (hazard ratio, 0.98; 95% CI, 0.80 to 1.20; P=0.84).' }
  ]
});
assert.ok(deck.slides.length === 8);
assert.strictEqual(deck.meta.evidenceVerdict.verdict, 'mixed');
assert.ok(deck.slides.some(s => /Conflicting Evidence|Trials Without a Significant Benefit/.test(s.title)), 'the neutral trial is shown on its own slide');
assert.ok(/mixed/.test(deck.slides[deck.slides.length - 1].main_message));
console.log('   ✓ Conflicting high-quality trials → "mixed" verdict and conflict slide, no crash.');
console.log('\nPassed: Live-data regression tests verified.');
