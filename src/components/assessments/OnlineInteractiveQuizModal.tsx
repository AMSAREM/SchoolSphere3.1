import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Clock,
  CheckCircle2,
  AlertCircle,
  Flag,
  ChevronLeft,
  ChevronRight,
  Send,
  HelpCircle,
  Award,
  RefreshCcw,
  BookOpen,
  ArrowRight
} from 'lucide-react';
import type {
  Assessment,
  AssessmentQuestion,
  AssessmentSubmission,
  AssessmentSubmissionAnswer
} from '../../db/schema';
import { cn } from '../../lib/utils';

interface OnlineInteractiveQuizModalProps {
  isOpen: boolean;
  onClose: () => void;
  assessment: Assessment;
  studentId: string;
  studentName: string;
  studentClass: string;
  existingSubmission?: AssessmentSubmission;
  onSubmitQuiz: (submission: AssessmentSubmission) => Promise<void>;
  isPreviewMode?: boolean;
}

export const OnlineInteractiveQuizModal: React.FC<OnlineInteractiveQuizModalProps> = ({
  isOpen,
  onClose,
  assessment,
  studentId,
  studentName,
  studentClass,
  existingSubmission,
  onSubmitQuiz,
  isPreviewMode = false
}) => {
  if (!isOpen) return null;

  const questions: AssessmentQuestion[] = useMemo(() => {
    return assessment.questions && assessment.questions.length > 0
      ? assessment.questions
      : [];
  }, [assessment.questions]);

  // Current question index
  const [currentIndex, setCurrentIndex] = useState(0);

  // Answers map
  const storageKey = `schoolsphere_quiz_answers_${assessment.id}_${studentId}`;

  const [answers, setAnswers] = useState<Record<string, { answer: string | number; isOptionIndex?: boolean }>>(() => {
    if (existingSubmission?.answers) {
      const init: Record<string, { answer: string | number; isOptionIndex?: boolean }> = {};
      Object.entries(existingSubmission.answers).forEach(([qId, ans]) => {
        init[qId] = {
          answer: ans.studentAnswer,
          isOptionIndex: typeof ans.studentAnswer === 'number'
        };
      });
      return init;
    }

    try {
      const cached = localStorage.getItem(storageKey);
      if (cached) return JSON.parse(cached);
    } catch (e) {
      // ignore
    }
    return {};
  });

  // Flagged questions for review
  const [flaggedIds, setFlaggedIds] = useState<Set<string>>(new Set());

  // Timer state
  const initialDurationSeconds = (assessment.durationMinutes || 45) * 60;
  const [secondsRemaining, setSecondsRemaining] = useState(initialDurationSeconds);
  const [isTimeUp, setIsTimeUp] = useState(false);

  // Submission state
  const [isConfirmSubmitOpen, setIsConfirmSubmitOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showResultsScreen, setShowResultsScreen] = useState(
    existingSubmission?.status === 'graded' || existingSubmission?.status === 'submitted'
  );
  const [submittedResult, setSubmittedResult] = useState<AssessmentSubmission | null>(
    existingSubmission || null
  );

  // Sync answers to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(answers));
    } catch (e) {
      // ignore
    }
  }, [answers, storageKey]);

  // Timer countdown
  useEffect(() => {
    if (showResultsScreen || isPreviewMode) return;

    const timer = setInterval(() => {
      setSecondsRemaining(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          setIsTimeUp(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [showResultsScreen, isPreviewMode]);

  // Format time display
  const formattedTime = useMemo(() => {
    const mins = Math.floor(secondsRemaining / 60);
    const secs = secondsRemaining % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }, [secondsRemaining]);

  const currentQ = questions[currentIndex];

  // Set answer for current question
  const handleSelectOption = (qId: string, optionIndex: number) => {
    if (showResultsScreen) return;
    setAnswers(prev => ({
      ...prev,
      [qId]: { answer: optionIndex, isOptionIndex: true }
    }));
  };

  const handleSetTextAnswer = (qId: string, text: string) => {
    if (showResultsScreen) return;
    setAnswers(prev => ({
      ...prev,
      [qId]: { answer: text, isOptionIndex: false }
    }));
  };

  // Keyboard shortcut listener for options (A, B, C, D)
  useEffect(() => {
    if (!currentQ || currentQ.type !== 'multiple_choice' || showResultsScreen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if typing in an input
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;

      const key = e.key.toUpperCase();
      let selectedIdx = -1;
      if (key === 'A' || key === '1') selectedIdx = 0;
      else if (key === 'B' || key === '2') selectedIdx = 1;
      else if (key === 'C' || key === '3') selectedIdx = 2;
      else if (key === 'D' || key === '4') selectedIdx = 3;

      if (selectedIdx >= 0 && currentQ.options && selectedIdx < currentQ.options.length) {
        handleSelectOption(currentQ.id, selectedIdx);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentQ, showResultsScreen]);

  // Toggle flag
  const toggleFlag = (qId: string) => {
    setFlaggedIds(prev => {
      const next = new Set(prev);
      if (next.has(qId)) next.delete(qId);
      else next.add(qId);
      return next;
    });
  };

  // Summary counts
  const answeredCount = Object.keys(answers).filter(qId => {
    const a = answers[qId];
    if (a.isOptionIndex) return typeof a.answer === 'number';
    return String(a.answer || '').trim().length > 0;
  }).length;

  const unansweredCount = Math.max(0, questions.length - answeredCount);

  // Submit Quiz Final Action
  const handleFinalSubmit = async () => {
    setIsSubmitting(true);

    const submissionAnswers: Record<string, AssessmentSubmissionAnswer> = {};
    let mcqEarnedPoints = 0;
    let allQuestionsAreMcq = true;

    questions.forEach(q => {
      const record = answers[q.id];
      const studentVal = record ? record.answer : '';

      if (q.type === 'multiple_choice') {
        const isCorrect = typeof studentVal === 'number' && studentVal === q.correctOptionIndex;
        const awarded = isCorrect ? q.points : 0;
        mcqEarnedPoints += awarded;

        submissionAnswers[q.id] = {
          questionId: q.id,
          studentAnswer: studentVal,
          pointsAwarded: awarded,
          isCorrect,
          feedback: isCorrect ? 'Correct' : q.explanation || `Correct answer is Option ${String.fromCharCode(65 + (q.correctOptionIndex || 0))}`
        };
      } else {
        allQuestionsAreMcq = false;
        submissionAnswers[q.id] = {
          questionId: q.id,
          studentAnswer: studentVal,
          pointsAwarded: 0,
          feedback: 'Awaiting teacher evaluation'
        };
      }
    });

    const isFullyGraded = allQuestionsAreMcq;
    const finalScore = isFullyGraded ? mcqEarnedPoints : undefined;

    const newSub: AssessmentSubmission = {
      id: existingSubmission?.id || `sub-${assessment.id}-${studentId}-${Date.now()}`,
      schoolId: assessment.schoolId,
      assessmentId: assessment.id,
      studentId,
      studentName,
      class: studentClass,
      status: isFullyGraded ? 'graded' : 'submitted',
      submittedAt: Date.now(),
      content: `Completed interactive quiz (${answeredCount} questions answered).`,
      answers: submissionAnswers,
      totalScore: finalScore,
      grade: isFullyGraded && assessment.maxScore > 0
        ? `${Math.round((mcqEarnedPoints / assessment.maxScore) * 100)}%`
        : undefined,
      feedback: isFullyGraded ? 'Automatically graded Multiple Choice Quiz.' : 'Submitted for teacher grading.'
    };

    try {
      await onSubmitQuiz(newSub);
      setSubmittedResult(newSub);
      setShowResultsScreen(true);
      setIsConfirmSubmitOpen(false);
      try {
        localStorage.removeItem(storageKey);
      } catch (e) {
        // ignore
      }
    } catch (err) {
      console.error('Failed to submit quiz:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/75 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-[#f6f8f7] w-full max-w-5xl h-[94vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-[#bac4c6]/40">
        {/* Top Header Bar */}
        <div className="bg-[#1c4a59] text-white px-5 sm:px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#faae57] text-[#1f2a2e] flex items-center justify-center font-bold shadow-xs">
              <Award className="w-5 h-5 text-[#1f2a2e]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-white line-clamp-1">
                  {assessment.title}
                </h2>
                {isPreviewMode && (
                  <span className="text-[10px] font-bold uppercase bg-amber-400 text-amber-950 px-2 py-0.5 rounded-full">
                    Teacher Preview
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-300">
                {assessment.subject} • {assessment.class} • Candidate: {studentName}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Live Timer Pill */}
            {!showResultsScreen && !isPreviewMode && (
              <div
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-full font-mono font-bold text-xs shadow-xs',
                  secondsRemaining < 300
                    ? 'bg-red-500 text-white animate-pulse'
                    : 'bg-white/15 text-white'
                )}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>{formattedTime}</span>
              </div>
            )}

            <button
              onClick={onClose}
              className="p-1.5 text-slate-300 hover:text-white hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Sub-Header Navigation Strip */}
        {!showResultsScreen && questions.length > 0 && (
          <div className="bg-white px-5 py-3 border-b border-slate-200/80 flex items-center justify-between gap-3 overflow-x-auto shrink-0">
            <div className="flex items-center gap-1.5 overflow-x-auto py-1">
              {questions.map((q, idx) => {
                const ans = answers[q.id];
                const isAnswered = ans && (ans.isOptionIndex ? typeof ans.answer === 'number' : String(ans.answer).trim().length > 0);
                const isFlagged = flaggedIds.has(q.id);
                const isActive = currentIndex === idx;

                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => setCurrentIndex(idx)}
                    className={cn(
                      'w-8 h-8 rounded-lg text-xs font-bold transition-all flex items-center justify-center cursor-pointer relative shrink-0',
                      isActive
                        ? 'bg-[#1c4a59] text-white ring-2 ring-[#faae57]'
                        : isFlagged
                        ? 'bg-[#faae57] text-[#1f2a2e]'
                        : isAnswered
                        ? 'bg-[#06d6a0] text-[#1f2a2e]'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    )}
                    title={`Question ${idx + 1}`}
                  >
                    {idx + 1}
                    {isFlagged && (
                      <span className="w-2 h-2 rounded-full bg-red-600 absolute -top-1 -right-1" />
                    )}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs text-slate-500 hidden sm:inline">
                {answeredCount}/{questions.length} answered
              </span>
              <button
                type="button"
                onClick={() => setIsConfirmSubmitOpen(true)}
                className="bg-[#faae57] hover:bg-[#e4ae67] text-[#1f2a2e] text-xs font-bold px-4 py-1.5 rounded-full shadow-xs transition-colors cursor-pointer"
              >
                Finish & Submit
              </button>
            </div>
          </div>
        )}

        {/* Main Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 flex flex-col justify-between">
          {showResultsScreen && submittedResult ? (
            /* Results Screen */
            <div className="max-w-2xl mx-auto w-full my-auto text-center space-y-6">
              <div className="w-16 h-16 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto shadow-xs">
                <CheckCircle2 className="w-10 h-10" />
              </div>

              <div>
                <h3 className="text-2xl font-bold text-[#1f2a2e]">Quiz Completed!</h3>
                <p className="text-xs text-[#6a7f84] mt-1">
                  Your submission has been recorded securely in SchoolSphere.
                </p>
              </div>

              {submittedResult.totalScore !== undefined && (
                <div className="bg-white rounded-3xl p-6 border border-[#bac4c6]/40 shadow-xs max-w-sm mx-auto">
                  <span className="text-xs uppercase font-bold text-[#6a7f84] tracking-wider">
                    Your Score
                  </span>
                  <div className="text-4xl font-bold font-mono text-[#1c4a59] my-2">
                    {submittedResult.totalScore} / {assessment.maxScore}
                  </div>
                  <div className="text-sm font-bold text-[#06d6a0]">
                    Grade: {submittedResult.grade || 'Passed'}
                  </div>
                </div>
              )}

              {/* Question breakdown */}
              <div className="text-left bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 text-xs space-y-3 max-h-72 overflow-y-auto">
                <h4 className="font-bold text-[#1f2a2e] text-sm mb-2">Question Review</h4>
                {questions.map((q, idx) => {
                  const ansRecord = submittedResult.answers?.[q.id];
                  const isCorrect = ansRecord?.isCorrect;

                  return (
                    <div
                      key={q.id}
                      className={cn(
                        'p-3 rounded-xl border',
                        isCorrect
                          ? 'bg-emerald-50/50 border-emerald-200'
                          : q.type === 'multiple_choice'
                          ? 'bg-red-50/50 border-red-200'
                          : 'bg-slate-50 border-slate-200'
                      )}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="font-bold text-slate-800">
                          Q{idx + 1}. {q.prompt}
                        </span>
                        <span className="font-mono font-bold text-slate-700">
                          {ansRecord?.pointsAwarded || 0}/{q.points} pts
                        </span>
                      </div>

                      {q.type === 'multiple_choice' && (
                        <div className="mt-1 text-slate-600">
                          <span>Your answer: </span>
                          <strong className="text-slate-900">
                            {typeof ansRecord?.studentAnswer === 'number' && q.options
                              ? `${String.fromCharCode(65 + ansRecord.studentAnswer)}: ${q.options[ansRecord.studentAnswer]}`
                              : 'No answer selected'}
                          </strong>
                          {!isCorrect && (
                            <div className="text-emerald-800 mt-0.5">
                              Correct answer:{' '}
                              <strong>
                                {q.options && typeof q.correctOptionIndex === 'number'
                                  ? `${String.fromCharCode(65 + q.correctOptionIndex)}: ${q.options[q.correctOptionIndex]}`
                                  : q.correctAnswer}
                              </strong>
                            </div>
                          )}
                        </div>
                      )}

                      {q.explanation && (
                        <p className="mt-1.5 text-slate-500 italic">
                          💡 {q.explanation}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={onClose}
                className="bg-[#1c4a59] text-white px-6 py-2.5 rounded-full text-xs font-bold hover:bg-[#1c4a59]/90 transition-colors cursor-pointer"
              >
                Close & Return
              </button>
            </div>
          ) : !currentQ ? (
            <div className="text-center py-12">
              <BookOpen className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-700">No questions available in this test.</p>
            </div>
          ) : (
            /* Active Question View */
            <div className="max-w-3xl mx-auto w-full space-y-6">
              {/* Question metadata card */}
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-[#6a7f84] uppercase tracking-wider">
                    Question {currentIndex + 1} of {questions.length}
                  </span>
                  <span
                    className={cn(
                      'text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full',
                      currentQ.type === 'multiple_choice'
                        ? 'bg-amber-100 text-amber-800'
                        : currentQ.type === 'short_answer'
                        ? 'bg-teal-100 text-teal-800'
                        : 'bg-indigo-100 text-indigo-800'
                    )}
                  >
                    {currentQ.type.replace('_', ' ')}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => toggleFlag(currentQ.id)}
                    className={cn(
                      'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border transition-all cursor-pointer',
                      flaggedIds.has(currentQ.id)
                        ? 'bg-[#faae57] text-[#1f2a2e] border-[#faae57]'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    )}
                  >
                    <Flag className="w-3.5 h-3.5" />
                    <span>{flaggedIds.has(currentQ.id) ? 'Flagged' : 'Flag for Review'}</span>
                  </button>
                  <span className="text-xs font-mono font-bold text-slate-800 bg-white border border-slate-200 px-2.5 py-1 rounded-full shadow-2xs">
                    {currentQ.points} {currentQ.points === 1 ? 'pt' : 'pts'}
                  </span>
                </div>
              </div>

              {/* Question Prompt */}
              <div className="bg-white rounded-3xl p-6 sm:p-7 shadow-xs border border-[#bac4c6]/40">
                <h3 className="text-base sm:text-lg font-medium text-[#1f2a2e] leading-relaxed">
                  {currentQ.prompt}
                </h3>
              </div>

              {/* Answer Inputs based on Question Type */}
              {currentQ.type === 'multiple_choice' && currentQ.options && (
                <div className="space-y-3">
                  <div className="text-xs font-semibold text-[#6a7f84] flex items-center justify-between">
                    <span>Select the correct option (Click or press A, B, C, D):</span>
                  </div>
                  <div className="grid grid-cols-1 gap-2.5">
                    {currentQ.options.map((opt, optIdx) => {
                      const selectedAnswer = answers[currentQ.id]?.answer;
                      const isSelected = selectedAnswer === optIdx;

                      return (
                        <button
                          key={optIdx}
                          type="button"
                          onClick={() => handleSelectOption(currentQ.id, optIdx)}
                          className={cn(
                            'p-4 rounded-2xl border text-left flex items-center gap-3.5 transition-all cursor-pointer',
                            isSelected
                              ? 'bg-[#1c4a59]/10 border-[#1c4a59] ring-2 ring-[#1c4a59]/20 shadow-xs'
                              : 'bg-white border-slate-200/90 hover:border-slate-300 hover:bg-slate-50/50'
                          )}
                        >
                          <span
                            className={cn(
                              'w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 transition-colors',
                              isSelected
                                ? 'bg-[#1c4a59] text-white shadow-xs'
                                : 'bg-slate-100 text-slate-700'
                            )}
                          >
                            {String.fromCharCode(65 + optIdx)}
                          </span>
                          <span className="text-xs sm:text-sm font-medium text-[#1f2a2e] flex-1">
                            {opt}
                          </span>
                          {isSelected && (
                            <CheckCircle2 className="w-5 h-5 text-[#1c4a59] shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {currentQ.type === 'short_answer' && (
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-[#1f2a2e]">
                    Write your concise response:
                  </label>
                  <input
                    type="text"
                    value={String(answers[currentQ.id]?.answer || '')}
                    onChange={e => handleSetTextAnswer(currentQ.id, e.target.value)}
                    placeholder="Type your answer here..."
                    className="w-full text-xs sm:text-sm border border-[#bac4c6] rounded-2xl p-4 bg-white text-[#1f2a2e] focus:outline-hidden focus:ring-2 focus:ring-[#1c4a59]"
                  />
                </div>
              )}

              {currentQ.type === 'essay' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-bold text-[#1f2a2e]">
                      Write your detailed essay answer:
                    </label>
                    <span className="text-[11px] text-[#6a7f84] font-mono">
                      {String(answers[currentQ.id]?.answer || '').trim().split(/\s+/).filter(Boolean).length} words
                    </span>
                  </div>
                  <textarea
                    rows={8}
                    value={String(answers[currentQ.id]?.answer || '')}
                    onChange={e => handleSetTextAnswer(currentQ.id, e.target.value)}
                    placeholder="Provide full explanations, steps, and examples..."
                    className="w-full text-xs sm:text-sm border border-[#bac4c6] rounded-2xl p-4 bg-white text-[#1f2a2e] focus:outline-hidden focus:ring-2 focus:ring-[#1c4a59] leading-relaxed"
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Bottom Navigation Toolbar */}
        {!showResultsScreen && questions.length > 0 && (
          <div className="bg-white px-6 py-4 border-t border-slate-200 flex items-center justify-between shrink-0">
            <button
              type="button"
              disabled={currentIndex === 0}
              onClick={() => setCurrentIndex(prev => Math.max(0, prev - 1))}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-30 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Previous</span>
            </button>

            <span className="text-xs font-mono font-bold text-slate-500">
              {currentIndex + 1} / {questions.length}
            </span>

            {currentIndex < questions.length - 1 ? (
              <button
                type="button"
                onClick={() => setCurrentIndex(prev => Math.min(questions.length - 1, prev + 1))}
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-full text-xs font-bold bg-[#1c4a59] text-white hover:bg-[#1c4a59]/90 transition-colors cursor-pointer"
              >
                <span>Next Question</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setIsConfirmSubmitOpen(true)}
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-full text-xs font-bold bg-[#faae57] text-[#1f2a2e] hover:bg-[#e4ae67] transition-colors cursor-pointer"
              >
                <span>Submit Exam</span>
                <Send className="w-4 h-4" />
              </button>
            )}
          </div>
        )}

        {/* Confirmation Modal */}
        {isConfirmSubmitOpen && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/50 backdrop-blur-2xs">
            <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
              <h4 className="text-base font-bold text-[#1f2a2e]">Ready to submit your examination?</h4>
              <p className="text-xs text-[#6a7f84] leading-relaxed">
                You have answered <strong>{answeredCount}</strong> out of{' '}
                <strong>{questions.length}</strong> questions.
                {unansweredCount > 0 && (
                  <span className="text-amber-700 block mt-1 font-semibold">
                    ⚠️ {unansweredCount} question(s) remain unanswered.
                  </span>
                )}
              </p>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsConfirmSubmitOpen(false)}
                  className="px-4 py-2 rounded-full text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Return to Questions
                </button>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleFinalSubmit}
                  className="px-5 py-2 rounded-full text-xs font-bold bg-[#1c4a59] text-white hover:bg-[#1c4a59]/90 cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? 'Submitting...' : 'Yes, Submit Final Work'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default OnlineInteractiveQuizModal;
