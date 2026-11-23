# Changelog

All notable changes to the Preppt project are documented in this file.

## [1.1.1] - 2026-11-23

### Fixed
- Prompt 1B: fixed design labels, finding selection, outcome-level comparison; removed remaining template text.
- E1: Replaced hardcoded "Comparative Study" with conservative `detectStudyDesign` defaulting to "Design not stated". Enforced verified design existence before asserting trial absence or study counts.
- E2: Removed invented significance claims on appraisal slides; displays "No quantitative result reported in the abstract." when no statistics/findings exist.
- E3: Implemented sectioned abstract parser in `lib/evidence-extractor.js` that prefers RESULTS, SUMMARY ANSWER, and CONCLUSION, while filtering out study questions, background, and scope openers ("This review summarizes...").
- E4: Enforced outcome-level cross-study comparisons; reports multi-outcome findings within a single study (e.g. Wang S et al.) together without treating them as conflicting studies.
- E5: Prevented default benefit claims unless supported by empirical outcomes favouring intervention; otherwise states "The selected abstracts do not report outcome results sufficient to judge benefit."
- E6: Removed remaining non-derived template text: research gaps 3-6, Clinical Decision Algorithm slide, generic "prospective registries" take-homes, and fixed ungrounded notes.
- E7: Attached sources only to bullets with extracted content; framing slides display "Evidence sources: none (framing slide)".
- E8: Prevented mid-word title truncation using word-boundary `formatTitleSnippet`.
- E9: Updated Illingworth test fixture with real 1,066-patient double-blind RCT data from Nat Med 2024.
- E10: Parameterized LLM models via `GROQ_MODEL`, `GEMINI_MODEL`, `OPENAI_MODEL`, and `ANTHROPIC_MODEL` environment variables with clear provider rejection logging and post-generation guard.
- E11: Used precise wording for non-inferiority trials ("non-inferiority was not demonstrated").
- Added Acceptance Tests 9, 10, and 11 to `tests/e2e/prompt1-synthesis-extractive.spec.js`.

## [1.1.0] - 2026-11-23

### Changed
- Synthesis now extractive and source-traced; removed template clinical claims.
- Remediated audit defects D-01, D-02, D-03, D-11, D-12, D-16, D-17, D-26, D-27, D-34.
- Implemented `lib/evidence-extractor.js` for sentence splitting, PICO extraction, and null/positive outcome direction classification directly from abstracts.
- Rewrote `lib/synthesize.js` to enforce topic-neutral extractive narrative arc and transparent evidence shortfall reporting (`deck.meta.slideShortfall`).
- Enforced claim-to-source traceability via `sources` metadata on findings bullets, slide-level `evidenceSources` narration tags, and Word (.docx) Evidence Map appendix table.
- Synchronized presentation outline dynamically from generated slide titles.
- Dynamic copyright footer year in slide specs.
- Fixed Anthropic Claude Messages API integration in `lib/llm-synthesizer.js` with structured prompt grounding and engine badge metadata.
- Added comprehensive 8-point acceptance test suite `tests/e2e/prompt1-synthesis-extractive.spec.js`.
