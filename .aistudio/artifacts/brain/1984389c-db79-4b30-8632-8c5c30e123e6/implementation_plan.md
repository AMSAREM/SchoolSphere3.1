# Unified Assessments & Examination System (Homework, Classwork, Class Tests & Exams)

A full-lifecycle academic assessment suite empowering teachers to author curriculum-aligned homework, classwork, class tests, and term examinations with digital student submissions, multi-criteria rubric evaluation, and automated continuous assessment (SBA) aggregation.

***

## User Review & Critical Decisions

> [!IMPORTANT]
> The architectural directions below were confirmed in Phase 1 clarification:
> - **Unified Assessments Architecture**: A consolidated portal module with tabbed access across **Homework**, **Classwork**, **Class Tests**, and **Examinations**, preventing navigation clutter while maintaining role-specific teacher and student views.
> - **Digital Submission & Rubric Grading**: Students submit deliverables digitally (typed text and file attachments), while teachers evaluate submissions against configurable, multi-criteria grading rubrics (e.g. Concept Mastery, Methodology, Presentation, Completeness).
> - **Continuous Assessment (SBA) Integration**: Graded tasks automatically compute scaled scores and sync into the student's terminal continuous assessment (SBA) records and term examination marks in `ResultsTerminal`, ensuring seamless terminal report card compilation without double entry.

***

## 1. Overview & Core Concept

### What It Does
The Unified Assessments system connects teachers and students through an end-to-end coursework and evaluation workflow:
- **Teacher Workspace**: Teachers design and publish assessments categorised as Homework, Classwork, Class Test, or Examination. Each assessment specifies class target, subject, due dates, instructions, reference attachments, max score, SBA category weight, and custom scoring rubrics. Teachers track submission status, grade student work with rubric sliders/scores, attach feedback notes, and publish grades.
- **Student Portal**: Students view their pending, submitted, and graded tasks with countdown timers, clear rubric expectations, and download links for teacher materials. They can compose answers, attach work files (documents/images/spreadsheets), submit before deadlines, and review detailed rubric scores and teacher remarks once returned.
- **SBA & Examination Terminal Synchronization**: Graded homework, classwork, and class tests aggregate into the terminal Continuous Assessment (CA 30% / 50% scale based on school policy), while Examination scores feed directly into the terminal 70% / 50% exam score field in `db.results` and backend endpoints.

### Target Audience & Personas
- **Teachers & Subject Leads**: Need an intuitive dashboard to create exercises, review submissions by class list, apply fair criteria-based grading, and eliminate manual recalculation into terminal marksheets.
- **Students**: Need a transparent hub to monitor upcoming assignments, know exact grading criteria in advance, submit their homework/classwork seamlessly, and track their academic growth.
- **Headteachers & Academic Admins**: Gain complete institutional oversight of assessment velocity, homework frequency across departments, grading compliance, and term examination preparedness.

### Key Value
- Replaces disconnected paper handouts and manual ledger calculations with an integrated digital workflow.
- Guarantees alignment between daily formative classroom tasks and terminal summative reporting.

***

## 2. User Experience & Visual Design

### Key User Flows

#### A. Teacher Flow: Authoring & Rubric Setup
1. Teacher selects the **Assessments** module from the portal navigation.
2. Selects the target category tab: `Homework`, `Classwork`, `Class Tests`, or `Examinations`.
3. Clicks **+ New Assessment**, selects Class (e.g. *JHS 2* or *Basic 6*), Subject (e.g. *Integrated Science*), Academic Year & Term, Due Date/Exam Time, and Maximum Score.
4. Defines or selects a predefined **Grading Rubric** (e.g., *Knowledge & Understanding [40%]*, *Method & Solution [40%]*, *Presentation & Neatness [20%]*).
5. Adds attachments or instructional prompts and clicks **Publish to Class**.

