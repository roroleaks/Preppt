/**
 * Preppt Evidence Verdict (lib/evidence-verdict.js) — audit D-01
 *
 * Decides what the selected evidence says about the intervention, the way a
 * clinician would read it:
 *  1. Each study gets ONE verdict from its own conclusion (or, failing that, its
 *     primary result) — never from a subgroup, secondary, exploratory or
 *     background sentence.
 *  2. Verdicts are weighted by design: randomised trials and systematic reviews /
 *     meta-analyses decide the headline; observational and narrative evidence can
 *     only support a "provisional" statement.
 *  3. Off-topic studies (missing a core concept of the topic) are excluded from
 *     the headline altogether.
 */
const { isRandomisedTrialDesign, isEvidenceSynthesisDesign, DESIGNS, scorePaperRelevance, populationContradictsTopic } = require('../public/evidence-rules.js');
const { parseStructuredResultSentence } = require('./text-rules.js');

const SUBGROUP_OR_SECONDARY = /\bsubgroups?\b|\bsecondary (?:end ?points?|outcomes?|analys[ie]s)\b|\bexploratory\b|\bpost[- ]hoc\b|\bsensitivity analys[ie]s\b|\binteraction\b|\bno such (?:reduction|effect|benefit) was seen in\b|\bamong (?:those|patients|women|men) (?:with|who|aged)\b|\bin (?:the )?(?:subset|stratum|strata)\b/i;
const BACKGROUND_SIGNAL = /^(?:background|introduction|objectives?|aims?|purpose|methods?)\b/i;

const NULL_PATTERNS = [
  /\bdid not (?:significantly )?(?:reduce|improve|lower|decrease|increase|prolong|change|differ|affect|prevent|show)\b/i,
  /\b(?:was|were) not (?:significantly )?(?:different|reduced|improved|associated|superior|effective)\b/i,
  /\bno (?:statistically )?significant (?:difference|reduction|improvement|effect|benefit|change|association|increase|decrease)\b/i,
  /\bnot statistically significant\b|\bnone reached statistical significance\b|\bnon-?significant\b/i,
  /\b(?:failed|unable) to (?:show|demonstrate|reduce|improve)\b/i,
  /\bno (?:clear |additional |incremental )?(?:benefit|effect|advantage)\b/i,
  /\bsimilar (?:rates?|outcomes?|efficacy)\b|\bcomparable (?:rates?|outcomes?|efficacy)\b/i,
  /\bnon-?inferiority was not (?:demonstrated|shown|established)\b/i
];
const HARM_PATTERNS = [
  /\bincreased (?:the )?(?:risk|rate|incidence) of (?:death|mortality|adverse|harm|serious)/i,
  /\b(?:significantly )?higher (?:risk|rate|incidence) of (?:death|mortality|serious adverse)/i,
  /\bworse (?:outcomes?|survival)\b|\binferior to\b/i
];
const BENEFIT_PATTERNS = [
  /\b(?:significantly |substantially |markedly )?(?:reduced|lowered|decreased|improved|prolonged|prevented)\b(?! (?:only|neither))/i,
  /\bsignificant(?:ly)? (?:reduction|improvement|benefit|lower|higher|better|longer|fewer)\b/i,
  /\b(?:superior|more effective|effective in reducing|is effective|was effective|beneficial|benefits?)\b/i,
  /\b(?:should be (?:used|recommended|considered|initiated|implemented))\b|\bis recommended\b|\brecommended for\b|\bmust (?:develop|implement|use|adopt)\b/i,
  /\b(?:has|have|had) the potential to (?:decrease|reduce|improve|prevent)\b|\ban effective (?:treatment|therapy|option|intervention|strategy)\b/i,
  /\boutperform(?:ed|s)?\b|\b(?:higher|greater|better) (?:accuracy|performance|predictive|sensitivity)\b/i,
  /\bp\s*[<≤]\s*0\.0[0-5]\b/i
];
const POSITIVE_OUTCOME_WORDS = /\b(?:survival|pregnancy|live birth|remission|response rate|cure|success|accuracy|quality of life|implantation|healing|recovery)\b/i;

