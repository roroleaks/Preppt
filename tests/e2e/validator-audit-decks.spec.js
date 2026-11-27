/**
 * Validator regression (audit D-02 / D-03): the decks the live app produced during the audit passed every
 * pre-export check. Each must now be rejected for the defects the audit found.
 */
const assert = require('assert');
const { validatePresentationOutput } = require('../../lib/validator.js');

function failing(fixture) {
  const { deck, papers } = require(`../fixtures/${fixture}.json`);
  const v = validatePresentationOutput({ deck, papers, requestedSlideCount: deck.requestedSlideCount, topic: deck.topic });
  return { v, ids: v.checks.filter(c => c.status === 'fail').map(c => c.id), warn: v.checks.filter(c => c.status === 'warning').map(c => c.id) };
}

{
  const { v, ids } = failing('audit-live-deck-sglt2-hfpef');
  assert.strictEqual(v.canExport, false, 'the audit SGLT2 deck must be blocked');
  ['direction_fidelity', 'no_intext_citations', 'finding_content', 'unexplained_acronyms', 'text_defects'].forEach(id => assert.ok(ids.includes(id), `expected ${id} to fail; got ${ids}`));
  const df = v.checks.find(c => c.id === 'direction_fidelity');
  assert.ok(/states no benefit although/.test(df.details));
  console.log(`   ✓ Audit SGLT2i/HFpEF deck (was 21/21 pass) now blocked: ${ids.join(', ')}.`);
}
{
  const { v, ids, warn } = failing('audit-live-deck-parp-ovarian-public');
  assert.strictEqual(v.canExport, false, 'the audit PARP/public deck must be blocked');
  assert.ok(ids.includes('text_defects'), `"Public audience audience" and empty labels must fail; got ${ids}`);
  assert.ok(warn.includes('audience_fit'), 'statistical notation in a public deck must be flagged');
  console.log(`   ✓ Audit PARP/public deck now blocked (${ids.join(', ')}) and audience_fit warns.`);
}
console.log('\nPassed: Validator audit-deck regression verified.');
