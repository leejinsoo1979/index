import { NextResponse } from 'next/server';
import { apiHandler, parseJsonBody } from '@archi-web/lib/api';
import { requireUser } from '@archi-web/lib/auth';
import { getNodeDetail, updateNode, updateNodeSchema } from '@archi-web/lib/services/ontology';

type Ctx = { params: Promise<{ id: string }> };

export const GET = apiHandler<Ctx>(async (_request, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  const detail = await getNodeDetail(user.id, id);
  return NextResponse.json(detail);
});

export const PATCH = apiHandler<Ctx>(async (request, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  const body = updateNodeSchema.parse(await parseJsonBody(request));
  const node = await updateNode(user.id, id, body);
  return NextResponse.json(node);
});
