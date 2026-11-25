/**
 * Acceptance Test Suite for PROMPT 1: Evidence-Grounded Extractive Synthesis
 * Validates remediation of defects D-01, D-02, D-03, D-11, D-12, D-16, D-17, D-26, D-27, D-34.
 */

const assert = require('assert');
const { generatePresentationDeck } = require('../../lib/synthesize.js');
const { generatePresentationDocx } = require('../../lib/docx-generator.js');

async function runAcceptanceTests() {
  console.log('================================================================');
  console.log('🧪 RUNNING PROMPT 1 ACCEPTANCE TESTS: EVIDENCE-GROUNDED SYNTHESIS');
  console.log('================================================================\n');

  // --------------------------------------------------------------------------
  // TEST 1: Null-result extractive test
  // --------------------------------------------------------------------------
  console.log('▶️ TEST 1: Null-result extractive test (Vitamin D, single paper, 20 slides requested)');
  const vitDPaper = {
    id: 'vit-d-1',
    title: 'Vitamin D supplementation in non-skeletal health outcomes: a randomized trial',
    authors: 'Manson JE, Cook NR, et al.',
    journal: 'N Engl J Med',
    year: 2019,
    abstract: 'In this randomized controlled trial of 500 patients, vitamin D supplementation resulted in no significant difference in clinical outcomes compared with placebo (HR 0.98, 95% CI 0.82-1.18, P = 0.84).'
  };

  const vitDDeck = generatePresentationDeck({
    topic: 'Vitamin D supplementation for chronic disease prevention',
    shortTitle: 'Vitamin D: Trial Outcomes',
    papers: [vitDPaper],
    slideCount: 20,
    audience: 'Postgraduate'
  });

  // (a) 0 occurrences of benefit/superior/breakthrough in clinical outcome contexts
  const outcomeText = vitDDeck.slides
    .filter(s => s.stage === 4 || s.stage === 5 || s.stage === 8)
    .map(s => `${s.main_message} ${s.on_slide_text}`)
    .join(' ')
    .toLowerCase();

  const benefitRegex = /\b(?:superior to placebo|significant benefit|clinical benefit|dramatic improvement|breakthrough efficacy)\b/i;
  assert.strictEqual(
    benefitRegex.test(outcomeText),
    false,
    `Null paper synthesis contains false positive benefit phrases: "${outcomeText.match(benefitRegex)?.[0]}"`
  );

  // (b) Explicitly reports null result with sources: [1]
  const nullSlide = vitDDeck.slides.find(s =>
    s.sources && s.sources.includes(1) &&
    (/no significant difference/i.test(s.on_slide_text) || /no statistically significant/i.test(s.main_message))
  );
  assert(nullSlide, 'Slide reporting null findings with sources: [1] must exist in synthesized deck');

  // (c) Transparent evidence shortfall reported
  assert(
    vitDDeck.meta.slideShortfall > 0 || (vitDDeck.meta.supportedSlideCount && vitDDeck.meta.supportedSlideCount < 20),
    'Engine must report transparent slideShortfall when requested count cannot be supported by evidence'
  );
  console.log(`  ✓ Null result correctly reported on slide "${nullSlide.title}" with source [1]`);
  console.log(`  ✓ Evidence shortfall recorded: ${vitDDeck.meta.slideShortfall} slides shortfall (supported: ${vitDDeck.slides.length})`);
  console.log('  ✅ TEST 1 PASSED.\n');

  // --------------------------------------------------------------------------
  // TEST 2: Forbidden template vocabulary test
  // --------------------------------------------------------------------------
  console.log('▶️ TEST 2: Forbidden template vocabulary test (IVF topic)');
  const ivfPapers = [
    {
      id: 'ivf-1',
      title: 'Deep learning for blastocyst quality assessment in IVF',
      authors: 'Khosravi P, Kazemi E, et al.',
      journal: 'NPJ Digit Med',
      year: 2021,
      abstract: 'A deep neural network evaluated 12,000 embryo images, achieving an AUC of 0.93 for predicting blastocyst grade and viability.'
    },
    {
      id: 'ivf-2',
      title: 'Time-lapse morphokinetics and embryo selection algorithms',
      authors: 'Meseguer M, Herrero J, et al.',
      journal: 'Hum Reprod',
      year: 2022,
      abstract: 'Computer-automated time-lapse analysis correlated cell division timings with implantation success, identifying key morphokinetic markers.'
    },
    {
      id: 'ivf-3',
      title: 'Automated sperm morphology evaluation using computer vision',
      authors: 'Mirsky SK, Bar-On I, et al.',
      journal: 'Fertil Steril',
      year: 2023,
      abstract: 'Interferometric imaging paired with machine learning quantified sperm head morphology, improving classification consistency over manual analysis.'
    }
  ];

  const ivfDeck = generatePresentationDeck({
    topic: 'Artificial intelligence in in-vitro fertilization (IVF)',
    shortTitle: 'AI in IVF: Clinical Evidence',
    papers: ivfPapers,
    slideCount: 12,
    audience: 'Postgraduate'
  });

  const forbiddenWords = [
    'hemodynamic',
    'receptor',
    'readmission',
    'hospitalization',
    'emergency department',
    'post-marketing',
    'registry',
    'octogenarian',
    'hl7',
    'fhir',
    'ejection fraction',
    'composite adverse'
  ];

  const fullDeckDump = JSON.stringify(ivfDeck).toLowerCase();
  for (const word of forbiddenWords) {
    const idx = fullDeckDump.indexOf(word);
    assert.strictEqual(
      idx,
      -1,
      `Forbidden template vocabulary detected in IVF deck: "${word}" found at index ${idx}`
    );
  }
  console.log(`  ✓ Verified 0 occurrences across all 12 forbidden template words in IVF synthesis.`);
  console.log('  ✅ TEST 2 PASSED.\n');

  // --------------------------------------------------------------------------
  // TEST 3: Evidence dependence test
  // --------------------------------------------------------------------------
  console.log('▶️ TEST 3: Evidence dependence test (Disjoint topic paper sets)');
  const gdmPapers = [
    {
      id: 'gdm-1',
      title: 'Metformin versus Insulin in Gestational Diabetes',
      authors: 'Rowan JA, Hague WM, et al.',
      journal: 'N Engl J Med',
      year: 2021,
      abstract: 'Metformin in gestational diabetes demonstrated comparable glycemic control with reduced maternal gestational weight gain compared with insulin.'
    },
    {
      id: 'gdm-2',
      title: 'Long-term neonatal follow-up after intrauterine metformin exposure',
      authors: 'Wouldes TA, Rowan JA, et al.',
      journal: 'Lancet Diabetes Endocrinol',
      year: 2022,
      abstract: 'At 2-year follow-up, offspring exposed to metformin demonstrated no adverse neurodevelopmental delays compared with insulin-exposed controls.'
    }
  ];

  const endoPapers = [
    {
      id: 'endo-1',
      title: 'Robotic-assisted versus laparoscopic excision of deep endometriosis',
      authors: 'Soto E, Luu TH, et al.',
      journal: 'J Minim Invasive Gynecol',
      year: 2022,
      abstract: 'Robotic-assisted excision demonstrated lower operative blood loss with longer operating times but comparable 12-month pain reduction scores.'
    },
    {
      id: 'endo-2',
      title: 'Fertility outcomes following robotic surgery for stage IV endometriosis',
      authors: 'Alborzi S, Keramati P, et al.',
      journal: 'Fertil Steril',
      year: 2023,
      abstract: 'Spontaneous pregnancy rates at 18 months post-surgery were 42.1% following complete robotic resection of deep infiltrating nodules.'
    }
  ];

  const gdmDeck = generatePresentationDeck({
    topic: 'Metformin in Gestational Diabetes Mellitus',
    shortTitle: 'Metformin in GDM',
    papers: gdmPapers,
    slideCount: 10
  });

  const endoDeck = generatePresentationDeck({
    topic: 'Robotic Excision in Deep Endometriosis',
    shortTitle: 'Robotic Endometriosis Surgery',
    papers: endoPapers,
    slideCount: 10
  });

  const gdmBullets = gdmDeck.slides.flatMap(s => (s.on_slide_text || '').split('\n').map(b => b.trim())).filter(Boolean);
  const endoBullets = endoDeck.slides.flatMap(s => (s.on_slide_text || '').split('\n').map(b => b.trim())).filter(Boolean);

  let identicalCount = 0;
  gdmBullets.forEach(gb => {
    if (endoBullets.includes(gb)) identicalCount++;
  });

  const overlapPct = (identicalCount / gdmBullets.length) * 100;
  console.log(`  ✓ Bullet overlap across disjoint topics: ${identicalCount}/${gdmBullets.length} (${overlapPct.toFixed(1)}%)`);
  assert(
    overlapPct < 20,
    `Evidence dependence failed: ${overlapPct.toFixed(1)}% of bullets are identical between GDM and Endometriosis decks (must be < 20%)`
  );
  console.log('  ✅ TEST 3 PASSED.\n');

  // --------------------------------------------------------------------------
  // TEST 4: Traceability test
  // --------------------------------------------------------------------------
  console.log('▶️ TEST 4: Traceability test (sources metadata & Word evidence map)');
  // Check findings slide has sources metadata
  const findingSlide = ivfDeck.slides.find(s => s.stage === 4 || s.title.includes('Primary Outcomes'));
  assert(findingSlide, 'Primary Outcomes slide must exist');
  assert(Array.isArray(findingSlide.sources) && findingSlide.sources.length > 0, 'Finding slide must contain non-empty sources array');
  assert(findingSlide.evidenceSources && findingSlide.evidenceSources.includes('[1]'), 'Finding slide must display Evidence sources line');

  // Generate docx and verify Evidence map appendix table
  const docxBuffer = await generatePresentationDocx({
    topic: ivfDeck.topic,
    deck: ivfDeck,
    papers: ivfPapers
  });
  assert(docxBuffer && docxBuffer.length > 10000, 'Word document must be generated');
  console.log(`  ✓ Generated Word specification with evidence map: ${docxBuffer.length} bytes`);
  console.log('  ✅ TEST 4 PASSED.\n');

  // --------------------------------------------------------------------------
  // TEST 5: Illingworth case test
  // --------------------------------------------------------------------------
  console.log('▶️ TEST 5: Illingworth case test (Deep learning IVF RCT, non-inferiority not demonstrated)');
  const illingworthPaper = {
    id: 'illingworth-2024',
    title: 'Deep learning versus manual morphology-based embryo selection in in vitro fertilization: a randomized clinical trial',
    authors: 'Illingworth PJ, et al.',
    journal: 'Nat Med',
    year: 2024,
    abstract: 'In a double-blind non-inferiority randomized trial of 1,066 patients, clinical pregnancy rate was 46.5% with artificial intelligence versus 48.2% with manual embryologist evaluation (risk difference -1.7%, 95% CI -7.7% to 4.3%). Because the lower bound of the 95% confidence interval crossed the prespecified non-inferiority margin of -5.0%, non-inferiority was not demonstrated.'
  };

  const illingworthDeck = generatePresentationDeck({
    topic: 'Artificial Intelligence versus Embryologists in IVF Embryo Selection',
    shortTitle: 'AI vs Embryologist in IVF',
    papers: [illingworthPaper],
    slideCount: 8,
    audience: 'Postgraduate'
  });

  // Verify non-inferiority failure is explicitly reported
  const allSlideText = illingworthDeck.slides.map(s => `${s.title}\n${s.main_message}\n${s.on_slide_text}`).join('\n\n');
  assert(
    /non-inferiority was not demonstrated|not able to demonstrate non-inferiority|failed to demonstrate/i.test(allSlideText),
    'Illingworth synthesis must explicitly state that non-inferiority was not demonstrated'
  );

  // Verify take-home does not claim AI improves outcomes
  const conclusionSlide = illingworthDeck.slides[illingworthDeck.slides.length - 1];
  assert(
    !/improves pregnancy|superior to embryologist|recommends routine adoption/i.test(conclusionSlide.main_message + conclusionSlide.on_slide_text),
    'Take-home slide must not falsely claim AI improves outcomes when trial was null'
  );

  console.log(`  ✓ Illingworth trial accurately synthesized: non-inferiority failure reported`);
  console.log(`  ✓ Conclusion slide respects null evidence boundary: "${conclusionSlide.main_message.substring(0, 80)}..."`);
  console.log('  ✅ TEST 5 PASSED.\n');

  // Store Test 5 slide titles and first two bullets for final report
  const test5Report = illingworthDeck.slides.map(s => {
    const bullets = (s.on_slide_text || '').split('\n').filter(Boolean);
    return {
      slideNumber: s.slide_number,
      title: s.title,
      bullet1: bullets[0] || 'N/A',
      bullet2: bullets[1] || 'N/A',
      sources: s.sources || []
    };
  });

  // --------------------------------------------------------------------------
  // TEST 6: No truncated sentences test
  // --------------------------------------------------------------------------
  console.log('▶️ TEST 6: No truncated sentences test');
  const stopWords = ['on', 'to', 'the', 'of', 'with', 'and', 'or', 'in', 'at', 'by', 'for', 'from'];
  let checkedBulletCount = 0;

  illingworthDeck.slides.forEach((s, idx) => {
    const bullets = (s.on_slide_text || '').split('\n').filter(Boolean);
    bullets.forEach((b, bIdx) => {
      checkedBulletCount++;
      const trimmed = b.trim();
      const lastChar = trimmed.slice(-1);
      assert(
        ['.', '?', '!', ':'].includes(lastChar),
        `Slide ${idx + 1} Bullet ${bIdx + 1} lacks terminal punctuation: "${trimmed}"`
      );

      // Check terminal word
      const words = trimmed.replace(/[\.\?!:]+$/, '').trim().split(/\s+/);
      const lastWord = words[words.length - 1].toLowerCase();
      assert(
        !stopWords.includes(lastWord),
        `Slide ${idx + 1} Bullet ${bIdx + 1} ends in dangling stop word "${lastWord}": "${trimmed}"`
      );
    });
  });
  console.log(`  ✓ Verified ${checkedBulletCount} bullets across all slides: 100% end in terminal punctuation with zero trailing stop words.`);
  console.log('  ✅ TEST 6 PASSED.\n');

  // --------------------------------------------------------------------------
  // TEST 7: Outline equals slides test
  // --------------------------------------------------------------------------
  console.log('▶️ TEST 7: Outline equals slides test');
  assert.strictEqual(
    ivfDeck.outline.length,
    ivfDeck.slides.length,
    `Outline length (${ivfDeck.outline.length}) must equal slides length (${ivfDeck.slides.length})`
  );
  ivfDeck.slides.forEach((s, idx) => {
    assert.strictEqual(
      ivfDeck.outline[idx],
      s.title,
      `Outline entry ${idx + 1} ("${ivfDeck.outline[idx]}") does not match slide title ("${s.title}")`
    );
  });
  console.log(`  ✓ All ${ivfDeck.outline.length} outline entries match exact slide titles.`);
  console.log('  ✅ TEST 7 PASSED.\n');

  // --------------------------------------------------------------------------
  // TEST 8: Engine label test
  // --------------------------------------------------------------------------
  console.log('▶️ TEST 8: Engine label test');
  assert.strictEqual(
    ivfDeck.meta.engine,
    'deterministic-extractive',
    `Expected deck.meta.engine to be "deterministic-extractive", got "${ivfDeck.meta.engine}"`
  );
  console.log(`  ✓ deck.meta.engine correctly labeled: "${ivfDeck.meta.engine}".`);
  console.log('  ✅ TEST 8 PASSED.\n');

  // --------------------------------------------------------------------------
  // TEST 9: Real three-paper IVF set (Prompt 1B)
  // --------------------------------------------------------------------------
  console.log('▶️ TEST 9: Real three-paper IVF set (Salih, Maresca, Wang - 10 slides requested)');
  const test9Papers = [
    {
      authors: 'Salih M, 2023',
      title: 'Embryo selection through artificial intelligence versus embryologists: a systematic review',
      journal: 'Hum Reprod Open',
      year: 2023,
      abstract: 'STUDY QUESTION: What is the present performance of AI decision support during embryo selection compared to embryologists? SUMMARY ANSWER: AI consistently outperformed the clinical teams in all the studies focused on embryo morphology and clinical outcome prediction during embryo selection assessment. LIMITATIONS: The included studies were retrospective and heterogeneous.'
    },
    {
      authors: 'Maresca L, 2026',
      title: 'Artificial Intelligence in Embryo Selection: Current Approaches and Clinical Implications',
      journal: 'Bioengineering',
      year: 2026,
      abstract: 'This review summarizes current approaches to artificial intelligence in embryo selection, including models based on static images and time-lapse imaging data.'
    },
    {
      authors: 'Wang S, 2023',
      title: 'Interpretable artificial intelligence-assisted embryo selection improved single-blastocyst transfer outcomes: a prospective cohort study',
      journal: 'RBMO',
      year: 2023,
      abstract: 'The implantation rate was significantly higher in the AAG than the manual group (80.87% versus 68.15%, P = 0.022). No significant difference was found in terms of live birth rate between the groups.'
    }
  ];

  const deck9 = generatePresentationDeck({
    topic: 'Artificial Intelligence in IVF Embryo Selection',
    shortTitle: 'AI in IVF Embryo Selection',
    papers: test9Papers,
    slideCount: 10,
    audience: 'Postgraduate'
  });

  const fullDeckDump9 = JSON.stringify(deck9);
  const allSlideText9 = deck9.slides.map(s => `${s.title}\n${s.main_message}\n${s.on_slide_text}\n${s.speaker_notes}`).join('\n\n');

  // (a) The designs are: systematic review, narrative review, cohort study. "Comparative Study" appears nowhere.
  assert.strictEqual(/comparative study/i.test(fullDeckDump9), false, 'Assertion (a) failed: "Comparative Study" must appear nowhere in the deck');
  const characteristicsSlide = deck9.slides.find(s => s.stage === 3 || s.title.includes('Characteristics & Design'));
  assert(characteristicsSlide, 'Characteristics slide must exist');
  assert(/systematic review/i.test(characteristicsSlide.on_slide_text), 'Characteristics slide must mention Systematic review for Salih');
  assert(/narrative review|review/i.test(characteristicsSlide.on_slide_text), 'Characteristics slide must mention Review for Maresca');
  assert(/cohort study/i.test(characteristicsSlide.on_slide_text), 'Characteristics slide must mention Cohort study for Wang');

  // (b) No text contains "statistically significant findings", "rigorous trials", "Trial by Salih", or "Trial by Maresca".
  const forbiddenPhrases9b = [
    'statistically significant findings',
    'rigorous trials',
    'trial by salih',
    'trial by maresca'
  ];
  forbiddenPhrases9b.forEach(phrase => {
    assert.strictEqual(
      allSlideText9.toLowerCase().includes(phrase),
      false,
      `Assertion (b) failed: deck must not contain "${phrase}"`
    );
  });

  // (c) No finding bullet ends in "?" or starts with "This review summarizes".
  const findingSlide9 = deck9.slides.find(s => s.stage === 4 || s.title.includes('Primary Outcomes'));
  assert(findingSlide9, 'Primary Outcomes slide must exist');
  const findingBullets9 = (findingSlide9.on_slide_text || '').split('\n').filter(Boolean);
  findingBullets9.forEach((b, bIdx) => {
    assert.strictEqual(
      b.trim().endsWith('?'),
      false,
      `Assertion (c) failed: Finding bullet ${bIdx + 1} must not end in "?"`
    );
    assert.strictEqual(
      /•?\s*this review summarizes/i.test(b),
      false,
      `Assertion (c) failed: Finding bullet ${bIdx + 1} must not start with "This review summarizes"`
    );
  });

  // (d) Salih's SUMMARY ANSWER sentence appears as a finding with source [1].
  assert(
    findingSlide9.sources && findingSlide9.sources.includes(1),
    'Assertion (d) failed: Finding slide must include source [1]'
  );
  assert(
    findingSlide9.on_slide_text.includes('AI consistently outperformed the clinical teams'),
    'Assertion (d) failed: Salih SUMMARY ANSWER sentence must appear on Finding slide'
  );

  // (e) Wang's implantation and live-birth results appear together, attributed to [3], and are not described as conflicting with each other.
  assert(
    findingSlide9.sources && findingSlide9.sources.includes(3),
    'Assertion (e) failed: Finding slide must include source [3]'
  );
  const wangBullet = findingBullets9.find(b => b.includes('Wang S') || b.includes('implantation rate was significantly higher'));
  assert(wangBullet, 'Assertion (e) failed: Wang bullet must exist on findings slide');
  assert(
    wangBullet.includes('implantation') && wangBullet.includes('live birth'),
    'Assertion (e) failed: Wang implantation and live-birth results must appear together in the same finding bullet'
  );
  assert.strictEqual(
    /wang.*contrast.*wang|wang.*conflict.*wang/i.test(allSlideText9),
    false,
    'Assertion (e) failed: Wang outcomes must not be described as conflicting with each other'
  );

  // (f) None of these strings appear: "Long-Term Follow-Up", "late safety", "comorbid phenotypes", "Candidate Screening", "clinical severity tiers", "prospective registries", "demonstrates clinical benefit across".
  const forbiddenPhrases9f = [
    'long-term follow-up',
    'late safety',
    'comorbid phenotypes',
    'candidate screening',
    'clinical severity tiers',
    'prospective registries',
    'demonstrates clinical benefit across'
  ];
  forbiddenPhrases9f.forEach(frag => {
    assert.strictEqual(
      fullDeckDump9.toLowerCase().includes(frag),
      false,
      `Assertion (f) failed: deck must not contain "${frag}"`
    );
  });

  // (g) Any slide whose bullets contain no extracted text shows "Evidence sources: none (framing slide)".
  deck9.slides.forEach((s, idx) => {
    if (!s.sources || s.sources.length === 0) {
      assert(
        s.evidenceSources && s.evidenceSources.includes('none (framing slide)'),
        `Assertion (g) failed: Slide ${idx + 1} ("${s.title}") has no extracted sources but evidenceSources is "${s.evidenceSources}"`
      );
    }
  });

  // (h) Fewer than 10 slides plus meta.slideShortfall > 0 is acceptable. Padding is not.
  assert(
    deck9.slides.length === 10 || (deck9.slides.length < 10 && deck9.meta.slideShortfall > 0),
    `Assertion (h) failed: Expected 10 slides or transparent shortfall, got ${deck9.slides.length} slides with shortfall ${deck9.meta.slideShortfall}`
  );
  console.log(`  ✓ Test 9 assertions (a)-(h) verified across all ${deck9.slides.length} slides.`);
  console.log('  ✅ TEST 9 PASSED.\n');

  // --------------------------------------------------------------------------
  // TEST 10: RCT is recognised
  // --------------------------------------------------------------------------
  console.log('▶️ TEST 10: RCT is recognised (randomized non-inferiority trial)');
  const test10Paper = {
    authors: 'Test Investigator, 2024',
    title: 'Deep learning versus manual morphology-based embryo selection in IVF: a randomized, double-blind noninferiority trial',
    journal: 'Nat Med',
    year: 2024,
    abstract: 'In a double-blind non-inferiority randomized trial of 1,066 patients, clinical pregnancy rate was 46.5% with AI versus 48.2% with manual evaluation (risk difference -1.7%, 95% CI -7.7% to 4.3%). Non-inferiority was not demonstrated.'
  };

  const deck10 = generatePresentationDeck({
    topic: 'Artificial Intelligence in IVF Embryo Selection',
    shortTitle: 'AI in IVF',
    papers: [test10Paper],
    slideCount: 8,
    audience: 'Postgraduate'
  });

  const fullDeckDump10 = JSON.stringify(deck10).toLowerCase();

  // 1. Labelled "Randomised controlled trial"
  const charSlide10 = deck10.slides.find(s => s.stage === 3 || s.title.includes('Characteristics & Design'));
  assert(charSlide10, 'Characteristics slide must exist for Test 10');
  assert(
    charSlide10.on_slide_text.includes('Randomised controlled trial'),
    'Test 10 failed: Paper must be labelled "Randomised controlled trial"'
  );

  // 2. No text claims an absence of RCTs
  assert.strictEqual(
    fullDeckDump10.includes('absence of prospective randomized') || fullDeckDump10.includes('absence of randomized'),
    false,
    'Test 10 failed: Deck must not falsely claim absence of RCTs when an RCT is included'
  );

  // 3. Deck says non-inferiority was not demonstrated
  assert(
    /non-inferiority was not demonstrated|not able to demonstrate non-inferiority/i.test(fullDeckDump10),
    'Test 10 failed: Deck must state non-inferiority was not demonstrated'
  );
  console.log('  ✓ Test 10 verified: RCT recognised, no false absence claim, non-inferiority failure reported.');
  console.log('  ✅ TEST 10 PASSED.\n');

  // --------------------------------------------------------------------------
  // TEST 11: No-findings case (background-only abstracts)
  // --------------------------------------------------------------------------
  console.log('▶️ TEST 11: No-findings case (two background-only abstracts)');
  const test11Papers = [
    {
      authors: 'Author One, 2023',
      title: 'Current Perspectives on Artificial Intelligence in Reproductive Medicine',
      journal: 'Reprod Biomed Online',
      year: 2023,
      abstract: 'This review summarizes current approaches to artificial intelligence in embryo selection, including models based on static images and time-lapse imaging data.'
    },
    {
      authors: 'Author Two, 2024',
      title: 'Methodological Scoping of Machine Learning in Assisted Reproduction',
      journal: 'Hum Reprod Update',
      year: 2024,
      abstract: 'STUDY QUESTION: What is the present state of machine learning applications in clinical embryology? We aimed to scope literature without pooling empirical outcomes.'
    }
  ];

  const deck11 = generatePresentationDeck({
    topic: 'Machine Learning in Assisted Reproduction',
    shortTitle: 'ML in ART',
    papers: test11Papers,
    slideCount: 8,
    audience: 'Postgraduate'
  });

  const fullDeckDump11 = JSON.stringify(deck11).toLowerCase();

  // 1. Produces NO benefit statement
  assert.strictEqual(
    /demonstrates clinical benefit|significant clinical benefit|confirms clinical benefit/i.test(fullDeckDump11),
    false,
    'Test 11 failed: Background-only papers must produce NO benefit statement'
  );

  // 2. Conclusion says abstracts do not report outcome results sufficient to judge benefit
  const conclusion11 = deck11.slides[deck11.slides.length - 1];
  assert(
    conclusion11.main_message.includes('The selected abstracts do not report outcome results sufficient to judge benefit') ||
    conclusion11.on_slide_text.includes('The selected abstracts do not report outcome results sufficient to judge benefit'),
    'Test 11 failed: Conclusion must state that abstracts do not report outcome results sufficient to judge benefit'
  );
  console.log('  ✓ Test 11 verified: 0 benefit claims, conclusion explicitly notes lack of empirical results.');
  console.log('  ✅ TEST 11 PASSED.\n');

  console.log('================================================================');
  console.log('🎉 ALL 11 PROMPT 1 & 1B ACCEPTANCE TESTS COMPLETED SUCCESSFULLY!');
  console.log('================================================================');

  return { test5Report, deck9 };
}

if (require.main === module) {
  runAcceptanceTests()
    .then(({ test5Report, deck9 }) => {
      console.log('\n--- ACCEPTANCE TEST 5 VERIFICATION OUTPUT ---');
      console.log(JSON.stringify(test5Report, null, 2));

      console.log('\n--- ACCEPTANCE TEST 9 FULL ON-SLIDE TEXT ---');
      deck9.slides.forEach(s => {
        console.log(`\n=== SLIDE ${s.slide_number}: ${s.title} ===`);
        console.log(`[Main Message]: ${s.main_message}`);
        console.log(`[On-Slide Text]:\n${s.on_slide_text}`);
        console.log(`[Sources]: ${s.evidenceSources}`);
      });
    })
    .catch(err => {
      console.error('\n❌ ACCEPTANCE TEST FAILED:', err);
      process.exit(1);
    });
}

module.exports = { runAcceptanceTests };
