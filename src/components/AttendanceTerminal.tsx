import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/schema';
import { format } from 'date-fns';
import {
  Check,
  X,
  Clock,
  CalendarDays,
  Users,
  Download,
  FileText,
  Printer,
  RefreshCw,
  ShieldCheck,
  MessageSquare,
  ChevronDown
} from 'lucide-react';
import { motion } from 'motion/react';
import { useNotifications } from '../contexts/NotificationContext';
import { useAuth } from '../contexts/AuthContext';
import { getApiHeaders } from '../lib/api';
import { supabase } from '../lib/supabase/client';
import * as XLSX from 'xlsx';
import { exportToPDF, triggerPrint } from '../lib/utils';

type AttendanceStatus = 'Present' | 'Absent' | 'Late' | 'Excused';

interface AttendanceRecordItem {
  id?: number | string;
  schoolId?: string;
  studentId: string;
  class?: string | null;
  date: string;
  status: AttendanceStatus;
  reason?: string | null;
  recordedBy?: string | null;
  createdAt?: number;
}

interface AttendanceStudentItem {
  id?: number | string;
  studentId: string;
  firstName: string;
  lastName: string;
  class: string;
  gender?: 'Male' | 'Female' | 'Other';
  dateOfBirth?: string;
  guardianName?: string;
  guardianPhone?: string;
  feesPaid?: number;
  totalFees?: number;
}

