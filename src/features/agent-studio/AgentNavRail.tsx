import type { IconType } from "react-icons";
import { FiBookOpen, FiCheckSquare, FiCpu, FiFileText, FiFolder, FiHome, FiMessageSquare, FiSettings, FiShare2 } from "react-icons/fi";
import { ResizeHandle, useResizable } from "./Resizable";

export type AgentSection = "home" | "projects" | "documents" | "agents" | "knowledge" | "ontology" | "messenger" | "tasks" | "settings";

const ITEMS: Array<{ icon: IconType; label: string; section: AgentSection }> = [
  { icon: FiHome, label: "홈", section: "home" },
  { icon: FiFolder, label: "프로젝트", section: "projects" },
  { icon: FiFileText, label: "문서", section: "documents" },
  { icon: FiCpu, label: "에이전트", section: "agents" },
  { icon: FiBookOpen, label: "지식베이스", section: "knowledge" },
  { icon: FiShare2, label: "온톨로지", section: "ontology" },
  { icon: FiMessageSquare, label: "메신저", section: "messenger" },
  { icon: FiCheckSquare, label: "작업센터", section: "tasks" },
  { icon: FiSettings, label: "설정", section: "settings" },
];

export default function AgentNavRail({ section, onSelect }: { section: AgentSection; onSelect: (section: AgentSection) => void }) {
  const panel = useResizable({ initial: 176, min: 72, max: 280, side: "right", storageKey: "archi.nav.w" });
  return <nav className="archi-nav" style={{ width: panel.width }}>
    <a href="/" className="archi-nav__brand"><span>A</span><strong>ARCHI<small>Agent Studio</small></strong></a>
    <div className="archi-nav__items">{ITEMS.map((item) => { const Icon = item.icon; return <button key={item.section} type="button" className={section === item.section ? "is-active" : ""} onClick={() => onSelect(item.section)}><Icon aria-hidden />{item.label}</button>; })}</div>
    <div className="archi-nav__plan"><strong>Pro 플랜</strong><p>AI 생성과 내보내기를<br />무제한으로 사용하세요</p><button type="button">업그레이드</button></div>
    <ResizeHandle side="right" onPointerDown={panel.beginResize} />
  </nav>;
}
