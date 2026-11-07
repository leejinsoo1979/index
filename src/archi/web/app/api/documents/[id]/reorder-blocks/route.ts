import { NextResponse } from 'next/server';
import { apiHandler, parseJsonBody } from '@archi-web/lib/api';
import { requireUser } from '@archi-web/lib/auth';
import { reorderBlocks, reorderBlocksSchema } from '@archi-web/lib/services/blocks';

type Ctx = { params: Promise<{ id: string }> };

export const POST = apiHandler<Ctx>(async (request, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  const body = reorderBlocksSchema.parse(await parseJsonBody(request));
  const blocks = await reorderBlocks(user.id, id, body);
  return NextResponse.json({ blocks });
});
