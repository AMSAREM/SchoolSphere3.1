import React from 'react';
import {
  LayoutDashboard,
  Users,
  BookOpen,
  Calendar,
  UserCheck,
  ClipboardCheck,
  CheckCircle,
  Award,
  FileText,
  CreditCard,
  Wallet,
  Siren,
  Vote,
  Package,
  Briefcase,
  Settings as SettingsIcon,
  Cpu,
  Building,
  ChevronRight,
  Home,
  ArrowLeft
} from 'lucide-react';
import { getPageIdentity } from '../lib/pageMetadata';
import { cn } from '../lib/utils';

interface PageHeaderBannerProps {
  viewId: string;
  userRole?: string | null;
  schoolName?: string;
  academicYear?: string;
  currentTerm?: string;
  onNavigateHome?: () => void;
  className?: string;
}

const VIEW_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  dashboard: LayoutDashboard,
  students: Users,
  academic: BookOpen,
  timetable: Calendar,
  duty_roster: UserCheck,
  lesson_notes: ClipboardCheck,
  attendance: CheckCircle,
  results: Award,
  exam_analysis: Award,
  reports: FileText,
  fees: CreditCard,
  payroll: Wallet,
  siren: Siren,
  evoting: Vote,
  inventory: Package,
  users: Briefcase,
  settings: SettingsIcon,
  creator: Cpu,
  school_management: Building
};

export const PageHeaderBanner: React.FC<PageHeaderBannerProps> = ({
  viewId,
  userRole,
  schoolName,
  academicYear = '2026/2027',
  currentTerm = 'Term 1',
  onNavigateHome,
  className
}) => {
  const pageMeta = getPageIdentity(viewId, userRole);
  const Icon = VIEW_ICONS[viewId] || LayoutDashboard;
  const isHome = viewId === 'dashboard';
  const formattedRole = userRole ? userRole.replace(/_/g, ' ').toUpperCase() : 'PORTAL USER';

  return (
    <section
      aria-label="Page Identity Header"
      className={cn(
        'mb-4 sm:mb-6 bg-white rounded-2xl border border-[#bac4c6]/80 px-4 py-3.5 sm:px-6 sm:py-4 shadow-2xs print:hidden',
        className
      )}
    >
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2.5 sm:gap-4">
        {/* Left: Breadcrumb Trail + Official Page Name + Module Subtitle */}
        <div className="min-w-0 flex-1">
          {/* Breadcrumb Path */}
          <nav
            aria-label="Breadcrumb"
            className="flex items-center flex-wrap gap-1.5 text-[11px] font-semibold text-[#6a7f84] mb-1.5"
          >
            {onNavigateHome && !isHome ? (
              <button
                type="button"
                onClick={onNavigateHome}
                className="inline-flex items-center gap-1 text-[#1c4a59] hover:text-[#faae57] transition-colors font-bold cursor-pointer"
                title="Return to Dashboard"
              >
                <Home className="w-3 h-3 shrink-0" />
                <span>Portal</span>
              </button>
            ) : (
              <span className="inline-flex items-center gap-1 text-[#1c4a59] font-bold">
                <Home className="w-3 h-3 shrink-0" />
                <span>Portal</span>
              </span>
            )}

            <ChevronRight className="w-3 h-3 text-[#bac4c6] shrink-0" />
            <span className="text-[#6a7f84] font-semibold truncate">{pageMeta.category}</span>
            <ChevronRight className="w-3 h-3 text-[#bac4c6] shrink-0" />
            <span
              className="text-[#1c4a59] font-extrabold truncate"
              aria-current="page"
            >
              {pageMeta.title}
            </span>
          </nav>

          {/* Page Title & Functional Icon */}
          <div className="flex items-start sm:items-center gap-2.5 sm:gap-3">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-[#1c4a59] text-[#faae57] flex items-center justify-center shrink-0 shadow-2xs border border-[#faae57]/30 mt-0.5 sm:mt-0">
              <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h1
                data-testid="active-page-title"
                className="text-base sm:text-xl lg:text-2xl font-extrabold text-[#1f2a2e] tracking-tight leading-snug break-words"
              >
                {pageMeta.title}
              </h1>
              <p className="text-xs sm:text-[13px] text-[#4e6166] font-medium leading-relaxed mt-0.5 line-clamp-2 sm:line-clamp-1">
                {pageMeta.subtitle}
              </p>
            </div>
          </div>
        </div>

        {/* Right: Unboxed Session Context Metadata & Quick Back Link */}
        <div className="flex flex-wrap items-center justify-between lg:justify-end gap-3 pt-2 lg:pt-0 border-t lg:border-t-0 border-[#bac4c6]/40 shrink-0">
          <div className="text-[11px] font-semibold text-[#6a7f84] flex items-center flex-wrap gap-1.5">
            {schoolName && (
              <>
                <span className="font-bold text-[#1c4a59] truncate max-w-[180px]">{schoolName}</span>
                <span className="text-[#bac4c6]" aria-hidden="true">·</span>
              </>
            )}
            <span className="font-mono font-bold text-[#1f2a2e]">{academicYear}</span>
            <span className="text-[#bac4c6]" aria-hidden="true">·</span>
            <span className="font-bold text-[#807654]">{currentTerm}</span>
            <span className="text-[#bac4c6]" aria-hidden="true">·</span>
            <span className="text-[10px] font-extrabold tracking-wider text-[#1c4a59] uppercase">
              {formattedRole}
            </span>
          </div>

          {!isHome && onNavigateHome && (
            <button
              type="button"
              onClick={onNavigateHome}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#bac4c6]/80 bg-[#f6f8f7] hover:bg-[#1c4a59] text-[#1c4a59] hover:text-white text-xs font-bold transition-colors cursor-pointer shrink-0"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Dashboard</span>
            </button>
          )}
        </div>
      </div>
    </section>
  );
};

export default PageHeaderBanner;
