import {enhanceInteriorShowBook} from './book-editorial-graphics';
import manifest from '../../public/portfolios/interior-show/manifest.json';
import type { BookElement, BookPage, Flipbook, TextElement } from '../lib/flipbooks';

type Site = (typeof manifest)[number];
type Direction = {
  slug: string; en: string; words: [string,string]; subtitle: string; lead: string;
  paper: string; ink: string; accent: string; deep: string;
  cover: 'split'|'masthead'|'frame'|'type'|'bleed'|'gallery';
  variant: number; pages: 14|16|18; square?: boolean; landscape?: boolean;
};
const directions: Direction[] = [
  {slug:'daejang-62',en:'DAEJANG',words:['Dark','matter.'],subtitle:'짙은 면 위로 흐르는 빛',lead:'검은 가구와 짙은 표면이 공용 공간의 중심을 잡습니다. 낮게 이어진 조명과 창에서 들어오는 빛이 서로 다른 깊이를 만들고, 밝은 벽과 바닥이 그 사이의 여백을 남깁니다.',paper:'#ece8df',ink:'#22231f',accent:'#9c7554',deep:'#252723',cover:'split',variant:0,pages:18},
  {slug:'daechi-45',en:'DAECHI',words:['Around','the table.'],subtitle:'식탁을 중심으로 이어지는 장면',lead:'길게 놓인 테이블과 투명한 펜던트, 빛이 닿는 수납장이 하나의 풍경을 이룹니다. 거실과 주방을 오가는 시선 속에서 가구의 선과 반사되는 표면을 함께 살펴봅니다.',paper:'#f6f3eb',ink:'#242a27',accent:'#7d8063',deep:'#40483f',cover:'masthead',variant:1,pages:16},
  {slug:'seorae-70',en:'SEORAE',words:['A softer','statement.'],subtitle:'밝은 공간에 놓인 조형적인 순간',lead:'밝은 바탕 위로 테이블의 무늬와 의자의 곡선이 선명해집니다. 여러 점으로 흩어진 조명과 창가의 빛, 가볍게 놓인 가구가 만드는 간격을 따라 공간을 읽습니다.',paper:'#f5f0e8',ink:'#352c28',accent:'#8e5344',deep:'#6e493f',cover:'frame',variant:2,pages:14},
  {slug:'seocho-53',en:'SEOCHO',words:['Room','for colour.'],subtitle:'흰 공간 속에 머무는 색',lead:'흰 벽과 바닥 사이로 가구와 그림, 꽃의 색이 들어옵니다. 공간 전체를 가볍게 바라본 뒤, 곡선과 작은 오브제가 만들어 내는 가까운 장면으로 시선을 옮깁니다.',paper:'#f9f8f0',ink:'#303328',accent:'#718158',deep:'#535c44',cover:'gallery',variant:3,pages:16},
  {slug:'seongbuk-52',en:'SEONGBUK',words:['Open','routine.'],subtitle:'책과 식탁이 함께 놓인 일상',lead:'열린 책장과 긴 테이블이 공용 공간의 풍경을 만듭니다. 밝은 면들이 이어지는 집 안에서 책의 색과 가벼운 조명, 커튼의 결이 작은 리듬을 더합니다.',paper:'#f5f6f2',ink:'#252f30',accent:'#6e8586',deep:'#33474a',cover:'type',variant:4,pages:16},
  {slug:'yongin-68',en:'YONGIN',words:['Material','stillness.'],subtitle:'나무의 결, 돌의 면, 부드러운 빛',lead:'서로 다른 표면이 차분한 색의 범위 안에서 만납니다. 큰 창을 따라 놓인 소파와 낮은 테이블, 공용 공간으로 이어지는 긴 시선 속에서 재료의 질감이 드러납니다.',paper:'#eee9dd',ink:'#3d3830',accent:'#8b7859',deep:'#514b3c',cover:'bleed',variant:5,pages:18},
  {slug:'ichon-32',en:'ICHON',words:['Less,','closer.'],subtitle:'작은 간격으로 읽는 집',lead:'적은 색과 단정한 가구가 공간을 차분하게 정리합니다. 식탁과 소파, 벽에 숨은 수납과 문 사이의 가까운 관계를 살펴보며 집 안의 장면을 따라갑니다.',paper:'#f1eee6',ink:'#30322d',accent:'#9b8e72',deep:'#464a3e',cover:'split',variant:6,pages:14,square:true},
  {slug:'jamsil-50',en:'JAMSIL',words:['Lines','of light.'],subtitle:'면을 따라 이어지는 조명의 선',lead:'천장과 벽의 선을 따라 빛이 이어지고, 밝은 가구가 그 아래에 놓입니다. 넓은 공용 공간의 흐름부터 손이 닿는 가까운 디테일까지 차례로 시선을 좁혀 봅니다.',paper:'#f4eee4',ink:'#3b342e',accent:'#a87953',deep:'#675445',cover:'masthead',variant:7,pages:18},
  {slug:'cheongdam-57',en:'CHEONGDAM',words:['Stone','& shadow.'],subtitle:'표면의 무늬와 그림자의 깊이',lead:'큰 무늬의 벽과 어두운 가구, 길게 놓인 빛의 선이 강한 대비를 이룹니다. 거친 듯 섬세한 표면과 매끈한 면을 번갈아 보며 공간의 깊이를 살펴봅니다.',paper:'#e9e8e1',ink:'#202322',accent:'#7a806d',deep:'#232a28',cover:'split',variant:8,pages:18},
  {slug:'printech-office',en:'PRINTECH',words:['Work','in light.'],subtitle:'빛과 동선으로 읽는 일하는 공간',lead:'업무 공간과 회의 공간, 그 사이를 잇는 동선이 사진 속에서 이어집니다. 선형 조명과 반복되는 가구, 유리와 불투명한 면의 대비가 만드는 풍경을 기록합니다.',paper:'#f2f4f2',ink:'#253039',accent:'#587c94',deep:'#2a404d',cover:'gallery',variant:9,pages:14,landscape:true},
  {slug:'hanam-35',en:'HANAM',words:['Everyday','balance.'],subtitle:'따뜻한 색이 균형을 만드는 집',lead:'절제된 색의 공간에 소파와 작은 빛이 온기를 더합니다. 하나로 이어진 공용 공간을 넓게 바라본 뒤, 가구와 벽이 만나는 가까운 지점으로 이동합니다.',paper:'#f4eee3',ink:'#37332c',accent:'#b17c43',deep:'#6c523c',cover:'frame',variant:10,pages:16},
  {slug:'hannam-33',en:'HANNAM',words:['Shapes','of home.'],subtitle:'가구의 실루엣이 남기는 인상',lead:'각기 다른 곡선의 가구가 차분한 공간 위에 놓입니다. 테이블과 의자의 실루엣, 작은 조명의 색과 벽의 질감이 한 장면 안에서 만나는 모습을 담았습니다.',paper:'#ecebe4',ink:'#292d29',accent:'#7c8b66',deep:'#343d36',cover:'type',variant:11,pages:14,square:true},
];
const BASE='/portfolios/interior-show';
const SANS="'Montserrat'", KOREAN="'Noto Sans KR'", SERIF="'Playfair Display'";
export const interiorShowBookId = (slug:string) => `inshow-pf-${slug}-v1`;

