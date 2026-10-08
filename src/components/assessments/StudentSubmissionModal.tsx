import React, { useState } from 'react';
import {
  X,
  FileText,
  Upload,
  Paperclip,
  CheckCircle2,
  AlertCircle,
  Calendar,
  Award,
  Send,
  Trash2,
  Download,
  Check,
  Eye
} from 'lucide-react';
import type {
  Assessment,
  AssessmentSubmission,
  AssessmentAttachment
} from '../../db/schema';
import { CATEGORY_CONFIG } from './AssessmentCard';
import { cn } from '../../lib/utils';

interface StudentSubmissionModalProps {
  isOpen: boolean;
  onClose: () => void;
  assessment: Assessment;
  existingSubmission?: AssessmentSubmission;
  studentId: string;
  studentName: string;
  studentClass: string;
  onSubmit: (submission: AssessmentSubmission) => Promise<void>;
}

export const StudentSubmissionModal: React.FC<StudentSubmissionModalProps> = ({
  isOpen,
  onClose,
  assessment,
  existingSubmission,
  studentId,
  studentName,
  studentClass,
  onSubmit
}) => {
  if (!isOpen) return null;

  const [content, setContent] = useState(existingSubmission?.content || '');
  const [attachments, setAttachments] = useState<AssessmentAttachment[]>(
    existingSubmission?.attachments || []
  );
  const [newFileName, setNewFileName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [activeTab, setActiveTab] = useState<'details' | 'rubric' | 'submit'>('submit');

  const category = CATEGORY_CONFIG[assessment.category] || CATEGORY_CONFIG.homework;
  const isGraded = existingSubmission?.status === 'graded' || existingSubmission?.status === 'returned';

  const handleAddFile = () => {
    if (!newFileName.trim()) return;
    setAttachments([
      ...attachments,
      {
        name: newFileName.trim(),
        url: '#',
        size: 180000,
        type: 'application/pdf'
      }
    ]);
    setNewFileName('');
  };

  const handleSimulateFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const fileList: AssessmentAttachment[] = [];
    for (let i = 0; i < files.length; i++) {
      fileList.push({
        name: files[i].name,
        url: '#',
        size: files[i].size,
        type: files[i].type || 'document'
      });
    }
    setAttachments([...attachments, ...fileList]);
  };

  const handleRemoveFile = (index: number) => {
    if (isGraded) return;
    setAttachments(attachments.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isGraded) return;

    if (!content.trim() && attachments.length === 0) {
      setErrorMsg('Please write an answer or upload at least one submission attachment.');
      return;
    }

    setSubmitting(true);
    setErrorMsg('');
    try {
      const payload: AssessmentSubmission = {
        id: existingSubmission?.id || `sub-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        schoolId: assessment.schoolId,
        assessmentId: assessment.id,
        studentId,
        studentName,
        class: studentClass || assessment.class,
        status: 'submitted',
        submittedAt: Date.now(),
        content: content.trim(),
        attachments,
        rubricScores: existingSubmission?.rubricScores,
        totalScore: existingSubmission?.totalScore,
        grade: existingSubmission?.grade,
        feedback: existingSubmission?.feedback,
        gradedBy: existingSubmission?.gradedBy,
        gradedAt: existingSubmission?.gradedAt
      };

      await onSubmit(payload);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to submit assessment work.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-start justify-between bg-slate-50/80">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className={cn('px-2.5 py-0.5 rounded text-xs font-bold uppercase', category.bg)}>
                {category.icon} {category.label}
              </span>
              <span className="text-xs text-slate-500 font-medium">
                {assessment.subject} · {assessment.class}
              </span>
            </div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900">{assessment.title}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Controls */}
        <div className="px-6 pt-2 border-b border-slate-100 flex items-center gap-4 bg-white text-xs font-semibold">
          <button
            onClick={() => setActiveTab('submit')}
            className={cn(
              'pb-2.5 border-b-2 transition-colors cursor-pointer',
              activeTab === 'submit'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            )}
          >
            {isGraded ? 'Review Submission & Grade' : 'My Submission'}
          </button>
          <button
            onClick={() => setActiveTab('details')}
            className={cn(
              'pb-2.5 border-b-2 transition-colors cursor-pointer',
              activeTab === 'details'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            )}
          >
            Instructions & Files
          </button>
          <button
            onClick={() => setActiveTab('rubric')}
            className={cn(
              'pb-2.5 border-b-2 transition-colors cursor-pointer',
              activeTab === 'rubric'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            )}
          >
            Grading Rubric ({assessment.rubric?.length || 0})
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1 text-sm">
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Graded Banner if already evaluated */}
          {isGraded && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  <span className="font-bold text-emerald-900">Graded by {existingSubmission?.gradedBy || 'Teacher'}</span>
                </div>
                <div className="text-right">
                  <span className="text-xl font-mono font-extrabold text-emerald-800">
                    {existingSubmission?.totalScore} / {assessment.maxScore}
                  </span>
                  {existingSubmission?.grade && (
                    <span className="ml-2 px-2 py-0.5 bg-emerald-200 text-emerald-900 rounded font-bold text-xs">
                      Grade: {existingSubmission.grade}
                    </span>
                  )}
                </div>
              </div>
              {existingSubmission?.feedback && (
                <div className="mt-2 pt-2 border-t border-emerald-200/60 text-xs text-emerald-800 leading-relaxed">
                  <span className="font-bold">Teacher Feedback: </span>
                  {existingSubmission.feedback}
                </div>
              )}
            </div>
          )}

          {/* TAB 1: Instructions & Files */}
          {activeTab === 'details' && (
            <div className="space-y-4">
              <div>
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  Instructions & Requirements
                </h4>
                <div className="p-4 bg-slate-50 border border-slate-200/70 rounded-xl text-slate-800 text-xs sm:text-sm leading-relaxed whitespace-pre-wrap">
                  {assessment.description || 'No detailed instructions provided.'}
                </div>
              </div>

              {assessment.attachments && assessment.attachments.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                    Teacher Reference Attachments
                  </h4>
                  <div className="space-y-2">
                    {assessment.attachments.map((att, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200/70 rounded-xl text-xs"
                      >
                        <div className="flex items-center gap-2 text-slate-800">
                          <Paperclip className="w-4 h-4 text-emerald-600" />
                          <span className="font-semibold">{att.name}</span>
                        </div>
                        <span className="text-[11px] text-slate-400">Reference Doc</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-800 flex items-center justify-between">
                <span>Due Date: {assessment.dueDate}</span>
                <span className="font-mono font-bold">{assessment.maxScore} Max Points</span>
              </div>
            </div>
          )}

          {/* TAB 2: Grading Rubric Expectations */}
          {activeTab === 'rubric' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                <span>Evaluated across {assessment.rubric?.length || 0} criteria</span>
                <span className="font-mono font-bold text-slate-900">Total: {assessment.maxScore} Pts</span>
              </div>

              {assessment.rubric?.map((crit, idx) => {
                const awarded = existingSubmission?.rubricScores?.[crit.id];
                return (
                  <div
                    key={crit.id || idx}
                    className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-slate-900">
                        {idx + 1}. {crit.criterion}
                      </span>
                      <div className="text-xs font-mono font-bold">
                        {isGraded && awarded !== undefined ? (
                          <span className="text-emerald-700">
                            {awarded} / {crit.maxPoints} pts
                          </span>
                        ) : (
                          <span className="text-slate-600">{crit.maxPoints} pts max</span>
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-slate-600">{crit.description}</p>
                  </div>
                );
              })}
            </div>
          )}

          {/* TAB 3: Student Turn In Form */}
          {activeTab === 'submit' && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Your Answer / Submission Text
                </label>
                <textarea
                  rows={5}
                  disabled={isGraded}
                  value={content}
                  onChange={e => setContent(e.target.value)}
                  placeholder="Type your answers, explanation, or submission notes here..."
                  className="w-full px-3.5 py-2.5 text-xs sm:text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/30 disabled:bg-slate-50"
                />
              </div>

              {/* Attachments Section */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Attachments (Documents, PDF, Photos of handwritten work)
                </label>

                {attachments.length > 0 && (
                  <div className="space-y-2 mb-3">
                    {attachments.map((file, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-200/80 rounded-xl text-xs"
                      >
                        <div className="flex items-center gap-2 text-slate-800">
                          <Paperclip className="w-3.5 h-3.5 text-emerald-600" />
                          <span className="font-medium">{file.name}</span>
                          <span className="text-[10px] text-slate-400">
                            ({Math.round(file.size / 1024)} KB)
                          </span>
                        </div>
                        {!isGraded && (
                          <button
                            type="button"
                            onClick={() => handleRemoveFile(idx)}
                            className="p-1 text-slate-400 hover:text-red-600 rounded transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {!isGraded && (
                  <div className="space-y-2">
                    <label className="border border-dashed border-slate-300 hover:border-emerald-500 hover:bg-emerald-50/40 rounded-xl p-4 flex flex-col items-center justify-center text-xs text-slate-600 cursor-pointer transition-colors">
                      <Upload className="w-5 h-5 text-slate-400 mb-1" />
                      <span className="font-semibold text-slate-800">Click to upload document or image</span>
                      <span className="text-[11px] text-slate-400">PDF, DOCX, PNG, JPG accepted</span>
                      <input
                        type="file"
                        multiple
                        className="hidden"
                        onChange={handleSimulateFileUpload}
                      />
                    </label>

                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="Or enter filename (e.g. math_homework_part2.pdf)"
                        value={newFileName}
                        onChange={e => setNewFileName(e.target.value)}
                        className="flex-1 px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                      />
                      <button
                        type="button"
                        onClick={handleAddFile}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold cursor-pointer"
                      >
                        Attach
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                <div className="text-xs text-slate-500">
                  {existingSubmission?.submittedAt
                    ? `Last submitted: ${new Date(existingSubmission.submittedAt).toLocaleDateString()}`
                    : 'Not yet submitted'}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 rounded-xl cursor-pointer"
                  >
                    Close
                  </button>
                  {!isGraded && (
                    <button
                      type="submit"
                      disabled={submitting}
                      className="px-5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>{submitting ? 'Submitting...' : existingSubmission ? 'Update Work' : 'Turn In Work'}</span>
                    </button>
                  )}
                </div>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
export default StudentSubmissionModal;
