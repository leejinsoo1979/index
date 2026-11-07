import { NextResponse } from 'next/server';
import { AppError, ErrorCodes } from '@archi/shared';
import { apiHandler } from '@archi-web/lib/api';
import { requireUser } from '@archi-web/lib/auth';
import { listAvailableModels } from '@archi-web/lib/services/llm-config';

/** GET /api/settings/llm/models?workspaceId=&provider= — provider 모델 목록 (라이브 또는 폴백) */
export const GET = apiHandler(async (request) => {
  const user = await requireUser();
  const url = new URL(request.url);
  const workspaceId = url.searchParams.get('workspaceId');
  const provider = url.searchParams.get('provider');
  if (!workspaceId || !provider) {
    throw new AppError(ErrorCodes.VALIDATION_FAILED, {
      message: 'workspaceId와 provider가 필요합니다.',
    });
  }
  if (
    provider !== 'openai' &&
    provider !== 'anthropic' &&
    provider !== 'google' &&
    provider !== 'grok'
  ) {
    throw new AppError(ErrorCodes.VALIDATION_FAILED, { message: '지원하지 않는 provider 입니다.' });
  }
  const result = await listAvailableModels(user.id, workspaceId, provider);
  return NextResponse.json(result);
});
