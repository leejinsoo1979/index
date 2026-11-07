import { prisma, type Prisma } from '@archi/db';
import { extractFromUnits, type UnitExtraction } from '@archi/ontology';
import { AppError, Capabilities, ErrorCodes } from '@archi/shared';
import { z } from 'zod';
import { requireDocumentCapability, requireWorkspaceCapability } from '../authz';
import { writeAuditLog } from '../audit';
import { getLlmProviderForWorkspace } from './llm-config';

export const createNodeSchema = z.object({
  workspaceId: z.string().min(1),
  label: z.string().min(1, '노드 이름을 입력해 주세요.').max(200),
  type: z.string().min(1).max(50),
  description: z.string().max(2000).optional(),
  confidence: z.number().min(0).max(1).optional(),
});

export const updateNodeSchema = z.object({
  label: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  status: z.enum(['CANDIDATE', 'APPROVED', 'REJECTED', 'ARCHIVED']).optional(),
});

export const createEdgeSchema = z.object({
  workspaceId: z.string().min(1),
  sourceNodeId: z.string().min(1),
  targetNodeId: z.string().min(1),
  relationType: z.string().min(1).max(100),
  confidence: z.number().min(0).max(1).optional(),
});

/** 후보 노드 생성은 편집 권한이면 가능 (AI 추출 후보 포함) */
export async function createNode(userId: string, input: z.infer<typeof createNodeSchema>) {
  await requireWorkspaceCapability(userId, input.workspaceId, Capabilities.EDIT_DOCUMENTS);
  const node = await prisma.ontologyNode.create({
    data: {
      workspaceId: input.workspaceId,
      label: input.label,
      type: input.type,
      description: input.description,
      confidence: input.confidence,
      status: 'CANDIDATE',
    },
  });
  await writeAuditLog({
    actorId: userId,
    action: 'ontology_node.create',
    targetType: 'OntologyNode',
    targetId: node.id,
    after: { label: node.label, type: node.type },
  });
  return node;
}

/** 상태 변경(승인 등)은 EDIT_ONTOLOGY 권한 필요 — 관리자만 가능 */
export async function updateNode(
  userId: string,
  nodeId: string,
  input: z.infer<typeof updateNodeSchema>,
) {
  const node = await prisma.ontologyNode.findUnique({ where: { id: nodeId } });
  if (!node) {
    throw new AppError(ErrorCodes.NOT_FOUND, { message: '온톨로지 노드를 찾을 수 없습니다.' });
  }
  const capability = input.status ? Capabilities.EDIT_ONTOLOGY : Capabilities.EDIT_DOCUMENTS;
  await requireWorkspaceCapability(userId, node.workspaceId, capability);

  const updated = await prisma.ontologyNode.update({ where: { id: nodeId }, data: input });
  await writeAuditLog({
    actorId: userId,
    action: input.status ? 'ontology_node.status_change' : 'ontology_node.update',
    targetType: 'OntologyNode',
    targetId: nodeId,
    before: { status: node.status, label: node.label },
    after: { status: updated.status, label: updated.label },
  });
  return updated;
}

export async function createEdge(userId: string, input: z.infer<typeof createEdgeSchema>) {
  await requireWorkspaceCapability(userId, input.workspaceId, Capabilities.EDIT_DOCUMENTS);
  const [source, target] = await Promise.all([
    prisma.ontologyNode.findFirst({
      where: { id: input.sourceNodeId, workspaceId: input.workspaceId },
    }),
    prisma.ontologyNode.findFirst({
      where: { id: input.targetNodeId, workspaceId: input.workspaceId },
    }),
  ]);
  if (!source || !target) {
    throw new AppError(ErrorCodes.VALIDATION_FAILED, {
      message: '엣지의 양쪽 노드가 같은 워크스페이스에 있어야 합니다.',
    });
  }
  const edge = await prisma.ontologyEdge.create({
    data: {
      workspaceId: input.workspaceId,
      sourceNodeId: input.sourceNodeId,
      targetNodeId: input.targetNodeId,
      relationType: input.relationType,
      confidence: input.confidence,
      status: 'CANDIDATE',
    },
  });
  await writeAuditLog({
    actorId: userId,
    action: 'ontology_edge.create',
    targetType: 'OntologyEdge',
    targetId: edge.id,
    after: { relationType: edge.relationType },
  });
  return edge;
}

