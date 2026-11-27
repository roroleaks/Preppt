/**
 * Metadata integrity regression (audit D-17 / D-18).
 */
const assert = require('assert');
const { normaliseYear, normaliseJournal, normalisePmcid, sanitizeAbstract } = require('../../public/evidence-rules.js');

assert.strictEqual(normaliseYear(undefined), null, 'missing year must stay missing');
assert.strictEqual(normaliseYear(''), null);
assert.strictEqual(normaliseYear('2023-04-01'), 2023);
assert.strictEqual(normaliseYear(2019), 2019);
console.log('   ✓ Missing publication year is never replaced by the current year.');

assert.strictEqual(normaliseJournal('PubMed'), '');
assert.strictEqual(normaliseJournal('Europe PMC'), '');
assert.strictEqual(normaliseJournal('Academic Journal'), '');
assert.strictEqual(normaliseJournal('The Lancet'), 'The Lancet');
console.log('   ✓ Index/repository names ("PubMed", "Europe PMC") are not reported as journals.');

assert.strictEqual(normalisePmcid('10783298'), 'PMC10783298');
assert.strictEqual(normalisePmcid('https://www.ncbi.nlm.nih.gov/pmc/articles/10783298'), 'PMC10783298');
assert.strictEqual(normalisePmcid('PMC9046468'), 'PMC9046468');
assert.strictEqual(normalisePmcid(''), '');
console.log('   ✓ PMCIDs always carry the "PMC" prefix.');

const junk = 'In the context of this recommendation clinically diagnosed postpartum haemorrhage refers to blood loss. 3WOMAN Trial Collaborators Effect of early tranexamic acid. Lancet (in press).Google Scholar Shakur H et al., 2010 Lancet. View Article Google Scholar Crossref PubMed';
assert.strictEqual(sanitizeAbstract(junk), '', 'reference-list text must be rejected');
assert.strictEqual(sanitizeAbstract('x'.repeat(7000)), '');
const real = 'BACKGROUND: Tranexamic acid reduces bleeding. RESULTS: Death due to bleeding was reduced (RR 0.81, 95% CI 0.65-1.00).';
assert.strictEqual(sanitizeAbstract(real), real);
console.log('   ✓ Reference-list / full-text dumps are rejected as abstracts; real abstracts are kept.');
console.log('\nPassed: Metadata integrity tests verified.');
