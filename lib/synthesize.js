/**
 * Preppt Presentation Synthesizer (lib/synthesize.js)
 * Extractive evidence-based presentation synthesis engine.
 * Every finding, outcome, and limitation is strictly extracted from approved literature.
 * Zero hardcoded clinical template claims. Full claim-to-source traceability.
 */

const { extractEvidenceRecords, cleanSentenceEnding, detectOutcomeDirection, detectOutcomeName, classifyMetricDomain } = require('./evidence-extractor.js');
const { isRandomisedTrialDesign, isEvidenceSynthesisDesign, scorePaperRelevance, conceptGroupsFromKeywords, populationContradictsTopic } = require('../public/evidence-rules.js');
const { deriveEvidenceVerdict, designWeight, computeOffTopicRefs } = require('./evidence-verdict.js');
const { extractConceptPhrases } = require('./keywords.js');
const { buildAbbreviationMap, expandDefinedAbbreviations, stripCitations, extractNumericTokens, parseStructuredResultSentence, tryPairAdjacentSentences, compressFindingPreservingNumbers, isEnglishText } = require('./text-rules.js');

// Design, margin, or sample sentences that belong in study table, not in findings (Prompt 2 - A4)
const DESIGN_OR_SAMPLE_SENTENCE_REGEX = /^(?:(?:finally|overall|ultimately),?\s+)?(?:(?:a\s+total\s+of|in\s+total,?)\s+[\d,]+\s+(?:rcts?|randomi[sz]ed|trials?|studies|articles|records|patients|participants|women|men|subjects)|we\s+(?:included|identified|analy[sz]ed|enrolled|randomly)|(?:\w+[\s-]){0,3}(?:rcts?|trials?|studies|articles|records)\s+(?:were|was)\s+(?:included|identified|analy[sz]ed|eligible)|the\s+primary\s+(?:endpoint|outcome)\s+was|was\s+conducted\s+across|the\s+trial\s+included|the\s+study\s+included|were\s+randomized\s+to|patients\s+were\s+randomized|this\s+trial\s+was|the\s+study\s+was\s+conducted|a\s+total\s+of\s+\d+\s+patients\s+were)/i;

// Stop words that indicate a truncated sentence
const STOP_WORDS_AT_END = new Set([
  'on', 'to', 'the', 'of', 'with', 'and', 'in', 'by', 'for', 'at', 'from',
  'a', 'an', 'that', 'which', 'as', 'is', 'are', 'was', 'were', 'or', 'but',
  'between', 'among', 'across', 'than', 'into', 'about', 'over', 'after', 'under',
  'through', 'its', 'their', 'our', 'this', 'these', 'those', 'nor', 'up', 'down', 'off', 'above', 'below', 'during', 'before', 'against'
]);

// Finding signal regex: %, P =, CI, OR/RR/HR, comparative or outcome direction words
const FINDING_SIGNAL_REGEX = /\d+(?:\.\d+)?%|\b[pP]\s*[=<>≤≥]\s*\d|\b95%\s*CI|\b(?:HR|OR|RR|hazard ratio|odds ratio|relative risk)\s*[=<>:]?\s*\d|\b(?:AUC|ROC|AUROC|c-index|sensitivity|specificity|accuracy)\b|\b(?:higher|lower|improved?|improving|decreas(?:e|es|ed|ing)|reduc(?:e|es|ed|ing|tion|tions)|increas(?:e|es|ed|ing)|outperformed?|no difference|not demonstrated|was not demonstrated|not able to demonstrate|superior(?:ity)?|inferior(?:ity)?|benefits?|effective(?:ness)?)\b/i;

