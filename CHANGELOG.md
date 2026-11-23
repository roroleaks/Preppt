# Changelog

All notable changes to the Preppt project are documented in this file.

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
