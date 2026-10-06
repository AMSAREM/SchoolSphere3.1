import Dexie, { type Table } from 'dexie';
import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';

export interface School {
  id: string;
  name: string;
  slug: string;
  license_id?: number;
  email?: string;
  phone?: string;
  address?: string;
  logo_url?: string;
  theme?: string;
  academic_year?: string;
  current_term?: string;
  created_at: number;
  updated_at: number;
  status: 'active' | 'suspended' | 'expired';
}

export interface SchoolLicense {
  id?: number;
  license_key: string;
  school_name: string;
  expiry_date?: number | null;
  active_status: 'active' | 'suspended' | 'expired' | string;
  created_at: number;
  school_id?: string | null;
  tier?: 'Standard' | 'Professional' | 'Enterprise' | string;
  active_modules?: string[];
}

export interface ClassHistoryRecord {
  academicYear: string;
  term: string;
  class: string;
  totalFees?: number;
  feesPaid?: number;
  feeBreakdown?: Record<string, number>;
  feePaidBreakdown?: Record<string, number>;
  promotedAt: number;
}

export interface Student {
  id?: number;
  remoteId?: number | string;
  schoolId?: string;
  studentId: string;
  firstName: string;
  lastName: string;
  class: string;
  dateOfBirth: string;
  gender: 'Male' | 'Female';
  guardianName: string;
  guardianPhone: string;
  feesPaid: number;
  totalFees: number;
  house?: string;
  department?: string;
  photo?: string;
  createdAt: number;
  feeBreakdown?: Record<string, number>; // fee type to amount (e.g. tuition: 1000)
  feePaidBreakdown?: Record<string, number>; // fee type to paid amount (e.g. tuition: 400)
  classHistory?: ClassHistoryRecord[];
  previousClasses?: string[];
}

export interface FeeTypeConfig {
  id: string;
  label: string;
  defaultAmount: number;
}

export const FEE_TYPES: FeeTypeConfig[] = [
  { id: 'tuition', label: 'Tuition Fee', defaultAmount: 1000 },
  { id: 'admission', label: 'Admission Fee', defaultAmount: 200 },
  { id: 'ict', label: 'ICT & Lab Fee', defaultAmount: 150 },
  { id: 'library', label: 'Library Fee', defaultAmount: 50 },
  { id: 'pta', label: 'PTA Levy', defaultAmount: 100 },
  { id: 'exam', label: 'Examination Fee', defaultAmount: 120 },
  { id: 'sports', label: 'Sports & Games', defaultAmount: 80 },
  { id: 'canteen', label: 'Canteen / Dining', defaultAmount: 300 },
  { id: 'transportation', label: 'Transportation / Bus', defaultAmount: 250 },
  { id: 'utility', label: 'Utility & Maintenance', defaultAmount: 150 }
];

export interface FeeTransaction {
  id?: number;
  remoteId?: number | string;
  schoolId?: string;
  school_id?: string;
  receiptNumber: string;
  receipt_number?: string;
  studentId: string | number;
  student_id?: string | number;
  studentCode?: string;
  studentName?: string;
  className?: string;
  feeType: string;
  fee_type?: string;
  amount: number;
  paymentMethod: 'Cash' | 'Bank Transfer' | 'Mobile Money' | 'Cheque' | 'Card' | string;
  payment_method?: string;
  channelLabel?: string;
  paymentChannelLabel?: string;
  transactionReference?: string;
  transaction_reference?: string;
  receivedBy?: string;
  received_by?: string;
  notes?: string;
  recipientPhone?: string;
  guardianPhone?: string;
  guardianName?: string;
  academicYear?: string;
  term?: string;
  syncStatus?: 'synced' | 'pending';
  allocationBreakdown?: Record<string, number>;
  date: number;
  createdAt?: number;
}

export interface TermReport {
  id?: number;
  studentId: string;
  term: string;
  academicYear: string;
  attendancePresent: number;
  attendanceTotal: number;
  teacherRemark: string;
  headmasterRemark: string;
  position?: number;
  totalStudents?: number;
}

export interface Attendance {
  id?: number;
  studentId: string;
  date: string;
  status: 'Present' | 'Absent' | 'Late';
}

export interface ClassAssessmentItem {
  id: string;
  title: string;
  category: 'Exercise' | 'Homework' | 'Test';
  maxScore: number;
}

export interface Result {
  id?: number;
  studentId: string;
  subject: string;
  term: string;
  class: string;
  classScore: number; // 30% (summed & scaled from class exercises/work)
  examScore: number;  // 70%
  totalScore: number;
  grade: string;
  remarks: string;
  exerciseScores?: Record<string, number>;
  exerciseColumns?: ClassAssessmentItem[];
  rawCaScore?: number;
  rawCaMax?: number;
}

export interface Subject {
  id?: number;
  name: string;
  code: string;
  applicableClasses: string[]; // Empty can mean "All" or we can store "All"
}

export interface ClassInfo {
  id?: number;
  name: string;
  level: string;
}

export interface Teacher {
  id?: number;
  staffId: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  assignedClasses: string[];
  subjects: string[];
}

export interface AppSettings {
  id?: number;
  key: string;
  value: any;
}

export interface User {
  id?: number;
  schoolId?: string;
  school_id?: string;
  schoolName?: string;
  school_name?: string;
  auth_user_id?: string;
  username: string;
  passwordHash?: string;
  password_hash?: string;
  fullName: string;
  full_name?: string;
  email?: string;
  phone?: string;
  role: 'super_admin' | 'creator' | 'admin' | 'headteacher' | 'hod' | 'teacher' | 'accountant' | 'student' | 'parent';
  status?: 'active' | 'inactive' | 'suspended' | string;
  createdAt: number;
  created_at?: number;
  updated_at?: number;
  lastLogin?: number;
  last_login?: number;
}

