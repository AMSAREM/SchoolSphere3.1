# Implementation Plan: Responsive & Legible Batch Reports (`#batch-reports-content`)

## 1. Objective
Optimize the selected `#batch-reports-content` container in `src/components/ReportTerminal.tsx` and the `ReportCard` component in `src/components/ReportCard.tsx` so that batch and terminal student report cards are crisp, high-contrast, and fully legible across all screen sizes (mobile, tablet, desktop, and A4 print/PDF).

## 2. Targeted UI & Styling Improvements (Focus Mode)

### A. `#batch-reports-content` & Batch Toolbar (`src/components/ReportTerminal.tsx`)
- **Full-Width Responsive Card Wrappers**: Update `#batch-reports-content` (`w-full space-y-6 sm:space-y-10 flex flex-col items-center`) and each student report wrapper (`div[id^="report-"]` with `w-full max-w-4xl mx-auto`) so cards scale smoothly to the available viewport width without horizontal clipping or shrink-wrapping.
- **Responsive Filter & Action Bar**: Ensure the Batch Reports top control bar stacks cleanly on mobile screens with full-width selects and action buttons while staying inline on desktop.

### B. `ReportCard` All-Screen Legibility & Responsive Layout (`src/components/ReportCard.tsx`)
- **Adaptive Padding & Border Frame**: Replace fixed millimeter padding (`p-[10mm] sm:p-[15mm]`) with responsive screen padding (`p-4 sm:p-6 md:p-8 lg:p-10 print:p-[10mm]`) and responsive border thickness (`border-4 sm:border-[8px] md:border-[10px] border-double border-indigo-900`) so mobile viewports retain generous reading space.
- **Readable Typography & High Contrast**:
  - Upgrade tiny micro-text (`text-[6px]`–`text-[10px]`) to clear, legible responsive sizes (`text-xs sm:text-sm` for body/table data, `text-[11px] sm:text-xs` for labels/metadata, and `text-lg sm:text-2xl md:text-3xl` for the school header).
  - Darken low-contrast muted labels (`text-slate-300`/`text-slate-400`) to `text-slate-600`/`text-slate-700` for crisp readability on all displays.
- **Responsive Student Bio & Portrait Grid**:
  - Stack the student passport portrait and bio details cleanly on mobile (`grid-cols-1 sm:grid-cols-12`) and use a responsive 1-to-2 column grid (`grid-cols-1 md:grid-cols-2`) for student metadata rows (`Full Name`, `Admission No`, `Class`, `Gender`, `House/Dept`, `Position`) so values never collide or truncate.
- **Scrollable & Legible Academic Grades Table**:
  - Wrap the grades table in an `overflow-x-auto` container with minimum column widths so all 6 columns (`Subject`, `Class (30%)`, `Exam (70%)`, `Total (100%)`, `Grade`, `Remarks`) remain clearly aligned and readable on compact screens without clipping.
- **Responsive Attendance, Remarks & Signatures**:
  - Update the Attendance/Next Term & Remarks section (`grid-cols-1 md:grid-cols-2 print:grid-cols-2`) and Signature section (`grid-cols-1 sm:grid-cols-2 print:grid-cols-2 gap-6 sm:gap-12`) to stack cleanly on mobile while preserving the side-by-side layout on desktop and print.
