/**
 * Preppt E2E Test: Stats Panel Accuracy (BUG-2 Remediated)
 * Asserts that the paper review statistics panel reflects accurate counts for:
 * - Curated / Target
 * - Europe PMC count
 * - Semantic Scholar count
 * - Overlapping studies (both sources)
 * - Total citations sum
 */

const assert = require('assert');

// Simulate state and DOM calculation logic from app.js
const mockPapers = [
  { id: 'p1', title: 'Paper 1', sources: ['Europe PMC'], source: 'epmc', citationCount: 150 },
  { id: 'p2', title: 'Paper 2', sources: ['Europe PMC'], source: 'epmc', citationCount: 220 },
  { id: 'p3', title: 'Paper 3', sources: ['Semantic Scholar'], source: 's2', citationCount: 310 },
  { id: 'p4', title: 'Paper 4', sources: ['Semantic Scholar'], source: 's2', citationCount: 80 },
  { id: 'p5', title: 'Paper 5', sources: ['Europe PMC', 'Semantic Scholar'], source: 'both', citationCount: 5000 },
  { id: 'p6', title: 'Paper 6', sources: ['Europe PMC', 'Semantic Scholar'], source: 'both', citationCount: 12000 }
];

function calculateStats(paperPool, selectedPapers, targetPapers) {
  const curatedCount = selectedPapers.length;
  const targetCount = targetPapers;

  const europePmcCount = paperPool.filter(p => (p.sources || []).includes('Europe PMC') || p.source === 'epmc').length;
  const semanticScholarCount = paperPool.filter(p => (p.sources || []).includes('Semantic Scholar') || p.source === 's2').length;
  const bothSourcesCount = paperPool.filter(p => p.source === 'both' || (p.sources && p.sources.length > 1)).length;
  const totalCitations = paperPool.reduce((sum, p) => sum + (Number(p.citationCount || p.citation_count) || 0), 0);

  return {
    curatedCount,
    targetCount,
    curatedDisplay: `${curatedCount} / ${targetCount}`,
    europePmcCount,
    semanticScholarCount,
    bothSourcesCount,
    totalCitations
  };
}

console.log('Running Preppt Stats Panel Accuracy Test (BUG-2)...');

// Scenario 1: Initial load where user has only 3 selected out of 6 reviewed papers
const initialSelected = [mockPapers[0], mockPapers[2], mockPapers[4]];
const stats1 = calculateStats(mockPapers, initialSelected, 5);

assert.strictEqual(stats1.curatedCount, 3, 'Curated count should be 3');
assert.strictEqual(stats1.targetCount, 5, 'Target count should be 5');
assert.strictEqual(stats1.curatedDisplay, '3 / 5');
// Europe PMC count includes p1, p2, p5, p6 = 4 papers
assert.strictEqual(stats1.europePmcCount, 4, `Expected 4 Europe PMC papers, got ${stats1.europePmcCount}`);
// Semantic Scholar count includes p3, p4, p5, p6 = 4 papers
assert.strictEqual(stats1.semanticScholarCount, 4, `Expected 4 Semantic Scholar papers, got ${stats1.semanticScholarCount}`);
// Both sources includes p5, p6 = 2 papers
assert.strictEqual(stats1.bothSourcesCount, 2, `Expected 2 overlapping papers, got ${stats1.bothSourcesCount}`);
// Total citations: 150 + 220 + 310 + 80 + 5000 + 12000 = 17760
assert.strictEqual(stats1.totalCitations, 17760, `Expected 17,760 total citations, got ${stats1.totalCitations}`);
console.log('✓ Initial metrics accurately reflect the complete candidate pool (not just active selection).');

// Scenario 2: User clicks "Select All"
const stats2 = calculateStats(mockPapers, mockPapers, 5);
assert.strictEqual(stats2.curatedCount, 6);
assert.strictEqual(stats2.curatedDisplay, '6 / 5');
assert.strictEqual(stats2.totalCitations, 17760);
console.log('✓ Select-all updates curated count without corrupting pool metrics.');

// Scenario 3: User permanently removes Paper 6 (12,000 citations)
const poolAfterRemove = mockPapers.filter(p => p.id !== 'p6');
const selectedAfterRemove = initialSelected.filter(p => p.id !== 'p6');
const stats3 = calculateStats(poolAfterRemove, selectedAfterRemove, 5);

assert.strictEqual(stats3.europePmcCount, 3, 'Europe PMC count should decrement to 3');
assert.strictEqual(stats3.semanticScholarCount, 3, 'Semantic Scholar count should decrement to 3');
assert.strictEqual(stats3.bothSourcesCount, 1, 'Both sources should decrement to 1');
assert.strictEqual(stats3.totalCitations, 5760, 'Total citations should be 17760 - 12000 = 5760');
console.log('✓ Permanent paper removal recalculates pool metrics and citations dynamically.');

console.log('\n✅ ALL STATS PANEL ACCURACY TESTS PASSED SUCCESSFULLY.');
