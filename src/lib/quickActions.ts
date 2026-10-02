import React from 'react';
import {
  Users,
  CheckSquare,
  Wallet,
  Award,
  ClipboardCheck,
  BarChart3,
  Clock,
  CreditCard,
  FileText,
  Package,
  Calendar,
  Vote,
  BookOpen,
  Key,
  Building,
  Activity,
  RefreshCw
} from 'lucide-react';

export interface QuickActionItem {
  id: string;
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  targetView?: string;
  creatorPanel?: string;
  specialAction?: 'quick_reminder' | 'refresh_telemetry';
  theme: {
    drawerBg: string;
    drawerBorder: string;
    drawerIconBg: string;
    drawerIconText: string;
    drawerSubtitleText: string;
    cardBg: string;
    cardBorder: string;
    cardText: string;
    cardSubtext: string;
    cardIconBg: string;
    cardIconText: string;
    chevronText: string;
  };
}

const TEAL_THEME: QuickActionItem['theme'] = {
  drawerBg: 'bg-[#1c4a59]/10 hover:bg-[#1c4a59]/20',
  drawerBorder: 'border-[#1c4a59]/30',
  drawerIconBg: 'bg-[#1c4a59]',
  drawerIconText: 'text-[#faae57]',
  drawerSubtitleText: 'text-[#1c4a59]',
  cardBg: 'bg-[#f6f8f7] hover:bg-[#eef2f0]',
  cardBorder: 'border-[#bac4c6]',
  cardText: 'text-[#1f2a2e]',
  cardSubtext: 'text-[#6a7f84]',
  cardIconBg: 'bg-[#1c4a59]',
  cardIconText: 'text-[#faae57]',
  chevronText: 'text-[#6a7f84] group-hover:text-[#1c4a59]'
};

const EMERALD_THEME: QuickActionItem['theme'] = {
  drawerBg: 'bg-[#06d6a0]/10 hover:bg-[#06d6a0]/20',
  drawerBorder: 'border-[#06d6a0]/30',
  drawerIconBg: 'bg-[#06d6a0]',
  drawerIconText: 'text-white',
  drawerSubtitleText: 'text-[#059669]',
  cardBg: 'bg-[#f6f8f7] hover:bg-[#eef2f0]',
  cardBorder: 'border-[#06d6a0]/40',
  cardText: 'text-[#1f2a2e]',
  cardSubtext: 'text-[#059669]',
  cardIconBg: 'bg-[#06d6a0]/15',
  cardIconText: 'text-[#059669]',
  chevronText: 'text-[#6a7f84] group-hover:text-[#1c4a59]'
};

const AMBER_THEME: QuickActionItem['theme'] = {
  drawerBg: 'bg-[#e1c594]/30 hover:bg-[#e1c594]/50',
  drawerBorder: 'border-[#e4ae67]/40',
  drawerIconBg: 'bg-[#faae57]',
  drawerIconText: 'text-[#1f2a2e]',
  drawerSubtitleText: 'text-[#807654]',
  cardBg: 'bg-[#f6f8f7] hover:bg-[#f9f4eb]',
  cardBorder: 'border-[#e1c594]',
  cardText: 'text-[#1f2a2e]',
  cardSubtext: 'text-[#807654]',
  cardIconBg: 'bg-[#faae57]/25',
  cardIconText: 'text-[#1c4a59]',
  chevronText: 'text-[#6a7f84] group-hover:text-[#1c4a59]'
};

const PRIMARY_DARK_TEAL_THEME: QuickActionItem['theme'] = {
  drawerBg: 'bg-[#f6f8f7] hover:bg-white',
  drawerBorder: 'border-[#bac4c6]',
  drawerIconBg: 'bg-[#1c4a59]',
  drawerIconText: 'text-white',
  drawerSubtitleText: 'text-[#6a7f84]',
  cardBg: 'bg-[#1c4a59] hover:bg-[#163b47]',
  cardBorder: 'border-[#1c4a59]',
  cardText: 'text-white',
  cardSubtext: 'text-white/75',
  cardIconBg: 'bg-white/10',
  cardIconText: 'text-[#faae57]',
  chevronText: 'text-[#faae57]'
};

