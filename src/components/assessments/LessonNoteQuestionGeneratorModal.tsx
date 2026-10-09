import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  X,
  Sparkles,
  BookOpen,
  Upload,
  FileText,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Plus,
  Trash2,
  Loader2,
  Sliders,
  ChevronRight,
  FileCheck
} from 'lucide-react';
import { db, type LessonNote, type AssessmentQuestion, type QuestionType } from '../../db/schema';
import { cn } from '../../lib/utils';
import { checkRateLimit } from '../../lib/rateLimit';

interface LessonNoteQuestionGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportQuestions: (
    questions: AssessmentQuestion[],
    metadata?: {
      title?: string;
      description?: string;
      durationMinutes?: number;
      lessonNoteId?: string;
    }
  ) => void;
  currentSubject?: string;
  currentClass?: string;
  currentTerm?: string;
}

export const LessonNoteQuestionGeneratorModal: React.FC<LessonNoteQuestionGeneratorModalProps> = ({
  isOpen,
  onClose,
  onImportQuestions,
  currentSubject = 'Integrated Science',
  currentClass = 'JHS 1',
  currentTerm = 'Term 1'
}) => {
  if (!isOpen) return null;

  // Active Source Tab
  const [sourceTab, setSourceTab] = useState<'saved_note' | 'upload_file' | 'manual_topic'>('saved_note');

  // Query saved lesson notes from DB
  const savedLessonNotes = useLiveQuery(() => db.lessonNotes.toArray()) || [];

  // Selected saved note
  const [selectedNoteId, setSelectedNoteId] = useState<string>('');
  const [noteSearch, setNoteSearch] = useState('');

  // Uploaded file state
  const [uploadedFileName, setUploadedFileName] = useState<string>('');
  const [uploadedFileContent, setUploadedFileContent] = useState<string>('');
  const [isReadingFile, setIsReadingFile] = useState(false);

  // Manual topic input
  const [manualStrand, setManualStrand] = useState('');
  const [manualSubStrand, setManualSubStrand] = useState('');
  const [manualKeyObjectives, setManualKeyObjectives] = useState('');

  // Generation Settings
  const [selectedSubject, setSelectedSubject] = useState(currentSubject);
  const [selectedClass, setSelectedClass] = useState(currentClass);
  const [difficulty, setDifficulty] = useState<'Foundational' | 'Standard' | 'Challenging'>('Standard');
  const [additionalGuidance, setAdditionalGuidance] = useState('');

  // Question counts
  const [includeMcq, setIncludeMcq] = useState(true);
  const [mcqCount, setMcqCount] = useState(5);

  const [includeShort, setIncludeShort] = useState(true);
  const [shortCount, setShortCount] = useState(3);

  const [includeEssay, setIncludeEssay] = useState(true);
  const [essayCount, setEssayCount] = useState(1);

  // Loading & Result state
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [generatedResult, setGeneratedResult] = useState<{
    suggestedTitle: string;
    suggestedDescription: string;
    suggestedDurationMinutes: number;
    questions: AssessmentQuestion[];
  } | null>(null);

  // Selection state for generated questions
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<Set<string>>(new Set());

  // Filtered saved notes
  const filteredNotes = useMemo(() => {
    return savedLessonNotes.filter(n => {
      const q = noteSearch.toLowerCase();
      const matchSearch =
        !q ||
        n.subject.toLowerCase().includes(q) ||
        n.class.toLowerCase().includes(q) ||
        (n.strand && n.strand.toLowerCase().includes(q)) ||
        (n.subStrand && n.subStrand.toLowerCase().includes(q));
      return matchSearch;
    });
  }, [savedLessonNotes, noteSearch]);

  const activeSelectedNote = useMemo(() => {
    return savedLessonNotes.find(n => n.noteId === selectedNoteId);
  }, [savedLessonNotes, selectedNoteId]);

  // Handle file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadedFileName(file.name);
    setIsReadingFile(true);
    setGenerationError(null);

    const reader = new FileReader();
    reader.onload = event => {
      const text = event.target?.result as string;
      setUploadedFileContent(text || '');
      setIsReadingFile(false);
    };
    reader.onerror = () => {
      setGenerationError('Failed to read file. Please ensure it is a plain text, markdown, or JSON document.');
      setIsReadingFile(false);
    };

    // If text file
    if (file.type.includes('text') || file.name.endsWith('.txt') || file.name.endsWith('.md') || file.name.endsWith('.json')) {
      reader.readAsText(file);
    } else {
      // For binary or other docs, read text excerpt or provide placeholder text
      reader.readAsText(file);
    }
  };

  // Generate Questions Call
  const handleTriggerGenerate = async () => {
    setGenerationError(null);
    setIsGenerating(true);

    const questionTypes: QuestionType[] = [];
    if (includeMcq) questionTypes.push('multiple_choice');
    if (includeShort) questionTypes.push('short_answer');
    if (includeEssay) questionTypes.push('essay');

    if (questionTypes.length === 0) {
      setGenerationError('Please select at least one question type (Multiple Choice, Short Answer, or Essay).');
      setIsGenerating(false);
      return;
    }

    const counts = {
      multiple_choice: includeMcq ? Number(mcqCount) || 1 : 0,
      short_answer: includeShort ? Number(shortCount) || 1 : 0,
      essay: includeEssay ? Number(essayCount) || 1 : 0
    };

    let lessonNotePayload: any = undefined;
    let textPayload: string | undefined = undefined;
    let strandToUse = manualStrand;
    let subStrandToUse = manualSubStrand;

    if (sourceTab === 'saved_note') {
      if (!activeSelectedNote) {
        setGenerationError('Please pick a saved lesson note from the list.');
        setIsGenerating(false);
        return;
      }
      lessonNotePayload = activeSelectedNote;
      strandToUse = activeSelectedNote.strand;
      subStrandToUse = activeSelectedNote.subStrand;
    } else if (sourceTab === 'upload_file') {
      if (!uploadedFileContent.trim()) {
        setGenerationError('Please upload a file or paste your lesson note content first.');
        setIsGenerating(false);
        return;
      }
      textPayload = uploadedFileContent;
    } else {
      if (!manualStrand.trim() && !manualKeyObjectives.trim()) {
        setGenerationError('Please provide a strand/topic and core learning objectives.');
        setIsGenerating(false);
        return;
      }
      lessonNotePayload = {
        strand: manualStrand,
        subStrand: manualSubStrand,
        learningIndicators: manualKeyObjectives
      };
    }

    // Client-side rate limit protection for AI generation (max 6 requests per 60 seconds)
    const clientLimit = checkRateLimit('ai_generate_questions', 6, 60000);
    if (!clientLimit.allowed) {
      setGenerationError(`AI Rate Limit: Please wait ${clientLimit.retryAfterSeconds} second(s) before generating more questions.`);
      setIsGenerating(false);
      return;
    }

    try {
      const response = await fetch('/api/ai/generate-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: selectedSubject,
          className: selectedClass,
          term: currentTerm,
          strand: strandToUse,
          subStrand: subStrandToUse,
          lessonNote: lessonNotePayload,
          uploadedText: textPayload,
          questionTypes,
          counts,
          difficulty,
          additionalInstructions: additionalGuidance
        })
      });

      const data = await response.json();
      if (response.status === 429 || data.rateLimited) {
        throw new Error(data.error || `AI generation rate limit reached. Please wait ${data.retryAfter || 30} seconds.`);
      }

      if (!response.ok || !data.success || !Array.isArray(data.questions)) {
        throw new Error(data.error || 'Failed to generate questions.');
      }

      setGeneratedResult({
        suggestedTitle: data.suggestedTitle || `${selectedSubject} Quiz`,
        suggestedDescription: data.suggestedDescription || 'Complete all questions.',
        suggestedDurationMinutes: data.suggestedDurationMinutes || 40,
        questions: data.questions
      });

      // Default select all generated questions
      const allIds = new Set<string>(data.questions.map((q: AssessmentQuestion) => q.id));
      setSelectedQuestionIds(allIds);
    } catch (err: any) {
      console.error('Error generating questions:', err);
      setGenerationError(err?.message || 'Failed to generate questions. Please check your network and try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  // Toggle selection of a generated question
  const toggleSelectQuestion = (id: string) => {
    setSelectedQuestionIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Final import to assessment
  const handleConfirmImport = async () => {
    if (!generatedResult) return;
    const chosen = generatedResult.questions.filter(q => selectedQuestionIds.has(q.id));
    if (chosen.length === 0) {
      setGenerationError('Please select at least one question to import.');
      return;
    }

    // Also persist generated questions to QuestionBank repository for reuse
    try {
      const now = Date.now();
      const itemsToBank = chosen.map((q, idx) => ({
        id: `qb-ai-${now}-${idx}-${Math.random().toString(36).substring(2, 6)}`,
        subject: selectedSubject || 'General',
        topic: q.strand || q.subStrand || activeSelectedNote?.strand || activeSelectedNote?.subStrand || selectedSubject || 'General Topic',
        className: selectedClass || 'All',
        difficulty: (difficulty.toLowerCase() as any) || 'medium',
        question: q,
        source: 'ai_generated' as const,
        usageCount: 1,
        createdAt: now,
        updatedAt: now
      }));
      await db.questionBank.bulkPut(itemsToBank);
    } catch (err) {
      console.warn('Notice saving generated questions to questionBank:', err);
    }

    onImportQuestions(chosen, {
      title: generatedResult.suggestedTitle,
      description: generatedResult.suggestedDescription,
      durationMinutes: generatedResult.suggestedDurationMinutes,
      lessonNoteId: activeSelectedNote?.noteId
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 animate-in fade-in duration-150">
      <div className="bg-[#f6f8f7] w-full max-w-4xl max-h-[92vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-[#bac4c6]/40">
        {/* Header */}
        <div className="bg-[#1c4a59] text-white px-6 py-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#faae57] text-[#1f2a2e] flex items-center justify-center font-bold shadow-xs">
              <Sparkles className="w-5 h-5 text-[#1f2a2e]" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                AI Question Generator from Lesson Notes
                <span className="text-xs bg-[#faae57]/20 text-[#faae57] px-2 py-0.5 rounded-full font-mono uppercase tracking-wider">
                  Curriculum AI
                </span>
              </h2>
              <p className="text-xs text-slate-300">
                Transform lesson plans, syllabus standards, and uploaded notes into WAEC/GES-aligned test questions.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-300 hover:text-white hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body content */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
          {!generatedResult ? (
            <>
              {/* Step 1: Choose Source Mode */}
              <div className="bg-white rounded-2xl p-5 shadow-xs border border-[#bac4c6]/30">
                <label className="block text-xs font-bold uppercase tracking-wider text-[#6a7f84] mb-3">
                  Step 1: Choose Lesson Content Source
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setSourceTab('saved_note')}
                    className={cn(
                      'p-3.5 rounded-xl border text-left flex items-start gap-3 transition-all cursor-pointer',
                      sourceTab === 'saved_note'
                        ? 'border-[#1c4a59] bg-[#1c4a59]/5 ring-2 ring-[#1c4a59]/20'
                        : 'border-[#bac4c6]/50 bg-slate-50/50 hover:bg-slate-50'
                    )}
                  >
                    <BookOpen
                      className={cn(
                        'w-5 h-5 shrink-0 mt-0.5',
                        sourceTab === 'saved_note' ? 'text-[#1c4a59]' : 'text-slate-400'
                      )}
                    />
                    <div>
                      <p className="text-sm font-bold text-[#1f2a2e]">Saved Lesson Notes</p>
                      <p className="text-xs text-[#6a7f84] mt-0.5">
                        Choose from notes recorded in SchoolSphere
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSourceTab('upload_file')}
                    className={cn(
                      'p-3.5 rounded-xl border text-left flex items-start gap-3 transition-all cursor-pointer',
                      sourceTab === 'upload_file'
                        ? 'border-[#1c4a59] bg-[#1c4a59]/5 ring-2 ring-[#1c4a59]/20'
                        : 'border-[#bac4c6]/50 bg-slate-50/50 hover:bg-slate-50'
                    )}
                  >
                    <Upload
                      className={cn(
                        'w-5 h-5 shrink-0 mt-0.5',
                        sourceTab === 'upload_file' ? 'text-[#1c4a59]' : 'text-slate-400'
                      )}
                    />
                    <div>
                      <p className="text-sm font-bold text-[#1f2a2e]">Upload Note / Document</p>
                      <p className="text-xs text-[#6a7f84] mt-0.5">
                        Upload text, markdown, or lesson file
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSourceTab('manual_topic')}
                    className={cn(
                      'p-3.5 rounded-xl border text-left flex items-start gap-3 transition-all cursor-pointer',
                      sourceTab === 'manual_topic'
                        ? 'border-[#1c4a59] bg-[#1c4a59]/5 ring-2 ring-[#1c4a59]/20'
                        : 'border-[#bac4c6]/50 bg-slate-50/50 hover:bg-slate-50'
                    )}
                  >
                    <FileText
                      className={cn(
                        'w-5 h-5 shrink-0 mt-0.5',
                        sourceTab === 'manual_topic' ? 'text-[#1c4a59]' : 'text-slate-400'
                      )}
                    />
                    <div>
                      <p className="text-sm font-bold text-[#1f2a2e]">Topic & Syllabus Objectives</p>
                      <p className="text-xs text-[#6a7f84] mt-0.5">
                        Type strand, sub-strand and indicators
                      </p>
                    </div>
                  </button>
                </div>

                {/* Source Selection Subview */}
                <div className="mt-4 pt-4 border-t border-slate-100">
                  {sourceTab === 'saved_note' && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={noteSearch}
                          onChange={e => setNoteSearch(e.target.value)}
                          placeholder="Search saved lesson notes by subject, class, or strand..."
                          className="flex-1 text-xs border border-[#bac4c6] rounded-xl px-3 py-2 bg-white text-[#1f2a2e] focus:outline-hidden focus:ring-2 focus:ring-[#1c4a59]"
                        />
                      </div>

                      {filteredNotes.length === 0 ? (
                        <div className="text-center py-6 border border-dashed border-[#bac4c6] rounded-xl bg-slate-50/50">
                          <BookOpen className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                          <p className="text-xs font-semibold text-[#1f2a2e]">No saved lesson notes found</p>
                          <p className="text-xs text-[#6a7f84] mt-0.5">
                            You can upload a document directly using the "Upload Note" tab above.
                          </p>
                        </div>
                      ) : (
                        <div className="max-h-52 overflow-y-auto space-y-2 pr-1">
                          {filteredNotes.map(n => {
                            const isSelected = selectedNoteId === n.noteId;
                            return (
                              <div
                                key={n.noteId}
                                onClick={() => {
                                  setSelectedNoteId(n.noteId);
                                  setSelectedSubject(n.subject || selectedSubject);
                                  setSelectedClass(n.class || selectedClass);
                                }}
                                className={cn(
                                  'p-3 rounded-xl border flex items-center justify-between gap-3 cursor-pointer transition-all',
                                  isSelected
                                    ? 'bg-[#1c4a59]/10 border-[#1c4a59]'
                                    : 'bg-white border-slate-200 hover:border-slate-300'
                                )}
                              >
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold text-[#1f2a2e]">
                                      {n.subject} — {n.class} (Week {n.weekNumber})
                                    </span>
                                    <span className="text-[11px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded font-medium">
                                      {n.term}
                                    </span>
                                  </div>
                                  <p className="text-xs text-[#6a7f84] line-clamp-1 mt-0.5">
                                    {n.strand} {n.subStrand ? `• ${n.subStrand}` : ''}
                                  </p>
                                </div>
                                <div className="shrink-0">
                                  {isSelected ? (
                                    <span className="inline-flex items-center gap-1 text-xs font-bold text-[#1c4a59]">
                                      <CheckCircle2 className="w-4 h-4" /> Selected
                                    </span>
                                  ) : (
                                    <span className="text-xs text-slate-400 font-medium">Select</span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {activeSelectedNote && (
                        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-xs text-emerald-800 space-y-1">
                          <p className="font-bold flex items-center gap-1.5">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                            Lesson Note Selected: {activeSelectedNote.subject} ({activeSelectedNote.class})
                          </p>
                          <p className="text-emerald-700">
                            <strong>Strand:</strong> {activeSelectedNote.strand || 'General'} |{' '}
                            <strong>Sub-strand:</strong> {activeSelectedNote.subStrand || 'Core'}
                          </p>
                          {(activeSelectedNote.learningIndicators || activeSelectedNote.objectives) && (
                            <p className="line-clamp-2 text-emerald-600">
                              <strong>Objectives:</strong> {activeSelectedNote.learningIndicators || activeSelectedNote.objectives}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {sourceTab === 'upload_file' && (
                    <div className="space-y-3">
                      <div className="border-2 border-dashed border-[#bac4c6] rounded-2xl p-5 text-center bg-slate-50 hover:bg-slate-100/70 transition-colors relative">
                        <input
                          type="file"
                          accept=".txt,.md,.json,.pdf,.docx,.doc"
                          onChange={handleFileUpload}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        />
                        <Upload className="w-8 h-8 text-[#1c4a59] mx-auto mb-2" />
                        <p className="text-xs font-bold text-[#1f2a2e]">
                          {uploadedFileName ? uploadedFileName : 'Click to upload or drag & drop lesson file'}
                        </p>
                        <p className="text-[11px] text-[#6a7f84] mt-0.5">
                          Supports text documents, markdown lesson notes, syllabus outlines, or curriculum summaries
                        </p>
                      </div>

                      {uploadedFileContent && (
                        <div>
                          <label className="block text-[11px] font-bold text-[#6a7f84] mb-1">
                            Preview / Edit Uploaded Content (AI analyzes this text):
                          </label>
                          <textarea
                            rows={4}
                            value={uploadedFileContent}
                            onChange={e => setUploadedFileContent(e.target.value)}
                            className="w-full text-xs font-mono border border-[#bac4c6] rounded-xl p-3 bg-white text-[#1f2a2e] focus:outline-hidden focus:ring-2 focus:ring-[#1c4a59]"
                            placeholder="File text content..."
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {sourceTab === 'manual_topic' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-[#1f2a2e] mb-1">
                          Strand / Major Topic
                        </label>
                        <input
                          type="text"
                          value={manualStrand}
                          onChange={e => setManualStrand(e.target.value)}
                          placeholder="e.g. Diversity of Matter, Photosynthesis"
                          className="w-full text-xs border border-[#bac4c6] rounded-xl px-3 py-2 bg-white text-[#1f2a2e] focus:outline-hidden focus:ring-2 focus:ring-[#1c4a59]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-[#1f2a2e] mb-1">
                          Sub-Strand / Unit
                        </label>
                        <input
                          type="text"
                          value={manualSubStrand}
                          onChange={e => setManualSubStrand(e.target.value)}
                          placeholder="e.g. Living Cells, Photosynthetic Equation"
                          className="w-full text-xs border border-[#bac4c6] rounded-xl px-3 py-2 bg-white text-[#1f2a2e] focus:outline-hidden focus:ring-2 focus:ring-[#1c4a59]"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-xs font-bold text-[#1f2a2e] mb-1">
                          Key Learning Objectives & Indicators
                        </label>
                        <textarea
                          rows={3}
                          value={manualKeyObjectives}
                          onChange={e => setManualKeyObjectives(e.target.value)}
                          placeholder="e.g. Learners can distinguish between light-dependent and dark stages; learners can outline chloroplast structures..."
                          className="w-full text-xs border border-[#bac4c6] rounded-xl p-3 bg-white text-[#1f2a2e] focus:outline-hidden focus:ring-2 focus:ring-[#1c4a59]"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Step 2: Question Type Allocation & Targets */}
              <div className="bg-white rounded-2xl p-5 shadow-xs border border-[#bac4c6]/30 space-y-4">
                <label className="block text-xs font-bold uppercase tracking-wider text-[#6a7f84]">
                  Step 2: Question Types & Mark Distribution
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* MCQ */}
                  <div className={cn(
                    'p-3.5 rounded-xl border transition-all',
                    includeMcq ? 'border-[#faae57] bg-[#faae57]/10' : 'border-slate-200 bg-slate-50 opacity-60'
                  )}>
                    <div className="flex items-center justify-between mb-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={includeMcq}
                          onChange={e => setIncludeMcq(e.target.checked)}
                          className="rounded text-[#faae57] focus:ring-[#faae57] w-4 h-4"
                        />
                        <span className="text-xs font-bold text-[#1f2a2e]">Multiple Choice</span>
                      </label>
                      <span className="text-[11px] font-mono text-[#6a7f84]">MCQ</span>
                    </div>
                    {includeMcq && (
                      <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-[#faae57]/30">
                        <span className="text-xs text-[#6a7f84]">Quantity:</span>
                        <input
                          type="number"
                          min={1}
                          max={30}
                          value={mcqCount}
                          onChange={e => setMcqCount(Math.max(1, Number(e.target.value)))}
                          className="w-16 text-xs text-center border border-[#bac4c6] rounded-lg py-1 bg-white font-mono font-bold"
                        />
                      </div>
                    )}
                  </div>

                  {/* Short Answer */}
                  <div className={cn(
                    'p-3.5 rounded-xl border transition-all',
                    includeShort ? 'border-[#1c4a59] bg-[#1c4a59]/10' : 'border-slate-200 bg-slate-50 opacity-60'
                  )}>
                    <div className="flex items-center justify-between mb-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={includeShort}
                          onChange={e => setIncludeShort(e.target.checked)}
                          className="rounded text-[#1c4a59] focus:ring-[#1c4a59] w-4 h-4"
                        />
                        <span className="text-xs font-bold text-[#1f2a2e]">Short Answer</span>
                      </label>
                      <span className="text-[11px] font-mono text-[#6a7f84]">Theory</span>
                    </div>
                    {includeShort && (
                      <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-[#1c4a59]/30">
                        <span className="text-xs text-[#6a7f84]">Quantity:</span>
                        <input
                          type="number"
                          min={1}
                          max={15}
                          value={shortCount}
                          onChange={e => setShortCount(Math.max(1, Number(e.target.value)))}
                          className="w-16 text-xs text-center border border-[#bac4c6] rounded-lg py-1 bg-white font-mono font-bold"
                        />
                      </div>
                    )}
                  </div>

                  {/* Essay */}
                  <div className={cn(
                    'p-3.5 rounded-xl border transition-all',
                    includeEssay ? 'border-indigo-400 bg-indigo-50/70' : 'border-slate-200 bg-slate-50 opacity-60'
                  )}>
                    <div className="flex items-center justify-between mb-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={includeEssay}
                          onChange={e => setIncludeEssay(e.target.checked)}
                          className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                        />
                        <span className="text-xs font-bold text-[#1f2a2e]">Essay / Composition</span>
                      </label>
                      <span className="text-[11px] font-mono text-[#6a7f84]">Section C</span>
                    </div>
                    {includeEssay && (
                      <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-indigo-200">
                        <span className="text-xs text-[#6a7f84]">Quantity:</span>
                        <input
                          type="number"
                          min={1}
                          max={5}
                          value={essayCount}
                          onChange={e => setEssayCount(Math.max(1, Number(e.target.value)))}
                          className="w-16 text-xs text-center border border-[#bac4c6] rounded-lg py-1 bg-white font-mono font-bold"
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* Difficulty & Guidance */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  <div>
                    <label className="block text-xs font-bold text-[#1f2a2e] mb-1">
                      Cognitive Rigor & Difficulty
                    </label>
                    <div className="flex items-center gap-2">
                      {(['Foundational', 'Standard', 'Challenging'] as const).map(d => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => setDifficulty(d)}
                          className={cn(
                            'flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold border transition-all cursor-pointer',
                            difficulty === d
                              ? 'bg-[#1c4a59] text-white border-[#1c4a59]'
                              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                          )}
                        >
                          {d}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#1f2a2e] mb-1">
                      Special Teacher Instructions (Optional)
                    </label>
                    <input
                      type="text"
                      value={additionalGuidance}
                      onChange={e => setAdditionalGuidance(e.target.value)}
                      placeholder="e.g. Focus on definitions and diagram questions"
                      className="w-full text-xs border border-[#bac4c6] rounded-xl px-3 py-2 bg-white text-[#1f2a2e] focus:outline-hidden focus:ring-2 focus:ring-[#1c4a59]"
                    />
                  </div>
                </div>
              </div>

              {generationError && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3.5 text-xs text-red-800 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <span>{generationError}</span>
                </div>
              )}
            </>
          ) : (
            /* Step 3: Review Generated Questions */
            <div className="space-y-4">
              <div className="bg-white rounded-2xl p-5 shadow-xs border border-[#bac4c6]/40">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full mb-1">
                      <Sparkles className="w-3 h-3 text-emerald-600" /> Successfully Generated
                    </span>
                    <h3 className="text-base font-bold text-[#1f2a2e]">
                      {generatedResult.suggestedTitle}
                    </h3>
                    <p className="text-xs text-[#6a7f84] mt-0.5">
                      {generatedResult.suggestedDescription}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-mono font-bold bg-slate-100 px-2 py-1 rounded text-slate-800">
                      Duration: {generatedResult.suggestedDurationMinutes} mins
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs text-[#6a7f84] pt-3 border-t border-slate-100">
                  <span>
                    Selected: {selectedQuestionIds.size} of {generatedResult.questions.length} questions
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedQuestionIds(
                          new Set(generatedResult.questions.map(q => q.id))
                        )
                      }
                      className="text-xs font-semibold text-[#1c4a59] hover:underline cursor-pointer"
                    >
                      Select All
                    </button>
                    <span>•</span>
                    <button
                      type="button"
                      onClick={() => setSelectedQuestionIds(new Set())}
                      className="text-xs font-semibold text-slate-500 hover:underline cursor-pointer"
                    >
                      Deselect All
                    </button>
                  </div>
                </div>
              </div>

              {/* Questions List */}
              <div className="space-y-3">
                {generatedResult.questions.map((q, idx) => {
                  const isSelected = selectedQuestionIds.has(q.id);
                  return (
                    <div
                      key={q.id}
                      onClick={() => toggleSelectQuestion(q.id)}
                      className={cn(
                        'bg-white rounded-2xl p-4 border transition-all cursor-pointer',
                        isSelected
                          ? 'border-[#1c4a59] ring-2 ring-[#1c4a59]/15'
                          : 'border-slate-200 opacity-70 hover:opacity-100'
                      )}
                    >
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectQuestion(q.id)}
                            className="rounded text-[#1c4a59] focus:ring-[#1c4a59] w-4 h-4 cursor-pointer"
                            onClick={e => e.stopPropagation()}
                          />
                          <span className="text-xs font-bold text-[#1f2a2e]">
                            Q{idx + 1}.
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
                        </div>
                        <span className="text-xs font-mono font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                          {q.points} {q.points === 1 ? 'pt' : 'pts'}
                        </span>
                      </div>

                      <p className="text-xs sm:text-sm font-medium text-[#1f2a2e] mb-2 leading-relaxed">
                        {q.prompt}
                      </p>

                      {/* Multiple Choice Options Display */}
                      {q.type === 'multiple_choice' && q.options && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 my-2 pl-2">
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
                              <span className="w-5 h-5 rounded-full bg-white flex items-center justify-center font-bold text-[10px] border shrink-0">
                                {String.fromCharCode(65 + optIdx)}
                              </span>
                              <span className="line-clamp-2">{opt}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Correct Answer / Key */}
                      {q.correctAnswer && q.type !== 'multiple_choice' && (
                        <div className="text-xs bg-slate-50 rounded-lg p-2.5 text-slate-700 mt-2 border border-slate-100">
                          <span className="font-bold text-[#1c4a59]">Expected Answer: </span>
                          <span className="line-clamp-3">{q.correctAnswer}</span>
                        </div>
                      )}

                      {/* Rubric Criteria if essay */}
                      {q.rubricCriteria && q.rubricCriteria.length > 0 && (
                        <div className="mt-2 text-[11px] text-slate-600 bg-indigo-50/50 rounded-lg p-2 border border-indigo-100">
                          <span className="font-bold text-indigo-900">Marking Rubric: </span>
                          <span>{q.rubricCriteria.join(' • ')}</span>
                        </div>
                      )}

                      {q.explanation && (
                        <p className="text-[11px] text-emerald-700 mt-1.5 italic">
                          💡 {q.explanation}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="bg-white px-6 py-4 border-t border-[#bac4c6]/40 flex items-center justify-between shrink-0">
          {!generatedResult ? (
            <>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-full text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isGenerating || isReadingFile}
                onClick={handleTriggerGenerate}
                className="inline-flex items-center gap-2 bg-[#faae57] hover:bg-[#e4ae67] text-[#1f2a2e] px-6 py-2.5 rounded-full text-xs font-bold transition-all shadow-xs disabled:opacity-50 cursor-pointer"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Analyzing Notes & Generating Questions...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Generate Questions with AI</span>
                  </>
                )}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setGeneratedResult(null)}
                className="px-4 py-2 rounded-full text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                ← Back to Settings
              </button>
              <button
                type="button"
                onClick={handleConfirmImport}
                disabled={selectedQuestionIds.size === 0}
                className="inline-flex items-center gap-2 bg-[#1c4a59] hover:bg-[#1c4a59]/90 text-white px-6 py-2.5 rounded-full text-xs font-bold transition-all shadow-xs disabled:opacity-50 cursor-pointer"
              >
                <FileCheck className="w-4 h-4" />
                <span>Import {selectedQuestionIds.size} Questions to Assessment</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default LessonNoteQuestionGeneratorModal;
