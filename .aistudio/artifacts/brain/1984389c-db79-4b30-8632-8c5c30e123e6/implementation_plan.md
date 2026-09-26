# User Management — Supabase Database Persistence & Table Display Plan

Users created in **User & Role Management** will be reliably persisted into Supabase (`auth.users`, `public.users`, and linked `public.teachers` / `public.students` role profiles) and immediately displayed in the User Management table with complete identity, contact, and profile linkage details.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following product and design decisions have been confirmed from your responses and incorporated into this plan:

- **Confirmed Decision 1 (Supabase Multi-Table Provisioning)**: Creating a user in User Management automatically populates `auth.users`, `public.users`, and the corresponding role profile table (`public.teachers` for teachers/headteachers, `public.students` for students).
- **Confirmed Decision 2 (User Identity Column Details)**: The first column (`User Identity`) of the User Management table will display the user's full name, `@username`, email address, phone number, and linked profile badge (e.g., Staff ID or Student ID/Class).

---

## 1. Overview & Core Concept

- **What It Does**: Eliminates the disconnect between user creation, Supabase database persistence, and the User Management table display. Every created user is written to Supabase (`auth.users` + `public.users` + role profile) under the active school's canonical UUID and appears immediately in the User Management table.
- **Target Audience / Persona**: School Administrators, Head Teachers, and Platform Creators managing staff, teacher, accountant, student, and parent accounts.
- **Key Value**: Guarantees that newly created accounts are visible in both the application UI and the Supabase table editor, and can sign in immediately across devices.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Create User Account**: Administrator opens the **Add User Account** modal, enters username, full name, email, phone, password, and role (plus optional Staff ID/Subjects or Student ID/Class), and submits.
  2. **Immediate Table Update & Verification**: Upon confirmation from `/api/users`, the modal closes, the newly provisioned user is immediately merged into the table state and re-verified via `GET /api/users`, and a confirmation banner shows the Supabase status and linked profile identifier.
  3. **Rich User Identity Cell (`td:nth-of-type(1)`)**: Each row's first column renders the user's avatar initial, full name, `@username`, email, phone number, and linked profile indicator (`Teacher · TEA-xxxx` or `Student · STU-xxxx`) using clean unboxed metadata separators (`·`).
- **Visual Identity & Theme**:
  - *Aesthetic Direction*: High-craft light-mode institutional SaaS console aligned with the SchoolSphere 3.1 palette.
  - *Color Palette & Mood*: `#f6f8f7` base canvas, `#ffffff` table surface, `#1c4a59` primary deep teal accents, `#faae57` primary CTA, `#1f2a2e` primary body text, `#6a7f84` muted metadata text, `#06d6a0` active status, and `#ef476f` suspended/alert status.
  - *Typography & Hierarchy*: Clean sans-serif for names and labels paired with monospace tabular numerals (`JetBrains Mono`, `tabular-nums`) for `@username`, email, phone numbers, and staff/student IDs.
- **Interactive Feedback & Motion**:
  - Smooth row entrance transition, clear loading state during provisioning, and instant status toggle/password reset feedback.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Dual-Path Supabase Provisioning (`auth.signUp` Trigger + RPC/Authenticated Client)**
  - *Chosen Approach*: In `POST /api/users`, when `auth.admin.createUser` is restricted (such as when running with an `anon` key), invoke `auth.signUp` on an isolated non-persisting Supabase client with `options.data` containing `full_name`, `username`, `role`, `school_id` (resolved to a real UUID in `public.schools`), and `phone`.
  - *Why*: In Supabase, `auth.signUp` works with the `anon` key, creates the `auth.users` record, and fires the `SECURITY DEFINER` trigger `on_auth_user_created` (`public.handle_new_user()`), which inserts the row directly into `public.users` as the database owner. Additionally, using the resulting authenticated session token grants the `authenticated` Postgres role (`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated`) so `password_hash`, `phone`, `public.teachers`, and `public.students` rows can be written directly to Supabase.
