const { generatePresentationDeck } = require('../lib/synthesize.js');
const { generateDeckWithLLM } = require('../lib/llm-synthesizer.js');

async function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch (e) { return {}; }
  }
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch (e) { resolve({}); }
    });
    req.on('error', () => resolve({}));
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  try {
    const data = await parseBody(req);
    const synthesisParams = {
      topic: data.topic || 'Scientific Topic',
      shortTitle: data.shortTitle || '',
      papers: data.papers || [],
      targetPapers: data.targetPapers || 10,
      startYear: data.startYear || 2021,
      audience: data.audience || 'Postgraduate',
      slideCount: data.slideCount || 11,
      density: data.density || 'Balanced',
      visualStyle: data.visualStyle || 'Scientific pictorial',
      approvedKeywords: data.approvedKeywords || {},
      approvedStrategy: data.approvedStrategy || {}
    };

    const hasLlmKey = !!(process.env.GROQ_API_KEY || process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY);

    let deck = generatePresentationDeck(synthesisParams);

    if (hasLlmKey) {
      try {
        const llmResult = await generateDeckWithLLM(synthesisParams);
        if (llmResult && Array.isArray(llmResult.slides) && llmResult.slides.length > 0) {
          const activeVisualStyle = synthesisParams.visualStyle || 'Scientific pictorial';
          deck.slides = llmResult.slides.map((s, idx) => {
            const slideNumber = idx + 1;
            const mainMessage = s.main_message || s.mainMessage || '';
            const onSlideText = s.on_slide_text || s.onSlideText || '';
            const visualType = s.suggested_visual_type || s.suggestedVisualType || 'Diagram';
            const detailedVisual = s.detailed_visual_description || s.detailedVisualDescription || '';
            const speakerNotes = s.speaker_notes || s.speakerNotes || '';
            const audienceQuestion = s.interactive_question || s.audienceQuestion || '';
            const transition = s.logical_transition || s.transition || '';

            return {
              slide_number: slideNumber,
              title: s.title || `Slide ${slideNumber}`,
              objective: s.objective || '',
              main_message: mainMessage,
              on_slide_text: onSlideText,
              suggested_visual_type: visualType,
              detailed_visual_description: detailedVisual,
              speaker_notes: speakerNotes,
              interactive_question: audienceQuestion,
              logical_transition: transition,

              slideNumber,
              mainMessage,
              onSlideText,
              suggestedVisualType: visualType,
              detailedVisualDescription: detailedVisual,
              speakerNotes,
              audienceQuestion,
              transition,

              slideRatio: '16:9',
              font: 'Arial',
              fontSizeTarget: '12-14 pt (minimum legibility floor)',
              textOccupancyTarget: '<50% visual slide area',
              slideDensity: synthesisParams.density || 'Balanced',
              visual_style: activeVisualStyle,
              visualStyle: activeVisualStyle,
              audience: synthesisParams.audience || 'Postgraduate',
              footer_copyright: '© 2025 Raouf Roshdy. All rights reserved. (copyrights@Raouf Roshdy2025)',
              footerCopyright: '© 2025 Raouf Roshdy. All rights reserved. (copyrights@Raouf Roshdy2025)'
            };
          });

          if (llmResult.synthesisPlan) {
            deck.synthesisPlan = { ...deck.synthesisPlan, ...llmResult.synthesisPlan };
          }
          if (llmResult.researchGaps) {
            deck.researchGaps = llmResult.researchGaps;
          }
        }
      } catch (llmErr) {
        console.error('LLM synthesis failed:', llmErr);
        res.statusCode = 502;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        return res.end(JSON.stringify({
          error: `Upstream LLM synthesis failed: ${llmErr.message}. Ensure your API key is valid and has sufficient quota.`
        }));
      }
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.end(JSON.stringify(deck));
  } catch (err) {
    console.error('Synthesis error:', err);
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.end(JSON.stringify({ error: err.message }));
  }
};
