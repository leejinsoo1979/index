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

export class TxtExporter implements Exporter {
  readonly format = 'txt' as const;

  async export(document: DocumentForExport): Promise<ExportResult> {
    const { sources } = collectSources(document.blocks);
    const lines: string[] = [document.title, '='.repeat(Math.min(document.title.length * 2, 60)), ''];

    for (const block of document.blocks) {
      const c = block.content as Record<string, string | undefined>;
      switch (block.type) {
        case 'heading':
          lines.push('', `${c.text ?? ''}`, '-'.repeat(20));
          break;
        case 'paragraph':
          lines.push(c.text ?? '', '');
          break;
        case 'image':
          lines.push(`[이미지${c.caption ? `: ${c.caption}` : ''}]`, '');
          break;
        case 'checklist': {
          if (c.title) lines.push(`${c.title}`);
          for (const item of checklistItems(block.content)) {
            lines.push(`${item.checked ? '[x]' : '[ ]'} ${item.text}`);
          }
          lines.push('');
          break;
        }
        case 'source_reference':
          // 본문에서는 생략하고 문서 끝 출처 목록으로 변환
          break;
        case 'chart': {
          const chart = chartData(block.content);
          if (!chart) break;
          lines.push(
            `[${CHART_TYPE_LABELS[chart.chartType] ?? chart.chartType} 차트${chart.title ? `: ${chart.title}` : ''}]`,
          );
          chart.labels.forEach((label, i) => {
            const row = chart.series
              .map((s) => `${s.name ? `${s.name} ` : ''}${s.values[i] ?? 0}`)
              .join(' / ');
            lines.push(`- ${label}: ${row}`);
          });
          lines.push('');
          break;
        }
        case 'cta':
          lines.push(`▶ ${c.text ?? ''}${c.url ? ` (${c.url})` : ''}`, '');
          break;
        case 'table': {
          const table = tableData(block.content);
          if (!table) break;
          if (table.title) lines.push(table.title);
          lines.push(table.headers.join(' | '));
          lines.push(table.headers.map(() => '---').join(' | '));
          for (const row of table.rows) {
            lines.push(table.headers.map((_, i) => row[i] ?? '').join(' | '));
          }
          lines.push('');
          break;
        }
        case 'formula': {
          const formula = formulaData(block.content);
          if (!formula) break;
          if (formula.title) lines.push(formula.title);
          lines.push(`  ${formula.expression}`);
          for (const v of formula.variables) {
            lines.push(`  - ${v.symbol}: ${v.meaning}${v.unit ? ` (${v.unit})` : ''}`);
          }
          if (formula.result) lines.push(`  = ${formula.result}`);
          lines.push('');
          break;
        }
        case 'doc_meta': {
          const entries = docMetaEntries(block.content);
          if (entries.length === 0) break;
          lines.push(entries.map(([k, v]) => `${k}: ${v}`).join(' / '), '');
          break;
        }
        case 'qna': {
          const items = qnaItems(block.content);
          if (typeof c.title === 'string' && c.title) lines.push(c.title);
          for (const item of items) {
            lines.push(`Q. ${item.question}`);
            lines.push(`A. ${item.answer}`);
            if (item.basis) lines.push(`   근거: ${item.basis}`);
          }
          lines.push('');
          break;
        }
        case 'law_reference': {
          const law = lawReferenceData(block.content);
          if (!law) break;
          lines.push(`[법규] ${lawReferenceHeading(law)}`);
          if (law.summary) lines.push(law.summary);
          if (law.link) lines.push(`원문: ${law.link}`);
          lines.push('');
          break;
        }
        case 'callout': {
          const callout = calloutData(block.content);
          const variantLabel = CALLOUT_VARIANT_LABELS[callout.variant] ?? callout.variant;
          lines.push(`[${variantLabel}]${callout.title ? ` ${callout.title}` : ''}`);
          lines.push(callout.text, '');
          break;
        }
        case 'quote': {
          const quote = quoteData(block.content);
          lines.push(`"${quote.text}"`);
          if (quote.attribution) lines.push(`— ${quote.attribution}`);
          lines.push('');
          break;
        }
        case 'code': {
          const code = codeData(block.content);
          lines.push(`--- code (${code.language ?? ''}) ---`);
          lines.push(code.code);
          lines.push('--- /code ---', '');
          break;
        }
        case 'cost_table': {
          const cost = costTableData(block.content);
          if (cost.title) lines.push(cost.title);
          lines.push(cost.headers.join(' | '));
          lines.push(cost.headers.map(() => '---').join(' | '));
          for (const row of cost.rows) {
            lines.push(cost.headers.map((_, i) => row[i] ?? '').join(' | '));
          }
          if (cost.note) lines.push(cost.note);
          lines.push('');
          break;
        }
        case 'construction_detail': {
          const detail = constructionDetailData(block.content);
          if (detail.title) lines.push(detail.title);
          if (detail.imageUrl) {
            lines.push(`[상세도: ${detail.imageUrl}]`);
          } else if (detail.imagePrompt) {
            lines.push(`[상세도: ${detail.imagePrompt}]`);
          }
          detail.steps.forEach((step, i) => {
            lines.push(`${i + 1}. ${step}`);
          });
          if (detail.notes) lines.push(`주의: ${detail.notes}`);
          lines.push('');
          break;
        }
        case 'container': {
          if (c.title) lines.push('', `【 ${c.title} 】`, '');
          break;
        }
        case 'rich_text': {
          const rich = richTextData(block.content);
          lines.push(rich.text, '');
          break;
        }
        case 'image_gallery': {
          const gallery = imageGalleryData(block.content);
          if (gallery.title) lines.push(`[갤러리: ${gallery.title}]`);
          for (const img of gallery.images) {
            lines.push(`[이미지${img.caption ? `: ${img.caption}` : img.prompt ? `: ${img.prompt}` : ''}]`);
          }
          lines.push('');
          break;
        }
        case 'before_after': {
          const ba = beforeAfterData(block.content);
          if (ba.title) lines.push(ba.title);
          for (const side of [ba.before, ba.after]) {
            lines.push(`[${side.label}${side.prompt ? `: ${side.prompt}` : ''}]`);
          }
          lines.push('');
          break;
        }
        case 'diagram': {
          const diagram = diagramData(block.content);
          if (diagram.title) lines.push(diagram.title);
          if (diagram.imageUrl) {
            lines.push(`[다이어그램: ${diagram.imageUrl}]`);
          } else if (diagram.source) {
            for (const line of diagram.source.split('\n')) lines.push(`  ${line}`);
          }
          lines.push('');
          break;
        }
        case 'construction_standard': {
          const std = constructionStandardData(block.content);
          lines.push(constructionStandardHeading(std));
          std.clauses.forEach((cl, i) => {
            lines.push(`${cl.no ?? String(i + 1)}. ${cl.text}`);
          });
          lines.push('');
          break;
        }
        case 'material_spec': {
          const spec = materialSpecData(block.content);
          lines.push(`자재: ${spec.material}`);
          lines.push(spec.headers.join(' | '));
          lines.push(spec.headers.map(() => '---').join(' | '));
          for (const row of spec.rows) {
            lines.push(spec.headers.map((_, i) => row[i] ?? '').join(' | '));
          }
          lines.push('');
          break;
        }
        case 'schedule': {
          const sched = scheduleData(block.content);
          if (sched.title) lines.push(sched.title);
          lines.push(sched.headers.join(' | '));
          lines.push(sched.headers.map(() => '---').join(' | '));
          for (const row of sched.rows) {
            lines.push(sched.headers.map((_, i) => row[i] ?? '').join(' | '));
          }
          lines.push('');
          break;
        }
        case 'risk_warning': {
          const risk = riskWarningData(block.content);
          lines.push(`⚠ [위험-${risk.severityLabel}]${risk.title ? ` ${risk.title}` : ''}`);
          lines.push(risk.risk);
          if (risk.mitigation) lines.push(`대응: ${risk.mitigation}`);
          lines.push('');
          break;
        }
        case 'seo_meta': {
          const entries = seoMetaEntries(seoMetaData(block.content));
          if (entries.length === 0) break;
          lines.push(entries.map(([k, v]) => `${k}: ${v}`).join(' / '), '');
          break;
        }
        case 'blog_section': {
          const sec = blogSectionData(block.content);
          if (sec.heading) lines.push('', sec.heading, '-'.repeat(20));
          if (sec.body) lines.push(sec.body, '');
          break;
        }
        case 'technical_section': {
          const sec = technicalSectionData(block.content);
          if (sec.heading) lines.push('', sec.heading, '-'.repeat(20));
          if (sec.body) lines.push(sec.body, '');
          if (sec.references.length > 0) {
            lines.push('참고');
            for (const ref of sec.references) lines.push(`- ${ref}`);
            lines.push('');
          }
          break;
        }
        case 'ontology_summary': {
          const onto = ontologySummaryData(block.content);
          if (onto.title) lines.push(onto.title);
          if (onto.nodes.length > 0) lines.push(`관련 지식: ${onto.nodes.join(', ')}`);
          lines.push('');
          break;
        }
        default:
          break;
      }
    }

    if (sources.length > 0) {
      lines.push('', '출처', '----');
      sources.forEach((s, i) => {
        lines.push(`${i + 1}. ${s.title ?? '제목 없음'}${s.summary ? ` - ${s.summary}` : ''}`);
      });
    }

    const text = lines.join('\n');
    return {
      filename: safeFilename(document.title, 'txt'),
      mimeType: 'text/plain; charset=utf-8',
      data: new TextEncoder().encode(text),
    };
  }
}