export async function getGraph(
  userId: string,
  workspaceId: string,
  statusFilter: 'approved' | 'candidate' | 'all' = 'all',
) {
  await requireWorkspaceCapability(userId, workspaceId, Capabilities.VIEW_DOCUMENTS);
  const statusWhere =
    statusFilter === 'all'
      ? { status: { in: ['CANDIDATE', 'APPROVED'] as ('CANDIDATE' | 'APPROVED')[] } }
      : { status: statusFilter === 'approved' ? ('APPROVED' as const) : ('CANDIDATE' as const) };

  const nodes = await prisma.ontologyNode.findMany({
    where: { workspaceId, ...statusWhere },
    orderBy: { createdAt: 'asc' },
  });
  const nodeIds = new Set(nodes.map((n) => n.id));
  const edges = await prisma.ontologyEdge.findMany({
    where: { workspaceId, status: { in: ['CANDIDATE', 'APPROVED'] } },
  });
  return {
    nodes,
    edges: edges.filter((e) => nodeIds.has(e.sourceNodeId) && nodeIds.has(e.targetNodeId)),
  };
}

const SAMPLE_NODES: { key: string; label: string; type: string; description: string }[] = [
  { key: 'living', label: '거실', type: 'space', description: '주요 생활 공간' },
  { key: 'bathroom', label: '욕실', type: 'space', description: '방수가 중요한 습식 공간' },
  { key: 'no_molding', label: '무몰딩', type: 'method', description: '몰딩 없이 면을 정리하는 마감 공법' },
  { key: 'waterproof', label: '도막방수', type: 'method', description: '욕실 바닥/벽 방수 공법' },
  { key: 'condensation', label: '결로', type: 'defect', description: '단열 불량 시 발생하는 하자' },
  { key: 'insulation', label: '단열재', type: 'material', description: '결로 방지 핵심 자재' },
  { key: 'firedoor', label: '방화문', type: 'material', description: '방화구획에 필요한 자재' },
  { key: 'fire_code', label: '건축법 방화규정', type: 'regulation', description: '방화구획·방화문 관련 법규' },
];

const SAMPLE_EDGES: { source: string; target: string; relation: string }[] = [
  { source: 'no_molding', target: 'living', relation: '적용 공간' },
  { source: 'waterproof', target: 'bathroom', relation: '적용 공간' },
  { source: 'insulation', target: 'condensation', relation: '예방' },
  { source: 'condensation', target: 'living', relation: '발생 위치' },
  { source: 'firedoor', target: 'fire_code', relation: '규제 근거' },
  { source: 'waterproof', target: 'condensation', relation: '관련 하자' },
];

/** 블록 content에서 추출 대상 텍스트를 뽑아낸다 */
function blockTextForExtraction(content: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const key of ['text', 'title', 'summary', 'caption', 'expression'] as const) {
    if (typeof content[key] === 'string') parts.push(content[key] as string);
  }
  if (Array.isArray(content.items)) {
    for (const item of content.items as Record<string, unknown>[]) {
      for (const key of ['text', 'question', 'answer', 'basis'] as const) {
        if (typeof item[key] === 'string') parts.push(item[key] as string);
      }
    }
  }
  return parts.join('\n');
}

type ExtractionStats = { nodesCreated: number; nodesLinked: number; edgesCreated: number };

const llmExtractionSchema = z.object({
  entities: z
    .array(
      z.object({
        label: z.string().min(1).max(60),
        type: z.enum(['space', 'method', 'material', 'defect', 'regulation']),
      }),
    )
    .max(40),
  relations: z
    .array(
      z.object({
        source: z.string().min(1),
        target: z.string().min(1),
        relation: z.string().min(1).max(30),
      }),
    )
    .max(60)
    .default([]),
});

function extractJsonObject(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced?.[1] ?? text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('LLM 응답에서 JSON을 찾지 못했습니다.');
  return candidate.slice(start, end + 1);
}

/**
 * 추출기 선택: 워크스페이스에 실제 LLM이 등록되어 있으면 LLM이 실제 내용에서
 * 엔티티/관계를 추출하고, 실패하거나 mock이면 도메인 사전 추출로 폴백한다.
 */
