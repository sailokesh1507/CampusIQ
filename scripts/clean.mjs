import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const generatedDirectories = ['public', 'dist-client', 'dist-server'];

for (const directory of generatedDirectories) {
  const target = path.join(root, directory);
  fs.rmSync(target, { recursive: true, force: true });
  console.log(`Removed generated output: ${directory}/`);
}

console.log('Local source, dependencies, Vercel link, and database were preserved.');
