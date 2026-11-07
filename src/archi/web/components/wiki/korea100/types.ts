/** Korea100 process contract, MIT (c) 2026 Hoseong Seo; INDEX adds source IDs. */
export type NodeStatus = 'done' | 'current' | 'waiting' | 'risk' | 'loop';
export interface ProcessNode {
  id: string;
  name: string;
  lane: string;
  stage: string;
  type: 'task' | 'gateway' | 'notice' | 'system';
  status: NodeStatus;
  actor: string;
  display_status?: string;
  display_id?: string;
  action?: string;
  input_documents?: string[];
  output_documents?: string[];
  deadline?: string;
  blocker?: string | null;
  source_ids?: string[];
}
export interface ProcessEdge {
  id: string;
  source: string;
  target: string;
  type: 'sequence' | 'message' | 'loop';
  label?: string | null;
}
export interface ProcessModel {
  lanes: string[];
  stages: string[];
  nodes: ProcessNode[];
  edges: ProcessEdge[];
}
