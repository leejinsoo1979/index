import { NextResponse } from 'next/server';
import { apiHandler, parseJsonBody } from '@archi-web/lib/api';
import { requireUser } from '@archi-web/lib/auth';
import { createExport, createExportSchema } from '@archi-web/lib/services/exports';

export const POST = apiHandler(async (request) => {
  const user = await requireUser();
  const body = createExportSchema.parse(await parseJsonBody(request));
  const result = await createExport(user.id, body);
  return NextResponse.json(result, { status: 201 });
});
