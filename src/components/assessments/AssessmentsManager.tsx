import React, { useState, useMemo, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Award,
  BookOpen,
  Plus,
  Search,
  Filter,
  Sparkles,
  Calendar,
  Layers,
  CheckCircle2,
  Clock,
  RefreshCcw,
  GraduationCap,
  Users,
  FileSpreadsheet
} from 'lucide-react';
import {
  db,
  seedDefaultAssessmentsIfEmpty,
  seedDefaultQuestionBankIfEmpty,
  type Assessment,
  type AssessmentSubmission,
  type AssessmentCategory,
  type Student,
  type AssessmentQuestion,
  type QuestionBankItem
} from '../../db/schema';
import { useAuth } from '../../contexts/AuthContext';
import { useNotifications } from '../../contexts/NotificationContext';
import { AssessmentCard, CATEGORY_CONFIG } from './AssessmentCard';
import { AssessmentEditorModal } from './AssessmentEditorModal';
import { StudentSubmissionModal } from './StudentSubmissionModal';
import { TeacherGradingDrawer } from './TeacherGradingDrawer';
import { TerminalSbaSyncModal } from './TerminalSbaSyncModal';
import { OnlineInteractiveQuizModal } from './OnlineInteractiveQuizModal';
import { PrintableExamModal } from './PrintableExamModal';
import { QuestionBankView } from './QuestionBankView';
import { LessonNoteQuestionGeneratorModal } from './LessonNoteQuestionGeneratorModal';
import { cn } from '../../lib/utils';

