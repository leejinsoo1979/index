import { prisma, type Membership } from '@archi/db';
import { AppError, ErrorCodes, roleHasCapability, type Capability, type Role } from '@archi/shared';

/**
 * Workspace 권한 체크 헬퍼.
 * 모든 workspace/project API는 이 헬퍼를 통해 권한을 검증해야 한다 (CLAUDE.md 규칙 9).
 */
export async function getWorkspaceMembership(
  userId: string,
  workspaceId: string,
): Promise<Membership | null> {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { organizationId: true },
  });
  if (!workspace) return null;
  return prisma.membership.findUnique({
    where: { userId_organizationId: { userId, organizationId: workspace.organizationId } },
  });
}

/** workspace 접근 + capability 검증. 실패 시 404/403 AppError */
export async function requireWorkspaceCapability(
  userId: string,
  workspaceId: string,
  capability: Capability,
): Promise<{ role: Role }> {
  const membership = await getWorkspaceMembership(userId, workspaceId);
  if (!membership) {
    throw new AppError(ErrorCodes.NOT_FOUND, {
      message: '워크스페이스를 찾을 수 없거나 접근 권한이 없습니다.',
    });
  }
  const role = membership.role as Role;
  if (!roleHasCapability(role, capability)) {
    throw new AppError(ErrorCodes.FORBIDDEN);
  }
  return { role };
}

/** projectId 기준 workspace 권한 검증 */
export async function requireProjectCapability(
  userId: string,
  projectId: string,
  capability: Capability,
): Promise<{ workspaceId: string; role: Role }> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { workspaceId: true },
  });
  if (!project) {
    throw new AppError(ErrorCodes.NOT_FOUND, { message: '프로젝트를 찾을 수 없습니다.' });
  }
  const { role } = await requireWorkspaceCapability(userId, project.workspaceId, capability);
  return { workspaceId: project.workspaceId, role };
}

/** documentId 기준 workspace 권한 검증 */
export async function requireDocumentCapability(
  userId: string,
  documentId: string,
  capability: Capability,
): Promise<{ projectId: string; workspaceId: string; role: Role }> {
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    select: { projectId: true, project: { select: { workspaceId: true } } },
  });
  if (!document) {
    throw new AppError(ErrorCodes.NOT_FOUND, { message: '문서를 찾을 수 없습니다.' });
  }
  const { role } = await requireWorkspaceCapability(
    userId,
    document.project.workspaceId,
    capability,
  );
  return { projectId: document.projectId, workspaceId: document.project.workspaceId, role };
}
