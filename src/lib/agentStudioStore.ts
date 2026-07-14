import { collection, doc, getDoc, getDocs, serverTimestamp, setDoc, writeBatch } from "firebase/firestore";
import { firebaseDb } from "./firebase";

export type AgentDocumentType = "REPORT" | "PROPOSAL" | "BLOG_POST" | "SNS_CAPTION" | "KNOWLEDGE_NOTE";
export type AgentDocumentStatus = "DRAFT" | "NEEDS_REVIEW" | "APPROVED" | "ARCHIVED";
export type AgentBlockType =
  | "heading" | "paragraph" | "image" | "checklist" | "source_reference" | "cta"
  | "chart" | "table" | "formula" | "doc_meta" | "qna" | "law_reference"
  | "callout" | "quote" | "code" | "cost_table" | "construction_detail"
  | "container" | "rich_text" | "image_gallery" | "before_after" | "diagram"
  | "construction_standard" | "material_spec" | "schedule" | "risk_warning"
  | "seo_meta" | "blog_section" | "technical_section" | "ontology_summary" | "divider";

export interface AgentCanvasLayout {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface AgentCitation {
  id: string;
  title: string;
  publisher?: string;
  url?: string;
  quote?: string;
  checkedAt?: string;
}

export interface AgentBlock {
  id: string;
  type: AgentBlockType;
  sortOrder: number;
  parentId?: string | null;
  content: Record<string, unknown>;
  metadata?: { canvas?: AgentCanvasLayout | null; [key: string]: unknown };
  citations?: AgentCitation[];
}

export interface AgentDocument {
  id: string;
  projectId: string;
  title: string;
  type: AgentDocumentType;
  status: AgentDocumentStatus;
  updatedAt: string;
  blocks: AgentBlock[];
}

export interface AgentProject {
  id: string;
  name: string;
  clientName: string;
  location: string;
  createdAt: string;
}

export interface AgentTask {
  id: string;
  title: string;
  status: "QUEUED" | "RUNNING" | "NEEDS_REVIEW" | "DONE";
  agent: string;
  documentId?: string;
  createdAt: string;
}

export interface AgentKnowledgeSource {
  id: string;
  title: string;
  sourceType: "FILE" | "URL" | "INTERNAL_MANUAL";
  status: "PENDING_REVIEW" | "APPROVED" | "ARCHIVED";
  trustLevel: "INTERNAL_UNVERIFIED" | "INTERNAL_APPROVED";
  createdAt: string;
  excerpt?: string;
}

export interface AgentAction {
  id: string;
  documentId?: string;
  type: "insert_blocks" | "update_block" | "replace_block_content" | "append_to_block" | "create_container" | "insert_block_before" | "create_child_block" | "convert_block_type" | "update_block_title" | "mark_block_approved" | "generate_image" | "extract_ontology";
  payload: Record<string, unknown>;
  status: "PROPOSED" | "EXECUTED" | "REJECTED" | "FAILED";
  requiresApproval: boolean;
  riskLevel: "low" | "medium" | "high";
  createdAt: string;
}

export interface AgentChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: AgentCitation[];
  createdAt: string;
}

export interface AgentConversation {
  id: string;
  documentId: string;
  title: string;
  messages: AgentChatMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface AgentOntologyNode {
  id: string;
  label: string;
  type: "space" | "method" | "material" | "defect" | "regulation";
  description?: string;
  status: "CANDIDATE" | "APPROVED" | "REJECTED";
  confidence?: number;
}

export interface AgentOntologyEdge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  relationType: string;
  status: "CANDIDATE" | "APPROVED" | "REJECTED";
}

export interface AgentImageAsset {
  id: string;
  projectId?: string;
  title: string;
  prompt: string;
  model: string;
  createdAt: string;
  versions: Array<{ id: string; dataUrl: string; prompt: string; createdAt: string }>;
}

export interface AgentStudioData {
  projects: AgentProject[];
  documents: AgentDocument[];
  tasks: AgentTask[];
  knowledge: AgentKnowledgeSource[];
  actions: AgentAction[];
  ontologyNodes: AgentOntologyNode[];
  ontologyEdges: AgentOntologyEdge[];
  images: AgentImageAsset[];
  conversations: AgentConversation[];
}

