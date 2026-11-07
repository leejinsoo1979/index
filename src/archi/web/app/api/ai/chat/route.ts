import { NextResponse } from 'next/server';
import { apiHandler, parseJsonBody } from '@archi-web/lib/api';
import { requireUser } from '@archi-web/lib/auth';
import { chat, chatRequestSchema } from '@archi-web/lib/services/agent';

import { checkRateLimit } from '@archi-web/lib/rate-limit';

export const POST = apiHandler(async (request) => {
  const user = await requireUser();
  checkRateLimit(`ai-chat:${user.id}`, 30, 60_000);
  const body = chatRequestSchema.parse(await parseJsonBody(request));
  const result = await chat(user.id, body);
  return NextResponse.json(result);
});
