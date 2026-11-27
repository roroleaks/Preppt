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

  const api = { DESIGNS, classifyStudyDesign, isRandomisedTrialDesign, isEvidenceSynthesisDesign, isPrimaryStudyDesign, collectPubTypes };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.PrepptEvidenceRules = Object.assign(root.PrepptEvidenceRules || {}, api);
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
