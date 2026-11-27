/**
 * Shared Text Rules for Citation Stripping & Number Preservation (lib/text-rules.js)
 *
 * Single source of truth used by both lib/synthesize.js (generator) and
 * lib/validator.js (validator) so citation patterns cannot diverge.
 */

const NUMERIC_BRACKET_REGEX = /\[\d+(?:[,\s–-]+\d+)*\]/;
const NUMERIC_PAREN_REGEX = /\(\d+(?:[,\s–-]+\d+)*\)/;
const AUTHOR_YEAR_PAREN_REGEX = /\([A-Z][a-zA-Z\s]+(?:et al\.)?,?\s*\d{4}\)/;
const AUTHOR_YEAR_PROSE_REGEX = /\b[A-Z][a-zA-Z\s]+(?:et al\.)?\s*\(\d{4}\)/;
const AUTHOR_YEAR_COMMA_REGEX = /\b[A-Z][a-zA-Z\s]+et al\.,\s*\d{4}\b/;

const NON_LATIN_SCRIPT_REGEX = /[\u0400-\u04FF\u0600-\u06FF\u4E00-\u9FFF\u3040-\u30FF\u0590-\u05FF\u0900-\u097F]/;

const ENGLISH_FUNCTION_WORDS = new Set([
  'the', 'and', 'of', 'in', 'to', 'for', 'with', 'is', 'are', 'was', 'were',
  'by', 'from', 'on', 'at', 'as', 'or', 'an', 'that', 'this', 'no', 'not',
  'be', 'been', 'being', 'has', 'have', 'had', 'between', 'among', 'across',
  'versus', 'vs', 'into', 'during', 'than', 'can', 'may', 'will', 'which',
  'who', 'when', 'where', 'while', 'both', 'each', 'more', 'most', 'other',
  'such', 'only', 'also', 'without', 'within', 'after', 'before', 'under',
  'over', 'about', 'through', 'their', 'our', 'its', 'they', 'we', 'there',
  'these', 'those', 'all', 'any', 'but', 'if', 'did', 'do', 'does', 'could',
  'should', 'would', 'shall', 'per', 'via'
]);

const FOREIGN_FUNCTION_WORDS = new Set([
  // Spanish
  'el', 'los', 'las', 'con', 'para', 'una', 'uno', 'del', 'por', 'se', 'ha',
  'han', 'que', 'esta', 'este', 'estos', 'estas', 'sin', 'sobre', 'entre',
  'pero', 'como', 'más', 'mas', 'sus', 'su', 'son', 'fue', 'fueron', 'muy',
  'desde', 'hasta', 'donde', 'cuando', 'mediante', 'sistema', 'imágenes',
  'comprobar', 'funcionamiento', 'evaluado', 'entrenado', 'previa', 'nunca',
  'y', 'de', 'la', 'salud', 'bienestar',
  // French
  'le', 'les', 'des', 'une', 'dans', 'pour', 'avec', 'sur', 'est', 'sont',
  'aux', 'qui', 'que', 'par', 'pas', 'plus', 'cette', 'ces', 'ont', 'été',
  'nous', 'vous', 'leur', 'leurs', 'dont', 'où', 'chez', 'entre', 'sans', 'et',
  // Portuguese
  'não', 'com', 'em', 'os', 'uma', 'para', 'dos', 'das', 'nos', 'nas', 'pelo',
  'pela', 'foi', 'foram', 'são', 'como', 'mais', 'sobre', 'entre', 'sem', 'e', 'do', 'da',
  // German
  'der', 'die', 'das', 'und', 'mit', 'für', 'von', 'ist', 'sind', 'ein',
  'eine', 'einer', 'einem', 'einen', 'den', 'dem', 'des', 'zu', 'auf', 'im',
  'bei', 'nach', 'über', 'unter', 'durch', 'nicht', 'auch', 'als', 'werden',
  // Italian
  'il', 'gli', 'che', 'per', 'sono', 'con', 'una', 'dei', 'delle', 'degli',
  'nel', 'nella', 'nelle', 'nei', 'alla', 'alle', 'dalla', 'dal', 'tra', 'fra'
]);

