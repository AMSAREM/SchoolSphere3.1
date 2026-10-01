import { getApiHeaders } from './api';
import { db } from '../db/schema';

export interface StaffSalaryProfile {
  id: string;
  schoolId?: string;
  staffId: string;
  staffName: string;
  designation: string;
  phone?: string;
  email?: string;
  ssnitNumber: string;
  tinNumber: string;
  paymentMethod: 'Bank Transfer' | 'Mobile Money' | 'Cash';
  bankOrNetwork: string;
  accountNumber: string;
  basicSalary: number;
  responsibilityAllowance: number;
  transportAllowance: number;
  otherAllowance: number;
  ssnitEnabled: boolean;
  payeEnabled: boolean;
  manualTaxOverride?: number | null;
  updatedAt: number;
}

export interface PayslipRecord {
  id: string;
  schoolId?: string;
  payrollMonth: string; // YYYY-MM
  periodLabel: string;  // e.g. October 2026
  staffId: string;
  staffName: string;
  designation: string;
  ssnitNumber: string;
  tinNumber: string;
  paymentMethod: 'Bank Transfer' | 'Mobile Money' | 'Cash';
  bankOrNetwork: string;
  accountNumber: string;
  basicSalary: number;
  responsibilityAllowance: number;
  transportAllowance: number;
  otherAllowance: number;
  totalAllowances: number;
  bonusAmount: number;
  grossPay: number;
  ssnitEmployee: number;  // 5.5% of Basic
  ssnitEmployer: number;  // 13.0% of Basic
  taxableIncome: number;
  payeTax: number;
  loanDeduction: number;
  otherDeduction: number;
  totalDeductions: number;
  netPay: number;
  status: 'draft' | 'approved' | 'paid';
  paidAt?: number | null;
  receiptRef: string;
  notes?: string;
  updatedAt: number;
}

export interface SalaryAdvanceRecord {
  id: string;
  schoolId?: string;
  staffId: string;
  staffName: string;
  designation: string;
  type: 'Salary Advance' | 'Staff Loan';
  principalAmount: number;
  monthlyInstallment: number;
  remainingBalance: number;
  reason: string;
  status: 'pending' | 'approved' | 'completed' | 'declined';
  requestedAt: number;
  approvedBy?: string | null;
  approvedAt?: number | null;
}

export interface PayrollTableStatus {
  exists: boolean;
  status: string;
  count: number;
  error?: string;
}

export function round2(val: number): number {
  return Math.round((Number(val) + Number.EPSILON) * 100) / 100;
}

/**
 * Computes Ghana Revenue Authority (GRA) Monthly Graduated PAYE Income Tax (GHS)
 */
export function calculateGhanaPayeTax(chargeableIncome: number): number {
  let remaining = Math.max(0, Number(chargeableIncome) || 0);
  let tax = 0;

  const brackets: Array<{ limit: number; rate: number }> = [
    { limit: 490, rate: 0 },
    { limit: 110, rate: 0.05 },
    { limit: 130, rate: 0.10 },
    { limit: 3166.67, rate: 0.175 },
    { limit: 16000, rate: 0.25 },
    { limit: 30520, rate: 0.30 },
    { limit: Infinity, rate: 0.35 }
  ];

  for (const bracket of brackets) {
    if (remaining <= 0) break;
    const taxableSlice = Math.min(remaining, bracket.limit);
    tax += taxableSlice * bracket.rate;
    remaining -= taxableSlice;
  }

  return round2(tax);
}

