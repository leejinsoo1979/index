import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { AppError, ErrorCodes, ErrorMessages } from '@archi/shared';
import { ServerProxyError } from './server-proxy';

/**
 * API route handler 공통 래퍼.
 * 실패 응답은 항상 { code, message, details } 구조 (API_SPEC.md 1장).
 */
export function toErrorResponse(error: unknown): NextResponse {
  if (error instanceof AppError) {
    return NextResponse.json(error.toJSON(), { status: error.status });
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        code: ErrorCodes.VALIDATION_FAILED,
        message: ErrorMessages.VALIDATION_FAILED,
        details: error.issues,
      },
      { status: 400 },
    );
  }
  if (error instanceof ServerProxyError) {
    // AI 서버 함수(api/archi-llm) 오류는 원인 메시지를 그대로 보여준다.
    return NextResponse.json(
      { code: ErrorCodes.INTERNAL_ERROR, message: error.message },
      { status: error.status >= 400 ? error.status : 502 },
    );
  }
  console.error('[api] unhandled error', error);
  return NextResponse.json(
    { code: ErrorCodes.INTERNAL_ERROR, message: ErrorMessages.INTERNAL_ERROR },
    { status: 500 },
  );
}

type Handler<Ctx> = (request: Request, context: Ctx) => Promise<NextResponse | Response>;

export function apiHandler<Ctx = unknown>(handler: Handler<Ctx>): Handler<Ctx> {
  return async (request, context) => {
    try {
      return await handler(request, context);
    } catch (error) {
      return toErrorResponse(error);
    }
  };
}

export async function parseJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new AppError(ErrorCodes.VALIDATION_FAILED, {
      message: '요청 본문이 올바른 JSON이 아닙니다.',
    });
  }
}
