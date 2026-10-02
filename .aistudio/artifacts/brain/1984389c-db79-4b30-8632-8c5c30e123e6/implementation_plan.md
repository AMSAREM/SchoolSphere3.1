# Role-Aware Quick Actions Across All Portals & Creator Console

Deliver tailored, role-specific Quick Actions across every user portal—including the Creator Command Console, School Administration, HOD, Teacher, Bursar, Student, and Parent workspaces—spanning both the desktop Dashboard Quick Actions card and the mobile Quick Actions drawer.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following architectural and UX decisions were confirmed during Phase 1 clarification and govern this implementation:

- **Confirmed Decision 1 — Target Surfaces**: Update all three Quick Actions surfaces—the Mobile Bottom Navigation Quick Actions Drawer, the Desktop/Tablet Dashboard Quick Actions Card, and the Creator Command Console (both its overview dashboard card and mobile quick-action bar).
- **Confirmed Decision 2 — Portal Coverage**: Provide dedicated, role-appropriate action sets for all seven user portals: **Creator (`creator` / `super_admin` in Creator Console)**, **Admin / Headteacher (`admin`, `super_admin`, `headteacher`)**, **HOD (`hod`)**, **Teacher (`teacher`)**, **Bursar / Accountant (`bursar`, `accountant`)**, **Student (`student`)**, and **Parent (`parent`)**.
- **Confirmed Decision 3 — Creator Console Shortcuts**: Surface four high-frequency command shortcuts in the Creator Console Quick Actions: **Generate License Key**, **Provision School Tenant**, **Run Diagnostics Suite**, and **Live Telemetry Sync**.

---

## 1. Overview & Core Concept

- **What It Does**: Replaces static, one-size-fits-all shortcuts with a unified role-aware Quick Actions engine that adapts to the authenticated user's portal role and active workspace context.
- **Target Audience / Persona**:
  - **Platform Creators**: Need instant one-click access to license key generation, school tenant provisioning, automated diagnostics, and live telemetry synchronization.
  - **School Administrators & Headteachers**: Need immediate access to student registry management, fee collection oversight, terminal results verification, and school-wide circulars.
  - **Heads of Department (HODs)**: Need rapid navigation to lesson note vetting, departmental exam analysis, score entry, and class timetables.
  - **Teachers**: Need one-tap daily roll call (attendance), continuous assessment score entry, lesson note submission, and personal schedule reminders.
  - **Bursars & Accountants**: Need streamlined access to fee payment recording, expense & payroll ledgers, debtor SMS reminders, and inventory tracking.
  - **Students & Parents**: Need clear, accessible shortcuts to academic report cards, class schedules, fee statements/online payments (for parents), and campus e-voting/learning resources.
- **Key Value**: Eliminates irrelevant or unauthorized action buttons (such as showing "Take Attendance" or "Enter Scores" to students, parents, or bursars) and brings the same one-click productivity to the Creator Command Console and Student/Parent portals.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Mobile Quick Actions Drawer Flow**: Tapping the raised warm-amber `+` Floating Action Button in the mobile bottom navigation opens a refined bottom sheet displaying 4 role-matched action tiles with clear titles, concise subtitles, and semantic icon badges. Tapping any tile closes the drawer and navigates directly to the target module or triggers the corresponding modal/action.
  2. **Portal Dashboard Quick Actions Card Flow**: On the Institutional Overview dashboard, every role (now including Student and Parent portals alongside Admin, HOD, Teacher, and Bursar) sees a structured **Quick Actions** card in the right-hand column beside the primary analytics chart, offering 4 tailored shortcuts with subtle hover elevation and directional chevrons.
  3. **Creator Command Console Quick Actions Flow**: Inside the Creator Console (`Overview & Telemetry` and mobile navigation), a dedicated **Creator Quick Actions** panel and mobile drawer provide instant execution for **Generate License Key** (switches to License Generator & focuses the form), **Provision School Tenant** (opens the School Registry & Tenant Provisioning panel), **Run Diagnostics Suite** (navigates to the Full-Stack Diagnostics Runner), and **Live Telemetry Sync** (triggers an immediate real-time Supabase & server telemetry refresh with visual spinner feedback).
- **Visual Identity & Theme**:
  - *Aesthetic Direction*: High-craft SaaS workspace discipline with single-elevation cards, crisp 1px structural borders, and purposeful semantic accents.
  - *Color Palette & Mood*:
    - **School Portals**: Deep Teal (`#1c4a59`) primary authority surfaces, Warm Amber (`#faae57`) high-intent action highlights, Emerald (`#06d6a0`) nominal/attendance accents, and Soft Sage-Slate (`#f6f8f7` / `#bac4c6`) structural containers.
    - **Creator Console**: Slate-900 (`#0f172a`) and Indigo-600 (`#4f46e5`) command palette with Emerald (`#10b981`) live telemetry indicators and Amber (`#f59e0b`) provisioning accents.
  - *Typography & Hierarchy*: Crisp display and action labels (`font-bold tracking-tight`) paired with muted 10px–11px descriptive subtitles (`text-[#6a7f84]`) and `tabular-nums` for any counters or sync timestamps. All action labels enforce single-line truncation safety.
  - *Component Styling & Layout*:
    - **Mobile Drawer**: `rounded-3xl` floating sheet anchored safely above the bottom navigation bar (`pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))]`), featuring a 2×2 grid of tactile action cards (`min-h-[52px]`).
    - **Dashboard Card**: Single-elevation `rounded-2xl` container (`border border-[#bac4c6]/60 bg-white p-6`) with a 2-column or vertical stack of interactive action rows (`min-h-[48px]`) with icon badges and hover chevron transitions.
