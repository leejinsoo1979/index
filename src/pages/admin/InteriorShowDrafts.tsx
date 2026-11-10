import {useState} from 'react';
import {getFlipbook,saveFlipbook,type Flipbook} from '../../lib/flipbooks';
import {enhanceInteriorShowBook,hasEditorialGraphics} from '../../data/book-editorial-graphics';
import './InteriorShowDrafts.css';

/** Import missing commissions; enrich existing ones without replacing their text or photos. */
export default function InteriorShowDrafts({books,onCreated}:{books:Flipbook[];onCreated:(books:Flipbook[])=>void}){
  const [busy,setBusy]=useState(false);
  const [progress,setProgress]=useState('');
  const [error,setError]=useState('');
  const existing=books.filter(book=>/^inshow-pf-.+-v1$/.test(book.id));
  const completed=existing.length;
  const outdated=existing.filter(book=>!hasEditorialGraphics(book));
  if(completed===13&&outdated.length===0&&!busy)return null;

  async function save(){
    setBusy(true);setError('');const added:Flipbook[]=[];
    try{
      if(completed===13){
        for(const [i,book] of outdated.entries()){
          setProgress(`${i+1} / ${outdated.length} · ${book.title.replace('인테리어쇼 · ','')}`);
          const fresh=await getFlipbook(book.id);
          if(!fresh)continue;
          const enriched=enhanceInteriorShowBook(fresh);
          if(enriched!==fresh)await saveFlipbook(enriched);
          added.push(enriched);
        }
      }else{
        const {INTERIOR_SHOW_PORTFOLIOS,createInteriorShowPortfolio}=await import('../../data/interior-show-portfolios');
        for(const [i,source] of INTERIOR_SHOW_PORTFOLIOS.entries()){
          setProgress(`${i+1} / 13 · ${source.title.replace('인테리어쇼 · ','')}`);
          const found=await getFlipbook(source.id);
          const draft=found?enhanceInteriorShowBook(found):createInteriorShowPortfolio(source.id.replace('inshow-pf-','').replace(/-v1$/,''));
          if(!found||draft!==found)await saveFlipbook(draft);
          added.push(draft);
        }
      }
    }catch{setError('일부 책을 저장하지 못했습니다. 다시 누르면 나머지 책부터 이어집니다.');}
    finally{onCreated(added);setBusy(false);setProgress('');}
  }
  const upgrade=completed===13;
  return <div className="inshow-import">
    <div><span>INTERIOR SHOW / PROJECT MONOGRAPHS</span><h2>{upgrade?'편집 디자인을 더하다.':'현장 하나, 책 한 권.'}</h2><p>{upgrade?'섹션 번호·코너 프레임·기하학 모티프·가는 선을 기존 책에 추가합니다.':'13개 현장의 사진으로 편집한 개별 포트폴리오를 비공개 초안으로 추가합니다.'}</p>{error&&<p role="alert">{error}</p>}</div>
    <button type="button" className="admin-btn" disabled={busy} onClick={()=>void save()}>{busy?`저장 중 ${progress}`:upgrade?`${outdated.length}권 매거진 디자인 반영`:completed?`남은 ${13-completed}권 추가`:'현장별 포트폴리오 13권 추가'}</button>
    <small role="status">{busy?'편집 가능한 그래픽 요소를 저장하고 있습니다.':upgrade?'사진·글·목차 링크는 유지하며 그래픽도 각각 편집할 수 있습니다.':'선별 사진 190장 · 현장별 독립 구성'}</small>
  </div>;
}