#### B. Student Flow: Submission & Rubric Review
1. Student logs in and navigates to **My Assessments**.
2. Sees cards for assigned work grouped by status: `To Do` (with urgent deadline badges), `Submitted` (awaiting grading), and `Graded` (with scores).
3. Clicks on an assignment to view instructions, teacher attachments, and the grading rubric criteria.
4. Composes an answer in the editor, attaches response files (PDF, image, doc), and clicks **Turn In Assessment**.
5. Once graded, the student receives an instant breakdown showing earned points per rubric criterion, teacher comments, and letter grade.

#### C. Teacher Flow: Grading & Terminal SBA Sync
1. Teacher opens the assessment to view the **Class Submission Grid** (submitted, late, missing, graded).
2. Clicks on a student submission to view submitted text and download attachments alongside the rubric evaluator.
3. Scores each rubric criterion (with automatic total calculation), writes personal feedback remarks, and clicks **Submit Grade & Return**.
4. Clicks **Sync to Terminal SBA** to aggregate average homework/classwork/test scores into the student's CA marks in `db.results` and backend tables with single-click confidence.

### Visual Identity & Theme
- **Aesthetic Direction**: High-trust academic editorial UI with crisp typography, purposeful whitespace, and zero generic aesthetic clutter.
- **Color Mood**: Slate-900 typography, crisp neutral backgrounds (`bg-slate-50` / `bg-white`), deep emerald accent for published assessments and successful submissions, warm amber for approaching deadlines, and indigo for examination terminals.
- **Typography**: Clear hierarchy pairing `Plus Jakarta Sans` for labels and headings with `font-mono tabular-nums` for grades, scores, percentages, and countdown clocks.
- **Spatial Composition**: Dual-pane grading view for teachers (student submission preview on left, rubric evaluator deck on right). Responsive card and table layouts optimized for desktop grading and mobile student viewing.

***

## 3. Key Product Decisions & Trade-Offs

### Decision 1: Unified Module with Type Tabs vs. Dispersed Modules
- **Chosen Approach**: A single top-level **Assessments** module containing unified tabs for `Homework`, `Classwork`, `Class Tests`, and `Examinations`.
- **Why**: Keeps navigation clean and intuitive while providing a consistent authoring and submission interface across all four assessment modalities.
- **Alternatives Considered**: Four distinct sidebar items would overwhelm navigation bars and create redundant code.

### Decision 2: Rubric-Based Scoring with Continuous Assessment (SBA) Aggregation
- **Chosen Approach**: Every assessment supports customizable rubric criteria that tally to a final score. When teachers approve grades, an automated aggregator scales cumulative Homework, Classwork, and Class Tests into the Continuous Assessment (CA) columns of `ResultsTerminal`, and Examination scores into the Exam column.
- **Why**: Eliminates manual recalculation and marks entry errors for terminal reports while giving students transparent learning feedback.
- **Alternatives Considered**: Simple number-only scoring lacks pedagogical value; disconnected scoring would force teachers to re-type grades into the results terminal.

### Decision 3: Local Dexie Persistence + Backend Sync
- **Chosen Approach**: Store assessments and submissions in Dexie IndexedDB (version bump) while syncing with Express/SQLite backend endpoints, adhering to the application's robust offline-first and real-time synchronization architecture.
- **Why**: Guarantees fast classroom responsiveness even during intermittent internet connectivity.

***

## 4. Technical Architecture & Data Strategy

```
┌────────────────────────────────────────────────────────────────────────┐
│                        App Navigation / Sidebar                        │
│                   (PortalRoleActionBar & App.tsx)                      │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Active View: 'assessments'
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   AssessmentsManager Component                         │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ Category Tabs: [Homework] [Classwork] [Class Tests] [Examinations]│  │
│  └──────────────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────┐  ┌─────────────────────────────────┐ │
│  │   Teacher View               │  │   Student View                  │ │
│  │   - Create Assessment Modal  │  │   - Active Assignments Deck     │ │
│  │   - Rubric Authoring Deck    │  │   - Digital Turn-in / Attach    │ │
│  │   - Class Submission Grid    │  │   - Rubric Performance Card     │ │
│  │   - Rubric Grading Drawer    │  │   - Download Teacher Materials  │ │
│  │   - Sync to Terminal SBA Btn │  │                                 │ │
│  └──────────────┬───────────────┘  └────────────────┬────────────────┘ │
└─────────────────┼───────────────────────────────────┼──────────────────┘
                  │                                   │
                  ▼                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│           Dexie Client DB (v20) & LocalStorage State                   │
│  - db.assessments: title, category, subject, class, rubric, maxScore   │
│  - db.assessmentSubmissions: studentId, files, rubricScores, status    │
│  - db.results: classScore (auto-aggregated CA) & examScore             │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     Express API & Server Endpoints                     │
│  - GET/POST /api/assessments                                           │
│  - GET/POST /api/assessments/:id/submissions                           │
│  - POST /api/assessments/sync-terminal-sba                             │
└────────────────────────────────────────────────────────────────────────┘
```

