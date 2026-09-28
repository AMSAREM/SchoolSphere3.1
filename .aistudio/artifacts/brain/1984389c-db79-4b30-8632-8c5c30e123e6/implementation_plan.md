# True Vector A4 PDF Generation for Report Cards & Broadsheets

Replace the blurry `html2canvas` screenshot-based PDF export with a **True Vector A4 PDF Engine** powered directly by `jsPDF` vector drawing primitives so exported report cards, batch class reports, and broadsheets contain razor-sharp, selectable vector text and crisp geometric borders at any zoom level.

## User Review & Critical Decisions

> [!IMPORTANT]
> - **Why the Previous PDF Looked Like a Blurry Screenshot**: Previously, clicking **PDF** or **Batch PDF** used `html2canvas` to take a bitmap screenshot of the webpage and stretch that image across an A4 page. In addition, Tailwind v4 `oklch()` colors were stripped during cloning, degrading contrast and borders.
> - **True Vector PDF Architecture**: Report cards (both Individual and Batch) and Examination Broadsheets will now be drawn directly onto the A4 PDF canvas (`210mm × 297mm`) using native `jsPDF` vector text, vector lines, and vector rectangles. Text will be 100% selectable, searchable, and infinitely sharp at 400%+ zoom.

## 1. Overview & Core Concept

- **What It Does**: Generates authentic, print-shop-grade vector A4 PDF documents for Individual Student Report Cards, Batch Class Report Cards, Examination Broadsheets, and Fee Arrears Statements—eliminating raster screenshots completely for academic reports.
- **Target Audience / Persona**: School Administrators, Headmasters, Class Teachers, Accountants, and Parents downloading, printing, or sharing official PDF transcripts on mobile or desktop.
- **Key Value**: Produces lightweight, instant, crystal-clear PDFs with selectable text, exact `210mm × 297mm` A4 margins, and zero pixelation or aspect-ratio stretching.

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Individual Report Card Vector PDF**: Clicking **PDF** in the Individual Report view generates a single-page A4 vector PDF (`210mm × 297mm`) matching the official `ReportCard` design (double-border indigo frame, school crest & header, student portrait & 2-column bio grid, bordered 6-column subject table with aggregate/GPA footer, 2-column attendance/next-term & remarks boxes, and signature blocks).
  2. **Batch Class Reports Vector PDF**: Clicking **Batch PDF** in Batch Reports generates a multi-page A4 vector PDF where each student in the class occupies one crisp vector A4 page—completing almost instantaneously without browser lag.
  3. **Broadsheet & Arrears Statement Vector PDF**: Clicking **PDF** on the Examination Broadsheet or Fee Arrears Reminder generates a clean vector table document.
- **Visual Identity & Theme**:
  - *Aesthetic Direction*: Official institutional transcript rendered with sharp vector rules (`0.25mm–0.6mm` strokes), deep indigo headers (`#1E1B4B`), slate typography (`#0F172A` / `#475569`), and high-contrast tabular numerals.
  - *Typography & Hierarchy*: Native PDF vector fonts (`Helvetica` / `Courier` bold & regular for tabular scores and admission numbers) scaled to exact millimeter coordinates so every label, score, grade, and remark is crisp on both screen PDF viewers and physical printers.

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Native Vector `jsPDF` Drawing Instead of `html2canvas` Rasterization for Reports**
  - *Chosen Approach*: Build dedicated vector PDF builders (`exportReportCardVectorPDF`, `exportBatchReportCardsVectorPDF`, `exportBroadsheetVectorPDF`, and `exportFeeBillVectorPDF`) that plot text, tables, and borders directly in millimeter coordinates on A4 pages.
  - *Why*: Vector PDFs never blur when zoomed or printed, support text selection/copying, never stretch on mobile viewports, and generate 10–20× faster for whole-class batches.
  - *Alternatives Considered*: Increasing `html2canvas` scale factor, which still produces huge bitmap files (15–40 MB for a class) that look like raster images and suffer from browser CSS cloning glitches.
- **Decision 2: Exact `oklch` Color Normalization & 384-DPI Fallback for Generic DOM Captures**
  - *Chosen Approach*: For any remaining DOM-capture PDF buttons outside Report Terminal (such as custom modal receipts), convert modern `oklch`/`oklab` CSS colors to standard `#RRGGBB` hex via a 1×1 canvas color resolver instead of resetting them to `inherit`, and capture at `scale: 4` without aspect-ratio distortion.
  - *Why*: Ensures every PDF export across the entire platform is sharp and preserves all colors and borders.

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

- **Architecture & Component Diagram**:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Report Terminal Actions                         │
│  • Individual Report ("PDF")      • Batch Reports ("Batch PDF")         │
│  • Broadsheet ("PDF")             • Fee Arrears Notice ("Save PDF")     │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                   True Vector A4 PDF Engine (jsPDF)                     │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │ A4 Page Vector Composer (210mm × 297mm, Portrait)                 │  │
│  │  1. Outer & Inner Double Frame (10mm margin, #1E1B4B stroke)      │  │
│  │  2. Vector Institutional Header + Embedded Crest Image            │  │
│  │  3. Student Passport Image / Vector Box + 2-Col Bio Metadata      │  │
│  │  4. Vector Academic Table (6 cols, dynamic row height, #1E1B4B    │  │
│  │     header fill, tabular score alignment, Aggregate/GPA footer)   │  │
│  │  5. 2-Col Attendance/Next Term & Teacher/Headmaster Remarks       │  │
│  │  6. Dual Signature & Stamp Blocks + Verified AIMS Footer          │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

- **Interactive Component & State Mapping**:
  - **Single Report Card Export**: Passes `selectedStudent`, filtered `results`, `termReport`, `schoolProfile`, and `academicConfig` into `exportReportCardVectorPDF` to download a vector A4 PDF.
  - **Batch Class Export**: Passes `classStudents`, `classResults`, `termReports`, `studentRankings`, `schoolProfile`, and `academicConfig` into `exportBatchReportCardsVectorPDF` to render one vector A4 page per student in a single PDF file.
  - **Broadsheet & Arrears Export**: Passes structured class summary / debtor data into vector PDF generators for crisp tabular output.
