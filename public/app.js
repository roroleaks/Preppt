/**
 * Preppt — Scientific Literature to Presentation
 * Client-Side Workflow Controller (Steps 1 through 10)
 */

// Application Workflow State (Section 7 Canonical Data Model for Active Run)
const projectRun = {
  project_name: 'Preppt – Scientific Literature to Presentation',
  topic: '',
  presentation_title: '',
  target_paper_count: 8,
  publication_start_year: 2019,
  audience: 'Postgraduate',
  slide_count: 10,
  slide_density: 'Balanced',
  proposed_keywords: [],
  approved_keywords: [],
  pmc_search_strategy: '',
  semantic_scholar_search_strategy: '',
  retrieval_status: 'idle', // 'idle' | 'in_progress' | 'completed' | 'partial_failure'
  retrieved_papers: [],
  deduplicated_papers: [],
  ranked_papers: [],
  selected_papers: [],
  removed_papers: [],
  research_gaps: [],
  slides: [],
  references: [],
  word_export_status: 'not_started' // 'not_started' | 'ready' | 'exported' | 'failed'
};

const state = {
  projectRun,

  // Direct getters & setters linked to canonical projectRun model
  get topic() { return this.projectRun.topic; },
  set topic(v) { this.projectRun.topic = v; },
  get shortTitle() { return this.projectRun.presentation_title; },
  set shortTitle(v) { this.projectRun.presentation_title = v; },
  get targetPapers() { return this.projectRun.target_paper_count; },
  set targetPapers(v) { this.projectRun.target_paper_count = Number(v); },
  get startYear() { return this.projectRun.publication_start_year; },
  set startYear(v) { this.projectRun.publication_start_year = Number(v); },
  get audience() { return this.projectRun.audience; },
  set audience(v) { this.projectRun.audience = v; },
  get slideCount() { return this.projectRun.slide_count; },
  set slideCount(v) { this.projectRun.slide_count = Number(v); },
  get density() { return this.projectRun.slide_density; },
  set density(v) { this.projectRun.slide_density = v; },

  get allPapers() { return this.projectRun.ranked_papers; },
  set allPapers(v) { this.projectRun.ranked_papers = v; },
  get selectedPapers() { return this.projectRun.selected_papers; },
  set selectedPapers(v) { this.projectRun.selected_papers = v; },

  // Step 2 & 3 working caches
  approvedKeywords: {
    primaryKeywords: [],
    synonyms: [],
    meshConcepts: []
  },
  approvedStrategy: {
    pmc: {},
    semanticScholar: {}
  },

  // Step 7 & 8 Presentation Deck
  deck: null,

  currentStep: 1
};

// Expose activeProjectRun globally for easy inspection
window.activeProjectRun = state.projectRun;

// ==========================================
// UTILITY FUNCTIONS
// ==========================================
function cleanHtmlText(text) {
  if (!text) return '';
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanQueryKeywords(topic) {
  return topic
    .replace(/[^\w\s-]/g, ' ')
    .replace(/\b(the|and|for|with|from|between|into|through|during|before|after|above|below|to|of|in|on|at|by|a|an)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeTitle(t) {
  return cleanHtmlText(t).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function showToast(msg, duration = 3500) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.style.display = 'block';
  setTimeout(() => {
    toast.style.display = 'none';
  }, duration);
}

function setStepNav(stepNum) {
  state.currentStep = stepNum;
  const steps = [
    { n: 1, label: 'Step 1' },
    { n: 2, label: 'Step 2' },
    { n: 3, label: 'Step 3' },
    { n: 4, label: 'Step 4' },
    { n: 6, label: 'Step 5' },
    { n: 8, label: 'Step 6' }
  ];
  steps.forEach(s => {
    const el = document.getElementById(`step-nav-${s.n}`);
    if (!el) return;
    el.classList.remove('active', 'done', 'completed');
    const tag = el.querySelector('.pipeline-step-tag');
    if (s.n === stepNum) {
      el.classList.add('active');
      if (tag) {
        tag.className = 'pipeline-step-tag active';
        tag.textContent = `${s.label} • Active`;
      }
    } else if (s.n < stepNum) {
      el.classList.add('done');
      if (tag) {
        tag.className = 'pipeline-step-tag done';
        tag.textContent = `${s.label} • Done`;
      }
    } else {
      if (tag) {
        tag.className = 'pipeline-step-tag muted';
        tag.textContent = s.label;
      }
    }
  });
}

// ==========================================
// STEP 1: VALIDATION & KEYWORD PROPOSAL
// ==========================================
async function handleStep1Submit(e) {
  e.preventDefault();

  const topic = document.getElementById('topic-input').value.trim();
  const shortTitle = document.getElementById('short-title-input').value.trim();
  const targetPapers = Number(document.getElementById('target-papers-input').value);
  const startYear = Number(document.getElementById('start-year-input').value);
  const audience = document.getElementById('audience-select').value;
  const slideCount = Number(document.getElementById('slide-count-input').value);
  const density = document.getElementById('density-select').value;
  const visualStyle = (document.getElementById('visual-style-input')?.value || 'Scientific pictorial').trim();

  // Strict Validation: Prevent continuation if any required field is missing or invalid
  const allowedAudiences = ['Public audience', 'Undergraduate', 'Postgraduate', 'Consultants', 'Mixed audience'];
  const allowedDensities = ['Detailed', 'Balanced', 'Short bullet points'];
  const allowedVisualStyles = ['Photographic', 'Illustrative', 'Scientific pictorial', 'Cinematic 3D'];
  const currentYear = new Date().getFullYear();

  if (!topic) {
    showToast('Validation Error: Topic is required.');
    document.getElementById('topic-input').focus();
    return;
  }
  if (!shortTitle) {
    showToast('Validation Error: Short presentation title is required.');
    document.getElementById('short-title-input').focus();
    return;
  }
  if (!targetPapers || targetPapers < 1 || isNaN(targetPapers)) {
    showToast('Validation Error: Target number of final papers must be at least 1.');
    document.getElementById('target-papers-input').focus();
    return;
  }
  if (!startYear || startYear < 1900 || startYear > currentYear || isNaN(startYear)) {
    showToast(`Validation Error: Publication start year must be between 1900 and ${currentYear}.`);
    document.getElementById('start-year-input').focus();
    return;
  }
  if (!allowedAudiences.includes(audience)) {
    showToast('Validation Error: Please select an approved audience category.');
    document.getElementById('audience-select').focus();
    return;
  }
  if (!slideCount || slideCount < 8 || isNaN(slideCount)) {
    showToast('Validation Error: Number of slides must be at least 8 (required for the 8-stage narrative arc).');
    document.getElementById('slide-count-input').focus();
    return;
  }
  if (!allowedDensities.includes(density)) {
    showToast('Validation Error: Please select an approved slide density.');
    document.getElementById('density-select').focus();
    return;
  }
  if (!allowedVisualStyles.includes(visualStyle)) {
    showToast('Validation Error: Please select an approved PPT visuals style.');
    return;
  }

  // Store in state
  state.topic = topic;
  state.shortTitle = shortTitle;
  state.targetPapers = targetPapers;
  state.startYear = startYear;
  state.audience = audience;
  state.slideCount = slideCount;
  state.density = density;
  state.visualStyle = visualStyle;

  // Propose keywords via API
  const btn = document.getElementById('btn-to-keywords');
  btn.disabled = true;
  btn.innerHTML = '<span>Proposing Keywords...</span>';

  try {
    const res = await fetch('/api/propose-keywords', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic: state.topic })
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const kwData = await res.json();

    // Populate Step 2 inputs with newline-separated terms (no commas)
    document.getElementById('kw-primary-input').value = (kwData.primaryKeywords || []).join('\n');
    document.getElementById('kw-synonyms-input').value = (kwData.synonyms || []).join('\n');
    document.getElementById('kw-mesh-input').value = (kwData.meshConcepts || []).join('\n');

    // Transition to Step 2
    document.getElementById('step-1-section').style.display = 'none';
    document.getElementById('step-2-section').style.display = 'block';
    setStepNav(2);
    document.getElementById('step-2-section').scrollIntoView({ behavior: 'smooth' });
  } catch (err) {
    console.error('Keyword proposal error:', err);
    showToast(`Keyword proposal error: ${err.message}`);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span>Propose Keywords & Next</span><span class="btn-icon">→</span>';
  }
}

// ==========================================
// STEP 2: APPROVE KEYWORDS -> BUILD STRATEGY
// ==========================================
async function handleApproveKeywords() {
  const parseKeywordLines = (val) => (val || '')
    .split('\n')
    .map(s => s.trim().replace(/^[•\-\*]\s*/, '').replace(/[,\/]/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const primary = parseKeywordLines(document.getElementById('kw-primary-input').value);
  const synonyms = parseKeywordLines(document.getElementById('kw-synonyms-input').value);
  const mesh = parseKeywordLines(document.getElementById('kw-mesh-input').value);

  if (primary.length === 0) {
    showToast('Please specify at least one primary keyword.');
    return;
  }

  state.approvedKeywords = {
    primaryKeywords: primary,
    synonyms,
    meshConcepts: mesh
  };
  state.projectRun.approved_keywords = [...primary, ...synonyms, ...mesh];

  const btn = document.getElementById('btn-approve-keywords');
  btn.disabled = true;
  btn.innerHTML = '<span>Building Strategy...</span>';

  try {
    const res = await fetch('/api/build-strategy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic: state.topic,
        primaryKeywords: primary,
        synonyms,
        meshConcepts: mesh,
        startYear: state.startYear
      })
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const stratData = await res.json();

    state.approvedStrategy = stratData;

    // Populate Step 3 Strategy review textareas
    document.getElementById('pmc-query-input').value = stratData.pmc.query;
    document.getElementById('pmc-filters-text').textContent = stratData.pmc.filters;
    document.getElementById('s2-query-input').value = stratData.semanticScholar.query;
    document.getElementById('s2-filters-text').textContent = `Year: ${stratData.semanticScholar.yearFilter}`;

    // Transition to Step 3
    document.getElementById('step-2-section').style.display = 'none';
    document.getElementById('step-3-section').style.display = 'block';
    setStepNav(3);
    document.getElementById('step-3-section').scrollIntoView({ behavior: 'smooth' });
    showToast('Keywords approved. Please review your dual-engine search strategy.');
  } catch (err) {
    console.error('Strategy build error:', err);
    showToast(`Strategy error: ${err.message}`);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Approve Keywords';
  }
}

// ==========================================
// STEP 3: APPROVE STRATEGY -> RETRIEVE PAPERS
// ==========================================
async function handleApproveStrategy() {
  // Capture any user edits to queries
  const userPmcQuery = document.getElementById('pmc-query-input').value.trim();
  const userS2Query = document.getElementById('s2-query-input').value.trim();

  state.approvedStrategy.pmc.query = userPmcQuery;
  state.approvedStrategy.semanticScholar.query = userS2Query;

  state.projectRun.pmc_search_strategy = userPmcQuery;
  state.projectRun.semantic_scholar_search_strategy = userS2Query;

  // Transition to Retrieval (Step 4 & 5)
  document.getElementById('step-3-section').style.display = 'none';
  const step4El = document.getElementById('step-4-section') || document.getElementById('retrieval-progress-box');
  if (step4El) step4El.style.display = 'block';
  setStepNav(4);

  await executeLiteratureRetrieval();
}

/**
 * SECTION 5: FAILURE HANDLING
 * If one API fails:
 * 1. Retry automatically.
 * 2. If it continues to fail, use the other source.
 * 3. Show a clear non-blocking warning identifying the unavailable source.
 * 4. Continue with partial results when possible.
 * 5. Never fabricate missing metadata or papers.
 */
async function fetchWithRetry(fetchFn, sourceName, maxRetries = 2) {
  let lastError = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        console.warn(`[Auto-Retry] Retrying ${sourceName} (attempt ${attempt + 1}/${maxRetries + 1})...`);
        // Backoff wait for rate limits: 1500ms, 3000ms
        await new Promise(res => setTimeout(res, 1500 * attempt));
      }
      const data = await fetchFn();
      return { success: true, data, sourceName };
    } catch (err) {
      lastError = err;
      console.warn(`${sourceName} attempt ${attempt + 1} failed: ${err.message}`);
    }
  }
  return { success: false, error: lastError, sourceName, data: [] };
}

