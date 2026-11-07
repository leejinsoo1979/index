import { createOpenAI } from '@ai-sdk/openai';
/** DeepSeek's official OpenAI-compatible Chat Completions endpoint. No key reaches the browser. */
export function deepseekModel(requested?:string){
  const apiKey=process.env.DEEPSEEK_API_KEY?.trim();
  if(!apiKey)throw Object.assign(new Error('DeepSeek API 키가 설정되지 않았습니다.'),{status:503});
  const model=requested&&['deepseek-flash','deepseek-v4-pro'].includes(requested)?requested:process.env.DEEPSEEK_MODEL||'deepseek-flash';
  const provider=createOpenAI({apiKey,baseURL:'https://api.deepseek.com/v1',name:'deepseek',fetch:async(url,init)=>{
    // Thinking is enabled by default on current DeepSeek models. Personal conversations use
    // the documented non-thinking mode; only the final answer is sent to members.
    if(typeof init?.body==='string'){
      const body=JSON.parse(init.body);body.thinking={type:'disabled'};
      if(body.max_completion_tokens!=null){body.max_tokens=body.max_completion_tokens;delete body.max_completion_tokens;}
      return fetch(url,{...init,body:JSON.stringify(body)});
    }
    return fetch(url,init);
  }});
  return provider.chat(model);
}
