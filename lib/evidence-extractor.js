/**
 * Preppt Evidence Extractor (lib/evidence-extractor.js)
 * Builds structured evidence records from paper titles and abstracts only.
 * Enforces strict sentence boundary splitting, explicit null/negative result detection,
 * and claim-to-source traceability.
 */

// Common scientific abbreviations that should not trigger sentence boundaries
const PROTECTED_ABBREVIATIONS = [
  'e\\.g\\.', 'i\\.e\\.', 'vs\\.', 'et al\\.', 'al\\.', 'approx\\.', 'fig\\.', 'tab\\.',
  'no\\.', 'vol\\.', 'ref\\.', 'refs\\.', 'dr\\.', 'prof\\.', 'st\\.', 'dept\\.',
  'ci\\.', 'hr\\.', 'or\\.', 'rr\\.', 'p\\.', 'pp\\.', 'ca\\.'
];

// Structured abstract prefixes to strip from sentence starts
const STRUCTURED_LABEL_REGEX = /^(?:SUMMARY ANSWER|WHAT IS KNOWN ALREADY|STUDY QUESTION|BACKGROUND|OBJECTIVES?|AIMS?|METHODS?|PARTICIPANTS(?:\/MATERIALS)?|SETTING|PATIENTS|INTERVENTIONS?|MAIN OUTCOME MEASURES?|RESULTS?|LIMITATIONS?(?:, REASONS FOR CAUTION)?|WIDER IMPLICATIONS OF THE FINDINGS|TRIAL REGISTRATION NUMBER|CONCLUSIONS?|SIGNIFICANCE)\s*[:–-]\s*/i;

// Stop words that indicate a truncated sentence
const STOP_WORDS_AT_END = new Set([
  'on', 'to', 'the', 'of', 'with', 'and', 'in', 'by', 'for', 'at', 'from',
  'a', 'an', 'that', 'which', 'as', 'is', 'are', 'was', 'were', 'or', 'but'
]);

/**
 * Splits text into complete sentences while preserving decimals, abbreviations, and statistics
 */