export interface ExamAnalysisRecord {
  id?: number;
  schoolId?: string;
  studentId: string;
  studentName: string;
  examType: 'BECE' | 'WASSCE';
  year: number;
  indexNumber: string;
  schoolName?: string;
  subjects: Array<{
    subjectName: string;
    grade: string;      // A1, B2, B3, C4, C5, C6, D7, E8, F9 or 1,2,3,4,5,6,7,8,9
    score: number;      // 0-100
    isCore: boolean;
  }>;
  aggregate: number;    // e.g. Core 3 + Elective 3
  status: 'Excellent' | 'Qualified' | 'Conditional' | 'Failed'; 
  remarks: string;
  createdAt: number;
}

export interface SmsLog {
  id?: number;
  recipientName: string;
  recipientPhone: string;
  recipientType: 'Parent' | 'Teacher' | 'Student' | 'Other';
  message: string;
  type: 'Notification' | 'Fee Reminder' | 'Attendance Alert' | 'Exam Report' | 'Siren Emergency' | 'Custom';
  status: 'Sent' | 'Failed' | 'Delivered' | 'Pending';
  createdAt: number;
}

export interface Poll {
  id?: number;
  title: string;
  description: string;
  status: 'draft' | 'active' | 'completed';
  category: string; // e.g. SRC, Class Prefect, Club
  createdAt: number;
}

export interface Candidate {
  id?: number;
  pollId: number;
  name: string;
  position: string; // e.g. President, Secretary, Organizer, Treasurer
  class: string;
  votesCount: number;
  photo?: string;
  manifesto?: string;
}

export interface Vote {
  id?: number;
  pollId: number;
  studentId: string; // voter card ID
  position: string;
  candidateId: number;
  timestamp: number;
}

export interface PromotionRecord {
  id?: number;
  studentId: number; // reference to student table primary key
  studentIdentifier: string; // reference to student studentId (e.g. STU-001)
  studentName: string;
  sourceClass: string;
  destClass: string;
  academicYear: string;
  term: string;
  timestamp: number;
  // back-ups of state for complete audits and perfect reversibility
  previousFeesPaid: number;
  previousTotalFees: number;
  previousFeeBreakdown?: Record<string, number>;
  previousFeePaidBreakdown?: Record<string, number>;
}

export interface InventoryItem {
  id?: number;
  itemName: string;
  category: 'Stationery' | 'Textbooks' | 'Uniforms' | 'Furniture' | 'Sports Gear' | 'Lab Equipment' | 'General';
  quantity: number;
  minQuantity: number;
  unitPrice: number;
  location: string;
  supplierName?: string;
  supplierPhone?: string;
  lastUpdated: number;
}

export interface SchoolExpense {
  id?: number;
  description: string;
  category: 'Inventory Restock' | 'Utilities' | 'Maintenance' | 'Salaries' | 'Administrative' | 'Events' | 'Other';
  amount: number;
  date: number; // timestamp
  inventoryItemId?: number; // linked inventory item if category is 'Inventory Restock'
  quantityPurchased?: number; // if related to stock
  paymentMethod: 'Cash' | 'Bank Transfer' | 'Mobile Money' | 'Cheque';
  recordedBy: string;
}

export type LessonNoteStatus = 'Draft' | 'Pending Review' | 'Approved' | 'Needs Revision' | 'Rejected';

