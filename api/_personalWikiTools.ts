import {tool,jsonSchema} from 'ai';
import type {ExpertSource} from '../src/types/personas.js';
type ReadResult={pageId:string;title:string;version:number;updatedAt:string;chunks:Array<{text:string;chunkIndex:number;timestamp?:string;url?:string;attribution?:string;pages?:string}>};

/** Credentials, actor and room are closed over by the API, never supplied by the model. */
export function personalWikiTools(request:<T>(body:Record<string,unknown>)=>Promise<T>,profile:{id:string;name:string},remember:(sources:ExpertSource[])=>void){
  return {
    searchPersonalWiki:tool({
      description:'이 인물의 개인 위키 전체 원문을 검색한다. 한국어 표현·동의어·영상 제목·공법명 등으로 다시 검색할 수 있다. PDF 본문과 도표 OCR, 방송 자막, 개념 백과가 포함된다. 결과의 chunkIndex로 readPersonalWiki를 호출해 앞뒤 문맥을 읽는다.',
      inputSchema:jsonSchema<{query:string}>({type:'object',properties:{query:{type:'string',description:'현재 질문과 앞선 대화 맥락을 반영한 핵심 검색어. 예: 주방 수납 노동 동선'}},required:['query'],additionalProperties:false}),
      execute:async({query})=>{const r=await request<{sources:ExpertSource[]}>({action:'searchEvidence',query});remember(r.sources);return {sources:r.sources};},
    }),
    browsePersonalWiki:tool({
      description:'개인 위키의 문서·영상·연구자료 목록을 훑어본다. 문서 제목이 기억나지 않거나 일반 검색으로 관련 자료를 못 찾았을 때 사용한다. 선택한 문서의 id로 readPersonalWiki를 호출한다.',
      inputSchema:jsonSchema<Record<string,never>>({type:'object',properties:{},additionalProperties:false}),
      execute:async()=>request({action:'knowledgeCatalog'}),
    }),
    readPersonalWiki:tool({
      description:'선택한 개인 위키 원문의 해당 문단과 앞뒤 5개 문단을 읽는다. 직접 발언을 묻거나 조건·부정 표현·비교의 맥락을 확인할 때 사용한다. 검색 결과의 pageId(id)와 chunkIndex를 전달한다. 이어 읽을 때 다음 문단 번호를 사용한다.',
      inputSchema:jsonSchema<{pageId:string;chunkIndex:number}>({type:'object',properties:{pageId:{type:'string'},chunkIndex:{type:'integer',minimum:0}},required:['pageId','chunkIndex'],additionalProperties:false}),
      execute:async({pageId,chunkIndex})=>{const r=await request<ReadResult>({action:'readEvidence',pageId,chunkIndex});remember(r.chunks.map(c=>({id:r.pageId,title:r.title,version:r.version,personId:profile.id,personName:profile.name,excerpt:c.text,updatedAt:r.updatedAt,chunkIndex:c.chunkIndex,timestamp:c.timestamp,url:c.url,attribution:c.attribution,pages:c.pages})));return r;},
    }),
  };
}
