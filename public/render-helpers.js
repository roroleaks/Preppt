/**
 * Preppt Render Helpers (public/render-helpers.js)
 * Pure HTML escaping, URL sanitization, and card markup builders shared between
 * the browser bundle (public/app.js) and offline XSS tests.
 */
(function (root) {
  function escapeHtml(v) {
    return String(v ?? '').replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function safeUrl(u) {
    try {
      const origin = (typeof location !== 'undefined' && location.origin) ? location.origin : 'https://preppt.local';
      const x = new URL(String(u), origin);
      return (x.protocol === 'https:' || x.protocol === 'http:') ? x.href : '#';
    } catch {
      return '#';
    }
  }

  function formatMultilineHtml(v) {
    return escapeHtml(v).replace(/\n/g, '<br>');
  }

  function buildPaperCardHtml(paper, idx, isSelected) {
    let srcBadge = '';
    if (paper.sources && paper.sources.length > 1) {
      srcBadge = `<span class="badge badge-both">${escapeHtml(paper.sources.join(' + '))}</span>`;
    } else if (paper.source === 'both') {
      srcBadge = '<span class="badge badge-both">PMC + Semantic Scholar</span>';
    } else if (paper.source === 's2' || (paper.sources && paper.sources.includes('Semantic Scholar'))) {
      srcBadge = '<span class="badge badge-s2">Semantic Scholar</span>';
    } else if (paper.source === 'openalex' || (paper.sources && paper.sources.includes('OpenAlex'))) {
      srcBadge = '<span class="badge badge-openalex">OpenAlex</span>';
    } else if (paper.source === 'crossref' || (paper.sources && paper.sources.includes('Crossref'))) {
      srcBadge = '<span class="badge badge-crossref">Crossref</span>';
    } else {
      srcBadge = '<span class="badge badge-pmc">Europe PMC</span>';
    }

    const ids = [];
    if (paper.pmid) ids.push(`PMID: ${escapeHtml(paper.pmid)}`);
    if (paper.doi) ids.push(`DOI: ${escapeHtml(paper.doi)}`);
    if (paper.pmcid) ids.push(`PMCID: ${escapeHtml(paper.pmcid)}`);
    if (!paper.pmid && !paper.doi && paper.paperId) ids.push(`S2 ID: ${escapeHtml(String(paper.paperId).substring(0, 8))}...`);

    let rawSourceLink = '#';
    if (paper.pmid) rawSourceLink = `https://pubmed.ncbi.nlm.nih.gov/${encodeURIComponent(paper.pmid)}/`;
    else if (paper.paperId) rawSourceLink = `https://www.semanticscholar.org/paper/${encodeURIComponent(paper.paperId)}`;
    const sourceLink = safeUrl(rawSourceLink);

    let rawFullTextLink = '';
    if (paper.doi) {
      const rawDoi = String(paper.doi).trim();
      rawFullTextLink = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(rawDoi) ? rawDoi : `https://doi.org/${rawDoi}`;
    } else if (paper.openAccessPdfUrl) {
      rawFullTextLink = paper.openAccessPdfUrl;
    }
    const fullTextLink = rawFullTextLink ? safeUrl(rawFullTextLink) : '';

    const abstractText = paper.abstract || paper.abstract_summary || '';
    const abstractSnippet = abstractText
      ? (abstractText.substring(0, 200) + (abstractText.length > 200 ? '...' : ''))
      : 'Short abstract summary not available in primary index record.';

    const isConference = paper.isConferenceAbstract ||
      /^(?:[A-Za-z0-9\/_-]*\/)?[OPL]\s*[-–/]?\s*\d+/i.test(paper.title || '') ||
      /^[A-Z]\d*[-/][A-Z0-9-]+/i.test(paper.title || '') ||
      /supplement|suppl/i.test(paper.volume || '') ||
      /supplement|suppl/i.test(paper.issue || '') ||
      /meeting|congress|conference|abstracts/i.test(paper.venue || paper.journal || '');

    const safeId = escapeHtml(paper.id);
    const pubType = Array.isArray(paper.pubType) ? paper.pubType[0] : (paper.pubType || 'Article');

    return `
      <div class="paper-card-top-row">
        <div class="paper-badges-group">
          ${srcBadge}
          <span class="badge badge-relevance">${escapeHtml(paper.relevancePercentage ?? 0)}% Relevance</span>
          <span class="badge" style="background:#f1f5f9; color:#475569;">${escapeHtml(paper.studyType || 'Study')}</span>
          <span class="badge" style="background:#e2e8f0; color:#334155;">${escapeHtml(pubType)}</span>
          ${isConference ? '<span class="badge badge-conference" style="background:#fed7aa; color:#9a3412; font-weight:700;">Conference abstract</span>' : ''}
          ${paper.userStatus === 'essential' ? '<span class="badge badge-essential">⭐ Essential</span>' : ''}
          ${paper.userStatus === 'background' ? '<span class="badge badge-background">📘 Background</span>' : ''}
          ${paper.userNote ? '<span class="badge badge-note" style="background:#e0f2fe; color:#0369a1; font-weight:600;">📝 Note</span>' : ''}
        </div>
        <div style="font-size:12px; font-weight:700; color:var(--text-muted);">
          #${idx + 1} • ${escapeHtml(paper.pubDate || paper.year || '')} • ${escapeHtml(paper.citationCount || 0)} citations
        </div>
      </div>

      <h3 class="paper-title">${escapeHtml(paper.title)}</h3>
      <div class="paper-authors-journal">${escapeHtml(Array.isArray(paper.authors) ? paper.authors.join(', ') : paper.authors)} — <em>${escapeHtml(paper.journal)}</em> (${escapeHtml(paper.pubDate || paper.year || '')})</div>
      <div class="paper-identifiers">${ids.join(' | ') || 'Identifier: Academic Graph Record'}</div>
      <div class="paper-snippet">${escapeHtml(abstractSnippet)}</div>

      ${paper.userNote ? `<div class="paper-note-box"><strong>User Note:</strong> ${escapeHtml(paper.userNote)}</div>` : ''}

      <div class="paper-actions-bar">
        <div class="paper-action-buttons">
          <button class="btn-chip btn-keep" data-id="${safeId}" style="${isSelected ? 'background:var(--primary); color:#fff;' : ''}">
            ${isSelected ? '✓ In Deck' : '+ Keep'}
          </button>
          <button class="btn-chip btn-chip-gold btn-essential ${paper.userStatus === 'essential' ? 'active-gold' : ''}" data-id="${safeId}">
            ⭐ Essential
          </button>
          <button class="btn-chip btn-background ${paper.userStatus === 'background' ? 'active-blue' : ''}" data-id="${safeId}">
            📘 Background
          </button>
          <button class="btn-chip btn-add-note" data-id="${safeId}">
            ${paper.userNote ? '✏️ Edit Note' : '✏️ Add Note'}
          </button>
          <button class="btn-chip btn-chip-danger btn-remove-paper" data-id="${safeId}" title="Permanently delete from current run">
            ✕ Remove
          </button>
        </div>

        <div class="paper-links-group">
          <a href="${escapeHtml(sourceLink)}" target="_blank" rel="noopener noreferrer" class="paper-link" title="Open primary database record">🌐 Open source ↗</a>
          ${fullTextLink ? `<a href="${escapeHtml(fullTextLink)}" target="_blank" rel="noopener noreferrer" class="paper-link paper-link-fulltext" title="Open full-text PDF">📄 Open full text ↗</a>` : ''}
        </div>
      </div>
    `;
  }

  function buildSlideCardHtml(slide, totalSlides) {
    const evidenceText = slide.evidenceSources ||
      (slide.sources && slide.sources.length > 0
        ? `Evidence sources for this slide: ${slide.sources.map(s => `[${s}]`).join(', ')}`
        : 'Evidence sources for this slide: None (Methodological overview)');

    return `
      <div class="slide-header">
        <div>
          <div class="slide-header-num">Field 1 • Slide ${escapeHtml(slide.slideNumber)} of ${escapeHtml(totalSlides)} [16:9 • Arial 12–14 pt]</div>
          <h3 class="slide-header-title">Field 2 • ${escapeHtml(slide.title)}</h3>
        </div>
        <span class="slide-category-badge">${escapeHtml(slide.suggestedVisualType)}</span>
      </div>
      <div class="slide-body">
        <div class="slide-field-row">
          <span class="slide-field-label">Field 3 • Slide Objective:</span>
          <div class="slide-field-val">${escapeHtml(slide.objective)}</div>
        </div>
        <div class="slide-field-row">
          <span class="slide-field-label">Field 4 • Main Message:</span>
          <div class="slide-field-val" style="font-weight:700; color:var(--primary);">${escapeHtml(slide.mainMessage)}</div>
        </div>
        <div class="slide-field-row">
          <span class="slide-field-label">Field 5 • On-Slide Text (${escapeHtml(slide.slideDensity)} Density • Arial 12–14 pt):</span>
          <div class="slide-onslide-textbox">
            <div class="slide-onslide-content">${formatMultilineHtml(slide.onSlideText)}</div>
          </div>
        </div>
        <div class="slide-field-row">
          <span class="slide-field-label">Field 6 & 7 • Suggested Visual & Detailed Description:</span>
          <div class="slide-visual-box">
            <div><strong>Visual Type:</strong> ${escapeHtml(slide.suggestedVisualType)}</div>
            <div style="margin-top:4px;"><strong>Detailed Layout Description:</strong> <em>${escapeHtml(slide.detailedVisualDescription)}</em></div>
          </div>
        </div>
        <div class="slide-field-row">
          <span class="slide-field-label">Field 8 • Speaker Notes (Presenter Script • ~1.2–1.5 min):</span>
          <div class="slide-speaker-box">
            <div class="slide-speaker-script">${formatMultilineHtml(slide.speakerNotes)}</div>
          </div>
        </div>
        <div class="slide-field-row">
          <span class="slide-field-label">Evidence Sources (Traceability):</span>
          <div style="font-size:13px; font-weight:700; color:var(--accent); background:#f0fdfa; border:1px solid #99f6e4; border-radius:6px; padding:6px 12px; margin-top:4px;">
            ${escapeHtml(evidenceText)}
          </div>
        </div>
        <div class="slide-field-row">
          <span class="slide-field-label">Field 9 • Interactive Question for Audience:</span>
          <div class="slide-question-box">
            <strong>Discussion Prompt:</strong> ${escapeHtml(slide.audienceQuestion)}
          </div>
        </div>
        <div class="slide-field-row">
          <span class="slide-field-label">Field 10 • Logical Transition:</span>
          <div class="slide-transition-box">${escapeHtml(slide.transition)}</div>
        </div>
      </div>
      <div class="slide-footer-copyright-row">
        <span class="slide-copyright-text">© 2025 Raouf Roshdy. All rights reserved.</span>
      </div>
    `;
  }

  const api = { escapeHtml, safeUrl, formatMultilineHtml, buildPaperCardHtml, buildSlideCardHtml };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.PrepptRenderHelpers = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