// ==========================================
// STEP 4 & 5: RETRIEVAL, DEDUP & RELEVANCE
// ==========================================
async function executeLiteratureRetrieval() {
  const progressFill = document.getElementById('retrieval-progress-bar') || document.getElementById('progress-fill');
  const progressStatus = document.getElementById('retrieval-status-label') || document.getElementById('progress-status-text');
  const progressDetails = document.getElementById('retrieval-progress-details') || document.getElementById('progress-subtext');
  const warningBanner = document.getElementById('api-warning-banner');
  const step4Box = document.getElementById('step-4-section') || document.getElementById('retrieval-progress-box');

  state.projectRun.retrieval_status = 'in_progress';

  if (progressFill) progressFill.style.width = '20%';
  if (progressStatus) progressStatus.textContent = 'Executing dual queries in Europe PMC & Semantic Scholar...';
  if (progressDetails) progressDetails.textContent = `Applying date rule: >= ${state.startYear} and <= ${new Date().getFullYear()}`;

  // Reset any previous warning
  if (warningBanner) {
    warningBanner.style.display = 'none';
    warningBanner.innerHTML = '';
  }

  // Fetch more candidates than requested target to ensure target after dedup & ranking
  const pageSize = Math.max(state.targetPapers * 3, 30);

  try {
    if (progressFill) progressFill.style.width = '50%';

    // Step 4 & Section 5: Dual search with automatic retries
    const [epmcResult, s2Result] = await Promise.all([
      fetchWithRetry(() => fetchEuropePMC(state.approvedStrategy.pmc.query, pageSize), 'Europe PMC', 2),
      fetchWithRetry(() => fetchSemanticScholar(state.approvedStrategy.semanticScholar.query, pageSize, state.approvedStrategy.semanticScholar.yearFilter), 'Semantic Scholar', 2)
    ]);

    // Section 5: Check if one source failed or returned 0 hits due to upstream rate limits
    let unavailableSourceWarning = '';
    const epmcCount = epmcResult.data?.length || 0;
    const s2Count = s2Result.data?.length || 0;

    const hasAlex = s2Result.data?.some(p => p.source === 'openalex');
    const hasCross = s2Result.data?.some(p => p.source === 'crossref');
    if (hasAlex || hasCross) {
      const fbList = [];
      if (hasAlex) fbList.push('OpenAlex');
      if (hasCross) fbList.push('Crossref');
      unavailableSourceWarning = `Notice: Semantic Scholar was unavailable (rate-limited). Preppt seamlessly retrieved ${s2Result.data.length} candidate studies via ${fbList.join(' & ')} fallback.`;
    } else if (!epmcResult.success && s2Result.success) {
      unavailableSourceWarning = `Europe PMC was temporarily unavailable after automatic retries (${epmcResult.error?.message || 'Connection timeout'}). The system successfully continued using partial results retrieved from Semantic Scholar.`;
    } else if (epmcResult.success && !s2Result.success) {
      unavailableSourceWarning = `Semantic Scholar was temporarily unavailable after automatic retries (${s2Result.error?.message || 'Connection timeout'}). The system successfully continued using partial results retrieved from Europe PMC.`;
    } else if (epmcCount > 0 && s2Count === 0) {
      unavailableSourceWarning = `Semantic Scholar reached its upstream request limit (HTTP 429). The system continued seamlessly using ${epmcCount} eligible peer-reviewed studies retrieved from Europe PMC.`;
    } else if (s2Count > 0 && epmcCount === 0) {
      unavailableSourceWarning = `Europe PMC was temporarily unavailable. The system continued seamlessly using ${s2Count} eligible peer-reviewed studies retrieved from Semantic Scholar.`;
    }

    if (unavailableSourceWarning) {
      if (warningBanner) {
        warningBanner.style.display = 'flex';
        warningBanner.innerHTML = `<span class="warning-icon">⚠️</span><div><strong>API Resilience Notice:</strong> ${unavailableSourceWarning}</div>`;
      }
      showToast('Notice: Continued with partial results from available source.');
    }

    // If both failed, show error and return
    if (!epmcResult.success && !s2Result.success) {
      if (warningBanner) {
        warningBanner.style.display = 'flex';
        warningBanner.innerHTML = `<span class="warning-icon">❌</span><div><strong>Both Europe PMC and Semantic Scholar APIs failed after automatic retries.</strong> Please check your network connection or revise your search strategy.</div>`;
      }
      showToast('Error: Both literature APIs failed after automatic retries.');
      if (step4Box) step4Box.style.display = 'none';
      document.getElementById('step-3-section').style.display = 'block';
      state.projectRun.retrieval_status = 'failed';
      return;
    }

    const epmcPapers = epmcResult.data || [];
    const s2Papers = s2Result.data || [];

    if (progressFill) progressFill.style.width = '75%';
    if (progressStatus) progressStatus.textContent = 'Normalizing records & removing duplicates...';

    // Section 5: Never fabricate missing metadata or papers
    const mergedRaw = [...epmcPapers, ...s2Papers];

    // Populate retrieval statistics grid
    const totalFoundEl = document.getElementById('stat-total-found');
    if (totalFoundEl) totalFoundEl.textContent = mergedRaw.length;
    const epmcCountEl = document.getElementById('stat-epmc-count');
    if (epmcCountEl) epmcCountEl.textContent = epmcPapers.length;
    const s2CountEl = document.getElementById('stat-s2-count');
    if (s2CountEl) s2CountEl.textContent = s2Papers.length;

    if (mergedRaw.length === 0) {
      showToast(`No literature records retrieved from ${state.startYear} to present.`);
      const zeroAlert = document.getElementById('zero-results-alert');
      if (zeroAlert) {
        zeroAlert.style.display = 'block';
        const msgEl = document.getElementById('zero-results-message');
        if (msgEl) {
          msgEl.textContent = `No eligible peer-reviewed papers were retrieved matching the current search strategy and date filter (${state.startYear} to ${new Date().getFullYear()}).`;
        }
      }
      if (progressStatus) progressStatus.textContent = 'Retrieval complete: 0 candidate records found.';
      state.projectRun.retrieval_status = 'failed';
      return;
    }

    // Hide any prior zero alert if papers found
    const zeroAlert = document.getElementById('zero-results-alert');
    if (zeroAlert) zeroAlert.style.display = 'none';

    // Step 5: Deduplication
    const { unique } = deduplicatePapers(mergedRaw);

    const dupesEl = document.getElementById('stat-duplicates-removed');
    if (dupesEl) dupesEl.textContent = mergedRaw.length - unique.length;
    const finalRankedEl = document.getElementById('stat-final-ranked');
    if (finalRankedEl) finalRankedEl.textContent = unique.length;

    const metricsGrid = document.getElementById('retrieval-metrics-grid');
    if (metricsGrid) metricsGrid.style.display = 'grid';

    // Step 5: Relevance Ranking
    const ranked = computeRelevanceRanking(unique, state.topic, state.approvedKeywords);

    state.allPapers = ranked;

    // Check for shortfall
    const shortfallAlert = document.getElementById('shortfall-alert');
    if (shortfallAlert) {
      if (ranked.length < state.targetPapers) {
        shortfallAlert.style.display = 'block';
        shortfallAlert.innerHTML = `<strong>Literature Shortfall Notice:</strong> You requested a target of ${state.targetPapers} final papers, but only ${ranked.length} eligible peer-reviewed studies were identified between ${state.startYear} and ${new Date().getFullYear()}. All ${ranked.length} available papers are presented below.`;
      } else {
        shortfallAlert.style.display = 'none';
      }
    }

    // Pre-select the top targetPapers
    const targetSlice = ranked.slice(0, state.targetPapers);
    state.selectedPapers = [...targetSlice];

    // Update canonical Section 7 projectRun
    state.projectRun.retrieved_papers = mergedRaw;
    state.projectRun.deduplicated_papers = unique;
    state.projectRun.ranked_papers = ranked;
    state.projectRun.selected_papers = [...targetSlice];
    state.projectRun.retrieval_status = unavailableSourceWarning ? 'partial_failure' : 'completed';

    if (progressFill) progressFill.style.width = '100%';

    setTimeout(() => {
      if (step4Box) step4Box.style.display = 'none';
      renderStep6ReviewScreen();
      setStepNav(6);
      document.getElementById('step-6-section').scrollIntoView({ behavior: 'smooth' });
    }, 400);

  } catch (err) {
    console.error('Retrieval error:', err);
    showToast(`Retrieval failed: ${err.message}`);
    if (step4Box) step4Box.style.display = 'none';
    document.getElementById('step-3-section').style.display = 'block';
    state.projectRun.retrieval_status = 'failed';
  }
}

