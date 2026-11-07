import { NextResponse } from 'next/server';
import { apiHandler, parseJsonBody } from '@archi-web/lib/api';
import { requireUser } from '@archi-web/lib/auth';
import { createNode, createNodeSchema } from '@archi-web/lib/services/ontology';

export const POST = apiHandler(async (request) => {
  const user = await requireUser();
  const body = createNodeSchema.parse(await parseJsonBody(request));
  const node = await createNode(user.id, body);
  return NextResponse.json(node, { status: 201 });
});
