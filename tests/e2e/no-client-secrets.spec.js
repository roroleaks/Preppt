/**
 * E2E Security Test: Verify zero API secrets, tokens, or hard-coded emails
 * across public/, api/, lib/, scripts/, server.js, and models.js.
 * Enforces BLOCKER 0 / BUG-4 & P0-5 remediation.
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

function collectFiles(targetPath) {
  if (!fs.existsSync(targetPath)) return [];
  const stat = fs.statSync(targetPath);
  if (stat.isFile()) return [targetPath];
  const entries = fs.readdirSync(targetPath, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(targetPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(full));
    } else if (/\.(?:js|html|css|mjs|cjs)$/i.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

function testNoClientSecrets() {
  const rootDir = path.resolve(__dirname, '../..');
  const scanTargets = ['public', 'api', 'lib', 'scripts', 'server.js', 'models.js'];
  const filesToScan = scanTargets.flatMap(t => collectFiles(path.join(rootDir, t)));

  const secretPatterns = [
    { name: 'Semantic Scholar API Key', regex: /s2k-[A-Za-z0-9]{20,}/ },
    { name: 'OpenAI API Key prefix (sk-)', regex: /['"`]sk-[A-Za-z0-9_-]{12,}['"`]/ },
    { name: 'Groq API Key prefix (gsk_)', regex: /['"`]gsk_[A-Za-z0-9_-]{12,}['"`]/ },
    { name: 'Google Gemini API Key prefix (AIza)', regex: /['"`]AIza[A-Za-z0-9_-]{12,}['"`]/ },
    { name: 'xAI API Key prefix (xai-)', regex: /['"`]xai-[A-Za-z0-9_-]{12,}['"`]/ },
    { name: 'Hardcoded S2_KEY assignment', regex: /const\s+S2_KEY\s*=/i },
    { name: 'S2 Key in URL Query Parameter', regex: /[?&]key=s2k-/i },
    {
      name: '16+ alphanumeric literal near key/token/secret/api_key',
      regex: /(?:key|token|secret|api_key)\b[^\n]{0,40}['"`][A-Za-z0-9]{16,}['"`]/i
    },
    {
      name: 'Hard-coded email address in string literal',
      regex: /['"`][^'"`\n]*[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}[^'"`\n]*['"`]/
    }
  ];

  console.log('--- TEST: No Client Secrets or Hard-Coded Emails (P0-5 Security Gate) ---');

  for (const filePath of filesToScan) {
    const relPath = path.relative(rootDir, filePath).replace(/\\/g, '/');
    const content = fs.readFileSync(filePath, 'utf8');

    for (const pat of secretPatterns) {
      const match = content.match(pat.regex);
      assert.strictEqual(
        match,
        null,
        `SECURITY VIOLATION: ${pat.name} detected in "${relPath}"`
      );
    }
    console.log(`  ✓ File "${relPath}" verified: 0 exposed secrets/emails.`);
  }

  console.log(`Passed: Zero secrets or hard-coded emails across ${filesToScan.length} files.\n`);
}

if (require.main === module) {
  try {
    testNoClientSecrets();
  } catch (err) {
    console.error('Test failed:', err.message);
    process.exit(1);
  }
}

module.exports = { testNoClientSecrets };
