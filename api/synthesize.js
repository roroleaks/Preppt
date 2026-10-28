const { generatePresentationDeck } = require('../lib/synthesize.js');

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
    const deck = generatePresentationDeck({
      topic: data.topic || 'Scientific Topic',
      shortTitle: data.shortTitle || '',
      papers: data.papers || [],
      targetPapers: data.targetPapers || 10,
      startYear: data.startYear || 2021,
      audience: data.audience || 'Postgraduate',
      slideCount: data.slideCount || 11,
      density: data.density || 'Balanced',
      visualStyle: data.visualStyle || 'Scientific pictorial',
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
};
