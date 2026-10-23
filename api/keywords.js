/**
 * Preppt — Keywords & Search Strategy Engine
 * Proposes medical keywords, synonyms, MeSH concepts,
 * and generates separate query strategies for Europe PMC and Semantic Scholar.
 */

function cleanText(str) {
  if (!str) return '';
  return str.replace(/[^\w\s-]/g, ' ').replace(/\s+/g, ' ').trim();
}

function sanitizeTerm(str) {
  if (!str) return '';
  return str.replace(/[,\/]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Proposes relevant scientific/medical keywords, synonyms, and MeSH concepts based on topic
 */
function proposeKeywords(topic) {
  const cleaned = cleanText(topic);
  const words = cleaned.split(/\s+/).filter(w => w.length > 2 && !/^(the|and|for|with|from|between|into|through|during|before|after|above|below|to|of|in|on|at|by|a|an)$/i.test(w));

  const primaryKeywords = words.slice(0, 4);
  const synonyms = [];
  const meshConcepts = [];

  const lowerTopic = (topic || '').toLowerCase();

  // Clinical domain heuristics for rich MeSH & synonyms
  if (/sglt2|gliflozin|dapagliflozin|empagliflozin/i.test(lowerTopic)) {
    synonyms.push('sodium-glucose cotransporter 2 inhibitors', 'SGLT2i', 'flozins', 'cardiorenal protection');
    meshConcepts.push('Sodium-Glucose Transporter 2 Inhibitors', 'Heart Failure Diastolic', 'Cardiovascular Diseases');
  }
  if (/heart failure|hfpEF|hfref|cardiac/i.test(lowerTopic)) {
    synonyms.push('preserved ejection fraction', 'diastolic heart failure', 'ventricular dysfunction', 'cardiovascular mortality');
    meshConcepts.push('Heart Failure', 'Stroke Volume', 'Ventricular Function Left');
  }
  if (/glp-1|semaglutide|tirzepatide|liraglutide|incretin/i.test(lowerTopic)) {
    synonyms.push('glucagon-like peptide-1 receptor agonists', 'GLP-1 RA', 'incretin mimetics', 'weight loss therapy');
    meshConcepts.push('Glucagon-Like Peptide-1 Receptor Agonists', 'Obesity therapy', 'Metabolic Syndrome');
  }
  if (/liver|masld|nafld|steato/i.test(lowerTopic)) {
    synonyms.push('metabolic dysfunction-associated steatohepatitis', 'MASH', 'hepatic steatosis', 'liver fibrosis');
    meshConcepts.push('Non-alcoholic Fatty Liver Disease', 'Liver Cirrhosis');
  }
  if (/endometriosis|fertility|ovarian/i.test(lowerTopic)) {
    synonyms.push('endometrioma', 'assisted reproductive technology', 'ovarian reserve', 'pelvic pain', 'laparoscopy');
    meshConcepts.push('Endometriosis', 'Fertility Preservation', 'Infertility Female');
  }
  if (/car-t|immunotherapy|lymphoma|myeloma|chimeric/i.test(lowerTopic)) {
    synonyms.push('chimeric antigen receptor T-cell', 'adoptive cell transfer', 'cytokine release syndrome', 'cellular immunotherapy');
    meshConcepts.push('Receptors Chimeric Antigen', 'Immunotherapy Adoptive', 'Hematologic Neoplasms');
  }

  // Fallback synonyms and MeSH if no domain match
  if (synonyms.length === 0) {
    primaryKeywords.forEach(k => {
      synonyms.push(`${k} therapy`, `${k} clinical outcomes`, `${k} efficacy`);
    });
    meshConcepts.push('Randomized Controlled Trials as Topic', 'Treatment Outcome', 'Humans');
  }

  return {
    topic: topic || '',
    primaryKeywords: Array.from(new Set(primaryKeywords.map(sanitizeTerm).filter(Boolean))),
    synonyms: Array.from(new Set(synonyms.map(sanitizeTerm).filter(Boolean))),
    meshConcepts: Array.from(new Set(meshConcepts.map(sanitizeTerm).filter(Boolean)))
  };
}

/**
 * Builds separate search strategy strings for Europe PMC and Semantic Scholar.
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

  const pTerms = cleanArr(pKw);
  const sTerms = cleanArr(syn);
  const mTerms = cleanArr(mesh);

  const quoteTerm = t => (t.includes(' ') ? `"${t}"` : t);

  // PMC Solr Query:
  // Build clean boolean query without invalid NCBI [MeSH Terms] or SRC tags
  const primaryClause = pTerms.length > 0 
    ? pTerms.slice(0, 4).map(quoteTerm).join(' OR ')
    : quoteTerm(topic || 'biomedical');

  const secondaryTerms = [...sTerms, ...mTerms].slice(0, 5).map(quoteTerm);

  let pmcQuery = '';
  if (secondaryTerms.length > 0) {
    pmcQuery = `(${primaryClause}) AND (${secondaryTerms.join(' OR ')}) AND (PUB_YEAR:[${yearFrom} TO ${currentYear}])`;
  } else {
    pmcQuery = `(${primaryClause}) AND (PUB_YEAR:[${yearFrom} TO ${currentYear}])`;
  }

  // Semantic Scholar Query:
  const allTerms = [...pTerms, ...sTerms];
  const s2Query = (allTerms.length > 0 ? allTerms.slice(0, 4).join(' ') : topic).replace(/[^\w\s-]/g, ' ').replace(/\s+/g, ' ').trim();
  const s2YearFilter = `${yearFrom}-${currentYear}`;

  return {
    topic,
    startYear: yearFrom,
    currentYear,
    pmc: {
      engine: 'Europe PMC / PubMed Central',
      query: pmcQuery,
      filters: `PUB_YEAR:[${yearFrom} TO ${currentYear}]`,
      endpoint: 'https://www.ebi.ac.uk/europepmc/webservices/rest/search'
    },
    semanticScholar: {
      engine: 'Semantic Scholar Academic Graph',
      query: s2Query || topic,
      yearFilter: s2YearFilter,
      fields: 'paperId,title,authors,year,abstract,venue,publicationVenue,journal,externalIds,openAccessPdf,citationCount,publicationTypes,fieldsOfStudy',
      endpoint: 'https://api.semanticscholar.org/graph/v1/paper/search'
    }
  };
}

module.exports = {
  proposeKeywords,
  buildSearchStrategy
};
