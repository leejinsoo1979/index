export type ExpertProfile = {
  id:string; name:string; role:string; bio:string; video:string; animation?:string; poster:string;
  published:boolean; version:number; documentCount:number; voiceReady:boolean;
  suggestions:string[]; greeting?:string; styleVersion?:string; ownerUid?:string; voice?:string; principles?:string;
};
export type ExpertSource = {id:string;title:string;personId:string;personName:string;version:number;excerpt:string;updatedAt:string;pages?:string;url?:string;timestamp?:string;attribution?:string;chunkIndex?:number};
export type ExpertMessage = {id:string;role:'user'|'assistant';content:string;state:'pending'|'complete'|'error';createdAt:string;sources:ExpertSource[];error?:string};
export type ExpertRoom = {id:string;personId:string;title:string;updatedAt:string;messages?:ExpertMessage[]};
export const REPRESENTATIVE:ExpertProfile = {
  id:'interior-show',name:'인테리어쇼 대표',greeting:'유튜브 친구 안녕~',role:'주거 실내건축 · 개인 AI',
  bio:'자료와 경험을 쌓고, 생각을 나누는 인테리어쇼 대표의 개인 지식 공간입니다.',
  video:'/media/representative/interior-show-greeting.webm',animation:'/media/representative/interior-show-greeting.webp',poster:'/media/representative/interior-show-poster.png',
  published:true,version:1,documentCount:0,voiceReady:false,
  suggestions:['주거 공간을 계획할 때 무엇부터 정리하면 좋을까요?','디자인과 실제 생활의 편리함을 어떻게 맞추면 좋을까요?','공사를 시작하기 전에 어떤 질문을 해봐야 할까요?'],
};
