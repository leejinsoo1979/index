import { safeUrlOrEmpty } from '@archi/security';
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
  type GalleryImage,
} from './types';

function esc(text: unknown): string {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** HTML exporter (제안서: 홈페이지/랜딩페이지 배포). 모든 사용자 입력은 escape, URL은 allowlist */
export class HtmlExporter implements Exporter {
  readonly format = 'html' as const;

  async export(document: DocumentForExport): Promise<ExportResult> {
    const { sources } = collectSources(document.blocks);
    const parts: string[] = [`<h1>${esc(document.title)}</h1>`];

    for (const block of document.blocks) {
      const c = block.content as Record<string, string | number | undefined>;
      switch (block.type) {
        case 'heading': {
          const level = Math.min(Number(c.level ?? 2) + 1, 6);
          parts.push(`<h${level}>${esc(c.text)}</h${level}>`);
          break;
        }
        case 'paragraph':
          parts.push(`<p>${esc(c.text)}</p>`);
          break;
        case 'image': {
          const url = safeUrlOrEmpty(String(c.url ?? ''));
          if (url) {
            parts.push(
              `<figure><img src="${esc(url)}" alt="${esc(c.caption ?? '이미지')}"/>${
                c.caption ? `<figcaption>${esc(c.caption)}</figcaption>` : ''
              }</figure>`,
            );
          }
          break;
        }
        case 'checklist': {
          const items = checklistItems(block.content);
          const title = c.title ? `<p class="list-title">${esc(c.title)}</p>` : '';
          parts.push(
            `${title}<ul class="checklist">${items
              .map((item) => `<li>${item.checked ? '☑' : '☐'} ${esc(item.text)}</li>`)
              .join('')}</ul>`,
          );
          break;
        }
        case 'table': {
          const table = tableData(block.content);
          if (!table) break;
          parts.push(renderHtmlTable(table.title, table.headers, table.rows));
          break;
        }
        case 'chart': {
          const chart = chartData(block.content);
          if (!chart) break;
          const headers = ['항목', ...chart.series.map((s, i) => s.name || `시리즈 ${i + 1}`)];
          const rows = chart.labels.map((label, i) => [
            label,
            ...chart.series.map((s) => String(s.values[i] ?? 0)),
          ]);
          parts.push(
            renderHtmlTable(
              `${chart.title ?? '차트'} (${CHART_TYPE_LABELS[chart.chartType] ?? chart.chartType} 차트)`,
              headers,
              rows,
            ),
          );
          break;
        }
        case 'formula': {
          const formula = formulaData(block.content);
          if (!formula) break;
          const vars = formula.variables
            .map((v) => `<li><code>${esc(v.symbol)}</code>: ${esc(v.meaning)}${v.unit ? ` (${esc(v.unit)})` : ''}</li>`)
            .join('');
          parts.push(
            `<div class="formula">${formula.title ? `<p class="list-title">${esc(formula.title)}</p>` : ''}<pre><code>${esc(formula.expression)}</code></pre>${vars ? `<ul>${vars}</ul>` : ''}${formula.result ? `<p>= ${esc(formula.result)}</p>` : ''}</div>`,
          );
          break;
        }
        case 'doc_meta': {
          const entries = docMetaEntries(block.content);
          if (entries.length === 0) break;
          parts.push(
            `<p class="doc-meta">${entries.map(([k, v]) => `<strong>${esc(k)}</strong> ${esc(v)}`).join(' · ')}</p>`,
          );
          break;
        }
        case 'qna': {
          const items = qnaItems(block.content);
          const title = c.title ? `<p class="list-title">${esc(c.title)}</p>` : '';
          parts.push(
            `${title}<dl class="qna">${items
              .map(
                (item) =>
                  `<dt>Q. ${esc(item.question)}</dt><dd>A. ${esc(item.answer)}${item.basis ? `<br/><small>근거: ${esc(item.basis)}</small>` : ''}</dd>`,
              )
              .join('')}</dl>`,
          );
          break;
        }
        case 'cta': {
          const url = safeUrlOrEmpty(String(c.url ?? ''));
          parts.push(
            `<div class="cta"><p>${esc(c.text)}</p>${
              c.buttonLabel ? `<a href="${esc(url || '#')}">${esc(c.buttonLabel)}</a>` : ''
            }</div>`,
          );
          break;
        }
        case 'source_reference':
          break;
        case 'law_reference': {
          const law = lawReferenceData(block.content);
          if (!law) break;
          const url = law.link ? safeUrlOrEmpty(law.link) : '';
          parts.push(
            `<blockquote class="law-ref"><strong>${esc(lawReferenceHeading(law))}</strong>${
              law.summary ? `<p>${esc(law.summary)}</p>` : ''
            }${url ? `<a href="${esc(url)}">원문</a>` : ''}</blockquote>`,
          );
          break;
        }
        case 'callout': {
          const callout = calloutData(block.content);
          const variantLabel = CALLOUT_VARIANT_LABELS[callout.variant] ?? callout.variant;
          parts.push(
            `<div class="callout callout-${esc(callout.variant)}">${
              callout.title ? `<strong>${esc(callout.title)}</strong>` : ''
            }<p>${esc(callout.text)}</p><small>${esc(variantLabel)}</small></div>`,
          );
          break;
        }
        case 'quote': {
          const quote = quoteData(block.content);
          parts.push(
            `<blockquote><p>${esc(quote.text)}</p>${
              quote.attribution ? `<cite>${esc(quote.attribution)}</cite>` : ''
            }</blockquote>`,
          );
          break;
        }
        case 'code': {
          const code = codeData(block.content);
          parts.push(`<pre><code>${esc(code.code)}</code></pre>`);
          break;
        }
        case 'cost_table': {
          const cost = costTableData(block.content);
          parts.push(renderHtmlTable(cost.title, cost.headers, cost.rows));
          if (cost.note) parts.push(`<p class="cost-note">${esc(cost.note)}</p>`);
          break;
        }
        case 'construction_detail': {
          const detail = constructionDetailData(block.content);
          const head = detail.title ? `<h3>${esc(detail.title)}</h3>` : '';
          let media = '';
          const url = detail.imageUrl ? safeUrlOrEmpty(detail.imageUrl) : '';
          if (url) {
            media = `<figure><img src="${esc(url)}" alt="${esc(detail.title ?? '상세도')}"/></figure>`;
          } else if (detail.imagePrompt) {
            media = `<p class="detail-placeholder">[상세도: ${esc(detail.imagePrompt)}]</p>`;
          }
          const steps = detail.steps.length
            ? `<ol>${detail.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>`
            : '';
          const notes = detail.notes ? `<p class="detail-notes">주의: ${esc(detail.notes)}</p>` : '';
          parts.push(`<div class="construction-detail">${head}${media}${steps}${notes}</div>`);
          break;
        }
        case 'container': {
          if (c.title) parts.push(`<h3 class="container-title">${esc(c.title)}</h3>`);
          break;
        }
        case 'rich_text': {
          const rich = richTextData(block.content);
          parts.push(`<p>${esc(rich.text)}</p>`);
          break;
        }
        case 'image_gallery': {
          const gallery = imageGalleryData(block.content);
          if (gallery.title) parts.push(`<h3>${esc(gallery.title)}</h3>`);
          const figures = gallery.images.map((img) => renderGalleryFigure(img)).join('');
          parts.push(`<div class="image-gallery">${figures}</div>`);
          break;
        }
        case 'before_after': {
          const ba = beforeAfterData(block.content);
          if (ba.title) parts.push(`<h3>${esc(ba.title)}</h3>`);
          const sides = [ba.before, ba.after]
            .map(
              (side) =>
                `<div class="ba-side"><p class="list-title">${esc(side.label)}</p>${renderGalleryFigure(
                  { url: side.url, caption: side.label, prompt: side.prompt },
                )}</div>`,
            )
            .join('');
          parts.push(`<div class="before-after">${sides}</div>`);
          break;
        }
        case 'diagram': {
          const diagram = diagramData(block.content);
          if (diagram.title) parts.push(`<h3>${esc(diagram.title)}</h3>`);
          const url = diagram.imageUrl ? safeUrlOrEmpty(diagram.imageUrl) : '';
          if (url) {
            parts.push(
              `<figure><img src="${esc(url)}" alt="${esc(diagram.title ?? '다이어그램')}"/></figure>`,
            );
          } else if (diagram.source) {
            parts.push(`<pre><code>${esc(diagram.source)}</code></pre>`);
          }
          break;
        }
        case 'construction_standard': {
          const std = constructionStandardData(block.content);
          parts.push(`<h3>${esc(constructionStandardHeading(std))}</h3>`);
          if (std.clauses.length > 0) {
            parts.push(
              `<ol class="construction-standard">${std.clauses
                .map(
                  (cl) =>
                    `<li>${cl.no ? `<strong>${esc(cl.no)}.</strong> ` : ''}${esc(cl.text)}</li>`,
                )
                .join('')}</ol>`,
            );
          }
          break;
        }
        case 'material_spec': {
          const spec = materialSpecData(block.content);
          parts.push(`<h3>자재: ${esc(spec.material)}</h3>`);
          parts.push(renderHtmlTable(undefined, spec.headers, spec.rows));
          break;
        }
        case 'schedule': {
          const sched = scheduleData(block.content);
          parts.push(renderHtmlTable(sched.title, sched.headers, sched.rows));
          break;
        }
        case 'risk_warning': {
          const risk = riskWarningData(block.content);
          parts.push(
            `<div class="risk-warning risk-${esc(risk.severity)}"><strong>⚠ [위험-${esc(
              risk.severityLabel,
            )}]${risk.title ? ` ${esc(risk.title)}` : ''}</strong><p>${esc(risk.risk)}</p>${
              risk.mitigation ? `<p class="risk-mitigation">대응: ${esc(risk.mitigation)}</p>` : ''
            }</div>`,
          );
          break;
        }
        case 'seo_meta': {
          const entries = seoMetaEntries(seoMetaData(block.content));
          if (entries.length === 0) break;
          parts.push(
            `<div class="seo-meta">${entries
              .map(([k, v]) => `<p><strong>${esc(k)}</strong> ${esc(v)}</p>`)
              .join('')}</div>`,
          );
          break;
        }
        case 'blog_section': {
          const sec = blogSectionData(block.content);
          if (sec.heading) parts.push(`<h3>${esc(sec.heading)}</h3>`);
          if (sec.body) parts.push(`<p>${esc(sec.body)}</p>`);
          break;
        }
        case 'technical_section': {
          const sec = technicalSectionData(block.content);
          if (sec.heading) parts.push(`<h3>${esc(sec.heading)}</h3>`);
          if (sec.body) parts.push(`<p>${esc(sec.body)}</p>`);
          if (sec.references.length > 0) {
            parts.push(
              `<p class="list-title">참고</p><ul class="references">${sec.references
                .map((ref) => `<li>${esc(ref)}</li>`)
                .join('')}</ul>`,
            );
          }
          break;
        }
        case 'ontology_summary': {
          const onto = ontologySummaryData(block.content);
          if (onto.title) parts.push(`<h3>${esc(onto.title)}</h3>`);
          if (onto.nodes.length > 0) {
            parts.push(`<p class="ontology-summary">관련 지식: ${esc(onto.nodes.join(', '))}</p>`);
          }
          break;
        }
        default:
          break;
      }
    }

    if (sources.length > 0) {
      parts.push('<h2>출처</h2>');
      parts.push(
        `<ol class="sources">${sources
          .map((s) => `<li><strong>${esc(s.title ?? '제목 없음')}</strong>${s.summary ? ` — ${esc(s.summary)}` : ''}</li>`)
          .join('')}</ol>`,
      );
    }

    const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${esc(document.title)}</title>
<style>
  body { font-family: 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif; color: #18181b; max-width: 760px; margin: 0 auto; padding: 48px 24px; line-height: 1.7; }
  h1, h2, h3, h4 { line-height: 1.3; }
  img { max-width: 100%; border-radius: 8px; }
  figcaption { color: #71717a; font-size: 0.85rem; }
  table { border-collapse: collapse; width: 100%; margin: 12px 0; font-size: 0.95rem; }
  th { background: #18181b; color: #fff; text-align: left; }
  th, td { border: 1px solid #d4d4d8; padding: 6px 10px; }
  .checklist { list-style: none; padding-left: 0; }
  .formula pre { background: #18181b; color: #fff; padding: 10px 14px; border-radius: 8px; }
  .doc-meta { color: #52525b; font-size: 0.85rem; border-left: 3px solid #18181b; padding-left: 10px; }
  .qna dt { font-weight: 700; margin-top: 10px; }
  .qna dd { margin-left: 0; color: #3f3f46; }
  .cta { background: #18181b; color: #fff; padding: 20px; border-radius: 12px; text-align: center; margin: 20px 0; }
  .cta a { display: inline-block; background: #fff; color: #18181b; padding: 8px 18px; border-radius: 8px; text-decoration: none; font-weight: 700; }
  .list-title { font-weight: 700; }
  .law-ref { border-left: 3px solid #18181b; padding: 8px 14px; background: #f4f4f5; }
  .law-ref a { color: #18181b; }
  .callout { border-radius: 8px; padding: 12px 16px; margin: 14px 0; border-left: 4px solid #71717a; background: #f4f4f5; }
  .callout-info { border-left-color: #2563eb; }
  .callout-warning { border-left-color: #d97706; }
  .callout-tip { border-left-color: #059669; }
  .callout-danger { border-left-color: #dc2626; }
  .callout small { color: #71717a; text-transform: uppercase; font-size: 0.7rem; }
  blockquote cite { display: block; color: #71717a; font-size: 0.9rem; margin-top: 6px; }
  pre { background: #18181b; color: #fff; padding: 12px 16px; border-radius: 8px; overflow-x: auto; }
  pre code { font-family: 'SFMono-Regular', Consolas, monospace; }
  .cost-note { color: #71717a; font-size: 0.85rem; }
  .detail-placeholder { color: #71717a; font-style: italic; }
  .detail-notes { color: #b45309; }
  .container-title { border-top: 2px solid #18181b; padding-top: 10px; margin-top: 24px; font-weight: 700; }
  .image-gallery { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }
  .image-gallery figure, .before-after figure { margin: 0; }
  .image-placeholder { color: #71717a; font-style: italic; }
  .before-after { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .construction-standard li { margin: 4px 0; }
  .risk-warning { border-radius: 8px; padding: 12px 16px; margin: 14px 0; border-left: 4px solid #71717a; background: #f4f4f5; }
  .risk-low { border-left-color: #059669; }
  .risk-medium { border-left-color: #d97706; }
  .risk-high { border-left-color: #dc2626; }
  .risk-mitigation { color: #52525b; }
  .seo-meta { color: #52525b; font-size: 0.85rem; border-left: 3px solid #18181b; padding: 4px 10px; background: #f4f4f5; }
  .seo-meta p { margin: 2px 0; }
  .ontology-summary { color: #3f3f46; font-style: italic; }
</style>
</head>
<body>
${parts.join('\n')}
</body>
</html>`;

    return {
      filename: safeFilename(document.title, 'html'),
      mimeType: 'text/html; charset=utf-8',
      data: new TextEncoder().encode(html),
    };
  }
}

function renderGalleryFigure(img: GalleryImage): string {
  const url = img.url ? safeUrlOrEmpty(img.url) : '';
  if (url) {
    return `<figure><img src="${esc(url)}" alt="${esc(img.caption ?? '이미지')}"/>${
      img.caption ? `<figcaption>${esc(img.caption)}</figcaption>` : ''
    }</figure>`;
  }
  return `<p class="image-placeholder">[이미지: ${esc(img.caption || img.prompt || '')}]</p>`;
}

function renderHtmlTable(title: string | undefined, headers: string[], rows: string[][]): string {
  const head = `<tr>${headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr>`;
  const body = rows
    .map((row) => `<tr>${headers.map((_, i) => `<td>${esc(row[i] ?? '')}</td>`).join('')}</tr>`)
    .join('');
  return `${title ? `<p class="list-title">${esc(title)}</p>` : ''}<table><thead>${head}</thead><tbody>${body}</tbody></table>`;
}
