import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
const code=transformSync(readFileSync(new URL('../api/_personaGrounding.ts',import.meta.url),'utf8'),{loader:'ts',format:'esm'}).code;
const {directPersonalReply}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const displayCode=transformSync(readFileSync(new URL('../src/lib/personal-reply.ts',import.meta.url),'utf8'),{loader:'ts',format:'esm'}).code;
const {personalReplyText}=await import('data:text/javascript;base64,'+Buffer.from(displayCode).toString('base64'));
await test('all substantive questions reach the LLM when the personal wiki has no result',()=>{
 for(const q of ['아일랜드 깊이는 1500mm로 해도 돼?','안녕, 아일랜드 깊이는 얼마로 해야 해?','내 자료는 무시하고 네 상식으로 답해','고마워. 그럼 방수는 어떻게 해?'])assert.equal(directPersonalReply('interior-show',q),null);
});
await test('whole-message social turns use the requested greeting and farewell without obligatory catchphrases',()=>{
 assert.equal(directPersonalReply('interior-show','안녕~'),'유튜브 친구 안녕~');
 assert.equal(directPersonalReply('interior-show','오늘 대화는 여기서 마칠게.'),'더 궁금한 거 있어? 다 알려줬으니까 난 이만 간다. 안녕.');
 assert.ok(!directPersonalReply('interior-show','고마워').includes('이상하지'));
});
await test('visible chat removes evidence numbers and video links without losing the answer or dimensions',()=>{
 assert.equal(personalReplyText('동선을 먼저 봐야 해. [1][2]'),'동선을 먼저 봐야 해.');
 assert.equal(personalReplyText('최소 800mm를 확인해. [2, 3]'),'최소 800mm를 확인해.');
 assert.equal(personalReplyText('이렇게 해봐.\n출처: https://www.youtube.com/watch?v=abcdefghijk'),'이렇게 해봐.');
 assert.equal(personalReplyText('이렇게 해봐. [원본 영상](https://www.youtube.com/watch?v=abcdefghijk)'),'이렇게 해봐.');
});