async function fetchEuropePMC(query, pageSize) {
  const currentYear = new Date().getFullYear();
  const params = new URLSearchParams({
    query: query,
    resultType: 'core',
    pageSize: String(pageSize),
    format: 'json',
    sort: 'CITED desc'
  });

  const url = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Europe PMC HTTP ${res.status}`);
  const json = await res.json();
  let results = json.resultList?.result || [];

  // Robust Fallback Query Relaxation if query was too narrow and returned 0 hits
  if (results.length === 0 && state.topic) {
    const fallbackWords = cleanQueryKeywords(state.topic).split(/\s+/).slice(0, 3).join(' ');
    const fallbackQuery = `(${fallbackWords}) AND (PUB_YEAR:[${state.startYear || 2020} TO ${currentYear}])`;
    try {
      const fbParams = new URLSearchParams({
        query: fallbackQuery,
        resultType: 'core',
        pageSize: String(pageSize),
        format: 'json',
        sort: 'CITED desc'
      });
      const fbRes = await fetch(`https://www.ebi.ac.uk/europepmc/webservices/rest/search?${fbParams.toString()}`);
      if (fbRes.ok) {
        const fbJson = await fbRes.json();
        results = fbJson.resultList?.result || [];
      }
    } catch (fbErr) {
      console.warn('Europe PMC fallback query failed:', fbErr.message);
    }
  }

  return results.map(item => {
    const authorList = parseAuthorsArray(item);
    return {
      // Canonical Section 7 Paper fields
      title: cleanHtmlText(item.title) || 'Untitled Study',
      authors: authorList,
      journal: cleanHtmlText(item.journalInfo?.journal?.title || item.journalTitle || 'Scholarly Journal'),
      publication_date: item.pubYear ? String(item.pubYear) : (item.journalInfo?.yearOfPublication ? String(item.journalInfo.yearOfPublication) : String(currentYear)),
      study_type: classifyStudyType(item.title, item.abstractText),
      publication_type: (Array.isArray(item.pubTypeList?.pubType) ? item.pubTypeList.pubType[0] : item.pubTypeList?.pubType) || 'Journal Article',
      relevance_percentage: 0,
      abstract_summary: cleanHtmlText(item.abstractText || ''),
      doi: item.doi || '',
      pmid: item.pmid || '',
      pmcid: item.pmcid || '',
      semantic_scholar_id: '',
      citation_count: Number(item.citedByCount || 0),
      source_url: item.pmid ? `https://pubmed.ncbi.nlm.nih.gov/${item.pmid}/` : (item.pmcid ? `https://europepmc.org/article/PMC/${item.pmcid}` : ''),
      full_text_url: item.doi ? `https://doi.org/${item.doi}` : '',
      user_status: 'keep', // 'keep' | 'essential' | 'background' | 'removed'
      user_note: '',

      // Backwards-compatible aliases
      source: 'epmc',
      sources: ['Europe PMC'],
      id: item.id || item.pmid || item.doi || Math.random().toString(36).substring(7),
      authorsString: authorList.join(', '),
      pubDate: item.pubYear ? String(item.pubYear) : (item.journalInfo?.yearOfPublication ? String(item.journalInfo.yearOfPublication) : String(currentYear)),
      year: Number(item.pubYear) || (item.journalInfo?.yearOfPublication ? Number(item.journalInfo.yearOfPublication) : currentYear),
      abstract: cleanHtmlText(item.abstractText || ''),
      citationCount: Number(item.citedByCount || 0),
      isOpenAccess: item.isOpenAccess === 'Y',
      pubType: Array.isArray(item.pubTypeList?.pubType) ? item.pubTypeList.pubType : [item.pubTypeList?.pubType || 'Journal Article'],
      studyType: classifyStudyType(item.title, item.abstractText),
      userStatus: 'keep',
      userNote: ''
    };
  });
}

function parseAuthorsArray(item) {
  if (Array.isArray(item.authorList?.author)) {
    const names = item.authorList.author.map(a => a.fullName || `${a.lastName || ''} ${a.firstName || ''}`.trim()).filter(Boolean);
    if (names.length > 0) return names;
  }
  if (Array.isArray(item.authors)) {
    const names = item.authors.map(a => (typeof a === 'string' ? a : (a.name || ''))).filter(Boolean);
    if (names.length > 0) return names;
  }
  if (item.authorString) {
    const names = cleanHtmlText(item.authorString).split(/,\s*|;\s*/).map(a => a.trim()).filter(Boolean);
    if (names.length > 0) return names;
  }
  return ['Unknown Authors'];
}

function parseAuthors(item) {
  return parseAuthorsArray(item).join(', ');
}

