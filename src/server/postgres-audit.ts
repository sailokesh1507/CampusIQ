import type { Request } from 'express';
import type { PostgresDatabase } from '../db/postgres.js';

export async function auditPostgres(database: PostgresDatabase, request: Request, action: string, entityType: string, entityId: string | null, details: Record<string, unknown> = {}, overrides: { institutionId?: string; userId?: string | null } = {}): Promise<void> {
  let resolvedInstitutionId = overrides.institutionId ?? request.authUser?.institutionId ?? null;
  if (!resolvedInstitutionId && overrides.userId) {
    const user = await database.pool.query('SELECT institution_id FROM users WHERE id=$1', [overrides.userId]);
    resolvedInstitutionId = user.rows[0]?.institution_id ? String(user.rows[0].institution_id) : null;
  }
  if (!resolvedInstitutionId) return;
  await database.pool.query(`INSERT INTO audit_logs (id,institution_id,user_id,action,entity_type,entity_id,metadata_json,request_id)
    VALUES (gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7)`, [resolvedInstitutionId, overrides.userId ?? request.authUser?.id ?? null, action, entityType, entityId, JSON.stringify(details), request.res?.locals.requestId ?? null]);
}
