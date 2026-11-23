/**
 * Preppt LLM Synthesizer (lib/llm-synthesizer.js)
 * Connects to available LLM providers (Groq, Gemini, OpenAI, Anthropic)
 * to perform generative synthesis strictly grounded in extracted evidence records.
 */

const https = require('https');
const { extractEvidenceRecords } = require('./evidence-extractor.js');

const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-3-5-haiku-20241022';

function callHttps(options, postData) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({ statusCode: res.statusCode, headers: res.headers, body: data });
      });
    });
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('LLM API request timed out (28s limit reached)'));
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

/**
 * Builds the comprehensive synthesis prompt for the LLM based on extracted evidence records
 */
function buildSynthesisPrompt({ topic, shortTitle, records, audience, slideCount, density, visualStyle }) {
  const paperSummaries = records.map(r => {
    return `[Study ${r.refNumber}] Title: ${r.title}
Authors: ${r.authors} (${r.year || 'n.d.'})
Journal: ${r.journal}
Design: ${r.designFromSource}
Key Findings: ${r.keyFindingSentences && r.keyFindingSentences.length > 0 ? r.keyFindingSentences.join(' ') : 'No abstract findings available.'}
Outcome Directions: ${r.outcomes.map(o => `${o.name}: ${o.direction}`).join('; ') || 'unclear'}
Author-Stated Limitations: ${r.authorStatedLimitations && r.authorStatedLimitations.length > 0 ? r.authorStatedLimitations.join(' ') : 'None stated.'}`;
  }).join('\n\n');

  return `You are a distinguished medical researcher, clinical professor, and master scientific communicator.
Your task is to synthesize peer-reviewed literature into a publication-grade scientific presentation deck of EXACTLY ${slideCount} slides for a ${audience} audience.

TOPIC: "${topic}"
SHORT TITLE: "${shortTitle}"
AUDIENCE: "${audience}"
SLIDE DENSITY: "${density}"
VISUAL STYLE: "${visualStyle}"
EXACT SLIDE COUNT: ${slideCount}

CURATED EVIDENCE RECORDS:
${paperSummaries}

NARRATIVE ARC REQUIREMENTS (Strictly chronological & topic-neutral):
Slide 1: Title Slide (Topic, short title, scope, audience)
Slide 2: Clinical Dilemma & Study Scope (Motivating clinical question, target cohorts, eligibility)
Slide 3: Characteristics & Overview of Included Studies (Table/summary of study designs, sample sizes, settings)
Slide 4: What the Studies Found: Primary Outcomes (Empirical results, effect sizes, statistical measures)
Slide 5: Conflicting Evidence or Null Findings (MANDATORY if any study showed no difference or failed non-inferiority)
Slide 6: Methodological & Evidence Limitations (Study constraints, author limitations, bias risks)
Slide 7: Unresolved Questions & Research Horizons (Gaps derived from the evidence)
Slide 8 to ${slideCount}: Conclusion & Practice Take-Homes (Evidence-grounded synthesis; if findings are mixed or null, state clearly)

STRICT NEGATIVE CONSTRAINTS:
1. Ground every slide strictly in "${topic}" and the provided evidence records.
2. DO NOT state any effect, benefit, risk, statistic, or clinical advantage that is not present in the evidence records. If evidence is absent, equivocal, or mixed, say so explicitly.
3. DO NOT insert generic cardiovascular, metabolic, or drug template statements unless they appear in the provided evidence.
4. If a study reports no significant difference or failed non-inferiority, you MUST report that finding accurately. Never reword a null finding as benefit.
5. ZERO in-text citations in on-slide text or speaker notes (no [1], no "(Smith et al.)"). Citations belong in the references section and in the "sources" metadata field.
6. Each slide MUST have all 10 mandatory fields populated.

OUTPUT FORMAT:
Return a single, raw, valid JSON object with no markdown fences, matching this exact structure:
{
  "slides": [
    {
      "slide_number": 1,
      "title": "Exact Title",
      "objective": "Clear single-sentence educational objective.",
      "main_message": "Core takeaway message for this slide.",
      "on_slide_text": "• Bullet point 1\\n• Bullet point 2\\n• Bullet point 3\\n• Bullet point 4",
      "suggested_visual_type": "Diagram",
      "detailed_visual_description": "Detailed visual layout description matching ${visualStyle} and visual type.",
      "speaker_notes": "Rich presenter script (120-220 words) guiding oral delivery without stock hype.",
      "interactive_question": "Provocative clinical question to engage the audience.",
      "logical_transition": "Spoken bridge transitioning to the next slide.",
      "sources": [1]
    }
  ],
  "synthesisPlan": {
    "objective": "Evidence synthesis objective for ${shortTitle}",
    "methodologyNote": "Narrative evidence synthesis differentiating consistent findings from unresolved dilemmas.",
    "themes": [
      {
        "title": "Primary Efficacy & Outcome Directions",
        "scope": "Synthesis of reported empirical findings and primary endpoint directions.",
        "consistentFindings": "Consistent findings across included studies, citing references [e.g. 1, 2].",
        "uncertainOrUnresolvedAreas": "Uncertain areas or conflicting evidence requiring further investigation."
      }
    ]
  },
  "researchGaps": [
    "Priority investigational gap 1",
    "Priority investigational gap 2"
  ]
}`;
}

