/**
 * Preppt — Section 7 Canonical Data Models
 *
 * Defines the strict schema for:
 * 1. ProjectRun (one active run)
 * 2. Paper
 * 3. Slide
 */

class Paper {
  constructor(data = {}) {
    this.title = data.title || '';
    // authors is an array of strings as per Section 7 specification
    if (Array.isArray(data.authors)) {
      this.authors = data.authors.map(a => String(a).trim()).filter(Boolean);
    } else if (typeof data.authors === 'string' && data.authors.trim()) {
      this.authors = data.authors.split(/,\s*|;\s*/).map(a => a.trim()).filter(Boolean);
    } else {
      this.authors = [];
    }

    this.journal = data.journal || '';
    this.publication_date = data.publication_date || data.pubDate || (data.year ? String(data.year) : '');
    this.study_type = data.study_type || data.studyType || 'Empirical Study';
    this.publication_type = data.publication_type || data.pubType || 'Journal Article';
    this.relevance_percentage = Number(data.relevance_percentage ?? data.relevancePercentage ?? 0);
    this.abstract_summary = data.abstract_summary || data.abstract || '';
    this.doi = data.doi || '';
    this.pmid = data.pmid || '';
    this.pmcid = data.pmcid || '';
    this.semantic_scholar_id = data.semantic_scholar_id || data.paperId || '';
    this.citation_count = Number(data.citation_count ?? data.citationCount ?? 0);
    this.source_url = data.source_url || data.sourceUrl || '';
    this.full_text_url = data.full_text_url || data.fullTextUrl || '';
    this.user_status = data.user_status || data.userStatus || 'keep'; // 'keep' | 'essential' | 'background' | 'removed'
    this.user_note = data.user_note || data.userNote || '';

    // Compatibility getters & aliases
    this.id = data.id || this.doi || this.pmid || this.semantic_scholar_id || Math.random().toString(36).substring(2, 9);
    this.source = data.source || (this.pmid && this.semantic_scholar_id ? 'both' : (this.pmid ? 'epmc' : 's2'));
    this.year = data.year || (this.publication_date ? parseInt(this.publication_date.match(/\d{4}/)?.[0] || '2023') : 2023);
  }

  toJSON() {
    return {
      title: this.title,
      authors: this.authors,
      journal: this.journal,
      publication_date: this.publication_date,
      study_type: this.study_type,
      publication_type: this.publication_type,
      relevance_percentage: this.relevance_percentage,
      abstract_summary: this.abstract_summary,
      doi: this.doi,
      pmid: this.pmid,
      pmcid: this.pmcid,
      semantic_scholar_id: this.semantic_scholar_id,
      citation_count: this.citation_count,
      source_url: this.source_url,
      full_text_url: this.full_text_url,
      user_status: this.user_status,
      user_note: this.user_note,
      // Helper aliases
      id: this.id,
      source: this.source,
      year: this.year,
      pubDate: this.publication_date,
      studyType: this.study_type,
      pubType: this.publication_type,
      relevancePercentage: this.relevance_percentage,
      abstract: this.abstract_summary,
      paperId: this.semantic_scholar_id,
      citationCount: this.citation_count,
      userStatus: this.user_status,
      userNote: this.user_note
    };
  }
}

class Slide {
  constructor(data = {}) {
    this.slide_number = Number(data.slide_number ?? data.slideNumber ?? 1);
    this.title = data.title || '';
    this.objective = data.objective || '';
    this.main_message = data.main_message || data.mainMessage || '';
    this.on_slide_text = data.on_slide_text || data.onSlideText || '';
    this.suggested_visual_type = data.suggested_visual_type || data.suggestedVisualType || 'Diagram';
    this.detailed_visual_description = data.detailed_visual_description || data.detailedVisualDescription || '';
    this.speaker_notes = data.speaker_notes || data.speakerNotes || '';
    this.interactive_question = data.interactive_question || data.interactiveQuestion || '';
    this.logical_transition = data.logical_transition || data.logicalTransition || data.transition || '';

    // Presentation format specifications (Section 2)
    this.slide_ratio = '16:9';
    this.font = 'Arial';
    this.text_size_target = '12–14 pt';
    this.text_occupancy_target = data.text_occupancy_target || '30–40% of slide area';
    this.footer_copyright = 'copyrights@Raouf Roshdy2025, Arial 9 pt, right lower corner';
  }

