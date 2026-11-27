/**
 * Study-design classification regression (audit D-06).
 * Real records from the Nov 2026 audit; expected designs follow PubMed publication types.
 */
const assert = require('assert');
const { classifyStudyDesign, DESIGNS } = require('../../public/evidence-rules.js');

const cases = [
  // Systematic reviews of RCTs must not be labelled as RCTs (with and without metadata)
  { title: 'Empagliflozin and other SGLT2 inhibitors in patients with heart failure and preserved ejection fraction: a systematic review and meta-analysis', abstract: 'We included 8 randomized controlled trials with 16,509 participants.', pubType: ['Review'], expect: DESIGNS.SR },
  { title: 'Efficacy and safety of PARP inhibitor maintenance therapy for ovarian cancer: a meta-analysis and trial sequential analysis of randomized controlled trials', abstract: 'This meta-analysis encompassed 20 RCTs.', expect: DESIGNS.SR },
  { title: 'Tranexamic acid for the prevention and the treatment of primary postpartum haemorrhage: a systematic review.', abstract: 'Twenty-seven randomised controlled trials (RCTs) (33,302 women) were identified.', expect: DESIGNS.SR },
  { title: 'SGLT2 Inhibitors and the Risk of Arrhythmias in Heart Failure: A Network Meta-Analysis', abstract: 'Randomized controlled trials (RCTs) comparing SGLT2i with placebo were incorporated.', pubType: ['Review'], expect: DESIGNS.SR },
  { title: 'Tranexamic acid for the prevention of postpartum bleeding: Protocol for a systematic review and individual patient data meta-analysis', abstract: '', expect: DESIGNS.PROTOCOL },
  // Real RCTs whose abstracts say "randomly assigned" (no "randomized controlled trial" phrase)
  { title: 'Dapagliflozin in Heart Failure with Mildly Reduced or Preserved Ejection Fraction.', abstract: 'In this international, double-blind trial, we randomly assigned 6263 patients with heart failure to receive dapagliflozin or placebo.', pubType: ['Research Support, Non-U.S. Gov\'t'], expect: DESIGNS.RCT },
  { title: 'Empagliflozin in Heart Failure with a Preserved Ejection Fraction.', abstract: 'In this double-blind trial, we randomly assigned 5988 patients with class II-IV heart failure.', expect: DESIGNS.RCT },
  { title: 'Any title', abstract: '', pubType: ['Journal Article', 'Randomized Controlled Trial'], expect: DESIGNS.RCT },
  // Guidelines / statements
  { title: 'Updated WHO recommendation on intravenous tranexamic acid for the treatment of post-partum haemorrhage.', abstract: '', pubType: ['Journal Article', 'Practice Guideline'], expect: DESIGNS.GUIDELINE },
  { title: 'SGLT2 inhibitors for the prevention and treatment of heart failure: A scientific statement of the HFA and the HFAI', abstract: '', expect: DESIGNS.GUIDELINE },
  // Narrative reviews that mention trials must not become "Clinical Trial"
  { title: 'Tranexamic acid for the prevention and treatment of bleeding in surgery, trauma and bleeding disorders: a narrative review.', abstract: 'An electronic search was performed to identify clinical trials.', expect: DESIGNS.REVIEW },
  { title: 'SGLT2 Inhibitors in Heart Failure with Preserved Ejection Fraction.', abstract: 'Randomized controlled trials have shown promising results.', pubType: ['Journal Article', 'Review'], expect: DESIGNS.REVIEW },
  { title: 'Mechanistic Insights and Clinical Horizons of SGLT2 Inhibitors in Heart Failure Management.', abstract: '', expect: DESIGNS.REVIEW },
  // Observational designs
  { title: 'Efficacy and safety of PARP inhibitor maintenance therapy in elderly ovarian cancer patients: a real-world single-center retrospective cohort study.', abstract: 'Archival data from patients', expect: DESIGNS.RETRO },
  { title: 'Angiogenic Burst After Parp Inhibitor Maintenance Therapy in Relapsed Ovarian Cancer: A Case Report', abstract: '', expect: DESIGNS.CASE_REPORT },
  { title: 'Understanding the needs and perspectives of ovarian cancer patients when considering PARP inhibitor maintenance therapy: a qualitative study', abstract: 'Semi-structured interviews were conducted.', expect: DESIGNS.SURVEY },
  { title: 'Management of side effects in PARP inhibitor maintenance therapy for advanced ovarian cancer: results of a NOGGO national interdisciplinary survey', abstract: '', expect: DESIGNS.SURVEY },
  { title: 'The efficacy of tranexamic acid in prevention and treatment of post-inflammatory hyperpigmentation: a pilot study.', abstract: 'This pilot study evaluated the efficacy of oral TXA.', expect: DESIGNS.UNCONTROLLED },
  { title: 'Abstract 4019: Clinical validation of WES-based HRD scoring', abstract: '', expect: DESIGNS.CONFERENCE },
  { title: 'Quality of oxytocin and tranexamic acid in four countries', abstract: 'Samples were analyzed according to pharmacopeia standards.', expect: DESIGNS.UNKNOWN }
];

let failures = 0;
for (const c of cases) {
  const got = classifyStudyDesign(c);
  if (got !== c.expect) {
    failures++;
    console.error(`   ✗ "${c.title.slice(0, 70)}" → ${got} (expected ${c.expect})`);
  }
}
assert.strictEqual(failures, 0, `${failures} study-design misclassifications`);
console.log(`   ✓ ${cases.length} real-world records classified correctly (SR/MA never labelled RCT; "randomly assigned" detected).`);
console.log('\nPassed: Study-design classification tests verified.');
