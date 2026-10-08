import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, LessonNote, Assessment, AssessmentQuestion } from '../db/schema';
import { lessonNotesApi } from '../lib/api';
import { LessonNoteQuestionGeneratorModal } from './assessments/LessonNoteQuestionGeneratorModal';
import {
  FileText,
  Upload,
  CheckCircle2,
  Clock,
  AlertTriangle,
  XCircle,
  Plus,
  Search,
  Filter,
  Eye,
  Edit3,
  Trash2,
  Download,
  Printer,
  RefreshCw,
  Check,
  X,
  FileUp,
  BookOpen,
  Calendar,
  UserCheck,
  ShieldCheck,
  Sparkles,
  Layers,
  ClipboardCheck,
  ExternalLink,
  MessageSquareWarning,
  Award,
  ChevronRight
} from 'lucide-react';
import { NotificationType } from '../contexts/NotificationContext';

interface LessonNotesProps {
  onNavigate?: (tab: string) => void;
  showToast: (message: string, type?: NotificationType) => void;
  currentUser?: {
    id?: number;
    username: string;
    fullName?: string;
    role: string;
    schoolId?: string;
  } | null;
}

const WEEKS = Array.from({ length: 14 }, (_, i) => i + 1);
const TERMS: Array<'Term 1' | 'Term 2' | 'Term 3'> = ['Term 1', 'Term 2', 'Term 3'];

function formatFileSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return '0 KB';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}

function dataUriToBlobUrl(dataUri?: string): string | null {
  if (!dataUri) return null;
  try {
    if (dataUri.startsWith('blob:') || dataUri.startsWith('http')) {
      return dataUri;
    }
    const base64Marker = ';base64,';
    const parts = dataUri.split(base64Marker);
    if (parts.length !== 2) return dataUri;
    const contentType = parts[0].split(':')[1] || 'application/pdf';
    const raw = window.atob(parts[1]);
    const rawLength = raw.length;
    const uInt8Array = new Uint8Array(rawLength);
    for (let i = 0; i < rawLength; ++i) {
      uInt8Array[i] = raw.charCodeAt(i);
    }
    const blob = new Blob([uInt8Array], { type: contentType });
    return URL.createObjectURL(blob);
  } catch {
    return dataUri;
  }
}

