import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Network, 
  X, 
  ExternalLink, 
  ShieldCheck, 
  GraduationCap, 
  Users, 
  Calendar, 
  BarChart3, 
  Receipt, 
  Sliders, 
  FileText, 
  Lock, 
  Sparkles, 
  Terminal,
  Layers,
  ArrowRight
} from 'lucide-react';

interface SiteMapModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate?: (view: string) => void;
  onOpenPrivacy?: () => void;
  onOpenTerms?: () => void;
  onOpenCookies?: () => void;
}

export function SiteMapModal({
  isOpen,
  onClose,
  onNavigate,
  onOpenPrivacy,
  onOpenTerms,
  onOpenCookies
}: SiteMapModalProps) {
  if (!isOpen) return null;

  const sections = [
    {
      title: 'Public Gateways & Onboarding',
      icon: Sparkles,
      color: '#1B9AAA',
      items: [
        { name: 'Command Gate & Landing', path: '/', desc: 'Platform showcase, features overview, and public portal entrance', view: 'landing' },
        { name: 'School Portal Sign In', path: '/login', desc: 'Secure staff and institutional member authentication with auto-tenant detection', view: 'login' },
        { name: 'Register Institution', path: '/register', desc: 'Onboard a new school campus with custom subdomain slug and initial admin', view: 'register' },
        { name: 'Team Invite Acceptance', path: '/invite', desc: 'Join an existing school campus using secure time-limited invitation tokens', view: 'invite' }
      ]
    },
    {
      title: 'Student & Academic Management',
      icon: GraduationCap,
      color: '#06D6A0',
      items: [
        { name: 'Student Biodata Registry', path: '/students', desc: 'Enrolled students database, biodata, photos, and emergency contact directory', view: 'students' },
        { name: 'Class Placement Engine', path: '/academic', desc: 'Balance student arms, assign form teachers, and manage class progressions', view: 'academic' },
        { name: 'Master Timetable Engine', path: '/timetable', desc: 'Period planning, teacher schedule allocation, and conflict detection', view: 'timetable' },
        { name: 'Attendance Terminal', path: '/attendance', desc: 'Daily attendance registry with RFID, biometric, and quick-check modes', view: 'attendance' }
      ]
    },
    {
      title: 'Grading, Results & Analytics',
      icon: BarChart3,
      color: '#FFC43D',
      items: [
        { name: 'Results Terminal', path: '/results', desc: 'Continuous assessment (30%) and terminal exam mark recording matrix', view: 'results' },
        { name: 'Exam Metrics Analysis', path: '/exam-analysis', desc: 'Grade distribution visuals, pass rates, and subject rankings', view: 'exam_analysis' },
        { name: 'Report Cards Terminal', path: '/reports', desc: 'Automated term report sheet compilation with printable transcripts', view: 'reports' }
      ]
    },
    {
      title: 'Bursary, Finance & Assets',
      icon: Receipt,
      color: '#06D6A0',
      items: [
        { name: 'Fees & Invoicing Terminal', path: '/fees', desc: 'Tuition structures, customized fee categories, and billing runs', view: 'fees' },
        { name: 'Receipts & Transactions', path: '/fees#receipts', desc: 'Audited transaction logging with printable paper receipts', view: 'fees' },
        { name: 'Campus Inventory Registry', path: '/inventory', desc: 'Track school assets, textbooks, laboratory equipment, and store stock', view: 'inventory' }
      ]
    },
    {
      title: 'Institutional Security & Control',
      icon: Lock,
      color: '#EF476F',
      items: [
        { name: 'User & Role Management', path: '/users', desc: 'Assign Headmaster, Teacher, Accountant, and Student access levels', view: 'users' },
        { name: 'Multi-Tenant Campus Switcher', path: '/tenants', desc: 'Strictly isolated Row Level Security (RLS) multi-school switching for creators', view: 'school_management' },
        { name: 'Siren & Emergency Broadcast', path: '/siren', desc: 'Campus public address bells, drills, and emergency sound alerts', view: 'siren' },
        { name: 'Creator Hub (Master Console)', path: '/creator', desc: 'V2 Master Control Hub, licensing, and diagnostics', view: 'creator' }
      ]
    },
    {
      title: 'Legal, Compliance & Crawlers',
      icon: ShieldCheck,
      color: '#1B9AAA',
      items: [
        { name: 'Institutional Privacy Policy', path: '/privacy', desc: 'Compliance with Ghana Data Protection Act 2012 (Act 843) & FERPA', action: onOpenPrivacy },
        { name: 'Terms of Service Agreement', path: '/terms', desc: 'Master license agreement, SLA uptime, and school data ownership', action: onOpenTerms },
        { name: 'Cookie & Storage Preferences', path: '/cookies', desc: 'Manage strictly necessary tokens, offline cache, and diagnostics', action: onOpenCookies },
        { name: 'XML Sitemap', path: '/sitemap.xml', desc: 'Search engine index file containing canonical routes', external: '/sitemap.xml' },
        { name: 'Robots.txt', path: '/robots.txt', desc: 'Crawler directives protecting private institutional endpoints', external: '/robots.txt' }
      ]
    }
  ];

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/65 backdrop-blur-xs overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 12 }}
          transition={{ duration: 0.2 }}
          className="bg-white rounded-3xl border border-slate-200/90 max-w-4xl w-full p-5 sm:p-8 shadow-2xl relative text-left my-auto max-h-[90vh] flex flex-col"
        >
          {/* Header */}
          <div className="flex items-start justify-between border-b border-slate-100 pb-4 mb-5 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-[#1B9AAA]/15 border border-[#1B9AAA]/30 text-[#1B9AAA] flex items-center justify-center shrink-0">
                <Network className="w-6 h-6 text-[#1B9AAA]" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight">Platform Site Map & Architecture</h2>
                  <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                    SchoolSphere 3.1
                  </span>
                </div>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  Complete directory of application modules, public gateways, and compliance documents
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
              title="Close Site Map"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Grid Content */}
          <div className="overflow-y-auto pr-2 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {sections.map((section, sIdx) => {
                const IconComp = section.icon;
                return (
                  <div key={sIdx} className="p-4 rounded-2xl border border-slate-200 bg-slate-50/50 flex flex-col gap-3">
                    <div className="flex items-center gap-2 border-b border-slate-200/80 pb-2.5">
                      <div className="p-1.5 rounded-lg bg-white border border-slate-200 text-[#1B9AAA]">
                        <IconComp className="w-4 h-4" />
                      </div>
                      <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">{section.title}</h3>
                    </div>

                    <div className="space-y-2">
                      {section.items.map((item, iIdx) => {
                        return (
                          <div 
                            key={iIdx}
                            className="p-2.5 rounded-xl bg-white border border-slate-200/70 hover:border-[#1B9AAA]/40 transition-all flex items-start justify-between gap-2 group"
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-bold text-slate-900 group-hover:text-[#1B9AAA] transition-colors">{item.name}</span>
                                <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-1 rounded">{item.path}</span>
                              </div>
                              <p className="text-[11px] text-slate-500 leading-normal mt-0.5 line-clamp-1">{item.desc}</p>
                            </div>

                            {item.external ? (
                              <a
                                href={item.external}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors shrink-0"
                                title="Open file"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            ) : item.action ? (
                              <button
                                type="button"
                                onClick={() => {
                                  onClose();
                                  item.action();
                                }}
                                className="p-1.5 rounded-lg bg-slate-100 hover:bg-[#1B9AAA] hover:text-white text-slate-600 transition-colors shrink-0 cursor-pointer"
                                title="View document"
                              >
                                <ArrowRight className="w-3.5 h-3.5" />
                              </button>
                            ) : item.view && onNavigate ? (
                              <button
                                type="button"
                                onClick={() => {
                                  onClose();
                                  onNavigate(item.view);
                                }}
                                className="p-1.5 rounded-lg bg-slate-100 hover:bg-[#1B9AAA] hover:text-white text-slate-600 transition-colors shrink-0 cursor-pointer"
                                title={`Navigate to ${item.name}`}
                              >
                                <ArrowRight className="w-3.5 h-3.5" />
                              </button>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Footer Controls */}
          <div className="border-t border-slate-100 pt-4 mt-5 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3 text-xs text-slate-500">
              <a href="/sitemap.xml" target="_blank" rel="noopener noreferrer" className="hover:text-[#1B9AAA] underline flex items-center gap-1 font-mono text-[11px]">
                <span>sitemap.xml</span>
                <ExternalLink className="w-3 h-3" />
              </a>
              <span>•</span>
              <a href="/robots.txt" target="_blank" rel="noopener noreferrer" className="hover:text-[#1B9AAA] underline flex items-center gap-1 font-mono text-[11px]">
                <span>robots.txt</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 rounded-xl text-xs font-black bg-[#1B9AAA] hover:bg-[#14727D] text-white shadow-md active:scale-95 transition-all cursor-pointer"
            >
              Close Site Map
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
