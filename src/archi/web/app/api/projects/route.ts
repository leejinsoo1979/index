import { NextResponse } from 'next/server';
import { AppError, ErrorCodes } from '@archi/shared';
import { apiHandler, parseJsonBody } from '@archi-web/lib/api';
import { requireUser } from '@archi-web/lib/auth';
import { createProject, createProjectSchema, listProjects } from '@archi-web/lib/services/projects';

export const GET = apiHandler(async (request) => {
  const user = await requireUser();
  const workspaceId = new URL(request.url).searchParams.get('workspaceId');
  if (!workspaceId) {
    throw new AppError(ErrorCodes.VALIDATION_FAILED, { message: 'workspaceId가 필요합니다.' });
  }
  const projects = await listProjects(user.id, workspaceId);
  return NextResponse.json({ projects });
});

export const POST = apiHandler(async (request) => {
  const user = await requireUser();
  const body = createProjectSchema.parse(await parseJsonBody(request));
  const project = await createProject(user.id, body);
  return NextResponse.json(project, { status: 201 });
});
