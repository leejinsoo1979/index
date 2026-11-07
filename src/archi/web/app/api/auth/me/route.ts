import { NextResponse } from 'next/server';
import { apiHandler } from '@archi-web/lib/api';
import { requireUser } from '@archi-web/lib/auth';
import { getUserContext } from '@archi-web/lib/services/auth';

export const GET = apiHandler(async () => {
  const user = await requireUser();
  const organizations = await getUserContext(user.id);
  return NextResponse.json({
    user: { id: user.id, email: user.email, name: user.name },
    organizations,
  });
});