/**
 * Validates and post-checks LLM generated deck against evidence records (Prompt 1 & Prompt 1B E1-E7)
 */
function validateAndCleanLlmOutput(deck, records) {
  if (!deck || !Array.isArray(deck.slides) || deck.slides.length === 0) {
    throw new Error('LLM output does not contain a valid slides array');
  }

  const validRefNumbers = new Set(records.map(r => r.refNumber));
  const nullRecords = records.filter(r => r.outcomes.some(o => o.direction === 'no difference' || o.direction === 'favours comparator'));
  const nullRefNumbers = new Set(nullRecords.map(r => r.refNumber));
  const hasBenefitOutcome = records.some(r => r.outcomes.some(o => o.direction === 'favours intervention'));

  const FORBIDDEN_FRAGMENTS = [
    'comparative study',
    'long-term follow-up',
    'late safety',
    'comorbid phenotypes',
    'candidate screening',
    'clinical severity tiers',
    'prospective registries',
    'demonstrates clinical benefit across',
    'trial by salih',
    'trial by maresca',
    'statistically significant findings'
  ];

  deck.slides.forEach((s, idx) => {
    // Ensure sources is an array of numbers
    if (!Array.isArray(s.sources)) {
      s.sources = [];
    }
    s.sources = s.sources.filter(ref => typeof ref === 'number' && validRefNumbers.has(ref));

    // Framing slide check: if sources is empty, format evidenceSources accordingly
    if (s.sources.length === 0) {
      s.evidenceSources = 'Evidence sources: none (framing slide)';
    } else {
      s.evidenceSources = `Evidence sources: ${s.sources.map(ref => `[${ref}]`).join(', ')}`;
    }

    const text = `${s.title} ${s.main_message || ''} ${s.on_slide_text || ''} ${s.speaker_notes || ''}`.toLowerCase();

    // Check forbidden template fragments
    FORBIDDEN_FRAGMENTS.forEach(frag => {
      if (text.includes(frag)) {
        throw new Error(`LLM output contained forbidden template fragment "${frag}" on Slide ${idx + 1}`);
      }
    });

    // Post-check: If no study showed benefit, verify it doesn't falsely claim benefit
    if (!hasBenefitOutcome) {
      if (text.includes('demonstrates clinical benefit') || text.includes('significant clinical benefit') || text.includes('superior to control')) {
        throw new Error(`LLM output falsely claimed benefit when no approved evidence demonstrated benefit (Slide ${idx + 1})`);
      }
    }

    // Post-check: If slide cites a null record only, verify it doesn't falsely claim benefit
    const citesNullOnly = s.sources.length > 0 && s.sources.every(ref => nullRefNumbers.has(ref));
    if (citesNullOnly) {
      if (text.includes('confirms significant clinical benefit') || text.includes('significant clinical efficacy')) {
        throw new Error(`LLM output falsely claimed benefit on null/negative evidence for Slide ${idx + 1}`);
      }
    }
  });

  return deck;
}

/**
 * Attempts LLM invocation across available provider keys
 */
