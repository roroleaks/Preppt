/**
 * Offline test runner for CI: sets PREPPT_OFFLINE=1 and blocks all outbound
 * HTTP/HTTPS requests via tests/helpers/block-network.js.
 */
const { execSync } = require('child_process');
const path = require('path');

const helperPath = path.resolve(__dirname, '../tests/helpers/block-network.js').replace(/\\/g, '/');
const existingNodeOpts = process.env.NODE_OPTIONS ? `${process.env.NODE_OPTIONS} ` : '';
const env = {
  ...process.env,
  PREPPT_OFFLINE: '1',
  NODE_OPTIONS: `${existingNodeOpts}--require ${helperPath}`.trim()
};

const commands = [
  'npm run lint:syntax',
  'node test-e2e.js',
  'node test-step-by-step.js',
  'npm run test:e2e'
];

for (const cmd of commands) {
  execSync(cmd, { stdio: 'inherit', env });
}
