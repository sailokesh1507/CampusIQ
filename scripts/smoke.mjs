const base = (process.argv[2] || process.env.APP_BASE_URL || 'http://localhost:3001').replace(/\/$/, '');

const checks = [
  { path: '/healthz', kind: 'json', verify: (body) => body.data?.status === 'ok' },
  { path: '/api/dashboard', kind: 'json', verify: (body) => body.data?.kpis?.totalStudents >= 1 },
  { path: '/api/students/SYN-007', kind: 'json', verify: (body) => body.data?.record?.studentId === 'SYN-007' },
  { path: '/api/methodology', kind: 'json', verify: (body) => body.data?.version === 'heuristic-v1' },
  { path: '/api/import/templates/unified', kind: 'text', verify: (body) => body.startsWith('student_id,') },
];

for (const check of checks) {
  const url = `${base}${check.path}`;
  const response = await fetch(url);
  const body = check.kind === 'json' ? await response.json() : await response.text();
  if (!response.ok || !check.verify(body)) {
    throw new Error(`${check.path} failed with HTTP ${response.status}`);
  }
  console.log(`PASS ${check.path} (${response.status})`);
}

console.log(`CampusIQ smoke test passed: ${base}`);
