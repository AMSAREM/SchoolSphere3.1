import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Presentation,
  Sparkles,
  Calculator,
  FileText,
  CheckCircle2,
  TrendingUp,
  DollarSign,
  Printer,
  Copy,
  Check,
  Mail,
  Phone,
  Shield,
  Zap,
  Clock,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  Users,
  Award,
  HelpCircle,
  Trash2,
  MessageSquare,
  Building,
  Layers,
  ArrowRight,
  Target,
  FileCheck,
  RefreshCw,
  FolderOpen,
  Save,
  Send,
  Eye,
  Settings,
  Calendar,
  GraduationCap,
  Bell,
  Vote,
  Package,
  Wallet,
  Bed,
  CheckSquare,
  BookOpen,
  BarChart3,
  Paperclip,
  UploadCloud,
  Download,
  Database,
  FileUp,
  FileSpreadsheet,
  ExternalLink,
  X,
  FileCode,
  HardDrive
} from 'lucide-react';
import { cn, formatCurrency, exportToPDF, triggerPrint } from '../../lib/utils';
import { useNotifications } from '../../contexts/NotificationContext';
import type { ProposalItem, ProposalFile } from '../../types';
import { proposalsApi } from '../../lib/api';

export interface PitchProposalStudioProps {
  onNavigateCreatorPanel?: (panelId: string) => void;
  availableModules?: Array<{ id: string; label: string; description: string }>;
  initialSchoolName?: string;
  initialContactPerson?: string;
  initialPhone?: string;
  initialEmail?: string;
}

const DEFAULT_MODULES = [
  { id: 'students', label: 'Students Records', desc: 'Secure student profiles, biodata & parent linkage', price: 150 },
  { id: 'academic', label: 'Academics Portal', desc: 'Class streams, subject allocations & curriculum setups', price: 150 },
  { id: 'timetable', label: 'School Timetable', desc: 'Automated conflict-free period schedule generation', price: 180 },
  { id: 'attendance', label: 'Attendance Terminal', desc: 'Daily roll call, late coming alerts & monthly logs', price: 200 },
  { id: 'results', label: 'Results Terminal', desc: 'Continuous marks input, 30/70 SBA & grade registries', price: 250 },
  { id: 'exam_analysis', label: 'Exam Analysis', desc: 'Subject broadsheets, rank order & pass-rate telemetry', price: 200 },
  { id: 'reports', label: 'Report Sheets Terminal', desc: 'One-click printable & digital terminal report cards', price: 300 },
  { id: 'fees', label: 'Fees & MoMo Ledger', desc: 'Tuition invoicing, instant Mobile Money & tamper receipts', price: 350 },
  { id: 'boarding', label: 'Boarding & Dormitories', desc: 'Hostel room allocations, house masters & exeat permits', price: 220 },
  { id: 'duty_roster', label: 'Staff Duty Roster', desc: 'Teacher weekly supervision rotas & campus activity oversight', price: 180 },
  { id: 'lesson_notes', label: 'Lesson Notes & Vetting', desc: 'Digital lesson plan submissions, HOD feedback & approvals', price: 190 },
  { id: 'payroll', label: 'Payroll & Compensation', desc: 'Staff salary schedules, allowances, deductions & payslips', price: 240 },
  { id: 'siren', label: 'Siren & Bell Console', desc: 'Automated period bells & emergency campus alarms', price: 120 },
  { id: 'evoting', label: 'E-Voting Portal', desc: 'Paperless, auditable Student Council (SRC) elections', price: 150 },
  { id: 'inventory', label: 'Inventory Registry', desc: 'Textbooks, science lab supplies & asset tracking', price: 180 },
  { id: 'users', label: 'User Roles & Access Control', desc: 'Granular permissions, multi-role security & user directory', price: 160 },
  { id: 'settings', label: 'School Settings & Branding', desc: 'Institutional crest, grading systems, terms & audit trails', price: 140 }
];

const ADD_ON_SERVICES = [
  { id: 'branding', label: 'Custom Subdomain & School Crest Integration', price: 350, desc: 'e.g. portal.yourschool.edu with school colors & logo' },
  { id: 'training', label: 'On-Site Staff Training Workshop (2 Sessions)', price: 600, desc: 'Interactive hands-on training for all teaching & bursary staff' },
  { id: 'migration', label: 'Legacy Data Migration (Excel / Paper Folders)', price: 450, desc: 'Complete historical student & marks data onboarding by engineers' },
  { id: 'sms_bundle', label: 'Institutional Bulk SMS Pack (2,500 Credits)', price: 300, desc: 'Direct parent notification tokens for instant SMS broadcasting' },
  { id: 'vip_support', label: 'Dedicated VIP Support & Emergency Hotline SLA', price: 500, desc: 'Direct WhatsApp engineering hotline with <15min response time' }
];

