import { NextResponse } from 'next/server';
import { apiHandler } from '@archi-web/lib/api';
import { requireUser } from '@archi-web/lib/auth';
import { rejectAction } from '@archi-web/lib/services/agent';

type Ctx = { params: Promise<{ id: string }> };

export const POST = apiHandler<Ctx>(async (_request, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  const result = await rejectAction(user.id, id);
  return NextResponse.json(result);
});
