import { prisma } from '@archi/db';
import { getExporter, type DocumentForExport, type ExportFormat } from '@archi/export';
import { AppError, Capabilities, ErrorCodes } from '@archi/shared';
import { z } from 'zod';
import { requireDocumentCapability } from '../authz';
import { writeAuditLog } from '../audit';
import { loadKoreanFontBytes, saveStorageFile, storageFileUrl } from '../storage';

export const createExportSchema = z.object({
  documentId: z.string().min(1),
  format: z.enum(['txt', 'markdown', 'pdf', 'docx', 'html', 'json']),
});

const FORMAT_TO_DB: Record<
  'txt' | 'markdown' | 'pdf' | 'docx' | 'html' | 'json',
  'TXT' | 'MARKDOWN' | 'PDF' | 'DOCX' | 'HTML' | 'JSON'
> = {
  txt: 'TXT',
  markdown: 'MARKDOWN',
  pdf: 'PDF',
  docx: 'DOCX',
  html: 'HTML',
  json: 'JSON',
};

/**
 * Export job 생성 + 동기 실행 (MVP).
 * 대용량/대량 export가 필요해지면 queue worker로 이전한다.
 */
export async function createExport(userId: string, input: z.infer<typeof createExportSchema>) {
  await requireDocumentCapability(userId, input.documentId, Capabilities.EXPORT_DOCUMENTS);

  const document = await prisma.document.findUnique({
    where: { id: input.documentId },
    include: { blocks: { orderBy: { sortOrder: 'asc' } } },
  });
  if (!document) {
    throw new AppError(ErrorCodes.NOT_FOUND, { message: '문서를 찾을 수 없습니다.' });
  }

  const job = await prisma.exportJob.create({
    data: { documentId: input.documentId, format: FORMAT_TO_DB[input.format], status: 'RUNNING' },
  });

  try {
    const exporter = getExporter(input.format as ExportFormat);
    const docForExport: DocumentForExport = {
      id: document.id,
      title: document.title,
      blocks: document.blocks.map((b) => ({
        id: b.id,
        type: b.type,
        sortOrder: b.sortOrder,
        content: b.content as Record<string, unknown>,
        parentId: b.parentId,
      })),
    };
    const fontBytes = input.format === 'pdf' ? await loadKoreanFontBytes() : undefined;
    const result = await exporter.export(docForExport, { fontBytes });

    const fileKey = `exports/${job.id}/${result.filename}`;
    await saveStorageFile(fileKey, result.data);

    const done = await prisma.exportJob.update({
      where: { id: job.id },
      data: {
        status: 'DONE',
        fileKey,
        filename: result.filename,
        mimeType: result.mimeType,
        completedAt: new Date(),
      },
    });
    await writeAuditLog({
      actorId: userId,
      action: 'export.create',
      targetType: 'ExportJob',
      targetId: job.id,
      after: { format: input.format, fileKey },
    });
    return {
      jobId: done.id,
      status: done.status,
      filename: done.filename,
      downloadUrl: await storageFileUrl(fileKey),
    };
  } catch (error) {
    await prisma.exportJob.update({
      where: { id: job.id },
      data: { status: 'FAILED', error: error instanceof Error ? error.message : String(error) },
    });
    throw new AppError(ErrorCodes.INTERNAL_ERROR, {
      message: '내보내기에 실패했습니다. 잠시 후 다시 시도해 주세요.',
    });
  }
}

export async function getExportJob(userId: string, jobId: string) {
  const job = await prisma.exportJob.findUnique({ where: { id: jobId } });
  if (!job) {
    throw new AppError(ErrorCodes.NOT_FOUND, { message: '내보내기 작업을 찾을 수 없습니다.' });
  }
  await requireDocumentCapability(userId, job.documentId, Capabilities.VIEW_DOCUMENTS);
  return {
    jobId: job.id,
    status: job.status,
    format: job.format,
    filename: job.filename,
    downloadUrl: job.status === 'DONE' && job.fileKey ? await storageFileUrl(job.fileKey) : null,
    error: job.error,
  };
}

export async function getExportFile(userId: string, jobId: string) {
  const job = await prisma.exportJob.findUnique({ where: { id: jobId } });
  if (!job || job.status !== 'DONE' || !job.fileKey) {
    throw new AppError(ErrorCodes.NOT_FOUND, { message: '다운로드할 파일이 없습니다.' });
  }
  await requireDocumentCapability(userId, job.documentId, Capabilities.VIEW_DOCUMENTS);
  return job;
}
