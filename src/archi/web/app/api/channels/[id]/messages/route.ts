import { NextResponse } from 'next/server';
import { apiHandler, parseJsonBody } from '@archi-web/lib/api';
import { requireUser } from '@archi-web/lib/auth';
import { listMessages, postMessage, postMessageSchema } from '@archi-web/lib/services/messenger';

type Ctx = { params: Promise<{ id: string }> };

export const GET = apiHandler<Ctx>(async (_request, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  const messages = await listMessages(user.id, id);
  return NextResponse.json({ messages });
});

export const POST = apiHandler<Ctx>(async (request, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  const body = postMessageSchema.parse(await parseJsonBody(request));
  const result = await postMessage(user.id, id, body);
  return NextResponse.json(result, { status: 201 });
});
