import { prisma } from '@archi/db';
import { Capabilities } from '@archi/shared';
import { requireWorkspaceCapability } from '../authz';

/** 사용자 대시보드 집계: 현황 카운트 + 최근 문서 + 진행 중 업무 */
export async function getDashboard(userId: string, workspaceId: string) {
  await requireWorkspaceCapability(userId, workspaceId, Capabilities.VIEW_DOCUMENTS);

  const [
    projectCount,
    documentCount,
    openTaskCount,
    nodeCount,
    candidateNodeCount,
    approvedSourceCount,
    recentDocuments,
    openTasks,
  ] = await Promise.all([
    prisma.project.count({ where: { workspaceId } }),
    prisma.document.count({ where: { project: { workspaceId } } }),
    prisma.task.count({
      where: { workspaceId, status: { in: ['QUEUED', 'RUNNING', 'BLOCKED', 'NEEDS_REVIEW'] } },
    }),
    prisma.ontologyNode.count({ where: { workspaceId, status: { in: ['CANDIDATE', 'APPROVED'] } } }),
    prisma.ontologyNode.count({ where: { workspaceId, status: 'CANDIDATE' } }),
    prisma.knowledgeSource.count({ where: { workspaceId, status: 'APPROVED' } }),
    prisma.document.findMany({
      where: { project: { workspaceId } },
      orderBy: { updatedAt: 'desc' },
      take: 6,
      select: {
        id: true,
        title: true,
        type: true,
        status: true,
        updatedAt: true,
        project: { select: { id: true, name: true } },
        _count: { select: { blocks: true } },
      },
    }),
    prisma.task.findMany({
      where: { workspaceId, status: { in: ['QUEUED', 'RUNNING', 'BLOCKED', 'NEEDS_REVIEW'] } },
      orderBy: { updatedAt: 'desc' },
      take: 5,
      select: {
        id: true,
        title: true,
        status: true,
        assigneeAgent: true,
        outputDocumentId: true,
      },
    }),
  ]);

  return {
    counts: {
      projects: projectCount,
      documents: documentCount,
      openTasks: openTaskCount,
      ontologyNodes: nodeCount,
      candidateNodes: candidateNodeCount,
      approvedSources: approvedSourceCount,
    },
    recentDocuments,
    openTasks,
  };
}
