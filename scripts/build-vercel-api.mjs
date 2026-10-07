import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);

async function resolveEsbuild() {
  try {
    return require('esbuild');
  } catch {}

  for (const parentPkg of ['vite', 'tsx']) {
    try {
      const parentPath = require.resolve(`${parentPkg}/package.json`);
      const parentRequire = createRequire(parentPath);
      return parentRequire('esbuild');
    } catch {}
  }

  try {
    return await import('esbuild');
  } catch {}

  return null;
}

async function buildVercelApiBundle() {
  const outfile = path.join(rootDir, 'api', '_serverBundle.mjs');
  const esbuildMod = await resolveEsbuild();

  if (!esbuildMod || typeof esbuildMod.build !== 'function') {
    if (fs.existsSync(outfile)) {
      console.log('Using existing pre-built api/_serverBundle.mjs');
      return;
    }
    throw new Error('Could not resolve esbuild and api/_serverBundle.mjs does not exist.');
  }

  await esbuildMod.build({
    entryPoints: [path.join(rootDir, 'server.ts')],
    outfile,
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'esm',
    packages: 'external',
    sourcemap: false,
    logLevel: 'info',
  });
}

buildVercelApiBundle().catch((err) => {
  const outfile = path.join(rootDir, 'api', '_serverBundle.mjs');
  if (fs.existsSync(outfile)) {
    console.warn('Notice during API bundle step (using existing api/_serverBundle.mjs):', err?.message);
    process.exit(0);
  }
  console.error('Failed to bundle server for Vercel API:', err);
  process.exit(1);
});
