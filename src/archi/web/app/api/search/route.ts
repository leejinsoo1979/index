import { NextResponse } from 'next/server';
import { MockSearchProvider } from '@archi/ai';
import { z } from 'zod';
import { apiHandler, parseJsonBody } from '@archi-web/lib/api';
import { requireUser } from '@archi-web/lib/auth';

const searchRequestSchema = z.object({
  query: z.string().min(1, '검색어를 입력해 주세요.').max(500),
  sourceTypes: z
    .array(z.enum(['official_law', 'kcsc', 'web', 'knowledge_base']))
    .optional(),
});

export const POST = apiHandler(async (request) => {
  await requireUser();
  const body = searchRequestSchema.parse(await parseJsonBody(request));
  const provider = new MockSearchProvider();
  const results = await provider.search(body.query, { sourceTypes: body.sourceTypes });
  return NextResponse.json({ results });
});
