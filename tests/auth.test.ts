import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/server/app.js';

const servers: Array<ReturnType<ReturnType<typeof createApp>['listen']>> = [];
const originalAuthRequired = process.env.AUTH_REQUIRED;

async function runningApp() {
  const server = createApp({ databasePath: ':memory:' }).listen(0);
  servers.push(server);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  return `http://127.0.0.1:${port}`;
}

afterEach(() => {
  for (const server of servers.splice(0)) server.close();
  if (originalAuthRequired === undefined) delete process.env.AUTH_REQUIRED;
  else process.env.AUTH_REQUIRED = originalAuthRequired;
});

describe('CampusIQ authentication foundation', () => {
  it('exposes demo auth configuration and authenticates the seeded demo faculty', async () => {
    const base = await runningApp();
    const config = await (await fetch(`${base}/api/auth/config`)).json();
    expect(config.data.demoMode).toBe(true);
    expect(config.data.demoAccess).toBe(true);
    expect(config.data.demoEmail).toBe('faculty@demo.campusiq.local');

    const login = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'faculty@demo.campusiq.local', password: 'CampusIQ-demo-2026!' }) });
    expect(login.status).toBe(200);
    const cookie = login.headers.get('set-cookie');
    expect(cookie).toContain('campusiq_session=');
    const me = await (await fetch(`${base}/api/auth/me`, { headers: { cookie: cookie!.split(';')[0] } })).json();
    expect(me.data.user.email).toBe('faculty@demo.campusiq.local');
    expect(me.data.user.role).toBe('admin');

    const demoAccess = await fetch(`${base}/api/auth/demo`, { method: 'POST' });
    expect(demoAccess.status).toBe(200);
  });

  it('enforces authentication when production mode enables it', async () => {
    process.env.AUTH_REQUIRED = 'true';
    const base = await runningApp();
    const unauthenticated = await (await fetch(`${base}/api/dashboard`)).json();
    expect(unauthenticated.error.code).toBe('authentication_required');

    const login = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'faculty@demo.campusiq.local', password: 'CampusIQ-demo-2026!' }) });
    const cookie = login.headers.get('set-cookie')!;
    const dashboard = await (await fetch(`${base}/api/dashboard`, { headers: { cookie: cookie.split(';')[0] } })).json();
    expect(dashboard.data.kpis.totalStudents).toBe(54);
  });

  it('returns canonical departments and programmes from the institution catalog', async () => {
    const base = await runningApp();
    const catalog = await (await fetch(`${base}/api/catalog`)).json();
    expect(catalog.data.departments).toHaveLength(3);
    expect(catalog.data.programmes.map((item: { code: string }) => item.code)).toEqual(expect.arrayContaining(['BTECH-CSE', 'BBA-BA', 'BTECH-ECE']));
  });
});
