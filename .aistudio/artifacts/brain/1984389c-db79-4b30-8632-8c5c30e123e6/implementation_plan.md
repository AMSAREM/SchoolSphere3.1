# Unified Page Title, Subtitle & Breadcrumb Identity System

Ensure every page across the SchoolSphere portal prominently displays its official **Page Name**, **Module Subtitle**, and **Breadcrumb Path** at the top of the page view, inside the **Top Navigation Header Bar** (on both mobile and desktop), and in the **Browser Tab Title (`document.title`)**.

## User Review & Critical Decisions

> [!IMPORTANT]
> This plan incorporates your confirmed choices from the clarification questions.

- **Confirmed Decision 1 (Placement Across Every Surface)**:
  1. **Top of Every Page View**: A dedicated, high-clarity **Page Identity Header** rendered above the active view's workspace.
  2. **Top Navigation Header Bar**: Displays the active Page Name alongside the school name across both mobile and desktop viewports (replacing raw snake-case strings like `exam_analysis` with proper titles like `BECE & WASSCE Exam Analysis`).
  3. **Browser Tab Title (`document.title`)**: Dynamically updates to `{Page Title} — {School Name} | SchoolSphere` on every navigation change.
- **Confirmed Decision 2 (Page Context & Breadcrumb Trail)**: Every page header includes a clickable **Breadcrumb Path** (`Portal / {Department Category} / {Page Title}`), the bold **Page Title**, a concise **Module Subtitle**, and the active **Academic Year & Term** metadata.

## 1. Overview & Core Concept

- **What It Does**: Establishes a single, authoritative metadata registry for all 19 portal pages (`dashboard`, `students`, `academic`, `timetable`, `duty_roster`, `payroll`, `lesson_notes`, `attendance`, `results`, `exam_analysis`, `reports`, `fees`, `siren`, `evoting`, `inventory`, `users`, `settings`, `creator`, and `school_management`) with role-aware titles (e.g., *My Payslips & Salary Advances* for teachers vs. *Staff Payroll & Compensation* for bursars/admins).
- **Target Audience / Persona**: All portal users (Administrators, Headteachers, HODs, Teachers, Accountants, Students, and Parents) navigating across modules on desktop, tablet, or mobile.
- **Key Value**: Eliminates disorientation when switching modules, provides immediate context on every screen and printed sheet, and keeps the browser tab title and top header synchronized.

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Top Navigation Header Bar (Desktop & Mobile)**:
     - Displays the School Logo and School Name followed by the clean breadcrumb separator (`/`) and the human-readable **Active Page Name** on desktop, plus a compact subtitle line on mobile so mobile users always see both their school and current page name.
  2. **Top-of-Page Identity Banner (`PageHeaderBanner`)**:
     - Appears at the top of every portal view with:
       - **Breadcrumb Trail**: Clickable `Dashboard` root link `›` Category (e.g., *Academic Operations*, *Finance & Bursary*, *Campus Governance*) `›` Current Page Name.
       - **Primary Page Heading (`<h1>`)**: Crisp, high-contrast title with the module's functional icon.
       - **Brief Module Subtitle**: 1-sentence description of what the user can accomplish on the current page.
       - **Academic Session Metadata**: Clean unboxed metadata (`Academic Year · Current Term · Role Scope`) on the right.
  3. **Dynamic Browser Tab Title Synchronization**:
     - Switching to any view immediately updates `document.title` (e.g., `Teachers Duty Roster — ACCRA ACADEMY | SchoolSphere`).
- **Visual Identity & Theme**:
  - *Aesthetic Direction*: Clean institutional editorial header with subtle 1px border (`border-[#bac4c6]/80`), deep teal typography (`#1c4a59`), warm gold accents (`#faae57`), and zero-pill unboxed metadata separated by middots (`·`).

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Centralized View Metadata Registry with Role Awareness**
  - *Chosen Approach*: Define a structured `VIEW_METADATA` registry mapping every `View` key to its `title`, `shortTitle`, `category`, `subtitle`, and optional role-specific overrides (such as `teacher`, `student`, or `parent` variations).
  - *Why*: Guarantees that adding or switching to any view automatically renders the exact same authoritative page name in the top bar, the page content header, print headers, and the browser tab.

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

- **Architecture & Component Diagram**:
```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    VIEW_METADATA Registry (All 19 Views)                    │
│  • Maps view ID + userRole -> { title, shortTitle, category, subtitle }     │
└───────────────┬─────────────────────────────┬───────────────────────────────┘
                │                             │
                ▼                             ▼
┌───────────────────────────────┐ ┌───────────────────────────────────────────┐
│   Top Navigation Header Bar   │ │      Main Viewport PageHeaderBanner       │
│  • School Name / Page Title   │ │  • Clickable Breadcrumb (Dashboard › ...) │
│  • Visible on Mobile & Desktop│ │  • Page Title (h1) + Module Subtitle      │
│  • Updates document.title     │ │  • Active Academic Year · Current Term    │
└───────────────────────────────┘ └───────────────────────────────────────────┘
```

- **Complete Page Name Mapping**:
  - `dashboard` → **Executive Campus Dashboard** (*Portal Overview & Analytics*)
  - `students` → **Student Directory & Admissions** (*Enrollment & Student Records*)
  - `academic` → **Academic & Staff Management** (*Teachers, Classes, Subjects & Duty Roster*)
  - `timetable` → **Master School Timetable** (*Class & Teacher Period Scheduling*)
  - `duty_roster` → **Teachers Duty Roster & Logbook** (*Weekly Staff Supervision & Occurrence Book*)
  - `lesson_notes` → **NaCCA Lesson Notes & Vetting** (*Weekly Teacher Lesson Plans & HOD Endorsement*)
  - `attendance` → **Daily Attendance Terminal** (*Student Roll Call & Punctuality Tracking*)
  - `results` → **Academic Results Terminal** (*Continuous Assessment & Examination Grading*)
  - `exam_analysis` → **BECE & WASSCE Exam Analysis** (*External Examination Aggregates & Subject Performance*)
  - `reports` → **Terminal Reports & Broadsheets** (*Official Student Report Cards & Class Broadsheets*)
  - `fees` → **Fees, Billing & Payments Ledger** (*Student Tuition, Invoices & Receipting*)
  - `payroll` → **Staff Payroll & Compensation** (*Monthly Salary Run, SSNIT, GRA PAYE & Payslips*)
  - `siren` → **Automated Campus Siren Console** (*Bell Schedules, Emergency Alerts & PA Broadcasts*)
  - `evoting` → **Student E-Voting Portal** (*Electoral Polls, Candidates & Live Balloting*)
  - `inventory` → **Campus Inventory & Expense Registry** (*Storehouse Stock, Issuance & School Expenditure*)
  - `users` → **User Accounts & Role Permissions** (*Staff, Student & Parent Portal Access Control*)
  - `settings` → **School Profile & System Settings** (*Institutional Branding, Grading & Term Configuration*)
  - `creator` → **Creator Command Console** (*Platform Licensing, CRM, Support & Telemetry*)
  - `school_management` → **Multi-Tenant Schools Registry** (*Client School Provisioning & License Control*)
