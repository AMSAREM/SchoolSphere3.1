import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { FileText, X, Printer, CheckCircle2, Shield, KeyRound, AlertTriangle, Scale } from 'lucide-react';

interface TermsOfServiceModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function TermsOfServiceModal({ isOpen, onClose }: TermsOfServiceModalProps) {
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
              <div className="w-11 h-11 rounded-2xl bg-[#1B9AAA]/15 border border-[#1B9AAA]/30 text-[#1B9AAA] flex items-center justify-center shrink-0">
                <FileText className="w-6 h-6 text-[#1B9AAA]" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight">Terms of Service & License Agreement</h2>
                </div>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  Institutional Master Contract • SchoolSphere 3.1 & Akoko Solutions
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 print:hidden">
              <button
                type="button"
                onClick={handlePrint}
                className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
                title="Print Terms"
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
            {/* Agreement Notice */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-slate-800 space-y-1">
              <p className="text-xs font-semibold">
                By activating an institutional license, creating a school workspace, or signing into SchoolSphere, you represent that you have authority to bind your educational institution to these terms.
              </p>
            </div>

            {/* Section 1 */}
            <div className="space-y-2">
              <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wide flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-[#1B9AAA]" />
                1. Institutional Licensing & Seat Authorization
              </h3>
              <p>
                Access to the SchoolSphere suite is licensed on an institution-by-institution basis. Valid institutional license keys (issued by Akoko Solutions) authorize the contracting campus to operate academic portals, teacher marks collation, and fee collections.
              </p>
              <ul className="list-disc pl-5 space-y-1 text-slate-600">
                <li>License keys are non-transferable and restricted to the registered school entity.</li>
                <li>Sharing license keys with unverified secondary campuses constitutes a material breach and grounds for suspension.</li>
              </ul>
            </div>

            {/* Section 2 */}
            <div className="space-y-2">
              <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wide flex items-center gap-2">
                <Shield className="w-4 h-4 text-[#1B9AAA]" />
                2. User Accounts & Staff Security
              </h3>
              <p>
                Schools are responsible for assigning appropriate Role-Based Access Controls (RBAC) to their personnel:
              </p>
              <ul className="list-disc pl-5 space-y-1 text-slate-600">
                <li><strong>Administrators & Headteachers:</strong> Supervise campus configuration, student admission, and academic term transitions.</li>
                <li><strong>Teachers:</strong> Input continuous assessments and terminal exam scores. Teachers cannot alter school-wide billing tables.</li>
                <li><strong>Accountants / Bursars:</strong> Issue student tuition receipts and record payments.</li>
              </ul>
              <p className="text-xs text-slate-500 italic mt-1">
                Account passwords must be safeguarded. SchoolSphere strictly prohibits username-based backdoor access or unauthenticated API queries.
              </p>
            </div>

            {/* Section 3 */}
            <div className="space-y-2">
              <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wide flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-[#06D6A0]" />
                3. Cloud Single Source of Truth & Offline Operations
              </h3>
              <p>
                All production data is reconciled through Supabase PostgreSQL as the authoritative single source of truth. IndexedDB (Dexie) serves strictly as an offline read/write buffer during temporary power or telecommunications outages. Upon reconnection, offline records must be promptly synced to the cloud.
              </p>
            </div>

            {/* Section 4 */}
            <div className="space-y-2">
              <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wide flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-[#EF476F]" />
                4. Acceptable Use & Prohibited Conduct
              </h3>
              <p>Institutions and users agree NOT to:</p>
              <ul className="list-disc pl-5 space-y-1 text-slate-600">
                <li>Attempt to bypass Row Level Security (RLS) to access another school's records.</li>
                <li>Falsify academic grades, BECE/WASSCE transcripts, or bursary receipts.</li>
                <li>Use automated bots or denial-of-service stress tests against the platform.</li>
              </ul>
            </div>

            {/* Section 5 */}
            <div className="space-y-2">
              <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wide flex items-center gap-2">
                <Scale className="w-4 h-4 text-[#1B9AAA]" />
                5. Governing Law & Jurisdiction
              </h3>
              <p>
                These Terms are governed by and construed in accordance with the Laws of the Republic of Ghana. Any disputes arising under this agreement shall be settled through good-faith negotiation or arbitration in Accra, Ghana.
              </p>
            </div>
          </div>

          {/* Footer Controls */}
          <div className="border-t border-slate-100 pt-4 mt-4 flex items-center justify-between shrink-0 print:hidden">
            <span className="text-xs text-slate-400">Institutional Master Agreement</span>
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 rounded-xl text-xs font-black bg-[#1B9AAA] hover:bg-[#14727D] text-white shadow-md active:scale-95 transition-all cursor-pointer"
            >
              Accept & Close
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
