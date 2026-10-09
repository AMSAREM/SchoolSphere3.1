import { useState } from 'react';
import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Teacher, type Subject, type ClassInfo, type SubjectRegistrationStatus } from '../db/schema';
import {
  Plus,
  Trash2,
  Book,
  GraduationCap,
  Users,
  Edit2,
  Search,
  Printer,
  X,
  Download,
  Upload,
  CheckSquare,
  Square,
  UserCheck,
  CheckCircle2,
  Clock,
  Sparkles,
  AlertCircle,
  Filter,
  Check,
  ChevronDown,
  BookOpen
} from 'lucide-react';
import Papa from 'papaparse';
import { motion } from 'motion/react';
import { cn, triggerPrint } from '../lib/utils';
import { teachersApi, classesApi, subjectsApi } from '../lib/api';
import { useNotifications } from '../contexts/NotificationContext';
import { useAuth } from '../contexts/AuthContext';
import DutyRosterManagement from './DutyRosterManagement';

interface AcademicManagementProps {
  onNavigate?: (view: any) => void;
}

export default function AcademicManagement({ onNavigate }: AcademicManagementProps = {}) {
  const [activeTab, setActiveTab] = useState<'teachers' | 'classes' | 'subjects' | 'duty_roster'>('teachers');
  const settings = useLiveQuery(() => db.settings.toArray()) || [];
  const schoolName = settings.find(s => s.key === 'schoolProfile')?.value?.schoolName || 'SCHOOLSPHERE PORTAL';

  React.useEffect(() => {
    teachersApi.getAll().catch(() => {});
    classesApi.getAll().catch(() => {});
    subjectsApi.getAll().catch(() => {});
  }, []);

  return (
    <div className="space-y-3.5 sm:space-y-5 text-[#1f2a2e] min-w-0">
      {/* Print Only Header */}
      {activeTab !== 'duty_roster' && (
        <div className="only-print">
          <h1 className="text-3xl font-black text-slate-900 uppercase tracking-tighter text-center">{schoolName}</h1>
          <div className="mt-2 text-sm font-bold text-slate-600 uppercase tracking-widest flex items-center justify-center gap-4">
            <span>Academic Resources & Staff Records</span>
            <span className="w-1.5 h-1.5 bg-slate-400 rounded-full" />
            <span>Active View: {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}</span>
            <span className="w-1.5 h-1.5 bg-slate-400 rounded-full" />
            <span>Generated: {new Date().toLocaleDateString()}</span>
          </div>
        </div>
      )}

      {/* Responsive Tab Bar + Compact Print Action */}
      <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-1.5 sm:gap-2 border-b border-[#bac4c6] bg-white rounded-t-2xl px-1.5 sm:px-3 print:hidden shadow-[0_2px_10px_rgba(0,0,0,0.03)]">
        <div className="flex flex-wrap items-center gap-1 sm:gap-2 min-w-0">
          <button
            type="button"
            onClick={() => setActiveTab('teachers')}
            className={cn(
              "px-2 sm:px-5 py-2.5 sm:py-3 font-bold text-xs sm:text-sm transition-all border-b-2 whitespace-nowrap text-center flex items-center justify-center gap-1.5 cursor-pointer",
              activeTab === 'teachers'
                ? "border-[#1c4a59] text-[#1c4a59]"
                : "border-transparent text-[#6a7f84] hover:text-[#1f2a2e]"
            )}
          >
            <Users className={cn("w-3.5 h-3.5 hidden sm:inline shrink-0", activeTab === 'teachers' ? "text-[#faae57]" : "text-[#6a7f84]")} />
            <span>Teachers</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('classes')}
            className={cn(
              "px-2 sm:px-5 py-2.5 sm:py-3 font-bold text-xs sm:text-sm transition-all border-b-2 whitespace-nowrap text-center flex items-center justify-center gap-1.5 cursor-pointer",
              activeTab === 'classes'
                ? "border-[#1c4a59] text-[#1c4a59]"
                : "border-transparent text-[#6a7f84] hover:text-[#1f2a2e]"
            )}
          >
            <GraduationCap className={cn("w-3.5 h-3.5 hidden sm:inline shrink-0", activeTab === 'classes' ? "text-[#faae57]" : "text-[#6a7f84]")} />
            <span>Classes</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('subjects')}
            className={cn(
              "px-2 sm:px-5 py-2.5 sm:py-3 font-bold text-xs sm:text-sm transition-all border-b-2 whitespace-nowrap text-center flex items-center justify-center gap-1.5 cursor-pointer",
              activeTab === 'subjects'
                ? "border-[#1c4a59] text-[#1c4a59]"
                : "border-transparent text-[#6a7f84] hover:text-[#1f2a2e]"
            )}
          >
            <Book className={cn("w-3.5 h-3.5 hidden sm:inline shrink-0", activeTab === 'subjects' ? "text-[#faae57]" : "text-[#6a7f84]")} />
            <span>Subjects</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('duty_roster')}
            className={cn(
              "px-2 sm:px-5 py-2.5 sm:py-3 font-bold text-xs sm:text-sm transition-all border-b-2 whitespace-nowrap text-center flex items-center justify-center gap-1.5 cursor-pointer",
              activeTab === 'duty_roster'
                ? "border-[#1c4a59] text-[#1c4a59]"
                : "border-transparent text-[#6a7f84] hover:text-[#1f2a2e]"
            )}
          >
            <UserCheck className={cn("w-3.5 h-3.5 hidden sm:inline shrink-0", activeTab === 'duty_roster' ? "text-[#faae57]" : "text-[#6a7f84]")} />
            <span>Duty Roster</span>
          </button>

          {onNavigate && (
            <button
              type="button"
              onClick={() => onNavigate('assessments')}
              className="px-2.5 sm:px-4 py-2 sm:py-2.5 font-bold text-xs sm:text-sm transition-all text-[#1c4a59] hover:bg-[#faae57]/20 whitespace-nowrap text-center flex items-center justify-center gap-1.5 cursor-pointer bg-[#faae57]/15 rounded-xl border border-[#faae57]/40 shadow-2xs ml-1"
              title="Open Unified Assessments: Homework, Classwork, Tests & Examinations"
            >
              <GraduationCap className="w-4 h-4 text-[#faae57] shrink-0" />
              <span>Assessments & SBA</span>
              <span className="px-1 py-0.5 rounded text-[8px] font-black bg-[#faae57] text-[#1c4a59] leading-none">
                NEW
              </span>
            </button>
          )}
        </div>
        
        {activeTab !== 'duty_roster' && (
          <button 
            type="button"
            onClick={() => triggerPrint()}
            title="Print Active List"
            className="print:hidden flex items-center justify-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 my-1.5 text-[#1c4a59] hover:text-[#1f2a2e] bg-[#f6f8f7] hover:bg-[#e1c594]/35 border border-[#bac4c6] rounded-xl transition-colors text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer active:scale-[0.98]"
          >
            <Printer className="w-3.5 h-3.5 text-[#1c4a59] shrink-0" />
            <span className="hidden sm:inline">Print List</span>
            <span className="sm:hidden">Print</span>
          </button>
        )}
      </div>

      {/* Selected Element: Active Tab Content Container (div:nth-of-type(3)) */}
      <motion.div
        key={activeTab}
        initial={{ opacity: 0, x: 10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.2 }}
        className="w-full min-w-0"
      >
        {activeTab === 'teachers' && <TeacherList />}
        {activeTab === 'classes' && <ClassList />}
        {activeTab === 'subjects' && <SubjectList />}
        {activeTab === 'duty_roster' && <DutyRosterManagement embedded />}
      </motion.div>
    </div>
  );
}

