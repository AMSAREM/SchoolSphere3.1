import React, { useState, useMemo } from 'react';
import {
  X,
  Sparkles,
  Calculator,
  CheckCircle2,
  AlertCircle,
  RefreshCcw,
  Check,
  ChevronRight,
  Database
} from 'lucide-react';
import { db, calculateGrade, type Assessment, type AssessmentSubmission, type Student, type Result } from '../../db/schema';
import { cn } from '../../lib/utils';
import { useNotifications } from '../../contexts/NotificationContext';

interface TerminalSbaSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  assessments: Assessment[];
  submissions: AssessmentSubmission[];
  students: Student[];
  targetClass: string;
  targetSubject: string;
  classes?: string[];
  subjects?: string[];
  term: string;
  academicYear: string;
}

export const TerminalSbaSyncModal: React.FC<TerminalSbaSyncModalProps> = ({
  isOpen,
  onClose,
  assessments,
  submissions,
  students,
  targetClass,
  targetSubject,
  classes = [],
  subjects = [],
  term,
  academicYear
}) => {
  if (!isOpen) return null;

  const { showToast } = useNotifications();
  const [currentClass, setCurrentClass] = useState<string>(targetClass || 'JHS 1');
  const [currentSubject, setCurrentSubject] = useState<string>(targetSubject || 'Integrated Science');
  const [syncing, setSyncing] = useState(false);
  const [syncComplete, setSyncComplete] = useState(false);

  // Filter assessments relevant to target class & subject
  const relevantAssessments = useMemo(() => {
    return assessments.filter(a => {
      const classMatch = a.class === currentClass || a.class === 'All';
      const subjMatch = a.subject === currentSubject;
      const termMatch = !a.term || a.term === term;
      return classMatch && subjMatch && termMatch;
    });
  }, [assessments, currentClass, currentSubject, term]);

  const formativeTasks = relevantAssessments.filter(
    a => a.category === 'homework' || a.category === 'classwork' || a.category === 'class_test'
  );
  const examTasks = relevantAssessments.filter(a => a.category === 'examination');

  // Filter students in class
  const classStudents = useMemo(() => {
    return students.filter(s => s.class === currentClass);
  }, [students, currentClass]);

  // Aggregate student scores
  const studentSyncRows = useMemo(() => {
    return classStudents.map(student => {
      // Find all graded submissions for this student
      const studentSubs = submissions.filter(
        s => s.studentId === student.studentId && (s.status === 'graded' || s.status === 'returned')
      );

      // Formative calculations
      let totalFormativeEarned = 0;
      let totalFormativeMax = 0;
      let formativeCount = 0;

      formativeTasks.forEach(task => {
        const sub = studentSubs.find(s => s.assessmentId === task.id);
        if (sub && typeof sub.totalScore === 'number') {
          totalFormativeEarned += sub.totalScore;
          totalFormativeMax += task.maxScore;
          formativeCount++;
        }
      });

      // Scaled CA out of 30
      const caRatio = totalFormativeMax > 0 ? totalFormativeEarned / totalFormativeMax : 0;
      const computedClassScore = Math.round(caRatio * 30 * 10) / 10; // e.g. 26.5 / 30

      // Exam calculations (scaled out of 70)
      let examScore = 0;
      let examCount = 0;
      examTasks.forEach(task => {
        const sub = studentSubs.find(s => s.assessmentId === task.id);
        if (sub && typeof sub.totalScore === 'number') {
          const ratio = task.maxScore > 0 ? sub.totalScore / task.maxScore : 0;
          examScore = Math.round(ratio * 70 * 10) / 10;
          examCount++;
        }
      });

      const totalScore = Math.min(100, Math.round((computedClassScore + examScore) * 10) / 10);
      const gradeResult = calculateGrade(totalScore);

      return {
        student,
        formativeCount,
        examCount,
        computedClassScore,
        examScore,
        totalScore,
        grade: gradeResult.grade,
        remarks: gradeResult.remarks
      };
    });
  }, [classStudents, submissions, formativeTasks, examTasks]);

  const handleCommitSync = async () => {
    setSyncing(true);
    try {
      let updatedCount = 0;

      for (const row of studentSyncRows) {
        const studentId = row.student.studentId;

        // Check if a result already exists in db.results
        const existingResult = await db.results
          .where('[studentId+subject+term]')
          .equals([studentId, currentSubject, term])
          .first();

        if (existingResult && existingResult.id) {
          await db.results.update(existingResult.id, {
            classScore: row.computedClassScore,
            examScore: row.examScore > 0 ? row.examScore : existingResult.examScore,
            totalScore: Math.min(
              100,
              row.computedClassScore + (row.examScore > 0 ? row.examScore : existingResult.examScore)
            ),
            grade: row.grade,
            remarks: row.remarks
          });
          updatedCount++;
        } else {
          // Create new record
          await db.results.add({
            studentId,
            subject: currentSubject,
            term,
            class: currentClass,
            classScore: row.computedClassScore,
            examScore: row.examScore,
            totalScore: row.totalScore,
            grade: row.grade,
            remarks: row.remarks
          });
          updatedCount++;
        }
      }

      setSyncComplete(true);
      showToast(
        `Successfully synced continuous assessment (SBA) for ${updatedCount} student(s) into Results Terminal!`,
        'success'
      );
    } catch (err: any) {
      console.error('Error syncing terminal SBA:', err);
      showToast('Failed to sync SBA: ' + err.message, 'error');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900">
                Sync to Terminal Continuous Assessment (SBA)
              </h2>
              <p className="text-xs text-slate-500">
                Aggregate graded Homework, Classwork & Tests into terminal marksheet records
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {/* Target Parameters Ribbon */}
          <div className="p-3.5 bg-emerald-50/70 border border-emerald-200/80 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs text-emerald-950">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-1.5">
                <span className="text-emerald-700 font-medium">Class: </span>
                {classes.length > 0 ? (
                  <select
                    value={currentClass}
                    onChange={e => setCurrentClass(e.target.value)}
                    className="font-bold bg-white border border-emerald-300 rounded px-2 py-0.5"
                  >
                    {classes.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                ) : (
                  <span className="font-bold">{currentClass}</span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-emerald-700 font-medium">Subject: </span>
                {subjects.length > 0 ? (
                  <select
                    value={currentSubject}
                    onChange={e => setCurrentSubject(e.target.value)}
                    className="font-bold bg-white border border-emerald-300 rounded px-2 py-0.5"
                  >
                    {subjects.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                ) : (
                  <span className="font-bold">{currentSubject}</span>
                )}
              </div>
              <div>
                <span className="text-emerald-700 font-medium">Term: </span>
                <span className="font-bold">{term} ({academicYear})</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="bg-white px-2.5 py-1 rounded-md font-mono font-bold text-emerald-800 border border-emerald-200">
                {formativeTasks.length} Formative Tasks
              </span>
              <span className="bg-white px-2.5 py-1 rounded-md font-mono font-bold text-indigo-800 border border-indigo-200">
                {examTasks.length} Exam Task(s)
              </span>
            </div>
          </div>

          {/* Sync Table */}
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="max-h-80 overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200 sticky top-0">
                  <tr>
                    <th className="px-3.5 py-2.5">Student</th>
                    <th className="px-3.5 py-2.5">Tasks Graded</th>
                    <th className="px-3.5 py-2.5 text-right">Computed CA (30%)</th>
                    <th className="px-3.5 py-2.5 text-right">Exam Score (70%)</th>
                    <th className="px-3.5 py-2.5 text-right">Total Score</th>
                    <th className="px-3.5 py-2.5 text-center">Grade</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {studentSyncRows.map(row => (
                    <tr key={row.student.studentId} className="hover:bg-slate-50/70">
                      <td className="px-3.5 py-2.5">
                        <p className="font-bold text-slate-900">
                          {row.student.firstName} {row.student.lastName}
                        </p>
                        <p className="text-[11px] text-slate-400 font-mono">{row.student.studentId}</p>
                      </td>
                      <td className="px-3.5 py-2.5">
                        <span className="text-slate-600">
                          {row.formativeCount} of {formativeTasks.length}
                        </span>
                      </td>
                      <td className="px-3.5 py-2.5 text-right font-mono font-bold text-emerald-700">
                        {row.computedClassScore} / 30
                      </td>
                      <td className="px-3.5 py-2.5 text-right font-mono font-bold text-indigo-700">
                        {row.examScore > 0 ? `${row.examScore} / 70` : '-'}
                      </td>
                      <td className="px-3.5 py-2.5 text-right font-mono font-extrabold text-slate-900">
                        {row.totalScore}
                      </td>
                      <td className="px-3.5 py-2.5 text-center font-mono font-bold">
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-800">
                          {row.grade}
                        </span>
                      </td>
                    </tr>
                  ))}

                  {studentSyncRows.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-slate-400">
                        No students found in class {targetClass}.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl text-xs text-slate-600 flex items-start gap-2">
            <Database className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <span>
              Clicking commit will write these Continuous Assessment (SBA) values directly into{' '}
              <strong>ResultsTerminal</strong> for terminal report card generation and WAEC/GES continuous assessment compliance.
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="text-xs text-slate-500">
            {syncComplete && (
              <span className="text-emerald-700 font-bold flex items-center gap-1">
                <Check className="w-4 h-4" /> Sync successfully committed!
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 rounded-xl cursor-pointer"
            >
              {syncComplete ? 'Done' : 'Cancel'}
            </button>
            <button
              onClick={handleCommitSync}
              disabled={syncing || studentSyncRows.length === 0}
              className="px-5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <RefreshCcw className={cn('w-3.5 h-3.5', syncing && 'animate-spin')} />
              <span>{syncing ? 'Syncing...' : 'Commit & Sync to Terminal Marksheet'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
export default TerminalSbaSyncModal;
