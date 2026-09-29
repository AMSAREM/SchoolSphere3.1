import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Student, Result, TermReport } from "../db/schema";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

let isProcessingPrint = false;

/**
 * Triggers the browser's print dialog with best-practices for enterprise applications.
 * Handles focus, processing state, and ensures UI settles before printing.
 */
export function triggerPrint() {
  if (isProcessingPrint) return;
  
  try {
    isProcessingPrint = true;
    document.body.classList.add('printing-in-progress');
    window.focus();

    setTimeout(() => {
      window.print();
      
      const cleanup = () => {
        document.body.classList.remove('printing-in-progress');
        isProcessingPrint = false;
        window.removeEventListener('afterprint', cleanup);
      };

      window.addEventListener('afterprint', cleanup);
      setTimeout(cleanup, 2000);
    }, 250);
  } catch (error) {
    console.error('Print failed:', error);
    document.body.classList.remove('printing-in-progress');
    isProcessingPrint = false;
  }
}

export function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-GH', {
    style: 'currency',
    currency: 'GHS',
  }).format(amount);
}

export interface VectorReportCardPayload {
  student: Student;
  results: Result[];
  term: string;
  academicYear: string;
  termReport?: TermReport;
  schoolProfile?: {
    schoolName?: string;
    schoolAddress?: string;
    schoolPhone?: string;
    schoolEmail?: string;
    logo?: string;
  };
  academicConfig?: {
    nextTermBegins?: string;
    currentTerm?: string;
    academicYear?: string;
  };
}

export interface VectorBroadsheetPayload {
  schoolName: string;
  selectedClass: string;
  selectedTerm: string;
  academicYear: string;
  subjects: { id?: number | string; name: string; code?: string }[];
  students: Student[];
  results: Result[];
  rankings: Record<string, { position: number; total: number }>;
}

export interface VectorFeeStatementPayload {
  schoolName: string;
  student: Student;
}

/**
 * Draws a single 100% vector A4 Student Report Card onto the active jsPDF page (210mm x 297mm).
 * Text, tables, borders, and badges are native PDF vector objects—never a blurry screenshot.
 */
