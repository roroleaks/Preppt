/**
 * Preppt Evidence Extractor (lib/evidence-extractor.js)
 * Builds structured evidence records from paper titles and abstracts only.
 * Enforces strict sentence boundary splitting, explicit null/negative result detection,
 * conservative study design identification, and claim-to-source traceability.
 */

const { assignAssuranceTier } = require('./venue-assurance.js');

// Common scientific abbreviations that should not trigger sentence boundaries
const PROTECTED_ABBREVIATIONS = [
  'e\\.g\\.', 'i\\.e\\.', 'vs\\.', 'et al\\.', 'al\\.', 'approx\\.', 'fig\\.', 'tab\\.',
  'no\\.', 'vol\\.', 'ref\\.', 'refs\\.', 'dr\\.', 'prof\\.', 'st\\.', 'dept\\.',
  'ci\\.', 'hr\\.', 'or\\.', 'rr\\.', 'p\\.', 'pp\\.', 'ca\\.'
];

// Structured abstract prefixes to detect section labels
const SECTION_LABEL_REGEX = /^(?:SUMMARY ANSWER|WHAT IS KNOWN ALREADY|STUDY QUESTION|BACKGROUND|INTRODUCTION|OBJECTIVES?|AIMS?|METHODS?|DESIGN|PARTICIPANTS(?:\/MATERIALS)?(?:,\s*SETTING(?:\s+AND\s+METHODS)?)?|SETTING|PATIENTS|INTERVENTIONS?|MAIN OUTCOME MEASURES?|MAIN RESULTS(?:\s+AND\s+THE\s+ROLE\s+OF\s+CHANCE)?|RESULTS?|FINDINGS?|INTERPRETATION|LIMITATIONS?(?:,\s*REASONS FOR CAUTION)?|WIDER IMPLICATIONS OF THE FINDINGS|TRIAL REGISTRATION NUMBER|CONCLUSIONS?|SIGNIFICANCE)\s*[:–-]\s*/i;

// Excluded section labels that cannot be findings
const EXCLUDED_SECTION_LABELS = new Set([
  'STUDY QUESTION', 'BACKGROUND', 'OBJECTIVE', 'OBJECTIVES', 'AIM', 'AIMS',
  'WHAT IS KNOWN ALREADY', 'METHODS', 'DESIGN', 'PARTICIPANTS', 'SETTING',
  'PATIENTS', 'INTERVENTIONS', 'INTERVENTION', 'TRIAL REGISTRATION NUMBER'
]);

// Preferred section labels for empirical findings
const PREFERRED_FINDINGS_LABELS = new Set([
  'RESULTS', 'MAIN RESULTS', 'SUMMARY ANSWER', 'CONCLUSION', 'CONCLUSIONS', 'FINDINGS', 'INTERPRETATION'
]);

// Scope or background sentence openers that cannot be findings
const SCOPE_SENTENCE_REGEX = /^(?:this review summarizes|this review describes|this review discusses|this review evaluates|this review reviews|this article summarizes|this article describes|this paper summarizes|we aimed|the aim of|to evaluate|to determine|the objective was|what is the present)/i;

// Methods, design, margin, or sample sentences that belong in study table, not in findings (Prompt 2 - A4)
const DESIGN_OR_SAMPLE_SENTENCE_REGEX = /^(?:the\s+primary\s+(?:endpoint|outcome)\s+was|was\s+conducted\s+across|the\s+trial\s+included|the\s+study\s+included|were\s+randomized\s+to|patients\s+were\s+randomized|this\s+trial\s+was|the\s+study\s+was\s+conducted|a\s+total\s+of\s+\d+\s+patients\s+were)/i;

// Stop words that indicate a truncated sentence
const STOP_WORDS_AT_END = new Set([
  'on', 'to', 'the', 'of', 'with', 'and', 'in', 'by', 'for', 'at', 'from',
  'a', 'an', 'that', 'which', 'as', 'is', 'are', 'was', 'were', 'or', 'but'
]);

/**
 * Conservative study design detector (Prompt 1B - E1)
 * Defaults to "Design not stated", never a real design name.
 */
