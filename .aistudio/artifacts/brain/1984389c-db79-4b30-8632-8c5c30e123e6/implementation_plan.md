# Adaptive Screen & True A4 Sheet Report Card Optimization

Optimize the Student Terminal Report Card (in both Batch Reports and Individual Terminal Report views) so it is crystal-clear and responsive across mobile, tablet, and desktop screens while rendering as a pixel-accurate single-page A4 sheet (`210mm × 297mm`) when printed or exported to PDF from any device.

## User Review & Critical Decisions

> [!IMPORTANT]
> - **Dual-Posture Layout (Fluid Screen + True A4 Print/PDF)**: On mobile and compact screens, the report card adapts fluidly so text and tables remain large and readable without pinching or zooming. On large screens, print dialogs, and PDF exports, the report card locks to exact A4 sheet geometry (`210mm × 297mm`) with preserved multi-column grids.
> - **Device-Independent A4 PDF Generation**: Exporting a PDF from a mobile phone previously captured the narrow mobile layout and stretched it onto an A4 page. The PDF exporter will now normalize the cloned report card to standard A4 dimensions (`794px × 1123px` at 96 DPI) before rendering so PDF downloads look identical whether triggered on a phone or a desktop monitor.

## 1. Overview & Core Concept

- **What It Does**: Delivers a unified academic transcript component that automatically adapts its layout density and grid structure to the viewing medium—fluid and touch-friendly on small screens, structured A4 sheet preview on desktop, and strict 1-page-per-student A4 pagination in print and PDF output.
- **Target Audience / Persona**: School Administrators, Headmasters, Class Teachers, and Parents reviewing terminal reports on phones, tablets, laptops, or printing physical A4 transcripts.
- **Key Value**: Eliminates clipped signatures, broken print grids, distorted mobile PDF exports, and multi-page spillover during batch printing.

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Mobile & Tablet Viewing**: Users open Batch Reports or Individual Report on a phone or tablet; the header, student passport portrait, bio details, subject scores table, attendance, remarks, and signatures stack and scroll cleanly with high-contrast typography (`12px–14px`).
  2. **Desktop A4 Sheet Preview**: On desktop screens, each report card is framed in an A4-proportioned sheet container (`max-w-[210mm] min-h-[297mm]`) with an option to toggle between **Fit to Screen** and **A4 Sheet Preview** so staff can verify exact page fit before printing.
  3. **1-Page-Per-Student Print & Batch PDF**: Clicking **Print All Reports**, **Print Card**, **PDF**, or **Batch PDF** outputs each student's report card onto a single A4 portrait page with intact 2-column bio, 2-column attendance/remarks, and side-by-side signature blocks.
- **Visual Identity & Theme**:
  - *Aesthetic Direction*: Authoritative institutional academic transcript with crisp double-bordered framing and tabular numeric precision.
  - *Color Palette & Mood*: Clean white paper surface (`#FFFFFF`), deep indigo institutional framing (`#312E81`), high-contrast slate ink (`#0F172A` primary text, `#475569` secondary labels), and semantic accents for fee balances (`#BE123C`).
  - *Typography & Hierarchy*: Bold uppercase institutional headers, `tabular-nums` monospace alignment (`font-mono`) for all scores, totals, averages, GPAs, and admission numbers, and minimum `11px–13px` print/screen body copy.
  - *Component Styling & Layout*: Outer double border with balanced internal padding (`16px` on mobile, `12mm` on A4 sheet/print) and compact table row heights (`32px–36px`) so up to 12–14 subjects fit comfortably on a single A4 sheet without pushing signatures off the page.

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Preserve CSS Grid Inside Report Cards During Print**
  - *Chosen Approach*: Scope the global print rule that collapses `.grid` into `display: block` so it excludes `.ReportCard` and its internal sections.
  - *Why*: Collapsing grids into vertical blocks with `1.5rem` margins during print caused the student bio, attendance, remarks, and signatures to stack vertically and overflow the bottom of the 297mm A4 sheet.
  - *Alternatives Considered*: Using HTML tables for all layout sections, which reduces responsive flexibility on mobile screens.
- **Decision 2: Suppress Redundant Page Banner When Printing Report Cards**
  - *Chosen Approach*: Hide the generic top print letterhead when `batch-reports` or `terminal-report` is active, since each `ReportCard` already contains the official school crest, name, address, academic year, and term header.
  - *Why*: An extra letterhead above the first report card pushed the card down by ~35mm, causing every A4 page break to misalign.
- **Decision 3: Offscreen A4 Normalization for PDF Exports**
  - *Chosen Approach*: Force the cloned report card DOM tree inside the PDF generator to `794px` width (`210mm`) and desktop/A4 grid rules prior to canvas rasterization, preserving aspect ratio on A4 PDF pages.
  - *Why*: Ensures clicking "Batch PDF" or "PDF" on a 375px mobile screen produces an authentic A4 document rather than a stretched mobile screenshot.

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

- **Architecture & Component Diagram**:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Report Terminal Workspace                        │
│  ┌───────────────────────────┐       ┌───────────────────────────────┐  │
│  │  Batch Reports View       │       │  Individual Report View       │  │
│  │  (#batch-reports-content) │       │  (Student Selector + Preview) │  │
│  └─────────────┬─────────────┘       └───────────────┬───────────────┘  │
│                └──────────────────┬──────────────────┘                  │
│                                   ▼                                     │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                     Adaptive ReportCard Surface                   │  │
│  │  • Mobile (<640px): Fluid padding, stacked bio, scrollable table  │  │
│  │  • Desktop (≥768px): A4 Sheet proportion (210mm × 297mm preview)  │  │
│  │  • Print (@media print): Exact 210mm × 297mm, preserved 2-col     │  │
│  │    grids, compact row density, strict 1-page break per student    │  │
│  └────────────────┬──────────────────────────────────┬───────────────┘  │
│                   ▼                                  ▼                  │
│  ┌────────────────────────────────┐ ┌────────────────────────────────┐  │
│  │   Browser Print Engine (A4)    │ │   PDF Rasterizer (jsPDF A4)    │  │
│  │  • @page { size: A4 portrait } │ │  • Clones node at 794px×1123px │  │
│  │  • Preserves ReportCard grids  │ │  • Forces A4 multi-column grid │  │
│  │  • Hides duplicate letterhead  │ │  • Fits 210mm×297mm without    │  │
│  │  • Page-break after each card  │ │    aspect-ratio distortion     │  │
│  └────────────────────────────────┘ └────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

- **Interactive Component & State Mapping**:
  - **View Mode Toggle (Batch & Individual Reports)**: Allows users to switch between *Responsive Screen Fit* and *A4 Sheet Preview* on screen, while print and PDF actions always enforce A4 geometry.
  - **Print Handler (`triggerPrint`)**: Applies `printing-in-progress` state, hides non-report chrome and duplicate headers, and formats every `.ReportCard` to fit one A4 portrait sheet.
  - **Single & Batch PDF Handlers (`exportToPDF` / `exportBatchToPDF`)**: Clones each `report-<studentId>` container, normalizes its width and internal `.ReportCard` layout to A4 dimensions, and writes crisp, proportional A4 pages into the generated PDF file.
