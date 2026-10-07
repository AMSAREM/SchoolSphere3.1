import React, { useState, useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/schema';
import {
  Calendar,
  Clock,
  Plus,
  Trash2,
  Edit2,
  Printer,
  CheckCircle2,
  Search,
  UserCheck,
  FileText,
  RefreshCw,
  Download,
  Award,
  AlertTriangle,
  X,
  ClipboardCheck,
  Sparkles,
  ShieldCheck
} from 'lucide-react';
import { cn, triggerPrint } from '../lib/utils';
import { useNotifications } from '../contexts/NotificationContext';
import { useAuth } from '../contexts/AuthContext';
import { getApiHeaders } from '../lib/api';

export interface DutyAssignment {
  id: string;
  weekNumber: number;
  weekStartDate: string;
  weekEndDate: string;
  day: 'All Week' | 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday';
  teacherName: string;
  teacherPhone?: string;
  roleType: 'senior_on_duty' | 'member';
  dutyPost: string;
  shiftTime: string;
  notes: string;
  status: 'scheduled' | 'active' | 'completed';
  updatedAt: number;
}

export interface DutyLogEntry {
  id: string;
  weekNumber: number;
  date: string;
  loggedByTeacher: string;
  sanitationRating: 'Excellent' | 'Good' | 'Fair' | 'Needs Attention';
  assemblyNotes: string;
  incidentsReported: string;
  handoverRemarks: string;
  endorsedBy?: string | null;
  endorsedAt?: number | null;
  createdAt: number;
}

const DUTY_POSTS = [
  'Morning Gate & Assembly Inspection',
  'Sanitation & Compound Supervision',
  'First Break & Canteen Supervision',
  'Second Break & Dining Supervision',
  'Prep & Library Supervision',
  'Closing & Bus Loading Supervision',
  'General Campus Patrol & Welfare'
];

const SHIFT_TIMES = [
  'Full Day (06:45 - 15:30)',
  'Morning Shift (06:45 - 08:15)',
  'First Break (10:15 - 10:45)',
  'Lunch / Second Break (12:30 - 13:15)',
  'Afternoon / Prep (13:30 - 14:30)',
  'Closing Shift (14:30 - 15:30)'
];

const DAYS_OPTIONS: DutyAssignment['day'][] = [
  'All Week',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday'
];

function computeWeekDateRange(baseStartIso: string, weekIndexOneBased: number): {
  start: string;
  end: string;
} {
  const base = baseStartIso ? new Date(baseStartIso) : new Date();
  if (isNaN(base.getTime())) {
    const today = new Date();
    const iso = today.toISOString().split('T')[0];
    return { start: iso, end: iso };
  }
  const offsetDays = (weekIndexOneBased - 1) * 7;
  const startDate = new Date(base.getTime() + offsetDays * 86400000);
  const endDate = new Date(startDate.getTime() + 4 * 86400000);
  return {
    start: startDate.toISOString().split('T')[0],
    end: endDate.toISOString().split('T')[0]
  };
}

export default function DutyRosterManagement({ embedded = false }: { embedded?: boolean }) {
  const { user, school } = useAuth();
  const { showToast, confirm } = useNotifications();

  const userRole = String(user?.role || 'teacher').toLowerCase();
  const canManageRoster = ['super_admin', 'creator', 'admin', 'headteacher', 'hod'].includes(userRole);
  const canEndorseLogs = ['super_admin', 'creator', 'admin', 'headteacher'].includes(userRole);

  const settings = useLiveQuery(() => db.settings.toArray()) || [];
  const teachersInDB = useLiveQuery(() => db.teachers.toArray()) || [];

  const schoolProfile = useMemo(
    () => settings.find((s) => s.key === 'schoolProfile')?.value || {},
    [settings]
  );
  const schoolName =
    school?.name || schoolProfile?.schoolName || 'SCHOOLSPHERE PORTAL';
  const currentTerm = schoolProfile?.current_term || 'Term 1';
  const academicYear = schoolProfile?.academic_year || '2026/2027';
  const activeSchoolId = String(school?.id || (user as any)?.school_id || '');

  // Main Sub-View: Roster vs Daily Logbook
  const [activeSubTab, setActiveSubTab] = useState<'roster' | 'logbook'>('roster');

  // Filter States
  const [selectedWeek, setSelectedWeek] = useState<number | 'all'>(1);
  const [selectedDay, setSelectedDay] = useState<string>('All');
  const [selectedPost, setSelectedPost] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Data States
  const [assignments, setAssignments] = useState<DutyAssignment[]>([]);
  const [logs, setLogs] = useState<DutyLogEntry[]>([]);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  // Assignment Modal States
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<DutyAssignment | null>(null);
  const [formWeek, setFormWeek] = useState<number>(1);
  const [formWeekStart, setFormWeekStart] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [formWeekEnd, setFormWeekEnd] = useState<string>(() => {
    const d = new Date(Date.now() + 4 * 86400000);
    return d.toISOString().split('T')[0];
  });
  const [formDay, setFormDay] = useState<DutyAssignment['day']>('All Week');
  const [formTeacherName, setFormTeacherName] = useState<string>('');
  const [formTeacherPhone, setFormTeacherPhone] = useState<string>('');
  const [formRoleType, setFormRoleType] = useState<'senior_on_duty' | 'member'>('member');
  const [formDutyPost, setFormDutyPost] = useState<string>(DUTY_POSTS[0]);
  const [formShiftTime, setFormShiftTime] = useState<string>(SHIFT_TIMES[0]);
  const [formNotes, setFormNotes] = useState<string>('');

  // Auto-Generator Modal States
  const [isAutoModalOpen, setIsAutoModalOpen] = useState(false);
  const [autoWeeksCount, setAutoWeeksCount] = useState<number>(8);
  const [autoTeachersPerWeek, setAutoTeachersPerWeek] = useState<number>(3);
  const [autoStartDate, setAutoStartDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [autoReplaceExisting, setAutoReplaceExisting] = useState<boolean>(true);

  // Logbook Modal States
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);
  const [logWeek, setLogWeek] = useState<number>(1);
  const [logDate, setLogDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [logTeacher, setLogTeacher] = useState<string>(
    user?.fullName || user?.username || ''
  );
  const [logSanitation, setLogSanitation] = useState<DutyLogEntry['sanitationRating']>('Good');
  const [logAssembly, setLogAssembly] = useState<string>('');
  const [logIncidents, setLogIncidents] = useState<string>('');
  const [logHandover, setLogHandover] = useState<string>('');

  const availableTeachers = useMemo(() => {
    return teachersInDB.map((t) => ({
      fullName: `${t.firstName} ${t.lastName}`.trim(),
      phone: t.phone || '',
      staffId: t.staffId || ''
    }));
  }, [teachersInDB]);

  // Persist locally in Dexie settings + sync with Supabase backend
  const persistRosterData = async (
    nextAssignments: DutyAssignment[],
    nextLogs: DutyLogEntry[],
    silent = false
  ) => {
    setAssignments(nextAssignments);
    setLogs(nextLogs);

    try {
      const existing = await db.settings.where('key').equals('dutyRosterData').first();
      const payloadValue = {
        schoolId: activeSchoolId,
        assignments: nextAssignments,
        logs: nextLogs,
        updatedAt: Date.now()
      };
      if (existing?.id) {
        await db.settings.update(existing.id, { value: payloadValue });
      } else {
        await db.settings.add({ key: 'dutyRosterData', value: payloadValue });
      }
    } catch {}

    try {
      if (!silent) setIsSyncing(true);
      await fetch('/api/duty-roster/sync', {
        method: 'POST',
        headers: getApiHeaders(),
        body: JSON.stringify({
          schoolId: activeSchoolId,
          schoolName,
          assignments: nextAssignments,
          logs: nextLogs
        })
      });
    } catch (err) {
      console.warn('Notice syncing duty roster to cloud:', err);
    } finally {
      if (!silent) setIsSyncing(false);
    }
  };

  const fetchCloudDutyRoster = async (silent = false) => {
    if (!silent) setIsSyncing(true);
    try {
      const qs = activeSchoolId ? `?schoolId=${encodeURIComponent(activeSchoolId)}` : '';
      const res = await fetch(`/api/duty-roster${qs}`, {
        headers: getApiHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data?.assignments) || Array.isArray(data?.logs)) {
          const remoteAssignments = Array.isArray(data.assignments) ? data.assignments : [];
          const remoteLogs = Array.isArray(data.logs) ? data.logs : [];
          if (remoteAssignments.length > 0 || remoteLogs.length > 0) {
            setAssignments(remoteAssignments);
            setLogs(remoteLogs);
            const existing = await db.settings.where('key').equals('dutyRosterData').first();
            const payloadValue = {
              schoolId: activeSchoolId,
              assignments: remoteAssignments,
              logs: remoteLogs,
              updatedAt: Date.now()
            };
            if (existing?.id) {
              await db.settings.update(existing.id, { value: payloadValue });
            } else {
              await db.settings.add({ key: 'dutyRosterData', value: payloadValue });
            }
            return;
          }
        }
      }
    } catch {} finally {
      if (!silent) setIsSyncing(false);
    }

    // Fallback to local Dexie settings if cloud has no records yet
    try {
      const localSetting = await db.settings.where('key').equals('dutyRosterData').first();
      if (localSetting?.value) {
        if (Array.isArray(localSetting.value.assignments)) {
          setAssignments(localSetting.value.assignments);
        }
        if (Array.isArray(localSetting.value.logs)) {
          setLogs(localSetting.value.logs);
        }
      }
    } catch {}
  };

  useEffect(() => {
    fetchCloudDutyRoster(false);
  }, [activeSchoolId]);

  const filteredAssignments = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return assignments
      .filter((a) => {
        if (selectedWeek !== 'all' && Number(a.weekNumber) !== Number(selectedWeek)) {
          return false;
        }
        if (selectedDay !== 'All' && a.day !== selectedDay) {
          return false;
        }
        if (selectedPost !== 'All' && a.dutyPost !== selectedPost) {
          return false;
        }
        if (q) {
          const hay = `${a.teacherName} ${a.dutyPost} ${a.shiftTime} ${a.notes} ${a.day}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (a.weekNumber !== b.weekNumber) return a.weekNumber - b.weekNumber;
        if (a.roleType !== b.roleType) return a.roleType === 'senior_on_duty' ? -1 : 1;
        return a.teacherName.localeCompare(b.teacherName);
      });
  }, [assignments, selectedWeek, selectedDay, selectedPost, searchQuery]);

  const activeWeekSummary = useMemo(() => {
    const targetWeek = selectedWeek === 'all' ? 1 : selectedWeek;
    const weekItems = assignments.filter((a) => Number(a.weekNumber) === Number(targetWeek));
    const senior = weekItems.find((a) => a.roleType === 'senior_on_duty');
    const uniquePosts = new Set(weekItems.map((a) => a.dutyPost)).size;
    const weekLogs = logs.filter((l) => Number(l.weekNumber) === Number(targetWeek));
    const dateRange =
      weekItems[0]?.weekStartDate && weekItems[0]?.weekEndDate
        ? `${weekItems[0].weekStartDate} to ${weekItems[0].weekEndDate}`
        : 'Term Schedule';
    return {
      weekNumber: targetWeek,
      seniorOnDuty: senior?.teacherName || 'Not Designated Yet',
      seniorPhone: senior?.teacherPhone || '',
      totalAssigned: weekItems.length,
      postsCovered: uniquePosts,
      logsCount: weekLogs.length,
      dateRange
    };
  }, [assignments, logs, selectedWeek]);

  const openCreateAssignmentModal = () => {
    const defaultWk = selectedWeek === 'all' ? 1 : selectedWeek;
    const range = computeWeekDateRange(new Date().toISOString().split('T')[0], defaultWk);
    setEditingAssignment(null);
    setFormWeek(defaultWk);
    setFormWeekStart(range.start);
    setFormWeekEnd(range.end);
    setFormDay('All Week');
    setFormTeacherName(availableTeachers[0]?.fullName || '');
    setFormTeacherPhone(availableTeachers[0]?.phone || '');
    setFormRoleType('member');
    setFormDutyPost(DUTY_POSTS[0]);
    setFormShiftTime(SHIFT_TIMES[0]);
    setFormNotes('');
    setIsAssignModalOpen(true);
  };

  const openEditAssignmentModal = (item: DutyAssignment) => {
    setEditingAssignment(item);
    setFormWeek(item.weekNumber);
    setFormWeekStart(item.weekStartDate);
    setFormWeekEnd(item.weekEndDate);
    setFormDay(item.day);
    setFormTeacherName(item.teacherName);
    setFormTeacherPhone(item.teacherPhone || '');
    setFormRoleType(item.roleType);
    setFormDutyPost(item.dutyPost);
    setFormShiftTime(item.shiftTime);
    setFormNotes(item.notes || '');
    setIsAssignModalOpen(true);
  };

  const handleSaveAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTeacherName.trim()) {
      showToast('Please select or enter a teacher name.', 'warning');
      return;
    }

    const newRecord: DutyAssignment = {
      id: editingAssignment?.id || `DUTY-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      weekNumber: Number(formWeek) || 1,
      weekStartDate: formWeekStart,
      weekEndDate: formWeekEnd,
      day: formDay,
      teacherName: formTeacherName.trim(),
      teacherPhone: formTeacherPhone.trim(),
      roleType: formRoleType,
      dutyPost: formDutyPost,
      shiftTime: formShiftTime,
      notes: formNotes.trim(),
      status: editingAssignment?.status || 'scheduled',
      updatedAt: Date.now()
    };

    const nextList = editingAssignment
      ? assignments.map((a) => (a.id === editingAssignment.id ? newRecord : a))
      : [newRecord, ...assignments];

    await persistRosterData(nextList, logs);
    setIsAssignModalOpen(false);
    showToast(
      editingAssignment
        ? `Updated duty assignment for ${newRecord.teacherName}.`
        : `Assigned ${newRecord.teacherName} to Week ${newRecord.weekNumber} (${newRecord.dutyPost}).`,
      'success'
    );
  };

  const handleDeleteAssignment = async (item: DutyAssignment) => {
    const ok = await confirm({
      title: 'Remove Duty Assignment',
      message: `Remove ${item.teacherName} from Week ${item.weekNumber} (${item.dutyPost})?`,
      confirmText: 'Remove'
    });
    if (!ok) return;
    const nextList = assignments.filter((a) => a.id !== item.id);
    await persistRosterData(nextList, logs);
    showToast('Duty assignment removed.', 'info');
  };

  const handleCycleStatus = async (item: DutyAssignment) => {
    const order: DutyAssignment['status'][] = ['scheduled', 'active', 'completed'];
    const nextStatus = order[(order.indexOf(item.status) + 1) % order.length];
    const nextList = assignments.map((a) =>
      a.id === item.id ? { ...a, status: nextStatus, updatedAt: Date.now() } : a
    );
    await persistRosterData(nextList, logs, true);
  };

  const handleAutoGenerateRotation = async (e: React.FormEvent) => {
    e.preventDefault();
    const pool =
      availableTeachers.length > 0
        ? availableTeachers
        : [
            { fullName: 'Mr. Kwame Boateng', phone: '0551187045', staffId: 'STF-01' },
            { fullName: 'Mrs. Abena Mensah', phone: '0554234590', staffId: 'STF-02' },
            { fullName: 'Mr. Kofi Owusu', phone: '', staffId: 'STF-03' },
            { fullName: 'Ms. Efua Osei', phone: '', staffId: 'STF-04' }
          ];

    const generated: DutyAssignment[] = [];
    const totalWeeks = Math.max(1, Math.min(15, Number(autoWeeksCount) || 8));
    const perWeek = Math.max(1, Math.min(8, Number(autoTeachersPerWeek) || 3));

    let teacherCursor = 0;
    for (let wk = 1; wk <= totalWeeks; wk++) {
      const range = computeWeekDateRange(autoStartDate, wk);
      for (let slot = 0; slot < perWeek; slot++) {
        const teacher = pool[teacherCursor % pool.length];
        teacherCursor++;
        const isSenior = slot === 0;
        const post = DUTY_POSTS[slot % DUTY_POSTS.length];
        const shift = isSenior
          ? 'Full Day (06:45 - 15:30)'
          : SHIFT_TIMES[(slot % (SHIFT_TIMES.length - 1)) + 1];

        generated.push({
          id: `DUTY-AUTO-W${wk}-S${slot}-${Date.now()}`,
          weekNumber: wk,
          weekStartDate: range.start,
          weekEndDate: range.end,
          day: 'All Week',
          teacherName: teacher.fullName,
          teacherPhone: teacher.phone,
          roleType: isSenior ? 'senior_on_duty' : 'member',
          dutyPost: post,
          shiftTime: shift,
          notes: isSenior
            ? 'Coordinates daily assembly, inspection logbook, and staff duty supervision.'
            : 'Supervise assigned station and report occurrences to Senior on Duty.',
          status: wk === 1 ? 'active' : 'scheduled',
          updatedAt: Date.now()
        });
      }
    }

    const nextList = autoReplaceExisting ? generated : [...generated, ...assignments];
    await persistRosterData(nextList, logs);
    setIsAutoModalOpen(false);
    setSelectedWeek(1);
    showToast(
      `Generated balanced ${totalWeeks}-week duty roster across ${pool.length} staff members.`,
      'success'
    );
  };

  const handleSaveLogEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!logAssembly.trim() && !logIncidents.trim()) {
      showToast('Please enter assembly notes or daily occurrence observations.', 'warning');
      return;
    }

    const entry: DutyLogEntry = {
      id: `DLOG-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      weekNumber: Number(logWeek) || 1,
      date: logDate,
      loggedByTeacher: logTeacher.trim() || user?.fullName || user?.username || 'Teacher on Duty',
      sanitationRating: logSanitation,
      assemblyNotes: logAssembly.trim(),
      incidentsReported: logIncidents.trim() || 'No major incidents reported.',
      handoverRemarks: logHandover.trim(),
      endorsedBy: null,
      endorsedAt: null,
      createdAt: Date.now()
    };

    const nextLogs = [entry, ...logs];
    await persistRosterData(assignments, nextLogs);
    setIsLogModalOpen(false);
    setLogAssembly('');
    setLogIncidents('');
    setLogHandover('');
    showToast(`Daily duty log recorded for Week ${entry.weekNumber} (${entry.date}).`, 'success');
  };

  const handleEndorseLog = async (entry: DutyLogEntry) => {
    if (!canEndorseLogs) return;
    const endorserName = user?.fullName || user?.username || 'Headteacher / Admin';
    const nextLogs = logs.map((l) =>
      l.id === entry.id
        ? { ...l, endorsedBy: endorserName, endorsedAt: Date.now() }
        : l
    );
    await persistRosterData(assignments, nextLogs);
    showToast(`Duty log for ${entry.date} endorsed by ${endorserName}.`, 'success');
  };

  const handleExportCsv = () => {
    if (filteredAssignments.length === 0) {
      showToast('No duty assignments to export.', 'warning');
      return;
    }
    const headers = [
      'Week',
      'Start Date',
      'End Date',
      'Day',
      'Teacher Name',
      'Phone',
      'Role',
      'Duty Post',
      'Shift Time',
      'Status',
      'Notes'
    ];
    const rows = filteredAssignments.map((a) => [
      `Week ${a.weekNumber}`,
      a.weekStartDate,
      a.weekEndDate,
      a.day,
      `"${a.teacherName.replace(/"/g, '""')}"`,
      a.teacherPhone || '',
      a.roleType === 'senior_on_duty' ? 'Senior on Duty' : 'Duty Member',
      `"${a.dutyPost.replace(/"/g, '""')}"`,
      `"${a.shiftTime}"`,
      a.status,
      `"${(a.notes || '').replace(/"/g, '""')}"`
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${schoolName.replace(/\s+/g, '_')}_Teachers_Duty_Roster.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5 text-[#1f2a2e] min-w-0">
      {/* Official Print-Only Header */}
      <div className="only-print border-b-2 border-slate-900 pb-4 mb-6">
        <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight text-center">
          {schoolName}
        </h1>
        <p className="text-xs font-bold text-slate-700 uppercase tracking-widest text-center mt-1">
          Official Staff Supervision &amp; Teachers Duty Roster · {academicYear} ({currentTerm})
        </p>
        <div className="mt-3 flex items-center justify-between text-xs font-semibold text-slate-700 border-t border-slate-300 pt-2">
          <span>
            Scope: {selectedWeek === 'all' ? 'Full Term Roster' : `Week ${selectedWeek} (${activeWeekSummary.dateRange})`}
          </span>
          <span>Senior on Duty: {activeWeekSummary.seniorOnDuty}</span>
          <span>Printed: {new Date().toLocaleDateString('en-GB')}</span>
        </div>
      </div>

      {/* Top Header & Sub-Navigation Card */}
      <div className="bg-white border border-[#bac4c6] rounded-2xl p-4 sm:p-5 shadow-2xs print:hidden space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs text-[#6a7f84] font-medium">
              <span>Staff Supervision</span>
              <span aria-hidden="true">·</span>
              <span>{academicYear}</span>
              <span aria-hidden="true">·</span>
              <span>{currentTerm}</span>
            </div>
            <h2 className="text-lg sm:text-xl font-bold text-[#1c4a59] tracking-tight mt-0.5">
              Teachers Duty Roster &amp; Daily Occurrence Logbook
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Sub-View Switcher: Roster Schedule vs Daily Logbook */}
            <div className="flex items-center gap-1 p-1 bg-[#f6f8f7] border border-[#bac4c6] rounded-xl">
              <button
                type="button"
                onClick={() => setActiveSubTab('roster')}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap',
                  activeSubTab === 'roster'
                    ? 'bg-[#1c4a59] text-white'
                    : 'text-[#6a7f84] hover:text-[#1f2a2e]'
                )}
              >
                <Calendar className="w-3.5 h-3.5 text-[#faae57]" />
                <span>Duty Schedule ({assignments.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveSubTab('logbook')}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap',
                  activeSubTab === 'logbook'
                    ? 'bg-[#1c4a59] text-white'
                    : 'text-[#6a7f84] hover:text-[#1f2a2e]'
                )}
              >
                <ClipboardCheck className="w-3.5 h-3.5 text-[#faae57]" />
                <span>Daily Duty Logbook ({logs.length})</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => fetchCloudDutyRoster(false)}
              disabled={isSyncing}
              className="p-2 rounded-xl border border-[#bac4c6] bg-[#f6f8f7] hover:bg-white text-[#1c4a59] transition-colors cursor-pointer disabled:opacity-50"
              title="Sync Duty Roster with Supabase"
            >
              <RefreshCw className={cn('w-4 h-4', isSyncing && 'animate-spin')} />
            </button>

            <button
              type="button"
              onClick={handleExportCsv}
              className="px-3 py-2 rounded-xl border border-[#bac4c6] bg-[#f6f8f7] hover:bg-white text-[#1c4a59] text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Export CSV</span>
            </button>

            <button
              type="button"
              onClick={() => triggerPrint()}
              className="px-3 py-2 rounded-xl border border-[#bac4c6] bg-[#f6f8f7] hover:bg-white text-[#1c4a59] text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Roster</span>
            </button>
          </div>
        </div>

        {/* Weekly Command Summary Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-slate-100">
          <div className="p-3.5 rounded-xl bg-[#1c4a59] text-white flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs text-[#faae57] font-medium">
              <span>Senior Teacher on Duty</span>
              <span className="font-mono tabular-nums">Week {activeWeekSummary.weekNumber}</span>
            </div>
            <p className="text-sm font-bold truncate mt-1">
              {activeWeekSummary.seniorOnDuty}
            </p>
            <p className="text-[11px] text-white/75 font-mono tabular-nums mt-0.5 truncate">
              {activeWeekSummary.seniorPhone || activeWeekSummary.dateRange}
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-[#f6f8f7] border border-[#bac4c6]/80 flex flex-col justify-between">
            <span className="text-xs text-[#6a7f84] font-medium">Week Teachers Assigned</span>
            <p className="text-xl font-bold font-mono tabular-nums text-[#1f2a2e] mt-1">
              {activeWeekSummary.totalAssigned}
            </p>
            <span className="text-[11px] text-[#6a7f84]">
              Across {activeWeekSummary.postsCovered} active duty stations
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-[#f6f8f7] border border-[#bac4c6]/80 flex flex-col justify-between">
            <span className="text-xs text-[#6a7f84] font-medium">Registered Teaching Staff</span>
            <p className="text-xl font-bold font-mono tabular-nums text-[#1f2a2e] mt-1">
              {availableTeachers.length}
            </p>
            <span className="text-[11px] text-[#6a7f84]">
              Available for auto-rotation
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-[#f6f8f7] border border-[#bac4c6]/80 flex flex-col justify-between">
            <span className="text-xs text-[#6a7f84] font-medium">Daily Occurrence Logs</span>
            <p className="text-xl font-bold font-mono tabular-nums text-[#1f2a2e] mt-1">
              {logs.length}
            </p>
            <span className="text-[11px] text-[#6a7f84]">
              {activeWeekSummary.logsCount} logged in Week {activeWeekSummary.weekNumber}
            </span>
          </div>
        </div>
      </div>

      {activeSubTab === 'roster' ? (
        <div className="space-y-4">
          {/* Controls & Week Selector Strip */}
          <div className="bg-white border border-[#bac4c6] rounded-2xl p-4 shadow-2xs print:hidden space-y-3">
            {/* Horizontal Week Selector */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
              <button
                type="button"
                onClick={() => setSelectedWeek('all')}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer shrink-0 whitespace-nowrap',
                  selectedWeek === 'all'
                    ? 'bg-[#1c4a59] text-white'
                    : 'bg-[#f6f8f7] text-[#6a7f84] hover:text-[#1f2a2e]'
                )}
              >
                All Weeks
              </button>
              {Array.from({ length: 14 }, (_, i) => i + 1).map((wk) => (
                <button
                  key={wk}
                  type="button"
                  onClick={() => setSelectedWeek(wk)}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-xs font-mono tabular-nums font-semibold transition-colors cursor-pointer shrink-0 whitespace-nowrap',
                    selectedWeek === wk
                      ? 'bg-[#1c4a59] text-white'
                      : 'bg-[#f6f8f7] text-[#6a7f84] hover:text-[#1f2a2e]'
                  )}
                >
                  Week {wk}
                </button>
              ))}
            </div>

            {/* Filters & Primary Admin Actions */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
              <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[240px]">
                <div className="relative flex-1 min-w-[180px] max-w-xs">
                  <Search className="w-3.5 h-3.5 text-[#6a7f84] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search teacher or duty post..."
                    className="w-full pl-8 pr-3 py-2 bg-[#f6f8f7] border border-[#bac4c6] rounded-xl text-xs font-medium text-[#1f2a2e] focus:outline-hidden focus:border-[#1c4a59]"
                  />
                </div>

                <select
                  value={selectedDay}
                  onChange={(e) => setSelectedDay(e.target.value)}
                  className="px-3 py-2 bg-[#f6f8f7] border border-[#bac4c6] rounded-xl text-xs font-semibold text-[#1f2a2e] focus:outline-hidden"
                >
                  <option value="All">All Days</option>
                  {DAYS_OPTIONS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>

                <select
                  value={selectedPost}
                  onChange={(e) => setSelectedPost(e.target.value)}
                  className="px-3 py-2 bg-[#f6f8f7] border border-[#bac4c6] rounded-xl text-xs font-semibold text-[#1f2a2e] focus:outline-hidden max-w-[220px]"
                >
                  <option value="All">All Duty Posts</option>
                  {DUTY_POSTS.map((post) => (
                    <option key={post} value={post}>
                      {post}
                    </option>
                  ))}
                </select>
              </div>

              {canManageRoster && (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsAutoModalOpen(true)}
                    className="px-3.5 py-2 rounded-xl border border-[#1c4a59]/30 bg-[#1c4a59]/5 hover:bg-[#1c4a59]/10 text-[#1c4a59] text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-[#faae57]" />
                    <span>Auto-Generate Rotation</span>
                  </button>
                  <button
                    type="button"
                    onClick={openCreateAssignmentModal}
                    className="px-4 py-2 rounded-xl bg-[#1c4a59] hover:bg-[#153945] text-white text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <Plus className="w-3.5 h-3.5 text-[#faae57]" />
                    <span>Assign Teacher Duty</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Duty Roster Table */}
          <div className="bg-white border border-[#bac4c6] rounded-2xl overflow-hidden shadow-2xs">
            {filteredAssignments.length === 0 ? (
              <div className="p-10 text-center space-y-3 print:hidden">
                <UserCheck className="w-10 h-10 text-[#6a7f84] mx-auto stroke-[1.5]" />
                <div className="max-w-md mx-auto space-y-1">
                  <h3 className="text-sm font-bold text-[#1f2a2e]">
                    No duty assignments scheduled for this view
                  </h3>
                  <p className="text-xs text-[#6a7f84] leading-relaxed">
                    Assign individual teachers to weekly or daily duty posts, or use the Auto-Generate Rotation tool to build a complete term duty schedule in one click.
                  </p>
                </div>
                {canManageRoster && (
                  <div className="flex items-center justify-center gap-2.5 pt-2">
                    <button
                      type="button"
                      onClick={() => setIsAutoModalOpen(true)}
                      className="px-4 py-2 rounded-xl bg-[#1c4a59] hover:bg-[#153945] text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-[#faae57]" />
                      <span>Auto-Generate Term Roster</span>
                    </button>
                    <button
                      type="button"
                      onClick={openCreateAssignmentModal}
                      className="px-4 py-2 rounded-xl border border-[#bac4c6] bg-[#f6f8f7] hover:bg-white text-[#1f2a2e] text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Manual Assignment</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#f6f8f7] border-b border-[#bac4c6] text-[11px] font-bold text-[#6a7f84] uppercase tracking-wider">
                      <th className="py-3 px-4">Week &amp; Day</th>
                      <th className="py-3 px-4">Teacher on Duty</th>
                      <th className="py-3 px-4">Duty Post / Station</th>
                      <th className="py-3 px-4">Shift Hours</th>
                      <th className="py-3 px-4">Supervision Notes</th>
                      <th className="py-3 px-4">Status</th>
                      {canManageRoster && (
                        <th className="py-3 px-4 text-right print:hidden">Actions</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {filteredAssignments.map((item) => (
                      <tr key={item.id} className="hover:bg-[#f6f8f7]/60 transition-colors">
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <div className="font-mono tabular-nums font-bold text-[#1c4a59]">
                            Week {item.weekNumber} · {item.day}
                          </div>
                          <div className="font-mono tabular-nums text-[11px] text-[#6a7f84]">
                            {item.weekStartDate} – {item.weekEndDate}
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="font-bold text-[#1f2a2e] text-sm">
                            {item.teacherName}
                          </div>
                          <div className="flex items-center gap-1.5 text-[11px] text-[#6a7f84] mt-0.5">
                            {item.roleType === 'senior_on_duty' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-300 font-semibold text-[10px]">
                                <Award className="w-3 h-3 text-amber-600" />
                                Senior on Duty
                              </span>
                            ) : (
                              <span>Duty Member</span>
                            )}
                            {item.teacherPhone && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="font-mono tabular-nums">{item.teacherPhone}</span>
                              </>
                            )}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 font-semibold text-[#1f2a2e]">
                          {item.dutyPost}
                        </td>
                        <td className="py-3.5 px-4 font-mono tabular-nums text-[#1c4a59] font-medium whitespace-nowrap">
                          {item.shiftTime}
                        </td>
                        <td className="py-3.5 px-4 text-[#6a7f84] max-w-xs">
                          <span className="line-clamp-2">{item.notes || 'Standard station supervision'}</span>
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => handleCycleStatus(item)}
                            className={cn(
                              'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[11px] font-semibold transition-colors cursor-pointer',
                              item.status === 'completed'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                                : item.status === 'active'
                                ? 'bg-blue-50 text-blue-700 border-blue-300'
                                : 'bg-amber-50 text-amber-800 border-amber-300'
                            )}
                            title="Click to cycle shift status (Scheduled -> Active -> Completed)"
                          >
                            {item.status === 'completed' ? (
                              <CheckCircle2 className="w-3 h-3" />
                            ) : (
                              <Clock className="w-3 h-3" />
                            )}
                            <span>
                              {item.status === 'completed'
                                ? 'Completed'
                                : item.status === 'active'
                                ? 'Active Shift'
                                : 'Scheduled'}
                            </span>
                          </button>
                        </td>
                        {canManageRoster && (
                          <td className="py-3.5 px-4 text-right whitespace-nowrap print:hidden">
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => openEditAssignmentModal(item)}
                                className="p-1.5 rounded-lg text-[#6a7f84] hover:text-[#1c4a59] hover:bg-slate-100 transition-colors cursor-pointer"
                                title="Edit Duty Assignment"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteAssignment(item)}
                                className="p-1.5 rounded-lg text-[#6a7f84] hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                                title="Delete Duty Assignment"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Print-Only Official Signature Block */}
          <div className="only-print mt-12 pt-8 border-t border-slate-300 grid grid-cols-2 gap-12 text-xs">
            <div>
              <div className="border-b border-slate-800 h-8 w-64 mb-2" />
              <p className="font-bold uppercase text-slate-900">
                Senior Teacher on Duty ({activeWeekSummary.seniorOnDuty})
              </p>
              <p className="text-slate-600">Signature &amp; Date</p>
            </div>
            <div className="text-right flex flex-col items-end">
              <div className="border-b border-slate-800 h-8 w-64 mb-2" />
              <p className="font-bold uppercase text-slate-900">
                Headteacher / Principal Endorsement
              </p>
              <p className="text-slate-600">Official Stamp &amp; Date</p>
            </div>
          </div>
        </div>
      ) : (
        /* Daily Duty Logbook & Occurrence Book View */
        <div className="space-y-4">
          <div className="bg-white border border-[#bac4c6] rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
            <div>
              <h3 className="text-sm font-bold text-[#1f2a2e]">
                Daily Supervision &amp; Campus Occurrence Logbook
              </h3>
              <p className="text-xs text-[#6a7f84]">
                Teachers on duty record daily assembly, sanitation, and student welfare reports for Headteacher endorsement.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setLogWeek(selectedWeek === 'all' ? 1 : selectedWeek);
                setLogTeacher(user?.fullName || user?.username || '');
                setIsLogModalOpen(true);
              }}
              className="px-4 py-2 rounded-xl bg-[#1c4a59] hover:bg-[#153945] text-white text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 text-[#faae57]" />
              <span>Log Daily Duty Report</span>
            </button>
          </div>

          {logs.length === 0 ? (
            <div className="bg-white border border-[#bac4c6] rounded-2xl p-10 text-center space-y-3">
              <FileText className="w-10 h-10 text-[#6a7f84] mx-auto stroke-[1.5]" />
              <div className="max-w-md mx-auto space-y-1">
                <p className="text-sm font-bold text-[#1f2a2e]">No daily duty logs submitted yet</p>
                <p className="text-xs text-[#6a7f84]">
                  Teachers on duty can log morning assembly observations, compound sanitation ratings, and daily handover remarks here.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {logs.map((entry) => (
                <div
                  key={entry.id}
                  className="bg-white border border-[#bac4c6] rounded-2xl p-4 sm:p-5 space-y-3 shadow-2xs"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-xs text-[#6a7f84] flex-wrap">
                        <span className="font-mono tabular-nums font-bold text-[#1c4a59]">
                          Week {entry.weekNumber}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums font-semibold text-[#1f2a2e]">
                          {entry.date}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>Logged by {entry.loggedByTeacher}</span>
                        <span aria-hidden="true">·</span>
                        <span>Sanitation: {entry.sanitationRating}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {entry.endorsedBy ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-300 text-xs font-semibold">
                          <ShieldCheck className="w-3.5 h-3.5" />
                          <span>Endorsed by {entry.endorsedBy}</span>
                        </span>
                      ) : (
                        <>
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-50 text-amber-800 border border-amber-300 text-xs font-semibold">
                            <Clock className="w-3.5 h-3.5" />
                            <span>Pending Endorsement</span>
                          </span>
                          {canEndorseLogs && (
                            <button
                              type="button"
                              onClick={() => handleEndorseLog(entry)}
                              className="px-3 py-1 rounded-lg bg-[#1c4a59] hover:bg-[#153945] text-white text-xs font-semibold transition-colors cursor-pointer print:hidden"
                            >
                              Endorse Report
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                    <div className="space-y-1">
                      <p className="font-bold text-[#1c4a59]">Morning Assembly &amp; Punctuality</p>
                      <p className="text-[#1f2a2e] leading-relaxed whitespace-pre-wrap">
                        {entry.assemblyNotes || 'Routine assembly conducted.'}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="font-bold text-[#1c4a59]">Occurrences &amp; Welfare Incidents</p>
                      <p className="text-[#1f2a2e] leading-relaxed whitespace-pre-wrap">
                        {entry.incidentsReported || 'No incidents reported.'}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="font-bold text-[#1c4a59]">Handover &amp; Follow-Up Remarks</p>
                      <p className="text-[#1f2a2e] leading-relaxed whitespace-pre-wrap">
                        {entry.handoverRemarks || 'All stations handed over in good order.'}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modal 1: Add / Edit Teacher Duty Assignment */}
      {isAssignModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs print:hidden">
          <div className="bg-white border border-[#bac4c6] rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="bg-[#1c4a59] text-white px-5 py-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-[#faae57] font-medium">Staff Supervision Roster</p>
                <h3 className="text-base font-bold">
                  {editingAssignment ? 'Edit Duty Assignment' : 'Assign Teacher to Duty Roster'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAssignModalOpen(false)}
                className="p-1.5 rounded-lg text-white/75 hover:text-white hover:bg-white/10 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveAssignment} className="p-5 space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-[#1f2a2e] block">Term Week</label>
                  <select
                    value={formWeek}
                    onChange={(e) => {
                      const wk = Number(e.target.value);
                      setFormWeek(wk);
                      const range = computeWeekDateRange(new Date().toISOString().split('T')[0], wk);
                      setFormWeekStart(range.start);
                      setFormWeekEnd(range.end);
                    }}
                    className="w-full px-3 py-2 bg-[#f6f8f7] border border-[#bac4c6] rounded-lg font-semibold"
                  >
                    {Array.from({ length: 15 }, (_, i) => i + 1).map((wk) => (
                      <option key={wk} value={wk}>
                        Week {wk}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-[#1f2a2e] block">Day Scope</label>
                  <select
                    value={formDay}
                    onChange={(e) => setFormDay(e.target.value as DutyAssignment['day'])}
                    className="w-full px-3 py-2 bg-[#f6f8f7] border border-[#bac4c6] rounded-lg font-semibold"
                  >
                    {DAYS_OPTIONS.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-[#1f2a2e] block">Week Start Date</label>
                  <input
                    type="date"
                    value={formWeekStart}
                    onChange={(e) => setFormWeekStart(e.target.value)}
                    className="w-full px-3 py-2 bg-[#f6f8f7] border border-[#bac4c6] rounded-lg font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-[#1f2a2e] block">Week End Date</label>
                  <input
                    type="date"
                    value={formWeekEnd}
                    onChange={(e) => setFormWeekEnd(e.target.value)}
                    className="w-full px-3 py-2 bg-[#f6f8f7] border border-[#bac4c6] rounded-lg font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-[#1f2a2e] block">Teacher Name</label>
                {availableTeachers.length > 0 ? (
                  <select
                    value={formTeacherName}
                    onChange={(e) => {
                      const val = e.target.value;
                      setFormTeacherName(val);
                      const found = availableTeachers.find((t) => t.fullName === val);
                      if (found?.phone) setFormTeacherPhone(found.phone);
                    }}
                    className="w-full px-3 py-2 bg-[#f6f8f7] border border-[#bac4c6] rounded-lg font-semibold"
                  >
                    <option value="">-- Select Teacher --</option>
                    {availableTeachers.map((t) => (
                      <option key={t.fullName} value={t.fullName}>
                        {t.fullName} {t.staffId ? `(${t.staffId})` : ''}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={formTeacherName}
                    onChange={(e) => setFormTeacherName(e.target.value)}
                    placeholder="e.g., Mr. Kwame Boateng"
                    className="w-full px-3 py-2 bg-[#f6f8f7] border border-[#bac4c6] rounded-lg"
                  />
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-[#1f2a2e] block">Duty Role</label>
                  <select
                    value={formRoleType}
                    onChange={(e) => setFormRoleType(e.target.value as 'senior_on_duty' | 'member')}
                    className="w-full px-3 py-2 bg-[#f6f8f7] border border-[#bac4c6] rounded-lg font-semibold"
                  >
                    <option value="member">Duty Member</option>
                    <option value="senior_on_duty">Senior Teacher on Duty (Team Lead)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-[#1f2a2e] block">Contact Phone (Optional)</label>
                  <input
                    type="text"
                    value={formTeacherPhone}
                    onChange={(e) => setFormTeacherPhone(e.target.value)}
                    placeholder="0551187045"
                    className="w-full px-3 py-2 bg-[#f6f8f7] border border-[#bac4c6] rounded-lg font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-[#1f2a2e] block">Duty Post / Station</label>
                  <select
                    value={formDutyPost}
                    onChange={(e) => setFormDutyPost(e.target.value)}
                    className="w-full px-3 py-2 bg-[#f6f8f7] border border-[#bac4c6] rounded-lg font-semibold"
                  >
                    {DUTY_POSTS.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-[#1f2a2e] block">Shift Hours</label>
                  <select
                    value={formShiftTime}
                    onChange={(e) => setFormShiftTime(e.target.value)}
                    className="w-full px-3 py-2 bg-[#f6f8f7] border border-[#bac4c6] rounded-lg font-mono"
                  >
                    {SHIFT_TIMES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-[#1f2a2e] block">Supervision Instructions</label>
                <textarea
                  rows={2}
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="Specific instructions for this station or shift..."
                  className="w-full px-3 py-2 bg-[#f6f8f7] border border-[#bac4c6] rounded-lg resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAssignModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-[#bac4c6] font-semibold text-[#6a7f84] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-[#1c4a59] hover:bg-[#153945] text-white font-semibold cursor-pointer"
                >
                  {editingAssignment ? 'Save Changes' : 'Assign Teacher'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: Auto-Generate Fair Rotation Schedule */}
      {isAutoModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs print:hidden">
          <div className="bg-white border border-[#bac4c6] rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="bg-[#1c4a59] text-white px-5 py-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-[#faae57] font-medium">Automated Term Scheduler</p>
                <h3 className="text-base font-bold">Auto-Generate Duty Rotation</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAutoModalOpen(false)}
                className="p-1.5 rounded-lg text-white/75 hover:text-white hover:bg-white/10 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAutoGenerateRotation} className="p-5 space-y-4 text-xs">
              <p className="text-[#6a7f84] leading-relaxed">
                Automatically distributes your registered teachers ({availableTeachers.length || 4} staff members) evenly across term weeks, designating a rotating <strong>Senior Teacher on Duty</strong> and balanced station posts each week.
              </p>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-[#1f2a2e] block">Weeks to Generate</label>
                  <select
                    value={autoWeeksCount}
                    onChange={(e) => setAutoWeeksCount(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-[#f6f8f7] border border-[#bac4c6] rounded-lg font-mono font-semibold"
                  >
                    <option value={4}>4 Weeks (1 Month)</option>
                    <option value={8}>8 Weeks (Mid-Term)</option>
                    <option value={12}>12 Weeks (Full Term)</option>
                    <option value={14}>14 Weeks (Extended Term)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-[#1f2a2e] block">Teachers per Week</label>
                  <select
                    value={autoTeachersPerWeek}
                    onChange={(e) => setAutoTeachersPerWeek(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-[#f6f8f7] border border-[#bac4c6] rounded-lg font-mono font-semibold"
                  >
                    <option value={2}>2 Teachers / Week</option>
                    <option value={3}>3 Teachers / Week</option>
                    <option value={4}>4 Teachers / Week</option>
                    <option value={5}>5 Teachers / Week</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-[#1f2a2e] block">Week 1 Monday Start Date</label>
                <input
                  type="date"
                  value={autoStartDate}
                  onChange={(e) => setAutoStartDate(e.target.value)}
                  className="w-full px-3 py-2 bg-[#f6f8f7] border border-[#bac4c6] rounded-lg font-mono"
                />
              </div>

              <label className="flex items-center gap-2 cursor-pointer font-medium text-[#1f2a2e]">
                <input
                  type="checkbox"
                  checked={autoReplaceExisting}
                  onChange={(e) => setAutoReplaceExisting(e.target.checked)}
                  className="rounded text-[#1c4a59]"
                />
                <span>Replace existing schedule with fresh term rotation</span>
              </label>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAutoModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-[#bac4c6] font-semibold text-[#6a7f84] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-[#1c4a59] hover:bg-[#153945] text-white font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5 text-[#faae57]" />
                  <span>Generate Roster</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 3: Log Daily Duty Report */}
      {isLogModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs print:hidden">
          <div className="bg-white border border-[#bac4c6] rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="bg-[#1c4a59] text-white px-5 py-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-[#faae57] font-medium">Daily Occurrence Book</p>
                <h3 className="text-base font-bold">Submit Daily Duty Supervision Log</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsLogModalOpen(false)}
                className="p-1.5 rounded-lg text-white/75 hover:text-white hover:bg-white/10 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveLogEntry} className="p-5 space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-[#1f2a2e] block">Term Week</label>
                  <select
                    value={logWeek}
                    onChange={(e) => setLogWeek(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-[#f6f8f7] border border-[#bac4c6] rounded-lg font-mono font-semibold"
                  >
                    {Array.from({ length: 15 }, (_, i) => i + 1).map((wk) => (
                      <option key={wk} value={wk}>
                        Week {wk}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-[#1f2a2e] block">Report Date</label>
                  <input
                    type="date"
                    value={logDate}
                    onChange={(e) => setLogDate(e.target.value)}
                    className="w-full px-3 py-2 bg-[#f6f8f7] border border-[#bac4c6] rounded-lg font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-[#1f2a2e] block">Sanitation Rating</label>
                  <select
                    value={logSanitation}
                    onChange={(e) =>
                      setLogSanitation(e.target.value as DutyLogEntry['sanitationRating'])
                    }
                    className="w-full px-3 py-2 bg-[#f6f8f7] border border-[#bac4c6] rounded-lg font-semibold"
                  >
                    <option value="Excellent">Excellent</option>
                    <option value="Good">Good</option>
                    <option value="Fair">Fair</option>
                    <option value="Needs Attention">Needs Attention</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-[#1f2a2e] block">Teacher Submitting Report</label>
                <input
                  type="text"
                  value={logTeacher}
                  onChange={(e) => setLogTeacher(e.target.value)}
                  placeholder="Name of Teacher / Senior on Duty"
                  className="w-full px-3 py-2 bg-[#f6f8f7] border border-[#bac4c6] rounded-lg font-semibold"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-[#1f2a2e] block">
                  Morning Assembly &amp; Staff/Student Punctuality Notes
                </label>
                <textarea
                  rows={2}
                  value={logAssembly}
                  onChange={(e) => setLogAssembly(e.target.value)}
                  placeholder="e.g., Morning assembly started at 07:30 prompt. Uniform inspection completed..."
                  className="w-full px-3 py-2 bg-[#f6f8f7] border border-[#bac4c6] rounded-lg resize-none"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-[#1f2a2e] block">
                  Campus Occurrences / Student Welfare / Facility Incidents
                </label>
                <textarea
                  rows={2}
                  value={logIncidents}
                  onChange={(e) => setLogIncidents(e.target.value)}
                  placeholder="Record any notable incidents, sickbay referrals, or discipline matters..."
                  className="w-full px-3 py-2 bg-[#f6f8f7] border border-[#bac4c6] rounded-lg resize-none"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-[#1f2a2e] block">
                  Closing &amp; Handover Remarks
                </label>
                <textarea
                  rows={2}
                  value={logHandover}
                  onChange={(e) => setLogHandover(e.target.value)}
                  placeholder="Any follow-up items for tomorrow's duty team or school management..."
                  className="w-full px-3 py-2 bg-[#f6f8f7] border border-[#bac4c6] rounded-lg resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsLogModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-[#bac4c6] font-semibold text-[#6a7f84] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-[#1c4a59] hover:bg-[#153945] text-white font-semibold cursor-pointer"
                >
                  Save Logbook Entry
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