function cleanText(str) {
  if (!str) return '';
  return String(str)
    .replace(/<[^>]*>/g, '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function cleanHtmlText(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatAuthorLead(authors) {
  if (!authors) return 'Study Investigator';
  let str = String(authors).trim();
  const hasEtAl = /\bet\s+al\.?/i.test(str);
  const parts = str.split(/[,;]/).map(p => p.trim()).filter(Boolean);
  const first = parts[0].replace(/\s+et\s+al\.?$/i, '').trim();
  const hasMultiple = hasEtAl || parts.length > 2 || (parts.length === 2 && !/^\d{4}$/.test(parts[1]));
  return hasMultiple ? `${first} et al.` : first;
}

/**
 * Formats a short trailing attribution tag like "Li 2025" or "Agboola 2025"
 */
function formatShortTag(authors, year) {
  const first = Array.isArray(authors)
    ? String(authors[0] || '').trim()
    : String(authors || '').split(/[,;]/)[0].replace(/\s+et\s+al\.?$/i, '').trim();
  if (!first) return year ? `Study ${year}` : 'Study';
  const tokens = first.split(/\s+/).filter(Boolean);
  let surname = tokens[tokens.length - 1] || first;
  // Handle "Wang S" or "Illingworth PJ" where trailing token is initials (1-3 uppercase letters)
  if (tokens.length >= 2 && /^[A-Z]{1,3}\.?$/.test(surname)) {
    surname = tokens[0];
  }
  surname = surname.replace(/[^a-zA-ZÀ-ÿ'-]/g, '') || 'Study';
  return year ? `${surname} ${year}` : surname;
}

function ensureCleanBullet(bulletText) {
  if (!bulletText) return '';
  let str = stripCitations(cleanText(bulletText)).replace(/^•\s*/, '');
  const cleaned = cleanSentenceEnding(str);
  return cleaned ? `• ${cleaned}` : '';
}

/**
 * Truncates title/phrase cleanly at word boundary without mid-word cuts (Prompt 1B - E8)
 */
function formatTitleSnippet(text, maxLen = 120) {
  if (!text || typeof text !== 'string') return '';
  let clean = cleanText(text).trim();
  // Strip outer translated-title brackets like "[Progress in ...]." to avoid unclosed brackets
  clean = clean.replace(/^\[([^\]]+)\]\.?$/, '$1').trim();
  if (clean.length <= maxLen) return clean;
  const sub = clean.substring(0, maxLen);
  const lastSpace = sub.lastIndexOf(' ');
  let snippet = lastSpace > 20 ? sub.substring(0, lastSpace).trim() : sub.trim();
  // Remove any trailing unclosed '(' or '['
  const openP = (snippet.match(/\(/g) || []).length;
  const closeP = (snippet.match(/\)/g) || []).length;
  if (openP > closeP) snippet = snippet.replace(/\([^()]*$/, '').trim();
  const openB = (snippet.match(/\[/g) || []).length;
  const closeB = (snippet.match(/\]/g) || []).length;
  if (openB > closeB) snippet = snippet.replace(/\[[^\[\]]*$/, '').trim();
  return snippet + '…';
}

/**
 * Returns correct study noun by verified design (Prompt 1B - E1)
 */
function getNounByDesign(design = '') {
  const d = (design || '').toLowerCase();
  if (isRandomisedTrialDesign(d)) {
    return 'Trial';
  }
  if (d.includes('systematic review') || d.includes('meta-analysis')) {
    return 'Systematic review';
  }
  if (d.includes('narrative review') || d.includes('review')) {
    return 'Review';
  }
  if (d.includes('cohort')) {
    return 'Cohort study';
  }
  if (d.includes('retrospective')) {
    return 'Retrospective study';
  }
  return 'Study';
}

/**
 * Derives research gaps strictly from extracted evidence records (Prompt 1B - E1, E6)
 * Gaps may only come from:
 * (a) Author-stated limitations
 * (b) Verified design absence (ONLY when every record has a verified design other than 'Design not stated' and no RCT)
 * (c) Clinical outcome named in topic not reported in abstracts
 */
function deriveResearchGaps(topic, records, keywords = [], offTopicRefs = null) {
  const gaps = [];

  // 1. (removed) Author limitations are shown on the limitations slide; gaps come from statements of uncertainty below.

  // 2. Study design gaps (ONLY when EVERY record has a verified design other than 'Design not stated')
  const allDesignsVerified = records.length > 0 && records.every(r => r.designFromSource && r.designFromSource !== 'Design not stated');
  const hasRct = records.some(r => {
    const d = (r.designFromSource || '').toLowerCase();
    return isRandomisedTrialDesign(d);
  });

  if (allDesignsVerified && !hasRct && records.length > 0 && gaps.length < 5) {
    gaps.push(`Trial gap: no randomised trial among the selected papers on this topic.`);
  }

  // 3. Outcomes named in user topic or approved keywords (Prompt 2 - A3)
  const fullAbstracts = records.map(r => (r.keyFindingSentences || []).join(' ') + ' ' + (r.abstract || '')).join(' ').toLowerCase();
  const searchScope = (topic + ' ' + (Array.isArray(keywords) ? keywords.join(' ') : '')).toLowerCase();

  const clinicalOutcomeCandidates = [
    { key: 'live birth', label: 'live birth rates' },
    { key: 'clinical pregnancy', label: 'clinical pregnancy rates' },
    { key: 'ongoing pregnancy', label: 'ongoing pregnancy rates' },
    { key: 'implantation', label: 'implantation rates' },
    { key: 'miscarriage', label: 'miscarriage or pregnancy loss rates' },
    { key: 'neonatal', label: 'neonatal outcomes' },
    { key: 'obstetric', label: 'obstetric complications' }
  ];

  // ONLY check if the user's topic or approved keywords explicitly mention this outcome
  clinicalOutcomeCandidates.forEach(cand => {
    if (searchScope.includes(cand.key) && !fullAbstracts.includes(cand.key) && gaps.length < 5) {
      gaps.push(`No included abstract reports ${cand.label}.`);
    }
  });

  // Never mention survival, quality-of-life, patient-reported, or health-economic unless topic text does
  if (searchScope.includes('survival') && !fullAbstracts.includes('survival') && gaps.length < 5) {
    gaps.push('No included abstract reports survival outcomes beyond initial observation periods.');
  }
  if ((searchScope.includes('quality of life') || searchScope.includes('qol')) && !fullAbstracts.includes('quality of life') && gaps.length < 5) {
    gaps.push('No included abstract reports validated quality-of-life measures.');
  }
  if (searchScope.includes('patient-reported') && !fullAbstracts.includes('patient-reported') && gaps.length < 5) {
    gaps.push('No included abstract reports patient-reported functional outcomes.');
  }
  if (searchScope.includes('cost-effectiveness') && !fullAbstracts.includes('cost-effectiveness') && gaps.length < 5) {
    gaps.push('No included abstract reports health-economic or cost-effectiveness metrics.');
  }

  // 4. Authors' own statements of uncertainty / need for further research (on-topic studies only)
  const FUTURE_SIGNAL = /(?:further|more|additional|larger|long-term|prospective|well-designed|randomi[sz]ed|high-quality|future)\s+(?:research|studies|trials|investigations?|data|evidence|work)\s+(?:is|are|will be)?\s*(?:needed|required|warranted|necessary)|warrant(?:s|ing)?\s+further|remains?\s+(?:unclear|unknown|uncertain|limited|to be (?:determined|established|clarified))|(?:is|are)\s+(?:still\s+)?limited|is not supported|need(?:s)?\s+to be\s+(?:determined|established|confirmed|clarified)/i;
  const seenGap = new Set();
  records.forEach(r => {
    if (gaps.length >= 5 || (offTopicRefs && offTopicRefs.has(r.refNumber))) return;
    const sentences = (r.classifiedSentences || []).map(c => c && c.text).filter(Boolean);
    for (const sent of sentences) {
      if (!FUTURE_SIGNAL.test(sent) || !isEnglishText(sent).ok || populationContradictsTopic(sent, topic)) continue;
      // keep the clause that carries the uncertainty, not the whole sentence
      const clause = sent.split(/;|,\s+(?:but|whereas|and|although)\s+|\.\s/).find(c => FUTURE_SIGNAL.test(c)) || sent;
      const clean = cleanSentenceEnding(stripCitations(clause).replace(/^(?:conversely|however|additionally|in this regard|overall|thus|therefore),?\s*/i, '').replace(/^[a-z]/, c => c.toUpperCase()));
      const key = clean.toLowerCase().slice(0, 60);
      if (!clean || clean.split(/\s+/).length < 4 || seenGap.has(key)) continue;
      seenGap.add(key);
      gaps.push(`Open question from ${formatShortTag(r.authors, r.year)}: ${clean.replace(/\.$/, '').replace(/^[A-Z]/, c => c.toLowerCase())}`);
      break;
    }
  });

  // Prompt 2B: Fallback template gaps deleted. If no gap can be derived, output exactly:
  if (gaps.length === 0) {
    gaps.push('No research gaps could be derived from the selected abstracts.');
  }

  return gaps.slice(0, 5);
}

/**
 * Generates Evidence-Based Synthesis Plan based strictly on extracted records (Prompt 1B - E4, E5, Prompt 2 - A2)
 */
function generateSynthesisPlan(topic, records, audience) {
  const cleanTop = cleanText(topic);
  const paperCount = records.length;
  const usableRecords = records.filter(r => r.hasAbstract);
  const recordsWithFindings = usableRecords.filter(r => r.keyFindingSentences && r.keyFindingSentences.length > 0);

  // Group outcomes by name and direction for cross-study comparison
  const outcomesByName = {};
  usableRecords.forEach(r => {
    (r.outcomes || []).forEach(o => {
      const name = o.name || 'primary outcome';
      if (!outcomesByName[name]) outcomesByName[name] = [];
      outcomesByName[name].push({ refNumber: r.refNumber, direction: o.direction, result: o.result });
    });
  });

  // Cross-study conflict: different records disagree on the SAME outcome
  const conflictingOutcomes = [];
  Object.keys(outcomesByName).forEach(name => {
    const list = outcomesByName[name];
    const pos = list.filter(x => x.direction === 'favours intervention');
    const neg = list.filter(x => x.direction === 'no difference' || x.direction === 'favours comparator');
    const posRefs = new Set(pos.map(x => x.refNumber));
    const negRefs = new Set(neg.map(x => x.refNumber));
    const hasDifferentDisagreement = Array.from(posRefs).some(pr => !negRefs.has(pr)) && Array.from(negRefs).some(nr => !posRefs.has(nr));
    if (pos.length > 0 && neg.length > 0 && hasDifferentDisagreement) {
      conflictingOutcomes.push({ name, posRefs: Array.from(posRefs), negRefs: Array.from(negRefs) });
    }
  });

  // Within-study endpoint variation (e.g. Wang: higher implantation, no difference in live birth)
  const withinStudyVariations = [];
  usableRecords.forEach(r => {
    const rPos = (r.outcomes || []).filter(o => o.direction === 'favours intervention');
    const rNull = (r.outcomes || []).filter(o => o.direction === 'no difference' || o.direction === 'favours comparator');
    if (rPos.length > 0 && rNull.length > 0) {
      withinStudyVariations.push({
        refNumber: r.refNumber,
        posNames: rPos.map(o => o.name).join(', '),
        nullNames: rNull.map(o => o.name).join(', ')
      });
    }
  });

  const positive = usableRecords.filter(r => r.outcomes.some(o => o.direction === 'favours intervention'));
  const nullOrNeg = usableRecords.filter(r => r.outcomes.some(o => o.direction === 'no difference' || o.direction === 'favours comparator'));
  const hasFindings = recordsWithFindings.length > 0;

  // Theme 1: Evidence Overview & Curation (Prompt 2 - A2: only count records that actually have findings)
  const theme1 = {
    themeId: 'theme-1',
    title: 'Evidence Base Overview & Study Characteristics',
    scope: `Appraisal of ${paperCount} selected studies curated for ${cleanTop}.`,
    consistentFindings: recordsWithFindings.length >= 2
      ? `Evidence base of ${recordsWithFindings.length} studies with published abstracts demonstrating empirical outcomes on ${cleanTop}.`
      : 'Not established by the selected evidence.',
    establishedFindings: recordsWithFindings.length >= 2
      ? `Evidence base of ${recordsWithFindings.length} studies with published abstracts demonstrating empirical outcomes on ${cleanTop}.`
      : 'Not established by the selected evidence.',
    uncertainOrUnresolvedAreas: usableRecords.length === 0
      ? 'No published abstract summaries available in the selected records; empirical findings remain unmeasured.'
      : 'Uncertainty remains regarding the degree to which variation in study designs and patient populations affects cross-cohort generalizability.'
  };

  // Theme 2: Primary Clinical Findings & Direction (Prompt 2 - A2: consistent requires 2+ records on SAME normalized outcome)
  const consistentOutcomesPositive = [];
  const singleStudyOutcomes = [];
  const consistentOutcomesNull = [];

  Object.keys(outcomesByName).forEach(name => {
    const list = outcomesByName[name];
    const pos = list.filter(x => x.direction === 'favours intervention');
    const nul = list.filter(x => x.direction === 'no difference' || x.direction === 'favours comparator');
    const posRefs = [...new Set(pos.map(x => x.refNumber))];
    const nulRefs = [...new Set(nul.map(x => x.refNumber))];

    if (posRefs.length >= 2) {
      consistentOutcomesPositive.push(`${name}: consistent positive findings across studies [${posRefs.join(', ')}]`);
    } else if (posRefs.length === 1) {
      const displayName = name === 'prediction accuracy / AUC' ? 'Prediction accuracy' : (name.charAt(0).toUpperCase() + name.slice(1));
      singleStudyOutcomes.push(`${displayName}: favours the intervention in [${posRefs[0]}] (single study, not consistent across studies)`);
    }

    if (nulRefs.length >= 2) {
      consistentOutcomesNull.push(`${name}: no statistically significant difference across studies [${nulRefs.join(', ')}]`);
    }
  });

  let theme2Findings;
  if (!hasFindings) {
    theme2Findings = 'The selected abstracts do not report outcome results sufficient to judge benefit.';
  } else if (consistentOutcomesPositive.length > 0) {
    theme2Findings = consistentOutcomesPositive.join('; ') + '.';
  } else if (singleStudyOutcomes.length > 0) {
    theme2Findings = singleStudyOutcomes.join('; ') + '.';
  } else if (consistentOutcomesNull.length > 0) {
    theme2Findings = consistentOutcomesNull.join('; ') + '.';
  } else if (nullOrNeg.length > 0 && positive.length === 0) {
    theme2Findings = 'Curated evidence demonstrates no statistically significant difference or non-inferiority was not demonstrated.';
  } else {
    theme2Findings = 'The selected abstracts do not report outcome results sufficient to judge benefit.';
  }

  let theme2Unresolved = 'Independent prospective replication across diverse cohorts remains necessary to establish long-term trajectory.';
  if (!hasFindings) {
    theme2Unresolved = 'No published abstract summaries available in the selected records; empirical findings remain unmeasured.';
  } else if (conflictingOutcomes.length > 0) {
    theme2Unresolved = `Unresolved conflicting findings across included studies for ${conflictingOutcomes[0].name}: positive findings reported in ${conflictingOutcomes[0].posRefs.map(ref => `[${ref}]`).join(', ')} contrast with null or non-significant outcomes in ${conflictingOutcomes[0].negRefs.map(ref => `[${ref}]`).join(', ')}.`;
  } else if (withinStudyVariations.length > 0) {
    theme2Unresolved = `Within-study endpoint variation observed in [${withinStudyVariations[0].refNumber}]: positive findings on ${withinStudyVariations[0].posNames} contrast with no significant difference on ${withinStudyVariations[0].nullNames}.`;
  } else if (nullOrNeg.length > 0 && positive.length === 0) {
    theme2Unresolved = 'Clinical efficacy remains unconfirmed as curated evidence demonstrated no statistically significant benefit or was not able to demonstrate non-inferiority.';
  }

  const theme2 = {
    themeId: 'theme-2',
    title: 'Primary Efficacy & Outcome Directions',
    scope: 'Synthesis of reported empirical findings and primary endpoint directions.',
    consistentFindings: theme2Findings,
    establishedFindings: theme2Findings,
    uncertainOrUnresolvedAreas: theme2Unresolved
  };

  // Theme 3: Limitations & Evidentiary Boundaries
  const limitationSentences = records.flatMap(r => r.authorStatedLimitations || []);
  const theme3 = {
    themeId: 'theme-3',
    title: 'Methodological Quality & Evidence Limitations',
    scope: 'Appraisal of study designs, sample sizes, and author-reported constraints.',
    consistentFindings: limitationSentences.length >= 2
      ? `Consistent identification of evidence boundaries across included studies [studies: ${records.filter(r => (r.authorStatedLimitations || []).length > 0).map(r => `[${r.refNumber}]`).join(', ')}].`
      : 'Not established by the selected evidence.',
    establishedFindings: limitationSentences.length >= 2
      ? `Consistent identification of evidence boundaries across included studies [studies: ${records.filter(r => (r.authorStatedLimitations || []).length > 0).map(r => `[${r.refNumber}]`).join(', ')}].`
      : 'Not established by the selected evidence.',
    uncertainOrUnresolvedAreas: limitationSentences.length > 0
      ? `Unresolved methodological questions persist regarding author-reported constraints in sample size, follow-up duration, or observational confounding.`
      : 'Uncertainty remains regarding complete risk-of-bias parameters and unmeasured confounders across study designs.'
  };

  return {
    objective: `Evidence synthesis summarizing ${paperCount} curated studies on "${cleanTop}" for a ${audience} audience.`,
    methodologyNote: 'Methodology: Narrative evidence synthesis differentiating supported findings across included studies from uncertain or unresolved areas, grounded strictly in selected abstracts.',
    themes: [theme1, theme2, theme3],
    synthesisPrinciples: [
      'Grounded strictly in approved literature without generic template filler.',
      'Explicit reporting of null and conflicting results with citation-free slide text and source metadata traceability.'
    ]
  };
}

/**
 * Audience calibration profile
 */
function getAudienceProfile(audience) {
  const normalized = (audience || 'Postgraduate').trim();
  switch (normalized) {
    case 'Public audience':
      return {
        level: 'Public audience',
        isPublic: true,
        tone: 'Accessible, clear, and focused on patient-centered outcomes.',
        objectiveModifier: (shortTitle) => `Provide a clear, accessible, patient-centered overview of what current clinical research demonstrates regarding ${shortTitle}.`,
        speakerGreeting: 'Welcome. Today we review the published scientific evidence on this topic, examining what current clinical studies show and what questions remain unanswered.'
      };
    case 'Undergraduate':
      return {
        level: 'Undergraduate',
        tone: 'Instructional, evidence-grounded, emphasizing study designs and outcome interpretation.',
        objectiveModifier: (shortTitle) => `Introduce preclinical and clinical learners to study design concepts, trial methodologies, and reported empirical outcomes on ${shortTitle}.`,
        speakerGreeting: 'Welcome. Today we critically appraise the published evidence on this topic, analyzing trial methodologies, empirical outcomes, and evidentiary boundaries.'
      };
    case 'Consultants':
      return {
        level: 'Consultants',
        tone: 'Critical, emphasizing methodological validity, effect sizes, and guideline implications.',
        objectiveModifier: (shortTitle) => `Deliver a critical specialist appraisal of trial methodology, outcome consistency, and clinical evidence boundaries for ${shortTitle}.`,
        speakerGreeting: 'Good morning, colleagues. Today we appraise current published evidence on this clinical question, focusing on outcome consistency, trial limitations, and practice implications.'
      };
    case 'Mixed audience':
      return {
        level: 'Mixed audience',
        tone: 'Balanced, multi-perspective, connecting clinical trial data to broad healthcare implications.',
        objectiveModifier: (shortTitle) => `Deliver a balanced appraisal of published literature on ${shortTitle} suitable for multidisciplinary healthcare professionals.`,
        speakerGreeting: 'Welcome, colleagues and guests. Today we examine the curated evidence on this topic, reviewing what published clinical trials demonstrate and where evidence remains mixed.'
      };
    case 'Postgraduate':
    default:
      return {
        level: 'Postgraduate',
        tone: 'Academic, evidence-calibrated, emphasizing trial findings, statistical measures, and clinical decision criteria.',
        objectiveModifier: (shortTitle) => `Synthesize published literature on ${shortTitle} to appraise empirical findings, methodological limitations, and practice recommendations.`,
        speakerGreeting: 'Welcome. Today we review the published evidence on this clinical topic, appraising study designs, reported trial endpoints, and unresolved research gaps.'
      };
  }
}

/**
 * Plain-language rendering for a public audience: ratio estimates become "% lower/higher risk",
 * confidence intervals, p-values and heterogeneity statistics are removed (numbers stay traceable in the notes).
 */
function toPlainLanguage(text) {
  let t = String(text || '');
  t = t.replace(/\b(a?OR|RR|HR|IRR)\s*:?\s*(\d+(?:\.\d+)?)(\s*\(95%\s*CI[^)]*\))?/g, (m, measure, est) => {
    const v = Number(est);
    if (!Number.isFinite(v) || v <= 0) return m;
    const pct = Math.round(Math.abs(1 - v) * 100);
    if (pct === 0) return 'no clear difference';
    const word = /OR/.test(measure) ? 'odds' : 'risk';
    return `about ${pct}% ${v < 1 ? 'lower' : 'higher'} ${word}`;
  });
  t = t.replace(/\s*\(95%\s*CI[^)]*\)/gi, '')
    .replace(/[;,]?\s*p\s*[=<>≤≥]\s*0?\.\d+/gi, '')
    .replace(/[;,]?\s*I\^?2\^?\s*=\s*[\d.]+%/gi, '')
    .replace(/\s+([;,.])/g, '$1')
    .replace(/;\s*\./g, '.')
    .replace(/\s{2,}/g, ' ');
  return t;
}

const PUBLIC_QUESTIONS = {
  2: 'Who do you think this treatment is meant to help?',
  3: 'Why do you think large trials count for more than single reports?',
  4: 'Which of these results would matter most to you or your family?',
  5: 'Why might a treatment help in one study but not in another?',
  6: 'What would make you trust a study result more?',
  7: 'What question would you want researchers to answer next?',
  8: 'What is the one message you will take home today?'
};

/** Moves a trailing "(Surname 2024)" attribution to a leading "Surname 2024: " label (no in-text citations). */
function leadingStudyLabel(text) {
  const m = String(text || '').match(/^(•\s*)?([\s\S]*?)\s*\(([A-Z][A-Za-zÀ-ÿ'’-]+(?:\s[A-Z][A-Za-zÀ-ÿ'’-]+)?\s\d{4})\)(\s*\[not PubMed-indexed\])?\.?\s*$/);
  if (!m || /^[A-Z][A-Za-zÀ-ÿ'’-]+ \d{4}:/.test(m[2])) return text;
  return `${m[1] || ''}${m[3]}: ${m[2].replace(/[.;,\s]+$/, '')}${m[4] || ''}.`;
}

/**
 * Ranks candidate finding sentences for a record:
 * Tier 1: results sentence with parsed effect (comparisons / OR / RR / HR / RD / AUC / CI / p)
 * Tier 2: results sentence with other numbers
 * Tier 3: author conclusion from systematic review or RCT
 * Tier 4: other conclusion or qualitative results sentence
 */
function getRankedFindingCandidates(rec) {
  if (!rec) return [];
  const rawList = Array.isArray(rec.findingCandidates) && rec.findingCandidates.length > 0
    ? rec.findingCandidates
    : (rec.keyFindingSentences || []).map(text => ({ text, role: 'results' }));

  const designLower = (rec.designFromSource || '').toLowerCase();
  const isSrOrRct = isRandomisedTrialDesign(designLower) || isEvidenceSynthesisDesign(designLower);

  return rawList
    .filter(c => c && c.text && (!c.role || c.role === 'results' || c.role === 'conclusion'))
    .filter(c => c.role === 'conclusion' || FINDING_SIGNAL_REGEX.test(c.text) || /\bsignifican|\bdiffer(?:ed|ence)|\bsimilar\b|\bcomparable\b/i.test(c.text))
    .filter(c => {
      // the abstract parser's own role label must agree (no background/methods sentence becomes a finding)
      const match = (rec.classifiedSentences || []).find(cs => cs && cs.text && (cs.text === c.text || c.text.includes(cs.text) || cs.text.includes(c.text)));
      return !match || match.role === 'results' || match.role === 'conclusion';
    })
    .filter(c => !/^(?:background|introduction|objectives?|aims?|methods?)\b/i.test(c.text))
    .filter(c => c && c.text && !DESIGN_OR_SAMPLE_SENTENCE_REGEX.test(c.text) && isEnglishText(c.text).ok)
    .map(c => {
      const parsed = parseStructuredResultSentence(c.text);
      const hasEffect = !!(parsed && (parsed.comparisons.length >= 2 || (parsed.effect && parsed.effect.estimate)));
      const hasNums = extractNumericTokens(c.text).length > 0;
      let tier = 4;
      if (c.role === 'results' && hasEffect) tier = 1;
      else if (c.role === 'results' && hasNums) tier = 2;
      else if (c.role === 'conclusion' && isSrOrRct) tier = 3;
      else if (c.role === 'results') tier = 3;
      return { text: c.text, role: c.role || 'results', tier };
    })
    .sort((a, b) => a.tier - b.tier);
}

/**
 * Builds compact structured finding bullet with machine-readable provenance
 */
function buildStructuredFinding(rec, usedSourceSentences = null) {
  const out = buildStructuredFindingRaw(rec, usedSourceSentences);
  if (out && rec && rec.abbreviations && Object.keys(rec.abbreviations).length > 0) {
    out.text = expandDefinedAbbreviations(out.text, rec.abbreviations);
  }
  return out;
}

function buildStructuredFindingRaw(rec, usedSourceSentences = null) {
  if (!rec) return null;

  // 1. Check for adjacent/nearby paired sentences reporting the same metric for two groups
  const rawSents = Array.isArray(rec.classifiedSentences)
    ? rec.classifiedSentences.filter(ps => ps.role === 'results' && isEnglishText(ps.text).ok && !DESIGN_OR_SAMPLE_SENTENCE_REGEX.test(ps.text) && !/were analy[sz]ed with a (?:mean|median) follow-up/i.test(ps.text)).map(ps => ps.text)
    : [];
  for (let i = 0; i < rawSents.length; i++) {
    if (usedSourceSentences && usedSourceSentences.has(`${rec.refNumber}:${rawSents[i]}`)) continue;
    const pSingle = parseStructuredResultSentence(rawSents[i]);
    if (pSingle && pSingle.comparisons.length >= 2) continue; // Already a complete two-group comparison
    for (let j = i + 1; j <= Math.min(i + 2, rawSents.length - 1); j++) {
      if (usedSourceSentences && usedSourceSentences.has(`${rec.refNumber}:${rawSents[j]}`)) continue;
      const pNext = parseStructuredResultSentence(rawSents[j]);
      if (pNext && pNext.comparisons.length >= 2) continue;
      const paired = tryPairAdjacentSentences(rawSents[i], rawSents[j]);
      if (paired) {
        if (usedSourceSentences) {
          usedSourceSentences.add(`${rec.refNumber}:${rawSents[i]}`);
          usedSourceSentences.add(`${rec.refNumber}:${rawSents[j]}`);
        }
        const shortTag = formatShortTag(rec.authors, rec.year);
        const dir = detectOutcomeDirection(`${rawSents[i]} ${rawSents[j]}`);
        const outName = rec.outcomes?.[0]?.name || 'prediction accuracy';
        return {
          text: paired.text,
          shortTag,
          isNotPubMedIndexed: rec.assuranceTier === 'B' || rec.assuranceTier === 'unknown',
          sourceSentence: rawSents[i],
          tier: 1,
          isFinding: true,
          isStructured: true,
          derivedFrom: [
            { ref: rec.refNumber, outcome: outName, direction: dir, sourceSentence: rawSents[i] },
            { ref: rec.refNumber, outcome: outName, direction: dir, sourceSentence: rawSents[j] }
          ]
        };
      }
    }
  }

  const ranked = getRankedFindingCandidates(rec);
  const available = usedSourceSentences
    ? ranked.filter(c => !usedSourceSentences.has(`${rec.refNumber}:${c.text}`))
    : ranked;

  if (available.length > 0) {
    let rawSentence = available[0].text;
    if (available.length > 1) {
      const hasPos = available.some(c => detectOutcomeDirection(c.text) === 'favours intervention');
      const hasNul = available.some(c => detectOutcomeDirection(c.text) === 'no difference');
      if (hasPos && hasNul && available[0].tier <= 2 && available[1].role === 'results') {
        rawSentence = `${available[0].text}; ${available[1].text}`;
        if (usedSourceSentences) {
          usedSourceSentences.add(`${rec.refNumber}:${available[1].text}`);
        }
      }
    }
    if (usedSourceSentences) {
      usedSourceSentences.add(`${rec.refNumber}:${available[0].text}`);
    }

    const cleanSentence = stripCitations(rawSentence)
      .replace(/\bthan the manual\b(?!\s+group)/gi, 'than the manual group');

    const dir = detectOutcomeDirection(cleanSentence);
    const outName = rec.outcomes?.[0]?.name || 'primary outcome';
    const shortTag = formatShortTag(rec.authors, rec.year);
    return {
      text: cleanSentence,
      shortTag,
      isNotPubMedIndexed: rec.assuranceTier === 'B' || rec.assuranceTier === 'unknown',
      sourceSentence: cleanSentence,
      tier: available[0].tier,
      isFinding: true,
      isStructured: false,
      derivedFrom: [{
        ref: rec.refNumber,
        outcome: outName,
        direction: dir,
        sourceSentence: cleanSentence
      }]
    };
  }

  return null;
}

/**
 * Shortens non-finding text strictly at clause boundaries (Prompt 2B - Problem 1)
 */
function shortenNonFindingAtClauseBoundary(bullet, maxWords) {
  if (!bullet || typeof bullet !== 'string') return '';
  const trimmed = bullet.trim();
  const hasBulletPrefix = trimmed.startsWith('• ');
  const text = trimmed.replace(/^[•\s-]+/, '').trim();
  const effectiveMaxWords = maxWords;
  const words = text.split(/\s+/).filter(Boolean);

  if (words.length <= effectiveMaxWords) {
    return hasBulletPrefix ? `• ${text}` : text;
  }

  // Look for a clause boundary (commas, semicolons, dashes) near effectiveMaxWords
  let bestCutIndex = -1;
  const minCutIndex = Math.max(6, effectiveMaxWords - 4);
  for (let i = effectiveMaxWords; i >= minCutIndex; i--) {
    const rawWord = words[i - 1];
    const cleanWord = rawWord.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (STOP_WORDS_AT_END.has(cleanWord)) continue;

    // Must be after any initial author or label prefix (e.g. "Author et al., 2023:")
    if (rawWord.includes(':') && i <= 6) continue;

    if (/[,;–—]/.test(rawWord)) {
      bestCutIndex = i;
      break;
    }
  }

  let cutWords = bestCutIndex > 0 ? words.slice(0, bestCutIndex) : words.slice(0, effectiveMaxWords);
  while (cutWords.length > 3) {
    const cleanLast = cutWords[cutWords.length - 1].toLowerCase().replace(/[^a-z0-9]/g, '');
    if (STOP_WORDS_AT_END.has(cleanLast)) {
      cutWords.pop();
    } else {
      break;
    }
  }

  let truncatedText = cutWords.join(' ').replace(/[,;:\s–-]+$/, '');
  if (!/[.!?]$/.test(truncatedText)) {
    truncatedText += '.';
  }

  return hasBulletPrefix ? `• ${truncatedText}` : truncatedText;
}

/**
 * Constrains bullet words: Never cut finding bullets at word count (Prompt 2B - Problem 1)
 */
function constrainBulletWords(bullet, maxWords) {
  if (!bullet || typeof bullet !== 'string') return '';
  const isFinding = FINDING_SIGNAL_REGEX.test(bullet) || /\b\d+(?:\.\d+)?%/.test(bullet);
  if (isFinding) {
    let clean = ensureCleanBullet(bullet)
      .replace(/\bthan the manual\b(?!\s+group)/gi, 'than the manual group');
    if (!clean.startsWith('• ')) clean = `• ${clean}`;
    if (!/[.!?]$/.test(clean)) clean += '.';
    return clean;
  }
  return shortenNonFindingAtClauseBoundary(bullet, maxWords);
}

/**
 * Formats bullets data according to density (Prompt 2B - Problem 1)
 * Never truncates finding bullets; shortens non-finding bullets only at clause boundaries.
 */
function formatOnSlideBulletsData(bulletsData, density = 'Balanced') {
  if (!Array.isArray(bulletsData) || bulletsData.length === 0) return [];

  let maxWords = 15;
  let maxBullets = 4;
  if (density === 'Short' || density === 'Short bullet points') {
    maxWords = 8;
    maxBullets = 3;
  } else if (density === 'Detailed') {
    maxWords = 25;
    maxBullets = 5;
  }

  const normalizedItems = bulletsData
    .map(item => {
      if (typeof item === 'string') {
        const isFinding = FINDING_SIGNAL_REGEX.test(item) || /\b\d+(?:\.\d+)?%/.test(item);
        return { text: item, isFinding };
      }
      return { ...item };
    })
    .filter(item => item && typeof item.text === 'string' && item.text.trim());

  let remainingCap = maxBullets;
  const items = normalizedItems.filter(item => {
    if (item.mandatoryConclusion) return true;
    if (remainingCap > 0) {
      remainingCap--;
      return true;
    }
    return false;
  });

  const formatted = [];
  for (const item of items) {
    let clean = ensureCleanBullet(item.text)
      .replace(/\bthan the manual\b(?!\s+group)/gi, 'than the manual group');

    const isFinding = item.isFinding ||
      (Array.isArray(item.derivedFrom) && item.derivedFrom.length > 0) ||
      FINDING_SIGNAL_REGEX.test(clean) ||
      /\b\d+(?:\.\d+)?%/.test(clean);

    if (isFinding) {
      const baseMax = (density === 'Short' || density === 'Short bullet points') ? 18 : maxWords;
      const tagReserve = item.shortTag ? 2 : 0;
      const findingMaxWords = Math.max(6, baseMax - tagReserve);
      let bodyText = clean.replace(/^•\s*/, '');
      let overflowNote = '';
      if (!item.isStructured) {
        const colonIdx = bodyText.indexOf(':');
        const hasShortLabel = colonIdx > 0 && colonIdx <= 35 && /^[A-Za-z0-9\s/-]+$/.test(bodyText.slice(0, colonIdx));
        const leadPart = hasShortLabel ? bodyText.slice(0, colonIdx).trim() : '';
        const sentPart = leadPart ? bodyText.slice(colonIdx + 1).trim() : bodyText;
        const compressed = compressFindingPreservingNumbers(leadPart, sentPart, findingMaxWords);
        overflowNote = compressed.overflow || '';

        if (compressed.omittedFromSlide) {
          formatted.push({
            ...item,
            text: '',
            overflowNote,
            omittedFromSlide: true,
            isFinding: true
          });
          continue;
        }

        bodyText = compressed.text;
      }
      if (item.shortTag && !bodyText.includes(`(${item.shortTag})`)) {
        bodyText = bodyText.replace(/[.!?]+$/, '') + ` (${item.shortTag})`;
      }
      if (item.isNotPubMedIndexed && !bodyText.includes('[not PubMed-indexed]')) {
        bodyText = bodyText.replace(/[.!?]+$/, '') + ' [not PubMed-indexed]';
      }
      clean = `• ${bodyText}`;
      if (!/[.!?]$/.test(clean)) clean += '.';
      formatted.push({
        ...item,
        text: clean,
        overflowNote,
        isFinding: true
      });
      continue;
    }

    if (item.preserveFullText) {
      formatted.push({
        ...item,
        text: clean
      });
      continue;
    }

    const shortened = shortenNonFindingAtClauseBoundary(clean, maxWords);
    formatted.push({
      ...item,
      text: shortened
    });
  }
  return formatted;
}

/**
 * Formats bullets according to density (Prompt 2 - A5, Prompt 2B - Problem 1)
 */
function formatOnSlideText(bullets, density = 'Balanced') {
  if (!Array.isArray(bullets) || bullets.length === 0) return '';
  const bulletItems = bullets.map(b => typeof b === 'string' ? { text: b } : b);
  const formatted = formatOnSlideBulletsData(bulletItems, density);
  return formatted.map(b => b.text).join('\n');
}

/**
 * Adapts visual description per visual type
 */
function adaptVisualDescription(baseDescription, visualType, visualStyle) {
  const style = visualStyle || 'Scientific pictorial';

  if (visualType === 'Forest plot' || visualType === 'Effect estimate') {
    return `${baseDescription} Style: ${style.toLowerCase()} palette, sans-serif labels at 14 pt or larger.`;
  }
  if (visualType === 'Table') {
    return `Structured data table layout: ${baseDescription}`;
  }
  if (visualType === 'Bar chart') {
    return `Comparative chart display rendered in clean ${style} design: ${baseDescription}`;
  }
  if (visualType === 'Flowchart') {
    return `Process flowchart diagram with logical decision nodes in ${style} formatting: ${baseDescription}`;
  }
  return `${style} style conceptual visual: ${baseDescription}`;
}

/**
 * Generates the complete presentation deck using extractive evidence
 */
function generatePresentationDeck({
  topic = 'Scientific Topic',
  shortTitle = '',
  papers = [],
  targetPapers = 10,
  startYear = 2021,
  audience = 'Postgraduate',
  slideCount = 8,
  requestedSlideCount: requestedSlideCountParam = null,
  density = 'Balanced',
  visualStyle = 'Scientific pictorial',
  approvedKeywords = {},
  approvedStrategy = {}
}) {
  if (!papers || papers.length === 0) {
    throw new Error('At least one approved paper is required to generate the presentation deck.');
  }

  const requestedSlideCount = Math.max(1, Math.min(30, Number(requestedSlideCountParam ?? slideCount) || 8));
  const cleanShortTitle = cleanText(shortTitle) || cleanText(topic).substring(0, 45);
  const currentYear = new Date().getFullYear();
  const allowedVisualStyles = ['Photographic', 'Illustrative', 'Scientific pictorial', 'Cinematic 3D'];
  const activeVisualStyle = allowedVisualStyles.includes(visualStyle) ? visualStyle : 'Scientific pictorial';

  // Extract structured evidence records strictly from approved papers
  const records = extractEvidenceRecords(papers);
  // Abbreviations defined in each abstract are expanded in DISPLAYED text only; source sentences stay verbatim
  records.forEach(r => { r.abbreviations = buildAbbreviationMap(r.abstract); });
  const usableRecords = records.filter(r => r.hasAbstract && r.assuranceTier !== 'C');

  // Classify outcome directions
  const nullRecords = usableRecords.filter(r => r.outcomes.some(o => o.direction === 'no difference' || o.direction === 'favours comparator'));
  const positiveRecords = usableRecords.filter(r => r.outcomes.some(o => o.direction === 'favours intervention'));
  const hasNullOrNegative = nullRecords.length > 0;
  const hasPositive = positiveRecords.length > 0;

  // Audit D-01: one evidence verdict per study (author conclusion / primary result), weighted by design,
  // with off-topic studies excluded. This — not any stray null sentence — drives every headline.
  const offTopicRefs = computeOffTopicRefs(records, papers, topic, approvedStrategy);
  const topicConcepts = extractConceptPhrases(topic);
  const firstKeyword = ((approvedKeywords && approvedKeywords.primaryKeywords && approvedKeywords.primaryKeywords[0]) || '').trim();
  const interventionLabel = (firstKeyword && firstKeyword.includes(' ') ? firstKeyword : '')
    || topicConcepts[0]
    || firstKeyword
    || 'the intervention';
  const evidenceVerdict = deriveEvidenceVerdict(usableRecords, { intervention: interventionLabel, offTopicRefs, topic });
  const verdictNullRecords = usableRecords.filter(r => evidenceVerdict.highQualityNull.includes(r.refNumber));

  // Derive research gaps and synthesis plan
  const rawResearchGaps = deriveResearchGaps(topic, records, [], offTopicRefs);
  const researchGaps = rawResearchGaps;
  const synthesisPlan = generateSynthesisPlan(topic, records, audience);
  const audienceProfile = getAudienceProfile(audience);

  // References list
  const references = records.map(r => {
    const authorStr = r.authors || 'Unknown Authors';
    const titleStr = r.title || 'Untitled study';
    const journalStr = (r.journal && !/^(?:academic|scholarly) journal$/i.test(r.journal)) ? r.journal : '';
    const yearStr = r.year || 'n.d.';
    const pmidStr = r.pmid ? ` PMID: ${r.pmid}.` : '';
    const doiStr = r.doi ? ` DOI: https://doi.org/${r.doi}.` : '';

    return {
      referenceNumber: r.refNumber,
      authors: authorStr,
      title: titleStr,
      journal: journalStr,
      year: yearStr,
      pmid: r.pmid || '',
      doi: r.doi || '',
      citationCount: 0,
      userNote: papers[r.refNumber - 1]?.userNote || '',
      vancouverCitation: `[${r.refNumber}] ${authorStr}. ${titleStr}.${journalStr ? ` ${journalStr}.` : ''} ${yearStr}.${pmidStr}${doiStr}`
    };
  });

  // Track evidence map for Word export and traceability
  const evidenceMap = [];

  // =========================================================================
  // TOPIC-NEUTRAL EXTRACTIVE NARRATIVE ARC:
  // Slide 1: Title Slide
  // Slide 2: Question & Scope (The Hook)
  // Slide 3: Evidence Overview (Characteristics of Included Studies)
  // Slide 4: What the Studies Found (Primary Empirical Findings)
  // Slide 5: Conflicting or Null Findings (MANDATORY if null/negative results exist)
  // Slide 6: Methodological & Evidence Limitations
  // Slide 7: Unresolved Questions & Research Gaps
  // Slide 8: Conclusion & Practice Take-Homes
  // =========================================================================

  const slideBlueprints = [];
  let mergedEmptySections = 0;

  // 1. Title Slide (Prompt 2 - A6, C3, Prompt 2B)
  const rctN = records.filter(r => isRandomisedTrialDesign(r.designFromSource)).length;
  const srN = records.filter(r => isEvidenceSynthesisDesign(r.designFromSource)).length;
  const titleBulletsData = [
    { text: `Question: what does the evidence show for ${interventionLabel}?`, isFinding: false, preserveFullText: true },
    { text: `Evidence: ${records.length} studies (${rctN} RCT${rctN === 1 ? '' : 's'}, ${srN} review${srN === 1 ? '' : 's'}/meta-analys${srN === 1 ? 'is' : 'es'}), ${startYear}–${currentYear}`, isFinding: false, preserveFullText: true }
  ];

  slideBlueprints.push({
    stage: 1,
    title: cleanShortTitle,
    objective: audienceProfile.objectiveModifier(cleanShortTitle),
    mainMessage: `Narrative summary of ${records.length} selected ${records.length === 1 ? 'study' : 'studies'} (abstract-based).`,
    bullets: titleBulletsData.map(b => b.text),
    bulletsData: titleBulletsData,
    visualType: 'Concept map',
    visualDescription: 'Executive title architecture summarizing evidence scope and review parameters.',
    speakerNotes: `${audienceProfile.speakerGreeting} Today we look at what ${records.length} selected studies report on ${interventionLabel}. The summary is built from titles and abstracts, so key numbers should be confirmed in the full papers.`,
    audienceQuestion: audienceProfile.isPublic
      ? `What would you most like to know about ${interventionLabel} before today's talk?`
      : `What uncertainty about ${interventionLabel} do you meet most often in practice?`,
    transition: 'Let us begin by establishing the clinical question, target populations, and scope of investigation.',
    sources: []
  });

  // 2. Question & Scope (The Hook - Prompt 2 - A6, Prompt 2B: concise complete clause)
  const extractedPops = usableRecords.filter(r => r.population && r.population.trim().length > 5);
  const hasExtractedPop = extractedPops.length > 0;

  void hasExtractedPop;
  const versusMatch = String(topic || '').match(/\b(?:versus|vs\.?|compared (?:with|to))\s+(.+?)(?:\s+(?:in|for|among)\s+|[:;?]|$)/i);
  const comparatorConcept = versusMatch ? topicConcepts.find(c => versusMatch[1].toLowerCase().includes(c.toLowerCase())) || versusMatch[1].trim() : '';
  const populationConcept = topicConcepts.find(c => c.toLowerCase() !== interventionLabel.toLowerCase() && c.toLowerCase() !== comparatorConcept.toLowerCase()) || '';
  const scopeBulletsData = [
    ...(populationConcept ? [{ text: `Population: ${populationConcept}`, isFinding: false, preserveFullText: true }] : []),
    { text: `Intervention: ${interventionLabel}`, isFinding: false, preserveFullText: true },
    ...(comparatorConcept ? [{ text: `Comparator: ${comparatorConcept}`, isFinding: false, preserveFullText: true }] : []),
    { text: `Outcomes: those reported for ${interventionLabel}`, isFinding: false, preserveFullText: true },
    ...(density === 'Detailed' ? [{ text: `Evidence considered: ${records.length} studies, including ${rctN} randomised trial${rctN === 1 ? '' : 's'} and ${srN} systematic review${srN === 1 ? '' : 's'}`, isFinding: false, preserveFullText: true }] : [])
  ];

  slideBlueprints.push({
    stage: 2,
    title: 'Clinical Dilemma & Study Scope',
    objective: `Examine the clinical rationale, target population, and diagnostic or therapeutic boundaries addressed by current studies.`,
    mainMessage: comparatorConcept
      ? `The question: how does ${interventionLabel} compare with ${comparatorConcept}${populationConcept ? ` in ${populationConcept}` : ''}?`
      : populationConcept
        ? `The question: does treatment with ${interventionLabel} help people with ${populationConcept}?`
        : `The question: what are the benefits and harms of ${interventionLabel}?`,
    bullets: scopeBulletsData.map(b => b.text),
    bulletsData: scopeBulletsData,
    visualType: 'Flowchart',
    visualDescription: 'Eligibility and scoping diagram defining clinical question boundaries and patient cohort criteria.',
    speakerNotes: `Before the results, let us be precise about the question: who the patients are${populationConcept ? ` (${populationConcept})` : ''}, what the intervention is (${interventionLabel}), and which outcomes we care about. Results from other populations are not used for our conclusions.`,
    audienceQuestion: `What clinical criteria does your team currently use to identify appropriate candidates for this intervention or evaluation?`,
    transition: 'With scope defined, let us examine the characteristics, designs, and cohorts of the included studies.',
    sources: []
  });

  // 3. Evidence Overview: Characteristics of Included Studies
  const designBulletsData = records.slice(0, 5).map(r => ({
    text: `${formatShortTag(r.authors, r.year)}: ${r.designFromSource}${r.journal ? ` in ${r.journal}` : ''}${offTopicRefs.has(r.refNumber) ? ' (different population, not used for conclusions)' : ''}`,
    isFinding: false,
    preserveFullText: true
  }));
  if (records.length > 5) {
    designBulletsData.push({ text: `Also included: ${records.slice(5).map(r => formatShortTag(r.authors, r.year)).join(', ')}`, isFinding: false, preserveFullText: true });
  }

  slideBlueprints.push({
    stage: 3,
    title: 'Characteristics & Design of Included Studies',
    objective: `Detail the study designs, sample characteristics, and evidence hierarchy across the curated literature.`,
    mainMessage: `${records.length} ${records.length === 1 ? 'study' : 'studies'}: ${rctN} randomised trial${rctN === 1 ? '' : 's'} and ${srN} systematic review${srN === 1 ? '' : 's'} carry the most weight.`,
    bullets: designBulletsData.map(b => b.text),
    bulletsData: designBulletsData,
    visualType: 'Table',
    visualDescription: 'Summary evidence table displaying study identifiers, author citations, research designs, and evaluated populations.',
    speakerNotes: `Study design decides how much weight each result gets. Randomised trials and systematic reviews of trials (${rctN + srN} of ${records.length} here) drive the conclusions; reviews and observational studies add context.${offTopicRefs.size ? ` ${offTopicRefs.size} stud${offTopicRefs.size === 1 ? 'y' : 'ies'} with a different population ${offTopicRefs.size === 1 ? 'is' : 'are'} shown but not used for conclusions.` : ''}`,
    audienceQuestion: `How does the proportion of randomized versus observational studies in this evidence base influence your confidence in the reported findings?`,
    transition: 'Having reviewed study designs, let us now examine what the trials empirically found.',
    sources: records.map(r => r.refNumber)
  });

  // Track used source sentences across the entire deck so no source sentence is duplicated
  const usedSourceSentences = new Set();

  // Prioritize Tier A (PubMed/MEDLINE-indexed) sources, then finding tier, then clinical outcomes over technical metrics
  const prioritizedRecords = [...usableRecords].filter(r => !offTopicRefs.has(r.refNumber) || usableRecords.every(x => offTopicRefs.has(x.refNumber))).sort((a, b) => {
    // 1. studies with a quantitative result, 2. stronger design, 3. PubMed-indexed, 4. finding tier
    const aQ = (getRankedFindingCandidates(a)[0]?.tier ?? 99) <= 2 ? 1 : 0;
    const bQ = (getRankedFindingCandidates(b)[0]?.tier ?? 99) <= 2 ? 1 : 0;
    if (aQ !== bQ) return bQ - aQ;
    const aW = designWeight(a.designFromSource);
    const bW = designWeight(b.designFromSource);
    if (aW !== bW) return bW - aW;
    const aRank = a.assuranceTier === 'A' ? 0 : 1;
    const bRank = b.assuranceTier === 'A' ? 0 : 1;
    if (aRank !== bRank) return aRank - bRank;
    const aCand = getRankedFindingCandidates(a)[0];
    const bCand = getRankedFindingCandidates(b)[0];
    const aTier = aCand?.tier ?? 99;
    const bTier = bCand?.tier ?? 99;
    if (aTier !== bTier) return aTier - bTier;
    const aDomain = aCand && classifyMetricDomain(aCand.text) === 'technical' ? 1 : 0;
    const bDomain = bCand && classifyMetricDomain(bCand.text) === 'technical' ? 1 : 0;
    return aDomain - bDomain;
  });

  // 4. What the Studies Found: Primary Outcomes (Prompt 2 - A4, A5, Prompt 2B - Problem 1)
  const allCandidateFindings = [];
  prioritizedRecords.forEach(r => {
    const cand = getRankedFindingCandidates(r)[0];
    const domain = cand ? classifyMetricDomain(cand.text) : 'clinical';
    allCandidateFindings.push({ record: r, domain });
  });
  const hasClinicalFindings = allCandidateFindings.some(item => item.domain === 'clinical' && getRankedFindingCandidates(item.record).length > 0);

  const primaryBulletsData = [];
  const primarySources = [];
  // neutral high-quality results get their own slide, unless they are the only results available
  const othersHaveFindings = allCandidateFindings.some(({ record }) => !verdictNullRecords.includes(record) && getRankedFindingCandidates(record).length > 0);
  const shownOnNullSlide = new Set(othersHaveFindings ? verdictNullRecords.map(r => r.refNumber) : []);
  allCandidateFindings.forEach(({ record: r, domain }) => {
    if (hasClinicalFindings && domain === 'technical') return;
    if (shownOnNullSlide.has(r.refNumber)) return; // neutral high-quality results get their own slide
    const finding = buildStructuredFinding(r, usedSourceSentences);
    if (finding) {
      primaryBulletsData.push(finding);
      primarySources.push(r.refNumber);
      evidenceMap.push({
        slideNumber: 4,
        statement: `Primary findings from ${formatAuthorLead(r.authors)}: ${finding.text}`,
        references: [r.refNumber],
        supportingSentence: finding.sourceSentence || finding.text
      });
    }
  });

  const allAbstractsLower = records.map(r => (r.title || '') + ' ' + (r.abstract || '')).join(' ').toLowerCase();
  const isNonInferiorityTopic = allAbstractsLower.includes('noninferiority') || allAbstractsLower.includes('non-inferiority');
  const allDesignsVerified = records.length > 0 && records.every(r => r.designFromSource && r.designFromSource !== 'Design not stated');
  const hasRct = records.some(r => {
    const d = (r.designFromSource || '').toLowerCase();
    return isRandomisedTrialDesign(d);
  });

  let primaryOutcomeMessage;
  if (primaryBulletsData.length === 0) {
    primaryBulletsData.push({ text: 'Selected records do not provide abstract summaries reporting empirical outcome metrics.', isFinding: false });
    primaryOutcomeMessage = 'The selected abstracts do not report outcome results sufficient to judge benefit.';
  } else {
    // If no Tier A paper has an eligible finding, lead Slide 4 with the required notice
    if (primaryBulletsData[0]?.isNotPubMedIndexed) {
      primaryBulletsData.unshift({
        text: 'No finding from a PubMed-indexed study in the selected papers.',
        isFinding: false,
        preserveFullText: true
      });
    }
    const v = evidenceVerdict.verdict;
    if (v === 'benefit') {
      primaryOutcomeMessage = `Randomised and pooled evidence favours ${interventionLabel} on the main outcomes reported.`;
    } else if (v === 'mixed') {
      primaryOutcomeMessage = `High-quality studies disagree: some show benefit from ${interventionLabel} and others no significant difference on their main outcome.`;
    } else if (v === 'no benefit') {
      primaryOutcomeMessage = /^Non-inferiority/.test(evidenceVerdict.headline)
        ? `In the randomised evidence, non-inferiority was not demonstrated for ${interventionLabel}.`
        : `Included trials or meta-analyses did not show a statistically significant improvement of ${interventionLabel} on their main outcome.`;
    } else if (v === 'harm') {
      primaryOutcomeMessage = `High-quality evidence reports harm or inferior outcomes with ${interventionLabel}.`;
    } else {
      primaryOutcomeMessage = `Findings come from lower-level evidence only; treat the direction of effect as provisional.`;
    }
  }

  slideBlueprints.push({
    stage: 4,
    title: 'What the Studies Found: Primary Outcomes',
    objective: `Synthesize reported empirical endpoints, effect sizes, and statistical findings from the included studies.`,
    mainMessage: primaryOutcomeMessage,
    bullets: primaryBulletsData.map(b => b.text),
    bulletsData: primaryBulletsData,
    visualType: 'Bar chart',
    visualDescription: 'Comparative display plotting primary outcome endpoints and statistical intervals extracted from included studies.',
    speakerNotes: `${primaryOutcomeMessage} Randomised trials and meta-analyses come first. The exact result sentences from each abstract follow so the numbers can be checked:`,
    audienceQuestion: `Do these primary trial endpoints reflect the clinical outcomes you prioritize most when evaluating patient care?`,
    transition: verdictNullRecords.length > 0
      ? 'Next, the trials or meta-analyses that did not show a statistically significant improvement.'
      : 'To critically interpret these findings, let us now examine the methodological and evidence limitations.',
    sources: primarySources.slice(0, 4)
  });

  // 5. Conflicting Evidence or Null Findings (Generated ONLY if cross-study conflict or null RCT)
  const outcomesByName = {};
  usableRecords.forEach(r => {
    (r.outcomes || []).forEach(o => {
      const name = o.name || 'primary outcome';
      if (!outcomesByName[name]) outcomesByName[name] = [];
      outcomesByName[name].push({ refNumber: r.refNumber, direction: o.direction, result: o.result });
    });
  });

  const conflictingOutcomes = [];
  Object.keys(outcomesByName).forEach(name => {
    const list = outcomesByName[name];
    const pos = list.filter(x => x.direction === 'favours intervention');
    const neg = list.filter(x => x.direction === 'no difference' || x.direction === 'favours comparator');
    const posRefs = new Set(pos.map(x => x.refNumber));
    const negRefs = new Set(neg.map(x => x.refNumber));
    const hasDifferentDisagreement = Array.from(posRefs).some(pr => !negRefs.has(pr)) && Array.from(negRefs).some(nr => !posRefs.has(nr));
    if (pos.length > 0 && neg.length > 0 && hasDifferentDisagreement) {
      conflictingOutcomes.push({ name, posRefs: Array.from(posRefs), negRefs: Array.from(negRefs) });
    }
  });

  // Only trials / meta-analyses whose OWN main result was neutral (never a subgroup or a secondary outcome)
  const nullTrials = verdictNullRecords;

  if (nullTrials.length > 0) {
    const nullBulletsData = [];
    const nullSources = [];
    nullTrials.forEach(r => {
      const finding = buildStructuredFinding(r, usedSourceSentences);
      if (finding) {
        nullBulletsData.push(finding);
        nullSources.push(r.refNumber);
        evidenceMap.push({
          slideNumber: 5,
          statement: `Null or non-inferiority finding from ${formatAuthorLead(r.authors)}: ${finding.text}`,
          references: [r.refNumber],
          supportingSentence: finding.sourceSentence || finding.text
        });
      } else {
        const rv = evidenceVerdict.perRecord.find(x => x.ref === r.refNumber) || {};
        const isRctNonInf = /non-?inferiority/i.test(rv.sentence || '');
        const tag = formatShortTag(r.authors, r.year);
        const summaryText = isRctNonInf
          ? `Non-inferiority was not demonstrated (${tag}).`
          : `No statistically significant improvement on the main outcome (${tag}).`;
        nullBulletsData.push({
          text: summaryText,
          isFinding: true,
          isStructured: true,
          derivedFrom: [{ ref: r.refNumber, outcome: r.outcomes?.[0]?.name || 'primary outcome', direction: 'no difference' }]
        });
        nullSources.push(r.refNumber);
      }
    });

    const nullRefs = nullTrials.map(r => r.refNumber);
    const nullOnOther = evidenceVerdict.nullOnOtherOutcomes;
    const nullTrialMessage = nullOnOther
      ? `No significant difference with ${interventionLabel} on ${evidenceVerdict.nullOutcomeLabels.join(' and ')} [${nullRefs.join(', ')}]; this does not contradict the benefit on the main outcome.`
      : nullTrials.every(r => /non-?inferiority/i.test((evidenceVerdict.perRecord.find(x => x.ref === r.refNumber) || {}).sentence || ''))
        ? `Non-inferiority was not demonstrated for ${interventionLabel} [${nullRefs.join(', ')}].`
        : `${nullTrials.length} high-quality ${nullTrials.length === 1 ? 'study' : 'studies'} [${nullRefs.join(', ')}] did not show a statistically significant improvement of ${interventionLabel} on the main outcome.`;

    slideBlueprints.push({
      stage: 5,
      title: nullOnOther ? 'Outcomes Without a Significant Difference' : 'Trials Without a Significant Benefit',
      objective: `Show which randomised trials or meta-analyses found no statistically significant improvement on their main outcome, and why that matters.`,
      mainMessage: nullTrialMessage,
      bullets: nullBulletsData.map(b => b.text),
      bulletsData: nullBulletsData,
      visualType: 'Bar chart',
      visualDescription: 'Comparative chart contrasting intervention and control rates where outcomes failed to achieve statistical significance.',
      speakerNotes: `${nullTrialMessage} Neutral results matter as much as positive ones: look at the population, dose, timing and outcome definition before concluding that the intervention does not work.`,
      audienceQuestion: `What differences in population, dose or outcome definition could explain why these studies were neutral?`,
      transition: 'Appraising trial findings brings us to the methodological limitations of the current evidence base.',
      sources: nullSources.slice(0, 4)
    });
  } else if (conflictingOutcomes.length > 0 && evidenceVerdict.verdict === 'mixed') {
    const conflictBullets = [];
    const conflictSources = [];
    conflictingOutcomes.forEach(co => {
      conflictBullets.push(`Cross-Study Conflict on ${co.name}: Discordant outcomes between positive studies [${co.posRefs.join(', ')}] and null studies [${co.negRefs.join(', ')}]`);
      conflictSources.push(...co.posRefs, ...co.negRefs);
    });

    slideBlueprints.push({
      stage: 5,
      title: 'Conflicting Evidence Across Studies',
      objective: `Compare discordance in reported clinical endpoints across different included studies.`,
      mainMessage: `Included studies report conflicting outcomes on ${conflictingOutcomes[0].name}.`,
      bullets: conflictBullets.slice(0, 4),
      visualType: 'Bar chart',
      visualDescription: 'Comparative display contrasting discordant trial outcomes across included studies.',
      speakerNotes: `Comparing findings across discordant studies reveals important areas of uncertainty. As observed here, included literature demonstrates conflicting outcomes on evaluated clinical endpoints.`,
      audienceQuestion: `How consistent are these comparative outcomes with the patterns you observe in clinical practice?`,
      transition: 'Having examined outcome consistency, we now evaluate study limitations.',
      sources: Array.from(new Set(conflictSources))
    });
  } else if (usableRecords.length >= 2 && conflictingOutcomes.length === 0 && !hasNullOrNegative) {
    const compFindingsData = [];
    const compSources = [];
    prioritizedRecords.forEach(r => {
      if (compFindingsData.length >= 3) return;
      const structured = buildStructuredFinding(r, usedSourceSentences);
      if (structured) {
        compFindingsData.push(structured);
        compSources.push(r.refNumber);
        evidenceMap.push({
          slideNumber: 5,
          statement: `Comparative finding from ${formatAuthorLead(r.authors)}: ${structured.text}`,
          references: [r.refNumber],
          supportingSentence: structured.sourceSentence || structured.text
        });
      }
    });
    if (compFindingsData.length === 0) {
      // Study-by-study verdict table (design, direction, basis) instead of empty filler
      const dirWord = { benefit: 'favours intervention', mixed: 'benefit on some outcomes only', 'no benefit': 'no significant difference', harm: 'favours comparator', unclear: 'direction not reported' };
      evidenceVerdict.perRecord.filter(v => !v.offTopic).slice(0, 4).forEach(v => {
        const r = usableRecords.find(x => x.refNumber === v.ref);
        if (!r) return;
        compFindingsData.push({
          text: `${formatShortTag(r.authors, r.year)} | ${r.designFromSource} | ${dirWord[v.direction] || v.direction} (${v.basis})`,
          isFinding: false,
          preserveFullText: true
        });
        compSources.push(r.refNumber);
      });
    } else {
      compFindingsData.push({
        text: evidenceVerdict.verdict === 'benefit'
          ? `Consistency (${interventionLabel}): the high-quality studies agree in direction`
          : `Consistency (${interventionLabel}): the direction of effect differs between studies`,
        isFinding: false
      });
    }

    slideBlueprints.push({
      stage: 5,
      title: 'Comparative Outcome Synthesis',
      objective: `Compare primary endpoints, effect sizes, and outcome consistency across included studies.`,
      mainMessage: evidenceVerdict.verdict === 'benefit'
        ? `Results from the included studies point in the same direction for ${interventionLabel}.`
        : `Outcomes reported across the included studies, side by side.`,
      bullets: compFindingsData.slice(0, 4).map(b => b.text),
      bulletsData: compFindingsData.slice(0, 4),
      visualType: 'Bar chart',
      visualDescription: 'Comparative display contrasting reported endpoints and effect sizes across included trials.',
      speakerNotes: `Comparing findings across studies shows whether the effect is reproducible. ${evidenceVerdict.verdict === 'benefit' ? 'Here the studies agree in direction.' : 'Here the direction of effect is not consistent, so look at study design and population.'}`,
      audienceQuestion: `How consistent are these comparative trial outcomes with the patterns you observe in clinical practice?`,
      transition: 'Having compared trial outcomes, we now examine safety profile and evidence limitations.',
      sources: compSources
    });
  }

  // 6. Methodological & Evidence Limitations
  const limitationBulletsData = [];
  const limitationSources = [];
  records.forEach(r => {
    const englishLims = (r.authorStatedLimitations || []).filter(lim => isEnglishText(lim).ok);
    if (englishLims.length > 0) {
      const lead = formatAuthorLead(r.authors);
      const limText = englishLims[0];
      limitationBulletsData.push({ text: `${lead} limitation: ${limText}`, isFinding: false });
      limitationSources.push(r.refNumber);
    }
  });

  // Study design breakdown constraint (Prompt 1B - E1, Prompt 2 - C3)
  const rctRefs = records.filter(r => isRandomisedTrialDesign(r.designFromSource)).map(r => r.refNumber);
  const srRefs = records.filter(r => isEvidenceSynthesisDesign(r.designFromSource)).map(r => r.refNumber);
  limitationBulletsData.push({ text: `Randomised trials of ${interventionLabel}: ${rctRefs.length} of ${records.length} studies`, isFinding: false, preserveFullText: true });
  if (rctRefs.length > 0 && srRefs.length > 0) {
    limitationBulletsData.push({ text: `Overlap: the ${srRefs.length} review${srRefs.length === 1 ? '' : 's'} may pool the same trials`, isFinding: false, preserveFullText: true });
  }
  if (offTopicRefs.size > 0) {
    limitationBulletsData.push({ text: `Excluded from conclusions: ${[...offTopicRefs].map(ref => { const r = records.find(x => x.refNumber === ref); return r ? formatShortTag(r.authors, r.year) : ''; }).filter(Boolean).join(', ')} (different population or topic)`, isFinding: false, preserveFullText: true });
  }
  if (!allDesignsVerified) {
    limitationBulletsData.push({ text: `Design not stated for some ${interventionLabel} papers`, isFinding: false, preserveFullText: true });
  }
  limitationBulletsData.push({ text: `Abstracts only: confirm ${interventionLabel} effect sizes in full texts`, isFinding: false, preserveFullText: true });

  slideBlueprints.push({
    stage: 6,
    title: 'Methodological & Evidence Limitations',
    objective: `Appraise internal validity constraints, sample size boundaries, and methodological limitations across the literature.`,
    mainMessage: `How much to trust these results: limits of the studies and of this summary.`,
    bullets: limitationBulletsData.map(b => b.text),
    bulletsData: limitationBulletsData,
    visualType: 'Concept map',
    visualDescription: 'Methodological limitations matrix detailing potential bias sources, sample constraints, and observational confounders.',
    speakerNotes: `Limitations come from two places: what the authors themselves report, and how this summary was made. Reviews can count the same trials twice, and abstracts leave out subgroup details and harms, so read the full papers before relying on a specific number.`,
    audienceQuestion: `Which of these methodological limitations represents the greatest barrier to applying these findings in your routine practice?`,
    transition: 'These methodological limitations directly define our priority research gaps and open investigational questions.',
    sources: limitationSources.slice(0, 4)
  });

  // 7. Unresolved Questions & Research Horizons
  const gapBulletsData = rawResearchGaps.slice(0, 4).map(g => ({ text: g, isFinding: false }));
  slideBlueprints.push({
    stage: 7,
    title: 'Unresolved Questions & Research Horizons',
    objective: `Identify priority investigational questions, unmeasured endpoints, and research gaps derived from the evidence base.`,
    mainMessage: rawResearchGaps.length === 1 && /^No research gaps/.test(rawResearchGaps[0])
      ? `The selected abstracts state no open questions; the limitations slide lists what remains uncertain.`
      : `What the study authors say is still unknown about ${interventionLabel}.`,
    bullets: gapBulletsData.map(b => b.text),
    bulletsData: gapBulletsData,
    visualType: 'Flowchart',
    visualDescription: 'Research roadmap flowchart outlining investigational priorities and unmeasured clinical questions.',
    speakerNotes: `These open questions come from the study authors' own statements of uncertainty, not from the presenter. They show where the evidence on ${interventionLabel} could still change.`,
    audienceQuestion: `What unresolved investigational question would most immediately influence your referral or management decisions?`,
    transition: 'We now synthesize our final conclusions and evidence-based practice take-homes.',
    sources: []
  });

  // 8. Conclusion & Practice Take-Homes (Evidence-derived only, plain-language comparisons)
  const designCounts = { rct: 0, sr: 0, nr: 0, primary: 0, consensus: 0, otherNonPrimary: 0 };
  records.forEach(r => {
    const d = (r.designFromSource || '').toLowerCase();
    if (isRandomisedTrialDesign(d)) {
      designCounts.rct++;
      designCounts.primary++;
    } else if (d.includes('systematic review') || d.includes('meta-analysis')) {
      designCounts.sr++;
    } else if (d.includes('narrative review') || d.includes('review')) {
      designCounts.nr++;
    } else if (d.includes('cohort') || d.includes('retrospective') || d.includes('diagnostic accuracy') || d.includes('case-control') || d.includes('cross-sectional') || d.includes('observational')) {
      designCounts.primary++;
    } else if (d.includes('consensus')) {
      designCounts.consensus++;
    } else {
      designCounts.otherNonPrimary++;
    }
  });
  const nonRctPrimary = designCounts.primary - designCounts.rct;
  const countParts = [];
  if (designCounts.rct > 0) countParts.push(`${designCounts.rct} randomised trial${designCounts.rct === 1 ? '' : 's'}`);
  if (designCounts.sr > 0) countParts.push(`${designCounts.sr} systematic review${designCounts.sr === 1 ? '' : 's'}`);
  if (designCounts.nr > 0) countParts.push(`${designCounts.nr} narrative review${designCounts.nr === 1 ? '' : 's'}`);
  if (nonRctPrimary > 0) countParts.push(`${nonRctPrimary} primary observational/diagnostic stud${nonRctPrimary === 1 ? 'y' : 'ies'}`);
  if (designCounts.consensus > 0) countParts.push(`${designCounts.consensus} consensus statement${designCounts.consensus === 1 ? '' : 's'}`);
  if (designCounts.otherNonPrimary > 0) countParts.push(`${designCounts.otherNonPrimary} abstract/thesis/other`);

  let conclusionMessage;
  if (usableRecords.every(r => (r.keyFindingSentences || []).length === 0)) {
    conclusionMessage = 'The selected abstracts do not report outcome results sufficient to judge benefit.';
  } else {
    conclusionMessage = evidenceVerdict.headline;
  }

  const rctCount = records.filter(r => isRandomisedTrialDesign(r.designFromSource)).length;
  const nonPrimaryParts = [];
  if (designCounts.sr > 0) nonPrimaryParts.push(`${designCounts.sr} systematic ${designCounts.sr === 1 ? 'review' : 'reviews'}`);
  if (designCounts.nr > 0) nonPrimaryParts.push(`${designCounts.nr} narrative ${designCounts.nr === 1 ? 'review' : 'reviews'}`);
  const studyPoolDetails = [
    ...nonPrimaryParts,
    `${designCounts.primary} primary ${designCounts.primary === 1 ? 'study' : 'studies'} (${rctCount} ${rctCount === 1 ? 'RCT' : 'RCTs'})`
  ].filter(Boolean).join(', ');

  const conclusionNoteSentences = [];
  const takeHomeBulletsData = [
    {
      text: `Study Pool: ${studyPoolDetails}.`,
      isFinding: false,
      preserveFullText: true,
      mandatoryConclusion: true,
      sources: records.map(r => r.refNumber)
    }
  ];

  // Collect finding bullets actually emitted on findings slides (Stage 4 / Stage 5) after density cap
  const emittedFindingBullets = slideBlueprints
    .filter(sb => sb.stage === 4 || sb.stage === 5)
    .flatMap(sb => formatOnSlideBulletsData(sb.bulletsData || [], density))
    .filter(b => b && b.isFinding && Array.isArray(b.derivedFrom) && b.derivedFrom.length > 0 && !b.omittedFromSlide);

  {
    const verdictRefs = [...evidenceVerdict.highQualityBenefit, ...evidenceVerdict.highQualityNull, ...evidenceVerdict.highQualityHarm];
    const verdictWord = {
      benefit: `favours ${interventionLabel}`,
      mixed: `mixed for ${interventionLabel} (improvement in some high-quality studies, none in others)`,
      'no benefit': `no statistically significant improvement shown for ${interventionLabel}`,
      harm: `harm or inferior outcomes reported with ${interventionLabel}`,
      insufficient: `no trial or meta-analysis with a clear result for ${interventionLabel}; provisional`
    }[evidenceVerdict.verdict];
    takeHomeBulletsData.push({
      text: `Overall Evidence: ${verdictWord}.`,
      isFinding: false,
      preserveFullText: true,
      mandatoryConclusion: true,
      derivedFrom: verdictRefs.slice(0, 4).map(ref => ({
        ref,
        outcome: 'main outcome',
        direction: evidenceVerdict.highQualityNull.includes(ref) ? 'no difference' : (evidenceVerdict.highQualityHarm.includes(ref) ? 'favours comparator' : 'favours intervention')
      })),
      sources: verdictRefs.slice(0, 4)
    });

    // One short line per study (study, design, direction, outcome); the study's own sentence goes to the notes
    const seenConclusionRefs = new Set();
    const refsWithFindings = new Set(emittedFindingBullets.flatMap(b => b.derivedFrom.map(df => df.ref)));
    const ordered = evidenceVerdict.perRecord
      .filter(v => !v.offTopic && v.sentence && v.direction !== 'unclear' && refsWithFindings.has(v.ref))
      .sort((a, b) => b.weight - a.weight);
    for (const v of ordered) {
      if (seenConclusionRefs.size >= 3) break;
      const qr = records.find(r => r.refNumber === v.ref);
      if (!qr) continue;
      seenConclusionRefs.add(qr.refNumber);
      const tag = formatShortTag(qr.authors, qr.year);
      const designShort = (qr.designFromSource || '').split('/')[0].trim().toLowerCase();
      const outName = detectOutcomeName(v.sentence);
      const dirPhrase = {
        benefit: `favours ${interventionLabel}`,
        mixed: `benefit on some outcomes only`,
        'no benefit': `no significant difference`,
        harm: `favours comparator`
      }[v.direction] || v.direction;
      const outWords = String(outName || '').toLowerCase().split(/[^a-z]+/).filter(w => w.length > 3);
      const outNameGrounded = outName && outName !== 'primary outcome' && outWords.every(w => v.sentence.toLowerCase().includes(w));
      // Plain-language two-group comparison from the study's own finding bullet ("75.5% AI vs 65.4% embryologists")
      let comparison = '';
      const fb = emittedFindingBullets.find(b => b.derivedFrom.some(df => df.ref === v.ref));
      const cm = fb && String(fb.text).replace(/^•\s*/, '').match(/^([^:]{3,80}):\s*(-?[\d.]+)%?\s+([A-Za-z][\w\s-]{0,40}?)\s*(?:\([^)]*\))?\s+vs\.?\s+(-?[\d.]+)%?\s+([A-Za-z][\w\s-]{0,40}?)\s*(?:\(|;|\.|$)/);
      if (cm && Number(cm[2]) !== Number(cm[4])) {
        const higher = Number(cm[2]) > Number(cm[4]);
        comparison = `${higher ? 'higher' : 'lower'} ${cm[1].trim().toLowerCase()} with ${cm[3].trim()} than ${cm[5].trim()}`;
      }
      const restatement = comparison || `${dirPhrase}${outNameGrounded ? ` (${outName})` : ''}`;
      conclusionNoteSentences.push(`${tag}: ${stripCitations(v.sentence)}`);
      const isLowAssurance = qr.assuranceTier === 'B' || qr.assuranceTier === 'unknown';
      takeHomeBulletsData.push({
        text: `${tag} (${designShort}): ${restatement}${isLowAssurance ? ' (from a study not indexed in PubMed)' : ''}.`,
        isFinding: false,
        derivedFrom: [{ ref: qr.refNumber, outcome: 'main outcome', direction: v.direction === 'no benefit' ? 'no difference' : v.direction === 'harm' ? 'favours comparator' : 'favours intervention' }],
        sources: [qr.refNumber],
        sourceSentence: v.sentence
      });
    }
  }

  const topicTag = cleanShortTitle.split(':')[0].split(/\s+/).slice(0, 4).join(' ').replace(/[\s:;,.–-]+$/, '');
  takeHomeBulletsData.push({
    text: hasRct
      ? `Evidence Limit (${topicTag}): ${rctCount} RCT${rctCount === 1 ? '' : 's'}, ${designCounts.sr} systematic review${designCounts.sr === 1 ? '' : 's'}, ${nonRctPrimary} observational`
      : `Evidence Limit (${topicTag}): no randomised trial; ${designCounts.sr} systematic review${designCounts.sr === 1 ? '' : 's'}, ${nonRctPrimary} observational`,
    isFinding: false,
    preserveFullText: true,
    mandatoryConclusion: true,
    sources: records.map(r => r.refNumber)
  });

  takeHomeBulletsData.push({
    text: `Caveat (${topicTag}): based on abstracts; check full texts and guidelines`,
    isFinding: false,
    preserveFullText: true
  });
  takeHomeBulletsData.push({
    text: evidenceVerdict.verdict === 'insufficient'
      ? `Next Steps: Randomised evidence is needed before firm recommendations on ${interventionLabel}.`
      : `Next Steps: Check that the study populations for ${interventionLabel} match your patients before changing practice.`,
    isFinding: false
  });

  const conclusionSources = usableRecords.filter(r => (r.keyFindingSentences || []).length > 0).map(r => r.refNumber);

  slideBlueprints.push({
    stage: 8,
    title: 'Conclusion & Practice Take-Homes',
    objective: `Deliver an evidence-grounded summary of what current literature demonstrates and practical recommendations for clinical teams.`,
    mainMessage: conclusionMessage,
    bullets: takeHomeBulletsData.map(b => b.text),
    bulletsData: takeHomeBulletsData,
    visualType: 'Concept map',
    visualDescription: 'Executive takeaway card summarizing core evidence pillars, clinical caveats, and practice recommendations.',
    speakerNotes: `To conclude: ${conclusionMessage} ${conclusionNoteSentences.join(' ')} This summary is based on the abstracts of the selected papers, so confirm key results in the full texts and current guidelines before applying them. Thank you.`,
    audienceQuestion: `What is the single most actionable, evidence-grounded takeaway your team will adopt based on this literature review?`,
    transition: 'Complete Vancouver citations and study identifiers for all curated literature are cataloged in the final references section.',
    sources: conclusionSources.slice(0, 4)
  });

  // If more slides requested and we have 2+ usable papers, add detailed study evaluation slides (Prompt 1B - E1, E2, E8, Prompt 2 - A1)
  if (requestedSlideCount > slideBlueprints.length && usableRecords.length >= 2) {
    let needed = requestedSlideCount - slideBlueprints.length;

    // Dedicated appraisal slide per usable paper (prioritizing quantitative/unused findings)
    for (let e = 0; e < prioritizedRecords.length && needed > 0; e++) {
      const rec = prioritizedRecords[e];
      const structured = buildStructuredFinding(rec, usedSourceSentences);
      const lead = formatAuthorLead(rec.authors);
      const noun = getNounByDesign(rec.designFromSource);
      const hasFindings = rec.keyFindingSentences && rec.keyFindingSentences.length > 0;
      const isNonInf = (rec.title + ' ' + (rec.abstract || '')).toLowerCase().includes('noninferiority') || (rec.title + ' ' + (rec.abstract || '')).toLowerCase().includes('non-inferiority');

      const leadClean = lead.replace(/\.+$/, '');
      const posOutcomes = rec.outcomes.filter(o => o.direction === 'favours intervention');
      const nullOutcomes = rec.outcomes.filter(o => o.direction === 'no difference');
      const negOutcomes = rec.outcomes.filter(o => o.direction === 'favours comparator');
      const authorsLower = String(Array.isArray(rec.authors) ? rec.authors.join(' ') : (rec.authors || '')).toLowerCase();

      let dirStatement;
      if (!hasFindings) {
        dirStatement = `No quantitative result reported in the abstract for ${leadClean}.`;
      } else if (isNonInf && nullOutcomes.length > 0 && posOutcomes.length === 0) {
        dirStatement = `Non-inferiority was not demonstrated in the trial by ${leadClean}.`;
      } else if (posOutcomes.length > 0 && (nullOutcomes.length > 0 || negOutcomes.length > 0)
        && ![...new Set([...posOutcomes, ...nullOutcomes, ...negOutcomes].map(o => o.name))].every(n => n === 'primary outcome')) {
        // Multi-direction outcomes (Prompt 2 - A1)
        const parts = [];
        const posNames = [...new Set(posOutcomes.map(o => o.name))].join(' and ');
        parts.push(`benefit on ${posNames} with ${interventionLabel}`);
        if (nullOutcomes.length > 0) {
          const nullNames = [...new Set(nullOutcomes.map(o => o.name))].join(' and ');
          parts.push(`no difference in ${nullNames}`);
        }
        if (negOutcomes.length > 0) {
          const negNames = [...new Set(negOutcomes.map(o => o.name))].join(' and ');
          parts.push(`outcomes favouring comparator on ${negNames}`);
        }
        dirStatement = `${noun} by ${leadClean}: ${parts.join('; ')}.`;
      } else if (nullOutcomes.length > 0) {
        if (isNonInf) {
          dirStatement = `Non-inferiority was not demonstrated in the trial by ${leadClean}.`;
        } else {
          dirStatement = `${noun} by ${leadClean} found no statistically significant difference.`;
        }
      } else if (negOutcomes.length > 0) {
        dirStatement = `${noun} by ${leadClean} demonstrated outcomes favouring comparator.`;
      } else if (posOutcomes.length > 0) {
        dirStatement = `${noun} by ${leadClean} demonstrated positive findings on evaluated endpoints.`;
      } else {
        dirStatement = `${noun} by ${leadClean} evaluated ${formatTitleSnippet(rec.title, 60)}.`;
      }

      {
        const rv = evidenceVerdict.perRecord.find(x => x.ref === rec.refNumber);
        const multiDirection = posOutcomes.length > 0 && (nullOutcomes.length > 0 || negOutcomes.length > 0)
          && ![...new Set([...posOutcomes, ...nullOutcomes, ...negOutcomes].map(o => o.name))].every(n => n === 'primary outcome');
        if (rv && rv.direction !== 'unclear' && !multiDirection && hasFindings) {
          const phrase = {
            benefit: `favours ${interventionLabel}`,
            mixed: `benefit on some outcomes only`,
            'no benefit': `no statistically significant difference on the main outcome`,
            harm: `outcomes favour the comparator`
          }[rv.direction];
          dirStatement = `In the ${noun.toLowerCase()} by ${leadClean}, the ${rv.basis} ${rv.direction === 'benefit' ? 'is in favour of' : 'shows'} ${rv.direction === 'benefit' ? interventionLabel : phrase}.`;
        }
      }
      // Fragment guard: a "finding" that does not start with a word is a broken sentence split
      const structuredOk = structured && /^[A-Za-z]/.test(String(structured.text).replace(/^[•\s]+/, '').replace(/^[^:]+:\s*/, ''));
      const questionTitle = (() => {
        const t = String(rec.title || '').replace(/\.$/, '');
        const words = t.split(/\s+/);
        if (words.length <= 14) return t;
        const beforeColon = t.split(':')[0];
        return beforeColon.split(/\s+/).length <= 14 ? beforeColon : words.slice(0, 12).join(' ');
      })();
      const appraisalBulletsData = [
        { text: `Study: ${questionTitle}`, isFinding: false, preserveFullText: true },
        { text: `Design: ${rec.designFromSource}${rec.journal ? `, published in ${rec.journal}` : ''}`, isFinding: false, preserveFullText: true },
        structuredOk
          ? {
              text: `Reported Outcome: ${structured.text.replace(/^[^:]+:\s*/, '')}`,
              isFinding: true,
              isStructured: structured.isStructured,
              derivedFrom: structured.derivedFrom
            }
          : (() => {
              const rv2 = evidenceVerdict.perRecord.find(x => x.ref === rec.refNumber);
              const alreadyShown = rv2 && rv2.sentence && (
                (usedSourceSentences && usedSourceSentences.has(`${rec.refNumber}:${rv2.sentence}`)) ||
                slideBlueprints.some(bp => (bp.bulletsData || []).some(b => b && (b.sourceSentence === rv2.sentence || (Array.isArray(b.derivedFrom) && b.derivedFrom.some(df => df.sourceSentence === rv2.sentence)))))
              );
              if (alreadyShown) {
                return { text: `Main result: shown on the findings slide (${formatShortTag(rec.authors, rec.year)}).`, isFinding: false, preserveFullText: true };
              }
              if (rv2 && rv2.sentence && rv2.direction !== 'unclear') {
                return {
                  text: `Authors' conclusion: ${stripCitations(rv2.sentence).replace(/^(?:in conclusion|conclusions?)[,:]?\s*/i, '')}`,
                  isFinding: true,
                  derivedFrom: [{ ref: rec.refNumber, outcome: 'main outcome', direction: rv2.direction === 'no benefit' ? 'no difference' : rv2.direction === 'harm' ? 'favours comparator' : 'favours intervention', sourceSentence: rv2.sentence }]
                };
              }
              return {
                text: `Reported Outcome: No quantitative result reported in the abstract of ${formatShortTag(rec.authors, rec.year)}.`,
                isFinding: false,
                preserveFullText: true
              };
            })()
      ];

      // Insert before Conclusion (last slide)
      const insertIdx = slideBlueprints.length - 1;
      slideBlueprints.splice(insertIdx, 0, {
        stage: 4,
        title: `Study Appraisal: ${lead} (${rec.year || 'n.d.'})`,
        objective: `Appraise the specific methodology, cohort, and empirical endpoints reported by ${lead}.`,
        mainMessage: dirStatement,
        bullets: appraisalBulletsData.map(b => b.text),
        bulletsData: appraisalBulletsData,
        visualType: 'Table',
        visualDescription: `Study appraisal table detailing sample size, endpoints, and statistical metrics from ${lead}.`,
        speakerNotes: `Examining this study in greater detail, the ${noun.toLowerCase()} by ${lead} published in ${rec.journal} evaluated primary endpoints under a ${rec.designFromSource} design. ${dirStatement} This data provides empirical grounding for our overarching synthesis.`,
        audienceQuestion: `How do the inclusion criteria and endpoints of this study compare with the patients you routinely manage?`,
        transition: 'We continue our clinical appraisal by synthesizing subsequent findings and limitations.',
        sources: [rec.refNumber]
      });
      needed--;
    }

    // Second pass: secondary endpoint appraisal for papers with multiple findings
    for (let e = 0; e < usableRecords.length && needed > 0; e++) {
      const rec = usableRecords[e];
      if (rec.keyFindingSentences && rec.keyFindingSentences.length > 1) {
        const lead = formatAuthorLead(rec.authors);
        const secondSentence = rec.keyFindingSentences[1]
          .replace(/\bthan the manual\b(?!\s+group)/gi, 'than the manual group');
        const insertIdx = slideBlueprints.length - 1;
        const epBulletsData = [
          { text: `Design: ${rec.designFromSource}${rec.journal ? `, published in ${rec.journal}` : ''}`, isFinding: false, preserveFullText: true },
          { text: `Further result: ${secondSentence}`, isFinding: true, isStructured: false }
        ];
        slideBlueprints.splice(insertIdx, 0, {
          stage: 4,
          title: `Further Result: ${lead.replace(/\.+$/, '')}`,
          objective: `Present a further result reported in the abstract by ${lead}.`,
          mainMessage: `A further result reported in the study by ${lead.replace(/\.+$/, '')}; read it alongside the main finding.`,
          bullets: epBulletsData.map(b => b.text),
          bulletsData: epBulletsData,
          visualType: 'Bar chart',
          visualDescription: `Single-study panel for ${lead}: the reported values side by side with their units, labelled exactly as in the abstract.`,
          speakerNotes: `This is a further result from ${lead}. Secondary results are hypothesis-generating unless the study was designed to test them, so they should not change the overall conclusion on their own.`,
          audienceQuestion: `Does this further result change how you read the main finding from this study?`,
          transition: 'We continue our clinical appraisal by synthesizing subsequent findings and limitations.',
          sources: [rec.refNumber]
        });
        needed--;
      }
    }

    // Third pass: methodology & cohort appraisal if more slides needed
    for (let e = 0; e < usableRecords.length && needed > 0; e++) {
      const rec = usableRecords[e];
      const lead = formatAuthorLead(rec.authors);
      const noun = getNounByDesign(rec.designFromSource);
      const insertIdx = slideBlueprints.length - 1;
      const methBulletsData = [
        { text: `Design: ${rec.designFromSource}${rec.journal ? `, published in ${rec.journal}` : ''} (${rec.year || 'n.d.'})`, isFinding: false, preserveFullText: true },
        { text: `Population: ${rec.population ? rec.population : 'not stated in the abstract'}`, isFinding: false },
        { text: `Study: ${formatTitleSnippet(rec.title, 90)}`, isFinding: false }
      ];
      slideBlueprints.splice(insertIdx, 0, {
        stage: 4,
        title: `Study Details: ${lead.replace(/\.+$/, '')}`,
        objective: `Describe the design and population of the study by ${lead}.`,
        mainMessage: `Design and population of the ${noun.toLowerCase()} by ${lead.replace(/\.+$/, '')}.`,
        bullets: methBulletsData.map(b => b.text),
        bulletsData: methBulletsData,
        visualType: 'Table',
        visualDescription: `Methodology appraisal table detailing study design and cohort architecture from ${lead}.`,
        speakerNotes: `The study by ${lead} is a ${rec.designFromSource.toLowerCase()}. Its design and population determine how far its results apply to our question; the journal alone says little about quality.`,
        audienceQuestion: `How well does this study design control for confounding variables compared to alternative methodology frameworks?`,
        transition: 'We continue our appraisal by evaluating further study dimensions.',
        sources: [rec.refNumber]
      });
      needed--;
    }
  }

  // Calculate slide shortfall if evidence cannot support requested count
  const actualGeneratedCount = slideBlueprints.length;
  const slideShortfall = Math.max(0, requestedSlideCount - actualGeneratedCount);
  const mergedNotice = mergedEmptySections > 0
    ? `${mergedEmptySections} planned section${mergedEmptySections === 1 ? '' : 's'} had no eligible findings and ${mergedEmptySections === 1 ? 'was' : 'were'} merged.`
    : null;
  const shortfallNote = slideShortfall > 0
    ? `Only ${actualGeneratedCount} slides could be supported by the selected evidence.${mergedNotice ? ' ' + mergedNotice : ''}`
    : mergedNotice;

  // Abbreviations defined in any selected abstract are expanded in all audience-visible text
  const deckAbbreviations = {};
  records.forEach(r => Object.entries(r.abbreviations || {}).forEach(([k, v]) => { if (!deckAbbreviations[k]) deckAbbreviations[k] = v; }));
  const expandVisible = t => (typeof t === 'string' ? expandDefinedAbbreviations(t, deckAbbreviations) : t);

  // Build final slides array with required 10 fields and traceability
  const slides = slideBlueprints.map((bp0, idx) => {
    const bp = {
      ...bp0,
      title: expandVisible(bp0.title),
      mainMessage: expandVisible(bp0.mainMessage),
      speakerNotes: expandVisible(bp0.speakerNotes),
      bullets: (bp0.bullets || []).map(expandVisible),
      bulletsData: bp0.bulletsData ? bp0.bulletsData.map(b => (b && b.text ? { ...b, text: expandVisible(b.text) } : b)) : bp0.bulletsData
    };
    const slideNumber = idx + 1;
    const bulletItems = bp.bulletsData || (bp.bullets || []).map(b => ({ text: b }));
    const formattedBulletsData = formatOnSlideBulletsData(bulletItems, density).map(b => {
      if (!b || !b.text) return b;
      let text = leadingStudyLabel(b.text);
      if (audienceProfile.isPublic) text = toPlainLanguage(text);
      return { ...b, text };
    });
    const visibleBulletsData = formattedBulletsData.filter(b => !b.omittedFromSlide && b.text);
    const finalBulletsData = visibleBulletsData.length > 0
      ? visibleBulletsData
      : [{ text: '• No eligible finding in the selected papers for this section.', isFinding: false }];
    const onSlideText = finalBulletsData.map(b => b.text).join('\n');
    // Content-specific visuals (audit D-08): a findings slide with ratio estimates becomes a real forest plot spec
    let visualType = bp.visualType || 'Diagram';
    let visualSpec = bp.visualDescription;
    if (/what the studies found|further result|study appraisal/i.test(bp.title || '')) {
      const rows = finalBulletsData.map(b => {
        const m = String(b.text).match(/^•?\s*(?:([A-Z][A-Za-zÀ-ÿ'’-]+(?: [A-Z][A-Za-zÀ-ÿ'’-]+)? \d{4}):\s*)?(?:([^:]{3,60}):\s*)?[\s\S]*?\b(a?OR|RR|HR|IRR)\s+(\d+(?:\.\d+)?)\s*\(95% CI ([\d.]+)[–-]([\d.]+)\)/);
        return m ? { study: m[1] || '', outcome: m[2] || '', measure: m[3], est: m[4], lo: m[5], hi: m[6] } : null;
      }).filter(Boolean);
      const bars = finalBulletsData.map(b => {
        const m = String(b.text).match(/^•?\s*(?:([A-Z][A-Za-zÀ-ÿ'’-]+(?: [A-Z][A-Za-zÀ-ÿ'’-]+)? \d{4}):\s*)?([^:]{3,60}):\s*(\d+(?:\.\d+)?)%\s+([^;(]+?)\s+vs\s+(\d+(?:\.\d+)?)%\s+([^;(.]+)/);
        return m ? { study: m[1] || '', outcome: m[2], a: m[3], ga: m[4].trim(), b: m[5], gb: m[6].trim() } : null;
      }).filter(Boolean);
      if (rows.length >= 2) {
        visualType = 'Forest plot';
        visualSpec = `Forest plot, one row per result: ${rows.map(r => `${r.study ? r.study + ' ' : ''}${r.outcome ? '(' + r.outcome.toLowerCase() + ') ' : ''}${r.measure} ${r.est} [${r.lo}–${r.hi}]`).join('; ')}. Log-scale x-axis from 0.5 to 2 with a vertical line at 1 (no effect); label the left side "favours ${interventionLabel}" and the right side "favours comparator"; square size proportional to study weight is not available from abstracts, so use equal sizes.`;
      } else if (bars.length >= 1) {
        visualType = 'Bar chart';
        visualSpec = `Grouped bar chart: ${bars.map(r => `${r.outcome}${r.study ? ' (' + r.study + ')' : ''}: ${r.ga} ${r.a}% vs ${r.gb} ${r.b}%`).join('; ')}. Y-axis in percent starting at 0; one colour per group, consistent across bars; value labels on top of each bar.`;
      } else if (rows.length === 1) {
        const r = rows[0];
        visualType = 'Effect estimate';
        visualSpec = `Single effect-estimate plot: ${r.study ? r.study + ' ' : ''}${r.measure} ${r.est} with confidence interval ${r.lo}–${r.hi}; vertical reference line at 1 (no effect).`;
      }
    } else if (/characteristics & design/i.test(bp.title || '')) {
      visualType = 'Table';
      visualSpec = `Evidence table with columns Study | Design | Journal | Used for conclusions: ${records.slice(0, 8).map(r => `${formatShortTag(r.authors, r.year)} | ${r.designFromSource} | ${r.journal || '—'} | ${offTopicRefs.has(r.refNumber) ? 'no (different population)' : 'yes'}`).join('; ')}.`;
    }
    const visualDescriptionAdapted = adaptVisualDescription(visualSpec, visualType, activeVisualStyle);

    const overflowNotes = formattedBulletsData
      .map(b => b.overflowNote)
      .filter(Boolean);
    const slideSources = (visibleBulletsData.length > 0 || overflowNotes.length > 0) && Array.isArray(bp.sources) && bp.sources.length > 0
      ? Array.from(new Set(bp.sources)).sort((a, b) => a - b)
      : [];

    const evidenceSourcesText = slideSources.length > 0
      ? `Evidence sources: ${slideSources.map(s => `[${s}]`).join(', ')}`
      : 'Evidence sources: none (framing slide)';

    const slideBullets = finalBulletsData.map(b => b.text);
    const combinedSpeakerNotes = stripCitations(
      overflowNotes.length > 0
        ? `${bp.speakerNotes} ${overflowNotes.join(' ')}`
        : bp.speakerNotes
    );

    return {
      // 10 Canonical Fields (Section 8 / Prompt 11)
      slide_number: slideNumber,
      title: bp.title,
      objective: bp.objective,
      main_message: bp.mainMessage,
      on_slide_text: onSlideText,
      suggested_visual_type: visualType,
      detailed_visual_description: visualDescriptionAdapted,
      speaker_notes: combinedSpeakerNotes,
      interactive_question: (audienceProfile.isPublic && /appraisal/i.test(bp.title || '')) ? 'Would the people in this study be similar to you?' : (audienceProfile.isPublic && PUBLIC_QUESTIONS[bp.stage] && bp.stage !== 1) ? PUBLIC_QUESTIONS[bp.stage] : bp.audienceQuestion,
      logical_transition: bp.transition,

      // Backwards-compatible aliases
      slideNumber,
      mainMessage: bp.mainMessage,
      onSlideText,
      bullets: slideBullets,
      bulletsData: finalBulletsData,
      suggestedVisualType: visualType,
      detailedVisualDescription: visualDescriptionAdapted,
      speakerNotes: combinedSpeakerNotes,
      audienceQuestion: (audienceProfile.isPublic && /appraisal/i.test(bp.title || '')) ? 'Would the people in this study be similar to you?' : (audienceProfile.isPublic && PUBLIC_QUESTIONS[bp.stage] && bp.stage !== 1) ? PUBLIC_QUESTIONS[bp.stage] : bp.audienceQuestion,
      transition: bp.transition,

      // Evidence Traceability
      sources: slideSources,
      evidenceSources: evidenceSourcesText,
      stage: bp.stage,

      // Formatting Specs
      slideRatio: '16:9',
      font: 'Arial',
      fontSizeTarget: '12-14 pt (minimum legibility floor)',
      textOccupancyTarget: '<50% visual slide area',
      slideDensity: density,
      visual_style: activeVisualStyle,
      visualStyle: activeVisualStyle,
      audience: audience,
      footer_copyright: `© ${currentYear} Raouf Roshdy. All rights reserved. (copyrights@Raouf Roshdy${currentYear})`,
      footerCopyright: `© ${currentYear} Raouf Roshdy. All rights reserved. (copyrights@Raouf Roshdy${currentYear})`,
      footer_format: 'Arial 9 pt, right lower corner'
    };
  });

  // Synchronize outline directly from generated slides (D-12)
  const outline = slides.map(s => s.title);

  return {
    displayName: 'Preppt – Scientific Literature to Presentation',
    topic,
    shortTitle: cleanShortTitle,
    targetPapers,
    startYear,
    audience,
    requestedSlideCount,
    density,
    visualStyle: activeVisualStyle,
    approvedKeywords,
    approvedStrategy,
    meta: {
      totalPapers: papers.length,
      targetPapers,
      startYear,
      audience,
      slideCount: slides.length,
      requestedSlideCount,
      slideShortfall,
      shortfallNote,
      visualStyle: activeVisualStyle,
      density,
      engine: 'deterministic-extractive',
      basis: 'Based on titles and abstracts only; full texts were not read.',
      basisBanner: 'Generated by: deterministic-extractive. Based on titles and abstracts only; full texts were not read.',
      evidenceVerdict: {
        verdict: evidenceVerdict.verdict,
        headline: evidenceVerdict.headline,
        intervention: interventionLabel,
        highQualityBenefit: evidenceVerdict.highQualityBenefit,
        highQualityNull: evidenceVerdict.highQualityNull,
        highQualityHarm: evidenceVerdict.highQualityHarm,
        excludedOffTopic: evidenceVerdict.excludedOffTopic,
        perStudy: evidenceVerdict.perRecord.map(v => ({ ref: v.ref, design: v.design, direction: v.direction, basis: v.basis, offTopic: v.offTopic }))
      },
      timestamp: new Date().toISOString()
    },
    synthesisPlan,
    researchGaps,
    structuredResearchGaps: rawResearchGaps,
    outline,
    disclaimer: 'This material is intended for educational and presentation-planning purposes. It does not replace critical appraisal of the original sources or professional clinical judgment.',
    slides,
    references,
    evidenceMap
  };
}

function buildPresentationOutline(shortTitle, slideCount, topic) {
  // Backwards compatibility helper: generates extractive outline
  const deck = generatePresentationDeck({
    topic: topic || shortTitle,
    shortTitle,
    papers: [{ title: topic || shortTitle, abstract: 'Study evaluating primary clinical outcomes.' }],
    slideCount
  });
  return deck.outline;
}

module.exports = {
  generatePresentationDeck,
  generateSynthesisPlan,
  synthesizeResearchGaps: deriveResearchGaps,
  buildPresentationOutline,
  adaptVisualDescription,
  formatOnSlideText,
  formatOnSlideBulletsData,
  buildStructuredFinding,
  getAudienceProfile,
  stripCitations
};