export interface LessonNote {
  id?: number;
  noteId: string;
  schoolId?: string;
  school_id?: string;
  teacherId?: string;
  teacherName: string;
  term: string;
  academicYear: string;
  weekNumber: number; // Week 1 - 14
  class: string;
  subject: string;
  lessonDate?: string;
  duration: string;
  classSize?: number;
  strand: string;
  subStrand?: string;
  contentStandard?: string;
  objectives?: string;
  tlms?: string;
  coreCompetencies?: string;
  starterActivity?: string;
  mainActivity?: string;
  plenaryActivity?: string;
  evaluation?: string;
  teacherRemarks?: string;
  pdfFileName?: string;
  pdfFileSize?: number;
  pdfFileUrl?: string;
  pdfStoragePath?: string;
  pdfData?: string;
  pdfUploadedAt?: number;
  status: LessonNoteStatus;
  submittedAt?: number;
  reviewedBy?: string;
  reviewerRole?: string;
  reviewerFeedback?: string;
  reviewedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface StaffSalaryProfileRecord {
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

export interface PayslipDBRecord {
  id: string;
  schoolId?: string;
  payrollMonth: string;
  periodLabel: string;
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
  ssnitEmployee: number;
  ssnitEmployer: number;
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

export interface SalaryAdvanceDBRecord {
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

export interface BoardingHouse {
  id: string;
  schoolId?: string;
  name: string;
  code: string;
  gender: 'Boys' | 'Girls' | 'Mixed';
  housemasterName: string;
  housemasterPhone: string;
  assistantName?: string;
  motto?: string;
  color?: string;
  capacity: number;
  createdAt: number;
  updatedAt: number;
}

export interface BoardingRoom {
  id: string;
  schoolId?: string;
  houseId: string;
  roomNumber: string;
  floor: string;
  capacity: number;
  gender: 'Boys' | 'Girls' | 'Mixed';
  prefectName?: string;
  createdAt: number;
  updatedAt: number;
}

export interface BoardingAllocation {
  id: string;
  schoolId?: string;
  studentId: string;
  studentName: string;
  className: string;
  gender: 'Male' | 'Female' | string;
  houseId: string;
  houseName: string;
  roomId: string;
  roomNumber: string;
  bedNumber: string;
  bedType: 'Single' | 'Bunk Top' | 'Bunk Bottom' | string;
  academicYear?: string;
  term?: string;
  status: 'active' | 'vacated' | 'transferred';
  assignedAt: number;
  notes?: string;
}

export interface BoardingExeat {
  id: string;
  schoolId?: string;
  studentId: string;
  studentName: string;
  className: string;
  houseId: string;
  houseName: string;
  passCode: string;
  exeatType: 'Day Exeat' | 'Weekend Exeat' | 'Medical / Clinic' | 'Special / Family' | 'Mid-Term Exeat' | string;
  reason: string;
  destination: string;
  parentConsent: boolean;
  parentName: string;
  parentPhone: string;
  departureDate: string;
  expectedReturnDate: string;
  status: 'pending' | 'approved' | 'rejected' | 'checked_out' | 'checked_in' | 'overdue';
  approvedBy?: string;
  approvedAt?: number;
  checkedOutAt?: number;
  checkedOutBy?: string;
  checkedInAt?: number;
  checkedInBy?: string;
  remarks?: string;
  createdAt: number;
  updatedAt: number;
}

export interface BoardingRollCallRecord {
  studentId: string;
  studentName: string;
  status: 'present' | 'absent' | 'exeat' | 'sick';
  remarks?: string;
}

export interface BoardingRollCall {
  id: string;
  schoolId?: string;
  houseId: string;
  houseName: string;
  rollDate: string;
  sessionType: 'morning' | 'evening' | 'lights_out' | string;
  conductedBy: string;
  records: BoardingRollCallRecord[];
  summary: {
    total: number;
    present: number;
    absent: number;
    exeat: number;
    sick: number;
  };
  notes?: string;
  createdAt: number;
}

export interface BoardingMedicalLog {
  id: string;
  schoolId?: string;
  studentId: string;
  studentName: string;
  className: string;
  houseId: string;
  houseName: string;
  visitDate: string;
  complaint: string;
  vitals?: string;
  treatmentGiven: string;
  attendingStaff: string;
  status: 'treated' | 'admitted_to_sickbay' | 'referred_to_hospital' | 'discharged';
  admittedAt?: number;
  dischargedAt?: number;
  createdAt: number;
}

export class SchoolDB extends Dexie {
  students!: Table<Student>;
  attendance!: Table<Attendance>;
  results!: Table<Result>;
  subjects!: Table<Subject>;
  classes!: Table<ClassInfo>;
  teachers!: Table<Teacher>;
  termReports!: Table<TermReport>;
  settings!: Table<AppSettings>;
  users!: Table<User>;
  examAnalysis!: Table<ExamAnalysisRecord>;
  smsLogs!: Table<SmsLog>;
  polls!: Table<Poll>;
  candidates!: Table<Candidate>;
  votes!: Table<Vote>;
  promotionHistory!: Table<PromotionRecord>;
  inventory!: Table<InventoryItem>;
  expenses!: Table<SchoolExpense>;
  lessonNotes!: Table<LessonNote>;
  feeTransactions!: Table<FeeTransaction>;
  salaryProfiles!: Table<StaffSalaryProfileRecord>;
  payslips!: Table<PayslipDBRecord>;
  salaryAdvances!: Table<SalaryAdvanceDBRecord>;
  boardingHouses!: Table<BoardingHouse>;
  boardingRooms!: Table<BoardingRoom>;
  boardingAllocations!: Table<BoardingAllocation>;
  boardingExeats!: Table<BoardingExeat>;
  boardingRollCalls!: Table<BoardingRollCall>;
  boardingMedicalLogs!: Table<BoardingMedicalLog>;

  constructor() {
    super('EsepaSchoolDB');
    this.version(7).stores({
      students: '++id, studentId, firstName, lastName, class, createdAt',
      attendance: '++id, [studentId+date], date',
      results: '++id, [studentId+subject+term], studentId, subject, class',
      subjects: '++id, name, code',
      classes: '++id, name',
      teachers: '++id, staffId, firstName, lastName',
      termReports: '++id, [studentId+term], studentId, term',
      settings: '++id, key',
      users: '++id, username, role'
    });
    this.version(8).stores({
      students: '++id, studentId, firstName, lastName, class, createdAt',
      attendance: '++id, [studentId+date], date',
      results: '++id, [studentId+subject+term], studentId, subject, class',
      subjects: '++id, name, code',
      classes: '++id, name',
      teachers: '++id, staffId, firstName, lastName',
      termReports: '++id, [studentId+term], studentId, term',
      settings: '++id, key',
      users: '++id, username, role',
      examAnalysis: '++id, studentId, examType, year, aggregate'
    });
    this.version(9).stores({
      students: '++id, studentId, firstName, lastName, class, createdAt',
      attendance: '++id, [studentId+date], date',
      results: '++id, [studentId+subject+term], studentId, subject, class',
      subjects: '++id, name, code',
      classes: '++id, name',
      teachers: '++id, staffId, firstName, lastName',
      termReports: '++id, [studentId+term], studentId, term',
      settings: '++id, key',
      users: '++id, username, role',
      examAnalysis: '++id, studentId, examType, year, aggregate',
      smsLogs: '++id, recipientPhone, type, status, createdAt'
    });
    this.version(10).stores({
      students: '++id, studentId, firstName, lastName, class, createdAt',
      attendance: '++id, [studentId+date], date',
      results: '++id, [studentId+subject+term], studentId, subject, class',
      subjects: '++id, name, code',
      classes: '++id, name',
      teachers: '++id, staffId, firstName, lastName',
      termReports: '++id, [studentId+term], studentId, term',
      settings: '++id, key',
      users: '++id, username, role',
      examAnalysis: '++id, studentId, examType, year, aggregate',
      smsLogs: '++id, recipientPhone, type, status, createdAt',
      polls: '++id, title, status, category, createdAt',
      candidates: '++id, pollId, name, position',
      votes: '++id, [pollId+studentId+position], pollId, studentId, candidateId, position'
    });
    this.version(11).stores({
      students: '++id, studentId, firstName, lastName, class, createdAt',
      attendance: '++id, [studentId+date], date',
      results: '++id, [studentId+subject+term], studentId, subject, class',
      subjects: '++id, name, code',
      classes: '++id, name',
      teachers: '++id, staffId, firstName, lastName',
      termReports: '++id, [studentId+term], studentId, term',
      settings: '++id, key',
      users: '++id, username, role',
      examAnalysis: '++id, studentId, examType, year, aggregate',
      smsLogs: '++id, recipientPhone, type, status, createdAt',
      polls: '++id, title, status, category, createdAt',
      candidates: '++id, pollId, name, position',
      votes: '++id, [pollId+studentId+position], pollId, studentId, candidateId, position',
      promotionHistory: '++id, studentId, sourceClass, destClass, academicYear, timestamp'
    });
    this.version(12).stores({
      students: '++id, studentId, firstName, lastName, class, createdAt',
      attendance: '++id, [studentId+date], date',
      results: '++id, [studentId+subject+term], studentId, subject, class',
      subjects: '++id, name, code',
      classes: '++id, name',
      teachers: '++id, staffId, firstName, lastName',
      termReports: '++id, [studentId+term], studentId, term',
      settings: '++id, key',
      users: '++id, username, role',
      examAnalysis: '++id, studentId, examType, year, aggregate',
      smsLogs: '++id, recipientPhone, type, status, createdAt',
      polls: '++id, title, status, category, createdAt',
      candidates: '++id, pollId, name, position',
      votes: '++id, [pollId+studentId+position], pollId, studentId, candidateId, position',
      promotionHistory: '++id, studentId, sourceClass, destClass, academicYear, timestamp',
      inventory: '++id, itemName, category, location'
    });
    this.version(13).stores({
      students: '++id, studentId, firstName, lastName, class, createdAt',
      attendance: '++id, [studentId+date], date',
      results: '++id, [studentId+subject+term], studentId, subject, class',
      subjects: '++id, name, code',
      classes: '++id, name',
      teachers: '++id, staffId, firstName, lastName',
      termReports: '++id, [studentId+term], studentId, term',
      settings: '++id, key',
      users: '++id, username, role',
      examAnalysis: '++id, studentId, examType, year, aggregate',
      smsLogs: '++id, recipientPhone, type, status, createdAt',
      polls: '++id, title, status, category, createdAt',
      candidates: '++id, pollId, name, position',
      votes: '++id, [pollId+studentId+position], pollId, studentId, candidateId, position',
      promotionHistory: '++id, studentId, sourceClass, destClass, academicYear, timestamp',
      inventory: '++id, itemName, category, location',
      expenses: '++id, category, date, inventoryItemId'
    });
    this.version(14).stores({
      students: '++id, studentId, firstName, lastName, class, createdAt',
      attendance: '++id, [studentId+date], date',
      results: '++id, [studentId+subject+term], studentId, subject, class',
      subjects: '++id, name, code',
      classes: '++id, name',
      teachers: '++id, staffId, firstName, lastName',
      termReports: '++id, [studentId+term], studentId, term',
      settings: '++id, key',
      users: '++id, username, role',
      examAnalysis: '++id, studentId, examType, year, aggregate',
      smsLogs: '++id, recipientPhone, type, status, createdAt',
      polls: '++id, title, status, category, createdAt',
      candidates: '++id, pollId, name, position',
      votes: '++id, [pollId+studentId+position], pollId, studentId, candidateId, position',
      promotionHistory: '++id, studentId, studentIdentifier, sourceClass, destClass, academicYear, timestamp',
      inventory: '++id, itemName, category, location',
      expenses: '++id, category, date, inventoryItemId'
    });
    this.version(15).stores({
      students: '++id, studentId, firstName, lastName, class, createdAt',
      attendance: '++id, [studentId+date], date',
      results: '++id, [studentId+subject+term], studentId, subject, class',
      subjects: '++id, name, code',
      classes: '++id, name',
      teachers: '++id, staffId, firstName, lastName',
      termReports: '++id, [studentId+term], studentId, term',
      settings: '++id, key',
      users: '++id, username, role',
      examAnalysis: '++id, studentId, examType, year, aggregate',
      smsLogs: '++id, recipientPhone, type, status, createdAt',
      polls: '++id, title, status, category, createdAt',
      candidates: '++id, pollId, name, position',
      votes: '++id, [pollId+studentId+position], pollId, studentId, candidateId, position',
      promotionHistory: '++id, studentId, studentIdentifier, sourceClass, destClass, academicYear, timestamp',
      inventory: '++id, itemName, category, location',
      expenses: '++id, category, date, inventoryItemId',
      lessonNotes: '++id, noteId, [class+subject+term+weekNumber], teacherName, status, term, weekNumber, updatedAt'
    });
    this.version(16).stores({
      students: '++id, studentId, firstName, lastName, class, createdAt',
      attendance: '++id, [studentId+date], date',
      results: '++id, [studentId+subject+term], studentId, subject, class',
      subjects: '++id, name, code',
      classes: '++id, name',
      teachers: '++id, staffId, firstName, lastName',
      termReports: '++id, [studentId+term], studentId, term',
      settings: '++id, key',
      users: '++id, username, role',
      examAnalysis: '++id, studentId, examType, year, aggregate',
      smsLogs: '++id, recipientPhone, type, status, createdAt',
      polls: '++id, title, status, category, createdAt',
      candidates: '++id, pollId, name, position',
      votes: '++id, [pollId+studentId+position], pollId, studentId, candidateId, position',
      promotionHistory: '++id, studentId, studentIdentifier, sourceClass, destClass, academicYear, timestamp',
      inventory: '++id, itemName, category, location',
      expenses: '++id, category, date, inventoryItemId',
      lessonNotes: '++id, noteId, [class+subject+term+weekNumber], teacherName, status, term, weekNumber, updatedAt',
      feeTransactions: '++id, receiptNumber, studentId, schoolId, feeType, paymentMethod, date'
    });
    this.version(17).stores({
      students: '++id, studentId, firstName, lastName, class, createdAt',
      attendance: '++id, [studentId+date], date',
      results: '++id, [studentId+subject+term], studentId, subject, class',
      subjects: '++id, name, code',
      classes: '++id, name',
      teachers: '++id, staffId, firstName, lastName',
      termReports: '++id, [studentId+term], studentId, term',
      settings: '++id, key',
      users: '++id, username, role',
      examAnalysis: '++id, studentId, examType, year, aggregate',
      smsLogs: '++id, recipientPhone, type, status, createdAt',
      polls: '++id, title, status, category, createdAt',
      candidates: '++id, pollId, name, position',
      votes: '++id, [pollId+studentId+position], pollId, studentId, candidateId, position',
      promotionHistory: '++id, studentId, studentIdentifier, sourceClass, destClass, academicYear, timestamp',
      inventory: '++id, itemName, category, location',
      expenses: '++id, category, date, inventoryItemId',
      lessonNotes: '++id, noteId, [class+subject+term+weekNumber], teacherName, status, term, weekNumber, updatedAt',
      feeTransactions: '++id, receiptNumber, studentId, schoolId, feeType, paymentMethod, date',
      salaryProfiles: 'id, schoolId, staffId, staffName, designation, updatedAt',
      payslips: 'id, schoolId, payrollMonth, [payrollMonth+staffId], staffId, status, receiptRef, updatedAt',
      salaryAdvances: 'id, schoolId, staffId, status, requestedAt'
    });
    this.version(18).stores({
      students: '++id, studentId, firstName, lastName, class, createdAt',
      attendance: '++id, [studentId+date], date',
      results: '++id, [studentId+subject+term], studentId, subject, class',
      subjects: '++id, name, code',
      classes: '++id, name',
      teachers: '++id, staffId, firstName, lastName',
      termReports: '++id, [studentId+term], studentId, term',
      settings: '++id, key',
      users: '++id, username, role',
      examAnalysis: '++id, studentId, examType, year, aggregate',
      smsLogs: '++id, recipientPhone, type, status, createdAt',
      polls: '++id, title, status, category, createdAt',
      candidates: '++id, pollId, name, position',
      votes: '++id, [pollId+studentId+position], pollId, studentId, candidateId, position',
      promotionHistory: '++id, studentId, studentIdentifier, sourceClass, destClass, academicYear, timestamp',
      inventory: '++id, itemName, category, location',
      expenses: '++id, category, date, inventoryItemId',
      lessonNotes: '++id, noteId, [class+subject+term+weekNumber], teacherName, status, term, weekNumber, updatedAt',
      feeTransactions: '++id, receiptNumber, studentId, schoolId, feeType, paymentMethod, date',
      salaryProfiles: 'id, schoolId, staffId, staffName, designation, updatedAt',
      payslips: 'id, schoolId, payrollMonth, [payrollMonth+staffId], staffId, status, receiptRef, updatedAt',
      salaryAdvances: 'id, schoolId, staffId, status, requestedAt',
      boardingHouses: 'id, schoolId, name, gender, housemasterName',
      boardingRooms: 'id, schoolId, houseId, roomNumber, floor',
      boardingAllocations: 'id, schoolId, studentId, houseId, roomId, status, assignedAt',
      boardingExeats: 'id, schoolId, studentId, houseId, passCode, status, departureDate, expectedReturnDate',
      boardingRollCalls: 'id, schoolId, houseId, rollDate, sessionType',
      boardingMedicalLogs: 'id, schoolId, studentId, houseId, visitDate, status'
    });
  }
}

export const db = new SchoolDB();

export function normalizeStudentRecord(s: any): Student & { [key: string]: any } {
  if (!s || typeof s !== 'object') return s;

  // Extract student ID with deep fallback
  const studentId = String(
    s.studentId || s.student_id || s['Student ID'] || s['student ID'] || s['StudentID'] || s['ID'] || s.id || ''
  ).trim();

  // Robust first name & last name extraction (handling Single "Name" or "Full Name" or "Student Name" columns as well)
  let firstName = String(
    s.firstName || s.first_name || s['First Name'] || s['first name'] || s['FirstName'] || s.given_name || ''
  ).trim();

  let lastName = String(
    s.lastName || s.last_name || s['Last Name'] || s['last name'] || s['LastName'] || s.surname || s.family_name || ''
  ).trim();

  const combinedName = String(
    s.name || s.fullName || s.full_name || s['Full Name'] || s['full name'] || s['Student Name'] || s['student name'] || s['Name'] || ''
  ).trim();

  if ((!firstName || firstName.toLowerCase() === 'unknown') && combinedName) {
    const parts = combinedName.split(/\s+/);
    if (parts.length > 1) {
      firstName = parts[0];
      if (!lastName) lastName = parts.slice(1).join(' ');
    } else {
      firstName = combinedName;
    }
  }

  // Fallback if firstName is still empty or 'Unknown' but lastName has a multi-word string
  if ((!firstName || firstName.toLowerCase() === 'unknown') && lastName && lastName.includes(' ')) {
    const parts = lastName.split(/\s+/);
    firstName = parts[0];
    lastName = parts.slice(1).join(' ');
  }

  // If still empty, use sensible fallback
  if (!firstName || firstName.toLowerCase() === 'unknown') {
    if (lastName) {
      firstName = lastName;
      lastName = '';
    } else if (combinedName) {
      firstName = combinedName;
    } else if (studentId) {
      firstName = `Student ${studentId}`;
    } else {
      firstName = 'Student';
    }
  }

  const className = String(
    s.class || s.className || s.class_name || s['Class'] || s['class'] || s['Grade'] || s['Form'] || 'P1'
  ).trim();

  const genderRaw = String(s.gender || s.Gender || s.sex || s.Sex || s['Gender'] || s['Sex'] || '').trim().toLowerCase();
  const gender = (genderRaw === 'female' || genderRaw === 'f') ? 'Female' : 'Male';

  let dateOfBirth = s.dateOfBirth || s.date_of_birth || s.dob || s.DOB || s['Date of Birth'] || s['dob'] || '2015-01-01';
  if (typeof dateOfBirth === 'string') {
    const trimmed = dateOfBirth.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      dateOfBirth = trimmed;
    } else {
      const d = new Date(trimmed);
      if (!isNaN(d.getTime())) dateOfBirth = d.toISOString().split('T')[0];
    }
  }

  const guardianName = String(
    s.guardianName || s.guardian_name || s.parentName || s.parent_name || s['Guardian Name'] || s['Parent Name'] || s['Guardian'] || s['Parent'] || ''
  ).trim();

  const guardianPhone = String(
    s.guardianPhone || s.guardian_phone || s.parentPhone || s.parent_phone || s.phone || s.contact || s['Guardian Phone'] || s['Parent Phone'] || s['Phone'] || ''
  ).trim();

  const house = String(s.house || s.House || s['House'] || '').trim();
  const department = String(s.department || s.Department || s['Department'] || '').trim();
  const photo = s.photo || null;
  const status = s.status || 'active';

  const rawFb = s.feeBreakdown || s.fee_breakdown || s['feeBreakdown'] || {};
  const rawFpb = s.feePaidBreakdown || s.fee_paid_breakdown || s['feePaidBreakdown'] || {};
  const feeBreakdown = typeof rawFb === 'string' ? JSON.parse(rawFb || '{}') : rawFb;
  const feePaidBreakdown = typeof rawFpb === 'string' ? JSON.parse(rawFpb || '{}') : rawFpb;

  const feesPaid = Number(s.feesPaid ?? s.fees_paid ?? s['Fees Paid'] ?? s['fees paid'] ?? s['Paid'] ?? 0) || 0;
  const totalFees = Number(s.totalFees ?? s.total_fees ?? s['Total Fees'] ?? s['total fees'] ?? s['Fee'] ?? s['Fees'] ?? 0) || 0;
  const createdAt = Number(s.createdAt ?? s.created_at ?? Date.now()) || Date.now();
  const schoolId = s.schoolId || s.school_id || s['school_id'] || '';

  return {
    ...s,
    id: s.id,
    studentId,
    student_id: studentId,
    firstName,
    first_name: firstName,
    lastName,
    last_name: lastName,
    class: className,
    gender,
    dateOfBirth,
    date_of_birth: dateOfBirth,
    guardianName,
    guardian_name: guardianName,
    guardianPhone,
    guardian_phone: guardianPhone,
    feesPaid,
    fees_paid: feesPaid,
    totalFees,
    total_fees: totalFees,
    house,
    department,
    photo,
    status,
    feeBreakdown,
    fee_breakdown: feeBreakdown,
    feePaidBreakdown,
    fee_paid_breakdown: feePaidBreakdown,
    createdAt,
    created_at: createdAt,
    schoolId,
    school_id: schoolId
  };
}

export function getStudentFullName(s: any): string {
  if (!s) return 'Unknown Student';
  const norm = normalizeStudentRecord(s);
  const full = `${norm.firstName} ${norm.lastName}`.trim();
  return full || norm.studentId || 'Student';
}

export async function autoRepairStudentsInDb(): Promise<number> {
  try {
    const rawList = await db.students.toArray();
    let repairedCount = 0;
    for (const raw of rawList) {
      const needsRepair = !raw.firstName || 
        raw.firstName.toLowerCase() === 'unknown' || 
        !raw.studentId || 
        (raw as any).first_name && !raw.firstName;
      
      if (needsRepair && raw.id) {
        const normalized = normalizeStudentRecord(raw);
        await db.students.update(raw.id, normalized);
        repairedCount++;
      }
    }
    return repairedCount;
  } catch (e) {
    console.warn("Notice in autoRepairStudentsInDb:", e);
    return 0;
  }
}

export function normalizeFeeTransactionRecord(raw: any): FeeTransaction {
  if (!raw || typeof raw !== 'object') return raw;
  const receiptNumber = String(
    raw.receiptNumber || raw.receipt_number || raw.ref || raw.transactionReference || raw.transaction_reference || `RCP-${Date.now().toString().slice(-6)}`
  ).trim();
  const studentId = String(raw.studentId || raw.student_id || '').trim();
  const schoolId = String(raw.schoolId || raw.school_id || '').trim();
  const feeType = String(raw.feeType || raw.fee_type || 'Automatic Allocation').trim();
  const amount = Math.max(0, Number(raw.amount ?? 0) || 0);

  const rawMethod = String(raw.paymentMethod || raw.payment_method || raw.method || 'Cash').trim();
  let paymentMethod: FeeTransaction['paymentMethod'] = 'Cash';
  const lowerMethod = rawMethod.toLowerCase();
  if (lowerMethod.includes('momo') || lowerMethod.includes('mobile') || lowerMethod.includes('mtn') || lowerMethod.includes('telecel') || lowerMethod.includes('at money')) {
    paymentMethod = 'Mobile Money';
  } else if (lowerMethod.includes('card') || lowerMethod.includes('paystack') || lowerMethod.includes('online')) {
    paymentMethod = 'Card';
  } else if (lowerMethod.includes('bank') || lowerMethod.includes('transfer')) {
    paymentMethod = 'Bank Transfer';
  } else if (lowerMethod.includes('cheque') || lowerMethod.includes('check')) {
    paymentMethod = 'Cheque';
  } else {
    paymentMethod = 'Cash';
  }

  let parsedNotesObj: any = null;
  const rawNotes = raw.notes;
  if (typeof rawNotes === 'string' && rawNotes.trim().startsWith('{')) {
    try {
      parsedNotesObj = JSON.parse(rawNotes);
    } catch {}
  } else if (rawNotes && typeof rawNotes === 'object') {
    parsedNotesObj = rawNotes;
  }

  const transactionReference = String(
    raw.transactionReference || raw.transaction_reference || parsedNotesObj?.transactionReference || receiptNumber
  ).trim();
  const receivedBy = String(raw.receivedBy || raw.received_by || parsedNotesObj?.receivedBy || 'Bursary Office').trim();
  const recipientPhone = String(raw.recipientPhone || raw.recipient_phone || raw.guardianPhone || parsedNotesObj?.phone || '').trim() || undefined;
  const channelLabel = String(raw.paymentChannelLabel || raw.channelLabel || parsedNotesObj?.channelLabel || rawMethod || paymentMethod).trim();
  const studentName = String(raw.studentName || raw.student_name || parsedNotesObj?.studentName || '').trim() || undefined;
  const studentCode = String(raw.studentCode || raw.student_code || parsedNotesObj?.studentCode || (String(studentId).startsWith('STU-') ? studentId : '')).trim() || undefined;
  const className = String(raw.className || raw.class_name || parsedNotesObj?.className || '').trim() || undefined;
  const academicYear = String(raw.academicYear || raw.academic_year || parsedNotesObj?.academicYear || '').trim() || undefined;
  const term = String(raw.term || parsedNotesObj?.term || '').trim() || undefined;
  const syncStatus: 'synced' | 'pending' = raw.syncStatus === 'pending' ? 'pending' : 'synced';
  const allocationBreakdown = raw.allocationBreakdown || parsedNotesObj?.allocationBreakdown || undefined;
  const notes = typeof rawNotes === 'string' ? rawNotes : (rawNotes ? JSON.stringify(rawNotes) : '');
  const date = Number(raw.date ?? raw.createdAt ?? raw.created_at ?? Date.now()) || Date.now();

  return {
    ...raw,
    id: typeof raw.id === 'number' ? raw.id : undefined,
    remoteId: raw.remoteId ?? raw.id,
    schoolId,
    school_id: schoolId,
    receiptNumber,
    receipt_number: receiptNumber,
    studentId,
    student_id: studentId,
    studentCode,
    studentName,
    className,
    feeType,
    fee_type: feeType,
    amount,
    paymentMethod,
    payment_method: paymentMethod,
    channelLabel,
    paymentChannelLabel: channelLabel,
    transactionReference,
    transaction_reference: transactionReference,
    receivedBy,
    received_by: receivedBy,
    notes,
    recipientPhone,
    guardianPhone: recipientPhone,
    academicYear,
    term,
    syncStatus,
    allocationBreakdown,
    date,
    createdAt: date
  };
}

export function useFeeTypes(): FeeTypeConfig[] {
  const fullSetting = useLiveQuery(() =>
    db.settings.where('key').equals('feeTypes').first()
  );
  const customSetting = useLiveQuery(() => 
    db.settings.where('key').equals('customFeeTypes').first()
  );
  const fullList: FeeTypeConfig[] | null = Array.isArray(fullSetting?.value) && fullSetting.value.length > 0 ? fullSetting.value : null;
  const customList: FeeTypeConfig[] = Array.isArray(customSetting?.value) ? customSetting.value : [];
  const serialized = JSON.stringify({ fullList, customList });
  return useMemo(() => {
    const base = fullList || FEE_TYPES;
    const seen = new Set(base.map(f => f.id));
    const extras = customList.filter(c => c && c.id && !seen.has(c.id));
    return [...base, ...extras];
  }, [serialized]);
}

// Helper to calculate grade based on Ghanaian WASSCE/BECE standard
export function calculateGrade(score: number): { grade: string, remarks: string } {
  if (score >= 80) return { grade: 'A', remarks: 'Excellent' };
  if (score >= 70) return { grade: 'B', remarks: 'Very Good' };
  if (score >= 60) return { grade: 'C', remarks: 'Good' };
  if (score >= 50) return { grade: 'D', remarks: 'Credit' };
  if (score >= 40) return { grade: 'E', remarks: 'Pass' };
  return { grade: 'F', remarks: 'Fail' };
}

/**
 * Completely clears all tenant-scoped local IndexedDB tables so a new or switched tenant starts on a clean slate.
 */
export async function clearTenantLocalDatabase(activeSchoolId?: string): Promise<void> {
  try {
    await Promise.all([
      db.students.clear(),
      db.classes.clear(),
      db.subjects.clear(),
      db.teachers.clear(),
      db.attendance.clear(),
      db.results.clear(),
      db.termReports.clear(),
      db.inventory.clear(),
      db.expenses.clear(),
      db.promotionHistory.clear(),
      db.polls.clear(),
      db.candidates.clear(),
      db.votes.clear(),
      db.lessonNotes.clear(),
      db.feeTransactions.clear(),
      db.smsLogs.clear()
    ]);

    await db.settings.where('key').anyOf(['timetable_slots', 'timetable_suggestions']).delete();

    const allUsers = await db.users.toArray();
    const userIdsToDelete: number[] = [];
    for (const u of allUsers) {
      const role = String(u.role || '').toLowerCase();
      const uSchoolId = (u as any).school_id || u.schoolId;
      if (role === 'creator' || role === 'super_admin' || (activeSchoolId && uSchoolId !== activeSchoolId)) {
        if (typeof u.id === 'number') userIdsToDelete.push(u.id);
      }
    }
    if (userIdsToDelete.length > 0) {
      await db.users.bulkDelete(userIdsToDelete);
    }
  } catch (e) {
    console.warn('Notice clearing tenant local database:', e);
  }
}

/**
 * Purges any legacy auto-seeded demo records (sample student STU-562185, unscoped default classes/subjects, sample timetable slots).
 */
export async function purgeDemoRecordsFromDb(activeSchoolId?: string): Promise<void> {
  try {
    // 1. Purge sample student STU-562185 and unscoped/foreign student records
    const allStudents = await db.students.toArray();
    const stuIdsToDelete: number[] = [];
    for (const s of allStudents) {
      const sid = String(s.studentId || (s as any).student_id || '').trim();
      const sSchoolId = (s as any).school_id || s.schoolId;
      const isDemoStudent =
        sid === 'STU-562185' ||
        (String(s.firstName || '').toLowerCase() === 'emmanuel' &&
          String(s.lastName || '').toLowerCase() === 'amoako' &&
          String(s.guardianName || '').toLowerCase() === 'john amoako');
      const isUnscopedOrForeign = !sSchoolId || (Boolean(activeSchoolId) && sSchoolId !== activeSchoolId);
      if ((isDemoStudent || isUnscopedOrForeign) && typeof s.id === 'number') {
        stuIdsToDelete.push(s.id);
      }
    }
    if (stuIdsToDelete.length > 0) {
      await db.students.bulkDelete(stuIdsToDelete);
    }

    // 2. Purge unscoped legacy seeded classes
    const allClasses = await db.classes.toArray();
    const classIdsToDelete = allClasses
      .filter(c => {
        const cSchoolId = (c as any).school_id || (c as any).schoolId;
        return !cSchoolId || (Boolean(activeSchoolId) && cSchoolId !== activeSchoolId);
      })
      .map(c => c.id)
      .filter((id): id is number => typeof id === 'number');
    if (classIdsToDelete.length > 0) {
      await db.classes.bulkDelete(classIdsToDelete);
    }

    // 3. Purge unscoped legacy seeded subjects
    const allSubjects = await db.subjects.toArray();
    const subjectIdsToDelete = allSubjects
      .filter(sub => {
        const sSchoolId = (sub as any).school_id || (sub as any).schoolId;
        return !sSchoolId || (Boolean(activeSchoolId) && sSchoolId !== activeSchoolId);
      })
      .map(sub => sub.id)
      .filter((id): id is number => typeof id === 'number');
    if (subjectIdsToDelete.length > 0) {
      await db.subjects.bulkDelete(subjectIdsToDelete);
    }

    // 4. Purge sample timetable entries (id starting with 'sample-')
    const ttSetting = await db.settings.where('key').equals('timetable_slots').first();
    if (ttSetting && Array.isArray(ttSetting.value)) {
      const cleanedSlots = ttSetting.value.filter(
        (slot: any) => !String(slot?.id || '').startsWith('sample-')
      );
      if (cleanedSlots.length !== ttSetting.value.length) {
        if (cleanedSlots.length === 0 && ttSetting.id) {
          await db.settings.delete(ttSetting.id);
        } else if (ttSetting.id) {
          await db.settings.update(ttSetting.id, { value: cleanedSlots });
        }
      }
    }

    // 5. Purge creator/super_admin profiles from local users cache
    const allUsers = await db.users.toArray();
    const userIdsToDelete = allUsers
      .filter(u => {
        const role = String(u.role || '').toLowerCase();
        const uSchoolId = (u as any).school_id || u.schoolId;
        return role === 'creator' || role === 'super_admin' || (Boolean(activeSchoolId) && uSchoolId !== activeSchoolId);
      })
      .map(u => u.id)
      .filter((id): id is number => typeof id === 'number');
    if (userIdsToDelete.length > 0) {
      await db.users.bulkDelete(userIdsToDelete);
    }
  } catch (e) {
    console.warn('Notice purging demo records:', e);
  }
}

