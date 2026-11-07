import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
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
  type ExportOptions,
  type ExportResult,
} from './types';

const PAGE_WIDTH = 595.28; // A4
const PAGE_HEIGHT = 841.89;
const MARGIN = 56;
const BODY_SIZE = 11;
const LINE_HEIGHT = 18;

/**
 * PDF exporter. 서버에서 블록을 직접 렌더링한다 (Chromium 불필요).
 * 한글 렌더링을 위해 options.fontBytes(Noto Sans KR 등) 주입이 필요하다.
 */
export class PdfExporter implements Exporter {
  readonly format = 'pdf' as const;

  async export(document: DocumentForExport, options?: ExportOptions): Promise<ExportResult> {
    const pdf = await PDFDocument.create();
    let font: PDFFont;
    if (options?.fontBytes) {
      pdf.registerFontkit(fontkit);
      // subset: false — OTF/CFF 폰트를 subset하면 Quartz/Preview에서 한글 글리프가 깨진다.
      // 전체 폰트를 임베드해 모든 뷰어에서 정상 렌더되게 한다(파일 크기는 커진다).
      font = await pdf.embedFont(options.fontBytes, { subset: false });
    } else {
      font = await pdf.embedFont('Helvetica');
    }

    const writer = new PageWriter(pdf, font);
    writer.writeText(document.title, { size: 20, gapAfter: 14 });

    const { sources } = collectSources(document.blocks);

    for (const block of document.blocks) {
      const c = block.content as Record<string, string | number | undefined>;
      switch (block.type) {
        case 'heading': {
          const size = c.level === 1 ? 16 : c.level === 2 ? 14 : 12;
          writer.writeText(String(c.text ?? ''), { size, gapBefore: 8, gapAfter: 6 });
          break;
        }
        case 'paragraph':
          writer.writeText(String(c.text ?? ''), { gapAfter: 8 });
          break;
        case 'image':
          writer.writeText(`[이미지${c.caption ? `: ${c.caption}` : ''}]`, {
            gapAfter: 8,
            color: rgb(0.45, 0.45, 0.5),
          });
          break;
        case 'checklist': {
          if (c.title) writer.writeText(String(c.title), { size: 12, gapAfter: 4 });
          for (const item of checklistItems(block.content)) {
            writer.writeText(`${item.checked ? '☑' : '☐'} ${item.text}`, { gapAfter: 2 });
          }
          writer.gap(6);
          break;
        }
        case 'source_reference':
          break;
        case 'chart': {
          const chart = chartData(block.content);
          if (!chart) break;
          writer.writeText(
            `[${CHART_TYPE_LABELS[chart.chartType] ?? chart.chartType} 차트${chart.title ? `: ${chart.title}` : ''}]`,
            { size: 12, gapBefore: 6, gapAfter: 4 },
          );
          chart.labels.forEach((label, i) => {
            const row = chart.series
              .map((s) => `${s.name ? `${s.name} ` : ''}${s.values[i] ?? 0}`)
              .join(' / ');
            writer.writeText(`· ${label}: ${row}`, { gapAfter: 2 });
          });
          writer.gap(6);
          break;
        }
        case 'cta':
          writer.writeText(`▶ ${c.text ?? ''}${c.url ? ` (${c.url})` : ''}`, {
            gapBefore: 6,
            gapAfter: 8,
          });
          break;
        case 'table': {
          const table = tableData(block.content);
          if (!table) break;
          if (table.title) writer.writeText(table.title, { size: 12, gapBefore: 6, gapAfter: 4 });
          writer.writeText(table.headers.join('  |  '), { gapAfter: 2 });
          for (const row of table.rows) {
            writer.writeText(table.headers.map((_, i) => row[i] ?? '').join('  |  '), {
              gapAfter: 2,
              color: rgb(0.25, 0.25, 0.28),
            });
          }
          writer.gap(6);
          break;
        }
        case 'formula': {
          const formula = formulaData(block.content);
          if (!formula) break;
          if (formula.title) {
            writer.writeText(formula.title, { size: 12, gapBefore: 6, gapAfter: 4 });
          }
          writer.writeText(formula.expression, { gapAfter: 3 });
          for (const v of formula.variables) {
            writer.writeText(`· ${v.symbol}: ${v.meaning}${v.unit ? ` (${v.unit})` : ''}`, {
              gapAfter: 2,
              color: rgb(0.35, 0.35, 0.4),
            });
          }
          if (formula.result) writer.writeText(`= ${formula.result}`, { gapAfter: 4 });
          writer.gap(4);
          break;
        }
        case 'doc_meta': {
          const entries = docMetaEntries(block.content);
          if (entries.length === 0) break;
          writer.writeText(entries.map(([k, v]) => `${k}: ${v}`).join('  /  '), {
            gapAfter: 8,
            color: rgb(0.4, 0.4, 0.45),
          });
          break;
        }
        case 'qna': {
          const items = qnaItems(block.content);
          if (typeof c.title === 'string' && c.title) {
            writer.writeText(String(c.title), { size: 12, gapBefore: 6, gapAfter: 4 });
          }
          for (const item of items) {
            writer.writeText(`Q. ${item.question}`, { gapAfter: 2 });
            writer.writeText(`A. ${item.answer}`, { gapAfter: 2, color: rgb(0.3, 0.3, 0.35) });
            if (item.basis) {
              writer.writeText(`근거: ${item.basis}`, { gapAfter: 3, color: rgb(0.45, 0.45, 0.5) });
            }
          }
          writer.gap(4);
          break;
        }
        case 'law_reference': {
          const law = lawReferenceData(block.content);
          if (!law) break;
          writer.writeText(`📋 ${lawReferenceHeading(law)}`, {
            size: 12,
            gapBefore: 6,
            gapAfter: 4,
          });
          if (law.summary) writer.writeText(law.summary, { gapAfter: 2 });
          if (law.link) {
            writer.writeText(`원문: ${law.link}`, { gapAfter: 4, color: rgb(0.35, 0.35, 0.5) });
          }
          writer.gap(4);
          break;
        }
        case 'callout': {
          const callout = calloutData(block.content);
          const variantLabel = CALLOUT_VARIANT_LABELS[callout.variant] ?? callout.variant;
          writer.writeText(`[${variantLabel}]${callout.title ? ` ${callout.title}` : ''}`, {
            size: 12,
            gapBefore: 6,
            gapAfter: 2,
          });
          writer.writeText(callout.text, { gapAfter: 8, color: rgb(0.25, 0.25, 0.28) });
          break;
        }
        case 'quote': {
          const quote = quoteData(block.content);
          writer.writeText(`“${quote.text}”`, { gapBefore: 6, gapAfter: 2 });
          if (quote.attribution) {
            writer.writeText(`— ${quote.attribution}`, {
              gapAfter: 8,
              color: rgb(0.45, 0.45, 0.5),
            });
          } else {
            writer.gap(6);
          }
          break;
        }
        case 'code': {
          const code = codeData(block.content);
          if (code.language) {
            writer.writeText(`code (${code.language})`, {
              size: 10,
              gapBefore: 6,
              gapAfter: 2,
              color: rgb(0.45, 0.45, 0.5),
            });
          }
          for (const line of code.code.split('\n')) {
            writer.writeText(line, { gapAfter: 1, color: rgb(0.2, 0.2, 0.25) });
          }
          writer.gap(6);
          break;
        }
        case 'cost_table': {
          const cost = costTableData(block.content);
          if (cost.title) writer.writeText(cost.title, { size: 12, gapBefore: 6, gapAfter: 4 });
          writer.writeText(cost.headers.join('  |  '), { gapAfter: 2 });
          for (const row of cost.rows) {
            writer.writeText(cost.headers.map((_, i) => row[i] ?? '').join('  |  '), {
              gapAfter: 2,
              color: rgb(0.25, 0.25, 0.28),
            });
          }
          if (cost.note) {
            writer.writeText(cost.note, { gapAfter: 4, color: rgb(0.45, 0.45, 0.5) });
          }
          writer.gap(6);
          break;
        }
        case 'construction_detail': {
          const detail = constructionDetailData(block.content);
          if (detail.title) {
            writer.writeText(detail.title, { size: 12, gapBefore: 6, gapAfter: 4 });
          }
          if (detail.imageUrl || detail.imagePrompt) {
            writer.writeText(`[상세도${detail.imagePrompt ? `: ${detail.imagePrompt}` : ''}]`, {
              gapAfter: 4,
              color: rgb(0.45, 0.45, 0.5),
            });
          }
          detail.steps.forEach((step, i) => {
            writer.writeText(`${i + 1}. ${step}`, { gapAfter: 2 });
          });
          if (detail.notes) {
            writer.writeText(`주의: ${detail.notes}`, {
              gapAfter: 4,
              color: rgb(0.45, 0.45, 0.5),
            });
          }
          writer.gap(4);
          break;
        }
        case 'container': {
          if (c.title) {
            writer.writeText(String(c.title), { size: 14, gapBefore: 10, gapAfter: 6 });
          }
          break;
        }
        case 'rich_text': {
          const rich = richTextData(block.content);
          writer.writeText(rich.text, { gapAfter: 8 });
          break;
        }
        case 'image_gallery': {
          const gallery = imageGalleryData(block.content);
          writer.writeText(`[갤러리${gallery.title ? `: ${gallery.title}` : ''}]`, {
            size: 12,
            gapBefore: 6,
            gapAfter: 4,
            color: rgb(0.45, 0.45, 0.5),
          });
          for (const img of gallery.images) {
            const caption = img.caption || img.prompt;
            writer.writeText(`[이미지${caption ? `: ${caption}` : ''}]`, {
              gapAfter: 2,
              color: rgb(0.45, 0.45, 0.5),
            });
          }
          writer.gap(6);
          break;
        }
        case 'before_after': {
          const ba = beforeAfterData(block.content);
          if (ba.title) writer.writeText(ba.title, { size: 12, gapBefore: 6, gapAfter: 4 });
          for (const side of [ba.before, ba.after]) {
            writer.writeText(`[${side.label}${side.prompt ? `: ${side.prompt}` : ''}]`, {
              gapAfter: 2,
              color: rgb(0.45, 0.45, 0.5),
            });
          }
          writer.gap(6);
          break;
        }
        case 'diagram': {
          const diagram = diagramData(block.content);
          if (diagram.title) {
            writer.writeText(diagram.title, { size: 12, gapBefore: 6, gapAfter: 4 });
          }
          if (diagram.imageUrl) {
            writer.writeText('[다이어그램]', { gapAfter: 4, color: rgb(0.45, 0.45, 0.5) });
          } else if (diagram.source) {
            for (const line of diagram.source.split('\n')) {
              writer.writeText(line, { gapAfter: 1, color: rgb(0.2, 0.2, 0.25) });
            }
          }
          writer.gap(6);
          break;
        }
        case 'construction_standard': {
          const std = constructionStandardData(block.content);
          writer.writeText(constructionStandardHeading(std), {
            size: 12,
            gapBefore: 6,
            gapAfter: 4,
          });
          std.clauses.forEach((cl, i) => {
            writer.writeText(`${cl.no ?? String(i + 1)}. ${cl.text}`, { gapAfter: 2 });
          });
          writer.gap(4);
          break;
        }
        case 'material_spec': {
          const spec = materialSpecData(block.content);
          writer.writeText(`자재: ${spec.material}`, { size: 12, gapBefore: 6, gapAfter: 4 });
          writer.writeText(spec.headers.join('  |  '), { gapAfter: 2 });
          for (const row of spec.rows) {
            writer.writeText(spec.headers.map((_, i) => row[i] ?? '').join('  |  '), {
              gapAfter: 2,
              color: rgb(0.25, 0.25, 0.28),
            });
          }
          writer.gap(6);
          break;
        }
        case 'schedule': {
          const sched = scheduleData(block.content);
          if (sched.title) writer.writeText(sched.title, { size: 12, gapBefore: 6, gapAfter: 4 });
          writer.writeText(sched.headers.join('  |  '), { gapAfter: 2 });
          for (const row of sched.rows) {
            writer.writeText(sched.headers.map((_, i) => row[i] ?? '').join('  |  '), {
              gapAfter: 2,
              color: rgb(0.25, 0.25, 0.28),
            });
          }
          writer.gap(6);
          break;
        }
        case 'risk_warning': {
          const risk = riskWarningData(block.content);
          writer.writeText(`⚠ [위험-${risk.severityLabel}]${risk.title ? ` ${risk.title}` : ''}`, {
            size: 12,
            gapBefore: 6,
            gapAfter: 2,
          });
          writer.writeText(risk.risk, { gapAfter: 2, color: rgb(0.25, 0.25, 0.28) });
          if (risk.mitigation) {
            writer.writeText(`대응: ${risk.mitigation}`, {
              gapAfter: 8,
              color: rgb(0.45, 0.45, 0.5),
            });
          } else {
            writer.gap(6);
          }
          break;
        }
        case 'seo_meta': {
          const entries = seoMetaEntries(seoMetaData(block.content));
          if (entries.length === 0) break;
          writer.writeText(entries.map(([k, v]) => `${k}: ${v}`).join('  /  '), {
            gapAfter: 8,
            color: rgb(0.4, 0.4, 0.45),
          });
          break;
        }
        case 'blog_section': {
          const sec = blogSectionData(block.content);
          if (sec.heading) writer.writeText(sec.heading, { size: 14, gapBefore: 8, gapAfter: 6 });
          if (sec.body) writer.writeText(sec.body, { gapAfter: 8 });
          break;
        }
        case 'technical_section': {
          const sec = technicalSectionData(block.content);
          if (sec.heading) writer.writeText(sec.heading, { size: 14, gapBefore: 8, gapAfter: 6 });
          if (sec.body) writer.writeText(sec.body, { gapAfter: 4 });
          if (sec.references.length > 0) {
            writer.writeText('참고', { size: 12, gapBefore: 4, gapAfter: 2 });
            for (const ref of sec.references) {
              writer.writeText(`· ${ref}`, { gapAfter: 2, color: rgb(0.35, 0.35, 0.4) });
            }
          }
          writer.gap(4);
          break;
        }
        case 'ontology_summary': {
          const onto = ontologySummaryData(block.content);
          if (onto.title) writer.writeText(onto.title, { size: 12, gapBefore: 6, gapAfter: 4 });
          if (onto.nodes.length > 0) {
            writer.writeText(`관련 지식: ${onto.nodes.join(', ')}`, {
              gapAfter: 6,
              color: rgb(0.3, 0.3, 0.35),
            });
          }
          break;
        }
        default:
          break;
      }
    }

    if (sources.length > 0) {
      writer.writeText('출처', { size: 14, gapBefore: 12, gapAfter: 6 });
      sources.forEach((s, i) => {
        writer.writeText(
          `${i + 1}. ${s.title ?? '제목 없음'}${s.summary ? ` - ${s.summary}` : ''}`,
          { gapAfter: 4 },
        );
      });
    }

    const bytes = await pdf.save();
    return {
      filename: safeFilename(document.title, 'pdf'),
      mimeType: 'application/pdf',
      data: bytes,
    };
  }
}

