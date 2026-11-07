import { NextResponse } from 'next/server';
import { apiHandler } from '@archi-web/lib/api';
import { requireUser } from '@archi-web/lib/auth';
import { approveKnowledgeSource } from '@archi-web/lib/services/knowledge';

type Ctx = { params: Promise<{ id: string }> };

export const POST = apiHandler<Ctx>(async (_request, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  const source = await approveKnowledgeSource(user.id, id);
  return NextResponse.json(source);
});