function detectStudyDesign(title = '', paper = {}, rawAbstract = '') {
  const t = (title || '').toLowerCase();
  const a = (rawAbstract || paper.abstract || paper.abstract_summary || '').toLowerCase().trim();
  const metaType = [
    paper.pubType,
    paper.studyType,
    paper.study_type,
    paper.type,
    paper.openAlexType,
    paper.crossrefType
  ].flat().filter(Boolean).join(' ').toLowerCase();

  // 1. Metadata / Title: Randomised controlled trial
  if (
    ((t.includes('randomized') || t.includes('randomised') || metaType.includes('randomized') || metaType.includes('randomised')) &&
     (t.includes('trial') || t.includes('rct') || t.includes('noninferiority') || t.includes('non-inferiority') || a.includes('randomized') || a.includes('randomised'))) ||
    /\brandomi[sz]ed\s+controlled\s+trial\b/.test(a)
  ) {
    return 'Randomised controlled trial';
  }

  // 2. Systematic review / meta-analysis
  if (t.includes('systematic review') || t.includes('meta-analysis') || metaType.includes('systematic review') || metaType.includes('meta-analysis') || /\bsystematic\s+review\b|\bmeta-analysis\b/.test(a)) {
    return 'Systematic review / meta-analysis';
  }

  // 3. Consensus statement
  if (t.includes('consensus') || metaType.includes('consensus') || /\bconsensus\s+statement\b/.test(a)) {
    return 'Consensus statement';
  }

  // 4. Conference abstract / dataset / thesis
  if (t.includes('conference abstract') || metaType.includes('meeting abstract') || detectIsConferenceAbstract(paper)) {
    return 'Conference abstract';
  }
  if (metaType.includes('dataset') || metaType.includes('dissertation') || metaType.includes('thesis') || /\btesis\b|\btrabajo\s+fin\s+de\s+grado\b|\bod[s]\s+10\b/i.test(a) || /\bhispana\b/i.test(paper.journal || '')) {
    return 'Dataset / thesis';
  }

  // 5. Cohort / Retrospective / Diagnostic accuracy (abstract or title cues)
  if (t.includes('cohort') || /\b(?:prospective|retrospective|multicent(?:er|re))\s+cohort\s+study\b|\bcohort\s+study\b/.test(a)) {
    return 'Cohort study';
  }
  if (t.includes('retrospective') || /\bretrospective\s+(?:study|analysis)\b/.test(a)) {
    return 'Retrospective study';
  }
  if (/\b(?:sensitivity|specificity|auroc|auc|jaccard|segmentation|diagnostic\s+accuracy)\b/.test(a) && !/\bthis\s+review\b|\breview\b/.test(t)) {
    return 'Diagnostic accuracy study';
  }

  // 6. Narrative review / perspective / commentary (title, metadata, or abstract cues)
  if (
    t.includes('review') ||
    t.includes('overview') ||
    t.includes('paradigm shift') ||
    t.includes('should be used') ||
    t.includes('ethical') ||
    t.includes('future') ||
    t.includes('progress in') ||
    metaType.includes('review') ||
    /\b(?:this\s+review|in\s+this\s+review|narrative\s+review|this\s+paper\s+(?:provides?|discusses?|reviews?|presents?)|in\s+this\s+paper,\s+we\s+(?:provide|review|discuss)|central\s+themes\s+explored\s+in\s+this\s+review|this\s+article\s+(?:reviews?|discusses?|summarizes?))\b/.test(a)
  ) {
    return 'Narrative review';
  }

  // 7. Incoming non-generic studyType
  const incoming = paper.studyType || paper.study_type || (Array.isArray(paper.pubType) ? paper.pubType[0] : paper.pubType);
  if (incoming && typeof incoming === 'string' && incoming.trim() && !/comparative study|journal article/i.test(incoming) && incoming.toLowerCase() !== 'design not stated') {
    return incoming.trim();
  }

  return 'Design not stated';
}

/**
 * Splits text into complete sentences while preserving decimals, abbreviations, and statistics
 */
