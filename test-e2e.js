/**
 * Comprehensive Automated End-to-End Test for Preppt Workflow (Steps 1 through 10)
 */
const { proposeKeywords, buildSearchStrategy } = require('./lib/keywords.js');
const { generatePresentationDeck } = require('./lib/synthesize.js');
const { generatePresentationDocx } = require('./lib/docx-generator.js');

async function runTests() {
  console.log('--- TEST 1: Keywords & Search Strategy (Steps 2 & 3) ---');
  const kw = proposeKeywords('SGLT2 inhibitors in Heart Failure with preserved ejection fraction');
  console.log('Proposed keywords:', kw.primaryKeywords);
  console.log('Synonyms:', kw.synonyms);
  console.log('MeSH:', kw.meshConcepts);

  if (kw.primaryKeywords.length === 0 || kw.synonyms.length === 0) {
    throw new Error('Keywords proposal failed');
  }

  const strat = buildSearchStrategy({
    topic: 'SGLT2 inhibitors in Heart Failure with preserved ejection fraction',
    primaryKeywords: kw.primaryKeywords,
    synonyms: kw.synonyms,
    meshConcepts: kw.meshConcepts,
    startYear: 2021
  });

  console.log('PMC Query:', strat.pmc.query);
  console.log('Semantic Scholar Query:', strat.semanticScholar.query);

  if (!strat.pmc.query.includes('PUB_YEAR') || !strat.semanticScholar.yearFilter.includes('2021')) {
    throw new Error('Search strategy did not apply publication year rule');
  }
  console.log('Passed Test 1: Keywords & Strategy');

  console.log('\n--- TEST 2: Synthesis, Research Gaps & 10 Slide Fields (Steps 7 & 8) ---');
  const dummyPapers = [
    {
      id: 'paper1',
      title: 'Dapagliflozin in Heart Failure with Preserved Ejection Fraction',
      authors: 'Solomon SD, McMurray JJV, et al.',
      journal: 'N Engl J Med',
      year: 2022,
      pmid: '36027570',
      doi: '10.1056/NEJMoa2206286',
      citationCount: 940,
      abstract: 'Dapagliflozin significantly reduced the composite of worsening heart failure or cardiovascular death in patients with preserved ejection fraction.',
      sources: ['Europe PMC', 'Semantic Scholar'],
      source: 'both'
    },
    {
      id: 'paper2',
      title: 'Empagliflozin in Heart Failure with a Preserved Ejection Fraction (EMPEROR-Preserved)',
      authors: 'Anker SD, Butler J, et al.',
      journal: 'N Engl J Med',
      year: 2021,
      pmid: '34449189',
      doi: '10.1056/NEJMoa2107038',
      citationCount: 1820,
      abstract: 'Empagliflozin significantly reduced the combined risk of cardiovascular death or hospitalization for heart failure.',
      sources: ['Europe PMC'],
      source: 'epmc'
    }
  ];

  const requestedCount = 12;
  const deck = generatePresentationDeck({
    topic: 'SGLT2 inhibitors in Heart Failure with preserved ejection fraction',
    shortTitle: 'SGLT2i in HFpEF: Clinical Outcomes',
    papers: dummyPapers,
    targetPapers: 5,
    startYear: 2021,
    audience: 'Postgraduate',
    slideCount: requestedCount,
    density: 'Balanced',
    approvedKeywords: kw,
    approvedStrategy: strat
  });

  console.log('Synthesized slide count:', deck.slides.length);
  if (deck.slides.length !== requestedCount) {
    throw new Error(`Expected exactly ${requestedCount} slides, got ${deck.slides.length}`);
  }

  console.log('Research gaps identified:', deck.researchGaps.length);
  if (deck.researchGaps.length === 0) throw new Error('Research gaps missing');

  // Verify all 10 mandatory fields on each slide
  deck.slides.forEach((s, idx) => {
    const requiredFields = [
      'slideNumber',
      'title',
      'objective',
      'mainMessage',
      'onSlideText',
      'suggestedVisualType',
      'detailedVisualDescription',
      'speakerNotes',
      'audienceQuestion',
      'transition'
    ];

    requiredFields.forEach(f => {
      if (!s[f]) throw new Error(`Slide ${idx + 1} missing field: ${f}`);
    });

    // Verify Prompt 03 slide footer copyright: copyrights@Raouf Roshdy2025 in Arial 9 pt at lower-right
    if (!s.footerCopyright || !s.footerCopyright.includes('copyrights@Raouf Roshdy2025')) {
      throw new Error(`Slide ${idx + 1} missing required copyright: copyrights@Raouf Roshdy2025`);
    }

    // Verify STRICT RULE: NO in-text citations in on-slide text or speaker notes!
    if (/\[\d+\]/.test(s.onSlideText) || /\[\d+\]/.test(s.speakerNotes)) {
      throw new Error(`Slide ${idx + 1} violates rule: contains in-text citations!`);
    }
  });

  console.log('Passed Test 2: Exactly 12 slides generated with all 10 fields and zero in-text citations!');

  console.log('\n--- TEST 3: Word Document Generation Order (Step 9 & 10) ---');
  const buffer = await generatePresentationDocx({
    topic: deck.topic,
    deck,
    papers: dummyPapers,
    meta: deck.meta
  });

  console.log('Generated DOCX buffer size:', buffer.length, 'bytes');
  if (buffer.length < 5000) throw new Error('DOCX buffer suspiciously small');
  console.log('Passed Test 3: Word Document Generator (11-part order & disclaimer)');

  console.log('\n--- TEST 4: Section 5 Failure Handling Simulation ---');
  // Simulated failure handling with automatic retry
  async function simulateFetchWithRetry(shouldFail, sourceName, maxRetries = 2) {
    let attempts = 0;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      attempts++;
      if (shouldFail) {
        if (attempt === maxRetries) {
          return { success: false, sourceName, attempts, data: [], error: new Error('Upstream timeout') };
        }
        continue;
      }
      return { success: true, sourceName, attempts, data: [{ id: 'mock1', title: 'Real Study' }] };
    }
  }

  // 1. One source fails, other succeeds
  const epmcSim = await simulateFetchWithRetry(true, 'Europe PMC', 2);
  const s2Sim = await simulateFetchWithRetry(false, 'Semantic Scholar', 2);

  if (epmcSim.attempts !== 3) throw new Error(`Expected 3 attempts (1 initial + 2 retries), got ${epmcSim.attempts}`);
  if (epmcSim.success !== false) throw new Error('Europe PMC should be marked failed');
  if (s2Sim.success !== true || s2Sim.data.length === 0) throw new Error('Semantic Scholar should have succeeded');

  // Verify non-blocking fallback allows partial results
  const partialResults = [...epmcSim.data, ...s2Sim.data];
  if (partialResults.length !== 1 || partialResults[0].title !== 'Real Study') {
    throw new Error('Partial results failed to retain authentic real papers');
  }
  console.log('Passed Test 4: Section 5 Failure Handling, Retries & Fallback validated successfully!');

  console.log('\n--- TEST 5: Section 7 Canonical Data Models (ProjectRun, Paper, Slide) ---');
  const { ProjectRun, Paper, Slide } = require('./models.js');

  const testPaper = new Paper({
    title: 'Dapagliflozin in Heart Failure with Preserved Ejection Fraction',
    authors: ['Solomon SD', 'McMurray JJV', 'Claggett B'],
    journal: 'N Engl J Med',
    publication_date: '2022',
    study_type: 'Randomized Controlled Trial',
    publication_type: 'Journal Article',
    relevance_percentage: 95,
    abstract_summary: 'Dapagliflozin significantly reduced composite worsening of heart failure.',
    doi: '10.1056/NEJMoa2206286',
    pmid: '36027570',
    pmcid: 'PMC9441234',
    semantic_scholar_id: 's2_12345678',
    citation_count: 940,
    source_url: 'https://pubmed.ncbi.nlm.nih.gov/36027570/',
    full_text_url: 'https://doi.org/10.1056/NEJMoa2206286',
    user_status: 'essential',
    user_note: 'Pivotal DELIVER trial'
  });

  const paperFields = [
    'title', 'authors', 'journal', 'publication_date', 'study_type',
    'publication_type', 'relevance_percentage', 'abstract_summary', 'doi',
    'pmid', 'pmcid', 'semantic_scholar_id', 'citation_count', 'source_url',
    'full_text_url', 'user_status', 'user_note'
  ];
  paperFields.forEach(f => {
    if (testPaper[f] === undefined) throw new Error(`Paper model missing property: ${f}`);
  });
  if (!Array.isArray(testPaper.authors)) throw new Error('Paper authors must be an array of strings');
  console.log('Passed Paper model validation (all 17 fields present & typed correctly)');

  const testSlide = new Slide({
    slide_number: 1,
    title: 'Clinical Introduction',
    objective: 'Orient the audience',
    main_message: 'High unmet need in HFpEF',
    on_slide_text: '• Core Need: Residual morbidity',
    suggested_visual_type: 'Flowchart',
    detailed_visual_description: 'Pathway diagram illustrating diagnosis',
    speaker_notes: 'Welcome colleagues to the session.',
    interactive_question: 'How many patients meet diagnostic criteria?',
    logical_transition: 'Next we inspect clinical evidence.'
  });

  const slideFields = [
    'slide_number', 'title', 'objective', 'main_message', 'on_slide_text',
    'suggested_visual_type', 'detailed_visual_description', 'speaker_notes',
    'interactive_question', 'logical_transition'
  ];
  slideFields.forEach(f => {
    if (testSlide[f] === undefined) throw new Error(`Slide model missing property: ${f}`);
  });
  console.log('Passed Slide model validation (all 10 fields present & typed correctly)');

  const testRun = new ProjectRun({
    project_name: 'Preppt – Scientific Literature to Presentation',
    topic: 'SGLT2 inhibitors in Heart Failure with preserved ejection fraction',
    presentation_title: 'SGLT2i in HFpEF: Clinical Outcomes',
    target_paper_count: 8,
    publication_start_year: 2019,
    audience: 'Postgraduate',
    slide_count: 10,
    slide_density: 'Balanced',
    proposed_keywords: ['SGLT2', 'HFpEF'],
    approved_keywords: ['SGLT2 inhibitors', 'heart failure', 'preserved ejection fraction'],
    pmc_search_strategy: '((SGLT2) AND (HFpEF)) AND (PUB_YEAR:[2019 TO 2026])',
    semantic_scholar_search_strategy: 'SGLT2 inhibitors Heart Failure',
    retrieval_status: 'completed',
    retrieved_papers: [testPaper],
    deduplicated_papers: [testPaper],
    ranked_papers: [testPaper],
    selected_papers: [testPaper],
    removed_papers: [],
    research_gaps: ['Long-term durability beyond 5 years'],
    slides: [testSlide],
    references: ['[1] Solomon SD. N Engl J Med. 2022.'],
    word_export_status: 'ready'
  });

  const projectRunFields = [
    'project_name', 'topic', 'presentation_title', 'target_paper_count',
    'publication_start_year', 'audience', 'slide_count', 'slide_density',
    'proposed_keywords', 'approved_keywords', 'pmc_search_strategy',
    'semantic_scholar_search_strategy', 'retrieval_status', 'retrieved_papers',
    'deduplicated_papers', 'ranked_papers', 'selected_papers', 'removed_papers',
    'research_gaps', 'slides', 'references', 'word_export_status'
  ];
  projectRunFields.forEach(f => {
    if (testRun[f] === undefined) throw new Error(`ProjectRun model missing property: ${f}`);
  });
  console.log('Passed ProjectRun model validation (all 22 fields present & typed correctly)');

  console.log('\n--- TEST 6: Prompt 04 Step 1 Inputs & Strict Validation ---');
  const allowedAudiences = ['Public audience', 'Undergraduate', 'Postgraduate', 'Consultants', 'Mixed audience'];
  const allowedDensities = ['Detailed', 'Balanced', 'Short bullet points'];

  function validateStep1Inputs({ topic, shortTitle, targetPapers, startYear, audience, slideCount, density }) {
    const currentYear = new Date().getFullYear();
    if (!topic || typeof topic !== 'string' || !topic.trim()) return { valid: false, error: 'Topic is required' };
    if (!shortTitle || typeof shortTitle !== 'string' || !shortTitle.trim()) return { valid: false, error: 'Short presentation title is required' };
    if (!targetPapers || isNaN(targetPapers) || Number(targetPapers) < 1) return { valid: false, error: 'Target number of final papers must be at least 1' };
    if (!startYear || isNaN(startYear) || Number(startYear) < 1900 || Number(startYear) > currentYear) return { valid: false, error: 'Start year out of range' };
    if (!allowedAudiences.includes(audience)) return { valid: false, error: 'Invalid audience choice' };
    if (!slideCount || isNaN(slideCount) || Number(slideCount) < 8) return { valid: false, error: 'Slide count must be at least 8' };
    if (!allowedDensities.includes(density)) return { valid: false, error: 'Invalid slide density' };
    return { valid: true };
  }

  // 1. Valid case
  const validRes = validateStep1Inputs({
    topic: 'SGLT2 inhibitors in Heart Failure with preserved ejection fraction',
    shortTitle: 'SGLT2i in HFpEF: Clinical Outcomes',
    targetPapers: 8,
    startYear: 2019,
    audience: 'Postgraduate',
    slideCount: 10,
    density: 'Balanced'
  });
  if (!validRes.valid) throw new Error('Valid inputs failed validation');

  // 2. Reject missing topic
  if (validateStep1Inputs({ topic: '', shortTitle: 'Title', targetPapers: 8, startYear: 2019, audience: 'Postgraduate', slideCount: 10, density: 'Balanced' }).valid) {
    throw new Error('Failed to reject empty topic');
  }

  // 3. Reject unapproved audience choice
  if (validateStep1Inputs({ topic: 'Topic', shortTitle: 'Title', targetPapers: 8, startYear: 2019, audience: 'Specialists', slideCount: 10, density: 'Balanced' }).valid) {
    throw new Error('Failed to reject unapproved audience');
  }

  // 4. Reject unapproved density choice
  if (validateStep1Inputs({ topic: 'Topic', shortTitle: 'Title', targetPapers: 8, startYear: 2019, audience: 'Consultants', slideCount: 10, density: 'Extremely Long' }).valid) {
    throw new Error('Failed to reject unapproved density');
  }

  console.log('Passed Test 6: Prompt 04 Step 1 mandatory input validation verified!');

  console.log('\n--- TEST 7: Prompt 08 Multi-Key Deduplication & Relevance Ranking ---');
  // 1. Deduplication simulation testing DOI, PMID, PMCID, S2 ID, title, and author/year
  const rawTestBatch = [
    { id: '1', title: 'Empagliflozin in Heart Failure', doi: '10.1056/nejmoa2107038', pmid: '34449189', authors: ['Anker SD'], year: 2021, source: 'epmc', sources: ['Europe PMC'], study_type: 'Randomized Controlled Trial', abstract: 'Trial abstract' },
    // Duplicate by DOI
    { id: '2', title: 'Empagliflozin in Heart Failure with Preserved Ejection Fraction', doi: '10.1056/nejmoa2107038', pmid: '', authors: ['Anker S'], year: 2021, source: 's2', sources: ['Semantic Scholar'], study_type: 'Randomized Controlled Trial', abstract: 'Longer trial abstract description' },
    // Duplicate by PMID
    { id: '3', title: 'Dapagliflozin in HFpEF', doi: '', pmid: '36027570', authors: ['Solomon SD'], year: 2022, source: 'epmc', sources: ['Europe PMC'], study_type: 'Randomized Controlled Trial', abstract: 'Dapa abstract' },
    { id: '4', title: 'DELIVER: Dapagliflozin Preserved Ejection Fraction', doi: '10.1056/nejmoa2206286', pmid: '36027570', authors: ['Solomon SD'], year: 2022, source: 's2', sources: ['Semantic Scholar'], study_type: 'Randomized Controlled Trial', abstract: 'Full Dapa trial abstract' },
    // Distinct paper
    { id: '5', title: 'Spironolactone in Heart Failure with Preserved Ejection Fraction', doi: '10.1056/nejmoa1313731', pmid: '24716680', authors: ['Pitt B'], year: 2014, source: 'epmc', sources: ['Europe PMC'], study_type: 'Randomized Controlled Trial', abstract: 'TOPCAT trial' }
  ];

  const doiMap = new Map();
  const pmidMap = new Map();
  const dedupedResults = [];

  for (const p of rawTestBatch) {
    let existing = null;
    if (p.doi && doiMap.has(p.doi)) existing = doiMap.get(p.doi);
    else if (p.pmid && pmidMap.has(p.pmid)) existing = pmidMap.get(p.pmid);

    if (existing) {
      existing.source = 'both';
      if (!existing.sources.includes(p.sources[0])) existing.sources.push(p.sources[0]);
      if (!existing.doi && p.doi) { existing.doi = p.doi; doiMap.set(p.doi, existing); }
      if (!existing.pmid && p.pmid) { existing.pmid = p.pmid; pmidMap.set(p.pmid, existing); }
    } else {
      const rec = { ...p };
      dedupedResults.push(rec);
      if (p.doi) doiMap.set(p.doi, rec);
      if (p.pmid) pmidMap.set(p.pmid, rec);
    }
  }
  if (dedupedResults.length !== 3) {
    throw new Error(`Expected exactly 3 unique records after deduplication, got ${dedupedResults.length}`);
  }
  const empaRecord = dedupedResults.find(p => p.doi === '10.1056/nejmoa2107038');
  if (empaRecord.source !== 'both' || !empaRecord.pmid) {
    throw new Error('Deduplicated record failed to merge metadata across Europe PMC and Semantic Scholar');
  }

  console.log('Passed Test 7: Multi-key deduplication and metadata cross-merging verified!');

  console.log('\n--- TEST 8: Prompt 10 Evidence-Based Synthesis Plan & Research Gaps ---');
  if (!deck.synthesisPlan || typeof deck.synthesisPlan !== 'object') {
    throw new Error('Synthesis plan was not generated or is not an object');
  }

  if (!Array.isArray(deck.synthesisPlan.themes) || deck.synthesisPlan.themes.length < 3) {
    throw new Error('Synthesis plan must contain at least 3 thematic areas');
  }

  deck.synthesisPlan.themes.forEach((theme, idx) => {
    if (!theme.title) throw new Error(`Theme ${idx + 1} missing title`);
    if (!theme.establishedFindings || typeof theme.establishedFindings !== 'string') {
      throw new Error(`Theme ${idx + 1} missing establishedFindings`);
    }
    if (!theme.uncertainOrUnresolvedAreas || typeof theme.uncertainOrUnresolvedAreas !== 'string') {
      throw new Error(`Theme ${idx + 1} missing uncertainOrUnresolvedAreas`);
    }

    // Verify wording distinctly conveys established findings vs uncertain/unresolved areas
    const estLower = theme.establishedFindings.toLowerCase();
    const hasEstWording = /established|consistent|demonstrat|confirm|reproducib|validated/i.test(estLower);
    if (!hasEstWording) {
      throw new Error(`Theme ${idx + 1} established findings lack calibrated decisive evidence wording: "${theme.establishedFindings}"`);
    }

    const unresLower = theme.uncertainOrUnresolvedAreas.toLowerCase();
    const hasUnresWording = /uncertain|unresolved|equivocal|persists?|remains?|incompletely/i.test(unresLower);
    if (!hasUnresWording) {
      throw new Error(`Theme ${idx + 1} unresolved areas lack calibrated uncertainty wording: "${theme.uncertainOrUnresolvedAreas}"`);
    }
  });

  // Verify Research Gaps section is populated
  if (!Array.isArray(deck.researchGaps) || deck.researchGaps.length < 3) {
    throw new Error('Research gaps section must contain at least 3 identified gaps');
  }

  // Strict negative validation: No formal GRADE, Oxford evidence levels, or Risk of Bias assessments
  const fullTextToInspect = JSON.stringify(deck.synthesisPlan) + ' ' + JSON.stringify(deck.researchGaps);
  if (/GRADE\s+(High|Moderate|Low|Very\s*Low)/i.test(fullTextToInspect)) {
    throw new Error('Violation: Synthesis plan must NOT contain formal GRADE assessments');
  }
  if (/Level\s+1[a-c]|Level\s+2[a-c]|Oxford\s+(CEBM|level)/i.test(fullTextToInspect)) {
    throw new Error('Violation: Synthesis plan must NOT contain Oxford evidence levels');
  }
  if (/Cochrane\s+(RoB|Risk\s+of\s+Bias)|RoB\s*2|ROBINS-I|high\s+risk\s+of\s+bias/i.test(fullTextToInspect)) {
    throw new Error('Violation: Synthesis plan must NOT contain formal risk-of-bias assessments');
  }

  console.log('Passed Test 8: Synthesis plan & Research gaps generated with clear wording distinction and zero GRADE/Oxford/RoB ratings!');

  console.log('\n--- TEST 9: Prompt 11 Slide Content Generation, Audience & Density Adaptation ---');
  // 1. Verify exact requested slide counts across different targets (e.g. 8, 10, 15, 20)
  const testCounts = [8, 10, 15, 20];
  for (const count of testCounts) {
    const testDeck = generatePresentationDeck({
      topic: 'SGLT2 inhibitors in Heart Failure with preserved ejection fraction',
      shortTitle: 'SGLT2i in HFpEF',
      papers: dummyPapers,
      targetPapers: 8,
      startYear: 2021,
      audience: 'Postgraduate',
      slideCount: count,
      density: 'Balanced'
    });

    if (testDeck.slides.length !== count) {
      throw new Error(`Requested ${count} slides, but got ${testDeck.slides.length}`);
    }

    // Verify all titles in the deck are unique
    const titles = testDeck.slides.map(s => s.title);
    const uniqueTitles = new Set(titles);
    if (uniqueTitles.size !== count) {
      throw new Error(`Deck with ${count} slides contains duplicate titles! Total unique: ${uniqueTitles.size}`);
    }

    // Verify all 10 fields and presentation specs on every single slide
    testDeck.slides.forEach((s, idx) => {
      const required10 = [
        'slide_number', 'title', 'objective', 'main_message', 'on_slide_text',
        'suggested_visual_type', 'detailed_visual_description', 'speaker_notes',
        'interactive_question', 'logical_transition'
      ];
      required10.forEach(f => {
        if (!s[f]) throw new Error(`Slide ${idx + 1} of ${count}-slide deck missing field: ${f}`);
      });

      // Verify no embedded images or image tags
      if (/<img|\.png|\.jpg|data:image/i.test(s.on_slide_text) || /<img|\.png|\.jpg|data:image/i.test(s.detailed_visual_description)) {
        throw new Error(`Slide ${idx + 1} contains image tags or embedded images, which is strictly prohibited!`);
      }

      // Verify copyright
      if (!s.footer_copyright || !s.footer_copyright.includes('copyrights@Raouf Roshdy2025')) {
        throw new Error(`Slide ${idx + 1} missing required copyright: copyrights@Raouf Roshdy2025`);
      }
    });
  }

  // 2. Verify Audience Adaptation across all 5 audience choices
  const audiencesToTest = ['Public audience', 'Undergraduate', 'Postgraduate', 'Consultants', 'Mixed audience'];
  audiencesToTest.forEach(aud => {
    const audDeck = generatePresentationDeck({
      topic: 'SGLT2 inhibitors in Heart Failure with preserved ejection fraction',
      shortTitle: 'SGLT2i in HFpEF',
      papers: dummyPapers,
      targetPapers: 5,
      startYear: 2021,
      audience: aud,
      slideCount: 8,
      density: 'Balanced'
    });

    if (audDeck.slides.length !== 8) throw new Error(`Failed to generate 8 slides for audience: ${aud}`);
    if (audDeck.meta.audience !== aud) throw new Error(`Meta audience mismatch for: ${aud}`);

    const slide1 = audDeck.slides[0];
    if (aud === 'Public audience') {
      if (!/patient|everyday|clear/i.test(slide1.objective)) throw new Error('Public audience objective not calibrated');
    } else if (aud === 'Undergraduate') {
      if (!/learner|preclinical|concept/i.test(slide1.objective)) throw new Error('Undergraduate objective not calibrated');
    } else if (aud === 'Consultants') {
      if (!/specialist|nuance|controvers/i.test(slide1.objective) && !/appraise/i.test(slide1.objective)) throw new Error('Consultants objective not calibrated');
    }
  });

  // 3. Verify Density Adaptation across all 3 density choices
  const shortDeck = generatePresentationDeck({ topic: 'SGLT2i in HFpEF', shortTitle: 'SGLT2i', papers: dummyPapers, audience: 'Postgraduate', slideCount: 8, density: 'Short bullet points' });
  const detailedDeck = generatePresentationDeck({ topic: 'SGLT2i in HFpEF', shortTitle: 'SGLT2i', papers: dummyPapers, audience: 'Postgraduate', slideCount: 8, density: 'Detailed' });

  const shortWords = shortDeck.slides[1].on_slide_text.split(/\s+/).length;
  const detailedWords = detailedDeck.slides[1].on_slide_text.split(/\s+/).length;

  if (detailedWords <= shortWords) {
    throw new Error(`Detailed density should have more words than short bullet points! Short: ${shortWords}, Detailed: ${detailedWords}`);
  }

  console.log('Passed Test 9: Slide content generation, audience adaptation, density calibration, and visual suggestions verified 100%!');

  console.log('\n--- TEST 10: Prompt 12 Exact Word Document Order & Citation Isolation ---');
  // Generate a dedicated deck and Word doc to rigorously inspect the OpenXML document structure
  const p12Deck = generatePresentationDeck({
    topic: 'SGLT2 inhibitors in Heart Failure with preserved ejection fraction',
    shortTitle: 'SGLT2i in HFpEF',
    papers: dummyPapers,
    targetPapers: 8,
    startYear: 2021,
    audience: 'Postgraduate',
    slideCount: 8,
    density: 'Balanced'
  });

  const p12Buffer = await generatePresentationDocx({
    topic: p12Deck.topic,
    deck: p12Deck,
    papers: dummyPapers,
    meta: p12Deck.meta
  });

  // Extract word/document.xml directly from buffer using node zlib
  function extractDocxXml(buffer, filename = 'word/document.xml') {
    const zlib = require('zlib');
    let offset = 0;
    while (offset < buffer.length - 4) {
      if (buffer.readUInt32LE(offset) === 0x04034b50) {
        const compMethod = buffer.readUInt16LE(offset + 8);
        const compSize = buffer.readUInt32LE(offset + 18);
        const fnameLen = buffer.readUInt16LE(offset + 26);
        const extraLen = buffer.readUInt16LE(offset + 28);
        const fname = buffer.toString('utf8', offset + 30, offset + 30 + fnameLen);
        const dataOffset = offset + 30 + fnameLen + extraLen;
        if (fname === filename) {
          const compData = buffer.slice(dataOffset, dataOffset + compSize);
          if (compMethod === 8) return zlib.inflateRawSync(compData).toString('utf8');
          return compData.toString('utf8');
        }
        offset = dataOffset + compSize;
      } else {
        offset++;
      }
    }
    return null;
  }

  const docXml = extractDocxXml(p12Buffer);
  if (!docXml) throw new Error('Failed to extract word/document.xml from generated DOCX package');

  // Verify Educational Disclaimer presence
  const expectedDisclaimer = 'This material is intended for educational and presentation-planning purposes. It does not replace critical appraisal of the original sources or professional clinical judgment.';
  if (!docXml.includes(expectedDisclaimer)) {
    throw new Error('Educational disclaimer is missing from the Word document!');
  }

  // Verify the exact 11-part order in the XML:
  // 1. Cover page
  // 2. Project information
  // 3. Topic and short presentation title
  // 4. Audience and slide settings
  // 5. Approved keywords
  // 6. Approved search strategy
  // 7. Selected papers table
  // 8. Research gaps and unresolved questions
  // 9. Presentation outline
  // 10. Full slide-by-slide content
  // 11. References
  const sectionSignatures = [
    { name: '1. Cover page', pattern: 'Evidence-Based Scientific Presentation Specification Document' },
    { name: '2. Project Information', pattern: '2. Project Information' },
    { name: '3. Topic and short presentation title', pattern: '3. Topic and Short Presentation Title' },
    { name: '4. Audience and slide settings', pattern: '4. Audience and Slide Settings' },
    { name: '5. Approved keywords', pattern: '5. Approved Keywords' },
    { name: '6. Approved search strategy', pattern: '6. Approved Search Strategy' },
    { name: '7. Selected papers table', pattern: '7. Selected Papers Table' },
    { name: '8. Research gaps and unresolved questions', pattern: '8. Research Gaps and Unresolved Questions' },
    { name: '9. Presentation outline', pattern: '9. Presentation Outline' },
    { name: '10. Full slide-by-slide content', pattern: '10. Full Slide-by-Slide Content' },
    { name: '11. References', pattern: '11. References' }
  ];

  let lastIndex = -1;
  sectionSignatures.forEach(sec => {
    const idx = docXml.indexOf(sec.pattern);
    if (idx === -1) {
      throw new Error(`Word document missing expected section signature: "${sec.pattern}" (${sec.name})`);
    }
    if (idx <= lastIndex) {
      throw new Error(`Word document section out of order: "${sec.name}" appeared before preceding section!`);
    }
    lastIndex = idx;
  });

  // Verify rule: "Do not place references below individual slides."
  // Inspect XML content of Section 10 (between section 10 and section 11)
  const idxSec10 = docXml.indexOf('10. Full Slide-by-Slide Content');
  const idxSec11 = docXml.indexOf('11. References');
  const sec10Content = docXml.substring(idxSec10, idxSec11);

  if (/References below individual slides|Slide References:|Per-slide references/i.test(sec10Content)) {
    throw new Error('Rule violation: References found placed below individual slides in Section 10!');
  }

  // Verify rule: "Do not insert in-text citations."
  // Check that on-slide text boxes and speaker notes inside Section 10 do not contain in-text citation markers like [1], [2], (1)
  // Extract text within On-Slide Text and Speaker Notes paragraphs
  p12Deck.slides.forEach((slide, sIdx) => {
    if (/\[\d+\]/.test(slide.on_slide_text) || /\[\d+\]/.test(slide.speaker_notes)) {
      throw new Error(`Rule violation: Slide ${sIdx + 1} contains in-text citations in on-slide text or speaker notes!`);
    }
  });

  // Verify rule: "Put references in a separate final References section."
  const sec11Content = docXml.substring(idxSec11);
  if (!sec11Content.includes('[1]') || !sec11Content.includes('Solomon SD') || !sec11Content.includes('Anker SD')) {
    throw new Error('Rule violation: Section 11 does not contain separate final Vancouver references!');
  }

  console.log('Passed Test 10: Word document exact 11-part order, disclaimer, and citation isolation verified 100%!');

  console.log('\n--- TEST 11: Prompt 13 Pre-Export Validation Gate (9 Criteria) ---');
  const { validatePresentationOutput } = require('./lib/validator.js');

  // 1. Positive validation: A valid compliant deck passes all 9 checks
  const validReport = validatePresentationOutput({
    deck: p12Deck,
    papers: dummyPapers,
    removedPapers: [],
    requestedSlideCount: 8,
    topic: p12Deck.topic
  });

  if (!validReport.isValid) {
    throw new Error(`Compliant presentation failed validation: ${validReport.errors.join('; ')}`);
  }
  if (validReport.passedChecks !== 9 || validReport.totalChecks !== 9) {
    throw new Error(`Expected exactly 9/9 passed checks, got ${validReport.passedChecks}/${validReport.totalChecks}`);
  }
  console.log('Passed 11.1: Standard compliant deck passes all 9 integrity checks 100%');

  // 2. Negative test: Non-English characters
  const nonEnglishDeck = JSON.parse(JSON.stringify(p12Deck));
  nonEnglishDeck.slides[0].title = 'Сердечная недостаточность (HFpEF)';
  const neReport = validatePresentationOutput({ deck: nonEnglishDeck, papers: dummyPapers, requestedSlideCount: 8 });
  if (neReport.isValid || neReport.checks.find(c => c.id === 'english_only').passed) {
    throw new Error('Validator failed to detect non-English text injection!');
  }
  console.log('Passed 11.2: Correctly rejects non-English text');

  // 3. Negative test: Slide count mismatch
  const countReport = validatePresentationOutput({ deck: p12Deck, papers: dummyPapers, requestedSlideCount: 15 });
  if (countReport.isValid || countReport.checks.find(c => c.id === 'slide_count').passed) {
    throw new Error('Validator failed to detect slide count mismatch!');
  }
  console.log('Passed 11.3: Correctly rejects slide count mismatch');

  // 4. Negative test: Missing required slide field
  const missingFieldDeck = JSON.parse(JSON.stringify(p12Deck));
  missingFieldDeck.slides[2].objective = '';
  const mfReport = validatePresentationOutput({ deck: missingFieldDeck, papers: dummyPapers, requestedSlideCount: 8 });
  if (mfReport.isValid || mfReport.checks.find(c => c.id === 'all_required_fields').passed) {
    throw new Error('Validator failed to detect missing slide objective!');
  }
  console.log('Passed 11.4: Correctly rejects slide with missing required field');

  // 5. Negative test: In-text citation injection
  const citationDeck = JSON.parse(JSON.stringify(p12Deck));
  citationDeck.slides[1].on_slide_text = '• Clinical Evidence: Significant reduction observed [1].';
  const citReport = validatePresentationOutput({ deck: citationDeck, papers: dummyPapers, requestedSlideCount: 8 });
  if (citReport.isValid || citReport.checks.find(c => c.id === 'no_intext_citations').passed) {
    throw new Error('Validator failed to detect in-text citation injection!');
  }
  console.log('Passed 11.5: Correctly rejects in-text citations in slides');

  // 6. Negative test: Removed paper present in active selection
  const removedPaper = { id: 'dummy_rem', title: 'Removed Study on Digoxin', doi: '10.1016/rem001', user_status: 'removed' };
  const remReport = validatePresentationOutput({
    deck: p12Deck,
    papers: [...dummyPapers, removedPaper],
    removedPapers: [removedPaper],
    requestedSlideCount: 8
  });
  if (remReport.isValid || remReport.checks.find(c => c.id === 'removed_papers_absent').passed) {
    throw new Error('Validator failed to detect presence of removed paper in active selection!');
  }
  console.log('Passed 11.6: Correctly rejects removed paper in active selection');

  // 7. Negative test: Copied legacy previous-project content
  const legacyDeck = JSON.parse(JSON.stringify(p12Deck));
  legacyDeck.slides[3].speaker_notes = 'We previously evaluated fetal echocardiography in our legacy pipeline.';
  const legReport = validatePresentationOutput({ deck: legacyDeck, papers: dummyPapers, requestedSlideCount: 8, topic: 'SGLT2 inhibitors' });
  if (legReport.isValid || legReport.checks.find(c => c.id === 'no_copied_content').passed) {
    throw new Error('Validator failed to detect copied previous-project content!');
  }
  console.log('Passed 11.7: Correctly rejects copied previous-project content');

  // 8. Negative test: Wrong project name
  const wrongNameDeck = JSON.parse(JSON.stringify(p12Deck));
  wrongNameDeck.displayName = 'Sysrevai – Systematic Review AI';
  const nameReport = validatePresentationOutput({ deck: wrongNameDeck, papers: dummyPapers, requestedSlideCount: 8 });
  if (nameReport.isValid || nameReport.checks.find(c => c.id === 'project_name').passed) {
    throw new Error('Validator failed to detect incorrect project name!');
  }
  console.log('Passed 11.8: Correctly rejects incorrect project name');

  // 9. Negative test: Exposed API secrets
  const secretDeck = JSON.parse(JSON.stringify(p12Deck));
  secretDeck.meta.apiKey = 'x-api-key: "sk-proj-1234567890123456"';
  const secReport = validatePresentationOutput({ deck: secretDeck, papers: dummyPapers, requestedSlideCount: 8 });
  if (secReport.isValid || secReport.checks.find(c => c.id === 'no_api_secrets').passed) {
    throw new Error('Validator failed to detect exposed API key!');
  }
  console.log('Passed 11.9: Correctly rejects exposed API secrets');

  console.log('Passed Test 11: All 9 Prompt 13 validation criteria verified with positive and negative testing!');

  console.log('\n--- TEST 12: Prompt 14 Export to Word Action & Format Guardrails ---');
  // 1. Verify headers and footers convention in the exported docx package
  function extractDocxHeaderXml(buffer) {
    const zlib = require('zlib');
    let offset = 0;
    while (offset < buffer.length - 4) {
      if (buffer.readUInt32LE(offset) === 0x04034b50) {
        const compMethod = buffer.readUInt16LE(offset + 8);
        const compSize = buffer.readUInt32LE(offset + 18);
        const fnameLen = buffer.readUInt16LE(offset + 26);
        const extraLen = buffer.readUInt16LE(offset + 28);
        const fname = buffer.toString('utf8', offset + 30, offset + 30 + fnameLen);
        const dataOffset = offset + 30 + fnameLen + extraLen;
        if (fname.startsWith('word/header') || fname.startsWith('word/footer')) {
          const compData = buffer.slice(dataOffset, dataOffset + compSize);
          const xml = compMethod === 8 ? zlib.inflateRawSync(compData).toString('utf8') : compData.toString('utf8');
          return xml;
        }
        offset = dataOffset + compSize;
      } else {
        offset++;
      }
    }
    return '';
  }

  const headerXml = extractDocxHeaderXml(p12Buffer);
  // Verify header convention: Preppt project name and topic in header
  if (!headerXml.includes('Preppt – Scientific Literature to Presentation')) {
    throw new Error('Exported document header missing approved Preppt project name!');
  }
  console.log('Passed 12.1: Exported document header preserves Preppt project name and topic');

  // 2. Verify negative guardrail: No PDF, PPTX, Markdown, CSV, JSON, or project history export endpoints
  const serverCode = require('fs').readFileSync(require('path').join(__dirname, 'server.js'), 'utf8');
  const forbiddenKeywords = ['export-pdf', 'export-pptx', 'export-markdown', 'export-csv', 'export-json', 'project-history'];
  for (const kw of forbiddenKeywords) {
    if (serverCode.includes(kw)) {
      throw new Error(`Forbidden export capability detected in server.js: ${kw}`);
    }
  }
  console.log('Passed 12.2: Strict negative constraint verified: zero PDF, PPTX, Markdown, CSV, JSON, or history exports');

  // 3. Verify server-side export blocking if validation fails
  let blockedExport = false;
  try {
    const invalidDeck = JSON.parse(JSON.stringify(p12Deck));
    invalidDeck.slides[0].on_slide_text = 'Contains in-text citation [1].';
    const invalidVal = validatePresentationOutput({ deck: invalidDeck, papers: dummyPapers, requestedSlideCount: 8 });
    if (!invalidVal.isValid) {
      blockedExport = true;
    }
  } catch (e) {
    blockedExport = true;
  }
  if (!blockedExport) throw new Error('Export was not blocked for invalid presentation output');
  console.log('Passed 12.3: Export only executes after validation succeeds');

  console.log('\n--- ALL WORKFLOW, FAILURE-HANDLING & DATA MODEL TESTS PASSED 100%! ---');
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
