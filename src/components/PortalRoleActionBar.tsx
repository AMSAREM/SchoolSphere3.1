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
  Bed,
  Siren,
  Vote,
  Package,
  Briefcase,
  Settings as SettingsIcon,
  Sparkles,
  MessageSquare,
  GraduationCap
} from 'lucide-react';
import { cn } from '../lib/utils';

export type PortalView =
  | 'dashboard'
  | 'students'
  | 'attendance'
  | 'results'
  | 'assessments'
  | 'lesson_notes'
  | 'duty_roster'
  | 'payroll'
  | 'boarding'
  | 'fees'
  | 'academic'
  | 'settings'
  | 'reports'
  | 'users'
  | 'siren'
  | 'timetable'
  | 'exam_analysis'
  | 'evoting'
  | 'inventory'
  | 'sms'
  | 'creator'
  | 'school_management';

interface PortalActionItem {
  id: PortalView;
  label: string;
  mobileLabel?: string;
  icon: React.ComponentType<{ className?: string }>;
  tag?: string;
}

interface PortalRoleActionBarProps {
  activeView: PortalView;
  onNavigate: (view: PortalView) => void;
  userRole?: string;
  className?: string;
}

// Role-specific action items tailored for each portal persona
const ROLE_PORTAL_ITEMS: Record<string, PortalActionItem[]> = {
  admin: [
    { id: 'dashboard', label: 'Overview', mobileLabel: 'Dashboard', icon: LayoutDashboard },
    { id: 'students', label: 'Students', icon: Users },
    { id: 'academic', label: 'Academic Staff', mobileLabel: 'Academics', icon: BookOpen },
    { id: 'assessments', label: 'Assessments & SBA', mobileLabel: 'Assessments', icon: GraduationCap, tag: 'NEW' },
    { id: 'attendance', label: 'Attendance', icon: CheckCircle },
    { id: 'results', label: 'Gradebook', icon: Award },
    { id: 'exam_analysis', label: 'WAEC Analysis', mobileLabel: 'Exams', icon: Award },
    { id: 'fees', label: 'Fees Ledger', mobileLabel: 'Fees', icon: CreditCard },
    { id: 'payroll', label: 'Staff Payroll', mobileLabel: 'Payroll', icon: Wallet },
    { id: 'boarding', label: 'Boarding Houses', mobileLabel: 'Boarding', icon: Bed },
    { id: 'duty_roster', label: 'Duty Roster', icon: UserCheck },
    { id: 'lesson_notes', label: 'Lesson Notes', icon: ClipboardCheck },
    { id: 'timetable', label: 'Timetable', icon: Calendar },
    { id: 'sms', label: 'Bulk SMS & Alerts', mobileLabel: 'SMS', icon: MessageSquare },
    { id: 'reports', label: 'Reports', icon: FileText },
    { id: 'evoting', label: 'E-Voting', icon: Vote },
    { id: 'inventory', label: 'Inventory', icon: Package },
    { id: 'siren', label: 'Siren Console', mobileLabel: 'Siren', icon: Siren },
    { id: 'users', label: 'User Accounts', mobileLabel: 'Users', icon: Briefcase },
    { id: 'settings', label: 'Settings', icon: SettingsIcon }
  ],
  super_admin: [
    { id: 'dashboard', label: 'Overview', mobileLabel: 'Dashboard', icon: LayoutDashboard },
    { id: 'students', label: 'Students', icon: Users },
    { id: 'academic', label: 'Academic', icon: BookOpen },
    { id: 'assessments', label: 'Assessments & SBA', mobileLabel: 'Assessments', icon: GraduationCap, tag: 'NEW' },
    { id: 'fees', label: 'Fees Ledger', icon: CreditCard },
    { id: 'payroll', label: 'Payroll', icon: Wallet },
    { id: 'boarding', label: 'Boarding', icon: Bed },
    { id: 'duty_roster', label: 'Duty Roster', icon: UserCheck },
    { id: 'lesson_notes', label: 'Lesson Notes', icon: ClipboardCheck },
    { id: 'results', label: 'Gradebook', icon: Award },
    { id: 'exam_analysis', label: 'Exams', icon: Award },
    { id: 'sms', label: 'Bulk SMS & Alerts', mobileLabel: 'SMS', icon: MessageSquare },
    { id: 'reports', label: 'Reports', icon: FileText },
    { id: 'evoting', label: 'E-Voting', icon: Vote },
    { id: 'inventory', label: 'Inventory', icon: Package },
    { id: 'siren', label: 'Siren', icon: Siren },
    { id: 'users', label: 'Users', icon: Briefcase },
    { id: 'settings', label: 'Settings', icon: SettingsIcon }
  ],
  headteacher: [
    { id: 'dashboard', label: 'Overview', icon: LayoutDashboard },
    { id: 'students', label: 'Students', icon: Users },
    { id: 'academic', label: 'Staff & Classes', mobileLabel: 'Staff', icon: BookOpen },
    { id: 'assessments', label: 'Assessments & SBA', mobileLabel: 'Assessments', icon: GraduationCap, tag: 'NEW' },
    { id: 'lesson_notes', label: 'Vetting Lesson Notes', mobileLabel: 'Lesson Notes', icon: ClipboardCheck },
    { id: 'duty_roster', label: 'Teachers Duty Log', mobileLabel: 'Duty Roster', icon: UserCheck },
    { id: 'attendance', label: 'Daily Roll Call', mobileLabel: 'Attendance', icon: CheckCircle },
    { id: 'results', label: 'Results Approval', mobileLabel: 'Results', icon: Award },
    { id: 'exam_analysis', label: 'WAEC Performance', mobileLabel: 'Exams', icon: Award },
    { id: 'boarding', label: 'Boarding Houses', mobileLabel: 'Boarding', icon: Bed },
    { id: 'timetable', label: 'School Timetable', mobileLabel: 'Timetable', icon: Calendar },
    { id: 'sms', label: 'Parent SMS Alerts', mobileLabel: 'SMS', icon: MessageSquare },
    { id: 'reports', label: 'Terminal Reports', mobileLabel: 'Reports', icon: FileText },
    { id: 'siren', label: 'Campus Siren', icon: Siren }
  ],
  teacher: [
    { id: 'dashboard', label: 'Teacher Hub', mobileLabel: 'Overview', icon: LayoutDashboard },
    { id: 'assessments', label: 'Homework & Tests', mobileLabel: 'Assessments', icon: GraduationCap, tag: 'NEW' },
    { id: 'attendance', label: 'Mark Attendance', mobileLabel: 'Roll Call', icon: CheckCircle },
    { id: 'results', label: 'Record Marks', mobileLabel: 'Grading', icon: Award },
    { id: 'lesson_notes', label: 'My Lesson Plans', mobileLabel: 'Lesson Notes', icon: ClipboardCheck },
    { id: 'duty_roster', label: 'My Weekly Duties', mobileLabel: 'Duty Log', icon: UserCheck },
    { id: 'timetable', label: 'My Timetable', mobileLabel: 'Timetable', icon: Calendar },
    { id: 'reports', label: 'Class Reports', mobileLabel: 'Reports', icon: FileText },
    { id: 'payroll', label: 'My Payslips', mobileLabel: 'Payslips', icon: Wallet },
    { id: 'students', label: 'Class Students', mobileLabel: 'Students', icon: Users }
  ],
  accountant: [
    { id: 'dashboard', label: 'Finance Hub', mobileLabel: 'Overview', icon: LayoutDashboard },
    { id: 'fees', label: 'Fees Collection & MoMo', mobileLabel: 'Fees Ledger', icon: CreditCard },
    { id: 'payroll', label: 'Staff Payroll Run', mobileLabel: 'Payroll', icon: Wallet },
    { id: 'sms', label: 'Debtor SMS Alerts', mobileLabel: 'SMS', icon: MessageSquare },
    { id: 'inventory', label: 'Store & Expenses', mobileLabel: 'Expenses', icon: Package },
    { id: 'reports', label: 'Fee Broadsheets', mobileLabel: 'Financial Reports', icon: FileText },
    { id: 'students', label: 'Student Billing List', mobileLabel: 'Students', icon: Users },
    { id: 'boarding', label: 'Boarding Fees', mobileLabel: 'Boarding', icon: Bed }
  ],
  bursar: [
    { id: 'dashboard', label: 'Finance Hub', icon: LayoutDashboard },
    { id: 'fees', label: 'Fees & Invoicing', mobileLabel: 'Fees', icon: CreditCard },
    { id: 'payroll', label: 'Staff Payroll', mobileLabel: 'Payroll', icon: Wallet },
    { id: 'sms', label: 'Debtor SMS Alerts', mobileLabel: 'SMS', icon: MessageSquare },
    { id: 'inventory', label: 'Storehouse & Expenses', mobileLabel: 'Inventory', icon: Package },
    { id: 'reports', label: 'Financial Reports', mobileLabel: 'Reports', icon: FileText },
    { id: 'students', label: 'Students Billing', mobileLabel: 'Students', icon: Users }
  ],
  student: [
    { id: 'dashboard', label: 'Student Portal', mobileLabel: 'Overview', icon: LayoutDashboard },
    { id: 'assessments', label: 'My Assessments', mobileLabel: 'Assessments', icon: GraduationCap, tag: 'NEW' },
    { id: 'reports', label: 'My Terminal Reports', mobileLabel: 'Report Card', icon: FileText },
    { id: 'results', label: 'My Continuous Assessment', mobileLabel: 'Assessment', icon: Award },
    { id: 'timetable', label: 'Class Timetable', mobileLabel: 'Timetable', icon: Calendar },
    { id: 'attendance', label: 'My Attendance', mobileLabel: 'Attendance', icon: CheckCircle },
    { id: 'fees', label: 'My Fees Statement', mobileLabel: 'Fees Status', icon: CreditCard },
    { id: 'boarding', label: 'Dorm & Exeat Pass', mobileLabel: 'Boarding', icon: Bed },
    { id: 'evoting', label: 'Prefect E-Voting', mobileLabel: 'Vote Ballot', icon: Vote }
  ],
  parent: [
    { id: 'dashboard', label: 'Parent Portal', mobileLabel: 'Overview', icon: LayoutDashboard },
    { id: 'assessments', label: 'Ward Assessments', mobileLabel: 'Assessments', icon: GraduationCap, tag: 'NEW' },
    { id: 'reports', label: 'Ward Terminal Reports', mobileLabel: 'Report Cards', icon: FileText },
    { id: 'fees', label: 'Fees & MoMo Pay', mobileLabel: 'Pay Fees', icon: CreditCard },
    { id: 'attendance', label: 'Attendance Records', mobileLabel: 'Attendance', icon: CheckCircle },
    { id: 'timetable', label: 'Ward Timetable', mobileLabel: 'Timetable', icon: Calendar },
    { id: 'results', label: 'Assessment Scores', mobileLabel: 'Results', icon: Award },
    { id: 'boarding', label: 'Boarding & Exeats', mobileLabel: 'Boarding', icon: Bed }
  ]
};

