export interface PageIdentityOverride {
  title: string;
  shortTitle?: string;
  category?: string;
  subtitle?: string;
  path?: string;
}

export interface PageIdentityMeta {
  id: string;
  path: string;
  title: string;
  shortTitle: string;
  category: string;
  subtitle: string;
  roleOverrides?: Record<string, PageIdentityOverride>;
}

export const VIEW_METADATA: Record<string, PageIdentityMeta> = {
  dashboard: {
    id: 'dashboard',
    path: '/dashboard',
    title: 'Executive Campus Dashboard',
    shortTitle: 'Dashboard',
    category: 'Portal Home',
    subtitle: 'Real-time institutional KPIs, attendance trends, academic performance, and financial summaries.',
    roleOverrides: {
      teacher: {
        title: 'Teacher Campus Dashboard',
        shortTitle: 'My Dashboard',
        category: 'Portal Home',
        subtitle: 'Assigned classes, daily timetable schedule, attendance registers, and grading tasks.'
      },
      hod: {
        title: 'Head of Department Dashboard',
        shortTitle: 'HOD Dashboard',
        category: 'Portal Home',
        subtitle: 'Departmental lesson note vetting, subject performance analytics, and staff supervision.'
      },
      accountant: {
        title: 'Bursary & Finance Dashboard',
        shortTitle: 'Finance Dashboard',
        category: 'Finance & Bursary',
        subtitle: 'Tuition fee collections, outstanding arrears, staff payroll disbursements, and expenditure tracking.'
      },
      student: {
        title: 'Student Portal Dashboard',
        shortTitle: 'My Dashboard',
        category: 'Student Portal',
        subtitle: 'Personal academic progress, class timetable, attendance record, and terminal report overview.'
      },
      parent: {
        title: 'Parent & Guardian Dashboard',
        shortTitle: 'Ward Dashboard',
        category: 'Parent Portal',
        subtitle: 'Ward academic performance, daily attendance alerts, terminal reports, and school fee balances.'
      }
    }
  },
  students: {
    id: 'students',
    path: '/students',
    title: 'Student Directory & Admissions',
    shortTitle: 'Students',
    category: 'Student Affairs',
    subtitle: 'Complete student enrollment registry, biographical profiles, class placements, and batch promotions.'
  },
  academic: {
    id: 'academic',
    path: '/academic',
    title: 'Academic & Staff Management',
    shortTitle: 'Academics',
    category: 'Academic Operations',
    subtitle: 'Manage teaching staff profiles, class streams, NaCCA curriculum subjects, and duty rosters.'
  },
  timetable: {
    id: 'timetable',
    path: '/timetable',
    title: 'Master School Timetable',
    shortTitle: 'Timetable',
    category: 'Academic Operations',
    subtitle: 'Automated conflict-free period scheduling for classes, subject teachers, and daily assembly blocks.',
    roleOverrides: {
      student: {
        title: 'My Class Timetable',
        shortTitle: 'My Timetable',
        category: 'Student Portal',
        subtitle: 'Weekly class period schedule, assigned subject teachers, and break times.'
      },
      parent: {
        title: 'Ward Class Timetable',
        shortTitle: 'Ward Timetable',
        category: 'Parent Portal',
        subtitle: 'Weekly instructional period schedule and subject allocations for your ward.'
      }
    }
  },
  duty_roster: {
    id: 'duty_roster',
    path: '/duty-roster',
    title: 'Teachers Duty Roster & Logbook',
    shortTitle: 'Duty Roster',
    category: 'Academic Operations',
    subtitle: 'Weekly staff supervision assignments, Senior on Duty designations, and daily campus occurrence logs.'
  },
  lesson_notes: {
    id: 'lesson_notes',
    path: '/lesson-notes',
    title: 'NaCCA Lesson Notes & Vetting',
    shortTitle: 'Lesson Notes',
    category: 'Academic Operations',
    subtitle: 'Weekly teacher lesson plan preparation, AI-assisted NaCCA alignment, and HOD/Headteacher endorsement.'
  },
  attendance: {
    id: 'attendance',
    path: '/attendance',
    title: 'Daily Attendance Terminal',
    shortTitle: 'Attendance',
    category: 'Academic Operations',
    subtitle: 'Daily class roll call, punctuality tracking, absence reasons, and cumulative term attendance metrics.',
    roleOverrides: {
      student: {
        title: 'My Daily Attendance Record',
        shortTitle: 'My Attendance',
        category: 'Student Portal',
        subtitle: 'Personal daily roll call status, punctuality log, and term attendance percentage.'
      },
      parent: {
        title: 'Ward Attendance & Punctuality Log',
        shortTitle: 'Ward Attendance',
        category: 'Parent Portal',
        subtitle: 'Real-time daily attendance check-ins, absence notifications, and term punctuality record.'
      }
    }
  },
  results: {
    id: 'results',
    path: '/results',
    title: 'Academic Results Terminal',
    shortTitle: 'Results',
    category: 'Assessments & Grading',
    subtitle: 'Continuous Assessment (SBA) exercises, terminal examination marks entry, and subject grade computation.',
    roleOverrides: {
      student: {
        title: 'My Academic Results & Grades',
        shortTitle: 'My Results',
        category: 'Student Portal',
        subtitle: 'Continuous assessment scores, examination marks, and subject grade breakdown.'
      },
      parent: {
        title: 'Ward Academic Results & SBA Scores',
        shortTitle: 'Ward Results',
        category: 'Parent Portal',
        subtitle: 'Detailed class exercises, homework, mid-term tests, and terminal exam scores for your ward.'
      }
    }
  },
  exam_analysis: {
    id: 'exam_analysis',
    path: '/exam-analysis',
    title: 'BECE & WASSCE Exam Analysis',
    shortTitle: 'Exam Analysis',
    category: 'Assessments & Grading',
    subtitle: 'External and mock examination aggregate distribution, subject pass rates, and cohort analytics.'
  },
  reports: {
    id: 'reports',
    path: '/reports',
    title: 'Terminal Reports & Broadsheets',
    shortTitle: 'Reports',
    category: 'Assessments & Grading',
    subtitle: 'Official student terminal report cards, class master broadsheets, conduct remarks, and batch printing.',
    roleOverrides: {
      student: {
        title: 'My Terminal Report Cards',
        shortTitle: 'My Reports',
        category: 'Student Portal',
        subtitle: 'Official term academic report sheets, class teacher remarks, and cumulative performance.'
      },
      parent: {
        title: 'Ward Terminal Report Cards',
        shortTitle: 'Ward Reports',
        category: 'Parent Portal',
        subtitle: 'Official downloadable terminal report sheets and headteacher endorsement for your ward.'
      }
    }
  },
  fees: {
    id: 'fees',
    path: '/fees',
    title: 'Fees, Billing & Payments Ledger',
    shortTitle: 'Fees & Billing',
    category: 'Finance & Bursary',
    subtitle: 'Student tuition billing, itemized fee structures, payment receipting, and debtors arrears management.',
    roleOverrides: {
      student: {
        title: 'My School Fees & Payment Receipts',
        shortTitle: 'My Fees',
        category: 'Student Portal',
        subtitle: 'Personal tuition fee statement, payment history, and official bursary receipts.'
      },
      parent: {
        title: 'Ward School Fees & Payment Receipts',
        shortTitle: 'Ward Fees',
        category: 'Parent Portal',
        subtitle: 'Itemized term bill, fee payment history, outstanding balance, and official receipts.'
      }
    }
  },
  payroll: {
    id: 'payroll',
    path: '/payroll',
    title: 'Staff Payroll & Compensation',
    shortTitle: 'Payroll',
    category: 'Finance & Bursary',
    subtitle: 'Monthly salary batch processing, Ghana SSNIT Tier 1/2, GRA PAYE tax schedules, advances, and payslips.',
    roleOverrides: {
      teacher: {
        title: 'My Payslips & Salary Advances',
        shortTitle: 'My Payslips',
        category: 'Staff Self-Service',
        subtitle: 'Personal monthly salary slips, SSNIT & GRA PAYE breakdown, and staff salary advance requests.',
        path: '/my-payslips'
      },
      hod: {
        title: 'My Payslips & Salary Advances',
        shortTitle: 'My Payslips',
        category: 'Staff Self-Service',
        subtitle: 'Personal monthly salary slips, SSNIT & GRA PAYE breakdown, and staff salary advance requests.',
        path: '/my-payslips'
      }
    }
  },
  siren: {
    id: 'siren',
    path: '/siren',
    title: 'Automated Campus Siren Console',
    shortTitle: 'Siren Console',
    category: 'Campus Governance',
    subtitle: 'Programmable school bell schedules, automated period chimes, PA voice broadcasts, and emergency alarms.'
  },
  evoting: {
    id: 'evoting',
    path: '/evoting',
    title: 'Student E-Voting Portal',
    shortTitle: 'E-Voting',
    category: 'Campus Governance',
    subtitle: 'Prefectorial and SRC electoral polls, candidate manifestos, secure balloting, and live results tally.'
  },
  inventory: {
    id: 'inventory',
    path: '/inventory',
    title: 'Campus Inventory & Expense Registry',
    shortTitle: 'Inventory & Expenses',
    category: 'Finance & Bursary',
    subtitle: 'Storehouse stock tracking, asset issuance logs, low-stock alerts, and institutional expenditure ledger.'
  },
  users: {
    id: 'users',
    path: '/users',
    title: 'User Accounts & Role Permissions',
    shortTitle: 'Users & Roles',
    category: 'System Administration',
    subtitle: 'Portal account provisioning, role-based access control (RBAC), security credentials, and invite links.'
  },
  settings: {
    id: 'settings',
    path: '/settings',
    title: 'School Profile & System Settings',
    shortTitle: 'Settings',
    category: 'System Administration',
    subtitle: 'Institutional branding, academic session dates, grading scales, SMS gateway, and database backup tools.'
  },
  creator: {
    id: 'creator',
    path: '/creator',
    title: 'Creator Command Console',
    shortTitle: 'Creator Console',
    category: 'Platform Control',
    subtitle: 'Multi-tenant school licensing, commercial CRM, cloud telemetry, security audit logs, and global configuration.'
  },
  school_management: {
    id: 'school_management',
    path: '/schools',
    title: 'Multi-Tenant Schools Registry',
    shortTitle: 'Schools Registry',
    category: 'Platform Control',
    subtitle: 'Onboard client institutions, switch active tenant contexts, and manage per-school module entitlements.'
  }
};