export default function AttendanceTerminal() {
  const { showToast } = useNotifications();
  const { user, school } = useAuth();
  const settings = useLiveQuery(() => db.settings.toArray()) || [];
  const schoolName = settings.find(s => s.key === 'schoolProfile')?.value?.schoolName || 'ESEPA INTERNATIONAL SCHOOL';

  const classesFromDB = useLiveQuery(() => db.classes.toArray()) || [];
  const studentsInSystem = useLiveQuery(() => db.students.toArray()) || [];
  const localAttendanceAll = useLiveQuery(() => db.attendance.toArray()) || [];

  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [selectedClass, setSelectedClass] = useState('P1');

  // Supabase remote state & sync status
  const [remoteAttendance, setRemoteAttendance] = useState<AttendanceRecordItem[] | null>(null);
  const [remoteClasses, setRemoteClasses] = useState<Array<{ name: string; level?: string }>>([]);
  const [remoteStudents, setRemoteStudents] = useState<AttendanceStudentItem[]>([]);
  const [syncState, setSyncState] = useState<'loading' | 'saving' | 'synced' | 'error'>('loading');
  const [savingStudentIds, setSavingStudentIds] = useState<Set<string>>(new Set());
  const [isBulkSaving, setIsBulkSaving] = useState(false);

  // Optional note/reason state per student
  const [openNoteStudentIds, setOpenNoteStudentIds] = useState<Set<string>>(new Set());
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const [isBulkMenuOpen, setIsBulkMenuOpen] = useState(false);
  const bulkMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setIsExportMenuOpen(false);
      }
      if (bulkMenuRef.current && !bulkMenuRef.current.contains(e.target as Node)) {
        setIsBulkMenuOpen(false);
      }
    };
    if (isExportMenuOpen || isBulkMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isExportMenuOpen, isBulkMenuOpen]);

  const migratedKeysRef = useRef<Set<string>>(new Set());

  const isParent = user?.role === 'parent';
  const isStudent = user?.role === 'student';
  const isReadOnlyRole = isParent || isStudent;

  // Resolve active school_id UUID for Supabase calls
  const activeSchoolId = useMemo(() => {
    const candidates = [
      school?.id,
      (user as any)?.school_id,
      (user as any)?.schoolId,
      typeof localStorage !== 'undefined' ? localStorage.getItem('esepa_active_school_id') : null,
      (classesFromDB[0] as any)?.school_id,
      (classesFromDB[0] as any)?.schoolId,
      (studentsInSystem[0] as any)?.school_id,
      (studentsInSystem[0] as any)?.schoolId
    ];
    for (const c of candidates) {
      const str = String(c || '').trim();
      if (str && str !== '00000000-0000-0000-0000-000000000001' && /^[0-9a-f-]{36}$/i.test(str)) {
        return str;
      }
    }
    return '';
  }, [school?.id, user, classesFromDB, studentsInSystem]);

  const normalizeStatus = useCallback((raw: any): AttendanceStatus => {
    const s = String(raw || 'Present').trim().toLowerCase();
    if (s === 'absent') return 'Absent';
    if (s === 'late') return 'Late';
    if (s === 'excused') return 'Excused';
    return 'Present';
  }, []);

  const normalizeAttendanceRow = useCallback((raw: any): AttendanceRecordItem | null => {
    if (!raw || typeof raw !== 'object') return null;
    const studentId = String(raw.studentId ?? raw.student_id ?? '').trim();
    const rawDate = String(raw.date || '').trim().slice(0, 10);
    if (!studentId || !rawDate) return null;
    const reason = raw.reason !== undefined && raw.reason !== null
      ? String(raw.reason).trim()
      : (raw.note !== undefined && raw.note !== null ? String(raw.note).trim() : '');
    return {
      id: raw.id,
      schoolId: String(raw.schoolId || raw.school_id || activeSchoolId || '').trim(),
      studentId,
      class: raw.class ? String(raw.class).trim() : null,
      date: rawDate,
      status: normalizeStatus(raw.status),
      reason: reason || null,
      recordedBy: raw.recordedBy || raw.recorded_by || null,
      createdAt: Number(raw.createdAt ?? raw.created_at ?? Date.now()) || Date.now()
    };
  }, [activeSchoolId, normalizeStatus]);

  const normalizeStudentRow = useCallback((raw: any): AttendanceStudentItem | null => {
    if (!raw || typeof raw !== 'object') return null;
    const studentId = String(raw.studentId ?? raw.student_id ?? '').trim();
    if (!studentId) return null;
    return {
      id: raw.id ?? studentId,
      studentId,
      firstName: String(raw.firstName ?? raw.first_name ?? '').trim() || 'Student',
      lastName: String(raw.lastName ?? raw.last_name ?? '').trim() || studentId,
      class: String(raw.class ?? raw.className ?? 'P1').trim() || 'P1',
      gender: raw.gender === 'Female' || raw.gender === 'Other' ? raw.gender : 'Male',
      dateOfBirth: String(raw.dateOfBirth ?? raw.date_of_birth ?? '').trim(),
      guardianName: String(raw.guardianName ?? raw.guardian_name ?? '').trim(),
      guardianPhone: String(raw.guardianPhone ?? raw.guardian_phone ?? '').trim(),
      feesPaid: Number(raw.feesPaid ?? raw.fees_paid ?? 0) || 0,
      totalFees: Number(raw.totalFees ?? raw.total_fees ?? 0) || 0
    };
  }, []);

  // Update local Dexie read-through cache after Supabase confirms records
  const persistLocalAttendanceCache = useCallback(async (records: AttendanceRecordItem[]) => {
    try {
      for (const rec of records) {
        if (!rec.studentId || !rec.date) continue;
        const existing = await db.attendance
          .where({ studentId: rec.studentId, date: rec.date })
          .first();
        const localStatus = (rec.status === 'Excused' ? 'Excused' : rec.status) as any;
        if (existing && existing.id !== undefined) {
          await db.attendance.update(existing.id, {
            status: localStatus,
            ...(rec.reason !== undefined ? { reason: rec.reason } : {})
          } as any);
        } else {
          await db.attendance.add({
            studentId: rec.studentId,
            date: rec.date,
            status: localStatus,
            ...(rec.reason ? { reason: rec.reason } : {})
          } as any);
        }
      }
    } catch (err) {
      console.warn('Notice updating local attendance read-through cache:', err);
    }
  }, []);

  const applyRemoteReferencePayload = useCallback((payload: any) => {
    if (!payload) return;
    if (Array.isArray(payload.classes)) {
      setRemoteClasses(
        payload.classes
          .map((c: any) => ({
            name: String(c?.name || '').trim(),
            level: String(c?.level || '').trim()
          }))
          .filter((c: any) => Boolean(c.name))
      );
    }
    if (Array.isArray(payload.students)) {
      setRemoteStudents(
        payload.students
          .map(normalizeStudentRow)
          .filter(Boolean) as AttendanceStudentItem[]
      );
    }
  }, [normalizeStudentRow]);

  // Fetch attendance, classes, and students from Supabase + auto-migrate any unsynced local records
  const fetchAttendanceFromSupabase = useCallback(async (manualRefresh = false) => {
    setSyncState('loading');
    try {
      const [localAttRaw, localStuRaw, localClsRaw] = await Promise.all([
        db.attendance.toArray(),
        db.students.toArray(),
        db.classes.toArray()
      ]);

      const localAttNormalized = localAttRaw
        .map(normalizeAttendanceRow)
        .filter(Boolean) as AttendanceRecordItem[];
      const localStuNormalized = localStuRaw
        .map(normalizeStudentRow)
        .filter(Boolean) as AttendanceStudentItem[];

      let fetchedAttendance: AttendanceRecordItem[] = [];
      let fetchedStudents: AttendanceStudentItem[] = [];
      let fetchedClasses: Array<{ name: string; level?: string }> = [];
      let fetchedOk = false;

      // 1. Primary fetch via Backend Supabase endpoint (/api/attendance)
      try {
        const res = await fetch(
          `/api/attendance?school_id=${encodeURIComponent(activeSchoolId)}&date=${encodeURIComponent(selectedDate)}`,
          { headers: getApiHeaders(activeSchoolId) }
        );
        if (res.ok) {
          const json = await res.json();
          if (json && json.success) {
            fetchedAttendance = Array.isArray(json.attendance)
              ? (json.attendance.map(normalizeAttendanceRow).filter(Boolean) as AttendanceRecordItem[])
              : [];
            fetchedStudents = Array.isArray(json.students)
              ? (json.students.map(normalizeStudentRow).filter(Boolean) as AttendanceStudentItem[])
              : [];
            fetchedClasses = Array.isArray(json.classes)
              ? json.classes
                  .map((c: any) => ({ name: String(c?.name || '').trim(), level: String(c?.level || '').trim() }))
                  .filter((c: any) => Boolean(c.name))
              : [];
            applyRemoteReferencePayload(json);
            fetchedOk = true;
          }
        }
      } catch (apiErr) {
        console.warn('Notice fetching /api/attendance, trying direct Supabase client:', apiErr);
      }

      // 2. Direct Supabase client fallback if Express route is unreachable
      if (!fetchedOk && activeSchoolId) {
        const [attRes, stuRes, clsRes] = await Promise.all([
          supabase.from('attendance').select('*').eq('school_id', activeSchoolId),
          supabase.from('students').select('*').eq('school_id', activeSchoolId),
          supabase.from('classes').select('*').eq('school_id', activeSchoolId)
        ]);
        if (!attRes.error && Array.isArray(attRes.data)) {
          fetchedAttendance = attRes.data
            .map(normalizeAttendanceRow)
            .filter(Boolean) as AttendanceRecordItem[];
          fetchedStudents = (stuRes.data || [])
            .map(normalizeStudentRow)
            .filter(Boolean) as AttendanceStudentItem[];
          fetchedClasses = (clsRes.data || [])
            .map((c: any) => ({ name: String(c?.name || '').trim(), level: String(c?.level || '').trim() }))
            .filter((c: any) => Boolean(c.name));
          applyRemoteReferencePayload({
            classes: clsRes.data || [],
            students: stuRes.data || []
          });
          fetchedOk = true;
        }
      }

      if (!fetchedOk) {
        setSyncState('error');
        if (manualRefresh) {
          showToast('Could not reach Supabase to refresh attendance.', 'error');
        }
        return;
      }

      // Record already-synced keys
      const remoteAttKeySet = new Set(fetchedAttendance.map(a => `${a.studentId}|${a.date}`));
      const remoteStuIdSet = new Set(fetchedStudents.map(s => s.studentId));
      const remoteClsNameSet = new Set(fetchedClasses.map(c => c.name.toLowerCase()));

      fetchedAttendance.forEach(a => migratedKeysRef.current.add(`att:${a.studentId}|${a.date}`));
      fetchedStudents.forEach(s => migratedKeysRef.current.add(`stu:${s.studentId}`));
      fetchedClasses.forEach(c => migratedKeysRef.current.add(`cls:${c.name.toLowerCase()}`));

      // Identify unsynced local attendance, students, or classes for auto-migration
      const unsyncedAttendance = localAttNormalized.filter(a => {
        const key = `${a.studentId}|${a.date}`;
        return !remoteAttKeySet.has(key) && !migratedKeysRef.current.has(`att:${key}`);
      });
      const unsyncedStudents = localStuNormalized.filter(
        s => !remoteStuIdSet.has(s.studentId) && !migratedKeysRef.current.has(`stu:${s.studentId}`)
      );
      const unsyncedClasses = localClsRaw.filter(c => {
        const cleanName = String(c?.name || '').trim().toLowerCase();
        return cleanName && !remoteClsNameSet.has(cleanName) && !migratedKeysRef.current.has(`cls:${cleanName}`);
      });

      if (
        !isReadOnlyRole &&
        (unsyncedAttendance.length > 0 || unsyncedStudents.length > 0 || unsyncedClasses.length > 0)
      ) {
        try {
          const syncRes = await fetch('/api/attendance/sync', {
            method: 'POST',
            headers: getApiHeaders(activeSchoolId),
            body: JSON.stringify({
              school_id: activeSchoolId,
              date: selectedDate,
              recordedBy: user?.fullName || user?.username || 'Staff',
              attendance: unsyncedAttendance,
              students: unsyncedStudents,
              classes: unsyncedClasses
            })
          });
          if (syncRes.ok) {
            const syncJson = await syncRes.json();
            if (syncJson && syncJson.success) {
              unsyncedAttendance.forEach(a => migratedKeysRef.current.add(`att:${a.studentId}|${a.date}`));
              unsyncedStudents.forEach(s => migratedKeysRef.current.add(`stu:${s.studentId}`));
              unsyncedClasses.forEach(c => migratedKeysRef.current.add(`cls:${String(c.name || '').trim().toLowerCase()}`));

              if (Array.isArray(syncJson.attendance)) {
                fetchedAttendance = syncJson.attendance
                  .map(normalizeAttendanceRow)
                  .filter(Boolean) as AttendanceRecordItem[];
              }
              applyRemoteReferencePayload(syncJson);
            }
          }
        } catch (syncErr) {
          console.warn('Notice auto-migrating local attendance to Supabase:', syncErr);
        }
      }

      setRemoteAttendance(fetchedAttendance);
      await persistLocalAttendanceCache(fetchedAttendance);
      setSyncState('synced');
      if (manualRefresh) {
        showToast('Attendance synchronized with Supabase.', 'success');
      }
    } catch (err) {
      console.error('Failed to synchronize attendance with Supabase:', err);
      setSyncState('error');
    }
  }, [
    activeSchoolId,
    selectedDate,
    isReadOnlyRole,
    user?.fullName,
    user?.username,
    normalizeAttendanceRow,
    normalizeStudentRow,
    applyRemoteReferencePayload,
    persistLocalAttendanceCache,
    showToast
  ]);

  useEffect(() => {
    fetchAttendanceFromSupabase(false);
  }, [fetchAttendanceFromSupabase]);

  // Reactive check: if Dexie finishes loading local attendance/students after initial mount, auto-push them to Supabase
  useEffect(() => {
    if (syncState !== 'synced' || remoteAttendance === null || isReadOnlyRole) return;
    const remoteAttKeys = new Set(remoteAttendance.map(a => `${a.studentId}|${a.date}`));
    const hasUnmigratedLocalAtt = localAttendanceAll.some(raw => {
      const norm = normalizeAttendanceRow(raw);
      if (!norm) return false;
      const key = `${norm.studentId}|${norm.date}`;
      return !remoteAttKeys.has(key) && !migratedKeysRef.current.has(`att:${key}`);
    });
    if (hasUnmigratedLocalAtt) {
      fetchAttendanceFromSupabase(false);
    }
  }, [localAttendanceAll, remoteAttendance, syncState, isReadOnlyRole, normalizeAttendanceRow, fetchAttendanceFromSupabase]);

  // Merged Classes from Supabase + Local DB + Students
  const classes = useMemo(() => {
    const map = new Map<string, string>();
    const addCls = (raw: string | undefined | null) => {
      const clean = String(raw || '').trim();
      if (!clean) return;
      const key = clean.toLowerCase();
      if (!map.has(key)) map.set(key, clean);
    };
    remoteClasses.forEach(c => addCls(c.name));
    classesFromDB.forEach(c => addCls(c.name));
    remoteStudents.forEach(s => addCls(s.class));
    studentsInSystem.forEach(s => addCls(s.class));
    (remoteAttendance || []).forEach(a => addCls(a.class));

    const sorted = Array.from(map.values()).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true })
    );
    return sorted.map((name, idx) => ({ id: idx, name }));
  }, [remoteClasses, classesFromDB, remoteStudents, studentsInSystem, remoteAttendance]);

  useEffect(() => {
    if (classes.length > 0 && !classes.some(c => c.name.toLowerCase() === selectedClass.toLowerCase())) {
      setSelectedClass(classes[0].name);
    }
  }, [classes, selectedClass]);

  // Merged Student Roster (Supabase public.students + local db.students)
  const allMergedStudents = useMemo(() => {
    const map = new Map<string, AttendanceStudentItem>();
    remoteStudents.forEach(s => {
      if (s.studentId) {
        map.set(s.studentId, s);
      }
    });
    studentsInSystem.forEach(s => {
      const norm = normalizeStudentRow(s);
      if (norm && !map.has(norm.studentId)) {
        map.set(norm.studentId, norm);
      }
    });
    return Array.from(map.values()).sort((a, b) =>
      `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`)
    );
  }, [remoteStudents, studentsInSystem, normalizeStudentRow]);

  const parentWards = useMemo(() => {
    if (isParent && user?.fullName && allMergedStudents.length > 0) {
      const cleanParentName = user.fullName.replace(/\s*\(Parent\)/i, '').trim().toLowerCase();
      return allMergedStudents.filter(s => {
        const guardian = (s.guardianName || '').toLowerCase().trim();
        return Boolean(guardian) && (guardian.includes(cleanParentName) || cleanParentName.includes(guardian));
      });
    }
    return [];
  }, [isParent, user?.fullName, allMergedStudents]);

  const studentSelfRecords = useMemo(() => {
    if (isStudent && user?.fullName && allMergedStudents.length > 0) {
      const cleanStudentName = user.fullName.replace(/\s*\(Student\)/i, '').trim().toLowerCase();
      const matched = allMergedStudents.filter(s => {
        const full = `${s.firstName} ${s.lastName}`.toLowerCase().trim();
        return full.includes(cleanStudentName) || cleanStudentName.includes(full);
      });
      if (matched.length > 0) return matched;
    }
    return [];
  }, [isStudent, user?.fullName, allMergedStudents]);

  const students = useMemo(() => {
    if (isParent) {
      return parentWards;
    }
    if (isStudent && studentSelfRecords.length > 0) {
      return studentSelfRecords;
    }
    const cleanSelected = String(selectedClass || '').trim().toLowerCase();
    return allMergedStudents.filter(
      s => String(s.class || '').trim().toLowerCase() === cleanSelected
    );
  }, [isParent, parentWards, isStudent, studentSelfRecords, allMergedStudents, selectedClass]);

  // Unified Attendance Map for Selected Date (Supabase primary + local fallback)
  const dateAttendanceByStudent = useMemo(() => {
    const map = new Map<string, AttendanceRecordItem>();
    localAttendanceAll.forEach(raw => {
      const norm = normalizeAttendanceRow(raw);
      if (norm && norm.date === selectedDate) {
        map.set(norm.studentId, norm);
      }
    });
    (remoteAttendance || []).forEach(rec => {
      if (rec && rec.date === selectedDate) {
        map.set(rec.studentId, rec);
      }
    });
    return map;
  }, [localAttendanceAll, remoteAttendance, selectedDate, normalizeAttendanceRow]);

  const filteredAttendance = useMemo(() => {
    const result: AttendanceRecordItem[] = [];
    for (const s of students) {
      const rec = dateAttendanceByStudent.get(s.studentId);
      if (rec) result.push(rec);
    }
    return result;
  }, [students, dateAttendanceByStudent]);

  const getStatus = useCallback((studentId: string): AttendanceStatus | 'None' => {
    return dateAttendanceByStudent.get(studentId)?.status || 'None';
  }, [dateAttendanceByStudent]);

  const getReason = useCallback((studentId: string): string => {
    return dateAttendanceByStudent.get(studentId)?.reason || '';
  }, [dateAttendanceByStudent]);

  // Mark individual student attendance -> saves immediately to Supabase
  const markAttendance = async (
    student: AttendanceStudentItem,
    status: AttendanceStatus,
    customReason?: string
  ) => {
    if (isReadOnlyRole) {
      showToast('Parents and students are not permitted to modify attendance records.', 'error');
      return;
    }

    const studentId = student.studentId;
    const existingRec = dateAttendanceByStudent.get(studentId);
    const reasonToSave = customReason !== undefined
      ? customReason.trim()
      : (noteDrafts[studentId] !== undefined ? noteDrafts[studentId].trim() : (existingRec?.reason || ''));

    const optimisticRecord: AttendanceRecordItem = {
      id: existingRec?.id,
      schoolId: activeSchoolId,
      studentId,
      class: student.class || selectedClass,
      date: selectedDate,
      status,
      reason: reasonToSave || null,
      recordedBy: user?.fullName || user?.username || 'Staff',
      createdAt: existingRec?.createdAt || Date.now()
    };

    // Optimistic update while saving to Supabase
    setRemoteAttendance(prev => {
      const list = Array.isArray(prev) ? prev : [];
      const filtered = list.filter(a => !(a.studentId === studentId && a.date === selectedDate));
      return [optimisticRecord, ...filtered];
    });

    setSavingStudentIds(prev => {
      const next = new Set(prev);
      next.add(studentId);
      return next;
    });
    setSyncState('saving');

    try {
      const res = await fetch('/api/attendance', {
        method: 'POST',
        headers: getApiHeaders(activeSchoolId),
        body: JSON.stringify({
          school_id: activeSchoolId,
          studentId,
          class: student.class || selectedClass,
          date: selectedDate,
          status,
          reason: reasonToSave || null,
          recordedBy: user?.fullName || user?.username || 'Staff',
          student
        })
      });

      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || 'Failed to save attendance to Supabase');
      }

      migratedKeysRef.current.add(`att:${studentId}|${selectedDate}`);
      applyRemoteReferencePayload(json);

      if (Array.isArray(json.attendance)) {
        const normalizedRemote = json.attendance
          .map(normalizeAttendanceRow)
          .filter(Boolean) as AttendanceRecordItem[];
        setRemoteAttendance(normalizedRemote);
        await persistLocalAttendanceCache([optimisticRecord]);
      } else {
        const savedRec = normalizeAttendanceRow(json.record || optimisticRecord) || optimisticRecord;
        setRemoteAttendance(prev => {
          const list = Array.isArray(prev) ? prev : [];
          const filtered = list.filter(a => !(a.studentId === studentId && a.date === selectedDate));
          return [savedRec, ...filtered];
        });
        await persistLocalAttendanceCache([savedRec]);
      }

      setSyncState('synced');
    } catch (err: any) {
      setSyncState('error');
      showToast(err?.message || 'Failed to save attendance to Supabase. Please retry.', 'error');
    } finally {
      setSavingStudentIds(prev => {
        const next = new Set(prev);
        next.delete(studentId);
        return next;
      });
    }
  };

  // Save optional note/reason for a student
  const handleSaveStudentNote = async (student: AttendanceStudentItem) => {
    const currentStatus = getStatus(student.studentId);
    const effectiveStatus: AttendanceStatus = currentStatus === 'None' ? 'Present' : currentStatus;
    const draft = (noteDrafts[student.studentId] ?? getReason(student.studentId)).trim();
    await markAttendance(student, effectiveStatus, draft);
    setOpenNoteStudentIds(prev => {
      const next = new Set(prev);
      next.delete(student.studentId);
      return next;
    });
    showToast(`Saved attendance note for ${student.firstName} ${student.lastName} in Supabase.`, 'success');
  };

  // Bulk Mark All in current class -> single batch upsert to Supabase
  const markAll = async (status: AttendanceStatus) => {
    if (isReadOnlyRole) {
      showToast('Parents and students are not permitted to modify attendance records.', 'error');
      return;
    }
    if (!students || students.length === 0) {
      showToast('No students in this class to mark.', 'error');
      return;
    }

    const batchRecords: AttendanceRecordItem[] = students.map(s => {
      const existingRec = dateAttendanceByStudent.get(s.studentId);
      const reasonToKeep = noteDrafts[s.studentId] !== undefined
        ? noteDrafts[s.studentId].trim()
        : (existingRec?.reason || '');
      return {
        id: existingRec?.id,
        schoolId: activeSchoolId,
        studentId: s.studentId,
        class: s.class || selectedClass,
        date: selectedDate,
        status,
        reason: reasonToKeep || null,
        recordedBy: user?.fullName || user?.username || 'Staff',
        createdAt: existingRec?.createdAt || Date.now()
      };
    });

    // Optimistic update
    setRemoteAttendance(prev => {
      const list = Array.isArray(prev) ? prev : [];
      const batchStudentSet = new Set(students.map(s => s.studentId));
      const remaining = list.filter(a => !(a.date === selectedDate && batchStudentSet.has(a.studentId)));
      return [...batchRecords, ...remaining];
    });

    setIsBulkSaving(true);
    setSyncState('saving');

    try {
      const res = await fetch('/api/attendance', {
        method: 'POST',
        headers: getApiHeaders(activeSchoolId),
        body: JSON.stringify({
          school_id: activeSchoolId,
          date: selectedDate,
          class: selectedClass,
          recordedBy: user?.fullName || user?.username || 'Staff',
          records: batchRecords,
          students
        })
      });

      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || `Failed to mark all ${status} in Supabase`);
      }

      batchRecords.forEach(r => migratedKeysRef.current.add(`att:${r.studentId}|${r.date}`));
      applyRemoteReferencePayload(json);

      if (Array.isArray(json.attendance)) {
        const normalizedRemote = json.attendance
          .map(normalizeAttendanceRow)
          .filter(Boolean) as AttendanceRecordItem[];
        setRemoteAttendance(normalizedRemote);
      }
      await persistLocalAttendanceCache(batchRecords);
      setSyncState('synced');
      showToast(`Marked all ${students.length} students in ${selectedClass} as ${status} in Supabase.`, 'success');
    } catch (err: any) {
      setSyncState('error');
      showToast(err?.message || 'Failed to save bulk attendance to Supabase.', 'error');
    } finally {
      setIsBulkSaving(false);
    }
  };

  const [isExportingPDF, setIsExportingPDF] = useState(false);
  const handleExportPDF = async () => {
    setIsExportingPDF(true);
    try {
      const fileName = isParent
        ? `Attendance_Wards_${selectedDate}`
        : `Attendance_${selectedClass}_${selectedDate}`;
      await exportToPDF('print-attendance', fileName);
    } catch (err) {
      showToast('Failed to export printable PDF.', 'error');
    } finally {
      setIsExportingPDF(false);
    }
  };

  const exportAttendance = () => {
    const data = students?.map(s => ({
      ID: s.studentId,
      Name: `${s.firstName} ${s.lastName}`,
      Status: getStatus(s.studentId),
      Note: getReason(s.studentId) || '',
      Date: selectedDate,
      Class: s.class
    })) || [];
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Attendance');
    const fileName = isParent
      ? `Attendance_Wards_${selectedDate}.xlsx`
      : `Attendance_${selectedClass}_${selectedDate}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

  const stats = useMemo(() => {
    return {
      present: filteredAttendance.filter(a => a.status === 'Present').length,
      late: filteredAttendance.filter(a => a.status === 'Late').length,
      absent: filteredAttendance.filter(a => a.status === 'Absent').length,
      excused: filteredAttendance.filter(a => a.status === 'Excused').length
    };
  }, [filteredAttendance]);

  const toggleNoteEditor = (studentId: string) => {
    const currentReason = getReason(studentId);
    setNoteDrafts(prev => ({
      ...prev,
      [studentId]: prev[studentId] !== undefined ? prev[studentId] : currentReason
    }));
    setOpenNoteStudentIds(prev => {
      const next = new Set(prev);
      if (next.has(studentId)) {
        next.delete(studentId);
      } else {
        next.add(studentId);
      }
      return next;
    });
  };

  return (
    <div className="space-y-4 sm:space-y-6 min-w-0" id="print-attendance">
      {/* Print Only Header */}
      <div className="only-print">
        <h1 className="text-3xl font-black text-slate-900 uppercase tracking-tighter text-center">{schoolName}</h1>
        <div className="mt-2 text-sm font-bold text-slate-600 uppercase tracking-widest flex items-center justify-center gap-4">
          <span>Daily Attendance Roll</span>
          <span className="w-1.5 h-1.5 bg-slate-400 rounded-full" />
          {isParent ? (
            <span>My Children</span>
          ) : (
            <span>Class: {selectedClass}</span>
          )}
          <span className="w-1.5 h-1.5 bg-slate-400 rounded-full" />
          <span>Date: {format(new Date(selectedDate), 'EEEE, MMMM do, yyyy')}</span>
        </div>
      </div>

      {/* Selected Element (div#print-attendance > div:nth-of-type(2)): Deep Teal Hero Header Card */}
      <div className="bg-[#1c4a59] rounded-2xl sm:rounded-3xl p-4 sm:p-6 lg:p-7 text-white shadow-[0_8px_28px_rgba(28,74,89,0.16)] flex flex-col gap-3.5 sm:gap-5 print:hidden min-w-0">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3.5 sm:gap-4 min-w-0">
          <div className="space-y-1.5 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-full bg-white/10 border border-white/15">
                <CalendarDays className="w-3.5 h-3.5 text-[#faae57] shrink-0" />
                <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-[#e1c594]">
                  Daily Roll Call & Register
                </span>
              </div>

              <button
                type="button"
                onClick={() => fetchAttendanceFromSupabase(true)}
                disabled={syncState === 'loading' || syncState === 'saving'}
                title="Sync attendance records with Supabase"
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-full text-[10px] sm:text-[11px] font-bold transition-all cursor-pointer ${
                  syncState === 'error'
                    ? 'bg-[#ef476f] text-white'
                    : syncState === 'saving' || syncState === 'loading'
                    ? 'bg-white/15 text-white'
                    : 'bg-[#06d6a0]/20 text-[#06d6a0] hover:bg-[#06d6a0]/30'
                }`}
              >
                <RefreshCw className={`w-3 h-3 shrink-0 ${syncState === 'loading' || syncState === 'saving' ? 'animate-spin' : ''}`} />
                <span className="truncate">
                  {syncState === 'loading'
                    ? 'Loading…'
                    : syncState === 'saving'
                    ? 'Saving…'
                    : syncState === 'error'
                    ? 'Sync Error — Retry'
                    : `Synced (${filteredAttendance.length}/${students.length})`}
                </span>
              </button>
            </div>

            <h2 className="text-lg sm:text-2xl lg:text-[26px] font-extrabold tracking-tight text-white leading-tight truncate">
              {isParent ? 'My Wards Daily Attendance' : `Class Attendance • ${selectedClass}`}
            </h2>
            <p className="text-xs sm:text-sm text-[#e1c594]/90 font-medium truncate">
              {format(new Date(selectedDate), 'EEE, MMM do, yyyy')} • {students?.length || 0} Students Listed
            </p>
          </div>

          {/* 2x2 Mobile / Inline Desktop Live Status Summary Grid */}
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 sm:gap-2.5 w-full lg:w-auto">
            <div className="flex items-center justify-between sm:justify-start gap-2 px-3 sm:px-3.5 py-2 sm:py-2.5 rounded-xl sm:rounded-2xl bg-white/10 border border-white/15">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 bg-[#06d6a0] rounded-full shrink-0" />
                <span className="text-[11px] sm:text-xs font-bold text-white">Present</span>
              </div>
              <span className="text-sm sm:text-base font-extrabold text-[#06d6a0] font-mono tabular-nums">{stats.present}</span>
            </div>
            <div className="flex items-center justify-between sm:justify-start gap-2 px-3 sm:px-3.5 py-2 sm:py-2.5 rounded-xl sm:rounded-2xl bg-white/10 border border-white/15">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 bg-[#faae57] rounded-full shrink-0" />
                <span className="text-[11px] sm:text-xs font-bold text-white">Late</span>
              </div>
              <span className="text-sm sm:text-base font-extrabold text-[#faae57] font-mono tabular-nums">{stats.late}</span>
            </div>
            <div className="flex items-center justify-between sm:justify-start gap-2 px-3 sm:px-3.5 py-2 sm:py-2.5 rounded-xl sm:rounded-2xl bg-white/10 border border-white/15">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 bg-[#ef476f] rounded-full shrink-0" />
                <span className="text-[11px] sm:text-xs font-bold text-white">Absent</span>
              </div>
              <span className="text-sm sm:text-base font-extrabold text-[#ef476f] font-mono tabular-nums">{stats.absent}</span>
            </div>
            <div className="flex items-center justify-between sm:justify-start gap-2 px-3 sm:px-3.5 py-2 sm:py-2.5 rounded-xl sm:rounded-2xl bg-white/10 border border-white/15">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 bg-[#e1c594] rounded-full shrink-0" />
                <span className="text-[11px] sm:text-xs font-bold text-white">Excused</span>
              </div>
              <span className="text-sm sm:text-base font-extrabold text-[#e1c594] font-mono tabular-nums">{stats.excused}</span>
            </div>
          </div>
        </div>

        {/* Filter & Action Bar */}
        <div className="pt-3 sm:pt-4 border-t border-white/10 flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 sm:gap-3.5 min-w-0">
          {/* Side-by-Side Date & Class Filter Row */}
          <div className="grid grid-cols-[1fr_auto] sm:flex items-center gap-2 sm:gap-3 w-full lg:w-auto min-w-0">
            <div className="flex items-center gap-2 bg-white px-3 sm:px-3.5 py-2 rounded-xl sm:rounded-full border border-[#bac4c6] min-h-[40px] sm:min-h-[42px] min-w-0">
              <CalendarDays className="w-4 h-4 text-[#1c4a59] shrink-0" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-transparent text-xs sm:text-sm font-bold text-[#1f2a2e] outline-none cursor-pointer w-full min-w-0 font-mono tabular-nums"
              />
            </div>

            {isParent ? (
              <div className="px-3 py-2 bg-white/10 border border-white/15 rounded-xl sm:rounded-full text-[11px] font-bold uppercase tracking-wider text-[#faae57] whitespace-nowrap">
                Linked Wards
              </div>
            ) : (
              <select
                value={selectedClass}
                onChange={(e) => setSelectedClass(e.target.value)}
                className="bg-white border border-[#bac4c6] rounded-xl sm:rounded-full px-3 sm:px-4 py-2 text-xs sm:text-sm font-bold text-[#1f2a2e] outline-none focus:ring-2 focus:ring-[#faae57] min-h-[40px] sm:min-h-[42px] cursor-pointer shrink-0"
              >
                {classes?.length
                  ? classes.map(c => <option key={c.id} value={c.name}>{c.name}</option>)
                  : <option>P1</option>}
              </select>
            )}
          </div>

          {/* Compact Bulk & Export Action Grid */}
          <div className={`grid ${!isReadOnlyRole ? 'grid-cols-2' : 'grid-cols-1'} sm:flex sm:flex-wrap items-center gap-2 w-full lg:w-auto`}>
            {!isReadOnlyRole && (
              <div ref={bulkMenuRef} className="relative w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setIsBulkMenuOpen(prev => !prev)}
                  disabled={isBulkSaving || syncState === 'saving'}
                  className="w-full sm:w-auto flex items-center justify-between sm:justify-center gap-2 px-3.5 sm:px-4 py-2 text-xs font-bold bg-[#faae57] hover:bg-[#e4ae67] text-[#1f2a2e] rounded-xl sm:rounded-full transition-all shadow-xs min-h-[40px] sm:min-h-[42px] cursor-pointer active:scale-[0.97] disabled:opacity-50 whitespace-nowrap"
                >
                  <span className="flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5 text-[#1f2a2e] stroke-[2.5] shrink-0" />
                    <span>{isBulkSaving ? 'Saving…' : 'Mark All'}</span>
                  </span>
                  <ChevronDown className={`w-3.5 h-3.5 text-[#1f2a2e] shrink-0 transition-transform ${isBulkMenuOpen ? 'rotate-180' : ''}`} />
                </button>

                {isBulkMenuOpen && (
                  <div className="absolute left-0 sm:right-0 sm:left-auto mt-1.5 w-48 bg-white border border-[#bac4c6] rounded-xl shadow-lg py-1.5 z-30 text-[#1f2a2e]">
                    <button
                      type="button"
                      onClick={() => {
                        setIsBulkMenuOpen(false);
                        markAll('Present');
                      }}
                      disabled={isBulkSaving || syncState === 'saving'}
                      className="w-full px-3.5 py-2 text-left text-xs font-bold text-[#1f2a2e] hover:bg-[#f6f8f7] flex items-center gap-2.5 transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      <span className="w-2.5 h-2.5 rounded-full bg-[#06d6a0] shrink-0" />
                      <span>Mark All Present</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsBulkMenuOpen(false);
                        markAll('Late');
                      }}
                      disabled={isBulkSaving || syncState === 'saving'}
                      className="w-full px-3.5 py-2 text-left text-xs font-bold text-[#1f2a2e] hover:bg-[#f6f8f7] flex items-center gap-2.5 transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      <span className="w-2.5 h-2.5 rounded-full bg-[#faae57] shrink-0" />
                      <span>Mark All Late</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsBulkMenuOpen(false);
                        markAll('Absent');
                      }}
                      disabled={isBulkSaving || syncState === 'saving'}
                      className="w-full px-3.5 py-2 text-left text-xs font-bold text-[#1f2a2e] hover:bg-[#f6f8f7] flex items-center gap-2.5 transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      <span className="w-2.5 h-2.5 rounded-full bg-[#ef476f] shrink-0" />
                      <span>Mark All Absent</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsBulkMenuOpen(false);
                        markAll('Excused');
                      }}
                      disabled={isBulkSaving || syncState === 'saving'}
                      className="w-full px-3.5 py-2 text-left text-xs font-bold text-[#1f2a2e] hover:bg-[#f6f8f7] flex items-center gap-2.5 transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      <span className="w-2.5 h-2.5 rounded-full bg-[#1c4a59] shrink-0" />
                      <span>Mark All Excused</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            <div ref={exportMenuRef} className="relative w-full sm:w-auto">
              <button
                type="button"
                onClick={() => setIsExportMenuOpen(prev => !prev)}
                className="w-full sm:w-auto flex items-center justify-between sm:justify-center gap-2 px-3.5 sm:px-4 py-2 bg-white text-[#1c4a59] rounded-xl sm:rounded-full font-bold hover:bg-[#f6f8f7] transition-all shadow-xs text-xs min-h-[40px] sm:min-h-[42px] cursor-pointer whitespace-nowrap"
              >
                <span className="flex items-center gap-1.5">
                  <Download className="w-3.5 h-3.5 text-[#1c4a59] shrink-0" />
                  <span>{isExportingPDF ? 'Exporting PDF…' : 'Export / Print'}</span>
                </span>
                <ChevronDown className={`w-3.5 h-3.5 text-[#1c4a59] shrink-0 transition-transform ${isExportMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              {isExportMenuOpen && (
                <div className="absolute right-0 left-0 sm:left-auto mt-1.5 sm:w-48 bg-white border border-[#bac4c6] rounded-xl shadow-lg py-1.5 z-30 text-[#1f2a2e]">
                  <button
                    type="button"
                    onClick={() => {
                      setIsExportMenuOpen(false);
                      handleExportPDF();
                    }}
                    disabled={isExportingPDF}
                    className="w-full px-3.5 py-2 text-left text-xs font-bold text-[#1f2a2e] hover:bg-[#f6f8f7] flex items-center gap-2.5 transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    <FileText className="w-3.5 h-3.5 text-[#1c4a59] shrink-0" />
                    <span>{isExportingPDF ? 'Exporting PDF…' : 'Download PDF'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsExportMenuOpen(false);
                      triggerPrint();
                    }}
                    className="w-full px-3.5 py-2 text-left text-xs font-bold text-[#1f2a2e] hover:bg-[#f6f8f7] flex items-center gap-2.5 transition-colors cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5 text-[#1c4a59] shrink-0" />
                    <span>Print Attendance</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsExportMenuOpen(false);
                      exportAttendance();
                    }}
                    className="w-full px-3.5 py-2 text-left text-xs font-bold text-[#1f2a2e] hover:bg-[#f6f8f7] flex items-center gap-2.5 transition-colors cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5 text-[#faae57] shrink-0" />
                    <span>Export CSV / Excel</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Student Attendance Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5 sm:gap-4">
        {students?.map((student) => {
          const status = getStatus(student.studentId);
          const savedReason = getReason(student.studentId);
          const isNoteOpen = openNoteStudentIds.has(student.studentId);
          const isSavingThis = savingStudentIds.has(student.studentId);

          return (
            <motion.div
              layout
              key={student.studentId || student.id}
              className="bg-white p-3.5 sm:p-4 rounded-2xl border border-[#bac4c6]/80 shadow-[0_2px_10px_rgba(0,0,0,0.04)] flex flex-col gap-2.5 group hover:border-[#1c4a59]/50 transition-colors min-w-0"
            >
              {/* Stacked on Mobile, Single-Row on Tablet+ */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 min-w-0">
                <div className="flex items-center justify-between sm:justify-start gap-2.5 min-w-0">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-9 h-9 sm:w-10 sm:h-10 bg-[#1c4a59] rounded-xl flex items-center justify-center text-[#faae57] font-bold text-xs uppercase shrink-0">
                      {(student.firstName?.[0] || '')}{(student.lastName?.[0] || '') || 'S'}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <h4 className="text-xs sm:text-sm font-bold text-[#1f2a2e] leading-snug truncate">
                          {student.firstName} {student.lastName}
                        </h4>
                        {isParent && (
                          <span className="px-2 py-0.5 bg-[#1c4a59]/10 text-[#1c4a59] rounded-md text-[9px] font-bold uppercase tracking-wider shrink-0">
                            {student.class}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <p className="text-[11px] text-[#6a7f84] font-mono tabular-nums">{student.studentId}</p>
                        {status !== 'None' && (
                          <span className="hidden sm:inline text-[11px] font-bold text-[#1c4a59]">
                            · {isSavingThis ? 'Saving…' : status}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Mobile Live Status Pill on Top-Right of Student Identity Row */}
                  {status !== 'None' && (
                    <span className={`sm:hidden px-2 py-0.5 rounded-lg text-[10px] font-bold shrink-0 ${
                      status === 'Present'
                        ? 'bg-[#ecfdf5] text-[#065f46] border border-[#a7f3d0]'
                        : status === 'Late'
                        ? 'bg-[#faae57]/20 text-[#807654] border border-[#e1c594]'
                        : status === 'Absent'
                        ? 'bg-[#fef2f2] text-[#ef476f] border border-[#fecdd3]'
                        : 'bg-[#1c4a59] text-white'
                    }`}>
                      {isSavingThis ? 'Saving…' : status}
                    </span>
                  )}
                </div>

                {/* Status Action Buttons: 5-Column Equal Bar on Mobile, Compact Row on sm+ */}
                <div className={`grid ${isReadOnlyRole ? 'grid-cols-4' : 'grid-cols-5'} sm:flex items-center gap-1.5 sm:gap-1 pt-2 sm:pt-0 border-t sm:border-t-0 border-[#bac4c6]/40 shrink-0`}>
                  <button
                    type="button"
                    onClick={() => !isReadOnlyRole && markAttendance(student, 'Present')}
                    disabled={isReadOnlyRole || isSavingThis}
                    className={`min-h-[38px] sm:min-w-[38px] sm:min-h-[40px] px-2 rounded-xl flex items-center justify-center gap-1 text-[11px] font-bold transition-all cursor-pointer active:scale-[0.97] ${
                      status === 'Present'
                        ? 'bg-[#06d6a0] text-[#1f2a2e] shadow-2xs'
                        : isReadOnlyRole
                        ? 'bg-[#f6f8f7] text-[#bac4c6] opacity-40 cursor-not-allowed'
                        : 'bg-[#f6f8f7] text-[#6a7f84] hover:bg-[#06d6a0]/15 hover:text-[#1f2a2e]'
                    }`}
                    title={isReadOnlyRole ? 'Status: Present' : 'Mark Present'}
                  >
                    <Check className="w-3.5 h-3.5 stroke-[2.5] shrink-0" />
                    <span className="sm:hidden">Pres</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => !isReadOnlyRole && markAttendance(student, 'Late')}
                    disabled={isReadOnlyRole || isSavingThis}
                    className={`min-h-[38px] sm:min-w-[38px] sm:min-h-[40px] px-2 rounded-xl flex items-center justify-center gap-1 text-[11px] font-bold transition-all cursor-pointer active:scale-[0.97] ${
                      status === 'Late'
                        ? 'bg-[#faae57] text-[#1f2a2e] shadow-2xs'
                        : isReadOnlyRole
                        ? 'bg-[#f6f8f7] text-[#bac4c6] opacity-40 cursor-not-allowed'
                        : 'bg-[#f6f8f7] text-[#6a7f84] hover:bg-[#faae57]/20 hover:text-[#1f2a2e]'
                    }`}
                    title={isReadOnlyRole ? 'Status: Late' : 'Mark Late'}
                  >
                    <Clock className="w-3.5 h-3.5 stroke-[2.5] shrink-0" />
                    <span className="sm:hidden">Late</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => !isReadOnlyRole && markAttendance(student, 'Absent')}
                    disabled={isReadOnlyRole || isSavingThis}
                    className={`min-h-[38px] sm:min-w-[38px] sm:min-h-[40px] px-2 rounded-xl flex items-center justify-center gap-1 text-[11px] font-bold transition-all cursor-pointer active:scale-[0.97] ${
                      status === 'Absent'
                        ? 'bg-[#ef476f] text-white shadow-2xs'
                        : isReadOnlyRole
                        ? 'bg-[#f6f8f7] text-[#bac4c6] opacity-40 cursor-not-allowed'
                        : 'bg-[#f6f8f7] text-[#6a7f84] hover:bg-[#ef476f]/15 hover:text-[#ef476f]'
                    }`}
                    title={isReadOnlyRole ? 'Status: Absent' : 'Mark Absent'}
                  >
                    <X className="w-3.5 h-3.5 stroke-[2.5] shrink-0" />
                    <span className="sm:hidden">Abs</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => !isReadOnlyRole && markAttendance(student, 'Excused')}
                    disabled={isReadOnlyRole || isSavingThis}
                    className={`min-h-[38px] sm:min-w-[38px] sm:min-h-[40px] px-2 rounded-xl flex items-center justify-center gap-1 text-[11px] font-bold transition-all cursor-pointer active:scale-[0.97] ${
                      status === 'Excused'
                        ? 'bg-[#1c4a59] text-white shadow-2xs'
                        : isReadOnlyRole
                        ? 'bg-[#f6f8f7] text-[#bac4c6] opacity-40 cursor-not-allowed'
                        : 'bg-[#f6f8f7] text-[#6a7f84] hover:bg-[#1c4a59]/15 hover:text-[#1c4a59]'
                    }`}
                    title={isReadOnlyRole ? 'Status: Excused' : 'Mark Excused'}
                  >
                    <ShieldCheck className="w-3.5 h-3.5 stroke-[2.2] shrink-0" />
                    <span className="sm:hidden">Exc</span>
                  </button>

                  {!isReadOnlyRole && (
                    <button
                      type="button"
                      onClick={() => toggleNoteEditor(student.studentId)}
                      className={`min-h-[38px] sm:min-w-[36px] sm:min-h-[40px] px-2 rounded-xl flex items-center justify-center gap-1 text-[11px] font-bold transition-all cursor-pointer active:scale-[0.97] ${
                        isNoteOpen || savedReason
                          ? 'bg-[#e1c594]/50 text-[#1c4a59]'
                          : 'bg-[#f6f8f7] text-[#6a7f84] hover:bg-[#e1c594]/30 hover:text-[#1f2a2e]'
                      }`}
                      title={savedReason ? `Note: ${savedReason}` : 'Add / Edit Attendance Note'}
                    >
                      <MessageSquare className="w-3.5 h-3.5 shrink-0" />
                      <span className="sm:hidden">Note</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Saved Note Display (when editor is closed) */}
              {!isNoteOpen && savedReason && (
                <div
                  onClick={() => !isReadOnlyRole && toggleNoteEditor(student.studentId)}
                  className={`text-xs text-[#6a7f84] bg-[#f6f8f7] px-3 py-1.5 rounded-xl border border-[#bac4c6]/60 flex items-center justify-between gap-2 ${
                    !isReadOnlyRole ? 'cursor-pointer hover:border-[#1c4a59]/40' : ''
                  }`}
                >
                  <span className="truncate">
                    <strong className="text-[#1f2a2e]">Note:</strong> {savedReason}
                  </span>
                  {!isReadOnlyRole && (
                    <span className="text-[11px] font-bold text-[#1c4a59] shrink-0">Edit</span>
                  )}
                </div>
              )}

              {/* Optional Inline Note / Reason Editor */}
              {isNoteOpen && !isReadOnlyRole && (
                <div className="pt-2 border-t border-[#bac4c6]/50 flex items-center gap-2 print:hidden">
                  <input
                    type="text"
                    value={noteDrafts[student.studentId] ?? savedReason}
                    onChange={(e) =>
                      setNoteDrafts(prev => ({
                        ...prev,
                        [student.studentId]: e.target.value
                      }))
                    }
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleSaveStudentNote(student);
                      }
                    }}
                    placeholder="Reason (e.g., Medical excuse, Bus delay)…"
                    className="flex-1 min-w-0 bg-[#f6f8f7] border border-[#bac4c6] rounded-xl px-3 py-1.5 text-xs font-medium text-[#1f2a2e] outline-none focus:border-[#1c4a59] focus:bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => handleSaveStudentNote(student)}
                    disabled={isSavingThis}
                    className="px-3 py-1.5 bg-[#faae57] hover:bg-[#e4ae67] text-[#1f2a2e] rounded-xl text-xs font-bold transition-all cursor-pointer active:scale-[0.97] shrink-0 disabled:opacity-50"
                  >
                    Save
                  </button>
                </div>
              )}
            </motion.div>
          );
        })}

        {students?.length === 0 && (
          <div className="col-span-full py-10 sm:py-12 text-center text-[#6a7f84] bg-white border border-dashed border-[#bac4c6] rounded-2xl sm:rounded-3xl">
            <Users className="w-10 h-10 sm:w-12 sm:h-12 text-[#bac4c6] mx-auto mb-2.5" />
            <p className="text-xs sm:text-sm font-bold text-[#1f2a2e]">
              {isParent
                ? 'No related wards found linked to your account.'
                : 'No students enrolled in this class yet.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