function renderVectorReportCardPage(pdf: any, data: VectorReportCardPayload) {
  const { student, results, term, academicYear, termReport, schoolProfile, academicConfig } = data;

  const profile = {
    schoolName: schoolProfile?.schoolName || 'ESEPA INTERNATIONAL SCHOOL',
    schoolAddress: schoolProfile?.schoolAddress || 'Accra, Ghana',
    schoolPhone: schoolProfile?.schoolPhone || '+233 24 000 0000',
    schoolEmail: schoolProfile?.schoolEmail || 'info@esepa.edu.gh',
  };

  const normalizedResults = (results || []).map((r) => {
    const cScore = Number(r.classScore) || 0;
    const eScore = Number(r.examScore) || 0;
    const tScore = r.totalScore !== undefined && r.totalScore !== null ? Number(r.totalScore) : cScore + eScore;
    return {
      ...r,
      classScore: cScore,
      examScore: eScore,
      totalScore: tScore,
    };
  });

  const totalScore = normalizedResults.reduce((acc, r) => acc + r.totalScore, 0);
  const averageScore = normalizedResults.length > 0 ? (totalScore / normalizedResults.length).toFixed(1) : '0.0';
  const gpa = ((Number(averageScore) / 100) * 4).toFixed(2);

  // Page Background
  pdf.setFillColor(255, 255, 255);
  pdf.rect(0, 0, 210, 297, 'F');

  // Double-Border Institutional Frame (#1e1b4b = RGB 30, 27, 75)
  pdf.setDrawColor(30, 27, 75);
  pdf.setLineWidth(0.9);
  pdf.rect(8, 8, 194, 281, 'S');
  pdf.setLineWidth(0.35);
  pdf.rect(9.8, 9.8, 190.4, 277.4, 'S');

  // --- 1. HEADER SECTION ---
  // Draw clean vector mortarboard / academic crest on left of header
  const crestCx = 25;
  const crestCy = 22;
  pdf.setFillColor(30, 27, 75);
  pdf.setDrawColor(30, 27, 75);
  pdf.setLineWidth(0.4);
  // Diamond cap top
  pdf.lines(
    [
      [8, -4.2],
      [8, 4.2],
      [-8, 4.2],
      [-8, -4.2],
    ],
    crestCx - 8,
    crestCy,
    [1, 1],
    'FD',
    true
  );
  // Skull cap base
  pdf.roundedRect(crestCx - 4.5, crestCy + 2.2, 9, 3.6, 0.8, 0.8, 'F');
  // Tassel
  pdf.setDrawColor(217, 119, 6);
  pdf.setLineWidth(0.5);
  pdf.line(crestCx + 5.5, crestCy + 1, crestCx + 6.8, crestCy + 5.5);
  pdf.setFillColor(217, 119, 6);
  pdf.circle(crestCx + 6.8, crestCy + 5.8, 0.7, 'F');

  // School Name
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(16);
  pdf.setTextColor(30, 27, 75);
  pdf.text(String(profile.schoolName).toUpperCase(), 108, 19.5, { align: 'center', maxWidth: 145 });

  // Subtitle
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9.5);
  pdf.setTextColor(51, 65, 85);
  pdf.text('OFFICIAL ACADEMIC TRANSCRIPT', 108, 25, { align: 'center' });

  // Address & Phone
  pdf.setFont('courier', 'bold');
  pdf.setFontSize(8.5);
  pdf.setTextColor(71, 85, 105);
  pdf.text(`${profile.schoolAddress}  |  TEL: ${profile.schoolPhone}`, 108, 29.8, { align: 'center' });

  // Academic Year / Terminal Report Card / Term Banner Row
  const bannerY = 33.5;
  // Left Box: Academic Year
  pdf.setFillColor(238, 242, 255);
  pdf.setDrawColor(30, 27, 75);
  pdf.setLineWidth(0.35);
  pdf.roundedRect(15, bannerY, 48, 7.2, 1.2, 1.2, 'FD');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.setTextColor(30, 27, 75);
  pdf.text(`${academicYear} ACADEMIC YEAR`, 39, bannerY + 4.8, { align: 'center' });

  // Center Pill: Terminal Report Card
  pdf.setFillColor(30, 27, 75);
  pdf.roundedRect(68, bannerY - 0.3, 74, 7.8, 1.4, 1.4, 'F');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10.5);
  pdf.setTextColor(255, 255, 255);
  pdf.text('TERMINAL REPORT CARD', 105, bannerY + 4.9, { align: 'center' });

  // Right Box: Term
  pdf.setFillColor(238, 242, 255);
  pdf.setDrawColor(30, 27, 75);
  pdf.roundedRect(147, bannerY, 48, 7.2, 1.2, 1.2, 'FD');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8.5);
  pdf.setTextColor(30, 27, 75);
  pdf.text(String(term || 'TERM 1').toUpperCase(), 171, bannerY + 4.8, { align: 'center' });

  // Header Bottom Divider
  pdf.setDrawColor(30, 27, 75);
  pdf.setLineWidth(0.55);
  pdf.line(15, 43.8, 195, 43.8);

  // --- 2. STUDENT PROFILE & PORTRAIT SECTION ---
  const bioTopY = 47.5;
  const portraitX = 15;
  const portraitY = bioTopY;
  const portraitW = 28;
  const portraitH = 34;

  pdf.setFillColor(248, 250, 252);
  pdf.setDrawColor(30, 27, 75);
  pdf.setLineWidth(0.45);
  pdf.rect(portraitX, portraitY, portraitW, portraitH, 'FD');

  let drewPhoto = false;
  if (student.photo && student.photo.startsWith('data:image/')) {
    try {
      const format = student.photo.includes('image/png') ? 'PNG' : 'JPEG';
      pdf.addImage(student.photo, format, portraitX + 0.6, portraitY + 0.6, portraitW - 1.2, portraitH - 1.2);
      drewPhoto = true;
    } catch {
      drewPhoto = false;
    }
  }

  if (!drewPhoto) {
    // Crisp vector passport placeholder
    pdf.setDrawColor(148, 163, 184);
    pdf.setLineWidth(0.35);
    pdf.circle(portraitX + portraitW / 2, portraitY + 11.5, 4.5, 'S');
    pdf.roundedRect(portraitX + 6.5, portraitY + 17.5, portraitW - 13, 8, 3, 3, 'S');

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7);
    pdf.setTextColor(71, 85, 105);
    pdf.text('PASSPORT', portraitX + portraitW / 2, portraitY + 28, { align: 'center' });

    pdf.setFillColor(224, 231, 255);
    pdf.rect(portraitX + 0.3, portraitY + portraitH - 4.8, portraitW - 0.6, 4.5, 'F');
    pdf.setFontSize(6);
    pdf.setTextColor(30, 27, 75);
    pdf.text('OFFICIAL PORTRAIT', portraitX + portraitW / 2, portraitY + portraitH - 1.8, { align: 'center' });
  }

  // 2-Column Student Bio Metadata
  const col1X = 48;
  const col1W = 70.5;
  const col2X = 124.5;
  const col2W = 70.5;

  const positionVal = termReport?.position
    ? `${termReport.position} OF ${termReport.totalStudents || '---'}`
    : '---';

  const drawBioField = (
    x: number,
    y: number,
    w: number,
    label: string,
    value: string,
    opts?: { highlight?: boolean; mono?: boolean }
  ) => {
    pdf.setDrawColor(203, 213, 225);
    pdf.setLineWidth(0.25);
    pdf.line(x, y + 8.2, x + w, y + 8.2);

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7.5);
    pdf.setTextColor(71, 85, 105);
    pdf.text(label.toUpperCase(), x, y + 5.8);

    pdf.setFont(opts?.mono ? 'courier' : 'helvetica', 'bold');
    pdf.setFontSize(9);
    if (opts?.highlight) {
      pdf.setTextColor(30, 27, 75);
    } else {
      pdf.setTextColor(15, 23, 42);
    }
    const maxValW = w - 26;
    const cleanVal = String(value || '---').toUpperCase();
    const truncated = pdf.splitTextToSize(cleanVal, maxValW)[0] || cleanVal;
    pdf.text(truncated, x + w, y + 5.8, { align: 'right' });
  };

  drawBioField(col1X, bioTopY + 1, col1W, 'Full Name', `${student.firstName} ${student.lastName}`, { highlight: true });
  drawBioField(col2X, bioTopY + 1, col2W, 'Admission No', student.studentId || '---', { mono: true });

  drawBioField(col1X, bioTopY + 12, col1W, 'Class', student.class || '---');
  drawBioField(col2X, bioTopY + 12, col2W, 'Gender', student.gender || '---');

  drawBioField(col1X, bioTopY + 23, col1W, 'House / Dept', student.house || student.department || '---');
  drawBioField(col2X, bioTopY + 23, col2W, 'Position', positionVal, { highlight: true });

  // --- 3. ACADEMIC SUBJECTS TABLE ---
  const tableX = 15;
  const tableY = 86;
  const tableW = 180;
  const colWidths = [55, 22, 22, 24, 17, 40]; // Sum = 180mm
  const colStarts = [
    tableX,
    tableX + colWidths[0],
    tableX + colWidths[0] + colWidths[1],
    tableX + colWidths[0] + colWidths[1] + colWidths[2],
    tableX + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3],
    tableX + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + colWidths[4],
  ];

  const headerH = 8;
  pdf.setFillColor(30, 27, 75);
  pdf.rect(tableX, tableY, tableW, headerH, 'F');

  // Column Header Labels
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(7.8);
  pdf.setTextColor(255, 255, 255);

  const headers = ['SUBJECT', 'CLASS (30%)', 'EXAM (70%)', 'TOTAL (100%)', 'GRADE', 'REMARKS'];
  headers.forEach((hText, idx) => {
    const cStart = colStarts[idx];
    const cWidth = colWidths[idx];
    if (idx === 0 || idx === 5) {
      pdf.text(hText, cStart + 2.5, tableY + 5.2);
    } else {
      pdf.text(hText, cStart + cWidth / 2, tableY + 5.2, { align: 'center' });
    }
    if (idx > 0) {
      pdf.setDrawColor(255, 255, 255);
      pdf.setLineWidth(0.2);
      pdf.line(cStart, tableY, cStart, tableY + headerH);
    }
  });

  // Dynamic Row Height so any subject count fits cleanly on 1 A4 page
  const rowCount = Math.max(normalizedResults.length, 1);
  const maxTableBodyH = 104; // Leaves generous room for footer boxes & signatures
  const rowH = Math.min(7.6, Math.max(5.6, maxTableBodyH / rowCount));

  let currentY = tableY + headerH;

  if (normalizedResults.length > 0) {
    normalizedResults.forEach((r, rowIdx) => {
      // Zebra stripe
      if (rowIdx % 2 === 1) {
        pdf.setFillColor(248, 250, 252);
        pdf.rect(tableX, currentY, tableW, rowH, 'F');
      }
      // Subtle tint for Total column
      pdf.setFillColor(238, 242, 255);
      pdf.rect(colStarts[3], currentY, colWidths[3], rowH, 'F');

      // Row bottom line
      pdf.setDrawColor(148, 163, 184);
      pdf.setLineWidth(0.2);
      pdf.line(tableX, currentY + rowH, tableX + tableW, currentY + rowH);

      // Column vertical dividers
      for (let c = 1; c < colStarts.length; c++) {
        pdf.line(colStarts[c], currentY, colStarts[c], currentY + rowH);
      }

      const textBaseline = currentY + rowH * 0.68;

      // Subject
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8.3);
      pdf.setTextColor(15, 23, 42);
      const subjText = pdf.splitTextToSize(String(r.subject || '').toUpperCase(), colWidths[0] - 4)[0] || '';
      pdf.text(subjText, colStarts[0] + 2.5, textBaseline);

      // Class Score
      pdf.setFont('courier', 'bold');
      pdf.setFontSize(9);
      pdf.setTextColor(30, 41, 59);
      pdf.text(String(r.classScore), colStarts[1] + colWidths[1] / 2, textBaseline, { align: 'center' });

      // Exam Score
      pdf.text(String(r.examScore), colStarts[2] + colWidths[2] / 2, textBaseline, { align: 'center' });

      // Total Score
      pdf.setTextColor(30, 27, 75);
      pdf.text(String(r.totalScore), colStarts[3] + colWidths[3] / 2, textBaseline, { align: 'center' });

      // Grade
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8.8);
      pdf.setTextColor(15, 23, 42);
      pdf.text(String(r.grade || '-'), colStarts[4] + colWidths[4] / 2, textBaseline, { align: 'center' });

      // Remarks
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(7.8);
      pdf.setTextColor(51, 65, 85);
      const remText = pdf.splitTextToSize(String(r.remarks || ''), colWidths[5] - 4)[0] || '';
      pdf.text(remText, colStarts[5] + 2.5, textBaseline);

      currentY += rowH;
    });
  } else {
    const emptyH = 14;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8.5);
    pdf.setTextColor(100, 116, 139);
    pdf.text('No subject scores recorded for this term yet.', tableX + tableW / 2, currentY + 8.5, { align: 'center' });
    currentY += emptyH;
  }

  // Table Footer Row (Aggregate / Average / GPA)
  const footerH = 8.2;
  pdf.setFillColor(224, 231, 255);
  pdf.rect(tableX, currentY, tableW, footerH, 'F');

  // Solid Indigo Total Box
  pdf.setFillColor(30, 27, 75);
  pdf.rect(colStarts[3], currentY, colWidths[3], footerH, 'F');

  pdf.setDrawColor(30, 27, 75);
  pdf.setLineWidth(0.45);
  pdf.line(tableX, currentY, tableX + tableW, currentY);

  const footerBaseline = currentY + 5.5;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8.2);
  pdf.setTextColor(30, 41, 59);
  pdf.text('AGGREGATE / AVERAGE', colStarts[3] - 3, footerBaseline, { align: 'right' });

  pdf.setFont('courier', 'bold');
  pdf.setFontSize(9.5);
  pdf.setTextColor(255, 255, 255);
  pdf.text(String(totalScore), colStarts[3] + colWidths[3] / 2, footerBaseline, { align: 'center' });

  pdf.setTextColor(30, 27, 75);
  pdf.text(String(averageScore), colStarts[4] + colWidths[4] / 2, footerBaseline, { align: 'center' });

  pdf.setFont('courier', 'bold');
  pdf.setFontSize(8.5);
  pdf.text(`GPA: ${gpa}`, colStarts[5] + 2.5, footerBaseline);

  currentY += footerH;

  // Outer Table Border
  pdf.setDrawColor(30, 27, 75);
  pdf.setLineWidth(0.5);
  pdf.rect(tableX, tableY, tableW, currentY - tableY, 'S');

  // --- 4. ATTENDANCE, NEXT TERM & REMARKS (2-COLUMN VECTOR GRID) ---
  const sectionY = Math.max(currentY + 6, 198);
  const leftBoxX = 15;
  const rightBoxX = 108;
  const boxW = 87;
  const subBoxH = 20.5;

  // Left Top: Attendance Record
  pdf.setFillColor(248, 250, 252);
  pdf.setDrawColor(203, 213, 225);
  pdf.setLineWidth(0.3);
  pdf.roundedRect(leftBoxX, sectionY, boxW, subBoxH, 1.5, 1.5, 'FD');

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.setTextColor(30, 27, 75);
  pdf.text('ATTENDANCE RECORD', leftBoxX + 3.5, sectionY + 5.2);
  pdf.setDrawColor(203, 213, 225);
  pdf.line(leftBoxX + 3.5, sectionY + 6.8, leftBoxX + boxW - 3.5, sectionY + 6.8);

  const attPresent = termReport?.attendancePresent ?? 68;
  const attTotal = termReport?.attendanceTotal ?? 70;
  const attAbsent = Math.max(0, Number(attTotal) - Number(attPresent));

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.setTextColor(71, 85, 105);
  pdf.text('PRESENT:', leftBoxX + 3.5, sectionY + 12.2);
  pdf.text('ABSENT:', leftBoxX + 3.5, sectionY + 17.4);

  pdf.setFont('courier', 'bold');
  pdf.setFontSize(9);
  pdf.setTextColor(15, 23, 42);
  pdf.text(`${attPresent} / ${attTotal} DAYS`, leftBoxX + boxW - 3.5, sectionY + 12.2, { align: 'right' });
  pdf.text(`${attAbsent} DAYS`, leftBoxX + boxW - 3.5, sectionY + 17.4, { align: 'right' });

  // Left Bottom: Next Term Info
  const nextBoxY = sectionY + subBoxH + 3.5;
  pdf.setFillColor(238, 242, 255);
  pdf.setDrawColor(199, 210, 254);
  pdf.roundedRect(leftBoxX, nextBoxY, boxW, subBoxH, 1.5, 1.5, 'FD');

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.setTextColor(30, 27, 75);
  pdf.text('NEXT TERM INFO', leftBoxX + 3.5, nextBoxY + 5.2);
  pdf.setDrawColor(199, 210, 254);
  pdf.line(leftBoxX + 3.5, nextBoxY + 6.8, leftBoxX + boxW - 3.5, nextBoxY + 6.8);

  const reopenDate = academicConfig?.nextTermBegins
    ? new Date(academicConfig.nextTermBegins).toLocaleDateString()
    : 'TBD';
  const feesDue = ((Number(student.totalFees) || 0) - (Number(student.feesPaid) || 0)).toFixed(2);

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.setTextColor(51, 65, 85);
  pdf.text('RE-OPENING:', leftBoxX + 3.5, nextBoxY + 12.2);
  pdf.text('FEES DUE:', leftBoxX + 3.5, nextBoxY + 17.4);

  pdf.setFont('courier', 'bold');
  pdf.setFontSize(9);
  pdf.setTextColor(15, 23, 42);
  pdf.text(reopenDate, leftBoxX + boxW - 3.5, nextBoxY + 12.2, { align: 'right' });
  pdf.setTextColor(190, 18, 60); // Rose-700
  pdf.text(`GHS ${feesDue}`, leftBoxX + boxW - 3.5, nextBoxY + 17.4, { align: 'right' });

  // Right Top: Class Teacher's Remark
  pdf.setFillColor(255, 255, 255);
  pdf.setDrawColor(203, 213, 225);
  pdf.roundedRect(rightBoxX, sectionY, boxW, subBoxH, 1.5, 1.5, 'FD');

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(7.5);
  pdf.setTextColor(71, 85, 105);
  pdf.text("CLASS TEACHER'S REMARK:", rightBoxX + 3.5, sectionY + 5.2);

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8.3);
  pdf.setTextColor(15, 23, 42);
  const teacherRemarkLines = pdf.splitTextToSize(
    termReport?.teacherRemark || 'No remark entered.',
    boxW - 7
  );
  pdf.text(teacherRemarkLines.slice(0, 2), rightBoxX + 3.5, sectionY + 10.8);
  pdf.setDrawColor(30, 27, 75);
  pdf.setLineWidth(0.2);
  pdf.line(rightBoxX + 3.5, sectionY + subBoxH - 2.5, rightBoxX + boxW - 3.5, sectionY + subBoxH - 2.5);

  // Right Bottom: Headmaster's Remark
  pdf.setFillColor(255, 255, 255);
  pdf.setDrawColor(203, 213, 225);
  pdf.setLineWidth(0.3);
  pdf.roundedRect(rightBoxX, nextBoxY, boxW, subBoxH, 1.5, 1.5, 'FD');

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(7.5);
  pdf.setTextColor(71, 85, 105);
  pdf.text("HEADMASTER'S REMARK:", rightBoxX + 3.5, nextBoxY + 5.2);

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8.3);
  pdf.setTextColor(15, 23, 42);
  const headRemarkLines = pdf.splitTextToSize(
    termReport?.headmasterRemark || 'No remark entered.',
    boxW - 7
  );
  pdf.text(headRemarkLines.slice(0, 2), rightBoxX + 3.5, nextBoxY + 10.8);
  pdf.setDrawColor(30, 27, 75);
  pdf.setLineWidth(0.2);
  pdf.line(rightBoxX + 3.5, nextBoxY + subBoxH - 2.5, rightBoxX + boxW - 3.5, nextBoxY + subBoxH - 2.5);

  // --- 5. SIGNATURES & STAMP SECTION ---
  const sigLineY = 264;
  // Left Signature
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(6.5);
  pdf.setTextColor(100, 116, 139);
  pdf.text("PRINCIPAL'S AUTHORIZATION", 55, sigLineY - 2, { align: 'center' });

  pdf.setDrawColor(30, 27, 75);
  pdf.setLineWidth(0.45);
  pdf.line(20, sigLineY, 90, sigLineY);

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8.2);
  pdf.setTextColor(30, 27, 75);
  pdf.text("CLASS TEACHER'S SIGNATURE", 55, sigLineY + 4.5, { align: 'center' });

  // Right Signature
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(6.5);
  pdf.setTextColor(100, 116, 139);
  pdf.text('OFFICIAL SCHOOL STAMP · AUTHORIZED PERSONNEL ONLY', 155, sigLineY - 2, { align: 'center' });

  pdf.setDrawColor(30, 27, 75);
  pdf.setLineWidth(0.45);
  pdf.line(120, sigLineY, 190, sigLineY);

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8.2);
  pdf.setTextColor(30, 27, 75);
  pdf.text("HEADMASTER'S SIGNATURE & STAMP", 155, sigLineY + 4.5, { align: 'center' });

  // --- 6. OFFICIAL FOOTER BRANDING ---
  const footerRuleY = 274.5;
  pdf.setDrawColor(203, 213, 225);
  pdf.setLineWidth(0.25);
  pdf.line(15, footerRuleY, 195, footerRuleY);

  pdf.setFont('courier', 'bold');
  pdf.setFontSize(7.2);
  pdf.setTextColor(30, 41, 59);
  pdf.text(`(C) 2026 ${String(profile.schoolName).toUpperCase()}`, 15, footerRuleY + 4.2);

  pdf.setFont('courier', 'normal');
  pdf.setFontSize(6.8);
  pdf.setTextColor(71, 85, 105);
  pdf.text('ESEPA ACADEMIC INFORMATION MANAGEMENT SYSTEM (AIMS)', 15, footerRuleY + 7.8);

  const genStamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
  pdf.setFont('courier', 'bold');
  pdf.setFontSize(7.2);
  pdf.setTextColor(51, 65, 85);
  pdf.text(`GEN: ${genStamp}`, 195, footerRuleY + 4.2, { align: 'right' });

  pdf.setFont('courier', 'normal');
  pdf.setFontSize(6.8);
  pdf.setTextColor(71, 85, 105);
  pdf.text('VERIFIED ACADEMIC TRANSCRIPT GRADE: P', 195, footerRuleY + 7.8, { align: 'right' });
}