/**
 * Checks whether a text string is English.
 * Flags CJK / non-Latin scripts, dominating Romance/Germanic function words (including short texts),
 * or prose >= 4 words with zero common English function words.
 */
function isEnglishText(text) {
  if (!text || typeof text !== 'string') return { ok: true, reason: '' };
  const str = text.trim();
  if (!str) return { ok: true, reason: '' };

  const scriptMatch = str.match(NON_LATIN_SCRIPT_REGEX);
  if (scriptMatch) {
    return { ok: false, reason: `Non-Latin characters detected ("${scriptMatch[0]}")` };
  }

  // Strip bullet marker, optional "Label:", and trailing "(Author YYYY)" tag
  const body = str
    .replace(/^[•\s-]+/, '')
    .replace(/\s*\([A-Z][a-zA-ZÀ-ÿ'-]+\s+\d{4}\)\.?\s*$/, '')
    .replace(/^[A-ZÀ-ÿ][^:]{1,60}:\s*/, '');
  // Match 1+ letter words so 'y', 'e', 'de', 'la' are counted
  const words = body.toLowerCase().match(/[a-zà-öø-ÿ]+/g) || [];
  if (words.length < 4) {
    return { ok: true, reason: '' };
  }

  let enCount = 0;
  let foreignCount = 0;
  for (const w of words) {
    if (ENGLISH_FUNCTION_WORDS.has(w)) enCount++;
    if (FOREIGN_FUNCTION_WORDS.has(w)) foreignCount++;
  }

  if (foreignCount >= 2 && foreignCount >= enCount) {
    return { ok: false, reason: `Non-English function words detected (${foreignCount} foreign vs ${enCount} English)` };
  }

  if (words.length >= 8 && enCount / words.length < 0.08 && foreignCount >= 1) {
    return { ok: false, reason: `Low English stop-word share (${enCount}/${words.length}) with foreign tokens` };
  }

  // Flag >= 6 words prose with zero English function words (skip short statistical/title strings or author names)
  const hasStatsOrTitle = /\d|AUC|CI|OR|RR|HR|RD|Slide|Title|Preppt|et al/i.test(str);
  if (words.length >= 6 && enCount === 0 && !hasStatsOrTitle) {
    return { ok: false, reason: `Zero common English function words in ${words.length}-word text` };
  }

  return { ok: true, reason: '' };
}

/**
 * Strips all in-text numeric and author-year citations from text,
 * using the exact patterns enforced by lib/validator.js.
 */
function stripCitations(text) {
  if (!text) return '';
  let result = String(text);

  const patterns = [
    NUMERIC_BRACKET_REGEX,
    NUMERIC_PAREN_REGEX,
    AUTHOR_YEAR_PAREN_REGEX,
    AUTHOR_YEAR_PROSE_REGEX,
    AUTHOR_YEAR_COMMA_REGEX
  ];

  for (const pat of patterns) {
    const globalPat = new RegExp(pat.source, 'g');
    result = result.replace(globalPat, '');
  }

  return result
    .replace(/\s+([.,;:!?])/g, '$1')
    .replace(/\(\s*\)/g, '')
    .replace(/\[\s*\]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Extracts all numeric tokens from a sentence/clause (percentages, decimals, counts).
 */
function extractNumericTokens(text) {
  if (!text || typeof text !== 'string') return [];
  return text.match(/\b\d+(?:\.\d+)?%?/g) || [];
}

/**
 * Extracts a clean clinical metric label from a results sentence.
 * Never returns a generic "Outcome" fallback; returns "" if unidentifiable.
 */
function extractMetricLabel(text) {
  const firstClause = (text || '').split(';')[0].toLowerCase();
  const lower = (text || '').toLowerCase();
  if (/predicting\s+clinical\s+pregnancy.*accuracy|accuracy.*predicting\s+clinical\s+pregnancy/i.test(lower)) {
    return 'Clinical pregnancy prediction accuracy';
  }
  if (/predicting\s+embryo\s+morphology\s+grade.*accuracy|accuracy.*predicting\s+embryo\s+morphology\s+grade/i.test(lower)) {
    return 'Morphology grade prediction accuracy';
  }
  if (/clinical\s+pregnancy/i.test(firstClause)) return 'Clinical pregnancy';
  if (/ongoing\s+pregnancy/i.test(firstClause)) return 'Ongoing pregnancy';
  if (/implantation/i.test(firstClause)) return 'Implantation';
  if (/live\s+birth/i.test(firstClause)) return 'Live birth';
  if (/clinical\s+pregnancy/i.test(lower)) return 'Clinical pregnancy';
  if (/ongoing\s+pregnancy/i.test(lower)) return 'Ongoing pregnancy';
  if (/implantation/i.test(lower)) return 'Implantation';
  if (/live\s+birth/i.test(lower)) return 'Live birth';
  if (/\b(?:auroc|auc)\b/i.test(lower)) return 'Prediction accuracy (AUC)';
  if (/\bmedian\s+accuracy|\baccuracy\b/i.test(lower)) return 'Prediction accuracy';
  if (/\bsensitivity\b/i.test(lower)) return 'Sensitivity';
  if (/\bspecificity\b/i.test(lower)) return 'Specificity';
  if (/\bnon-?inferiority\b/i.test(lower)) return 'Non-inferiority';
  return '';
}

/**
 * Extracts group A and group B names from a sentence when explicit.
 * Never falls back to "control" unless "control" is in the sentence.
 */
function extractGroupNamesFromSentence(text) {
  let gA = '';
  let gB = '';
  if (/\bAI-assisted\b/i.test(text)) gA = 'AI-assisted';
  else if (/\biDAScore\b/i.test(text)) gA = 'iDAScore';
  else if (/\bAI\s+models?\b|\bAI\b/.test(text)) gA = 'AI';
  else if (/\bmachine\s+learning\b/i.test(text)) gA = 'ML';

  if (/\bembryologists?\b/i.test(text)) gB = 'embryologists';
  else if (/\bconventional\b/i.test(text)) gB = 'conventional';
  else if (/\bmanual\b/i.test(text)) gB = 'manual';
  else if (/\bmorphology\s+(?:group|arm)\b|\bstandard\s+morphology\b/i.test(text)) gB = 'morphology';
  else if (/\bcontrol\b/i.test(text)) gB = 'control';

  return { gA, gB };
}

/**
 * Parses an empirical results sentence into structured clinical components:
 * { outcome, comparisons: [{group, value, range?}], effect: {measure, estimate, ciLow, ciHigh}, p, counts, nullDirection }
 * Never uses "Outcome" or "control" as synthetic fallback labels.
 */
function parseStructuredResultSentence(sentence) {
  const clean = stripCitations(sentence || '').trim();
  if (!clean) return null;

  const counts = [];
  const fracMatches = clean.match(/\b\d+\s*\/\s*\d+\b/g) || [];
  fracMatches.forEach(f => counts.push(f.replace(/\s+/g, '')));

  const noCounts = clean
    .replace(/,\s*\d+\s*\/\s*\d+/g, '')
    .replace(/\(\s*\d+\s*\/\s*\d+\s*\)/g, '');

  const comparisons = [];
  const groupVsGroup = noCounts.match(
    /(?:in\s+(?:the\s+)?)?([a-zA-Z0-9_-]+(?:\s+[a-zA-Z0-9_-]+)?)\s+group\s*\(([^)]*?(\d+(?:\.\d+)?%?))\s*\)\s*(?:compared\s+(?:to|with)|versus|vs\.?)\s*(?:the\s+)?([a-zA-Z0-9_-]+(?:\s+[a-zA-Z0-9_-]+)?)\s+group\s*\(([^)]*?(\d+(?:\.\d+)?%?))\s*\)/i
  );
  if (groupVsGroup) {
    comparisons.push({ group: groupVsGroup[1].trim(), value: groupVsGroup[3].trim() });
    comparisons.push({ group: groupVsGroup[4].trim(), value: groupVsGroup[6].trim() });
  } else {
    const twoGroupsOneParen = noCounts.match(
      /in\s+(?:the\s+)?([a-zA-Z0-9_-]+(?:\s+[a-zA-Z0-9_-]+)?)\s+group\s+(?:than|compared\s+(?:to|with)|versus|vs\.?)\s+(?:the\s+)?([a-zA-Z0-9_-]+(?:\s+[a-zA-Z0-9_-]+)?)\s+group\s*\(\s*(\d+(?:\.\d+)?%?)\s*(?:versus|vs\.?)\s*(\d+(?:\.\d+)?%?)/i
    );
    if (twoGroupsOneParen) {
      comparisons.push({ group: twoGroupsOneParen[1].trim(), value: twoGroupsOneParen[3].trim() });
      comparisons.push({ group: twoGroupsOneParen[2].trim(), value: twoGroupsOneParen[4].trim() });
    } else {
      const valGroupVs = noCounts.match(
        /(\d+(?:\.\d+)?%?)\s*\(([^()]{2,25})\)\s*(?:versus|vs\.?|compared\s+(?:to|with))\s*(\d+(?:\.\d+)?%?)\s*\(([^()]{2,25})\)/i
      );
      if (valGroupVs && !/^range\b/i.test(valGroupVs[2].trim())) {
        comparisons.push({ group: valGroupVs[2].trim(), value: valGroupVs[1].trim() });
        comparisons.push({ group: valGroupVs[4].trim(), value: valGroupVs[3].trim() });
      } else {
        // Handle "<valA> (range ...)? ... compared to/with <valB> (range ...)? ... by <groupB>"
        const twoValsPct = noCounts.match(
          /(\d+(?:\.\d+)?%)(?:\s*\((range\s+[^)]+)\))?.*?(?:compared\s+(?:to|with)|versus|vs\.?|while\s+[^.]*?had\s+[^.]*?at)\s*(\d+(?:\.\d+)?%)(?:\s*\((range\s+[^)]+)\))?/i
        );
        if (twoValsPct) {
          const { gA, gB } = extractGroupNamesFromSentence(noCounts);
          if (gA && gB) {
            comparisons.push({ group: gA, value: twoValsPct[1].trim(), range: twoValsPct[2] ? twoValsPct[2].replace(/-/g, '–') : '' });
            comparisons.push({ group: gB, value: twoValsPct[3].trim(), range: twoValsPct[4] ? twoValsPct[4].replace(/-/g, '–') : '' });
          }
        }
      }
    }
  }

  let effect = null;
  const measurePatterns = [
    { regex: /\badjusted\s+odds\s+ratio\s+(?:of|=|:)?\s*(-?\d+(?:\.\d+)?)/i, measure: 'aOR' },
    { regex: /\baOR\s*[=:]?\s*(-?\d+(?:\.\d+)?)/, measure: 'aOR' },
    { regex: /\b(?:odds\s+ratio|OR)\s*(?:of|=|:)?\s*(-?\d+(?:\.\d+)?)/i, measure: 'OR' },
    { regex: /\b(?:relative\s+risk|risk\s+ratio|RR)\s*(?:of|=|:)?\s*(-?\d+(?:\.\d+)?)/i, measure: 'RR' },
    { regex: /\b(?:hazard\s+ratio|HR)\s*(?:of|=|:)?\s*(-?\d+(?:\.\d+)?)/i, measure: 'HR' },
    { regex: /\b(?:risk\s+difference|RD)\s*(?:of|=|:)?\s*([−-]?\d+(?:\.\d+)?%?)/i, measure: 'RD' },
    { regex: /\b(?:mean\s+difference|MD)\s*(?:of|=|:)?\s*([−-]?\d+(?:\.\d+)?%?)/i, measure: 'MD' },
    { regex: /\b(?:AUROC|AUC)\s*(?:of|=|:)?\s*(\d+(?:\.\d+)?)/i, measure: 'AUC' }
  ];

  for (const mp of measurePatterns) {
    const m = noCounts.match(mp.regex);
    if (m) {
      effect = { measure: mp.measure, estimate: m[1], ciLow: null, ciHigh: null };
      break;
    }
  }

  const ciMatch = noCounts.match(/(?:95%\s*(?:confidence\s+interval|CI)\s*[,:=]?\s*)([−-]?\d+(?:\.\d+)?%?)\s*(?:to|[-–])\s*([−-]?\d+(?:\.\d+)?%?)/i);
  if (ciMatch) {
    if (!effect) {
      effect = { measure: 'Effect', estimate: '', ciLow: ciMatch[1], ciHigh: ciMatch[2] };
    } else {
      effect.ciLow = ciMatch[1];
      effect.ciHigh = ciMatch[2];
    }
  }

  let p = null;
  const pMatch = noCounts.match(/\bp\s*([=<>≤≥])\s*(0?\.\d+|\d+(?:\.\d+)?)/i);
  if (pMatch) {
    p = `${pMatch[1]}${pMatch[2]}`;
  }

  const outcome = extractMetricLabel(noCounts);
  if (!outcome) {
    return null;
  }

  let nullDirection = '';
  if (/not\s+(?:able\s+to\s+)?demonstrate\s+non-?inferiority|non-?inferiority\s+(?:was\s+not|not)\s+demonstrated/i.test(clean)) {
    nullDirection = 'non-inferiority not demonstrated';
  } else if (/no\s+(?:statistically\s+)?significant\s+difference.*live\s*birth/i.test(clean)) {
    nullDirection = 'no difference in live birth';
  } else if (/no\s+(?:statistically\s+)?significant\s+difference/i.test(clean)) {
    nullDirection = 'no statistically significant difference';
  }

  return { outcome, comparisons, effect, p, counts, nullDirection };
}

/**
 * Pairs adjacent/nearby sentences within the same paper that report the same metric
 * for two different groups (e.g., AI 75.5% in sentence i, embryologists 65.4% in sentence i+2).
 * Returns { text, sources: [s1, s2] } or null.
 */
function tryPairAdjacentSentences(s1, s2) {
  if (!s1 || !s2) return null;
  const m1 = s1.match(/(\d+(?:\.\d+)?%)(?:\s*\((range\s+[^)]+)\))?/i);
  const m2 = s2.match(/(\d+(?:\.\d+)?%)(?:\s*\((range\s+[^)]+)\))?/i);
  if (!m1 || !m2) return null;

  const metric1 = extractMetricLabel(s1);
  const metric2 = extractMetricLabel(s2);
  const sameMetric = (metric1 && metric1 === metric2) ||
    (/\baccuracy\b/i.test(s1) && /\baccuracy\b/i.test(s2));
  if (!sameMetric) return null;

  const g1 = extractGroupNamesFromSentence(s1);
  const g2 = extractGroupNamesFromSentence(s2);
  const groupA = g1.gA || '';
  const groupB = g2.gB || '';
  if (!groupA || !groupB || groupA === groupB) return null;

  const label = metric1 || metric2;
  const r1 = m1[2] ? ` (${m1[2].replace(/-/g, '–')})` : '';
  const r2 = m2[2] ? ` (${m2[2].replace(/-/g, '–')})` : '';
  return {
    text: `${label}: ${m1[1]} ${groupA}${r1} vs ${m2[1]} ${groupB}${r2}`,
    sources: [s1, s2]
  };
}

