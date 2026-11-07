import { prisma } from '@archi/db';
import { Roles } from '@archi/shared';
import { z } from 'zod';

export const devLoginSchema = z.object({
  email: z.string().email('올바른 이메일 주소를 입력해 주세요.'),
  name: z.string().max(100).optional(),
});

/**
 * 개발용 로그인: 이메일로 사용자를 upsert하고,
 * 소속 조직이 없으면 개인 조직 + 기본 워크스페이스를 만들어 OWNER로 등록한다.
 */
export async function devLogin(input: z.infer<typeof devLoginSchema>) {
  const user = await prisma.user.upsert({
    where: { email: input.email },
    update: { name: input.name ?? undefined },
    create: { email: input.email, name: input.name },
  });

  let membership = await prisma.membership.findFirst({
    where: { userId: user.id },
    include: { organization: { include: { workspaces: true } } },
  });

  if (!membership) {
    const orgName = input.name ? `${input.name}의 조직` : `${input.email}의 조직`;
    const organization = await prisma.organization.create({
      data: {
        name: orgName,
        workspaces: { create: { name: '기본 워크스페이스' } },
        members: { create: { userId: user.id, role: Roles.OWNER } },
      },
      include: { workspaces: true, members: true },
    });
    membership = await prisma.membership.findFirstOrThrow({
      where: { userId: user.id, organizationId: organization.id },
      include: { organization: { include: { workspaces: true } } },
    });
  }

  return {
    user,
    organization: membership.organization,
    workspaces: membership.organization.workspaces,
    role: membership.role,
  };
}

/** 사용자의 조직/워크스페이스 목록 */
export async function getUserContext(userId: string) {
  const memberships = await prisma.membership.findMany({
    where: { userId },
    include: { organization: { include: { workspaces: true } } },
  });
  return memberships.map((m) => ({
    organizationId: m.organizationId,
    organizationName: m.organization.name,
    role: m.role,
    workspaces: m.organization.workspaces.map((w) => ({ id: w.id, name: w.name })),
  }));
}
