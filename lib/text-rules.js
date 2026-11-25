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
    return { text: fullBullet, overflow: '' };
  }

  // Extract statistical/numeric segments and leading outcome context so all numbers survive
  const statClauseRegex = /(?:\b(?:AUC|AUROC|sensitivity|specificity|accuracy|OR|RR|HR|RD|CI|p|P)\b[^.;]*|\b\d+(?:\.\d+)?%?[^.;]*)/gi;
  const clauses = cleanSent.split(/[;]+/).map(s => s.trim()).filter(Boolean);

  // Pick clauses that contain numbers; if a single clause has all numbers and is too long,
  // condense filler words while keeping outcome terms + all numbers
  let numericParts = clauses.filter(c => extractNumericTokens(c).length > 0);
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

    // Final compact fallback: keep first few outcome words + all numeric/statistical phrases
    if (candidate.split(/\s+/).filter(Boolean).length > maxWords) {
      const outcomeWords = cleanSent
        .replace(statClauseRegex, '')
        .split(/\s+/)
        .filter(w => w.length > 2)
        .slice(0, Math.max(2, Math.floor(maxWords / 3)))
        .join(' ');
      const numMatches = cleanSent.match(/(?:(?:AUC|AUROC|CI|OR|RR|HR|RD|p|P)\s*[=<>:]?\s*)?\d+(?:\.\d+)?%?(?:\s*(?:vs\.?|to|-|–)\s*\d+(?:\.\d+)?%?)?/g) || sentNums;
      const compactStats = numMatches.join(', ');
      const compact = [outcomeWords, compactStats].filter(Boolean).join(': ');
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
  compressFindingPreservingNumbers
};
