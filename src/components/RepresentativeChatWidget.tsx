import { lazy,Suspense,useEffect,useState } from 'react';
import { Dialog } from 'radix-ui';
import { MessageCircle,X } from 'lucide-react';
import { REPRESENTATIVE,type ExpertProfile } from '../types/personas';
import { expertRequest } from '../lib/personas';
import '../pages/Experts.css';
const Conversation=lazy(()=>import('../pages/ExpertChat').then(m=>({default:m.ExpertConversation})));
export default function RepresentativeChatWidget(){
  const [open,setOpen]=useState(false),[profile,setProfile]=useState(REPRESENTATIVE);
  useEffect(()=>{if(open)void expertRequest<{profile:ExpertProfile}>('profile',{personId:REPRESENTATIVE.id}).then(r=>setProfile(r.profile)).catch(()=>undefined);},[open]);
  return <Dialog.Root open={open} onOpenChange={setOpen}><Dialog.Trigger className="expert-launcher"><img src={profile.animation||profile.poster} alt=""/><span><strong>{profile.name}에게 질문</strong><small>개인 AI와 대화하기</small></span><MessageCircle size={20}/></Dialog.Trigger><Dialog.Portal><Dialog.Overlay className="expert-widget-overlay"/><Dialog.Content className="expert-widget-dialog" aria-describedby="expert-widget-description"><Dialog.Title className="expert-sr-only">{profile.name} 개인 채팅방</Dialog.Title><Dialog.Description id="expert-widget-description" className="expert-sr-only">본인의 지식과 말투 자료에 연결된 개인 AI와 대화합니다.</Dialog.Description><Dialog.Close className="expert-widget-close" aria-label="개인 채팅창 닫기"><X size={17}/></Dialog.Close><Suspense fallback={<div className="expert-loading">채팅방을 불러오는 중입니다.</div>}><Conversation profile={profile} compact/></Suspense></Dialog.Content></Dialog.Portal></Dialog.Root>;
}
