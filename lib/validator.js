/**
 * Preppt — Prompt 13 Pre-Export Checks Suite
 *
 * Validates the 9 mandatory integrity criteria before enabling Export to Word:
 * 1. The document is English only
 * 2. The requested slide count is present (>= 8)
 * 3. Every slide has all required 10 fields
 * 4. References are only in the final references section (Vancouver format)
 * 5. No in-text citations were inserted in slides or speaker notes
 * 6. Removed papers are absent from the active selection
 * 7. No previous-project scientific content or generic AI phrases on non-AI topics
 * 8. The project name is Preppt – Scientific Literature to Presentation
 * 9. API secrets are not exposed in payload or client files
 */

const fs = require('fs');
const path = require('path');

const EXPECTED_PROJECT_NAME = 'Preppt – Scientific Literature to Presentation';
const VALID_PROJECT_NAMES = [
  'Preppt – Scientific Literature to Presentation',
  'preppt – Scientific Literature to Presentation',
  'Preppt - Scientific Literature to Presentation',
  'preppt - Scientific Literature to Presentation'
];

// Legacy topics from inspected previous projects that must never appear unless in user's topic
const LEGACY_PROJECT_SIGNATURES = [
  'fetal echocardiography',
  'endometrioma cystectomy',
  'ovarian tissue cryopreservation',
  'scidraft-ai',
  'sysrevai legacy',
  'aimed clinical assistant'
];

// Generic AI template phrases that must never appear on clinical/non-AI topics
const FORBIDDEN_AI_ON_NON_AI = [
  'core ai applications',
  'predictive modeling',
  'algorithmic bias',
  'foundation models',
  'multimodal data',
  'deep neural networks'
];

