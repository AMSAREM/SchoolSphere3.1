import { useState, useMemo, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/schema';
import { format, startOfToday } from 'date-fns';
import { Check, X, Clock, CalendarDays, Users, Download, FileText, Printer } from 'lucide-react';
import { motion } from 'motion/react';
import { useNotifications } from '../contexts/NotificationContext';
import { useAuth } from '../contexts/AuthContext';
import * as XLSX from 'xlsx';
import { exportToPDF, triggerPrint } from '../lib/utils';

export default function AttendanceTerminal() {
  const { showToast } = useNotifications();
  const { user } = useAuth();
  const settings = useLiveQuery(() => db.settings.toArray()) || [];
  const schoolName = settings.find(s => s.key === 'schoolProfile')?.value?.schoolName || 'ESEPA INTERNATIONAL SCHOOL';

  const classesFromDB = useLiveQuery(() => db.classes.toArray()) || [];
  const studentsInSystem = useLiveQuery(() => db.students.toArray()) || [];
  
  const classes = useMemo(() => {
    const fromDB = classesFromDB.map(c => c.name);
    const fromStudents = studentsInSystem.map(s => s.class);
    const list = Array.from(new Set([...fromDB, ...fromStudents])).filter(Boolean).sort();
    return list.map((name, idx) => ({ id: idx, name }));
  }, [classesFromDB, studentsInSystem]);

  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [selectedClass, setSelectedClass] = useState('P1');

  useEffect(() => {
    if (classes.length > 0 && !classes.find(c => c.name === selectedClass)) {
      setSelectedClass(classes[0].name);
    }
  }, [classes, selectedClass]);
  
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

  const dbStudents = useLiveQuery(
    () => db.students.where('class').equals(selectedClass).toArray(),
    [selectedClass]
  );

  const students = useMemo(() => {
    if (user?.role === 'parent') {
      return parentWards;
    }
    return dbStudents || [];
  }, [user?.role, parentWards, dbStudents]);

  const attendance = useLiveQuery(
    () => db.attendance.where('date').equals(selectedDate).toArray(),
    [selectedDate]
  );

  const filteredAttendance = useMemo(() => {
    if (!attendance || !students) return [];
    const studentIdSet = new Set(students.map(s => s.studentId));
    return attendance.filter(a => studentIdSet.has(a.studentId));
  }, [attendance, students]);

  const markAttendance = async (studentId: string, status: 'Present' | 'Absent' | 'Late') => {
    if (user?.role === 'parent') {
      showToast('Parents are not permitted to modify attendance records.', 'error');
      return;
    }
    const existing = await db.attendance
      .where({ studentId, date: selectedDate })
      .first();

    if (existing) {
      await db.attendance.update(existing.id!, { status });
    } else {
      await db.attendance.add({ studentId, date: selectedDate, status });
    }
  };

  const getStatus = (studentId: string) => {
    return attendance?.find(a => a.studentId === studentId)?.status || 'None';
  };

  const markAll = async (status: 'Present' | 'Absent' | 'Late') => {
    if (user?.role === 'parent') {
      showToast('Parents are not permitted to modify attendance records.', 'error');
      return;
    }
    if (!students) return;
    const promises = students.map(s => markAttendance(s.studentId, status));
    await Promise.all(promises);
  };

  const [isExportingPDF, setIsExportingPDF] = useState(false);
  const handleExportPDF = async () => {
    setIsExportingPDF(true);
    try {
      const fileName = user?.role === 'parent' 
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
      Date: selectedDate,
      Class: s.class
    })) || [];
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Attendance");
    const fileName = user?.role === 'parent' 
      ? `Attendance_Wards_${selectedDate}.xlsx` 
      : `Attendance_${selectedClass}_${selectedDate}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

  const stats = useMemo(() => {
    return {
      present: filteredAttendance.filter(a => a.status === 'Present').length,
      absent: filteredAttendance.filter(a => a.status === 'Absent').length,
      late: filteredAttendance.filter(a => a.status === 'Late').length
    };
  }, [filteredAttendance]);

  return (
    <div className="space-y-6" id="print-attendance">
      {/* Print Only Header */}
      <div className="only-print">
        <h1 className="text-3xl font-black text-slate-900 uppercase tracking-tighter text-center">{schoolName}</h1>
        <div className="mt-2 text-sm font-bold text-slate-600 uppercase tracking-widest flex items-center justify-center gap-4">
          <span>Daily Attendance Roll</span>
          <span className="w-1.5 h-1.5 bg-slate-400 rounded-full" />
          {user?.role === 'parent' ? (
            <span>My Children</span>
          ) : (
            <span>Class: {selectedClass}</span>
          )}
          <span className="w-1.5 h-1.5 bg-slate-400 rounded-full" />
          <span>Date: {format(new Date(selectedDate), 'EEEE, MMMM do, yyyy')}</span>
        </div>
      </div>

      {/* Deep Teal Hero Header Card */}
      <div className="bg-[#1c4a59] rounded-3xl p-6 sm:p-7 text-white shadow-[0_8px_28px_rgba(28,74,89,0.16)] flex flex-col gap-5 print:hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/15">
              <CalendarDays className="w-3.5 h-3.5 text-[#faae57]" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#e1c594]">
                Daily Roll Call & Register
              </span>
            </div>
            <h2 className="text-2xl sm:text-[28px] font-extrabold tracking-tight text-white leading-tight">
              {user?.role === 'parent' ? 'My Wards Daily Attendance' : `Class Attendance • ${selectedClass}`}
            </h2>
            <p className="text-sm text-[#e1c594]/90 font-medium">
              {format(new Date(selectedDate), 'EEEE, MMMM do, yyyy')} • {students?.length || 0} Students Listed
            </p>
          </div>

          {/* Live Status Summary Badges inside Teal Header */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-white/10 border border-white/15">
              <div className="w-2.5 h-2.5 bg-[#06d6a0] rounded-full" />
              <span className="text-xs font-bold text-white">Present:</span>
              <span className="text-base font-extrabold text-[#06d6a0] font-mono">{stats.present}</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-white/10 border border-white/15">
              <div className="w-2.5 h-2.5 bg-[#faae57] rounded-full" />
              <span className="text-xs font-bold text-white">Late:</span>
              <span className="text-base font-extrabold text-[#faae57] font-mono">{stats.late}</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-white/10 border border-white/15">
              <div className="w-2.5 h-2.5 bg-[#ef476f] rounded-full" />
              <span className="text-xs font-bold text-white">Absent:</span>
              <span className="text-base font-extrabold text-[#ef476f] font-mono">{stats.absent}</span>
            </div>
          </div>
        </div>

        {/* Filter & Action Bar */}
        <div className="pt-4 border-t border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2.5 bg-white px-4 py-2 rounded-full border border-[#bac4c6] min-h-[44px]">
              <CalendarDays className="w-4 h-4 text-[#1c4a59]" />
              <input 
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-transparent text-sm font-bold text-[#1f2a2e] outline-none cursor-pointer"
              />
            </div>

            {user?.role === 'parent' ? (
              <div className="px-4 py-2.5 bg-white/10 border border-white/15 rounded-full text-xs font-bold uppercase tracking-wider text-[#faae57]">
                Linked Wards View
              </div>
            ) : (
              <select 
                value={selectedClass}
                onChange={(e) => setSelectedClass(e.target.value)}
                className="bg-white border border-[#bac4c6] rounded-full px-4 py-2 text-sm font-bold text-[#1f2a2e] outline-none focus:ring-2 focus:ring-[#faae57] min-h-[44px] cursor-pointer"
              >
                {classes?.length ? classes.map(c => <option key={c.id} value={c.name}>{c.name}</option>) : <option>P1</option>}
              </select>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {user?.role !== 'parent' && (
              <>
                <button 
                  onClick={() => markAll('Present')}
                  className="px-4 py-2 text-xs font-bold bg-[#faae57] hover:bg-[#e4ae67] text-[#1f2a2e] rounded-full transition-all shadow-xs min-h-[44px] cursor-pointer active:scale-[0.97]"
                >
                  Mark All Present
                </button>
                <button 
                  onClick={() => markAll('Absent')}
                  className="px-4 py-2 text-xs font-bold bg-white/10 hover:bg-[#ef476f] text-white border border-white/15 rounded-full transition-all min-h-[44px] cursor-pointer active:scale-[0.97]"
                >
                  Mark All Absent
                </button>
              </>
            )}
            <button 
              onClick={handleExportPDF}
              disabled={isExportingPDF}
              className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white border border-white/15 rounded-full font-bold transition-all text-xs min-h-[44px] disabled:opacity-50 cursor-pointer"
            >
              <FileText className="w-4 h-4 text-[#faae57]" />
              <span>{isExportingPDF ? 'Exporting...' : 'PDF'}</span>
            </button>
            <button 
              onClick={triggerPrint}
              className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white border border-white/15 rounded-full font-bold transition-all text-xs min-h-[44px] cursor-pointer"
            >
              <Printer className="w-4 h-4 text-[#faae57]" />
              <span>Print</span>
            </button>
            <button 
              onClick={exportAttendance}
              className="flex items-center gap-2 px-4 py-2 bg-white text-[#1c4a59] rounded-full font-bold hover:bg-[#f6f8f7] transition-all shadow-xs text-xs min-h-[44px] cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {students?.map((student) => {
          const status = getStatus(student.studentId);
          const isParent = user?.role === 'parent';
          return (
            <motion.div 
              layout
              key={student.id}
              className="bg-white p-5 rounded-2xl border border-[#bac4c6]/60 shadow-[0_4px_16px_rgba(0,0,0,0.05)] flex items-center justify-between group hover:border-[#1c4a59]/40 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-11 h-11 bg-[#1c4a59] rounded-2xl flex items-center justify-center text-[#faae57] font-bold text-xs uppercase shrink-0">
                  {(student.firstName?.[0] || '')}{(student.lastName?.[0] || '') || 'S'}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="font-bold text-[#1f2a2e] leading-tight truncate">{student.firstName} {student.lastName}</h4>
                    {isParent && (
                      <span className="px-2 py-0.5 bg-[#1c4a59]/10 text-[#1c4a59] rounded-full text-[9px] font-extrabold uppercase tracking-wider shrink-0">
                        {student.class}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-[#6a7f84] font-mono mt-1">{student.studentId}</p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button 
                  onClick={() => !isParent && markAttendance(student.studentId, 'Present')}
                  disabled={isParent}
                  className={`min-w-[44px] min-h-[44px] px-2.5 rounded-xl flex items-center justify-center gap-1 text-xs font-bold transition-all cursor-pointer ${
                    status === 'Present' 
                      ? 'bg-[#06d6a0] text-[#1f2a2e] shadow-sm' 
                      : isParent 
                        ? 'bg-[#f6f8f7] text-[#bac4c6] opacity-40 cursor-not-allowed' 
                        : 'bg-[#f6f8f7] text-[#6a7f84] hover:bg-[#06d6a0]/15 hover:text-[#1f2a2e]'
                  }`}
                  title={isParent ? `Status: Present` : "Mark Present"}
                >
                  <Check className="w-4 h-4 stroke-[2.5]" />
                </button>
                <button 
                  onClick={() => !isParent && markAttendance(student.studentId, 'Late')}
                  disabled={isParent}
                  className={`min-w-[44px] min-h-[44px] px-2.5 rounded-xl flex items-center justify-center gap-1 text-xs font-bold transition-all cursor-pointer ${
                    status === 'Late' 
                      ? 'bg-[#faae57] text-[#1f2a2e] shadow-sm' 
                      : isParent 
                        ? 'bg-[#f6f8f7] text-[#bac4c6] opacity-40 cursor-not-allowed' 
                        : 'bg-[#f6f8f7] text-[#6a7f84] hover:bg-[#faae57]/20 hover:text-[#1f2a2e]'
                  }`}
                  title={isParent ? `Status: Late` : "Mark Late"}
                >
                  <Clock className="w-4 h-4 stroke-[2.5]" />
                </button>
                <button 
                  onClick={() => !isParent && markAttendance(student.studentId, 'Absent')}
                  disabled={isParent}
                  className={`min-w-[44px] min-h-[44px] px-2.5 rounded-xl flex items-center justify-center gap-1 text-xs font-bold transition-all cursor-pointer ${
                    status === 'Absent' 
                      ? 'bg-[#ef476f] text-white shadow-sm' 
                      : isParent 
                        ? 'bg-[#f6f8f7] text-[#bac4c6] opacity-40 cursor-not-allowed' 
                        : 'bg-[#f6f8f7] text-[#6a7f84] hover:bg-[#ef476f]/15 hover:text-[#ef476f]'
                  }`}
                  title={isParent ? `Status: Absent` : "Mark Absent"}
                >
                  <X className="w-4 h-4 stroke-[2.5]" />
                </button>
              </div>
            </motion.div>
          );
        })}
        {students?.length === 0 && (
          <div className="col-span-full py-12 text-center text-[#6a7f84] bg-white border border-dashed border-[#bac4c6] rounded-3xl">
            <Users className="w-12 h-12 text-[#bac4c6] mx-auto mb-3" />
            <p className="font-bold text-[#1f2a2e]">{user?.role === 'parent' ? 'No related wards found linked to your account.' : 'No students enrolled in this class yet.'}</p>
          </div>
        )}
      </div>
    </div>
  );
}