function compose(site:Site,d:Direction):Flipbook {
  let serial=0;
  const eid=()=>`${site.slug}-e${++serial}`;
  const paper=d.paper, ink=d.ink, muted=d.accent, bone='#f5f2ea';
  const width=d.landscape?1200:d.square?1000:900, height=d.landscape?900:d.square?1000:1200;
  const pages:BookPage[]=[];
  const photo=(n:number)=>site.photos[n%site.photos.length];
  const T=(text:string,x:number,y:number,w:number,h:number,size=20,color=ink,extra:Partial<TextElement>={}):TextElement=>({id:eid(),type:'text',text,x,y,w,h,size:size*(d.landscape?.72:d.square?.82:1),color,bold:false,align:'left',font:KOREAN,lineHeight:1.7,...extra});
  const H=(text:string,x:number,y:number,w:number,h:number,size=85,color=ink,serif=false)=>T(text,x,y,w,h,size,color,{font:serif?SERIF:SANS,bold:!serif,lineHeight:1.04,spacing:serif?-15:-45});
  const K=(text:string,x:number,y:number,w=82,color=muted)=>T(text,x,y,w,3,12,color,{font:SANS,lineHeight:1.25,spacing:100});
  const P=(n:number,x:number,y:number,w:number,h:number,fit:'cover'|'contain'='cover'):BookElement=>({id:eid(),type:'image',src:photo(n).src,x,y,w,h,fit});
  const R=(x:number,y:number,w:number,h:number,fill:string):BookElement=>({id:eid(),type:'shape',shape:'rect',fill,x,y,w,h});
  const L=(x:number,y:number,w:number,color=muted):BookElement=>({id:eid(),type:'line',x,y,w,h:.1,color,thickness:.5,style:'solid',arrow:false});
  const logo=(x:number,y:number,w=23,reverse=false):BookElement=>({id:eid(),type:'image',src:`${BASE}/brand/${reverse?'reverse':'primary'}.svg`,x,y,w,h:w*(width/height)/3.2,fit:'contain'});
  const add=(title:string,elements:BookElement[],background=paper)=>{const p={id:`${site.slug}-p${String(pages.length).padStart(2,'0')}`,title,background,elements};pages.push(p);return p;};
  const folio=(section:string,reverse=false)=>[K(section.toUpperCase(),6,95,72,reverse?bone:muted),T(String(pages.length+1).padStart(2,'0'),87,94.8,7,3,13,reverse?bone:muted,{font:SANS,align:'right',lineHeight:1.2})];
  const caption=(text:string,n:number,x=7,y=89,w=86)=>T(`${text}  ↗`,x,y,w,4,15,muted,{actions:[{kind:'popupImage',src:photo(n).src}],font:KOREAN,lineHeight:1.35});

  // Each title page is composed for its selected photograph; no cover is a flattened image.
  switch(d.cover){
    case 'split':add('표지',[R(0,0,43,100,d.deep),P(0,43,0,57,100),logo(5,5,29,true),K('A RESIDENTIAL MONOGRAPH',6,23,32,bone),H(d.en,6,35,32,9,d.en.length>7?40:63,bone),H(site.name.match(/\d+/)?.[0]||'',6,48,33,18,158,bone),T(site.name,6,77,32,6,21,bone),K('INTERIOR SHOW / PRIVATE RESIDENCE',6,91,32,bone)],d.deep);break;
    case 'masthead':add('표지',[logo(5,4,23),K('RESIDENTIAL STUDIES / '+site.name.replace(/.*?(\d+PY)/,'$1'),60,7,35),H(d.en,5,15,90,12,d.en.length>7?96:126),L(6,30,88),P(0,6,35,58,59),T(d.subtitle,69,59,25,14,27,ink,{font:"'Noto Serif KR'",lineHeight:1.55}),K(site.name,69,86,25),K('A CLOSER LOOK AT HOME',69,92,25)]);break;
    case 'frame':add('표지',[P(0,7,6,86,63),logo(7,74,28),H(d.en,7,82,86,10,102,ink,true),T(d.subtitle,7,94,70,3,17),T(site.name,75,94,19,3,15,muted,{align:'right'})]);break;
    case 'type':add('표지',[K('INTERIOR SHOW / MONOGRAPH',6,6),H(d.en,5,15,90,12,91),P(0,34,33,60,61),H(site.name.match(/\d+/)?.[0]||'01',6,37,25,17,156,muted),T(d.words.join('\n'),6,67,24,14,36,ink,{font:SERIF,lineHeight:1.12}),K(site.name,6,92,25),logo(81,95,13)]);break;
    case 'bleed':add('표지',[P(0,0,0,100,83),logo(6,88,26),H(d.en,42,88,52,8,73,ink,true),K(d.subtitle,42,97,52),K(site.name,6,97,26)]);break;
    case 'gallery':add('표지',[logo(5,4,25),K('SPATIAL PORTFOLIO',62,7,33),H(d.en,5,16,90,12,d.landscape?94:108),P(1,5,36,90,48),L(5,90,90),T(d.subtitle,5,93,65,4,20),K(site.name,76,94,19)]);break;
  }
  add('현장 소개',[
    K('THE PROJECT / '+d.en,7,7),H(d.words[0],6,17,88,12,101,ink,true),H(d.words[1],6,30,88,12,101,ink,true),
    L(7,49,86),T(site.name,7,54,35,6,29,ink,{bold:true}),T(d.subtitle,48,54,45,9,24),
    T(d.lead,7,68,70,18,23),...folio('A photographic reading'),
  ]);
  add('공간의 첫 장면',[P(1,0,0,100,88),caption('공간을 넓게 바라보다',1,6,91,88)]);
  const index=add('목차와 공간의 흐름',[
    K('READING THE SPACE',7,7),H('Inside\nthe project.',7,16,86,23,80),
    P(9,7,46,32,40),T('넓은 시선에서\n가까운 디테일로.',47,50,46,11,32,ink,{font:"'Noto Serif KR'",lineHeight:1.45}),
    ...folio('Contents / tap to explore'),
  ]);
  add('장면의 연결',d.variant%3===0?[
    P(2,0,0,100,64),H('Space,\nin sequence.',7,70,61,18,60,ink,true),T('하나의 장면을 보고,\n그 옆으로 이어진 장면을 읽습니다.',70,76,24,11,18),
  ]:d.variant%3===1?[
    P(2,7,8,62,77),K('01 / OVERVIEW',75,9,19),T('이어지는\n시선',75,25,19,20,38,ink,{font:"'Noto Serif KR'",lineHeight:1.4}),caption('장면의 연결',2,7,89,86),
  ]:[P(2,7,10,86,53),H('A connected\nview.',7,70,86,18,70,ink,true),...folio('Visual sequence')]);

  const living=add(d.landscape?'업무 공간':'공용 공간',d.variant%2===0?[
    P(3,0,0,100,72),K('02 / SHARED SPACE',7,77),H('The shared\nlandscape.',7,83,86,13,59,ink,true),
  ]:[K('02 / SHARED SPACE',7,7),H('A place\nto gather.',7,16,86,21,84,ink,true),P(3,7,44,86,43),caption('함께 놓인 가구와 공간',3,7,90)]);
  add('가까이 놓인 장면',[
    P(4,6,8,51,67),P(5,63,27,31,48),K('A DIFFERENT DISTANCE',6,82,88),T('같은 공간도 거리를 바꾸면\n다른 장면이 됩니다.',6,87,71,9,24),
  ]);

  const wide=photo(6).width>photo(6).height?6:1;
  add('파노라마 · 왼쪽',[P(wide,0,0,200,100)]);
  add('파노라마 · 오른쪽',[P(wide,-100,0,200,100)]);

  if(d.pages>=16){
    add('면과 질감',[
      K('03 / SURFACES',7,7),H('Surface\n& light.',7,17,86,23,86,ink,true),P(7,7,48,41,40),P(8,55,59,38,29),...folio('Between materials'),
    ]);
    add('빛을 담는 디테일',d.variant%2===0?[P(10,0,0,74,100),T('빛이\n머무는\n표면',80,12,15,24,30,ink,{font:"'Noto Serif KR'",lineHeight:1.6}),K('DETAIL / 03',80,89,15)]:[P(10,7,7,86,72),caption('표면에 닿는 빛',10,7,83),T('질감과 그림자가 만드는 가까운 풍경.',7,91,86,5,21)]);
  }
  const quiet=add(d.landscape?'회의와 전환':'안쪽의 공간',[
    P(11,7,7,86,54),K(d.landscape?'04 / WORK & MEET':'04 / PRIVATE MOMENTS',7,67),
    H(d.landscape?'Another\nway to work.':'A quieter\nmoment.',7,75,86,17,68,ink,true),
  ]);
  add('조용한 순간',[
    P(12,6,8,41,77),P(13,53,8,41,49),T(d.landscape?'집중하는 공간과\n함께 이야기하는 공간.':'큰 풍경을 지나\n다시 가까운 장면으로.',53,65,41,13,27,ink,{font:"'Noto Serif KR'",lineHeight:1.6}),...folio(d.landscape?'Work / together':'Rest / retreat'),
  ]);
  if(d.pages===18){
    add('사진 노트',[K('THE PHOTO NOTE',7,7),H('Closer.',7,17,86,12,114,ink,true),P(14,7,38,60,49),T('공간의 선을 따라\n시선을 옮깁니다.',74,57,20,20,24),...folio('A closer observation')]);
    add('장면의 다른 표정',[P(15,0,0,100,88),caption('장면의 다른 표정',15,6,91,88)]);
  }
  const credit=add('프로젝트 노트',[
    K('PROJECT NOTES',7,7),H('The\nparticulars.',7,17,86,23,81,ink,true),L(7,49,86),
    T('현장',7,54,27,4,18,muted),T(site.name,38,53,55,6,27),L(7,63,86),
    T('기록',7,68,27,4,18,muted),T('인테리어쇼 제공 사진·현장자료',38,68,55,5,19),
    T('구성',7,77,27,4,18,muted),T('현장 사진을 선별한 개별 포트폴리오',38,77,55,5,19),
    T('프로젝트 원문 보기 ↗',7,89,65,5,18,ink,{actions:[{kind:'url',url:site.source}]}),
  ]);
  add('사진 색인',[P(0,7,8,25,31),P(2,37,8,25,31),P(4,67,8,25,31),P(7,7,45,40,39),P(10,53,45,39,39),K('ONE SITE / A SERIES OF MOMENTS',7,91,86)]);
  add('뒤표지',[logo(7,8,34,true),L(7,24,86,bone),H(d.words.join('\n'),7,42,86,25,87,bone,true),T(site.name,7,81,86,5,25,bone),T('INTERIOR SHOW',7,93,86,3,12,bone,{font:SANS,spacing:160,lineHeight:1.2})],d.deep);

  const jump=(text:string,p:BookPage,y:number)=>T(text+'  ↗',47,y,46,5,17,ink,{actions:[{kind:'page',pageId:p.id}],lineHeight:1.4});
  index.elements.push(jump(d.landscape?'업무 공간':'공용 공간',living,65),jump(d.landscape?'회의와 전환':'안쪽의 공간',quiet,73),jump('프로젝트 노트',credit,81));
  for(const p of pages.slice(3,-1)){
    if(p===index || p.title?.startsWith('파노라마'))continue;
    p.elements.push(T('INDEX ↖',84,97,10,2,10,muted,{font:SANS,align:'right',lineHeight:1.1,actions:[{kind:'page',pageId:index.id}]}));
  }
  return {id:interiorShowBookId(site.slug),title:`인테리어쇼 · ${site.name}`,width,height,background:'#d9d8d1',reader:{effect:'paper',duration:850,sound:'paper',volume:.4},pages,assets:[...site.photos.map(p=>({url:p.src,kind:'image' as const})),{url:`${BASE}/brand/primary.svg`,kind:'image'},{url:`${BASE}/brand/reverse.svg`,kind:'image'}],published:false,createdAt:0,updatedAt:0};
}

