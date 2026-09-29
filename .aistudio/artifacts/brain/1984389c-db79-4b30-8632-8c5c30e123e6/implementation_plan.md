# Compact Mobile & Tablet KPI Stat Cards

Reduce the visual footprint and grid spacing of the selected Institutional Overview KPI stat cards on mobile and tablet viewports so all four metrics fit into two compact rows on mobile and a single row on tablet without sacrificing desktop readability.

## User Review & Critical Decisions

> [!IMPORTANT]
> The layout and interior sizing rules below incorporate your confirmed preferences from the clarification step.

- **Confirmed Decision 1 (Responsive Grid Columns)**: Arrange the 4 KPI stat cards in **2 columns per row on mobile** (2 rows total) and **4 columns per row on tablet and desktop** (1 row total).
- **Confirmed Decision 2 (Compact Card Interior)**: Reduce interior card padding, shrink the icon badge container and icon dimensions, tighten vertical spacing, and scale down label and metric font sizes on mobile and tablet while preserving full desktop proportions on large screens.

## 1. Overview & Core Concept

- **What It Does**: Streamlines the Institutional Overview KPI stats section so mobile and tablet users can scan all four institutional metrics at a glance without excessive vertical scrolling.
- **Target Audience / Persona**: School administrators, headteachers, accountants, teachers, parents, and students accessing the dashboard on phones and tablets.
- **Key Value**: Cuts vertical screen height consumed by the KPI summary grid by more than half on mobile (from 4 stacked full-width cards to a compact 2×2 grid) and fits all 4 cards onto a single horizontal line on tablet viewports.

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. On **mobile screens (`< 768px`)**, the user sees a 2-column grid (2 cards per line, 2 lines total) with compact padding, a smaller icon container, single-line truncated labels, and tabular monospace figures.
  2. On **tablet screens (`768px – 1023px`)**, all 4 KPI cards align on a **single line** (`4 columns`) with compact padding and balanced typography so values and labels fit cleanly without awkward wrapping.
  3. On **desktop screens (`≥ 1024px`)**, the cards expand to their spacious desktop padding and typography while remaining in a single 4-column row.
  4. Tapping or clicking any KPI card navigates immediately to its linked module view.
- **Visual Identity & Theme**:
  - *Aesthetic Direction*: High-density, scannable institutional SaaS dashboard with clean single-elevation card surfaces.
  - *Color Palette & Mood*: Crisp white card surfaces (`#FFFFFF`) over a subtle neutral canvas (`#F6F8F7`), accented with deep institutional teal (`#1C4A59`), warm amber (`#FAAE57`), and semantic status emerald (`#06D6A0`).
  - *Typography & Hierarchy*: Tabular monospace numerals (`font-mono tabular-nums`) scaled to `text-base` / `text-lg` on mobile and tablet (`lg:text-2xl` on desktop), paired with compact `11px`–`12px` single-line truncated labels (`truncate`).
  - *Component Styling & Layout*: Responsive CSS Grid (`grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-3 lg:gap-5`) with reduced mobile/tablet card padding (`p-3 sm:p-3.5 lg:p-5`), compact icon badges (`p-1.5 sm:p-2 lg:p-2.5`), and tighter header-to-metric spacing (`mb-1.5 sm:mb-2 lg:mb-3.5`).
- **Interactive Feedback & Motion**: Smooth press scaling (`active:scale-[0.99]`), subtle icon hover lift (`group-hover:scale-105`), and instant view transitions when a card is activated.

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Responsive `2 → 4` Column Grid (`grid-cols-2 md:grid-cols-4`)**
  - *Chosen Approach*: Use a 2-column layout at the base mobile breakpoint and transition to a 4-column single-row layout starting at the tablet (`md`) breakpoint.
  - *Why*: Directly fulfills the requirement to fit the cards into two lines on mobile and one line on tablet, eliminating the tall 4-card vertical stack on phones and 2-row split on tablets.
  - *Alternatives Considered*: Keeping 1 column on mobile or 2 columns on tablet was rejected because it consumes too much vertical viewport space above the analytics chart.
- **Decision 2: Tiered Padding & Typography Scaling**
  - *Chosen Approach*: Apply compact padding (`p-3 sm:p-3.5`), smaller icons (`w-4 h-4`), and compact metric text (`text-base sm:text-lg`) on mobile and tablet, restoring `lg:p-5`, `lg:w-5 lg:h-5`, and `lg:text-2xl` at the desktop breakpoint.
  - *Why*: Prevents horizontal text overflow when 2 cards share a narrow mobile row or 4 cards share a tablet row.

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

- **Architecture & Component Diagram**:
```
┌─────────────────────────────────────────────────────────────────────────┐
│                     Institutional Overview Dashboard                    │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│          Selected Element: KPI Stats Grid (div:nth-of-type(4))          │
│     • Mobile (<768px): 2 Columns × 2 Rows (gap-2.5, compact cards)      │
│     • Tablet (768px–1023px): 4 Columns × 1 Row (gap-3, compact cards)   │
│     • Desktop (≥1024px): 4 Columns × 1 Row (gap-5, full-size cards)     │
└─────────┬──────────────────┬──────────────────┬──────────────────┬──────┘
          │                  │                  │                  │
          ▼                  ▼                  ▼                  ▼
   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
   │ KPI Card 1  │    │ KPI Card 2  │    │ KPI Card 3  │    │ KPI Card 4  │
   │ • Icon/Stat │    │ • Icon/Stat │    │ • Icon/Stat │    │ • Icon/Stat │
   │ • 1-Line Lbl│    │ • 1-Line Lbl│    │ • 1-Line Lbl│    │ • 1-Line Lbl│
   │ • Tabular # │    │ • Tabular # │    │ • Tabular # │    │ • Tabular # │
   └──────┬──────┘    └──────┬──────┘    └──────┬──────┘    └──────┬──────┘
          └──────────────────┴────────┬─────────┴──────────────────┘
                                      │ onClick(stat.view)
                                      ▼
                     ┌─────────────────────────────────┐
                     │   Active Module View Navigation │
                     └─────────────────────────────────┘
```
- **Data Model & State**: Uses the existing role-aware `stats` array (label, formatted value, icon, accent border, and target `view`) computed from live institutional state.
- **Interactive Component & State Mapping**: Clicking any card triggers `onViewChange(stat.view)` to navigate to the corresponding module (Students, Attendance, Results, Fees, or Academic Management), while `truncate` and `tabular-nums` guarantee clean alignment across all screen widths.
