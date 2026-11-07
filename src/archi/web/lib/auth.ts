import { prisma, type User } from '@archi/db';
import { AppError, ErrorCodes } from '@archi/shared';
import { devLogin } from './services/auth';

/**
 * Session for the in-browser port. The original read an Auth.js session or an
 * HMAC cookie on the server; here the signed-in Firebase user (set by the host
 * app via setSessionIdentity) is mapped to a studio User, created on first use
 * together with a personal organization + workspace (same as the original devLogin).
 */
type Identity = { email: string; name?: string | null };

let identity: Identity | null = null;
let cachedUser: { email: string; user: Promise<User> } | null = null;

export function setSessionIdentity(next: Identity | null) {
  identity = next;
  if (!next || cachedUser?.email !== next.email) cachedUser = null;
}

export function getSessionIdentity(): Identity | null {
  return identity;
}

export async function getSessionUser(): Promise<User | null> {
  if (!identity?.email) return null;
  if (!cachedUser || cachedUser.email !== identity.email) {
    const { email, name } = identity;
    const user = devLogin({ email, name: name ?? undefined }).then(({ user }) => user as User);
    cachedUser = { email, user };
    user.catch(() => {
      if (cachedUser?.email === email) cachedUser = null;
    });
  }
  const user = await cachedUser.user;
  // Re-read so updates (e.g. name) are reflected.
  return prisma.user.findUnique({ where: { id: user.id } });
}

/** 로그인 필수 헬퍼. 미로그인 시 401 AppError */
export async function requireUser(): Promise<User> {
  const user = await getSessionUser();
  if (!user) {
    throw new AppError(ErrorCodes.UNAUTHORIZED);
  }
  return user;
}
