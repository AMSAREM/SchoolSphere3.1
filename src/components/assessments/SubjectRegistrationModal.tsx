import React, { useState, useMemo, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  X,
  BookOpen,
  CheckCircle2,
  Plus,
  Search,
  Check,
  AlertCircle,
  GraduationCap,
  Sparkles,
  Trash2,
  Lightbulb,
  Layers,
  ChevronDown,
  Info
} from 'lucide-react';
import { db, type Student, type Teacher, type Subject } from '../../db/schema';
import { subjectsApi, teachersApi, classesApi } from '../../lib/api';
import { useNotifications } from '../../contexts/NotificationContext';
import { cn } from '../../lib/utils';

export interface SuggestiveSubjectItem {
  name: string;
  code: string;
  category: 'Core' | 'Sciences' | 'Business' | 'TVET & Computing' | 'Languages';
  suggestedClass?: string;
  description?: string;
}

export const SUGGESTIVE_SUBJECTS: SuggestiveSubjectItem[] = [
  // Core
  { name: 'Mathematics', code: 'MATH', category: 'Core', suggestedClass: 'All', description: 'Core Mathematics & Numeracy' },
  { name: 'English Language', code: 'ENG', category: 'Core', suggestedClass: 'All', description: 'Grammar, Comprehension & Composition' },
  { name: 'Integrated Science', code: 'SCI', category: 'Core', suggestedClass: 'All', description: 'General & Natural Science Foundations' },
  { name: 'Social Studies', code: 'SOC', category: 'Core', suggestedClass: 'All', description: 'Citizenship, History, Governance & Environment' },

  // TVET & Computing
  { name: 'Computing / ICT', code: 'ICT', category: 'TVET & Computing', suggestedClass: 'All', description: 'Digital Skills, Coding & Computer Science' },
  { name: 'Creative Arts & Design', code: 'CAD', category: 'TVET & Computing', suggestedClass: 'All', description: 'Visual Arts, Performing Arts & Design' },
  { name: 'Career Technology', code: 'CAR-TECH', category: 'TVET & Computing', suggestedClass: 'JHS 1', description: 'Technical Drawing, Materials & Technology' },
  { name: 'Home Economics', code: 'HEC', category: 'TVET & Computing', suggestedClass: 'JHS 2', description: 'Food & Nutrition, Management & Clothing' },

  // Sciences
  { name: 'Biology', code: 'BIO', category: 'Sciences', suggestedClass: 'SHS 1', description: 'Cell Biology, Genetics, Ecology & Physiology' },
  { name: 'Physics', code: 'PHY', category: 'Sciences', suggestedClass: 'SHS 1', description: 'Mechanics, Electromagnetism & Modern Physics' },
  { name: 'Chemistry', code: 'CHEM', category: 'Sciences', suggestedClass: 'SHS 1', description: 'Organic, Inorganic & Physical Chemistry' },
  { name: 'Elective Mathematics', code: 'E-MATH', category: 'Sciences', suggestedClass: 'SHS 1', description: 'Calculus, Coordinate Geometry & Vectors' },

  // Business & Humanities
  { name: 'Financial Accounting', code: 'ACC', category: 'Business', suggestedClass: 'SHS 1', description: 'Bookkeeping, Ledgers & Financial Reports' },
  { name: 'Business Management', code: 'BMGT', category: 'Business', suggestedClass: 'SHS 1', description: 'Administration, Marketing & Human Resources' },
  { name: 'Economics', code: 'ECON', category: 'Business', suggestedClass: 'SHS 1', description: 'Microeconomics, Macroeconomics & Policy' },
  { name: 'Cost Accounting', code: 'COST-ACC', category: 'Business', suggestedClass: 'SHS 2', description: 'Costing Systems, Budgets & Variance Analysis' },

  // Languages & Humanities
  { name: 'French', code: 'FRE', category: 'Languages', suggestedClass: 'All', description: 'French Grammar, Vocabulary & Oral Expression' },
  { name: 'Ghanaian Language', code: 'GHA-LANG', category: 'Languages', suggestedClass: 'All', description: 'Twi, Fante, Ga, Ewe, Dagbani & Culture' },
  { name: 'Religious & Moral Education (R.M.E)', code: 'RME', category: 'Languages', suggestedClass: 'All', description: 'Ethics, Morality & Religious Studies' },
  { name: 'Literature in English', code: 'LIT', category: 'Languages', suggestedClass: 'SHS 1', description: 'Prose, Drama & Poetry Analysis' },
  { name: 'Government', code: 'GOV', category: 'Languages', suggestedClass: 'SHS 1', description: 'Constitution, Civil Rights & International Org' },
  { name: 'Geography', code: 'GEO', category: 'Sciences', suggestedClass: 'SHS 1', description: 'Physical, Regional & Cartographic Geography' },
  { name: 'History', code: 'HIST', category: 'Languages', suggestedClass: 'All', description: 'National, African & World History' }
];