  toJSON() {
    return {
      slide_number: this.slide_number,
      title: this.title,
      objective: this.objective,
      main_message: this.main_message,
      on_slide_text: this.on_slide_text,
      suggested_visual_type: this.suggested_visual_type,
      detailed_visual_description: this.detailed_visual_description,
      speaker_notes: this.speaker_notes,
      interactive_question: this.interactive_question,
      logical_transition: this.logical_transition,
      // Compatibility aliases
      slideNumber: this.slide_number,
      mainMessage: this.main_message,
      onSlideText: this.on_slide_text,
      suggestedVisualType: this.suggested_visual_type,
      detailedVisualDescription: this.detailed_visual_description,
      speakerNotes: this.speaker_notes,
      audienceQuestion: this.interactive_question,
      transition: this.logical_transition,
      slideRatio: this.slide_ratio,
      font: this.font,
      fontSizeTarget: this.text_size_target,
      textOccupancyTarget: this.text_occupancy_target,
      footerCopyright: this.footer_copyright
    };
  }
}

class ProjectRun {
  constructor(data = {}) {
    this.project_name = data.project_name || 'Preppt – Scientific Literature to Presentation';
    this.topic = data.topic || '';
    this.presentation_title = data.presentation_title || data.shortTitle || '';
    this.target_paper_count = Number(data.target_paper_count ?? data.targetPapers ?? 10);
    this.publication_start_year = Number(data.publication_start_year ?? data.startYear ?? 2021);
    this.audience = data.audience || 'Postgraduate';
    this.slide_count = Number(data.slide_count ?? data.slideCount ?? 10);
    this.slide_density = data.slide_density ?? data.density ?? 'Balanced';
    
    this.proposed_keywords = Array.isArray(data.proposed_keywords) ? data.proposed_keywords : [];
    this.approved_keywords = Array.isArray(data.approved_keywords) ? data.approved_keywords : [];
    this.pmc_search_strategy = data.pmc_search_strategy || '';
    this.semantic_scholar_search_strategy = data.semantic_scholar_search_strategy || '';
    
    this.retrieval_status = data.retrieval_status || 'idle'; // 'idle' | 'in_progress' | 'completed' | 'partial_failure'
    this.retrieved_papers = Array.isArray(data.retrieved_papers) ? data.retrieved_papers.map(p => new Paper(p)) : [];
    this.deduplicated_papers = Array.isArray(data.deduplicated_papers) ? data.deduplicated_papers.map(p => new Paper(p)) : [];
    this.ranked_papers = Array.isArray(data.ranked_papers) ? data.ranked_papers.map(p => new Paper(p)) : [];
    this.selected_papers = Array.isArray(data.selected_papers) ? data.selected_papers.map(p => new Paper(p)) : [];
    this.removed_papers = Array.isArray(data.removed_papers) ? data.removed_papers.map(p => new Paper(p)) : [];
    
    this.research_gaps = Array.isArray(data.research_gaps) ? data.research_gaps : [];
    this.synthesis_plan = data.synthesis_plan || null;
    this.slides = Array.isArray(data.slides) ? data.slides.map(s => new Slide(s)) : [];
    this.references = Array.isArray(data.references) ? data.references : [];
    this.word_export_status = data.word_export_status || 'not_started'; // 'not_started' | 'ready' | 'exported' | 'failed'
  }

  toJSON() {
    return {
      project_name: this.project_name,
      topic: this.topic,
      presentation_title: this.presentation_title,
      target_paper_count: this.target_paper_count,
      publication_start_year: this.publication_start_year,
      audience: this.audience,
      slide_count: this.slide_count,
      slide_density: this.slide_density,
      proposed_keywords: this.proposed_keywords,
      approved_keywords: this.approved_keywords,
      pmc_search_strategy: this.pmc_search_strategy,
      semantic_scholar_search_strategy: this.semantic_scholar_search_strategy,
      retrieval_status: this.retrieval_status,
      retrieved_papers: this.retrieved_papers.map(p => p.toJSON()),
      deduplicated_papers: this.deduplicated_papers.map(p => p.toJSON()),
      ranked_papers: this.ranked_papers.map(p => p.toJSON()),
      selected_papers: this.selected_papers.map(p => p.toJSON()),
      removed_papers: this.removed_papers.map(p => p.toJSON()),
      research_gaps: this.research_gaps,
      synthesis_plan: this.synthesis_plan,
      slides: this.slides.map(s => s.toJSON()),
      references: this.references,
      word_export_status: this.word_export_status
    };
  }
}

module.exports = {
  ProjectRun,
  Paper,
  Slide
};
