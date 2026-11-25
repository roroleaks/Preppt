/**
 * Syntax gate: runs `node --check` on every .js file in public/, api/, lib/, scripts/,
 * and root (excluding node_modules).
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const targetDirs = ['public', 'api', 'lib', 'scripts'];

function getJsFilesInDir(dir, recursive = true) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  for (const file of list) {
    if (file === 'node_modules' || file === '.git') continue;
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      if (recursive) {
        results = results.concat(getJsFilesInDir(fullPath, true));
      }
    } else if (file.endsWith('.js')) {
      results.push(fullPath);
    }
  }
  return results;
}

// 1. Root-level .js files
const rootJsFiles = getJsFilesInDir(rootDir, false);

// 2. Subdirectory .js files
const subDirJsFiles = targetDirs.flatMap(d => getJsFilesInDir(path.join(rootDir, d), true));

const allFiles = [...rootJsFiles, ...subDirJsFiles];
let hasError = false;

console.log(`Checking syntax for ${allFiles.length} JavaScript files...\n`);

for (const filePath of allFiles) {
  const relPath = path.relative(rootDir, filePath).replace(/\\/g, '/');
  const res = spawnSync(process.execPath, ['--check', filePath], { encoding: 'utf8' });

  if (res.status === 0) {
    console.log(`✓ ${relPath}`);
  } else {
    hasError = true;
    console.error(`✗ ${relPath}`);
    if (res.stderr) {
      console.error(res.stderr.trim());
    }
  }
}

if (hasError) {
  console.error('\nSyntax check failed!');
  process.exit(1);
} else {
  console.log('\nAll JavaScript files passed syntax check.');
  process.exit(0);
}
