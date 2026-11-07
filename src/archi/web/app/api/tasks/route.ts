import { NextResponse } from 'next/server';
import { AppError, ErrorCodes } from '@archi/shared';
import { apiHandler, parseJsonBody } from '@archi-web/lib/api';
import { requireUser } from '@archi-web/lib/auth';
import { createTask, createTaskSchema, listTasks } from '@archi-web/lib/services/tasks';

export const GET = apiHandler(async (request) => {
  const user = await requireUser();
  const workspaceId = new URL(request.url).searchParams.get('workspaceId');
  if (!workspaceId) {
    throw new AppError(ErrorCodes.VALIDATION_FAILED, { message: 'workspaceId가 필요합니다.' });
  }
  const tasks = await listTasks(user.id, workspaceId);
  return NextResponse.json({ tasks });
});

export const POST = apiHandler(async (request) => {
  const user = await requireUser();
  const body = createTaskSchema.parse(await parseJsonBody(request));
  const task = await createTask(user.id, body);
  return NextResponse.json(task, { status: 201 });
});
