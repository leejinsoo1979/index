import { useMemo } from 'react';
import { useLocation, useNavigate, useParams as useRouterParams } from 'react-router-dom';
import { toAppPath, toStudioPath } from './studio-paths';

/** `next/navigation` subset used by the studio pages. */
export function useRouter() {
  const navigate = useNavigate();
  return useMemo(
    () => ({
      push: (href: string) => navigate(toAppPath(href)),
      replace: (href: string) => navigate(toAppPath(href), { replace: true }),
      back: () => navigate(-1),
      forward: () => navigate(1),
      refresh: () => undefined,
      prefetch: () => undefined,
    }),
    [navigate],
  );
}

/** Pathname in the original's /studio namespace so active-link checks keep working. */
export function usePathname(): string {
  return toStudioPath(useLocation().pathname);
}

export function useSearchParams(): URLSearchParams {
  const { search } = useLocation();
  return useMemo(() => new URLSearchParams(search), [search]);
}

export function useParams<T extends Record<string, string>>(): T {
  return useRouterParams() as T;
}
