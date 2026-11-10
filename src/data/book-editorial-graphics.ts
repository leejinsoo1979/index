import type {BookElement,BookPage,Flipbook,TextElement} from '../lib/flipbooks';

const PREFIX='magazine-v2:';
export const hasEditorialGraphics=(book:Flipbook)=>book.pages[0]?.elements.some(e=>e.id.startsWith(PREFIX))??false;

/** Native vector elements, grouped as editable editorial furniture. No raster overlays. */
function pen(book:Flipbook,page:BookPage,color:string){
 let n=0;const elements:BookElement[]=[];const aspect=book.width/book.height;
 const base=()=>({id:`${PREFIX}${book.id}:${page.id}:${++n}`,groupId:`${PREFIX}${page.id}`});
 const rule=(x:number,y:number,w:number,c=color,weight=.7)=>elements.push({...base(),type:'line',x,y,w,h:.1,color:c,thickness:weight,style:'solid',arrow:false});
 const bar=(x:number,y:number,w:number,h:number,c=color)=>elements.push({...base(),type:'shape',shape:'rect',fill:c,x,y,w,h});
 const circle=(x:number,y:number,w:number,fill='transparent',stroke=color)=>elements.push({...base(),type:'shape',shape:'circle',x,y,w,h:w*aspect,fill,borderColor:stroke,borderWidth:fill==='transparent'?.8:0});
 const label=(text:string,x:number,y:number,w:number,size=10,c=color,extra:Partial<TextElement>={})=>elements.push({...base(),type:'text',text,x,y,w,h:Math.max(2,size*.12*aspect),size,color:c,bold:false,align:'left',font:"'Montserrat'",spacing:80,lineHeight:1.1,...extra});
 const plus=(x:number,y:number,w=2,c=color)=>{rule(x,y+w*aspect/2,w,c,.8);bar(x+w/2,y,.08,w*aspect,c);};
 const orbit=(x:number,y:number,w:number)=>{circle(x,y,w);circle(x+w*.24,y+w*aspect*.24,w*.52);plus(x+w*.37,y+w*aspect*.37,w*.26);};
 const corners=(e:BookElement,c=color)=>{
   const g=1.2,len=2.5;
   for(const [x,y,sx,sy] of [[e.x-g,e.y-g,-1,-1],[e.x+e.w+g,e.y-g,1,-1],[e.x-g,e.y+e.h+g,-1,1],[e.x+e.w+g,e.y+e.h+g,1,1]]){
    const rx=sx===-1?x:x-len,ry=sy===-1?y:y-len*aspect;
    if(rx>=0&&rx+len<=100&&ry>=0&&ry+len*aspect<=100){rule(rx,y,len,c,.55);bar(x,ry,.07,len*aspect,c);}
   }
 };
 return {elements,rule,bar,circle,label,plus,orbit,corners};
}
const dark=(color='#fff')=>{const v=color.replace('#','');if(!/^[\da-f]{6}$/i.test(v))return false;return .2126*parseInt(v.slice(0,2),16)+.7152*parseInt(v.slice(2,4),16)+.0722*parseInt(v.slice(4,6),16)<115;};
const accentFor=(book:Flipbook)=>book.pages.flatMap(p=>p.elements).find(e=>e.type==='text'&&e.size<=16&&e.color!=='#f5f2ea'&&e.color!=='#f1eee4') as TextElement|undefined;

