# Small-Screen Optimization for Attendance Module

Optimize the selected Attendance module Deep Teal Header Card (`div#print-attendance > div:nth-of-type(2)`) and the Student Attendance Roll Call Cards below it for all small mobile viewports (`320px – 639px`) and tablets (`640px – 1023px`) while strictly adhering to the application's Deep Teal (`#1c4a59`) and Warm Amber (`#faae57`) color palette.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following confirmed user decisions govern the small-screen optimization of the Attendance module:

- **Confirmed Decision 1 (Selected Header Card Layout)**: Arrange the 4 live status counters (`Present`, `Late`, `Absent`, `Excused`) into a balanced `2x2` grid on small screens (`grid-cols-2 sm:flex`), place `Date` and `Class` filters side-by-side (`grid-cols-[1fr_auto] sm:flex`), and organize the bulk/export buttons (`Mark All Present`, `Mark All Absent`, `PDF`, `Print`, `CSV`) in a compact responsive grid so controls never wrap raggedly or overflow narrow screens.
- **Confirmed Decision 2 (Student Roll-Call Cards)**: Stack the 5 attendance status & note buttons (`Present`, `Late`, `Absent`, `Excused`, `Note`) cleanly below the student's avatar, full name, and ID on narrow phones (`< 480px` / `< 640px`), while keeping the single-row horizontal layout on wider screens (`sm:flex-row sm:items-center sm:justify-between`).
- **Confirmed Decision 3 (Application Color Palette)**: Enforce the app's unified Deep Teal (`#1c4a59`), Warm Amber (`#faae57`), Warm Sand (`#e1c594`), Soft Neutral (`#f6f8f7`), Structural Border (`#bac4c6`), Primary Text (`#1f2a2e`), Muted Text (`#6a7f84`), Emerald (`#06d6a0`), and Coral Rose (`#ef476f`) tokens.

---

## 1. Overview & Core Concept

- **What It Does**: Redesigns the responsive geometry of the Attendance module's Deep Teal command header (`div#print-attendance > div:nth-of-type(2)`) and Student Roll Call cards so teachers, admins, parents, and students can view and mark daily attendance on `320px–639px` mobile screens with zero text truncation or horizontal overflow.
- **Target Audience / Persona**: Homeroom teachers marking daily roll call on mobile phones in class, administrators exporting attendance sheets, and parents reviewing their wards' daily attendance.
- **Key Value**: Gives student names full horizontal breathing room on phones, makes the 5 status buttons (`Present`, `Late`, `Absent`, `Excused`, `Note`) easy to tap with equal-width touch targets on mobile, and keeps the header card compact above the fold.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Selected Element — Deep Teal Attendance Header Card (`div#print-attendance > div:nth-of-type(2)`)**:
     - **Compact Responsive Container**: Uses `p-4 sm:p-6 lg:p-7 rounded-2xl sm:rounded-3xl gap-3.5 sm:gap-5` to reduce vertical height on mobile phones.
     - **Title & Sync Row**: Pairs the `Daily Roll Call & Register` label with the live `Supabase Synced` button in a clean wrapping header row, followed by a responsive title (`text-lg sm:text-2xl font-extrabold`) and formatted date subtitle (`text-xs sm:text-sm text-[#e1c594]/90`).
     - **2×2 Live Status Counter Grid**: On mobile (`< 640px`), `Present`, `Late`, `Absent`, and `Excused` render in a structured `grid grid-cols-2 sm:flex sm:flex-wrap gap-2 sm:gap-2.5` with tabular numerals (`font-mono tabular-nums`) so all 4 counters align neatly in two compact rows instead of wrapping 3+1.
     - **Side-by-Side Date & Class Filter Row**: On small screens, the `Date` picker (`flex-1 min-w-0`) and `Class` selector (`shrink-0 min-w-[88px]`) sit side-by-side in a single row (`grid grid-cols-[1fr_auto] sm:flex items-center gap-2 sm:gap-3 w-full md:w-auto`).
     - **Compact Bulk & Export Action Grid**:
       - `Mark All Present` (`bg-[#faae57] text-[#1f2a2e]`) and `Mark All Absent` (`bg-white/10 text-white`) sit side-by-side in a 2-column mobile row (`grid grid-cols-2 sm:flex gap-2 w-full sm:w-auto`).
       - `PDF`, `Print`, and `CSV` export buttons sit in a clean 3-column row below on mobile (`grid grid-cols-3 sm:flex gap-2 w-full sm:w-auto`) with compact labels (`PDF`, `Print`, `CSV`) so every button fits within `320px` viewports.
  2. **Student Attendance Roll Call Cards (`div#print-attendance > div:nth-of-type(3)`)**:
     - **Responsive Card Container**: Compact padding (`p-3.5 sm:p-4 rounded-2xl bg-white border-[#bac4c6]/80`) in a `grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5 sm:gap-4` grid.
     - **Stacked Mobile / Single-Row Desktop Layout**:
       - **Top Row (Student Identity)**: Displays the Deep Teal avatar (`w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-[#1c4a59] text-[#faae57]`), full student name (`text-xs sm:text-sm font-bold text-[#1f2a2e]`), student ID (`font-mono tabular-nums`), and a live status badge on the right (`Present`, `Late`, `Absent`, `Excused`) so the student's name has 100% of the card width on phones.
       - **Bottom Row on Mobile / Right Group on Desktop (5 Action Buttons)**: Renders `Present` (`#06d6a0`), `Late` (`#faae57`), `Absent` (`#ef476f`), `Excused` (`#1c4a59`), and `Note` (`#e1c594`) in an equal-width 5-column bar on mobile (`grid grid-cols-5 sm:flex items-center gap-1.5 w-full sm:w-auto pt-2 sm:pt-0 border-t sm:border-t-0 border-[#bac4c6]/40`) with short mobile labels (`P`, `L`, `A`, `E` + icon) and `min-h-[40px]` touch targets.