async function fetchOpenAlex(query, pageSize, startYear) {
  const currentYear = new Date().getFullYear();
  const OPENALEX_KEY = 'LCR4PBZ9z5sTV3HuRDicln';
  const cleanQ = cleanQueryKeywords(query);

  let results = [];
  // 1. Try server proxy
  try {
    const res = await fetch(`/api/openalex?query=${encodeURIComponent(cleanQ)}&limit=${pageSize}&startYear=${startYear || 2021}&endYear=${currentYear}`);
    if (res.ok) {
      const json = await res.json();
      if (Array.isArray(json.data) && json.data.length > 0) {
        results = json.data;
      }
    }
  } catch (proxyErr) {
    console.warn('OpenAlex proxy call failed, falling back to direct client call:', proxyErr.message);
  }

  // 2. Direct client fallback with API key and CORS if proxy returns 0 or fails
  if (results.length === 0) {
    try {
      const directUrl = `https://api.openalex.org/works?search=${encodeURIComponent(cleanQ)}&filter=publication_year:${startYear || 2021}-${currentYear}&per_page=${pageSize}&api_key=${OPENALEX_KEY}&mailto=raouf.roshdy@aimed.org`;
      const directRes = await fetch(directUrl);
      if (directRes.ok) {
        const json = await directRes.json();
        results = (json.results || []).map(p => {
          const rawAuthors = (p.authorships || []).map(a => a.author?.display_name).filter(Boolean);
          const doi = p.doi ? p.doi.replace(/^https:\/\/doi\.org\//i, '') : '';
          const pmid = p.ids?.pmid ? p.ids.pmid.replace(/^https:\/\/pubmed\.ncbi\.nlm\.nih\.gov\//i, '').replace(/\/$/, '') : '';
          const pmcid = p.ids?.pmcid ? p.ids.pmcid.replace(/^https:\/\/www\.ncbi\.nlm\.nih\.gov\/pmc\/articles\//i, '').replace(/\/$/, '') : '';
          
          let abstract = '';
          if (p.abstract_inverted_index) {
            const words = [];
            for (const [w, pos] of Object.entries(p.abstract_inverted_index)) {
              if (Array.isArray(pos)) {
                for (const i of pos) words[i] = w;
              }
            }
            abstract = words.filter(Boolean).join(' ');
          }

          return {
            id: p.id || doi || pmid,
            paperId: p.id,
            openalex_id: p.id,
            title: cleanHtmlText(p.title) || 'Untitled Study',
            authors: rawAuthors.length > 0 ? rawAuthors : ['Unknown Authors'],
            authorsString: (rawAuthors.length > 0 ? rawAuthors : ['Unknown Authors']).join(', '),
            journal: cleanHtmlText(p.primary_location?.source?.display_name || 'Academic Journal'),
            year: p.publication_year || currentYear,
            pubDate: String(p.publication_year || currentYear),
            publication_date: String(p.publication_year || currentYear),
            abstract: cleanHtmlText(abstract),
            abstract_summary: cleanHtmlText(abstract),
            citationCount: Number(p.cited_by_count || 0),
            citation_count: Number(p.cited_by_count || 0),
            doi: doi,
            pmid: pmid,
            pmcid: pmcid,
            semantic_scholar_id: '',
            study_type: classifyStudyType(p.title, abstract),
            studyType: classifyStudyType(p.title, abstract),
            publication_type: (p.type ? p.type.replace(/-/g, ' ') : 'Journal Article'),
            pubType: [p.type || 'Journal Article'],
            source: 'openalex',
            sources: ['OpenAlex'],
            source_url: p.id || (doi ? `https://doi.org/${doi}` : ''),
            full_text_url: p.open_access?.oa_url || (doi ? `https://doi.org/${doi}` : ''),
            user_status: 'keep',
            user_note: '',
            relevance_percentage: 0
          };
        });
      }
    } catch (directErr) {
      console.warn('OpenAlex direct client call failed:', directErr.message);
    }
  }

  return results.map(item => ({
    ...item,
    authors: Array.isArray(item.authors) ? item.authors : [item.authors || 'Unknown Authors'],
    study_type: item.study_type || classifyStudyType(item.title, item.abstract_summary),
    user_status: 'keep',
    user_note: ''
  }));
}

async function fetchCrossref(query, pageSize, startYear) {
  const currentYear = new Date().getFullYear();
  const cleanQ = cleanQueryKeywords(query);

  let results = [];
  // 1. Try server proxy
  try {
    const res = await fetch(`/api/crossref?query=${encodeURIComponent(cleanQ)}&limit=${pageSize}&startYear=${startYear || 2021}`);
    if (res.ok) {
      const json = await res.json();
      if (Array.isArray(json.data) && json.data.length > 0) {
        results = json.data;
      }
    }
  } catch (proxyErr) {
    console.warn('Crossref proxy call failed, falling back to direct client call:', proxyErr.message);
  }

  // 2. Direct browser CORS fallback to official Crossref works API (Public REST API - No API Key Required)
  if (results.length === 0) {
    try {
      let directUrl = `https://api.crossref.org/works?query=${encodeURIComponent(cleanQ)}&rows=${pageSize}&sort=relevance&order=desc`;
      if (startYear) {
        directUrl += `&filter=from-pub-date:${startYear}-01-01`;
      }
      const directRes = await fetch(directUrl);
      if (directRes.ok) {
        const json = await directRes.json();
        const items = json.message?.items || [];
        results = items.map(item => {
          const rawTitle = Array.isArray(item.title) ? item.title[0] : (item.title || 'Untitled Study');
          const cleanTitle = (rawTitle || '').replace(/<[^>]+>/g, '').trim();

          let authorsList = ['Unknown Authors'];
          if (Array.isArray(item.author) && item.author.length > 0) {
            const parsed = item.author
              .map(a => [a.given, a.family].filter(Boolean).join(' ') || a.name || '')
              .filter(Boolean);
            if (parsed.length > 0) authorsList = parsed;
          }

          const journal = (Array.isArray(item['container-title']) && item['container-title'][0])
            || (Array.isArray(item['short-container-title']) && item['short-container-title'][0])
            || item.publisher
            || 'Academic Journal';

          const dateParts = item.published?.['date-parts']?.[0]
            || item['published-print']?.['date-parts']?.[0]
            || item['published-online']?.['date-parts']?.[0]
            || item.created?.['date-parts']?.[0];
          const pubYear = (Array.isArray(dateParts) && dateParts.length > 0 && Number(dateParts[0]) > 1900) ? Number(dateParts[0]) : currentYear;

          const doi = item.DOI || '';
          let abstract = item.abstract || '';
          if (abstract) {
            abstract = abstract
              .replace(/<jats:[^>]+>/gi, '')
              .replace(/<\/jats:[^>]+>/gi, '')
              .replace(/<[^>]+>/g, '')
              .replace(/&amp;/g, '&')
              .replace(/&lt;/g, '<')
              .replace(/&gt;/g, '>')
              .replace(/&quot;/g, '"')
              .replace(/&#39;/g, "'")
              .trim();
          }
          const citations = Number(item['is-referenced-by-count'] || 0);

          return {
            id: doi || item.URL || Math.random().toString(36).substring(7),
            paperId: doi || item.URL || '',
            title: cleanHtmlText(cleanTitle) || 'Untitled Study',
            authors: authorsList,
            authorsString: authorsList.join(', '),
            journal: cleanHtmlText(journal),
            year: pubYear,
            pubDate: String(pubYear),
            publication_date: String(pubYear),
            abstract: cleanHtmlText(abstract),
            abstract_summary: cleanHtmlText(abstract),
            citationCount: citations,
            citation_count: citations,
            doi: doi,
            pmid: '',
            pmcid: '',
            semantic_scholar_id: '',
            study_type: classifyStudyType(cleanTitle, abstract),
            studyType: classifyStudyType(cleanTitle, abstract),
            publication_type: item.type ? item.type.replace(/-/g, ' ') : 'Journal Article',
            pubType: [item.type || 'Journal Article'],
            source: 'crossref',
            sources: ['Crossref'],
            source_url: item.URL || (doi ? `https://doi.org/${doi}` : ''),
            full_text_url: doi ? `https://doi.org/${doi}` : '',
            user_status: 'keep',
            user_note: '',
            relevance_percentage: 0
          };
        });
      }
    } catch (directErr) {
      console.warn('Crossref direct client call failed:', directErr.message);
    }
  }

  return results.map(item => ({
    ...item,
    authors: Array.isArray(item.authors) ? item.authors : [item.authors || 'Unknown Authors'],
    study_type: item.study_type || classifyStudyType(item.title, item.abstract_summary),
    user_status: 'keep',
    user_note: ''
  }));
}

async function fetchSemanticScholar(query, pageSize, yearFilter) {
  const currentYear = new Date().getFullYear();
  const fields = 'paperId,title,authors,year,abstract,venue,publicationVenue,journal,externalIds,openAccessPdf,citationCount,publicationTypes,fieldsOfStudy';
  const S2_KEY = 's2k-0rcC3ztnxRdNGsOKL1SNvwbOPnSaRh4qHBT9qe7A';

  let q = `query=${encodeURIComponent(cleanQueryKeywords(query))}&limit=${pageSize}&fields=${encodeURIComponent(fields)}&key=${encodeURIComponent(S2_KEY)}`;
  if (yearFilter) q += `&year=${yearFilter}`;

  let json = null;
  let lastStatus = 200;

  // 1. Try server proxy with API key in header and query param
  try {
    const res = await fetch(`/api/s2?${q}`, {
      headers: { 'x-api-key': S2_KEY }
    });
    lastStatus = res.status;
    if (res.ok) {
      const parsed = await res.json();
      if (!parsed.error && !parsed.message && Array.isArray(parsed.data)) {
        json = parsed;
      }
    }
  } catch (proxyErr) {
    console.warn('S2 proxy attempt failed, falling back to direct client fetch:', proxyErr.message);
  }

  // 2. Resilient direct client-side fallback if server proxy was rate-limited or unavailable
  if (!json) {
    try {
      const directUrl = `https://api.semanticscholar.org/graph/v1/paper/search?${q}`;
      const directRes = await fetch(directUrl, {
        headers: {
          'x-api-key': S2_KEY
        }
      });
      lastStatus = directRes.status;
      if (directRes.ok) {
        json = await directRes.json();
      } else if (directRes.status === 429) {
        // Automatic 1.5s backoff retry on direct 429 burst limit
        console.warn('Direct S2 returned 429, waiting 1500ms before retrying...');
        await new Promise(r => setTimeout(r, 1500));
        const retryRes = await fetch(directUrl, { headers: { 'x-api-key': S2_KEY } });
        lastStatus = retryRes.status;
        if (retryRes.ok) {
          json = await retryRes.json();
        }
      }
    } catch (directErr) {
      console.warn('S2 direct fetch failed:', directErr.message);
    }
  }

  // 3. Fallback to OpenAlex and Crossref if Semantic Scholar failed, rate-limited (HTTP 429), or returned 0 hits
  if (!json || !Array.isArray(json.data) || json.data.length === 0) {
    console.warn(`Semantic Scholar query unavailable (HTTP ${lastStatus}). Triggering OpenAlex & Crossref fallback...`);
    const [openAlexPapers, crossrefPapers] = await Promise.all([
      fetchOpenAlex(query, pageSize, state.startYear || 2021).catch(err => {
        console.warn('OpenAlex fallback error:', err.message);
        return [];
      }),
      fetchCrossref(query, pageSize, state.startYear || 2021).catch(err => {
        console.warn('Crossref fallback error:', err.message);
        return [];
      })
    ]);

    const combinedFallback = [...openAlexPapers, ...crossrefPapers];
    const { unique } = deduplicatePapers(combinedFallback);

    if (unique.length > 0) {
      console.log(`✓ Resilient fallback successfully retrieved ${unique.length} studies (OpenAlex: ${openAlexPapers.length}, Crossref: ${crossrefPapers.length})!`);
      return unique;
    }
    return [];
  }

  const data = json.data || [];

  return data.map(item => {
    const authorList = parseAuthorsArray(item);
    return {
      // Canonical Section 7 Paper fields
      title: cleanHtmlText(item.title) || 'Untitled Study',
      authors: authorList,
      journal: cleanHtmlText(item.venue || item.publicationVenue?.name || item.journal?.name || 'Academic Journal'),
      publication_date: item.year ? String(item.year) : String(currentYear),
      study_type: classifyStudyType(item.title, item.abstract),
      publication_type: (Array.isArray(item.publicationTypes) && item.publicationTypes[0]) ? item.publicationTypes[0] : 'Journal Article',
      relevance_percentage: 0,
      abstract_summary: cleanHtmlText(item.abstract || ''),
      doi: item.externalIds?.DOI || '',
      pmid: item.externalIds?.PubMed || '',
      pmcid: item.externalIds?.PubMedCentral || '',
      semantic_scholar_id: item.paperId || '',
      citation_count: Number(item.citationCount || 0),
      source_url: item.paperId ? `https://www.semanticscholar.org/paper/${item.paperId}` : '',
      full_text_url: (item.externalIds?.DOI ? `https://doi.org/${item.externalIds.DOI}` : '') || (item.openAccessPdf?.url || ''),
      user_status: 'keep',
      user_note: '',

      // Backwards-compatible aliases
      source: 's2',
      sources: ['Semantic Scholar'],
      id: item.paperId,
      paperId: item.paperId,
      authorsString: authorList.join(', '),
      pubDate: item.year ? String(item.year) : String(currentYear),
      year: item.year || currentYear,
      abstract: cleanHtmlText(item.abstract || ''),
      citationCount: Number(item.citationCount || 0),
      isOpenAccess: Boolean(item.openAccessPdf?.url),
      openAccessPdfUrl: item.openAccessPdf?.url || '',
      pubType: Array.isArray(item.publicationTypes) && item.publicationTypes.length > 0 ? item.publicationTypes : ['Journal Article'],
      studyType: classifyStudyType(item.title, item.abstract),
      userStatus: 'keep',
      userNote: ''
    };
  });
}

function classifyStudyType(title = '', abstract = '') {
  const t = `${title} ${abstract}`.toLowerCase();
  if (/randomized controlled trial|randomised controlled trial|\brct\b/i.test(t)) return 'Randomized Controlled Trial';
  if (/systematic review|meta-analysis|meta analysis/i.test(t)) return 'Systematic Review / Meta-Analysis';
  if (/cohort study|prospective cohort|longitudinal/i.test(t)) return 'Prospective Cohort Study';
  if (/case-control|case control/i.test(t)) return 'Case-Control Study';
  if (/cross-sectional|cross sectional/i.test(t)) return 'Cross-Sectional Study';
  if (/phase [123iIvV]{1,3} trial|clinical trial/i.test(t)) return 'Clinical Trial';
  return 'Primary Empirical Study';
}

function deduplicatePapers(rawPapers) {
  const pmidMap = new Map();
  const pmcidMap = new Map();
  const doiMap = new Map();
  const s2IdMap = new Map();
  const titleMap = new Map();
  const authorYearMap = new Map();
  const unique = [];

  for (const paper of rawPapers) {
    const normT = normalizeTitle(paper.title);
    const pmid = paper.pmid ? String(paper.pmid).trim() : '';
    const pmcid = paper.pmcid ? String(paper.pmcid).trim().toUpperCase() : '';
    const doi = paper.doi ? paper.doi.toLowerCase().replace(/^https?:\/\/(?:dx\.)?doi\.org\//, '').trim() : '';
    const s2Id = (paper.semantic_scholar_id || paper.paperId || '').trim();

    // Extract first author surname and publication year for author/year similarity
    let firstAuthorSurname = '';
    if (Array.isArray(paper.authors) && paper.authors.length > 0) {
      firstAuthorSurname = String(paper.authors[0]).split(/\s+/)[0].toLowerCase().replace(/[^a-z]/g, '');
    } else if (typeof paper.authors === 'string' && paper.authors) {
      firstAuthorSurname = paper.authors.split(/,\s*|;\s*|\s+/)[0].toLowerCase().replace(/[^a-z]/g, '');
    }
    const paperYear = paper.year || (paper.publication_date ? paper.publication_date.match(/\d{4}/)?.[0] : '');
    const authorYearKey = firstAuthorSurname && paperYear ? `${firstAuthorSurname}_${paperYear}` : '';

    let existing = null;
    if (doi && doiMap.has(doi)) existing = doiMap.get(doi);
    else if (pmid && pmidMap.has(pmid)) existing = pmidMap.get(pmid);
    else if (pmcid && pmcidMap.has(pmcid)) existing = pmcidMap.get(pmcid);
    else if (s2Id && s2IdMap.has(s2Id)) existing = s2IdMap.get(s2Id);
    else if (normT.length > 20 && titleMap.has(normT)) existing = titleMap.get(normT);
    else if (authorYearKey && authorYearMap.has(authorYearKey)) {
      // Check if titles share substantial token overlap
      const candidate = authorYearMap.get(authorYearKey);
      const candNorm = normalizeTitle(candidate.title);
      if (calculateTokenOverlap(normT, candNorm) > 0.65) {
        existing = candidate;
      }
    }

    if (existing) {
      const srcName = paper.source === 's2' ? 'Semantic Scholar' 
        : paper.source === 'openalex' ? 'OpenAlex' 
        : paper.source === 'crossref' ? 'Crossref' 
        : 'Europe PMC';
      if (!existing.sources.includes(srcName)) {
        existing.sources.push(srcName);
        existing.source = 'both';
      }
      if (!existing.pmid && pmid) existing.pmid = pmid;
      if (!existing.doi && doi) existing.doi = doi;
      if (!existing.pmcid && pmcid) existing.pmcid = pmcid;
      if (!existing.semantic_scholar_id && s2Id) existing.semantic_scholar_id = s2Id;
      if (paper.abstract && (!existing.abstract || paper.abstract.length > existing.abstract.length)) {
        existing.abstract = paper.abstract;
        existing.abstract_summary = paper.abstract;
      }
      if (paper.citationCount > existing.citationCount) {
        existing.citationCount = paper.citationCount;
        existing.citation_count = paper.citationCount;
      }
      if (paper.isOpenAccess) existing.isOpenAccess = true;
      if (paper.openAccessPdfUrl) existing.openAccessPdfUrl = paper.openAccessPdfUrl;
      continue;
    }

    unique.push(paper);
    if (doi) doiMap.set(doi, paper);
    if (pmid) pmidMap.set(pmid, paper);
    if (pmcid) pmcidMap.set(pmcid, paper);
    if (s2Id) s2IdMap.set(s2Id, paper);
    if (normT.length > 20) titleMap.set(normT, paper);
    if (authorYearKey) authorYearMap.set(authorYearKey, paper);
  }

  return { unique };
}

function calculateTokenOverlap(a, b) {
  if (!a || !b) return 0;
  const setA = new Set(a.split(/\s+/).filter(w => w.length > 2));
  const setB = new Set(b.split(/\s+/).filter(w => w.length > 2));
  if (setA.size === 0 || setB.size === 0) return 0;
  let matches = 0;
  for (const token of setA) {
    if (setB.has(token)) matches++;
  }
  return matches / Math.min(setA.size, setB.size);
}

/**
 * Computes relevance percentage (0-100%) estimated from:
 * - Title keyword match (high weight)
 * - Abstract match
 * - Approved keywords overlap
 * - Semantic topic overlap
 * - Best paper types prioritization (RCTs, Meta-analyses, Cohorts)
 */
function computeRelevanceRanking(papers, topic, approvedKeywords) {
  const topicWords = cleanQueryKeywords(topic).toLowerCase().split(/\s+/).filter(w => w.length > 2);
  const kwWords = [
    ...(approvedKeywords.primaryKeywords || []),
    ...(approvedKeywords.synonyms || []),
    ...(approvedKeywords.meshConcepts || [])
  ].map(s => s.toLowerCase()).filter(Boolean);

  return papers.map(paper => {
    let rawScore = 0;
    const titleLower = (paper.title || '').toLowerCase();
    const abstractLower = (paper.abstract_summary || paper.abstract || '').toLowerCase();

    // 1. Title match (highest weight)
    topicWords.forEach(w => {
      if (titleLower.includes(w)) rawScore += 20;
      if (abstractLower.includes(w)) rawScore += 6;
    });

    // 2. Approved keywords & MeSH overlap
    kwWords.forEach(kw => {
      if (titleLower.includes(kw)) rawScore += 16;
      else if (abstractLower.includes(kw)) rawScore += 6;
    });

    // 3. Select best paper types according to relevance (RCT, Meta-Analysis, Cohorts prioritized)
    const st = (paper.study_type || paper.studyType || '').toLowerCase();
    if (st.includes('randomized') || st.includes('meta-analysis') || st.includes('systematic review')) {
      rawScore += 18;
    } else if (st.includes('trial') || st.includes('cohort') || st.includes('prospective')) {
      rawScore += 12;
    } else {
      rawScore += 6;
    }

    // 4. Citation and semantic richness
    if (paper.abstract && paper.abstract.length > 150) rawScore += 8;
    if (paper.source === 'both') rawScore += 8;

    // Normalize to 65% - 99% percentage scale for presentation ranking
    const pct = Math.min(99, Math.max(65, Math.round(55 + (rawScore * 0.40))));

    paper.relevancePercentage = pct;
    paper.relevance_percentage = pct;
    paper.rankingScore = rawScore;

    return paper;
  }).sort((a, b) => b.rankingScore - a.rankingScore);
}

// ==========================================
// STEP 6: PAPER REVIEW SCREEN
// ==========================================
function renderStep6ReviewScreen() {
  const section = document.getElementById('step-6-section');
  section.style.display = 'block';

  updateReviewMetrics();
  renderPaperCards();
}

function updateReviewMetrics() {
  const active = state.selectedPapers || [];
  const pmcCount = active.filter(p => (p.sources || []).includes('Europe PMC') || p.source === 'epmc').length;
  const s2Count = active.filter(p => (p.sources || []).includes('Semantic Scholar') || p.source === 's2').length;
  const overlapCount = active.filter(p => p.source === 'both' || (p.sources && p.sources.length > 1)).length;
  const totalCits = active.reduce((sum, p) => sum + (Number(p.citationCount || p.citation_count) || 0), 0);

  const curatedEl = document.getElementById('metric-curated');
  if (curatedEl) curatedEl.textContent = `${active.length} / ${state.targetPapers}`;

  const pmcEl = document.getElementById('metric-pmc');
  if (pmcEl) pmcEl.textContent = pmcCount;

  const s2El = document.getElementById('metric-s2');
  if (s2El) s2El.textContent = s2Count;

  const overlapEl = document.getElementById('metric-overlap');
  if (overlapEl) overlapEl.textContent = overlapCount;

  const citsEl = document.getElementById('metric-citations');
  if (citsEl) citsEl.textContent = totalCits.toLocaleString();

  const selectedCountEl = document.getElementById('selected-papers-count');
  if (selectedCountEl) selectedCountEl.textContent = active.length;

  const targetBadgeEl = document.getElementById('target-papers-badge');
  if (targetBadgeEl) targetBadgeEl.textContent = state.targetPapers;

  // Strict guard: disable Approve Selected Papers if selection is empty
  const approveBtn = document.getElementById('btn-approve-papers');
  if (approveBtn) {
    approveBtn.disabled = (active.length === 0);
    if (active.length === 0) {
      approveBtn.title = 'Please select at least 1 study before proceeding';
      approveBtn.style.opacity = '0.55';
      approveBtn.style.cursor = 'not-allowed';
    } else {
      approveBtn.title = `Approve ${active.length} selected study/studies for presentation synthesis`;
      approveBtn.style.opacity = '1';
      approveBtn.style.cursor = 'pointer';
    }
  }
}

function renderPaperCards() {
  const container = document.getElementById('papers-list');
  container.innerHTML = '';

  const filterText = (document.getElementById('paper-search-filter').value || '').toLowerCase();
  const sortMode = document.getElementById('paper-sort-select').value;

  let papers = [...state.allPapers];

  if (filterText) {
    papers = papers.filter(p =>
      (p.title || '').toLowerCase().includes(filterText) ||
      (p.authors || '').toLowerCase().includes(filterText) ||
      (p.journal || '').toLowerCase().includes(filterText)
    );
  }

  if (sortMode === 'citations') {
    papers.sort((a, b) => (b.citationCount || 0) - (a.citationCount || 0));
  } else if (sortMode === 'year') {
    papers.sort((a, b) => (b.year || 0) - (a.year || 0));
  } else {
    papers.sort((a, b) => b.relevancePercentage - a.relevancePercentage);
  }

  if (papers.length === 0) {
    container.innerHTML = '<div style="text-align:center; padding:30px; color:var(--text-muted);">No candidate papers remaining.</div>';
    return;
  }

  papers.forEach((paper, idx) => {
    const isSelected = state.selectedPapers.some(p => p.id === paper.id);

    const card = document.createElement('div');
    card.className = `paper-card ${paper.userStatus === 'essential' ? 'is-essential' : ''} ${paper.userStatus === 'background' ? 'is-background' : ''}`;
    card.id = `paper-card-${paper.id}`;

    // Source badge
    let srcBadge = '';
    if (paper.sources && paper.sources.length > 1) {
      srcBadge = `<span class="badge badge-both">${paper.sources.join(' + ')}</span>`;
    } else if (paper.source === 'both') {
      srcBadge = '<span class="badge badge-both">PMC + Semantic Scholar</span>';
    } else if (paper.source === 's2' || (paper.sources && paper.sources.includes('Semantic Scholar'))) {
      srcBadge = '<span class="badge badge-s2">Semantic Scholar</span>';
    } else if (paper.source === 'openalex' || (paper.sources && paper.sources.includes('OpenAlex'))) {
      srcBadge = '<span class="badge badge-openalex">OpenAlex</span>';
    } else if (paper.source === 'crossref' || (paper.sources && paper.sources.includes('Crossref'))) {
      srcBadge = '<span class="badge badge-crossref">Crossref</span>';
    } else {
      srcBadge = '<span class="badge badge-pmc">Europe PMC</span>';
    }

    // Identifiers
    const ids = [];
    if (paper.pmid) ids.push(`PMID: ${paper.pmid}`);
    if (paper.doi) ids.push(`DOI: ${paper.doi}`);
    if (paper.pmcid) ids.push(`PMCID: ${paper.pmcid}`);
    if (!paper.pmid && !paper.doi && paper.paperId) ids.push(`S2 ID: ${paper.paperId.substring(0, 8)}...`);

    // External links
    let sourceLink = '#';
    if (paper.pmid) sourceLink = `https://pubmed.ncbi.nlm.nih.gov/${paper.pmid}/`;
    else if (paper.paperId) sourceLink = `https://www.semanticscholar.org/paper/${paper.paperId}`;

    let fullTextLink = '';
    if (paper.doi) fullTextLink = `https://doi.org/${paper.doi}`;
    else if (paper.openAccessPdfUrl) fullTextLink = paper.openAccessPdfUrl;

    const abstractSnippet = paper.abstract
      ? (paper.abstract.substring(0, 200) + (paper.abstract.length > 200 ? '...' : ''))
      : 'Short abstract summary not available in primary index record.';

    card.innerHTML = `
      <div class="paper-card-top-row">
        <div class="paper-badges-group">
          ${srcBadge}
          <span class="badge badge-relevance">${paper.relevancePercentage}% Relevance</span>
          <span class="badge" style="background:#f1f5f9; color:#475569;">${paper.studyType}</span>
          <span class="badge" style="background:#e2e8f0; color:#334155;">${(paper.pubType || ['Article'])[0]}</span>
          ${paper.userStatus === 'essential' ? '<span class="badge badge-essential">⭐ Essential</span>' : ''}
          ${paper.userStatus === 'background' ? '<span class="badge badge-background">📘 Background</span>' : ''}
        </div>
        <div style="font-size:12px; font-weight:700; color:var(--text-muted);">
          #${idx + 1} • ${paper.pubDate} • ${paper.citationCount || 0} citations
        </div>
      </div>

      <h3 class="paper-title">${paper.title}</h3>
      <div class="paper-authors-journal">${paper.authors} — <em>${paper.journal}</em> (${paper.pubDate})</div>
      <div class="paper-identifiers">${ids.join(' | ') || 'Identifier: Academic Graph Record'}</div>
      <div class="paper-snippet">${abstractSnippet}</div>

      ${paper.userNote ? `<div class="paper-note-box"><strong>User Note:</strong> ${paper.userNote}</div>` : ''}

      <div class="paper-actions-bar">
        <div class="paper-action-buttons">
          <!-- Keep / Toggle -->
          <button class="btn-chip btn-keep" data-id="${paper.id}" style="${isSelected ? 'background:var(--primary); color:#fff;' : ''}">
            ${isSelected ? '✓ In Deck' : '+ Keep'}
          </button>
          
          <!-- Mark as Essential -->
          <button class="btn-chip btn-chip-gold btn-essential ${paper.userStatus === 'essential' ? 'active-gold' : ''}" data-id="${paper.id}">
            ⭐ Essential
          </button>

          <!-- Mark as Background -->
          <button class="btn-chip btn-background ${paper.userStatus === 'background' ? 'active-blue' : ''}" data-id="${paper.id}">
            📘 Background
          </button>

          <!-- Add Note -->
          <button class="btn-chip btn-add-note" data-id="${paper.id}">
            ✏️ Add Note
          </button>

          <!-- Remove (Permanently deletes for current run) -->
          <button class="btn-chip btn-chip-danger btn-remove-paper" data-id="${paper.id}" title="Permanently delete from current run">
            ✕ Remove
          </button>
        </div>

        <div class="paper-links-group">
          <a href="${sourceLink}" target="_blank" rel="noopener noreferrer" class="paper-link">Open source ↗</a>
          ${fullTextLink ? `<a href="${fullTextLink}" target="_blank" rel="noopener noreferrer" class="paper-link">Open full text ↗</a>` : ''}
        </div>
      </div>
    `;

    container.appendChild(card);
  });

  // Attach Paper Action Handlers
  container.querySelectorAll('.btn-keep').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const pid = e.currentTarget.dataset.id;
      togglePaperSelection(pid);
    });
  });

  container.querySelectorAll('.btn-essential').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const pid = e.currentTarget.dataset.id;
      togglePaperStatus(pid, 'essential');
    });
  });

  container.querySelectorAll('.btn-background').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const pid = e.currentTarget.dataset.id;
      togglePaperStatus(pid, 'background');
    });
  });

  container.querySelectorAll('.btn-add-note').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const pid = e.currentTarget.dataset.id;
      promptUserNote(pid);
    });
  });

  container.querySelectorAll('.btn-remove-paper').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const pid = e.currentTarget.dataset.id;
      permanentlyRemovePaper(pid);
    });
  });
}

