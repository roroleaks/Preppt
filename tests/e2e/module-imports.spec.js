/**
 * Guard Test: Cross-Module Import Audit for evidence-extractor.js (P0-2)
 *
 * Statically scans lib/validator.js, lib/synthesize.js, and api/*.js to verify:
 * 1. Every identifier destructured from require('./evidence-extractor.js') or
 *    require('../lib/evidence-extractor.js') exists in evidence-extractor.js exports.
 * 2. Every call to a known evidence-extractor exported function in those files
 *    is explicitly imported from evidence-extractor.js.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const evidenceExtractor = require('../../lib/evidence-extractor.js');

function testModuleImports() {
  console.log('--- TEST: Cross-Module Import Audit (P0-2) ---');

  const rootDir = path.resolve(__dirname, '../..');
  const exportedNames = Object.keys(evidenceExtractor);
  assert(exportedNames.length > 0, 'evidence-extractor.js must export at least one function');
  console.log(`Known evidence-extractor exports (${exportedNames.length}): ${exportedNames.join(', ')}`);

  const apiDir = path.join(rootDir, 'api');
  const apiFiles = fs.readdirSync(apiDir)
    .filter(f => f.endsWith('.js'))
    .map(f => path.join(apiDir, f));

  const targetFiles = [
    path.join(rootDir, 'lib/validator.js'),
    path.join(rootDir, 'lib/synthesize.js'),
    ...apiFiles
  ];

  const requireRegex = /(?:const|let|var)\s*\{([^}]+)\}\s*=\s*require\(\s*['"](?:\.\/|\.\.\/lib\/)evidence-extractor(?:\.js)?['"]\s*\)/g;

  for (const filePath of targetFiles) {
    const relPath = path.relative(rootDir, filePath).replace(/\\/g, '/');
    const source = fs.readFileSync(filePath, 'utf8');

    const importedNames = new Set();
    let match;
    requireRegex.lastIndex = 0;
    while ((match = requireRegex.exec(source)) !== null) {
      const identifiers = match[1]
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
        .map(s => s.split(':')[0].trim());

      for (const id of identifiers) {
        assert(
          exportedNames.includes(id),
          `${relPath} destructures "${id}" from evidence-extractor.js, but "${id}" is NOT exported by evidence-extractor.js`
        );
        importedNames.add(id);
      }
    }

    // Check for any calls to known evidence-extractor function names
    for (const fnName of exportedNames) {
      const callRegex = new RegExp(`\\b${fnName}\\s*\\(`, 'g');
      if (callRegex.test(source)) {
        // Also allow local function definitions if any, otherwise must be imported
        const localDefRegex = new RegExp(`function\\s+${fnName}\\s*\\(`);
        if (!localDefRegex.test(source)) {
          assert(
            importedNames.has(fnName),
            `${relPath} calls ${fnName}() without importing it from evidence-extractor.js`
          );
        }
      }
    }

    console.log(`  ✓ ${relPath} (imports: ${importedNames.size > 0 ? [...importedNames].join(', ') : 'none'})`);
  }

  console.log('\nPassed: All cross-module imports from evidence-extractor.js verified.\n');
}

if (require.main === module) {
  try {
    testModuleImports();
  } catch (err) {
    console.error(`✗ Import audit failed: ${err.message}`);
    process.exit(1);
  }
}

module.exports = { testModuleImports };
