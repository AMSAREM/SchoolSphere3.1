# License Registry Deduplication & Key Filtering in Creator Hub

Resolves the React duplicate key warning (`Encountered two children with the same key`) in the Creator Hub's License Management suite by filtering out unlicensed school placeholders and strictly deduplicating registry entries across both license key and school identifier.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following decisions were confirmed during clarification and govern how license records and school rows are merged and displayed in the Creator Hub.

- **Confirmed Decision 1 — Valid Issued Keys Only**: The License Management registry and activity tables will display only records that have a valid, non-empty issued license key. Unlicensed school records without an issued key are excluded from the license registry tables.
- **Confirmed Decision 2 — Dual-Key Deduplication**: License registry entries returned by the backend and merged in the client state are deduplicated by both normalized license key (`UPPER(TRIM(key))`) and normalized school identifier (`school_id`), preventing duplicate rows or colliding React table keys.

## 1. Overview & Core Concept

- **What It Does**: Ensures the Creator Hub's License Management and Sales Suite views render a clean, strictly deduplicated registry of issued school licenses without React key collisions or unlicensed placeholder rows.
- **Target Audience / Persona**: Platform Creators (`super_admin`) managing multi-tenant school licenses, subscription tiers, and institutional activation states.
- **Key Value**: Eliminates UI rendering glitches and duplicate React key warnings in `<tbody>` tables while guaranteeing that license counts, revenue metrics, and registry rows accurately reflect unique, issued school licenses.

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **License Overview & Recent Key Activity**: When opening the Sales Suite overview, the "Recent Key Activity" table lists the 5 most recent issued licenses with unique row identities, clean status indicators, and quick selection into the detail drawer.
  2. **Master Key Registry Filtering & Inspection**: Switching to the License Management panel displays the full searchable, filterable table of issued licenses. Creators can filter by status (`Active`, `Expired`, `Revoked`), inspect school metadata, toggle activation status, or generate new keys.
  3. **Empty & Filtered States**: When no issued licenses match the active filter or search query, a clear empty state row is displayed inside the table.
- **Visual Identity & Theme**:
  - *Aesthetic Direction*: Utilitarian, high-density enterprise administration console adhering to the SchoolSphere 3.1 light-mode palette.
  - *Color Palette & Mood*: Base canvas `#f6f8f7`, crisp white card surfaces `#ffffff`, deep navy-teal primary headers `#1c4a59`, warm amber primary CTA `#faae57`, subtle structural dividers `#bac4c6`, and semantic status indicators (`#06d6a0` for active/paid, `#ef476f` for expired/revoked).
  - *Typography & Hierarchy*: Clean sans-serif (`Inter`) for institutional names and UI labels paired with monospace tabular figures (`JetBrains Mono`, `tabular-nums`) for license keys, student counts, and GH₵ financial figures.
  - *Component Styling & Layout*: High-density data grids with 44px minimum row heights, sticky headers, zebra row tinting (`#f6f8f7`), and single-elevation surface depth.
- **Interactive Feedback & Motion**: Smooth drawer transitions (`< 200ms`), immediate search and status filtering, and confirmed state updates after backend persistence.

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Exclude Unlicensed Schools from the License Registry State**
  - *Chosen Approach*: Only merge metadata from the schools directory onto existing issued license records rather than synthesizing blank `key: ""` rows for unlicensed schools.
  - *Why*: Synthesizing empty-key entries caused multiple `<tr>` elements to share `key=""` and inflated license registry tables with non-existent keys. Unlicensed schools remain accessible in the Institutional Directory for onboarding and key issuance.
  - *Alternatives Considered*: Assigning synthetic placeholder keys to unlicensed schools, which was passed over per user preference to show only records with a valid issued license key.
- **Decision 2: Multi-Layer Deduplication (API + State Merger + View Layer)**
  - *Chosen Approach*: Enforce deduplication by both normalized license key and school ID at the backend API level, inside the Creator Hub state merger, and via a memoized selector in the Sales Suite component.
  - *Why*: Guarantees defense-in-depth so that even if historical database tables (`school_licenses` and `schools`) contain overlapping records for the same school or key, the UI never receives or renders duplicate children.
  - *Alternatives Considered*: Deduplicating only in the UI table render loop, which would leave summary KPI counters out of sync with the visible table rows.

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

- **Architecture & Component Diagram**:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Supabase Persistence Layer                       │
│         [ school_licenses ]                 [ schools ]                 │
└──────────────────┬─────────────────────────────────┬────────────────────┘
                   │                                 │
                   ▼                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                   Express Backend License Registry API                  │
│  • Filters out rows with missing/empty license keys                     │
│  • Deduplicates by normalized license key AND school_id                 │
└──────────────────────────────────┬──────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      Creator Hub State Orchestrator                     │
│  • Enriches valid issued licenses with school contact/slug metadata     │
│  • Never injects empty-key placeholder rows for unlicensed schools      │
└──────────────────────────────────┬──────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        Sales Suite View Component                       │
│  • Memoized valid & deduplicated license collection                     │
│  • Recent Key Activity Table & Master Key Registry Table                │
│  • Composite unique React keys (`${normalizedKey}::${schoolId}`)        │
└─────────────────────────────────────────────────────────────────────────┘
```

- **Data Model & State**:
  - **License Record**: Contains a non-empty normalized `key`, `schoolId` (`school_id`), `schoolName`, `packageTier`, `maxStudents`, `IssueDate`, `ExpiryDate`, `status`, and enriched school contact details (`email`, `phone`, `location`, `slug`).
  - **Deduplication Invariant**: For any two records $A$ and $B$ in the active registry list, $\text{normKey}(A) \neq \text{normKey}(B)$ and (when `schoolId` is present) $\text{normSchoolId}(A) \neq \text{normSchoolId}(B)$.
- **Interactive Component & State Mapping**:
  - **License Fetch & Merge**: On Creator Hub initialization or refresh, the backend returns valid deduplicated licenses; the client merger enriches each license with school directory fields from matching `school_id` or `license_id` without adding unlicensed schools.
  - **Table Rendering (`Recent Key Activity` & `Master Key Registry`)**: Renders rows from the memoized deduplicated license list using composite row keys and updates the Inspector Drawer when a row is clicked.
  - **Automated Verification**: API and security test suite verifies that `/api/license/list` excludes empty keys and deduplicates overlapping key/school records.
