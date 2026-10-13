const base = (process.argv[2] || process.env.APP_BASE_URL || 'http://localhost:3001').replace(/\/$/, '');

const authConfigResponse = await fetch(`${base}/api/auth/config`);
const authConfig = await authConfigResponse.json();
if (!authConfigResponse.ok) throw new Error(`/api/auth/config failed with HTTP ${authConfigResponse.status}`);
let headers = {};
if (authConfig.data?.required) {
  const demoResponse = await fetch(`${base}/api/auth/demo`, { method: 'POST' });
  const demoBody = await demoResponse.json();
  if (!demoResponse.ok) throw new Error(`/api/auth/demo failed with HTTP ${demoResponse.status}`);
  const cookie = demoResponse.headers.get('set-cookie')?.split(';', 1)[0];
  if (!cookie) throw new Error('Demo authentication did not set a session cookie.');
  headers = { cookie };
}

const checks = [
  { path: '/healthz', kind: 'json', verify: (body) => body.data?.status === 'ok' },
  { path: '/api/dashboard', kind: 'json', verify: (body) => body.data?.kpis?.totalStudents >= 1 },
  { path: '/api/students/SYN-007', kind: 'json', verify: (body) => body.data?.record?.studentId === 'SYN-007' },
  { path: '/api/methodology', kind: 'json', verify: (body) => body.data?.version === 'heuristic-v1' },
  { path: '/api/import/templates/unified', kind: 'text', verify: (body) => body.startsWith('student_id,') },
];

for (const check of checks) {
  const url = `${base}${check.path}`;
   const response = await fetch(url, { headers });
  const body = check.kind === 'json' ? await response.json() : await response.text();
  if (!response.ok || !check.verify(body)) {
    throw new Error(`${check.path} failed with HTTP ${response.status}`);
  }
  console.log(`PASS ${check.path} (${response.status})`);
}

console.log(`CampusIQ smoke test passed: ${base}`);