export const CREATOR_PANEL_METADATA: Record<string, { title: string; category: string; subtitle: string; path: string }> = {
  dashboard: {
    title: 'Creator Executive Overview',
    category: 'Core Suite',
    subtitle: 'Global multi-tenant platform metrics, active user presence, database record distribution, and revenue health.',
    path: '/creator/dashboard'
  },
  frontend_test_runner: {
    title: 'Automated Frontend Test Suite',
    category: 'Core Suite',
    subtitle: 'Interactive component verification, API contract diagnostics, and browser runtime integrity checks.',
    path: '/creator/frontend-test-suite'
  },
  school_management: {
    title: 'Multi-Tenant School Management',
    category: 'Core Suite',
    subtitle: 'Provision client schools, manage institutional tenant isolation, and switch active administrative context.',
    path: '/creator/school-management'
  },
  reports_analytics: {
    title: 'Platform Reports & Analytics',
    category: 'Core Suite',
    subtitle: 'Cross-tenant adoption metrics, monthly database growth trajectories, and module utilization benchmarks.',
    path: '/creator/reports-analytics'
  },
  feature_management: {
    title: 'Tenant Feature & Module Entitlements',
    category: 'Core Suite',
    subtitle: 'Enable or restrict specific portal modules dynamically across licensed school deployments.',
    path: '/creator/feature-management'
  },
  system_configuration: {
    title: 'Global System Configuration',
    category: 'Core Suite',
    subtitle: 'Master academic year defaults, global lockout announcements, and clean client handover utilities.',
    path: '/creator/system-configuration'
  },
  subscription_billing: {
    title: 'Subscription Plans & Tenant Billing',
    category: 'Sales Suite',
    subtitle: 'Manage institutional subscription tiers, renewal cycles, and commercial pricing calculators.',
    path: '/creator/subscription-billing'
  },
  crm: {
    title: 'Institutional Sales CRM & Leads',
    category: 'Sales Suite',
    subtitle: 'Track prospective client schools, onboarding pipelines, commercial proposals, and follow-up tasks.',
    path: '/creator/crm'
  },
  finance: {
    title: 'Platform Revenue & Finance Ledger',
    category: 'Sales Suite',
    subtitle: 'Monitor software license collections, setup fees, annual recurring revenue (ARR), and invoices.',
    path: '/creator/finance'
  },
  marketing: {
    title: 'Growth & Institutional Marketing',
    category: 'Sales Suite',
    subtitle: 'Outreach campaigns, commercial proposal templates, and school onboarding conversion tracking.',
    path: '/creator/marketing'
  },
  license_management: {
    title: 'Cryptographic License Management',
    category: 'Sales Suite',
    subtitle: 'Generate, activate, extend, or revoke tenant software license keys and trial periods.',
    path: '/creator/license-management'
  },
  customer_support: {
    title: 'Client Support & Helpdesk Tickets',
    category: 'Services Suite',
    subtitle: 'Respond to school administrator support requests, bug reports, and live assistance threads.',
    path: '/creator/customer-support'
  },
  notifications: {
    title: 'Global Broadcast & Notifications',
    category: 'Services Suite',
    subtitle: 'Dispatch system-wide announcements, maintenance alerts, and targeted tenant notifications.',
    path: '/creator/notifications'
  },
  cms: {
    title: 'Landing Page & Portal CMS',
    category: 'Services Suite',
    subtitle: 'Customize public portal landing copy, institutional onboarding guides, and documentation.',
    path: '/creator/cms'
  },
  mobile_app_management: {
    title: 'PWA & Mobile App Distribution',
    category: 'Services Suite',
    subtitle: 'Configure Progressive Web App manifests, offline caching policies, and mobile install prompts.',
    path: '/creator/mobile-app-management'
  },
  user_management: {
    title: 'Global User Directory & Presence',
    category: 'Security Suite',
    subtitle: 'Monitor real-time online sessions, inspect cross-tenant user accounts, and manage role privileges.',
    path: '/creator/user-management'
  },
  ai_administration: {
    title: 'AI Engine & Prompt Administration',
    category: 'Security Suite',
    subtitle: 'Configure AI lesson note vetting parameters, model quotas, and academic assistant guardrails.',
    path: '/creator/ai-administration'
  },
  api_management: {
    title: 'API Gateway & Webhook Management',
    category: 'Security Suite',
    subtitle: 'Inspect REST endpoint health, rate limits, external webhook keys, and service latencies.',
    path: '/creator/api-management'
  },
  integrations: {
    title: 'Third-Party Cloud Integrations',
    category: 'Security Suite',
    subtitle: 'Manage Supabase PostgreSQL, Google Workspace OAuth, Arkesel SMS gateway, and payment connectors.',
    path: '/creator/integrations'
  },
  database_diagnostics: {
    title: 'Supabase & IndexedDB Diagnostics',
    category: 'Security Suite',
    subtitle: 'Verify relational table schemas, run live connectivity checks, and inspect sync queues.',
    path: '/creator/database-diagnostics'
  },
  backup_recovery: {
    title: 'Cloud Backup & Disaster Recovery',
    category: 'Security Suite',
    subtitle: 'Export full institutional snapshots, restore point-in-time backups, and verify data durability.',
    path: '/creator/backup-recovery'
  },
  security_center: {
    title: 'Platform Security & Access Control',
    category: 'Security Suite',
    subtitle: 'Enforce authentication policies, session timeouts, tenant RLS boundaries, and threat protection.',
    path: '/creator/security-center'
  },
  audit_logs: {
    title: 'Immutable System Audit Logs',
    category: 'Security Suite',
    subtitle: 'Trace chronological administrative actions, login events, grade modifications, and payroll runs.',
    path: '/creator/audit-logs'
  },
  developer_console: {
    title: 'Developer Telemetry & SQL Console',
    category: 'Security Suite',
    subtitle: 'Low-level runtime diagnostics, environment inspection, and schema migration verification.',
    path: '/creator/developer-console'
  },
  creator_profile: {
    title: 'Master Creator Profile & Credentials',
    category: 'Security Suite',
    subtitle: 'Manage platform owner identity, contact channels, security keys, and administrative preferences.',
    path: '/creator/creator-profile'
  }
};

