import React, { useState } from 'react';
import {
  X,
  Plus,
  Trash2,
  Award,
  Calendar,
  BookOpen,
  FileText,
  Sparkles,
  Paperclip,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import type {
  Assessment,
  AssessmentCategory,
  AssessmentRubricCriterion,
  AssessmentAttachment
} from '../../db/schema';
import { cn } from '../../lib/utils';

interface AssessmentEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (assessment: Assessment) => Promise<void>;
  initialData?: Assessment | null;
  classes: string[];
  subjects: string[];
  currentTerm?: string;
  currentAcademicYear?: string;
  defaultTeacherName?: string;
  defaultTeacherId?: string;
}

const RUBRIC_PRESETS: Record<
  string,
  { label: string; criteria: AssessmentRubricCriterion[] }
> = {
  general: {
    label: 'Standard 3-Part Rubric (Understanding, Method, Presentation)',
    criteria: [
      { id: 'crit-1', criterion: 'Knowledge & Concept Mastery', description: 'Accurate comprehension of core syllabus concepts', maxPoints: 10 },
      { id: 'crit-2', criterion: 'Method & Problem-Solving', description: 'Logical steps, equations, and derivation process', maxPoints: 6 },
      { id: 'crit-3', criterion: 'Presentation & Completeness', description: 'Neatness, organization, and answered all questions', maxPoints: 4 }
    ]
  },
  essay: {
    label: 'English / Language Arts Composition Rubric',
    criteria: [
      { id: 'crit-1', criterion: 'Format & Formal Mechanics', description: 'Heading, addresses, paragraphs, proper layout', maxPoints: 6 },
      { id: 'crit-2', criterion: 'Content, Depth & Reasoning', description: 'Rich ideas, coherent thesis, persuasive examples', maxPoints: 12 },
      { id: 'crit-3', criterion: 'Grammar, Concord & Syntax', description: 'Accurate tenses, varied vocabulary, flawless mechanics', maxPoints: 12 }
    ]
  },
  science_lab: {
    label: 'Science Lab & Practical Report Rubric',
    criteria: [
      { id: 'crit-1', criterion: 'Hypothesis & Apparatus Setup', description: 'Clear scientific objective and correctly chosen apparatus', maxPoints: 5 },
      { id: 'crit-2', criterion: 'Data Observation & Recording', description: 'Accurate measurements, tables, units, and graph plots', maxPoints: 10 },
      { id: 'crit-3', criterion: 'Analysis, Inference & Conclusion', description: 'Deductions supported by findings and error discussion', maxPoints: 10 }
    ]
  },
  exam_paper: {
    label: 'Standard 70-Point Examination Rubric',
    criteria: [
      { id: 'crit-1', criterion: 'Section A - Objective Multiple Choice', description: 'Multiple choice questions testing syllabus recall', maxPoints: 30 },
      { id: 'crit-2', criterion: 'Section B - Core Theoretical Questions', description: 'Compulsory descriptive and analytical questions', maxPoints: 25 },
      { id: 'crit-3', criterion: 'Section C - Applied Problem Solving', description: 'Calculations, proofs, and real-world applications', maxPoints: 15 }
    ]
  }
};