class PageWriter {
  private page: PDFPage;
  private y: number;

  constructor(
    private pdf: PDFDocument,
    private font: PDFFont,
  ) {
    this.page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.y = PAGE_HEIGHT - MARGIN;
  }

  gap(amount: number) {
    this.y -= amount;
  }

  writeText(
    text: string,
    opts?: { size?: number; gapBefore?: number; gapAfter?: number; color?: ReturnType<typeof rgb> },
  ) {
    const size = opts?.size ?? BODY_SIZE;
    if (opts?.gapBefore) this.gap(opts.gapBefore);
    const maxWidth = PAGE_WIDTH - MARGIN * 2;
    for (const line of this.wrap(text, size, maxWidth)) {
      const lineHeight = Math.max(LINE_HEIGHT, size * 1.5);
      if (this.y - lineHeight < MARGIN) {
        this.page = this.pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
        this.y = PAGE_HEIGHT - MARGIN;
      }
      this.page.drawText(line, {
        x: MARGIN,
        y: this.y - lineHeight,
        size,
        font: this.font,
        color: opts?.color ?? rgb(0.1, 0.1, 0.12),
      });
      this.y -= lineHeight;
    }
    if (opts?.gapAfter) this.gap(opts.gapAfter);
  }

  /** 한글은 공백 단위 분리가 어려워 글자 단위 폭 기준으로 줄바꿈한다 */
  private wrap(text: string, size: number, maxWidth: number): string[] {
    const lines: string[] = [];
    let current = '';
    for (const char of text.replace(/\r/g, '')) {
      if (char === '\n') {
        lines.push(current);
        current = '';
        continue;
      }
      const candidate = current + char;
      let width: number;
      try {
        width = this.font.widthOfTextAtSize(candidate, size);
      } catch {
        // 폰트에 없는 글자는 대체 문자로
        current += '?';
        continue;
      }
      if (width > maxWidth && current.length > 0) {
        lines.push(current);
        current = char;
      } else {
        current = candidate;
      }
    }
    if (current.length > 0) lines.push(current);
    return lines.length > 0 ? lines : [''];
  }
}
