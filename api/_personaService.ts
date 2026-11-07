import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
export async function personaService<T>(body:Record<string,unknown>):Promise<T>{
  const base=(process.env.INDEX_WIKI_URL||'http://127.0.0.1:5318').replace(/\/$/,'');
  let token=process.env.WIKI_SERVICE_TOKEN;
  if(!token){try{token=(await readFile(resolve(process.env.INDEX_KNOWLEDGE_DIR||'.index-knowledge','runtime.token'),'utf8')).trim();}catch{throw Object.assign(new Error('개인 지식 서버 연결이 설정되지 않았습니다.'),{status:503});}}
  let response:Response;try{response=await fetch(base+'/api/wiki/personas',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(45000)});}catch{throw Object.assign(new Error('개인 지식 서버에 연결할 수 없습니다.'),{status:503});}
  const result=await response.json();if(!response.ok)throw Object.assign(new Error(result.error||'요청을 처리하지 못했습니다.'),{status:response.status});return result as T;
}
