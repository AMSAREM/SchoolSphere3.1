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
import { supabase } from '../lib/supabase/client';
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
import { getCreatorPanelIdentity, resolveCreatorPanelFromPathname } from '../lib/pageMetadata';

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
    const fromUrl = typeof window !== 'undefined' ? resolveCreatorPanelFromPathname(window.location.pathname) : null;
    if (fromUrl) return fromUrl;
    return localStorage.getItem('esepa_creator_active_panel') || 'dashboard';
  });

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem('esepa_creator_active_panel', activePanel);
  }, [activePanel]);

  useEffect(() => {
    const handlePopState = () => {
      const matched = resolveCreatorPanelFromPathname(window.location.pathname);
      if (matched) {
        setActivePanel(matched);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

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

  // Live Supabase database telemetry counts & real-time presence/login streams
  const [telemetryCounts, setTelemetryCounts] = useState<{
    students: number;
    teachers: number;
    classes: number;
    subjects: number;
    attendance: number;
    results: number;
    reports: number;
    fees: number;
    sms: number;
    polls: number;
    candidates: number;
    votes: number;
    inventory: number;
    expenses: number;
    schools: number;
    licenses: number;
    users: number;
    auditLogs: number;
    totalRecords: number;
  }>({
    students: 0,
    teachers: 0,
    classes: 0,
    subjects: 0,
    attendance: 0,
    results: 0,
    reports: 0,
    fees: 0,
    sms: 0,
    polls: 0,
    candidates: 0,
    votes: 0,
    inventory: 0,
    expenses: 0,
    schools: 0,
    licenses: 0,
    users: 0,
    auditLogs: 0,
    totalRecords: 0
  });

  const [monthlyGrowthSeries, setMonthlyGrowthSeries] = useState<any[]>([]);
  const [serverOnlineUsers, setServerOnlineUsers] = useState<any[]>([]);
  const [recentLogins, setRecentLogins] = useState<any[]>([]);
  const [allUsersPresence, setAllUsersPresence] = useState<any[]>([]);
  const [channelPresenceUsers, setChannelPresenceUsers] = useState<any[]>([]);
  const [isRealtimeConnected, setIsRealtimeConnected] = useState<boolean>(false);
  const [lastTelemetrySyncAt, setLastTelemetrySyncAt] = useState<number>(Date.now());
  const [isRefreshingTelemetry, setIsRefreshingTelemetry] = useState<boolean>(false);

  const fetchCreatorTelemetry = async (showSpinner = false) => {
    if (showSpinner) setIsRefreshingTelemetry(true);
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
            teachers: Number(data.counts.teachers || 0),
            classes: Number(data.counts.classes || 0),
            subjects: Number(data.counts.subjects || 0),
            attendance: Number(data.counts.attendance || 0),
            results: Number(data.counts.results || 0),
            reports: Number(data.counts.reports || 0),
            fees: Number(data.counts.fees || 0),
            sms: Number(data.counts.sms || 0),
            polls: Number(data.counts.polls || 0),
            candidates: Number(data.counts.candidates || 0),
            votes: Number(data.counts.votes || 0),
            inventory: Number(data.counts.inventory || 0),
            expenses: Number(data.counts.expenses || 0),
            schools: Number(data.counts.schools || 0),
            licenses: Number(data.counts.licenses || 0),
            users: Number(data.counts.users || 0),
            auditLogs: Number(data.counts.auditLogs || 0),
            totalRecords: Number(data.totalRecords || 0)
          });
        }
        if (Array.isArray(data.monthlyGrowthSeries)) {
          setMonthlyGrowthSeries(data.monthlyGrowthSeries);
        }
        if (Array.isArray(data.onlineUsers)) {
          setServerOnlineUsers(data.onlineUsers);
        }
        if (Array.isArray(data.recentLogins)) {
          setRecentLogins(data.recentLogins);
        }
        if (Array.isArray(data.allUsers)) {
          setAllUsersPresence(data.allUsers);
        }
        setLastTelemetrySyncAt(Number(data.timestamp || Date.now()));
      }
    } catch (err) {
      console.warn('Notice fetching live Supabase creator telemetry:', err);
    } finally {
      if (showSpinner) setIsRefreshingTelemetry(false);
    }
  };

  const countStudents = telemetryCounts.students;
  const countTeachers = telemetryCounts.teachers;
  const countClasses = telemetryCounts.classes;
  const countSubjects = telemetryCounts.subjects;
  const countAttendance = telemetryCounts.attendance;
  const countResults = telemetryCounts.results;
  const countReports = telemetryCounts.reports;
  const countSms = telemetryCounts.sms;
  const countPolls = telemetryCounts.polls;
  const countCandidates = telemetryCounts.candidates;
  const countVotes = telemetryCounts.votes;
  const countInventory = telemetryCounts.inventory;
  const countExpenses = telemetryCounts.expenses;
  const countUsers = telemetryCounts.users;
  const countAuditLogs = telemetryCounts.auditLogs;

  const totalDemoRecords =
    telemetryCounts.totalRecords ||
    countStudents +
      countTeachers +
      countClasses +
      countSubjects +
      countAttendance +
      countResults +
      countReports +
      countSms +
      countPolls +
      countCandidates +
      countVotes +
      countInventory +
      countExpenses +
      countUsers +
      countAuditLogs;

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

    // Live polling interval for continuous real-time telemetry updates
    const liveInterval = setInterval(() => {
      fetchCreatorTelemetry();
    }, 8000);

    // Subscribe to Supabase Realtime Postgres Changes + Live Presence Channel
    let dbRealtimeChannel: any = null;
    let presenceMonitorChannel: any = null;

    try {
      dbRealtimeChannel = supabase
        .channel('creator_dashboard_postgres_changes')
        .on('postgres_changes', { event: '*', schema: 'public' }, () => {
          fetchCreatorTelemetry();
        })
        .subscribe((status: string) => {
          if (status === 'SUBSCRIBED') {
            setIsRealtimeConnected(true);
          }
        });

      presenceMonitorChannel = supabase.channel('schoolsphere:live_presence');
      const syncPresenceState = () => {
        try {
          const state = presenceMonitorChannel.presenceState() || {};
          const extracted: any[] = [];
          Object.values(state).forEach((presences: any) => {
            if (Array.isArray(presences)) {
              presences.forEach((p: any) => {
                if (p && (p.username || p.email || p.userId)) {
                  extracted.push({
                    ...p,
                    isOnline: true,
                    lastActiveTimestamp: Number(p.lastActiveTimestamp || Date.now()),
                    loginTimestamp: Number(p.loginTimestamp || Date.now()),
                    authStatus: p.authStatus || 'Authenticated'
                  });
                }
              });
            }
          });
          setChannelPresenceUsers(extracted);
        } catch {}
      };

      presenceMonitorChannel
        .on('presence', { event: 'sync' }, () => {
          syncPresenceState();
          fetchCreatorTelemetry();
        })
        .on('presence', { event: 'join' }, () => {
          syncPresenceState();
          fetchCreatorTelemetry();
        })
        .on('presence', { event: 'leave' }, () => {
          syncPresenceState();
          fetchCreatorTelemetry();
        })
        .subscribe((status: string) => {
          if (status === 'SUBSCRIBED') {
            setIsRealtimeConnected(true);
            syncPresenceState();
          }
        });
    } catch (rtErr) {
      console.warn('Supabase Realtime subscription notice:', rtErr);
    }

    return () => {
      window.removeEventListener('esepa_licenses_updated', handleLicensesUpdated);
      clearInterval(liveInterval);
      if (dbRealtimeChannel) {
        try {
          supabase.removeChannel(dbRealtimeChannel);
        } catch {}
      }
      if (presenceMonitorChannel) {
        try {
          supabase.removeChannel(presenceMonitorChannel);
        } catch {}
      }
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
SchoolSphere Team / Emmanuel Amoako
Email: amoakoemmanuel@hotmail.com | Tel: 0551187045 / 0554234590`;

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

  // Merge live Supabase Realtime channel presence with server heartbeat onlineUsers & current logged-in user
  const mergedOnlineUsers = React.useMemo(() => {
    const map = new Map<string, any>();

    const addOrMerge = (u: any) => {
      if (!u) return;
      const key = String(
        u.authUserId || u.auth_user_id || u.email || `${u.username || 'user'}@${u.schoolId || u.school_id || 'global'}`
      )
        .trim()
        .toLowerCase();
      if (!key) return;
      const existing = map.get(key);
      map.set(key, {
        ...existing,
        ...u,
        dbId: u.dbId ?? existing?.dbId ?? (typeof u.id === 'number' ? u.id : null),
        sourceTable: u.sourceTable || existing?.sourceTable || 'public.users',
        username: u.username || existing?.username || 'user',
        fullName: u.fullName || u.full_name || existing?.fullName || u.username || 'User',
        email: u.email || existing?.email || '',
        role: u.role || existing?.role || 'admin',
        schoolName:
          u.schoolName ||
          existing?.schoolName ||
          (u.role === 'creator' || u.role === 'super_admin' ? 'Platform Global Scope' : 'SchoolSphere Portal'),
        isOnline: true,
        lastActiveTimestamp: Math.max(
          Number(u.lastActiveTimestamp || 0),
          Number(existing?.lastActiveTimestamp || 0),
          Date.now() - 5000
        ),
        loginTimestamp: Number(u.loginTimestamp || existing?.loginTimestamp || Date.now()),
        authStatus: u.authStatus || existing?.authStatus || 'Online · Authenticated'
      });
    };

    serverOnlineUsers.forEach(addOrMerge);
    channelPresenceUsers.forEach(addOrMerge);

    if (user) {
      addOrMerge({
        id: user.id,
        dbId: typeof user.id === 'number' && user.id < 1000000000 ? user.id : null,
        sourceTable: 'public.users',
        authUserId: user.auth_user_id,
        username: user.username,
        fullName: user.fullName || (user as any).full_name || user.username,
        email: user.email,
        role: user.role,
        schoolId: user.schoolId || user.school_id,
        schoolName:
          (user as any).schoolName ||
          (user.role === 'creator' || user.role === 'super_admin' ? 'Platform Global Scope' : 'SchoolSphere Portal'),
        isOnline: true,
        lastActiveTimestamp: Date.now(),
        loginTimestamp: user.lastLogin || Date.now(),
        authStatus: 'Online · Authenticated'
      });
    }

    return Array.from(map.values()).sort((a, b) => (b.lastActiveTimestamp || 0) - (a.lastActiveTimestamp || 0));
  }, [serverOnlineUsers, channelPresenceUsers, user]);

  const mergedAllUsers = React.useMemo(() => {
    const map = new Map<string, any>();
    allUsersPresence.forEach((u) => {
      const key = String(u.authUserId || u.email || `${u.username}@${u.schoolId || 'global'}`).toLowerCase();
      map.set(key, { ...u });
    });
    mergedOnlineUsers.forEach((onlineU) => {
      const key = String(
        onlineU.authUserId || onlineU.email || `${onlineU.username}@${onlineU.schoolId || 'global'}`
      ).toLowerCase();
      const existing = map.get(key);
      map.set(key, {
        ...existing,
        ...onlineU,
        dbId: onlineU.dbId ?? existing?.dbId ?? null,
        sourceTable: existing?.sourceTable || onlineU.sourceTable || 'public.users',
        isOnline: true
      });
    });
    return Array.from(map.values()).sort((a, b) => {
      if (a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1;
      return (b.loginTimestamp || b.lastActiveTimestamp || 0) - (a.loginTimestamp || a.lastActiveTimestamp || 0);
    });
  }, [allUsersPresence, mergedOnlineUsers]);

  // Authentic Monthly Growth Series grouped directly from Supabase created_at and audit_logs.timestamp (zero synthetic multipliers)
  const monthlyTrendData = React.useMemo(() => {
    if (Array.isArray(monthlyGrowthSeries) && monthlyGrowthSeries.length > 0) {
      return monthlyGrowthSeries;
    }
    const nowD = new Date();
    const mNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return [
      {
        name: `${mNames[nowD.getMonth()]} ${String(nowD.getFullYear()).slice(2)}`,
        records: totalDemoRecords,
        newRecords: totalDemoRecords,
        logins: recentLogins.length
      }
    ];
  }, [monthlyGrowthSeries, totalDemoRecords, recentLogins.length]);

  const compositionData = [
    { name: 'Classes', value: countClasses, color: '#6366f1' },
    { name: 'Subjects', value: countSubjects, color: '#8b5cf6' },
    { name: 'Users', value: countUsers, color: '#10b981' },
    { name: 'Teachers', value: countTeachers, color: '#06b6d4' },
    { name: 'Audit Logs', value: countAuditLogs, color: '#f59e0b' },
    { name: 'Students', value: countStudents, color: '#3b82f6' },
    { name: 'Attendance', value: countAttendance, color: '#14b8a6' },
    { name: 'Results', value: countResults, color: '#ec4899' }
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
  const activeCreatorIdentity = getCreatorPanelIdentity(activePanel);
  const ActiveSectionIcon = activeSectionObj?.icon || LayoutDashboard;

  useEffect(() => {
    document.title = `${activeCreatorIdentity.title} — Creator Command Console | SchoolSphere`;
    if (typeof window !== 'undefined') {
      const searchAndHash = `${window.location.search || ''}${window.location.hash || ''}`;
      if (window.location.pathname !== activeCreatorIdentity.path) {
        window.history.pushState(
          { view: 'creator', panel: activePanel },
          '',
          `${activeCreatorIdentity.path}${searchAndHash}`
        );
      }
    }
  }, [activeCreatorIdentity.title, activeCreatorIdentity.path, activePanel]);

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
              <span className="text-xs font-bold block uppercase tracking-wider text-indigo-400">SchoolSphere Creator</span>
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
                    <span className="font-bold text-xs uppercase tracking-wider text-white">SchoolSphere Master Hub</span>
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
        <header className="bg-white border-b border-slate-200 h-14 sm:h-16 shrink-0 flex items-center justify-between gap-3 px-4 sm:px-6 min-w-0 print:hidden">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors lg:hidden shrink-0 cursor-pointer"
              title="Open Creator Menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500 min-w-0">
              <span className="hidden sm:inline whitespace-nowrap font-semibold text-slate-600">Creator Console</span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-300 hidden sm:inline shrink-0" />
              <span className="hidden md:inline whitespace-nowrap text-slate-500">{activeCreatorIdentity.category}</span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-300 hidden md:inline shrink-0" />
              <span className="font-bold text-slate-800 text-xs sm:text-sm truncate">
                {activeCreatorIdentity.title}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 sm:gap-3.5 shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-slate-900 text-indigo-400 border border-slate-800 flex items-center justify-center font-bold text-xs shrink-0">
                {(user?.fullName || user?.username || 'C')[0]?.toUpperCase()}
              </div>
              <div className="hidden sm:block text-left min-w-0">
                <span className="text-xs font-bold text-slate-800 block leading-tight truncate max-w-[150px]">
                  {user?.fullName || user?.username || 'Platform Creator'}
                </span>
                <span className="text-[10px] text-emerald-600 font-semibold capitalize block leading-none mt-0.5">
                  {user?.role?.replace('_', ' ') || 'Creator'}
                </span>
              </div>
            </div>

            {onExit && (
              <>
                <div className="h-5 w-px bg-slate-200 hidden sm:block" />
                <button
                  type="button"
                  onClick={onExit}
                  className="flex items-center gap-1.5 h-9 px-3 bg-slate-100 hover:bg-rose-50 border border-slate-200 hover:border-rose-200 text-slate-700 hover:text-rose-700 text-xs font-bold rounded-xl transition-colors cursor-pointer shrink-0 whitespace-nowrap"
                  title="Log Out"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Log Out</span>
                </button>
              </>
            )}
          </div>
        </header>

        {/* Content Container */}
        <main className="flex-1 overflow-y-auto p-6 space-y-6 print:block print:h-auto print:overflow-visible print:p-0">
          {/* Creator Sub-Page Identity Banner */}
          <section
            aria-label="Creator Page Identity Header"
            className="bg-white rounded-2xl border border-slate-200 px-5 py-4 shadow-2xs print:hidden"
          >
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="min-w-0 flex-1">
                <nav
                  aria-label="Creator Breadcrumb"
                  className="flex items-center flex-wrap gap-1.5 text-[11px] font-semibold text-slate-500 mb-1.5"
                >
                  <button
                    type="button"
                    onClick={() => setActivePanel('dashboard')}
                    className="text-indigo-600 hover:text-indigo-700 font-bold cursor-pointer"
                  >
                    Creator Console
                  </button>
                  <ChevronRight className="w-3 h-3 text-slate-300 shrink-0" />
                  <span>{activeCreatorIdentity.category}</span>
                  <ChevronRight className="w-3 h-3 text-slate-300 shrink-0" />
                  <span className="text-slate-900 font-bold" aria-current="page">
                    {activeCreatorIdentity.title}
                  </span>
                  <span className="hidden sm:inline-block font-mono text-[10px] font-bold text-slate-500 bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5 ml-1">
                    {activeCreatorIdentity.path}
                  </span>
                </nav>
                <div className="flex items-start sm:items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-slate-900 text-indigo-400 flex items-center justify-center shrink-0">
                    <ActiveSectionIcon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h1
                      data-testid="creator-active-page-title"
                      className="text-base sm:text-xl font-extrabold text-slate-900 tracking-tight leading-snug"
                    >
                      {activeCreatorIdentity.title}
                    </h1>
                    <p className="text-xs text-slate-600 font-medium mt-0.5">
                      {activeCreatorIdentity.subtitle}
                    </p>
                  </div>
                </div>
              </div>
              <div className="text-[11px] font-semibold text-slate-500 flex items-center gap-1.5 shrink-0">
                <span className="font-bold text-indigo-600 uppercase tracking-wider">{activeCreatorIdentity.category}</span>
                <span className="text-slate-300">·</span>
                <span className="font-mono font-bold text-slate-700">{sysAcademicYear}</span>
                <span className="text-slate-300">·</span>
                <span className="font-bold text-slate-700">{sysCurrentTerm}</span>
              </div>
            </div>
          </section>

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
                  onlineUsers={mergedOnlineUsers}
                  recentLogins={recentLogins}
                  allUsersPresence={mergedAllUsers}
                  isRealtimeConnected={isRealtimeConnected}
                  lastTelemetrySyncAt={lastTelemetrySyncAt}
                  isRefreshingTelemetry={isRefreshingTelemetry}
                  onRefreshTelemetry={() => fetchCreatorTelemetry(true)}
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
