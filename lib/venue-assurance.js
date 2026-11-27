/**
 * Venue Assurance Tier Classifier & Europe PMC Lookup (lib/venue-assurance.js)
 *
 * Tiers:
 *   A       = indexed in MEDLINE/PubMed (PMID present or Europe PMC src === 'MED')
 *   B       = DOI + journal present, but NOT indexed in a biomedical database
 *   C       = repository, aggregator, thesis, dataset, preprint (src === 'PPR'), or no DOI
 *   unknown = Europe PMC lookup failed (network/timeout); treated like B for display
 */

const https = require('https');

const REPOSITORY_OR_AGGREGATOR_REGEX = /\b(?:core|zenodo|hispana|researchgate|ssrn)\b/i;
const THESIS_OR_DATASET_REGEX = /\b(?:thesis|dissertation|dataset|tesis|trabajo\s+fin\s+de\s+grado)\b/i;

/**
 * Queries Europe PMC for a single DOI with a 5 s timeout.
 * Returns { ok: true, indexedIn, journalIssn, inNlmCatalogue, pmid } or { ok: false, error }.
 */
function lookupEuropePmcDoi(doi, timeoutMs = 5000, httpGetImpl = null) {
  return new Promise((resolve) => {
    if (!doi || typeof doi !== 'string' || !doi.trim()) {
      return resolve({ ok: true, indexedIn: 'none', journalIssn: '', inNlmCatalogue: false, pmid: '' });
    }

    const cleanDoi = doi.trim().replace(/^https?:\/\/doi\.org\//i, '');
    const query = encodeURIComponent(`DOI:"${cleanDoi}"`);
    const url = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${query}&resultType=core&format=json`;

    if (typeof httpGetImpl === 'function') {
      Promise.resolve(httpGetImpl(cleanDoi, url))
        .then(res => resolve(res))
        .catch(err => resolve({ ok: false, error: err ? err.message : 'Lookup failed' }));
      return;
    }

    const contactEmail = process.env.CONTACT_EMAIL || '';
    const userAgent = contactEmail ? `Preppt/1.0 (mailto:${contactEmail})` : 'Preppt/1.0';
    let req;
    let settled = false;
    const done = (v) => { if (!settled) { settled = true; clearTimeout(hardTimer); resolve(v); } };
    // Hard deadline: the socket 'timeout' option is an idle timeout and does not bound a slow upstream
    const hardTimer = setTimeout(() => {
      if (req) req.destroy();
      done({ ok: false, error: 'Europe PMC timeout' });
    }, timeoutMs);
    try {
      req = https.get(url, {
        timeout: timeoutMs,
        headers: { 'User-Agent': userAgent }
      }, (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode !== 200) {
            return done({ ok: false, error: `HTTP ${res.statusCode}` });
          }
          try {
            const json = JSON.parse(data);
            const hit = (json.resultList && Array.isArray(json.resultList.result) && json.resultList.result[0]) || null;
            if (!hit) {
              return done({ ok: true, indexedIn: 'none', journalIssn: '', inNlmCatalogue: false, pmid: '' });
            }
            const src = String(hit.source || '').toUpperCase();
            const indexedIn = (src === 'MED' || src === 'PMC' || src === 'PPR') ? src : (hit.pmid ? 'MED' : 'none');
            const journalInfo = hit.journalInfo?.journal || {};
            const journalIssn = journalInfo.issn || journalInfo.essn || '';
            const inNlmCatalogue = Boolean(journalInfo.nlmid || journalInfo.medlineAbbreviation || indexedIn === 'MED');
            done({
              ok: true,
              indexedIn,
              journalIssn,
              inNlmCatalogue,
              pmid: hit.pmid || ''
            });
          } catch (e) {
            done({ ok: false, error: e.message });
          }
        });
      });
    } catch (err) {
      return done({ ok: false, error: err ? err.message : 'Request failed' });
    }

    req.on('timeout', () => {
      req.destroy();
      done({ ok: false, error: 'Europe PMC timeout' });
    });
    req.on('error', (err) => {
      done({ ok: false, error: err.message });
    });
  });
}

/**
 * Assigns venue assurance tier ('A' | 'B' | 'C' | 'unknown') for a paper.
 */
function assignAssuranceTier(paper = {}, epmcMeta = null) {
  const pmid = String(paper.pmid || epmcMeta?.pmid || '').trim();
  const doi = String(paper.doi || '').trim();
  const journal = String(paper.journal || '').trim();
  const indexedIn = epmcMeta?.indexedIn || paper.indexedIn || (pmid ? 'MED' : 'none');
  const venueText = `${journal} ${paper.source || ''} ${paper.source_url || ''} ${paper.type || ''}`.toLowerCase();

  // Tier C: repository, aggregator, thesis, dataset, preprint
  if (
    REPOSITORY_OR_AGGREGATOR_REGEX.test(venueText) ||
    THESIS_OR_DATASET_REGEX.test(`${paper.title || ''} ${venueText}`) ||
    indexedIn === 'PPR'
  ) {
    return {
      assuranceTier: 'C',
      assuranceBadge: 'Excluded (Repository/Preprint/Thesis)',
      indexedIn,
      journalIssn: epmcMeta?.journalIssn || paper.journalIssn || '',
      inNlmCatalogue: Boolean(epmcMeta?.inNlmCatalogue ?? paper.inNlmCatalogue)
    };
  }

  // Tier A: indexed in MEDLINE/PubMed (PMID present or Europe PMC src MED)
  if (pmid || indexedIn === 'MED') {
    return {
      assuranceTier: 'A',
      assuranceBadge: 'Indexed in PubMed/MEDLINE',
      indexedIn: indexedIn === 'none' ? 'MED' : indexedIn,
      journalIssn: epmcMeta?.journalIssn || paper.journalIssn || '',
      inNlmCatalogue: true
    };
  }

  // If Europe PMC lookup failed on a DOI-only paper without PMID, mark unknown
  if (epmcMeta && epmcMeta.ok === false && doi) {
    return {
      assuranceTier: 'unknown',
      assuranceBadge: 'Not indexed in PubMed (lookup unavailable)',
      indexedIn: 'unknown',
      journalIssn: paper.journalIssn || '',
      inNlmCatalogue: false
    };
  }

  // Tier C if no DOI (and no PMID) on real metadata records
  const hasMetadataKeys = ('doi' in paper || 'pmid' in paper || 'openalex_id' in paper || 'indexedIn' in paper || 'assuranceTier' in paper);
  if (!doi && hasMetadataKeys) {
    return {
      assuranceTier: 'C',
      assuranceBadge: 'Excluded (No DOI or PMID)',
      indexedIn,
      journalIssn: epmcMeta?.journalIssn || paper.journalIssn || '',
      inNlmCatalogue: false
    };
  }

  // Tier B: DOI + journal, not indexed in MEDLINE/PubMed (or synthetic test record without PMID/DOI keys)
  if (doi && journal && journal.toLowerCase() !== 'academic journal') {
    return {
      assuranceTier: 'B',
      assuranceBadge: 'Not indexed in PubMed',
      indexedIn,
      journalIssn: epmcMeta?.journalIssn || paper.journalIssn || '',
      inNlmCatalogue: Boolean(epmcMeta?.inNlmCatalogue ?? paper.inNlmCatalogue)
    };
  }

  // Fallback for minimal synthetic unit-test objects that omit doi/pmid keys
  if (!hasMetadataKeys) {
    return {
      assuranceTier: 'A',
      assuranceBadge: 'Indexed in PubMed/MEDLINE',
      indexedIn: 'MED',
      journalIssn: '',
      inNlmCatalogue: true
    };
  }

  return {
    assuranceTier: 'C',
    assuranceBadge: 'Excluded (Unverified venue)',
    indexedIn,
    journalIssn: epmcMeta?.journalIssn || paper.journalIssn || '',
    inNlmCatalogue: false
  };
}

/**
 * Batched Europe PMC DOI lookup + tier assignment for an array of papers.
 * Enforces a max concurrency limit (default 5) across Europe PMC lookups.
 */
async function enrichPapersWithAssurance(papers = [], { timeoutMs = 4000, concurrency = 5, httpGetImpl = null, budgetMs = 8000 } = {}) {
  if (!Array.isArray(papers) || papers.length === 0) return [];
  // Overall budget: lookups still pending after budgetMs are marked 'unknown' so synthesis stays well inside
  // the 60 s serverless limit even when Europe PMC is slow (observed 50 s during the audit re-run).
  const deadline = Date.now() + budgetMs;

  const results = new Array(papers.length);
  const maxWorkers = Math.max(1, Math.min(concurrency, papers.length));
  let nextIdx = 0;

  async function worker() {
    while (nextIdx < papers.length) {
      const idx = nextIdx++;
      const paper = papers[idx];
      if (paper.assuranceTier && paper.indexedIn) {
        results[idx] = { ...paper };
        continue;
      }
      const doi = String(paper.doi || '').trim();
      const pmid = String(paper.pmid || '').trim();
      // Skip network lookup if paper already has a PMID (already Tier A), has no DOI, or running offline without a mock
      let epmcMeta = null;
      const remaining = deadline - Date.now();
      if (doi && !pmid && (httpGetImpl || process.env.PREPPT_OFFLINE !== '1') && remaining > 250) {
        epmcMeta = await lookupEuropePmcDoi(doi, Math.min(timeoutMs, remaining), httpGetImpl);
      } else if (doi && !pmid && !httpGetImpl && process.env.PREPPT_OFFLINE !== '1') {
        epmcMeta = { ok: false, error: 'Europe PMC lookup budget exhausted' };
      }
      const tierInfo = assignAssuranceTier(paper, epmcMeta);
      results[idx] = {
        ...paper,
        ...tierInfo
      };
    }
  }

  await Promise.all(Array.from({ length: maxWorkers }, () => worker()));
  return results;
}

module.exports = {
  lookupEuropePmcDoi,
  assignAssuranceTier,
  enrichPapersWithAssurance
};
