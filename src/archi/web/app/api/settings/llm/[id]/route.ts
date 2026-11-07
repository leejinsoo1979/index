import { NextResponse } from 'next/server';
import { apiHandler } from '@archi-web/lib/api';
import { requireUser } from '@archi-web/lib/auth';
import { deleteLlmConfig } from '@archi-web/lib/services/llm-config';

type Ctx = { params: Promise<{ id: string }> };

export const DELETE = apiHandler<Ctx>(async (_request, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  const result = await deleteLlmConfig(user.id, id);
  return NextResponse.json(result);
});
