const docx = require('docx');
const {
  Document,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  AlignmentType,
  WidthType,
  BorderStyle,
  ShadingType,
  PageBreak,
  Header,
  Footer,
  PageNumber
} = docx;

// Color Palette adhering to word-document-styling skill
const COLORS = {
  navy: '0F172A',
  slateDark: '334155',
  slateMed: '475569',
  slateLight: '64748B',
  teal: '0D9488',
  secondary: '0D9488',
  tealLight: 'F0FDFA',
  bgSoft: 'F8FAFC',
  borderSoft: 'E2E8F0',
  white: 'FFFFFF',
  accentBlue: '2563EB',
  noteBg: 'EFF6FF',
  amberBg: 'FEF3C7',
  amberDark: '92400E',
  successGreen: '15803D',
  iceBlue: '93C5FD'
};

function createBorder(color = COLORS.borderSoft, size = 1) {
  return {
    style: BorderStyle.SINGLE,
    size: size,
    color: color
  };
}

const tableBorders = {
  top: createBorder(),
  bottom: createBorder(),
  left: createBorder(),
  right: createBorder(),
  insideHorizontal: createBorder(),
  insideVertical: createBorder()
};

const slideBoxBorders = {
  top: createBorder(COLORS.navy, 2),
  bottom: createBorder(COLORS.slateLight, 1),
  left: createBorder(COLORS.navy, 6),
  right: createBorder(COLORS.slateLight, 1),
  insideHorizontal: { style: BorderStyle.NONE },
  insideVertical: { style: BorderStyle.NONE }
};

/**
 * Builds the Word document following the strict 11-part order:
 * 1. Cover page
 * 2. Project information
 * 3. Topic and short presentation title
 * 4. Audience and slide settings
 * 5. Approved keywords
 * 6. Approved search strategy
 * 7. Selected papers table
 * 8. Research gaps and unresolved questions
 * 9. Presentation outline
 * 10. Full slide-by-slide content (10 fields per slide, no in-text citations or per-slide references)
 * 11. References (final references section)
 */