/**
 * Compresses a finding sentence to fit within maxWords while keeping every number labelled.
 * Uses parseStructuredResultSentence() for structured clinical results; falls back to the
 * citation-stripped sentence if it cannot be parsed reliably (never bare comma-separated numbers).
 */
function compressFindingPreservingNumbers(lead, sentence, maxWords) {
  const cleanSent = stripCitations(sentence || '').trim();
  if (!cleanSent) return { text: lead ? `${lead}:` : '', overflow: '', counts: [] };

  const sentNums = extractNumericTokens(cleanSent);
  if (sentNums.length === 0) {
    const fullBullet = lead ? `${lead}: ${cleanSent}` : cleanSent;
    if (fullBullet.split(/\s+/).filter(Boolean).length <= maxWords) {
      return { text: fullBullet, overflow: '', counts: [], omittedFromSlide: false };
    }
    // Try clause boundary (semicolon or comma) without cutting mid-phrase
    const clauses = cleanSent.split(/(?<=[,;])\s+/).map(c => c.replace(/[,;:\s–-]+$/, '').trim()).filter(Boolean);
    if (clauses.length > 1 && clauses[0].split(/\s+/).filter(Boolean).length >= 4) {
      const firstClause = lead ? `${lead}: ${clauses[0]}` : clauses[0];
      if (firstClause.split(/\s+/).filter(Boolean).length <= maxWords) {
        return { text: firstClause + '.', overflow: cleanSent, counts: [], omittedFromSlide: false };
      }
    }
    // Condense verbose prepositional filler phrases while preserving grammatical ending
    const condensed = cleanSent
      .replace(/\b(?:in all the studies focused on|focused on)\b/gi, 'in')
      .replace(/\bclinical outcome prediction\b/gi, 'outcome prediction')
      .replace(/\s+during\s+[a-z\s]{4,35}\.?$/i, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
    const condensedBullet = lead ? `${lead}: ${condensed}` : condensed;
    if (condensedBullet.split(/\s+/).filter(Boolean).length <= maxWords) {
      return { text: condensedBullet.replace(/[.!?]+$/, '') + '.', overflow: cleanSent, counts: [], omittedFromSlide: false };
    }
    // Cannot fit without cutting mid-phrase: move full sentence to speaker notes and omit from slide
    return { text: '', overflow: cleanSent, counts: [], omittedFromSlide: true };
  }

  // Structured clinical result rendering
  const parsed = parseStructuredResultSentence(cleanSent);
  if (parsed && (parsed.comparisons.length >= 2 || (parsed.effect && parsed.effect.estimate))) {
    const parts = [];
    if (parsed.comparisons.length >= 2) {
      const c0 = parsed.comparisons[0];
      const c1 = parsed.comparisons[1];
      const r0 = c0.range ? ` (${c0.range})` : '';
      const r1 = c1.range ? ` (${c1.range})` : '';
      parts.push(`${c0.value} ${c0.group}${r0} vs ${c1.value} ${c1.group}${r1}`);
    }
    if (parsed.effect && (parsed.effect.estimate || parsed.effect.ciLow)) {
      let effStr = parsed.effect.estimate ? `${parsed.effect.measure} ${parsed.effect.estimate}` : '';
      if (parsed.effect.ciLow && parsed.effect.ciHigh) {
        const ciText = `(95% CI ${parsed.effect.ciLow}–${parsed.effect.ciHigh})`;
        effStr = effStr ? `${effStr} ${ciText}` : ciText;
      }
      if (parsed.p) effStr += `, p${parsed.p}`;
      parts.push(effStr);
    } else if (parsed.p) {
      parts.push(`p${parsed.p}`);
    }

    if (parsed.nullDirection && !parts.join(' ').toLowerCase().includes(parsed.nullDirection.toLowerCase())) {
      parts.push(parsed.nullDirection);
    }

    if (parts.length > 0) {
      const rendered = `${parsed.outcome}: ${parts.join('; ')}`;
      return {
        text: rendered,
        overflow: parsed.counts.length > 0 ? `Raw counts: ${parsed.counts.join(', ')}. Full sentence: ${cleanSent}` : cleanSent,
        counts: parsed.counts
      };
    }
  }

  // Fallback: if sentence cannot be parsed reliably, keep the original citation-stripped sentence
  // (never emit a chopped comma-separated bare-number fragment)
  return {
    text: lead ? `${lead}: ${cleanSent}` : cleanSent,
    overflow: '',
    counts: parsed ? parsed.counts : []
  };
}


/**
 * Abbreviations defined in an abstract ("AI-assisted group (AAG)") → { AAG: 'AI-assisted group' }.
 * Only definitions whose word initials spell the abbreviation are accepted; nothing is guessed.
 */
function buildAbbreviationMap(abstract) {
  const map = {};
  const text = String(abstract || '');
  const re = /((?:[A-Za-z][\w'-]*\s+){1,8})\(([A-Z][A-Za-z0-9]{1,7})\)/g;
  const SKIP = /^(?:of|and|the|with|in|for|to|on|a|an|or|by)$/i;
  let m;
  while ((m = re.exec(text)) !== null) {
    const abbr = m[2];
    const words = m[1].trim().split(/\s+/);
    for (let j = 1; j <= Math.min(8, words.length); j++) {
      const cand = words.slice(-j);
      if (SKIP.test(cand[0])) continue;
      const initials = cand.filter(w => !SKIP.test(w)).flatMap(w => w.split('-').filter(Boolean).map(x => x[0])).join('').toUpperCase();
      if (initials === abbr.toUpperCase().replace(/[^A-Z0-9]/g, '')) {
        map[abbr] = cand.join(' ');
        break;
      }
    }
  }
  return map;
}

/** Expands short (≤ 3-word) abbreviations defined in the source abstract; well-known long-form acronyms stay. */
const WELL_KNOWN_ABBREVIATIONS = new Set(['AI', 'ML', 'DL', 'IVF', 'ICSI', 'ART', 'BMI', 'HR', 'OR', 'RR', 'CI', 'RCT', 'RCTs', 'AUC', 'PFS', 'OS', 'ICU', 'CT', 'MRI', 'PCR', 'HIV', 'DNA', 'RNA', 'TXA', 'PPH', 'MI', 'HF', 'NNT', 'SD', 'IQR', 'US', 'UK', 'WHO', 'COVID', 'PET', 'ECG', 'BRCA']);

function expandDefinedAbbreviations(text, map) {
  let out = String(text || '');
  Object.entries(map || {}).forEach(([abbr, longForm]) => {
    if (longForm.split(/\s+/).length > 3 || WELL_KNOWN_ABBREVIATIONS.has(abbr)) return;
    if (out.includes(`${longForm} (${abbr})`)) return;
    const esc = abbr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (/\bgroup$/i.test(longForm)) out = out.replace(new RegExp(`\\b${esc}\\s+group\\b`, 'g'), longForm);
    out = out.replace(new RegExp(`\\b${esc}\\b`, 'g'), longForm);
  });
  return out;
}

module.exports = {
  buildAbbreviationMap,
  expandDefinedAbbreviations,
  NUMERIC_BRACKET_REGEX,
  NUMERIC_PAREN_REGEX,
  AUTHOR_YEAR_PAREN_REGEX,
  AUTHOR_YEAR_PROSE_REGEX,
  AUTHOR_YEAR_COMMA_REGEX,
  stripCitations,
  extractNumericTokens,
  parseStructuredResultSentence,
  tryPairAdjacentSentences,
  compressFindingPreservingNumbers,
  isEnglishText
};
