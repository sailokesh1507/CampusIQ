import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { hashPassword } from '../src/auth/auth.js';
import { PostgresDatabase } from '../src/db/postgres.js';

const input = z.object({
  databaseUrl: z.string().url(),
  institutionName: z.string().trim().min(2).max(160),
  institutionSlug: z.string().trim().min(2).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  adminEmail: z.string().trim().email(),
  adminName: z.string().trim().min(2).max(120),
  adminPassword: z.string().min(12).max(200),
});

const parsed = input.safeParse({
  databaseUrl: process.env.DATABASE_URL,
  institutionName: process.env.PROVISION_INSTITUTION_NAME,
  institutionSlug: process.env.PROVISION_INSTITUTION_SLUG,
  adminEmail: process.env.PROVISION_ADMIN_EMAIL,
  adminName: process.env.PROVISION_ADMIN_NAME,
  adminPassword: process.env.PROVISION_ADMIN_PASSWORD,
});
if (!parsed.success) {
  console.error('Set DATABASE_URL, PROVISION_INSTITUTION_NAME, PROVISION_INSTITUTION_SLUG, PROVISION_ADMIN_EMAIL, PROVISION_ADMIN_NAME, and PROVISION_ADMIN_PASSWORD (minimum 12 characters).');
  process.exit(1);
}

process.env.POSTGRES_SEED_DEMO = 'false';
const database = new PostgresDatabase(parsed.data.databaseUrl);
try {
  await database.ready;
  const result = await database.transaction(async (client) => {
    const institution = await client.query(`INSERT INTO institutions (id,name,slug,active,created_at,updated_at)
      VALUES ($1,$2,$3,TRUE,NOW(),NOW())
      ON CONFLICT (slug) DO UPDATE SET name=EXCLUDED.name,active=TRUE,updated_at=NOW()
      RETURNING id`, [randomUUID(), parsed.data.institutionName, parsed.data.institutionSlug]);
    const institutionId = String(institution.rows[0].id);
    const existing = await client.query('SELECT id,institution_id FROM users WHERE LOWER(email)=LOWER($1) LIMIT 1', [parsed.data.adminEmail]);
    if (existing.rowCount && String(existing.rows[0].institution_id) !== institutionId) throw new Error('That admin email is already assigned to another institution.');
    const userId = existing.rows[0]?.id ?? randomUUID();
    await client.query(`INSERT INTO users (id,institution_id,email,display_name,password_hash,role,active,created_at,updated_at)
      VALUES ($1,$2,$3,$4,$5,'admin',TRUE,NOW(),NOW())
      ON CONFLICT (id) DO UPDATE SET display_name=EXCLUDED.display_name,password_hash=EXCLUDED.password_hash,role='admin',active=TRUE,updated_at=NOW()`, [userId, institutionId, parsed.data.adminEmail.toLowerCase(), parsed.data.adminName, hashPassword(parsed.data.adminPassword)]);
    return { institutionId, userId };
  });
  console.log(`Provisioned institution=${result.institutionId} admin=${parsed.data.adminEmail.toLowerCase()} user=${result.userId}`);
} finally {
  await database.close();
}
