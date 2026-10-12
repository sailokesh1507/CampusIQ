import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/server/app.js';

const servers: Array<ReturnType<ReturnType<typeof createApp>['listen']>> = [];

async function runningApp() {
  const server = createApp({ databasePath: ':memory:' }).listen(0);
  servers.push(server);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  return `http://127.0.0.1:${port}`;
}

afterEach(() => { for (const server of servers.splice(0)) server.close(); });

describe('CampusIQ API integration', () => {
  it('seeds the dashboard and exposes deterministic profile evidence', async () => {
    const base = await runningApp();
    const dashboard = await (await fetch(`${base}/api/dashboard`)).json();
    const profile = await (await fetch(`${base}/api/students/SYN-007`)).json();
    expect(dashboard.data.kpis.totalStudents).toBe(54);
    expect(profile.data.explanation.algorithmVersion).toBe('heuristic-v1');
    expect(profile.data.segments.map((segment: { key: string }) => segment.key)).toContain('high-academic-low-placement');
  });

  it('validates, commits a CSV row, and recalculates the dashboard', async () => {
    const base = await runningApp();
    const form = new FormData();
    form.append('mode', 'atomic');
    form.append('file', new Blob(['student_id,display_name,observed_at,marks_percent\nIMPORT-001,Imported Synthetic,2026-01-15T00:00:00.000Z,71\n'], { type: 'text/csv' }), 'import.csv');
    const validation = await (await fetch(`${base}/api/imports/validate`, { method: 'POST', body: form })).json();
    expect(validation.data.acceptedRows).toBe(1);
    const committed = await (await fetch(`${base}/api/imports/${validation.data.batchId}/commit`, { method: 'POST' })).json();
    expect(committed.data.status).toBe('committed');
    const students = await (await fetch(`${base}/api/students?q=IMPORT-001`)).json();
    expect(students.data.total).toBe(1);
  });

  it('persists intervention changes and history notes through reloadable API reads', async () => {
    const base = await runningApp();
    const created = await (await fetch(`${base}/api/interventions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ studentId: 'SYN-007', category: 'placement', title: 'Synthetic interview plan', rationale: 'Placement evidence is below the review threshold.', owner: 'Career Services', dueDate: '2026-02-20' }) })).json();
    expect(created.data.status).toBe('open');
    const updated = await (await fetch(`${base}/api/interventions/${created.data.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'in_progress' }) })).json();
    expect(updated.data.status).toBe('in_progress');
    const noted = await (await fetch(`${base}/api/interventions/${created.data.id}/notes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: 'Synthetic follow-up note.' }) })).json();
    expect(noted.data.notes.length).toBe(2);
    const list = await (await fetch(`${base}/api/interventions`)).json();
    expect(list.data.some((item: { id: string; status: string }) => item.id === created.data.id && item.status === 'in_progress')).toBe(true);
  });
});
