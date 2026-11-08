import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const output=await build({entryPoints:['api/_personaStream.ts'],bundle:true,write:false,platform:'node',format:'esm',logLevel:'silent'});
const {forwardPersonalReply}=await import('data:text/javascript;base64,'+Buffer.from(output.outputFiles[0].text).toString('base64'));

await test('the first model text is forwarded before the model finishes, rather than replaying a completed answer',async()=>{
 let release,observed;const gate=new Promise(r=>release=r),first=new Promise(r=>observed=r);let completed=false;
 async function* model(){yield {type:'start-step'};yield {type:'text-delta',text:'주방 동선부터'};await gate;yield {type:'text-delta',text:' 같이 보자.'};completed=true;yield {type:'finish-step',finishReason:'stop'};}
 const events=[];const running=forwardPersonalReply(model(),event=>{events.push(event);observed();});
 await first;assert.equal(completed,false);assert.equal(events[0].text,'주방 동선부터');release();
 assert.equal(await running,'주방 동선부터 같이 보자.');assert.ok(events.filter(e=>e.type==='delta').length>=2);
});

await test('citations and source URLs split across individual tokens never flash in the visible stream',async()=>{
 const raw='이렇게 하면 돼. [1][2, 3]\n[원본](https://www.youtube.com/watch?v=abcdefghijk)\n출처 : https://youtu.be/abcdefghijk\n그다음 동선을 봐.';
 async function* model(){yield {type:'start-step'};for(const text of raw)yield {type:'text-delta',text};yield {type:'finish-step',finishReason:'stop'};}
 let visible='';const frames=[];const result=await forwardPersonalReply(model(),e=>{visible=e.type==='replace'?e.text:visible+e.text;frames.push(visible);});
 assert.equal(result,'이렇게 하면 돼. \n\n그다음 동선을 봐.');
 assert.ok(frames.every(s=>!s.includes('[1')&&!s.includes('http')&&!s.includes('출처')&&!s.includes('원본')));
 assert.equal(visible,result);
});

await test('tool and reasoning payloads stay hidden and a later answer replaces any earlier tool prelude',async()=>{
 async function* model(){yield {type:'start-step'};yield {type:'text-delta',text:'잠깐 볼게.'};yield {type:'tool-call',text:'private-arguments'};yield {type:'reasoning-delta',text:'private-reasoning'};yield {type:'finish-step',finishReason:'tool-calls'};yield {type:'start-step'};yield {type:'tool-result',text:'private-source'};yield {type:'text-delta',text:'식탁 위치부터 보자.'};yield {type:'finish-step',finishReason:'stop'};}
 const events=[];assert.equal(await forwardPersonalReply(model(),e=>events.push(e)),'식탁 위치부터 보자.');assert.ok(events.some(e=>e.type==='replace'&&e.text===''));assert.ok(!JSON.stringify(events).includes('private-'));
});

await test('a provider stream failure rejects and cannot become a completed saved answer',async()=>{
 async function* model(){yield {type:'text-delta',text:'부분 답변'};yield {type:'error',error:new Error('provider failed')};}
 await assert.rejects(forwardPersonalReply(model(),()=>{}),/provider failed/);
});
