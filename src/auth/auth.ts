import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { Database } from '../db/connection.js';
import type { AuthConfig, AuthUser, UserRole } from '../shared/types.js';

export const DEMO_INSTITUTION_ID = 'demo-institution';
export const DEMO_INSTITUTION_NAME = 'CampusIQ Demonstration Institution';
const SESSION_COOKIE = 'campusiq_session';
const DEFAULT_DEMO_EMAIL = 'faculty@demo.campusiq.local';
const DEFAULT_DEMO_PASSWORD = 'CampusIQ-demo-2026!';

declare global {
  namespace Express {
    interface Request { authUser?: AuthUser; }
  }
}

type UserRow = { id: string; email: string; display_name: string; role: UserRole; institution_id: string; institution_name: string; active: number };
type UserCredentialRow = UserRow & { password_hash: string };

export function authConfig(): AuthConfig {
  const demoMode = process.env.DEMO_MODE !== 'false';
  const demoAccess = process.env.DEMO_ACCESS_ENABLED !== 'false';
  return {
    required: process.env.AUTH_REQUIRED === 'true',
    demoMode,
    demoAccess,
    demoEmail: demoAccess ? (process.env.DEMO_ADMIN_EMAIL ?? DEFAULT_DEMO_EMAIL) : null,
  };
}

export function demoCredentials(): { email: string; password: string } {
  return { email: process.env.DEMO_ADMIN_EMAIL ?? DEFAULT_DEMO_EMAIL, password: process.env.DEMO_ADMIN_PASSWORD ?? DEFAULT_DEMO_PASSWORD };
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const key = scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${key}`;
}

export function verifyPassword(password: string, encoded: string): boolean {
  const [algorithm, salt, key] = encoded.split('$');
  if (algorithm !== 'scrypt' || !salt || !key) return false;
  try {
    const expected = Buffer.from(key, 'hex');
    const actual = scryptSync(password, salt, expected.length);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch { return false; }
}

function sessionTtlMs(): number {
  const days = Math.max(1, Number(process.env.SESSION_TTL_DAYS ?? 7));
  return days * 24 * 60 * 60 * 1000;
}

function tokenHash(token: string): string { return createHash('sha256').update(token).digest('hex'); }

function toUser(row: UserRow): AuthUser {
  return { id: row.id, email: row.email, displayName: row.display_name, role: row.role, institutionId: row.institution_id, institutionName: row.institution_name };
}

export function findUserByEmail(database: Database, email: string): UserCredentialRow | null {
  return (database.db.prepare(`SELECT u.id, u.email, u.display_name, u.password_hash, u.role, u.institution_id, i.name AS institution_name, u.active
    FROM users u JOIN institutions i ON i.id = u.institution_id WHERE u.email = ? COLLATE NOCASE LIMIT 1`).get(email.trim()) as UserCredentialRow | undefined) ?? null;
}

export function findUserBySession(database: Database, token: string): AuthUser | null {
  const now = new Date().toISOString();
  const row = database.db.prepare(`SELECT u.id, u.email, u.display_name, u.role, u.institution_id, i.name AS institution_name, u.active
    FROM sessions s JOIN users u ON u.id = s.user_id JOIN institutions i ON i.id = u.institution_id
    WHERE s.token_hash = ? AND s.expires_at > ? AND u.active = 1 LIMIT 1`).get(tokenHash(token), now) as UserRow | undefined;
  if (!row) return null;
  database.db.prepare('UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?').run(now, tokenHash(token));
  return toUser(row);
}

export function createSession(database: Database, userId: string): { token: string; expiresAt: string } {
  const token = randomBytes(32).toString('base64url');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + sessionTtlMs()).toISOString();
  database.db.prepare('INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)').run(randomUUID(), userId, tokenHash(token), expiresAt, now.toISOString(), now.toISOString());
  return { token, expiresAt };
}

export function deleteSession(database: Database, token: string): void {
  database.db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash(token));
}

function cookieValue(request: Request): string | null {
  const header = request.header('cookie') ?? '';
  const item = header.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${SESSION_COOKIE}=`));
  return item ? decodeURIComponent(item.slice(SESSION_COOKIE.length + 1)) : null;
}

function bearerValue(request: Request): string | null {
  const header = request.header('authorization');
  return header?.startsWith('Bearer ') ? header.slice(7).trim() : null;
}

export function currentSessionToken(request: Request): string | null { return bearerValue(request) ?? cookieValue(request); }

export function setSessionCookie(response: Response, token: string, expiresAt: string): void {
  const maxAge = Math.max(0, Math.floor((Date.parse(expiresAt) - Date.now()) / 1000));
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  response.setHeader('Set-Cookie', `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`);
}

export function clearSessionCookie(response: Response): void {
  response.setHeader('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

export function authMiddleware(database: Database) {
  return (request: Request, response: Response, next: NextFunction): void => {
    const token = currentSessionToken(request);
    if (token) request.authUser = findUserBySession(database, token) ?? undefined;
    const config = authConfig();
    const isPublic = request.path === '/healthz' || request.path === '/api/health' || request.path.startsWith('/api/auth/');
    if (config.required && !request.authUser && !isPublic) {
      response.status(401).json({ error: { code: 'authentication_required', message: 'Sign in to access this CampusIQ workspace.', requestId: response.locals.requestId ?? null } });
      return;
    }
    next();
  };
}

export function requireRole(...roles: UserRole[]) {
  return (request: Request, response: Response, next: NextFunction): void => {
    if (!request.authUser || !roles.includes(request.authUser.role)) {
      response.status(403).json({ error: { code: 'forbidden', message: 'You do not have permission for this action.', requestId: response.locals.requestId ?? null } });
      return;
    }
    next();
  };
}

export function audit(database: Database, request: Request, action: string, entityType: string, entityId: string | null, metadata: Record<string, unknown> = {}): void {
  const user = request.authUser;
  const institutionId = user?.institutionId ?? DEMO_INSTITUTION_ID;
  database.db.prepare(`INSERT INTO audit_logs (id, institution_id, user_id, action, entity_type, entity_id, metadata_json, request_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(randomUUID(), institutionId, user?.id ?? null, action, entityType, entityId, JSON.stringify(metadata), request.res?.locals.requestId ?? null, new Date().toISOString());
}

export { SESSION_COOKIE };
