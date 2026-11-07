import type { ExpertSource } from '../src/types/personas.js';

/** Only narrow, whole-message social turns bypass evidence. Domain questions never do. */
export function directPersonalReply(personId:string, question:string, sources:ExpertSource[]):string|null {
  const q=question.trim().replace(/[.!?~。！？\s]+$/gu,'');
  const show=personId==='interior-show';
  if(/^(안녕|안녕하세요|안뇽|하이|반가워|처음 뵙겠습니다)$/u.test(q))return show?'유튜브 친구 안녕~':'안녕하세요. 편하게 질문해 주세요.';
  if(/^(안녕히 계세요|안녕히 가세요|잘 가|잘가|다음에 봐|다음에봐|나 갈게|이만 갈게|오늘은 여기까지|오늘 대화는 여기서 마칠게|대화 끝|수고했어|수고하세요)$/u.test(q))return show?'더 궁금한 거 있어? 다 알려줬으니까 난 이만 간다. 안녕.':'다음에 또 이야기 나누겠습니다. 안녕히 가세요.';
  if(/^(고마워|감사합니다|감사해요|땡큐|도움 됐어|도움이 됐어)$/u.test(q))return show?'그래, 또 궁금한 거 있으면 물어봐.':'도움이 되셨다니 다행입니다. 또 질문해 주세요.';
  if(/^(응|네|넵|예|알겠어|알겠습니다|오케이|ㅇㅇ|좋아|그렇구나)$/u.test(q))return show?'응, 이어서 물어봐.':'네, 이어서 질문해 주세요.';
  if(/^(너는 누구야|넌 누구야|누구세요|진짜 인쇼야|진짜 인쇼 대표야|실제 인쇼 대표야|본인이야|AI야|너 AI야)$/iu.test(q))return show?'인쇼의 말투와 공유한 지식자료를 바탕으로 답하는 개인 AI야.':'이 인물의 공유 지식을 바탕으로 답하는 개인 AI입니다.';
  if(!sources.length)return missingPersonalEvidence(personId);
  return null;
}

export function missingPersonalEvidence(personId:string){
  return personId==='interior-show'?'그 얘기는 내 자료에서 근거를 못 찾았어. 관련 영상이나 자료가 있으면 그걸 보고 얘기하자.':'공유된 개인 자료에서 이 질문의 근거를 찾지 못했습니다. 관련 자료를 추가해 주세요.';
}

/** Citation syntax is necessary, not proof of entailment. Invalid/absent references fail closed. */
export function hasValidPersonalCitations(content:string, sources:ExpertSource[]){
  const refs=[...content.matchAll(/\[(\d+)\]/g)].map(m=>Number(m[1]));
  return refs.length>0&&refs.every(n=>n>=1&&n<=sources.length);
}