const STORAGE_PREFIX = "index-agent-studio-v1";
const COLLECTION_KEYS = ["projects", "documents", "tasks", "knowledge", "actions", "ontologyNodes", "ontologyEdges", "images", "conversations"] as const;
type CollectionKey = typeof COLLECTION_KEYS[number];
const remoteHashes = new Map<string, Map<string, string>>();
const saveQueues = new Map<string, Promise<void>>();

function stableRecord(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function recordHash(value: unknown) {
  return JSON.stringify(value);
}

export function createAgentId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function createBlock(type: AgentBlockType, text = "", sortOrder = 0): AgentBlock {
  const content: Record<string, unknown> =
    type === "heading" ? { level: 2, text }
      : type === "checklist" ? { title: "", items: text ? text.split("\n").map((item) => ({ text: item, checked: false })) : [{ text: "", checked: false }] }
        : type === "quote" ? { text, attribution: "" }
          : type === "divider" ? {}
            : { text };
  return { id: createAgentId(), type, sortOrder, parentId: null, content, metadata: {} };
}

export function getBlockText(block: AgentBlock): string {
  const content = block.content;
  if (typeof content.text === "string") return content.text;
  if (typeof content.title === "string" && !Array.isArray(content.items)) return content.title;
  if (Array.isArray(content.items)) {
    return content.items.map((item) => typeof item === "string" ? item : String((item as { text?: unknown }).text ?? "")).join("\n");
  }
  return "";
}

export function setBlockText(block: AgentBlock, text: string): AgentBlock {
  if (block.type === "checklist") {
    return { ...block, content: { ...block.content, items: text.split("\n").map((item) => ({ text: item, checked: false })) } };
  }
  return { ...block, content: { ...block.content, text } };
}

function initialData(): AgentStudioData {
  const projectId = createAgentId();
  const documentId = createAgentId();
  const now = new Date().toISOString();
  return {
    projects: [
      {
        id: projectId,
        name: "INDEX 콘텐츠 운영",
        clientName: "한국실내건축가협회",
        location: "서울",
        createdAt: now,
      },
    ],
    documents: [
      {
        id: documentId,
        projectId,
        title: "인테리어 시공 품질 가이드",
        type: "REPORT",
        status: "DRAFT",
        updatedAt: now,
        blocks: [
          createBlock("heading", "인테리어 시공 품질 가이드", 0),
          createBlock("paragraph", "현장 실무자가 확인해야 할 공정별 품질 기준과 하자 예방 항목을 정리합니다.", 1),
        ],
      },
    ],
    tasks: [
      {
        id: createAgentId(),
        title: "방수 시공 체크리스트 초안 검토",
        status: "NEEDS_REVIEW",
        agent: "시공팀",
        documentId,
        createdAt: now,
      },
    ],
    knowledge: [],
    actions: [],
    ontologyNodes: [],
    ontologyEdges: [],
    images: [],
    conversations: [],
  };
}

function normalizeData(input: AgentStudioData): AgentStudioData {
  return {
    ...input,
    documents: input.documents.map((document) => ({
      ...document,
      blocks: document.blocks.map((raw, index) => {
        const legacy = raw as unknown as { id: string; type: AgentBlockType; content: unknown; sortOrder?: number };
        if (typeof legacy.content === "string") {
          return { ...createBlock(legacy.type, legacy.content, index), id: legacy.id };
        }
        return { ...raw, sortOrder: raw.sortOrder ?? index, content: raw.content ?? {} };
      }),
    })),
    actions: input.actions ?? [],
    ontologyNodes: input.ontologyNodes ?? [],
    ontologyEdges: input.ontologyEdges ?? [],
    images: input.images ?? [],
    conversations: (input.conversations ?? []).map((conversation) => ({ ...conversation, messages: conversation.messages.slice(-100) })),
  };
}

export function loadAgentStudio(userId: string): AgentStudioData {
  try {
    const saved = window.localStorage.getItem(`${STORAGE_PREFIX}:${userId}`);
    if (!saved) return initialData();
    const parsed = JSON.parse(saved) as AgentStudioData;
    if (!Array.isArray(parsed.projects) || !Array.isArray(parsed.documents)) return initialData();
    return normalizeData(parsed);
  } catch {
    return initialData();
  }
}

/**
 * Firebase 관리자로 로그인한 경우 같은 UID의 Firestore workspace를 우선 사용한다.
 * Firestore 미설정/권한 오류 시 현재 브라우저 저장소를 오프라인 폴백으로 유지한다.
 */
export async function hydrateAgentStudio(userId: string): Promise<AgentStudioData> {
  const local = loadAgentStudio(userId);
  if (!firebaseDb || userId === "local-admin") return local;
  try {
    const rootRef = doc(firebaseDb, "agentWorkspaces", userId);
    const [snapshot, ...collectionSnapshots] = await Promise.all([
      getDoc(rootRef),
      ...COLLECTION_KEYS.map((key) => getDocs(collection(rootRef, key))),
    ]);
    if (!snapshot.exists()) {
      await saveAgentStudio(userId, local);
      return local;
    }
    const hashes = new Map<string, string>();
    const normalizedCollections = Object.fromEntries(COLLECTION_KEYS.map((key, index) => {
      const values = collectionSnapshots[index].docs.map((item) => {
        const value = item.data().value as Record<string, unknown>;
        hashes.set(`${key}:${item.id}`, recordHash(value));
        return value;
      });
      return [key, values];
    })) as unknown as AgentStudioData;
    remoteHashes.set(userId, hashes);
    const hasNormalizedData = snapshot.data().schemaVersion === 2 || COLLECTION_KEYS.some((_, index) => !collectionSnapshots[index].empty);
    const remote = hasNormalizedData ? normalizedCollections : snapshot.data().data as AgentStudioData | undefined;
    if (!remote || !Array.isArray(remote.projects) || !Array.isArray(remote.documents)) {
      await saveAgentStudio(userId, local);
      return local;
    }
    window.localStorage.setItem(`${STORAGE_PREFIX}:${userId}`, JSON.stringify(remote));
    const normalized = normalizeData(remote);
    if (!hasNormalizedData) void saveAgentStudio(userId, normalized);
    return normalized;
  } catch (error) {
    console.warn("[Agent Studio] Firestore hydrate failed; using local cache.", error);
    return local;
  }
}

async function persistAgentStudio(userId: string, data: AgentStudioData) {
  if (!firebaseDb || userId === "local-admin") return;
  try {
    const rootRef = doc(firebaseDb, "agentWorkspaces", userId);
    const known = remoteHashes.get(userId) ?? new Map<string, string>();
    const nextHashes = new Map<string, string>();
    let batch = writeBatch(firebaseDb);
    let operations = 0;
    const commitIfFull = async () => {
      if (operations < 450) return;
      await batch.commit();
      batch = writeBatch(firebaseDb!);
      operations = 0;
    };
    for (const key of COLLECTION_KEYS) {
      const records = data[key] as Array<{ id: string }>;
      for (const record of records) {
        const clean = stableRecord(record);
        const hashKey = `${key}:${record.id}`;
        const hash = recordHash(clean);
        nextHashes.set(hashKey, hash);
        if (known.get(hashKey) !== hash) {
          batch.set(doc(collection(rootRef, key), record.id), { ownerUid: userId, value: clean, updatedAt: serverTimestamp() });
          operations += 1;
          await commitIfFull();
        }
      }
    }
    for (const hashKey of known.keys()) {
      if (nextHashes.has(hashKey)) continue;
      const separator = hashKey.indexOf(":");
      const key = hashKey.slice(0, separator) as CollectionKey;
      const id = hashKey.slice(separator + 1);
      batch.delete(doc(collection(rootRef, key), id));
      operations += 1;
      await commitIfFull();
    }
    if (operations > 0) await batch.commit();
    await setDoc(rootRef, { ownerUid: userId, schemaVersion: 2, updatedAt: serverTimestamp() }, { merge: true });
    remoteHashes.set(userId, nextHashes);
  } catch (error) {
    console.warn("[Agent Studio] Firestore save failed; local cache remains active.", error);
  }
}

export function saveAgentStudio(userId: string, data: AgentStudioData) {
  window.localStorage.setItem(`${STORAGE_PREFIX}:${userId}`, JSON.stringify(data));
  const previous = saveQueues.get(userId) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(() => persistAgentStudio(userId, data));
  saveQueues.set(userId, next);
  return next;
}
