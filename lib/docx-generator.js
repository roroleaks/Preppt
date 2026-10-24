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
  borderSoft: 'CBD5E1',
  borderLight: 'E2E8F0',
  white: 'FFFFFF',
  accentBlue: '2563EB',
  noteBg: 'EFF6FF',
  amberBg: 'FEF3C7',
  amberDark: '92400E',
  amberLight: 'FFFBEB',
  successGreen: '15803D',
  iceBlue: '93C5FD'
};

// Page Geometry constants: Standard Letter with 1-inch (1440 dxa) margins
const PAGE_GEOMETRY = {
  width: 12240,
  height: 15840,
  margins: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
  printableWidth: 9360 // 12240 - 2880
};

function createBorder(color = COLORS.borderLight, size = 1) {
  return {
    style: BorderStyle.SINGLE,
    size: size,
    color: color
  };
}

const tableBorders = {
  top: createBorder(COLORS.borderSoft, 1),
  bottom: createBorder(COLORS.borderSoft, 1),
  left: createBorder(COLORS.borderSoft, 1),
  right: createBorder(COLORS.borderSoft, 1),
  insideHorizontal: createBorder(COLORS.borderLight, 1),
  insideVertical: createBorder(COLORS.borderLight, 1)
};

const slideBoxBorders = {
  top: createBorder(COLORS.navy, 3),
  bottom: createBorder(COLORS.slateLight, 1),
  left: createBorder(COLORS.navy, 5),
  right: createBorder(COLORS.slateLight, 1),
  insideHorizontal: createBorder(COLORS.borderLight, 1),
  insideVertical: createBorder(COLORS.borderLight, 1)
};

const defaultCellMargins = { top: 120, bottom: 120, left: 160, right: 160 };

/**
 * Parses markdown inline bold (**text**) and italic (*text*) into docx TextRuns.
 */
function parseFormattedRuns(text, defaultStyle = {}) {
  if (!text) return [new TextRun({ text: '', font: 'Arial', ...defaultStyle })];

  const runs = [];
  const tokens = String(text).split(/(\*\*.*?\*\*|\*[^*]+?\*)/g);

  for (const token of tokens) {
    if (!token) continue;
    if (token.startsWith('**') && token.endsWith('**') && token.length >= 4) {
      runs.push(new TextRun({
        font: 'Arial',
        size: defaultStyle.size || 20,
        color: defaultStyle.color || COLORS.slateDark,
        ...defaultStyle,
        text: token.slice(2, -2),
        bold: true
      }));
    } else if (token.startsWith('*') && token.endsWith('*') && token.length >= 2) {
      runs.push(new TextRun({
        font: 'Arial',
        size: defaultStyle.size || 20,
        color: defaultStyle.color || COLORS.slateDark,
        ...defaultStyle,
        text: token.slice(1, -1),
        italic: true
      }));
    } else {
      runs.push(new TextRun({
        font: 'Arial',
        size: defaultStyle.size || 20,
        color: defaultStyle.color || COLORS.slateDark,
        ...defaultStyle,
        text: token
      }));
    }
  }

  return runs.length > 0 ? runs : [new TextRun({ text: String(text), font: 'Arial', ...defaultStyle })];
}

/**
 * Organizes slide bullet points into logical, publication-grade bulleted paragraphs.
 * Automatically identifies and styles bold lead-in categories (e.g. "Category: Body").
 */
function formatBulletParagraphs(content) {
  if (!content) {
    return [
      new Paragraph({
        children: [new TextRun({ text: 'No on-slide bullet text specified.', font: 'Arial', size: 20, color: COLORS.slateDark })]
      })
    ];
  }

  const lines = String(content)
    .split('\n')
    .map(line => line.replace(/^[•\s*-]+/, '').trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return [
      new Paragraph({
        children: [new TextRun({ text: String(content), font: 'Arial', size: 20, color: COLORS.slateDark })]
      })
    ];
  }

  return lines.map(line => {
    let runs = [];
    if (!line.includes('**')) {
      const colonMatch = line.match(/^([A-Za-z0-9\s/&–-]{2,40}):(\s+)(.*)$/);
      if (colonMatch) {
        const leadIn = colonMatch[1].trim() + ': ';
        const bodyText = colonMatch[3];
        runs = [
          new TextRun({ text: leadIn, font: 'Arial', bold: true, size: 20, color: COLORS.navy }),
          ...parseFormattedRuns(bodyText, { size: 20, color: COLORS.slateDark })
        ];
      } else {
        runs = parseFormattedRuns(line, { size: 20, color: COLORS.slateDark });
      }
    } else {
      runs = parseFormattedRuns(line, { size: 20, color: COLORS.slateDark });
    }

    return new Paragraph({
      bullet: { level: 0 },
      spacing: { before: 24, after: 48, line: 260 },
      children: runs
    });
  });
}

/**
 * Formats visual layout specifications into structured, readable paragraphs.
 */
function formatVisualParagraphs(visualDesc) {
  if (!visualDesc) {
    return [
      new Paragraph({
        children: [
          new TextRun({ text: 'Visual Layout: ', font: 'Arial', bold: true, size: 19, color: COLORS.slateMed }),
          new TextRun({ text: 'Visual illustration supporting key findings.', font: 'Arial', italic: true, size: 19, color: COLORS.slateDark })
        ]
      })
    ];
  }

  const lines = String(visualDesc).split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length <= 1) {
    const text = lines[0] || String(visualDesc);
    let runs = [];
    if (text.toLowerCase().startsWith('visual description:') || text.toLowerCase().startsWith('layout:')) {
      runs = parseFormattedRuns(text, { size: 19, italic: true, color: COLORS.slateDark });
    } else {
      runs = [
        new TextRun({ text: 'Visual Layout & Specification: ', font: 'Arial', bold: true, size: 19, color: COLORS.slateMed }),
        ...parseFormattedRuns(text, { size: 19, italic: true, color: COLORS.slateDark })
      ];
    }
    return [
      new Paragraph({
        spacing: { before: 20, after: 30, line: 260 },
        children: runs
      })
    ];
  }

  return lines.map((l, i) => {
    let runs = [];
    const colonMatch = l.match(/^([A-Za-z0-9\s/&–-]{2,35}):(\s+)(.*)$/);
    if (colonMatch) {
      runs = [
        new TextRun({ text: colonMatch[1] + ': ', font: 'Arial', bold: true, size: 19, color: COLORS.teal }),
        ...parseFormattedRuns(colonMatch[3], { size: 19, italic: true, color: COLORS.slateDark })
      ];
    } else {
      runs = parseFormattedRuns(l, { size: 19, italic: true, color: COLORS.slateDark });
    }
    return new Paragraph({
      spacing: { before: i === 0 ? 20 : 16, after: 30, line: 260 },
      children: runs
    });
  });
}

/**
 * Formats speaker notes into natural spoken narration paragraphs.
 */
