const { guard, parseJsonBody, BodyTooLargeError } = require('../lib/http-guard.js');
const https = require('https');
const { normaliseJournal, sanitizeAbstract } = require('../public/evidence-rules.js');

function cleanAbstract(raw) {
  if (!raw || typeof raw !== 'string') return '';
  return raw
    .replace(/<jats:[^>]+>/gi, '')
    .replace(/<\/jats:[^>]+>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function extractYear(item) {
  const dateParts = item.published?.['date-parts']?.[0]
    || item['published-print']?.['date-parts']?.[0]
    || item['published-online']?.['date-parts']?.[0]
    || item.created?.['date-parts']?.[0];
  if (Array.isArray(dateParts) && dateParts.length > 0 && Number(dateParts[0]) > 1900) {
    return Number(dateParts[0]);
  }
  return null; // never invent a publication year (audit D-17)
}

function queryCrossref(query, pageSize = 30, startYear = null) {
  return new Promise((resolve, reject) => {
    const params = new URLSearchParams({
      query: query,
      rows: String(pageSize),
      sort: 'relevance',
      order: 'desc'
    });

    if (startYear) {
      params.set('filter', `from-pub-date:${startYear}-01-01`);
    }

    const contactEmail = process.env.CONTACT_EMAIL || '';
    const userAgent = contactEmail
      ? `Preppt/1.0 (Scientific Literature to Presentation; mailto:${contactEmail})`
      : 'Preppt/1.0';

    const options = {
      hostname: 'api.crossref.org',
      path: `/works?${params.toString()}`,
      method: 'GET',
      timeout: 8000,
      headers: {
        'User-Agent': userAgent,
        'Accept': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode !== 200) {
          return resolve({
            statusCode: res.statusCode,
            data: [],
            total: 0
          });
        }
        try {
          const json = JSON.parse(data);
          const items = json.message?.items || [];

          const results = items.map(item => {
            const rawTitle = Array.isArray(item.title) ? item.title[0] : (item.title || 'Untitled Study');
            const cleanTitle = (rawTitle || '').replace(/<[^>]+>/g, '').trim();

            let authorsList = ['Unknown Authors'];
            if (Array.isArray(item.author) && item.author.length > 0) {
              const parsed = item.author
                .map(a => [a.given, a.family].filter(Boolean).join(' ') || a.name || '')
                .filter(Boolean);
              if (parsed.length > 0) authorsList = parsed;
            }

            const journal = normaliseJournal((Array.isArray(item['container-title']) && item['container-title'][0])
              || (Array.isArray(item['short-container-title']) && item['short-container-title'][0])
              || '');

            const pubYear = extractYear(item);
            const doi = item.DOI || '';
            const abstract = sanitizeAbstract(cleanAbstract(item.abstract));
            const citations = Number(item['is-referenced-by-count'] || 0);

            return {
              id: doi || item.URL || Math.random().toString(36).substring(7),
              paperId: doi || item.URL || '',
              pmid: '',
              doi: doi,
              pmcid: '',
              title: cleanTitle || 'Untitled Study',
              authors: authorsList,
              authorsString: authorsList.join(', '),
              journal: journal,
              year: pubYear,
              pubDate: String(pubYear || 'n.d.'),
              publication_date: String(pubYear || ''),
              abstract: abstract,
              abstract_summary: abstract,
              citationCount: citations,
              citation_count: citations,
              isOpenAccess: Boolean(item.license && item.license.length > 0),
              openAccessPdfUrl: item.link?.[0]?.URL || (doi ? `https://doi.org/${doi}` : ''),
              source: 'crossref',
              sources: ['Crossref'],
              source_url: item.URL || (doi ? `https://doi.org/${doi}` : ''),
              full_text_url: doi ? `https://doi.org/${doi}` : '',
              crossrefType: item.type || '',
              publication_type: item.type ? item.type.replace(/-/g, ' ') : 'Journal Article',
              pubType: [item.type || 'journal-article'],
              relevance_percentage: 0,
              user_status: 'keep',
              user_note: ''
            };
          });

          resolve({
            statusCode: 200,
            total: json.message?.['total-results'] || results.length,
            data: results
          });
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ statusCode: 504, data: [], total: 0, error: 'Crossref upstream timed out (8s limit reached)' });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.end();
  });
}

module.exports = async (req, res) => {
  if (!guard(req, res, { methods: ['GET'], kind: 'proxy' })) return;

  try {
    const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const query = urlObj.searchParams.get('query') || '';
    const limit = parseInt(urlObj.searchParams.get('limit') || urlObj.searchParams.get('rows') || '30', 10);
    const year = urlObj.searchParams.get('year') || urlObj.searchParams.get('startYear') || '';

    let startYear = null;
    if (year) {
      const match = year.match(/^(\d{4})/);
      if (match) startYear = parseInt(match[1], 10);
    }

    if (!query) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.end(JSON.stringify({ error: 'Missing query parameter' }));
    }

    const result = await queryCrossref(query, limit, startYear);
    res.statusCode = result.statusCode || 200;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({
      statusCode: result.statusCode,
      total: result.total,
      data: result.data,
      papers: result.data
    }));
  } catch (err) {
    console.error('Preppt Crossref Proxy Error:', err);
    res.statusCode = 502;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'Failed to reach Crossref upstream', details: err.message }));
  }
};
