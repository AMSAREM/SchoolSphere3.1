# Implementation Plan: Question Authoring & Lesson Note AI Question Generator

## Overview
Enable teachers on SchoolSphere to set custom questions directly within the application and automatically generate curriculum-aligned questions (Multiple Choice, Short Answer, and Essay) from uploaded lesson notes or existing saved weekly lesson plans. Support both **interactive online quizzes for students** (with instant automated MCQ grading) and **printable examination papers** complete with marking schemes and standard school letterheads.

---

## 1. Schema & Data Model Enhancements
- **Question Structure (`src/db/schema.ts`)**:
  - Define `AssessmentQuestion`:
    - `id`: unique string identifier
    - `type`: `'mcq' | 'short_answer' | 'essay'`
    - `questionText`: formatted prompt / stem
    - `options`?: array of 4 choices for MCQs (A, B, C, D)
    - `correctAnswer`?: string (option index or key phrase)
    - `explanation`?: pedagogical rationale
    - `marks`: point value (e.g. 1 mark for MCQ, 3–5 for short answer, 10 for essay)
    - `rubricGuide`?: expected scoring points / model answer
    - `bloomLevel`?: `'recall' | 'understanding' | 'application' | 'analysis'`
    - `sourceLessonNoteId`?: reference link to the originating lesson plan
  - Extend `Assessment`:
    - `questions?: AssessmentQuestion[]`
    - `timeLimitMinutes?: number`
    - `totalMarks?: number`
    - `passMarks?: number`
    - `shuffleQuestions?: boolean`
    - `showSolutionsAfterSubmit?: boolean`
  - Extend `AssessmentSubmission`:
    - `answers?: Record<string, string>` (questionId -> student response)
    - `questionScores?: Record<string, number>` (per-question marks awarded)
    - `autoGradedMcqScore?: number`
    - `autoGradedAt?: number`

---

## 2. Server-Side AI Question Generation API
- **Endpoint (`POST /api/ai/generate-questions-from-notes`)**:
  - Authenticated route leveraging `@google/genai` with `gemini-3.8-flash`.
  - Accepts:
    - `lessonNoteContent`: text extracted from lesson objectives, activities, competencies, or uploaded document text/PDF.
    - `subject`, `classLevel`, `strand`, `subStrand`.
    - `counts`: number of MCQs, short answer questions, and essay questions.
    - `difficulty`: `'easy' | 'moderate' | 'challenging' | 'mixed'`.
    - `curriculumFocus`: optional emphasis (e.g., "BECE style", "Practical application").
  - System instructions tuned for Ghanaian/WAEC educational standards (clear stems, plausible distractors, explicit marking rubrics).
  - Robust heuristic offline fallback generator in case API key is unconfigured or network is unavailable, ensuring zero disruption.

---

## 3. Teacher Question Authoring Studio
- **Integrated Question Setting in `AssessmentEditorModal.tsx`**:
  - Tabbed or multi-stage interface:
    - **Tab 1: General Details & Class Targets** (Title, Category, Due Date, Weight, Time limit).
    - **Tab 2: Question Paper Builder**:
      - Add Question buttons for MCQ, Short Answer, and Essay.
      - Inline editor with drag/reorder, mark allocation, option creation, and marking guides.
      - Real-time total marks calculator.
    - **Tab 3: AI Generator from Lesson Notes**:
      - One-click launcher that connects directly to the lesson notes repository.
- **Dedicated Question Card Component (`QuestionEditorCard.tsx`)**:
  - Clean card design respecting SchoolSphere brand tokens (`#1c4a59` primary, `#faae57` CTA, `#bac4c6` borders).
  - Collapsible cards with type badges and quick duplicate/delete actions.

---

## 4. AI Generator Modal & Lesson Notes Integration
- **`LessonNoteQuestionGeneratorModal.tsx`**:
  - **Source 1: Choose from Saved Lesson Notes**:
    - Live picker querying `db.lessonNotes`.
    - Search & filter by Subject, Class, Term, and Week.
    - Automatic extraction of Strand, Sub-strand, Core Competencies, and Evaluation tasks.
  - **Source 2: Upload or Paste Custom Note**:
    - File reader supporting text and PDF notes, plus a direct markdown/paste area.
  - **Configurable Generation Sliders**:
    - Number of MCQs, Short Answer, and Essay questions.
    - Difficulty level selector.
  - **Live Question Review & Staging**:
    - Review generated questions before inserting.
    - Regenerate single questions or edit text inline.
    - "Insert into Assessment" action button.
- **Direct Bridge from `LessonNotes.tsx`**:
  - Add a **"Generate Assessment Questions"** button on individual lesson note cards in the Lesson Notes repository.
  - Clicking pre-loads the generator with that lesson note's exact curriculum metadata and objectives.

---

## 5. Interactive Online Quiz Mode for Students
- **In `StudentSubmissionModal.tsx`**:
  - If the assessment has structured `questions`:
    - Responsive online exam runner with clean countdown clock (if timed).
    - Question pagination and jump palette (indicating answered vs pending questions).
    - Single-click radio inputs for MCQs with persistent local draft storage to prevent lost work.
    - Textareas for Short Answer and Essay with character/word counter.
    - Review screen before final submission.
  - **Automated MCQ Grading**:
    - On submission, instantly score all MCQs against the answer key.
    - Save auto-score to `AssessmentSubmission`, updating overall percentage and notifying the teacher.
  - **Teacher Grading Workflow**:
    - Update `TeacherGradingDrawer.tsx` to display student answers question-by-question alongside the marking guide, allowing quick point input and feedback.

---

## 6. Printable Examination Papers & Marking Scheme
- **`PrintableExamPaperModal.tsx`**:
  - Standard Ghanaian school examination layout:
    - Institutional header: School Name, Badge/Logo, Academic Year, Term, Class, Subject, Date, Time allowed.
    - Instructions to candidates.
    - Section A: Objective Test (formatted in clean columns with option brackets).
    - Section B: Structured / Theory Test with mark points in brackets `[4 marks]`.
  - **Toggleable Marking Guide / Answer Key**:
    - Single switch to toggle candidate test paper vs Teacher's Marking Scheme.
  - **Print CSS**:
    - Pure black-and-white formatting with print margins, page-break hygiene, and hiding of app navigation.

---

## 7. Verification & Testing
- Test manual creation of MCQs, short answer, and essay questions.
- Test generating questions from a saved lesson note via the AI generator and verify question quality.
- Verify online student test taking, timer behavior, and automatic MCQ grading.
- Verify teacher manual grading for essay/short answer questions and SBA sync.
- Verify print preview layout for both student exam paper and teacher marking guide.
