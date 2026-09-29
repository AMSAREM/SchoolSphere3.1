import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/schema';
import { 
  Calendar, 
  Clock, 
  Plus, 
  Trash2, 
  Edit2, 
  Printer, 
  AlertTriangle, 
  CheckCircle, 
  Building, 
  Search, 
  CornerDownRight, 
  UserCheck, 
  FileText,
  BookOpen,
  Info,
  RefreshCw,
  Bell
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { triggerPrint } from '../lib/utils';
import { useNotifications } from '../contexts/NotificationContext';
import { useAuth } from '../contexts/AuthContext';
import { getApiHeaders, sirenApi } from '../lib/api';
import { supabase } from '../lib/supabase/client';

// Standard timetable slot structure
interface TimetableSlot {
  id: string;
  classId: string;       // e.g., "Basic 1"
  subjectName: string;   // e.g., "Mathematics"
  teacherName: string;   // e.g., "Mr. Kwame Boateng"
  day: 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday';
  startTime: string;     // e.g., "08:00"
  endTime: string;       // e.g., "08:45"
  room: string;          // e.g., "Room 3B"
  notes?: string;
}

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] as const;

export default function TimetableManagement() {
  const { user, school } = useAuth();
  const { showToast, confirm } = useNotifications();

  // Tab states: View Timetable, Class Grid View, Edit Slots, Conflict Diagnostics, Period Suggestions
  const [activeTab, setActiveTab] = useState<'view' | 'class_view' | 'manage' | 'diagnose' | 'suggestions'>('view');
  
  // Selected filter states
  const [selectedClassFilter, setSelectedClassFilter] = useState<string>('All');
  const [selectedTeacherFilter, setSelectedTeacherFilter] = useState<string>('All');
  const [selectedRoomFilter, setSelectedRoomFilter] = useState<string>('All');

  // Class Grid View selection state
  const [selectedClassForGrid, setSelectedClassForGrid] = useState<string>('');
  
  // Form modal states
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingSlotId, setEditingSlotId] = useState<string | null>(null);
  
  // Form input states
  const [formClass, setFormClass] = useState('');
  const [formSubject, setFormSubject] = useState('');
  const [formTeacher, setFormTeacher] = useState('');
  const [formDay, setFormDay] = useState<typeof WEEKDAYS[number]>('Monday');
  const [formStartTime, setFormStartTime] = useState('08:00');
  const [formEndTime, setFormEndTime] = useState('08:45');
  const [formRoom, setFormRoom] = useState('Room A');
  const [formNotes, setFormNotes] = useState('');

  // Supabase remote state & sync status
  const [remoteSlots, setRemoteSlots] = useState<TimetableSlot[] | null>(null);
  const [remoteSuggestions, setRemoteSuggestions] = useState<any[] | null>(null);
  const [remotePeriods, setRemotePeriods] = useState<Array<{
    id?: string | number;
    periodId?: string | number;
    entryId?: string | number;
    name: string;
    startTime: string;
    endTime: string;
    day?: TimetableSlot['day'];
    classId?: string;
    subjectName?: string;
    teacherName?: string;
    room?: string;
    notes?: string;
  }>>([]);
  const [remoteClasses, setRemoteClasses] = useState<Array<{ name: string; level?: string }>>([]);
  const [remoteSubjects, setRemoteSubjects] = useState<Array<{ name: string; code?: string; applicableClasses: string[] }>>([]);
  const [remoteTeachers, setRemoteTeachers] = useState<Array<{ fullName: string; firstName: string; lastName: string; assignedClasses: string[]; subjects: string[] }>>([]);
  const [remoteBells, setRemoteBells] = useState<any[] | null>(null);
  const [isSyncingBells, setIsSyncingBells] = useState(false);
  const [liveNow, setLiveNow] = useState<Date>(() => new Date());
  const [syncState, setSyncState] = useState<'loading' | 'saving' | 'synced' | 'error'>('loading');
  const [isQuickPanelOpen, setIsQuickPanelOpen] = useState(true);
  const [savingQuickId, setSavingQuickId] = useState<string | null>(null);
  const migratedIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const timer = setInterval(() => setLiveNow(new Date()), 15000);
    return () => clearInterval(timer);
  }, []);

  // Settings & DB queries
  const settings = useLiveQuery(() => db.settings.toArray()) || [];
  const schoolName = settings.find(s => s.key === 'schoolProfile')?.value?.schoolName || 'ESEPA INTERNATIONAL SCHOOL';
  const bellScheduleSetting = settings.find(s => s.key === 'bellSchedule');
  const periodBells: any[] = useMemo(() => {
    if (Array.isArray(remoteBells) && remoteBells.length > 0) return remoteBells;
    if (Array.isArray(bellScheduleSetting?.value)) return bellScheduleSetting.value;
    return [];
  }, [remoteBells, bellScheduleSetting?.value]);
  
  // Query all database records for select tags
  const teachersInDB = useLiveQuery(() => db.teachers.toArray()) || [];
  const classesInDB = useLiveQuery(() => db.classes.toArray()) || [];
  const subjectsInDB = useLiveQuery(() => db.subjects.toArray()) || [];
  const studentsInDB = useLiveQuery(() => db.students.toArray()) || [];

  const activeSchoolId = useMemo(() => {
    const candidates = [
      school?.id,
      (user as any)?.school_id,
      (user as any)?.schoolId,
      typeof localStorage !== 'undefined' ? localStorage.getItem('esepa_active_school_id') : null,
      (classesInDB[0] as any)?.school_id,
      (classesInDB[0] as any)?.schoolId,
      (subjectsInDB[0] as any)?.school_id,
      (subjectsInDB[0] as any)?.schoolId,
      (teachersInDB[0] as any)?.school_id,
      (teachersInDB[0] as any)?.schoolId
    ];
    for (const c of candidates) {
      const str = String(c || '').trim();
      if (str && str !== '00000000-0000-0000-0000-000000000001' && /^[0-9a-f-]{36}$/i.test(str)) {
        return str;
      }
    }
    return '';
  }, [school?.id, user, classesInDB, subjectsInDB, teachersInDB]);

  const isStudent = user?.role === 'student';
  const isParent = user?.role === 'parent';
  const isTeacher = user?.role === 'teacher';
  const isAdmin = user?.role === 'super_admin' || user?.role === 'creator' || user?.role === 'admin' || user?.role === 'headteacher';

  // Find student record matching current user's full name to identify their class
  const studentRecord = useMemo(() => {
    if (isStudent && user?.fullName) {
      const cleanName = user.fullName.replace(/\s*\(Student\)/i, '').trim().toLowerCase();
      return studentsInDB.find(s => {
        const full = `${s.firstName} ${s.lastName}`.toLowerCase().trim();
        return full.includes(cleanName) || cleanName.includes(full);
      });
    }
    return null;
  }, [isStudent, user?.fullName, studentsInDB]);

  const studentClass = studentRecord?.class || 'P1';

  // Match current parent user to children/wards
  const parentWards = useMemo(() => {
    if (isParent && user?.fullName && studentsInDB.length > 0) {
      const cleanParentName = user.fullName.replace(/\s*\(Parent\)/i, '').trim().toLowerCase();
      return studentsInDB.filter(s => {
        const guardian = (s.guardianName || '').toLowerCase().trim();
        return guardian.includes(cleanParentName) || cleanParentName.includes(guardian);
      });
    }
    return [];
  }, [isParent, user?.fullName, studentsInDB]);

  const parentWardsClasses = useMemo(() => {
    return Array.from(new Set(parentWards.map(w => w.class))).filter(Boolean);
  }, [parentWards]);

  // Sync class filter and view for student and parent roles
  useEffect(() => {
    if (isStudent) {
      setSelectedClassFilter(studentClass);
      setSelectedClassForGrid(studentClass);
    } else if (isParent && parentWardsClasses.length > 0) {
      setSelectedClassFilter(parentWardsClasses[0]);
      setSelectedClassForGrid(parentWardsClasses[0]);
    }
  }, [isStudent, studentClass, isParent, parentWardsClasses]);

  // Keep non-admins away from admin-only tabs
  useEffect(() => {
    if ((isStudent || isParent || isTeacher) && (activeTab === 'manage' || activeTab === 'diagnose')) {
      setActiveTab('view');
    }
  }, [isStudent, isParent, isTeacher, activeTab]);

  const getSlotSignature = useCallback((s: TimetableSlot) => {
    return `${String(s.classId || '').trim().toLowerCase()}|${String(s.day || '').trim().toLowerCase()}|${String(s.startTime || '').slice(0, 5)}|${String(s.endTime || '').slice(0, 5)}|${String(s.subjectName || '').trim().toLowerCase()}`;
  }, []);

  // Helper to update local Dexie read-through cache after Supabase confirmation
  const persistLocalTimetableCache = useCallback(async (nextSlots: TimetableSlot[], nextSuggestions: any[]) => {
    try {
      const existingSlotSetting = await db.settings.where('key').equals('timetable_slots').first();
      if (existingSlotSetting && existingSlotSetting.id !== undefined) {
        await db.settings.update(existingSlotSetting.id, { value: nextSlots });
      } else {
        await db.settings.add({ key: 'timetable_slots', value: nextSlots });
      }

      const existingSugSetting = await db.settings.where('key').equals('timetable_suggestions').first();
      if (existingSugSetting && existingSugSetting.id !== undefined) {
        await db.settings.update(existingSugSetting.id, { value: nextSuggestions });
      } else {
        await db.settings.add({ key: 'timetable_suggestions', value: nextSuggestions });
      }
    } catch (e) {
      console.warn('Notice updating local timetable read-through cache:', e);
    }
  }, []);

  const applyRemoteReferenceLists = useCallback((payload: any) => {
    if (!payload) return;
    if (Array.isArray(payload.periods)) {
      setRemotePeriods(
        payload.periods
          .filter((p: any) => !p?.is_break && !p?.isBreak)
          .map((p: any) => {
            const rawStart = String(p?.startTime || p?.start_time || '08:00').trim().slice(0, 5);
            const rawEnd = String(p?.endTime || p?.end_time || '08:45').trim().slice(0, 5);
            const startTime = rawStart === '00:00' ? '08:00' : rawStart;
            const endTime = rawStart === '00:00' ? '08:45' : rawEnd;
            const rawName = String(p?.name || `${startTime} - ${endTime}`).trim();

            // Parse encoded shared metadata from period name ("Mon 08:00-08:45|JHS 3|Mathematics") if present
            let parsedDay: TimetableSlot['day'] | undefined;
            let parsedClass = '';
            let parsedSubject = '';
            if (rawName.includes('|')) {
              const parts = rawName.split('|').map(s => s.trim());
              const dayPrefix = (parts[0] || '').split(/\s+/)[0]?.toLowerCase();
              const dayMap: Record<string, TimetableSlot['day']> = {
                mon: 'Monday',
                monday: 'Monday',
                tue: 'Tuesday',
                tuesday: 'Tuesday',
                wed: 'Wednesday',
                wednesday: 'Wednesday',
                thu: 'Thursday',
                thursday: 'Thursday',
                fri: 'Friday',
                friday: 'Friday'
              };
              if (dayPrefix && dayMap[dayPrefix]) {
                parsedDay = dayMap[dayPrefix];
              }
              parsedClass = parts[1] || '';
              parsedSubject = parts[2] || '';
            }

            return {
              id: p?.id ?? p?.periodId ?? p?.period_id,
              periodId: p?.periodId ?? p?.period_id ?? p?.id,
              entryId: p?.entryId ?? p?.entry_id ?? p?.slotId ?? p?.slot_id,
              name: rawName,
              startTime,
              endTime,
              day: p?.day || parsedDay,
              classId: String(p?.classId || p?.class_id || p?.class_name || parsedClass || '').trim(),
              subjectName: String(p?.subjectName || p?.subject_name || parsedSubject || '').trim(),
              teacherName: String(p?.teacherName || p?.teacher_name || '').trim(),
              room: String(p?.room || 'Room A').trim(),
              notes: String(p?.notes || '').trim()
            };
          })
          .filter((p: any) => Boolean(p.startTime && p.endTime))
      );
    }
    if (Array.isArray(payload.classes)) {
      setRemoteClasses(
        payload.classes
          .map((c: any) => ({
            name: String(c?.name || '').trim(),
            level: String(c?.level || c?.name || '').trim()
          }))
          .filter((c: any) => Boolean(c.name))
      );
    }
    if (Array.isArray(payload.subjects)) {
      setRemoteSubjects(
        payload.subjects
          .map((s: any) => ({
            name: String(s?.name || '').trim(),
            code: String(s?.code || '').trim(),
            applicableClasses: Array.isArray(s?.applicableClasses || s?.applicable_classes)
              ? (s.applicableClasses || s.applicable_classes).map((ac: any) => String(ac || '').trim()).filter(Boolean)
              : []
          }))
          .filter((s: any) => Boolean(s.name))
      );
    }
    if (Array.isArray(payload.teachers)) {
      setRemoteTeachers(
        payload.teachers
          .map((t: any) => {
            const firstName = String(t?.firstName || t?.first_name || '').trim();
            const lastName = String(t?.lastName || t?.last_name || '').trim();
            const fullName = String(t?.fullName || `${firstName} ${lastName}`).trim();
            const assignedClasses = Array.isArray(t?.assignedClasses || t?.assigned_classes)
              ? (t.assignedClasses || t.assigned_classes).map((ac: any) => String(ac || '').trim()).filter(Boolean)
              : [];
            const subjects = Array.isArray(t?.subjects)
              ? t.subjects.map((sub: any) => String(sub || '').trim()).filter(Boolean)
              : [];
            return { fullName, firstName, lastName, assignedClasses, subjects };
          })
          .filter((t: any) => Boolean(t.fullName))
      );
    }
    if (Array.isArray(payload.bellSchedule)) {
      setRemoteBells(payload.bellSchedule);
      (async () => {
        try {
          const existingBellSetting = await db.settings.where('key').equals('bellSchedule').first();
          if (existingBellSetting && existingBellSetting.id !== undefined) {
            await db.settings.update(existingBellSetting.id, { value: payload.bellSchedule });
          } else {
            await db.settings.add({ key: 'bellSchedule', value: payload.bellSchedule });
          }
        } catch {}
      })();
    }
  }, []);

  // Normalize raw database row into frontend TimetableSlot shape
  const normalizeSlotFromRow = useCallback((raw: any): TimetableSlot => {
    const validDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] as const;
    const numToDay: Record<number, TimetableSlot['day']> = {
      1: 'Monday',
      2: 'Tuesday',
      3: 'Wednesday',
      4: 'Thursday',
      5: 'Friday'
    };
    const rawDay = typeof raw?.day_of_week === 'number' && numToDay[raw.day_of_week]
      ? numToDay[raw.day_of_week]
      : String(raw?.day || 'Monday').trim();
    const day = (validDays.includes(rawDay as any) ? rawDay : 'Monday') as TimetableSlot['day'];
    const rawStart = String(raw?.startTime || raw?.start_time || '08:00').trim().slice(0, 5);
    const rawEnd = String(raw?.endTime || raw?.end_time || '08:45').trim().slice(0, 5);
    const normStart = rawStart === '00:00' ? '08:00' : rawStart;
    const normEnd = rawStart === '00:00' ? '08:45' : rawEnd;
    return {
      id: String(raw?.id || raw?.slot_id || raw?.slotId || raw?.entryId || raw?.entry_id || `slot-${Date.now()}`),
      classId: String(raw?.classId || raw?.class_id || raw?.class_name || '').trim(),
      subjectName: String(raw?.subjectName || raw?.subject_name || '').trim(),
      teacherName: String(raw?.teacherName || raw?.teacher_name || '').trim(),
      day,
      startTime: normStart,
      endTime: normEnd,
      room: String(raw?.room || 'Room A').trim() || 'Room A',
      notes: raw?.notes ? String(raw.notes).trim() : ''
    };
  }, []);

  const normalizeSuggestionFromRow = useCallback((raw: any) => {
    const validDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] as const;
    const rawDay = String(raw?.day || 'Monday').trim();
    const day = (validDays.includes(rawDay as any) ? rawDay : 'Monday') as TimetableSlot['day'];
    const rawStart = String(raw?.startTime || raw?.start_time || '08:00').trim().slice(0, 5);
    const rawEnd = String(raw?.endTime || raw?.end_time || '08:45').trim().slice(0, 5);
    return {
      id: String(raw?.id || raw?.suggestion_id || raw?.suggestionId || `sug-${Date.now()}`),
      classId: String(raw?.classId || raw?.class_id || raw?.class_name || '').trim(),
      subjectName: String(raw?.subjectName || raw?.subject_name || '').trim(),
      teacherName: String(raw?.teacherName || raw?.teacher_name || '').trim(),
      day,
      startTime: rawStart === '00:00' ? '08:00' : rawStart,
      endTime: rawStart === '00:00' ? '08:45' : rawEnd,
      room: String(raw?.room || 'Room A').trim() || 'Room A',
      notes: raw?.notes ? String(raw.notes).trim() : '',
      status: raw?.status === 'approved' || raw?.status === 'rejected' ? raw.status : 'pending',
      suggestedBy: String(raw?.suggestedBy || raw?.suggested_by || 'Teacher').trim(),
      createdAt: Number(raw?.createdAt || raw?.created_at || Date.now())
    };
  }, []);

  // Fetch timetable slots & suggestions from Supabase and auto-migrate any unsynced local entries
  const fetchTimetableFromSupabase = useCallback(async (manualRefresh = false) => {
    setSyncState('loading');
    try {
      const localSlotSetting = await db.settings.where('key').equals('timetable_slots').first();
      const localSlots: TimetableSlot[] = Array.isArray(localSlotSetting?.value)
        ? localSlotSetting.value.map(normalizeSlotFromRow).filter((s: TimetableSlot) => Boolean(s.classId && s.subjectName))
        : [];

      const localSugSetting = await db.settings.where('key').equals('timetable_suggestions').first();
      const localSuggestions: any[] = Array.isArray(localSugSetting?.value)
        ? localSugSetting.value.map(normalizeSuggestionFromRow).filter((s: any) => Boolean(s.classId && s.subjectName))
        : [];

      let fetchedSlots: TimetableSlot[] = [];
      let fetchedSuggestions: any[] = [];
      let fetchedOk = false;

      // 1. Primary fetch via Backend Supabase API (/api/timetable)
      try {
        const res = await fetch(`/api/timetable?school_id=${encodeURIComponent(activeSchoolId)}`, {
          headers: getApiHeaders(activeSchoolId)
        });
        if (res.ok) {
          const json = await res.json();
          if (json && json.success) {
            fetchedSlots = Array.isArray(json.slots) ? json.slots.map(normalizeSlotFromRow) : [];
            fetchedSuggestions = Array.isArray(json.suggestions) ? json.suggestions.map(normalizeSuggestionFromRow) : [];
            applyRemoteReferenceLists(json);
            fetchedOk = true;
          }
        }
      } catch (apiErr) {
        console.warn('Notice fetching /api/timetable, trying direct Supabase client:', apiErr);
      }

      // 2. Direct Supabase client fallback (queries timetable_entries & timetable_periods) if Express route is unreachable
      if (!fetchedOk && activeSchoolId) {
        const [entriesRes, periodsRes, classesRes, subjectsRes, teachersRes] = await Promise.all([
          supabase.from('timetable_entries').select('*').eq('school_id', activeSchoolId),
          supabase.from('timetable_periods').select('*').eq('school_id', activeSchoolId),
          supabase.from('classes').select('id, name, level').eq('school_id', activeSchoolId),
          supabase.from('subjects').select('id, name, code, applicable_classes').eq('school_id', activeSchoolId),
          supabase.from('teachers').select('id, staff_id, first_name, last_name, assigned_classes, subjects').eq('school_id', activeSchoolId)
        ]);
        if (!entriesRes.error && Array.isArray(entriesRes.data)) {
          const periodsMap = new Map((periodsRes.data || []).map((p: any) => [Number(p.id), p]));
          const subjectsMap = new Map((subjectsRes.data || []).map((s: any) => [Number(s.id), s]));
          const teachersMap = new Map((teachersRes.data || []).map((t: any) => [Number(t.id), t]));

          applyRemoteReferenceLists({
            periods: periodsRes.data || [],
            classes: classesRes.data || [],
            subjects: subjectsRes.data || [],
            teachers: teachersRes.data || []
          });

          fetchedSlots = entriesRes.data.map((entry: any) => {
            const p: any = periodsMap.get(Number(entry.period_id));
            const s: any = subjectsMap.get(Number(entry.subject_id));
            const t: any = teachersMap.get(Number(entry.teacher_id));
            return normalizeSlotFromRow({
              id: String(entry.id),
              class_name: entry.class_name,
              day_of_week: entry.day_of_week,
              start_time: p?.start_time || '08:00',
              end_time: p?.end_time || '08:45',
              subjectName: s?.name || 'General Subject',
              teacherName: t ? `${t.first_name || ''} ${t.last_name || ''}`.trim() : 'Assigned Teacher',
              room: entry.room || 'Room A'
            });
          });
          fetchedOk = true;
        }
      }

      if (!fetchedOk) {
        setSyncState('error');
        if (manualRefresh) {
          showToast('Could not reach Supabase to refresh timetable.', 'error');
        }
        return;
      }

      // Record all remote IDs and semantic signatures so we know what is already in Supabase
      const remoteSlotIds = new Set(fetchedSlots.map(s => s.id));
      const remoteSlotSignatures = new Set(fetchedSlots.map(getSlotSignature));
      const remoteSugIds = new Set(fetchedSuggestions.map(s => s.id));

      fetchedSlots.forEach(s => {
        migratedIdsRef.current.add(s.id);
        migratedIdsRef.current.add(getSlotSignature(s));
      });
      fetchedSuggestions.forEach(s => migratedIdsRef.current.add(s.id));

      // Check for existing local entries that haven't been pushed to Supabase yet
      const unsyncedLocalSlots = localSlots.filter(s => {
        const sig = getSlotSignature(s);
        return (
          !remoteSlotIds.has(s.id) &&
          !remoteSlotSignatures.has(sig) &&
          !migratedIdsRef.current.has(s.id) &&
          !migratedIdsRef.current.has(sig)
        );
      });
      const unsyncedLocalSuggestions = localSuggestions.filter(
        s => !remoteSugIds.has(s.id) && !migratedIdsRef.current.has(s.id)
      );

      if (unsyncedLocalSlots.length > 0 || unsyncedLocalSuggestions.length > 0) {
        try {
          const syncRes = await fetch('/api/timetable/sync', {
            method: 'POST',
            headers: getApiHeaders(activeSchoolId),
            body: JSON.stringify({
              school_id: activeSchoolId,
              slots: unsyncedLocalSlots,
              suggestions: unsyncedLocalSuggestions
            })
          });
          if (syncRes.ok) {
            const syncJson = await syncRes.json();
            if (syncJson && syncJson.success) {
              unsyncedLocalSlots.forEach(s => {
                migratedIdsRef.current.add(s.id);
                migratedIdsRef.current.add(getSlotSignature(s));
              });
              unsyncedLocalSuggestions.forEach(s => migratedIdsRef.current.add(s.id));
              fetchedSlots = Array.isArray(syncJson.slots) ? syncJson.slots.map(normalizeSlotFromRow) : [...fetchedSlots, ...unsyncedLocalSlots];
              fetchedSuggestions = Array.isArray(syncJson.suggestions) ? syncJson.suggestions.map(normalizeSuggestionFromRow) : [...fetchedSuggestions, ...unsyncedLocalSuggestions];
              applyRemoteReferenceLists(syncJson);
            }
          } else {
            // Keep local slots intact if sync endpoint returned an error
            fetchedSlots = [...fetchedSlots, ...unsyncedLocalSlots];
            fetchedSuggestions = [...fetchedSuggestions, ...unsyncedLocalSuggestions];
          }
        } catch (syncErr) {
          console.warn('Notice auto-migrating local timetable entries to Supabase:', syncErr);
          fetchedSlots = [...fetchedSlots, ...unsyncedLocalSlots];
          fetchedSuggestions = [...fetchedSuggestions, ...unsyncedLocalSuggestions];
        }
      }

      setRemoteSlots(fetchedSlots);
      setRemoteSuggestions(fetchedSuggestions);
      await persistLocalTimetableCache(fetchedSlots, fetchedSuggestions);
      setSyncState('synced');
      if (manualRefresh) {
        showToast('Timetable synchronized with Supabase.', 'success');
      }
    } catch (err) {
      console.error('Failed to synchronize timetable with Supabase:', err);
      setSyncState('error');
    }
  }, [activeSchoolId, applyRemoteReferenceLists, getSlotSignature, normalizeSlotFromRow, normalizeSuggestionFromRow, persistLocalTimetableCache, showToast]);

  useEffect(() => {
    fetchTimetableFromSupabase(false);
  }, [fetchTimetableFromSupabase]);

  // Unified Timetable Slots & Periods (guarantees timetable_entries and timetable_periods share identical data in UI and Quick Suggestions)
  const timetableSetting = settings.find(s => s.key === 'timetable_slots');
  const activeSlotsSource: TimetableSlot[] = useMemo(() => {
    const baseSlots: TimetableSlot[] = remoteSlots !== null
      ? remoteSlots
      : (Array.isArray(timetableSetting?.value) ? timetableSetting.value.map(normalizeSlotFromRow) : []);
    const bySig = new Map<string, TimetableSlot>();
    baseSlots.forEach(s => {
      if (s && s.classId && s.subjectName) {
        bySig.set(getSlotSignature(s), s);
      }
    });
    // Also merge any period records that carry slot details so timetable_periods and timetable_entries never diverge
    remotePeriods.forEach(p => {
      if (p.classId && p.subjectName) {
        const candidate = normalizeSlotFromRow({
          id: p.entryId || p.id,
          classId: p.classId,
          subjectName: p.subjectName,
          teacherName: p.teacherName || 'Assigned Teacher',
          day: p.day || 'Monday',
          startTime: p.startTime,
          endTime: p.endTime,
          room: p.room || 'Room A',
          notes: p.notes || ''
        });
        const sig = getSlotSignature(candidate);
        if (!bySig.has(sig)) {
          bySig.set(sig, candidate);
        }
      }
    });
    return Array.from(bySig.values());
  }, [remoteSlots, timetableSetting?.value, normalizeSlotFromRow, getSlotSignature, remotePeriods]);

  const slots: TimetableSlot[] = listSlotsSorted(activeSlotsSource);

  // Unified normalized periods list (combines Supabase timetable_periods + synced timetable_entries so periods is always defined and in parity with slots)
  const periods = useMemo(() => {
    const unified: Array<{
      id: string;
      name: string;
      startTime: string;
      endTime: string;
      day: TimetableSlot['day'];
      classId: string;
      subjectName: string;
      teacherName: string;
      room: string;
      notes: string;
    }> = [];
    const seenKeys = new Set<string>();

    remotePeriods.forEach((p, idx) => {
      const startTime = String(p.startTime || '08:00').slice(0, 5);
      const endTime = String(p.endTime || '08:45').slice(0, 5);
      const classId = String(p.classId || '').trim();
      const subjectName = String(p.subjectName || '').trim();
      const day = (p.day || 'Monday') as TimetableSlot['day'];
      const key = `${day.toLowerCase()}|${startTime}|${endTime}|${classId.toLowerCase()}|${subjectName.toLowerCase()}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        unified.push({
          id: String(p.id ?? p.periodId ?? `period-${idx}`),
          name: String(p.name || `${startTime} - ${endTime}`).trim(),
          startTime,
          endTime,
          day,
          classId,
          subjectName,
          teacherName: String(p.teacherName || '').trim(),
          room: String(p.room || 'Room A').trim(),
          notes: String(p.notes || '').trim()
        });
      }
    });

    slots.forEach((s, idx) => {
      const startTime = String(s.startTime || '08:00').slice(0, 5);
      const endTime = String(s.endTime || '08:45').slice(0, 5);
      const classId = String(s.classId || '').trim();
      const subjectName = String(s.subjectName || '').trim();
      const day = s.day || 'Monday';
      const key = `${day.toLowerCase()}|${startTime}|${endTime}|${classId.toLowerCase()}|${subjectName.toLowerCase()}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        unified.push({
          id: String(s.id || `slot-period-${idx}`),
          name: `${day.slice(0, 3)} ${startTime}-${endTime}|${classId}|${subjectName}`,
          startTime,
          endTime,
          day,
          classId,
          subjectName,
          teacherName: String(s.teacherName || '').trim(),
          room: String(s.room || 'Room A').trim(),
          notes: String(s.notes || '').trim()
        });
      }
    });

    return unified;
  }, [remotePeriods, slots]);

  const suggestionsSetting = settings.find(s => s.key === 'timetable_suggestions');
  const suggestions: any[] = remoteSuggestions !== null ? remoteSuggestions : (suggestionsSetting?.value || []);

  // Reactive check: if Dexie settings finish loading local slots after initial mount, auto-push them to Supabase
  useEffect(() => {
    if (syncState !== 'synced' || remoteSlots === null) return;
    const localRaw: any[] = Array.isArray(timetableSetting?.value) ? timetableSetting.value : [];
    if (localRaw.length === 0) return;

    const remoteSigs = new Set(remoteSlots.map(getSlotSignature));
    const remoteIds = new Set(remoteSlots.map(s => s.id));
    const hasUnmigratedLocal = localRaw.some((raw: any) => {
      const norm = normalizeSlotFromRow(raw);
      if (!norm.classId || !norm.subjectName) return false;
      const sig = getSlotSignature(norm);
      return (
        !remoteIds.has(norm.id) &&
        !remoteSigs.has(sig) &&
        !migratedIdsRef.current.has(norm.id) &&
        !migratedIdsRef.current.has(sig)
      );
    });

    if (hasUnmigratedLocal) {
      fetchTimetableFromSupabase(false);
    }
  }, [timetableSetting?.value, remoteSlots, syncState, getSlotSignature, normalizeSlotFromRow, fetchTimetableFromSupabase]);

  function listSlotsSorted(arr: TimetableSlot[]): TimetableSlot[] {
    return [...arr].sort((a, b) => {
      const timeDiff = a.startTime.localeCompare(b.startTime);
      if (timeDiff !== 0) return timeDiff;
      return a.day.localeCompare(b.day);
    });
  }

  // Merged Classes, Subjects & Teachers from Supabase + Local DB + Active Timetable Slots
  const classesList = useMemo(() => {
    if (isParent) {
      return parentWardsClasses;
    }
    const map = new Map<string, string>();
    const addClass = (raw: string | undefined) => {
      const clean = String(raw || '').trim();
      if (!clean) return;
      const key = clean.toLowerCase();
      if (!map.has(key)) map.set(key, clean);
    };
    remoteClasses.forEach(c => addClass(c.name));
    classesInDB.forEach(c => addClass(c.name));
    studentsInDB.forEach(s => addClass(s.class));
    remoteTeachers.forEach(t => (t.assignedClasses || []).forEach(addClass));
    teachersInDB.forEach(t => (t.assignedClasses || []).forEach(addClass));
    remoteSubjects.forEach(s => (s.applicableClasses || []).forEach(c => {
      if (String(c).toLowerCase() !== 'all') addClass(c);
    }));
    subjectsInDB.forEach(s => (s.applicableClasses || []).forEach(c => {
      if (String(c).toLowerCase() !== 'all') addClass(c);
    }));
    slots.forEach(s => addClass(s.classId));
    return Array.from(map.values()).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [isParent, parentWardsClasses, remoteClasses, classesInDB, studentsInDB, remoteTeachers, teachersInDB, remoteSubjects, subjectsInDB, slots]);

  // Unified Subject Catalog with Applicable Classes (merged from Supabase subjects, local subjects, teacher assignments, and scheduled slots)
  const mergedSubjectsCatalog = useMemo(() => {
    const map = new Map<string, { name: string; applicableClasses: Set<string>; isUniversal: boolean }>();
    const ensureSubj = (rawName: string | undefined) => {
      const clean = String(rawName || '').trim();
      if (!clean) return null;
      const key = clean.toLowerCase();
      if (!map.has(key)) {
        map.set(key, { name: clean, applicableClasses: new Set<string>(), isUniversal: false });
      }
      return map.get(key)!;
    };

    const mergeSubjRecord = (name: string, appClasses: string[] | undefined) => {
      const entry = ensureSubj(name);
      if (!entry) return;
      const list = Array.isArray(appClasses) ? appClasses.map(c => String(c || '').trim()).filter(Boolean) : [];
      if (list.length === 0 || list.some(c => c.toLowerCase() === 'all')) {
        entry.isUniversal = true;
      } else {
        list.forEach(c => entry.applicableClasses.add(c.toLowerCase()));
      }
    };

    remoteSubjects.forEach(s => mergeSubjRecord(s.name, s.applicableClasses));
    subjectsInDB.forEach(s => mergeSubjRecord(s.name, s.applicableClasses));

    // Also link subjects taught by teachers assigned to specific classes
    const linkTeacherSubjClasses = (subjNames: string[] | undefined, classNames: string[] | undefined) => {
      const sList = Array.isArray(subjNames) ? subjNames : [];
      const cList = Array.isArray(classNames) ? classNames : [];
      sList.forEach(sName => {
        const entry = ensureSubj(sName);
        if (!entry) return;
        cList.forEach(cName => {
          const cleanC = String(cName || '').trim();
          if (cleanC && cleanC.toLowerCase() !== 'all') {
            entry.applicableClasses.add(cleanC.toLowerCase());
          } else if (cleanC.toLowerCase() === 'all') {
            entry.isUniversal = true;
          }
        });
      });
    };
    remoteTeachers.forEach(t => linkTeacherSubjClasses(t.subjects, t.assignedClasses));
    teachersInDB.forEach(t => linkTeacherSubjClasses(t.subjects, t.assignedClasses));

    // Also link from active scheduled slots
    slots.forEach(s => {
      const entry = ensureSubj(s.subjectName);
      if (entry && s.classId) {
        entry.applicableClasses.add(s.classId.trim().toLowerCase());
      }
    });

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [remoteSubjects, subjectsInDB, remoteTeachers, teachersInDB, slots]);

  // Unified Teacher Catalog with Assigned Classes & Subjects (merged from Supabase teachers, local teachers, and scheduled slots)
  const mergedTeachersCatalog = useMemo(() => {
    const map = new Map<string, { fullName: string; assignedClasses: Set<string>; subjects: Set<string>; classSubjectPairs: Set<string> }>();
    const ensureTeacher = (rawName: string | undefined) => {
      const clean = String(rawName || '').trim().replace(/\s+/g, ' ');
      if (!clean) return null;
      const key = clean.toLowerCase();
      if (!map.has(key)) {
        map.set(key, {
          fullName: clean,
          assignedClasses: new Set<string>(),
          subjects: new Set<string>(),
          classSubjectPairs: new Set<string>()
        });
      }
      return map.get(key)!;
    };

    const mergeTeacherRecord = (fullName: string, assignedClasses: string[] | undefined, teacherSubjects: string[] | undefined) => {
      const entry = ensureTeacher(fullName);
      if (!entry) return;
      (assignedClasses || []).forEach(c => {
        const cleanC = String(c || '').trim().toLowerCase();
        if (cleanC) entry.assignedClasses.add(cleanC);
      });
      (teacherSubjects || []).forEach(s => {
        const cleanS = String(s || '').trim().toLowerCase();
        if (cleanS) entry.subjects.add(cleanS);
      });
    };

    remoteTeachers.forEach(t => mergeTeacherRecord(t.fullName, t.assignedClasses, t.subjects));
    teachersInDB.forEach(t => mergeTeacherRecord(`${t.firstName} ${t.lastName}`, t.assignedClasses, t.subjects));

    slots.forEach(s => {
      const entry = ensureTeacher(s.teacherName);
      if (!entry) return;
      const cKey = String(s.classId || '').trim().toLowerCase();
      const sKey = String(s.subjectName || '').trim().toLowerCase();
      if (cKey) entry.assignedClasses.add(cKey);
      if (sKey) entry.subjects.add(sKey);
      if (cKey && sKey) entry.classSubjectPairs.add(`${cKey}|${sKey}`);
    });

    return Array.from(map.values()).sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [remoteTeachers, teachersInDB, slots]);

  const subjectsList = useMemo(() => mergedSubjectsCatalog.map(s => s.name), [mergedSubjectsCatalog]);
  const teachersList = useMemo(() => mergedTeachersCatalog.map(t => t.fullName), [mergedTeachersCatalog]);

  // Connected Cascade Helper 1: Given Target Class -> split subjects into Matching for Class vs Other Subjects
  const getSubjectsForClass = useCallback((targetClass: string) => {
    const cleanClass = String(targetClass || '').trim().toLowerCase();
    if (!cleanClass) {
      return {
        matched: mergedSubjectsCatalog.map(s => s.name),
        others: [] as string[]
      };
    }

    const matched: string[] = [];
    const others: string[] = [];

    for (const subj of mergedSubjectsCatalog) {
      const appliesDirectly = subj.applicableClasses.has(cleanClass);
      const appliesUniversally = subj.isUniversal && subj.applicableClasses.size === 0;
      const isTaughtInClassByTeacher = mergedTeachersCatalog.some(
        t => (t.assignedClasses.has(cleanClass) || t.assignedClasses.has('all')) && t.subjects.has(subj.name.toLowerCase())
      );

      if (appliesDirectly || appliesUniversally || isTaughtInClassByTeacher) {
        matched.push(subj.name);
      } else {
        others.push(subj.name);
      }
    }

    // If no subject had specific class metadata yet, treat all subjects as matched
    if (matched.length === 0 && others.length > 0) {
      return { matched: others, others: [] as string[] };
    }

    return { matched, others };
  }, [mergedSubjectsCatalog, mergedTeachersCatalog]);

  // Connected Cascade Helper 2: Given Target Class + Subject -> rank teachers into Exact Match (Class + Subject), Partial Match (Subject or Class), and Others
  const getTeachersForClassAndSubject = useCallback((targetClass: string, targetSubject: string) => {
    const cleanClass = String(targetClass || '').trim().toLowerCase();
    const cleanSubject = String(targetSubject || '').trim().toLowerCase();

    const exactMatch: string[] = [];
    const subjectMatch: string[] = [];
    const classMatch: string[] = [];
    const others: string[] = [];

    for (const t of mergedTeachersCatalog) {
      const hasPair = cleanClass && cleanSubject && t.classSubjectPairs.has(`${cleanClass}|${cleanSubject}`);
      const hasClass = Boolean(cleanClass) && (t.assignedClasses.has(cleanClass) || t.assignedClasses.has('all'));
      const hasSubject = Boolean(cleanSubject) && (t.subjects.has(cleanSubject) || t.subjects.has('all'));

      if (hasPair || (hasClass && hasSubject)) {
        exactMatch.push(t.fullName);
      } else if (hasSubject) {
        subjectMatch.push(t.fullName);
      } else if (hasClass) {
        classMatch.push(t.fullName);
      } else {
        others.push(t.fullName);
      }
    }

    return {
      exactMatch,
      subjectOrClassMatch: [...subjectMatch, ...classMatch],
      others
    };
  }, [mergedTeachersCatalog]);

  const roomsList = Array.from(new Set([
    "Room A", "Room B", "Room C", "Science Lab", "ICT Suite", "Library", "Assembly Hall",
    ...slots.map(s => s.room)
  ])).sort();

  // Parse hour/minute into absolute minutes since midnight (important for collision overlaps)
  const toMinutes = (timeStr: string) => {
    const [h, m] = timeStr.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  };

  // Unified Period Presets: uses existing database periods & entries first, falling back to standard 45-min school slots only when empty
  const standardPeriodFallbacks = useMemo(() => [
    { label: 'Period 1', startTime: '08:00', endTime: '08:45', fromDatabase: false },
    { label: 'Period 2', startTime: '08:45', endTime: '09:30', fromDatabase: false },
    { label: 'Period 3', startTime: '09:30', endTime: '10:15', fromDatabase: false },
    { label: 'Period 4', startTime: '10:45', endTime: '11:30', fromDatabase: false },
    { label: 'Period 5', startTime: '11:30', endTime: '12:15', fromDatabase: false },
    { label: 'Period 6', startTime: '13:00', endTime: '13:45', fromDatabase: false },
    { label: 'Period 7', startTime: '13:45', endTime: '14:30', fromDatabase: false },
    { label: 'Period 8', startTime: '14:30', endTime: '15:15', fromDatabase: false }
  ], []);

  const periodPresets = useMemo(() => {
    const dbMap = new Map<string, {
      label: string;
      startTime: string;
      endTime: string;
      fromDatabase: boolean;
      sharedSummary?: string;
    }>();

    // 1. Collect all time windows from unified periods & entries (shared source of truth)
    periods.forEach((p, idx) => {
      if (!p.startTime || !p.endTime || p.startTime === '00:00') return;
      const key = `${p.startTime}-${p.endTime}`;
      const existing = dbMap.get(key);
      const summary = p.classId && p.subjectName ? `${p.classId} · ${p.subjectName}` : undefined;
      if (!existing) {
        dbMap.set(key, {
          label: `${p.startTime} - ${p.endTime}`,
          startTime: p.startTime,
          endTime: p.endTime,
          fromDatabase: true,
          sharedSummary: summary
        });
      } else if (!existing.sharedSummary && summary) {
        existing.sharedSummary = summary;
      }
    });

    slots.forEach((s) => {
      if (!s.startTime || !s.endTime || s.startTime === '00:00') return;
      const key = `${s.startTime}-${s.endTime}`;
      const existing = dbMap.get(key);
      const summary = s.classId && s.subjectName ? `${s.classId} · ${s.subjectName}` : undefined;
      if (!existing) {
        dbMap.set(key, {
          label: `${s.startTime} - ${s.endTime}`,
          startTime: s.startTime,
          endTime: s.endTime,
          fromDatabase: true,
          sharedSummary: summary
        });
      } else if (!existing.sharedSummary && summary) {
        existing.sharedSummary = summary;
      }
    });

    const sortedDbPresets = Array.from(dbMap.values())
      .sort((a, b) => a.startTime.localeCompare(b.startTime))
      .map((item, index) => ({
        ...item,
        label: `Period ${index + 1}`
      }));

    // Use existing periods from the database first; fallback to standard slots only when empty
    if (sortedDbPresets.length > 0) {
      return sortedDbPresets;
    }

    return standardPeriodFallbacks;
  }, [periods, slots, standardPeriodFallbacks]);

  const getTimeSlotsSorted = () => {
    const timeRanges = new Set<string>();
    periodPresets.forEach(p => {
      timeRanges.add(`${p.startTime} - ${p.endTime}`);
    });
    slots.forEach(s => {
      if (s.startTime && s.endTime && s.startTime !== '00:00') {
        timeRanges.add(`${s.startTime} - ${s.endTime}`);
      }
    });
    periods.forEach(p => {
      if (p.startTime && p.endTime && p.startTime !== '00:00') {
        timeRanges.add(`${p.startTime} - ${p.endTime}`);
      }
    });
    return Array.from(timeRanges).sort((a, b) => {
      const startA = a.split(' - ')[0] || '';
      const startB = b.split(' - ')[0] || '';
      return startA.localeCompare(startB);
    });
  };

  // Check custom collision logic and diagnostics
  const getCollisions = (allSlots: TimetableSlot[]) => {
    const collisionsList: Array<{
      type: 'Teacher Check' | 'Class Room Conflict' | 'Class Double-Booking';
      slotA: TimetableSlot;
      slotB: TimetableSlot;
      message: string;
    }> = [];

    for (let i = 0; i < allSlots.length; i++) {
      for (let j = i + 1; j < allSlots.length; j++) {
        const a = allSlots[i];
        const b = allSlots[j];

        // Must be on the same weekday to clash
        if (a.day !== b.day) continue;

        const startA = toMinutes(a.startTime);
        const endA = toMinutes(a.endTime);
        const startB = toMinutes(b.startTime);
        const endB = toMinutes(b.endTime);

        // Check if time intervals overlap: (startA < endB) && (startB < endA)
        const overlaps = startA < endB && startB < endA;
        if (!overlaps) continue;

        // Conflict Type 1: Teacher Conflict
        if (a.teacherName === b.teacherName && a.teacherName.trim() !== '') {
          collisionsList.push({
            type: 'Teacher Check',
            slotA: a,
            slotB: b,
            message: `Teacher ${a.teacherName} is assigned to schedule "${a.subjectName}" (${a.classId}) and "${b.subjectName}" (${b.classId}) at the same time: ${a.startTime}-${a.endTime}.`
          });
        }

        // Conflict Type 2: Class Conflict
        if (a.classId === b.classId && a.classId.trim() !== '') {
          collisionsList.push({
            type: 'Class Double-Booking',
            slotA: a,
            slotB: b,
            message: `Classroom "${a.classId}" has overlapping subjects scheduled: "${a.subjectName}" and "${b.subjectName}" from ${Math.max(startA, startB) === startA ? a.startTime : b.startTime}.`
          });
        }

        // Conflict Type 3: Room Occupancy Conflict
        if (a.room === b.room && a.room.trim() !== '') {
          collisionsList.push({
            type: 'Class Room Conflict',
            slotA: a,
            slotB: b,
            message: `Room "${a.room}" is double-booked for "${a.classId} (${a.subjectName})" and "${b.classId} (${b.subjectName})" at the same time.`
          });
        }
      }
    }

    return collisionsList;
  };

  const detectedConflicts = getCollisions(slots);

  // Form Submission — Saves directly to Supabase (timetable_periods & timetable_entries) and awaits confirmation
  const handleSaveSlot = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formClass.trim() || !formSubject.trim() || !formTeacher.trim()) {
      showToast("Please fill in the Class, Subject and Teacher fields.", "error");
      return;
    }

    const startMin = toMinutes(formStartTime);
    const endMin = toMinutes(formEndTime);
    if (endMin <= startMin) {
      showToast("The end time must be later than the start time.", "error");
      return;
    }

    if (isTeacher) {
      // Teachers suggest slots - check for collision in the situation of no collision
      const newSlotTemp: TimetableSlot = {
        id: `temp-${Date.now()}`,
        classId: formClass.trim(),
        subjectName: formSubject.trim(),
        teacherName: formTeacher.trim(),
        day: formDay,
        startTime: formStartTime,
        endTime: formEndTime,
        room: formRoom.trim() || 'Room A',
        notes: formNotes.trim()
      };

      const simulatedAllSlots = [...slots, newSlotTemp];
      const newConflicts = getCollisions(simulatedAllSlots);
      const directClashes = newConflicts.filter(c => c.slotA.id === newSlotTemp.id || c.slotB.id === newSlotTemp.id);

      if (directClashes.length > 0) {
        showToast(`Collision overlap detected! Teachers can only suggest slots in the situation of no collision. Conflict details: ${directClashes[0].message}`, "error");
        return;
      }

      const newSuggestion = {
        id: `sug-${Date.now()}`,
        classId: formClass.trim(),
        subjectName: formSubject.trim(),
        teacherName: formTeacher.trim(),
        day: formDay,
        startTime: formStartTime,
        endTime: formEndTime,
        room: formRoom.trim() || 'Room A',
        notes: formNotes.trim(),
        status: 'pending',
        suggestedBy: user?.fullName || 'Teacher',
        createdAt: Date.now()
      };

      setSyncState('saving');
      try {
        const res = await fetch('/api/timetable/suggestions', {
          method: 'POST',
          headers: getApiHeaders(activeSchoolId),
          body: JSON.stringify({
            ...newSuggestion,
            school_id: activeSchoolId
          })
        });

        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.success) {
          throw new Error(json?.error || 'Failed to save period suggestion to Supabase');
        }

        applyRemoteReferenceLists(json);
        const savedSuggestion = (json.suggestion || json.data)
          ? normalizeSuggestionFromRow(json.suggestion || json.data)
          : newSuggestion;
        migratedIdsRef.current.add(savedSuggestion.id);
        const updatedSug = Array.isArray(json.suggestions)
          ? json.suggestions.map(normalizeSuggestionFromRow)
          : [...suggestions.filter(s => s.id !== savedSuggestion.id), savedSuggestion];
        setRemoteSuggestions(updatedSug);
        await persistLocalTimetableCache(slots, updatedSug);
        setSyncState('synced');

        showToast("Period suggestion saved to Supabase and submitted to Admin!", "success");
        setIsFormOpen(false);
        resetForm();
        setActiveTab('suggestions');
      } catch (err: any) {
        setSyncState('error');
        showToast(err?.message || "Failed to save suggestion to Supabase. Please retry.", "error");
      }
      return;
    }

    const newSlot: TimetableSlot = {
      id: editingSlotId || `slot-${Date.now()}`,
      classId: formClass.trim(),
      subjectName: formSubject.trim(),
      teacherName: formTeacher.trim(),
      day: formDay,
      startTime: formStartTime,
      endTime: formEndTime,
      room: formRoom.trim() || 'Room A',
      notes: formNotes.trim()
    };

    // Calculate conflict check BEFORE adding, to trigger reactive alert popups
    const potentialFutureSlots = slots.filter(s => s.id !== newSlot.id);
    const simulatedAllSlots = [...potentialFutureSlots, newSlot];
    const newConflicts = getCollisions(simulatedAllSlots);
    const directClashes = newConflicts.filter(c => c.slotA.id === newSlot.id || c.slotB.id === newSlot.id);

    if (directClashes.length > 0) {
      const confirmForce = await confirm({
        title: "Timetable Slot Overlap Found",
        message: `Scheduling this slot will create ${directClashes.length} collision warning(s) in your timetable:\n\n${directClashes.map(d => `• ${d.message}`).join('\n')}\n\nDo you want to ignore and schedule this slot anyway?`,
        confirmLabel: "Force Add Overlap Cluster"
      });
      if (!confirmForce) return;
    }

    setSyncState('saving');
    try {
      const endpoint = editingSlotId
        ? `/api/timetable/slots/${encodeURIComponent(editingSlotId)}`
        : '/api/timetable/slots';
      const method = editingSlotId ? 'PUT' : 'POST';

      const res = await fetch(endpoint, {
        method,
        headers: getApiHeaders(activeSchoolId),
        body: JSON.stringify({
          ...newSlot,
          school_id: activeSchoolId
        })
      });

      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || 'Failed to save timetable slot to Supabase');
      }

      const rawSaved = json.slot || json.data || newSlot;
      const savedSlot = normalizeSlotFromRow(rawSaved);
      migratedIdsRef.current.add(savedSlot.id);
      migratedIdsRef.current.add(getSlotSignature(savedSlot));
      applyRemoteReferenceLists(json);

      const updatedSlots = Array.isArray(json.slots)
        ? json.slots.map(normalizeSlotFromRow)
        : editingSlotId
        ? slots.map(s => s.id === editingSlotId ? savedSlot : s)
        : [...slots.filter(s => s.id !== savedSlot.id), savedSlot];

      setRemoteSlots(updatedSlots);
      if (Array.isArray(json.periods)) {
        setRemotePeriods(json.periods.map(normalizeSlotFromRow));
      } else {
        setRemotePeriods(updatedSlots);
      }
      await persistLocalTimetableCache(updatedSlots, suggestions);
      setSyncState('synced');

      showToast(editingSlotId ? "Timetable entry & period updated in Supabase!" : "New entry & period synced to Supabase!", "success");
      setIsFormOpen(false);
      resetForm();
    } catch (err: any) {
      setSyncState('error');
      showToast(err?.message || "Failed to save timetable slot to Supabase. Please retry.", "error");
    }
  };

  // Suggestion Actions — Persist directly to Supabase
  const handleApproveSuggestion = async (sugId: string) => {
    const sug = suggestions.find(s => s.id === sugId);
    if (!sug) return;

    const newSlot: TimetableSlot = {
      id: `slot-${Date.now()}`,
      classId: sug.classId,
      subjectName: sug.subjectName,
      teacherName: sug.teacherName,
      day: sug.day,
      startTime: sug.startTime,
      endTime: sug.endTime,
      room: sug.room,
      notes: sug.notes
    };

    const simulatedAllSlots = [...slots, newSlot];
    const newConflicts = getCollisions(simulatedAllSlots);
    const directClashes = newConflicts.filter(c => c.slotA.id === newSlot.id || c.slotB.id === newSlot.id);

    if (directClashes.length > 0) {
      showToast("Cannot approve: This suggestion has a collision conflict with current active slots!", "error");
      return;
    }

    setSyncState('saving');
    try {
      const res = await fetch(`/api/timetable/suggestions/${encodeURIComponent(sugId)}`, {
        method: 'PUT',
        headers: getApiHeaders(activeSchoolId),
        body: JSON.stringify({
          ...sug,
          status: 'approved',
          approveAndSchedule: true,
          slotId: newSlot.id,
          school_id: activeSchoolId
        })
      });

      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || 'Failed to approve suggestion in Supabase');
      }

      const rawApproved = json.approvedSlot || json.slot || newSlot;
      const approvedSlot = normalizeSlotFromRow(rawApproved);
      migratedIdsRef.current.add(approvedSlot.id);
      migratedIdsRef.current.add(getSlotSignature(approvedSlot));
      applyRemoteReferenceLists(json);

      const updatedSlots = Array.isArray(json.slots)
        ? json.slots.map(normalizeSlotFromRow)
        : [...slots.filter(s => s.id !== approvedSlot.id), approvedSlot];
      const updatedSug = Array.isArray(json.suggestions)
        ? json.suggestions.map(normalizeSuggestionFromRow)
        : suggestions.map(s => s.id === sugId ? { ...s, status: 'approved' } : s);

      setRemoteSlots(updatedSlots);
      if (Array.isArray(json.periods)) {
        setRemotePeriods(json.periods.map(normalizeSlotFromRow));
      } else {
        setRemotePeriods(updatedSlots);
      }
      setRemoteSuggestions(updatedSug);
      await persistLocalTimetableCache(updatedSlots, updatedSug);
      setSyncState('synced');

      showToast("Suggested period approved and synced to Supabase entries & periods!", "success");
    } catch (err: any) {
      setSyncState('error');
      showToast(err?.message || "Failed to approve suggestion in Supabase.", "error");
    }
  };

  const handleRejectSuggestion = async (sugId: string) => {
    const sug = suggestions.find(s => s.id === sugId);
    if (!sug) return;

    setSyncState('saving');
    try {
      const res = await fetch(`/api/timetable/suggestions/${encodeURIComponent(sugId)}`, {
        method: 'PUT',
        headers: getApiHeaders(activeSchoolId),
        body: JSON.stringify({
          ...sug,
          status: 'rejected',
          school_id: activeSchoolId
        })
      });

      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || 'Failed to reject suggestion in Supabase');
      }

      applyRemoteReferenceLists(json);
      const updatedSug = Array.isArray(json.suggestions)
        ? json.suggestions.map(normalizeSuggestionFromRow)
        : suggestions.map(s => s.id === sugId ? { ...s, status: 'rejected' } : s);
      setRemoteSuggestions(updatedSug);
      await persistLocalTimetableCache(slots, updatedSug);
      setSyncState('synced');

      showToast("Suggested period has been rejected.", "info");
    } catch (err: any) {
      setSyncState('error');
      showToast(err?.message || "Failed to update suggestion in Supabase.", "error");
    }
  };

  const handleDeleteSuggestion = async (sugId: string) => {
    setSyncState('saving');
    migratedIdsRef.current.add(sugId);
    try {
      const res = await fetch(`/api/timetable/suggestions/${encodeURIComponent(sugId)}?school_id=${encodeURIComponent(activeSchoolId)}`, {
        method: 'DELETE',
        headers: getApiHeaders(activeSchoolId)
      });

      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || 'Failed to delete suggestion from Supabase');
      }

      applyRemoteReferenceLists(json);
      const updatedSug = Array.isArray(json.suggestions)
        ? json.suggestions.map(normalizeSuggestionFromRow)
        : suggestions.filter(s => s.id !== sugId);
      setRemoteSuggestions(updatedSug);
      await persistLocalTimetableCache(slots, updatedSug);
      setSyncState('synced');

      showToast("Suggestion deleted from Supabase.", "success");
    } catch (err: any) {
      setSyncState('error');
      showToast(err?.message || "Failed to delete suggestion from Supabase.", "error");
    }
  };

  // Connected Cascading Handlers: Target Class -> Subject -> Assigned Teacher
  const handleFormClassChange = useCallback((nextClass: string) => {
    setFormClass(nextClass);
    const { matched: matchedSubjects, others: otherSubjects } = getSubjectsForClass(nextClass);

    const isCurrentSubjMatched = matchedSubjects.some(
      s => s.toLowerCase() === String(formSubject || '').trim().toLowerCase()
    );
    const nextSubject = isCurrentSubjMatched
      ? formSubject
      : (matchedSubjects[0] || otherSubjects[0] || formSubject || '');

    setFormSubject(nextSubject);

    const { exactMatch, subjectOrClassMatch, others: otherTeachers } = getTeachersForClassAndSubject(nextClass, nextSubject);
    let nextTeacher = formTeacher;
    if (exactMatch.length === 1) {
      nextTeacher = exactMatch[0];
    } else if (!exactMatch.some(t => t.toLowerCase() === String(formTeacher || '').trim().toLowerCase())) {
      nextTeacher = exactMatch[0] || subjectOrClassMatch[0] || otherTeachers[0] || formTeacher || '';
    }
    setFormTeacher(nextTeacher);
  }, [formSubject, formTeacher, getSubjectsForClass, getTeachersForClassAndSubject]);

  const handleFormSubjectChange = useCallback((nextSubject: string) => {
    setFormSubject(nextSubject);
    const { exactMatch, subjectOrClassMatch, others: otherTeachers } = getTeachersForClassAndSubject(formClass, nextSubject);
    let nextTeacher = formTeacher;
    if (exactMatch.length === 1) {
      nextTeacher = exactMatch[0];
    } else if (!exactMatch.some(t => t.toLowerCase() === String(formTeacher || '').trim().toLowerCase())) {
      nextTeacher = exactMatch[0] || subjectOrClassMatch[0] || otherTeachers[0] || formTeacher || '';
    }
    setFormTeacher(nextTeacher);
  }, [formClass, formTeacher, getTeachersForClassAndSubject]);

  const handleFormTeacherChange = useCallback((nextTeacher: string) => {
    setFormTeacher(nextTeacher);
    const profile = mergedTeachersCatalog.find(
      t => t.fullName.toLowerCase() === String(nextTeacher || '').trim().toLowerCase()
    );
    if (!profile) return;

    // If Class or Subject has not been chosen yet, cascade from the teacher's assignments
    if (!formClass && profile.assignedClasses.size > 0) {
      const firstAssigned = classesList.find(c => profile.assignedClasses.has(c.toLowerCase()));
      if (firstAssigned) setFormClass(firstAssigned);
    }
    if (!formSubject && profile.subjects.size > 0) {
      const firstSubj = subjectsList.find(s => profile.subjects.has(s.toLowerCase()));
      if (firstSubj) setFormSubject(firstSubj);
    }
  }, [formClass, formSubject, mergedTeachersCatalog, classesList, subjectsList]);

  const formSubjectGroups = useMemo(() => getSubjectsForClass(formClass), [formClass, getSubjectsForClass]);
  const formTeacherGroups = useMemo(() => getTeachersForClassAndSubject(formClass, formSubject), [formClass, formSubject, getTeachersForClassAndSubject]);

  // Check if a candidate (classId, teacherName, room, day, startTime, endTime) is collision-free against a given slot list
  const checkWindowAvailability = useCallback((
    candidate: {
      classId: string;
      teacherName: string;
      room: string;
      day: typeof WEEKDAYS[number];
      startTime: string;
      endTime: string;
    },
    againstSlots: TimetableSlot[] = slots,
    ignoreSlotId?: string | null
  ): { isFree: boolean; clashReason: string | null } => {
    const startCand = toMinutes(candidate.startTime);
    const endCand = toMinutes(candidate.endTime);
    const cleanClass = String(candidate.classId || '').trim().toLowerCase();
    const cleanTeacher = String(candidate.teacherName || '').trim().toLowerCase();
    const cleanRoom = String(candidate.room || '').trim().toLowerCase();

    for (const s of againstSlots) {
      if (ignoreSlotId && s.id === ignoreSlotId) continue;
      if (s.day !== candidate.day) continue;
      const startS = toMinutes(s.startTime);
      const endS = toMinutes(s.endTime);
      if (!(startCand < endS && startS < endCand)) continue;

      if (cleanClass && String(s.classId || '').trim().toLowerCase() === cleanClass) {
        return { isFree: false, clashReason: `${candidate.classId} already has ${s.subjectName}` };
      }
      if (cleanTeacher && String(s.teacherName || '').trim().toLowerCase() === cleanTeacher) {
        return { isFree: false, clashReason: `${candidate.teacherName} is teaching ${s.classId}` };
      }
      if (cleanRoom && String(s.room || '').trim().toLowerCase() === cleanRoom) {
        return { isFree: false, clashReason: `${candidate.room} is occupied by ${s.classId}` };
      }
    }
    return { isFree: true, clashReason: null };
  }, [slots]);

  // Find the earliest collision-free (day, startTime, endTime, room) for a given class + teacher
  // Prioritizes existing periods from the database first, falling back to standard school slots only if needed
  const findNextConflictFreeWindow = useCallback((
    classId: string,
    teacherName: string,
    preferredRoom = 'Room A',
    preferredDay?: typeof WEEKDAYS[number],
    againstSlots: TimetableSlot[] = slots,
    ignoreSlotId?: string | null,
    preferredTimeWindow?: { startTime: string; endTime: string } | null
  ): { day: typeof WEEKDAYS[number]; startTime: string; endTime: string; room: string; fromDatabase: boolean } => {
    const orderedDays: Array<typeof WEEKDAYS[number]> = preferredDay
      ? [preferredDay, ...WEEKDAYS.filter(d => d !== preferredDay)]
      : [...WEEKDAYS];
    const candidateRooms = Array.from(new Set([preferredRoom || 'Room A', ...roomsList]));

    // 0. If this course already has a shared period time window in timetable_periods / timetable_entries, try that exact window on a free day first
    if (preferredTimeWindow?.startTime && preferredTimeWindow?.endTime && preferredTimeWindow.startTime !== '00:00') {
      for (const day of orderedDays) {
        for (const room of candidateRooms) {
          const check = checkWindowAvailability(
            {
              classId,
              teacherName,
              room,
              day,
              startTime: preferredTimeWindow.startTime,
              endTime: preferredTimeWindow.endTime
            },
            againstSlots,
            ignoreSlotId
          );
          if (check.isFree) {
            return {
              day,
              startTime: preferredTimeWindow.startTime,
              endTime: preferredTimeWindow.endTime,
              room,
              fromDatabase: true
            };
          }
        }
      }
    }

    // 1. First pass: check existing database period windows across all weekdays
    for (const day of orderedDays) {
      for (const preset of periodPresets) {
        for (const room of candidateRooms) {
          const check = checkWindowAvailability(
            { classId, teacherName, room, day, startTime: preset.startTime, endTime: preset.endTime },
            againstSlots,
            ignoreSlotId
          );
          if (check.isFree) {
            return {
              day,
              startTime: preset.startTime,
              endTime: preset.endTime,
              room,
              fromDatabase: Boolean(preset.fromDatabase)
            };
          }
        }
      }
    }

    // 2. Fallback pass: if all existing database period windows are occupied, check standard school periods
    for (const day of orderedDays) {
      for (const stdPreset of standardPeriodFallbacks) {
        for (const room of candidateRooms) {
          const check = checkWindowAvailability(
            { classId, teacherName, room, day, startTime: stdPreset.startTime, endTime: stdPreset.endTime },
            againstSlots,
            ignoreSlotId
          );
          if (check.isFree) {
            return {
              day,
              startTime: stdPreset.startTime,
              endTime: stdPreset.endTime,
              room,
              fromDatabase: false
            };
          }
        }
      }
    }

    return {
      day: preferredDay || 'Monday',
      startTime: periodPresets[0]?.startTime || '08:00',
      endTime: periodPresets[0]?.endTime || '08:45',
      room: preferredRoom || 'Room A',
      fromDatabase: Boolean(periodPresets[0]?.fromDatabase)
    };
  }, [slots, roomsList, periodPresets, standardPeriodFallbacks, checkWindowAvailability]);

  // Modal Period Time Presets with live Free / Clash status for the active form inputs
  const modalTimePresetsWithStatus = useMemo(() => {
    return periodPresets.map(p => {
      const check = checkWindowAvailability(
        {
          classId: formClass,
          teacherName: formTeacher,
          room: formRoom || 'Room A',
          day: formDay,
          startTime: p.startTime,
          endTime: p.endTime
        },
        slots,
        editingSlotId
      );
      const isSelected = formStartTime === p.startTime && formEndTime === p.endTime;
      return {
        ...p,
        isFree: check.isFree,
        clashReason: check.clashReason,
        isSelected
      };
    });
  }, [periodPresets, checkWindowAvailability, formClass, formTeacher, formRoom, formDay, slots, editingSlotId, formStartTime, formEndTime]);

  // Smart Course & Time Quick Suggestions: shares the unified timetable_entries & timetable_periods dataset so there are zero discrepancies
  const smartQuickSuggestions = useMemo(() => {
    const targetClasses = (() => {
      if (activeTab === 'class_view' && selectedClassForGrid && classesList.includes(selectedClassForGrid)) {
        return [selectedClassForGrid];
      }
      if (selectedClassFilter !== 'All' && classesList.includes(selectedClassFilter)) {
        return [selectedClassFilter];
      }
      if (isTeacher && user?.fullName) {
        const cleanMyName = user.fullName.toLowerCase().trim();
        const myProfile = mergedTeachersCatalog.find(
          t => t.fullName.toLowerCase().includes(cleanMyName) || cleanMyName.includes(t.fullName.toLowerCase())
        );
        if (myProfile && myProfile.assignedClasses.size > 0) {
          const matchedCls = classesList.filter(c => myProfile.assignedClasses.has(c.toLowerCase()));
          if (matchedCls.length > 0) return matchedCls;
        }
      }
      return classesList;
    })();

    const candidateCombos: Array<{
      classId: string;
      subjectName: string;
      teacherName: string;
      preferredRoom: string;
      preferredTimeWindow: { startTime: string; endTime: string } | null;
      scheduledCount: number;
      hasExactTeacher: boolean;
    }> = [];

    for (const cls of targetClasses) {
      const { matched: matchedSubjs, others: otherSubjs } = getSubjectsForClass(cls);
      const subjPool = matchedSubjs.length > 0 ? matchedSubjs : otherSubjs;

      for (const subj of subjPool) {
        // Check existing synced timetable_entries & timetable_periods for this class + subject first so shared fields match 100%
        const existingSyncedRecords = slots.filter(
          s =>
            String(s.classId || '').toLowerCase() === cls.toLowerCase() &&
            String(s.subjectName || '').toLowerCase() === subj.toLowerCase()
        );
        const sharedRecord = existingSyncedRecords[0] || periods.find(
          p =>
            String(p.classId || '').toLowerCase() === cls.toLowerCase() &&
            String(p.subjectName || '').toLowerCase() === subj.toLowerCase()
        );

        const { exactMatch, subjectOrClassMatch, others: otherTeachers } = getTeachersForClassAndSubject(cls, subj);
        const bestTeacher =
          (sharedRecord?.teacherName && sharedRecord.teacherName !== 'Unassigned' ? sharedRecord.teacherName : '') ||
          exactMatch[0] ||
          subjectOrClassMatch[0] ||
          otherTeachers[0] ||
          '';
        if (!bestTeacher) continue;

        if (selectedTeacherFilter !== 'All' && bestTeacher !== selectedTeacherFilter) {
          continue;
        }

        const preferredRoom =
          selectedRoomFilter !== 'All'
            ? selectedRoomFilter
            : (sharedRecord?.room || 'Room A');

        const preferredTimeWindow =
          sharedRecord?.startTime && sharedRecord?.endTime && sharedRecord.startTime !== '00:00'
            ? { startTime: sharedRecord.startTime, endTime: sharedRecord.endTime }
            : null;

        candidateCombos.push({
          classId: cls,
          subjectName: subj,
          teacherName: bestTeacher,
          preferredRoom,
          preferredTimeWindow,
          scheduledCount: existingSyncedRecords.length,
          hasExactTeacher: Boolean(sharedRecord?.teacherName) || exactMatch.length > 0
        });
      }
    }

    // Prioritize courses that already exist in synced periods/entries with fewer weekly occurrences or unscheduled courses
    candidateCombos.sort((a, b) => {
      if (a.scheduledCount !== b.scheduledCount) return a.scheduledCount - b.scheduledCount;
      if (a.hasExactTeacher !== b.hasExactTeacher) return a.hasExactTeacher ? -1 : 1;
      const cCmp = a.classId.localeCompare(b.classId);
      if (cCmp !== 0) return cCmp;
      return a.subjectName.localeCompare(b.subjectName);
    });

    // Allocate distinct conflict-free windows across the top recommendations using existing DB period windows first
    const virtualSlots: TimetableSlot[] = [...slots];
    const results: Array<{
      key: string;
      classId: string;
      subjectName: string;
      teacherName: string;
      day: typeof WEEKDAYS[number];
      startTime: string;
      endTime: string;
      room: string;
      scheduledCount: number;
      hasExactTeacher: boolean;
      fromDatabase: boolean;
    }> = [];

    for (const combo of candidateCombos.slice(0, 6)) {
      const preferredDay = WEEKDAYS[results.length % WEEKDAYS.length];
      const freeWin = findNextConflictFreeWindow(
        combo.classId,
        combo.teacherName,
        combo.preferredRoom,
        preferredDay,
        virtualSlots,
        null,
        combo.preferredTimeWindow
      );

      const key = `${combo.classId}|${combo.subjectName}|${combo.teacherName}|${freeWin.day}|${freeWin.startTime}`;
      results.push({
        key,
        classId: combo.classId,
        subjectName: combo.subjectName,
        teacherName: combo.teacherName,
        day: freeWin.day,
        startTime: freeWin.startTime,
        endTime: freeWin.endTime,
        room: freeWin.room,
        scheduledCount: combo.scheduledCount,
        hasExactTeacher: combo.hasExactTeacher,
        fromDatabase: freeWin.fromDatabase
      });

      virtualSlots.push({
        id: `virtual-${results.length}`,
        classId: combo.classId,
        subjectName: combo.subjectName,
        teacherName: combo.teacherName,
        day: freeWin.day,
        startTime: freeWin.startTime,
        endTime: freeWin.endTime,
        room: freeWin.room
      });
    }

    return results;
  }, [
    activeTab,
    selectedClassForGrid,
    selectedClassFilter,
    selectedTeacherFilter,
    selectedRoomFilter,
    classesList,
    isTeacher,
    user?.fullName,
    mergedTeachersCatalog,
    getSubjectsForClass,
    getTeachersForClassAndSubject,
    slots,
    periods,
    findNextConflictFreeWindow
  ]);

  // Contextual Course Quick Combos inside the Modal (scoped to formClass or all classes)
  const modalCourseQuickCombos = useMemo(() => {
    const targetCls = formClass || classesList[0] || '';
    if (!targetCls) return [];
    const { matched: matchedSubjs, others: otherSubjs } = getSubjectsForClass(targetCls);
    const allSubjs = [...matchedSubjs, ...otherSubjs];
    return allSubjs.slice(0, 6).map(subj => {
      const existingSyncedRecords = slots.filter(
        s =>
          String(s.classId || '').toLowerCase() === targetCls.toLowerCase() &&
          String(s.subjectName || '').toLowerCase() === subj.toLowerCase()
      );
      const sharedRecord = existingSyncedRecords[0] || periods.find(
        p =>
          String(p.classId || '').toLowerCase() === targetCls.toLowerCase() &&
          String(p.subjectName || '').toLowerCase() === subj.toLowerCase()
      );
      const { exactMatch, subjectOrClassMatch, others: otherTeachers } = getTeachersForClassAndSubject(targetCls, subj);
      const teacher =
        (sharedRecord?.teacherName && sharedRecord.teacherName !== 'Unassigned' ? sharedRecord.teacherName : '') ||
        exactMatch[0] ||
        subjectOrClassMatch[0] ||
        otherTeachers[0] ||
        '';
      return {
        classId: targetCls,
        subjectName: subj,
        teacherName: teacher,
        scheduledCount: existingSyncedRecords.length,
        isExact: Boolean(sharedRecord?.teacherName) || exactMatch.length > 0
      };
    });
  }, [formClass, classesList, getSubjectsForClass, getTeachersForClassAndSubject, slots, periods]);

  // Jump form to next conflict-free slot for the currently selected Class + Teacher + Room
  const handleJumpToNextFreeSlot = useCallback(() => {
    const targetCls = formClass || classesList[0] || '';
    const targetTch = formTeacher || teachersList[0] || '';
    const nextWin = findNextConflictFreeWindow(
      targetCls,
      targetTch,
      formRoom || 'Room A',
      formDay,
      slots,
      editingSlotId
    );
    setFormDay(nextWin.day);
    setFormStartTime(nextWin.startTime);
    setFormEndTime(nextWin.endTime);
    setFormRoom(nextWin.room);
  }, [formClass, classesList, formTeacher, teachersList, findNextConflictFreeWindow, formRoom, formDay, slots, editingSlotId]);

  // Apply a Quick Suggestion either by pre-filling the modal or immediately saving to Supabase
  const handleApplyQuickSuggestion = useCallback(async (
    rec: {
      key: string;
      classId: string;
      subjectName: string;
      teacherName: string;
      day: typeof WEEKDAYS[number];
      startTime: string;
      endTime: string;
      room: string;
    },
    mode: 'prefill' | 'instant'
  ) => {
    if (mode === 'prefill') {
      setEditingSlotId(null);
      setFormClass(rec.classId);
      setFormSubject(rec.subjectName);
      setFormTeacher(rec.teacherName);
      setFormDay(rec.day);
      setFormStartTime(rec.startTime);
      setFormEndTime(rec.endTime);
      setFormRoom(rec.room || 'Room A');
      setFormNotes('');
      setIsFormOpen(true);
      return;
    }

    // Instant save to Supabase (writes to both timetable_entries and timetable_periods)
    setSavingQuickId(rec.key);
    setSyncState('saving');

    try {
      if (isTeacher) {
        const newSuggestion = {
          id: `sug-${Date.now()}`,
          classId: rec.classId,
          subjectName: rec.subjectName,
          teacherName: rec.teacherName,
          day: rec.day,
          startTime: rec.startTime,
          endTime: rec.endTime,
          room: rec.room || 'Room A',
          notes: 'Quick suggested conflict-free period',
          status: 'pending',
          suggestedBy: user?.fullName || 'Teacher',
          createdAt: Date.now()
        };

        const res = await fetch('/api/timetable/suggestions', {
          method: 'POST',
          headers: getApiHeaders(activeSchoolId),
          body: JSON.stringify({
            ...newSuggestion,
            school_id: activeSchoolId
          })
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.success) {
          throw new Error(json?.error || 'Failed to save quick suggestion to Supabase');
        }

        applyRemoteReferenceLists(json);
        const savedSuggestion = (json.suggestion || json.data)
          ? normalizeSuggestionFromRow(json.suggestion || json.data)
          : newSuggestion;
        migratedIdsRef.current.add(savedSuggestion.id);
        const updatedSug = Array.isArray(json.suggestions)
          ? json.suggestions.map(normalizeSuggestionFromRow)
          : [...suggestions.filter(s => s.id !== savedSuggestion.id), savedSuggestion];
        setRemoteSuggestions(updatedSug);
        await persistLocalTimetableCache(slots, updatedSug);
        setSyncState('synced');
        showToast(`Suggested ${rec.subjectName} (${rec.classId}) on ${rec.day} ${rec.startTime}–${rec.endTime}!`, 'success');
      } else {
        const newSlot: TimetableSlot = {
          id: `slot-${Date.now()}`,
          classId: rec.classId,
          subjectName: rec.subjectName,
          teacherName: rec.teacherName,
          day: rec.day,
          startTime: rec.startTime,
          endTime: rec.endTime,
          room: rec.room || 'Room A',
          notes: ''
        };

        const res = await fetch('/api/timetable/slots', {
          method: 'POST',
          headers: getApiHeaders(activeSchoolId),
          body: JSON.stringify({
            ...newSlot,
            school_id: activeSchoolId
          })
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.success) {
          throw new Error(json?.error || 'Failed to save quick slot to Supabase');
        }

        applyRemoteReferenceLists(json);
        const rawSaved = json.slot || json.data || newSlot;
        const savedSlot = normalizeSlotFromRow(rawSaved);
        migratedIdsRef.current.add(savedSlot.id);
        migratedIdsRef.current.add(getSlotSignature(savedSlot));

        const updatedSlots = Array.isArray(json.slots)
          ? json.slots.map(normalizeSlotFromRow)
          : [...slots.filter(s => s.id !== savedSlot.id), savedSlot];

        setRemoteSlots(updatedSlots);
        if (Array.isArray(json.periods)) {
          setRemotePeriods(json.periods.map(normalizeSlotFromRow));
        } else {
          setRemotePeriods(updatedSlots);
        }
        await persistLocalTimetableCache(updatedSlots, suggestions);
        setSyncState('synced');
        showToast(`Scheduled ${rec.subjectName} for ${rec.classId} (${rec.day} ${rec.startTime}–${rec.endTime}) in Supabase entries & periods!`, 'success');
      }
    } catch (err: any) {
      setSyncState('error');
      showToast(err?.message || 'Failed to save quick suggestion to Supabase.', 'error');
    } finally {
      setSavingQuickId(null);
    }
  }, [
    isTeacher,
    user?.fullName,
    activeSchoolId,
    normalizeSuggestionFromRow,
    suggestions,
    persistLocalTimetableCache,
    slots,
    showToast,
    applyRemoteReferenceLists,
    normalizeSlotFromRow,
    getSlotSignature
  ]);

  // Reset Edit form state with connected defaults (Class -> Subject -> Assigned Teacher) and next conflict-free time window
  const resetForm = useCallback(() => {
    setEditingSlotId(null);
    const preferredClass =
      selectedClassFilter !== 'All' && classesList.includes(selectedClassFilter)
        ? selectedClassFilter
        : (classesList[0] || '');
    const { matched: matchedSubjects, others: otherSubjects } = getSubjectsForClass(preferredClass);
    const preferredSubject = matchedSubjects[0] || otherSubjects[0] || '';
    const { exactMatch, subjectOrClassMatch, others: otherTeachers } = getTeachersForClassAndSubject(preferredClass, preferredSubject);
    const preferredTeacher = exactMatch[0] || subjectOrClassMatch[0] || otherTeachers[0] || '';
    const nextFree = findNextConflictFreeWindow(preferredClass, preferredTeacher, 'Room A', 'Monday', slots, null);

    setFormClass(preferredClass);
    setFormSubject(preferredSubject);
    setFormTeacher(preferredTeacher);
    setFormDay(nextFree.day);
    setFormStartTime(nextFree.startTime);
    setFormEndTime(nextFree.endTime);
    setFormRoom(nextFree.room);
    setFormNotes('');
  }, [selectedClassFilter, classesList, getSubjectsForClass, getTeachersForClassAndSubject, findNextConflictFreeWindow, slots]);

  // Ensure form defaults populate if Supabase reference data finishes loading while modal is open
  useEffect(() => {
    if (!isFormOpen || editingSlotId) return;
    if (!formClass && classesList.length > 0) {
      resetForm();
    }
  }, [isFormOpen, editingSlotId, formClass, classesList.length, resetForm]);

  const handleEditClick = (slot: TimetableSlot) => {
    setEditingSlotId(slot.id);
    setFormClass(slot.classId);
    setFormSubject(slot.subjectName);
    setFormTeacher(slot.teacherName);
    setFormDay(slot.day);
    setFormStartTime(slot.startTime);
    setFormEndTime(slot.endTime);
    setFormRoom(slot.room);
    setFormNotes(slot.notes || '');
    setIsFormOpen(true);
  };

  const handleDeleteSlot = async (id: string, name: string) => {
    const isOk = await confirm({
      title: "Remove Period Slot?",
      message: `Are you sure you want to remove the scheduled slot for "${name}" from this timetable? This will remove the shared record from both timetable_entries and timetable_periods.`,
      confirmLabel: "Delete Slot"
    });
    if (!isOk) return;

    const targetSlot = slots.find(s => s.id === id);
    setSyncState('saving');
    migratedIdsRef.current.add(id);
    if (targetSlot) {
      migratedIdsRef.current.add(getSlotSignature(targetSlot));
    }

    try {
      const res = await fetch(`/api/timetable/slots/${encodeURIComponent(id)}?school_id=${encodeURIComponent(activeSchoolId)}`, {
        method: 'DELETE',
        headers: getApiHeaders(activeSchoolId)
      });

      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || 'Failed to delete timetable slot from Supabase');
      }

      applyRemoteReferenceLists(json);
      const filtered = Array.isArray(json.slots)
        ? json.slots.map(normalizeSlotFromRow)
        : slots.filter(s => s.id !== id);
      setRemoteSlots(filtered);
      if (Array.isArray(json.periods)) {
        setRemotePeriods(json.periods.map(normalizeSlotFromRow));
      } else {
        setRemotePeriods(filtered);
      }
      await persistLocalTimetableCache(filtered, suggestions);
      setSyncState('synced');
      showToast("Timetable entry & period removed from Supabase.", "info");
    } catch (err: any) {
      setSyncState('error');
      showToast(err?.message || "Failed to delete timetable slot from Supabase.", "error");
    }
  };

  // Filter slots based on state
  const getFilteredSlots = () => {
    return slots.filter(slot => {
      const matchClass = selectedClassFilter === 'All'
        ? (isParent ? parentWardsClasses.includes(slot.classId) : true)
        : slot.classId === selectedClassFilter;
      const matchTeacher = selectedTeacherFilter === 'All' || slot.teacherName === selectedTeacherFilter;
      const matchRoom = selectedRoomFilter === 'All' || slot.room === selectedRoomFilter;
      return matchClass && matchTeacher && matchRoom;
    });
  };

  const filteredSlots = getFilteredSlots();

  const currentClass = selectedClassForGrid || classesList[0] || '';

  const currentWeekdayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][liveNow.getDay()];
  const currentHHMM = `${String(liveNow.getHours()).padStart(2, '0')}:${String(liveNow.getMinutes()).padStart(2, '0')}`;

  const getBellForSlotTime = useCallback((startTime: string, endTime?: string, day?: string) => {
    const cleanStart = String(startTime || '').trim().slice(0, 5);
    const cleanEnd = String(endTime || '').trim().slice(0, 5);
    const matchedBell = periodBells.find((b: any) => String(b?.time || '').trim().slice(0, 5) === cleanStart);
    const isActiveNow =
      Boolean(day ? day === currentWeekdayName : ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].includes(currentWeekdayName)) &&
      cleanStart &&
      cleanEnd &&
      currentHHMM >= cleanStart &&
      currentHHMM < cleanEnd;
    return {
      bell: matchedBell || null,
      isArmed: Boolean(matchedBell && matchedBell.enabled !== false),
      isActiveNow
    };
  }, [periodBells, currentWeekdayName, currentHHMM]);

  const handleSyncPeriodBells = async () => {
    setIsSyncingBells(true);
    try {
      const res = await sirenApi.syncWithTimetable(
        {
          bellSchedule: periodBells.length > 0 ? periodBells : undefined,
          forceFromTimetable: true
        },
        activeSchoolId || undefined
      );
      if (Array.isArray(res?.bellSchedule)) {
        setRemoteBells(res.bellSchedule);
      }
      const stats = res?.timetableStats;
      if (stats) {
        showToast(
          `Synced ${stats.periodStartBells} period start bells, ${stats.breakBells} break chimes & dismissal bell with Siren Console!`,
          'success'
        );
      } else {
        showToast('School Timetable synchronized with Siren Console Period Bell Timetable!', 'success');
      }
    } catch (err: any) {
      showToast(err?.message || 'Failed to sync Period Bell Timetable.', 'error');
    } finally {
      setIsSyncingBells(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Printable Only Header */}
      <div className="only-print">
        <h1 className="text-3xl font-black text-slate-900 uppercase tracking-tighter text-center">{schoolName}</h1>
        <p className="mt-1 text-center font-extrabold uppercase text-xs tracking-wider text-slate-500">Official Class & Course Timetable Schedule</p>
        <div className="mt-4 border-t-2 border-slate-900 pt-3 flex flex-wrap justify-between text-xs font-black text-slate-700">
          {activeTab === 'class_view' ? (
            <>
              <span>Selected Class: {currentClass} Grid View</span>
              <span>Layout Type: Weekday Calendar Grid</span>
              <span>Generated: {new Date().toLocaleDateString()}</span>
            </>
          ) : (
            <>
              <span>Active Filter - Class: {selectedClassFilter}</span>
              <span>Teacher Assigned: {selectedTeacherFilter}</span>
              <span>Room / Lab: {selectedRoomFilter}</span>
              <span>Generated: {new Date().toLocaleDateString()}</span>
            </>
          )}
        </div>
      </div>

      {/* Primary Deep Teal Header Card */}
      <div className="bg-[#1c4a59] rounded-3xl p-6 sm:p-7 text-white shadow-[0_8px_24px_rgba(28,74,89,0.18)] flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden relative overflow-hidden">
        <div className="absolute -right-8 -bottom-8 w-40 h-40 rounded-full border-8 border-white/5 pointer-events-none" />
        <div className="absolute -right-16 -bottom-16 w-60 h-60 rounded-full border-8 border-white/5 pointer-events-none" />

        <div className="space-y-1.5 relative z-10">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="text-xs font-bold text-[#faae57] tracking-wide">
              Academic Schedule & Period Matrix
            </span>
            <button
              type="button"
              onClick={() => fetchTimetableFromSupabase(true)}
              disabled={syncState === 'loading' || syncState === 'saving'}
              title="Sync timetable entries & periods with Supabase"
              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold transition-all cursor-pointer ${
                syncState === 'error'
                  ? 'bg-[#ef476f] text-white'
                  : syncState === 'saving' || syncState === 'loading'
                  ? 'bg-white/15 text-white'
                  : 'bg-[#06d6a0]/20 text-[#06d6a0] hover:bg-[#06d6a0]/30'
              }`}
            >
              <RefreshCw className={`w-3 h-3 ${syncState === 'loading' || syncState === 'saving' ? 'animate-spin' : ''}`} />
              {syncState === 'loading'
                ? 'Loading Supabase…'
                : syncState === 'saving'
                ? 'Saving to Supabase…'
                : syncState === 'error'
                ? 'Sync Error — Retry'
                : `Entries & Periods Synced (${slots.length})`}
            </button>

            <span className="text-[11px] font-semibold text-white/85 flex items-center gap-1 font-mono tabular-nums">
              <Bell className="w-3 h-3 text-[#faae57]" />
              {periodBells.filter((b: any) => b?.enabled !== false).length} Period Bells Armed
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
            <Calendar className="w-6 h-6 text-[#faae57]" />
            Timetable & Course Scheduler
          </h2>
          <p className="text-xs sm:text-sm text-white/80 font-medium leading-relaxed max-w-2xl">
            Configure school lesson blocks, prevent classroom overlap collisions, and automatically synchronize campus period bells.
          </p>
        </div>

        {(isAdmin || isTeacher) && (
          <div className="flex flex-wrap items-center gap-2.5 self-start sm:self-auto relative z-10">
            <button
              type="button"
              onClick={handleSyncPeriodBells}
              disabled={isSyncingBells || syncState === 'saving'}
              title="Two-way sync School Timetable slots with the Siren Console Period Bell Timetable"
              className="px-4 py-2.5 rounded-full text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer active:scale-[0.97] min-h-[40px] border bg-white/10 hover:bg-white/20 text-white border-white/25 disabled:opacity-60"
            >
              <Bell className={`w-3.5 h-3.5 text-[#faae57] ${isSyncingBells ? 'animate-bounce' : ''}`} />
              {isSyncingBells ? 'Syncing Period Bells…' : 'Sync Period Bells'}
            </button>
            <button
              type="button"
              onClick={() => setIsQuickPanelOpen(prev => !prev)}
              className={`px-4 py-2.5 rounded-full text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer active:scale-[0.97] min-h-[40px] border ${
                isQuickPanelOpen
                  ? 'bg-white/15 text-white border-white/30'
                  : 'bg-white/5 text-white/85 border-white/15 hover:bg-white/10'
              }`}
            >
              <Clock className="w-3.5 h-3.5 text-[#faae57]" />
              {isQuickPanelOpen ? 'Hide Quick Suggestions' : 'Quick Suggestions'}
            </button>
            <button
              onClick={() => {
                resetForm();
                setIsFormOpen(true);
              }}
              className="px-5 py-2.5 bg-[#faae57] hover:bg-[#e4ae67] text-[#1f2a2e] rounded-full text-xs font-bold flex items-center gap-2 transition-all shadow-md shrink-0 cursor-pointer active:scale-[0.97] min-h-[40px]"
            >
              <Plus className="w-4 h-4" />
              {isTeacher ? 'Suggest Period' : 'Add Time Block'}
            </button>
          </div>
        )}
      </div>

      {/* On-Page Smart Quick Suggestion Panel (Course Combos + Conflict-Free Time Slots sharing unified entries & periods data) */}
      {(isAdmin || isTeacher) && isQuickPanelOpen && smartQuickSuggestions.length > 0 && (
        <div className="bg-white border border-[#bac4c6] rounded-2xl p-4 sm:p-5 shadow-[0_4px_16px_rgba(0,0,0,0.06)] space-y-3.5 print:hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#bac4c6]/50 pb-3">
            <div className="space-y-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <Clock className="w-4 h-4 text-[#1c4a59]" />
                <h3 className="text-sm font-bold text-[#1f2a2e]">
                  Quick Time & Course Suggestions
                </h3>
                <span className="text-xs font-medium text-[#6a7f84]">
                  · Unified <span className="font-mono">timetable_entries</span> & <span className="font-mono">timetable_periods</span> ({slots.length} synced records)
                </span>
              </div>
              <p className="text-xs text-[#6a7f84] font-medium">
                Click <span className="font-bold text-[#1f2a2e]">Pre-fill</span> to customize in the scheduler modal or <span className="font-bold text-[#1c4a59]">{isTeacher ? 'Suggest Now' : 'Schedule Now'}</span> to sync directly to both Supabase tables.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  if (smartQuickSuggestions[0]) {
                    handleApplyQuickSuggestion(smartQuickSuggestions[0], 'prefill');
                  }
                }}
                className="px-3 py-1.5 bg-[#f6f8f7] hover:bg-[#e1c594]/40 text-[#1c4a59] border border-[#bac4c6] rounded-full text-xs font-bold transition-all cursor-pointer active:scale-[0.97]"
              >
                Open Next Free Slot
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {smartQuickSuggestions.map((rec) => {
              const isSavingThis = savingQuickId === rec.key;
              return (
                <div
                  key={rec.key}
                  className="p-3.5 bg-[#f6f8f7] border border-[#bac4c6] rounded-2xl flex flex-col justify-between gap-3 hover:border-[#1c4a59] transition-colors"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-bold text-[#1c4a59]">
                        {rec.classId} · {rec.subjectName}
                      </span>
                      <span className="text-[11px] font-medium text-[#6a7f84] font-mono tabular-nums">
                        {rec.scheduledCount === 0 ? 'Unscheduled' : `${rec.scheduledCount}x/wk`}
                      </span>
                    </div>

                    <div className="text-xs text-[#1f2a2e] font-medium flex items-center justify-between gap-2">
                      <span className="truncate" title={rec.teacherName}>
                        {rec.teacherName}
                      </span>
                      <span className="text-[#6a7f84] shrink-0">
                        {rec.room}
                      </span>
                    </div>

                    <div className="pt-1 flex items-center justify-between gap-2 text-xs">
                      <span className="inline-flex items-center gap-1.5 font-mono tabular-nums font-bold text-[#1f2a2e]">
                        <span className="w-2 h-2 rounded-full bg-[#06d6a0]" />
                        {rec.day.slice(0, 3)} {rec.startTime} - {rec.endTime}
                      </span>
                      <span className="text-[11px] text-[#6a7f84]">
                        {rec.fromDatabase ? 'DB Period' : 'Standard Slot'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#bac4c6]/60">
                    <button
                      type="button"
                      onClick={() => handleApplyQuickSuggestion(rec, 'prefill')}
                      disabled={syncState === 'saving'}
                      className="px-3 py-1.5 bg-white hover:bg-[#e1c594]/30 text-[#1f2a2e] border border-[#bac4c6] rounded-full text-xs font-bold transition-all cursor-pointer active:scale-[0.97] disabled:opacity-50"
                    >
                      Pre-fill
                    </button>
                    <button
                      type="button"
                      onClick={() => handleApplyQuickSuggestion(rec, 'instant')}
                      disabled={syncState === 'saving'}
                      className="px-3.5 py-1.5 bg-[#faae57] hover:bg-[#e4ae67] text-[#1f2a2e] rounded-full text-xs font-bold transition-all cursor-pointer active:scale-[0.97] disabled:opacity-50 flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      {isSavingThis
                        ? 'Saving…'
                        : isTeacher
                        ? 'Suggest Now'
                        : 'Schedule Now'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tabs navigation & Print Action row */}
      <div className="flex border-b border-[#bac4c6] items-center justify-between overflow-x-auto print:hidden">
        <div className="flex gap-5">
          <button
            onClick={() => setActiveTab('view')}
            className={`pb-3 text-xs sm:text-sm font-bold tracking-wide border-b-2 transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
              activeTab === 'view' 
                ? 'border-[#1c4a59] text-[#1c4a59]' 
                : 'border-transparent text-[#6a7f84] hover:text-[#1f2a2e]'
            }`}
          >
            <Calendar className="w-4 h-4 text-[#faae57]" />
            Grid Week Outlook
          </button>
          <button
            onClick={() => setActiveTab('class_view')}
            className={`pb-3 text-xs sm:text-sm font-bold tracking-wide border-b-2 transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
              activeTab === 'class_view' 
                ? 'border-[#1c4a59] text-[#1c4a59]' 
                : 'border-transparent text-[#6a7f84] hover:text-[#1f2a2e]'
            }`}
          >
            <Building className="w-4 h-4" />
            Class Grid View
          </button>
          {/* Suggestions tab for Teachers and Admins */}
          {(isTeacher || isAdmin) && (
            <button
              onClick={() => setActiveTab('suggestions')}
              className={`pb-3 text-xs sm:text-sm font-bold tracking-wide border-b-2 transition-all flex items-center gap-2 whitespace-nowrap relative cursor-pointer ${
                activeTab === 'suggestions' 
                  ? 'border-[#1c4a59] text-[#1c4a59]' 
                  : 'border-transparent text-[#6a7f84] hover:text-[#1f2a2e]'
              }`}
            >
              <Clock className="w-4 h-4 text-[#faae57]" />
              Period Suggestions
              {isAdmin && suggestions.filter(s => s.status === 'pending').length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 bg-[#faae57] text-[#1f2a2e] font-bold text-[10px] rounded-full">
                  {suggestions.filter(s => s.status === 'pending').length}
                </span>
              )}
            </button>
          )}

          {isAdmin && (
            <>
              <button
                onClick={() => setActiveTab('manage')}
                className={`pb-3 text-xs sm:text-sm font-bold tracking-wide border-b-2 transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
                  activeTab === 'manage' 
                    ? 'border-[#1c4a59] text-[#1c4a59]' 
                    : 'border-transparent text-[#6a7f84] hover:text-[#1f2a2e]'
                }`}
              >
                <Edit2 className="w-4 h-4" />
                All Slots ({slots.length})
              </button>
              <button
                onClick={() => setActiveTab('diagnose')}
                className={`pb-3 text-xs sm:text-sm font-bold tracking-wide border-b-2 transition-all flex items-center gap-2 whitespace-nowrap relative cursor-pointer ${
                  activeTab === 'diagnose' 
                    ? 'border-[#1c4a59] text-[#1c4a59]' 
                    : 'border-transparent text-[#6a7f84] hover:text-[#1f2a2e]'
                }`}
              >
                <AlertTriangle className="w-4 h-4" />
                Collision Checker
                {detectedConflicts.length > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 bg-[#ef476f] text-white font-bold text-[10px] rounded-full">
                    {detectedConflicts.length}
                  </span>
                )}
              </button>
            </>
          )}
        </div>

        <button 
          onClick={triggerPrint}
          className="ml-4 mb-2 flex items-center gap-2 px-4 py-2 bg-white border border-[#bac4c6] text-[#1c4a59] hover:bg-[#f6f8f7] rounded-full text-xs font-bold transition-all active:scale-95 shadow-2xs whitespace-nowrap cursor-pointer"
        >
          <Printer className="w-3.5 h-3.5 text-[#1c4a59]" />
          Print Timetable
        </button>
      </div>

      {/* Grid view layout Filter Row */}
      {activeTab === 'view' && (
        <div className={`bg-slate-50 border border-slate-200 rounded-xl p-4 gap-4 grid grid-cols-1 ${(isStudent || isParent) ? 'max-w-md' : 'sm:grid-cols-3'} print:hidden`}>
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Filter By Class</label>
            {isStudent ? (
               <div className="w-full border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-black text-indigo-700 bg-indigo-50/50 flex items-center gap-1.5">
                 {studentClass} (My Class)
               </div>
            ) : isParent ? (
              classesList.length <= 1 ? (
                <div className="w-full border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-black text-indigo-700 bg-indigo-50/50 flex items-center gap-1.5">
                  {classesList[0] || 'No Ward Class'} (My Ward's Class)
                </div>
              ) : (
                <select
                  value={selectedClassFilter}
                  onChange={(e) => setSelectedClassFilter(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-800 bg-white"
                >
                  <option value="All">All My Wards' Classes</option>
                  {classesList.map(cls => (
                    <option key={cls} value={cls}>{cls}</option>
                  ))}
                </select>
              )
            ) : (
              <select
                value={selectedClassFilter}
                onChange={(e) => setSelectedClassFilter(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-800 bg-white"
              >
                <option value="All">All Classes / Grades</option>
                {classesList.map(cls => (
                  <option key={cls} value={cls}>{cls}</option>
                ))}
              </select>
            )}
          </div>

          {!isStudent && !isParent && (
            <>
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Filter By Teacher</label>
                <select
                  value={selectedTeacherFilter}
                  onChange={(e) => setSelectedTeacherFilter(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-800 bg-white"
                >
                  <option value="All">All Teachers</option>
                  {teachersList.map(tch => (
                    <option key={tch} value={tch}>{tch}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Filter By Room/Space</label>
                <select
                  value={selectedRoomFilter}
                  onChange={(e) => setSelectedRoomFilter(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-800 bg-white"
                >
                  <option value="All">All Buildings / Rooms</option>
                  {roomsList.map(rm => (
                    <option key={rm} value={rm}>{rm}</option>
                  ))}
                </select>
              </div>
            </>
          )}
        </div>
      )}

      {/* Visual content panes */}
      <div className="print:block">

        {/* Tab 1: Weekly Grid Map View */}
        {activeTab === 'view' && (
          <div className="space-y-4">
            {filteredSlots.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-16 text-center space-y-3 shadow-sm print:hidden">
                <Calendar className="w-12 h-12 text-slate-300 mx-auto" />
                <h4 className="text-md font-black text-slate-800 uppercase tracking-wider">No matching classes scheduled</h4>
                <p className="text-xs text-slate-500 max-w-[400px] mx-auto font-semibold">
                  There are no time blocks matching your current filters. Select "All Classes" or click "Add Time Block" above to get started.
                </p>
              </div>
            ) : (
              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden overflow-x-auto min-w-full">
                <table className="w-full border-collapse text-left text-xs text-slate-700 min-w-[700px] table-fixed">
                  <thead>
                    <tr className="bg-slate-50/50 border-b border-slate-100 text-[10px] uppercase font-black text-slate-500 tracking-widest">
                      <th className="p-4 w-[120px]">Weekday</th>
                      <th className="p-4">Period Blocks Scheduled</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100/80 font-semibold">
                    {WEEKDAYS.map((day) => {
                      const daySlots = filteredSlots.filter(s => s.day === day);
                      return (
                        <tr key={day} className="hover:bg-slate-50/20 transition-colors align-top">
                          <td className="p-4 font-black uppercase text-slate-800 tracking-widest text-[11px] bg-slate-50/20">
                            {day}
                            <span className="block font-medium text-[9px] text-indigo-500 lowercase mt-0.5">
                              ({daySlots.length} blocks)
                            </span>
                          </td>
                          <td className="p-4">
                            {daySlots.length === 0 ? (
                              <span className="text-slate-400 italic font-medium block py-2 text-[11px]">
                                No periods scheduled for {day}s
                              </span>
                            ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 print:grid-cols-2">
                                  {daySlots.map(slot => {
                                    const bellInfo = getBellForSlotTime(slot.startTime, slot.endTime, slot.day);
                                    return (
                                      <div 
                                        key={slot.id} 
                                        className={`p-3.5 rounded-2xl border hover:shadow-sm transition-all relative flex flex-col justify-between group ${
                                          bellInfo.isActiveNow
                                            ? 'bg-emerald-50/70 border-emerald-300'
                                            : 'bg-[#f6f8f7] border-[#e1c594]'
                                        }`}
                                      >
                                        <div>
                                          <div className="flex items-center justify-between gap-1 mb-1.5">
                                            <div className="inline-flex items-center gap-1 bg-white border border-[#bac4c6]/60 rounded-lg px-2 py-0.5 text-[10px] font-bold text-[#1f2a2e] font-mono tabular-nums">
                                              <Clock className="w-3 h-3 text-[#faae57]" />
                                              {slot.startTime} - {slot.endTime}
                                            </div>
                                            <span className="text-[10px] font-bold px-2 py-0.5 bg-[#1c4a59] text-white rounded-lg">
                                              {slot.classId}
                                            </span>
                                          </div>

                                          <h5 className="font-bold text-[#1f2a2e] text-sm leading-tight mt-1">
                                            {slot.subjectName}
                                          </h5>
                                          <p className="text-xs text-[#6a7f84] font-medium mt-1 flex items-center gap-1">
                                            {slot.teacherName}
                                          </p>
                                        </div>

                                        <div className="mt-3 pt-2 border-t border-[#bac4c6]/50 flex items-center justify-between text-[10px] font-bold text-[#6a7f84]">
                                          <span className="flex items-center gap-0.5 bg-white border border-[#bac4c6]/60 text-[#1c4a59] px-2 py-0.5 rounded-md">
                                            {slot.room}
                                          </span>
                                          <span className={`inline-flex items-center gap-1 font-semibold ${
                                            bellInfo.isActiveNow
                                              ? 'text-emerald-700 font-bold'
                                              : bellInfo.isArmed
                                              ? 'text-[#1c4a59]'
                                              : 'text-slate-400'
                                          }`} title={bellInfo.bell ? `Linked Siren Bell: ${bellInfo.bell.label}` : 'Period Bell Chime'}>
                                            <Bell className="w-3 h-3 text-[#faae57]" />
                                            {bellInfo.isActiveNow
                                              ? 'Active Now'
                                              : bellInfo.isArmed
                                              ? 'Bell Armed'
                                              : 'Bell Linked'}
                                          </span>
                                        </div>
                                        
                                        {/* Action button triggers inside grid */}
                                        {!isStudent && (
                                          <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity print:hidden">
                                            <button
                                              onClick={() => handleEditClick(slot)}
                                              className="p-1.5 bg-white border border-[#bac4c6] rounded-lg text-[#1c4a59] hover:bg-[#faae57] hover:text-[#1f2a2e] shadow-2xs cursor-pointer"
                                            >
                                              <Edit2 className="w-3 h-3" />
                                            </button>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Tab: Class Timetable Grid View */}
        {activeTab === 'class_view' && (
          <div className="space-y-6">
            {classesList.length === 0 ? (
              <div className="bg-white border border-slate-205 rounded-2xl p-16 text-center space-y-3 shadow-sm print:hidden">
                <Building className="w-12 h-12 text-slate-300 mx-auto" />
                <h4 className="text-md font-black text-slate-800 uppercase tracking-wider">No classes registered in the system</h4>
                <p className="text-xs text-slate-500 max-w-[400px] mx-auto font-semibold">
                  To view timetables by class, please create classes in Academic Management or click "Add Time Block" above.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Horizontal Class Picker Pills */}
                {!isStudent && !isParent ? (
                  <div className="flex flex-wrap items-center gap-2 print:hidden bg-slate-50 p-3 rounded-2xl border border-slate-200">
                    <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider mr-2">Select Class:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {classesList.map(cls => (
                        <button
                          key={cls}
                          onClick={() => setSelectedClassForGrid(cls)}
                          className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold transition-all duration-150 uppercase tracking-wider border ${
                            currentClass === cls
                              ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-600/10'
                              : 'bg-white hover:bg-slate-50 text-slate-600 border-slate-200'
                          }`}
                        >
                          {cls}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : isParent ? (
                  <div className="space-y-3">
                    <div className="bg-indigo-50/40 border border-indigo-100/70 p-3 rounded-2xl text-xs text-indigo-950 font-extrabold tracking-wide flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5">
                        Showing Timetable for My Ward(s): <b className="text-indigo-700 bg-white border border-indigo-100 px-2 py-0.5 rounded-lg text-xs uppercase tracking-wide">{parentWards.length > 0 ? parentWards.map(w => `${w.firstName} (${w.class})`).join(', ') : 'None'}</b>
                      </span>
                      <span className="text-[10px] text-indigo-400 font-bold uppercase tracking-wider">Protected Parent Access</span>
                    </div>
                    {classesList.length > 1 && (
                      <div className="flex flex-wrap items-center gap-2 print:hidden bg-slate-50 p-3 rounded-2xl border border-slate-200">
                        <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider mr-2">Select Ward's Class:</span>
                        <div className="flex flex-wrap gap-1.5">
                          {classesList.map(cls => (
                            <button
                              key={cls}
                              onClick={() => setSelectedClassForGrid(cls)}
                              className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold transition-all duration-150 uppercase tracking-wider border ${
                                currentClass === cls
                                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-600/10'
                                  : 'bg-white hover:bg-slate-50 text-slate-600 border-slate-200'
                              }`}
                            >
                              {cls}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="bg-indigo-50/40 border border-indigo-100/70 p-3 rounded-2xl text-xs text-indigo-950 font-extrabold tracking-wide flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      Showing Timetable for My Class: <b className="text-indigo-700 bg-white border border-indigo-100 px-2 py-0.5 rounded-lg text-xs uppercase tracking-wide">{studentClass}</b>
                    </span>
                    <span className="text-[10px] text-indigo-400 font-bold uppercase tracking-wider">Standard Student Access</span>
                  </div>
                )}

                {/* Main Class Weekly Grid Calendar */}
                {getTimeSlotsSorted().length === 0 ? (
                  <div className="bg-white border border-slate-200 rounded-2xl p-16 text-center space-y-3 shadow-sm">
                    <Calendar className="w-12 h-12 text-slate-300 mx-auto" />
                    <h4 className="text-md font-black text-slate-800 uppercase tracking-wider">No Scheduled Periods for Class {currentClass}</h4>
                    <p className="text-xs text-slate-500 max-w-[420px] mx-auto font-semibold">
                      This class does not have any weekly lesson periods scheduled yet. Click "Add Time Block" above to begin scheduling.
                    </p>
                  </div>
                ) : (
                  <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden overflow-x-auto min-w-full">
                    <div className="p-4 bg-slate-50/50 border-b border-slate-100 flex items-center justify-between">
                      <h4 className="text-xs font-black text-indigo-950 uppercase tracking-widest flex items-center gap-1.5">
                        <Building className="w-4 h-4 text-indigo-500" />
                        Class: {currentClass} Timetable Matrix
                      </h4>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                        {slots.filter(s => s.classId === currentClass).length} Periods Total
                      </p>
                    </div>

                    <table className="w-full border-collapse text-left text-xs text-slate-700 min-w-[800px] table-fixed">
                      <thead>
                        <tr className="bg-slate-50/30 border-b border-slate-100 text-[10px] uppercase font-black text-slate-500 tracking-widest">
                          <th className="p-4 w-[130px] border-r border-slate-100 text-indigo-600 bg-slate-50/40">Time Period</th>
                          {WEEKDAYS.map(day => (
                            <th key={day} className="p-4 text-center border-r border-slate-100 last:border-r-0">
                              {day}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {getTimeSlotsSorted().map(timeRange => {
                          const [startTime, endTime] = timeRange.split(' - ');
                          const rowBellInfo = getBellForSlotTime(startTime, endTime);
                          return (
                            <tr key={timeRange} className="hover:bg-slate-50/10 align-top">
                              {/* Left-most Time Block Identifier */}
                              <td className="p-4 font-black uppercase text-slate-800 border-r border-slate-100 bg-slate-50/40">
                                <span className="block text-indigo-600 font-black text-[12px] tracking-tight font-mono tabular-nums">{startTime}</span>
                                <span className="block text-slate-400 text-[9px] font-bold tracking-wider mt-0.5 font-mono tabular-nums">to {endTime}</span>
                                <span className={`mt-1.5 inline-flex items-center gap-1 text-[9px] font-bold normal-case ${
                                  rowBellInfo.isActiveNow
                                    ? 'text-emerald-700'
                                    : rowBellInfo.isArmed
                                    ? 'text-indigo-700'
                                    : 'text-slate-400'
                                }`}>
                                  <Bell className="w-2.5 h-2.5 text-[#faae57]" />
                                  {rowBellInfo.isActiveNow
                                    ? 'Active Period'
                                    : rowBellInfo.bell?.label || 'Period Bell'}
                                </span>
                              </td>

                              {/* Weekdays Grid Slots */}
                              {WEEKDAYS.map(day => {
                                const matchedSlots = slots.filter(s => 
                                  s.classId === currentClass && 
                                  s.day === day && 
                                  s.startTime === startTime && 
                                  s.endTime === endTime
                                );

                                return (
                                  <td key={day} className="p-2 border-r border-slate-100 last:border-r-0 relative group min-h-[95px]">
                                    {matchedSlots.length === 0 ? (
                                      /* Unscheduled Slot action link */
                                      (isStudent || isParent) ? (
                                        <div className="w-full h-full min-h-[75px] flex items-center justify-center border border-dashed border-slate-100 rounded-xl bg-slate-50/30">
                                          <span className="text-[10px] text-slate-400 font-bold tracking-wide italic">Free Period</span>
                                        </div>
                                      ) : (
                                        <button
                                          onClick={() => {
                                            setFormClass(currentClass);
                                            setFormDay(day);
                                            setFormStartTime(startTime);
                                            setFormEndTime(endTime);
                                            setFormRoom('Room A');
                                            setFormNotes('');
                                            setEditingSlotId(null);
                                            setIsFormOpen(true);
                                          }}
                                          className="w-full h-full min-h-[75px] flex flex-col items-center justify-center border border-dashed border-slate-200 hover:border-indigo-200 hover:bg-indigo-50/10 rounded-xl transition-all duration-150 group/btn"
                                        >
                                          <Plus className="w-4 h-4 text-slate-300 group-hover/btn:text-indigo-500 hover:scale-110 transition-all" />
                                          <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            {isTeacher ? 'Suggest Period' : 'Add Period'}
                                          </span>
                                        </button>
                                      )
                                    ) : (
                                      <div className="space-y-2">
                                        {matchedSlots.map(slot => (
                                          <div
                                            key={slot.id}
                                            className="p-2.5 rounded-xl border bg-gradient-to-br from-indigo-50/20 to-slate-50/30 border-indigo-100/65 hover:border-indigo-200 hover:shadow-xs transition-all relative"
                                          >
                                            <h5 className="font-extrabold text-slate-900 text-[11px] leading-snug truncate" title={slot.subjectName}>
                                              {slot.subjectName}
                                            </h5>
                                            
                                            <div className="mt-1 text-[9px] font-bold text-slate-500 space-y-0.5">
                                              <p className="truncate"> {slot.teacherName}</p>
                                              <p className="text-indigo-600 font-black tracking-tight bg-indigo-50/55 px-1 rounded inline-block">
                                                 {slot.room}
                                              </p>
                                            </div>

                                            {/* Hover micro-action overlays */}
                                            {isAdmin && (
                                              <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity print:hidden">
                                                <button
                                                  onClick={() => handleEditClick(slot)}
                                                  className="p-1 bg-white border border-slate-100 rounded hover:text-indigo-600 text-slate-400 hover:shadow-sm"
                                                  title="Edit Period"
                                                >
                                                  <Edit2 className="w-2.5 h-2.5" />
                                                </button>
                                                <button
                                                  onClick={() => handleDeleteSlot(slot.id, `${slot.subjectName} (${slot.classId})`)}
                                                  className="p-1 bg-white border border-slate-100 rounded hover:text-red-500 text-slate-400 hover:shadow-sm"
                                                  title="Delete Period"
                                                >
                                                  <Trash2 className="w-2.5 h-2.5" />
                                                </button>
                                              </div>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Manage List View Mode */}
        {activeTab === 'manage' && (
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="p-4 bg-slate-50/50 border-b border-slate-100 flex items-center justify-between">
              <h4 className="text-xs font-black text-slate-950 uppercase tracking-widest">School Wide Time Slots Directory</h4>
              <p className="text-[10px] text-slate-500 font-bold uppercase">{slots.length} Total Registered Slots</p>
            </div>

            {slots.length === 0 ? (
              <div className="p-16 text-center space-y-3">
                <Calendar className="w-12 h-12 text-slate-300 mx-auto" />
                <h5 className="font-black text-slate-800 text-sm uppercase">Timetable Is Empty</h5>
                <p className="text-xs text-slate-500 max-w-sm mx-auto font-medium">Configure recurring lesson blocks and classes to fill school records.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 overflow-x-auto">
                <table className="w-full text-left text-xs font-semibold text-slate-700 min-w-[700px]">
                  <thead>
                    <tr className="bg-slate-55 bg-slate-50/40 text-[9px] uppercase tracking-wider font-extrabold text-slate-400 border-b border-slate-100">
                      <th className="p-3">Class/Grade</th>
                      <th className="p-3">Subject</th>
                      <th className="p-3">Teacher Roster</th>
                      <th className="p-3">Schedule Time</th>
                      <th className="p-3">Assigned Room</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {slots.map(slot => (
                      <tr key={slot.id} className="hover:bg-slate-50/40 border-b border-slate-100/50">
                        <td className="p-3">
                          <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-md text-[10px] font-black">
                            {slot.classId}
                          </span>
                        </td>
                        <td className="p-3 font-extrabold text-slate-900">{slot.subjectName}</td>
                        <td className="p-3 text-slate-500 flex items-center gap-1.5 py-4">
                          <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center font-bold text-[10px] text-slate-500">
                            {slot.teacherName.charAt(0)}
                          </div>
                          {slot.teacherName}
                        </td>
                        <td className="p-3">
                          <span className="text-indigo-600 font-extrabold text-[11px] font-mono tabular-nums block">
                            {slot.day}s, {slot.startTime} - {slot.endTime}
                          </span>
                          {(() => {
                            const bInfo = getBellForSlotTime(slot.startTime, slot.endTime, slot.day);
                            return (
                              <span className="inline-flex items-center gap-1 text-[10px] text-slate-500 font-semibold mt-0.5">
                                <Bell className="w-2.5 h-2.5 text-[#faae57]" />
                                {bInfo.bell ? `${bInfo.bell.label} (${bInfo.isArmed ? 'Armed' : 'Disarmed'})` : 'Auto Period Bell'}
                              </span>
                            );
                          })()}
                        </td>
                        <td className="p-3 text-slate-500">{slot.room}</td>
                        <td className="p-3">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleEditClick(slot)}
                              className="p-1.5 bg-slate-100 hover:bg-slate-200 rounded text-slate-600 hover:text-indigo-600 transition-colors"
                              title="Edit Block"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteSlot(slot.id, `${slot.subjectName} (${slot.classId})`)}
                              className="p-1.5 bg-slate-100 hover:bg-red-50 hover:border-red-200 rounded text-slate-400 hover:text-red-500 transition-colors"
                              title="Delete Block"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Tab: Period Suggestions */}
        {activeTab === 'suggestions' && (
          <div className="space-y-6">
            <div className="p-6 bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="space-y-1 text-center md:text-left">
                <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center justify-center md:justify-start gap-2">
                  <Clock className="w-5 h-5 text-[#1c4a59]" />
                  Lesson Period Suggestions
                </h4>
                <p className="text-xs text-slate-500 font-semibold max-w-[550px]">
                  {isAdmin 
                    ? "Review period requests submitted by teachers. Approved slots will automatically be merged into the active timetable if no collision occurs."
                    : "Suggest recurring period slots directly. Suggestions are verified against existing active slots to avoid scheduling clashes."
                  }
                </p>
              </div>

              {isTeacher && (
                <button
                  onClick={() => {
                    resetForm();
                    setIsFormOpen(true);
                  }}
                  className="px-4 py-2 bg-[#faae57] hover:bg-[#e4ae67] text-[#1f2a2e] rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-md shrink-0 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  Suggest New Period
                </button>
              )}
            </div>

            {suggestions.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-16 text-center space-y-3 shadow-sm">
                <Clock className="w-12 h-12 text-slate-300 mx-auto" />
                <h5 className="font-black text-slate-800 text-sm uppercase">No Suggestions Logged</h5>
                <p className="text-xs text-slate-500 max-w-sm mx-auto font-medium">
                  {isAdmin ? "No teacher has submitted any lesson block suggestions yet." : "You haven't submitted any slot suggestions yet. Click the button above to suggest one!"}
                </p>
              </div>
            ) : (
              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                <div className="p-4 bg-slate-50/50 border-b border-slate-100 flex items-center justify-between">
                  <h4 className="text-xs font-black text-indigo-950 uppercase tracking-widest">
                    {isAdmin ? "All Staff Requests" : "My Suggestion Log"}
                  </h4>
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                    {isAdmin ? `${suggestions.filter(s => s.status === 'pending').length} pending` : `${suggestions.length} total suggestions`}
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs font-semibold text-slate-700 min-w-[800px]">
                    <thead>
                      <tr className="bg-slate-50/30 text-[9px] uppercase tracking-wider font-extrabold text-slate-400 border-b border-slate-100">
                        <th className="p-4">Suggested By</th>
                        <th className="p-4">Target Class</th>
                        <th className="p-4">Subject & Room</th>
                        <th className="p-4">Requested Time</th>
                        <th className="p-4">Conflict Status</th>
                        <th className="p-4">Status</th>
                        {isAdmin && <th className="p-4 text-right">Actions</th>}
                        {!isAdmin && <th className="p-4 text-right">Options</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {suggestions
                        .filter(sug => isAdmin || sug.suggestedBy === user?.fullName)
                        .map(sug => {
                          const tempSlot = { id: sug.id, ...sug };
                          const currentConflicts = getCollisions([...slots, tempSlot]);
                          const hasClash = currentConflicts.some(c => c.slotA.id === sug.id || c.slotB.id === sug.id);
                          const clashInfo = currentConflicts.find(c => c.slotA.id === sug.id || c.slotB.id === sug.id);

                          return (
                            <tr key={sug.id} className="hover:bg-slate-50/20 align-middle">
                              <td className="p-4 font-bold text-slate-900">{sug.suggestedBy}</td>
                              <td className="p-4">
                                <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-md text-[10px] font-black uppercase">
                                  {sug.classId}
                                </span>
                              </td>
                              <td className="p-4">
                                <div className="font-extrabold text-slate-800">{sug.subjectName}</div>
                                <div className="text-[10px] text-indigo-600 font-bold mt-0.5"> {sug.room}</div>
                              </td>
                              <td className="p-4">
                                <span className="text-slate-900 font-extrabold">
                                  {sug.day}
                                </span>
                                <div className="text-[10px] text-slate-500 font-bold mt-0.5">{sug.startTime} - {sug.endTime}</div>
                              </td>
                              <td className="p-4">
                                {sug.status !== 'pending' ? (
                                  <span className="text-slate-400 italic text-[11px]">-</span>
                                ) : hasClash ? (
                                  <div className="text-red-600 text-[10px] max-w-[200px] leading-relaxed flex items-start gap-1">
                                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-red-500 mt-0.5" />
                                    <span>{clashInfo?.message || 'Collision Overlap Detected'}</span>
                                  </div>
                                ) : (
                                  <div className="text-emerald-600 text-[10px] flex items-center gap-1">
                                    <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                                    <span> No collisions found</span>
                                  </div>
                                )}
                              </td>
                              <td className="p-4">
                                <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wide border ${
                                  sug.status === 'approved'
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                    : sug.status === 'rejected'
                                    ? 'bg-rose-50 text-rose-700 border-rose-200'
                                    : 'bg-amber-50 text-amber-700 border-amber-200'
                                }`}>
                                  {sug.status}
                                </span>
                              </td>
                              {isAdmin && (
                                <td className="p-4 text-right">
                                  {sug.status === 'pending' ? (
                                    <div className="flex items-center justify-end gap-1.5 uppercase text-[9px] font-black tracking-wider">
                                      <button
                                        onClick={() => handleApproveSuggestion(sug.id)}
                                        disabled={hasClash}
                                        className={`px-2.5 py-1.5 rounded-lg border flex items-center gap-1 shadow-xs transition-all ${
                                          hasClash
                                            ? 'bg-slate-50 text-slate-400 border-slate-200 cursor-not-allowed'
                                            : 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600 hover:shadow-emerald-600/10'
                                        }`}
                                      >
                                        <CheckCircle className="w-3.5 h-3.5" />
                                        Approve
                                      </button>
                                      <button
                                        onClick={() => handleRejectSuggestion(sug.id)}
                                        className="px-2.5 py-1.5 bg-white border border-slate-200 hover:bg-rose-50 hover:border-rose-150 rounded-lg text-slate-500 hover:text-rose-600 transition-all"
                                      >
                                        Reject
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      onClick={() => handleDeleteSuggestion(sug.id)}
                                      className="p-1.5 bg-slate-50 hover:bg-rose-50 rounded text-slate-400 hover:text-rose-600 transition-all border border-transparent hover:border-rose-100"
                                      title="Delete Suggestion Record"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </td>
                              )}
                              {!isAdmin && (
                                <td className="p-4 text-right">
                                  <button
                                    onClick={() => handleDeleteSuggestion(sug.id)}
                                    className="p-1.5 bg-slate-50 hover:bg-rose-50 rounded text-slate-400 hover:text-rose-600 transition-all border border-transparent hover:border-rose-100"
                                    title="Delete My Suggestion"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </td>
                              )}
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Interactive Double Booking / Collision Checker */}
        {activeTab === 'diagnose' && (
          <div className="space-y-6">
            {/* Quick overview metric */}
            <div className="p-6 bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="space-y-1 text-center md:text-left">
                <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center justify-center md:justify-start gap-2">
                  <UserCheck className="w-5 h-5 text-indigo-600" />
                  School Schedule Diagnostics
                </h4>
                <p className="text-xs text-slate-500 font-semibold max-w-[550px]">
                  The schedule engine analyses overlapping times. No teacher, class, or room should be in two places at once.
                </p>
              </div>

              <div className="bg-slate-50/50 border border-slate-200 rounded-xl p-3 px-6 text-center shrink-0">
                <span className="block text-2xl font-black text-slate-900">
                  {detectedConflicts.length}
                </span>
                <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider">
                  Conflicts Found
                </span>
              </div>
            </div>

            {detectedConflicts.length === 0 ? (
              <div className="bg-emerald-50/30 border border-emerald-100 rounded-2xl p-12 text-center space-y-3 shadow-sm">
                <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto" />
                <h4 className="text-md font-black text-emerald-800 uppercase tracking-wider">Perfect Alignment!</h4>
                <p className="text-xs text-slate-600 font-semibold max-w-[420px] mx-auto">
                  Your timetable structure is 100% collision free. There are no overlapping hours for teachers, classes, or rooms.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {detectedConflicts.map((c, idx) => (
                  <div 
                    key={idx}
                    className="p-4 bg-red-50/50 border border-red-100 rounded-2xl hover:shadow-sm transition-all flex flex-col sm:flex-row items-start gap-4"
                  >
                    <div className="p-2.5 bg-red-100 text-red-700 rounded-xl shrink-0 mt-0.5">
                      <AlertTriangle className="w-5 h-5" />
                    </div>
                    <div className="space-y-1.5 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 bg-red-100 text-red-800 rounded text-[9px] font-black uppercase">
                          {c.type}
                        </span>
                        <span className="text-[11px] font-black text-slate-600">
                          Overlapping {c.slotA.day} Schedule
                        </span>
                      </div>
                      
                      <p className="text-xs text-slate-900 font-extrabold leading-relaxed">
                        {c.message}
                      </p>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3 bg-white p-3 border border-red-100/50 rounded-xl">
                        {/* Slot A details */}
                        <div className="text-[11px] space-y-0.5">
                          <span className="text-slate-400 font-bold block uppercase text-[9px]">Class Period A</span>
                          <span className="font-extrabold text-slate-800">{c.slotA.subjectName} ({c.slotA.classId})</span>
                          <span className="block text-slate-500">Teacher: {c.slotA.teacherName}</span>
                          <span className="block text-indigo-600 font-bold">Time: {c.slotA.startTime} - {c.slotA.endTime}</span>
                          <span className="block text-slate-500">Room: {c.slotA.room}</span>
                        </div>

                        {/* Slot B details */}
                        <div className="text-[11px] space-y-0.5 border-t sm:border-t-0 sm:border-l sm:pl-4 border-slate-100 pt-2 sm:pt-0">
                          <span className="text-slate-400 font-bold block uppercase text-[9px]">Class Period B</span>
                          <span className="font-extrabold text-slate-800">{c.slotB.subjectName} ({c.slotB.classId})</span>
                          <span className="block text-slate-500">Teacher: {c.slotB.teacherName}</span>
                          <span className="block text-indigo-600 font-bold">Time: {c.slotB.startTime} - {c.slotB.endTime}</span>
                          <span className="block text-slate-500">Room: {c.slotB.room}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>

      {/* Edit Form Modal Box */}
      <AnimatePresence>
        {isFormOpen && (
          <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 print:hidden">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg shadow-xl overflow-hidden"
            >
              <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-1.5">
                  <Calendar className="w-5 h-5 text-indigo-600" />
                  {isTeacher ? 'Suggest New Period' : (editingSlotId ? 'Edit Scheduled Period' : 'Add Timetable Block')}
                </h3>
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="p-1 bg-slate-200/60 hover:bg-slate-200 rounded-full text-slate-600 transition-colors"
                >
                  <span className="sr-only">Close</span>
                  X
                </button>
              </div>

              <form onSubmit={handleSaveSlot} className="p-6 space-y-4">
                
                {/* Class and Subject */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider flex items-center justify-between gap-1">
                      <span>Target Class</span>
                      {formClass && (
                        <span className="text-[9px] font-bold text-[#1c4a59] bg-[#1c4a59]/10 px-1.5 py-0.5 rounded normal-case tracking-normal">
                          1. Active
                        </span>
                      )}
                    </label>
                    <select
                      value={formClass}
                      onChange={(e) => handleFormClassChange(e.target.value)}
                      className="w-full border border-[#bac4c6] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1c4a59]/20 focus:border-[#1c4a59] font-semibold text-[#1f2a2e] bg-white transition-colors"
                      required
                    >
                      <option value="" disabled>Select Class</option>
                      {classesList.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider flex items-center justify-between gap-1">
                      <span>Subject</span>
                      {formClass && (
                        <span className="text-[9px] font-bold text-[#1c4a59] bg-[#e1c594]/40 px-1.5 py-0.5 rounded normal-case tracking-normal truncate max-w-[110px]">
                          For {formClass} ({formSubjectGroups.matched.length})
                        </span>
                      )}
                    </label>
                    <select
                      value={formSubject}
                      onChange={(e) => handleFormSubjectChange(e.target.value)}
                      className="w-full border border-[#bac4c6] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1c4a59]/20 focus:border-[#1c4a59] font-semibold text-[#1f2a2e] bg-white transition-colors"
                      required
                    >
                      <option value="" disabled>Select Subject</option>
                      {formClass && formSubjectGroups.others.length > 0 ? (
                        <>
                          {formSubjectGroups.matched.length > 0 && (
                            <optgroup label={`Subjects for ${formClass}`}>
                              {formSubjectGroups.matched.map(s => (
                                <option key={`match-subj-${s}`} value={s}>{s}</option>
                              ))}
                            </optgroup>
                          )}
                          <optgroup label="All Other School Subjects">
                            {formSubjectGroups.others.map(s => (
                              <option key={`other-subj-${s}`} value={s}>{s}</option>
                            ))}
                          </optgroup>
                        </>
                      ) : (
                        subjectsList.map(s => (
                          <option key={s} value={s}>{s}</option>
                        ))
                      )}
                    </select>
                  </div>
                </div>

                {/* Teacher input */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider flex items-center justify-between gap-1">
                    <span>Assigned Teacher</span>
                    {(formClass || formSubject) && (
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded normal-case tracking-normal ${
                        formTeacherGroups.exactMatch.length > 0
                          ? 'text-[#1c4a59] bg-[#06d6a0]/20'
                          : 'text-[#6a7f84] bg-[#f6f8f7]'
                      }`}>
                        {formTeacherGroups.exactMatch.length > 0
                          ? `${formTeacherGroups.exactMatch.length} matched for ${formClass || 'Class'} • ${formSubject || 'Subject'}`
                          : formTeacherGroups.subjectOrClassMatch.length > 0
                          ? `${formTeacherGroups.subjectOrClassMatch.length} related teacher(s)`
                          : 'Showing all teachers'}
                      </span>
                    )}
                  </label>
                  <select
                    value={formTeacher}
                    onChange={(e) => handleFormTeacherChange(e.target.value)}
                    className="w-full border border-[#bac4c6] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1c4a59]/20 focus:border-[#1c4a59] font-semibold text-[#1f2a2e] bg-white transition-colors"
                    required
                  >
                    <option value="" disabled>Select Teacher</option>
                    {(formTeacherGroups.exactMatch.length > 0 || formTeacherGroups.subjectOrClassMatch.length > 0) &&
                     (formTeacherGroups.others.length > 0 || (formTeacherGroups.exactMatch.length > 0 && formTeacherGroups.subjectOrClassMatch.length > 0)) ? (
                      <>
                        {formTeacherGroups.exactMatch.length > 0 && (
                          <optgroup label={`Assigned to ${formClass || 'Selected Class'} • ${formSubject || 'Selected Subject'}`}>
                            {formTeacherGroups.exactMatch.map(t => (
                              <option key={`exact-t-${t}`} value={t}>{t} ★</option>
                            ))}
                          </optgroup>
                        )}
                        {formTeacherGroups.subjectOrClassMatch.length > 0 && (
                          <optgroup label={`Matching ${formSubject || 'Subject'} or ${formClass || 'Class'} Teachers`}>
                            {formTeacherGroups.subjectOrClassMatch.map(t => (
                              <option key={`rel-t-${t}`} value={t}>{t}</option>
                            ))}
                          </optgroup>
                        )}
                        {formTeacherGroups.others.length > 0 && (
                          <optgroup label="All Other School Teachers">
                            {formTeacherGroups.others.map(t => (
                              <option key={`other-t-${t}`} value={t}>{t}</option>
                            ))}
                          </optgroup>
                        )}
                      </>
                    ) : (
                      teachersList.map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))
                    )}
                  </select>
                </div>

                {/* Quick Course Combos for Selected Class */}
                {modalCourseQuickCombos.length > 0 && (
                  <div className="space-y-1.5 bg-[#f6f8f7] border border-[#bac4c6]/70 rounded-xl p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-bold text-[#1c4a59]">
                        Quick Course Suggestions {formClass ? `for ${formClass}` : ''}
                      </span>
                      <span className="text-[11px] text-[#6a7f84]">
                        Click to auto-fill Subject, Teacher & next free time
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      {modalCourseQuickCombos.map(combo => {
                        const isActiveCombo =
                          formSubject.toLowerCase() === combo.subjectName.toLowerCase() &&
                          formTeacher.toLowerCase() === combo.teacherName.toLowerCase();
                        return (
                          <button
                            key={`${combo.classId}-${combo.subjectName}`}
                            type="button"
                            onClick={() => {
                              setFormClass(combo.classId);
                              setFormSubject(combo.subjectName);
                              if (combo.teacherName) {
                                setFormTeacher(combo.teacherName);
                              }
                              const freeWin = findNextConflictFreeWindow(
                                combo.classId,
                                combo.teacherName || formTeacher,
                                formRoom || 'Room A',
                                formDay,
                                slots,
                                editingSlotId
                              );
                              setFormDay(freeWin.day);
                              setFormStartTime(freeWin.startTime);
                              setFormEndTime(freeWin.endTime);
                              setFormRoom(freeWin.room);
                            }}
                            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer active:scale-[0.97] border flex items-center gap-1.5 ${
                              isActiveCombo
                                ? 'bg-[#1c4a59] text-white border-[#1c4a59]'
                                : 'bg-white hover:bg-[#e1c594]/30 text-[#1f2a2e] border-[#bac4c6]'
                            }`}
                          >
                            <span>{combo.subjectName}</span>
                            {combo.teacherName && (
                              <span className={`text-[10px] ${isActiveCombo ? 'text-white/80' : 'text-[#6a7f84]'}`}>
                                · {combo.teacherName.split(' ')[0]}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Day selector */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">
                      Weekday
                    </label>
                    <select
                      value={formDay}
                      onChange={(e) => setFormDay(e.target.value as any)}
                      className="w-full border border-[#bac4c6] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1c4a59]/20 focus:border-[#1c4a59] font-semibold text-[#1f2a2e] bg-white"
                    >
                      {WEEKDAYS.map(day => (
                        <option key={day} value={day}>{day}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">
                      Room / Building Location
                    </label>
                    <input
                      type="text"
                      list="rooms-autocomplete"
                      value={formRoom}
                      onChange={(e) => setFormRoom(e.target.value)}
                      placeholder="e.g. Room A"
                      className="w-full border border-[#bac4c6] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1c4a59]/20 focus:border-[#1c4a59] font-semibold text-[#1f2a2e]"
                    />
                    <datalist id="rooms-autocomplete">
                      {roomsList.map(r => <option key={r} value={r} />)}
                    </datalist>
                  </div>
                </div>

                {/* Quick Time Period Suggestions & Auto-Find Conflict-Free Slot */}
                <div className="space-y-2 bg-[#f6f8f7] border border-[#bac4c6]/70 rounded-xl p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] font-bold text-[#1c4a59] flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-[#faae57]" />
                      Quick Time Period Suggestions ({formDay})
                    </span>
                    <button
                      type="button"
                      onClick={handleJumpToNextFreeSlot}
                      className="px-2.5 py-1 bg-[#faae57] hover:bg-[#e4ae67] text-[#1f2a2e] rounded-full text-[11px] font-bold transition-all cursor-pointer active:scale-[0.97]"
                    >
                      Auto-Pick Next Free Slot
                    </button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                    {modalTimePresetsWithStatus.map((preset) => (
                      <button
                        key={`${preset.startTime}-${preset.endTime}`}
                        type="button"
                        onClick={() => {
                          setFormStartTime(preset.startTime);
                          setFormEndTime(preset.endTime);
                        }}
                        title={preset.isFree ? `${preset.label}: Conflict-free on ${formDay}` : `Clash: ${preset.clashReason}`}
                        className={`px-2 py-1.5 rounded-lg border text-left transition-all cursor-pointer active:scale-[0.97] ${
                          preset.isSelected
                            ? 'bg-[#1c4a59] text-white border-[#1c4a59]'
                            : preset.isFree
                            ? 'bg-white hover:bg-[#e1c594]/30 text-[#1f2a2e] border-[#bac4c6]'
                            : 'bg-white/70 text-[#6a7f84] border-[#ef476f]/50'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-[10px] font-bold truncate">
                            {preset.label}
                          </span>
                          <span
                            className={`w-2 h-2 rounded-full shrink-0 ${
                              preset.isFree ? 'bg-[#06d6a0]' : 'bg-[#ef476f]'
                            }`}
                          />
                        </div>
                        <div className={`text-[11px] font-mono tabular-nums font-bold mt-0.5 ${
                          preset.isSelected ? 'text-white' : 'text-[#1f2a2e]'
                        }`}>
                          {preset.startTime}-{preset.endTime}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Time picker */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-[#1c4a59]" />
                      Start Time
                    </label>
                    <input
                      type="time"
                      value={formStartTime}
                      onChange={(e) => setFormStartTime(e.target.value)}
                      className="w-full border border-[#bac4c6] rounded-xl px-3 py-2 text-sm font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-[#1c4a59]/20 focus:border-[#1c4a59] font-semibold text-[#1f2a2e]"
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-[#1c4a59]" />
                      End Time
                    </label>
                    <input
                      type="time"
                      value={formEndTime}
                      onChange={(e) => setFormEndTime(e.target.value)}
                      className="w-full border border-[#bac4c6] rounded-xl px-3 py-2 text-sm font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-[#1c4a59]/20 focus:border-[#1c4a59] font-semibold text-[#1f2a2e]"
                      required
                    />
                  </div>
                </div>

                {/* Additional notes */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">
                    Notes / Lesson Objectives (Optional)
                  </label>
                  <textarea
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                    placeholder="e.g. Double period for algebra exercises"
                    rows={2}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-semibold text-slate-800"
                  />
                </div>

                <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2 text-xs uppercase font-extrabold tracking-wider">
                  <button
                    type="button"
                    onClick={() => setIsFormOpen(false)}
                    disabled={syncState === 'saving'}
                    className="px-4 py-2 hover:bg-slate-50 border border-slate-200 rounded-xl text-slate-600 transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={syncState === 'saving'}
                    className="px-4 py-2 bg-[#faae57] hover:bg-[#e4ae67] text-[#1f2a2e] rounded-xl transition-all shadow-md disabled:opacity-50 cursor-pointer"
                  >
                    {syncState === 'saving'
                      ? 'Saving to Supabase…'
                      : isTeacher
                      ? 'Submit Suggestion'
                      : editingSlotId
                      ? 'Update Block'
                      : 'Add Slot'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
