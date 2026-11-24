import { rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDir, '../..');

await Promise.all([
  rm(path.join(repositoryRoot, 'web', 'dist'), { recursive: true, force: true }),
  rm(path.join(repositoryRoot, 'mobile', 'dist'), { recursive: true, force: true }),
]);