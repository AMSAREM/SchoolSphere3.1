# Supabase Continuous Assessment & Results Synchronization

Persist all dynamic Class Exercises, Homework, and Class Test columns and per-student marks directly in the Supabase database (`public.results` and `public.school_settings`), with automatic background synchronization on mark/column edits and full bulk synchronization on **Save All Scores**.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following architectural and workflow decisions were confirmed for synchronizing Continuous Assessment (Class Exercises, Homework, and Class Tests) with Supabase:

- **Confirmed Sync Trigger Strategy**: **Auto-save changes and sync on Save All Scores** — Adding or removing exercise/homework/test columns and entering student marks automatically debounce-syncs to Supabase in the background, while clicking **Save All Scores & Sync Report Cards** executes a complete authoritative bulk upsert of all class scores, exam scores, grades, and exercise breakdowns.
- **Confirmed Supabase Persistence Granularity**: **Store full exercise, homework, and test breakdown in Supabase** — Each subject's assessment column definitions (`Exercise`, `Homework`, `Test`, max marks) and each student's individual raw marks, raw total, and auto-scaled 30% Class Score are persisted in Supabase so teachers and administrators see the exact same breakdown across any device or session.

---

## 1. Overview & Core Concept

- **What It Does**: Connects the Continuous Assessment (CA) matrix in the Results & Grading Terminal directly to the multi-tenant Supabase PostgreSQL backend. Every Exercise, Homework, and Class Test column configuration and every student's individual assessment scores flow through dedicated Supabase API endpoints and persist in `public.results` and `public.school_settings`.
- **Target Audience / Persona**: Subject Teachers, Class Teachers, Headteachers, and School Administrators recording continuous assessment marks and generating terminal report cards across multiple devices.
- **Key Value**: Eliminates browser-only storage silos for class exercises, homework, and class tests. Teachers can record Exercise 1 on one computer, Homework 1 on another, and print Terminal Report Cards from the Headteacher's office with 100% real-time Supabase consistency.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Loading Subject Continuous Assessment from Supabase**: When a teacher selects a **Class**, **Subject**, and **Term** in the Results Terminal, the app queries Supabase (`GET /api/results`) for that tenant school's saved assessment columns (`Ex 1`, `Ex 2`, `HW 1`, `Test 1`, or custom columns) and each student's recorded exercise/homework/test marks, hydrating both the UI state and local IndexedDB cache.
  2. **Auto-Save on Column & Mark Changes**:
     - Adding a new column (e.g., `HW 2 /15` or `Test 2 /20`), removing a column, or resetting columns immediately persists the updated column schema and rescaled 30% Class Scores to Supabase (`POST /api/results/ca`).
     - Typing or editing a student's mark in any Exercise, Homework, or Test cell immediately updates the student's **Raw CA (`X / Max`)** and **Auto-Scaled Class Score (`30%`)** in the table and triggers a debounced (`600ms`) background upsert to Supabase.
  3. **Live Cloud Sync Indicator**: A compact status indicator in the Continuous Assessment toolbar displays real-time persistence state (`Syncing to Supabase...` → `Synced to Supabase` with timestamp) without obstructing data entry.
  4. **Authoritative Bulk Save & CSV Import**: Clicking **Save All Scores & Sync Report Cards** (or importing a CSV sheet) dispatches the full class roster's exercise breakdowns, 30% Class Scores, 70% Exam Scores, Total (100%), Grade, and Remarks to `POST /api/results`, ensuring both `public.results` and `public.school_settings` are updated in a single atomic round-trip.
  5. **Report Card Hydration from Supabase**: Opening a student's **Terminal Report Card** fetches the latest synchronized subject rows from Supabase so the summed & scaled **30% Class Score**, **70% Exam Score**, **100% Total**, **Grade**, and **Remarks** are always up to date.

