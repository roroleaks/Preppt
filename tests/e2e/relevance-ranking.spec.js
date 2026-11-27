/**
 * Relevance ranking regression (audit D-05 / D-07): real candidate titles from the Nov 2026 audit.
 */
const assert = require('assert');
const { scorePaperRelevance, classifyStudyDesign } = require('../../public/evidence-rules.js');
const { proposeKeywords, buildSearchStrategy } = require('../../lib/keywords.js');

function rank(topic, papers) {
  const k = proposeKeywords(topic);
  const s = buildSearchStrategy({ topic, ...k, startYear: 2019 });
  return papers.map(p => {
    p.studyType = classifyStudyDesign(p);
    return { ...p, ...scorePaperRelevance(p, s.conceptGroups, topic) };
  }).sort((a, b) => b.score - a.score);
}

const hf = rank('SGLT2 inhibitors in Heart Failure with preserved ejection fraction', [
  { title: 'Empagliflozin in Heart Failure with a Preserved Ejection Fraction.', abstract: 'In this double-blind trial, we randomly assigned 5988 patients with class II-IV heart failure and an ejection fraction of more than 40% to receive empagliflozin or placebo. Empagliflozin reduced the combined risk of cardiovascular death or hospitalization for heart failure in patients with heart failure and a preserved ejection fraction.', citationCount: 3963 },
  { title: 'SGLT2 inhibitors in patients with heart failure with reduced ejection fraction: a meta-analysis of the EMPEROR-Reduced and DAPA-HF trials.', abstract: 'SGLT2 inhibition reduced the combined risk of cardiovascular death or hospitalisation for heart failure in patients with HFrEF.', citationCount: 1163, pubType: ['Meta-Analysis'] },
  { title: 'Intravenous iron and SGLT2 inhibitors in iron-deficient patients with heart failure and reduced ejection fraction', abstract: 'Patients with HFrEF and iron deficiency.', citationCount: 21 },
  { title: 'Epidemiology of heart failure.', abstract: 'Heart failure is a global pandemic affecting 64 million people.', citationCount: 1466 },
  { title: 'Angiotensin-Neprilysin Inhibition in Heart Failure with Preserved Ejection Fraction.', abstract: 'We randomly assigned 4822 patients with HFpEF to sacubitril-valsartan or valsartan.', citationCount: 1948 }
]);
assert.ok(/Empagliflozin in Heart Failure with a Preserved/.test(hf[0].title), 'landmark HFpEF RCT must rank first');
assert.ok(hf[0].score >= 85, `landmark RCT score ${hf[0].score}`);
const hfref = hf.find(p => /EMPEROR-Reduced/.test(p.title));
assert.ok(hfref.populationMismatch && hfref.score < 50, 'HFrEF meta-analysis must be flagged as a different population');
const epi = hf.find(p => /^Epidemiology/.test(p.title));
assert.ok(epi.missingConcepts.length === 2 && epi.score <= 25, 'paper without the drug or HFpEF concept must score low');
const arni = hf.find(p => /Neprilysin/.test(p.title));
assert.deepStrictEqual(arni.missingConcepts, ['SGLT2 inhibitors']);
console.log('   ✓ HFpEF: landmark RCT first (score ' + hf[0].score + '); HFrEF and off-drug papers flagged and below 50.');

const pph = rank('Tranexamic acid for prevention and treatment of postpartum haemorrhage', [
  { title: 'The efficacy of tranexamic acid in prevention and treatment of post-inflammatory hyperpigmentation: a pilot study.', abstract: 'Oral TXA in post-inflammatory hyperpigmentation.' },
  { title: 'Efficacy of local tranexamic acid treatment for prevention of bleeding after dental procedures: A systematic review and meta-analysis.', abstract: 'Post-procedural bleeding in dental patients on anticoagulants.' },
  { title: 'Tranexamic acid for the prevention and the treatment of primary postpartum haemorrhage: a systematic review.', abstract: 'Twenty-seven randomised controlled trials (33,302 women) were identified.' },
  { title: 'UK clinical guideline for the prevention and treatment of osteoporosis.', abstract: 'Guideline for osteoporosis.', citationCount: 582 }
]);
assert.ok(/postpartum/.test(pph[0].title));
pph.filter(p => !/postpartum/.test(p.title)).forEach(p => assert.ok(p.score <= 35 && p.missingConcepts.length > 0, `${p.title} scored ${p.score}`));
console.log('   ✓ PPH: dermatology, dental and osteoporosis papers flagged "missing: postpartum haemorrhage" and ≤ 35.');

const scores = hf.concat(pph).map(p => p.score);
assert.ok(new Set(scores).size >= 6, 'scores must discriminate (no saturation)');
console.log('\nPassed: Relevance ranking tests verified.');