export default function LessonNotes({ showToast, currentUser, onNavigate }: LessonNotesProps) {
  const userRole = String(currentUser?.role || 'teacher').toLowerCase();
  const isReviewer = ['hod', 'headteacher', 'admin', 'super_admin', 'creator'].includes(userRole);
  const currentTeacherName = currentUser?.fullName || currentUser?.username || 'Subject Teacher';
  const currentTeacherId = currentUser?.username || currentTeacherName;

  // Live Dexie queries
  const classes = useLiveQuery(() => db.classes.toArray(), []) || [];
  const subjects = useLiveQuery(() => db.subjects.toArray(), []) || [];
  const teachers = useLiveQuery(() => db.teachers.toArray(), []) || [];
  const settings = useLiveQuery(() => db.settings.toArray(), []) || [];
  const localNotes = useLiveQuery(() => db.lessonNotes.toArray(), []) || [];

  const schoolName = useMemo(() => {
    const s = settings.find(item => item.key === 'schoolName');
    return s?.value ? String(s.value) : 'SchoolSphere Academy';
  }, [settings]);

  const currentAcademicYear = useMemo(() => {
    const s = settings.find(item => item.key === 'academicYear');
    return s?.value ? String(s.value) : '2026/2027';
  }, [settings]);

  // Filters & view state
  const [activeView, setActiveView] = useState<'all' | 'pending' | 'approved' | 'revision' | 'compliance'>(
    isReviewer ? 'pending' : 'all'
  );
  const [selectedTerm, setSelectedTerm] = useState<'Term 1' | 'Term 2' | 'Term 3'>('Term 1');
  const [selectedWeek, setSelectedWeek] = useState<number | 'All'>('All');
  const [selectedClass, setSelectedClass] = useState<string>('All');
  const [selectedSubject, setSelectedSubject] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');

  // Supabase Sync state
  const [syncState, setSyncState] = useState<'idle' | 'syncing' | 'synced' | 'error'>('idle');
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [remoteNotes, setRemoteNotes] = useState<LessonNote[]>([]);

  // Composer Modal state
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<LessonNote | null>(null);
  const [entryMode, setEntryMode] = useState<'hybrid' | 'pdf' | 'structured'>('hybrid');
  const [isSaving, setIsSaving] = useState(false);

  // Composer Form fields
  const [formTerm, setFormTerm] = useState<'Term 1' | 'Term 2' | 'Term 3'>('Term 1');
  const [formWeek, setFormWeek] = useState<number>(1);
  const [formClass, setFormClass] = useState<string>('');
  const [formSubject, setFormSubject] = useState<string>('');
  const [formTeacherName, setFormTeacherName] = useState<string>(currentTeacherName);
  const [formLessonDate, setFormLessonDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [formDuration, setFormDuration] = useState<string>('60 mins');
  const [formClassSize, setFormClassSize] = useState<string>('35');
  const [formStrand, setFormStrand] = useState<string>('');
  const [formSubStrand, setFormSubStrand] = useState<string>('');
  const [formContentStandard, setFormContentStandard] = useState<string>('');
  const [formObjectives, setFormObjectives] = useState<string>('');
  const [formTlms, setFormTlms] = useState<string>('');
  const [formCoreCompetencies, setFormCoreCompetencies] = useState<string>('');
  const [formStarterActivity, setFormStarterActivity] = useState<string>('');
  const [formMainActivity, setFormMainActivity] = useState<string>('');
  const [formPlenaryActivity, setFormPlenaryActivity] = useState<string>('');
  const [formEvaluation, setFormEvaluation] = useState<string>('');
  const [formTeacherRemarks, setFormTeacherRemarks] = useState<string>('');

  // PDF upload state in Composer (Supabase Storage bucket `lesson-notes` + fallback)
  const [formPdfFileName, setFormPdfFileName] = useState<string | undefined>(undefined);
  const [formPdfFileSize, setFormPdfFileSize] = useState<number | undefined>(undefined);
  const [formPdfFileUrl, setFormPdfFileUrl] = useState<string | undefined>(undefined);
  const [formPdfStoragePath, setFormPdfStoragePath] = useState<string | undefined>(undefined);
  const [formPdfData, setFormPdfData] = useState<string | undefined>(undefined);
  const [formPdfUploadedAt, setFormPdfUploadedAt] = useState<number | undefined>(undefined);
  const [isUploadingPdf, setIsUploadingPdf] = useState<boolean>(false);
  const [showComposerPdfPreview, setShowComposerPdfPreview] = useState<boolean>(false);
  const pdfInputRef = useRef<HTMLInputElement | null>(null);

  // Inspection & Vetting Modal state
  const [inspectingNote, setInspectingNote] = useState<LessonNote | null>(null);
  const [inspectTab, setInspectTab] = useState<'split' | 'pdf' | 'structured'>('split');
  const [reviewerRoleChoice, setReviewerRoleChoice] = useState<'HOD' | 'Headteacher' | 'Administrator'>(
    userRole === 'headteacher'
      ? 'Headteacher'
      : userRole === 'hod'
      ? 'HOD'
      : 'Administrator'
  );
  const [reviewerNameInput, setReviewerNameInput] = useState<string>(currentTeacherName);
  const [reviewerFeedbackInput, setReviewerFeedbackInput] = useState<string>('');
  const [isSubmittingReview, setIsSubmittingReview] = useState<boolean>(false);
  const [isGeneratingQuizFromNote, setIsGeneratingQuizFromNote] = useState<LessonNote | null>(null);

  const handleImportQuestionsFromNote = async (
    questions: AssessmentQuestion[],
    metadata?: {
      title?: string;
      description?: string;
      durationMinutes?: number;
      lessonNoteId?: string;
    }
  ) => {
    if (!isGeneratingQuizFromNote) return;
    const newAssessment: Assessment = {
      id: `asm-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      schoolId: isGeneratingQuizFromNote.schoolId || currentUser?.schoolId,
      title: metadata?.title || `${isGeneratingQuizFromNote.subject}: ${isGeneratingQuizFromNote.subStrand || isGeneratingQuizFromNote.strand || 'Quiz'}`,
      category: 'class_test',
      subject: isGeneratingQuizFromNote.subject,
      class: isGeneratingQuizFromNote.class,
      academicYear: isGeneratingQuizFromNote.academicYear || '2025/2026',
      term: isGeneratingQuizFromNote.term || 'Term 1',
      description: metadata?.description || `Quiz generated from lesson note: ${isGeneratingQuizFromNote.strand}.`,
      dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      maxScore: questions.reduce((s, q) => s + (q.points || 0), 0) || 20,
      weightPercentage: 15,
      questions,
      durationMinutes: metadata?.durationMinutes || 45,
      allowInstantSelfCheck: true,
      rubric: [
        { id: 'crit-1', criterion: 'Question Accuracy & Understanding', description: 'Accurate comprehension of core syllabus concepts', maxPoints: 20 }
      ],
      sourceLessonNoteId: isGeneratingQuizFromNote.noteId,
      teacherId: isGeneratingQuizFromNote.teacherId || currentUser?.username || 'staff-01',
      teacherName: isGeneratingQuizFromNote.teacherName || currentUser?.fullName || 'Teacher',
      status: 'published',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    try {
      await db.assessments.put(newAssessment);
      try {
        await fetch('/api/assessments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newAssessment)
        });
      } catch (e) {}

      showToast(`Created new Assessment with ${questions.length} questions!`, 'success');
      setIsGeneratingQuizFromNote(null);
      if (onNavigate) {
        onNavigate('assessments');
      }
    } catch (err: any) {
      showToast('Failed to save assessment: ' + err.message, 'error');
    }
  };

  // Resolved PDF URLs (prefer Supabase Storage public URL, fallback to Blob URL from base64)
  const composerPdfBlobUrl = useMemo(
    () => formPdfFileUrl || dataUriToBlobUrl(formPdfData),
    [formPdfFileUrl, formPdfData]
  );
  const inspectPdfBlobUrl = useMemo(
    () => inspectingNote?.pdfFileUrl || dataUriToBlobUrl(inspectingNote?.pdfData),
    [inspectingNote?.pdfFileUrl, inspectingNote?.pdfData]
  );

  useEffect(() => {
    return () => {
      if (composerPdfBlobUrl && composerPdfBlobUrl.startsWith('blob:')) {
        URL.revokeObjectURL(composerPdfBlobUrl);
      }
    };
  }, [composerPdfBlobUrl]);

  useEffect(() => {
    return () => {
      if (inspectPdfBlobUrl && inspectPdfBlobUrl.startsWith('blob:')) {
        URL.revokeObjectURL(inspectPdfBlobUrl);
      }
    };
  }, [inspectPdfBlobUrl]);

  // Available classes & subjects fallback
  const classOptions = useMemo(() => {
    const names = Array.from(new Set(classes.map(c => c.name).filter(Boolean)));
    return names.length > 0
      ? names
      : ['Creche', 'Nursery 1', 'Nursery 2', 'KG 1', 'KG 2', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'JHS 1', 'JHS 2', 'JHS 3'];
  }, [classes]);

  const subjectOptions = useMemo(() => {
    const names = Array.from(new Set(subjects.map(s => s.name).filter(Boolean)));
    return names.length > 0
      ? names
      : [
          'Mathematics',
          'English Language',
          'Integrated Science',
          'Social Studies',
          'Computing / ICT',
          'Creative Arts & Design',
          'Career Technology',
          'Religious & Moral Education',
          'Ghanaian Language',
          'French'
        ];
  }, [subjects]);

  // Hydrate and synchronize Lesson Notes with Supabase
  const syncWithSupabase = useCallback(
    async (silent = false) => {
      setSyncState('syncing');
      try {
        const localArr = await db.lessonNotes.toArray();
        const res =
          localArr.length > 0
            ? await lessonNotesApi.syncLocalToSupabase(localArr)
            : await lessonNotesApi.getAll();
        if (Array.isArray(res.lessonNotes)) {
          setRemoteNotes(res.lessonNotes);
        }
        setSyncState('synced');
        setLastSyncedAt(Date.now());
        if (!silent) {
          showToast('Lesson notes synchronized with Supabase.', 'success');
        }
      } catch (err: any) {
        setSyncState('error');
        if (!silent) {
          showToast(err?.message || 'Could not sync lesson notes with Supabase.', 'error');
        }
      }
    },
    [showToast]
  );

  useEffect(() => {
    void syncWithSupabase(true);
  }, [syncWithSupabase]);

  // Merge local Dexie and remote Supabase notes by noteId
  const allNotes = useMemo(() => {
    const map = new Map<string, LessonNote>();
    for (const n of localNotes) {
      if (n.noteId) map.set(n.noteId, n);
    }
    for (const rn of remoteNotes) {
      if (!rn?.noteId) continue;
      const prev = map.get(rn.noteId);
      if (!prev || Number(rn.updatedAt || 0) >= Number(prev.updatedAt || 0)) {
        map.set(rn.noteId, {
          ...(prev || {}),
          ...rn,
          pdfFileUrl: rn.pdfFileUrl || prev?.pdfFileUrl,
          pdfStoragePath: rn.pdfStoragePath || prev?.pdfStoragePath,
          pdfData: rn.pdfData || prev?.pdfData,
          pdfFileName: rn.pdfFileName || prev?.pdfFileName,
          pdfFileSize: rn.pdfFileSize ?? prev?.pdfFileSize
        });
      }
    }
    return Array.from(map.values()).sort(
      (a, b) => Number(b.updatedAt || b.createdAt || 0) - Number(a.updatedAt || a.createdAt || 0)
    );
  }, [localNotes, remoteNotes]);

  // Filtered notes based on role, tab, term, week, class, subject, and search
  const filteredNotes = useMemo(() => {
    return allNotes.filter(note => {
      if (selectedTerm && note.term !== selectedTerm) return false;
      if (selectedWeek !== 'All' && Number(note.weekNumber) !== Number(selectedWeek)) return false;
      if (selectedClass !== 'All' && note.class !== selectedClass) return false;
      if (selectedSubject !== 'All' && note.subject !== selectedSubject) return false;

      if (activeView === 'pending' && note.status !== 'Pending Review') return false;
      if (activeView === 'approved' && note.status !== 'Approved') return false;
      if (activeView === 'revision' && note.status !== 'Needs Revision' && note.status !== 'Rejected') return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const hay = `${note.strand} ${note.subStrand || ''} ${note.subject} ${note.class} ${note.teacherName} ${note.pdfFileName || ''} ${note.contentStandard || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }

      return true;
    });
  }, [allNotes, selectedTerm, selectedWeek, selectedClass, selectedSubject, activeView, searchQuery]);

  // Summary KPIs for the selected Term
  const kpiStats = useMemo(() => {
    const termNotes = allNotes.filter(n => n.term === selectedTerm);
    const total = termNotes.length;
    const pending = termNotes.filter(n => n.status === 'Pending Review').length;
    const approved = termNotes.filter(n => n.status === 'Approved').length;
    const needsRevision = termNotes.filter(n => n.status === 'Needs Revision' || n.status === 'Rejected').length;
    const withPdf = termNotes.filter(n => !!(n.pdfFileName || n.pdfFileUrl || n.pdfData)).length;
    const approvalRate = total > 0 ? Math.round((approved / total) * 100) : 0;
    return { total, pending, approved, needsRevision, withPdf, approvalRate };
  }, [allNotes, selectedTerm]);

  // Open Composer for creating a new Lesson Note or uploading a PDF
  const handleOpenNewNote = (defaultMode: 'hybrid' | 'pdf' | 'structured' = 'hybrid') => {
    setEditingNote(null);
    setEntryMode(defaultMode);
    setFormTerm(selectedTerm);
    setFormWeek(selectedWeek !== 'All' ? Number(selectedWeek) : 1);
    setFormClass(selectedClass !== 'All' ? selectedClass : classOptions[0] || 'JHS 1');
    setFormSubject(selectedSubject !== 'All' ? selectedSubject : subjectOptions[0] || 'Mathematics');
    setFormTeacherName(currentTeacherName);
    setFormLessonDate(new Date().toISOString().split('T')[0]);
    setFormDuration('60 mins');
    setFormClassSize('35');
    setFormStrand('');
    setFormSubStrand('');
    setFormContentStandard('');
    setFormObjectives('');
    setFormTlms('');
    setFormCoreCompetencies('');
    setFormStarterActivity('');
    setFormMainActivity('');
    setFormPlenaryActivity('');
    setFormEvaluation('');
    setFormTeacherRemarks('');
    setFormPdfFileName(undefined);
    setFormPdfFileSize(undefined);
    setFormPdfFileUrl(undefined);
    setFormPdfStoragePath(undefined);
    setFormPdfData(undefined);
    setFormPdfUploadedAt(undefined);
    setShowComposerPdfPreview(false);
    setIsComposerOpen(true);
  };

  // Open Composer for editing an existing Lesson Note
  const handleEditNote = (note: LessonNote) => {
    setEditingNote(note);
    setEntryMode(note.pdfFileUrl || note.pdfData || note.pdfFileName ? 'hybrid' : 'structured');
    setFormTerm((note.term === 'Term 1' || note.term === 'Term 2' || note.term === 'Term 3') ? note.term : 'Term 1');
    setFormWeek(note.weekNumber || 1);
    setFormClass(note.class || classOptions[0] || 'JHS 1');
    setFormSubject(note.subject || subjectOptions[0] || 'Mathematics');
    setFormTeacherName(note.teacherName || currentTeacherName);
    setFormLessonDate(note.lessonDate || new Date().toISOString().split('T')[0]);
    setFormDuration(note.duration || '60 mins');
    setFormClassSize(note.classSize ? String(note.classSize) : '35');
    setFormStrand(note.strand || '');
    setFormSubStrand(note.subStrand || '');
    setFormContentStandard(note.contentStandard || '');
    setFormObjectives(note.objectives || '');
    setFormTlms(note.tlms || '');
    setFormCoreCompetencies(note.coreCompetencies || '');
    setFormStarterActivity(note.starterActivity || '');
    setFormMainActivity(note.mainActivity || '');
    setFormPlenaryActivity(note.plenaryActivity || '');
    setFormEvaluation(note.evaluation || '');
    setFormTeacherRemarks(note.teacherRemarks || '');
    setFormPdfFileName(note.pdfFileName);
    setFormPdfFileSize(note.pdfFileSize);
    setFormPdfFileUrl(note.pdfFileUrl);
    setFormPdfStoragePath(note.pdfStoragePath);
    setFormPdfData(note.pdfData);
    setFormPdfUploadedAt(note.pdfUploadedAt);
    setShowComposerPdfPreview(!!(note.pdfFileUrl || note.pdfData));
    setIsComposerOpen(true);
  };

  // Handle PDF File Upload (Drag & Drop or File Input -> Uploads to Supabase Storage bucket `lesson-notes`)
  const handlePdfFileSelect = (file?: File | null) => {
    if (!file) return;
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (!isPdf) {
      showToast('Please select a valid PDF document (.pdf).', 'error');
      return;
    }
    const maxBytes = 15 * 1024 * 1024; // 15 MB
    if (file.size > maxBytes) {
      showToast('PDF file exceeds 15 MB limit. Please upload a smaller PDF.', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      if (!result) return;

      const uploadedTs = Date.now();
      setFormPdfFileName(file.name);
      setFormPdfFileSize(file.size);
      setFormPdfData(result);
      setFormPdfUploadedAt(uploadedTs);
      setShowComposerPdfPreview(true);

      if (!formStrand.trim()) {
        const inferredTitle = file.name
          .replace(/\.pdf$/i, '')
          .replace(/[_-]+/g, ' ')
          .trim();
        setFormStrand(inferredTitle);
      }

      setIsUploadingPdf(true);
      try {
        const targetNoteId =
          editingNote?.noteId ||
          `LN-${currentAcademicYear.replace(/[^0-9]/g, '').slice(0, 4)}-T${formTerm.replace(/[^0-9]/g, '')}-W${String(formWeek).padStart(2, '0')}-${String(uploadedTs).slice(-5)}`;
        const uploadRes = await lessonNotesApi.uploadPdf({
          noteId: targetNoteId,
          fileName: file.name,
          fileSize: file.size,
          pdfBase64: result
        });
        if (uploadRes.pdfFileUrl) {
          setFormPdfFileUrl(uploadRes.pdfFileUrl);
          setFormPdfStoragePath(uploadRes.pdfStoragePath);
          showToast(
            `Uploaded "${file.name}" (${formatFileSize(file.size)}) to Supabase Storage bucket "${uploadRes.bucket}".`,
            'success'
          );
        }
      } catch {
        showToast(
          `Attached "${file.name}" (${formatFileSize(file.size)}). Will sync to Supabase Storage when saved.`,
          'info'
        );
      } finally {
        setIsUploadingPdf(false);
      }
    };
    reader.onerror = () => {
      showToast('Could not read the selected PDF file.', 'error');
    };
    reader.readAsDataURL(file);
  };

  // Save Draft or Submit for HOD/Headmaster Review
  const handleSaveLessonNote = async (targetStatus: 'Draft' | 'Pending Review') => {
    if (!formClass || !formSubject) {
      showToast('Please select both Class and Subject.', 'error');
      return;
    }
    const hasPdf = !!((formPdfFileUrl || formPdfData) && formPdfFileName);
    if (!formStrand.trim()) {
      showToast('Please enter the Strand or Lesson Topic title.', 'error');
      return;
    }
    if (targetStatus === 'Pending Review' && !hasPdf && (!formObjectives.trim() || !formMainActivity.trim())) {
      showToast(
        'Please either upload a PDF Lesson Note or complete Learning Objectives and Phase 2 Main Activity before submitting for review.',
        'error'
      );
      return;
    }

    setIsSaving(true);
    setSyncState('syncing');
    try {
      const now = Date.now();
      const noteId =
        editingNote?.noteId ||
        `LN-${currentAcademicYear.replace(/[^0-9]/g, '').slice(0, 4)}-T${formTerm.replace(/[^0-9]/g, '')}-W${String(formWeek).padStart(2, '0')}-${formClass.replace(/[^a-zA-Z0-9]/g, '')}-${formSubject.replace(/[^a-zA-Z0-9]/g, '').slice(0, 6).toUpperCase()}-${String(now).slice(-5)}`;

      const payload: LessonNote = {
        ...(editingNote?.id ? { id: editingNote.id } : {}),
        noteId,
        schoolId: currentUser?.schoolId || editingNote?.schoolId || '',
        teacherId: editingNote?.teacherId || currentTeacherId,
        teacherName: formTeacherName.trim() || currentTeacherName,
        term: formTerm,
        academicYear: currentAcademicYear,
        weekNumber: Number(formWeek) || 1,
        class: formClass,
        subject: formSubject,
        lessonDate: formLessonDate,
        duration: formDuration.trim() || '60 mins',
        classSize: Number(formClassSize) || undefined,
        strand: formStrand.trim(),
        subStrand: formSubStrand.trim(),
        contentStandard: formContentStandard.trim(),
        objectives: formObjectives.trim() || (hasPdf ? `See attached PDF lesson note (${formPdfFileName})` : ''),
        tlms: formTlms.trim(),
        coreCompetencies: formCoreCompetencies.trim(),
        starterActivity: formStarterActivity.trim(),
        mainActivity: formMainActivity.trim() || (hasPdf ? `Full lesson plan uploaded as PDF (${formPdfFileName})` : ''),
        plenaryActivity: formPlenaryActivity.trim(),
        evaluation: formEvaluation.trim(),
        teacherRemarks: formTeacherRemarks.trim(),
        pdfFileName: formPdfFileName,
        pdfFileSize: formPdfFileSize,
        pdfFileUrl: formPdfFileUrl,
        pdfStoragePath: formPdfStoragePath,
        pdfData: formPdfData,
        pdfUploadedAt: formPdfUploadedAt,
        status: targetStatus,
        submittedAt: targetStatus === 'Pending Review' ? now : editingNote?.submittedAt,
        reviewedBy: editingNote?.reviewedBy,
        reviewerRole: editingNote?.reviewerRole,
        reviewerFeedback: editingNote?.reviewerFeedback,
        reviewedAt: editingNote?.reviewedAt,
        createdAt: editingNote?.createdAt || now,
        updatedAt: now
      };

      const res = await lessonNotesApi.save(payload);
      if (Array.isArray(res.lessonNotes)) {
        setRemoteNotes(res.lessonNotes);
      }
      setSyncState('synced');
      setLastSyncedAt(Date.now());
      setIsComposerOpen(false);
      showToast(
        targetStatus === 'Pending Review'
          ? 'Lesson note submitted to Supabase for HOD / Headmaster review!'
          : 'Lesson note draft saved to Supabase.',
        'success'
      );
    } catch (err: any) {
      setSyncState('error');
      showToast(err?.message || 'Failed to save lesson note to Supabase.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Open Inspection & Vetting Modal
  const handleOpenInspect = (note: LessonNote) => {
    setInspectingNote(note);
    const hasPdf = !!(note.pdfFileUrl || note.pdfData || note.pdfFileName);
    const hasStructured = !!(
      note.starterActivity ||
      note.tlms ||
      note.plenaryActivity ||
      note.evaluation ||
      (note.mainActivity && !note.mainActivity.startsWith('Full lesson plan uploaded as PDF'))
    );
    if (hasPdf && hasStructured) {
      setInspectTab('split');
    } else if (hasPdf) {
      setInspectTab('pdf');
    } else {
      setInspectTab('structured');
    }
    setReviewerNameInput(note.reviewedBy || currentTeacherName);
    setReviewerFeedbackInput(note.reviewerFeedback || '');
    if (note.reviewerRole === 'HOD' || note.reviewerRole === 'Headteacher' || note.reviewerRole === 'Administrator') {
      setReviewerRoleChoice(note.reviewerRole);
    }
  };

  // HOD / Headmaster / Administrator Review Decision
  const handleReviewDecision = async (decision: 'Approved' | 'Needs Revision' | 'Rejected') => {
    if (!inspectingNote) return;
    if ((decision === 'Needs Revision' || decision === 'Rejected') && !reviewerFeedbackInput.trim()) {
      showToast('Please provide supervisory feedback notes explaining what needs revision.', 'error');
      return;
    }

    setIsSubmittingReview(true);
    setSyncState('syncing');
    try {
      const feedbackText =
        reviewerFeedbackInput.trim() ||
        (decision === 'Approved'
          ? 'Lesson objectives, TLMs, and core phases are well-structured and aligned with curriculum standards. Approved for classroom delivery.'
          : '');

      const res = await lessonNotesApi.review(inspectingNote.noteId, {
        status: decision,
        reviewerFeedback: feedbackText,
        reviewedBy: reviewerNameInput.trim() || currentTeacherName,
        reviewerRole: reviewerRoleChoice,
        lessonNote: inspectingNote
      });

      if (Array.isArray(res.lessonNotes)) {
        setRemoteNotes(res.lessonNotes);
      }
      if (res.lessonNote) {
        setInspectingNote(res.lessonNote);
      } else {
        setInspectingNote({
          ...inspectingNote,
          status: decision,
          reviewerFeedback: feedbackText,
          reviewedBy: reviewerNameInput.trim() || currentTeacherName,
          reviewerRole: reviewerRoleChoice,
          reviewedAt: Date.now()
        });
      }

      setSyncState('synced');
      setLastSyncedAt(Date.now());
      showToast(`Lesson note marked as "${decision}" and saved to Supabase.`, 'success');
    } catch (err: any) {
      setSyncState('error');
      showToast(err?.message || 'Failed to save review decision to Supabase.', 'error');
    } finally {
      setIsSubmittingReview(false);
    }
  };

  // Delete Lesson Note
  const handleDeleteNote = async (note: LessonNote) => {
    setSyncState('syncing');
    try {
      const res = await lessonNotesApi.delete(note.noteId);
      if (Array.isArray(res.lessonNotes)) {
        setRemoteNotes(res.lessonNotes);
      } else {
        setRemoteNotes(prev => prev.filter(n => n.noteId !== note.noteId));
      }
      if (inspectingNote?.noteId === note.noteId) {
        setInspectingNote(null);
      }
      setSyncState('synced');
      setLastSyncedAt(Date.now());
      showToast('Lesson note deleted from Supabase.', 'success');
    } catch (err: any) {
      setSyncState('error');
      showToast(err?.message || 'Failed to delete lesson note.', 'error');
    }
  };

  // Print Official Lesson Note with HOD / Headmaster Approval Stamp
  const handlePrintLessonNote = (note: LessonNote) => {
    const printWin = window.open('', '_blank', 'width=900,height=800');
    if (!printWin) {
      window.print();
      return;
    }
    const statusColor =
      note.status === 'Approved'
        ? '#16a34a'
        : note.status === 'Needs Revision'
        ? '#d97706'
        : note.status === 'Rejected'
        ? '#dc2626'
        : '#0284c7';

    printWin.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Lesson Note - ${note.subject} (${note.class} - Week ${note.weekNumber})</title>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #0f172a; margin: 28px; line-height: 1.5; }
            .header { border-bottom: 2px solid #1c4a59; padding-bottom: 12px; margin-bottom: 18px; display: flex; justify-content: space-between; align-items: flex-start; }
            .school-title { font-size: 20px; font-weight: 800; color: #1c4a59; text-transform: uppercase; }
            .doc-sub { font-size: 13px; color: #475569; font-weight: 600; margin-top: 2px; }
            .stamp { border: 2px solid ${statusColor}; color: ${statusColor}; padding: 6px 12px; border-radius: 6px; font-weight: 800; font-size: 12px; text-transform: uppercase; text-align: right; }
            .meta-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; background: #f8fafc; border: 1px solid #cbd5e1; padding: 12px; border-radius: 6px; margin-bottom: 16px; font-size: 12px; }
            .meta-label { color: #64748b; font-size: 10px; text-transform: uppercase; font-weight: 700; display: block; }
            .meta-val { font-weight: 700; color: #0f172a; }
            .section { border: 1px solid #cbd5e1; border-radius: 6px; margin-bottom: 12px; overflow: hidden; }
            .section-title { background: #f1f5f9; padding: 6px 12px; font-size: 11px; font-weight: 800; text-transform: uppercase; color: #1e293b; border-bottom: 1px solid #cbd5e1; }
            .section-body { padding: 10px 12px; font-size: 13px; white-space: pre-wrap; }
            .review-box { border: 2px solid ${statusColor}; background: #f8fafc; padding: 12px; border-radius: 6px; margin-top: 16px; }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <div class="school-title">${schoolName}</div>
              <div class="doc-sub">OFFICIAL TEACHER LESSON PLAN & VETTING RECORD · ${note.academicYear}</div>
              <div style="font-size:11px;color:#64748b;margin-top:4px;">Ref ID: ${note.noteId}</div>
            </div>
            <div class="stamp">
              STATUS: ${note.status}<br/>
              ${note.reviewedBy ? `VETTED BY: ${note.reviewedBy} (${note.reviewerRole || 'HOD'})` : 'AWAITING VETTING'}
            </div>
          </div>

          <div class="meta-grid">
            <div><span class="meta-label">Teacher</span><span class="meta-val">${note.teacherName}</span></div>
            <div><span class="meta-label">Term & Week</span><span class="meta-val">${note.term} · Week ${note.weekNumber}</span></div>
            <div><span class="meta-label">Class & Subject</span><span class="meta-val">${note.class} · ${note.subject}</span></div>
            <div><span class="meta-label">Date & Duration</span><span class="meta-val">${note.lessonDate || '-'} (${note.duration || '60 mins'})</span></div>
            <div><span class="meta-label">Strand / Topic</span><span class="meta-val">${note.strand || '-'}</span></div>
            <div><span class="meta-label">Sub-Strand</span><span class="meta-val">${note.subStrand || '-'}</span></div>
            <div><span class="meta-label">Content Standard</span><span class="meta-val">${note.contentStandard || '-'}</span></div>
            <div><span class="meta-label">PDF Attachment</span><span class="meta-val">${note.pdfFileName ? `${note.pdfFileName} (${formatFileSize(note.pdfFileSize)})` : 'Structured Form'}</span></div>
          </div>

          <div class="section">
            <div class="section-title">Learning Objectives / Performance Indicators</div>
            <div class="section-body">${note.objectives || '-'}</div>
          </div>

          <div class="section">
            <div class="section-title">Teaching & Learning Materials (TLMs) & Core Competencies</div>
            <div class="section-body"><strong>TLMs:</strong> ${note.tlms || '-'}\n<strong>Core Competencies:</strong> ${note.coreCompetencies || '-'}</div>
          </div>

          <div class="section">
            <div class="section-title">Phase 1: Starter (Preparing the Brain / Review of Previous Knowledge)</div>
            <div class="section-body">${note.starterActivity || '-'}</div>
          </div>

          <div class="section">
            <div class="section-title">Phase 2: Main Learning Activity (New Knowledge & Learner Activities)</div>
            <div class="section-body">${note.mainActivity || '-'}</div>
          </div>

          <div class="section">
            <div class="section-title">Phase 3: Plenary / Reflection & Lesson Summary</div>
            <div class="section-body">${note.plenaryActivity || '-'}</div>
          </div>

          <div class="section">
            <div class="section-title">Assessment / Evaluation Exercises & Homework</div>
            <div class="section-body">${note.evaluation || '-'}</div>
          </div>

          ${
            note.reviewedBy || note.reviewerFeedback
              ? `<div class="review-box">
                  <div style="font-weight:800;font-size:12px;text-transform:uppercase;color:${statusColor};margin-bottom:4px;">
                    Supervisory Review Stamp (${note.status}) — ${note.reviewedBy || 'Reviewer'} (${note.reviewerRole || 'HOD'})
                    ${note.reviewedAt ? ` · ${new Date(note.reviewedAt).toLocaleString()}` : ''}
                  </div>
                  <div style="font-size:13px;">${note.reviewerFeedback || 'Approved.'}</div>
                </div>`
              : ''
          }
          <script>window.onload = () => { window.print(); };</script>
        </body>
      </html>
    `);
    printWin.document.close();
  };

  // Status badge helper
  const renderStatusBadge = (status: LessonNote['status']) => {
    switch (status) {
      case 'Approved':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Approved
          </span>
        );
      case 'Pending Review':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-sky-50 text-sky-700 border border-sky-200">
            <Clock className="w-3.5 h-3.5" />
            Pending Review
          </span>
        );
      case 'Needs Revision':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200">
            <AlertTriangle className="w-3.5 h-3.5" />
            Needs Revision
          </span>
        );
      case 'Rejected':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
            <XCircle className="w-3.5 h-3.5" />
            Rejected
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
            <FileText className="w-3.5 h-3.5" />
            Draft
          </span>
        );
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6 pb-12 w-full max-w-full min-w-0 overflow-x-hidden">
      {/* Top Institutional Header */}
      <div className="bg-[#1C4A59] text-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-sm border border-slate-800/20 min-w-0 overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 min-w-0">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2.5 mb-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] sm:text-[11px] font-bold uppercase tracking-wider bg-white/15 text-amber-300 border border-white/15">
                <BookOpen className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Curriculum & Vetting Portal</span>
              </span>
              <span className="text-[11px] sm:text-xs text-slate-200 font-mono">
                {currentAcademicYear} · {selectedTerm}
              </span>
              {/* Live Supabase Sync Status */}
              <button
                onClick={() => syncWithSupabase(false)}
                className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] sm:text-[11px] font-semibold bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 hover:bg-emerald-500/30 transition-colors cursor-pointer"
                title="Click to synchronize lesson notes with Supabase"
              >
                <RefreshCw className={`w-3 h-3 shrink-0 ${syncState === 'syncing' ? 'animate-spin' : ''}`} />
                <span className="truncate">
                  {syncState === 'syncing'
                    ? 'Syncing...'
                    : syncState === 'error'
                    ? 'Retry Sync'
                    : 'Synced'}
                </span>
              </button>
            </div>
            <h1 className="text-xl sm:text-3xl font-extrabold tracking-tight break-words">
              Teacher Lesson Notes & HOD / Headmaster Review
            </h1>
            <p className="text-xs sm:text-sm text-slate-200 mt-1 max-w-3xl leading-relaxed">
              Prepare structured weekly lesson plans or upload PDF lesson notes (Weeks 1–14) for supervisory vetting and official approval by Heads of Department, Headmasters, and Administrators.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:flex items-center gap-2 w-full lg:w-auto shrink-0">
            <button
              onClick={() => handleOpenNewNote('pdf')}
              className="inline-flex items-center justify-center gap-1.5 px-3 sm:px-4 py-2.5 rounded-xl font-bold text-[11px] sm:text-xs uppercase tracking-wider bg-white/10 hover:bg-white/20 text-white border border-white/20 transition-all cursor-pointer min-h-[42px]"
            >
              <FileUp className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-300 shrink-0" />
              <span className="truncate">Upload PDF</span>
            </button>
            <button
              onClick={() => handleOpenNewNote('hybrid')}
              className="inline-flex items-center justify-center gap-1.5 px-3 sm:px-4 py-2.5 rounded-xl font-bold text-[11px] sm:text-xs uppercase tracking-wider bg-[#FAAE57] hover:bg-[#f59e3d] text-slate-950 shadow-sm transition-all cursor-pointer min-h-[42px]"
            >
              <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
              <span className="truncate">New Note</span>
            </button>
          </div>
        </div>
      </div>

      {/* KPI Summary Strip (2x2 on mobile, 4 cards on desktop) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Total Notes ({selectedTerm})
            </span>
            <Layers className="w-4 h-4 text-[#1C4A59]" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-extrabold text-slate-900 font-mono tabular-nums">
              {kpiStats.total}
            </span>
            <span className="text-xs font-semibold text-slate-600 font-mono">
              {kpiStats.withPdf} PDF Attached
            </span>
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Pending HOD / HM Vetting
            </span>
            <Clock className="w-4 h-4 text-sky-600" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-extrabold text-sky-700 font-mono tabular-nums">
              {kpiStats.pending}
            </span>
            <span className="text-xs font-semibold text-sky-700">
              Awaiting Review Stamp
            </span>
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Verified & Approved
            </span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-extrabold text-emerald-700 font-mono tabular-nums">
              {kpiStats.approved}
            </span>
            <span className="text-xs font-semibold text-emerald-700 font-mono">
              {kpiStats.approvalRate}% Approval Rate
            </span>
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Needs Revision / Action
            </span>
            <AlertTriangle className="w-4 h-4 text-amber-600" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-extrabold text-amber-700 font-mono tabular-nums">
              {kpiStats.needsRevision}
            </span>
            <span className="text-xs font-semibold text-amber-700">
              With Reviewer Feedback
            </span>
          </div>
        </div>
      </div>

      {/* Navigation Tabs & Filter Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => setActiveView('all')}
              className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                activeView === 'all'
                  ? 'bg-[#1C4A59] text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              All Lesson Notes ({allNotes.filter(n => n.term === selectedTerm).length})
            </button>
            <button
              onClick={() => setActiveView('pending')}
              className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
                activeView === 'pending'
                  ? 'bg-sky-700 text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              Pending Vetting Queue
              <span className="px-1.5 py-0.2 rounded text-[11px] font-mono bg-sky-100 text-sky-900">
                {kpiStats.pending}
              </span>
            </button>
            <button
              onClick={() => setActiveView('approved')}
              className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
                activeView === 'approved'
                  ? 'bg-emerald-700 text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Approved ({kpiStats.approved})
            </button>
            <button
              onClick={() => setActiveView('revision')}
              className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
                activeView === 'revision'
                  ? 'bg-amber-600 text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              Needs Revision ({kpiStats.needsRevision})
            </button>
            <button
              onClick={() => setActiveView('compliance')}
              className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
                activeView === 'compliance'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <ClipboardCheck className="w-3.5 h-3.5" />
              Weekly Compliance Matrix (Weeks 1–14)
            </button>
          </div>

          {isReviewer && (
            <div className="inline-flex items-center gap-1.5 text-xs font-bold text-[#1C4A59] bg-teal-50 border border-teal-200 px-3 py-1.5 rounded-lg">
              <ShieldCheck className="w-4 h-4 text-teal-700" />
              Reviewer Mode Active ({userRole.toUpperCase()})
            </div>
          )}
        </div>

        {/* Filter Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              Academic Term
            </label>
            <select
              value={selectedTerm}
              onChange={e => setSelectedTerm(e.target.value as 'Term 1' | 'Term 2' | 'Term 3')}
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#1C4A59]"
            >
              {TERMS.map(t => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              Week Number (1–14)
            </label>
            <select
              value={selectedWeek}
              onChange={e => setSelectedWeek(e.target.value === 'All' ? 'All' : Number(e.target.value))}
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#1C4A59]"
            >
              <option value="All">All Weeks (Week 1 – 14)</option>
              {WEEKS.map(w => (
                <option key={w} value={w}>
                  Week {w}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              Class
            </label>
            <select
              value={selectedClass}
              onChange={e => setSelectedClass(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#1C4A59]"
            >
              <option value="All">All Classes</option>
              {classOptions.map(c => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              Subject
            </label>
            <select
              value={selectedSubject}
              onChange={e => setSelectedSubject(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#1C4A59]"
            >
              <option value="All">All Subjects</option>
              {subjectOptions.map(s => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              Search Strand / Teacher / PDF
            </label>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search topic, teacher, PDF..."
                className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#1C4A59]"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Weekly Compliance Matrix View (Weeks 1 - 14) */}
      {activeView === 'compliance' ? (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
          <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 bg-slate-50">
            <div>
              <h2 className="text-base font-extrabold text-slate-900">
                Weekly Lesson Note Submission Compliance Matrix ({selectedTerm})
              </h2>
              <p className="text-xs text-slate-600">
                Tracks teacher lesson note and PDF submissions across Weeks 1–14 in Supabase. Click any week cell to inspect or create a note.
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs font-semibold">
              <span className="inline-flex items-center gap-1 text-emerald-700">
                <span className="w-2.5 h-2.5 rounded-xs bg-emerald-500 inline-block" /> Approved
              </span>
              <span className="inline-flex items-center gap-1 text-sky-700">
                <span className="w-2.5 h-2.5 rounded-xs bg-sky-500 inline-block" /> Pending Review
              </span>
              <span className="inline-flex items-center gap-1 text-amber-700">
                <span className="w-2.5 h-2.5 rounded-xs bg-amber-500 inline-block" /> Needs Revision
              </span>
              <span className="inline-flex items-center gap-1 text-slate-500">
                <span className="w-2.5 h-2.5 rounded-xs bg-slate-200 inline-block" /> Not Submitted
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-200 text-[11px] font-bold uppercase text-slate-600">
                  <th className="py-3 px-4 sticky left-0 bg-slate-100 z-10 min-w-[180px]">
                    Subject / Class
                  </th>
                  {WEEKS.map(w => (
                    <th key={w} className="py-3 px-2.5 text-center font-mono min-w-[68px]">
                      WK {String(w).padStart(2, '0')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs">
                {subjectOptions
                  .filter(subj => selectedSubject === 'All' || subj === selectedSubject)
                  .slice(0, 12)
                  .map(subj => {
                    const targetCls = selectedClass === 'All' ? classOptions[0] || 'JHS 1' : selectedClass;
                    return (
                      <tr key={`${targetCls}-${subj}`} className="hover:bg-slate-50/80">
                        <td className="py-3 px-4 font-bold text-slate-800 sticky left-0 bg-white border-r border-slate-200">
                          <div>{subj}</div>
                          <div className="text-[11px] font-normal text-slate-500">{targetCls}</div>
                        </td>
                        {WEEKS.map(w => {
                          const match = allNotes.find(
                            n =>
                              n.term === selectedTerm &&
                              Number(n.weekNumber) === w &&
                              n.subject === subj &&
                              (selectedClass === 'All' || n.class === selectedClass)
                          );
                          if (!match) {
                            return (
                              <td key={w} className="p-1.5 text-center">
                                <button
                                  onClick={() => {
                                    setSelectedWeek(w);
                                    setSelectedSubject(subj);
                                    handleOpenNewNote('hybrid');
                                  }}
                                  className="w-full py-2 rounded border border-dashed border-slate-200 text-[10px] font-mono text-slate-400 hover:border-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
                                  title={`Create Week ${w} Lesson Note for ${subj}`}
                                >
                                  + Add
                                </button>
                              </td>
                            );
                          }
                          const cellStyle =
                            match.status === 'Approved'
                              ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                              : match.status === 'Pending Review'
                              ? 'bg-sky-50 border-sky-300 text-sky-800'
                              : match.status === 'Needs Revision' || match.status === 'Rejected'
                              ? 'bg-amber-50 border-amber-300 text-amber-800'
                              : 'bg-slate-100 border-slate-300 text-slate-700';

                          return (
                            <td key={w} className="p-1.5 text-center">
                              <button
                                onClick={() => handleOpenInspect(match)}
                                className={`w-full py-1.5 px-1 rounded border text-[10px] font-bold transition-transform hover:scale-105 cursor-pointer ${cellStyle}`}
                                title={`${match.strand} (${match.status})${match.pdfFileName ? ` · PDF: ${match.pdfFileName}` : ''}`}
                              >
                                <div className="truncate">{match.status === 'Pending Review' ? 'Pending' : match.status}</div>
                                {(match.pdfFileName || match.pdfData) && (
                                  <div className="text-[9px] font-mono opacity-85">PDF</div>
                                )}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Lesson Notes List / Cards */
        <div className="space-y-3">
          {filteredNotes.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
              <div className="w-12 h-12 rounded-full bg-slate-100 text-[#1C4A59] flex items-center justify-center mx-auto mb-3">
                <BookOpen className="w-6 h-6" />
              </div>
              <h3 className="text-base font-extrabold text-slate-900">
                No Lesson Notes Found for Current Filter
              </h3>
              <p className="text-sm text-slate-600 mt-1 max-w-md mx-auto">
                Teachers can prepare a structured weekly lesson note or upload a PDF lesson note document for HOD / Headmaster review.
              </p>
              <div className="mt-5 flex items-center justify-center gap-3">
                <button
                  onClick={() => handleOpenNewNote('pdf')}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 cursor-pointer"
                >
                  <FileUp className="w-4 h-4 text-[#1C4A59]" />
                  Upload PDF Lesson Note
                </button>
                <button
                  onClick={() => handleOpenNewNote('hybrid')}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider bg-[#1C4A59] hover:bg-[#153844] text-white cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  Create Structured Note
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {filteredNotes.map(note => {
                const hasPdf = !!(note.pdfFileName || note.pdfData);
                return (
                  <div
                    key={note.noteId}
                    className="bg-white rounded-xl border border-slate-200 p-5 hover:border-slate-300 transition-all shadow-2xs"
                  >
                    <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                      <div className="space-y-1.5 flex-1 min-w-0">
                        {/* Unboxed Metadata Line */}
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 font-semibold">
                          <span className="font-mono font-bold text-[#1C4A59] bg-teal-50 border border-teal-200 px-2 py-0.5 rounded">
                            {note.term} · WK {String(note.weekNumber).padStart(2, '0')}
                          </span>
                          <span>·</span>
                          <span className="font-bold text-slate-900">{note.class}</span>
                          <span>·</span>
                          <span className="font-bold text-slate-900">{note.subject}</span>
                          <span>·</span>
                          <span>Teacher: {note.teacherName}</span>
                          {hasPdf && (
                            <>
                              <span>·</span>
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50 text-amber-900 border border-amber-200 font-mono text-[11px]">
                                <FileText className="w-3 h-3 text-amber-700" />
                                PDF Attached ({note.pdfFileName || 'LessonNote.pdf'} · {formatFileSize(note.pdfFileSize)})
                              </span>
                            </>
                          )}
                        </div>

                        {/* Strand / Topic Title */}
                        <div className="flex items-center gap-2 pt-0.5">
                          <h3 className="text-lg font-extrabold text-slate-900 truncate">
                            {note.strand}
                          </h3>
                          {note.subStrand && (
                            <span className="text-sm font-medium text-slate-500 truncate">
                              — {note.subStrand}
                            </span>
                          )}
                        </div>

                        {/* Brief Objectives Preview */}
                        {note.objectives && (
                          <p className="text-xs text-slate-600 line-clamp-2">
                            <strong className="text-slate-700">Objectives:</strong> {note.objectives}
                          </p>
                        )}

                        {/* Reviewer Feedback Banner if Reviewed */}
                        {(note.reviewerFeedback || note.reviewedBy) && (
                          <div
                            className={`mt-2 p-2.5 rounded-lg border text-xs ${
                              note.status === 'Approved'
                                ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                                : note.status === 'Needs Revision' || note.status === 'Rejected'
                                ? 'bg-amber-50/80 border-amber-200 text-amber-900'
                                : 'bg-slate-50 border-slate-200 text-slate-700'
                            }`}
                          >
                            <div className="font-bold flex items-center gap-1.5">
                              <UserCheck className="w-3.5 h-3.5" />
                              Reviewed by {note.reviewedBy || 'HOD / Headmaster'} ({note.reviewerRole || 'HOD'})
                              {note.reviewedAt && (
                                <span className="font-mono text-[11px] opacity-75">
                                  · {new Date(note.reviewedAt).toLocaleDateString()}
                                </span>
                              )}
                            </div>
                            {note.reviewerFeedback && (
                              <p className="mt-0.5 text-xs">{note.reviewerFeedback}</p>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Right Status & Action Buttons */}
                      <div className="flex flex-row lg:flex-col items-center lg:items-end justify-between gap-3 shrink-0">
                        <div className="flex items-center gap-2">
                          {renderStatusBadge(note.status)}
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            onClick={() => handleOpenInspect(note)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-[#1C4A59] hover:bg-[#153844] text-white transition-colors cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            {isReviewer
                              ? hasPdf
                                ? 'Review PDF & Vet'
                                : 'Inspect & Vet'
                              : hasPdf
                              ? 'View PDF & Note'
                              : 'View Note'}
                          </button>

                          <button
                            onClick={() => handleEditNote(note)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 transition-colors cursor-pointer"
                            title="Edit lesson note or replace PDF"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            Edit
                          </button>

                          <button
                            onClick={() => handlePrintLessonNote(note)}
                            className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 border border-slate-200 cursor-pointer"
                            title="Print official lesson note"
                          >
                            <Printer className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => handleDeleteNote(note)}
                            className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 border border-rose-200 cursor-pointer"
                            title="Delete lesson note"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ============================================================================
          MODAL 1: TEACHER LESSON NOTE COMPOSER & PDF UPLOADER
      ============================================================================ */}
      {isComposerOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-[#1C4A59] text-white flex items-center justify-between">
              <div>
                <span className="text-[11px] font-mono uppercase tracking-wider text-amber-300 block">
                  {editingNote ? `Editing ${editingNote.noteId}` : 'New Weekly Lesson Note · Supabase Backed'}
                </span>
                <h2 className="text-lg font-extrabold">
                  {editingNote
                    ? 'Update Lesson Note / Replace PDF'
                    : 'Prepare Teacher Lesson Note (Structured Template or PDF Upload)'}
                </h2>
              </div>
              <button
                onClick={() => setIsComposerOpen(false)}
                className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1">
              {/* Entry Mode Selector */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
                <div className="text-xs font-bold text-slate-700">
                  Choose Authoring Mode:
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEntryMode('hybrid')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                      entryMode === 'hybrid'
                        ? 'bg-[#1C4A59] text-white'
                        : 'bg-white text-slate-700 border border-slate-300'
                    }`}
                  >
                    PDF Upload + Structured Template
                  </button>
                  <button
                    type="button"
                    onClick={() => setEntryMode('pdf')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                      entryMode === 'pdf'
                        ? 'bg-[#1C4A59] text-white'
                        : 'bg-white text-slate-700 border border-slate-300'
                    }`}
                  >
                    Quick PDF Upload Only
                  </button>
                  <button
                    type="button"
                    onClick={() => setEntryMode('structured')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                      entryMode === 'structured'
                        ? 'bg-[#1C4A59] text-white'
                        : 'bg-white text-slate-700 border border-slate-300'
                    }`}
                  >
                    Structured Template Only
                  </button>
                </div>
              </div>

              {/* Section 1: Schedule & Classification Metadata */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Academic Term *
                  </label>
                  <select
                    value={formTerm}
                    onChange={e => setFormTerm(e.target.value as 'Term 1' | 'Term 2' | 'Term 3')}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-semibold"
                  >
                    {TERMS.map(t => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Week Number (Week 1–14) *
                  </label>
                  <select
                    value={formWeek}
                    onChange={e => setFormWeek(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-semibold font-mono"
                  >
                    {WEEKS.map(w => (
                      <option key={w} value={w}>
                        Week {w}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Class *
                  </label>
                  <select
                    value={formClass}
                    onChange={e => setFormClass(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-semibold"
                  >
                    {classOptions.map(c => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Subject *
                  </label>
                  <select
                    value={formSubject}
                    onChange={e => setFormSubject(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-semibold"
                  >
                    {subjectOptions.map(s => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Teacher Name
                  </label>
                  <input
                    type="text"
                    value={formTeacherName}
                    onChange={e => setFormTeacherName(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Lesson Date
                  </label>
                  <input
                    type="date"
                    value={formLessonDate}
                    onChange={e => setFormLessonDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Duration
                  </label>
                  <input
                    type="text"
                    value={formDuration}
                    onChange={e => setFormDuration(e.target.value)}
                    placeholder="e.g. 60 mins"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Class Size
                  </label>
                  <input
                    type="number"
                    value={formClassSize}
                    onChange={e => setFormClassSize(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
                  />
                </div>
              </div>

              {/* Strand / Topic Header */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-1">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Strand / Main Topic Title *
                  </label>
                  <input
                    type="text"
                    value={formStrand}
                    onChange={e => setFormStrand(e.target.value)}
                    placeholder="e.g. Number & Numeration Systems"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-semibold"
                  />
                </div>
                <div className="sm:col-span-1">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Sub-Strand
                  </label>
                  <input
                    type="text"
                    value={formSubStrand}
                    onChange={e => setFormSubStrand(e.target.value)}
                    placeholder="e.g. Fractions, Decimals & Percentages"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div className="sm:col-span-1">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Content Standard / Indicator Code
                  </label>
                  <input
                    type="text"
                    value={formContentStandard}
                    onChange={e => setFormContentStandard(e.target.value)}
                    placeholder="e.g. B8.1.3.1 / B8.1.3.1.1"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
                  />
                </div>
              </div>

              {/* Section 2: PDF Lesson Note Upload Dropzone */}
              {(entryMode === 'hybrid' || entryMode === 'pdf') && (
                <div className="rounded-xl border-2 border-dashed border-teal-600/40 bg-teal-50/40 p-5">
                  <input
                    ref={pdfInputRef}
                    type="file"
                    accept=".pdf,application/pdf"
                    className="hidden"
                    onChange={e => handlePdfFileSelect(e.target.files?.[0])}
                  />

                  {!(formPdfFileUrl || formPdfData) ? (
                    <div
                      onDragOver={e => e.preventDefault()}
                      onDrop={e => {
                        e.preventDefault();
                        handlePdfFileSelect(e.dataTransfer.files?.[0]);
                      }}
                      onClick={() => pdfInputRef.current?.click()}
                      className="text-center cursor-pointer py-4"
                    >
                      <div className="w-12 h-12 rounded-full bg-[#1C4A59] text-white flex items-center justify-center mx-auto mb-2.5">
                        <Upload className="w-5 h-5" />
                      </div>
                      <p className="text-sm font-extrabold text-slate-900">
                        Click to Upload PDF Lesson Note or Drag & Drop (.pdf)
                      </p>
                      <p className="text-xs text-slate-600 mt-1">
                        Uploads directly to Supabase Storage bucket <span className="font-mono font-semibold">lesson-notes</span> (up to 15 MB) so HODs & Headmasters can preview and vet the PDF.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3.5 rounded-lg border border-teal-200">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center shrink-0 font-bold text-xs">
                            PDF
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-extrabold text-slate-900 truncate flex items-center gap-2">
                              <span>{formPdfFileName}</span>
                              {isUploadingPdf ? (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-100 text-sky-800">
                                  Uploading to Supabase Storage...
                                </span>
                              ) : formPdfFileUrl ? (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                  Stored in Supabase Storage
                                </span>
                              ) : null}
                            </div>
                            <div className="text-xs text-slate-500 font-mono truncate">
                              {formatFileSize(formPdfFileSize)} · {formPdfStoragePath ? `lesson-notes/${formPdfStoragePath}` : 'Ready for Supabase Storage & HOD review'}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setShowComposerPdfPreview(prev => !prev)}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-teal-50 text-[#1C4A59] border border-teal-200 hover:bg-teal-100 cursor-pointer"
                          >
                            {showComposerPdfPreview ? 'Hide PDF Preview' : 'Preview PDF'}
                          </button>
                          <button
                            type="button"
                            onClick={() => pdfInputRef.current?.click()}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 text-slate-700 border border-slate-300 hover:bg-slate-200 cursor-pointer"
                          >
                            Replace PDF
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setFormPdfFileName(undefined);
                              setFormPdfFileSize(undefined);
                              setFormPdfFileUrl(undefined);
                              setFormPdfStoragePath(undefined);
                              setFormPdfData(undefined);
                              setFormPdfUploadedAt(undefined);
                              setShowComposerPdfPreview(false);
                            }}
                            className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 cursor-pointer"
                          >
                            Remove
                          </button>
                        </div>
                      </div>

                      {showComposerPdfPreview && composerPdfBlobUrl && (
                        <div className="rounded-lg border border-slate-300 overflow-hidden bg-slate-900">
                          <iframe
                            src={composerPdfBlobUrl}
                            title="Attached Lesson Note PDF Preview"
                            className="w-full h-[380px]"
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Section 3: Structured Curriculum Fields */}
              {(entryMode === 'hybrid' || entryMode === 'structured') && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Learning Objectives / Performance Indicators {formPdfData ? '(Optional with PDF)' : '*'}
                      </label>
                      <textarea
                        rows={3}
                        value={formObjectives}
                        onChange={e => setFormObjectives(e.target.value)}
                        placeholder="By the end of the lesson, the learner will be able to..."
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Teaching & Learning Materials (TLMs) & Core Competencies
                      </label>
                      <textarea
                        rows={3}
                        value={formTlms}
                        onChange={e => setFormTlms(e.target.value)}
                        placeholder="e.g. Manila cards, fraction charts, textbook pg 42, critical thinking & problem solving..."
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Phase 1: Starter (Preparing the Brain / Review of Relevant Previous Knowledge - 10 mins)
                    </label>
                    <textarea
                      rows={2}
                      value={formStarterActivity}
                      onChange={e => setFormStarterActivity(e.target.value)}
                      placeholder="Review learners' relevant previous knowledge with a short mental drill or real-life scenario..."
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Phase 2: Main New Learning & Learner Activities (40 mins) {formPdfData ? '(Optional with PDF)' : '*'}
                    </label>
                    <textarea
                      rows={4}
                      value={formMainActivity}
                      onChange={e => setFormMainActivity(e.target.value)}
                      placeholder="Step-by-step teacher facilitation, group activities, guided practice, and worked examples..."
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Phase 3: Plenary / Reflection (10 mins)
                      </label>
                      <textarea
                        rows={3}
                        value={formPlenaryActivity}
                        onChange={e => setFormPlenaryActivity(e.target.value)}
                        placeholder="Summarize key takeaways and invite learners to share reflections..."
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Evaluation / Class Exercise & Homework Questions
                      </label>
                      <textarea
                        rows={3}
                        value={formEvaluation}
                        onChange={e => setFormEvaluation(e.target.value)}
                        placeholder="1. Solve... 2. Explain... Homework assignment..."
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setIsComposerOpen(false)}
                className="px-4 py-2 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-200 cursor-pointer"
              >
                Cancel
              </button>
              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => handleSaveLessonNote('Draft')}
                  className="px-4 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider bg-white border border-slate-300 text-slate-800 hover:bg-slate-100 cursor-pointer disabled:opacity-50"
                >
                  Save as Draft
                </button>
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => handleSaveLessonNote('Pending Review')}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider bg-[#FAAE57] hover:bg-[#f59e3d] text-slate-950 shadow-xs cursor-pointer disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {isSaving
                    ? 'Saving to Supabase...'
                    : editingNote?.status === 'Needs Revision'
                    ? 'Resubmit for HOD / HM Review'
                    : 'Submit for HOD / Headmaster Review'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================================
          MODAL 2: HOD / HEADMASTER / ADMIN INSPECTION, PDF VIEWER & VETTING MODAL
      ============================================================================ */}
      {inspectingNote && (
        <div className="fixed inset-0 z-50 bg-slate-900/65 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-6xl max-h-[94vh] flex flex-col overflow-hidden">
            {/* Modal Top Bar */}
            <div className="px-6 py-4 bg-[#1C4A59] text-white flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-amber-300">
                  <span>{inspectingNote.noteId}</span>
                  <span>·</span>
                  <span>
                    {inspectingNote.term} · Week {inspectingNote.weekNumber}
                  </span>
                  <span>·</span>
                  <span>
                    {inspectingNote.class} · {inspectingNote.subject}
                  </span>
                  <span>·</span>
                  <span>Teacher: {inspectingNote.teacherName}</span>
                </div>
                <h2 className="text-lg sm:text-xl font-extrabold mt-0.5">
                  {inspectingNote.strand}
                  {inspectingNote.subStrand ? ` — ${inspectingNote.subStrand}` : ''}
                </h2>
              </div>

              <div className="flex items-center gap-2">
                {(inspectingNote.pdfFileUrl || inspectingNote.pdfData) && inspectPdfBlobUrl && (
                  <>
                    <a
                      href={inspectPdfBlobUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-white/15 hover:bg-white/25 text-white border border-white/20"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Open PDF in Tab
                    </a>
                    <a
                      href={inspectingNote.pdfFileUrl || inspectingNote.pdfData}
                      download={inspectingNote.pdfFileName || `${inspectingNote.noteId}.pdf`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-[#FAAE57] text-slate-950"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Download PDF
                    </a>
                  </>
                )}
                <button
                  onClick={() => setIsGeneratingQuizFromNote(inspectingNote)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-[#FAAE57] text-slate-950 hover:bg-[#e4ae67] transition-colors cursor-pointer shadow-xs"
                  title="Generate Multiple Choice, Short Answer & Essay questions from this lesson note"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Generate Quiz
                </button>
                <button
                  onClick={() => handlePrintLessonNote(inspectingNote)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-white/10 hover:bg-white/20 text-white border border-white/20 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Print
                </button>
                <button
                  onClick={() => setInspectingNote(null)}
                  className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* View Switcher if PDF is attached */}
            {(inspectingNote.pdfFileUrl || inspectingNote.pdfData) && (
              <div className="px-6 py-2.5 bg-slate-100 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
                  <FileText className="w-4 h-4 text-[#1C4A59]" />
                  Attached PDF: <span className="font-mono">{inspectingNote.pdfFileName || 'LessonNote.pdf'}</span> (
                  {formatFileSize(inspectingNote.pdfFileSize)})
                  {inspectingNote.pdfFileUrl && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                      Supabase Storage (lesson-notes)
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setInspectTab('pdf')}
                    className={`px-3 py-1 rounded text-xs font-bold cursor-pointer ${
                      inspectTab === 'pdf'
                        ? 'bg-[#1C4A59] text-white'
                        : 'bg-white text-slate-700 border border-slate-300'
                    }`}
                  >
                    PDF Document View
                  </button>
                  <button
                    onClick={() => setInspectTab('structured')}
                    className={`px-3 py-1 rounded text-xs font-bold cursor-pointer ${
                      inspectTab === 'structured'
                        ? 'bg-[#1C4A59] text-white'
                        : 'bg-white text-slate-700 border border-slate-300'
                    }`}
                  >
                    Structured Plan View
                  </button>
                  <button
                    onClick={() => setInspectTab('split')}
                    className={`px-3 py-1 rounded text-xs font-bold cursor-pointer ${
                      inspectTab === 'split'
                        ? 'bg-[#1C4A59] text-white'
                        : 'bg-white text-slate-700 border border-slate-300'
                    }`}
                  >
                    Split View (PDF + Plan)
                  </button>
                </div>
              </div>
            )}

            {/* Main Inspection Content + Right Vetting Panel */}
            <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
              {/* Left / Center Lesson Note & PDF Content (8 cols) */}
              <div className="lg:col-span-8 p-6 space-y-5 overflow-y-auto">
                {/* Embedded PDF Document Viewer */}
                {(inspectingNote.pdfFileUrl || inspectingNote.pdfData) && inspectPdfBlobUrl && (inspectTab === 'pdf' || inspectTab === 'split') && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-extrabold uppercase tracking-wider text-slate-500">
                        Uploaded PDF Lesson Note Document
                      </span>
                      <span className="text-xs font-mono text-slate-500">
                        {inspectingNote.pdfFileName}
                      </span>
                    </div>
                    <div className="rounded-xl border border-slate-300 overflow-hidden bg-slate-900 shadow-inner">
                      <iframe
                        src={inspectPdfBlobUrl}
                        title={inspectingNote.pdfFileName || 'Lesson Note PDF'}
                        className="w-full h-[520px]"
                      />
                    </div>
                  </div>
                )}

                {/* Structured Plan Sections */}
                {(!(inspectingNote.pdfFileUrl || inspectingNote.pdfData) || inspectTab === 'structured' || inspectTab === 'split') && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs">
                      <div>
                        <span className="text-[10px] font-bold uppercase text-slate-400 block">
                          Content Standard
                        </span>
                        <span className="font-mono font-bold text-slate-800">
                          {inspectingNote.contentStandard || 'N/A'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold uppercase text-slate-400 block">
                          Lesson Date
                        </span>
                        <span className="font-mono font-bold text-slate-800">
                          {inspectingNote.lessonDate || 'N/A'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold uppercase text-slate-400 block">
                          Duration
                        </span>
                        <span className="font-mono font-bold text-slate-800">
                          {inspectingNote.duration || '60 mins'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold uppercase text-slate-400 block">
                          Class Size
                        </span>
                        <span className="font-mono font-bold text-slate-800">
                          {inspectingNote.classSize || 35} Learners
                        </span>
                      </div>
                    </div>

                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                      <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 text-xs font-extrabold uppercase tracking-wider text-slate-700">
                        Learning Objectives / Performance Indicators
                      </div>
                      <div className="p-4 text-sm text-slate-800 whitespace-pre-wrap">
                        {inspectingNote.objectives || 'See attached PDF lesson note.'}
                      </div>
                    </div>

                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                      <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 text-xs font-extrabold uppercase tracking-wider text-slate-700">
                        Teaching & Learning Materials (TLMs)
                      </div>
                      <div className="p-4 text-sm text-slate-800 whitespace-pre-wrap">
                        {inspectingNote.tlms || 'Standard subject TLMs & textbooks.'}
                      </div>
                    </div>

                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                      <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 text-xs font-extrabold uppercase tracking-wider text-slate-700">
                        Phase 1: Starter (Review of Previous Knowledge)
                      </div>
                      <div className="p-4 text-sm text-slate-800 whitespace-pre-wrap">
                        {inspectingNote.starterActivity || 'Included in PDF lesson note.'}
                      </div>
                    </div>

                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                      <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 text-xs font-extrabold uppercase tracking-wider text-slate-700">
                        Phase 2: Main New Learning & Learner Activities
                      </div>
                      <div className="p-4 text-sm text-slate-800 whitespace-pre-wrap">
                        {inspectingNote.mainActivity || 'Included in PDF lesson note.'}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="border border-slate-200 rounded-xl overflow-hidden">
                        <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 text-xs font-extrabold uppercase tracking-wider text-slate-700">
                          Phase 3: Plenary / Reflection
                        </div>
                        <div className="p-4 text-sm text-slate-800 whitespace-pre-wrap">
                          {inspectingNote.plenaryActivity || 'Included in PDF lesson note.'}
                        </div>
                      </div>

                      <div className="border border-slate-200 rounded-xl overflow-hidden">
                        <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 text-xs font-extrabold uppercase tracking-wider text-slate-700">
                          Evaluation & Exercises
                        </div>
                        <div className="p-4 text-sm text-slate-800 whitespace-pre-wrap">
                          {inspectingNote.evaluation || 'Included in PDF lesson note.'}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Right Supervisory Vetting & Approval Panel (4 cols) */}
              <div className="lg:col-span-4 p-6 bg-slate-50/70 space-y-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-slate-500">
                    Current Vetting Status
                  </span>
                  {renderStatusBadge(inspectingNote.status)}
                </div>

                {/* Official Stamp Card if Reviewed */}
                {inspectingNote.reviewedBy && (
                  <div
                    className={`p-4 rounded-xl border-2 ${
                      inspectingNote.status === 'Approved'
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                        : inspectingNote.status === 'Needs Revision'
                        ? 'bg-amber-50 border-amber-300 text-amber-950'
                        : inspectingNote.status === 'Rejected'
                        ? 'bg-rose-50 border-rose-300 text-rose-950'
                        : 'bg-white border-slate-200 text-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-2 font-extrabold text-xs uppercase tracking-wider">
                      <Award className="w-4 h-4" />
                      Official {inspectingNote.reviewerRole || 'HOD'} Stamp: {inspectingNote.status}
                    </div>
                    <div className="text-xs font-semibold mt-1">
                      Vetted by: {inspectingNote.reviewedBy} ({inspectingNote.reviewerRole || 'HOD'})
                    </div>
                    {inspectingNote.reviewedAt && (
                      <div className="text-[11px] font-mono opacity-75">
                        {new Date(inspectingNote.reviewedAt).toLocaleString()}
                      </div>
                    )}
                    {inspectingNote.reviewerFeedback && (
                      <div className="mt-2 pt-2 border-t border-current/15 text-xs whitespace-pre-wrap">
                        {inspectingNote.reviewerFeedback}
                      </div>
                    )}
                  </div>
                )}

                {/* HOD / Headmaster / Administrator Vetting Controls */}
                {isReviewer ? (
                  <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-4 shadow-2xs">
                    <div className="flex items-center gap-2 text-sm font-extrabold text-[#1C4A59]">
                      <ShieldCheck className="w-4 h-4" />
                      HOD / Headmaster Vetting Decision
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Reviewer Capacity
                      </label>
                      <select
                        value={reviewerRoleChoice}
                        onChange={e =>
                          setReviewerRoleChoice(e.target.value as 'HOD' | 'Headteacher' | 'Administrator')
                        }
                        className="w-full px-3 py-2 text-xs font-bold border border-slate-300 rounded-lg bg-slate-50"
                      >
                        <option value="HOD">Head of Department (HOD)</option>
                        <option value="Headteacher">Headmaster / Headteacher</option>
                        <option value="Administrator">School Administrator</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Reviewer Name
                      </label>
                      <input
                        type="text"
                        value={reviewerNameInput}
                        onChange={e => setReviewerNameInput(e.target.value)}
                        className="w-full px-3 py-2 text-xs font-semibold border border-slate-300 rounded-lg"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Supervisory Remarks / Revision Instructions
                      </label>
                      <textarea
                        rows={4}
                        value={reviewerFeedbackInput}
                        onChange={e => setReviewerFeedbackInput(e.target.value)}
                        placeholder="Enter commendation notes or specific instructions if requesting revision..."
                        className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                      />
                    </div>

                    <div className="space-y-2 pt-1">
                      <button
                        type="button"
                        disabled={isSubmittingReview}
                        onClick={() => handleReviewDecision('Approved')}
                        className="w-full py-2.5 px-4 rounded-lg text-xs font-extrabold uppercase tracking-wider bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        Approve Lesson Note
                      </button>

                      <button
                        type="button"
                        disabled={isSubmittingReview}
                        onClick={() => handleReviewDecision('Needs Revision')}
                        className="w-full py-2.5 px-4 rounded-lg text-xs font-extrabold uppercase tracking-wider bg-amber-500 hover:bg-amber-600 text-slate-950 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                      >
                        <AlertTriangle className="w-4 h-4" />
                        Request Revision
                      </button>

                      <button
                        type="button"
                        disabled={isSubmittingReview}
                        onClick={() => handleReviewDecision('Rejected')}
                        className="w-full py-2 px-4 rounded-lg text-xs font-bold uppercase tracking-wider bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                      >
                        <XCircle className="w-4 h-4" />
                        Reject Submission
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-3">
                    <div className="text-xs font-bold text-slate-700">
                      Teacher Actions
                    </div>
                    <p className="text-xs text-slate-600">
                      Need to update this lesson note or upload a revised PDF document? Click below to open the editor.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        const target = inspectingNote;
                        setInspectingNote(null);
                        handleEditNote(target);
                      }}
                      className="w-full py-2.5 px-4 rounded-lg text-xs font-bold uppercase tracking-wider bg-[#1C4A59] text-white hover:bg-[#153844] flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Edit3 className="w-4 h-4" />
                      Edit Note / Upload Revised PDF
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* AI Question Generator Modal launched from Lesson Note */}
      {isGeneratingQuizFromNote && (
        <LessonNoteQuestionGeneratorModal
          isOpen={Boolean(isGeneratingQuizFromNote)}
          onClose={() => setIsGeneratingQuizFromNote(null)}
          onImportQuestions={handleImportQuestionsFromNote}
          currentSubject={isGeneratingQuizFromNote.subject}
          currentClass={isGeneratingQuizFromNote.class}
          currentTerm={isGeneratingQuizFromNote.term}
        />
      )}
    </div>
  );
}
