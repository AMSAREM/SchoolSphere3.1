import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, calculateGrade, type Result, type Student, type ClassAssessmentItem } from '../db/schema';
import {
  Save,
  FileSpreadsheet,
  Calculator,
  Search,
  CheckCircle2,
  Eye,
  X,
  Download,
  RefreshCcw,
  FileText,
  Printer,
  AlertCircle,
  Lock,
  User,
  Plus,
  Trash2,
  Layers,
  BookOpen,
  ClipboardCheck,
  Sparkles,
  RotateCcw
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useNotifications } from '../contexts/NotificationContext';
import { calculateFileHash, calculateContentFingerprint, checkIsFileDuplicate, recordImportedFile, validateCsvFile } from '../lib/fileSecurity';
import { checkRateLimit } from '../lib/rateLimit';
import * as XLSX from 'xlsx';
import { exportToPDF, cn, triggerPrint } from '../lib/utils';
import { ReportCard } from './ReportCard';
import { useAuth } from '../contexts/AuthContext';
import { resultsApi, studentsApi } from '../lib/api';

const DEFAULT_CA_COLUMNS: ClassAssessmentItem[] = [
  { id: 'ex1', title: 'Ex 1', category: 'Exercise', maxScore: 10 },
  { id: 'ex2', title: 'Ex 2', category: 'Exercise', maxScore: 10 },
  { id: 'hw1', title: 'HW 1', category: 'Homework', maxScore: 10 },
  { id: 'test1', title: 'Test 1', category: 'Test', maxScore: 20 }
];

