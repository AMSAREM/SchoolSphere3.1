# SchoolSphere Contact Details & Complete Rebranding Implementation Plan

## 1. Executive Summary
This plan updates the official application contact email to `amoakoemmanuel@hotmail.com`, adds the official support phone numbers `0551187045` and `0554234590`, updates creator/vendor attribution to **SchoolSphere Team / Emmanuel Amoako**, and replaces all remaining **Esepa / ESEPA** branding across the frontend, PDF/Excel exports, SMS templates, and backend services with **SchoolSphere** (`SCHOOLSPHERE PORTAL` and `SCHOOLSPHR` SMS Sender ID), while strictly preserving all `ESEPA-*` license key formats and internal storage keys that prevent data loss.

---

## 2. Official Contact Address, Phone Numbers & Creator Attribution

### A. Support Modals, Landing Page & Onboarding (`src/components/GetStarted.tsx`, `src/components/LandingPage.tsx`)
- **Institutional Support & Get in Touch Modals (`src/components/GetStarted.tsx`)**:
  - Replace `akokosolutions24@gmail.com` with `amoakoemmanuel@hotmail.com` (`mailto:amoakoemmanuel@hotmail.com`).
  - Add clickable support phone links: `0551187045` (`tel:0551187045`) and `0554234590` (`tel:0554234590`).
  - Update the bottom licensing support bar to display:
    `Licensing & Support: amoakoemmanuel@hotmail.com • Tel: 0551187045 / 0554234590`.
- **Landing Page Footer (`src/components/LandingPage.tsx`)**:
  - Add direct contact details under the SchoolSphere brand column (`amoakoemmanuel@hotmail.com` and `0551187045 / 0554234590`) alongside the Institutional Support modal trigger.

### B. Creator Hub & Suite Attribution (`src/components/CreatorHub.tsx`, `src/components/creator/SecuritySuite.tsx`, `src/components/creator/ServicesSuite.tsx`, `src/components/creator/SalesSuite.tsx`)
- **Creator Hub (`src/components/CreatorHub.tsx`)**:
  - Update proposal signature from `Elena / Akoko Solutions (Vendor System Creator)` to:
    `SchoolSphere Team / Emmanuel Amoako — amoakoemmanuel@hotmail.com | 0551187045 / 0554234590`.
  - Update header/sidebar badges from `Elena's Portal` and `Elena Master Hub` to `SchoolSphere Creator` and `SchoolSphere Master Hub`.
- **Security Suite (`src/components/creator/SecuritySuite.tsx`)**:
  - Update Super Admin Identity card:
    - **Developer Name**: `SchoolSphere Team / Emmanuel Amoako`
    - **Support Dispatch Email**: `amoakoemmanuel@hotmail.com`
    - **Support Hotlines**: `0551187045 / 0554234590`
- **Services Suite (`src/components/creator/ServicesSuite.tsx`)**:
  - Update lock screen notice placeholder and default support contact to reference `SchoolSphere Support (amoakoemmanuel@hotmail.com / 0551187045 / 0554234590)`.

### C. Legal, Compliance & Auth Footers (`src/components/legal/PrivacyPolicyModal.tsx`, `src/components/legal/TermsOfServiceModal.tsx`, `src/components/auth/AuthScreens.tsx`, `src/lib/gmailService.ts`)
- **Privacy Policy (`src/components/legal/PrivacyPolicyModal.tsx`)**:
  - Replace `Akoko Solutions Legal & Privacy Office` and `privacy@schoolsphere.xyz` with **SchoolSphere Team / Emmanuel Amoako**, Email: `amoakoemmanuel@hotmail.com`, Tel: `0551187045 / 0554234590`.
- **Terms of Service (`src/components/legal/TermsOfServiceModal.tsx`)**:
  - Replace `Akoko Solutions` references with **SchoolSphere Team / Emmanuel Amoako** and include official contact details (`amoakoemmanuel@hotmail.com`, `0551187045 / 0554234590`).
