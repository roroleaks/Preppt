---
name: word-document-styling
description: >-
  Comprehensive guide, styling rules, and reference implementations for formatting, layout,
  typography, color hierarchy, table styling, and visual architecture of publication-grade
  Microsoft Word (.docx) documents and presentation specifications generated with the docx npm library.
  Use when designing, refining, or validating Word document layouts, slide cards, evidence tables,
  headers/footers, and Vancouver references.
---

# Word Document Formatting, Layout, and Styling Skill

This skill governs the visual design, typographic hierarchy, table geometry, and structural aesthetics of **Microsoft Word (.docx)** presentation specifications and scientific reports generated via the `docx` library.

---

## 1. Core Visual Principles & Design System

The document must look like an executive-grade clinical monograph or high-stakes presentation specification—not an unstyled raw export.

### 1.1 Color Palette
Use a deliberate, high-contrast, accessible medical/corporate palette:
- **Primary Navy (`#0F172A` / `0F172A`):** Document titles, table headers, slide header banners, major dividing lines.
- **Accent Teal (`#0D9488` / `0D9488`):** Subheadings, key metrics, badge borders, callout bars.
- **Teal Light / Ice (`#F0FDFA` / `F0FDFA`):** Metadata table shading, callout background fills.
- **Body Slate Dark (`#334155` / `334155`):** Standard paragraph body text, slide text bullets.
- **Muted Slate (`#64748B` / `64748B`):** Captions, secondary notes, dates, subtext.
- **Border Gray (`#E2E8F0` / `E2E8F0`):** Clean, crisp table gridlines and card outlines.
- **Warning Amber (`#FEF3C7` / `FEF3C7`):** Unresolved research gaps, uncertainty alerts.
- **Success Green (`#15803D` / `15803D`):** Established findings, approved indicators.
- **Pure White (`#FFFFFF` / `FFFFFF`):** Text on navy header rows and banners.

### 1.2 Strict Typography Rules
- **Font Family:** `Arial` across every text element, run, heading, table, and footer without exception.
- **Title (Cover Page):** 26–28 pt (`size: 52–56` in half-points), Bold, Navy, center-aligned, with letter tracking.
- **Heading 1 (Major Sections):** 20–22 pt (`size: 40–44`), Bold, Navy (`#0F172A`), spacing before 240 dxa, after 120 dxa.
- **Heading 2 (Subsections):** 14–16 pt (`size: 28–32`), Bold, Accent Teal (`#0D9488`), spacing before 160 dxa, after 80 dxa.
- **Heading 3 (Card Titles / Field Labels):** 11–12 pt (`size: 22–24`), Bold, Navy or Slate Dark.
- **Body Text:** 11 pt (`size: 22`), regular, line spacing 260–280 dxa (1.15x), paragraph space after 100 dxa.
- **Table Cell Text:** 9.5–10 pt (`size: 19–20`), crisp, high readability.
- **Slide Speaker Notes:** 10 pt (`size: 20`), Slate Dark, italicized, in shaded callout cell.
- **Copyright & Footers:** 9 pt (`size: 18`), Muted Slate (`#64748B`), right-aligned: `copyrights@Raouf Roshdy2025`.

---

## 2. Page Geometry & Section Layout

### 2.1 Margins & Orientation
- **Orientation:** Portrait standard (emulating presentation planning document).
- **Margins:** Standard 1-inch (1440 dxa) all around:
  ```javascript
  margins: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
  ```
- **Total Printable Grid Width:** 9,500 dxa (12,240 dxa page width - 2,880 dxa margins = 9,360–9,500 dxa).

### 2.2 Headers & Footers
- **Running Header:** Subtle right-aligned document title and topic in Arial 9 pt muted slate, separated by a thin rule.
- **Running Footer:**
  - Left: Educational Disclaimer note.
  - Right: `copyrights@Raouf Roshdy2025` in Arial 9 pt muted slate.
  - Page numbers formatted via Word fields (`PageNumber.CURRENT` of `PageNumber.TOTAL_PAGES`).

---

## 3. Table Formatting & Grid Standards

Tables are the primary visual containers for evidence, metadata, and slide specifications.

### 3.1 Table Geometry Rules
1. **Total Width:** Always set table width explicitly to `{ size: 9500, type: WidthType.DXA }`.
2. **Column Widths:** Sum of individual cell widths in every row MUST equal 9500 dxa exactly.
3. **Borders:** Consistent light borders (`#E2E8F0` or `#CBD5E1`) using `BorderStyle.SINGLE`:
   ```javascript
   const tableBorders = {
     top: { style: BorderStyle.SINGLE, size: 6, color: 'E2E8F0' },
     bottom: { style: BorderStyle.SINGLE, size: 6, color: 'E2E8F0' },
     left: { style: BorderStyle.SINGLE, size: 6, color: 'E2E8F0' },
     right: { style: BorderStyle.SINGLE, size: 6, color: 'E2E8F0' },
     insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: 'E2E8F0' },
     insideVertical: { style: BorderStyle.SINGLE, size: 4, color: 'E2E8F0' }
   };
   ```