async function extractUnitsSmart(
  workspaceId: string,
  units: { unitId: string; text: string }[],
): Promise<UnitExtraction[]> {
  if (units.length === 0) return [];
  const provider = await getLlmProviderForWorkspace(workspaceId);
  if (provider.name === 'mock') return extractFromUnits(units);

  try {
    const text = units.map((u) => u.text).join('\n\n').slice(0, 8000);
    const result = await provider.generateText({
      system: [
        '너는 건축·인테리어 지식그래프 추출기다. 입력 텍스트에서 핵심 개념을 추출한다.',
        '반드시 JSON 객체 하나만 출력해라.',
        '형식: {"entities":[{"label":"결로","type":"defect"}],"relations":[{"source":"단열재","target":"결로","relation":"예방"}]}',
        'type은 space(공간)|method(공법)|material(자재)|defect(하자)|regulation(법규/기준)만 허용.',
        'label은 텍스트에 실제로 등장한 한국어 용어로, 최대 60자. 추측 금지.',
        'relations의 source/target은 entities의 label과 정확히 일치해야 한다.',
      ].join('\n'),
      prompt: text,
      maxTokens: 1500,
    });
    const parsed = llmExtractionSchema.parse(JSON.parse(extractJsonObject(result.text)));
    const labels = new Set(parsed.entities.map((e) => e.label));
    return [
      {
        unitId: units[0]!.unitId,
        entities: parsed.entities.map((e) => ({ label: e.label, type: e.type })),
        relations: parsed.relations
          .filter((r) => labels.has(r.source) && labels.has(r.target) && r.source !== r.target)
          .map((r) => ({ sourceLabel: r.source, targetLabel: r.target, relationType: r.relation })),
      },
    ];
  } catch (error) {
    console.warn('[ontology] LLM 추출 실패, 사전 추출로 폴백:', error);
    return extractFromUnits(units);
  }
}

/**
 * 추출 결과를 CANDIDATE 노드/엣지로 저장.
 * - 같은 라벨의 기존 노드가 있으면 새로 만들지 않고 연결(provenance만 추가)
 * - 모든 노드/엣지에 원본(documentId/blockId 또는 sourceId/chunkId)을 기록 (제안서: provenance)
 */
async function persistExtraction(
  workspaceId: string,
  units: { unitId: string; text: string }[],
  origin: { documentId?: string; sourceId?: string },
): Promise<ExtractionStats> {
  const extractions = await extractUnitsSmart(workspaceId, units);
  const stats: ExtractionStats = { nodesCreated: 0, nodesLinked: 0, edgesCreated: 0 };
  const nodeIdByLabel = new Map<string, string>();

  const existing = await prisma.ontologyNode.findMany({
    where: { workspaceId, status: { in: ['CANDIDATE', 'APPROVED'] } },
    select: { id: true, label: true },
  });
  for (const node of existing) nodeIdByLabel.set(node.label, node.id);

  for (const unit of extractions) {
    const provenance = { ...origin, unitId: unit.unitId };

    for (const entity of unit.entities) {
      const existingId = nodeIdByLabel.get(entity.label);
      if (existingId) {
        // 기존 노드에 provenance 누적
        const node = await prisma.ontologyNode.findUnique({ where: { id: existingId } });
        const meta = (node?.metadata as { sources?: unknown[] } | null) ?? {};
        const sources = Array.isArray(meta.sources) ? meta.sources : [];
        await prisma.ontologyNode.update({
          where: { id: existingId },
          data: {
            metadata: { ...meta, sources: [...sources, provenance].slice(-50) } as Prisma.InputJsonValue,
          },
        });
        stats.nodesLinked += 1;
        continue;
      }
      const created = await prisma.ontologyNode.create({
        data: {
          workspaceId,
          label: entity.label,
          type: entity.type,
          status: 'CANDIDATE',
          confidence: 0.7,
          metadata: { sources: [provenance] } as Prisma.InputJsonValue,
        },
      });
      nodeIdByLabel.set(entity.label, created.id);
      stats.nodesCreated += 1;
    }

    for (const relation of unit.relations) {
      const sourceNodeId = nodeIdByLabel.get(relation.sourceLabel);
      const targetNodeId = nodeIdByLabel.get(relation.targetLabel);
      if (!sourceNodeId || !targetNodeId) continue;
      const duplicate = await prisma.ontologyEdge.findFirst({
        where: { workspaceId, sourceNodeId, targetNodeId, relationType: relation.relationType },
      });
      if (duplicate) continue;
      await prisma.ontologyEdge.create({
        data: {
          workspaceId,
          sourceNodeId,
          targetNodeId,
          relationType: relation.relationType,
          status: 'CANDIDATE',
          confidence: 0.6,
          evidence: provenance as Prisma.InputJsonValue,
        },
      });
      stats.edgesCreated += 1;
    }
  }
  return stats;
}

