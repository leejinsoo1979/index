import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import {
  CALLOUT_VARIANT_LABELS,
  CHART_TYPE_LABELS,
  beforeAfterData,
  blogSectionData,
  calloutData,
  chartData,
  checklistItems,
  codeData,
  collectSources,
  constructionDetailData,
  constructionStandardData,
  constructionStandardHeading,
  costTableData,
  diagramData,
  docMetaEntries,
  formulaData,
  imageGalleryData,
  lawReferenceData,
  lawReferenceHeading,
  materialSpecData,
  ontologySummaryData,
  qnaItems,
  quoteData,
  richTextData,
  riskWarningData,
  safeFilename,
  scheduleData,
  seoMetaData,
  seoMetaEntries,
  tableData,
  technicalSectionData,
  type DocumentForExport,
  type Exporter,
  type ExportResult,
} from './types';

/** DOCX exporter (제안서: 수정 가능한 보고서 산출물) */
export class DocxExporter implements Exporter {
  readonly format = 'docx' as const;

  async export(document: DocumentForExport): Promise<ExportResult> {
    const { sources } = collectSources(document.blocks);
    const children: (Paragraph | Table)[] = [
      new Paragraph({
        heading: HeadingLevel.TITLE,
        children: [new TextRun({ text: document.title })],
      }),
    ];

    for (const block of document.blocks) {
      const c = block.content as Record<string, string | number | undefined>;
      switch (block.type) {
        case 'heading': {
          const level =
            c.level === 1
              ? HeadingLevel.HEADING_1
              : c.level === 2
                ? HeadingLevel.HEADING_2
                : HeadingLevel.HEADING_3;
          children.push(
            new Paragraph({ heading: level, children: [new TextRun(String(c.text ?? ''))] }),
          );
          break;
        }
        case 'paragraph':
          children.push(
            new Paragraph({
              spacing: { after: 160 },
              children: [new TextRun(String(c.text ?? ''))],
            }),
          );
          break;
        case 'image':
          children.push(
            new Paragraph({
              spacing: { after: 120 },
              children: [
                new TextRun({
                  text: `[이미지${c.caption ? `: ${c.caption}` : ''}]`,
                  italics: true,
                  color: '71717a',
                }),
              ],
            }),
          );
          break;
        case 'checklist': {
          if (c.title) {
            children.push(
              new Paragraph({ children: [new TextRun({ text: String(c.title), bold: true })] }),
            );
          }
          for (const item of checklistItems(block.content)) {
            children.push(
              new Paragraph({
                children: [new TextRun(`${item.checked ? '☑' : '☐'} ${item.text}`)],
              }),
            );
          }
          children.push(new Paragraph({ children: [] }));
          break;
        }
        case 'table': {
          const table = tableData(block.content);
          if (!table) break;
          if (table.title) {
            children.push(
              new Paragraph({ children: [new TextRun({ text: table.title, bold: true })] }),
            );
          }
          children.push(buildDocxTable(table.headers, table.rows));
          children.push(new Paragraph({ children: [] }));
          break;
        }
        case 'chart': {
          const chart = chartData(block.content);
          if (!chart) break;
          children.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: `${chart.title ?? '차트'} (${CHART_TYPE_LABELS[chart.chartType] ?? chart.chartType} 차트)`,
                  bold: true,
                }),
              ],
            }),
          );
          const headers = ['항목', ...chart.series.map((s, i) => s.name || `시리즈 ${i + 1}`)];
          const rows = chart.labels.map((label, i) => [
            label,
            ...chart.series.map((s) => String(s.values[i] ?? 0)),
          ]);
          children.push(buildDocxTable(headers, rows));
          children.push(new Paragraph({ children: [] }));
          break;
        }
        case 'formula': {
          const formula = formulaData(block.content);
          if (!formula) break;
          if (formula.title) {
            children.push(
              new Paragraph({ children: [new TextRun({ text: formula.title, bold: true })] }),
            );
          }
          children.push(
            new Paragraph({
              children: [new TextRun({ text: formula.expression, font: 'Courier New' })],
            }),
          );
          for (const v of formula.variables) {
            children.push(
              new Paragraph({
                children: [
                  new TextRun(`· ${v.symbol}: ${v.meaning}${v.unit ? ` (${v.unit})` : ''}`),
                ],
              }),
            );
          }
          if (formula.result) {
            children.push(new Paragraph({ children: [new TextRun(`= ${formula.result}`)] }));
          }
          children.push(new Paragraph({ children: [] }));
          break;
        }
        case 'doc_meta': {
          const entries = docMetaEntries(block.content);
          if (entries.length === 0) break;
          children.push(
            new Paragraph({
              spacing: { after: 160 },
              children: [
                new TextRun({
                  text: entries.map(([k, v]) => `${k}: ${v}`).join('  /  '),
                  color: '52525b',
                  size: 18,
                }),
              ],
            }),
          );
          break;
        }
        case 'qna': {
          const items = qnaItems(block.content);
          if (typeof c.title === 'string' && c.title) {
            children.push(
              new Paragraph({ children: [new TextRun({ text: String(c.title), bold: true })] }),
            );
          }
          for (const item of items) {
            children.push(
              new Paragraph({ children: [new TextRun({ text: `Q. ${item.question}`, bold: true })] }),
            );
            children.push(new Paragraph({ children: [new TextRun(`A. ${item.answer}`)] }));
            if (item.basis) {
              children.push(
                new Paragraph({
                  children: [new TextRun({ text: `근거: ${item.basis}`, color: '71717a' })],
                }),
              );
            }
          }
          children.push(new Paragraph({ children: [] }));
          break;
        }
        case 'cta':
          children.push(
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { before: 160, after: 160 },
              children: [
                new TextRun({
                  text: `▶ ${c.text ?? ''}${c.url ? ` (${c.url})` : ''}`,
                  bold: true,
                }),
              ],
            }),
          );
          break;
        case 'source_reference':
          break;
        case 'law_reference': {
          const law = lawReferenceData(block.content);
          if (!law) break;
          children.push(
            new Paragraph({
              children: [
                new TextRun({ text: '법규 ', bold: true }),
                new TextRun({ text: lawReferenceHeading(law), bold: true }),
              ],
            }),
          );
          if (law.summary) {
            children.push(new Paragraph({ children: [new TextRun(law.summary)] }));
          }
          if (law.link) {
            children.push(
              new Paragraph({
                children: [new TextRun({ text: `원문: ${law.link}`, color: '52525b' })],
              }),
            );
          }
          children.push(new Paragraph({ children: [] }));
          break;
        }
        case 'callout': {
          const callout = calloutData(block.content);
          const variantLabel = CALLOUT_VARIANT_LABELS[callout.variant] ?? callout.variant;
          children.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: `[${variantLabel}]${callout.title ? ` ${callout.title}` : ''}`,
                  bold: true,
                }),
              ],
            }),
          );
          children.push(
            new Paragraph({
              spacing: { after: 160 },
              children: [new TextRun(callout.text)],
            }),
          );
          break;
        }
        case 'quote': {
          const quote = quoteData(block.content);
          children.push(
            new Paragraph({
              children: [new TextRun({ text: `“${quote.text}”`, italics: true })],
            }),
          );
          if (quote.attribution) {
            children.push(
              new Paragraph({
                spacing: { after: 160 },
                children: [new TextRun({ text: `— ${quote.attribution}`, color: '71717a' })],
              }),
            );
          }
          break;
        }
        case 'code': {
          const code = codeData(block.content);
          if (code.language) {
            children.push(
              new Paragraph({
                children: [new TextRun({ text: `code (${code.language})`, color: '71717a' })],
              }),
            );
          }
          for (const line of code.code.split('\n')) {
            children.push(
              new Paragraph({
                children: [new TextRun({ text: line, font: 'Courier New' })],
              }),
            );
          }
          children.push(new Paragraph({ children: [] }));
          break;
        }
        case 'cost_table': {
          const cost = costTableData(block.content);
          if (cost.title) {
            children.push(
              new Paragraph({ children: [new TextRun({ text: cost.title, bold: true })] }),
            );
          }
          children.push(buildDocxTable(cost.headers, cost.rows));
          if (cost.note) {
            children.push(
              new Paragraph({
                children: [new TextRun({ text: cost.note, color: '71717a' })],
              }),
            );
          }
          children.push(new Paragraph({ children: [] }));
          break;
        }
        case 'construction_detail': {
          const detail = constructionDetailData(block.content);
          if (detail.title) {
            children.push(
              new Paragraph({ children: [new TextRun({ text: detail.title, bold: true })] }),
            );
          }
          if (detail.imageUrl || detail.imagePrompt) {
            children.push(
              new Paragraph({
                children: [
                  new TextRun({
                    text: `[상세도${detail.imagePrompt ? `: ${detail.imagePrompt}` : ''}]`,
                    italics: true,
                    color: '71717a',
                  }),
                ],
              }),
            );
          }
          detail.steps.forEach((step, i) => {
            children.push(
              new Paragraph({ children: [new TextRun(`${i + 1}. ${step}`)] }),
            );
          });
          if (detail.notes) {
            children.push(
              new Paragraph({
                children: [new TextRun({ text: `주의: ${detail.notes}`, color: '71717a' })],
              }),
            );
          }
          children.push(new Paragraph({ children: [] }));
          break;
        }
        case 'container': {
          if (c.title) {
            children.push(
              new Paragraph({
                heading: HeadingLevel.HEADING_2,
                children: [new TextRun(String(c.title))],
              }),
            );
          }
          break;
        }
        case 'rich_text': {
          const rich = richTextData(block.content);
          children.push(
            new Paragraph({
              spacing: { after: 160 },
              children: [new TextRun(rich.text)],
            }),
          );
          break;
        }
        case 'image_gallery': {
          const gallery = imageGalleryData(block.content);
          children.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: `[갤러리${gallery.title ? `: ${gallery.title}` : ''}]`,
                  bold: true,
                }),
              ],
            }),
          );
          for (const img of gallery.images) {
            const caption = img.caption || img.prompt;
            children.push(
              new Paragraph({
                children: [
                  new TextRun({
                    text: `[이미지${caption ? `: ${caption}` : ''}]`,
                    italics: true,
                    color: '71717a',
                  }),
                ],
              }),
            );
          }
          children.push(new Paragraph({ children: [] }));
          break;
        }
        case 'before_after': {
          const ba = beforeAfterData(block.content);
          if (ba.title) {
            children.push(
              new Paragraph({ children: [new TextRun({ text: ba.title, bold: true })] }),
            );
          }
          for (const side of [ba.before, ba.after]) {
            children.push(
              new Paragraph({
                children: [
                  new TextRun({
                    text: `[${side.label}${side.prompt ? `: ${side.prompt}` : ''}]`,
                    italics: true,
                    color: '71717a',
                  }),
                ],
              }),
            );
          }
          children.push(new Paragraph({ children: [] }));
          break;
        }
        case 'diagram': {
          const diagram = diagramData(block.content);
          if (diagram.title) {
            children.push(
              new Paragraph({ children: [new TextRun({ text: diagram.title, bold: true })] }),
            );
          }
          if (diagram.imageUrl) {
            children.push(
              new Paragraph({
                children: [new TextRun({ text: '[다이어그램]', italics: true, color: '71717a' })],
              }),
            );
          } else if (diagram.source) {
            for (const line of diagram.source.split('\n')) {
              children.push(
                new Paragraph({
                  children: [new TextRun({ text: line, font: 'Courier New' })],
                }),
              );
            }
          }
          children.push(new Paragraph({ children: [] }));
          break;
        }
        case 'construction_standard': {
          const std = constructionStandardData(block.content);
          children.push(
            new Paragraph({
              children: [new TextRun({ text: constructionStandardHeading(std), bold: true })],
            }),
          );
          std.clauses.forEach((cl, i) => {
            children.push(
              new Paragraph({
                children: [new TextRun(`${cl.no ?? String(i + 1)}. ${cl.text}`)],
              }),
            );
          });
          children.push(new Paragraph({ children: [] }));
          break;
        }
        case 'material_spec': {
          const spec = materialSpecData(block.content);
          children.push(
            new Paragraph({
              children: [new TextRun({ text: `자재: ${spec.material}`, bold: true })],
            }),
          );
          children.push(buildDocxTable(spec.headers, spec.rows));
          children.push(new Paragraph({ children: [] }));
          break;
        }
        case 'schedule': {
          const sched = scheduleData(block.content);
          if (sched.title) {
            children.push(
              new Paragraph({ children: [new TextRun({ text: sched.title, bold: true })] }),
            );
          }
          children.push(buildDocxTable(sched.headers, sched.rows));
          children.push(new Paragraph({ children: [] }));
          break;
        }
        case 'risk_warning': {
          const risk = riskWarningData(block.content);
          children.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: `⚠ [위험-${risk.severityLabel}]${risk.title ? ` ${risk.title}` : ''}`,
                  bold: true,
                }),
              ],
            }),
          );
          children.push(new Paragraph({ children: [new TextRun(risk.risk)] }));
          if (risk.mitigation) {
            children.push(
              new Paragraph({
                spacing: { after: 160 },
                children: [new TextRun({ text: `대응: ${risk.mitigation}`, color: '71717a' })],
              }),
            );
          } else {
            children.push(new Paragraph({ children: [] }));
          }
          break;
        }
        case 'seo_meta': {
          const entries = seoMetaEntries(seoMetaData(block.content));
          if (entries.length === 0) break;
          children.push(
            new Paragraph({
              spacing: { after: 160 },
              children: [
                new TextRun({
                  text: entries.map(([k, v]) => `${k}: ${v}`).join('  /  '),
                  color: '52525b',
                  size: 18,
                }),
              ],
            }),
          );
          break;
        }
        case 'blog_section': {
          const sec = blogSectionData(block.content);
          if (sec.heading) {
            children.push(
              new Paragraph({
                heading: HeadingLevel.HEADING_3,
                children: [new TextRun(sec.heading)],
              }),
            );
          }
          if (sec.body) {
            children.push(
              new Paragraph({ spacing: { after: 160 }, children: [new TextRun(sec.body)] }),
            );
          }
          break;
        }
        case 'technical_section': {
          const sec = technicalSectionData(block.content);
          if (sec.heading) {
            children.push(
              new Paragraph({
                heading: HeadingLevel.HEADING_3,
                children: [new TextRun(sec.heading)],
              }),
            );
          }
          if (sec.body) {
            children.push(
              new Paragraph({ spacing: { after: 160 }, children: [new TextRun(sec.body)] }),
            );
          }
          if (sec.references.length > 0) {
            children.push(
              new Paragraph({ children: [new TextRun({ text: '참고', bold: true })] }),
            );
            for (const ref of sec.references) {
              children.push(new Paragraph({ children: [new TextRun(`· ${ref}`)] }));
            }
            children.push(new Paragraph({ children: [] }));
          }
          break;
        }
        case 'ontology_summary': {
          const onto = ontologySummaryData(block.content);
          if (onto.title) {
            children.push(
              new Paragraph({ children: [new TextRun({ text: onto.title, bold: true })] }),
            );
          }
          if (onto.nodes.length > 0) {
            children.push(
              new Paragraph({
                spacing: { after: 160 },
                children: [new TextRun(`관련 지식: ${onto.nodes.join(', ')}`)],
              }),
            );
          }
          break;
        }
        default:
          break;
      }
    }

    if (sources.length > 0) {
      children.push(
        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun('출처')] }),
      );
      sources.forEach((s, i) => {
        children.push(
          new Paragraph({
            children: [
              new TextRun(`${i + 1}. ${s.title ?? '제목 없음'}${s.summary ? ` — ${s.summary}` : ''}`),
            ],
          }),
        );
      });
    }

    const doc = new Document({ sections: [{ children }] });
    const buffer = await Packer.toArrayBuffer(doc);
    return {
      filename: safeFilename(document.title, 'docx'),
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      data: new Uint8Array(buffer),
    };
  }
}

function buildDocxTable(headers: string[], rows: string[][]): Table {
  const border = { style: BorderStyle.SINGLE, size: 4, color: 'd4d4d8' };
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: headers.map(
          (h) =>
            new TableCell({
              borders: { top: border, bottom: border, left: border, right: border },
              shading: { fill: '18181b' },
              children: [
                new Paragraph({ children: [new TextRun({ text: h, bold: true, color: 'ffffff' })] }),
              ],
            }),
        ),
      }),
      ...rows.map(
        (row) =>
          new TableRow({
            children: headers.map(
              (_, i) =>
                new TableCell({
                  borders: { top: border, bottom: border, left: border, right: border },
                  children: [new Paragraph({ children: [new TextRun(row[i] ?? '')] })],
                }),
            ),
          }),
      ),
    ],
  });
}
