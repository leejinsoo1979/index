/** The original app lived under /studio; in index it is mounted at /agent-studio. */
export const STUDIO_BASE = '/agent-studio';

export function toAppPath(href: string): string {
  if (href === '/studio' || href.startsWith('/studio/') || href.startsWith('/studio?')) {
    return STUDIO_BASE + href.slice('/studio'.length);
  }
  if (href === '/login' || href.startsWith('/login?')) return '/mypage';
  if (href === '/') return STUDIO_BASE;
  return href;
}

export function toStudioPath(pathname: string): string {
  if (pathname === STUDIO_BASE || pathname.startsWith(`${STUDIO_BASE}/`)) {
    return '/studio' + pathname.slice(STUDIO_BASE.length);
  }
  return pathname;
}