- **Visual Identity & Theme**:
  - *Aesthetic Direction*: High-density, utilitarian academic spreadsheet and SaaS grading console following the 60-30-10 neutral-to-accent ratio.
  - *Color Palette & Mood*: Crisp light surface (`#FFFFFF` / `#F8FAFC`) with 1px structural hairline borders (`#E2E8F0`), semantic category accents (Indigo `#4F46E5` for Exercises, Amber `#D97706` for Homework, Purple `#7C3AED` for Class Tests, Emerald `#059669` for the computed 30% Class Score and Supabase sync confirmation).
  - *Typography & Hierarchy*: `Plus Jakarta Sans` for crisp column headers and student names paired with strict monospace tabular numerals (`JetBrains Mono` / `tabular-nums`) for all exercise inputs, raw sums, 30% scaled scores, 70% exam scores, and 100% totals so digits align vertically without jitter.
  - *Component Styling & Layout*: Single-elevation card container with horizontal scroll protection for dynamic assessment columns, compact `40px` row height, and unboxed typographic metadata (`·` separators) for column max-mark indicators.

- **Interactive Feedback & Motion**:
  - Instant (`<50ms`) client-side recalculation of Raw CA and 30% Class Score on keystroke.
  - Non-blocking status transitions (`Syncing to Supabase...` → `Synced to Supabase`) in the toolbar header.
  - Clear toast feedback on column additions, removals, and bulk saves.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Dual-Layer Supabase Persistence (`public.results` + `public.school_settings`)**
  - *Chosen Approach*: Persist each student's `class_score` (30%), `exam_score` (70%), `total_score` (100%), `grade`, `remarks`, and JSONB breakdown fields (`exercise_scores`, `exercise_columns`, `raw_ca_score`, `raw_ca_max`) to `public.results`, while simultaneously storing the structured per-(class, subject, term) Continuous Assessment ledger inside `public.school_settings` (`streams.continuous_assessment`) and updating `supabase/schema_master.sql`.
  - *Why*: Guarantees 100% immediate compatibility with the live Supabase PostgreSQL instance even before custom DDL migrations are re-run, while also supporting native JSONB columns on `public.results` when present.
  - *Alternatives Considered*: Relying solely on new `ALTER TABLE` columns on `public.results` was rejected because PostgREST rejects inserts of unknown columns if the live Supabase schema cache has not yet run the migration script.

- **Decision 2: Debounced Auto-Save + Explicit Bulk Save**
  - *Chosen Approach*: Trigger a `600ms` debounced upsert to Supabase (`POST /api/results/ca`) whenever a teacher edits exercise/homework/test marks or modifies assessment columns, and execute a full class upsert (`POST /api/results`) when clicking **Save All Scores & Sync Report Cards**.
  - *Why*: Prevents data loss if a teacher closes the browser mid-grading while avoiding excessive network requests on every single keystroke.
  - *Alternatives Considered*: Firing an unthrottled POST request on every keystroke was passed over to prevent race conditions during rapid numeric entry.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

### Architecture & Component Diagram

```
┌────────────────────────────────────────────────────────────────────────────┐
│                   Results & Grading Terminal (React SPA)                   │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ Continuous Assessment Matrix (Exercise / Homework / Test Columns)    │  │
│  │  • Add / Remove / Reset CA Columns ──► Immediate Supabase Sync       │  │
│  │  • Student Mark Input (/Max)       ──► 600ms Debounced Auto-Save     │  │
│  │  • Save All Scores / CSV Import    ──► Full Class Bulk Upsert        │  │
│  └──────────────────────────────┬───────────────────────────────────────┘  │
└─────────────────────────────────┼──────────────────────────────────────────┘
                                  │
                                  ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                     Multi-Tenant API Client (resultsApi)                   │
│  • getByClassAndTerm(class, term, subject, schoolId) ──► GET /api/results  │
│  • saveContinuousAssessment(payload, schoolId)       ──► POST /api/results/ca│
│  • recordScores(results, schoolId)                   ──► POST /api/results │
│  • syncLocalResults(payload, schoolId)               ──► POST /api/results/sync│
└─────────────────────────────────┬──────────────────────────────────────────┘
                                  │
                                  ▼
┌────────────────────────────────────────────────────────────────────────────┐
│               Express Backend Proxy & Tenant Guard (server.ts)             │
│  • resolveResultsSchoolId(req) (enforces tenant isolation & school_id)     │
│  • upsertResultsAndCaInSupabase(schoolId, records, caMeta)                 │
│  • fetchSchoolResultsFromSupabase(schoolId, filters)                       │
└───────────────┬─────────────────────────────────────────┬──────────────────┘
                │                                         │
                ▼                                         ▼
┌───────────────────────────────────────┐ ┌──────────────────────────────────┐
│     Supabase: public.results          │ │  Supabase: public.school_settings│
│  • school_id, student_id, subject     │ │  • school_id                     │
│  • term, academic_year, class         │ │  • streams.continuous_assessment │
│  • class_score (30%), exam_score (70%)│ │    ├─ columns[class|subj|term]   │
│  • total_score (100%), grade, remarks │ │    └─ scores[class|subj|term]    │
│  • exercise_scores, exercise_columns  │ │       (per-student Ex/HW/Test)   │
└───────────────────────────────────────┘ └──────────────────────────────────┘
```

