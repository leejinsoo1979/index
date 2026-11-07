import { NextResponse } from 'next/server';
import { apiHandler, parseJsonBody } from '@archi-web/lib/api';
import { requireUser } from '@archi-web/lib/auth';
import { generateImage, generateImageSchema } from '@archi-web/lib/services/images';

import { checkRateLimit } from '@archi-web/lib/rate-limit';

export const POST = apiHandler(async (request) => {
  const user = await requireUser();
  checkRateLimit(`image-generate:${user.id}`, 10, 60_000);
  const body = generateImageSchema.parse(await parseJsonBody(request));
  const result = await generateImage(user.id, body);
  return NextResponse.json(result, { status: 201 });
});
