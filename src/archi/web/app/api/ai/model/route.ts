import { NextResponse } from 'next/server';
import { AppError, ErrorCodes } from '@archi/shared';
import { apiHandler, parseJsonBody } from '@archi-web/lib/api';
import { requireUser } from '@archi-web/lib/auth';
import { getChatModelOptions, setChatModel, setChatModelSchema } from '@archi-web/lib/services/llm-config';

/** GET /api/ai/model?documentId= — 현재 활성 모델 + 등록된 후보 (채팅 셀렉터용) */
export const GET = apiHandler(async (request) => {
  const user = await requireUser();
  const documentId = new URL(request.url).searchParams.get('documentId');
  if (!documentId) {
    throw new AppError(ErrorCodes.VALIDATION_FAILED, { message: 'documentId가 필요합니다.' });
  }
  const result = await getChatModelOptions(user.id, documentId);
  return NextResponse.json(result);
});

/** POST /api/ai/model?documentId= — 모델 변경 */
export const POST = apiHandler(async (request) => {
  const user = await requireUser();
  const documentId = new URL(request.url).searchParams.get('documentId');
  if (!documentId) {
    throw new AppError(ErrorCodes.VALIDATION_FAILED, { message: 'documentId가 필요합니다.' });
  }
  const body = setChatModelSchema.parse(await parseJsonBody(request));
  const result = await setChatModel(user.id, documentId, body);
  return NextResponse.json(result);
});
