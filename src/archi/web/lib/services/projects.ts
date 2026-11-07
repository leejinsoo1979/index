import { prisma } from '@archi/db';
import { Capabilities } from '@archi/shared';
import { z } from 'zod';
import { requireWorkspaceCapability } from '../authz';
import { writeAuditLog } from '../audit';

export const createProjectSchema = z.object({
  workspaceId: z.string().min(1),
  name: z.string().min(1, '프로젝트 이름을 입력해 주세요.').max(200),
  clientName: z.string().max(200).optional(),
  location: z.string().max(200).optional(),
});

export async function createProject(userId: string, input: z.infer<typeof createProjectSchema>) {
  await requireWorkspaceCapability(userId, input.workspaceId, Capabilities.EDIT_DOCUMENTS);
  const project = await prisma.project.create({
    data: {
      workspaceId: input.workspaceId,
      name: input.name,
      clientName: input.clientName,
      location: input.location,
    },
  });
  await writeAuditLog({
    actorId: userId,
    action: 'project.create',
    targetType: 'Project',
    targetId: project.id,
    after: { name: project.name },
  });
  return project;
}

export async function listProjects(userId: string, workspaceId: string) {
  await requireWorkspaceCapability(userId, workspaceId, Capabilities.VIEW_DOCUMENTS);
  return prisma.project.findMany({
    where: { workspaceId },
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { documents: true } } },
  });
}