export const AssessmentEditorModal: React.FC<AssessmentEditorModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialData,
  classes,
  subjects,
  currentTerm = 'Term 1',
  currentAcademicYear = '2025/2026',
  defaultTeacherName = 'Teacher',
  defaultTeacherId = 'staff-01'
}) => {
  if (!isOpen) return null;

  const [category, setCategory] = useState<AssessmentCategory>(
    initialData?.category || 'homework'
  );
  const [title, setTitle] = useState(initialData?.title || '');
  const [subject, setSubject] = useState(
    initialData?.subject || subjects[0] || 'Integrated Science'
  );
  const [targetClass, setTargetClass] = useState(
    initialData?.class || classes[0] || 'JHS 1'
  );
  const [academicYear, setAcademicYear] = useState(
    initialData?.academicYear || currentAcademicYear
  );
  const [term, setTerm] = useState(initialData?.term || currentTerm);
  const [dueDate, setDueDate] = useState(
    initialData?.dueDate || new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );
  const [maxScore, setMaxScore] = useState<number>(initialData?.maxScore || 20);
  const [weightPercentage, setWeightPercentage] = useState<number>(
    initialData?.weightPercentage || (category === 'examination' ? 70 : 10)
  );
  const [description, setDescription] = useState(initialData?.description || '');

  // Rubric
  const [rubric, setRubric] = useState<AssessmentRubricCriterion[]>(
    initialData?.rubric && initialData.rubric.length > 0
      ? initialData.rubric
      : RUBRIC_PRESETS.general.criteria
  );

  // Attachments
  const [attachments, setAttachments] = useState<AssessmentAttachment[]>(
    initialData?.attachments || []
  );
  const [newAttachmentName, setNewAttachmentName] = useState('');
  const [newAttachmentUrl, setNewAttachmentUrl] = useState('');

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Rubric sum
  const rubricTotal = rubric.reduce((sum, item) => sum + (Number(item.maxPoints) || 0), 0);

  const handleApplyPreset = (presetKey: string) => {
    const preset = RUBRIC_PRESETS[presetKey];
    if (preset) {
      setRubric(preset.criteria);
      const total = preset.criteria.reduce((sum, c) => sum + c.maxPoints, 0);
      setMaxScore(total);
    }
  };

  const handleAddCriterion = () => {
    const newCrit: AssessmentRubricCriterion = {
      id: `crit-${Date.now()}`,
      criterion: 'New Criterion',
      description: 'Describe grading standard here',
      maxPoints: 5
    };
    setRubric([...rubric, newCrit]);
  };

  const handleUpdateCriterion = (
    index: number,
    field: keyof AssessmentRubricCriterion,
    value: any
  ) => {
    const updated = [...rubric];
    updated[index] = { ...updated[index], [field]: value };
    setRubric(updated);
  };

  const handleRemoveCriterion = (index: number) => {
    if (rubric.length <= 1) return;
    setRubric(rubric.filter((_, i) => i !== index));
  };

  const handleAddAttachment = () => {
    if (!newAttachmentName.trim()) return;
    setAttachments([
      ...attachments,
      {
        name: newAttachmentName.trim(),
        url: newAttachmentUrl.trim() || '#',
        size: 150000,
        type: 'document'
      }
    ]);
    setNewAttachmentName('');
    setNewAttachmentUrl('');
  };

  const handleRemoveAttachment = (index: number) => {
    setAttachments(attachments.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!title.trim()) {
      setErrorMsg('Please enter an assessment title.');
      return;
    }

    if (!targetClass) {
      setErrorMsg('Please select a target class.');
      return;
    }

    if (!subject) {
      setErrorMsg('Please select a subject.');
      return;
    }

    if (rubric.length === 0) {
      setErrorMsg('Please configure at least one rubric criterion.');
      return;
    }

    setSaving(true);
    try {
      const payload: Assessment = {
        id: initialData?.id || `asm-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        schoolId: initialData?.schoolId,
        title: title.trim(),
        category,
        subject,
        class: targetClass,
        academicYear,
        term,
        description: description.trim(),
        dueDate,
        maxScore: Number(maxScore) || rubricTotal || 20,
        weightPercentage: Number(weightPercentage) || (category === 'examination' ? 70 : 10),
        attachments,
        rubric,
        teacherId: initialData?.teacherId || defaultTeacherId,
        teacherName: initialData?.teacherName || defaultTeacherName,
        status: initialData?.status || 'published',
        createdAt: initialData?.createdAt || Date.now(),
        updatedAt: Date.now()
      };

      await onSave(payload);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save assessment.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center">
              <Award className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                {initialData ? 'Edit Assessment' : 'Create New Assessment'}
              </h2>
              <p className="text-xs text-slate-500">
                Author curriculum-aligned tasks with student submission rubrics
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

        {/* Content Form */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-6 flex-1">
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* 1. Category Selector */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              Assessment Type
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {[
                { id: 'homework', label: 'Homework', icon: '📝', desc: 'Take-home assignment' },
                { id: 'classwork', label: 'Classwork', icon: '📚', desc: 'In-class exercises' },
                { id: 'class_test', label: 'Class Test', icon: '⏱️', desc: 'Continuous SBA test' },
                { id: 'examination', label: 'Examination', icon: '🏛️', desc: 'Summative term exam' }
              ].map(cat => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => {
                    setCategory(cat.id as AssessmentCategory);
                    if (cat.id === 'examination') {
                      setWeightPercentage(70);
                      handleApplyPreset('exam_paper');
                    } else if (weightPercentage === 70) {
                      setWeightPercentage(10);
                    }
                  }}
                  className={cn(
                    'p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between',
                    category === cat.id
                      ? 'border-emerald-600 bg-emerald-50/70 ring-2 ring-emerald-500/20'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                  )}
                >
                  <div className="text-xl mb-1">{cat.icon}</div>
                  <div>
                    <p className="text-xs font-bold text-slate-900">{cat.label}</p>
                    <p className="text-[11px] text-slate-500">{cat.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* 2. Basic Details */}
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Assessment Title *
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="e.g. Photosynthesis & Stomata Mechanisms Worksheet"
                className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Target Class *</label>
                <select
                  value={targetClass}
                  onChange={e => setTargetClass(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                >
                  {classes.map(c => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                  {classes.length === 0 && (
                    <>
                      <option value="JHS 1">JHS 1</option>
                      <option value="JHS 2">JHS 2</option>
                      <option value="JHS 3">JHS 3</option>
                    </>
                  )}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Subject *</label>
                <select
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                >
                  {subjects.map(s => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                  {subjects.length === 0 && (
                    <>
                      <option value="Mathematics">Mathematics</option>
                      <option value="Integrated Science">Integrated Science</option>
                      <option value="English Language">English Language</option>
                      <option value="Social Studies">Social Studies</option>
                    </>
                  )}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Due / Exam Date *</label>
                <input
                  type="date"
                  required
                  value={dueDate}
                  onChange={e => setDueDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Academic Year</label>
                <input
                  type="text"
                  value={academicYear}
                  onChange={e => setAcademicYear(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-xl"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Term</label>
                <select
                  value={term}
                  onChange={e => setTerm(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-xl"
                >
                  <option value="Term 1">Term 1</option>
                  <option value="Term 2">Term 2</option>
                  <option value="Term 3">Term 3</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Max Score</label>
                <input
                  type="number"
                  min="1"
                  value={maxScore}
                  onChange={e => setMaxScore(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-xl font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">SBA Weight (%)</label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={weightPercentage}
                  onChange={e => setWeightPercentage(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-xl font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Instructions / Prompts for Students
              </label>
              <textarea
                rows={3}
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Specify questions, required formatting, permitted reference materials, or submission expectations..."
                className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              />
            </div>
          </div>

          {/* 3. Attachments */}
          <div className="pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Teacher Reference Attachments (Handouts, Question PDFs)
              </label>
            </div>

            {attachments.length > 0 && (
              <div className="space-y-1.5 mb-3">
                {attachments.map((att, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between px-3 py-2 bg-slate-50 border border-slate-200/80 rounded-lg text-xs"
                  >
                    <div className="flex items-center gap-2 text-slate-700">
                      <Paperclip className="w-3.5 h-3.5 text-slate-400" />
                      <span className="font-medium">{att.name}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveAttachment(idx)}
                      className="text-red-500 hover:text-red-700 p-1 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                placeholder="Attachment name (e.g. Question_Guide.pdf)"
                value={newAttachmentName}
                onChange={e => setNewAttachmentName(e.target.value)}
                className="flex-1 px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg"
              />
              <button
                type="button"
                onClick={handleAddAttachment}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Attachment
              </button>
            </div>
          </div>

          {/* 4. Rubric Evaluator Builder */}
          <div className="pt-2 border-t border-slate-100">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
              <div>
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Grading Rubric Criteria
                </label>
                <p className="text-[11px] text-slate-500">
                  Total criteria points: <span className="font-mono font-bold text-slate-900">{rubricTotal}</span> / {maxScore} max
                </p>
              </div>

              {/* Rubric Presets */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] text-slate-400 flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-amber-500" /> Presets:
                </span>
                <button
                  type="button"
                  onClick={() => handleApplyPreset('general')}
                  className="px-2 py-1 text-[11px] bg-slate-100 hover:bg-slate-200 rounded font-medium text-slate-700 cursor-pointer"
                >
                  Standard
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyPreset('essay')}
                  className="px-2 py-1 text-[11px] bg-slate-100 hover:bg-slate-200 rounded font-medium text-slate-700 cursor-pointer"
                >
                  Essay
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyPreset('science_lab')}
                  className="px-2 py-1 text-[11px] bg-slate-100 hover:bg-slate-200 rounded font-medium text-slate-700 cursor-pointer"
                >
                  Lab
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyPreset('exam_paper')}
                  className="px-2 py-1 text-[11px] bg-slate-100 hover:bg-slate-200 rounded font-medium text-slate-700 cursor-pointer"
                >
                  Exam
                </button>
              </div>
            </div>

            {/* Criteria List */}
            <div className="space-y-3 mb-3">
              {rubric.map((crit, idx) => (
                <div
                  key={crit.id || idx}
                  className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl space-y-2 relative group"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-500">#{idx + 1}</span>
                    <input
                      type="text"
                      value={crit.criterion}
                      onChange={e => handleUpdateCriterion(idx, 'criterion', e.target.value)}
                      placeholder="Criterion Name (e.g. Concept Understanding)"
                      className="flex-1 px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg font-semibold"
                    />
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-slate-500 font-medium">Pts:</span>
                      <input
                        type="number"
                        min="1"
                        value={crit.maxPoints}
                        onChange={e => handleUpdateCriterion(idx, 'maxPoints', Number(e.target.value))}
                        className="w-16 px-2 py-1.5 text-xs bg-white border border-slate-200 rounded-lg font-mono font-bold text-right"
                      />
                      {rubric.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveCriterion(idx)}
                          className="p-1 text-slate-400 hover:text-red-600 rounded transition-colors cursor-pointer"
                          title="Remove Criterion"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  <input
                    type="text"
                    value={crit.description}
                    onChange={e => handleUpdateCriterion(idx, 'description', e.target.value)}
                    placeholder="Grading standard descriptor (e.g. 'Clear hypothesis, accurate formulas, logical steps')"
                    className="w-full px-2.5 py-1 text-[11px] bg-white/70 border border-slate-200/60 rounded-lg text-slate-600"
                  />
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={handleAddCriterion}
              className="w-full py-2 border border-dashed border-slate-300 hover:border-emerald-500 hover:bg-emerald-50/50 rounded-xl text-xs font-semibold text-slate-600 hover:text-emerald-700 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Rubric Criterion
            </button>
          </div>

          {/* Footer Submit */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {saving ? 'Saving...' : initialData ? 'Update Assessment' : 'Publish Assessment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
export default AssessmentEditorModal;
