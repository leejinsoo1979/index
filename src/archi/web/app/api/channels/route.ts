import { NextResponse } from 'next/server';
import { AppError, ErrorCodes } from '@archi/shared';
import { apiHandler, parseJsonBody } from '@archi-web/lib/api';
import { requireUser } from '@archi-web/lib/auth';
import { createChannel, createChannelSchema, listChannels } from '@archi-web/lib/services/messenger';

export const GET = apiHandler(async (request) => {
  const user = await requireUser();
  const workspaceId = new URL(request.url).searchParams.get('workspaceId');
  if (!workspaceId) {
    throw new AppError(ErrorCodes.VALIDATION_FAILED, { message: 'workspaceId가 필요합니다.' });
  }
  const channels = await listChannels(user.id, workspaceId);
  return NextResponse.json({ channels });
});

export const POST = apiHandler(async (request) => {
  const user = await requireUser();
  const body = createChannelSchema.parse(await parseJsonBody(request));
  const channel = await createChannel(user.id, body);
  return NextResponse.json(channel, { status: 201 });
});