### Data Model & State

- **`public.results` (Supabase Table & Master Schema)**:
  - Core columns: `school_id`, `student_id`, `subject`, `term`, `academic_year`, `class`, `class_score` (auto-scaled 30%), `exam_score` (70%), `total_score` (100%), `grade`, `remarks`.
  - Extended CA columns in `supabase/schema_master.sql` (and auto-migrated via `pgPool` when available): `exercise_scores JSONB DEFAULT '{}'::jsonb`, `exercise_columns JSONB DEFAULT '[]'::jsonb`, `raw_ca_score NUMERIC(6,2)`, `raw_ca_max NUMERIC(6,2)`.
- **`public.school_settings` (`streams.continuous_assessment` JSONB Ledger)**:
  - Keyed by normalized `${className}::${subject}::${term}` inside the tenant's `school_settings` row in Supabase:
    - `columns`: Array of `ClassAssessmentItem` (`{ id, title, category: 'Exercise' | 'Homework' | 'Test', maxScore }`).
    - `studentScores`: Map of `studentId -> Record<columnId, number>` plus `rawCaScore`, `rawCaMax`, and `scaledClassScore`.
    - `updatedAt`: Epoch timestamp in milliseconds.

### Interactive Component & State Mapping

1. **Initial Mount & Filter Switch (`selectedClass`, `selectedSubject`, `selectedTerm`)**:
   - Calls `resultsApi.getByClassAndTerm(selectedClass, selectedTerm, selectedSubject, schoolId)` which hits `GET /api/results`.
   - The server queries `public.results` and `public.school_settings` in Supabase, merges each student's `exerciseScores` and `exerciseColumns` onto their result record, and returns `{ results, caColumns, caScores }`.
   - Reconciles local Dexie `db.results` and `db.settings` in-place and populates the Continuous Assessment matrix.
2. **Column Management (`handleAddAssessmentColumn`, `handleRemoveAssessmentColumn`, `handleResetDefaultColumns`)**:
   - Updates `assessmentColumns` state, recalculates all students' 30% Class Scores, updates local Dexie, and immediately invokes `resultsApi.saveContinuousAssessment(...)` to persist the updated column structure and rescaled scores to Supabase.
3. **Exercise, Homework, and Test Score Entry (`handleExerciseScoreChange` & `handleScoreChange`)**:
   - Validates and clamps input between `0` and `col.maxScore`, recomputes `rawObtained / rawMax` and `scaledClassScore` (`0–30`), and schedules a `600ms` debounced call to `resultsApi.saveContinuousAssessment(...)`.
   - Displays live sync state in the toolbar (`Syncing to Supabase...` → `Synced to Supabase`).
4. **Bulk Save & Sync (`handleBulkSave` & `importFromCsv`)**:
   - Flushes any pending debounced save and calls `resultsApi.recordScores(resultsToSave, targetSchoolId)` (`POST /api/results`), writing all student rows and CA breakdowns to Supabase and updating `pullData` / `pushData` in `server.ts` so full-tenant syncs also preserve `exerciseScores` and `exerciseColumns`.
