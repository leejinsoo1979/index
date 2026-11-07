import { apiHandler } from '@archi-web/lib/api';
import { requireUser } from '@archi-web/lib/auth';
import { getExportFile } from '@archi-web/lib/services/exports';
import { readStorageFile } from '@archi-web/lib/storage';

type Ctx = { params: Promise<{ id: string }> };

export const GET = apiHandler<Ctx>(async (_request, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  const job = await getExportFile(user.id, id);
  const data = await readStorageFile(job.fileKey as string);
  return new Response(new Uint8Array(data), {
    headers: {
      'Content-Type': job.mimeType ?? 'application/octet-stream',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(job.filename ?? 'document')}`,
    },
  });
});
