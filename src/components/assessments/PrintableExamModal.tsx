import React, { useState } from 'react';
import {
  X,
  Printer,
  FileText,
  CheckCircle2,
  BookOpen,
  Eye,
  Sliders,
  Download
} from 'lucide-react';
import type { Assessment, AssessmentQuestion } from '../../db/schema';
import { cn } from '../../lib/utils';

interface PrintableExamModalProps {
  isOpen: boolean;
  onClose: () => void;
  assessment: Assessment;
  schoolName?: string;
}

export const PrintableExamModal: React.FC<PrintableExamModalProps> = ({
  isOpen,
  onClose,
  assessment,
  schoolName = 'SchoolSphere Model Academy'
}) => {
  if (!isOpen) return null;

  const [includeMarkingScheme, setIncludeMarkingScheme] = useState(false);
  const [includeAnswerLines, setIncludeAnswerLines] = useState(true);

  const questions: AssessmentQuestion[] = assessment.questions || [];

  const mcqQuestions = questions.filter(q => q.type === 'multiple_choice');
  const shortQuestions = questions.filter(q => q.type === 'short_answer');
  const essayQuestions = questions.filter(q => q.type === 'essay');

  const totalMarks = questions.reduce((acc, q) => acc + (q.points || 0), 0) || assessment.maxScore;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/75 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-[#f6f8f7] w-full max-w-4xl h-[95vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-[#bac4c6]/40">
        {/* Controls Toolbar (hidden during print) */}
        <div className="bg-[#1c4a59] text-white px-6 py-4 flex flex-wrap items-center justify-between gap-3 shrink-0 print:hidden">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#faae57] text-[#1f2a2e] flex items-center justify-center font-bold">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Printable Examination Paper</h3>
              <p className="text-xs text-slate-300">
                WAEC / GES Standard Paper Layout & Marking Guide
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Toggle Marking Scheme */}
            <label className="flex items-center gap-2 bg-white/10 hover:bg-white/15 px-3 py-1.5 rounded-full text-xs font-semibold cursor-pointer transition-colors">
              <input
                type="checkbox"
                checked={includeMarkingScheme}
                onChange={e => setIncludeMarkingScheme(e.target.checked)}
                className="rounded text-[#faae57] focus:ring-[#faae57] w-4 h-4 cursor-pointer"
              />
              <span>Include Marking Scheme & Answers</span>
            </label>

            {/* Print Button */}
            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 bg-[#faae57] hover:bg-[#e4ae67] text-[#1f2a2e] px-4 py-2 rounded-full text-xs font-bold transition-all shadow-xs cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Print Paper</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 text-slate-300 hover:text-white hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Paper Document Preview (Target of print CSS) */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-slate-200/60 print:bg-white print:p-0 print:overflow-visible">
          <div
            id="printable-exam-sheet"
            className="bg-white max-w-[210mm] mx-auto p-8 sm:p-12 shadow-md rounded-2xl print:shadow-none print:rounded-none print:p-0 print:m-0 text-[#1f2a2e] font-serif"
          >
            {/* Institutional Header */}
            <div className="text-center border-b-2 border-black pb-4 mb-6">
              <h1 className="text-xl sm:text-2xl font-bold uppercase tracking-wide">
                {schoolName}
              </h1>
              <h2 className="text-sm sm:text-base font-bold uppercase tracking-wider mt-1">
                {assessment.term || 'TERM 1'} EXAMINATION — {assessment.academicYear || '2025/2026'}
              </h2>
              <div className="flex items-center justify-center gap-6 mt-2 text-xs sm:text-sm font-semibold uppercase">
                <span>SUBJECT: {assessment.subject}</span>
                <span>•</span>
                <span>CLASS: {assessment.class}</span>
                <span>•</span>
                <span>TIME: {assessment.durationMinutes ? `${assessment.durationMinutes} MINUTES` : '1 HOUR 30 MINS'}</span>
              </div>
            </div>

            {/* Candidate Details Grid */}
            <div className="border border-black p-3 mb-6 text-xs sm:text-sm font-mono space-y-2">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="font-bold">CANDIDATE NAME: </span>
                  <span className="border-b border-black inline-block w-48 sm:w-64">&nbsp;</span>
                </div>
                <div>
                  <span className="font-bold">INDEX NUMBER: </span>
                  <span className="border-b border-black inline-block w-32 sm:w-44">&nbsp;</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="font-bold">DATE: </span>
                  <span className="border-b border-black inline-block w-40 sm:w-52">&nbsp;</span>
                </div>
                <div>
                  <span className="font-bold">TOTAL SCORE: </span>
                  <span className="border border-black px-2 py-0.5 inline-block font-bold">
                    &nbsp;&nbsp;&nbsp;&nbsp;&nbsp; / {totalMarks}
                  </span>
                </div>
              </div>
            </div>

            {/* General Candidate Instructions */}
            <div className="bg-slate-50 print:bg-transparent border border-slate-300 print:border-black p-3 mb-6 text-xs italic">
              <p className="font-bold not-italic uppercase mb-1">INSTRUCTIONS TO CANDIDATES:</p>
              <ul className="list-disc pl-5 space-y-0.5">
                <li>Write your Name and Index Number clearly in the spaces provided above.</li>
                <li>Answer ALL questions in Section A (Objective Test).</li>
                <li>Write clear, legible answers for theory and essay questions.</li>
                <li>Credit will be given for clarity of expression and orderly presentation of facts.</li>
              </ul>
            </div>

            {includeMarkingScheme && (
              <div className="mb-6 p-3 bg-amber-50 border-2 border-amber-500 text-amber-900 rounded text-xs font-sans print:border-black print:text-black">
                <span className="font-bold uppercase tracking-wider">
                  ⚠️ TEACHER'S MARKING GUIDE / ANSWER KEY MODE ACTIVATED
                </span>
                <p className="mt-0.5">
                  This document includes correct answers, model outlines, and mark allocations.
                </p>
              </div>
            )}

            {/* SECTION A: MULTIPLE CHOICE */}
            {mcqQuestions.length > 0 && (
              <div className="mb-8">
                <div className="flex items-center justify-between border-b border-black pb-1 mb-4">
                  <h3 className="font-bold text-sm sm:text-base uppercase tracking-wide">
                    SECTION A — OBJECTIVE TEST [{mcqQuestions.reduce((s, q) => s + q.points, 0)} MARKS]
                  </h3>
                  <span className="text-xs italic">Answer all questions</span>
                </div>

                <div className="space-y-4 text-xs sm:text-sm">
                  {mcqQuestions.map((q, idx) => (
                    <div key={q.id} className="space-y-1.5 break-inside-avoid">
                      <p className="font-medium">
                        <strong>{idx + 1}.</strong> {q.prompt}
                        <span className="text-[11px] font-mono ml-1 text-slate-600 print:text-black">
                          [{q.points} {q.points === 1 ? 'mark' : 'marks'}]
                        </span>
                      </p>

                      {q.options && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 pl-4">
                          {q.options.map((opt, optIdx) => {
                            const isCorrect = q.correctOptionIndex === optIdx;
                            return (
                              <div
                                key={optIdx}
                                className={cn(
                                  'flex items-start gap-2',
                                  includeMarkingScheme && isCorrect
                                    ? 'font-bold text-emerald-800 print:text-black underline'
                                    : ''
                                )}
                              >
                                <span className="font-bold">
                                  {String.fromCharCode(65 + optIdx)}.
                                </span>
                                <span>{opt}</span>
                                {includeMarkingScheme && isCorrect && (
                                  <span className="text-[10px] uppercase font-sans font-bold bg-emerald-100 text-emerald-900 px-1 rounded ml-1 print:no-underline">
                                    [Key]
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {includeMarkingScheme && q.explanation && (
                        <div className="mt-1 pl-4 text-[11px] italic text-slate-600 print:text-black font-sans">
                          <strong>Note:</strong> {q.explanation}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* SECTION B: SHORT ANSWER */}
            {shortQuestions.length > 0 && (
              <div className="mb-8">
                <div className="flex items-center justify-between border-b border-black pb-1 mb-4">
                  <h3 className="font-bold text-sm sm:text-base uppercase tracking-wide">
                    SECTION B — THEORY & SHORT ANSWER [{shortQuestions.reduce((s, q) => s + q.points, 0)} MARKS]
                  </h3>
                  <span className="text-xs italic">Answer all questions</span>
                </div>

                <div className="space-y-6 text-xs sm:text-sm">
                  {shortQuestions.map((q, idx) => (
                    <div key={q.id} className="space-y-2 break-inside-avoid">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-medium">
                          <strong>{mcqQuestions.length + idx + 1}.</strong> {q.prompt}
                        </p>
                        <span className="font-mono font-bold shrink-0">
                          [{q.points} marks]
                        </span>
                      </div>

                      {includeMarkingScheme ? (
                        <div className="bg-slate-50 print:bg-transparent border border-slate-300 print:border-black p-3 font-sans space-y-1 text-xs">
                          <p className="font-bold text-[#1c4a59] print:text-black">
                            Model Answer:
                          </p>
                          <p className="whitespace-pre-line">{q.correctAnswer}</p>
                          {q.rubricCriteria && (
                            <p className="text-slate-600 print:text-black italic mt-1">
                              <strong>Marking Criteria:</strong> {q.rubricCriteria.join('; ')}
                            </p>
                          )}
                        </div>
                      ) : (
                        includeAnswerLines && (
                          <div className="space-y-3 pt-2">
                            <div className="border-b border-dotted border-black h-4 w-full" />
                            <div className="border-b border-dotted border-black h-4 w-full" />
                            <div className="border-b border-dotted border-black h-4 w-full" />
                          </div>
                        )
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* SECTION C: ESSAY QUESTIONS */}
            {essayQuestions.length > 0 && (
              <div className="mb-8">
                <div className="flex items-center justify-between border-b border-black pb-1 mb-4">
                  <h3 className="font-bold text-sm sm:text-base uppercase tracking-wide">
                    SECTION C — ESSAY / STRUCTURED QUESTIONS [{essayQuestions.reduce((s, q) => s + q.points, 0)} MARKS]
                  </h3>
                  <span className="text-xs italic">Answer all questions in full detail</span>
                </div>

                <div className="space-y-6 text-xs sm:text-sm">
                  {essayQuestions.map((q, idx) => (
                    <div key={q.id} className="space-y-2 break-inside-avoid">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-medium whitespace-pre-line">
                          <strong>{mcqQuestions.length + shortQuestions.length + idx + 1}.</strong> {q.prompt}
                        </p>
                        <span className="font-mono font-bold shrink-0">
                          [{q.points} marks]
                        </span>
                      </div>

                      {includeMarkingScheme ? (
                        <div className="bg-slate-50 print:bg-transparent border border-slate-300 print:border-black p-3 font-sans space-y-1 text-xs">
                          <p className="font-bold text-[#1c4a59] print:text-black">
                            Model Answer & Marking Breakdown:
                          </p>
                          <p className="whitespace-pre-line">{q.correctAnswer}</p>
                          {q.rubricCriteria && q.rubricCriteria.length > 0 && (
                            <div className="mt-2 text-slate-700 print:text-black">
                              <p className="font-bold">Marking Scheme Criteria:</p>
                              <ul className="list-disc pl-5">
                                {q.rubricCriteria.map((crit, cIdx) => (
                                  <li key={cIdx}>{crit}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      ) : (
                        includeAnswerLines && (
                          <div className="space-y-3 pt-2">
                            <div className="border-b border-dotted border-black h-4 w-full" />
                            <div className="border-b border-dotted border-black h-4 w-full" />
                            <div className="border-b border-dotted border-black h-4 w-full" />
                            <div className="border-b border-dotted border-black h-4 w-full" />
                            <div className="border-b border-dotted border-black h-4 w-full" />
                          </div>
                        )
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* End of paper indicator */}
            <div className="text-center border-t border-black pt-4 mt-8 font-bold uppercase tracking-widest text-xs">
              === END OF EXAMINATION PAPER ===
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PrintableExamModal;