/**
 * Exports a single Student Report Card as a 100% native vector A4 PDF.
 */
export async function exportReportCardVectorPDF(payload: VectorReportCardPayload, filename: string) {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  renderVectorReportCardPage(pdf, payload);
  pdf.save(`${filename}.pdf`);
}

/**
 * Exports a batch of Student Report Cards as a multi-page 100% native vector A4 PDF.
 */
export async function exportBatchReportCardsVectorPDF(payloads: VectorReportCardPayload[], filename: string) {
  if (!payloads.length) return;
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  payloads.forEach((payload, index) => {
    if (index > 0) {
      pdf.addPage('a4', 'portrait');
    }
    renderVectorReportCardPage(pdf, payload);
  });

  pdf.save(`${filename}.pdf`);
}

/**
 * Exports the Class Examination Broadsheet as a sharp vector A4 Landscape PDF.
 */
export async function exportBroadsheetVectorPDF(payload: VectorBroadsheetPayload, filename: string) {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  const pageW = 297;
  const pageH = 210;
  const margin = 12;
  const usableW = pageW - margin * 2;

  const drawBroadsheetHeader = (pageNum: number) => {
    pdf.setFillColor(255, 255, 255);
    pdf.rect(0, 0, pageW, pageH, 'F');

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(15);
    pdf.setTextColor(30, 27, 75);
    pdf.text('EXAMINATION BROADSHEET', margin, 16);

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9.5);
    pdf.setTextColor(71, 85, 105);
    pdf.text(
      `Class Summary for ${payload.selectedClass} — ${payload.selectedTerm} (${payload.academicYear})`,
      margin,
      21.5
    );

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10.5);
    pdf.setTextColor(15, 23, 42);
    pdf.text(String(payload.schoolName || 'ESEPA INTERNATIONAL SCHOOL').toUpperCase(), pageW - margin, 16, {
      align: 'right',
    });

    pdf.setFont('courier', 'bold');
    pdf.setFontSize(8);
    pdf.setTextColor(100, 116, 139);
    pdf.text(`Run Date: ${new Date().toLocaleDateString()}  |  Page ${pageNum}`, pageW - margin, 21.5, {
      align: 'right',
    });

    pdf.setDrawColor(30, 27, 75);
    pdf.setLineWidth(0.5);
    pdf.line(margin, 24.5, pageW - margin, 24.5);
  };

  let pageNum = 1;
  drawBroadsheetHeader(pageNum);

  const subjects = payload.subjects || [];
  const nameColW = 56;
  const totalColW = 18;
  const posColW = 16;
  const remainingW = Math.max(40, usableW - nameColW - totalColW - posColW);
  const subColW = subjects.length > 0 ? remainingW / subjects.length : remainingW;

  const drawTableHeader = (y: number) => {
    const h = 8.5;
    pdf.setFillColor(30, 27, 75);
    pdf.rect(margin, y, usableW, h, 'F');

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7.5);
    pdf.setTextColor(255, 255, 255);
    pdf.text('STUDENT INFO', margin + 2.5, y + 5.5);

    let cx = margin + nameColW;
    subjects.forEach((sub) => {
      const label = String(sub.code || sub.name.slice(0, 5)).toUpperCase();
      pdf.text(label, cx + subColW / 2, y + 5.5, { align: 'center' });
      cx += subColW;
    });

    pdf.text('TOTAL', cx + totalColW / 2, y + 5.5, { align: 'center' });
    cx += totalColW;
    pdf.text('POS', cx + posColW / 2, y + 5.5, { align: 'center' });

    return y + h;
  };

  let curY = drawTableHeader(28);
  const rowH = 8;

  payload.students.forEach((student, idx) => {
    if (curY + rowH > pageH - 14) {
      pdf.addPage('a4', 'landscape');
      pageNum++;
      drawBroadsheetHeader(pageNum);
      curY = drawTableHeader(28);
    }

    if (idx % 2 === 1) {
      pdf.setFillColor(248, 250, 252);
      pdf.rect(margin, curY, usableW, rowH, 'F');
    }

    pdf.setDrawColor(203, 213, 225);
    pdf.setLineWidth(0.2);
    pdf.rect(margin, curY, usableW, rowH, 'S');

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.setTextColor(15, 23, 42);
    const fullName = `${student.firstName} ${student.lastName}`.toUpperCase();
    pdf.text(pdf.splitTextToSize(fullName, nameColW - 4)[0] || fullName, margin + 2.5, curY + 4.3);

    pdf.setFont('courier', 'normal');
    pdf.setFontSize(6.8);
    pdf.setTextColor(100, 116, 139);
    pdf.text(String(student.studentId || ''), margin + 2.5, curY + 7.1);

    let cx = margin + nameColW;
    pdf.setFont('courier', 'bold');
    pdf.setFontSize(8.5);

    subjects.forEach((sub) => {
      const res = payload.results.find((r) => r.studentId === student.studentId && r.subject === sub.name);
      if (res) {
        if (Number(res.totalScore) < 50) {
          pdf.setTextColor(225, 29, 72);
        } else {
          pdf.setTextColor(30, 41, 59);
        }
        pdf.text(String(res.totalScore), cx + subColW / 2, curY + 5.3, { align: 'center' });
      } else {
        pdf.setTextColor(148, 163, 184);
        pdf.text('-', cx + subColW / 2, curY + 5.3, { align: 'center' });
      }
      cx += subColW;
    });

    const stats = payload.rankings[student.studentId];
    pdf.setTextColor(30, 27, 75);
    pdf.text(String(stats?.total ?? 0), cx + totalColW / 2, curY + 5.3, { align: 'center' });
    cx += totalColW;

    pdf.setTextColor(15, 23, 42);
    pdf.text(String(stats?.position ?? '-'), cx + posColW / 2, curY + 5.3, { align: 'center' });

    curY += rowH;
  });

  pdf.save(`${filename}.pdf`);
}

