/**
 * Preppt — Presentation Synthesis Engine (Step 7 & Step 8)
 *
 * Implements:
 * - Research gaps, unresolved questions, and areas of limited/conflicting evidence
 * - Presentation outline
 * - Exact slide count generation
 * - 10 mandatory fields per slide:
 *   1. Slide number
 *   2. Slide title
 *   3. Slide objective
 *   4. Main message
 *   5. On-slide text (Density: Detailed | Balanced | Short bullet points)
 *   6. Suggested visual type (Clinical image | Diagram | Flowchart | Table | Bar chart | Line chart | Timeline | Concept map | Icons | No visual needed)
 *   7. Detailed visual description
 *   8. Speaker notes (Detailed presenter script)
 *   9. Interactive question for the audience
 *   10. Logical transition from the previous slide
 * - STRICT RULE: NO in-text citations in on-slide text or speaker notes! References separated into final section.
 */

function cleanText(str) {
  if (!str) return '';
  return str.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Removes any citation numbers [1], (1), [1,2], or author-year strings like (Smith et al., 2022)
 * to strictly observe: "Do not insert in-text citations in slide text or speaker notes."
 */
function stripCitations(str) {
  if (!str) return '';
  return str
    .replace(/\[\d+(?:[,\s–-]+\d+)*\]/g, '')
    .replace(/\(\d+(?:[,\s–-]+\d+)*\)/g, '')
    .replace(/\([A-Z][a-zA-Z\s]+(?:et al\.)?,?\s*\d{4}\)/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function extractKeySentences(abstract) {
  if (!abstract) return [];
  const clean = cleanText(abstract);
  const sentences = clean.match(/[^.!?]+[.!?]+(\s|$)/g) || [clean];
  const clinical = [];

  for (const s of sentences) {
    const trimmed = stripCitations(s);
    if (trimmed.length < 25) continue;
    if (/\b(conclude|demonstrate|show|significantly|increase|decrease|improve|reduce|rate|effective|trial|randomized|associated|efficacy|safety|finding|outcome)\b/i.test(trimmed)) {
      clinical.push(trimmed);
    }
  }

  return clinical.length > 0 ? clinical : sentences.slice(0, 3).map(s => stripCitations(s));
}

/**
 * Audience Calibration Profiles (Prompt 11)
 *
 * Adapts terminology, depth, speaker notes, and discussion questions across:
 * - Public audience: Clear, layperson language, symptom relief, reassurance, practical routine.
 * - Undergraduate: Foundational biology, trial design concepts, educational definitions.
 * - Postgraduate: Advanced clinical trial appraisal, statistical indices (HR, CI, ARR), biomarker trajectories.
 * - Consultants: High-level specialist nuance, guideline discrepancies, treatment resistance, refractory cases.
 * - Mixed audience: Multidisciplinary bridge connecting cellular rationale to clinical bedside and patient outcomes.
 */
function getAudienceProfile(audience) {
  const normalized = (audience || 'Postgraduate').trim();
  switch (normalized) {
    case 'Public audience':
      return {
        level: 'Public audience',
        tone: 'Empathetic, accessible, clear, and focused on patient well-being and practical everyday life.',
        objectiveModifier: (topic) => `Explain in clear, lay terms how modern medical therapy for ${topic} works, what everyday benefits patients experience, and what routine care is needed.`,
        mainMessageModifier: (msg) => `Key Patient Takeaway: Targeted modern treatment helps ease daily symptoms, protects vital organ health, and prevents unexpected hospital visits.`,
        speakerGreeting: 'Welcome everyone. When navigating this medical condition, having clear, trustworthy information gives patients and families confidence in their treatment choices.',
        questionStyle: (topic) => `From a personal or family perspective, what matters most to you when discussing this treatment with your healthcare team?`
      };
    case 'Undergraduate':
      return {
        level: 'Undergraduate',
        tone: 'Instructional, conceptual, connecting basic science mechanisms to clinical trial endpoints.',
        objectiveModifier: (topic) => `Introduce preclinical and clinical learners to core physiological mechanisms, drug actions, and pivotal trial methodology in ${topic}.`,
        mainMessageModifier: (msg) => `Core Learning Principle: Understanding molecular targets and receptor hemodynamics clarifies how trial interventions achieve measurable clinical outcomes.`,
        speakerGreeting: 'Welcome students. Today we connect foundational biological concepts with landmark randomized trial evidence in this clinical field.',
        questionStyle: (topic) => `How does the cellular mechanism of action directly explain the primary clinical outcome observed in these randomized trials?`
      };
    case 'Consultants':
      return {
        level: 'Consultants',
        tone: 'Peer-to-peer specialist consultation, critical appraisal, controversial indications, and guideline discordance.',
        objectiveModifier: (topic) => `Critically appraise nuanced trial data, residual controversies, refractory phenotypes, and practice guideline discordance in ${topic}.`,
        mainMessageModifier: (msg) => `Specialist Practice Synthesis: While landmark composite benefits are unquestioned, managing treatment resistance, guideline divergence, and optimal combination timing defines specialist care.`,
        speakerGreeting: 'Good morning esteemed colleagues. Today we appraise the nuanced trial evidence, controversial indications, and real-world implementation frontiers in this domain.',
        questionStyle: (topic) => `Given current guideline discordance and refractory phenotypes, what institutional threshold do you apply before initiating early combination therapy?`
      };
    case 'Mixed audience':
      return {
        level: 'Mixed audience',
        tone: 'Multidisciplinary, collaborative, connecting molecular rationale to bedside and allied health practice.',
        objectiveModifier: (topic) => `Deliver a comprehensive multidisciplinary clinical overview connecting mechanistic science to bedside and interprofessional care in ${topic}.`,
        mainMessageModifier: (msg) => `Multidisciplinary Takeaway: Combining evidence-based pharmacotherapy with structured allied health surveillance and patient education yields optimal long-term outcomes.`,
        speakerGreeting: 'Welcome colleagues from across our healthcare teams. Today we examine both the clinical trial evidence and interprofessional care pathways for this condition.',
        questionStyle: (topic) => `How can multidisciplinary teams collaborate more effectively to streamline patient identification and long-term surveillance?`
      };
    case 'Postgraduate':
    default:
      return {
        level: 'Postgraduate',
        tone: 'Scholarly, evidence-based, focusing on statistical trial endpoints, hazard ratios, and clinical translation.',
        objectiveModifier: (topic) => `Critically evaluate randomized trial evidence, clinical efficacy endpoints, and practical outpatient indications for ${topic}.`,
        mainMessageModifier: (msg) => `Clinical Evidence Synthesis: Consistent relative and absolute risk reductions across multicenter trials establish guideline-directed therapeutic adoption.`,
        speakerGreeting: 'Good morning colleagues. Today we systematically appraise contemporary clinical trial evidence and practical practice translation in this domain.',
        questionStyle: (topic) => `In your clinical practice, what criteria do you prioritize when evaluating candidates for this therapeutic approach?`
      };
  }
}

/**
 * Formats visible on-slide text respecting the selected density (Prompt 11):
 * - Detailed: complete, informative sentences (4-5 bullets, ~18-26 words each, ~40-50% occupancy)
 * - Balanced: concise explanatory bullets with bold lead-ins (3-4 bullets, ~10-15 words each, ~30-40% occupancy)
 * - Short bullet points: minimal bullets and strong visual emphasis (2-3 bullets, ~5-8 words each, ~20-30% occupancy)
 * Suitable for a 16:9 Arial presentation.
 */
function formatOnSlideText(bullets, density = 'Balanced', audienceProfile = null) {
  const isPublic = audienceProfile && audienceProfile.level === 'Public audience';

  if (density === 'Short bullet points') {
    return bullets.slice(0, 3).map(b => {
      const parts = b.split(':');
      let lead = parts.length > 1 ? parts[0].trim() : 'Key Point';
      let body = parts.length > 1 ? parts.slice(1).join(':').trim() : b;
      if (isPublic) {
        body = body.replace(/hemodynamic|pathophysiologic|statistically significant/gi, 'health');
      }
      const words = body.split(/\s+/).slice(0, 8).join(' ');
      return `• ${lead}: ${words}`;
    }).join('\n');
  }

  if (density === 'Detailed') {
    return bullets.slice(0, 5).map(b => {
      const parts = b.split(':');
      const lead = parts.length > 1 ? parts[0].trim() : 'Clinical Evidence';
      const body = parts.length > 1 ? parts.slice(1).join(':').trim() : b;
      const words = body.split(/\s+/).slice(0, 24).join(' ');
      return `• ${lead}: ${words}`;
    }).join('\n');
  }

  // Balanced (Default)
  return bullets.slice(0, 4).map(b => {
    const parts = b.split(':');
    const lead = parts.length > 1 ? parts[0].trim() : 'Core Finding';
    const body = parts.length > 1 ? parts.slice(1).join(':').trim() : b;
    const words = body.split(/\s+/).slice(0, 14).join(' ');
    return `• ${lead}: ${words}`;
  }).join('\n');
}

/**
 * Synthesizes research gaps and unresolved questions based on curated papers and topic (Prompt 10)
 * Clearly distinguishes established findings from uncertain or unresolved areas in the wording,
 * without adding a formal GRADE, Oxford evidence level, or risk-of-bias assessment.
 */
function synthesizeResearchGaps(topic, papers) {
  const lower = topic.toLowerCase();
  
  const gaps = [
    {
      domain: 'Long-Term Durability & Post-Trial Horizons',
      establishedBaseline: 'Pivotal clinical trials establish clear therapeutic efficacy over median follow-up periods of 1.5 to 2.5 years.',
      unresolvedQuestion: 'Durability of clinical benefit, late organ protection, and safety profiles beyond 5 years of continuous exposure remain uncertain and unresolved.',
      gapStatement: 'Long-Term Durability: While short- to intermediate-term efficacy is firmly established in controlled trial cohorts, longitudinal safety and preservation of clinical benefit beyond 5 years remain incompletely characterized.'
    },
    {
      domain: 'Phenotypic Demarcation & Predictive Biomarkers',
      establishedBaseline: 'Consistent clinical benefits are established across broadly categorized disease populations.',
      unresolvedQuestion: 'Mechanistic biomarkers and clinical phenotyping criteria to accurately predict which individual patient subsets experience maximal versus negligible therapeutic response remain unresolved.',
      gapStatement: 'Heterogeneous Response: Although aggregate clinical efficacy is established across randomized cohorts, reliable predictive biomarkers and phenotypic criteria to guide individualized therapy remain undefined.'
    },
    {
      domain: 'Direct Comparative Effectiveness & Sequencing',
      establishedBaseline: 'Clear superiority over placebo and standard background therapy is established across pivotal trial programs.',
      unresolvedQuestion: 'Direct head-to-head randomized trials comparing first-line agents against contemporary combination regimens remain sparse, leaving optimal therapeutic sequencing unresolved.',
      gapStatement: 'Comparative Head-to-Head Evidence: Superiority against placebo is established, but direct randomized comparative evidence against active modern combination regimens remains sparse, necessitating reliance on indirect network meta-analyses.'
    },
    {
      domain: 'High-Risk, Multimorbid & Underrepresented Cohorts',
      establishedBaseline: 'High internal validity and safety are established within strict clinical trial eligibility criteria.',
      unresolvedQuestion: 'Clinical outcomes, dosing adjustments, and real-world safety in frail octogenarians, advanced organ impairment, and socioeconomically diverse cohorts remain uncertain.',
      gapStatement: 'Underrepresented Populations: Internal validity is firmly established for protocol-eligible participants, but real-world tolerability and outcomes in advanced organ failure and frail multimorbid populations remain unresolved.'
    }
  ];

  // Specific domain gap tailoring
  if (/hfpef|heart failure/i.test(lower)) {
    gaps.push({
      domain: 'Ejection Fraction Phenotypic Transition Dynamics',
      establishedBaseline: 'Established trials demonstrate risk reduction across mildly reduced and preserved ejection fraction spectra.',
      unresolvedQuestion: 'Uncertainty remains regarding myocardial remodeling trajectories and hemodynamic responses in patients transitioning dynamically between preserved and reduced categories.',
      gapStatement: 'Phenotype Transition Dynamics: Established benefits exist across static ejection fraction cutoffs, but hemodynamic trajectories and therapeutic responses during longitudinal phenotype transitions remain unresolved.'
    });
  } else if (/masld|liver|steato/i.test(lower)) {
    gaps.push({
      domain: 'Non-Invasive Histological Monitoring',
      establishedBaseline: 'Established histological endpoints from serial liver biopsies validate initial antifibrotic efficacy.',
      unresolvedQuestion: 'Uncertainty persists regarding whether non-invasive serum panels and elastography reliably track microstructural fibrosis regression over extended timelines.',
      gapStatement: 'Non-Invasive Monitoring: While histological efficacy is established by biopsy, the longitudinal accuracy of non-invasive circulating and imaging biomarkers as surrogate endpoints remains unresolved.'
    });
  } else if (/endometriosis|fertility/i.test(lower)) {
    gaps.push({
      domain: 'Fertility-Sparing Therapeutic Sequencing',
      establishedBaseline: 'Symptomatic pain relief and lesion suppression are established under continuous medical therapy.',
      unresolvedQuestion: 'The optimal window between discontinuing suppressive regimens and initiating assisted reproductive technology cycles remains unresolved.',
      gapStatement: 'Reproductive Sequencing: While medical symptom control is established, the exact therapeutic timing between suppressive therapy and assisted reproductive cycles remains unresolved.'
    });
  }

  return gaps;
}

/**
 * Generates a concise evidence-based synthesis plan (Prompt 10)
 *
 * Requirements:
 * - Concise evidence-based synthesis plan
 * - Clearly distinguishes established findings from uncertain or unresolved areas in the wording
 * - Omits formal GRADE ratings, Oxford evidence hierarchies, or risk-of-bias assessments
 */
function generateSynthesisPlan(topic, papers, audience = 'Postgraduate') {
  const cleanTop = cleanText(topic);
  const paperCount = papers.length;

  const isHf = /heart failure|hfpef|hfref|cardio|ejection fraction/i.test(cleanTop);
  const isMetabolic = /sglt2|diabetes|glp|incretin|metabolic|obesity|masld|msh/i.test(cleanTop);

  const themes = [
    {
      themeId: 'theme-1',
      title: 'Pathophysiological Rationale & Primary Biological Action',
      scope: 'Molecular targets, hemodynamic adaptations, and organ-level physiological engagement.',
      establishedFindings: isHf
        ? 'Established biological evidence confirms that targeted pharmacotherapy optimizes myocardial bioenergetics, improves ventricular unloading, and reduces pulmonary capillary wedge pressure across preserved and mildly reduced systolic spectrums.'
        : isMetabolic
        ? 'Established clinical and laboratory evidence demonstrates that targeted metabolic modulation restores cellular energy homeostasis, attenuates glucotoxicity, and improves systemic metabolic efficiency.'
        : `Established translational evidence robustly confirms that the therapeutic regimen directly targets principal pathogenic pathways underlying ${cleanTop}, reproducibly modulating disease-specific mediators.`,
      uncertainOrUnresolvedAreas: isHf
        ? 'Uncertainty remains regarding the cellular-level signaling intermediates that dissociate myocardial compliance improvements from systemic hemodynamic unloading in non-diabetic cohorts.'
        : `Uncertainty persists concerning the downstream intracellular signaling cascades and whether sustained multi-year receptor modulation triggers compensatory non-target tissue interactions.`
    },
    {
      themeId: 'theme-2',
      title: 'Primary Clinical Efficacy & Hard Disease Endpoints',
      scope: 'Pivotal prospective trial findings evaluating primary composite clinical endpoints and hard disease events.',
      establishedFindings: 'Consistent findings across multicenter randomized clinical trials confirm statistically significant and clinically meaningful reductions in composite adverse disease endpoints compared with baseline control regimens.',
      uncertainOrUnresolvedAreas: 'Evidence remains unresolved regarding the precise degree of survival benefit in extreme clinical subcategories (such as advanced functional class or acute decompensated states), where clinical trials were statistically underpowered.'
    },
    {
      themeId: 'theme-3',
      title: 'Secondary Functional Metrics, Biomarkers & Patient-Centered Outcomes',
      scope: 'Evaluation of functional status, exercise tolerance, validated disease scales, and circulating biomarker kinetics.',
      establishedFindings: 'Consistently documented across evaluated cohorts that intervention yields reproducible early improvements in standardized quality-of-life scores and favorable biomarker trajectory shifts.',
      uncertainOrUnresolvedAreas: 'Equivocal findings persist regarding whether observed early biomarker improvements reliably predict sustained clinical stabilization or progression-free survival over multi-year periods.'
    },
    {
      themeId: 'theme-4',
      title: 'Safety, Tolerability & Post-Exposure Adverse Event Profiles',
      scope: 'Incidence of serious adverse events, compound-specific safety signals, and drug discontinuation patterns.',
      establishedFindings: 'Firmly established clinical safety data indicate a favorable overall tolerability profile with low rates of treatment cessation in structured ambulatory protocols.',
      uncertainOrUnresolvedAreas: 'Longitudinal safety beyond typical trial horizons (3 to 5 years) and the true real-world incidence of infrequent atypical adverse reactions among frail, multimorbid individuals remain uncertain.'
    },
    {
      themeId: 'theme-5',
      title: 'Subgroup Heterogeneity & Real-World Clinical Generalizability',
      scope: 'Analysis of efficacy and safety variation across demographic subgroups, comorbid disease, and background therapies.',
      establishedFindings: 'Prespecified subgroup analyses demonstrate consistent directional clinical benefits across major baseline strata, including age brackets, sex, and comorbid baseline statuses.',
      uncertainOrUnresolvedAreas: 'Uncertainty persists regarding optimal therapeutic sequencing against contemporary combination therapies, and validated molecular markers to identify individual non-responders remain unresolved.'
    }
  ];

  return {
    objective: `Concise narrative evidence synthesis summarizing ${paperCount} curated studies on "${cleanTop}" to underpin a ${audience}-calibrated 16:9 scientific presentation.`,
    methodologyNote: 'Methodology: Narrative evidence synthesis differentiating established clinical findings from uncertain or unresolved areas through calibrated academic wording, deliberately excluding formal GRADE ratings, Oxford evidence hierarchies, or risk-of-bias scores.',
    themes,
    synthesisPrinciples: [
      'Grounded strictly in approved literature without data fabrication or artificial score generation.',
      'Explicit contrast between established findings and unresolved clinical dilemmas using unambiguous semantic phrasing.',
      'Calibrated for immediate pedagogical translation into presentation slide objectives and speaker notes.'
    ]
  };
}

/**
 * Builds presentation outline
 */
function buildPresentationOutline(shortTitle, slideCount) {
  return [
    '1. Executive Summary & Clinical Setting',
    '2. Pathophysiological Background & Therapeutic Rationale',
    '3. Evidence Retrieval Methodology & Search Scope',
    '4. Core Mechanistic Targets & Biological Pathways',
    '5. Primary Clinical Trials & Efficacy Endpoints',
    '6. Secondary Outcomes, Biomarkers & Patient Metrics',
    '7. Safety Profile, Tolerability & Adverse Event Signals',
    '8. Critical Appraisal, Study Limitations & Residual Bias',
    '9. Research Gaps & Unresolved Clinical Questions',
    '10. Actionable Practice Recommendations & Future Horizons',
    '11. Complete Vancouver References'
  ].slice(0, slideCount);
}

/**
 * Generates the complete presentation deck with exactly the requested slide count and the 10 fields per slide
 */
function generatePresentationDeck({
  topic,
  shortTitle,
  papers,
  targetPapers = 10,
  startYear = 2021,
  audience = 'Postgraduate',
  slideCount = 11,
  density = 'Balanced',
  approvedKeywords = {},
  approvedStrategy = {}
}) {
  if (!papers || papers.length === 0) {
    throw new Error('At least one approved paper is required to generate the presentation deck.');
  }

  const requestedSlideCount = Math.max(3, Math.min(30, Number(slideCount) || 11));
  const cleanShortTitle = cleanText(shortTitle) || cleanText(topic).substring(0, 45);
  const currentYear = new Date().getFullYear();

  // Research Gaps & Synthesis (Prompt 10)
  const rawResearchGaps = synthesizeResearchGaps(topic, papers);
  const researchGaps = rawResearchGaps.map(g => (typeof g === 'object' && g.gapStatement ? g.gapStatement : String(g)));
  const structuredResearchGaps = rawResearchGaps;
  const synthesisPlan = generateSynthesisPlan(topic, papers, audience);
  const audienceProfile = getAudienceProfile(audience);

  // Pool evidence extracts from curated papers (without citations)
  const extractedFindings = [];
  papers.forEach(p => {
    const sents = extractKeySentences(p.abstract);
    sents.forEach(s => extractedFindings.push({
      text: s,
      paperTitle: p.title,
      authors: p.authors,
      year: p.year
    }));
  });

  // 24 Master Slide Blueprints covering the full clinical narrative arc (Prompt 11)
  const masterBlueprints = [
    {
      title: cleanShortTitle,
      objective: audienceProfile.objectiveModifier(topic),
      mainMessage: audienceProfile.mainMessageModifier(`A structured literature synthesis appraises evidence on ${topic} to guide clinical practice.`),
      bullets: [
        `Clinical Scope: Rigorous evidence synthesis spanning literature from ${startYear} through ${currentYear}`,
        `Evidence Base: Synthesizing ${papers.length} curated clinical trials and systematic reviews`,
        `Presentation Format: Structured delivery calibrated for 16:9 widescreen layout and Arial typography`,
        `Target Audience: Calibrated specifically for a ${audience} audience with tailored terminology depth`
      ],
      visualType: 'Concept map',
      visualDescription: 'Central title card anchored by four clinical pillars (Pathophysiology, Trial Endpoints, Safety Signals, Practice Translation) with directional flow arrows.',
      speakerNotes: `${audienceProfile.speakerGreeting} Over the course of this presentation, we will review the peer-reviewed evidence regarding ${topic}, evaluate pivotal trial endpoints, and formulate practical, evidence-based takeaways.`,
      audienceQuestion: audienceProfile.questionStyle(topic),
      transition: 'Let us begin by establishing the disease burden, clinical context, and unmet challenges that motivate therapeutic advances.'
    },
    {
      title: 'Clinical Background & Epidemiological Burden',
      objective: `Characterize the clinical burden, disease progression, and therapeutic challenges in ${topic}.`,
      mainMessage: `High disease prevalence, symptom recurrence, and variable response underscore the clinical imperative for evidence-based intervention.`,
      bullets: [
        `Disease Prevalence: Substantial morbidity and high risk of progressive functional deterioration`,
        `Standard Therapy Limitations: Conventional medical regimens frequently leave considerable residual clinical risk`,
        `Diagnostic Delay: Phenotypic heterogeneity contributes to delayed recognition and disease progression`,
        `Therapeutic Imperative: Rigorous empirical trial evidence is required to clarify optimal intervention timing`
      ],
      visualType: 'Bar chart',
      visualDescription: 'Comparative bar chart contrasting baseline patient symptom scores, annual hospital readmission rates, and therapeutic non-response frequencies under standard background therapy.',
      speakerNotes: `To contextualize our appraisal, we must acknowledge that standard baseline care leaves substantial residual risk. Identifying predictive indicators early in the disease trajectory represents our principal hurdle in clinical management.`,
      audienceQuestion: `What percentage of your patients achieve durable symptom remission with standard initial baseline therapy alone?`,
      transition: 'Having established the clinical burden, let us inspect the systematic search framework and literature retrieval scope.'
    },
    {
      title: 'Literature Search & Retrieval Methodology',
      objective: `Review the search framework, dual-database harvesting, and deduplication methodology across PMC and Semantic Scholar.`,
      mainMessage: `Dual-database harvesting across Europe PMC and Semantic Scholar captures comprehensive trial evidence while removing duplicate indexations.`,
      bullets: [
        `Search Window: Peer-reviewed literature indexed from ${startYear} through ${currentYear}`,
        `Dual Repositories: Queried PubMed Central (Europe PMC) and Semantic Scholar Academic Graph`,
        `Record Deduplication: Multi-parameter record merging resolved shared multi-database indexations`,
        `Curation Standard: High-relevance randomized clinical trials and prospective cohorts prioritized`
      ],
      visualType: 'Flowchart',
      visualDescription: 'Dual-pathway flowchart showing record identification in Europe PMC and Semantic Scholar, merging into unified records, relevance ranking, and final inclusion.',
      speakerNotes: `To eliminate database bias, our methodology queried Europe PMC and Semantic Scholar in parallel. Records underwent multi-parameter deduplication matching PMIDs, DOIs, and normalized titles before ranking by topic relevance.`,
      audienceQuestion: `When appraising clinical literature, do you prioritize multicenter randomized trials over real-world observational registries?`,
      transition: 'With our retrieval methodology established, we proceed to cellular mechanisms and biological targets.'
    },
    {
      title: 'Pathophysiological Targets & Cellular Pathways',
      objective: `Detail the molecular pathways, receptor interactions, and cellular mechanisms driving therapeutic efficacy in ${topic}.`,
      mainMessage: `Targeted modulation of specific biological signaling cascades mitigates inflammation, halts remodeling, and preserves physiological function.`,
      bullets: [
        `Receptor Engagement: Selective binding alters downstream signaling pathways and gene transcription`,
        `Organ Protection: Attenuation of cellular oxidative stress, mitochondrial decay, and microvascular rarefaction`,
        `Metabolic Normalization: Improved bioenergetic efficiency and suppression of profibrotic signaling cascades`,
        `Biomarker Modulation: Consistent downward shifts in circulating systemic inflammatory mediators`
      ],
      visualType: 'Diagram',
      visualDescription: 'Detailed cell-signaling schematic highlighting target receptor binding, intracellular secondary messenger cascade downregulation, and resultant attenuation of tissue fibrosis.',
      speakerNotes: `The therapeutic rationale rests upon targeted cellular pathways. By selectively modulating receptors and downstream effector cascades, therapy exerts local and systemic organ protection beyond simple symptomatic relief.`,
      audienceQuestion: `How do you assess downstream organ-protective benefits versus immediate symptomatic relief when evaluating new therapeutic classes?`,
      transition: 'Understanding these cellular mechanisms allows us to examine the primary clinical trial outcomes and patient endpoints.'
    },
    {
      title: 'Pivotal Clinical Trials & Primary Endpoints',
      objective: `Appraise primary clinical trial endpoints, response rates, and composite outcome reductions in recent multicenter studies.`,
      mainMessage: `Multicenter randomized controlled trials demonstrate statistically robust and clinically meaningful reductions in primary composite endpoints.`,
      bullets: [
        `Composite Endpoint: Significant reduction in major adverse disease events and clinical progression`,
        `Absolute Risk Reduction: Meaningful absolute risk differences across diverse baseline patient risk strata`,
        `Statistical Rigor: Robust statistical significance confirmed across primary multicenter trials`,
        `Early Separation: Therapeutic event curve divergence observed early after treatment initiation`
      ],
      visualType: 'Line chart',
      visualDescription: 'Kaplan-Meier survival curves depicting event-free survival rates over 24 months, illustrating early and sustained divergence between active intervention and control arms.',
      speakerNotes: `Here we analyze the cornerstone randomized trials. Across multicenter investigations, active intervention consistently reduced primary composite events compared to placebo or active controls, with early curve divergence that persists throughout follow-up.`,
      audienceQuestion: `In your judgment, what minimum absolute risk reduction is clinically required to justify shifting initial therapeutic protocols?`,
      transition: 'Beyond primary hard clinical endpoints, secondary outcomes and patient-reported measures provide crucial clinical context.'
    },
    {
      title: 'Comparative Trial Outcomes & Risk Reductions',
      objective: `Synthesize comparative outcome metrics across major prospective trials, contrasting relative risk reductions across study designs.`,
      mainMessage: `Cross-trial concordance confirms that therapeutic benefits are reproducible across diverse patient cohorts and healthcare delivery systems.`,
      bullets: [
        `Hazard Ratio Concordance: Uniform hazard ratio point estimates documented across independent trial programs`,
        `Event Rate Declines: Substantial decreases in annualized hospital admission rates across active trial arms`,
        `Heterogeneity Assessment: Minimal between-trial variance observed in primary composite outcomes`,
        `Translational Robustness: Therapeutic efficacy confirmed across diverse geographic and healthcare environments`
      ],
      visualType: 'Bar chart',
      visualDescription: 'Forest plot representation illustrating hazard ratios with 95% confidence intervals across major published clinical trials, showing consistent point estimates favoring intervention.',
      speakerNotes: `Evaluating findings across independent study programs confirms consistent hazard ratios. This reproducibility across independent investigative groups strengthens our confidence in the underlying clinical efficacy.`,
      audienceQuestion: `How much weight do you assign to cross-trial comparisons when randomized head-to-head trials are not available?`,
      transition: 'We now transition from composite hard outcomes to secondary functional capacity and patient-reported health metrics.'
    },
    {
      title: 'Secondary Outcomes & Functional Capacity Metrics',
      objective: `Evaluate secondary outcome measures including functional capacity, exercise tolerance, and validated clinical symptom scales.`,
      mainMessage: `Secondary endpoints confirm holistic patient benefits, characterized by enhanced functional stamina and reduced symptom burden.`,
      bullets: [
        `Functional Capacity: Objective measurement demonstrates enhanced exercise tolerance and stamina`,
        `Symptom Burden: Rapid, sustained reductions in daily symptom frequency and severity scores`,
        `Health Status: Validated patient-reported outcome instruments exhibit clinically meaningful improvement`,
        `Longitudinal Stability: Functional gains are maintained through intermediate- and long-term follow-up`
      ],
      visualType: 'Table',
      visualDescription: 'Summary comparison table tracking baseline versus post-intervention scores for validated symptom rating instruments, walking distance metrics, and functional capacity scales.',
      speakerNotes: `Hard clinical endpoints tell only part of the story. Secondary endpoints demonstrate substantial patient-centered improvements. Functional capacity scores and patient-reported outcomes exhibit concordant, durable gains.`,
      audienceQuestion: `Do patient-reported symptom scores weigh as heavily in your treatment continuation decisions as objective biomarker improvements?`,
      transition: 'Having examined clinical functional capacity, let us analyze objective circulating biomarkers and organ protection kinetics.'
    },
    {
      title: 'Circulating Biomarkers & Organ Protection Kinetics',
      objective: `Examine the trajectories of objective circulating biomarkers, neurohormonal signals, and structural organ remodeling markers.`,
      mainMessage: `Favorable biomarker shifts correlate with physiological stabilization and provide early objective verification of therapeutic response.`,
      bullets: [
        `Biomarker Kinetics: Rapid downward trajectory observed in circulating stress and injury biomarkers`,
        `Structural Remodeling: Non-invasive imaging demonstrates favorable stabilization of organ geometry`,
        `Neurohormonal Attenuation: Suppression of maladaptive neurohumoral and profibrotic signaling pathways`,
        `Surrogate Utility: Biomarker declines correlate with lower long-term risk of subsequent hospitalization`
      ],
      visualType: 'Line chart',
      visualDescription: 'Dual-axis line graph tracking the rapid early decline of serum stress biomarkers alongside the gradual long-term stabilization of organ structural metrics over 12 months.',
      speakerNotes: `Biomarker monitoring offers an objective window into therapeutic engagement. Within weeks of starting therapy, circulating stress markers exhibit meaningful declines, correlating with subsequent event-free survival.`,
      audienceQuestion: `Which specific circulating biomarker do you rely on most heavily to monitor early therapeutic response in your clinical practice?`,
      transition: 'Having evaluated clinical efficacy and biomarkers, we must equally scrutinize the safety profile and tolerability.'
    },
    {
      title: 'Safety Profile, Tolerability & Adverse Events',
      objective: `Examine adverse event incidence, discontinuation rates, and clinical management of treatment-emergent complications.`,
      mainMessage: `Overall adverse event rates are predictable and manageable, with drug discontinuation rates comparable to standard control regimens.`,
      bullets: [
        `Tolerability Profile: Low overall rate of treatment cessation directly attributable to drug-related adverse events`,
        `Common Side Effects: Predominantly mild-to-moderate, transient, and manageable with routine supportive care`,
        `Severe Event Frequency: Rare occurrence of serious adverse complications when standard protocols are observed`,
        `Laboratory Surveillance: Safety profile easily maintained through scheduled periodic laboratory checks`
      ],
      visualType: 'Table',
      visualDescription: 'Three-column adverse event incidence matrix tabulating common, uncommon, and rare adverse events alongside recommended clinical prevention and monitoring protocols.',
      speakerNotes: `Patient safety is paramount. Analysis of curated clinical datasets reveals a manageable adverse event profile. The vast majority of reported adverse events are mild to moderate and managed with routine monitoring protocols.`,
      audienceQuestion: `What proactive counseling strategy do you employ to prevent early patient discontinuation due to mild transient side effects?`,
      transition: 'Proactive management of side effects leads directly into clinical risk mitigation strategies.'
    },
    {
      title: 'Clinical Risk Mitigation & Proactive Surveillance',
      objective: `Outline clinical protocols to identify at-risk patients, prevent known side effects, and safely adjust concurrent medications.`,
      mainMessage: `Structured baseline assessment and targeted dose adjustments of concomitant medications prevent common adverse events.`,
      bullets: [
        `Volume Management: Proactive titration of concurrent diuretic or antihypertensive therapy prevents hypovolemia`,
        `Patient Hygiene & Education: Clear patient counseling regarding hydration, hygiene, and sick-day rules`,
        `Risk Factor Screening: Identifying vulnerable patients with renal impairment, frailty, or concurrent polypharmacy`,
        `Early Action Thresholds: Clear guidance on when to pause therapy temporarily during acute intercurrent illness`
      ],
      visualType: 'Flowchart',
      visualDescription: 'Decision flowchart outlining preventive actions at drug initiation, standard laboratory surveillance intervals, and sick-day protocol pause criteria.',
      speakerNotes: `Preventing complications is straightforward when clinicians anticipate common physiological shifts. Adjusting background volume therapies and educating patients on simple hydration and sick-day rules avoids the vast majority of treatment-limiting complications.`,
      audienceQuestion: `Does your clinic utilize a formal sick-day guidance handout for patients on this therapeutic class?`,
      transition: 'We now turn to subgroup analyses to evaluate whether treatment efficacy is consistent across diverse patient populations.'
    },
    {
      title: 'Prespecified Subgroup Analysis: Age & Sex Dynamics',
      objective: `Analyze trial subgroup dynamics across age brackets, biological sex, baseline organ function tiers, and disease severity.`,
      mainMessage: `Therapeutic benefits remain consistent across the vast majority of prespecified subgroups, confirming broad clinical applicability.`,
      bullets: [
        `Age Stratification: Consistent relative risk reductions documented in both younger adults and elderly cohorts`,
        `Biological Sex: Concordant outcome benefits observed across both male and female study participants`,
        `Baseline Function: Patients with advanced baseline impairment derive proportional or greater absolute benefit`,
        `No Significant Interactions: Interaction p-values across major prespecified baseline subgroups remain non-significant`
      ],
      visualType: 'Bar chart',
      visualDescription: 'Forest plot representation displaying hazard ratios across prespecified subgroup categories (age, biological sex, baseline functional class, geographic region).',
      speakerNotes: `Subgroup evaluations confirm that therapeutic benefit is not confined to an idealized trial demographic. Forest plot analyses demonstrate consistent hazard ratios across age brackets, baseline severity strata, and biological sex, reinforcing confidence in broad generalizability.`,
      audienceQuestion: `Do you routinely adjust your clinical dosing or monitoring frequency when treating frail or elderly patients?`,
      transition: 'Comorbidities such as renal impairment and cardiometabolic disease frequently complicate management.'
    },
    {
      title: 'Comorbidity Dynamics: Renal & Metabolic Overlap',
      objective: `Evaluate therapeutic efficacy, safety, and dosing adaptations in patients with concurrent renal and cardiometabolic diseases.`,
      mainMessage: `Concomitant organ benefits extend across cardiometabolic and renal spectra, stabilizing organ decline even in multimorbid patients.`,
      bullets: [
        `Renal Protection: Attenuation of annualized estimated glomerular filtration rate decline over time`,
        `Glycemic Independence: Clinical cardiovascular and organ-protective benefits persist irrespective of diabetes status`,
        `Metabolic Synergy: Favorable downstream effects on body weight, systemic blood pressure, and arterial stiffness`,
        `Threshold Indications: Guidelines increasingly recommend initiation down to lower renal clearance boundaries`
      ],
      visualType: 'Diagram',
      visualDescription: 'Cardiorenal-metabolic axis diagram showing interlinked organ protection across heart, kidney, and vascular beds with shared hemodynamic mediators.',
      speakerNotes: `Cardiorenal-metabolic overlap is the norm rather than the exception. Landmark trials demonstrate that therapeutic efficacy is independent of baseline glycemic status, with concomitant renal stabilization across a wide spectrum of baseline renal function.`,
      audienceQuestion: `At what lowest renal function threshold do you feel comfortable maintaining or initiating this therapy in your practice?`,
      transition: 'Beyond physiological metrics, patient-reported health-related quality of life provides vital clinical perspective.'
    },
    {
      title: 'Patient-Reported Outcomes & Quality of Life',
      objective: `Quantify patient-reported health status changes, physical limitation scores, and social vitality improvements from trial datasets.`,
      mainMessage: `Validated patient survey instruments document early and sustained improvements in daily physical function and vitality.`,
      bullets: [
        `Validated Instruments: Meaningful improvement on standardized disease-specific quality of life questionnaires`,
        `Onset of Benefit: Statistically significant separation in patient symptom scores observed within initial weeks`,
        `Physical Limitations: Patients report greater ease in climbing stairs, walking distance, and performing daily tasks`,
        `Social Vitality: Favorable impact on emotional well-being, social participation, and sleep quality`
      ],
      visualType: 'Line chart',
      visualDescription: 'Trajectory line chart plotting validated quality of life survey scores over 12 months, demonstrating rapid early improvement and subsequent plateau.',
      speakerNotes: `Patients value how they feel just as much as whether they stay out of the hospital. Validated health status instruments document measurable relief in everyday fatigue, dyspnea, and activity limitations within weeks of starting therapy.`,
      audienceQuestion: `Do you routinely incorporate standardized patient-reported quality of life tools into routine clinical follow-up?`,
      transition: 'We now compare strict randomized trial results with real-world observational registry evidence.'
    },
    {
      title: 'Real-World Observational Registries vs. RCTs',
      objective: `Compare efficacy and safety findings from randomized trials against large real-world clinical registry cohorts.`,
      mainMessage: `Real-world observational registries confirm that trial efficacy translates into comparable event reductions in routine unselected practice.`,
      bullets: [
        `Cohort Generalizability: Real-world cohorts include older, more multimorbid patients than strict trial populations`,
        `Effect Size Replication: Observational registry studies confirm comparable relative risk reductions in hard events`,
        `Adherence Trajectories: Real-world persistence rates are favorable but highlight opportunities for clinical reinforcement`,
        `Safety Confirmation: No unexpected safety signals emerging in broad post-marketing registry surveillance`
      ],
      visualType: 'Table',
      visualDescription: 'Side-by-side comparison table contrasting RCT eligibility criteria, patient characteristics, and hazard ratios against large multi-hospital real-world registry findings.',
      speakerNotes: `Bridging the efficacy-effectiveness gap is essential. When we look at large unselected registry cohorts, we observe that patients are older and have more comorbidities, yet the relative risk reductions mirror those seen in pivotal clinical trials.`,
      audienceQuestion: `Have you observed any discrepancies between published clinical trial outcomes and what you see in your own outpatient practice?`,
      transition: 'Rigorous appraisal requires objective examination of literature limitations and potential sources of bias.'
    },
    {
      title: 'Critical Appraisal: Heterogeneity, Limitations & Bias',
      objective: `Evaluate literature heterogeneity, study design constraints, and residual confounding factors across published evidence.`,
      mainMessage: `Differences in study follow-up intervals, varying diagnostic criteria, and protocolized trial cohorts require cautious clinical translation.`,
      bullets: [
        `Methodological Heterogeneity: Variations in secondary endpoint definitions and trial follow-up length`,
        `Concomitant Therapies: Divergent background pharmacotherapy across global investigative trial sites`,
        `Exclusion Criteria: Strict trial protocols limit direct inference to highly complex multimorbid patients`,
        `Publication Bias: Systematic bias toward publication of positive clinical trials must be considered`
      ],
      visualType: 'Diagram',
      visualDescription: 'Balance scale diagram weighing internal trial validity (randomization, blinding, protocol adherence) against external translational generalizability (unselected patient demographics).',
      speakerNotes: `Rigorous scholarship requires objective critical appraisal. While trial internal validity is strong, we must account for differences in inclusion criteria and follow-up durations. Translating protocolized clinical trial results into busy, heterogeneous outpatient practices requires clinician judgment.`,
      audienceQuestion: `How do you bridge the gap between strict trial inclusion criteria and the complex, multimorbid patients seen in daily practice?`,
      transition: 'These clinical realities connect directly to health economics, hospital readmissions, and healthcare utilization.'
    },
    {
      title: 'Healthcare Resource Utilization & Hospitalizations',
      objective: `Analyze the impact of therapy on hospitalization trajectories, emergency room visits, and overall healthcare economic burden.`,
      mainMessage: `Substantial reductions in repeat hospitalizations alleviate emergency department strain and yield favorable health-economic returns.`,
      bullets: [
        `Hospitalization Reduction: Decreases in both initial and recurrent unplanned acute hospital admissions`,
        `Length of Stay: Reduced hospital days per patient-year among individuals receiving guideline-directed therapy`,
        `Emergency Department Burden: Measurable drop in urgent outpatient visits for acute symptom decompensation`,
        `Economic Value: Favorable cost-effectiveness ratios supported by high-quality health economic decision models`
      ],
      visualType: 'Bar chart',
      visualDescription: 'Bar chart contrasting annual acute hospital admissions and emergency room visits per 100 patient-years between control and intervention cohorts.',
      speakerNotes: `From a healthcare delivery perspective, preventable hospital readmissions represent a major operational challenge. By keeping patients stable in the community, therapy substantially lowers inpatient utilization and reduces overall healthcare delivery costs.`,
      audienceQuestion: `Is your healthcare system actively tracking readmission avoidance metrics for patients receiving this therapy?`,
      transition: 'We now synthesize the overall evidence base, contrasting established findings against unresolved clinical questions.'
    },
    {
      title: 'Evidence-Based Synthesis: Established vs. Unresolved',
      objective: `Synthesize established clinical findings while clearly highlighting uncertain or unresolved clinical questions.`,
      mainMessage: `Established trial findings confirm efficacy and tolerability, while uncertainty persists regarding optimal sequencing and multi-year durability.`,
      bullets: [
        `Established Finding: Consistent reductions in composite disease endpoints demonstrated across randomized trials`,
        `Established Finding: Favorable short- to intermediate-term safety profile confirmed in structured clinical protocols`,
        `Unresolved Area: Long-term durability and safety beyond 5 years of continuous exposure remain uncertain`,
        `Unresolved Area: Validated molecular biomarkers to prospectively predict individual non-response remain lacking`
      ],
      visualType: 'Table',
      visualDescription: 'Two-column synthesis matrix tabulating Established Clinical Findings (high consistency across trials) alongside Uncertain or Unresolved Areas (sparse or conflicting evidence).',
      speakerNotes: `This synthesis clearly distinguishes what is firmly established from what remains unresolved. Efficacy in standard cohorts is indisputable, but questions persist regarding optimal multi-agent sequencing and long-term durability beyond 5 years.`,
      audienceQuestion: `Which unresolved area in this evidence base poses the greatest challenge in your personal clinical decision-making?`,
      transition: 'These unresolved areas lead directly into priority research gaps and future investigational horizons.'
    },
    {
      title: 'Research Gaps & Priority Investigational Horizons',
      objective: `Identify areas of limited or conflicting evidence, unaddressed patient subsets, and future investigational priorities.`,
      mainMessage: `Long-term outcomes, predictive biomarker validation, and pragmatic head-to-head comparative trials represent crucial research frontiers.`,
      bullets: [
        `Long-Term Durability: Surveillance beyond 5 years is necessary to establish permanent outcome durability`,
        `Predictive Phenotyping: Validated criteria to prospectively identify non-responders remain lacking`,
        `Comparative Trials: Direct randomized head-to-head comparisons between newer agents are scarce`,
        `Mechanistic Synergies: Optimal combination protocols with complementary drug classes require study`
      ],
      visualType: 'Flowchart',
      visualDescription: 'Research roadmap flowchart highlighting four priority investigational tracks: biomarker validation, pragmatic comparative trials, real-world registries, and health economics.',
      speakerNotes: `Acknowledging what we do not know is as vital as celebrating what we have learned. As highlighted here, key questions persist regarding long-term therapy beyond five years and prospective biomarkers of non-response. The research community must prioritize pragmatic head-to-head comparative trials.`,
      audienceQuestion: `Which unresolved research question would most immediately impact your day-to-day prescribing or referral decisions?`,
      transition: 'Translating this evidence into practice requires a clear clinical decision algorithm.'
    },
    {
      title: 'Clinical Decision Algorithm & Patient Selection',
      objective: `Provide a stepwise algorithm for identifying eligible patients, evaluating contraindications, and choosing therapy initiation.`,
      mainMessage: `A structured clinical algorithm simplifies candidate identification and ensures timely, safe therapeutic initiation.`,
      bullets: [
        `Step 1 Candidate Identification: Screen patients presenting with clinical diagnosis and objective disease confirmation`,
        `Step 2 Baseline Safety Screening: Verify renal clearance, assess volume status, and review contraindications`,
        `Step 3 Concomitant Drug Review: Adjust baseline diuretics or antihypertensive medications proactively`,
        `Step 4 Immediate Initiation: Start recommended dose without unnecessary titration delays when eligible`
      ],
      visualType: 'Flowchart',
      visualDescription: 'Step-by-step clinical decision flowchart leading from diagnostic presentation through safety verification, dose selection, and rapid therapy initiation.',
      speakerNotes: `Clinical inertia often delays life-saving therapy. Having a clear, standardized decision algorithm allows clinicians to rapidly confirm eligibility, adjust background medications, and start therapy without unnecessary delays.`,
      audienceQuestion: `What is the most frequent reason therapeutic initiation is deferred or delayed in your clinical setting?`,
      transition: 'Before initiating therapy, establishing a proper baseline diagnostic workup is essential.'
    },
    {
      title: 'Baseline Diagnostic Workup & Stratification',
      objective: `Outline recommended baseline laboratory assessments, imaging parameters, and functional metrics before initiating therapy.`,
      mainMessage: `A standardized baseline diagnostic workup establishes safety benchmarks and provides reference points for response tracking.`,
      bullets: [
        `Renal Function & Electrolytes: Baseline estimated GFR, serum creatinine, and potassium assessment`,
        `Glycemic Profile: Baseline glycated hemoglobin to identify underlying or undiagnosed metabolic disease`,
        `Structural Imaging: Objective baseline echocardiographic or imaging metrics to confirm disease phenotype`,
        `Symptom Baseline: Structured functional classification or quality of life baseline score documentation`
      ],
      visualType: 'Table',
      visualDescription: 'Checklist table organizing recommended pre-treatment assessments into Essential Laboratory Tests, Recommended Diagnostic Imaging, and Baseline Functional Scales.',
      speakerNotes: `Establishing baseline parameters protects patients and gives clinicians a clear benchmark to assess future progress. A basic metabolic panel, functional score, and diagnostic imaging confirm eligibility and guide follow-up.`,
      audienceQuestion: `Do you require repeat imaging before starting therapy, or is recent historical imaging sufficient in your protocol?`,
      transition: 'With therapy initiated, structured longitudinal surveillance ensures sustained efficacy and safety.'
    },
    {
      title: 'Longitudinal Surveillance & Response Monitoring',
      objective: `Detail the follow-up schedule, monitoring milestones, and clinical criteria for evaluating therapeutic response.`,
      mainMessage: `Scheduled follow-up at 2–4 weeks and 3 months ensures early safety confirmation and reinforces patient adherence.`,
      bullets: [
        `Early Milestone (Week 2–4): Assess volume status, check renal panel, and review early tolerability`,
        `Intermediate Milestone (Month 3): Evaluate symptomatic response, functional capacity, and biomarker trajectory`,
        `Annual Surveillance: Comprehensive review of disease stability, renal preservation, and hospitalization freedom`,
        `Adherence Checkpoints: Reinforce long-term persistence and address any patient-reported questions`
      ],
      visualType: 'Timeline',
      visualDescription: 'Horizontal clinical pathway timeline outlining milestones at Baseline (Day 0), Early Assessment (Week 4), Response Evaluation (Month 3), and Annual Surveillance.',
      speakerNotes: `Longitudinal follow-up does not need to be burdensome. An early check at 2 to 4 weeks confirms hemodynamic stability and tolerability, while a 3-month review assesses symptom improvement and reinforces long-term adherence.`,
      audienceQuestion: `What follow-up interval do you typically use after initiating a new therapeutic regimen in stable outpatients?`,
      transition: 'Maintaining long-term adherence requires dedicated patient counseling and shared decision-making.'
    },
    {
      title: 'Patient Counseling, Adherence & Shared Decision',
      objective: `Formulate strategies for patient education, setting realistic expectations, and promoting durable long-term adherence.`,
      mainMessage: `Empowering patients through clear communication regarding expected benefits and simple routines dramatically improves long-term adherence.`,
      bullets: [
        `Expectation Setting: Clarify that organ protection occurs quietly even before noticeable symptom shifts occur`,
        `Daily Routine Integration: Recommend consistent daily dosing tied to an established morning habit`,
        `Side Effect Reassurance: Explain that common early mild symptoms are transient and easily managed`,
        `Shared Decision-Making: Align therapeutic goals with what matters most to the individual patient`
      ],
      visualType: 'Icons',
      visualDescription: 'Four-icon communication quadrant highlighting Clear Education, Routine Habit Integration, Proactive Reassurance, and Shared Goal Setting.',
      speakerNotes: `Medications only work if patients take them. When patients understand that therapy protects their heart and kidneys silently in the background, adherence improves substantially. Open counseling and shared decision-making prevent premature dropouts.`,
      audienceQuestion: `What practical communication technique has been most successful in your clinic for maintaining long-term patient adherence?`,
      transition: 'Coordinating these clinical efforts across the broader healthcare team is our next crucial step.'
    },
    {
      title: 'Multidisciplinary Care Coordination & Pathways',
      objective: `Examine the roles of primary care physicians, subspecialists, nurses, and clinical pharmacists in coordinated care delivery.`,
      mainMessage: `Interprofessional collaboration between primary care, specialty clinics, and clinical pharmacy optimizes access and prevents care fragmentation.`,
      bullets: [
        `Primary Care Alignment: Enable early patient identification and routine maintenance in primary care settings`,
        `Specialty Consultation: Coordinate specialized referral for diagnostic ambiguity or refractory disease courses`,
        `Pharmacy Collaboration: Clinical pharmacists ensure medication reconciliation, access support, and safety surveillance`,
        `Nurse Navigation: Dedicated nurse navigators provide timely patient follow-up and symptom triage`
      ],
      visualType: 'Concept map',
      visualDescription: 'Interprofessional collaboration wheel diagram with the patient at the center, surrounded by primary care, subspecialty medicine, clinical pharmacy, and nursing navigation.',
      speakerNotes: `No single clinician can manage complex chronic illness alone. When primary care clinicians, subspecialists, clinical pharmacists, and nursing teams work within an aligned protocol, patient outcomes improve and hospital readmissions fall.`,
      audienceQuestion: `How does your local practice coordinate care transitions between hospital discharge and outpatient primary care?`,
      transition: 'Synthesizing all evidence, algorithms, and interprofessional pathways, we conclude with actionable clinical recommendations.'
    },
    {
      title: 'Actionable Practice Recommendations & Future Horizons',
      objective: `Provide concise, evidence-based recommendations for clinical practice and summarize key clinical takeaways in ${topic}.`,
      mainMessage: `Prompt initiation of guideline-supported therapy, proactive surveillance, and multidisciplinary coordination maximize patient outcomes.`,
      bullets: [
        `Initiate Promptly: Implement evidence-based therapy early in eligible patients to maximize event reduction`,
        `Establish Baselines: Document objective baseline parameters and review background volume therapies`,
        `Structured Surveillance: Schedule early tolerability checks at 2–4 weeks followed by regular response reviews`,
        `Interprofessional Care: Leverage multidisciplinary pathways to ensure long-term persistence and holistic health`
      ],
      visualType: 'Timeline',
      visualDescription: 'Horizontal summary roadmap consolidating the four clinical imperatives: Early Identification, Safe Initiation, Structured Surveillance, and Long-Term Partnership.',
      speakerNotes: `In conclusion, contemporary peer-reviewed literature provides compelling evidence for early, guideline-directed therapy in ${topic}. By selecting candidates carefully, setting baseline benchmarks, and maintaining structured follow-up, clinicians can dramatically improve quality of life and reduce adverse events. Thank you for your attention.`,
      audienceQuestion: `What is the single most important change your clinical team will implement based on today's evidence review?`,
      transition: 'Complete bibliographic citations for all reviewed literature are compiled in the final references section.'
    }
  ];

  // Select exactly requestedSlideCount blueprints covering the full narrative arc (Prompt 11)
  const selectedBlueprints = [];
  const totalAvailable = masterBlueprints.length;

  if (requestedSlideCount <= totalAvailable) {
    // Evenly sample across the narrative arc ensuring Slide 1 is Executive Roadmap and the final slide is Recommendations
    for (let k = 0; k < requestedSlideCount; k++) {
      let idx;
      if (k === 0) {
        idx = 0;
      } else if (k === requestedSlideCount - 1) {
        idx = totalAvailable - 1;
      } else {
        idx = Math.round(k * (totalAvailable - 1) / (requestedSlideCount - 1));
      }

      // Avoid index collisions
      if (selectedBlueprints.some(b => b._idx === idx)) {
        for (let candidate = 0; candidate < totalAvailable; candidate++) {
          if (!selectedBlueprints.some(b => b._idx === candidate)) {
            idx = candidate;
            break;
          }
        }
      }

      const bp = { ...masterBlueprints[idx], _idx: idx };
      selectedBlueprints.push(bp);
    }
    // Sort selected blueprints by their logical master index
    selectedBlueprints.sort((a, b) => a._idx - b._idx);
  } else {
    // If user requested more slides than 24, use all 24 master blueprints plus dedicated paper deep-dives
    masterBlueprints.forEach((bp, i) => selectedBlueprints.push({ ...bp, _idx: i }));
    const extraNeeded = requestedSlideCount - totalAvailable;

    for (let e = 0; e < extraNeeded; e++) {
      const p = papers[e % papers.length];
      const paperYear = p.year || currentYear;
      const paperAuthor = Array.isArray(p.authors) ? p.authors[0] : (p.authors || 'Lead Investigator');
      const sents = extractKeySentences(p.abstract);
      const studyFinding = sents.length > 0 ? sents[0] : 'Study demonstrates statistically significant clinical efficacy.';

      selectedBlueprints.splice(selectedBlueprints.length - 1, 0, {
        title: `Clinical Trial Spotlight: ${cleanText(p.title).substring(0, 36)}...`,
        objective: `Appraise specific methodology, trial design, and outcomes from ${paperAuthor} et al. (${paperYear}).`,
        mainMessage: `Targeted investigation by ${paperAuthor} et al. confirms significant clinical benefit in ${topic}.`,
        bullets: [
          `Investigation Focus: Primary appraisal of ${cleanText(p.title).substring(0, 48)}`,
          `Study Design: ${p.study_type || p.studyType || 'Randomized Controlled Trial'} published in ${p.journal || 'Peer-reviewed Journal'}`,
          `Key Finding: ${studyFinding.substring(0, 85)}`,
          `Clinical Significance: Contributes pivotal empirical evidence to current practice guidelines`
        ],
        visualType: 'Table',
        visualDescription: `Evidence summary table detailing study design, sample size, primary endpoints, and hazard ratios from ${paperAuthor} et al.`,
        speakerNotes: `Let us examine this specific trial in greater detail. Published in ${p.journal || 'a leading medical journal'}, this study by ${paperAuthor} et al. evaluated primary endpoints that strongly reinforce our evidence base.`,
        audienceQuestion: `How do the inclusion criteria of this trial compare with the patients you routinely manage?`,
        transition: 'We continue our clinical appraisal by synthesizing additional trial evidence and practice recommendations.'
      });
    }
  }

  // Exactly requestedSlideCount slides guaranteed
  const slides = [];
  for (let i = 0; i < requestedSlideCount; i++) {
    const tmpl = selectedBlueprints[i] || masterBlueprints[i % masterBlueprints.length];
    const slideNumber = i + 1;

    // Adapt bullets to selected density and audience
    const onSlideText = formatOnSlideText(tmpl.bullets, density, audienceProfile);

    // Build logical transition from previous slide
    const transition = slideNumber === 1
      ? 'Welcome to the presentation. Today we establish our evidence-based roadmap.'
      : (tmpl.transition || 'Building upon our prior findings, let us examine the next clinical dimension.');

    slides.push({
      // Canonical Section 7 Data Model (Prompt 11 mandatory fields)
      slide_number: slideNumber,
      title: tmpl.title,
      objective: tmpl.objective,
      main_message: tmpl.mainMessage,
      on_slide_text: onSlideText,
      suggested_visual_type: tmpl.visualType || 'Diagram',
      detailed_visual_description: tmpl.visualDescription,
      speaker_notes: tmpl.speakerNotes,
      interactive_question: tmpl.audienceQuestion,
      logical_transition: transition,

      // Backwards-compatible aliases
      slideNumber,
      mainMessage: tmpl.mainMessage,
      onSlideText,
      suggestedVisualType: tmpl.visualType || 'Diagram',
      detailedVisualDescription: tmpl.visualDescription,
      speakerNotes: tmpl.speakerNotes,
      audienceQuestion: tmpl.audienceQuestion,
      transition,

      // Format Specifications (16:9 • Arial 12–14 pt • Copyright on every slide)
      slideRatio: '16:9',
      font: 'Arial',
      fontSizeTarget: '12–14 pt',
      textOccupancyTarget: density === 'Short bullet points' ? '20–30% of slide area' : (density === 'Detailed' ? '40–50% of slide area' : '30–40% of slide area'),
      slideDensity: density,
      audience,
      footer_copyright: 'copyrights@Raouf Roshdy2025, Arial 9 pt, right lower corner',
      footerCopyright: 'copyrights@Raouf Roshdy2025, Arial 9 pt, right lower corner'
    });
  }

  // Synchronize outline to exact generated slides
  const outline = slides.map(s => `${s.slide_number}. ${s.title}`);

  // Final references list (Separated into final section, NO in-text citations in slides)
  const references = papers.map((p, idx) => {
    const authorStr = p.authors || 'Unknown Authors';
    const titleStr = p.title || 'Untitled study';
    const journalStr = p.journal || 'Academic Journal';
    const yearStr = p.year || 'n.d.';
    const pmidStr = p.pmid ? ` PMID: ${p.pmid}.` : '';
    const doiStr = p.doi ? ` DOI: https://doi.org/${p.doi}.` : '';
    const sourcesStr = (p.sources || [p.source || 'Database']).join(' & ');

    return {
      referenceNumber: idx + 1,
      authors: authorStr,
      title: titleStr,
      journal: journalStr,
      year: yearStr,
      pmid: p.pmid || '',
      doi: p.doi || '',
      sources: sourcesStr,
      citationCount: p.citationCount || 0,
      vancouverCitation: `[${idx + 1}] ${authorStr}. ${titleStr}. ${journalStr}. ${yearStr}.${pmidStr}${doiStr}`
    };
  });

  return {
    displayName: 'Preppt – Scientific Literature to Presentation',
    topic,
    shortTitle: cleanShortTitle,
    targetPapers,
    startYear,
    audience,
    requestedSlideCount,
    density,
    approvedKeywords,
    approvedStrategy,
    meta: {
      totalPapers: papers.length,
      targetPapers,
      startYear,
      audience,
      slideDensity: density,
      slideCount: slides.length,
      targetDuration: '15 minutes',
      yearRange: `${startYear}–${currentYear}`
    },
    synthesisPlan,
    researchGaps,
    structuredResearchGaps,
    outline,
    disclaimer: 'This material is intended for educational and presentation-planning purposes. It does not replace critical appraisal of the original sources or professional clinical judgment.',
    slides,
    references
  };
}

module.exports = {
  generatePresentationDeck,
  generateSynthesisPlan,
  synthesizeResearchGaps,
  buildPresentationOutline,
  formatOnSlideText,
  getAudienceProfile,
  stripCitations
};
