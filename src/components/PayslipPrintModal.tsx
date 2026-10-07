import React from 'react';
import { X, Printer, CheckCircle2, ShieldCheck, Building } from 'lucide-react';
import { type PayslipRecord } from '../lib/payrollEngine';
import { formatCurrency, triggerPrint, cn } from '../lib/utils';

interface PayslipPrintModalProps {
  payslip: PayslipRecord | null;
  schoolName: string;
  schoolAddress?: string;
  schoolPhone?: string;
  onClose: () => void;
}

export function PayslipPrintModal({
  payslip,
  schoolName,
  schoolAddress,
  schoolPhone,
  onClose
}: PayslipPrintModalProps) {
  if (!payslip) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-3 sm:p-6 overflow-y-auto print:static print:bg-white print:p-0">
      <div className="bg-white border border-[#bac4c6] rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden print:shadow-none print:border-slate-300 print:rounded-none print:max-w-none">
        {/* Modal Top Action Bar (Hidden in Print) */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-[#1c4a59] text-white print:hidden">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-5 h-5 text-[#faae57]" />
            <div>
              <h3 className="text-sm font-bold tracking-tight">Official Staff Payslip</h3>
              <p className="text-[11px] text-slate-200 font-mono tabular-nums">
                {payslip.receiptRef} · {payslip.periodLabel}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => triggerPrint()}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-[#faae57] hover:bg-[#f59e36] text-[#1f2a2e] font-bold text-xs rounded-xl transition-colors cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Payslip</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-200 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              aria-label="Close payslip modal"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Printable Payslip Sheet */}
        <div className="p-5 sm:p-7 space-y-5 text-[#1f2a2e]">
          {/* Institutional Header */}
          <div className="border-b-2 border-[#1c4a59] pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Building className="w-5 h-5 text-[#1c4a59] shrink-0" />
                <h2 className="text-lg sm:text-xl font-black uppercase tracking-tight text-[#1c4a59]">
                  {schoolName}
                </h2>
              </div>
              <p className="text-xs text-[#6a7f84] mt-1">
                {schoolAddress || 'Campus Bursary & Payroll Administration'}
                {schoolPhone ? ` · Tel: ${schoolPhone}` : ''}
              </p>
            </div>
            <div className="sm:text-right">
              <div className="text-xs font-bold uppercase tracking-wider text-[#1c4a59]">
                Monthly Salary Advice
              </div>
              <div className="text-sm font-black font-mono tabular-nums text-[#1f2a2e] mt-0.5">
                {payslip.periodLabel}
              </div>
              <div className="text-[11px] font-mono tabular-nums text-[#6a7f84]">
                Ref: {payslip.receiptRef}
              </div>
            </div>
          </div>

          {/* Staff Metadata Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-[#f6f8f7] border border-[#bac4c6]/70 rounded-xl p-3.5 text-xs">
            <div>
              <span className="text-[#6a7f84] block">Employee Name</span>
              <span className="font-bold text-[#1f2a2e]">{payslip.staffName}</span>
            </div>
            <div>
              <span className="text-[#6a7f84] block">Staff ID · Role</span>
              <span className="font-mono tabular-nums font-semibold text-[#1f2a2e]">
                {payslip.staffId} · {payslip.designation}
              </span>
            </div>
            <div>
              <span className="text-[#6a7f84] block">Disbursement Status</span>
              <span
                className={cn(
                  'font-bold uppercase tracking-wider',
                  payslip.status === 'paid'
                    ? 'text-emerald-700'
                    : payslip.status === 'approved'
                    ? 'text-amber-700'
                    : 'text-slate-600'
                )}
              >
                {payslip.status === 'paid'
                  ? 'Paid / Disbursed'
                  : payslip.status === 'approved'
                  ? 'Approved for Payment'
                  : 'Draft Calculation'}
              </span>
            </div>
            <div>
              <span className="text-[#6a7f84] block">SSNIT Number</span>
              <span className="font-mono tabular-nums font-semibold text-[#1f2a2e]">
                {payslip.ssnitNumber || 'N/A'}
              </span>
            </div>
            <div>
              <span className="text-[#6a7f84] block">GRA TIN Number</span>
              <span className="font-mono tabular-nums font-semibold text-[#1f2a2e]">
                {payslip.tinNumber || 'N/A'}
              </span>
            </div>
            <div>
              <span className="text-[#6a7f84] block">Payment Channel</span>
              <span className="font-mono tabular-nums font-semibold text-[#1f2a2e]">
                {payslip.paymentMethod} · {payslip.bankOrNetwork} ({payslip.accountNumber})
              </span>
            </div>
          </div>

          {/* Two-Column Earnings vs Deductions Table */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Earnings */}
            <div className="border border-[#bac4c6] rounded-xl overflow-hidden">
              <div className="bg-[#f6f8f7] px-3.5 py-2 border-b border-[#bac4c6] flex items-center justify-between">
                <span className="text-xs font-bold text-[#1c4a59]">Earnings & Allowances</span>
                <span className="text-[11px] font-mono text-[#6a7f84]">GHS</span>
              </div>
              <div className="divide-y divide-slate-100 text-xs">
                <div className="px-3.5 py-2.5 flex items-center justify-between">
                  <span className="text-slate-700">Monthly Basic Salary</span>
                  <span className="font-mono tabular-nums font-semibold">
                    {formatCurrency(payslip.basicSalary)}
                  </span>
                </div>
                <div className="px-3.5 py-2.5 flex items-center justify-between">
                  <span className="text-slate-700">Responsibility Allowance</span>
                  <span className="font-mono tabular-nums">
                    {formatCurrency(payslip.responsibilityAllowance)}
                  </span>
                </div>
                <div className="px-3.5 py-2.5 flex items-center justify-between">
                  <span className="text-slate-700">Transport & Housing</span>
                  <span className="font-mono tabular-nums">
                    {formatCurrency(payslip.transportAllowance)}
                  </span>
                </div>
                <div className="px-3.5 py-2.5 flex items-center justify-between">
                  <span className="text-slate-700">Extra Duty / Other Allowance</span>
                  <span className="font-mono tabular-nums">
                    {formatCurrency(payslip.otherAllowance)}
                  </span>
                </div>
                {payslip.bonusAmount > 0 && (
                  <div className="px-3.5 py-2.5 flex items-center justify-between">
                    <span className="text-emerald-700 font-medium">Monthly Bonus / Arrears</span>
                    <span className="font-mono tabular-nums font-semibold text-emerald-700">
                      {formatCurrency(payslip.bonusAmount)}
                    </span>
                  </div>
                )}
                <div className="px-3.5 py-2.5 bg-slate-50 flex items-center justify-between font-bold text-[#1f2a2e]">
                  <span>Gross Earnings</span>
                  <span className="font-mono tabular-nums text-[#1c4a59]">
                    {formatCurrency(payslip.grossPay)}
                  </span>
                </div>
              </div>
            </div>

            {/* Statutory & Other Deductions */}
            <div className="border border-[#bac4c6] rounded-xl overflow-hidden">
              <div className="bg-[#f6f8f7] px-3.5 py-2 border-b border-[#bac4c6] flex items-center justify-between">
                <span className="text-xs font-bold text-rose-800">Statutory & Other Deductions</span>
                <span className="text-[11px] font-mono text-[#6a7f84]">GHS</span>
              </div>
              <div className="divide-y divide-slate-100 text-xs">
                <div className="px-3.5 py-2.5 flex items-center justify-between">
                  <span className="text-slate-700">SSNIT Employee Tier 1&2 (5.5%)</span>
                  <span className="font-mono tabular-nums text-rose-700">
                    -{formatCurrency(payslip.ssnitEmployee)}
                  </span>
                </div>
                <div className="px-3.5 py-2.5 flex items-center justify-between">
                  <span className="text-slate-700">GRA PAYE Income Tax</span>
                  <span className="font-mono tabular-nums text-rose-700">
                    -{formatCurrency(payslip.payeTax)}
                  </span>
                </div>
                <div className="px-3.5 py-2.5 flex items-center justify-between">
                  <span className="text-slate-700">Salary Advance / Loan Recovery</span>
                  <span className="font-mono tabular-nums text-rose-700">
                    -{formatCurrency(payslip.loanDeduction)}
                  </span>
                </div>
                <div className="px-3.5 py-2.5 flex items-center justify-between">
                  <span className="text-slate-700">Other Welfare / Surcharge</span>
                  <span className="font-mono tabular-nums text-rose-700">
                    -{formatCurrency(payslip.otherDeduction)}
                  </span>
                </div>
                <div className="px-3.5 py-2.5 bg-rose-50/50 flex items-center justify-between font-bold text-rose-900">
                  <span>Total Deductions</span>
                  <span className="font-mono tabular-nums">
                    -{formatCurrency(payslip.totalDeductions)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Statutory Employer Contribution & Chargeable Income Summary */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#6a7f84] px-1">
            <span>
              Chargeable Income:{' '}
              <strong className="font-mono tabular-nums text-[#1f2a2e]">
                {formatCurrency(payslip.taxableIncome)}
              </strong>
            </span>
            <span>·</span>
            <span>
              Employer SSNIT (13.0%):{' '}
              <strong className="font-mono tabular-nums text-[#1f2a2e]">
                {formatCurrency(payslip.ssnitEmployer)}
              </strong>
            </span>
            <span>·</span>
            <span>
              Total SSNIT Tier 1&2 (18.5%):{' '}
              <strong className="font-mono tabular-nums text-[#1f2a2e]">
                {formatCurrency(payslip.ssnitEmployee + payslip.ssnitEmployer)}
              </strong>
            </span>
          </div>

          {/* Net Take-Home Pay Banner */}
          <div className="bg-[#1c4a59] text-white rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="text-xs text-slate-200 font-medium">
                Net Take-Home Salary ({payslip.periodLabel})
              </div>
              <div className="text-[11px] text-slate-300 mt-0.5">
                Payable via {payslip.paymentMethod} · {payslip.bankOrNetwork} ({payslip.accountNumber})
              </div>
            </div>
            <div className="text-2xl font-black font-mono tabular-nums text-[#faae57]">
              {formatCurrency(payslip.netPay)}
            </div>
          </div>

          {/* Institutional Signatures */}
          <div className="pt-6 grid grid-cols-2 gap-8 text-xs text-[#6a7f84]">
            <div className="border-t border-[#bac4c6] pt-2">
              <p className="font-bold text-[#1f2a2e]">Bursar / Payroll Officer</p>
              <p>Authorized Signature & Stamp</p>
            </div>
            <div className="border-t border-[#bac4c6] pt-2 text-right">
              <p className="font-bold text-[#1f2a2e]">Headteacher Endorsement</p>
              <p className="inline-flex items-center gap-1 justify-end">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>Verified Payroll Record</span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
