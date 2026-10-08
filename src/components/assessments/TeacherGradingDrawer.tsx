import React, { useState, useMemo } from 'react';
import {
  X,
  Award,
  Users,
  CheckCircle2,
  Clock,
  Paperclip,
  Save,
  MessageSquare,
  AlertCircle,
  Search,
  Check,
  ChevronRight,
  Sparkles
} from 'lucide-react';
import type {
  Assessment,
  AssessmentSubmission,
  Student
} from '../../db/schema';
import { calculateGrade } from '../../db/schema';
import { CATEGORY_CONFIG } from './AssessmentCard';
import { cn } from '../../lib/utils';

interface TeacherGradingDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  assessment: Assessment;
  submissions: AssessmentSubmission[];
  studentsInClass: Student[];
  teacherName?: string;
  onSaveGrade: (submission: AssessmentSubmission) => Promise<void>;
  onTriggerSbaSync?: () => void;
}

export const TeacherGradingDrawer: React.FC<TeacherGradingDrawerProps> = ({
  isOpen,
  onClose,
  assessment,
  submissions,
  studentsInClass,
  teacherName = 'Teacher',
  onSaveGrade,
  onTriggerSbaSync
}) => {
  if (!isOpen) return null;

  const [searchStudent, setSearchStudent] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState<string>(() => {
    // Select first student with submission or first student in class
    const firstSub = submissions.find(s => s.status === 'submitted');
    return firstSub?.studentId || (studentsInClass[0]?.studentId || '');
  });

  const category = CATEGORY_CONFIG[assessment.category] || CATEGORY_CONFIG.homework;

  // Selected student & submission
  const selectedStudent = useMemo(() => {
    return studentsInClass.find(s => s.studentId === selectedStudentId);
  }, [studentsInClass, selectedStudentId]);

  const currentSubmission = useMemo(() => {
    return submissions.find(s => s.studentId === selectedStudentId);
  }, [submissions, selectedStudentId]);

  // Form state for grading
  const [rubricScores, setRubricScores] = useState<Record<string, number>>({});
  const [feedback, setFeedback] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Sync state whenever selected submission changes
  React.useEffect(() => {
    if (currentSubmission) {
      setRubricScores(currentSubmission.rubricScores || {});
      setFeedback(currentSubmission.feedback || '');
    } else {
      setRubricScores({});
      setFeedback('');
    }
    setSaveSuccess(false);
  }, [currentSubmission, selectedStudentId]);

  // Rubric Total Tally
  const computedTotal = useMemo(() => {
    return assessment.rubric?.reduce((acc, crit) => {
      return acc + (Number(rubricScores[crit.id]) || 0);
    }, 0) || 0;
  }, [assessment.rubric, rubricScores]);

  // Computed Grade (Ghana scale 1-9 or standard)
  const percentScore = assessment.maxScore > 0 ? (computedTotal / assessment.maxScore) * 100 : 0;
  const gradeCalc = calculateGrade(percentScore);

  const handleScoreChange = (critId: string, val: number, maxPoints: number) => {
    const clamped = Math.min(Math.max(0, val), maxPoints);
    setRubricScores(prev => ({ ...prev, [critId]: clamped }));
  };

  const handleSave = async () => {
    if (!selectedStudent) return;
    setSaving(true);
    setSaveSuccess(false);
    try {
      const payload: AssessmentSubmission = {
        id: currentSubmission?.id || `sub-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        schoolId: assessment.schoolId,
        assessmentId: assessment.id,
        studentId: selectedStudent.studentId,
        studentName: `${selectedStudent.firstName} ${selectedStudent.lastName}`.trim(),
        class: selectedStudent.class || assessment.class,
        status: 'graded',
        submittedAt: currentSubmission?.submittedAt || Date.now(),
        content: currentSubmission?.content || 'Classroom assessment evaluated by teacher.',
        attachments: currentSubmission?.attachments || [],
        rubricScores,
        totalScore: computedTotal,
        grade: String(gradeCalc.grade),
        feedback: feedback.trim(),
        gradedBy: teacherName,
        gradedAt: Date.now()
      };

      await onSaveGrade(payload);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err) {
      console.error('Error saving grade:', err);
    } finally {
      setSaving(false);
    }
  };

  // Filter students
  const filteredStudents = useMemo(() => {
    return studentsInClass.filter(s => {
      const full = `${s.firstName} ${s.lastName} ${s.studentId}`.toLowerCase();
      return full.includes(searchStudent.toLowerCase());
    });
  }, [studentsInClass, searchStudent]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white w-full max-w-5xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col h-[92vh] animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-3">
            <span className={cn('px-2.5 py-1 rounded text-xs font-bold uppercase', category.bg)}>
              {category.icon} {category.label}
            </span>
            <div>
              <h2 className="text-base font-bold text-slate-900 leading-tight">{assessment.title}</h2>
              <p className="text-xs text-slate-500">
                Class {assessment.class} · {assessment.subject} · {assessment.maxScore} Max Points ({assessment.weightPercentage || 10}%)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onTriggerSbaSync && (
              <button
                onClick={onTriggerSbaSync}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-100 hover:bg-emerald-200 rounded-lg transition-colors cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Sync to Terminal SBA</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 2-Pane Work Area */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          {/* Left Pane: Class Student Roster */}
          <div className="w-full md:w-80 border-r border-slate-100 flex flex-col bg-slate-50/50">
            <div className="p-3 border-b border-slate-100">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Search students..."
                  value={searchStudent}
                  onChange={e => setSearchStudent(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-slate-100 p-2 space-y-1">
              {filteredStudents.map(student => {
                const sub = submissions.find(s => s.studentId === student.studentId);
                const isSelected = student.studentId === selectedStudentId;
                const isGraded = sub?.status === 'graded' || sub?.status === 'returned';
                const isSubmitted = sub?.status === 'submitted';

                return (
                  <button
                    key={student.studentId}
                    onClick={() => setSelectedStudentId(student.studentId)}
                    className={cn(
                      'w-full p-2.5 rounded-xl text-left transition-all cursor-pointer flex items-center justify-between gap-2',
                      isSelected
                        ? 'bg-emerald-50 text-emerald-950 font-semibold ring-1 ring-emerald-500/30'
                        : 'hover:bg-white text-slate-700'
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold truncate">
                        {student.firstName} {student.lastName}
                      </p>
                      <p className="text-[11px] text-slate-400 font-mono">{student.studentId}</p>
                    </div>

                    <div>
                      {isGraded ? (
                        <span className="px-2 py-0.5 rounded-md text-[11px] font-mono font-bold bg-emerald-100 text-emerald-800">
                          {sub?.totalScore} pts
                        </span>
                      ) : isSubmitted ? (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-800">
                          Turned In
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400 font-medium">Missing</span>
                      )}
                    </div>
                  </button>
                );
              })}

              {filteredStudents.length === 0 && (
                <div className="p-4 text-center text-xs text-slate-400">
                  No students found in class roster.
                </div>
              )}
            </div>
          </div>

          {/* Right Pane: Evaluation Deck */}
          <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5 bg-white">
            {selectedStudent ? (
              <>
                {/* Student Submission Card */}
                <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">
                        {selectedStudent.firstName} {selectedStudent.lastName}
                      </h3>
                      <p className="text-xs text-slate-500 font-mono">
                        Student ID: {selectedStudent.studentId} · Class: {selectedStudent.class || assessment.class}
                      </p>
                    </div>

                    <div>
                      {currentSubmission ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Submitted{' '}
                          {new Date(currentSubmission.submittedAt).toLocaleDateString()}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
                          <Clock className="w-3.5 h-3.5" />
                          No digital submission uploaded (Grading Paper / Oral)
                        </span>
                      )}
                    </div>
                  </div>

                  {currentSubmission?.content && (
                    <div className="mt-2 pt-2 border-t border-slate-200/60">
                      <p className="text-xs font-bold text-slate-600 mb-1">Student Answer:</p>
                      <div className="p-3 bg-white border border-slate-200 rounded-xl text-xs leading-relaxed text-slate-800 whitespace-pre-wrap">
                        {currentSubmission.content}
                      </div>
                    </div>
                  )}

                  {currentSubmission?.attachments && currentSubmission.attachments.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-slate-200/60">
                      <p className="text-xs font-bold text-slate-600 mb-1.5">Submitted Attachments:</p>
                      <div className="flex flex-wrap gap-2">
                        {currentSubmission.attachments.map((file, idx) => (
                          <div
                            key={idx}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-700"
                          >
                            <Paperclip className="w-3.5 h-3.5 text-emerald-600" />
                            <span className="font-medium">{file.name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Rubric Evaluation Form */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                      <Award className="w-4 h-4 text-emerald-600" />
                      Grading Rubric Evaluation
                    </h4>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-slate-500 font-medium">
                        Total Score:
                      </span>
                      <span className="text-lg font-mono font-extrabold text-emerald-700">
                        {computedTotal} / {assessment.maxScore}
                      </span>
                      <span className="px-2 py-0.5 rounded text-xs font-bold font-mono bg-slate-100 text-slate-800">
                        Grade: {gradeCalc.grade} ({gradeCalc.remarks})
                      </span>
                    </div>
                  </div>

                  {/* Rubric Criteria Rows */}
                  <div className="space-y-3">
                    {assessment.rubric?.map((crit, idx) => {
                      const currentVal = rubricScores[crit.id] ?? 0;
                      return (
                        <div
                          key={crit.id || idx}
                          className="p-3.5 bg-white border border-slate-200/80 rounded-xl space-y-2 hover:border-emerald-500/40 transition-colors"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-xs font-bold text-slate-900">
                                {idx + 1}. {crit.criterion}
                              </p>
                              <p className="text-[11px] text-slate-500">{crit.description}</p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <input
                                type="number"
                                min="0"
                                max={crit.maxPoints}
                                value={currentVal}
                                onChange={e =>
                                  handleScoreChange(crit.id, Number(e.target.value), crit.maxPoints)
                                }
                                className="w-16 px-2 py-1 text-xs font-mono font-bold text-right border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500"
                              />
                              <span className="text-xs text-slate-400 font-mono">/ {crit.maxPoints} pts</span>
                            </div>
                          </div>

                          {/* Quick Score Buttons */}
                          <div className="flex items-center gap-1 pt-1 border-t border-slate-100">
                            {[0, Math.round(crit.maxPoints * 0.5), Math.round(crit.maxPoints * 0.75), crit.maxPoints].map(
                              (pt, pIdx) => (
                                <button
                                  key={pIdx}
                                  type="button"
                                  onClick={() => handleScoreChange(crit.id, pt, crit.maxPoints)}
                                  className={cn(
                                    'px-2 py-0.5 rounded text-[10px] font-mono cursor-pointer transition-colors',
                                    currentVal === pt
                                      ? 'bg-emerald-600 text-white font-bold'
                                      : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                                  )}
                                >
                                  {pt} pts
                                </button>
                              )
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Feedback / Remark */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                      <MessageSquare className="w-3.5 h-3.5" />
                      Teacher Feedback & Pedagogical Remarks
                    </label>
                    <textarea
                      rows={3}
                      value={feedback}
                      onChange={e => setFeedback(e.target.value)}
                      placeholder="Write encouraging feedback, corrections, or key suggestions for the student..."
                      className="w-full px-3.5 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                    />
                  </div>

                  {/* Save Grade Button */}
                  <div className="pt-2 flex items-center justify-between">
                    {saveSuccess && (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                        <Check className="w-4 h-4" />
                        Grade saved and published to student!
                      </span>
                    )}
                    <div className="ml-auto flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleSave}
                        disabled={saving}
                        className="px-5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <Save className="w-3.5 h-3.5" />
                        <span>{saving ? 'Saving...' : 'Save & Return Grade'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="p-8 text-center text-slate-400 text-xs">
                Select a student from the class roster on the left to begin grading.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
export default TeacherGradingDrawer;
