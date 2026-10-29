/**
 * Preppt E2E Test: Numeric Range & Constraint Validation (BUG-6 Remediated)
 * Asserts:
 * 1. Target papers input has min="3", max="50", step="1"
 * 2. Slide count input has min="8", max="30", step="1"
 * 3. Start year input has min="1900", max="2026", step="1"
 * 4. Topic input has maxlength="300"
 * 5. Controller enforces strict boundary validation
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('Running Preppt Numeric Range & Input Constraint Test (BUG-6)...');

const htmlPath = path.join(__dirname, '..', '..', 'public', 'index.html');
const appJsPath = path.join(__dirname, '..', '..', 'public', 'app.js');

const html = fs.readFileSync(htmlPath, 'utf8');
const appJs = fs.readFileSync(appJsPath, 'utf8');

// 1. Target papers input constraints
const targetInputMatch = html.match(/id=["']target-papers-input["'][^>]*>/i) || html.match(/<input[^>]*id=["']target-papers-input["'][^>]*>/i);
assert(targetInputMatch, 'target-papers-input must exist in HTML');
const targetTag = targetInputMatch[0];
assert(/min=["']3["']/i.test(targetTag), 'target-papers-input must have min="3"');
assert(/max=["']50["']/i.test(targetTag), 'target-papers-input must have max="50"');
assert(/step=["']1["']/i.test(targetTag), 'target-papers-input must have step="1"');
console.log('✓ Target papers input attributes verified: min="3", max="50", step="1".');

// 2. Slide count input constraints
const slideInputMatch = html.match(/id=["']slide-count-input["'][^>]*>/i) || html.match(/<input[^>]*id=["']slide-count-input["'][^>]*>/i);
assert(slideInputMatch, 'slide-count-input must exist in HTML');
const slideTag = slideInputMatch[0];
assert(/min=["']8["']/i.test(slideTag), 'slide-count-input must have min="8" (narrative arc floor)');
assert(/max=["']30["']/i.test(slideTag), 'slide-count-input must have max="30"');
assert(/step=["']1["']/i.test(slideTag), 'slide-count-input must have step="1"');
console.log('✓ Slide count input attributes verified: min="8", max="30", step="1".');

// 3. Start year input constraints
const yearInputMatch = html.match(/id=["']start-year-input["'][^>]*>/i) || html.match(/<input[^>]*id=["']start-year-input["'][^>]*>/i);
assert(yearInputMatch, 'start-year-input must exist in HTML');
const yearTag = yearInputMatch[0];
assert(/min=["']1900["']/i.test(yearTag), 'start-year-input must have min="1900"');
assert(/max=["']2026["']/i.test(yearTag), 'start-year-input must have max="2026"');
assert(/step=["']1["']/i.test(yearTag), 'start-year-input must have step="1"');
console.log('✓ Start year input attributes verified: min="1900", max="2026", step="1".');

// 4. Topic input maxlength="300"
const topicInputMatch = html.match(/id=["']topic-input["'][^>]*>/i) || html.match(/<input[^>]*id=["']topic-input["'][^>]*>/i);
assert(topicInputMatch, 'topic-input must exist in HTML');
const topicTag = topicInputMatch[0];
assert(/maxlength=["']300["']/i.test(topicTag), 'topic-input must have maxlength="300"');
console.log('✓ Topic input attribute verified: maxlength="300".');

// 5. Controller logic verification in app.js
assert(
  appJs.includes('targetPapers < 3') && appJs.includes('targetPapers > 50'),
  'app.js must validate targetPapers is between 3 and 50'
);
assert(
  appJs.includes('slideCount < 8') && appJs.includes('slideCount > 30'),
  'app.js must validate slideCount is between 8 and 30'
);
assert(
  appJs.includes('topic.length > 300'),
  'app.js must validate topic length does not exceed 300'
);
console.log('✓ Step 1 controller submission validation enforces 3–50 papers, 8–30 slides, and topic <= 300 chars.');

console.log('\n✅ ALL NUMERIC RANGE & CONSTRAINT TESTS PASSED SUCCESSFULLY.');
