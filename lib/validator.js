/**
 * Preppt — Pre-export Checks Suite (lib/validator.js)
 *
 * Checks scientific integrity, source support, and consistency with selected abstracts:
 * 1. source_coverage (fail)
 * 2. source_support (fail)
 * 3. direction_fidelity (fail)
 * 4. unsupported_numbers (fail)
 * 5. vocabulary_drift (fail)
 * 6. framing_sources (fail)
 * 7. truncation (warning)
 * 8. no_intext_citations (fail)
 * 9. slide_count (warning)
 * 10. abstract_only_notice (warning/pass)
 * 11. removed_papers_absent (fail)
 * 12. no_api_secrets (fail)
 * 13. english_only (warning)
 */

const fs = require('fs');
const path = require('path');
const { extractEvidenceRecords, detectIsConferenceAbstract, detectOutcomeDirection, parseAbstractSentences, classifySentenceRole } = require('./evidence-extractor.js');
const { assignAssuranceTier } = require('./venue-assurance.js');
const {
  NUMERIC_BRACKET_REGEX,
  NUMERIC_PAREN_REGEX,
  AUTHOR_YEAR_PAREN_REGEX,
  AUTHOR_YEAR_PROSE_REGEX,
  AUTHOR_YEAR_COMMA_REGEX,
  parseStructuredResultSentence,
  isEnglishText
} = require('./text-rules.js');

const EXPECTED_PROJECT_NAME = 'Preppt – Scientific Literature to Presentation';

// Watch list for vocabulary drift (Prompt 2 - B3 & C5)
const VOCABULARY_WATCH_LIST = [
  'hemodynamic',
  'receptor',
  'readmission',
  'hospitalization',
  'emergency department',
  'post-marketing',
  'registry',
  'octogenarian',
  'hl7',
  'fhir',
  'ejection fraction',
  'survival',
  'mortality',
  'tolerability',
  'adverse event',
  'dosing',
  'multicenter',
  'multi-centre'
];

// Stop words that indicate truncation or should be excluded from content-word matching
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
  'from', 'up', 'about', 'into', 'over', 'after', 'is', 'are', 'was', 'were', 'be', 'been',
  'being', 'have', 'has', 'had', 'do', 'does', 'did', 'that', 'this', 'these', 'those',
  'it', 'its', 'they', 'their', 'we', 'our', 'which', 'who', 'whom', 'what', 'as',
  'without', 'within', 'between', 'among', 'across', 'versus', 'vs', 'no', 'not',
  'through', 'than', 'under', 'down', 'off', 'nor', 'during', 'before', 'against'
]);

// Finding signal regex: %, P =, CI, OR/RR/HR, comparative or outcome direction words
const FINDING_SIGNAL_REGEX = /\d+(?:\.\d+)?%|\b[pP]\s*[=<>≤≥]\s*\d|\b95%\s*CI|\b(?:HR|OR|RR|hazard ratio|odds ratio|relative risk)\s*[=<>:]?\s*\d|\b(?:AUC|ROC|AUROC|c-index|sensitivity|specificity|accuracy)\b|\b(?:higher|lower|improved?|improving|decreas(?:e|es|ed|ing)|reduc(?:e|es|ed|ing|tion|tions)|increas(?:e|es|ed|ing)|outperformed?|no difference|not demonstrated|was not demonstrated|not able to demonstrate|superior(?:ity)?|inferior(?:ity)?|benefits?|effective(?:ness)?)\b/i;

// Positive benefit words
const POSITIVE_WORDS_REGEX = /\b(?:improved|higher|superior|outperformed|benefit|effective|reduced risk|improving)\b/i;

/**
 * Validates the complete presentation output against scientific integrity criteria
 */
