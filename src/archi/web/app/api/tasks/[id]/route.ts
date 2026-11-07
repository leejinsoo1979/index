import { NextResponse } from 'next/server';
import { apiHandler, parseJsonBody } from '@archi-web/lib/api';
import { requireUser } from '@archi-web/lib/auth';
import { getTask, updateTask, updateTaskSchema } from '@archi-web/lib/services/tasks';

type Ctx = { params: Promise<{ id: string }> };

export const GET = apiHandler<Ctx>(async (_request, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  const task = await getTask(user.id, id);
  return NextResponse.json(task);
});

export const PATCH = apiHandler<Ctx>(async (request, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  const body = updateTaskSchema.parse(await parseJsonBody(request));
  const task = await updateTask(user.id, id, body);
  return NextResponse.json(task);
});
