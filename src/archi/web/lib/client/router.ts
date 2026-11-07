/**
 * In-browser API router. The original served these handlers from Next.js route files
 * (app/api/<path>/route.ts); here the same handler modules are loaded on demand and
 * invoked directly with a standard Request, so the UI keeps calling `/api/...`.
 */
type RouteContext = { params: Promise<Record<string, string>> };
type RouteHandler = (request: Request, context: RouteContext) => Promise<Response> | Response;
type RouteModule = Partial<Record<'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', RouteHandler>>;

const modules = import.meta.glob<RouteModule>('../../app/api/**/route.ts');

type Route = { pattern: string[]; load: () => Promise<RouteModule> };

const routes: Route[] = Object.entries(modules)
  .map(([file, load]) => ({
    // '../../app/api/documents/[id]/blocks/route.ts' → ['api','documents','[id]','blocks']
    pattern: file.replace(/^\.\.\/\.\.\/app\//, '').replace(/\/route\.ts$/, '').split('/'),
    load,
  }))
  // Static segments win over dynamic ones at the same position (Next.js precedence).
  .sort((a, b) => {
    for (let i = 0; i < Math.max(a.pattern.length, b.pattern.length); i += 1) {
      const da = a.pattern[i]?.startsWith('[') ? 1 : 0;
      const db = b.pattern[i]?.startsWith('[') ? 1 : 0;
      if (da !== db) return da - db;
    }
    return 0;
  });

function match(pathname: string): { route: Route; params: Record<string, string> } | null {
  const segments = pathname.replace(/^\/+|\/+$/g, '').split('/').map(decodeURIComponent);
  for (const route of routes) {
    if (route.pattern.length !== segments.length) continue;
    const params: Record<string, string> = {};
    const ok = route.pattern.every((part, i) => {
      const seg = segments[i]!;
      if (part.startsWith('[') && part.endsWith(']')) {
        params[part.slice(1, -1)] = seg;
        return true;
      }
      return part === seg;
    });
    if (ok) return { route, params };
  }
  return null;
}

/** fetch() equivalent for the ported `/api/*` routes; returns a standard Response. */
export async function studioFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const url = new URL(input, window.location.origin);
  const found = match(url.pathname);
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  if (!found) return json(404, { code: 'NOT_FOUND', message: `API 경로를 찾을 수 없습니다: ${url.pathname}` });

  const method = (init.method ?? 'GET').toUpperCase() as keyof RouteModule;
  const mod = await found.route.load();
  const handler = mod[method];
  if (!handler) return json(405, { code: 'METHOD_NOT_ALLOWED', message: `${method} ${url.pathname}` });

  const request = new Request(url, init);
  return handler(request, { params: Promise.resolve(found.params) });
}
