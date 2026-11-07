export * from './types';
export * from './txt';
export * from './markdown';
export * from './pdf';
export * from './docx';
export * from './html';
export * from './json';

import type { Exporter, ExportFormat } from './types';
import { TxtExporter } from './txt';
import { MarkdownExporter } from './markdown';
import { PdfExporter } from './pdf';
import { DocxExporter } from './docx';
import { HtmlExporter } from './html';
import { JsonExporter } from './json';

export function getExporter(format: ExportFormat): Exporter {
  switch (format) {
    case 'txt':
      return new TxtExporter();
    case 'markdown':
      return new MarkdownExporter();
    case 'pdf':
      return new PdfExporter();
    case 'docx':
      return new DocxExporter();
    case 'html':
      return new HtmlExporter();
    case 'json':
      return new JsonExporter();
  }
}