4. **Cell Padding (Margins):** Generous internal padding prevents text crowding:
   ```javascript
   margins: { top: 120, bottom: 120, left: 180, right: 180 }
   ```
5. **Header Rows:** Always style with `shading: { fill: '0F172A' }`, `bold: true`, `color: 'FFFFFF'`, and set `cantSplit: true`.

---

## 4. Slide Card Visual Architecture (10 Mandatory Fields)

Each slide in the presentation specification must be rendered as a dedicated, self-contained visual card containing all 10 required fields in structured rows:

```
┌────────────────────────────────────────────────────────────────────────┐
│  SLIDE 1: Clinical Topic Presentation Title                            │  <- Navy Header (#0F172A)
├──────────────────────┬─────────────────────────────────────────────────┤
│ 1. Objective         │ Clear single-sentence learning/clinical outcome │
├──────────────────────┼─────────────────────────────────────────────────┤
│ 2. Main Message      │ High-yield core takeaway                        │
├──────────────────────┼─────────────────────────────────────────────────┤
│ 3. On-Slide Text     │ • Concise bullet point 1                        │
│                      │ • Concise bullet point 2                        │
│                      │ • Concise bullet point 3 (30–40% occupancy)     │
├──────────────────────┼─────────────────────────────────────────────────┤
│ 4. Suggested Visual  │ Diagram / Forest Plot / Flowchart / Timeline    │
├──────────────────────┼─────────────────────────────────────────────────┤
│ 5. Visual Description│ Detailed layout of visual elements & labels     │
├──────────────────────┼─────────────────────────────────────────────────┤
│ 6. Speaker Notes     │ Verbatim spoken clinical commentary & script    │
├──────────────────────┼─────────────────────────────────────────────────┤
│ 7. Audience Question │ Interactive audience engagement question        │
├──────────────────────┼─────────────────────────────────────────────────┤
│ 8. Transition        │ Smooth logical pivot to next slide              │
├──────────────────────┴─────────────────────────────────────────────────┤
│  16:9 Widescreen • Arial 12–14pt • copyrights@Raouf Roshdy2025, 9pt    │  <- Card Footer
└────────────────────────────────────────────────────────────────────────┘
```

### Key Slide Card Implementation Checklist:
- **Slide Header Banner:** Navy fill (`#0F172A`), White text, Slide Number badge in Ice Blue (`#93C5FD`).
- **Label Column:** Exactly 2,600 dxa wide, shaded light teal (`#F0FDFA`), bold Navy text.
- **Content Column:** Exactly 6,900 dxa wide, crisp formatting with appropriate bullet levels.
- **Speaker Notes Callout:** Subtle background fill (`#F8FAFC`) with left accent border to distinguish spoken audio guidance from visible slide content.
- **Right Lower Corner:** `copyrights@Raouf Roshdy2025` rendered in Arial 9 pt.

---

## 5. Educational Disclaimer & Callout Styling

The mandatory Educational Disclaimer must be presented in a styled callout box on the cover page and referenced in project info:
- **Background Fill:** Light Ice Blue/Teal (`#F0FDFA`) or soft alert background.
- **Left Accent Border:** Thick 24-point bar in Teal (`#0D9488`).
- **Text:** Bold label `EDUCATIONAL DISCLAIMER:` followed by:
  > *"This material is intended for educational and presentation-planning purposes. It does not replace critical appraisal of the original sources or professional clinical judgment."*

---

## 6. Vancouver Reference Section Formatting

- **Placement:** Strictly in Section 11 at the very end of the document.
- **Rule:** Zero in-text citations on slide cards or speaker notes.
- **Entry Structure:**
  - Numbered bracket `[1]`, `[2]`, `[3]`.
  - Authors in NLM format (Surname Initials without periods: `Smith JA, Jones BC`).
  - Title in sentence case.
  - Journal title in standard NLM abbreviation or full title.
  - Year; Volume(Issue): Pages.
  - Identifiers: `PMID: ...` and `DOI: ...` clearly legible.

---

## 7. Quality Checklist Before Export

Before finalizing or releasing a Word `.docx` file:
- [ ] English language strictly maintained throughout.
- [ ] Exact 11-part document order verified (Cover, Project Info, Topic/Title, Audience/Slide Settings, Approved Keywords, Approved Strategy, Selected Papers Table, Research Gaps, Outline, Slide-by-Slide Content, References).
- [ ] Arial typography used exclusively.
- [ ] Table column widths sum to 9,500 dxa on every row.
- [ ] All 10 mandatory slide fields present on every slide.
- [ ] Zero references or citations on individual slide cards.
- [ ] Educational disclaimer present and unaltered.
- [ ] `copyrights@Raouf Roshdy2025` present in specified locations in Arial 9 pt.
- [ ] Pre-export integrity validator passes all checks with zero errors.
