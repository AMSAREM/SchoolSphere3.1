import React from 'react';
import {
  FileText,
  Calendar,
  Clock,
  Paperclip,
  CheckCircle2,
  AlertCircle,
  Eye,
  Edit,
  Trash2,
  Award,
  Users,
  ChevronRight,
  BookOpen,
  Check,
  Sparkles
} from 'lucide-react';
import type { Assessment, AssessmentSubmission } from '../../db/schema';
import { cn } from '../../lib/utils';

interface AssessmentCardProps {
  assessment: Assessment;
  submissions: AssessmentSubmission[];
  userRole?: string;
  studentId?: string;
  onEdit?: (assessment: Assessment) => void;
  onDelete?: (assessmentId: string) => void;
  onGrade?: (assessment: Assessment) => void;
  onSubmitWork?: (assessment: Assessment, existingSubmission?: AssessmentSubmission) => void;
  onViewFeedback?: (assessment: Assessment, submission: AssessmentSubmission) => void;
}

export const CATEGORY_CONFIG: Record<
  string,
  { label: string; bg: string; text: string; border: string; icon: string }
> = {
  homework: {
    label: 'Homework',
    bg: 'bg-emerald-50 text-emerald-700',
    text: 'text-emerald-700',
    border: 'border-emerald-200',
    icon: '📝'
  },
  classwork: {
    label: 'Classwork',
    bg: 'bg-blue-50 text-blue-700',
    text: 'text-blue-700',
    border: 'border-blue-200',
    icon: '📚'
  },
  class_test: {
    label: 'Class Test',
    bg: 'bg-amber-50 text-amber-700',
    text: 'text-amber-700',
    border: 'border-amber-200',
    icon: '⏱️'
  },
  examination: {
    label: 'Examination',
    bg: 'bg-indigo-50 text-indigo-700',
    text: 'text-indigo-700',
    border: 'border-indigo-200',
    icon: '🏛️'
  }
};

