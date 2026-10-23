const http = require('http');
const fs = require('fs');
const path = require('path');
const s2Handler = require('./api/s2.js');
const { proposeKeywords, buildSearchStrategy } = require('./api/keywords.js');
const { generatePresentationDocx } = require('./api/docx-generator.js');
const { generatePresentationDeck } = require('./api/synthesize.js');
const { validatePresentationOutput } = require('./api/validator.js');

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

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 20 * 1024 * 1024) {
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(new Error('Invalid JSON payload: ' + err.message));
      }
    });
    req.on('error', reject);
  });
}

async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  const [reqPath] = req.url.split('?');

  // Semantic Scholar Proxy
  if (reqPath === '/api/s2') {
    return s2Handler(req, res);
  }

  // Step 2: Propose Keywords API
  if (reqPath === '/api/propose-keywords' && req.method === 'POST') {
    try {
      const data = await readBody(req);
      const result = proposeKeywords(data.topic || '');
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.end(JSON.stringify(result));
    } catch (err) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.end(JSON.stringify({ error: err.message }));
    }
  }

  // Step 3: Build Search Strategy API
  if (reqPath === '/api/build-strategy' && req.method === 'POST') {
    try {
      const data = await readBody(req);
      const strategy = buildSearchStrategy(data);
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.end(JSON.stringify(strategy));
    } catch (err) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.end(JSON.stringify({ error: err.message }));
    }
  }

  // Step 7 & 8: Presentation Synthesis API
  if (reqPath === '/api/synthesize' && req.method === 'POST') {
    try {
      const data = await readBody(req);
      const deck = generatePresentationDeck({
        topic: data.topic || 'Scientific Topic',
        shortTitle: data.shortTitle || '',
        papers: data.papers || [],
        targetPapers: data.targetPapers || 10,
        startYear: data.startYear || 2021,
        audience: data.audience || 'Postgraduate',
        slideCount: data.slideCount || 11,
        density: data.density || 'Balanced',
        approvedKeywords: data.approvedKeywords || {},
        approvedStrategy: data.approvedStrategy || {}
      });
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.end(JSON.stringify(deck));
    } catch (err) {
      console.error('Synthesis error:', err);
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.end(JSON.stringify({ error: err.message }));
    }
  }

  // Prompt 13: Pre-Export Validation API Endpoint
  if (reqPath === '/api/validate' && req.method === 'POST') {
    try {
      const data = await readBody(req);
      const validationReport = validatePresentationOutput({
        deck: data.deck,
        papers: data.papers || [],
        removedPapers: data.removedPapers || [],
        requestedSlideCount: data.slideCount || data.deck?.requestedSlideCount,
        topic: data.topic || data.deck?.topic
      });
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.end(JSON.stringify(validationReport));
    } catch (err) {
      console.error('Validation error:', err);
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.end(JSON.stringify({ error: err.message }));
    }
  }

  // Step 9 & 10: Word DOCX Export Endpoint (Enforcing Prompt 13 validation gate)
  if (reqPath === '/api/export-docx' && req.method === 'POST') {
    try {
      const data = await readBody(req);
      const { topic, deck, papers, meta, removedPapers } = data;
      if (!deck || !papers) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({ error: 'Missing deck or papers payload' }));
      }

      // Prompt 13: Validate the output before allowing export
      const validation = validatePresentationOutput({
        deck,
        papers,
        removedPapers: removedPapers || [],
        requestedSlideCount: data.slideCount || deck.requestedSlideCount,
        topic: topic || deck.topic
      });

      if (!validation.isValid) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({
          error: 'Pre-export validation failed: ' + validation.errors.join('; '),
          validation
        }));
      }

      const docxBuffer = await generatePresentationDocx({
        topic: topic || 'Scientific Topic',
        deck,
        papers,
        meta
      });

      const safeFilename = (deck.shortTitle || topic || 'presentation')
        .replace(/[^a-zA-Z0-9_-]/g, '_')
        .substring(0, 50);

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', `attachment; filename="Preppt_${safeFilename}.docx"`);
      res.setHeader('Content-Length', docxBuffer.length);
      return res.end(docxBuffer);
    } catch (err) {
      console.error('DOCX export error:', err);
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: 'Failed to generate Word document: ' + err.message }));
    }
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
