import React, { useState } from 'react';
import { 
  GraduationCap, 
  FileText, 
  CreditCard, 
  ArrowRight, 
  Check, 
  Mail, 
  Key, 
  CheckCircle, 
  Building2,
  ChevronDown,
  Menu,
  X
} from 'lucide-react';
import { cn } from '../lib/utils';
import { PWAInstallButton } from './PWAInstallButton';
import { PrivacyPolicyModal } from './legal/PrivacyPolicyModal';
import { TermsOfServiceModal } from './legal/TermsOfServiceModal';
import { SiteMapModal } from './legal/SiteMapModal';
import { openCookiePreferences } from './legal/CookieConsentBanner';
import { DoodleBackground } from './DoodleBackground';

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
  // Mobile / Tablet Navigation Menu State
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Legal & Site Map Modals
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [showSiteMapModal, setShowSiteMapModal] = useState(false);

  // FAQ Accordion State
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const faqs = [
    {
      q: "How does the Intelligent Class Placement algorithm work?",
      a: "SchoolSphere uses educator-crafted Teacher Logic to evaluate academic performance, gender parity, behavioral compatibility, and special educational needs. It automatically prevents disruptive peer groupings and accommodates twin or friendship requests while ensuring equal distribution across all class streams."
    },
    {
      q: "Can our school import existing student and teacher rolls from Excel / CSV?",
      a: "Yes. SchoolSphere includes a 1-click roster importer. You can upload student rolls with guardian contact numbers, previous academic scores, and class histories. The system maps fields automatically and validates data before committing to the database."
    },
    {
      q: "Does SchoolSphere work offline if our campus internet drops?",
      a: "Yes. Built with offline-resilient local caching and automatic Supabase cloud reconciliation, teachers can take attendance, record grades, and print report cards even during network outages. As soon as connectivity returns, records sync seamlessly to the cloud."
    },
    {
      q: "How are school tuition fees collected and reconciled?",
      a: "SchoolSphere integrates directly with Mobile Money (MTN MoMo, Telecel Cash, AT Money) and Paystack. Guardians receive automated SMS notifications with payment instructions, and paid amounts are immediately credited to the student's ledger with digital receipts."
    },
    {
      q: "How is student data protected and isolated between schools?",
      a: "Every school tenant is strictly isolated using PostgreSQL Row Level Security (RLS) on Supabase. Administrators and staff can only access data belonging to their verified school_id, meeting strict international educational data privacy standards."
    }
  ];

  return (
    <div className="min-h-screen w-full bg-[#f6f8f7] text-[#1f2a2e] font-sans selection:bg-[#faae57] selection:text-[#1f2a2e] relative">
      {/* Main Sticky Navigation Header */}
      <header className="sticky top-0 z-40 w-full bg-white border-b border-[#bac4c6] shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 sm:h-18 flex items-center justify-between gap-3">
          
          {/* Logo Brand */}
          <div 
            className="flex items-center gap-2.5 sm:gap-3 cursor-pointer select-none min-h-[44px]" 
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          >
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl overflow-hidden bg-white border-0 flex items-center justify-center p-1 shadow-xs shrink-0" style={{ borderWidth: '0px' }}>
              <img 
                src="/sch sphere logo1.png" 
                alt="SchoolSphere Logo" 
                className="w-full h-full object-contain select-none pointer-events-none" 
              />
            </div>
            <div className="flex flex-col justify-center">
              <div className="flex items-center gap-1.5 leading-none">
                <span className="font-bold text-[14px] text-[#1c4a59] tracking-tight" style={{ fontSize: '14px' }}>School<span className="text-[#faae57]">Sphere</span></span>
              </div>
              <p className="hidden xl:block text-[11px] text-[#6a7f84] font-medium tracking-tight mt-0.5">Intelligent Class & School Suite</p>
            </div>
          </div>

          {/* Tablet & Desktop Nav Links (Visible on 768px+) */}
          <nav className="hidden md:flex items-center gap-5 lg:gap-8 text-xs font-semibold text-[#6a7f84]">
            <a href="#terminals" className="hover:text-[#1c4a59] transition-colors py-2">Grade Terminals</a>
            <a href="#billing" className="hover:text-[#1c4a59] transition-colors py-2">Fees & MoMo</a>
            <a href="#faq" className="hover:text-[#1c4a59] transition-colors py-2">FAQ</a>
          </nav>

          {/* Action CTAs */}
          <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
            <div className="hidden lg:block">
              <PWAInstallButton variant="landing" />
            </div>

            <button
              onClick={onOpenActivation}
              className="hidden lg:inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#1c4a59] hover:bg-[#f6f8f7] rounded-xl border border-[#bac4c6] transition-all cursor-pointer min-h-[44px]"
            >
              <Key className="w-3.5 h-3.5 text-[#1c4a59]" />
              <span>{isLicensed ? 'License Info' : 'Activate School'}</span>
            </button>

            <button
              onClick={onEnterSchoolPortal}
              className="inline-flex items-center justify-center gap-1 font-bold text-[#1f2a2e] bg-[#faae57] hover:bg-[#e4ae67] active:scale-[0.97] rounded-full shadow-xs transition-all cursor-pointer shrink-0"
              style={{ width: '101px', height: '30px' }}
            >
              <span className="text-[13px] leading-none" style={{ fontSize: '13px' }}>Enter Portal</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>

            {/* Mobile Navigation Toggle (Phones and small screens < 768px) */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(prev => !prev)}
              className="md:hidden flex items-center justify-center w-11 h-11 rounded-full border border-[#bac4c6] text-[#1c4a59] bg-[#f6f8f7] hover:bg-white active:scale-[0.97] transition-all cursor-pointer shrink-0"
              aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>

        </div>

        {/* Responsive Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-[#bac4c6] bg-white px-4 py-4 space-y-3 shadow-lg animate-in fade-in slide-in-from-top-2 duration-150">
            <nav className="flex flex-col space-y-1">
              <a
                href="#terminals"
                onClick={() => setMobileMenuOpen(false)}
                className="px-3.5 py-2.5 rounded-xl text-xs font-bold text-[#1c4a59] hover:bg-[#f6f8f7] flex items-center justify-between transition-colors min-h-[44px]"
              >
                <span>Grade Terminals & Assessment</span>
                <ArrowRight className="w-3.5 h-3.5 text-[#6a7f84]" />
              </a>
              <a
                href="#billing"
                onClick={() => setMobileMenuOpen(false)}
                className="px-3.5 py-2.5 rounded-xl text-xs font-bold text-[#1c4a59] hover:bg-[#f6f8f7] flex items-center justify-between transition-colors min-h-[44px]"
              >
                <span>Fees & Mobile Money</span>
                <ArrowRight className="w-3.5 h-3.5 text-[#6a7f84]" />
              </a>
              <a
                href="#faq"
                onClick={() => setMobileMenuOpen(false)}
                className="px-3.5 py-2.5 rounded-xl text-xs font-bold text-[#1c4a59] hover:bg-[#f6f8f7] flex items-center justify-between transition-colors min-h-[44px]"
              >
                <span>Frequently Asked Questions</span>
                <ArrowRight className="w-3.5 h-3.5 text-[#6a7f84]" />
              </a>
            </nav>

            <div className="pt-2 border-t border-[#bac4c6]/60 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onOpenActivation();
                }}
                className="w-full py-2.5 px-3 rounded-xl border border-[#bac4c6] text-xs font-bold text-[#1c4a59] bg-[#f6f8f7] hover:bg-white flex items-center justify-center gap-1.5 transition-colors min-h-[44px] cursor-pointer"
              >
                <Key className="w-3.5 h-3.5 text-[#1c4a59]" />
                <span>{isLicensed ? 'License Info' : 'Activate'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onOpenVideoTour();
                }}
                className="w-full py-2.5 px-3 rounded-xl border border-[#bac4c6] text-xs font-bold text-[#1c4a59] bg-[#f6f8f7] hover:bg-white flex items-center justify-center gap-1.5 transition-colors min-h-[44px] cursor-pointer"
              >
                <span>Watch Tour</span>
                <ArrowRight className="w-3.5 h-3.5 text-[#6a7f84]" />
              </button>
            </div>

            <div className="pt-1">
              <PWAInstallButton variant="banner" className="w-full justify-center !rounded-xl !bg-[#1c4a59] hover:!bg-[#163b47] !text-white !py-2.5 !text-xs font-bold shadow-xs min-h-[44px]" />
            </div>

            <div className="pt-1 flex items-center justify-around text-[11px] font-semibold text-[#6a7f84] border-t border-[#bac4c6]/40">
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onOpenAbout();
                }}
                className="hover:text-[#1c4a59] py-2 cursor-pointer"
              >
                About
              </button>
              <span>•</span>
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onOpenContact();
                }}
                className="hover:text-[#1c4a59] py-2 cursor-pointer"
              >
                Support
              </button>
              <span>•</span>
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onOpenCreatorLogin();
                }}
                className="hover:text-[#1c4a59] py-2 cursor-pointer"
              >
                Console
              </button>
            </div>
          </div>
        )}
      </header>

      {/* HERO SECTION */}
      <section className="relative pt-12 pb-16 lg:pt-16 lg:pb-20 border-b border-[#bac4c6] bg-[#f6f8f7] overflow-hidden">
        <DoodleBackground opacity={0.06} />
        
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          
          <div className="text-center max-w-3xl mx-auto space-y-6">
            
            {/* Tag Badge */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-white border border-[#bac4c6] text-[#1c4a59] text-xs font-bold shadow-xs">
              <GraduationCap className="w-4 h-4 text-[#1c4a59]" />
              <span>Engineered for High-Performing West African Schools</span>
            </div>

            {/* Main Headline */}
            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black text-[#1c4a59] tracking-tight leading-[1.15]">
              Balanced Class Lists. <br className="hidden sm:inline" />
              <span className="text-[#faae57]">Automated Reports.</span> <br className="hidden sm:inline" />
              Effortless Productivity.
            </h1>

            {/* Subtitle */}
            <p className="text-sm sm:text-base text-[#6a7f84] font-medium leading-relaxed max-w-2xl mx-auto">
              Say goodbye to spreadsheet friction and chaotic grading periods. 
              SchoolSphere empowers headteachers and faculty to organize balanced cohorts, 
              generate WAEC-standard terminal reports, and manage timetables with real-time Supabase cloud persistence.
            </p>

            {/* Primary Action Button Cluster */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <button
                onClick={onEnterSchoolPortal}
                className="w-full sm:w-auto px-6 py-3.5 text-sm font-bold text-[#1f2a2e] bg-[#faae57] hover:bg-[#e4ae67] rounded-full shadow-md active:scale-[0.97] transition-all flex items-center justify-center gap-2 cursor-pointer min-h-[44px]"
              >
                <span>Launch School Portal</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <button
                onClick={onOpenActivation}
                className="w-full sm:w-auto px-6 py-3.5 text-sm font-bold text-[#1c4a59] bg-white hover:bg-[#f6f8f7] rounded-full border border-[#bac4c6] shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer min-h-[44px]"
              >
                <Key className="w-4 h-4 text-[#1c4a59]" />
                <span>Activate School License</span>
              </button>
            </div>

            {/* Trust Metrics Bar */}
            <div className="pt-8 border-t border-[#bac4c6] grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto text-left sm:text-center">
              <div>
                <p className="text-2xl sm:text-3xl font-black font-mono tabular-nums text-[#1c4a59]">50,000+</p>
                <p className="text-xs font-medium text-[#6a7f84] mt-0.5">Students Placed & Managed</p>
              </div>
              <div>
                <p className="text-2xl sm:text-3xl font-black font-mono tabular-nums text-[#faae57]">3 Wks - 5m</p>
                <p className="text-xs font-medium text-[#6a7f84] mt-0.5">Report & Roster Creation</p>
              </div>
              <div>
                <p className="text-2xl sm:text-3xl font-black font-mono tabular-nums text-[#1c4a59]">100%</p>
                <p className="text-xs font-medium text-[#6a7f84] mt-0.5">RLS Tenant Isolation</p>
              </div>
              <div>
                <p className="text-2xl sm:text-3xl font-black font-mono tabular-nums text-[#06d6a0]">99.98%</p>
                <p className="text-xs font-medium text-[#6a7f84] mt-0.5">Cloud Database Uptime</p>
              </div>
            </div>

          </div>

        </div>
      </section>

      {/* CONTINUOUS ASSESSMENT & TERMINAL REPORTS */}
      <section id="terminals" className="py-16 sm:py-20 border-b border-[#bac4c6] bg-[#f6f8f7] relative">
        <DoodleBackground opacity={0.04} />
        
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            
            <div className="space-y-5">
              <span className="text-xs font-bold uppercase tracking-wider text-[#6a7f84]">Grading & Examination Suite</span>
              <h2 className="text-2xl sm:text-4xl font-black text-[#1c4a59] tracking-tight leading-tight">
                WAEC Standard Continuous Assessment & Instant Reports
              </h2>
              <p className="text-sm sm:text-base text-[#6a7f84] font-medium leading-relaxed">
                Grade terminal assessments with precision. Teachers input Class Assessment (30%) and Exam (70%), 
                and SchoolSphere automatically computes totals, ranks, and grade remarks according to Ministry standards.
              </p>

              <div className="space-y-3 pt-2">
                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-[#faae57] text-[#1f2a2e] flex items-center justify-center shrink-0 mt-0.5">
                    <Check className="w-3 h-3 stroke-[3]" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-[#1c4a59]">Single-Click Broad-Sheet Analysis</h4>
                    <p className="text-xs text-[#6a7f84] mt-0.5">Instantly review subject pass rates, grade point averages, and class distributions.</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-[#faae57] text-[#1f2a2e] flex items-center justify-center shrink-0 mt-0.5">
                    <Check className="w-3 h-3 stroke-[3]" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-[#1c4a59]">Official Letterhead Print Mode</h4>
                    <p className="text-xs text-[#6a7f84] mt-0.5">Clean print stylesheet strips navigation, printing crisp black-on-white terminal report cards.</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-[#faae57] text-[#1f2a2e] flex items-center justify-center shrink-0 mt-0.5">
                    <Check className="w-3 h-3 stroke-[3]" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-[#1c4a59]">Real-time Parent Ward Portal</h4>
                    <p className="text-xs text-[#6a7f84] mt-0.5">Parents sign in and securely view only their children's verified terminal reports and rankings.</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Assessment Matrix Mockup */}
            <div className="bg-white border border-[#bac4c6] rounded-3xl p-6 shadow-sm">
              <div className="flex items-center justify-between border-b border-[#bac4c6] pb-4 mb-4">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-[#1c4a59]" />
                  <span className="text-xs font-bold text-[#1c4a59]">Basic 7 • Integrated Science</span>
                </div>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 bg-[#f6f8f7] border border-[#bac4c6] rounded-md text-[#1c4a59]">
                  CA (30) + EXAM (70)
                </span>
              </div>

              <div className="space-y-3 font-mono text-xs">
                <div className="flex items-center justify-between p-3 bg-[#f6f8f7] rounded-xl border border-[#bac4c6]/70">
                  <div>
                    <span className="font-bold text-[#1f2a2e] font-sans block">Mensah, Ama</span>
                    <span className="text-[10px] text-[#6a7f84]">CA: 28 / 30 • Exam: 64 / 70</span>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-black text-[#1c4a59]">92%</span>
                    <span className="text-[10px] font-bold text-[#06d6a0] block font-sans">Grade 1 (Excellent)</span>
                  </div>
                </div>

                <div className="flex items-center justify-between p-3 bg-[#f6f8f7] rounded-xl border border-[#bac4c6]/70">
                  <div>
                    <span className="font-bold text-[#1f2a2e] font-sans block">Osei, Kwame</span>
                    <span className="text-[10px] text-[#6a7f84]">CA: 24 / 30 • Exam: 53 / 70</span>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-black text-[#1c4a59]">77%</span>
                    <span className="text-[10px] font-bold text-[#1c4a59] block font-sans">Grade 2 (Very Good)</span>
                  </div>
                </div>

                <div className="flex items-center justify-between p-3 bg-[#f6f8f7] rounded-xl border border-[#bac4c6]/70">
                  <div>
                    <span className="font-bold text-[#1f2a2e] font-sans block">Appiah, Kofi</span>
                    <span className="text-[10px] text-[#6a7f84]">CA: 20 / 30 • Exam: 44 / 70</span>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-black text-[#1c4a59]">64%</span>
                    <span className="text-[10px] font-bold text-[#faae57] block font-sans">Grade 3 (Good)</span>
                  </div>
                </div>
              </div>

              <div className="mt-5 pt-4 border-t border-[#bac4c6] flex items-center justify-between text-xs font-bold text-[#1c4a59]">
                <span>Class Average: 77.6%</span>
                <button 
                  onClick={onEnterSchoolPortal}
                  className="text-xs text-[#faae57] hover:underline font-bold cursor-pointer"
                >
                  Enter Grading Terminal
                </button>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* SECTION 4: FEES & MOBILE MONEY BILLING */}
      <section id="billing" className="py-16 sm:py-20 border-b border-[#bac4c6] bg-white relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="text-center max-w-3xl mx-auto mb-12 space-y-3">
            <span className="text-xs font-bold uppercase tracking-wider text-[#6a7f84]">Direct Tuition Settlement</span>
            <h2 className="text-2xl sm:text-4xl font-black text-[#1c4a59] tracking-tight">
              Mobile Money (MoMo) & Paystack Tuition Invoicing
            </h2>
            <p className="text-sm sm:text-base text-[#6a7f84] font-medium leading-relaxed">
              Accept MTN MoMo, Telecel Cash, and card payments directly into your school bank account. 
              Eliminate cash handling risks and deliver instant receipts to parents via SMS.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            
            <div className="bg-[#f6f8f7] border border-[#bac4c6] rounded-2xl p-6 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-white border border-[#bac4c6] flex items-center justify-center text-[#1c4a59]">
                <CreditCard className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-[#1c4a59]">Direct MoMo Prompts</h3>
              <p className="text-xs text-[#6a7f84] leading-relaxed font-medium">
                Push instant USSD payment prompts directly to parents' MTN or Telecel phones for 1-step PIN fee approval.
              </p>
            </div>

            <div className="bg-[#f6f8f7] border border-[#bac4c6] rounded-2xl p-6 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-white border border-[#bac4c6] flex items-center justify-center text-[#1c4a59]">
                <CheckCircle className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-[#1c4a59]">Automated Ledger Reconciliation</h3>
              <p className="text-xs text-[#6a7f84] leading-relaxed font-medium">
                No manual receipt matching. Payments immediately update the student ledger and reduce outstanding balance.
              </p>
            </div>

            <div className="bg-[#f6f8f7] border border-[#bac4c6] rounded-2xl p-6 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-white border border-[#bac4c6] flex items-center justify-center text-[#1c4a59]">
                <Mail className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-[#1c4a59]">SMS Payment Receipts</h3>
              <p className="text-xs text-[#6a7f84] leading-relaxed font-medium">
                Dispatch branded SMS confirmations with official transaction reference numbers to guardians automatically.
              </p>
            </div>

          </div>

        </div>
      </section>

      {/* SECTION 5: INSTITUTIONAL TRUST (NAMED SCHOOLS) */}
      <section className="py-14 border-b border-[#bac4c6] bg-[#f6f8f7] relative overflow-hidden">
        <DoodleBackground opacity={0.03} />
        
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-6 relative z-10">
          <p className="text-xs font-bold text-[#6a7f84] uppercase tracking-widest">
            Trusted by Administrators Across Leading Academic Institutions
          </p>

          <div className="flex flex-wrap items-center justify-center gap-6 sm:gap-10 text-[#1c4a59] font-bold text-sm sm:text-base">
            <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-xl border border-[#bac4c6] shadow-xs">
              <Building2 className="w-4 h-4 text-[#faae57]" />
              <span>Cape Coast International School</span>
            </div>
            <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-xl border border-[#bac4c6] shadow-xs">
              <Building2 className="w-4 h-4 text-[#faae57]" />
              <span>Mfantsipim School</span>
            </div>
            <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-xl border border-[#bac4c6] shadow-xs">
              <Building2 className="w-4 h-4 text-[#faae57]" />
              <span>Prempeh College</span>
            </div>
            <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-xl border border-[#bac4c6] shadow-xs">
              <Building2 className="w-4 h-4 text-[#faae57]" />
              <span>Achimota Academy</span>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 6: FREQUENTLY ASKED QUESTIONS */}
      <section id="faq" className="py-16 sm:py-20 border-b border-[#bac4c6] bg-white relative">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="text-center mb-10 space-y-2">
            <span className="text-xs font-bold uppercase tracking-wider text-[#6a7f84]">Got Questions?</span>
            <h2 className="text-2xl sm:text-3xl font-black text-[#1c4a59] tracking-tight">
              Frequently Asked Questions
            </h2>
          </div>

          <div className="space-y-3">
            {faqs.map((faq, idx) => {
              const isOpen = openFaq === idx;
              return (
                <div 
                  key={idx}
                  className="bg-[#f6f8f7] border border-[#bac4c6] rounded-2xl overflow-hidden transition-all"
                >
                  <button
                    type="button"
                    onClick={() => setOpenFaq(isOpen ? null : idx)}
                    className="w-full p-4 sm:p-5 text-left flex items-center justify-between gap-3 font-bold text-sm text-[#1c4a59] cursor-pointer"
                  >
                    <span>{faq.q}</span>
                    <ChevronDown className={cn("w-4 h-4 text-[#6a7f84] transition-transform", isOpen && "rotate-180")} />
                  </button>
                  {isOpen && (
                    <div className="px-4 sm:px-5 pb-5 text-xs text-[#6a7f84] leading-relaxed font-medium border-t border-[#bac4c6]/40 pt-3">
                      {faq.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-[#1c4a59] text-white py-12 border-t border-[#163b47]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8 pb-8 border-b border-white/10">
            
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-white p-1 flex items-center justify-center">
                  <img src="/sch sphere logo1.png" alt="Logo" className="w-full h-full object-contain" />
                </div>
                <span className="font-bold text-base text-white">School<span className="text-[#faae57]">Sphere</span></span>
              </div>
              <p className="text-xs text-white/70 leading-relaxed">
                Empowering Ghanaian & West African educational institutions with modern planning, assessments, and cloud persistence.
              </p>
            </div>

            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#faae57] mb-3">Product</h4>
              <ul className="space-y-2 text-xs text-white/80">
                <li><a href="#terminals" className="hover:text-white transition-colors">Terminal Reports</a></li>
                <li><a href="#billing" className="hover:text-white transition-colors">MoMo Invoicing</a></li>
                <li><a href="#faq" className="hover:text-white transition-colors">FAQ & Answers</a></li>
              </ul>
            </div>

            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#faae57] mb-3">Institutional</h4>
              <ul className="space-y-2 text-xs text-white/80">
                <li><button onClick={onOpenAbout} className="hover:text-white transition-colors cursor-pointer">About SchoolSphere</button></li>
                <li><button onClick={onOpenContact} className="hover:text-white transition-colors cursor-pointer">Institutional Support</button></li>
                <li><button onClick={onOpenActivation} className="hover:text-white transition-colors cursor-pointer">License Activation</button></li>
                <li><button onClick={onOpenCreatorLogin} className="hover:text-white transition-colors cursor-pointer">Platform Console</button></li>
              </ul>
            </div>

            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#faae57] mb-3">Legal & Compliance</h4>
              <ul className="space-y-2 text-xs text-white/80">
                <li><button onClick={() => setShowPrivacyModal(true)} className="hover:text-white transition-colors cursor-pointer">Privacy Policy</button></li>
                <li><button onClick={() => setShowTermsModal(true)} className="hover:text-white transition-colors cursor-pointer">Terms of Service</button></li>
                <li><button onClick={() => setShowSiteMapModal(true)} className="hover:text-white transition-colors cursor-pointer">Site Map</button></li>
                <li><button onClick={openCookiePreferences} className="hover:text-white transition-colors cursor-pointer">Cookie Settings</button></li>
              </ul>
            </div>

          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-white/60">
            <p> 2026 SchoolSphere 3.1. All rights reserved.</p>
            <p className="text-[11px] font-mono text-white/50">PostgreSQL Row Level Security • Single Source of Truth</p>
          </div>

        </div>
      </footer>

      {/* Legal Modals */}
      <PrivacyPolicyModal isOpen={showPrivacyModal} onClose={() => setShowPrivacyModal(false)} />
      <TermsOfServiceModal isOpen={showTermsModal} onClose={() => setShowTermsModal(false)} />
      <SiteMapModal isOpen={showSiteMapModal} onClose={() => setShowSiteMapModal(false)} />

    </div>
  );
}
