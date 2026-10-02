# Root-Cause Remediation for Vite 6 `/@vite/client` WebSocket Connection Error

Eliminate `[vite] failed to connect to websocket (Error: WebSocket closed without opened.)` at its source by preventing Vite 6's `/@vite/client` runtime module from initiating a dead WebSocket connection on port `24678` when `hmr: false` and `middlewareMode: true` are active.

## User Review & Critical Decisions

> [!IMPORTANT]
> Root-cause diagnosis of Vite 6 (`vite@6.2.3`) in middleware mode revealed why client-side listeners alone do not stop the error:

- **Root Cause Identified**: In Vite 6, even when `server.hmr: false` is configured, Vite's HTML pipeline still injects `<script type="module" src="/@vite/client"></script>` (required for CSS style injection via `updateStyle` / `removeStyle`), and `vite:client-inject` hardcodes `__HMR_PORT__ = 24678` whenever `middlewareMode: true` is used. When `/@vite/client` executes in the browser, it unconditionally invokes `transport.connect(createHMRHandler(handleMessage))`, which attempts to open `wss://<host>:24678` and logs `[vite] failed to connect to websocket (Error: WebSocket closed without opened.)`.
- **Chosen Solution — Server-Side `/@vite/client` Transform**: Add a lightweight Vite plugin and middleware transform that strips the unconditional `transport.connect(createHMRHandler(handleMessage))` call from `/@vite/client` whenever HMR is disabled, while preserving all required `/@vite/client` exports (`updateStyle`, `removeStyle`, `createHotContext`, `injectQuery`, `ErrorOverlay`).

---

## 1. Overview & Core Concept

- **What It Does**: Prevents the browser from ever attempting a `vite-hmr` WebSocket handshake when HMR is disabled in the runtime environment, while keeping Vite's CSS module injection and client utilities completely intact.
- **Target Audience / Persona**: All users and developers running the application in the preview environment.
- **Key Value**: Permanently eliminates both the failed WebSocket network request and the `[vite] failed to connect to websocket (Error: WebSocket closed without opened.)` error at the server compilation layer rather than trying to suppress it after the fact in the browser.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  - **Zero-Error Application Load**: When the application loads in the preview iframe, `/@vite/client` initializes CSS style injection immediately without opening a WebSocket or triggering any console error or unhandled promise rejection.
- **Visual Identity & Theme**: No visual layout changes; preserves all existing portal styles and components.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1 — Neutralize `transport.connect` in `/@vite/client` via Vite Plugin**:
  - *Chosen Approach*: Register a post-transform Vite plugin that intercepts `vite/dist/client/client.mjs` when HMR is disabled and replaces `transport.connect(createHMRHandler(handleMessage))` with a no-op, alongside `ws: false` in the server configuration.
  - *Why*: CSS modules in Vite dev mode depend on `updateStyle` and `removeStyle` exported by `/@vite/client`, so `/@vite/client` itself must remain loadable, but its WebSocket transport connection must not run when HMR is disabled.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

- **Architecture & Component Diagram**:

```
┌───────────────────────────────────────────────────────────────────────────┐
│                     Vite Dev Server (middlewareMode)                      │
│  • server.hmr = false, server.ws = false                                  │
└─────────────────────────────────────┬─────────────────────────────────────┘
                                      │
                                      ▼
┌───────────────────────────────────────────────────────────────────────────┐
│               Disable-HMR Client Transform Plugin (Post)                  │
│  • Intercepts /@vite/client (vite/dist/client/client.mjs)                 │
│  • Neutralizes transport.connect(createHMRHandler(handleMessage))         │
│  • Preserves updateStyle, removeStyle, createHotContext & ErrorOverlay    │
└─────────────────────────────────────┬─────────────────────────────────────┘
                                      │
                                      ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                         Browser Runtime Client                            │
│  • Zero 'vite-hmr' WebSocket connection attempts                          │
│  • Zero '[vite] failed to connect to websocket' errors or rejections      │
└───────────────────────────────────────────────────────────────────────────┘
```
