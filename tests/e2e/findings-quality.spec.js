/**
 * Findings quality regression (audit D-09, D-11 – D-16) on the real audit abstracts.
 */
const assert = require('assert');
const { generatePresentationDeck } = require('../../lib/synthesize.js');
const { proposeKeywords, buildSearchStrategy } = require('../../lib/keywords.js');
const { validatePresentationOutput } = require('../../lib/validator.js');

function build(fixture, audience = 'Postgraduate', density = 'Balanced', slideCount = 10) {
  const fx = require(`../fixtures/${fixture}.json`);
  const k = proposeKeywords(fx.topic);
  const st = buildSearchStrategy({ topic: fx.topic, ...k, startYear: 2017 });
  const deck = generatePresentationDeck({ topic: fx.topic, shortTitle: 'Audit deck', papers: fx.papers, slideCount, audience, density, approvedKeywords: k, approvedStrategy: st });
  const validation = validatePresentationOutput({ deck, papers: fx.papers, requestedSlideCount: slideCount, topic: fx.topic });
  return { fx, deck, validation, bullets: deck.slides.flatMap(s => (s.on_slide_text || '').split('\n')).filter(Boolean) };
}

for (const [fixture, audience, density] of [
  ['audit-sglt2-hfpef', 'Postgraduate', 'Balanced'],
  ['audit-sglt2-hfpef', 'Public audience', 'Short bullet points'],
  ['audit-txa-pph', 'Consultants', 'Detailed'],
  ['audit-txa-pph', 'Undergraduate', 'Balanced']
]) {
  const { deck, validation, bullets } = build(fixture, audience, density);
  const tag = `${fixture} / ${audience} / ${density}`;
  assert.strictEqual(validation.failedCount, 0, `${tag}: generated deck must pass its own pre-export checks: ${JSON.stringify(validation.checks.filter(c => c.status === 'fail'))}`);
  bullets.forEach(b => {
    assert.ok(!/\([A-Z][A-Za-zÀ-ÿ'’-]+ \d{4}\)\.?$/.test(b), `${tag}: trailing author-year citation: ${b}`);
    assert.ok(!/^•\s*:/.test(b), `${tag}: empty label: ${b}`);
    assert.ok(!/\b(?:BACKGROUND|SUMMARY|RESULTS?|CONCLUSIONS?)\b\s*:?\s+[A-Z]/.test(b), `${tag}: raw abstract section header: ${b}`);
    assert.ok(!/^•\s*(?:We included|A total of \d|Twenty articles)/i.test(b), `${tag}: sample description presented as a finding: ${b}`);
    assert.ok(!/audience audience|Practice Dilemma: Resolving whether routine clinical adoption\.$/.test(b), `${tag}: broken framing text: ${b}`);
  });
  const all = deck.slides.map(s => `${s.main_message} ${s.speaker_notes}`).join(' ');
  assert.ok(!/without extrapolated claims|strict claim-to-source traceability|corroborating primary findings/i.test(all), `${tag}: false-assurance boilerplate remains`);
  assert.ok(!/No research gaps could be derived/.test(deck.slides.map(s => s.on_slide_text).join(' ')), `${tag}: research gaps must be derived from author statements`);
}
console.log('   ✓ 4 audience/density combinations: 0 failed checks, no citations, labels, headers, sample sentences or boilerplate.');

{
  const { bullets, deck } = build('audit-sglt2-hfpef', 'Public audience', 'Short bullet points');
  const findings = deck.slides.find(s => /What the Studies Found/.test(s.title)).on_slide_text;
  assert.ok(/about 18% lower risk/.test(findings), `plain-language effect for the public: ${findings}`);
  assert.ok(!/95% CI|p<0\.0/.test(findings), 'no CI / p-values on public slides');
  assert.ok(deck.slides.every(s => !/your team|your practice|clinical experience/i.test(s.interactive_question)), 'public questions must not address clinicians');
  void bullets;
}
console.log('   ✓ Public audience: "HR 0.82" → "about 18% lower risk"; no CIs/p-values; lay questions.');

{
  const { deck } = build('audit-sglt2-hfpef');
  const f = deck.slides.find(s => /What the Studies Found/.test(s.title));
  assert.strictEqual(f.suggested_visual_type, 'Forest plot');
  assert.ok(/Solomon 2022 \(primary outcome\) HR 0\.82 \[0\.73–0\.92\]/.test(f.detailed_visual_description), f.detailed_visual_description);
  const scope = deck.slides[1].on_slide_text;
  assert.ok(/Population: Heart Failure with preserved ejection fraction/i.test(scope), 'population comes from the topic, not an off-topic abstract');
  assert.ok(!/40% or less/.test(scope));
}
console.log('   ✓ Data-bound forest-plot specification; population taken from the topic, not from an HFrEF abstract.');
console.log('\nPassed: Findings quality tests verified.');
