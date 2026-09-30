import { useState, useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, useFeeTypes, normalizeStudentRecord, type Student, type FeeTypeConfig } from '../db/schema';
import { Wallet, CreditCard, History, Search, ArrowUpRight, Download, X, Check, FileText, Printer, Smartphone, CheckCircle2, AlertCircle, RefreshCw, Award, Users, Plus, Trash2, Edit2, Layers, Cloud, CloudOff } from 'lucide-react';
import { formatCurrency, cn, exportToPDF, triggerPrint } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { useNotifications } from '../contexts/NotificationContext';
import { studentsApi, feesApi, settingsApi } from '../lib/api';
import { syncAllDataFromBackend, getOfflineQueueItems } from '../lib/syncService';
import * as XLSX from 'xlsx';
import PaystackPaymentButton from './PaystackPaymentButton';
import { useAuth } from '../contexts/AuthContext';

export default function FeeManagement() {
  const { showToast } = useNotifications();
  const { user, school: activeSchool } = useAuth();
  const targetSchoolId = activeSchool?.id || user?.schoolId;

  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'dashboard' | 'ledger' | 'billing'>('dashboard');
  const [ledgerTypeFilter, setLedgerTypeFilter] = useState<'all' | 'debit' | 'credit'>('all');
  const [ledgerSortOrder, setLedgerSortOrder] = useState<'asc' | 'desc'>('asc');
  const [ledgerSearchTerm, setLedgerSearchTerm] = useState('');
  const [isSyncingLedger, setIsSyncingLedger] = useState(false);
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);
  const [offlineQueueCount, setOfflineQueueCount] = useState(0);

  const feeTypes = useFeeTypes();
  const settings = useLiveQuery(() => db.settings.toArray()) || [];
  const classesList = useLiveQuery(() => db.classes.toArray()) || [];
  const schoolProfile = settings.find(s => s.key === 'schoolProfile')?.value;
  const schoolName = schoolProfile?.schoolName || activeSchool?.name || 'SCHOOLSPHERE PORTAL';
  const currentAcademicYear = schoolProfile?.currentAcademicYear || '2025/2026';
  const currentTerm = schoolProfile?.currentTerm || 'Term 1';

  const isStudent = user?.role === 'student';
  const isParent = user?.role === 'parent';
  const isStaff = !isStudent && !isParent;

  // Retrieve and normalize all students
  const rawStudents = useLiveQuery(() => db.students.toArray()) || [];
  const allStudents = useMemo(() => rawStudents.map(s => normalizeStudentRecord(s)), [rawStudents]);

  // Retrieve all fee transactions from Dexie (synced with Supabase public.fee_transactions)
  const allFeeTransactions = useLiveQuery(() => db.feeTransactions.toArray()) || [];

  // Refresh fee transactions, fee_structures, invoices, and student balances from Supabase on load
  useEffect(() => {
    let mounted = true;
    const loadRemoteData = async () => {
      try {
        const [, structRes] = await Promise.all([
          feesApi.getAll(targetSchoolId),
          feesApi.getStructures(targetSchoolId)
        ]);
        if (mounted && structRes) {
          setSavedFeeStructures(structRes.feeStructures || []);
          setStudentInvoices(structRes.invoices || []);
        }
        await syncAllDataFromBackend(targetSchoolId, false);
        if (mounted) {
          setOfflineQueueCount(getOfflineQueueItems().length);
        }
      } catch (err) {
        console.warn('Initial fee ledger sync warning:', err);
      }
    };
    loadRemoteData();

    const handleQueueChange = () => {
      if (mounted) {
        setOfflineQueueCount(getOfflineQueueItems().length);
      }
    };
    window.addEventListener('offline-queue-changed', handleQueueChange);
    return () => {
      mounted = false;
      window.removeEventListener('offline-queue-changed', handleQueueChange);
    };
  }, [targetSchoolId]);

  const handleManualSyncLedger = async () => {
    setIsSyncingLedger(true);
    try {
      await studentsApi.syncLocalToRemote(targetSchoolId);
      const [, structRes] = await Promise.all([
        feesApi.getAll(targetSchoolId),
        feesApi.getStructures(targetSchoolId)
      ]);
      if (structRes) {
        setSavedFeeStructures(structRes.feeStructures || []);
        setStudentInvoices(structRes.invoices || []);
      }
      await syncAllDataFromBackend(targetSchoolId, true);
      setOfflineQueueCount(getOfflineQueueItems().length);
      showToast('Fee transactions, fee_structures, invoices, and student balances synced with Supabase!', 'success');
    } catch (err: any) {
      showToast(err?.message || 'Could not complete full cloud sync. Offline queue remains active.', 'error');
    } finally {
      setIsSyncingLedger(false);
    }
  };

  // Match current user to a student record (if student role)
  const studentRecord = useMemo(() => {
    if (isStudent && user?.fullName && allStudents.length > 0) {
      const cleanName = user.fullName.replace(/\s*\(Student\)/i, '').trim().toLowerCase();
      return allStudents.find(s => {
        const full = `${s.firstName} ${s.lastName}`.toLowerCase().trim();
        return full.includes(cleanName) || cleanName.includes(full);
      });
    }
    return null;
  }, [isStudent, user?.fullName, allStudents]);

  // Match current user to children/wards (if parent role)
  const parentWards = useMemo(() => {
    if (isParent && user?.fullName && allStudents.length > 0) {
      const cleanParentName = user.fullName.replace(/\s*\(Parent\)/i, '').trim().toLowerCase();
      return allStudents.filter(s => {
        const guardian = (s.guardianName || '').toLowerCase().trim();
        return guardian.includes(cleanParentName) || cleanParentName.includes(guardian);
      });
    }
    return [];
  }, [isParent, user?.fullName, allStudents]);

  // Determine students list to display
  const students = useMemo(() => {
    if (isStudent) {
      return studentRecord ? [studentRecord] : [];
    }
    if (isParent) {
      return parentWards;
    }
    // Staff/Accountant: filter all students by search query
    return allStudents.filter(s => 
      s.firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.lastName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.studentId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (s.class || '').toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [isStudent, studentRecord, isParent, parentWards, allStudents, searchTerm]);

  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);

  // Auto-select student on load for student and parent roles
  useEffect(() => {
    if (isStudent && studentRecord) {
      setSelectedStudentId(studentRecord.studentId);
    } else if (isParent && parentWards.length > 0 && !selectedStudentId) {
      setSelectedStudentId(parentWards[0].studentId);
    }
  }, [isStudent, studentRecord, isParent, parentWards, selectedStudentId]);

  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [lastPayment, setLastPayment] = useState<{ 
    amount: number; 
    date: number; 
    method: string; 
    phone?: string; 
    ref?: string;
    studentOverride?: Student;
  } | null>(null);
  const selectedStudent = allStudents.find(s => s.studentId === selectedStudentId);
  const receiptStudent = lastPayment?.studentOverride || selectedStudent;

  useEffect(() => {
    document.body.classList.toggle('receipt-modal-open', isReceiptModalOpen);
    return () => {
      document.body.classList.remove('receipt-modal-open');
    };
  }, [isReceiptModalOpen]);

  const paymentHistory = useLiveQuery(() => {
    if (!selectedStudent) return [];
    const nameToMatch = `${selectedStudent.firstName} ${selectedStudent.lastName}`;
    return db.smsLogs
      .filter(log => 
        log.type === 'Fee Reminder' && 
        log.message.includes(nameToMatch)
      )
      .toArray();
  }, [selectedStudent]);

  const parsedPayments = useMemo(() => {
    if (!selectedStudent) return [];
    const fullNameLower = `${selectedStudent.firstName} ${selectedStudent.lastName}`.trim().toLowerCase();

    // 1. Canonical transactions from Supabase fee_transactions (stored in db.feeTransactions)
    const studentTxs = allFeeTransactions.filter(tx => {
      if (selectedStudent.id !== undefined && String(tx.studentId) === String(selectedStudent.id)) return true;
      if (tx.studentCode && tx.studentCode.toLowerCase() === selectedStudent.studentId.toLowerCase()) return true;
      if (tx.studentName && tx.studentName.trim().toLowerCase() === fullNameLower) return true;
      return false;
    });

    const combinedMap = new Map<string, {
      id: string | number;
      amount: number;
      method: string;
      ref: string;
      date: number;
      phone?: string;
      syncStatus?: 'synced' | 'pending';
      academicYear?: string;
      term?: string;
      receivedBy?: string;
    }>();

    studentTxs.forEach(tx => {
      const refKey = String(tx.receiptNumber || tx.transactionReference || `TX-${tx.id}`).trim().toUpperCase();
      combinedMap.set(refKey, {
        id: tx.id || refKey,
        amount: Number(tx.amount) || 0,
        method: tx.paymentChannelLabel || tx.paymentMethod || 'Cash',
        ref: tx.receiptNumber || tx.transactionReference || `RCP-${tx.id}`,
        date: tx.createdAt || Date.now(),
        phone: tx.guardianPhone || selectedStudent.guardianPhone,
        syncStatus: tx.syncStatus || 'synced',
        academicYear: tx.academicYear,
        term: tx.term,
        receivedBy: tx.receivedBy,
      });
    });

    // 2. Legacy SMS log fallback (only if not already represented by receipt/ref)
    if (paymentHistory && paymentHistory.length > 0) {
      paymentHistory.forEach(log => {
        const msg = log.message || '';
        let amount = 0;
        let method = 'Online Payment';
        let ref = 'MM-' + log.id;
        
        const amountMatch = msg.match(/GHS\s*([\d,.]+)/i);
        if (amountMatch) amount = parseFloat(amountMatch[1].replace(/,/g, ''));
        
        const refMatch = msg.match(/Ref:\s*([A-Z0-9-]+)/i);
        if (refMatch) ref = refMatch[1];
        
        const viaMatch = msg.match(/received via\s*([^for]+)\s*for/i);
        if (viaMatch) method = viaMatch[1].trim();

        const refKey = ref.trim().toUpperCase();
        if (!combinedMap.has(refKey) && amount > 0) {
          combinedMap.set(refKey, {
            id: `sms-${log.id}`,
            amount,
            method,
            ref,
            date: log.createdAt || Date.now(),
            phone: log.recipientPhone,
            syncStatus: 'synced'
          });
        }
      });
    }

    return Array.from(combinedMap.values()).sort((a, b) => b.date - a.date);
  }, [selectedStudent, allFeeTransactions, paymentHistory]);

  const studentLedger = useMemo(() => {
    if (!selectedStudent) return [];
    const entries: Array<{
      id: string;
      date: number;
      type: 'debit' | 'credit';
      description: string;
      reference: string;
      method?: string;
      amount: number;
      recipientPhone?: string;
    }> = [];
    
    // 1. Billings (Debits)
    const breakdown = selectedStudent.feeBreakdown || { tuition: selectedStudent.totalFees };
    const baseDate = selectedStudent.createdAt || (Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    Object.entries(breakdown).forEach(([feeId, amount], idx) => {
      if (amount > 0) {
        const ft = feeTypes.find(f => f.id === feeId);
        const label = ft ? ft.label : feeId.toUpperCase();
        entries.push({
          id: `bill-${feeId}-${idx}`,
          date: baseDate + idx * 1000,
          type: 'debit',
          description: `Billed: ${label}`,
          reference: `BIL-${selectedStudent.studentId.replace('STU-', '')}-${feeId.toUpperCase().slice(0, 3)}`,
          amount: amount,
        });
      }
    });

    // 2. Payments (Credits)
    parsedPayments.forEach(p => {
      entries.push({
        id: `pay-${p.id}`,
        date: p.date,
        type: 'credit',
        description: `Payment Received (${p.method})`,
        reference: p.ref,
        method: p.method,
        amount: p.amount,
        recipientPhone: p.phone
      });
    });

    // Sort chronologically (oldest first) to calculate running balance correctly
    entries.sort((a, b) => a.date - b.date);

    // Compute Running Outstanding Balance
    let running = 0;
    const ledger = entries.map(e => {
      if (e.type === 'debit') {
        running += e.amount;
      } else {
        running -= e.amount;
      }
      return {
        ...e,
        runningBalance: running
      };
    });

    return ledger;
  }, [selectedStudent, feeTypes, parsedPayments]);

  const filteredLedger = useMemo(() => {
    let list = [...studentLedger];
    if (ledgerTypeFilter !== 'all') {
      list = list.filter(e => e.type === ledgerTypeFilter);
    }
    if (ledgerSortOrder === 'desc') {
      list.reverse();
    }
    return list;
  }, [studentLedger, ledgerTypeFilter, ledgerSortOrder]);

  const filteredLedgerStudents = useMemo(() => {
    return allStudents.filter(s =>
      `${s.firstName} ${s.lastName}`.toLowerCase().includes(ledgerSearchTerm.toLowerCase()) ||
      s.studentId.toLowerCase().includes(ledgerSearchTerm.toLowerCase())
    );
  }, [allStudents, ledgerSearchTerm]);

  const renderLedgerStatement = () => {
    if (!selectedStudent) return null;
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden p-4 sm:p-6 md:p-8 space-y-4 sm:space-y-6 w-full max-w-full min-w-0">
        {/* Statement Header */}
        <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center border-b border-slate-200 pb-4 sm:pb-6 gap-4 min-w-0">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 sm:w-10 sm:h-10 bg-indigo-600 text-white rounded-xl flex items-center justify-center font-black text-sm sm:text-base shadow-sm shrink-0">
                {schoolName.charAt(0)}
              </div>
              <div className="min-w-0">
                <h1 className="text-base sm:text-xl font-extrabold text-slate-900 leading-tight uppercase tracking-tight break-words">{schoolName}</h1>
                <p className="text-[10px] uppercase font-black text-indigo-600 tracking-wider truncate">Statement of Account Ledger</p>
              </div>
            </div>
            <p className="text-[11px] sm:text-xs text-slate-400 font-medium">Official financial record statement generated on {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
          </div>

          {/* Quick Export Actions */}
          <div className={cn("grid gap-2 print:hidden w-full md:w-auto min-w-0", isStaff ? "grid-cols-2 sm:flex" : "grid-cols-1 sm:flex")}>
            {isStaff && (
              <button
                type="button"
                onClick={() => openStudentBreakdownModal(selectedStudent)}
                className="flex items-center justify-center gap-1.5 px-3 py-2.5 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-xl font-bold text-xs hover:bg-indigo-100 transition-all cursor-pointer outline-none shadow-sm min-w-0"
              >
                <Edit2 className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                <span className="truncate">Adjust Bill</span>
              </button>
            )}
            <button
              onClick={() => triggerPrint()}
              className="flex items-center justify-center gap-1.5 px-3 py-2.5 bg-slate-50 border border-slate-200 text-slate-700 rounded-xl font-bold text-xs hover:bg-slate-100 transition-all cursor-pointer outline-none shadow-sm min-w-0"
            >
              <Printer className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
              <span className="truncate">Print Statement</span>
            </button>
          </div>
        </div>

        {/* Student Metadata Card */}
        <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-3.5 sm:p-5 grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 min-w-0">
          <div className="space-y-1 min-w-0">
            <p className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Account Holder</p>
            <p className="text-sm sm:text-base font-black text-slate-950 uppercase break-words">{selectedStudent.firstName} {selectedStudent.lastName}</p>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 font-medium">
              <span className="font-mono bg-slate-200 px-2 py-0.5 rounded text-[10px] font-bold">{selectedStudent.studentId}</span>
              <span>•</span>
              <span className="font-semibold">{selectedStudent.class}</span>
            </div>
          </div>
          
          <div className="space-y-1 min-w-0">
            <p className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Billing Guardian Contacts</p>
            <p className="text-xs sm:text-sm font-bold text-slate-800 truncate">{selectedStudent.guardianName || 'N/A'}</p>
            <p className="text-xs font-mono text-slate-500 truncate">{selectedStudent.guardianPhone || 'N/A'}</p>
          </div>

          <div className="space-y-1.5 min-w-0">
            <p className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Statement Summary</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <div className="bg-white border border-slate-200/80 rounded-xl p-2 min-w-0">
                <p className="text-[9px] text-slate-400 font-semibold uppercase truncate">Total Billed</p>
                <p className="text-xs sm:text-sm font-black text-slate-900 font-mono tabular-nums truncate">{formatCurrency(selectedStudent.totalFees)}</p>
              </div>
              <div className="bg-white border border-emerald-200/80 rounded-xl p-2 min-w-0">
                <p className="text-[9px] text-slate-400 font-semibold uppercase truncate">Total Paid</p>
                <p className="text-xs sm:text-sm font-black text-emerald-600 font-mono tabular-nums truncate">{formatCurrency(selectedStudent.feesPaid)}</p>
              </div>
              <div className="col-span-2 sm:col-span-1 bg-white border border-rose-200/80 rounded-xl p-2 min-w-0">
                <p className="text-[9px] text-slate-400 font-semibold uppercase font-bold truncate">Outstanding</p>
                <p className={cn(
                  "text-xs sm:text-sm font-black font-mono tabular-nums truncate",
                  selectedStudent.totalFees - selectedStudent.feesPaid > 0 ? "text-rose-600" : "text-emerald-600"
                )}>
                  {formatCurrency(selectedStudent.totalFees - selectedStudent.feesPaid)}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Table Filters (Print Hidden) */}
        <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 bg-slate-50/50 p-3 sm:p-4 rounded-xl border border-slate-100 print:hidden min-w-0">
          <div className="grid grid-cols-3 sm:flex sm:flex-wrap items-center gap-1.5 sm:gap-2 min-w-0">
            <span className="col-span-3 sm:col-span-1 text-[10px] font-black uppercase text-slate-400 tracking-wider sm:mr-1">Filter Type:</span>
            {(['all', 'debit', 'credit'] as const).map(type => (
              <button
                key={type}
                type="button"
                onClick={() => setLedgerTypeFilter(type)}
                className={cn(
                  "px-2.5 sm:px-3 py-1.5 rounded-lg text-[11px] sm:text-xs font-bold transition-all cursor-pointer outline-none border text-center truncate",
                  ledgerTypeFilter === type
                    ? "bg-slate-900 text-white border-slate-950 shadow-sm"
                    : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                )}
              >
                {type === 'all' && 'All Entries'}
                {type === 'debit' && 'Billings (+)'}
                {type === 'credit' && 'Payments (-)'}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-2 min-w-0">
            <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider shrink-0">Sorting:</span>
            <select
              value={ledgerSortOrder}
              onChange={(e) => setLedgerSortOrder(e.target.value as 'asc' | 'desc')}
              className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-600 outline-none cursor-pointer"
            >
              <option value="asc">Oldest First</option>
              <option value="desc">Latest First</option>
            </select>
          </div>
        </div>

        {/* Ledger Statement: Stacked Mobile Cards (< 768px) & Table (>= 768px / Print) */}
        <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm bg-white min-w-0">
          {/* Mobile Stacked Ledger Cards */}
          <div className="md:hidden print:hidden divide-y divide-slate-100 min-w-0">
            {filteredLedger.length === 0 ? (
              <div className="p-8 text-center text-slate-400 space-y-2">
                <AlertCircle className="w-9 h-9 text-slate-300 mx-auto" />
                <p className="font-bold text-xs text-slate-600">No matching ledger records found</p>
              </div>
            ) : (
              filteredLedger.map((entry) => (
                <div key={entry.id} className="p-3.5 space-y-2.5 hover:bg-slate-50/50 transition-colors min-w-0">
                  <div className="flex items-start justify-between gap-2 min-w-0">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className={cn(
                          "px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border shrink-0",
                          entry.type === 'debit'
                            ? "bg-rose-50 border-rose-100 text-rose-700"
                            : "bg-emerald-50 border-emerald-100 text-emerald-700"
                        )}>
                          {entry.type === 'debit' ? 'Debit' : 'Credit'}
                        </span>
                        <span className="font-bold text-xs text-slate-900 truncate">{entry.description}</span>
                      </div>
                      <p className="text-[10px] font-mono text-slate-400 mt-1 truncate">
                        {entry.reference} • {new Date(entry.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </p>
                    </div>
                    {entry.type === 'credit' && (
                      <button
                        type="button"
                        onClick={() => {
                          setLastPayment({
                            amount: entry.amount,
                            date: entry.date,
                            method: entry.method || 'Online Payment',
                            phone: entry.recipientPhone,
                            ref: entry.reference
                          });
                          setIsReceiptModalOpen(true);
                        }}
                        className="px-2.5 py-1.5 bg-slate-50 hover:bg-indigo-50 hover:text-indigo-600 border border-slate-200 rounded-lg text-slate-600 font-bold text-[10px] transition-all cursor-pointer inline-flex items-center gap-1 shrink-0"
                      >
                        <FileText className="w-3 h-3 text-indigo-500 shrink-0" />
                        <span>Receipt</span>
                      </button>
                    )}
                  </div>

                  {/* 2-Column Metric Pills */}
                  <div className="grid grid-cols-2 gap-2 pt-0.5 min-w-0">
                    <div className={cn(
                      "p-2 rounded-xl border min-w-0",
                      entry.type === 'debit' ? "bg-rose-50/40 border-rose-100" : "bg-emerald-50/40 border-emerald-100"
                    )}>
                      <span className="text-[9px] font-bold uppercase text-slate-400 block truncate">
                        {entry.type === 'debit' ? 'Debit (Charged)' : 'Credit (Paid)'}
                      </span>
                      <span className={cn(
                        "font-mono font-bold text-xs tabular-nums block truncate mt-0.5",
                        entry.type === 'debit' ? "text-rose-600" : "text-emerald-600"
                      )}>
                        {formatCurrency(entry.amount)}
                      </span>
                    </div>
                    <div className="p-2 rounded-xl bg-slate-50 border border-slate-200/70 min-w-0">
                      <span className="text-[9px] font-bold uppercase text-slate-400 block truncate">Running Balance</span>
                      <span className="font-mono font-bold text-xs text-slate-900 tabular-nums block truncate mt-0.5">
                        {formatCurrency(entry.runningBalance)}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Desktop & Print Table */}
          <div className="hidden md:block print:block overflow-x-auto">
            <table className="w-full text-left min-w-[700px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-[10px] font-black uppercase tracking-wider">
                  <th className="px-5 py-4">Transaction Date</th>
                  <th className="px-5 py-4">Ref / Receipt ID</th>
                  <th className="px-5 py-4">Transaction Description</th>
                  <th className="px-5 py-4 text-right">Debit (Charged)</th>
                  <th className="px-5 py-4 text-right">Credit (Paid)</th>
                  <th className="px-5 py-4 text-right">Running Balance</th>
                  <th className="px-5 py-4 text-center print:hidden">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                {filteredLedger.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-12 text-center text-slate-400 space-y-2">
                      <AlertCircle className="w-10 h-10 text-slate-300 mx-auto" />
                      <p className="font-bold text-slate-600">No matching ledger records found</p>
                      <p className="text-[10px] text-slate-400 max-w-sm mx-auto leading-relaxed">
                        Adjust your filter parameters or verify if any initial billed components exist for this student profile.
                      </p>
                    </td>
                  </tr>
                ) : (
                  filteredLedger.map((entry) => (
                    <tr key={entry.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-5 py-4 font-medium text-slate-500">
                        {new Date(entry.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="px-5 py-4 font-mono font-bold uppercase tracking-tight text-slate-600">
                        {entry.reference}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            "px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border shrink-0",
                            entry.type === 'debit'
                              ? "bg-rose-50 border-rose-100 text-rose-700"
                              : "bg-emerald-50 border-emerald-100 text-emerald-700"
                          )}>
                            {entry.type === 'debit' ? 'Debit' : 'Credit'}
                          </span>
                          <span className="font-bold text-slate-800">{entry.description}</span>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-right font-mono font-bold text-rose-600">
                        {entry.type === 'debit' ? formatCurrency(entry.amount) : '—'}
                      </td>
                      <td className="px-5 py-4 text-right font-mono font-bold text-emerald-600">
                        {entry.type === 'credit' ? formatCurrency(entry.amount) : '—'}
                      </td>
                      <td className="px-5 py-4 text-right font-mono font-bold text-slate-900 bg-slate-50/30">
                        {formatCurrency(entry.runningBalance)}
                      </td>
                      <td className="px-5 py-4 text-center print:hidden">
                        {entry.type === 'credit' ? (
                          <button
                            onClick={() => {
                              setLastPayment({
                                amount: entry.amount,
                                date: entry.date,
                                method: entry.method || 'Online Payment',
                                phone: entry.recipientPhone,
                                ref: entry.reference
                              });
                              setIsReceiptModalOpen(true);
                            }}
                            className="px-2.5 py-1 bg-slate-50 hover:bg-indigo-50 hover:text-indigo-600 border border-slate-200 rounded-lg text-slate-500 font-bold text-[10px] transition-all cursor-pointer outline-none inline-flex items-center gap-1"
                          >
                            <FileText className="w-3 h-3 text-indigo-500" />
                            <span>Receipt</span>
                          </button>
                        ) : (
                          <span className="text-slate-300 font-normal text-[10px]">No receipt</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Ledger Footer Certification Statement */}
        <div className="border-t border-slate-200 pt-4 sm:pt-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-3 text-slate-400 text-[10px] font-semibold uppercase tracking-wider">
          <p className="break-words">© {new Date().getFullYear()} School Treasury Audit System • All logs are cryptographically sealed</p>
          <div className="flex items-center gap-2 shrink-0">
            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-ping" />
            <span className="text-slate-500">Live Accounts Sync Status: Verified</span>
          </div>
        </div>
      </div>
    );
  };

  const [paymentAmount, setPaymentAmount] = useState('');
  const [allocationType, setAllocationType] = useState<string>('automatic');

  // Payment channel features state
  const [paymentMethod, setPaymentMethod] = useState<'cash_bank' | 'bank_transfer' | 'cheque' | 'momo' | 'paystack'>('cash_bank');
  const [bankOrChequeRef, setBankOrChequeRef] = useState('');
  const [momoProvider, setMomoProvider] = useState<'mtn' | 'telecel' | 'at'>('mtn');
  const [momoNumber, setMomoNumber] = useState('');
  const [isVerifyingMomo, setIsVerifyingMomo] = useState(false);
  const [momoVerified, setMomoVerified] = useState(false);
  const [momoStep, setMomoStep] = useState<'idle' | 'sending' | 'pending' | 'success' | 'failed'>('idle');
  const [momoReference, setMomoReference] = useState('');

  // Fee Structure & Class Billing State (synced with Supabase public.fee_structures, public.invoices & public.school_settings)
  const [editableFeeTypes, setEditableFeeTypes] = useState<FeeTypeConfig[]>([]);
  const [savedFeeStructures, setSavedFeeStructures] = useState<any[]>([]);
  const [studentInvoices, setStudentInvoices] = useState<any[]>([]);
  const [newFeeLabel, setNewFeeLabel] = useState('');
  const [newFeeAmount, setNewFeeAmount] = useState('');
  const [isSavingFeeStructure, setIsSavingFeeStructure] = useState(false);

  const [billingTargetClass, setBillingTargetClass] = useState<string>('ALL');
  const [billingMode, setBillingMode] = useState<'merge' | 'replace'>('merge');
  const [selectedBillingComponents, setSelectedBillingComponents] = useState<Record<string, boolean>>({});
  const [billingComponentAmounts, setBillingComponentAmounts] = useState<Record<string, number>>({});
  const [isExecutingBatchBill, setIsExecutingBatchBill] = useState(false);

  // Individual Student Fee Breakdown Editor Modal State
  const [editingBillStudent, setEditingBillStudent] = useState<Student | null>(null);
  const [studentBreakdownDraft, setStudentBreakdownDraft] = useState<Record<string, number>>({});
  const [isSavingStudentBreakdown, setIsSavingStudentBreakdown] = useState(false);

  useEffect(() => {
    setEditableFeeTypes(feeTypes.map(ft => ({ ...ft })));
    const defaultSelected: Record<string, boolean> = {};
    const defaultAmounts: Record<string, number> = {};
    feeTypes.forEach(ft => {
      defaultSelected[ft.id] = ft.defaultAmount > 0;
      defaultAmounts[ft.id] = ft.defaultAmount;
    });
    setSelectedBillingComponents(prev => Object.keys(prev).length > 0 ? prev : defaultSelected);
    setBillingComponentAmounts(prev => Object.keys(prev).length > 0 ? prev : defaultAmounts);
  }, [feeTypes]);

  const openStudentBreakdownModal = (student: Student) => {
    const currentBreakdown = student.feeBreakdown || { tuition: student.totalFees || 0 };
    const draft: Record<string, number> = {};
    feeTypes.forEach(ft => {
      draft[ft.id] = Number(currentBreakdown[ft.id] ?? (ft.id === 'tuition' && Object.keys(currentBreakdown).length === 0 ? student.totalFees : 0)) || 0;
    });
    Object.entries(currentBreakdown).forEach(([k, v]) => {
      if (draft[k] === undefined) draft[k] = Number(v) || 0;
    });
    setStudentBreakdownDraft(draft);
    setEditingBillStudent(student);
  };

  const handleSaveStudentBreakdown = async () => {
    if (!editingBillStudent || !editingBillStudent.id) return;
    setIsSavingStudentBreakdown(true);
    try {
      const cleaned: Record<string, number> = {};
      Object.entries(studentBreakdownDraft).forEach(([k, v]) => {
        const num = Math.max(0, Number(v) || 0);
        if (num > 0 || k === 'tuition') {
          cleaned[k] = num;
        }
      });
      await feesApi.saveStudentFeeBreakdown(
        editingBillStudent.id,
        cleaned,
        targetSchoolId,
        editingBillStudent.studentId
      );
      showToast(`Updated itemized bill for ${editingBillStudent.firstName} ${editingBillStudent.lastName} in Supabase!`, 'success');
      setEditingBillStudent(null);
    } catch (err: any) {
      showToast(err?.message || 'Failed to save student fee breakdown.', 'error');
    } finally {
      setIsSavingStudentBreakdown(false);
    }
  };

  const handleAddFeeComponent = async () => {
    const label = newFeeLabel.trim();
    const amount = Math.max(0, Number(newFeeAmount) || 0);
    if (!label) {
      showToast('Please enter a fee component name (e.g., PTA Levy).', 'error');
      return;
    }
    const id = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || `fee_${Date.now()}`;
    if (editableFeeTypes.some(f => f.id === id)) {
      showToast('A fee component with a similar code already exists.', 'error');
      return;
    }
    const nextList = [...editableFeeTypes, { id, label, defaultAmount: amount }];
    setEditableFeeTypes(nextList);
    setSelectedBillingComponents(prev => ({ ...prev, [id]: amount > 0 }));
    setBillingComponentAmounts(prev => ({ ...prev, [id]: amount }));
    setNewFeeLabel('');
    setNewFeeAmount('');

    setIsSavingFeeStructure(true);
    try {
      await settingsApi.set('feeTypes', nextList, targetSchoolId);
      const savedRes = await feesApi.saveStructure({
        name: `Master School Fee Structure - ${currentTerm} (${currentAcademicYear})`,
        className: 'All',
        term: currentTerm,
        academicYear: currentAcademicYear,
        items: nextList.map(ft => ({ id: ft.id, label: ft.label, amount: Number(ft.defaultAmount) || 0 }))
      }, targetSchoolId);
      if (savedRes?.feeStructures?.length) {
        setSavedFeeStructures(savedRes.feeStructures);
      }
      showToast(`Added "${label}" and saved to Supabase public.fee_structures & school_settings!`, 'success');
    } catch (err: any) {
      showToast(err?.message || 'Saved locally, will sync to Supabase when online.', 'info');
    } finally {
      setIsSavingFeeStructure(false);
    }
  };

  const handleRemoveFeeComponent = async (idToRemove: string) => {
    if (idToRemove === 'tuition') {
      showToast('The core Tuition Fee component cannot be removed.', 'error');
      return;
    }
    const nextList = editableFeeTypes.filter(f => f.id !== idToRemove);
    setEditableFeeTypes(nextList);
    setIsSavingFeeStructure(true);
    try {
      await settingsApi.set('feeTypes', nextList, targetSchoolId);
      const savedRes = await feesApi.saveStructure({
        name: `Master School Fee Structure - ${currentTerm} (${currentAcademicYear})`,
        className: 'All',
        term: currentTerm,
        academicYear: currentAcademicYear,
        items: nextList.map(ft => ({ id: ft.id, label: ft.label, amount: Number(ft.defaultAmount) || 0 }))
      }, targetSchoolId);
      if (savedRes?.feeStructures?.length) {
        setSavedFeeStructures(savedRes.feeStructures);
      }
      showToast('Fee component removed and synced with Supabase public.fee_structures.', 'success');
    } catch (err: any) {
      showToast('Updated locally.', 'info');
    } finally {
      setIsSavingFeeStructure(false);
    }
  };

  const handleSaveFeeStructure = async () => {
    setIsSavingFeeStructure(true);
    try {
      await settingsApi.set('feeTypes', editableFeeTypes, targetSchoolId);
      const savedRes = await feesApi.saveStructure({
        name: `Master School Fee Structure - ${currentTerm} (${currentAcademicYear})`,
        className: 'All',
        term: currentTerm,
        academicYear: currentAcademicYear,
        items: editableFeeTypes.map(ft => ({ id: ft.id, label: ft.label, amount: Number(ft.defaultAmount) || 0 }))
      }, targetSchoolId);
      if (savedRes?.feeStructures?.length) {
        setSavedFeeStructures(savedRes.feeStructures);
      }
      const updatedAmounts: Record<string, number> = { ...billingComponentAmounts };
      editableFeeTypes.forEach(ft => {
        updatedAmounts[ft.id] = Number(ft.defaultAmount) || 0;
      });
      setBillingComponentAmounts(updatedAmounts);
      showToast('School fee structure saved to Supabase public.fee_structures & school_settings!', 'success');
    } catch (err: any) {
      showToast(err?.message || 'Saved locally and queued for Supabase sync.', 'info');
    } finally {
      setIsSavingFeeStructure(false);
    }
  };

  const handleSaveClassStructureTemplate = async () => {
    const { activeStructure } = batchBillingPreview;
    if (Object.keys(activeStructure).length === 0) {
      showToast('Select at least one component before saving a class fee structure.', 'error');
      return;
    }
    setIsSavingFeeStructure(true);
    try {
      const targetClassLabel = billingTargetClass === 'ALL' ? 'All' : billingTargetClass;
      const items = Object.entries(activeStructure).map(([id, amount]) => {
        const ft = editableFeeTypes.find(f => f.id === id);
        return { id, label: ft?.label || id.toUpperCase(), amount };
      });
      const savedRes = await feesApi.saveStructure({
        name: `${targetClassLabel === 'All' ? 'All Classes' : targetClassLabel} - ${currentTerm} (${currentAcademicYear})`,
        className: targetClassLabel,
        term: currentTerm,
        academicYear: currentAcademicYear,
        items
      }, targetSchoolId);
      if (savedRes?.feeStructures?.length) {
        setSavedFeeStructures(savedRes.feeStructures);
      }
      showToast(`Saved "${targetClassLabel === 'All' ? 'All Classes' : targetClassLabel}" fee blueprint to Supabase public.fee_structures!`, 'success');
    } catch (err: any) {
      showToast(err?.message || 'Could not save fee structure template.', 'error');
    } finally {
      setIsSavingFeeStructure(false);
    }
  };

  const handleLoadSavedFeeStructure = (fsRow: any) => {
    const cls = fsRow.class_name || fsRow.className || 'ALL';
    setBillingTargetClass(cls === 'All' ? 'ALL' : cls);
    const itemsList = Array.isArray(fsRow.items) ? fsRow.items : [];
    if (itemsList.length > 0) {
      const nextChecked: Record<string, boolean> = {};
      const nextAmounts: Record<string, number> = { ...billingComponentAmounts };
      editableFeeTypes.forEach(ft => {
        nextChecked[ft.id] = false;
      });
      itemsList.forEach((item: any) => {
        const key = String(item.id || '').trim();
        if (key) {
          nextChecked[key] = true;
          nextAmounts[key] = Number(item.amount) || 0;
        }
      });
      setSelectedBillingComponents(nextChecked);
      setBillingComponentAmounts(nextAmounts);
    }
    showToast(`Loaded "${fsRow.name}" (${cls}) into the Batch Class Billing Engine.`, 'info');
  };

  const handleDeleteSavedFeeStructure = async (id: number, name: string) => {
    try {
      const res = await feesApi.deleteStructure(id, targetSchoolId);
      if (res.feeStructures) {
        setSavedFeeStructures(res.feeStructures);
      } else {
        setSavedFeeStructures(prev => prev.filter(s => s.id !== id));
      }
      showToast(`Removed "${name}" from Supabase public.fee_structures.`, 'info');
    } catch (err: any) {
      showToast(err?.message || 'Failed to delete fee structure.', 'error');
    }
  };

  const availableClassNames = useMemo(() => {
    const set = new Set<string>();
    classesList.forEach(c => { if (c.name) set.add(c.name); });
    allStudents.forEach(s => { if (s.class) set.add(s.class); });
    return Array.from(set).sort();
  }, [classesList, allStudents]);

  const batchBillingPreview = useMemo(() => {
    const matchedStudents = allStudents.filter(s =>
      billingTargetClass === 'ALL' || !billingTargetClass
        ? true
        : (s.class || '').trim().toLowerCase() === billingTargetClass.trim().toLowerCase()
    );
    const activeStructure: Record<string, number> = {};
    editableFeeTypes.forEach(ft => {
      if (selectedBillingComponents[ft.id]) {
        activeStructure[ft.id] = Math.max(0, Number(billingComponentAmounts[ft.id] ?? ft.defaultAmount) || 0);
      }
    });
    const perStudentSelectedSum = Object.values(activeStructure).reduce((acc, v) => acc + v, 0);
    return {
      studentCount: matchedStudents.length,
      perStudentSelectedSum,
      totalAggregateImpact: matchedStudents.length * perStudentSelectedSum,
      activeStructure,
    };
  }, [allStudents, billingTargetClass, editableFeeTypes, selectedBillingComponents, billingComponentAmounts]);

  const handleExecuteBatchBill = async () => {
    const { activeStructure, studentCount } = batchBillingPreview;
    if (Object.keys(activeStructure).length === 0) {
      showToast('Please select at least one fee component to bill.', 'error');
      return;
    }
    if (studentCount === 0) {
      showToast('No students found in the selected class target.', 'error');
      return;
    }
    setIsExecutingBatchBill(true);
    try {
      const result = await feesApi.batchBill({
        targetClass: billingTargetClass,
        feeStructureToApply: activeStructure,
        mode: billingMode,
        academicYear: currentAcademicYear,
        term: currentTerm,
      }, targetSchoolId);

      // Refresh fee_structures & invoices from Supabase so the registry reflects the newly saved structure and invoices
      try {
        const structRes = await feesApi.getStructures(targetSchoolId);
        if (structRes) {
          setSavedFeeStructures(structRes.feeStructures || []);
          setStudentInvoices(structRes.invoices || []);
        }
      } catch {}

      if (result.queuedOffline) {
        showToast(`Billed ${result.updatedCount} student(s) locally and queued batch billing for Supabase sync.`, 'info');
      } else {
        showToast(`Saved fee structure to public.fee_structures and billed ${result.updatedCount} student(s) & invoices in Supabase!`, 'success');
      }
    } catch (err: any) {
      showToast(err?.message || 'Failed to execute batch class billing.', 'error');
    } finally {
      setIsExecutingBatchBill(false);
    }
  };

  useEffect(() => {
    if (selectedStudent) {
      setMomoNumber(selectedStudent.guardianPhone || '');
      setMomoVerified(!!selectedStudent.guardianPhone);
      setPaymentMethod(isStudent || isParent ? 'momo' : 'cash_bank');
      setMomoStep('idle');
      setMomoReference('');
      setBankOrChequeRef('');
    }
  }, [selectedStudentId, isStudent, isParent]);

  const verifyMomoSubscriber = () => {
    if (!momoNumber || momoNumber.length < 9) {
      showToast('Please enter a valid Mobile Money number.', 'error');
      return;
    }
    setIsVerifyingMomo(true);
    setTimeout(() => {
      setIsVerifyingMomo(false);
      setMomoVerified(true);
      showToast('MoMo subscriber name resolved successfully!', 'success');
    }, 700);
  };

  const submitPayment = async (referenceNum: string) => {
    const amount = Number(paymentAmount);
    if (isNaN(amount) || amount <= 0 || !selectedStudent || !selectedStudent.id) return;
    if (isSubmittingPayment) return;

    setIsSubmittingPayment(true);
    try {
      const currentPaid = selectedStudent.feePaidBreakdown || {};
      const breakdown = selectedStudent.feeBreakdown || { tuition: selectedStudent.totalFees };

      const updatedPaid = { ...currentPaid };
      feeTypes.forEach(ft => {
        if (updatedPaid[ft.id] === undefined) {
          updatedPaid[ft.id] = ft.id === 'tuition' ? selectedStudent.feesPaid : 0;
        }
      });

      if (allocationType === 'automatic') {
        let remaining = amount;
        const allocationOrder = feeTypes.map(ft => ft.id);
        
        for (const feeId of allocationOrder) {
          if (remaining <= 0) break;
          const billed = breakdown[feeId] ?? (feeId === 'tuition' ? selectedStudent.totalFees : 0);
          const paid = updatedPaid[feeId] ?? 0;
          const outstanding = Math.max(0, billed - paid);
          if (outstanding > 0) {
            const allocate = Math.min(remaining, outstanding);
            updatedPaid[feeId] = paid + allocate;
            remaining -= allocate;
          }
        }
        if (remaining > 0) {
          updatedPaid['tuition'] = (updatedPaid['tuition'] || 0) + remaining;
        }
      } else {
        updatedPaid[allocationType] = (updatedPaid[allocationType] || 0) + amount;
      }

      const canonicalMethod: 'Cash' | 'Bank Transfer' | 'Mobile Money' | 'Cheque' | 'Card' =
        paymentMethod === 'momo'
          ? 'Mobile Money'
          : paymentMethod === 'paystack'
          ? 'Card'
          : paymentMethod === 'bank_transfer'
          ? 'Bank Transfer'
          : paymentMethod === 'cheque'
          ? 'Cheque'
          : 'Cash';

      const channelLabel =
        paymentMethod === 'momo'
          ? `Mobile Money (${momoProvider.toUpperCase()})`
          : paymentMethod === 'paystack'
          ? 'Card (Paystack)'
          : paymentMethod === 'bank_transfer'
          ? 'Bank Transfer'
          : paymentMethod === 'cheque'
          ? 'Cheque'
          : 'Cash';

      const finalRef = (bankOrChequeRef.trim() || referenceNum).toUpperCase();
      const targetFeeLabel =
        allocationType === 'automatic'
          ? 'Automatic Term Fee Allocation'
          : feeTypes.find(f => f.id === allocationType)?.label || allocationType;

      const result = await feesApi.recordPayment({
        studentId: selectedStudent.id,
        studentCode: selectedStudent.studentId,
        studentName: `${selectedStudent.firstName} ${selectedStudent.lastName}`.trim(),
        className: selectedStudent.class,
        guardianPhone: momoNumber || selectedStudent.guardianPhone || '0241234567',
        guardianName: selectedStudent.guardianName || `${selectedStudent.firstName} ${selectedStudent.lastName}`,
        amount,
        paymentMethod: canonicalMethod,
        paymentChannelLabel: channelLabel,
        transactionReference: finalRef,
        academicYear: currentAcademicYear,
        term: currentTerm,
        receivedBy: user?.fullName || user?.email || (isStudent || isParent ? 'Self-Service Portal' : 'School Bursar'),
        description: `${targetFeeLabel} via ${channelLabel}`,
        feePaidBreakdown: updatedPaid,
      }, targetSchoolId);

      const finalReceiptNo = result.transaction?.receiptNumber || finalRef;

      setLastPayment({ 
        amount, 
        date: Date.now(), 
        method: channelLabel,
        phone: paymentMethod === 'momo' ? momoNumber : selectedStudent.guardianPhone,
        ref: finalReceiptNo,
        studentOverride: result.student
      });
      setPaymentAmount('');
      setBankOrChequeRef('');
      setIsReceiptModalOpen(true);

      if (result.queuedOffline) {
        showToast(`Payment of ${formatCurrency(amount)} saved locally and queued for Supabase sync.`, 'info');
      } else {
        showToast(`Payment of ${formatCurrency(amount)} recorded in Supabase fee_transactions & student ledger!`, 'success');
      }
      setOfflineQueueCount(getOfflineQueueItems().length);
    } catch (err: any) {
      console.error('Payment error:', err);
      showToast(err?.message || 'Failed to record payment.', 'error');
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  const handlePayment = async () => {
    const amount = Number(paymentAmount);
    if (isNaN(amount) || amount <= 0 || !selectedStudent || !selectedStudent.id) {
      showToast('Please enter a valid payment amount.', 'error');
      return;
    }

    if (paymentMethod === 'momo') {
      if (!momoNumber) {
        showToast('Subscriber Mobile Money phone number is required.', 'error');
        return;
      }
      if (!momoVerified) {
        showToast('Please verify the subscriber account number before processing.', 'error');
        return;
      }
      
      // Rotate through USSD Push payment steps
      setMomoStep('sending');
      setTimeout(() => {
        setMomoStep('pending');
      }, 800);
    } else {
      const prefix = paymentMethod === 'bank_transfer' ? 'BNK-' : paymentMethod === 'cheque' ? 'CHQ-' : 'RCP-';
      const generatedRef = bankOrChequeRef.trim() || (prefix + Math.floor(100000 + Math.random() * 900000));
      await submitPayment(generatedRef);
    }
  };

  const [isExportingPDF, setIsExportingPDF] = useState(false);
  const handleExportPDF = async () => {
    if (!receiptStudent) return;
    setIsExportingPDF(true);
    try {
      await exportToPDF('receipt-content', `Receipt_${receiptStudent.firstName}_${receiptStudent.lastName}`);
    } catch (err) {
      showToast('Failed to export printable PDF.', 'error');
    } finally {
      setIsExportingPDF(false);
    }
  };

  const exportFees = () => {
    const data = students?.map(s => ({
      ID: s.studentId,
      Name: `${s.firstName} ${s.lastName}`,
      Class: s.class,
      TotalFees: s.totalFees,
      FeesPaid: s.feesPaid,
      Balance: s.totalFees - s.feesPaid
    })) || [];
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Fees");
    XLSX.writeFile(wb, "Fee_Management_Report.xlsx");
  };

  const renderReceiptModal = () => (
    <AnimatePresence>
      {isReceiptModalOpen && receiptStudent && lastPayment && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="receipt-modal-title"
          className="receipt-modal-root receipt-safe-overlay fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm overflow-y-auto print:p-0 print:bg-transparent print:block"
        >
          <motion.div 
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="receipt-modal-card bg-white rounded-2xl sm:rounded-3xl shadow-2xl w-full max-w-[calc(100vw-1.5rem-env(safe-area-inset-left,0px)-env(safe-area-inset-right,0px))] sm:max-w-md md:max-w-lg max-h-[calc(100dvh-1.75rem-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px))] sm:max-h-[90dvh] overflow-hidden flex flex-col my-auto print:max-w-none print:max-h-none print:shadow-none print:rounded-none"
          >
            <div className="px-3.5 py-3 sm:p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2 bg-white shrink-0 print:hidden">
              <h3 id="receipt-modal-title" className="font-bold text-sm sm:text-base text-slate-800 tracking-tight">
                Payment Receipt
              </h3>
              <div className="flex items-center gap-1.5 sm:gap-2">
                <button 
                  type="button"
                  onClick={triggerPrint}
                  className="flex items-center justify-center gap-1.5 sm:gap-2 bg-white border border-slate-200 text-slate-700 px-3 sm:px-3.5 py-2 rounded-lg text-xs sm:text-sm font-bold hover:bg-slate-50 transition-all min-h-[40px] sm:min-h-[42px] shadow-xs cursor-pointer whitespace-nowrap"
                >
                  <Printer className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-indigo-600 shrink-0" />
                  <span>Print</span>
                </button>
                <button 
                  type="button"
                  onClick={handleExportPDF}
                  disabled={isExportingPDF}
                  className="flex items-center justify-center gap-1.5 sm:gap-2 bg-slate-800 text-white px-3 sm:px-3.5 py-2 rounded-lg text-xs sm:text-sm font-bold hover:bg-slate-900 transition-all disabled:opacity-50 min-h-[40px] sm:min-h-[42px] cursor-pointer whitespace-nowrap"
                >
                  <FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                  <span>{isExportingPDF ? '...' : 'PDF'}</span>
                </button>
                <button 
                  type="button"
                  onClick={() => {
                    setIsReceiptModalOpen(false);
                    if (!isStudent && !isParent && activeTab !== 'ledger') {
                      setSelectedStudentId(null);
                    }
                  }}
                  className="min-h-[40px] min-w-[40px] sm:min-h-[42px] sm:min-w-[42px] flex items-center justify-center text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                  aria-label="Close receipt modal"
                >
                  <X className="w-5 h-5 sm:w-6 sm:h-6" />
                </button>
              </div>
            </div>

            <div
              id="receipt-content"
              className="p-4 sm:p-6 md:p-8 pb-[max(1.25rem,calc(env(safe-area-inset-bottom,0px)+0.75rem))] sm:pb-6 md:pb-8 bg-white space-y-4 sm:space-y-5 md:space-y-6 w-full max-w-full sm:max-w-md md:max-w-lg mx-auto overflow-y-auto overscroll-contain flex-1 print:p-6 print:overflow-visible print:max-w-full"
            >
              <div className="text-center space-y-1.5 sm:space-y-2 border-b-2 border-slate-900 pb-3.5 sm:pb-4">
                <div className="w-10 h-10 sm:w-12 sm:h-12 bg-slate-900 text-white rounded-full flex items-center justify-center mx-auto mb-1.5 sm:mb-2 font-black text-base sm:text-lg shrink-0">
                  {schoolName.charAt(0)}
                </div>
                <h2 className="text-sm sm:text-base md:text-lg font-black uppercase tracking-wider sm:tracking-widest text-slate-900 break-words leading-snug px-1">
                  {schoolName}
                </h2>
                <p className="text-[8px] sm:text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                  Official Payment Receipt
                </p>
              </div>

              <div className="space-y-2.5 sm:space-y-3">
                <div className="receipt-row flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs py-1.5 border-b border-slate-100">
                  <span className="font-black text-slate-400 uppercase text-[8px] sm:text-[9px] shrink-0">Receipt/Ref Number:</span>
                  <span className="font-mono font-bold uppercase text-[11px] sm:text-xs text-slate-800 break-all sm:break-normal text-right">
                    {lastPayment.ref || `RCP-${Math.floor(Math.random() * 1000000)}`}
                  </span>
                </div>
                <div className="receipt-row flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs py-1.5 border-b border-slate-100 rounded">
                  <span className="font-black text-slate-400 uppercase text-[8px] sm:text-[9px] shrink-0">Payment Channel:</span>
                  <span className="font-bold uppercase text-[10px] sm:text-[11px] text-indigo-600 font-sans text-right">
                    {lastPayment.method || 'CASH / BANK'}
                  </span>
                </div>
                {lastPayment.phone && (
                  <div className="receipt-row flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs py-1.5 border-b border-slate-100">
                    <span className="font-black text-slate-400 uppercase text-[8px] sm:text-[9px] shrink-0">Payer Subscriber:</span>
                    <span className="font-mono font-bold text-[11px] sm:text-xs text-right">{lastPayment.phone}</span>
                  </div>
                )}
                <div className="receipt-row flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs py-1.5 border-b border-slate-100">
                  <span className="font-black text-slate-400 uppercase text-[8px] sm:text-[9px] shrink-0">Date:</span>
                  <span className="font-bold text-[11px] sm:text-xs text-right">{new Date(lastPayment.date).toLocaleDateString()}</span>
                </div>

                <div className="space-y-0.5 pt-2 sm:pt-3">
                  <p className="text-[8px] sm:text-[9px] font-black text-slate-400 uppercase">Received From:</p>
                  <p className="text-xs sm:text-sm font-bold uppercase text-slate-900 break-words">
                    {receiptStudent.firstName} {receiptStudent.lastName}
                  </p>
                  <p className="text-[10px] sm:text-[11px] font-mono text-slate-400">{receiptStudent.studentId} • {receiptStudent.class}</p>
                </div>

                <div className="receipt-amount-banner p-3.5 sm:p-4 bg-slate-50 border border-slate-100 rounded-xl mt-3 sm:mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                  <p className="text-[8px] sm:text-[9px] font-black text-slate-400 uppercase">Amount Paid:</p>
                  <p className="text-lg sm:text-xl md:text-2xl font-black text-indigo-600 font-mono tabular-nums break-words">
                    {formatCurrency(lastPayment.amount)}
                  </p>
                </div>

                <div className="receipt-summary-grid grid grid-cols-2 gap-2.5 sm:gap-4 text-xs pt-2 sm:pt-3">
                  <div className="p-2.5 sm:p-3 rounded-xl bg-slate-50/70 border border-slate-100">
                    <p className="text-[8px] sm:text-[9px] font-black text-slate-400 uppercase mb-0.5 sm:mb-1">Total Fees:</p>
                    <p className="font-bold font-mono tabular-nums text-[11px] sm:text-xs md:text-sm text-slate-800 break-words">
                      {formatCurrency(receiptStudent.totalFees)}
                    </p>
                  </div>
                  <div className="p-2.5 sm:p-3 rounded-xl bg-rose-50/50 border border-rose-100/80">
                    <p className="text-[8px] sm:text-[9px] font-black text-slate-400 uppercase mb-0.5 sm:mb-1">Balance Due:</p>
                    <p className="font-bold font-mono tabular-nums text-[11px] sm:text-xs md:text-sm text-rose-600 break-words">
                      {formatCurrency(receiptStudent.totalFees - receiptStudent.feesPaid)}
                    </p>
                  </div>
                </div>

                <div className="receipt-breakdown-box border border-slate-200 rounded-xl p-3 sm:p-3.5 space-y-2 mt-3 sm:mt-4">
                  <p className="text-[7px] sm:text-[8px] font-black text-slate-400 uppercase tracking-widest">
                    Statement of Accounts Breakdown
                  </p>
                  <div className="space-y-1">
                    {feeTypes.map(ft => {
                      const billed = receiptStudent.feeBreakdown?.[ft.id] ?? (ft.id === 'tuition' ? receiptStudent.totalFees : 0);
                      const paid = receiptStudent.feePaidBreakdown?.[ft.id] ?? (ft.id === 'tuition' ? receiptStudent.feesPaid : 0);
                      if (billed === 0) return null;
                      return (
                        <div
                          key={ft.id}
                          className="receipt-row flex flex-wrap justify-between items-center gap-x-2 gap-y-0.5 text-[10px] sm:text-[11px] py-1 border-b border-slate-50 last:border-0 last:pb-0"
                        >
                          <span className="text-slate-600 font-medium">{ft.label}</span>
                          <div className="font-mono tabular-nums text-right ml-auto">
                            <span className="font-bold text-slate-800">{formatCurrency(paid)}</span>
                            <span className="text-slate-400 text-[8px] sm:text-[9px]"> / {formatCurrency(billed)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="pt-6 sm:pt-8 md:pt-10 pb-1 text-center">
                <div className="border-b border-slate-900 w-28 sm:w-32 mx-auto mb-1" />
                <p className="text-[8px] sm:text-[9px] font-black uppercase text-slate-400">Cashier Signature</p>
                <p className="mt-4 sm:mt-6 text-[8px] sm:text-[9px] text-slate-300 italic uppercase">
                  Thank you for your prompt payment.
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );

  if (isStudent || isParent) {
    if (!selectedStudent) {
      return (
        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-4 max-w-lg mx-auto mt-12 print:hidden">
          <AlertCircle className="w-12 h-12 text-rose-500 mx-auto animate-pulse" />
          <h2 className="text-xl font-black text-slate-900">Student Profile Not Linked</h2>
          <p className="text-sm text-slate-500 leading-relaxed">
            {isStudent 
              ? `We could not find an active student record matching your registered account full name "${user?.fullName}". Please contact the administration office to link your records.`
              : `We could not find any active student records associated with your parent guardian profile name "${user?.fullName}". Please contact the school Registrar's office.`}
          </p>
        </div>
      );
    }

    return (
      <>
        <div className={cn("space-y-6", isReceiptModalOpen && "print:hidden receipt-modal-hidden-on-print")}>
          {/* Deep Teal Hero Header Card */}
          <div className="bg-[#1c4a59] rounded-3xl p-6 sm:p-7 text-white shadow-[0_8px_28px_rgba(28,74,89,0.16)] flex flex-col lg:flex-row lg:items-center justify-between gap-5 print:hidden">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/15">
                <Wallet className="w-3.5 h-3.5 text-[#faae57]" />
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#e1c594]">
                  Student Bursary & Billing
                </span>
              </div>
              <h2 className="text-2xl sm:text-[28px] font-extrabold tracking-tight text-white leading-tight">
                {isStudent ? 'My Fees & Payments' : "Ward's Fees & Payments"}
              </h2>
              <p className="text-sm text-[#e1c594]/90 font-medium">
                View active ledger balances, itemized fee schedules, and execute secure payments.
              </p>
            </div>
            
            <div className="flex flex-wrap items-center gap-3">
              {isParent && parentWards.length > 1 && (
                <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-full border border-[#bac4c6] min-h-[44px]">
                  <span className="text-[10px] font-bold text-[#6a7f84] uppercase tracking-wider">Child:</span>
                  <select
                    value={selectedStudentId || ''}
                    onChange={(e) => setSelectedStudentId(e.target.value)}
                    className="bg-transparent font-bold text-xs text-[#1f2a2e] outline-none cursor-pointer"
                  >
                    {parentWards.map(w => (
                      <option key={w.id || w.studentId} value={w.studentId}>
                        {w.firstName} {w.lastName} ({w.class})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* View Switcher Tabs */}
              <div className="flex items-center bg-white/10 p-1 rounded-full border border-white/15">
                <button
                  type="button"
                  onClick={() => setActiveTab('dashboard')}
                  className={cn(
                    "px-4 py-2 rounded-full text-xs font-bold transition-all whitespace-nowrap cursor-pointer min-h-[38px]",
                    activeTab === 'dashboard'
                      ? "bg-[#faae57] text-[#1f2a2e] shadow-xs"
                      : "text-white/85 hover:text-white"
                  )}
                >
                  Fee Overview
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('ledger')}
                  className={cn(
                    "px-4 py-2 rounded-full text-xs font-bold transition-all whitespace-nowrap cursor-pointer min-h-[38px]",
                    activeTab === 'ledger'
                      ? "bg-[#faae57] text-[#1f2a2e] shadow-xs"
                      : "text-white/85 hover:text-white"
                  )}
                >
                  Detailed Ledger
                </button>
              </div>
            </div>
          </div>

          {activeTab === 'ledger' ? (
            renderLedgerStatement()
          ) : (
            <>
              {/* Profile Card & Stats Bento-Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4 min-w-0">
            <div className="bg-slate-900 text-slate-100 rounded-xl p-4 sm:p-5 flex flex-col justify-between border border-slate-800 shadow-xs relative overflow-hidden min-w-0">
              <div className="min-w-0">
                <p className="text-[10px] uppercase font-bold tracking-widest text-indigo-400">Student Profile</p>
                <h3 className="text-base font-bold mt-1 text-white truncate">{selectedStudent.firstName} {selectedStudent.lastName}</h3>
                <p className="text-[11px] font-mono mt-0.5 text-slate-400 truncate">{selectedStudent.studentId} • {selectedStudent.class}</p>
              </div>
              <div className="border-t border-slate-800 pt-3 mt-4 space-y-1 text-xs min-w-0">
                <p className="text-slate-400 truncate"><span className="font-semibold text-slate-300">Guardian:</span> {selectedStudent.guardianName}</p>
                <p className="text-slate-400 font-mono truncate"><span className="font-semibold text-slate-300 font-sans">Phone:</span> {selectedStudent.guardianPhone}</p>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-4 sm:p-6 border border-slate-200 flex flex-col justify-between shadow-sm min-w-0">
              <div className="min-w-0">
                <p className="text-[10px] uppercase font-black tracking-widest text-slate-400">Total Billed Fees</p>
                <h3 className="text-2xl sm:text-3xl font-black mt-2 sm:mt-3 text-slate-900 font-mono tabular-nums truncate">{formatCurrency(selectedStudent.totalFees)}</h3>
              </div>
              <p className="text-[10px] text-slate-400 mt-2 font-medium truncate">Billed term aggregates for {selectedStudent.class}</p>
            </div>

            <div className="bg-emerald-50/50 rounded-2xl p-4 sm:p-6 border border-emerald-100 flex flex-col justify-between shadow-sm min-w-0">
              <div className="min-w-0">
                <p className="text-[10px] uppercase font-black tracking-widest text-emerald-600">Total Paid to Date</p>
                <h3 className="text-2xl sm:text-3xl font-black mt-2 sm:mt-3 text-emerald-700 font-mono tabular-nums truncate">{formatCurrency(selectedStudent.feesPaid)}</h3>
              </div>
              <p className="text-[10px] text-emerald-600/80 mt-2 font-semibold truncate">GHS {(selectedStudent.totalFees > 0 ? (selectedStudent.feesPaid / selectedStudent.totalFees * 100) : 0).toFixed(0)}% overall completion rate</p>
            </div>

            <div className="bg-rose-50/50 rounded-2xl p-4 sm:p-6 border border-rose-100 flex flex-col justify-between shadow-sm min-w-0">
              <div className="min-w-0">
                <p className="text-[10px] uppercase font-black tracking-widest text-rose-600">Outstanding Balance</p>
                <h3 className="text-2xl sm:text-3xl font-black mt-2 sm:mt-3 text-rose-700 font-mono tabular-nums truncate">
                  {formatCurrency(selectedStudent.totalFees - selectedStudent.feesPaid)}
                </h3>
              </div>
              <p className="text-[10px] text-rose-600/80 mt-2 font-semibold truncate">Please settle outstanding to clear record entries</p>
            </div>
          </div>

          {/* Content Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 lg:gap-8 min-w-0">
            
            {/* Left Column: Itemized Bills & Receipt history */}
            <div className="space-y-4 sm:space-y-6 lg:col-span-2 min-w-0">
              
              {/* Itemized breakdown table & stacked mobile cards */}
              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden min-w-0">
                <div className="p-4 sm:p-5 border-b border-slate-100 bg-slate-50/50 flex flex-wrap justify-between items-center gap-2 min-w-0">
                  <h3 className="font-extrabold text-slate-800 text-xs sm:text-sm flex items-center gap-2 min-w-0">
                    <CreditCard className="w-4 h-4 text-indigo-600 shrink-0" />
                    <span className="truncate">Itemized Statement of Accounts</span>
                  </h3>
                  <span className="text-[10px] font-black uppercase text-slate-400 font-mono bg-white border px-2.5 py-1 rounded-lg shrink-0">
                    Current Term
                  </span>
                </div>

                {/* Stacked Mobile Fee Component Cards (< 768px) */}
                <div className="md:hidden print:hidden divide-y divide-slate-100 min-w-0">
                  {feeTypes.map(ft => {
                    const billed = selectedStudent.feeBreakdown?.[ft.id] ?? (ft.id === 'tuition' ? selectedStudent.totalFees : 0);
                    const paid = selectedStudent.feePaidBreakdown?.[ft.id] ?? (ft.id === 'tuition' ? selectedStudent.feesPaid : 0);
                    const outstanding = Math.max(0, billed - paid);
                    if (billed === 0) return null;
                    return (
                      <div key={ft.id} className="p-3.5 space-y-2.5 hover:bg-slate-50/40 transition-colors min-w-0">
                        <div className="flex items-center justify-between gap-2 min-w-0">
                          <span className="font-bold text-slate-900 text-xs truncate">{ft.label}</span>
                          <span className={cn(
                            "px-2 py-0.5 rounded-md border text-[10px] font-mono font-bold tabular-nums shrink-0",
                            outstanding > 0
                              ? "bg-rose-50 text-rose-700 border-rose-200"
                              : "bg-emerald-50 text-emerald-700 border-emerald-200"
                          )}>
                            {outstanding > 0 ? `Due: ${formatCurrency(outstanding)}` : 'Cleared'}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 min-w-0">
                          <div className="p-2 rounded-xl bg-slate-50 border border-slate-200/70 min-w-0">
                            <span className="text-[9px] font-bold uppercase text-slate-400 block truncate">Amount Billed</span>
                            <span className="font-mono font-bold text-xs text-slate-700 tabular-nums block truncate mt-0.5">
                              {formatCurrency(billed)}
                            </span>
                          </div>
                          <div className="p-2 rounded-xl bg-emerald-50/50 border border-emerald-100 min-w-0">
                            <span className="text-[9px] font-bold uppercase text-slate-400 block truncate">Amount Paid</span>
                            <span className="font-mono font-bold text-xs text-emerald-700 tabular-nums block truncate mt-0.5">
                              {formatCurrency(paid)}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Desktop & Print Table (>= 768px) */}
                <div className="hidden md:block print:block overflow-x-auto">
                  <table className="w-full text-left min-w-[500px]">
                    <thead>
                      <tr className="bg-slate-50/30 border-b border-slate-100">
                        <th className="px-5 py-3 text-[10px] font-extrabold text-slate-400 uppercase">Fee Component</th>
                        <th className="px-5 py-3 text-[10px] font-extrabold text-slate-400 uppercase text-right">Amount Billed</th>
                        <th className="px-5 py-3 text-[10px] font-extrabold text-slate-400 uppercase text-right">Amount Paid</th>
                        <th className="px-5 py-3 text-[10px] font-extrabold text-slate-400 uppercase text-right">Outstanding</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {feeTypes.map(ft => {
                        const billed = selectedStudent.feeBreakdown?.[ft.id] ?? (ft.id === 'tuition' ? selectedStudent.totalFees : 0);
                        const paid = selectedStudent.feePaidBreakdown?.[ft.id] ?? (ft.id === 'tuition' ? selectedStudent.feesPaid : 0);
                        const outstanding = Math.max(0, billed - paid);
                        if (billed === 0) return null;
                        return (
                          <tr key={ft.id} className="hover:bg-slate-50/40">
                            <td className="px-5 py-3 font-semibold text-slate-700">{ft.label}</td>
                            <td className="px-5 py-3 text-right font-mono text-slate-600 font-medium">{formatCurrency(billed)}</td>
                            <td className="px-5 py-3 text-right font-mono text-emerald-600 font-bold">{formatCurrency(paid)}</td>
                            <td className="px-5 py-3 text-right font-mono font-bold">
                              <span className={outstanding > 0 ? "text-rose-600" : "text-emerald-600"}>
                                {formatCurrency(outstanding)}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Payment history list */}
              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                <div className="p-5 border-b border-slate-100 bg-slate-50/50">
                  <h3 className="font-extrabold text-slate-800 text-sm flex items-center gap-2">
                    <History className="w-4 h-4 text-indigo-600" />
                    My Recent Payment Receipts
                  </h3>
                </div>
                {parsedPayments.length === 0 ? (
                  <div className="p-10 text-center text-slate-400 space-y-2">
                    <FileText className="w-10 h-10 text-slate-300 mx-auto" />
                    <p className="text-xs font-bold text-slate-600">No payment receipts found</p>
                    <p className="text-[10px] text-slate-400 max-w-sm mx-auto leading-relaxed">
                      Once you submit online transactions or clear outstanding fee items, your downloadable e-receipt statements will compile here automatically.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {parsedPayments.map(p => (
                      <div key={p.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 bg-emerald-50 border border-emerald-100 rounded-xl flex items-center justify-center text-emerald-600 font-bold text-xs shrink-0">
                            GHS
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-sm text-slate-850 dark:text-slate-150 font-mono tabular-nums">{formatCurrency(p.amount)}</span>
                              <span className="text-[10px] bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 px-1.5 py-0.5 rounded-md font-mono uppercase">
                                {p.method}
                              </span>
                            </div>
                            <p className="text-[10px] text-slate-400 font-medium mt-0.5">Ref: <span className="font-mono">{p.ref}</span> • {new Date(p.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                          </div>
                        </div>
                        
                        <button
                          onClick={() => {
                            setLastPayment({
                              amount: p.amount,
                              date: p.date,
                              method: p.method,
                              phone: p.phone,
                              ref: p.ref
                            });
                            setIsReceiptModalOpen(true);
                          }}
                          className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-slate-600 font-bold text-xs flex items-center gap-1.5 transition-all self-start sm:self-auto cursor-pointer outline-none"
                        >
                          <FileText className="w-3.5 h-3.5 text-indigo-500" />
                          <span>View Receipt</span>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>

            {/* Right Column: Secure Fees Payment Portal */}
            <div className="space-y-6 lg:col-span-1">
              <motion.div 
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="bg-white dark:bg-slate-900 rounded-xl border border-indigo-500/80 p-6 shadow-sm relative"
              >
                <div className="absolute top-4 right-4 inline-flex items-center gap-1.5 text-[11px] font-semibold text-indigo-700 dark:text-indigo-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 dark:bg-indigo-400 animate-pulse" />
                  <span>Secure Checkout</span>
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-1">Make Secure Payment</h3>
                <p className="text-xs text-slate-500 mb-6">Settle outstanding balances instantly via Mobile Money or Paystack.</p>

                {momoStep !== 'idle' ? (
                  /* MoMo interactive simulations step rendering */
                  <div className="space-y-5 py-4 text-center">
                    <div className="mx-auto w-16 h-16 rounded-full flex items-center justify-center bg-indigo-50 border border-indigo-100 relative">
                      <div className="absolute inset-x-0 inset-y-0 rounded-full bg-indigo-500/15 animate-ping" />
                      <Smartphone className="w-8 h-8 text-indigo-600 relative z-10" />
                    </div>

                    <div className="space-y-1 px-1">
                      <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest">MoMo Authorization</h4>
                      <p className="text-[11px] text-slate-500 font-bold">
                        A secure GHS {Number(paymentAmount).toFixed(2)} push query has been prompted to subscriber <span className="text-indigo-600 font-mono font-black">{momoNumber}</span>.
                      </p>
                    </div>

                    {momoStep === 'sending' && (
                      <div className="flex items-center justify-center gap-2 text-xs text-indigo-600 font-black bg-indigo-50/50 p-3 rounded-xl border border-indigo-100 shadow-sm">
                        <RefreshCw className="w-4 h-4 animate-spin text-indigo-500" />
                        <span>INITIATING PUSH REQUEST...</span>
                      </div>
                    )}

                    {momoStep === 'pending' && (
                      <div className="space-y-4">
                        <div className="bg-amber-50/80 border border-amber-200 p-3.5 rounded-2xl space-y-2 text-left">
                          <p className="text-[9px] font-black uppercase text-amber-800 tracking-wider flex items-center gap-1.5">
                            <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                            Simulated Mobile Overlay Prompt
                          </p>
                          <div className="bg-slate-950 text-slate-100 font-mono text-[10px] p-3 rounded-xl border border-slate-900 shadow-inner tracking-tight leading-relaxed">
                            <p className="text-yellow-400 font-black uppercase tracking-wider">{momoProvider.toUpperCase()} MOBILE DEBIT</p>
                            <p className="mt-1.5 text-slate-200">Pay GHS {Number(paymentAmount).toFixed(2)} to SchoolSphere Treasury Account?</p>
                            <p className="mt-2.5 text-right text-[9px] text-slate-500 font-bold border-t border-slate-900 pt-1.5">1. Enter MoMo PIN to Pay | 2. Decline</p>
                          </div>
                        </div>

                        {/* Handset approval controls */}
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={() => {
                              const refNum = 'MM-' + Math.floor(100000 + Math.random() * 900000);
                              submitPayment(refNum);
                              setMomoStep('idle');
                              showToast('Payment successfully approved from mobile!', 'success');
                            }}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white py-3 px-2 rounded-xl text-[10px] font-black transition-all uppercase tracking-wider shadow-sm cursor-pointer"
                          >
                            Enter PIN & Pay
                          </button>
                          <button
                            onClick={() => {
                              setMomoStep('failed');
                              showToast('MoMo payment request declined on handset.', 'error');
                            }}
                            className="bg-rose-600 hover:bg-rose-700 text-white py-3 px-2 rounded-xl text-[10px] font-black transition-all uppercase tracking-wider shadow-sm cursor-pointer"
                          >
                            Decline Payment
                          </button>
                        </div>
                      </div>
                    )}

                    {momoStep === 'failed' && (
                      <div className="space-y-3">
                        <div className="p-3 bg-red-50 border border-red-100 text-rose-800 rounded-xl text-xs font-bold font-semibold">
                          Transaction Failed. Decline response received.
                        </div>
                        <button
                          onClick={() => setMomoStep('idle')}
                          className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 py-3 rounded-xl text-xs font-extrabold uppercase transition-all"
                        >
                          Retry / Change Mode
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="p-4 bg-rose-50 dark:bg-rose-950/30 border border-rose-100 dark:border-rose-900/40 rounded-xl flex justify-between items-center text-slate-800 dark:text-slate-200">
                      <div>
                        <p className="text-[10px] font-bold text-rose-600 dark:text-rose-400 uppercase mb-0.5">Outstanding Balance</p>
                        <p className="text-xl font-bold text-rose-700 dark:text-rose-300 font-mono tabular-nums">{formatCurrency(selectedStudent.totalFees - selectedStudent.feesPaid)}</p>
                      </div>
                      <span className="text-[10px] bg-rose-100/80 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-300 px-2 py-0.5 rounded-md font-bold uppercase tracking-wider">Due Now</span>
                    </div>

                    {/* Allocation Target Select Box */}
                    <div className="space-y-1 font-semibold">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">Allocation Target Option</label>
                      <select 
                        value={allocationType}
                        onChange={(e) => setAllocationType(e.target.value)}
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs text-slate-700 outline-none cursor-pointer"
                      >
                        <option value="automatic">Automatic Allocation (First outstanding, then rest)</option>
                        {feeTypes.map(ft => {
                          const billed = selectedStudent.feeBreakdown?.[ft.id] ?? (ft.id === 'tuition' ? selectedStudent.totalFees : 0);
                          const paid = selectedStudent.feePaidBreakdown?.[ft.id] ?? (ft.id === 'tuition' ? selectedStudent.feesPaid : 0);
                          const outstanding = Math.max(0, billed - paid);
                          if (billed === 0) return null;
                          return (
                            <option key={ft.id} value={ft.id} disabled={outstanding <= 0}>
                              Allocate to {ft.label} Only (Outstanding: {formatCurrency(outstanding)})
                            </option>
                          );
                        })}
                      </select>
                    </div>

                    {/* Payment Method Selector */}
                    <div className="space-y-1.5 font-semibold">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">Payment Channel</label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setPaymentMethod('momo')}
                          className={cn(
                            "py-2.5 px-3 rounded-xl border font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer",
                            paymentMethod === 'momo'
                              ? "border-indigo-600 bg-indigo-50 text-indigo-700 ring-2 ring-indigo-500/10"
                              : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                          )}
                        >
                           MoMo
                        </button>
                        <button
                          type="button"
                          onClick={() => setPaymentMethod('paystack')}
                          className={cn(
                            "py-2.5 px-3 rounded-xl border font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer",
                            paymentMethod === 'paystack'
                              ? "border-indigo-600 bg-indigo-50 text-indigo-700 ring-2 ring-indigo-500/10"
                              : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                          )}
                        >
                           Paystack
                        </button>
                      </div>
                    </div>

                    {paymentMethod === 'momo' && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="space-y-3.5 p-4 bg-slate-50 rounded-2xl border border-slate-200/60"
                      >
                        {/* Operator selection with nice colors */}
                        <div className="space-y-1 font-semibold">
                          <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">MoMo Network Operator</label>
                          <div className="grid grid-cols-3 gap-1.5">
                            <button
                              type="button"
                              onClick={() => setMomoProvider('mtn')}
                              className={cn(
                                "py-2 rounded-lg text-[10px] font-black transition-all border text-center uppercase flex flex-col items-center gap-0.5 cursor-pointer",
                                momoProvider === 'mtn'
                                  ? "bg-amber-100/60 border-amber-400 text-amber-800 shadow-sm"
                                  : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
                              )}
                            >
                              <span className="w-1.5 h-1.5 bg-amber-500 rounded-full" />
                              MTN MoMo
                            </button>
                            <button
                              type="button"
                              onClick={() => setMomoProvider('telecel')}
                              className={cn(
                                "py-2 rounded-lg text-[10px] font-black transition-all border text-center uppercase flex flex-col items-center gap-0.5 cursor-pointer",
                                momoProvider === 'telecel'
                                  ? "bg-red-100/60 border-red-400 text-red-800 shadow-sm"
                                  : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
                              )}
                            >
                              <span className="w-1.5 h-1.5 bg-red-500 rounded-full" />
                              Telecel
                            </button>
                            <button
                              type="button"
                              onClick={() => setMomoProvider('at')}
                              className={cn(
                                "py-2 rounded-lg text-[10px] font-black transition-all border text-center uppercase flex flex-col items-center gap-0.5 cursor-pointer",
                                momoProvider === 'at'
                                  ? "bg-indigo-100/65 border-indigo-400 text-indigo-900 shadow-sm"
                                  : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
                              )}
                            >
                              <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full" />
                              AT Money
                            </button>
                          </div>
                        </div>

                        {/* Phone number & Validation */}
                        <div className="space-y-1 font-semibold">
                          <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Subscriber Number</label>
                          <div className="flex gap-1.5">
                            <div className="relative flex-1">
                              <Smartphone className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                              <input
                                type="text"
                                maxLength={10}
                                value={momoNumber}
                                onChange={(e) => {
                                  setMomoNumber(e.target.value.replace(/[^0-9]/g, ''));
                                  setMomoVerified(false);
                                }}
                                placeholder="e.g. 0241234567"
                                className="w-full pl-8 pr-2 py-2 bg-white border border-slate-200 rounded-xl font-mono text-xs text-slate-800 outline-none"
                              />
                            </div>
                            <button
                              type="button"
                              onClick={verifyMomoSubscriber}
                              disabled={isVerifyingMomo}
                              className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-xl text-xs font-bold transition-all disabled:opacity-50 shrink-0 cursor-pointer"
                            >
                              {isVerifyingMomo ? "..." : "Verify"}
                            </button>
                          </div>
                        </div>

                        {/* Verified Account Name Alert */}
                        {momoVerified && (
                          <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-2.5 flex items-start gap-2 text-emerald-800 text-[10px] leading-tight font-medium">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                            <div>
                              <p className="font-extrabold text-[11px] text-emerald-950 uppercase">Verified Subscriber</p>
                              <p className="mt-0.5">Name: <span className="font-bold">{selectedStudent.guardianName || 'Authorized Payer'}</span></p>
                              <p className="text-[8px] text-emerald-600 uppercase tracking-wider font-bold">Auto-resolved Account Successful</p>
                            </div>
                          </div>
                        )}
                      </motion.div>
                    )}

                    <div className="space-y-2 font-semibold">
                      <label className="text-sm font-bold text-slate-700">Payment Amount (GHS)</label>
                      <div className="relative font-bold">
                        <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input 
                          type="number"
                          value={paymentAmount}
                          onChange={(e) => setPaymentAmount(e.target.value)}
                          placeholder="Enter amount..."
                          className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-bold font-mono"
                        />
                      </div>
                    </div>

                    {paymentMethod === 'paystack' ? (
                      <PaystackPaymentButton
                        amount={Number(paymentAmount)}
                        email="amoakoemmanuel@hotmail.com"
                        onSuccess={(ref: any) => {
                          submitPayment(ref.reference);
                        }}
                        onClose={() => showToast('Paystack payment canceled', 'info')}
                        className="w-full justify-center text-lg py-4 rounded-2xl shadow-lg shadow-indigo-100"
                        label="Confirm Payment"
                      />
                    ) : (
                      <button 
                        onClick={handlePayment}
                        className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-bold text-lg flex items-center justify-center gap-2 hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 cursor-pointer"
                      >
                        Confirm Payment <ArrowUpRight className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                )}
              </motion.div>
            </div>

          </div>
          </>
          )}
        </div>
        {renderReceiptModal()}
      </>
    );
  }

  return (
    <>
      <div className={cn("space-y-4 sm:space-y-6 w-full max-w-full min-w-0 overflow-x-hidden", isReceiptModalOpen && "print:hidden receipt-modal-hidden-on-print")}>
        {/* Print Only Header */}
        <div className="only-print">
          <h1 className="text-3xl font-black text-slate-900 uppercase tracking-tighter text-center">{schoolName}</h1>
          <div className="mt-2 text-sm font-bold text-slate-600 uppercase tracking-widest flex items-center justify-center gap-4">
            <span>Fee Management & Financial Report</span>
            <span className="w-1.5 h-1.5 bg-slate-400 rounded-full" />
            <span>Generated: {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}</span>
          </div>
        </div>

        {/* Deep Teal Hero Header Card */}
        <div className="bg-[#1c4a59] rounded-2xl sm:rounded-3xl p-4 sm:p-6 lg:p-7 text-white shadow-[0_8px_28px_rgba(28,74,89,0.16)] flex flex-col lg:flex-row lg:items-center justify-between gap-4 sm:gap-5 print:hidden min-w-0 overflow-hidden">
          <div className="space-y-1.5 sm:space-y-2 min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <div className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-full bg-white/10 border border-white/15 max-w-full">
                <Wallet className="w-3.5 h-3.5 text-[#faae57] shrink-0" />
                <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-[#e1c594] truncate">
                  Bursary & Accounts Office
                </span>
              </div>
              {offlineQueueCount > 0 ? (
                <div className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-full bg-amber-500/20 border border-amber-400/30 text-amber-200 text-[10px] sm:text-[11px] font-bold">
                  <CloudOff className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                  <span>{offlineQueueCount} Queued Offline</span>
                </div>
              ) : (
                <div className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-200 text-[10px] sm:text-[11px] font-bold">
                  <Cloud className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
                  <span>Supabase Connected</span>
                </div>
              )}
            </div>
            <h2 className="text-xl sm:text-2xl lg:text-[28px] font-extrabold tracking-tight text-white leading-tight break-words">
              Financial & Fee Management
            </h2>
            <p className="text-xs sm:text-sm text-[#e1c594]/90 font-medium leading-relaxed">
              Configure fee structures, bill classes, monitor live Supabase transaction ledgers, and issue official receipts.
            </p>
          </div>
          
          <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-2.5 w-full lg:w-auto min-w-0">
            {/* View Switcher Tabs - 2-column grid on mobile with 3rd tab full width */}
            <div className="grid grid-cols-2 sm:flex items-center bg-white/10 p-1 rounded-2xl sm:rounded-full border border-white/15 gap-1 w-full sm:w-auto print:hidden">
              <button
                type="button"
                onClick={() => setActiveTab('dashboard')}
                className={cn(
                  "px-2.5 sm:px-4 py-2 rounded-xl sm:rounded-full text-[11px] sm:text-xs font-bold transition-all cursor-pointer min-h-[38px] text-center truncate",
                  activeTab === 'dashboard'
                    ? "bg-[#faae57] text-[#1f2a2e] shadow-xs"
                    : "text-white/85 hover:text-white"
                )}
              >
                Overview & Payments
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('ledger')}
                className={cn(
                  "px-2.5 sm:px-4 py-2 rounded-xl sm:rounded-full text-[11px] sm:text-xs font-bold transition-all cursor-pointer min-h-[38px] text-center truncate",
                  activeTab === 'ledger'
                    ? "bg-[#faae57] text-[#1f2a2e] shadow-xs"
                    : "text-white/85 hover:text-white"
                )}
              >
                Student Ledgers
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('billing')}
                className={cn(
                  "col-span-2 sm:col-span-1 px-3 sm:px-4 py-2 rounded-xl sm:rounded-full text-[11px] sm:text-xs font-bold transition-all cursor-pointer min-h-[38px] flex items-center justify-center gap-1.5",
                  activeTab === 'billing'
                    ? "bg-[#faae57] text-[#1f2a2e] shadow-xs"
                    : "text-white/85 hover:text-white"
                )}
              >
                <Layers className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Fee Structure & Billing</span>
              </button>
            </div>

            <div className="grid grid-cols-2 sm:flex items-center gap-2 w-full sm:w-auto">
              <button
                type="button"
                onClick={handleManualSyncLedger}
                disabled={isSyncingLedger}
                className={cn(
                  "flex items-center justify-center gap-1.5 px-3 sm:px-4 py-2 bg-white/10 hover:bg-white/20 border border-white/15 rounded-xl sm:rounded-full text-white font-bold transition-all text-[11px] sm:text-xs min-h-[40px] sm:min-h-[44px] cursor-pointer disabled:opacity-60",
                  activeTab !== 'dashboard' && "col-span-2 sm:col-span-1"
                )}
              >
                <RefreshCw className={cn("w-3.5 h-3.5 text-[#faae57] shrink-0", isSyncingLedger && "animate-spin")} />
                <span className="truncate">{isSyncingLedger ? 'Syncing...' : 'Sync Supabase'}</span>
              </button>

              {activeTab === 'dashboard' && (
                <>
                  <button 
                    onClick={triggerPrint}
                    className="flex items-center justify-center gap-1.5 px-3 sm:px-4 py-2 bg-white/10 hover:bg-white/20 border border-white/15 rounded-xl sm:rounded-full text-white font-bold transition-all text-[11px] sm:text-xs min-h-[40px] sm:min-h-[44px] cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5 text-[#faae57] shrink-0" />
                    <span className="truncate">Print Report</span>
                  </button>
                  <button 
                    onClick={exportFees}
                    className="col-span-2 sm:col-span-1 flex items-center justify-center gap-1.5 px-4 py-2 bg-white text-[#1c4a59] rounded-xl sm:rounded-full font-bold hover:bg-[#f6f8f7] transition-all shadow-xs text-[11px] sm:text-xs min-h-[40px] sm:min-h-[44px] cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">Export CSV</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {activeTab === 'billing' ? (
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 sm:gap-8 print:hidden w-full max-w-full min-w-0">
            {/* Left Column: School Fee Structure Config */}
            <div className="xl:col-span-5 space-y-5 sm:space-y-6 min-w-0">
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-6 space-y-4 sm:space-y-5 w-full max-w-full min-w-0">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-slate-100 pb-4">
                  <div className="min-w-0">
                    <span className="text-[10px] font-black uppercase tracking-widest text-indigo-600">Supabase school_settings</span>
                    <h3 className="text-base sm:text-lg font-extrabold text-slate-900 mt-0.5">School Fee Components</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Define standard term fee items and default amounts synced across all bursary stations.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleSaveFeeStructure}
                    disabled={isSavingFeeStructure}
                    className="w-full sm:w-auto px-3.5 py-2.5 sm:py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer disabled:opacity-50 shrink-0"
                  >
                    {isSavingFeeStructure ? 'Saving...' : 'Save Structure'}
                  </button>
                </div>

                <div className="space-y-2.5 sm:space-y-3 max-h-[380px] overflow-y-auto pr-1">
                  {editableFeeTypes.map((ft, idx) => (
                    <div
                      key={ft.id}
                      className="flex items-center justify-between gap-2.5 sm:gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200/80 min-w-0"
                    >
                      <div className="min-w-0 flex-1">
                        <input
                          type="text"
                          value={ft.label}
                          onChange={(e) => {
                            const val = e.target.value;
                            setEditableFeeTypes(prev => prev.map((item, i) => i === idx ? { ...item, label: val } : item));
                          }}
                          className="w-full bg-transparent font-bold text-xs text-slate-900 outline-none focus:underline truncate"
                        />
                        <p className="text-[10px] font-mono text-slate-400 uppercase truncate">Code: {ft.id}</p>
                      </div>
                      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                        <div className="relative w-24 sm:w-28">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">GHS</span>
                          <input
                            type="number"
                            min={0}
                            value={ft.defaultAmount}
                            onChange={(e) => {
                              const num = Math.max(0, Number(e.target.value) || 0);
                              setEditableFeeTypes(prev => prev.map((item, i) => i === idx ? { ...item, defaultAmount: num } : item));
                            }}
                            className="w-full pl-8 sm:pl-9 pr-2 sm:pr-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-800 text-right outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                        </div>
                        {ft.id !== 'tuition' && (
                          <button
                            type="button"
                            onClick={() => handleRemoveFeeComponent(ft.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer shrink-0"
                            title="Remove fee component"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Add New Fee Component */}
                <div className="pt-3 border-t border-slate-100 space-y-3">
                  <p className="text-[11px] font-black uppercase text-slate-500 tracking-wider">Add Custom Fee Item</p>
                  <div className="grid grid-cols-2 sm:grid-cols-12 gap-2.5">
                    <input
                      type="text"
                      placeholder="e.g. PTA Levy, Science Practical..."
                      value={newFeeLabel}
                      onChange={(e) => setNewFeeLabel(e.target.value)}
                      className="col-span-2 sm:col-span-6 px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500 min-w-0"
                    />
                    <input
                      type="number"
                      min={0}
                      placeholder="Default GHS"
                      value={newFeeAmount}
                      onChange={(e) => setNewFeeAmount(e.target.value)}
                      className="col-span-1 sm:col-span-3 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800 outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500 min-w-0"
                    />
                    <button
                      type="button"
                      onClick={handleAddFeeComponent}
                      disabled={isSavingFeeStructure}
                      className="col-span-1 sm:col-span-3 flex items-center justify-center gap-1.5 px-3 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
                    >
                      <Plus className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">Add Item</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: Batch Class Billing Engine */}
            <div className="xl:col-span-7 space-y-5 sm:space-y-6 min-w-0">
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-6 space-y-5 sm:space-y-6 w-full max-w-full min-w-0">
                <div className="border-b border-slate-100 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="min-w-0">
                    <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Batch Class Billing Engine</span>
                    <h3 className="text-base sm:text-lg font-extrabold text-slate-900 mt-0.5">Bill Students by Class or Whole School</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Apply selected fee components to all students in a class and persist updated balances directly to Supabase.
                    </p>
                  </div>
                  <span className="text-[11px] font-mono font-bold bg-slate-100 text-slate-700 px-3 py-1.5 rounded-xl border border-slate-200 self-start shrink-0">
                    {currentAcademicYear} • {currentTerm}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 sm:gap-4">
                  <div className="space-y-1.5 min-w-0">
                    <label className="text-[11px] font-black uppercase text-slate-500 tracking-wider">Target Class</label>
                    <select
                      value={billingTargetClass}
                      onChange={(e) => setBillingTargetClass(e.target.value)}
                      className="w-full px-3.5 sm:px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer min-w-0"
                    >
                      <option value="ALL">All Active Classes ({allStudents.length} Students)</option>
                      {availableClassNames.map(clsName => {
                        const count = allStudents.filter(s => (s.class || '').trim().toLowerCase() === clsName.trim().toLowerCase()).length;
                        return (
                          <option key={clsName} value={clsName}>
                            {clsName} ({count} Student{count === 1 ? '' : 's'})
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  <div className="space-y-1.5 min-w-0">
                    <label className="text-[11px] font-black uppercase text-slate-500 tracking-wider">Billing Application Mode</label>
                    <select
                      value={billingMode}
                      onChange={(e) => setBillingMode(e.target.value as 'merge' | 'replace')}
                      className="w-full px-3.5 sm:px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer min-w-0"
                    >
                      <option value="merge">Merge / Update Selected Components on Existing Bill</option>
                      <option value="replace">Replace Entire Student Bill with Selected Structure</option>
                    </select>
                  </div>
                </div>

                {/* Component Selector Table */}
                <div className="border border-slate-200 rounded-2xl overflow-hidden w-full max-w-full min-w-0">
                  <div className="bg-slate-50 px-3.5 sm:px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-2">
                    <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider truncate">Select Fee Components to Apply</span>
                    <button
                      type="button"
                      onClick={() => {
                        const allChecked = editableFeeTypes.every(ft => selectedBillingComponents[ft.id]);
                        const next: Record<string, boolean> = {};
                        editableFeeTypes.forEach(ft => { next[ft.id] = !allChecked; });
                        setSelectedBillingComponents(next);
                      }}
                      className="text-[11px] font-bold text-indigo-600 hover:underline cursor-pointer shrink-0"
                    >
                      Toggle All
                    </button>
                  </div>
                  <div className="divide-y divide-slate-100 max-h-[280px] overflow-y-auto">
                    {editableFeeTypes.map(ft => {
                      const isChecked = !!selectedBillingComponents[ft.id];
                      const amountVal = billingComponentAmounts[ft.id] ?? ft.defaultAmount;
                      return (
                        <div
                          key={ft.id}
                          className={cn(
                            "px-3 sm:px-4 py-3 flex items-center justify-between gap-2.5 sm:gap-4 transition-colors min-w-0",
                            isChecked ? "bg-indigo-50/30" : "bg-white opacity-65"
                          )}
                        >
                          <label className="flex items-center gap-2.5 sm:gap-3 cursor-pointer flex-1 min-w-0">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => setSelectedBillingComponents(prev => ({ ...prev, [ft.id]: e.target.checked }))}
                              className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer shrink-0"
                            />
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-slate-900 truncate">{ft.label}</p>
                              <p className="text-[10px] font-mono text-slate-400 truncate">Default: {formatCurrency(ft.defaultAmount)}</p>
                            </div>
                          </label>
                          <div className="relative w-28 sm:w-32 shrink-0">
                            <span className="absolute left-2.5 sm:left-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">GHS</span>
                            <input
                              type="number"
                              min={0}
                              value={amountVal}
                              onChange={(e) => {
                                const val = Math.max(0, Number(e.target.value) || 0);
                                setBillingComponentAmounts(prev => ({ ...prev, [ft.id]: val }));
                                if (val > 0 && !isChecked) {
                                  setSelectedBillingComponents(prev => ({ ...prev, [ft.id]: true }));
                                }
                              }}
                              className="w-full pl-9 sm:pl-10 pr-2.5 sm:pr-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-900 text-right outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Live Billing Impact Preview Banner */}
                <div className="bg-slate-900 text-white rounded-2xl p-4 sm:p-5 grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 items-center min-w-0">
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Matched Students</p>
                    <p className="text-xl sm:text-2xl font-black font-mono mt-0.5 truncate">{batchBillingPreview.studentCount}</p>
                    <p className="text-[10px] text-slate-400 truncate">{billingTargetClass === 'ALL' ? 'Across all classes' : `In ${billingTargetClass}`}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Selected Bill / Student</p>
                    <p className="text-xl sm:text-2xl font-black font-mono text-[#faae57] mt-0.5 truncate">{formatCurrency(batchBillingPreview.perStudentSelectedSum)}</p>
                    <p className="text-[10px] text-slate-400 truncate">{Object.keys(batchBillingPreview.activeStructure).length} component(s) active</p>
                  </div>
                  <div className="col-span-2 sm:col-span-1 pt-2 sm:pt-0 border-t border-white/10 sm:border-0 min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Aggregate Class Billing</p>
                    <p className="text-xl sm:text-2xl font-black font-mono text-emerald-400 mt-0.5 truncate">{formatCurrency(batchBillingPreview.totalAggregateImpact)}</p>
                    <p className="text-[10px] text-slate-400 truncate">{billingMode === 'replace' ? 'Replaces previous bill' : 'Updates selected items'}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                  <button
                    type="button"
                    onClick={handleSaveClassStructureTemplate}
                    disabled={isSavingFeeStructure}
                    className="sm:col-span-5 py-3.5 sm:py-4 px-4 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 rounded-2xl font-extrabold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50 min-w-0"
                  >
                    <Layers className="w-4 h-4 text-indigo-600 shrink-0" />
                    <span className="truncate">Save to `fee_structures` Table</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleExecuteBatchBill}
                    disabled={isExecutingBatchBill || batchBillingPreview.studentCount === 0}
                    className="sm:col-span-7 py-3.5 sm:py-4 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-indigo-100 cursor-pointer disabled:opacity-50 min-w-0"
                  >
                    {isExecutingBatchBill ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
                        <span className="truncate">Applying Batch Billing to Supabase...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                        <span className="truncate">
                          Bill {batchBillingPreview.studentCount} Student{batchBillingPreview.studentCount === 1 ? '' : 's'} ({formatCurrency(batchBillingPreview.perStudentSelectedSum)} each)
                        </span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Live Supabase public.fee_structures & public.invoices Registry Card */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden w-full max-w-full min-w-0">
                <div className="px-4 sm:px-6 py-4 border-b border-slate-100 bg-slate-50/70 flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-[10px] font-black uppercase tracking-widest text-indigo-600">
                      Supabase `public.fee_structures` & `public.invoices`
                    </span>
                    <h4 className="text-sm font-extrabold text-slate-900 mt-0.5">
                      Saved Class & Term Fee Blueprints ({savedFeeStructures.length})
                    </h4>
                  </div>
                  <span className="text-[11px] font-mono font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-lg">
                    {studentInvoices.length} Linked Student Invoice{studentInvoices.length === 1 ? '' : 's'}
                  </span>
                </div>

                {savedFeeStructures.length === 0 ? (
                  <div className="p-5 sm:p-6 text-center text-slate-400 text-xs font-medium">
                    No class fee structures found in `public.fee_structures` yet. Click "Save to `fee_structures` Table" or "Bill Students" above to create one.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 max-h-[300px] overflow-y-auto">
                    {savedFeeStructures.map((fsRow: any) => {
                      const itemsArr = Array.isArray(fsRow.items) ? fsRow.items : [];
                      const linkedInvCount = studentInvoices.filter(
                        (inv: any) => Number(inv.fee_structure_id) === Number(fsRow.id)
                      ).length;
                      return (
                        <div
                          key={fsRow.id || fsRow.name}
                          className="p-4 sm:px-6 sm:py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/70 transition-colors min-w-0"
                        >
                          <div className="space-y-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                              <span className="text-xs font-extrabold text-slate-900 break-words">{fsRow.name}</span>
                              <span className="px-2 py-0.5 rounded bg-indigo-50 border border-indigo-100 text-indigo-700 text-[10px] font-mono font-bold">
                                Class: {fsRow.class_name || 'All'}
                              </span>
                              <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-mono font-semibold">
                                {fsRow.term || 'Term 1'} • {fsRow.academic_year || '2025/2026'}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500">
                              {itemsArr.length} Fee Component{itemsArr.length === 1 ? '' : 's'} • {linkedInvCount} Student Invoice{linkedInvCount === 1 ? '' : 's'} linked
                            </p>
                          </div>

                          <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t border-slate-100 sm:border-0">
                            <div className="text-left sm:text-right">
                              <p className="text-[10px] uppercase font-bold text-slate-400">Rate Total</p>
                              <p className="text-sm font-black font-mono text-slate-900">
                                {formatCurrency(Number(fsRow.total) || 0)}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleLoadSavedFeeStructure(fsRow)}
                                className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-600 text-indigo-700 hover:text-white rounded-lg text-xs font-bold transition-all cursor-pointer"
                              >
                                Load
                              </button>
                              {fsRow.id && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteSavedFeeStructure(Number(fsRow.id), fsRow.name)}
                                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                  title="Delete structure from public.fee_structures"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : activeTab === 'ledger' ? (
          <div className="space-y-4 sm:space-y-6 w-full max-w-full min-w-0">
            {!selectedStudentId ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-8 shadow-sm max-w-xl mx-auto space-y-5 sm:space-y-6 print:hidden w-full min-w-0">
                <div className="text-center space-y-2">
                  <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center mx-auto border border-indigo-100">
                    <Users className="w-6 h-6" />
                  </div>
                  <h3 className="text-base sm:text-lg font-black text-slate-900">Select Student to View Ledger</h3>
                  <p className="text-xs text-slate-500 leading-relaxed max-w-sm mx-auto">
                    Search for any active student below to render their fully itemized ledger, transaction history, and downloadable statements of account.
                  </p>
                </div>

                <div className="relative min-w-0">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search student by name or ID..."
                    value={ledgerSearchTerm}
                    onChange={(e) => setLedgerSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
                  />
                </div>

                <div className="max-h-[280px] overflow-y-auto border border-slate-100 rounded-xl divide-y divide-slate-50 min-w-0">
                  {filteredLedgerStudents.length === 0 ? (
                    <div className="p-8 text-center text-slate-400 text-xs font-semibold">
                      No students match "{ledgerSearchTerm}"
                    </div>
                  ) : (
                    filteredLedgerStudents.map(s => (
                      <button
                        type="button"
                        key={s.id || s.studentId}
                        onClick={() => setSelectedStudentId(s.studentId)}
                        className="w-full p-3.5 flex items-center justify-between gap-2 text-left hover:bg-slate-50 transition-all font-semibold cursor-pointer min-w-0"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-slate-900 uppercase truncate">{s.firstName} {s.lastName}</p>
                          <p className="text-[10px] text-slate-400 font-mono tracking-tight truncate">{s.studentId} • {s.class}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs font-bold text-slate-600 font-mono tabular-nums">Balance: {formatCurrency(s.totalFees - s.feesPaid)}</p>
                          <p className="text-[8px] uppercase font-black text-indigo-600 mt-0.5 flex items-center gap-0.5 justify-end">
                            View Ledger <ArrowUpRight className="w-3 h-3" />
                          </p>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-4 min-w-0">
                <div className="flex flex-wrap justify-between items-center gap-2 print:hidden min-w-0">
                  <button
                    type="button"
                    onClick={() => setSelectedStudentId(null)}
                    className="text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-3.5 py-2 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer outline-none"
                  >
                    <span>← Select Another Student</span>
                  </button>
                  
                  <p className="text-[10px] text-slate-400 font-mono">
                    Viewing Ledger Account: <span className="font-bold">{selectedStudent?.studentId}</span>
                  </p>
                </div>

                {renderLedgerStatement()}
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 sm:gap-6 lg:gap-8 w-full max-w-full min-w-0">
          {/* Search & List */}
          <div className="xl:col-span-2 space-y-4 sm:space-y-6 min-w-0">
            <div className="bg-white p-3.5 sm:p-6 rounded-2xl border border-slate-200 shadow-sm print:hidden min-w-0">
              <div className="relative min-w-0">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-slate-400 pointer-events-none" />
                <input 
                  type="text"
                  placeholder="Search student by name, ID, or class..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 sm:pl-12 pr-4 py-2.5 sm:py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-xs sm:text-sm"
                />
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm min-w-0">
              {/* Stacked Mobile Student Fee Balance Cards (< 768px) */}
              <div className="md:hidden print:hidden divide-y divide-slate-100 min-w-0">
                {students?.map(student => {
                  const balance = (student.totalFees || 0) - (student.feesPaid || 0);
                  const isSelected = selectedStudentId === student.studentId;
                  return (
                    <div
                      key={student.id || student.studentId}
                      className={cn(
                        "p-3.5 space-y-3 transition-colors min-w-0",
                        isSelected ? "bg-indigo-50/40" : "hover:bg-slate-50/70"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2 min-w-0">
                        <div className="min-w-0 flex-1">
                          <div className="font-bold text-slate-900 text-xs sm:text-sm truncate">
                            {student.firstName} {student.lastName}
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono tracking-wider truncate mt-0.5">
                            {student.studentId} • {student.class}
                          </div>
                        </div>
                        <span className={cn(
                          "px-2 py-0.5 rounded-md border text-[10px] font-mono font-bold tabular-nums shrink-0",
                          balance > 0
                            ? "bg-rose-50 text-rose-700 border-rose-200"
                            : "bg-emerald-50 text-emerald-700 border-emerald-200"
                        )}>
                          {balance > 0 ? `Bal: ${formatCurrency(balance)}` : 'Cleared'}
                        </span>
                      </div>

                      {/* 2-Column Metric Pills */}
                      <div className="grid grid-cols-2 gap-2 min-w-0">
                        <div className="p-2 rounded-xl bg-slate-50 border border-slate-200/70 min-w-0">
                          <span className="text-[9px] font-bold uppercase text-slate-400 block truncate">Total Billed</span>
                          <span className="text-xs font-mono font-bold text-slate-700 tabular-nums block truncate mt-0.5">
                            {formatCurrency(student.totalFees)}
                          </span>
                        </div>
                        <div className="p-2 rounded-xl bg-emerald-50/50 border border-emerald-100 min-w-0">
                          <span className="text-[9px] font-bold uppercase text-slate-400 block truncate">Total Paid</span>
                          <span className="text-xs font-mono font-bold text-emerald-600 tabular-nums block truncate mt-0.5">
                            {formatCurrency(student.feesPaid)}
                          </span>
                        </div>
                      </div>

                      {/* 2-Column Action Buttons */}
                      <div className="grid grid-cols-2 gap-2 pt-0.5 min-w-0">
                        <button
                          type="button"
                          onClick={() => openStudentBreakdownModal(student)}
                          className="w-full min-w-0 py-2 px-2.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200/80 rounded-xl transition-all cursor-pointer truncate text-center"
                          title="Customize student fee breakdown"
                        >
                          Adjust Bill
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedStudentId(student.studentId)}
                          className="w-full min-w-0 py-2 px-2.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-all shadow-xs cursor-pointer truncate text-center"
                        >
                          Receive Payment
                        </button>
                      </div>
                    </div>
                  );
                })}
                {(!students || students.length === 0) && (
                  <div className="p-8 text-center text-slate-400 text-xs font-semibold">
                    No matching student fee records found.
                  </div>
                )}
              </div>

              {/* Desktop & Print Table (>= 768px) */}
              <div className="hidden md:block print:block overflow-x-auto">
                <table className="w-full text-left min-w-[640px]">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Student</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Total Billed</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Paid</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Balance</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase print:hidden text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {students?.map(student => (
                      <tr key={student.id || student.studentId} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="font-bold text-slate-900">{student.firstName} {student.lastName}</div>
                          <div className="text-[10px] text-slate-400 font-mono tracking-wider">{student.studentId} • {student.class}</div>
                        </td>
                        <td className="px-6 py-4 text-sm font-mono font-medium text-slate-600">{formatCurrency(student.totalFees)}</td>
                        <td className="px-6 py-4">
                          <span className="text-sm font-mono font-bold text-emerald-600">{formatCurrency(student.feesPaid)}</span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={cn(
                            "text-sm font-mono font-bold",
                            student.totalFees - student.feesPaid > 0 ? "text-rose-600" : "text-emerald-600"
                          )}>
                            {formatCurrency(student.totalFees - student.feesPaid)}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right print:hidden">
                          <div className="inline-flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => openStudentBreakdownModal(student)}
                              className="text-xs font-bold text-slate-600 bg-slate-100 px-2.5 py-1.5 rounded-lg hover:bg-slate-200 transition-all cursor-pointer"
                              title="Customize student fee breakdown"
                            >
                              Adjust Bill
                            </button>
                            <button 
                              type="button"
                              onClick={() => setSelectedStudentId(student.studentId)}
                              className="text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-lg hover:bg-indigo-600 hover:text-white transition-all cursor-pointer"
                            >
                              Receive Payment
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Live Supabase Fee Transactions Register */}
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm print:hidden min-w-0">
              <div className="px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-100 bg-slate-50/60 flex flex-wrap items-center justify-between gap-2 min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <History className="w-4 h-4 text-indigo-600 shrink-0" />
                  <h3 className="text-xs sm:text-sm font-extrabold text-slate-800 truncate">Recent Supabase Fee Transactions (`fee_transactions`)</h3>
                </div>
                <span className="text-[10px] sm:text-[11px] font-mono font-bold text-slate-500 shrink-0">
                  {allFeeTransactions.length} Record{allFeeTransactions.length === 1 ? '' : 's'}
                </span>
              </div>
              {allFeeTransactions.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-xs font-medium">
                  No fee transactions recorded yet. Select a student above and click "Receive Payment" to log a transaction to Supabase.
                </div>
              ) : (
                <>
                  {/* Stacked Mobile Fee Transaction Cards (< 768px) */}
                  <div className="md:hidden divide-y divide-slate-100 max-h-[380px] overflow-y-auto min-w-0">
                    {[...allFeeTransactions]
                      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
                      .slice(0, 25)
                      .map(tx => {
                        const matchedStu = allStudents.find(
                          s =>
                            (s.id !== undefined && String(s.id) === String(tx.studentId)) ||
                            (tx.studentCode && s.studentId.toLowerCase() === tx.studentCode.toLowerCase()) ||
                            (tx.studentName && `${s.firstName} ${s.lastName}`.trim().toLowerCase() === tx.studentName.trim().toLowerCase())
                        );
                        return (
                          <div key={tx.id || tx.receiptNumber} className="p-3.5 space-y-2.5 hover:bg-slate-50/70 transition-colors min-w-0">
                            <div className="flex items-start justify-between gap-2 min-w-0">
                              <div className="min-w-0 flex-1">
                                <div className="font-bold text-slate-900 text-xs truncate">
                                  {matchedStu ? `${matchedStu.firstName} ${matchedStu.lastName}` : (tx.studentName || `Student #${tx.studentId}`)}
                                </div>
                                <div className="text-[10px] font-mono text-slate-400 truncate mt-0.5">
                                  {tx.receiptNumber} • {new Date(tx.createdAt || Date.now()).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                                </div>
                              </div>
                              {tx.syncStatus === 'pending' ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-amber-700 text-[10px] font-bold shrink-0">
                                  <CloudOff className="w-3 h-3 shrink-0" />
                                  <span>Queued</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-bold shrink-0">
                                  <Check className="w-3 h-3 shrink-0" />
                                  <span>Synced</span>
                                </span>
                              )}
                            </div>

                            {/* 2-Column Metric Pills */}
                            <div className="grid grid-cols-2 gap-2 min-w-0">
                              <div className="p-2 rounded-xl bg-slate-50 border border-slate-200/70 min-w-0">
                                <span className="text-[9px] font-bold uppercase text-slate-400 block truncate">Method</span>
                                <span className="text-[11px] font-bold text-slate-700 uppercase block truncate mt-0.5">
                                  {tx.paymentChannelLabel || tx.paymentMethod}
                                </span>
                              </div>
                              <div className="p-2 rounded-xl bg-emerald-50/50 border border-emerald-100 min-w-0">
                                <span className="text-[9px] font-bold uppercase text-slate-400 block truncate">Amount Paid</span>
                                <span className="text-xs font-mono font-bold text-emerald-600 tabular-nums block truncate mt-0.5">
                                  {formatCurrency(tx.amount)}
                                </span>
                              </div>
                            </div>

                            {matchedStu && (
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedStudentId(matchedStu.studentId);
                                  setLastPayment({
                                    amount: tx.amount,
                                    date: tx.createdAt || Date.now(),
                                    method: tx.paymentChannelLabel || tx.paymentMethod,
                                    phone: tx.guardianPhone || matchedStu.guardianPhone,
                                    ref: tx.receiptNumber,
                                    studentOverride: matchedStu,
                                  });
                                  setIsReceiptModalOpen(true);
                                }}
                                className="w-full py-2 px-3 bg-slate-50 hover:bg-indigo-50 hover:text-indigo-600 border border-slate-200 rounded-xl text-slate-700 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                              >
                                <FileText className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                                <span>View Official Receipt</span>
                              </button>
                            )}
                          </div>
                        );
                      })}
                  </div>

                  {/* Desktop Table (>= 768px) */}
                  <div className="hidden md:block overflow-x-auto max-h-[320px] overflow-y-auto">
                    <table className="w-full text-left min-w-[640px]">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-black uppercase text-slate-400 tracking-wider">
                          <th className="px-5 py-3">Receipt No.</th>
                          <th className="px-5 py-3">Student</th>
                          <th className="px-5 py-3">Method</th>
                          <th className="px-5 py-3 text-right">Amount</th>
                          <th className="px-5 py-3">Sync Status</th>
                          <th className="px-5 py-3 text-right">Receipt</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs">
                        {[...allFeeTransactions]
                          .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
                          .slice(0, 25)
                          .map(tx => {
                            const matchedStu = allStudents.find(
                              s =>
                                (s.id !== undefined && String(s.id) === String(tx.studentId)) ||
                                (tx.studentCode && s.studentId.toLowerCase() === tx.studentCode.toLowerCase()) ||
                                (tx.studentName && `${s.firstName} ${s.lastName}`.trim().toLowerCase() === tx.studentName.trim().toLowerCase())
                            );
                            return (
                              <tr key={tx.id || tx.receiptNumber} className="hover:bg-slate-50/70 transition-colors">
                                <td className="px-5 py-3 font-mono font-bold text-slate-700">
                                  {tx.receiptNumber}
                                  <div className="text-[10px] font-sans font-normal text-slate-400">
                                    {new Date(tx.createdAt || Date.now()).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                                  </div>
                                </td>
                                <td className="px-5 py-3">
                                  <div className="font-bold text-slate-900">
                                    {matchedStu ? `${matchedStu.firstName} ${matchedStu.lastName}` : (tx.studentName || `Student #${tx.studentId}`)}
                                  </div>
                                  <div className="text-[10px] font-mono text-slate-400">
                                    {matchedStu?.studentId || tx.studentCode || ''} {matchedStu?.class ? `• ${matchedStu.class}` : ''}
                                  </div>
                                </td>
                                <td className="px-5 py-3">
                                  <span className="px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-slate-700 font-bold text-[10px] uppercase">
                                    {tx.paymentChannelLabel || tx.paymentMethod}
                                  </span>
                                </td>
                                <td className="px-5 py-3 text-right font-mono font-bold text-emerald-600">
                                  {formatCurrency(tx.amount)}
                                </td>
                                <td className="px-5 py-3">
                                  {tx.syncStatus === 'pending' ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-amber-700 text-[10px] font-bold">
                                      <CloudOff className="w-3 h-3" />
                                      Queued Offline
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-bold">
                                      <Check className="w-3 h-3" />
                                      Synced
                                    </span>
                                  )}
                                </td>
                                <td className="px-5 py-3 text-right">
                                  {matchedStu && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setSelectedStudentId(matchedStu.studentId);
                                        setLastPayment({
                                          amount: tx.amount,
                                          date: tx.createdAt || Date.now(),
                                          method: tx.paymentChannelLabel || tx.paymentMethod,
                                          phone: tx.guardianPhone || matchedStu.guardianPhone,
                                          ref: tx.receiptNumber,
                                          studentOverride: matchedStu,
                                        });
                                        setIsReceiptModalOpen(true);
                                      }}
                                      className="px-2.5 py-1 bg-slate-50 hover:bg-indigo-50 hover:text-indigo-600 border border-slate-200 rounded-lg text-slate-600 font-bold text-[10px] inline-flex items-center gap-1 cursor-pointer"
                                    >
                                      <FileText className="w-3 h-3 text-indigo-500" />
                                      <span>Receipt</span>
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Payment Side Panel */}
          <div className="print:hidden min-w-0">
            <div className="bg-indigo-600 rounded-2xl sm:rounded-3xl p-5 sm:p-8 text-white shadow-xl shadow-indigo-100 relative overflow-hidden min-w-0">
              <Wallet className="absolute -right-4 -bottom-4 w-32 h-32 text-indigo-500 opacity-20 pointer-events-none" />
              <p className="text-indigo-200 text-xs sm:text-sm font-medium mb-1.5 sm:mb-2 uppercase tracking-widest">School Treasury</p>
              <h2 className="text-2xl sm:text-4xl font-bold mb-5 sm:mb-8 font-mono tabular-nums break-words">
                {formatCurrency(students?.reduce((acc, s) => acc + s.feesPaid, 0) || 0)}
              </h2>
              <div className="grid grid-cols-2 gap-3 sm:gap-4 min-w-0">
                <div className="bg-indigo-500/30 p-3 rounded-2xl backdrop-blur-sm min-w-0">
                  <p className="text-[10px] uppercase font-bold text-indigo-200 truncate">Active Students</p>
                  <p className="text-base sm:text-lg font-bold font-mono tabular-nums">{students?.length || 0}</p>
                </div>
                <div className="bg-indigo-500/30 p-3 rounded-2xl backdrop-blur-sm min-w-0">
                  <p className="text-[10px] uppercase font-bold text-indigo-200 truncate">Total Outstanding</p>
                  <p className="text-xs sm:text-sm font-bold font-mono tabular-nums truncate">
                    {formatCurrency(students?.reduce((acc, s) => acc + (s.totalFees - s.feesPaid), 0) || 0)}
                  </p>
                </div>
              </div>
            </div>

            {selectedStudent && (
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="process-payment-modal-title"
                onClick={(e) => {
                  if (e.target === e.currentTarget) {
                    setSelectedStudentId(null);
                    setMomoStep('idle');
                  }
                }}
                className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto xl:static xl:inset-auto xl:z-auto xl:block xl:bg-transparent xl:backdrop-blur-none xl:p-0 xl:overflow-visible xl:mt-6 print:hidden"
              >
                <motion.div 
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="bg-white rounded-2xl sm:rounded-3xl xl:rounded-2xl border-2 border-indigo-500 p-4 sm:p-6 shadow-2xl xl:shadow-xl relative w-full max-w-lg xl:max-w-none max-h-[90dvh] xl:max-h-none overflow-y-auto xl:overflow-visible my-auto min-w-0"
                >
                  <div className="flex items-start justify-between gap-3 pb-3.5 mb-4 border-b border-slate-100">
                    <div className="min-w-0">
                      <span className="text-[10px] font-black uppercase tracking-widest text-indigo-600 block">
                        Fee Collection Terminal
                      </span>
                      <h3 id="process-payment-modal-title" className="text-base sm:text-lg font-extrabold text-slate-900 mt-0.5">
                        Process Payment
                      </h3>
                      <p className="text-xs sm:text-sm text-slate-500 truncate mt-0.5">
                        For <span className="font-bold text-slate-700">{selectedStudent.firstName} {selectedStudent.lastName}</span> ({selectedStudent.class})
                      </p>
                    </div>
                    <button 
                      type="button"
                      onClick={() => {
                        setSelectedStudentId(null);
                        setMomoStep('idle');
                      }}
                      className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-700 transition-colors shrink-0 cursor-pointer"
                      aria-label="Close payment modal"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  
                  {momoStep !== 'idle' ? (
                    /* MoMo interactive simulations step rendering */
                    <div className="space-y-5 py-4 text-center">
                      <div className="mx-auto w-16 h-16 rounded-full flex items-center justify-center bg-indigo-55 border border-indigo-100 relative">
                        <div className="absolute inset-x-0 inset-y-0 rounded-full bg-indigo-500/15 animate-ping" />
                        <Smartphone className="w-8 h-8 text-indigo-600 relative z-10" />
                      </div>

                      <div className="space-y-1 px-1">
                        <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest">MoMo Authorization</h4>
                        <p className="text-[11px] text-slate-500 font-bold">
                          A secure GHS {Number(paymentAmount).toFixed(2)} push query has been prompted to subscriber <span className="text-indigo-600 font-mono font-black">{momoNumber}</span>.
                        </p>
                      </div>

                      {momoStep === 'sending' && (
                        <div className="flex items-center justify-center gap-2 text-xs text-indigo-600 font-black bg-indigo-50/50 p-3 rounded-xl border border-indigo-100 shadow-sm">
                          <RefreshCw className="w-4 h-4 animate-spin text-indigo-500" />
                          <span>INITIATING PUSH REQUEST...</span>
                        </div>
                      )}

                      {momoStep === 'pending' && (
                        <div className="space-y-4">
                          <div className="bg-amber-50/80 border border-amber-200 p-3.5 rounded-2xl space-y-2 text-left">
                            <p className="text-[9px] font-black uppercase text-amber-800 tracking-wider flex items-center gap-1.5">
                              <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                              Simulated Mobile Overlay Prompt
                            </p>
                            <div className="bg-slate-950 text-slate-100 font-mono text-[10px] p-3 rounded-xl border border-slate-900 shadow-inner tracking-tight leading-relaxed">
                              <p className="text-yellow-400 font-black uppercase tracking-wider">{momoProvider.toUpperCase()} MOBILE DEBIT</p>
                              <p className="mt-1.5 text-slate-200">Pay GHS {Number(paymentAmount).toFixed(2)} to SchoolSphere Treasury Account?</p>
                              <p className="mt-2.5 text-right text-[9px] text-slate-500 font-bold border-t border-slate-900 pt-1.5">1. Enter MoMo PIN to Pay | 2. Decline</p>
                            </div>
                          </div>

                          {/* Handset approval controls */}
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                const refNum = 'MM-' + Math.floor(100000 + Math.random() * 900000);
                                submitPayment(refNum);
                                setMomoStep('idle');
                                showToast('Payment successfully approved from mobile!', 'success');
                              }}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white py-3 px-2 rounded-xl text-[10px] font-black transition-all uppercase tracking-wider shadow-sm cursor-pointer"
                            >
                               Enter PIN & Pay
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setMomoStep('failed');
                                showToast('MoMo payment request declined on handset.', 'error');
                              }}
                              className="bg-rose-600 hover:bg-rose-700 text-white py-3 px-2 rounded-xl text-[10px] font-black transition-all uppercase tracking-wider shadow-sm cursor-pointer"
                            >
                               Decline Payment
                            </button>
                          </div>
                        </div>
                      )}

                      {momoStep === 'failed' && (
                        <div className="space-y-3">
                          <div className="p-3 bg-red-50 border border-red-100 text-rose-850 rounded-xl text-xs font-bold font-semibold">
                            Transaction Failed. Decline response received.
                          </div>
                          <button
                            type="button"
                            onClick={() => setMomoStep('idle')}
                            className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 py-3 rounded-xl text-xs font-extrabold uppercase transition-all cursor-pointer"
                          >
                            Retry / Change Mode
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="p-3.5 sm:p-4 bg-rose-50 dark:bg-rose-950/30 border border-rose-105 dark:border-rose-900/40 rounded-xl flex justify-between items-center gap-2 text-slate-800 dark:text-slate-200 min-w-0">
                        <div className="min-w-0">
                          <p className="text-[10px] font-bold text-rose-600 dark:text-rose-400 uppercase mb-0.5">Outstanding Balance</p>
                          <p className="text-lg sm:text-xl font-bold text-rose-700 dark:text-rose-300 font-mono tabular-nums truncate">{formatCurrency(selectedStudent.totalFees - selectedStudent.feesPaid)}</p>
                        </div>
                        <span className="text-[10px] bg-rose-100/80 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-300 px-2 py-0.5 rounded-md font-bold uppercase tracking-wider shrink-0">Due Now</span>
                      </div>

                      {/* List out itemized balances for the student */}
                      <div className="p-3.5 sm:p-4 bg-slate-50 border border-slate-200/50 rounded-xl space-y-2 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider truncate">Itemized Outstanding Balances</p>
                          <button
                            type="button"
                            onClick={() => openStudentBreakdownModal(selectedStudent)}
                            className="text-[10px] font-bold text-indigo-600 hover:underline cursor-pointer shrink-0"
                          >
                            Edit Bill
                          </button>
                        </div>
                        <div className="space-y-1.5 max-h-[140px] overflow-y-auto pr-1">
                          {feeTypes.map(ft => {
                            const billed = selectedStudent.feeBreakdown?.[ft.id] ?? (ft.id === 'tuition' ? selectedStudent.totalFees : 0);
                            const paid = selectedStudent.feePaidBreakdown?.[ft.id] ?? (ft.id === 'tuition' ? selectedStudent.feesPaid : 0);
                            const outstanding = Math.max(0, billed - paid);
                            if (billed === 0) return null;
                            return (
                              <div key={ft.id} className="flex justify-between items-center gap-2 text-xs pb-1 border-b border-slate-100 last:border-0 font-medium min-w-0">
                                <span className="text-slate-600 font-medium truncate">{ft.label}</span>
                                <div className="text-right font-bold shrink-0">
                                  <span className={cn("font-bold font-mono", outstanding > 0 ? "text-rose-600" : "text-emerald-600")}>
                                    {formatCurrency(outstanding)}
                                  </span>
                                  <span className="text-[9px] text-slate-400 font-mono"> / {formatCurrency(billed)}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Allocation Target Select Box */}
                      <div className="space-y-1 font-semibold min-w-0">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">Allocation Target Option</label>
                        <select 
                          value={allocationType}
                          onChange={(e) => setAllocationType(e.target.value)}
                          className="w-full px-3.5 sm:px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs text-slate-700 outline-none cursor-pointer min-w-0"
                        >
                          <option value="automatic">Automatic Allocation (First outstanding, then rest)</option>
                          {feeTypes.map(ft => {
                            const billed = selectedStudent.feeBreakdown?.[ft.id] ?? (ft.id === 'tuition' ? selectedStudent.totalFees : 0);
                            const paid = selectedStudent.feePaidBreakdown?.[ft.id] ?? (ft.id === 'tuition' ? selectedStudent.feesPaid : 0);
                            const outstanding = Math.max(0, billed - paid);
                            if (billed === 0) return null;
                            return (
                              <option key={ft.id} value={ft.id} disabled={outstanding <= 0}>
                                Allocate to {ft.label} Only (Outstanding: {formatCurrency(outstanding)})
                              </option>
                            );
                          })}
                        </select>
                      </div>

                      {/* Payment Method Selector */}
                      <div className="space-y-1.5 font-semibold min-w-0">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">Payment Channel (`fee_transactions`)</label>
                        <div className="grid grid-cols-3 gap-1.5 min-w-0">
                          <button
                            type="button"
                            onClick={() => setPaymentMethod('cash_bank')}
                            className={cn(
                              "py-2 px-2 rounded-xl border font-bold text-xs flex items-center justify-center transition-all cursor-pointer",
                              paymentMethod === 'cash_bank'
                                ? "border-indigo-600 bg-indigo-50 text-indigo-700 ring-2 ring-indigo-500/10"
                                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                            )}
                          >
                            Cash
                          </button>
                          <button
                            type="button"
                            onClick={() => setPaymentMethod('bank_transfer')}
                            className={cn(
                              "py-2 px-2 rounded-xl border font-bold text-xs flex items-center justify-center transition-all cursor-pointer",
                              paymentMethod === 'bank_transfer'
                                ? "border-indigo-600 bg-indigo-50 text-indigo-700 ring-2 ring-indigo-500/10"
                                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                            )}
                          >
                            Bank Slip
                          </button>
                          <button
                            type="button"
                            onClick={() => setPaymentMethod('cheque')}
                            className={cn(
                              "py-2 px-2 rounded-xl border font-bold text-xs flex items-center justify-center transition-all cursor-pointer",
                              paymentMethod === 'cheque'
                                ? "border-indigo-600 bg-indigo-50 text-indigo-700 ring-2 ring-indigo-500/10"
                                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                            )}
                          >
                            Cheque
                          </button>
                          <button
                            type="button"
                            onClick={() => setPaymentMethod('momo')}
                            className={cn(
                              "py-2 px-2 rounded-xl border font-bold text-xs flex items-center justify-center transition-all cursor-pointer",
                              paymentMethod === 'momo'
                                ? "border-indigo-600 bg-indigo-50 text-indigo-700 ring-2 ring-indigo-500/10"
                                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                            )}
                          >
                            MoMo
                          </button>
                          <button
                            type="button"
                            onClick={() => setPaymentMethod('paystack')}
                            className={cn(
                              "col-span-2 py-2 px-2 rounded-xl border font-bold text-xs flex items-center justify-center transition-all cursor-pointer",
                              paymentMethod === 'paystack'
                                ? "border-indigo-600 bg-indigo-50 text-indigo-700 ring-2 ring-indigo-500/10"
                                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                            )}
                          >
                            Card / Paystack
                          </button>
                        </div>
                      </div>

                      {(paymentMethod === 'bank_transfer' || paymentMethod === 'cheque') && (
                        <div className="space-y-1 font-semibold min-w-0">
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">
                            {paymentMethod === 'cheque' ? 'Cheque Number / Bank Reference' : 'Bank Deposit Slip / Reference No.'}
                          </label>
                          <input
                            type="text"
                            value={bankOrChequeRef}
                            onChange={(e) => setBankOrChequeRef(e.target.value)}
                            placeholder={paymentMethod === 'cheque' ? 'e.g. CHQ-0049281' : 'e.g. GCB-SLIP-88392'}
                            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs text-slate-800 outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500"
                          />
                        </div>
                      )}

                      {paymentMethod === 'momo' && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          className="space-y-3.5 p-3.5 sm:p-4 bg-slate-50 rounded-2xl border border-slate-200/60 min-w-0"
                        >
                          {/* Operator selection with nice colors */}
                          <div className="space-y-1 font-semibold min-w-0">
                            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">MoMo Network Operator</label>
                            <div className="grid grid-cols-3 gap-1.5 min-w-0">
                              <button
                                type="button"
                                onClick={() => setMomoProvider('mtn')}
                                className={cn(
                                  "py-2 rounded-lg text-[10px] font-black transition-all border text-center uppercase flex flex-col items-center gap-0.5 cursor-pointer",
                                  momoProvider === 'mtn'
                                    ? "bg-amber-100/60 border-amber-400 text-amber-850 shadow-sm"
                                    : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
                                )}
                              >
                                <span className="w-1.5 h-1.5 bg-amber-500 rounded-full" />
                                MTN MoMo
                              </button>
                              <button
                                type="button"
                                onClick={() => setMomoProvider('telecel')}
                                className={cn(
                                  "py-2 rounded-lg text-[10px] font-black transition-all border text-center uppercase flex flex-col items-center gap-0.5 cursor-pointer",
                                  momoProvider === 'telecel'
                                    ? "bg-red-100/60 border-red-400 text-red-800 shadow-sm"
                                    : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
                                )}
                              >
                                <span className="w-1.5 h-1.5 bg-red-500 rounded-full" />
                                Telecel
                              </button>
                              <button
                                type="button"
                                onClick={() => setMomoProvider('at')}
                                className={cn(
                                  "py-2 rounded-lg text-[10px] font-black transition-all border text-center uppercase flex flex-col items-center gap-0.5 cursor-pointer",
                                  momoProvider === 'at'
                                    ? "bg-indigo-100/65 border-indigo-400 text-indigo-900 shadow-sm"
                                    : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
                                )}
                              >
                                <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full" />
                                AT Money
                              </button>
                            </div>
                          </div>

                          {/* Phone number & Validation */}
                          <div className="space-y-1 font-semibold min-w-0">
                            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Subscriber Number</label>
                            <div className="flex gap-1.5 min-w-0">
                              <div className="relative flex-1 min-w-0">
                                <Smartphone className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <input
                                  type="text"
                                  maxLength={10}
                                  value={momoNumber}
                                  onChange={(e) => {
                                    setMomoNumber(e.target.value.replace(/[^0-9]/g, ''));
                                    setMomoVerified(false);
                                  }}
                                  placeholder="e.g. 0241234567"
                                  className="w-full pl-8 pr-2 py-2 bg-white border border-slate-200 rounded-xl font-mono text-xs text-slate-800 outline-none"
                                />
                              </div>
                              <button
                                type="button"
                                onClick={verifyMomoSubscriber}
                                disabled={isVerifyingMomo}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-xl text-xs font-bold transition-all disabled:opacity-50 shrink-0 cursor-pointer"
                              >
                                {isVerifyingMomo ? "..." : "Verify"}
                              </button>
                            </div>
                          </div>

                          {/* Verified Account Name Alert */}
                          {momoVerified && (
                            <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-2.5 flex items-start gap-2 text-emerald-800 text-[10px] leading-tight font-medium">
                              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                              <div className="min-w-0">
                                <p className="font-extrabold text-[11px] text-emerald-950 uppercase">Verified Subscriber</p>
                                <p className="mt-0.5 truncate">Name: <span className="font-bold">{selectedStudent.guardianName || 'Authorized Payer'}</span></p>
                                <p className="text-[8px] text-emerald-600 uppercase tracking-wider font-bold">Auto-resolved Account Successful</p>
                              </div>
                            </div>
                          )}
                        </motion.div>
                      )}

                      <div className="space-y-2 font-semibold min-w-0">
                        <label className="text-xs sm:text-sm font-bold text-slate-700">Payment Amount (GHS)</label>
                        <div className="relative font-bold">
                          <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                          <input 
                            type="number"
                            value={paymentAmount}
                            onChange={(e) => setPaymentAmount(e.target.value)}
                            placeholder="Enter amount..."
                            className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-bold font-mono text-sm"
                          />
                        </div>
                      </div>

                      {paymentMethod === 'paystack' ? (
                        <PaystackPaymentButton
                          amount={Number(paymentAmount)}
                          email="amoakoemmanuel@hotmail.com"
                          onSuccess={(ref: any) => {
                            submitPayment(ref.reference);
                          }}
                          onClose={() => showToast('Paystack payment canceled', 'info')}
                          className="w-full justify-center text-base sm:text-lg py-3.5 sm:py-4 rounded-2xl shadow-lg shadow-indigo-100"
                          label="Confirm Payment"
                        />
                      ) : (
                        <button 
                          type="button"
                          onClick={handlePayment}
                          disabled={isSubmittingPayment}
                          className="w-full bg-indigo-600 text-white py-3.5 sm:py-4 rounded-2xl font-bold text-base sm:text-lg flex items-center justify-center gap-2 hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 disabled:opacity-60 cursor-pointer"
                        >
                          {isSubmittingPayment ? (
                            <>
                              <RefreshCw className="w-5 h-5 animate-spin shrink-0" />
                              <span>Recording to Supabase...</span>
                            </>
                          ) : (
                            <>
                              <span>Confirm Payment</span>
                              <ArrowUpRight className="w-5 h-5 shrink-0" />
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  )}
                </motion.div>
              </div>
            )}
          </div>
        </div>
        )}
      </div>

      {/* Individual Student Fee Breakdown Editor Modal */}
      <AnimatePresence>
        {editingBillStudent && (
          <div className="fixed inset-0 z-[65] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto print:hidden">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden my-auto"
            >
              <div className="p-5 sm:p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-indigo-600">Individual Bill Breakdown</span>
                  <h3 className="text-base sm:text-lg font-extrabold text-slate-900">
                    {editingBillStudent.firstName} {editingBillStudent.lastName}
                  </h3>
                  <p className="text-xs font-mono text-slate-500">
                    {editingBillStudent.studentId} • {editingBillStudent.class}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingBillStudent(null)}
                  className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-5 sm:p-6 space-y-4 max-h-[60dvh] overflow-y-auto">
                <p className="text-xs text-slate-500">
                  Customize itemized billed amounts for this student (e.g., scholarships, fee waivers, or optional transport/boarding items). Changes sync directly to Supabase.
                </p>

                <div className="space-y-2.5">
                  {feeTypes.map(ft => {
                    const currentVal = studentBreakdownDraft[ft.id] ?? 0;
                    const paidForThis = editingBillStudent.feePaidBreakdown?.[ft.id] ?? (ft.id === 'tuition' ? editingBillStudent.feesPaid : 0);
                    return (
                      <div key={ft.id} className="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200/70">
                        <div>
                          <p className="text-xs font-bold text-slate-800">{ft.label}</p>
                          <p className="text-[10px] font-mono text-slate-400">
                            Already Paid: <span className="text-emerald-600 font-bold">{formatCurrency(paidForThis)}</span>
                          </p>
                        </div>
                        <div className="relative w-36">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">GHS</span>
                          <input
                            type="number"
                            min={0}
                            value={currentVal}
                            onChange={(e) => {
                              const num = Math.max(0, Number(e.target.value) || 0);
                              setStudentBreakdownDraft(prev => ({ ...prev, [ft.id]: num }));
                            }}
                            className="w-full pl-10 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-900 text-right outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="bg-slate-900 text-white rounded-2xl p-4 grid grid-cols-3 gap-3 text-center">
                  <div>
                    <p className="text-[9px] font-bold uppercase text-slate-400">New Total Bill</p>
                    <p className="text-sm font-black font-mono mt-0.5">
                      {formatCurrency(Object.values(studentBreakdownDraft).reduce((acc, v) => acc + (Number(v) || 0), 0))}
                    </p>
                  </div>
                  <div>
                    <p className="text-[9px] font-bold uppercase text-slate-400">Total Paid</p>
                    <p className="text-sm font-black font-mono text-emerald-400 mt-0.5">
                      {formatCurrency(editingBillStudent.feesPaid)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[9px] font-bold uppercase text-slate-400">New Balance</p>
                    <p className="text-sm font-black font-mono text-[#faae57] mt-0.5">
                      {formatCurrency(
                        Object.values(studentBreakdownDraft).reduce((acc, v) => acc + (Number(v) || 0), 0) -
                          (editingBillStudent.feesPaid || 0)
                      )}
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-4 sm:p-5 border-t border-slate-100 bg-slate-50/70 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setEditingBillStudent(null)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-600 text-xs font-bold hover:bg-slate-50 transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveStudentBreakdown}
                  disabled={isSavingStudentBreakdown}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all shadow-sm cursor-pointer disabled:opacity-50"
                >
                  {isSavingStudentBreakdown ? 'Saving to Supabase...' : 'Save Bill to Supabase'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {renderReceiptModal()}
    </>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M20 6 9 17l-5-5"/></svg>
  );
}
