import { firebaseAuth } from "./firebase";

export async function agentAuthorizedFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const user = firebaseAuth?.currentUser;
  if (!user) throw new Error("관리자 로그인이 필요합니다.");
  const token = await user.getIdToken();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}
