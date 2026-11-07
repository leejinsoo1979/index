import { prisma, type Prisma } from '@archi/db';
import { getProfessionalTemplate, getTemplateBlocks, flattenTemplate, type DocumentTypeKey } from '@archi/editor';
import { AppError, Capabilities, ErrorCodes } from '@archi/shared';
import { z } from 'zod';
import { requireDocumentCapability, requireProjectCapability } from '../authz';
import { writeAuditLog } from '../audit';

export const createDocumentSchema = z.object({
  projectId: z.string().min(1),
  title: z.string().min(1, '문서 제목을 입력해 주세요.').max(300),
  type: z
    .enum(['BLOG_POST', 'PROPOSAL', 'REPORT', 'SNS_CAPTION', 'KNOWLEDGE_NOTE'])
    .default('BLOG_POST'),
  /** true면 문서 유형에 맞는 블록 템플릿으로 초기 구조를 구성한다 */
  withTemplate: z.boolean().default(false),
  /** 전문 템플릿 id (container 기반 구조화 문서). 지정 시 type은 템플릿의 documentType을 따른다. */
  templateId: z.string().optional(),
});

export const updateDocumentSchema = z.object({
  title: z.string().min(1, '문서 제목을 입력해 주세요.').max(300).optional(),
  status: z.enum(['DRAFT', 'NEEDS_REVIEW', 'APPROVED', 'ARCHIVED']).optional(),
});

export async function createDocument(
  userId: string,
  rawInput: z.input<typeof createDocumentSchema>,
) {
  const input = createDocumentSchema.parse(rawInput);
  await requireProjectCapability(userId, input.projectId, Capabilities.EDIT_DOCUMENTS);

  // 전문 템플릿: container 자식 관계(parentId)가 필요하므로 블록을 순차 생성한다.
  const professional = input.templateId ? getProfessionalTemplate(input.templateId) : undefined;
  if (professional) {
    const flat = flattenTemplate(professional.nodes);
    const document = await prisma.document.create({
      data: { projectId: input.projectId, title: input.title, type: professional.documentType },
    });
    const dbIds: string[] = [];
    for (let i = 0; i < flat.length; i++) {
      const { block, parentIndex } = flat[i]!;
      const created = await prisma.documentBlock.create({
        data: {
          documentId: document.id,
          parentId: parentIndex != null ? dbIds[parentIndex]! : null,
          type: block.type,
          sortOrder: i,
          content: block.content as Prisma.InputJsonValue,
          metadata: (block.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
        },
      });
      dbIds[i] = created.id;
    }
    await writeAuditLog({
      actorId: userId,
      action: 'document.create',
      targetType: 'Document',
      targetId: document.id,
      after: { title: document.title, type: document.type, template: professional.id },
    });
    return prisma.document.findUniqueOrThrow({
      where: { id: document.id },
      include: { blocks: { orderBy: { sortOrder: 'asc' } } },
    });
  }

  const templateBlocks = input.withTemplate
    ? getTemplateBlocks(input.type as DocumentTypeKey)
    : [];
  const document = await prisma.document.create({
    data: {
      projectId: input.projectId,
      title: input.title,
      type: input.type,
      blocks: {
        create: templateBlocks.map((block, index) => ({
          type: block.type,
          sortOrder: index,
          content: block.content as Prisma.InputJsonValue,
          metadata: (block.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
        })),
      },
    },
    include: { blocks: { orderBy: { sortOrder: 'asc' } } },
  });
  await writeAuditLog({
    actorId: userId,
    action: 'document.create',
    targetType: 'Document',
    targetId: document.id,
    after: { title: document.title, type: document.type },
  });
  return document;
}

export async function getDocument(userId: string, documentId: string) {
  await requireDocumentCapability(userId, documentId, Capabilities.VIEW_DOCUMENTS);
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    include: { blocks: { orderBy: { sortOrder: 'asc' } } },
  });
  if (!document) {
    throw new AppError(ErrorCodes.NOT_FOUND, { message: '문서를 찾을 수 없습니다.' });
  }
  return document;
}

export async function updateDocument(
  userId: string,
  documentId: string,
  input: z.infer<typeof updateDocumentSchema>,
) {
  await requireDocumentCapability(userId, documentId, Capabilities.EDIT_DOCUMENTS);
  const before = await prisma.document.findUnique({
    where: { id: documentId },
    select: { title: true, status: true },
  });
  const document = await prisma.document.update({
    where: { id: documentId },
    data: input,
    include: { blocks: { orderBy: { sortOrder: 'asc' } } },
  });
  await writeAuditLog({
    actorId: userId,
    action: 'document.update',
    targetType: 'Document',
    targetId: documentId,
    before: before ?? undefined,
    after: { title: document.title, status: document.status },
  });
  return document;
}

export async function listDocuments(userId: string, projectId: string) {
  await requireProjectCapability(userId, projectId, Capabilities.VIEW_DOCUMENTS);
  return prisma.document.findMany({
    where: { projectId },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, title: true, type: true, status: true, updatedAt: true },
  });
}
