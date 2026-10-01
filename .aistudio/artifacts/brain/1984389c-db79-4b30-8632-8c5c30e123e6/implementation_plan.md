# Clean UI & Native URL Routing Plan

Keep the portal interface clean with zero extra header breadcrumbs or page banners while preserving native HTML5 History API path routing (`/portal/dashboard`, `/portal/students`, `/creator/licenses`, etc.) and dynamic browser tab titles.

## User Review & Critical Decisions

> [!IMPORTANT]
> This plan reflects your confirmed preference to keep the current clean UI without adding extra address bars or banners.

- **Confirmed Decision**: Keep the current clean UI layout with no extra page banners, breadcrumb bars, or synthetic URL bars.
- **How `*.ai.studio` vs. Direct URLs Work**:
  - When accessed via `https://schools360.ai.studio/`, AI Studio wraps the application in a full-screen cross-origin `<iframe>`, so the browser's top address bar always shows the outer `https://schools360.ai.studio/` wrapper URL.
  - When accessed directly via the Cloud Run URL (`https://ais-pre-2m4lcq44pyuwmghy2bv5zn-689154690670.europe-west2.run.app`) or a custom domain mapped directly to Cloud Run, the browser address bar automatically displays the full route path after the slash (e.g., `/portal/dashboard`, `/portal/students`, `/creator/licenses`).

---

## 1. Overview & Core Concept

- **What It Does**: Maintains a distraction-free workspace across all school portal views and the Creator Console while continuing to update `window.history` and `document.title` behind the scenes.
- **Target Audience / Persona**: School administrators, teachers, bursars, students, parents, and platform creators.
- **Key Value**: Maximizes vertical screen real estate for tables, analytics, and forms without visual clutter.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Top Header Bar**: Displays only the school logo, school name (or Tenant Switcher for platform creators), sync status, and user profile/logout controls.
  2. **Main Content Area**: Renders each active module (`Dashboard`, `StudentManagement`, `ResultsTerminal`, `CreatorHub`, etc.) directly at the top of the viewport with no intermediate page identity banner.
  3. **Browser Tab Title & History State**: Automatically updates `document.title` (e.g., `Student Directory | JOYCE ACADEMY — SchoolSphere 3.1`) and `window.history` paths on navigation.
- **Visual Identity & Theme**:
  - *Aesthetic Direction*: Clean utilitarian institutional workspace.
  - *Color Palette & Mood*: Crisp `#f6f8f7` canvas, `#ffffff` surfaces, deep teal `#1c4a59` primary accents, and warm `#faae57` highlights.
  - *Typography & Hierarchy*: High-contrast module headings rendered directly by each functional view.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: No Synthetic In-App Address Bar or Identity Banner**
  - *Chosen Approach*: Keep the top header and view container free of redundant breadcrumb/banner chrome and remove the unused `PageHeaderBanner` component import.
  - *Why*: Avoids duplicate titles and preserves maximum viewport space across desktop and mobile screens.
  - *Alternatives Considered*: Adding an in-app URL bar or breadcrumb banner (rejected per user preference).

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

```
┌──────────────────────────────────────────────────────────────────────┐
│                        Browser / Host Context                        │
│  • *.ai.studio Wrapper: Cross-origin iframe host (shows root '/')    │
│  • Direct Cloud Run / Custom Domain: Shows full path '/portal/...'   │
└──────────────────────────────────┬───────────────────────────────────┘
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│                     App Navigation & Title Sync                      │
│  • Updates document.title on every view / sub-panel change           │
│  • Pushes clean pathnames (/portal/*, /creator/*) via History API    │
│  • Renders module views directly with zero extra banner chrome       │
└──────────────────────────────────────────────────────────────────────┘
```

- **Cleanup Scope**:
  - Remove the unused `PageHeaderBanner` import and component file so the codebase stays lean and lint-clean.
  - Verify the build with `compile_applet`.
