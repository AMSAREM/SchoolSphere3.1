import { useState } from 'react';
import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Teacher, type Subject, type ClassInfo } from '../db/schema';
import { Plus, Trash2, Book, GraduationCap, Users, Edit2, Search, Printer, X } from 'lucide-react';
import { motion } from 'motion/react';
import { cn, triggerPrint } from '../lib/utils';
import { teachersApi, classesApi, subjectsApi } from '../lib/api';

export default function AcademicManagement() {
  const [activeTab, setActiveTab] = useState<'teachers' | 'classes' | 'subjects'>('teachers');
  const settings = useLiveQuery(() => db.settings.toArray()) || [];
  const schoolName = settings.find(s => s.key === 'schoolProfile')?.value?.schoolName || 'ESEPA INTERNATIONAL SCHOOL';

  React.useEffect(() => {
    teachersApi.getAll().catch(() => {});
    classesApi.getAll().catch(() => {});
    subjectsApi.getAll().catch(() => {});
  }, []);

  return (
    <div className="space-y-3.5 sm:space-y-5 text-[#1f2a2e] min-w-0">
      {/* Print Only Header */}
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

      {/* Responsive Equal-Width 3-Tab Bar + Compact Print Action */}
      <div className="flex items-center justify-between gap-2 border-b border-[#bac4c6] bg-white rounded-t-2xl px-1.5 sm:px-3 print:hidden shadow-[0_2px_10px_rgba(0,0,0,0.03)]">
        <div className="flex-1 grid grid-cols-3 sm:flex sm:flex-initial">
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
        </div>
        
        <button 
          type="button"
          onClick={triggerPrint}
          title="Print Active List"
          className="print:hidden flex items-center justify-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 my-1.5 text-[#1c4a59] hover:text-[#1f2a2e] bg-[#f6f8f7] hover:bg-[#e1c594]/35 border border-[#bac4c6] rounded-xl transition-colors text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer active:scale-[0.98]"
        >
          <Printer className="w-3.5 h-3.5 text-[#1c4a59] shrink-0" />
          <span className="hidden sm:inline">Print List</span>
          <span className="sm:hidden">Print</span>
        </button>
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
      </motion.div>
    </div>
  );
}

