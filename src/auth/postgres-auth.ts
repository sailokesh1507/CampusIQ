import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { AuthUser, UserRole } from '../shared/types.js';
import { authConfig, clearSessionCookie, currentSessionToken, demoCredentials, setSessionCookie, verifyPassword } from './auth.js';
import type { PostgresDatabase } from '../db/postgres.js';

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

function toUser(row: { id: string; email: string; display_name: string; role: UserRole; institution_id: string; institution_name: string }): AuthUser {
  return { id: row.id, email: row.email, displayName: row.display_name, role: row.role, institutionId: row.institution_id, institutionName: row.institution_name };
}

export type PostgresCredentialUser = ReturnType<typeof toUser> & { passwordHash: string; active: boolean };

export function publicPostgresUser(user: PostgresCredentialUser): AuthUser {
  return { id: user.id, email: user.email, displayName: user.displayName, role: user.role, institutionId: user.institutionId, institutionName: user.institutionName };
}

export async function findPostgresUser(database: PostgresDatabase, email: string): Promise<PostgresCredentialUser | null> {
  const result = await database.pool.query(`SELECT u.id, u.email, u.display_name, u.password_hash, u.role, u.institution_id, i.name AS institution_name, u.active
    FROM users u JOIN institutions i ON i.id = u.institution_id WHERE LOWER(u.email) = LOWER($1) AND u.active = TRUE LIMIT 1`, [email.trim()]);
  const row = result.rows[0];
  return row ? { ...toUser(row), passwordHash: row.password_hash, active: row.active } : null;
}

export async function findPostgresSession(database: PostgresDatabase, token: string): Promise<AuthUser | null> {
  const result = await database.pool.query(`SELECT u.id, u.email, u.display_name, u.role, u.institution_id, i.name AS institution_name
    FROM sessions s JOIN users u ON u.id = s.user_id JOIN institutions i ON i.id = u.institution_id
    WHERE s.token_hash = $1 AND s.expires_at > NOW() AND u.active = TRUE LIMIT 1`, [hashToken(token)]);
  const row = result.rows[0];
  if (!row) return null;
  await database.pool.query('UPDATE sessions SET last_seen_at = NOW() WHERE token_hash = $1', [hashToken(token)]);
  return toUser(row);
}

export async function createPostgresSession(database: PostgresDatabase, userId: string): Promise<{ token: string; expiresAt: string }> {
  const token = randomBytes(32).toString('base64url');
  const days = Math.max(1, Number(process.env.SESSION_TTL_DAYS ?? 7));
  const expiresAt = new Date(Date.now() + days * 86_400_000).toISOString();
  await database.pool.query('INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at, last_seen_at) VALUES ($1,$2,$3,$4,NOW(),NOW())', [randomUUID(), userId, hashToken(token), expiresAt]);
  return { token, expiresAt };
}

export async function createPostgresDemoSession(database: PostgresDatabase): Promise<{ user: AuthUser; token: string; expiresAt: string } | null> {
  if (!authConfig().demoAccess) return null;
  const credentials = demoCredentials();
  const user = await findPostgresUser(database, credentials.email);
  if (!user || !verifyPassword(credentials.password, user.passwordHash)) return null;
  const session = await createPostgresSession(database, user.id);
  return { user: publicPostgresUser(user), ...session };
}

export function postgresAuthMiddleware(database: PostgresDatabase) {
  return async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const token = currentSessionToken(request);
      if (token) request.authUser = await findPostgresSession(database, token) ?? undefined;
      const isPublic = request.path === '/healthz' || request.path === '/api/health' || request.path.startsWith('/api/auth/');
      if (authConfig().required && !request.authUser && !isPublic) {
        response.status(401).json({ error: { code: 'authentication_required', message: 'Sign in to access this CampusIQ workspace.', requestId: response.locals.requestId ?? null } });
        return;
      }
      next();
    } catch (error) { next(error); }
  };
}

export function requirePostgresRole(...roles: UserRole[]) {
  return (request: Request, response: Response, next: NextFunction): void => {
    if (!request.authUser || !roles.includes(request.authUser.role)) { response.status(403).json({ error: { code: 'forbidden', message: 'You do not have permission for this action.', requestId: response.locals.requestId ?? null } }); return; }
    next();
  };
}

export async function logoutPostgres(database: PostgresDatabase, token: string | null): Promise<void> {
  if (token) await database.pool.query('DELETE FROM sessions WHERE token_hash = $1', [hashToken(token)]);
}

export { clearSessionCookie, setSessionCookie, verifyPassword };
