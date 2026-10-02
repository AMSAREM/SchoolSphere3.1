# Chart Dimension Stabilization & WebSocket Error Remediation

Eliminate the Recharts `width(0) and height(0) of chart should be greater than 0` runtime error across all portal dashboards and analytics views, and prevent `[vite] failed to connect to websocket (Error: WebSocket closed without opened.)` unhandled rejections in the HMR-disabled preview environment.

## User Review & Critical Decisions

> [!IMPORTANT]
> Both reported runtime errors stem from deterministic client-side initialization timing and require no breaking UI or workflow changes:

- **Confirmed Approach 1 — Positive-Dimension Guard for All Charts**: Replace raw percentage-only chart wrappers with a dimension-verified responsive container that measures its host element via `ResizeObserver` and only mounts the Recharts surface once both `width > 0` and `height > 0` are confirmed, while enforcing explicit minimum dimensions (`min-w-0`, `min-h-[220px]`) on parent flex/grid containers.
- **Confirmed Approach 2 — Pre-Module WebSocket Rejection & Console Guard**: Install an early synchronous guard in the document head (executing before ES module scripts such as `/@vite/client` initialize) alongside the application bootstrap to intercept and silence benign HMR-disabled `WebSocket closed without opened` rejections and console errors without masking genuine application errors.

---

## 1. Overview & Core Concept

- **What It Does**:
  1. Guarantees that every chart across the Institutional Overview Dashboard, Creator Command Console, Exam Analysis, Terminal Reports, SMS Analytics, and E-Voting Analytics always receives positive, non-zero pixel dimensions before rendering.
  2. Intercepts Vite client WebSocket connection failures caused by the preview environment's `DISABLE_HMR=true` posture before they trigger unhandled promise rejections or error overlays.
- **Target Audience / Persona**: All portal users (Creator, Admin, HOD, Teacher, Bursar, Student, and Parent) navigating between animated views or resizing viewports.
- **Key Value**: Removes console/overlay error noise and prevents blank or jittering charts during animated tab and page transitions.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Zero-Jitter Chart Mounting**: When switching into the Dashboard, Creator Console Overview, Exam Analysis, SMS Analytics, Report Terminal, or E-Voting Analytics (including inside animated transitions), the chart container reserves its exact layout height (`250px`–`300px`) immediately and renders the chart smoothly as soon as layout measurement completes on the next animation frame.
  2. **Clean Runtime Console & Error Boundary**: Loading or refreshing the application in the preview iframe completes cleanly without firing `WebSocket closed without opened` unhandled rejections or Recharts zero-dimension warnings.
- **Visual Identity & Theme**:
  - *Aesthetic Direction*: Preserves the existing SchoolSphere institutional palette (`#1c4a59` Deep Teal, `#faae57` Warm Amber, `#f6f8f7` Neutral Canvas) and Creator Console Slate/Indigo theme.
  - *Component Styling & Layout*: Every chart parent container enforces `min-w-0` (preventing CSS Grid/Flexbox blowout or zero-width collapse) and explicit minimum height tokens matching the chart's target viewport height.
- **Interactive Feedback & Motion**:
  - While a chart container is completing its initial 1-frame layout measurement, a subtle, geometry-matched placeholder preserves the exact container height so surrounding cards never shift.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1 — Measured Pixel Injection via Safe Chart Wrapper**:
  - *Chosen Approach*: Create a shared `SafeResponsiveContainer` component that observes its wrapper `<div>` with `ResizeObserver`, falls back to sensible default dimensions if measurement is pending, and passes explicit positive `minWidth={1}` and `minHeight={1}` props to Recharts.
  - *Why*: Recharts v3 logs an error synchronously on mount if `width="100%"` and `height="100%"` evaluate to `0` during an `AnimatePresence` transition or hidden-tab mount. Delaying the inner Recharts mount until `width > 0 && height > 0` eliminates the root cause across all 6 chart-bearing modules at once.
  - *Alternatives Considered*: Adding fixed pixel widths to every chart, which breaks responsiveness across mobile, tablet, and desktop viewports.
- **Decision 2 — Synchronous Head-Level WebSocket Guard**:
  - *Chosen Approach*: Add an inline synchronous `<script>` at the top of the HTML `<head>` (which runs before `<script type="module" src="/@vite/client">`) to capture `unhandledrejection` and `error` events matching `WebSocket closed without opened` / `failed to connect to websocket`.
  - *Why*: Module scripts like `/@vite/client` are injected at the top of `<head>` and execute before the React entry point mounts, which is why a listener inside the React entry point alone runs too late to catch the initial Vite WebSocket rejection.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

- **Architecture & Component Diagram**:

```
┌───────────────────────────────────────────────────────────────────────────┐
│                   Document Head Synchronous Bootstrap                     │
│  • Captures early 'unhandledrejection' & 'error' events before ES modules │
│  • Filters benign Vite HMR-disabled WebSocket close rejections            │
└─────────────────────────────────────┬─────────────────────────────────────┘
                                      │
                                      ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                    SafeResponsiveContainer Wrapper                        │
│  • ResizeObserver tracks host container clientWidth & clientHeight        │
│  • Enforces min-w-0 and explicit minHeight on outer flex/grid wrapper     │
│  • Renders Recharts ResponsiveContainer ONLY when width > 0 & height > 0  │
└──────┬─────────────┬─────────────┬─────────────┬─────────────┬────────────┘
       │             │             │             │             │
       ▼             ▼             ▼             ▼             ▼
┌────────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌──────────────────┐
│ Dashboard  │ │  Creator  │ │   Exam    │ │    SMS    │ │ E-Voting & Term  │
│ Analytics  │ │  Console  │ │ Analysis  │ │ Analytics │ │ Report Charts    │
│  Charts    │ │ Telemetry │ │  Charts   │ │   Chart   │ │                  │
└────────────┘ └───────────┘ └───────────┘ └───────────┘ └──────────────────┘
```

- **Interactive Component & State Mapping**:
  - **SafeResponsiveContainer**: Maintains local `{ width, height }` state initialized via synchronous `getBoundingClientRect()` on ref callback and updated via `ResizeObserver`. Renders children inside Recharts `ResponsiveContainer` with `minWidth={1}` and `minHeight={1}` only when `width > 0 && height > 0`.
  - **Chart Modules Updated**:
    - Institutional Overview Dashboard (Academic Performance & Revenue Overview charts)
    - Creator Command Console (Monthly Platform Growth & Database Composition charts)
    - Exam Analysis (Subject Averages & Grade Distribution charts)
    - E-Voting Analytics (Live Poll Turnout, Candidate Tallies & Breakdown charts)
    - SMS Module (Delivery Analytics chart)
    - Report Terminal (Student Term Performance chart)
