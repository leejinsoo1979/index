import { NextResponse } from 'next/server';
import { apiHandler, parseJsonBody } from '@archi-web/lib/api';
import { requireUser } from '@archi-web/lib/auth';
import { deleteBlock, updateBlock, updateBlockSchema } from '@archi-web/lib/services/blocks';

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = apiHandler<Ctx>(async (request, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  const body = updateBlockSchema.parse(await parseJsonBody(request));
  const block = await updateBlock(user.id, id, body);
  return NextResponse.json(block);
});

export const DELETE = apiHandler<Ctx>(async (_request, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  const result = await deleteBlock(user.id, id);
  return NextResponse.json(result);
});