/**
 * Exports an Overdue Fee Arrears Statement as a sharp vector A4 PDF.
 */
export async function exportFeeStatementVectorPDF(payload: VectorFeeStatementPayload, filename: string) {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  const { student, schoolName } = payload;
  const totalFees = Number(student.totalFees) || 0;
  const feesPaid = Number(student.feesPaid) || 0;
  const balance = Math.max(0, totalFees - feesPaid);

  pdf.setDrawColor(30, 27, 75);
  pdf.setLineWidth(0.7);
  pdf.rect(12, 12, 186, 273, 'S');

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(16);
  pdf.setTextColor(15, 23, 42);
  pdf.text(String(schoolName || 'ESEPA INTERNATIONAL SCHOOL').toUpperCase(), 105, 28, { align: 'center' });

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9);
  pdf.setTextColor(100, 116, 139);
  pdf.text('OFFICIAL FEE STATEMENT & ARREARS NOTICE', 105, 34, { align: 'center' });

  pdf.setDrawColor(203, 213, 225);
  pdf.setLineWidth(0.3);
  pdf.line(22, 40, 188, 40);

  // Student & Statement Metadata
  pdf.setFontSize(8);
  pdf.setTextColor(100, 116, 139);
  pdf.text('STUDENT DETAILS:', 22, 48);
  pdf.text('STATEMENT REFERENCE:', 188, 48, { align: 'right' });

  pdf.setFontSize(11);
  pdf.setTextColor(15, 23, 42);
  pdf.text(`${student.firstName} ${student.lastName}`.toUpperCase(), 22, 54);
  pdf.setFontSize(9);
  pdf.text(new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }), 188, 54, {
    align: 'right',
  });

  pdf.setFont('courier', 'bold');
  pdf.setFontSize(8.5);
  pdf.setTextColor(71, 85, 105);
  pdf.text(`ID: ${student.studentId}  |  CLASS: ${student.class}`, 22, 60);

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.setTextColor(100, 116, 139);
  pdf.text('PARENT / GUARDIAN:', 188, 62, { align: 'right' });
  pdf.setFontSize(9);
  pdf.setTextColor(15, 23, 42);
  pdf.text(String(student.guardianName || '---').toUpperCase(), 188, 67, { align: 'right' });
  pdf.setFont('courier', 'bold');
  pdf.setFontSize(8);
  pdf.setTextColor(79, 70, 229);
  pdf.text(String(student.guardianPhone || ''), 188, 72, { align: 'right' });

  pdf.line(22, 77, 188, 77);

  // Breakdown Box
  pdf.setFillColor(248, 250, 252);
  pdf.setDrawColor(203, 213, 225);
  pdf.roundedRect(22, 86, 166, 44, 2, 2, 'FD');

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9.5);
  pdf.setTextColor(71, 85, 105);
  pdf.text('Total Term Assessment Fee:', 30, 98);
  pdf.setFont('courier', 'bold');
  pdf.setTextColor(15, 23, 42);
  pdf.text(formatCurrency(totalFees), 180, 98, { align: 'right' });

  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(5, 150, 105);
  pdf.text('Total Payments Received:', 30, 108);
  pdf.setFont('courier', 'bold');
  pdf.text(`-${formatCurrency(feesPaid)}`, 180, 108, { align: 'right' });

  pdf.line(30, 114, 180, 114);

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(11);
  pdf.setTextColor(190, 18, 60);
  pdf.text('OUTSTANDING OVERDUE BALANCE:', 30, 123);
  pdf.setFont('courier', 'bold');
  pdf.setFontSize(13);
  pdf.text(formatCurrency(balance), 180, 123, { align: 'right' });

  // Notice Box
  pdf.setFillColor(255, 251, 235);
  pdf.setDrawColor(253, 230, 138);
  pdf.roundedRect(22, 138, 166, 26, 2, 2, 'FD');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.setTextColor(146, 64, 14);
  pdf.text('NOTICE TO PARENT / GUARDIAN:', 28, 145);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8.5);
  pdf.setTextColor(51, 65, 85);
  const noticeLines = pdf.splitTextToSize(
    `Please be informed that an overdue arrears balance of ${formatCurrency(balance)} remains outstanding on your ward's fee ledger. Kindly arrange to clear this balance promptly to maintain active academic standing.`,
    154
  );
  pdf.text(noticeLines, 28, 151.5);

  // Signatures
  pdf.setDrawColor(148, 163, 184);
  pdf.line(28, 195, 82, 195);
  pdf.line(128, 195, 182, 195);

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.setTextColor(100, 116, 139);
  pdf.text('ACCOUNTS OFFICE', 55, 200, { align: 'center' });
  pdf.text('AUTHORIZED TREASURY', 155, 200, { align: 'center' });

  pdf.save(`${filename}.pdf`);
}

