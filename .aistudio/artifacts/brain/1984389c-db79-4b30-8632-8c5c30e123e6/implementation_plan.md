# Remediate Server-Wide Unauthenticated Cross-Tenant Data Exposure

This plan eliminates the structural unauthenticated cross-tenant data exposure across `server.ts` by locking down directory/license endpoints, enforcing mandatory `authenticateToken` middleware on every tenant and administrative route, and hardening `resolveTenantAccessScope` plus all module-level `resolve*SchoolId` helpers so unauthenticated or cross-tenant requests never fall through to client-supplied `school_id` parameters.

## User Review Required

> [!IMPORTANT]
> **1. `GET /api/schools` (`/api/tenants`) & `GET /api/license/list` Lockdown**
> - `GET /api/schools` and `GET /api/tenants` will require mandatory `authenticateToken`.
>   - **Platform Creator (`creator` / `super_admin`)**: Receives the full tenant directory and license keys.
>   - **Authenticated Tenant User (`admin`, `teacher`, etc.)**: Receives **only** their own assigned school (`id === req.user.school_id`), never any other tenant's record or license key.
>   - **Unauthenticated Caller**: Rejected immediately with `401 Unauthorized` (pre-login school discovery already uses the sanitized `GET /api/schools/public` and `GET /api/auth/resolve-school` routes).
> - `GET /api/license/list` (`/api/license/generated`), `POST /api/license/generate`, `POST|PUT /api/license/update`, `POST /api/license/revoke`, `POST /api/license/sync`, `POST /api/license/repair-relationships`, and `POST /api/license/maintenance` will require `authenticateToken` and restrict cross-tenant license enumeration/mutation to `creator` / `super_admin` (or own-tenant read for `admin`).

> [!WARNING]
> **2. Fail-Closed `resolveTenantAccessScope` & Module `resolve*SchoolId` Helpers**
> - **`resolveTenantAccessScope(req, explicitSchoolId)`**:
>   - If `!req.user`: immediately returns `{ schoolId: '', isSuper: false, forbidden: true, unauthorized: true, error: 'Authentication required.' }` — never falls through to `validRequestedSchoolId`.
>   - If `!isSuper && !validUserSchoolId`: immediately returns `{ schoolId: '', isSuper: false, forbidden: true, error: 'Tenant isolation policy violation: User account has no assigned school_id.' }` — never falls through to `validRequestedSchoolId`.
>   - If `!isSuper && validRequestedSchoolId && validRequestedSchoolId !== validUserSchoolId`: returns `forbidden: true` (`403 Forbidden`).
>   - Non-Creator effective `schoolId` is strictly `validUserSchoolId`.
> - **All Module Helpers (`resolveTimetableSchoolId`, `resolveAttendanceSchoolId`, `resolveResultsSchoolId`, `resolveSirenSchoolId`, `resolveEvotingSchoolId`, `resolveInventorySchoolId`, `resolvePayrollSchoolId`)**:
>   - Refactored to delegate directly to `resolveTenantAccessScope(req)` and throw a typed `TenantAccessError` (`statusCode: 401 | 403`) if `unauthorized` or `forbidden`, removing all unauthenticated fallbacks that previously accepted `req.query.school_id` / `req.body.school_id` or queried arbitrary rows from `schools`, `classes`, or `students`.

---

## Technical Architecture

