import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Search,
  Filter,
  Plus,
  Sparkles,
  BookOpen,
  Trash2,
  Edit3,
  Copy,
  Check,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  ListOrdered,
  FileQuestion,
  AlignLeft,
  X,
  FileText,
  Sliders,
  Layers,
  ChevronDown,
  ArrowRight
} from 'lucide-react';
import {
  db,
  type QuestionBankItem,
  type AssessmentQuestion,
  type QuestionType,
  type QuestionDifficulty
} from '../../db/schema';
import { useNotifications } from '../../contexts/NotificationContext';
import { cn } from '../../lib/utils';

interface QuestionBankViewProps {
  onOpenAiGenerator: () => void;
  onCreateAssessmentFromQuestions: (questions: AssessmentQuestion[], subject?: string) => void;
  userRole?: string;
}

export const QuestionBankView: React.FC<QuestionBankViewProps> = ({
  onOpenAiGenerator,
  onCreateAssessmentFromQuestions,
  userRole = 'teacher'
}) => {
  const { showToast } = useNotifications();

  // Live query from IndexedDB questionBank table
  const bankItems = useLiveQuery(() => db.questionBank.toArray()) || [];
  const subjectsFromDB = useLiveQuery(() => db.subjects.toArray()) || [];
  const classesFromDB = useLiveQuery(() => db.classes.toArray()) || [];

  // Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSubject, setSelectedSubject] = useState<string>('All');
  const [selectedTopic, setSelectedTopic] = useState<string>('All');
  const [selectedType, setSelectedType] = useState<string>('All');
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>('All');
  const [selectedClass, setSelectedClass] = useState<string>('All');

  // Multi-selection for batch assessment generation
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());

  // Modal for manual adding or editing a question
  const [isEditorModalOpen, setIsEditorModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<QuestionBankItem | null>(null);

  // Copied indicator state
  const [copiedItemId, setCopiedItemId] = useState<string | null>(null);

  // Form State for Adding / Editing Question
  const [formSubject, setFormSubject] = useState('Mathematics');
  const [formTopic, setFormTopic] = useState('');
  const [formClass, setFormClass] = useState('JHS 1');
  const [formDifficulty, setFormDifficulty] = useState<QuestionDifficulty>('medium');
  const [formType, setFormType] = useState<QuestionType>('multiple_choice');
  const [formPrompt, setFormPrompt] = useState('');
  const [formOptions, setFormOptions] = useState<string[]>(['', '', '', '']);
  const [formCorrectIndex, setFormCorrectIndex] = useState<number>(0);
  const [formCorrectAnswer, setFormCorrectAnswer] = useState('');
  const [formExplanation, setFormExplanation] = useState('');
  const [formPoints, setFormPoints] = useState<number>(2);

  // Subjects available
  const subjectList = useMemo(() => {
    const fromDB = subjectsFromDB.map(s => s.name);
    const fromBank = bankItems.map(b => b.subject);
    const set = Array.from(new Set([...fromDB, ...fromBank])).filter(Boolean).sort();
    return set.length > 0 ? set : ['Mathematics', 'Integrated Science', 'English Language', 'Social Studies', 'ICT'];
  }, [subjectsFromDB, bankItems]);

  // Topics available based on selected subject
  const topicList = useMemo(() => {
    const relevant = selectedSubject === 'All'
      ? bankItems
      : bankItems.filter(b => b.subject?.toLowerCase() === selectedSubject.toLowerCase());
    const set = Array.from(new Set(relevant.map(b => b.topic))).filter(Boolean).sort();
    return set;
  }, [bankItems, selectedSubject]);

  // Class names available
  const classList = useMemo(() => {
    const fromDB = classesFromDB.map(c => c.name);
    const fromBank = bankItems.map(b => b.className).filter(Boolean);
    const set = Array.from(new Set([...fromDB, ...fromBank])).filter(Boolean).sort();
    return set.length > 0 ? set : ['JHS 1', 'JHS 2', 'JHS 3', 'Basic 6'];
  }, [classesFromDB, bankItems]);

  // Filtered Question Bank Items
  const filteredItems = useMemo(() => {
    return bankItems.filter(item => {
      if (selectedSubject !== 'All' && item.subject?.toLowerCase() !== selectedSubject.toLowerCase()) {
        return false;
      }
      if (selectedTopic !== 'All' && item.topic?.toLowerCase() !== selectedTopic.toLowerCase()) {
        return false;
      }
      if (selectedType !== 'All' && item.question?.type !== selectedType) {
        return false;
      }
      if (selectedDifficulty !== 'All' && item.difficulty !== selectedDifficulty) {
        return false;
      }
      if (selectedClass !== 'All' && item.className && item.className !== 'All' && item.className !== selectedClass) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const inPrompt = item.question?.prompt?.toLowerCase().includes(q);
        const inTopic = item.topic?.toLowerCase().includes(q);
        const inSubject = item.subject?.toLowerCase().includes(q);
        const inOptions = item.question?.options?.some(opt => opt.toLowerCase().includes(q));
        const inExplanation = item.question?.explanation?.toLowerCase().includes(q);
        if (!inPrompt && !inTopic && !inSubject && !inOptions && !inExplanation) {
          return false;
        }
      }
      return true;
    });
  }, [bankItems, selectedSubject, selectedTopic, selectedType, selectedDifficulty, selectedClass, searchQuery]);

  // Stats Counters
  const stats = useMemo(() => {
    const total = bankItems.length;
    const mcq = bankItems.filter(i => i.question?.type === 'multiple_choice').length;
    const sa = bankItems.filter(i => i.question?.type === 'short_answer').length;
    const essay = bankItems.filter(i => i.question?.type === 'essay').length;
    return { total, mcq, sa, essay };
  }, [bankItems]);

  // Selection handlers
  const handleToggleSelect = (id: string) => {
    setSelectedItemIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAllFiltered = () => {
    if (selectedItemIds.size === filteredItems.length && filteredItems.length > 0) {
      setSelectedItemIds(new Set());
    } else {
      setSelectedItemIds(new Set(filteredItems.map(i => i.id)));
    }
  };

  // Open modal to add new question
  const handleOpenAddModal = () => {
    setEditingItem(null);
    setFormSubject(selectedSubject !== 'All' ? selectedSubject : subjectList[0] || 'Mathematics');
    setFormTopic(selectedTopic !== 'All' ? selectedTopic : '');
    setFormClass(selectedClass !== 'All' ? selectedClass : 'JHS 1');
    setFormDifficulty('medium');
    setFormType('multiple_choice');
    setFormPrompt('');
    setFormOptions(['', '', '', '']);
    setFormCorrectIndex(0);
    setFormCorrectAnswer('');
    setFormExplanation('');
    setFormPoints(2);
    setIsEditorModalOpen(true);
  };

  // Open modal to edit existing question
  const handleOpenEditModal = (item: QuestionBankItem) => {
    setEditingItem(item);
    setFormSubject(item.subject || 'Mathematics');
    setFormTopic(item.topic || '');
    setFormClass(item.className || 'JHS 1');
    setFormDifficulty(item.difficulty || 'medium');
    setFormType(item.question.type || 'multiple_choice');
    setFormPrompt(item.question.prompt || '');
    setFormOptions(item.question.options && item.question.options.length > 0 ? [...item.question.options] : ['', '', '', '']);
    setFormCorrectIndex(item.question.correctOptionIndex ?? 0);
    setFormCorrectAnswer(item.question.correctAnswer || '');
    setFormExplanation(item.question.explanation || '');
    setFormPoints(item.question.points || 2);
    setIsEditorModalOpen(true);
  };

  // Save question (Add or Update)
  const handleSaveQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formPrompt.trim()) {
      showToast('Please provide a question prompt.', 'error');
      return;
    }
    if (!formTopic.trim()) {
      showToast('Please specify a topic or strand for categorization.', 'error');
      return;
    }

    const now = Date.now();
    const id = editingItem ? editingItem.id : `qb-${now}-${Math.random().toString(36).substring(2, 7)}`;

    const questionData: AssessmentQuestion = {
      id: editingItem ? editingItem.question.id : `q-${id}`,
      questionNumber: 1,
      type: formType,
      prompt: formPrompt.trim(),
      points: Number(formPoints) || 1,
      strand: formTopic.trim(),
      subStrand: formTopic.trim(),
      explanation: formExplanation.trim() || undefined
    };

    if (formType === 'multiple_choice') {
      questionData.options = formOptions.map(opt => opt.trim()).filter(Boolean);
      questionData.correctOptionIndex = formCorrectIndex;
      questionData.correctAnswer = formOptions[formCorrectIndex]?.trim() || '';
    } else {
      questionData.correctAnswer = formCorrectAnswer.trim();
    }

    const item: QuestionBankItem = {
      id,
      subject: formSubject,
      topic: formTopic.trim(),
      className: formClass,
      difficulty: formDifficulty,
      question: questionData,
      usageCount: editingItem ? editingItem.usageCount || 0 : 0,
      source: editingItem ? editingItem.source : 'manual',
      createdAt: editingItem ? editingItem.createdAt : now,
      updatedAt: now
    };

    try {
      await db.questionBank.put(item);
      // Sync to server endpoint as well
      try {
        await fetch('/api/question-bank', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item)
        });
      } catch (e) {}

      showToast(editingItem ? 'Question updated in bank.' : 'Question saved to bank.', 'success');
      setIsEditorModalOpen(false);
    } catch (err: any) {
      showToast('Failed to save question: ' + err.message, 'error');
    }
  };

  // Delete question
  const handleDeleteItem = async (id: string) => {
    try {
      await db.questionBank.delete(id);
      try {
        await fetch(`/api/question-bank/${id}`, { method: 'DELETE' });
      } catch (e) {}

      setSelectedItemIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      showToast('Question deleted from bank.', 'info');
    } catch (err: any) {
      showToast('Error deleting question: ' + err.message, 'error');
    }
  };

  // Batch delete
  const handleBatchDelete = async () => {
    if (selectedItemIds.size === 0) return;
    const ids = Array.from(selectedItemIds);
    try {
      await db.questionBank.bulkDelete(ids);
      for (const id of ids) {
        try {
          await fetch(`/api/question-bank/${id}`, { method: 'DELETE' });
        } catch (e) {}
      }
      setSelectedItemIds(new Set());
      showToast(`Deleted ${ids.length} questions from bank.`, 'info');
    } catch (err: any) {
      showToast('Batch delete failed: ' + err.message, 'error');
    }
  };

  // Create assessment from selected questions
  const handleCreateAssessmentFromSelected = () => {
    const selected = bankItems.filter(i => selectedItemIds.has(i.id));
    if (selected.length === 0) {
      showToast('Please select at least one question first.', 'info');
      return;
    }

    const questions: AssessmentQuestion[] = selected.map((item, index) => ({
      ...item.question,
      questionNumber: index + 1
    }));

    const commonSubject = selected[0]?.subject || (selectedSubject !== 'All' ? selectedSubject : 'General');
    onCreateAssessmentFromQuestions(questions, commonSubject);
  };

  // Quick single create
  const handleUseSingleQuestion = (item: QuestionBankItem) => {
    onCreateAssessmentFromQuestions([{ ...item.question, questionNumber: 1 }], item.subject);
  };

  // Copy question text to clipboard
  const handleCopyQuestionText = (item: QuestionBankItem) => {
    let text = `${item.question.prompt}\n`;
    if (item.question.type === 'multiple_choice' && item.question.options) {
      item.question.options.forEach((opt, idx) => {
        const letter = String.fromCharCode(65 + idx);
        text += `${letter}) ${opt}\n`;
      });
      if (item.question.correctOptionIndex !== undefined) {
        text += `Correct: ${String.fromCharCode(65 + item.question.correctOptionIndex)}) ${item.question.options[item.question.correctOptionIndex]}\n`;
      }
    } else if (item.question.correctAnswer) {
      text += `Model Answer: ${item.question.correctAnswer}\n`;
    }
    if (item.question.explanation) {
      text += `Explanation: ${item.question.explanation}\n`;
    }

    navigator.clipboard.writeText(text);
    setCopiedItemId(item.id);
    showToast('Question copied to clipboard.', 'success');
    setTimeout(() => setCopiedItemId(null), 2000);
  };

  return (
    <div className="space-y-5">
      {/* Question Bank Header Card */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-[#1c4a59]/10 text-[#1c4a59]">
              <BookOpen className="w-3.5 h-3.5 text-[#1c4a59]" />
              Institutional Question Repository
            </span>
            <span className="text-xs text-slate-500 font-medium">
              {stats.total} Total Questions Stored
            </span>
          </div>
          <h2 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">
            Centralized Assessment Question Bank
          </h2>
          <p className="text-xs text-slate-500 max-w-2xl leading-relaxed">
            Store, categorize by subject and topic, and reuse curriculum questions across Homework, Class Tests, and Summative Examinations. Generate new questions with Gemini AI directly from your uploaded lesson plans.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
          <button
            type="button"
            onClick={onOpenAiGenerator}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-bold text-[#1c4a59] bg-[#faae57]/20 hover:bg-[#faae57]/30 border border-[#faae57]/50 rounded-xl transition-all cursor-pointer active:scale-95 shadow-2xs"
            title="Generate questions from saved lesson notes or document uploads"
          >
            <Sparkles className="w-4 h-4 text-[#faae57]" />
            <span>Generate via AI</span>
          </button>

          <button
            type="button"
            onClick={handleOpenAddModal}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-[#1c4a59] hover:bg-[#1c4a59]/90 rounded-xl transition-all cursor-pointer active:scale-95 shadow-xs"
          >
            <Plus className="w-4 h-4 text-[#faae57]" />
            <span>Add Question</span>
          </button>
        </div>
      </div>

      {/* Quick Type Counter Chips */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-2xs flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold text-xs">
              <ListOrdered className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Multiple Choice</p>
              <p className="text-base font-extrabold text-slate-900">{stats.mcq}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-2xs flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-sky-50 text-sky-700 flex items-center justify-center font-bold text-xs">
              <FileQuestion className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Short Answer</p>
              <p className="text-base font-extrabold text-slate-900">{stats.sa}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-2xs flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center font-bold text-xs">
              <AlignLeft className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Essay / Theory</p>
              <p className="text-base font-extrabold text-slate-900">{stats.essay}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-2xs flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#1c4a59]/10 text-[#1c4a59] flex items-center justify-center font-bold text-xs">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Total Repository</p>
              <p className="text-base font-extrabold text-slate-900">{stats.total}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Live Search */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-2.5" />
            <input
              type="text"
              placeholder="Search by keyword, prompt, topic, explanation..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1c4a59]/20 focus:border-[#1c4a59]"
            />
          </div>

          {/* Quick Selectors */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Subject Selector */}
            <select
              value={selectedSubject}
              onChange={e => {
                setSelectedSubject(e.target.value);
                setSelectedTopic('All');
              }}
              className="px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-700 font-semibold focus:outline-none focus:ring-2 focus:ring-[#1c4a59]/20"
            >
              <option value="All">All Subjects</option>
              {subjectList.map(subj => (
                <option key={subj} value={subj}>{subj}</option>
              ))}
            </select>

            {/* Type Selector */}
            <select
              value={selectedType}
              onChange={e => setSelectedType(e.target.value)}
              className="px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-700 font-semibold focus:outline-none focus:ring-2 focus:ring-[#1c4a59]/20"
            >
              <option value="All">All Question Types</option>
              <option value="multiple_choice">Multiple Choice (MCQ)</option>
              <option value="short_answer">Short Answer</option>
              <option value="essay">Essay / Theory</option>
            </select>

            {/* Difficulty Selector */}
            <select
              value={selectedDifficulty}
              onChange={e => setSelectedDifficulty(e.target.value)}
              className="px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-700 font-semibold focus:outline-none focus:ring-2 focus:ring-[#1c4a59]/20"
            >
              <option value="All">All Difficulties</option>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>

            {/* Class Selector */}
            <select
              value={selectedClass}
              onChange={e => setSelectedClass(e.target.value)}
              className="px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-700 font-semibold focus:outline-none focus:ring-2 focus:ring-[#1c4a59]/20"
            >
              <option value="All">All Classes</option>
              {classList.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Topic Pills if topics available */}
        {topicList.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-1">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider shrink-0 mr-1">
              Topics:
            </span>
            <button
              type="button"
              onClick={() => setSelectedTopic('All')}
              className={cn(
                'px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer',
                selectedTopic === 'All'
                  ? 'bg-[#1c4a59] text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              )}
            >
              All Topics
            </button>
            {topicList.map(top => (
              <button
                key={top}
                type="button"
                onClick={() => setSelectedTopic(top)}
                className={cn(
                  'px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer',
                  selectedTopic === top
                    ? 'bg-[#1c4a59] text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                )}
              >
                {top}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Multi-Selection Sticky Bar */}
      {selectedItemIds.size > 0 && (
        <div className="sticky top-20 z-20 bg-[#1c4a59] text-white p-3.5 rounded-2xl shadow-lg flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-[#faae57] text-[#1c4a59] font-black text-xs flex items-center justify-center">
              {selectedItemIds.size}
            </span>
            <span className="text-xs font-bold">
              {selectedItemIds.size} {selectedItemIds.size === 1 ? 'question' : 'questions'} selected
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleBatchDelete}
              className="px-3 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 text-xs font-bold transition cursor-pointer"
            >
              Delete Selected
            </button>
            <button
              type="button"
              onClick={() => setSelectedItemIds(new Set())}
              className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition cursor-pointer"
            >
              Deselect All
            </button>
            <button
              type="button"
              onClick={handleCreateAssessmentFromSelected}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-[#faae57] text-[#1c4a59] hover:bg-[#e4ae67] text-xs font-black transition cursor-pointer active:scale-95 shadow-xs"
            >
              <span>Build Assessment</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Question List Header */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="select-all-filtered"
            checked={selectedItemIds.size === filteredItems.length && filteredItems.length > 0}
            onChange={handleSelectAllFiltered}
            className="w-4 h-4 rounded text-[#1c4a59] border-slate-300 focus:ring-[#1c4a59] cursor-pointer"
          />
          <label htmlFor="select-all-filtered" className="text-xs font-bold text-slate-700 cursor-pointer select-none">
            Select All ({filteredItems.length} filtered)
          </label>
        </div>
      </div>

      {/* Question Cards Grid */}
      {filteredItems.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center border border-slate-200/80 shadow-xs space-y-3">
          <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
            <Search className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-slate-800">No questions match your current filters</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Try adjusting your search criteria, or add new questions to the bank manually or using the AI generator.
          </p>
          <div className="flex items-center justify-center gap-2 pt-2">
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setSelectedSubject('All');
                setSelectedTopic('All');
                setSelectedType('All');
                setSelectedDifficulty('All');
                setSelectedClass('All');
              }}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
            >
              Reset Filters
            </button>
            <button
              type="button"
              onClick={handleOpenAddModal}
              className="px-4 py-2 bg-[#1c4a59] text-white hover:bg-[#1c4a59]/90 rounded-xl text-xs font-bold transition cursor-pointer"
            >
              Add New Question
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredItems.map(item => {
            const isSelected = selectedItemIds.has(item.id);
            const q = item.question;

            return (
              <div
                key={item.id}
                className={cn(
                  'bg-white rounded-2xl p-4 sm:p-5 border transition-all shadow-xs space-y-3',
                  isSelected
                    ? 'border-[#1c4a59] ring-2 ring-[#1c4a59]/15'
                    : 'border-slate-200/80 hover:border-slate-300'
                )}
              >
                {/* Card Top Row: Checkbox, Badges, Actions */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleToggleSelect(item.id)}
                      className="w-4 h-4 rounded text-[#1c4a59] border-slate-300 focus:ring-[#1c4a59] cursor-pointer shrink-0 mt-0.5"
                    />

                    {/* Question Type Badge */}
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold uppercase tracking-wide',
                        q.type === 'multiple_choice' && 'bg-emerald-100 text-emerald-800',
                        q.type === 'short_answer' && 'bg-sky-100 text-sky-800',
                        q.type === 'essay' && 'bg-amber-100 text-amber-800'
                      )}
                    >
                      {q.type === 'multiple_choice' && <ListOrdered className="w-3 h-3" />}
                      {q.type === 'short_answer' && <FileQuestion className="w-3 h-3" />}
                      {q.type === 'essay' && <AlignLeft className="w-3 h-3" />}
                      <span>
                        {q.type === 'multiple_choice' ? 'Multiple Choice' : q.type === 'short_answer' ? 'Short Answer' : 'Essay / Theory'}
                      </span>
                    </span>

                    {/* Subject Chip */}
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#1c4a59]/10 text-[#1c4a59]">
                      {item.subject}
                    </span>

                    {/* Topic Chip */}
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700">
                      {item.topic}
                    </span>

                    {/* Difficulty Badge */}
                    {item.difficulty && (
                      <span
                        className={cn(
                          'px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider',
                          item.difficulty === 'easy' && 'bg-emerald-50 text-emerald-700',
                          item.difficulty === 'medium' && 'bg-yellow-50 text-yellow-800',
                          item.difficulty === 'hard' && 'bg-rose-50 text-rose-700'
                        )}
                      >
                        {item.difficulty}
                      </span>
                    )}

                    {/* Points */}
                    <span className="text-[11px] font-bold text-slate-500 font-mono">
                      {q.points} {q.points === 1 ? 'pt' : 'pts'}
                    </span>
                  </div>

                  {/* Top Right Action Buttons */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleCopyQuestionText(item)}
                      className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition"
                      title="Copy Question Text"
                    >
                      {copiedItemId === item.id ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleOpenEditModal(item)}
                      className="p-1.5 text-slate-400 hover:text-[#1c4a59] hover:bg-[#1c4a59]/10 rounded-lg transition"
                      title="Edit Question"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDeleteItem(item.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                      title="Delete Question"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      onClick={() => handleUseSingleQuestion(item)}
                      className="inline-flex items-center gap-1 px-3 py-1 bg-[#1c4a59] hover:bg-[#1c4a59]/90 text-white rounded-lg text-xs font-bold transition ml-1 cursor-pointer active:scale-95"
                    >
                      <span>Use</span>
                      <ArrowRight className="w-3 h-3 text-[#faae57]" />
                    </button>
                  </div>
                </div>

                {/* Prompt Text */}
                <div className="pl-6 text-sm font-semibold text-slate-900 whitespace-pre-line leading-relaxed">
                  {q.prompt}
                </div>

                {/* Question Details: Options for MCQ */}
                {q.type === 'multiple_choice' && q.options && q.options.length > 0 && (
                  <div className="pl-6 grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                    {q.options.map((opt, optIdx) => {
                      const isCorrect = q.correctOptionIndex === optIdx;
                      const letter = String.fromCharCode(65 + optIdx);

                      return (
                        <div
                          key={optIdx}
                          className={cn(
                            'p-2.5 rounded-xl border text-xs flex items-center gap-2.5 transition',
                            isCorrect
                              ? 'bg-emerald-50/80 border-emerald-300 text-emerald-950 font-bold'
                              : 'bg-slate-50 border-slate-200/80 text-slate-700'
                          )}
                        >
                          <span
                            className={cn(
                              'w-5 h-5 rounded-md flex items-center justify-center font-bold text-[11px] shrink-0',
                              isCorrect ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-700'
                            )}
                          >
                            {letter}
                          </span>
                          <span className="flex-1">{opt}</span>
                          {isCorrect && (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 ml-auto" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Question Details: Short Answer / Essay Model Answer */}
                {(q.type === 'short_answer' || q.type === 'essay') && q.correctAnswer && (
                  <div className="pl-6 pt-1">
                    <div className="p-3 bg-emerald-50/50 border border-emerald-200/80 rounded-xl space-y-1">
                      <span className="text-[10px] font-black uppercase tracking-wider text-emerald-800 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        Model Answer / Key Points:
                      </span>
                      <p className="text-xs text-slate-800 whitespace-pre-line leading-relaxed">
                        {q.correctAnswer}
                      </p>
                    </div>
                  </div>
                )}

                {/* Rubric Criteria if Essay */}
                {q.rubricCriteria && q.rubricCriteria.length > 0 && (
                  <div className="pl-6 flex flex-wrap items-center gap-1.5 pt-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Marking Criteria:
                    </span>
                    {q.rubricCriteria.map((crit, cIdx) => (
                      <span
                        key={cIdx}
                        className="px-2 py-0.5 rounded-md bg-slate-100 text-[11px] text-slate-700 border border-slate-200"
                      >
                        {crit}
                      </span>
                    ))}
                  </div>
                )}

                {/* Educational Explanation / Rationale */}
                {q.explanation && (
                  <div className="pl-6 text-[11px] text-slate-500 bg-slate-50 p-2.5 rounded-xl border border-slate-200/60 flex items-start gap-2">
                    <HelpCircle className="w-3.5 h-3.5 text-[#1c4a59] shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-slate-700 mr-1">Rationale:</span>
                      {q.explanation}
                    </div>
                  </div>
                )}

                {/* Card Footer: Metadata info */}
                <div className="pl-6 pt-1 flex items-center justify-between text-[11px] text-slate-400 border-t border-slate-100">
                  <div className="flex items-center gap-3">
                    {item.className && (
                      <span>Class: <strong className="text-slate-600">{item.className}</strong></span>
                    )}
                    {item.usageCount !== undefined && (
                      <span>Used in <strong className="text-slate-600">{item.usageCount}</strong> assessments</span>
                    )}
                    {item.createdBy && (
                      <span>By: <strong className="text-slate-600">{item.createdBy}</strong></span>
                    )}
                  </div>
                  <div>
                    <span>{new Date(item.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Question Authoring & Editing Modal */}
      {isEditorModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-50 p-3 sm:p-6 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden my-auto animate-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-[#1c4a59]/10 text-[#1c4a59] flex items-center justify-center font-bold">
                  <BookOpen className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    {editingItem ? 'Edit Question in Bank' : 'Add Question to Repository'}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Categorize by subject and curriculum topic for future reuse across assessments
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsEditorModalOpen(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveQuestion} className="p-6 space-y-4 overflow-y-auto flex-1 text-xs">
              {/* Row 1: Subject, Topic, Class */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Subject <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formSubject}
                    onChange={e => setFormSubject(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#1c4a59]/20"
                  >
                    {subjectList.map(subj => (
                      <option key={subj} value={subj}>{subj}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Topic / Strand <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Linear Equations"
                    value={formTopic}
                    onChange={e => setFormTopic(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#1c4a59]/20"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Class Scope
                  </label>
                  <select
                    value={formClass}
                    onChange={e => setFormClass(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#1c4a59]/20"
                  >
                    <option value="All">All Classes</option>
                    {classList.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Row 2: Type, Difficulty, Points */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Question Type <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formType}
                    onChange={e => setFormType(e.target.value as QuestionType)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#1c4a59]/20"
                  >
                    <option value="multiple_choice">Multiple Choice (MCQ)</option>
                    <option value="short_answer">Short Answer</option>
                    <option value="essay">Essay / Theory</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Difficulty Level
                  </label>
                  <select
                    value={formDifficulty}
                    onChange={e => setFormDifficulty(e.target.value as QuestionDifficulty)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#1c4a59]/20"
                  >
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Points / Marks
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={formPoints}
                    onChange={e => setFormPoints(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#1c4a59]/20"
                  />
                </div>
              </div>

              {/* Question Prompt */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Question Prompt <span className="text-red-500">*</span>
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="Type the question text clearly here..."
                  value={formPrompt}
                  onChange={e => setFormPrompt(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#1c4a59]/20"
                />
              </div>

              {/* MCQ Options */}
              {formType === 'multiple_choice' && (
                <div className="space-y-2 pt-1 border-t border-slate-100">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                      Multiple Choice Options (Select the correct option):
                    </label>
                  </div>
                  <div className="space-y-2">
                    {formOptions.map((opt, optIdx) => {
                      const letter = String.fromCharCode(65 + optIdx);
                      const isCorrect = formCorrectIndex === optIdx;

                      return (
                        <div key={optIdx} className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setFormCorrectIndex(optIdx)}
                            className={cn(
                              'w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 transition cursor-pointer',
                              isCorrect
                                ? 'bg-emerald-600 text-white shadow-xs'
                                : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                            )}
                            title={isCorrect ? 'Correct option' : 'Click to mark as correct option'}
                          >
                            {letter}
                          </button>
                          <input
                            type="text"
                            required
                            placeholder={`Option ${letter} text`}
                            value={opt}
                            onChange={e => {
                              const next = [...formOptions];
                              next[optIdx] = e.target.value;
                              setFormOptions(next);
                            }}
                            className={cn(
                              'flex-1 px-3 py-1.5 bg-slate-50 border rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[#1c4a59]/20',
                              isCorrect ? 'border-emerald-300 bg-emerald-50/30' : 'border-slate-200'
                            )}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Model Answer (Short Answer & Essay) */}
              {formType !== 'multiple_choice' && (
                <div className="pt-1 border-t border-slate-100">
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Model Answer / Marking Scheme
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Provide expected solution or key scoring points..."
                    value={formCorrectAnswer}
                    onChange={e => setFormCorrectAnswer(e.target.value)}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#1c4a59]/20"
                  />
                </div>
              )}

              {/* Educational Explanation */}
              <div className="pt-1 border-t border-slate-100">
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Educational Explanation / Feedback
                </label>
                <input
                  type="text"
                  placeholder="Optional explanation shown during review or student self-check"
                  value={formExplanation}
                  onChange={e => setFormExplanation(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#1c4a59]/20"
                />
              </div>

              {/* Form Footer */}
              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsEditorModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-[#1c4a59] hover:bg-[#1c4a59]/90 text-white font-bold transition cursor-pointer shadow-xs"
                >
                  {editingItem ? 'Save Changes' : 'Add to Bank'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
