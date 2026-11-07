import { firebaseAuth } from './firebase';

export async function knowledgeRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await firebaseAuth?.currentUser?.getIdToken();
  const response = await fetch('/api/wiki/' + path, { ...init, headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers } });
  const body = await response.json().catch(() => ({ error: '지식 서버 응답을 읽지 못했습니다.' }));
  if (!response.ok) throw new Error(body.error || '지식 서버 요청에 실패했습니다.');
  return body as T;
}
export async function ingestWikiFile(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!bytes.length || bytes.length > 20 * 1024 * 1024) throw new Error('파일은 1byte~20MB여야 합니다.');
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return knowledgeRequest<{ duplicated: boolean }>('sources', { method: 'POST', body: JSON.stringify({ title: file.name.replace(/\.[^.]+$/, ''), name: file.name, base64: btoa(binary) }) });
}
export async function knowledgeOriginal(id: string) {
  const token = await firebaseAuth?.currentUser?.getIdToken();
  const response = await fetch('/api/wiki/originals/' + encodeURIComponent(id), { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!response.ok) throw new Error('원본 파일을 가져오지 못했습니다.');
  return URL.createObjectURL(await response.blob());
}
