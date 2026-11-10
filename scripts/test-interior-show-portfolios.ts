import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {INTERIOR_SHOW_PORTFOLIOS as books,createInteriorShowPortfolio} from '../src/data/interior-show-portfolios';
assert.equal(books.length,13);
assert.equal(new Set(books.map(b=>b.id)).size,13);
assert.equal(books.reduce((n,b)=>n+b.pages.length,0),196);
for(const book of books){
 const slug=book.id.replace('inshow-pf-','').replace(/-v1$/,'');
 const ids=new Set(book.pages.map(p=>p.id));
 assert.equal(book.published,false);
 assert.equal(book.pages.length%2,0);
 assert(book.pages[0].elements.some(e=>e.type==='image'));
 for(const page of book.pages){
  assert(!page.image,'editable elements, never a flattened page');
  for(const e of page.elements){
   if(e.type==='image'){
    assert(e.src.startsWith(`/portfolios/interior-show/${slug}/`)||e.src.includes('/brand/'),'site isolation');
    assert(existsSync('public'+e.src),e.src);
   }
   for(const a of e.actions??[]){if(a.kind==='page')assert(ids.has(a.pageId),'valid page target');}
  }
 }
}
const a=createInteriorShowPortfolio('daejang-62'),b=createInteriorShowPortfolio('daejang-62');
a.pages[0].title='changed';assert.notEqual(a.pages[0].title,b.pages[0].title);
assert(a.createdAt>0);
console.log('13 independent books / 196 editable pages / local assets / internal links / clone isolation: PASS');

// The editorial update is additive and safe to retry on an already saved book.
const {enhanceInteriorShowBook,hasEditorialGraphics}=await import('../src/data/book-editorial-graphics');
for(const book of books){
 assert(hasEditorialGraphics(book));
 assert.equal(enhanceInteriorShowBook(book),book,'retry must not add duplicate artwork');
 const clean={...book,pages:book.pages.map(p=>({...p,elements:p.elements.filter(e=>!e.id.startsWith('magazine-v2:'))}))};
 const before=structuredClone(clean);
 const enhanced=enhanceInteriorShowBook(clean);
 assert.deepEqual(enhanced.pages.map(p=>p.elements.filter(e=>!e.id.startsWith('magazine-v2:'))),before.pages.map(p=>p.elements),'photo/text/actions preserved');
 assert.deepEqual(clean,before,'does not mutate saved source');
 for(const page of enhanced.pages){
  assert.equal(new Set(page.elements.map(e=>e.id)).size,page.elements.length);
  for(const e of page.elements.filter(e=>e.id.startsWith('magazine-v2:')))assert(e.x>=0&&e.y>=0&&e.x+e.w<=100.01&&e.y+e.h<=100.01,`${book.id}/${page.title}/${e.id}`);
 }
}
console.log('Additive graphics / unchanged source / retry safety / bounds: PASS');
