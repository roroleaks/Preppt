const { guard, parseJsonBody, BodyTooLargeError } = require('../lib/http-guard.js');
const { buildSearchStrategy } = require('../lib/keywords.js');

module.exports = async (req, res) => {
  if (!guard(req, res, { methods: ['POST'], kind: 'light' })) return;

  try {
    const data = await parseJsonBody(req);
    const strategy = buildSearchStrategy(data);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.end(JSON.stringify(strategy));
  } catch (err) {
    if (err instanceof BodyTooLargeError) {
      res.statusCode = 413;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.end(JSON.stringify({ error: 'Request body too large.' }));
    }
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.end(JSON.stringify({ error: err.message }));
  }
};