export default function ResultsTerminal() {
  const { showToast } = useNotifications();
  const { user } = useAuth();
  const isStudent = user?.role === 'student';

  const classesFromDB = useLiveQuery(() => db.classes.toArray()) || [];
  const studentsInSystem = useLiveQuery(() => db.students.toArray()) || [];

  const studentRecord = useMemo(() => {
    if (isStudent && user?.fullName) {
      const cleanName = user.fullName.replace(/\s*\(Student\)/i, '').trim().toLowerCase();
      return studentsInSystem.find(s => {
        if (!s) return false;
        const full = `${s.firstName || ''} ${s.lastName || ''}`.toLowerCase().trim();
        return (cleanName && full.includes(cleanName)) || (full && cleanName.includes(full));
      });
    }
    return null;
  }, [isStudent, user?.fullName, studentsInSystem]);

  const classes = useMemo(() => {
    const fromDB = classesFromDB.map(c => c.name);
    const fromStudents = studentsInSystem.map(s => s.class);
    const list = Array.from(new Set([...fromDB, ...fromStudents])).filter(Boolean).sort();
    return list.map((name, idx) => ({ id: idx, name }));
  }, [classesFromDB, studentsInSystem]);

  const subjects = useLiveQuery(() => db.subjects.toArray()) || [];

  const settings = useLiveQuery(() => db.settings.toArray()) || [];
  const schoolProfile = useMemo(() =>
    settings.find(s => s.key === 'schoolProfile')?.value || { schoolName: 'ESEPA INTERNATIONAL SCHOOL' },
    [settings]
  );

  const academicConfig = useMemo(() =>
    settings.find(s => s.key === 'academicConfig')?.value || { academicYear: '2025/2026', currentTerm: 'Term 1' },
    [settings]
  );

  const [selectedClass, setSelectedClass] = useState(() => {
    return localStorage.getItem('esepa_selected_class') || 'P1';
  });
  const [selectedSubject, setSelectedSubject] = useState(() => {
    return localStorage.getItem('esepa_selected_subject') || 'Mathematics';
  });
  const [selectedTerm, setSelectedTerm] = useState(() => {
    return localStorage.getItem('esepa_selected_term') || 'Term 1';
  });

  const [viewMode, setViewMode] = useState<'ca-matrix' | 'summary-only'>('ca-matrix');
  const [isAddExerciseOpen, setIsAddExerciseOpen] = useState(false);
  const [newExTitle, setNewExTitle] = useState('');
  const [newExCategory, setNewExCategory] = useState<'Exercise' | 'Homework' | 'Test'>('Exercise');
  const [newExMaxScore, setNewExMaxScore] = useState<number>(10);

  React.useEffect(() => {
    localStorage.setItem('esepa_selected_class', selectedClass);
  }, [selectedClass]);

  React.useEffect(() => {
    if (classes.length > 0 && !classes.find(c => c.name === selectedClass)) {
      setSelectedClass(classes[0].name);
    }
  }, [classes, selectedClass]);

  React.useEffect(() => {
    localStorage.setItem('esepa_selected_subject', selectedSubject);
  }, [selectedSubject]);

  React.useEffect(() => {
    localStorage.setItem('esepa_selected_term', selectedTerm);
  }, [selectedTerm]);

  React.useEffect(() => {
    if (academicConfig && !localStorage.getItem('esepa_selected_term')) {
      setSelectedTerm(academicConfig.currentTerm);
    }
  }, [academicConfig]);

  const filteredSubjectsOptions = useMemo(() => {
    if (!subjects) return [];
    return subjects.filter(s =>
      s.applicableClasses?.includes('All') ||
      s.applicableClasses?.includes(selectedClass) ||
      !s.applicableClasses || s.applicableClasses.length === 0
    );
  }, [subjects, selectedClass]);

  // Update selected subject if current one is not applicable to the class
  React.useEffect(() => {
    if (filteredSubjectsOptions.length > 0 && !filteredSubjectsOptions.find(s => s.name === selectedSubject)) {
      setSelectedSubject(filteredSubjectsOptions[0].name);
    }
  }, [filteredSubjectsOptions, selectedSubject]);

  const [search, setSearch] = useState('');
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [selectedStudentForReport, setSelectedStudentForReport] = useState<Student | null>(null);
  const [studentResults, setStudentResults] = useState<Result[]>([]);

  const parentWards = useMemo(() => {
    if (user?.role === 'parent' && user?.fullName && studentsInSystem && studentsInSystem.length > 0) {
      const cleanParentName = user.fullName.replace(/\s*\(Parent\)/i, '').trim().toLowerCase();
      return studentsInSystem.filter(s => {
        const guardian = (s.guardianName || '').toLowerCase().trim();
        return guardian.includes(cleanParentName) || cleanParentName.includes(guardian);
      });
    }
    return [];
  }, [user, studentsInSystem]);

  const [selectedWardId, setSelectedWardId] = useState<string>('');

  React.useEffect(() => {
    if (parentWards.length > 0 && !selectedWardId) {
      setSelectedWardId(parentWards[0].studentId);
    }
  }, [parentWards, selectedWardId]);

  const selectedWard = useMemo(() => {
    return parentWards.find(w => w.studentId === selectedWardId) || parentWards[0] || null;
  }, [parentWards, selectedWardId]);

  const allStudents = useLiveQuery(() => db.students.toArray()) || [];

  const myAllResults = useLiveQuery(
    () => {
      const targetId = isStudent ? studentRecord?.studentId : (user?.role === 'parent' ? selectedWard?.studentId : null);
      if (targetId) {
        return db.results
          .where('studentId')
          .equals(targetId)
          .toArray();
      }
      return Promise.resolve([]);
    },
    [isStudent, studentRecord, selectedWard, user]
  ) || [];

  const myResults = useMemo(() => {
    return myAllResults.filter(r => r.term === selectedTerm);
  }, [myAllResults, selectedTerm]);

  React.useEffect(() => {
    if (isStudent && studentRecord?.class) {
      setSelectedClass(studentRecord.class);
    }
  }, [isStudent, studentRecord]);

  const existingResults = useLiveQuery(
    () => db.results.where('class').equals(selectedClass)
      .and(r => r.subject === selectedSubject && r.term === selectedTerm)
      .toArray(),
    [selectedClass, selectedSubject, selectedTerm]
  ) || [];

  const caColumnsSettingKey = `ca_columns_${selectedClass}_${selectedSubject}_${selectedTerm}`;
  const caScoresSettingKey = `ca_scores_${selectedClass}_${selectedSubject}_${selectedTerm}`;

  const [assessmentColumns, setAssessmentColumns] = useState<ClassAssessmentItem[]>(DEFAULT_CA_COLUMNS);
  const [exerciseScores, setExerciseScores] = useState<Record<string, Record<string, number | undefined>>>({});
  const [scores, setScores] = useState<Record<string, { class: number; exam: number }>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [supabaseSyncStatus, setSupabaseSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'error'>('idle');
  const [lastSupabaseSyncAt, setLastSupabaseSyncAt] = useState<number | null>(null);
  const autoSaveTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const targetSchoolId = useMemo(
    () => user?.school_id || user?.schoolId || (user as any)?.school?.id || '',
    [user]
  );

  // Hydrate Results & Continuous Assessment (Exercises, Homework, Class Tests) from Supabase when Class, Subject, or Term changes
  React.useEffect(() => {
    let isMounted = true;
    const hydrateFromSupabase = async () => {
      try {
        setSupabaseSyncStatus('syncing');
        if (isStudent || user?.role === 'parent') {
          const targetId = isStudent ? studentRecord?.studentId : selectedWard?.studentId;
          if (targetId) {
            await resultsApi.getByStudentAndTerm(targetId, selectedTerm, targetSchoolId);
          }
        } else if (selectedClass && selectedTerm) {
          const synced = await resultsApi.getByClassAndTerm(selectedClass, selectedTerm, selectedSubject, targetSchoolId);
          if (isMounted && synced) {
            if (Array.isArray(synced.caColumns) && synced.caColumns.length > 0) {
              setAssessmentColumns(synced.caColumns);
            }
          }
        }
        if (isMounted) {
          setSupabaseSyncStatus('synced');
          setLastSupabaseSyncAt(Date.now());
        }
      } catch (e) {
        if (isMounted) setSupabaseSyncStatus('idle');
      }
    };

    hydrateFromSupabase();
    return () => {
      isMounted = false;
    };
  }, [selectedClass, selectedSubject, selectedTerm, targetSchoolId, isStudent, user?.role, studentRecord?.studentId, selectedWard?.studentId]);

  const totalRawMax = useMemo(() => {
    return assessmentColumns.reduce((sum, col) => sum + (Number(col.maxScore) || 0), 0);
  }, [assessmentColumns]);

  const students = useMemo(() => {
    const existingStudentIds = new Set(existingResults.map(r => r.studentId));
    return allStudents.filter(s =>
      s.class === selectedClass ||
      existingStudentIds.has(s.studentId) ||
      (s.previousClasses && s.previousClasses.includes(selectedClass)) ||
      (s.classHistory && s.classHistory.some(h => h.class === selectedClass))
    );
  }, [allStudents, selectedClass, existingResults]);

  // Helper to compute raw obtained and scaled 30% class score for a student's exercise map
  const computeStudentCaSummary = (
    studentExMap: Record<string, number | undefined> | undefined,
    cols: ClassAssessmentItem[]
  ): { hasAnyEntry: boolean; rawObtained: number; rawMax: number; scaledClassScore: number } => {
    const rawMax = cols.reduce((acc, c) => acc + (Number(c.maxScore) || 0), 0);
    if (!studentExMap || cols.length === 0 || rawMax <= 0) {
      return { hasAnyEntry: false, rawObtained: 0, rawMax, scaledClassScore: 0 };
    }
    let hasAnyEntry = false;
    let rawObtained = 0;
    for (const col of cols) {
      const val = studentExMap[col.id];
      if (val !== undefined && val !== null && !isNaN(Number(val))) {
        hasAnyEntry = true;
        const clamped = Math.min(col.maxScore, Math.max(0, Number(val)));
        rawObtained += clamped;
      }
    }
    const scaledClassScore = hasAnyEntry
      ? Math.min(30, Math.max(0, Math.round((rawObtained / rawMax) * 30)))
      : 0;
    return { hasAnyEntry, rawObtained, rawMax, scaledClassScore };
  };

  // Sync assessment columns, exercise scores, and terminal scores when class/subject/term or existingResults change
  React.useEffect(() => {
    // 1. Determine assessment columns for this class + subject + term
    const savedColSetting = settings.find(s => s.key === caColumnsSettingKey)?.value;
    const resultWithCols = existingResults.find(r => Array.isArray(r.exerciseColumns) && r.exerciseColumns.length > 0);
    let activeCols: ClassAssessmentItem[] = DEFAULT_CA_COLUMNS;

    if (Array.isArray(savedColSetting) && savedColSetting.length > 0) {
      activeCols = savedColSetting;
    } else if (resultWithCols?.exerciseColumns) {
      activeCols = resultWithCols.exerciseColumns;
    }
    setAssessmentColumns(activeCols);

    // 2. Determine per-student exercise scores & terminal scores
    const savedScoresSetting = settings.find(s => s.key === caScoresSettingKey)?.value || {};
    const nextExScores: Record<string, Record<string, number | undefined>> = {};
    const nextScores: Record<string, { class: number; exam: number }> = {};

    existingResults.forEach(r => {
      const fromResult = r.exerciseScores && Object.keys(r.exerciseScores).length > 0
        ? r.exerciseScores
        : savedScoresSetting[r.studentId];

      if (fromResult && typeof fromResult === 'object') {
        nextExScores[r.studentId] = { ...fromResult };
      }

      const summary = computeStudentCaSummary(nextExScores[r.studentId], activeCols);
      const effectiveClassScore = summary.hasAnyEntry ? summary.scaledClassScore : (Number(r.classScore) || 0);

      nextScores[r.studentId] = {
        class: effectiveClassScore,
        exam: Number(r.examScore) || 0
      };
    });

    // Also include any students who had saved exercise scores in settings even if not yet in existingResults
    Object.keys(savedScoresSetting).forEach(stuId => {
      if (!nextExScores[stuId] && savedScoresSetting[stuId]) {
        nextExScores[stuId] = { ...savedScoresSetting[stuId] };
        const summary = computeStudentCaSummary(nextExScores[stuId], activeCols);
        if (summary.hasAnyEntry && !nextScores[stuId]) {
          nextScores[stuId] = {
            class: summary.scaledClassScore,
            exam: 0
          };
        }
      }
    });

    setExerciseScores(nextExScores);
    setScores(nextScores);
  }, [existingResults, selectedClass, selectedSubject, selectedTerm, caColumnsSettingKey, caScoresSettingKey, settings.length]);

  const persistCaColumnsToSettings = async (cols: ClassAssessmentItem[]) => {
    try {
      const existing = await db.settings.where('key').equals(caColumnsSettingKey).first();
      if (existing?.id) {
        await db.settings.update(existing.id, { key: caColumnsSettingKey, value: cols });
      } else {
        await db.settings.add({ key: caColumnsSettingKey, value: cols });
      }
    } catch (e) {}
  };

  const sanitizeExerciseScoresMap = (
    rawMap: Record<string, Record<string, number | undefined>>
  ): Record<string, Record<string, number>> => {
    const cleaned: Record<string, Record<string, number>> = {};
    Object.entries(rawMap || {}).forEach(([stuId, stuEx]) => {
      const cleanStu: Record<string, number> = {};
      Object.entries(stuEx || {}).forEach(([colId, val]) => {
        if (val !== undefined && val !== null && !isNaN(Number(val))) {
          cleanStu[colId] = Number(val);
        }
      });
      if (Object.keys(cleanStu).length > 0) {
        cleaned[stuId] = cleanStu;
      }
    });
    return cleaned;
  };

  // Push Continuous Assessment (Exercise, Homework, Class Test columns & marks) directly to Supabase
  const syncContinuousAssessmentToSupabase = React.useCallback(
    async (
      colsToSync: ClassAssessmentItem[],
      exScoresToSync: Record<string, Record<string, number | undefined>>,
      scoresToSync: Record<string, { class: number; exam: number }>
    ) => {
      try {
        setSupabaseSyncStatus('syncing');
        const cleanedEx = sanitizeExerciseScoresMap(exScoresToSync);
        await resultsApi.saveContinuousAssessment(
          {
            class: selectedClass,
            subject: selectedSubject,
            term: selectedTerm,
            academicYear: academicConfig?.academicYear || '2026/2027',
            columns: colsToSync,
            exerciseScores: cleanedEx,
            scores: scoresToSync
          },
          targetSchoolId
        );
        setSupabaseSyncStatus('synced');
        setLastSupabaseSyncAt(Date.now());
      } catch (e) {
        console.warn('Auto-sync continuous assessment notice:', e);
        setSupabaseSyncStatus('error');
      }
    },
    [selectedClass, selectedSubject, selectedTerm, academicConfig?.academicYear, targetSchoolId]
  );

  const scheduleDebouncedSupabaseCaSync = React.useCallback(
    (
      colsToSync: ClassAssessmentItem[],
      exScoresToSync: Record<string, Record<string, number | undefined>>,
      scoresToSync: Record<string, { class: number; exam: number }>
    ) => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
      setSupabaseSyncStatus('syncing');
      autoSaveTimerRef.current = setTimeout(() => {
        syncContinuousAssessmentToSupabase(colsToSync, exScoresToSync, scoresToSync);
      }, 600);
    },
    [syncContinuousAssessmentToSupabase]
  );

  React.useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, []);

  const handleAddAssessmentColumn = async () => {
    const trimmed = newExTitle.trim();
    const maxVal = Math.max(1, Math.min(100, Number(newExMaxScore) || 10));
    const prefix = newExCategory === 'Exercise' ? 'Ex' : newExCategory === 'Homework' ? 'HW' : 'Test';
    const countInCat = assessmentColumns.filter(c => c.category === newExCategory).length + 1;
    const finalTitle = trimmed || `${prefix} ${countInCat}`;
    const newCol: ClassAssessmentItem = {
      id: `${prefix.toLowerCase()}_${Date.now().toString().slice(-5)}`,
      title: finalTitle,
      category: newExCategory,
      maxScore: maxVal
    };

    const updatedCols = [...assessmentColumns, newCol];
    setAssessmentColumns(updatedCols);
    await persistCaColumnsToSettings(updatedCols);

    // Recalculate scaled class scores for all students who have exercise entries
    const nextScores = { ...scores };
    Object.keys(exerciseScores).forEach(stuId => {
      const summary = computeStudentCaSummary(exerciseScores[stuId], updatedCols);
      if (summary.hasAnyEntry) {
        nextScores[stuId] = {
          ...(nextScores[stuId] || { class: 0, exam: 0 }),
          class: summary.scaledClassScore
        };
      }
    });
    setScores(nextScores);

    setNewExTitle('');
    setNewExMaxScore(10);
    setIsAddExerciseOpen(false);
    await syncContinuousAssessmentToSupabase(updatedCols, exerciseScores, nextScores);
    showToast(`Added "${finalTitle}" (/${maxVal}) to ${selectedSubject} & synced to Supabase.`, 'success');
  };

  const handleRemoveAssessmentColumn = async (colId: string) => {
    if (assessmentColumns.length <= 1) {
      showToast('At least one assessment column must remain.', 'error');
      return;
    }
    const targetCol = assessmentColumns.find(c => c.id === colId);
    const updatedCols = assessmentColumns.filter(c => c.id !== colId);
    setAssessmentColumns(updatedCols);
    await persistCaColumnsToSettings(updatedCols);

    // Recompute scaled class scores with remaining columns
    const nextScores = { ...scores };
    Object.keys(exerciseScores).forEach(stuId => {
      const summary = computeStudentCaSummary(exerciseScores[stuId], updatedCols);
      if (summary.hasAnyEntry) {
        nextScores[stuId] = {
          ...(nextScores[stuId] || { class: 0, exam: 0 }),
          class: summary.scaledClassScore
        };
      }
    });
    setScores(nextScores);

    await syncContinuousAssessmentToSupabase(updatedCols, exerciseScores, nextScores);
    if (targetCol) {
      showToast(`Removed "${targetCol.title}" column, rescaled 30% Class Scores & synced to Supabase.`, 'info');
    }
  };

  const handleResetDefaultColumns = async () => {
    setAssessmentColumns(DEFAULT_CA_COLUMNS);
    await persistCaColumnsToSettings(DEFAULT_CA_COLUMNS);
    const nextScores = { ...scores };
    Object.keys(exerciseScores).forEach(stuId => {
      const summary = computeStudentCaSummary(exerciseScores[stuId], DEFAULT_CA_COLUMNS);
      if (summary.hasAnyEntry) {
        nextScores[stuId] = {
          ...(nextScores[stuId] || { class: 0, exam: 0 }),
          class: summary.scaledClassScore
        };
      }
    });
    setScores(nextScores);
    await syncContinuousAssessmentToSupabase(DEFAULT_CA_COLUMNS, exerciseScores, nextScores);
    showToast('Reset continuous assessment columns to standard starter set & synced to Supabase.', 'info');
  };

  const handleExerciseScoreChange = (studentId: string, col: ClassAssessmentItem, rawInput: string) => {
    const trimmed = rawInput.trim();
    const parsed = trimmed === '' ? undefined : Math.min(col.maxScore, Math.max(0, Number(trimmed)));

    const stuMap = { ...(exerciseScores[studentId] || {}) };
    if (parsed === undefined || isNaN(parsed)) {
      delete stuMap[col.id];
    } else {
      stuMap[col.id] = parsed;
    }
    const nextExScores = { ...exerciseScores, [studentId]: stuMap };
    setExerciseScores(nextExScores);

    // Immediately recompute auto-scaled 30% Class Score for this student
    const summary = computeStudentCaSummary(stuMap, assessmentColumns);
    const nextScores = {
      ...scores,
      [studentId]: {
        ...(scores[studentId] || { class: 0, exam: 0 }),
        class: summary.hasAnyEntry ? summary.scaledClassScore : 0
      }
    };
    setScores(nextScores);

    // Debounce auto-save to Supabase database
    scheduleDebouncedSupabaseCaSync(assessmentColumns, nextExScores, nextScores);
  };

  const handleScoreChange = (studentId: string, type: 'class' | 'exam', value: string) => {
    const numValue = Math.min(Math.max(0, Number(value)), type === 'class' ? 30 : 70);
    const nextScores = {
      ...scores,
      [studentId]: {
        ...(scores[studentId] || { class: 0, exam: 0 }),
        [type]: numValue
      }
    };
    setScores(nextScores);
    scheduleDebouncedSupabaseCaSync(assessmentColumns, exerciseScores, nextScores);
  };

  const handleBulkSave = async () => {
    if (!students.length) {
      showToast('No students found for this class.', 'error');
      return;
    }
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    setIsSaving(true);
    setSupabaseSyncStatus('syncing');

    const cleanAllExerciseScores: Record<string, Record<string, number>> = {};

    const resultsToSave: Result[] = students.map(student => {
      const stuExMap = exerciseScores[student.studentId] || {};
      const cleanStuEx: Record<string, number> = {};
      Object.entries(stuExMap).forEach(([k, v]) => {
        if (v !== undefined && v !== null && !isNaN(Number(v))) {
          cleanStuEx[k] = Number(v);
        }
      });
      if (Object.keys(cleanStuEx).length > 0) {
        cleanAllExerciseScores[student.studentId] = cleanStuEx;
      }

      const caSummary = computeStudentCaSummary(cleanStuEx, assessmentColumns);
      const s = scores[student.studentId] || { class: 0, exam: 0 };
      const finalClassScore = caSummary.hasAnyEntry ? caSummary.scaledClassScore : (Number(s.class) || 0);
      const finalExamScore = Number(s.exam) || 0;
      const total = finalClassScore + finalExamScore;
      const { grade, remarks } = calculateGrade(total);

      return {
        studentId: student.studentId,
        subject: selectedSubject,
        term: selectedTerm,
        class: selectedClass,
        classScore: finalClassScore,
        examScore: finalExamScore,
        totalScore: total,
        grade,
        remarks,
        exerciseScores: Object.keys(cleanStuEx).length > 0 ? cleanStuEx : undefined,
        exerciseColumns: assessmentColumns,
        rawCaScore: caSummary.hasAnyEntry ? caSummary.rawObtained : undefined,
        rawCaMax: caSummary.hasAnyEntry ? caSummary.rawMax : undefined
      };
    }) || [];

    // Rate limit score save actions: Max 3 per 3 seconds
    const saveCheck = checkRateLimit('results_save_submit', 3, 3000);
    if (!saveCheck.allowed) {
      showToast(`Please wait ${saveCheck.retryAfterSeconds}s before saving scores again.`, "error");
      setIsSaving(false);
      return;
    }

    try {
      // Persist CA column structure & exercise score map to settings for cross-device durability
      await persistCaColumnsToSettings(assessmentColumns);
      const existingScoresSetting = await db.settings.where('key').equals(caScoresSettingKey).first();
      if (existingScoresSetting?.id) {
        await db.settings.update(existingScoresSetting.id, { key: caScoresSettingKey, value: cleanAllExerciseScores });
      } else {
        await db.settings.add({ key: caScoresSettingKey, value: cleanAllExerciseScores });
      }

      for (const res of resultsToSave) {
        const existing = await db.results
          .where({ studentId: res.studentId, subject: res.subject, term: res.term })
          .first();

        if (existing) {
          await db.results.update(existing.id!, res);
        } else {
          await db.results.add(res);
        }
      }

      await resultsApi.recordScores(resultsToSave, targetSchoolId, {
        className: selectedClass,
        subject: selectedSubject,
        term: selectedTerm,
        columns: assessmentColumns,
        exerciseScores: cleanAllExerciseScores
      });
      setSupabaseSyncStatus('synced');
      setLastSupabaseSyncAt(Date.now());
      showToast("Class exercises, homework, tests, 30% Class Scores & 70% Exam scores saved to Supabase & synced to Report Cards!", "success");
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err: any) {
      console.error("Failed to save results:", err);
      setSupabaseSyncStatus('error');
      showToast(err?.message || "Failed to save results to Supabase database.", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const importFromCsv = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 1. Strict File Type Validation: ONLY CSV (.csv) files allowed
    const validation = await validateCsvFile(file);
    if (!validation.valid) {
      showToast(validation.error || "Invalid file format. Only CSV (.csv) files are allowed for import.", "error");
      e.target.value = '';
      return;
    }

    // 2. Rate Limit Check on Results File Import
    const limitCheck = checkRateLimit('results_csv_import', 2, 8000);
    if (!limitCheck.allowed) {
      showToast(`Rate limit reached: Please wait ${limitCheck.retryAfterSeconds}s before importing another file.`, "error");
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws) as any[];

        if (!data || data.length === 0) {
          showToast("No data found in the uploaded CSV file.", "error");
          e.target.value = '';
          return;
        }

        // 2. Cryptographic Duplicate File Check
        const fileHash = await calculateFileHash(file);
        const contentSig = await calculateContentFingerprint(data);
        const targetSchoolId = user?.school_id || user?.schoolId || (user as any)?.school?.id || '';

        const dupCheck = await checkIsFileDuplicate(fileHash, contentSig, targetSchoolId, 'results');
        if (dupCheck.isDuplicate) {
          showToast(`Duplicate File Blocked: ${dupCheck.reason || 'This exact results CSV file has already been imported.'}`, "error");
          e.target.value = '';
          return;
        }

        // Helper to extract value case-insensitively from a row across multiple possible header names
        const getRowVal = (row: any, candidates: string[]): any => {
          if (!row || typeof row !== 'object') return undefined;
          const keys = Object.keys(row);
          for (const candidate of candidates) {
            if (row[candidate] !== undefined && row[candidate] !== null && String(row[candidate]).trim() !== '') {
              return row[candidate];
            }
            const normalizedCandidate = candidate.toLowerCase().replace(/[^a-z0-9]/g, '');
            for (const k of keys) {
              const normalizedKey = k.toLowerCase().replace(/[^a-z0-9]/g, '');
              if (normalizedKey === normalizedCandidate && row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== '') {
                return row[k];
              }
            }
          }
          return undefined;
        };

        const allExistingStudents = await db.students.toArray();
        const newResults: Result[] = [];
        const newScoresMap: Record<string, { class: number; exam: number }> = {};
        const newExScoresMap: Record<string, Record<string, number>> = {};

        for (let i = 0; i < data.length; i++) {
          const item = data[i];
          let rawStudentId = getRowVal(item, [
            'studentId', 'student_id', 'StudentID', 'Student ID', 'ID', 'Id', 'id',
            'Index No', 'Index Number', 'indexNumber', 'index_no', 'Index', 'index',
            'Student Number', 'student_number', 'Admission Number', 'admission_number', 'Adm No', 'adm_no'
          ]);
          rawStudentId = rawStudentId !== undefined && rawStudentId !== null ? String(rawStudentId).trim() : '';
          if (rawStudentId.toLowerCase() === 'undefined' || rawStudentId.toLowerCase() === 'null') {
            rawStudentId = '';
          }

          let firstName = getRowVal(item, ['firstName', 'first_name', 'FirstName', 'First Name', 'firstname', 'first']);
          firstName = firstName ? String(firstName).trim() : '';

          let lastName = getRowVal(item, ['lastName', 'last_name', 'LastName', 'Last Name', 'surname', 'Surname', 'lastname', 'last']);
          lastName = lastName ? String(lastName).trim() : '';

          let fullName = getRowVal(item, ['studentName', 'student_name', 'Student Name', 'StudentName', 'Name', 'name', 'Full Name', 'fullName', 'fullname', 'Candidate Name']);
          fullName = fullName ? String(fullName).trim() : '';

          if (!firstName && !lastName && fullName) {
            const parts = fullName.split(/\s+/).filter(Boolean);
            firstName = parts[0] || '';
            lastName = parts.slice(1).join(' ') || '';
          }

          const rowClass = String(getRowVal(item, ['class', 'Class', 'class_name', 'Class Name', 'Grade', 'grade', 'Form', 'form']) || selectedClass).trim();

          // Intelligent Student Lookup: Match by ID, Full Name, or First+Last Name
          const matchedStudent = allExistingStudents.find(s => {
            if (rawStudentId && s.studentId && s.studentId.trim().toLowerCase() === rawStudentId.toLowerCase()) {
              return true;
            }
            if (firstName && lastName) {
              const sFirst = (s.firstName || '').trim().toLowerCase();
              const sLast = (s.lastName || '').trim().toLowerCase();
              if (sFirst === firstName.toLowerCase() && sLast === lastName.toLowerCase()) return true;
              if (sFirst === lastName.toLowerCase() && sLast === firstName.toLowerCase()) return true;
            }
            if (fullName) {
              const sFull = `${s.firstName || ''} ${s.lastName || ''}`.trim().toLowerCase();
              if (sFull && (sFull === fullName.toLowerCase() || fullName.toLowerCase().includes(sFull))) return true;
            }
            return false;
          });

          let effectiveStudentId = rawStudentId;

          if (matchedStudent) {
            effectiveStudentId = matchedStudent.studentId;
          } else {
            if (!effectiveStudentId) {
              const randomNum = Math.floor(1000 + Math.random() * 9000);
              effectiveStudentId = `STU-${randomNum}`;
            }
            const effectiveFirst = firstName || (fullName ? fullName.split(' ')[0] : `Student ${i + 1}`);
            const effectiveLast = lastName || (fullName && fullName.includes(' ') ? fullName.split(' ').slice(1).join(' ') : effectiveStudentId);

            const autoStudent: Student = {
              studentId: effectiveStudentId,
              firstName: effectiveFirst,
              lastName: effectiveLast,
              class: rowClass || selectedClass,
              gender: 'Male',
              dateOfBirth: '2010-01-01',
              guardianName: 'Parent / Guardian',
              guardianPhone: '0000000000',
              feesPaid: 0,
              totalFees: 1500,
              createdAt: Date.now()
            };

            await studentsApi.create(autoStudent, targetSchoolId);
            allExistingStudents.push(autoStudent);
          }

          // Check if CSV row contains individual Exercise / Homework / Test columns
          const rowExMap: Record<string, number> = {};
          for (const col of assessmentColumns) {
            const rawExVal = getRowVal(item, [
              col.title,
              `${col.title} (${col.maxScore})`,
              `${col.title} (/${col.maxScore})`,
              col.id
            ]);
            if (rawExVal !== undefined && rawExVal !== null && String(rawExVal).trim() !== '' && !isNaN(Number(rawExVal))) {
              rowExMap[col.id] = Math.min(col.maxScore, Math.max(0, Number(rawExVal)));
            }
          }

          const caSummary = computeStudentCaSummary(rowExMap, assessmentColumns);

          // Extract score values
          const classScoreRaw = getRowVal(item, [
            'classScore', 'class_score', 'ClassScore', 'Class Score', 'Class Score (30%)', 'Class (30%)',
            'Class Score(30%)', 'CA', 'CA Score', 'Class Work', 'Continuous Assessment', '30%', 'Score 30', 'ClassMark', 'Class Mark'
          ]);
          const examScoreRaw = getRowVal(item, [
            'examScore', 'exam_score', 'ExamScore', 'Exam Score', 'Exam Score (70%)', 'Exam (70%)',
            'Exam Score(70%)', 'Exam', 'Exams', 'Examination', 'Exam Mark', '70%', 'Score 70', 'ExamMark'
          ]);

          const classScore = caSummary.hasAnyEntry
            ? caSummary.scaledClassScore
            : Math.min(30, Math.max(0, Number(classScoreRaw || 0)));
          const examScore = Math.min(70, Math.max(0, Number(examScoreRaw || 0)));
          const total = classScore + examScore;
          const { grade, remarks } = calculateGrade(total);

          const subject = String(getRowVal(item, ['subject', 'Subject', 'subject_name', 'Subject Name', 'Course', 'course', 'SubjectTitle']) || selectedSubject).trim();
          const term = String(getRowVal(item, ['term', 'Term', 'academic_term', 'Academic Term', 'Semester', 'semester', 'Current Term']) || selectedTerm).trim();

          const res: Result = {
            studentId: effectiveStudentId,
            subject,
            term,
            class: rowClass || selectedClass,
            classScore,
            examScore,
            totalScore: total,
            grade,
            remarks,
            exerciseScores: caSummary.hasAnyEntry ? rowExMap : undefined,
            exerciseColumns: caSummary.hasAnyEntry ? assessmentColumns : undefined,
            rawCaScore: caSummary.hasAnyEntry ? caSummary.rawObtained : undefined,
            rawCaMax: caSummary.hasAnyEntry ? caSummary.rawMax : undefined
          };

          newResults.push(res);

          // Track for immediate local UI state update
          if (subject.toLowerCase() === selectedSubject.toLowerCase() && term.toLowerCase() === selectedTerm.toLowerCase()) {
            newScoresMap[effectiveStudentId] = { class: classScore, exam: examScore };
            if (caSummary.hasAnyEntry) {
              newExScoresMap[effectiveStudentId] = rowExMap;
            }
          }
        }

        // Save results to local Dexie and sync with cloud database
        for (const res of newResults) {
          const existing = await db.results
            .where({ studentId: res.studentId, subject: res.subject, term: res.term })
            .first();
          if (existing) {
            await db.results.update(existing.id!, res);
          } else {
            await db.results.add(res);
          }
        }

        await resultsApi.recordScores(newResults, targetSchoolId, {
          className: selectedClass,
          subject: selectedSubject,
          term: selectedTerm,
          columns: assessmentColumns,
          exerciseScores: newExScoresMap
        });

        // Update active scores in component memory
        if (Object.keys(newScoresMap).length > 0) {
          setScores(prev => ({ ...prev, ...newScoresMap }));
        }
        if (Object.keys(newExScoresMap).length > 0) {
          setExerciseScores(prev => ({ ...prev, ...newExScoresMap }));
        }
        setSupabaseSyncStatus('synced');
        setLastSupabaseSyncAt(Date.now());

        // Record file hash in registry for audit trail
        await recordImportedFile({
          hash: fileHash,
          fileName: file.name,
          fileSize: file.size,
          rowCount: newResults.length,
          schoolId: targetSchoolId,
          module: 'results',
          importedAt: Date.now(),
          importedBy: user?.username || user?.fullName || 'Admin'
        });

        showToast(`Successfully imported ${newResults.length} student result(s) with Class Score scaling & synced to Supabase!`, "success");
      } catch (err: any) {
        console.error("Results import error:", err);
        showToast(err?.message || "Failed to process results CSV file.", "error");
      } finally {
        e.target.value = '';
      }
    };
    reader.readAsBinaryString(file);
  };

  const openReport = async (student: Student) => {
    // Hydrate latest student results from Supabase so the Terminal Report Card reflects all cloud-synced subject scores
    try {
      await resultsApi.getByStudentAndTerm(student.studentId, selectedTerm, targetSchoolId);
    } catch (e) {}

    const dbResults = await db.results
      .where({ studentId: student.studentId, term: selectedTerm })
      .toArray();

    // Merge live in-memory score for the currently selected subject so unsaved or just-entered class exercise scores reflect immediately
    const liveStudentScore = scores[student.studentId];
    const liveExMap = exerciseScores[student.studentId];
    const caSummary = computeStudentCaSummary(liveExMap, assessmentColumns);

    let mergedResults = [...dbResults];
    if (liveStudentScore && !isStudent && user?.role !== 'parent') {
      const liveClassScore = caSummary.hasAnyEntry ? caSummary.scaledClassScore : (Number(liveStudentScore.class) || 0);
      const liveExamScore = Number(liveStudentScore.exam) || 0;
      const liveTotal = liveClassScore + liveExamScore;
      const { grade, remarks } = calculateGrade(liveTotal);

      const idx = mergedResults.findIndex(r => r.subject === selectedSubject && r.term === selectedTerm);
      const updatedCurrentSubjectResult: Result = {
        ...(idx >= 0 ? mergedResults[idx] : {}),
        studentId: student.studentId,
        subject: selectedSubject,
        term: selectedTerm,
        class: selectedClass,
        classScore: liveClassScore,
        examScore: liveExamScore,
        totalScore: liveTotal,
        grade,
        remarks
      };

      if (idx >= 0) {
        mergedResults[idx] = updatedCurrentSubjectResult;
      } else if (liveTotal > 0 || caSummary.hasAnyEntry) {
        mergedResults.push(updatedCurrentSubjectResult);
      }
    }

    setSelectedStudentForReport(student);
    setStudentResults(mergedResults);
    setIsReportModalOpen(true);
  };

  const [isExportingPDF, setIsExportingPDF] = useState(false);
  const handleExportPDF = async () => {
    if (!selectedStudentForReport) return;
    setIsExportingPDF(true);
    try {
      await exportToPDF(`report-${selectedStudentForReport.studentId}`, `${selectedStudentForReport.firstName}_${selectedStudentForReport.lastName}_Report`);
    } catch (err) {
      showToast('Failed to export student report PDF.', 'error');
    } finally {
      setIsExportingPDF(false);
    }
  };

  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [bulkExamScoreInput, setBulkExamScoreInput] = useState<string>('');

  useEffect(() => {
    setSelectedStudentIds([]);
  }, [selectedClass, selectedSubject, selectedTerm]);

  const toggleSelectStudent = (studentId: string) => {
    setSelectedStudentIds(prev =>
      prev.includes(studentId) ? prev.filter(id => id !== studentId) : [...prev, studentId]
    );
  };

  const downloadTemplate = () => {
    const buildTemplateRow = (s: { studentId: string; firstName: string; lastName: string }) => {
      const row: Record<string, any> = {
        studentId: s.studentId,
        firstName: s.firstName,
        lastName: s.lastName,
        subject: selectedSubject,
        term: selectedTerm,
        class: selectedClass
      };
      // Add active continuous assessment exercise columns
      assessmentColumns.forEach(col => {
        const stuEx = exerciseScores[s.studentId]?.[col.id];
        row[`${col.title} (${col.maxScore})`] = stuEx !== undefined ? stuEx : 0;
      });
      const currentScore = scores[s.studentId] || { class: 0, exam: 0 };
      row['classScore'] = currentScore.class || 0;
      row['examScore'] = currentScore.exam || 0;
      return row;
    };

    const templateData = (students || []).map(s => buildTemplateRow(s));

    if (templateData.length === 0) {
      templateData.push(buildTemplateRow({
        studentId: 'STU-000',
        firstName: 'Sample',
        lastName: 'Student'
      }));
    }

    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Exam_Results_Template");
    XLSX.writeFile(wb, `${selectedClass}_${selectedSubject}_Template.csv`, { bookType: 'csv' });
  };

  const exportResultsCsv = (onlySelected = false) => {
    const pool = onlySelected && selectedStudentIds.length > 0
      ? (filteredStudents || []).filter(s => selectedStudentIds.includes(s.studentId))
      : (filteredStudents || []);

    if (pool.length === 0) {
      showToast("No student results available to export.", "error");
      return;
    }

    const rows = pool.map((s) => {
      const stuExMap = exerciseScores[s.studentId] || {};
      const caSummary = computeStudentCaSummary(stuExMap, assessmentColumns);
      const score = scores[s.studentId] || { class: 0, exam: 0 };
      const effectiveClass = caSummary.hasAnyEntry ? caSummary.scaledClassScore : (score.class || 0);
      const effectiveExam = score.exam || 0;
      const total = effectiveClass + effectiveExam;
      const { grade, remarks } = calculateGrade(total);

      const row: Record<string, any> = {
        studentId: s.studentId,
        firstName: s.firstName,
        lastName: s.lastName,
        class: selectedClass,
        subject: selectedSubject,
        term: selectedTerm
      };
      assessmentColumns.forEach(col => {
        row[`${col.title} (${col.maxScore})`] = stuExMap[col.id] ?? 0;
      });
      row.classScore = effectiveClass;
      row.examScore = effectiveExam;
      row.totalScore = total;
      row.grade = grade;
      row.remarks = remarks;
      return row;
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Academic_Results");
    XLSX.writeFile(wb, `${selectedClass}_${selectedSubject}_${selectedTerm}_Results.csv`, { bookType: 'csv' });
    showToast(`Exported ${rows.length} student result record(s) to CSV.`, "success");
  };

  const handleBulkApplyExamScore = () => {
    if (selectedStudentIds.length === 0) return;
    const parsed = Number(bulkExamScoreInput);
    if (bulkExamScoreInput.trim() === '' || isNaN(parsed) || parsed < 0 || parsed > 70) {
      showToast("Enter a valid Exam score between 0 and 70.", "error");
      return;
    }
    const clamped = Math.min(70, Math.max(0, parsed));
    setScores(prev => {
      const next = { ...prev };
      selectedStudentIds.forEach(stuId => {
        next[stuId] = {
          ...(next[stuId] || { class: 0, exam: 0 }),
          exam: clamped
        };
      });
      return next;
    });
    showToast(`Applied Exam score (${clamped}/70) to ${selectedStudentIds.length} selected student(s). Tap Save All Marks to persist.`, "success");
    setBulkExamScoreInput('');
  };

  const handleBulkClearScores = () => {
    if (selectedStudentIds.length === 0) return;
    setScores(prev => {
      const next = { ...prev };
      selectedStudentIds.forEach(stuId => {
        next[stuId] = { class: 0, exam: 0 };
      });
      return next;
    });
    setExerciseScores(prev => {
      const next = { ...prev };
      selectedStudentIds.forEach(stuId => {
        next[stuId] = {};
      });
      return next;
    });
    showToast(`Cleared scores for ${selectedStudentIds.length} selected student(s). Tap Save All Marks to persist.`, "info");
  };

  const filteredStudents = students?.filter(s => {
    if (!s) return false;
    const query = (search || '').toLowerCase().trim();
    if (!query) return true;
    const firstName = (s.firstName || '').toLowerCase();
    const lastName = (s.lastName || '').toLowerCase();
    const studentId = (s.studentId || '').toLowerCase();
    return firstName.includes(query) || lastName.includes(query) || studentId.includes(query) || `${firstName} ${lastName}`.includes(query);
  });

  // Helper to render Exercise Breakdown pills in Student & Parent views
  const renderExerciseBreakdownBadges = (res: Result) => {
    if (!res.exerciseScores || Object.keys(res.exerciseScores).length === 0) {
      return (
        <span className="text-[11px] text-slate-400 font-medium italic">
          Direct CA Entry ({res.classScore}/30)
        </span>
      );
    }
    const cols = res.exerciseColumns && res.exerciseColumns.length > 0 ? res.exerciseColumns : DEFAULT_CA_COLUMNS;
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        {cols.map(c => {
          const val = res.exerciseScores?.[c.id];
          if (val === undefined) return null;
          return (
            <span
              key={c.id}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-[10px] font-mono font-bold text-slate-700"
            >
              <span className="text-slate-500">{c.title}:</span>
              <span className="text-indigo-950 font-extrabold">{val}/{c.maxScore}</span>
            </span>
          );
        })}
        {res.rawCaScore !== undefined && res.rawCaMax !== undefined && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-[10px] font-mono font-bold text-emerald-700">
            Raw {res.rawCaScore}/{res.rawCaMax} → {res.classScore}/30
          </span>
        )}
      </div>
    );
  };

  if (user?.role === 'parent') {
    if (parentWards.length === 0) {
      return (
        <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center max-w-2xl mx-auto space-y-4">
          <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center mx-auto">
            <AlertCircle className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-black text-slate-800">No Registered Wards Found</h3>
          <p className="text-slate-500 text-sm">
            We couldn't locate any student database records where your name (<b>{user?.fullName}</b>) is listed as a guardian.
          </p>
          <p className="text-slate-400 text-xs">
            Please contact the school administrator to update the guardian name on your child's student profile.
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-4 sm:space-y-6 w-full max-w-full min-w-0 overflow-x-hidden">
        {/* Parent Welcome & Ward Selector */}
        <div className="bg-[#1c4a59] p-4 sm:p-7 rounded-2xl sm:rounded-3xl border border-slate-800 text-white shadow-xl relative overflow-hidden">
          <div className="relative z-10 space-y-3 sm:space-y-4 max-w-xl min-w-0">
            <span className="px-2.5 sm:px-3 py-1 bg-white/10 border border-white/20 rounded-full text-[10px] font-black uppercase tracking-wider text-[#e1c594] inline-flex items-center gap-1.5">
              <Lock className="w-3 h-3 text-[#faae57]" /> PARENT PORTAL
            </span>
            <div className="space-y-1">
              <h2 className="text-xl sm:text-2xl font-black tracking-tight">
                Academic Results Terminal
              </h2>
              <p className="text-[#e1c594]/90 text-xs sm:text-sm font-medium leading-relaxed">
                Welcome back! View subject grades, class exercises, and generate official terminal report cards for your wards.
              </p>
            </div>

            {/* Ward selector chips */}
            {parentWards.length > 1 ? (
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-[#e1c594] uppercase tracking-wider block">Select Ward to View</label>
                <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
                  {parentWards.map(ward => (
                    <button
                      type="button"
                      key={ward.id || ward.studentId}
                      onClick={() => setSelectedWardId(ward.studentId)}
                      className={`px-3 py-2 rounded-xl text-xs font-bold transition-all border flex items-center justify-center sm:justify-start gap-1.5 min-w-0 cursor-pointer ${
                        selectedWardId === ward.studentId
                          ? 'bg-[#faae57] border-[#faae57] text-[#1f2a2e] shadow-sm font-black'
                          : 'bg-white/10 hover:bg-white/15 border-white/10 text-white'
                      }`}
                    >
                      <User className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{ward.firstName} {ward.lastName} ({ward.class})</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              selectedWard && (
                <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 sm:gap-3 pt-1 text-xs font-mono text-[#e1c594]">
                  <div className="bg-black/20 px-3 py-1.5 rounded-xl border border-white/10 truncate">
                    Ward: <span className="text-white font-extrabold">{selectedWard.firstName} {selectedWard.lastName}</span>
                  </div>
                  <div className="bg-black/20 px-3 py-1.5 rounded-xl border border-white/10 truncate">
                    Class: <span className="text-white font-extrabold">{selectedWard.class}</span>
                  </div>
                </div>
              )
            )}
          </div>
        </div>

        {/* Filters and Term Selection Row (`div:nth-of-type(2)`) */}
        <div className="bg-white p-3.5 sm:p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-end justify-between gap-3.5 sm:gap-4 min-w-0">
          <div className="space-y-1.5 w-full sm:w-auto min-w-0">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Academic Term</label>
            <div className="grid grid-cols-3 sm:flex gap-1.5 w-full sm:w-auto">
              {['Term 1', 'Term 2', 'Term 3'].map(t => (
                <button
                  type="button"
                  key={t}
                  onClick={() => setSelectedTerm(t)}
                  className={`px-3 sm:px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all border text-center cursor-pointer min-h-[40px] ${
                    selectedTerm === t
                      ? 'bg-[#1c4a59] border-[#1c4a59] text-[#faae57] shadow-xs'
                      : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-600'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {selectedWard && (
            <button
              type="button"
              onClick={() => openReport(selectedWard)}
              className="w-full sm:w-auto bg-[#faae57] hover:bg-[#e4ae67] text-[#1f2a2e] px-5 py-2.5 rounded-xl font-extrabold flex items-center justify-center gap-2 transition-all shadow-xs text-xs uppercase tracking-wider min-h-[42px] cursor-pointer"
            >
              <FileText className="w-4 h-4 shrink-0" />
              <span className="truncate">Official Report Card ({selectedWard.firstName})</span>
            </button>
          )}
        </div>

        {/* Mobile Subject Cards for Parent (< 768px) */}
        <div className="md:hidden space-y-2.5 min-w-0">
          <div className="flex items-center justify-between px-1">
            <h3 className="font-extrabold text-slate-800 text-xs uppercase tracking-wide">
              Subject Grades — {selectedTerm}
            </h3>
            <span className="text-[10px] font-mono text-slate-500 bg-white border border-slate-200 px-2 py-0.5 rounded-md font-bold">
              {myResults.length} Subjects
            </span>
          </div>
          {myResults.map((res) => (
            <div key={res.id} className="bg-white border border-slate-200 rounded-2xl p-3.5 shadow-xs space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-extrabold text-[#1c4a59] uppercase tracking-wide text-xs truncate">
                  {res.subject}
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="font-mono font-black text-slate-900 text-sm">{res.totalScore}%</span>
                  <span className={`px-2 py-0.5 rounded-md text-[10px] font-black font-mono border ${
                    res.totalScore >= 50 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'
                  }`}>
                    {res.grade}
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 p-2 rounded-xl border border-slate-100">
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase block">Class (30%)</span>
                  <span className="font-mono font-bold text-slate-700">{res.classScore} / 30</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase block">Exam (70%)</span>
                  <span className="font-mono font-bold text-slate-700">{res.examScore} / 70</span>
                </div>
              </div>
              <div>{renderExerciseBreakdownBadges(res)}</div>
              {res.remarks && (
                <p className="text-[11px] italic text-slate-500 border-t border-slate-100 pt-1.5">
                  Remark: {res.remarks}
                </p>
              )}
            </div>
          ))}
          {myResults.length === 0 && (
            <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-slate-400 font-bold text-xs italic">
              No exam or class score records found for {selectedTerm} yet.
            </div>
          )}
        </div>

        {/* Desktop Results Table for Parent (>= 768px) */}
        <div className="hidden md:block bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-extrabold text-slate-800 text-sm uppercase tracking-wide">
              Subject Grades & Class Exercises — {selectedTerm}
            </h3>
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider bg-slate-200/50 px-2.5 py-1 rounded-lg">
              {myResults.length} Subjects Evaluated
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-100">
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Subject</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Classwork & Exercises Breakdown</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Class Score (30%)</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Exam Score (70%)</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Total (100%)</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Grade</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {myResults.map((res) => (
                  <tr key={res.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-extrabold text-indigo-950 uppercase tracking-wide text-xs">{res.subject}</div>
                    </td>
                    <td className="px-6 py-4">
                      {renderExerciseBreakdownBadges(res)}
                    </td>
                    <td className="px-6 py-4 text-center font-bold text-slate-700 font-mono tabular-nums">
                      {res.classScore}
                    </td>
                    <td className="px-6 py-4 text-center font-bold text-slate-700 font-mono tabular-nums">
                      {res.examScore}
                    </td>
                    <td className="px-6 py-4 text-center font-black text-indigo-600 font-mono tabular-nums text-sm">
                      {res.totalScore}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`px-2.5 py-1 rounded-lg text-xs font-black ${
                        res.totalScore >= 50 ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-rose-50 text-rose-600 border border-rose-100'
                      }`}>
                        {res.grade}
                      </span>
                    </td>
                    <td className="px-6 py-4 italic text-xs text-slate-500 font-medium">
                      {res.remarks}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {myResults.length === 0 && (
              <div className="p-12 text-center text-slate-400 font-bold text-sm italic">
                No exam or class score records found for {selectedTerm} yet.
              </div>
            )}
          </div>
        </div>

        {/* Report Card Modal */}
        <AnimatePresence>
          {isReportModalOpen && selectedStudentForReport && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-sm">
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] overflow-hidden flex flex-col"
              >
                <div className="p-3 sm:p-4 border-b border-slate-100 flex items-center justify-between gap-2 print:hidden">
                  <h3 className="font-bold text-slate-800 text-sm sm:text-base truncate">Terminal Report Preview</h3>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={triggerPrint}
                      className="flex items-center gap-1.5 bg-white border border-slate-200 text-slate-700 px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg font-bold hover:bg-slate-50 transition-all h-9 sm:h-10 text-xs sm:text-sm shadow-sm cursor-pointer"
                    >
                      <Printer className="w-4 h-4 text-indigo-600" />
                      <span>Print</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleExportPDF}
                      disabled={isExportingPDF}
                      className="flex items-center gap-1.5 bg-slate-800 text-white px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg font-bold hover:bg-slate-900 transition-all disabled:opacity-50 h-9 sm:h-10 text-xs sm:text-sm cursor-pointer"
                    >
                      <FileText className="w-4 h-4" />
                      <span>{isExportingPDF ? '...' : 'PDF'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsReportModalOpen(false)}
                      className="p-1.5 sm:p-2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      <X className="w-5 h-5 sm:w-6 sm:h-6" />
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-3 sm:p-8 bg-slate-100 flex items-start sm:items-center justify-start sm:justify-center overflow-x-auto">
                  <div id={`report-${selectedStudentForReport.studentId}`} className="shadow-2xl">
                    <ReportCard
                      student={selectedStudentForReport}
                      results={studentResults}
                      term={selectedTerm}
                      academicYear={academicConfig.academicYear}
                      schoolProfile={schoolProfile}
                      academicConfig={academicConfig}
                      termReport={{
                        studentId: selectedStudentForReport.studentId,
                        term: selectedTerm,
                        academicYear: academicConfig.academicYear,
                        attendancePresent: 68,
                        attendanceTotal: 70,
                        teacherRemark: 'Student has shown good progress this term. Keep working hard.',
                        headmasterRemark: 'A satisfactory result. Promoted.'
                      }}
                    />
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  if (isStudent) {
    if (!studentRecord) {
      return (
        <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 text-center max-w-2xl mx-auto space-y-4">
          <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center mx-auto">
            <AlertCircle className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-black text-slate-800">Student Profile Not Linked</h3>
          <p className="text-slate-500 text-sm">
            We couldn't locate a student database record matching your user account name (<b>{user?.fullName}</b>).
          </p>
          <p className="text-slate-400 text-xs">
            Please contact the school administrator to ensure your student profile has the exact same name as your login.
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-4 sm:space-y-6 w-full max-w-full min-w-0 overflow-x-hidden">
        {/* Student Welcome & Quick Actions Card */}
        <div className="bg-[#1c4a59] p-4 sm:p-7 rounded-2xl sm:rounded-3xl border border-slate-800 text-white shadow-xl relative overflow-hidden">
          <div className="relative z-10 space-y-3 sm:space-y-4 max-w-xl min-w-0">
            <span className="px-2.5 sm:px-3 py-1 bg-white/10 border border-white/20 rounded-full text-[10px] font-black uppercase tracking-wider text-[#e1c594] inline-flex items-center gap-1.5">
              <Lock className="w-3 h-3 text-[#faae57]" /> STUDENT PORTAL
            </span>
            <div className="space-y-1">
              <h2 className="text-xl sm:text-2xl font-black tracking-tight">
                Academic Results Terminal
              </h2>
              <p className="text-[#e1c594]/90 text-xs sm:text-sm font-medium leading-relaxed">
                Welcome back, <b>{studentRecord.firstName} {studentRecord.lastName}</b>! View your subject grades, class assessments, and generate your official terminal report card.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 sm:gap-3 pt-1 text-xs font-mono text-[#e1c594]">
              <div className="bg-black/20 px-3 py-1.5 rounded-xl border border-white/10 truncate">
                Class: <span className="text-white font-extrabold">{studentRecord.class}</span>
              </div>
              <div className="bg-black/20 px-3 py-1.5 rounded-xl border border-white/10 truncate">
                ID: <span className="text-white font-extrabold">{studentRecord.studentId}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Filters and Term Selection Row (`div:nth-of-type(2)`) */}
        <div className="bg-white p-3.5 sm:p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-end justify-between gap-3.5 sm:gap-4 min-w-0">
          <div className="space-y-1.5 w-full sm:w-auto min-w-0">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Academic Term</label>
            <div className="grid grid-cols-3 sm:flex gap-1.5 w-full sm:w-auto">
              {['Term 1', 'Term 2', 'Term 3'].map(t => (
                <button
                  type="button"
                  key={t}
                  onClick={() => setSelectedTerm(t)}
                  className={`px-3 sm:px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all border text-center cursor-pointer min-h-[40px] ${
                    selectedTerm === t
                      ? 'bg-[#1c4a59] border-[#1c4a59] text-[#faae57] shadow-xs'
                      : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-600'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={() => openReport(studentRecord)}
            className="w-full sm:w-auto bg-[#faae57] hover:bg-[#e4ae67] text-[#1f2a2e] px-5 py-2.5 rounded-xl font-extrabold flex items-center justify-center gap-2 transition-all shadow-xs text-xs uppercase tracking-wider min-h-[42px] cursor-pointer"
          >
            <FileText className="w-4 h-4 shrink-0" />
            <span className="truncate">Generate Official Report Card</span>
          </button>
        </div>

        {/* Mobile Subject Cards for Student (< 768px) */}
        <div className="md:hidden space-y-2.5 min-w-0">
          <div className="flex items-center justify-between px-1">
            <h3 className="font-extrabold text-slate-800 text-xs uppercase tracking-wide">
              Subject Grades — {selectedTerm}
            </h3>
            <span className="text-[10px] font-mono text-slate-500 bg-white border border-slate-200 px-2 py-0.5 rounded-md font-bold">
              {myResults.length} Subjects
            </span>
          </div>
          {myResults.map((res) => (
            <div key={res.id} className="bg-white border border-slate-200 rounded-2xl p-3.5 shadow-xs space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-extrabold text-[#1c4a59] uppercase tracking-wide text-xs truncate">
                  {res.subject}
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="font-mono font-black text-slate-900 text-sm">{res.totalScore}%</span>
                  <span className={`px-2 py-0.5 rounded-md text-[10px] font-black font-mono border ${
                    res.totalScore >= 50 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'
                  }`}>
                    {res.grade}
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 p-2 rounded-xl border border-slate-100">
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase block">Class (30%)</span>
                  <span className="font-mono font-bold text-slate-700">{res.classScore} / 30</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase block">Exam (70%)</span>
                  <span className="font-mono font-bold text-slate-700">{res.examScore} / 70</span>
                </div>
              </div>
              <div>{renderExerciseBreakdownBadges(res)}</div>
              {res.remarks && (
                <p className="text-[11px] italic text-slate-500 border-t border-slate-100 pt-1.5">
                  Remark: {res.remarks}
                </p>
              )}
            </div>
          ))}
          {myResults.length === 0 && (
            <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-slate-400 font-bold text-xs italic">
              No exam or class score records found for {selectedTerm} yet.
            </div>
          )}
        </div>

        {/* Desktop Results Table for Student (>= 768px) */}
        <div className="hidden md:block bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-extrabold text-slate-800 text-sm uppercase tracking-wide">
              Subject Grades & Class Exercises — {selectedTerm}
            </h3>
            <span className="text-[10px] font-mono text-slate-450 uppercase tracking-wider bg-slate-200/50 px-2.5 py-1 rounded-lg">
              {myResults.length} Subjects Evaluated
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-100">
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Subject</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Classwork & Exercises Breakdown</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Class Score (30%)</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Exam Score (70%)</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Total (100%)</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Grade</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {myResults.map((res) => (
                  <tr key={res.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-extrabold text-indigo-950 uppercase tracking-wide text-xs">{res.subject}</div>
                    </td>
                    <td className="px-6 py-4">
                      {renderExerciseBreakdownBadges(res)}
                    </td>
                    <td className="px-6 py-4 text-center font-bold text-slate-700 font-mono tabular-nums">
                      {res.classScore}
                    </td>
                    <td className="px-6 py-4 text-center font-bold text-slate-700 font-mono tabular-nums">
                      {res.examScore}
                    </td>
                    <td className="px-6 py-4 text-center font-black text-indigo-600 font-mono tabular-nums text-sm">
                      {res.totalScore}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`px-2.5 py-1 rounded-lg text-xs font-black ${
                        res.totalScore >= 50 ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-rose-50 text-rose-600 border border-rose-100'
                      }`}>
                        {res.grade}
                      </span>
                    </td>
                    <td className="px-6 py-4 italic text-xs text-slate-500 font-medium">
                      {res.remarks}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {myResults.length === 0 && (
              <div className="p-12 text-center text-slate-400 font-bold text-sm italic">
                No exam or class score records found for {selectedTerm} yet.
              </div>
            )}
          </div>
        </div>

        {/* Report Card Modal */}
        <AnimatePresence>
          {isReportModalOpen && selectedStudentForReport && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-sm">
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] overflow-hidden flex flex-col"
              >
                <div className="p-3 sm:p-4 border-b border-slate-100 flex items-center justify-between gap-2 print:hidden">
                  <h3 className="font-bold text-slate-800 text-sm sm:text-base truncate">Terminal Report Preview</h3>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={triggerPrint}
                      className="flex items-center gap-1.5 bg-white border border-slate-200 text-slate-700 px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg font-bold hover:bg-slate-50 transition-all h-9 sm:h-10 text-xs sm:text-sm shadow-sm cursor-pointer"
                    >
                      <Printer className="w-4 h-4 text-indigo-600" />
                      <span>Print</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleExportPDF}
                      disabled={isExportingPDF}
                      className="flex items-center gap-1.5 bg-slate-800 text-white px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg font-bold hover:bg-slate-900 transition-all disabled:opacity-50 h-9 sm:h-10 text-xs sm:text-sm cursor-pointer"
                    >
                      <FileText className="w-4 h-4" />
                      <span>{isExportingPDF ? '...' : 'PDF'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsReportModalOpen(false)}
                      className="p-1.5 sm:p-2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      <X className="w-5 h-5 sm:w-6 sm:h-6" />
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-3 sm:p-8 bg-slate-100 flex items-start sm:items-center justify-start sm:justify-center overflow-x-auto">
                  <div id={`report-${selectedStudentForReport.studentId}`} className="shadow-2xl">
                    <ReportCard
                      student={selectedStudentForReport}
                      results={studentResults}
                      term={selectedTerm}
                      academicYear={academicConfig.academicYear}
                      schoolProfile={schoolProfile}
                      academicConfig={academicConfig}
                      termReport={{
                        studentId: selectedStudentForReport.studentId,
                        term: selectedTerm,
                        academicYear: academicConfig.academicYear,
                        attendancePresent: 68,
                        attendanceTotal: 70,
                        teacherRemark: 'Student has shown good progress this term. Keep working hard.',
                        headmasterRemark: 'A satisfactory result. Promoted.'
                      }}
                    />
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 w-full max-w-full min-w-0 overflow-x-hidden">
      {/* Deep Teal Hero Header Card */}
      <div className="bg-[#1c4a59] rounded-2xl sm:rounded-3xl p-4 sm:p-6 lg:p-7 text-white shadow-[0_8px_28px_rgba(28,74,89,0.16)] flex flex-col gap-4 sm:gap-5 print:hidden w-full max-w-full min-w-0 overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3.5 sm:gap-4 min-w-0">
          <div className="space-y-1.5 sm:space-y-2 min-w-0">
            <div className="inline-flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1 rounded-full bg-white/10 border border-white/15 max-w-full">
              <FileSpreadsheet className="w-3.5 h-3.5 text-[#faae57] shrink-0" />
              <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-[#e1c594] truncate">
                Continuous Assessment & Exam Matrix
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl lg:text-[28px] font-extrabold tracking-tight text-white leading-tight break-words">
              Academic Results Terminal • {selectedClass}
            </h2>
            <p className="text-xs sm:text-sm text-[#e1c594]/90 font-medium leading-relaxed break-words">
              {selectedSubject || 'All Subjects'} • {selectedTerm} • Class Exercises Auto-Scale to 30% Class Score + 70% Exam
            </p>
          </div>

          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 sm:gap-2.5 w-full lg:w-auto min-w-0">
            <input
              type="file"
              id="import-results-csv"
              className="hidden"
              accept=".csv, text/csv"
              onChange={importFromCsv}
            />
            <button
              type="button"
              onClick={() => setIsAddExerciseOpen(prev => !prev)}
              className="col-span-1 w-full sm:w-auto bg-white/10 hover:bg-white/20 text-white border border-white/15 px-3 sm:px-4 py-2.5 rounded-xl sm:rounded-full font-bold flex items-center justify-center gap-1.5 sm:gap-2 transition-all min-h-[42px] sm:min-h-[44px] text-xs cursor-pointer min-w-0"
              title="Add Class Exercise, Homework, or Class Test Column"
            >
              <Plus className="w-4 h-4 text-[#faae57] shrink-0" />
              <span className="truncate">+ Add Classwork</span>
            </button>
            <button
              type="button"
              onClick={downloadTemplate}
              className="col-span-1 w-full sm:w-auto bg-white/10 hover:bg-white/20 text-white border border-white/15 px-3 sm:px-4 py-2.5 rounded-xl sm:rounded-full font-bold flex items-center justify-center gap-1.5 sm:gap-2 transition-all min-h-[42px] sm:min-h-[44px] text-xs cursor-pointer min-w-0"
              title="Download CSV Results Template (includes active Exercise columns)"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#06d6a0] shrink-0" />
              <span className="truncate">CSV Template</span>
            </button>
            <button
              type="button"
              onClick={() => document.getElementById('import-results-csv')?.click()}
              className="col-span-1 w-full sm:w-auto bg-white/10 hover:bg-white/20 text-white border border-white/15 px-3 sm:px-4 py-2.5 rounded-xl sm:rounded-full font-bold flex items-center justify-center gap-1.5 sm:gap-2 transition-all min-h-[42px] sm:min-h-[44px] text-xs cursor-pointer min-w-0"
              title="Import CSV Results File"
            >
              <Download className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#faae57] shrink-0" />
              <span className="truncate">Import CSV</span>
            </button>
            <button
              type="button"
              onClick={() => exportResultsCsv(false)}
              className="col-span-1 w-full sm:w-auto bg-white/10 hover:bg-white/20 text-white border border-white/15 px-3 sm:px-4 py-2.5 rounded-xl sm:rounded-full font-bold flex items-center justify-center gap-1.5 sm:gap-2 transition-all min-h-[42px] sm:min-h-[44px] text-xs cursor-pointer min-w-0"
              title="Export Current Class Results to CSV"
            >
              <Download className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#06d6a0] shrink-0" />
              <span className="truncate">Export CSV</span>
            </button>
            <button
              type="button"
              onClick={handleBulkSave}
              disabled={isSaving}
              className="col-span-2 sm:col-span-1 w-full sm:w-auto bg-[#faae57] hover:bg-[#e4ae67] text-[#1f2a2e] px-5 sm:px-6 py-2.5 rounded-xl sm:rounded-full font-bold flex items-center justify-center gap-2 active:scale-[0.97] transition-all disabled:opacity-50 shadow-sm min-h-[42px] sm:min-h-[44px] text-xs sm:text-sm cursor-pointer min-w-0"
            >
              {isSaving ? <RefreshCcw className="w-4 h-4 animate-spin shrink-0" /> : <Save className="w-4 h-4 stroke-[2.5] shrink-0" />}
              <span className="truncate">{isSaving ? 'Saving...' : 'Save All Marks'}</span>
            </button>
          </div>
        </div>

        <div className="pt-3.5 sm:pt-4 border-t border-white/10 grid grid-cols-2 md:grid-cols-4 lg:flex lg:flex-wrap items-end gap-2.5 sm:gap-4 w-full min-w-0">
          <div className="col-span-1 space-y-1 min-w-0">
            <label className="text-[10px] font-bold text-[#e1c594] uppercase tracking-wider block truncate">Class</label>
            <select
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value)}
              className="block w-full lg:w-36 bg-white border border-[#bac4c6] rounded-xl sm:rounded-full px-3 sm:px-4 py-2 text-xs sm:text-sm font-bold text-[#1f2a2e] focus:ring-2 focus:ring-[#faae57] outline-none min-h-[42px] sm:min-h-[44px] cursor-pointer truncate"
            >
              {classes?.length ? classes.map(c => <option key={c.id} value={c.name}>{c.name}</option>) : <option>P1</option>}
            </select>
          </div>
          <div className="col-span-1 space-y-1 min-w-0 md:order-3 lg:order-none">
            <label className="text-[10px] font-bold text-[#e1c594] uppercase tracking-wider block truncate">Term</label>
            <select
              value={selectedTerm}
              onChange={(e) => setSelectedTerm(e.target.value)}
              className="block w-full lg:w-36 bg-white border border-[#bac4c6] rounded-xl sm:rounded-full px-3 sm:px-4 py-2 text-xs sm:text-sm font-bold text-[#1f2a2e] focus:ring-2 focus:ring-[#faae57] outline-none min-h-[42px] sm:min-h-[44px] cursor-pointer truncate"
            >
              {['Term 1', 'Term 2', 'Term 3'].map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div className="col-span-2 md:col-span-2 lg:col-span-1 space-y-1 min-w-0 md:order-2 lg:order-none">
            <label className="text-[10px] font-bold text-[#e1c594] uppercase tracking-wider block truncate">Subject</label>
            <select
              value={selectedSubject}
              onChange={(e) => setSelectedSubject(e.target.value)}
              className="block w-full lg:w-52 bg-white border border-[#bac4c6] rounded-xl sm:rounded-full px-3 sm:px-4 py-2 text-xs sm:text-sm font-bold text-[#1f2a2e] focus:ring-2 focus:ring-[#faae57] outline-none min-h-[42px] sm:min-h-[44px] cursor-pointer truncate"
            >
              {filteredSubjectsOptions?.length ? filteredSubjectsOptions.map(s => <option key={s.id} value={s.name}>{s.name}</option>) : <option>Mathematics</option>}
            </select>
          </div>

          <div className="col-span-2 md:col-span-2 lg:col-span-1 space-y-1 min-w-0 md:order-4 lg:order-none">
            <label className="text-[10px] font-bold text-[#e1c594] uppercase tracking-wider block truncate">Entry Mode</label>
            <div className="grid grid-cols-2 lg:inline-flex w-full lg:w-auto bg-black/25 p-1 rounded-xl sm:rounded-full border border-white/10 min-h-[42px] sm:min-h-[44px] items-center gap-1 min-w-0">
              <button
                type="button"
                onClick={() => setViewMode('ca-matrix')}
                className={cn(
                  "w-full lg:w-auto px-2.5 sm:px-3.5 py-1.5 rounded-lg sm:rounded-full text-[11px] sm:text-xs font-bold transition-all cursor-pointer flex items-center justify-center text-center min-h-[34px] min-w-0",
                  viewMode === 'ca-matrix'
                    ? "bg-[#faae57] text-[#1f2a2e] shadow-sm"
                    : "text-white/80 hover:text-white"
                )}
              >
                <span className="truncate">CA Exercises + Exam</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('summary-only')}
                className={cn(
                  "w-full lg:w-auto px-2.5 sm:px-3.5 py-1.5 rounded-lg sm:rounded-full text-[11px] sm:text-xs font-bold transition-all cursor-pointer flex items-center justify-center text-center min-h-[34px] min-w-0",
                  viewMode === 'summary-only'
                    ? "bg-[#faae57] text-[#1f2a2e] shadow-sm"
                    : "text-white/80 hover:text-white"
                )}
              >
                <span className="truncate">Direct Summary</span>
              </button>
            </div>
          </div>

          <div className="col-span-2 md:col-span-4 lg:flex-1 min-w-0 md:order-5 lg:order-none">
            <label className="text-[10px] font-bold text-[#e1c594] uppercase tracking-wider mb-1 block truncate">Quick Student Search</label>
            <div className="relative min-w-0">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6a7f84] pointer-events-none" />
              <input
                type="text"
                placeholder="Filter by student name or ID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-white border border-[#bac4c6] rounded-xl sm:rounded-full text-xs sm:text-sm font-medium text-[#1f2a2e] outline-none focus:ring-2 focus:ring-[#faae57] min-h-[42px] sm:min-h-[44px]"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Continuous Assessment (CA) Column Manager & Formula Bar */}
      {viewMode === 'ca-matrix' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-3.5 sm:p-5 shadow-sm space-y-3.5 sm:space-y-4 print:hidden min-w-0 overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 min-w-0">
            <div className="flex items-start sm:items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-teal-50 border border-teal-100 flex items-center justify-center text-[#1c4a59] shrink-0">
                <Calculator className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-800 break-words">
                    Classwork, Homework & Class Tests ({selectedSubject})
                  </h3>
                  <span className="px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-[10px] font-mono font-bold text-emerald-700 whitespace-nowrap">
                    Raw Max: {totalRawMax} pts → Auto-Scaled to 30%
                  </span>
                  {supabaseSyncStatus === 'syncing' && (
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-sky-50 border border-sky-200 text-[10px] font-mono font-bold text-sky-700 whitespace-nowrap">
                      <RefreshCcw className="w-3 h-3 animate-spin" />
                      Syncing to Supabase...
                    </span>
                  )}
                  {supabaseSyncStatus === 'synced' && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-[10px] font-mono font-bold text-emerald-700 whitespace-nowrap">
                      <CheckCircle2 className="w-3 h-3" />
                      Synced to Supabase
                      {lastSupabaseSyncAt ? ` · ${new Date(lastSupabaseSyncAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
                    </span>
                  )}
                </div>
                <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5 leading-relaxed">
                  Enter marks for each exercise, homework, or test below. Changes auto-save to Supabase and scale to the <b className="text-slate-700">30% Class Score</b> on the Terminal Report Card.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:flex items-center gap-2 w-full sm:w-auto shrink-0 min-w-0">
              <button
                type="button"
                onClick={handleResetDefaultColumns}
                className="w-full sm:w-auto px-3 py-2 sm:py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer min-h-[38px] min-w-0"
                title="Reset to Ex 1 (/10), Ex 2 (/10), HW 1 (/10), Test 1 (/20)"
              >
                <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Reset Standard CA</span>
              </button>
              <button
                type="button"
                onClick={() => setIsAddExerciseOpen(prev => !prev)}
                className="w-full sm:w-auto px-3.5 py-2 sm:py-1.5 rounded-xl bg-[#1c4a59] hover:bg-[#163b47] text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer min-h-[38px] min-w-0"
              >
                <Plus className="w-3.5 h-3.5 text-[#faae57] shrink-0" />
                <span className="truncate">Add Exercise / Test</span>
              </button>
            </div>
          </div>

          {/* Active Assessment Column Chips */}
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 pt-0.5">
            {assessmentColumns.map((col) => {
              const badgeStyle =
                col.category === 'Exercise'
                  ? 'bg-sky-50 border-sky-200 text-sky-900'
                  : col.category === 'Homework'
                  ? 'bg-amber-50 border-amber-200 text-amber-900'
                  : 'bg-indigo-50 border-indigo-200 text-indigo-900';

              return (
                <div
                  key={col.id}
                  className={cn(
                    "inline-flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-xl border text-[11px] sm:text-xs font-bold transition-all max-w-full",
                    badgeStyle
                  )}
                >
                  <span className="text-[9px] sm:text-[10px] uppercase tracking-wider opacity-70 font-extrabold shrink-0">
                    {col.category}:
                  </span>
                  <span className="font-extrabold truncate">{col.title}</span>
                  <span className="font-mono text-[10px] sm:text-[11px] px-1.5 py-0.5 rounded bg-white/80 border border-black/5 font-black shrink-0">
                    /{col.maxScore}
                  </span>
                  {assessmentColumns.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveAssessmentColumn(col.id)}
                      className="text-slate-400 hover:text-rose-600 transition-colors ml-0.5 cursor-pointer shrink-0"
                      title={`Remove ${col.title}`}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Inline Add Exercise / Homework / Test Form */}
          <AnimatePresence>
            {isAddExerciseOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="p-3.5 sm:p-4 rounded-xl bg-slate-50 border border-slate-200 grid grid-cols-2 sm:flex sm:flex-row items-stretch sm:items-end gap-2.5 sm:gap-3 mt-2">
                  <div className="col-span-2 sm:flex-1 space-y-1 min-w-0">
                    <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 block">
                      Assessment Title
                    </label>
                    <input
                      type="text"
                      value={newExTitle}
                      onChange={(e) => setNewExTitle(e.target.value)}
                      placeholder="e.g. Ex 3, Homework 2, Mid-Term Test..."
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-[#1c4a59] min-h-[38px]"
                    />
                  </div>
                  <div className="col-span-1 sm:w-44 space-y-1 min-w-0">
                    <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 block truncate">
                      Category
                    </label>
                    <select
                      value={newExCategory}
                      onChange={(e) => setNewExCategory(e.target.value as 'Exercise' | 'Homework' | 'Test')}
                      className="w-full px-2.5 sm:px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-[#1c4a59] min-h-[38px] truncate"
                    >
                      <option value="Exercise">Class Exercise</option>
                      <option value="Homework">Homework / Assignment</option>
                      <option value="Test">Class Test / Quiz</option>
                    </select>
                  </div>
                  <div className="col-span-1 sm:w-32 space-y-1 min-w-0">
                    <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 block truncate">
                      Max Marks
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={newExMaxScore}
                      onChange={(e) => setNewExMaxScore(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-800 outline-none focus:ring-2 focus:ring-[#1c4a59] min-h-[38px]"
                    />
                  </div>
                  <div className="col-span-2 sm:w-auto grid grid-cols-2 sm:flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleAddAssessmentColumn}
                      className="w-full sm:w-auto px-4 py-2 rounded-lg bg-[#faae57] hover:bg-[#e4ae67] text-[#1f2a2e] text-xs font-extrabold transition-all cursor-pointer min-h-[38px]"
                    >
                      Add Column
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsAddExerciseOpen(false)}
                      className="w-full sm:w-auto px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-600 text-xs font-bold transition-all cursor-pointer min-h-[38px]"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {savedSuccess && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, x: 120 }}
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          onDragEnd={(_, info) => {
            if (Math.abs(info.offset.x) > 65) setSavedSuccess(false);
          }}
          className="bg-emerald-50 border border-emerald-100 text-emerald-700 px-3.5 sm:px-4 py-3 rounded-xl flex items-center justify-between gap-2 text-xs sm:text-sm font-medium touch-pan-y select-none"
        >
          <div className="flex items-center gap-2 min-w-0">
            <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
            <span>Class exercises, auto-scaled 30% Class Scores, and Exam scores saved to the terminal and synced to Report Cards!</span>
          </div>
          <button type="button" onClick={() => setSavedSuccess(false)} className="p-1 hover:bg-emerald-100 rounded-lg shrink-0 cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        </motion.div>
      )}

      {/* Bulk Action Toolbar */}
      <AnimatePresence>
        {selectedStudentIds.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="bg-[#1c4a59] text-white rounded-2xl p-3.5 sm:p-4 shadow-md border border-white/15 flex flex-col lg:flex-row lg:items-center justify-between gap-3 print:hidden min-w-0"
          >
            <div className="flex items-center justify-between sm:justify-start gap-2.5 min-w-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="w-7 h-7 rounded-lg bg-[#faae57] text-[#1f2a2e] font-mono font-extrabold text-xs flex items-center justify-center shrink-0">
                  {selectedStudentIds.length}
                </span>
                <span className="text-xs sm:text-sm font-bold truncate">
                  {selectedStudentIds.length === 1 ? '1 Student Selected' : `${selectedStudentIds.length} Students Selected`}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedStudentIds([])}
                className="text-[11px] font-bold text-[#e1c594] hover:text-white underline cursor-pointer shrink-0"
              >
                Clear Selection
              </button>
            </div>

            <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 w-full lg:w-auto min-w-0">
              <div className="col-span-2 sm:col-span-1 flex items-center gap-1.5 bg-white/10 p-1 rounded-xl border border-white/15 min-w-0 w-full sm:w-auto">
                <input
                  type="number"
                  min="0"
                  max="70"
                  value={bulkExamScoreInput}
                  onChange={(e) => setBulkExamScoreInput(e.target.value)}
                  placeholder="Exam /70"
                  className="flex-1 min-w-0 sm:w-28 h-8 px-2.5 rounded-lg bg-white text-[#1f2a2e] text-xs font-mono font-bold outline-none"
                />
                <button
                  type="button"
                  onClick={handleBulkApplyExamScore}
                  className="shrink-0 px-3 h-8 rounded-lg bg-[#faae57] hover:bg-[#e4ae67] text-[#1f2a2e] text-xs font-bold transition-all cursor-pointer whitespace-nowrap"
                >
                  Apply Exam
                </button>
              </div>
              <button
                type="button"
                onClick={() => exportResultsCsv(true)}
                className="min-w-0 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer min-h-[38px]"
              >
                <Download className="w-3.5 h-3.5 text-[#06d6a0] shrink-0" />
                <span className="truncate">Export Selected</span>
              </button>
              <button
                type="button"
                onClick={handleBulkClearScores}
                className="min-w-0 px-3 py-2 rounded-xl bg-[#ef476f] hover:bg-[#d93d63] text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer min-h-[38px]"
              >
                <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Clear Marks</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile Student Score Cards (< 768px) */}
      <div className="md:hidden space-y-3 min-w-0">
        {Boolean(filteredStudents?.length) && (
          <div className="flex items-center justify-between bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 shadow-2xs">
            <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={
                  Boolean(filteredStudents?.length) &&
                  selectedStudentIds.length === (filteredStudents?.length || 0)
                }
                onChange={(e) => {
                  if (e.target.checked) {
                    setSelectedStudentIds((filteredStudents || []).map(s => s.studentId));
                  } else {
                    setSelectedStudentIds([]);
                  }
                }}
                className="w-4 h-4 rounded border-slate-300 text-[#1c4a59] focus:ring-[#1c4a59] cursor-pointer"
              />
              <span>Select All Students ({filteredStudents?.length || 0})</span>
            </label>
            {selectedStudentIds.length > 0 && (
              <span className="text-[11px] font-mono font-bold text-[#1c4a59]">
                {selectedStudentIds.length} selected
              </span>
            )}
          </div>
        )}
        {filteredStudents?.map((student) => {
          const stuExMap = exerciseScores[student.studentId] || {};
          const caSummary = computeStudentCaSummary(stuExMap, assessmentColumns);
          const score = scores[student.studentId] || { class: 0, exam: 0 };
          const effectiveClassScore = caSummary.hasAnyEntry ? caSummary.scaledClassScore : (score.class || 0);
          const effectiveExamScore = score.exam || 0;
          const total = effectiveClassScore + effectiveExamScore;
          const { grade, remarks } = calculateGrade(total);

          return (
            <div
              key={`mob-${student.id || student.studentId}`}
              className={cn(
                "bg-white border rounded-2xl p-3.5 shadow-xs space-y-3 min-w-0 transition-colors",
                selectedStudentIds.includes(student.studentId)
                  ? "border-[#1c4a59] ring-1 ring-[#1c4a59]/20"
                  : "border-slate-200"
              )}
            >
              {/* Card Top Row: Checkbox + Student Identity + Total/Grade + Preview Button */}
              <div className="flex items-start justify-between gap-2 pb-2.5 border-b border-slate-100">
                <div className="flex items-center gap-2.5 min-w-0">
                  <input
                    type="checkbox"
                    checked={selectedStudentIds.includes(student.studentId)}
                    onChange={() => toggleSelectStudent(student.studentId)}
                    className="w-4 h-4 rounded border-slate-300 text-[#1c4a59] focus:ring-[#1c4a59] shrink-0 cursor-pointer"
                    aria-label={`Select ${student.firstName} ${student.lastName}`}
                  />
                  <div className="w-9 h-9 rounded-xl bg-[#1c4a59]/10 border border-[#1c4a59]/20 text-[#1c4a59] flex items-center justify-center font-extrabold text-xs shrink-0">
                    {student.firstName?.[0]}{student.lastName?.[0]}
                  </div>
                  <div className="min-w-0">
                    <div className="font-bold text-slate-900 text-xs sm:text-sm truncate">
                      {student.firstName} {student.lastName}
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono truncate">
                      {student.studentId}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <div className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <span className="font-mono tabular-nums font-extrabold text-slate-900 text-sm">
                        {total}%
                      </span>
                      <span
                        className={cn(
                          "px-1.5 py-0.5 rounded-md text-[10px] font-bold font-mono border",
                          total >= 50
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : "bg-rose-50 text-rose-700 border-rose-200"
                        )}
                      >
                        {grade}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-400 italic truncate max-w-[110px]">
                      {remarks}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => openReport(student)}
                    className="w-9 h-9 flex items-center justify-center text-[#1c4a59] bg-slate-50 hover:bg-teal-50 rounded-xl border border-slate-200 transition-colors cursor-pointer shrink-0"
                    title="Preview Terminal Report Card"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* CA Exercises Input Grid (When in CA Matrix Mode) */}
              {viewMode === 'ca-matrix' && (
                <div className="bg-teal-50/40 border border-teal-100 rounded-xl p-2.5 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#1c4a59]">
                      CA Exercises & Tests
                    </span>
                    <span className="text-[10px] font-mono font-bold text-teal-800 bg-white px-2 py-0.5 rounded-md border border-teal-200">
                      Raw: {caSummary.hasAnyEntry ? caSummary.rawObtained : 0}/{totalRawMax} pts
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {assessmentColumns.map((col) => {
                      const cellVal = stuExMap[col.id];
                      return (
                        <div key={col.id} className="space-y-1 min-w-0">
                          <label className="text-[10px] font-bold text-slate-600 flex items-center justify-between gap-1 truncate">
                            <span className="truncate">{col.title}</span>
                            <span className="font-mono text-[9px] text-slate-400 shrink-0">/{col.maxScore}</span>
                          </label>
                          <input
                            type="number"
                            min="0"
                            max={col.maxScore}
                            value={cellVal === undefined || cellVal === null ? '' : cellVal}
                            onChange={(e) => handleExerciseScoreChange(student.studentId, col, e.target.value)}
                            placeholder={`0/${col.maxScore}`}
                            className="w-full h-9 text-center px-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#1c4a59] outline-none font-mono tabular-nums font-bold text-xs text-slate-800 placeholder:text-slate-300"
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Class Score (30%) & Exam Score (70%) Side-by-Side */}
              <div className="grid grid-cols-2 gap-2.5">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 truncate">
                      Class (30%)
                    </label>
                    {caSummary.hasAnyEntry && (
                      <span className="text-[9px] font-mono font-bold text-emerald-600 shrink-0">
                        Scaled
                      </span>
                    )}
                  </div>
                  <input
                    type="number"
                    min="0"
                    max="30"
                    value={
                      caSummary.hasAnyEntry
                        ? effectiveClassScore
                        : (score.class === undefined || score.class === null || score.class === 0 ? '' : score.class)
                    }
                    onChange={(e) => handleScoreChange(student.studentId, 'class', e.target.value)}
                    readOnly={caSummary.hasAnyEntry && viewMode === 'ca-matrix'}
                    placeholder="0 / 30"
                    className={cn(
                      "w-full h-10 text-center px-2.5 border rounded-xl outline-none font-mono tabular-nums font-bold text-xs sm:text-sm placeholder:text-slate-300",
                      caSummary.hasAnyEntry
                        ? "bg-emerald-50/80 border-emerald-300 text-emerald-900 font-extrabold"
                        : "bg-slate-50 border-slate-200 focus:ring-2 focus:ring-[#1c4a59] text-slate-800"
                    )}
                  />
                </div>

                <div className="space-y-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 truncate">
                      Exam (70%)
                    </label>
                    <span className="text-[9px] font-mono text-slate-400 font-bold shrink-0">
                      Max /70
                    </span>
                  </div>
                  <input
                    type="number"
                    min="0"
                    max="70"
                    value={(score.exam === undefined || score.exam === null || score.exam === 0) ? '' : score.exam}
                    onChange={(e) => handleScoreChange(student.studentId, 'exam', e.target.value)}
                    placeholder="0 / 70"
                    className="w-full h-10 text-center px-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#1c4a59] outline-none font-mono tabular-nums font-bold text-xs sm:text-sm text-slate-800 placeholder:text-slate-300"
                  />
                </div>
              </div>
            </div>
          );
        })}

        {!filteredStudents?.length && (
          <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-slate-400 text-xs sm:text-sm font-medium">
            No students found in {selectedClass}
          </div>
        )}
      </div>

      {/* Desktop Spreadsheet Entry Table (>= 768px) */}
      <div className="hidden md:block bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              {viewMode === 'ca-matrix' && (
                <tr className="bg-slate-100/80 border-b border-slate-200 text-[10px] font-extrabold uppercase tracking-wider">
                  <th className="px-6 py-2 text-slate-500 border-r border-slate-200">Student Registry</th>
                  <th
                    colSpan={assessmentColumns.length + 1}
                    className="px-4 py-2 text-center text-[#1c4a59] bg-teal-50/60 border-r border-slate-200"
                  >
                    Continuous Assessment Classwork & Exercises (Raw Max: {totalRawMax} pts)
                  </th>
                  <th
                    colSpan={4}
                    className="px-4 py-2 text-center text-indigo-950 bg-indigo-50/40"
                  >
                    Official Terminal Grading (30% Class + 70% Exam = 100%)
                  </th>
                </tr>
              )}
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-6 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider sticky left-0 bg-slate-50 z-10 border-r border-slate-100">
                  <div className="flex items-center gap-2.5">
                    <input
                      type="checkbox"
                      checked={
                        Boolean(filteredStudents?.length) &&
                        selectedStudentIds.length === (filteredStudents?.length || 0)
                      }
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedStudentIds((filteredStudents || []).map(s => s.studentId));
                        } else {
                          setSelectedStudentIds([]);
                        }
                      }}
                      className="w-4 h-4 rounded border-slate-300 text-[#1c4a59] focus:ring-[#1c4a59] cursor-pointer"
                      aria-label="Select all students"
                    />
                    <span>Student</span>
                  </div>
                </th>

                {viewMode === 'ca-matrix' &&
                  assessmentColumns.map((col) => (
                    <th
                      key={col.id}
                      className="px-3 py-3.5 text-center text-[11px] font-extrabold text-slate-600 uppercase tracking-wider bg-teal-50/20 border-r border-slate-100 min-w-[88px]"
                    >
                      <div className="leading-tight">{col.title}</div>
                      <div className="text-[9px] font-mono text-slate-400 font-bold mt-0.5">
                        {col.category} (/{col.maxScore})
                      </div>
                    </th>
                  ))}

                {viewMode === 'ca-matrix' && (
                  <th className="px-3 py-3.5 text-center text-[11px] font-extrabold text-teal-800 uppercase tracking-wider bg-teal-50/40 border-r border-slate-200 min-w-[92px]">
                    <div>Raw CA Sum</div>
                    <div className="text-[9px] font-mono text-teal-600 font-bold mt-0.5">
                      /{totalRawMax} pts
                    </div>
                  </th>
                )}

                <th className="px-4 py-3.5 text-xs font-bold text-slate-600 uppercase tracking-wider text-center min-w-[125px]">
                  <div>Class Score (30%)</div>
                  {viewMode === 'ca-matrix' && (
                    <div className="text-[9px] font-mono text-emerald-600 font-bold mt-0.5">
                      Auto-Scaled /30
                    </div>
                  )}
                </th>
                <th className="px-4 py-3.5 text-xs font-bold text-slate-600 uppercase tracking-wider text-center min-w-[115px]">
                  <div>Exam Score (70%)</div>
                  <div className="text-[9px] font-mono text-slate-400 font-bold mt-0.5">
                    Max /70
                  </div>
                </th>
                <th className="px-4 py-3.5 text-xs font-bold text-slate-600 uppercase tracking-wider text-center min-w-[90px]">
                  Total (100%)
                </th>
                <th className="px-4 py-3.5 text-xs font-bold text-slate-600 uppercase tracking-wider text-center min-w-[75px]">
                  Grade
                </th>
                <th className="px-4 py-3.5 text-xs font-bold text-slate-500 uppercase min-w-[120px]">
                  Remarks
                </th>
                <th className="px-5 py-3.5 text-xs font-bold text-slate-500 uppercase text-right">
                  Report
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredStudents?.map((student) => {
                const stuExMap = exerciseScores[student.studentId] || {};
                const caSummary = computeStudentCaSummary(stuExMap, assessmentColumns);
                const score = scores[student.studentId] || { class: 0, exam: 0 };
                const effectiveClassScore = caSummary.hasAnyEntry ? caSummary.scaledClassScore : (score.class || 0);
                const effectiveExamScore = score.exam || 0;
                const total = effectiveClassScore + effectiveExamScore;
                const { grade, remarks } = calculateGrade(total);

                return (
                  <tr key={student.id || student.studentId} className={cn("hover:bg-slate-50/80 transition-colors group", selectedStudentIds.includes(student.studentId) && "bg-teal-50/30")}>
                    <td className="px-6 py-3.5 sticky left-0 bg-white group-hover:bg-slate-50/90 z-10 border-r border-slate-100">
                      <div className="flex items-center gap-2.5">
                        <input
                          type="checkbox"
                          checked={selectedStudentIds.includes(student.studentId)}
                          onChange={() => toggleSelectStudent(student.studentId)}
                          className="w-4 h-4 rounded border-slate-300 text-[#1c4a59] focus:ring-[#1c4a59] shrink-0 cursor-pointer"
                          aria-label={`Select ${student.firstName} ${student.lastName}`}
                        />
                        <div>
                          <div className="font-semibold text-slate-900 text-sm">{student.firstName} {student.lastName}</div>
                          <div className="text-xs text-slate-400 font-mono">{student.studentId}</div>
                        </div>
                      </div>
                    </td>

                    {viewMode === 'ca-matrix' &&
                      assessmentColumns.map((col) => {
                        const cellVal = stuExMap[col.id];
                        return (
                          <td key={col.id} className="px-2.5 py-3.5 text-center border-r border-slate-100 bg-teal-50/10">
                            <input
                              type="number"
                              min="0"
                              max={col.maxScore}
                              value={cellVal === undefined || cellVal === null ? '' : cellVal}
                              onChange={(e) => handleExerciseScoreChange(student.studentId, col, e.target.value)}
                              placeholder={`/${col.maxScore}`}
                              className="w-16 text-center px-2 py-1.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#1c4a59] outline-none font-mono tabular-nums font-bold text-xs text-slate-800 placeholder:text-slate-300"
                            />
                          </td>
                        );
                      })}

                    {viewMode === 'ca-matrix' && (
                      <td className="px-3 py-3.5 text-center font-mono tabular-nums border-r border-slate-200 bg-teal-50/30">
                        {caSummary.hasAnyEntry ? (
                          <span className="inline-flex items-center px-2 py-1 rounded-lg bg-white border border-teal-200 text-xs font-extrabold text-teal-900">
                            {caSummary.rawObtained}
                            <span className="text-slate-400 font-normal ml-0.5">/{caSummary.rawMax}</span>
                          </span>
                        ) : (
                          <span className="text-xs text-slate-300 font-bold">0/{totalRawMax}</span>
                        )}
                      </td>
                    )}

                    <td className="px-4 py-3.5 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <input
                          type="number"
                          min="0"
                          max="30"
                          value={
                            caSummary.hasAnyEntry
                              ? effectiveClassScore
                              : (score.class === undefined || score.class === null || score.class === 0 ? '' : score.class)
                          }
                          onChange={(e) => handleScoreChange(student.studentId, 'class', e.target.value)}
                          readOnly={caSummary.hasAnyEntry && viewMode === 'ca-matrix'}
                          placeholder="0"
                          title={
                            caSummary.hasAnyEntry
                              ? `Auto-scaled from Class Exercises: (${caSummary.rawObtained} / ${caSummary.rawMax}) × 30 = ${effectiveClassScore}`
                              : 'Direct Class Score (max 30)'
                          }
                          className={cn(
                            "w-20 text-center px-2 py-1.5 border rounded-lg outline-none font-mono tabular-nums font-bold text-sm placeholder:text-slate-200",
                            caSummary.hasAnyEntry
                              ? "bg-emerald-50/80 border-emerald-300 text-emerald-900 font-extrabold"
                              : "bg-slate-50 border-slate-200 focus:ring-2 focus:ring-indigo-500 text-slate-800"
                          )}
                        />
                        {caSummary.hasAnyEntry && (
                          <span className="text-[10px] font-mono font-bold text-emerald-700">
                            {caSummary.rawObtained}/{caSummary.rawMax} → {effectiveClassScore}/30
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="px-4 py-3.5 text-center">
                      <input
                        type="number"
                        min="0"
                        max="70"
                        value={(score.exam === undefined || score.exam === null || score.exam === 0) ? '' : score.exam}
                        onChange={(e) => handleScoreChange(student.studentId, 'exam', e.target.value)}
                        placeholder="0"
                        className="w-20 text-center px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none font-mono tabular-nums font-bold text-sm placeholder:text-slate-200"
                      />
                    </td>

                    <td className="px-4 py-3.5 text-center font-mono tabular-nums font-extrabold text-slate-800 text-sm">
                      {total}
                    </td>

                    <td className="px-4 py-3.5 text-center">
                      <span className={`px-2.5 py-1 rounded-lg text-xs font-bold font-mono ${
                        total >= 50 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'
                      }`}>
                        {grade}
                      </span>
                    </td>

                    <td className="px-4 py-3.5 italic text-xs text-slate-500 font-medium">
                      {remarks}
                    </td>

                    <td className="px-5 py-3.5 text-right">
                      <button
                        type="button"
                        onClick={() => openReport(student)}
                        className="p-2 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-white transition-all border border-transparent hover:border-slate-200 cursor-pointer"
                        title="Preview Terminal Report Card"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!filteredStudents?.length && (
            <div className="p-12 text-center text-slate-400 font-medium">
              No students found in {selectedClass}
            </div>
          )}
        </div>
      </div>

      {/* Report Card Modal */}
      <AnimatePresence>
        {isReportModalOpen && selectedStudentForReport && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] overflow-hidden flex flex-col"
            >
              <div className="p-3 sm:p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 print:hidden">
                <div className="min-w-0">
                  <h3 className="font-bold text-slate-800 text-sm sm:text-base truncate">Terminal Report Preview</h3>
                  <p className="text-[11px] sm:text-xs text-slate-500 truncate">
                    Summed & scaled Class Score (30%) + Exam Score (70%) reflected on official transcript
                  </p>
                </div>
                <div className="flex items-center justify-end gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={triggerPrint}
                    className="flex items-center gap-1.5 bg-white border border-slate-200 text-slate-700 px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg font-bold hover:bg-slate-50 transition-all h-9 sm:h-10 text-xs sm:text-sm shadow-sm cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-indigo-600 shrink-0" />
                    <span>Print</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleExportPDF}
                    disabled={isExportingPDF}
                    className="flex items-center gap-1.5 bg-slate-800 text-white px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg font-bold hover:bg-slate-900 transition-all disabled:opacity-50 h-9 sm:h-10 text-xs sm:text-sm cursor-pointer"
                  >
                    <FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                    <span>{isExportingPDF ? '...' : 'PDF'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsReportModalOpen(false)}
                    className="p-1.5 sm:p-2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <X className="w-5 h-5 sm:w-6 sm:h-6" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-3 sm:p-8 bg-slate-100 flex items-start sm:items-center justify-start sm:justify-center overflow-x-auto">
                {/* Print area */}
                <div id={`report-${selectedStudentForReport.studentId}`} className="shadow-2xl">
                  <ReportCard
                    student={selectedStudentForReport}
                    results={studentResults}
                    term={selectedTerm}
                    academicYear={academicConfig.academicYear}
                    schoolProfile={schoolProfile}
                    academicConfig={academicConfig}
                    termReport={{
                      studentId: selectedStudentForReport.studentId,
                      term: selectedTerm,
                      academicYear: academicConfig.academicYear,
                      attendancePresent: 68,
                      attendanceTotal: 70,
                      teacherRemark: 'Student has shown good progress this term. Keep working hard.',
                      headmasterRemark: 'A satisfactory result. Promoted.'
                    }}
                  />
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
