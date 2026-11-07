import { prisma, type Prisma } from '@archi/db';
import { AppError, Capabilities, ErrorCodes } from '@archi/shared';
import { z } from 'zod';
import { requireWorkspaceCapability } from '../authz';
import { writeAuditLog } from '../audit';

export const createTaskSchema = z.object({
  workspaceId: z.string().min(1),
  projectId: z.string().optional(),
  title: z.string().min(1, '업무 제목을 입력해 주세요.').max(300),
  description: z.string().max(4000).optional(),
  assigneeAgent: z.string().max(100).optional(),
  requiresReview: z.boolean().default(true),
  channelMessageId: z.string().optional(),
});

const TASK_STATUSES = [
  'QUEUED',
  'RUNNING',
  'BLOCKED',
  'NEEDS_REVIEW',
  'DONE',
  'FAILED',
  'CANCELED',
] as const;

export const updateTaskSchema = z.object({
  status: z.enum(TASK_STATUSES).optional(),
  outputDocumentId: z.string().nullable().optional(),
  output: z.record(z.unknown()).optional(),
});

export async function createTask(userId: string, input: z.infer<typeof createTaskSchema>) {
  await requireWorkspaceCapability(userId, input.workspaceId, Capabilities.MANAGE_TASKS);
  const task = await prisma.task.create({
    data: {
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      title: input.title,
      description: input.description,
      assigneeAgent: input.assigneeAgent,
      requiresReview: input.requiresReview,
      channelMessageId: input.channelMessageId,
      events: {
        create: {
          type: 'created',
          payload: { by: userId, assigneeAgent: input.assigneeAgent } as Prisma.InputJsonValue,
        },
      },
    },
    include: { events: true },
  });
  await writeAuditLog({
    actorId: userId,
    action: 'task.create',
    targetType: 'Task',
    targetId: task.id,
    after: { title: task.title, assigneeAgent: task.assigneeAgent },
  });
  return task;
}

export async function listTasks(userId: string, workspaceId: string) {
  await requireWorkspaceCapability(userId, workspaceId, Capabilities.VIEW_DOCUMENTS);
  return prisma.task.findMany({
    where: { workspaceId },
    orderBy: { updatedAt: 'desc' },
    take: 100,
  });
}

export async function getTask(userId: string, taskId: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { events: { orderBy: { createdAt: 'asc' } } },
  });
  if (!task) {
    throw new AppError(ErrorCodes.NOT_FOUND, { message: '업무를 찾을 수 없습니다.' });
  }
  await requireWorkspaceCapability(userId, task.workspaceId, Capabilities.VIEW_DOCUMENTS);
  return task;
}

export async function updateTask(
  userId: string,
  taskId: string,
  input: z.infer<typeof updateTaskSchema>,
) {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) {
    throw new AppError(ErrorCodes.NOT_FOUND, { message: '업무를 찾을 수 없습니다.' });
  }
  await requireWorkspaceCapability(userId, task.workspaceId, Capabilities.MANAGE_TASKS);

  // 산출물 문서 연결 시 같은 워크스페이스 문서인지 확인
  if (input.outputDocumentId) {
    const document = await prisma.document.findUnique({
      where: { id: input.outputDocumentId },
      select: { project: { select: { workspaceId: true } } },
    });
    if (!document || document.project.workspaceId !== task.workspaceId) {
      throw new AppError(ErrorCodes.VALIDATION_FAILED, {
        message: '연결하려는 문서를 찾을 수 없거나 다른 워크스페이스의 문서입니다.',
      });
    }
  }

  const updated = await prisma.task.update({
    where: { id: taskId },
    data: {
      status: input.status,
      outputDocumentId: input.outputDocumentId,
      output: input.output as Prisma.InputJsonValue | undefined,
    },
  });

  const events: Prisma.TaskEventCreateManyInput[] = [];
  if (input.status && input.status !== task.status) {
    events.push({
      taskId,
      type: 'status_change',
      payload: { from: task.status, to: input.status, by: userId },
    });
  }
  if (input.outputDocumentId && input.outputDocumentId !== task.outputDocumentId) {
    events.push({
      taskId,
      type: 'output_linked',
      payload: { documentId: input.outputDocumentId, by: userId },
    });
  }
  if (events.length > 0) {
    await prisma.taskEvent.createMany({ data: events });
  }

  await writeAuditLog({
    actorId: userId,
    action: 'task.update',
    targetType: 'Task',
    targetId: taskId,
    before: { status: task.status, outputDocumentId: task.outputDocumentId },
    after: { status: updated.status, outputDocumentId: updated.outputDocumentId },
  });
  return updated;
}
