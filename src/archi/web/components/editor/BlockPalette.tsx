'use client';

/**
 * Block insert palette — searchable, grouped, keyboard-driven (↑ ↓ Enter, Esc).
 * Replaces the old flat list of 30 block names behind the floating + button.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  BarChart3,
  BookMarked,
  Box,
  Calculator,
  CalendarRange,
  CheckSquare,
  Code2,
  Columns2,
  FileBadge,
  FileText,
  Hammer,
  Heading,
  Image,
  Images,
  Info,
  Link2,
  Megaphone,
  MessagesSquare,
  Network,
  PanelTop,
  Quote,
  Ruler,
  Scale,
  Search,
  Sparkles,
  Table,
  Tags,
  Type,
  Wallet,
} from 'lucide-react';

export type PaletteItem = {
  type: string;
  label: string;
  desc: string;
  icon: ReactNode;
  keywords?: string;
};

export const AI_IMAGE = '__ai_image__';

const GROUPS: { title: string; items: PaletteItem[] }[] = [
  {
    title: '기본',
    items: [
      { type: 'paragraph', label: '문단', desc: '일반 본문 텍스트', icon: <Type size={16} />, keywords: 'text 본문 글' },
      { type: 'heading', label: '제목', desc: '섹션 제목 (H1~H3)', icon: <Heading size={16} />, keywords: 'title h1 h2 소제목' },
      { type: 'rich_text', label: '서식 텍스트', desc: 'Markdown으로 굵게·목록·링크', icon: <FileText size={16} />, keywords: 'markdown 마크다운' },
      { type: 'checklist', label: '체크리스트', desc: '확인 항목 목록', icon: <CheckSquare size={16} />, keywords: 'todo 할일 점검' },
      { type: 'quote', label: '인용', desc: '고객 후기·인용문', icon: <Quote size={16} />, keywords: '후기 리뷰' },
      { type: 'callout', label: '강조 상자', desc: '팁·주의·안내 문구', icon: <Info size={16} />, keywords: '팁 주의 안내 박스' },
    ],
  },
  {
    title: '미디어',
    items: [
      { type: 'image', label: '이미지', desc: '사진 한 장 + 캡션', icon: <Image size={16} />, keywords: '사진 그림' },
      { type: AI_IMAGE, label: 'AI 이미지 생성', desc: '설명으로 시안 이미지 만들기', icon: <Sparkles size={16} />, keywords: '생성 시안 렌더' },
      { type: 'image_gallery', label: '갤러리', desc: '여러 장 사진 묶음', icon: <Images size={16} />, keywords: '사진 여러장' },
      { type: 'before_after', label: '전/후 비교', desc: '시공 전·후 사진 비교', icon: <Columns2 size={16} />, keywords: '비포 애프터 비교' },
      { type: 'diagram', label: '다이어그램', desc: '도식·흐름도', icon: <Network size={16} />, keywords: '도식 흐름 mermaid' },
    ],
  },
  {
    title: '표·데이터',
    items: [
      { type: 'table', label: '표', desc: '행·열 표', icon: <Table size={16} />, keywords: 'table 테이블' },
      { type: 'chart', label: '차트', desc: '막대·선 그래프', icon: <BarChart3 size={16} />, keywords: '그래프 통계' },
      { type: 'cost_table', label: '견적표', desc: '품목·수량·단가 합계', icon: <Wallet size={16} />, keywords: '견적 비용 단가' },
      { type: 'formula', label: '계산식', desc: '면적·물량 계산', icon: <Calculator size={16} />, keywords: '계산 수식 면적' },
      { type: 'schedule', label: '공정표', desc: '작업·기간·담당', icon: <CalendarRange size={16} />, keywords: '일정 공정 기간' },
      { type: 'material_spec', label: '자재 사양', desc: '자재 규격 목록', icon: <Ruler size={16} />, keywords: '자재 규격 스펙' },
    ],
  },
  {
    title: '전문 문서',
    items: [
      { type: 'law_reference', label: '법규 근거', desc: '법령·조문·요약·링크', icon: <Scale size={16} />, keywords: '법 조문 법령 규정' },
      { type: 'construction_standard', label: '시공 기준', desc: 'KCS 등 기준 조항', icon: <BookMarked size={16} />, keywords: 'kcs 기준 표준' },
      { type: 'construction_detail', label: '시공 상세', desc: '공정 단계와 상세도', icon: <Hammer size={16} />, keywords: '공법 상세 단계' },
      { type: 'risk_warning', label: '위험 경고', desc: '위험요인과 대책', icon: <AlertTriangle size={16} />, keywords: '안전 위험 하자' },
      { type: 'qna', label: '현장 Q&A', desc: '질문·답변·근거', icon: <MessagesSquare size={16} />, keywords: '질문 답변 faq' },
      { type: 'source_reference', label: '출처', desc: '참고 자료 인용', icon: <Link2 size={16} />, keywords: '참고 레퍼런스' },
    ],
  },
  {
    title: '구성·메타',
    items: [
      { type: 'container', label: '섹션 묶음', desc: '여러 블록을 한 섹션으로', icon: <Box size={16} />, keywords: '컨테이너 그룹 섹션' },
      { type: 'blog_section', label: '블로그 섹션', desc: '소제목 + 본문', icon: <PanelTop size={16} />, keywords: '블로그' },
      { type: 'technical_section', label: '기술 섹션', desc: '소제목 + 본문 + 참고', icon: <PanelTop size={16} />, keywords: '기술 자료' },
      { type: 'cta', label: '상담 유도', desc: '버튼이 있는 안내 문구', icon: <Megaphone size={16} />, keywords: 'cta 버튼 상담 문의' },
      { type: 'doc_meta', label: '문서 정보', desc: '문서 코드·버전·작성자', icon: <FileBadge size={16} />, keywords: '메타 버전 작성자' },
      { type: 'seo_meta', label: 'SEO', desc: '검색용 제목·설명·키워드', icon: <Tags size={16} />, keywords: '검색 키워드' },
      { type: 'code', label: '코드', desc: '코드·설정 조각', icon: <Code2 size={16} />, keywords: 'code' },
    ],
  },
];

export const QUICK_TYPES = ['paragraph', 'heading', 'checklist', 'table', 'image'];

export function paletteItem(type: string): PaletteItem | undefined {
  for (const g of GROUPS) {
    const found = g.items.find((i) => i.type === type);
    if (found) return found;
  }
  return undefined;
}

type Props = {
  /** Block types the editor can actually create (unknown ones are hidden). */
  available: ReadonlySet<string>;
  onPick: (type: string) => void;
  onClose: () => void;
  /** Open upward when anchored near the bottom of the page. */
  placement?: 'below' | 'above';
};

