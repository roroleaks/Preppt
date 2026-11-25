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
 * Compresses a finding sentence to fit within maxWords while preserving
 * ALL numbers from the source result clause. Returns { text, overflow }.
 * Never strips numbers from a numeric finding clause.
 */
function compressFindingPreservingNumbers(lead, sentence, maxWords) {
  const cleanSent = stripCitations(sentence || '').trim();
  if (!cleanSent) return { text: lead ? `${lead}:` : '', overflow: '' };

  const fullBullet = lead ? `${lead}: ${cleanSent}` : cleanSent;
  const words = fullBullet.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) {
    return { text: fullBullet, overflow: '' };
  }

  const sentNums = extractNumericTokens(cleanSent);
  if (sentNums.length === 0) {
    // Qualitative finding: condense filler phrases while keeping key outcome words within maxWords
    let condensed = cleanSent
      .replace(/\b(?:in all the studies focused on|focused on)\b/gi, 'in')
      .replace(/\b(?:was|were|is|are|has been|have been)\s+(?:found to be|shown to be|observed to be|demonstrated to be)\b/gi, 'was')
      .replace(/\s{2,}/g, ' ')
      .trim();
    let candidate = lead ? `${lead}: ${condensed}` : condensed;
    const stopEnd = new Set(['in', 'on', 'to', 'of', 'with', 'and', 'or', 'for', 'by', 'at', 'from', 'as', 'the', 'a', 'an', 'that', 'which', 'subject', 'based']);
    let cut = candidate.split(/\s+/).filter(Boolean);
    if (cut.length > maxWords) {
      cut = cut.slice(0, maxWords);
    }
    while (cut.length > 3 && stopEnd.has(cut[cut.length - 1].toLowerCase().replace(/[^a-z]/g, ''))) {
      cut.pop();
    }
    candidate = cut.join(' ').replace(/[,;:\s–-]+$/, '') + '.';
    return { text: candidate, overflow: cleanSent };
  }

  // Extract statistical/numeric segments and leading outcome context so all numbers survive
  const statClauseRegex = /(?:\b(?:AUC|AUROC|sensitivity|specificity|accuracy|OR|RR|HR|RD|CI|p|P)\b[^.;]*|\b\d+(?:\.\d+)?%?[^.;]*)/gi;
  const clauses = cleanSent.split(/[;]+/).map(s => s.trim()).filter(Boolean);

  // Pick clauses that contain numbers or null-result signals (so paired positive + null outcomes stay together)
  const nullClauseRegex = /\b(?:no\s+(?:statistically\s+)?significant\s+difference|no\s+difference|not\s+demonstrated|non-?inferiority)\b/i;
  let numericParts = clauses.filter(c => extractNumericTokens(c).length > 0 || nullClauseRegex.test(c));
  let candidateBody = numericParts.length > 0 ? numericParts.join('; ') : cleanSent;

  // Ensure every number from cleanSent is present in candidateBody
  const missingNums = sentNums.filter(n => !candidateBody.includes(n));
  if (missingNums.length > 0) {
    candidateBody = cleanSent;
  }

  let candidate = lead ? `${lead}: ${candidateBody}` : candidateBody;
  if (candidate.split(/\s+/).filter(Boolean).length > maxWords) {
    // Condense verbose filler phrases while keeping outcome keywords and all numeric tokens
    const condensed = candidateBody
      .replace(/\b(?:was|were|is|are|has been|have been)\s+(?:found to be|shown to be|observed to be|demonstrated to be)\b/gi, 'was')
      .replace(/\b(?:in the|of the|for the|with the|between the|among the)\b/gi, 'in')
      .replace(/\b(?:statistically significant|significant difference)\b/gi, 'significant')
      .replace(/\s{2,}/g, ' ')
      .trim();

    const stillHasAllNums = sentNums.every(n => condensed.includes(n));
    if (stillHasAllNums) {
      candidate = lead ? `${lead}: ${condensed}` : condensed;
    }

    // Final compact fallback: keep first few outcome words + all numeric/statistical phrases (+ null-result summary if present)
    if (candidate.split(/\s+/).filter(Boolean).length > maxWords) {
      const stopLead = new Set(['the', 'a', 'an', 'was', 'were', 'is', 'are', 'in', 'of', 'for', 'with', 'significantly', 'rate', 'rates']);
      const outcomeWords = cleanSent
        .replace(statClauseRegex, '')
        .split(/\s+/)
        .filter(w => w.length > 2 && !stopLead.has(w.toLowerCase()))
        .slice(0, 2)
        .join(' ');
      const numMatches = cleanSent.match(/(?:(?:AUC|AUROC|CI|OR|RR|HR|RD|p|P)\s*[=<>:]?\s*)?\d+(?:\.\d+)?%?(?:\s*(?:vs\.?|versus|to|-|–)\s*\d+(?:\.\d+)?%?)?/g) || sentNums;
      const compactStats = numMatches.map(s => s.replace(/\bversus\b/gi, 'vs').replace(/\bP\s*=\s*/g, 'P=')).join(', ');
      const hasLiveBirthNull = /no\s+(?:statistically\s+)?significant\s+difference.*live\s*birth/i.test(cleanSent);
      const hasNonInfFail = /not\s+(?:able\s+to\s+)?demonstrate\s+non-?inferiority|non-?inferiority\s+(?:was\s+not|not)\s+demonstrated/i.test(cleanSent);
      const hasRD = /\b(?:risk\s+difference|RD)\b/i.test(cleanSent);
      let compact = [outcomeWords, compactStats].filter(Boolean).join(': ');
      if (hasRD && !/\bRD\b/i.test(compact)) compact += '; RD reported';
      if (hasLiveBirthNull) compact += '; no difference in live birth';
      if (hasNonInfFail) compact += '; non-inferiority not demonstrated';
      if (sentNums.every(n => compact.includes(n))) {
        candidate = lead ? `${lead}: ${compact}` : compact;
      }
    }
  }

  return {
    text: candidate,
    overflow: cleanSent
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
  compressFindingPreservingNumbers,
  isEnglishText
};
