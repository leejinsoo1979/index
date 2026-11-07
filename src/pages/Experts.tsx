import { useEffect,useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft,ArrowUpRight,MessageCircle,Plus } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { isAdminEmail } from '../lib/adminStore';
import { expertRequest } from '../lib/personas';
import { REPRESENTATIVE,type ExpertProfile } from '../types/personas';
import { ExpertAvatar } from './ExpertChat';
import RepresentativeChatWidget from '../components/RepresentativeChatWidget';
import './Experts.css';
export default function Experts(){
  const {user}=useAuth();const [profiles,setProfiles]=useState<ExpertProfile[]>([REPRESENTATIVE]),[error,setError]=useState('');
  useEffect(()=>{let active=true;expertRequest<{profiles:ExpertProfile[]}>('directory').then(r=>{if(active){setProfiles(r.profiles);setError('');}}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[user?.uid]);
  return <main className="expert-shell expert-directory"><nav className="expert-top"><Link to="/" className="expert-brand">index<span>PEOPLE</span></Link><div><Link to="/ai">INDEX AI<ArrowUpRight size={14}/></Link><Link to="/">협회 사이트<ArrowUpRight size={14}/></Link></div></nav><section className="expert-directory-hero"><span className="expert-eyebrow">KNOWLEDGE, WITH A PERSON.</span><h1>지식 너머,<br/><em>사람과 이어지는 대화.</em></h1><p>전문가가 쌓아온 자료와 경험, 생각하는 방식.<br/>대화하고 싶은 사람을 선택해 질문해 보세요.</p><div className="expert-directory-caption"><span>{profiles.length}개의 개인 지식 공간</span>{isAdminEmail(user?.email)&&<Link to="/experts/new/settings"><Plus size={15}/>공간 배정</Link>}</div></section>{error&&<p className="expert-connection-error" role="alert">{error} 연결을 복구하면 저장된 공간을 확인할 수 있습니다.</p>}<section className="expert-profile-grid" aria-label="개인 AI 목록">{profiles.map(p=><article key={p.id} className="expert-profile-card"><div className="expert-profile-card-media"><ExpertAvatar profile={p} large/><span>PERSONAL AI</span></div><div className="expert-profile-card-copy"><span>{p.role}</span><h2>{p.name}</h2><p>{p.bio}</p><div><span>공유 지식 {p.documentCount}개</span><Link to={`/experts/${p.id}`}><MessageCircle size={15}/>질문하기<ArrowUpRight size={15}/></Link></div></div></article>)}</section><footer className="expert-directory-footer"><Link to="/"><ArrowLeft size={14}/>협회로 돌아가기</Link><span>각 인물의 지식과 설명 방식을 반영한 개인 AI와 대화합니다.</span></footer><RepresentativeChatWidget/></main>;
}