function TeacherList() {
  const { showToast, confirm } = useNotifications();
  const [searchTerm, setSearchTerm] = useState('');
  const teachers = useLiveQuery(() => 
    db.teachers.filter(t => 
      t.firstName.toLowerCase().includes(searchTerm.toLowerCase()) || 
      t.lastName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.staffId.toLowerCase().includes(searchTerm.toLowerCase())
    ).toArray(), 
    [searchTerm]
  );
  const classes = useLiveQuery(() => db.classes.toArray());
  const subjects = useLiveQuery(() => db.subjects.toArray());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState<Teacher | null>(null);
  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);

  const [selectedTeacherIds, setSelectedTeacherIds] = useState<number[]>([]);
  const [bulkClassValue, setBulkClassValue] = useState<string>('');
  const [bulkSubjectValue, setBulkSubjectValue] = useState<string>('');

  const toggleSelectTeacher = (id?: number) => {
    if (typeof id !== 'number') return;
    setSelectedTeacherIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const toggleSelectAllTeachers = () => {
    const validIds = (teachers || []).map(t => t.id).filter((id): id is number => typeof id === 'number');
    if (validIds.length > 0 && validIds.every(id => selectedTeacherIds.includes(id))) {
      setSelectedTeacherIds([]);
    } else {
      setSelectedTeacherIds(validIds);
    }
  };

  const exportTeachersCsv = () => {
    const list = selectedTeacherIds.length > 0
      ? (teachers || []).filter(t => typeof t.id === 'number' && selectedTeacherIds.includes(t.id))
      : (teachers || []);

    if (list.length === 0) {
      showToast('No staff records to export.', 'error');
      return;
    }

    const rows = list.map(t => ({
      staffId: t.staffId,
      firstName: t.firstName,
      lastName: t.lastName,
      email: t.email || '',
      phone: t.phone || '',
      assignedClasses: (t.assignedClasses || []).join('; '),
      subjects: (t.subjects || []).join('; ')
    }));

    const csv = Papa.unparse(rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', `staff_directory_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast(`Exported ${rows.length} staff record(s) to CSV.`, 'success');
  };

  const downloadTeachersTemplateCsv = () => {
    const sample = [
      {
        staffId: 'TEA-1001',
        firstName: 'Kwame',
        lastName: 'Mensah',
        email: 'kwame.mensah@school.edu',
        phone: '0240000001',
        assignedClasses: 'Basic 7; Basic 8',
        subjects: 'Mathematics; Integrated Science'
      }
    ];
    const csv = Papa.unparse(sample);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', 'staff_directory_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImportTeachersCsv = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const rows = Array.isArray(results.data) ? results.data : [];
        let importedCount = 0;
        for (let i = 0; i < rows.length; i++) {
          const r: any = rows[i];
          const firstName = String(r.firstName || r.first_name || r.FirstName || '').trim();
          const lastName = String(r.lastName || r.last_name || r.LastName || '').trim();
          if (!firstName && !lastName) continue;
          const staffId = String(r.staffId || r.staff_id || `TEA-${Date.now().toString().slice(-4)}-${i}`).trim();
          const email = String(r.email || r.Email || '').trim();
          const phone = String(r.phone || r.Phone || '').trim();
          const assignedClasses = String(r.assignedClasses || r.classes || '')
            .split(/[;,]/)
            .map(s => s.trim())
            .filter(Boolean);
          const subjs = String(r.subjects || r.Subjects || '')
            .split(/[;,]/)
            .map(s => s.trim())
            .filter(Boolean);

          await teachersApi.create({
            staffId,
            firstName: firstName || 'Staff',
            lastName: lastName || 'Member',
            email,
            phone,
            assignedClasses,
            subjects: subjs
          });
          importedCount++;
        }

        if (importedCount > 0) {
          showToast(`Imported ${importedCount} staff member(s) from CSV!`, 'success');
        } else {
          showToast('No valid staff rows found in CSV.', 'error');
        }
      }
    });
    e.target.value = '';
  };

  const handleBulkAssign = async (type: 'class' | 'subject', value: string) => {
    const cleanVal = value.trim();
    if (!cleanVal || selectedTeacherIds.length === 0) return;

    const selectedList = (teachers || []).filter(t => typeof t.id === 'number' && selectedTeacherIds.includes(t.id));
    for (const t of selectedList) {
      if (!t.id) continue;
      if (type === 'class') {
        const nextClasses = Array.from(new Set([...(t.assignedClasses || []), cleanVal]));
        await teachersApi.update(t.id, { ...t, assignedClasses: nextClasses });
      } else {
        const nextSubjects = Array.from(new Set([...(t.subjects || []), cleanVal]));
        await teachersApi.update(t.id, { ...t, subjects: nextSubjects });
      }
    }
    showToast(`Assigned ${type} "${cleanVal}" to ${selectedList.length} staff member(s).`, 'success');
    if (type === 'class') setBulkClassValue('');
    if (type === 'subject') setBulkSubjectValue('');
  };

  const handleBulkDeleteTeachers = async () => {
    if (selectedTeacherIds.length === 0) return;
    const isOk = await confirm({
      title: `Delete ${selectedTeacherIds.length} Staff Record(s)?`,
      message: `Are you sure you want to delete ${selectedTeacherIds.length} selected teacher record(s)?`,
      confirmLabel: 'Delete Selected'
    });
    if (!isOk) return;

    for (const id of selectedTeacherIds) {
      await teachersApi.delete(id);
    }
    setSelectedTeacherIds([]);
    showToast(`Deleted ${selectedTeacherIds.length} staff record(s).`, 'info');
  };

  const toggleClass = (className: string) => {
    setSelectedClasses(prev => 
      prev.includes(className) ? prev.filter(c => c !== className) : [...prev, className]
    );
  };

  const toggleSubject = (subjectName: string) => {
    setSelectedSubjects(prev => 
      prev.includes(subjectName) ? prev.filter(s => s !== subjectName) : [...prev, subjectName]
    );
  };

  const openEditModal = (teacher: Teacher) => {
    setEditingTeacher(teacher);
    setSelectedClasses(teacher.assignedClasses || []);
    setSelectedSubjects(teacher.subjects || []);
    setIsModalOpen(true);
  };

  const handleTeacherSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const teacherData = {
      firstName: formData.get('firstName') as string,
      lastName: formData.get('lastName') as string,
      phone: formData.get('phone') as string,
      email: formData.get('email') as string,
      assignedClasses: selectedClasses,
      subjects: selectedSubjects
    };

    if (editingTeacher && editingTeacher.id) {
      await teachersApi.update(editingTeacher.id, {
        ...teacherData,
        staffId: editingTeacher.staffId
      });
    } else {
      const teacher: Teacher = {
        ...teacherData,
        staffId: `TEA-${Date.now().toString().slice(-4)}`,
      };
      await teachersApi.create(teacher);
    }

    setIsModalOpen(false);
    setEditingTeacher(null);
    setSelectedClasses([]);
    setSelectedSubjects([]);
  };

  const allTeacherIds = (teachers || []).map(t => t.id).filter((id): id is number => typeof id === 'number');
  const allSelected = allTeacherIds.length > 0 && allTeacherIds.every(id => selectedTeacherIds.includes(id));

  return (
    <div className="space-y-3 sm:space-y-4 min-w-0">
      {/* Search, CSV Import/Export & Add Teacher Toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 sm:gap-3 bg-white p-3 sm:p-3.5 rounded-2xl border border-[#bac4c6]/70 shadow-[0_4px_16px_rgba(0,0,0,0.04)] print:hidden">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {allTeacherIds.length > 0 && (
            <button
              type="button"
              onClick={toggleSelectAllTeachers}
              className="shrink-0 h-9 sm:h-10 px-2.5 rounded-xl bg-[#f6f8f7] border border-[#bac4c6] text-xs font-bold text-[#1c4a59] hover:bg-[#e1c594]/30 flex items-center gap-1.5 cursor-pointer"
              title="Select or Deselect All Staff"
            >
              {allSelected ? <CheckSquare className="w-4 h-4 text-[#1c4a59]" /> : <Square className="w-4 h-4 text-[#6a7f84]" />}
              <span className="hidden sm:inline">{allSelected ? 'Deselect' : 'Select All'}</span>
            </button>
          )}
          <div className="relative flex-1 min-w-0 sm:max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6a7f84] pointer-events-none" />
            <input 
              type="text"
              placeholder="Search teachers by name or ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full h-9 sm:h-10 pl-9 pr-8 bg-[#f6f8f7] text-[#1f2a2e] placeholder:text-[#6a7f84] text-xs sm:text-sm border border-[#bac4c6] rounded-xl focus:ring-2 focus:ring-[#1c4a59] focus:bg-white outline-none transition-all"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                title="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[#6a7f84] hover:text-[#1f2a2e] rounded-lg hover:bg-[#bac4c6]/30 transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 w-full lg:w-auto min-w-0">
          <input
            type="file"
            id="import-teachers-csv"
            className="hidden"
            accept=".csv"
            onChange={handleImportTeachersCsv}
          />
          <button
            type="button"
            onClick={downloadTeachersTemplateCsv}
            className="w-full sm:w-auto min-w-0 h-9 sm:h-10 px-3 rounded-xl bg-[#f6f8f7] hover:bg-[#e1c594]/30 border border-[#bac4c6] text-[#1c4a59] font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-[#faae57] shrink-0" />
            <span className="truncate">CSV Template</span>
          </button>
          <label
            htmlFor="import-teachers-csv"
            className="w-full sm:w-auto min-w-0 h-9 sm:h-10 px-3 rounded-xl bg-[#f6f8f7] hover:bg-[#e1c594]/30 border border-[#bac4c6] text-[#1c4a59] font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5 text-[#1c4a59] shrink-0" />
            <span className="truncate">Import CSV</span>
          </label>
          <button
            type="button"
            onClick={exportTeachersCsv}
            className="w-full sm:w-auto min-w-0 h-9 sm:h-10 px-3 rounded-xl bg-[#f6f8f7] hover:bg-[#e1c594]/30 border border-[#bac4c6] text-[#1c4a59] font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-[#06d6a0] shrink-0" />
            <span className="truncate">Export CSV</span>
          </button>
          <button 
            type="button"
            onClick={() => {
              setEditingTeacher(null);
              setIsModalOpen(true);
              setSelectedClasses([]);
              setSelectedSubjects([]);
            }}
            className="w-full sm:w-auto min-w-0 h-9 sm:h-10 bg-[#faae57] hover:bg-[#e4ae67] text-[#1f2a2e] px-3 sm:px-4 rounded-xl flex items-center justify-center gap-1.5 font-bold text-xs sm:text-sm transition-all shadow-xs whitespace-nowrap cursor-pointer active:scale-[0.98]"
          >
            <Plus className="w-4 h-4 stroke-[2.5] shrink-0" />
            <span className="truncate">Add Teacher</span>
          </button>
        </div>
      </div>

      {/* Bulk Action Bar for Selected Teachers */}
      {selectedTeacherIds.length > 0 && (
        <div className="p-3 sm:p-4 bg-[#1c4a59] text-white rounded-2xl border border-[#bac4c6] flex flex-col lg:flex-row lg:items-center justify-between gap-3 print:hidden min-w-0">
          <div className="flex items-center justify-between sm:justify-start gap-2.5 min-w-0">
            <span className="px-2.5 py-1 rounded-lg bg-[#faae57] text-[#1f2a2e] text-xs font-extrabold font-mono tabular-nums shrink-0">
              {selectedTeacherIds.length} Staff Selected
            </span>
            <button
              type="button"
              onClick={() => setSelectedTeacherIds([])}
              className="text-xs font-bold text-[#e1c594] hover:text-white underline cursor-pointer shrink-0"
            >
              Clear Selection
            </button>
          </div>

          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 w-full lg:w-auto min-w-0">
            <div className="col-span-2 sm:col-span-1 flex items-center gap-1.5 bg-white/10 border border-white/20 rounded-xl px-2.5 py-1.5 min-w-0 w-full sm:w-auto">
              <select
                value={bulkClassValue}
                onChange={e => setBulkClassValue(e.target.value)}
                className="flex-1 min-w-0 sm:w-32 bg-transparent text-white text-xs font-bold focus:outline-none truncate"
              >
                <option value="" className="text-slate-900">Assign Class…</option>
                {classes?.map(c => (
                  <option key={c.id} value={c.name} className="text-slate-900">{c.name}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => handleBulkAssign('class', bulkClassValue)}
                className="px-2.5 py-1 rounded-lg bg-[#faae57] text-[#1f2a2e] text-[11px] font-extrabold whitespace-nowrap shrink-0 cursor-pointer"
              >
                Apply Class
              </button>
            </div>

            <div className="col-span-2 sm:col-span-1 flex items-center gap-1.5 bg-white/10 border border-white/20 rounded-xl px-2.5 py-1.5 min-w-0 w-full sm:w-auto">
              <select
                value={bulkSubjectValue}
                onChange={e => setBulkSubjectValue(e.target.value)}
                className="flex-1 min-w-0 sm:w-36 bg-transparent text-white text-xs font-bold focus:outline-none truncate"
              >
                <option value="" className="text-slate-900">Assign Subject…</option>
                {subjects?.map(s => (
                  <option key={s.id} value={s.name} className="text-slate-900">{s.name}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => handleBulkAssign('subject', bulkSubjectValue)}
                className="px-2.5 py-1 rounded-lg bg-[#06d6a0] text-[#1f2a2e] text-[11px] font-extrabold whitespace-nowrap shrink-0 cursor-pointer"
              >
                Apply Subject
              </button>
            </div>

            <button
              type="button"
              onClick={exportTeachersCsv}
              className="min-w-0 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-[#06d6a0] shrink-0" />
              <span className="truncate">Export Selected</span>
            </button>

            <button
              type="button"
              onClick={handleBulkDeleteTeachers}
              className="min-w-0 px-3 py-2 rounded-xl bg-[#ef476f] hover:bg-[#d93860] text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Delete Selected</span>
            </button>
          </div>
        </div>
      )}

      {/* High-Density Teachers List-Card Grid */}
      {teachers && teachers.length === 0 ? (
        <div className="bg-white border border-[#bac4c6]/80 rounded-2xl p-6 sm:p-10 text-center text-[#6a7f84]">
          <div className="w-11 h-11 rounded-2xl bg-[#1c4a59]/10 text-[#1c4a59] flex items-center justify-center mx-auto mb-2.5">
            <Users className="w-5 h-5" />
          </div>
          <p className="font-bold text-[#1f2a2e] text-sm sm:text-base">No teachers found</p>
          <p className="text-xs text-[#6a7f84] mt-0.5">Try adjusting your search or add a new teacher record.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-3.5">
          {teachers?.map(teacher => {
            const isSelected = typeof teacher.id === 'number' && selectedTeacherIds.includes(teacher.id);
            return (
            <div key={teacher.id} className={cn("bg-white p-3 sm:p-4 rounded-xl sm:rounded-2xl border shadow-[0_2px_10px_rgba(0,0,0,0.04)] flex flex-col justify-between text-[#1f2a2e] transition-colors min-w-0", isSelected ? "border-[#1c4a59] bg-[#e1c594]/15" : "border-[#bac4c6]/80 hover:border-[#1c4a59]/60")}>
              <div className="min-w-0">
                <div className="flex justify-between items-start gap-2.5 mb-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelectTeacher(teacher.id)}
                      className="w-4 h-4 rounded border-[#bac4c6] text-[#1c4a59] focus:ring-[#1c4a59] cursor-pointer shrink-0 print:hidden"
                    />
                    <div className="w-9 h-9 sm:w-10 sm:h-10 bg-[#1c4a59] text-[#faae57] border border-[#faae57]/40 rounded-xl flex items-center justify-center font-bold uppercase text-xs sm:text-sm shrink-0">
                      {(teacher.firstName?.[0] || '')}{(teacher.lastName?.[0] || '') || 'T'}
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-bold text-[#1f2a2e] text-xs sm:text-sm leading-snug truncate">
                        {teacher.firstName} {teacher.lastName}
                      </h4>
                      <div className="flex items-center gap-1.5 text-[10px] sm:text-[11px] mt-0.5">
                        <span className="font-bold text-[#807654] font-mono tabular-nums">{teacher.staffId}</span>
                        {teacher.phone && (
                          <>
                            <span className="text-[#bac4c6]" aria-hidden="true">·</span>
                            <span className="font-semibold text-[#6a7f84] font-mono tabular-nums truncate">{teacher.phone}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 print:hidden">
                    <button 
                      type="button"
                      onClick={() => openEditModal(teacher)}
                      title="Edit Teacher"
                      className="w-8 h-8 flex items-center justify-center text-[#1c4a59] bg-[#f6f8f7] hover:bg-[#1c4a59]/10 border border-[#bac4c6]/80 rounded-lg transition-all cursor-pointer active:scale-[0.96]"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button 
                      type="button"
                      onClick={() => teachersApi.delete(teacher.id!)}
                      title="Delete Teacher"
                      className="w-8 h-8 flex items-center justify-center text-[#6a7f84] hover:text-[#ef476f] bg-[#f6f8f7] hover:bg-[#ef476f]/10 hover:border-[#ef476f]/30 border border-[#bac4c6]/80 rounded-lg transition-all cursor-pointer active:scale-[0.96]"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {teacher.email && (
                  <p className="text-[11px] text-[#6a7f84] truncate mb-2 pb-2 border-b border-[#bac4c6]/40">
                    {teacher.email}
                  </p>
                )}
                
                <div className={cn("space-y-1.5", !teacher.email && "pt-2 border-t border-[#bac4c6]/40")}>
                  {(teacher.assignedClasses || []).length > 0 && (
                    <div className="flex flex-wrap items-center gap-1">
                      <span className="text-[10px] font-bold text-[#807654] uppercase tracking-wider mr-0.5">Classes:</span>
                      {teacher.assignedClasses.map(c => (
                        <span key={c} className="px-1.5 py-0.5 bg-[#1c4a59]/10 text-[#1c4a59] border border-[#1c4a59]/20 text-[10px] font-bold rounded-md">
                          {c}
                        </span>
                      ))}
                    </div>
                  )}

                  {(teacher.subjects || []).length > 0 && (
                    <div className="flex flex-wrap items-center gap-1">
                      <span className="text-[10px] font-bold text-[#6a7f84] uppercase tracking-wider mr-0.5">Subjects:</span>
                      {teacher.subjects.map(s => (
                        <span key={s} className="px-1.5 py-0.5 bg-[#f6f8f7] text-[#1f2a2e] border border-[#bac4c6]/80 text-[10px] font-bold rounded-md">
                          {s}
                        </span>
                      ))}
                    </div>
                  )}

                  {(teacher.assignedClasses || []).length === 0 && (teacher.subjects || []).length === 0 && (
                    <p className="text-[11px] text-[#6a7f84] italic">No classes or subjects assigned yet</p>
                  )}
                </div>
              </div>
            </div>
            );
          })}
        </div>
      )}

      {/* Responsive Add/Edit Teacher Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-[#1f2a2e]/60 backdrop-blur-xs print:hidden">
          <div className="bg-white text-[#1f2a2e] rounded-2xl sm:rounded-3xl w-full max-w-lg shadow-2xl max-h-[92vh] flex flex-col overflow-hidden border border-[#bac4c6]">
            <div className="bg-[#1c4a59] px-4 sm:px-6 py-3.5 sm:py-4 text-white flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <Users className="w-4 h-4 sm:w-5 sm:h-5 text-[#faae57] shrink-0" />
                <h3 className="text-sm sm:text-lg font-bold text-white truncate">
                  {editingTeacher ? 'Edit Teacher Record' : 'Add New Teacher'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            </div>
            <form onSubmit={handleTeacherSubmit} className="p-3.5 sm:p-6 space-y-3 sm:space-y-4 overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3.5">
                <div className="space-y-1">
                  <label className="text-[10px] sm:text-[11px] font-bold text-[#6a7f84] uppercase tracking-wider">First Name</label>
                  <input name="firstName" defaultValue={editingTeacher?.firstName} placeholder="First Name" required className="w-full h-9 sm:h-10 px-3 bg-[#f6f8f7] text-[#1f2a2e] text-xs sm:text-sm border border-[#bac4c6] rounded-xl focus:ring-2 focus:ring-[#1c4a59] focus:bg-white outline-none" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] sm:text-[11px] font-bold text-[#6a7f84] uppercase tracking-wider">Last Name</label>
                  <input name="lastName" defaultValue={editingTeacher?.lastName} placeholder="Last Name" required className="w-full h-9 sm:h-10 px-3 bg-[#f6f8f7] text-[#1f2a2e] text-xs sm:text-sm border border-[#bac4c6] rounded-xl focus:ring-2 focus:ring-[#1c4a59] focus:bg-white outline-none" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3.5">
                <div className="space-y-1">
                  <label className="text-[10px] sm:text-[11px] font-bold text-[#6a7f84] uppercase tracking-wider">Phone</label>
                  <input name="phone" defaultValue={editingTeacher?.phone} placeholder="Phone Number" required className="w-full h-9 sm:h-10 px-3 bg-[#f6f8f7] text-[#1f2a2e] text-xs sm:text-sm border border-[#bac4c6] rounded-xl focus:ring-2 focus:ring-[#1c4a59] focus:bg-white outline-none font-mono" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] sm:text-[11px] font-bold text-[#6a7f84] uppercase tracking-wider">Email</label>
                  <input name="email" type="email" defaultValue={editingTeacher?.email} placeholder="Email Address" className="w-full h-9 sm:h-10 px-3 bg-[#f6f8f7] text-[#1f2a2e] text-xs sm:text-sm border border-[#bac4c6] rounded-xl focus:ring-2 focus:ring-[#1c4a59] focus:bg-white outline-none" />
                </div>
              </div>

              <div className="space-y-1.5 pt-0.5">
                <label className="text-[10px] sm:text-[11px] font-bold text-[#6a7f84] uppercase tracking-wider">Assign Classes</label>
                <div className="flex flex-wrap gap-1.5 max-h-28 sm:max-h-36 overflow-y-auto p-2 bg-[#f6f8f7] rounded-xl border border-[#bac4c6]/60">
                  {classes?.map(cls => (
                    <button
                      key={cls.id}
                      type="button"
                      onClick={() => toggleClass(cls.name)}
                      className={cn(
                        "px-2.5 py-1 rounded-lg text-xs font-bold transition-all border cursor-pointer",
                        selectedClasses.includes(cls.name)
                          ? "bg-[#1c4a59] border-[#1c4a59] text-[#faae57]"
                          : "bg-white border-[#bac4c6] text-[#1f2a2e] hover:border-[#1c4a59]"
                      )}
                    >
                      {cls.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5 pt-0.5">
                <label className="text-[10px] sm:text-[11px] font-bold text-[#6a7f84] uppercase tracking-wider">Assign Subjects</label>
                <div className="flex flex-wrap gap-1.5 max-h-28 sm:max-h-36 overflow-y-auto p-2 bg-[#f6f8f7] rounded-xl border border-[#bac4c6]/60">
                  {subjects?.map(sub => (
                    <button
                      key={sub.id}
                      type="button"
                      onClick={() => toggleSubject(sub.name)}
                      className={cn(
                        "px-2.5 py-1 rounded-lg text-xs font-bold transition-all border cursor-pointer",
                        selectedSubjects.includes(sub.name)
                          ? "bg-[#1c4a59] border-[#1c4a59] text-[#faae57]"
                          : "bg-white border-[#bac4c6] text-[#1f2a2e] hover:border-[#1c4a59]"
                      )}
                    >
                      {sub.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5 pt-3 border-t border-[#bac4c6]/50">
                <button type="button" onClick={() => setIsModalOpen(false)} className="w-full py-2.5 bg-[#f6f8f7] border border-[#bac4c6] rounded-xl font-bold text-xs sm:text-sm text-[#1f2a2e] hover:bg-[#e1c594]/30 cursor-pointer transition-colors">Cancel</button>
                <button id="teacher-submit-btn" type="submit" className="w-full py-2.5 bg-[#faae57] hover:bg-[#e4ae67] text-[#1f2a2e] rounded-xl font-bold text-xs sm:text-sm shadow-xs cursor-pointer transition-all active:scale-[0.98]">{editingTeacher ? 'Update Teacher' : 'Save Teacher'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function ClassList() {
  const [searchTerm, setSearchTerm] = useState('');
  const classes = useLiveQuery(() => 
    db.classes.filter(c => 
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.level.toLowerCase().includes(searchTerm.toLowerCase())
    ).toArray(),
    [searchTerm]
  );
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<ClassInfo | null>(null);

  const handleClassSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const clsData = {
      name: formData.get('name') as string,
      level: formData.get('level') as string
    };

    if (editingClass && editingClass.id) {
      await classesApi.update(editingClass.id, clsData);
    } else {
      await classesApi.create(clsData);
    }
    
    setIsModalOpen(false);
    setEditingClass(null);
  };

  const openEditModal = (cls: ClassInfo) => {
    setEditingClass(cls);
    setIsModalOpen(true);
  };

  return (
    <div className="space-y-3 sm:space-y-4 min-w-0">
      {/* Compact Single-Row Search & Add Toolbar */}
      <div className="flex items-center justify-between gap-2 sm:gap-3 bg-white p-2.5 sm:p-3.5 rounded-2xl border border-[#bac4c6]/70 shadow-[0_4px_16px_rgba(0,0,0,0.04)] print:hidden">
        <div className="relative flex-1 min-w-0 sm:max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6a7f84] pointer-events-none" />
          <input 
            type="text"
            placeholder="Search classes by name or level..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full h-9 sm:h-10 pl-9 pr-8 bg-[#f6f8f7] text-[#1f2a2e] placeholder:text-[#6a7f84] text-xs sm:text-sm border border-[#bac4c6] rounded-xl focus:ring-2 focus:ring-[#1c4a59] focus:bg-white outline-none transition-all"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              title="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[#6a7f84] hover:text-[#1f2a2e] rounded-lg hover:bg-[#bac4c6]/30 transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <button 
          type="button"
          onClick={() => {
            setEditingClass(null);
            setIsModalOpen(true);
          }}
          className="shrink-0 h-9 sm:h-10 bg-[#faae57] hover:bg-[#e4ae67] text-[#1f2a2e] px-3 sm:px-4 rounded-xl flex items-center justify-center gap-1.5 font-bold text-xs sm:text-sm transition-all shadow-xs whitespace-nowrap cursor-pointer active:scale-[0.98]"
        >
          <Plus className="w-4 h-4 stroke-[2.5] shrink-0" />
          <span>Add Class</span>
        </button>
      </div>

      {/* Compact 2-Column Mobile Classes Card Grid */}
      {classes && classes.length === 0 ? (
        <div className="bg-white border border-[#bac4c6]/80 rounded-2xl p-6 sm:p-10 text-center text-[#6a7f84]">
          <div className="w-11 h-11 rounded-2xl bg-[#1c4a59]/10 text-[#1c4a59] flex items-center justify-center mx-auto mb-2.5">
            <GraduationCap className="w-5 h-5" />
          </div>
          <p className="font-bold text-[#1f2a2e] text-sm sm:text-base">No classes found</p>
          <p className="text-xs text-[#6a7f84] mt-0.5">Try adjusting your search or add a new class level.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-3.5">
          {classes?.map(cls => (
            <div key={cls.id} className="bg-white p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-[#bac4c6]/80 hover:border-[#1c4a59]/60 shadow-[0_2px_10px_rgba(0,0,0,0.04)] relative group text-[#1f2a2e] transition-colors min-w-0">
              <div className="flex items-center justify-between gap-1.5 mb-2">
                <div className="w-8 h-8 sm:w-9 sm:h-9 bg-[#1c4a59]/10 border border-[#1c4a59]/20 rounded-xl flex items-center justify-center text-[#1c4a59] shrink-0">
                  <GraduationCap className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
                <div className="flex items-center gap-1 print:hidden">
                  <button 
                    type="button"
                    onClick={() => openEditModal(cls)}
                    title="Edit Class"
                    className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center text-[#1c4a59] bg-[#f6f8f7] hover:bg-[#1c4a59]/10 border border-[#bac4c6]/80 rounded-lg transition-all cursor-pointer active:scale-[0.96]"
                  >
                    <Edit2 className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                  </button>
                  <button 
                    type="button"
                    onClick={() => classesApi.delete(cls.id!)}
                    title="Delete Class"
                    className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center text-[#6a7f84] hover:text-[#ef476f] bg-[#f6f8f7] hover:bg-[#ef476f]/10 hover:border-[#ef476f]/30 border border-[#bac4c6]/80 rounded-lg transition-all cursor-pointer active:scale-[0.96]"
                  >
                    <Trash2 className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                  </button>
                </div>
              </div>
              <h4 className="font-bold text-[#1f2a2e] text-xs sm:text-sm border-b border-[#bac4c6]/40 pb-1.5 mb-1.5 truncate" title={cls.name}>
                {cls.name}
              </h4>
              <p className="text-[10px] sm:text-[11px] text-[#807654] font-bold uppercase tracking-wider truncate" title={cls.level}>
                {cls.level}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Responsive Add/Edit Class Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-[#1f2a2e]/60 backdrop-blur-xs print:hidden">
          <div className="bg-white text-[#1f2a2e] rounded-2xl sm:rounded-3xl w-full max-w-md shadow-2xl overflow-hidden border border-[#bac4c6]">
            <div className="bg-[#1c4a59] px-4 sm:px-6 py-3.5 sm:py-4 text-white flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <GraduationCap className="w-4 h-4 sm:w-5 sm:h-5 text-[#faae57] shrink-0" />
                <h3 className="text-sm sm:text-lg font-bold text-white truncate">
                  {editingClass ? 'Edit Class' : 'Add New Class'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            </div>
            <form onSubmit={handleClassSubmit} className="p-3.5 sm:p-6 space-y-3 sm:space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] sm:text-[11px] font-bold text-[#6a7f84] uppercase tracking-wider">Class Name</label>
                <input name="name" defaultValue={editingClass?.name} placeholder="Class Name (e.g., Primary 1A)" required className="w-full h-9 sm:h-10 px-3 bg-[#f6f8f7] text-[#1f2a2e] text-xs sm:text-sm border border-[#bac4c6] rounded-xl focus:ring-2 focus:ring-[#1c4a59] focus:bg-white outline-none" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] sm:text-[11px] font-bold text-[#6a7f84] uppercase tracking-wider">Academic Level</label>
                <select name="level" defaultValue={editingClass?.level} className="w-full h-9 sm:h-10 px-3 bg-[#f6f8f7] text-[#1f2a2e] text-xs sm:text-sm border border-[#bac4c6] rounded-xl focus:ring-2 focus:ring-[#1c4a59] focus:bg-white outline-none">
                  <option>Lower Primary</option>
                  <option>Upper Primary</option>
                  <option>Junior High School</option>
                  <option>Senior High School</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2.5 pt-3 border-t border-[#bac4c6]/50">
                <button type="button" onClick={() => setIsModalOpen(false)} className="w-full py-2.5 bg-[#f6f8f7] border border-[#bac4c6] rounded-xl font-bold text-xs sm:text-sm text-[#1f2a2e] hover:bg-[#e1c594]/30 cursor-pointer transition-colors">Cancel</button>
                <button type="submit" className="w-full py-2.5 bg-[#faae57] hover:bg-[#e4ae67] text-[#1f2a2e] rounded-xl font-bold text-xs sm:text-sm shadow-xs cursor-pointer transition-all active:scale-[0.98]">{editingClass ? 'Update' : 'Save'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function SubjectStatusIndicator({
  status,
  className
}: {
  status: SubjectRegistrationStatus;
  className?: string;
}) {
  if (status === 'Enrolled') {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border transition-colors shadow-2xs",
          "bg-[#06d6a0]/15 text-[#065f46] border-[#06d6a0]/50",
          className
        )}
        title="Status: Enrolled (Confirmed & active in curriculum)"
      >
        <CheckCircle2 className="w-3.5 h-3.5 text-[#065f46] shrink-0" />
        <span>Enrolled</span>
      </span>
    );
  }

  if (status === 'Pending Approval') {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold border transition-colors shadow-2xs",
          "bg-[#faae57]/20 text-[#854d0e] border-[#faae57]/60",
          className
        )}
        title="Status: Pending Approval (Awaiting administrative / HOD sign-off)"
      >
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#faae57] opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-[#d97706]" />
        </span>
        <Clock className="w-3.5 h-3.5 text-[#854d0e] shrink-0" />
        <span>Pending Approval</span>
      </span>
    );
  }

  // Default: 'Available'
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border transition-colors shadow-2xs",
        "bg-[#1c4a59]/10 text-[#1c4a59] border-[#1c4a59]/30",
        className
      )}
      title="Status: Available (Open for student & staff enrollment)"
    >
      <Sparkles className="w-3.5 h-3.5 text-[#1c4a59] shrink-0" />
      <span>Available</span>
    </span>
  );
}

function SubjectList() {
  const { user } = useAuth();
  const { showToast } = useNotifications();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | SubjectRegistrationStatus>('All');

  // Load user-specific enrollment/pending state
  const registeredSetting = useLiveQuery(
    () => db.settings.where('key').equals(`registered_subjects_${user?.username || user?.id || 'current_user'}`).first(),
    [user]
  );
  const pendingSetting = useLiveQuery(
    () => db.settings.where('key').equals(`pending_subjects_${user?.username || user?.id || 'current_user'}`).first(),
    [user]
  );
  const teachers = useLiveQuery(() => db.teachers.toArray()) || [];
  const currentTeacher = teachers.find(
    t => t.email === user?.email || t.staffId === user?.username || `${t.firstName} ${t.lastName}` === user?.fullName
  );

  const userEnrolledList = React.useMemo(() => {
    return (registeredSetting?.value as string[]) || [];
  }, [registeredSetting]);

  const userPendingList = React.useMemo(() => {
    return (pendingSetting?.value as string[]) || [];
  }, [pendingSetting]);

  const getSubjectStatus = React.useCallback((sub: Subject): SubjectRegistrationStatus => {
    if (sub.status === 'Enrolled' || sub.status === 'Pending Approval' || sub.status === 'Available') {
      return sub.status;
    }
    if (sub.registrationStatus === 'Enrolled' || sub.registrationStatus === 'Pending Approval' || sub.registrationStatus === 'Available') {
      return sub.registrationStatus;
    }
    const nameLower = (sub.name || '').toLowerCase().trim();
    if (userEnrolledList.some(n => n.toLowerCase().trim() === nameLower)) {
      return 'Enrolled';
    }
    if (userPendingList.some(n => n.toLowerCase().trim() === nameLower)) {
      return 'Pending Approval';
    }
    if (currentTeacher?.subjects?.some(n => n.toLowerCase().trim() === nameLower)) {
      return 'Enrolled';
    }
    return 'Available';
  }, [userEnrolledList, userPendingList, currentTeacher]);

  const allSubjects = useLiveQuery(() => db.subjects.toArray()) || [];
  const classes = useLiveQuery(() => db.classes.toArray()) || [];

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null);
  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);
  const [isAllClasses, setIsAllClasses] = useState(true);
  const [formStatus, setFormStatus] = useState<SubjectRegistrationStatus>('Available');

  // Compute status summary KPI counts
  const statusCounts = React.useMemo(() => {
    let enrolled = 0;
    let pending = 0;
    let available = 0;
    allSubjects.forEach(s => {
      const st = getSubjectStatus(s);
      if (st === 'Enrolled') enrolled++;
      else if (st === 'Pending Approval') pending++;
      else available++;
    });
    return {
      total: allSubjects.length,
      enrolled,
      pending,
      available
    };
  }, [allSubjects, getSubjectStatus]);

  // Filter subjects by search and active status filter
  const filteredSubjects = React.useMemo(() => {
    const q = (searchTerm || '').toLowerCase().trim();
    return allSubjects.filter(s => {
      if (!s) return false;
      const status = getSubjectStatus(s);
      if (statusFilter !== 'All' && status !== statusFilter) {
        return false;
      }
      if (!q) return true;
      const name = (s.name || '').toLowerCase();
      const code = (s.code || '').toLowerCase();
      return name.includes(q) || code.includes(q) || status.toLowerCase().includes(q);
    });
  }, [allSubjects, searchTerm, statusFilter, getSubjectStatus]);

  const toggleClass = (className: string) => {
    setSelectedClasses(prev => 
      prev.includes(className) ? prev.filter(c => c !== className) : [...prev, className]
    );
    setIsAllClasses(false);
  };

  const openEditModal = (sub: Subject) => {
    setEditingSubject(sub);
    setSelectedClasses((sub.applicableClasses || []).filter(c => c !== 'All'));
    setIsAllClasses(sub.applicableClasses?.includes('All') ?? true);
    setFormStatus(getSubjectStatus(sub));
    setIsModalOpen(true);
  };

  const handleUpdateStatus = async (sub: Subject, newStatus: SubjectRegistrationStatus) => {
    try {
      if (sub.id) {
        await subjectsApi.update(sub.id, {
          status: newStatus,
          registrationStatus: newStatus
        });
      }

      const username = user?.username || user?.id || 'current_user';
      const enrolledKey = `registered_subjects_${username}`;
      const pendingKey = `pending_subjects_${username}`;

      const nameClean = sub.name.trim();
      let nextEnrolled = userEnrolledList.filter(n => n.toLowerCase().trim() !== nameClean.toLowerCase());
      let nextPending = userPendingList.filter(n => n.toLowerCase().trim() !== nameClean.toLowerCase());

      if (newStatus === 'Enrolled') {
        nextEnrolled.push(nameClean);
      } else if (newStatus === 'Pending Approval') {
        nextPending.push(nameClean);
      }

      const existingEnrolled = await db.settings.where('key').equals(enrolledKey).first();
      if (existingEnrolled?.id) {
        await db.settings.update(existingEnrolled.id, { value: nextEnrolled });
      } else {
        await db.settings.add({ key: enrolledKey, value: nextEnrolled });
      }

      const existingPending = await db.settings.where('key').equals(pendingKey).first();
      if (existingPending?.id) {
        await db.settings.update(existingPending.id, { value: nextPending });
      } else {
        await db.settings.add({ key: pendingKey, value: nextPending });
      }

      showToast?.(`"${sub.name}" status updated to ${newStatus}`, 'success');
    } catch (err) {
      showToast?.('Failed to update subject registration status', 'error');
    }
  };

  const handleSubjectSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const subData = {
      name: formData.get('name') as string,
      code: formData.get('code') as string,
      applicableClasses: isAllClasses ? ['All'] : selectedClasses,
      status: formStatus,
      registrationStatus: formStatus
    };

    if (editingSubject && editingSubject.id) {
      await subjectsApi.update(editingSubject.id, subData);
      showToast?.(`Subject "${subData.name}" updated successfully`, 'success');
    } else {
      await subjectsApi.create(subData);
      showToast?.(`Subject "${subData.name}" created with status "${formStatus}"`, 'success');
    }

    // Sync user enrollment list if marked Enrolled
    if (formStatus === 'Enrolled') {
      const username = user?.username || user?.id || 'current_user';
      const enrolledKey = `registered_subjects_${username}`;
      const nameClean = subData.name.trim();
      if (!userEnrolledList.includes(nameClean)) {
        const nextList = [...userEnrolledList, nameClean];
        const existing = await db.settings.where('key').equals(enrolledKey).first();
        if (existing?.id) {
          await db.settings.update(existing.id, { value: nextList });
        } else {
          await db.settings.add({ key: enrolledKey, value: nextList });
        }
      }
    }

    setIsModalOpen(false);
    setEditingSubject(null);
    setSelectedClasses([]);
    setIsAllClasses(true);
    setFormStatus('Available');
  };

  return (
    <div className="space-y-3 sm:space-y-4 min-w-0">
      {/* Visual Status Indicator KPI Header Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 print:hidden">
        <button
          type="button"
          onClick={() => setStatusFilter('All')}
          className={cn(
            "p-2.5 sm:p-3 rounded-2xl border text-left transition-all cursor-pointer relative overflow-hidden group shadow-xs",
            statusFilter === 'All'
              ? "bg-[#1c4a59] text-white border-[#1c4a59] ring-2 ring-[#1c4a59]/30"
              : "bg-white text-[#1f2a2e] border-[#bac4c6]/70 hover:border-[#1c4a59]/50"
          )}
        >
          <div className="flex items-center justify-between gap-1 mb-1">
            <span className={cn("text-[10px] font-bold uppercase tracking-wider", statusFilter === 'All' ? "text-white/80" : "text-[#6a7f84]")}>
              Total Curriculum
            </span>
            <Book className={cn("w-3.5 h-3.5", statusFilter === 'All' ? "text-[#faae57]" : "text-[#1c4a59]")} />
          </div>
          <div className="text-lg sm:text-xl font-black tabular-nums">{statusCounts.total}</div>
          <span className={cn("text-[10px] font-medium block truncate", statusFilter === 'All' ? "text-white/70" : "text-[#6a7f84]")}>
            All curriculum subjects
          </span>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter('Enrolled')}
          className={cn(
            "p-2.5 sm:p-3 rounded-2xl border text-left transition-all cursor-pointer relative overflow-hidden group shadow-xs",
            statusFilter === 'Enrolled'
              ? "bg-[#06d6a0] text-[#065f46] border-[#06d6a0] ring-2 ring-[#06d6a0]/30"
              : "bg-white text-[#1f2a2e] border-[#bac4c6]/70 hover:border-[#06d6a0]/50"
          )}
        >
          <div className="flex items-center justify-between gap-1 mb-1">
            <span className={cn("text-[10px] font-bold uppercase tracking-wider", statusFilter === 'Enrolled' ? "text-[#065f46]" : "text-[#065f46]")}>
              Enrolled
            </span>
            <CheckCircle2 className="w-3.5 h-3.5 text-[#06d6a0]" />
          </div>
          <div className="text-lg sm:text-xl font-black text-[#065f46] tabular-nums">{statusCounts.enrolled}</div>
          <span className="text-[10px] font-medium text-[#065f46]/80 block truncate">
            Active registrations confirmed
          </span>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter('Pending Approval')}
          className={cn(
            "p-2.5 sm:p-3 rounded-2xl border text-left transition-all cursor-pointer relative overflow-hidden group shadow-xs",
            statusFilter === 'Pending Approval'
              ? "bg-[#faae57] text-[#1f2a2e] border-[#faae57] ring-2 ring-[#faae57]/40"
              : "bg-white text-[#1f2a2e] border-[#bac4c6]/70 hover:border-[#faae57]/60"
          )}
        >
          <div className="flex items-center justify-between gap-1 mb-1">
            <span className={cn("text-[10px] font-bold uppercase tracking-wider", statusFilter === 'Pending Approval' ? "text-[#1f2a2e]" : "text-[#854d0e]")}>
              Pending Approval
            </span>
            <Clock className="w-3.5 h-3.5 text-[#d97706]" />
          </div>
          <div className="text-lg sm:text-xl font-black text-[#854d0e] tabular-nums">{statusCounts.pending}</div>
          <span className="text-[10px] font-medium text-[#854d0e]/80 block truncate">
            Awaiting HOD / Admin review
          </span>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter('Available')}
          className={cn(
            "p-2.5 sm:p-3 rounded-2xl border text-left transition-all cursor-pointer relative overflow-hidden group shadow-xs",
            statusFilter === 'Available'
              ? "bg-[#1c4a59] text-[#faae57] border-[#1c4a59] ring-2 ring-[#1c4a59]/30"
              : "bg-white text-[#1f2a2e] border-[#bac4c6]/70 hover:border-[#1c4a59]/40"
          )}
        >
          <div className="flex items-center justify-between gap-1 mb-1">
            <span className={cn("text-[10px] font-bold uppercase tracking-wider", statusFilter === 'Available' ? "text-white/80" : "text-[#1c4a59]")}>
              Available
            </span>
            <Sparkles className="w-3.5 h-3.5 text-[#faae57]" />
          </div>
          <div className="text-lg sm:text-xl font-black text-[#1c4a59] tabular-nums">{statusCounts.available}</div>
          <span className={cn("text-[10px] font-medium block truncate", statusFilter === 'Available' ? "text-white/70" : "text-[#6a7f84]")}>
            Open for direct enrollment
          </span>
        </button>
      </div>

      {/* Search & Actions Toolbar with Status Quick Filters */}
      <div className="space-y-2.5 bg-white p-2.5 sm:p-3.5 rounded-2xl border border-[#bac4c6]/70 shadow-[0_4px_16px_rgba(0,0,0,0.04)] print:hidden">
        <div className="flex items-center justify-between gap-2 sm:gap-3">
          <div className="relative flex-1 min-w-0 sm:max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6a7f84] pointer-events-none" />
            <input 
              type="text"
              placeholder="Search by subject, code, or status (Enrolled, Pending, Available)..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full h-9 sm:h-10 pl-9 pr-8 bg-[#f6f8f7] text-[#1f2a2e] placeholder:text-[#6a7f84] text-xs sm:text-sm border border-[#bac4c6] rounded-xl focus:ring-2 focus:ring-[#1c4a59] focus:bg-white outline-none transition-all"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                title="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[#6a7f84] hover:text-[#1f2a2e] rounded-lg hover:bg-[#bac4c6]/30 transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <button 
            type="button"
            onClick={() => {
              setEditingSubject(null);
              setSelectedClasses([]);
              setIsAllClasses(true);
              setFormStatus('Available');
              setIsModalOpen(true);
            }}
            className="shrink-0 h-9 sm:h-10 bg-[#faae57] hover:bg-[#e4ae67] text-[#1f2a2e] px-3 sm:px-4 rounded-xl flex items-center justify-center gap-1.5 font-bold text-xs sm:text-sm transition-all shadow-xs whitespace-nowrap cursor-pointer active:scale-[0.98]"
          >
            <Plus className="w-4 h-4 stroke-[2.5] shrink-0" />
            <span>Add Subject</span>
          </button>
        </div>

        {/* Visual Status Filter Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-[#bac4c6]/40 text-xs">
          <span className="text-[10px] sm:text-[11px] font-bold text-[#6a7f84] uppercase tracking-wider shrink-0 mr-1 flex items-center gap-1">
            <Filter className="w-3 h-3 text-[#1c4a59]" /> Status:
          </span>
          <button
            type="button"
            onClick={() => setStatusFilter('All')}
            className={cn(
              "px-2.5 sm:px-3 py-1 rounded-lg font-bold transition-all border shrink-0 cursor-pointer text-xs flex items-center gap-1.5",
              statusFilter === 'All'
                ? "bg-[#1c4a59] text-white border-[#1c4a59] shadow-2xs"
                : "bg-[#f6f8f7] text-[#6a7f84] border-[#bac4c6]/70 hover:text-[#1f2a2e]"
            )}
          >
            <span>All Subjects</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-white/20 font-mono">{statusCounts.total}</span>
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('Enrolled')}
            className={cn(
              "px-2.5 sm:px-3 py-1 rounded-lg font-bold transition-all border shrink-0 cursor-pointer text-xs flex items-center gap-1.5",
              statusFilter === 'Enrolled'
                ? "bg-[#06d6a0] text-[#065f46] border-[#06d6a0] shadow-2xs"
                : "bg-white text-[#065f46] border-[#06d6a0]/50 hover:bg-[#06d6a0]/15"
            )}
          >
            <CheckCircle2 className="w-3 h-3 shrink-0" />
            <span>Enrolled</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-[#06d6a0]/25 font-bold font-mono">{statusCounts.enrolled}</span>
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('Pending Approval')}
            className={cn(
              "px-2.5 sm:px-3 py-1 rounded-lg font-bold transition-all border shrink-0 cursor-pointer text-xs flex items-center gap-1.5",
              statusFilter === 'Pending Approval'
                ? "bg-[#faae57] text-[#1f2a2e] border-[#faae57] shadow-2xs"
                : "bg-white text-[#854d0e] border-[#faae57]/50 hover:bg-[#faae57]/15"
            )}
          >
            <Clock className="w-3 h-3 shrink-0" />
            <span>Pending Approval</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-[#faae57]/30 font-bold font-mono">{statusCounts.pending}</span>
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('Available')}
            className={cn(
              "px-2.5 sm:px-3 py-1 rounded-lg font-bold transition-all border shrink-0 cursor-pointer text-xs flex items-center gap-1.5",
              statusFilter === 'Available'
                ? "bg-[#1c4a59] text-[#faae57] border-[#1c4a59] shadow-2xs"
                : "bg-white text-[#1c4a59] border-[#1c4a59]/30 hover:bg-[#1c4a59]/10"
            )}
          >
            <Sparkles className="w-3 h-3 shrink-0" />
            <span>Available</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-[#1c4a59]/15 font-bold font-mono">{statusCounts.available}</span>
          </button>
        </div>
      </div>

      {/* High-Density Subject Cards Grid with Visual Status Indicators */}
      {filteredSubjects.length === 0 ? (
        <div className="bg-white border border-[#bac4c6]/80 rounded-2xl p-6 sm:p-10 text-center text-[#6a7f84]">
          <div className="w-11 h-11 rounded-2xl bg-[#1c4a59]/10 text-[#1c4a59] flex items-center justify-center mx-auto mb-2.5">
            <Book className="w-5 h-5" />
          </div>
          <p className="font-bold text-[#1f2a2e] text-sm sm:text-base">No subjects found</p>
          <p className="text-xs text-[#6a7f84] mt-0.5">
            {statusFilter !== 'All' 
              ? `No subjects currently have the "${statusFilter}" status.` 
              : 'Try adjusting your search or add a new subject to the curriculum.'}
          </p>
          {statusFilter !== 'All' && (
            <button
              type="button"
              onClick={() => setStatusFilter('All')}
              className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-[#1c4a59] hover:underline cursor-pointer"
            >
              Show all subjects ({statusCounts.total})
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-3.5">
          {filteredSubjects.map(sub => {
            const currentStatus = getSubjectStatus(sub);
            return (
              <div 
                key={sub.id || sub.name} 
                className={cn(
                  "bg-white p-3 sm:p-4 rounded-xl sm:rounded-2xl border transition-all flex flex-col justify-between text-[#1f2a2e] min-w-0 shadow-[0_2px_10px_rgba(0,0,0,0.04)]",
                  currentStatus === 'Enrolled' && "border-emerald-200/90 hover:border-emerald-400/90",
                  currentStatus === 'Pending Approval' && "border-amber-200/90 hover:border-amber-400/90",
                  currentStatus === 'Available' && "border-[#bac4c6]/80 hover:border-[#1c4a59]/60"
                )}
              >
                <div>
                  {/* Top Header: Icon, Name/Code, Status Indicator & Actions */}
                  <div className="flex items-start justify-between gap-2.5 mb-2.5">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={cn(
                        "w-9 h-9 border rounded-xl flex items-center justify-center shrink-0 transition-colors",
                        currentStatus === 'Enrolled' && "bg-[#06d6a0]/15 border-[#06d6a0]/30 text-[#065f46]",
                        currentStatus === 'Pending Approval' && "bg-[#faae57]/20 border-[#faae57]/40 text-[#854d0e]",
                        currentStatus === 'Available' && "bg-[#1c4a59]/10 border-[#1c4a59]/20 text-[#1c4a59]"
                      )}>
                        <Book className="w-4 h-4 sm:w-5 sm:h-5" />
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-bold text-[#1f2a2e] text-xs sm:text-sm truncate" title={sub.name}>
                          {sub.name}
                        </h4>
                        <p className="text-[10px] sm:text-[11px] font-bold text-[#807654] font-mono tabular-nums">
                          {sub.code}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0 print:hidden">
                      <button 
                        type="button"
                        onClick={() => openEditModal(sub)}
                        title="Edit Subject & Status"
                        className="w-8 h-8 flex items-center justify-center text-[#1c4a59] bg-[#f6f8f7] hover:bg-[#1c4a59]/10 border border-[#bac4c6]/80 rounded-lg transition-all cursor-pointer active:scale-[0.96]"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button 
                        type="button"
                        onClick={() => subjectsApi.delete(sub.id!)}
                        title="Delete Subject"
                        className="w-8 h-8 flex items-center justify-center text-[#6a7f84] hover:text-[#ef476f] bg-[#f6f8f7] hover:bg-[#ef476f]/10 hover:border-[#ef476f]/30 border border-[#bac4c6]/80 rounded-lg transition-all cursor-pointer active:scale-[0.96]"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* VISUAL STATUS INDICATOR ROW */}
                  <div className="mb-2.5 flex items-center justify-between gap-2 p-1.5 bg-[#f6f8f7] rounded-xl border border-[#bac4c6]/50">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-[10px] font-bold text-[#6a7f84] uppercase tracking-wider shrink-0 hidden sm:inline">
                        Status:
                      </span>
                      {/* Primary Visual Status Indicator Badge */}
                      <SubjectStatusIndicator status={currentStatus} />
                    </div>

                    {/* Quick Status Selector Dropdown */}
                    <div className="shrink-0 print:hidden">
                      <select
                        value={currentStatus}
                        onChange={(e) => handleUpdateStatus(sub, e.target.value as SubjectRegistrationStatus)}
                        className={cn(
                          "text-[10px] font-bold rounded-lg px-2 py-0.5 border outline-none cursor-pointer transition-colors",
                          currentStatus === 'Enrolled' && "bg-white text-[#065f46] border-[#06d6a0]/60",
                          currentStatus === 'Pending Approval' && "bg-white text-[#854d0e] border-[#faae57]/70",
                          currentStatus === 'Available' && "bg-white text-[#1c4a59] border-[#1c4a59]/40"
                        )}
                        title="Change subject registration status"
                      >
                        <option value="Enrolled">Mark: Enrolled</option>
                        <option value="Pending Approval">Mark: Pending Approval</option>
                        <option value="Available">Mark: Available</option>
                      </select>
                    </div>
                  </div>
                </div>
                
                {/* Bottom Row: Applicable Classes & Quick Action Button */}
                <div className="pt-2 border-t border-[#bac4c6]/40 space-y-2">
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="text-[10px] font-bold text-[#6a7f84] uppercase tracking-wider mr-0.5">Classes:</span>
                    {sub.applicableClasses?.includes('All') ? (
                      <span className="px-2 py-0.5 bg-[#06d6a0]/15 text-[#065f46] border border-[#06d6a0]/40 text-[10px] font-bold rounded-md">
                        All Classes
                      </span>
                    ) : (
                      sub.applicableClasses?.map(c => (
                        <span key={c} className="px-1.5 py-0.5 bg-[#f6f8f7] text-[#1c4a59] border border-[#bac4c6]/80 text-[10px] font-bold rounded-md">
                          {c}
                        </span>
                      ))
                    )}
                    {(!sub.applicableClasses || sub.applicableClasses.length === 0) && (
                      <span className="px-1.5 py-0.5 bg-[#f6f8f7] text-[#6a7f84] border border-[#bac4c6]/60 text-[10px] font-bold rounded-md">
                        Not Assigned
                      </span>
                    )}
                  </div>

                  {/* 1-Click Status Action Buttons */}
                  <div className="flex items-center gap-1.5 print:hidden">
                    {currentStatus === 'Available' && (
                      <button
                        type="button"
                        onClick={() => handleUpdateStatus(sub, 'Enrolled')}
                        className="flex-1 py-1 px-2 bg-[#06d6a0]/15 hover:bg-[#06d6a0]/25 text-[#065f46] border border-[#06d6a0]/40 rounded-lg text-[11px] font-bold transition-all flex items-center justify-center gap-1 cursor-pointer"
                        title="Enroll directly into this curriculum subject"
                      >
                        <CheckCircle2 className="w-3 h-3" />
                        <span>Enroll Subject</span>
                      </button>
                    )}
                    {currentStatus === 'Available' && (
                      <button
                        type="button"
                        onClick={() => handleUpdateStatus(sub, 'Pending Approval')}
                        className="py-1 px-2 bg-[#faae57]/20 hover:bg-[#faae57]/30 text-[#854d0e] border border-[#faae57]/50 rounded-lg text-[11px] font-bold transition-all flex items-center justify-center gap-1 cursor-pointer"
                        title="Request enrollment approval from HOD / Academic Director"
                      >
                        <Clock className="w-3 h-3" />
                        <span>Request Approval</span>
                      </button>
                    )}
                    {currentStatus === 'Pending Approval' && (
                      <button
                        type="button"
                        onClick={() => handleUpdateStatus(sub, 'Enrolled')}
                        className="flex-1 py-1 px-2 bg-[#06d6a0] hover:bg-[#05b88a] text-white rounded-lg text-[11px] font-bold transition-all flex items-center justify-center gap-1 cursor-pointer shadow-2xs"
                        title="Approve pending enrollment for this subject"
                      >
                        <Check className="w-3 h-3" />
                        <span>Approve Enrollment</span>
                      </button>
                    )}
                    {currentStatus === 'Pending Approval' && (
                      <button
                        type="button"
                        onClick={() => handleUpdateStatus(sub, 'Available')}
                        className="py-1 px-2 bg-[#f6f8f7] hover:bg-slate-200 text-[#6a7f84] border border-[#bac4c6]/70 rounded-lg text-[11px] font-bold transition-all cursor-pointer"
                        title="Cancel request and set back to Available"
                      >
                        <span>Cancel</span>
                      </button>
                    )}
                    {currentStatus === 'Enrolled' && (
                      <button
                        type="button"
                        onClick={() => handleUpdateStatus(sub, 'Available')}
                        className="w-full py-1 px-2 bg-[#f6f8f7] hover:bg-[#1c4a59]/10 text-[#1c4a59] border border-[#bac4c6]/70 rounded-lg text-[11px] font-bold transition-all flex items-center justify-center gap-1 cursor-pointer"
                        title="Set status back to Available"
                      >
                        <Sparkles className="w-3 h-3 text-[#faae57]" />
                        <span>Change to Available</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Responsive Add/Edit Subject Modal with Status Selection */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-[#1f2a2e]/60 backdrop-blur-xs print:hidden">
          <div className="bg-white text-[#1f2a2e] rounded-2xl sm:rounded-3xl w-full max-w-md shadow-2xl max-h-[92vh] flex flex-col overflow-hidden border border-[#bac4c6]">
            <div className="bg-[#1c4a59] px-4 sm:px-6 py-3.5 sm:py-4 text-white flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <Book className="w-4 h-4 sm:w-5 sm:h-5 text-[#faae57] shrink-0" />
                <h3 className="text-sm sm:text-lg font-bold text-white truncate">
                  {editingSubject ? 'Edit Subject' : 'Add New Subject'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            </div>
            <form onSubmit={handleSubjectSubmit} className="p-3.5 sm:p-6 space-y-3 sm:space-y-4 overflow-y-auto">
              <div className="space-y-1">
                <label className="text-[10px] sm:text-[11px] font-bold text-[#6a7f84] uppercase tracking-wider">Subject Name</label>
                <input name="name" defaultValue={editingSubject?.name} placeholder="Subject Name" required className="w-full h-9 sm:h-10 px-3 bg-[#f6f8f7] text-[#1f2a2e] text-xs sm:text-sm border border-[#bac4c6] rounded-xl focus:ring-2 focus:ring-[#1c4a59] focus:bg-white outline-none" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] sm:text-[11px] font-bold text-[#6a7f84] uppercase tracking-wider">Subject Code</label>
                <input name="code" defaultValue={editingSubject?.code} placeholder="Subject Code (e.g., ENG-101)" required className="w-full h-9 sm:h-10 px-3 bg-[#f6f8f7] text-[#1f2a2e] text-xs sm:text-sm border border-[#bac4c6] rounded-xl focus:ring-2 focus:ring-[#1c4a59] focus:bg-white outline-none font-mono" />
              </div>

              {/* Status Picker in Modal */}
              <div className="space-y-1.5 pt-0.5">
                <label className="text-[10px] sm:text-[11px] font-bold text-[#6a7f84] uppercase tracking-wider">
                  Registration Status
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setFormStatus('Available')}
                    className={cn(
                      "p-2 rounded-xl border text-center transition-all cursor-pointer flex flex-col items-center gap-1",
                      formStatus === 'Available'
                        ? "bg-[#1c4a59]/10 border-[#1c4a59] text-[#1c4a59] ring-2 ring-[#1c4a59]/20 font-bold"
                        : "bg-[#f6f8f7] border-[#bac4c6]/70 text-[#6a7f84] hover:bg-white"
                    )}
                  >
                    <Sparkles className="w-4 h-4 text-[#1c4a59]" />
                    <span className="text-[11px] leading-tight">Available</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormStatus('Pending Approval')}
                    className={cn(
                      "p-2 rounded-xl border text-center transition-all cursor-pointer flex flex-col items-center gap-1",
                      formStatus === 'Pending Approval'
                        ? "bg-[#faae57]/25 border-[#faae57] text-[#854d0e] ring-2 ring-[#faae57]/30 font-bold"
                        : "bg-[#f6f8f7] border-[#bac4c6]/70 text-[#6a7f84] hover:bg-white"
                    )}
                  >
                    <Clock className="w-4 h-4 text-[#d97706]" />
                    <span className="text-[11px] leading-tight">Pending Approval</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormStatus('Enrolled')}
                    className={cn(
                      "p-2 rounded-xl border text-center transition-all cursor-pointer flex flex-col items-center gap-1",
                      formStatus === 'Enrolled'
                        ? "bg-[#06d6a0]/20 border-[#06d6a0] text-[#065f46] ring-2 ring-[#06d6a0]/30 font-bold"
                        : "bg-[#f6f8f7] border-[#bac4c6]/70 text-[#6a7f84] hover:bg-white"
                    )}
                  >
                    <CheckCircle2 className="w-4 h-4 text-[#06d6a0]" />
                    <span className="text-[11px] leading-tight">Enrolled</span>
                  </button>
                </div>
              </div>

              <div className="space-y-1.5 pt-0.5">
                <div className="flex justify-between items-center gap-2">
                  <label className="text-[10px] sm:text-[11px] font-bold text-[#6a7f84] uppercase tracking-wider">Applicable Classes</label>
                  <button 
                    type="button"
                    onClick={() => {
                      setIsAllClasses(true);
                      setSelectedClasses([]);
                    }}
                    className={cn(
                      "text-[11px] font-bold px-2.5 py-1 rounded-lg border transition-colors cursor-pointer",
                      isAllClasses
                        ? "bg-[#06d6a0]/20 border-[#06d6a0]/50 text-[#065f46]"
                        : "bg-[#f6f8f7] border-[#bac4c6] text-[#6a7f84] hover:text-[#1f2a2e]"
                    )}
                  >
                    All Classes
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5 max-h-32 sm:max-h-40 overflow-y-auto p-2 bg-[#f6f8f7] rounded-xl border border-[#bac4c6]/60">
                  {classes?.map(cls => (
                    <button
                      key={cls.id}
                      type="button"
                      onClick={() => toggleClass(cls.name)}
                      className={cn(
                        "px-2.5 py-1 text-xs font-bold transition-all border rounded-lg cursor-pointer",
                        selectedClasses.includes(cls.name)
                          ? "bg-[#1c4a59] border-[#1c4a59] text-[#faae57]"
                          : "bg-white border-[#bac4c6] text-[#1f2a2e] hover:border-[#1c4a59]"
                      )}
                    >
                      {cls.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5 pt-3 border-t border-[#bac4c6]/50">
                <button type="button" onClick={() => setIsModalOpen(false)} className="w-full py-2.5 bg-[#f6f8f7] border border-[#bac4c6] rounded-xl font-bold text-xs sm:text-sm text-[#1f2a2e] hover:bg-[#e1c594]/30 cursor-pointer transition-colors">Cancel</button>
                <button type="submit" className="w-full py-2.5 bg-[#faae57] hover:bg-[#e4ae67] text-[#1f2a2e] rounded-xl font-bold text-xs sm:text-sm shadow-xs cursor-pointer transition-all active:scale-[0.98]">{editingSubject ? 'Update' : 'Save'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}


