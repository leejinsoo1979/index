import {personalReplyText} from '../src/lib/personal-reply.js';

export type PersonalReplyEvent={type:'delta'|'replace';text:string};
type StreamPart={type:string;text?:string;error?:unknown;finishReason?:string};

// Only conceal a possibly unfinished citation/link, not the whole answer. A token
// such as '[' or 'https:/' must not flash before it can be recognized and removed.
function stablePrefix(raw:string){
  let end=raw.length;
  const bracket=raw.lastIndexOf('[');
  if(bracket>=0){const tail=raw.slice(bracket);if(!tail.includes(']')||/^\[[^\]]*\](?:\([^)]*)?$/.test(tail))end=Math.min(end,bracket);}
  const url=raw.match(/\b(?:h|ht|htt|http|https|https?:|https?:\/|https?:\/\/[^\s]*)$/);
  if(url?.index!==undefined){
    const linkStart=bracket>=0&&/^\[[^\]]*\]\($/.test(raw.slice(bracket,url.index))?bracket:url.index;
    end=Math.min(end,linkStart);
  }
  const line=raw.lastIndexOf('\n')+1,last=raw.slice(line).trimStart();
  const labels=['출처:','참고자료:','참고영상:','근거자료:'],candidate=last.replace(/\s/g,'');
  if(candidate&&labels.some(label=>label.startsWith(candidate)||candidate.startsWith(label)))end=Math.min(end,line);
  return personalReplyText(raw.slice(0,end));
}

/** Forwards model text as it arrives, excluding reasoning/tool payloads. New SDK
 * steps replace any short pre-tool prelude; only the final step is persisted. */
export async function forwardPersonalReply(parts:AsyncIterable<StreamPart>,send:(event:PersonalReplyEvent)=>void){
  let raw='',visible='';
  const publish=(text:string)=>{
    if(text===visible)return;
    if(text.startsWith(visible))send({type:'delta',text:text.slice(visible.length)});
    else send({type:'replace',text});
    visible=text;
  };
  for await(const part of parts){
    if(part.type==='start-step'){
      if(visible)send({type:'replace',text:''});raw='';visible='';
    }else if(part.type==='text-delta'&&part.text){
      raw+=part.text;publish(stablePrefix(raw));
    }else if(part.type==='finish-step'&&part.finishReason!=='tool-calls'){
      publish(personalReplyText(raw));
    }else if(part.type==='error'){
      throw part.error instanceof Error?part.error:new Error('답변 스트림을 읽지 못했습니다.');
    }else if(part.type==='abort'){
      throw Object.assign(new Error('답변 생성을 중지했습니다.'),{name:'AbortError'});
    }
  }
  publish(personalReplyText(raw));
  return personalReplyText(raw);
}