export const AssessmentCard: React.FC<AssessmentCardProps> = ({
  assessment,
  submissions,
  userRole,
  studentId,
  onEdit,
  onDelete,
  onGrade,
  onSubmitWork,
  onViewFeedback
}) => {
  const isStudent = userRole === 'student';
  const isStaff = !isStudent;

  const category = CATEGORY_CONFIG[assessment.category] || CATEGORY_CONFIG.homework;

  // Due date calculations
  const dueDateObj = new Date(assessment.dueDate);
  const isOverdue = !isNaN(dueDateObj.getTime()) && dueDateObj.getTime() < Date.now();
  const formattedDueDate = !isNaN(dueDateObj.getTime())
    ? dueDateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : assessment.dueDate;

  // Student specific submission
  const mySubmission = studentId
    ? submissions.find(s => s.studentId === studentId)
    : undefined;

  // Submission statistics for teachers
  const totalSubmissions = submissions.length;
  const gradedCount = submissions.filter(s => s.status === 'graded' || s.status === 'returned').length;
  const pendingGradingCount = submissions.filter(s => s.status === 'submitted').length;

  return (
    <div className="group bg-white rounded-2xl border border-slate-200/80 hover:border-emerald-500/50 hover:shadow-lg transition-all duration-200 flex flex-col justify-between overflow-hidden">
      {/* Top Banner Accent */}
      <div className="p-5 sm:p-6 pb-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold uppercase tracking-wider',
                category.bg
              )}
            >
              <span>{category.icon}</span>
              {category.label}
            </span>

            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700">
              {assessment.subject}
            </span>

            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700">
              Class: {assessment.class}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <span className="text-xs font-mono font-bold text-slate-900 bg-slate-100 px-2.5 py-1 rounded-md">
              {assessment.maxScore} pts ({assessment.weightPercentage || 10}%)
            </span>
          </div>
        </div>

        {/* Title */}
        <h3 className="text-base sm:text-lg font-bold text-slate-900 group-hover:text-emerald-700 transition-colors line-clamp-2 mb-2">
          {assessment.title}
        </h3>

        {/* Description */}
        <p className="text-xs sm:text-sm text-slate-600 line-clamp-2 mb-4 leading-relaxed">
          {assessment.description || 'No specific instructions provided.'}
        </p>

        {/* Metadata info */}
        <div className="grid grid-cols-2 gap-2 text-xs text-slate-500 pt-3 border-t border-slate-100">
          <div className="flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <span className={cn(isOverdue ? 'text-amber-600 font-medium' : '')}>
              Due: {formattedDueDate}
            </span>
          </div>

          <div className="flex items-center gap-1.5 justify-end">
            <Award className="w-3.5 h-3.5 text-slate-400" />
            <span>{assessment.rubric?.length || 0} Rubric Criteria</span>
          </div>

          {assessment.attachments && assessment.attachments.length > 0 && (
            <div className="col-span-2 flex items-center gap-1.5 text-slate-600">
              <Paperclip className="w-3.5 h-3.5 text-slate-400" />
              <span>{assessment.attachments.length} file attachment(s)</span>
            </div>
          )}
        </div>
      </div>

      {/* Role-Specific Action Strip */}
      <div className="px-5 sm:px-6 py-3.5 bg-slate-50/70 border-t border-slate-100 flex items-center justify-between gap-3">
        {isStudent ? (
          // Student view actions
          mySubmission ? (
            mySubmission.status === 'graded' || mySubmission.status === 'returned' ? (
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Graded: {mySubmission.totalScore}/{assessment.maxScore}
                  </span>
                  {mySubmission.grade && (
                    <span className="text-xs font-mono font-bold text-emerald-700">
                      Grade: {mySubmission.grade}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => onViewFeedback && onViewFeedback(assessment, mySubmission)}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800 hover:underline cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5" />
                  View Rubric Breakdown
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between w-full">
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700">
                  <Check className="w-3.5 h-3.5" />
                  Turned In (Awaiting Grading)
                </span>
                <button
                  onClick={() => onSubmitWork && onSubmitWork(assessment, mySubmission)}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-white border border-slate-200 px-3 py-1.5 rounded-lg shadow-xs hover:bg-slate-50 cursor-pointer"
                >
                  <Edit className="w-3.5 h-3.5" />
                  Update Work
                </button>
              </div>
            )
          ) : (
            <div className="flex items-center justify-between w-full">
              <span className="text-xs font-medium text-slate-500">
                {isOverdue ? 'Overdue - Not Turned In' : 'Pending Submission'}
              </span>
              <button
                onClick={() => onSubmitWork && onSubmitWork(assessment)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 px-3.5 py-1.5 rounded-lg shadow-xs transition-colors cursor-pointer"
              >
                <span>Turn In Work</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )
        ) : (
          // Teacher / Admin actions
          <>
            <div className="flex items-center gap-2 text-xs">
              <span className="inline-flex items-center gap-1 text-slate-700 font-medium">
                <Users className="w-3.5 h-3.5 text-slate-400" />
                {totalSubmissions} turned in
              </span>
              {pendingGradingCount > 0 && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-semibold bg-amber-100 text-amber-800">
                  {pendingGradingCount} unread
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => onGrade && onGrade(assessment)}
                className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200/80 px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
                title="Review & Grade Submissions"
              >
                <Award className="w-3.5 h-3.5" />
                <span>Grade ({pendingGradingCount})</span>
              </button>

              {onEdit && (
                <button
                  onClick={() => onEdit(assessment)}
                  className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-200/70 rounded-lg transition-colors cursor-pointer"
                  title="Edit Assessment"
                >
                  <Edit className="w-3.5 h-3.5" />
                </button>
              )}

              {onDelete && (
                <button
                  onClick={() => onDelete(assessment.id)}
                  className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                  title="Delete Assessment"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
export default AssessmentCard;