const DEFAULT_SUBJECT_NAMES = [
  'mathematics',
  'integrated science',
  'english language',
  'social studies',
  'ict',
  'computing / ict',
  'r.m.e',
  'religious & moral education',
  'french',
  'computing',
  'creative arts',
  'creative arts & design',
  'career technology',
  'ghanaian language'
];

export interface SubjectRegistrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: any;
  currentStudent: Student | null;
  currentTeacher: Teacher | null;
  availableSubjectsFromDB: Subject[];
  currentRegisteredSubjects: string[];
  onRegistrationUpdated: (newRegistered: string[], newlyAddedSubject?: string) => void;
}

export function SubjectRegistrationModal({
  isOpen,
  onClose,
  currentUser,
  currentStudent,
  currentTeacher,
  availableSubjectsFromDB,
  currentRegisteredSubjects,
  onRegistrationUpdated
}: SubjectRegistrationModalProps) {
  const { showToast } = useNotifications();

  const [activeTab, setActiveTab] = useState<'register' | 'create_new'>('register');
  const [searchFilter, setSearchFilter] = useState('');
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPurgingDefaults, setIsPurgingDefaults] = useState(false);

  // Connected school classes from database
  const classesFromDB = useLiveQuery(() => db.classes.toArray()) || [];

  // Suggestive subject states
  const [suggestiveCategory, setSuggestiveCategory] = useState<string>('All');
  const [showSuggestionsDropdown, setShowSuggestionsDropdown] = useState(false);

  // New subject form state
  const [newSubjectName, setNewSubjectName] = useState('');
  const [newSubjectCode, setNewSubjectCode] = useState('');
  const [newSubjectClass, setNewSubjectClass] = useState<string>('All');
  const [isCreatingNew, setIsCreatingNew] = useState(false);

  // Sync classes on mount
  useEffect(() => {
    classesApi.getAll().catch(() => {});
  }, []);

  // Filter suggestive subjects by category
  const filteredSuggestiveSubjects = useMemo(() => {
    if (suggestiveCategory === 'All') return SUGGESTIVE_SUBJECTS;
    return SUGGESTIVE_SUBJECTS.filter(item => item.category === suggestiveCategory);
  }, [suggestiveCategory]);

  // Live auto-suggestions matching user typing
  const matchingSuggestiveQuery = useMemo(() => {
    const q = newSubjectName.toLowerCase().trim();
    if (!q) return [];
    return SUGGESTIVE_SUBJECTS.filter(s =>
      s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q)
    ).slice(0, 5);
  }, [newSubjectName]);

  const handleSelectSuggestiveSubject = (item: SuggestiveSubjectItem) => {
    setNewSubjectName(item.name);
    setNewSubjectCode(item.code);
    if (item.suggestedClass) {
      const match = classesFromDB.find(
        c => c.name.toLowerCase().trim() === item.suggestedClass?.toLowerCase().trim()
      );
      if (match) {
        setNewSubjectClass(match.name);
      } else if (item.suggestedClass === 'All') {
        setNewSubjectClass('All');
      }
    }
    setShowSuggestionsDropdown(false);
    showToast(`Applied suggestive subject: ${item.name} (${item.code})`, 'info');
  };

  // Sync selected subjects when modal opens or registered subjects change
  useEffect(() => {
    if (isOpen) {
      setSelectedSubjects(currentRegisteredSubjects || []);
      setSearchFilter('');
      // If no subjects exist in DB at all, default directly to create_new tab
      if (availableSubjectsFromDB.length === 0) {
        setActiveTab('create_new');
      } else {
        setActiveTab('register');
      }
    }
  }, [isOpen, currentRegisteredSubjects, availableSubjectsFromDB.length]);

  // Consolidate complete list of available subjects strictly from database
  // NO hardcoded default subjects
  const allAvailableSubjects = useMemo(() => {
    const list: Array<{ name: string; code: string; applicableClasses: string[]; id?: number }> = [];
    const seen = new Set<string>();

    availableSubjectsFromDB.forEach(s => {
      if (s.name && !seen.has(s.name.toLowerCase().trim())) {
        seen.add(s.name.toLowerCase().trim());
        list.push({
          name: s.name,
          code: s.code || s.name.slice(0, 3).toUpperCase(),
          applicableClasses: s.applicableClasses || ['All'],
          id: s.id
        });
      }
    });

    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [availableSubjectsFromDB]);

  // Check if any legacy default subject names exist in DB
  const hasLegacyDefaultSubjectsInDB = useMemo(() => {
    return availableSubjectsFromDB.some(s =>
      DEFAULT_SUBJECT_NAMES.includes(s.name.toLowerCase().trim())
    );
  }, [availableSubjectsFromDB]);

  // Filtered available subjects based on search
  const filteredSubjects = useMemo(() => {
    if (!searchFilter.trim()) return allAvailableSubjects;
    const q = searchFilter.toLowerCase().trim();
    return allAvailableSubjects.filter(
      s => s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q)
    );
  }, [allAvailableSubjects, searchFilter]);

  if (!isOpen) return null;

  const toggleSubject = (name: string) => {
    setSelectedSubjects(prev =>
      prev.includes(name) ? prev.filter(s => s !== name) : [...prev, name]
    );
  };

  const handleSelectAll = () => {
    const allNames = allAvailableSubjects.map(s => s.name);
    setSelectedSubjects(allNames);
  };

  const handleDeselectAll = () => {
    setSelectedSubjects([]);
  };

  const handleDeleteSubject = async (e: React.MouseEvent, sub: { id?: number; name: string }) => {
    e.stopPropagation();
    if (!window.confirm(`Are you sure you want to remove "${sub.name}" from the curriculum?`)) {
      return;
    }
    try {
      if (sub.id) {
        await subjectsApi.delete(sub.id);
      } else {
        await db.subjects.where('name').equals(sub.name).delete();
      }

      const nextSelected = selectedSubjects.filter(s => s !== sub.name);
      setSelectedSubjects(nextSelected);

      const username = currentUser?.username || currentUser?.id || 'current_user';
      const userKey = `registered_subjects_${username}`;
      const existingSetting = await db.settings.where('key').equals(userKey).first();
      if (existingSetting?.id) {
        await db.settings.update(existingSetting.id, { value: nextSelected });
      }
      if (currentStudent?.id) {
        await db.students.update(currentStudent.id, { registeredSubjects: nextSelected } as any);
      }

      showToast(`Subject "${sub.name}" deleted successfully.`, 'success');
      onRegistrationUpdated(nextSelected);
    } catch (err) {
      console.error('Failed to delete subject:', err);
      showToast('Could not delete subject.', 'error');
    }
  };

  const handlePurgeAllDefaultSubjects = async () => {
    setIsPurgingDefaults(true);
    try {
      const toDelete = availableSubjectsFromDB.filter(s =>
        DEFAULT_SUBJECT_NAMES.includes(s.name.toLowerCase().trim())
      );
      for (const sub of toDelete) {
        if (sub.id) {
          await subjectsApi.delete(sub.id);
        } else {
          await db.subjects.where('name').equals(sub.name).delete();
        }
      }

      const nextSelected = selectedSubjects.filter(
        name => !DEFAULT_SUBJECT_NAMES.includes(name.toLowerCase().trim())
      );
      setSelectedSubjects(nextSelected);

      const username = currentUser?.username || currentUser?.id || 'current_user';
      const userKey = `registered_subjects_${username}`;
      const existingSetting = await db.settings.where('key').equals(userKey).first();
      if (existingSetting?.id) {
        await db.settings.update(existingSetting.id, { value: nextSelected });
      }
      if (currentStudent?.id) {
        await db.students.update(currentStudent.id, { registeredSubjects: nextSelected } as any);
      }

      showToast(`Removed ${toDelete.length} default subjects from database.`, 'success');
      onRegistrationUpdated(nextSelected);
    } catch (err) {
      console.error('Failed to purge default subjects:', err);
      showToast('Could not purge default subjects.', 'error');
    } finally {
      setIsPurgingDefaults(false);
    }
  };

  const handleSaveRegistration = async () => {
    setIsSubmitting(true);
    try {
      const username = currentUser?.username || currentUser?.id || 'current_user';
      const userKey = `registered_subjects_${username}`;

      // 1. Save in settings for current user profile
      const existingSetting = await db.settings.where('key').equals(userKey).first();
      if (existingSetting && existingSetting.id) {
        await db.settings.update(existingSetting.id, {
          value: selectedSubjects
        });
      } else {
        await db.settings.add({
          key: userKey,
          value: selectedSubjects
        } as any);
      }

      // 2. If student record is identified, update the student record in db.students
      if (currentStudent && currentStudent.id) {
        await db.students.update(currentStudent.id, {
          registeredSubjects: selectedSubjects
        } as any);
      }

      // 3. If teacher record is identified, update teacher subjects
      if (currentTeacher && currentTeacher.id) {
        await teachersApi.update(currentTeacher.id, {
          ...currentTeacher,
          subjects: selectedSubjects
        });
      }

      showToast(`Subject registration saved (${selectedSubjects.length} subjects registered).`, 'success');
      onRegistrationUpdated(selectedSubjects);
      onClose();
    } catch (err) {
      console.error('Failed to save subject registration:', err);
      showToast('Could not save subject registration.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateAndRegisterNewSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = newSubjectName.trim();
    if (!cleanName) {
      showToast('Please enter a subject name.', 'warning');
      return;
    }

    const cleanCode = (newSubjectCode.trim() || cleanName.slice(0, 3)).toUpperCase();

    setIsCreatingNew(true);
    try {
      // 1. Register in school curriculum
      await subjectsApi.create(
        {
          name: cleanName,
          code: cleanCode,
          applicableClasses: newSubjectClass === 'All' ? ['All'] : [newSubjectClass]
        },
        currentUser?.schoolId
      );

      // 2. Add to selected registered subjects
      const updatedList = Array.from(new Set([...selectedSubjects, cleanName]));
      setSelectedSubjects(updatedList);

      // 3. Save directly
      const username = currentUser?.username || currentUser?.id || 'current_user';
      const userKey = `registered_subjects_${username}`;
      const existingSetting = await db.settings.where('key').equals(userKey).first();
      if (existingSetting && existingSetting.id) {
        await db.settings.update(existingSetting.id, { value: updatedList });
      } else {
        await db.settings.add({ key: userKey, value: updatedList } as any);
      }

      if (currentStudent && currentStudent.id) {
        await db.students.update(currentStudent.id, { registeredSubjects: updatedList } as any);
      }

      showToast(`"${cleanName}" registered and added to your subjects!`, 'success');
      setNewSubjectName('');
      setNewSubjectCode('');
      setActiveTab('register');
      onRegistrationUpdated(updatedList, cleanName);
    } catch (err) {
      console.error('Failed to create subject:', err);
      showToast('Failed to create new subject. Please try again.', 'error');
    } finally {
      setIsCreatingNew(false);
    }
  };

  const isStudent = currentUser?.role === 'student';
  const roleLabel = isStudent
    ? 'Student'
    : currentUser?.role === 'teacher'
    ? 'Teacher'
    : 'Academic Staff';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-[calc(100vw-2rem)] sm:max-w-2xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shadow-xs">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-slate-900">
                  Subject Registration & Enrollment
                </h2>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                  {roleLabel}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Register directly for available school subjects. No default or sample subjects.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* User Context Banner */}
        <div className="bg-emerald-50/60 px-4 sm:px-5 py-2.5 border-b border-emerald-100/80 flex items-center justify-between flex-wrap gap-2 text-xs">
          <div className="flex items-center gap-2 text-emerald-900">
            <GraduationCap className="w-4 h-4 text-emerald-700 shrink-0" />
            <span className="font-medium">
              Enrolling for:{' '}
              <strong className="font-bold">
                {currentUser?.fullName || currentUser?.username || 'User'}
              </strong>
              {currentStudent?.class && (
                <span className="ml-1 text-emerald-700 font-semibold">
                  ({currentStudent.class})
                </span>
              )}
            </span>
          </div>
          <div className="flex items-center gap-1.5 font-medium text-emerald-800 text-[11px]">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>
              {selectedSubjects.length} of {allAvailableSubjects.length} subjects registered
            </span>
          </div>
        </div>

        {/* Legacy Default Subjects Cleaner Alert */}
        {hasLegacyDefaultSubjectsInDB && (
          <div className="bg-amber-50 px-4 sm:px-5 py-2 border-b border-amber-200/80 flex items-center justify-between gap-2 text-xs text-amber-900">
            <span className="truncate">
              Default sample subjects detected in database.
            </span>
            <button
              type="button"
              onClick={handlePurgeAllDefaultSubjects}
              disabled={isPurgingDefaults}
              className="px-2.5 py-1 text-[11px] font-bold text-amber-900 bg-amber-200/80 hover:bg-amber-300 rounded-lg transition-colors cursor-pointer shrink-0 disabled:opacity-50"
            >
              {isPurgingDefaults ? 'Purging...' : 'Purge Default Subjects'}
            </button>
          </div>
        )}

        {/* Tab Switcher */}
        <div className="flex border-b border-slate-200 bg-slate-50 px-4 sm:px-5 gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('register')}
            className={cn(
              'py-2.5 px-3 text-xs font-bold border-b-2 transition-colors cursor-pointer flex items-center gap-1.5',
              activeTab === 'register'
                ? 'border-emerald-600 text-emerald-700 bg-white rounded-t-lg'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            )}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Available Subjects ({allAvailableSubjects.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('create_new')}
            className={cn(
              'py-2.5 px-3 text-xs font-bold border-b-2 transition-colors cursor-pointer flex items-center gap-1.5',
              activeTab === 'create_new'
                ? 'border-emerald-600 text-emerald-700 bg-white rounded-t-lg'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            )}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Register New Subject</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-5 flex-1 overflow-y-auto min-h-[300px]">
          {activeTab === 'register' ? (
            <div className="space-y-3.5">
              {allAvailableSubjects.length > 0 ? (
                <>
                  {/* Quick actions & Search */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
                    <div className="relative flex-1">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                      <input
                        type="text"
                        value={searchFilter}
                        onChange={e => setSearchFilter(e.target.value)}
                        placeholder="Search available subjects..."
                        className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      />
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={handleSelectAll}
                        className="px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                      >
                        Select All
                      </button>
                      <button
                        type="button"
                        onClick={handleDeselectAll}
                        className="px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
                      >
                        Clear All
                      </button>
                    </div>
                  </div>

                  {/* Subjects List */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[360px] overflow-y-auto pr-1">
                    {filteredSubjects.map(sub => {
                      const isChecked = selectedSubjects.includes(sub.name);
                      return (
                        <div
                          key={sub.name}
                          onClick={() => toggleSubject(sub.name)}
                          className={cn(
                            'flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer select-none text-left group',
                            isChecked
                              ? 'border-emerald-500 bg-emerald-50/50 shadow-xs'
                              : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                          )}
                        >
                          <div className="flex items-center gap-3 min-w-0 pr-2">
                            <div
                              className={cn(
                                'w-5 h-5 rounded-md flex items-center justify-center shrink-0 border transition-all',
                                isChecked
                                  ? 'bg-emerald-600 border-emerald-600 text-white'
                                  : 'border-slate-300 bg-white'
                              )}
                            >
                              {isChecked && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-slate-900 truncate">
                                {sub.name}
                              </p>
                              <p className="text-[10px] text-slate-500 font-mono">
                                Code: {sub.code}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <span
                              className={cn(
                                'text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 uppercase tracking-wider',
                                isChecked
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-slate-100 text-slate-500'
                              )}
                            >
                              {isChecked ? 'Registered' : 'Available'}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => handleDeleteSubject(e, sub)}
                              title={`Delete ${sub.name}`}
                              className="p-1 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}

                    {filteredSubjects.length === 0 && searchFilter && (
                      <div className="col-span-full py-8 text-center text-slate-400">
                        <AlertCircle className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                        <p className="text-xs font-medium">
                          No subjects matching &ldquo;{searchFilter}&rdquo;.
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setNewSubjectName(searchFilter);
                            setActiveTab('create_new');
                          }}
                          className="mt-2 text-xs text-emerald-600 font-bold hover:underline"
                        >
                          + Register &ldquo;{searchFilter}&rdquo; as a new subject
                        </button>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                /* Zero Available Subjects State */
                <div className="py-12 text-center text-slate-500">
                  <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
                    <BookOpen className="w-6 h-6" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-800 mb-1">
                    No Subjects in Curriculum Yet
                  </h3>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto mb-4">
                    Default demo subjects have been removed. Register your school's actual academic subjects below.
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveTab('create_new')}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Register New Subject Now</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* Create and Register New Subject Form */
            <form onSubmit={handleCreateAndRegisterNewSubject} className="space-y-4">
              {/* Suggestive Subjects & Registration Info Banner */}
              <div className="bg-emerald-50/70 border border-emerald-200/80 p-3 rounded-xl text-xs text-emerald-800 space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Lightbulb className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span className="font-bold text-slate-800">Suggestive Curriculum Subjects:</span>
                  </div>
                  <span className="text-[10px] text-emerald-700 font-semibold bg-emerald-100/70 px-2 py-0.5 rounded-full">
                    Click to auto-fill name & code
                  </span>
                </div>

                {/* Category Filter Pills */}
                <div className="flex items-center gap-1 overflow-x-auto pb-0.5 text-[10px]">
                  {['All', 'Core', 'Sciences', 'Business', 'TVET & Computing', 'Languages'].map(cat => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setSuggestiveCategory(cat)}
                      className={cn(
                        "px-2 py-0.5 rounded-md font-bold transition-all border shrink-0 cursor-pointer",
                        suggestiveCategory === cat
                          ? "bg-emerald-700 text-white border-emerald-700 shadow-2xs"
                          : "bg-white text-slate-600 border-emerald-200 hover:bg-emerald-100/50"
                      )}
                    >
                      {cat}
                    </button>
                  ))}
                </div>

                {/* Suggestive Subject Chips */}
                <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-1 bg-white/70 rounded-lg border border-emerald-200/60">
                  {filteredSuggestiveSubjects.map(item => {
                    const isSelected = newSubjectName.toLowerCase().trim() === item.name.toLowerCase().trim();
                    return (
                      <button
                        key={item.name}
                        type="button"
                        onClick={() => handleSelectSuggestiveSubject(item)}
                        className={cn(
                          "px-2 py-1 rounded-md text-[11px] font-bold transition-all border flex items-center gap-1 cursor-pointer",
                          isSelected
                            ? "bg-emerald-600 text-white border-emerald-600 shadow-2xs"
                            : "bg-white text-slate-700 border-slate-200 hover:border-emerald-500 hover:bg-emerald-50"
                        )}
                        title={`${item.description || item.name} (${item.code}) - Typical class: ${item.suggestedClass || 'All'}`}
                      >
                        {isSelected ? <Check className="w-3 h-3 text-white" /> : <Plus className="w-3 h-3 text-emerald-600" />}
                        <span>{item.name}</span>
                        <span className={cn("text-[9px] font-mono px-1 py-0.2 rounded", isSelected ? "bg-white/25 text-white" : "bg-slate-100 text-slate-500")}>
                          {item.code}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Subject Name Input with Live Suggestions */}
              <div className="relative">
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-slate-700">
                    Subject Name *
                  </label>
                  {newSubjectName && (
                    <span className="text-[10px] text-slate-400 font-mono">
                      Code preview: <span className="font-bold text-emerald-700">{newSubjectCode || newSubjectName.slice(0, 3).toUpperCase()}</span>
                    </span>
                  )}
                </div>
                <input
                  type="text"
                  required
                  placeholder="e.g. Physics, Biology, Accounting, Visual Art, Integrated Science"
                  value={newSubjectName}
                  onChange={e => {
                    setNewSubjectName(e.target.value);
                    if (!newSubjectCode) {
                      setNewSubjectCode(e.target.value.slice(0, 3).toUpperCase());
                    }
                  }}
                  onFocus={() => setShowSuggestionsDropdown(true)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 font-medium"
                />

                {/* Auto-suggest dropdown when typing */}
                {showSuggestionsDropdown && matchingSuggestiveQuery.length > 0 && (
                  <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg p-1.5 space-y-1">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 py-0.5 flex items-center justify-between">
                      <span>Suggestive Matches ({matchingSuggestiveQuery.length})</span>
                      <button
                        type="button"
                        onClick={() => setShowSuggestionsDropdown(false)}
                        className="text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        Close
                      </button>
                    </div>
                    {matchingSuggestiveQuery.map(s => (
                      <button
                        key={s.name}
                        type="button"
                        onClick={() => handleSelectSuggestiveSubject(s)}
                        className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-emerald-50 text-xs flex items-center justify-between group cursor-pointer transition-colors"
                      >
                        <div className="flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                          <span className="font-bold text-slate-800 group-hover:text-emerald-800">{s.name}</span>
                          <span className="text-[10px] text-slate-400 font-mono bg-slate-100 px-1 py-0.2 rounded">
                            {s.code}
                          </span>
                        </div>
                        <span className="text-[10px] text-emerald-600 font-medium">{s.category}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Subject Code and Connected Class Scope */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Subject Code
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. PHY, BIO, ACC"
                    value={newSubjectCode}
                    onChange={e => setNewSubjectCode(e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 uppercase font-mono"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-slate-700">
                      Applicable Class Scope
                    </label>
                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 rounded-md">
                      {classesFromDB.length > 0 ? `${classesFromDB.length} Classes Connected` : 'Connected Classes'}
                    </span>
                  </div>
                  <select
                    value={newSubjectClass}
                    onChange={e => setNewSubjectClass(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 font-medium"
                  >
                    <option value="All">🌐 All Classes (School-wide)</option>
                    {classesFromDB.length > 0 ? (
                      <optgroup label={`Connected School Classes (${classesFromDB.length})`}>
                        {classesFromDB.map(cls => (
                          <option key={cls.id || cls.name} value={cls.name}>
                            {cls.name} {cls.level ? `(${cls.level})` : ''}
                          </option>
                        ))}
                      </optgroup>
                    ) : (
                      <optgroup label="Standard School Classes">
                        <option value="Basic 6">Basic 6</option>
                        <option value="JHS 1">JHS 1</option>
                        <option value="JHS 2">JHS 2</option>
                        <option value="JHS 3">JHS 3</option>
                        <option value="SHS 1">SHS 1</option>
                        <option value="SHS 2">SHS 2</option>
                        <option value="SHS 3">SHS 3</option>
                      </optgroup>
                    )}
                  </select>

                  {/* Quick Connected Class Badges */}
                  {classesFromDB.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1 mt-1.5 max-h-16 overflow-y-auto">
                      <span className="text-[9px] text-slate-400 font-semibold">Quick select:</span>
                      <button
                        type="button"
                        onClick={() => setNewSubjectClass('All')}
                        className={cn(
                          "text-[9px] px-1.5 py-0.5 rounded font-bold transition-all border cursor-pointer",
                          newSubjectClass === 'All'
                            ? "bg-emerald-600 text-white border-emerald-600"
                            : "bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200"
                        )}
                      >
                        All
                      </button>
                      {classesFromDB.slice(0, 8).map(c => (
                        <button
                          key={c.id || c.name}
                          type="button"
                          onClick={() => setNewSubjectClass(c.name)}
                          className={cn(
                            "text-[9px] px-1.5 py-0.5 rounded font-bold transition-all border cursor-pointer",
                            newSubjectClass === c.name
                              ? "bg-emerald-600 text-white border-emerald-600"
                              : "bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200"
                          )}
                        >
                          {c.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <button
                type="submit"
                disabled={isCreatingNew || !newSubjectName.trim()}
                className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isCreatingNew ? (
                  <span>Registering Subject...</span>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    <span>Register New Subject & Auto-Enroll</span>
                  </>
                )}
              </button>
            </form>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-3">
          <div className="text-xs text-slate-500">
            <span className="font-bold text-slate-700">{selectedSubjects.length}</span>{' '}
            subject{selectedSubjects.length === 1 ? '' : 's'} registered
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveRegistration}
              disabled={isSubmitting}
              className="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? (
                <span>Saving...</span>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Confirm Registration</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
