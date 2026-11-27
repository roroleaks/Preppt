/**
 * Word export layout regression (audit D-29 / D-30).
 */
const assert = require('assert');
const { generatePresentationDeck } = require('../../lib/synthesize.js');
const { proposeKeywords, buildSearchStrategy } = require('../../lib/keywords.js');
const { generatePresentationDocx } = require('../../lib/docx-generator.js');

(async () => {
  const fx = require('../fixtures/audit-sglt2-hfpef.json');
  const papers = fx.papers.map((p, i) => (i === 0 ? { ...p, authors: Array.from({ length: 42 }, (_, k) => `Author${k + 1} AB`) } : p));
  const k = proposeKeywords(fx.topic);
  const st = buildSearchStrategy({ topic: fx.topic, ...k, startYear: 2017 });
  const deck = generatePresentationDeck({ topic: fx.topic, shortTitle: 'SGLT2i in HFpEF', papers, slideCount: 10, approvedKeywords: k, approvedStrategy: st });
  const buf = await generatePresentationDocx({ topic: fx.topic, deck, papers, meta: deck.meta });
  // .docx is a zip archive; jszip is installed as a dependency of the docx package
  const JSZip = require('jszip');
  const xml = await (await JSZip.loadAsync(buf)).file('word/document.xml').async('string');
  const text = (xml.match(/<w:t[^>]*>[^<]*<\/w:t>/g) || []).map(t => t.replace(/<[^>]+>/g, '')).join(' ');
  const year = new Date().getFullYear();
  assert.ok(!/© 2025 Raouf Roshdy/.test(text) || year === 2025, 'copyright year must follow the generation year');
  assert.ok(text.includes(`© ${year} Raouf Roshdy`));
  assert.ok(/Author6 AB, et al/.test(text) && !/Author7 AB/.test(text), 'author lists are truncated after 6 names');
  const breaks = (xml.match(/<w:br w:type="page"\/>/g) || []).length;
  assert.ok(breaks >= deck.slides.length - 1, `each slide starts on a new page (${breaks} page breaks for ${deck.slides.length} slides)`);
  console.log(`   ✓ ${breaks} page breaks for ${deck.slides.length} slides; 42-author list → 6 + "et al"; copyright © ${year}.`);
  console.log('\nPassed: Word export layout tests verified.');
})().catch(e => { console.error(e); process.exit(1); });
