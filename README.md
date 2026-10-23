# Preppt – Scientific Literature to Presentation

[![Vercel Deployment](https://img.shields.io/badge/Vercel-Live_App-black?style=flat&logo=vercel)](https://preppt-ai.vercel.app)
[![GitHub Repository](https://img.shields.io/badge/GitHub-Preppt-181717?style=flat&logo=github)](https://github.com/roroleaks/Preppt)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?style=flat&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Europe PMC](https://img.shields.io/badge/Europe_PMC-REST_API-0369a1?style=flat)](https://europepmc.org/)
[![Semantic Scholar](https://img.shields.io/badge/Semantic_Scholar-Academic_Graph-6b21a8?style=flat)](https://www.semanticscholar.org/)
[![Word Export](https://img.shields.io/badge/DOCX_Generator-11--Part_Spec-15803d?style=flat)](https://github.com/doxov/docx)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**Preppt** is an evidence-based clinical and scientific presentation generator. It systematically harvests biomedical literature from **Europe PMC / PubMed Central** and **Semantic Scholar**, applies multi-key deduplication and semantic relevance ranking, guides the clinician through rigorous interactive approval gates, and produces a publication-grade, 11-part Microsoft Word (`.docx`) presentation specification.

🔗 **Live Production Application**: [https://preppt-ai.vercel.app](https://preppt-ai.vercel.app)  
📦 **GitHub Repository**: [https://github.com/roroleaks/Preppt](https://github.com/roroleaks/Preppt)

---

## 🌟 Key Capabilities & Architectural Principles

- **Dual-Engine Harvesting**: Concurrently queries Europe PMC REST API and the Semantic Scholar Academic Graph with automatic retries and resilient fallback if one upstream source is rate-limited or temporarily unavailable.
- **Three Mandatory Human Approval Gates**:
  1. *Keyword Approval Gate*: Clinicians review and refine suggested primary terms, clinical synonyms, and MeSH concepts.
  2. *Search Strategy Approval Gate*: Dual Solr/Graph queries are inspectable and editable before issuing network requests.
  3. *Selected Papers Approval Gate*: Curated evidence papers must be explicitly approved before slide synthesis begins.
- **Audience & Density Adaptation**: Calibrates medical terminology depth across 5 audience tiers (*Public audience, Undergraduate, Postgraduate, Consultants, Mixed audience*) and visible slide text across 3 density tiers (*Detailed, Balanced [30–40% occupancy], Short bullet points*).
- **10 Mandatory Slide Fields**: Every synthesized slide contains all 10 essential specification fields, including slide objective, main message, visual type suggestion, detailed visual description, verbatim speaker notes narration script, interactive audience question, and logical transition.
- **Strict Citation Isolation**: Zero in-text citations or references on slide cards. All bibliographic citations are strictly consolidated in a dedicated, Vancouver-style final References section.
- **Pre-Export Integrity Gate (Prompt 13)**: Automatically audits 9 compliance criteria before allowing Word document export.
- **Single Active Run Model**: Focused workflow with zero database overhead, session pollution, or cloud dependency.

---

## 🔄 System Architecture & Mechanisms

### 1. End-to-End Workflow Pipeline

```mermaid
flowchart TD
  subgraph Step1 ["Step 1: Input Parameters"]
    A["User Inputs Topic & Short Title"] --> B["Select Target Count, Year, Audience, Slides, Density"]
    B --> C{"Input Validation Passed?"}
    C -- No --> B
  end

  subgraph Step2 ["Step 2: Keyword Proposal"]
    C -- Yes --> D["AI Heuristic Domain Engine"]
    D --> E["Generate Primary Terms, Synonyms & MeSH"]
    E --> F["Interactive Keyword Editor"]
    F --> G[["Gate 1: Approve Keywords Button"]]
  end

  subgraph Step3 ["Step 3: Search Strategy Formulation"]
    G --> H["Formulate Europe PMC Solr Query"]
    G --> I["Formulate Semantic Scholar Query"]
    H --> J["Review & Edit Dual Query Box"]
    I --> J
    J --> K[["Gate 2: Approve Search Strategy Button"]]
  end

  subgraph Step45 ["Step 4 & 5: Retrieval & Ranking"]
    K --> L["Concurrent API Dispatch with Auto-Retry"]
    L --> M["Multi-Key Deduplication (DOI, PMID, S2ID, Title)"]
    M --> N["Multi-Factor Relevance & Best Study-Type Ranking"]
  end

  subgraph Step6 ["Step 6: Paper Review Screen"]
    N --> O["Card Review with Metrics & Links"]
    O --> P["Actions: Keep, Essential, Background, Note, Remove"]
    P --> Q{"Selected Papers >= 1?"}
    Q -- No --> P
    Q -- Yes --> R[["Gate 3: Approve Selected Papers Button"]]
  end

  subgraph Step78 ["Step 7 & 8: Presentation Deck Studio"]
    R --> S["Evidence-Based Synthesis Plan & Research Gaps"]
    S --> T["Generate N Slides with All 10 Required Fields"]
    T --> U["Audience & Density Calibration"]
  end

  subgraph Step910 ["Step 9 & 10: Validation & Word Export"]
    U --> V{"Gate 4: Pre-Export Integrity Audit (9 Checks)"}
    V -- Fails --> W["Display Validation Issues & Block Export"]
    V -- Passes --> X["Compile 11-Part Document via docx Library"]
    X --> Y[["Download Word Document (.docx)"]]
  end
```

---

### 2. Dual-Engine Retrieval & Resilience Architecture

```mermaid
flowchart LR
  subgraph Input
    Q["Approved Queries & Year Filter"]
  end

  subgraph PMC_Pipeline ["Europe PMC REST Engine"]
    Q --> PMC_Req["Solr Query Request (Core Result Type)"]
    PMC_Req --> PMC_Try{"HTTP Status 200?"}
    PMC_Try -- Yes --> PMC_Hits{"Hits > 0?"}
    PMC_Hits -- Yes --> PMC_Norm["Parse Authors, Journal, PMCID, Year"]
    PMC_Hits -- No --> PMC_Relax["Fallback Query Relaxation"]
    PMC_Relax --> PMC_Norm
    PMC_Try -- Timeout/Error --> PMC_Retry["Exponential Backoff Retry (x2)"]
    PMC_Retry -- Failed --> PMC_Warn["Log Warning & Yield to S2"]
  end

  subgraph S2_Pipeline ["Semantic Scholar Graph Engine"]
    Q --> S2_Req["Academic Graph API Search"]
    S2_Req --> S2_Try{"HTTP Status 200?"}
    S2_Try -- Yes --> S2_Norm["Parse DOI, S2ID, Venue, Year, Citations"]
    S2_Try -- 429 Rate Limit --> S2_Retry["Exponential Backoff Retry (x2)"]
    S2_Retry -- Failed --> S2_Fallback["Non-Blocking Banner: PMC Carries Load"]
  end

  subgraph Merging ["Merging & Validation"]
    PMC_Norm --> Merge["Cross-Engine Candidate Pool"]
    S2_Norm --> Merge
    PMC_Warn --> Merge
    S2_Fallback --> Merge
    Merge --> Dedup["Multi-Key Deduplication Engine"]
  end
```

---

### 3. Multi-Key Deduplication & Relevance Ranking

```mermaid
flowchart TD
  subgraph Ingestion
    R["Raw Harvested Studies (PMC + Semantic Scholar)"]
  end

  subgraph Deduplication ["Deduplication Pipeline"]
    R --> D1{"DOI Match?"}
    D1 -- Yes --> Merge1["Merge Identifiers & Richer Abstract"]
    D1 -- No --> D2{"PMID / PMCID Match?"}
    D2 -- Yes --> Merge1
    D2 -- No --> D3{"Semantic Scholar ID Match?"}
    D3 -- Yes --> Merge1
    D3 -- No --> D4{"Normalized Title Match (len > 20)?"}
    D4 -- Yes --> Merge1
    D4 -- No --> D5{"First Author Surname + Year Match?"}
    D5 -- Overlap > 0.65 --> Merge1
    D5 -- Overlap <= 0.65 --> Unique["Add to Unique Pool"]
  end

  subgraph Ranking ["Relevance & Study-Type Scoring"]
    Unique --> SC1["Title Keyword Match (+20 pts)"]
    Unique --> SC2["Abstract Keyword Overlap (+6 pts)"]
    Unique --> SC3["Approved Keywords & MeSH Overlap (+16 pts)"]
    Unique --> SC4["Prioritize Best Study Types (RCT / Meta-Analysis: +18 pts)"]
    Unique --> SC5["Dual-Source Convergence Bonus (+8 pts)"]
    SC1 & SC2 & SC3 & SC4 & SC5 --> NormScore["Normalize to 65%–99% Relevance Scale"]
    NormScore --> Sort["Sort Descending & Pre-Select Target Count"]
  end
```

---

### 4. Word Document Layout Architecture (11-Part Sequence)

The exported `.docx` document adheres strictly to the **word-document-styling** design system:

```mermaid
flowchart TD
  subgraph Section_Order ["Strict 11-Part Sequence"]
    P1["1. Cover Page & Educational Disclaimer Box"] --> P2["2. Project Information & Metadata Table"]
    P2 --> P3["3. Topic & Short Presentation Title"]
    P3 --> P4["4. Audience & Slide Specifications Table"]
    P4 --> P5["5. Approved Keywords List (Primary, Synonyms, MeSH)"]
    P5 --> P6["6. Approved Search Strategy Table (PMC & S2 Queries)"]
    P6 --> P7["7. Selected Papers Table (PMID, DOI, Journal, Year, Source)"]
    P7 --> P8["8. Research Gaps & Unresolved Questions (Established vs Uncertain)"]
    P8 --> P9["9. Presentation Structure Outline"]
    P9 --> P10["10. Full Slide-by-Slide Content (10 Fields per Slide)"]
    P10 --> P11["11. References Section (Complete Vancouver Citations [1..N])"]
  end
```

---

## 📋 The 10 Mandatory Fields per Slide

Every synthesized slide card is rendered in a clean, high-contrast visual table containing:

| # | Field Name | Description |
| :-: | :--- | :--- |
| **1** | **Slide Number** | Sequential number (`SLIDE 1` to `SLIDE N`). |
| **2** | **Slide Title** | Clear, authoritative title reflecting the slide's specific clinical domain. |
| **3** | **Slide Objective** | Single actionable sentence defining the learning or clinical outcome. |
| **4** | **Main Message** | High-yield clinical takeaway summarizing the key evidence. |
| **5** | **On-Slide Text** | Formatted bullet points calibrated for 16:9 layout (occupancy 30–40%). |
| **6** | **Suggested Visual Type** | Specific diagram recommendation (e.g. *Forest plot*, *Consort diagram*, *Timeline*, *Pathophysiologic flowchart*). |
| **7** | **Detailed Visual Description** | Exact description of boxes, arrows, labels, axes, and color schemes. |
| **8** | **Speaker Notes** | Verbatim spoken script in shaded card for presenter pacing (~1.5 min/slide). |
| **9** | **Interactive Audience Question**| Thought-provoking clinical question to engage participants. |
| **10**| **Logical Transition** | Smooth transition bridging the current slide to the next topic. |

---

## 🛡️ Pre-Export Integrity Audit (Prompt 13)

Before enabling the `Export to Word` button, the system verifies all 9 criteria:

1. **English-Only**: Complete text, titles, notes, and visual descriptions are in English.
2. **Slide Count Match**: Synthesized count matches user request exactly ($N = N_{\text{requested}}$).
3. **10 Fields Present**: All 10 mandatory fields are non-empty across every slide.
4. **References Isolated**: References appear exclusively in Section 11; zero citations below individual slides.
5. **No In-Text Citations**: Zero bracketed numbers `[1]` or author-year tags in on-slide text or notes.
6. **Removed Papers Excluded**: Studies removed during review are permanently excluded from active selection.
7. **No Copied Content**: Zero legacy project text or unrelated topic contamination.
8. **Project Name Intact**: Verified identity: `Preppt – Scientific Literature to Presentation`.
9. **Secrets Guarded**: Zero API tokens, private keys, or bearer credentials exposed in payloads or document text.

---

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) v18.0.0 or higher
- Windows 10/11 or macOS/Linux

### Installation & Launch
```bash
# Clone the repository
git clone https://github.com/roroleaks/Preppt.git
cd Preppt

# Install dependencies (docx library)
npm install

# Start the local server
node server.js
```

Open your browser and navigate to:
```
http://localhost:3080
```

### Running Automated Test Suites
```bash
# Run comprehensive end-to-end regression tests (12 suites)
node test-e2e.js

# Run live scenario integration test with deep Word document XML inspection
node scratch/run-random-topic-e2e.js
```

---

## 📄 License & Attribution

- **Author**: Dr. Raouf Roshdy
- **Copyright**: `copyrights@Raouf Roshdy2025`
- **License**: [MIT](LICENSE)
- **Educational Disclaimer**: This software and generated presentation specifications are intended solely for educational and presentation-planning purposes. They do not replace critical appraisal of original biomedical literature or professional clinical judgment.
