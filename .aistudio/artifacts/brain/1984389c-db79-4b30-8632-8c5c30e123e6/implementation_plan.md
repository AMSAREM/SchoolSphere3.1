# Vercel Build `esbuild` Module Resolution Fix Plan

Resolve `Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'esbuild' imported from /vercel/path0/scripts/build-vercel-api.mjs` during `npm run build` on Vercel.

## User Review & Critical Decisions

> [!IMPORTANT]
> On Vercel's build container, `esbuild` was installed as a nested dependency under `vite` / `tsx` rather than hoisted to the top-level `node_modules/esbuild`, causing the static top-level `import { build } from 'esbuild'` in `scripts/build-vercel-api.mjs` to fail before executing.

- **Root Cause**: `esbuild` was not declared as a direct dependency in `package.json`, and `scripts/build-vercel-api.mjs` used a static top-level ESM `import` instead of dynamic resolution with a pre-built bundle fallback.
- **Resolution**:
  1. Add `esbuild` as an explicit dependency in `package.json` so Vercel hoists it at the root `node_modules`.
  2. Replace the static top-level `import { build } from 'esbuild'` in `scripts/build-vercel-api.mjs` with dynamic resolution (checking top-level `esbuild` first, then resolving `esbuild` from `vite`'s module path via `createRequire`, and falling back to the pre-built `api/_serverBundle.mjs` already included in the repository so the build never exits with code `1`).

---

## 1. Overview & Core Concept

- **What It Does**: Ensures `npm run build` (`vite build && node scripts/build-vercel-api.mjs`) succeeds on Vercel regardless of how `npm` hoists `node_modules`.
- **Target Audience / Persona**: Vercel deployment pipeline for `https://www.schoolsphere.xyz`.
- **Key Value**: Guarantees a zero-error Vercel production build and ships the pre-bundled serverless API handler (`api/_serverBundle.mjs`).

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. Pushing to Vercel runs `vite build` (which completed cleanly in your log) followed by `node scripts/build-vercel-api.mjs` without throwing `ERR_MODULE_NOT_FOUND`.
  2. The deployed `https://www.schoolsphere.xyz` site serves `/api/db/status`, `/api/auth/resolve-school`, and `/api/auth/login` from the pre-bundled serverless handler.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision — Three-Layer `esbuild` Resolution + Pre-Built Bundle**:
  - *Chosen Approach*:
    1. Declare `"esbuild": "^0.25.12"` directly in `package.json`.
    2. Use `createRequire(import.meta.url)` inside `scripts/build-vercel-api.mjs` to resolve `esbuild` either directly or nested inside `vite` (`require.resolve('vite')`).
    3. Keep `api/_serverBundle.mjs` pre-built in the repository and never exit non-zero if `api/_serverBundle.mjs` is already present on disk.
  - *Why*: Eliminates any possibility of `scripts/build-vercel-api.mjs` failing on Vercel.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

```
┌──────────────────────────────────────────────────────────────────────┐
│             Vercel Build: npm run build                              │
│  1. vite build -> outputs dist/                                      │
│  2. node scripts/build-vercel-api.mjs                                │
│     ├─ Resolves esbuild (direct or via vite's node_modules)          │
│     ├─ Bundles server.ts -> api/_serverBundle.mjs                    │
│     └─ Falls back to committed api/_serverBundle.mjs if unavailable  │
└──────────────────────────────────────────────────────────────────────┘
```
