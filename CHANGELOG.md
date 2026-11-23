# Changelog

All notable changes to the Preppt project are documented in this file.

## [1.2.1] - 2026-11-23

### Fixed
- Prompt 2B: structured result bullets, no template gaps, generator–validator consistency.
- Problem 1 (CRITICAL): Eliminated word-count chopping of findings sentences. Implemented `buildStructuredFinding` with `derivedFrom` machine-readable provenance (`outcome name + direction + both arms' values + effect, CI and P`); shortened non-finding text strictly at clause boundaries; expanded undefined abbreviations ("AAG" -> "AI-assisted group", "manual" -> "manual group"); strengthened `truncation` validation check to fail on open bracket fragments (such as `(248.`), dropped numbers without structured representation, and mid-clause chops.
- Problem 2 (HIGH): Completely removed fallback template research gaps ("Durability of treatment response...", "Generalizability of findings across diverse patient cohorts...", etc.); outputs strictly `"No research gaps could be derived from the selected abstracts."` when no gaps can be derived; rephrased author limitations on gaps slide as open questions (`Open Question: ...`) to eliminate verbatim duplication with the limitations slide; updated test assertions requiring `>= 3` gaps to `>= 1`.
- Problem 3 (CRITICAL, functional): Attached machine-readable provenance `derivedFrom: [{ ref, outcome, direction, values }]` to slide bullets and data models; updated `source_support` and `direction_fidelity` in `lib/validator.js` to recognize `derivedFrom` provenance alongside text-overlap checks, allowing correct decks to export without false blocks.
- Added generator self-check and auto-repair in `/api/synthesize` to guarantee that the generator never emits a deck that its own validator fails.
- Replaced vague Salih appraisal main message with specific outcome: `"AI outperformed embryologists in morphology assessment and outcome prediction (review of retrospective studies)."`.
- Added Acceptance Tests 1 through 7 in `tests/e2e/prompt2b.spec.js` and added to `npm test`.

## [1.2.0] - 2026-11-23

### Fixed
- Prompt 2: content-integrity pre-export checks; truthful labels; carry-over synthesis fixes.
- Remediated audit defects D-04 (validator false assurance, CRITICAL), D-09 (misleading labels, HIGH), and integrity panel D-23.
- Part A1: Named multi-direction outcomes in study appraisal main messages (e.g. Wang S: higher implantation with AI; no difference in live birth).
- Part A2: Overhauled "consistent findings" logic to require 2+ records on the same normalized outcome in the same direction; Theme 1 only counts records with actual findings; no generic consistency claims across disparate outcomes.
- Part A3: Restricted "absent outcome" research gaps strictly to outcomes requested in the topic or approved keywords; removed fixed absent-outcome list; eliminated unprompted survival, QoL, and health-economic gaps.
- Part A4: Excluded methods, endpoint description, and sample margin sentences from findings bullets.
- Part A5: Enforced bullet density constraints (Detailed <= 25 words, Balanced <= 15 words, Short <= 8 words) without mid-word cuts or lost numbers/direction.
- Part A6: Replaced developer jargon on Title slide with "Narrative summary of N selected studies (abstract-based)"; eliminated "Analysis Framework" bullet; pruned content-free bullets from Scope slide.
- Part B: Rebuilt Pre-Export Checks suite with 13 scientific integrity checks: `source_coverage` (fail), `source_support` (fail), `direction_fidelity` (fail), `unsupported_numbers` (fail), `vocabulary_drift` (fail), `framing_sources` (fail), `truncation` (warning), `no_intext_citations` (fail), `slide_count` (warning), `abstract_only_notice` (warning/pass), `removed_papers_absent` (fail), `no_api_secrets` (fail), `english_only` (warning).
- Replaced false assurance claims ("100% domain-specific", "freshly synthesized", "Zero generic AI", "Standards Verified") with truthful summary lines and integrity note.
- Enforced server-side validation blocking on `/api/export-docx` with HTTP 400 naming failing checks.
- Part C: Updated keyword step to truthfully state rule-based term generation; added conference abstract detection (`isConferenceAbstract`) with UI badges and Word reference markers; removed "peer-reviewed" overclaims in favor of exact counts and source provenance; banned overclaims ("multicenter", "rigorous", "robust", "systematic synthesis", "pivotal", "landmark"); added engine and abstract-only basis banner to deck UI and Word cover.
- Added comprehensive 9-point acceptance test suite `tests/e2e/prompt2-validation.spec.js`.

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
