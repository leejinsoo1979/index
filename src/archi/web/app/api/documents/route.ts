import { NextResponse } from 'next/server';
import { AppError, ErrorCodes } from '@archi/shared';
import { apiHandler, parseJsonBody } from '@archi-web/lib/api';
import { requireUser } from '@archi-web/lib/auth';
import { createDocument, createDocumentSchema, listDocuments } from '@archi-web/lib/services/documents';

export const GET = apiHandler(async (request) => {
  const user = await requireUser();
  const projectId = new URL(request.url).searchParams.get('projectId');
  if (!projectId) {
    throw new AppError(ErrorCodes.VALIDATION_FAILED, { message: 'projectId가 필요합니다.' });
  }
  const documents = await listDocuments(user.id, projectId);
  return NextResponse.json({ documents });
});

export const POST = apiHandler(async (request) => {
  const user = await requireUser();
  const body = createDocumentSchema.parse(await parseJsonBody(request));
  const document = await createDocument(user.id, body);
  return NextResponse.json(document, { status: 201 });
});