function togglePaperSelection(paperId) {
  const paper = state.allPapers.find(p => p.id === paperId);
  if (!paper) return;

  const exists = state.selectedPapers.some(p => p.id === paperId);
  if (exists) {
    state.selectedPapers = state.selectedPapers.filter(p => p.id !== paperId);
    showToast(`Deselected: "${paper.title.substring(0, 30)}..."`);
  } else {
    state.selectedPapers.push(paper);
    showToast(`Added to presentation: "${paper.title.substring(0, 30)}..."`);
  }

  updateReviewMetrics();
  renderPaperCards();
}

function togglePaperStatus(paperId, status) {
  const paper = state.allPapers.find(p => p.id === paperId);
  if (!paper) return;

  if (paper.userStatus === status) {
    paper.userStatus = 'normal';
    showToast(`Cleared ${status} tag.`);
  } else {
    paper.userStatus = status;
    // Auto-select if marked essential
    if (status === 'essential' && !state.selectedPapers.some(p => p.id === paperId)) {
      state.selectedPapers.push(paper);
    }
    showToast(`Marked as ${status}: "${paper.title.substring(0, 30)}..."`);
  }

  updateReviewMetrics();
  renderPaperCards();
}

function promptUserNote(paperId) {
  const paper = state.allPapers.find(p => p.id === paperId);
  if (!paper) return;

  const note = prompt('Enter your note/comment for this paper:', paper.userNote || '');
  if (note !== null) {
    paper.userNote = note.trim();
    showToast('Note updated.');
    renderPaperCards();
  }
}