export function getPortalRoleLabel(role?: string | null, isCreatorConsole = false): string {
  if (isCreatorConsole || role === 'creator') return 'Creator Console';
  switch (String(role || '').toLowerCase()) {
    case 'super_admin':
      return 'Super Admin Portal';
    case 'admin':
      return 'Admin Portal';
    case 'headteacher':
      return 'Headteacher Portal';
    case 'hod':
      return 'HOD Portal';
    case 'teacher':
      return 'Teacher Portal';
    case 'bursar':
    case 'accountant':
      return 'Bursar Portal';
    case 'student':
      return 'Student Portal';
    case 'parent':
      return 'Parent Portal';
    default:
      return 'Staff Portal';
  }
}

export function getQuickActionsForRole(
  role?: string | null,
  isCreatorConsole = false
): QuickActionItem[] {
  const normalizedRole = String(role || 'admin').toLowerCase();

  if (isCreatorConsole || normalizedRole === 'creator') {
    return [
      {
        id: 'creator-generate-license',
        title: 'Generate License Key',
        subtitle: 'Issue & email key',
        icon: Key,
        targetView: 'creator',
        creatorPanel: 'license_management',
        theme: AMBER_THEME
      },
      {
        id: 'creator-provision-tenant',
        title: 'Provision School Tenant',
        subtitle: 'Onboard institution',
        icon: Building,
        targetView: 'creator',
        creatorPanel: 'school_management',
        theme: TEAL_THEME
      },
      {
        id: 'creator-run-diagnostics',
        title: 'Run Diagnostics Suite',
        subtitle: 'Verify E2E health',
        icon: Activity,
        targetView: 'creator',
        creatorPanel: 'frontend_test_runner',
        theme: EMERALD_THEME
      },
      {
        id: 'creator-telemetry-sync',
        title: 'Live Telemetry Sync',
        subtitle: 'Sync presence & DB',
        icon: RefreshCw,
        targetView: 'creator',
        creatorPanel: 'dashboard',
        specialAction: 'refresh_telemetry',
        theme: PRIMARY_DARK_TEAL_THEME
      }
    ];
  }

  switch (normalizedRole) {
    case 'hod':
      return [
        {
          id: 'hod-vet-notes',
          title: 'Vet Lesson Notes',
          subtitle: 'Review & approve',
          icon: ClipboardCheck,
          targetView: 'lesson_notes',
          theme: AMBER_THEME
        },
        {
          id: 'hod-enter-scores',
          title: 'Enter Exam Scores',
          subtitle: 'Continuous assess',
          icon: Award,
          targetView: 'results',
          theme: PRIMARY_DARK_TEAL_THEME
        },
        {
          id: 'hod-exam-analysis',
          title: 'Exam Analysis',
          subtitle: 'Department metrics',
          icon: BarChart3,
          targetView: 'exam_analysis',
          theme: TEAL_THEME
        },
        {
          id: 'hod-take-attendance',
          title: 'Take Attendance',
          subtitle: 'Daily class roll',
          icon: CheckSquare,
          targetView: 'attendance',
          theme: EMERALD_THEME
        }
      ];

    case 'teacher':
      return [
        {
          id: 'teacher-take-attendance',
          title: 'Take Attendance',
          subtitle: 'Daily class roll',
          icon: CheckSquare,
          targetView: 'attendance',
          theme: EMERALD_THEME
        },
        {
          id: 'teacher-enter-scores',
          title: 'Enter Exam Scores',
          subtitle: 'Term assessment',
          icon: Award,
          targetView: 'results',
          theme: PRIMARY_DARK_TEAL_THEME
        },
        {
          id: 'teacher-lesson-notes',
          title: 'Submit Lesson Notes',
          subtitle: 'Weekly lesson plan',
          icon: ClipboardCheck,
          targetView: 'lesson_notes',
          theme: TEAL_THEME
        },
        {
          id: 'teacher-set-reminder',
          title: 'Set Reminder',
          subtitle: 'Add to schedule',
          icon: Clock,
          targetView: 'timetable',
          specialAction: 'quick_reminder',
          theme: AMBER_THEME
        }
      ];

    case 'bursar':
    case 'accountant':
      return [
        {
          id: 'bursar-record-fees',
          title: 'Record Fee Payment',
          subtitle: 'MoMo / Cash receipt',
          icon: Wallet,
          targetView: 'fees',
          theme: PRIMARY_DARK_TEAL_THEME
        },
        {
          id: 'bursar-payroll',
          title: 'Staff Payroll',
          subtitle: 'Salaries & payslips',
          icon: CreditCard,
          targetView: 'payroll',
          theme: AMBER_THEME
        },
        {
          id: 'bursar-reports',
          title: 'Financial Reports',
          subtitle: 'Ledgers & summaries',
          icon: FileText,
          targetView: 'reports',
          theme: TEAL_THEME
        },
        {
          id: 'bursar-inventory',
          title: 'Store & Inventory',
          subtitle: 'Stock & supplies',
          icon: Package,
          targetView: 'inventory',
          theme: EMERALD_THEME
        }
      ];

    case 'student':
      return [
        {
          id: 'student-report-card',
          title: 'My Report Card',
          subtitle: 'Grades & terminal',
          icon: Award,
          targetView: 'results',
          theme: PRIMARY_DARK_TEAL_THEME
        },
        {
          id: 'student-timetable',
          title: 'Class Timetable',
          subtitle: 'Daily periods',
          icon: Calendar,
          targetView: 'timetable',
          theme: TEAL_THEME
        },
        {
          id: 'student-fees',
          title: 'Fee Statement',
          subtitle: 'Balance & receipts',
          icon: Wallet,
          targetView: 'fees',
          theme: AMBER_THEME
        },
        {
          id: 'student-evoting',
          title: 'Student E-Voting',
          subtitle: 'Campus elections',
          icon: Vote,
          targetView: 'evoting',
          theme: EMERALD_THEME
        }
      ];

    case 'parent':
      return [
        {
          id: 'parent-pay-fees',
          title: 'Pay / View Fees',
          subtitle: 'Tuition & receipts',
          icon: Wallet,
          targetView: 'fees',
          theme: PRIMARY_DARK_TEAL_THEME
        },
        {
          id: 'parent-ward-results',
          title: 'Ward Report Card',
          subtitle: 'Terminal scores',
          icon: BookOpen,
          targetView: 'results',
          theme: AMBER_THEME
        },
        {
          id: 'parent-ward-attendance',
          title: 'Ward Attendance',
          subtitle: 'Daily roll logs',
          icon: CheckSquare,
          targetView: 'attendance',
          theme: EMERALD_THEME
        },
        {
          id: 'parent-timetable',
          title: 'Class Schedule',
          subtitle: 'Weekly timetable',
          icon: Calendar,
          targetView: 'timetable',
          theme: TEAL_THEME
        }
      ];

    case 'admin':
    case 'super_admin':
    case 'headteacher':
    default:
      return [
        {
          id: 'admin-manage-students',
          title: 'Manage Students',
          subtitle: 'Registry & profiles',
          icon: Users,
          targetView: 'students',
          theme: TEAL_THEME
        },
        {
          id: 'admin-take-attendance',
          title: 'Take Attendance',
          subtitle: 'Daily roll call',
          icon: CheckSquare,
          targetView: 'attendance',
          theme: EMERALD_THEME
        },
        {
          id: 'admin-record-fees',
          title: 'Record Fee Payment',
          subtitle: 'MoMo / Cash ledger',
          icon: Wallet,
          targetView: 'fees',
          theme: AMBER_THEME
        },
        {
          id: 'admin-enter-results',
          title: 'Enter Exam Results',
          subtitle: 'Term assessment',
          icon: Award,
          targetView: 'results',
          theme: PRIMARY_DARK_TEAL_THEME
        }
      ];
  }
}
