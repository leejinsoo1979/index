/** Minimal `next/server` for route handlers that run in the browser. */
export class NextResponse extends Response {
  static override json(body: unknown, init?: ResponseInit): NextResponse {
    const headers = new Headers(init?.headers);
    if (!headers.has('content-type')) headers.set('content-type', 'application/json');
    return new NextResponse(JSON.stringify(body), { ...init, headers });
  }

  static override redirect(url: string | URL, init?: number | ResponseInit): NextResponse {
    const status = typeof init === 'number' ? init : (init?.status ?? 307);
    return new NextResponse(null, { status, headers: { location: String(url) } });
  }
}

export type NextRequest = Request;
