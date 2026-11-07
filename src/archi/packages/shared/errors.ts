/** 모든 API 실패 응답의 표준 구조: { code, message, details } */
export type ApiError = {
  code: string;
  message: string;
  details?: unknown;
};

export const ErrorCodes = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

/** 사용자에게 노출되는 한국어 기본 에러 메시지 */
export const ErrorMessages: Record<ErrorCode, string> = {
  UNAUTHORIZED: '로그인이 필요합니다.',
  FORBIDDEN: '이 작업을 수행할 권한이 없습니다.',
  NOT_FOUND: '요청한 리소스를 찾을 수 없습니다.',
  VALIDATION_FAILED: '입력값이 올바르지 않습니다.',
  CONFLICT: '이미 존재하는 리소스입니다.',
  RATE_LIMITED: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',
  INTERNAL_ERROR: '일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: ErrorCode, options?: { message?: string; status?: number; details?: unknown }) {
    super(options?.message ?? ErrorMessages[code]);
    this.code = code;
    this.status = options?.status ?? AppError.defaultStatus(code);
    this.details = options?.details;
  }

  static defaultStatus(code: ErrorCode): number {
    switch (code) {
      case 'UNAUTHORIZED':
        return 401;
      case 'FORBIDDEN':
        return 403;
      case 'NOT_FOUND':
        return 404;
      case 'VALIDATION_FAILED':
        return 400;
      case 'CONFLICT':
        return 409;
      case 'RATE_LIMITED':
        return 429;
      default:
        return 500;
    }
  }

  toJSON(): ApiError {
    return { code: this.code, message: this.message, details: this.details };
  }
}