```
┌────────────────────────────────────────────────────────────────────────────┐
│                         Incoming HTTP Request                              │
└─────────────────────────────────────┬──────────────────────────────────────┘
                                      │
          ┌───────────────────────────┴───────────────────────────┐
          ▼                                                       ▼
┌───────────────────────────────────┐           ┌────────────────────────────┐
│ Public Pre-Auth Allowlist ONLY    │           │ All Tenant & Admin Routes  │
│ • GET  /api/schools/public        │           │ • /api/schools, /tenants   │
│ • GET  /api/auth/resolve-school   │           │ • /api/license/*           │
│ • POST /api/auth/login, /verify   │           │ • /api/students, /teachers │
│ • POST /api/license/activate      │           │ • /api/classes, /subjects  │
│ • GET  /api/health, /api/db/status│           │ • /api/timetable, /results │
└───────────────────────────────────┘           │ • /api/attendance, /fees/* │
                                                │ • /api/lesson-notes, /siren│
                                                │ • /api/evoting, /inventory │
                                                │ • /api/payroll, /settings/*│
                                                └─────────────┬──────────────┘
                                                              │
                                                              ▼
                                                ┌────────────────────────────┐
                                                │ Mandatory authenticateToken│
                                                │ No valid Bearer token ➔ 401│
                                                └─────────────┬──────────────┘
                                                              │
                                                              ▼
                                                ┌────────────────────────────┐
                                                │  resolveTenantAccessScope  │
                                                │ • !req.user ➔ 401          │
                                                │ • !isSuper & !userSchool   │
                                                │   ➔ 403 Forbidden          │
                                                │ • !isSuper & reqSchool !=  │
                                                │   userSchool ➔ 403         │
                                                │ • Effective ID = userSchool│
                                                └────────────────────────────┘
```

### Key Files to Modify

- **`server.ts`**
  - **Directory & License Endpoints**: Add mandatory `authenticateToken` (and role/scope checks) to:
    - `GET /api/schools`, `GET /api/tenants`, `POST /api/schools`, `POST /api/tenants`, `PUT /api/schools/:id`, `PATCH /api/schools/:id`, `PUT /api/tenants/:id`, `PATCH /api/tenants/:id`
    - `GET /api/license/list`, `GET /api/license/generated`, `GET /api/license/school/:schoolName`, `POST /api/license/generate`, `POST /api/license/update`, `PUT /api/license/update`, `POST /api/license/revoke`, `POST /api/license/sync`, `POST /api/license/repair-relationships`, `POST /api/license/maintenance`, `POST /api/send-license`, `POST /api/license/send`, `POST /api/license/send-email`, `POST /api/license/log-email-dispatch`, `GET /api/license/status`, `POST /api/license/modules`, `POST /api/license/deactivate`
    - `GET /api/creator/telemetry`, `GET|POST|PUT|DELETE /api/crm/leads*`, `GET|POST|PUT|DELETE /api/crm/invoices*`, `POST /api/admin/supabase-service-key`, `GET /api/integrations/vercel-supabase`, `GET /api/diagnostics/master-schema-sql`
  - **Core Academic & Sync Endpoints**: Replace `optionalAuthenticateToken` and bare handlers with mandatory `authenticateToken` + `resolveTenantAccessScope` on:
    - `GET /api/db/sync`, `POST /api/db/sync`, `GET /api/sync/pull`, `POST /api/sync/push`, `GET /api/sync/logs`, `GET /api/academic/sync-tenant/:schoolId`, `POST /api/academic/sync-tenant/:schoolId`
    - `GET /api/students`, `POST /api/students`, `POST /api/students/bulk`, `PUT /api/students/:id`, `DELETE /api/students/:id`, `POST /api/students/bulk-delete`
    - `GET /api/teachers`, `POST /api/teachers`, `PUT /api/teachers/:id`, `DELETE /api/teachers/:id`
    - `GET /api/classes`, `POST /api/classes`, `PUT /api/classes/:id`, `DELETE /api/classes/:id`
    - `GET /api/subjects`, `POST /api/subjects`, `PUT /api/subjects/:id`, `DELETE /api/subjects/:id`
  - **All Feature Module Endpoints**: Replace `optionalAuthenticateToken` and bare handlers with mandatory `authenticateToken` + strict tenant scope enforcement on:
    - `/api/timetable*` (8 routes)
    - `/api/attendance*` (3 routes)
    - `/api/results*` (4 routes)
    - `/api/lesson-notes*` (6 routes)
    - `/api/fees/*` (6 routes)
    - `/api/payroll*` (3 routes)
    - `/api/duty-roster*` (2 routes)
    - `/api/support/tickets*` (4 routes)
    - `/api/siren/*` (13 routes)
    - `/api/evoting/*` (13 routes)
    - `/api/inventory/*` (8 routes)
    - `/api/settings/state`, `/api/settings/save`, `/api/settings/sync` (3 routes)
    - `/api/sms/config`, `/api/sms/balance-arkesel`, `/api/sms/send-arkesel`, `/api/paystack/initialize` (4 routes)
    - `/api/security/check-file-hash`, `/api/security/record-file-hash` (2 routes)
    - `/api/auth/heartbeat`, `/api/auth/logout-telemetry`, `/api/auth/permissions`, `/api/auth/record-login` (4 routes)
  - **Scope Resolution Helpers (`resolveTenantAccessScope`, `resolveTimetableSchoolId`, `resolveAttendanceSchoolId`, `resolveResultsSchoolId`, `resolveSirenSchoolId`, `resolveEvotingSchoolId`, `resolveInventorySchoolId`, `resolvePayrollSchoolId`)**:
    - Never fall back to client-supplied `school_id` when `!req.user` or when `!isSuper`.
    - Remove all cross-tenant database fallback lookups (`from('schools').select('id').limit(1)`, `from('classes').select('school_id')`, `from('students').select('school_id')`).