/** Effect estimate with CI: returns 'benefit' | 'harm' | 'null' | null */
function directionFromEffect(sentence) {
  const s = sentence.replace(/·/g, '.');
  const m = s.match(/\b(?:hazard ratio|odds ratio|relative risk|risk ratio|rate ratio|HR|OR|RR|IRR)\b[^0-9]{0,25}(\d+(?:\.\d+)?)[\s\S]{1,40}?(?:CI|confidence interval)[^0-9]{0,20}(\d+(?:\.\d+)?)\s*(?:to|-|–|,)\s*(\d+(?:\.\d+)?)/i);
  if (!m) return null;
  const est = Number(m[1]);
  const lo = Number(m[2]);
  const hi = Number(m[3]);
  if (!(lo <= est && est <= hi) && !(lo <= hi)) return null;
  if (lo <= 1 && hi >= 1) return 'null';
  const positiveOutcome = POSITIVE_OUTCOME_WORDS.test(s.slice(0, m.index + 1)) && !/progression-free|death|mortality/i.test(s.slice(0, m.index + 1));
  const below = hi < 1;
  if (positiveOutcome) return below ? 'harm' : 'benefit';
  return below ? 'benefit' : 'harm';
}

/** Direction of a single sentence: 'benefit' | 'no benefit' | 'harm' | 'mixed' | 'unclear' */
function classifySentenceDirection(sentence) {
  const s = String(sentence || '');
  const isNull = NULL_PATTERNS.some(p => p.test(s));
  const isHarm = HARM_PATTERNS.some(p => p.test(s));
  const effect = directionFromEffect(s);
  // remove negated clauses before checking for benefit verbs
  const positivePart = s.replace(/\b(?:did not|does not|do not|was not|were not|no|not|failed to|unable to)\b[^,;.]*/gi, ' ');
  const isBenefit = BENEFIT_PATTERNS.some(p => p.test(positivePart)) || effect === 'benefit';
  if (isNull && isBenefit) {
    // "did not reduce X but reduced Y" — a partial benefit on a named outcome
    if (/\bbut\b|\bwhereas\b|\bhowever\b|\balthough\b/i.test(s)) return 'mixed';
    return effect === 'benefit' ? 'benefit' : 'no benefit';
  }
  if (isHarm && !isBenefit) return 'harm';
  if (isNull || effect === 'null') return 'no benefit';
  if (isBenefit) return 'benefit';
  return 'unclear';
}

function designWeight(design) {
  if (isRandomisedTrialDesign(design) || isEvidenceSynthesisDesign(design)) return 3;
  if (design === DESIGNS.GUIDELINE) return 2;
  if ([DESIGNS.COHORT, DESIGNS.RETRO, DESIGNS.CASE_CONTROL, DESIGNS.CROSS_SECTIONAL].includes(design)) return 1;
  if ([DESIGNS.UNCONTROLLED, DESIGNS.REVIEW, DESIGNS.DIAGNOSTIC].includes(design)) return 0.5;
  return 0;
}

/**
 * One verdict per study.
 * @returns {{direction, sentence, basis, weight, highQuality}}
 */
function outcomeOf(sentence) {
  const parsed = parseStructuredResultSentence(sentence);
  if (parsed && parsed.outcome) return parsed.outcome;
  return '';
}

