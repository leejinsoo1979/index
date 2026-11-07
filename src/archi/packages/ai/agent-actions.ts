import { z } from 'zod';
import { blockInputSchema } from '@archi/editor';

/**
 * Agent Action 계약 (CLAUDE.md 7장).
 * 모든 AI 액션은 서버 allowlist + zod 검증 후에만 실행된다.
 */

export const riskLevelSchema = z.enum(['low', 'medium', 'high']);
export type RiskLevel = z.infer<typeof riskLevelSchema>;

export const insertBlocksActionSchema = z.object({
  action_type: z.literal('insert_blocks'),
  target: z.object({ documentId: z.string(), afterBlockId: z.string().optional() }),
  payload: z.object({ blocks: z.array(blockInputSchema).min(1) }),
  requires_approval: z.boolean().default(true),
  risk_level: riskLevelSchema.default('low'),
});

export const updateBlockActionSchema = z.object({
  action_type: z.literal('update_block'),
  target: z.object({ documentId: z.string(), blockId: z.string() }),
  payload: z.object({ content: z.record(z.unknown()) }),
  requires_approval: z.boolean().default(true),
  risk_level: riskLevelSchema.default('low'),
});

/** 선택 블록의 내용을 통째로 교체 (스펙: replace_block_content). 파괴적이므로 medium 위험. */
export const replaceBlockContentActionSchema = z.object({
  action_type: z.literal('replace_block_content'),
  target: z.object({ documentId: z.string(), blockId: z.string() }),
  payload: z.object({ content: z.record(z.unknown()) }),
  requires_approval: z.boolean().default(true),
  risk_level: riskLevelSchema.default('medium'),
});

/** 블록의 텍스트 필드에 이어쓰기 (스펙: append_to_block) */
export const appendToBlockActionSchema = z.object({
  action_type: z.literal('append_to_block'),
  target: z.object({ documentId: z.string(), blockId: z.string() }),
  payload: z.object({ text: z.string().min(1) }),
  requires_approval: z.boolean().default(true),
  risk_level: riskLevelSchema.default('low'),
});

/** 컨테이너(그룹) 블록 + 자식 블록들을 한 번에 생성 (스펙: create_container) */
export const createContainerActionSchema = z.object({
  action_type: z.literal('create_container'),
  target: z.object({ documentId: z.string(), afterBlockId: z.string().optional() }),
  payload: z.object({
    title: z.string(),
    children: z.array(blockInputSchema).default([]),
  }),
  requires_approval: z.boolean().default(true),
  risk_level: riskLevelSchema.default('low'),
});

/** 기준 블록 '앞'에 블록 삽입 */
export const insertBlockBeforeActionSchema = z.object({
  action_type: z.literal('insert_block_before'),
  target: z.object({ documentId: z.string(), beforeBlockId: z.string() }),
  payload: z.object({ blocks: z.array(blockInputSchema).min(1) }),
  requires_approval: z.boolean().default(true),
  risk_level: riskLevelSchema.default('low'),
});

/** 컨테이너의 자식으로 블록 추가 */
export const createChildBlockActionSchema = z.object({
  action_type: z.literal('create_child_block'),
  target: z.object({
    documentId: z.string(),
    parentId: z.string(),
    afterBlockId: z.string().optional(),
  }),
  payload: z.object({ block: blockInputSchema }),
  requires_approval: z.boolean().default(true),
  risk_level: riskLevelSchema.default('low'),
});

/** 블록 타입 변환(내용 재검증). 파괴적이므로 medium 위험 */
export const convertBlockTypeActionSchema = z.object({
  action_type: z.literal('convert_block_type'),
  target: z.object({ documentId: z.string(), blockId: z.string() }),
  payload: z.object({ block: blockInputSchema }),
  requires_approval: z.boolean().default(true),
  risk_level: riskLevelSchema.default('medium'),
});

/** 블록 제목/머리말 갱신 */
export const updateBlockTitleActionSchema = z.object({
  action_type: z.literal('update_block_title'),
  target: z.object({ documentId: z.string(), blockId: z.string() }),
  payload: z.object({ title: z.string() }),
  requires_approval: z.boolean().default(true),
  risk_level: riskLevelSchema.default('low'),
});

/** 블록 승인 표시(검수 완료). 승인은 high 위험 */
export const markBlockApprovedActionSchema = z.object({
  action_type: z.literal('mark_block_approved'),
  target: z.object({ documentId: z.string(), blockId: z.string() }),
  payload: z.object({}).default({}),
  requires_approval: z.boolean().default(true),
  risk_level: riskLevelSchema.default('high'),
});

/** 이미지 생성 후 이미지 블록 삽입. 크레딧 소모 → medium 위험 */
export const generateImageActionSchema = z.object({
  action_type: z.literal('generate_image'),
  target: z.object({ documentId: z.string(), afterBlockId: z.string().optional() }),
  payload: z.object({ prompt: z.string().min(1), caption: z.string().optional() }),
  requires_approval: z.boolean().default(true),
  risk_level: riskLevelSchema.default('medium'),
});

/** 문서에서 온톨로지(지식 노드/관계) 후보 추출 */
export const extractOntologyActionSchema = z.object({
  action_type: z.literal('extract_ontology'),
  target: z.object({ documentId: z.string() }),
  payload: z.object({}).default({}),
  requires_approval: z.boolean().default(true),
  risk_level: riskLevelSchema.default('low'),
});

export const agentActionSchema = z.discriminatedUnion('action_type', [
  insertBlocksActionSchema,
  updateBlockActionSchema,
  replaceBlockContentActionSchema,
  appendToBlockActionSchema,
  createContainerActionSchema,
  insertBlockBeforeActionSchema,
  createChildBlockActionSchema,
  convertBlockTypeActionSchema,
  updateBlockTitleActionSchema,
  markBlockApprovedActionSchema,
  generateImageActionSchema,
  extractOntologyActionSchema,
]);

export type AgentActionInput = z.infer<typeof agentActionSchema>;
export type InsertBlocksAction = z.infer<typeof insertBlocksActionSchema>;
export type UpdateBlockAction = z.infer<typeof updateBlockActionSchema>;
export type ReplaceBlockContentAction = z.infer<typeof replaceBlockContentActionSchema>;
export type AppendToBlockAction = z.infer<typeof appendToBlockActionSchema>;
export type CreateContainerAction = z.infer<typeof createContainerActionSchema>;
export type InsertBlockBeforeAction = z.infer<typeof insertBlockBeforeActionSchema>;
export type CreateChildBlockAction = z.infer<typeof createChildBlockActionSchema>;
export type ConvertBlockTypeAction = z.infer<typeof convertBlockTypeActionSchema>;
export type UpdateBlockTitleAction = z.infer<typeof updateBlockTitleActionSchema>;
export type MarkBlockApprovedAction = z.infer<typeof markBlockApprovedActionSchema>;
export type GenerateImageAction = z.infer<typeof generateImageActionSchema>;
export type ExtractOntologyAction = z.infer<typeof extractOntologyActionSchema>;

/** 실행 가능한 action type allowlist */
export const ALLOWED_ACTION_TYPES = [
  'insert_blocks',
  'update_block',
  'replace_block_content',
  'append_to_block',
  'create_container',
  'insert_block_before',
  'create_child_block',
  'convert_block_type',
  'update_block_title',
  'mark_block_approved',
  'generate_image',
  'extract_ontology',
] as const;

export function parseAgentAction(value: unknown): AgentActionInput {
  return agentActionSchema.parse(value);
}