async function generatePresentationDocx({ topic, deck, papers, meta }) {
  const currentDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const children = [];

  // ==========================================
  // 1. COVER PAGE
  // ==========================================
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 300, after: 120 },
      children: [
        new TextRun({
          text: 'Preppt – Scientific Literature to Presentation',
          font: 'Arial',
          size: 26,
          bold: true,
          color: COLORS.teal,
          tracking: 80
        })
      ]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 100, after: 200 },
      children: [
        new TextRun({
          text: 'Evidence-Based Scientific Presentation Specification Document',
          font: 'Arial',
          size: 24,
          color: COLORS.slateMed
        })
      ]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 200, after: 150 },
      children: [
        new TextRun({
          text: deck.shortTitle || topic,
          font: 'Arial',
          size: 42,
          bold: true,
          color: COLORS.navy
        })
      ]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 50, after: 300 },
      children: [
        new TextRun({
          text: topic,
          font: 'Arial',
          size: 24,
          italic: true,
          color: COLORS.slateDark
        })
      ]
    }),
    // Educational Disclaimer Box on Cover Page
    new Table({
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: 9500, type: WidthType.DXA },
              shading: { fill: COLORS.amberBg, type: ShadingType.CLEAR },
              margins: { top: 120, bottom: 120, left: 180, right: 180 },
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: 'EDUCATIONAL DISCLAIMER: ',
                      font: 'Arial',
                      size: 20,
                      bold: true,
                      color: COLORS.amberDark
                    }),
                    new TextRun({
                      text: deck.disclaimer || 'This material is intended for educational and presentation-planning purposes. It does not replace critical appraisal of the original sources or professional clinical judgment.',
                      font: 'Arial',
                      size: 20,
                      italic: true,
                      color: COLORS.amberDark
                    })
                  ]
                })
              ]
            })
          ]
        })
      ],
      borders: tableBorders,
      width: { size: 9500, type: WidthType.DXA }
    }),
    new Paragraph({ spacing: { after: 300 } }),
    new Paragraph({ children: [new PageBreak()] })
  );

  // ==========================================
  // 2. PROJECT INFORMATION
  // ==========================================
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 150, after: 120 },
      children: [
        new TextRun({
          text: '2. Project Information',
          font: 'Arial',
          size: 28,
          bold: true,
          color: COLORS.navy
        })
      ]
    }),
    new Table({
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: 3200, type: WidthType.DXA },
              shading: { fill: COLORS.tealLight, type: ShadingType.CLEAR },
              children: [new Paragraph({ children: [new TextRun({ text: 'Application Identity', font: 'Arial', bold: true, size: 22, color: COLORS.navy })] })]
            }),
            new TableCell({
              width: { size: 6300, type: WidthType.DXA },
              children: [new Paragraph({ children: [new TextRun({ text: 'Preppt – Scientific Literature to Presentation', font: 'Arial', size: 22 })] })]
            })
          ]
        }),
        new TableRow({
          children: [
            new TableCell({
              width: { size: 3200, type: WidthType.DXA },
              shading: { fill: COLORS.tealLight, type: ShadingType.CLEAR },
              children: [new Paragraph({ children: [new TextRun({ text: 'Generation Date', font: 'Arial', bold: true, size: 22, color: COLORS.navy })] })]
            }),
            new TableCell({
              width: { size: 6300, type: WidthType.DXA },
              children: [new Paragraph({ children: [new TextRun({ text: currentDate, font: 'Arial', size: 22 })] })]
            })
          ]
        }),
        new TableRow({
          children: [
            new TableCell({
              width: { size: 3200, type: WidthType.DXA },
              shading: { fill: COLORS.tealLight, type: ShadingType.CLEAR },
              children: [new Paragraph({ children: [new TextRun({ text: 'Author / System Copyright', font: 'Arial', bold: true, size: 22, color: COLORS.navy })] })]
            }),
            new TableCell({
              width: { size: 6300, type: WidthType.DXA },
              children: [new Paragraph({ children: [new TextRun({ text: 'copyrights@Raouf Roshdy2025', font: 'Arial', size: 22 })] })]
            })
          ]
        })
      ],
      borders: tableBorders,
      width: { size: 9500, type: WidthType.DXA }
    }),
    new Paragraph({ spacing: { after: 200 } })
  );

  // ==========================================
  // 3. TOPIC AND SHORT PRESENTATION TITLE
  // ==========================================
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 150, after: 120 },
      children: [
        new TextRun({
          text: '3. Topic and Short Presentation Title',
          font: 'Arial',
          size: 28,
          bold: true,
          color: COLORS.navy
        })
      ]
    }),
    new Table({
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: 3200, type: WidthType.DXA },
              shading: { fill: COLORS.tealLight, type: ShadingType.CLEAR },
              children: [new Paragraph({ children: [new TextRun({ text: 'Full Scientific Topic', font: 'Arial', bold: true, size: 22, color: COLORS.navy })] })]
            }),
            new TableCell({
              width: { size: 6300, type: WidthType.DXA },
              children: [new Paragraph({ children: [new TextRun({ text: topic, font: 'Arial', size: 22 })] })]
            })
          ]
        }),
        new TableRow({
          children: [
            new TableCell({
              width: { size: 3200, type: WidthType.DXA },
              shading: { fill: COLORS.tealLight, type: ShadingType.CLEAR },
              children: [new Paragraph({ children: [new TextRun({ text: 'Short Presentation Title', font: 'Arial', bold: true, size: 22, color: COLORS.navy })] })]
            }),
            new TableCell({
              width: { size: 6300, type: WidthType.DXA },
              children: [new Paragraph({ children: [new TextRun({ text: deck.shortTitle || topic, font: 'Arial', bold: true, size: 22 })] })]
            })
          ]
        })
      ],
      borders: tableBorders,
      width: { size: 9500, type: WidthType.DXA }
    }),
    new Paragraph({ spacing: { after: 200 } })
  );

  // ==========================================
  // 4. AUDIENCE AND SLIDE SETTINGS
  // ==========================================
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 150, after: 120 },
      children: [
        new TextRun({
          text: '4. Audience and Slide Settings',
          font: 'Arial',
          size: 28,
          bold: true,
          color: COLORS.navy
        })
      ]
    }),
    new Table({
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: 3200, type: WidthType.DXA },
              shading: { fill: COLORS.tealLight, type: ShadingType.CLEAR },
              children: [new Paragraph({ children: [new TextRun({ text: 'Target Audience', font: 'Arial', bold: true, size: 22, color: COLORS.navy })] })]
            }),
            new TableCell({
              width: { size: 6300, type: WidthType.DXA },
              children: [new Paragraph({ children: [new TextRun({ text: deck.meta?.audience || 'Postgraduate', font: 'Arial', size: 22 })] })]
            })
          ]
        }),
        new TableRow({
          children: [
            new TableCell({
              width: { size: 3200, type: WidthType.DXA },
              shading: { fill: COLORS.tealLight, type: ShadingType.CLEAR },
              children: [new Paragraph({ children: [new TextRun({ text: 'Slide Count', font: 'Arial', bold: true, size: 22, color: COLORS.navy })] })]
            }),
            new TableCell({
              width: { size: 6300, type: WidthType.DXA },
              children: [new Paragraph({ children: [new TextRun({ text: `${deck.slides.length} slides`, font: 'Arial', size: 22 })] })]
            })
          ]
        }),
        new TableRow({
          children: [
            new TableCell({
              width: { size: 3200, type: WidthType.DXA },
              shading: { fill: COLORS.tealLight, type: ShadingType.CLEAR },
              children: [new Paragraph({ children: [new TextRun({ text: 'Slide Density', font: 'Arial', bold: true, size: 22, color: COLORS.navy })] })]
            }),
            new TableCell({
              width: { size: 6300, type: WidthType.DXA },
              children: [new Paragraph({ children: [new TextRun({ text: `${deck.meta?.slideDensity || 'Balanced'} (${deck.specs?.textOccupancyTarget || '30–40% target'})`, font: 'Arial', size: 22 })] })]
            })
          ]
        }),
        new TableRow({
          children: [
            new TableCell({
              width: { size: 3200, type: WidthType.DXA },
              shading: { fill: COLORS.tealLight, type: ShadingType.CLEAR },
              children: [new Paragraph({ children: [new TextRun({ text: 'Slide Aspect Ratio', font: 'Arial', bold: true, size: 22, color: COLORS.navy })] })]
            }),
            new TableCell({
              width: { size: 6300, type: WidthType.DXA },
              children: [new Paragraph({ children: [new TextRun({ text: '16:9 Widescreen (Arial 12–14 pt)', font: 'Arial', size: 22 })] })]
            })
          ]
        }),
        new TableRow({
          children: [
            new TableCell({
              width: { size: 3200, type: WidthType.DXA },
              shading: { fill: COLORS.tealLight, type: ShadingType.CLEAR },
              children: [new Paragraph({ children: [new TextRun({ text: 'Target Presentation Duration', font: 'Arial', bold: true, size: 22, color: COLORS.navy })] })]
            }),
            new TableCell({
              width: { size: 6300, type: WidthType.DXA },
              children: [new Paragraph({ children: [new TextRun({ text: '15-minute presentation (~1.2–1.5 min per slide pacing)', font: 'Arial', size: 22 })] })]
            })
          ]
        })
      ],
      borders: tableBorders,
      width: { size: 9500, type: WidthType.DXA }
    }),
    new Paragraph({ spacing: { after: 200 } })
  );

  // ==========================================
  // 5. APPROVED KEYWORDS
  // ==========================================
  const approvedKw = deck.approvedKeywords || {};
  const kwList = [
    `Primary Keywords: ${(approvedKw.primaryKeywords || ['Topic-derived keywords']).join(', ')}`,
    `Synonyms & Related Terms: ${(approvedKw.synonyms || ['Clinical synonyms']).join(', ')}`,
    `MeSH & Biomedical Concepts: ${(approvedKw.meshConcepts || ['MeSH terms']).join(', ')}`
  ];

  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 150, after: 120 },
      children: [
        new TextRun({
          text: '5. Approved Keywords',
          font: 'Arial',
          size: 28,
          bold: true,
          color: COLORS.navy
        })
      ]
    })
  );

  kwList.forEach(k => {
    children.push(
      new Paragraph({
        bullet: { level: 0 },
        spacing: { after: 60 },
        children: [
          new TextRun({
            text: k,
            font: 'Arial',
            size: 22,
            color: COLORS.slateDark
          })
        ]
      })
    );
  });
  children.push(new Paragraph({ spacing: { after: 150 } }));

  // ==========================================
  // 6. APPROVED SEARCH STRATEGY
  // ==========================================
  const approvedStrat = deck.approvedStrategy || {};
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 150, after: 120 },
      children: [
        new TextRun({
          text: '6. Approved Search Strategy',
          font: 'Arial',
          size: 28,
          bold: true,
          color: COLORS.navy
        })
      ]
    }),
    new Table({
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: 3200, type: WidthType.DXA },
              shading: { fill: COLORS.tealLight, type: ShadingType.CLEAR },
              children: [new Paragraph({ children: [new TextRun({ text: 'PMC / Europe PMC Query', font: 'Arial', bold: true, size: 22, color: COLORS.navy })] })]
            }),
            new TableCell({
              width: { size: 6300, type: WidthType.DXA },
              children: [new Paragraph({ children: [new TextRun({ text: approvedStrat.pmc?.query || `(${topic}) AND (PUB_YEAR:[${deck.meta?.startYear || 2021} TO ${new Date().getFullYear()}])`, font: 'Arial', size: 20 })] })]
            })
          ]
        }),
        new TableRow({
          children: [
            new TableCell({
              width: { size: 3200, type: WidthType.DXA },
              shading: { fill: COLORS.tealLight, type: ShadingType.CLEAR },
              children: [new Paragraph({ children: [new TextRun({ text: 'Semantic Scholar Query', font: 'Arial', bold: true, size: 22, color: COLORS.navy })] })]
            }),
            new TableCell({
              width: { size: 6300, type: WidthType.DXA },
              children: [new Paragraph({ children: [new TextRun({ text: `${approvedStrat.semanticScholar?.query || topic} (Year: ${deck.meta?.startYear || 2021}-${new Date().getFullYear()})`, font: 'Arial', size: 20 })] })]
            })
          ]
        })
      ],
      borders: tableBorders,
      width: { size: 9500, type: WidthType.DXA }
    }),
    new Paragraph({ spacing: { after: 200 } })
  );

  // ==========================================
  // 7. SELECTED PAPERS TABLE
  // ==========================================
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 150, after: 120 },
      children: [
        new TextRun({
          text: '7. Selected Papers Table',
          font: 'Arial',
          size: 28,
          bold: true,
          color: COLORS.navy
        })
      ]
    })
  );

  const paperTableRows = [
    new TableRow({
      children: [
        new TableCell({ width: { size: 800, type: WidthType.DXA }, shading: { fill: COLORS.navy, type: ShadingType.CLEAR }, children: [new Paragraph({ children: [new TextRun({ text: '#', font: 'Arial', bold: true, size: 20, color: COLORS.white })] })] }),
        new TableCell({ width: { size: 4200, type: WidthType.DXA }, shading: { fill: COLORS.navy, type: ShadingType.CLEAR }, children: [new Paragraph({ children: [new TextRun({ text: 'Title & Identifiers', font: 'Arial', bold: true, size: 20, color: COLORS.white })] })] }),
        new TableCell({ width: { size: 2500, type: WidthType.DXA }, shading: { fill: COLORS.navy, type: ShadingType.CLEAR }, children: [new Paragraph({ children: [new TextRun({ text: 'Authors & Journal', font: 'Arial', bold: true, size: 20, color: COLORS.white })] })] }),
        new TableCell({ width: { size: 1000, type: WidthType.DXA }, shading: { fill: COLORS.navy, type: ShadingType.CLEAR }, children: [new Paragraph({ children: [new TextRun({ text: 'Year', font: 'Arial', bold: true, size: 20, color: COLORS.white })] })] }),
        new TableCell({ width: { size: 1000, type: WidthType.DXA }, shading: { fill: COLORS.navy, type: ShadingType.CLEAR }, children: [new Paragraph({ children: [new TextRun({ text: 'Source', font: 'Arial', bold: true, size: 20, color: COLORS.white })] })] })
      ]
    })
  ];

  papers.forEach((p, idx) => {
    const idInfo = p.pmid ? `PMID:${p.pmid}` : (p.doi ? `DOI:${p.doi}` : `ID:${p.id?.substring(0, 8)}`);
    paperTableRows.push(
      new TableRow({
        children: [
          new TableCell({ width: { size: 800, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: String(idx + 1), font: 'Arial', size: 18 })] })] }),
          new TableCell({ width: { size: 4200, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: p.title || 'Untitled', font: 'Arial', bold: true, size: 18 })] }), new Paragraph({ children: [new TextRun({ text: idInfo, font: 'Arial', size: 16, color: COLORS.slateLight })] })] }),
          new TableCell({ width: { size: 2500, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: `${p.authors || 'Unknown'} — ${p.journal || 'Journal'}`, font: 'Arial', size: 18 })] })] }),
          new TableCell({ width: { size: 1000, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: String(p.year || 'n.d.'), font: 'Arial', size: 18 })] })] }),
          new TableCell({ width: { size: 1000, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: p.source === 'both' ? 'PMC+S2' : (p.source === 's2' ? 'S2' : 'PMC'), font: 'Arial', size: 18 })] })] })
        ]
      })
    );
  });

  children.push(
    new Table({
      rows: paperTableRows,
      borders: tableBorders,
      width: { size: 9500, type: WidthType.DXA }
    }),
    new Paragraph({ spacing: { after: 200 } })
  );

  // ==========================================
  // 8. RESEARCH GAPS AND UNRESOLVED QUESTIONS (Prompt 12 exact order)
  // ==========================================
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 150, after: 120 },
      children: [
        new TextRun({
          text: '8. Research Gaps and Unresolved Questions',
          font: 'Arial',
          size: 28,
          bold: true,
          color: COLORS.navy
        })
      ]
    }),
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 100, after: 80 },
      children: [
        new TextRun({
          text: '8.1 Concise Evidence-Based Synthesis Plan',
          font: 'Arial',
          size: 24,
          bold: true,
          color: COLORS.teal
        })
      ]
    })
  );

  const plan = deck.synthesisPlan || {};
  if (plan.objective) {
    children.push(
      new Paragraph({
        spacing: { after: 80 },
        children: [
          new TextRun({
            text: 'Synthesis Scope: ',
            font: 'Arial',
            size: 20,
            bold: true,
            color: COLORS.navy
          }),
          new TextRun({
            text: plan.objective,
            font: 'Arial',
            size: 20,
            color: COLORS.slateDark
          })
        ]
      })
    );
  }

  if (plan.methodologyNote) {
    children.push(
      new Paragraph({
        spacing: { after: 120 },
        children: [
          new TextRun({
            text: plan.methodologyNote,
            font: 'Arial',
            size: 19,
            italic: true,
            color: COLORS.slateLight
          })
        ]
      })
    );
  }

  // Thematic Synthesis Table
  if (Array.isArray(plan.themes) && plan.themes.length > 0) {
    const themeRows = [
      new TableRow({
        children: [
          new TableCell({ width: { size: 2300, type: WidthType.DXA }, shading: { fill: COLORS.navy, type: ShadingType.CLEAR }, children: [new Paragraph({ children: [new TextRun({ text: 'Synthesis Theme / Domain', font: 'Arial', bold: true, size: 20, color: COLORS.white })] })] }),
          new TableCell({ width: { size: 3600, type: WidthType.DXA }, shading: { fill: COLORS.teal, type: ShadingType.CLEAR }, children: [new Paragraph({ children: [new TextRun({ text: 'Established Findings (Robust Evidence)', font: 'Arial', bold: true, size: 20, color: COLORS.white })] })] }),
          new TableCell({ width: { size: 3600, type: WidthType.DXA }, shading: { fill: COLORS.slateDark, type: ShadingType.CLEAR }, children: [new Paragraph({ children: [new TextRun({ text: 'Uncertain or Unresolved Areas', font: 'Arial', bold: true, size: 20, color: COLORS.white })] })] })
        ]
      })
    ];

    plan.themes.forEach(t => {
      themeRows.push(
        new TableRow({
          children: [
            new TableCell({
              width: { size: 2300, type: WidthType.DXA },
              shading: { fill: COLORS.tealLight, type: ShadingType.CLEAR },
              children: [
                new Paragraph({ children: [new TextRun({ text: t.title, font: 'Arial', bold: true, size: 19, color: COLORS.navy })] }),
                new Paragraph({ children: [new TextRun({ text: t.scope || '', font: 'Arial', size: 16, color: COLORS.slateLight })] })
              ]
            }),
            new TableCell({
              width: { size: 3600, type: WidthType.DXA },
              children: [
                new Paragraph({ children: [new TextRun({ text: '✓ Established: ', font: 'Arial', bold: true, size: 18, color: COLORS.teal }), new TextRun({ text: t.establishedFindings, font: 'Arial', size: 18, color: COLORS.slateDark })] })
              ]
            }),
            new TableCell({
              width: { size: 3600, type: WidthType.DXA },
              children: [
                new Paragraph({ children: [new TextRun({ text: '⚠ Unresolved: ', font: 'Arial', bold: true, size: 18, color: COLORS.amberDark }), new TextRun({ text: t.uncertainOrUnresolvedAreas, font: 'Arial', size: 18, color: COLORS.slateDark })] })
              ]
            })
          ]
        })
      );
    });

    children.push(
      new Table({
        rows: themeRows,
        borders: tableBorders,
        width: { size: 9500, type: WidthType.DXA }
      }),
      new Paragraph({ spacing: { after: 150 } })
    );
  }

  // 8.2 Research Gaps & Unresolved Clinical Questions
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 120, after: 80 },
      children: [
        new TextRun({
          text: '8.2 Research Gaps & Unresolved Clinical Questions',
          font: 'Arial',
          size: 24,
          bold: true,
          color: COLORS.teal
        })
      ]
    }),
    new Paragraph({
      spacing: { after: 80 },
      children: [
        new TextRun({
          text: 'Identified areas where evidence is limited, conflicting, or warrants prospective investigation:',
          font: 'Arial',
          size: 20,
          italic: true,
          color: COLORS.slateLight
        })
      ]
    })
  );

  const gaps = Array.isArray(deck.structuredResearchGaps) && deck.structuredResearchGaps.length > 0
    ? deck.structuredResearchGaps
    : (deck.researchGaps || []);

  gaps.forEach((gap, idx) => {
    if (typeof gap === 'object' && gap.domain) {
      children.push(
        new Paragraph({
          spacing: { before: 80, after: 30 },
          children: [
            new TextRun({
              text: `${idx + 1}. ${gap.domain}`,
              font: 'Arial',
              size: 21,
              bold: true,
              color: COLORS.navy
            })
          ]
        }),
        new Paragraph({
          bullet: { level: 0 },
          spacing: { after: 30 },
          children: [
            new TextRun({ text: 'Established Baseline: ', font: 'Arial', bold: true, size: 19, color: COLORS.teal }),
            new TextRun({ text: gap.establishedBaseline, font: 'Arial', size: 19, color: COLORS.slateDark })
          ]
        }),
        new Paragraph({
          bullet: { level: 0 },
          spacing: { after: 60 },
          children: [
            new TextRun({ text: 'Unresolved Question: ', font: 'Arial', bold: true, size: 19, color: COLORS.amberDark }),
            new TextRun({ text: gap.unresolvedQuestion, font: 'Arial', size: 19, color: COLORS.slateDark })
          ]
        })
      );
    } else {
      children.push(
        new Paragraph({
          bullet: { level: 0 },
          spacing: { after: 80 },
          children: [
            new TextRun({
              text: String(gap),
              font: 'Arial',
              size: 20,
              color: COLORS.slateDark
            })
          ]
        })
      );
    }
  });

  children.push(new Paragraph({ spacing: { after: 200 } }));

  // ==========================================
  // 9. PRESENTATION OUTLINE
  // ==========================================
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 150, after: 120 },
      children: [
        new TextRun({
          text: '9. Presentation Outline',
          font: 'Arial',
          size: 28,
          bold: true,
          color: COLORS.navy
        })
      ]
    })
  );

  (deck.outline || []).forEach((out, idx) => {
    children.push(
      new Paragraph({
        bullet: { level: 0 },
        spacing: { after: 50 },
        children: [
          new TextRun({
            text: out,
            font: 'Arial',
            size: 22,
            color: COLORS.slateDark
          })
        ]
      })
    );
  });
  children.push(new Paragraph({ spacing: { after: 200 } }));

  // Page break before slide decks
  children.push(new Paragraph({ children: [new PageBreak()] }));

  // ==========================================
  // 10. FULL SLIDE-BY-SLIDE CONTENT
  // Strictly containing the 10 fields per slide:
  // 1. Slide number
  // 2. Slide title
  // 3. Slide objective
  // 4. Main message
  // 5. On-slide text
  // 6. Suggested visual type
  // 7. Detailed visual description
  // 8. Speaker notes
  // 9. Interactive question for the audience
  // 10. Logical transition from the previous slide
  // (NO in-text citations or references below slide)
  // Right lower corner: copyrights@Raouf Roshdy2025, Arial 9 pt
  // ==========================================
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 100, after: 200 },
      children: [
        new TextRun({
          text: '10. Full Slide-by-Slide Content',
          font: 'Arial',
          size: 30,
          bold: true,
          color: COLORS.navy
        })
      ]
    })
  );

  deck.slides.forEach(slide => {
    const slideRows = [];

    // Header: 1. Slide number & 2. Slide title
    slideRows.push(
      new TableRow({
        children: [
          new TableCell({
            width: { size: 9500, type: WidthType.DXA },
            shading: { fill: COLORS.navy, type: ShadingType.CLEAR },
            margins: { top: 120, bottom: 120, left: 180, right: 180 },
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: `SLIDE ${slide.slide_number ?? slide.slideNumber}: `,
                    font: 'Arial',
                    size: 24,
                    bold: true,
                    color: '93C5FD'
                  }),
                  new TextRun({
                    text: slide.title,
                    font: 'Arial',
                    size: 26,
                    bold: true,
                    color: COLORS.white
                  })
                ]
              }),
              new Paragraph({
                children: [
                  new TextRun({
                    text: `Format: 16:9  |  Font: Arial (12–14 pt)  |  Density: ${slide.slide_density || slide.slideDensity || 'Balanced'} (${slide.text_occupancy_target || slide.textOccupancyTarget || '30–40%'})`,
                    font: 'Arial',
                    size: 18,
                    italic: true,
                    color: 'E2E8F0'
                  })
                ]
              })
            ]
          })
        ]
      })
    );

    // Body: Fields 3 to 10
    const bodyChildren = [
      // 3. Slide objective
      new Paragraph({
        spacing: { before: 80, after: 40 },
        children: [
          new TextRun({ text: 'Slide Objective: ', font: 'Arial', size: 22, bold: true, color: COLORS.teal }),
          new TextRun({ text: slide.objective, font: 'Arial', size: 22, color: COLORS.slateDark })
        ]
      }),
      // 4. Main message
      new Paragraph({
        spacing: { before: 40, after: 80 },
        children: [
          new TextRun({ text: 'Main Message: ', font: 'Arial', size: 22, bold: true, color: COLORS.navy }),
          new TextRun({ text: slide.main_message ?? slide.mainMessage, font: 'Arial', size: 22, italic: true, color: COLORS.slateDark })
        ]
      }),
      // 5. On-slide text (Kept in single coherent text box)
      new Paragraph({
        spacing: { before: 80, after: 40 },
        children: [
          new TextRun({ text: 'On-Slide Text (Visible Slide Content):', font: 'Arial', size: 22, bold: true, color: COLORS.navy })
        ]
      })
    ];

    // Bullets of on-slide text
    const onSlideContent = slide.on_slide_text ?? slide.onSlideText ?? '';
    const bulletLines = onSlideContent.split('\n').filter(Boolean);
    bulletLines.forEach(bl => {
      bodyChildren.push(
        new Paragraph({
          bullet: { level: 0 },
          spacing: { after: 40 },
          children: [
            new TextRun({ text: bl.replace(/^[•\s*-]+/, '').trim(), font: 'Arial', size: 24, color: COLORS.slateDark })
          ]
        })
      );
    });

    // 6. Suggested visual type & 7. Detailed visual description
    const visualType = slide.suggested_visual_type ?? slide.suggestedVisualType ?? 'Diagram';
    const visualDesc = slide.detailed_visual_description ?? slide.detailedVisualDescription ?? 'Visual illustration supporting key findings.';
    bodyChildren.push(
      new Paragraph({
        spacing: { before: 80, after: 40 },
        children: [
          new TextRun({ text: 'Suggested Visual Type: ', font: 'Arial', size: 22, bold: true, color: COLORS.secondary }),
          new TextRun({ text: visualType, font: 'Arial', size: 22, bold: true, color: COLORS.secondary })
        ]
      }),
      new Paragraph({
        spacing: { after: 80 },
        children: [
          new TextRun({ text: 'Visual Description: ', font: 'Arial', size: 22, bold: true, color: COLORS.slateMed }),
          new TextRun({ text: visualDesc, font: 'Arial', size: 22, italic: true, color: COLORS.slateDark })
        ]
      })
    );

    // 8. Speaker notes (Narration script)
    const speakerNotesText = slide.speaker_notes ?? slide.speakerNotes ?? '';
    bodyChildren.push(
      new Paragraph({
        spacing: { before: 80, after: 40 },
        children: [
          new TextRun({ text: 'Speaker Notes (Narration Script):', font: 'Arial', size: 22, bold: true, color: COLORS.accentBlue })
        ]
      }),
      new Paragraph({
        spacing: { after: 80 },
        children: [
          new TextRun({ text: speakerNotesText, font: 'Arial', size: 22, color: COLORS.slateDark })
        ]
      })
    );

    // 9. Interactive question for the audience
    const audienceQuestionText = slide.interactive_question ?? slide.interactiveQuestion ?? '';
    bodyChildren.push(
      new Paragraph({
        spacing: { before: 40, after: 40 },
        children: [
          new TextRun({ text: 'Interactive Question for Audience: ', font: 'Arial', size: 22, bold: true, color: COLORS.amberDark }),
          new TextRun({ text: audienceQuestionText, font: 'Arial', size: 22, color: COLORS.slateDark })
        ]
      })
    );

    // 10. Logical transition from previous slide
    const transitionText = slide.logical_transition ?? slide.logicalTransition ?? slide.transition ?? '';
    bodyChildren.push(
      new Paragraph({
        spacing: { before: 40, after: 80 },
        children: [
          new TextRun({ text: 'Logical Transition: ', font: 'Arial', size: 22, bold: true, color: COLORS.slateMed }),
          new TextRun({ text: transitionText, font: 'Arial', size: 22, italic: true, color: COLORS.slateMed })
        ]
      })
    );

    slideRows.push(
      new TableRow({
        children: [
          new TableCell({
            width: { size: 9500, type: WidthType.DXA },
            shading: { fill: COLORS.bgSoft, type: ShadingType.CLEAR },
            margins: { top: 120, bottom: 120, left: 180, right: 180 },
            children: bodyChildren
          })
        ]
      })
    );

    // Footer copyright on every slide (right lower corner, Arial 9 pt)
    slideRows.push(
      new TableRow({
        children: [
          new TableCell({
            width: { size: 9500, type: WidthType.DXA },
            shading: { fill: COLORS.white, type: ShadingType.CLEAR },
            margins: { top: 60, bottom: 60, left: 180, right: 180 },
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({
                    text: 'copyrights@Raouf Roshdy2025',
                    font: 'Arial',
                    size: 18, // 9 pt
                    color: COLORS.slateLight
                  })
                ]
              })
            ]
          })
        ]
      })
    );

    children.push(
      new Table({
        rows: slideRows,
        borders: slideBoxBorders,
        width: { size: 9500, type: WidthType.DXA }
      }),
      new Paragraph({ spacing: { after: 260 } })
    );
  });

  // Page break before references
  children.push(new Paragraph({ children: [new PageBreak()] }));

  // ==========================================
  // 11. REFERENCES (Separated into this final section)
  // ==========================================
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 100, after: 150 },
      children: [
        new TextRun({
          text: '11. References',
          font: 'Arial',
          size: 28,
          bold: true,
          color: COLORS.navy
        })
      ]
    }),
    new Paragraph({
      spacing: { after: 150 },
      children: [
        new TextRun({
          text: `The following ${papers.length} peer-reviewed studies were retrieved from PubMed Central (Europe PMC) and Semantic Scholar, deduplicated, and approved for this presentation deck:`,
          font: 'Arial',
          size: 22,
          color: COLORS.slateMed
        })
      ]
    })
  );

  (deck.references || []).forEach(ref => {
    children.push(
      new Paragraph({
        spacing: { before: 60, after: 60 },
        children: [
          new TextRun({
            text: `[${ref.referenceNumber}] `,
            font: 'Arial',
            size: 22,
            bold: true,
            color: COLORS.navy
          }),
          new TextRun({
            text: `${ref.authors}. `,
            font: 'Arial',
            size: 22,
            bold: true,
            color: COLORS.slateDark
          }),
          new TextRun({
            text: `${ref.title}. `,
            font: 'Arial',
            size: 22,
            color: COLORS.slateDark
          }),
          new TextRun({
            text: `${ref.journal}. `,
            font: 'Arial',
            size: 22,
            italic: true,
            color: COLORS.slateMed
          }),
          new TextRun({
            text: `${ref.year}.${ref.pmid ? ` PMID: ${ref.pmid}.` : ''}${ref.doi ? ` DOI: https://doi.org/${ref.doi}.` : ''}`,
            font: 'Arial',
            size: 22,
            color: COLORS.slateMed
          })
        ]
      })
    );
  });

  // Assemble Complete Document
  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1000,
              right: 1000,
              bottom: 1000,
              left: 1000
            }
          }
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({
                    text: `Preppt – Scientific Literature to Presentation: ${deck.shortTitle || topic}`,
                    font: 'Arial',
                    size: 18,
                    color: COLORS.slateLight
                  })
                ]
              })
            ]
          })
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({
                    text: 'copyrights@Raouf Roshdy2025',
                    font: 'Arial',
                    size: 18,
                    color: COLORS.slateLight
                  }),
                  new TextRun({
                    text: '   |   Page ',
                    font: 'Arial',
                    size: 18,
                    color: COLORS.slateLight
                  }),
                  new TextRun({
                    children: [PageNumber.CURRENT],
                    font: 'Arial',
                    size: 18,
                    color: COLORS.slateLight
                  }),
                  new TextRun({
                    text: ' of ',
                    font: 'Arial',
                    size: 18,
                    color: COLORS.slateLight
                  }),
                  new TextRun({
                    children: [PageNumber.TOTAL_PAGES],
                    font: 'Arial',
                    size: 18,
                    color: COLORS.slateLight
                  })
                ]
              })
            ]
          })
        },
        children: children
      }
    ]
  });

  return await docx.Packer.toBuffer(doc);
}

module.exports = {
  generatePresentationDocx
};
