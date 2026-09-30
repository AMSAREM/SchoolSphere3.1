import React from 'react';
import type { Student, Result, TermReport } from '../db/schema';

interface ReportCardProps {
  student: Student;
  results: Result[];
  term: string;
  academicYear: string;
  termReport?: TermReport;
  schoolProfile?: any;
  academicConfig?: any;
  viewMode?: 'responsive' | 'a4';
}

export const ReportCard: React.FC<ReportCardProps> = ({ 
  student, 
  results, 
  term, 
  academicYear,
  termReport,
  schoolProfile,
  academicConfig,
  viewMode = 'responsive'
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
    schoolName: 'SCHOOLSPHERE PORTAL',
    schoolAddress: 'Accra, Ghana',
    schoolPhone: '0551187045 / 0554234590',
    schoolEmail: 'amoakoemmanuel@hotmail.com'
  };

  const isA4Mode = viewMode === 'a4';

  return (
    <div
      className={[
        'ReportCard bg-white mx-auto box-border flex flex-col justify-between relative shadow-md border-double border-indigo-900 text-slate-900',
        isA4Mode
          ? 'w-[210mm] min-h-[297mm] p-[10mm] sm:p-[12mm] border-[8px] rounded-none'
          : 'w-full max-w-full md:max-w-[210mm] md:min-h-[297mm] p-4 sm:p-6 md:p-[12mm] border-4 sm:border-[8px] rounded-xl md:rounded-none',
        'print:w-[210mm] print:min-h-[297mm] print:max-h-[297mm] print:p-[10mm] print:border-[8px] print:rounded-none print:shadow-none'
      ].join(' ')}
    >
      {/* Top & Middle Content Wrapper */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Header Section */}
        <div className="ReportCard-section text-center space-y-2.5 mb-3.5 print:mb-3 border-b-2 border-indigo-900 pb-3 relative">
          <div className="flex flex-col sm:flex-row print:flex-row items-center justify-center gap-2.5 sm:gap-4">
            <img 
              src={profile.schoolLogo || "https://cdn.pixabay.com/photo/2016/10/06/19/03/graduation-cap-1719744_1280.png"} 
              alt="School Crest" 
              className="w-12 h-12 sm:w-14 sm:h-14 print:w-14 print:h-14 object-contain grayscale shrink-0"
            />
            <div className="text-center">
              <h1 className="text-lg sm:text-2xl md:text-[26px] print:text-[22px] font-black text-indigo-950 uppercase tracking-wide leading-tight">
                {profile.schoolName}
              </h1>
              <p className="text-[11px] sm:text-xs font-extrabold text-slate-700 uppercase tracking-[0.18em] leading-snug mt-0.5">
                Official Academic Transcript
              </p>
              <p className="text-[11px] sm:text-xs text-slate-600 font-mono mt-0.5">
                {profile.schoolAddress || 'Accra, Ghana'} · TEL: {profile.schoolPhone || '+233 24 000 0000'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-indigo-900/15 text-[11px] sm:text-xs">
            <span className="font-extrabold text-indigo-950 uppercase tracking-wider font-mono">
              Academic Year: {academicYear}
            </span>
            <span className="font-black text-white bg-indigo-900 px-3.5 py-1 uppercase tracking-widest text-xs sm:text-sm print:text-xs">
              Terminal Report Card
            </span>
            <span className="font-extrabold text-indigo-950 uppercase tracking-wider font-mono">
              {term}
            </span>
          </div>
        </div>

        {/* Student Profile Section */}
        <div
          className={[
            'ReportCard-section ReportCard-bio-grid grid gap-3.5 sm:gap-5 mb-3.5 print:mb-3 text-xs sm:text-sm items-center',
            isA4Mode ? 'grid-cols-12' : 'grid-cols-1 sm:grid-cols-12 print:grid-cols-12'
          ].join(' ')}
        >
          <div className={isA4Mode ? 'col-span-3 flex justify-start' : 'sm:col-span-3 print:col-span-3 flex justify-center sm:justify-start print:justify-start'}>
            <div className="w-24 h-30 sm:w-[32mm] sm:h-[40mm] print:w-[30mm] print:h-[38mm] border-2 border-indigo-900 bg-slate-50 flex items-center justify-center text-slate-600 font-bold uppercase overflow-hidden relative shrink-0">
              {student.photo ? (
                <img src={student.photo} alt={student.firstName} className="w-full h-full object-cover" />
              ) : (
                <>
                  <span className="text-[11px] text-center px-2 text-slate-600 font-extrabold">Passport</span>
                  <div className="absolute inset-x-0 bottom-0 py-1 bg-indigo-900/10 text-[9px] text-indigo-900 font-black text-center uppercase tracking-tight">
                    Official Portrait
                  </div>
                </>
              )}
            </div>
          </div>
          <div
            className={[
              'ReportCard-details-grid grid gap-x-5 gap-y-1.5',
              isA4Mode
                ? 'col-span-9 grid-cols-2'
                : 'sm:col-span-9 print:col-span-9 grid-cols-1 md:grid-cols-2 print:grid-cols-2'
            ].join(' ')}
          >
            <DetailRow label="Full Name" value={`${student.firstName} ${student.lastName}`} bold />
            <DetailRow label="Admission No" value={student.studentId} mono />
            <DetailRow label="Class" value={student.class} />
            <DetailRow label="Gender" value={student.gender} />
            <DetailRow label="House / Dept" value={student.house || student.department || '---'} />
            <DetailRow
              label="Class Position"
              value={termReport?.position ? `${termReport.position} of ${termReport.totalStudents || '---'}` : '---'}
              bold
              mono
            />
          </div>
        </div>

        {/* Academic Table Section */}
        <div className="w-full overflow-x-auto print:overflow-visible mb-3.5 print:mb-3">
          <table className="w-full min-w-[520px] print:min-w-0 border-2 border-indigo-900 text-xs sm:text-[13px] print:text-[11.5px] no-print-reset border-collapse">
            <thead className="bg-indigo-900 text-white">
              <tr>
                <th className="px-2.5 py-2 print:py-1.5 border border-indigo-800 text-left uppercase tracking-wider font-black text-[11px] sm:text-xs print:text-[10.5px]">
                  Subject
                </th>
                <th className="px-2 py-2 print:py-1.5 border border-indigo-800 text-center uppercase tracking-wider font-black w-20 sm:w-24 text-[11px] sm:text-xs print:text-[10.5px]">
                  Class (30%)
                </th>
                <th className="px-2 py-2 print:py-1.5 border border-indigo-800 text-center uppercase tracking-wider font-black w-20 sm:w-24 text-[11px] sm:text-xs print:text-[10.5px]">
                  Exam (70%)
                </th>
                <th className="px-2 py-2 print:py-1.5 border border-indigo-800 text-center uppercase tracking-wider font-black w-20 sm:w-24 text-[11px] sm:text-xs print:text-[10.5px]">
                  Total (100%)
                </th>
                <th className="px-2 py-2 print:py-1.5 border border-indigo-800 text-center uppercase tracking-wider font-black w-16 text-[11px] sm:text-xs print:text-[10.5px]">
                  Grade
                </th>
                <th className="px-2.5 py-2 print:py-1.5 border border-indigo-800 text-left uppercase tracking-wider font-black text-[11px] sm:text-xs print:text-[10.5px]">
                  Remarks
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-indigo-900/30 text-slate-900">
              {normalizedResults.length > 0 ? (
                normalizedResults.map((r, i) => (
                  <tr key={i} className="even:bg-slate-50/60 hover:bg-indigo-50/40 transition-colors">
                    <td className="px-2.5 py-1.5 print:py-1 border-r border-indigo-900/30 font-extrabold uppercase text-slate-900">
                      {r.subject}
                    </td>
                    <td className="px-2 py-1.5 print:py-1 border-r border-indigo-900/30 text-center font-bold font-mono tabular-nums text-slate-800">
                      {r.classScore}
                    </td>
                    <td className="px-2 py-1.5 print:py-1 border-r border-indigo-900/30 text-center font-bold font-mono tabular-nums text-slate-800">
                      {r.examScore}
                    </td>
                    <td className="px-2 py-1.5 print:py-1 border-r border-indigo-900/30 text-center font-black text-indigo-950 font-mono tabular-nums bg-indigo-50/30">
                      {r.totalScore}
                    </td>
                    <td className="px-2 py-1.5 print:py-1 border-r border-indigo-900/30 text-center font-black text-slate-900 font-mono">
                      {r.grade}
                    </td>
                    <td className="px-2.5 py-1.5 print:py-1 font-semibold text-slate-800 text-xs print:text-[11px] leading-snug">
                      {r.remarks}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-slate-600 font-bold text-xs uppercase tracking-wider">
                    No subject scores recorded for this term yet.
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot className="bg-indigo-50/80 border-t-2 border-indigo-900">
              <tr>
                <td colSpan={3} className="px-3 py-2 print:py-1.5 font-black text-slate-900 uppercase text-right tracking-wider text-xs">
                  Aggregate / Term Average
                </td>
                <td className="px-2 py-2 print:py-1.5 text-center bg-indigo-900 text-white font-black font-mono tabular-nums text-xs sm:text-sm">
                  {totalScore}
                </td>
                <td className="px-2 py-2 print:py-1.5 text-center font-black font-mono tabular-nums text-indigo-950 text-xs sm:text-sm border-r border-indigo-900/30">
                  {averageScore}%
                </td>
                <td className="px-3 py-2 print:py-1.5 font-black text-indigo-950 uppercase tracking-tight text-xs font-mono tabular-nums">
                  GPA: {((Number(averageScore) / 100) * 4).toFixed(2)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Footer Grid: Attendance, Next Term, Remarks */}
        <div
          className={[
            'ReportCard-section ReportCard-footer-grid grid gap-3.5 sm:gap-5 text-xs sm:text-sm',
            isA4Mode ? 'grid-cols-2' : 'grid-cols-1 md:grid-cols-2 print:grid-cols-2'
          ].join(' ')}
        >
          {/* Left Col: Attendance & Next Term */}
          <div className="space-y-2.5">
            <section className="ReportCard-section space-y-1.5 p-2.5 sm:p-3 border border-slate-300 bg-slate-50/70">
              <h3 className="font-black uppercase text-indigo-950 border-b border-indigo-900/25 pb-1 text-[11px] sm:text-xs tracking-wider">
                Attendance Summary
              </h3>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs pt-0.5">
                <span className="text-slate-700 uppercase font-bold">Days Present:</span>
                <span className="font-black text-slate-900 font-mono tabular-nums text-right">
                  {termReport?.attendancePresent ?? '---'} / {termReport?.attendanceTotal ?? '---'}
                </span>
                <span className="text-slate-700 uppercase font-bold">Days Absent:</span>
                <span className="font-black text-slate-900 font-mono tabular-nums text-right">
                  {(termReport?.attendanceTotal || 0) - (termReport?.attendancePresent || 0)}
                </span>
              </div>
            </section>

            <section className="ReportCard-section space-y-1.5 p-2.5 sm:p-3 border border-indigo-200 bg-indigo-50/40">
              <h3 className="font-black uppercase text-indigo-950 border-b border-indigo-900/20 pb-1 text-[11px] sm:text-xs tracking-wider">
                Next Term & Account Status
              </h3>
              <div className="space-y-1 text-xs pt-0.5">
                <p className="flex justify-between items-center gap-2">
                  <span className="text-slate-700 font-bold uppercase">Re-opening Date:</span>
                  <span className="font-black text-slate-900 font-mono tabular-nums">
                    {academicConfig?.nextTermBegins ? new Date(academicConfig.nextTermBegins).toLocaleDateString() : 'TBD'}
                  </span>
                </p>
                <p className="flex justify-between items-center gap-2">
                  <span className="text-slate-700 font-bold uppercase">Arrears / Fees Due:</span>
                  <span className="font-black text-rose-700 font-mono tabular-nums">
                    GHS {Math.max(0, (student.totalFees || 0) - (student.feesPaid || 0)).toFixed(2)}
                  </span>
                </p>
              </div>
            </section>
          </div>

          {/* Right Col: Remarks */}
          <div className="space-y-2.5">
            <div className="space-y-1 p-2.5 sm:p-3 border border-slate-300 bg-white">
              <p className="text-[11px] font-black uppercase text-indigo-950 tracking-wider">
                Class Teacher's Remark:
              </p>
              <p className="font-semibold text-slate-900 border-b border-indigo-900/30 pb-1 min-h-[2rem] leading-snug text-xs">
                {termReport?.teacherRemark || 'No remark entered.'}
              </p>
            </div>
            <div className="space-y-1 p-2.5 sm:p-3 border border-slate-300 bg-white">
              <p className="text-[11px] font-black uppercase text-indigo-950 tracking-wider">
                Headmaster's Remark:
              </p>
              <p className="font-semibold text-slate-900 border-b border-indigo-900/30 pb-1 min-h-[2rem] leading-snug text-xs">
                {termReport?.headmasterRemark || 'No remark entered.'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Anchored Signatures & Branding */}
      <div className="pt-4 print:pt-3 mt-3 border-t border-indigo-900/20">
        {/* Signature Section */}
        <div
          className={[
            'ReportCard-section ReportCard-sig-grid grid gap-6 sm:gap-12',
            isA4Mode ? 'grid-cols-2' : 'grid-cols-1 sm:grid-cols-2 print:grid-cols-2'
          ].join(' ')}
        >
          <div className="text-center space-y-1.5">
            <div className="border-b-2 border-indigo-900 h-10 print:h-9 w-full flex items-end justify-center relative">
              <span className="text-[10px] text-slate-600 uppercase font-bold tracking-widest pb-1">
                Class Teacher Authorization
              </span>
            </div>
            <p className="text-[11px] sm:text-xs font-black uppercase text-indigo-950 tracking-wider">
              Class Teacher's Signature
            </p>
          </div>
          <div className="text-center space-y-1.5">
            <div className="border-b-2 border-indigo-900 h-10 print:h-9 w-full flex items-end justify-center relative">
              <span className="text-[10px] text-slate-600 uppercase font-bold text-center leading-tight pb-1">
                Official School Stamp & Endorsement
              </span>
            </div>
            <p className="text-[11px] sm:text-xs font-black uppercase text-indigo-950 tracking-wider">
              Headmaster's Signature & Stamp
            </p>
          </div>
        </div>

        {/* Footer Branding */}
        <div className="ReportCard-section mt-3 pt-2.5 flex flex-col sm:flex-row print:flex-row justify-between items-start sm:items-center print:items-center gap-1 border-t border-slate-300 text-[10px] sm:text-[11px] text-slate-700 font-mono">
          <div>
            <span className="font-bold text-slate-900">© {new Date().getFullYear()} {profile.schoolName}</span>
            <span className="mx-1.5" aria-hidden="true">·</span>
            <span>ACADEMIC INFORMATION MANAGEMENT SYSTEM (AIMS)</span>
          </div>
          <div className="sm:text-right print:text-right font-semibold text-slate-800">
            <span>ISSUED: {new Date().toISOString().slice(0, 10)}</span>
            <span className="mx-1.5" aria-hidden="true">·</span>
            <span className="uppercase">VERIFIED TRANSCRIPT</span>
          </div>
        </div>
      </div>
    </div>
  );
};

const DetailRow = ({ label, value, bold, mono }: { label: string; value: string; bold?: boolean; mono?: boolean }) => (
  <div className="flex items-center justify-between gap-2 border-b border-slate-300 py-1 min-h-[1.6rem]">
    <span className="text-[11px] sm:text-xs font-extrabold text-slate-700 uppercase tracking-wider leading-snug shrink-0">
      {label}
    </span>
    <span className={`text-xs sm:text-[13px] uppercase text-right break-words ${bold ? 'font-black text-indigo-950' : 'font-bold text-slate-900'} ${mono ? 'font-mono tabular-nums' : ''} leading-snug`}>
      {value}
    </span>
  </div>
);