- **Interactive Feedback & Motion**:
  - Smooth 150ms–200ms spring/compositor transitions (`opacity`, `transform`) on drawer open/close and button press (`active:scale-[0.98]`).
  - Live loading spinner on the **Live Telemetry Sync** action while telemetry is actively refreshing, followed by toast confirmation.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1 — Centralized Role-to-Actions Resolver**:
  - *Chosen Approach*: Define a single, strongly typed Quick Actions resolver that maps the current user role (`creator`, `super_admin`, `admin`, `headteacher`, `hod`, `teacher`, `bursar`, `accountant`, `student`, `parent`) and portal mode (Standard Portal vs. Creator Console) to its 4 canonical Quick Actions.
  - *Why*: Guarantees 100% consistency between the desktop Dashboard Quick Actions card and the Mobile Bottom Navigation Quick Actions drawer so a user never sees mismatched shortcuts across devices.
  - *Alternatives Considered*: Hardcoding separate `if/else` role checks inside individual components, which previously caused drift and left Student, Parent, HOD, and Creator portals without relevant shortcuts.
- **Decision 2 — Enabling Dashboard Quick Actions for Student & Parent Portals**:
  - *Chosen Approach*: Include the right-hand Quick Actions column on the Dashboard for `student` and `parent` roles (which previously hid the column entirely), pairing the 2-column performance chart with a 1-column tailored Quick Actions & Summary card.
  - *Why*: Gives students and parents immediate 1-click access to their most important tasks (Report Cards, Class Schedule, Fee Statements/Payment, and Campus E-Voting) right from the home screen.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

- **Architecture & Component Diagram**:

```
┌───────────────────────────────────────────────────────────────────────────┐
│                    Role-Aware Quick Actions Resolver                      │
│  Input: User Role (creator | admin | hod | teacher | bursar | student |   │
│         parent) + Active Workspace Context (Portal vs Creator Console)    │
└───────────────────┬───────────────────┬───────────────────┬───────────────┘
                    │                   │                   │
                    ▼                   ▼                   ▼
┌───────────────────────────┐ ┌───────────────────┐ ┌───────────────────────┐
│  Mobile Quick Menu Drawer │ │ Dashboard Quick   │ │ Creator Console       │
│  (MobileBottomNav)        │ │ Actions Card      │ │ Quick Actions Bar &   │
│                           │ │ (Dashboard)       │ │ Mobile Nav            │
│ • 2x2 Tactile Action Grid │ │ • Role-Tailored   │ │ • Generate License    │
│ • Safe-Area Dock Stack    │ │   Action Rows     │ │ • Provision Tenant    │
│ • Portal & Creator Modes  │ │ • Enabled for All │ │ • Run Diagnostics     │
│                           │ │   7 User Portals  │ │ • Live Telemetry Sync │
└───────────────────────────┘ └───────────────────┘ └───────────────────────┘
```

- **Role-Specific Action Matrix**:

| Portal / Role | Action 1 | Action 2 | Action 3 | Action 4 |
| :--- | :--- | :--- | :--- | :--- |
| **Creator Console** (`creator` / `super_admin`) | **Generate License Key** (`generator` panel) | **Provision School Tenant** (`school_management` panel) | **Run Diagnostics Suite** (`frontend_test_runner` panel) | **Live Telemetry Sync** (Triggers `onRefreshTelemetry`) |
| **Admin / Headteacher** (`admin`, `headteacher`, `super_admin`) | **Manage Students** (`students` view) | **Take Attendance** (`attendance` view) | **Record Fee Payment** (`fees` view) | **Enter Exam Results** (`results` view) |
| **HOD** (`hod`) | **Vet Lesson Notes** (`lesson_notes` view) | **Enter Exam Scores** (`results` view) | **Exam Analysis** (`exam_analysis` view) | **Take Attendance** (`attendance` view) |
| **Teacher** (`teacher`) | **Take Attendance** (`attendance` view) | **Enter Exam Scores** (`results` view) | **Lesson Notes** (`lesson_notes` view) | **Set Reminder** (Quick Reminder / `timetable` view) |
| **Bursar / Accountant** (`bursar`, `accountant`) | **Record Fee Payment** (`fees` view) | **Payroll & Expenses** (`payroll` view) | **Fee Reminder SMS** (`sms` view) | **Store & Inventory** (`inventory` view) |
| **Student** (`student`) | **My Report Card** (`results` view) | **Class Timetable** (`timetable` view) | **Attendance Record** (`attendance` view) | **Student E-Voting** (`evoting` view) |
| **Parent** (`parent`) | **Pay / View Fees** (`fees` view) | **Ward Report Card** (`results` view) | **Ward Attendance** (`attendance` view) | **Class Schedule** (`timetable` view) |

- **Interactive Component & State Mapping**:
  - **Mobile Drawer (`MobileBottomNav`)**: Reads the active user role and optional `creatorMode` callbacks (`onCreatorNavigate`, `onRefreshTelemetry`, `isRefreshingTelemetry`). Clicking an action closes the drawer (`setShowQuickMenu(false)`) and invokes the corresponding view navigation, modal trigger (`onOpenQuickReminder`), or Creator Console action.
  - **Dashboard Card (`Dashboard`)**: Renders the resolved role action list for all portals (including `student` and `parent` roles) with role-specific badges, labels, descriptions, and click handlers bound to `onViewChange`.
  - **Creator Console (`CreatorHub` & `CoreSuite`)**: Renders a prominent **Creator Quick Actions** bar at the top of the `Overview & Telemetry` suite and wires `MobileBottomNav` for mobile Creator viewports so all 4 Creator shortcuts work seamlessly on both desktop and mobile.
