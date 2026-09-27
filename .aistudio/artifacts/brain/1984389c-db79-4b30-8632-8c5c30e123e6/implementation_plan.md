# Attendance Module — Live Supabase Synchronization & Full Status Support

Connect the **Attendance** module directly to Supabase (`public.attendance`, `public.students`, and `public.classes`) so every attendance entry, status update, bulk action, and note is persisted to and loaded from Supabase in real time, without modifying any other module.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> The following decisions were confirmed during clarification and govern this Attendance-only implementation:

- **Confirmed Decision 1 — Immediate Sync on Every Click & Bulk Action**: Marking an individual student or clicking a bulk "Mark All" action immediately writes to `public.attendance` in Supabase and awaits database confirmation before finalizing state.
- **Confirmed Decision 2 — Auto-Migrate Existing Local Data on Load**: On initial load, any local attendance records (along with any locally enrolled students/classes needed for the roll call) that are not yet in Supabase are automatically migrated into `public.attendance` so zero historical entries are lost.
- **Confirmed Decision 3 — Four Statuses + Optional Note (`Present`, `Late`, `Absent`, `Excused`)**: Every student row supports **Present**, **Late**, **Absent**, and **Excused** (matching the `public.attendance` database check constraint) plus an optional reason/note stored in `public.attendance.reason`.

---

## 1. Overview & Core Concept

- **What It Does**: Upgrades the **Daily Roll Call & Register** (`Attendance`) screen from local-only IndexedDB storage to a full bi-directional Supabase data pipeline. Both the class roster and daily attendance records are fetched live from Supabase, and every single or bulk attendance action writes directly to `public.attendance`.
- **Target Audience / Persona**: School Administrators, Headteachers, and Class Teachers taking daily roll call, as well as Parents viewing their linked wards' live attendance records.
- **Key Value**: Ensures attendance records taken on any device are immediately available in Supabase across all authorized sessions, with full support for excused absences and teacher remarks.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Live Fetch & Auto-Migration on Open**: Opening the Attendance screen or changing the selected date/class fetches the latest attendance records, class list, and student roster from Supabase. Any local attendance records not yet in Supabase are automatically pushed and reconciled in the background.
  2. **One-Tap Individual Marking (`Present` · `Late` · `Absent` · `Excused`)**: Clicking any of the four status buttons on a student card immediately upserts the row `(school_id, student_id, date)` in `public.attendance` and updates the live header counters (`Present`, `Late`, `Absent`, `Excused`).
  3. **Optional Attendance Note / Reason**: Clicking the note icon on a student card reveals a compact inline input to record or update a reason (e.g., *"Medical clinic visit"*, *"Traffic delay"*), which saves directly to `public.attendance.reason` in Supabase.
  4. **Bulk Roll-Call Actions**: Clicking **Mark All Present**, **Mark All Late**, **Mark All Absent**, or **Mark All Excused** performs a single batch upsert to Supabase for all students in the currently selected class and date.
  5. **Parent Read-Only View & Exports**: Parents view their linked wards' live Supabase attendance status and notes without edit controls. Exporting to CSV, PDF, or Print includes the synchronized status and reason/note for every student.
- **Visual Identity & Theme**:
  - Strictly adheres to the SchoolSphere 3.1 light palette:
    - Base surface `#f6f8f7`, card surface `#ffffff`, borders `#bac4c6`.
    - Deep Teal `#1c4a59` hero header card with a live **Supabase Sync Chip** (`Attendance Synced · N records`, `Saving to Supabase…`, or `Sync Error — Retry`).
    - Status colors paired with clear icons and labels: **Present** (`#06d6a0` + Check icon), **Late** (`#faae57` + Clock icon), **Absent** (`#ef476f` + X icon), and **Excused** (`#e4ae67` / `#1c4a59` + FileText/Shield icon).
  - All counters, dates, and student IDs use `JetBrains Mono` / `tabular-nums`, and all interactive buttons maintain $\ge 44\text{px}$ touch targets with `active:scale-[0.97]` micro-interaction feedback.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1 — Upsert on `(school_id, student_id, date)` in `public.attendance`**
  - *Chosen Approach*: Use the composite key `(school_id, student_id, date)` when writing single or bulk attendance records to `public.attendance`, storing `class`, `status`, `reason`, `recorded_by`, and `created_at`.
  - *Why*: Matches the database's `uq_school_student_date` unique constraint, preventing duplicate attendance rows for the same student on the same day while allowing instant status or note updates.
