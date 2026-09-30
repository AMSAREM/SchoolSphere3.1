import { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Student, useFeeTypes, type PromotionRecord, type ClassHistoryRecord, normalizeStudentRecord, getStudentFullName, autoRepairStudentsInDb } from '../db/schema';
import { Plus, Search, Filter, Download, MoreVertical, Edit2, Trash2, Users, FileSpreadsheet, Camera, User, Printer, Eye, CreditCard, TrendingUp, ArrowRight, Check, History, Undo2, AlertTriangle, ShieldCheck, ShieldAlert, CheckSquare, Square, X, Calendar, GraduationCap, BookOpen, Award, RefreshCw, UploadCloud, Database } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { formatCurrency, cn, triggerPrint, exportToPDF } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import { useNotifications } from '../contexts/NotificationContext';
import { studentsApi, promotionsApi, feesApi } from '../lib/api';
import { getCurrentSchoolId } from '../lib/supabase';
import { calculateFileHash, calculateContentFingerprint, checkIsFileDuplicate, recordImportedFile, filterDuplicateStudentRows, validateCsvFile } from '../lib/fileSecurity';
import { checkRateLimit, useDebounce } from '../lib/rateLimit';
import * as XLSX from 'xlsx';
import React from 'react';

export default function StudentManagement() {
  const { user: currentUser, school: activeSchool } = useAuth();
  const { showToast, confirm } = useNotifications();
  const feeTypes = useFeeTypes();
  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'super_admin' || currentUser?.role === 'headteacher';
  const isTeacher = currentUser?.role === 'teacher';
  const isAccountant = currentUser?.role === 'accountant';

  const classes = useLiveQuery(() => db.classes.toArray());
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  // Multi-Selection and Bulk Deletion States
  const [selectedStudentIds, setSelectedStudentIds] = useState<number[]>([]);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  // Backend Sync / Migration States (Option C & Option B)
  const [isBackendSyncing, setIsBackendSyncing] = useState(false);
  const [isBackendPushing, setIsBackendPushing] = useState(false);
  const [lastSyncStatus, setLastSyncStatus] = useState<string | null>(null);

  const [selectedProfileStudent, setSelectedProfileStudent] = useState<Student | null>(null);
  const [profileModalTab, setProfileModalTab] = useState<'details' | 'progression' | 'results'>('details');
  const [selectedPaymentStudent, setSelectedPaymentStudent] = useState<Student | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [lastPayment, setLastPayment] = useState<{ amount: number, date: number } | null>(null);

  // Student Promotion States
  const [isPromotionModalOpen, setIsPromotionModalOpen] = useState(false);
  const [promoSourceClass, setPromoSourceClass] = useState<string>('');
  const [promoDestClass, setPromoDestClass] = useState<string>('');
  const [promoSelectedStudentIds, setPromoSelectedStudentIds] = useState<number[]>([]);
  const [promoResetFees, setPromoResetFees] = useState(false);
  const [promoApplyNewDefaults, setPromoApplyNewDefaults] = useState(true);
  const [promoRolloverYear, setPromoRolloverYear] = useState(false);
  const [promoNextYearVal, setPromoNextYearVal] = useState('');

  // Promotion Tab and Audits States
  const [activeTab, setActiveTab] = useState<'registry' | 'promotions'>('registry');
  const [promoSearchTerm, setPromoSearchTerm] = useState('');
  const [promoYearFilter, setPromoYearFilter] = useState('');

  // Debounced input search terms to rate-limit intensive rendering/re-filtering
  const debouncedSearchTerm = useDebounce(searchTerm, 200);
  const debouncedPromoSearch = useDebounce(promoSearchTerm, 200);

  // Option C: Backend-First Sync
  const refreshFromBackend = async (showFeedback = true) => {
    setIsBackendSyncing(true);
    try {
      const targetSchoolId = activeSchool?.id || currentUser?.schoolId;
      const remoteStudents = await studentsApi.getAll(targetSchoolId, true);
      if (showFeedback) {
        showToast(`Backend sync complete: ${remoteStudents?.length || 0} student records verified from server database.`, "success");
      }
      setLastSyncStatus(`Synced (${remoteStudents?.length || 0} students)`);
    } catch (err: any) {
      console.warn("Backend student fetch notice:", err);
      if (showFeedback) {
        showToast("Backend fetch notice: local records active.", "info");
      }
    } finally {
      setIsBackendSyncing(false);
    }
  };

  // Option B: Push All Local Records to Backend
  const pushAllLocalToBackend = async () => {
    setIsBackendPushing(true);
    try {
      const targetSchoolId = activeSchool?.id || currentUser?.schoolId;
      await studentsApi.syncLocalToRemote(targetSchoolId);
      showToast("All student & school records successfully pushed to backend database!", "success");
      await refreshFromBackend(false);
    } catch (err: any) {
      console.error("Database push error:", err);
      showToast(err?.message || "Failed to push local records to database.", "error");
    } finally {
      setIsBackendPushing(false);
    }
  };

  React.useEffect(() => {
    autoRepairStudentsInDb().then(() => {
      refreshFromBackend(false);
    });
  }, [activeSchool?.id, currentUser?.schoolId]);

  const handleQuickPayment = async (e: React.FormEvent) => {
    e.preventDefault();

    // Input Rate Limit: Max 3 payment submissions per 3 seconds
    const limitCheck = checkRateLimit('quick_payment_submit', 3, 3000);
    if (!limitCheck.allowed) {
      showToast(`Rate limit reached. Please wait ${limitCheck.retryAfterSeconds}s before submitting another payment.`, "error");
      return;
    }

    const amount = Number(paymentAmount);
    if (isNaN(amount) || amount <= 0 || !selectedPaymentStudent || !selectedPaymentStudent.id) return;
    
    const targetSchoolId = activeSchool?.id || currentUser?.schoolId;

    try {
      const result = await feesApi.recordPayment({
        studentId: selectedPaymentStudent.id,
        studentCode: selectedPaymentStudent.studentId,
        studentName: `${selectedPaymentStudent.firstName} ${selectedPaymentStudent.lastName}`.trim(),
        amount,
        paymentMethod: 'Cash',
        receivedBy: currentUser?.fullName || currentUser?.email || 'Bursar',
        description: `Quick Fee Payment for ${selectedPaymentStudent.firstName} ${selectedPaymentStudent.lastName}`,
      }, targetSchoolId);
      
      setLastPayment({ amount, date: Date.now() });
      setPaymentAmount('');
      setSelectedPaymentStudent(null);
      setIsReceiptModalOpen(true);
      if (result.queuedOffline) {
        showToast(`Payment of GHS ${amount.toLocaleString()} recorded locally and queued for Supabase sync.`, "info");
      } else {
        showToast(`Payment of GHS ${amount.toLocaleString()} processed and synced to Supabase database!`, "success");
      }
    } catch (err: any) {
      console.error("Payment submission error:", err);
      showToast(err?.message || "Failed to record payment in database.", "error");
    }
  };
  
  const rawStudents = useLiveQuery(() => db.students.toArray());
  const allStudents = React.useMemo(() => {
    return (rawStudents || []).map(s => normalizeStudentRecord(s));
  }, [rawStudents]);

  const profileStudentResults = useLiveQuery(
    () => selectedProfileStudent ? db.results.where('studentId').equals(selectedProfileStudent.studentId).toArray() : Promise.resolve([]),
    [selectedProfileStudent?.studentId]
  ) || [];

  const profileStudentPromotions = useLiveQuery(
    async () => {
      if (!selectedProfileStudent) return [];
      try {
        const hasIdx = db.promotionHistory?.schema?.indexes?.some(idx => idx.name === 'studentIdentifier');
        if (hasIdx) {
          return await db.promotionHistory.where('studentIdentifier').equals(selectedProfileStudent.studentId).toArray();
        }
        const all = await db.promotionHistory.toArray();
        return all.filter(r => r.studentIdentifier === selectedProfileStudent.studentId || (selectedProfileStudent.id && r.studentId === selectedProfileStudent.id));
      } catch {
        const all = await db.promotionHistory.toArray();
        return all.filter(r => r.studentIdentifier === selectedProfileStudent.studentId || (selectedProfileStudent.id && r.studentId === selectedProfileStudent.id));
      }
    },
    [selectedProfileStudent?.studentId, selectedProfileStudent?.id]
  ) || [];

  const promoSourceStudents = React.useMemo(() => {
    if (!allStudents || !promoSourceClass) return [];
    return allStudents.filter(s => s.class === promoSourceClass);
  }, [allStudents, promoSourceClass]);

  React.useEffect(() => {
    if (promoSourceStudents.length > 0) {
      const ids = promoSourceStudents.map(s => s.id).filter((id): id is number => id !== undefined);
      setPromoSelectedStudentIds(prev => {
        if (prev.length === ids.length && prev.every((v, i) => v === ids[i])) {
          return prev;
        }
        return ids;
      });
    } else {
      setPromoSelectedStudentIds(prev => {
        if (prev.length === 0) return prev;
        return [];
      });
    }
  }, [promoSourceStudents]);

  const settings = useLiveQuery(() => db.settings.toArray()) || [];
  const schoolName = settings.find(s => s.key === 'schoolProfile')?.value?.schoolName || 'SCHOOLSPHERE PORTAL';
  const academicConfig = settings.find(s => s.key === 'academicConfig')?.value || { academicYear: '2025/2026', currentTerm: 'Term 1' };

  React.useEffect(() => {
    if (isPromotionModalOpen && settings.length > 0) {
      const config = settings.find(s => s.key === 'academicConfig')?.value || { academicYear: '2025/2026', currentTerm: 'Term 1' };
      const currentYear = config.academicYear || '2025/2026';
      
      const match = currentYear.match(/^(\d{4})\/(\d{4})$/);
      if (match) {
        setPromoNextYearVal(`${parseInt(match[1]) + 1}/${parseInt(match[2]) + 1}`);
      } else {
        const matchSingle = currentYear.match(/^(\d{4})$/);
        if (matchSingle) {
          setPromoNextYearVal(String(parseInt(matchSingle[1]) + 1));
        } else {
          setPromoNextYearVal(currentYear);
        }
      }
      setPromoRolloverYear(config.currentTerm === 'Term 3');
    }
  }, [isPromotionModalOpen, settings]);

  const handlePromotionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Input Rate Limit: Max 2 promotion operations per 5 seconds
    const limitCheck = checkRateLimit('promotion_submit', 2, 5000);
    if (!limitCheck.allowed) {
      showToast(`Please wait ${limitCheck.retryAfterSeconds}s before initiating another promotion batch.`, "error");
      return;
    }

    if (!promoSourceClass || !promoDestClass) {
      showToast("Please select both source and destination classes.", "error");
      return;
    }
    if (promoSourceClass === promoDestClass) {
      showToast("Source and destination classes cannot be the same.", "error");
      return;
    }
    if (promoSelectedStudentIds.length === 0) {
      showToast("Please select at least one student to promote.", "error");
      return;
    }

    try {
      let count = 0;
      const targetSchoolId = activeSchool?.id || currentUser?.schoolId;

      for (const studentId of promoSelectedStudentIds) {
        const student = allStudents?.find(s => s.id === studentId);
        if (!student) continue;

        // Preserve previous class history entry so historical data is NEVER deleted
        const previousHistory = student.classHistory || [];
        const historyEntry: ClassHistoryRecord = {
          academicYear: academicConfig.academicYear || '2025/2026',
          term: academicConfig.currentTerm || 'Term 3',
          class: student.class,
          totalFees: student.totalFees || 0,
          feesPaid: student.feesPaid || 0,
          feeBreakdown: student.feeBreakdown,
          feePaidBreakdown: student.feePaidBreakdown,
          promotedAt: Date.now()
        };

        const updateData: Partial<Student> = {
          class: promoDestClass,
          classHistory: [...previousHistory, historyEntry],
          previousClasses: Array.from(new Set([...(student.previousClasses || []), student.class]))
        };

        if (promoResetFees) {
          updateData.feesPaid = 0;
          const resetPaidBreakdown: Record<string, number> = {};
          feeTypes.forEach(ft => {
            resetPaidBreakdown[ft.id] = 0;
          });
          updateData.feePaidBreakdown = resetPaidBreakdown;
        }

        if (promoApplyNewDefaults) {
          const initialBreakdown: Record<string, number> = {};
          feeTypes.forEach(ft => {
            initialBreakdown[ft.id] = ft.defaultAmount;
          });
          updateData.feeBreakdown = initialBreakdown;
          updateData.totalFees = Object.values(initialBreakdown).reduce((a, b) => a + b, 0);
        }

        // Record the promotion history in both Dexie & Supabase for audit and complete reversibility
        await promotionsApi.recordPromotion({
          studentId: studentId,
          studentIdentifier: student.studentId,
          studentName: `${student.firstName} ${student.lastName}`,
          sourceClass: student.class,
          destClass: promoDestClass,
          academicYear: academicConfig.academicYear || '2025/2026',
          term: academicConfig.currentTerm || 'Term 3',
          timestamp: Date.now(),
          previousFeesPaid: student.feesPaid || 0,
          previousTotalFees: student.totalFees || 0,
          previousFeeBreakdown: student.feeBreakdown,
          previousFeePaidBreakdown: student.feePaidBreakdown
        }, targetSchoolId);

        await studentsApi.update(studentId, updateData, targetSchoolId);
        count++;
      }

      if (promoRolloverYear && promoNextYearVal) {
        const config = settings.find(s => s.key === 'academicConfig')?.value || { academicYear: '2025/2026', currentTerm: 'Term 1' };
        await db.settings.put({
          key: 'academicConfig',
          value: {
            ...config,
            academicYear: promoNextYearVal,
            currentTerm: 'Term 1'
          }
        });
        showToast(`School academic year rolled over to ${promoNextYearVal} (Term 1)`, "info");
      }

      showToast(`Successfully moved ${count} students to ${promoDestClass}! All previous class records and exam results are safely preserved.`, "success");
      setIsPromotionModalOpen(false);
      setPromoSourceClass('');
      setPromoDestClass('');
      setPromoSelectedStudentIds([]);
    } catch (err) {
      showToast("Failed to promote students.", "error");
      console.error(err);
    }
  };

  const promotionHistory = useLiveQuery(() => db.promotionHistory.toArray()) || [];

  const handleRevertPromotion = async (record: PromotionRecord) => {
    if (!record.id) return;
    const targetSchoolId = activeSchool?.id || currentUser?.schoolId;
    
    confirm({
      title: "Revert Student Promotion",
      message: `Are you sure you want to revert the promotion of ${record.studentName}? This will move them back to "${record.sourceClass}" and restore their previous fee status of ${formatCurrency(record.previousFeesPaid)} paid out of ${formatCurrency(record.previousTotalFees)}.`,
      confirmLabel: "Revert Promotion",
      onConfirm: async () => {
        try {
          const student = await db.students.get(record.studentId);
          if (!student) {
            showToast("Student not found. They may have been deleted.", "error");
            return;
          }

          // Remove the specific entry from classHistory
          const updatedHistory = (student.classHistory || []).filter(
            h => !(h.class === record.sourceClass && h.academicYear === record.academicYear)
          );

          // Fully restore the student parameters
          await studentsApi.update(record.studentId, {
            class: record.sourceClass,
            feesPaid: record.previousFeesPaid,
            totalFees: record.previousTotalFees,
            feeBreakdown: record.previousFeeBreakdown,
            feePaidBreakdown: record.previousFeePaidBreakdown,
            classHistory: updatedHistory
          }, targetSchoolId);

          // Delete the log entry from Dexie and Supabase
          await promotionsApi.revertPromotion(record.id!, targetSchoolId);
          showToast(`Successfully reverted promotion for ${record.studentName}!`, "success");
        } catch (err) {
          console.error(err);
          showToast("Failed to revert promotion.", "error");
        }
      }
    });
  };

  const filteredStudents = React.useMemo(() => {
    if (!allStudents) return [];
    const search = (debouncedSearchTerm || '').toLowerCase().trim();
    return allStudents.filter(s => {
      if (!s) return false;
      const firstName = (s.firstName || '').toLowerCase();
      const lastName = (s.lastName || '').toLowerCase();
      const studentId = (s.studentId || '').toLowerCase();
      
      const matchesSearch = !search ||
        firstName.includes(search) ||
        lastName.includes(search) ||
        studentId.includes(search) ||
        `${firstName} ${lastName}`.includes(search);
      
      const matchesFilter = !activeFilter || s.class === activeFilter;
      
      return matchesSearch && matchesFilter;
    });
  }, [allStudents, debouncedSearchTerm, activeFilter]);

  const filteredPromoHistory = React.useMemo(() => {
    if (!promotionHistory) return [];
    const search = (debouncedPromoSearch || '').toLowerCase().trim();
    return promotionHistory.filter(record => {
      if (!record) return false;
      const studentName = (record.studentName || '').toLowerCase();
      const studentIdentifier = (record.studentIdentifier || '').toLowerCase();
      const sourceClass = (record.sourceClass || '').toLowerCase();
      const destClass = (record.destClass || '').toLowerCase();

      const matchesSearch = !search ||
        studentName.includes(search) ||
        studentIdentifier.includes(search) ||
        sourceClass.includes(search) ||
        destClass.includes(search);
      
      const matchesYear = promoYearFilter ? record.academicYear === promoYearFilter : true;
      return matchesSearch && matchesYear;
    }).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)); // Sort by newest transition first
  }, [promotionHistory, debouncedPromoSearch, promoYearFilter]);

  const uniquePromoYears = React.useMemo(() => {
    if (!promotionHistory) return [];
    const years = promotionHistory.map(r => r.academicYear).filter(Boolean);
    return Array.from(new Set(years));
  }, [promotionHistory]);

  const exportToExcel = () => {
    const dataToExport = filteredStudents && filteredStudents.length > 0 ? filteredStudents : (allStudents || []);
    if (dataToExport.length === 0) {
      showToast("No student records available to export.", "info");
      return;
    }
    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Students");
    const filename = `Student_List_${activeFilter ? activeFilter.replace(/\s+/g, '_') : 'All'}_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, filename);
    showToast(`Successfully exported ${dataToExport.length} student record(s) to Excel!`, "success");
  };

  const downloadTemplate = () => {
    const templateData = [
      {
        firstName: 'Kojo',
        lastName: 'Mensah',
        class: 'P1',
        dateOfBirth: '2016-05-15',
        gender: 'Male',
        guardianName: 'Ama Mensah',
        guardianPhone: '0240000000',
        totalFees: 1200
      },
      {
        firstName: 'Akosua',
        lastName: 'Adu',
        class: 'JHS 1',
        dateOfBirth: '2012-08-20',
        gender: 'Female',
        guardianName: 'Kofi Adu',
        guardianPhone: '0270000000',
        totalFees: 2500
      }
    ];

    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Student_Template");
    XLSX.writeFile(wb, "Student_Import_Template.csv", { bookType: "csv" });
  };

  const parseExcelDate = (val: any): string => {
    if (!val) return '2015-01-01';
    if (typeof val === 'number') {
      try {
        const utc_days = Math.floor(val - 25569);
        const utc_value = utc_days * 86400;
        const date_info = new Date(utc_value * 1000);
        if (!isNaN(date_info.getTime())) {
          return date_info.toISOString().split('T')[0];
        }
      } catch (e) {}
    }
    if (val instanceof Date && !isNaN(val.getTime())) {
      return val.toISOString().split('T')[0];
    }
    if (typeof val === 'string') {
      const trimmed = val.trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
      const dMatch = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
      if (dMatch) {
        const part1 = parseInt(dMatch[1]);
        const part2 = parseInt(dMatch[2]);
        const year = dMatch[3];
        if (part1 > 12) {
          return `${year}-${String(part2).padStart(2, '0')}-${String(part1).padStart(2, '0')}`;
        } else {
          return `${year}-${String(part1).padStart(2, '0')}-${String(part2).padStart(2, '0')}`;
        }
      }
      const d = new Date(trimmed);
      if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
    }
    return '2015-01-01';
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

    // 2. Rate Limit on File Import: Max 2 import operations per 8 seconds
    const importRateLimit = checkRateLimit('student_csv_import', 2, 8000);
    if (!importRateLimit.allowed) {
      showToast(`Rate limit reached: Please wait ${importRateLimit.retryAfterSeconds} second(s) before importing another file.`, "error");
      e.target.value = '';
      return;
    }

    setIsImporting(true);
    showToast("Analyzing CSV checksum & verifying against duplicate imports...", "info");

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary', cellDates: true });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const rawData = XLSX.utils.sheet_to_json(ws) as any[];

        if (!rawData || rawData.length === 0) {
          showToast("No data found in the uploaded CSV file.", "error");
          setIsImporting(false);
          e.target.value = '';
          return;
        }

        const targetSchoolId = 
          currentUser?.school_id || 
          currentUser?.schoolId || 
          (currentUser as any)?.school?.id || 
          activeSchool?.id || 
          (await getCurrentSchoolId()) || 
          undefined;

        // 2. Cryptographic Security Check: Compute SHA-256 Checksum of the file
        const fileHash = await calculateFileHash(file);
        const contentSig = await calculateContentFingerprint(rawData);

        // 3. Check if file or content signature has already been imported
        const dupCheck = await checkIsFileDuplicate(fileHash, contentSig, targetSchoolId, 'students');
        if (dupCheck.isDuplicate) {
          showToast(
            ` Duplicate File Blocked: ${dupCheck.reason || 'This exact file has already been imported.'} To protect school data, duplicate file imports are strictly blocked.`,
            "error"
          );
          setIsImporting(false);
          e.target.value = '';
          return;
        }

        const newStudents: Student[] = rawData.map((item, index) => {
          const customId = item.studentId || item.student_id || item['Student ID'] || item['student ID'] || item['ID'] || `STU-${Date.now().toString().slice(-6)}-${index + 1}`;
          const dob = parseExcelDate(item.dateOfBirth || item.date_of_birth || item['Date of Birth'] || item['DOB'] || item['Birth Date']);

          return normalizeStudentRecord({
            ...item,
            studentId: String(customId).trim(),
            dateOfBirth: dob,
            school_id: targetSchoolId,
            schoolId: targetSchoolId,
            createdAt: Date.now() + index
          });
        });

        // 4. Duplicate Record Filtering against existing school database
        const { uniqueStudents, duplicateCount } = filterDuplicateStudentRows(newStudents, allStudents || []);
        
        if (uniqueStudents.length === 0) {
          showToast(` All ${newStudents.length} student records in this file already exist in your school database. Import cancelled to avoid duplicates.`, "error");
          setIsImporting(false);
          e.target.value = '';
          return;
        }

        // 5. Ingest into Supabase via API with file security signature
        await studentsApi.bulkCreate(uniqueStudents, targetSchoolId, {
          fileHash,
          fileName: file.name
        });

        // 6. Record file signature in anti-duplicate registry
        await recordImportedFile({
          hash: fileHash,
          fileName: file.name,
          fileSize: file.size,
          rowCount: uniqueStudents.length,
          schoolId: targetSchoolId,
          module: 'students',
          importedAt: Date.now(),
          importedBy: currentUser?.username || currentUser?.fullName || 'Admin'
        });

        if (duplicateCount > 0) {
          showToast(`Successfully imported ${uniqueStudents.length} new students (${duplicateCount} duplicate records skipped)!`, "success");
        } else {
          showToast(`Successfully imported ${uniqueStudents.length} students into Supabase! Checksum verified.`, "success");
        }
      } catch (err: any) {
        console.error("Error importing students:", err);
        const errMsg = err?.message || "Error parsing file. Please ensure valid Excel format.";
        showToast(errMsg, "error");
      } finally {
        setIsImporting(false);
        e.target.value = '';
      }
    };

    reader.onerror = () => {
      showToast("Failed to read the file.", "error");
      setIsImporting(false);
      e.target.value = '';
    };

    reader.readAsBinaryString(file);
  };

  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [feeInputs, setFeeInputs] = useState<Record<string, number>>({});
  const [modalFeesPaid, setModalFeesPaid] = useState<number>(0);

  React.useEffect(() => {
    if (isAddModalOpen) {
      const initial: Record<string, number> = {};
      feeTypes.forEach(ft => {
        initial[ft.id] = editingStudent 
          ? (editingStudent.feeBreakdown?.[ft.id] ?? (ft.id === 'tuition' ? editingStudent.totalFees : 0))
          : ft.defaultAmount;
      });
      setFeeInputs(initial);
      setModalFeesPaid(editingStudent ? (editingStudent.feesPaid || 0) : 0);
    } else {
      setFeeInputs({});
      setModalFeesPaid(0);
    }
  }, [isAddModalOpen, editingStudent, feeTypes]);

  const computedTotalFees = React.useMemo(() => {
    return Object.values(feeInputs).reduce((a: number, b: number) => a + Number(b || 0), 0);
  }, [feeInputs]);

  const computedBalance = React.useMemo(() => {
    return Math.max(0, computedTotalFees - modalFeesPaid);
  }, [computedTotalFees, modalFeesPaid]);

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const openEditModal = (student: Student) => {
    setEditingStudent(student);
    setPhotoPreview(student.photo || null);
    setModalFeesPaid(student.feesPaid || 0);
    setIsAddModalOpen(true);
  };

  const handleStudentSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isSubmitting) return;

    // Rate limit student creation/edits: Max 4 submissions per 3 seconds
    const limitCheck = checkRateLimit('student_form_submit', 4, 3000);
    if (!limitCheck.allowed) {
      showToast(`Rate limit: Please wait ${limitCheck.retryAfterSeconds}s before submitting again.`, "error");
      return;
    }

    setIsSubmitting(true);

    try {
      const formData = new FormData(e.currentTarget);
      const targetSchoolId = 
        currentUser?.school_id || 
        currentUser?.schoolId || 
        (currentUser as any)?.school?.id || 
        activeSchool?.id || 
        (await getCurrentSchoolId()) || 
        undefined;

      const studentData = {
        firstName: formData.get('firstName') as string,
        lastName: formData.get('lastName') as string,
        class: formData.get('class') as string,
        dateOfBirth: formData.get('dob') as string,
        gender: formData.get('gender') as 'Male' | 'Female',
        guardianName: formData.get('guardianName') as string,
        guardianPhone: formData.get('guardianPhone') as string,
        house: formData.get('house') as string,
        department: formData.get('department') as string,
        totalFees: computedTotalFees,
        feesPaid: modalFeesPaid,
        feeBreakdown: feeInputs,
        photo: photoPreview || undefined,
        school_id: targetSchoolId,
        schoolId: targetSchoolId
      };

      if (editingStudent) {
        await studentsApi.update(editingStudent.id!, studentData, targetSchoolId);
        showToast("Student details updated and synced to Supabase!", "success");
      } else {
        const initialPaidBreakdown: Record<string, number> = {};
        feeTypes.forEach(ft => {
          initialPaidBreakdown[ft.id] = ft.id === 'tuition' ? modalFeesPaid : 0;
        });
        const student: Student = {
          ...studentData,
          feePaidBreakdown: initialPaidBreakdown,
          studentId: `STU-${Date.now().toString().slice(-6)}`,
          createdAt: Date.now()
        };
        await studentsApi.create(student, targetSchoolId);
        showToast("Student registered and stored in Supabase with aligned school!", "success");
      }
      
      setIsAddModalOpen(false);
      setEditingStudent(null);
      setPhotoPreview(null);
    } catch (err: any) {
      console.error("Error submitting student:", err);
      showToast("Error saving student to Supabase. Saved locally.", "info");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleSelect = (id?: number) => {
    if (!id) return;
    setSelectedStudentIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (!filteredStudents) return;
    const allFilteredIds = filteredStudents.map(s => s.id).filter((id): id is number => id !== undefined);
    const areAllSelected = allFilteredIds.length > 0 && allFilteredIds.every(id => selectedStudentIds.includes(id));

    if (areAllSelected) {
      // Unselect all currently filtered
      setSelectedStudentIds(prev => prev.filter(id => !allFilteredIds.includes(id)));
    } else {
      // Select all currently filtered (union)
      setSelectedStudentIds(prev => Array.from(new Set([...prev, ...allFilteredIds])));
    }
  };

  const handleClearSelection = () => {
    setSelectedStudentIds([]);
  };

  const exportSelectedToCsv = () => {
    const selectedData = (allStudents || []).filter(s => s.id && selectedStudentIds.includes(s.id));
    if (selectedData.length === 0) {
      showToast("No students selected to export.", "info");
      return;
    }
    const ws = XLSX.utils.json_to_sheet(selectedData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Selected_Students");
    XLSX.writeFile(wb, `Selected_Students_${new Date().toISOString().split('T')[0]}.csv`, { bookType: 'csv' });
    showToast(`Exported ${selectedData.length} selected student(s) to CSV!`, "success");
  };

  const deleteStudent = async (studentOrId?: Student | number) => {
    if (!studentOrId) return;
    
    let targetStudent: Student | undefined;
    let studentId: number;

    if (typeof studentOrId === 'number') {
      studentId = studentOrId;
      targetStudent = allStudents?.find(s => s.id === studentId);
    } else {
      targetStudent = studentOrId;
      studentId = studentOrId.id as number;
    }

    if (!studentId) return;

    const studentDisplayName = targetStudent ? `${targetStudent.firstName} ${targetStudent.lastName}` : `Student #${studentId}`;
    const studentIdentifier = targetStudent?.studentId || String(studentId);

    confirm({
      title: "Delete Student Record",
      message: `Are you sure you want to permanently delete ${studentDisplayName} (${studentIdentifier})? This will remove their record from Supabase (cloud database) and the local front-end registry.`,
      confirmLabel: "Delete Permanently",
      onConfirm: async () => {
        try {
          setSelectedStudentIds(prev => prev.filter(id => id !== studentId));
          await studentsApi.delete(studentId, activeSchool?.id || currentUser?.schoolId, targetStudent?.studentId);
          showToast(`Student ${studentDisplayName} deleted successfully!`, "success");
        } catch (err: any) {
          console.error("Delete student error:", err);
          showToast(err?.message || "Failed to delete student from database.", "error");
        }
      }
    });
  };

  const handleBulkDelete = async () => {
    if (selectedStudentIds.length === 0) return;
    const count = selectedStudentIds.length;

    confirm({
      title: `Delete ${count} Selected Student${count > 1 ? 's' : ''}`,
      message: `Are you sure you want to permanently delete ${count} selected student(s)? Their data will be immediately removed from Supabase and the front-end local registry. This action cannot be reversed.`,
      confirmLabel: `Delete ${count} Student${count > 1 ? 's' : ''}`,
      onConfirm: async () => {
        setIsBulkDeleting(true);
        try {
          const targetIds = [...selectedStudentIds];
          setSelectedStudentIds([]);
          await studentsApi.bulkDelete(targetIds, activeSchool?.id || currentUser?.schoolId);
          showToast(`Successfully deleted ${count} student(s) from Supabase and local storage!`, "success");
        } catch (err: any) {
          console.error("Bulk delete error:", err);
          showToast(err?.message || "Failed to delete selected students.", "error");
        } finally {
          setIsBulkDeleting(false);
        }
      }
    });
  };

  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isActionsMenuOpen, setIsActionsMenuOpen] = useState(false);

  return (
    <div className="space-y-4 sm:space-y-6 w-full max-w-full min-w-0 overflow-x-hidden">
      {/* Print Only Header */}
      <div className="only-print">
        <h1 className="text-3xl font-black text-slate-900 uppercase tracking-tighter text-center">{schoolName}</h1>
        <div className="mt-2 text-sm font-bold text-slate-600 uppercase tracking-widest flex items-center justify-center gap-4">
          <span>Official Student Enrollment Record</span>
          <span className="w-1.5 h-1.5 bg-slate-400 rounded-full" />
          <span>{activeFilter || 'All Classes'}</span>
          <span className="w-1.5 h-1.5 bg-slate-400 rounded-full" />
          <span>Generated: {new Date().toLocaleDateString()}</span>
        </div>
      </div>

      {/* Deep Teal Hero Header Card */}
      <div className="bg-[#1c4a59] rounded-2xl sm:rounded-3xl p-4 sm:p-6 lg:p-7 text-white shadow-[0_8px_28px_rgba(28,74,89,0.16)] flex flex-col lg:flex-row lg:items-center justify-between gap-4 sm:gap-5 print:hidden min-w-0 overflow-hidden">
        <div className="space-y-1.5 sm:space-y-2 min-w-0">
          <div className="inline-flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1 rounded-full bg-white/10 border border-white/15 max-w-full">
            <Users className="w-3.5 h-3.5 text-[#faae57] shrink-0" />
            <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-[#e1c594] truncate">
              Student Enrollment & Records
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl lg:text-[28px] font-extrabold tracking-tight text-white leading-tight break-words">
            Students Directory & Class Registry
          </h2>
          <p className="text-xs sm:text-sm text-[#e1c594]/90 font-medium leading-relaxed">
            {allStudents?.length || 0} active students across {classes?.length || 0} classes • {activeFilter || 'All Class Streams'}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full lg:w-auto min-w-0">
          {/* Tab Switcher Pills inside Teal Header */}
          <div className="grid grid-cols-2 sm:flex items-center bg-white/10 p-1 rounded-2xl sm:rounded-full border border-white/15 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => setActiveTab('registry')}
              className={cn(
                "px-2.5 sm:px-4 py-2 rounded-xl sm:rounded-full font-bold text-[11px] sm:text-xs transition-all flex items-center justify-center gap-1.5 sm:gap-2 cursor-pointer min-h-[38px] truncate",
                activeTab === 'registry' 
                  ? "bg-[#faae57] text-[#1f2a2e] shadow-xs" 
                  : "text-white/85 hover:text-white"
              )}
            >
              <Users className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Active Registry</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('promotions')}
              className={cn(
                "px-2.5 sm:px-4 py-2 rounded-xl sm:rounded-full font-bold text-[11px] sm:text-xs transition-all flex items-center justify-center gap-1.5 sm:gap-2 cursor-pointer min-h-[38px] truncate",
                activeTab === 'promotions' 
                  ? "bg-[#faae57] text-[#1f2a2e] shadow-xs" 
                  : "text-white/85 hover:text-white"
              )}
            >
              <History className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Promotions</span>
              {promotionHistory.length > 0 && (
                <span className="px-1.5 py-0.5 text-[10px] font-mono font-bold bg-[#1c4a59] text-[#faae57] rounded-full shrink-0">
                  {promotionHistory.length}
                </span>
              )}
            </button>
          </div>

          {isAdmin && (
            <button 
              type="button"
              id="add-student-btn"
              onClick={() => {
                setEditingStudent(null);
                setIsAddModalOpen(true);
              }}
              className="flex items-center justify-center gap-2 px-5 py-2.5 bg-[#faae57] hover:bg-[#e4ae67] text-[#1f2a2e] rounded-xl sm:rounded-full font-bold active:scale-[0.97] transition-all shadow-sm min-h-[42px] sm:min-h-[44px] text-xs sm:text-sm cursor-pointer w-full sm:w-auto"
            >
              <Plus className="w-4 h-4 stroke-[2.5] shrink-0" />
              <span>Add Student</span>
            </button>
          )}
        </div>
      </div>

      {activeTab === 'registry' && (
        <>
          <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3 print:hidden bg-white p-3.5 sm:p-4 rounded-2xl border border-[#bac4c6]/60 shadow-[0_4px_16px_rgba(0,0,0,0.05)] min-w-0">
            <div className="relative w-full xl:flex-1 xl:max-w-lg min-w-0">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6a7f84] pointer-events-none" />
              <input 
                type="text"
                placeholder="Search students by name, ID, or guardian..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full h-10 pl-10 pr-8 bg-[#f6f8f7] border border-[#bac4c6] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1c4a59] focus:bg-white transition-all text-xs sm:text-sm text-[#1f2a2e]"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-lg text-[#6a7f84] hover:text-[#1f2a2e] hover:bg-[#bac4c6]/30 transition-colors cursor-pointer"
                  title="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            
            <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center justify-start xl:justify-end gap-2 w-full xl:w-auto min-w-0">
              {/* Filter Class Dropdown */}
              <div className="relative min-w-0 w-full sm:w-auto">
                <button 
                  type="button"
                  onClick={() => {
                    setIsFilterOpen(!isFilterOpen);
                    setIsActionsMenuOpen(false);
                  }}
                  className={cn(
                    "w-full sm:w-auto flex items-center justify-center gap-1.5 h-10 px-3 sm:px-3.5 border rounded-xl font-bold transition-all text-[11px] sm:text-xs cursor-pointer",
                    activeFilter ? "bg-[#1c4a59] border-[#1c4a59] text-white" : "bg-white border-[#bac4c6] text-[#1f2a2e] hover:bg-[#f6f8f7]"
                  )}
                  title="Filter by class"
                >
                  <span className="truncate">{activeFilter ? `Class: ${activeFilter}` : 'Filter Class'}</span>
                  <span className="text-[10px] opacity-70 shrink-0">▾</span>
                </button>
                
                <AnimatePresence>
                  {isFilterOpen && (
                    <>
                      <div className="fixed inset-0 z-20" onClick={() => setIsFilterOpen(false)} />
                      <motion.div 
                        initial={{ opacity: 0, y: 8, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 8, scale: 0.96 }}
                        className="absolute left-0 xl:left-auto xl:right-0 mt-2 w-48 bg-white border border-[#bac4c6] rounded-2xl shadow-xl z-30 overflow-hidden"
                      >
                        <div className="p-2 space-y-1 max-h-64 overflow-y-auto">
                          <button 
                            type="button"
                            onClick={() => {
                              setActiveFilter(null);
                              setIsFilterOpen(false);
                            }}
                            className={cn(
                              "w-full text-left px-3 py-2 text-xs rounded-xl font-bold transition-colors cursor-pointer",
                              !activeFilter ? "bg-[#1c4a59] text-[#faae57]" : "hover:bg-[#f6f8f7] text-[#1f2a2e]"
                            )}
                          >
                            All Classes
                          </button>
                          {classes?.map(c => (
                            <button 
                              type="button"
                              key={c.id}
                              onClick={() => {
                                setActiveFilter(c.name);
                                setIsFilterOpen(false);
                              }}
                              className={cn(
                                "w-full text-left px-3 py-2 text-xs rounded-xl font-bold transition-colors cursor-pointer",
                                activeFilter === c.name ? "bg-[#1c4a59] text-[#faae57]" : "hover:bg-[#f6f8f7] text-[#1f2a2e]"
                              )}
                            >
                              {c.name}
                            </button>
                          ))}
                        </div>
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>

              {/* Consolidated Template / Import / Export / Print Dropdown */}
              <div className="relative min-w-0 w-full sm:w-auto">
                {isAdmin && (
                  <input 
                    type="file" 
                    id="import-csv" 
                    className="hidden" 
                    accept=".csv, text/csv"
                    onChange={importFromCsv}
                  />
                )}
                <button
                  type="button"
                  onClick={() => {
                    setIsActionsMenuOpen(!isActionsMenuOpen);
                    setIsFilterOpen(false);
                  }}
                  className={cn(
                    "w-full sm:w-auto flex items-center justify-center gap-1.5 h-10 px-3 sm:px-3.5 border rounded-xl font-bold transition-all text-[11px] sm:text-xs cursor-pointer",
                    isActionsMenuOpen
                      ? "bg-[#1c4a59] border-[#1c4a59] text-white"
                      : "bg-white border-[#bac4c6] text-[#1f2a2e] hover:bg-[#f6f8f7]"
                  )}
                  title="CSV Template, Import, Export & Print Options"
                >
                  <span className="truncate">{isImporting ? 'Importing CSV...' : 'Import / Export'}</span>
                  <span className="text-[10px] opacity-70 shrink-0">▾</span>
                </button>

                <AnimatePresence>
                  {isActionsMenuOpen && (
                    <>
                      <div className="fixed inset-0 z-20" onClick={() => setIsActionsMenuOpen(false)} />
                      <motion.div
                        initial={{ opacity: 0, y: 8, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 8, scale: 0.96 }}
                        className="absolute right-0 mt-2 w-48 bg-white border border-[#bac4c6] rounded-2xl shadow-xl z-30 overflow-hidden"
                      >
                        <div className="p-1.5 space-y-0.5">
                          {isAdmin && (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  setIsActionsMenuOpen(false);
                                  downloadTemplate();
                                }}
                                className="w-full text-left px-3 py-2 text-xs rounded-xl font-bold text-[#1f2a2e] hover:bg-[#f6f8f7] transition-colors cursor-pointer"
                              >
                                CSV Template
                              </button>
                              <button
                                type="button"
                                disabled={isImporting}
                                onClick={() => {
                                  setIsActionsMenuOpen(false);
                                  document.getElementById('import-csv')?.click();
                                }}
                                className="w-full text-left px-3 py-2 text-xs rounded-xl font-bold text-[#1f2a2e] hover:bg-[#f6f8f7] disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
                              >
                                {isImporting ? 'Importing CSV...' : 'Import CSV'}
                              </button>
                              <div className="my-1 h-px bg-[#bac4c6]/40" />
                            </>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setIsActionsMenuOpen(false);
                              exportToExcel();
                            }}
                            className="w-full text-left px-3 py-2 text-xs rounded-xl font-bold text-[#1f2a2e] hover:bg-[#f6f8f7] transition-colors cursor-pointer"
                          >
                            Export to Excel
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setIsActionsMenuOpen(false);
                              triggerPrint();
                            }}
                            className="w-full text-left px-3 py-2 text-xs rounded-xl font-bold text-[#1f2a2e] hover:bg-[#f6f8f7] transition-colors cursor-pointer"
                          >
                            Print Directory
                          </button>
                        </div>
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>

              {/* Promote Class Primary Action */}
              {isAdmin && (
                <button 
                  type="button"
                  onClick={() => setIsPromotionModalOpen(true)}
                  className="col-span-2 sm:col-span-1 flex items-center justify-center h-10 px-4 bg-[#06d6a0] text-[#1f2a2e] rounded-xl font-bold hover:opacity-90 active:scale-[0.98] transition-all shadow-xs text-xs whitespace-nowrap cursor-pointer w-full sm:w-auto"
                  title="Promote Class"
                >
                  <span>Promote Class</span>
                </button>
              )}
            </div>
          </div>

      {/* Bulk Action Toolbar */}
      <AnimatePresence>
        {selectedStudentIds.length > 0 && (
          <motion.div 
            initial={{ opacity: 0, y: -10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.98 }}
            className="bg-[#1c4a59] text-white rounded-2xl p-3.5 sm:p-4 shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 border border-white/15 print:hidden"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-[#faae57] flex items-center justify-center font-black text-sm text-[#1f2a2e] shrink-0">
                {selectedStudentIds.length}
              </div>
              <div className="min-w-0">
                <div className="font-bold text-xs sm:text-sm text-white">
                  {selectedStudentIds.length} {selectedStudentIds.length === 1 ? 'Student' : 'Students'} Selected
                </div>
                <div className="text-[11px] text-[#e1c594] truncate">
                  Bulk actions apply across cloud database & local registry
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              <button
                type="button"
                onClick={handleClearSelection}
                className="flex-1 sm:flex-initial justify-center px-3 py-2 bg-white/10 hover:bg-white/20 border border-white/15 rounded-xl text-xs font-bold text-white transition-colors cursor-pointer whitespace-nowrap"
              >
                Clear Selection
              </button>
              <button
                type="button"
                onClick={exportSelectedToCsv}
                className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-2 bg-white/15 hover:bg-white/25 border border-white/20 rounded-xl text-xs font-bold text-white transition-colors cursor-pointer whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5 text-[#faae57] shrink-0" />
                <span>Export CSV ({selectedStudentIds.length})</span>
              </button>
              {isAdmin && (
                <button
                  type="button"
                  onClick={handleBulkDelete}
                  disabled={isBulkDeleting}
                  className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-4 py-2 bg-[#ef476f] hover:opacity-90 text-white rounded-xl text-xs font-bold transition-all shadow-sm active:scale-95 disabled:opacity-50 cursor-pointer whitespace-nowrap"
                >
                  <Trash2 className="w-3.5 h-3.5 shrink-0" />
                  <span>{isBulkDeleting ? 'Deleting...' : `Delete Selected (${selectedStudentIds.length})`}</span>
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="bg-white border border-[#bac4c6]/80 rounded-2xl overflow-hidden shadow-[0_4px_16px_rgba(0,0,0,0.05)] text-[#1f2a2e]">
        {/* Mobile & Small Screen Card View (< 768px) */}
        <div className="md:hidden print:hidden">
          {filteredStudents && filteredStudents.length > 0 && (
            <div className="flex items-center justify-between px-4 py-3 bg-[#f6f8f7] border-b border-[#bac4c6]/60">
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={filteredStudents.length > 0 && filteredStudents.every(s => s.id && selectedStudentIds.includes(s.id))}
                  onChange={handleSelectAll}
                  className="w-4 h-4 rounded border-[#bac4c6] text-[#1c4a59] focus:ring-[#1c4a59] cursor-pointer"
                />
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#1c4a59]">
                  Select All Visible ({filteredStudents.length})
                </span>
              </label>
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#4e6166]">
                {activeFilter || 'All Classes'}
              </span>
            </div>
          )}

          <div className="divide-y divide-[#ecf0ee]">
            {filteredStudents?.map((student) => {
              const isSelected = student.id ? selectedStudentIds.includes(student.id) : false;
              const feesPaid = student.feesPaid || 0;
              const totalFees = student.totalFees || 0;
              const balance = totalFees - feesPaid;
              const progressPct = Math.min(100, Math.max(0, (feesPaid / (totalFees || 1)) * 100));

              return (
                <div
                  key={student.id}
                  className={cn(
                    "p-4 transition-colors space-y-3",
                    isSelected ? "bg-[#f0f5f7] border-l-4 border-l-[#1c4a59]" : "bg-white hover:bg-[#f6f8f7]/70"
                  )}
                >
                  {/* Top Row: Checkbox, Avatar, Name, ID & Class */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleSelect(student.id)}
                        className="mt-2.5 w-4 h-4 rounded border-[#bac4c6] text-[#1c4a59] focus:ring-[#1c4a59] cursor-pointer shrink-0"
                      />
                      <div className="w-10 h-10 rounded-xl bg-[#f0f5f7] flex-shrink-0 overflow-hidden border border-[#bcd3da]">
                        {student.photo ? (
                          <img src={student.photo} alt={getStudentFullName(student)} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-[#f0f5f7] text-[#1c4a59] font-bold text-xs uppercase">
                            {(student.firstName?.[0] || student.first_name?.[0] || '')}{(student.lastName?.[0] || student.last_name?.[0] || '') || 'S'}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-[#1f2a2e] text-sm leading-snug break-words">
                          {getStudentFullName(student)}
                        </div>
                        <div className="text-xs font-medium text-[#4e6166] mt-0.5">
                          {student.gender || 'N/A'}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <span className="font-mono text-xs font-bold text-[#1c4a59] bg-[#f0f5f7] px-2.5 py-0.5 rounded-md border border-[#bcd3da]">
                        {student.studentId}
                      </span>
                      <span className="text-xs font-semibold text-[#1f2a2e] bg-[#f6f8f7] px-2.5 py-0.5 rounded-md border border-[#bac4c6]">
                        {student.class || 'N/A'}
                      </span>
                    </div>
                  </div>

                  {/* Middle Row: Guardian & Fees Summary */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div className="bg-[#f6f8f7] border border-[#bac4c6]/60 rounded-xl p-2.5">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-[#1c4a59]">
                        Guardian
                      </div>
                      <div className="text-xs font-semibold text-[#1f2a2e] mt-0.5 truncate">
                        {student.guardianName || '—'}
                      </div>
                      <div className="text-xs font-mono font-medium text-[#4e6166] mt-0.5">
                        {student.guardianPhone || '—'}
                      </div>
                    </div>

                    <div className="bg-[#f6f8f7] border border-[#bac4c6]/60 rounded-xl p-2.5 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[#1c4a59]">
                          Fees Balance
                        </span>
                        <span
                          className={cn(
                            "text-xs font-mono font-bold tabular-nums px-2 py-0.5 rounded-md border",
                            balance > 0
                              ? "text-[#9f1239] bg-[#fff1f2] border-[#fecdd3]"
                              : "text-[#065f46] bg-[#ecfdf5] border-[#a7f3d0]"
                          )}
                        >
                          {formatCurrency(balance)}
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-[#ecf0ee] border border-[#bac4c6]/40 rounded-sm overflow-hidden">
                        <div
                          className={cn(
                            "h-full rounded-xs transition-all duration-500",
                            progressPct >= 100 ? "bg-[#059669]" : "bg-[#1c4a59]"
                          )}
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>
                      <div className="text-[11px] font-mono font-semibold text-[#1f2a2e] tabular-nums">
                        Paid: {formatCurrency(feesPaid)} / {formatCurrency(totalFees)}
                      </div>
                    </div>
                  </div>

                  {/* Bottom Row: Consistent Action Buttons */}
                  <div className="flex flex-wrap items-center justify-end gap-1.5 pt-1">
                    <button
                      type="button"
                      onClick={() => setSelectedProfileStudent(student)}
                      className="px-2.5 py-1.5 bg-[#f0f5f7] hover:bg-[#dce8ec] text-[#1c4a59] border border-[#bcd3da] rounded-lg transition-colors flex items-center gap-1.5 text-xs font-bold cursor-pointer"
                      title="View Student Profile, Progression & Exam Results"
                    >
                      <Eye className="w-3.5 h-3.5 text-[#1c4a59]" />
                      <span>Profile</span>
                    </button>

                    {(isAdmin || isAccountant) && (
                      <button
                        type="button"
                        onClick={() => setSelectedPaymentStudent(student)}
                        className="px-2.5 py-1.5 bg-[#ecfdf5] hover:bg-[#d1fae5] text-[#065f46] border border-[#a7f3d0] rounded-lg transition-colors flex items-center gap-1.5 text-xs font-bold cursor-pointer"
                        title="Record Fee Payment"
                      >
                        <CreditCard className="w-3.5 h-3.5 text-[#065f46]" />
                        <span>Fee Pay</span>
                      </button>
                    )}

                    {isAdmin && (
                      <>
                        <button
                          type="button"
                          onClick={() => openEditModal(student)}
                          className="p-1.5 bg-[#f6f8f7] hover:bg-[#ecf0ee] text-[#1f2a2e] border border-[#bac4c6] rounded-lg transition-colors cursor-pointer"
                          title="Edit Student Details"
                        >
                          <Edit2 className="w-3.5 h-3.5 text-[#1f2a2e]" />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteStudent(student)}
                          className="p-1.5 bg-[#fff1f2] hover:bg-[#ffe4e6] text-[#9f1239] border border-[#fecdd3] rounded-lg transition-colors cursor-pointer"
                          title="Delete Student Record"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-[#9f1239]" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}

            {filteredStudents?.length === 0 && (
              <div className="px-6 py-12 text-center text-[#4e6166]">
                <div className="flex flex-col items-center gap-3">
                  <Users className="w-12 h-12 text-[#bac4c6]" />
                  <p className="font-semibold text-[#1f2a2e]">No students found. Add your first student to get started!</p>
                  <button
                    type="button"
                    onClick={() => setIsAddModalOpen(true)}
                    className="mt-1 px-4 py-2 bg-[#1c4a59] text-white rounded-xl text-xs font-bold hover:opacity-90 transition-opacity cursor-pointer"
                  >
                    Add Student
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Tablet, Desktop & Print Table View (>= 768px) */}
        <div className="hidden md:block print:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#f6f8f7] border-b border-[#bac4c6]/60">
                <th className="px-3 lg:px-4 py-3.5 w-11 text-center print:hidden">
                  <input 
                    type="checkbox"
                    checked={filteredStudents && filteredStudents.length > 0 && filteredStudents.every(s => s.id && selectedStudentIds.includes(s.id))}
                    onChange={handleSelectAll}
                    className="w-4 h-4 rounded border-[#bac4c6] text-[#1c4a59] focus:ring-[#1c4a59] cursor-pointer"
                    title={filteredStudents && filteredStudents.length > 0 && filteredStudents.every(s => s.id && selectedStudentIds.includes(s.id)) ? "Deselect All" : "Select All Visible"}
                  />
                </th>
                <th className="px-3 lg:px-4 py-3.5 text-[11px] font-bold text-[#1c4a59] uppercase tracking-wider whitespace-nowrap">Student ID</th>
                <th className="px-3 lg:px-5 py-3.5 text-[11px] font-bold text-[#1c4a59] uppercase tracking-wider">Name</th>
                <th className="px-3 lg:px-4 py-3.5 text-[11px] font-bold text-[#1c4a59] uppercase tracking-wider whitespace-nowrap">Class</th>
                <th className="px-3 lg:px-4 py-3.5 text-[11px] font-bold text-[#1c4a59] uppercase tracking-wider">Guardian</th>
                <th className="px-3 lg:px-4 py-3.5 text-[11px] font-bold text-[#1c4a59] uppercase tracking-wider whitespace-nowrap">Fees Paid/Total</th>
                <th className="px-3 lg:px-4 py-3.5 text-[11px] font-bold text-[#1c4a59] uppercase tracking-wider whitespace-nowrap">Fees Balance</th>
                <th className="px-3 lg:px-5 py-3.5 text-[11px] font-bold text-[#1c4a59] uppercase tracking-wider print:hidden text-right whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#ecf0ee]">
              {filteredStudents?.map((student) => {
                const isSelected = student.id ? selectedStudentIds.includes(student.id) : false;
                const feesPaid = student.feesPaid || 0;
                const totalFees = student.totalFees || 0;
                const balance = totalFees - feesPaid;
                const progressPct = Math.min(100, Math.max(0, (feesPaid / (totalFees || 1)) * 100));

                return (
                  <tr
                    key={student.id}
                    className={cn(
                      "transition-colors",
                      isSelected ? "bg-[#f0f5f7] hover:bg-[#dce8ec]/60" : "bg-white hover:bg-[#f6f8f7]/80"
                    )}
                  >
                    <td className="px-3 lg:px-4 py-3.5 w-11 text-center print:hidden">
                      <input 
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleSelect(student.id)}
                        className="w-4 h-4 rounded border-[#bac4c6] text-[#1c4a59] focus:ring-[#1c4a59] cursor-pointer"
                      />
                    </td>
                    <td className="px-3 lg:px-4 py-3.5 whitespace-nowrap">
                      <span className="font-mono text-xs font-bold text-[#1c4a59] bg-[#f0f5f7] px-2.5 py-1 rounded-md border border-[#bcd3da] inline-block">
                        {student.studentId}
                      </span>
                    </td>
                    <td className="px-3 lg:px-5 py-3.5">
                      <div className="flex items-center gap-3 min-w-[160px]">
                        <div className="w-9 h-9 rounded-xl bg-[#f0f5f7] flex-shrink-0 overflow-hidden border border-[#bcd3da]">
                          {student.photo ? (
                            <img src={student.photo} alt={getStudentFullName(student)} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-[#f0f5f7] text-[#1c4a59] font-bold text-xs uppercase">
                              {(student.firstName?.[0] || student.first_name?.[0] || '')}{(student.lastName?.[0] || student.last_name?.[0] || '') || 'S'}
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="font-bold text-[#1f2a2e] text-sm leading-tight truncate max-w-[200px] xl:max-w-[260px]">
                            {getStudentFullName(student)}
                          </div>
                          <div className="text-xs font-medium text-[#4e6166] mt-0.5">
                            {student.gender || 'N/A'}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 lg:px-4 py-3.5 whitespace-nowrap">
                      <span className="text-xs font-semibold text-[#1f2a2e] bg-[#f6f8f7] px-2.5 py-1 rounded-md border border-[#bac4c6] inline-block">
                        {student.class || 'N/A'}
                      </span>
                    </td>
                    <td className="px-3 lg:px-4 py-3.5">
                      <div className="text-xs lg:text-sm font-semibold text-[#1f2a2e] leading-tight truncate max-w-[160px] xl:max-w-[220px]">
                        {student.guardianName || '—'}
                      </div>
                      <div className="text-xs font-mono font-medium text-[#4e6166] mt-0.5 whitespace-nowrap">
                        {student.guardianPhone || '—'}
                      </div>
                    </td>
                    <td className="px-3 lg:px-4 py-3.5 whitespace-nowrap">
                      <div className="flex flex-col gap-1.5">
                        <div className="w-24 h-1.5 bg-[#ecf0ee] border border-[#bac4c6]/40 rounded-sm overflow-hidden">
                          <div 
                            className={cn(
                              "h-full rounded-xs transition-all duration-500",
                              progressPct >= 100 ? "bg-[#059669]" : "bg-[#1c4a59]"
                            )}
                            style={{ width: `${progressPct}%` }}
                          />
                        </div>
                        <span className="text-[11px] font-mono font-semibold text-[#1f2a2e] tabular-nums">
                          {formatCurrency(feesPaid)} / {formatCurrency(totalFees)}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 lg:px-4 py-3.5 whitespace-nowrap">
                      <span className={cn(
                        "text-xs font-mono font-bold tabular-nums px-2.5 py-1 rounded-md border inline-block",
                        balance > 0 
                          ? "text-[#9f1239] bg-[#fff1f2] border-[#fecdd3]" 
                          : "text-[#065f46] bg-[#ecfdf5] border-[#a7f3d0]"
                      )}>
                        {formatCurrency(balance)}
                      </span>
                    </td>
                    <td className="px-3 lg:px-5 py-3.5 text-right print:hidden whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Profile action - available to all roles */}
                        <button 
                          type="button"
                          onClick={() => setSelectedProfileStudent(student)}
                          className="px-2.5 py-1.5 bg-[#f0f5f7] hover:bg-[#dce8ec] text-[#1c4a59] border border-[#bcd3da] rounded-lg transition-colors flex items-center gap-1 text-xs font-bold cursor-pointer"
                          title="View Student Profile, Progression & Exam Results"
                        >
                          <Eye className="w-3.5 h-3.5 text-[#1c4a59]" />
                          <span className="hidden xl:inline text-[#1c4a59]">Profile</span>
                        </button>

                        {/* Fee Payment action - available to Admins & Accountants */}
                        {(isAdmin || isAccountant) && (
                          <button 
                            type="button"
                            onClick={() => setSelectedPaymentStudent(student)}
                            className="px-2.5 py-1.5 bg-[#ecfdf5] hover:bg-[#d1fae5] text-[#065f46] border border-[#a7f3d0] rounded-lg transition-colors flex items-center gap-1 text-xs font-bold cursor-pointer"
                            title="Record Fee Payment"
                          >
                            <CreditCard className="w-3.5 h-3.5 text-[#065f46]" />
                            <span className="hidden xl:inline text-[#065f46]">Fee Pay</span>
                          </button>
                        )}

                        {/* Edit and Delete actions - available to Admins */}
                        {isAdmin && (
                          <>
                            <button 
                              type="button"
                              onClick={() => openEditModal(student)}
                              className="p-1.5 bg-[#f6f8f7] hover:bg-[#ecf0ee] text-[#1f2a2e] border border-[#bac4c6] rounded-lg transition-colors cursor-pointer"
                              title="Edit Student Details"
                            >
                              <Edit2 className="w-3.5 h-3.5 text-[#1f2a2e]" />
                            </button>
                            <button 
                              type="button"
                              onClick={() => deleteStudent(student)}
                              className="p-1.5 bg-[#fff1f2] hover:bg-[#ffe4e6] text-[#9f1239] border border-[#fecdd3] rounded-lg transition-colors cursor-pointer"
                              title="Delete Student Record"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-[#9f1239]" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredStudents?.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-[#4e6166]">
                    <div className="flex flex-col items-center gap-3">
                      <Users className="w-12 h-12 text-[#bac4c6]" />
                      <p className="font-semibold text-[#1f2a2e]">No students found. Add your first student to get started!</p>
                      <button 
                        type="button"
                        onClick={() => setIsAddModalOpen(true)}
                        className="mt-1 px-4 py-2 bg-[#1c4a59] text-white rounded-xl text-xs font-bold hover:opacity-90 transition-opacity cursor-pointer"
                      >
                        Add Student
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
        </>
      )}

      {activeTab === 'promotions' && (
        <div className="space-y-4 sm:space-y-6">
          {/* Header Description */}
          <div className="bg-white border border-[#bac4c6]/80 rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-xs flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3.5 sm:gap-4 text-[#1f2a2e]">
            <div className="space-y-1">
              <h3 className="text-base sm:text-lg font-bold text-[#1f2a2e] flex items-center gap-2">
                <History className="w-5 h-5 text-[#1c4a59] shrink-0" />
                <span>Student Promotion Audit Trail</span>
              </h3>
              <p className="text-xs text-[#4e6166] font-medium max-w-2xl leading-relaxed">
                Review historical student transitions across academic classes and years. 
                Admins can revert any promotion record to return students to their source class and restore their exact previous fee payment snapshot.
              </p>
            </div>
            {isAdmin && (
              <button
                type="button"
                onClick={() => setIsPromotionModalOpen(true)}
                className="flex items-center justify-center gap-2 px-4 py-2.5 bg-[#06d6a0] text-[#1f2a2e] rounded-xl font-bold hover:opacity-90 transition-all shadow-xs text-xs shrink-0 cursor-pointer w-full sm:w-auto"
              >
                <TrendingUp className="w-4 h-4 shrink-0" />
                <span>Promote Students</span>
              </button>
            )}
          </div>

          {/* Audit Search & Filter controls */}
          <div className="flex flex-col sm:flex-row gap-2.5 sm:gap-3">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6a7f84] pointer-events-none" />
              <input 
                type="text"
                placeholder="Search by student name, ID, source or destination class..."
                value={promoSearchTerm}
                onChange={(e) => setPromoSearchTerm(e.target.value)}
                className="w-full h-10 pl-10 pr-4 bg-white border border-[#bac4c6] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1c4a59] transition-all text-xs sm:text-sm text-[#1f2a2e]"
              />
            </div>
            
            <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 w-full sm:w-auto">
              <select 
                value={promoYearFilter}
                onChange={(e) => setPromoYearFilter(e.target.value)}
                className="flex-1 sm:flex-initial h-10 px-3.5 bg-white border border-[#bac4c6] rounded-xl text-xs sm:text-sm font-bold text-[#1f2a2e] focus:border-[#1c4a59] outline-none hover:bg-[#f6f8f7] cursor-pointer"
              >
                <option value="">All Academic Years</option>
                {uniquePromoYears.map(year => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
              {(promoSearchTerm || promoYearFilter) && (
                <button
                  type="button"
                  onClick={() => {
                    setPromoSearchTerm('');
                    setPromoYearFilter('');
                  }}
                  className="h-10 px-3.5 bg-[#f6f8f7] hover:bg-[#ecf0ee] border border-[#bac4c6] rounded-xl text-xs font-bold text-[#1f2a2e] transition-colors cursor-pointer whitespace-nowrap"
                >
                  Clear Filters
                </button>
              )}
            </div>
          </div>

          {/* Promotion Records Container (Mobile Cards + Desktop Table) */}
          <div className="bg-white border border-[#bac4c6]/80 rounded-2xl overflow-hidden shadow-[0_4px_16px_rgba(0,0,0,0.05)] text-[#1f2a2e]">
            {/* Mobile Card List (< 768px) */}
            <div className="md:hidden divide-y divide-[#ecf0ee]">
              {filteredPromoHistory.map((record) => {
                const formattedDate = new Date(record.timestamp).toLocaleString('en-GB', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                });
                return (
                  <div key={record.id} className="p-4 space-y-3 bg-white hover:bg-[#f6f8f7]/70 transition-colors">
                    <div className="flex items-start justify-between gap-2.5">
                      <div className="min-w-0">
                        <div className="font-bold text-sm text-[#1f2a2e] break-words">{record.studentName}</div>
                        <div className="text-xs font-medium text-[#4e6166] mt-0.5">{formattedDate}</div>
                      </div>
                      <span className="font-mono text-xs font-bold text-[#1c4a59] bg-[#f0f5f7] px-2.5 py-0.5 rounded-md border border-[#bcd3da] shrink-0">
                        {record.studentIdentifier}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 bg-[#f6f8f7] border border-[#bac4c6]/60 rounded-xl p-2.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-[#1f2a2e] bg-white px-2.5 py-1 rounded-lg border border-[#bac4c6]">
                          {record.sourceClass}
                        </span>
                        <ArrowRight className="w-3.5 h-3.5 text-[#4e6166] shrink-0" />
                        <span className="text-xs font-extrabold text-[#065f46] bg-[#ecfdf5] px-2.5 py-1 rounded-lg border border-[#a7f3d0]">
                          {record.destClass}
                        </span>
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-bold text-[#1f2a2e]">{record.academicYear}</div>
                        <div className="text-[10px] font-bold text-[#4e6166] uppercase tracking-wider">{record.term}</div>
                      </div>
                    </div>

                    <div className="flex items-center justify-end pt-0.5">
                      {isAdmin ? (
                        <button
                          type="button"
                          onClick={() => handleRevertPromotion(record)}
                          className="w-full sm:w-auto px-3 py-2 bg-[#fff1f2] border border-[#fecdd3] hover:bg-[#ffe4e6] text-[#9f1239] rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                          title="Revert this promotion transition"
                        >
                          <Undo2 className="w-3.5 h-3.5 shrink-0" />
                          <span>Revert Promotion</span>
                        </button>
                      ) : (
                        <span className="text-xs text-[#4e6166] font-medium italic">Reversible by Admin</span>
                      )}
                    </div>
                  </div>
                );
              })}
              {filteredPromoHistory.length === 0 && (
                <div className="px-6 py-12 text-center text-[#4e6166]">
                  <div className="flex flex-col items-center gap-2.5">
                    <History className="w-10 h-10 text-[#bac4c6]" />
                    <p className="font-bold text-sm text-[#1f2a2e]">No promotion transitions found</p>
                    <p className="text-xs text-[#4e6166] max-w-sm">
                      {promoSearchTerm || promoYearFilter 
                        ? "Try widening your search terms or clearing filters to locate previous records."
                        : "Transitions performed using the 'Promote Students' wizard will log full rollback backups here."}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Tablet & Desktop Table (>= 768px) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#f6f8f7] border-b border-[#bac4c6]/60">
                    <th className="px-4 lg:px-6 py-3.5 text-[11px] font-bold text-[#1c4a59] uppercase tracking-wider whitespace-nowrap">Student ID</th>
                    <th className="px-4 lg:px-6 py-3.5 text-[11px] font-bold text-[#1c4a59] uppercase tracking-wider">Name</th>
                    <th className="px-4 lg:px-6 py-3.5 text-[11px] font-bold text-[#1c4a59] uppercase tracking-wider whitespace-nowrap">Transition</th>
                    <th className="px-4 lg:px-6 py-3.5 text-[11px] font-bold text-[#1c4a59] uppercase tracking-wider whitespace-nowrap">Academic Period</th>
                    <th className="px-4 lg:px-6 py-3.5 text-[11px] font-bold text-[#1c4a59] uppercase tracking-wider whitespace-nowrap">Promoted On</th>
                    <th className="px-4 lg:px-6 py-3.5 text-[11px] font-bold text-[#1c4a59] uppercase tracking-wider text-right whitespace-nowrap">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#ecf0ee]">
                  {filteredPromoHistory.map((record) => {
                    const formattedDate = new Date(record.timestamp).toLocaleString('en-GB', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    });
                    return (
                      <tr key={record.id} className="bg-white hover:bg-[#f6f8f7]/80 transition-colors">
                        <td className="px-4 lg:px-6 py-3.5 whitespace-nowrap">
                          <span className="font-mono text-xs font-bold text-[#1c4a59] bg-[#f0f5f7] px-2.5 py-1 rounded-md border border-[#bcd3da]">
                            {record.studentIdentifier}
                          </span>
                        </td>
                        <td className="px-4 lg:px-6 py-3.5">
                          <div className="font-bold text-sm text-[#1f2a2e]">{record.studentName}</div>
                        </td>
                        <td className="px-4 lg:px-6 py-3.5 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-[#1f2a2e] bg-[#f6f8f7] px-2.5 py-1 rounded-lg border border-[#bac4c6]">
                              {record.sourceClass}
                            </span>
                            <ArrowRight className="w-3.5 h-3.5 text-[#4e6166]" />
                            <span className="text-xs font-extrabold text-[#065f46] bg-[#ecfdf5] px-2.5 py-1 rounded-lg border border-[#a7f3d0]">
                              {record.destClass}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 lg:px-6 py-3.5 whitespace-nowrap">
                          <div className="text-xs font-bold text-[#1f2a2e]">{record.academicYear}</div>
                          <div className="text-[10px] font-bold text-[#4e6166] uppercase tracking-wider">{record.term}</div>
                        </td>
                        <td className="px-4 lg:px-6 py-3.5 whitespace-nowrap">
                          <span className="text-xs text-[#4e6166] font-medium">{formattedDate}</span>
                        </td>
                        <td className="px-4 lg:px-6 py-3.5 text-right whitespace-nowrap">
                          {isAdmin ? (
                            <button
                              type="button"
                              onClick={() => handleRevertPromotion(record)}
                              className="px-3 py-1.5 bg-[#fff1f2] border border-[#fecdd3] hover:bg-[#ffe4e6] text-[#9f1239] rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ml-auto cursor-pointer"
                              title="Revert this promotion transition"
                            >
                              <Undo2 className="w-3.5 h-3.5" />
                              <span>Revert Promotion</span>
                            </button>
                          ) : (
                            <span className="text-xs text-[#4e6166] font-medium italic">Reversible by Admin</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {filteredPromoHistory.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-6 py-16 text-center text-[#4e6166]">
                        <div className="flex flex-col items-center gap-3">
                          <History className="w-12 h-12 text-[#bac4c6]" />
                          <p className="font-bold text-[#1f2a2e]">No promotion transitions found</p>
                          <p className="text-xs text-[#4e6166] max-w-sm">
                            {promoSearchTerm || promoYearFilter 
                              ? "Try widening your search terms or clearing filters to locate previous records."
                              : "Transitions performed using the 'Promote Students' wizard will log full rollback backups here."}
                          </p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Add Student Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-slate-900/50 backdrop-blur-sm">
          <motion.div 
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden max-h-[92vh] flex flex-col text-[#1f2a2e]"
          >
            <div className="px-4 py-3.5 sm:p-6 border-b border-[#ecf0ee] flex items-center justify-between shrink-0 bg-[#f6f8f7]">
              <h3 className="text-base sm:text-xl font-bold text-[#1f2a2e]">
                {editingStudent ? 'Edit Student Details' : 'New Student Registration'}
              </h3>
              <button 
                type="button"
                onClick={() => {
                  setIsAddModalOpen(false);
                  setEditingStudent(null);
                  setPhotoPreview(null);
                }}
                className="p-1.5 text-[#4e6166] hover:text-[#1f2a2e] rounded-lg hover:bg-[#ecf0ee] transition-colors cursor-pointer"
                id="close-modal"
              >
                <Plus className="w-5 h-5 sm:w-6 sm:h-6 rotate-45" />
              </button>
            </div>
            
            <form onSubmit={handleStudentSubmit} className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 space-y-5 sm:space-y-7">
              {/* Profile Photo Section */}
              <div className="flex flex-col items-center gap-3 py-4 sm:py-6 bg-[#f6f8f7] rounded-2xl border-2 border-dashed border-[#bac4c6]">
                <div className="relative group">
                  <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full overflow-hidden bg-white border-4 border-white shadow-md flex items-center justify-center relative">
                    {photoPreview ? (
                      <img src={photoPreview} alt="Preview" className="w-full h-full object-cover" />
                    ) : (
                      <User className="w-12 h-12 sm:w-16 sm:h-16 text-[#bac4c6]" />
                    )}
                    <label 
                      htmlFor="photo-upload"
                      className="absolute inset-0 bg-slate-900/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                    >
                      <Camera className="w-7 h-7 sm:w-8 sm:h-8 text-white" />
                    </label>
                  </div>
                  <input 
                    type="file" 
                    id="photo-upload" 
                    accept="image/*" 
                    className="hidden" 
                    onChange={handlePhotoChange}
                  />
                </div>
                <div className="text-center px-3">
                  <p className="text-xs sm:text-sm font-bold text-[#1f2a2e]">Student Profile Picture</p>
                  <p className="text-[11px] sm:text-xs text-[#4e6166]">Tap photo to upload JPG or PNG (max 1MB)</p>
                </div>
              </div>

              {/* Personal Information */}
              <div className="space-y-3.5 sm:space-y-4">
                <div className="flex items-center gap-2 border-b border-[#ecf0ee] pb-2">
                  <User className="w-4 h-4 text-[#1c4a59]" />
                  <h4 className="text-xs sm:text-sm font-black text-[#1f2a2e] uppercase tracking-widest">Personal Information</h4>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
                  <div className="space-y-1.5">
                    <label className="text-xs sm:text-sm font-semibold text-[#1f2a2e]">First Name</label>
                    <input required name="firstName" defaultValue={editingStudent?.firstName} className="w-full px-3.5 py-2 bg-[#f6f8f7] border border-[#bac4c6] rounded-xl focus:ring-2 focus:ring-[#1c4a59] focus:outline-none focus:bg-white transition-all text-sm text-[#1f2a2e]" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs sm:text-sm font-semibold text-[#1f2a2e]">Last Name</label>
                    <input required name="lastName" defaultValue={editingStudent?.lastName} className="w-full px-3.5 py-2 bg-[#f6f8f7] border border-[#bac4c6] rounded-xl focus:ring-2 focus:ring-[#1c4a59] focus:outline-none focus:bg-white transition-all text-sm text-[#1f2a2e]" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs sm:text-sm font-semibold text-[#1f2a2e]">Gender</label>
                    <div className="flex gap-3 p-1.5 bg-[#f6f8f7] border border-[#bac4c6] rounded-xl">
                      <label className="flex-1 flex items-center justify-center gap-2 py-1.5 px-3 rounded-lg hover:bg-white transition-all cursor-pointer accent-[#1c4a59] font-semibold text-xs sm:text-sm text-[#1f2a2e]">
                        <input type="radio" name="gender" value="Male" defaultChecked={editingStudent?.gender !== 'Female'} /> Male
                      </label>
                      <label className="flex-1 flex items-center justify-center gap-2 py-1.5 px-3 rounded-lg hover:bg-white transition-all cursor-pointer accent-[#1c4a59] font-semibold text-xs sm:text-sm text-[#1f2a2e]">
                        <input type="radio" name="gender" value="Female" defaultChecked={editingStudent?.gender === 'Female'} /> Female
                      </label>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs sm:text-sm font-semibold text-[#1f2a2e]">Date of Birth</label>
                    <input required type="date" name="dob" defaultValue={editingStudent?.dateOfBirth} className="w-full px-3.5 py-2 bg-[#f6f8f7] border border-[#bac4c6] rounded-xl focus:ring-2 focus:ring-[#1c4a59] focus:outline-none focus:bg-white transition-all text-sm text-[#1f2a2e]" />
                  </div>
                </div>
              </div>

              {/* Guardian Information */}
              <div className="space-y-3.5 sm:space-y-4">
                <div className="flex items-center gap-2 border-b border-[#ecf0ee] pb-2">
                  <Users className="w-4 h-4 text-[#1c4a59]" />
                  <h4 className="text-xs sm:text-sm font-black text-[#1f2a2e] uppercase tracking-widest">Parent / Guardian Information</h4>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
                  <div className="space-y-1.5">
                    <label className="text-xs sm:text-sm font-semibold text-[#1f2a2e]">Guardian Name</label>
                    <input required name="guardianName" defaultValue={editingStudent?.guardianName} className="w-full px-3.5 py-2 bg-[#f6f8f7] border border-[#bac4c6] rounded-xl focus:ring-2 focus:ring-[#1c4a59] focus:outline-none focus:bg-white transition-all text-sm text-[#1f2a2e]" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs sm:text-sm font-semibold text-[#1f2a2e]">Guardian Phone</label>
                    <input required name="guardianPhone" defaultValue={editingStudent?.guardianPhone} placeholder="024XXXXXXX" className="w-full px-3.5 py-2 bg-[#f6f8f7] border border-[#bac4c6] rounded-xl focus:ring-2 focus:ring-[#1c4a59] focus:outline-none focus:bg-white transition-all text-sm text-[#1f2a2e]" />
                  </div>
                </div>
              </div>

              {/* Academic & Financial */}
              <div className="space-y-3.5 sm:space-y-4">
                <div className="flex items-center gap-2 border-b border-[#ecf0ee] pb-2">
                  <FileSpreadsheet className="w-4 h-4 text-[#1c4a59]" />
                  <h4 className="text-xs sm:text-sm font-black text-[#1f2a2e] uppercase tracking-widest">Academic & School Info</h4>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
                  <div className="space-y-1.5">
                    <label className="text-xs sm:text-sm font-semibold text-[#1f2a2e]">Assigned Class</label>
                    <select name="class" defaultValue={editingStudent?.class} className="w-full px-3.5 py-2 bg-[#f6f8f7] border border-[#bac4c6] rounded-xl focus:ring-2 focus:ring-[#1c4a59] focus:outline-none focus:bg-white transition-all text-sm text-[#1f2a2e]">
                      {classes?.length ? classes.map(c => <option key={c.id} value={c.name}>{c.name}</option>) : <option>P1</option>}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs sm:text-sm font-semibold text-[#1f2a2e]">House / Hostel</label>
                    <input name="house" defaultValue={editingStudent?.house} placeholder="e.g. Blue House" className="w-full px-3.5 py-2 bg-[#f6f8f7] border border-[#bac4c6] rounded-xl focus:ring-2 focus:ring-[#1c4a59] focus:outline-none focus:bg-white transition-all text-sm text-[#1f2a2e]" />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <label className="text-xs sm:text-sm font-semibold text-[#1f2a2e]">Department</label>
                    <input name="department" defaultValue={editingStudent?.department} placeholder="e.g. General Arts" className="w-full px-3.5 py-2 bg-[#f6f8f7] border border-[#bac4c6] rounded-xl focus:ring-2 focus:ring-[#1c4a59] focus:outline-none focus:bg-white transition-all text-sm text-[#1f2a2e]" />
                  </div>
                  <div className="sm:col-span-2 space-y-4 pt-3 border-t border-[#ecf0ee]">
                    <div className="flex items-center justify-between gap-2">
                      <h5 className="font-bold text-[#1f2a2e] text-xs sm:text-sm flex items-center gap-2">
                        <CreditCard className="w-4 h-4 text-[#1c4a59] shrink-0" />
                        <span>Billing Breakdown by Fee Type</span>
                      </h5>
                      <button 
                        type="button"
                        onClick={() => {
                          const resetVals: Record<string, number> = {};
                          feeTypes.forEach(ft => {
                            resetVals[ft.id] = ft.defaultAmount;
                          });
                          setFeeInputs(resetVals);
                        }}
                        className="text-[10px] font-black uppercase text-[#1c4a59] bg-[#f0f5f7] border border-[#bcd3da] px-2.5 py-1 rounded-lg hover:bg-[#1c4a59] hover:text-white transition-all shrink-0 cursor-pointer"
                      >
                        Reset Defaults
                      </button>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-3.5 bg-[#f6f8f7] p-3 sm:p-4 rounded-2xl border border-[#bac4c6]/60">
                      {feeTypes.map(ft => {
                        const amount = feeInputs[ft.id] ?? 0;
                        return (
                          <div key={ft.id} className="space-y-1 bg-white p-2.5 sm:p-3 rounded-xl border border-[#bac4c6]/50 shadow-2xs">
                            <label className="text-[10px] font-bold text-[#4e6166] uppercase tracking-tight block truncate">
                              {ft.label}
                            </label>
                            <input 
                              type="number"
                              value={amount || ''}
                              placeholder="0"
                              min="0"
                              onChange={(e) => {
                                const val = Number(e.target.value);
                                setFeeInputs(prev => ({ ...prev, [ft.id]: val }));
                              }}
                              className="w-full px-2.5 py-1.5 bg-[#f6f8f7] border border-[#bac4c6] rounded-lg focus:ring-2 focus:ring-[#1c4a59] focus:outline-none focus:bg-white transition-all text-xs font-bold text-[#1f2a2e]"
                            />
                          </div>
                        );
                      })}
                    </div>
                    
                    {/* Live Fees Paid Input Field */}
                    <div className="space-y-1.5 p-3.5 sm:p-4 bg-[#f6f8f7] border border-[#bac4c6]/70 rounded-2xl">
                      <label className="text-xs font-black text-[#1f2a2e] uppercase tracking-wider flex items-center gap-1.5">
                        <CreditCard className="w-4 h-4 text-[#1c4a59]" />
                        Amount Paid So Far
                      </label>
                      <input 
                        type="number"
                        value={modalFeesPaid || ''}
                        placeholder="Enter amount paid (e.g. 500)"
                        min="0"
                        max={computedTotalFees}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setModalFeesPaid(val);
                        }}
                        className="w-full px-3.5 py-2.5 bg-white border border-[#bac4c6] rounded-xl focus:ring-2 focus:ring-[#1c4a59] focus:outline-none transition-all text-sm font-bold text-[#1f2a2e]"
                      />
                      <p className="text-[10px] text-[#4e6166] font-semibold">
                        Specify if the student has made any initial payments towards their total fees.
                      </p>
                    </div>

                    {/* Live Fees Balance & Pricing Summary Dashboard */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 p-3.5 sm:p-4 bg-[#1c4a59] text-white rounded-2xl shadow-md">
                      <div className="flex sm:block items-center justify-between space-y-0.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[#e1c594] block">Total Fees (Billed)</span>
                        <span className="text-base sm:text-lg font-black text-white">{formatCurrency(computedTotalFees)}</span>
                      </div>
                      <div className="flex sm:block items-center justify-between space-y-0.5 border-t border-white/15 pt-2 sm:pt-0 sm:border-t-0 sm:border-l sm:border-white/15 sm:pl-4">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[#e1c594] block">Total Paid</span>
                        <span className="text-base sm:text-lg font-black text-[#06d6a0]">{formatCurrency(modalFeesPaid)}</span>
                      </div>
                      <div className="flex sm:block items-center justify-between space-y-0.5 border-t border-white/15 pt-2 sm:pt-0 sm:border-t-0 sm:border-l sm:border-white/15 sm:pl-4">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[#e1c594] block">Fees Balance (Due)</span>
                        <span className={cn(
                          "text-base sm:text-lg font-black",
                          computedBalance > 0 ? "text-[#faae57]" : "text-[#06d6a0]"
                        )}>{formatCurrency(computedBalance)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="pt-4 sm:pt-6 border-t border-[#ecf0ee] flex flex-col-reverse sm:flex-row gap-2.5 sm:gap-4 shrink-0">
                <button 
                  type="button"
                  onClick={() => {
                    setIsAddModalOpen(false);
                    setEditingStudent(null);
                    setPhotoPreview(null);
                  }}
                  className="flex-1 py-2.5 sm:py-3 px-5 border border-[#bac4c6] text-[#1f2a2e] rounded-xl font-bold hover:bg-[#f6f8f7] transition-all text-xs sm:text-sm cursor-pointer"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-2.5 sm:py-3 px-5 bg-[#1c4a59] hover:bg-[#163b47] disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-xl font-bold active:scale-[0.98] transition-all shadow-md flex items-center justify-center gap-2 text-xs sm:text-sm cursor-pointer"
                >
                  {isSubmitting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Saving to Database...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>{editingStudent ? 'Update Details' : 'Register Student'}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Student Biodata & Profile Modal for Teachers & Accountants */}
      <AnimatePresence>
        {selectedProfileStudent && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-slate-900/60 backdrop-blur-sm print:hidden">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[92vh] text-[#1f2a2e]"
            >
              {/* Profile Header */}
              <div className="p-4 sm:p-6 bg-[#1c4a59] text-white flex items-start sm:items-center justify-between gap-3 shrink-0">
                <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                  <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-2xl bg-white/10 flex items-center justify-center overflow-hidden border-2 border-white/20 shrink-0">
                    {selectedProfileStudent.photo ? (
                      <img src={selectedProfileStudent.photo} alt="Avatar" className="w-full h-full object-cover" />
                    ) : (
                      <User className="w-6 h-6 sm:w-8 sm:h-8 text-[#e1c594]" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-base sm:text-xl font-bold text-white leading-tight break-words">
                      {selectedProfileStudent.firstName} {selectedProfileStudent.lastName}
                    </h3>
                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mt-1">
                      <span className="text-xs text-[#e1c594] font-mono font-bold tracking-wider">{selectedProfileStudent.studentId}</span>
                      <span className="text-[11px] sm:text-xs font-semibold px-2 py-0.5 bg-white/15 rounded-md text-white border border-white/20">
                        Active: {selectedProfileStudent.class}
                      </span>
                    </div>
                  </div>
                </div>
                <button 
                  type="button"
                  onClick={() => setSelectedProfileStudent(null)}
                  className="py-1.5 px-3 bg-white/10 hover:bg-white/20 rounded-lg text-xs font-bold text-white transition-all cursor-pointer shrink-0"
                >
                  Close
                </button>
              </div>

              {/* Profile Tabs Navigation */}
              <div className="flex overflow-x-auto no-scrollbar border-b border-[#bac4c6]/60 bg-[#f6f8f7] px-3 sm:px-6 gap-1 sm:gap-2 pt-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setProfileModalTab('details')}
                  className={cn(
                    "pb-2.5 sm:pb-3 px-2.5 sm:px-3 text-xs font-bold transition-all border-b-2 cursor-pointer whitespace-nowrap",
                    profileModalTab === 'details'
                      ? "border-[#1c4a59] text-[#1c4a59]"
                      : "border-transparent text-[#4e6166] hover:text-[#1f2a2e]"
                  )}
                >
                  Overview & Fees
                </button>
                <button
                  type="button"
                  onClick={() => setProfileModalTab('progression')}
                  className={cn(
                    "pb-2.5 sm:pb-3 px-2.5 sm:px-3 text-xs font-bold transition-all border-b-2 cursor-pointer flex items-center gap-1.5 whitespace-nowrap",
                    profileModalTab === 'progression'
                      ? "border-[#1c4a59] text-[#1c4a59]"
                      : "border-transparent text-[#4e6166] hover:text-[#1f2a2e]"
                  )}
                >
                  <History className="w-3.5 h-3.5 shrink-0" />
                  <span>Class Progression</span>
                  {((selectedProfileStudent.classHistory?.length || 0) + (profileStudentPromotions?.length || 0)) > 0 && (
                    <span className="px-1.5 py-0.5 bg-[#f0f5f7] text-[#1c4a59] rounded-md border border-[#bcd3da] text-[10px] font-mono font-bold">
                      {(selectedProfileStudent.classHistory?.length || profileStudentPromotions?.length || 0)}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setProfileModalTab('results')}
                  className={cn(
                    "pb-2.5 sm:pb-3 px-2.5 sm:px-3 text-xs font-bold transition-all border-b-2 cursor-pointer flex items-center gap-1.5 whitespace-nowrap",
                    profileModalTab === 'results'
                      ? "border-[#1c4a59] text-[#1c4a59]"
                      : "border-transparent text-[#4e6166] hover:text-[#1f2a2e]"
                  )}
                >
                  <Award className="w-3.5 h-3.5 shrink-0" />
                  <span>Results History</span>
                  {profileStudentResults.length > 0 && (
                    <span className="px-1.5 py-0.5 bg-[#f0f5f7] text-[#1c4a59] rounded-md border border-[#bcd3da] text-[10px] font-mono font-bold">
                      {profileStudentResults.length}
                    </span>
                  )}
                </button>
              </div>

              {/* Tab Content */}
              <div className="p-4 sm:p-6 overflow-y-auto space-y-5 sm:space-y-6 flex-1">
                {profileModalTab === 'details' && (
                  <>
                    <div className="grid grid-cols-2 gap-3.5 sm:gap-6">
                      <div className="bg-[#f6f8f7] p-3 rounded-xl border border-[#bac4c6]/50">
                        <span className="text-[10px] font-bold text-[#4e6166] uppercase">Current Class</span>
                        <p className="text-sm sm:text-base font-bold text-[#1f2a2e] mt-0.5">{selectedProfileStudent.class}</p>
                      </div>
                      <div className="bg-[#f6f8f7] p-3 rounded-xl border border-[#bac4c6]/50">
                        <span className="text-[10px] font-bold text-[#4e6166] uppercase">Gender</span>
                        <p className="text-sm sm:text-base font-bold text-[#1f2a2e] mt-0.5">{selectedProfileStudent.gender || 'N/A'}</p>
                      </div>
                      <div className="bg-[#f6f8f7] p-3 rounded-xl border border-[#bac4c6]/50">
                        <span className="text-[10px] font-bold text-[#4e6166] uppercase">Date of Birth</span>
                        <p className="text-sm sm:text-base font-bold text-[#1f2a2e] mt-0.5">{selectedProfileStudent.dateOfBirth || 'N/A'}</p>
                      </div>
                      <div className="bg-[#f6f8f7] p-3 rounded-xl border border-[#bac4c6]/50">
                        <span className="text-[10px] font-bold text-[#4e6166] uppercase">House Designation</span>
                        <p className="text-sm sm:text-base font-bold text-[#1f2a2e] mt-0.5">{selectedProfileStudent.house || 'None'}</p>
                      </div>
                    </div>

                    <div className="border-t border-[#ecf0ee] pt-4 sm:pt-6">
                      <h4 className="text-xs font-bold text-[#1c4a59] uppercase tracking-widest mb-3">Parental Contacts</h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-6">
                        <div className="bg-[#f6f8f7] p-3 rounded-xl border border-[#bac4c6]/50">
                          <span className="text-[10px] font-bold text-[#4e6166] uppercase">Guardian Name</span>
                          <p className="text-sm sm:text-base font-bold text-[#1f2a2e] mt-0.5 break-words">{selectedProfileStudent.guardianName || '—'}</p>
                        </div>
                        <div className="bg-[#f6f8f7] p-3 rounded-xl border border-[#bac4c6]/50">
                          <span className="text-[10px] font-bold text-[#4e6166] uppercase">Contact Handset</span>
                          <p className="text-sm sm:text-base font-bold text-[#1c4a59] font-mono mt-0.5">{selectedProfileStudent.guardianPhone || '—'}</p>
                        </div>
                      </div>
                    </div>

                    <div className="border-t border-[#ecf0ee] pt-4 sm:pt-6">
                      <h4 className="text-xs font-bold text-[#1c4a59] uppercase tracking-widest mb-3">Active Term Financial Standing</h4>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-4">
                        <div className="p-3.5 sm:p-4 bg-[#f6f8f7] border border-[#bac4c6]/60 rounded-2xl flex sm:block items-center justify-between">
                          <span className="text-[10px] font-bold text-[#4e6166] uppercase">Billed Amount</span>
                          <p className="text-sm font-bold text-[#1f2a2e] sm:mt-1 font-mono">{formatCurrency(selectedProfileStudent.totalFees)}</p>
                        </div>
                        <div className="p-3.5 sm:p-4 bg-[#ecfdf5] border border-[#a7f3d0] rounded-2xl flex sm:block items-center justify-between">
                          <span className="text-[10px] font-bold text-[#065f46] uppercase">Total Paid</span>
                          <p className="text-sm font-bold text-[#065f46] sm:mt-1 font-mono">{formatCurrency(selectedProfileStudent.feesPaid)}</p>
                        </div>
                        <div className={cn(
                          "p-3.5 sm:p-4 rounded-2xl border flex sm:block items-center justify-between",
                          selectedProfileStudent.totalFees - selectedProfileStudent.feesPaid > 0
                            ? "bg-[#fff1f2] border-[#fecdd3]"
                            : "bg-[#ecfdf5] border-[#a7f3d0]"
                        )}>
                          <span className={cn(
                            "text-[10px] font-bold uppercase",
                            selectedProfileStudent.totalFees - selectedProfileStudent.feesPaid > 0 ? "text-[#9f1239]" : "text-[#065f46]"
                          )}>Outstanding</span>
                          <p className={cn(
                            "text-sm font-bold sm:mt-1 font-mono",
                            selectedProfileStudent.totalFees - selectedProfileStudent.feesPaid > 0 ? "text-[#9f1239]" : "text-[#065f46]"
                          )}>{formatCurrency(selectedProfileStudent.totalFees - selectedProfileStudent.feesPaid)}</p>
                        </div>
                      </div>

                      <div className="mt-3.5 sm:mt-4 border border-[#bac4c6]/60 rounded-xl overflow-hidden bg-[#f6f8f7] p-3.5 sm:p-4">
                        <p className="text-[10px] font-bold text-[#1c4a59] uppercase mb-2.5 tracking-wider">Itemized Bill Breakdown</p>
                        <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
                          {feeTypes.map(ft => {
                            const amount = selectedProfileStudent.feeBreakdown?.[ft.id] ?? (ft.id === 'tuition' ? selectedProfileStudent.totalFees : 0);
                            if (amount === 0) return null;
                            return (
                              <div key={ft.id} className="flex justify-between items-center text-xs py-1 border-b border-[#bac4c6]/40 last:border-0">
                                <span className="text-[#4e6166] font-semibold">{ft.label}</span>
                                <span className="font-bold text-[#1f2a2e] font-mono">{formatCurrency(amount)}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {profileModalTab === 'progression' && (
                  <div className="space-y-5 sm:space-y-6">
                    {/* Active Class Highlight */}
                    <div className="p-3.5 sm:p-4 bg-[#f0f5f7] border border-[#bcd3da] rounded-2xl flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-[#1c4a59] text-white flex items-center justify-center font-bold shrink-0">
                          <GraduationCap className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="text-[10px] sm:text-xs font-bold text-[#1c4a59] uppercase tracking-wider">Current Active Class</p>
                          <p className="text-sm sm:text-base font-black text-[#1f2a2e]">{selectedProfileStudent.class}</p>
                        </div>
                      </div>
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#065f46] bg-[#ecfdf5] border border-[#a7f3d0] px-2.5 py-1 rounded-lg">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#059669]" />
                        <span>Enrolled</span>
                      </span>
                    </div>

                    {/* Historical Class Roster Timeline */}
                    <div>
                      <h4 className="text-xs font-bold text-[#4e6166] uppercase tracking-widest mb-3 flex items-center gap-2">
                        <History className="w-4 h-4 text-[#1c4a59]" />
                        <span>Academic Progression Timeline</span>
                      </h4>

                      {((selectedProfileStudent.classHistory && selectedProfileStudent.classHistory.length > 0) || profileStudentPromotions.length > 0) ? (
                        <div className="relative border-l-2 border-[#bcd3da] ml-3 sm:ml-4 pl-5 sm:pl-6 space-y-5 py-2">
                          {/* Current Class Node */}
                          <div className="relative">
                            <div className="absolute -left-[27px] sm:-left-[31px] top-1 w-4 h-4 rounded-full bg-[#1c4a59] border-2 border-white shadow-sm ring-2 ring-[#bcd3da]" />
                            <div className="p-3.5 sm:p-4 bg-white border border-[#bac4c6]/80 rounded-2xl shadow-2xs">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-sm font-bold text-[#1f2a2e]">{selectedProfileStudent.class}</span>
                                <span className="text-[10px] font-bold px-2 py-0.5 bg-[#f0f5f7] text-[#1c4a59] border border-[#bcd3da] rounded-md">Present Class</span>
                              </div>
                              <p className="text-xs text-[#4e6166]">Currently active academic standing</p>
                            </div>
                          </div>

                          {/* Historical Class Nodes */}
                          {selectedProfileStudent.classHistory?.map((hist, idx) => (
                            <div key={idx} className="relative">
                              <div className="absolute -left-[27px] sm:-left-[31px] top-1 w-4 h-4 rounded-full bg-[#6a7f84] border-2 border-white shadow-sm" />
                              <div className="p-3.5 sm:p-4 bg-[#f6f8f7] border border-[#bac4c6]/70 rounded-2xl space-y-2">
                                <div className="flex flex-wrap items-center justify-between gap-1">
                                  <span className="text-sm font-bold text-[#1f2a2e]">{hist.class}</span>
                                  <span className="text-[11px] font-bold text-[#4e6166] font-mono">{hist.academicYear} • {hist.term}</span>
                                </div>
                                <div className="grid grid-cols-2 gap-2 text-xs bg-white p-2.5 rounded-xl border border-[#bac4c6]/50">
                                  <div>
                                    <span className="text-[10px] font-bold text-[#4e6166] uppercase">Archived Billed:</span>
                                    <p className="font-bold text-[#1f2a2e] font-mono">{formatCurrency(hist.totalFees || 0)}</p>
                                  </div>
                                  <div>
                                    <span className="text-[10px] font-bold text-[#065f46] uppercase">Archived Paid:</span>
                                    <p className="font-bold text-[#065f46] font-mono">{formatCurrency(hist.feesPaid || 0)}</p>
                                  </div>
                                </div>
                                {hist.promotedAt && (
                                  <p className="text-[10px] text-[#4e6166]">Promoted on {new Date(hist.promotedAt).toLocaleDateString()}</p>
                                )}
                              </div>
                            </div>
                          ))}

                          {/* Fallback to promotion history if classHistory not populated */}
                          {(!selectedProfileStudent.classHistory || selectedProfileStudent.classHistory.length === 0) && profileStudentPromotions.map((promo, idx) => (
                            <div key={idx} className="relative">
                              <div className="absolute -left-[27px] sm:-left-[31px] top-1 w-4 h-4 rounded-full bg-[#6a7f84] border-2 border-white shadow-sm" />
                              <div className="p-3.5 sm:p-4 bg-[#f6f8f7] border border-[#bac4c6]/70 rounded-2xl space-y-2">
                                <div className="flex flex-wrap items-center justify-between gap-1">
                                  <span className="text-sm font-bold text-[#1f2a2e]">{promo.sourceClass} &rarr; {promo.destClass}</span>
                                  <span className="text-[11px] font-bold text-[#4e6166] font-mono">{promo.academicYear}</span>
                                </div>
                                <div className="grid grid-cols-2 gap-2 text-xs bg-white p-2.5 rounded-xl border border-[#bac4c6]/50">
                                  <div>
                                    <span className="text-[10px] font-bold text-[#4e6166] uppercase">Archived Billed:</span>
                                    <p className="font-bold text-[#1f2a2e] font-mono">{formatCurrency(promo.previousTotalFees || 0)}</p>
                                  </div>
                                  <div>
                                    <span className="text-[10px] font-bold text-[#065f46] uppercase">Archived Paid:</span>
                                    <p className="font-bold text-[#065f46] font-mono">{formatCurrency(promo.previousFeesPaid || 0)}</p>
                                  </div>
                                </div>
                                <p className="text-[10px] text-[#4e6166]">Promoted on {new Date(promo.timestamp).toLocaleDateString()}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="p-5 sm:p-6 bg-[#f6f8f7] rounded-2xl text-center border border-[#bac4c6]/60">
                          <p className="text-xs font-bold text-[#1f2a2e]">First Academic Session Enrolled</p>
                          <p className="text-xs text-[#4e6166] mt-1">This student is in their inaugural class ({selectedProfileStudent.class}). Subsequent promotions across academic years will be safely logged here.</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {profileModalTab === 'results' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-[#1c4a59] uppercase tracking-widest">Historical Exam Results</h4>
                      <span className="text-xs font-bold text-[#4e6166] font-mono">{profileStudentResults.length} records found</span>
                    </div>

                    {profileStudentResults.length > 0 ? (
                      <div className="border border-[#bac4c6]/80 rounded-2xl overflow-hidden">
                        {/* Mobile Result Cards (< 640px) */}
                        <div className="sm:hidden divide-y divide-[#ecf0ee]">
                          {profileStudentResults.map((res, i) => (
                            <div key={i} className="p-3.5 bg-white space-y-1.5">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-bold text-xs text-[#1f2a2e]">{res.subject}</span>
                                <div className="flex items-center gap-1.5">
                                  <span className="font-mono font-bold text-xs text-[#1f2a2e]">{res.totalScore}%</span>
                                  <span className="px-2 py-0.5 bg-[#f0f5f7] text-[#1c4a59] border border-[#bcd3da] font-bold rounded-md text-[11px] font-mono">
                                    {res.grade}
                                  </span>
                                </div>
                              </div>
                              <div className="flex items-center justify-between text-[11px] text-[#4e6166]">
                                <span className="font-semibold">{res.class || selectedProfileStudent.class} • {res.term}</span>
                                <span className="italic">{res.remarks || 'Pass'}</span>
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Tablet/Desktop Table (>= 640px) */}
                        <div className="hidden sm:block overflow-x-auto">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-[#f6f8f7] text-[#1c4a59] font-bold border-b border-[#bac4c6]/60">
                              <tr>
                                <th className="py-2.5 px-3">Class & Term</th>
                                <th className="py-2.5 px-3">Subject</th>
                                <th className="py-2.5 px-3 text-center">Score (100%)</th>
                                <th className="py-2.5 px-3 text-center">Grade</th>
                                <th className="py-2.5 px-3">Remarks</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[#ecf0ee]">
                              {profileStudentResults.map((res, i) => (
                                <tr key={i} className="bg-white hover:bg-[#f6f8f7]/80">
                                  <td className="py-2.5 px-3 font-semibold text-[#1f2a2e]">{res.class || selectedProfileStudent.class} • {res.term}</td>
                                  <td className="py-2.5 px-3 text-[#1f2a2e]">{res.subject}</td>
                                  <td className="py-2.5 px-3 text-center font-mono font-bold text-[#1f2a2e]">{res.totalScore}</td>
                                  <td className="py-2.5 px-3 text-center">
                                    <span className="px-2 py-0.5 bg-[#f0f5f7] text-[#1c4a59] border border-[#bcd3da] font-bold rounded-md text-[11px] font-mono">
                                      {res.grade}
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-3 text-[#4e6166] italic">{res.remarks || 'Pass'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ) : (
                      <div className="p-6 sm:p-8 bg-[#f6f8f7] rounded-2xl text-center border border-[#bac4c6]/60">
                        <BookOpen className="w-8 h-8 text-[#bac4c6] mx-auto mb-2" />
                        <p className="text-xs font-bold text-[#1f2a2e]">No Terminal Exam Results Recorded Yet</p>
                        <p className="text-xs text-[#4e6166] mt-1">Scores entered via the Results Terminal for any term or class are permanently retained and will display here.</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Quick Payment Entry Modal for Accountants */}
      <AnimatePresence>
        {selectedPaymentStudent && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-slate-900/60 backdrop-blur-sm print:hidden">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl w-full max-w-md overflow-hidden text-[#1f2a2e]"
            >
              <div className="p-4 sm:p-6 bg-[#f6f8f7] border-b border-[#ecf0ee] flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-base sm:text-lg font-bold text-[#1f2a2e]">Process Fee Payment</h3>
                  <p className="text-xs text-[#4e6166] font-medium truncate">{selectedPaymentStudent.firstName} {selectedPaymentStudent.lastName}</p>
                </div>
                <button 
                  type="button"
                  onClick={() => setSelectedPaymentStudent(null)}
                  className="text-[#4e6166] hover:text-[#1f2a2e] text-xs sm:text-sm font-bold cursor-pointer shrink-0"
                >
                  Cancel
                </button>
              </div>

              <form onSubmit={handleQuickPayment} className="p-4 sm:p-6 space-y-4">
                <div className="p-3.5 sm:p-4 bg-[#f0f5f7] border border-[#bcd3da] rounded-2xl flex justify-between items-center gap-3">
                  <div>
                    <span className="text-[10px] font-bold text-[#1c4a59] uppercase">Pending Balance</span>
                    <p className="text-base sm:text-lg font-black text-[#1f2a2e] mt-0.5 font-mono">
                      {formatCurrency(selectedPaymentStudent.totalFees - selectedPaymentStudent.feesPaid)}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] font-bold text-[#4e6166] uppercase">Total Billed</span>
                    <p className="text-xs sm:text-sm font-bold text-[#1f2a2e] font-mono">{formatCurrency(selectedPaymentStudent.totalFees)}</p>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#1f2a2e] uppercase">Payment Amount (GHS)</label>
                  <input 
                    type="number" 
                    required 
                    min="1"
                    placeholder="e.g. 500" 
                    value={paymentAmount || ''}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    className="w-full px-3.5 py-2.5 sm:px-4 sm:py-3 bg-white border border-[#bac4c6] rounded-xl focus:ring-2 focus:ring-[#059669] focus:outline-none font-bold text-base sm:text-lg text-[#1f2a2e]"
                  />
                </div>

                <button 
                  type="submit"
                  className="w-full bg-[#059669] text-white font-bold py-3 sm:py-3.5 rounded-xl hover:bg-[#047857] transition-all shadow-md flex items-center justify-center gap-2 text-xs sm:text-sm cursor-pointer"
                >
                  <CreditCard className="w-4 h-4 sm:w-5 sm:h-5" />
                  <span>Receive Payment</span>
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Print Friendly Receipt Modal */}
      <AnimatePresence>
        {isReceiptModalOpen && lastPayment && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-slate-900/60 backdrop-blur-sm print:p-0">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col print:shadow-none print:rounded-none text-[#1f2a2e]"
            >
              <div className="p-3.5 sm:p-4 border-b border-[#ecf0ee] bg-[#f6f8f7] flex items-center justify-between print:hidden">
                <span className="font-bold text-sm text-[#1f2a2e]">Payment Invoice Receipt</span>
                <button 
                  type="button"
                  onClick={() => setIsReceiptModalOpen(false)}
                  className="text-xs font-bold text-[#4e6166] hover:text-[#1f2a2e] cursor-pointer"
                >
                  Close
                </button>
              </div>

              {/* Printable Area */}
              <div id="quick-receipt-content" className="p-5 sm:p-8 space-y-5 sm:space-y-6">
                <div className="text-center space-y-1">
                  <h1 className="text-lg sm:text-xl font-black text-[#1f2a2e] uppercase tracking-tighter">{schoolName}</h1>
                  <p className="text-[10px] text-[#4e6166] font-bold uppercase tracking-widest">Official Fee Receipt</p>
                </div>

                <div className="border-t border-b border-dashed border-[#bac4c6] py-3.5 sm:py-4 space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-[#4e6166] font-semibold">Receipt Date:</span>
                    <span className="text-[#1f2a2e] font-bold">{new Date(lastPayment.date).toLocaleDateString()}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-[#4e6166] font-semibold">Transaction ID:</span>
                    <span className="text-[#1f2a2e] font-mono font-bold">TXN{Math.floor(lastPayment.date / 1000)}</span>
                  </div>
                </div>

                <div className="space-y-2.5 sm:space-y-3">
                  <p className="text-xs text-[#4e6166] font-bold uppercase tracking-wider">Payment Allocation</p>
                  <div className="bg-[#f6f8f7] border border-[#bac4c6]/60 p-3.5 sm:p-4 rounded-2xl space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-[#1f2a2e] font-bold">Amount Paid:</span>
                      <span className="text-[#065f46] font-black font-mono">{formatCurrency(lastPayment.amount)}</span>
                    </div>
                  </div>
                </div>

                <div className="text-center text-[10px] text-[#4e6166] pt-3.5 sm:pt-4 border-t border-[#ecf0ee]">
                  Thank you for your prompt payment.<br/>For inquiries contact treasury administration office.
                </div>
              </div>

              <div className="p-3.5 sm:p-4 bg-[#f6f8f7] border-t border-[#ecf0ee] flex gap-2.5 sm:gap-3 print:hidden">
                <button 
                  type="button"
                  onClick={() => exportToPDF('quick-receipt-content', 'Receipt_SchoolSphere')}
                  className="flex-1 py-2.5 px-3 bg-white border border-[#bac4c6] hover:bg-[#ecf0ee] rounded-xl text-xs font-bold text-[#1f2a2e] flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 shrink-0" />
                  <span>PDF Receipt</span>
                </button>
                <button 
                  type="button"
                  onClick={() => triggerPrint()}
                  className="flex-1 py-2.5 px-3 bg-[#1c4a59] hover:bg-[#163b47] rounded-xl text-xs font-bold text-white flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5 shrink-0" />
                  <span>Print Receipt</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Student Promotion Modal */}
      <AnimatePresence>
        {isPromotionModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-slate-900/50 backdrop-blur-sm overflow-y-auto">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden max-h-[92vh] flex flex-col text-[#1f2a2e]"
            >
              <div className="p-4 sm:p-6 border-b border-[#ecf0ee] flex items-center justify-between gap-3 shrink-0 bg-[#f6f8f7]">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="p-2 bg-[#ecfdf5] text-[#065f46] border border-[#a7f3d0] rounded-xl shrink-0">
                    <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-base sm:text-lg font-bold text-[#1f2a2e] leading-tight">Promote Students to Next Class</h3>
                    <p className="text-[11px] sm:text-xs text-[#4e6166] font-medium truncate">Batch move students and configure new term fees</p>
                  </div>
                </div>
                <button 
                  type="button"
                  onClick={() => {
                    setIsPromotionModalOpen(false);
                    setPromoSourceClass('');
                    setPromoDestClass('');
                    setPromoSelectedStudentIds([]);
                  }}
                  className="p-1.5 text-[#4e6166] hover:text-[#1f2a2e] rounded-lg hover:bg-[#ecf0ee] transition-colors shrink-0 cursor-pointer"
                >
                  <Plus className="w-5 h-5 sm:w-6 sm:h-6 rotate-45" />
                </button>
              </div>

              <form onSubmit={handlePromotionSubmit} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
                {/* Academic Year Timing Alert */}
                {academicConfig.currentTerm !== 'Term 3' ? (
                  <div className="p-3.5 sm:p-4 bg-[#fdf8f0] border border-[#e1c594] rounded-2xl flex gap-2.5 sm:gap-3">
                    <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-[#807654] shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p className="text-xs sm:text-sm font-bold text-[#1f2a2e] leading-snug">
                        Early Academic Year Promotion Notice
                      </p>
                      <p className="text-xs text-[#4e6166] font-medium leading-relaxed">
                        Promotion is designed for the end of the academic year (typically <strong>Term 3</strong>). 
                        The current active school period is configured as <strong>{academicConfig.currentTerm}</strong> of the <strong>{academicConfig.academicYear || '2025/2026'}</strong> academic year.
                        Please verify that you intend to promote students mid-session.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="p-3.5 sm:p-4 bg-[#ecfdf5] border border-[#a7f3d0] rounded-2xl flex gap-2.5 sm:gap-3">
                    <ShieldCheck className="w-4 h-4 sm:w-5 sm:h-5 text-[#065f46] shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p className="text-xs sm:text-sm font-bold text-[#065f46] leading-snug">
                        End of Academic Year Reached ({academicConfig.academicYear})
                      </p>
                      <p className="text-xs text-[#065f46]/90 font-medium leading-relaxed">
                        You are performing end-of-year student promotions. This batch operation moves students to their next class registers and prepares their bills for the upcoming academic year.
                      </p>
                    </div>
                  </div>
                )}

                {/* Class Selection Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 sm:gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-black text-[#4e6166] uppercase tracking-widest">Source Class (Current)</label>
                    <select 
                      required
                      value={promoSourceClass}
                      onChange={e => setPromoSourceClass(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-[#f6f8f7] border border-[#bac4c6] rounded-xl outline-none focus:border-[#1c4a59] focus:bg-white transition-all text-xs sm:text-sm font-bold text-[#1f2a2e]"
                    >
                      <option value="">-- Select Class --</option>
                      {classes?.map(c => (
                        <option key={c.id} value={c.name}>{c.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-black text-[#4e6166] uppercase tracking-widest">Destination Class (Next)</label>
                    <select 
                      required
                      value={promoDestClass}
                      onChange={e => setPromoDestClass(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-[#f6f8f7] border border-[#bac4c6] rounded-xl outline-none focus:border-[#1c4a59] focus:bg-white transition-all text-xs sm:text-sm font-bold text-[#1f2a2e]"
                    >
                      <option value="">-- Select Class --</option>
                      {classes?.map(c => (
                        <option key={c.id} value={c.name} disabled={c.name === promoSourceClass}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Safe Transition Guarantee Notice */}
                <div className="p-3 sm:p-3.5 bg-[#ecfdf5] border border-[#a7f3d0] rounded-2xl flex items-start gap-2.5 sm:gap-3">
                  <ShieldCheck className="w-4 h-4 sm:w-5 sm:h-5 text-[#065f46] shrink-0 mt-0.5" />
                  <div className="text-xs text-[#065f46] space-y-0.5">
                    <p className="font-bold">Permanent Historical Data Guarantee</p>
                    <p className="text-[#065f46]/90 leading-relaxed">
                      Promoting students moves their active enrollment to the next class. All previous terminal exam results, attendance logs, and past fee records are permanently retained in the database.
                    </p>
                  </div>
                </div>

                {/* Promotion Configurations */}
                <div className="bg-[#f6f8f7] p-3.5 sm:p-4 rounded-2xl border border-[#bac4c6]/70 space-y-3.5 sm:space-y-4">
                  <p className="text-[11px] font-black text-[#1c4a59] uppercase tracking-widest">Promotion & Year Configurations</p>
                  
                  <label className="flex items-start gap-3 cursor-pointer select-none">
                    <input 
                      type="checkbox" 
                      checked={promoResetFees}
                      onChange={e => setPromoResetFees(e.target.checked)}
                      className="w-4 h-4 text-[#059669] border-[#bac4c6] rounded focus:ring-[#059669] mt-0.5 accent-[#059669] shrink-0"
                    />
                    <div>
                      <p className="text-xs sm:text-sm font-bold text-[#1f2a2e] leading-snug">Start New Session with Fresh GHS 0.00 Active Balance</p>
                      <p className="text-[11px] sm:text-xs text-[#4e6166] mt-0.5">Safely archives previous class payment totals in student history and starts a fresh ledger for the new class.</p>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 cursor-pointer select-none">
                    <input 
                      type="checkbox" 
                      checked={promoApplyNewDefaults}
                      onChange={e => setPromoApplyNewDefaults(e.target.checked)}
                      className="w-4 h-4 text-[#059669] border-[#bac4c6] rounded focus:ring-[#059669] mt-0.5 accent-[#059669] shrink-0"
                    />
                    <div>
                      <p className="text-xs sm:text-sm font-bold text-[#1f2a2e] leading-snug">Apply Default Fees of Destination Class</p>
                      <p className="text-[11px] sm:text-xs text-[#4e6166] mt-0.5">Recalculates student bills automatically based on active default fee configurations of the new class.</p>
                    </div>
                  </label>

                  <div className="pt-2.5 border-t border-[#bac4c6]/50 space-y-3">
                    <label className="flex items-start gap-3 cursor-pointer select-none">
                      <input 
                        type="checkbox" 
                        checked={promoRolloverYear}
                        onChange={e => setPromoRolloverYear(e.target.checked)}
                        className="w-4 h-4 text-[#059669] border-[#bac4c6] rounded focus:ring-[#059669] mt-0.5 accent-[#059669] shrink-0"
                      />
                      <div>
                        <p className="text-xs sm:text-sm font-bold text-[#1f2a2e] leading-snug">Roll over School Academic Year</p>
                        <p className="text-[11px] sm:text-xs text-[#4e6166] mt-0.5">Increment the school's global calendar year and set current term back to Term 1.</p>
                      </div>
                    </label>

                    {promoRolloverYear && (
                      <motion.div 
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="pl-7 space-y-1.5"
                      >
                        <label className="block text-[11px] font-black text-[#4e6166] uppercase tracking-wider">New Academic Year Period</label>
                        <input 
                          type="text"
                          required={promoRolloverYear}
                          placeholder="e.g. 2026/2027"
                          value={promoNextYearVal}
                          onChange={e => setPromoNextYearVal(e.target.value)}
                          className="w-full sm:max-w-xs px-3 py-1.5 bg-white border border-[#bac4c6] rounded-lg outline-none focus:border-[#1c4a59] text-sm font-bold text-[#1f2a2e]"
                        />
                        <p className="text-[10px] text-[#4e6166] font-medium">This will automatically transition active terminals, report cards, and logs to Term 1 of the new academic period.</p>
                      </motion.div>
                    )}
                  </div>
                </div>

                {/* Selected Students List */}
                {promoSourceClass ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-[11px] font-black text-[#4e6166] uppercase tracking-widest">
                        Students in {promoSourceClass} ({promoSourceStudents.length})
                      </label>
                      <div className="flex gap-2 shrink-0">
                        <button 
                          type="button"
                          onClick={() => setPromoSelectedStudentIds(promoSourceStudents.map(s => s.id).filter((id): id is number => id !== undefined))}
                          className="text-[11px] font-bold text-[#1c4a59] hover:underline cursor-pointer"
                        >
                          Select All
                        </button>
                        <span className="text-[11px] text-[#bac4c6] font-bold">|</span>
                        <button 
                          type="button"
                          onClick={() => setPromoSelectedStudentIds([])}
                          className="text-[11px] font-bold text-[#9f1239] hover:underline cursor-pointer"
                        >
                          Deselect All
                        </button>
                      </div>
                    </div>

                    {promoSourceStudents.length > 0 ? (
                      <div className="max-h-[180px] overflow-y-auto border border-[#bac4c6]/80 rounded-xl divide-y divide-[#ecf0ee] bg-white">
                        {promoSourceStudents.map(student => {
                          const isSelected = promoSelectedStudentIds.includes(student.id!);
                          return (
                            <label 
                              key={student.id} 
                              className="flex items-center justify-between gap-2 p-2.5 sm:p-3 hover:bg-[#f6f8f7] cursor-pointer transition-colors"
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <input 
                                  type="checkbox" 
                                  checked={isSelected}
                                  onChange={() => {
                                    if (isSelected) {
                                      setPromoSelectedStudentIds(promoSelectedStudentIds.filter(id => id !== student.id));
                                    } else {
                                      setPromoSelectedStudentIds([...promoSelectedStudentIds, student.id!]);
                                    }
                                  }}
                                  className="w-4 h-4 text-[#059669] border-[#bac4c6] rounded focus:ring-[#059669] accent-[#059669] shrink-0"
                                />
                                <span className="text-xs sm:text-sm font-bold text-[#1f2a2e] truncate">
                                  {student.firstName} {student.lastName}
                                </span>
                              </div>
                              <span className="font-mono text-xs text-[#1c4a59] bg-[#f0f5f7] px-2 py-0.5 rounded border border-[#bcd3da] font-bold shrink-0">
                                {student.studentId}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-center text-xs text-[#4e6166] py-6 italic bg-[#f6f8f7] rounded-xl border border-dashed border-[#bac4c6]">
                        No students found registered in {promoSourceClass}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="p-6 sm:p-8 text-center bg-[#f6f8f7] border border-dashed border-[#bac4c6] rounded-2xl">
                    <Users className="w-8 h-8 text-[#bac4c6] mx-auto mb-2" />
                    <p className="text-xs font-semibold text-[#4e6166]">Select a source class to view and choose students for promotion</p>
                  </div>
                )}

                {/* Form Action Buttons */}
                <div className="flex flex-col-reverse sm:flex-row gap-2.5 sm:gap-3 pt-2">
                  <button 
                    type="button"
                    onClick={() => {
                      setIsPromotionModalOpen(false);
                      setPromoSourceClass('');
                      setPromoDestClass('');
                      setPromoSelectedStudentIds([]);
                    }}
                    className="flex-1 py-2.5 sm:py-3 bg-white border border-[#bac4c6] hover:bg-[#f6f8f7] rounded-xl text-xs sm:text-sm font-bold text-[#1f2a2e] transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    disabled={!promoSourceClass || !promoDestClass || promoSelectedStudentIds.length === 0}
                    className="flex-1 py-2.5 sm:py-3 bg-[#059669] hover:bg-[#047857] disabled:bg-[#ecf0ee] disabled:text-[#6a7f84] disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 text-xs sm:text-sm cursor-pointer"
                  >
                    <Check className="w-4 h-4" />
                    <span>Promote Selected</span>
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