- **Decision 2: Canonical `school_id` Resolution & Frontend Tenant Matching**
  - *Chosen Approach*: Treat placeholder IDs (`00000000-0000-0000-0000-000000000001`) as unresolved in `resolveTenantSchoolForUsers` so the backend always resolves an existing school UUID from `public.schools` (or provisions the school row first). On the frontend, update `UserManagement.tsx` so `loadUsers` and `handleAddUser` reconcile the backend's canonical `schoolId` instead of filtering out valid tenant rows when the local school context held a placeholder ID or slug.
  - *Why*: Prevents foreign-key failures (`users_school_id_fkey`) in PostgreSQL and prevents client-side filtering from hiding newly created users in the table.

---

## 4. Technical Architecture & Data Strategy

### Architecture & Data Flow Diagram

```
┌───────────────────────────────────────────────────────────────────────────┐
│                   UserManagement View (Client UI)                         │
│  ┌─────────────────────────┐       ┌───────────────────────────────────┐  │
│  │ Create User Modal       │──────▶│ User Identity Table Cell (td[1])  │  │
│  │ (Role, Contact, Profile)│       │ Name · @username · Email · Phone  │  │
│  └────────────┬────────────┘       │ + Linked Teacher/Student Profile  │  │
│               │                    └─────────────────▲─────────────────┘  │
└───────────────┼──────────────────────────────────────┼────────────────────┘
                │ POST /api/users                      │ GET /api/users
                ▼                                      │ (Merged & Deduplicated)
┌──────────────────────────────────────────────────────┴────────────────────┐
│                     Express API Server (/api/users)                       │
│  1. resolveTenantSchoolForUsers() -> Resolves real UUID in public.schools │
│  2. Supabase Auth Provisioning    -> admin.createUser() OR auth.signUp()  │
│  3. public.users Persistence      -> Trigger handle_new_user() + RPC/Upsert│
│  4. Role Profile Auto-Link        -> public.teachers / public.students    │
└───────────────┬──────────────────────┬──────────────────────┬─────────────┘
                │                      │                      │
                ▼                      ▼                      ▼
       ┌─────────────────┐    ┌─────────────────┐    ┌──────────────────┐
       │   auth.users    │───▶│  public.users   │    │ public.teachers  │
       │ (Supabase Auth) │    │ (Tenant Scoped) │    │ public.students  │
       └─────────────────┘    └─────────────────┘    └──────────────────┘
        (on_auth_user_created trigger)
```

### Interactive Component & State Mapping

1. **Canonical Tenant School Resolution (`resolveTenantSchoolForUsers`)**:
   - Ignores synthetic placeholder UUID `00000000-0000-0000-0000-000000000001` when matching `public.schools` and falls back to matching by school name/slug or selecting the active school from `get_schools_directory()` so `school_id` always references a valid row in `public.schools`.
2. **Supabase `auth.users` & `public.users` Persistence (`POST /api/users` & `GET /api/users`)**:
   - Attempts `adminClient.auth.admin.createUser`; if unavailable under the current key, calls `authClient.auth.signUp` with user metadata (`full_name`, `username`, `role`, `school_id`, `phone`), triggering `public.handle_new_user()` to insert into `public.users`.
   - Uses the authenticated session client (or `provision_tenant_user` RPC) to persist `password_hash`, `phone`, `status`, and linked profile metadata (`staffId`, `studentId`, `assignedClasses`, `subjects`), and queries `public.users` via both service/authenticated client and `get_tenant_users` RPC in `GET /api/users`.
3. **User Management Table Display (`UserManagement.tsx`)**:
   - Updates `isTenantUser` and `handleAddUser` so newly created users are immediately appended to the table state and retained when `loadUsers()` refreshes, even if the frontend's initial `school.id` was a placeholder or slug.
   - Updates the first table cell (`td:nth-of-type(1)`) to display full name, `@username`, email, phone number, and linked profile metadata (`Teacher · TEA-...` or `Student · STU-...`).
