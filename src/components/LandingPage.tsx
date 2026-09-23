import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  GraduationCap, 
  Users, 
  Layers, 
  ShieldCheck, 
  FileText, 
  CreditCard, 
  ArrowRight, 
  Check, 
  Sparkles, 
  CheckCircle2, 
  ChevronRight, 
  Star, 
  Sliders, 
  UserCheck, 
  BarChart3, 
  Database, 
  Bell, 
  Phone, 
  Mail, 
  MapPin, 
  Lock, 
  Key, 
  RefreshCcw, 
  ArrowUpRight,
  School,
  Split,
  BookOpen,
  CalendarCheck,
  Zap,
  HelpCircle,
  Clock,
  Laptop
} from 'lucide-react';
import { cn } from '../lib/utils';

interface LandingPageProps {
  onEnterSchoolPortal: () => void;
  onOpenActivation: () => void;
  onOpenCreatorLogin: () => void;
  onOpenAbout: () => void;
  onOpenContact: () => void;
  onOpenVideoTour: () => void;
  isLicensed: boolean;
}

export default function LandingPage({
  onEnterSchoolPortal,
  onOpenActivation,
  onOpenCreatorLogin,
  onOpenAbout,
  onOpenContact,
  onOpenVideoTour,
  isLicensed
}: LandingPageProps) {
  // Active demo sandbox tab
  const [activeTab, setActiveTab] = useState<'class_creator' | 'terminal' | 'fees' | 'attendance'>('class_creator');

  // Simulated live class balancing state
  const [balanceMetric, setBalanceMetric] = useState<'balanced' | 'rebalancing'>('balanced');
  const [classFilter, setClassFilter] = useState<'5A' | '5B'>('5A');

  // Interactive FAQ Accordion
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const handleRunRebalance = () => {
    setBalanceMetric('rebalancing');
    setTimeout(() => {
      setBalanceMetric('balanced');
    }, 600);
  };

  const faqs = [
    {
      q: "How does the Intelligent Class Placement algorithm work?",
      a: "Just like Class Creator, SchoolSphere uses educator-crafted 'Teacher Logic' to evaluate academic performance, gender balance, behavioral compatibility, and special educational needs (IEP). It automatically enforces student separations (e.g. separating disruptive peer pairings) and accommodates twin or friendship requests while ensuring equal distribution across all classes."
    },
    {
      q: "Can we import our existing student and teacher lists from Excel / CSV?",
      a: "Yes. SchoolSphere includes a 1-click CSV and Excel roster importer. You can upload your current student rolls with Guardian contact info, previous academic scores, and class histories. The system maps fields automatically and validates data before committing to the database."
    },
    {
      q: "Does SchoolSphere work offline if our school loses internet connectivity?",
      a: "Yes. Built with local IndexedDB client caching and Supabase background reconciliation, your teachers can take attendance, record grades, and print report cards even during network blackouts. As soon as connectivity returns, all records sync seamlessly to the cloud."
    },
    {
      q: "How are school fees collected and tracked?",
      a: "SchoolSphere integrates directly with Mobile Money (MTN MoMo, Telecel Cash, AT Money) and Paystack. Guardians receive automated SMS notifications with direct payment links, and paid amounts are immediately credited to the student's ledger with instant digital receipts."
    },
    {
      q: "How is student data protected and isolated between schools?",
      a: "Every school tenant is strictly isolated using PostgreSQL Row Level Security (RLS) on Supabase. Administrators and staff can only access data belonging to their verified school_id, meeting international FERPA and data privacy standards."
    }
  ];

  return (
    <div className="min-h-screen w-full bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans selection:bg-indigo-500 selection:text-white">
      
      {/* Top Global Announcement Banner */}
      <div className="w-full bg-slate-900 text-white text-xs py-2 px-4 border-b border-slate-800 flex items-center justify-between text-center relative z-20">
        <div className="max-w-7xl mx-auto w-full flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 mx-auto sm:mx-0">
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300 font-semibold text-[11px] border border-indigo-500/30">
              <Sparkles className="w-3 h-3 text-indigo-400" />
              SchoolSphere 3.1
            </span>
            <span className="hidden sm:inline text-slate-300 text-[11px]">
              Intelligent Class Creator & WAEC Standard Terminals Powered by Supabase Cloud.
            </span>
          </div>
          
          <div className="hidden md:flex items-center gap-4 text-[11px] font-semibold text-slate-400">
            <button 
              onClick={onOpenVideoTour} 
              className="hover:text-white transition-colors flex items-center gap-1 cursor-pointer"
            >
              Watch 2-Min Tour <ArrowRight className="w-3 h-3" />
            </button>
            <span className="text-slate-600">|</span>
            <span className="text-emerald-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              System Operational
            </span>
          </div>
        </div>
      </div>

      {/* Main Sticky Navigation Header */}
      <header className="sticky top-0 z-40 w-full bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          
          {/* Logo Brand */}
          <div className="flex items-center gap-3 cursor-pointer select-none" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <div className="w-10 h-10 rounded-lg bg-indigo-600 text-white flex items-center justify-center shadow-xs">
              <School className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5 leading-none">
                <span className="font-bold text-lg text-slate-900 dark:text-slate-100 tracking-tight">School<span className="text-indigo-600 dark:text-indigo-400">Sphere</span></span>
                <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">3.1</span>
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium tracking-tight mt-0.5">Intelligent Class & School Suite</p>
            </div>
          </div>

          {/* Nav Links */}
          <nav className="hidden lg:flex items-center gap-6 text-xs font-semibold text-slate-600 dark:text-slate-300">
            <a href="#class-creator" className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">Class Placement</a>
            <a href="#terminals" className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">Grade Terminals</a>
            <a href="#billing" className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">Fees & MoMo</a>
            <a href="#how-it-works" className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">How It Works</a>
            <a href="#security" className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">Security</a>
            <a href="#faq" className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">FAQ</a>
          </nav>

          {/* Action CTAs */}
          <div className="flex items-center gap-2.5">
            <button
              onClick={onOpenActivation}
              className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 transition-all cursor-pointer"
            >
              <Key className="w-3.5 h-3.5 text-indigo-500" />
              <span>{isLicensed ? 'License Info' : 'Activate School'}</span>
            </button>

            <button
              onClick={onEnterSchoolPortal}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98] rounded-lg shadow-xs transition-all cursor-pointer"
            >
              <span>Enter School Portal</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

        </div>
      </header>

      {/* HERO SECTION - Inspired by Class Creator */}
      <section className="relative overflow-hidden pt-12 pb-16 lg:pt-20 lg:pb-24 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="text-center max-w-3xl mx-auto space-y-6">
            
            {/* Tag Badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 text-xs font-semibold">
              <GraduationCap className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span>Made by Educators for High-Performing Schools</span>
            </div>

            {/* Main Headline */}
            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black text-slate-900 dark:text-slate-50 tracking-tight leading-[1.1]">
              Balanced Class Lists. <br className="hidden sm:inline" />
              <span className="text-indigo-600 dark:text-indigo-400">Automated Reports.</span> <br className="hidden sm:inline" />
              Effortless School Management.
            </h1>

            {/* Subtitle */}
            <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 font-normal leading-relaxed max-w-2xl mx-auto">
              Say goodbye to sticky notes, spreadsheet chaos, and 3-week grading marathons. 
              SchoolSphere empowers principals and teachers to create perfectly balanced classes, 
              generate WAEC-standard terminal reports, and track fees with real-time Supabase cloud sync.
            </p>

            {/* Primary Action Button Cluster */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <button
                onClick={onEnterSchoolPortal}
                className="w-full sm:w-auto px-6 py-3.5 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-sm hover:shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>Launch School Portal</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <button
                onClick={onOpenActivation}
                className="w-full sm:w-auto px-6 py-3.5 text-sm font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-700 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <Key className="w-4 h-4 text-indigo-500" />
                <span>Activate School License</span>
              </button>

              <button
                onClick={() => {
                  const el = document.getElementById('class-creator');
                  el?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="w-full sm:w-auto px-5 py-3.5 text-sm font-semibold text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <span>Explore Live Demo</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Trust Metrics Bar */}
            <div className="pt-8 border-t border-slate-100 dark:border-slate-800/80 grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto text-left sm:text-center">
              <div>
                <p className="text-2xl sm:text-3xl font-black font-mono tabular-nums text-slate-900 dark:text-slate-100">50,000+</p>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-0.5">Students Placed & Managed</p>
              </div>
              <div>
                <p className="text-2xl sm:text-3xl font-black font-mono tabular-nums text-indigo-600 dark:text-indigo-400">3 Wks → 5m</p>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-0.5">Report & Roster Creation</p>
              </div>
              <div>
                <p className="text-2xl sm:text-3xl font-black font-mono tabular-nums text-slate-900 dark:text-slate-100">100%</p>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-0.5">RLS Tenant Isolation</p>
              </div>
              <div>
                <p className="text-2xl sm:text-3xl font-black font-mono tabular-nums text-emerald-600 dark:text-emerald-400">99.98%</p>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-0.5">Supabase Cloud Uptime</p>
              </div>
            </div>

          </div>

          {/* INTERACTIVE HERO SHOWCASE - LIVE SANDBOX */}
          <div id="class-creator" className="mt-14 max-w-5xl mx-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl overflow-hidden">
            
            {/* Showcase Header with Real-time Tab Controls */}
            <div className="bg-slate-100 dark:bg-slate-800/60 p-3 sm:p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className="flex gap-1.5 mr-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-slate-300 dark:bg-slate-700" />
                  <div className="w-2.5 h-2.5 rounded-full bg-slate-300 dark:bg-slate-700" />
                  <div className="w-2.5 h-2.5 rounded-full bg-slate-300 dark:bg-slate-700" />
                </div>
                <span className="text-xs font-mono font-bold text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                  <Database className="w-3.5 h-3.5 text-indigo-500" />
                  SchoolSphere Core Engine
                </span>
              </div>

              {/* Segmented Showcase Tabs */}
              <div className="flex items-center gap-1 bg-white dark:bg-slate-900 p-1 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold overflow-x-auto">
                <button
                  onClick={() => setActiveTab('class_creator')}
                  className={cn(
                    "px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap",
                    activeTab === 'class_creator' 
                      ? "bg-indigo-600 text-white shadow-xs" 
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  )}
                >
                  <Split className="w-3.5 h-3.5" />
                  <span>Class Placement</span>
                </button>

                <button
                  onClick={() => setActiveTab('terminal')}
                  className={cn(
                    "px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap",
                    activeTab === 'terminal' 
                      ? "bg-indigo-600 text-white shadow-xs" 
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  )}
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Terminal Reports</span>
                </button>

                <button
                  onClick={() => setActiveTab('fees')}
                  className={cn(
                    "px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap",
                    activeTab === 'fees' 
                      ? "bg-indigo-600 text-white shadow-xs" 
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  )}
                >
                  <CreditCard className="w-3.5 h-3.5" />
                  <span>Fees & MoMo</span>
                </button>

                <button
                  onClick={() => setActiveTab('attendance')}
                  className={cn(
                    "px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap",
                    activeTab === 'attendance' 
                      ? "bg-indigo-600 text-white shadow-xs" 
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  )}
                >
                  <CalendarCheck className="w-3.5 h-3.5" />
                  <span>RFID Attendance</span>
                </button>
              </div>
            </div>

            {/* Showcase Body Content */}
            <div className="p-4 sm:p-6 lg:p-8 bg-slate-50/50 dark:bg-slate-950/40">
              
              {/* TAB 1: INTELLIGENT CLASS CREATOR (Inspired by ClassCreator.io) */}
              {activeTab === 'class_creator' && (
                <div className="space-y-6">
                  
                  {/* Controls & Algorithmic Summary Bar */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Grade 5 Cohort Placement</h3>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                          <CheckCircle2 className="w-3 h-3" />
                          Balanced Cohort
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">58 Students • 2 Stream Sections (5A Emerald & 5B Sapphire)</p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleRunRebalance}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 text-xs font-semibold transition-colors cursor-pointer"
                      >
                        <RefreshCcw className={cn("w-3.5 h-3.5", balanceMetric === 'rebalancing' && "animate-spin text-indigo-600")} />
                        <span>{balanceMetric === 'rebalancing' ? 'Optimizing...' : 'Run Teacher Logic'}</span>
                      </button>

                      <div className="flex rounded-md border border-slate-200 dark:border-slate-700 p-0.5 bg-slate-100 dark:bg-slate-800 text-xs font-semibold">
                        <button
                          onClick={() => setClassFilter('5A')}
                          className={cn("px-2.5 py-1 rounded transition-colors cursor-pointer", classFilter === '5A' ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xs" : "text-slate-500")}
                        >
                          View 5A
                        </button>
                        <button
                          onClick={() => setClassFilter('5B')}
                          className={cn("px-2.5 py-1 rounded transition-colors cursor-pointer", classFilter === '5B' ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xs" : "text-slate-500")}
                        >
                          View 5B
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Real-Time Balance Analytics Comparison Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="p-3.5 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800">
                      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
                        <span>Gender Parity</span>
                        <span className="font-mono font-bold text-slate-800 dark:text-slate-200">50% / 50%</span>
                      </div>
                      <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-xs overflow-hidden flex">
                        <div className="h-full bg-indigo-500 w-1/2" title="Female: 14" />
                        <div className="h-full bg-cyan-500 w-1/2" title="Male: 15" />
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1.5">14 Girls • 15 Boys per section</p>
                    </div>

                    <div className="p-3.5 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800">
                      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
                        <span>Academic Spread</span>
                        <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">Normal Bell Curve</span>
                      </div>
                      <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-xs overflow-hidden flex">
                        <div className="h-full bg-emerald-500 w-[30%]" title="Advanced: 30%" />
                        <div className="h-full bg-indigo-500 w-[50%]" title="Proficient: 50%" />
                        <div className="h-full bg-amber-500 w-[20%]" title="Developing: 20%" />
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1.5">9 High • 15 Mid • 5 Support</p>
                    </div>

                    <div className="p-3.5 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800">
                      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
                        <span>Behavior Profile</span>
                        <span className="font-mono font-bold text-slate-800 dark:text-slate-200">Low Friction</span>
                      </div>
                      <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-xs overflow-hidden">
                        <div className="h-full bg-indigo-600 w-[92%]" />
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1.5">Zero conflicting peer pairs</p>
                    </div>

                    <div className="p-3.5 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800">
                      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
                        <span>Teacher Logic Pairings</span>
                        <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">12 Rules Satisfied</span>
                      </div>
                      <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-xs overflow-hidden">
                        <div className="h-full bg-emerald-500 w-full" />
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1.5">Twin & Separations honored</p>
                    </div>
                  </div>

                  {/* Student Placement Roster Table */}
                  <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-slate-900 dark:text-slate-100">
                          {classFilter === '5A' ? 'Class 5A (Emerald Section)' : 'Class 5B (Sapphire Section)'}
                        </span>
                        <span className="text-[11px] font-mono text-slate-500">29 Students Enrolled</span>
                      </div>
                      <span className="text-[11px] text-slate-400">Class Teacher: {classFilter === '5A' ? 'Mrs. Eunice Darko' : 'Mr. Kwesi Osei'}</span>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 border-b border-slate-200 dark:border-slate-800 font-medium">
                          <tr>
                            <th className="px-4 py-2.5">Student</th>
                            <th className="px-4 py-2.5">Academic Band</th>
                            <th className="px-4 py-2.5">Behavior Index</th>
                            <th className="px-4 py-2.5">Teacher Logic Tags</th>
                            <th className="px-4 py-2.5 text-right">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                          {[
                            { name: 'Kofi Mensah', id: 'SCH-501', gender: 'M', band: 'Advanced (Grade A)', behavior: 'Exemplary', tag: 'Paired: Kwame', status: 'Locked' },
                            { name: 'Abena Serwaa', id: 'SCH-502', gender: 'F', band: 'Advanced (Grade A)', behavior: 'Leadership', tag: 'Class Prefect Candidate', status: 'Placed' },
                            { name: 'Emmanuel Asante', id: 'SCH-503', gender: 'M', band: 'Proficient (Grade B)', behavior: 'Standard', tag: 'Separated: Kelvin', status: 'Placed' },
                            { name: 'Grace Addo', id: 'SCH-504', gender: 'F', band: 'Proficient (Grade B)', behavior: 'Cooperative', tag: 'Math Enrichment', status: 'Placed' },
                            { name: 'Nana Yaw Boateng', id: 'SCH-505', gender: 'M', band: 'Developing (Support)', behavior: 'Requires Focus', tag: 'IEP Support Assigned', status: 'Balanced' }
                          ].map((s, idx) => (
                            <tr key={idx} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2.5">
                                  <div className="w-7 h-7 rounded-md bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-100 dark:border-indigo-900 text-indigo-700 dark:text-indigo-300 font-bold flex items-center justify-center text-[10px]">
                                    {s.name[0]}
                                  </div>
                                  <div>
                                    <div className="font-bold text-slate-800 dark:text-slate-200">{s.name}</div>
                                    <div className="text-[10px] font-mono text-slate-400">{s.id} • {s.gender === 'M' ? 'Male' : 'Female'}</div>
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <span className={cn(
                                  "text-[11px] font-semibold px-2 py-0.5 rounded-md",
                                  s.band.includes('Advanced') && "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60",
                                  s.band.includes('Proficient') && "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800/60",
                                  s.band.includes('Developing') && "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-200 dark:border-amber-800/60"
                                )}>
                                  {s.band}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-slate-600 dark:text-slate-400 font-medium">{s.behavior}</td>
                              <td className="px-4 py-3">
                                <span className="inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                                  {s.tag}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right">
                                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                                  <Check className="w-3 h-3" />
                                  {s.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                </div>
              )}

              {/* TAB 2: TERMINAL REPORTS & GRADING */}
              {activeTab === 'terminal' && (
                <div className="space-y-4">
                  <div className="p-5 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 px-2 py-0.5 rounded border border-indigo-200 dark:border-indigo-800">WAEC / GES STANDARD</span>
                        <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100">Continuous Assessment Terminal Report Sheet</h4>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">Student: <span className="font-bold text-slate-700 dark:text-slate-300">Akua Afriyie</span> • JHS 2 • Term 1 Assessment (30% CA + 70% Exam)</p>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="text-right">
                        <span className="text-[10px] text-slate-400 uppercase font-semibold block">Overall GPA</span>
                        <span className="text-lg font-black font-mono text-indigo-600 dark:text-indigo-400">1.2 (Grade 1)</span>
                      </div>
                      <div className="h-8 w-[1px] bg-slate-200 dark:bg-slate-800 mx-2" />
                      <div className="text-right">
                        <span className="text-[10px] text-slate-400 uppercase font-semibold block">Position in Class</span>
                        <span className="text-lg font-black font-mono text-emerald-600 dark:text-emerald-400">2nd of 46</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden text-xs">
                    <table className="w-full text-left">
                      <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 border-b border-slate-200 dark:border-slate-800 font-medium">
                        <tr>
                          <th className="px-4 py-2.5">Subject</th>
                          <th className="px-4 py-2.5 text-center">Class Score (30%)</th>
                          <th className="px-4 py-2.5 text-center">Exam Score (70%)</th>
                          <th className="px-4 py-2.5 text-center">Total (100%)</th>
                          <th className="px-4 py-2.5 text-center">Grade</th>
                          <th className="px-4 py-2.5">Remarks</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                        {[
                          { sub: 'English Language', ca: '28', ex: '64', tot: '92', gr: '1', rem: 'Outstanding analytical reading' },
                          { sub: 'Mathematics', ca: '27', ex: '61', tot: '88', gr: '1', rem: 'Strong problem-solving grasp' },
                          { sub: 'Integrated Science', ca: '26', ex: '59', tot: '85', gr: '1', rem: 'Very good lab experimental results' },
                          { sub: 'Social Studies', ca: '29', ex: '62', tot: '91', gr: '1', rem: 'Exceptional civic knowledge' },
                          { sub: 'Information & Tech (ICT)', ca: '30', ex: '65', tot: '95', gr: '1', rem: 'Superior computational literacy' },
                        ].map((r, i) => (
                          <tr key={i} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                            <td className="px-4 py-2.5 font-bold text-slate-800 dark:text-slate-200">{r.sub}</td>
                            <td className="px-4 py-2.5 text-center font-mono tabular-nums">{r.ca}</td>
                            <td className="px-4 py-2.5 text-center font-mono tabular-nums">{r.ex}</td>
                            <td className="px-4 py-2.5 text-center font-mono font-bold text-indigo-600 dark:text-indigo-400 tabular-nums">{r.tot}%</td>
                            <td className="px-4 py-2.5 text-center font-mono font-bold text-emerald-600 dark:text-emerald-400">{r.gr}</td>
                            <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400">{r.rem}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* TAB 3: FEES & MOMO LEDGER */}
              {activeTab === 'fees' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="p-4 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800">
                      <p className="text-xs text-slate-500 dark:text-slate-400">Total Term Billed</p>
                      <h4 className="text-xl font-bold font-mono text-slate-900 dark:text-slate-100 mt-1">GH₵ 148,200.00</h4>
                      <p className="text-[10px] text-slate-400 mt-1">Tuition, Feeding & Activities</p>
                    </div>
                    <div className="p-4 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800">
                      <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">Collected via MoMo & Bank</p>
                      <h4 className="text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-1">GH₵ 136,450.00</h4>
                      <p className="text-[10px] text-emerald-600/70 mt-1">92% Real-time reconciliation</p>
                    </div>
                    <div className="p-4 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800">
                      <p className="text-xs text-rose-600 dark:text-rose-400 font-medium">Outstanding Arrears</p>
                      <h4 className="text-xl font-bold font-mono text-rose-600 dark:text-rose-400 mt-1">GH₵ 11,750.00</h4>
                      <p className="text-[10px] text-rose-600/70 mt-1">Automated SMS Reminders queued</p>
                    </div>
                  </div>

                  <div className="p-4 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 text-xs">
                    <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                      <span className="font-bold text-slate-800 dark:text-slate-200">Recent Automated Payment Transactions</span>
                      <span className="text-[11px] font-mono text-slate-400">Live Paystack / MoMo Gateway</span>
                    </div>
                    <div className="space-y-2.5 pt-3">
                      {[
                        { student: 'Yaw Ofori (Basic 6)', ref: 'MM-GH-829104', amount: 'GH₵ 850.00', method: 'MTN Mobile Money', time: '5 mins ago', status: 'Instant Verified' },
                        { student: 'Priscilla Amoah (JHS 1)', ref: 'PSTK-491022', amount: 'GH₵ 1,200.00', method: 'Paystack Card', time: '14 mins ago', status: 'Instant Verified' },
                        { student: 'David Kyeremeh (Basic 3)', ref: 'MM-GH-773190', amount: 'GH₵ 450.00', method: 'Telecel Cash', time: '28 mins ago', status: 'Instant Verified' }
                      ].map((tx, idx) => (
                        <div key={idx} className="flex items-center justify-between py-1.5 border-b border-slate-50 dark:border-slate-800/50 last:border-0">
                          <div>
                            <div className="font-bold text-slate-800 dark:text-slate-200">{tx.student}</div>
                            <div className="text-[10px] font-mono text-slate-400">{tx.ref} • {tx.method} • {tx.time}</div>
                          </div>
                          <div className="text-right">
                            <span className="font-bold font-mono text-slate-900 dark:text-slate-100 block">{tx.amount}</span>
                            <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">{tx.status}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 4: RFID ATTENDANCE TERMINAL */}
              {activeTab === 'attendance' && (
                <div className="space-y-4">
                  <div className="p-4 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100">School Gate RFID & Biometric Terminal Active</h4>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">Today: 412 of 420 Students Present (98.1% Attendance Rate)</p>
                    </div>
                    <span className="text-xs font-mono font-bold px-2.5 py-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                      Terminal #01 Main Gate
                    </span>
                  </div>

                  <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-4 text-xs space-y-2.5">
                    {[
                      { student: 'Ama Owusu', class: 'Basic 4B', time: '07:22 AM', method: 'RFID Card Tap', status: 'Present', sms: 'Guardian SMS Dispatched' },
                      { student: 'Michael Tetteh', class: 'JHS 3A', time: '07:28 AM', method: 'Biometric Fingerprint', status: 'Present', sms: 'Guardian SMS Dispatched' },
                      { student: 'Kelvin Adjei', class: 'Basic 6A', time: '08:05 AM', method: 'Manual Teacher Roll', status: 'Late', sms: 'Late Notice Sent' }
                    ].map((att, i) => (
                      <div key={i} className="flex items-center justify-between p-2 rounded-md bg-slate-50 dark:bg-slate-800/40">
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-xs font-bold text-indigo-600 dark:text-indigo-400">{att.time}</span>
                          <div>
                            <div className="font-bold text-slate-800 dark:text-slate-200">{att.student} ({att.class})</div>
                            <div className="text-[10px] text-slate-400">{att.method}</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 block">{att.status}</span>
                          <span className="text-[10px] text-slate-400">{att.sms}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>

            {/* Showcase Footer Bar */}
            <div className="p-3.5 bg-slate-100 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
              <span className="text-slate-500 dark:text-slate-400 font-medium">
                Want to test this live with your school's actual student dataset?
              </span>
              <button
                onClick={onEnterSchoolPortal}
                className="font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 transition-colors flex items-center gap-1 cursor-pointer"
              >
                <span>Launch Interactive Demo School</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

          </div>

        </div>
      </section>

      {/* THE PROBLEM VS THE SOLUTION (Class Creator Philosophy) */}
      <section className="py-16 lg:py-24 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="text-center max-w-3xl mx-auto mb-14 space-y-3">
            <h2 className="text-2xl sm:text-4xl font-black text-slate-900 dark:text-slate-50 tracking-tight">
              Creating class lists and running a school manually is broken.
            </h2>
            <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
              Every term, educators lose dozens of hours to manual spreadsheet data entry, 
              parent complaints over unbalanced classes, and lost receipt slips. SchoolSphere eliminates the friction.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8 max-w-5xl mx-auto">
            
            {/* The Old Way */}
            <div className="p-6 sm:p-8 bg-white dark:bg-slate-900 rounded-xl border border-rose-200 dark:border-rose-900/60 shadow-xs space-y-5">
              <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400">
                <div className="w-8 h-8 rounded-lg bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 flex items-center justify-center font-bold">✕</div>
                <h3 className="font-bold text-lg">The Old Traditional Way</h3>
              </div>

              <ul className="space-y-3.5 text-xs text-slate-600 dark:text-slate-400">
                <li className="flex items-start gap-2.5">
                  <span className="text-rose-500 font-bold mt-0.5">•</span>
                  <span><strong>Whiteboard & Sticky Notes:</strong> Teachers spend 40+ hours shuffling colored cards, missing behavioral conflicts and separating friends accidentally.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="text-rose-500 font-bold mt-0.5">•</span>
                  <span><strong>3-Week Grading Bottleneck:</strong> Computing continuous assessments by hand causes calculation errors, delayed terminal reports, and exhausted teachers.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="text-rose-500 font-bold mt-0.5">•</span>
                  <span><strong>Missing Bank Slips & Cash Thefts:</strong> Manual paper receipts lead to uncollected fee arrears, audit discrepancies, and angry parents.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="text-rose-500 font-bold mt-0.5">•</span>
                  <span><strong>Disconnected Data Silos:</strong> Academic records stored on flash drives get lost or corrupted when computers crash.</span>
                </li>
              </ul>
            </div>

            {/* The SchoolSphere Way */}
            <div className="p-6 sm:p-8 bg-white dark:bg-slate-900 rounded-xl border border-indigo-200 dark:border-indigo-800 shadow-xs space-y-5 relative">
              <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 flex items-center justify-center font-bold">✓</div>
                <h3 className="font-bold text-lg">The SchoolSphere 3.1 Way</h3>
              </div>

              <ul className="space-y-3.5 text-xs text-slate-600 dark:text-slate-400">
                <li className="flex items-start gap-2.5">
                  <span className="text-indigo-600 dark:text-indigo-400 font-bold mt-0.5">✓</span>
                  <span><strong>Algorithmic Class Balancing:</strong> Balances academics, behavior, gender, and special needs in 60 seconds with educator-configured rules.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="text-indigo-600 dark:text-indigo-400 font-bold mt-0.5">✓</span>
                  <span><strong>Instant Terminal Reports:</strong> Automatic GPA calculation, WAEC/GES grade bands, and batch PDF generation ready for parent distribution.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="text-indigo-600 dark:text-indigo-400 font-bold mt-0.5">✓</span>
                  <span><strong>Instant MoMo & Paystack Reconciliation:</strong> Digital receipts and automated SMS payment reminders eliminate all cash leakage.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="text-indigo-600 dark:text-indigo-400 font-bold mt-0.5">✓</span>
                  <span><strong>Authoritative Cloud Single Source of Truth:</strong> PostgreSQL database with Row Level Security guarantees 100% data safety and offline caching.</span>
                </li>
              </ul>
            </div>

          </div>

        </div>
      </section>

      {/* 6 CORE PILLARS GRID */}
      <section id="terminals" className="py-16 lg:py-24 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="text-center max-w-3xl mx-auto mb-14 space-y-3">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 text-xs font-semibold border border-indigo-200 dark:border-indigo-800">
              Comprehensive Platform Capabilities
            </div>
            <h2 className="text-2xl sm:text-4xl font-black text-slate-900 dark:text-slate-50 tracking-tight">
              Built specifically for modern primary, secondary, and international schools.
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            
            <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 hover:border-slate-300 dark:hover:border-slate-700 transition-all space-y-3">
              <div className="w-10 h-10 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                <Split className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-base text-slate-900 dark:text-slate-100">Intelligent Class Placement</h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Automatically allocate students across parallel classes. Accommodates teacher surveys, academic bell curves, behavioral friction pairs, and twin placements.
              </p>
            </div>

            <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 hover:border-slate-300 dark:hover:border-slate-700 transition-all space-y-3">
              <div className="w-10 h-10 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                <FileText className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-base text-slate-900 dark:text-slate-100">WAEC & Cambridge Terminal Reports</h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Compute 30% Continuous Assessment (Class Tests, Homework, Projects) + 70% End-of-Term Examination scores with automated grade rankings and remarks.
              </p>
            </div>

            <div id="billing" className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 hover:border-slate-300 dark:hover:border-slate-700 transition-all space-y-3">
              <div className="w-10 h-10 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                <CreditCard className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-base text-slate-900 dark:text-slate-100">MoMo & Paystack Fee Collection</h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Itemized bills for tuition, ICT, feeding, and uniform fees. Parents pay instantly via Mobile Money wallets with automatic ledger reconciliation.
              </p>
            </div>

            <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 hover:border-slate-300 dark:hover:border-slate-700 transition-all space-y-3">
              <div className="w-10 h-10 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                <CalendarCheck className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-base text-slate-900 dark:text-slate-100">RFID & Biometric Attendance</h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                One-tap student card badges at school gates or in classrooms. Dispatches immediate SMS alerts to guardians if a student fails to arrive on time.
              </p>
            </div>

            <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 hover:border-slate-300 dark:hover:border-slate-700 transition-all space-y-3">
              <div className="w-10 h-10 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                <UserCheck className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-base text-slate-900 dark:text-slate-100">Granular Role-Based Permissions</h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Dedicated views for Principals, Academic Deans, Form Masters, Subject Teachers, and Accountants. Zero risk of teachers altering financial books.
              </p>
            </div>

            <div id="security" className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 hover:border-slate-300 dark:hover:border-slate-700 transition-all space-y-3">
              <div className="w-10 h-10 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-base text-slate-900 dark:text-slate-100">PostgreSQL RLS & Cloud Reliability</h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Direct Supabase PostgreSQL database architecture with strict Row Level Security, automatic encrypted backups, and offline fallback resilience.
              </p>
            </div>

          </div>

        </div>
      </section>

      {/* HOW IT WORKS IN 3 STEPS */}
      <section id="how-it-works" className="py-16 lg:py-24 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="text-center max-w-2xl mx-auto mb-14 space-y-3">
            <h2 className="text-2xl sm:text-4xl font-black text-slate-900 dark:text-slate-50 tracking-tight">
              Get your school running in 3 simple steps.
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Transitioning from paper files or Excel spreadsheets takes less than an afternoon.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            
            <div className="p-6 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4">
              <div className="w-9 h-9 rounded-lg bg-indigo-600 text-white font-bold font-mono text-sm flex items-center justify-center">
                01
              </div>
              <h3 className="font-bold text-base text-slate-900 dark:text-slate-100">Import Rosters & Staff</h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Upload your student rosters and teacher records via CSV or create them directly in the UI. Configure classes, arms, and academic terms.
              </p>
            </div>

            <div className="p-6 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4">
              <div className="w-9 h-9 rounded-lg bg-indigo-600 text-white font-bold font-mono text-sm flex items-center justify-center">
                02
              </div>
              <h3 className="font-bold text-base text-slate-900 dark:text-slate-100">Set Logic & Placement Rules</h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Define class size caps, gender balance targets, peer separation rules, and academic distribution parameters.
              </p>
            </div>

            <div className="p-6 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4">
              <div className="w-9 h-9 rounded-lg bg-indigo-600 text-white font-bold font-mono text-sm flex items-center justify-center">
                03
              </div>
              <h3 className="font-bold text-base text-slate-900 dark:text-slate-100">Generate, Print & Track</h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Generate balanced classes instantly, record daily marks, dispatch terminal report cards to parents, and track fees with live sync.
              </p>
            </div>

          </div>

          <div className="text-center mt-10">
            <button
              onClick={onEnterSchoolPortal}
              className="inline-flex items-center gap-2 px-6 py-3 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-sm transition-all cursor-pointer"
            >
              <span>Get Started Now</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

        </div>
      </section>

      {/* EDUCATOR TESTIMONIALS */}
      <section className="py-16 lg:py-24 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="text-center max-w-2xl mx-auto mb-14 space-y-3">
            <h2 className="text-2xl sm:text-4xl font-black text-slate-900 dark:text-slate-50 tracking-tight">
              Trusted by school heads, administrators, and teachers.
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Read how schools are transforming their administration across the region.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto">
            
            <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <div className="flex text-amber-400 gap-1">
                  {[...Array(5)].map((_, i) => <Star key={i} className="w-3.5 h-3.5 fill-amber-400" />)}
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 italic leading-relaxed">
                  "Class list creation used to paralyze our senior leadership team every August. With SchoolSphere's class creator logic, we balanced 400 junior high students across 10 arms in under an hour without a single parental conflict."
                </p>
              </div>
              <div className="border-t border-slate-200 dark:border-slate-800 pt-3">
                <h4 className="font-bold text-xs text-slate-900 dark:text-slate-100">Mr. Joseph Mensah</h4>
                <p className="text-[11px] text-slate-500">Headmaster • Prempeh Model Academy</p>
              </div>
            </div>

            <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <div className="flex text-amber-400 gap-1">
                  {[...Array(5)].map((_, i) => <Star key={i} className="w-3.5 h-3.5 fill-amber-400" />)}
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 italic leading-relaxed">
                  "Our terminal report cards are now printed and emailed within 48 hours of exams closing. The automatic WAEC grade scale calculation and teacher remarks have saved our teachers immense stress."
                </p>
              </div>
              <div className="border-t border-slate-200 dark:border-slate-800 pt-3">
                <h4 className="font-bold text-xs text-slate-900 dark:text-slate-100">Dr. Abigail Boateng</h4>
                <p className="text-[11px] text-slate-500">Academic Dean • Cape Coast International</p>
              </div>
            </div>

            <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <div className="flex text-amber-400 gap-1">
                  {[...Array(5)].map((_, i) => <Star key={i} className="w-3.5 h-3.5 fill-amber-400" />)}
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 italic leading-relaxed">
                  "Tuition collection via MTN MoMo and Paystack solved our cash accounting headaches. Parents get instant receipts on their phones, and our bursar has real-time reconciliation with zero lost funds."
                </p>
              </div>
              <div className="border-t border-slate-200 dark:border-slate-800 pt-3">
                <h4 className="font-bold text-xs text-slate-900 dark:text-slate-100">Rev. Francis Quaye</h4>
                <p className="text-[11px] text-slate-500">Director of Finance • Achimota Prep School</p>
              </div>
            </div>

          </div>

        </div>
      </section>

      {/* FREQUENTLY ASKED QUESTIONS (Accordion) */}
      <section id="faq" className="py-16 lg:py-24 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="text-center mb-12 space-y-3">
            <h2 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-slate-50 tracking-tight">
              Frequently Asked Questions
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
              Everything you need to know about implementing SchoolSphere in your school.
            </p>
          </div>

          <div className="space-y-3">
            {faqs.map((item, idx) => {
              const isOpen = openFaq === idx;
              return (
                <div 
                  key={idx} 
                  className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden"
                >
                  <button
                    onClick={() => setOpenFaq(isOpen ? null : idx)}
                    className="w-full px-5 py-4 text-left flex items-center justify-between text-xs font-bold text-slate-900 dark:text-slate-100 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors cursor-pointer"
                  >
                    <span>{item.q}</span>
                    <ChevronRight className={cn("w-4 h-4 transition-transform text-slate-400", isOpen && "rotate-90 text-indigo-600")} />
                  </button>
                  {isOpen && (
                    <div className="px-5 pb-4 pt-1 text-xs text-slate-600 dark:text-slate-400 leading-relaxed border-t border-slate-100 dark:border-slate-800/60">
                      {item.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

        </div>
      </section>

      {/* CALL TO ACTION BANNER */}
      <section className="py-16 bg-indigo-600 text-white relative overflow-hidden">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-6 relative z-10">
          <h2 className="text-2xl sm:text-4xl font-black tracking-tight">
            Ready to upgrade your school's class placement and administration?
          </h2>
          <p className="text-sm text-indigo-100 max-w-xl mx-auto leading-relaxed">
            Join hundreds of forward-thinking educators. Launch the SchoolSphere portal in minutes, or activate your institutional license key.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <button
              onClick={onEnterSchoolPortal}
              className="w-full sm:w-auto px-6 py-3.5 text-xs font-bold text-indigo-600 bg-white hover:bg-indigo-50 rounded-lg shadow-sm transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              <span>Launch School Portal</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <button
              onClick={onOpenActivation}
              className="w-full sm:w-auto px-6 py-3.5 text-xs font-semibold text-white bg-indigo-700 hover:bg-indigo-800 border border-indigo-500 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              <Key className="w-4 h-4" />
              <span>Activate Institutional License</span>
            </button>
          </div>
        </div>
      </section>

      {/* MODERN FOOTER */}
      <footer className="bg-slate-900 text-slate-400 text-xs border-t border-slate-800 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 pb-10 border-b border-slate-800">
            
            {/* Brand column */}
            <div className="space-y-3 md:col-span-2">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center">
                  <School className="w-4 h-4" />
                </div>
                <span className="font-bold text-base text-white">SchoolSphere 3.1</span>
              </div>
              <p className="text-xs text-slate-400 max-w-md leading-relaxed">
                The modern educational suite for student placement, academic records, WAEC terminals, and fee administration. Designed for educational excellence.
              </p>
              <div className="flex items-center gap-3 text-slate-500 text-[11px] pt-1">
                <span>Supabase PostgreSQL Core</span>
                <span>•</span>
                <span>RLS Tenant Isolation</span>
                <span>•</span>
                <span>FERPA Compliant</span>
              </div>
            </div>

            {/* Quick links */}
            <div className="space-y-2.5">
              <h4 className="text-xs font-bold text-white uppercase tracking-wider">Platform</h4>
              <ul className="space-y-2 text-[11px]">
                <li><a href="#class-creator" className="hover:text-white transition-colors">Class Placement Engine</a></li>
                <li><a href="#terminals" className="hover:text-white transition-colors">Continuous Assessment</a></li>
                <li><a href="#billing" className="hover:text-white transition-colors">MoMo Fee Collection</a></li>
                <li><button onClick={onOpenAbout} className="hover:text-white transition-colors cursor-pointer text-left">About System</button></li>
                <li><button onClick={onOpenContact} className="hover:text-white transition-colors cursor-pointer text-left">Support & Contacts</button></li>
              </ul>
            </div>

            {/* Support & Institutional Contact */}
            <div className="space-y-2.5">
              <h4 className="text-xs font-bold text-white uppercase tracking-wider">Institutional Support</h4>
              <p className="text-[11px] text-slate-400">Akoko Solutions / Educational Technology Division</p>
              <p className="text-[11px] text-slate-400 flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-indigo-400" />
                <span>akokosolutions24@gmail.com</span>
              </p>
              <p className="text-[11px] text-slate-400 flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-indigo-400" />
                <span>+233 24 000 0000 / +233 55 000 0000</span>
              </p>
              <div className="pt-2">
                <button
                  onClick={onOpenCreatorLogin}
                  className="text-[11px] font-mono text-slate-500 hover:text-indigo-400 transition-colors flex items-center gap-1 cursor-pointer"
                  title="Access Creator Master Console"
                >
                  <Lock className="w-3 h-3" />
                  <span>Creator Console</span>
                </button>
              </div>
            </div>

          </div>

          <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-slate-500">
            <p>© {new Date().getFullYear()} SchoolSphere 3.1 & Akoko Solutions. All rights reserved.</p>
            <div className="flex items-center gap-4">
              <button onClick={onOpenAbout} className="hover:text-slate-300 transition-colors cursor-pointer">Security Policy</button>
              <span>•</span>
              <button onClick={onOpenContact} className="hover:text-slate-300 transition-colors cursor-pointer">Terms of Service</button>
              <span>•</span>
              <span className="text-emerald-500">v3.1.0-Supabase-R1</span>
            </div>
          </div>

        </div>
      </footer>

    </div>
  );
}