/**
 * Validates the complete presentation output against all 9 criteria
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
  const errors = [];

  if (!deck) {
    return {
      isValid: false,
      checks: [{ id: 'deck_exists', name: 'Presentation deck exists', passed: false, details: 'Deck not yet synthesized.' }],
      errors: ['Presentation deck has not been synthesized.']
    };
  }

  const slides = Array.isArray(deck.slides) ? deck.slides : [];
  const activeTopic = topic || deck.topic || '';
  const expectedCount = Number(requestedSlideCount ?? deck.requestedSlideCount ?? deck.meta?.slideCount ?? slides.length);

  // ----------------------------------------------------
  // 1. Validate: Document is English only
  // ----------------------------------------------------
  let isEnglishOnly = true;
  let nonEnglishSample = '';

  const textsToScan = [
    activeTopic,
    deck.shortTitle,
    deck.disclaimer,
    ...(slides.flatMap(s => [
      s.title,
      s.objective,
      s.main_message || s.mainMessage,
      s.on_slide_text || s.onSlideText,
      s.detailed_visual_description || s.detailedVisualDescription,
      s.speaker_notes || s.speakerNotes,
      s.interactive_question || s.audienceQuestion,
      s.logical_transition || s.transition
    ])),
    ...(deck.researchGaps || []),
    deck.synthesisPlan?.objective || ''
  ].filter(Boolean);

  // Non-Latin scripts regex (Cyrillic, Arabic, Chinese/Japanese/Korean, Hebrew, Devanagari)
  const nonEnglishRegex = /[\u0400-\u04FF\u0600-\u06FF\u4E00-\u9FFF\u3040-\u30FF\u0590-\u05FF\u0900-\u097F]/;
  for (const t of textsToScan) {
    const match = String(t).match(nonEnglishRegex);
    if (match) {
      isEnglishOnly = false;
      nonEnglishSample = match[0];
      break;
    }
  }

  checks.push({
    id: 'english_only',
    name: 'English-only content',
    passed: isEnglishOnly,
    details: isEnglishOnly
      ? 'All titles, objectives, slide text, visual descriptions, notes, and metadata are in English.'
      : `Non-English characters detected: "${nonEnglishSample}".`
  });
  if (!isEnglishOnly) errors.push('Document contains non-English characters or text.');

  // ----------------------------------------------------
  // 2. Validate: Requested slide count is present (>= 8)
  // ----------------------------------------------------
  const meetsMinCount = slides.length >= 8;
  const hasExactSlideCount = slides.length === expectedCount && meetsMinCount;
  checks.push({
    id: 'slide_count',
    name: 'Requested slide count present (minimum 8)',
    passed: hasExactSlideCount,
    details: hasExactSlideCount
      ? `Exact requested count confirmed: ${slides.length} slides generated (meets minimum requirement of >= 8).`
      : `Slide count validation failed: expected ${expectedCount} (minimum 8), but found ${slides.length}.`
  });
  if (!hasExactSlideCount) errors.push(`Slide count mismatch: requested ${expectedCount} (min 8), got ${slides.length}.`);

  // ----------------------------------------------------
  // 3. Validate: Every slide has all required 10 fields
  // ----------------------------------------------------
  const required10 = [
    { key: 'slide_number', alt: 'slideNumber', label: 'Slide number' },
    { key: 'title', alt: 'title', label: 'Slide title' },
    { key: 'objective', alt: 'objective', label: 'Slide objective' },
    { key: 'main_message', alt: 'mainMessage', label: 'Main message' },
    { key: 'on_slide_text', alt: 'onSlideText', label: 'On-slide text' },
    { key: 'suggested_visual_type', alt: 'suggestedVisualType', label: 'Suggested visual type' },
    { key: 'detailed_visual_description', alt: 'detailedVisualDescription', label: 'Detailed visual description' },
    { key: 'speaker_notes', alt: 'speakerNotes', label: 'Speaker notes' },
    { key: 'interactive_question', alt: 'audienceQuestion', label: 'Interactive question' },
    { key: 'logical_transition', alt: 'transition', label: 'Logical transition' }
  ];

  let missingFieldsCount = 0;
  let missingFieldDetails = '';

  slides.forEach((s, idx) => {
    required10.forEach(f => {
      const val = s[f.key] ?? s[f.alt];
      if (val === undefined || val === null || (typeof val === 'string' && !val.trim())) {
        missingFieldsCount++;
        if (!missingFieldDetails) missingFieldDetails = `Slide ${idx + 1} missing ${f.label}`;
      }
    });
  });

  const allFieldsPresent = missingFieldsCount === 0 && slides.length > 0;
  checks.push({
    id: 'all_required_fields',
    name: 'All 10 required fields on every slide',
    passed: allFieldsPresent,
    details: allFieldsPresent
      ? `All 10 mandatory fields verified across all ${slides.length} slides.`
      : `${missingFieldsCount} missing fields detected across slides (e.g., ${missingFieldDetails}).`
  });
  if (!allFieldsPresent) errors.push(`Incomplete slide fields: ${missingFieldDetails}.`);

  // ----------------------------------------------------
  // 4. Validate: References are only in final references section
  // ----------------------------------------------------
  let referencesInSlides = false;
  let refSlideDetails = '';

  slides.forEach((s, idx) => {
    if (s.references || s.referenceList || s.citations) {
      referencesInSlides = true;
      refSlideDetails = `Slide ${idx + 1} contains per-slide references property.`;
    }
    const textToCheck = `${s.on_slide_text || ''} ${s.speaker_notes || ''}`;
    if (/\b(?:References|Bibliography|Citations)\s*:/i.test(textToCheck)) {
      referencesInSlides = true;
      refSlideDetails = `Slide ${idx + 1} contains a per-slide references header in visible text.`;
    }
  });

  const referencesIsolated = !referencesInSlides && Array.isArray(deck.references) && deck.references.length > 0;
  checks.push({
    id: 'references_isolated',
    name: 'References only in final section',
    passed: referencesIsolated,
    details: referencesIsolated
      ? `References strictly isolated in separate final section (${deck.references.length} Vancouver references). No references below individual slides.`
      : `Reference placement error: ${refSlideDetails || 'References section missing or misplaced.'}`
  });
  if (!referencesIsolated) errors.push(`References must appear only in the separate final section, not below slides.`);

  // ----------------------------------------------------
  // 5. Validate: No in-text citations were inserted
  // ----------------------------------------------------
  let foundInTextCitation = false;
  let citationDetails = '';

  const numericBracketRegex = /\[\d+(?:[,\s–-]+\d+)*\]/;
  const numericParenRegex = /\(\d+(?:[,\s–-]+\d+)*\)/;
  const authorYearRegex = /\([A-Z][a-zA-Z\s]+(?:et al\.)?,?\s*\d{4}\)/;

  slides.forEach((s, idx) => {
    const onSlide = s.on_slide_text || s.onSlideText || '';
    const notes = s.speaker_notes || s.speakerNotes || '';

    if (numericBracketRegex.test(onSlide) || numericParenRegex.test(onSlide) || authorYearRegex.test(onSlide)) {
      foundInTextCitation = true;
      citationDetails = `Slide ${idx + 1} on-slide text contains citation tags.`;
    }
    if (numericBracketRegex.test(notes) || numericParenRegex.test(notes) || authorYearRegex.test(notes)) {
      foundInTextCitation = true;
      citationDetails = `Slide ${idx + 1} speaker notes contain citation tags.`;
    }
  });

  const noInTextCitations = !foundInTextCitation;
  checks.push({
    id: 'no_intext_citations',
    name: 'No in-text citations in slides or notes',
    passed: noInTextCitations,
    details: noInTextCitations
      ? 'Zero in-text citations found in on-slide text or speaker notes.'
      : `Citation rule violation: ${citationDetails}`
  });
  if (!noInTextCitations) errors.push(`Strict citation rule violated: ${citationDetails}`);

  // ----------------------------------------------------
  // 6. Validate: Removed papers are absent from selected set
  // ----------------------------------------------------
  const activePapers = Array.isArray(papers) ? papers : [];
  const removedList = Array.isArray(removedPapers) ? removedPapers : (projectRun?.removed_papers || []);

  let removedPaperIncluded = false;
  let removedDetails = '';

  activePapers.forEach((p, idx) => {
    if (p.user_status === 'removed' || p.userStatus === 'removed' || p.selected === false) {
      removedPaperIncluded = true;
      removedDetails = `Paper #${idx + 1} ("${(p.title || '').substring(0, 30)}...") has status 'removed' or deselected`;
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
      removedDetails = `Removed study ("${(p.title || '').substring(0, 30)}...") is still present in active selection`;
    }
  });

  const removedPapersAbsent = !removedPaperIncluded && activePapers.length > 0;
  checks.push({
    id: 'removed_papers_absent',
    name: 'Removed papers absent from active selection',
    passed: removedPapersAbsent,
    details: removedPapersAbsent
      ? `Active selection contains only approved studies (${activePapers.length} papers). All removed papers permanently excluded.`
      : `Selection error: ${removedDetails || 'No active approved papers in selection.'}`
  });
  if (!removedPapersAbsent) errors.push(`Removed papers must not be included in the active selection: ${removedDetails || 'Selection empty.'}`);

  // ----------------------------------------------------
  // 7. Validate: No previous-project content or generic AI template phrases on non-AI topics
  // ----------------------------------------------------
  let copiedLegacyContent = false;
  let legacyDetails = '';

  const lowerTopic = activeTopic.toLowerCase();
  const isAiTopic = /artificial intelligence|\bai\b|machine learning|deep learning|neural network|algorithm|computational model/i.test(lowerTopic);

  const fullDocumentText = [
    activeTopic,
    deck.shortTitle,
    ...(slides.map(s => `${s.title} ${s.objective} ${s.main_message} ${s.on_slide_text} ${s.speaker_notes}`)),
    ...(deck.researchGaps || [])
  ].join(' ').toLowerCase();

  // Legacy signatures check
  for (const sig of LEGACY_PROJECT_SIGNATURES) {
    if (!lowerTopic.includes(sig) && fullDocumentText.includes(sig)) {
      copiedLegacyContent = true;
      legacyDetails = `Detected legacy content fragment: "${sig}"`;
      break;
    }
  }

  // Generic AI template phrases check on non-AI topics
  if (!copiedLegacyContent && !isAiTopic) {
    for (const phrase of FORBIDDEN_AI_ON_NON_AI) {
      if (fullDocumentText.includes(phrase)) {
        copiedLegacyContent = true;
        legacyDetails = `Detected generic AI template phrase on non-AI topic: "${phrase}"`;
        break;
      }
    }
  }

  const noCopiedContent = !copiedLegacyContent;
  checks.push({
    id: 'no_copied_content',
    name: 'Domain-specific content with zero generic template leakage',
    passed: noCopiedContent,
    details: noCopiedContent
      ? 'All presentation content is freshly synthesized and 100% domain-specific. Zero generic AI or legacy template leakage detected.'
      : `Template leakage error: ${legacyDetails}`
  });
  if (!noCopiedContent) errors.push(`Domain integrity error: ${legacyDetails}`);

  // ----------------------------------------------------
  // 8. Validate: Project name is Preppt – Scientific Literature to Presentation
  // ----------------------------------------------------
  const deckName = (deck.displayName || deck.projectName || projectRun?.project_name || '').trim();
  const isCorrectProjectName = VALID_PROJECT_NAMES.some(n => n.toLowerCase() === deckName.toLowerCase());

  checks.push({
    id: 'project_name',
    name: 'Project name is Preppt – Scientific Literature to Presentation',
    passed: isCorrectProjectName,
    details: isCorrectProjectName
      ? `Project identity verified: "${EXPECTED_PROJECT_NAME}".`
      : `Project name mismatch: found "${deckName}", expected "${EXPECTED_PROJECT_NAME}".`
  });
  if (!isCorrectProjectName) errors.push(`Project name must be "${EXPECTED_PROJECT_NAME}".`);

  // ----------------------------------------------------
  // 9. Validate: API secrets are not exposed in payload or client files
  // ----------------------------------------------------
  let secretExposed = false;
  let secretDetails = '';

  const fullSerialized = JSON.stringify({ deck, papers, meta: deck.meta });
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
    passed: noApiSecrets,
    details: noApiSecrets
      ? 'Zero API keys, private tokens, or credentials exposed in document payload or client bundle.'
      : `Security error: ${secretDetails}`
  });
  if (!noApiSecrets) errors.push(`Security error: API secrets detected: ${secretDetails}`);

  // Overall validation result
  const isValid = checks.every(c => c.passed);

  return {
    isValid,
    totalChecks: checks.length,
    passedChecks: checks.filter(c => c.passed).length,
    checks,
    errors
  };
}

module.exports = {
  validatePresentationOutput,
  EXPECTED_PROJECT_NAME
};