function singlePhotoBook(site:Site):Flipbook {
  const src=site.photos[0].src, ink='#3c4439', paper='#f1eee4';
  let n=0;
  const t=(text:string,x:number,y:number,w:number,h:number,size:number,color=ink):TextElement=>({id:`hanam45-t${++n}`,type:'text',text,x,y,w,h,size,color,bold:false,align:'left',font:KOREAN,lineHeight:1.6});
  const p=(x:number,y:number,w:number,h:number):BookElement=>({id:`hanam45-i${++n}`,type:'image',src,x,y,w,h,fit:'cover'});
  const page=(id:string,title:string,elements:BookElement[],background=paper):BookPage=>({id,title,elements,background});
  return {id:interiorShowBookId(site.slug),title:`인테리어쇼 · ${site.name}`,width:900,height:1200,background:'#dadbd3',reader:{effect:'paper',duration:850,sound:'paper',volume:.4},pages:[
    page('hanam45-cover','표지',[{...t('HANAM',7,9,86,14,128),font:SANS,bold:true,lineHeight:1},{...t('45PY / A FIRST LOOK',7,26,86,4,16),font:SANS},p(7,37,86,49),t(site.name,7,92,86,4,24)]),
    page('hanam45-note','현장 소개',[{...t('A first\nlook.',8,13,84,28,108),font:SERIF,lineHeight:1.02},t('한 장의 사진으로 읽는 공간',8,48,84,6,30),t('밝은 바탕과 긴 가구, 천장에 이어진 빛의 선이 한 장면 안에 놓입니다. 제공된 원본 사진 한 장을 중심으로 구성한 짧은 포트폴리오입니다.',8,63,77,22,25),{...t('프로젝트 원문 보기 ↗',8,91,75,5,18),actions:[{kind:'url',url:site.source}]}]),
    page('hanam45-photo','공간 전경',[p(0,15,100,50),{...t('THE SHARED LANDSCAPE',7,73,86,4,16),font:SANS},t('하남 45PY',7,82,86,6,37),{...t('사진 크게 보기 ↗',7,93,86,4,16),actions:[{kind:'popupImage',src}]}]),
    page('hanam45-back','뒤표지',[{id:'hanam45-logo',type:'image',src:`${BASE}/brand/reverse.svg`,x:10,y:12,w:42,h:11,fit:'contain'},t('하남 45PY',10,71,80,7,38,'#f1eee4'),t('INTERIOR SHOW / PHOTO MONOGRAPH',10,91,80,4,14,'#f1eee4')],ink),
  ],assets:[{url:src,kind:'image'}],published:false,createdAt:0,updatedAt:0};
}
export const INTERIOR_SHOW_PORTFOLIOS: Flipbook[] = manifest.map(site=>site.slug==='hanam-45'?singlePhotoBook(site):compose(site,directions.find(d=>d.slug===site.slug)!)).map(enhanceInteriorShowBook);
export function createInteriorShowPortfolio(slug:string):Flipbook {
  const source=INTERIOR_SHOW_PORTFOLIOS.find(book=>book.id===interiorShowBookId(slug));
  if(!source)throw new Error('현장 포트폴리오를 찾을 수 없습니다.');
  const now=Date.now();return {...structuredClone(source),createdAt:now,updatedAt:now};
}
