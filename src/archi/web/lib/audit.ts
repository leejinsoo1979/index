import { prisma, type Prisma } from '@archi/db';

/** 민감한 mutation에 대한 감사 로그 기록 (ARCHITECTURE.md 9장) */
export async function writeAuditLog(input: {
  actorId?: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: input.actorId ?? null,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId ?? null,
        before: input.before,
        after: input.after,
      },
    });
  } catch (error) {
    // 감사 로그 실패가 본 작업을 막지 않도록 한다. 단, 콘솔에는 남긴다.
    console.error('[audit] 감사 로그 기록 실패', error);
  }
}
