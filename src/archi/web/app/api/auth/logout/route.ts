import { NextResponse } from 'next/server';
import { apiHandler } from '@archi-web/lib/api';

/** Firebase 세션 종료는 호스트 앱(useAuth().logout)이 처리한다. 호환용 no-op. */
export const POST = apiHandler(async () => NextResponse.json({ ok: true }));
