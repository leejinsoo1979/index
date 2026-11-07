import { NextResponse } from 'next/server';
import { AppError, ErrorCodes } from '@archi/shared';
import { apiHandler } from '@archi-web/lib/api';
import { requireUser } from '@archi-web/lib/auth';
import { listKnowledgeSources, uploadKnowledgeSource } from '@archi-web/lib/services/knowledge';

export const GET = apiHandler(async (request) => {
  const user = await requireUser();
  const workspaceId = new URL(request.url).searchParams.get('workspaceId');
  if (!workspaceId) {
    throw new AppError(ErrorCodes.VALIDATION_FAILED, { message: 'workspaceId가 필요합니다.' });
  }
  const sources = await listKnowledgeSources(user.id, workspaceId);
  return NextResponse.json({ sources });
});

import { checkRateLimit } from '@archi-web/lib/rate-limit';

/** multipart/form-data: file, workspaceId, title? */
export const POST = apiHandler(async (request) => {
  const user = await requireUser();
  checkRateLimit(`kb-upload:${user.id}`, 10, 60_000);
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw new AppError(ErrorCodes.VALIDATION_FAILED, {
      message: 'multipart/form-data 형식이어야 합니다.',
    });
  }
  const file = form.get('file');
  const workspaceId = form.get('workspaceId');
  const title = form.get('title');
  if (!(file instanceof File) || typeof workspaceId !== 'string') {
    throw new AppError(ErrorCodes.VALIDATION_FAILED, {
      message: 'file과 workspaceId가 필요합니다.',
    });
  }
  const data = new Uint8Array(await file.arrayBuffer());
  const source = await uploadKnowledgeSource(user.id, {
    workspaceId,
    title: typeof title === 'string' ? title : undefined,
    filename: file.name,
    data,
  });
  return NextResponse.json(source, { status: 201 });
});