- **Authentication Footer (`src/components/auth/AuthScreens.tsx`)**:
  - Update footer attribution to `© 2026 SchoolSphere 3.1 • SchoolSphere Team / Emmanuel Amoako` and display support contact info (`amoakoemmanuel@hotmail.com • 0551187045 / 0554234590`).
- **Automated License Dispatch Emails (`src/lib/gmailService.ts` & `server.ts`)**:
  - Ensure email templates and fallback support contact lines show `amoakoemmanuel@hotmail.com` and `0551187045 / 0554234590`.

---

## 3. Complete Replacement of "Esepa" with "SchoolSphere" (Preserving License Keys)

### A. Default School Fallback Name (`SCHOOLSPHERE PORTAL`)
Replace all fallback occurrences of `'ESEPA INTERNATIONAL SCHOOL'` and `'ESEPA ACADEMY'` with `'SCHOOLSPHERE PORTAL'` across:
- `src/components/Dashboard.tsx`
- `src/components/AcademicManagement.tsx`
- `src/components/ResultsTerminal.tsx`
- `src/components/ReportTerminal.tsx`
- `src/components/TimetableManagement.tsx`
- `src/components/InventoryManagement.tsx`
- `src/components/FeeManagement.tsx` (also replace `Esepa School Treasury Account` with `SchoolSphere Treasury Account` and `admin@esepa.school` with `amoakoemmanuel@hotmail.com`)
- `src/lib/utils.ts` (also replace `'info@esepa.edu.gh'` with `'amoakoemmanuel@hotmail.com'` and `'ESEPA ACADEMIC INFORMATION MANAGEMENT SYSTEM (AIMS)'` with `'SCHOOLSPHERE ACADEMIC INFORMATION MANAGEMENT SYSTEM (AIMS)'`)

### B. SMS Broadcasts & 11-Character Arkesel Sender ID (`SCHOOLSPHR`)
- **`src/components/SmsModule.tsx` & `server.ts`**:
  - Replace default SMS Sender ID `'ESEPA_ACAD'` with `'SCHOOLSPHR'` (10 characters, compliant with Arkesel's 11-character alphanumeric limit).
  - Replace `'ESEPA ACADEMY'`, `'ESEPA incident logger'`, and `'Management, ESEPA'` in SMS quick templates with `'SCHOOLSPHERE PORTAL'`, `'SchoolSphere incident logger'`, and `'Management, SchoolSphere'`.
  - Update Excel sheet and file export names from `'ESEPA SMS Logs'` / `'Esepa_SMS_Ledger_Log_...'` to `'SchoolSphere SMS Logs'` / `'SchoolSphere_SMS_Ledger_Log_...'`.
  - Update preview footer from `'ESEPA Communicate Portal'` to `'SchoolSphere Communicate Portal'`.

### C. E-Voting, Settings & Cloud Export Scripts
- **`src/components/EVoting.tsx` & `server.ts`**:
  - Replace `Esepa Digital E-Voting Suite` with `SchoolSphere Digital E-Voting Suite`.
  - Replace `Esepa E-Voting Station:` in voting confirmation SMS with `SchoolSphere E-Voting Station:`.
- **`src/components/Settings.tsx` & `server.ts`**:
  - Replace `-- ESEPA SCHOOL SPHERE - GENERATED DATA EXPORT SCRIPT (MYSQL)` with `-- SCHOOLSPHERE PORTAL - GENERATED DATA EXPORT SCRIPT (MYSQL)`.
  - Replace fallback portal URL `esepa-school-portal.vercel.app` with `schoolsphere-portal.vercel.app`.

### D. License Key Preservation Guarantee
- All license key generation, validation, prefix checks, and master keys (`ESEPA-...`, `ESEPA-MASTER-...`, and license regex validators in `server.ts`, `CreatorHub.tsx`, `SalesSuite.tsx`, and `GetStarted.tsx`) will remain **100% untouched**.