async function generateDeckWithLLM(params) {
  const groqKey = process.env.GROQ_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  if (!groqKey && !geminiKey && !openaiKey && !anthropicKey) {
    return null; // No LLM key configured in environment
  }

  const records = extractEvidenceRecords(params.papers || []);
  const prompt = buildSynthesisPrompt({ ...params, records });

  // 1. Try Groq
  if (groqKey) {
    try {
      console.log(`Invoking Groq LLM (${GROQ_MODEL}) for slide synthesis...`);
      const payload = JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: 'system', content: 'You are a scientific literature synthesis engine that outputs strictly valid JSON without markdown fences.' },
          { role: 'user', content: prompt }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.15,
        max_tokens: 6000
      });

      const res = await callHttps({
        hostname: 'api.groq.com',
        path: '/openai/v1/chat/completions',
        method: 'POST',
        timeout: 28000,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${groqKey}`
        }
      }, payload);

      if (res.statusCode === 200) {
        const body = JSON.parse(res.body);
        const text = body.choices?.[0]?.message?.content;
        if (text) {
          const parsed = JSON.parse(text);
          const checked = validateAndCleanLlmOutput(parsed, records);
          return { ...checked, provider: 'groq' };
        }
      } else {
        console.error(`Groq LLM provider rejected model ${GROQ_MODEL} with status ${res.statusCode}:`, res.body.substring(0, 300));
      }
    } catch (groqErr) {
      console.warn('Groq LLM call failed:', groqErr.message);
    }
  }

  // 2. Try Gemini
  if (geminiKey) {
    try {
      console.log(`Invoking Google Gemini (${GEMINI_MODEL}) for slide synthesis...`);
      const payload = JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.15,
          responseMimeType: 'application/json'
        }
      });

      const res = await callHttps({
        hostname: 'generativelanguage.googleapis.com',
        path: `/v1beta/models/${GEMINI_MODEL}:generateContent?key=${geminiKey}`,
        method: 'POST',
        timeout: 28000,
        headers: { 'Content-Type': 'application/json' }
      }, payload);

      if (res.statusCode === 200) {
        const body = JSON.parse(res.body);
        const text = body.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          const parsed = JSON.parse(text);
          const checked = validateAndCleanLlmOutput(parsed, records);
          return { ...checked, provider: 'gemini' };
        }
      } else {
        console.error(`Gemini provider rejected model ${GEMINI_MODEL} with status ${res.statusCode}:`, res.body.substring(0, 300));
      }
    } catch (geminiErr) {
      console.warn('Gemini LLM call failed:', geminiErr.message);
    }
  }

  // 3. Try OpenAI
  if (openaiKey) {
    try {
      console.log(`Invoking OpenAI (${OPENAI_MODEL}) for slide synthesis...`);
      const payload = JSON.stringify({
        model: OPENAI_MODEL,
        messages: [
          { role: 'system', content: 'You are a scientific literature synthesis engine that outputs strictly valid JSON without markdown fences.' },
          { role: 'user', content: prompt }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.15
      });

      const res = await callHttps({
        hostname: 'api.openai.com',
        path: '/v1/chat/completions',
        method: 'POST',
        timeout: 28000,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openaiKey}`
        }
      }, payload);

      if (res.statusCode === 200) {
        const body = JSON.parse(res.body);
        const text = body.choices?.[0]?.message?.content;
        if (text) {
          const parsed = JSON.parse(text);
          const checked = validateAndCleanLlmOutput(parsed, records);
          return { ...checked, provider: 'openai' };
        }
      } else {
        console.error(`OpenAI provider rejected model ${OPENAI_MODEL} with status ${res.statusCode}:`, res.body.substring(0, 300));
      }
    } catch (openAiErr) {
      console.warn('OpenAI LLM call failed:', openAiErr.message);
    }
  }

  // 4. Try Anthropic
  if (anthropicKey) {
    try {
      console.log(`Invoking Anthropic Claude (${ANTHROPIC_MODEL}) for slide synthesis...`);
      const payload = JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 4096,
        messages: [
          { role: 'user', content: prompt }
        ]
      });

      const res = await callHttps({
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        timeout: 28000,
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01'
        }
      }, payload);

      if (res.statusCode === 200) {
        const body = JSON.parse(res.body);
        const text = body.content?.[0]?.text;
        if (text) {
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            const checked = validateAndCleanLlmOutput(parsed, records);
            return { ...checked, provider: 'anthropic' };
          }
        }
      } else {
        console.error(`Anthropic provider rejected model ${ANTHROPIC_MODEL} with status ${res.statusCode}:`, res.body.substring(0, 300));
      }
    } catch (anthropicErr) {
      console.warn('Anthropic LLM call failed:', anthropicErr.message);
    }
  }

  throw new Error('Configured LLM providers encountered an upstream API failure or rate limit.');
}

module.exports = {
  generateDeckWithLLM,
  buildSynthesisPrompt,
  validateAndCleanLlmOutput
};
