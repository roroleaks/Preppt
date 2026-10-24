const http = require('http');
const fs = require('fs');
const path = require('path');

// Serverless API handlers
const s2Handler = require('./api/s2.js');
const openalexHandler = require('./api/openalex.js');
const crossrefHandler = require('./api/crossref.js');
const proposeKeywordsHandler = require('./api/propose-keywords.js');
const buildStrategyHandler = require('./api/build-strategy.js');
const synthesizeHandler = require('./api/synthesize.js');
const validateHandler = require('./api/validate.js');
const exportDocxHandler = require('./api/export-docx.js');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

async function handler(req, res) {
  const [reqPath] = req.url.split('?');

  // Dispatch API routes to serverless modules
  if (reqPath === '/api/s2') {
    return s2Handler(req, res);
  }
  if (reqPath === '/api/openalex') {
    return openalexHandler(req, res);
  }
  if (reqPath === '/api/crossref') {
    return crossrefHandler(req, res);
  }
  if (reqPath === '/api/propose-keywords') {
    return proposeKeywordsHandler(req, res);
  }
  if (reqPath === '/api/build-strategy') {
    return buildStrategyHandler(req, res);
  }
  if (reqPath === '/api/synthesize') {
    return synthesizeHandler(req, res);
  }
  if (reqPath === '/api/validate') {
    return validateHandler(req, res);
  }
  if (reqPath === '/api/export-docx') {
    return exportDocxHandler(req, res);
  }

  // Static File Serving
  let relativePath = reqPath;
  if (relativePath === '/' || relativePath === '') {
    relativePath = '/index.html';
  }

  const publicDir = path.join(__dirname, 'public');
  const filePath = path.join(publicDir, decodeURIComponent(relativePath));

  if (!filePath.startsWith(publicDir)) {
    res.statusCode = 403;
    return res.end('Access denied');
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        fs.readFile(path.join(publicDir, 'index.html'), (err2, indexContent) => {
          if (err2) {
            res.statusCode = 404;
            res.setHeader('Content-Type', 'text/plain');
            return res.end('404 Not Found');
          }
          res.statusCode = 200;
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.end(indexContent);
        });
      } else {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'text/plain');
        res.end('500 Server Error: ' + err.code);
      }
    } else {
      res.statusCode = 200;
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'no-cache');
      res.end(content);
    }
  });
}

const server = http.createServer(handler);

function startServer(port) {
  server.listen(port, () => {
    console.log(`\n=================================================`);
    console.log(`🚀 Preppt Server running at http://localhost:${port}`);
    console.log(`=================================================\n`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`Port ${port} in use, trying port ${port + 1}...`);
      startServer(port + 1);
    } else {
      console.error('Server error:', err);
    }
  });
}

if (require.main === module) {
  const PORT = parseInt(process.env.PORT, 10) || 3080;
  startServer(PORT);
}

module.exports = { server, handler };
