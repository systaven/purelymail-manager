import { createClerkClient, verifyToken } from '@clerk/backend';
import type { Context, MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import { config } from './config';
import { getDb } from './db';
import { ApiError } from './errors';

// Everyone signs in with Clerk. The web app sends the session token as a bearer
// token; Clerk's own __session cookie is accepted too.

export type Role = 'admin' | 'guest';

export interface Session {
  role: Role;
  clerkUserId: string;
  email: string | null;
  name: string | null;
  // Who to name in the audit log.
  actor: string;
}

export type AppEnv = { Variables: { session: Session } };

const clerk = createClerkClient({ secretKey: config.clerk.secretKey, publishableKey: config.clerk.publishableKey });

// How long a cached Clerk profile (email, name) is trusted before it's fetched again.
const PROFILE_TTL_MS = 60 * 60_000;

interface UserRow {
  clerk_user_id: string;
  email: string | null;
  email_verified: number;
  name: string | null;
  role: Role;
  disabled: number;
  synced_at: string | null;
}

async function syncProfile(clerkUserId: string): Promise<void> {
  const profile = await clerk.users.getUser(clerkUserId);
  const primary = profile.primaryEmailAddress;
  const email = primary?.emailAddress.toLowerCase() ?? null;
  const verified = primary?.verification?.status === 'verified' ? 1 : 0;
  const name = [profile.firstName, profile.lastName].filter(Boolean).join(' ') || profile.username || null;
  getDb()
    .prepare(
      `INSERT INTO users (clerk_user_id, email, email_verified, name, synced_at, last_seen_at)
       VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
       ON CONFLICT (clerk_user_id) DO UPDATE SET
         email = excluded.email, email_verified = excluded.email_verified, name = excluded.name,
         synced_at = excluded.synced_at, last_seen_at = excluded.last_seen_at`
    )
    .run(clerkUserId, email, verified, name);
}

// Loads the user's row, creating it (as a guest) on their first visit and
// refreshing the Clerk profile when it's stale.
async function loadUser(clerkUserId: string): Promise<UserRow> {
  const db = getDb();
  const select = db.prepare('SELECT * FROM users WHERE clerk_user_id = ?');
  let row = select.get(clerkUserId) as unknown as UserRow | undefined;
  const stale = !row?.synced_at || Date.now() - Date.parse(`${row.synced_at}Z`) > PROFILE_TTL_MS;
  if (!row || stale) {
    try {
      await syncProfile(clerkUserId);
    } catch (error) {
      // A cached profile is good enough while Clerk is unreachable.
      if (!row) throw error;
      console.warn('Could not refresh Clerk profile:', error);
    }
    row = select.get(clerkUserId) as unknown as UserRow;
  } else {
    db.prepare("UPDATE users SET last_seen_at = datetime('now') WHERE clerk_user_id = ?").run(clerkUserId);
  }
  return row;
}

function tokenFrom(c: Context): string | null {
  const header = c.req.header('Authorization');
  if (header?.startsWith('Bearer ')) return header.slice(7);
  return getCookie(c, '__session') ?? null;
}

export async function getSession(c: Context): Promise<Session | null> {
  const token = tokenFrom(c);
  if (!token) return null;
  let clerkUserId: string;
  try {
    const claims = await verifyToken(token, {
      jwtKey: config.clerk.jwtKey,
      secretKey: config.clerk.secretKey,
      authorizedParties: config.clerk.authorizedParties.length ? config.clerk.authorizedParties : undefined,
    });
    clerkUserId = claims.sub;
  } catch {
    return null;
  }

  const user = await loadUser(clerkUserId);
  if (user.disabled) throw new ApiError('Your account has been disabled', 403, 'account_disabled');
  // Only a verified address can make someone an admin.
  const listedAdmin = Boolean(user.email && user.email_verified && config.adminEmails.includes(user.email));
  return {
    role: listedAdmin ? 'admin' : user.role,
    clerkUserId,
    email: user.email,
    name: user.name,
    actor: user.email || clerkUserId,
  };
}

// Requires a signed-in user; `admin` additionally requires the admin role.
export function requireAuth(role: Role = 'guest'): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const session = await getSession(c);
    if (!session) throw new ApiError('Sign in to continue', 401, 'unauthorized');
    if (role === 'admin' && session.role !== 'admin') throw new ApiError('Admins only', 403, 'admins_only');
    c.set('session', session);
    await next();
  };
}
