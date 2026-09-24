import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ShieldCheck, X, Printer, Lock, FileText, CheckCircle2, Building, Scale, Clock } from 'lucide-react';

interface PrivacyPolicyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function PrivacyPolicyModal({ isOpen, onClose }: PrivacyPolicyModalProps) {
  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/65 backdrop-blur-xs overflow-y-auto print:p-0 print:bg-white print:static">
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 12 }}
          transition={{ duration: 0.2 }}
          className="bg-white rounded-3xl border border-slate-200/90 max-w-3xl w-full p-5 sm:p-8 shadow-2xl relative text-left my-auto max-h-[90vh] flex flex-col print:max-h-none print:shadow-none print:border-none print:p-0"
        >
          {/* Header */}
          <div className="flex items-start justify-between border-b border-slate-100 pb-4 mb-4 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-[#06D6A0]/15 border border-[#06D6A0]/30 text-[#065f46] flex items-center justify-center shrink-0">
                <ShieldCheck className="w-6 h-6 text-[#1B9AAA]" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight">Institutional Privacy Policy</h2>
                  <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                    Act 843 & GDPR
                  </span>
                </div>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  Effective Date: September 2026 • SchoolSphere 3.1 & Akoko Solutions
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 print:hidden">
              <button
                type="button"
                onClick={handlePrint}
                className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
                title="Print Policy"
              >
                <Printer className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Scrollable Content Body */}
          <div className="overflow-y-auto pr-2 space-y-6 text-slate-700 text-xs sm:text-sm leading-relaxed">
            {/* Executive Summary */}
            <div className="p-4 rounded-2xl bg-[#F8FFE5] border border-[#1B9AAA]/20 text-slate-800 space-y-1.5">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#1B9AAA]">Summary of Principles</span>
              <p className="text-xs text-slate-700 leading-normal">
                SchoolSphere is committed to the highest standards of student data confidentiality, institutional autonomy, and cryptographic tenant isolation. Educational institutions remain the sole owners and Data Controllers of all institutional data.
              </p>
            </div>

            {/* Section 1 */}
            <div className="space-y-2">
              <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wide flex items-center gap-2">
                <Building className="w-4 h-4 text-[#1B9AAA]" />
                1. Institutional Roles & Legal Status
              </h3>
              <p>
                Under the <strong>Ghana Data Protection Act, 2012 (Act 843)</strong> and international educational privacy standards (including FERPA principles), the contracting school or educational establishment is the <strong>Data Controller</strong>. SchoolSphere (Akoko Solutions) operates strictly as the <strong>Data Processor</strong>. We never monetize, sell, or rent student or institutional data to third-party advertisers.
              </p>
            </div>

            {/* Section 2 */}
            <div className="space-y-2">
              <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wide flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#1B9AAA]" />
                2. Categories of Information Processed
              </h3>
              <ul className="list-disc pl-5 space-y-1 text-slate-600">
                <li><strong>Student Demographics & Biodata:</strong> Full name, index/matriculation number, class arm, date of birth, medical notes, emergency contacts.</li>
                <li><strong>Academic Performance Records:</strong> Continuous assessment scores (30%), terminal exam results (70%), teacher remarks, attendance percentages, and WAEC/BECE preparation transcripts.</li>
                <li><strong>Parent & Guardian Information:</strong> Names, phone numbers (for SMS broadcast alerts), and email addresses.</li>
                <li><strong>Financial & Fee Records:</strong> Tuition billing invoices, receipt serials, payment method identifiers, and bursary reconciliations.</li>
                <li><strong>Administrative Credentials:</strong> Securely salted bcrypt hashes for teacher, administrator, and bursar accounts.</li>
              </ul>
            </div>

            {/* Section 3 */}
            <div className="space-y-2">
              <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wide flex items-center gap-2">
                <Lock className="w-4 h-4 text-[#1B9AAA]" />
                3. Technical Security & Row-Level Isolation (RLS)
              </h3>
              <p>
                All institutional records are stored in PostgreSQL/Supabase instances with strictly enforced <strong>Row Level Security (RLS)</strong>. Database queries are automatically scoped by institutional <code className="bg-slate-100 px-1.5 py-0.5 rounded text-[11px] font-mono">school_id</code>, ensuring that no school can view, modify, or leak records belonging to another institution.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                <div className="p-3 rounded-xl border border-slate-200 bg-slate-50 flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#06D6A0] shrink-0 mt-0.5" />
                  <span className="text-xs">End-to-End TLS 1.3 Transport Encryption</span>
                </div>
                <div className="p-3 rounded-xl border border-slate-200 bg-slate-50 flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#06D6A0] shrink-0 mt-0.5" />
                  <span className="text-xs">Zero-Knowledge Salted Password Hashes</span>
                </div>
              </div>
            </div>

            {/* Section 4 */}
            <div className="space-y-2">
              <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wide flex items-center gap-2">
                <Clock className="w-4 h-4 text-[#1B9AAA]" />
                4. Data Retention & School Rights
              </h3>
              <p>
                The school administrator retains full rights to export complete student rosters and academic archives in CSV/Excel format at any time. Upon contractual termination, all school tenant records may be permanently purged upon verified request from authorized school directors.
              </p>
            </div>

            {/* Section 5 */}
            <div className="space-y-2">
              <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wide flex items-center gap-2">
                <Scale className="w-4 h-4 text-[#1B9AAA]" />
                5. Compliance Inquiries & Data Protection Officer
              </h3>
              <p>
                For compliance requests or Data Protection Officer (DPO) audits under Act 843, contact:
              </p>
              <div className="p-3 rounded-xl border border-slate-200 bg-slate-50 text-xs space-y-1">
                <p><strong>Akoko Solutions Legal & Privacy Office</strong></p>
                <p>Email: <a href="mailto:privacy@schoolsphere.xyz" className="text-[#1B9AAA] underline">privacy@schoolsphere.xyz</a> / <a href="mailto:legal@schoolsphere.xyz" className="text-[#1B9AAA] underline">legal@schoolsphere.xyz</a></p>
                <p>Accra / Cape Coast, Ghana</p>
              </div>
            </div>
          </div>

          {/* Footer Controls */}
          <div className="border-t border-slate-100 pt-4 mt-4 flex items-center justify-between shrink-0 print:hidden">
            <span className="text-xs text-slate-400">Institutional Governance Document</span>
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 rounded-xl text-xs font-black bg-[#1B9AAA] hover:bg-[#14727D] text-white shadow-md active:scale-95 transition-all cursor-pointer"
            >
              I Understand & Close
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