/** 문서에서 온톨로지 후보 추출 (제안서: 생성→추출→연결→검수 파이프라인) */
export async function extractFromDocument(userId: string, documentId: string) {
  const { workspaceId } = await requireDocumentCapability(
    userId,
    documentId,
    Capabilities.EDIT_DOCUMENTS,
  );
  const blocks = await prisma.documentBlock.findMany({
    where: { documentId },
    orderBy: { sortOrder: 'asc' },
  });
  const units = blocks
    .map((b) => ({ unitId: b.id, text: blockTextForExtraction(b.content as Record<string, unknown>) }))
    .filter((u) => u.text.trim().length > 0);

  const stats = await persistExtraction(workspaceId, units, { documentId });
  await writeAuditLog({
    actorId: userId,
    action: 'ontology.extract_document',
    targetType: 'Document',
    targetId: documentId,
    after: stats,
  });
  return stats;
}

/** 지식 소스(청크)에서 온톨로지 후보 추출. KB 처리 파이프라인에서 자동 호출된다 */
export async function extractFromKnowledgeSource(userId: string, sourceId: string) {
  const source = await prisma.knowledgeSource.findUnique({ where: { id: sourceId } });
  if (!source) {
    throw new AppError(ErrorCodes.NOT_FOUND, { message: '지식 소스를 찾을 수 없습니다.' });
  }
  await requireWorkspaceCapability(userId, source.workspaceId, Capabilities.EDIT_DOCUMENTS);
  const chunks = await prisma.knowledgeChunk.findMany({
    where: { sourceId },
    select: { id: true, text: true },
  });
  const stats = await persistExtraction(
    source.workspaceId,
    chunks.map((c) => ({ unitId: c.id, text: c.text })),
    { sourceId },
  );
  await writeAuditLog({
    actorId: userId,
    action: 'ontology.extract_source',
    targetType: 'KnowledgeSource',
    targetId: sourceId,
    after: stats,
  });
  return stats;
}

type ProvenanceEntry = { documentId?: string; sourceId?: string; unitId?: string };

/**
 * 노드 상세: 실제 데이터 기반 provenance.
 * 이 노드가 추출된 문서/지식소스 목록과 연결 관계를 반환한다.
 */
