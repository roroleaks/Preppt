const { validatePresentationOutput } = require('../lib/validator.js');
const { generatePresentationDocx } = require('../lib/docx-generator.js');

async function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch (e) { return {}; }
  }
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch (e) { resolve({}); }
    });
    req.on('error', () => resolve({}));
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  try {
    const data = await parseBody(req);
    const { topic, deck, papers, meta, removedPapers } = data;
    if (!deck || !papers) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: 'Missing deck or papers payload' }));
    }

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
};
