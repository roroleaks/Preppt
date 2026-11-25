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
  // French
  'le', 'les', 'des', 'une', 'dans', 'pour', 'avec', 'sur', 'est', 'sont',
  'aux', 'qui', 'que', 'par', 'pas', 'plus', 'cette', 'ces', 'ont', 'été',
  'nous', 'vous', 'leur', 'leurs', 'dont', 'où', 'chez', 'entre', 'sans',
  // Portuguese
  'não', 'com', 'em', 'os', 'uma', 'para', 'dos', 'das', 'nos', 'nas', 'pelo',
  'pela', 'foi', 'foram', 'são', 'como', 'mais', 'sobre', 'entre', 'sem',
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
 * Flags CJK / non-Latin scripts, dominating Romance/Germanic function words,
 * or long prose with an unusually low share of common English function words.
 */
function isEnglishText(text) {
  if (!text || typeof text !== 'string') return { ok: true, reason: '' };
  const str = text.trim();
  if (!str) return { ok: true, reason: '' };

  const scriptMatch = str.match(NON_LATIN_SCRIPT_REGEX);
  if (scriptMatch) {
    return { ok: false, reason: `Non-Latin characters detected ("${scriptMatch[0]}")` };
  }

  // Strip author lead prefix like "Aitana Eugenia Salvo Jiménez:" before word-level check
  const body = str.replace(/^[•\s-]*[A-ZÀ-ÿ][^:]{1,60}:\s*/, '');
  const words = body.toLowerCase().match(/[a-zà-öø-ÿ]{2,}/g) || [];
  if (words.length < 4) {
    return { ok: true, reason: '' };
  }

  let enCount = 0;
  let foreignCount = 0;
  for (const w of words) {
    if (ENGLISH_FUNCTION_WORDS.has(w)) enCount++;
    if (FOREIGN_FUNCTION_WORDS.has(w)) foreignCount++;
  }

  // Note: 'a', 'no', 'in', 'or' are excluded from FOREIGN_FUNCTION_WORDS;
  // Spanish 'y' is 1 char so excluded from >=2-char words.
  if (foreignCount >= 2 && foreignCount > enCount) {
    return { ok: false, reason: `Non-English function words dominate (${foreignCount} foreign vs ${enCount} English)` };
  }

  if (words.length >= 8 && enCount / words.length < 0.08 && foreignCount >= 1) {
    return { ok: false, reason: `Low English stop-word share (${enCount}/${words.length}) with foreign tokens` };
  }

  // Also flag >= 10 words with zero English function words (e.g. non-English prose)
  if (words.length >= 10 && enCount === 0) {
    return { ok: false, reason: `Zero common English function words in ${words.length}-word prose` };
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
 * Parses an empirical results sentence into structured clinical components:
 * { outcome, comparisons: [{group, value}], effect: {measure, estimate, ciLow, ciHigh}, p, counts, nullDirection }
 */
function parseStructuredResultSentence(sentence) {
  const clean = stripCitations(sentence || '').trim();
  if (!clean) return null;

  // 1. Extract raw counts / denominators (e.g. 268/587, 223/585, n=1,066)
  const counts = [];
  const fracMatches = clean.match(/\b\d+\s*\/\s*\d+\b/g) || [];
  fracMatches.forEach(f => counts.push(f.replace(/\s+/g, '')));

  // Remove parenthetical count fragments like ", 268/587" before value parsing
  const noCounts = clean
    .replace(/,\s*\d+\s*\/\s*\d+/g, '')
    .replace(/\(\s*\d+\s*\/\s*\d+\s*\)/g, '');

  // 2. Extract comparisons: "in the <groupA> group (<valA>) compared to/vs the <groupB> group (<valB>)"
  const comparisons = [];
  const groupVsGroup = noCounts.match(
    /(?:in\s+(?:the\s+)?)?([a-zA-Z0-9_-]+(?:\s+[a-zA-Z0-9_-]+)?)\s+group\s*\(([^)]*?(\d+(?:\.\d+)?%?))\s*\)\s*(?:compared\s+(?:to|with)|versus|vs\.?)\s*(?:the\s+)?([a-zA-Z0-9_-]+(?:\s+[a-zA-Z0-9_-]+)?)\s+group\s*\(([^)]*?(\d+(?:\.\d+)?%?))\s*\)/i
  );
  if (groupVsGroup) {
    comparisons.push({ group: groupVsGroup[1].trim(), value: groupVsGroup[3].trim() });
    comparisons.push({ group: groupVsGroup[4].trim(), value: groupVsGroup[6].trim() });
  } else {
    // "in the <groupA> group than/vs the <groupB> group (<valA> versus/vs <valB>...)"
    const twoGroupsOneParen = noCounts.match(
      /in\s+(?:the\s+)?([a-zA-Z0-9_-]+(?:\s+[a-zA-Z0-9_-]+)?)\s+group\s+(?:than|compared\s+(?:to|with)|versus|vs\.?)\s+(?:the\s+)?([a-zA-Z0-9_-]+(?:\s+[a-zA-Z0-9_-]+)?)\s+group\s*\(\s*(\d+(?:\.\d+)?%?)\s*(?:versus|vs\.?)\s*(\d+(?:\.\d+)?%?)/i
    );
    if (twoGroupsOneParen) {
      comparisons.push({ group: twoGroupsOneParen[1].trim(), value: twoGroupsOneParen[3].trim() });
      comparisons.push({ group: twoGroupsOneParen[2].trim(), value: twoGroupsOneParen[4].trim() });
    } else {
      // "<valA> (<groupA>) vs <valB> (<groupB>)" or "<valA> ... compared with <valB> in the <groupB> group"
      const valGroupVs = noCounts.match(
        /(\d+(?:\.\d+)?%?)\s*\(([^()]{2,25})\)\s*(?:versus|vs\.?|compared\s+(?:to|with))\s*(\d+(?:\.\d+)?%?)\s*\(([^()]{2,25})\)/i
      );
      if (valGroupVs) {
        comparisons.push({ group: valGroupVs[2].trim(), value: valGroupVs[1].trim() });
        comparisons.push({ group: valGroupVs[4].trim(), value: valGroupVs[3].trim() });
      } else {
        const twoValsPct = noCounts.match(
          /(\d+(?:\.\d+)?%)\s*.*?(?:compared\s+(?:to|with)|versus|vs\.?)\s*(\d+(?:\.\d+)?%)(?:\s+in\s+(?:the\s+)?([a-zA-Z0-9_-]+)\s+group)?/i
        );
        if (twoValsPct) {
          const gA = (noCounts.match(/([a-zA-Z0-9_-]+)\s+group/i) || [])[1] || 'AI';
          const gB = twoValsPct[3] || 'control';
          comparisons.push({ group: gA.trim(), value: twoValsPct[1].trim() });
          comparisons.push({ group: gB.trim(), value: twoValsPct[2].trim() });
        }
      }
    }
  }

  // 3. Extract effect measure, estimate, and 95% CI
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

  // 4. Extract p-value
  let p = null;
  const pMatch = noCounts.match(/\bp\s*([=<>≤≥])\s*(0?\.\d+|\d+(?:\.\d+)?)/i);
  if (pMatch) {
    p = `${pMatch[1]}${pMatch[2]}`;
  }

  // 5. Extract outcome phrase
  let outcome = '';
  const leadMatch = noCounts.match(/^([^.;:(]+?)(?:\s+(?:rates?|was|were|is|are|achieved|showed|demonstrated|significantly)\b)/i);
  if (leadMatch && leadMatch[1].trim().length >= 3) {
    outcome = leadMatch[1].trim().replace(/\s+rates?$/i, '').trim();
  } else {
    outcome = 'Outcome';
  }
  outcome = outcome.charAt(0).toUpperCase() + outcome.slice(1);

  // 6. Null / non-inferiority direction suffix
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
      return { text: fullBullet, overflow: '', counts: [] };
    }
    let condensed = cleanSent
      .replace(/\b(?:in all the studies focused on|focused on)\b/gi, 'in')
      .replace(/\b(?:was|were|is|are|has been|have been)\s+(?:found to be|shown to be|observed to be|demonstrated to be)\b/gi, 'was')
      .replace(/\s{2,}/g, ' ')
      .trim();
    let candidate = lead ? `${lead}: ${condensed}` : condensed;
    const stopEnd = new Set(['in', 'on', 'to', 'of', 'with', 'and', 'or', 'for', 'by', 'at', 'from', 'as', 'the', 'a', 'an', 'that', 'which', 'subject', 'based']);
    let cut = candidate.split(/\s+/).filter(Boolean);
    if (cut.length > maxWords) cut = cut.slice(0, maxWords);
    while (cut.length > 3 && stopEnd.has(cut[cut.length - 1].toLowerCase().replace(/[^a-z]/g, ''))) {
      cut.pop();
    }
    candidate = cut.join(' ').replace(/[,;:\s–-]+$/, '') + '.';
    return { text: candidate, overflow: cleanSent, counts: [] };
  }

  // Structured clinical result rendering
  const parsed = parseStructuredResultSentence(cleanSent);
  if (parsed && (parsed.comparisons.length >= 2 || (parsed.effect && parsed.effect.estimate))) {
    const parts = [];
    if (parsed.comparisons.length >= 2) {
      parts.push(`${parsed.comparisons[0].value} ${parsed.comparisons[0].group} vs ${parsed.comparisons[1].value} ${parsed.comparisons[1].group}`);
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

module.exports = {
  NUMERIC_BRACKET_REGEX,
  NUMERIC_PAREN_REGEX,
  AUTHOR_YEAR_PAREN_REGEX,
  AUTHOR_YEAR_PROSE_REGEX,
  AUTHOR_YEAR_COMMA_REGEX,
  stripCitations,
  extractNumericTokens,
  parseStructuredResultSentence,
  compressFindingPreservingNumbers,
  isEnglishText
};