export function computePayslipFromProfile(
  profile: StaffSalaryProfile,
  payrollMonth: string,
  periodLabel: string,
  activeAdvances: SalaryAdvanceRecord[],
  existingSlip?: Partial<PayslipRecord>
): PayslipRecord {
  const basic = round2(profile.basicSalary || 0);
  const resp = round2(profile.responsibilityAllowance || 0);
  const trans = round2(profile.transportAllowance || 0);
  const otherAllow = round2(profile.otherAllowance || 0);
  const totalAllowances = round2(resp + trans + otherAllow);
  const bonusAmount = round2(existingSlip?.bonusAmount ?? 0);
  const grossPay = round2(basic + totalAllowances + bonusAmount);

  const ssnitEmployee = profile.ssnitEnabled ? round2(basic * 0.055) : 0;
  const ssnitEmployer = profile.ssnitEnabled ? round2(basic * 0.13) : 0;
  const taxableIncome = round2(Math.max(0, basic - ssnitEmployee + totalAllowances + bonusAmount));

  let payeTax = 0;
  if (profile.payeEnabled) {
    if (
      profile.manualTaxOverride !== undefined &&
      profile.manualTaxOverride !== null &&
      !Number.isNaN(Number(profile.manualTaxOverride)) &&
      Number(profile.manualTaxOverride) >= 0
    ) {
      payeTax = round2(Number(profile.manualTaxOverride));
    } else {
      payeTax = calculateGhanaPayeTax(taxableIncome);
    }
  }

  const staffAdvances = activeAdvances.filter(
    a =>
      a.status === 'approved' &&
      a.remainingBalance > 0 &&
      (a.staffId.toLowerCase() === profile.staffId.toLowerCase() ||
        a.staffName.toLowerCase() === profile.staffName.toLowerCase())
  );

  const computedLoanInstallment = round2(
    staffAdvances.reduce(
      (sum, adv) => sum + Math.min(adv.remainingBalance, adv.monthlyInstallment || adv.remainingBalance),
      0
    )
  );

  const loanDeduction =
    existingSlip?.loanDeduction !== undefined
      ? round2(existingSlip.loanDeduction)
      : computedLoanInstallment;
  const otherDeduction = round2(existingSlip?.otherDeduction ?? 0);

  const totalDeductions = round2(ssnitEmployee + payeTax + loanDeduction + otherDeduction);
  const netPay = round2(Math.max(0, grossPay - totalDeductions));

  const compactMonth = payrollMonth.replace('-', '');
  const suffix = profile.staffId.replace(/[^A-Z0-9]/gi, '').slice(-4).toUpperCase() || '0001';

  return {
    id: existingSlip?.id || `slip-${payrollMonth}-${profile.staffId}`,
    schoolId: profile.schoolId,
    payrollMonth,
    periodLabel,
    staffId: profile.staffId,
    staffName: profile.staffName,
    designation: profile.designation || 'Teaching Staff',
    ssnitNumber: profile.ssnitNumber || 'N/A',
    tinNumber: profile.tinNumber || 'N/A',
    paymentMethod: profile.paymentMethod || 'Bank Transfer',
    bankOrNetwork: profile.bankOrNetwork || 'GCB Bank',
    accountNumber: profile.accountNumber || '—',
    basicSalary: basic,
    responsibilityAllowance: resp,
    transportAllowance: trans,
    otherAllowance: otherAllow,
    totalAllowances,
    bonusAmount,
    grossPay,
    ssnitEmployee,
    ssnitEmployer,
    taxableIncome,
    payeTax,
    loanDeduction,
    otherDeduction,
    totalDeductions,
    netPay,
    status: existingSlip?.status || 'draft',
    paidAt: existingSlip?.paidAt || null,
    receiptRef: existingSlip?.receiptRef || `PAY-${compactMonth}-${suffix}`,
    notes: existingSlip?.notes || '',
    updatedAt: Date.now()
  };
}

