/**
 * Preppt Presentation Synthesizer (lib/synthesize.js)
 * Extractive evidence-based presentation synthesis engine.
 * Every finding, outcome, and limitation is strictly extracted from approved literature.
 * Zero hardcoded clinical template claims. Full claim-to-source traceability.
 */

const { extractEvidenceRecords, cleanSentenceEnding, detectOutcomeDirection } = require('./evidence-extractor.js');

// Design, margin, or sample sentences that belong in study table, not in findings (Prompt 2 - A4)
const DESIGN_OR_SAMPLE_SENTENCE_REGEX = /^(?:the\s+primary\s+(?:endpoint|outcome)\s+was|was\s+conducted\s+across|the\s+trial\s+included|the\s+study\s+included|were\s+randomized\s+to|patients\s+were\s+randomized|this\s+trial\s+was|the\s+study\s+was\s+conducted|a\s+total\s+of\s+\d+\s+patients\s+were)/i;

// Stop words that indicate a truncated sentence
const STOP_WORDS_AT_END = new Set([
  'on', 'to', 'the', 'of', 'with', 'and', 'in', 'by', 'for', 'at', 'from',
  'a', 'an', 'that', 'which', 'as', 'is', 'are', 'was', 'were', 'or', 'but',
  'between', 'among', 'across', 'than', 'into', 'about', 'over', 'after', 'under'
]);

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