/** Adds furniture only; all existing photo, text, action, page and book IDs are preserved. */
export function enhanceInteriorShowBook(book:Flipbook):Flipbook{
 if(hasEditorialGraphics(book))return book;
 const accent=accentFor(book)?.color??'#7c806c';
 const pages=book.pages.map((page,i)=>{
  const inverted=dark(page.background),ink=inverted?'#f0eee5':accent;
  const p=pen(book,page,ink),title=page.title??'';
  if(i===0){
   const slug=book.id;
   if(/daejang|ichon|cheongdam/.test(slug)){
    p.rule(6,28,30);p.circle(35,27.6,1,ink);p.rule(6,69,30);p.plus(32,71,3);p.label('MONOGRAPH / 01',6,71,25,10);
   }else if(/daechi|jamsil/.test(slug)){p.orbit(75,36,14);p.rule(69,53,25);p.label('FORM / LIGHT',69,55,25,10);}
   else if(/seorae|hanam-35/.test(slug)){
    const photo=page.elements.find(e=>e.type==='image'&&!e.src.includes('/brand/'));if(photo)p.corners(photo);
    p.rule(7,71,69);p.plus(89,70.3,3);p.label('A SERIES OF SPACES',7,71.8,65,9);
   }else if(/seongbuk|hannam/.test(slug)){
    p.rule(6,31,88);p.circle(6,58,5);p.circle(13,58,5,ink);p.circle(20,58,5);p.label('SPATIAL STUDIES',6,63,26,9);
   }else if(/yongin/.test(slug)){p.rule(6,85,88);p.plus(91,84,2.4);}
   else{p.rule(5,31,90);p.circle(87,29,1,ink);p.circle(90,29,1,ink);p.circle(93,29,1,ink);}
  }else if(i===book.pages.length-1){
   if(title==='뒤표지'){p.orbit(75,28,14);p.plus(7,34,3);p.rule(7,73,86);}
  }else if(title==='현장 소개'){
   if(book.pages.length>4){p.orbit(81,72,11);p.label('01',84,84,9,15,ink,{bold:true});p.bar(7,89,9,.45);}
   else{p.rule(8,44,84);p.plus(87,87,3);}
  }else if(title==='목차와 공간의 흐름'){
   p.rule(47,63,46);p.rule(47,71,46);p.rule(47,79,46);p.rule(47,87,46);
   [65,73,81].forEach((y,n)=>{p.circle(41,y,3.6);p.label(String(n+1),41,y+.45,3.6,11,ink,{align:'center'});});
  }else if(title==='가까이 놓인 장면'){
   p.orbit(77,9,12);p.label('02 / DETAILS',63,22,31,10);p.rule(6,79,88);
   p.label('01',6,76,7,12);p.label('02',63,76,7,12);
  }else if(title==='면과 질감'){
   p.rule(55,45,38);['#c3b39d',accent,'#393e38'].forEach((c,n)=>p.circle(55+n*11,49,7,c,c));
  }else if(title==='프로젝트 노트'){
   p.bar(33,54,.08,29);p.circle(85,7,6);p.plus(86.8,7+1.8*(book.width/book.height),2.4);
   // The project data is a register, not an invented technical specification.
  }else if(title==='사진 색인'){
   const photos=page.elements.filter(e=>e.type==='image');photos.forEach((e,n)=>{p.rule(e.x,e.y+e.h+1.3,e.w);p.label(String(n+1).padStart(2,'0'),e.x,e.y+e.h+2,8,10);});
  }else if(title==='공용 공간'||title==='업무 공간'){
   const image=page.elements.find(e=>e.type==='image');
   if(image&&image.y===0){p.rule(48,78,45);p.circle(92,76.6,2);}
   else{p.rule(7,40,86);p.plus(90,7,2);}
  }else if(title==='안쪽의 공간'||title==='회의와 전환'){
   p.rule(7,64,86);p.circle(89,67,4);p.label('04',89,67.7,4,10,ink,{align:'center'});
  }else if(title==='빛을 담는 디테일'){
   const image=page.elements.find(e=>e.type==='image');
   if(image?.x===0){p.plus(84,48,6);p.rule(80,54,14);}
   else if(image)p.corners(image);
  }else if(title==='장면의 연결'){
   const image=page.elements.find(e=>e.type==='image');if(image&&image.x>0)p.corners(image);
  }else if(title==='조용한 순간'){
   p.rule(53,60,41);p.label('A PRIVATE VIEW',53,61,41,10);
  }else if(title==='사진 노트'){p.rule(7,33,86);p.plus(81,12,9);}
  else if(title==='공간 전경'&&book.pages.length===4){p.rule(7,70,86);p.circle(88,83,5);}
  // Pure photographic panoramas deliberately have no furniture.
  return p.elements.length?{...page,elements:[...page.elements,...p.elements]}:page;
 });
 return {...book,pages};
}

/** Template furniture uses vacant margins, not opaque boxes on top of text or photography. */
export function enhanceMagazineTemplate(book:Flipbook,accent:string,variant:number):Flipbook{
 if(hasEditorialGraphics(book))return book;
 return {...book,pages:book.pages.map((page,index)=>{
  const ink=dark(page.background)?'#ebe7da':accent;
  const p=pen(book,page,ink);
  const content=page.elements.filter(e=>e.type==='image'||e.type==='text'||e.type==='grid');
  const free=(x:number,y:number,w:number,h:number)=>content.every(e=>x+w<=e.x-.4||x>=e.x+e.w+.4||y+h<=e.y-.4||y>=e.y+e.h+.4);
  // Eight different arrangements of circles, rules, crosshairs and section counters.
  const candidates=index===0?[[74,27],[74,39],[70,64],[8,30],[8,49],[69,11],[8,78],[73,78]]:[[76,15],[76,36],[76,73],[8,35],[8,82],[48,37]];
  const zone=candidates.find(([x,y])=>free(x,y,17,12));
  if(zone){const[x,y]=zone;
   switch(variant%4){
    case 0:p.orbit(x,y,12);p.label(String(index+1).padStart(2,'0'),x+13,y,5,10);break;
    case 1:p.circle(x,y,5,ink);p.circle(x+6,y,5);p.circle(x+12,y,5);p.rule(x,y+8,17);break;
    case 2:p.plus(x,y,8);p.rule(x+11,y,6);p.rule(x+11,y+3,6);p.rule(x+11,y+6,6);p.label('STUDY / '+String(index+1).padStart(2,'0'),x,y+10,18,8);break;
    case 3:p.bar(x,y,4,4*book.width/book.height);p.circle(x+6,y,4);p.bar(x+12,y,.1,6);p.rule(x,y+9,17);break;
   }
  }
  const image=page.elements.find(e=>e.type==='image'&&e.x>=4&&e.y>=4&&e.x+e.w<=96&&e.y+e.h<=92);
  if(image&&index%3===1){
   // Keep crop marks outside photographs and clear of nearby copy.
   if(free(image.x-2,image.y-2,image.w+4,1)&&free(image.x-2,image.y+image.h+1,image.w+4,1))p.corners(image);
  }
  if(free(6,98,88,1)){
   p.rule(6,98,74,ink,.5);p.circle(83,97.7,.65,ink);
   p.label(String(index+1).padStart(2,'0')+' / '+String(book.pages.length).padStart(2,'0'),86,97.6,9,9,ink,{align:'right'});
  }
  return {...page,elements:[...page.elements,...p.elements]};
 })};
}