export function getPageIdentity(viewId: string, userRole?: string | null): {
  id: string;
  path: string;
  title: string;
  shortTitle: string;
  category: string;
  subtitle: string;
} {
  const normalizedView = String(viewId || 'dashboard').trim().toLowerCase();
  const normalizedRole = String(userRole || '').trim().toLowerCase();
  const base = VIEW_METADATA[normalizedView];

  if (!base) {
    const fallbackTitle = normalizedView
      .replace(/[_-]+/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase());
    return {
      id: normalizedView,
      path: `/${normalizedView.replace(/_/g, '-')}`,
      title: fallbackTitle,
      shortTitle: fallbackTitle,
      category: 'Portal Module',
      subtitle: `Manage and review ${fallbackTitle.toLowerCase()} records and operations.`
    };
  }

  const override = normalizedRole && base.roleOverrides ? base.roleOverrides[normalizedRole] : undefined;
  return {
    id: base.id,
    path: override?.path || base.path,
    title: override?.title || base.title,
    shortTitle: override?.shortTitle || base.shortTitle,
    category: override?.category || base.category,
    subtitle: override?.subtitle || base.subtitle
  };
}

export function getCreatorPanelIdentity(panelId: string): {
  id: string;
  path: string;
  title: string;
  category: string;
  subtitle: string;
} {
  const normalized = String(panelId || 'dashboard').trim().toLowerCase();
  const meta = CREATOR_PANEL_METADATA[normalized];
  if (meta) {
    return {
      id: normalized,
      ...meta
    };
  }
  const fallbackTitle = normalized
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
  return {
    id: normalized,
    path: `/creator/${normalized.replace(/_/g, '-')}`,
    title: fallbackTitle,
    category: 'Creator Console',
    subtitle: `Manage platform-wide ${fallbackTitle.toLowerCase()} settings and operations.`
  };
}

export function resolveViewFromPathname(pathname: string): string | null {
  const clean = String(pathname || '')
    .trim()
    .toLowerCase()
    .replace(/\/+$/, '');

  if (!clean || clean === '' || clean === '/' || clean === '/welcome') {
    return null;
  }

  if (clean.startsWith('/creator')) {
    return 'creator';
  }

  if (clean === '/my-payslips') {
    return 'payroll';
  }

  for (const [viewKey, meta] of Object.entries(VIEW_METADATA)) {
    if (meta.path.toLowerCase() === clean || `/${viewKey}` === clean || `/${viewKey.replace(/_/g, '-')}` === clean) {
      return viewKey;
    }
  }

  return null;
}

export function resolveCreatorPanelFromPathname(pathname: string): string | null {
  const clean = String(pathname || '')
    .trim()
    .toLowerCase()
    .replace(/\/+$/, '');

  if (!clean.startsWith('/creator/')) {
    return null;
  }

  const subSlug = clean.replace('/creator/', '');
  for (const [panelId, meta] of Object.entries(CREATOR_PANEL_METADATA)) {
    if (meta.path.toLowerCase() === clean || panelId === subSlug || panelId.replace(/_/g, '-') === subSlug) {
      return panelId;
    }
  }

  return null;
}
