import { type DocumentForExport, type ExportResult, type Exporter, safeFilename } from './types';

/**
 * JSON exporter. 문서를 구조화된 JSON으로 직렬화한다 (연동/백업/재가공용).
 * 블록 순서(sortOrder)를 보존하고 type/content를 그대로 담는다.
 */
export class JsonExporter implements Exporter {
  readonly format = 'json' as const;

  async export(document: DocumentForExport): Promise<ExportResult> {
    const payload = {
      schemaVersion: 1,
      id: document.id,
      title: document.title,
      exportedFormat: 'json' as const,
      blocks: document.blocks
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((b) => ({
          id: b.id,
          type: b.type,
          sortOrder: b.sortOrder,
          parentId: b.parentId ?? null,
          content: b.content,
        })),
    };
    const text = JSON.stringify(payload, null, 2);
    return {
      filename: safeFilename(document.title, 'json'),
      mimeType: 'application/json; charset=utf-8',
      data: new TextEncoder().encode(text),
    };
  }
}
