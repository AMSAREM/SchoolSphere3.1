import { build } from 'esbuild';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

async function buildVercelApiBundle() {
  await build({
    entryPoints: [path.join(rootDir, 'server.ts')],
    outfile: path.join(rootDir, 'api', '_serverBundle.mjs'),
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
  console.error('Failed to bundle server for Vercel API:', err);
  process.exit(1);
});
