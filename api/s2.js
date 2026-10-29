const https = require('https');

// Semantic Scholar API Key read exclusively from server-side environment variables
const S2_SERVER_KEY = process.env.S2_API_KEY || process.env.SEMANTIC_SCHOLAR_KEY || '';

function queryS2(targetPath, apiKey, attempt = 0) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.semanticscholar.org',
      path: targetPath,
      method: 'GET',
      timeout: 8000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    };

    if (apiKey) {
      options.headers['x-api-key'] = apiKey;
    }

    const s2Req = https.request(options, (s2Res) => {
      let data = '';
      s2Res.on('data', chunk => data += chunk);
      s2Res.on('end', () => {
        // Automatic exponential backoff retry on 429 rate limit (up to 3 attempts)
        if (s2Res.statusCode === 429 && attempt < 3) {
          const backoff = 1500 * (attempt + 1);
          console.warn(`Semantic Scholar HTTP 429 encountered. Backing off ${backoff}ms (attempt ${attempt + 1}/3)...`);
          setTimeout(() => {
            queryS2(targetPath, apiKey, attempt + 1).then(resolve).catch(reject);
          }, backoff);
          return;
        }

        resolve({
          statusCode: s2Res.statusCode,
          headers: s2Res.headers,
          body: data
        });
      });
    });

    s2Req.on('timeout', () => {
      s2Req.destroy();
      if (attempt < 2) {
        setTimeout(() => {
          queryS2(targetPath, apiKey, attempt + 1).then(resolve).catch(reject);
        }, 1200);
        return;
      }
      resolve({
        statusCode: 504,
        headers: {},
        body: JSON.stringify({ error: 'Semantic Scholar upstream timed out (8s limit reached)' })
      });
    });

    s2Req.on('error', (err) => {
      if (attempt < 2) {
        setTimeout(() => {
          queryS2(targetPath, apiKey, attempt + 1).then(resolve).catch(reject);
        }, 1200);
        return;
      }
      reject(err);
    });

    s2Req.end();
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  try {
    const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const query = urlObj.searchParams.get('query') || '';
    const limit = urlObj.searchParams.get('limit') || '30';
    const fields = urlObj.searchParams.get('fields') || 'paperId,title,authors,year,abstract,venue,publicationVenue,journal,externalIds,openAccessPdf,citationCount,publicationTypes,fieldsOfStudy';
    const year = urlObj.searchParams.get('year') || '';
    const paperId = urlObj.searchParams.get('paperId') || '';
    const apiKey = S2_SERVER_KEY || req.headers['x-api-key'] || '';

    let targetPath = '';
    if (paperId) {
      targetPath = `/graph/v1/paper/${encodeURIComponent(paperId)}?fields=${encodeURIComponent(fields)}`;
    } else {
      targetPath = `/graph/v1/paper/search?query=${encodeURIComponent(query)}&limit=${encodeURIComponent(limit)}&fields=${encodeURIComponent(fields)}`;
      if (year) targetPath += `&year=${encodeURIComponent(year)}`;
    }

    const result = await queryS2(targetPath, apiKey);
    res.statusCode = result.statusCode || 200;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(result.body);
  } catch (err) {
    console.error('Preppt S2 Proxy Error:', err);
    res.statusCode = 502;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'Failed to reach Semantic Scholar upstream', details: err.message }));
  }
};