export default function AssessmentsManager() {
  const { user } = useAuth();
  const { showToast } = useNotifications();

  const isStudent = user?.role === 'student';
  const isTeacher = user?.role === 'teacher';
  const isAdminOrHOD = ['admin', 'super_admin', 'headteacher', 'hod', 'creator'].includes(user?.role || '');

  // Live queries
  const allAssessments = useLiveQuery(() => db.assessments.toArray()) || [];
  const allSubmissions = useLiveQuery(() => db.assessmentSubmissions.toArray()) || [];
  const studentsInSystem = useLiveQuery(() => db.students.toArray()) || [];
  const classesFromDB = useLiveQuery(() => db.classes.toArray()) || [];
  const subjectsFromDB = useLiveQuery(() => db.subjects.toArray()) || [];
  const settings = useLiveQuery(() => db.settings.toArray()) || [];
  const allBankQuestions = useLiveQuery(() => db.questionBank.toArray()) || [];

  // Seed default demo assessments and question bank on first mount if empty
  useEffect(() => {
    seedDefaultAssessmentsIfEmpty(user?.schoolId, studentsInSystem);
    seedDefaultQuestionBankIfEmpty(user?.schoolId);
  }, [user?.schoolId, studentsInSystem]);

  // Identify Student Record if user is student
  const currentStudentRecord = useMemo(() => {
    if (isStudent) {
      const name = user?.fullName || user?.username || 'Student';
      const cleanName = name.replace(/\s*\(Student\)/i, '').trim().toLowerCase();
      return (
        studentsInSystem.find(s => {
          if (!s) return false;
          if (s.studentId && user?.username && s.studentId.toLowerCase() === user.username.toLowerCase()) return true;
          const full = `${s.firstName || ''} ${s.lastName || ''}`.toLowerCase().trim();
          return (cleanName && full.includes(cleanName)) || (full && cleanName.includes(full));
        }) || {
          studentId: user?.username || 'STU-CURRENT',
          firstName: name.split(' ')[0] || 'Student',
          lastName: name.split(' ')[1] || '',
          class: studentsInSystem[0]?.class || 'JHS 1'
        } as Student
      );
    }
    return null;
  }, [isStudent, user?.fullName, user?.username, studentsInSystem]);

  // Available classes and subjects
  const classOptions = useMemo(() => {
    const fromDB = classesFromDB.map(c => c.name);
    const fromStudents = studentsInSystem.map(s => s.class);
    const fromAssessments = allAssessments.map(a => a.class);
    const set = Array.from(new Set([...fromDB, ...fromStudents, ...fromAssessments])).filter(Boolean).sort();
    return set.length > 0 ? set : ['JHS 1', 'JHS 2', 'JHS 3', 'Basic 6'];
  }, [classesFromDB, studentsInSystem, allAssessments]);

  const subjectOptions = useMemo(() => {
    const fromDB = subjectsFromDB.map(s => s.name);
    const fromAssessments = allAssessments.map(a => a.subject);
    const set = Array.from(new Set([...fromDB, ...fromAssessments])).filter(Boolean).sort();
    return set.length > 0 ? set : ['Mathematics', 'Integrated Science', 'English Language', 'Social Studies', 'ICT'];
  }, [subjectsFromDB, allAssessments]);

  const currentTerm = useMemo(() => {
    const conf = settings.find(s => s.key === 'academicConfig')?.value;
    return conf?.currentTerm || 'Term 1';
  }, [settings]);

  const currentAcademicYear = useMemo(() => {
    const conf = settings.find(s => s.key === 'academicConfig')?.value;
    return conf?.academicYear || '2025/2026';
  }, [settings]);

  // State Filters
  const [selectedCategoryTab, setSelectedCategoryTab] = useState<'all' | AssessmentCategory>('all');
  const [selectedClass, setSelectedClass] = useState<string>('All');
  const [selectedSubject, setSelectedSubject] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [studentStatusFilter, setStudentStatusFilter] = useState<'all' | 'todo' | 'submitted' | 'graded'>('all');

  // Modals state
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingAssessment, setEditingAssessment] = useState<Assessment | null>(null);
  const [gradingAssessment, setGradingAssessment] = useState<Assessment | null>(null);
  const [submittingAssessment, setSubmittingAssessment] = useState<Assessment | null>(null);
  const [selectedSubmissionForModal, setSelectedSubmissionForModal] = useState<AssessmentSubmission | undefined>();
  const [isSbaSyncModalOpen, setIsSbaSyncModalOpen] = useState(false);
  const [activeQuizAssessment, setActiveQuizAssessment] = useState<Assessment | null>(null);
  const [isPreviewQuiz, setIsPreviewQuiz] = useState<boolean>(false);
  const [activePrintAssessment, setActivePrintAssessment] = useState<Assessment | null>(null);
  const [mainSectionTab, setMainSectionTab] = useState<'assessments' | 'question_bank'>('assessments');
  const [isAiGeneratorModalOpen, setIsAiGeneratorModalOpen] = useState(false);

  // Filtered Assessments
  const filteredAssessments = useMemo(() => {
    return allAssessments.filter(a => {
      // Role scoping: If student, show only assignments for their class (or 'All')
      if (isStudent && currentStudentRecord) {
        const studentClass = currentStudentRecord.class;
        if (a.class !== 'All' && a.class !== studentClass) return false;
      } else if (selectedClass !== 'All' && a.class !== selectedClass && a.class !== 'All') {
        return false;
      }

      // Category tab
      if (selectedCategoryTab !== 'all' && a.category !== selectedCategoryTab) {
        return false;
      }

      // Subject filter
      if (selectedSubject !== 'All' && a.subject !== selectedSubject) {
        return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = a.title.toLowerCase().includes(q);
        const matchSubject = a.subject.toLowerCase().includes(q);
        const matchClass = a.class.toLowerCase().includes(q);
        if (!matchTitle && !matchSubject && !matchClass) return false;
      }

      // Student Status Filter (To Do / Submitted / Graded)
      if (isStudent && currentStudentRecord) {
        const mySub = allSubmissions.find(
          s => s.assessmentId === a.id && s.studentId === currentStudentRecord.studentId
        );
        if (studentStatusFilter === 'todo' && mySub) return false;
        if (studentStatusFilter === 'submitted' && (!mySub || mySub.status === 'graded')) return false;
        if (studentStatusFilter === 'graded' && (!mySub || mySub.status !== 'graded')) return false;
      }

      return true;
    });
  }, [
    allAssessments,
    selectedCategoryTab,
    selectedClass,
    selectedSubject,
    searchQuery,
    isStudent,
    currentStudentRecord,
    allSubmissions,
    studentStatusFilter
  ]);

  // Metrics for counters
  const categoryCounts = useMemo(() => {
    return {
      all: allAssessments.length,
      homework: allAssessments.filter(a => a.category === 'homework').length,
      classwork: allAssessments.filter(a => a.category === 'classwork').length,
      class_test: allAssessments.filter(a => a.category === 'class_test').length,
      examination: allAssessments.filter(a => a.category === 'examination').length
    };
  }, [allAssessments]);

  // Actions
  const handleSaveAssessment = async (assessment: Assessment) => {
    try {
      await db.assessments.put(assessment);
      showToast('Assessment saved successfully!', 'success');

      // Also sync to Express backend
      try {
        await fetch('/api/assessments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(assessment)
        });
      } catch (e) {
        // local Dexie is authority
      }
    } catch (err: any) {
      showToast('Error saving assessment: ' + err.message, 'error');
    }
  };

  const handleDeleteAssessment = async (assessmentId: string) => {
    if (!confirm('Are you sure you want to delete this assessment and its student submissions?')) return;
    try {
      await db.assessments.delete(assessmentId);
      const subsToDelete = allSubmissions.filter(s => s.assessmentId === assessmentId).map(s => s.id);
      if (subsToDelete.length > 0) {
        await db.assessmentSubmissions.bulkDelete(subsToDelete);
      }
      showToast('Assessment deleted.', 'info');

      try {
        await fetch(`/api/assessments/${assessmentId}`, { method: 'DELETE' });
      } catch (e) {}
    } catch (err: any) {
      showToast('Error deleting assessment: ' + err.message, 'error');
    }
  };

  const handleSaveStudentSubmission = async (submission: AssessmentSubmission) => {
    try {
      await db.assessmentSubmissions.put(submission);
      showToast('Your work has been turned in successfully!', 'success');

      try {
        await fetch(`/api/assessments/${submission.assessmentId}/submissions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(submission)
        });
      } catch (e) {}
    } catch (err: any) {
      showToast('Failed to turn in work: ' + err.message, 'error');
    }
  };

  const handleSaveTeacherGrade = async (submission: AssessmentSubmission) => {
    try {
      await db.assessmentSubmissions.put(submission);
      showToast('Grade saved and returned to student.', 'success');

      try {
        await fetch(`/api/assessments/${submission.assessmentId}/submissions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(submission)
        });
      } catch (e) {}
    } catch (err: any) {
      showToast('Failed to save grade: ' + err.message, 'error');
    }
  };

  const handleTakeQuiz = (assessment: Assessment, existingSub?: AssessmentSubmission) => {
    setActiveQuizAssessment(assessment);
    setSelectedSubmissionForModal(existingSub);
    setIsPreviewQuiz(false);
  };

  const handlePreviewQuiz = (assessment: Assessment) => {
    setActiveQuizAssessment(assessment);
    setSelectedSubmissionForModal(undefined);
    setIsPreviewQuiz(true);
  };

  const handlePrintExam = (assessment: Assessment) => {
    setActivePrintAssessment(assessment);
  };

  // Create an assessment directly from questions selected in the Question Bank
  const handleCreateAssessmentFromQuestions = (questions: AssessmentQuestion[], subject?: string) => {
    const sub = subject || (questions[0]?.strand) || 'Mathematics';
    const totalPts = questions.reduce((acc, q) => acc + (Number(q.points) || 1), 0);
    const newAssessment: Assessment = {
      id: `assess-${Date.now()}`,
      schoolId: user?.schoolId,
      title: `${sub} Exercise (${questions.length} Questions)`,
      category: 'class_test',
      subject: sub,
      class: classOptions[0] || 'JHS 1',
      academicYear: currentAcademicYear,
      term: currentTerm,
      description: `Curriculum assessment assembled from Question Bank repository.`,
      dueDate: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
      maxScore: totalPts || 20,
      weightPercentage: 15,
      questions: questions.map((q, idx) => ({ ...q, questionNumber: idx + 1 })),
      rubric: [
        { id: 'crit-1', criterion: 'Knowledge & Concept Mastery', description: 'Accurate comprehension of core syllabus concepts', maxPoints: Math.max(1, Math.round(totalPts * 0.5)) },
        { id: 'crit-2', criterion: 'Method & Problem-Solving', description: 'Logical steps and reasoning', maxPoints: Math.max(1, Math.round(totalPts * 0.3)) },
        { id: 'crit-3', criterion: 'Presentation & Completeness', description: 'Neatness and completeness', maxPoints: Math.max(1, Math.round(totalPts * 0.2)) }
      ],
      teacherName: user?.fullName || user?.username,
      teacherId: user?.id != null ? String(user.id) : (user?.username || 'teacher'),
      status: 'draft',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    setEditingAssessment(newAssessment);
    setIsEditorOpen(true);
    setMainSectionTab('assessments');
    showToast(`Loaded ${questions.length} questions into new assessment editor!`, 'success');
  };

  // Save generated questions directly to the Question Bank
  const handleImportAiQuestionsToBank = async (imported: AssessmentQuestion[], meta?: any) => {
    try {
      const now = Date.now();
      const sId = user?.schoolId || 'default-school';
      const bankEntries: QuestionBankItem[] = imported.map((q, idx) => ({
        id: `qb-ai-${now}-${idx}-${Math.random().toString(36).substring(2, 6)}`,
        schoolId: sId,
        subject: q.strand || meta?.title?.split(' ')[0] || 'General',
        topic: q.strand || q.subStrand || meta?.title || 'Generated Topic',
        className: 'JHS 1',
        difficulty: 'medium',
        question: q,
        source: 'ai_generated',
        usageCount: 0,
        createdAt: now,
        updatedAt: now
      }));
      await db.questionBank.bulkPut(bankEntries);
      showToast(`Added ${imported.length} questions directly into Central Question Bank!`, 'success');
    } catch (err: any) {
      showToast('Error saving to question bank: ' + err.message, 'error');
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-3 sm:px-6 py-6 pb-24">
      {/* Top Banner Header */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-[#1c4a59] text-white">
              {mainSectionTab === 'question_bank' && !isStudent ? (
                <>
                  <BookOpen className="w-3.5 h-3.5 text-[#faae57]" />
                  Central Question Bank
                </>
              ) : (
                <>
                  <Award className="w-3.5 h-3.5" />
                  Unified Academic Assessments
                </>
              )}
            </span>
            <span className="text-xs text-slate-500 font-medium">
              {currentTerm} · {currentAcademicYear}
            </span>

            {/* Main Section Switcher for Educators */}
            {!isStudent && (
              <div className="flex items-center p-0.5 bg-slate-100 rounded-xl border border-slate-200 ml-0 sm:ml-2">
                <button
                  type="button"
                  onClick={() => setMainSectionTab('assessments')}
                  className={cn(
                    'px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5',
                    mainSectionTab === 'assessments'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  )}
                >
                  <Award className="w-3.5 h-3.5 text-[#1c4a59]" />
                  <span>Assessments</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMainSectionTab('question_bank')}
                  className={cn(
                    'px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5',
                    mainSectionTab === 'question_bank'
                      ? 'bg-[#1c4a59] text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  )}
                >
                  <BookOpen className="w-3.5 h-3.5 text-[#faae57]" />
                  <span>Question Bank</span>
                  <span className={cn(
                    'px-1.5 py-0.2 rounded-full text-[10px] font-mono',
                    mainSectionTab === 'question_bank' ? 'bg-[#153843] text-white' : 'bg-slate-200 text-slate-700'
                  )}>
                    {allBankQuestions.length}
                  </span>
                </button>
              </div>
            )}
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
            {isStudent
              ? 'My Coursework & Examination Hub'
              : mainSectionTab === 'question_bank'
              ? 'Central Curriculum Question Bank'
              : 'Homework, Classwork, Tests & Examinations'}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 max-w-2xl leading-relaxed">
            {isStudent
              ? 'View assigned tasks, review grading rubrics, upload digital submissions, and track continuous assessment scores.'
              : mainSectionTab === 'question_bank'
              ? 'Store, categorize by subject/topic, and reuse created or AI-generated questions across homework, quizzes, and examinations.'
              : 'Create curriculum-aligned exercises with multi-criteria scoring rubrics, review student work, and automatically aggregate scores into terminal continuous assessment (SBA).'}
          </p>
        </div>

        {/* Header Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
          {!isStudent && (
            <>
              {mainSectionTab === 'question_bank' ? (
                <>
                  <button
                    onClick={() => setIsAiGeneratorModalOpen(true)}
                    className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-bold text-[#1f2a2e] bg-[#faae57] hover:bg-[#e4ae67] rounded-xl transition-all shadow-xs cursor-pointer"
                  >
                    <Sparkles className="w-4 h-4 text-[#1f2a2e]" />
                    <span>Generate from Notes</span>
                  </button>

                  <button
                    onClick={() => setMainSectionTab('assessments')}
                    className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-bold text-[#1c4a59] bg-slate-100 hover:bg-slate-200 border border-[#bac4c6]/40 rounded-xl transition-all cursor-pointer"
                  >
                    <Award className="w-4 h-4" />
                    <span>View Assessments</span>
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => setMainSectionTab('question_bank')}
                    className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-bold text-[#1c4a59] bg-teal-50 hover:bg-teal-100 border border-teal-200/80 rounded-xl transition-all shadow-xs cursor-pointer"
                    title="Access central Question Bank repository"
                  >
                    <BookOpen className="w-4 h-4 text-[#1c4a59]" />
                    <span>Question Bank ({allBankQuestions.length})</span>
                  </button>

                  <button
                    onClick={() => setIsSbaSyncModalOpen(true)}
                    className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200/80 rounded-xl transition-all shadow-xs cursor-pointer"
                    title="Aggregate continuous assessment scores into results marksheet"
                  >
                    <Sparkles className="w-4 h-4 text-emerald-600" />
                    <span>Sync to SBA</span>
                  </button>

                  <button
                    onClick={() => {
                      setEditingAssessment(null);
                      setIsEditorOpen(true);
                    }}
                    className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-all shadow-xs cursor-pointer ml-auto md:ml-0"
                  >
                    <Plus className="w-4 h-4" />
                    <span>New Assessment</span>
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* Main Content Area: Central Question Bank or Assessments List */}
      {mainSectionTab === 'question_bank' && !isStudent ? (
        <QuestionBankView
          onOpenAiGenerator={() => setIsAiGeneratorModalOpen(true)}
          onCreateAssessmentFromQuestions={handleCreateAssessmentFromQuestions}
          userRole={user?.role}
        />
      ) : (
        <>
          {/* Unified Category Tabs (Homework, Classwork, Class Tests, Examinations) */}
          <div className="bg-white p-2 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between gap-2 overflow-x-auto no-scrollbar">
            <div className="flex items-center gap-1.5 min-w-max">
          {[
            { id: 'all', label: 'All Assessments', icon: '📋', count: categoryCounts.all },
            { id: 'homework', label: 'Homework', icon: '📝', count: categoryCounts.homework },
            { id: 'classwork', label: 'Classwork', icon: '📚', count: categoryCounts.classwork },
            { id: 'class_test', label: 'Class Tests', icon: '⏱️', count: categoryCounts.class_test },
            { id: 'examination', label: 'Examinations', icon: '🏛️', count: categoryCounts.examination }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setSelectedCategoryTab(tab.id as any)}
              className={cn(
                'inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer',
                selectedCategoryTab === tab.id
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              )}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
              <span
                className={cn(
                  'px-1.5 py-0.2 rounded-md text-[11px] font-mono',
                  selectedCategoryTab === tab.id ? 'bg-slate-800 text-slate-200' : 'bg-slate-100 text-slate-600'
                )}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-2.5" />
          <input
            type="text"
            placeholder="Search by assessment title, subject, or class..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
          />
        </div>

        {/* Dropdown Filters */}
        <div className="flex flex-wrap items-center gap-2">
          {!isStudent && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-400 font-medium">Class:</span>
              <select
                value={selectedClass}
                onChange={e => setSelectedClass(e.target.value)}
                className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                <option value="All">All Classes</option>
                {classOptions.map(c => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-400 font-medium">Subject:</span>
            <select
              value={selectedSubject}
              onChange={e => setSelectedSubject(e.target.value)}
              className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="All">All Subjects</option>
              {subjectOptions.map(s => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          {/* Student Status Quick Filter */}
          {isStudent && (
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
              {[
                { id: 'all', label: 'All' },
                { id: 'todo', label: 'To Do' },
                { id: 'submitted', label: 'Turned In' },
                { id: 'graded', label: 'Graded' }
              ].map(st => (
                <button
                  key={st.id}
                  onClick={() => setStudentStatusFilter(st.id as any)}
                  className={cn(
                    'px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer',
                    studentStatusFilter === st.id
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  )}
                >
                  {st.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Grid of Assessment Cards */}
      {filteredAssessments.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredAssessments.map(assessment => {
            const subsForAssessment = allSubmissions.filter(
              s => s.assessmentId === assessment.id
            );

            return (
              <AssessmentCard
                key={assessment.id}
                assessment={assessment}
                submissions={subsForAssessment}
                userRole={user?.role}
                studentId={currentStudentRecord?.studentId}
                onEdit={asm => {
                  setEditingAssessment(asm);
                  setIsEditorOpen(true);
                }}
                onDelete={handleDeleteAssessment}
                onGrade={asm => setGradingAssessment(asm)}
                onSubmitWork={(asm, existingSub) => {
                  setSubmittingAssessment(asm);
                  setSelectedSubmissionForModal(existingSub);
                }}
                onViewFeedback={(asm, sub) => {
                  setSubmittingAssessment(asm);
                  setSelectedSubmissionForModal(sub);
                }}
                onTakeQuiz={handleTakeQuiz}
                onPrintExam={handlePrintExam}
                onPreviewQuiz={handlePreviewQuiz}
              />
            );
          })}
        </div>
      ) : (
        <div className="p-12 text-center bg-white rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
            <BookOpen className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-slate-900">No assessments found</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            {isStudent
              ? 'You have no assigned tasks matching the selected filters at this time.'
              : 'No assessments found for the selected category or class. Create your first assignment above.'}
          </p>
          {!isStudent && (
            <button
              onClick={() => {
                setEditingAssessment(null);
                setIsEditorOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Create New Assessment</span>
            </button>
          )}
        </div>
      )}
        </>
      )}

      {/* MODAL 1: Teacher Assessment Editor */}
      <AssessmentEditorModal
        isOpen={isEditorOpen}
        onClose={() => {
          setIsEditorOpen(false);
          setEditingAssessment(null);
        }}
        onSave={handleSaveAssessment}
        initialData={editingAssessment}
        classes={classOptions}
        subjects={subjectOptions}
        currentTerm={currentTerm}
        currentAcademicYear={currentAcademicYear}
        defaultTeacherName={user?.fullName || 'Teacher'}
        defaultTeacherId={user?.username || 'staff-01'}
      />

      {/* MODAL 2: Student Turn In / Rubric Feedback */}
      {submittingAssessment && currentStudentRecord && (
        <StudentSubmissionModal
          isOpen={Boolean(submittingAssessment)}
          onClose={() => {
            setSubmittingAssessment(null);
            setSelectedSubmissionForModal(undefined);
          }}
          assessment={submittingAssessment}
          existingSubmission={selectedSubmissionForModal}
          studentId={currentStudentRecord.studentId}
          studentName={`${currentStudentRecord.firstName} ${currentStudentRecord.lastName}`.trim()}
          studentClass={currentStudentRecord.class}
          onSubmit={handleSaveStudentSubmission}
        />
      )}

      {/* MODAL 3: Teacher Grading Drawer */}
      {gradingAssessment && (
        <TeacherGradingDrawer
          isOpen={Boolean(gradingAssessment)}
          onClose={() => setGradingAssessment(null)}
          assessment={gradingAssessment}
          submissions={allSubmissions.filter(s => s.assessmentId === gradingAssessment.id)}
          studentsInClass={
            studentsInSystem.filter(
              s => gradingAssessment.class === 'All' || s.class === gradingAssessment.class
            )
          }
          teacherName={user?.fullName || 'Teacher'}
          onSaveGrade={handleSaveTeacherGrade}
          onTriggerSbaSync={() => {
            setGradingAssessment(null);
            setIsSbaSyncModalOpen(true);
          }}
        />
      )}

      {/* MODAL 4: Terminal SBA Aggregation Sync */}
      {isSbaSyncModalOpen && (
        <TerminalSbaSyncModal
          isOpen={isSbaSyncModalOpen}
          onClose={() => setIsSbaSyncModalOpen(false)}
          assessments={allAssessments}
          submissions={allSubmissions}
          students={studentsInSystem}
          targetClass={selectedClass === 'All' ? classOptions[0] || 'JHS 1' : selectedClass}
          targetSubject={selectedSubject === 'All' ? subjectOptions[0] || 'Mathematics' : selectedSubject}
          classes={classOptions}
          subjects={subjectOptions}
          term={currentTerm}
          academicYear={currentAcademicYear}
        />
      )}

      {/* MODAL 5: Online Interactive Quiz Modal */}
      {activeQuizAssessment && (
        <OnlineInteractiveQuizModal
          isOpen={Boolean(activeQuizAssessment)}
          onClose={() => {
            setActiveQuizAssessment(null);
            setIsPreviewQuiz(false);
            setSelectedSubmissionForModal(undefined);
          }}
          assessment={activeQuizAssessment}
          existingSubmission={selectedSubmissionForModal}
          studentId={currentStudentRecord?.studentId || user?.username || 'STU-01'}
          studentName={
            currentStudentRecord
              ? `${currentStudentRecord.firstName} ${currentStudentRecord.lastName}`.trim()
              : user?.fullName || 'Student'
          }
          studentClass={currentStudentRecord?.class || activeQuizAssessment.class || 'JHS 1'}
          onSubmitQuiz={handleSaveStudentSubmission}
          isPreviewMode={isPreviewQuiz}
        />
      )}

      {/* MODAL 6: Printable Examination Paper & Marking Scheme */}
      {activePrintAssessment && (
        <PrintableExamModal
          isOpen={Boolean(activePrintAssessment)}
          onClose={() => setActivePrintAssessment(null)}
          assessment={activePrintAssessment}
          schoolName={
            settings.find(s => s.key === 'schoolInfo')?.value?.schoolName ||
            user?.schoolId ||
            'SchoolSphere Model Academy'
          }
        />
      )}

      {/* MODAL 7: AI Generator into Central Question Bank */}
      {isAiGeneratorModalOpen && (
        <LessonNoteQuestionGeneratorModal
          isOpen={isAiGeneratorModalOpen}
          onClose={() => setIsAiGeneratorModalOpen(false)}
          onImportQuestions={handleImportAiQuestionsToBank}
          currentSubject={selectedSubject !== 'All' ? selectedSubject : 'Integrated Science'}
          currentClass={selectedClass !== 'All' ? selectedClass : 'JHS 1'}
          currentTerm={currentTerm}
        />
      )}
    </div>
  );
}
