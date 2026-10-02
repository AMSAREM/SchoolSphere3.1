# Production Routing, Serverless Auth & Asset MIME Remediation Plan

Resolve the `405 Method Not Allowed` error on `/api/auth/login` and the `Refused to apply style ... MIME type ('text/html')` stylesheet error on `https://www.schoolsphere.xyz`.

## User Review & Critical Decisions

> [!IMPORTANT]
> Inspection of the production routing and deployment configuration identified the exact causes of both errors on `https://www.schoolsphere.xyz`:

- **Root Cause 1 — Catch-All Rewrite Returning `index.html` for `/api/*` and `/assets/*`**:
  - The deployment rewrite configuration currently maps `/(.*)` directly to `/index.html`, and only `/api/health` exists in the serverless `api/` directory.
  - When the sign-in screen sends `POST /api/auth/login`, the request is rewritten to the static file `/index.html`, which rejects `POST` requests with **`405 Method Not Allowed`**.
  - When a browser or service worker requests a hashed stylesheet under `/assets/index-*.css` from a prior deployment, the catch-all rewrite serves `/index.html` (`Content-Type: text/html`) with status `200`. Because `X-Content-Type-Options: nosniff` is active, the browser blocks the response with the strict MIME checking error.
- **Confirmed Remediation Strategy**:
  1. **Serverless API Gateway & Rewrite Exclusion**: Add a catch-all serverless API handler that routes `/api/*` requests to the Express backend, and restrict SPA HTML rewrites strictly to non-API, non-asset navigation routes so `/assets/*` and `/api/*` never resolve to `index.html`.
  2. **Direct Supabase Auth Fallback on 405/Unreachable Backend**: Enhance the client authentication flow so that if `/api/auth/login` ever returns `405`/`404`/`5xx` or a non-JSON response, authentication seamlessly falls back to direct Supabase Auth and tenant lookup (`schools`, `users`, `licenses`, `teachers`, `students`).
  3. **Cache-Control, Workbox & Stale Asset Recovery**: Configure `no-cache, no-store, must-revalidate` headers on `/index.html` and `/sw.js`, add Workbox `cleanupOutdatedCaches` and `navigateFallbackDenylist` for `/api/*` and `/assets/*`, and add automatic stale-stylesheet cache recovery in the HTML entry point.

---

## 1. Overview & Core Concept

- **What It Does**: Restores full `/api/auth/login` and `/api/*` functionality on `https://www.schoolsphere.xyz`, prevents missing or rotated `/assets/*.css` and `/assets/*.js` files from being rewritten to `text/html`, and automatically recovers clients holding stale cached asset hashes after a deployment.
- **Target Audience / Persona**: All users signing in at `https://www.schoolsphere.xyz/sign-in` across Creator, Admin, HOD, Teacher, Bursar, Student, and Parent portals.
- **Key Value**: Eliminates the `405` login failure and broken unstyled page loads caused by `text/html` MIME responses on CSS assets.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. Navigating to `https://www.schoolsphere.xyz/sign-in` always loads the current production stylesheet with `Content-Type: text/css` (and automatically refreshes if a browser tab had cached an older deployment's HTML/SW).
  2. Submitting credentials on `/sign-in` succeeds via the `/api/auth/login` serverless handler, with an automatic client-side Supabase fallback if the serverless edge returns a `405`/`5xx` status.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1 — Exclude `/api/*` and `/assets/*` from SPA HTML Fallback**:
  - *Chosen Approach*: Route `/api/(.*)` to the serverless Express bridge and restrict `/index.html` rewrites to navigation paths without file extensions (`/((?!api/|assets/|.*\\..*).*)`), both in cloud rewrite rules and in the Express production server.
  - *Why*: Guarantees `/api/*` handles `POST`/`PUT`/`DELETE` requests properly instead of hitting static `/index.html` (HTTP 405), and ensures missing `/assets/*.css` requests return HTTP 404 instead of `text/html`.
- **Decision 2 — Dual-Path Authentication Resilience**:
  - *Chosen Approach*: Keep `/api/auth/login` as the primary authoritative login endpoint while adding a direct Supabase multi-tenant authentication fallback when the `/api/auth/login` response is non-JSON or HTTP 404/405/5xx.
  - *Why*: Ensures users can sign in on `www.schoolsphere.xyz` even during serverless cold starts or static edge hosting.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

- **Request & Asset Routing Diagram**:

```
┌───────────────────────────────────────────────────────────────────────────┐
│                    Browser Client (www.schoolsphere.xyz)                  │
│  • Stale CSS/chunk detector auto-busts outdated SW/HTML cache once        │
└───────────────┬─────────────────────────────┬─────────────────────────────┘
                │                             │
      GET /assets/*.css             POST /api/auth/login
                │                             │
                ▼                             ▼
┌───────────────────────────────┐ ┌─────────────────────────────────────────┐
│   Static Asset & PWA Layer    │ │   Serverless API Bridge & Auth Engine   │
│  • /assets/* served as CSS/JS │ │  • Routes /api/* to Express app         │
│  • Never rewritten to HTML    │ │  • CORS allow-list includes .xyz domain │
│  • Workbox excludes /assets/* │ │  • Client falls back to Supabase on 405 │
└───────────────────────────────┘ └─────────────────────────────────────────┘
```