### Data Entities & Schema

1. **`Assessment`**:
   - `id`: string (UUID)
   - `schoolId`: string
   - `title`: string
   - `category`: `'homework' | 'classwork' | 'class_test' | 'examination'`
   - `subject`: string
   - `class`: string
   - `academicYear`: string
   - `term`: string
   - `description`: string
   - `dueDate`: string
   - `maxScore`: number
   - `weightPercentage`: number (e.g. 10%, 20%, 70%)
   - `attachments`: Array<{ name: string; url: string; size: number }>
   - `rubric`: Array<{ id: string; criterion: string; description: string; maxPoints: number }>
   - `teacherId`: string
   - `teacherName`: string
   - `createdAt`: number
   - `updatedAt`: number

2. **`AssessmentSubmission`**:
   - `id`: string (UUID)
   - `assessmentId`: string
   - `studentId`: string
   - `studentName`: string
   - `class`: string
   - `status`: `'draft' | 'submitted' | 'graded' | 'returned'`
   - `submittedAt`: number
   - `content`: string (text answer / summary)
   - `attachments`: Array<{ name: string; url: string; size: number }>
   - `rubricScores`: Record<string, number> (criterionId -> awardedPoints)
   - `totalScore`: number
   - `feedback`: string
   - `gradedBy`: string
   - `gradedAt`: number

3. **`Terminal SBA Sync Service`**:
   - Aggregates submissions for `classwork`, `homework`, and `class_test` per student & subject.
   - Computes weighted Continuous Assessment (CA) score.
   - Writes directly to `db.results` updating `classScore`, `rawCaScore`, and `exerciseScores`.
   - For `examination` tasks, computes student exam mark and updates `examScore` and `totalScore` in `db.results`.

***

## 5. Implementation Sequence

1. **Schema & Database Upgrade**: Add `assessments` and `assessmentSubmissions` tables to Dexie in `src/db/schema.ts` (version 20) with proper indexes.
2. **Backend Express Routes**: Implement `/api/assessments` and `/api/assessments/:id/submissions` endpoints in `server.ts` for real-time persistence and sync.
3. **Core Assessment Components**:
   - `src/components/assessments/AssessmentsManager.tsx`: Main container with type tabs (Homework, Classwork, Class Tests, Examinations) and teacher/student view routing.
   - `src/components/assessments/AssessmentCard.tsx`: Rich cards displaying deadline, subject badge, max score, and submission progress.
   - `src/components/assessments/AssessmentEditorModal.tsx`: Modal for authoring tasks and multi-criteria rubrics.
   - `src/components/assessments/StudentSubmissionModal.tsx`: Digital response editor and attachment uploader for students.
   - `src/components/assessments/TeacherGradingDrawer.tsx`: Split-screen grading view with rubric scoring sliders and feedback input.
   - `src/components/assessments/TerminalSbaSyncModal.tsx`: Interactive confirmation modal showing preview of calculated CA and Exam score adjustments before committing to `db.results`.
4. **App Navigation & Metadata Integration**:
   - Update `src/lib/pageMetadata.ts` with `'assessments'` metadata.
   - Update `src/components/PortalRoleActionBar.tsx` to include `assessments` for teachers, students, admins, headteachers, and HODs.
   - Update `src/App.tsx` navigation items, view rendering, and mobile bottom navigation.
5. **Verification & Testing**: Build and lint verification, validating seamless switching between teacher and student roles.
