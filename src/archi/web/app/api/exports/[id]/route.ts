import { NextResponse } from 'next/server';
import { apiHandler } from '@archi-web/lib/api';
import { requireUser } from '@archi-web/lib/auth';
import { getExportJob } from '@archi-web/lib/services/exports';

type Ctx = { params: Promise<{ id: string }> };

export const GET = apiHandler<Ctx>(async (_request, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  const job = await getExportJob(user.id, id);
  return NextResponse.json(job);
});
