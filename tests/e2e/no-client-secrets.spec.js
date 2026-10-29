/**
 * E2E Security Test: Verify zero API secrets or tokens in client-facing bundles
 * Enforces BLOCKER 0 / BUG-4 remediation.
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

function testNoClientSecrets() {
  const publicDir = path.resolve(__dirname, '../../public');
  const filesToScan = ['app.js', 'index.html', 'style.css'];

  const secretPatterns = [
    { name: 'Semantic Scholar API Key', regex: /s2k-[A-Za-z0-9]{35,45}/i },
    { name: 'OpenAI API Key', regex: /sk-[A-Za-z0-9]{20,}/i },
    { name: 'Google Gemini API Key', regex: /AIza[A-Za-z0-9_-]{35}/i },
    { name: 'Groq API Key', regex: /gsk_[A-Za-z0-9]{20,}/i },
    { name: 'Hardcoded S2_KEY assignment', regex: /const\s+S2_KEY\s*=/i },
    { name: 'S2 Key in URL Query Parameter', regex: /[?&]key=s2k-/i }
  ];

  console.log('--- TEST: No Client Secrets in Public Bundle (BUG-4 Security Gate) ---');

  for (const file of filesToScan) {
    const filePath = path.join(publicDir, file);
    if (!fs.existsSync(filePath)) {
      console.warn(`File ${file} not found, skipping.`);
      continue;
    }

    const content = fs.readFileSync(filePath, 'utf8');

    for (const pat of secretPatterns) {
      const match = content.match(pat.regex);
      assert.strictEqual(
        match,
        null,
        `SECURITY VIOLATION: Exposed ${pat.name} detected in public file "${file}": ${match ? match[0].substring(0, 8) + '...' : ''}`
      );
    }
    console.log(`  ✓ Public file "${file}" verified: 0 exposed secrets.`);
  }

  console.log('Passed: Zero client secrets exposed in public distribution bundle.\n');
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
