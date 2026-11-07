/** 조직 멤버 역할. ARCHITECTURE.md 8장 권한 모델 참조 */
export const Roles = {
  OWNER: 'OWNER',
  ADMIN: 'ADMIN',
  EDITOR: 'EDITOR',
  VIEWER: 'VIEWER',
  KNOWLEDGE_REVIEWER: 'KNOWLEDGE_REVIEWER',
} as const;

export type Role = (typeof Roles)[keyof typeof Roles];

/** 권한 체크에 사용하는 capability 목록 */
export const Capabilities = {
  MANAGE_MEMBERS: 'MANAGE_MEMBERS',
  EDIT_DOCUMENTS: 'EDIT_DOCUMENTS',
  VIEW_DOCUMENTS: 'VIEW_DOCUMENTS',
  USE_AI: 'USE_AI',
  GENERATE_IMAGES: 'GENERATE_IMAGES',
  APPROVE_KNOWLEDGE: 'APPROVE_KNOWLEDGE',
  EDIT_ONTOLOGY: 'EDIT_ONTOLOGY',
  EXPORT_DOCUMENTS: 'EXPORT_DOCUMENTS',
  MANAGE_TASKS: 'MANAGE_TASKS',
  MANAGE_LLM_PROVIDERS: 'MANAGE_LLM_PROVIDERS',
} as const;

export type Capability = (typeof Capabilities)[keyof typeof Capabilities];

const roleCapabilities: Record<Role, ReadonlySet<Capability>> = {
  OWNER: new Set(Object.values(Capabilities)),
  ADMIN: new Set(Object.values(Capabilities)),
  EDITOR: new Set([
    Capabilities.EDIT_DOCUMENTS,
    Capabilities.VIEW_DOCUMENTS,
    Capabilities.USE_AI,
    Capabilities.GENERATE_IMAGES,
    Capabilities.EXPORT_DOCUMENTS,
    Capabilities.MANAGE_TASKS,
  ]),
  VIEWER: new Set([Capabilities.VIEW_DOCUMENTS]),
  KNOWLEDGE_REVIEWER: new Set([
    Capabilities.VIEW_DOCUMENTS,
    Capabilities.APPROVE_KNOWLEDGE,
  ]),
};

export function roleHasCapability(role: Role, capability: Capability): boolean {
  return roleCapabilities[role].has(capability);
}
