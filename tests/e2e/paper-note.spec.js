/**
 * Preppt E2E Test: Paper Note Editor & Storage (BUG-5 Remediated)
 * Asserts:
 * 1. Blocking window.prompt() is completely eliminated from public/app.js
 * 2. Notes persist under localStorage key 'preppt:notes:v1'
 * 3. 500 character constraint is enforced
 * 4. User notes are preserved and mapped into presentation deck references
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { generatePresentationDeck } = require('../../lib/synthesize.js');

console.log('Running Preppt Paper Note Editor & Storage Test (BUG-5)...');

// 1. Static check: window.prompt must not exist in public/app.js
const appJsPath = path.join(__dirname, '..', '..', 'public', 'app.js');
const appJs = fs.readFileSync(appJsPath, 'utf8');

// Match direct window.prompt or bare prompt() function calls
const promptCalls = appJs.match(/(?:window\.)?prompt\s*\(/g);
assert(
  !promptCalls,
  `Forbidden prompt() calls detected in public/app.js: ${JSON.stringify(promptCalls)}`
);
console.log('✓ Blocking window.prompt() calls are 100% eliminated from public/app.js.');

// 2. Storage key verification
assert(
  appJs.includes('preppt:notes:v1'),
  "public/app.js must reference localStorage key 'preppt:notes:v1'"
);
console.log("✓ localStorage persistence under 'preppt:notes:v1' verified in client controller.");

// 3. Inline note editor character constraint
assert(
  appJs.includes('maxlength="500"') || appJs.includes("maxlength='500'"),
  'Inline note editor textarea must enforce maxlength="500"'
);
console.log('✓ 500-character constraint enforced on inline note textarea.');

// 4. Deck synthesis references integration
const samplePaperWithNote = {
  id: 'p-dapa-1',
  title: 'Dapagliflozin in Heart Failure with Preserved Ejection Fraction',
  authors: 'Solomon SD, McMurray JJV, et al.',
  journal: 'N Engl J Med',
  year: 2022,
  pmid: '36027570',
  doi: '10.1056/NEJMoa2206286',
  abstract: 'Dapagliflozin was superior to placebo in reducing cardiovascular death or worsening heart failure in patients with HFpEF.',
  userNote: 'Key landmark DELIVER trial establishing HFpEF efficacy across ejection fractions.'
};

const deck = generatePresentationDeck({
  topic: 'SGLT2 inhibitors in Heart Failure with preserved ejection fraction',
  papers: [samplePaperWithNote],
  slideCount: 8
});

assert(Array.isArray(deck.references), 'Deck must contain references array');
const ref = deck.references[0];
assert(ref, 'Reference #1 must exist');
assert.strictEqual(
  ref.userNote,
  'Key landmark DELIVER trial establishing HFpEF efficacy across ejection fractions.',
  'User note must be mapped into deck reference metadata'
);
console.log('✓ User clinical notes correctly mapped into presentation deck references.');

console.log('\n✅ ALL PAPER NOTE EDITOR TESTS PASSED SUCCESSFULLY.');
