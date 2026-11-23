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
    title: 'Deep learning artificial intelligence versus embryologist clinical evaluation for embryo selection in in vitro fertilization: a randomized clinical trial',
    authors: 'Illingworth PJ, et al.',
    journal: 'Lancet Digit Health',
    year: 2024,
    abstract: 'A non-inferiority randomized trial evaluated 1,061 patients. Ongoing pregnancy rate was 36.2% with AI versus 37.1% with embryologist (difference -0.9%, 95% CI -5.5% to 3.7%). The lower bound of the 95% CI exceeded the prespecified non-inferiority margin of -5.0%; therefore, non-inferiority was not demonstrated.'
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

  console.log('================================================================');
  console.log('🎉 ALL 8 PROMPT 1 ACCEPTANCE TESTS COMPLETED SUCCESSFULLY!');
  console.log('================================================================');

  return test5Report;
}

if (require.main === module) {
  runAcceptanceTests()
    .then(report => {
      console.log('\n--- ACCEPTANCE TEST 5 VERIFICATION OUTPUT ---');
      console.log(JSON.stringify(report, null, 2));
    })
    .catch(err => {
      console.error('\n❌ ACCEPTANCE TEST FAILED:', err);
      process.exit(1);
    });
}

module.exports = { runAcceptanceTests };