export function formatMonthLabel(yyyyMm: string): string {
  const [y, m] = (yyyyMm || '').split('-').map(Number);
  if (!y || !m) return yyyyMm;
  const date = new Date(y, m - 1, 1);
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

/**
 * Synchronizes Payroll tables into local Dexie IndexedDB (db.salaryProfiles, db.payslips, db.salaryAdvances)
 */
export async function syncPayrollToDexie(
  schoolId: string,
  profiles: StaffSalaryProfile[],
  payslips: PayslipRecord[],
  advances: SalaryAdvanceRecord[]
): Promise<void> {
  try {
    await db.transaction('rw', db.salaryProfiles, db.payslips, db.salaryAdvances, async () => {
      await db.salaryProfiles.clear();
      if (profiles.length > 0) {
        await db.salaryProfiles.bulkPut(
          profiles.map(p => ({ ...p, schoolId: p.schoolId || schoolId }))
        );
      }

      await db.payslips.clear();
      if (payslips.length > 0) {
        await db.payslips.bulkPut(
          payslips.map(s => ({ ...s, schoolId: s.schoolId || schoolId }))
        );
      }

      await db.salaryAdvances.clear();
      if (advances.length > 0) {
        await db.salaryAdvances.bulkPut(
          advances.map(a => ({ ...a, schoolId: a.schoolId || schoolId }))
        );
      }
    });
  } catch (err) {
    console.warn('Dexie payroll table sync warning:', err);
  }
}

export async function fetchPayrollCloudState(schoolId: string): Promise<{
  schoolId: string;
  profiles: StaffSalaryProfile[];
  payslips: PayslipRecord[];
  advances: SalaryAdvanceRecord[];
  tableStatus: Record<string, PayrollTableStatus>;
  payrollSql: string;
  syncedAt: number;
} | null> {
  const qs = schoolId ? `?schoolId=${encodeURIComponent(schoolId)}` : '';
  const res = await fetch(`/api/payroll/state${qs}`, {
    headers: getApiHeaders()
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (!data?.success) return null;
  return {
    schoolId: String(data.schoolId || schoolId || 'default'),
    profiles: Array.isArray(data.profiles) ? data.profiles : [],
    payslips: Array.isArray(data.payslips) ? data.payslips : [],
    advances: Array.isArray(data.advances) ? data.advances : [],
    tableStatus: data.tableStatus || {},
    payrollSql: String(data.payrollSql || ''),
    syncedAt: Number(data.syncedAt || Date.now())
  };
}

export async function syncPayrollCloudState(payload: {
  schoolId: string;
  schoolName: string;
  profiles: StaffSalaryProfile[];
  payslips: PayslipRecord[];
  advances: SalaryAdvanceRecord[];
  auditAction?: string;
}): Promise<{
  ok: boolean;
  tableStatus?: Record<string, PayrollTableStatus>;
  payrollSql?: string;
  syncedAt?: number;
}> {
  try {
    const res = await fetch('/api/payroll/sync', {
      method: 'POST',
      headers: getApiHeaders(),
      body: JSON.stringify(payload)
    });
    if (!res.ok) return { ok: false };
    const data = await res.json();
    return {
      ok: Boolean(data?.success),
      tableStatus: data?.tableStatus,
      payrollSql: data?.payrollSql,
      syncedAt: data?.syncedAt
    };
  } catch {
    return { ok: false };
  }
}

export async function disburseSalariesToDatabase(payload: {
  schoolId: string;
  schoolName: string;
  recordedBy: string;
  disbursedSlips: PayslipRecord[];
  profiles: StaffSalaryProfile[];
  payslips: PayslipRecord[];
  advances: SalaryAdvanceRecord[];
}): Promise<{
  ok: boolean;
  createdExpenses: any[];
  tableStatus?: Record<string, PayrollTableStatus>;
}> {
  try {
    // Also record idempotent Salaries expense entries in local Dexie db.expenses
    const existingLocalExpenses = await db.expenses.where('category').equals('Salaries').toArray();
    for (const slip of payload.disbursedSlips) {
      const refTag = `[Ref: ${slip.receiptRef || slip.id}]`;
      const alreadyLocal = existingLocalExpenses.some(e =>
        String(e.description || '').includes(refTag)
      );
      if (!alreadyLocal) {
        const methodMap: Record<string, 'Cash' | 'Bank Transfer' | 'Mobile Money' | 'Cheque'> = {
          'Bank Transfer': 'Bank Transfer',
          'Mobile Money': 'Mobile Money',
          Cash: 'Cash'
        };
        await db.expenses.add({
          description: `${refTag} Staff Salary Disbursement — ${slip.staffName} (${slip.staffId}) · ${slip.periodLabel} (Net: GHS ${Number(slip.netPay || 0).toFixed(2)}, Gross: GHS ${Number(slip.grossPay || 0).toFixed(2)})`,
          category: 'Salaries',
          amount: Math.max(0.01, Number(slip.grossPay || slip.netPay || 0)),
          date: Date.now(),
          paymentMethod: methodMap[slip.paymentMethod] || 'Bank Transfer',
          recordedBy: payload.recordedBy
        });
      }
    }

    const res = await fetch('/api/payroll/disburse', {
      method: 'POST',
      headers: getApiHeaders(),
      body: JSON.stringify(payload)
    });
    if (!res.ok) return { ok: false, createdExpenses: [] };
    const data = await res.json();
    return {
      ok: Boolean(data?.success),
      createdExpenses: Array.isArray(data?.createdExpenses) ? data.createdExpenses : [],
      tableStatus: data?.tableStatus
    };
  } catch {
    return { ok: false, createdExpenses: [] };
  }
}

export function downloadCsvFile(filename: string, headers: string[], rows: (string | number)[][]) {
  const escapeCell = (val: string | number) => `"${String(val ?? '').replace(/"/g, '""')}"`;
  const csvContent = [
    headers.map(escapeCell).join(','),
    ...rows.map(r => r.map(escapeCell).join(','))
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