function formatSpeakerNotesParagraphs(notes) {
  if (!notes) {
    return [
      new Paragraph({
        children: [new TextRun({ text: 'No speaker notes specified.', font: 'Arial', italic: true, size: 19, color: COLORS.slateMed })]
      })
    ];
  }

  const rawParagraphs = String(notes)
    .split(/\n\s*\n|\n/)
    .map(p => p.trim())
    .filter(Boolean);

  if (rawParagraphs.length === 0) {
    return [
      new Paragraph({
        children: [new TextRun({ text: String(notes), font: 'Arial', italic: true, size: 19, color: '1E293B' })]
      })
    ];
  }

  return rawParagraphs.map((paraText, pIdx) => {
    return new Paragraph({
      spacing: { before: pIdx === 0 ? 20 : 30, after: 40, line: 276 },
      children: parseFormattedRuns(paraText, {
        size: 19,
        italic: true,
        color: '1E293B'
      })
    });
  });
}

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
      spacing: { before: 360, after: 120 },
      children: [
        new TextRun({
          text: 'Preppt – Scientific Literature to Presentation',
          font: 'Arial',
          size: 52, // 26 pt executive title
          bold: true,
          color: COLORS.navy
        })
      ]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 60, after: 280 },
      children: [
        new TextRun({
          text: 'Evidence-Based Scientific Presentation Specification Document',
          font: 'Arial',
          size: 28, // 14 pt
          bold: true,
          color: COLORS.teal
        })
      ]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 200, after: 120 },
      children: [
        new TextRun({
          text: deck.shortTitle || topic,
          font: 'Arial',
          size: 48, // 24 pt
          bold: true,
          color: COLORS.navy
        })
      ]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 40, after: 360 },
      children: [
        new TextRun({
          text: topic,
          font: 'Arial',
          size: 26, // 13 pt
          italic: true,
          color: COLORS.slateDark
        })
      ]
    }),
    // Educational Disclaimer Callout Card on Cover Page
    new Table({
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: PAGE_GEOMETRY.printableWidth, type: WidthType.DXA },
              shading: { fill: COLORS.amberBg, type: ShadingType.CLEAR },
              margins: { top: 140, bottom: 140, left: 180, right: 180 },
              borders: {
                top: createBorder('F59E0B', 2),
                bottom: createBorder('F59E0B', 2),
                left: createBorder('D97706', 6),
                right: createBorder('F59E0B', 2)
              },
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: 'EDUCATIONAL DISCLAIMER: ',
                      font: 'Arial',
                      size: 20, // 10 pt
                      bold: true,
                      color: COLORS.amberDark
                    }),
                    new TextRun({
                      text: deck.disclaimer || 'This material is intended for educational and presentation-planning purposes. It does not replace critical appraisal of the original sources or professional clinical judgment.',
                      font: 'Arial',
                      size: 20, // 10 pt
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
      borders: {
        top: { style: BorderStyle.NONE },
        bottom: { style: BorderStyle.NONE },
        left: { style: BorderStyle.NONE },
        right: { style: BorderStyle.NONE },
        insideHorizontal: { style: BorderStyle.NONE },
        insideVertical: { style: BorderStyle.NONE }
      },
      width: { size: PAGE_GEOMETRY.printableWidth, type: WidthType.DXA }
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
      spacing: { before: 240, after: 120 },
      children: [
        new TextRun({
          text: '2. Project Information',
          font: 'Arial',
          size: 40, // 20 pt Bold Navy
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
              width: { size: 3000, type: WidthType.DXA },
              shading: { fill: COLORS.tealLight, type: ShadingType.CLEAR },
              margins: defaultCellMargins,
              children: [new Paragraph({ children: [new TextRun({ text: 'Application Identity', font: 'Arial', bold: true, size: 20, color: COLORS.navy })] })]
            }),
            new TableCell({
              width: { size: 6360, type: WidthType.DXA },
              margins: defaultCellMargins,
              children: [new Paragraph({ children: [new TextRun({ text: 'Preppt – Scientific Literature to Presentation', font: 'Arial', size: 20, color: COLORS.slateDark })] })]
            })
          ]
        }),
        new TableRow({
          children: [
            new TableCell({
              width: { size: 3000, type: WidthType.DXA },
              shading: { fill: COLORS.tealLight, type: ShadingType.CLEAR },
              margins: defaultCellMargins,
              children: [new Paragraph({ children: [new TextRun({ text: 'Generation Date', font: 'Arial', bold: true, size: 20, color: COLORS.navy })] })]
            }),
            new TableCell({
              width: { size: 6360, type: WidthType.DXA },
              margins: defaultCellMargins,
              children: [new Paragraph({ children: [new TextRun({ text: currentDate, font: 'Arial', size: 20, color: COLORS.slateDark })] })]
            })
          ]
        }),
        new TableRow({
          children: [
            new TableCell({
              width: { size: 3000, type: WidthType.DXA },
              shading: { fill: COLORS.tealLight, type: ShadingType.CLEAR },
              margins: defaultCellMargins,
              children: [new Paragraph({ children: [new TextRun({ text: 'Author / System Copyright', font: 'Arial', bold: true, size: 20, color: COLORS.navy })] })]
            }),
            new TableCell({
              width: { size: 6360, type: WidthType.DXA },
              margins: defaultCellMargins,
              children: [new Paragraph({ children: [new TextRun({ text: 'copyrights@Raouf Roshdy2025', font: 'Arial', size: 20, color: COLORS.slateDark })] })]
            })
          ]
        })
      ],
      borders: tableBorders,
      width: { size: PAGE_GEOMETRY.printableWidth, type: WidthType.DXA }
    }),
    new Paragraph({ spacing: { after: 200 } })
  );

  // ==========================================
  // 3. TOPIC AND SHORT PRESENTATION TITLE
  // ==========================================
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 240, after: 120 },
      children: [
        new TextRun({
          text: '3. Topic and Short Presentation Title',
          font: 'Arial',
          size: 40, // 20 pt Bold Navy
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
              width: { size: 3000, type: WidthType.DXA },
              shading: { fill: COLORS.tealLight, type: ShadingType.CLEAR },
              margins: defaultCellMargins,
              children: [new Paragraph({ children: [new TextRun({ text: 'Full Scientific Topic', font: 'Arial', bold: true, size: 20, color: COLORS.navy })] })]
            }),
            new TableCell({
              width: { size: 6360, type: WidthType.DXA },
              margins: defaultCellMargins,
              children: [new Paragraph({ children: [new TextRun({ text: topic, font: 'Arial', size: 20, color: COLORS.slateDark })] })]
            })
          ]
        }),
        new TableRow({
          children: [
            new TableCell({
              width: { size: 3000, type: WidthType.DXA },
              shading: { fill: COLORS.tealLight, type: ShadingType.CLEAR },
              margins: defaultCellMargins,
              children: [new Paragraph({ children: [new TextRun({ text: 'Short Presentation Title', font: 'Arial', bold: true, size: 20, color: COLORS.navy })] })]
            }),
            new TableCell({
              width: { size: 6360, type: WidthType.DXA },
              margins: defaultCellMargins,
              children: [new Paragraph({ children: [new TextRun({ text: deck.shortTitle || topic, font: 'Arial', bold: true, size: 20, color: COLORS.navy })] })]
            })
          ]
        })
      ],
      borders: tableBorders,
      width: { size: PAGE_GEOMETRY.printableWidth, type: WidthType.DXA }
    }),
    new Paragraph({ spacing: { after: 200 } })
  );

  // ==========================================
  // 4. AUDIENCE AND SLIDE SETTINGS
  // ==========================================
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 240, after: 120 },
      children: [
        new TextRun({
          text: '4. Audience and Slide Settings',
          font: 'Arial',
          size: 40, // 20 pt Bold Navy
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
              width: { size: 3000, type: WidthType.DXA },
              shading: { fill: COLORS.tealLight, type: ShadingType.CLEAR },
              margins: defaultCellMargins,
              children: [new Paragraph({ children: [new TextRun({ text: 'Target Audience', font: 'Arial', bold: true, size: 20, color: COLORS.navy })] })]
            }),
            new TableCell({
              width: { size: 6360, type: WidthType.DXA },
              margins: defaultCellMargins,
              children: [new Paragraph({ children: [new TextRun({ text: deck.meta?.audience || 'Postgraduate', font: 'Arial', size: 20, color: COLORS.slateDark })] })]
            })
          ]
        }),
        new TableRow({
          children: [
            new TableCell({
              width: { size: 3000, type: WidthType.DXA },
              shading: { fill: COLORS.tealLight, type: ShadingType.CLEAR },
              margins: defaultCellMargins,
              children: [new Paragraph({ children: [new TextRun({ text: 'Slide Count', font: 'Arial', bold: true, size: 20, color: COLORS.navy })] })]
            }),
            new TableCell({
              width: { size: 6360, type: WidthType.DXA },
              margins: defaultCellMargins,
              children: [new Paragraph({ children: [new TextRun({ text: `${deck.slides.length} slides`, font: 'Arial', size: 20, color: COLORS.slateDark })] })]
            })
          ]
        }),
        new TableRow({
          children: [
            new TableCell({
              width: { size: 3000, type: WidthType.DXA },
              shading: { fill: COLORS.tealLight, type: ShadingType.CLEAR },
              margins: defaultCellMargins,
              children: [new Paragraph({ children: [new TextRun({ text: 'Slide Density', font: 'Arial', bold: true, size: 20, color: COLORS.navy })] })]
            }),
            new TableCell({
              width: { size: 6360, type: WidthType.DXA },
              margins: defaultCellMargins,
              children: [new Paragraph({ children: [new TextRun({ text: `${deck.meta?.slideDensity || 'Balanced'} (${deck.specs?.textOccupancyTarget || '30–40% target'})`, font: 'Arial', size: 20, color: COLORS.slateDark })] })]
            })
          ]
        }),
        new TableRow({
          children: [
            new TableCell({
              width: { size: 3000, type: WidthType.DXA },
              shading: { fill: COLORS.tealLight, type: ShadingType.CLEAR },
              margins: defaultCellMargins,
              children: [new Paragraph({ children: [new TextRun({ text: 'Slide Aspect Ratio', font: 'Arial', bold: true, size: 20, color: COLORS.navy })] })]
            }),
            new TableCell({
              width: { size: 6360, type: WidthType.DXA },
              margins: defaultCellMargins,
              children: [new Paragraph({ children: [new TextRun({ text: '16:9 Widescreen (Arial 12–14 pt)', font: 'Arial', size: 20, color: COLORS.slateDark })] })]
            })
          ]
        }),
        new TableRow({
          children: [
            new TableCell({
              width: { size: 3000, type: WidthType.DXA },
              shading: { fill: COLORS.tealLight, type: ShadingType.CLEAR },
              margins: defaultCellMargins,
              children: [new Paragraph({ children: [new TextRun({ text: 'Target Presentation Duration', font: 'Arial', bold: true, size: 20, color: COLORS.navy })] })]
            }),
            new TableCell({
              width: { size: 6360, type: WidthType.DXA },
              margins: defaultCellMargins,
              children: [new Paragraph({ children: [new TextRun({ text: '15-minute presentation (~1.2–1.5 min per slide pacing)', font: 'Arial', size: 20, color: COLORS.slateDark })] })]
            })
          ]
        })
      ],
      borders: tableBorders,
      width: { size: PAGE_GEOMETRY.printableWidth, type: WidthType.DXA }
    }),
    new Paragraph({ spacing: { after: 200 } })
  );

  // ==========================================
  // 5. APPROVED KEYWORDS
  // Formatted as structured executive table
  // ==========================================
  const approvedKw = deck.approvedKeywords || {};
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 240, after: 120 },
      children: [
        new TextRun({
          text: '5. Approved Keywords',
          font: 'Arial',
          size: 40, // 20 pt Bold Navy
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
              width: { size: 3000, type: WidthType.DXA },
              shading: { fill: COLORS.tealLight, type: ShadingType.CLEAR },
              margins: defaultCellMargins,
              children: [new Paragraph({ children: [new TextRun({ text: 'Primary Keywords', font: 'Arial', bold: true, size: 20, color: COLORS.navy })] })]
            }),
            new TableCell({
              width: { size: 6360, type: WidthType.DXA },
              margins: defaultCellMargins,
              children: [new Paragraph({ children: [new TextRun({ text: (approvedKw.primaryKeywords || ['Topic-derived keywords']).join(', '), font: 'Arial', size: 20, color: COLORS.slateDark })] })]
            })
          ]
        }),
        new TableRow({
          children: [
            new TableCell({
              width: { size: 3000, type: WidthType.DXA },
              shading: { fill: COLORS.tealLight, type: ShadingType.CLEAR },
              margins: defaultCellMargins,
              children: [new Paragraph({ children: [new TextRun({ text: 'Synonyms & Related Terms', font: 'Arial', bold: true, size: 20, color: COLORS.navy })] })]
            }),
            new TableCell({
              width: { size: 6360, type: WidthType.DXA },
              margins: defaultCellMargins,
              children: [new Paragraph({ children: [new TextRun({ text: (approvedKw.synonyms || ['Clinical synonyms']).join(', '), font: 'Arial', size: 20, color: COLORS.slateDark })] })]
            })
          ]
        }),
        new TableRow({
          children: [
            new TableCell({
              width: { size: 3000, type: WidthType.DXA },
              shading: { fill: COLORS.tealLight, type: ShadingType.CLEAR },
              margins: defaultCellMargins,
              children: [new Paragraph({ children: [new TextRun({ text: 'MeSH & Biomedical Concepts', font: 'Arial', bold: true, size: 20, color: COLORS.navy })] })]
            }),
            new TableCell({
              width: { size: 6360, type: WidthType.DXA },
              margins: defaultCellMargins,
              children: [new Paragraph({ children: [new TextRun({ text: (approvedKw.meshConcepts || ['MeSH terms']).join(', '), font: 'Arial', size: 20, color: COLORS.slateDark })] })]
            })
          ]
        })
      ],
      borders: tableBorders,
      width: { size: PAGE_GEOMETRY.printableWidth, type: WidthType.DXA }
    }),
    new Paragraph({ spacing: { after: 200 } })
  );

  // ==========================================
  // 6. APPROVED SEARCH STRATEGY
  // ==========================================
  const approvedStrat = deck.approvedStrategy || {};
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 240, after: 120 },
      children: [
        new TextRun({
          text: '6. Approved Search Strategy',
          font: 'Arial',
          size: 40, // 20 pt Bold Navy
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
              width: { size: 3000, type: WidthType.DXA },
              shading: { fill: COLORS.tealLight, type: ShadingType.CLEAR },
              margins: defaultCellMargins,
              children: [new Paragraph({ children: [new TextRun({ text: 'PMC / Europe PMC Query', font: 'Arial', bold: true, size: 20, color: COLORS.navy })] })]
            }),
            new TableCell({
              width: { size: 6360, type: WidthType.DXA },
              margins: defaultCellMargins,
              children: [new Paragraph({ children: [new TextRun({ text: approvedStrat.pmc?.query || `(${topic}) AND (PUB_YEAR:[${deck.meta?.startYear || 2021} TO ${new Date().getFullYear()}])`, font: 'Arial', size: 19, color: COLORS.slateDark })] })]
            })
          ]
        }),
        new TableRow({
          children: [
            new TableCell({
              width: { size: 3000, type: WidthType.DXA },
              shading: { fill: COLORS.tealLight, type: ShadingType.CLEAR },
              margins: defaultCellMargins,
              children: [new Paragraph({ children: [new TextRun({ text: 'Semantic Scholar Query', font: 'Arial', bold: true, size: 20, color: COLORS.navy })] })]
            }),
            new TableCell({
              width: { size: 6360, type: WidthType.DXA },
              margins: defaultCellMargins,
              children: [new Paragraph({ children: [new TextRun({ text: `${approvedStrat.semanticScholar?.query || topic} (Year: ${deck.meta?.startYear || 2021}-${new Date().getFullYear()})`, font: 'Arial', size: 19, color: COLORS.slateDark })] })]
            })
          ]
        }),
        new TableRow({
          children: [
            new TableCell({
              width: { size: 3000, type: WidthType.DXA },
              shading: { fill: COLORS.tealLight, type: ShadingType.CLEAR },
              margins: defaultCellMargins,
              children: [new Paragraph({ children: [new TextRun({ text: 'Literature Fallback Engines', font: 'Arial', bold: true, size: 20, color: COLORS.navy })] })]
            }),
            new TableCell({
              width: { size: 6360, type: WidthType.DXA },
              margins: defaultCellMargins,
              children: [new Paragraph({ children: [new TextRun({ text: 'OpenAlex Academic Graph & Crossref Public Works REST API (Automated Failover)', font: 'Arial', size: 19, color: COLORS.slateDark })] })]
            })
          ]
        })
      ],
      borders: tableBorders,
      width: { size: PAGE_GEOMETRY.printableWidth, type: WidthType.DXA }
    }),
    new Paragraph({ spacing: { after: 200 } })
  );

  // ==========================================
  // 7. SELECTED PAPERS TABLE
  // ==========================================
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 240, after: 120 },
      children: [
        new TextRun({
          text: '7. Selected Papers Table',
          font: 'Arial',
          size: 40, // 20 pt Bold Navy
          bold: true,
          color: COLORS.navy
        })
      ]
    })
  );

  const paperTableRows = [
    new TableRow({
      tableHeader: true,
      cantSplit: true,
      children: [
        new TableCell({ width: { size: 700, type: WidthType.DXA }, shading: { fill: COLORS.navy, type: ShadingType.CLEAR }, margins: defaultCellMargins, children: [new Paragraph({ children: [new TextRun({ text: '#', font: 'Arial', bold: true, size: 20, color: COLORS.white })] })] }),
        new TableCell({ width: { size: 4160, type: WidthType.DXA }, shading: { fill: COLORS.navy, type: ShadingType.CLEAR }, margins: defaultCellMargins, children: [new Paragraph({ children: [new TextRun({ text: 'Title & Identifiers', font: 'Arial', bold: true, size: 20, color: COLORS.white })] })] }),
        new TableCell({ width: { size: 2500, type: WidthType.DXA }, shading: { fill: COLORS.navy, type: ShadingType.CLEAR }, margins: defaultCellMargins, children: [new Paragraph({ children: [new TextRun({ text: 'Authors & Journal', font: 'Arial', bold: true, size: 20, color: COLORS.white })] })] }),
        new TableCell({ width: { size: 1000, type: WidthType.DXA }, shading: { fill: COLORS.navy, type: ShadingType.CLEAR }, margins: defaultCellMargins, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Year', font: 'Arial', bold: true, size: 20, color: COLORS.white })] })] }),
        new TableCell({ width: { size: 1000, type: WidthType.DXA }, shading: { fill: COLORS.navy, type: ShadingType.CLEAR }, margins: defaultCellMargins, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Source', font: 'Arial', bold: true, size: 20, color: COLORS.white })] })] })
      ]
    })
  ];

  papers.forEach((p, idx) => {
    const idInfo = p.pmid ? `PMID:${p.pmid}` : (p.doi ? `DOI:${p.doi}` : `ID:${p.id?.substring(0, 8)}`);
    const isEven = idx % 2 === 1;
    const rowShading = isEven ? COLORS.bgSoft : COLORS.white;

    paperTableRows.push(
      new TableRow({
        cantSplit: true,
        children: [
          new TableCell({
            width: { size: 700, type: WidthType.DXA },
            shading: { fill: rowShading, type: ShadingType.CLEAR },
            margins: defaultCellMargins,
            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: String(idx + 1), font: 'Arial', size: 19, bold: true, color: COLORS.slateDark })] })]
          }),
          new TableCell({
            width: { size: 4160, type: WidthType.DXA },
            shading: { fill: rowShading, type: ShadingType.CLEAR },
            margins: defaultCellMargins,
            children: [
              new Paragraph({ children: [new TextRun({ text: p.title || 'Untitled', font: 'Arial', bold: true, size: 19, color: COLORS.navy })] }),
              new Paragraph({ spacing: { before: 20 }, children: [new TextRun({ text: idInfo, font: 'Arial', size: 16, color: COLORS.slateLight })] })
            ]
          }),
          new TableCell({
            width: { size: 2500, type: WidthType.DXA },
            shading: { fill: rowShading, type: ShadingType.CLEAR },
            margins: defaultCellMargins,
            children: [new Paragraph({ children: [new TextRun({ text: `${p.authors || 'Unknown'} — ${p.journal || 'Journal'}`, font: 'Arial', size: 18, color: COLORS.slateDark })] })]
          }),
          new TableCell({
            width: { size: 1000, type: WidthType.DXA },
            shading: { fill: rowShading, type: ShadingType.CLEAR },
            margins: defaultCellMargins,
            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: String(p.year || 'n.d.'), font: 'Arial', size: 19, color: COLORS.slateDark })] })]
          }),
          new TableCell({
            width: { size: 1000, type: WidthType.DXA },
            shading: { fill: rowShading, type: ShadingType.CLEAR },
            margins: defaultCellMargins,
            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: p.source === 'both' ? 'PMC+S2' : (p.source === 'openalex' ? 'OpenAlex' : (p.source === 'crossref' ? 'Crossref' : (p.source === 's2' ? 'S2' : 'PMC'))), font: 'Arial', size: 18, bold: true, color: COLORS.teal })] })]
          })
        ]
      })
    );
  });

  children.push(
    new Table({
      rows: paperTableRows,
      borders: tableBorders,
      width: { size: PAGE_GEOMETRY.printableWidth, type: WidthType.DXA }
    }),
    new Paragraph({ spacing: { after: 200 } })
  );

  // ==========================================
  // 8. RESEARCH GAPS AND UNRESOLVED QUESTIONS (Prompt 12 exact order)
  // ==========================================
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 240, after: 120 },
      children: [
        new TextRun({
          text: '8. Research Gaps and Unresolved Questions',
          font: 'Arial',
          size: 40, // 20 pt Bold Navy
          bold: true,
          color: COLORS.navy
        })
      ]
    }),
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 140, after: 80 },
      children: [
        new TextRun({
          text: '8.1 Concise Evidence-Based Synthesis Plan',
          font: 'Arial',
          size: 28, // 14 pt Bold Teal
          bold: true,
          color: COLORS.teal
        })
      ]
    })
  );

  const plan = deck.evidenceSynthesisPlan || {
    scope: `Narrative evidence synthesis summarizing ${papers.length} curated studies on "${topic}" to underpin a ${deck.meta?.audience || 'Postgraduate'}-calibrated 16:9 scientific presentation.`,
    methodologyNote: 'Narrative evidence synthesis differentiating established clinical findings from uncertain or unresolved areas through calibrated academic wording, deliberately excluding formal GRADE ratings, Oxford evidence hierarchies, or risk-of-bias scores.'
  };

  children.push(
    new Paragraph({
      spacing: { after: 40 },
      children: [
        new TextRun({ text: 'Synthesis Scope: ', font: 'Arial', size: 20, bold: true, color: COLORS.navy }),
        new TextRun({ text: plan.scope, font: 'Arial', size: 20, color: COLORS.slateDark })
      ]
    }),
    new Paragraph({
      spacing: { after: 120 },
      children: [
        new TextRun({ text: 'Methodology: ', font: 'Arial', size: 20, bold: true, color: COLORS.teal }),
        new TextRun({ text: plan.methodologyNote, font: 'Arial', size: 20, italic: true, color: COLORS.slateMed })
      ]
    })
  );

  // Thematic Synthesis Table
  if (Array.isArray(plan.themes) && plan.themes.length > 0) {
    const themeRows = [
      new TableRow({
        tableHeader: true,
        cantSplit: true,
        children: [
          new TableCell({ width: { size: 2360, type: WidthType.DXA }, shading: { fill: COLORS.navy, type: ShadingType.CLEAR }, margins: defaultCellMargins, children: [new Paragraph({ children: [new TextRun({ text: 'Synthesis Theme / Domain', font: 'Arial', bold: true, size: 20, color: COLORS.white })] })] }),
          new TableCell({ width: { size: 3500, type: WidthType.DXA }, shading: { fill: COLORS.teal, type: ShadingType.CLEAR }, margins: defaultCellMargins, children: [new Paragraph({ children: [new TextRun({ text: 'Established Findings (Robust Evidence)', font: 'Arial', bold: true, size: 20, color: COLORS.white })] })] }),
          new TableCell({ width: { size: 3500, type: WidthType.DXA }, shading: { fill: COLORS.slateDark, type: ShadingType.CLEAR }, margins: defaultCellMargins, children: [new Paragraph({ children: [new TextRun({ text: 'Uncertain or Unresolved Areas', font: 'Arial', bold: true, size: 20, color: COLORS.white })] })] })
        ]
      })
    ];

    plan.themes.forEach((t, tIdx) => {
      const isEven = tIdx % 2 === 1;
      const themeShading = isEven ? COLORS.bgSoft : COLORS.white;

      themeRows.push(
        new TableRow({
          cantSplit: true,
          children: [
            new TableCell({
              width: { size: 2360, type: WidthType.DXA },
              shading: { fill: COLORS.tealLight, type: ShadingType.CLEAR },
              margins: defaultCellMargins,
              children: [
                new Paragraph({ children: [new TextRun({ text: t.title, font: 'Arial', bold: true, size: 19, color: COLORS.navy })] }),
                new Paragraph({ spacing: { before: 20 }, children: [new TextRun({ text: t.scope || '', font: 'Arial', size: 16, color: COLORS.slateLight })] })
              ]
            }),
            new TableCell({
              width: { size: 3500, type: WidthType.DXA },
              shading: { fill: themeShading, type: ShadingType.CLEAR },
              margins: defaultCellMargins,
              children: [
                new Paragraph({ children: [new TextRun({ text: '✓ Established: ', font: 'Arial', bold: true, size: 18, color: COLORS.teal }), new TextRun({ text: t.establishedFindings, font: 'Arial', size: 18, color: COLORS.slateDark })] })
              ]
            }),
            new TableCell({
              width: { size: 3500, type: WidthType.DXA },
              shading: { fill: themeShading, type: ShadingType.CLEAR },
              margins: defaultCellMargins,
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
        width: { size: PAGE_GEOMETRY.printableWidth, type: WidthType.DXA }
      }),
      new Paragraph({ spacing: { after: 150 } })
    );
  }

  // 8.2 Research Gaps & Unresolved Clinical Questions
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 160, after: 80 },
      children: [
        new TextRun({
          text: '8.2 Research Gaps & Unresolved Clinical Questions',
          font: 'Arial',
          size: 28, // 14 pt Bold Teal
          bold: true,
          color: COLORS.teal
        })
      ]
    }),
    new Paragraph({
      spacing: { after: 100 },
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
          spacing: { before: 120, after: 40 },
          children: [
            new TextRun({
              text: `${idx + 1}. ${gap.domain}`,
              font: 'Arial',
              size: 22, // 11 pt Bold
              bold: true,
              color: COLORS.navy
            })
          ]
        }),
        new Paragraph({
          bullet: { level: 0 },
          spacing: { before: 20, after: 30, line: 260 },
          children: [
            new TextRun({ text: 'Established Baseline: ', font: 'Arial', bold: true, size: 19, color: COLORS.teal }),
            ...parseFormattedRuns(gap.establishedBaseline, { size: 19, color: COLORS.slateDark })
          ]
        }),
        new Paragraph({
          bullet: { level: 0 },
          spacing: { before: 20, after: 80, line: 260 },
          children: [
            new TextRun({ text: 'Unresolved Question: ', font: 'Arial', bold: true, size: 19, color: COLORS.amberDark }),
            ...parseFormattedRuns(gap.unresolvedQuestion, { size: 19, color: COLORS.slateDark })
          ]
        })
      );
    } else {
      const gapStr = String(gap).replace(/^[•\s*-]+/, '').trim();
      let runs = [];
      const colonMatch = gapStr.match(/^([A-Za-z0-9\s/&–-]{2,40}):(\s+)(.*)$/);
      if (colonMatch) {
        runs = [
          new TextRun({ text: colonMatch[1] + ': ', font: 'Arial', bold: true, size: 20, color: COLORS.navy }),
          ...parseFormattedRuns(colonMatch[3], { size: 20, color: COLORS.slateDark })
        ];
      } else {
        runs = parseFormattedRuns(gapStr, { size: 20, color: COLORS.slateDark });
      }

      children.push(
        new Paragraph({
          bullet: { level: 0 },
          spacing: { before: 30, after: 60, line: 260 },
          children: runs
        })
      );
    }
  });

  children.push(new Paragraph({ spacing: { after: 200 } }));

  // ==========================================
  // 9. PRESENTATION OUTLINE
  // Formatted as structured executive presentation agenda table
  // ==========================================
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 240, after: 120 },
      children: [
        new TextRun({
          text: '9. Presentation Outline',
          font: 'Arial',
          size: 40, // 20 pt Bold Navy
          bold: true,
          color: COLORS.navy
        })
      ]
    })
  );

  const outlineRows = [
    new TableRow({
      tableHeader: true,
      cantSplit: true,
      children: [
        new TableCell({ width: { size: 900, type: WidthType.DXA }, shading: { fill: COLORS.navy, type: ShadingType.CLEAR }, margins: defaultCellMargins, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Slide #', font: 'Arial', bold: true, size: 20, color: COLORS.white })] })] }),
        new TableCell({ width: { size: 5960, type: WidthType.DXA }, shading: { fill: COLORS.navy, type: ShadingType.CLEAR }, margins: defaultCellMargins, children: [new Paragraph({ children: [new TextRun({ text: 'Slide Presentation Title', font: 'Arial', bold: true, size: 20, color: COLORS.white })] })] }),
        new TableCell({ width: { size: 2500, type: WidthType.DXA }, shading: { fill: COLORS.navy, type: ShadingType.CLEAR }, margins: defaultCellMargins, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Estimated Pacing', font: 'Arial', bold: true, size: 20, color: COLORS.white })] })] })
      ]
    })
  ];

  (deck.outline || []).forEach((out, idx) => {
    const isEven = idx % 2 === 1;
    const rowShading = isEven ? COLORS.bgSoft : COLORS.white;
    // Strip leading number if present
    const cleanTitle = out.replace(/^\d+[\.\:\s]+/, '').trim();

    outlineRows.push(
      new TableRow({
        cantSplit: true,
        children: [
          new TableCell({
            width: { size: 900, type: WidthType.DXA },
            shading: { fill: rowShading, type: ShadingType.CLEAR },
            margins: defaultCellMargins,
            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: String(idx + 1), font: 'Arial', bold: true, size: 19, color: COLORS.navy })] })]
          }),
          new TableCell({
            width: { size: 5960, type: WidthType.DXA },
            shading: { fill: rowShading, type: ShadingType.CLEAR },
            margins: defaultCellMargins,
            children: [new Paragraph({ children: [new TextRun({ text: cleanTitle, font: 'Arial', size: 19, bold: true, color: COLORS.slateDark })] })]
          }),
          new TableCell({
            width: { size: 2500, type: WidthType.DXA },
            shading: { fill: rowShading, type: ShadingType.CLEAR },
            margins: defaultCellMargins,
            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: '~1.2–1.5 min', font: 'Arial', size: 18, color: COLORS.slateMed })] })]
          })
        ]
      })
    );
  });

  children.push(
    new Table({
      rows: outlineRows,
      borders: tableBorders,
      width: { size: PAGE_GEOMETRY.printableWidth, type: WidthType.DXA }
    }),
    new Paragraph({ spacing: { after: 200 } }),
    // Page break before slide decks
    new Paragraph({ children: [new PageBreak()] })
  );

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
      spacing: { before: 120, after: 180 },
      children: [
        new TextRun({
          text: '10. Full Slide-by-Slide Content',
          font: 'Arial',
          size: 40, // 20 pt Bold Navy
          bold: true,
          color: COLORS.navy
        })
      ]
    })
  );

  deck.slides.forEach((slide, sIdx) => {
    const slideNumber = slide.slide_number ?? slide.slideNumber ?? (sIdx + 1);
    const slideTitle = slide.title || `Slide ${slideNumber}`;
    const objective = slide.objective || '';
    const mainMessage = slide.main_message ?? slide.mainMessage ?? '';
    const onSlideContent = slide.on_slide_text ?? slide.onSlideText ?? '';
    const visualType = slide.suggested_visual_type ?? slide.suggestedVisualType ?? 'Diagram';
    const visualDesc = slide.detailed_visual_description ?? slide.detailedVisualDescription ?? 'Visual illustration supporting key findings.';
    const speakerNotesText = slide.speaker_notes ?? slide.speakerNotes ?? '';
    const audienceQuestionText = slide.interactive_question ?? slide.interactiveQuestion ?? '';
    const transitionText = slide.logical_transition ?? slide.logicalTransition ?? slide.transition ?? '';
    const density = slide.slide_density || slide.slideDensity || 'Balanced';
    const target = slide.text_occupancy_target || slide.textOccupancyTarget || '30–40% target';

    const LABEL_COL_WIDTH = 2500;
    const CONTENT_COL_WIDTH = 6860; // 9360 - 2500

    const slideTableRows = [
      // 1. Header Banner: Slide Number & Slide Title (Colspan 2)
      new TableRow({
        tableHeader: true,
        cantSplit: true,
        children: [
          new TableCell({
            columnSpan: 2,
            width: { size: PAGE_GEOMETRY.printableWidth, type: WidthType.DXA },
            shading: { fill: COLORS.navy, type: ShadingType.CLEAR },
            margins: { top: 140, bottom: 140, left: 180, right: 180 },
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: `SLIDE ${slideNumber}: `,
                    font: 'Arial',
                    size: 26, // 13 pt Bold Ice Blue
                    bold: true,
                    color: COLORS.iceBlue
                  }),
                  new TextRun({
                    text: slideTitle,
                    font: 'Arial',
                    size: 28, // 14 pt Bold White
                    bold: true,
                    color: COLORS.white
                  })
                ]
              }),
              new Paragraph({
                spacing: { before: 40 },
                children: [
                  new TextRun({
                    text: `Format: 16:9 Widescreen  |  Font: Arial (12–14 pt)  |  Density: ${density} (${target})`,
                    font: 'Arial',
                    size: 18, // 9 pt
                    italic: true,
                    color: 'CBD5E1'
                  })
                ]
              })
            ]
          })
        ]
      }),

      // 2. Field 3: Slide Objective
      new TableRow({
        cantSplit: true,
        children: [
          new TableCell({
            width: { size: LABEL_COL_WIDTH, type: WidthType.DXA },
            shading: { fill: COLORS.tealLight, type: ShadingType.CLEAR },
            margins: defaultCellMargins,
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: 'Slide Objective', font: 'Arial', bold: true, size: 20, color: COLORS.teal })
                ]
              })
            ]
          }),
          new TableCell({
            width: { size: CONTENT_COL_WIDTH, type: WidthType.DXA },
            margins: defaultCellMargins,
            children: [
              new Paragraph({
                spacing: { before: 20, after: 20, line: 260 },
                children: parseFormattedRuns(objective, { size: 20, color: COLORS.slateDark })
              })
            ]
          })
        ]
      }),

      // 3. Field 4: Main Message
      new TableRow({
        cantSplit: true,
        children: [
          new TableCell({
            width: { size: LABEL_COL_WIDTH, type: WidthType.DXA },
            shading: { fill: COLORS.tealLight, type: ShadingType.CLEAR },
            margins: defaultCellMargins,
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: 'Main Message', font: 'Arial', bold: true, size: 20, color: COLORS.navy })
                ]
              })
            ]
          }),
          new TableCell({
            width: { size: CONTENT_COL_WIDTH, type: WidthType.DXA },
            margins: defaultCellMargins,
            children: [
              new Paragraph({
                spacing: { before: 20, after: 20, line: 260 },
                children: parseFormattedRuns(mainMessage, { bold: true, italic: true, size: 20, color: COLORS.navy })
              })
            ]
          })
        ]
      }),

      // 4. Field 5: On-Slide Text (Visible Slide Content)
      new TableRow({
        cantSplit: true,
        children: [
          new TableCell({
            width: { size: LABEL_COL_WIDTH, type: WidthType.DXA },
            shading: { fill: COLORS.tealLight, type: ShadingType.CLEAR },
            margins: defaultCellMargins,
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: 'On-Slide Text', font: 'Arial', bold: true, size: 20, color: COLORS.navy })
                ]
              }),
              new Paragraph({
                spacing: { before: 20 },
                children: [
                  new TextRun({ text: '(Visible Content)', font: 'Arial', size: 16, italic: true, color: COLORS.slateLight })
                ]
              })
            ]
          }),
          new TableCell({
            width: { size: CONTENT_COL_WIDTH, type: WidthType.DXA },
            margins: defaultCellMargins,
            children: formatBulletParagraphs(onSlideContent)
          })
        ]
      }),

      // 5. Fields 6 & 7: Suggested Visual Type & Detailed Visual Description
      new TableRow({
        cantSplit: true,
        children: [
          new TableCell({
            width: { size: LABEL_COL_WIDTH, type: WidthType.DXA },
            shading: { fill: COLORS.tealLight, type: ShadingType.CLEAR },
            margins: defaultCellMargins,
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: 'Suggested Visual', font: 'Arial', bold: true, size: 20, color: COLORS.teal })
                ]
              }),
              new Paragraph({
                spacing: { before: 20 },
                children: [
                  new TextRun({ text: `[${visualType}]`, font: 'Arial', bold: true, size: 18, color: COLORS.secondary })
                ]
              })
            ]
          }),
          new TableCell({
            width: { size: CONTENT_COL_WIDTH, type: WidthType.DXA },
            margins: defaultCellMargins,
            children: formatVisualParagraphs(visualDesc)
          })
        ]
      }),

      // 6. Field 8: Speaker Notes (Narration Script)
      new TableRow({
        cantSplit: true,
        children: [
          new TableCell({
            width: { size: LABEL_COL_WIDTH, type: WidthType.DXA },
            shading: { fill: COLORS.noteBg, type: ShadingType.CLEAR },
            margins: defaultCellMargins,
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: 'Speaker Notes', font: 'Arial', bold: true, size: 20, color: COLORS.accentBlue })
                ]
              }),
              new Paragraph({
                spacing: { before: 20 },
                children: [
                  new TextRun({ text: '(Spoken Script)', font: 'Arial', size: 16, italic: true, color: COLORS.slateLight })
                ]
              })
            ]
          }),
          new TableCell({
            width: { size: CONTENT_COL_WIDTH, type: WidthType.DXA },
            shading: { fill: COLORS.noteBg, type: ShadingType.CLEAR },
            margins: defaultCellMargins,
            children: formatSpeakerNotesParagraphs(speakerNotesText)
          })
        ]
      }),

      // 7. Field 9: Interactive Audience Question
      new TableRow({
        cantSplit: true,
        children: [
          new TableCell({
            width: { size: LABEL_COL_WIDTH, type: WidthType.DXA },
            shading: { fill: COLORS.amberBg, type: ShadingType.CLEAR },
            margins: defaultCellMargins,
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: 'Audience Question', font: 'Arial', bold: true, size: 20, color: COLORS.amberDark })
                ]
              }),
              new Paragraph({
                spacing: { before: 20 },
                children: [
                  new TextRun({ text: '(Interactive)', font: 'Arial', size: 16, italic: true, color: COLORS.amberDark })
                ]
              })
            ]
          }),
          new TableCell({
            width: { size: CONTENT_COL_WIDTH, type: WidthType.DXA },
            shading: { fill: COLORS.amberLight, type: ShadingType.CLEAR },
            margins: defaultCellMargins,
            children: [
              new Paragraph({
                spacing: { before: 20, after: 20, line: 260 },
                children: [
                  new TextRun({ text: 'Interactive Question for Audience: ', font: 'Arial', bold: true, size: 19, color: COLORS.amberDark }),
                  new TextRun({ text: audienceQuestionText, font: 'Arial', italic: true, size: 19, color: COLORS.amberDark })
                ]
              })
            ]
          })
        ]
      }),

      // 8. Field 10: Logical Transition
      new TableRow({
        cantSplit: true,
        children: [
          new TableCell({
            width: { size: LABEL_COL_WIDTH, type: WidthType.DXA },
            shading: { fill: COLORS.bgSoft, type: ShadingType.CLEAR },
            margins: defaultCellMargins,
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: 'Logical Transition', font: 'Arial', bold: true, size: 20, color: COLORS.slateMed })
                ]
              })
            ]
          }),
          new TableCell({
            width: { size: CONTENT_COL_WIDTH, type: WidthType.DXA },
            shading: { fill: COLORS.bgSoft, type: ShadingType.CLEAR },
            margins: defaultCellMargins,
            children: [
              new Paragraph({
                spacing: { before: 20, after: 20, line: 260 },
                children: [
                  new TextRun({ text: 'Logical Transition: ', font: 'Arial', bold: true, size: 19, color: COLORS.slateMed }),
                  new TextRun({ text: transitionText, font: 'Arial', italic: true, size: 19, color: COLORS.slateDark })
                ]
              })
            ]
          })
        ]
      }),

      // 9. Card Footer Row: Aspect Ratio + Mandatory Copyright (Colspan 2)
      new TableRow({
        cantSplit: true,
        children: [
          new TableCell({
            columnSpan: 2,
            width: { size: PAGE_GEOMETRY.printableWidth, type: WidthType.DXA },
            shading: { fill: COLORS.white, type: ShadingType.CLEAR },
            margins: { top: 80, bottom: 80, left: 160, right: 160 },
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({
                    text: '16:9 Aspect Ratio  |  Arial 12–14 pt  |  ',
                    font: 'Arial',
                    size: 17,
                    color: COLORS.slateLight
                  }),
                  new TextRun({
                    text: 'copyrights@Raouf Roshdy2025',
                    font: 'Arial',
                    bold: true,
                    size: 18, // 9 pt
                    color: COLORS.slateDark
                  })
                ]
              })
            ]
          })
        ]
      })
    ];

    children.push(
      new Table({
        rows: slideTableRows,
        borders: slideBoxBorders,
        width: { size: PAGE_GEOMETRY.printableWidth, type: WidthType.DXA }
      }),
      new Paragraph({ spacing: { after: 280 } })
    );
  });

  // Page break before references
  children.push(new Paragraph({ children: [new PageBreak()] }));

  // ==========================================
  // 11. REFERENCES (Separated into this final section)
  // Strict Vancouver citation style (ICMJE/NLM)
  // ==========================================
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 240, after: 140 },
      children: [
        new TextRun({
          text: '11. References',
          font: 'Arial',
          size: 40, // 20 pt Bold Navy
          bold: true,
          color: COLORS.navy
        })
      ]
    }),
    new Paragraph({
      spacing: { after: 160 },
      children: [
        new TextRun({
          text: `The following ${papers.length} peer-reviewed studies were retrieved from PubMed Central (Europe PMC), Semantic Scholar, OpenAlex, and Crossref, deduplicated, and approved for this presentation deck:`,
          font: 'Arial',
          size: 20,
          color: COLORS.slateMed
        })
      ]
    })
  );

  (deck.references || []).forEach(ref => {
    children.push(
      new Paragraph({
        indent: { left: 480, hanging: 480 },
        spacing: { before: 60, after: 60, line: 250 },
        children: [
          new TextRun({
            text: `[${ref.referenceNumber}] `,
            font: 'Arial',
            size: 20, // 10 pt
            bold: true,
            color: COLORS.navy
          }),
          new TextRun({
            text: `${ref.authors}. `,
            font: 'Arial',
            size: 20,
            bold: true,
            color: COLORS.slateDark
          }),
          new TextRun({
            text: `${ref.title}. `,
            font: 'Arial',
            size: 20,
            color: COLORS.slateDark
          }),
          new TextRun({
            text: `${ref.journal}. `,
            font: 'Arial',
            size: 20,
            italic: true,
            color: COLORS.teal
          }),
          new TextRun({
            text: `${ref.year}.${ref.pmid ? ` PMID: ${ref.pmid}.` : ''}${ref.doi ? ` DOI: https://doi.org/${ref.doi}.` : ''}`,
            font: 'Arial',
            size: 19,
            color: COLORS.slateMed
          })
        ]
      })
    );
  });

  // Running Header Table (2 columns: 5000 dxa + 4360 dxa = 9360 dxa) with crisp bottom divider rule
  const runningHeaderTable = new Table({
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 5000, type: WidthType.DXA },
            margins: { top: 0, bottom: 80, left: 0, right: 0 },
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: 'Preppt – Scientific Literature to Presentation',
                    font: 'Arial',
                    bold: true,
                    size: 17, // 8.5 pt
                    color: COLORS.navy
                  })
                ]
              })
            ]
          }),
          new TableCell({
            width: { size: 4360, type: WidthType.DXA },
            margins: { top: 0, bottom: 80, left: 0, right: 0 },
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({
                    text: deck.shortTitle || topic,
                    font: 'Arial',
                    italic: true,
                    size: 17, // 8.5 pt
                    color: COLORS.teal
                  })
                ]
              })
            ]
          })
        ]
      })
    ],
    borders: {
      top: { style: BorderStyle.NONE },
      bottom: { style: BorderStyle.SINGLE, size: 6, color: COLORS.borderSoft },
      left: { style: BorderStyle.NONE },
      right: { style: BorderStyle.NONE },
      insideHorizontal: { style: BorderStyle.NONE },
      insideVertical: { style: BorderStyle.NONE }
    },
    width: { size: PAGE_GEOMETRY.printableWidth, type: WidthType.DXA }
  });

  // Running Footer Table (2 columns: 5000 dxa + 4360 dxa = 9360 dxa) with crisp top divider rule
  const runningFooterTable = new Table({
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 5000, type: WidthType.DXA },
            margins: { top: 100, bottom: 40, left: 0, right: 0 },
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: 'Educational & Presentation Specification Document',
                    font: 'Arial',
                    size: 16, // 8 pt
                    italic: true,
                    color: COLORS.slateLight
                  })
                ]
              })
            ]
          }),
          new TableCell({
            width: { size: 4360, type: WidthType.DXA },
            margins: { top: 100, bottom: 40, left: 0, right: 0 },
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({
                    text: 'copyrights@Raouf Roshdy2025',
                    font: 'Arial',
                    bold: true,
                    size: 17, // 8.5 pt
                    color: COLORS.slateDark
                  }),
                  new TextRun({
                    text: '  |  Page ',
                    font: 'Arial',
                    size: 17,
                    color: COLORS.slateLight
                  }),
                  new TextRun({
                    children: [PageNumber.CURRENT],
                    font: 'Arial',
                    size: 17,
                    color: COLORS.slateLight
                  }),
                  new TextRun({
                    text: ' of ',
                    font: 'Arial',
                    size: 17,
                    color: COLORS.slateLight
                  }),
                  new TextRun({
                    children: [PageNumber.TOTAL_PAGES],
                    font: 'Arial',
                    size: 17,
                    color: COLORS.slateLight
                  })
                ]
              })
            ]
          })
        ]
      })
    ],
    borders: {
      top: { style: BorderStyle.SINGLE, size: 6, color: COLORS.borderSoft },
      bottom: { style: BorderStyle.NONE },
      left: { style: BorderStyle.NONE },
      right: { style: BorderStyle.NONE },
      insideHorizontal: { style: BorderStyle.NONE },
      insideVertical: { style: BorderStyle.NONE }
    },
    width: { size: PAGE_GEOMETRY.printableWidth, type: WidthType.DXA }
  });

  // Assemble Complete Document with 1-inch margins and executive running headers/footers
  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: {
              width: PAGE_GEOMETRY.width,
              height: PAGE_GEOMETRY.height
            },
            margin: PAGE_GEOMETRY.margins
          },
          titlePage: true // Distinguishes cover page from body pages
        },
        headers: {
          default: new Header({
            children: [
              runningHeaderTable,
              new Paragraph({ spacing: { after: 120 } })
            ]
          }),
          first: new Header({
            children: [] // Clean cover page header
          })
        },
        footers: {
          default: new Footer({
            children: [
              runningFooterTable
            ]
          }),
          first: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { before: 80 },
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
        },
        children: children
      }
    ]
  });

  return await docx.Packer.toBuffer(doc);
}

module.exports = { generatePresentationDocx };
