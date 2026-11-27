const { guard, parseJsonBody, BodyTooLargeError } = require('../lib/http-guard.js');
const { validatePresentationOutput } = require('../lib/validator.js');
const { generatePresentationDocx } = require('../lib/docx-generator.js');

module.exports = async (req, res) => {
  if (!guard(req, res, { methods: ['POST'], kind: 'heavy' })) return;

  try {
    const data = await parseJsonBody(req);
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
        failingChecks: validation.checks.filter(c => c.status === 'fail').map(c => c.id),
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
    if (err instanceof BodyTooLargeError) {
      res.statusCode = 413;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.end(JSON.stringify({ error: 'Request body too large.' }));
    }
    console.error('DOCX export error:', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'Failed to generate Word document: ' + err.message }));
  }
};
