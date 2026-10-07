import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';

// Hermetic Supabase mock
const { serverMockFactory } = vi.hoisted(() => {
  const dummyClient: any = {
    auth: {
      getUser: async () => ({ data: { user: null }, error: new Error('Mock user not set') })
    },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) })
    })
  };

  const mockFactory = () => ({
    getSupabaseAdmin: () => dummyClient,
    getSupabaseUrlStrict: () => 'https://niavmonyfwqlryppgksy.supabase.co',
    createAuthenticatedSupabaseClient: () => dummyClient,
    getCreatorAuthenticatedClient: async () => dummyClient,
    runWithRequestToken: (_token: any, fn: () => any) => fn(),
    getCurrentRequestToken: () => null,
    getOrCreateSchoolBySlugOrName: async () => null
  });

  return { serverMockFactory: mockFactory };
});

vi.mock('../lib/supabase/server', () => serverMockFactory());
vi.mock('../lib/supabase/server.js', () => serverMockFactory());
vi.mock('../lib/supabase/server.ts', () => serverMockFactory());

import { app, startServer } from '../server';

describe('SEO, Sitemap & Google Search Console Suite', () => {
  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    await startServer();
  });

  describe('1. Dynamic XML Sitemap (/sitemap.xml)', () => {
    it('serves /sitemap.xml with HTTP 200 and application/xml Content-Type', async () => {
      const res = await request(app).get('/sitemap.xml');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/application\/xml/);
      expect(res.headers['cache-control']).toContain('public');
      expect(res.headers['cache-control']).toContain('max-age=86400');
    });

    it('contains valid XML structure and standard sitemap schema', async () => {
      const res = await request(app).get('/sitemap.xml');
      const body = res.text;

      expect(body).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(body).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"');
      expect(body).toContain('</urlset>');
    });

    it('contains all public crawlable routes with canonical URLs and valid priorities', async () => {
      const res = await request(app).get('/sitemap.xml');
      const body = res.text;

      const expectedUrls = [
        { loc: 'https://www.schoolsphere.xyz/', priority: '1.0' },
        { loc: 'https://www.schoolsphere.xyz/sign-in', priority: '0.8' },
        { loc: 'https://www.schoolsphere.xyz/portal', priority: '0.8' },
        { loc: 'https://www.schoolsphere.xyz/privacy', priority: '0.5' },
        { loc: 'https://www.schoolsphere.xyz/terms', priority: '0.5' }
      ];

      for (const item of expectedUrls) {
        expect(body).toContain(`<loc>${item.loc}</loc>`);
        expect(body).toContain(`<priority>${item.priority}</priority>`);
      }
    });

    it('includes valid lastmod tags in W3C Datetime format (YYYY-MM-DD) for every route', async () => {
      const res = await request(app).get('/sitemap.xml');
      const body = res.text;

      // Extract all <lastmod> entries
      const lastmodMatches = body.match(/<lastmod>([^<]+)<\/lastmod>/g);
      expect(lastmodMatches).toBeDefined();
      expect(lastmodMatches?.length).toBe(5);

      // Verify each matches standard YYYY-MM-DD W3C Datetime format
      for (const tag of lastmodMatches!) {
        const dateStr = tag.replace(/<\/?lastmod>/g, '');
        expect(dateStr).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        const parsed = new Date(dateStr);
        expect(isNaN(parsed.getTime())).toBe(false);
      }
    });
  });

  describe('2. Robots.txt Crawler Directives (/robots.txt)', () => {
    it('serves /robots.txt with HTTP 200 and text/plain Content-Type', async () => {
      const res = await request(app).get('/robots.txt');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/plain/);
      expect(res.headers['cache-control']).toContain('public');
    });

    it('allows public routes and rendering assets while disallowing sensitive admin endpoints', async () => {
      const res = await request(app).get('/robots.txt');
      const body = res.text;

      expect(body).toContain('User-agent: Googlebot');
      expect(body).toContain('User-agent: *');
      expect(body).toContain('Allow: /');
      expect(body).toContain('Allow: /assets/');
      expect(body).toContain('Allow: /sign-in');
      expect(body).toContain('Allow: /portal');
      expect(body).toContain('Allow: /sitemap.xml');
      expect(body).toContain('Disallow: /api/');
      expect(body).toContain('Disallow: /creator');
      expect(body).toContain('Disallow: /admin/');
      expect(body).toContain('Sitemap: https://www.schoolsphere.xyz/sitemap.xml');
    });
  });

  describe('3. Google Search Console Universal HTML File Verification', () => {
    it('responds to /google[id].html with HTTP 200 and verification payload', async () => {
      const verificationCode = 'abcdef1234567890';
      const res = await request(app).get(`/google${verificationCode}.html`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/html/);
      expect(res.text.trim()).toBe(`google-site-verification: google${verificationCode}.html`);
    });

    it('supports alphanumeric, hyphen, and underscore token IDs', async () => {
      const token = 'google-verification_token-998877';
      const res = await request(app).get(`/${token}.html`);

      expect(res.status).toBe(200);
      expect(res.text.trim()).toBe(`google-site-verification: ${token}.html`);
    });
  });

  describe('4. Canonical Domain 301 Apex-to-WWW Redirection', () => {
    it('redirects schoolsphere.xyz apex domain to https://www.schoolsphere.xyz with HTTP 301', async () => {
      const res = await request(app)
        .get('/')
        .set('Host', 'schoolsphere.xyz');

      expect(res.status).toBe(301);
      expect(res.headers.location).toBe('https://www.schoolsphere.xyz/');
    });

    it('preserves deep path when redirecting apex domain to canonical www', async () => {
      const res = await request(app)
        .get('/portal')
        .set('Host', 'schoolsphere.xyz');

      expect(res.status).toBe(301);
      expect(res.headers.location).toBe('https://www.schoolsphere.xyz/portal');
    });

    it('does not redirect localhost or standard development host requests', async () => {
      const res = await request(app)
        .get('/sitemap.xml')
        .set('Host', 'localhost:3000');

      expect(res.status).toBe(200);
      expect(res.headers.location).toBeUndefined();
    });

    it('exempts /sitemap.xml from apex redirect and serves HTTP 200 directly to support Search Console fetchers', async () => {
      const res = await request(app)
        .get('/sitemap.xml')
        .set('Host', 'schoolsphere.xyz');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/application\/xml/);
      expect(res.headers.location).toBeUndefined();
    });

    it('exempts /robots.txt from apex redirect and serves HTTP 200 directly', async () => {
      const res = await request(app)
        .get('/robots.txt')
        .set('Host', 'schoolsphere.xyz');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/plain/);
      expect(res.headers.location).toBeUndefined();
    });

    it('exempts Google Search Console HTML verification file from apex redirect and serves HTTP 200 directly', async () => {
      const res = await request(app)
        .get('/google1234567890abcdef.html')
        .set('Host', 'schoolsphere.xyz');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/html/);
      expect(res.headers.location).toBeUndefined();
    });

    it('responds to HEAD requests on /sitemap.xml with HTTP 200 and application/xml Content-Type', async () => {
      const res = await request(app)
        .head('/sitemap.xml')
        .set('Host', 'www.schoolsphere.xyz');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/application\/xml/);
    });
  });

  describe('5. SPA Real HTTP 404 Status Handling (Eliminating Google Soft 404 Penalties)', () => {
    it('returns true HTTP 404 status code for unknown top-level routes', async () => {
      const res = await request(app).get('/this-page-does-not-exist-xyz');
      expect(res.status).toBe(404);
      expect(res.headers['content-type']).toMatch(/text\/html/);
      expect(res.headers['cache-control']).toContain('no-cache');
      expect(res.text).toContain('<meta name="robots" content="noindex, follow" />');
      expect(res.text).toContain('404');
      expect(res.text).toContain('Page Not Found');
    });

    it('returns true HTTP 404 status code for deeply nested non-existent paths', async () => {
      const res = await request(app).get('/portal/some/deep/invalid/path');
      expect(res.status).toBe(404);
      expect(res.text).toContain('<meta name="robots" content="noindex, follow" />');
      expect(res.text).toContain('Return to Homepage');
      expect(res.text).toContain('Access Campus Portal');
    });

    it('provides crawlable navigation links on 404 error page to prevent crawler dead ends', async () => {
      const res = await request(app).get('/bad-link-test');
      expect(res.status).toBe(404);
      expect(res.text).toContain('href="/"');
      expect(res.text).toContain('href="/portal"');
      expect(res.text).toContain('href="/sign-in"');
      expect(res.text).toContain('href="/privacy"');
      expect(res.text).toContain('href="/terms"');
    });
  });

  describe('6. Server-Side Route Pre-Hydration & Crawlable SEO Metadata', () => {
    it('serves root / with HTTP 200, matching canonical link, OpenGraph tags, and crawlable fallback in #root', async () => {
      const res = await request(app).get('/');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/html/);
      expect(res.text).toContain('<title>SchoolSphere — Smart School Management Platform</title>');
      expect(res.text).toContain('<link rel="canonical" href="https://www.schoolsphere.xyz/" />');
      expect(res.text).toContain('property="og:title" content="SchoolSphere — Smart School Management Platform"');
      expect(res.text).toContain('property="og:url" content="https://www.schoolsphere.xyz/"');
      expect(res.text).toContain('name="twitter:title" content="SchoolSphere — Smart School Management Platform"');

      // Crawlable semantic HTML inside #root
      expect(res.text).toContain('<div id="root">');
      expect(res.text).toContain('Complete institutional operating system engineered for Ghanaian basic schools');
      expect(res.text).toContain('href="/portal"');
      expect(res.text).toContain('href="/sign-in"');
    });

    it('serves /sign-in with HTTP 200, route-specific title, and canonical URL', async () => {
      const res = await request(app).get('/sign-in');
      expect(res.status).toBe(200);
      expect(res.text).toContain('<title>Sign In &amp; Portal Access — SchoolSphere</title>');
      expect(res.text).toContain('<link rel="canonical" href="https://www.schoolsphere.xyz/sign-in" />');
      expect(res.text).toContain('property="og:url" content="https://www.schoolsphere.xyz/sign-in"');
      expect(res.text).toContain('Sign In to SchoolSphere');
    });

    it('serves /portal with HTTP 200 and route-specific canonical metadata', async () => {
      const res = await request(app).get('/portal');
      expect(res.status).toBe(200);
      expect(res.text).toContain('<title>Institutional Portal Gateway — SchoolSphere</title>');
      expect(res.text).toContain('<link rel="canonical" href="https://www.schoolsphere.xyz/portal" />');
      expect(res.text).toContain('Institutional Campus Portal');
    });

    it('serves /privacy and /terms with HTTP 200 and legal compliance metadata', async () => {
      const privacyRes = await request(app).get('/privacy');
      expect(privacyRes.status).toBe(200);
      expect(privacyRes.text).toContain('<title>Institutional Privacy Policy — SchoolSphere</title>');
      expect(privacyRes.text).toContain('<link rel="canonical" href="https://www.schoolsphere.xyz/privacy" />');
      expect(privacyRes.text).toContain('Ghana Data Protection Act 2012');

      const termsRes = await request(app).get('/terms');
      expect(termsRes.status).toBe(200);
      expect(termsRes.text).toContain('<title>Terms of Service &amp; Licensing — SchoolSphere</title>');
      expect(termsRes.text).toContain('<link rel="canonical" href="https://www.schoolsphere.xyz/terms" />');
    });

    it('serves portal modules with HTTP 200 and distinct titles', async () => {
      const dashboardRes = await request(app).get('/dashboard');
      expect(dashboardRes.status).toBe(200);
      expect(dashboardRes.text).toContain('<title>Executive Campus Dashboard — SchoolSphere</title>');
      expect(dashboardRes.text).toContain('<link rel="canonical" href="https://www.schoolsphere.xyz/dashboard" />');

      const studentsRes = await request(app).get('/students');
      expect(studentsRes.status).toBe(200);
      expect(studentsRes.text).toContain('<title>Student Directory &amp; Admissions — SchoolSphere</title>');
      expect(studentsRes.text).toContain('<link rel="canonical" href="https://www.schoolsphere.xyz/students" />');

      const timetableRes = await request(app).get('/timetable');
      expect(timetableRes.status).toBe(200);
      expect(timetableRes.text).toContain('<title>Master School Timetable — SchoolSphere</title>');
    });

    it('serves dynamic creator panels with HTTP 200 and formatted title', async () => {
      const creatorRes = await request(app).get('/creator/system-configuration');
      expect(creatorRes.status).toBe(200);
      expect(creatorRes.text).toContain('<title>System Configuration — Creator Command Console | SchoolSphere</title>');
      expect(creatorRes.text).toContain('<link rel="canonical" href="https://www.schoolsphere.xyz/creator/system-configuration" />');
    });

    it('includes Schema.org WebApplication and EducationalOrganization JSON-LD structured data', async () => {
      const res = await request(app).get('/');
      expect(res.status).toBe(200);
      expect(res.text).toContain('"@type": "WebApplication"');
      expect(res.text).toContain('"@type": "EducationalOrganization"');
      expect(res.text).toContain('"name": "SchoolSphere"');
      expect(res.text).toContain('"url": "https://www.schoolsphere.xyz/"');
    });

    it('enforces index, follow on public pages and noindex, nofollow on private portal views', async () => {
      const homeRes = await request(app).get('/');
      expect(homeRes.status).toBe(200);
      expect(homeRes.text).toContain('<meta name="robots" content="index, follow" />');

      const privacyRes = await request(app).get('/privacy');
      expect(privacyRes.status).toBe(200);
      expect(privacyRes.text).toContain('<meta name="robots" content="index, follow" />');

      const dashboardRes = await request(app).get('/dashboard');
      expect(dashboardRes.status).toBe(200);
      expect(dashboardRes.text).toContain('<meta name="robots" content="noindex, nofollow" />');

      const creatorRes = await request(app).get('/creator/system-configuration');
      expect(creatorRes.status).toBe(200);
      expect(creatorRes.text).toContain('<meta name="robots" content="noindex, nofollow" />');
    });

    it('verifies static pre-rendered public HTML files exist in dist directory', () => {
      const fs = require('fs');
      const path = require('path');
      const distPath = path.join(process.cwd(), 'dist');

      if (fs.existsSync(distPath)) {
        expect(fs.existsSync(path.join(distPath, 'index.html'))).toBe(true);
        expect(fs.existsSync(path.join(distPath, 'privacy', 'index.html'))).toBe(true);
        expect(fs.existsSync(path.join(distPath, 'terms', 'index.html'))).toBe(true);
        expect(fs.existsSync(path.join(distPath, 'sign-in', 'index.html'))).toBe(true);
        expect(fs.existsSync(path.join(distPath, 'portal', 'index.html'))).toBe(true);
        expect(fs.existsSync(path.join(distPath, '404.html'))).toBe(true);

        const privacyHtml = fs.readFileSync(path.join(distPath, 'privacy', 'index.html'), 'utf-8');
        expect(privacyHtml).toContain('Institutional Privacy Policy — SchoolSphere');
        expect(privacyHtml).toContain('https://www.schoolsphere.xyz/privacy');
        expect(privacyHtml).toContain('Ghana Data Protection Act 2012');
      }
    });
  });
});
