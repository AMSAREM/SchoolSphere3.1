import React, { useState } from 'react';
import {
  Plus,
  Trash2,
  Copy,
  ChevronUp,
  ChevronDown,
  Sparkles,
  HelpCircle,
  CheckCircle2,
  ListOrdered,
  FileQuestion,
  AlignLeft,
  Edit2,
  Check,
  BookOpen,
  BookmarkPlus
} from 'lucide-react';
import { db, type AssessmentQuestion, type QuestionType, type QuestionBankItem } from '../../db/schema';
import { useNotifications } from '../../contexts/NotificationContext';
import { cn } from '../../lib/utils';
import { LessonNoteQuestionGeneratorModal } from './LessonNoteQuestionGeneratorModal';
import { QuestionBankImportModal } from './QuestionBankImportModal';

interface QuestionBuilderProps {
  questions: AssessmentQuestion[];
  onChange: (questions: AssessmentQuestion[]) => void;
  currentSubject?: string;
  currentClass?: string;
  currentTerm?: string;
  onImportMetadata?: (meta: {
    title?: string;
    description?: string;
    durationMinutes?: number;
    lessonNoteId?: string;
  }) => void;
}

export const QuestionBuilder: React.FC<QuestionBuilderProps> = ({
  questions,
  onChange,
  currentSubject = 'Integrated Science',
  currentClass = 'JHS 1',
  currentTerm = 'Term 1',
  onImportMetadata
}) => {
  const { showToast } = useNotifications();
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [isBankImportOpen, setIsBankImportOpen] = useState(false);
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);

  // Quick stats
  const mcqCount = questions.filter(q => q.type === 'multiple_choice').length;
  const shortCount = questions.filter(q => q.type === 'short_answer').length;
  const essayCount = questions.filter(q => q.type === 'essay').length;
  const totalPoints = questions.reduce((acc, q) => acc + (Number(q.points) || 0), 0);

  // Add a new question manually
  const handleAddQuestion = (type: QuestionType) => {
    const newNum = questions.length + 1;
    const newId = `q-manual-${Date.now()}-${newNum}`;

    let newQ: AssessmentQuestion;
    if (type === 'multiple_choice') {
      newQ = {
        id: newId,
        questionNumber: newNum,
        type: 'multiple_choice',
        prompt: `Question ${newNum}: `,
        options: ['Option A', 'Option B', 'Option C', 'Option D'],
        correctOptionIndex: 0,
        correctAnswer: 'Option A',
        explanation: 'Explanation of correct answer',
        points: 2
      };
    } else if (type === 'short_answer') {
      newQ = {
        id: newId,
        questionNumber: newNum,
        type: 'short_answer',
        prompt: `Question ${newNum}: `,
        correctAnswer: 'Expected model answer',
        points: 4,
        rubricCriteria: ['Key concept identified (2 pts)', 'Accurate explanation provided (2 pts)']
      };
    } else {
      newQ = {
        id: newId,
        questionNumber: newNum,
        type: 'essay',
        prompt: `Question ${newNum}: With the aid of examples, discuss...`,
        correctAnswer: 'Model answer outline and grading guidelines',
        points: 15,
        rubricCriteria: [
          'Introduction & definition [4 pts]',
          'Depth of explanation & examples [6 pts]',
          'Evaluation and conclusion [5 pts]'
        ]
      };
    }

    const updated = [...questions, newQ];
    onChange(updated);
    setEditingQuestionId(newId);
  };

  // Delete question
  const handleDeleteQuestion = (id: string) => {
    const filtered = questions.filter(q => q.id !== id);
    const renumbered = filtered.map((q, idx) => ({
      ...q,
      questionNumber: idx + 1
    }));
    onChange(renumbered);
  };

  // Duplicate question
  const handleDuplicateQuestion = (q: AssessmentQuestion) => {
    const dupId = `q-dup-${Date.now()}`;
    const dup: AssessmentQuestion = {
      ...q,
      id: dupId,
      questionNumber: questions.length + 1,
      options: q.options ? [...q.options] : undefined,
      rubricCriteria: q.rubricCriteria ? [...q.rubricCriteria] : undefined
    };
    onChange([...questions, dup]);
  };

  // Move up
  const handleMoveUp = (index: number) => {
    if (index <= 0) return;
    const copy = [...questions];
    const temp = copy[index - 1];
    copy[index - 1] = copy[index];
    copy[index] = temp;
    onChange(copy.map((q, i) => ({ ...q, questionNumber: i + 1 })));
  };

  // Move down
  const handleMoveDown = (index: number) => {
    if (index >= questions.length - 1) return;
    const copy = [...questions];
    const temp = copy[index + 1];
    copy[index + 1] = copy[index];
    copy[index] = temp;
    onChange(copy.map((q, i) => ({ ...q, questionNumber: i + 1 })));
  };

  // Update specific question field
  const handleUpdateQuestion = (id: string, updates: Partial<AssessmentQuestion>) => {
    onChange(
      questions.map(q => {
        if (q.id === id) {
          return { ...q, ...updates };
        }
        return q;
      })
    );
  };

  // Handle AI Import
  const handleImportFromAi = (
    imported: AssessmentQuestion[],
    metadata?: {
      title?: string;
      description?: string;
      durationMinutes?: number;
      lessonNoteId?: string;
    }
  ) => {
    let baseNum = questions.length;
    const renumberedImported = imported.map((q, idx) => ({
      ...q,
      questionNumber: baseNum + idx + 1
    }));
    onChange([...questions, ...renumberedImported]);

    if (metadata && onImportMetadata) {
      onImportMetadata(metadata);
    }
  };

  // Handle Question Bank Import
  const handleImportFromBank = (imported: AssessmentQuestion[]) => {
    let baseNum = questions.length;
    const renumberedImported = imported.map((q, idx) => ({
      ...q,
      questionNumber: baseNum + idx + 1
    }));
    onChange([...questions, ...renumberedImported]);
    showToast(`Added ${imported.length} question${imported.length === 1 ? '' : 's'} from Question Bank!`, 'success');
  };

  // Save single question to central Question Bank
  const handleSaveToBank = async (q: AssessmentQuestion) => {
    try {
      const now = Date.now();
      const existing = await db.questionBank.get(`qb-${q.id}`);
      const item: QuestionBankItem = {
        id: existing?.id || `qb-${q.id}`,
        subject: currentSubject || 'General',
        topic: q.strand || q.subStrand || currentSubject || 'General Topic',
        className: currentClass || 'All',
        difficulty: 'medium',
        question: q,
        source: 'manual',
        usageCount: (existing?.usageCount || 0) + 1,
        createdAt: existing?.createdAt || now,
        updatedAt: now
      };
      await db.questionBank.put(item);
      showToast('Question saved to Central Question Bank!', 'success');
    } catch (err: any) {
      showToast('Could not save to Question Bank: ' + err.message, 'error');
    }
  };

  return (
    <div className="space-y-4">
      {/* Question Summary Bar & AI Action */}
      <div className="bg-[#f6f8f7] border border-[#bac4c6]/40 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-bold text-[#1f2a2e]">Assessment Question Bank</h4>
            <span className="text-xs font-mono font-bold bg-[#1c4a59] text-white px-2 py-0.5 rounded-full">
              {questions.length} Total
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-[#6a7f84]">
            <span>{mcqCount} Multiple Choice</span>
            <span>•</span>
            <span>{shortCount} Short Answer</span>
            <span>•</span>
            <span>{essayCount} Essay</span>
            <span>•</span>
            <span className="font-bold text-[#1c4a59] font-mono">
              Total Score: {totalPoints} pts
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setIsBankImportOpen(true)}
            className="inline-flex items-center gap-2 bg-[#1c4a59] hover:bg-[#1c4a59]/90 text-white px-3.5 py-2 rounded-full text-xs font-bold transition-all shadow-xs cursor-pointer shrink-0"
            title="Import saved or curriculum questions from repository"
          >
            <BookOpen className="w-4 h-4 text-[#faae57]" />
            <span>Question Bank</span>
          </button>

          <button
            type="button"
            onClick={() => setIsAiModalOpen(true)}
            className="inline-flex items-center gap-2 bg-[#faae57] hover:bg-[#e4ae67] text-[#1f2a2e] px-3.5 py-2 rounded-full text-xs font-bold transition-all shadow-xs cursor-pointer shrink-0"
          >
            <Sparkles className="w-4 h-4 text-[#1f2a2e]" />
            <span>Generate from Notes</span>
          </button>
        </div>
      </div>

      {/* Questions list */}
      {questions.length === 0 ? (
        <div className="text-center py-10 bg-white border border-dashed border-[#bac4c6] rounded-2xl p-6">
          <FileQuestion className="w-10 h-10 text-slate-300 mx-auto mb-2" />
          <h4 className="text-sm font-bold text-[#1f2a2e]">No questions added yet</h4>
          <p className="text-xs text-[#6a7f84] max-w-md mx-auto mt-1 mb-4">
            Teachers can author questions manually, import verified items from the central Question Bank, or generate them automatically from saved lesson notes.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => handleAddQuestion('multiple_choice')}
              className="inline-flex items-center gap-1.5 text-xs font-semibold bg-amber-50 text-amber-900 border border-amber-200 px-3 py-1.5 rounded-full hover:bg-amber-100 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Multiple Choice
            </button>
            <button
              type="button"
              onClick={() => handleAddQuestion('short_answer')}
              className="inline-flex items-center gap-1.5 text-xs font-semibold bg-teal-50 text-teal-900 border border-teal-200 px-3 py-1.5 rounded-full hover:bg-teal-100 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Short Answer
            </button>
            <button
              type="button"
              onClick={() => handleAddQuestion('essay')}
              className="inline-flex items-center gap-1.5 text-xs font-semibold bg-indigo-50 text-indigo-900 border border-indigo-200 px-3 py-1.5 rounded-full hover:bg-indigo-100 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Essay Question
            </button>
            <button
              type="button"
              onClick={() => setIsBankImportOpen(true)}
              className="inline-flex items-center gap-1.5 text-xs font-bold bg-[#1c4a59] text-white px-3.5 py-1.5 rounded-full hover:bg-[#1c4a59]/90 cursor-pointer shadow-2xs"
            >
              <BookOpen className="w-3.5 h-3.5 text-[#faae57]" /> Question Bank
            </button>
            <button
              type="button"
              onClick={() => setIsAiModalOpen(true)}
              className="inline-flex items-center gap-1.5 text-xs font-bold bg-[#faae57] text-[#1f2a2e] px-3.5 py-1.5 rounded-full hover:bg-[#e4ae67] cursor-pointer shadow-2xs"
            >
              <Sparkles className="w-3.5 h-3.5" /> AI From Notes
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {questions.map((q, idx) => {
            const isEditing = editingQuestionId === q.id;

            return (
              <div
                key={q.id}
                className={cn(
                  'bg-white rounded-2xl border transition-all p-4',
                  isEditing
                    ? 'border-[#1c4a59] ring-2 ring-[#1c4a59]/10 shadow-xs'
                    : 'border-slate-200 hover:border-slate-300'
                )}
              >
                {/* Header Strip */}
                <div className="flex items-center justify-between gap-2 mb-2 pb-2 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-[#1c4a59] text-white flex items-center justify-center text-xs font-bold">
                      {idx + 1}
                    </span>
                    <span
                      className={cn(
                        'text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full',
                        q.type === 'multiple_choice'
                          ? 'bg-amber-100 text-amber-800'
                          : q.type === 'short_answer'
                          ? 'bg-teal-100 text-teal-800'
                          : 'bg-indigo-100 text-indigo-800'
                      )}
                    >
                      {q.type.replace('_', ' ')}
                    </span>
                    <span className="text-xs font-mono font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                      {q.points} {q.points === 1 ? 'pt' : 'pts'}
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => handleMoveUp(idx)}
                      className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-20 cursor-pointer"
                      title="Move Up"
                    >
                      <ChevronUp className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      disabled={idx === questions.length - 1}
                      onClick={() => handleMoveDown(idx)}
                      className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-20 cursor-pointer"
                      title="Move Down"
                    >
                      <ChevronDown className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSaveToBank(q)}
                      className="p-1 text-[#1c4a59] hover:bg-[#1c4a59]/10 rounded cursor-pointer transition-colors"
                      title="Save question to Central Question Bank"
                    >
                      <BookmarkPlus className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDuplicateQuestion(q)}
                      className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                      title="Duplicate"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingQuestionId(isEditing ? null : q.id)}
                      className={cn(
                        'p-1 rounded cursor-pointer',
                        isEditing
                          ? 'text-emerald-700 bg-emerald-50'
                          : 'text-slate-500 hover:text-slate-800'
                      )}
                      title={isEditing ? 'Collapse' : 'Edit Question'}
                    >
                      {isEditing ? <Check className="w-4 h-4" /> : <Edit2 className="w-4 h-4" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteQuestion(q.id)}
                      className="p-1 text-red-400 hover:text-red-700 cursor-pointer"
                      title="Delete Question"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Prompt Display / Edit */}
                {isEditing ? (
                  <div className="space-y-3 pt-1">
                    <div>
                      <label className="block text-xs font-bold text-[#1f2a2e] mb-1">
                        Question Prompt:
                      </label>
                      <textarea
                        rows={2}
                        value={q.prompt}
                        onChange={e => handleUpdateQuestion(q.id, { prompt: e.target.value })}
                        className="w-full text-xs border border-[#bac4c6] rounded-xl p-2.5 bg-white text-[#1f2a2e] focus:outline-hidden focus:ring-2 focus:ring-[#1c4a59]"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-[#1f2a2e] mb-1">
                          Marks Allocated:
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={100}
                          value={q.points}
                          onChange={e => handleUpdateQuestion(q.id, { points: Number(e.target.value) || 1 })}
                          className="w-full text-xs font-mono border border-[#bac4c6] rounded-xl px-3 py-1.5 bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-[#1f2a2e] mb-1">
                          Topic / Strand (Optional):
                        </label>
                        <input
                          type="text"
                          value={q.strand || ''}
                          onChange={e => handleUpdateQuestion(q.id, { strand: e.target.value })}
                          placeholder="e.g. Photosynthesis"
                          className="w-full text-xs border border-[#bac4c6] rounded-xl px-3 py-1.5 bg-white"
                        />
                      </div>
                    </div>

                    {/* MCQ Options Editor */}
                    {q.type === 'multiple_choice' && (
                      <div className="space-y-2 pt-2 border-t border-slate-100">
                        <label className="block text-xs font-bold text-[#1f2a2e]">
                          Multiple Choice Options (Select radio for correct answer):
                        </label>
                        <div className="space-y-2">
                          {(q.options || ['Option A', 'Option B', 'Option C', 'Option D']).map((opt, optIdx) => (
                            <div key={optIdx} className="flex items-center gap-2">
                              <input
                                type="radio"
                                name={`correct-${q.id}`}
                                checked={q.correctOptionIndex === optIdx}
                                onChange={() =>
                                  handleUpdateQuestion(q.id, {
                                    correctOptionIndex: optIdx,
                                    correctAnswer: opt
                                  })
                                }
                                className="text-[#1c4a59] focus:ring-[#1c4a59] w-4 h-4 cursor-pointer"
                              />
                              <span className="w-5 text-xs font-bold text-slate-500">
                                {String.fromCharCode(65 + optIdx)}.
                              </span>
                              <input
                                type="text"
                                value={opt}
                                onChange={e => {
                                  const copyOpts = [...(q.options || [])];
                                  copyOpts[optIdx] = e.target.value;
                                  handleUpdateQuestion(q.id, {
                                    options: copyOpts,
                                    correctAnswer: q.correctOptionIndex === optIdx ? e.target.value : q.correctAnswer
                                  });
                                }}
                                className="flex-1 text-xs border border-[#bac4c6] rounded-lg px-2.5 py-1.5 bg-white text-[#1f2a2e]"
                              />
                            </div>
                          ))}
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-[#6a7f84] mt-2 mb-1">
                            Educational Explanation (Why this option is correct):
                          </label>
                          <input
                            type="text"
                            value={q.explanation || ''}
                            onChange={e => handleUpdateQuestion(q.id, { explanation: e.target.value })}
                            placeholder="Explanation shown after quiz completion or in marking scheme"
                            className="w-full text-xs border border-[#bac4c6] rounded-lg px-2.5 py-1.5 bg-white text-[#1f2a2e]"
                          />
                        </div>
                      </div>
                    )}

                    {/* Short Answer / Essay Model Answer */}
                    {q.type !== 'multiple_choice' && (
                      <div className="space-y-2 pt-2 border-t border-slate-100">
                        <div>
                          <label className="block text-xs font-bold text-[#1f2a2e] mb-1">
                            Model Answer / Required Key Points:
                          </label>
                          <textarea
                            rows={2}
                            value={q.correctAnswer || ''}
                            onChange={e => handleUpdateQuestion(q.id, { correctAnswer: e.target.value })}
                            placeholder="Expected answers and required keywords for grading"
                            className="w-full text-xs border border-[#bac4c6] rounded-lg p-2.5 bg-white text-[#1f2a2e]"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-[#6a7f84] mb-1">
                            Marking Rubric Guidance:
                          </label>
                          <input
                            type="text"
                            value={q.rubricCriteria?.join(', ') || ''}
                            onChange={e =>
                              handleUpdateQuestion(q.id, {
                                rubricCriteria: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                              })
                            }
                            placeholder="e.g. Definition [2 pts], Two examples [2 pts]"
                            className="w-full text-xs border border-[#bac4c6] rounded-lg px-2.5 py-1.5 bg-white text-[#1f2a2e]"
                          />
                        </div>
                      </div>
                    )}

                    <div className="flex justify-end pt-1">
                      <button
                        type="button"
                        onClick={() => setEditingQuestionId(null)}
                        className="text-xs font-semibold bg-[#1c4a59] text-white px-4 py-1.5 rounded-full cursor-pointer"
                      >
                        Done Editing
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <p className="text-xs sm:text-sm font-medium text-[#1f2a2e] leading-relaxed">
                      {q.prompt}
                    </p>

                    {/* MCQ Options Display */}
                    {q.type === 'multiple_choice' && q.options && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 mt-2.5">
                        {q.options.map((opt, optIdx) => (
                          <div
                            key={optIdx}
                            className={cn(
                              'text-xs p-2 rounded-lg border flex items-center gap-2',
                              optIdx === q.correctOptionIndex
                                ? 'bg-emerald-50 border-emerald-300 text-emerald-900 font-medium'
                                : 'bg-slate-50 border-slate-100 text-slate-700'
                            )}
                          >
                            <span className="w-4 h-4 rounded-full bg-white flex items-center justify-center font-bold text-[10px] border shrink-0">
                              {String.fromCharCode(65 + optIdx)}
                            </span>
                            <span className="line-clamp-2">{opt}</span>
                            {optIdx === q.correctOptionIndex && (
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 ml-auto shrink-0" />
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Short Answer / Essay preview */}
                    {q.type !== 'multiple_choice' && q.correctAnswer && (
                      <div className="mt-2 text-xs text-slate-600 bg-slate-50 p-2 rounded-lg border border-slate-100">
                        <span className="font-bold text-[#1c4a59]">Model Answer: </span>
                        <span className="line-clamp-2">{q.correctAnswer}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Add question bottom toolbar */}
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs font-bold text-slate-600">Add Question to Assessment:</span>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => handleAddQuestion('multiple_choice')}
                className="inline-flex items-center gap-1.5 text-xs font-semibold bg-white border border-amber-300 text-amber-900 px-3 py-1.5 rounded-full hover:bg-amber-50 cursor-pointer shadow-2xs"
              >
                <Plus className="w-3.5 h-3.5 text-amber-700" /> Multiple Choice
              </button>
              <button
                type="button"
                onClick={() => handleAddQuestion('short_answer')}
                className="inline-flex items-center gap-1.5 text-xs font-semibold bg-white border border-teal-300 text-teal-900 px-3 py-1.5 rounded-full hover:bg-teal-50 cursor-pointer shadow-2xs"
              >
                <Plus className="w-3.5 h-3.5 text-teal-700" /> Short Answer
              </button>
              <button
                type="button"
                onClick={() => handleAddQuestion('essay')}
                className="inline-flex items-center gap-1.5 text-xs font-semibold bg-white border border-indigo-300 text-indigo-900 px-3 py-1.5 rounded-full hover:bg-indigo-50 cursor-pointer shadow-2xs"
              >
                <Plus className="w-3.5 h-3.5 text-indigo-700" /> Essay Question
              </button>
              <button
                type="button"
                onClick={() => setIsBankImportOpen(true)}
                className="inline-flex items-center gap-1.5 text-xs font-bold bg-[#1c4a59] text-white px-3.5 py-1.5 rounded-full hover:bg-[#1c4a59]/90 cursor-pointer shadow-2xs"
              >
                <BookOpen className="w-3.5 h-3.5 text-[#faae57]" /> Question Bank
              </button>
              <button
                type="button"
                onClick={() => setIsAiModalOpen(true)}
                className="inline-flex items-center gap-1.5 text-xs font-bold bg-[#faae57] text-[#1f2a2e] px-3.5 py-1.5 rounded-full hover:bg-[#e4ae67] cursor-pointer shadow-2xs"
              >
                <Sparkles className="w-3.5 h-3.5" /> AI From Lesson Notes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Generator Modal */}
      {isAiModalOpen && (
        <LessonNoteQuestionGeneratorModal
          isOpen={isAiModalOpen}
          onClose={() => setIsAiModalOpen(false)}
          onImportQuestions={handleImportFromAi}
          currentSubject={currentSubject}
          currentClass={currentClass}
          currentTerm={currentTerm}
        />
      )}

      {/* Question Bank Import Modal */}
      {isBankImportOpen && (
        <QuestionBankImportModal
          isOpen={isBankImportOpen}
          onClose={() => setIsBankImportOpen(false)}
          onImportQuestions={handleImportFromBank}
          defaultSubject={currentSubject}
          defaultClass={currentClass}
        />
      )}
    </div>
  );
};

export default QuestionBuilder;
