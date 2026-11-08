import { firebaseAuth } from './firebase';
import type { ExpertMessage } from '../types/personas';
export async function expertRequest<T>(action:string,body:Record<string,unknown>={},signal?:AbortSignal):Promise<T>{
  const token=await firebaseAuth?.currentUser?.getIdToken();
  const response=await fetch('/api/personas',{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify({...body,action}),signal});
  const value=await response.json().catch(()=>({error:'응답을 읽지 못했습니다.'}));if(!response.ok)throw new Error(value.error||'개인 지식 공간에 연결하지 못했습니다.');return value as T;
}
export async function streamExpertChat(body:Record<string,unknown>,onDelta:(text:string,replace?:boolean)=>void,signal:AbortSignal):Promise<ExpertMessage>{
  const token=await firebaseAuth?.currentUser?.getIdToken();if(!token)throw new Error('회원 로그인 후 대화할 수 있습니다.');
  const response=await fetch('/api/personas',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({...body,action:'chat'}),signal});
  if(!response.ok){const b=await response.json().catch(()=>({}));throw new Error(b.error||'답변을 받지 못했습니다.');}
  const reader=response.body?.getReader();if(!reader)throw new Error('답변 스트림을 열지 못했습니다.');
  const decoder=new TextDecoder();let buffer='',message:ExpertMessage|undefined;
  const line=(raw:string)=>{if(!raw.trim())return;const e=JSON.parse(raw);if(e.type==='error')throw new Error(e.error);if(e.type==='delta')onDelta(e.text);if(e.type==='replace')onDelta(e.text,true);if(e.type==='done')message=e.message;};
  try{while(true){const {value,done}=await reader.read();buffer+=decoder.decode(value,{stream:!done});let i;while((i=buffer.indexOf('\n'))>=0){line(buffer.slice(0,i));buffer=buffer.slice(i+1);}if(done)break;}if(buffer.trim())line(buffer);}finally{reader.releaseLock();}
  if(!message)throw new Error('답변 저장을 확인하지 못했습니다. 대화를 다시 열어 확인해 주세요.');return message;
}
export async function filePayload(file:File){if(file.size>10*1024*1024)throw new Error('파일은 10MB까지 올릴 수 있습니다.');const bytes=new Uint8Array(await file.arrayBuffer());let raw='';for(let i=0;i<bytes.length;i+=8192)raw+=String.fromCharCode(...bytes.subarray(i,i+8192));return {name:file.name,base64:btoa(raw)};}