function deriveRecordVerdict(record, topic = '') {
  const r = record || {};
  const weight = designWeight(r.designFromSource);
  const highQuality = weight >= 3;
  const sentences = (r.classifiedSentences || []).filter(s => s && s.text && !BACKGROUND_SIGNAL.test(s.label || ''));
  // ignore subgroup/secondary sentences and sentences about a population that contradicts the topic
  const eligible = sentences.filter(s => !SUBGROUP_OR_SECONDARY.test(s.text) && !(topic && populationContradictsTopic(s.text, topic)));

  const conclusions = eligible.filter(s => s.role === 'conclusion' || /^(?:conclusions?|interpretation|summary answer)$/i.test(s.label || ''));
  for (const c of conclusions) {
    const d = classifySentenceDirection(c.text);
    if (d !== 'unclear') return { direction: d, sentence: c.text, basis: 'author conclusion', weight, highQuality, outcome: outcomeOf(c.text) };
  }
  const results = eligible.filter(s => s.role === 'results');
  // primary result = first results sentence carrying a direction (abstracts report the primary outcome first)
  for (const res of results) {
    const d = classifySentenceDirection(res.text);
    if (d !== 'unclear') return { direction: d, sentence: res.text, basis: 'primary result', weight, highQuality, outcome: outcomeOf(res.text) };
  }
  return { direction: 'unclear', sentence: '', basis: 'no result reported', weight, highQuality };
}

function refList(arr) {
  return `[${arr.join(', ')}]`;
}

/**
 * Aggregated verdict across studies.
 * @param {Array} records evidence records (with designFromSource, classifiedSentences, refNumber)
 * @param {Object} options { intervention, offTopicRefs:Set<number> }
 */
function deriveEvidenceVerdict(records, options = {}) {
  const intervention = options.intervention || 'the intervention';
  const offTopic = options.offTopicRefs || new Set();
  const perRecord = (records || []).map(r => ({ ref: r.refNumber, design: r.designFromSource, ...deriveRecordVerdict(r, options.topic || ''), offTopic: offTopic.has(r.refNumber) }));
  const counted = perRecord.filter(v => !v.offTopic);
  const hq = counted.filter(v => v.highQuality && v.direction !== 'unclear');
  const lq = counted.filter(v => !v.highQuality && v.weight > 0 && v.direction !== 'unclear');

  const by = (list, dir) => list.filter(v => v.direction === dir).map(v => v.ref);
  const hqBenefit = by(hq, 'benefit');
  const hqMixed = by(hq, 'mixed');
  const hqNull = by(hq, 'no benefit');
  const hqHarm = by(hq, 'harm');

  let verdict;
  let headline;
  let nullOutcomeLabels = [];
  if (hq.length === 0) {
    const lqBenefit = by(lq, 'benefit');
    const lqNull = by(lq, 'no benefit');
    verdict = 'insufficient';
    if (lqBenefit.length && !lqNull.length) {
      headline = `No randomised trial or meta-analysis with a clear result was selected; lower-level evidence ${refList(lqBenefit)} suggests benefit from ${intervention}, so conclusions are provisional.`;
    } else if (lqNull.length && !lqBenefit.length) {
      headline = `No randomised trial or meta-analysis with a clear result was selected; lower-level evidence ${refList(lqNull)} found no statistically significant improvement from ${intervention}, so conclusions are provisional.`;
    } else if (lqBenefit.length && lqNull.length) {
      headline = `No randomised trial or meta-analysis with a clear result was selected; lower-level evidence is inconsistent (benefit ${refList(lqBenefit)}, no benefit ${refList(lqNull)}).`;
    } else {
      headline = 'The selected abstracts do not report outcome results sufficient to judge benefit.';
    }
  } else if (hqHarm.length && !hqBenefit.length) {
    verdict = 'harm';
    headline = `High-quality evidence ${refList(hqHarm)} reports harm or inferior outcomes with ${intervention}.`;
  } else if ((hqBenefit.length || hqMixed.length) && !hqNull.length && !hqHarm.length) {
    verdict = 'benefit';
    const all = [...hqBenefit, ...hqMixed];
    headline = hqMixed.length && !hqBenefit.length
      ? `High-quality evidence ${refList(all)} shows benefit from ${intervention} on some, but not all, reported outcomes.`
      : `${hq.some(v => all.includes(v.ref) && isEvidenceSynthesisDesign(v.design)) ? 'Randomised and pooled evidence' : 'Randomised trial evidence'} ${refList(all)} favours ${intervention} on the outcomes reported; no included trial or meta-analysis reported a neutral primary result.`;
  } else if ((hqBenefit.length || hqMixed.length) && hqNull.length) {
    verdict = 'mixed';
    // Outcome-aware wording: benefit and null results often concern different outcomes
    const outcomesFor = refs => [...new Set(hq.filter(v => refs.includes(v.ref)).map(v => (v.outcome || '').toLowerCase()).filter(Boolean))];
    const benOut = outcomesFor([...hqBenefit, ...hqMixed]);
    const nullOut = outcomesFor(hqNull);
    const differentOutcomes = nullOut.length > 0 && nullOut.every(o => !benOut.includes(o));
    // a neutral result on a DIFFERENT outcome does not contradict benefit on the main efficacy outcome
    if (differentOutcomes) {
      verdict = 'benefit';
      nullOutcomeLabels = nullOut;
    }
    headline = differentOutcomes
      ? `High-quality evidence ${refList([...hqBenefit, ...hqMixed])} favours ${intervention}${benOut.length ? ` on ${benOut.join(' and ')}` : ''}; ${refList(hqNull)} found no significant difference on ${nullOut.join(' and ')}.`
      : `High-quality evidence is mixed: ${refList([...hqBenefit, ...hqMixed])} ${[...hqBenefit, ...hqMixed].length === 1 ? 'favours' : 'favour'} ${intervention}, while ${refList(hqNull)} ${hqNull.length === 1 ? 'reports' : 'report'} no statistically significant improvement on their main outcome.`;
  } else {
    verdict = 'no benefit';
    const niFailed = hq.filter(v => hqNull.includes(v.ref) && /non-?inferiority/i.test(v.sentence)).map(v => v.ref);
    headline = niFailed.length === hqNull.length
      ? `In the included randomised evidence ${refList(niFailed)}, non-inferiority was not demonstrated for ${intervention}.`
      : `Included randomised trials or meta-analyses ${refList(hqNull)} did not show a statistically significant improvement of ${intervention} on their main outcome.`;
  }

  return {
    verdict,
    headline,
    perRecord,
    highQualityBenefit: [...hqBenefit, ...hqMixed],
    highQualityNull: hqNull,
    highQualityHarm: hqHarm,
    nullOnOtherOutcomes: nullOutcomeLabels.length > 0,
    nullOutcomeLabels,
    excludedOffTopic: perRecord.filter(v => v.offTopic).map(v => v.ref)
  };
}