/**
 * Resolves modern CSS color functions (oklch, oklab, color-mix) into standard RGB strings
 * using an offscreen 1x1 canvas so html2canvas never fails or drops colors.
 */
let colorCtx: CanvasRenderingContext2D | null = null;
function resolveCssColorToRgb(cssValue: string): string {
  if (!cssValue || (!cssValue.includes('oklch') && !cssValue.includes('oklab'))) {
    return cssValue;
  }
  try {
    if (!colorCtx && typeof document !== 'undefined') {
      const c = document.createElement('canvas');
      c.width = 1;
      c.height = 1;
      colorCtx = c.getContext('2d', { willReadFrequently: true });
    }
    if (!colorCtx) return '#0f172a';
    colorCtx.clearRect(0, 0, 1, 1);
    colorCtx.fillStyle = cssValue;
    colorCtx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = colorCtx.getImageData(0, 0, 1, 1).data;
    if (a === 0) return 'transparent';
    return `rgb(${r}, ${g}, ${b})`;
  } catch {
    return '#0f172a';
  }
}

function onCloneForPDF(clonedDoc: Document) {
  const allElements = clonedDoc.getElementsByTagName('*');
  const colorProps = [
    'color',
    'backgroundColor',
    'borderColor',
    'borderTopColor',
    'borderRightColor',
    'borderBottomColor',
    'borderLeftColor',
    'outlineColor',
    'fill',
    'stroke',
  ];

  for (let i = 0; i < allElements.length; i++) {
    const el = allElements[i] as HTMLElement;
    const computedStyle = window.getComputedStyle(el);

    colorProps.forEach((prop) => {
      const val = (el.style as any)[prop] || computedStyle[prop as any];
      if (val && (val.includes('oklch') || val.includes('oklab'))) {
        (el.style as any)[prop] = resolveCssColorToRgb(val);
      }
    });
  }
}

