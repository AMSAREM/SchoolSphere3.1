# SchoolSphere 3.1 — Strict JWT Authentication Gate on `/api/users` Endpoints

Enforces mandatory Bearer JWT authentication (`authenticateToken`) across the User Management API (`/api/users`) so anonymous requests are rejected with `HTTP 401` and forged or tampered Bearer tokens are rejected with `HTTP 403`, resolving both assertion failures in the live **Tenant Isolation, JWT Auth & RBAC Route Guards** test suite.

## User Review & Critical Decisions

> [!IMPORTANT]
> **Root Cause Identified**: All four `/api/users` endpoints (`GET /api/users`, `POST /api/users`, `PUT /api/users/:id`, and `DELETE /api/users/:id`) were mounted with `optionalAuthenticateToken` instead of `authenticateToken`. As a result, requests with no `Authorization` header or with a forged token (`Bearer forged.jwt.signature_tampered_payload`) bypassed the authentication gate and returned `HTTP 200` instead of `401` / `403`.

- **Confirmed Decision 1 — Strict `authenticateToken` Middleware on `/api/users`**: Replace `optionalAuthenticateToken` with `authenticateToken` on `GET /api/users`, `POST /api/users`, `PUT /api/users/:id`, and `DELETE /api/users/:id` so missing tokens return `HTTP 401 Unauthorized` and malformed/forged tokens return `HTTP 403 Forbidden`.
- **Confirmed Decision 2 — Session Token Continuity for Authenticated Browser Users**: Ensure `AuthContext` always issues or refreshes a valid Bearer token (`esepa_auth_token`) for active authenticated sessions so legitimate administrators using the User Management terminal always include a valid `Authorization: Bearer <token>` header.

---

## 1. Overview & Core Concept

- **What It Does**: Locks down all `/api/users` routes behind strict JWT verification while maintaining seamless authenticated access for tenant administrators and platform creators.
- **Target Audience / Persona**: School administrators, platform creators, and security auditors running the Full-Stack Verification Suite.
- **Key Value**: Eliminates anonymous enumeration or mutation of tenant user accounts and satisfies Master Guide §A5 & §A7 route authentication requirements.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Unauthenticated Request Rejection (`test_api_unauthenticated_rejection`)**: When the test runner calls `GET /api/license/status` and `GET /api/users` without an `Authorization` header, both routes immediately respond with `HTTP 401 Unauthorized`.
  2. **Malformed & Tampered Bearer Token Rejection (`test_api_invalid_jwt_rejection`)**: When the test runner sends `Authorization: Bearer forged.jwt.signature_tampered_payload` to `/api/license/status` and `/api/users`, both routes verify the signature via `authenticateToken` and immediately reject the request with `HTTP 403 Forbidden`.
  3. **Authenticated User Management**: Signed-in school administrators and creators continue to list, provision, update, and delete scoped tenant users with their active session JWT.
- **Visual Identity & Theme**:
  - Preserves the SchoolSphere 3.1 light palette (`#f6f8f7` background, `#1c4a59` primary surface, `#faae57` CTA, `#06d6a0` functional pass badge, `#ef476f` alert badge).

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1 — Mandatory `authenticateToken` on All `/api/users` Routes**
  - *Chosen Approach*: Gate `GET /api/users`, `POST /api/users`, `PUT /api/users/:id`, and `DELETE /api/users/:id` with `authenticateToken`.
  - *Why*: User directory records contain usernames, emails, roles, and school assignments and must never be accessible to unauthenticated callers or forged tokens.
  - *Alternatives Considered*: Rejecting only forged tokens while allowing missing tokens was rejected because `GET /api/users` without a token must return `HTTP 401` per the security specification.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

### Architecture & Request Verification Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                Frontend, Backend & Database Test Runner                 │
├───────────────────────────────────┬─────────────────────────────────────┤
│ 1. Unauthenticated Probe          │ 2. Forged JWT Probe                 │
│ GET /api/users (No Auth Header)   │ GET /api/users (Bearer forged.jwt…) │
└─────────────────┬─────────────────┴──────────────────┬──────────────────┘
                  │                                    │
                  ▼                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│             Express Route Guard: authenticateToken Middleware           │
│  • No Bearer token / query token  ──► HTTP 401 Unauthorized             │
│  • Invalid / tampered signature   ──► HTTP 403 Forbidden                │
│  • Valid signed JWT               ──► Attaches req.user & proceeds      │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │ (Valid Token Only)
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│          Tenant-Scoped Supabase Handler (/api/users CRUD)               │
│  • Scopes query/mutation to req.user.school_id / x-school-id            │
│  • Filters out creator/super_admin accounts from tenant listings        │
└─────────────────────────────────────────────────────────────────────────┘
```

### Interactive Component & State Mapping
- **Server `/api/users` Route Handlers**: Switch middleware from `optionalAuthenticateToken` to `authenticateToken` across `GET`, `POST`, `PUT`, and `DELETE` handlers.
- **Automated Verification Suite**: Add explicit Vitest assertions verifying that `GET /api/users` without a token returns `401` and `GET /api/users` with a forged Bearer token returns `403`, alongside existing authenticated CRUD tests.
