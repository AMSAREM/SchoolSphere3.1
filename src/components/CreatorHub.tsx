import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/schema';
import { useNotifications } from '../contexts/NotificationContext';
import {
  LayoutDashboard,
  Building,
  Users,
  CreditCard,
  Briefcase,
  HelpCircle,
  TrendingUp,
  DollarSign,
  Megaphone,
  Bell,
  Sliders,
  Cpu,
  Code,
  Link,
  Database,
  Shield,
  Activity,
  Terminal,
  Globe,
  SlidersHorizontal,
  Smartphone,
  Key,
  User,
  Menu,
  X,
  Sparkles,
  ChevronRight,
  LogOut,
  Zap
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { getGoogleAccessToken, clearGoogleAccessToken } from '../lib/gmailService';
import { useAuth } from '../contexts/AuthContext';
import {
  fetchTenantLicenseStatus,
  activateTenantLicense,
  deactivateTenantLicense,
  updateTenantModules,
  generateSchoolLicense,
  revokeSchoolLicense,
  broadcastLicenseChange
} from '../lib/licenseSync';

// Import our modular sub-suites
import CoreSuite from './creator/CoreSuite';
import SalesSuite from './creator/SalesSuite';
import ServicesSuite from './creator/ServicesSuite';
import SecuritySuite from './creator/SecuritySuite';
import FrontendTestRunner from './FrontendTestRunner';

const AVAILABLE_MODULES = [
  { id: 'students', label: 'Students Records', description: 'Student profile directories & biodata' },
  { id: 'academic', label: 'Academics Portal', description: 'Class stream registries & subject settings' },
  { id: 'timetable', label: 'School Timetable', description: 'Period planning & automatic master schedule' },
  { id: 'attendance', label: 'Attendance Terminal', description: 'Daily attendance & tracking logs' },
  { id: 'results', label: 'Results Terminal', description: 'Continuous assessment entry & marks registry' },
  { id: 'exam_analysis', label: 'Exam Analysis', description: 'Subject grading & metrics visualizers' },
  { id: 'reports', label: 'Reports Terminal', description: 'Automated student term report sheets' },
  { id: 'fees', label: 'Fees & Payments', description: 'Tuition invoicing & transaction receipts' },
  { id: 'siren', label: 'Siren Console', description: 'Public bells and emergency alarms' },
  { id: 'evoting', label: 'E-Voting Portal', description: 'Student Representative Council elections' },
  { id: 'inventory', label: 'Inventory Registry', description: 'Assets & store stock audit registry' }
];

const SECTIONS = [
  // Core Suite
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, category: 'Core Suite' },
  { id: 'frontend_test_runner', label: 'Frontend Test Suite', icon: Activity, category: 'Core Suite' },
  { id: 'school_management', label: 'School Management', icon: Building, category: 'Core Suite' },
  { id: 'reports_analytics', label: 'Reports & Analytics', icon: TrendingUp, category: 'Core Suite' },
  { id: 'feature_management', label: 'Feature Management', icon: Sliders, category: 'Core Suite' },
  { id: 'system_configuration', label: 'System Configuration', icon: SlidersHorizontal, category: 'Core Suite' },

  // Sales Suite
  { id: 'subscription_billing', label: 'Subscription & Billing', icon: CreditCard, category: 'Sales Suite' },
  { id: 'crm', label: 'CRM Leads', icon: Briefcase, category: 'Sales Suite' },
  { id: 'finance', label: 'Finance', icon: DollarSign, category: 'Sales Suite' },
  { id: 'marketing', label: 'Marketing', icon: Megaphone, category: 'Sales Suite' },
  { id: 'license_management', label: 'License Management', icon: Key, category: 'Sales Suite' },

  // Services Suite
  { id: 'customer_support', label: 'Customer Support', icon: HelpCircle, category: 'Services Suite' },
  { id: 'notifications', label: 'Notifications', icon: Bell, category: 'Services Suite' },
  { id: 'cms', label: 'CMS', icon: Globe, category: 'Services Suite' },
  { id: 'mobile_app_management', label: 'Mobile App Management', icon: Smartphone, category: 'Services Suite' },

  // Security Suite
  { id: 'user_management', label: 'User Management', icon: Users, category: 'Security Suite' },
  { id: 'ai_administration', label: 'AI Administration', icon: Cpu, category: 'Security Suite' },
  { id: 'api_management', label: 'API Management', icon: Code, category: 'Security Suite' },
  { id: 'integrations', label: 'Integrations', icon: Link, category: 'Security Suite' },
  { id: 'database_diagnostics', label: 'Database Diagnostics', icon: Database, category: 'Security Suite' },
  { id: 'backup_recovery', label: 'Backup & Recovery', icon: Database, category: 'Security Suite' },
  { id: 'security_center', label: 'Security Center', icon: Shield, category: 'Security Suite' },
  { id: 'audit_logs', label: 'Audit Logs', icon: Activity, category: 'Security Suite' },
  { id: 'developer_console', label: 'Developer Console', icon: Terminal, category: 'Security Suite' },
  { id: 'creator_profile', label: 'Creator Profile', icon: User, category: 'Security Suite' }
];

