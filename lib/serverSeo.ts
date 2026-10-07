/**
 * Server-Side SEO & SPA Crawler Optimization Module
 * Provides route registry, route-specific metadata injection, crawlable semantic fallback HTML,
 * and genuine HTTP 404 error rendering to prevent Google Search Console Soft 404 penalties.
 */

export interface RouteSeoMeta {
  path: string;
  canonicalPath: string;
  title: string;
  description: string;
  heading: string;
  subheading: string;
  fallbackBodyHtml: string;
  robots?: string;
}

export const CANONICAL_BASE_URL = 'https://www.schoolsphere.xyz';

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Route metadata dictionary for all public and portal views.
 */
export const ROUTE_REGISTRY: Record<string, RouteSeoMeta> = {
  '/': {
    path: '/',
    canonicalPath: '/',
    title: 'SchoolSphere — Smart School Management Platform',
    description: 'SchoolSphere is the all-in-one school management system for Ghanaian basic schools, SHS, and academies with NaCCA grading, terminal reports, and fee tracking.',
    heading: 'SchoolSphere — Smart School Management Platform',
    subheading: 'Complete institutional operating system engineered for Ghanaian basic schools, junior high, senior high, and private academies.',
    fallbackBodyHtml: `
<div style="font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:960px;margin:40px auto;padding:24px;color:#1f2a2e;background:#ffffff;border-radius:16px;border:1px solid #bac4c6">
  <header style="text-align:center;margin-bottom:32px">
    <h1 style="font-size:32px;font-weight:800;color:#1c4a59;margin:0 0 12px">SchoolSphere — Smart School Management Platform</h1>
    <p style="font-size:16px;color:#6a7f84;line-height:1.6;margin:0">Complete institutional operating system engineered for Ghanaian basic schools, junior high, senior high, and private academies.</p>
  </header>
  <main>
    <section style="margin-bottom:28px">
      <h2 style="font-size:20px;font-weight:700;color:#1c4a59;margin-bottom:10px">All-in-One Campus Management</h2>
      <p style="font-size:15px;line-height:1.6;color:#334155">Streamline student admissions, continuous assessment (SBA), terminal report cards, MoMo school fee payments, staff payroll, automated campus siren schedules, and offline-resilient data synchronization.</p>
    </section>
    <section style="margin-bottom:28px">
      <h3 style="font-size:18px;font-weight:600;color:#1c4a59;margin-bottom:10px">Core Institutional Modules</h3>
      <ul style="font-size:14px;line-height:1.8;color:#475569;padding-left:20px">
        <li><strong>Continuous Assessment &amp; Grading:</strong> NaCCA 50/50 standard, SBA marks processing, and BECE/WASSCE performance analytics.</li>
        <li><strong>Terminal Reports &amp; Broadsheets:</strong> Automated grade computation, conduct remarks, and batch printing.</li>
        <li><strong>Finance &amp; Bursary:</strong> Tuition billing, Mobile Money integration, itemized fee receipts, and staff payroll schedules.</li>
        <li><strong>Campus Governance:</strong> Master timetable scheduling, teacher duty rosters, and programmable campus siren chimes.</li>
      </ul>
    </section>
    <nav style="display:flex;gap:16px;flex-wrap:wrap;margin-top:24px;padding-top:20px;border-top:1px solid #bac4c6">
      <a href="/portal" style="display:inline-block;padding:10px 20px;background:#1c4a59;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600">Access Portal</a>
      <a href="/sign-in" style="display:inline-block;padding:10px 20px;background:#faae57;color:#1f2a2e;text-decoration:none;border-radius:8px;font-weight:600">Staff &amp; Student Sign In</a>
      <a href="/privacy" style="display:inline-block;padding:10px 16px;color:#1c4a59;text-decoration:underline">Privacy Policy</a>
      <a href="/terms" style="display:inline-block;padding:10px 16px;color:#1c4a59;text-decoration:underline">Terms of Service</a>
    </nav>
  </main>
</div>`
  },
  '/welcome': {
    path: '/welcome',
    canonicalPath: '/',
    title: 'Welcome to SchoolSphere — Smart School Management Platform',
    description: 'Get started with SchoolSphere. Discover how Ghanaian schools simplify grading, attendance, terminal reports, and student fee collections.',
    heading: 'Welcome to SchoolSphere',
    subheading: 'Transform your school administration with automated grading, real-time attendance, and instant terminal reports.',
    fallbackBodyHtml: `
<div style="font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:800px;margin:40px auto;padding:24px;color:#1f2a2e">
  <h1 style="font-size:28px;font-weight:800;color:#1c4a59">Welcome to SchoolSphere</h1>
  <p style="font-size:15px;line-height:1.6;color:#475569">SchoolSphere empowers educational institutions across Ghana with automated terminal report card generation, real-time fee tracking, and master timetable automation.</p>
  <nav style="display:flex;gap:12px;margin-top:20px">
    <a href="/sign-in" style="padding:10px 18px;background:#1c4a59;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600">Sign In</a>
    <a href="/portal" style="padding:10px 18px;background:#faae57;color:#1f2a2e;text-decoration:none;border-radius:8px;font-weight:600">Enter Portal</a>
  </nav>
</div>`
  },
  '/sign-in': {
    path: '/sign-in',
    canonicalPath: '/sign-in',
    title: 'Sign In & Portal Access — SchoolSphere',
    description: 'Secure authentication gateway for school administrators, teachers, students, and parents accessing SchoolSphere campus portals.',
    heading: 'Sign In to SchoolSphere',
    subheading: 'Secure institutional access for headteachers, administrators, teachers, parents, and students.',
    fallbackBodyHtml: `
<div style="font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:40px auto;padding:24px;color:#1f2a2e;background:#ffffff;border-radius:12px;border:1px solid #bac4c6">
  <h1 style="font-size:26px;font-weight:800;color:#1c4a59">Sign In to SchoolSphere</h1>
  <p style="font-size:14px;color:#6a7f84;line-height:1.5">Enter your institutional credentials to access your administrative dashboard, teacher grading terminal, or student portal.</p>
  <div style="margin-top:24px;padding:16px;background:#f6f8f7;border-radius:8px;font-size:13px;color:#475569">
    <p style="margin:0 0 8px"><strong>Supported User Roles:</strong></p>
    <p style="margin:0">Headteachers, Administrators, Teachers, HODs, Bursars &amp; Accountants, Students, and Parents.</p>
  </div>
  <nav style="display:flex;gap:12px;margin-top:24px">
    <a href="/" style="color:#1c4a59;text-decoration:underline;font-size:14px">&larr; Return to Homepage</a>
    <a href="/portal" style="color:#1c4a59;text-decoration:underline;font-size:14px">Campus Portal &rarr;</a>
  </nav>
</div>`
  },
  '/login': {
    path: '/login',
    canonicalPath: '/sign-in',
    title: 'Sign In & Portal Access — SchoolSphere',
    description: 'Secure authentication gateway for school administrators, teachers, students, and parents accessing SchoolSphere campus portals.',
    heading: 'Sign In to SchoolSphere',
    subheading: 'Secure institutional access for headteachers, administrators, teachers, parents, and students.',
    fallbackBodyHtml: `
<div style="font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:40px auto;padding:24px;color:#1f2a2e">
  <h1 style="font-size:26px;font-weight:800;color:#1c4a59">Sign In to SchoolSphere</h1>
  <nav style="display:flex;gap:12px;margin-top:20px">
    <a href="/sign-in" style="padding:10px 18px;background:#1c4a59;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600">Proceed to Login</a>
    <a href="/" style="color:#1c4a59;text-decoration:underline">Home</a>
  </nav>
</div>`
  },
  '/portal': {
    path: '/portal',
    canonicalPath: '/portal',
    title: 'Institutional Portal Gateway — SchoolSphere',
    description: 'Access school administrative consoles, teacher grading terminals, student academic reports, and parent communication dashboards.',
    heading: 'Institutional Campus Portal',
    subheading: 'Unified operations hub for student records, academic grading, fee collection, and timetable management.',
    fallbackBodyHtml: `
<div style="font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:800px;margin:40px auto;padding:24px;color:#1f2a2e;background:#ffffff;border-radius:12px;border:1px solid #bac4c6">
  <h1 style="font-size:28px;font-weight:800;color:#1c4a59">Institutional Campus Portal</h1>
  <p style="font-size:15px;color:#475569;line-height:1.6">Welcome to the SchoolSphere portal gateway. Select your institutional module to manage admissions, student assessments, bursary fee ledgers, and staff operations.</p>
  <nav style="display:flex;gap:12px;flex-wrap:wrap;margin-top:24px">
    <a href="/dashboard" style="padding:10px 18px;background:#1c4a59;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600">Dashboard</a>
    <a href="/sign-in" style="padding:10px 18px;background:#faae57;color:#1f2a2e;text-decoration:none;border-radius:8px;font-weight:600">Sign In</a>
    <a href="/" style="padding:10px 18px;border:1px solid #bac4c6;color:#1c4a59;text-decoration:none;border-radius:8px;font-weight:600">Homepage</a>
  </nav>
</div>`
  },
  '/privacy': {
    path: '/privacy',
    canonicalPath: '/privacy',
    title: 'Institutional Privacy Policy — SchoolSphere',
    description: 'SchoolSphere privacy policy and regulatory compliance with Ghana Data Protection Act 2012 (Act 843) and international education records standards.',
    heading: 'Institutional Privacy Policy',
    subheading: 'Commitment to student data privacy, security governance, and statutory compliance with Ghana Data Protection Act 2012 (Act 843).',
    fallbackBodyHtml: `
<div style="font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:800px;margin:40px auto;padding:24px;color:#1f2a2e;background:#ffffff;border-radius:12px;border:1px solid #bac4c6">
  <h1 style="font-size:28px;font-weight:800;color:#1c4a59">Institutional Privacy Policy</h1>
  <p style="font-size:14px;color:#6a7f84">Last updated: February 2026 • Statutory Compliance: Ghana Data Protection Act 2012 (Act 843)</p>
  <section style="margin-top:20px;font-size:15px;line-height:1.6;color:#334155">
    <h2 style="font-size:18px;font-weight:700;color:#1c4a59">1. Student and Institutional Data Protection</h2>
    <p>SchoolSphere enforces strict multi-tenant isolation, database row-level security (RLS), and end-to-end cryptographic protection for all student biographical, assessment, and financial records.</p>
    <h2 style="font-size:18px;font-weight:700;color:#1c4a59">2. Compliance &amp; Confidentiality</h2>
    <p>We do not sell, rent, or monetize educational records. Data access is restricted to authenticated institutional personnel based on verified role-based access control (RBAC).</p>
  </section>
  <nav style="display:flex;gap:12px;margin-top:24px">
    <a href="/" style="color:#1c4a59;text-decoration:underline">&larr; Return to Home</a>
    <a href="/terms" style="color:#1c4a59;text-decoration:underline">Terms of Service</a>
  </nav>
</div>`
  },
  '/terms': {
    path: '/terms',
    canonicalPath: '/terms',
    title: 'Terms of Service & Licensing — SchoolSphere',
    description: 'Terms of service, institutional licensing agreements, acceptable use policies, and subscription SLA for SchoolSphere users.',
    heading: 'Terms of Service & Institutional Licensing',
    subheading: 'Software service terms, subscription warranties, and institutional acceptable use policies for SchoolSphere deployments.',
    fallbackBodyHtml: `
<div style="font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:800px;margin:40px auto;padding:24px;color:#1f2a2e;background:#ffffff;border-radius:12px;border:1px solid #bac4c6">
  <h1 style="font-size:28px;font-weight:800;color:#1c4a59">Terms of Service &amp; Institutional Licensing</h1>
  <p style="font-size:14px;color:#6a7f84">Effective Date: January 2026</p>
  <section style="margin-top:20px;font-size:15px;line-height:1.6;color:#334155">
    <h2 style="font-size:18px;font-weight:700;color:#1c4a59">1. Institutional Software License</h2>
    <p>SchoolSphere grants licensed academic institutions a non-exclusive, multi-user license to operate student management, continuous assessment, and bursary modules.</p>
    <h2 style="font-size:18px;font-weight:700;color:#1c4a59">2. Service Level Agreement (SLA) &amp; Offline Resiliency</h2>
    <p>SchoolSphere provides high availability and offline-first IndexedDB synchronization, ensuring seamless continuous grading even during local internet interruptions.</p>
  </section>
  <nav style="display:flex;gap:12px;margin-top:24px">
    <a href="/" style="color:#1c4a59;text-decoration:underline">&larr; Return to Home</a>
    <a href="/privacy" style="color:#1c4a59;text-decoration:underline">Privacy Policy</a>
  </nav>
</div>`
  },
  '/sitemap': {
    path: '/sitemap',
    canonicalPath: '/sitemap',
    title: 'Institutional Site Map & Directory — SchoolSphere',
    description: 'Complete directory of SchoolSphere public pages, student portals, teacher grading terminals, and compliance documentation.',
    heading: 'Site Map & Institutional Directory',
    subheading: 'Explore all public resources, administrative portals, and legal disclosures.',
    fallbackBodyHtml: `
<div style="font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:800px;margin:40px auto;padding:24px;color:#1f2a2e;background:#ffffff;border-radius:12px;border:1px solid #bac4c6">
  <h1 style="font-size:28px;font-weight:800;color:#1c4a59">Site Map &amp; Institutional Directory</h1>
  <ul style="font-size:15px;line-height:2;color:#334155;padding-left:20px;margin-top:16px">
    <li><a href="/" style="color:#1c4a59;font-weight:600">Home &amp; Overview</a></li>
    <li><a href="/sign-in" style="color:#1c4a59;font-weight:600">Sign In &amp; Authentication</a></li>
    <li><a href="/portal" style="color:#1c4a59;font-weight:600">Institutional Campus Portal</a></li>
    <li><a href="/privacy" style="color:#1c4a59;font-weight:600">Institutional Privacy Policy</a></li>
    <li><a href="/terms" style="color:#1c4a59;font-weight:600">Terms of Service &amp; Licensing</a></li>
  </ul>
</div>`
  },

  // Portal Modules
  '/dashboard': {
    path: '/dashboard',
    canonicalPath: '/dashboard',
    title: 'Executive Campus Dashboard — SchoolSphere',
    description: 'Real-time institutional KPIs, attendance trends, continuous assessment performance, and bursary summaries on SchoolSphere.',
    heading: 'Executive Campus Dashboard',
    subheading: 'Real-time institutional metrics, daily attendance registers, and academic progress.',
    fallbackBodyHtml: `
<div style="font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:800px;margin:40px auto;padding:24px;color:#1f2a2e">
  <h1 style="font-size:26px;font-weight:800;color:#1c4a59">Executive Campus Dashboard</h1>
  <p style="font-size:14px;color:#6a7f84">Loading real-time institutional metrics, class attendance, and financial analytics...</p>
</div>`
  },
  '/students': {
    path: '/students',
    canonicalPath: '/students',
    title: 'Student Directory & Admissions — SchoolSphere',
    description: 'Comprehensive student enrollment registry, biographical profiles, class allocations, and batch promotions for schools in Ghana.',
    heading: 'Student Directory & Admissions',
    subheading: 'Complete student biographical registry, admission numbers, and class stream assignments.',
    fallbackBodyHtml: `
<div style="font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:800px;margin:40px auto;padding:24px;color:#1f2a2e">
  <h1 style="font-size:26px;font-weight:800;color:#1c4a59">Student Directory &amp; Admissions</h1>
  <p style="font-size:14px;color:#6a7f84">Manage student profiles, enrollments, and batch class promotions.</p>
</div>`
  },
  '/academic': {
    path: '/academic',
    canonicalPath: '/academic',
    title: 'Academic & Staff Management — SchoolSphere',
    description: 'Manage teaching staff profiles, NaCCA curriculum subjects, class streams, and academic department allocations on SchoolSphere.',
    heading: 'Academic & Staff Management',
    subheading: 'NaCCA curriculum alignment, subject allocation, and class management.',
    fallbackBodyHtml: `
<div style="font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:800px;margin:40px auto;padding:24px;color:#1f2a2e">
  <h1 style="font-size:26px;font-weight:800;color:#1c4a59">Academic &amp; Staff Management</h1>
  <p style="font-size:14px;color:#6a7f84">Curriculum configurations, subject allocations, and staff schedules.</p>
</div>`
  },
  '/timetable': {
    path: '/timetable',
    canonicalPath: '/timetable',
    title: 'Master School Timetable — SchoolSphere',
    description: 'Automated conflict-free period scheduling for classes, subject teachers, and daily assembly blocks on SchoolSphere.',
    heading: 'Master School Timetable',
    subheading: 'Automated period scheduling, teacher workloads, and room allocations.',
    fallbackBodyHtml: `
<div style="font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:800px;margin:40px auto;padding:24px;color:#1f2a2e">
  <h1 style="font-size:26px;font-weight:800;color:#1c4a59">Master School Timetable</h1>
  <p style="font-size:14px;color:#6a7f84">Conflict-free timetable generation and teacher schedules.</p>
</div>`
  },
  '/duty-roster': {
    path: '/duty-roster',
    canonicalPath: '/duty-roster',
    title: 'Teachers Duty Roster & Logbook — SchoolSphere',
    description: 'Weekly staff supervision assignments, Senior on Duty designations, and daily campus occurrence logs on SchoolSphere.',
    heading: 'Teachers Duty Roster & Logbook',
    subheading: 'Campus supervision assignments and daily incident logs.',
    fallbackBodyHtml: `
<div style="font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:800px;margin:40px auto;padding:24px;color:#1f2a2e">
  <h1 style="font-size:26px;font-weight:800;color:#1c4a59">Teachers Duty Roster &amp; Logbook</h1>
  <p style="font-size:14px;color:#6a7f84">Weekly staff supervision assignments and campus records.</p>
</div>`
  },
  '/lesson-notes': {
    path: '/lesson-notes',
    canonicalPath: '/lesson-notes',
    title: 'NaCCA Lesson Notes & Vetting — SchoolSphere',
    description: 'Weekly teacher lesson plan preparation, AI-assisted NaCCA alignment, and HOD/Headteacher endorsement workflow on SchoolSphere.',
    heading: 'NaCCA Lesson Notes & Vetting',
    subheading: 'Curriculum-aligned lesson preparation and institutional vetting workflow.',
    fallbackBodyHtml: `
<div style="font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:800px;margin:40px auto;padding:24px;color:#1f2a2e">
  <h1 style="font-size:26px;font-weight:800;color:#1c4a59">NaCCA Lesson Notes &amp; Vetting</h1>
  <p style="font-size:14px;color:#6a7f84">Teacher lesson planning with NaCCA learning indicators and vetting.</p>
</div>`
  },
  '/attendance': {
    path: '/attendance',
    canonicalPath: '/attendance',
    title: 'Daily Attendance Terminal — SchoolSphere',
    description: 'Daily class roll call, punctuality tracking, absence reasons, and cumulative term attendance metrics on SchoolSphere.',
    heading: 'Daily Attendance Terminal',
    subheading: 'Class roll call and attendance tracking terminal.',
    fallbackBodyHtml: `
<div style="font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:800px;margin:40px auto;padding:24px;color:#1f2a2e">
  <h1 style="font-size:26px;font-weight:800;color:#1c4a59">Daily Attendance Terminal</h1>
  <p style="font-size:14px;color:#6a7f84">Real-time attendance recording and punctuality logs.</p>
</div>`
  },
  '/results': {
    path: '/results',
    canonicalPath: '/results',
    title: 'Academic Results & Grading Terminal — SchoolSphere',
    description: 'Continuous Assessment (SBA) mark entries, terminal examination scores, and 50/50 grade computations on SchoolSphere.',
    heading: 'Academic Results Terminal',
    subheading: 'SBA continuous assessment and terminal examination grading.',
    fallbackBodyHtml: `
<div style="font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:800px;margin:40px auto;padding:24px;color:#1f2a2e">
  <h1 style="font-size:26px;font-weight:800;color:#1c4a59">Academic Results Terminal</h1>
  <p style="font-size:14px;color:#6a7f84">High-performance continuous assessment and exam score recording.</p>
</div>`
  },
  '/exam-analysis': {
    path: '/exam-analysis',
    canonicalPath: '/exam-analysis',
    title: 'BECE & WASSCE Exam Analysis — SchoolSphere',
    description: 'External and mock examination aggregate distribution, subject pass rates, and cohort analytics on SchoolSphere.',
    heading: 'BECE & WASSCE Exam Analysis',
    subheading: 'Cohort performance analytics, pass rates, and aggregate distribution.',
    fallbackBodyHtml: `
<div style="font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:800px;margin:40px auto;padding:24px;color:#1f2a2e">
  <h1 style="font-size:26px;font-weight:800;color:#1c4a59">BECE &amp; WASSCE Exam Analysis</h1>
  <p style="font-size:14px;color:#6a7f84">Examination aggregate distribution and analytics.</p>
</div>`
  },
  '/reports': {
    path: '/reports',
    canonicalPath: '/reports',
    title: 'Terminal Reports & Broadsheets — SchoolSphere',
    description: 'Official student terminal report cards, class broadsheets, conduct remarks, and batch PDF printing on SchoolSphere.',
    heading: 'Terminal Reports & Broadsheets',
    subheading: 'Automated student report cards, broadsheets, and headteacher remarks.',
    fallbackBodyHtml: `
<div style="font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:800px;margin:40px auto;padding:24px;color:#1f2a2e">
  <h1 style="font-size:26px;font-weight:800;color:#1c4a59">Terminal Reports &amp; Broadsheets</h1>
  <p style="font-size:14px;color:#6a7f84">Generate official printable terminal report cards and master broadsheets.</p>
</div>`
  },
  '/fees': {
    path: '/fees',
    canonicalPath: '/fees',
    title: 'Fees, Billing & Payments Ledger — SchoolSphere',
    description: 'Student tuition billing, itemized fee structures, Mobile Money receipts, and debtors arrears management on SchoolSphere.',
    heading: 'Fees, Billing & Payments Ledger',
    subheading: 'Tuition invoicing, payment receipts, and fee balance tracking.',
    fallbackBodyHtml: `
<div style="font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:800px;margin:40px auto;padding:24px;color:#1f2a2e">
  <h1 style="font-size:26px;font-weight:800;color:#1c4a59">Fees, Billing &amp; Payments Ledger</h1>
  <p style="font-size:14px;color:#6a7f84">Manage tuition billing, fee payment collections, and arrears.</p>
</div>`
  },
  '/payroll': {
    path: '/payroll',
    canonicalPath: '/payroll',
    title: 'Staff Payroll & Compensation — SchoolSphere',
    description: 'Monthly salary batch processing, Ghana SSNIT Tier 1/2, GRA PAYE tax schedules, salary advances, and payslips on SchoolSphere.',
    heading: 'Staff Payroll & Compensation',
    subheading: 'Monthly salary disbursements, SSNIT deductions, and tax compliance.',
    fallbackBodyHtml: `
<div style="font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:800px;margin:40px auto;padding:24px;color:#1f2a2e">
  <h1 style="font-size:26px;font-weight:800;color:#1c4a59">Staff Payroll &amp; Compensation</h1>
  <p style="font-size:14px;color:#6a7f84">Manage staff salaries, SSNIT schedules, GRA PAYE, and payslips.</p>
</div>`
  },
  '/my-payslips': {
    path: '/my-payslips',
    canonicalPath: '/my-payslips',
    title: 'Staff Payslips & Compensation — SchoolSphere',
    description: 'Personal monthly salary slips, SSNIT & GRA PAYE breakdown, and staff salary advance requests on SchoolSphere.',
    heading: 'My Payslips & Compensation',
    subheading: 'Personal monthly payslip records and deductions.',
    fallbackBodyHtml: `
<div style="font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:800px;margin:40px auto;padding:24px;color:#1f2a2e">
  <h1 style="font-size:26px;font-weight:800;color:#1c4a59">My Payslips &amp; Compensation</h1>
  <p style="font-size:14px;color:#6a7f84">View monthly payslips, SSNIT deductions, and salary advance requests.</p>
</div>`
  },
  '/siren': {
    path: '/siren',
    canonicalPath: '/siren',
    title: 'Automated Campus Siren Console — SchoolSphere',
    description: 'Programmable school bell schedules, automated period chimes, PA voice broadcasts, and emergency alarms on SchoolSphere.',
    heading: 'Automated Campus Siren Console',
    subheading: 'Programmable school bell schedules, period chimes, and emergency alerts.',
    fallbackBodyHtml: `
<div style="font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:800px;margin:40px auto;padding:24px;color:#1f2a2e">
  <h1 style="font-size:26px;font-weight:800;color:#1c4a59">Automated Campus Siren Console</h1>
  <p style="font-size:14px;color:#6a7f84">Automated campus bells, period change chimes, and emergency sirens.</p>
</div>`
  },
  '/evoting': {
    path: '/evoting',
    canonicalPath: '/evoting',
    title: 'Student E-Voting Portal — SchoolSphere',
    description: 'Prefectorial and SRC electoral polls, candidate manifestos, secure balloting, and live election results tally on SchoolSphere.',
    heading: 'Student E-Voting Portal',
    subheading: 'Secure electronic prefectorial elections and transparent voting tallies.',
    fallbackBodyHtml: `
<div style="font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:800px;margin:40px auto;padding:24px;color:#1f2a2e">
  <h1 style="font-size:26px;font-weight:800;color:#1c4a59">Student E-Voting Portal</h1>
  <p style="font-size:14px;color:#6a7f84">Prefectorial electoral polls, candidate manifestos, and live voting.</p>
</div>`
  },
  '/inventory': {
    path: '/inventory',
    canonicalPath: '/inventory',
    title: 'Campus Inventory & Expense Registry — SchoolSphere',
    description: 'Storehouse stock tracking, asset issuance logs, low-stock alerts, and institutional expenditure ledger on SchoolSphere.',
    heading: 'Campus Inventory & Expense Registry',
    subheading: 'Storehouse inventory tracking, institutional assets, and expenditure ledger.',
    fallbackBodyHtml: `
<div style="font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:800px;margin:40px auto;padding:24px;color:#1f2a2e">
  <h1 style="font-size:26px;font-weight:800;color:#1c4a59">Campus Inventory &amp; Expense Registry</h1>
  <p style="font-size:14px;color:#6a7f84">Manage campus equipment, textbook stocks, and expense ledgers.</p>
</div>`
  },
  '/users': {
    path: '/users',
    canonicalPath: '/users',
    title: 'User Accounts & Role Permissions — SchoolSphere',
    description: 'Portal account provisioning, role-based access control (RBAC), security credentials, and invite links on SchoolSphere.',
    heading: 'User Accounts & Role Permissions',
    subheading: 'Role-based access control (RBAC) and staff account management.',
    fallbackBodyHtml: `
<div style="font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:800px;margin:40px auto;padding:24px;color:#1f2a2e">
  <h1 style="font-size:26px;font-weight:800;color:#1c4a59">User Accounts &amp; Role Permissions</h1>
  <p style="font-size:14px;color:#6a7f84">Manage user accounts, security roles, and permissions.</p>
</div>`
  },
  '/settings': {
    path: '/settings',
    canonicalPath: '/settings',
    title: 'School Profile & System Settings — SchoolSphere',
    description: 'Institutional branding, academic session dates, grading scales, SMS gateway, and backup tools on SchoolSphere.',
    heading: 'School Profile & System Settings',
    subheading: 'School crest, grading policies, academic term dates, and SMS integration.',
    fallbackBodyHtml: `
<div style="font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:800px;margin:40px auto;padding:24px;color:#1f2a2e">
  <h1 style="font-size:26px;font-weight:800;color:#1c4a59">School Profile &amp; System Settings</h1>
  <p style="font-size:14px;color:#6a7f84">Configure institutional branding, term dates, and grading scales.</p>
</div>`
  },
  '/schools': {
    path: '/schools',
    canonicalPath: '/schools',
    title: 'Multi-Tenant Schools Registry — SchoolSphere',
    description: 'Onboard client institutions, switch active tenant contexts, and manage per-school module entitlements on SchoolSphere.',
    heading: 'Multi-Tenant Schools Registry',
    subheading: 'Institutional tenant onboarding and multi-campus registry.',
    fallbackBodyHtml: `
<div style="font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:800px;margin:40px auto;padding:24px;color:#1f2a2e">
  <h1 style="font-size:26px;font-weight:800;color:#1c4a59">Multi-Tenant Schools Registry</h1>
  <p style="font-size:14px;color:#6a7f84">Manage multi-school tenants, licensing, and campus configurations.</p>
</div>`
  },
  '/creator': {
    path: '/creator',
    canonicalPath: '/creator',
    title: 'Creator Command Console — SchoolSphere',
    description: 'Platform owner dashboard, licensing engine, multi-tenant diagnostics, and database telemetry on SchoolSphere.',
    heading: 'Creator Command Console',
    subheading: 'Platform administration and multi-tenant telemetry.',
    fallbackBodyHtml: `
<div style="font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:800px;margin:40px auto;padding:24px;color:#1f2a2e">
  <h1 style="font-size:26px;font-weight:800;color:#1c4a59">Creator Command Console</h1>
  <p style="font-size:14px;color:#6a7f84">Platform telemetry, license key activation, and tenant management.</p>
</div>`
  }
};

