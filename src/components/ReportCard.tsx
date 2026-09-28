import React from 'react';
import type { Student, Result, TermReport } from '../db/schema';
import { BookOpen } from 'lucide-react';

interface ReportCardProps {
  student: Student;
  results: Result[];
  term: string;
  academicYear: string;
  termReport?: TermReport;
  schoolProfile?: any;
  academicConfig?: any;
}

export const ReportCard: React.FC<ReportCardProps> = ({ 
  student, 
  results, 
  term, 
  academicYear,
  termReport,
  schoolProfile,
  academicConfig
}) => {
  const normalizedResults = results.map(r => {
    const cScore = Number(r.classScore) || 0;
    const eScore = Number(r.examScore) || 0;
    const tScore = r.totalScore !== undefined && r.totalScore !== null ? Number(r.totalScore) : (cScore + eScore);
    return {
      ...r,
      classScore: cScore,
      examScore: eScore,
      totalScore: tScore
    };
  });
  const totalScore = normalizedResults.reduce((acc, r) => acc + r.totalScore, 0);
  const averageScore = normalizedResults.length > 0 ? (totalScore / normalizedResults.length).toFixed(1) : '0.0';
  
  const profile = schoolProfile || {
    schoolName: 'ESEPA INTERNATIONAL SCHOOL',
    schoolAddress: 'Accra, Ghana',
    schoolPhone: '+233 24 000 0000',
    schoolEmail: 'info@esepa.edu.gh'
  };

  return (
    <div className="ReportCard w-full max-w-4xl bg-white p-4 sm:p-6 md:p-8 lg:p-10 print:p-[10mm] mx-auto border-4 sm:border-[8px] md:border-[10px] border-double border-indigo-900 box-border flex flex-col relative shadow-md rounded-xl sm:rounded-none">
      {/* Header Section */}
      <div className="ReportCard-section text-center space-y-3 mb-5 border-b-2 border-indigo-900 pb-4 relative">
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-5 mb-2">
          <img 
            src="https://cdn.pixabay.com/photo/2016/10/06/19/03/graduation-cap-1719744_1280.png" 
            alt="School Logo" 
            className="w-12 h-12 sm:w-16 sm:h-16 grayscale shrink-0"
          />
          <div className="text-center">
            <h1 className="text-lg sm:text-2xl md:text-3xl font-black text-indigo-900 uppercase tracking-wide sm:tracking-[0.08em] leading-tight">
              {profile.schoolName}
            </h1>
            <p className="text-xs sm:text-sm font-bold text-slate-700 uppercase tracking-widest leading-snug mt-0.5">
              Official Academic Transcript
            </p>
            <p className="text-[11px] sm:text-xs text-slate-600 font-mono mt-0.5">
              {profile.schoolAddress} | TEL: {profile.schoolPhone}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap justify-between items-center gap-2 px-1 sm:px-4">
          <span className="text-[10px] sm:text-xs font-black text-indigo-900 uppercase tracking-wider border border-indigo-900 px-2.5 py-1 rounded-md bg-indigo-50/40">
            {academicYear} Academic Year
          </span>
          <h2 className="text-sm sm:text-base md:text-lg font-black text-white bg-indigo-900 px-4 sm:px-6 py-1 uppercase tracking-tight rounded-md">
            Terminal Report Card
          </h2>
          <span className="text-[10px] sm:text-xs font-black text-indigo-900 uppercase tracking-wider border border-indigo-900 px-2.5 py-1 rounded-md bg-indigo-50/40">
            {term}
          </span>
        </div>
      </div>

      {/* Student Profile Section */}
      <div className="ReportCard-section grid grid-cols-1 sm:grid-cols-12 gap-4 sm:gap-5 mb-5 text-xs sm:text-sm items-center">
        <div className="sm:col-span-3 flex justify-center sm:justify-start">
          <div className="w-28 h-36 sm:w-[35mm] sm:h-[45mm] border-2 border-indigo-900 bg-slate-50 flex items-center justify-center text-slate-500 font-bold uppercase overflow-hidden relative shadow-xs shrink-0">
            {student.photo ? (
              <img src={student.photo} alt={student.firstName} className="w-full h-full object-cover" />
            ) : (
              <>
                <span className="text-[11px] text-center px-2 text-slate-600">Passport</span>
                <div className="absolute inset-x-0 bottom-0 py-1 bg-indigo-900/10 text-[9px] text-indigo-800 font-extrabold text-center uppercase tracking-tight">
                  Official Portrait
                </div>
              </>
            )}
          </div>
        </div>
        <div className="sm:col-span-9 grid grid-cols-1 md:grid-cols-2 print:grid-cols-2 gap-x-6 gap-y-2">
          <DetailRow label="Full Name" value={`${student.firstName} ${student.lastName}`} bold />
          <DetailRow label="Admission No" value={student.studentId} mono />
          <DetailRow label="Class" value={student.class} />
          <DetailRow label="Gender" value={student.gender} />
          <DetailRow label="House / Dept" value={student.house || student.department || '---'} />
          <DetailRow label="Position" value={termReport?.position ? `${termReport.position} of ${termReport.totalStudents || '---'}` : '---'} bold />
        </div>
      </div>

      {/* Academic Table Section */}
      <div className="flex-1 min-h-0">
        <div className="w-full overflow-x-auto mb-5 rounded-sm">
          <table className="w-full min-w-[560px] border-2 border-indigo-900 text-xs sm:text-sm no-print-reset">
            <thead className="bg-indigo-900 text-white">
              <tr>
                <th className="px-2.5 sm:px-3 py-2 border border-white/40 text-left uppercase tracking-wider font-black text-[11px] sm:text-xs">
                  Subject
                </th>
                <th className="px-2 py-2 border border-white/40 text-center uppercase tracking-wider font-black w-20 sm:w-24 text-[11px] sm:text-xs">
                  Class (30%)
                </th>
                <th className="px-2 py-2 border border-white/40 text-center uppercase tracking-wider font-black w-20 sm:w-24 text-[11px] sm:text-xs">
                  Exam (70%)
                </th>
                <th className="px-2 py-2 border border-white/40 text-center uppercase tracking-wider font-black w-20 sm:w-24 text-[11px] sm:text-xs">
                  Total (100%)
                </th>
                <th className="px-2 py-2 border border-white/40 text-center uppercase tracking-wider font-black w-16 text-[11px] sm:text-xs">
                  Grade
                </th>
                <th className="px-2.5 sm:px-3 py-2 border border-white/40 text-left uppercase tracking-wider font-black text-[11px] sm:text-xs">
                  Remarks
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-indigo-900/40 text-slate-900">
              {normalizedResults.length > 0 ? (
                normalizedResults.map((r, i) => (
                  <tr key={i} className="hover:bg-indigo-50/40 transition-colors">
                    <td className="px-2.5 sm:px-3 py-2 border-r border-indigo-900/40 font-extrabold uppercase text-slate-900">
                      {r.subject}
                    </td>
                    <td className="px-2 py-2 border-r border-indigo-900/40 text-center font-bold font-mono tabular-nums text-slate-800">
                      {r.classScore}
                    </td>
                    <td className="px-2 py-2 border-r border-indigo-900/40 text-center font-bold font-mono tabular-nums text-slate-800">
                      {r.examScore}
                    </td>
                    <td className="px-2 py-2 border-r border-indigo-900/40 text-center font-black text-indigo-900 font-mono tabular-nums bg-indigo-50/20">
                      {r.totalScore}
                    </td>
                    <td className="px-2 py-2 border-r border-indigo-900/40 text-center font-black text-slate-900">
                      {r.grade}
                    </td>
                    <td className="px-2.5 sm:px-3 py-2 font-semibold text-slate-700 text-xs leading-snug">
                      {r.remarks}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-slate-600 font-semibold text-xs">
                    No subject scores recorded for this term yet.
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot className="bg-indigo-50/70">
              <tr className="border-t-2 border-indigo-900">
                <td colSpan={3} className="px-3 py-2 font-black text-slate-800 uppercase text-right tracking-wider text-xs">
                  Aggregate / Average
                </td>
                <td className="px-2 py-2 text-center bg-indigo-900 text-white font-black font-mono tabular-nums text-xs sm:text-sm">
                  {totalScore}
                </td>
                <td className="px-2 py-2 text-center font-black font-mono tabular-nums text-indigo-950 text-xs sm:text-sm">
                  {averageScore}
                </td>
                <td className="px-3 py-2 font-black text-indigo-900 uppercase tracking-tight text-xs font-mono">
                  GPA: {((Number(averageScore) / 100) * 4).toFixed(2)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Footer Grid: Attendance, Next Term, Remarks */}
        <div className="ReportCard-section grid grid-cols-1 md:grid-cols-2 print:grid-cols-2 gap-5 sm:gap-6 text-xs sm:text-sm">
          {/* Left Col: Attendance & Next Term */}
          <div className="space-y-4">
            <section className="ReportCard-section space-y-1.5 p-3 border border-slate-200 rounded-lg bg-slate-50/60">
              <h3 className="font-black uppercase text-indigo-900 border-b border-indigo-900/30 pb-1 text-xs">
                Attendance Record
              </h3>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <span className="text-slate-600 uppercase font-bold">Present:</span>
                <span className="font-black text-slate-900 font-mono">{termReport?.attendancePresent ?? '---'}</span>
                <span className="text-slate-600 uppercase font-bold">Absent:</span>
                <span className="font-black text-slate-900 font-mono">
                  {(termReport?.attendanceTotal || 0) - (termReport?.attendancePresent || 0)}
                </span>
              </div>
            </section>

            <section className="ReportCard-section space-y-1.5 p-3 border border-indigo-200 rounded-lg bg-indigo-50/40">
              <h3 className="font-black uppercase text-indigo-900 text-xs">
                Next Term Info
              </h3>
              <div className="space-y-1 text-xs">
                <p className="flex justify-between items-center">
                  <span className="text-slate-700 font-bold">Re-opening:</span>
                  <span className="font-black text-slate-900 font-mono">
                    {academicConfig?.nextTermBegins ? new Date(academicConfig.nextTermBegins).toLocaleDateString() : 'TBD'}
                  </span>
                </p>
                <p className="flex justify-between items-center">
                  <span className="text-slate-700 font-bold">Fees Due:</span>
                  <span className="font-black text-rose-700 font-mono">
                    GHS {(student.totalFees - student.feesPaid).toFixed(2)}
                  </span>
                </p>
              </div>
            </section>
          </div>

          {/* Right Col: Remarks */}
          <div className="space-y-3">
            <div className="space-y-1 p-3 border border-slate-200 rounded-lg bg-white">
              <p className="text-[11px] font-black uppercase text-slate-600 tracking-wider">
                Class Teacher's Remark:
              </p>
              <p className="font-semibold text-slate-900 border-b border-indigo-900/40 pb-1.5 min-h-[2.25rem] leading-snug text-xs sm:text-sm">
                {termReport?.teacherRemark || 'No remark entered.'}
              </p>
            </div>
            <div className="space-y-1 p-3 border border-slate-200 rounded-lg bg-white">
              <p className="text-[11px] font-black uppercase text-slate-600 tracking-wider">
                Headmaster's Remark:
              </p>
              <p className="font-semibold text-slate-900 border-b border-indigo-900/40 pb-1.5 min-h-[2.25rem] leading-snug text-xs sm:text-sm">
                {termReport?.headmasterRemark || 'No remark entered.'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Signature Section */}
      <div className="ReportCard-section pt-6 sm:pt-8 grid grid-cols-1 sm:grid-cols-2 print:grid-cols-2 gap-6 sm:gap-12">
        <div className="text-center space-y-2">
          <div className="border-b-2 border-indigo-900 h-12 w-full flex items-end justify-center relative">
            <span className="text-[10px] text-slate-500 uppercase font-bold tracking-widest pb-1">
              Principal's Authorization
            </span>
          </div>
          <p className="text-xs font-black uppercase text-indigo-900 tracking-wider">
            Class Teacher's Signature
          </p>
        </div>
        <div className="text-center space-y-2">
          <div className="border-b-2 border-indigo-900 h-12 w-full flex items-center justify-center relative">
            <span className="text-[10px] text-slate-500 uppercase font-bold text-center leading-tight">
              Official School Stamp · Authorized Personnel Only
            </span>
          </div>
          <p className="text-xs font-black uppercase text-indigo-900 tracking-wider">
            Headmaster's Signature & Stamp
          </p>
        </div>
      </div>

      {/* Footer Branding */}
      <div className="ReportCard-section mt-6 pt-4 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-2 border-t border-slate-200 text-[10px] sm:text-xs text-slate-600 font-mono">
        <div className="space-y-0.5">
          <p className="font-bold text-slate-800">© 2026 {profile.schoolName}</p>
          <p className="text-[10px] text-slate-600">ESEPA ACADEMIC INFORMATION MANAGEMENT SYSTEM (AIMS)</p>
        </div>
        <div className="sm:text-right space-y-0.5">
          <p className="font-semibold text-slate-700">GEN: {new Date().toISOString().slice(0, 16).replace('T', ' ')}</p>
          <p className="text-[10px] uppercase tracking-tight text-slate-600">Verified Academic Transcript Grade: P</p>
        </div>
      </div>
    </div>
  );
};

const DetailRow = ({ label, value, bold, mono }: { label: string; value: string; bold?: boolean; mono?: boolean }) => (
  <div className="flex items-center justify-between gap-2 border-b border-slate-200 py-1.5 min-h-[1.75rem]">
    <span className="text-[11px] sm:text-xs font-extrabold text-slate-600 uppercase tracking-wider leading-snug shrink-0">
      {label}
    </span>
    <span className={`text-xs sm:text-sm uppercase text-right break-words ${bold ? 'font-black text-indigo-900' : 'font-bold text-slate-900'} ${mono ? 'font-mono' : ''} leading-snug`}>
      {value}
    </span>
  </div>
);
