const https = require('https');

const OPENALEX_API_KEY = process.env.OPENALEX_API_KEY || 'LCR4PBZ9z5sTV3HuRDicln';

function reconstructAbstract(invertedIndex) {
  if (!invertedIndex || typeof invertedIndex !== 'object') return '';
  const words = [];
  for (const [w, pos] of Object.entries(invertedIndex)) {
    if (Array.isArray(pos)) {
      for (const i of pos) words[i] = w;
    }
  }
  return words.filter(Boolean).join(' ');
}

function queryOpenAlex(query, pageSize = 30, startYear = 2021, endYear = new Date().getFullYear()) {
  return new Promise((resolve, reject) => {
    let filter = `publication_year:${startYear}-${endYear}`;
    const params = new URLSearchParams({
      search: query,
      filter: filter,
      per_page: String(pageSize),
      api_key: OPENALEX_API_KEY,
      mailto: 'raouf.roshdy@aimed.org'
    });

    const options = {
      hostname: 'api.openalex.org',
      path: `/works?${params.toString()}`,
      method: 'GET',
      timeout: 9000,
      headers: {
        'User-Agent': 'Preppt/1.0 (Scientific Literature to Presentation; mailto:raouf.roshdy@aimed.org)'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode !== 200) {
          return resolve({
            statusCode: res.statusCode,
            data: []
          });
        }
        try {
          const json = JSON.parse(data);
          const results = (json.results || []).map(p => {
            const rawAuthors = (p.authorships || []).map(a => a.author?.display_name).filter(Boolean);
            const doi = p.doi ? p.doi.replace(/^https:\/\/doi\.org\//i, '') : '';
            const pmid = p.ids?.pmid ? p.ids.pmid.replace(/^https:\/\/pubmed\.ncbi\.nlm\.nih\.gov\//i, '').replace(/\/$/, '') : '';
            const pmcid = p.ids?.pmcid ? p.ids.pmcid.replace(/^https:\/\/www\.ncbi\.nlm\.nih\.gov\/pmc\/articles\//i, '').replace(/\/$/, '') : '';
            const abstract = reconstructAbstract(p.abstract_inverted_index);

            return {
              id: p.id || doi || pmid,
              paperId: p.id,
              openalex_id: p.id,
              title: p.title || 'Untitled Study',
              authors: rawAuthors.length > 0 ? rawAuthors : ['Unknown Authors'],
              journal: p.primary_location?.source?.display_name || 'Academic Journal',
              year: p.publication_year || new Date().getFullYear(),
              publication_date: p.publication_date || String(p.publication_year || ''),
              abstract: abstract,
              abstract_summary: abstract,
              citationCount: Number(p.cited_by_count || 0),
              citation_count: Number(p.cited_by_count || 0),
              doi: doi,
              pmid: pmid,
              pmcid: pmcid,
              source: 'openalex',
              sources: ['OpenAlex'],
              source_url: p.id || (doi ? `https://doi.org/${doi}` : ''),
              full_text_url: p.open_access?.oa_url || (doi ? `https://doi.org/${doi}` : '')
            };
          });

          resolve({
            statusCode: 200,
            meta: json.meta,
            data: results
          });
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ statusCode: 504, data: [] });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.end();
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
    const limit = parseInt(urlObj.searchParams.get('limit') || '30', 10);
    const startYear = parseInt(urlObj.searchParams.get('startYear') || '2021', 10);
    const endYear = parseInt(urlObj.searchParams.get('endYear') || String(new Date().getFullYear()), 10);

    const result = await queryOpenAlex(query, limit, startYear, endYear);
    res.statusCode = result.statusCode || 200;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.end(JSON.stringify(result));
  } catch (err) {
    console.error('OpenAlex Proxy Error:', err);
    res.statusCode = 502;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.end(JSON.stringify({ error: err.message, data: [] }));
  }
};
