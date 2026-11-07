import { lazy,Suspense,useEffect,useMemo,useState } from 'react';
import { Link,useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { expertRequest,filePayload } from '../lib/personas';
import type { ExpertProfile } from '../types/personas';
import type { WikiDraft,WikiPage,WikiRepository,WikiRevision,WikiSource } from '../archi/wiki/types';
const Library=lazy(()=>import('../archi/web/pages/StudioWiki').then(m=>({default:m.WikiLibrary})));
export default function ExpertWiki(){
  const {personId='interior-show'}=useParams(),{user,loading}=useAuth();const [profile,setProfile]=useState<ExpertProfile|null>(null),[error,setError]=useState('');
  useEffect(()=>{setProfile(null);setError('');if(!user)return;let active=true;expertRequest<ExpertProfile>('settings',{personId}).then(p=>{if(active)setProfile(p);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[personId,user?.uid]);
  const repository=useMemo<WikiRepository>(()=>({mode:'cloud',list:()=>expertRequest<WikiPage[]>('pages',{personId}),save:(draft,options)=>expertRequest<WikiPage>('savePage',{personId,draft,options}),history:pageId=>expertRequest<WikiRevision[]>('history',{personId,pageId})}),[personId,user?.uid]);
  async function original(source:WikiSource){if(source.kind!=='file')throw new Error('개인 위키에서 연결한 원본 파일을 선택해 주세요.');const r=await expertRequest<{name:string;base64:string}>('original',{personId,sourceId:source.id});const bytes=Uint8Array.from(atob(r.base64),c=>c.charCodeAt(0));const url=URL.createObjectURL(new Blob([bytes]));const a=document.createElement('a');a.href=url;a.download=r.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  if(!profile)return <main className="expert-shell"><div className="expert-loading">{error||(!user&&!loading?'배정받은 계정으로 로그인해 주세요.':'개인 지식 공간을 확인하고 있습니다.')}<Link to={`/mypage?redirect=${encodeURIComponent(location.pathname)}`}>로그인</Link><Link to={`/experts/${personId}`}>개인 채팅방으로</Link></div></main>;
  return <Suspense fallback={<div className="expert-loading">개인 위키를 불러오는 중입니다.</div>}><Library key={personId+':'+user?.uid} repository={repository} workspaceId={personId} actor={profile.name} contextLink={{to:`/experts/${personId}`,label:profile.name+' 개인 채팅방'}} importFile={async file=>expertRequest<WikiDraft>('importDraft',{personId,...await filePayload(file)})} openPersonalSource={original}/></Suspense>;
}