- **Decision 2 — Scoped Strictly to the Attendance Module**
  - *Chosen Approach*: Implement dedicated `/api/attendance`, `/api/attendance/bulk`, and `/api/attendance/sync` endpoints on the backend and wire them exclusively to the Attendance view, using Dexie only as a read-through cache after Supabase confirms writes.
  - *Why*: Delivers full Supabase persistence and retrieval for Attendance while respecting the strict boundary not to touch any other module.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

### Architecture & Data Flow

```
┌────────────────────────────────────────────────────────────────────────────┐
│                     Attendance Roll Call UI (React)                        │
│                                                                            │
│  ┌──────────────────────────────────┐  ┌────────────────────────────────┐  │
│  │   Live Header & Sync Status      │  │   Student Roll-Call Cards      │  │
│  │  • Date & Class Selectors        │  │  • Present / Late / Absent /   │  │
│  │  • Present/Late/Absent/Excused   │  │    Excused (≥44px buttons)     │  │
│  │  • Mark All Bulk Actions         │  │  • Optional Note/Reason Input  │  │
│  └────────────────┬─────────────────┘  └───────────────┬────────────────┘  │
└───────────────────┼────────────────────────────────────┼───────────────────┘
                    │ GET / POST (Bulk & Auto-Sync)      │ POST (Single Upsert)
                    ▼                                    ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                 Express Attendance API (/api/attendance*)                  │
│                                                                            │
│  • GET  /api/attendance       (Fetch attendance + students + classes)      │
│  • POST /api/attendance       (Upsert single student attendance + reason)  │
│  • POST /api/attendance/bulk  (Batch upsert Mark All for class & date)     │
│  • POST /api/attendance/sync  (Reconcile & auto-migrate local records)     │
└─────────────────────────────────────┬──────────────────────────────────────┘
                                      │
                                      ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                       Supabase PostgreSQL Database                         │
│                                                                            │
│  public.attendance                                                         │
│  • id, school_id, student_id, class, date, status                          │
│  • reason (optional note), recorded_by, created_at                         │
│  • UNIQUE (school_id, student_id, date)                                    │
│                                                                            │
│  public.students & public.classes (read/hydrated for class roll call)      │
└────────────────────────────────────────────────────────────────────────────┘
```

### Interactive Component & State Mapping

1. **Initial Load & Auto-Migration (`/api/attendance` & `/api/attendance/sync`)**:
   - On component mount and when `selectedDate` or `selectedClass` changes, query `/api/attendance?school_id=...` (with direct Supabase client fallback).
   - Compare local IndexedDB `attendance` rows against Supabase `public.attendance` rows by `(studentId, date)`. If unsynced local rows exist, send them to `/api/attendance/sync` so they are persisted in Supabase, then update the local read-through cache with the authoritative Supabase dataset.
2. **Single Student Status & Note Upsert (`markAttendance` & `saveAttendanceNote`)**:
   - Clicking **Present**, **Late**, **Absent**, or **Excused** sets `syncState = 'saving'`, sends `POST /api/attendance` with `{ school_id, studentId, class: student.class, date: selectedDate, status, reason, recordedBy }`, awaits the confirmed Supabase row, updates remote state and read-through cache, and sets `syncState = 'synced'`.
   - Updating a student's optional note/reason saves via the same upsert endpoint and displays a subtle note badge on the student card.
3. **Bulk Class Marking (`markAll`)**:
   - Clicking **Mark All Present**, **Mark All Late**, **Mark All Absent**, or **Mark All Excused** sends all students in the active class view to `POST /api/attendance/bulk` in one request, awaits confirmation from Supabase, and refreshes the class attendance state.