export function BlockPalette({ available, onPick, onClose, placement = 'below' }: Props) {
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    return GROUPS.map((g) => ({
      title: g.title,
      items: g.items.filter(
        (i) =>
          (i.type === AI_IMAGE || available.has(i.type)) &&
          (!q || `${i.label} ${i.desc} ${i.keywords ?? ''} ${i.type}`.toLowerCase().includes(q)),
      ),
    })).filter((g) => g.items.length > 0);
  }, [query, available]);

  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setCursor(0);
  }, [query]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [onClose]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${cursor}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((c) => Math.min(flat.length - 1, c + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((c) => Math.max(0, c - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = flat[cursor];
      if (item) onPick(item.type);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  }

  let index = -1;
  return (
    <div
      ref={rootRef}
      className={`be-palette be-palette--${placement}`}
      role="dialog"
      aria-label="블록 추가"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={onKeyDown}
    >
      <label className="be-palette__search">
        <Search size={15} aria-hidden />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="블록 찾기 · 표, 이미지, 견적, 법규…"
          aria-label="블록 검색"
        />
      </label>
      <div ref={listRef} className="be-palette__list" role="listbox">
        {flat.length === 0 && <p className="be-palette__empty">‘{query}’에 맞는 블록이 없습니다.</p>}
        {groups.map((g) => (
          <div key={g.title} className="be-palette__group">
            <p className="be-palette__title">{g.title}</p>
            {g.items.map((item) => {
              index += 1;
              const i = index;
              return (
                <button
                  key={item.type}
                  type="button"
                  role="option"
                  aria-selected={cursor === i}
                  data-index={i}
                  className={`be-palette__item${cursor === i ? ' is-active' : ''}`}
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => onPick(item.type)}
                >
                  <span className="be-palette__icon">{item.icon}</span>
                  <span className="be-palette__text">
                    <strong>{item.label}</strong>
                    <small>{item.desc}</small>
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <p className="be-palette__hint">↑ ↓ 이동 · Enter 추가 · Esc 닫기</p>
    </div>
  );
}
