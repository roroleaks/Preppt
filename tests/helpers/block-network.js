/**
 * Test helper: blocks outbound HTTP/HTTPS requests when loaded via
 * NODE_OPTIONS="--require ./tests/helpers/block-network.js".
 */
const http = require('http');
const https = require('https');

function throwBlocked() {
  throw new Error('NETWORK BLOCKED IN TESTS');
}

http.request = throwBlocked;
http.get = throwBlocked;
https.request = throwBlocked;
https.get = throwBlocked;