export default function PitchProposalStudio({
  onNavigateCreatorPanel,
  initialSchoolName = '',
  initialContactPerson = '',
  initialPhone = '',
  initialEmail = ''
}: PitchProposalStudioProps) {
  const { showToast } = useNotifications();

  // Studio Sub-Tabs
  const [activeTab, setActiveTab] = useState<'pitch_deck' | 'architect' | 'document' | 'roi' | 'objections' | 'library'>('pitch_deck');

  // Proposal Configuration State
  const [schoolName, setSchoolName] = useState(initialSchoolName || 'Achimota Heritage Academy');
  const [contactPerson, setContactPerson] = useState(initialContactPerson || 'Dr. Peter Osei (Proprietor & Board Chair)');
  const [contactPhone, setContactPhone] = useState(initialPhone || '+233 55 423 4590');
  const [contactEmail, setContactEmail] = useState(initialEmail || 'board@heritageacademy.edu.gh');
  const [location, setLocation] = useState('Achimota, Greater Accra Region');
  const [studentsCount, setStudentsCount] = useState(450);
  const [tier, setTier] = useState('Standard');
  const [currency, setCurrency] = useState<'GHS' | 'USD' | 'NGN' | 'GBP'>('GHS');
  const [billingFrequency, setBillingFrequency] = useState<'term' | 'annual' | 'biennial'>('annual');
  const [selectedModules, setSelectedModules] = useState<string[]>(DEFAULT_MODULES.map(m => m.id));
  const [selectedAddOns, setSelectedAddOns] = useState<string[]>(['branding', 'training', 'sms_bundle']);
  const [discountPercent, setDiscountPercent] = useState(10);
  const [proposalNotes, setProposalNotes] = useState('Includes dedicated onboarding and termly system updates. Valid for 30 days from presentation.');
  const [proposalRef, setProposalRef] = useState(() => `PROP-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`);

  // Adjustable Module Prices State
  const [modulePrices, setModulePrices] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    DEFAULT_MODULES.forEach(m => { initial[m.id] = m.price; });
    return initial;
  });

  const getModulePrice = (modId: string) => {
    return typeof modulePrices[modId] === 'number' ? modulePrices[modId] : (DEFAULT_MODULES.find(m => m.id === modId)?.price || 0);
  };

  const updateModulePrice = (modId: string, price: number) => {
    setModulePrices(prev => ({
      ...prev,
      [modId]: Math.max(0, price)
    }));
  };

  const resetModulePrices = () => {
    const initial: Record<string, number> = {};
    DEFAULT_MODULES.forEach(m => { initial[m.id] = m.price; });
    setModulePrices(initial);
    showToast('Module prices reset to catalogue defaults.', 'info');
  };

  const applyBulkPriceMultiplier = (multiplier: number) => {
    setModulePrices(prev => {
      const updated: Record<string, number> = {};
      DEFAULT_MODULES.forEach(m => {
        const current = typeof prev[m.id] === 'number' ? prev[m.id] : m.price;
        updated[m.id] = Math.round(current * multiplier);
      });
      return updated;
    });
    showToast(`Adjusted all module prices by ${multiplier > 1 ? '+' : ''}${Math.round((multiplier - 1) * 100)}%.`, 'info');
  };

  // Saved proposals
  const [savedProposals, setSavedProposals] = useState<ProposalItem[]>(() => {
    try {
      const stored = localStorage.getItem('esepa_creator_proposals_v1');
      if (stored) return JSON.parse(stored);
    } catch {}
    return [
      {
        id: 'prop-sample-1',
        schoolName: 'Achimota Heritage Academy',
        contactPerson: 'Dr. Peter Osei (Headmaster)',
        phone: '+233 55 423 4590',
        email: 'head@heritageacademy.edu.gh',
        location: 'Achimota, Accra',
        studentsCount: 450,
        tier: 'Standard',
        currency: 'GHS',
        selectedModules: DEFAULT_MODULES.map(m => m.id),
        addOns: ['branding', 'training'],
        discountPercent: 10,
        billingFrequency: 'annual',
        status: 'Presented',
        createdAt: new Date().toLocaleDateString(),
        totalPerTerm: 2850,
        totalAnnual: 7695,
        notes: 'Requested live demo on Saturday PTA board meeting.'
      },
      {
        id: 'prop-sample-2',
        schoolName: 'Morning Star Model College',
        contactPerson: 'Mrs. Abigail Mensah',
        phone: '+233 24 112 3456',
        email: 'admin@morningstar.edu.gh',
        location: 'Kumasi, Ashanti',
        studentsCount: 680,
        tier: 'Professional',
        currency: 'GHS',
        selectedModules: DEFAULT_MODULES.map(m => m.id),
        addOns: ['branding', 'training', 'migration', 'vip_support'],
        discountPercent: 15,
        billingFrequency: 'annual',
        status: 'Pitch Scheduled',
        createdAt: new Date().toLocaleDateString(),
        totalPerTerm: 3900,
        totalAnnual: 9945,
        notes: 'Heavy focus on stopping fee arrears with Mobile Money integration.'
      }
    ];
  });

  useEffect(() => {
    try {
      localStorage.setItem('esepa_creator_proposals_v1', JSON.stringify(savedProposals));
    } catch {}
  }, [savedProposals]);

  // Pitch Deck Presentation State
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showPresenterNotes, setShowPresenterNotes] = useState(true);
  const [presentationTimer, setPresentationTimer] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const deckRef = useRef<HTMLDivElement>(null);

  // Timer interval
  useEffect(() => {
    let interval: any;
    if (isTimerRunning) {
      interval = setInterval(() => setPresentationTimer(t => t + 1), 1000);
    }
    return () => clearInterval(interval);
  }, [isTimerRunning]);

  const formatTimer = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const s = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Pricing Math
  const currencySymbol = currency === 'GHS' ? 'GH₵' : currency === 'USD' ? '$' : currency === 'NGN' ? '₦' : '£';

  const pricingCalculation = useMemo(() => {
    // Base tier per term
    const tierBase = tier === 'Basic' ? 1200 : tier === 'Standard' ? 1900 : tier === 'Professional' ? 2800 : 3800;
    
    // Per-student scaling factor (nominal overhead)
    const studentScale = Math.max(0, (studentsCount - 200) * 1.5);

    // Modules cost (using adjustable module rates)
    const modulesCost = selectedModules.reduce((acc, modId) => {
      return acc + getModulePrice(modId);
    }, 0);

    // Addons cost (one-time setup / annual bundle)
    const addOnsCost = selectedAddOns.reduce((acc, addId) => {
      const a = ADD_ON_SERVICES.find(x => x.id === addId);
      return acc + (a?.price || 0);
    }, 0);

    const termlyGross = tierBase + (modulesCost * 0.4) + (studentScale * 0.3);
    const annualGross = (termlyGross * 3) + addOnsCost;

    // Discount
    const discountFactor = (100 - discountPercent) / 100;
    const frequencyMultiplier = billingFrequency === 'annual' ? 0.9 : billingFrequency === 'biennial' ? 0.8 : 1.0;

    const finalTermly = Math.round(termlyGross * discountFactor);
    const finalAnnual = Math.round(annualGross * discountFactor * frequencyMultiplier);
    const perStudentPerTerm = (finalTermly / Math.max(1, studentsCount)).toFixed(2);
    const perStudentPerDay = (finalTermly / (Math.max(1, studentsCount) * 90)).toFixed(2);

    return {
      tierBase,
      modulesCost,
      addOnsCost,
      termlyGross: Math.round(termlyGross),
      annualGross: Math.round(annualGross),
      finalTermly,
      finalAnnual,
      perStudentPerTerm,
      perStudentPerDay
    };
  }, [tier, studentsCount, selectedModules, modulePrices, selectedAddOns, discountPercent, billingFrequency]);

  // Client ROI Calculator State
  const [currentPaperReamsCost, setCurrentPaperReamsCost] = useState(2400); // 24 boxes @ 100
  const [currentTonerCost, setCurrentTonerCost] = useState(1800); // printer toners
  const [currentReportPrintingFee, setCurrentReportPrintingFee] = useState(3500); // commercial print shop
  const [uncollectedArrearsPerTerm, setUncollectedArrearsPerTerm] = useState(25000); // typical 25k in unpaid fees
  const [staffHoursManualGrading, setStaffHoursManualGrading] = useState(120);

  const roiMetrics = useMemo(() => {
    const paperAndPrintSaved = currentPaperReamsCost + currentTonerCost + currentReportPrintingFee;
    // Conservative 22% recovery of uncollected school fees via automated MoMo & SMS debt tracking
    const recoveredTuition = Math.round(uncollectedArrearsPerTerm * 0.22);
    // Value of 120 teacher hours @ GH₵25/hr
    const staffHoursValue = staffHoursManualGrading * 25;

    const termlyEconomicBenefit = paperAndPrintSaved + recoveredTuition + staffHoursValue;
    const annualEconomicBenefit = termlyEconomicBenefit * 3;
    const netAnnualSurplus = annualEconomicBenefit - pricingCalculation.finalAnnual;
    const roiPercentage = Math.round((netAnnualSurplus / Math.max(1, pricingCalculation.finalAnnual)) * 100);
    // Payback period in days (out of a 90-day school term)
    const paybackDays = Math.max(7, Math.round((pricingCalculation.finalTermly / Math.max(1, termlyEconomicBenefit)) * 90));

    return {
      paperAndPrintSaved,
      recoveredTuition,
      staffHoursValue,
      termlyEconomicBenefit,
      annualEconomicBenefit,
      netAnnualSurplus,
      roiPercentage,
      paybackDays
    };
  }, [currentPaperReamsCost, currentTonerCost, currentReportPrintingFee, uncollectedArrearsPerTerm, staffHoursManualGrading, pricingCalculation]);

  // 25 Comprehensive Strategic Pitch Slides covering All 17 Modules
  const PITCH_SLIDES = [
    {
      number: '01',
      tag: 'THE EXECUTIVE CRISIS',
      title: 'The Hidden Financial & Administrative Drain in Traditional Schools',
      headline: 'Schools lose ₵20,000–₵60,000 every single term to paperwork, delays, and uncollected tuition.',
      points: [
        'Massive Fee Arrears: Up to 30% of tuition remains uncollected because parents lack instant, easy digital payment receipts.',
        'Grading Exhaustion: Teachers spend 2 to 3 weeks manually computing broadsheets and writing report booklets by hand.',
        'Communication Breakdown: Emergency announcements and attendance alerts get buried in disorganized WhatsApp groups.',
        'Data Vulnerability: Paper ledgers and disparate Excel sheets easily get lost, corrupted, or tampered with.'
      ],
      statistic: '35% Average Fee Arrears Recovered',
      statisticSub: 'When schools switch to automated digital reminders with instant Mobile Money receipts.',
      speakerNotes: {
        ask: 'Open by asking the Proprietor: "Sir/Madam, how many days after the exams finish do parents actually receive their children\'s printed terminal reports?"',
        metric: 'Most reply 2–3 weeks. Show them SchoolSphere computes every student score, position, and PDF report card in under 60 seconds.',
        objection: 'If they say "Our teachers already use Excel", explain Excel creates conflicting versions and cannot dispatch automated SMS to parents.'
      }
    },
    {
      number: '02',
      tag: 'THE SOLUTION ARCHITECTURE',
      title: 'SchoolSphere: The Unified Institutional Operating System',
      headline: 'Everything your school needs in one fast, offline-resilient, bank-grade cloud platform.',
      points: [
        'Unified Database: One place for Biodata, Academics, Finance, Attendance, Broadsheets, and Staff Duty.',
        'Zero-Latency Performance: Instant search and filtering across thousands of student records without lag.',
        'Multi-Role Isolation: Strict roles for Headmaster, Accountant, Teacher, HOD, Student, and Parent.',
        'Local-First Reliability: Operates without internet interruptions; automatically syncs to cloud when connected.'
      ],
      statistic: '100% Comprehensive Coverage',
      statisticSub: 'Replaces 6 separate point solutions with a single cohesive institutional workspace.',
      speakerNotes: {
        ask: '"How many different systems or paper books does your accountant and headteacher manage simultaneously?"',
        metric: 'SchoolSphere merges finance, continuous assessment, attendance, and parent communication into one interface.',
        objection: 'If they worry about system complexity, emphasize that every interface is tailored for standard smartphones and computers.'
      }
    },
    {
      number: '03',
      tag: 'MASTER MODULES ECOSYSTEM',
      isOverviewHub: true,
      title: 'Complete Suite of 17 Modular Functional Systems',
      headline: 'A fully integrated ecosystem covering every academic, financial, operational, and governance requirement.',
      points: [
        'Academic Core: Students Records, Academics Portal, Timetables, Daily Attendance, Continuous SBA Results, Exam Analysis & Automated Reports.',
        'Finance & Operations: Tuition Billing, Mobile Money (MTN/Telecel/AT), Tamper Receipts, Arrears Ledgers, Staff Payroll & Inventory Assets.',
        'Campus & Facilities: Boarding/Hostel Dorms, Exeat Gate Passes, Automated Campus Siren & Bell Console.',
        'Governance & Staff: Teacher Supervision Duty Rosters, Digital Lesson Notes Vetting, SRC E-Voting, Multi-Role RBAC & Institutional Branding.'
      ],
      statistic: '17 Integrated Modules',
      statisticSub: 'Selectively authorize modules per department or deploy the full institutional suite.',
      speakerNotes: {
        ask: '"Which specific area of your school currently requires the most manual supervision from your office?"',
        metric: 'All 17 modules share the same unified student and staff database with zero double-entry of data.',
        objection: 'Explain that the school does not have to turn on every module on Day 1; modules can be enabled progressively.'
      }
    },
    {
      number: '04',
      tag: 'MODULE 01: STUDENTS RECORDS',
      moduleKey: 'students',
      persona: 'For Headteachers, Registrars & Class Teachers',
      title: 'Student Biodata, Family Linkage & Enrollment Directory',
      headline: 'A secure, single source of truth for every student profile, medical contact, and academic history.',
      points: [
        'Complete Biodata Registry: Emergency phone numbers, parent links, medical notes, blood group, and class stream assignments.',
        'Rapid Search & Class Filters: Instant lookups across hundreds of students in milliseconds by name, ID, or house.',
        'One-Click Excel Roster Ingestion: Import an entire school roster of 1,000+ students from Excel in under 60 seconds.',
        'Automatic Student ID Cards: Digital student ID generator with customizable institutional branding.'
      ],
      statistic: '60-Second Roster Ingestion',
      statisticSub: 'Seamless bulk Excel upload eliminates manual typing of existing student records.',
      speakerNotes: {
        ask: '"How quickly can your office locate a student\'s emergency contact when an incident occurs on the playground?"',
        metric: 'Demonstrate typing a student name in the search bar: profile and guardian numbers load in under 200ms.',
        objection: 'Address data entry fears: "Our engineers perform the initial Excel upload for you on Day 1."'
      }
    },
    {
      number: '05',
      tag: 'MODULE 02: ACADEMICS PORTAL',
      moduleKey: 'academic',
      persona: 'For Academic Directors & Heads of Department',
      title: 'Curriculum Management, Class Streams & Subject Allocation',
      headline: 'Effortlessly organize academic tracks, class streams, and teacher subject assignments.',
      points: [
        'Class Streams Architecture: Configure Creche, Primary, JHS, and SHS tracks with custom arm divisions (A, B, C / Gold, Emerald).',
        'Subject Allocation Matrix: Assign specific teachers to specific subjects and classes with zero scheduling overlaps.',
        'Term & Academic Calendar Engine: Set term start/end dates, working days, and public holiday exclusions.',
        'Departmental Groupings: Organize faculty by departments (Sciences, Languages, Humanities, Business, Vocational).'
      ],
      statistic: '100% Curriculum Flexibility',
      statisticSub: 'Pre-loaded with GES, NaCCA, Cambridge, and WASSCE subject templates ready to activate.',
      speakerNotes: {
        ask: '"How do you track which teacher is assigned to which subject and class across all grade levels?"',
        metric: 'Eliminates confusion during term transitions; promoting students to the next class takes a single click.',
        objection: 'Any school curriculum structure (British, American, National) is 100% customizable.'
      }
    },
    {
      number: '06',
      tag: 'MODULE 03: SCHOOL TIMETABLE',
      moduleKey: 'timetable',
      persona: 'For Master Planners & Deputy Headteachers',
      title: 'Conflict-Free Master Timetable & Period Planning',
      headline: 'Generate master period schedules and personal teacher timetables without conflicting room or staff clashes.',
      points: [
        'Automated Conflict Prevention: System automatically flags whenever a teacher is double-booked across different rooms.',
        'Custom Period Durations: Configure standard 40-minute periods, double laboratory periods, and snack/lunch breaks.',
        'Individual Teacher Timetables: Every faculty member receives their own personalized weekly schedule directly on their phone.',
        'Master Broadsheet Print View: Print high-resolution A3/A4 master wall timetables for the staff room notice board.'
      ],
      statistic: 'Zero Scheduling Clashes',
      statisticSub: 'Instant conflict detection cuts timetable drafting time from 2 weeks down to an afternoon.',
      speakerNotes: {
        ask: '"How many teacher double-booking disputes or timetable clashes do you resolve in the first week of term?"',
        metric: 'Shows automated timetable matrix where period allocations highlight green for valid and red for conflict.',
        objection: 'Handles complex shared teachers who teach across both Junior and Senior high divisions.'
      }
    },
    {
      number: '07',
      tag: 'MODULE 04: DAILY ATTENDANCE',
      moduleKey: 'attendance',
      persona: 'For Class Teachers & Security Gate Masters',
      title: 'Rapid Roll Call Terminal & Automated Parent Absence Alerts',
      headline: 'Take full class attendance in under 30 seconds with immediate real-time truancy tracking.',
      points: [
        '30-Second Roll Call: High-speed tap interface marking Present, Absent, Late, or Excused with single clicks.',
        'Automated Absence SMS: Parents receive an immediate text message when their child is not registered in morning roll call.',
        'Termly Percentage Telemetry: Automatic computation of student attendance percentage for terminal report cards.',
        'Lateness & Truancy Logs: Track chronic latecomers and unexcused absences to improve campus discipline.'
      ],
      statistic: '30-Second Class Roll Call',
      statisticSub: 'Frees teachers from traditional paper register books while giving parents immediate peace of mind.',
      speakerNotes: {
        ask: '"If a student fails to arrive at school in the morning, at what time do the parents find out?"',
        metric: 'Show the Attendance Terminal tap interface. Explain the instant SMS broadcast to parent phone numbers.',
        objection: 'Works completely offline; teachers take attendance even if cellular network in the classroom is dead.'
      }
    },
    {
      number: '08',
      tag: 'MODULE 05: RESULTS TERMINAL',
      moduleKey: 'results',
      persona: 'For Subject Teachers & Form Tutors',
      title: 'Continuous Assessment (SBA) & Instant Marks Registry',
      headline: 'Enter continuous assessment and exam marks smoothly with automatic grade conversion and rank positions.',
      points: [
        'Flexible SBA Splits: Supports standard 30% Class Assessment + 70% Terminal Exam, 40/60, 50/50, or custom splits.',
        'Instant Grade Calculation: Automatically assigns letter grades (A1, B2, C4... or A*, A, B) based on your school\'s scale.',
        'Real-time Subject Positions: Computes class ranking instantaneously without manual sorting or errors.',
        'Teacher Remark Auto-Suggester: Select from pre-loaded pedagogical remarks or enter personalized teacher observations.'
      ],
      statistic: 'Zero Mathematical Errors',
      statisticSub: 'Prevents calculation mistakes, ranking disputes, and grade tampering through immutable audit logs.',
      speakerNotes: {
        ask: '"How many calculation errors or double-ranking complaints do parents raise each academic year?"',
        metric: 'Show the Results Terminal grid where typing a number instantly populates total score, grade, and remark.',
        objection: 'Teachers do not need to do manual addition or look up grading tables; formulas are automatic.'
      }
    },
    {
      number: '09',
      tag: 'MODULE 06: EXAM ANALYSIS',
      moduleKey: 'exam_analysis',
      persona: 'For Academic Committees & Headteachers',
      title: 'Comprehensive Class Broadsheets & Subject Performance Analytics',
      headline: 'Gain bird\'s-eye intelligence into subject pass rates, teacher performance, and class broadsheets.',
      points: [
        'Master Class Broadsheets: View every student\'s scores across all subjects in a single panoramic class ledger.',
        'Subject Performance Averages: Identify which subjects have high failure rates to deploy timely remedial interventions.',
        'Gender & Stream Analytics: Compare male vs female performance and compare stream cohorts (e.g. 8A vs 8B).',
        'Export to Excel & PDF: Export certified master broadsheets for GES inspection or board examination reviews.'
      ],
      statistic: 'Instant Master Broadsheets',
      statisticSub: 'Eliminates 3 days of tedious broadsheet collation meetings among senior faculty members.',
      speakerNotes: {
        ask: '"How long does your academic committee spend in broadsheet collation meetings at the end of exams?"',
        metric: 'Show the Exam Analysis broadsheet tab with color-coded distinctions for distinctions, passes, and fails.',
        objection: 'Can be printed or archived as certified historical records for years of regulatory compliance.'
      }
    },
    {
      number: '10',
      tag: 'MODULE 07: TERMINAL REPORT SHEETS',
      moduleKey: 'reports',
      persona: 'For School Leadership, Parents & Students',
      title: 'One-Click Official Printable & Digital Report Cards',
      headline: 'Generate stunning, tamper-evident terminal report sheets with school crest, photo, conduct, and remarks.',
      points: [
        '1-Click Batch Printing: Generate complete PDF report booklets for 500+ students in under 2 minutes.',
        'Prestige Institutional Design: Beautifully branded with your school crest, motto, official stamp, and signatures.',
        'Conduct, Attendance & Attitude: Includes teacher remarks, headmaster endorsement, next term fees, and opening date.',
        'WhatsApp & Parent Portal Delivery: Dispatch PDF report cards directly to parents\' smartphones via WhatsApp or SMS links.'
      ],
      statistic: '98% Time Reduction',
      statisticSub: 'From 14 days of tedious manual report drafting to less than 10 minutes of automated processing.',
      speakerNotes: {
        ask: '"How much do you pay commercial print shops each term to print booklet report cards that parents often lose?"',
        metric: 'Show a live sample report sheet on screen: clean, high-DPI typography, QR code verification, official crest.',
        objection: 'Can still be physically printed on heavy cardstock or emailed/WhatsApped as verified PDFs.'
      }
    },
    {
      number: '11',
      tag: 'MODULE 08: FEES & MOMO LEDGER',
      moduleKey: 'fees',
      persona: 'For School Bursars, Accountants & Board Directors',
      title: 'Mobile Money Invoicing, Tamper-Evident Receipts & Arrears Ledger',
      headline: 'Stop financial leakage with direct Mobile Money collection, automated parent receipts, and real-time debt tracking.',
      points: [
        'Direct Mobile Money (MTN, Telecel, AT): Parents pay school fees right from their phone with instant payment reconciliation.',
        'Tamper-Evident Digital Receipts: Automatically generates unique receipt numbers with SMS confirmation sent directly to parents.',
        'Live Real-Time Debt Ledger: See every student\'s outstanding arrears, payment breakdown, and historical audit trail.',
        'Paystack & Bank Support: Support both card and bank transfer verifications alongside local cash receipting.'
      ],
      statistic: '+28% Cash Flow Boost',
      statisticSub: 'Proprietors see immediate liquidity improvement in Term 1 through frictionless mobile payment options.',
      speakerNotes: {
        ask: '"What percentage of parents still pay in cash or bring delayed bank slips that take days to reconcile?"',
        metric: 'Show the built-in MoMo simulator and instant Printable Official Fee Receipt Modal.',
        objection: 'Emphasize that the school retains 100% control over bank and treasury accounts; funds route directly to the school.'
      }
    },
    {
      number: '12',
      tag: 'MODULE 09: BOARDING & DORMS',
      moduleKey: 'boarding',
      persona: 'For Boarding Housemasters, Matrons & Security',
      title: 'Hostel Room Allocations, Dormitory Capacity & Exeat Gate Passes',
      headline: 'Manage campus residential life, bed allocations, house masters, and digital exeat permits with zero paper slips.',
      points: [
        'Hostel Bed & Dorm Allocation: Assign students to dormitories, rooms, and bed spaces with live capacity tracking.',
        'Digital Exeat Management: Issue approved student leaves and gate passes with authorized departure and return times.',
        'House Master Endorsements: Track house duties, disciplinary notes, and dorm health inspections.',
        'Security Gate Clearance: Security guards can verify authorized student gate passes by student ID or barcode.'
      ],
      statistic: 'Zero Unaccounted Exeats',
      statisticSub: 'Eliminates fake paper exeat slips and strengthens boarding student safety and campus accountability.',
      speakerNotes: {
        ask: '"How does your boarding department verify that an exeat paper presented at the gate is genuine and approved?"',
        metric: 'Demonstrate digital exeat permit issuance: includes reason, parent consent verification, and housemaster signature.',
        objection: 'Can be utilized strictly for day schools as well if boarding facilities are not on campus.'
      }
    },
    {
      number: '13',
      tag: 'MODULE 10: STAFF DUTY ROSTER',
      moduleKey: 'duty_roster',
      persona: 'For Headteachers, Deputy Heads & Staff Coordinators',
      title: 'Automated Campus Supervision Rotas & Activity Oversight',
      headline: 'Distribute weekly supervision duties transparently across faculty and eliminate campus blindspots.',
      points: [
        'Automated Supervision Rotas: Schedule faculty to morning devotion, canteen, campus grounds, and gate duties without favoritism.',
        'Fair Distribution Algorithm: Prevents overburdening junior teachers by balancing weekend and weekday rotations equally.',
        'Mobile Check-in Telemetry: Duty teachers log campus observations and handover notes directly from their smartphones.',
        'Campus Discipline Logs: Record playground incidents and student decorum notes for administrative review.'
      ],
      statistic: '100% Supervision Coverage',
      statisticSub: 'Ensures zero campus blindspots and enhances student discipline and parent trust.',
      speakerNotes: {
        ask: '"Who coordinates staff supervision duty rotas at your school, and how do you track if teachers actually reported to their posts?"',
        metric: 'Demonstrate automated duty rota generation: schedules an entire term of faculty duties in seconds.',
        objection: 'Teachers receive their scheduled duty weeks on their personal calendar notifications.'
      }
    },
    {
      number: '14',
      tag: 'MODULE 11: LESSON NOTES & VETTING',
      moduleKey: 'lesson_notes',
      persona: 'For Heads of Department (HODs) & Academic Deans',
      title: 'Electronic Lesson Plan Submissions, Vetting & Approvals',
      headline: 'Replace bulky handwritten lesson notebooks with structured electronic submissions and one-click feedback.',
      points: [
        'Paperless Lesson Note Submissions: Teachers submit curriculum strands, specific learning objectives, TLMs, and evaluation plans.',
        'Remote Weekend Vetting Workflow: HODs and Headteachers vet, comment on, and endorse lesson plans from home with 1 click.',
        'Curriculum Standards Alignment: Pre-loaded templates adhere to GES, NaCCA, and international syllabus formats.',
        'Permanent Institutional Repository: Build a reusable institutional archive of exemplary lesson plans for future academic years.'
      ],
      statistic: 'Zero Lost Lesson Books',
      statisticSub: 'Saves teachers 4 hours of tedious handwriting each weekend, shifting focus to active classroom delivery.',
      speakerNotes: {
        ask: '"How many hours does the Headteacher spend on Monday mornings vetting and physically signing physical lesson note books?"',
        metric: 'HODs can vet lesson plans over the weekend on their phones and return structured pedagogical feedback before Monday assembly.',
        objection: 'Teachers love typing lesson plans on phones/laptops instead of handwriting dozens of pages each week.'
      }
    },
    {
      number: '15',
      tag: 'MODULE 12: PAYROLL & COMPENSATION',
      moduleKey: 'payroll',
      persona: 'For Bursars, School Directors & HR Officers',
      title: 'Automated Teacher Salary Schedules, Deductions & Payslips',
      headline: 'Generate accurate monthly staff payroll, manage allowances and deductions, and issue confidential payslips.',
      points: [
        'Salary Grade Configuration: Set base salaries for teaching staff, administrators, security, and maintenance personnel.',
        'Allowances & Deductions: Automatically compute SSNIT, tax (PAYE), staff welfare, loan deductions, and responsibility stipends.',
        'Confidential Digital Payslips: Generate professional monthly payslips exportable to PDF or delivered directly to staff.',
        'Payroll Expenditure Telemetry: Real-time summaries of total institutional wage bill for monthly board accounting.'
      ],
      statistic: '100% Payroll Accuracy',
      statisticSub: 'Eliminates payroll computation disputes, tax calculation errors, and delays in monthly salary disbursement.',
      speakerNotes: {
        ask: '"How long does your accountant spend calculating monthly SSNIT, tax deductions, and writing individual payslips?"',
        metric: 'Demonstrate one-click payroll generation: calculates net pay and prints confidential payslips in seconds.',
        objection: 'Data is strictly confidential; only authorized finance directors have access to payroll ledgers.'
      }
    },
    {
      number: '16',
      tag: 'MODULE 13: SIREN & CAMPUS BELL',
      moduleKey: 'siren',
      persona: 'For School Administrators, Prefects & Gate Personnel',
      title: 'Computerized Automated Period Bell & Emergency Siren Console',
      headline: 'Automate physical bell chimes for period transitions and trigger instant campus emergency sirens with one touch.',
      points: [
        'Automated Period Chime Scheduler: Program morning assembly, period changes, lunch break, and closing bells automatically.',
        'Emergency Campus Sirens: Instant high-decibel alarm triggers for fire drills, perimeter lockdowns, or severe weather.',
        'Hardware-Free Audio Output: Plays clear computerized chimes directly through school PA systems or PC speakers.',
        'Manual Chime Soundboard: Prefects or administrators can ring custom bells with 1-click manual override buttons.'
      ],
      statistic: 'Precision Period Timing',
      statisticSub: 'Eliminates late or forgotten bell rings by caretakers, ensuring students and teachers adhere to schedules.',
      speakerNotes: {
        ask: '"How often are class periods cut short or prolonged because someone forgot to strike the physical school bell?"',
        metric: 'Play a live sample chime or demonstrate the Siren Soundboard directly in the console.',
        objection: 'Works with any standard Bluetooth speaker, amplifier, or PA system plugged into the office computer.'
      }
    },
    {
      number: '17',
      tag: 'MODULE 14: SRC E-VOTING',
      moduleKey: 'evoting',
      persona: 'For Electoral Commissioners, Prefects & Students',
      title: 'Paperless Student Council (SRC) Elections & Live Ballots',
      headline: 'Run tamper-proof, democratic student elections with candidate manifestos, voter tokens, and real-time visual tallying.',
      points: [
        'Paperless Ballot Terminal: Students vote securely on touchscreens or lab computers using verified one-time voter tokens.',
        'Candidate Profiles & Manifestos: Showcase candidate photos, portfolios (Head Prefect, Dining Hall, Sports, Protocol) and slogans.',
        'Live Broadcast Tally Visualizer: Project real-time vote count progress on assembly projectors with animated percentage charts.',
        'Instant Auditable Results: Zero disputed ballot papers, zero vote tampering, and instant certification of winners.'
      ],
      statistic: '₵12,000 Saved on Ballots',
      statisticSub: 'Eliminates ballot printing costs, manual counting fatigue, and election disputes among students and parents.',
      speakerNotes: {
        ask: '"How much do you spend printing election ballots, and how long does counting take into the evening?"',
        metric: 'Students and PTA boards are blown away when they see elections conducted like modern electronic voting.',
        objection: 'Voter tokens ensure every student votes exactly once with complete ballot secrecy.'
      }
    },
    {
      number: '18',
      tag: 'MODULE 15: INVENTORY REGISTRY',
      moduleKey: 'inventory',
      persona: 'For Storekeepers, Librarians & Science Lab Masters',
      title: 'Store Assets, Textbooks, Science Lab Supplies & Audits',
      headline: 'Track campus assets, library textbooks, science laboratory reagents, and supplies with automated restock warnings.',
      points: [
        'Asset & Commodity Tracking: Monitor classroom desks, laboratory chemicals, sports equipment, and library textbooks.',
        'Stock Issuance & Movement Logs: Record items issued to specific teachers or departments with date, quantity, and receiver.',
        'Low Stock Alerts: Visual warnings when essential commodities fall below minimum reorder thresholds.',
        'Valuation & Expense Ledger: Real-time calculation of total institutional asset value and restock expenditures.'
      ],
      statistic: 'Zero Lost Assets',
      statisticSub: 'Stops inventory shrinkage, missing textbooks, and unaccounted school store supplies.',
      speakerNotes: {
        ask: '"How many library textbooks or laboratory supplies go missing or unaccounted for at the end of each academic year?"',
        metric: 'Show the Inventory Registry with quantity tracking, asset valuations, and restock expense logging.',
        objection: 'Storekeepers can manage stock on their smartphones without complex accounting knowledge.'
      }
    },
    {
      number: '19',
      tag: 'MODULE 16: USER ROLES & ACCESS CONTROL',
      moduleKey: 'users',
      persona: 'For Proprietors, Principals & IT Administrators',
      title: 'Multi-Role Security, Staff Permissions & System Audit Trails',
      headline: 'Enforce bank-grade data privacy with strict role isolation between Headmasters, Bursars, Teachers, and Guardians.',
      points: [
        'Granular Permission Matrix: Ensure teachers only view scores for their assigned classes; tuition ledgers remain confidential.',
        'Rapid Staff Onboarding: Issue secure login credentials, scoped usernames, and magic links with zero IT complexity.',
        'Parent & Student Profiles: Scoped portal access allowing parents to check student progress without exposing school data.',
        'Immutable Activity Audit Log: Track every login, score modification, and fee entry with exact staff timestamp.'
      ],
      statistic: 'Zero Data Leaks',
      statisticSub: 'Strict RBAC isolation guarantees total administrative control and prevents score tampering.',
      speakerNotes: {
        ask: '"Can your teachers currently view fee collection balances, or could someone alter continuous assessment scores undetected?"',
        metric: 'Show the User Management terminal with granular role toggle switches and complete audit activity trails.',
        objection: 'Users can only access features authorized for their explicit role; permissions can be adjusted anytime.'
      }
    },
    {
      number: '20',
      tag: 'MODULE 17: SCHOOL SETTINGS & BRANDING',
      moduleKey: 'settings',
      persona: 'For School Boards, Principals & Managing Directors',
      title: 'Institutional Crest Branding, Academic Cycles & System Configurations',
      headline: 'Tailor the entire platform to your school\'s unique identity, grading scales, term schedules, and official crest.',
      points: [
        'Custom Crest & Color Branding: Display your school\'s crest, motto, and theme colors on report cards, receipts, and portals.',
        'Flexible Academic Cycles: Configure 3-term or 2-semester academic calendars with custom vacation and resumption dates.',
        'Custom Grading Benchmark Scales: Customize grade boundaries (A1-F9, Cambridge A*-U, or percentages) to match your standard.',
        'Automated Database Snapshots: Download full school data archives or restore historical records with 1-click administrative control.'
      ],
      statistic: '100% Brand Customization',
      statisticSub: 'Projects an elite, prestigious institutional identity that parents admire and competitors cannot match.',
      speakerNotes: {
        ask: '"Does your school have unique grading benchmarks or a distinctive motto and crest you want reflected on all parent documents?"',
        metric: 'Show the School Settings panel where changing the crest and colors updates every report card and receipt in real time.',
        objection: 'Any grading formula or calendar division is supported out of the box.'
      }
    },
    {
      number: '21',
      tag: 'GUARDIAN ENGAGEMENT',
      title: 'Elevate Institutional Prestige & Deepen Parent Trust',
      headline: 'Turn your school into the premium choice in your district with modern parent communication.',
      points: [
        'Instant Attendance SMS Alerts: Parents know the exact minute their child arrives or is marked absent.',
        'Direct Terminal Exam Dispatch: Send official grade summaries directly to parents via WhatsApp and SMS.',
        'Parent Portal Login: Guardians can check real-time fee balances, upcoming school calendar dates, and lesson progress.',
        'Crisis & Emergency Broadcaster: Reach 1,000+ parents in under 30 seconds during sudden weather or calendar updates.'
      ],
      statistic: '94% Parent Satisfaction',
      statisticSub: 'Parents perceive the school as significantly more prestigious and professional when receiving instant digital alerts.',
      speakerNotes: {
        ask: '"Do parents constantly call the administration inquiring about fee balances or report card release dates?"',
        metric: 'This transparency builds immediate goodwill and justifies premium termly tuition fees.',
        objection: 'Address phone accessibility: SMS works on basic analog "yam" phones as well as smartphones.'
      }
    },
    {
      number: '22',
      tag: 'RESILIENT ENGINEERING',
      title: 'Built for Africa: Offline-First Operation with Cloud Sync',
      headline: 'Power cuts and fiber disruptions will never halt your administrative workflow.',
      points: [
        'Local-First IndexedDB Engine: Teachers can enter marks and attendance even if the internet is completely offline.',
        'Silent Background Cloud Sync: When connection returns, changes automatically synchronize with the Supabase database.',
        'Zero High-End Server Burden: Runs smoothly in Chrome, Edge, or Firefox on standard budget laptops and tablets.',
        'Installable Desktop & Mobile App: PWA compliant; add to home screen or desktop with 1-click launch.'
      ],
      statistic: '99.9% Operational Uptime',
      statisticSub: 'Never hear "the system is down" when parents are standing in line at the accountant\'s desk.',
      speakerNotes: {
        ask: '"What happens to your current operations when the internet drops or light goes off for 4 hours?"',
        metric: 'This is the biggest killer advantage over traditional web apps. SchoolSphere never locks users out during outages.',
        objection: 'Show that data is safely encrypted locally and synced securely using TLS 1.3.'
      }
    },
    {
      number: '23',
      tag: 'SECURITY & SOVEREIGNTY',
      title: 'Bank-Grade Security, Cryptographic Licenses & Data Privacy',
      headline: 'Your school\'s proprietary academic and financial data remains 100% under your ownership.',
      points: [
        'Institutional Tenant Isolation: Zero risk of data bleeding between different schools on the platform.',
        'Cryptographic Software Licensing: Tamper-proof license keys generated specifically for your institutional domain.',
        'Granular Role-Based Access (RBAC): Teachers cannot view financial ledgers; students cannot edit marks.',
        'Exportable Anytime: Export complete school records to Excel, PDF, or JSON with one click at any time.'
      ],
      statistic: 'Zero Data Lock-in',
      statisticSub: 'Full administrative ownership with automated daily backups and complete export freedom.',
      speakerNotes: {
        ask: '"Who has access to your student grades and fee ledgers right now? Are they stored in an unprotected Excel file?"',
        metric: 'SchoolSphere enforces immutable audit logs that record every single score modification with timestamp and staff ID.',
        objection: 'Guarantees the school that they can export every student file and fee record at any time without penalties.'
      }
    },
    {
      number: '24',
      tag: 'PROVEN ROI & ECONOMICS',
      title: 'The Financial Equation: Pays for Itself in Less Than 45 Days',
      headline: 'SchoolSphere is not an expense — it is an active profit center for your institution.',
      points: [
        'Direct Paper & Printing Savings: Save ₵4,000–₵9,000/term on reams of paper, toners, and commercial booklet printing.',
        'Recaptured Tuition Revenue: Automated MoMo reminders recover ₵10,000+ in previously abandoned tuition arrears.',
        'Staff Productivity Multiplier: Free up 120+ teacher hours per term to focus on student performance and WAEC prep.',
        'Transparent Predictable Pricing: Flat per-term or annual investment with zero surprise charges or hidden fees.'
      ],
      statistic: '340% Projected ROI',
      statisticSub: 'Average annual economic return compared to traditional manual school operations.',
      speakerNotes: {
        ask: '"If SchoolSphere saves you ₵6,000 on printing and recovers just ₵15,000 in uncollected fees, does the system pay for itself?"',
        metric: 'Show the Live ROI Calculator tab right now with their exact student numbers.',
        objection: 'Highlight that the cost per student is less than ₵0.40 per day — a tiny fraction of a single student\'s termly fee.'
      }
    },
    {
      number: '25',
      tag: 'WHITE-GLOVE ONBOARDING',
      title: 'Our 3-Day Turnkey Transition Plan: Zero Disruption',
      headline: 'We handle the entire setup, historical data import, and staff training so you don\'t lift a finger.',
      points: [
        'Day 1 — Institutional Onboarding & Data Migration: Our engineers import your existing Excel files or paper registers.',
        'Day 2 — Staff & Faculty Certification Workshop: A practical 2-hour session ensuring every teacher is 100% confident.',
        'Day 3 — Official Term Go-Live & Parent Announcement: We deploy your customized portal with dedicated live standby support.',
        'Continuous Partnership: Termly system enhancements, dedicated WhatsApp support hotline, and free feature updates.'
      ],
      statistic: '72-Hour Rapid Rollout',
      statisticSub: 'Zero administrative disruption. Your existing term continues uninterrupted while we deploy.',
      speakerNotes: {
        ask: '"Would you like our engineering team to handle the entire student roster import for you this weekend?"',
        metric: 'Offer a pilot trial or immediate contract signing with the 10% early onboarding discount.',
        objection: 'Close the deal: "Let\'s generate the official proposal now, print the document, and lock in your school\'s deployment date."'
      }
    }
  ];

  const currentSlide = PITCH_SLIDES[currentSlideIndex];

  // Presentation Navigation
  const handlePrevSlide = () => {
    setCurrentSlideIndex(prev => (prev > 0 ? prev - 1 : PITCH_SLIDES.length - 1));
  };

  const handleNextSlide = () => {
    setCurrentSlideIndex(prev => (prev < PITCH_SLIDES.length - 1 ? prev + 1 : 0));
  };

  // Keyboard navigation for presentation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (activeTab !== 'pitch_deck') return;
      if (e.key === 'ArrowRight' || e.key === 'Space') {
        e.preventDefault();
        handleNextSlide();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePrevSlide();
      } else if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab, isFullscreen, currentSlideIndex]);

  // Save current proposal
  const handleSaveProposal = () => {
    if (!schoolName.trim()) {
      showToast('Please specify the prospective school name.', 'error');
      return;
    }
    const newProp: ProposalItem = {
      id: `prop-${Date.now()}`,
      schoolName,
      contactPerson,
      phone: contactPhone,
      email: contactEmail,
      location,
      studentsCount,
      tier,
      currency,
      selectedModules,
      modulePrices,
      addOns: selectedAddOns,
      discountPercent,
      billingFrequency,
      status: 'Presented',
      createdAt: new Date().toLocaleDateString(),
      totalPerTerm: pricingCalculation.finalTermly,
      totalAnnual: pricingCalculation.finalAnnual,
      notes: proposalNotes
    };

    setSavedProposals(prev => [newProp, ...prev.filter(p => p.schoolName.toLowerCase() !== schoolName.toLowerCase())]);
    showToast(`Commercial proposal for ${schoolName} saved to Studio Library!`, 'success');
  };

  const handleLoadProposal = (prop: ProposalItem) => {
    setSchoolName(prop.schoolName);
    setContactPerson(prop.contactPerson);
    setContactPhone(prop.phone);
    setContactEmail(prop.email);
    setLocation(prop.location);
    setStudentsCount(prop.studentsCount);
    setTier(prop.tier);
    setCurrency((prop.currency as any) || 'GHS');
    setSelectedModules(prop.selectedModules || DEFAULT_MODULES.map(m => m.id));
    if (prop.modulePrices) {
      setModulePrices(prop.modulePrices);
    } else {
      const initial: Record<string, number> = {};
      DEFAULT_MODULES.forEach(m => { initial[m.id] = m.price; });
      setModulePrices(initial);
    }
    setSelectedAddOns(prop.addOns || []);
    setDiscountPercent(prop.discountPercent || 0);
    setBillingFrequency(prop.billingFrequency || 'annual');
    setProposalNotes(prop.notes || '');
    setActiveTab('document');
    showToast(`Loaded ${prop.schoolName} proposal into viewer.`, 'info');
  };

  const handleDeleteProposal = (id: string) => {
    setSavedProposals(prev => prev.filter(p => p.id !== id));
    showToast('Proposal removed from library.', 'info');
  };

  // Copy Plain Text Proposal
  const handleCopyProposalText = () => {
    const text = `
================================================================================
INSTITUTIONAL TECHNICAL & COMMERCIAL PROPOSAL
SCHOOLSPHERE CLOUD ENTERPRISE OPERATING SYSTEM
================================================================================
Document Ref: ${proposalRef}
Date: ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
Prospective Institution: ${schoolName}
Attn: ${contactPerson}
Location: ${location}
Student Population: ${studentsCount} Enrolled Students

EXECUTIVE SUMMARY:
SchoolSphere is pleased to present this institutional proposal to modernize the academic, financial, and operational systems of ${schoolName}. Our unified, offline-first operating system replaces paperwork bottlenecks with instant terminal report cards, Mobile Money tuition collections, and automated guardian communications.

AUTHORIZED MODULE SCOPE:
${selectedModules.map(mId => {
  const m = DEFAULT_MODULES.find(x => x.id === mId);
  const p = getModulePrice(mId);
  return `• ${m?.label || mId} (${currencySymbol}${p}/term): ${m?.desc || ''}`;
}).join('\n')}

INCLUDED PROFESSIONAL SERVICES & ADD-ONS:
${selectedAddOns.map(aId => {
  const a = ADD_ON_SERVICES.find(x => x.id === aId);
  return `• ${a?.label || aId} - ${currencySymbol}${a?.price}`;
}).join('\n')}

INVESTMENT SCHEDULE:
• License Tier: ${tier} Edition
• Termly Fee (Gross): ${currencySymbol}${pricingCalculation.termlyGross.toLocaleString()}
• Termly Fee (Net with ${discountPercent}% discount): ${currencySymbol}${pricingCalculation.finalTermly.toLocaleString()}
• Annual Investment (Net 3 Terms): ${currencySymbol}${pricingCalculation.finalAnnual.toLocaleString()}
• Effective Rate Per Student/Term: ${currencySymbol}${pricingCalculation.perStudentPerTerm} (Approx ${currencySymbol}${pricingCalculation.perStudentPerDay} / day)

IMPLEMENTATION MILESTONES:
Phase 1 (Day 1): Institutional Roster Data Migration & System Setup
Phase 2 (Day 2): Staff & Faculty Practical Training Workshop
Phase 3 (Day 3): Official Portal Go-Live & Parent Broadcaster Launch

Prepared by:
SchoolSphere Creator Studio Solutions Directorate
Contact: amoakoemmanuel@hotmail.com | Tel: 0551187045 / 0554234590
================================================================================
`.trim();

    navigator.clipboard.writeText(text);
    showToast('Formal commercial proposal copied to clipboard!', 'success');
  };

  // Copy WhatsApp Pitch Message
  const handleCopyWhatsAppPitch = () => {
    const waText = `Hello ${contactPerson || 'School Principal'},\n\n` +
      `Trust you are having a productive academic week at *${schoolName}*.\n\n` +
      `Following our discussion on upgrading your school's report card processing and fee collection, we have finalized your tailored *SchoolSphere Enterprise Proposal*:\n\n` +
      `🏫 *Institution:* ${schoolName}\n` +
      `📊 *Roster Size:* ${studentsCount} Students\n` +
      `⚡ *Key Features:* Instant 1-Click Terminal Reports, Mobile Money Fee Collections with SMS Receipts, Automated Broadsheets & Offline Mode.\n\n` +
      `💰 *Investment:* ${currencySymbol}${pricingCalculation.finalTermly.toLocaleString()} per term (or ${currencySymbol}${pricingCalculation.finalAnnual.toLocaleString()} annually with ${discountPercent}% early-onboarding incentive).\n` +
      `💡 *Cost per student:* Only *${currencySymbol}${pricingCalculation.perStudentPerDay} per day* — significantly less than paper printing costs!\n\n` +
      `We can complete your entire student data migration and staff training in 72 hours. Would you be available for a 15-minute live demo this week?\n\n` +
      `Best regards,\nSchoolSphere Engineering Directorate\n0551187045 / 0554234590`;

    navigator.clipboard.writeText(waText);
    showToast('WhatsApp executive pitch pitch copied to clipboard!', 'success');
  };

  // Export PDF
  const handleExportPDF = async () => {
    try {
      showToast('Generating high-resolution proposal PDF...', 'info');
      await exportToPDF('proposal-document-content', `Proposal_${schoolName.replace(/[^a-zA-Z0-9]/g, '_')}`);
      showToast('Proposal PDF exported successfully!', 'success');
    } catch (e) {
      showToast('Failed to export PDF. Try printing instead.', 'error');
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Deep Slate / Indigo Executive Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-3xl p-6 sm:p-7 text-white shadow-lg border border-indigo-900/40">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-indigo-600/30 border border-indigo-400/30 flex items-center justify-center text-indigo-300">
                <Presentation className="w-5 h-5 text-indigo-200" />
              </div>
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-indigo-400 block">
                  CREATOR STUDIO SALES ACCELERATOR
                </span>
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center gap-2">
                  Pitch & Proposal Studio
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 uppercase tracking-widest">
                    CLIENT ACQUISITION ENGINE
                  </span>
                </h1>
              </div>
            </div>
            <p className="text-xs text-slate-300 max-w-2xl font-medium leading-relaxed">
              Equip your agency or creator practice with high-impact pitch decks, dynamic commercial quotation builders, interactive client ROI calculators, and objection battlecards to win school contracts.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              onClick={() => {
                setActiveTab('pitch_deck');
                setIsFullscreen(true);
              }}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition cursor-pointer shadow-md shadow-indigo-900/50"
            >
              <Maximize2 className="w-4 h-4" />
              <span>Launch Fullscreen Deck</span>
            </button>
            <button
              onClick={() => setActiveTab('document')}
              className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition cursor-pointer"
            >
              <FileCheck className="w-4 h-4 text-emerald-400" />
              <span>View Formal Proposal</span>
            </button>
          </div>
        </div>

        {/* Studio Sub-Navigation Bar */}
        <div className="mt-6 pt-5 border-t border-indigo-900/60 flex flex-wrap items-center gap-2">
          {[
            { id: 'pitch_deck', label: 'Client Pitch Deck', icon: Presentation, badge: '25 Slides (All 17 Modules)' },
            { id: 'architect', label: 'Proposal Architect', icon: Calculator, badge: 'Quote Builder' },
            { id: 'document', label: 'Formal Proposal Document', icon: FileText, badge: 'PDF & Print' },
            { id: 'roi', label: 'Client ROI & Savings', icon: TrendingUp, badge: 'Calculations' },
            { id: 'objections', label: 'Objection Playbook', icon: Shield, badge: 'Battlecards' },
            { id: 'library', label: 'Proposals Library', icon: FolderOpen, badge: `${savedProposals.length} Saved` }
          ].map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={cn(
                  'px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer',
                  isActive
                    ? 'bg-white text-slate-900 shadow-sm font-extrabold'
                    : 'bg-indigo-950/50 text-slate-300 hover:bg-indigo-900/60 hover:text-white border border-indigo-900/40'
                )}
              >
                <Icon className={cn('w-4 h-4', isActive ? 'text-indigo-600' : 'text-slate-400')} />
                <span>{tab.label}</span>
                <span className={cn('text-[9px] px-1.5 py-0.2 rounded font-black', isActive ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-800 text-slate-400')}>
                  {tab.badge}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* =========================================================================
          TAB 1: INTERACTIVE PITCH DECK (PRESENTER STAGE MODE)
      ========================================================================= */}
      {activeTab === 'pitch_deck' && (
        <div
          ref={deckRef}
          className={cn(
            'space-y-4 transition-all duration-300',
            isFullscreen && 'fixed inset-0 z-50 bg-slate-950 p-4 sm:p-8 flex flex-col justify-between overflow-y-auto'
          )}
        >
          {/* Deck Control Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex items-center gap-3">
              <span className="text-xs font-black uppercase text-indigo-600 tracking-wider">
                Slide {currentSlideIndex + 1} of {PITCH_SLIDES.length}
              </span>
              <span className="text-slate-300">|</span>
              <span className="text-xs font-bold text-slate-700 truncate max-w-xs">
                {currentSlide.title}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {/* Meeting Timer */}
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 rounded-xl border border-slate-200 text-slate-700 text-xs font-mono font-bold">
                <Clock className="w-3.5 h-3.5 text-indigo-600" />
                <span>{formatTimer(presentationTimer)}</span>
                <button
                  onClick={() => setIsTimerRunning(!isTimerRunning)}
                  className="ml-1 text-[10px] text-indigo-600 hover:underline font-sans font-bold cursor-pointer"
                >
                  {isTimerRunning ? 'Pause' : 'Start'}
                </button>
                <button
                  onClick={() => {
                    setIsTimerRunning(false);
                    setPresentationTimer(0);
                  }}
                  className="text-[10px] text-slate-400 hover:text-slate-600 font-sans cursor-pointer"
                >
                  Reset
                </button>
              </div>

              {/* Speaker Notes Toggle */}
              <button
                onClick={() => setShowPresenterNotes(!showPresenterNotes)}
                className={cn(
                  'px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer border',
                  showPresenterNotes
                    ? 'bg-amber-50 text-amber-900 border-amber-200'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                )}
              >
                <Eye className="w-3.5 h-3.5 text-amber-600" />
                <span>Presenter Notes</span>
              </button>

              {/* Fullscreen Toggle */}
              <button
                onClick={() => setIsFullscreen(!isFullscreen)}
                className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition cursor-pointer"
                title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
              >
                {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Quick Slide Jump Bar */}
          <div className="flex items-center gap-1.5 overflow-x-auto p-2 bg-white rounded-2xl border border-slate-200 text-xs shadow-xs">
            <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider px-2 shrink-0">
              Quick Slide Jump:
            </span>
            {PITCH_SLIDES.map((s, idx) => {
              const isCur = currentSlideIndex === idx;
              return (
                <button
                  key={idx}
                  onClick={() => setCurrentSlideIndex(idx)}
                  className={cn(
                    'px-2.5 py-1 rounded-xl font-bold whitespace-nowrap text-[11px] shrink-0 transition cursor-pointer flex items-center gap-1',
                    isCur
                      ? 'bg-indigo-600 text-white shadow-xs font-black'
                      : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200'
                  )}
                >
                  <span className="opacity-70">{s.number}.</span>
                  <span>{s.tag.replace(/^MODULE \d+: /, '').split(' ')[0]}</span>
                </button>
              );
            })}
          </div>

          {/* Slide Stage Main Card */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* Primary Slide Display */}
            <div className={cn('bg-white border border-slate-200 rounded-3xl p-6 sm:p-10 shadow-md relative overflow-hidden flex flex-col justify-between min-h-[460px]', showPresenterNotes ? 'lg:col-span-8' : 'lg:col-span-12')}>
              {/* Subtle top watermark with App Logo */}
              <div className="absolute top-4 right-6 text-right select-none flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-slate-900 p-1 flex items-center justify-center shrink-0 shadow-xs border border-slate-700">
                  <img
                    src="/sch sphere logo1.png"
                    alt="SchoolSphere"
                    className="w-full h-full object-contain"
                    onError={(e) => {
                      (e.currentTarget as HTMLElement).style.display = 'none';
                    }}
                  />
                </div>
                <div className="text-right">
                  <span className="text-3xl sm:text-4xl font-black text-slate-200 tracking-tighter block leading-none">
                    {currentSlide.number}
                  </span>
                  <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 block">
                    SchoolSphere Pitch
                  </span>
                </div>
              </div>

              <div>
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-indigo-600 block">
                    {currentSlide.tag}
                  </span>
                  {(currentSlide as any).persona && (
                    <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                      {(currentSlide as any).persona}
                    </span>
                  )}
                </div>
                <h2 className="text-xl sm:text-3xl font-black text-slate-900 tracking-tight leading-tight max-w-2xl">
                  {currentSlide.title}
                </h2>
                <p className="mt-2 text-sm sm:text-base font-bold text-indigo-900/80 leading-relaxed max-w-2xl">
                  {currentSlide.headline}
                </p>

                {/* If isOverviewHub, render interactive all-module catalog */}
                {(currentSlide as any).isOverviewHub ? (
                  <div className="mt-6 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5 max-h-[380px] overflow-y-auto pr-1">
                      {DEFAULT_MODULES.map((mod, modIdx) => {
                        const targetSlideIdx = PITCH_SLIDES.findIndex(s => s.moduleKey === mod.id);
                        return (
                          <div
                            key={mod.id}
                            onClick={() => targetSlideIdx !== -1 && setCurrentSlideIndex(targetSlideIdx)}
                            className="p-3 rounded-2xl bg-slate-50 hover:bg-indigo-50/60 border border-slate-200/80 hover:border-indigo-300 transition cursor-pointer flex flex-col justify-between gap-2 group text-left"
                          >
                            <div>
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-[9px] font-black uppercase tracking-wider text-indigo-600 bg-indigo-100/60 px-1.5 py-0.5 rounded">
                                  MODULE {String(modIdx + 1).padStart(2, '0')}
                                </span>
                                <span className="text-[10px] font-bold text-slate-500 bg-white border border-slate-200 px-1.5 py-0.2 rounded group-hover:border-indigo-300">
                                  {currencySymbol}{getModulePrice(mod.id)}/term
                                </span>
                              </div>
                              <h4 className="text-xs font-black text-slate-900 group-hover:text-indigo-900">
                                {mod.label}
                              </h4>
                              <p className="text-[10px] text-slate-500 leading-normal mt-0.5">
                                {mod.desc}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  /* Standard Slide Points */
                  <div className="mt-6 space-y-3.5">
                    {currentSlide.points.map((pt, idx) => (
                      <div key={idx} className="flex items-start gap-3">
                        <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 mt-0.5 font-bold text-xs">
                          ✓
                        </div>
                        <p className="text-xs sm:text-sm text-slate-700 font-semibold leading-relaxed">
                          {pt}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Bottom Stat Highlight */}
              <div className="mt-8 pt-5 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="p-3 bg-indigo-50/70 border border-indigo-100 rounded-2xl flex items-center gap-3">
                  <Sparkles className="w-6 h-6 text-indigo-600 shrink-0" />
                  <div>
                    <span className="text-xs sm:text-sm font-black text-indigo-900 block">
                      {currentSlide.statistic}
                    </span>
                    <span className="text-[11px] font-semibold text-slate-500 block">
                      {currentSlide.statisticSub}
                    </span>
                  </div>
                </div>

                {/* Slide Nav Arrows */}
                <div className="flex items-center gap-2 self-end sm:self-center">
                  <button
                    onClick={handlePrevSlide}
                    className="p-3 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl transition cursor-pointer flex items-center gap-1 text-xs font-bold"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    <span>Prev</span>
                  </button>
                  <button
                    onClick={handleNextSlide}
                    className="p-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition cursor-pointer flex items-center gap-1 text-xs font-black shadow-sm"
                  >
                    <span>Next Slide</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Presenter Speaker Notes Drawer */}
            {showPresenterNotes && (
              <div className="lg:col-span-4 bg-amber-50/70 border border-amber-200/80 rounded-3xl p-6 shadow-xs space-y-5">
                <div className="flex items-center gap-2 border-b border-amber-200/60 pb-3">
                  <Award className="w-5 h-5 text-amber-700" />
                  <div>
                    <h3 className="text-xs font-black uppercase text-amber-900 tracking-wider">
                      Speaker Cheat-Sheet
                    </h3>
                    <p className="text-[10px] text-amber-700 font-medium">
                      Private creator cues & live meeting strategies
                    </p>
                  </div>
                </div>

                <div className="space-y-4 text-xs">
                  <div className="space-y-1">
                    <span className="text-[10px] font-black uppercase tracking-wider text-amber-800 flex items-center gap-1">
                      <Target className="w-3.5 h-3.5 text-amber-700" />
                      Provocative Question to Ask Client
                    </span>
                    <p className="text-amber-950 font-bold bg-white/70 p-3 rounded-xl border border-amber-200/70 italic leading-relaxed">
                      "{currentSlide.speakerNotes.ask}"
                    </p>
                  </div>

                  <div className="space-y-1">
                    <span className="text-[10px] font-black uppercase tracking-wider text-amber-800 flex items-center gap-1">
                      <Zap className="w-3.5 h-3.5 text-amber-700" />
                      The Killer Value Metric
                    </span>
                    <p className="text-amber-950 font-semibold bg-white/70 p-3 rounded-xl border border-amber-200/70 leading-relaxed">
                      {currentSlide.speakerNotes.metric}
                    </p>
                  </div>

                  <div className="space-y-1">
                    <span className="text-[10px] font-black uppercase tracking-wider text-amber-800 flex items-center gap-1">
                      <Shield className="w-3.5 h-3.5 text-amber-700" />
                      Objection Defense
                    </span>
                    <p className="text-amber-950 font-semibold bg-white/70 p-3 rounded-xl border border-amber-200/70 leading-relaxed">
                      {currentSlide.speakerNotes.objection}
                    </p>
                  </div>
                </div>

                <div className="pt-2 border-t border-amber-200/60 flex items-center justify-between text-[10px] text-amber-800 font-bold">
                  <span>Use [←] / [→] keys to flip slides</span>
                  <button
                    onClick={() => setActiveTab('architect')}
                    className="text-indigo-600 hover:underline font-black cursor-pointer"
                  >
                    Build Quotation →
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Slide Thumbnails Tray */}
          <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-2 overflow-x-auto">
            {PITCH_SLIDES.map((s, idx) => {
              const isSelected = currentSlideIndex === idx;
              return (
                <button
                  key={idx}
                  onClick={() => setCurrentSlideIndex(idx)}
                  className={cn(
                    'shrink-0 text-left p-2.5 rounded-xl border transition cursor-pointer w-44',
                    isSelected
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  )}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className={cn('text-[9px] font-black uppercase', isSelected ? 'text-indigo-200' : 'text-slate-400')}>
                      {s.number}
                    </span>
                    <span className={cn('text-[8px] font-bold px-1 rounded', isSelected ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-600')}>
                      {s.tag.split(' ')[0]}
                    </span>
                  </div>
                  <p className="text-[10px] font-bold line-clamp-1 truncate">
                    {s.title}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 2: PROPOSAL ARCHITECT (CUSTOM QUOTE BUILDER)
      ========================================================================= */}
      {activeTab === 'architect' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Form: Client & Scope Parameters */}
          <div className="lg:col-span-8 bg-white border border-slate-200 rounded-3xl p-6 sm:p-7 shadow-xs space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
                  <Calculator className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-black text-slate-900 tracking-tight">
                    Institutional Proposal Architect
                  </h2>
                  <p className="text-xs text-slate-500">
                    Customize school demographics, module entitlements, and commercial rates.
                  </p>
                </div>
              </div>

              <button
                onClick={() => {
                  setSchoolName('Achimota Heritage Academy');
                  setContactPerson('Dr. Peter Osei (Proprietor)');
                  setStudentsCount(450);
                  setTier('Standard');
                  setDiscountPercent(10);
                  showToast('Populated with high-converting proposal defaults.', 'info');
                }}
                className="text-[11px] text-indigo-600 hover:underline font-bold cursor-pointer"
              >
                Reset to Standard Defaults
              </button>
            </div>

            {/* School Profile Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">
                  Prospective Institution Name *
                </label>
                <input
                  type="text"
                  value={schoolName}
                  onChange={e => setSchoolName(e.target.value)}
                  placeholder="e.g. Achimota Heritage Academy"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">
                  Decision Maker / Authority *
                </label>
                <input
                  type="text"
                  value={contactPerson}
                  onChange={e => setContactPerson(e.target.value)}
                  placeholder="e.g. Dr. Peter Osei (Headmaster & Board Chair)"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">
                  Contact Phone Number
                </label>
                <input
                  type="text"
                  value={contactPhone}
                  onChange={e => setContactPhone(e.target.value)}
                  placeholder="e.g. +233 55 423 4590"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">
                  Official Email Address
                </label>
                <input
                  type="email"
                  value={contactEmail}
                  onChange={e => setContactEmail(e.target.value)}
                  placeholder="e.g. principal@heritageacademy.edu.gh"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="sm:col-span-2 space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">
                  Physical Campus Location / District
                </label>
                <input
                  type="text"
                  value={location}
                  onChange={e => setLocation(e.target.value)}
                  placeholder="e.g. Achimota, Greater Accra Region"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            {/* Population & Tier Settings */}
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-4">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">
                    Student Population Roster Size
                  </label>
                  <span className="text-sm font-black text-indigo-700 bg-indigo-50 px-2.5 py-0.5 rounded-lg border border-indigo-100">
                    {studentsCount} Students Enrolled
                  </span>
                </div>
                <input
                  type="range"
                  min="50"
                  max="2000"
                  step="25"
                  value={studentsCount}
                  onChange={e => setStudentsCount(parseInt(e.target.value) || 50)}
                  className="w-full accent-indigo-600 cursor-pointer"
                />
                <div className="flex justify-between text-[9px] text-slate-400 font-bold">
                  <span>50 (Small Creche)</span>
                  <span>500 (Mid Academy)</span>
                  <span>1,000 (Large Campus)</span>
                  <span>2,000+ (High School)</span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">
                    Platform Edition Tier
                  </label>
                  <select
                    value={tier}
                    onChange={e => setTier(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
                  >
                    <option value="Basic">Basic Edition</option>
                    <option value="Standard">Standard (Most Popular)</option>
                    <option value="Professional">Professional Enterprise</option>
                    <option value="Developer">Multi-Campus Platinum</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">
                    Target Currency
                  </label>
                  <select
                    value={currency}
                    onChange={e => setCurrency(e.target.value as any)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
                  >
                    <option value="GHS">Ghanaian Cedi (GH₵)</option>
                    <option value="USD">US Dollar ($)</option>
                    <option value="NGN">Nigerian Naira (₦)</option>
                    <option value="GBP">British Pound (£)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">
                    Billing Cycle
                  </label>
                  <select
                    value={billingFrequency}
                    onChange={e => setBillingFrequency(e.target.value as any)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
                  >
                    <option value="term">Per Term (3x Per Year)</option>
                    <option value="annual">Annual (Save 10%)</option>
                    <option value="biennial">2-Year Lock (Save 20%)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Included Modules Checklist with Adjustable Pricing */}
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-xs font-black uppercase text-slate-800 tracking-wider">
                    Authorized Module Entitlements & Pricing ({selectedModules.length}/17 Selected)
                  </h3>
                  <p className="text-[10px] text-slate-500">
                    Select features included and adjust the specific termly price for any module to tailor the commercial quote.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                  <span className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">Quick Rates:</span>
                  <button
                    type="button"
                    onClick={resetModulePrices}
                    className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded cursor-pointer transition"
                  >
                    Catalog Defaults
                  </button>
                  <button
                    type="button"
                    onClick={() => applyBulkPriceMultiplier(1.15)}
                    className="px-2 py-0.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded cursor-pointer transition"
                  >
                    +15%
                  </button>
                  <button
                    type="button"
                    onClick={() => applyBulkPriceMultiplier(0.85)}
                    className="px-2 py-0.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded cursor-pointer transition"
                  >
                    -15%
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setModulePrices(prev => {
                        const updated: Record<string, number> = {};
                        DEFAULT_MODULES.forEach(m => { updated[m.id] = 0; });
                        return updated;
                      });
                      showToast('All module fees set to 0 (Bundled Free with Base License).', 'info');
                    }}
                    className="px-2 py-0.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold rounded cursor-pointer transition"
                  >
                    Included Free
                  </button>
                  <span className="text-slate-300">|</span>
                  <button
                    type="button"
                    onClick={() => setSelectedModules(DEFAULT_MODULES.map(m => m.id))}
                    className="text-indigo-600 font-bold hover:underline cursor-pointer"
                  >
                    All 17
                  </button>
                  <span className="text-slate-300">|</span>
                  <button
                    type="button"
                    onClick={() => setSelectedModules(['students', 'academic', 'results', 'reports', 'fees'])}
                    className="text-slate-500 font-bold hover:underline cursor-pointer"
                  >
                    Core Only
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {DEFAULT_MODULES.map(mod => {
                  const isChecked = selectedModules.includes(mod.id);
                  const currentPrice = getModulePrice(mod.id);
                  return (
                    <div
                      key={mod.id}
                      className={cn(
                        'p-3 rounded-2xl border text-left transition select-none flex flex-col justify-between gap-2.5',
                        isChecked
                          ? 'bg-indigo-50/40 border-indigo-200 ring-1 ring-indigo-100 shadow-2xs'
                          : 'bg-slate-50/60 border-slate-200 hover:border-slate-300'
                      )}
                    >
                      <label className="flex items-start gap-2.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            if (isChecked) {
                              setSelectedModules(selectedModules.filter(id => id !== mod.id));
                            } else {
                              setSelectedModules([...selectedModules, mod.id]);
                            }
                          }}
                          className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-xs font-bold text-slate-800">{mod.label}</span>
                            <span className={cn(
                              "text-[10px] font-black px-1.5 py-0.5 rounded border",
                              isChecked
                                ? "bg-indigo-100 text-indigo-800 border-indigo-200"
                                : "bg-slate-100 text-slate-500 border-slate-200"
                            )}>
                              {currencySymbol}{currentPrice}/term
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-500 leading-normal mt-0.5">
                            {mod.desc}
                          </p>
                        </div>
                      </label>

                      {/* Adjustable Price Input on each module */}
                      <div
                        className="pt-2 border-t border-slate-200/60 flex items-center justify-between gap-2 bg-white/80 -mx-1 -mb-1 px-2.5 py-1.5 rounded-xl"
                        onClick={e => e.stopPropagation()}
                      >
                        <span className="text-[9px] font-black uppercase text-slate-500 tracking-wider">
                          Adjust Module Fee:
                        </span>
                        <div className="flex items-center gap-1">
                          <span className="text-xs font-bold text-slate-600">{currencySymbol}</span>
                          <input
                            type="number"
                            min="0"
                            step="10"
                            value={currentPrice}
                            onChange={(e) => updateModulePrice(mod.id, parseFloat(e.target.value) || 0)}
                            className="w-20 px-2 py-1 text-xs font-black text-slate-900 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-hidden text-right shadow-2xs"
                          />
                          <span className="text-[9px] text-slate-400 font-medium">/term</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Premium Add-ons & Professional Services */}
            <div className="space-y-3 pt-2 border-t border-slate-100">
              <div>
                <h3 className="text-xs font-black uppercase text-slate-800 tracking-wider">
                  Professional Services & Implementation Add-ons
                </h3>
                <p className="text-[10px] text-slate-500">
                  High-margin services that guarantee client satisfaction and successful onboarding.
                </p>
              </div>

              <div className="space-y-2">
                {ADD_ON_SERVICES.map(addon => {
                  const isChecked = selectedAddOns.includes(addon.id);
                  return (
                    <label
                      key={addon.id}
                      className={cn(
                        'flex items-center justify-between p-3 rounded-xl border text-left cursor-pointer transition select-none',
                        isChecked
                          ? 'bg-emerald-50/50 border-emerald-200'
                          : 'bg-slate-50/50 border-slate-200 hover:border-slate-300'
                      )}
                    >
                      <div className="flex items-center gap-2.5">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            if (isChecked) {
                              setSelectedAddOns(selectedAddOns.filter(id => id !== addon.id));
                            } else {
                              setSelectedAddOns([...selectedAddOns, addon.id]);
                            }
                          }}
                          className="rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                        />
                        <div>
                          <span className="text-xs font-bold text-slate-800">{addon.label}</span>
                          <p className="text-[10px] text-slate-500">{addon.desc}</p>
                        </div>
                      </div>
                      <span className="text-xs font-black text-emerald-700 shrink-0 ml-2">
                        +{currencySymbol}{addon.price}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Commercial Incentive / Discount */}
            <div className="p-4 bg-amber-50/60 rounded-2xl border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="text-xs font-black text-amber-900 block">
                  Commercial Incentive / Promotional Discount
                </span>
                <span className="text-[10px] text-amber-700">
                  Offer an early-adoption incentive to close deals within 7 business days.
                </span>
              </div>
              <div className="flex items-center gap-2">
                {[0, 5, 10, 15, 20].map(pct => (
                  <button
                    key={pct}
                    onClick={() => setDiscountPercent(pct)}
                    className={cn(
                      'px-2.5 py-1 rounded-lg text-xs font-bold cursor-pointer transition',
                      discountPercent === pct
                        ? 'bg-amber-600 text-white font-black'
                        : 'bg-white text-amber-900 border border-amber-200 hover:bg-amber-100'
                    )}
                  >
                    {pct}% Off
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Right Live Summary Box */}
          <div className="lg:col-span-4 space-y-5 sticky top-6">
            <div className="bg-slate-900 text-white rounded-3xl p-6 shadow-md border border-slate-800 space-y-5">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <span className="text-[10px] font-black uppercase text-indigo-400 tracking-wider">
                  COMMERCIAL VALUATION
                </span>
                <span className="text-[10px] font-bold text-slate-400 font-mono">
                  REF: {proposalRef}
                </span>
              </div>

              <div>
                <span className="text-xs text-slate-400 block">Net Termly Investment</span>
                <div className="text-3xl font-black text-white mt-0.5 tracking-tight">
                  {currencySymbol}{pricingCalculation.finalTermly.toLocaleString()}
                  <span className="text-xs font-normal text-slate-400 ml-1">/ Term</span>
                </div>
                <p className="text-[11px] text-emerald-400 font-bold mt-1">
                  or {currencySymbol}{pricingCalculation.finalAnnual.toLocaleString()} / Academic Year (3 Terms)
                </p>
              </div>

              {/* Breakdown Table */}
              <div className="space-y-2 text-xs border-t border-slate-800 pt-3">
                <div className="flex justify-between text-slate-300">
                  <span>Base License ({tier})</span>
                  <span className="font-bold">{currencySymbol}{pricingCalculation.tierBase}</span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>{selectedModules.length} Modules Selected</span>
                  <span className="font-bold">+{currencySymbol}{pricingCalculation.modulesCost}</span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>{selectedAddOns.length} Professional Add-ons</span>
                  <span className="font-bold">+{currencySymbol}{pricingCalculation.addOnsCost}</span>
                </div>
                {discountPercent > 0 && (
                  <div className="flex justify-between text-amber-400 font-bold">
                    <span>Discount Applied ({discountPercent}%)</span>
                    <span>-{discountPercent}%</span>
                  </div>
                )}
                <div className="pt-2 border-t border-slate-800/80 flex justify-between text-slate-300">
                  <span>Rate per Student/Term</span>
                  <span className="font-bold text-indigo-300">{currencySymbol}{pricingCalculation.perStudentPerTerm}</span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>Rate per Student/Day</span>
                  <span className="font-bold text-emerald-300">{currencySymbol}{pricingCalculation.perStudentPerDay} / day</span>
                </div>
              </div>

              <div className="space-y-2 pt-2">
                <button
                  onClick={() => {
                    handleSaveProposal();
                    setActiveTab('document');
                  }}
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs uppercase tracking-wider rounded-xl transition cursor-pointer flex items-center justify-center gap-2 shadow-sm"
                >
                  <FileText className="w-4 h-4" />
                  <span>Generate Formal Document</span>
                </button>

                <button
                  onClick={handleSaveProposal}
                  className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl transition cursor-pointer flex items-center justify-center gap-2 border border-slate-700"
                >
                  <Save className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Save to Studio Library</span>
                </button>
              </div>
            </div>

            {/* Quick Pitch Tips */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-2.5">
              <span className="text-[10px] font-black uppercase text-indigo-600 tracking-wider block">
                CREATOR CLOSING STRATEGY
              </span>
              <p className="text-xs text-slate-700 font-semibold leading-relaxed">
                "Point out to the headmaster that <strong>{currencySymbol}{pricingCalculation.perStudentPerDay}/day</strong> per student is less than a single sheet of printed exam paper, while saving their staff 120 hours of manual grading."
              </p>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 3: FORMAL PROPOSAL DOCUMENT (PRINT & EXPORT VIEW)
      ========================================================================= */}
      {activeTab === 'document' && (
        <div className="space-y-6">
          {/* Action Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs print:hidden">
            <div className="flex items-center gap-2">
              <span className="text-xs font-black uppercase text-slate-700 tracking-wider">
                Formal Proposal Document
              </span>
              <span className="text-slate-300">·</span>
              <span className="text-xs text-slate-500">
                Ready for client board review, signature & printing
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleCopyProposalText}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5 text-slate-500" />
                <span>Copy Text</span>
              </button>
              <button
                onClick={handleCopyWhatsAppPitch}
                className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
              >
                <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                <span>Copy WhatsApp Pitch</span>
              </button>
              <button
                onClick={handleExportPDF}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black transition flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print / Download PDF</span>
              </button>
            </div>
          </div>

          {/* Actual Formal Document Sheet */}
          <div
            id="proposal-document-content"
            className="bg-white border border-slate-200 rounded-3xl p-8 sm:p-12 shadow-sm max-w-4xl mx-auto space-y-8 text-slate-800"
          >
            {/* Header / Letterhead with Official App Logo */}
            <div className="border-b-2 border-slate-900 pb-6 flex flex-col sm:flex-row justify-between items-start gap-4">
              <div className="flex items-start gap-4">
                <div
                  style={{ backgroundColor: '#ffffff', borderWidth: '0px', borderStyle: 'none' }}
                  className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-white p-1 flex items-center justify-center shrink-0 border-none"
                >
                  <img
                    src="/sch sphere logo1.png"
                    alt="SchoolSphere Official Logo"
                    style={{ borderColor: '#ffffff' }}
                    className="w-full h-full object-contain"
                    onError={(e) => {
                      (e.currentTarget as HTMLElement).style.display = 'none';
                    }}
                  />
                </div>
                <div>
                  <span className="text-2xl font-black text-slate-900 tracking-tighter uppercase block">
                    SCHOOLSPHERE ENTERPRISE
                  </span>
                  <span className="text-xs font-black text-indigo-600 tracking-widest uppercase block mt-0.5">
                    INSTITUTIONAL PLATFORM DIRECTORATE
                  </span>
                  <p className="text-[11px] text-slate-500 mt-2 font-medium">
                    Support & Engineering Directorate • amoakoemmanuel@hotmail.com<br />
                    Hotlines: 0551187045 / 0554234590 • Instance: schoolsphere-academy-live-prod
                  </p>
                </div>
              </div>

              <div className="text-left sm:text-right text-xs space-y-1">
                <span className="px-2.5 py-1 bg-slate-900 text-white text-[10px] font-black rounded uppercase tracking-wider inline-block">
                  OFFICIAL PROPOSAL
                </span>
                <p className="font-mono font-bold text-slate-700">{proposalRef}</p>
                <p className="text-slate-500 font-medium">
                  Date: {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
                <p className="text-slate-500 font-medium">
                  Valid Through: 30 Days from Issue
                </p>
              </div>
            </div>

            {/* Recipient Institution Box */}
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex flex-col sm:flex-row justify-between items-start gap-4">
              <div>
                <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider block">
                  PROPOSAL PREPARED FOR:
                </span>
                <h3 className="text-base font-black text-slate-900 mt-0.5">
                  {schoolName}
                </h3>
                <p className="text-xs text-slate-700 font-bold">
                  Attn: {contactPerson}
                </p>
                <p className="text-xs text-slate-500">
                  {location}
                </p>
              </div>

              <div className="text-left sm:text-right text-xs">
                <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider block">
                  INSTITUTION PROFILE:
                </span>
                <p className="font-bold text-slate-800 mt-0.5">{studentsCount} Enrolled Students</p>
                <p className="text-slate-600 font-medium">Tier: {tier} Edition</p>
                <p className="text-slate-600 font-medium">{contactPhone}</p>
              </div>
            </div>

            {/* Section 1: Executive Summary */}
            <div className="space-y-2">
              <h4 className="text-xs font-black uppercase text-slate-900 tracking-wider border-b border-slate-100 pb-1">
                1. Executive Summary & Objective
              </h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                SchoolSphere is pleased to present this institutional proposal to deploy our unified, offline-first School Management System for <strong>{schoolName}</strong>. Traditional school operations are frequently burdened by manual marks tabulation, lost physical student registers, fee collection arrears, and delayed terminal report releases. SchoolSphere replaces these fragmented workflows with an integrated, bank-grade cloud platform designed specifically for the rigorous academic and financial requirements of modern schools.
              </p>
            </div>

            {/* Section 2: Authorized Modules Scope */}
            <div className="space-y-3">
              <h4 className="text-xs font-black uppercase text-slate-900 tracking-wider border-b border-slate-100 pb-1 flex items-center justify-between">
                <span>2. Authorized Scope of Work & Solution Modules</span>
                <span className="text-[10px] font-bold text-slate-500 lowercase font-mono">
                  {selectedModules.length} modules activated
                </span>
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                {selectedModules.map(modId => {
                  const m = DEFAULT_MODULES.find(x => x.id === modId);
                  const price = getModulePrice(modId);
                  return (
                    <div key={modId} className="p-3 rounded-2xl border border-slate-200/80 bg-slate-50/60 flex flex-col justify-between gap-1.5 shadow-2xs">
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-slate-900 block">{m?.label || modId}</span>
                          <span className="text-[10px] font-black text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-md shrink-0">
                            {currencySymbol}{price}/term
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-500 mt-1 leading-normal">{m?.desc}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Section 3: Professional Services & Implementation Add-ons */}
            {selectedAddOns.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-black uppercase text-slate-900 tracking-wider border-b border-slate-100 pb-1">
                  3. Dedicated Implementation & Professional Services Included
                </h4>
                <div className="space-y-1.5 text-xs">
                  {selectedAddOns.map(addId => {
                    const a = ADD_ON_SERVICES.find(x => x.id === addId);
                    return (
                      <div key={addId} className="flex items-start justify-between p-2 rounded-lg bg-emerald-50/40 border border-emerald-100">
                        <div>
                          <span className="font-bold text-slate-900">{a?.label}</span>
                          <p className="text-[10px] text-slate-600">{a?.desc}</p>
                        </div>
                        <span className="font-bold text-emerald-800 shrink-0 ml-2">{currencySymbol}{a?.price}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Section 4: Commercial Investment Schedule */}
            <div className="space-y-3">
              <h4 className="text-xs font-black uppercase text-slate-900 tracking-wider border-b border-slate-100 pb-1">
                4. Commercial Investment & Fee Schedule
              </h4>
              <div className="border border-slate-200 rounded-2xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-black uppercase text-[10px]">
                    <tr>
                      <th className="p-3">Item / Description</th>
                      <th className="p-3 text-right">Scope</th>
                      <th className="p-3 text-right">Termly Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    <tr>
                      <td className="p-3 font-bold text-slate-800">
                        SchoolSphere Platform License ({tier} Edition)
                      </td>
                      <td className="p-3 text-right text-slate-500">{studentsCount} Students</td>
                      <td className="p-3 text-right font-bold text-slate-800">{currencySymbol}{pricingCalculation.tierBase}</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-semibold text-slate-700">
                        Module Licensing Suite ({selectedModules.length} Modules)
                      </td>
                      <td className="p-3 text-right text-slate-500">All Authorized Depts</td>
                      <td className="p-3 text-right font-bold text-slate-800">+{currencySymbol}{Math.round(pricingCalculation.modulesCost * 0.4)}</td>
                    </tr>
                    {selectedAddOns.length > 0 && (
                      <tr>
                        <td className="p-3 font-semibold text-slate-700">
                          Setup, Training & Add-on Services
                        </td>
                        <td className="p-3 text-right text-slate-500">{selectedAddOns.length} Deliverables</td>
                        <td className="p-3 text-right font-bold text-slate-800">+{currencySymbol}{Math.round(pricingCalculation.addOnsCost / 3)}</td>
                      </tr>
                    )}
                    {discountPercent > 0 && (
                      <tr className="bg-amber-50/50 text-amber-900">
                        <td className="p-3 font-bold">
                          Promotional Onboarding Rebate ({discountPercent}%)
                        </td>
                        <td className="p-3 text-right">Term 1 Special</td>
                        <td className="p-3 text-right font-black">-{discountPercent}% Applied</td>
                      </tr>
                    )}
                    <tr className="bg-slate-900 text-white font-black">
                      <td className="p-3">Total Net Termly Investment</td>
                      <td className="p-3 text-right text-indigo-300 font-mono text-[10px]">Billed per term</td>
                      <td className="p-3 text-right text-base text-emerald-300">
                        {currencySymbol}{pricingCalculation.finalTermly.toLocaleString()}
                      </td>
                    </tr>
                    <tr className="bg-slate-100 font-bold text-slate-700 text-[11px]">
                      <td className="p-2.5">Total Annual Investment (3 Terms)</td>
                      <td className="p-2.5 text-right text-slate-500">1 Academic Year</td>
                      <td className="p-2.5 text-right font-black text-slate-900">
                        {currencySymbol}{pricingCalculation.finalAnnual.toLocaleString()}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Section 5: Implementation Timeline */}
            <div className="space-y-2">
              <h4 className="text-xs font-black uppercase text-slate-900 tracking-wider border-b border-slate-100 pb-1">
                5. Rapid 72-Hour Turnkey Deployment Timeline
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="font-black text-indigo-600 block">Day 1: Setup & Migration</span>
                  <p className="text-[10px] text-slate-600 mt-1">Our engineers ingest your existing student registers and class lists.</p>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="font-black text-indigo-600 block">Day 2: Staff Workshop</span>
                  <p className="text-[10px] text-slate-600 mt-1">2-hour practical workshop certifying all teachers and bursars.</p>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="font-black text-indigo-600 block">Day 3: Live Go-Live</span>
                  <p className="text-[10px] text-slate-600 mt-1">Portal goes live with standby engineering support and parent notices.</p>
                </div>
              </div>
            </div>

            {/* Section 6: Acceptance & Authorization Sign-off Blocks */}
            <div className="pt-6 border-t-2 border-slate-900 space-y-6">
              <h4 className="text-xs font-black uppercase text-slate-900 tracking-wider">
                6. Commercial Acceptance & Mutual Authorization
              </h4>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                By signing below, both parties endorse the terms and commercial investment outlined in this proposal. SchoolSphere will initiate institutional provisioning upon receipt of this authorized agreement.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 pt-4">
                <div className="space-y-6">
                  <div>
                    <span className="text-[10px] font-black uppercase text-slate-400 block">
                      FOR THE INSTITUTION:
                    </span>
                    <p className="text-xs font-bold text-slate-900 mt-1">{schoolName}</p>
                  </div>
                  <div className="border-b border-slate-400 pt-6"></div>
                  <div className="text-[10px] text-slate-600 space-y-1">
                    <p>Authorized Signature: _________________________</p>
                    <p>Name: {contactPerson}</p>
                    <p>Official Stamp & Date: _________________________</p>
                  </div>
                </div>

                <div className="space-y-6">
                  <div>
                    <span className="text-[10px] font-black uppercase text-slate-400 block">
                      FOR SCHOOLSPHERE SOLUTIONS:
                    </span>
                    <p className="text-xs font-bold text-slate-900 mt-1">Creator Studio Directorate</p>
                  </div>
                  <div className="border-b border-slate-400 pt-6"></div>
                  <div className="text-[10px] text-slate-600 space-y-2">
                    <div className="flex items-center gap-2 p-2 bg-slate-50 border border-slate-200 rounded-xl w-fit">
                      <img
                        src="/sch sphere logo1.png"
                        alt="Official Seal"
                        className="w-5 h-5 object-contain"
                        onError={(e) => {
                          (e.currentTarget as HTMLElement).style.display = 'none';
                        }}
                      />
                      <span className="text-[9px] font-black uppercase tracking-wider text-indigo-700">
                        Authenticated Enterprise Issuance
                      </span>
                    </div>
                    <p>Authorized Signature: _________________________</p>
                    <p>Name: Director Emmanuel Mensah</p>
                    <p>Date: {new Date().toLocaleDateString('en-GB')}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 4: CLIENT ROI & SAVINGS CALCULATOR
      ========================================================================= */}
      {activeTab === 'roi' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-3xl p-6 sm:p-7 shadow-xs space-y-6">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
              <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl">
                <TrendingUp className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-black text-slate-900 tracking-tight">
                  Institutional ROI & Savings Visualizer
                </h2>
                <p className="text-xs text-slate-500">
                  Prove to the headmaster that SchoolSphere pays for itself through paper savings and fee recovery.
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-1">
                <div className="flex justify-between text-xs font-bold text-slate-700">
                  <span>Paper Reams Used Per Term (Boxes)</span>
                  <span className="text-indigo-600">{currencySymbol}{currentPaperReamsCost}</span>
                </div>
                <input
                  type="range"
                  min="500"
                  max="8000"
                  step="200"
                  value={currentPaperReamsCost}
                  onChange={e => setCurrentPaperReamsCost(parseInt(e.target.value))}
                  className="w-full accent-indigo-600 cursor-pointer"
                />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-xs font-bold text-slate-700">
                  <span>Printer Toner Cartridges Purchased Per Term</span>
                  <span className="text-indigo-600">{currencySymbol}{currentTonerCost}</span>
                </div>
                <input
                  type="range"
                  min="400"
                  max="6000"
                  step="200"
                  value={currentTonerCost}
                  onChange={e => setCurrentTonerCost(parseInt(e.target.value))}
                  className="w-full accent-indigo-600 cursor-pointer"
                />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-xs font-bold text-slate-700">
                  <span>Commercial Booklet Printing Fees (Report Cards & Slips)</span>
                  <span className="text-indigo-600">{currencySymbol}{currentReportPrintingFee}</span>
                </div>
                <input
                  type="range"
                  min="1000"
                  max="12000"
                  step="500"
                  value={currentReportPrintingFee}
                  onChange={e => setCurrentReportPrintingFee(parseInt(e.target.value))}
                  className="w-full accent-indigo-600 cursor-pointer"
                />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-xs font-bold text-slate-700">
                  <span>Estimated Uncollected School Fee Arrears Per Term</span>
                  <span className="text-rose-600">{currencySymbol}{uncollectedArrearsPerTerm.toLocaleString()}</span>
                </div>
                <input
                  type="range"
                  min="5000"
                  max="100000"
                  step="2500"
                  value={uncollectedArrearsPerTerm}
                  onChange={e => setUncollectedArrearsPerTerm(parseInt(e.target.value))}
                  className="w-full accent-rose-600 cursor-pointer"
                />
                <p className="text-[10px] text-slate-500 font-medium">
                  *Automated Mobile Money reminders and debt ledgers recover an estimated 22% of this abandoned tuition.
                </p>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-xs font-bold text-slate-700">
                  <span>Staff Hours Spent on Manual Grading & Broadsheet Compilation</span>
                  <span className="text-indigo-600">{staffHoursManualGrading} Hours</span>
                </div>
                <input
                  type="range"
                  min="20"
                  max="300"
                  step="10"
                  value={staffHoursManualGrading}
                  onChange={e => setStaffHoursManualGrading(parseInt(e.target.value))}
                  className="w-full accent-indigo-600 cursor-pointer"
                />
              </div>
            </div>
          </div>

          <div className="lg:col-span-5 space-y-5">
            <div className="bg-gradient-to-br from-emerald-900 to-teal-950 text-white rounded-3xl p-6 shadow-md border border-emerald-800 space-y-5">
              <div className="flex items-center justify-between pb-3 border-b border-emerald-800/80">
                <span className="text-[10px] font-black uppercase text-emerald-300 tracking-wider">
                  NET FINANCIAL IMPACT
                </span>
                <span className="text-[10px] bg-emerald-500/20 text-emerald-200 px-2 py-0.5 rounded font-black">
                  ROI: {roiMetrics.roiPercentage}%
                </span>
              </div>

              <div>
                <span className="text-xs text-emerald-200 block">Annual Net Economic Benefit</span>
                <div className="text-3xl font-black text-white mt-0.5 tracking-tight">
                  {currencySymbol}{roiMetrics.netAnnualSurplus.toLocaleString()}
                  <span className="text-xs font-normal text-emerald-300 ml-1">/ Year Surplus</span>
                </div>
                <p className="text-[11px] text-emerald-300 font-bold mt-1">
                  Pays for itself in just {roiMetrics.paybackDays} days of Term 1!
                </p>
              </div>

              <div className="space-y-2 text-xs border-t border-emerald-800/80 pt-3">
                <div className="flex justify-between text-emerald-100">
                  <span>Paper & Toner Saved / Term</span>
                  <span className="font-bold">+{currencySymbol}{roiMetrics.paperAndPrintSaved.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-emerald-100">
                  <span>Recovered Tuition Arrears / Term</span>
                  <span className="font-bold">+{currencySymbol}{roiMetrics.recoveredTuition.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-emerald-100">
                  <span>Value of Saved Staff Hours</span>
                  <span className="font-bold">+{currencySymbol}{roiMetrics.staffHoursValue.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-emerald-300 font-bold pt-2 border-t border-emerald-800/60">
                  <span>Gross Termly Benefit</span>
                  <span>+{currencySymbol}{roiMetrics.termlyEconomicBenefit.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-rose-300">
                  <span>Less SchoolSphere Termly Fee</span>
                  <span>-{currencySymbol}{pricingCalculation.finalTermly.toLocaleString()}</span>
                </div>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-3">
              <h3 className="text-xs font-black uppercase text-slate-800 tracking-wider">
                How to Present This to the Board
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed font-medium">
                "Sir, you are currently spending <strong>{currencySymbol}{roiMetrics.paperAndPrintSaved.toLocaleString()}</strong> every term on paper and toner alone. Our system costs <strong>{currencySymbol}{pricingCalculation.finalTermly.toLocaleString()}</strong>. Even if we didn't recover a single pesewa of unpaid fees, you are practically getting a world-class system for free."
              </p>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 5: OBJECTION PLAYBOOK & BATTLECARDS
      ========================================================================= */}
      {activeTab === 'objections' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs flex items-center justify-between">
            <div>
              <h2 className="text-base font-black text-slate-900 tracking-tight">
                Creator Objection Playbook & Battlecards
              </h2>
              <p className="text-xs text-slate-500">
                Word-for-word counter-arguments and live app demonstrations to overcome common client hesitations.
              </p>
            </div>
            <span className="text-xs font-black px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
              6 Core Battlecards
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {[
              {
                objection: '"Our teachers are not good with computers. They prefer paper."',
                verbal: 'We built SchoolSphere so that anyone who knows how to send a WhatsApp message can use it. It takes only 2 taps to mark attendance and 3 minutes to enter grades.',
                demo: 'Open Results Terminal and show how clean the marks grid is with automatic grade conversion.',
                closing: '"If we conduct a 90-minute workshop and certify your teachers on Day 2, will you be comfortable proceeding?"'
              },
              {
                objection: '"What if the internet goes off? Internet in our town is very unstable."',
                verbal: 'SchoolSphere is engineered with an offline-first architecture. Teachers can continue entering marks and attendance with zero internet. The moment a phone or modem reconnects, it syncs silently to the cloud.',
                demo: 'Turn off Wi-Fi or show the Local Offline Storage indicator working with zero freeze.',
                closing: '"Does any other software you looked at work completely offline without freezing?"'
              },
              {
                objection: '"We already have an Excel sheet that has worked for years."',
                verbal: 'Excel is great for one person, but 15 teachers editing separate Excel sheets causes lost files, wrong formulas, and calculation discrepancies. Excel cannot send SMS receipts to parents or process Mobile Money.',
                demo: 'Show the Broadsheet Exam Analysis visualizer with automatic ranking order.',
                closing: '"How many hours did your exam committee spend fixing broken Excel formulas last term?"'
              },
              {
                objection: '"School fees records are sensitive. What if our financial data leaks?"',
                verbal: 'Every school instance is strictly isolated in dedicated encrypted PostgreSQL containers. Teachers and students have zero access to financial ledgers. Only the Headmaster and Accountant hold keys.',
                demo: 'Show Role-Based Access Control where non-accountants cannot see the fee tabs.',
                closing: '"Isn\'t keeping paper receipt books and unencrypted Excel files on an office desktop far more vulnerable to theft?"'
              },
              {
                objection: '"Parents in our community are poor; they won\'t use a mobile app."',
                verbal: 'Parents do not need an app or internet! Automated SMS receipts and balance notices arrive directly on basic push-button "yam" phones. Plus, they can pay tuition using standard USSD Mobile Money (*170#).',
                demo: 'Show the MoMo Subscriber verification screen with instant SMS notification.',
                closing: '"Every parent already has Mobile Money on their phone to send money, right?"'
              },
              {
                objection: '"It is too expensive for our school right now."',
                verbal: 'When you factor in the ₵5,000 you spend on paper and the ₵20,000 in uncollected fees each term, SchoolSphere costs less than ₵0.40 per student per day. It is an investment that recovers cash, not an expense.',
                demo: 'Open the ROI Calculator and show their net annual cash surplus.',
                closing: '"If we give you a 10% early onboarding discount and let you pay per term, can we begin this weekend?"'
              }
            ].map((card, idx) => (
              <div key={idx} className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-4">
                <div className="flex items-start gap-2.5">
                  <div className="w-7 h-7 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center font-black text-xs shrink-0 mt-0.5">
                    ?
                  </div>
                  <h3 className="text-sm font-black text-slate-900 leading-snug">
                    {card.objection}
                  </h3>
                </div>

                <div className="space-y-3 text-xs">
                  <div className="p-3 bg-indigo-50/60 rounded-xl border border-indigo-100">
                    <span className="text-[10px] font-black uppercase text-indigo-700 block mb-0.5">
                      ⚡ Verbal Soundbite (Say This Immediately)
                    </span>
                    <p className="text-slate-800 font-semibold leading-relaxed">
                      "{card.verbal}"
                    </p>
                  </div>

                  <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                    <span className="text-[10px] font-black uppercase text-slate-500 block mb-0.5">
                      🔍 Proof in App (What to Show on Screen)
                    </span>
                    <p className="text-slate-700 font-medium">
                      {card.demo}
                    </p>
                  </div>

                  <div className="p-2.5 bg-emerald-50/60 rounded-xl border border-emerald-100">
                    <span className="text-[10px] font-black uppercase text-emerald-700 block mb-0.5">
                      🎯 Closing Question (Pivot Back to Deal)
                    </span>
                    <p className="text-emerald-950 font-bold italic">
                      {card.closing}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 6: PROPOSALS LIBRARY & PIPELINE
      ========================================================================= */}
      {activeTab === 'library' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-black text-slate-900 tracking-tight">
                Commercial Proposals Library & Deal Funnel
              </h2>
              <p className="text-xs text-slate-500">
                Manage all institutional proposals, track presentation status, and reload past quotations.
              </p>
            </div>

            <button
              onClick={() => {
                setSchoolName('');
                setContactPerson('');
                setActiveTab('architect');
              }}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition cursor-pointer"
            >
              <Calculator className="w-4 h-4" />
              <span>Create New Proposal</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {savedProposals.map(prop => (
              <div
                key={prop.id}
                className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4 hover:border-indigo-300 transition"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-black text-slate-900">{prop.schoolName}</h3>
                    <p className="text-xs text-slate-500 font-medium">
                      Attn: {prop.contactPerson} • {prop.location}
                    </p>
                  </div>
                  <span className={cn(
                    'text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full border',
                    prop.status === 'Deal Won'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : prop.status === 'Presented'
                      ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                      : 'bg-amber-50 text-amber-700 border-amber-200'
                  )}>
                    {prop.status}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-xs p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <div>
                    <span className="text-[10px] text-slate-400 block font-bold">ROSTER</span>
                    <span className="font-bold text-slate-800">{prop.studentsCount} Students</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block font-bold">TERMLY FEE</span>
                    <span className="font-bold text-indigo-600">{currencySymbol}{prop.totalPerTerm?.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block font-bold">ANNUAL VALUE</span>
                    <span className="font-bold text-emerald-600">{currencySymbol}{prop.totalAnnual?.toLocaleString()}</span>
                  </div>
                </div>

                {prop.notes && (
                  <p className="text-[11px] text-slate-600 font-medium italic bg-slate-50/50 p-2 rounded-lg">
                    "{prop.notes}"
                  </p>
                )}

                <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                  <span className="text-[10px] text-slate-400">Created {prop.createdAt}</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleLoadProposal(prop)}
                      className="px-3 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg font-bold text-xs transition cursor-pointer flex items-center gap-1"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>Open Document</span>
                    </button>
                    <button
                      onClick={() => handleDeleteProposal(prop.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                      title="Delete Proposal"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