/**
 * Concept groups for the topic: the approved strategy's groups when present, otherwise derived from the topic
 * text (phrase-level), never from a flat list of single keywords.
 */
function resolveConceptGroups(topic, approvedStrategy) {
  if (approvedStrategy && Array.isArray(approvedStrategy.conceptGroups) && approvedStrategy.conceptGroups.length) {
    return approvedStrategy.conceptGroups;
  }
  const { proposeKeywords, buildSearchStrategy } = require('./keywords.js');
  const k = proposeKeywords(topic || '');
  if (!k.primaryKeywords.length) return [];
  return buildSearchStrategy({ topic, ...k }).conceptGroups;
}

/**
 * References of studies that are off-topic (missing a core concept or a contradicting population).
 * Safeguard: if this would exclude more than half of the studies, the concept match is treated as unreliable
 * (e.g. unusual wording) and nothing is excluded.
 */
function computeOffTopicRefs(records, papers, topic, approvedStrategy) {
  const groups = resolveConceptGroups(topic, approvedStrategy);
  const off = new Set();
  if (!groups.length) return off;
  (records || []).forEach((r, i) => {
    const rel = scorePaperRelevance({ ...((papers || [])[i] || {}), title: r.title, abstract: r.abstract, studyType: r.designFromSource }, groups, topic || '');
    if (rel.missingConcepts.length > 0 || rel.populationMismatch) off.add(r.refNumber);
  });
  if (off.size > (records || []).length / 2) return new Set();
  return off;
}

module.exports = {
  resolveConceptGroups,
  computeOffTopicRefs,
  classifySentenceDirection,
  directionFromEffect,
  deriveRecordVerdict,
  deriveEvidenceVerdict,
  designWeight,
  SUBGROUP_OR_SECONDARY
};
