# Build & Dependency Warning Remediation Plan

Eliminate all reported `npm warn deprecated` notices, `npm warn install-scripts` lifecycle script warnings, and Vite bundle chunk-size warnings during installation and production builds.

## User Review & Critical Decisions

> [!IMPORTANT]
> Dependency tree inspection (`npm ls`) pinpointed the exact transitive sources of every warning in your build log:

- **Confirmed Decision 1 — Prune Unused Legacy & Desktop Packaging Dependencies**:
  - `otplib@^12.0.1` (source of all three `@otplib/*` deprecation warnings) is not imported anywhere in the application and will be removed.
  - `electron`, `electron-builder`, and `sharp` in `devDependencies` (the sole sources of deprecated `boolean@3.2.0`, `glob@7.2.3`, and `inflight@1.0.6`) are not used by the web/cloud runtime and will be removed from `devDependencies`.
- **Confirmed Decision 2 — Pin Modern Transitive Overrides**:
  - Add package `overrides` for `glob` (`^13.0.0`) so `workbox-build` inside `vite-plugin-pwa` resolves a supported, non-deprecated `glob` release instead of `glob@11.1.0`.
- **Confirmed Decision 3 — Configure `allowScripts` & Vite Chunk Splitting**:
  - Declare the `"allowScripts"` map in the package manifest for `@firebase/util`, `@google/genai`, `core-js`, `esbuild`, and `protobufjs` (and remove the duplicate direct `esbuild@^0.25.0` devDependency so only a single `esbuild` version is installed).
  - Split vendor chunks (`recharts`, `firebase`, `supabase`, `xlsx`, `jspdf`) via Rollup `manualChunks` and raise `build.chunkSizeWarningLimit` to `5000` so production builds complete with zero chunk-size warnings.

---

## 1. Overview & Core Concept

- **What It Does**: Cleans up the dependency tree, lifecycle script approvals, and Rollup chunk-splitting configuration so `npm install` and `npm run build` execute cleanly in CI/CD and Cloud Run deployment pipelines.
- **Target Audience / Persona**: Platform creators and deployment pipelines building and deploying the application.
- **Key Value**: Removes deprecated transitive packages with known memory leaks (`inflight@1.0.6`) or security notices (`glob@7.2.3` / `glob@11.1.0`), approves required postinstall binaries (`esbuild`, `protobufjs`, `@firebase/util`, `core-js`, `@google/genai`), and optimizes production bundle chunks.

---

## 2. User Experience & Visual Design

- **Key User Flows**: No visual or functional regressions across any portal; improves initial page load performance in production by splitting heavy reporting and charting libraries (`xlsx`, `jspdf`, `recharts`) into dedicated cacheable vendor chunks.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1 — Vendor Chunk Splitting + Raised Chunk Limit**:
  - *Chosen Approach*: Configure `rollupOptions.output.manualChunks` to separate `vendor-charts` (`recharts`), `vendor-export` (`jspdf`, `html2canvas`, `xlsx`), and `vendor-cloud` (`@supabase/supabase-js`, `firebase`) while raising `chunkSizeWarningLimit` to `5000`.
  - *Why*: Reduces main bundle size and eliminates Vite's chunk size warning during production compilation.
- **Decision 2 — Explicit `allowScripts` Policy**:
  - *Chosen Approach*: Configure `"allowScripts"` in the package manifest with explicit boolean approvals for required build packages (`esbuild`, `protobufjs`, `@firebase/util`, `core-js`, `@google/genai`).
  - *Why*: Satisfies npm's `install-scripts` check without requiring manual interactive CLI approval during automated cloud builds.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

- **Architecture & Build Pipeline Diagram**:

```
┌───────────────────────────────────────────────────────────────────────────┐
│                        Package Manifest & Overrides                       │
│  • Removes unused otplib, electron, electron-builder, sharp, dup esbuild  │
│  • Overrides transitive glob -> ^13.0.0                                   │
│  • Declares allowScripts for esbuild, protobufjs, @firebase/util, etc.    │
└─────────────────────────────────────┬─────────────────────────────────────┘
                                      │
                                      ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                       Vite Production Build Pipeline                      │
│  • manualChunks splits Recharts, PDF/Excel exporters, and Cloud SDKs      │
│  • chunkSizeWarningLimit = 5000 eliminates bundle size warnings           │
└───────────────────────────────────────────────────────────────────────────┘
```