export const PortalRoleActionBar: React.FC<PortalRoleActionBarProps> = ({
  activeView,
  onNavigate,
  userRole = 'admin',
  className
}) => {
  const normalizedRole = (userRole || 'admin').toLowerCase();
  const items = ROLE_PORTAL_ITEMS[normalizedRole] || ROLE_PORTAL_ITEMS.admin;

  return (
    <div
      role="navigation"
      aria-label="Portal Role Actions"
      className={cn(
        'w-full min-w-0 max-w-full mb-3 sm:mb-4 bg-white/90 backdrop-blur-xs border border-[#bac4c6]/70 rounded-2xl p-1.5 sm:p-2 shadow-2xs print:hidden',
        className
      )}
    >
      <div className="flex items-center justify-between gap-2 px-1 mb-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <Sparkles className="w-3.5 h-3.5 text-[#faae57] shrink-0" />
          <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider text-[#1c4a59] truncate">
            {normalizedRole.replace('_', ' ')} Portal Quick Items
          </span>
        </div>
        <span className="text-[9px] font-semibold text-[#6a7f84] hidden xs:inline shrink-0">
          {items.length} Modules
        </span>
      </div>

      {/* Horizontal touch-scrollable ribbon with momentum and compact padding */}
      <div className="flex items-center gap-1 sm:gap-1.5 overflow-x-auto touch-pan-x scroll-smooth pb-0.5 no-scrollbar -mx-0.5 px-0.5">
        {items.map((item) => {
          const isActive = activeView === item.id;
          const Icon = item.icon;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              className={cn(
                'group flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer select-none active:scale-[0.97] min-h-[36px] sm:min-h-[40px]',
                isActive
                  ? 'bg-[#1c4a59] text-white shadow-xs'
                  : 'bg-[#f6f8f7] hover:bg-[#e1c594]/25 text-[#1f2a2e] hover:text-[#1c4a59] border border-[#bac4c6]/50'
              )}
              title={`Switch to ${item.label}`}
            >
              <Icon
                className={cn(
                  'w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 transition-colors',
                  isActive ? 'text-[#faae57]' : 'text-[#6a7f84] group-hover:text-[#1c4a59]'
                )}
              />
              <span className="whitespace-nowrap leading-none">
                <span className="sm:hidden">{item.mobileLabel || item.label}</span>
                <span className="hidden sm:inline">{item.label}</span>
              </span>
              {item.tag && (
                <span
                  className={cn(
                    'text-[8px] font-black uppercase tracking-widest px-1 py-0.5 rounded-sm leading-none shrink-0',
                    isActive ? 'bg-white/20 text-[#faae57]' : 'bg-[#1c4a59]/10 text-[#1c4a59]'
                  )}
                >
                  {item.tag}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default PortalRoleActionBar;
