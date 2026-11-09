import assert from 'node:assert/strict';import{test}from'node:test';
import{resolveBookReaderSettings,BOOK_TURN_EFFECTS,BOOK_TURN_SOUNDS}from'../src/lib/book-reader';
import{applyBookTemplate,BOOK_TEMPLATES}from'../src/data/book-templates';

test('default is the supplied page-turn recording; explicit mute is preserved',()=>{
 assert.deepEqual(resolveBookReaderSettings(),{effect:'paper',duration:650,sound:'paper',volume:.4});
 assert.equal(resolveBookReaderSettings({sound:'none'}).sound,'none');
 for(const effect of BOOK_TURN_EFFECTS)assert.equal(resolveBookReaderSettings({effect:effect.value}).effect,effect.value);
 for(const sound of BOOK_TURN_SOUNDS)assert.equal(resolveBookReaderSettings({sound:sound.value}).sound,sound.value);
});
test('invalid saved reader settings are bounded and safe',()=>{
 assert.deepEqual(resolveBookReaderSettings({effect:'bad',sound:'bad',duration:NaN,volume:Infinity}as any),resolveBookReaderSettings());
 assert.equal(resolveBookReaderSettings({volume:20,duration:20000}).volume,1);assert.equal(resolveBookReaderSettings({volume:-1,duration:1}).duration,250);
 assert.equal(resolveBookReaderSettings({volume:-1}).volume,0);
});
test('applying or replacing a template retains the owner reader preferences through JSON storage',()=>{
 const source=BOOK_TEMPLATES[0];const reader={effect:'fade' as const,duration:1000,sound:'soft' as const,volume:.2};const book={...source.book,reader};
 for(const placement of ['after-current','replace']as const){const applied=applyBookTemplate(book,source,source.book.pages.map(p=>p.id),placement,0,true).book;assert.deepEqual(JSON.parse(JSON.stringify(applied)).reader,reader);}
});
