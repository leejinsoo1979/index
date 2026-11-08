import { useEffect,useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft,ArrowRight,Plus } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { expertRequest } from '../lib/personas';
import { REPRESENTATIVE,type ExpertProfile } from '../types/personas';
import { ExpertPortrait } from './ExpertChat';
import AiNav from '../components/AiNav';
import RepresentativeChatWidget from '../components/RepresentativeChatWidget';
import './Experts.css';
export default function Experts(){
  const {user,isAdmin}=useAuth();const [profiles,setProfiles]=useState<ExpertProfile[]>([REPRESENTATIVE]),[error,setError]=useState('');
  useEffect(()=>{let active=true;expertRequest<{profiles:ExpertProfile[]}>('directory').then(r=>{if(active){setProfiles(r.profiles);setError('');}}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[user?.uid]);
  return <main className="expert-shell expert-shell--dir">
    <AiNav/>
    <div className="expert-dir">
      <header className="expert-dir-hero">
        <span>KIAA 임원 · 개인 AI</span>
        <h1>INDEX 전문가들에게 직접 질문해보세요.</h1>
        <p>한국실내건축가협회 임원들이 쌓아 온 자료와 현장 경험을 바탕으로, 각자의 개인 AI가 답합니다.</p>
      </header>
      <div className="expert-dir-bar"><strong>임원 {profiles.length}명</strong>{isAdmin&&<Link to="/experts/new/settings"><Plus size={15}/>공간 배정</Link>}</div>
      {error&&<p className="expert-connection-error" role="alert">{error} 연결을 복구하면 저장된 공간을 확인할 수 있습니다.</p>}
      <section className="expert-dir-grid" aria-label="임원 개인 AI 목록">{profiles.map(p=><Link key={p.id} to={`/experts/${p.id}`} className="expert-dir-card">
        <ExpertPortrait profile={p}/>
        <div className="expert-dir-card-copy"><small>{p.role.replace(' · 개인 AI','')}</small><h2>{p.name}</h2><p>{p.bio}</p></div>
        <div className="expert-dir-card-foot"><b>질문하기<ArrowRight size={15}/></b></div>
      </Link>)}</section>
      <footer className="expert-dir-foot"><Link to="/"><ArrowLeft size={14}/>협회로 돌아가기</Link><span>각 임원의 자료와 설명 방식을 반영한 개인 AI와 대화합니다.</span></footer>
    </div>
    <RepresentativeChatWidget/>
  </main>;
}