interface CreatorHubProps {
  onLicenseChange?: () => void;
  onExit?: () => void;
}

export function normalizeAndDedupeLicenses(rawList: any[]): any[] {
  if (!Array.isArray(rawList)) return [];
  const seenKeys = new Set<string>();
  const seenSchoolIds = new Set<string>();
  const seenSchoolNames = new Set<string>();
  const result: any[] = [];

  for (const item of rawList) {
    if (!item) continue;
    const normKey = String(item.key || item.licenseKey || item.license_key || '').trim().toUpperCase();
    // Only include records with a valid issued license key
    if (!normKey) continue;

    const rawSchoolId = item.school_id || item.schoolId || item.school?.id || null;
    const normSchoolId = rawSchoolId ? String(rawSchoolId).trim() : '';
    const normSchoolName = String(item.schoolName || item.school_name || item.name || item.school?.name || '').trim().toUpperCase();

    // Deduplicate by both license key and school ID (with school name fallback when school_id is absent)
    if (seenKeys.has(normKey)) continue;
    if (normSchoolId && seenSchoolIds.has(normSchoolId)) continue;
    if (!normSchoolId && normSchoolName && seenSchoolNames.has(normSchoolName)) continue;

    seenKeys.add(normKey);
    if (normSchoolId) seenSchoolIds.add(normSchoolId);
    if (normSchoolName) seenSchoolNames.add(normSchoolName);

    result.push({
      ...item,
      key: normKey,
      licenseKey: normKey,
      school_id: rawSchoolId,
      schoolName: item.schoolName || item.school_name || item.name || item.school?.name || 'School'
    });
  }

  return result;
}

