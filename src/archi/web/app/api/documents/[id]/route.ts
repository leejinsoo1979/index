import { NextResponse } from 'next/server';
import { apiHandler, parseJsonBody } from '@archi-web/lib/api';
import { requireUser } from '@archi-web/lib/auth';
import { getDocument, updateDocument, updateDocumentSchema } from '@archi-web/lib/services/documents';

type Ctx = { params: Promise<{ id: string }> };

export const GET = apiHandler<Ctx>(async (_request, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  const document = await getDocument(user.id, id);
  return NextResponse.json(document);
});

export const PATCH = apiHandler<Ctx>(async (request, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  const body = updateDocumentSchema.parse(await parseJsonBody(request));
  const document = await updateDocument(user.id, id, body);
  return NextResponse.json(document);
});