- **Frontend API Callers (`src/components/SchoolManagement.tsx`, `src/components/SmsModule.tsx`, `src/components/PaystackPaymentButton.tsx`, `src/lib/fileSecurity.ts`, `src/lib/api.ts`)**
  - Ensure `getApiHeaders()` is passed on all requests to `/api/tenants`, `/api/schools`, `/api/sms/*`, `/api/paystack/initialize`, and `/api/security/*`, and preserve `Authorization: Bearer <supabaseAccessToken>` when passing `x-google-access-token` to `/api/license/generate`.
- **`tests/security_and_api.test.ts`**
  - Add comprehensive regression tests verifying:
    1. Unauthenticated requests to `GET /api/schools`, `GET /api/tenants`, `GET /api/license/list`, `GET /api/students?school_id=school-uuid-a`, `GET /api/teachers`, `GET /api/attendance`, `POST /api/attendance`, `GET /api/results`, `GET /api/fees/transactions`, `POST /api/fees/pay`, `GET /api/timetable`, `GET /api/lesson-notes`, `GET /api/siren/state`, `GET /api/evoting/state`, `GET /api/inventory/state`, and `GET /api/settings/state` all return **`401 Unauthorized`**.
    2. Authenticated School B user attempting to read or mutate School A data (`?school_id=school-uuid-a` or `body.school_id='school-uuid-a'`) across those routes receives **`403 Forbidden`** (or is strictly isolated from School A's data).
    3. Authenticated School A admin calling `GET /api/schools` sees only School A and cannot harvest School B's record or license key.

---

## Verification & Execution Plan

1. **Harden `resolveTenantAccessScope` & Module Helpers**: Refactor `resolveTenantAccessScope` and all `resolve*SchoolId` helpers in `server.ts` to fail closed on missing authentication or cross-tenant `school_id` mismatch.
2. **Enforce Mandatory `authenticateToken` Across Routes**: Update all tenant and administrative route definitions in `server.ts` to require `authenticateToken` and enforce tenant isolation.
3. **Sync Frontend Headers & Run Automated Security Suite**: Update any frontend `fetch` calls missing `getApiHeaders()`, expand `tests/security_and_api.test.ts` with unauthenticated (`401`) and cross-tenant (`403`) assertions across all modules, and verify with `npx vitest run tests/security_and_api.test.ts`, `lint_applet`, and `compile_applet`.