function splitIntoSentences(text) {
  if (!text || typeof text !== 'string') return [];

  let clean = text.trim();
  if (!clean) return [];

  // Protect decimals and statistics (e.g. 0.82, 1.5, P = 0.02, P < 0.001, ∼30%, 95% CI)
  const DOT_TOKEN = '___DOT___';

  clean = clean.replace(/(\d+)\.(\d+)/g, `$1${DOT_TOKEN}$2`);

  PROTECTED_ABBREVIATIONS.forEach(abbr => {
    const regex = new RegExp(`\\b${abbr}`, 'gi');
    clean = clean.replace(regex, match => match.replace(/\./g, DOT_TOKEN));
  });

  clean = clean.replace(/\b([pP])\s*([=<>≤≥])\s*(\d+)${DOT_TOKEN}(\d+)/g, `$1 $2 $3${DOT_TOKEN}$4`);

  // Ensure structured section headers after sentence boundaries are treated as sentence boundaries
  clean = clean.replace(/([.!?])\s+(?=(?:SUMMARY ANSWER|WHAT IS KNOWN ALREADY|STUDY QUESTION|BACKGROUND|INTRODUCTION|OBJECTIVES?|AIMS?|PARTICIPANTS(?:\/MATERIALS)?,\s*SETTING\s+AND\s+METHODS|METHODS?|DESIGN|PARTICIPANTS|SETTING|PATIENTS|INTERVENTIONS?|MAIN OUTCOME MEASURES?|MAIN RESULTS(?:\s+AND\s+THE\s+ROLE\s+OF\s+CHANCE)?|RESULTS?|FINDINGS?|INTERPRETATION|LIMITATIONS?(?:,\s*REASONS FOR CAUTION)?|WIDER IMPLICATIONS OF THE FINDINGS|TRIAL REGISTRATION NUMBER|CONCLUSIONS?|SIGNIFICANCE)\s*[:–-])/gi, '$1\n');

  // Split by sentence terminators (. ! ?) followed by whitespace or quote/bracket or newline
  const rawSentences = clean.split(/(?<=[.!?])\s+(?=[A-Z0-9"'(])|\n+/);

  const sentences = [];
  for (let s of rawSentences) {
    let restored = s.replace(new RegExp(DOT_TOKEN, 'g'), '.').trim();
    restored = cleanSentenceEnding(restored);
    if (restored && restored.length >= 5) {
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

  // Preserve trailing ellipsis
  if (/(?:…|\.\.\.)$/.test(s)) {
    return s;
  }

  s = s.replace(/[\s\.\,…–-]+$/, '');

  const words = s.split(/\s+/);
  if (words.length === 0) return null;

  const lastWord = words[words.length - 1].toLowerCase().replace(/[^a-z]/g, '');
  if (STOP_WORDS_AT_END.has(lastWord)) {
    words.pop();
    s = words.join(' ').replace(/[\s\.\,…–-]+$/, '');
  }

  if (!s || s.length < 5) return null;

  if (!/[.!?…]$/.test(s)) {
    s += '.';
  }

  return s;
}

/**
 * Classifies an abstract sentence into one of:
 * 'background' | 'objective' | 'methods' | 'results' | 'conclusion' | 'limitation'
 * Uses structured-abstract headings when present, otherwise cue words and position.
 */
function classifySentenceRole(ps, index = 0, total = 1) {
  const label = (ps.label || 'UNSTRUCTURED').toUpperCase();
  const text = (ps.text || '').trim();
  const lower = text.toLowerCase();

  // 1. Structured abstract heading takes precedence
  if (label !== 'UNSTRUCTURED') {
    if (label.includes('LIMITATION')) return 'limitation';
    if (label === 'BACKGROUND' || label === 'INTRODUCTION' || label === 'WHAT IS KNOWN ALREADY') return 'background';
    if (label === 'STUDY QUESTION' || label.startsWith('OBJECTIVE') || label.startsWith('AIM')) return 'objective';
    if (
      label.startsWith('METHOD') || label === 'DESIGN' || label.startsWith('PARTICIPANT') ||
      label === 'SETTING' || label === 'PATIENTS' || label.startsWith('INTERVENTION') ||
      label === 'MAIN OUTCOME MEASURES' || label === 'TRIAL REGISTRATION NUMBER'
    ) return 'methods';
    if (label.startsWith('MAIN RESULTS') || label.startsWith('RESULT') || label.startsWith('FINDING') || label === 'SUMMARY ANSWER') {
      return 'results';
    }
    if (label.startsWith('CONCLUSION') || label === 'INTERPRETATION' || label === 'WIDER IMPLICATIONS OF THE FINDINGS' || label === 'SIGNIFICANCE') {
      return 'conclusion';
    }
  }

  // 2. Unstructured abstract: cue words and position
  if (/^(?:in\s+conclusion|to\s+conclude|overall,|our\s+findings\s+(?:suggest|demonstrate|indicate)|these\s+(?:findings|results)\s+(?:suggest|indicate|support|highlight)|collectively,)/i.test(text)) {
    return 'conclusion';
  }

  if (isLimitationSentence(text) && !isResultSignalSentence(text)) return 'limitation';

  if (
    SCOPE_SENTENCE_REGEX.test(text) ||
    /\b(?:this\s+(?:\w+\s+)?review|this\s+paper|in\s+this\s+paper|this\s+article|we\s+provide|we\s+review|we\s+discuss|we\s+describe|is\s+explored|are\s+explored|central\s+themes?|aims?\s+to|overview\s+of)\b/i.test(lower) ||
    /^(?:this\s+(?:study|trial|review|paper|work)\s+(?:aimed|sought|investigated|evaluated|examined|assessed|proposes|presents)|we\s+(?:aimed|sought)\s+to|the\s+(?:aim|objective|purpose)\s+(?:of\s+this|was)|to\s+(?:evaluate|investigate|assess|compare|determine)\b)/i.test(text)
  ) {
    return 'objective';
  }

  const hasStudyResultCue = /\b(?:we\s+found|results?\s+(?:showed|demonstrated|indicated)|our\s+model|the\s+model|ai-assisted|idascore|outperformed|compared\s+(?:to|with)|versus|\bvs\.?\b|odds\s+ratio|\baOR\b|\bOR\b|\bRR\b|\bHR\b|\bRD\b|\bAUC\b|\bAUROC\b|\bp\s*[=<>≤≥]|95%\s*ci|non-?inferiority|statistically\s+significant|no\s+significant\s+difference|demonstrated\s+(?:lower|higher|reduced|increased|comparable|no\s+adverse)|was\s+associated\s+with|were\s+\d+(?:\.\d+)?%)\b/i.test(lower);

  // Background / opinion statements without a measured result
  if (
    !hasStudyResultCue &&
    (
      /\b(?:is\s+ideally\s+suited\s+to|has\s+great\s+potential|is\s+expected\s+to|holds?\s+(?:great\s+)?promise|promising\s+tool|is\s+imperative|(?:demonstrates?|shows?|has|have)\s+(?:significant\s+|great\s+|the\s+)?potential(?:\s+for|\s+to)?)\b/i.test(lower) ||
      /^(?:however|nevertheless|despite|although|historically|traditionally|globally|worldwide|in\s+recent\s+years|over\s+the\s+past|for\s+decades|as\s+a\s+disease)\b/i.test(text) ||
      /\b(?:success\s+rates\s+are\s+only|plateau\s+at\s+\d|global\s+health\s+issue|increasing\s+worldwide)\b/i.test(lower)
    )
  ) {
    return 'background';
  }

  if (
    DESIGN_OR_SAMPLE_SENTENCE_REGEX.test(text) ||
    (!hasStudyResultCue && /^(?:we\s+(?:collected|trained|developed|retrospectively|prospectively|included|analyzed|analysed|enrolled)|data\s+were\s+collected|a\s+total\s+of\s+\d+)/i.test(text))
  ) {
    return 'methods';
  }

  if (/^(?:in\s+conclusion|to\s+conclude|overall,|our\s+findings\s+(?:suggest|demonstrate|indicate)|these\s+(?:findings|results)\s+(?:suggest|indicate|support|highlight)|collectively,)/i.test(text)) {
    return 'conclusion';
  }

  if (isResultSignalSentence(text) || hasStudyResultCue) {
    if (index === 0 && total > 1 && !hasStudyResultCue) return 'background';
    return 'results';
  }

  const ratio = total > 1 ? index / (total - 1) : 0;
  if (ratio <= 0.25) return 'background';
  if (ratio >= 0.75) return 'conclusion';
  return 'methods';
}

/**
 * Parses abstract sentences while tracking structured section labels and sentence roles
 */
function parseAbstractSentences(rawAbstract) {
  if (!rawAbstract || typeof rawAbstract !== 'string') return [];

  const rawSentences = splitIntoSentences(rawAbstract);
  let currentLabel = 'UNSTRUCTURED';

  const parsed = rawSentences.map(s => {
    let clean = s.trim();
    let label = currentLabel;
    const match = clean.match(SECTION_LABEL_REGEX);
    if (match) {
      label = match[0].replace(/[:–-]\s*$/, '').trim().toUpperCase();
      currentLabel = label;
      clean = clean.replace(SECTION_LABEL_REGEX, '').trim();
    }
    const endsInQuestion = clean.endsWith('?');
    return {
      text: clean,
      label,
      raw: s,
      endsInQuestion
    };
  });

  return parsed.map((ps, idx) => ({
    ...ps,
    role: classifySentenceRole(ps, idx, parsed.length)
  }));
}

/**
 * Checks if a sentence has statistical or empirical result signals
 */
function isResultSignalSentence(sentence) {
  const text = sentence.toLowerCase();
  return (
    /\d+(?:\.\d+)?%/.test(text) ||
    /\b[pP]\s*[=<>≤≥]\s*\d/.test(text) ||
    /95%\s*CI|\bCI\s*[,\(\[]/i.test(text) ||
    /\b(?:HR|OR|RR|hazard ratio|odds ratio|relative risk)\s*[=<>:]?\s*\d/i.test(text) ||
    /\b(?:AUC|ROC|AUROC|c-index|sensitivity|specificity|accuracy|precision|recall)\b/i.test(text) ||
    /\d+\.?\d*\s*(?:versus|vs\.?)\s*\d+\.?\d*/i.test(text) ||
    /\b(?:compared\s+with|comparable|no\s+adverse)\b/i.test(text) ||
    /\b(?:significantly|significant difference|no significant difference|no statistically significant|higher|lower|reduced|decreasing|decreased|improved|improving|increased|increasing|outperformed|superior|inferior|not demonstrated|was not demonstrated|not able to demonstrate|correlated with|correlated|associated with|quantified)\b/i.test(text)
  );
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
    /not\s+able\s+to\s+demonstrate\s+(?:noninferiority|non-inferiority|superiority|benefit|efficacy)/i,
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
    /significantly\s+(?:reduced|decreased|improved|increased|lowered|higher)/i,
    /significant\s+reduction/i,
    /superior\s+to\s+placebo/i,
    /superior\s+to\s+control/i,
    /consistently\s+outperformed/i,
    /outperformed\s+(?:the\s+)?clinical\s+teams/i,
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
 * Detects specific clinical outcome domain (Prompt 1B - E4)
 */
function detectOutcomeName(sentence) {
  const text = sentence.toLowerCase();
  if (text.includes('implantation')) return 'implantation';
  if (text.includes('live birth') || text.includes('live-birth')) return 'live birth';
  if (text.includes('clinical pregnancy') || text.includes('ongoing pregnancy')) return 'clinical/ongoing pregnancy';
  if (text.includes('miscarriage') || text.includes('pregnancy loss')) return 'miscarriage';
  if (text.includes('accuracy') || text.includes('auc') || text.includes('c-index') || text.includes('sensitivity') || text.includes('specificity') || text.includes('outperformed') || text.includes('performance') || text.includes('prediction')) return 'prediction accuracy / AUC';
  if (text.includes('ploidy') || text.includes('euploid') || text.includes('aneuploid')) return 'ploidy status';
  if (text.includes('preeclampsia') || text.includes('pre-eclampsia')) return 'preeclampsia';
  if (text.includes('cardiovascular death')) return 'cardiovascular death';
  if (text.includes('mortality')) return 'mortality';
  if (text.includes('overall survival') || text.includes('survival')) return 'survival';
  if (text.includes('death')) return 'death';
  if (text.includes('tolerability') || text.includes('adverse event') || text.includes('safety') || text.includes('complication')) return 'safety and tolerability';
  return 'primary outcome';
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
    text.includes('retrospective and heterogeneous') ||
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
function extractOutcomesFromSentences(sentences, refNumber = 1) {
  const outcomes = [];

  sentences.forEach(s => {
    const direction = detectOutcomeDirection(s);
    const outcomeName = detectOutcomeName(s);

    // Look for statistical measures (HR, OR, RR, 95% CI, %, P value)
    const statsMatch = s.match(/(?:HR|OR|RR|hazard ratio|odds ratio|relative risk)?\s*\d+(?:\.\d+)?\s*(?:;\s*)?(?:95%\s*CI\s*[,\(\[]\s*[\d\.\s–-]+[,\)\]])?(?:;\s*)?(?:P\s*[=<>]+\s*[\d\.]+)?/i);
    const statsText = statsMatch ? statsMatch[0].trim() : null;

    if (direction !== 'unclear' || statsText || /found that|showed that|demonstrated that|concluded that|outperformed/i.test(s)) {
      outcomes.push({
        name: outcomeName,
        result: s,
        direction,
        statsText,
        refNumber
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
 * Detects if a paper record is a conference abstract (Prompt 2 - C2)
 */
function detectIsConferenceAbstract(paper = {}) {
  const title = String(paper.title || '').trim();
  const volume = String(paper.volume || '');
  const issue = String(paper.issue || '');
  const venue = String(paper.venue || paper.journal || '');

  // Title starts with code such as O-123, P-123, L26/P-303, P-170, etc.
  if (/^(?:[A-Za-z0-9\/_-]*\/)?[OPL]\s*[-–/]?\s*\d+/i.test(title) || /^[A-Z]\d*[-/][A-Z0-9-]+/i.test(title)) {
    return true;
  }
  // Journal volume or issue contains Supplement or Suppl
  if (/supplement|suppl/i.test(volume) || /supplement|suppl/i.test(issue)) {
    return true;
  }
  // Venue name or journal contains Meeting, Congress, Conference or Abstracts
  if (/meeting|congress|conference|abstracts/i.test(venue)) {
    return true;
  }
  return false;
}

/**
 * Detects whether a paper is an unverified source:
 * True when (no PMID AND no DOI AND no journal name) OR venue is a repository/aggregator
 * (CORE, Zenodo, Hispana, ResearchGate, SSRN).
 */
function detectUnverifiedSource(paper = {}) {
  const pmid = String(paper.pmid || '').trim();
  const doi = String(paper.doi || '').trim();
  const journal = String(paper.journal || '').trim();
  const venueLower = `${journal} ${paper.source || ''} ${paper.source_url || ''}`.toLowerCase();

  const AGGREGATOR_REGEX = /\b(?:core|zenodo|hispana|researchgate|ssrn)\b/i;
  if (AGGREGATOR_REGEX.test(venueLower)) {
    return { isUnverified: true, reason: `Repository/aggregator venue (${journal || paper.source})` };
  }
  if (!pmid && !doi && (!journal || journal.toLowerCase() === 'academic journal')) {
    return { isUnverified: true, reason: 'Missing PMID, DOI, and verified journal name' };
  }
  return { isUnverified: false, reason: '' };
}

/**
 * Builds structured evidence records for all approved papers
 * Enforces Prompt 1B rules (E1-E5):
 * - Default design is "Design not stated", never "Comparative Study"
 * - Findings prefer RESULTS, SUMMARY ANSWER, CONCLUSION; exclude questions and scope openers
 * - If none qualify, record contributes no finding bullet
 */
function extractEvidenceRecords(papers = []) {
  if (!Array.isArray(papers)) return [];

  return papers.map((paper, idx) => {
    const refNumber = idx + 1;
    const paperId = paper.id || paper.doi || paper.pmid || `paper-${refNumber}`;
    const rawAbstract = paper.abstract || paper.abstract_summary || '';
    const hasAbstract = typeof rawAbstract === 'string' && rawAbstract.trim().length > 30;
    const isConference = detectIsConferenceAbstract(paper);
    const sourceVerification = detectUnverifiedSource(paper);
    const assuranceInfo = paper.assuranceTier
      ? {
          assuranceTier: paper.assuranceTier,
          assuranceBadge: paper.assuranceBadge || '',
          indexedIn: paper.indexedIn || 'none',
          journalIssn: paper.journalIssn || '',
          inNlmCatalogue: Boolean(paper.inNlmCatalogue)
        }
      : assignAssuranceTier(paper);
    const isExcludedTierC = assuranceInfo.assuranceTier === 'C';

    const designFromSource = detectStudyDesign(paper.title, paper, rawAbstract);
    const { population, intervention, comparator } = extractPICO(paper.title, rawAbstract);

    let keyFindingSentences = [];
    let backgroundSentences = [];
    let classifiedSentences = [];
    let authorStatedLimitations = [];
    let outcomes = [];

    if (hasAbstract) {
      const parsedSentences = parseAbstractSentences(rawAbstract);
      classifiedSentences = parsedSentences;

      // Separate limitations and background context
      parsedSentences.forEach(ps => {
        if (ps.role === 'limitation') {
          authorStatedLimitations.push(ps.text);
        } else if (ps.role === 'background' && ps.text.length > 20) {
          backgroundSentences.push(ps.text);
        }
      });

      // Filter findings sentences: ONLY 'results' and 'conclusion' roles may become findings
      parsedSentences.forEach(ps => {
        if (ps.endsInQuestion) return;
        if (ps.role !== 'results' && ps.role !== 'conclusion') return;
        if (SCOPE_SENTENCE_REGEX.test(ps.text)) return;
        if (DESIGN_OR_SAMPLE_SENTENCE_REGEX.test(ps.text)) return;

        if (PREFERRED_FINDINGS_LABELS.has(ps.label) || isResultSignalSentence(ps.text) || ps.role === 'conclusion') {
          keyFindingSentences.push({ text: ps.text, role: ps.role });
        }
      });

      // Extract structured outcomes from finding sentence texts
      outcomes = extractOutcomesFromSentences(keyFindingSentences.map(k => k.text), refNumber);
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
      keyFindingSentences: isExcludedTierC ? [] : keyFindingSentences.map(k => k.text),
      findingCandidates: isExcludedTierC ? [] : keyFindingSentences,
      backgroundSentences,
      classifiedSentences,
      authorStatedLimitations: isExcludedTierC ? [] : authorStatedLimitations,
      hasAbstract,
      abstract: rawAbstract || '',
      isConferenceAbstract: isConference,
      isUnverifiedSource: sourceVerification.isUnverified,
      unverifiedReason: sourceVerification.reason,
      assuranceTier: assuranceInfo.assuranceTier,
      assuranceBadge: assuranceInfo.assuranceBadge,
      indexedIn: assuranceInfo.indexedIn,
      journalIssn: assuranceInfo.journalIssn,
      inNlmCatalogue: assuranceInfo.inNlmCatalogue
    };
  });
}

function classifyMetricDomain(text) {
  const lower = String(text || '').toLowerCase();
  const hasTechnicalMetric = /\b(?:jaccard|mean\s+ji|iou|dice\s+(?:score|coefficient|index)|pixel\s+accuracy|segmentation\s+accuracy|f1[- ]?score|psnr|ssim|inference\s+time|public\s+dataset)\b/i.test(lower);
  const hasClinicalOutcome = /\b(?:clinical\s+pregnancy|live\s+birth|ongoing\s+pregnancy|implantation|miscarriage|fertilization|blastocyst\s+formation|euploidy|embryo\s+selection|pregnancy\s+prediction)\b/i.test(lower);
  if (hasTechnicalMetric && !hasClinicalOutcome) return 'technical';
  return 'clinical';
}

module.exports = {
  splitIntoSentences,
  cleanSentenceEnding,
  detectOutcomeDirection,
  detectOutcomeName,
  detectStudyDesign,
  detectIsConferenceAbstract,
  detectUnverifiedSource,
  extractPICO,
  extractEvidenceRecords,
  classifySentenceRole,
  parseAbstractSentences,
  classifyMetricDomain
};