function TeacherList() {
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

  return (
    <div className="space-y-3 sm:space-y-4 min-w-0">
      {/* Compact Single-Row Search & Add Toolbar */}
      <div className="flex items-center justify-between gap-2 sm:gap-3 bg-white p-2.5 sm:p-3.5 rounded-2xl border border-[#bac4c6]/70 shadow-[0_4px_16px_rgba(0,0,0,0.04)] print:hidden">
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
        <button 
          type="button"
          onClick={() => {
            setEditingTeacher(null);
            setIsModalOpen(true);
            setSelectedClasses([]);
            setSelectedSubjects([]);
          }}
          className="shrink-0 h-9 sm:h-10 bg-[#faae57] hover:bg-[#e4ae67] text-[#1f2a2e] px-3 sm:px-4 rounded-xl flex items-center justify-center gap-1.5 font-bold text-xs sm:text-sm transition-all shadow-xs whitespace-nowrap cursor-pointer active:scale-[0.98]"
        >
          <Plus className="w-4 h-4 stroke-[2.5] shrink-0" />
          <span>Add Teacher</span>
        </button>
      </div>

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
          {teachers?.map(teacher => (
            <div key={teacher.id} className="bg-white p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-[#bac4c6]/80 hover:border-[#1c4a59]/60 shadow-[0_2px_10px_rgba(0,0,0,0.04)] flex flex-col justify-between text-[#1f2a2e] transition-colors min-w-0">
              <div className="min-w-0">
                <div className="flex justify-between items-start gap-2.5 mb-2">
                  <div className="flex items-center gap-2.5 min-w-0">
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
          ))}
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

function SubjectList() {
  const [searchTerm, setSearchTerm] = useState('');
  const subjects = useLiveQuery(() => {
    const search = (searchTerm || '').toLowerCase().trim();
    return db.subjects.filter(s => {
      if (!s) return false;
      if (!search) return true;
      const name = (s.name || '').toLowerCase();
      const code = (s.code || '').toLowerCase();
      return name.includes(search) || code.includes(search);
    }).toArray();
  }, [searchTerm]);
  const classes = useLiveQuery(() => db.classes.toArray());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null);
  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);
  const [isAllClasses, setIsAllClasses] = useState(true);

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
    setIsModalOpen(true);
  };

  const handleSubjectSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const subData = {
      name: formData.get('name') as string,
      code: formData.get('code') as string,
      applicableClasses: isAllClasses ? ['All'] : selectedClasses
    };

    if (editingSubject && editingSubject.id) {
      await subjectsApi.update(editingSubject.id, subData);
    } else {
      await subjectsApi.create(subData);
    }

    setIsModalOpen(false);
    setEditingSubject(null);
    setSelectedClasses([]);
    setIsAllClasses(true);
  };

  return (
    <div className="space-y-3 sm:space-y-4 min-w-0">
      {/* Compact Single-Row Search & Add Toolbar */}
      <div className="flex items-center justify-between gap-2 sm:gap-3 bg-white p-2.5 sm:p-3.5 rounded-2xl border border-[#bac4c6]/70 shadow-[0_4px_16px_rgba(0,0,0,0.04)] print:hidden">
        <div className="relative flex-1 min-w-0 sm:max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6a7f84] pointer-events-none" />
          <input 
            type="text"
            placeholder="Search subjects by name or code..."
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
            setIsModalOpen(true);
            setSelectedClasses([]);
            setIsAllClasses(true);
          }}
          className="shrink-0 h-9 sm:h-10 bg-[#faae57] hover:bg-[#e4ae67] text-[#1f2a2e] px-3 sm:px-4 rounded-xl flex items-center justify-center gap-1.5 font-bold text-xs sm:text-sm transition-all shadow-xs whitespace-nowrap cursor-pointer active:scale-[0.98]"
        >
          <Plus className="w-4 h-4 stroke-[2.5] shrink-0" />
          <span>Add Subject</span>
        </button>
      </div>

      {/* High-Density Subjects List-Card Grid */}
      {subjects && subjects.length === 0 ? (
        <div className="bg-white border border-[#bac4c6]/80 rounded-2xl p-6 sm:p-10 text-center text-[#6a7f84]">
          <div className="w-11 h-11 rounded-2xl bg-[#1c4a59]/10 text-[#1c4a59] flex items-center justify-center mx-auto mb-2.5">
            <Book className="w-5 h-5" />
          </div>
          <p className="font-bold text-[#1f2a2e] text-sm sm:text-base">No subjects found</p>
          <p className="text-xs text-[#6a7f84] mt-0.5">Try adjusting your search or add a new curriculum subject.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-3.5">
          {subjects?.map(sub => (
            <div key={sub.id} className="bg-white p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-[#bac4c6]/80 hover:border-[#1c4a59]/60 shadow-[0_2px_10px_rgba(0,0,0,0.04)] flex flex-col justify-between text-[#1f2a2e] transition-colors min-w-0">
              <div className="flex items-start justify-between gap-2.5 mb-2.5">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 bg-[#1c4a59]/10 border border-[#1c4a59]/20 rounded-xl flex items-center justify-center text-[#1c4a59] shrink-0">
                    <Book className="w-4 h-4 sm:w-5 sm:h-5" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-bold text-[#1f2a2e] text-xs sm:text-sm truncate">{sub.name}</h4>
                    <p className="text-[10px] sm:text-[11px] font-bold text-[#807654] font-mono tabular-nums">{sub.code}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0 print:hidden">
                  <button 
                    type="button"
                    onClick={() => openEditModal(sub)}
                    title="Edit Subject"
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
              
              <div className="pt-2 border-t border-[#bac4c6]/40 flex flex-wrap items-center gap-1">
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
            </div>
          ))}
        </div>
      )}

      {/* Responsive Add/Edit Subject Modal */}
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


