import { NextResponse } from 'next/server';
import { apiHandler, parseJsonBody } from '@archi-web/lib/api';
import { requireUser } from '@archi-web/lib/auth';
import { inpaintImage, inpaintImageSchema } from '@archi-web/lib/services/images';

import { checkRateLimit } from '@archi-web/lib/rate-limit';

export const POST = apiHandler(async (request) => {
  const user = await requireUser();
  checkRateLimit(`image-inpaint:${user.id}`, 10, 60_000);
  const body = inpaintImageSchema.parse(await parseJsonBody(request));
  const result = await inpaintImage(user.id, body);
  return NextResponse.json(result, { status: 201 });
});
