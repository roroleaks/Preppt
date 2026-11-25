const { generatePresentationDeck } = require('../lib/synthesize.js');
const { generateDeckWithLLM } = require('../lib/llm-synthesizer.js');
const { validatePresentationOutput } = require('../lib/validator.js');
const { stripCitations } = require('../lib/text-rules.js');

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
    if (!data || typeof data !== 'object' || !Array.isArray(data.papers) || data.papers.length === 0) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.end(JSON.stringify({ error: 'At least one approved paper is required to generate the presentation deck.' }));
    }
    if (data.slideCount !== undefined && (!Number.isFinite(Number(data.slideCount)) || Number(data.slideCount) < 1)) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.end(JSON.stringify({ error: 'Invalid slideCount parameter.' }));
    }
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
    const currentYear = new Date().getFullYear();

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
            const slideSources = Array.isArray(s.sources) ? s.sources : [];
            const evidenceSourcesText = slideSources.length > 0
              ? `Evidence sources for this slide: ${slideSources.map(ref => `[${ref}]`).join(', ')}`
              : 'Evidence sources for this slide: None (Methodological overview)';

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

              sources: slideSources,
              evidenceSources: evidenceSourcesText,

              slideRatio: '16:9',
              font: 'Arial',
              fontSizeTarget: '12-14 pt (minimum legibility floor)',
              textOccupancyTarget: '<50% visual slide area',
              slideDensity: synthesisParams.density || 'Balanced',
              visual_style: activeVisualStyle,
              visualStyle: activeVisualStyle,
              audience: synthesisParams.audience || 'Postgraduate',
              footer_copyright: `© ${currentYear} Raouf Roshdy. All rights reserved. (copyrights@Raouf Roshdy${currentYear})`,
              footerCopyright: `© ${currentYear} Raouf Roshdy. All rights reserved. (copyrights@Raouf Roshdy${currentYear})`,
              footer_format: 'Arial 9 pt, right lower corner'
            };
          });

          if (llmResult.synthesisPlan) {
            deck.synthesisPlan = { ...deck.synthesisPlan, ...llmResult.synthesisPlan };
          }
          if (llmResult.researchGaps) {
            deck.researchGaps = llmResult.researchGaps;
          }
          deck.meta.engine = `llm:${llmResult.provider || 'configured'}`;
          deck.outline = deck.slides.map(s => s.title);
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

    // Prompt 2B - Generator self-check & auto-repair
    try {
      let validation = validatePresentationOutput({
        deck,
        papers: synthesisParams.papers,
        topic: synthesisParams.topic,
        requestedSlideCount: synthesisParams.slideCount
      });

      for (let pass = 1; pass <= 3 && validation.failedCount > 0; pass++) {
        console.warn(`Deck failed generator self-check (${validation.failedCount} failures). Initiating auto-repair pass ${pass}/3...`);
        const failedChecks = (validation.checks || []).filter(c => c.status === 'fail');
        const failedSlideNums = new Set();
        for (const fc of failedChecks) {
          const matches = (fc.details || '').matchAll(/Slide\s+(\d+)/gi);
          for (const m of matches) failedSlideNums.add(Number(m[1]));
        }

        deck.slides.forEach((s, idx) => {
          const slideNum = s.slide_number || s.slideNumber || (idx + 1);
          const originalBullets = (s.on_slide_text || '').split('\n').filter(Boolean);
          const filteredBullets = [];
          const filteredData = [];

          originalBullets.forEach((b, bIdx) => {
            const clean = stripCitations(b.replace(/^[•\s-]+/, '').trim());
            const openP = (clean.match(/\(/g) || []).length;
            const closeP = (clean.match(/\)/g) || []).length;
            const openB = (clean.match(/\[/g) || []).length;
            const closeB = (clean.match(/\]/g) || []).length;
            if (openP !== closeP || openB !== closeB) return;
            if (/\(\s*\d+[\s\.]*$/.test(clean) || /\[\s*\d+[\s\.]*$/.test(clean)) return;

            // If this slide was flagged on a bullet-level failure, drop offending bullet
            if (failedSlideNums.has(slideNum)) {
              const bulletMentioned = failedChecks.some(fc =>
                (fc.details || '').includes(`Slide ${slideNum} bullet ${bIdx + 1}`) ||
                (fc.details || '').includes(`Slide ${slideNum} finding bullet`)
              );
              if (bulletMentioned) return;
            }

            const rebuilt = clean ? `• ${clean}` : '';
            if (rebuilt) {
              filteredBullets.push(rebuilt);
              if (Array.isArray(s.bulletsData) && s.bulletsData[bIdx]) {
                filteredData.push({ ...s.bulletsData[bIdx], text: rebuilt });
              }
            }
          });

          if (filteredBullets.length === 0 && originalBullets.length > 0) {
            const fallbackMsg = '• No eligible finding in the selected papers for this section.';
            filteredBullets.push(fallbackMsg);
            s.sources = [];
          }

          s.on_slide_text = filteredBullets.join('\n');
          s.onSlideText = s.on_slide_text;
          s.bullets = filteredBullets;
          if (filteredData.length > 0) s.bulletsData = filteredData;
        });

        validation = validatePresentationOutput({
          deck,
          papers: synthesisParams.papers,
          topic: synthesisParams.topic,
          requestedSlideCount: synthesisParams.slideCount
        });
      }

      deck.validation = validation;
      if (validation.failedCount > 0) {
        deck.selfCheck = {
          status: 'failed',
          failures: (validation.checks || []).filter(c => c.status === 'fail')
        };
      }
    } catch (selfCheckErr) {
      console.error('Internal self-check error:', selfCheckErr);
      deck.selfCheck = {
        status: 'error',
        message: 'Internal quality check could not run; please review the deck manually.'
      };
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.end(JSON.stringify(deck));
  } catch (err) {
    console.error('Synthesis error:', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.end(JSON.stringify({ error: 'Synthesis failed. Please retry.' }));
  }
};
