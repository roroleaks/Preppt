const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const homeDir = os.homedir();
const repoDir = path.resolve(__dirname, '..');
const scratchDir = path.resolve(repoDir, '..');
const scratchZip = path.join(scratchDir, 'preppt-snapshot.zip');

const targetPaths = [
  scratchZip,
  path.join(homeDir, 'Downloads', 'preppt-snapshot.zip'),
  path.join(homeDir, 'preppt-snapshot.zip')
];

console.log('📦 Creating clean project ZIP snapshot via git archive...');

try {
  // Archive committed HEAD files
  execSync(`git archive -o "${scratchZip}" HEAD`, { cwd: repoDir, stdio: 'inherit' });

  const stats = fs.statSync(scratchZip);
  const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);

  // Copy to user convenient locations (Downloads, Home root, and Repo)
  for (const dest of targetPaths.slice(1)) {
    try {
      const destDir = path.dirname(dest);
      if (fs.existsSync(destDir)) {
        fs.copyFileSync(scratchZip, dest);
      }
    } catch (copyErr) {
      console.warn(`Could not copy to ${dest}:`, copyErr.message);
    }
  }

  console.log(`\n✅ Snapshot successfully created (${sizeMB} MB)!`);
  console.log('Available at:');
  for (const p of targetPaths) {
    if (fs.existsSync(p)) {
      console.log(`  - ${p}`);
    }
  }
} catch (err) {
  console.error('Failed to create snapshot:', err.message);
  process.exit(1);
}
