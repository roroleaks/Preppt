/**
 * Preppt Evidence Rules (public/evidence-rules.js)
 * Shared by the browser bundle (public/app.js) and the server (lib/*.js).
 *
 * 1. classifyStudyDesign: study design from publication-type metadata first,
 *    then the title, then unambiguous abstract cues. Reviews of trials are never
 *    labelled as trials, and "cohort" is never upgraded to "prospective".
 * 2. isRandomisedTrialDesign / isEvidenceSynthesisDesign: single source of truth
 *    for design checks used across synthesis and validation.
 */
(function (root) {
  const DESIGNS = {
    RCT: 'Randomised controlled trial',
    SR: 'Systematic review / meta-analysis',
    REVIEW: 'Narrative review',
    GUIDELINE: 'Consensus statement / guideline',
    PROTOCOL: 'Study protocol',
    COHORT: 'Cohort study',
    RETRO: 'Retrospective study',
    CASE_CONTROL: 'Case-control study',
    CROSS_SECTIONAL: 'Cross-sectional study',
    SURVEY: 'Survey / qualitative study',
    CASE_REPORT: 'Case report / series',
    UNCONTROLLED: 'Uncontrolled clinical study',
    DIAGNOSTIC: 'Diagnostic accuracy study',
    CONFERENCE: 'Conference abstract',
    THESIS: 'Dataset / thesis',
    EDITORIAL: 'Editorial / commentary',
    UNKNOWN: 'Design not stated'
  };

  function lower(v) {
    return String(v || '').toLowerCase();
  }

  function collectPubTypes(paper) {
    const p = paper || {};
    const raw = [
      p.pubType, p.pubTypes, p.publication_types, p.publicationTypes,
      p.publication_type, p.openAlexType, p.crossrefType, p.type
    ];
    const out = [];
    raw.forEach(v => {
      if (!v) return;
      if (Array.isArray(v)) v.forEach(x => x && out.push(lower(x)));
      else out.push(lower(v));
    });
    // Normalise Semantic Scholar camel-case tokens ("MetaAnalysis", "ClinicalTrial", "JournalArticle")
    return out.map(t => t.replace(/metaanalysis/g, 'meta-analysis').replace(/clinicaltrial/g, 'clinical trial')
      .replace(/casereport/g, 'case report').replace(/journalarticle/g, 'journal article'));
  }

  function hasType(types, re) {
    return types.some(t => re.test(t));
  }

  /**
   * @param {object} paper { title, abstract|abstract_summary, journal, doi, pubType/publicationTypes/... }
   * @returns {string} one of DESIGNS values
   */
  function classifyStudyDesign(paper) {
    const p = paper || {};
    const title = lower(p.title);
    const abs = lower(p.abstract || p.abstract_summary || p.abstractText);
    const journal = lower(p.journal);
    const doi = lower(p.doi);
    const types = collectPubTypes(p);

    // Conference abstracts / theses (metadata or unmistakable patterns)
    if (hasType(types, /meeting abstract|congress|conference/) || /^abstract\s+[a-z]?\d+\s*:/.test(title) ||
        /_suppl\b|\.suppl\.|supplement/.test(doi) && /^(?:abstract|poster)/.test(title)) {
      return DESIGNS.CONFERENCE;
    }
    if (hasType(types, /dissertation|thesis|dataset/) || /\btrabajo\s+fin\s+de\s+grado\b|\btesis\b/.test(abs)) {
      return DESIGNS.THESIS;
    }

    // Protocols have no results
    if (/\bprotocol\b/.test(title) || /\bthis protocol\b|\bwe (?:will|plan to) (?:conduct|perform|search)\b/.test(abs)) {
      return DESIGNS.PROTOCOL;
    }

    // Guidelines / consensus / scientific statements
    if (hasType(types, /guideline|consensus/) ||
        /\bguideline|\brecommendations?\b|\bconsensus\b|scientific statement|position statement|position paper|expert opinion/.test(title)) {
      return DESIGNS.GUIDELINE;
    }

    // Evidence syntheses (checked BEFORE trials: a meta-analysis "of randomized controlled trials" is not a trial)
    if (hasType(types, /systematic review|meta-analysis/) ||
        /systematic(?:al)? review|meta-?analys|network meta|pooled analysis|umbrella review|scoping review|individual patient data|individual participant data/.test(title)) {
      return DESIGNS.SR;
    }

    if (hasType(types, /editorial|comment|letter|news/) && !hasType(types, /randomi[sz]ed controlled trial/)) {
      return DESIGNS.EDITORIAL;
    }

    // Narrative reviews (metadata or title)
    const titleSaysReview = /\breview\b|\boverview\b|state of the art|\bupdate on\b|: an update\b|\bperspective\b|\bprimer\b|\bnarrative\b|current (?:evidence|concepts|status)|mechanistic insights|new frontiers/.test(title);
    if (titleSaysReview || (hasType(types, /^review$|\breview\b/) && !hasType(types, /randomi[sz]ed controlled trial/))) {
      return DESIGNS.REVIEW;
    }

    // Randomised controlled trials
    if (hasType(types, /randomi[sz]ed controlled trial/) ||
        (/\brandomi[sz]ed\b|\brct\b/.test(title) && /\btrial\b|\brct\b|placebo|double-blind|non-?inferiority/.test(title)) ||
        /\b(?:were|was|been) randomi[sz]ed\b|\brandomly (?:assigned|allocated)\b|\bthis (?:multicent(?:er|re) |double-blind |open-label |)randomi[sz]ed\b|\bin (?:a|this) (?:[a-z-]+,? ){0,4}randomi[sz]ed,? (?:[a-z-]+,? ){0,3}(?:trial|study)\b|\bunderwent randomi[sz]ation\b/.test(abs)) {
      return DESIGNS.RCT;
    }

    if (/case report|case series/.test(title) || hasType(types, /case report/)) {
      return DESIGNS.CASE_REPORT;
    }
    if (/\bretrospective\b|\breal-world\b|registry|database analysis|chart review/.test(title) ||
        /\bretrospective(?:ly)?\b|\barchival data\b|\bmedical records were reviewed\b/.test(abs)) {
      return DESIGNS.RETRO;
    }
    if (/\bcohort\b/.test(title) || /\b(?:prospective|population-based|multicent(?:er|re)) cohort\b|\bcohort study\b/.test(abs)) {
      return DESIGNS.COHORT;
    }
    if (/case-control|case control/.test(title + ' ' + abs)) return DESIGNS.CASE_CONTROL;
    if (/cross-sectional|cross sectional/.test(title + ' ' + abs)) return DESIGNS.CROSS_SECTIONAL;
    if (/\bsurvey\b|questionnaire|qualitative|interview|focus group|perspectives of/.test(title) ||
        /\b(?:online |national |web-based )?survey was\b|\bsemi-structured interviews?\b/.test(abs)) {
      return DESIGNS.SURVEY;
    }
    if (/diagnostic accuracy|sensitivity and specificity/.test(title + ' ' + abs)) return DESIGNS.DIAGNOSTIC;
    if (hasType(types, /clinical trial/) || /\bsingle-arm\b|\bphase (?:i|ii|1|2)\b|\bpilot study\b|open-label/.test(title + ' ' + abs)) {
      return DESIGNS.UNCONTROLLED;
    }
    if (/\bprospective\b/.test(title) || /\bprospective(?:ly)? (?:study|enrolled|collected)\b/.test(abs)) {
      return DESIGNS.COHORT;
    }
    if (/\bnarrative review\b|\bthis review\b|\bin this review\b|\bwe review\b/.test(abs)) return DESIGNS.REVIEW;
    void journal;
    return DESIGNS.UNKNOWN;
  }

  function isRandomisedTrialDesign(design) {
    return lower(design) === lower(DESIGNS.RCT);
  }

  function isEvidenceSynthesisDesign(design) {
    return lower(design) === lower(DESIGNS.SR);
  }

  function isPrimaryStudyDesign(design) {
    const d = lower(design);
    return [DESIGNS.RCT, DESIGNS.COHORT, DESIGNS.RETRO, DESIGNS.CASE_CONTROL, DESIGNS.CROSS_SECTIONAL,
      DESIGNS.SURVEY, DESIGNS.CASE_REPORT, DESIGNS.UNCONTROLLED, DESIGNS.DIAGNOSTIC].map(lower).includes(d);
  }


  // ---------------------------------------------------------------------------
  // Relevance scoring (audit D-05 / D-07)
  // ---------------------------------------------------------------------------
  const DESIGN_POINTS = {};
  DESIGN_POINTS[DESIGNS.RCT] = 20;
  DESIGN_POINTS[DESIGNS.SR] = 18;
  DESIGN_POINTS[DESIGNS.GUIDELINE] = 12;
  DESIGN_POINTS[DESIGNS.COHORT] = 10;
  DESIGN_POINTS[DESIGNS.CASE_CONTROL] = 9;
  DESIGN_POINTS[DESIGNS.RETRO] = 8;
  DESIGN_POINTS[DESIGNS.DIAGNOSTIC] = 8;
  DESIGN_POINTS[DESIGNS.UNCONTROLLED] = 7;
  DESIGN_POINTS[DESIGNS.CROSS_SECTIONAL] = 6;
  DESIGN_POINTS[DESIGNS.REVIEW] = 6;
  DESIGN_POINTS[DESIGNS.SURVEY] = 4;
  DESIGN_POINTS[DESIGNS.CASE_REPORT] = 3;
  DESIGN_POINTS[DESIGNS.CONFERENCE] = 2;
  DESIGN_POINTS[DESIGNS.EDITORIAL] = 1;
  DESIGN_POINTS[DESIGNS.PROTOCOL] = 0;
  DESIGN_POINTS[DESIGNS.THESIS] = 1;
  DESIGN_POINTS[DESIGNS.UNKNOWN] = 4;

  // Qualifier pairs: if the topic names one side and the paper only the other, it is a population mismatch.
  const OPPOSING_QUALIFIERS = [
    [/preserved ejection fraction|\bhfpef\b/, /reduced ejection fraction|\bhfref\b/],
    [/reduced ejection fraction|\bhfref\b/, /preserved ejection fraction|\bhfpef\b/],
    [/type 2 diabetes|\bt2dm?\b/, /type 1 diabetes|\bt1dm?\b/],
    [/type 1 diabetes|\bt1dm?\b/, /type 2 diabetes|\bt2dm?\b/],
    [/\b(?:children|paediatric|pediatric|infants?|neonat\w*|adolescents?)\b/, /\badults?\b(?! and (?:children|adolescents))/],
    [/\badults?\b/, /\b(?:children|paediatric|pediatric|infants?|neonat\w*)\b/]
  ];

  function escapeRe(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function normaliseText(s) {
    return lower(s).replace(/haemorrh/g, 'hemorrh').replace(/oesophag/g, 'esophag').replace(/[‐-―]/g, '-')
      .replace(/\s+/g, ' ');
  }

  function stemTokens(term) {
    return normaliseText(term).split(/[^a-z0-9-]+/)
      .filter(t => t.length > 2 && !/^(?:and|the|with|for|of|in|on|to)$/.test(t))
      .map(t => t.replace(/(?:ies|es|s)$/, ''));
  }

  /** 1 = exact phrase, 0.8 = all significant words present, 0 = absent */
  function termMatch(text, term) {
    const t = normaliseText(text);
    const n = normaliseText(term).trim();
    if (!n) return 0;
    const re = new RegExp(`(?:^|[^a-z0-9])${escapeRe(n)}(?:s|es)?(?:[^a-z0-9]|$)`);
    if (re.test(t)) return 1;
    const tokens = stemTokens(n);
    if (tokens.length >= 2 && tokens.every(tok => t.includes(tok))) return 0.8;
    return 0;
  }

  /**
   * Scores one paper 0–100 against the approved concepts.
   * @param {object} paper
   * @param {Array<{concept:string, terms:string[]}>} conceptGroups
   * @param {string} topic
   * @returns {{score:number, missingConcepts:string[], reasons:string[], design:string}}
   */
  function scorePaperRelevance(paper, conceptGroups, topic) {
    const p = paper || {};
    const title = p.title || '';
    const abs = p.abstract || p.abstract_summary || '';
    const groups = (conceptGroups || []).filter(g => g && Array.isArray(g.terms) && g.terms.length);
    const reasons = [];
    const missing = [];
    let coverage = 0;

    groups.forEach(g => {
      let best = 0;
      let where = '';
      g.terms.forEach(term => {
        const inTitle = termMatch(title, term);
        const inAbs = termMatch(abs, term) * 0.6;
        const v = Math.max(inTitle, inAbs);
        if (v > best) { best = v; where = inTitle >= inAbs ? 'title' : 'abstract'; }
      });
      coverage += best;
      if (best === 0) missing.push(g.concept);
      else reasons.push(`${g.concept} (${where})`);
    });
    const conceptScore = groups.length ? (coverage / groups.length) * 60 : 30;

    const design = p.studyType || p.study_type || classifyStudyDesign(p);
    const designScore = DESIGN_POINTS[design] !== undefined ? DESIGN_POINTS[design] : 4;
    reasons.push(design);

    const cites = Number(p.citationCount || p.citation_count || 0);
    const citeScore = Math.min(10, Math.log10(cites + 1) * 3.3);
    const abstractScore = abs.length > 150 ? 5 : 0;
    const multiSource = (Array.isArray(p.sources) && p.sources.length > 1) ? 5 : 0;

    let score = conceptScore + designScore + citeScore + abstractScore + multiSource;

    const topicText = normaliseText(topic);
    const paperText = normaliseText(`${title} ${abs.slice(0, 600)}`);
    let mismatch = false;
    OPPOSING_QUALIFIERS.forEach(([wanted, other]) => {
      if (wanted.test(topicText) && !other.test(topicText) && other.test(normaliseText(title)) && !wanted.test(paperText)) mismatch = true;
    });
    if (mismatch) {
      score -= 30;
      reasons.push('population differs from topic');
    }
    if (missing.length > 0) {
      score = Math.min(score, 35 - 10 * (missing.length - 1));
      reasons.push(`missing: ${missing.join(', ')}`);
    }
    return { score: Math.max(0, Math.min(100, Math.round(score))), missingConcepts: missing, reasons, design, populationMismatch: mismatch };
  }

  /** True when a sentence is about a population that contradicts the topic's (e.g. HFrEF for an HFpEF topic). */
  function populationContradictsTopic(text, topic) {
    const t = normaliseText(text);
    const tp = normaliseText(topic);
    return OPPOSING_QUALIFIERS.some(([wanted, other]) => wanted.test(tp) && !other.test(tp) && other.test(t) && !wanted.test(t));
  }

  /** Builds concept groups when only flat approved keywords are available. */
  function conceptGroupsFromKeywords(approvedKeywords) {
    const k = approvedKeywords || {};
    const primary = (k.primaryKeywords || []).filter(Boolean);
    const extra = [...(k.synonyms || []), ...(k.meshConcepts || [])].filter(Boolean);
    return primary.map(p => {
      const pTokens = stemTokens(p);
      const terms = [p, ...extra.filter(e => stemTokens(e).some(t => pTokens.includes(t)))];
      return { concept: p, terms };
    });
  }


  // ---------------------------------------------------------------------------
  // Metadata integrity (audit D-17 / D-18): never invent or mislabel metadata
  // ---------------------------------------------------------------------------
  /** Returns a 4-digit year or null. A missing year is never replaced by the current year. */
  function normaliseYear(v) {
    const m = String(v == null ? '' : v).match(/\b(1[89]\d{2}|20\d{2})\b/);
    return m ? Number(m[1]) : null;
  }

  const REPOSITORY_NAMES = /^(?:pubmed|pubmed central|europe pmc|pmc|medline|semantic scholar|openalex|crossref|zenodo|figshare|ssrn electronic journal|research square|biorxiv|medrxiv|arxiv(?:\.org)?|preprints\.org|google scholar|unknown|academic journal|scholarly journal)$/i;
  /** Repository / index names are not journals: return '' so the reference shows no false venue. */
  function normaliseJournal(name) {
    const n = String(name || '').replace(/\s+/g, ' ').trim();
    if (!n || REPOSITORY_NAMES.test(n)) return '';
    return n;
  }

  function normalisePmcid(v) {
    const raw = String(v || '').trim().replace(/\/$/, '').replace(/^https?:\/\/.*\//i, '').trim();
    if (!raw) return '';
    const digits = raw.replace(/^pmc/i, '');
    return /^\d+$/.test(digits) ? `PMC${digits}` : raw.toUpperCase();
  }

  /**
   * Rejects text that is not a real abstract (reference lists, full-text dumps, publisher boilerplate).
   * Returns the cleaned abstract or '' when it is not trustworthy.
   */
  function sanitizeAbstract(text) {
    const t = String(text || '').replace(/\s+/g, ' ').trim();
    if (!t) return '';
    const refSignals = (t.match(/google scholar|crossref|pubmed\b|\bdoi:|\bet al\.,? \(?\d{4}|\(in press\)|view article|\[\d+\]\s*[A-Z]/gi) || []).length;
    if (refSignals >= 3) return '';
    if (t.length > 6000) return '';
    if (/^(?:abstract not available|no abstract|\[abstract not available\])/i.test(t)) return '';
    return t.replace(/^abstract[:.\s]+/i, '');
  }

  const api = { DESIGNS, classifyStudyDesign, isRandomisedTrialDesign, isEvidenceSynthesisDesign, isPrimaryStudyDesign, collectPubTypes, scorePaperRelevance, conceptGroupsFromKeywords, termMatch, populationContradictsTopic, normaliseYear, normaliseJournal, normalisePmcid, sanitizeAbstract };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.PrepptEvidenceRules = Object.assign(root.PrepptEvidenceRules || {}, api);
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
