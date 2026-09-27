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
      <div className="space-y-6">
        {/* Parent Welcome & Ward Selector */}
        <div className="bg-[#1c4a59] p-6 sm:p-8 rounded-2xl border border-slate-800 text-white shadow-xl relative overflow-hidden">
          <div className="relative z-10 space-y-4 max-w-xl">
            <span className="px-3 py-1 bg-white/10 border border-white/20 rounded-lg text-[10px] font-black uppercase tracking-wider text-[#e1c594] inline-flex items-center gap-1.5">
              <Lock className="w-3 h-3" /> PARENT PORTAL
            </span>
            <div className="space-y-1">
              <h2 className="text-xl sm:text-2xl font-black tracking-tight">
                Academic Results Terminal
              </h2>
              <p className="text-slate-200 text-sm font-medium">
                Welcome back! View subject grades, class exercises, and generate official terminal report cards for your wards.
              </p>
            </div>

            {/* Ward selector chips */}
            {parentWards.length > 1 ? (
              <div className="space-y-2">
                <label className="text-[10px] font-black text-[#e1c594] uppercase tracking-wider block">Select Ward to View</label>
                <div className="flex flex-wrap gap-2">
                  {parentWards.map(ward => (
                    <button
                      key={ward.id || ward.studentId}
                      onClick={() => setSelectedWardId(ward.studentId)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border flex items-center gap-1.5 ${
                        selectedWardId === ward.studentId
                          ? 'bg-[#faae57] border-[#faae57] text-[#1f2a2e] shadow-sm font-black'
                          : 'bg-white/10 hover:bg-white/15 border-white/10 text-white'
                      }`}
                    >
                      <User className="w-3.5 h-3.5" /> {ward.firstName} {ward.lastName} ({ward.class})
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              selectedWard && (
                <div className="flex flex-wrap gap-4 pt-2 text-xs font-mono text-indigo-200">
                  <div className="bg-black/20 px-3 py-1.5 rounded-lg border border-white/5">
                    Viewing Ward: <span className="text-white font-extrabold">{selectedWard.firstName} {selectedWard.lastName}</span>
                  </div>
                  <div className="bg-black/20 px-3 py-1.5 rounded-lg border border-white/5">
                    Class: <span className="text-white font-extrabold">{selectedWard.class}</span>
                  </div>
                </div>
              )
            )}
          </div>

          <div className="absolute right-0 bottom-0 top-0 w-1/3 bg-radial from-indigo-500/10 to-transparent pointer-events-none hidden md:block" />
        </div>

        {/* Filters and Term Selection Row */}
        <div className="bg-white p-4 sm:p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-1.5">Academic Term</label>
            <div className="flex gap-1.5">
              {['Term 1', 'Term 2', 'Term 3'].map(t => (
                <button
                  key={t}
                  onClick={() => setSelectedTerm(t)}
                  className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all border ${
                    selectedTerm === t
                      ? 'bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-600/10'
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
              onClick={() => openReport(selectedWard)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl font-extrabold flex items-center justify-center gap-2.5 transition-all shadow-lg shadow-indigo-100 text-xs uppercase tracking-wider"
            >
              <FileText className="w-4 h-4" />
              <span>Generate Official Report Card ({selectedWard.firstName})</span>
            </button>
          )}
        </div>

        {/* Results List for selected term */}
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
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
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col"
              >
                <div className="p-4 border-b border-slate-100 flex items-center justify-between print:hidden">
                  <h3 className="font-bold text-slate-800">Terminal Report Preview</h3>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={triggerPrint}
                      className="flex items-center gap-2 bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-lg font-bold hover:bg-slate-50 transition-all h-10 shadow-sm"
                    >
                      <Printer className="w-4 h-4 text-indigo-600" />
                      <span>Print</span>
                    </button>
                    <button
                      onClick={handleExportPDF}
                      disabled={isExportingPDF}
                      className="flex items-center gap-2 bg-slate-800 text-white px-4 py-2 rounded-lg font-bold hover:bg-slate-900 transition-all disabled:opacity-50 h-10"
                    >
                      <FileText className="w-4 h-4" />
                      <span>{isExportingPDF ? '...' : 'PDF'}</span>
                    </button>
                    <button
                      onClick={() => setIsReportModalOpen(false)}
                      className="p-2 text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-6 h-6" />
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-8 bg-slate-100 flex items-center justify-center">
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
        <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center max-w-2xl mx-auto space-y-4">
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
      <div className="space-y-6">
        {/* Student Welcome & Quick Actions Card */}
        <div className="bg-[#1c4a59] p-6 sm:p-8 rounded-2xl border border-slate-800 text-white shadow-xl relative overflow-hidden">
          <div className="relative z-10 space-y-4 max-w-xl">
            <span className="px-3 py-1 bg-white/10 border border-white/20 rounded-lg text-[10px] font-black uppercase tracking-wider text-[#e1c594] inline-flex items-center gap-1.5">
              <Lock className="w-3 h-3" /> STUDENT PORTAL
            </span>
            <div className="space-y-1">
              <h2 className="text-xl sm:text-2xl font-black tracking-tight">
                Academic Results Terminal
              </h2>
              <p className="text-slate-200 text-sm font-medium">
                Welcome back, <b>{studentRecord.firstName} {studentRecord.lastName}</b>! View your subject grades, class assessments, and generate your official terminal report card.
              </p>
            </div>

            <div className="flex flex-wrap gap-4 pt-2 text-xs font-mono text-indigo-200">
              <div className="bg-black/20 px-3 py-1.5 rounded-lg border border-white/5">
                Class: <span className="text-white font-extrabold">{studentRecord.class}</span>
              </div>
              <div className="bg-black/20 px-3 py-1.5 rounded-lg border border-white/5">
                Student ID: <span className="text-white font-extrabold">{studentRecord.studentId}</span>
              </div>
            </div>
          </div>

          <div className="absolute right-0 bottom-0 top-0 w-1/3 bg-radial from-indigo-500/10 to-transparent pointer-events-none hidden md:block" />
        </div>

        {/* Filters and Term Selection Row */}
        <div className="bg-white p-4 sm:p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-1.5">Academic Term</label>
            <div className="flex gap-1.5">
              {['Term 1', 'Term 2', 'Term 3'].map(t => (
                <button
                  key={t}
                  onClick={() => setSelectedTerm(t)}
                  className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all border ${
                    selectedTerm === t
                      ? 'bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-600/10'
                      : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-600'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={() => openReport(studentRecord)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl font-extrabold flex items-center justify-center gap-2.5 transition-all shadow-lg shadow-indigo-100 text-xs uppercase tracking-wider"
          >
            <FileText className="w-4 h-4" />
            <span>Generate Official Report Card</span>
          </button>
        </div>

        {/* Results List for selected term */}
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
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
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col"
              >
                <div className="p-4 border-b border-slate-100 flex items-center justify-between print:hidden">
                  <h3 className="font-bold text-slate-800">Terminal Report Preview</h3>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={triggerPrint}
                      className="flex items-center gap-2 bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-lg font-bold hover:bg-slate-50 transition-all h-10 shadow-sm"
                    >
                      <Printer className="w-4 h-4 text-indigo-600" />
                      <span>Print</span>
                    </button>
                    <button
                      onClick={handleExportPDF}
                      disabled={isExportingPDF}
                      className="flex items-center gap-2 bg-slate-800 text-white px-4 py-2 rounded-lg font-bold hover:bg-slate-900 transition-all disabled:opacity-50 h-10"
                    >
                      <FileText className="w-4 h-4" />
                      <span>{isExportingPDF ? '...' : 'PDF'}</span>
                    </button>
                    <button
                      onClick={() => setIsReportModalOpen(false)}
                      className="p-2 text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-6 h-6" />
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-8 bg-slate-100 flex items-center justify-center">
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
    <div className="space-y-6">
      {/* Deep Teal Hero Header Card */}
      <div className="bg-[#1c4a59] rounded-3xl p-6 sm:p-7 text-white shadow-[0_8px_28px_rgba(28,74,89,0.16)] flex flex-col gap-5 print:hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/15">
              <FileSpreadsheet className="w-3.5 h-3.5 text-[#faae57]" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#e1c594]">
                Continuous Assessment & Exam Matrix
              </span>
            </div>
            <h2 className="text-2xl sm:text-[28px] font-extrabold tracking-tight text-white leading-tight">
              Academic Results Terminal • {selectedClass}
            </h2>
            <p className="text-sm text-[#e1c594]/90 font-medium">
              {selectedSubject || 'All Subjects'} • {selectedTerm} • Class Exercises Auto-Scale to 30% Class Score + 70% Exam
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <input
              type="file"
              id="import-results-csv"
              className="hidden"
              accept=".csv, text/csv"
              onChange={importFromCsv}
            />
            <button
              onClick={() => setIsAddExerciseOpen(prev => !prev)}
              className="bg-white/10 hover:bg-white/20 text-white border border-white/15 px-4 py-2.5 rounded-full font-bold flex items-center justify-center gap-2 transition-all min-h-[44px] text-xs cursor-pointer"
              title="Add Class Exercise, Homework, or Class Test Column"
            >
              <Plus className="w-4 h-4 text-[#faae57]" />
              <span>+ Add Classwork / Exercise</span>
            </button>
            <button
              onClick={downloadTemplate}
              className="bg-white/10 hover:bg-white/20 text-white border border-white/15 px-4 py-2.5 rounded-full font-bold flex items-center justify-center gap-2 transition-all min-h-[44px] text-xs cursor-pointer"
              title="Download CSV Results Template (includes active Exercise columns)"
            >
              <FileSpreadsheet className="w-4 h-4 text-[#06d6a0]" />
              <span>CSV Template</span>
            </button>
            <button
              onClick={() => document.getElementById('import-results-csv')?.click()}
              className="bg-white/10 hover:bg-white/20 text-white border border-white/15 px-4 py-2.5 rounded-full font-bold flex items-center justify-center gap-2 transition-all min-h-[44px] text-xs cursor-pointer"
              title="Import CSV Results File"
            >
              <Download className="w-4 h-4 text-[#faae57]" />
              <span>Import CSV</span>
            </button>
            <button
              onClick={handleBulkSave}
              disabled={isSaving}
              className="bg-[#faae57] hover:bg-[#e4ae67] text-[#1f2a2e] px-6 py-2.5 rounded-full font-bold flex items-center justify-center gap-2 active:scale-[0.97] transition-all disabled:opacity-50 shadow-sm min-h-[44px] text-sm cursor-pointer"
            >
              {isSaving ? <RefreshCcw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4 stroke-[2.5]" />}
              <span>{isSaving ? 'Saving...' : 'Save All Marks'}</span>
            </button>
          </div>
        </div>

        <div className="pt-4 border-t border-white/10 grid grid-cols-2 md:grid-cols-4 lg:flex lg:flex-wrap items-end gap-4">
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-[#e1c594] uppercase tracking-wider">Class</label>
            <select
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value)}
              className="block w-full lg:w-36 bg-white border border-[#bac4c6] rounded-full px-4 py-2 text-sm font-bold text-[#1f2a2e] focus:ring-2 focus:ring-[#faae57] outline-none min-h-[44px] cursor-pointer"
            >
              {classes?.length ? classes.map(c => <option key={c.id} value={c.name}>{c.name}</option>) : <option>P1</option>}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-[#e1c594] uppercase tracking-wider">Subject</label>
            <select
              value={selectedSubject}
              onChange={(e) => setSelectedSubject(e.target.value)}
              className="block w-full lg:w-52 bg-white border border-[#bac4c6] rounded-full px-4 py-2 text-sm font-bold text-[#1f2a2e] focus:ring-2 focus:ring-[#faae57] outline-none min-h-[44px] cursor-pointer"
            >
              {filteredSubjectsOptions?.length ? filteredSubjectsOptions.map(s => <option key={s.id} value={s.name}>{s.name}</option>) : <option>Mathematics</option>}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-[#e1c594] uppercase tracking-wider">Term</label>
            <select
              value={selectedTerm}
              onChange={(e) => setSelectedTerm(e.target.value)}
              className="block w-full lg:w-36 bg-white border border-[#bac4c6] rounded-full px-4 py-2 text-sm font-bold text-[#1f2a2e] focus:ring-2 focus:ring-[#faae57] outline-none min-h-[44px] cursor-pointer"
            >
              {['Term 1', 'Term 2', 'Term 3'].map(t => <option key={t}>{t}</option>)}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold text-[#e1c594] uppercase tracking-wider">Entry Mode</label>
            <div className="inline-flex bg-black/25 p-1 rounded-full border border-white/10 min-h-[44px] items-center">
              <button
                type="button"
                onClick={() => setViewMode('ca-matrix')}
                className={cn(
                  "px-3.5 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer",
                  viewMode === 'ca-matrix'
                    ? "bg-[#faae57] text-[#1f2a2e] shadow-sm"
                    : "text-white/80 hover:text-white"
                )}
              >
                CA Exercises + Exam
              </button>
              <button
                type="button"
                onClick={() => setViewMode('summary-only')}
                className={cn(
                  "px-3.5 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer",
                  viewMode === 'summary-only'
                    ? "bg-[#faae57] text-[#1f2a2e] shadow-sm"
                    : "text-white/80 hover:text-white"
                )}
              >
                Direct Summary
              </button>
            </div>
          </div>

          <div className="col-span-2 md:col-span-4 lg:flex-1">
            <label className="text-[10px] font-bold text-[#e1c594] uppercase tracking-wider mb-1 block">Quick Student Search</label>
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6a7f84]" />
              <input
                type="text"
                placeholder="Filter by student name or ID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-white border border-[#bac4c6] rounded-full text-sm font-medium text-[#1f2a2e] outline-none focus:ring-2 focus:ring-[#faae57] min-h-[44px]"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Continuous Assessment (CA) Column Manager & Formula Bar */}
      {viewMode === 'ca-matrix' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-sm space-y-4 print:hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-teal-50 border border-teal-100 flex items-center justify-center text-[#1c4a59]">
                <Calculator className="w-4 h-4" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-800">
                    Classwork, Homework & Class Tests ({selectedSubject})
                  </h3>
                  <span className="px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-[10px] font-mono font-bold text-emerald-700">
                    Raw Max: {totalRawMax} pts → Auto-Scaled to 30%
                  </span>
                  {supabaseSyncStatus === 'syncing' && (
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-sky-50 border border-sky-200 text-[10px] font-mono font-bold text-sky-700">
                      <RefreshCcw className="w-3 h-3 animate-spin" />
                      Syncing to Supabase...
                    </span>
                  )}
                  {supabaseSyncStatus === 'synced' && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-[10px] font-mono font-bold text-emerald-700">
                      <CheckCircle2 className="w-3 h-3" />
                      Synced to Supabase
                      {lastSupabaseSyncAt ? ` · ${new Date(lastSupabaseSyncAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500">
                  Enter marks for each exercise, homework, or test below. Changes auto-save to Supabase and scale to the <b className="text-slate-700">30% Class Score</b> on the Terminal Report Card.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleResetDefaultColumns}
                className="px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                title="Reset to Ex 1 (/10), Ex 2 (/10), HW 1 (/10), Test 1 (/20)"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset Standard CA</span>
              </button>
              <button
                type="button"
                onClick={() => setIsAddExerciseOpen(prev => !prev)}
                className="px-3.5 py-1.5 rounded-xl bg-[#1c4a59] hover:bg-[#163b47] text-white text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 text-[#faae57]" />
                <span>Add Exercise / Test</span>
              </button>
            </div>
          </div>

          {/* Active Assessment Column Chips */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
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
                    "inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all",
                    badgeStyle
                  )}
                >
                  <span className="text-[10px] uppercase tracking-wider opacity-70 font-extrabold">
                    {col.category}:
                  </span>
                  <span className="font-extrabold">{col.title}</span>
                  <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-white/80 border border-black/5 font-black">
                    /{col.maxScore}
                  </span>
                  {assessmentColumns.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveAssessmentColumn(col.id)}
                      className="text-slate-400 hover:text-rose-600 transition-colors ml-0.5 cursor-pointer"
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
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row items-stretch sm:items-end gap-3 mt-2">
                  <div className="flex-1 space-y-1">
                    <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                      Assessment Title
                    </label>
                    <input
                      type="text"
                      value={newExTitle}
                      onChange={(e) => setNewExTitle(e.target.value)}
                      placeholder="e.g. Ex 3, Homework 2, Mid-Term Test..."
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-[#1c4a59]"
                    />
                  </div>
                  <div className="w-full sm:w-44 space-y-1">
                    <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                      Category
                    </label>
                    <select
                      value={newExCategory}
                      onChange={(e) => setNewExCategory(e.target.value as 'Exercise' | 'Homework' | 'Test')}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-[#1c4a59]"
                    >
                      <option value="Exercise">Class Exercise</option>
                      <option value="Homework">Homework / Assignment</option>
                      <option value="Test">Class Test / Quiz</option>
                    </select>
                  </div>
                  <div className="w-full sm:w-32 space-y-1">
                    <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                      Max Marks
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={newExMaxScore}
                      onChange={(e) => setNewExMaxScore(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-800 outline-none focus:ring-2 focus:ring-[#1c4a59]"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleAddAssessmentColumn}
                      className="px-4 py-2 rounded-lg bg-[#faae57] hover:bg-[#e4ae67] text-[#1f2a2e] text-xs font-extrabold transition-all cursor-pointer"
                    >
                      Add Column
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsAddExerciseOpen(false)}
                      className="px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-600 text-xs font-bold transition-all cursor-pointer"
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
          className="bg-emerald-50 border border-emerald-100 text-emerald-700 px-4 py-3 rounded-xl flex items-center gap-2 font-medium"
        >
          <CheckCircle2 className="w-5 h-5" />
          Class exercises, auto-scaled 30% Class Scores, and Exam scores saved to the terminal and synced to Report Cards!
        </motion.div>
      )}

      {/* Entry Table */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
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
                  Student
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
                  <tr key={student.id || student.studentId} className="hover:bg-slate-50/80 transition-colors group">
                    <td className="px-6 py-3.5 sticky left-0 bg-white group-hover:bg-slate-50/90 z-10 border-r border-slate-100">
                      <div className="font-semibold text-slate-900 text-sm">{student.firstName} {student.lastName}</div>
                      <div className="text-xs text-slate-400 font-mono">{student.studentId}</div>
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
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col"
            >
              <div className="p-4 border-b border-slate-100 flex items-center justify-between print:hidden">
                <div>
                  <h3 className="font-bold text-slate-800">Terminal Report Preview</h3>
                  <p className="text-xs text-slate-500">
                    Summed & scaled Class Score (30%) + Exam Score (70%) reflected on official transcript
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={triggerPrint}
                    className="flex items-center gap-2 bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-lg font-bold hover:bg-slate-50 transition-all h-10 shadow-sm cursor-pointer"
                  >
                    <Printer className="w-4 h-4 text-indigo-600" />
                    <span>Print</span>
                  </button>
                  <button
                    onClick={handleExportPDF}
                    disabled={isExportingPDF}
                    className="flex items-center gap-2 bg-slate-800 text-white px-4 py-2 rounded-lg font-bold hover:bg-slate-900 transition-all disabled:opacity-50 h-10 cursor-pointer"
                  >
                    <FileText className="w-4 h-4" />
                    <span>{isExportingPDF ? '...' : 'PDF'}</span>
                  </button>
                  <button
                    onClick={() => setIsReportModalOpen(false)}
                    className="p-2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-8 bg-slate-100 flex items-center justify-center">
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