/**
 * Resolves SEO metadata for a requested path.
 * Returns null if the path is unknown/invalid (to trigger real HTTP 404).
 */
export function resolveRouteSeo(rawPath: string): RouteSeoMeta | null {
  const cleanPath = (rawPath || '')
    .split('?')[0]
    .split('#')[0]
    .trim()
    .toLowerCase()
    .replace(/\/+$/, '') || '/';

  // Direct match in registry
  if (ROUTE_REGISTRY[cleanPath]) {
    return ROUTE_REGISTRY[cleanPath];
  }

  // Handle dynamic /creator/* panels
  if (cleanPath.startsWith('/creator/')) {
    const subSlug = cleanPath.replace('/creator/', '');
    const formattedTitle = subSlug
      .split(/[-_]/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');

    return {
      path: cleanPath,
      canonicalPath: cleanPath,
      title: `${formattedTitle} — Creator Command Console | SchoolSphere`,
      description: `Administrative panel for ${formattedTitle.toLowerCase()} in SchoolSphere Creator Console.`,
      heading: `${formattedTitle} — Creator Console`,
      subheading: `Platform administration and management tools for ${formattedTitle.toLowerCase()}.`,
      fallbackBodyHtml: `
<div style="font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:800px;margin:40px auto;padding:24px;color:#1f2a2e">
  <h1 style="font-size:26px;font-weight:800;color:#1c4a59">${escapeHtml(formattedTitle)} — Creator Console</h1>
  <p style="font-size:14px;color:#6a7f84">Platform telemetry and management utilities for ${escapeHtml(formattedTitle)}.</p>
</div>`
    };
  }

  // Handle dynamic /schools/* routes
  if (cleanPath.startsWith('/schools/')) {
    const schoolSlug = cleanPath.replace('/schools/', '');
    const formattedSchool = schoolSlug
      .split(/[-_]/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');

    return {
      path: cleanPath,
      canonicalPath: cleanPath,
      title: `${formattedSchool} — Campus Portal | SchoolSphere`,
      description: `Access student results, attendance, and administrative portals for ${formattedSchool} on SchoolSphere.`,
      heading: `${formattedSchool} Campus Portal`,
      subheading: `Institutional portal and student services for ${formattedSchool}.`,
      fallbackBodyHtml: `
<div style="font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:800px;margin:40px auto;padding:24px;color:#1f2a2e">
  <h1 style="font-size:26px;font-weight:800;color:#1c4a59">${escapeHtml(formattedSchool)} Campus Portal</h1>
  <p style="font-size:14px;color:#6a7f84">Loading school profile and institutional services...</p>
</div>`
    };
  }

  // Unknown route
  return null;
}

/**
 * Injects route-specific metadata and crawlable fallback HTML into the index.html template.
 */
export const PUBLIC_INDEXABLE_ROUTES = new Set<string>([
  '/',
  '/welcome',
  '/sign-in',
  '/login',
  '/portal',
  '/privacy',
  '/terms',
  '/sitemap'
]);

export function injectRouteMetadata(
  rawHtml: string,
  meta: RouteSeoMeta,
  googleVerificationToken?: string
): string {
  let html = rawHtml;

  // 1. Title tag
  html = html.replace(/<title>.*?<\/title>/i, `<title>${escapeHtml(meta.title)}</title>`);

  // 2. Meta description
  if (html.includes('name="description"')) {
    html = html.replace(
      /<meta\s+name=["']description["']\s+content=["'][^"']*["']\s*\/?>/i,
      `<meta name="description" content="${escapeHtml(meta.description)}" />`
    );
  } else {
    html = html.replace('</head>', `    <meta name="description" content="${escapeHtml(meta.description)}" />\n  </head>`);
  }

  // 2b. Robots meta tag (index, follow for public pages; noindex, nofollow for private authenticated views)
  const robotsDirective = meta.robots || (PUBLIC_INDEXABLE_ROUTES.has(meta.path) ? 'index, follow' : 'noindex, nofollow');
  if (html.includes('name="robots"')) {
    html = html.replace(
      /<meta\s+name=["']robots["']\s+content=["'][^"']*["']\s*\/?>/i,
      `<meta name="robots" content="${robotsDirective}" />`
    );
  } else {
    html = html.replace('</head>', `    <meta name="robots" content="${robotsDirective}" />\n  </head>`);
  }

  // 3. Canonical link
  const canonicalUrl = `${CANONICAL_BASE_URL}${meta.canonicalPath}`;
  if (html.includes('rel="canonical"')) {
    html = html.replace(
      /<link\s+rel=["']canonical["']\s+href=["'][^"']*["']\s*\/?>/i,
      `<link rel="canonical" href="${canonicalUrl}" />`
    );
  } else {
    html = html.replace('</head>', `    <link rel="canonical" href="${canonicalUrl}" />\n  </head>`);
  }

  // 4. OpenGraph tags
  html = html.replace(
    /<meta\s+property=["']og:title["']\s+content=["'][^"']*["']\s*\/?>/i,
    `<meta property="og:title" content="${escapeHtml(meta.title)}" />`
  );
  html = html.replace(
    /<meta\s+property=["']og:description["']\s+content=["'][^"']*["']\s*\/?>/i,
    `<meta property="og:description" content="${escapeHtml(meta.description)}" />`
  );
  html = html.replace(
    /<meta\s+property=["']og:url["']\s+content=["'][^"']*["']\s*\/?>/i,
    `<meta property="og:url" content="${canonicalUrl}" />`
  );

  // 5. Twitter tags
  html = html.replace(
    /<meta\s+name=["']twitter:title["']\s+content=["'][^"']*["']\s*\/?>/i,
    `<meta name="twitter:title" content="${escapeHtml(meta.title)}" />`
  );
  html = html.replace(
    /<meta\s+name=["']twitter:description["']\s+content=["'][^"']*["']\s*\/?>/i,
    `<meta name="twitter:description" content="${escapeHtml(meta.description)}" />`
  );

  // 6. Google site verification placeholder
  if (googleVerificationToken) {
    html = html.replace(/%VITE_GOOGLE_SITE_VERIFICATION%/g, googleVerificationToken);
    if (!html.includes('name="google-site-verification"')) {
      html = html.replace('</head>', `    <meta name="google-site-verification" content="${googleVerificationToken}" />\n  </head>`);
    }
  } else {
    html = html.replace(/%VITE_GOOGLE_SITE_VERIFICATION%/g, '');
    html = html.replace(/<meta\s+name=["']google-site-verification["']\s+content=["']\s*["']\s*\/?>\n?/gi, '');
  }

  // 7. Crawlable semantic fallback HTML inside <div id="root">
  if (meta.fallbackBodyHtml) {
    html = html.replace(
      /<div\s+id=["']root["']>[\s\S]*?<\/div>/i,
      `<div id="root">${meta.fallbackBodyHtml}</div>`
    );
  }

  return html;
}

/**
 * Generates a branded, responsive HTTP 404 HTML page.
 * Explicitly includes <meta name="robots" content="noindex, follow" />
 * to eliminate Google Search Console "Soft 404" penalties while allowing
 * bots to follow internal navigation links.
 */
export function renderNotFoundHtml(requestedPath: string): string {
  const safePath = escapeHtml(requestedPath || '/');

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0" />
    <title>404 — Page Not Found | SchoolSphere</title>
    <meta name="description" content="The page you requested could not be found on SchoolSphere. Please return to the homepage or access the school portal." />
    <!-- Critical for Google Search Console: tell crawlers not to index this 404 page -->
    <meta name="robots" content="noindex, follow" />
    <link rel="icon" type="image/png" href="/sch sphere logo1.png" />
    <style>
      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
      body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        background-color: #f6f8f7;
        color: #1f2a2e;
        min-height: 100vh;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 24px;
      }
      .card {
        background: #ffffff;
        border: 1px solid #bac4c6;
        border-radius: 20px;
        max-width: 580px;
        width: 100%;
        padding: 40px 32px;
        box-shadow: 0 10px 25px -5px rgba(28, 74, 89, 0.08);
        text-align: center;
      }
      .badge {
        display: inline-block;
        background: #fee2e2;
        color: #b91c1c;
        border: 1px solid #fca5a5;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        padding: 4px 12px;
        border-radius: 9999px;
        margin-bottom: 20px;
      }
      h1 {
        font-size: 28px;
        font-weight: 800;
        color: #1c4a59;
        margin-bottom: 12px;
      }
      p {
        font-size: 15px;
        line-height: 1.6;
        color: #475569;
        margin-bottom: 24px;
      }
      .path-badge {
        display: inline-block;
        background: #f1f5f9;
        color: #334155;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-size: 13px;
        padding: 3px 8px;
        border-radius: 6px;
        border: 1px solid #e2e8f0;
        word-break: break-all;
      }
      .buttons {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        justify-content: center;
        margin-top: 24px;
      }
      .btn-primary {
        background: #1c4a59;
        color: #ffffff;
        text-decoration: none;
        font-weight: 600;
        font-size: 14px;
        padding: 12px 24px;
        border-radius: 10px;
        transition: background-color 0.2s ease;
      }
      .btn-primary:hover {
        background: #163b47;
      }
      .btn-secondary {
        background: #faae57;
        color: #1f2a2e;
        text-decoration: none;
        font-weight: 600;
        font-size: 14px;
        padding: 12px 24px;
        border-radius: 10px;
        transition: background-color 0.2s ease;
      }
      .btn-secondary:hover {
        background: #e49e49;
      }
      .footer-links {
        margin-top: 32px;
        padding-top: 20px;
        border-top: 1px solid #e2e8f0;
        display: flex;
        gap: 16px;
        flex-wrap: wrap;
        justify-content: center;
        font-size: 13px;
      }
      .footer-links a {
        color: #1c4a59;
        text-decoration: none;
      }
      .footer-links a:hover {
        text-decoration: underline;
      }
    </style>
  </head>
  <body>
    <main class="card">
      <div class="badge">HTTP 404 &bull; Not Found</div>
      <h1>Page Not Found</h1>
      <p>
        The requested URL <span class="path-badge">${safePath}</span> does not exist or may have been moved.
      </p>
      <div class="buttons">
        <a href="/" class="btn-primary">Return to Homepage</a>
        <a href="/portal" class="btn-secondary">Access Campus Portal</a>
      </div>
      <nav class="footer-links" aria-label="Quick links">
        <a href="/">Home</a>
        <a href="/sign-in">Sign In</a>
        <a href="/portal">Portal</a>
        <a href="/privacy">Privacy Policy</a>
        <a href="/terms">Terms of Service</a>
      </nav>
    </main>
  </body>
</html>`;
}
