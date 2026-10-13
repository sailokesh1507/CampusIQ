import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const base = (process.env.LIVE_BASE_URL || 'https://campusiq-eight.vercel.app').replace(/\/$/, '');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'docs/sample-data/campusiq-fictional-campus.csv');
const form = new FormData();
form.append('mode', 'atomic');
form.append('file', new Blob([await fs.readFile(file)], { type: 'text/csv' }), path.basename(file));

const demoLogin = await fetch(`${base}/api/auth/demo`, { method: 'POST' });
if (!demoLogin.ok) throw new Error(`Demo login failed with HTTP ${demoLogin.status}`);
const cookie = demoLogin.headers.get('set-cookie')?.split(';', 1)[0];
if (!cookie) throw new Error('Demo login did not set a session cookie.');

const validationResponse = await fetch(`${base}/api/imports/validate`, { method: 'POST', headers: { cookie }, body: form });
const validation = await validationResponse.json();
if (!validationResponse.ok) throw new Error(`${validationResponse.status}: ${JSON.stringify(validation)}`);
if (validation.data.rejectedRows !== 0) throw new Error(`Fictional demo CSV has ${validation.data.rejectedRows} rejected rows.`);

const commitResponse = await fetch(`${base}/api/imports/${validation.data.batchId}/commit`, { method: 'POST', headers: { cookie } });
const commit = await commitResponse.json();
if (!commitResponse.ok) throw new Error(`${commitResponse.status}: ${JSON.stringify(commit)}`);
console.log(JSON.stringify({ status: commit.data.status, batchId: commit.data.batchId, importedRows: commit.data.importedRows, source: path.relative(root, file) }));