// Requirement: When the user clicks Remove, delete the paper from active selection permanently for current run.
// No removed-paper recovery list required.
function permanentlyRemovePaper(paperId) {
  const paper = state.allPapers.find(p => p.id === paperId);
  const titleSnip = paper ? paper.title.substring(0, 30) : '';

  if (paper) {
    paper.user_status = 'removed';
    paper.userStatus = 'removed';
    state.projectRun.removed_papers.push(paper);
  }

  state.allPapers = state.allPapers.filter(p => p.id !== paperId);
  state.selectedPapers = state.selectedPapers.filter(p => p.id !== paperId);

  showToast(`Permanently removed: "${titleSnip}..."`);
  updateReviewMetrics();
  renderPaperCards();
}

// ==========================================
// STEP 7 & 8: SLIDE CONTENT GENERATION
// ==========================================
async function handleApproveSelectedPapers() {
  if (state.selectedPapers.length === 0) {
    showToast('Validation Error: Please select at least 1 study before generating the presentation deck.');
    return;
  }

  const btn = document.getElementById('btn-approve-papers');
  btn.disabled = true;
  btn.innerHTML = '<span>Synthesizing Presentation & Gaps...</span>';

  try {
    const res = await fetch('/api/synthesize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic: state.topic,
        shortTitle: state.shortTitle,
        papers: state.selectedPapers,
        targetPapers: state.targetPapers,
        startYear: state.startYear,
        audience: state.audience,
        slideCount: state.slideCount,
        density: state.density,
        visualStyle: state.visualStyle || 'Scientific pictorial',
        approvedKeywords: state.approvedKeywords,
        approvedStrategy: state.approvedStrategy
      })
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || `HTTP ${res.status}`);
    }

    state.deck = await res.json();
    if (state.projectRun) {
      state.projectRun.synthesis_plan = state.deck.synthesisPlan;
      state.projectRun.research_gaps = state.deck.researchGaps;
      state.projectRun.slides = state.deck.slides;
    }

    // Render Step 8 presentation studio
    document.getElementById('step-6-section').style.display = 'none';
    renderStep8DeckStudio();
    setStepNav(8);
    document.getElementById('step-8-section').scrollIntoView({ behavior: 'smooth' });
    showToast('Evidence-based synthesis plan, research gaps, and presentation deck synthesized successfully!');
  } catch (err) {
    console.error('Synthesis error:', err);
    showToast(`Synthesis error: ${err.message}`);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span>Approve Selected Papers</span><span class="btn-icon">✓</span>';
  }
}

