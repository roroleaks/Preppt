/**
 * Prompt 6 (P1-7) Offline XSS Escaping Tests:
 * Verifies escapeHtml, safeUrl, buildPaperCardHtml, and buildSlideCardHtml
 * neutralize malicious titles, notes, DOIs, and slide bullets.
 */
const assert = require('assert');
const { escapeHtml, safeUrl, buildPaperCardHtml, buildSlideCardHtml } = require('../../public/render-helpers.js');

function runTests() {
  console.log('--- TEST: XSS Escaping & URL Sanitization (P1-7) ---');

  assert.strictEqual(safeUrl('javascript:alert(1)'), '#', 'javascript: URL must be neutralized to #');
  assert.strictEqual(safeUrl('https://doi.org/10.1000/test'), 'https://doi.org/10.1000/test', 'https: URL must pass');

  const maliciousPaper = {
    id: 'xss-1',
    title: '<img src=x onerror="window.__xss=1">',
    authors: 'Author A',
    journal: 'Journal X',
    pubDate: '2024',
    relevancePercentage: 95,
    studyType: 'Cohort',
    pubType: ['Journal Article'],
    doi: 'javascript:alert(1)',
    userNote: '<script>window.__xss=2</script>',
    abstract: 'Results: 50% vs 40%.'
  };

  const paperHtml = buildPaperCardHtml(maliciousPaper, 0, true);
  assert(!paperHtml.includes('<img'), 'Paper card HTML must not contain raw <img tag');
  assert(!paperHtml.includes('<script'), 'Paper card HTML must not contain raw <script tag');
  assert(!/href="javascript:/i.test(paperHtml), 'Paper card HTML must not contain javascript: href');
  assert(paperHtml.includes(escapeHtml(maliciousPaper.title)), 'Escaped title must be present');
  assert(paperHtml.includes(escapeHtml(maliciousPaper.userNote)), 'Escaped note must be present');

  const hrefMatches = [...paperHtml.matchAll(/href="([^"]*)"/g)].map(m => m[1]);
  for (const href of hrefMatches) {
    assert(
      href === '#' || /^https?:\/\//i.test(href),
      `Every href must be http(s) or #, found: ${href}`
    );
  }

  const maliciousSlide = {
    slideNumber: 1,
    title: '<img src=x onerror="window.__xss=1">',
    suggestedVisualType: 'Bar chart',
    objective: 'Objective',
    mainMessage: 'Main message',
    slideDensity: 'Balanced',
    onSlideText: '<b onmouseover=alert(1)>x</b>\nSecond line',
    detailedVisualDescription: 'Layout',
    speakerNotes: 'Notes',
    audienceQuestion: 'Question?',
    transition: 'Next'
  };

  const slideHtml = buildSlideCardHtml(maliciousSlide, 1);
  assert(!slideHtml.includes('<img'), 'Slide card HTML must not contain raw <img tag');
  assert(!/<b\s+onmouseover=/i.test(slideHtml), 'Slide card HTML must not contain raw <b onmouseover= tag');
  assert(slideHtml.includes('&lt;b onmouseover=alert(1)&gt;x&lt;/b&gt;<br>Second line'), 'Slide bullet must be escaped before <br> conversion');

  console.log('   ✓ Paper card and slide card HTML safely escaped all XSS payloads.');
  console.log('\nPassed: All XSS escaping tests verified.\n');
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