export default function CreatorHub({ onLicenseChange, onExit }: CreatorHubProps) {
  const { user } = useAuth();
  const { showToast, confirm } = useNotifications();
  const [activePanel, setActivePanel] = useState<string>(() => {
    return localStorage.getItem('esepa_creator_active_panel') || 'dashboard';
  });

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem('esepa_creator_active_panel', activePanel);
  }, [activePanel]);

  // License status and generated lists
  const [licenseInfo, setLicenseInfo] = useState<{
    active: boolean;
    licenseKey: string;
    remoteOverride: boolean;
    lockAnnouncement?: string;
    activeModules?: string[];
  } | null>(null);

  const [loadingLicenseAction, setLoadingLicenseAction] = useState(false);
  const [licensesList, setLicensesList] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTier, setFilterTier] = useState<string>('all');

  // Generator input states
  const [genSchoolName, setGenSchoolName] = useState('');
  const [genClientEmail, setGenClientEmail] = useState('');
  const [genContactPerson, setGenContactPerson] = useState('');
  const [sendEmailOnGenerate, setSendEmailOnGenerate] = useState(true);
  const [genDuration, setGenDuration] = useState('12');
  const [genTier, setGenTier] = useState('Standard');
  const [genSelectedModules, setGenSelectedModules] = useState<string[]>(AVAILABLE_MODULES.map(m => m.id));
  const [activeInstanceModules, setActiveInstanceModules] = useState<string[]>(AVAILABLE_MODULES.map(m => m.id));
  const [isUpdatingModules, setIsUpdatingModules] = useState(false);
  const [lockAnnouncementMsg, setLockAnnouncementMsg] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRevoking, setIsRevoking] = useState<string | null>(null);

  // Selling Calculator states
  const [calcNumStudents, setCalcNumStudents] = useState<number>(300);
  const [calcTier, setCalcTier] = useState<string>('Standard');
  const [calcSMSAddon, setCalcSMSAddon] = useState<boolean>(true);
  const [calcVotingAddon, setCalcVotingAddon] = useState<boolean>(false);
  const [calcSupportLevel, setCalcSupportLevel] = useState<string>('premium');
  const [copiedProposal, setCopiedProposal] = useState<boolean>(false);

  // System Config states
  const [sysAcademicYear, setSysAcademicYear] = useState('2025/2026');
  const [sysCurrentTerm, setSysCurrentTerm] = useState('Term 1');
  const [sysCurrency, setSysCurrency] = useState('GHS');

  // Live Supabase database telemetry counts
  const [telemetryCounts, setTelemetryCounts] = useState<{
    students: number;
    attendance: number;
    results: number;
    reports: number;
    sms: number;
    polls: number;
    candidates: number;
    votes: number;
    inventory: number;
    expenses: number;
    totalRecords?: number;
  }>({
    students: 0,
    attendance: 0,
    results: 0,
    reports: 0,
    sms: 0,
    polls: 0,
    candidates: 0,
    votes: 0,
    inventory: 0,
    expenses: 0,
    totalRecords: 0
  });

  const fetchCreatorTelemetry = async () => {
    try {
      const token = localStorage.getItem('esepa_auth_token');
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch('/api/creator/telemetry', { headers });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.counts) {
          setTelemetryCounts({
            students: Number(data.counts.students || 0),
            attendance: Number(data.counts.attendance || 0),
            results: Number(data.counts.results || 0),
            reports: Number(data.counts.reports || 0),
            sms: Number(data.counts.sms || 0),
            polls: Number(data.counts.polls || 0),
            candidates: Number(data.counts.candidates || 0),
            votes: Number(data.counts.votes || 0),
            inventory: Number(data.counts.inventory || 0),
            expenses: Number(data.counts.expenses || 0),
            totalRecords: Number(data.totalRecords || 0)
          });
        }
      }
    } catch (err) {
      console.warn('Notice fetching live Supabase creator telemetry:', err);
    }
  };

  const countStudents = telemetryCounts.students;
  const countAttendance = telemetryCounts.attendance;
  const countResults = telemetryCounts.results;
  const countReports = telemetryCounts.reports;
  const countSms = telemetryCounts.sms;
  const countPolls = telemetryCounts.polls;
  const countCandidates = telemetryCounts.candidates;
  const countVotes = telemetryCounts.votes;
  const countInventory = telemetryCounts.inventory;
  const countExpenses = telemetryCounts.expenses;

  const totalDemoRecords =
    telemetryCounts.totalRecords ||
    countStudents +
      countAttendance +
      countResults +
      countReports +
      countSms +
      countPolls +
      countCandidates +
      countVotes +
      countInventory +
      countExpenses;

  const fetchLicenseInfo = async () => {
    try {
      const data = await fetchTenantLicenseStatus(user?.school_id || null, user?.role || null);
      if (data) {
        setLicenseInfo({
          active: data.active,
          licenseKey: data.licenseKey,
          remoteOverride: Boolean(data.remoteOverride),
          lockAnnouncement: data.lockAnnouncement,
          activeModules: data.activeModules
        });
        if (data.lockAnnouncement) {
          setLockAnnouncementMsg(data.lockAnnouncement);
        }
        if (data.activeModules && data.activeModules.length > 0) {
          setActiveInstanceModules(data.activeModules);
        }
      }
    } catch (err) {
      console.warn('Failed to fetch licensing status inside Creator Hub:', err);
    }
  };

  const [syncLogs, setSyncLogs] = useState<any[]>([]);
  const [loadingSyncLogs, setLoadingSyncLogs] = useState<boolean>(false);

  const fetchSyncLogs = async () => {
    setLoadingSyncLogs(true);
    try {
      const res = await fetch('/api/sync/logs');
      if (res.ok) {
        const data = await res.json();
        setSyncLogs(data);
      }
    } catch (err) {
      console.warn('Notice loading sync logs (will retry):', err);
    } finally {
      setLoadingSyncLogs(false);
    }
  };

  const fetchGeneratedLicenses = async (retries = 2) => {
    try {
      localStorage.removeItem('esepa_generated_licenses');
      const token = localStorage.getItem('esepa_auth_token');
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch('/api/license/list', { headers });
      if (res.ok) {
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const data = await res.json();
          if (Array.isArray(data)) {
            setLicensesList(prev => normalizeAndDedupeLicenses([...data, ...prev]));
            return;
          }
        }
      }
    } catch (err) {
      if (retries > 0) {
        setTimeout(() => fetchGeneratedLicenses(retries - 1), 1000);
        return;
      }
      console.warn('Notice loading generated licenses from Supabase:', err);
    }
  };

  useEffect(() => {
    fetchLicenseInfo();
    fetchGeneratedLicenses();
    fetchSyncLogs();
    fetchCreatorTelemetry();

    const handleLicensesUpdated = () => {
      fetchGeneratedLicenses();
      fetchCreatorTelemetry();
    };
    window.addEventListener('esepa_licenses_updated', handleLicensesUpdated);
    return () => {
      window.removeEventListener('esepa_licenses_updated', handleLicensesUpdated);
    };
  }, []);

  const handleRemoteDeactivate = async () => {
    confirm({
      title: ' CRITICAL: Remotely Lock Instance',
      message: 'Are you sure you want to remotely lock this school portal in Supabase? Every student dashboard and admin login screen will immediately be replaced by a locked block notice requiring activation.',
      confirmLabel: 'Lock Portal Now',
      onConfirm: async () => {
        setLoadingLicenseAction(true);
        try {
          const result = await deactivateTenantLicense(user?.school_id || null, licenseInfo?.licenseKey || null);
          if (result.success) {
            showToast('System locked in Supabase! Access suspended successfully.', 'success');
            await fetchLicenseInfo();
            await fetchGeneratedLicenses();
            if (onLicenseChange) onLicenseChange();
          } else {
            showToast(result.error || 'Deactivation request failed in Supabase', 'error');
          }
        } catch (err) {
          showToast('Network error occurred. Try again.', 'error');
        } finally {
          setLoadingLicenseAction(false);
        }
      }
    });
  };

  const handleRemoteActivate = async (targetKey?: string) => {
    const keyToUse = (typeof targetKey === 'string' && targetKey) ? targetKey : (licensesList.length > 0 ? licensesList[0].key : '');
    if (!keyToUse) {
      showToast('Please select or generate a valid license key first.', 'error');
      return;
    }
    setLoadingLicenseAction(true);
    try {
      const result = await activateTenantLicense(keyToUse, user?.school_id || null);
      if (result.success) {
        showToast('System activated successfully in Supabase with valid license key!', 'success');
        await fetchLicenseInfo();
        await fetchGeneratedLicenses();
        if (onLicenseChange) onLicenseChange();
      } else {
        showToast(result.error || 'Activation failed in Supabase', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Error during license activation', 'error');
    } finally {
      setLoadingLicenseAction(false);
    }
  };

  const handleGenerateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!genSchoolName.trim()) {
      showToast('Please specify the school name to register.', 'error');
      return;
    }
    setIsGenerating(true);
    const googleToken = getGoogleAccessToken();

    try {
      const result = await generateSchoolLicense({
        schoolName: genSchoolName,
        durationMonths: genDuration,
        tier: genTier,
        activeModules: genSelectedModules,
        clientEmail: genClientEmail,
        contactPerson: genContactPerson,
        sendEmail: sendEmailOnGenerate,
        googleAccessToken: googleToken || undefined
      });

      if (!result.success || !result.license) {
        showToast(result.error || 'Failed to persist license key in Supabase database.', 'error');
        setIsGenerating(false);
        return;
      }

      const createdLicense: any = {
        ...result.license,
        provisionedAdmin: result.provisionedAdmin || result.license?.provisionedAdmin || null,
        used: false,
        activatedAt: null
      };

      localStorage.removeItem('esepa_generated_licenses');
      const updated = [
        createdLicense,
        ...licensesList.filter(
          (l: any) =>
            l.key !== createdLicense.key &&
            (!createdLicense.school_id || l.school_id !== createdLicense.school_id) &&
            String(l.schoolName || '').trim().toUpperCase() !== String(createdLicense.schoolName || '').trim().toUpperCase()
        )
      ];

      const loginHandle = createdLicense.provisionedAdmin?.scopedUsername || createdLicense.clientEmail || 'admin';
      if (result.emailDispatched && genClientEmail.trim()) {
        showToast(`License issued in Supabase & dispatched! Client login ready: ${loginHandle} / Password: ${createdLicense.key}`, 'success');
      } else {
        showToast(`Issued License in Supabase: ${createdLicense.key} — Client login ready (${loginHandle})`, 'success');
      }

      setGenSchoolName('');
      setGenClientEmail('');
      setGenContactPerson('');
      setLicensesList(normalizeAndDedupeLicenses(updated));
      fetchGeneratedLicenses();
      fetchCreatorTelemetry();
      if (onLicenseChange) onLicenseChange();
    } catch (err) {
      console.warn('Network error during license generation:', err);
      showToast('Failed to connect to server to generate license in Supabase.', 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSendLicenseEmail = async (
    licenseKey: string, 
    recipientEmail: string, 
    schoolName?: string, 
    contactPerson?: string
  ): Promise<boolean> => {
    if (!licenseKey || !recipientEmail) {
      showToast('License key and recipient email address are required.', 'error');
      return false;
    }
    const googleToken = getGoogleAccessToken();
    const appAuthToken = localStorage.getItem('esepa_auth_token');
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (appAuthToken) {
        headers['Authorization'] = `Bearer ${appAuthToken}`;
      }
      if (googleToken) {
        headers['x-google-access-token'] = googleToken;
      }

      const res = await fetch('/api/license/send-email', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          licenseKey,
          recipientEmail,
          schoolName,
          contactPerson,
          googleAccessToken: googleToken || undefined
        })
      });
      const data = await res.json();
      if (data?.gmailTokenExpired) {
        clearGoogleAccessToken();
      }
      if (res.ok && data.success) {
        showToast(data.message || `License ${licenseKey} dispatched to ${recipientEmail}!`, 'success');
        fetchGeneratedLicenses();
        return true;
      } else {
        showToast(data.error || 'Failed to send license email', 'error');
        return false;
      }
    } catch (err: any) {
      showToast('Network error sending license email', 'error');
      return false;
    }
  };

  const handleSaveInstanceModules = async () => {
    setIsUpdatingModules(true);
    try {
      const result = await updateTenantModules(
        user?.school_id || null,
        activeInstanceModules,
        licenseInfo?.licenseKey || null
      );
      if (result.success) {
        showToast('Instance modules successfully updated in Supabase!', 'success');
        await fetchLicenseInfo();
        await fetchGeneratedLicenses();
        if (onLicenseChange) {
          onLicenseChange();
        }
      } else {
        showToast(result.error || 'Failed to update active modules in Supabase', 'error');
      }
    } catch (err) {
      showToast('Network error updating modules', 'error');
    } finally {
      setIsUpdatingModules(false);
    }
  };

  const handleRevokeKey = async (key: string) => {
    const matched = licensesList.find((l: any) => l.key === key || l.licenseKey === key);
    confirm({
      title: 'Revoke License Key & Suspend Software',
      message: `Are you sure you want to revoke key [ ${key} ] in Supabase? This instantly blacklists the serial number and locks out any portals using it.`,
      confirmLabel: 'Confirm Blacklist',
      onConfirm: async () => {
        setIsRevoking(key);
        try {
          const result = await revokeSchoolLicense(
            key,
            matched?.school_id || matched?.id || matched?.school?.id || null,
            'revoked',
            matched?.schoolName || matched?.name || matched?.school?.name || null
          );
          if (result.success) {
            showToast('License revoked in Supabase. Client app has been restricted.', 'success');
            await fetchGeneratedLicenses();
            await fetchLicenseInfo();
            if (onLicenseChange) onLicenseChange();
          } else {
            showToast(result.error || 'Key revocation failed in Supabase', 'error');
          }
        } catch (err) {
          showToast('Network error', 'error');
        } finally {
          setIsRevoking(null);
        }
      }
    });
  };

  const handleUpdateAnnouncement = async () => {
    try {
      const token = localStorage.getItem('esepa_auth_token');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch('/api/license/announcement', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          message: lockAnnouncementMsg,
          schoolId: user?.school_id || undefined,
          licenseKey: licenseInfo?.licenseKey || undefined
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast('Lockout announcement updated in Supabase.', 'success');
        broadcastLicenseChange(data);
        fetchLicenseInfo();
      } else {
        showToast(data.error || 'Failed to update lockout banner text', 'error');
      }
    } catch (err) {
      showToast('Network error', 'error');
    }
  };

  const handlePrepareHandover = async () => {
    confirm({
      title: ' SECURE SCHOOL HANDOVER WIPE',
      message: `You are about to permanently erase all ${totalDemoRecords} transactional demo entries. This keeps underlying master configuration fields (class levels, academic subjects, teacher lists, master login credentials) intact, preparing a pristine delivery database for your client. This operation is non-reversible. Proceed?`,
      confirmLabel: 'Wipe & Initialize Handoff',
      onConfirm: async () => {
        try {
          await Promise.all([
            db.students.clear(),
            db.attendance.clear(),
            db.results.clear(),
            db.termReports.clear(),
            db.smsLogs.clear(),
            db.polls.clear(),
            db.candidates.clear(),
            db.votes.clear(),
            db.promotionHistory.clear(),
            db.inventory.clear(),
            db.expenses.clear()
          ]);

          // Retain creator and super_admin accounts
          const allUsers = await db.users.toArray();
          const creators = allUsers.filter(u => 
            u.role === 'creator' || u.role === 'super_admin'
          );
          await db.users.clear();
          if (creators.length > 0) {
            await db.users.bulkAdd(creators);
          }

          showToast('Pruned & Synced! Software database is now clean and ready for clients.', 'success');
          setTimeout(() => window.location.reload(), 1500);
        } catch (err: any) {
          showToast(`Handover process failed: ${err.message}`, 'error');
        }
      }
    });
  };

  // Pricing calculations
  const calculatePricing = () => {
    let baseRate = 500; // default basic set
    if (calcTier === 'Standard') baseRate = 950;
    if (calcTier === 'Professional') baseRate = 1600;
    if (calcTier === 'Developer') baseRate = 3500;

    // Student factor: $1.50 per student above 100 students
    const studentSurcharge = Math.max(0, calcNumStudents - 100) * 1.5;

    // Addons
    const smsCost = calcSMSAddon ? 350 : 0;
    const votingCost = calcVotingAddon ? 200 : 0;

    // Support tier multiplier
    let supportMultiplier = 1.0;
    if (calcSupportLevel === 'premium') supportMultiplier = 1.25;
    if (calcSupportLevel === 'all_access') supportMultiplier = 1.5;

    const setupFee = Math.round((baseRate * 0.4 + 200) * 10) / 10;
    const annualLicense = Math.round((baseRate + studentSurcharge + smsCost + votingCost) * supportMultiplier * 10) / 10;

    return {
      setupFee,
      annualLicense,
      currency: 'USD',
      localGHSSetup: Math.round(setupFee * 15.2), // approx rate helper
      localGHSAnnual: Math.round(annualLicense * 15.2)
    };
  };

  const pricing = calculatePricing();

  const proposalTemplate = `Dear Management,

PROPOSAL: SCHOOLSPHERE PORTAL SYSTEM INSTALLATION & LICENSE

Following your request, we are pleased to outline the proposal for deploying SchoolSphere Manager (Edition: ${calcTier}) for your institution.

SCOPE OF DEPLOYMENT:
- Core Student Registry & Bio-data Database (${calcNumStudents} students capacity)
- Academic Grading terminal & WASSCE Continuous Assessment reports
- Custom Timetable Management & Digital attendance registers
${calcSMSAddon ? '- Premium SMS & Whatsapp Alerts Gateway Integration\n' : ''}${calcVotingAddon ? '- Electronic eVoting Portal & Student Representative Councils module\n' : ''}- Cloud backup database synchronization

COMMERCIAL OFFERS:
1. System Setup, Installation & Configuration: $${pricing.setupFee} (approx. GHS ${pricing.localGHSSetup.toLocaleString()})
2. Annual Software License & Priority Support: $${pricing.annualLicense}/Year (approx. GHS ${pricing.localGHSAnnual.toLocaleString()})

Best Regards,
Elena / Akoko Solutions (Vendor System Creator)`;

  const copyProposalToClipboard = () => {
    navigator.clipboard.writeText(proposalTemplate);
    setCopiedProposal(true);
    showToast('Commercial sales proposal text copied!', 'success');
    setTimeout(() => setCopiedProposal(false), 2000);
  };

  const validLicensesList = normalizeAndDedupeLicenses(licensesList);

  const filteredLicenses = validLicensesList.filter((lic) => {
    const matchesSearch =
      String(lic.schoolName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      String(lic.key || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = filterTier === 'all' || lic.tier === filterTier;
    return matchesSearch && matchesFilter;
  });

  // Recharts Data Sets for Platform Sync and Active Session Monitoring
  const activeSchoolsCount = validLicensesList.filter((lic) => lic.status === 'active').length;
  const activeSchoolsBaseline = Math.max(3, activeSchoolsCount);

  const monthlyTrendData = [
    { name: 'Jan', records: 450 + Math.floor(totalDemoRecords * 0.2), logins: activeSchoolsBaseline * 42 },
    { name: 'Feb', records: 680 + Math.floor(totalDemoRecords * 0.4), logins: activeSchoolsBaseline * 58 },
    { name: 'Mar', records: 920 + Math.floor(totalDemoRecords * 0.6), logins: activeSchoolsBaseline * 75 },
    { name: 'Apr', records: 1250 + Math.floor(totalDemoRecords * 0.8), logins: activeSchoolsBaseline * 92 },
    { name: 'May', records: 1600 + Math.floor(totalDemoRecords * 0.9), logins: activeSchoolsBaseline * 115 },
    { name: 'Jun', records: 1980 + totalDemoRecords, logins: activeSchoolsBaseline * 148 },
  ];

  const compositionData = [
    { name: 'Students', value: countStudents, color: '#6366f1' },
    { name: 'Attendance', value: countAttendance, color: '#10b981' },
    { name: 'Results', value: countResults, color: '#f59e0b' },
    { name: 'Reports', value: countReports, color: '#8b5cf6' },
    { name: 'SMS Logs', value: countSms, color: '#06b6d4' },
    { name: 'eVotes', value: countPolls + countCandidates + countVotes, color: '#ec4899' },
    { name: 'Stock', value: countInventory, color: '#14b8a6' },
    { name: 'Expenses', value: countExpenses, color: '#f43f5e' },
  ];

  // Group sections by Category
  const sidebarGroups = SECTIONS.reduce((acc, sec) => {
    if (!acc[sec.category]) {
      acc[sec.category] = [];
    }
    acc[sec.category].push(sec);
    return acc;
  }, {} as Record<string, typeof SECTIONS>);

  const activeSectionObj = SECTIONS.find(s => s.id === activePanel);

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden select-none text-slate-800">
      {/* Sidebar Navigation - Desktop */}
      <aside className="hidden lg:flex flex-col w-64 bg-slate-900 border-r border-slate-800 text-white shrink-0">
        <div className="p-6 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-indigo-600 rounded-lg">
              <Sparkles className="w-5 h-5 text-white animate-spin" />
            </div>
            <div>
              <span className="text-xs font-bold block uppercase tracking-wider text-indigo-400">Elena's Portal</span>
              <span className="text-[10px] text-slate-400 font-bold uppercase block tracking-widest leading-none">V2 MASTER CONTROL</span>
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto p-4 space-y-5">
          {Object.entries(sidebarGroups).map(([category, items]) => (
            <div key={category} className="space-y-1.5">
              <span className="text-[9px] font-black uppercase text-slate-500 tracking-widest block pl-3.5 mb-1.5">{category}</span>
              <div className="space-y-0.5">
                {items.map((sec) => {
                  const Icon = sec.icon;
                  const isSelected = activePanel === sec.id;
                  return (
                    <button
                      key={sec.id}
                      onClick={() => setActivePanel(sec.id)}
                      className={cn(
                        'w-full flex items-center gap-3 px-3.5 py-2 text-xs font-semibold rounded-xl text-left transition duration-150 cursor-pointer',
                        isSelected ? 'bg-indigo-600 text-white font-bold' : 'text-slate-400 hover:bg-slate-800/40 hover:text-slate-200'
                      )}
                    >
                      <Icon className="w-4 h-4" />
                      <span>{sec.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
        {onExit && (
          <div className="p-4 border-t border-slate-800/60 shrink-0">
            <button
              onClick={onExit}
              className="w-full flex items-center gap-3 px-3.5 py-2.5 text-xs font-bold rounded-xl text-slate-400 hover:bg-rose-600/10 hover:text-rose-400 transition duration-150 cursor-pointer border border-dashed border-slate-800 hover:border-rose-500/20"
            >
              <LogOut className="w-4 h-4 rotate-180" />
              <span>Log Out</span>
            </button>
          </div>
        )}
      </aside>

      {/* Mobile Drawer Overlay */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileMenuOpen(false)}
              className="fixed inset-0 bg-black z-40 lg:hidden"
            />
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 left-0 w-64 bg-slate-900 text-white z-50 p-4 flex flex-col justify-between border-r border-slate-800 lg:hidden"
            >
              <div className="space-y-6 flex-1 overflow-y-auto no-scrollbar">
                <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-indigo-400" />
                    <span className="font-bold text-xs uppercase tracking-wider text-white">Elena Master Hub</span>
                  </div>
                  <button onClick={() => setMobileMenuOpen(false)} className="p-1 text-slate-400 hover:text-white">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <nav className="space-y-5">
                  {Object.entries(sidebarGroups).map(([category, items]) => (
                    <div key={category} className="space-y-1.5">
                      <span className="text-[9px] font-black uppercase text-slate-500 tracking-widest block pl-3">{category}</span>
                      <div className="space-y-0.5">
                        {items.map((sec) => {
                          const Icon = sec.icon;
                          const isSelected = activePanel === sec.id;
                          return (
                            <button
                              key={sec.id}
                              onClick={() => {
                                setActivePanel(sec.id);
                                setMobileMenuOpen(false);
                              }}
                              className={cn(
                                'w-full flex items-center gap-3 px-3 py-2 text-xs font-semibold rounded-xl text-left cursor-pointer',
                                isSelected ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-800'
                              )}
                            >
                              <Icon className="w-4 h-4" />
                              <span>{sec.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </nav>
              </div>
              {onExit && (
                <div className="pt-4 border-t border-slate-800/60 mt-auto">
                  <button
                    onClick={() => {
                      setMobileMenuOpen(false);
                      onExit();
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-xs font-bold rounded-xl text-slate-400 hover:bg-rose-600/10 hover:text-rose-400 transition duration-150 cursor-pointer border border-dashed border-slate-800"
                  >
                    <LogOut className="w-4 h-4 rotate-180" />
                    <span>Log Out</span>
                  </button>
                </div>
              )}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden print:block print:h-auto print:overflow-visible">
        {/* Header */}
        <header className="bg-white border-b border-slate-200 h-16 shrink-0 flex items-center justify-between px-6 print:hidden">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="p-1.5 text-slate-500 hover:text-slate-800 lg:hidden"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-slate-400 text-xs font-medium">
              <span>Creator Console</span>
              <ChevronRight className="w-3 h-3" />
              <span className="font-bold text-slate-700">{activeSectionObj?.label}</span>
            </div>
          </div>

          <div className="flex items-center gap-3 sm:gap-4">
            <button
              type="button"
              onClick={() => setActivePanel('frontend_test_runner')}
              className={cn(
                'flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer whitespace-nowrap',
                activePanel === 'frontend_test_runner'
                  ? 'bg-[#1c4a59] text-white shadow-xs'
                  : 'bg-[#faae57] hover:bg-[#e4ae67] text-[#1f2a2e]'
              )}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>Frontend Test Suite</span>
            </button>
            <span className="hidden sm:inline-flex px-2.5 py-0.5 bg-indigo-50 border border-indigo-100 text-indigo-700 text-[10px] font-black uppercase rounded-md tracking-wider">
              Environment: Live Sandbox
            </span>
            <div className="text-right">
              <span className="text-xs font-bold text-slate-800 block">{user?.fullName || user?.username || 'Platform Creator'}</span>
              <span className="text-[10px] text-[#06D6A0] font-black uppercase block tracking-wider leading-none mt-0.5">{user?.role?.replace('_', ' ') || 'Creator'}</span>
            </div>
            {onExit && (
              <button
                onClick={onExit}
                className="flex items-center gap-2 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 border border-rose-100 text-rose-700 text-xs font-bold rounded-xl transition duration-150 cursor-pointer"
                title="Log Out"
              >
                <LogOut className="w-3.5 h-3.5 rotate-180" />
                <span className="hidden xs:inline">Log Out</span>
              </button>
            )}
          </div>
        </header>

        {/* Content Container */}
        <main className="flex-1 overflow-y-auto p-6 space-y-6 print:block print:h-auto print:overflow-visible print:p-0">
          {/* Active Sub-Suite Rendering */}
          <AnimatePresence mode="wait">
            <motion.div
              key={activePanel}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.15 }}
            >
              {activePanel === 'frontend_test_runner' && (
                <FrontendTestRunner
                  isEmbeddedInCreator
                  onNavigateCreatorPanel={setActivePanel}
                />
              )}

              {activePanel !== 'frontend_test_runner' && activeSectionObj?.category === 'Core Suite' && (
                <CoreSuite
                  activePanel={activePanel}
                  licenseInfo={licenseInfo}
                  licensesList={validLicensesList}
                  totalDemoRecords={totalDemoRecords}
                  activeInstanceModules={activeInstanceModules}
                  setActiveInstanceModules={setActiveInstanceModules}
                  handleSaveInstanceModules={handleSaveInstanceModules}
                  isUpdatingModules={isUpdatingModules}
                  compositionData={compositionData}
                  monthlyTrendData={monthlyTrendData}
                  onLicenseChange={onLicenseChange}
                  counts={{
                    students: countStudents,
                    attendance: countAttendance,
                    results: countResults,
                    reports: countReports,
                    sms: countSms,
                    inventory: countInventory,
                    expenses: countExpenses,
                    polls: countPolls
                  }}
                  availableModules={AVAILABLE_MODULES}
                  sysAcademicYear={sysAcademicYear}
                  setSysAcademicYear={setSysAcademicYear}
                  sysCurrentTerm={sysCurrentTerm}
                  setSysCurrentTerm={setSysCurrentTerm}
                  sysCurrency={sysCurrency}
                  setSysCurrency={setSysCurrency}
                />
              )}

              {activeSectionObj?.category === 'Sales Suite' && (
                <SalesSuite
                  activePanel={activePanel}
                  licensesList={validLicensesList}
                  searchQuery={searchQuery}
                  setSearchQuery={setSearchQuery}
                  filterTier={filterTier}
                  setFilterTier={setFilterTier}
                  filteredLicenses={filteredLicenses}
                  handleGenerateKey={handleGenerateKey}
                  genSchoolName={genSchoolName}
                  setGenSchoolName={setGenSchoolName}
                  genDuration={genDuration}
                  setGenDuration={setGenDuration}
                  genTier={genTier}
                  setGenTier={setGenTier}
                  genSelectedModules={genSelectedModules}
                  setGenSelectedModules={setGenSelectedModules}
                  isGenerating={isGenerating}
                  isRevoking={isRevoking}
                  handleRevokeKey={handleRevokeKey}
                  availableModules={AVAILABLE_MODULES}
                  calcNumStudents={calcNumStudents}
                  setCalcNumStudents={setCalcNumStudents}
                  calcTier={calcTier}
                  setCalcTier={setCalcTier}
                  calcSMSAddon={calcSMSAddon}
                  setCalcSMSAddon={setCalcSMSAddon}
                  calcVotingAddon={calcVotingAddon}
                  setCalcVotingAddon={setCalcVotingAddon}
                  calcSupportLevel={calcSupportLevel}
                  setCalcSupportLevel={setCalcSupportLevel}
                  copiedProposal={copiedProposal}
                  copyProposalToClipboard={copyProposalToClipboard}
                  pricing={pricing}
                  genClientEmail={genClientEmail}
                  setGenClientEmail={setGenClientEmail}
                  genContactPerson={genContactPerson}
                  setGenContactPerson={setGenContactPerson}
                  sendEmailOnGenerate={sendEmailOnGenerate}
                  setSendEmailOnGenerate={setSendEmailOnGenerate}
                  handleSendLicenseEmail={handleSendLicenseEmail}
                />
              )}

              {activeSectionObj?.category === 'Services Suite' && (
                <ServicesSuite
                  activePanel={activePanel}
                  lockAnnouncementMsg={lockAnnouncementMsg}
                  setLockAnnouncementMsg={setLockAnnouncementMsg}
                  handleUpdateAnnouncement={handleUpdateAnnouncement}
                />
              )}

              {activeSectionObj?.category === 'Security Suite' && (
                <SecuritySuite
                  activePanel={activePanel}
                  licenseInfo={licenseInfo}
                  syncLogs={syncLogs}
                  loadingSyncLogs={loadingSyncLogs}
                  fetchSyncLogs={fetchSyncLogs}
                  handleRemoteDeactivate={handleRemoteDeactivate}
                  handleRemoteActivate={handleRemoteActivate}
                  loadingLicenseAction={loadingLicenseAction}
                  handlePrepareHandover={handlePrepareHandover}
                  totalDemoRecords={totalDemoRecords}
                  counts={{
                    students: countStudents,
                    results: countResults,
                    attendance: countAttendance,
                    sms: countSms
                  }}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
