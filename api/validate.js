const { guard, parseJsonBody, BodyTooLargeError } = require('../lib/http-guard.js');
const { validatePresentationOutput } = require('../lib/validator.js');

module.exports = async (req, res) => {
  if (!guard(req, res, { methods: ['POST'], kind: 'light' })) return;

  try {
    const data = await parseJsonBody(req);
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
    if (err instanceof BodyTooLargeError) {
      res.statusCode = 413;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.end(JSON.stringify({ error: 'Request body too large.' }));
    }
    console.error('Validation error:', err);
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.end(JSON.stringify({ error: err.message }));
  }
};