/**
 * High-DPI DOM-to-PDF exporter for generic receipts/modals outside ReportTerminal.
 */
export async function exportToPDF(elementId: string, filename: string) {
  const element = document.getElementById(elementId);
  if (!element) return;

  try {
    const { jsPDF } = await import('jspdf');
    const html2canvas = (await import('html2canvas')).default;

    const canvas = await html2canvas(element, {
      scale: 4,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      windowWidth: Math.max(window.innerWidth, 1024),
      onclone: (doc) => {
        onCloneForPDF(doc);
        const clonedTarget = doc.getElementById(elementId);
        if (clonedTarget) {
          clonedTarget.style.overflow = 'visible';
          clonedTarget.style.maxHeight = 'none';
          clonedTarget.style.height = 'auto';
        }
      },
    });

    const imgData = canvas.toDataURL('image/png', 1.0);
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
      compress: true,
    });

    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();
    const margin = 8;
    const availW = pdfWidth - margin * 2;
    const availH = pdfHeight - margin * 2;

    const imgRatio = canvas.height / canvas.width;
    let renderW = availW;
    let renderH = renderW * imgRatio;

    if (renderH > availH) {
      renderH = availH;
      renderW = renderH / imgRatio;
    }

    const offsetX = (pdfWidth - renderW) / 2;
    const offsetY = margin;

    pdf.addImage(imgData, 'PNG', offsetX, offsetY, renderW, renderH);
    pdf.save(`${filename}.pdf`);
  } catch (error) {
    console.error('Error generating PDF:', error);
    throw error;
  }
}

export async function exportBatchToPDF(elementIds: string[], filename: string) {
  try {
    const { jsPDF } = await import('jspdf');
    const html2canvas = (await import('html2canvas')).default;

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
      compress: true,
    });

    for (let i = 0; i < elementIds.length; i++) {
      const elementId = elementIds[i];
      const element = document.getElementById(elementId);
      if (!element) continue;

      if (i > 0) pdf.addPage();

      const canvas = await html2canvas(element, {
        scale: 4,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        windowWidth: 1024,
        onclone: (doc) => onCloneForPDF(doc),
      });

      const imgData = canvas.toDataURL('image/png', 1.0);
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgRatio = canvas.height / canvas.width;
      let renderW = pdfWidth;
      let renderH = renderW * imgRatio;
      if (renderH > pdfHeight) {
        renderH = pdfHeight;
        renderW = renderH / imgRatio;
      }
      const offsetX = (pdfWidth - renderW) / 2;

      pdf.addImage(imgData, 'PNG', offsetX, 0, renderW, renderH);
    }

    pdf.save(`${filename}.pdf`);
  } catch (error) {
    console.error('Error generating Batch PDF:', error);
    throw error;
  }
}
