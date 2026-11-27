# Preppt — Remediation Action Plan

Source: independent full product audit (27 Nov 2026, commit `2b89ef1`).
Branch: `fix/audit-remediation`. Each step ends with tests run and a commit.

| Step | Fix | Audit IDs | Status |
|---|---|---|---|
| 1 | Study-design classification from publication-type metadata (SR/MA before RCT, title first, retrospective vs prospective, protocols, guidelines) — client and server | D-06 | ✅ |
| 2 | Keyword engine: phrase-level primary terms, word-boundary domain rules, no invented synonyms or generic MeSH; tighter search strategy | D-04 | ✅ |
| 3 | Relevance ranking: real 0–100 scale, phrase/condition coverage, population-mismatch penalty, RCT priority; Europe PMC relevance sort | D-05, D-07 | ☐ |
| 4 | Metadata integrity: no invented years, correct journal/PMCID, discard junk abstracts | D-17, D-18 | ☐ |
| 5 | Evidence direction & conclusion: driven by included RCT / SR primary endpoints, never by a subgroup or off-topic null; remove hard-coded IVF/AI vocabulary | D-01, D-10 | ☐ |
| 6 | Findings quality: results/conclusion sentences only, strip section headers and author-year citations, density caps, author labels, audience-aware wording, no broken truncation | D-09, D-11–D-16 | ☐ |
| 7 | Validator: checks that actually detect in-text citations, background-as-finding, vocabulary leakage, broken bullets, conclusion–evidence conflicts; fix direction-polarity false block | D-02, D-03 | ☐ |
| 8 | Security: origin allow-list + rate limit on API proxies, request body size limit, no client-supplied API keys | D-19, D-20 | ☐ |
| 9 | UX & accessibility: live-region toasts, labels, inline field errors, no silent clamping, integer validation, consistent step numbering, plain labels, export-button colour, undo remove + backfill, session persistence, notice copy | D-22, D-23, D-25, D-27, D-28, D-31, D-32 | ☐ |
| 10 | Word export: slide tables kept on one page, author truncation (et al.), consistent copyright year | D-29, D-30 | ☐ |
| 11 | Regression tests on varied topics (SGLT2i-HFpEF, TXA-PPH, PARPi-ovarian) + full test suite + live-API end-to-end re-run | all | ☐ |
| 12 | Docs (README claims, CHANGELOG) and push branch | D-08 | ☐ |

Out of reach of code changes (owner action): rotate the OpenAlex API key that is in git history before commit `6db00f9`.
