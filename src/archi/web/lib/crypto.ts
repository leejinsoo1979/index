import { callArchiServer } from './server-proxy';

/**
 * API 키 암호화. 원본은 서버에서 AES-256-GCM으로 암호화했다. 이 포트에서도 암호화/복호화는
 * 서버 함수(api/archi-llm, ARCHI_KEY_SECRET)에서만 일어나고, 브라우저는 암호문만 저장한다.
 */
export async function encryptSecret(plaintext: string): Promise<string> {
  const { ciphertext } = await callArchiServer<{ ciphertext: string }>('encrypt', { plaintext });
  return ciphertext;
}

/** UI 표시용 마스킹: 끝 4자리만 노출 */
export function maskSecret(plaintext: string): string {
  if (plaintext.length <= 4) return '••••';
  return `••••${plaintext.slice(-4)}`;
}