- **Visual Identity & Theme**:
  - *Aesthetic Direction*: High-contrast, utilitarian academic register with zero horizontal overflow and instant status legibility.
  - *Color Palette & Mood*:
    - Primary Header & Excused State: Deep Teal `#1c4a59`
    - Primary CTA & Late State: Warm Amber `#faae57` (hover `#e4ae67`)
    - Present State: Emerald Mint `#06d6a0`
    - Absent State: Coral Rose `#ef476f`
    - Warm Sand Accent & Note Active: `#e1c594` / `#807654`
    - Card & Input Surfaces: Pure White `#ffffff` and Soft Neutral `#f6f8f7` with `#bac4c6` borders

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: 2×2 Status Grid + Grouped Mobile Action Rows in Header Card**
  - *Chosen Approach*: Use `grid-cols-2 sm:flex` for the 4 attendance counters, `grid-cols-[1fr_auto] sm:flex` for Date + Class, and structured 2-column / 3-column mobile rows for Bulk Actions (`Mark All Present` / `Mark All Absent`) and Exports (`PDF` / `Print` / `CSV`).
  - *Why*: Previously, `flex-wrap` caused uneven 3+1 wrapping for status pills and 2+2+1 ragged wrapping for the 5 action buttons, consuming excessive vertical space on phones.
- **Decision 2: Stacked 5-Column Touch Bar on Student Cards for Small Screens**
  - *Chosen Approach*: Stack the 5 attendance buttons (`Present`, `Late`, `Absent`, `Excused`, `Note`) into a full-width `grid-cols-5` bar below the student's name on `< 640px` screens, transitioning to `sm:flex` inline on `640px+` screens.
  - *Why*: Five `40px` buttons require `220px+` of width, which left less than `60px` for student names on `320px–360px` mobile screens and caused severe name truncation.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

- **Architecture & Component Diagram**:
```
┌─────────────────────────────────────────────────────────────────────────┐
│                   Attendance Terminal (#print-attendance)               │
├─────────────────────────────────────────────────────────────────────────┤
│  1. Selected Element: Deep Teal Header Card (div:nth-of-type(2))        │
│     ├── Title + Supabase Sync Pill + Date/Count Subtitle                │
│     ├── 2×2 Mobile Status Grid (Present | Late | Absent | Excused)      │
│     └── Filter & Action Toolbar                                         │
│         ├── Side-by-Side Filter Row: [Date Picker (1fr)] [Class Select] │
│         ├── Bulk Row (2-Col Mobile): [Mark All Present] [Mark All Absent]│
│         └── Export Row (3-Col Mobile): [PDF] [Print] [CSV]              │
├─────────────────────────────────────────────────────────────────────────┤
│  2. Student Roll Call Grid (div:nth-of-type(3), gap-2.5 sm:gap-4)       │
│     └── Responsive Student Card (p-3.5 sm:p-4, flex-col sm:flex-row)    │
│         ├── Identity Header: [#1c4a59 Avatar] [Full Name + ID] [Badge]  │
│         ├── 5-Col Mobile Touch Bar: [Present][Late][Absent][Excused][💬]│
│         └── Inline Note Preview & Quick Save Editor                     │
└─────────────────────────────────────────────────────────────────────────┘
```

- **Data Model & State**:
  - Preserves all real-time Supabase (`attendance` table) and local IndexedDB (`db.attendance`) synchronization, including single-student status updates (`markAttendance`), inline note saving (`handleSaveStudentNote`), bulk status updates (`markAll`), and PDF/Print/XLSX exports.
- **Interactive Component & State Mapping**:
  - **Header Filter & Bulk Controls**: `selectedDate` and `selectedClass` filter the live student roster and attendance records; `markAll('Present' | 'Absent')` batch-upserts all class records to Supabase.
  - **Student Card Status & Note Controls**: Tapping `Present`, `Late`, `Absent`, or `Excused` immediately persists the status to Supabase; tapping the `Note` icon toggles the inline reason input (`toggleNoteEditor`) and saves via `handleSaveStudentNote`.
