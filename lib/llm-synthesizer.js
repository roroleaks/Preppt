/**
 * Preppt LLM Synthesizer
 * Connects to available LLM providers (Groq, Gemini, OpenAI, Anthropic)
 * to perform real generative synthesis of presentation decks from literature.
 */
const https = require('https');

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
      reject(new Error('LLM API request timed out (25s limit reached)'));
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

/**
 * Builds the comprehensive synthesis prompt for the LLM
 */
function buildSynthesisPrompt({ topic, shortTitle, papers, audience, slideCount, density, visualStyle }) {
  const paperSummaries = papers.slice(0, 15).map((p, i) => {
    const authors = Array.isArray(p.authors) ? p.authors.join(', ') : (p.authors || 'Unknown');
    return `[Study ${i + 1}] Title: ${p.title}
Authors: ${authors} (${p.year || 'n.d.'})
Journal: ${p.journal || 'Academic Journal'}
Abstract: ${p.abstract || p.abstract_summary || 'No abstract summary available.'}`;
  }).join('\n\n');

  return `You are a distinguished medical researcher, clinical professor, and master scientific communicator.
Your task is to synthesize peer-reviewed literature into a publication-grade scientific presentation deck of EXACTLY ${slideCount} slides for a ${audience} audience.

TOPIC: "${topic}"
SHORT TITLE: "${shortTitle}"
AUDIENCE: "${audience}"
SLIDE DENSITY: "${density}"
VISUAL STYLE: "${visualStyle}"
EXACT SLIDE COUNT: ${slideCount} (You MUST generate exactly ${slideCount} slides, numbered 1 to ${slideCount})

CURATED EVIDENCE PAPERS:
${paperSummaries}

NARRATIVE ARC REQUIREMENTS (Strictly chronological):
Slide 1: Title Slide (Topic, short title, clinical scope, audience)
Slide 2: The Hook (Frontline clinical urgency, disease burden, diagnostic dilemma from evidence)
Slide 3: Definition & Scope (Clinical boundaries, diagnostic criteria, study eligibility)
Slide 4: Core Mechanistic Targets & Biological Action (Molecular pathways, receptor targets, physiological actions)
Slide 5: Clinical Impacts & Use Cases (Primary composite endpoints, hazard ratios, hospitalization decreases, trial results)
Slide 6: Clinical Safety & Risk Stratification (Adverse events, tolerability, vulnerable subgroups, study limitations)
Slide 7: The Future Outlook & Emerging Horizons (Combination therapies, predictive biomarkers, research gaps)
Slide 8 to ${slideCount}: Conclusion & Call to Action (Stepwise clinical decision algorithm, overarching synthesis, practice recommendations)

STRICT NEGATIVE CONSTRAINTS:
1. Ground every slide strictly in "${topic}" and the provided clinical evidence papers.
2. DO NOT mention "Artificial Intelligence", "AI", "Machine Learning", "Deep Learning", "Neural Network", "Algorithmic Bias", "Foundation Models", or "HL7/FHIR" UNLESS the user topic is specifically about artificial intelligence.
3. ZERO in-text citations anywhere on slides or speaker notes (no [1], no "(Smith et al.)"). Citations belong strictly in the final references section.
4. Each slide MUST have all 10 mandatory fields populated.

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
      "detailed_visual_description": "${visualStyle} style: Detailed layout description.",
      "speaker_notes": "Rich presenter script (150-250 words) guiding the oral delivery.",
      "interactive_question": "Provocative clinical question to engage the audience.",
      "logical_transition": "Natural spoken bridge transitioning to the next slide."
    }
  ],
  "synthesisPlan": {
    "objective": "Overall narrative synthesis objective for ${topic}",
    "methodologyNote": "Narrative evidence synthesis contrasting established findings from unresolved dilemmas.",
    "themes": [
      {
        "title": "Pathophysiological Rationale & Primary Biological Action",
        "scope": "Target pathways and biological action",
        "establishedFindings": "Established evidence confirmed across curated trials.",
        "uncertainOrUnresolvedAreas": "Uncertain areas requiring further investigation."
      }
    ]
  },
  "researchGaps": [
    "Priority investigational gap 1",
    "Priority investigational gap 2",
    "Priority investigational gap 3"
  ]
}`;
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

  const prompt = buildSynthesisPrompt(params);

  // 1. Try Groq (Ultra-fast inference ~500 tok/s)
  if (groqKey) {
    try {
      console.log('Invoking Groq LLM (llama-3.3-70b-versatile) for slide synthesis...');
      const payload = JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: 'You are a scientific literature synthesis engine that outputs strictly valid JSON.' },
          { role: 'user', content: prompt }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.2,
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
          if (Array.isArray(parsed.slides) && parsed.slides.length > 0) {
            return parsed;
          }
        }
      } else {
        console.warn(`Groq LLM returned status ${res.statusCode}:`, res.body.substring(0, 200));
      }
    } catch (groqErr) {
      console.warn('Groq LLM call failed:', groqErr.message);
    }
  }

  // 2. Try Gemini Flash
  if (geminiKey) {
    try {
      console.log('Invoking Google Gemini (gemini-2.0-flash) for slide synthesis...');
      const payload = JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: 'application/json'
        }
      });

      const res = await callHttps({
        hostname: 'generativelanguage.googleapis.com',
        path: `/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
        method: 'POST',
        timeout: 28000,
        headers: { 'Content-Type': 'application/json' }
      }, payload);

      if (res.statusCode === 200) {
        const body = JSON.parse(res.body);
        const text = body.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          const parsed = JSON.parse(text);
          if (Array.isArray(parsed.slides) && parsed.slides.length > 0) {
            return parsed;
          }
        }
      } else {
        console.warn(`Gemini LLM returned status ${res.statusCode}:`, res.body.substring(0, 200));
      }
    } catch (geminiErr) {
      console.warn('Gemini LLM call failed:', geminiErr.message);
    }
  }

  // 3. Try OpenAI
  if (openaiKey) {
    try {
      console.log('Invoking OpenAI (gpt-4o-mini) for slide synthesis...');
      const payload = JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are a scientific literature synthesis engine that outputs strictly valid JSON.' },
          { role: 'user', content: prompt }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.2
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
          if (Array.isArray(parsed.slides) && parsed.slides.length > 0) {
            return parsed;
          }
        }
      }
    } catch (openAiErr) {
      console.warn('OpenAI LLM call failed:', openAiErr.message);
    }
  }

  throw new Error('Configured LLM providers encountered an upstream API failure or rate limit.');
}

module.exports = {
  generateDeckWithLLM,
  buildSynthesisPrompt
};
