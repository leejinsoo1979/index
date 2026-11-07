import { NextResponse } from 'next/server';
import { AppError, ErrorCodes } from '@archi/shared';
import { apiHandler, parseJsonBody } from '@archi-web/lib/api';
import { requireUser } from '@archi-web/lib/auth';
import {
  listLlmConfigs,
  registerLlmConfig,
  registerLlmConfigSchema,
} from '@archi-web/lib/services/llm-config';

export const GET = apiHandler(async (request) => {
  const user = await requireUser();
  const workspaceId = new URL(request.url).searchParams.get('workspaceId');
  if (!workspaceId) {
    throw new AppError(ErrorCodes.VALIDATION_FAILED, { message: 'workspaceId가 필요합니다.' });
  }
  const configs = await listLlmConfigs(user.id, workspaceId);
  return NextResponse.json({ configs });
});

export const POST = apiHandler(async (request) => {
  const user = await requireUser();
  const body = registerLlmConfigSchema.parse(await parseJsonBody(request));
  const config = await registerLlmConfig(user.id, body);
  return NextResponse.json(config, { status: 201 });
});
