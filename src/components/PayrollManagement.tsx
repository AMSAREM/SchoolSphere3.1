import React, { useState, useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/schema';
import {
  Wallet,
  Plus,
  Trash2,
  Edit2,
  Printer,
  CheckCircle2,
  Search,
  RefreshCw,
  Download,
  FileText,
  Users,
  Landmark,
  Smartphone,
  ShieldCheck,
  X,
  Calendar,
  CreditCard,
  Calculator,
  Database,
  Copy,
  Check
} from 'lucide-react';
import { cn, formatCurrency, triggerPrint } from '../lib/utils';
import { useNotifications } from '../contexts/NotificationContext';
import { useAuth } from '../contexts/AuthContext';
import { teachersApi } from '../lib/api';
import {
  type StaffSalaryProfile,
  type PayslipRecord,
  type SalaryAdvanceRecord,
  type PayrollTableStatus,
  round2,
  calculateGhanaPayeTax,
  computePayslipFromProfile,
  formatMonthLabel,
  syncPayrollToDexie,
  fetchPayrollCloudState,
  syncPayrollCloudState,
  disburseSalariesToDatabase,
  downloadCsvFile
} from '../lib/payrollEngine';
import { PayslipPrintModal } from './PayslipPrintModal';

const BANK_AND_MOMO_OPTIONS = [
  'GCB Bank',
  'Ecobank Ghana',
  'Absa Bank Ghana',
  'Fidelity Bank',
  'Stanbic Bank',
  'Zenith Bank',
  'CalBank',
  'CBG Bank',
  'MTN Mobile Money (MoMo)',
  'Telecel Cash',
  'AT Money',
  'Cash Payment at Bursary'
];

export default function PayrollManagement() {
  const { showToast, confirm } = useNotifications();
  const { user, school: activeSchool } = useAuth();
  const targetSchoolId = String(activeSchool?.id || user?.schoolId || 'default').trim();

  const isPayrollManager =
    user?.role === 'super_admin' ||
    user?.role === 'admin' ||
    user?.role === 'headteacher' ||
    user?.role === 'accountant' ||
    (user?.role as string) === 'creator';

  const settings = useLiveQuery(() => db.settings.toArray()) || [];
  const teachers = useLiveQuery(() => db.teachers.toArray()) || [];
  const dexieProfiles = useLiveQuery(() => db.salaryProfiles.toArray()) || [];
  const dexiePayslips = useLiveQuery(() => db.payslips.toArray()) || [];
  const dexieAdvances = useLiveQuery(() => db.salaryAdvances.toArray()) || [];
  const salaryExpenses =
    useLiveQuery(() => db.expenses.where('category').equals('Salaries').toArray()) || [];

  const schoolProfile = settings.find(s => s.key === 'schoolProfile')?.value;
  const schoolName =
    schoolProfile?.schoolName || activeSchool?.name || 'SCHOOLSPHERE PORTAL';
  const schoolAddress = schoolProfile?.address || activeSchool?.address || '';
  const schoolPhone = schoolProfile?.phone || activeSchool?.phone || '';

  const localKey = `esepa_payroll_v1_${targetSchoolId}`;

  const [profiles, setProfiles] = useState<StaffSalaryProfile[]>(() => {
    try {
      const saved = localStorage.getItem(localKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed?.profiles)) return parsed.profiles;
      }
    } catch {}
    return [];
  });

  const [payslips, setPayslips] = useState<PayslipRecord[]>(() => {
    try {
      const saved = localStorage.getItem(localKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed?.payslips)) return parsed.payslips;
      }
    } catch {}
    return [];
  });

  const [advances, setAdvances] = useState<SalaryAdvanceRecord[]>(() => {
    try {
      const saved = localStorage.getItem(localKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed?.advances)) return parsed.advances;
      }
    } catch {}
    return [];
  });

  // Hydrate state from Dexie IndexedDB tables if local state is empty
  useEffect(() => {
    if (profiles.length === 0 && dexieProfiles.length > 0) {
      setProfiles(dexieProfiles);
    }
    if (payslips.length === 0 && dexiePayslips.length > 0) {
      setPayslips(dexiePayslips);
    }
    if (advances.length === 0 && dexieAdvances.length > 0) {
      setAdvances(dexieAdvances);
    }
  }, [dexieProfiles.length, dexiePayslips.length, dexieAdvances.length]);

  const [activeTab, setActiveTab] = useState<
    'payroll_run' | 'salary_structure' | 'advances' | 'exports'
  >('payroll_run');

  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    return `${yyyy}-${mm}`;
  });

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'approved' | 'paid'>('all');
  const [isSyncing, setIsSyncing] = useState(false);
  const [cloudConnected, setCloudConnected] = useState(true);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [tableStatus, setTableStatus] = useState<Record<string, PayrollTableStatus>>({});
  const [payrollSql, setPayrollSql] = useState('');
  const [showSchemaDrawer, setShowSchemaDrawer] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);

  // Modals state
  const [viewingPayslip, setViewingPayslip] = useState<PayslipRecord | null>(null);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<StaffSalaryProfile | null>(null);
  const [adjustingSlip, setAdjustingSlip] = useState<PayslipRecord | null>(null);
  const [isAdvanceModalOpen, setIsAdvanceModalOpen] = useState(false);

  // Profile Form State
  const [formStaffId, setFormStaffId] = useState('');
  const [formStaffName, setFormStaffName] = useState('');
  const [formDesignation, setFormDesignation] = useState('Subject Teacher');
  const [formPhone, setFormPhone] = useState('');
  const [formSsnitNumber, setFormSsnitNumber] = useState('');
  const [formTinNumber, setFormTinNumber] = useState('');
  const [formPaymentMethod, setFormPaymentMethod] =
    useState<StaffSalaryProfile['paymentMethod']>('Bank Transfer');
  const [formBankOrNetwork, setFormBankOrNetwork] = useState('GCB Bank');
  const [formAccountNumber, setFormAccountNumber] = useState('');
  const [formBasicSalary, setFormBasicSalary] = useState('2800');
  const [formRespAllowance, setFormRespAllowance] = useState('250');
  const [formTransportAllowance, setFormTransportAllowance] = useState('200');
  const [formOtherAllowance, setFormOtherAllowance] = useState('0');
  const [formSsnitEnabled, setFormSsnitEnabled] = useState(true);
  const [formPayeEnabled, setFormPayeEnabled] = useState(true);
  const [formManualTax, setFormManualTax] = useState('');

  // Slip Adjustment Form State
  const [adjBonus, setAdjBonus] = useState('0');
  const [adjLoanDeduction, setAdjLoanDeduction] = useState('0');
  const [adjOtherDeduction, setAdjOtherDeduction] = useState('0');
  const [adjNotes, setAdjNotes] = useState('');

  // Advance / Loan Request Form State
  const [advStaffId, setAdvStaffId] = useState('');
  const [advType, setAdvType] = useState<'Salary Advance' | 'Staff Loan'>('Salary Advance');
  const [advPrincipal, setAdvPrincipal] = useState('1000');
  const [advInstallment, setAdvInstallment] = useState('500');
  const [advReason, setAdvReason] = useState('');

  // Persist to Dexie IndexedDB, localStorage & Supabase PostgreSQL
  const persistPayrollState = async (
    nextProfiles: StaffSalaryProfile[],
    nextPayslips: PayslipRecord[],
    nextAdvances: SalaryAdvanceRecord[],
    auditAction?: string
  ) => {
    setProfiles(nextProfiles);
    setPayslips(nextPayslips);
    setAdvances(nextAdvances);
    try {
      localStorage.setItem(
        localKey,
        JSON.stringify({
          profiles: nextProfiles,
          payslips: nextPayslips,
          advances: nextAdvances,
          updatedAt: Date.now()
        })
      );
    } catch {}

    await syncPayrollToDexie(targetSchoolId, nextProfiles, nextPayslips, nextAdvances);

    const res = await syncPayrollCloudState({
      schoolId: targetSchoolId,
      schoolName,
      profiles: nextProfiles,
      payslips: nextPayslips,
      advances: nextAdvances,
      auditAction
    });
    if (res.ok) {
      setCloudConnected(true);
      setLastSyncedAt(res.syncedAt || Date.now());
      if (res.tableStatus) setTableStatus(res.tableStatus);
      if (res.payrollSql) setPayrollSql(res.payrollSql);
    }
  };

  const loadCloudPayroll = async (silent = false) => {
    if (!silent) setIsSyncing(true);
    try {
      await teachersApi.getAll().catch(() => {});
      const cloud = await fetchPayrollCloudState(targetSchoolId);
      if (cloud) {
        setCloudConnected(true);
        setLastSyncedAt(cloud.syncedAt);
        setTableStatus(cloud.tableStatus || {});
        if (cloud.payrollSql) setPayrollSql(cloud.payrollSql);

        if (
          cloud.profiles.length > 0 ||
          cloud.payslips.length > 0 ||
          cloud.advances.length > 0
        ) {
          setProfiles(cloud.profiles);
          setPayslips(cloud.payslips);
          setAdvances(cloud.advances);
          await syncPayrollToDexie(
            targetSchoolId,
            cloud.profiles,
            cloud.payslips,
            cloud.advances
          );
          try {
            localStorage.setItem(
              localKey,
              JSON.stringify({
                profiles: cloud.profiles,
                payslips: cloud.payslips,
                advances: cloud.advances,
                updatedAt: Date.now()
              })
            );
          } catch {}
        }
        if (!silent) {
          showToast(
            'Payroll tables synchronized with Supabase PostgreSQL & Dexie IndexedDB.',
            'success'
          );
        }
      }
    } catch {
      setCloudConnected(false);
      if (!silent) {
        showToast('Using local Dexie IndexedDB payroll tables while offline.', 'info');
      }
    } finally {
      if (!silent) setIsSyncing(false);
    }
  };

  useEffect(() => {
    loadCloudPayroll(true);
  }, [targetSchoolId]);

  // Auto-seed profiles from db.teachers if profiles is empty and teachers exist
  useEffect(() => {
    if (profiles.length === 0 && teachers.length > 0) {
      const seeded: StaffSalaryProfile[] = teachers.map((t, idx) => {
        const fullName = `${t.firstName} ${t.lastName}`.trim();
        const staffCode = t.staffId || `STF-${String(idx + 1).padStart(3, '0')}`;
        return {
          id: `prof-${staffCode}`,
          staffId: staffCode,
          staffName: fullName,
          designation: idx === 0 ? 'Senior Teacher / HOD' : 'Subject Teacher',
          phone: t.phone || '',
          email: t.email || '',
          ssnitNumber: `C00${184500 + idx * 17}`,
          tinNumber: `P00${492100 + idx * 23}`,
          paymentMethod: idx % 3 === 2 ? 'Mobile Money' : 'Bank Transfer',
          bankOrNetwork: idx % 3 === 2 ? 'MTN Mobile Money (MoMo)' : 'GCB Bank',
          accountNumber: idx % 3 === 2 ? t.phone || '0551187045' : `101120048${idx + 10}`,
          basicSalary: idx === 0 ? 3400 : 2800,
          responsibilityAllowance: idx === 0 ? 400 : 200,
          transportAllowance: 250,
          otherAllowance: 0,
          ssnitEnabled: true,
          payeEnabled: true,
          manualTaxOverride: null,
          updatedAt: Date.now()
        };
      });
      const periodLbl = formatMonthLabel(selectedMonth);
      const seededSlips = seeded.map(p =>
        computePayslipFromProfile(p, selectedMonth, periodLbl, [])
      );
      persistPayrollState(seeded, seededSlips, advances);
    }
  }, [teachers.length]);

  // Sync newly added teachers from db.teachers on demand
  const handleSyncStaffDirectory = async () => {
    if (teachers.length === 0) {
      showToast('No teachers found in Academic Management directory yet.', 'info');
      return;
    }
    const existingIds = new Set(profiles.map(p => p.staffId.toLowerCase()));
    const existingNames = new Set(profiles.map(p => p.staffName.toLowerCase()));

    const addedProfiles: StaffSalaryProfile[] = [];
    teachers.forEach((t, idx) => {
      const fullName = `${t.firstName} ${t.lastName}`.trim();
      const staffCode = t.staffId || `STF-${String(profiles.length + idx + 1).padStart(3, '0')}`;
      if (
        !existingIds.has(staffCode.toLowerCase()) &&
        !existingNames.has(fullName.toLowerCase())
      ) {
        addedProfiles.push({
          id: `prof-${staffCode}-${Date.now()}`,
          staffId: staffCode,
          staffName: fullName,
          designation: 'Subject Teacher',
          phone: t.phone || '',
          email: t.email || '',
          ssnitNumber: `C00${192000 + idx * 19}`,
          tinNumber: `P00${512000 + idx * 31}`,
          paymentMethod: 'Bank Transfer',
          bankOrNetwork: 'GCB Bank',
          accountNumber: `10112090${idx + 10}`,
          basicSalary: 2800,
          responsibilityAllowance: 200,
          transportAllowance: 200,
          otherAllowance: 0,
          ssnitEnabled: true,
          payeEnabled: true,
          manualTaxOverride: null,
          updatedAt: Date.now()
        });
      }
    });

    if (addedProfiles.length === 0) {
      showToast('All registered teachers already have salary profiles.', 'info');
      return;
    }

    const nextProfiles = [...profiles, ...addedProfiles];
    await persistPayrollState(nextProfiles, payslips, advances);
    showToast(`Imported ${addedProfiles.length} staff member(s) from directory.`, 'success');
  };

  // Generate or recalculate Monthly Batch Payroll Run for selectedMonth
  const handleRunMonthlyPayroll = async () => {
    if (profiles.length === 0) {
      showToast('Add or sync staff salary profiles first before running payroll.', 'error');
      return;
    }

    const periodLbl = formatMonthLabel(selectedMonth);
    const otherMonthSlips = payslips.filter(s => s.payrollMonth !== selectedMonth);
    const currentMonthMap = new Map(
      payslips
        .filter(s => s.payrollMonth === selectedMonth)
        .map(s => [s.staffId.toLowerCase(), s])
    );

    const generatedForMonth: PayslipRecord[] = profiles.map(prof => {
      const existing = currentMonthMap.get(prof.staffId.toLowerCase());
      // Keep paid slips untouched
      if (existing && existing.status === 'paid') {
        return existing;
      }
      return computePayslipFromProfile(
        prof,
        selectedMonth,
        periodLbl,
        advances,
        existing
      );
    });

    const nextPayslips = [...otherMonthSlips, ...generatedForMonth];
    await persistPayrollState(profiles, nextPayslips, advances);
    showToast(
      `Generated ${generatedForMonth.length} payslips for ${periodLbl} (SSNIT 5.5%/13% & GRA PAYE applied).`,
      'success'
    );
  };

  // Batch Approve all Draft slips in selectedMonth
  const handleApproveAllMonth = async () => {
    const monthSlips = payslips.filter(s => s.payrollMonth === selectedMonth);
    const draftCount = monthSlips.filter(s => s.status === 'draft').length;
    if (draftCount === 0) {
      showToast('No draft payslips remaining to approve for this month.', 'info');
      return;
    }
    const nextPayslips = payslips.map(s =>
      s.payrollMonth === selectedMonth && s.status === 'draft'
        ? { ...s, status: 'approved' as const, updatedAt: Date.now() }
        : s
    );
    await persistPayrollState(profiles, nextPayslips, advances);
    showToast(`Approved ${draftCount} payslip(s) for ${formatMonthLabel(selectedMonth)}.`, 'success');
  };

  // Mark individual or all approved slips as Paid, automatically reducing active loan balances and posting to school_expenses
  const handleMarkSlipPaid = async (targetSlipIds: string[]) => {
    const idSet = new Set(targetSlipIds);
    const newlyPaidSlips = payslips.filter(s => idSet.has(s.id) && s.status !== 'paid');
    if (newlyPaidSlips.length === 0) return;

    const now = Date.now();
    const nextPayslips = payslips.map(s =>
      idSet.has(s.id) ? { ...s, status: 'paid' as const, paidAt: now, updatedAt: now } : s
    );

    // Deduct loan/advance installment from active approved advances
    const nextAdvances = advances.map(adv => {
      if (adv.status !== 'approved' || adv.remainingBalance <= 0) return adv;
      const matchingSlip = newlyPaidSlips.find(
        s =>
          s.staffId.toLowerCase() === adv.staffId.toLowerCase() ||
          s.staffName.toLowerCase() === adv.staffName.toLowerCase()
      );
      if (!matchingSlip || matchingSlip.loanDeduction <= 0) return adv;

      const deductionApplied = Math.min(
        adv.remainingBalance,
        adv.monthlyInstallment || matchingSlip.loanDeduction
      );
      const newRemaining = round2(Math.max(0, adv.remainingBalance - deductionApplied));
      return {
        ...adv,
        remainingBalance: newRemaining,
        status: newRemaining <= 0 ? ('completed' as const) : ('approved' as const)
      };
    });

    await persistPayrollState(
      profiles,
      nextPayslips,
      nextAdvances,
      'PAYROLL_BATCH_MARK_PAID'
    );

    const disbRes = await disburseSalariesToDatabase({
      schoolId: targetSchoolId,
      schoolName,
      recordedBy: user?.fullName || 'Bursar / Payroll Officer',
      disbursedSlips: newlyPaidSlips.map(s => ({ ...s, status: 'paid' as const, paidAt: now })),
      profiles,
      payslips: nextPayslips,
      advances: nextAdvances
    });
    if (disbRes.tableStatus) setTableStatus(disbRes.tableStatus);

    showToast(
      `Disbursed ${newlyPaidSlips.length} salary payment(s), updated loan balances, and posted to school_expenses ledger.`,
      'success'
    );
  };

  // Open Profile Modal for Create or Edit
  const openProfileModal = (profile?: StaffSalaryProfile) => {
    if (profile) {
      setEditingProfile(profile);
      setFormStaffId(profile.staffId);
      setFormStaffName(profile.staffName);
      setFormDesignation(profile.designation);
      setFormPhone(profile.phone || '');
      setFormSsnitNumber(profile.ssnitNumber);
      setFormTinNumber(profile.tinNumber);
      setFormPaymentMethod(profile.paymentMethod);
      setFormBankOrNetwork(profile.bankOrNetwork);
      setFormAccountNumber(profile.accountNumber);
      setFormBasicSalary(String(profile.basicSalary));
      setFormRespAllowance(String(profile.responsibilityAllowance));
      setFormTransportAllowance(String(profile.transportAllowance));
      setFormOtherAllowance(String(profile.otherAllowance));
      setFormSsnitEnabled(profile.ssnitEnabled);
      setFormPayeEnabled(profile.payeEnabled);
      setFormManualTax(
        profile.manualTaxOverride !== null && profile.manualTaxOverride !== undefined
          ? String(profile.manualTaxOverride)
          : ''
      );
    } else {
      setEditingProfile(null);
      const nextCode = `STF-${String(profiles.length + 1).padStart(3, '0')}`;
      setFormStaffId(nextCode);
      setFormStaffName('');
      setFormDesignation('Subject Teacher');
      setFormPhone('');
      setFormSsnitNumber(`C00${195000 + profiles.length * 13}`);
      setFormTinNumber(`P00${525000 + profiles.length * 17}`);
      setFormPaymentMethod('Bank Transfer');
      setFormBankOrNetwork('GCB Bank');
      setFormAccountNumber('');
      setFormBasicSalary('2800');
      setFormRespAllowance('200');
      setFormTransportAllowance('200');
      setFormOtherAllowance('0');
      setFormSsnitEnabled(true);
      setFormPayeEnabled(true);
      setFormManualTax('');
    }
    setIsProfileModalOpen(true);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formStaffName.trim() || !formStaffId.trim()) {
      showToast('Staff Name and Staff ID are required.', 'error');
      return;
    }

    const newProfile: StaffSalaryProfile = {
      id: editingProfile?.id || `prof-${Date.now()}`,
      staffId: formStaffId.trim().toUpperCase(),
      staffName: formStaffName.trim(),
      designation: formDesignation.trim() || 'Staff Member',
      phone: formPhone.trim(),
      ssnitNumber: formSsnitNumber.trim() || 'N/A',
      tinNumber: formTinNumber.trim() || 'N/A',
      paymentMethod: formPaymentMethod,
      bankOrNetwork: formBankOrNetwork.trim() || 'GCB Bank',
      accountNumber: formAccountNumber.trim() || '—',
      basicSalary: round2(Number(formBasicSalary) || 0),
      responsibilityAllowance: round2(Number(formRespAllowance) || 0),
      transportAllowance: round2(Number(formTransportAllowance) || 0),
      otherAllowance: round2(Number(formOtherAllowance) || 0),
      ssnitEnabled: formSsnitEnabled,
      payeEnabled: formPayeEnabled,
      manualTaxOverride: formManualTax.trim() !== '' ? round2(Number(formManualTax)) : null,
      updatedAt: Date.now()
    };

    const nextProfiles = editingProfile
      ? profiles.map(p => (p.id === editingProfile.id ? newProfile : p))
      : [...profiles, newProfile];

    // Also update or create the draft payslip for the currently selected month
    const periodLbl = formatMonthLabel(selectedMonth);
    const existingSlip = payslips.find(
      s =>
        s.payrollMonth === selectedMonth &&
        s.staffId.toLowerCase() === newProfile.staffId.toLowerCase()
    );

    let nextPayslips = [...payslips];
    if (!existingSlip) {
      nextPayslips.push(
        computePayslipFromProfile(newProfile, selectedMonth, periodLbl, advances)
      );
    } else if (existingSlip.status !== 'paid') {
      const updatedSlip = computePayslipFromProfile(
        newProfile,
        selectedMonth,
        periodLbl,
        advances,
        existingSlip
      );
      nextPayslips = nextPayslips.map(s => (s.id === existingSlip.id ? updatedSlip : s));
    }

    await persistPayrollState(nextProfiles, nextPayslips, advances);
    setIsProfileModalOpen(false);
    showToast(
      editingProfile
        ? `Updated salary structure for ${newProfile.staffName}.`
        : `Added ${newProfile.staffName} to payroll structure.`,
      'success'
    );
  };

  const handleDeleteProfile = async (profile: StaffSalaryProfile) => {
    const ok = await confirm({
      title: 'Remove Staff Salary Profile',
      message: `Remove ${profile.staffName} (${profile.staffId}) from the salary structure? Historical paid payslips will be preserved.`
    });
    if (!ok) return;
    const nextProfiles = profiles.filter(p => p.id !== profile.id);
    const nextPayslips = payslips.filter(
      s => !(s.staffId === profile.staffId && s.status === 'draft')
    );
    await persistPayrollState(nextProfiles, nextPayslips, advances);
    showToast(`Removed ${profile.staffName} from active salary structure.`, 'success');
  };

  // Save monthly adjustment on a payslip
  const handleSaveSlipAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustingSlip) return;

    const matchingProfile = profiles.find(
      p => p.staffId.toLowerCase() === adjustingSlip.staffId.toLowerCase()
    );

    const bonusAmount = round2(Number(adjBonus) || 0);
    const loanDeduction = round2(Number(adjLoanDeduction) || 0);
    const otherDeduction = round2(Number(adjOtherDeduction) || 0);

    let updatedSlip: PayslipRecord;
    if (matchingProfile) {
      updatedSlip = computePayslipFromProfile(
        matchingProfile,
        adjustingSlip.payrollMonth,
        adjustingSlip.periodLabel,
        advances,
        {
          ...adjustingSlip,
          bonusAmount,
          loanDeduction,
          otherDeduction,
          notes: adjNotes.trim()
        }
      );
    } else {
      const grossPay = round2(
        adjustingSlip.basicSalary + adjustingSlip.totalAllowances + bonusAmount
      );
      const taxableIncome = round2(
        Math.max(0, adjustingSlip.basicSalary - adjustingSlip.ssnitEmployee + adjustingSlip.totalAllowances + bonusAmount)
      );
      const payeTax = calculateGhanaPayeTax(taxableIncome);
      const totalDeductions = round2(
        adjustingSlip.ssnitEmployee + payeTax + loanDeduction + otherDeduction
      );
      updatedSlip = {
        ...adjustingSlip,
        bonusAmount,
        grossPay,
        taxableIncome,
        payeTax,
        loanDeduction,
        otherDeduction,
        totalDeductions,
        netPay: round2(Math.max(0, grossPay - totalDeductions)),
        notes: adjNotes.trim(),
        updatedAt: Date.now()
      };
    }

    const nextPayslips = payslips.map(s => (s.id === adjustingSlip.id ? updatedSlip : s));
    await persistPayrollState(profiles, nextPayslips, advances);
    setAdjustingSlip(null);
    showToast(`Updated monthly adjustments for ${updatedSlip.staffName}.`, 'success');
  };

  // Submit new Salary Advance or Staff Loan
  const handleCreateAdvance = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetProf =
      profiles.find(p => p.staffId === advStaffId) ||
      profiles.find(
        p => p.staffName.toLowerCase() === (user?.fullName || '').toLowerCase()
      );

    const principal = round2(Number(advPrincipal) || 0);
    const installment = round2(Number(advInstallment) || principal);

    if (principal <= 0) {
      showToast('Enter a valid advance or loan amount greater than 0.', 'error');
      return;
    }

    const staffIdVal = targetProf?.staffId || 'STF-SELF';
    const staffNameVal = targetProf?.staffName || user?.fullName || 'Staff Member';
    const designationVal = targetProf?.designation || user?.role || 'Teacher';

    const newAdv: SalaryAdvanceRecord = {
      id: `adv-${Date.now()}`,
      staffId: staffIdVal,
      staffName: staffNameVal,
      designation: designationVal,
      type: advType,
      principalAmount: principal,
      monthlyInstallment: Math.min(principal, Math.max(1, installment)),
      remainingBalance: principal,
      reason: advReason.trim() || 'Personal / Welfare Advance',
      status: isPayrollManager ? 'approved' : 'pending',
      requestedAt: Date.now(),
      approvedBy: isPayrollManager ? user?.fullName || 'Bursar / Admin' : null,
      approvedAt: isPayrollManager ? Date.now() : null
    };

    const nextAdvances = [newAdv, ...advances];
    await persistPayrollState(profiles, payslips, nextAdvances);
    setIsAdvanceModalOpen(false);
    setAdvReason('');
    showToast(
      isPayrollManager
        ? `Recorded & approved ${advType} of ${formatCurrency(principal)} for ${staffNameVal}.`
        : `Submitted ${advType} request for ${formatCurrency(principal)} to the Bursar.`,
      'success'
    );
  };

  const handleUpdateAdvanceStatus = async (
    advId: string,
    newStatus: SalaryAdvanceRecord['status']
  ) => {
    const nextAdvances = advances.map(a =>
      a.id === advId
        ? {
            ...a,
            status: newStatus,
            remainingBalance: newStatus === 'completed' ? 0 : a.remainingBalance,
            approvedBy:
              newStatus === 'approved' ? user?.fullName || 'Administrator' : a.approvedBy,
            approvedAt: newStatus === 'approved' ? Date.now() : a.approvedAt
          }
        : a
    );
    await persistPayrollState(profiles, payslips, nextAdvances);
    showToast(`Advance status updated to ${newStatus.toUpperCase()}.`, 'success');
  };

  // Filtered payslips for the active month
  const monthPayslips = useMemo(() => {
    return payslips
      .filter(s => s.payrollMonth === selectedMonth)
      .filter(s => {
        if (statusFilter !== 'all' && s.status !== statusFilter) return false;
        if (!searchTerm.trim()) return true;
        const q = searchTerm.toLowerCase();
        return (
          s.staffName.toLowerCase().includes(q) ||
          s.staffId.toLowerCase().includes(q) ||
          s.designation.toLowerCase().includes(q) ||
          s.bankOrNetwork.toLowerCase().includes(q)
        );
      });
  }, [payslips, selectedMonth, statusFilter, searchTerm]);

  // Monthly KPI Totals
  const monthTotals = useMemo(() => {
    const allInMonth = payslips.filter(s => s.payrollMonth === selectedMonth);
    const gross = round2(allInMonth.reduce((sum, s) => sum + s.grossPay, 0));
    const net = round2(allInMonth.reduce((sum, s) => sum + s.netPay, 0));
    const ssnitEmp = round2(allInMonth.reduce((sum, s) => sum + s.ssnitEmployee, 0));
    const ssnitEmployer = round2(allInMonth.reduce((sum, s) => sum + s.ssnitEmployer, 0));
    const paye = round2(allInMonth.reduce((sum, s) => sum + s.payeTax, 0));
    const loans = round2(allInMonth.reduce((sum, s) => sum + s.loanDeduction, 0));
    const paidCount = allInMonth.filter(s => s.status === 'paid').length;
    return {
      totalStaff: allInMonth.length,
      paidCount,
      gross,
      net,
      ssnitEmp,
      ssnitEmployer,
      totalSsnit: round2(ssnitEmp + ssnitEmployer),
      paye,
      statutoryTotal: round2(ssnitEmp + ssnitEmployer + paye),
      loans
    };
  }, [payslips, selectedMonth]);

  // CSV Exports
  const handleExportBankMomoSchedule = () => {
    const list = payslips.filter(s => s.payrollMonth === selectedMonth);
    if (list.length === 0) {
      showToast('Generate the monthly payroll run first before exporting.', 'error');
      return;
    }
    downloadCsvFile(
      `Bank_MoMo_Payment_Schedule_${selectedMonth}.csv`,
      [
        'Receipt Ref',
        'Period',
        'Staff ID',
        'Employee Name',
        'Designation',
        'Payment Method',
        'Bank / Mobile Network',
        'Account / Wallet Number',
        'Net Amount Payable (GHS)',
        'Status'
      ],
      list.map(s => [
        s.receiptRef,
        s.periodLabel,
        s.staffId,
        s.staffName,
        s.designation,
        s.paymentMethod,
        s.bankOrNetwork,
        s.accountNumber,
        s.netPay.toFixed(2),
        s.status.toUpperCase()
      ])
    );
    showToast('Exported Bank & Mobile Money Payment Schedule (CSV).', 'success');
  };

  const handleExportStatutorySchedule = () => {
    const list = payslips.filter(s => s.payrollMonth === selectedMonth);
    if (list.length === 0) {
      showToast('Generate the monthly payroll run first before exporting.', 'error');
      return;
    }
    downloadCsvFile(
      `SSNIT_GRA_PAYE_Statutory_Schedule_${selectedMonth}.csv`,
      [
        'Period',
        'Staff ID',
        'Employee Name',
        'SSNIT Number',
        'GRA TIN Number',
        'Basic Salary (GHS)',
        'SSNIT Employee 5.5% (GHS)',
        'SSNIT Employer 13% (GHS)',
        'Total SSNIT 18.5% (GHS)',
        'Chargeable Income (GHS)',
        'GRA PAYE Tax (GHS)'
      ],
      list.map(s => [
        s.periodLabel,
        s.staffId,
        s.staffName,
        s.ssnitNumber,
        s.tinNumber,
        s.basicSalary.toFixed(2),
        s.ssnitEmployee.toFixed(2),
        s.ssnitEmployer.toFixed(2),
        round2(s.ssnitEmployee + s.ssnitEmployer).toFixed(2),
        s.taxableIncome.toFixed(2),
        s.payeTax.toFixed(2)
      ])
    );
    showToast('Exported SSNIT (18.5%) & GRA PAYE Statutory Schedule (CSV).', 'success');
  };

  // Teacher / HOD Self-Service matching
  const selfServiceSlips = useMemo(() => {
    if (isPayrollManager) return [];
    const cleanUser = (user?.fullName || '')
      .replace(/\s*\(.*?\)/g, '')
      .trim()
      .toLowerCase();
    const matched = payslips.filter(s => {
      const name = s.staffName.toLowerCase();
      return cleanUser && (name.includes(cleanUser) || cleanUser.includes(name));
    });
    return matched.length > 0 ? matched : payslips.slice(0, 6);
  }, [isPayrollManager, payslips, user?.fullName]);

  const selfServiceAdvances = useMemo(() => {
    if (isPayrollManager) return [];
    const cleanUser = (user?.fullName || '')
      .replace(/\s*\(.*?\)/g, '')
      .trim()
      .toLowerCase();
    return advances.filter(a => {
      const name = a.staffName.toLowerCase();
      return !cleanUser || name.includes(cleanUser) || cleanUser.includes(name);
    });
  }, [isPayrollManager, advances, user?.fullName]);

  // Live preview inside Profile Modal
  const profilePreview = useMemo(() => {
    const tempProfile: StaffSalaryProfile = {
      id: 'preview',
      staffId: formStaffId || 'STF-001',
      staffName: formStaffName || 'Preview',
      designation: formDesignation,
      ssnitNumber: formSsnitNumber,
      tinNumber: formTinNumber,
      paymentMethod: formPaymentMethod,
      bankOrNetwork: formBankOrNetwork,
      accountNumber: formAccountNumber,
      basicSalary: Number(formBasicSalary) || 0,
      responsibilityAllowance: Number(formRespAllowance) || 0,
      transportAllowance: Number(formTransportAllowance) || 0,
      otherAllowance: Number(formOtherAllowance) || 0,
      ssnitEnabled: formSsnitEnabled,
      payeEnabled: formPayeEnabled,
      manualTaxOverride: formManualTax.trim() !== '' ? Number(formManualTax) : null,
      updatedAt: Date.now()
    };
    return computePayslipFromProfile(
      tempProfile,
      selectedMonth,
      formatMonthLabel(selectedMonth),
      []
    );
  }, [
    formBasicSalary,
    formRespAllowance,
    formTransportAllowance,
    formOtherAllowance,
    formSsnitEnabled,
    formPayeEnabled,
    formManualTax,
    selectedMonth
  ]);

  // If logged-in user is Teacher or HOD, render the streamlined Self-Service Payslips & Advances View
  if (!isPayrollManager) {
    return (
      <div className="space-y-5 text-[#1f2a2e] min-w-0">
        {/* Self-Service Header */}
        <div className="bg-[#1c4a59] text-white rounded-2xl p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
          <div>
            <div className="text-xs font-medium text-slate-200">
              Staff Compensation & Self-Service Portal
            </div>
            <h1 className="text-xl sm:text-2xl font-black tracking-tight mt-0.5">
              My Monthly Payslips & Salary Advances
            </h1>
            <p className="text-xs text-slate-200 mt-1">
              {user?.fullName || 'Teaching Staff'} · Official SSNIT & GRA PAYE Salary Advice
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => {
                const myProf = profiles.find(p =>
                  p.staffName
                    .toLowerCase()
                    .includes((user?.fullName || '').replace(/\s*\(.*?\)/g, '').trim().toLowerCase())
                );
                setAdvStaffId(myProf?.staffId || profiles[0]?.staffId || '');
                setIsAdvanceModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-[#faae57] hover:bg-[#f59e36] text-[#1f2a2e] font-bold text-xs rounded-xl transition-colors cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>Request Salary Advance</span>
            </button>
          </div>
        </div>

        {/* My Monthly Payslips Table */}
        <div className="bg-white border border-[#bac4c6] rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[#bac4c6] flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-[#1c4a59]">My Official Payslips</h2>
              <p className="text-xs text-[#6a7f84]">
                Click any monthly salary record to view or print your itemized payslip
              </p>
            </div>
            <button
              type="button"
              onClick={() => loadCloudPayroll(false)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-[#1c4a59] bg-[#f6f8f7] hover:bg-slate-200/70 border border-[#bac4c6] rounded-xl cursor-pointer"
            >
              <RefreshCw className={cn('w-3.5 h-3.5', isSyncing && 'animate-spin')} />
              <span>Refresh</span>
            </button>
          </div>

          {selfServiceSlips.length === 0 ? (
            <div className="p-10 text-center text-xs text-[#6a7f84]">
              No payslips have been issued for your account yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#f6f8f7] border-b border-[#bac4c6] text-[#6a7f84] font-bold">
                    <th className="py-3 px-4">Period</th>
                    <th className="py-3 px-4">Employee</th>
                    <th className="py-3 px-4 text-right">Basic + Allowances</th>
                    <th className="py-3 px-4 text-right">SSNIT (5.5%)</th>
                    <th className="py-3 px-4 text-right">PAYE Tax</th>
                    <th className="py-3 px-4 text-right">Net Take-Home</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {selfServiceSlips.map(slip => (
                    <tr key={slip.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-bold text-[#1c4a59] whitespace-nowrap">
                        {slip.periodLabel}
                        <span className="block text-[11px] font-mono text-[#6a7f84] font-normal">
                          {slip.receiptRef}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-[#1f2a2e]">{slip.staffName}</div>
                        <div className="text-[11px] text-[#6a7f84]">
                          {slip.staffId} · {slip.bankOrNetwork}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums">
                        {formatCurrency(slip.grossPay)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-rose-700">
                        -{formatCurrency(slip.ssnitEmployee)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-rose-700">
                        -{formatCurrency(slip.payeTax)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-bold text-[#1c4a59]">
                        {formatCurrency(slip.netPay)}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={cn(
                            'font-bold text-[11px]',
                            slip.status === 'paid'
                              ? 'text-emerald-700'
                              : slip.status === 'approved'
                              ? 'text-amber-700'
                              : 'text-slate-600'
                          )}
                        >
                          {slip.status === 'paid'
                            ? 'Paid / Disbursed'
                            : slip.status === 'approved'
                            ? 'Approved'
                            : 'Draft'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => setViewingPayslip(slip)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#1c4a59] hover:bg-[#153844] text-white font-bold text-xs rounded-lg transition-colors cursor-pointer"
                        >
                          <Printer className="w-3.5 h-3.5 text-[#faae57]" />
                          <span>Payslip</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* My Salary Advances & Loans */}
        <div className="bg-white border border-[#bac4c6] rounded-2xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-[#bac4c6]">
            <h2 className="text-sm font-bold text-[#1c4a59]">My Salary Advance & Loan Requests</h2>
          </div>
          {selfServiceAdvances.length === 0 ? (
            <div className="p-6 text-center text-xs text-[#6a7f84]">
              You have no active salary advances or staff loans.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#f6f8f7] border-b border-[#bac4c6] text-[#6a7f84] font-bold">
                    <th className="py-2.5 px-4">Type & Reason</th>
                    <th className="py-2.5 px-4 text-right">Principal</th>
                    <th className="py-2.5 px-4 text-right">Monthly Deduction</th>
                    <th className="py-2.5 px-4 text-right">Remaining Balance</th>
                    <th className="py-2.5 px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {selfServiceAdvances.map(adv => (
                    <tr key={adv.id}>
                      <td className="py-2.5 px-4">
                        <span className="font-bold text-[#1f2a2e]">{adv.type}</span>
                        <span className="block text-[11px] text-[#6a7f84]">{adv.reason}</span>
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                        {formatCurrency(adv.principalAmount)}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                        {formatCurrency(adv.monthlyInstallment)}/mo
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums font-bold text-[#1c4a59]">
                        {formatCurrency(adv.remainingBalance)}
                      </td>
                      <td className="py-2.5 px-4 font-bold uppercase text-[11px]">
                        {adv.status}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <PayslipPrintModal
          payslip={viewingPayslip}
          schoolName={schoolName}
          schoolAddress={schoolAddress}
          schoolPhone={schoolPhone}
          onClose={() => setViewingPayslip(null)}
        />

        {isAdvanceModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
            <form
              onSubmit={handleCreateAdvance}
              className="bg-white border border-[#bac4c6] rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-[#bac4c6] pb-3">
                <h3 className="text-sm font-bold text-[#1c4a59]">Request Salary Advance / Loan</h3>
                <button
                  type="button"
                  onClick={() => setIsAdvanceModalOpen(false)}
                  className="p-1 text-[#6a7f84] hover:text-[#1f2a2e]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="space-y-3 text-xs">
                <div>
                  <label className="font-bold text-[#1f2a2e] block mb-1">Facility Type</label>
                  <select
                    value={advType}
                    onChange={e => setAdvType(e.target.value as any)}
                    className="w-full px-3 py-2 border border-[#bac4c6] rounded-xl bg-white"
                  >
                    <option value="Salary Advance">Salary Advance (Short-Term)</option>
                    <option value="Staff Loan">Staff Welfare Loan (Multi-Month)</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-bold text-[#1f2a2e] block mb-1">Amount (GHS)</label>
                    <input
                      type="number"
                      min="1"
                      step="0.01"
                      required
                      value={advPrincipal}
                      onChange={e => setAdvPrincipal(e.target.value)}
                      className="w-full px-3 py-2 border border-[#bac4c6] rounded-xl font-mono"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-[#1f2a2e] block mb-1">
                      Monthly Deduction (GHS)
                    </label>
                    <input
                      type="number"
                      min="1"
                      step="0.01"
                      required
                      value={advInstallment}
                      onChange={e => setAdvInstallment(e.target.value)}
                      className="w-full px-3 py-2 border border-[#bac4c6] rounded-xl font-mono"
                    />
                  </div>
                </div>
                <div>
                  <label className="font-bold text-[#1f2a2e] block mb-1">Purpose / Reason</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Medical / Accommodation advance"
                    value={advReason}
                    onChange={e => setAdvReason(e.target.value)}
                    className="w-full px-3 py-2 border border-[#bac4c6] rounded-xl"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAdvanceModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-[#6a7f84] bg-[#f6f8f7] rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold text-white bg-[#1c4a59] hover:bg-[#153844] rounded-xl cursor-pointer"
                >
                  Submit Request
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    );
  }

  // Full Admin / Accountant / Headteacher Payroll Command Center
  return (
    <div className="space-y-4 sm:space-y-5 text-[#1f2a2e] min-w-0">
      {/* Print-Only Institutional Payroll Header */}
      <div className="only-print border-b-2 border-slate-900 pb-4 mb-4">
        <h1 className="text-2xl font-black uppercase text-center">{schoolName}</h1>
        <p className="text-xs font-bold text-center text-slate-600 mt-1">
          OFFICIAL MONTHLY PAYROLL REGISTER & STATUTORY SCHEDULE · {formatMonthLabel(selectedMonth)}
        </p>
      </div>

      {/* Top Payroll Command Banner */}
      <div className="bg-[#1c4a59] text-white rounded-2xl p-4 sm:p-6 shadow-xs print:hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="text-xs text-slate-200 font-medium">
              Institutional Bursary · Ghana SSNIT (5.5% / 13%) & GRA PAYE Tax Engine
            </div>
            <h1 className="text-xl sm:text-2xl font-black tracking-tight mt-0.5">
              Staff Payroll & Compensation System
            </h1>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-200 mt-1.5">
              <span>Active Period: {formatMonthLabel(selectedMonth)}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">{profiles.length} Staff Profiles</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">
                {monthTotals.paidCount}/{monthTotals.totalStaff} Disbursed
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">
                {salaryExpenses.length} Salary Expense Entries
              </span>
            </div>
          </div>

          {/* Period Picker + Primary Actions + DB Schema Status */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 bg-white/10 border border-white/20 rounded-xl px-3 py-1.5">
              <Calendar className="w-3.5 h-3.5 text-[#faae57]" />
              <input
                type="month"
                value={selectedMonth}
                onChange={e => setSelectedMonth(e.target.value)}
                className="bg-transparent text-white text-xs font-bold font-mono focus:outline-none cursor-pointer"
              />
            </div>

            <button
              type="button"
              onClick={handleRunMonthlyPayroll}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#faae57] hover:bg-[#f59e36] text-[#1f2a2e] font-bold text-xs rounded-xl transition-colors cursor-pointer whitespace-nowrap"
            >
              <Calculator className="w-3.5 h-3.5" />
              <span>Run {formatMonthLabel(selectedMonth)} Payroll</span>
            </button>

            <button
              type="button"
              onClick={() => setShowSchemaDrawer(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-white/10 hover:bg-white/20 border border-white/15 text-white font-bold text-xs rounded-xl transition-colors cursor-pointer whitespace-nowrap"
              title="Inspect Supabase & Dexie Database Tables"
            >
              <Database className="w-3.5 h-3.5 text-emerald-300" />
              <span>{cloudConnected ? 'DB Connected' : 'Local Dexie DB'}</span>
            </button>

            <button
              type="button"
              onClick={() => loadCloudPayroll(false)}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-white/10 hover:bg-white/20 text-white font-bold text-xs rounded-xl transition-colors cursor-pointer"
              title="Sync with Supabase"
            >
              <RefreshCw className={cn('w-3.5 h-3.5', isSyncing && 'animate-spin')} />
              <span className="hidden sm:inline">Sync DB</span>
            </button>
          </div>
        </div>

        {/* 4-Metric Financial Strip (Tabular Numerals) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-5 pt-4 border-t border-white/15">
          <div>
            <div className="text-[11px] text-slate-300">Monthly Gross Payroll</div>
            <div className="text-lg sm:text-xl font-black font-mono tabular-nums text-white mt-0.5">
              {formatCurrency(monthTotals.gross)}
            </div>
            <div className="text-[11px] text-slate-300 font-mono tabular-nums">
              {monthTotals.totalStaff} staff in run
            </div>
          </div>
          <div>
            <div className="text-[11px] text-slate-300">Net Take-Home Payable</div>
            <div className="text-lg sm:text-xl font-black font-mono tabular-nums text-[#faae57] mt-0.5">
              {formatCurrency(monthTotals.net)}
            </div>
            <div className="text-[11px] text-slate-300 font-mono tabular-nums">
              Loans recovered: {formatCurrency(monthTotals.loans)}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-slate-300">SSNIT Tier 1 & 2 (18.5%)</div>
            <div className="text-lg sm:text-xl font-black font-mono tabular-nums text-white mt-0.5">
              {formatCurrency(monthTotals.totalSsnit)}
            </div>
            <div className="text-[11px] text-slate-300 font-mono tabular-nums">
              5.5% Emp: {formatCurrency(monthTotals.ssnitEmp)} · 13% Sch:{' '}
              {formatCurrency(monthTotals.ssnitEmployer)}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-slate-300">GRA PAYE Income Tax</div>
            <div className="text-lg sm:text-xl font-black font-mono tabular-nums text-white mt-0.5">
              {formatCurrency(monthTotals.paye)}
            </div>
            <div className="text-[11px] text-slate-300 font-mono tabular-nums">
              Total Statutory: {formatCurrency(monthTotals.statutoryTotal)}
            </div>
          </div>
        </div>
      </div>

      {/* 4-Tab Navigation Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#bac4c6] bg-white rounded-t-2xl px-2 sm:px-4 print:hidden">
        <div className="flex items-center overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => setActiveTab('payroll_run')}
            className={cn(
              'px-3 sm:px-4 py-3 font-bold text-xs sm:text-sm border-b-2 whitespace-nowrap flex items-center gap-1.5 cursor-pointer transition-colors',
              activeTab === 'payroll_run'
                ? 'border-[#1c4a59] text-[#1c4a59]'
                : 'border-transparent text-[#6a7f84] hover:text-[#1f2a2e]'
            )}
          >
            <Wallet className="w-3.5 h-3.5 text-[#faae57]" />
            <span>Monthly Payroll Run</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('salary_structure')}
            className={cn(
              'px-3 sm:px-4 py-3 font-bold text-xs sm:text-sm border-b-2 whitespace-nowrap flex items-center gap-1.5 cursor-pointer transition-colors',
              activeTab === 'salary_structure'
                ? 'border-[#1c4a59] text-[#1c4a59]'
                : 'border-transparent text-[#6a7f84] hover:text-[#1f2a2e]'
            )}
          >
            <Users className="w-3.5 h-3.5 text-[#faae57]" />
            <span>Staff Salary Structure ({profiles.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('advances')}
            className={cn(
              'px-3 sm:px-4 py-3 font-bold text-xs sm:text-sm border-b-2 whitespace-nowrap flex items-center gap-1.5 cursor-pointer transition-colors',
              activeTab === 'advances'
                ? 'border-[#1c4a59] text-[#1c4a59]'
                : 'border-transparent text-[#6a7f84] hover:text-[#1f2a2e]'
            )}
          >
            <CreditCard className="w-3.5 h-3.5 text-[#faae57]" />
            <span>Advances & Staff Loans ({advances.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('exports')}
            className={cn(
              'px-3 sm:px-4 py-3 font-bold text-xs sm:text-sm border-b-2 whitespace-nowrap flex items-center gap-1.5 cursor-pointer transition-colors',
              activeTab === 'exports'
                ? 'border-[#1c4a59] text-[#1c4a59]'
                : 'border-transparent text-[#6a7f84] hover:text-[#1f2a2e]'
            )}
          >
            <Landmark className="w-3.5 h-3.5 text-[#faae57]" />
            <span>Bank / MoMo & Statutory Exports</span>
          </button>
        </div>

        <div className="flex items-center gap-2 py-1.5">
          <button
            type="button"
            onClick={triggerPrint}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-[#1c4a59] bg-[#f6f8f7] hover:bg-[#e1c594]/35 border border-[#bac4c6] rounded-xl cursor-pointer whitespace-nowrap"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print Register</span>
          </button>
        </div>
      </div>

      {/* TAB 1: MONTHLY PAYROLL RUN */}
      {activeTab === 'payroll_run' && (
        <div className="bg-white border border-[#bac4c6] rounded-2xl overflow-hidden">
          {/* Action & Filter Bar */}
          <div className="p-4 border-b border-[#bac4c6] flex flex-col md:flex-row md:items-center justify-between gap-3 print:hidden">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-[#6a7f84] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Search staff, ID, or bank..."
                  className="pl-8 pr-3 py-1.5 text-xs border border-[#bac4c6] rounded-xl bg-[#f6f8f7] focus:bg-white focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-1 bg-[#f6f8f7] p-1 rounded-xl border border-[#bac4c6]">
                {(['all', 'draft', 'approved', 'paid'] as const).map(st => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStatusFilter(st)}
                    className={cn(
                      'px-2.5 py-1 text-xs font-bold rounded-lg capitalize transition-colors cursor-pointer',
                      statusFilter === st
                        ? 'bg-[#1c4a59] text-white'
                        : 'text-[#6a7f84] hover:text-[#1f2a2e]'
                    )}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleApproveAllMonth}
                className="px-3 py-1.5 text-xs font-bold text-amber-900 bg-amber-100 hover:bg-amber-200 rounded-xl transition-colors cursor-pointer whitespace-nowrap"
              >
                Approve All Drafts
              </button>
              <button
                type="button"
                onClick={() => {
                  const targetIds = payslips
                    .filter(s => s.payrollMonth === selectedMonth && s.status !== 'paid')
                    .map(s => s.id);
                  if (targetIds.length === 0) {
                    showToast('All payslips for this month are already marked as Paid.', 'info');
                    return;
                  }
                  handleMarkSlipPaid(targetIds);
                }}
                className="px-3 py-1.5 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-xl transition-colors cursor-pointer whitespace-nowrap"
              >
                Mark All Paid / Disbursed
              </button>
              <button
                type="button"
                onClick={handleExportBankMomoSchedule}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-[#1c4a59] bg-[#f6f8f7] hover:bg-slate-200/70 border border-[#bac4c6] rounded-xl cursor-pointer whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Bank/MoMo CSV</span>
              </button>
            </div>
          </div>

          {monthPayslips.length === 0 ? (
            <div className="p-10 text-center space-y-3">
              <p className="text-sm font-bold text-[#1c4a59]">
                No payroll records generated for {formatMonthLabel(selectedMonth)} yet
              </p>
              <p className="text-xs text-[#6a7f84] max-w-md mx-auto">
                Click the button below to automatically compute Basic Salary, Allowances, SSNIT
                (5.5% / 13%), GRA PAYE Tax, and Loan Deductions for all active staff.
              </p>
              <button
                type="button"
                onClick={handleRunMonthlyPayroll}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#1c4a59] hover:bg-[#153844] text-white font-bold text-xs rounded-xl cursor-pointer"
              >
                <Calculator className="w-4 h-4 text-[#faae57]" />
                <span>Generate {formatMonthLabel(selectedMonth)} Payroll Run</span>
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#f6f8f7] border-b border-[#bac4c6] text-[#6a7f84] font-bold">
                    <th className="py-3 px-3.5">Employee · ID</th>
                    <th className="py-3 px-3 text-right">Basic Pay</th>
                    <th className="py-3 px-3 text-right">Allowances</th>
                    <th className="py-3 px-3 text-right">Gross Pay</th>
                    <th className="py-3 px-3 text-right">SSNIT (5.5%)</th>
                    <th className="py-3 px-3 text-right">PAYE Tax</th>
                    <th className="py-3 px-3 text-right">Loan / Adv</th>
                    <th className="py-3 px-3 text-right">Net Pay</th>
                    <th className="py-3 px-3">Payment Channel</th>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-3.5 text-right print:hidden">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {monthPayslips.map(slip => (
                    <tr key={slip.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-3.5">
                        <div className="font-bold text-[#1f2a2e]">{slip.staffName}</div>
                        <div className="text-[11px] text-[#6a7f84] font-mono tabular-nums">
                          {slip.staffId} · {slip.designation}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums">
                        {formatCurrency(slip.basicSalary)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums">
                        {formatCurrency(slip.totalAllowances + slip.bonusAmount)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums font-semibold text-[#1f2a2e]">
                        {formatCurrency(slip.grossPay)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums text-rose-700">
                        -{formatCurrency(slip.ssnitEmployee)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums text-rose-700">
                        -{formatCurrency(slip.payeTax)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums text-rose-700">
                        {slip.loanDeduction + slip.otherDeduction > 0
                          ? `-${formatCurrency(slip.loanDeduction + slip.otherDeduction)}`
                          : '—'}
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums font-black text-[#1c4a59]">
                        {formatCurrency(slip.netPay)}
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-medium text-[#1f2a2e]">{slip.bankOrNetwork}</div>
                        <div className="text-[11px] font-mono tabular-nums text-[#6a7f84]">
                          {slip.accountNumber}
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={cn(
                            'font-bold text-[11px] uppercase tracking-wider',
                            slip.status === 'paid'
                              ? 'text-emerald-700'
                              : slip.status === 'approved'
                              ? 'text-amber-700'
                              : 'text-slate-600'
                          )}
                        >
                          {slip.status}
                        </span>
                      </td>
                      <td className="py-3 px-3.5 text-right print:hidden">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setViewingPayslip(slip)}
                            className="px-2.5 py-1 bg-[#1c4a59] hover:bg-[#153844] text-white font-bold text-[11px] rounded-lg cursor-pointer"
                            title="View & Print Official Payslip"
                          >
                            Payslip
                          </button>
                          {slip.status !== 'paid' && (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  setAdjustingSlip(slip);
                                  setAdjBonus(String(slip.bonusAmount || 0));
                                  setAdjLoanDeduction(String(slip.loanDeduction || 0));
                                  setAdjOtherDeduction(String(slip.otherDeduction || 0));
                                  setAdjNotes(slip.notes || '');
                                }}
                                className="p-1.5 text-[#1c4a59] hover:bg-slate-100 rounded-lg cursor-pointer"
                                title="Adjust Bonus / Deductions"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleMarkSlipPaid([slip.id])}
                                className="px-2 py-1 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-[11px] rounded-lg cursor-pointer"
                                title="Mark Salary Paid"
                              >
                                Pay
                              </button>
                            </>
                          )}
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

      {/* TAB 2: STAFF SALARY STRUCTURE */}
      {activeTab === 'salary_structure' && (
        <div className="bg-white border border-[#bac4c6] rounded-2xl overflow-hidden">
          <div className="p-4 border-b border-[#bac4c6] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-[#1c4a59]">
                Staff Compensation Grades & Bank/MoMo Accounts
              </h2>
              <p className="text-xs text-[#6a7f84]">
                Configure basic pay, allowances, SSNIT/TIN numbers, and disbursement accounts
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleSyncStaffDirectory}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-[#1c4a59] bg-[#f6f8f7] hover:bg-slate-200/70 border border-[#bac4c6] rounded-xl cursor-pointer"
              >
                <Users className="w-3.5 h-3.5" />
                <span>Sync Staff Directory</span>
              </button>
              <button
                type="button"
                onClick={() => openProfileModal()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-[#1c4a59] hover:bg-[#153844] rounded-xl cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 text-[#faae57]" />
                <span>Add Staff Salary Profile</span>
              </button>
            </div>
          </div>

          {profiles.length === 0 ? (
            <div className="p-10 text-center space-y-3">
              <p className="text-xs text-[#6a7f84]">No staff salary profiles configured yet.</p>
              <button
                type="button"
                onClick={handleSyncStaffDirectory}
                className="px-4 py-2 bg-[#1c4a59] text-white text-xs font-bold rounded-xl cursor-pointer"
              >
                Import Teachers from Staff Directory
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#f6f8f7] border-b border-[#bac4c6] text-[#6a7f84] font-bold">
                    <th className="py-3 px-4">Staff Member</th>
                    <th className="py-3 px-3">SSNIT · GRA TIN</th>
                    <th className="py-3 px-3">Payment Account</th>
                    <th className="py-3 px-3 text-right">Basic Salary</th>
                    <th className="py-3 px-3 text-right">Total Allowances</th>
                    <th className="py-3 px-3 text-right">Est. Net Pay</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {profiles.map(prof => {
                    const est = computePayslipFromProfile(
                      prof,
                      selectedMonth,
                      formatMonthLabel(selectedMonth),
                      advances
                    );
                    return (
                      <tr key={prof.id} className="hover:bg-slate-50/80">
                        <td className="py-3 px-4">
                          <div className="font-bold text-[#1f2a2e]">{prof.staffName}</div>
                          <div className="text-[11px] text-[#6a7f84] font-mono">
                            {prof.staffId} · {prof.designation}
                          </div>
                        </td>
                        <td className="py-3 px-3 font-mono tabular-nums text-[11px]">
                          <div>SSNIT: {prof.ssnitNumber}</div>
                          <div className="text-[#6a7f84]">TIN: {prof.tinNumber}</div>
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-semibold text-[#1f2a2e]">
                            {prof.paymentMethod} · {prof.bankOrNetwork}
                          </div>
                          <div className="text-[11px] font-mono tabular-nums text-[#6a7f84]">
                            Acct/MoMo: {prof.accountNumber}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums font-semibold">
                          {formatCurrency(prof.basicSalary)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums">
                          {formatCurrency(
                            prof.responsibilityAllowance +
                              prof.transportAllowance +
                              prof.otherAllowance
                          )}
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums font-black text-[#1c4a59]">
                          {formatCurrency(est.netPay)}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => openProfileModal(prof)}
                              className="p-1.5 text-[#1c4a59] hover:bg-slate-100 rounded-lg cursor-pointer"
                              title="Edit Salary Profile"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteProfile(prof)}
                              className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                              title="Delete Salary Profile"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
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

      {/* TAB 3: ADVANCES & STAFF LOANS */}
      {activeTab === 'advances' && (
        <div className="bg-white border border-[#bac4c6] rounded-2xl overflow-hidden">
          <div className="p-4 border-b border-[#bac4c6] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-[#1c4a59]">
                Staff Salary Advances & Loan Recovery Ledger
              </h2>
              <p className="text-xs text-[#6a7f84]">
                Approved advances automatically deduct their monthly installment during each
                payroll run until settled
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setAdvStaffId(profiles[0]?.staffId || '');
                setIsAdvanceModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-[#1c4a59] hover:bg-[#153844] rounded-xl cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5 text-[#faae57]" />
              <span>Record Salary Advance / Loan</span>
            </button>
          </div>

          {advances.length === 0 ? (
            <div className="p-10 text-center text-xs text-[#6a7f84]">
              No salary advances or staff loans recorded yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#f6f8f7] border-b border-[#bac4c6] text-[#6a7f84] font-bold">
                    <th className="py-3 px-4">Staff Member</th>
                    <th className="py-3 px-3">Type & Purpose</th>
                    <th className="py-3 px-3 text-right">Principal</th>
                    <th className="py-3 px-3 text-right">Monthly Installment</th>
                    <th className="py-3 px-3 text-right">Remaining Balance</th>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {advances.map(adv => (
                    <tr key={adv.id} className="hover:bg-slate-50/80">
                      <td className="py-3 px-4">
                        <div className="font-bold text-[#1f2a2e]">{adv.staffName}</div>
                        <div className="text-[11px] font-mono text-[#6a7f84]">
                          {adv.staffId} · {adv.designation}
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-semibold text-[#1c4a59]">{adv.type}</div>
                        <div className="text-[11px] text-[#6a7f84]">{adv.reason}</div>
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums">
                        {formatCurrency(adv.principalAmount)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums">
                        {formatCurrency(adv.monthlyInstallment)}/mo
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums font-bold text-[#1c4a59]">
                        {formatCurrency(adv.remainingBalance)}
                      </td>
                      <td className="py-3 px-3 font-bold uppercase text-[11px]">
                        <span
                          className={cn(
                            adv.status === 'approved'
                              ? 'text-emerald-700'
                              : adv.status === 'pending'
                              ? 'text-amber-700'
                              : adv.status === 'completed'
                              ? 'text-slate-600'
                              : 'text-rose-700'
                          )}
                        >
                          {adv.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          {adv.status === 'pending' && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleUpdateAdvanceStatus(adv.id, 'approved')}
                                className="px-2.5 py-1 bg-emerald-700 text-white font-bold text-[11px] rounded-lg cursor-pointer"
                              >
                                Approve
                              </button>
                              <button
                                type="button"
                                onClick={() => handleUpdateAdvanceStatus(adv.id, 'declined')}
                                className="px-2.5 py-1 bg-rose-100 text-rose-800 font-bold text-[11px] rounded-lg cursor-pointer"
                              >
                                Decline
                              </button>
                            </>
                          )}
                          {adv.status === 'approved' && adv.remainingBalance > 0 && (
                            <button
                              type="button"
                              onClick={() => handleUpdateAdvanceStatus(adv.id, 'completed')}
                              className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-[#1c4a59] font-bold text-[11px] rounded-lg cursor-pointer"
                            >
                              Mark Settled
                            </button>
                          )}
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

      {/* TAB 4: BANK / MOMO & STATUTORY EXPORTS */}
      {activeTab === 'exports' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Bank & Mobile Money Disbursement Card */}
          <div className="bg-white border border-[#bac4c6] rounded-2xl p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-[#1c4a59]">
                  Bank & Mobile Money Disbursement Schedule
                </h3>
                <p className="text-xs text-[#6a7f84] mt-0.5">
                  Bulk payment file for bank transfer and MTN MoMo / Telecel Cash wallets (
                  {formatMonthLabel(selectedMonth)})
                </p>
              </div>
              <Smartphone className="w-5 h-5 text-[#faae57] shrink-0" />
            </div>

            <div className="bg-[#f6f8f7] border border-[#bac4c6]/70 rounded-xl p-3.5 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-[#6a7f84]">Bank Transfer Beneficiaries</span>
                <span className="font-mono tabular-nums font-bold">
                  {
                    payslips.filter(
                      s =>
                        s.payrollMonth === selectedMonth && s.paymentMethod === 'Bank Transfer'
                    ).length
                  }{' '}
                  staff
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#6a7f84]">Mobile Money (MoMo) Beneficiaries</span>
                <span className="font-mono tabular-nums font-bold">
                  {
                    payslips.filter(
                      s =>
                        s.payrollMonth === selectedMonth && s.paymentMethod === 'Mobile Money'
                    ).length
                  }{' '}
                  staff
                </span>
              </div>
              <div className="flex justify-between pt-2 border-t border-[#bac4c6]/60 font-bold text-[#1c4a59]">
                <span>Total Net Disbursement</span>
                <span className="font-mono tabular-nums">{formatCurrency(monthTotals.net)}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleExportBankMomoSchedule}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#1c4a59] hover:bg-[#153844] text-white font-bold text-xs rounded-xl transition-colors cursor-pointer"
            >
              <Download className="w-4 h-4 text-[#faae57]" />
              <span>Download Bank & MoMo Payment Schedule (CSV)</span>
            </button>
          </div>

          {/* SSNIT & GRA PAYE Statutory Remittance Card */}
          <div className="bg-white border border-[#bac4c6] rounded-2xl p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-[#1c4a59]">
                  Ghana SSNIT (18.5%) & GRA PAYE Tax Schedule
                </h3>
                <p className="text-xs text-[#6a7f84] mt-0.5">
                  Monthly statutory remittance return with employee SSNIT & TIN numbers
                </p>
              </div>
              <ShieldCheck className="w-5 h-5 text-[#faae57] shrink-0" />
            </div>

            <div className="bg-[#f6f8f7] border border-[#bac4c6]/70 rounded-xl p-3.5 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-[#6a7f84]">SSNIT Employee (5.5%) + Employer (13%)</span>
                <span className="font-mono tabular-nums font-bold">
                  {formatCurrency(monthTotals.totalSsnit)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#6a7f84]">GRA PAYE Income Tax Payable</span>
                <span className="font-mono tabular-nums font-bold">
                  {formatCurrency(monthTotals.paye)}
                </span>
              </div>
              <div className="flex justify-between pt-2 border-t border-[#bac4c6]/60 font-bold text-[#1c4a59]">
                <span>Total Statutory Remittance</span>
                <span className="font-mono tabular-nums">
                  {formatCurrency(monthTotals.statutoryTotal)}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleExportStatutorySchedule}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#1c4a59] hover:bg-[#153844] text-white font-bold text-xs rounded-xl transition-colors cursor-pointer"
            >
              <FileText className="w-4 h-4 text-[#faae57]" />
              <span>Download SSNIT & GRA PAYE Schedule (CSV)</span>
            </button>
          </div>
        </div>
      )}

      {/* Official Printable Payslip Modal */}
      <PayslipPrintModal
        payslip={viewingPayslip}
        schoolName={schoolName}
        schoolAddress={schoolAddress}
        schoolPhone={schoolPhone}
        onClose={() => setViewingPayslip(null)}
      />

      {/* Add / Edit Staff Salary Profile Modal */}
      {isProfileModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 overflow-y-auto">
          <form
            onSubmit={handleSaveProfile}
            className="bg-white border border-[#bac4c6] rounded-2xl max-w-xl w-full p-5 space-y-4 shadow-2xl my-8"
          >
            <div className="flex items-center justify-between border-b border-[#bac4c6] pb-3">
              <h3 className="text-sm font-bold text-[#1c4a59]">
                {editingProfile ? 'Edit Staff Salary Profile' : 'Add Staff Salary Profile'}
              </h3>
              <button
                type="button"
                onClick={() => setIsProfileModalOpen(false)}
                className="p-1 text-[#6a7f84] hover:text-[#1f2a2e]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <label className="font-bold text-[#1f2a2e] block mb-1">Staff ID</label>
                <input
                  type="text"
                  required
                  value={formStaffId}
                  onChange={e => setFormStaffId(e.target.value)}
                  className="w-full px-3 py-2 border border-[#bac4c6] rounded-xl font-mono"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="font-bold text-[#1f2a2e] block mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={formStaffName}
                  onChange={e => setFormStaffName(e.target.value)}
                  placeholder="e.g. Kwame Mensah"
                  className="w-full px-3 py-2 border border-[#bac4c6] rounded-xl"
                />
              </div>

              <div>
                <label className="font-bold text-[#1f2a2e] block mb-1">Role / Designation</label>
                <input
                  type="text"
                  value={formDesignation}
                  onChange={e => setFormDesignation(e.target.value)}
                  className="w-full px-3 py-2 border border-[#bac4c6] rounded-xl"
                />
              </div>
              <div>
                <label className="font-bold text-[#1f2a2e] block mb-1">SSNIT Number</label>
                <input
                  type="text"
                  value={formSsnitNumber}
                  onChange={e => setFormSsnitNumber(e.target.value)}
                  className="w-full px-3 py-2 border border-[#bac4c6] rounded-xl font-mono"
                />
              </div>
              <div>
                <label className="font-bold text-[#1f2a2e] block mb-1">GRA TIN Number</label>
                <input
                  type="text"
                  value={formTinNumber}
                  onChange={e => setFormTinNumber(e.target.value)}
                  className="w-full px-3 py-2 border border-[#bac4c6] rounded-xl font-mono"
                />
              </div>

              <div>
                <label className="font-bold text-[#1f2a2e] block mb-1">Payment Method</label>
                <select
                  value={formPaymentMethod}
                  onChange={e => setFormPaymentMethod(e.target.value as any)}
                  className="w-full px-3 py-2 border border-[#bac4c6] rounded-xl bg-white"
                >
                  <option value="Bank Transfer">Bank Transfer</option>
                  <option value="Mobile Money">Mobile Money (MoMo)</option>
                  <option value="Cash">Cash</option>
                </select>
              </div>
              <div>
                <label className="font-bold text-[#1f2a2e] block mb-1">Bank / Network</label>
                <select
                  value={formBankOrNetwork}
                  onChange={e => setFormBankOrNetwork(e.target.value)}
                  className="w-full px-3 py-2 border border-[#bac4c6] rounded-xl bg-white"
                >
                  {BANK_AND_MOMO_OPTIONS.map(opt => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="font-bold text-[#1f2a2e] block mb-1">Account / MoMo No.</label>
                <input
                  type="text"
                  value={formAccountNumber}
                  onChange={e => setFormAccountNumber(e.target.value)}
                  placeholder="Account or Wallet No."
                  className="w-full px-3 py-2 border border-[#bac4c6] rounded-xl font-mono"
                />
              </div>

              <div>
                <label className="font-bold text-[#1f2a2e] block mb-1">Basic Salary (GHS)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={formBasicSalary}
                  onChange={e => setFormBasicSalary(e.target.value)}
                  className="w-full px-3 py-2 border border-[#bac4c6] rounded-xl font-mono"
                />
              </div>
              <div>
                <label className="font-bold text-[#1f2a2e] block mb-1">
                  Responsibility Allow. (GHS)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formRespAllowance}
                  onChange={e => setFormRespAllowance(e.target.value)}
                  className="w-full px-3 py-2 border border-[#bac4c6] rounded-xl font-mono"
                />
              </div>
              <div>
                <label className="font-bold text-[#1f2a2e] block mb-1">
                  Transport/Housing (GHS)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formTransportAllowance}
                  onChange={e => setFormTransportAllowance(e.target.value)}
                  className="w-full px-3 py-2 border border-[#bac4c6] rounded-xl font-mono"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 text-xs">
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formSsnitEnabled}
                  onChange={e => setFormSsnitEnabled(e.target.checked)}
                />
                <span className="font-semibold">Deduct SSNIT (5.5% Emp / 13% Employer)</span>
              </label>

              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formPayeEnabled}
                  onChange={e => setFormPayeEnabled(e.target.checked)}
                />
                <span className="font-semibold">Deduct Ghana GRA PAYE Tax</span>
              </label>
            </div>

            {/* Live Calculation Preview Box */}
            <div className="bg-[#f6f8f7] border border-[#bac4c6] rounded-xl p-3 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span>
                Gross:{' '}
                <strong className="font-mono">{formatCurrency(profilePreview.grossPay)}</strong>
              </span>
              <span>·</span>
              <span>
                SSNIT (5.5%):{' '}
                <strong className="font-mono text-rose-700">
                  -{formatCurrency(profilePreview.ssnitEmployee)}
                </strong>
              </span>
              <span>·</span>
              <span>
                PAYE Tax:{' '}
                <strong className="font-mono text-rose-700">
                  -{formatCurrency(profilePreview.payeTax)}
                </strong>
              </span>
              <span>·</span>
              <span>
                Est. Net Pay:{' '}
                <strong className="font-mono text-[#1c4a59]">
                  {formatCurrency(profilePreview.netPay)}
                </strong>
              </span>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsProfileModalOpen(false)}
                className="px-4 py-2 text-xs font-bold text-[#6a7f84] bg-[#f6f8f7] rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-bold text-white bg-[#1c4a59] hover:bg-[#153844] rounded-xl cursor-pointer"
              >
                Save Salary Profile
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Monthly Slip Bonus / Deduction Adjustment Modal */}
      {adjustingSlip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
          <form
            onSubmit={handleSaveSlipAdjustment}
            className="bg-white border border-[#bac4c6] rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-[#bac4c6] pb-3">
              <div>
                <h3 className="text-sm font-bold text-[#1c4a59]">
                  Adjust Monthly Payslip · {adjustingSlip.staffName}
                </h3>
                <p className="text-[11px] text-[#6a7f84]">{adjustingSlip.periodLabel}</p>
              </div>
              <button
                type="button"
                onClick={() => setAdjustingSlip(null)}
                className="p-1 text-[#6a7f84] hover:text-[#1f2a2e]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-[#1f2a2e] block mb-1">
                  Monthly Bonus / Extra Duty Arrears (GHS)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={adjBonus}
                  onChange={e => setAdjBonus(e.target.value)}
                  className="w-full px-3 py-2 border border-[#bac4c6] rounded-xl font-mono"
                />
              </div>
              <div>
                <label className="font-bold text-[#1f2a2e] block mb-1">
                  Advance / Loan Deduction for This Month (GHS)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={adjLoanDeduction}
                  onChange={e => setAdjLoanDeduction(e.target.value)}
                  className="w-full px-3 py-2 border border-[#bac4c6] rounded-xl font-mono"
                />
              </div>
              <div>
                <label className="font-bold text-[#1f2a2e] block mb-1">
                  Other Deduction / Surcharge (GHS)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={adjOtherDeduction}
                  onChange={e => setAdjOtherDeduction(e.target.value)}
                  className="w-full px-3 py-2 border border-[#bac4c6] rounded-xl font-mono"
                />
              </div>
              <div>
                <label className="font-bold text-[#1f2a2e] block mb-1">Remarks / Note</label>
                <input
                  type="text"
                  value={adjNotes}
                  onChange={e => setAdjNotes(e.target.value)}
                  placeholder="Optional note on payslip"
                  className="w-full px-3 py-2 border border-[#bac4c6] rounded-xl"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setAdjustingSlip(null)}
                className="px-4 py-2 text-xs font-bold text-[#6a7f84] bg-[#f6f8f7] rounded-xl"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-bold text-white bg-[#1c4a59] hover:bg-[#153844] rounded-xl cursor-pointer"
              >
                Recalculate & Save
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Record Salary Advance / Staff Loan Modal */}
      {isAdvanceModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
          <form
            onSubmit={handleCreateAdvance}
            className="bg-white border border-[#bac4c6] rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-[#bac4c6] pb-3">
              <h3 className="text-sm font-bold text-[#1c4a59]">
                Record Staff Salary Advance / Loan
              </h3>
              <button
                type="button"
                onClick={() => setIsAdvanceModalOpen(false)}
                className="p-1 text-[#6a7f84] hover:text-[#1f2a2e]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-[#1f2a2e] block mb-1">Select Staff Member</label>
                <select
                  value={advStaffId}
                  onChange={e => setAdvStaffId(e.target.value)}
                  className="w-full px-3 py-2 border border-[#bac4c6] rounded-xl bg-white"
                >
                  {profiles.map(p => (
                    <option key={p.id} value={p.staffId}>
                      {p.staffName} ({p.staffId})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="font-bold text-[#1f2a2e] block mb-1">Facility Type</label>
                <select
                  value={advType}
                  onChange={e => setAdvType(e.target.value as any)}
                  className="w-full px-3 py-2 border border-[#bac4c6] rounded-xl bg-white"
                >
                  <option value="Salary Advance">Salary Advance</option>
                  <option value="Staff Loan">Staff Welfare Loan</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-[#1f2a2e] block mb-1">
                    Principal Amount (GHS)
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="0.01"
                    required
                    value={advPrincipal}
                    onChange={e => setAdvPrincipal(e.target.value)}
                    className="w-full px-3 py-2 border border-[#bac4c6] rounded-xl font-mono"
                  />
                </div>
                <div>
                  <label className="font-bold text-[#1f2a2e] block mb-1">
                    Monthly Deduction (GHS)
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="0.01"
                    required
                    value={advInstallment}
                    onChange={e => setAdvInstallment(e.target.value)}
                    className="w-full px-3 py-2 border border-[#bac4c6] rounded-xl font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="font-bold text-[#1f2a2e] block mb-1">Reason / Notes</label>
                <input
                  type="text"
                  required
                  value={advReason}
                  onChange={e => setAdvReason(e.target.value)}
                  placeholder="e.g. Termly rent advance"
                  className="w-full px-3 py-2 border border-[#bac4c6] rounded-xl"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsAdvanceModalOpen(false)}
                className="px-4 py-2 text-xs font-bold text-[#6a7f84] bg-[#f6f8f7] rounded-xl"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-bold text-white bg-[#1c4a59] hover:bg-[#153844] rounded-xl cursor-pointer"
              >
                Save & Approve Advance
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Supabase & Dexie Database Schema Diagnostics Drawer */}
      {showSchemaDrawer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white border border-[#bac4c6] rounded-2xl max-w-2xl w-full p-5 space-y-4 shadow-2xl my-8">
            <div className="flex items-center justify-between border-b border-[#bac4c6] pb-3">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-[#1c4a59]" />
                <div>
                  <h3 className="text-sm font-bold text-[#1c4a59]">
                    Payroll Database Connection & Table Diagnostics
                  </h3>
                  <p className="text-[11px] text-[#6a7f84]">
                    Two-way synchronization across Supabase PostgreSQL & Dexie IndexedDB (v17)
                    {lastSyncedAt
                      ? ` · Last Synced ${new Date(lastSyncedAt).toLocaleTimeString()}`
                      : ''}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSchemaDrawer(false)}
                className="p-1 text-[#6a7f84] hover:text-[#1f2a2e] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Connected Tables Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
              {[
                {
                  key: 'staff_salary_profiles',
                  label: 'public.staff_salary_profiles',
                  dexieLabel: 'db.salaryProfiles',
                  localCount: profiles.length
                },
                {
                  key: 'staff_payslips',
                  label: 'public.staff_payslips',
                  dexieLabel: 'db.payslips',
                  localCount: payslips.length
                },
                {
                  key: 'staff_salary_advances',
                  label: 'public.staff_salary_advances',
                  dexieLabel: 'db.salaryAdvances',
                  localCount: advances.length
                },
                {
                  key: 'teachers',
                  label: 'public.teachers',
                  dexieLabel: 'db.teachers',
                  localCount: teachers.length
                },
                {
                  key: 'school_expenses',
                  label: 'public.school_expenses (Salaries)',
                  dexieLabel: 'db.expenses',
                  localCount: salaryExpenses.length
                }
              ].map(item => {
                const st = tableStatus[item.key];
                return (
                  <div
                    key={item.key}
                    className="bg-[#f6f8f7] border border-[#bac4c6]/80 rounded-xl p-3 flex items-center justify-between gap-2"
                  >
                    <div>
                      <div className="font-mono font-bold text-[#1f2a2e]">{item.label}</div>
                      <div className="text-[11px] text-[#6a7f84]">
                        {st?.status || 'Synced'} · Local {item.dexieLabel}
                      </div>
                    </div>
                    <div className="text-right font-mono tabular-nums">
                      <span className="font-black text-[#1c4a59]">
                        {st?.count !== undefined ? Math.max(st.count, item.localCount) : item.localCount}
                      </span>
                      <span className="block text-[10px] text-[#6a7f84]">rows</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Copyable Supabase SQL Migration Script */}
            {payrollSql && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#1c4a59]">
                    Supabase PostgreSQL DDL Schema (`20261001_payroll_tables.sql`)
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(payrollSql);
                      setCopiedSql(true);
                      setTimeout(() => setCopiedSql(false), 2000);
                      showToast('Copied Payroll SQL migration script to clipboard.', 'success');
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#1c4a59] text-white text-xs font-bold rounded-lg cursor-pointer"
                  >
                    {copiedSql ? (
                      <Check className="w-3.5 h-3.5 text-emerald-300" />
                    ) : (
                      <Copy className="w-3.5 h-3.5 text-[#faae57]" />
                    )}
                    <span>{copiedSql ? 'Copied SQL' : 'Copy SQL DDL'}</span>
                  </button>
                </div>
                <pre className="bg-slate-900 text-slate-100 text-[11px] font-mono p-3.5 rounded-xl overflow-x-auto max-h-56">
                  {payrollSql}
                </pre>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => loadCloudPayroll(false)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-[#1c4a59] bg-[#f6f8f7] border border-[#bac4c6] rounded-xl cursor-pointer"
              >
                <RefreshCw className={cn('w-3.5 h-3.5', isSyncing && 'animate-spin')} />
                <span>Verify & Sync Tables Now</span>
              </button>
              <button
                type="button"
                onClick={() => setShowSchemaDrawer(false)}
                className="px-4 py-2 text-xs font-bold text-white bg-[#1c4a59] rounded-xl cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
