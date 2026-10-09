import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  X,
  BookOpen,
  Search,
  Filter,
  CheckCircle2,
  Plus,
  ListOrdered,
  FileQuestion,
  AlignLeft,
  ArrowRight,
  Check
} from 'lucide-react';
import {
  db,
  type QuestionBankItem,
  type AssessmentQuestion,
  type QuestionType
} from '../../db/schema';
import { cn } from '../../lib/utils';

interface QuestionBankImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportQuestions: (questions: AssessmentQuestion[]) => void;
  defaultSubject?: string;
  defaultClass?: string;
}

export const QuestionBankImportModal: React.FC<QuestionBankImportModalProps> = ({
  isOpen,
  onClose,
  onImportQuestions,
  defaultSubject = 'All',
  defaultClass = 'All'
}) => {
  const bankItems = useLiveQuery(() => db.questionBank.toArray()) || [];

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSubject, setSelectedSubject] = useState<string>(defaultSubject || 'All');
  const [selectedTopic, setSelectedTopic] = useState<string>('All');
  const [selectedType, setSelectedType] = useState<string>('All');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Subjects available
  const subjectList = useMemo(() => {
    const list = Array.from(new Set(bankItems.map(b => b.subject))).filter(Boolean).sort();
    return list.length > 0 ? list : ['Mathematics', 'Integrated Science', 'English Language', 'Social Studies', 'ICT'];
  }, [bankItems]);

  // Topics available
  const topicList = useMemo(() => {
    const filtered = selectedSubject === 'All'
      ? bankItems
      : bankItems.filter(b => b.subject?.toLowerCase() === selectedSubject.toLowerCase());
    return Array.from(new Set(filtered.map(b => b.topic))).filter(Boolean).sort();
  }, [bankItems, selectedSubject]);

  // Filtered items
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
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const inPrompt = item.question?.prompt?.toLowerCase().includes(q);
        const inTopic = item.topic?.toLowerCase().includes(q);
        const inSubject = item.subject?.toLowerCase().includes(q);
        if (!inPrompt && !inTopic && !inSubject) return false;
      }
      return true;
    });
  }, [bankItems, selectedSubject, selectedTopic, selectedType, searchQuery]);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.size === filteredItems.length && filteredItems.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredItems.map(i => i.id)));
    }
  };

  const handleConfirmImport = () => {
    const selected = bankItems.filter(i => selectedIds.has(i.id));
    if (selected.length === 0) return;

    const questionsToImport: AssessmentQuestion[] = selected.map((item, idx) => ({
      ...item.question,
      id: `q-imported-${Date.now()}-${idx}`
    }));

    // Update usage counts in bank
    for (const item of selected) {
      db.questionBank.update(item.id, {
        usageCount: (item.usageCount || 0) + 1
      }).catch(() => {});
    }

    onImportQuestions(questionsToImport);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-50 p-3 sm:p-6 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden my-auto animate-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#1c4a59]/10 text-[#1c4a59] flex items-center justify-center font-bold">
              <BookOpen className="w-4 h-4 text-[#1c4a59]" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Import Questions from Repository Bank
              </h3>
              <p className="text-[11px] text-slate-500">
                Browse stored curriculum questions and import them directly into this assessment
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Toolbar & Filters */}
        <div className="p-4 border-b border-slate-100 space-y-2.5 bg-white">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-2.5" />
              <input
                type="text"
                placeholder="Search question bank by keyword..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1c4a59]/20"
              />
            </div>

            {/* Subject Selector */}
            <select
              value={selectedSubject}
              onChange={e => {
                setSelectedSubject(e.target.value);
                setSelectedTopic('All');
              }}
              className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-700 focus:outline-none"
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
              className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-700 focus:outline-none"
            >
              <option value="All">All Types</option>
              <option value="multiple_choice">MCQ</option>
              <option value="short_answer">Short Answer</option>
              <option value="essay">Essay</option>
            </select>
          </div>

          {/* Topic Pills */}
          {topicList.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider shrink-0">
                Topic:
              </span>
              <button
                type="button"
                onClick={() => setSelectedTopic('All')}
                className={cn(
                  'px-2 py-0.5 rounded-lg text-[11px] font-semibold whitespace-nowrap transition cursor-pointer',
                  selectedTopic === 'All' ? 'bg-[#1c4a59] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                )}
              >
                All
              </button>
              {topicList.map(top => (
                <button
                  key={top}
                  type="button"
                  onClick={() => setSelectedTopic(top)}
                  className={cn(
                    'px-2 py-0.5 rounded-lg text-[11px] font-semibold whitespace-nowrap transition cursor-pointer',
                    selectedTopic === top ? 'bg-[#1c4a59] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  )}
                >
                  {top}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Selection Status */}
        <div className="px-6 py-2 bg-slate-50 flex items-center justify-between text-xs border-b border-slate-100">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="select-all-import"
              checked={selectedIds.size === filteredItems.length && filteredItems.length > 0}
              onChange={handleSelectAll}
              className="w-4 h-4 rounded text-[#1c4a59] border-slate-300 focus:ring-[#1c4a59] cursor-pointer"
            />
            <label htmlFor="select-all-import" className="font-bold text-slate-700 cursor-pointer select-none">
              Select All ({filteredItems.length} matching)
            </label>
          </div>
          <span className="text-slate-500 font-semibold">
            {selectedIds.size} selected
          </span>
        </div>

        {/* Question Cards List */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-3 flex-1 text-xs">
          {filteredItems.length === 0 ? (
            <div className="text-center py-12 space-y-2 text-slate-400">
              <BookOpen className="w-8 h-8 mx-auto opacity-50" />
              <p className="font-bold text-slate-600 text-sm">No matching questions in repository</p>
              <p className="text-xs">Adjust your subject or topic filters to find questions.</p>
            </div>
          ) : (
            filteredItems.map(item => {
              const isSelected = selectedIds.has(item.id);
              const q = item.question;

              return (
                <div
                  key={item.id}
                  onClick={() => toggleSelect(item.id)}
                  className={cn(
                    'p-3.5 rounded-xl border transition-all cursor-pointer space-y-2',
                    isSelected
                      ? 'bg-[#1c4a59]/5 border-[#1c4a59] ring-2 ring-[#1c4a59]/20'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {}} // handled by card onClick
                        className="w-4 h-4 rounded text-[#1c4a59] border-slate-300 pointer-events-none"
                      />
                      <span
                        className={cn(
                          'px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider',
                          q.type === 'multiple_choice' && 'bg-emerald-100 text-emerald-800',
                          q.type === 'short_answer' && 'bg-sky-100 text-sky-800',
                          q.type === 'essay' && 'bg-amber-100 text-amber-800'
                        )}
                      >
                        {q.type === 'multiple_choice' ? 'MCQ' : q.type === 'short_answer' ? 'Short Answer' : 'Essay'}
                      </span>
                      <span className="font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md text-[11px]">
                        {item.subject}
                      </span>
                      <span className="text-slate-500 font-medium text-[11px]">
                        {item.topic}
                      </span>
                    </div>

                    <span className="font-bold font-mono text-slate-500 text-[11px] shrink-0">
                      {q.points} {q.points === 1 ? 'pt' : 'pts'}
                    </span>
                  </div>

                  <p className="font-semibold text-slate-800 pl-6 leading-relaxed">
                    {q.prompt}
                  </p>

                  {q.type === 'multiple_choice' && q.options && (
                    <div className="pl-6 grid grid-cols-2 gap-1.5 pt-0.5">
                      {q.options.map((opt, optIdx) => (
                        <div
                          key={optIdx}
                          className={cn(
                            'px-2 py-1 rounded-md text-[11px] truncate',
                            q.correctOptionIndex === optIdx
                              ? 'bg-emerald-100/70 text-emerald-900 font-bold'
                              : 'bg-slate-50 text-slate-600'
                          )}
                        >
                          <span className="font-bold mr-1">{String.fromCharCode(65 + optIdx)})</span>
                          {opt}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50/50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition cursor-pointer"
          >
            Cancel
          </button>

          <button
            type="button"
            disabled={selectedIds.size === 0}
            onClick={handleConfirmImport}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-[#1c4a59] hover:bg-[#1c4a59]/90 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold transition cursor-pointer active:scale-95 shadow-xs"
          >
            <span>Import {selectedIds.size > 0 ? `${selectedIds.size} Questions` : 'Questions'}</span>
            <ArrowRight className="w-3.5 h-3.5 text-[#faae57]" />
          </button>
        </div>
      </div>
    </div>
  );
};