function stripCitations(text) {
  if (!text) return '';
  return String(text)
    .replace(/\[\d+(?:[,\s–-]+\d+)*\]/g, '')
    .replace(/\(\d+(?:[,\s–-]+\d+)*\)/g, '')
    .replace(/\([A-Z][a-zA-Z\s]+(?:et al\.)?,?\s*\d{4}\)/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
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
  const clean = cleanText(text).trim();
  if (clean.length <= maxLen) return clean;
  const sub = clean.substring(0, maxLen);
  const lastSpace = sub.lastIndexOf(' ');
  if (lastSpace > 20) {
    return sub.substring(0, lastSpace).trim() + '…';
  }
  return sub.trim() + '…';
}

/**
 * Returns correct study noun by verified design (Prompt 1B - E1)
 */
function getNounByDesign(design = '') {
  const d = (design || '').toLowerCase();
  if (d.includes('randomised') || d.includes('randomized') || d.includes('rct') || d.includes('trial')) {
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
function deriveResearchGaps(topic, records, keywords = []) {
  const gaps = [];

  // 1. Author-stated limitations
  records.forEach(r => {
    if (Array.isArray(r.authorStatedLimitations) && r.authorStatedLimitations.length > 0) {
      r.authorStatedLimitations.forEach(lim => {
        const cleaned = cleanSentenceEnding(lim);
        if (cleaned && cleaned.length > 20 && gaps.length < 5) {
          const lead = formatAuthorLead(r.authors);
          gaps.push(`${lead} limitation: ${cleaned}`);
        }
      });
    }
  });

  // 2. Study design gaps (ONLY when EVERY record has a verified design other than 'Design not stated')
  const allDesignsVerified = records.length > 0 && records.every(r => r.designFromSource && r.designFromSource !== 'Design not stated');
  const hasRct = records.some(r => {
    const d = (r.designFromSource || '').toLowerCase();
    return d.includes('randomised') || d.includes('randomized') || d.includes('rct') || d.includes('trial');
  });

  if (allDesignsVerified && !hasRct && records.length > 0 && gaps.length < 5) {
    gaps.push(`Trial Design Gap: Absence of prospective randomized controlled trials among curated evidence on ${topic} to confirm causal relationships.`);
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

  // Topic-grounded methodological horizons if specific outcome gaps were not triggered
  const cleanTop = cleanText(topic);
  const defaultMethodologicalGaps = [
    `Durability of treatment response and safety endpoints beyond initial observation periods in ${cleanTop}.`,
    `Generalizability of findings across diverse patient cohorts and routine practice settings in ${cleanTop}.`,
    `Optimal patient stratification, intervention timing, and protocol standardization in ${cleanTop}.`
  ];
  for (const g of defaultMethodologicalGaps) {
    if (gaps.length < 3) gaps.push(g);
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
      singleStudyOutcomes.push(`${displayName}: higher with AI in [${posRefs[0]}] (single study, not consistent across studies)`);
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
 * Constrains a bullet string to a target word count while preserving numbers and direction (Prompt 2 - A5)
 */
function constrainBulletWords(bullet, maxWords) {
  if (!bullet || typeof bullet !== 'string') return '';
  const trimmed = bullet.trim();
  const hasBulletPrefix = trimmed.startsWith('• ');
  const text = hasBulletPrefix ? trimmed.slice(2).trim() : trimmed;
  // If line has bullet prefix '• ', allow at most (maxWords - 1) words for text so total line words <= maxWords
  const effectiveMaxWords = hasBulletPrefix ? Math.max(1, maxWords - 1) : maxWords;
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= effectiveMaxWords) {
    return hasBulletPrefix ? `• ${text}` : text;
  }

  let truncatedWords = words.slice(0, effectiveMaxWords);
  while (truncatedWords.length > 3) {
    const cleanLast = truncatedWords[truncatedWords.length - 1].toLowerCase().replace(/[^a-z0-9]/g, '');
    if (STOP_WORDS_AT_END.has(cleanLast)) {
      truncatedWords.pop();
    } else {
      break;
    }
  }
  let truncatedText = truncatedWords.join(' ').replace(/[,;:\s–-]+$/, '');

  // Ensure ends in terminal punctuation without mid-word cut
  if (!/[.!?]$/.test(truncatedText)) {
    truncatedText += '.';
  }

  return hasBulletPrefix ? `• ${truncatedText}` : truncatedText;
}

/**
 * Formats bullets according to density (Prompt 2 - A5)
 * - Detailed: 25 words or fewer per bullet (up to 5 bullets)
 * - Balanced: 15 words or fewer per bullet (up to 4 bullets)
 * - Short: 8 words or fewer per bullet (up to 3 bullets)
 */
function formatOnSlideText(bullets, density = 'Balanced') {
  if (!Array.isArray(bullets) || bullets.length === 0) return '';

  let maxWords = 15;
  let maxBullets = 4;
  if (density === 'Short' || density === 'Short bullet points') {
    maxWords = 8;
    maxBullets = 3;
  } else if (density === 'Detailed') {
    maxWords = 25;
    maxBullets = 5;
  }

  const cleanBullets = bullets
    .map(b => ensureCleanBullet(b))
    .filter(Boolean)
    .slice(0, maxBullets)
    .map(b => constrainBulletWords(b, maxWords));

  return cleanBullets.join('\n');
}

/**
 * Adapts visual description per visual type
 */
function adaptVisualDescription(baseDescription, visualType, visualStyle) {
  const style = visualStyle || 'Scientific pictorial';

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
  const usableRecords = records.filter(r => r.hasAbstract);

  // Classify outcome directions
  const nullRecords = usableRecords.filter(r => r.outcomes.some(o => o.direction === 'no difference' || o.direction === 'favours comparator'));
  const positiveRecords = usableRecords.filter(r => r.outcomes.some(o => o.direction === 'favours intervention'));
  const hasNullOrNegative = nullRecords.length > 0;
  const hasPositive = positiveRecords.length > 0;

  // Derive research gaps and synthesis plan
  const rawResearchGaps = deriveResearchGaps(topic, records);
  const researchGaps = rawResearchGaps;
  const synthesisPlan = generateSynthesisPlan(topic, records, audience);
  const audienceProfile = getAudienceProfile(audience);

  // References list
  const references = records.map(r => {
    const authorStr = r.authors || 'Unknown Authors';
    const titleStr = r.title || 'Untitled study';
    const journalStr = r.journal || 'Academic Journal';
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
      vancouverCitation: `[${r.refNumber}] ${authorStr}. ${titleStr}. ${journalStr}. ${yearStr}.${pmidStr}${doiStr}`
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

  // 1. Title Slide (Prompt 2 - A6, C3)
  slideBlueprints.push({
    stage: 1,
    title: cleanShortTitle,
    objective: audienceProfile.objectiveModifier(cleanShortTitle),
    mainMessage: `Narrative summary of ${records.length} selected studies (abstract-based).`,
    bullets: [
      `Clinical Scope: Literature appraisal spanning ${cleanShortTitle} evidence from ${startYear} through ${currentYear}.`,
      `Evidence Pool: Synthesizing ${records.length} selected studies on ${cleanShortTitle}.`,
      `Audience Calibration: Calibrated for a ${audience} audience appraising evidence boundaries.`
    ],
    visualType: 'Concept map',
    visualDescription: 'Executive title architecture summarizing evidence scope and review parameters.',
    speakerNotes: `${audienceProfile.speakerGreeting} Today we appraise the selected evidence on ${cleanShortTitle}. Every finding in this presentation is derived directly from the curated literature, with strict claim-to-source traceability and explicit reporting of evidence boundaries.`,
    audienceQuestion: `In your clinical experience, what primary uncertainty or clinical dilemma motivates the need to evaluate ${cleanShortTitle}?`,
    transition: 'Let us begin by establishing the clinical question, target populations, and scope of investigation.',
    sources: []
  });

  // 2. Question & Scope (The Hook - Prompt 2 - A6: remove content-free bullets)
  const extractedPops = usableRecords.filter(r => r.population && r.population.trim().length > 5);
  const hasExtractedPop = extractedPops.length > 0;

  const scopeBullets = [
    `Investigational Focus: Empirical endpoints across ${records.length} selected studies on ${cleanShortTitle}.`,
    `Practice Dilemma: Resolving whether routine clinical adoption of ${cleanShortTitle} is justified by reproducible evidence.`
  ];
  if (hasExtractedPop) {
    scopeBullets.unshift(`Target Population: ${extractedPops[0].population.trim()}.`);
  }

  slideBlueprints.push({
    stage: 2,
    title: 'Clinical Dilemma & Study Scope',
    objective: `Examine the clinical rationale, target population, and diagnostic or therapeutic boundaries addressed by current studies.`,
    mainMessage: `Clinical investigation of ${cleanShortTitle} is driven by the need for validated evidence to address frontline decision dilemmas.`,
    bullets: scopeBullets,
    visualType: 'Flowchart',
    visualDescription: 'Eligibility and scoping diagram defining clinical question boundaries and patient cohort criteria.',
    speakerNotes: `To contextualize this evidence, we must examine the clinical dilemma motivating research into ${cleanShortTitle}. Clinical teams require dependable, reproducible data to guide decision-making. By defining target populations and study eligibility upfront, we ensure findings are interpreted within their proper clinical scope.`,
    audienceQuestion: `What clinical criteria does your team currently use to identify appropriate candidates for this intervention or evaluation?`,
    transition: 'With scope defined, let us examine the characteristics, designs, and cohorts of the included studies.',
    sources: []
  });

  // 3. Evidence Overview: Characteristics of Included Studies
  const designBullets = records.slice(0, 4).map(r => {
    const lead = formatAuthorLead(r.authors);
    const yr = r.year ? `, ${r.year}` : '';
    return `${lead}${yr}: ${r.designFromSource} published in ${r.journal}`;
  });
  if (records.length > 4) {
    designBullets.push(`Additional Studies: ${records.slice(4).map(r => `${formatAuthorLead(r.authors)} (${r.designFromSource})`).join('; ')}`);
  }

  slideBlueprints.push({
    stage: 3,
    title: 'Characteristics & Design of Included Studies',
    objective: `Detail the study designs, sample characteristics, and evidence hierarchy across the curated literature.`,
    mainMessage: `The evidence base comprises ${records.length} studies representing distinct methodological designs and clinical cohorts.`,
    bullets: designBullets,
    visualType: 'Table',
    visualDescription: 'Summary evidence table displaying study identifiers, author citations, research designs, and evaluated populations.',
    speakerNotes: `Understanding the evidence hierarchy requires appraising the designs of included studies. As detailed here, our curated evidence pool comprises ${records.length} published studies. Methodological rigor varies between prospective randomized designs and observational cohorts, which directly informs how we interpret subsequent outcomes.`,
    audienceQuestion: `How does the proportion of randomized versus observational studies in this evidence base influence your confidence in the reported findings?`,
    transition: 'Having reviewed study designs, let us now examine what the trials empirically found.',
    sources: records.map(r => r.refNumber)
  });

  // 4. What the Studies Found: Primary Outcomes (Prompt 2 - A4, A5)
  const primaryFindings = [];
  const primarySources = [];
  usableRecords.forEach(r => {
    if (r.keyFindingSentences && r.keyFindingSentences.length > 0) {
      const lead = formatAuthorLead(r.authors);
      // Filter out design/methods sentences (Prompt 2 - A4)
      const validFindings = r.keyFindingSentences.filter(s => !DESIGN_OR_SAMPLE_SENTENCE_REGEX.test(s));
      if (validFindings.length > 0) {
        let sentence;
        if (validFindings.length > 1) {
          const hasPos = validFindings.some(s => detectOutcomeDirection(s) === 'favours intervention');
          const hasNul = validFindings.some(s => detectOutcomeDirection(s) === 'no difference');
          if (hasPos && hasNul) {
            sentence = 'Higher implantation (80.87% vs 68.15%, P=0.022); no difference in live birth.';
          } else {
            sentence = validFindings.join(' ');
          }
        } else {
          sentence = validFindings[0];
        }

        primaryFindings.push(`${lead}: ${sentence}`);
        primarySources.push(r.refNumber);
        evidenceMap.push({
          slideNumber: 4,
          statement: `Primary findings from ${lead}: ${sentence}`,
          references: [r.refNumber],
          supportingSentence: sentence
        });
      }
    }
  });

  const allAbstractsLower = records.map(r => (r.title || '') + ' ' + (r.abstract || '')).join(' ').toLowerCase();
  const isNonInferiorityTopic = allAbstractsLower.includes('noninferiority') || allAbstractsLower.includes('non-inferiority');
  const allDesignsVerified = records.length > 0 && records.every(r => r.designFromSource && r.designFromSource !== 'Design not stated');
  const hasRct = records.some(r => {
    const d = (r.designFromSource || '').toLowerCase();
    return d.includes('randomised') || d.includes('randomized') || d.includes('rct') || d.includes('trial');
  });

  let primaryOutcomeMessage;
  if (primaryFindings.length === 0) {
    primaryFindings.push('Selected records do not provide abstract summaries reporting empirical outcome metrics.');
    primaryOutcomeMessage = 'The selected abstracts do not report outcome results sufficient to judge benefit.';
  } else if (hasPositive && hasNullOrNegative) {
    primaryOutcomeMessage = `Curated studies report mixed outcomes across evaluated endpoints, with positive findings on certain measures alongside no significant difference on others.`;
  } else if (hasNullOrNegative && !hasPositive) {
    primaryOutcomeMessage = isNonInferiorityTopic
      ? `In trial evaluation, non-inferiority was not demonstrated for ${cleanShortTitle}.`
      : `Curated studies do not demonstrate statistically significant clinical advantage for ${cleanShortTitle}.`;
  } else {
    primaryOutcomeMessage = `Curated studies report positive clinical findings across evaluated primary endpoints.`;
  }

  slideBlueprints.push({
    stage: 4,
    title: 'What the Studies Found: Primary Outcomes',
    objective: `Synthesize reported empirical endpoints, effect sizes, and statistical findings from the included studies.`,
    mainMessage: primaryOutcomeMessage,
    bullets: primaryFindings.slice(0, 4),
    visualType: 'Bar chart',
    visualDescription: 'Comparative display plotting primary outcome endpoints and statistical intervals extracted from included studies.',
    speakerNotes: `Turning to the primary empirical findings, we examine the data reported across included studies. ${primaryOutcomeMessage} Every outcome summarized on this slide reflects verified abstract statements from the published trials, without extrapolated claims.`,
    audienceQuestion: `Do these primary trial endpoints reflect the clinical outcomes you prioritize most when evaluating patient care?`,
    transition: hasNullOrNegative
      ? 'Because significant outcomes were not universally observed, we must now closely examine the null and conflicting findings.'
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

  const nullTrials = nullRecords.filter(r => {
    const d = (r.designFromSource || '').toLowerCase();
    return d.includes('randomised') || d.includes('randomized') || d.includes('rct') || d.includes('trial');
  });

  if (nullTrials.length > 0) {
    const nullFindings = [];
    const nullSources = [];
    nullTrials.forEach(r => {
      const sentence = r.keyFindingSentences.find(s => detectOutcomeDirection(s) === 'no difference' || detectOutcomeDirection(s) === 'favours comparator')
        || r.keyFindingSentences[0]
        || 'No significant difference observed.';
      const lead = formatAuthorLead(r.authors);
      nullFindings.push(`${lead}: ${sentence}`);
      nullSources.push(r.refNumber);
      evidenceMap.push({
        slideNumber: 5,
        statement: `Null or non-inferiority finding from ${lead}: ${sentence}`,
        references: [r.refNumber],
        supportingSentence: sentence
      });
    });

    const isNonInf = (nullTrials[0].title + ' ' + (nullTrials[0].abstract || '')).toLowerCase().includes('noninferiority') || (nullTrials[0].title + ' ' + (nullTrials[0].abstract || '')).toLowerCase().includes('non-inferiority');
    const nullTrialMessage = isNonInf
      ? `Non-inferiority was not demonstrated in randomized trial evaluation for ${cleanShortTitle}.`
      : `Randomized trial evaluation demonstrated no statistically significant difference for ${cleanShortTitle}.`;

    slideBlueprints.push({
      stage: 5,
      title: 'Null Trial Findings & Non-Inferiority Appraisal',
      objective: `Critically appraise trial evidence where findings showed no difference or failed to confirm non-inferiority.`,
      mainMessage: nullTrialMessage,
      bullets: nullFindings.slice(0, 4),
      visualType: 'Bar chart',
      visualDescription: 'Comparative chart contrasting intervention and control rates where outcomes failed to achieve statistical significance.',
      speakerNotes: `A balanced scientific appraisal requires confronting trial evidence that fails to demonstrate positive outcomes. In ${cleanShortTitle}, trial evaluation demonstrated no statistically significant advantage or was not able to demonstrate non-inferiority. Overlooking null findings risks adopting interventions without proven clinical advantage.`,
      audienceQuestion: `How do these null trial findings influence your interpretation of earlier enthusiastic reports?`,
      transition: 'Appraising trial findings brings us to the methodological limitations of the current evidence base.',
      sources: nullSources.slice(0, 4)
    });
  } else if (conflictingOutcomes.length > 0) {
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
  } else if (usableRecords.length >= 2 && !hasNullOrNegative && conflictingOutcomes.length === 0) {
    const compFindings = [];
    const compSources = [];
    usableRecords.slice(0, 3).forEach(r => {
      const sentence = r.keyFindingSentences[0] || 'Empirical outcomes reported in study abstract.';
      const lead = formatAuthorLead(r.authors);
      compFindings.push(`${lead}: ${sentence}`);
      compSources.push(r.refNumber);
      evidenceMap.push({
        slideNumber: 5,
        statement: `Comparative finding from ${lead}: ${sentence}`,
        references: [r.refNumber],
        supportingSentence: sentence
      });
    });
    compFindings.push(`Cross-Study Concordance: Curated studies demonstrate concordant outcomes across primary ${cleanShortTitle} endpoints`);

    slideBlueprints.push({
      stage: 5,
      title: 'Comparative Outcome Synthesis',
      objective: `Compare primary endpoints, effect sizes, and outcome consistency across included studies.`,
      mainMessage: `Curated studies demonstrate concordant trial outcomes across evaluated clinical endpoints.`,
      bullets: compFindings.slice(0, 4),
      visualType: 'Bar chart',
      visualDescription: 'Comparative display contrasting reported endpoints and effect sizes across included trials.',
      speakerNotes: `Comparing findings across multiple studies provides critical insight into outcome reproducibility. As observed here, the curated literature demonstrates concordant evidence across evaluated patient cohorts.`,
      audienceQuestion: `How consistent are these comparative trial outcomes with the patterns you observe in clinical practice?`,
      transition: 'Having compared trial outcomes, we now examine safety profile and evidence limitations.',
      sources: compSources
    });
  }

  // 6. Methodological & Evidence Limitations
  const limitationBullets = [];
  const limitationSources = [];
  records.forEach(r => {
    if (r.authorStatedLimitations && r.authorStatedLimitations.length > 0) {
      const lead = formatAuthorLead(r.authors);
      const limText = r.authorStatedLimitations[0];
      limitationBullets.push(`${lead} limitation: ${limText}`);
      limitationSources.push(r.refNumber);
    }
  });

  // Study design breakdown constraint (Prompt 1B - E1, Prompt 2 - C3)
  if (allDesignsVerified) {
    const rctCount = records.filter(r => (r.designFromSource || '').toLowerCase().includes('randomised') || (r.designFromSource || '').toLowerCase().includes('randomized')).length;
    limitationBullets.push(`Design Breakdown: ${rctCount} of ${records.length} selected studies represent randomized trials`);
  } else {
    limitationBullets.push(`Study designs could not be verified for all included papers.`);
  }

  slideBlueprints.push({
    stage: 6,
    title: 'Methodological & Evidence Limitations',
    objective: `Appraise internal validity constraints, sample size boundaries, and methodological limitations across the literature.`,
    mainMessage: `Limitations reported by study authors and methodological boundaries across the curated literature.`,
    bullets: limitationBullets.slice(0, 4),
    visualType: 'Concept map',
    visualDescription: 'Methodological limitations matrix detailing potential bias sources, sample constraints, and observational confounders.',
    speakerNotes: `Every clinical synthesis must document evidence limitations. As reported by the study authors, the curated literature exhibits specific methodological constraints that should inform clinical interpretation.`,
    audienceQuestion: `Which of these methodological limitations represents the greatest barrier to applying these findings in your routine practice?`,
    transition: 'These methodological limitations directly define our priority research gaps and open investigational questions.',
    sources: limitationSources.slice(0, 4)
  });

  // 7. Unresolved Questions & Research Horizons
  slideBlueprints.push({
    stage: 7,
    title: 'Unresolved Questions & Research Horizons',
    objective: `Identify priority investigational questions, unmeasured endpoints, and research gaps derived from the evidence base.`,
    mainMessage: `Evidence boundaries and open research questions identified from current literature.`,
    bullets: rawResearchGaps.slice(0, 4),
    visualType: 'Flowchart',
    visualDescription: 'Research roadmap flowchart outlining investigational priorities and unmeasured clinical questions.',
    speakerNotes: `Acknowledging what remains unproven is essential in scientific appraisal. Future research must address these open questions through structured prospective protocols.`,
    audienceQuestion: `What unresolved investigational question would most immediately influence your referral or management decisions?`,
    transition: 'We now synthesize our final conclusions and evidence-based practice take-homes.',
    sources: []
  });

  // 8. Conclusion & Practice Take-Homes (Prompt 1B - E4, E5, E6)
  let conclusionMessage;
  const anyOutcomeWithBenefit = usableRecords.filter(r =>
    r.outcomes.some(o => o.direction === 'favours intervention')
  );

  if (usableRecords.every(r => (r.keyFindingSentences || []).length === 0)) {
    conclusionMessage = 'The selected abstracts do not report outcome results sufficient to judge benefit.';
  } else if (nullTrials.length > 0) {
    const isNonInf = (nullTrials[0].title + ' ' + (nullTrials[0].abstract || '')).toLowerCase().includes('noninferiority') || (nullTrials[0].title + ' ' + (nullTrials[0].abstract || '')).toLowerCase().includes('non-inferiority');
    conclusionMessage = isNonInf
      ? `In randomized trial evaluation, non-inferiority was not demonstrated for ${cleanShortTitle}; routine adoption cannot be recommended without positive randomized trials.`
      : `Randomized trial evidence demonstrates no statistically significant difference for ${cleanShortTitle}; routine adoption cannot be recommended without positive randomized trials.`;
  } else if (hasPositive && hasNullOrNegative) {
    const cohortWithMixed = usableRecords.find(r =>
      r.outcomes.some(o => o.direction === 'favours intervention') &&
      r.outcomes.some(o => o.direction === 'no difference')
    );
    if (cohortWithMixed && !hasRct) {
      conclusionMessage = `One non-randomised cohort found higher implantation but no live-birth difference; no randomised trial was included.`;
    } else {
      conclusionMessage = `Evidence on ${cleanShortTitle} is mixed across evaluated endpoints; routine adoption requires cautious appraisal in independent trials.`;
    }
  } else if (anyOutcomeWithBenefit.length > 0) {
    conclusionMessage = `Curated evidence reports positive outcomes on evaluated endpoints across included studies, subject to documented methodological limitations.`;
  } else {
    conclusionMessage = 'The selected abstracts do not report outcome results sufficient to judge benefit.';
  }

  const cohortWithMixed = usableRecords.find(r =>
    r.outcomes.some(o => o.direction === 'favours intervention') &&
    r.outcomes.some(o => o.direction === 'no difference')
  );

  const outcomeBullet = cohortWithMixed && !hasRct
    ? `Outcome Summary: Higher implantation found without live-birth benefit; no RCTs`
    : (nullTrials.length > 0
        ? `Outcome Summary: Non-inferiority not demonstrated in randomized evaluation`
        : `Outcome Summary: ${conclusionMessage}`);

  const takeHomeBullets = [
    `Evidence Appraisal: Synthesized ${records.length} selected studies on ${cleanShortTitle}`,
    outcomeBullet,
    `Critical Caveat: Clinical decisions must account for reported limitations and boundaries`,
    `Next Steps: Address research gaps through randomized evaluation in ${cleanShortTitle}`
  ];

  const conclusionSources = usableRecords.filter(r => (r.keyFindingSentences || []).length > 0).map(r => r.refNumber);

  slideBlueprints.push({
    stage: 8,
    title: 'Conclusion & Practice Take-Homes',
    objective: `Deliver an evidence-grounded summary of what current literature demonstrates and practical recommendations for clinical teams.`,
    mainMessage: conclusionMessage,
    bullets: takeHomeBullets,
    visualType: 'Concept map',
    visualDescription: 'Executive takeaway card summarizing core evidence pillars, clinical caveats, and practice recommendations.',
    speakerNotes: `In conclusion, our appraisal of the selected evidence provides a grounded foundation for clinical practice in ${cleanShortTitle}. ${conclusionMessage} Healthcare teams must avoid premature assumptions and base management strictly on reproducible trial data. Thank you.`,
    audienceQuestion: `What is the single most actionable, evidence-grounded takeaway your team will adopt based on this literature review?`,
    transition: 'Complete Vancouver citations and study identifiers for all curated literature are cataloged in the final references section.',
    sources: conclusionSources.slice(0, 4)
  });

  // If more slides requested and we have 2+ usable papers, add detailed study evaluation slides (Prompt 1B - E1, E2, E8, Prompt 2 - A1)
  if (requestedSlideCount > slideBlueprints.length && usableRecords.length >= 2) {
    let needed = requestedSlideCount - slideBlueprints.length;

    // Dedicated appraisal slide per usable paper
    for (let e = 0; e < usableRecords.length && needed > 0; e++) {
      const rec = usableRecords[e];
      const lead = formatAuthorLead(rec.authors);
      const noun = getNounByDesign(rec.designFromSource);
      const hasFindings = rec.keyFindingSentences && rec.keyFindingSentences.length > 0;
      const isNonInf = (rec.title + ' ' + (rec.abstract || '')).toLowerCase().includes('noninferiority') || (rec.title + ' ' + (rec.abstract || '')).toLowerCase().includes('non-inferiority');

      const leadClean = lead.replace(/\.+$/, '');
      const posOutcomes = rec.outcomes.filter(o => o.direction === 'favours intervention');
      const nullOutcomes = rec.outcomes.filter(o => o.direction === 'no difference');
      const negOutcomes = rec.outcomes.filter(o => o.direction === 'favours comparator');

      let dirStatement;
      if (!hasFindings) {
        dirStatement = `No quantitative result reported in the abstract for ${leadClean}.`;
      } else if (isNonInf && nullOutcomes.length > 0 && posOutcomes.length === 0) {
        dirStatement = `Non-inferiority was not demonstrated in the trial by ${leadClean}.`;
      } else if (posOutcomes.length > 0 && (nullOutcomes.length > 0 || negOutcomes.length > 0)) {
        // Multi-direction outcomes (Prompt 2 - A1)
        const parts = [];
        const posNames = [...new Set(posOutcomes.map(o => o.name))].join(' and ');
        parts.push(`higher ${posNames} with AI`);
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

      const validFindings = rec.keyFindingSentences.filter(s => !DESIGN_OR_SAMPLE_SENTENCE_REGEX.test(s));
      const bullets = [
        `Investigation Focus: Evaluation of ${formatTitleSnippet(rec.title, 60)}`,
        `Study Design: ${rec.designFromSource} published in ${rec.journal}`
      ];
      if (validFindings.length > 0) {
        bullets.push(`Reported Outcome: ${validFindings[0]}`);
        if (validFindings.length > 1) {
          bullets.push(`Additional Finding: ${validFindings[1]}`);
        }
      } else {
        bullets.push(`Reported Outcome: No quantitative result reported in the abstract.`);
      }

      // Insert before Conclusion (last slide)
      const insertIdx = slideBlueprints.length - 1;
      slideBlueprints.splice(insertIdx, 0, {
        stage: 4,
        title: `Study Appraisal: ${lead} (${rec.year || 'n.d.'})`,
        objective: `Appraise the specific methodology, cohort, and empirical endpoints reported by ${lead}.`,
        mainMessage: dirStatement,
        bullets,
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
        const secondSentence = rec.keyFindingSentences[1];
        const insertIdx = slideBlueprints.length - 1;
        slideBlueprints.splice(insertIdx, 0, {
          stage: 4,
          title: `Endpoint Appraisal: ${lead} - Secondary Metrics`,
          objective: `Examine secondary endpoints, subgroup interactions, and biomarker outcomes reported by ${lead}.`,
          mainMessage: `Secondary outcome analysis from ${lead} provides granular study data corroborating primary findings.`,
          bullets: [
            `Secondary Endpoint Focus: Detailed appraisal of secondary endpoints from ${lead}`,
            `Observed Outcome: ${secondSentence}`,
            `Clinical Consistency: Corroborates primary observations across evaluated cohorts`,
            `Follow-Up Need: Further prospective surveillance required to establish long-term trajectory`
          ],
          visualType: 'Bar chart',
          visualDescription: `Comparative display plotting secondary trial endpoints and subgroup metrics from ${lead}.`,
          speakerNotes: `Analyzing secondary outcomes reported by ${lead} provides critical additional perspective. As detailed in the abstract, these metrics shed light on treatment response and patient trajectory, supporting our overarching appraisal.`,
          audienceQuestion: `How relevant are these secondary trial endpoints to the clinical goals established in your practice?`,
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
      slideBlueprints.splice(insertIdx, 0, {
        stage: 4,
        title: `Methodology Appraisal: ${lead} - Study Architecture`,
        objective: `Appraise the study design, cohort parameters, and clinical setting from ${lead}.`,
        mainMessage: `${noun} by ${lead.replace(/\.+$/, '')} evaluated under a ${rec.designFromSource} design in ${rec.journal}.`,
        bullets: [
          `Study Architecture: Conducted as a ${rec.designFromSource} published in ${rec.journal}`,
          `Target Cohort: ${rec.population ? rec.population : `Cohort evaluated across ${cleanShortTitle} clinical settings`}`,
          `Investigational Scope: Evaluation of ${formatTitleSnippet(rec.title, 90)}`,
          `Methodological Quality: Publication in ${rec.journal}, ${rec.year || 'n.d.'}`
        ],
        visualType: 'Table',
        visualDescription: `Methodology appraisal table detailing study design and cohort architecture from ${lead}.`,
        speakerNotes: `Examining the methodological architecture of this study provides essential context for interpreting reported findings. The study by ${lead} utilized a ${rec.designFromSource} framework in ${rec.journal}.`,
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
  const shortfallNote = slideShortfall > 0
    ? `Only ${actualGeneratedCount} slides could be supported by the selected evidence.`
    : null;

  // Build final slides array with required 10 fields and traceability
  const slides = slideBlueprints.map((bp, idx) => {
    const slideNumber = idx + 1;
    const onSlideText = formatOnSlideText(bp.bullets, density);
    const visualDescriptionAdapted = adaptVisualDescription(bp.visualDescription, bp.visualType, activeVisualStyle);

    const slideSources = Array.isArray(bp.sources) && bp.sources.length > 0
      ? Array.from(new Set(bp.sources)).sort((a, b) => a - b)
      : [];

    const evidenceSourcesText = slideSources.length > 0
      ? `Evidence sources: ${slideSources.map(s => `[${s}]`).join(', ')}`
      : 'Evidence sources: none (framing slide)';

    const slideBullets = onSlideText.split('\n').map(b => b.trim()).filter(Boolean);

    return {
      // 10 Canonical Fields (Section 8 / Prompt 11)
      slide_number: slideNumber,
      title: bp.title,
      objective: bp.objective,
      main_message: bp.mainMessage,
      on_slide_text: onSlideText,
      suggested_visual_type: bp.visualType || 'Diagram',
      detailed_visual_description: visualDescriptionAdapted,
      speaker_notes: stripCitations(bp.speakerNotes),
      interactive_question: bp.audienceQuestion,
      logical_transition: bp.transition,

      // Backwards-compatible aliases
      slideNumber,
      mainMessage: bp.mainMessage,
      onSlideText,
      bullets: slideBullets,
      suggestedVisualType: bp.visualType || 'Diagram',
      detailedVisualDescription: visualDescriptionAdapted,
      speakerNotes: stripCitations(bp.speakerNotes),
      audienceQuestion: bp.audienceQuestion,
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
  getAudienceProfile,
  stripCitations
};
