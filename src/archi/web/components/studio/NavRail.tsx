'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { IconType } from 'react-icons';
import { ResizeHandle, useResizable } from './Resizable';
import {
  FiCheckSquare,
  FiCpu,
  FiFileText,
  FiFolder,
  FiHome,
  FiMessageSquare,
  FiSettings,
  FiShare2,
  FiBookOpen,
} from 'react-icons/fi';

const NAV_ITEMS: { icon: IconType; label: string; href: string; exact?: boolean }[] = [
  { icon: FiHome, label: '홈', href: '/studio', exact: true },
  { icon: FiFolder, label: '프로젝트', href: '/studio', exact: true },
  { icon: FiFileText, label: '문서', href: '/studio', exact: true },
  { icon: FiCpu, label: '에이전트', href: '/studio', exact: true },
  { icon: FiBookOpen, label: '지식베이스', href: '/studio/knowledge' },
  { icon: FiShare2, label: '온톨로지', href: '/studio/ontology' },
  { icon: FiMessageSquare, label: '메신저', href: '/studio/messenger' },
  { icon: FiCheckSquare, label: '작업센터', href: '/studio/messenger' },
  { icon: FiSettings, label: '설정', href: '/studio/settings' },
];

/** 좌측 다크 네비게이션 (참고 UI: docs/design/images/studio-screen.png — 컬러는 화이트&블랙) */
export function NavRail() {
  const pathname = usePathname();
  const { width, onPointerDown } = useResizable({
    initial: 176,
    min: 72,
    max: 280,
    side: 'left',
    storageKey: 'archi.nav.w',
  });

  return (
    <nav
      style={{ width }}
      className="relative flex shrink-0 flex-col overflow-hidden bg-[#111114] text-zinc-400"
    >
      <Link href="/" className="flex items-center gap-2 px-4 py-4">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-white text-xs font-black text-zinc-900">
          A
        </span>
        <span className="text-[13px] font-bold leading-tight text-white">
          ARCHI
          <br />
          <span className="font-medium text-zinc-400">Agent Studio</span>
        </span>
      </Link>

      <div className="mt-2 flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2">
        {NAV_ITEMS.map((item, i) => {
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
          // 같은 href가 여러 개일 때 첫 항목만 active 표시
          const firstWithHref = NAV_ITEMS.findIndex((n) => n.href === item.href) === i;
          const isActive = active && firstWithHref;
          return (
            <Link
              key={`${item.label}`}
              href={item.href}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] transition-colors ${
                isActive
                  ? 'bg-white font-semibold text-zinc-900'
                  : 'hover:bg-white/5 hover:text-zinc-100'
              }`}
            >
              <item.icon size={15} aria-hidden />
              {item.label}
            </Link>
          );
        })}
      </div>

      <div className="m-3 rounded-xl bg-white/5 p-3">
        <p className="text-[11px] font-bold text-white">Pro 플랜</p>
        <p className="mt-0.5 text-[10px] leading-4 text-zinc-500">
          AI 생성과 내보내기를
          <br />
          무제한으로 사용하세요
        </p>
        <button className="mt-2 w-full rounded-md bg-white py-1 text-[10px] font-bold text-zinc-900">
          업그레이드
        </button>
      </div>

      <ResizeHandle side="left" onPointerDown={onPointerDown} dark />
    </nav>
  );
}