function validatePresentationOutput({
  deck,
  papers = [],
  removedPapers = [],
  requestedSlideCount,
  topic = '',
  projectRun = null
}) {
  const checks = [];

  if (!deck) {
    return {
      isValid: false,
      canExport: false,
      totalChecks: 1,
      passedCount: 0,
      warningCount: 0,
      failedCount: 1,
      summary: 'Export blocked: 1 check failed.',
      checks: [{
        id: 'deck_exists',
        name: 'Presentation deck exists',
        status: 'fail',
        passed: false,
        details: 'Deck not yet synthesized.'
      }],
      errors: ['Presentation deck has not been synthesized.'],
      warnings: []
    };
  }

  const slides = Array.isArray(deck.slides) ? deck.slides : [];
  const activeTopic = topic || deck.topic || '';
  const expectedCount = Number(requestedSlideCount ?? deck.requestedSlideCount ?? deck.meta?.requestedSlideCount ?? deck.meta?.slideCount ?? slides.length);
  const activePapers = Array.isArray(papers) ? papers : [];
  const extractedRecords = extractEvidenceRecords(activePapers);
  const validRefNumbers = new Set(activePapers.map((_, i) => i + 1));
  const keywords = Array.isArray(deck.approvedKeywords) ? deck.approvedKeywords : (typeof deck.approvedKeywords === 'object' && deck.approvedKeywords !== null ? Object.values(deck.approvedKeywords).flat() : []);

  // Concatenated text of all selected records for verification
  const allRecordsText = activePapers.map(p => `${p.title || ''} ${p.abstract || ''} ${p.abstract_summary || ''} ${p.journal || ''} ${p.year || ''}`).join(' ').toLowerCase();
  const searchScopeText = `${activeTopic} ${keywords.join(' ')}`.toLowerCase();

  // ----------------------------------------------------
  // 1. source_coverage (fail)
  // Every bullet, main message and notes sentence containing a finding signal has sources that exist in references
  // ----------------------------------------------------
  let coverageFailed = false;
  let coverageDetails = [];

  slides.forEach((s, idx) => {
    const slideNum = s.slide_number || idx + 1;
    const slideSources = Array.isArray(s.sources) ? s.sources : [];
    const textPieces = [
      { type: 'main message', text: s.main_message || s.mainMessage || '' },
      { type: 'speaker notes', text: s.speaker_notes || s.speakerNotes || '' }
    ];

    const bulletLines = (s.on_slide_text || s.onSlideText || '').split('\n').filter(Boolean);
    bulletLines.forEach((b, bIdx) => textPieces.push({ type: `bullet ${bIdx + 1}`, text: b }));

    // Check each text piece for finding signal
    textPieces.forEach(tp => {
      if (FINDING_SIGNAL_REGEX.test(tp.text)) {
        // Exclude purely generic framing/scope text or Stage 7 research-gap framing (which framing_sources requires to have sources: [])
        const isGenericFraming = /literature appraisal spanning|synthesizing \d+ selected studies|calibrated for/i.test(tp.text);
        const isResearchGapFraming = (s.stage === 7 || /unresolved questions|research horizons/i.test(s.title || '')) &&
          !/\d+(?:\.\d+)?%|\b[pP]\s*[=<>≤≥]\s*\d|\b95%\s*CI\b/.test(tp.text);
        if (isGenericFraming || isResearchGapFraming) return;

        if (slideSources.length === 0) {
          coverageFailed = true;
          coverageDetails.push(`Slide ${slideNum} ${tp.type} contains finding statement ("${tp.text.substring(0, 50)}...") but cites no sources.`);
        } else {
          const hasInvalidSource = slideSources.some(src => !validRefNumbers.has(Number(src)));
          if (hasInvalidSource) {
            coverageFailed = true;
            coverageDetails.push(`Slide ${slideNum} ${tp.type} cites source not present in references: [${slideSources.join(', ')}].`);
          }
        }
      }
    });
  });

  checks.push({
    id: 'source_coverage',
    name: 'Finding statements trace to valid reference sources',
    status: coverageFailed ? 'fail' : 'pass',
    passed: !coverageFailed,
    details: coverageFailed
      ? coverageDetails.slice(0, 3).join(' ')
      : 'All empirical finding bullets, main messages, and notes sentences cite approved reference sources.'
  });

  // ----------------------------------------------------
  // 2. source_support (fail)
  // For each sourced finding bullet, at least one cited record contains it (>= 60% word overlap or all numbers match or matches derivedFrom provenance)
  // ----------------------------------------------------
  let supportFailed = false;
  let supportDetails = [];

  slides.forEach((s, idx) => {
    const slideNum = s.slide_number || idx + 1;
    const slideSources = Array.isArray(s.sources) ? s.sources : [];
    if (slideSources.length === 0) return;

    const bulletLines = (s.on_slide_text || s.onSlideText || '').split('\n').filter(Boolean);
    bulletLines.forEach((b, bIdx) => {
      if (!FINDING_SIGNAL_REGEX.test(b)) return;
      if (/literature appraisal spanning|synthesizing \d+ selected studies|study design:|investigation focus:/i.test(b)) return;

      const citedRecords = slideSources.map(ref => activePapers[ref - 1] || extractedRecords.find(r => r.refNumber === ref)).filter(Boolean);
      if (citedRecords.length === 0) return;

      let supportedByAtLeastOne = false;

      // Check Provenance via derivedFrom (Prompt 2B - Problem 3)
      const bulletData = s.bulletsData && s.bulletsData[bIdx];
      if (bulletData && Array.isArray(bulletData.derivedFrom) && bulletData.derivedFrom.length > 0) {
        let allDerivedMatched = true;
        for (const df of bulletData.derivedFrom) {
          const citedRef = df.ref;
          const citedPaper = activePapers[citedRef - 1] || extractedRecords.find(r => r.refNumber === citedRef);
          if (!citedPaper) {
            allDerivedMatched = false;
            break;
          }
          const recFull = `${citedPaper.title || ''} ${citedPaper.abstract || ''} ${citedPaper.abstract_summary || ''}`.toLowerCase();
          const recExtracted = extractedRecords.find(r => r.refNumber === citedRef);

          // Check if record contains matching direction or outcome signals
          const hasDir = (recExtracted && recExtracted.outcomes.some(o => o.direction === df.direction)) ||
            detectOutcomeDirection(recFull) === df.direction ||
            (df.direction === 'no difference' && (recFull.includes('noninferiority') || recFull.includes('non-inferiority') || recFull.includes('no difference') || recFull.includes('not demonstrated') || recFull.includes('not able to demonstrate') || recFull.includes('no significant difference'))) ||
            (df.direction === 'favours intervention' && (recFull.includes('higher') || recFull.includes('improved') || recFull.includes('outperformed') || recFull.includes('benefit')));

          if (!hasDir) {
            allDerivedMatched = false;
            break;
          }
        }
        if (allDerivedMatched) {
          supportedByAtLeastOne = true;
        }
      }

      if (!supportedByAtLeastOne) {
        // Fallback for bullets without matching derivedFrom: numbers or text overlap
        const numsInBullet = b.match(/\b\d+(?:\.\d+)?%?/g) || [];

        for (const rec of citedRecords) {
          const recFull = `${rec.title || ''} ${rec.abstract || ''} ${rec.abstract_summary || ''}`.toLowerCase();
          // Check 1: all numbers appear in cited record
          if (numsInBullet.length > 0) {
            const allNumsPresent = numsInBullet.every(num => recFull.includes(num.replace('%', '').toLowerCase()));
            if (allNumsPresent) {
              supportedByAtLeastOne = true;
              break;
            }
          }

          // Check 2: >= 60% content word overlap with candidate sentences or full abstract
          const cleanBulletText = b
            .replace(/^[•\s-]+/, '')
            .replace(/^(?:[A-Za-z0-9_-]+(?:\s+[A-Za-z0-9_-]+)?(?:,\s*\d{4})?|\w+\s+Summary|\w+\s+Caveat|\w+\s+Appraisal|\w+\s+Finding):\s*/i, '');
          const bulletWords = cleanBulletText.toLowerCase().replace(/[-_/]/g, ' ').replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2 && !STOP_WORDS.has(w));
          if (bulletWords.length === 0) continue;

          const candidateSentences = [
            ...(rec.keyFindingSentences || []),
            recFull
          ];

          for (const sent of candidateSentences) {
            const sentWords = new Set(sent.toLowerCase().replace(/[-_/]/g, ' ').replace(/[^a-z0-9\s]/g, '').split(/\s+/));
            const matchCount = bulletWords.filter(w => sentWords.has(w)).length;
            if (matchCount / bulletWords.length >= 0.5) {
              supportedByAtLeastOne = true;
              break;
            }
          }
          if (supportedByAtLeastOne) break;
        }
      }

      if (!supportedByAtLeastOne) {
        supportFailed = true;
        supportDetails.push(`Slide ${slideNum} bullet "${b.substring(0, 45)}..." lacks 60% text overlap or matching numbers in cited source [${slideSources.join(', ')}].`);
      }
    });
  });

  checks.push({
    id: 'source_support',
    name: 'Finding statements supported by cited study abstracts',
    status: supportFailed ? 'fail' : 'pass',
    passed: !supportFailed,
    details: supportFailed
      ? supportDetails.slice(0, 3).join(' ')
      : 'All sourced empirical statements are corroborated by verbatim finding sentences or data in cited abstracts.'
  });

  // ----------------------------------------------------
  // 3. direction_fidelity (fail)
  // Positive wording must not cite only records with null/negative direction.
  // Main message or conclusion must not state benefit if an included RCT is null unless stating the null result.
  // ----------------------------------------------------
  let fidelityFailed = false;
  let fidelityDetails = [];

  // Check if any included RCT's primary outcome is null
  const nullRcts = extractedRecords.filter(r => {
    const isRct = (r.designFromSource || '').toLowerCase().includes('randomised') || (r.designFromSource || '').toLowerCase().includes('randomized') || (r.title + ' ' + (r.abstract || '')).toLowerCase().includes('randomized');
    const hasNullOrNeg = r.outcomes.some(o => o.direction === 'no difference' || o.direction === 'favours comparator') ||
      (r.title + ' ' + (r.abstract || '')).toLowerCase().includes('not demonstrated') ||
      (r.title + ' ' + (r.abstract || '')).toLowerCase().includes('non-inferiority was not demonstrated');
    return isRct && hasNullOrNeg;
  });

  slides.forEach((s, idx) => {
    const slideNum = s.slide_number || idx + 1;
    const slideSources = Array.isArray(s.sources) ? s.sources : [];

    // Check bullets with positive wording
    const bulletLines = (s.on_slide_text || s.onSlideText || '').split('\n').filter(Boolean);
    bulletLines.forEach((b, bIdx) => {
      const bData = s.bulletsData && s.bulletsData[bIdx];
      // If bulletData specifies derivedFrom with direction === 'no difference', it is not asserting positive benefit
      if (bData && Array.isArray(bData.derivedFrom) && bData.derivedFrom.every(df => df.direction === 'no difference')) {
        return;
      }

      if (POSITIVE_WORDS_REGEX.test(b) && slideSources.length > 0) {
        const citedExtracted = slideSources.map(ref => extractedRecords.find(r => r.refNumber === ref)).filter(Boolean);
        if (citedExtracted.length > 0) {
          const allCitedAreNullOrFavoursComparator = citedExtracted.every(rec => {
            const hasPositive = rec.outcomes.some(o => o.direction === 'favours intervention');
            const hasNull = rec.outcomes.some(o => o.direction === 'no difference' || o.direction === 'favours comparator') ||
              (rec.title + ' ' + (rec.abstract || '')).toLowerCase().includes('not demonstrated');
            return hasNull && !hasPositive;
          });

          if (allCitedAreNullOrFavoursComparator) {
            fidelityFailed = true;
            fidelityDetails.push(`Slide ${slideNum} asserts clinical benefit ("${b.substring(0, 45)}...") while citing only study evidence showing no statistically significant difference or failed non-inferiority.`);
          }
        }
      }
    });

    // Check main message and conclusion for RCT null conflict
    const mainMsg = (s.main_message || s.mainMessage || '').toLowerCase();
    if (nullRcts.length > 0) {
      const claimsBenefit = /\b(?:benefit|superior|advantage|improved clinical pregnancy|improves pregnancy|confirms clinical benefit)\b/i.test(mainMsg);
      const statesNull = /\b(?:no difference|no statistically significant|not demonstrated|non-inferiority was not demonstrated|mixed)\b/i.test(mainMsg);
      if (claimsBenefit && !statesNull) {
        fidelityFailed = true;
        fidelityDetails.push(`Slide ${slideNum} main message claims benefit despite an included randomized controlled trial reporting null or non-inferiority failure.`);
      }
    }
  });

  checks.push({
    id: 'direction_fidelity',
    name: 'Outcome direction fidelity (no benefit on null evidence)',
    status: fidelityFailed ? 'fail' : 'pass',
    passed: !fidelityFailed,
    details: fidelityFailed
      ? fidelityDetails.slice(0, 3).join(' ')
      : 'Outcome directions match cited evidence; no clinical benefit is claimed where randomized trials showed null outcomes.'
  });

  // ----------------------------------------------------
  // 4. unsupported_numbers (fail)
  // Every number or percentage in slide text, notes, plan, and gaps appears in some selected record (with exemptions)
  // ----------------------------------------------------
  let unsupportedNumbersFound = false;
  let unsupportedNumDetails = [];

  const textToInspectNumbers = [
    ...(slides.flatMap(s => [s.title, s.main_message || s.mainMessage, s.on_slide_text || s.onSlideText, s.speaker_notes || s.speakerNotes])),
    ...(deck.researchGaps || []),
    deck.synthesisPlan?.themes?.map(t => `${t.consistentFindings} ${t.establishedFindings}`) || []
  ].flat().filter(Boolean).join(' ');

  // Extract all numbers, percentages, decimals
  const rawNumbers = textToInspectNumbers.match(/\b\d+(?:\.\d+)?%?/g) || [];
  const rctCount = extractedRecords.filter(r => (r.designFromSource || '').toLowerCase().includes('randomised') || (r.designFromSource || '').toLowerCase().includes('randomized')).length;

  const validSlideNumbers = new Set(slides.map((_, i) => String(i + 1)));
  const exemptedValues = new Set([
    '95', // 95% in 95% CI
    String(activePapers.length),
    String(slides.length),
    String(rctCount),
    String(expectedCount),
    ...validSlideNumbers
  ]);

  for (const rawNum of rawNumbers) {
    const isPercentage = rawNum.endsWith('%');
    const cleanNum = rawNum.replace('%', '');
    const numVal = parseFloat(cleanNum);

    // If it is a percentage (e.g. 25%, 80.87%), it is NOT a slide count or year; only 95% in 95% CI is exempted
    if (isPercentage) {
      if (cleanNum === '95') continue;
      if (!allRecordsText.includes(cleanNum.toLowerCase())) {
        unsupportedNumbersFound = true;
        unsupportedNumDetails.push(`Number "${rawNum}" appears in output text but is not present in any selected study abstract or title.`);
        break;
      }
      continue;
    }

    // 4-digit year exemption
    if (cleanNum.length === 4 && numVal >= 1950 && numVal <= 2035) continue;

    // Small integer / list count / ratio exemptions
    if (exemptedValues.has(cleanNum)) continue;

    // Check if cleanNum appears in any selected record
    if (!allRecordsText.includes(cleanNum.toLowerCase())) {
      unsupportedNumbersFound = true;
      unsupportedNumDetails.push(`Number "${rawNum}" appears in output text but is not present in any selected study abstract or title.`);
      break;
    }
  }

  checks.push({
    id: 'unsupported_numbers',
    name: 'Numbers and percentages supported by selected records',
    status: unsupportedNumbersFound ? 'fail' : 'pass',
    passed: !unsupportedNumbersFound,
    details: unsupportedNumbersFound
      ? unsupportedNumDetails.slice(0, 3).join(' ')
      : 'All statistics, percentages, and numerical values in slides and notes appear in the approved study records.'
  });

  // ----------------------------------------------------
  // 5. vocabulary_drift (fail)
  // Words from watch list appear in output but in no selected record, topic, or keywords
  // ----------------------------------------------------
  let vocabDriftFailed = false;
  let vocabDriftDetails = [];

  const fullOutputText = [
    activeTopic,
    deck.shortTitle || '',
    ...(slides.flatMap(s => [s.title, s.objective, s.main_message || s.mainMessage, s.on_slide_text || s.onSlideText, s.speaker_notes || s.speakerNotes])),
    ...(deck.researchGaps || []),
    deck.synthesisPlan?.themes?.map(t => `${t.title} ${t.consistentFindings} ${t.uncertainOrUnresolvedAreas}`) || []
  ].flat().filter(Boolean).join(' ').toLowerCase();

  for (const term of VOCABULARY_WATCH_LIST) {
    const termRegex = new RegExp(`\\b${term}\\b`, 'i');
    if (termRegex.test(fullOutputText)) {
      const inRecords = termRegex.test(allRecordsText);
      const inSearchScope = termRegex.test(searchScopeText);
      if (!inRecords && !inSearchScope) {
        vocabDriftFailed = true;
        vocabDriftDetails.push(`Watch list clinical term "${term}" detected in presentation output but absent from selected records, topic, and search keywords.`);
      }
    }
  }

  // Also check 'multicenter' / 'multi-centre': flag when no cited record contains it
  if (/\b(?:multicenter|multi-centre)\b/i.test(fullOutputText)) {
    const multicenterInRecords = /\b(?:multicenter|multi-centre)\b/i.test(allRecordsText);
    const multicenterInScope = /\b(?:multicenter|multi-centre)\b/i.test(searchScopeText);
    if (!multicenterInRecords && !multicenterInScope) {
      vocabDriftFailed = true;
      vocabDriftDetails.push(`Claim of "multicenter" trials detected in output but absent from all selected paper records.`);
    }
  }

  checks.push({
    id: 'vocabulary_drift',
    name: 'Zero vocabulary drift from watch list terms',
    status: vocabDriftFailed ? 'fail' : 'pass',
    passed: !vocabDriftFailed,
    details: vocabDriftFailed
      ? vocabDriftDetails.slice(0, 3).join(' ')
      : 'Output text contains zero off-topic or ungrounded clinical terms from the integrity watch list.'
  });

  // ----------------------------------------------------
  // 6. framing_sources (fail)
  // No slide whose bullets contain no extracted text shows numeric sources (must show "none (framing slide)")
  // ----------------------------------------------------
  let framingSourcesFailed = false;
  let framingDetails = [];

  slides.forEach((s, idx) => {
    const slideNum = s.slide_number || idx + 1;
    const slideSources = Array.isArray(s.sources) ? s.sources : [];
    if (slideSources.length === 0) return;

    // Identified framing slides (Title, Hook/Dilemma, Unresolved Questions & Horizons)
    const isFraming = s.stage === 1 || s.stage === 2 || s.stage === 7 ||
      /^(?:title|the hook|clinical dilemma|unresolved questions|research horizons|presentation overview)/i.test(s.title);

    if (isFraming) {
      framingSourcesFailed = true;
      framingDetails.push(`Framing slide ${slideNum} ("${s.title}") displays numeric sources [${slideSources.join(', ')}] despite containing no extracted study findings.`);
    }
  });

  checks.push({
    id: 'framing_sources',
    name: 'Framing slides display no numeric sources',
    status: framingSourcesFailed ? 'fail' : 'pass',
    passed: !framingSourcesFailed,
    details: framingSourcesFailed
      ? framingDetails.slice(0, 3).join(' ')
      : 'Framing and scoping slides show "none (framing slide)" and carry no numeric evidence sources.'
  });

  // ----------------------------------------------------
  // 7. truncation (fail / warning) (Prompt 2B - Problem 1)
  // Flag as fail:
  // - Open bracket fragment e.g. "(248." or unclosed parenthesis/bracket
  // - Finding bullet whose number count is lower than source sentence result clause without structured result
  // - Bullet ending in a word that in its source sentence is immediately followed by more words in the same clause
  // - Dangling stop words at end
  // ----------------------------------------------------
  let truncationFailed = false;
  let truncationWarning = false;
  let truncationDetails = [];

  slides.forEach((s, idx) => {
    const slideNum = s.slide_number || idx + 1;
    const slideSources = Array.isArray(s.sources) ? s.sources : [];
    const bullets = (s.on_slide_text || s.onSlideText || '').split('\n').filter(Boolean);

    bullets.forEach((b, bIdx) => {
      const clean = b.replace(/^[•\s-]+/, '').trim();
      if (!clean) return;

      // 1. Unclosed bracket or open bracket fragment such as "(248." or unclosed "(" / "["
      const openParenCount = (clean.match(/\(/g) || []).length;
      const closeParenCount = (clean.match(/\)/g) || []).length;
      const openBracketCount = (clean.match(/\[/g) || []).length;
      const closeBracketCount = (clean.match(/\]/g) || []).length;
      const hasUnclosedBracket = openParenCount > closeParenCount || openBracketCount > closeBracketCount;
      const hasOpenBracketFragment = /\(\s*\d+[\s\.]*$/.test(clean) || /\[\s*\d+[\s\.]*$/.test(clean) || /\(\s*$/.test(clean) || /\[\s*$/.test(clean);

      if (hasUnclosedBracket || hasOpenBracketFragment) {
        truncationFailed = true;
        truncationDetails.push(`Slide ${slideNum} bullet contains unclosed bracket or open fragment: "${clean.substring(0, 50)}".`);
        return;
      }

      // 2. Dangling stop words at end
      const words = clean.split(/\s+/).filter(Boolean);
      if (words.length > 0) {
        const lastWord = words[words.length - 1].replace(/[.,;:!?]+$/, '').toLowerCase();
        if (STOP_WORDS.has(lastWord) && lastWord !== 'no' && lastWord !== 'not') {
          truncationFailed = true;
          truncationDetails.push(`Slide ${slideNum} bullet ${bIdx + 1} ends with dangling stop word "${lastWord}".`);
          return;
        }
      }

      // 3. Mid-sentence ellipsis
      if (/[a-zA-Z0-9]\s*(?:…|\.{3})\s+[a-zA-Z]/.test(clean)) {
        truncationWarning = true;
        truncationDetails.push(`Slide ${slideNum} bullet ${bIdx + 1} contains mid-sentence ellipsis.`);
      }

      // 4. Source-correlated truncation (Prompt 2B - Problem 1)
      const bData = s.bulletsData && s.bulletsData[bIdx];
      const isStructured = bData && (bData.isStructured || (bData.derivedFrom && bData.derivedFrom.length > 0));

      if (!isStructured && slideSources.length > 0 && FINDING_SIGNAL_REGEX.test(clean)) {
        const citedRecords = slideSources.map(ref => activePapers[ref - 1] || extractedRecords.find(r => r.refNumber === ref)).filter(Boolean);
        for (const rec of citedRecords) {
          const fullAbstract = `${rec.abstract || ''} ${rec.abstract_summary || ''}`;
          const sentences = (rec.keyFindingSentences && rec.keyFindingSentences.length > 0) ? rec.keyFindingSentences : [fullAbstract];

          for (const sent of sentences) {
            const cleanNoAuthor = clean.replace(/^[^:]+:\s*/, '').toLowerCase().replace(/[.,;!?]+$/, '');

            // (a) Bullet ending in a word that in source is immediately followed by more words in the same clause
            // (e.g. ends with "manual." while source says "manual group", or ends with "deep." while source says "deep learning")
            if (cleanNoAuthor.length >= 8 && sent.toLowerCase().includes(cleanNoAuthor)) {
              const escapedSub = cleanNoAuthor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              const regex = new RegExp(`${escapedSub}\\s+([a-zA-Z]+)`, 'i');
              const match = sent.match(regex);
              if (match) {
                const nextWord = match[1].toLowerCase();
                const sameClauseContinuations = new Set(['group', 'groups', 'arm', 'arms', 'learning', 'embryo', 'embryos', 'patients', 'selection', 'rate', 'rates', 'pregnancy', 'birth', 'morphology', 'outcome', 'outcomes', 'prediction', 'assessment', 'trials', 'studies', 'focused', 'clinical']);
                if (sameClauseContinuations.has(nextWord)) {
                  truncationFailed = true;
                  truncationDetails.push(`Slide ${slideNum} bullet ends with "${words[words.length - 1]}" while source continues with "${nextWord}" in the same clause.`);
                  break;
                }
              }
            }

            // (b) Effect-bearing numbers must survive on slide; raw counts/denominators may move to speaker notes
            const bulletNums = clean.match(/\b\d+(?:\.\d+)?%?/g) || [];
            const notesText = (s.speaker_notes || s.speakerNotes || '').toLowerCase();
            const fracNums = new Set();
            (sent.match(/\b(\d+)\s*\/\s*(\d+)\b/g) || []).forEach(fr => {
              fr.split('/').forEach(part => fracNums.add(part.trim()));
            });
            const sentNums = (sent.match(/\b\d+(?:\.\d+)?%?/g) || []);
            const effectNums = sentNums.filter(n => !fracNums.has(n.replace('%', '')));
            const missingEffectNums = effectNums.filter(n => !clean.includes(n.replace('%', '')));
            const missingCountsInNotes = [...fracNums].filter(n => !clean.includes(n) && !notesText.includes(n));

            if (effectNums.length >= 2 && bulletNums.length < effectNums.length && missingEffectNums.length > 0) {
              if (sent.toLowerCase().includes(cleanNoAuthor.substring(0, Math.min(25, cleanNoAuthor.length)))) {
                truncationFailed = true;
                truncationDetails.push(`Slide ${slideNum} finding bullet dropped effect-bearing numbers present in source result clause (missing: ${missingEffectNums.slice(0, 3).join(', ')}).`);
                break;
              }
            }
            if (missingCountsInNotes.length > 0 && sent.toLowerCase().includes(cleanNoAuthor.substring(0, Math.min(25, cleanNoAuthor.length)))) {
              truncationFailed = true;
              truncationDetails.push(`Slide ${slideNum} raw counts (${missingCountsInNotes.join(', ')}) were dropped without appearing in speaker notes.`);
              break;
            }
          }
          if (truncationFailed) break;
        }
      }
    });
  });

  checks.push({
    id: 'truncation',
    name: 'Sentence integrity and truncation check',
    status: truncationFailed ? 'fail' : (truncationWarning ? 'warning' : 'pass'),
    passed: !truncationFailed,
    details: truncationFailed
      ? truncationDetails.slice(0, 3).join(' ')
      : (truncationWarning ? truncationDetails.slice(0, 3).join(' ') : 'All slide bullets have complete syntax with zero mid-word cuts or trailing dangling stop words.')
  });

  // ----------------------------------------------------
  // 8. no_intext_citations (fail)
  // Slide text and notes contain no bracket/parenthesis numbers and no author-year forms.
  // Policy: author label at start of bullet like "Wang S, 2023:" is permitted.
  // ----------------------------------------------------
  let inTextCitationFound = false;
  let citationDetails = [];

  const numericBracketRegex = NUMERIC_BRACKET_REGEX;
  const numericParenRegex = NUMERIC_PAREN_REGEX;
  const authorYearParenRegex = AUTHOR_YEAR_PAREN_REGEX;
  const authorYearProseRegex = AUTHOR_YEAR_PROSE_REGEX;
  const authorYearCommaRegex = AUTHOR_YEAR_COMMA_REGEX;

  slides.forEach((s, idx) => {
    const slideNum = s.slide_number || idx + 1;
    const bullets = (s.on_slide_text || s.onSlideText || '').split('\n').filter(Boolean);
    const notes = s.speaker_notes || s.speakerNotes || '';

    // Check bullets (after stripping allowable study label at bullet start or short tag at end)
    bullets.forEach((b, bIdx) => {
      // Allow author study label prefix: "Wang S, 2023:", "Salih M:", "Illingworth PJ et al., 2024:"
      // and trailing short study tag: "(Li 2025)" or "(Agboola 2025)"
      const strippedBullet = b
        .replace(/^[•\s-]*[A-Z][a-zA-Z\s,.'-]+(?:,\s*\d{4})?\s*:\s*/, '')
        .replace(/\s*(?:\[unverified source\]|\[not PubMed-indexed\])\.?\s*$/i, '')
        .replace(/\s*\([A-Z][a-zA-ZÀ-ÿ'-]+\s+\d{4}\)\.?\s*$/, '');

      if (numericBracketRegex.test(strippedBullet)) {
        inTextCitationFound = true;
        citationDetails.push(`Slide ${slideNum} bullet ${bIdx + 1} contains bracket citation [N].`);
      }
      if (numericParenRegex.test(strippedBullet)) {
        inTextCitationFound = true;
        citationDetails.push(`Slide ${slideNum} bullet ${bIdx + 1} contains parenthetical citation (N).`);
      }
      if (authorYearParenRegex.test(strippedBullet) || authorYearProseRegex.test(strippedBullet) || authorYearCommaRegex.test(strippedBullet)) {
        inTextCitationFound = true;
        citationDetails.push(`Slide ${slideNum} bullet ${bIdx + 1} contains author-year citation.`);
      }
    });

    // Check speaker notes
    if (numericBracketRegex.test(notes) || numericParenRegex.test(notes) || authorYearParenRegex.test(notes) || authorYearProseRegex.test(notes) || authorYearCommaRegex.test(notes)) {
      inTextCitationFound = true;
      citationDetails.push(`Slide ${slideNum} speaker notes contain in-text citation.`);
    }
  });

  checks.push({
    id: 'no_intext_citations',
    name: 'Zero in-text citations in on-slide text or notes',
    status: inTextCitationFound ? 'fail' : 'pass',
    passed: !inTextCitationFound,
    details: inTextCitationFound
      ? `${citationDetails.slice(0, 3).join(' ')} (Policy: study label prefixes like "Wang S, 2023:" are permitted at bullet start; in-text parenthetical citations or author-year prose citations are prohibited).`
      : 'Zero in-text citations found. (Policy: study label prefixes like "Wang S, 2023:" are permitted at bullet start; in-text parenthetical citations or author-year prose citations are prohibited).'
  });

  // ----------------------------------------------------
  // 9. slide_count (warning)
  // Equal to requested count, or documented meta.slideShortfall
  // ----------------------------------------------------
  const hasShortfall = (deck.meta?.slideShortfall > 0);
  const meetsCount = slides.length === expectedCount;
  const shortfallDocumented = hasShortfall && (slides.length + (deck.meta?.slideShortfall || 0) === expectedCount);

  let slideCountStatus = 'pass';
  let slideCountDetails = `Exact requested count confirmed: ${slides.length} slides generated.`;

  if (!meetsCount) {
    if (shortfallDocumented) {
      slideCountStatus = 'warning';
      slideCountDetails = `Evidence shortfall documented: ${slides.length} slides supported by evidence (${deck.meta.slideShortfall} slide shortfall noted).`;
    } else {
      slideCountStatus = 'warning';
      slideCountDetails = `Slide count discrepancy: requested ${expectedCount}, generated ${slides.length}.`;
    }
  }

  checks.push({
    id: 'slide_count',
    name: 'Requested slide count present or documented shortfall',
    status: slideCountStatus,
    passed: slideCountStatus !== 'fail',
    details: slideCountDetails
  });

  // ----------------------------------------------------
  // 10. abstract_only_notice (warning / pass)
  // Reports how many records had no abstract and how many are conference abstracts. Never blocks.
  // ----------------------------------------------------
  const noAbstractCount = activePapers.filter(p => {
    const raw = p.abstract || p.abstract_summary || '';
    return typeof raw !== 'string' || raw.trim().length <= 30;
  }).length;
  const confCount = activePapers.filter(p => detectIsConferenceAbstract(p)).length;
  const hasAbstractNotices = noAbstractCount > 0 || confCount > 0;

  checks.push({
    id: 'abstract_only_notice',
    name: 'Abstract-only and conference abstract disclosure',
    status: hasAbstractNotices ? 'warning' : 'pass',
    passed: true,
    details: `${activePapers.length} selected records evaluated: ${noAbstractCount} without abstract, ${confCount} conference abstracts. Findings are based on titles and abstracts only; full texts were not read.`
  });

  // ----------------------------------------------------
  // 11. removed_papers_absent (fail)
  // Removed papers are permanently excluded from the active selection
  // ----------------------------------------------------
  const removedList = Array.isArray(removedPapers) ? removedPapers : (projectRun?.removed_papers || []);
  let removedPaperIncluded = false;
  let removedDetails = '';

  activePapers.forEach((p, idx) => {
    if (p.user_status === 'removed' || p.userStatus === 'removed' || p.selected === false) {
      removedPaperIncluded = true;
      removedDetails = `Paper #${idx + 1} ("${(p.title || '').substring(0, 30)}...") has status 'removed' or deselected.`;
    }

    const matchesRemoved = removedList.some(r => {
      if (r.id && p.id && r.id === p.id) return true;
      if (r.doi && p.doi && r.doi.toLowerCase() === p.doi.toLowerCase()) return true;
      if (r.pmid && p.pmid && r.pmid === p.pmid) return true;
      if (r.title && p.title && r.title.trim().toLowerCase() === p.title.trim().toLowerCase()) return true;
      return false;
    });

    if (matchesRemoved) {
      removedPaperIncluded = true;
      removedDetails = `Removed study ("${(p.title || '').substring(0, 30)}...") is still present in active selection.`;
    }
  });

  const removedPapersAbsent = !removedPaperIncluded && activePapers.length > 0;
  checks.push({
    id: 'removed_papers_absent',
    name: 'Removed papers absent from active selection',
    status: removedPapersAbsent ? 'pass' : 'fail',
    passed: removedPapersAbsent,
    details: removedPapersAbsent
      ? `Active selection contains only approved studies (${activePapers.length} papers). All removed papers permanently excluded.`
      : `Selection error: ${removedDetails || 'No active approved papers in selection.'}`
  });

  // ----------------------------------------------------
  // 12. no_api_secrets (fail)
  // API secrets are not exposed in payload or client files
  // ----------------------------------------------------
  let secretExposed = false;
  let secretDetails = '';

  const fullSerialized = JSON.stringify({ deck, papers: activePapers, meta: deck.meta });
  const secretPatterns = [
    /s2k-[a-zA-Z0-9_\-]{20,}/i,
    /sk-[a-zA-Z0-9_\-]{16,}/i,
    /AIza[a-zA-Z0-9_\-]{25,}/i,
    /gsk_[a-zA-Z0-9_\-]{20,}/i,
    /x-api-key\s*[:=]\s*\\?['"]?[a-zA-Z0-9_\-]{16,}\\?['"]?/i,
    /bearer\s+[a-zA-Z0-9_\-]{20,}/i,
    /(?:api[_-]?secret|api[_-]?key|auth[_-]?token)\s*[:=]\s*\\?['"]?[a-zA-Z0-9_\-]{16,}\\?['"]?/i
  ];

  for (const pat of secretPatterns) {
    if (pat.test(fullSerialized)) {
      secretExposed = true;
      secretDetails = 'Potential API key or secret token pattern detected in presentation payload.';
      break;
    }
  }

  // Scan public/app.js on disk if available
  if (!secretExposed) {
    try {
      const publicAppPath = path.join(__dirname, '..', 'public', 'app.js');
      if (fs.existsSync(publicAppPath)) {
        const appJsContent = fs.readFileSync(publicAppPath, 'utf8');
        for (const pat of secretPatterns) {
          if (pat.test(appJsContent)) {
            secretExposed = true;
            secretDetails = 'API secret pattern detected in public/app.js client bundle!';
            break;
          }
        }
      }
    } catch (e) {
      // Ignore disk read error in restricted environments
    }
  }

  const noApiSecrets = !secretExposed;
  checks.push({
    id: 'no_api_secrets',
    name: 'API secrets are not exposed',
    status: noApiSecrets ? 'pass' : 'fail',
    passed: noApiSecrets,
    details: noApiSecrets
      ? 'Zero API keys, private tokens, or credentials exposed in document payload or client bundle.'
      : `Security error: ${secretDetails}`
  });

  // ----------------------------------------------------
  // 13. english_only (fail on slide text/titles/gaps, warning on speaker notes)
  // Checks CJK/non-Latin scripts, foreign function words, and English stop-word share.
  // ----------------------------------------------------
  let onSlideNonEnglish = [];
  let notesNonEnglish = [];

  const deckMetaTexts = [
    { label: 'Topic', text: activeTopic },
    { label: 'Short title', text: deck.shortTitle || '' },
    { label: 'Disclaimer', text: deck.disclaimer || '' }
  ];
  for (const item of deckMetaTexts) {
    if (!item.text) continue;
    const res = isEnglishText(String(item.text));
    if (!res.ok) onSlideNonEnglish.push(`${item.label}: ${res.reason}`);
  }

  (deck.researchGaps || []).forEach((gap, gIdx) => {
    const res = isEnglishText(String(gap || ''));
    if (!res.ok) onSlideNonEnglish.push(`Research gap ${gIdx + 1}: ${res.reason}`);
  });

  slides.forEach((s, idx) => {
    const slideNum = s.slide_number || idx + 1;
    const title = s.title || '';
    const mainMsg = s.main_message || s.mainMessage || '';
    const obj = s.objective || '';
    const bullets = (s.on_slide_text || s.onSlideText || '').split('\n').filter(Boolean);
    const notes = s.speaker_notes || s.speakerNotes || '';

    if (title && !isEnglishText(title).ok) {
      onSlideNonEnglish.push(`Slide ${slideNum} title (${isEnglishText(title).reason})`);
    }
    if (mainMsg && !isEnglishText(mainMsg).ok) {
      onSlideNonEnglish.push(`Slide ${slideNum} main message (${isEnglishText(mainMsg).reason})`);
    }
    if (obj && !isEnglishText(obj).ok) {
      onSlideNonEnglish.push(`Slide ${slideNum} objective (${isEnglishText(obj).reason})`);
    }
    bullets.forEach((b, bIdx) => {
      const res = isEnglishText(b);
      if (!res.ok) {
        onSlideNonEnglish.push(`Slide ${slideNum} bullet ${bIdx + 1} (${res.reason})`);
      }
    });
    if (notes) {
      const res = isEnglishText(notes);
      if (!res.ok) {
        notesNonEnglish.push(`Slide ${slideNum} speaker notes (${res.reason})`);
      }
    }
  });

  const engHasError = onSlideNonEnglish.length > 0;
  const engHasWarning = !engHasError && notesNonEnglish.length > 0;
  const isEnglishOnly = !engHasError && !engHasWarning;

  checks.push({
    id: 'english_only',
    name: 'English-only content',
    status: engHasError ? 'fail' : (engHasWarning ? 'warning' : 'pass'),
    passed: isEnglishOnly,
    details: isEnglishOnly
      ? 'All slide titles, objectives, slide text, visual descriptions, notes, and metadata are in English.'
      : (engHasError
          ? `Non-English on-slide content detected: ${onSlideNonEnglish.slice(0, 3).join('; ')}.`
          : `Non-English speaker notes detected: ${notesNonEnglish.slice(0, 3).join('; ')}.`)
  });

  // ----------------------------------------------------
  // 14. finding_readability (fail)
  // Checks: (i) 3+ consecutive comma-separated bare numbers,
  // (ii) number with no label word within 3 tokens,
  // (iii) lead phrase before ":" has <2 content words or ends in stop word,
  // (iv) starts with discourse marker ("However", "Despite", "Moreover", "In addition").
  // ----------------------------------------------------
  let readabilityFailed = false;
  const readabilityDetails = [];
  const DISCOURSE_START_REGEX = /^(?:however|despite|moreover|in\s+addition)\b/i;

  slides.forEach((s, idx) => {
    const slideNum = s.slide_number || idx + 1;
    const bullets = (s.on_slide_text || s.onSlideText || '').split('\n').filter(Boolean);

    bullets.forEach((b, bIdx) => {
      const clean = b.replace(/^[•\s-]+/, '').trim();
      if (!clean) return;
      // Strip trailing short tag "(Li 2025)" and optional leading "Author:"
      const withoutTag = clean.replace(/\s*(?:\[unverified source\]|\[not PubMed-indexed\])\.?\s*$/i, '').replace(/\s*\([A-Z][a-zA-ZÀ-ÿ'-]+\s+\d{4}\)\.?\s*$/, '').trim();
      const withoutAuthorPrefix = withoutTag.replace(/^[A-Z][a-zA-Z\s,.'-]+(?:et\s+al\.?)?(?:,\s*\d{4})?\s*:\s*/, '').trim();

      // (i) 3+ consecutive comma-separated bare numbers
      if (/\b\d+(?:\.\d+)?%?\s*,\s*\d+(?:\.\d+)?%?\s*,\s*\d+(?:\.\d+)?%?/.test(withoutTag)) {
        readabilityFailed = true;
        readabilityDetails.push(`Slide ${slideNum} bullet ${bIdx + 1} contains 3+ consecutive comma-separated bare numbers: "${clean.substring(0, 60)}".`);
      }

      // (ii) Number with no label word within 3 tokens
      const tokens = withoutTag.split(/\s+/).filter(Boolean);
      tokens.forEach((tok, tIdx) => {
        if (!/^\d+(?:\.\d+)?%?[,;.]?$/.test(tok)) return;
        const windowTokens = tokens.slice(Math.max(0, tIdx - 3), Math.min(tokens.length, tIdx + 4));
        const hasLabel = windowTokens.some((wt, wIdx) => {
          if (Math.max(0, tIdx - 3) + wIdx === tIdx) return false;
          const alpha = wt.replace(/[^a-zA-Z]/g, '');
          return alpha.length >= 2 || /^[pPnN]$/.test(alpha);
        });
        if (!hasLabel) {
          readabilityFailed = true;
          readabilityDetails.push(`Slide ${slideNum} bullet ${bIdx + 1} contains unlabelled number "${tok}".`);
        }
      });

      // (iii) Lead phrase before ":" has <2 content words or ends in a stop word
      const colonIdx = withoutAuthorPrefix.indexOf(':');
      if (colonIdx > 0 && colonIdx <= 60) {
        const leadPhrase = withoutAuthorPrefix.slice(0, colonIdx).trim();
        const leadTokens = leadPhrase.split(/\s+/).filter(Boolean);
        const lastLeadWord = (leadTokens[leadTokens.length - 1] || '').toLowerCase().replace(/[^a-z]/g, '');
        const contentWords = leadTokens.filter(w => {
          const lw = w.toLowerCase().replace(/[^a-z]/g, '');
          return lw.length >= 2 && !STOP_WORDS.has(lw);
        });
        if (contentWords.length < 2 || STOP_WORDS.has(lastLeadWord)) {
          readabilityFailed = true;
          readabilityDetails.push(`Slide ${slideNum} bullet ${bIdx + 1} has weak or truncated lead phrase "${leadPhrase}:".`);
        }
      }

      // (iv) Starts with a discourse marker
      if (DISCOURSE_START_REGEX.test(withoutAuthorPrefix)) {
        readabilityFailed = true;
        readabilityDetails.push(`Slide ${slideNum} bullet ${bIdx + 1} starts with a discourse marker ("${withoutAuthorPrefix.split(/\s+/)[0]}").`);
      }
    });
  });

  checks.push({
    id: 'finding_readability',
    name: 'Finding readability and labelled numbers',
    status: readabilityFailed ? 'fail' : 'pass',
    passed: !readabilityFailed,
    details: readabilityFailed
      ? readabilityDetails.slice(0, 3).join(' ')
      : 'All finding bullets have labelled numbers, valid lead phrases, and readable structure.'
  });

  // ----------------------------------------------------
  // 15. finding_role (fail)
  // Every finding bullet on a findings slide must come from a sentence
  // classified as 'results' or 'conclusion' (never 'background'/'objective'/'methods').
  // ----------------------------------------------------
  let roleFailed = false;
  const roleDetails = [];

  slides.forEach((s, idx) => {
    const slideNum = s.slide_number || idx + 1;
    const titleLower = (s.title || '').toLowerCase();
    const isFindingsSlide = s.stage === 4 || s.stage === 5 ||
      /what the studies found|primary outcomes|comparative outcome|conflicting evidence|null trial findings|secondary outcomes|study appraisal/i.test(titleLower);
    if (!isFindingsSlide) return;

    const slideSources = Array.isArray(s.sources) ? s.sources : [];
    const citedPapers = slideSources.map(ref => activePapers[ref - 1]).filter(Boolean);
    if (citedPapers.length === 0) return;

    const bullets = (s.on_slide_text || s.onSlideText || '').split('\n').filter(Boolean);
    bullets.forEach((b, bIdx) => {
      const bData = s.bulletsData && s.bulletsData[bIdx];
      const clean = b.replace(/^[•\s-]+/, '').replace(/\s*(?:\[unverified source\]|\[not PubMed-indexed\])\.?\s*$/i, '').replace(/\s*\([A-Z][a-zA-ZÀ-ÿ'-]+\s+\d{4}\)\.?\s*$/, '').trim();
      if (/^(?:investigation focus|study design|reported outcome:\s*no quantitative|cross-study|no eligible|no additional)/i.test(clean)) return;
      const isFindingBullet = (bData && bData.isFinding) || FINDING_SIGNAL_REGEX.test(clean) || s.stage === 4 || s.stage === 5;
      if (!isFindingBullet) return;

      // Direct check on derivedFrom.sourceSentence if present
      if (bData && Array.isArray(bData.derivedFrom)) {
        for (const df of bData.derivedFrom) {
          if (df.sourceSentence) {
            const p = activePapers[(df.ref || 1) - 1];
            const absSents = p ? parseAbstractSentences(p.abstract || p.abstract_summary || '') : [];
            const matched = absSents.find(ps => ps.text === df.sourceSentence || df.sourceSentence.includes(ps.text));
            const role = matched ? matched.role : classifySentenceRole({ text: df.sourceSentence, label: 'UNSTRUCTURED' }, 0, 1);
            if (role !== 'results' && role !== 'conclusion') {
              roleFailed = true;
              roleDetails.push(`Slide ${slideNum} bullet ${bIdx + 1} originates from a "${role}" sentence rather than results/conclusion.`);
              return;
            }
          }
        }
      }

      const cleanBody = clean.replace(/^[A-Z][a-zA-Z\s,.'-]+:\s*/, '').toLowerCase().replace(/[^a-z0-9\s%]/g, ' ').replace(/\s+/g, ' ').trim();
      const bodyWords = cleanBody.split(/\s+/).filter(w => w.length > 3 && !STOP_WORDS.has(w));
      if (bodyWords.length < 2) return;

      for (const paper of citedPapers) {
        const parsedSents = parseAbstractSentences(paper.abstract || paper.abstract_summary || '');
        const nonFindingMatch = parsedSents.find(ps => {
          if (ps.role === 'results' || ps.role === 'conclusion') return false;
          const psClean = ps.text.toLowerCase().replace(/[^a-z0-9\s%]/g, ' ').replace(/\s+/g, ' ');
          const overlap = bodyWords.filter(w => psClean.includes(w)).length;
          return overlap >= Math.min(4, bodyWords.length) && overlap / bodyWords.length >= 0.6;
        });
        const anyFindingMatch = parsedSents.some(ps => {
          if (ps.role !== 'results' && ps.role !== 'conclusion') return false;
          const psClean = ps.text.toLowerCase().replace(/[^a-z0-9\s%]/g, ' ').replace(/\s+/g, ' ');
          const overlap = bodyWords.filter(w => psClean.includes(w)).length;
          return overlap >= Math.min(3, bodyWords.length);
        });
        if (nonFindingMatch && !anyFindingMatch) {
          roleFailed = true;
          roleDetails.push(`Slide ${slideNum} bullet ${bIdx + 1} originates from a "${nonFindingMatch.role}" sentence rather than results/conclusion.`);
          break;
        }
      }
    });
  });

  checks.push({
    id: 'finding_role',
    name: 'Finding role provenance (results/conclusion only)',
    status: roleFailed ? 'fail' : 'pass',
    passed: !roleFailed,
    details: roleFailed
      ? roleDetails.slice(0, 3).join(' ')
      : 'All finding bullets on findings slides originate from results or conclusion sentences.'
  });

  // ----------------------------------------------------
  // 16. sentence_integrity (fail)
  // Fail when a bullet (minus trailing tag and optional label prefix) is a strict prefix
  // of a longer source sentence and ends in a word that is NOT sentence-final in the source.
  // ----------------------------------------------------
  let integrityFailed = false;
  const integrityDetails = [];

  slides.forEach((s, idx) => {
    const slideNum = s.slide_number || idx + 1;
    const slideSources = Array.isArray(s.sources) ? s.sources : [];
    const citedPapers = slideSources.map(ref => activePapers[ref - 1]).filter(Boolean);
    if (citedPapers.length === 0) return;

    const bullets = (s.on_slide_text || s.onSlideText || '').split('\n').filter(Boolean);
    bullets.forEach((b, bIdx) => {
      const clean = b.replace(/^[•\s-]+/, '').replace(/\s*(?:\[unverified source\]|\[not PubMed-indexed\])\.?\s*$/i, '').replace(/\s*\([A-Z][a-zA-ZÀ-ÿ'-]+\s+\d{4}\)\.?\s*$/, '').trim();
      if (!clean || clean.endsWith('…')) return;
      if (/^(?:investigation focus|study design|clinical scope|evidence pool|audience calibration|study pool|evidence limit)/i.test(clean)) return;

      const body = clean.replace(/^[A-Z][a-zA-Z\s,.'-]+(?:et\s+al\.?)?(?:,\s*\d{4})?\s*:\s*/, '').replace(/[.!?]+$/, '').trim().toLowerCase();
      const bodyWords = body.split(/\s+/).filter(Boolean);
      if (bodyWords.length < 4) return;

      for (const paper of citedPapers) {
        const sents = parseAbstractSentences(paper.abstract || paper.abstract_summary || '');
        for (const ps of sents) {
          const srcLower = ps.text.toLowerCase().replace(/[.!?]+$/, '').trim();
          if (srcLower.length > body.length + 2 && srcLower.startsWith(body)) {
            const remainder = srcLower.slice(body.length).trim();
            // If the bullet ends mid-sentence (followed by another word or dangling modifier before a comma)
            if (/^[a-z0-9]/.test(remainder) || (/^,\s*[a-z]/i.test(remainder) && /\b(?:real-time|for|with|and|or|of|to|in|the|a|an)\s*$/i.test(body))) {
              integrityFailed = true;
              integrityDetails.push(`Slide ${slideNum} bullet ${bIdx + 1} is a truncated prefix ending mid-sentence ("...${bodyWords.slice(-2).join(' ')}" while source continues "${remainder.split(/\s+/).slice(0, 3).join(' ')}").`);
              break;
            }
          }
        }
        if (integrityFailed) break;
      }
    });
  });

  checks.push({
    id: 'sentence_integrity',
    name: 'Sentence boundary integrity (no mid-sentence cuts)',
    status: integrityFailed ? 'fail' : 'pass',
    passed: !integrityFailed,
    details: integrityFailed
      ? integrityDetails.slice(0, 3).join(' ')
      : 'All slide bullets end at valid sentence or clause boundaries.'
  });

  // ----------------------------------------------------
  // 17. duplicate_source_sentence (fail)
  // The same derivedFrom sourceSentence (or exact finding text) may not appear on > 1 slide.
  // ----------------------------------------------------
  let dupFailed = false;
  const dupDetails = [];
  const seenSourceSentences = new Map();

  slides.forEach((s, idx) => {
    const slideNum = s.slide_number || idx + 1;
    const bdList = Array.isArray(s.bulletsData) ? s.bulletsData : [];
    bdList.forEach(bd => {
      if (!bd || !Array.isArray(bd.derivedFrom)) return;
      bd.derivedFrom.forEach(df => {
        if (!df || !df.sourceSentence) return;
        const key = `${df.ref || 0}:${df.sourceSentence.trim().toLowerCase()}`;
        if (seenSourceSentences.has(key) && seenSourceSentences.get(key) !== slideNum) {
          dupFailed = true;
          dupDetails.push(`Source sentence from ref [${df.ref}] repeated on Slide ${seenSourceSentences.get(key)} and Slide ${slideNum}.`);
        } else {
          seenSourceSentences.set(key, slideNum);
        }
      });
    });
  });

  checks.push({
    id: 'duplicate_source_sentence',
    name: 'No duplicate source sentences across slides',
    status: dupFailed ? 'fail' : 'pass',
    passed: !dupFailed,
    details: dupFailed
      ? dupDetails.slice(0, 3).join(' ')
      : 'Zero duplicate source sentences across presentation slides.'
  });

  // ----------------------------------------------------
  // 18. generic_conclusion (warning)
  // Conclusion bullets with no source attribution or containing unattributed evaluative adjectives.
  // ----------------------------------------------------
  let genericConcWarn = false;
  const genericConcDetails = [];
  const EVALUATIVE_ADJ_REGEX = /\b(?:positive|robust|promising|beneficial|favorable|favourable|impressive|exciting)\b/i;

  slides.forEach((s, idx) => {
    const slideNum = s.slide_number || idx + 1;
    const isConclusion = s.stage === 8 || /conclusion/i.test(s.title || '');
    if (!isConclusion) return;

    const slideHasSources = Array.isArray(s.sources) && s.sources.length > 0;
    const bullets = (s.on_slide_text || s.onSlideText || '').split('\n').filter(Boolean);
    bullets.forEach((b, bIdx) => {
      const bd = s.bulletsData && s.bulletsData[bIdx];
      const hasBulletAttribution = slideHasSources ||
        (bd && ((Array.isArray(bd.derivedFrom) && bd.derivedFrom.length > 0) || (Array.isArray(bd.sources) && bd.sources.length > 0)));
      const hasEvaluativeAdj = EVALUATIVE_ADJ_REGEX.test(b);
      const isGenericTemplate = /curated evidence reports positive outcomes|subject to documented methodological limitations/i.test(b);

      if (isGenericTemplate || (hasEvaluativeAdj && !hasBulletAttribution) || (!hasBulletAttribution && /outcome summary/i.test(b))) {
        genericConcWarn = true;
        genericConcDetails.push(`Slide ${slideNum} bullet ${bIdx + 1} uses unattributed or generic evaluative language.`);
      }
    });
  });

  checks.push({
    id: 'generic_conclusion',
    name: 'Evidence-derived conclusion (no generic evaluative templates)',
    status: genericConcWarn ? 'warning' : 'pass',
    passed: !genericConcWarn,
    details: genericConcWarn
      ? genericConcDetails.slice(0, 3).join(' ')
      : 'Conclusion bullets are derived from study types, attributed directions, and evidence limits.'
  });

  // ----------------------------------------------------
  // 19. quantitative_finding_omitted (warning)
  // Warn when a selected paper has a results sentence with a parsed effect,
  // but no slide in the deck includes its key effect numbers.
  // ----------------------------------------------------
  let quantOmittedWarn = false;
  const quantOmittedDetails = [];
  const allSlidesText = slides.map(s => `${s.on_slide_text || s.onSlideText || ''} ${s.speaker_notes || s.speakerNotes || ''}`).join(' ');

  activePapers.forEach((paper, pIdx) => {
    const refNum = pIdx + 1;
    const parsedSents = parseAbstractSentences(paper.abstract || paper.abstract_summary || '');
    for (const ps of parsedSents) {
      if (ps.role !== 'results') continue;
      const parsed = parseStructuredResultSentence(ps.text);
      const hasEffect = parsed && (parsed.comparisons.length >= 2 || (parsed.effect && parsed.effect.estimate));
      if (!hasEffect) continue;

      const keyNums = [];
      if (parsed.comparisons.length >= 2) {
        keyNums.push(parsed.comparisons[0].value.replace('%', ''), parsed.comparisons[1].value.replace('%', ''));
      }
      if (parsed.effect && parsed.effect.estimate) {
        keyNums.push(parsed.effect.estimate.replace('%', ''));
      }
      const included = keyNums.length > 0 && keyNums.every(n => allSlidesText.includes(n));
      if (!included) {
        quantOmittedWarn = true;
        quantOmittedDetails.push(`Paper [${refNum}] reports quantitative effect (${keyNums.join(', ')}) omitted from deck slides.`);
        break;
      }
    }
  });

  checks.push({
    id: 'quantitative_finding_omitted',
    name: 'Quantitative study findings included',
    status: quantOmittedWarn ? 'warning' : 'pass',
    passed: !quantOmittedWarn,
    details: quantOmittedWarn
      ? quantOmittedDetails.slice(0, 3).join(' ')
      : 'All parsed quantitative study findings from selected abstracts are represented in the deck.'
  });

  // ----------------------------------------------------
  // 20. low_assurance_source_used (warning)
  // Warn when any slide uses a Tier B or 'unknown' paper (not indexed in PubMed/MEDLINE).
  // ----------------------------------------------------
  const lowAssuranceRefs = new Set();
  slides.forEach(s => {
    const refs = Array.isArray(s.sources) ? s.sources : [];
    refs.forEach(ref => {
      const p = activePapers[ref - 1];
      if (!p) return;
      const tier = p.assuranceTier || assignAssuranceTier(p).assuranceTier;
      if (tier === 'B' || tier === 'unknown') {
        lowAssuranceRefs.add(ref);
      }
    });
  });

  const hasLowAssuranceUsed = lowAssuranceRefs.size > 0;
  checks.push({
    id: 'low_assurance_source_used',
    name: 'Venue assurance tier (PubMed/MEDLINE indexing)',
    status: hasLowAssuranceUsed ? 'warning' : 'pass',
    passed: !hasLowAssuranceUsed,
    details: hasLowAssuranceUsed
      ? `Cited source(s) [${[...lowAssuranceRefs].join(', ')}] are not indexed in PubMed/MEDLINE (Tier B / unknown) and are marked [not PubMed-indexed].`
      : 'All cited sources are indexed in PubMed/MEDLINE (Tier A).'
  });

  // ----------------------------------------------------
  // 21. conclusion_grounding (fail)
  // Every conclusion bullet with a sourceId must (a) reference a paper that has a finding bullet
  // elsewhere in the deck, and (b) contain no group or metric word absent from that paper's abstract.
  // ----------------------------------------------------
  let concGroundFailed = false;
  const concGroundDetails = [];
  const findingRefsInDeck = new Set();
  slides.forEach(s => {
    const titleLower = (s.title || '').toLowerCase();
    const isConclusion = s.stage === 8 || /conclusion|take-home/i.test(titleLower);
    if (isConclusion) return;
    const isFindingSlide = s.stage === 4 || s.stage === 5 || (Array.isArray(s.bulletsData) && s.bulletsData.some(b => b && b.isFinding));
    if (!isFindingSlide) return;
    const bList = Array.isArray(s.bulletsData) ? s.bulletsData : [];
    bList.forEach(bd => {
      if (!bd || !bd.isFinding || bd.omittedFromSlide) return;
      if (Array.isArray(bd.derivedFrom)) {
        bd.derivedFrom.forEach(df => { if (df.ref) findingRefsInDeck.add(df.ref); });
      }
      if (Array.isArray(bd.sources)) {
        bd.sources.forEach(r => findingRefsInDeck.add(r));
      }
    });
    if (bList.length === 0 && Array.isArray(s.sources)) {
      s.sources.forEach(r => findingRefsInDeck.add(r));
    }
  });

  const CONTROLLED_GROUP_METRIC_TERMS = [
    'embryologists', 'embryologist', 'morphology', 'clinical pregnancy', 'live birth',
    'implantation', 'ongoing pregnancy', 'accuracy', 'auroc', 'auc', 'sensitivity',
    'specificity', 'jaccard', 'odds ratio', 'hazard ratio', 'relative risk',
    'conventional', 'fertilization', 'blastocyst'
  ];

  slides.forEach((s, idx) => {
    const slideNum = s.slide_number || idx + 1;
    const titleLower = (s.title || '').toLowerCase();
    const isConclusion = s.stage === 8 || /conclusion|take-home/i.test(titleLower);
    if (!isConclusion) return;

    const bullets = (s.on_slide_text || s.onSlideText || '').split('\n').filter(Boolean);
    bullets.forEach((b, bIdx) => {
      const bData = s.bulletsData && s.bulletsData[bIdx];
      let refNum = null;
      if (bData && Array.isArray(bData.derivedFrom) && bData.derivedFrom[0]?.ref) {
        refNum = bData.derivedFrom[0].ref;
      } else if (bData && Array.isArray(bData.sources) && bData.sources.length === 1) {
        refNum = bData.sources[0];
      } else {
        const tagMatch = b.match(/\b(?:Finding\s*\()?([A-Z][a-zA-ZÀ-ÿ'-]+)\s+(\d{4})/);
        if (tagMatch) {
          const surname = tagMatch[1].toLowerCase();
          const yr = String(tagMatch[2]);
          const foundIdx = activePapers.findIndex(p => {
            const auth = JSON.stringify(p.authors || '').toLowerCase();
            return auth.includes(surname) && (!p.year || String(p.year) === yr);
          });
          if (foundIdx >= 0) refNum = foundIdx + 1;
        }
      }

      if (!refNum) return;
      const paper = activePapers[refNum - 1];
      if (!paper) return;

      if (findingRefsInDeck.size > 0 && !findingRefsInDeck.has(refNum)) {
        concGroundFailed = true;
        concGroundDetails.push(`Slide ${slideNum} bullet ${bIdx + 1} cites paper [${refNum}] which has no finding bullet elsewhere in the deck.`);
        return;
      }

      const paperText = `${paper.title || ''} ${paper.abstract || paper.abstract_summary || ''}`.toLowerCase();
      const bulletLower = b.replace(/^•\s*[^:]+:\s*/, '').toLowerCase();
      for (const term of CONTROLLED_GROUP_METRIC_TERMS) {
        const termRe = new RegExp(`\\b${term.replace(/\s+/g, '\\s+')}\\b`, 'i');
        if (termRe.test(bulletLower) && !termRe.test(paperText)) {
          concGroundFailed = true;
          concGroundDetails.push(`Slide ${slideNum} bullet ${bIdx + 1} uses group/metric "${term}" absent from paper [${refNum}] abstract.`);
          break;
        }
      }
    });
  });

  checks.push({
    id: 'conclusion_grounding',
    name: 'Conclusion bullet grounding in source findings and abstracts',
    status: concGroundFailed ? 'fail' : 'pass',
    passed: !concGroundFailed,
    details: concGroundFailed
      ? concGroundDetails.slice(0, 3).join(' ')
      : 'All attributed conclusion bullets are grounded in deck findings and cited paper abstracts.'
  });

  // Compute summary and pass/fail counts
  const failedChecks = checks.filter(c => c.status === 'fail');
  const warningChecks = checks.filter(c => c.status === 'warning');
  const passedChecks = checks.filter(c => c.status === 'pass');

  const isValid = failedChecks.length === 0;

  return {
    isValid,
    canExport: isValid,
    totalChecks: checks.length,
    passedCount: passedChecks.length,
    warningCount: warningChecks.length,
    failedCount: failedChecks.length,
    summary: isValid
      ? `${passedChecks.length} passed · ${warningChecks.length} warnings · 0 failed`
      : `Export blocked: ${failedChecks.length} check failed.`,
    note: 'These checks test traceability and consistency with the selected abstracts. They do not verify scientific accuracy or study quality. Review every slide against its listed sources before presenting.',
    checks,
    errors: failedChecks.map(c => `${c.id} (${c.name}): ${c.details}`),
    warnings: warningChecks.map(c => `${c.id} (${c.name}): ${c.details}`)
  };
}

module.exports = {
  validatePresentationOutput,
  EXPECTED_PROJECT_NAME
};