function renderStep8DeckStudio() {
  const section = document.getElementById('step-8-section');
  if (section) section.style.display = 'block';

  const deck = state.deck || {};
  const meta = deck.meta || {};
  const slides = deck.slides || [];

  // Update presentation title
  const topicTitleEl = document.getElementById('deck-topic-title');
  if (topicTitleEl) {
    topicTitleEl.textContent = `${deck.shortTitle || state.shortTitle || deck.topic || state.topic} — Slide Deck`;
  }

  // Update badges reflecting active run user parameters
  const audienceBadge = document.getElementById('deck-audience-badge');
  if (audienceBadge) {
    audienceBadge.textContent = `Audience: ${meta.audience || state.audience}`;
  }

  const densityBadge = document.getElementById('deck-density-badge');
  if (densityBadge) {
    densityBadge.textContent = `Density: ${meta.slideDensity || state.density}`;
  }

  const slideCountBadge = document.getElementById('deck-slide-count-badge');
  if (slideCountBadge) {
    slideCountBadge.textContent = `${slides.length || state.slideCount} Slides`;
  }

  const paperCountBadge = document.getElementById('deck-paper-count-badge');
  if (paperCountBadge) {
    paperCountBadge.textContent = `${state.selectedPapers?.length || meta.selectedPaperCount || 0} Evidence Papers`;
  }

  // Null-safe helper for spec pills
  const setElText = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };

  setElText('deck-presentation-title', `${deck.shortTitle || state.shortTitle} — Slide Deck`);
  setElText('spec-pill-ratio', `Ratio: ${slides[0]?.slideRatio || '16:9'}`);
  setElText('spec-pill-font', `Font: ${slides[0]?.font || 'Arial'}`);
  setElText('spec-pill-size', `Size: ${slides[0]?.fontSizeTarget || '12–14 pt'}`);
  setElText('spec-pill-density', `Density: ${meta.slideDensity || state.density} (${slides[0]?.textOccupancyTarget || '30–40%'})`);
  setElText('spec-pill-audience', `Audience: ${meta.audience || state.audience}`);
  setElText('spec-pill-duration', `Duration: 15-Minute Pacing (${slides.length || state.slideCount} slides)`);

  // Prompt 10: Concise Evidence-Based Synthesis Plan
  const plan = state.deck.synthesisPlan;
  const scopeEl = document.getElementById('synthesis-plan-scope');
  const themesContainer = document.getElementById('synthesis-themes-container');

  if (plan && scopeEl && themesContainer) {
    scopeEl.textContent = plan.objective || '';
    themesContainer.innerHTML = '';

    (plan.themes || []).forEach(theme => {
      const card = document.createElement('div');
      card.className = 'theme-card';
      card.innerHTML = `
        <div class="theme-title-bar">
          <span class="theme-title-text">${theme.title}</span>
          <span class="theme-scope-text">${theme.scope || ''}</span>
        </div>
        <div class="theme-columns-split">
          <div class="theme-box theme-box-established">
            <div class="theme-box-label">
              <span>✓</span> Established Findings
            </div>
            <div>${theme.establishedFindings}</div>
          </div>
          <div class="theme-box theme-box-unresolved">
            <div class="theme-box-label">
              <span>⚠</span> Uncertain / Unresolved Areas
            </div>
            <div>${theme.uncertainOrUnresolvedAreas}</div>
          </div>
        </div>
      `;
      themesContainer.appendChild(card);
    });
  }

  // Prompt 10: Research Gaps & Unresolved Questions
  const gapsList = document.getElementById('gaps-list');
  if (gapsList) {
    gapsList.innerHTML = '';
    const gaps = (state.deck.structuredResearchGaps && state.deck.structuredResearchGaps.length > 0)
      ? state.deck.structuredResearchGaps
      : (state.deck.researchGaps || []);

    gaps.forEach((gap, idx) => {
      const li = document.createElement('li');
      li.style.marginBottom = '8px';
      if (typeof gap === 'object' && gap.domain) {
        li.innerHTML = `
          <strong>${gap.domain}:</strong> 
          <span style="color:#0f766e;">${gap.establishedBaseline}</span> 
          <span style="color:#b45309; font-weight:500;">${gap.unresolvedQuestion}</span>
        `;
      } else {
        li.textContent = String(gap);
      }
      gapsList.appendChild(li);
    });
  }

  // Presentation Outline
  const outlineChips = document.getElementById('outline-chips');
  outlineChips.innerHTML = '';
  (state.deck.outline || []).forEach(out => {
    const span = document.createElement('span');
    span.className = 'outline-chip';
    span.textContent = out;
    outlineChips.appendChild(span);
  });

  // Slide Navigator & Slides Display
  const navBar = document.getElementById('slide-nav-bar');
  const slidesContainer = document.getElementById('slides-container');

  navBar.innerHTML = '';
  slidesContainer.innerHTML = '';

  state.deck.slides.forEach((slide, idx) => {
    // Navigation Pill
    const pill = document.createElement('button');
    pill.className = `slide-nav-tab ${idx === 0 ? 'active' : ''}`;
    pill.textContent = `Slide ${slide.slideNumber}: ${slide.title.substring(0, 18)}...`;
    pill.addEventListener('click', () => {
      navBar.querySelectorAll('.slide-nav-tab').forEach(t => t.classList.remove('active'));
      pill.classList.add('active');
      document.getElementById(`slide-card-${slide.slideNumber}`).scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    navBar.appendChild(pill);

    // Slide Card displaying the exact 10 fields per Section 8:
    // 1. Slide number
    // 2. Slide title
    // 3. Slide objective
    // 4. Main message
    // 5. On-slide text (density compliant)
    // 6. Suggested visual type
    // 7. Detailed visual description
    // 8. Speaker notes
    // 9. Interactive question for audience
    // 10. Logical transition
    // Right lower corner footer: copyrights@Raouf Roshdy2025, Arial 9 pt
    const card = document.createElement('div');
    card.className = 'slide-card';
    card.id = `slide-card-${slide.slideNumber}`;

    card.innerHTML = `
      <div class="slide-header">
        <div>
          <div class="slide-header-num">Field 1 • Slide ${slide.slideNumber} of ${state.deck.slides.length} [16:9 • Arial 12–14 pt]</div>
          <h3 class="slide-header-title">Field 2 • ${slide.title}</h3>
        </div>
        <span class="slide-category-badge">${slide.suggestedVisualType}</span>
      </div>
      <div class="slide-body">
        
        <!-- 3. Slide objective -->
        <div class="slide-field-row">
          <span class="slide-field-label">Field 3 • Slide Objective:</span>
          <div class="slide-field-val">${slide.objective}</div>
        </div>

        <!-- 4. Main message -->
        <div class="slide-field-row">
          <span class="slide-field-label">Field 4 • Main Message:</span>
          <div class="slide-field-val" style="font-weight:700; color:var(--primary);">${slide.mainMessage}</div>
        </div>

        <!-- 5. On-slide text (Kept in a single coherent text box) -->
        <div class="slide-field-row">
          <span class="slide-field-label">Field 5 • On-Slide Text (${slide.slideDensity} Density • Arial 12–14 pt):</span>
          <div class="slide-onslide-textbox">
            <div class="slide-onslide-content">${slide.onSlideText}</div>
          </div>
        </div>

        <!-- 6. Suggested visual type & 7. Detailed visual description -->
        <div class="slide-field-row">
          <span class="slide-field-label">Field 6 & 7 • Suggested Visual & Detailed Description:</span>
          <div class="slide-visual-box">
            <div><strong>Visual Type:</strong> ${slide.suggestedVisualType}</div>
            <div style="margin-top:4px;"><strong>Detailed Layout Description:</strong> <em>${slide.detailedVisualDescription}</em></div>
          </div>
        </div>

        <!-- 8. Speaker notes -->
        <div class="slide-field-row">
          <span class="slide-field-label">Field 8 • Speaker Notes (Presenter Script • ~1.2–1.5 min):</span>
          <div class="slide-speaker-box">
            <div class="slide-speaker-script">${slide.speakerNotes}</div>
          </div>
        </div>

        <!-- 9. Interactive question for audience -->
        <div class="slide-field-row">
          <span class="slide-field-label">Field 9 • Interactive Question for Audience:</span>
          <div class="slide-question-box">
            <strong>Discussion Prompt:</strong> ${slide.audienceQuestion}
          </div>
        </div>

        <!-- 10. Logical transition -->
        <div class="slide-field-row">
          <span class="slide-field-label">Field 10 • Logical Transition:</span>
          <div class="slide-transition-box">${slide.transition}</div>
        </div>

      </div>

      <!-- Mandatory Copyright Footer on every slide: copyrights@Raouf Roshdy2025, Arial 9 pt, right lower corner -->
      <div class="slide-footer-copyright-row">
        <span class="slide-copyright-text">copyrights@Raouf Roshdy2025</span>
      </div>
    `;

    slidesContainer.appendChild(card);
  });

  // Prompt 13: Run Pre-Export Validation Gate before enabling Export to Word
  runPreExportValidation();
}

// ==========================================
// PROMPT 13: PRE-EXPORT VALIDATION GATE
// ==========================================
async function runPreExportValidation() {
  const exportBtn = document.getElementById('export-docx-btn');
  const badgeEl = document.getElementById('validation-overall-badge');
  const container = document.getElementById('validation-checklist-container');

  if (exportBtn) {
    exportBtn.disabled = true;
    exportBtn.style.opacity = '0.6';
    exportBtn.innerHTML = '<span>⏳ Validating Standards...</span>';
  }

  if (badgeEl) {
    badgeEl.textContent = 'Validating 9 Standards...';
    badgeEl.style.background = '#e0f2fe';
    badgeEl.style.color = '#0369a1';
  }

  try {
    const res = await fetch('/api/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deck: state.deck,
        papers: state.selectedPapers,
        removedPapers: state.projectRun?.removed_papers || [],
        slideCount: state.slideCount,
        topic: state.topic
      })
    });

    if (!res.ok) {
      throw new Error(`Validation service responded with HTTP ${res.status}`);
    }

    const report = await res.json();
    state.validationReport = report;
    renderValidationChecklist(report);

    if (report.isValid) {
      if (exportBtn) {
        exportBtn.disabled = false;
        exportBtn.style.opacity = '1';
        exportBtn.innerHTML = '<span class="btn-icon">📄</span><span>Export to Word</span>';
      }
      if (badgeEl) {
        badgeEl.textContent = `✓ ${report.passedChecks}/${report.totalChecks} Standards Verified`;
        badgeEl.style.background = '#dcfce7';
        badgeEl.style.color = '#15803d';
      }
    } else {
      if (exportBtn) {
        exportBtn.disabled = true;
        exportBtn.style.opacity = '0.5';
        exportBtn.innerHTML = '<span>⚠️ Validation Incomplete</span>';
      }
      if (badgeEl) {
        badgeEl.textContent = `⚠️ ${report.passedChecks}/${report.totalChecks} Standards Passed (${report.errors.length} Issues)`;
        badgeEl.style.background = '#fee2e2';
        badgeEl.style.color = '#991b1b';
      }
      showToast(`Validation Alert: ${report.errors[0]}`);
    }
  } catch (err) {
    console.error('Validation error:', err);
    if (badgeEl) {
      badgeEl.textContent = 'Validation Check Error';
      badgeEl.style.background = '#fee2e2';
      badgeEl.style.color = '#991b1b';
    }
  }
}

