import { NextResponse } from 'next/server';
import { AppError, ErrorCodes } from '@archi/shared';
import { apiHandler } from '@archi-web/lib/api';
import { requireUser } from '@archi-web/lib/auth';
import { getDashboard } from '@archi-web/lib/services/dashboard';

export const GET = apiHandler(async (request) => {
  const user = await requireUser();
  const workspaceId = new URL(request.url).searchParams.get('workspaceId');
  if (!workspaceId) {
    throw new AppError(ErrorCodes.VALIDATION_FAILED, { message: 'workspaceId가 필요합니다.' });
  }
  const dashboard = await getDashboard(user.id, workspaceId);
  return NextResponse.json(dashboard);
});