export async function getNodeDetail(userId: string, nodeId: string) {
  const node = await prisma.ontologyNode.findUnique({ where: { id: nodeId } });
  if (!node) {
    throw new AppError(ErrorCodes.NOT_FOUND, { message: '온톨로지 노드를 찾을 수 없습니다.' });
  }
  await requireWorkspaceCapability(userId, node.workspaceId, Capabilities.VIEW_DOCUMENTS);

  const meta = (node.metadata as { sources?: ProvenanceEntry[] } | null) ?? {};
  const provenance = Array.isArray(meta.sources) ? meta.sources : [];
  const documentIds = [...new Set(provenance.map((p) => p.documentId).filter(Boolean))] as string[];
  const sourceIds = [...new Set(provenance.map((p) => p.sourceId).filter(Boolean))] as string[];
  // 노드가 실제로 등장한 블록/청크 id (옵시디언 백링크 문맥용)
  const unitIds = [...new Set(provenance.map((p) => p.unitId).filter(Boolean))] as string[];

  const [documents, knowledgeSources, edges, blocks, chunks] = await Promise.all([
    prisma.document.findMany({
      where: { id: { in: documentIds } },
      select: { id: true, title: true, type: true, updatedAt: true },
    }),
    prisma.knowledgeSource.findMany({
      where: { id: { in: sourceIds } },
      select: { id: true, title: true, status: true },
    }),
    prisma.ontologyEdge.findMany({
      where: {
        status: { in: ['CANDIDATE', 'APPROVED'] as ('CANDIDATE' | 'APPROVED')[] },
        OR: [{ sourceNodeId: nodeId }, { targetNodeId: nodeId }],
      },
    }),
    prisma.documentBlock.findMany({
      where: { id: { in: unitIds } },
      select: { id: true, type: true, content: true, documentId: true },
    }),
    prisma.knowledgeChunk.findMany({
      where: { id: { in: unitIds } },
      select: { id: true, text: true, sourceId: true },
    }),
  ]);

  // 노드 라벨이 들어간 문장만 추려서 발췌(문맥)로 제공
  const docTitleById = new Map(documents.map((d) => [d.id, d.title]));
  const excerpts: { source: string; text: string }[] = [];
  for (const b of blocks) {
    const c = b.content as { text?: string; title?: string; caption?: string; summary?: string };
    const text = (c.text ?? c.title ?? c.summary ?? c.caption ?? '').trim();
    if (text) {
      excerpts.push({
        source: docTitleById.get(b.documentId) ?? '문서',
        text: highlightAround(text, node.label),
      });
    }
  }
  for (const c of chunks) {
    if (c.text.trim()) {
      excerpts.push({ source: '지식소스', text: highlightAround(c.text, node.label) });
    }
  }

  const otherIds = edges.map((e) => (e.sourceNodeId === nodeId ? e.targetNodeId : e.sourceNodeId));
  const otherNodes = await prisma.ontologyNode.findMany({
    where: { id: { in: otherIds } },
    select: { id: true, label: true },
  });
  const labelById = new Map(otherNodes.map((n) => [n.id, n.label]));

  return {
    node: {
      id: node.id,
      label: node.label,
      type: node.type,
      status: node.status,
      confidence: node.confidence,
      description: node.description,
    },
    documents,
    knowledgeSources,
    connections: edges.map((e) => {
      const otherId = e.sourceNodeId === nodeId ? e.targetNodeId : e.sourceNodeId;
      return {
        edgeId: e.id,
        relationType: e.relationType,
        direction: e.sourceNodeId === nodeId ? 'out' : 'in',
        nodeId: otherId,
        label: labelById.get(otherId) ?? '?',
      };
    }),
    // 노드가 등장한 실제 문장 발췌 (옵시디언 백링크 문맥)
    excerpts: excerpts.slice(0, 6),
    // 연결된 노드 = 관련 키워드
    relatedKeywords: otherNodes.map((n) => n.label),
    extractionCount: provenance.length,
  };
}

/** 라벨이 들어간 문장 위주로 잘라낸다 (라벨 주변 문맥) */
function highlightAround(text: string, label: string): string {
  const idx = text.indexOf(label);
  if (idx === -1) return text.slice(0, 160) + (text.length > 160 ? '…' : '');
  const start = Math.max(0, idx - 60);
  const end = Math.min(text.length, idx + label.length + 100);
  return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
}

/** 샘플 온톨로지 시드 (그래프 뷰어 확인용) */
export async function seedSampleOntology(userId: string, workspaceId: string) {
  await requireWorkspaceCapability(userId, workspaceId, Capabilities.EDIT_DOCUMENTS);
  const existing = await prisma.ontologyNode.count({ where: { workspaceId } });
  if (existing > 0) {
    throw new AppError(ErrorCodes.CONFLICT, {
      message: '이미 온톨로지 노드가 있어 샘플을 생성하지 않았습니다.',
    });
  }
  const idByKey = new Map<string, string>();
  for (const sample of SAMPLE_NODES) {
    const node = await prisma.ontologyNode.create({
      data: {
        workspaceId,
        label: sample.label,
        type: sample.type,
        description: sample.description,
        status: 'CANDIDATE',
        confidence: 0.9,
        metadata: { seed: true } as Prisma.InputJsonValue,
      },
    });
    idByKey.set(sample.key, node.id);
  }
  for (const sample of SAMPLE_EDGES) {
    await prisma.ontologyEdge.create({
      data: {
        workspaceId,
        sourceNodeId: idByKey.get(sample.source)!,
        targetNodeId: idByKey.get(sample.target)!,
        relationType: sample.relation,
        status: 'CANDIDATE',
        confidence: 0.85,
      },
    });
  }
  await writeAuditLog({
    actorId: userId,
    action: 'ontology.seed',
    targetType: 'Workspace',
    targetId: workspaceId,
    after: { nodes: SAMPLE_NODES.length, edges: SAMPLE_EDGES.length },
  });
  return { nodes: SAMPLE_NODES.length, edges: SAMPLE_EDGES.length };
}
