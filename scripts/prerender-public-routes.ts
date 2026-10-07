import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  ROUTE_REGISTRY,
  resolveRouteSeo,
  injectRouteMetadata,
  renderNotFoundHtml
} from '../lib/serverSeo.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');

async function prerenderPublicRoutes() {
  const indexHtmlPath = path.join(distDir, 'index.html');
  if (!fs.existsSync(indexHtmlPath)) {
    console.warn('[Prerender] dist/index.html not found, skipping static generation.');
    return;
  }

  const baseTemplate = fs.readFileSync(indexHtmlPath, 'utf-8');
  const googleToken = process.env.VITE_GOOGLE_SITE_VERIFICATION || process.env.GOOGLE_SITE_VERIFICATION || '';

  // Canonical public routes to statically generate
  const publicRoutes = [
    '/',
    '/welcome',
    '/sign-in',
    '/portal',
    '/privacy',
    '/terms'
  ];

  console.log(`[Prerender] Generating static HTML for ${publicRoutes.length} public canonical routes...`);

  for (const routePath of publicRoutes) {
    const meta = resolveRouteSeo(routePath);
    if (!meta) continue;

    const renderedHtml = injectRouteMetadata(baseTemplate, meta, googleToken);

    if (routePath === '/') {
      // Overwrite dist/index.html with the pre-rendered root HTML
      fs.writeFileSync(indexHtmlPath, renderedHtml, 'utf-8');
      console.log(`  ✓ Statically rendered [${routePath}] -> dist/index.html`);
    } else {
      const cleanName = routePath.replace(/^\/+/, '');
      const subDir = path.join(distDir, cleanName);
      if (!fs.existsSync(subDir)) {
        fs.mkdirSync(subDir, { recursive: true });
      }

      // Write dist/<name>/index.html
      const subIndexPath = path.join(subDir, 'index.html');
      fs.writeFileSync(subIndexPath, renderedHtml, 'utf-8');

      // Write dist/<name>.html for servers that serve clean URLs without trailing slash
      const flatHtmlPath = path.join(distDir, `${cleanName}.html`);
      fs.writeFileSync(flatHtmlPath, renderedHtml, 'utf-8');

      console.log(`  ✓ Statically rendered [${routePath}] -> dist/${cleanName}/index.html & dist/${cleanName}.html`);
    }
  }

  // Generate 404.html for static CDNs (Vercel, Netlify, Cloudflare Pages)
  const notFoundHtml = renderNotFoundHtml('/404');
  const notFoundPath = path.join(distDir, '404.html');
  fs.writeFileSync(notFoundPath, notFoundHtml, 'utf-8');
  console.log('  ✓ Statically rendered 404 handler -> dist/404.html');

  console.log('[Prerender] All public canonical routes successfully pre-rendered for search bots and crawlers.');
}

prerenderPublicRoutes().catch((err) => {
  console.error('[Prerender Error]:', err);
  process.exit(1);
});