function splitIntoSentences(text) {
  if (!text || typeof text !== 'string') return [];

  let clean = text.trim();
  if (!clean) return [];

  // Protect decimals and statistics (e.g. 0.82, 1.5, P = 0.02, P < 0.001, ∼30%, 95% CI)
  // Replace protected periods with a unique token
  const DOT_TOKEN = '___DOT___';

  // Protect decimals like 0.05
  clean = clean.replace(/(\d+)\.(\d+)/g, `$1${DOT_TOKEN}$2`);

  // Protect common scientific abbreviations
  PROTECTED_ABBREVIATIONS.forEach(abbr => {
    const regex = new RegExp(`\\b${abbr}`, 'gi');
    clean = clean.replace(regex, match => match.replace(/\./g, DOT_TOKEN));
  });

  // Protect P value notations: P = 0.02, p < 0.001
  clean = clean.replace(/\b([pP])\s*([=<>≤≥])\s*(\d+)${DOT_TOKEN}(\d+)/g, `$1 $2 $3${DOT_TOKEN}$4`);

  // Split by sentence terminators (. ! ?) followed by whitespace or quote/bracket
  const rawSentences = clean.split(/(?<=[.!?])\s+(?=[A-Z0-9"'(])/);

  const sentences = [];
  for (let s of rawSentences) {
    // Restore protected dots
    let restored = s.replace(new RegExp(DOT_TOKEN, 'g'), '.').trim();

    // Strip structured abstract section header if present
    restored = restored.replace(STRUCTURED_LABEL_REGEX, '').trim();

    // Avoid empty or single-character noise
    if (!restored || restored.length < 5) continue;

    // Check if sentence ends in a stop word or lacks punctuation
    restored = cleanSentenceEnding(restored);

    if (restored) {
      sentences.push(restored);
    }
  }

  return sentences;
}

/**
 * Ensures a sentence ends with proper terminal punctuation and does not end in a stop word
 */
function cleanSentenceEnding(sentence) {
  let s = sentence.trim();
  if (!s) return null;

  // Remove trailing ellipsis or broken fragments
  s = s.replace(/[\s\.\,…–-]+$/, '');

  const words = s.split(/\s+/);
  if (words.length === 0) return null;

  const lastWord = words[words.length - 1].toLowerCase().replace(/[^a-z]/g, '');
  if (STOP_WORDS_AT_END.has(lastWord)) {
    // Drop the trailing stop word if sentence was cut
    words.pop();
    s = words.join(' ').replace(/[\s\.\,…–-]+$/, '');
  }

  if (!s || s.length < 5) return null;

  // Ensure sentence ends with valid terminal punctuation
  if (!/[.!?]$/.test(s)) {
    s += '.';
  }

  return s;
}

/**
 * Determines outcome direction: "no difference" | "favours comparator" | "favours intervention" | "unclear"
 */
function detectOutcomeDirection(sentence) {
  const text = sentence.toLowerCase();

  // 1. Explicit null or negative result patterns
  const nullPatterns = [
    /no\s+(?:statistically\s+)?significant\s+difference/i,
    /no\s+(?:significant\s+)?evidence\s+of\s+benefit/i,
    /did\s+not\s+(?:significantly\s+)?(?:reduce|improve|decrease|increase|differ|alter|demonstrate|show|reach)/i,
    /failed\s+to\s+(?:significantly\s+)?(?:reduce|improve|decrease|increase|show|demonstrate|reach)/i,
    /(?:was|were)\s+not\s+able\s+to\s+demonstrate/i,
    /not\s+able\s+to\s+demonstrate\s+(?:noninferiority|non-inferiority|superiority|benefit)/i,
    /noninferiority\s+(?:was\s+not|could\s+not\s+be)\s+(?:demonstrated|established|shown)/i,
    /non-inferiority\s+(?:was\s+not|could\s+not\s+be)\s+(?:demonstrated|established|shown)/i,
    /failed\s+to\s+(?:demonstrate|establish|show)\s+(?:noninferiority|non-inferiority)/i,
    /(?:was|were)\s+not\s+(?:non-inferior|noninferior|superior)/i,
    /similar\s+(?:clinical\s+)?(?:outcomes?|rates?|efficacy|pregnancy\s+rates?|survival)/i,
    /comparable\s+(?:clinical\s+)?(?:outcomes?|rates?|efficacy)/i,
    /did\s+not\s+translate\s+into\s+improved/i,
    /confidence\s+interval\s+(?:crossed|spanned|included)\s+(?:zero|1(?:\.0)?|unity)/i,
    /p\s*[=>]\s*0\.0[5-9]/i,
    /p\s*>\s*0\.05/i,
    /not\s+statistically\s+significant/i,
    /without\s+(?:statistically\s+)?significant\s+(?:difference|benefit)/i
  ];

  for (const pat of nullPatterns) {
    if (pat.test(text)) {
      return 'no difference';
    }
  }

  // 2. Harm / Inferiority patterns (favours comparator)
  const harmPatterns = [
    /significantly\s+higher\s+(?:rate\s+of\s+death|mortality|adverse\s+events|harm)/i,
    /increased\s+risk\s+of\s+(?:death|adverse|harm)/i,
    /inferior\s+to/i,
    /worse\s+(?:outcomes?|survival|efficacy)/i
  ];
  for (const pat of harmPatterns) {
    if (pat.test(text)) {
      return 'favours comparator';
    }
  }

  // 3. Positive benefit / intervention superiority patterns
  const benefitPatterns = [
    /significantly\s+(?:reduced|decreased|improved|increased|lowered)/i,
    /significant\s+reduction/i,
    /superior\s+to\s+placebo/i,
    /superior\s+to\s+control/i,
    /demonstrated\s+(?:significant|clear|meaningful)\s+(?:benefit|efficacy|improvement)/i,
    /p\s*<\s*0\.0[0-5]/i,
    /p\s*=\s*0\.0[0-4]\d*/i
  ];

  for (const pat of benefitPatterns) {
    if (pat.test(text)) {
      return 'favours intervention';
    }
  }

  return 'unclear';
}

/**
 * Identifies sentences stating study limitations or cautionary notes
 */
function isLimitationSentence(sentence) {
  const text = sentence.toLowerCase();
  return (
    text.includes('limitation') ||
    text.includes('limitations') ||
    text.includes('caution') ||
    text.includes('underpowered') ||
    text.includes('risk of bias') ||
    text.includes('retrospective design') ||
    text.includes('observational nature') ||
    text.includes('small sample') ||
    text.includes('short follow-up') ||
    text.includes('generalizability') ||
    text.includes('further studies are needed') ||
    text.includes('further research is warranted') ||
    text.includes('requires prospective validation') ||
    text.includes('potential confounding') ||
    text.includes('unmeasured confound')
  );
}

/**
 * Extracts candidate outcomes with statistical measures from findings sentences
 */
function extractOutcomesFromSentences(sentences) {
  const outcomes = [];

  sentences.forEach(s => {
    const direction = detectOutcomeDirection(s);

    // Look for statistical measures (HR, OR, RR, 95% CI, %, P value)
    const statsMatch = s.match(/(?:HR|OR|RR|hazard ratio|odds ratio|relative risk)?\s*\d+(?:\.\d+)?\s*(?:;\s*)?(?:95%\s*CI\s*[,\(\[]\s*[\d\.\s–-]+[,\)\]])?(?:;\s*)?(?:P\s*[=<>]+\s*[\d\.]+)?/i);
    const statsText = statsMatch ? statsMatch[0].trim() : null;

    // Detect outcome name hints from sentence or default to Primary Trial Endpoint
    let outcomeName = 'Primary Trial Endpoint';
    if (/adverse event|tolerability|safety|complication/i.test(s)) {
      outcomeName = 'Safety & Tolerability Profile';
    } else if (/mortality|overall survival/i.test(s)) {
      outcomeName = 'Mortality / Overall Survival';
    }

    // Only include if sentence reports an actual result / conclusion
    if (direction !== 'unclear' || statsText || /found that|showed that|demonstrated that|concluded that/i.test(s)) {
      outcomes.push({
        name: outcomeName,
        result: s,
        direction,
        statsText
      });
    }
  });

  return outcomes;
}

/**
 * Extracts Population, Intervention, Comparator from title and abstract
 */
function extractPICO(title, abstract) {
  const fullText = `${title || ''} ${abstract || ''}`;

  let population = null;
  let intervention = null;
  let comparator = null;

  // Population detection
  const popMatch = fullText.match(/(?:in|among)\s+((?:patients|women|men|participants|individuals|cohorts|embryos)\s+(?:with|undergoing|receiving|diagnosed with)\s+[^,\.;\(\)]+)/i);
  if (popMatch) {
    population = popMatch[1].trim();
  }

  // Intervention vs Comparator from title or text (e.g. "X versus Y", "X compared with Y")
  const vsMatch = (title || '').match(/(.+?)\s+(?:versus|vs\.?|compared with|and)\s+(.+?)(?:\s+(?:in|for|among)|:|$)/i);
  if (vsMatch) {
    intervention = vsMatch[1].trim();
    comparator = vsMatch[2].trim();
  }

  return { population, intervention, comparator };
}

/**
 * Builds structured evidence records for all approved papers
 * @param {Array} papers - Array of paper objects
 * @returns {Array} Array of structured evidence records
 */
function extractEvidenceRecords(papers = []) {
  if (!Array.isArray(papers)) return [];

  return papers.map((paper, idx) => {
    const refNumber = idx + 1;
    const paperId = paper.id || paper.doi || paper.pmid || `paper-${refNumber}`;
    const rawAbstract = paper.abstract || paper.abstract_summary || '';
    const hasAbstract = typeof rawAbstract === 'string' && rawAbstract.trim().length > 30;

    const designFromSource = paper.studyType || paper.study_type || (paper.pubType ? paper.pubType[0] : 'Comparative Study');
    const { population, intervention, comparator } = extractPICO(paper.title, rawAbstract);

    let keyFindingSentences = [];
    let authorStatedLimitations = [];
    let outcomes = [];

    if (hasAbstract) {
      const allSentences = splitIntoSentences(rawAbstract);

      // Separate limitations from findings
      authorStatedLimitations = allSentences.filter(s => isLimitationSentence(s));

      // Key findings: sentences that report empirical outcomes or conclusions
      keyFindingSentences = allSentences.filter(s => {
        // Exclude pure background or objective sentences
        if (/^(?:to evaluate|the aim of|we investigated|the objective was)/i.test(s)) return false;
        if (isLimitationSentence(s) && !/(?:found|showed|demonstrated|resulted|p\s*[=<>]|hr\s*[=<>])/i.test(s)) return false;
        return true;
      });

      // If keyFindingSentences is empty but allSentences has items, use non-limitation sentences
      if (keyFindingSentences.length === 0 && allSentences.length > 0) {
        keyFindingSentences = allSentences.slice(-2); // Last sentences of abstract are usually findings/conclusions
      }

      outcomes = extractOutcomesFromSentences(keyFindingSentences);
    }

    return {
      paperId,
      refNumber,
      title: paper.title || 'Untitled study',
      journal: paper.journal || 'Academic Journal',
      year: paper.year || null,
      authors: paper.authors || 'Investigator et al.',
      pmid: paper.pmid || null,
      doi: paper.doi || null,
      designFromSource,
      population,
      intervention,
      comparator,
      outcomes,
      keyFindingSentences,
      authorStatedLimitations,
      hasAbstract
    };
  });
}

module.exports = {
  splitIntoSentences,
  cleanSentenceEnding,
  detectOutcomeDirection,
  extractPICO,
  extractEvidenceRecords
};
