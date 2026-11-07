import { NextResponse } from 'next/server';
import { apiHandler, parseJsonBody } from '@archi-web/lib/api';
import { requireUser } from '@archi-web/lib/auth';
import { kbQuerySchema, queryKnowledgeBase } from '@archi-web/lib/services/knowledge';

export const POST = apiHandler(async (request) => {
  const user = await requireUser();
  const body = kbQuerySchema.parse(await parseJsonBody(request));
  const result = await queryKnowledgeBase(user.id, body);
  return NextResponse.json(result);
});
