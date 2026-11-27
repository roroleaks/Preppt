/**
 * Keyword & search-strategy regression (audit D-04).
 */
const assert = require('assert');
const { proposeKeywords, buildSearchStrategy } = require('../../lib/keywords.js');

function run(topic) {
  const k = proposeKeywords(topic);
  return { k, s: buildSearchStrategy({ topic, ...k, startYear: 2019 }) };
}
const lower = a => a.map(x => x.toLowerCase());

// 1. Concept phrases, not single words
let { k, s } = run('SGLT2 inhibitors in Heart Failure with preserved ejection fraction');
assert.deepStrictEqual(lower(k.primaryKeywords), ['sglt2 inhibitors', 'heart failure with preserved ejection fraction']);
assert.ok(s.pmc.query.includes('TITLE_ABS:(') && /\) AND \(TITLE_ABS/.test(s.pmc.query), 'concept groups must be ANDed');
assert.ok(!/\bOR Heart OR\b|\(SGLT2 OR inhibitors/.test(s.pmc.query), 'no single-word OR clause');
assert.ok(s.pmc.evidenceQuery.includes('PUB_TYPE:"randomized controlled trial"'));
console.log('   ✓ SGLT2i/HFpEF → 2 ANDed concept groups + evidence-priority query.');

// 2. No cross-domain contamination
({ k } = run('PARP inhibitor maintenance therapy in advanced ovarian cancer'));
const all = lower([...k.primaryKeywords, ...k.synonyms, ...k.meshConcepts]).join('|');
assert.ok(!/endometri|ovarian reserve|assisted reproductive|pelvic pain|laparoscopy/.test(all), `ovarian cancer contaminated: ${all}`);
assert.ok(/olaparib/.test(all) && /ovarian neoplasms/.test(all));
({ k } = run('Hodgkin lymphoma treatment in adolescents'));
assert.ok(!/chimeric|car t|cytokine release/.test(lower([...k.synonyms, ...k.meshConcepts]).join('|')), 'Hodgkin lymphoma must not get CAR-T terms');
console.log('   ✓ No endometriosis terms for ovarian cancer; no CAR-T terms for Hodgkin lymphoma.');

// 3. No invented synonyms or generic MeSH
({ k } = run('Does intermittent fasting improve outcomes?'));
assert.deepStrictEqual(lower(k.primaryKeywords), ['intermittent fasting']);
({ k } = run('Probiotics for prevention of necrotising enterocolitis in preterm infants'));
assert.deepStrictEqual(k.synonyms, []);
assert.ok(!k.meshConcepts.includes('Humans') && !k.meshConcepts.includes('Treatment Outcome'));
assert.deepStrictEqual(lower(k.primaryKeywords), ['probiotics', 'necrotising enterocolitis', 'preterm infants']);
console.log('   ✓ Question words and generic outcome words dropped; unknown concepts get no invented synonyms.');

// 4. Generic leads are stripped; aspects after ":" are not search concepts
({ k, s } = run('Tranexamic acid for prevention and treatment of postpartum haemorrhage: efficacy, safety, timing and route of administration'));
assert.deepStrictEqual(lower(k.primaryKeywords), ['tranexamic acid', 'postpartum haemorrhage']);
assert.ok(s.pmc.query.includes('"postpartum hemorrhage"'), 'spelling variant included');
console.log('   ✓ TXA/PPH → [tranexamic acid] AND [postpartum haemorrhage/hemorrhage/PPH].');

console.log('\nPassed: Keyword & search strategy tests verified.');
