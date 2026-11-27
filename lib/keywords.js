/**
 * Preppt — Keywords & Search Strategy Engine (rule-based, audit D-04)
 *
 * 1. The topic is split into CONCEPT PHRASES (intervention, condition, population),
 *    never into single words: "SGLT2 inhibitors in heart failure with preserved
 *    ejection fraction" -> ["SGLT2 inhibitors", "heart failure with preserved ejection fraction"].
 * 2. Synonyms and MeSH terms come only from a curated vocabulary matched on whole
 *    words/phrases ("ovarian cancer" no longer triggers endometriosis terms).
 *    Nothing is invented: unknown concepts simply get no synonyms.
 * 3. The Europe PMC query ANDs concept groups (each group = phrase OR synonyms),
 *    restricted to title/abstract, so off-topic records are not retrieved.
 */

function sanitizeTerm(str) {
  if (!str) return '';
  return String(str).replace(/[,\/;"]/g, ' ').replace(/\s+/g, ' ').trim();
}

const QUESTION_LEAD = /^(?:does|do|is|are|can|could|should|what|which|how|why|when|whether|the role of|role of|the use of|use of|the effect of|effect of|effects of|the impact of|impact of|efficacy of|effectiveness of|safety of|outcomes of|evidence for|evidence on|an update on|update on|review of|overview of)\s+/i;
const GENERIC_LEAD = /^(?:(?:the\s+)?(?:prevention|treatment|management|therapy|diagnosis|screening|prophylaxis|control|care)(?:\s+(?:and|or)\s+(?:prevention|treatment|management|therapy|diagnosis|screening|prophylaxis|control|care))*\s+of\s+)/i;
const GENERIC_ONLY = /^(?:prevention|prophylaxis|diagnosis|screening|detection|treatment and prevention|risk|outcomes?|clinical outcomes?|efficacy|effectiveness|safety|timing|route(?: of administration)?|dose|dosing|management|treatment|therapy|patients?|adults?|evidence|current evidence|limitations?|bias|future|future directions?|clinical evidence|mortality|morbidity|benefits?|risks?|harms?|role|use|impact|update|review|overview|practice|recommendations?|guidelines?|cost|costs|cost-effectiveness|implications?)$/i;
const TRAILING_GENERIC = /(?:\s+(?:medical|surgical|clinical|pharmacological|long-term|short-term))?\s+(?:treatment|therapy|management|outcomes?|efficacy|effectiveness|evidence)$/i;
const VERB_SPLIT = /\s+(?:improve|improves|reduce|reduces|affect|affects|prevent|prevents|increase|increases|decrease|decreases|influence|influences|predict|predicts|change|changes|work|works|help|helps)\s+/i;
const CONNECTOR_SPLIT = /\s+(?:in|for|among|amongst|with(?!\s+(?:preserved|reduced|mildly|mid-range|improved)\b)|versus|vs\.?|compared with|compared to|during|after|before|on)\s+/i;
const AND_SPLIT = /\s+and\s+/i;
const STOP_PHRASE = new Set(['a', 'an', 'the', 'and', 'or', 'of', 'to']);

/**
 * Curated vocabulary. `match` is tested with word boundaries against the topic;
 * every entry applies only when its concept is actually present.
 */
const VOCABULARY = [
  { id: 'sglt2', match: /\bsglt-?2|\bgliflozins?\b|\b(?:dapa|empa|cana|ertu|sota)gliflozin\b|sodium[- ]glucose co-?transporter/i,
    phrase: 'SGLT2 inhibitors', synonyms: ['sodium-glucose cotransporter 2 inhibitors', 'SGLT2i', 'empagliflozin', 'dapagliflozin'], mesh: ['Sodium-Glucose Transporter 2 Inhibitors'] },
  { id: 'hfpef', match: /\bhfpef\b|preserved ejection fraction|diastolic heart failure/i,
    phrase: 'heart failure with preserved ejection fraction', synonyms: ['HFpEF', 'preserved ejection fraction', 'diastolic heart failure'], mesh: ['Heart Failure, Diastolic'] },
  { id: 'hfref', match: /\bhfref\b|reduced ejection fraction|systolic heart failure/i,
    phrase: 'heart failure with reduced ejection fraction', synonyms: ['HFrEF', 'reduced ejection fraction', 'systolic heart failure'], mesh: ['Heart Failure, Systolic'] },
  { id: 'hf', match: /\bheart failure\b/i, unless: ['hfpef', 'hfref'],
    phrase: 'heart failure', synonyms: ['cardiac failure'], mesh: ['Heart Failure'] },
  { id: 'glp1', match: /\bglp-?1\b|semaglutide|liraglutide|tirzepatide|dulaglutide|glucagon-like peptide/i,
    phrase: 'GLP-1 receptor agonists', synonyms: ['glucagon-like peptide-1 receptor agonists', 'GLP-1 RA', 'semaglutide', 'liraglutide'], mesh: ['Glucagon-Like Peptide-1 Receptor Agonists'] },
  { id: 'masld', match: /\bmasld\b|\bmash\b|\bnafld\b|\bnash\b|fatty liver|steatotic liver|steatohepatitis/i,
    phrase: 'metabolic dysfunction-associated steatotic liver disease', synonyms: ['MASLD', 'NAFLD', 'non-alcoholic fatty liver disease', 'MASH', 'steatohepatitis'], mesh: ['Non-alcoholic Fatty Liver Disease'] },
  { id: 'endometriosis', match: /\bendometriosis\b|\bendometrioma/i,
    phrase: 'endometriosis', synonyms: ['endometrioma', 'deep infiltrating endometriosis'], mesh: ['Endometriosis'] },
  { id: 'fertility', match: /\bfertility preservation\b|\binfertil/i,
    phrase: 'infertility', synonyms: ['subfertility', 'fertility preservation', 'assisted reproductive technology'], mesh: ['Infertility, Female', 'Fertility Preservation'] },
  { id: 'ivf', match: /\bivf\b|in vitro fertili[sz]ation|\bicsi\b|assisted reproduct/i,
    phrase: 'in vitro fertilization', synonyms: ['IVF', 'ICSI', 'assisted reproductive technology'], mesh: ['Fertilization in Vitro', 'Reproductive Techniques, Assisted'] },
  { id: 'embryo', match: /\bembryo selection\b|\bembryo assessment\b|\bblastocyst/i,
    phrase: 'embryo selection', synonyms: ['embryo assessment', 'blastocyst selection', 'time-lapse imaging'], mesh: ['Embryo Transfer'] },
  { id: 'ai', match: /\bartificial intelligence\b|\bmachine learning\b|\bdeep learning\b|\b(?:ai)\b/i,
    phrase: 'artificial intelligence', synonyms: ['machine learning', 'deep learning', 'AI'], mesh: ['Artificial Intelligence'] },
  { id: 'cart', match: /\bcar-?t\b|chimeric antigen receptor/i,
    phrase: 'CAR-T cell therapy', synonyms: ['chimeric antigen receptor T-cell', 'CAR T cells', 'axicabtagene ciloleucel', 'tisagenlecleucel'], mesh: ['Receptors, Chimeric Antigen', 'Immunotherapy, Adoptive'] },
  { id: 'heme', match: /hematologic(?:al)? malignan|haematologic(?:al)? malignan|\bleuka?emia\b|\bmyeloma\b/i,
    phrase: 'hematologic malignancies', synonyms: ['haematological malignancies', 'leukemia', 'multiple myeloma'], mesh: ['Hematologic Neoplasms'] },
  { id: 'hodgkin', match: /\bhodgkin/i,
    phrase: 'Hodgkin lymphoma', synonyms: ['Hodgkin disease', 'classical Hodgkin lymphoma'], mesh: ['Hodgkin Disease'] },
  { id: 'txa', match: /tranexamic acid|\btxa\b/i,
    phrase: 'tranexamic acid', synonyms: ['TXA', 'antifibrinolytic'], mesh: ['Tranexamic Acid', 'Antifibrinolytic Agents'] },
  { id: 'pph', match: /post-?partum ha?emorrhage|\bpph\b|obstetric ha?emorrhage/i,
    phrase: 'postpartum haemorrhage', synonyms: ['postpartum hemorrhage', 'PPH', 'obstetric haemorrhage', 'postpartum bleeding'], mesh: ['Postpartum Hemorrhage'] },
  { id: 'parp', match: /\bparp\b|olaparib|niraparib|rucaparib|talazoparib/i,
    phrase: 'PARP inhibitors', synonyms: ['poly(ADP-ribose) polymerase inhibitors', 'olaparib', 'niraparib', 'rucaparib'], mesh: ['Poly(ADP-ribose) Polymerase Inhibitors'] },
  { id: 'ovca', match: /ovarian (?:cancer|carcinoma|neoplasm|tumou?r)/i,
    phrase: 'ovarian cancer', synonyms: ['epithelial ovarian cancer', 'ovarian carcinoma', 'high-grade serous carcinoma'], mesh: ['Ovarian Neoplasms', 'Carcinoma, Ovarian Epithelial'] },
  { id: 'if', match: /intermittent fasting|time-restricted eating|alternate-day fasting/i,
    phrase: 'intermittent fasting', synonyms: ['time-restricted eating', 'alternate-day fasting', 'time-restricted feeding'], mesh: ['Intermittent Fasting'] },
  { id: 'vitd', match: /vitamin d\b|cholecalciferol|calcifediol/i,
    phrase: 'vitamin D supplementation', synonyms: ['cholecalciferol', 'vitamin D3'], mesh: ['Vitamin D'] },
  { id: 'fracture', match: /\bfractures?\b/i,
    phrase: 'fracture', synonyms: ['fragility fracture', 'hip fracture'], mesh: ['Fractures, Bone'] },
  { id: 'asthma', match: /\basthma\b/i,
    phrase: 'asthma', synonyms: ['severe asthma'], mesh: ['Asthma'] },
  { id: 'diabetes', match: /type 2 diabetes|\bt2dm?\b|diabetes mellitus/i,
    phrase: 'type 2 diabetes', synonyms: ['type 2 diabetes mellitus', 'T2DM'], mesh: ['Diabetes Mellitus, Type 2'] },
  { id: 'obesity', match: /\bobesity\b|\bobese\b|overweight/i,
    phrase: 'obesity', synonyms: ['overweight', 'weight loss'], mesh: ['Obesity'] }
];

function matchVocabulary(text) {
  const hits = VOCABULARY.filter(v => v.match.test(text || ''));
  const ids = new Set(hits.map(h => h.id));
  return hits.filter(h => !(h.unless || []).some(u => ids.has(u)));
}

function tidyPhrase(p) {
  let s = sanitizeTerm(p).replace(/[?!.()]+/g, ' ').replace(/\s+/g, ' ').trim();
  for (let i = 0; i < 3; i++) {
    s = s.replace(QUESTION_LEAD, '').replace(GENERIC_LEAD, '').trim();
  }
  // strip a trailing generic word, but keep therapy names such as "maintenance therapy" or "cell therapy"
  if (!/\b(?:maintenance|cell|gene|hormone|hormonal|replacement|combination|adjuvant|neoadjuvant|targeted|radio|photodynamic|cognitive behavioural|cognitive behavioral|antiplatelet|anticoagulant)\s+(?:therapy|treatment)$/i.test(s) && s.split(' ').length > 1) {
    s = s.replace(TRAILING_GENERIC, '').trim();
  }
  const words = s.split(' ').filter(Boolean);
  while (words.length && STOP_PHRASE.has(words[0].toLowerCase())) words.shift();
  while (words.length && STOP_PHRASE.has(words[words.length - 1].toLowerCase())) words.pop();
  return words.join(' ');
}

/**
 * Splits a free-text topic into concept phrases.
 */
function extractConceptPhrases(topic) {
  const main = String(topic || '').split(/[:;]/)[0];
  const parts = [];
  main.split(VERB_SPLIT).forEach(chunk => {
    chunk.split(CONNECTOR_SPLIT).forEach(c => {
      // split "X and Y" only when both sides are real concepts ("prevention and treatment of" stays together)
      const sides = c.split(AND_SPLIT);
      const meaningful = sides.filter(x => !GENERIC_ONLY.test(tidyPhrase(x)) && tidyPhrase(x).length > 2);
      if (sides.length > 1 && meaningful.length === sides.length) sides.forEach(x => parts.push(x));
      else parts.push(c);
    });
  });
  const phrases = [];
  parts.map(tidyPhrase).forEach(p => {
    if (!p || p.length < 3 || GENERIC_ONLY.test(p)) return;
    // "prevention and treatment" leftovers or pure generic word lists are dropped
    if (p.split(/\s+(?:and|or)\s+/).every(x => GENERIC_ONLY.test(x.trim()))) return;
    if (!phrases.some(x => x.toLowerCase() === p.toLowerCase())) phrases.push(p);
  });
  return phrases;
}

/**
 * Proposes concept-level keywords, curated synonyms and MeSH concepts for a topic.
 */
function proposeKeywords(topic) {
  const text = String(topic || '');
  const phrases = extractConceptPhrases(text);
  const vocab = matchVocabulary(text);

  // Prefer the curated canonical phrase when a concept phrase maps onto a vocabulary entry
  const primary = [];
  const canonicalExtras = [];
  const usedVocab = new Set();
  phrases.forEach(p => {
    const hit = matchVocabulary(p)[0];
    if (hit && !usedVocab.has(hit.id)) {
      usedVocab.add(hit.id);
      // keep the user's own wording; bare abbreviations (e.g. "IVF") are expanded to the canonical phrase
      primary.push(/^[A-Z0-9-]{2,6}$/.test(p) ? hit.phrase : p);
      if (p.toLowerCase() !== hit.phrase.toLowerCase()) canonicalExtras.push(hit.phrase);
    } else if (!hit) {
      primary.push(p);
    }
  });
  vocab.forEach(v => {
    if (!usedVocab.has(v.id)) {
      usedVocab.add(v.id);
      primary.push(v.phrase);
    }
  });

  const synonyms = [...canonicalExtras];
  const mesh = [];
  vocab.forEach(v => {
    v.synonyms.forEach(s => synonyms.push(s));
    v.mesh.forEach(m => mesh.push(m));
  });

  const uniq = arr => Array.from(new Map(arr.map(sanitizeTerm).filter(Boolean).map(x => [x.toLowerCase(), x])).values());
  const primaryKeywords = uniq(primary).slice(0, 4);
  const primarySet = new Set(primaryKeywords.map(p => p.toLowerCase()));
  return {
    topic: text,
    primaryKeywords,
    synonyms: uniq(synonyms).filter(s => !primarySet.has(s.toLowerCase())),
    meshConcepts: uniq(mesh),
    method: 'rule-based concept extraction with curated vocabulary'
  };
}

/**
 * Groups synonyms / MeSH terms under the primary concept they belong to.
 */
function groupTerms(primary, extra) {
  const groups = primary.map(p => ({ head: p, terms: [p], vocab: matchVocabulary(p).map(v => v.id) }));
  extra.forEach(term => {
    const termVocab = matchVocabulary(term).map(v => v.id);
    let target = groups.find(g => g.vocab.some(id => termVocab.includes(id)));
    if (!target) {
      const vocabOwner = VOCABULARY.find(v => v.synonyms.concat(v.mesh).some(s => s.toLowerCase() === term.toLowerCase()));
      if (vocabOwner) target = groups.find(g => g.vocab.includes(vocabOwner.id));
    }
    if (!target) {
      const tokens = term.toLowerCase().split(/\W+/).filter(t => t.length > 3);
      target = groups.find(g => tokens.some(t => g.head.toLowerCase().includes(t)));
    }
    if (target && !target.terms.some(t => t.toLowerCase() === term.toLowerCase())) target.terms.push(term);
  });
  return groups;
}

function quoteTerm(t) {
  const clean = sanitizeTerm(t).replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim();
  return /\s|-/.test(clean) ? `"${clean}"` : clean;
}

/**
 * Builds Europe PMC (Solr) and Semantic Scholar search strings.
 * Supports both object payload ({ topic, primaryKeywords, ... }) and positional args.
 */
function buildSearchStrategy(paramsOrTopic, primaryKeywords, synonyms, meshConcepts, startYear) {
  let topic = '';
  let pKw = [];
  let syn = [];
  let mesh = [];
  let sYear = 2021;

  if (typeof paramsOrTopic === 'object' && paramsOrTopic !== null) {
    topic = paramsOrTopic.topic || '';
    pKw = paramsOrTopic.primaryKeywords || [];
    syn = paramsOrTopic.synonyms || [];
    mesh = paramsOrTopic.meshConcepts || [];
    sYear = paramsOrTopic.startYear || 2021;
  } else {
    topic = paramsOrTopic || '';
    pKw = primaryKeywords || [];
    syn = synonyms || [];
    mesh = meshConcepts || [];
    sYear = startYear || 2021;
  }

  const currentYear = new Date().getFullYear();
  const yearFrom = Math.max(1950, Number(sYear) || 2021);

  const cleanArr = (arr) => {
    if (Array.isArray(arr)) return arr.map(sanitizeTerm).filter(Boolean);
    if (typeof arr === 'string') return arr.split('\n').map(sanitizeTerm).filter(Boolean);
    return [];
  };

  let pTerms = cleanArr(pKw);
  if (pTerms.length === 0) pTerms = extractConceptPhrases(topic);
  if (pTerms.length === 0 && topic) pTerms = [sanitizeTerm(topic)];
  const groups = groupTerms(pTerms.slice(0, 4), [...cleanArr(syn), ...cleanArr(mesh)]);

  const groupClause = g => `(TITLE_ABS:(${g.terms.slice(0, 6).map(quoteTerm).join(' OR ')}))`;
  const yearClause = `(PUB_YEAR:[${yearFrom} TO ${currentYear}])`;
  // At most 3 concepts are ANDed; a 4th concept is usually a qualifier and would over-restrict.
  const andGroups = groups.slice(0, 3);
  const pmcQuery = [...andGroups.map(groupClause), yearClause].join(' AND ');
  // Relaxed fallback: the first two concepts only (used when the strict query returns nothing)
  const pmcFallbackQuery = [...groups.slice(0, 2).map(groupClause), yearClause].join(' AND ');
  // Evidence-priority arm: same concepts restricted to trials and evidence syntheses (sorted by citations
  // client-side) so landmark RCTs are always among the candidates.
  const pmcEvidenceQuery = `${pmcQuery} AND (PUB_TYPE:"randomized controlled trial" OR PUB_TYPE:"meta-analysis" OR PUB_TYPE:"systematic review")`;

  const s2Query = pTerms.slice(0, 3).join(' ').replace(/[^\w\s-]/g, ' ').replace(/\s+/g, ' ').trim() || topic;
  const s2YearFilter = `${yearFrom}-${currentYear}`;

  return {
    topic,
    startYear: yearFrom,
    currentYear,
    conceptGroups: groups.map(g => ({ concept: g.head, terms: g.terms })),
    pmc: {
      engine: 'Europe PMC / PubMed Central',
      query: pmcQuery,
      fallbackQuery: pmcFallbackQuery,
      evidenceQuery: pmcEvidenceQuery,
      filters: `PUB_YEAR:[${yearFrom} TO ${currentYear}]; concepts searched in title/abstract`,
      endpoint: 'https://www.ebi.ac.uk/europepmc/webservices/rest/search'
    },
    semanticScholar: {
      engine: 'Semantic Scholar Academic Graph',
      query: s2Query,
      yearFilter: s2YearFilter,
      fields: 'paperId,title,authors,year,abstract,venue,publicationVenue,journal,externalIds,openAccessPdf,citationCount,publicationTypes,fieldsOfStudy',
      endpoint: 'https://api.semanticscholar.org/graph/v1/paper/search'
    }
  };
}

module.exports = {
  proposeKeywords,
  buildSearchStrategy,
  extractConceptPhrases,
  matchVocabulary
};