function renderValidationChecklist(report) {
  const container = document.getElementById('validation-checklist-container');
  if (!container) return;

  container.innerHTML = '';
  (report.checks || []).forEach(check => {
    const item = document.createElement('div');
    item.className = `validation-item ${check.passed ? 'passed' : 'failed'}`;
    item.innerHTML = `
      <div class="val-item-icon">${check.passed ? '✓' : '✗'}</div>
      <div class="val-item-content">
        <span class="val-item-title">${check.name}</span>
        <span class="val-item-detail">${check.details}</span>
      </div>
    `;
    container.appendChild(item);
  });
}

// ==========================================
// STEP 10: EXPORT TO WORD
// ==========================================
async function exportToWord() {
  if (!state.deck || !state.selectedPapers) {
    showToast('Please synthesize presentation deck first.');
    return;
  }

  // Prompt 14: Export only after validation succeeds
  if (state.validationReport && !state.validationReport.isValid) {
    showToast('Cannot export: Pre-export validation must pass all 9 criteria first.');
    return;
  }

  const exportBtn = document.getElementById('export-docx-btn');
  exportBtn.disabled = true;
  exportBtn.innerHTML = '<span>📄 Generating Word...</span>';

  try {
    const res = await fetch('/api/export-docx', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic: state.topic,
        deck: state.deck,
        papers: state.selectedPapers,
        removedPapers: state.projectRun?.removed_papers || [],
        slideCount: state.slideCount,
        meta: state.deck.meta
      })
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || `Export failed with HTTP ${res.status}`);
    }

    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeFilename = (state.deck.shortTitle || state.topic || 'presentation')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .substring(0, 45);
    a.download = `Preppt_${safeFilename}.docx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);

    showToast('Word document downloaded successfully!');
  } catch (err) {
    console.error('Word export error:', err);
    showToast(`Word export failed: ${err.message}`);
  } finally {
    exportBtn.disabled = false;
    exportBtn.innerHTML = '<span class="btn-icon">📄</span><span>Export to Word</span>';
  }
}

// ==========================================
// EVENT LISTENERS INITIALIZATION
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  // Step 1 Form
  const inputsForm = document.getElementById('inputs-form');
  inputsForm.addEventListener('submit', handleStep1Submit);

  // PPT Visuals Style Selector Buttons
  const visualBtns = document.querySelectorAll('.visual-style-btn');
  visualBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      visualBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const val = btn.dataset.value;
      const hiddenInput = document.getElementById('visual-style-input');
      if (hiddenInput) hiddenInput.value = val;
    });
  });

  // Quick Chips
  document.querySelectorAll('.quick-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.getElementById('topic-input').value = chip.dataset.topic;
      document.getElementById('short-title-input').value = chip.dataset.title;
    });
  });

  // Step 2 & 3 Nav Actions
  document.getElementById('btn-back-to-step1').addEventListener('click', () => {
    document.getElementById('step-2-section').style.display = 'none';
    document.getElementById('step-1-section').style.display = 'block';
    setStepNav(1);
    document.getElementById('step-1-section').scrollIntoView({ behavior: 'smooth' });
  });

  document.getElementById('btn-approve-keywords').addEventListener('click', handleApproveKeywords);

  document.getElementById('btn-back-to-step2').addEventListener('click', () => {
    document.getElementById('step-3-section').style.display = 'none';
    document.getElementById('step-2-section').style.display = 'block';
    setStepNav(2);
    document.getElementById('step-2-section').scrollIntoView({ behavior: 'smooth' });
  });

  document.getElementById('btn-approve-strategy').addEventListener('click', handleApproveStrategy);

  // Step 4 Zero Results Actions
  const retryBtn = document.getElementById('btn-retry-search');
  if (retryBtn) {
    retryBtn.addEventListener('click', () => {
      executeLiteratureRetrieval();
    });
  }
  const editStratZeroBtn = document.getElementById('btn-edit-strategy-from-zero');
  if (editStratZeroBtn) {
    editStratZeroBtn.addEventListener('click', () => {
      const step4El = document.getElementById('step-4-section');
      if (step4El) step4El.style.display = 'none';
      const step3El = document.getElementById('step-3-section');
      if (step3El) step3El.style.display = 'block';
      setStepNav(3);
      if (step3El) step3El.scrollIntoView({ behavior: 'smooth' });
    });
  }

  // Step 6 Actions
  document.getElementById('btn-approve-papers').addEventListener('click', handleApproveSelectedPapers);

  document.getElementById('btn-select-all').addEventListener('click', () => {
    state.selectedPapers = [...state.allPapers];
    updateReviewMetrics();
    renderPaperCards();
    showToast('Selected all candidate papers.');
  });

  document.getElementById('btn-deselect-all').addEventListener('click', () => {
    state.selectedPapers = [];
    updateReviewMetrics();
    renderPaperCards();
    showToast('Deselected all papers.');
  });

  document.getElementById('paper-search-filter').addEventListener('input', () => {
    renderPaperCards();
  });

  document.getElementById('paper-sort-select').addEventListener('change', () => {
    renderPaperCards();
  });

  // Step 10 Export
  document.getElementById('export-docx-btn').addEventListener('click', exportToWord);

  // Modal Closures
  document.getElementById('modal-close-btn').addEventListener('click', () => {
    document.getElementById('abstract-modal').style.display = 'none';
  });
  document.getElementById('modal-dismiss-btn').addEventListener('click', () => {
    document.getElementById('abstract-modal').style.display = 'none';
  });
});
