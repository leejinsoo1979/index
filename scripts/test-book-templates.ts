import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync } from 'node:fs';
import { TEMPLATE_CATEGORIES,BOOK_TEMPLATES, applyBookTemplate, instantiateTemplatePages } from '../src/data/book-templates';
import type { BookPage, Flipbook } from '../src/lib/flipbooks';

const source = BOOK_TEMPLATES[0];
const existing: Flipbook = { ...source.book, id:'existing', title:'내 작업', width:1000,height:700,published:true,pages:[{id:'existing-page',title:'작성 중인 페이지',elements:[]}],assets:[{url:'/uploaded.jpg',kind:'image'}] };

test('complete editable books for every configured category, with existing image files',()=>{
 assert.ok(BOOK_TEMPLATES.length>=30);
 assert.deepEqual(new Set(BOOK_TEMPLATES.map(t=>t.category)),new Set(TEMPLATE_CATEGORIES.map(c=>c.value)));
 for(const template of BOOK_TEMPLATES){
  assert.ok(template.book.pages.length>=2);
  const ids=template.book.pages.flatMap(p=>[p.id,...p.elements.map(e=>e.id)]);
  assert.equal(new Set(ids).size,ids.length);
  for(const page of template.book.pages){
   assert.ok(page.elements.some(e=>e.type==='text'));
   for(const element of page.elements){
    // A rotated box is measured before rotation, so only unrotated elements can be checked here.
    if(!element.rotation)assert.ok(element.x>=0&&element.y>=0&&element.x+element.w<=100.01&&element.y+element.h<=100.01,`${template.id}/${page.title}/${element.id} out of page`);
    if(element.type==='image'){assert.ok(element.src);assert.ok(existsSync(`public${element.src}`));}
   }
  }
 }
});

test('insertion preserves existing work, identity, publication, dimensions and uploaded files',()=>{
 const before=structuredClone(existing);
 const result=applyBookTemplate(existing,source,source.book.pages.map(p=>p.id),'after-current',0);
 assert.equal(result.firstIndex,1);assert.equal(result.book.pages.length,9);
 assert.equal(result.book.pages[0],existing.pages[0]);
 assert.equal(result.book.id,'existing');assert.equal(result.book.title,'내 작업');assert.equal(result.book.published,true);
 assert.equal(result.book.width,1000);assert.equal(result.book.height,700);
 assert.ok(result.book.assets.some(a=>a.url==='/uploaded.jpg'));
 assert.deepEqual(existing,before);
 const second=applyBookTemplate(result.book,source,[source.book.pages[0].id],'at-end',0);
 assert.equal(second.firstIndex,9);assert.equal(second.book.assets.length,result.book.assets.length);
 assert.equal(new Set(second.book.pages.map(p=>p.id)).size,second.book.pages.length);
});

test('whole-book replacement is explicit and size changes only when requested',()=>{
 const selection=source.book.pages.slice(2,4).map(p=>p.id);
 const replace=applyBookTemplate(existing,source,selection,'replace',0);
 assert.equal(replace.book.pages.length,2);assert.equal(replace.firstIndex,0);assert.equal(replace.book.width,1000);
 const resize=applyBookTemplate(existing,source,selection,'replace',0,true);
 assert.equal(resize.book.width,794);assert.equal(resize.book.height,1123);
 assert.equal(resize.book.id,existing.id);
 const noop=applyBookTemplate(existing,source,[],'replace',0,true);
 assert.equal(noop.book,existing);
});

test('copied pages remap internal actions and groups, and discard links to omitted pages',()=>{
 const pages:BookPage[]=[{id:'a',elements:[{id:'one',groupId:'g',type:'text',text:'test',x:0,y:0,w:10,h:10,size:20,color:'#000',bold:false,align:'left',actions:[{kind:'page',pageId:'b'},{kind:'toggle',targetId:'two'},{kind:'url',url:'https://example.com'}]},{id:'two',groupId:'g',type:'shape',shape:'rect',fill:'#fff',x:0,y:0,w:10,h:10}]},{id:'b',elements:[]}];
 const original=structuredClone(pages);let serial=0;
 const copy=instantiateTemplatePages(pages,['b','a'],()=>`new-${++serial}`);
 assert.notEqual(copy[0].id,'a');assert.equal(copy[0].elements[0].groupId,copy[0].elements[1].groupId);assert.notEqual(copy[0].elements[0].groupId,'g');
 assert.deepEqual(copy[0].elements[0].actions,[{kind:'page',pageId:copy[1].id},{kind:'toggle',targetId:copy[0].elements[1].id},{kind:'url',url:'https://example.com'}]);
 const subset=instantiateTemplatePages(pages,['a']);
 assert.ok(!subset[0].elements[0].actions?.some(a=>a.kind==='page'));
 assert.deepEqual(pages,original);
});

test('editorial publications differ in page geometry and format, with editable text links',async()=>{
 const {EDITORIAL_TEMPLATES}=await import('../src/data/book-templates-editorial');
 const layout=(template:typeof EDITORIAL_TEMPLATES[number])=>JSON.stringify(template.book.pages.map(page=>page.elements.filter(e=>e.type==='image'||e.type==='text').map(e=>[e.type,e.x,e.y,e.w,e.h])));
 assert.equal(new Set(EDITORIAL_TEMPLATES.map(layout)).size,EDITORIAL_TEMPLATES.length,'a palette or copy change must not count as a new editorial layout');
 assert.ok(new Set(EDITORIAL_TEMPLATES.map(t=>(t.book.width/t.book.height).toFixed(2))).size>=3);
 const photos=new Set(EDITORIAL_TEMPLATES.flatMap(t=>t.book.pages.flatMap(p=>p.elements.flatMap(e=>e.type==='image'?[e.src]:[]))));
 assert.ok(photos.size>=10,'editorial books need genuinely different photography');
 for(const template of EDITORIAL_TEMPLATES){
  assert.ok(!template.book.pages.some(p=>p.image||p.elements.some(e=>e.type==='link')),'chapter links must be attached to editable text rather than a covering hotspot');
  assert.ok(template.book.pages.every(p=>p.elements.some(e=>e.type==='text')));
 }
});
