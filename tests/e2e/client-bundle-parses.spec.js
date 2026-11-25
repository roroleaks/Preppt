/**
 * Regression Test: Client Bundle Parsing & Defensive Form Submit
 *
 * Verifies P0-1 remediation:
 * 1. public/app.js parses cleanly without syntax errors (new Function(source) does not throw).
 * 2. exportToWord() contains exactly one fetch('/api/export-docx') call (no orphan duplicate fragments).
 * 3. Step 1 <form id="inputs-form"> in public/index.html includes action="javascript:void(0)"
 *    and novalidate to prevent accidental native navigation.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

function runClientBundleTests() {
  console.log('--- TEST: Client Bundle Parses & Defensive Form Tag (P0-1) ---');

  const appJsPath = path.resolve(__dirname, '../../public/app.js');
  const indexHtmlPath = path.resolve(__dirname, '../../public/index.html');

  assert(fs.existsSync(appJsPath), 'public/app.js must exist');
  assert(fs.existsSync(indexHtmlPath), 'public/index.html must exist');

  const appJsSource = fs.readFileSync(appJsPath, 'utf8');
  const indexHtmlSource = fs.readFileSync(indexHtmlPath, 'utf8');

  // Test 1: public/app.js evaluates without syntax error
  console.log('1. Checking public/app.js syntax parsing via new Function()...');
  let parseError = null;
  try {
    new Function(appJsSource);
  } catch (err) {
    parseError = err;
  }
  assert.strictEqual(
    parseError,
    null,
    `public/app.js failed to parse: ${parseError ? parseError.message : ''}`
  );
  console.log('   ✓ public/app.js parses cleanly without SyntaxError.');

  // Test 2: exportToWord contains exactly one fetch('/api/export-docx'...) call
  console.log('2. Checking exportToWord() has exactly one fetch to /api/export-docx...');
  const exportDocxRegex = /fetch\(\s*['"]\/api\/export-docx['"]/g;
  const exportCalls = (appJsSource.match(exportDocxRegex) || []).length;
  assert.strictEqual(
    exportCalls,
    1,
    `Expected exactly 1 call to fetch('/api/export-docx'), but found ${exportCalls}`
  );
  console.log('   ✓ exportToWord() contains exactly 1 fetch to /api/export-docx.');

  // Test 3: public/index.html Step 1 form has action="javascript:void(0)"
  console.log('3. Checking Step 1 form tag has action="javascript:void(0)" and novalidate...');
  const formTagMatch = indexHtmlSource.match(/<form[^>]*id=["']inputs-form["'][^>]*>/i);
  assert(formTagMatch, 'Step 1 form <form id="inputs-form"> must exist in public/index.html');
  const formTag = formTagMatch[0];
  assert(
    /action=["']javascript:void\(0\)["']/i.test(formTag),
    'Step 1 form tag must include action="javascript:void(0)"'
  );
  assert(
    /\bnovalidate\b/i.test(formTag),
    'Step 1 form tag must include novalidate'
  );
  console.log('   ✓ Step 1 form tag contains action="javascript:void(0)" and novalidate.');

  console.log('\nPassed: Client bundle syntax & defensive form attributes verified.\n');
}

if (require.main === module) {
  try {
    runClientBundleTests();
  } catch (err) {
    console.error(`✗ Regression test failed: ${err.message}`);
    process.exit(1);
  }
}

module.exports = { runClientBundleTests };
