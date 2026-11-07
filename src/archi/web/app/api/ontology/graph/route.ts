import { NextResponse } from 'next/server';
import { AppError, ErrorCodes } from '@archi/shared';
import { apiHandler } from '@archi-web/lib/api';
import { requireUser } from '@archi-web/lib/auth';
import { getGraph } from '@archi-web/lib/services/ontology';

export const GET = apiHandler(async (request) => {
  const user = await requireUser();
  const url = new URL(request.url);
  const workspaceId = url.searchParams.get('workspaceId');
  if (!workspaceId) {
    throw new AppError(ErrorCodes.VALIDATION_FAILED, { message: 'workspaceId가 필요합니다.' });
  }
  const status = (url.searchParams.get('status') ?? 'all') as 'approved' | 'candidate' | 'all';
  const graph = await getGraph(user.id, workspaceId, status);
  return NextResponse.json(graph);
});
