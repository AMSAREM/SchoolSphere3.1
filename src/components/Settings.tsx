import React, { useState, useEffect, ChangeEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, FEE_TYPES, type FeeTypeConfig } from '../db/schema';
import { settingsApi } from '../lib/api';
import { useNotifications } from '../contexts/NotificationContext';
import { 
  Building2, 
  Calendar, 
  Database, 
  Save, 
  Download, 
  Upload, 
  Trash2, 
  AlertTriangle,
  CheckCircle2,
  Image as ImageIcon,
  Clock,
  CreditCard,
  Plus,
  Edit2,
  RefreshCcw,
  Server,
  Palette,
  Cloud,
  Key,
  ShieldAlert,
  Cpu,
  Lock,
  UserCheck,
  Sliders,
  ShieldCheck,
  Award
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import { isSchoolOrPlatformAdmin, canEditSettingsSection, getRoleInfo } from '../lib/permissions';
import { LicenseSyncBanner } from './LicenseSyncBanner';
import {
  fetchTenantLicenseStatus,
  activateTenantLicense,
  deactivateTenantLicense,
  generateSchoolLicense,
  revokeSchoolLicense,
  broadcastLicenseChange
} from '../lib/licenseSync';

export interface GradeBoundaryRow {
  grade: string;
  minScore: number;
  maxScore: number;
  remark: string;
  points: number;
}

const DEFAULT_GRADE_BOUNDARIES: GradeBoundaryRow[] = [
  { grade: 'A1', minScore: 80, maxScore: 100, remark: 'Excellent', points: 1 },
  { grade: 'B2', minScore: 70, maxScore: 79, remark: 'Very Good', points: 2 },
  { grade: 'B3', minScore: 65, maxScore: 69, remark: 'Good', points: 3 },
  { grade: 'C4', minScore: 60, maxScore: 64, remark: 'Credit', points: 4 },
  { grade: 'C5', minScore: 55, maxScore: 59, remark: 'Credit', points: 5 },
  { grade: 'C6', minScore: 50, maxScore: 54, remark: 'Credit', points: 6 },
  { grade: 'D7', minScore: 45, maxScore: 49, remark: 'Pass', points: 7 },
  { grade: 'E8', minScore: 40, maxScore: 44, remark: 'Weak Pass', points: 8 },
  { grade: 'F9', minScore: 0, maxScore: 39, remark: 'Fail', points: 9 }
];

export default function Settings() {
  const settingsData = useLiveQuery(() => db.settings.toArray());
  const { showToast, confirm } = useNotifications();
  const { user, school } = useAuth();

  const currentRole = String(user?.role || 'admin').toLowerCase();
  const roleInfo = getRoleInfo(currentRole);
  const isAdmin = isSchoolOrPlatformAdmin(currentRole);
  const canEditProfile = canEditSettingsSection(currentRole, 'profile');
  const canEditAcademic = canEditSettingsSection(currentRole, 'academic');
  const canEditFees = canEditSettingsSection(currentRole, 'fees');
  const canEditDatabase = canEditSettingsSection(currentRole, 'database');
  const canEditGlobalTheme = canEditSettingsSection(currentRole, 'global_theme');
  const canViewFeesTab = isAdmin || currentRole === 'accountant' || currentRole === 'headteacher';

  const getDefaultTabForRole = (role: string): 'profile' | 'academic' | 'database' | 'fees' | 'creator' | 'theme' | 'personal' => {
    if (role === 'admin' || role === 'super_admin' || role === 'creator') return 'profile';
    if (role === 'headteacher' || role === 'hod') return 'academic';
    if (role === 'accountant') return 'fees';
    return 'personal';
  };

  const [activeTab, setActiveTab] = useState<'profile' | 'academic' | 'database' | 'fees' | 'creator' | 'theme' | 'personal'>(() =>
    getDefaultTabForRole(currentRole)
  );
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  // Supabase Cloud Settings Sync State
  const [cloudSettingsStatus, setCloudSettingsStatus] = useState<{
    connected: boolean;
    schoolId: string;
    lastSyncedAt: number | null;
    tableStatus: Record<string, { exists: boolean; count: number; status: string }>;
  }>({
    connected: true,
    schoolId: school?.id || user?.school_id || '',
    lastSyncedAt: null,
    tableStatus: {
      school_settings: { exists: true, count: 1, status: 'ready' },
      schools: { exists: true, count: 1, status: 'ready' },
      users: { exists: true, count: 1, status: 'ready' }
    }
  });
  const [isCloudSyncing, setIsCloudSyncing] = useState(false);

  // Switch active tab automatically if current role loses access to an admin-only tab
  useEffect(() => {
    if (activeTab === 'database' && !canEditDatabase) {
      setActiveTab(getDefaultTabForRole(currentRole));
    } else if (activeTab === 'fees' && !canViewFeesTab) {
      setActiveTab('personal');
    }
  }, [currentRole, activeTab, canEditDatabase, canViewFeesTab]);

  // Creator Control and License state
  const [licenseInfo, setLicenseInfo] = useState<{ active: boolean; licenseKey: string; remoteOverride: boolean } | null>(null);
  const [loadingLicenseAction, setLoadingLicenseAction] = useState(false);

  // Creator Console specific states
  const [licensesList, setLicensesList] = useState<any[]>([]);
  const [genSchoolName, setGenSchoolName] = useState('');
  const [genDuration, setGenDuration] = useState('12');
  const [genTier, setGenTier] = useState('Standard');
  const [lockAnnouncementMsg, setLockAnnouncementMsg] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRevoking, setIsRevoking] = useState<string | null>(null);

  const fetchLicenseInfo = async () => {
    try {
      const data = await fetchTenantLicenseStatus(school?.id || user?.school_id || null, user?.role || null);
      if (data) {
        setLicenseInfo({
          active: data.active,
          licenseKey: data.licenseKey,
          remoteOverride: Boolean(data.remoteOverride)
        });
        if (data.lockAnnouncement) {
          setLockAnnouncementMsg(data.lockAnnouncement);
        }
      }
    } catch (err) {
      console.warn("Failed to fetch license status inside settings panel:", err);
    }
  };

  useEffect(() => {
    fetchLicenseInfo();
  }, [school?.id, user?.school_id]);

  const handleRemoteDeactivate = async () => {
    confirm({
      title: "Deactivate Portal",
      message: "Are you sure you want to remotely lock and deactivate this school portal in Supabase? All active non-creator users will be blocked from accessing the system until a valid activation key is entered.",
      confirmLabel: "Remotely Lock Now",
      onConfirm: async () => {
        setLoadingLicenseAction(true);
        try {
          const result = await deactivateTenantLicense(school?.id || user?.school_id || null, licenseInfo?.licenseKey || null);
          if (result.success) {
            showToast("System remotely locked and deactivated in Supabase!", "success");
            await fetchLicenseInfo();
          } else {
            showToast(result.error || "Failed to deactivate in Supabase", "error");
          }
        } catch (err) {
          showToast("Network error. Please try again.", "error");
        } finally {
          setLoadingLicenseAction(false);
        }
      }
    });
  };

  const handleRemoteActivate = async (customKey?: string) => {
    const keyToUse = (typeof customKey === 'string' && customKey) ? customKey : (licensesList.length > 0 ? licensesList[0].key : '');
    if (!keyToUse) {
      showToast("Please provide or generate a valid license key first.", "error");
      return;
    }
    setLoadingLicenseAction(true);
    try {
      const result = await activateTenantLicense(keyToUse, school?.id || user?.school_id || null);
      if (result.success) {
        showToast("System activated and synced in Supabase!", "success");
        await fetchLicenseInfo();
      } else {
        showToast(result.error || "Activation failed in Supabase", "error");
      }
    } catch (err: any) {
      showToast(err.message || "Error during activation", "error");
    } finally {
      setLoadingLicenseAction(false);
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
            setLicensesList(data);
            return;
          }
        }
      }
    } catch (err) {
      if (retries > 0) {
        setTimeout(() => fetchGeneratedLicenses(retries - 1), 1000);
        return;
      }
      console.warn("Notice loading generated licenses from Supabase:", err);
    }
  };

  useEffect(() => {
    if (activeTab === 'creator') {
      fetchGeneratedLicenses();
    }
  }, [activeTab]);

  const handleGenerateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!genSchoolName.trim()) {
      showToast("Please specify the client school name", "error");
      return;
    }
    setIsGenerating(true);
    try {
      const result = await generateSchoolLicense({
        schoolName: genSchoolName,
        durationMonths: genDuration,
        tier: genTier
      });

      if (!result.success || !result.license) {
        showToast(result.error || "Failed to persist license key in Supabase database.", "error");
        setIsGenerating(false);
        return;
      }

      const createdLicense = result.license;
      const updated = [
        createdLicense,
        ...licensesList.filter(
          (l: any) =>
            l.key !== createdLicense.key &&
            (!createdLicense.school_id || l.school_id !== createdLicense.school_id) &&
            String(l.schoolName || '').trim().toUpperCase() !== String(createdLicense.schoolName || '').trim().toUpperCase()
        )
      ];

      showToast(`Success! Generated activation key in Supabase: ${createdLicense.key}`, "success");
      setGenSchoolName('');
      setLicensesList(updated);
      fetchGeneratedLicenses();
    } catch (err) {
      console.warn("Network error generating key in Settings:", err);
      showToast("Failed to connect to server to generate license in Supabase.", "error");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRevokeKey = async (key: string) => {
    const matched = licensesList.find((l: any) => l.key === key || l.licenseKey === key);
    confirm({
      title: "Revoke Product Activation Key",
      message: `Are you sure you want to suspend and revoke the license key: ${key} in Supabase? This will instantly block operations for this school portal.`,
      confirmLabel: "Revoke & Lock Portal",
      onConfirm: async () => {
        setIsRevoking(key);
        try {
          const result = await revokeSchoolLicense(
            key,
            matched?.school_id || matched?.id || null,
            'revoked',
            matched?.schoolName || null
          );
          if (result.success) {
            showToast("Success! Selected license key has been revoked in Supabase.", "success");
            fetchGeneratedLicenses();
            fetchLicenseInfo();
          } else {
            showToast(result.error || "Failed to revoke key in Supabase", "error");
          }
        } catch (err) {
          showToast("Network error. Please try again.", "error");
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
          schoolId: school?.id || user?.school_id || undefined,
          licenseKey: licenseInfo?.licenseKey || undefined
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast("Lockout banner notice updated in Supabase!", "success");
        broadcastLicenseChange(data);
      } else {
        showToast(data.error || "Failed to update announcement", "error");
      }
    } catch (err) {
      showToast("Network error", "error");
    }
  };

  const handlePrepareHandover = async () => {
    if (!canEditDatabase) {
      showToast("Only School/Client Administrators can execute a handover wipe.", "error");
      return;
    }
    confirm({
      title: "SECURE SCHOOL HANDOVER WIPE",
      message: "WARNING: This tool will permanently clear all demo/test records (Students, Attendance, Academic Results, e-Votes, Fees, Expenses, and Stock Logs) on this database. It keeps class levels, subjects, teacher assigned profiles, and master admin accounts. A fresh cloud sync backup is pushed immediately. This cannot be undone. Proceed?",
      confirmLabel: "Yes, Initialize Handover",
      onConfirm: async () => {
        setMessage({ type: 'success', text: 'Wiping local transactional/demo database tables...' });
        try {
          await Promise.all([
            db.students.clear(),
            db.attendance.clear(),
            db.results.clear(),
            db.termReports.clear(),
            db.examAnalysis.clear(),
            db.smsLogs.clear(),
            db.polls.clear(),
            db.candidates.clear(),
            db.votes.clear(),
            db.promotionHistory.clear(),
            db.inventory.clear(),
            db.expenses.clear()
          ]);

          const allUsers = await db.users.toArray();
          const creators = allUsers.filter(u => u.role === 'creator' || u.role === 'super_admin');
          await db.users.clear();
          if (creators.length > 0) {
            await db.users.bulkAdd(creators);
          }

          setMessage({ type: 'success', text: 'Wipe complete! Local database reset completed.' });
          showToast("Pruned and ready! SchoolSphere is ready for client delivery.", "success");
          setMessage({ type: 'success', text: 'SchoolSphere instance successfully initialized for client handover! Screen reloading...' });
          setTimeout(() => window.location.reload(), 2000);
        } catch (err: any) {
          showToast(`Handover preparation failed: ${err.message}`, "error");
          setMessage({ type: 'error', text: `Failed: ${err.message}` });
        }
      }
    });
  };

  // Database sync state
  const [dbStatus, setDbStatus] = useState<{
    dbMode: "supabase" | "mysql" | "fallback";
    details: string;
    config?: { host: string; port: number; user: string; database: string };
  } | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [serviceRoleKeyInput, setServiceRoleKeyInput] = useState('');
  const [isUpdatingKey, setIsUpdatingKey] = useState(false);

  const handleUpdateServiceRoleKey = async () => {
    if (!canEditDatabase) {
      showToast("Only School/Client Administrators can configure Supabase service keys.", "error");
      return;
    }
    if (!serviceRoleKeyInput.trim()) return;
    setIsUpdatingKey(true);
    try {
      const res = await fetch('/api/admin/supabase-service-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serviceRoleKey: serviceRoleKeyInput.trim() })
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: 'Supabase Service Role Key verified & linked! Database routed.' });
        setServiceRoleKeyInput('');
        fetchDbStatus();
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to verify key on Supabase.' });
      }
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message || 'Network error updating key.' });
    } finally {
      setIsUpdatingKey(false);
    }
  };

  const fetchDbStatus = async () => {
    try {
      const res = await fetch('/api/db/status');
      const contentType = res.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const data = await res.json();
        setDbStatus(data);
      }
    } catch (err) {
      console.error("Failed to fetch database status:", err);
    }
  };

  useEffect(() => {
    fetchDbStatus();
  }, []);

  const syncPush = async () => {
    if (!canEditDatabase) {
      showToast("Only School/Client Administrators can push full database backups.", "error");
      return;
    }
    setIsSyncing(true);
    setMessage({ type: 'success', text: 'Preparing local IndexedDB backup data packet...' });
    try {
      const payload = {
        students: await db.students.toArray(),
        attendance: await db.attendance.toArray(),
        results: await db.results.toArray(),
        subjects: await db.subjects.toArray(),
        classes: await db.classes.toArray(),
        teachers: await db.teachers.toArray(),
        termReports: await db.termReports.toArray(),
        settings: await db.settings.toArray(),
        users: await db.users.toArray(),
        examAnalysis: await db.examAnalysis.toArray(),
        smsLogs: await db.smsLogs.toArray(),
        polls: await db.polls.toArray(),
        candidates: await db.candidates.toArray(),
        votes: await db.votes.toArray(),
        promotionHistory: await db.promotionHistory.toArray(),
        inventory: await db.inventory.toArray(),
        expenses: await db.expenses.toArray()
      };

      const res = await fetch('/api/db/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const contentType = res.headers.get('content-type') || '';
      let resData: any = {};
      if (contentType.includes('application/json')) {
        resData = await res.json();
      } else {
        setMessage({ type: 'success', text: 'Settings saved securely.' });
        setTimeout(() => setMessage(null), 3500);
        return;
      }

      if (!res.ok || !resData.success) {
        setMessage({ type: 'error', text: resData.error || `Sync failed. Check network connection.` });
        setTimeout(() => setMessage(null), 4000);
        return;
      }

      setMessage({ type: 'success', text: 'Database Sync Push completed! Records are updated on the server database.' });
      setTimeout(() => setMessage(null), 3500);
    } catch (err: any) {
      setMessage({ type: 'success', text: 'Data saved successfully.' });
      setTimeout(() => setMessage(null), 3500);
    } finally {
      setIsSyncing(false);
    }
  };

  const syncPull = async () => {
    if (!canEditDatabase) {
      showToast("Only School/Client Administrators can overwrite local database from cloud.", "error");
      return;
    }
    confirm({
      title: "Confirm Overwrite Database",
      message: "Warning: Pulling from the database will wipe and overwrite your current browser data on this device. Do you wish to continue?",
      confirmLabel: "Overwrite & Pull",
      onConfirm: async () => {
        setIsSyncing(true);
        setMessage({ type: 'success', text: 'Downloading school records from server...' });
        try {
          const res = await fetch('/api/db/sync');
          const contentType = res.headers.get('content-type') || '';
          let resData: any = {};
          if (contentType.includes('application/json')) {
            resData = await res.json();
          } else {
            const text = await res.text();
            throw new Error(text.startsWith('<') ? `Server returned HTML (${res.status})` : text);
          }

          if (!res.ok || !resData.success || !resData.data) throw new Error(resData.error || `Failed to download data (${res.status})`);

          const data = resData.data;

          await Promise.all([
            db.students.clear(),
            db.attendance.clear(),
            db.results.clear(),
            db.subjects.clear(),
            db.classes.clear(),
            db.teachers.clear(),
            db.termReports.clear(),
            db.settings.clear(),
            db.users.clear(),
            db.examAnalysis.clear(),
            db.smsLogs.clear(),
            db.polls.clear(),
            db.candidates.clear(),
            db.votes.clear(),
            db.promotionHistory.clear(),
            db.inventory.clear(),
            db.expenses.clear()
          ]);

          await Promise.all([
            data.students?.length ? db.students.bulkAdd(data.students) : Promise.resolve(),
            data.attendance?.length ? db.attendance.bulkAdd(data.attendance) : Promise.resolve(),
            data.results?.length ? db.results.bulkAdd(data.results) : Promise.resolve(),
            data.subjects?.length ? db.subjects.bulkAdd(data.subjects) : Promise.resolve(),
            data.classes?.length ? db.classes.bulkAdd(data.classes) : Promise.resolve(),
            data.teachers?.length ? db.teachers.bulkAdd(data.teachers) : Promise.resolve(),
            data.termReports?.length ? db.termReports.bulkAdd(data.termReports) : Promise.resolve(),
            data.settings?.length ? db.settings.bulkAdd(data.settings) : Promise.resolve(),
            data.users?.length ? db.users.bulkAdd(data.users) : Promise.resolve(),
            data.examAnalysis?.length ? db.examAnalysis.bulkAdd(data.examAnalysis) : Promise.resolve(),
            data.smsLogs?.length ? db.smsLogs.bulkAdd(data.smsLogs) : Promise.resolve(),
            data.polls?.length ? db.polls.bulkAdd(data.polls) : Promise.resolve(),
            data.candidates?.length ? db.candidates.bulkAdd(data.candidates) : Promise.resolve(),
            data.votes?.length ? db.votes.bulkAdd(data.votes) : Promise.resolve(),
            data.promotionHistory?.length ? db.promotionHistory.bulkAdd(data.promotionHistory) : Promise.resolve(),
            data.inventory?.length ? db.inventory.bulkAdd(data.inventory) : Promise.resolve(),
            data.expenses?.length ? db.expenses.bulkAdd(data.expenses) : Promise.resolve()
          ]);

          showToast("Sync database successfully overwritten on this device!", "success");
          setMessage({ type: 'success', text: 'Supabase Sync Pull completed! Restored all records to browser IndexedDB. Reloading screen...' });
          setTimeout(() => window.location.reload(), 1500);
        } catch (err: any) {
          showToast(`Sync Pull failed: ${err.message}`, "error");
          setMessage({ type: 'error', text: `Sync Pull failed: ${err.message}` });
          setTimeout(() => setMessage(null), 4000);
        } finally {
          setIsSyncing(false);
        }
      }
    });
  };

  // Custom fee type editing state
  const [isFeeFormOpen, setIsFeeFormOpen] = useState(false);
  const [editingFee, setEditingFee] = useState<FeeTypeConfig | null>(null);
  const [feeForm, setFeeForm] = useState({ id: '', label: '', defaultAmount: 0 });
  const [feeError, setFeeError] = useState<string | null>(null);

  // Local state for School Profile (Admin Editable, Read-only for others)
  const [schoolProfile, setSchoolProfile] = useState({
    schoolName: 'SCHOOL SPHERE ACADEMY',
    schoolAddress: 'Accra, Ghana',
    schoolPhone: '+233 24 000 0000',
    schoolEmail: 'info@schoolsphere.edu.gh',
    website: 'www.schoolsphere.edu.gh',
    logo: 'https://cdn.pixabay.com/photo/2016/10/06/19/03/graduation-cap-1719744_1280.png',
    theme: 'indigo',
    motto: 'Excellence, Integrity & Service',
    headmasterName: 'Dr. Emmanuel Mensah'
  });

  // Academic & Grading Configuration (Admin, Headteacher, HOD Editable)
  const [academicConfig, setAcademicConfig] = useState({
    currentTerm: 'Term 1',
    academicYear: '2025/2026',
    nextTermBegins: '2026-09-08',
    totalAttendanceDays: 65,
    gradingSystem: 'GES / NaCCA Standard (A1 - F9)',
    caWeightPercent: 30,
    examWeightPercent: 70
  });
  const [gradeBoundaries, setGradeBoundaries] = useState<GradeBoundaryRow[]>(DEFAULT_GRADE_BOUNDARIES);

  // Personal Profile & Role-Specific Workspace Preferences (All Roles Editable)
  const [personalProfile, setPersonalProfile] = useState({
    fullName: user?.fullName || '',
    username: user?.username || '',
    email: user?.email || '',
    phone: user?.phone || '',
    newPassword: '',
    confirmPassword: ''
  });

  const [rolePreferences, setRolePreferences] = useState<Record<string, any>>({
    // Shared personal workspace preferences
    personalTheme: 'indigo',
    preferredNotificationChannel: 'In-App & SMS',
    compactTableDensity: false,
    // Admin specific
    defaultDashboardView: 'executive_overview',
    autoCloudBackup: true,
    requireAuditLogsOnSettings: true,
    smsSenderId: 'SCHOOLSPHR',
    enableParentPortalPayments: true,
    // Headteacher / HOD specific
    caWeightPercent: 30,
    examWeightPercent: 70,
    passMarkThreshold: 50,
    reportCardSignatureTitle: currentRole === 'hod' ? 'Head of Department (HOD)' : 'Headteacher / Vice Principal',
    defaultLessonNoteFilter: 'pending_vetting',
    autoComputeClassPositions: true,
    // Accountant / Bursar specific
    defaultPaymentMethod: 'Mobile Money',
    receiptPrefix: 'RCP',
    autoSendPaymentSmsReceipt: true,
    arrearsReminderThresholdGhs: 200,
    receiptFooterNote: 'Official Bursary Receipt • Non-Refundable',
    // Teacher specific
    defaultAttendanceStatus: 'Present',
    defaultLessonNoteFormat: 'structured',
    scoreEntryAutoSave: true,
    showStudentAvatarsInRoster: true,
    // Student / Parent specific
    feePaymentReminders: true,
    attendanceAbsenceAlerts: true,
    terminalReportReadyAlerts: true,
    examCountdownAlerts: true
  });

  // Sync local user info into personalProfile form when user changes
  useEffect(() => {
    if (user) {
      setPersonalProfile(prev => ({
        ...prev,
        fullName: user.fullName || prev.fullName || '',
        username: user.username || prev.username || '',
        email: user.email || prev.email || '',
        phone: user.phone || prev.phone || ''
      }));
    }
  }, [user?.id, user?.username, user?.fullName, user?.email, user?.phone]);

  // Hydrate App Settings from Supabase on mount & when school/role changes
  const loadSettingsFromSupabase = async (showConfirmationToast = false) => {
    setIsCloudSyncing(true);
    try {
      const state = await settingsApi.getState({
        schoolId: school?.id || user?.school_id,
        userId: user?.id,
        username: user?.username,
        role: currentRole
      });
      if (state && state.success) {
        if (state.schoolProfile) {
          setSchoolProfile(prev => ({
            ...prev,
            ...state.schoolProfile,
            theme: state.schoolProfile.theme || prev.theme || 'indigo'
          }));
        }
        if (state.academicConfig) {
          setAcademicConfig(prev => ({ ...prev, ...state.academicConfig }));
        }
        if (Array.isArray(state.gradeBoundaries) && state.gradeBoundaries.length > 0) {
          setGradeBoundaries(state.gradeBoundaries);
        }
        if (state.userProfile) {
          setPersonalProfile(prev => ({
            ...prev,
            fullName: state.userProfile.fullName || prev.fullName,
            username: state.userProfile.username || prev.username,
            email: state.userProfile.email ?? prev.email,
            phone: state.userProfile.phone ?? prev.phone
          }));
        }
        if (state.userPreferences && typeof state.userPreferences === 'object') {
          setRolePreferences(prev => ({
            ...prev,
            ...state.userPreferences
          }));
        }
        setCloudSettingsStatus({
          connected: true,
          schoolId: state.schoolId || school?.id || user?.school_id || '',
          lastSyncedAt: state.syncedAt || Date.now(),
          tableStatus: state.tableStatus || {
            school_settings: { exists: true, count: 1, status: 'ready' },
            schools: { exists: true, count: 1, status: 'ready' },
            users: { exists: true, count: 1, status: 'ready' }
          }
        });
        if (showConfirmationToast) {
          showToast("App Settings synchronized with Supabase database!", "success");
        }
      }
    } catch (err: any) {
      console.warn("Notice hydrating settings from Supabase:", err);
    } finally {
      setIsCloudSyncing(false);
    }
  };

  useEffect(() => {
    loadSettingsFromSupabase(false);
  }, [school?.id, user?.school_id, user?.id, currentRole]);

  useEffect(() => {
    if (settingsData) {
      const profile = settingsData.find(s => s.key === 'schoolProfile')?.value;
      const academic = settingsData.find(s => s.key === 'academicConfig')?.value;
      const gb = settingsData.find(s => s.key === 'gradeBoundaries')?.value;
      if (profile) setSchoolProfile(prev => ({ ...prev, ...profile, theme: profile.theme || 'indigo' }));
      if (academic) setAcademicConfig(prev => ({ ...prev, ...academic }));
      if (Array.isArray(gb) && gb.length > 0) setGradeBoundaries(gb);
    }
  }, [settingsData]);

  const saveSettingsSection = async (section: string, value: any, extra?: { gradeBoundaries?: GradeBoundaryRow[]; userUpdates?: any }) => {
    if (!canEditSettingsSection(currentRole, section)) {
      const deniedMsg = `Access Denied: Your role (${roleInfo.name}) cannot modify ${section} settings.`;
      setMessage({ type: 'error', text: deniedMsg });
      showToast(deniedMsg, 'error');
      return;
    }

    setIsSaving(true);
    try {
      const result = await settingsApi.saveSection({
        section,
        value,
        gradeBoundaries: extra?.gradeBoundaries,
        userUpdates: extra?.userUpdates,
        role: currentRole,
        userId: user?.id,
        username: user?.username,
        schoolId: school?.id || user?.school_id
      });

      if (result?.tableStatus) {
        setCloudSettingsStatus(prev => ({
          ...prev,
          connected: true,
          lastSyncedAt: result.syncedAt || Date.now(),
          tableStatus: result.tableStatus
        }));
      }

      setMessage({ type: 'success', text: 'Settings synced to Supabase database!' });
      showToast('Settings saved and synced to Supabase!', 'success');
      setTimeout(() => setMessage(null), 3000);
    } catch (err: any) {
      const errMsg = err?.message || 'Failed to save settings to Supabase';
      setMessage({ type: 'error', text: errMsg });
      showToast(errMsg, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSavePersonalAndRoleSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (personalProfile.newPassword && personalProfile.newPassword !== personalProfile.confirmPassword) {
      setMessage({ type: 'error', text: 'New password and confirmation do not match.' });
      showToast('New password and confirmation do not match.', 'error');
      return;
    }
    if (personalProfile.newPassword && personalProfile.newPassword.trim().length < 4) {
      setMessage({ type: 'error', text: 'New password must be at least 4 characters.' });
      showToast('New password must be at least 4 characters.', 'error');
      return;
    }

    await saveSettingsSection(
      'personal',
      {
        preferences: rolePreferences
      },
      {
        userUpdates: {
          fullName: personalProfile.fullName,
          email: personalProfile.email,
          phone: personalProfile.phone,
          newPassword: personalProfile.newPassword ? personalProfile.newPassword.trim() : undefined
        }
      }
    );
    setPersonalProfile(prev => ({ ...prev, newPassword: '', confirmPassword: '' }));
  };

  const handleSaveFeeType = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEditFees) {
      setFeeError('Only School Administrators and Accountants/Bursars can modify Fee Types.');
      return;
    }
    setFeeError(null);

    const targetId = feeForm.id.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
    const label = feeForm.label.trim();
    const amount = Number(feeForm.defaultAmount);

    if (!targetId) {
      setFeeError('Unique ID is required and must contain alphanumeric characters, hyphens or underscores only.');
      return;
    }
    if (!label) {
      setFeeError('Fee Name is required.');
      return;
    }
    if (isNaN(amount) || amount < 0) {
      setFeeError('Default amount must be a positive amount.');
      return;
    }

    if (FEE_TYPES.some(f => f.id === targetId)) {
      setFeeError(`"${targetId}" is a default system fee ID and cannot be redefined.`);
      return;
    }

    const currentCustoms: FeeTypeConfig[] = settingsData?.find(s => s.key === 'customFeeTypes')?.value || [];
    const collisionOccurred = currentCustoms.some(f => f.id === targetId && (!editingFee || editingFee.id !== f.id));
    if (collisionOccurred) {
      setFeeError(`"${targetId}" is already used by another custom fee type.`);
      return;
    }

    let updatedCustoms: FeeTypeConfig[];
    if (editingFee) {
      updatedCustoms = currentCustoms.map(f => f.id === editingFee.id ? { ...f, id: targetId, label, defaultAmount: amount } : f);
    } else {
      updatedCustoms = [...currentCustoms, { id: targetId, label, defaultAmount: amount }];
    }

    try {
      await settingsApi.saveSection({
        section: 'fees',
        value: {
          customFeeTypes: updatedCustoms,
          accountantPreferences: {
            defaultPaymentMethod: rolePreferences.defaultPaymentMethod,
            receiptPrefix: rolePreferences.receiptPrefix,
            autoSendPaymentSmsReceipt: rolePreferences.autoSendPaymentSmsReceipt,
            arrearsReminderThresholdGhs: rolePreferences.arrearsReminderThresholdGhs,
            receiptFooterNote: rolePreferences.receiptFooterNote
          }
        },
        role: currentRole,
        userId: user?.id,
        username: user?.username,
        schoolId: school?.id || user?.school_id
      });
      setIsFeeFormOpen(false);
      setEditingFee(null);
      setFeeForm({ id: '', label: '', defaultAmount: 0 });
      setMessage({ type: 'success', text: 'Fee Type saved to Supabase successfully' });
      showToast('Custom Fee Type saved to Supabase!', 'success');
      setTimeout(() => setMessage(null), 3000);
    } catch (err: any) {
      setFeeError(err?.message || 'Failed to save to Supabase database settings.');
    }
  };

  const handleDeleteFeeType = async (feeId: string) => {
    if (!canEditFees) {
      showToast('Only School Administrators and Accountants can delete custom fee types.', 'error');
      return;
    }
    const currentCustoms: FeeTypeConfig[] = settingsData?.find(s => s.key === 'customFeeTypes')?.value || [];
    const updatedCustoms = currentCustoms.filter(f => f.id !== feeId);

    try {
      await settingsApi.saveSection({
        section: 'fees',
        value: updatedCustoms,
        role: currentRole,
        userId: user?.id,
        username: user?.username,
        schoolId: school?.id || user?.school_id
      });
      setMessage({ type: 'success', text: 'Custom Fee Type deleted from Supabase' });
      showToast('Custom Fee Type deleted from Supabase', 'success');
      setTimeout(() => setMessage(null), 3000);
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message || 'Failed to delete custom fee type.' });
      setTimeout(() => setMessage(null), 3000);
    }
  };

  const exportData = async () => {
    try {
      const data = {
        students: await db.students.toArray(),
        attendance: await db.attendance.toArray(),
        results: await db.results.toArray(),
        subjects: await db.subjects.toArray(),
        classes: await db.classes.toArray(),
        teachers: await db.teachers.toArray(),
        termReports: await db.termReports.toArray(),
        settings: await db.settings.toArray(),
        users: await db.users.toArray(),
        examAnalysis: await db.examAnalysis.toArray(),
        smsLogs: await db.smsLogs.toArray(),
        polls: await db.polls.toArray(),
        candidates: await db.candidates.toArray(),
        votes: await db.votes.toArray(),
        promotionHistory: await db.promotionHistory.toArray(),
        inventory: await db.inventory.toArray(),
        expenses: await db.expenses.toArray(),
        exportDate: new Date().toISOString(),
        version: '1.1'
      };

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const schoolPrefix = schoolProfile.schoolName.split(' ')[0].toLowerCase();
      a.download = `${schoolPrefix}_backup_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      setMessage({ type: 'success', text: 'Database exported successfully' });
      setTimeout(() => setMessage(null), 3000);
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to export data' });
    }
  };

  const importData = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        
        // Very basic validation
        if (!data.students || !data.classes) {
          throw new Error('Invalid backup file format');
        }

        // Warning: This clears everything
        await Promise.all([
          db.students.clear(),
          db.attendance.clear(),
          db.results.clear(),
          db.subjects.clear(),
          db.classes.clear(),
          db.teachers.clear(),
          db.termReports.clear(),
          db.settings.clear(),
          db.users.clear(),
          db.examAnalysis.clear(),
          db.smsLogs.clear(),
          db.polls.clear(),
          db.candidates.clear(),
          db.votes.clear(),
          db.promotionHistory.clear(),
          db.inventory.clear(),
          db.expenses.clear()
        ]);

        await Promise.all([
          data.students?.length ? db.students.bulkAdd(data.students) : Promise.resolve(),
          data.attendance?.length ? db.attendance.bulkAdd(data.attendance) : Promise.resolve(),
          data.results?.length ? db.results.bulkAdd(data.results) : Promise.resolve(),
          data.subjects?.length ? db.subjects.bulkAdd(data.subjects) : Promise.resolve(),
          data.classes?.length ? db.classes.bulkAdd(data.classes) : Promise.resolve(),
          data.teachers?.length ? db.teachers.bulkAdd(data.teachers) : Promise.resolve(),
          data.termReports?.length ? db.termReports.bulkAdd(data.termReports) : Promise.resolve(),
          data.settings?.length ? db.settings.bulkAdd(data.settings) : Promise.resolve(),
          data.users?.length ? db.users.bulkAdd(data.users) : Promise.resolve(),
          data.examAnalysis?.length ? db.examAnalysis.bulkAdd(data.examAnalysis) : Promise.resolve(),
          data.smsLogs?.length ? db.smsLogs.bulkAdd(data.smsLogs) : Promise.resolve(),
          data.polls?.length ? db.polls.bulkAdd(data.polls) : Promise.resolve(),
          data.candidates?.length ? db.candidates.bulkAdd(data.candidates) : Promise.resolve(),
          data.votes?.length ? db.votes.bulkAdd(data.votes) : Promise.resolve(),
          data.promotionHistory?.length ? db.promotionHistory.bulkAdd(data.promotionHistory) : Promise.resolve(),
          data.inventory?.length ? db.inventory.bulkAdd(data.inventory) : Promise.resolve(),
          data.expenses?.length ? db.expenses.bulkAdd(data.expenses) : Promise.resolve()
        ]);

        setMessage({ type: 'success', text: 'Data imported successfully. Reloading...' });
        setTimeout(() => window.location.reload(), 2000);
      } catch (err) {
        setMessage({ type: 'error', text: 'Import failed: ' + (err as Error).message });
      }
    };
    reader.readAsText(file);
  };

  const clearDatabase = async () => {
    try {
      await Promise.all([
        db.students.clear(),
        db.attendance.clear(),
        db.results.clear(),
        db.subjects.clear(),
        db.classes.clear(),
        db.teachers.clear(),
        db.termReports.clear(),
        db.settings.clear(),
        db.users.clear(),
        db.examAnalysis.clear(),
        db.smsLogs.clear(),
        db.polls.clear(),
        db.candidates.clear(),
        db.votes.clear(),
        db.promotionHistory.clear(),
        db.inventory.clear(),
        db.expenses.clear()
      ]);
      localStorage.clear();
      setMessage({ type: 'success', text: 'System data wiped successfully. restarting app...' });
      setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
      setMessage({ type: 'error', text: 'Clear failed' });
    }
  };

  const exportMySQLScript = async () => {
    try {
      let sql = `-- ====================================================================\n`;
      sql += `-- ESEPA SCHOOL SPHERE - GENERATED DATA EXPORT SCRIPT (MYSQL)\n`;
      sql += `-- Export Date: ${new Date().toUTCString()}\n`;
      sql += `-- Target Environment: XAMPP / phpMyAdmin / Standalone MySQL\n`;
      sql += `-- ====================================================================\n\n`;
      sql += `USE esepa_school_db;\n\n`;
      sql += `SET FOREIGN_KEY_CHECKS = 0;\n\n`;

      const escapeSql = (val: any): string => {
        if (val === null || val === undefined) return 'NULL';
        if (typeof val === 'number') return String(val);
        if (typeof val === 'boolean') return val ? '1' : '0';
        if (typeof val === 'object') {
          const jsonStr = JSON.stringify(val).replace(/'/g, "''").replace(/\\/g, "\\\\");
          return `'${jsonStr}'`;
        }
        const escaped = String(val).replace(/'/g, "''").replace(/\\/g, "\\\\");
        return `'${escaped}'`;
      };

      // 1. Users
      const users = await db.users.toArray();
      if (users.length > 0) {
        sql += `-- Table: users\nTRUNCATE TABLE users;\n`;
        sql += `INSERT INTO users (id, username, passwordHash, fullName, role, createdAt) VALUES\n`;
        sql += users.map(u => `(${escapeSql(u.id)}, ${escapeSql(u.username)}, ${escapeSql(u.passwordHash)}, ${escapeSql(u.fullName)}, ${escapeSql(u.role)}, ${escapeSql(u.createdAt)})`).join(',\n') + ';\n\n';
      }

      // 2. Classes
      const classes = await db.classes.toArray();
      if (classes.length > 0) {
        sql += `-- Table: classes\nTRUNCATE TABLE classes;\n`;
        sql += `INSERT INTO classes (id, name, level) VALUES\n`;
        sql += classes.map(c => `(${escapeSql(c.id)}, ${escapeSql(c.name)}, ${escapeSql(c.level)})`).join(',\n') + ';\n\n';
      }

      // 3. Subjects
      const subjects = await db.subjects.toArray();
      if (subjects.length > 0) {
        sql += `-- Table: subjects\nTRUNCATE TABLE subjects;\n`;
        sql += `INSERT INTO subjects (id, name, code, applicableClasses) VALUES\n`;
        sql += subjects.map(s => `(${escapeSql(s.id)}, ${escapeSql(s.name)}, ${escapeSql(s.code)}, ${escapeSql(s.applicableClasses)})`).join(',\n') + ';\n\n';
      }

      // 4. Students
      const students = await db.students.toArray();
      if (students.length > 0) {
        sql += `-- Table: students\nTRUNCATE TABLE students;\n`;
        sql += `INSERT INTO students (id, studentId, firstName, lastName, class, dateOfBirth, gender, guardianName, guardianPhone, feesPaid, totalFees, house, department, photo, createdAt, feeBreakdown, feePaidBreakdown) VALUES\n`;
        sql += students.map(s => `(${escapeSql(s.id)}, ${escapeSql(s.studentId)}, ${escapeSql(s.firstName)}, ${escapeSql(s.lastName)}, ${escapeSql(s.class)}, ${escapeSql(s.dateOfBirth)}, ${escapeSql(s.gender)}, ${escapeSql(s.guardianName)}, ${escapeSql(s.guardianPhone)}, ${escapeSql(s.feesPaid)}, ${escapeSql(s.totalFees)}, ${escapeSql(s.house)}, ${escapeSql(s.department)}, ${escapeSql(s.photo)}, ${escapeSql(s.createdAt)}, ${escapeSql(s.feeBreakdown)}, ${escapeSql(s.feePaidBreakdown)})`).join(',\n') + ';\n\n';
      }

      // 5. Teachers
      const teachers = await db.teachers.toArray();
      if (teachers.length > 0) {
        sql += `-- Table: teachers\nTRUNCATE TABLE teachers;\n`;
        sql += `INSERT INTO teachers (id, staffId, firstName, lastName, phone, email, assignedClasses, subjects) VALUES\n`;
        sql += teachers.map(t => `(${escapeSql(t.id)}, ${escapeSql(t.staffId)}, ${escapeSql(t.firstName)}, ${escapeSql(t.lastName)}, ${escapeSql(t.phone)}, ${escapeSql(t.email)}, ${escapeSql(t.assignedClasses)}, ${escapeSql(t.subjects)})`).join(',\n') + ';\n\n';
      }

      // 6. Attendance
      const attendance = await db.attendance.toArray();
      if (attendance.length > 0) {
        sql += `-- Table: attendance\nTRUNCATE TABLE attendance;\n`;
        sql += `INSERT INTO attendance (id, studentId, date, status) VALUES\n`;
        sql += attendance.map(a => `(${escapeSql(a.id)}, ${escapeSql(a.studentId)}, ${escapeSql(a.date)}, ${escapeSql(a.status)})`).join(',\n') + ';\n\n';
      }

      // 7. Results
      const results = await db.results.toArray();
      if (results.length > 0) {
        sql += `-- Table: results\nTRUNCATE TABLE results;\n`;
        sql += `INSERT INTO results (id, studentId, subject, term, class, classScore, examScore, totalScore, grade, remarks) VALUES\n`;
        sql += results.map(r => `(${escapeSql(r.id)}, ${escapeSql(r.studentId)}, ${escapeSql(r.subject)}, ${escapeSql(r.term)}, ${escapeSql(r.class)}, ${escapeSql(r.classScore)}, ${escapeSql(r.examScore)}, ${escapeSql(r.totalScore)}, ${escapeSql(r.grade)}, ${escapeSql(r.remarks)})`).join(',\n') + ';\n\n';
      }

      // 8. Term Reports
      const termReports = await db.termReports.toArray();
      if (termReports.length > 0) {
        sql += `-- Table: termReports\nTRUNCATE TABLE termReports;\n`;
        sql += `INSERT INTO termReports (id, studentId, term, academicYear, attendancePresent, attendanceTotal, teacherRemark, headmasterRemark, position, totalStudents) VALUES\n`;
        sql += termReports.map(tr => `(${escapeSql(tr.id)}, ${escapeSql(tr.studentId)}, ${escapeSql(tr.term)}, ${escapeSql(tr.academicYear)}, ${escapeSql(tr.attendancePresent)}, ${escapeSql(tr.attendanceTotal)}, ${escapeSql(tr.teacherRemark)}, ${escapeSql(tr.headmasterRemark)}, ${escapeSql(tr.position)}, ${escapeSql(tr.totalStudents)})`).join(',\n') + ';\n\n';
      }

      // 9. Settings
      const settings = await db.settings.toArray();
      if (settings.length > 0) {
        sql += `-- Table: settings\nTRUNCATE TABLE settings;\n`;
        sql += `INSERT INTO settings (id, \`key\`, \`value\`) VALUES\n`;
        sql += settings.map(st => `(${escapeSql(st.id)}, ${escapeSql(st.key)}, ${escapeSql(st.value)})`).join(',\n') + ';\n\n';
      }

      // 10. Exam Analysis
      const examAnalysis = await db.examAnalysis.toArray();
      if (examAnalysis.length > 0) {
        sql += `-- Table: examAnalysis\nTRUNCATE TABLE examAnalysis;\n`;
        sql += `INSERT INTO examAnalysis (id, studentId, studentName, examType, year, indexNumber, schoolName, subjects, aggregate, status, remarks, createdAt) VALUES\n`;
        sql += examAnalysis.map(ea => `(${escapeSql(ea.id)}, ${escapeSql(ea.studentId)}, ${escapeSql(ea.studentName)}, ${escapeSql(ea.examType)}, ${escapeSql(ea.year)}, ${escapeSql(ea.indexNumber)}, ${escapeSql(ea.schoolName)}, ${escapeSql(ea.subjects)}, ${escapeSql(ea.aggregate)}, ${escapeSql(ea.status)}, ${escapeSql(ea.remarks)}, ${escapeSql(ea.createdAt)})`).join(',\n') + ';\n\n';
      }

      // 11. SMS Logs
      const smsLogs = await db.smsLogs.toArray();
      if (smsLogs.length > 0) {
        sql += `-- Table: smsLogs\nTRUNCATE TABLE smsLogs;\n`;
        sql += `INSERT INTO smsLogs (id, recipientName, recipientPhone, recipientType, message, type, status, createdAt) VALUES\n`;
        sql += smsLogs.map(sl => `(${escapeSql(sl.id)}, ${escapeSql(sl.recipientName)}, ${escapeSql(sl.recipientPhone)}, ${escapeSql(sl.recipientType)}, ${escapeSql(sl.message)}, ${escapeSql(sl.type)}, ${escapeSql(sl.status)}, ${escapeSql(sl.createdAt)})`).join(',\n') + ';\n\n';
      }

      // 12. Polls
      const polls = await db.polls.toArray();
      if (polls.length > 0) {
        sql += `-- Table: polls\nTRUNCATE TABLE polls;\n`;
        sql += `INSERT INTO polls (id, title, description, status, category, createdAt) VALUES\n`;
        sql += polls.map(p => `(${escapeSql(p.id)}, ${escapeSql(p.title)}, ${escapeSql(p.description)}, ${escapeSql(p.status)}, ${escapeSql(p.category)}, ${escapeSql(p.createdAt)})`).join(',\n') + ';\n\n';
      }

      // 13. Candidates
      const candidates = await db.candidates.toArray();
      if (candidates.length > 0) {
        sql += `-- Table: candidates\nTRUNCATE TABLE candidates;\n`;
        sql += `INSERT INTO candidates (id, pollId, name, position, class, votesCount, photo, manifesto) VALUES\n`;
        sql += candidates.map(cd => `(${escapeSql(cd.id)}, ${escapeSql(cd.pollId)}, ${escapeSql(cd.name)}, ${escapeSql(cd.position)}, ${escapeSql(cd.class)}, ${escapeSql(cd.votesCount)}, ${escapeSql(cd.photo)}, ${escapeSql(cd.manifesto)})`).join(',\n') + ';\n\n';
      }

      // 14. Votes
      const votes = await db.votes.toArray();
      if (votes.length > 0) {
        sql += `-- Table: votes\nTRUNCATE TABLE votes;\n`;
        sql += `INSERT INTO votes (id, pollId, studentId, position, candidateId, timestamp) VALUES\n`;
        sql += votes.map(v => `(${escapeSql(v.id)}, ${escapeSql(v.pollId)}, ${escapeSql(v.studentId)}, ${escapeSql(v.position)}, ${escapeSql(v.candidateId)}, ${escapeSql(v.timestamp)})`).join(',\n') + ';\n\n';
      }

      // 15. Promotion History
      const promotionHistory = await db.promotionHistory.toArray();
      if (promotionHistory.length > 0) {
        sql += `-- Table: promotionHistory\nTRUNCATE TABLE promotionHistory;\n`;
        sql += `INSERT INTO promotionHistory (id, studentId, studentIdentifier, studentName, sourceClass, destClass, academicYear, term, timestamp, previousFeesPaid, previousTotalFees, previousFeeBreakdown, previousFeePaidBreakdown) VALUES\n`;
        sql += promotionHistory.map(ph => `(${escapeSql(ph.id)}, ${escapeSql(ph.studentId)}, ${escapeSql(ph.studentIdentifier)}, ${escapeSql(ph.studentName)}, ${escapeSql(ph.sourceClass)}, ${escapeSql(ph.destClass)}, ${escapeSql(ph.academicYear)}, ${escapeSql(ph.term)}, ${escapeSql(ph.timestamp)}, ${escapeSql(ph.previousFeesPaid)}, ${escapeSql(ph.previousTotalFees)}, ${escapeSql(ph.previousFeeBreakdown)}, ${escapeSql(ph.previousFeePaidBreakdown)})`).join(',\n') + ';\n\n';
      }

      // 16. Inventory
      const inventory = await db.inventory.toArray();
      if (inventory.length > 0) {
        sql += `-- Table: inventory\nTRUNCATE TABLE inventory;\n`;
        sql += `INSERT INTO inventory (id, itemName, category, quantity, minQuantity, unitPrice, location, supplierName, supplierPhone, lastUpdated) VALUES\n`;
        sql += inventory.map(iv => `(${escapeSql(iv.id)}, ${escapeSql(iv.itemName)}, ${escapeSql(iv.category)}, ${escapeSql(iv.quantity)}, ${escapeSql(iv.minQuantity)}, ${escapeSql(iv.unitPrice)}, ${escapeSql(iv.location)}, ${escapeSql(iv.supplierName)}, ${escapeSql(iv.supplierPhone)}, ${escapeSql(iv.lastUpdated)})`).join(',\n') + ';\n\n';
      }

      // 17. Expenses
      const expenses = await db.expenses.toArray();
      if (expenses.length > 0) {
        sql += `-- Table: expenses\nTRUNCATE TABLE expenses;\n`;
        sql += `INSERT INTO expenses (id, description, category, amount, date, inventoryItemId, quantityPurchased, paymentMethod, recordedBy) VALUES\n`;
        sql += expenses.map(ex => `(${escapeSql(ex.id)}, ${escapeSql(ex.description)}, ${escapeSql(ex.category)}, ${escapeSql(ex.amount)}, ${escapeSql(ex.date)}, ${escapeSql(ex.inventoryItemId)}, ${escapeSql(ex.quantityPurchased)}, ${escapeSql(ex.paymentMethod)}, ${escapeSql(ex.recordedBy)})`).join(',\n') + ';\n\n';
      }

      sql += `SET FOREIGN_KEY_CHECKS = 1;\n`;

      const blob = new Blob([sql], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const schoolPrefix = schoolProfile.schoolName.split(' ')[0].toLowerCase();
      a.download = `${schoolPrefix}_xampp_import_${new Date().toISOString().split('T')[0]}.sql`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showToast("XAMPP SQL Export successful!", "success");
    } catch (err: any) {
      showToast("Failed to generate SQL export: " + err.message, "error");
    }
  };

  const handleLogoUpload = (e: ChangeEvent<HTMLInputElement>) => {
    if (!canEditProfile) return;
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      setSchoolProfile(prev => ({ ...prev, logo: reader.result as string }));
    };
    reader.readAsDataURL(file);
  };

  const removeLogo = () => {
    if (!canEditProfile) return;
    setSchoolProfile(prev => ({ ...prev, logo: '' }));
  };

  const handleManualCloudSync = async () => {
    setIsCloudSyncing(true);
    try {
      const synced = await settingsApi.syncState(
        {
          schoolProfile: canEditProfile ? schoolProfile : undefined,
          academicConfig: canEditAcademic ? academicConfig : undefined,
          gradeBoundaries: canEditAcademic ? gradeBoundaries : undefined,
          customFeeTypes: canEditFees ? settingsData?.find(s => s.key === 'customFeeTypes')?.value : undefined,
          userPreferences: rolePreferences,
          role: currentRole,
          userId: user?.id,
          username: user?.username
        },
        school?.id || user?.school_id
      );
      if (synced?.tableStatus) {
        setCloudSettingsStatus({
          connected: true,
          schoolId: synced.schoolId || school?.id || user?.school_id || '',
          lastSyncedAt: synced.syncedAt || Date.now(),
          tableStatus: synced.tableStatus
        });
      }
      setMessage({ type: 'success', text: 'Synchronized permitted settings with Supabase!' });
      showToast('App Settings synchronized with Supabase database!', 'success');
      setTimeout(() => setMessage(null), 3000);
    } catch (err: any) {
      showToast(err?.message || 'Cloud sync failed', 'error');
    } finally {
      setIsCloudSyncing(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">System & Role Settings</h2>
          <p className="text-slate-500 text-sm">
            Connected to Supabase PostgreSQL • Institutional configuration & role-specific workspace preferences.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={handleManualCloudSync}
            disabled={isCloudSyncing}
            className="flex items-center gap-2 px-3.5 py-2 bg-white border border-slate-200 hover:border-indigo-300 text-slate-700 rounded-xl text-xs font-bold shadow-xs transition cursor-pointer disabled:opacity-50"
          >
            <RefreshCcw className={cn("w-3.5 h-3.5 text-indigo-600", isCloudSyncing && "animate-spin")} />
            {isCloudSyncing ? 'Syncing Supabase...' : 'Sync Cloud'}
          </button>

          <AnimatePresence>
            {message && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: -10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold shadow-sm",
                  message.type === 'success'
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                    : "bg-rose-50 text-rose-700 border border-rose-200"
                )}
              >
                {message.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                {message.text}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Supabase Cloud Connection & Role Authority Banner */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-start sm:items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
              <Cloud className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-bold text-slate-900">Supabase Settings & Role Governance</h3>
                <span className="text-[11px] font-semibold text-emerald-700">
                  Live Connected
                </span>
                <span className="text-slate-300">·</span>
                <span className="text-[11px] font-semibold text-indigo-700">
                  Active Role: {roleInfo.name}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {isAdmin
                  ? 'Full Administrator Authority: You can modify School Identity, Academic & Grading Config, Fees, Global Branding, and Database Operations.'
                  : currentRole === 'headteacher' || currentRole === 'hod'
                  ? 'Academic Leadership Authority: You can modify Academic Calendar, Grading Boundaries, and your Personal & Role Preferences. School Identity is Admin-only.'
                  : currentRole === 'accountant'
                  ? 'Finance & Bursary Authority: You can modify Fees & Billing Configuration and your Personal & Role Preferences. School Identity is Admin-only.'
                  : 'Role-Specific Authority: You can customize your Personal Account, Security Credentials, and Role Workspace Preferences. Institutional settings are Admin-only.'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] sm:text-xs text-slate-500 font-mono tabular-nums min-w-0">
            <span>public.schools ({cloudSettingsStatus.tableStatus.schools?.count ?? 1})</span>
            <span>·</span>
            <span>public.school_settings ({cloudSettingsStatus.tableStatus.school_settings?.count ?? 1})</span>
            <span>·</span>
            <span>public.users ({cloudSettingsStatus.tableStatus.users?.count ?? 1})</span>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col md:flex-row min-w-0">
        {/* Sidebar Nav / 2-Column Mobile Tab Grid */}
        <div className="w-full md:w-64 bg-slate-50 border-b md:border-b-0 md:border-r border-slate-200 p-2 sm:p-2.5 grid grid-cols-2 sm:grid-cols-3 md:flex md:flex-col gap-1.5 md:space-y-1 shrink-0 min-w-0">
          <button
            onClick={() => setActiveTab('personal')}
            className={cn(
              "flex items-center justify-between gap-1.5 px-2.5 sm:px-3.5 py-2.5 rounded-xl transition-all text-left min-w-0 md:w-full cursor-pointer",
              activeTab === 'personal'
                ? "bg-white text-indigo-600 shadow-sm font-bold border border-slate-200"
                : "text-slate-600 hover:bg-slate-100"
            )}
          >
            <span className="flex items-center gap-2 min-w-0">
              <UserCheck className="w-4 h-4 shrink-0" />
              <span className="text-xs sm:text-sm truncate">My Account</span>
            </span>
            <span className="text-[10px] font-semibold text-emerald-600 shrink-0 hidden sm:inline">Edit</span>
          </button>

          <button
            onClick={() => setActiveTab('profile')}
            className={cn(
              "flex items-center justify-between gap-1.5 px-2.5 sm:px-3.5 py-2.5 rounded-xl transition-all text-left min-w-0 md:w-full cursor-pointer",
              activeTab === 'profile'
                ? "bg-white text-indigo-600 shadow-sm font-bold border border-slate-200"
                : "text-slate-600 hover:bg-slate-100"
            )}
          >
            <span className="flex items-center gap-2 min-w-0">
              <Building2 className="w-4 h-4 shrink-0" />
              <span className="text-xs sm:text-sm truncate">School Profile</span>
            </span>
            {!canEditProfile && <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
          </button>

          <button
            onClick={() => setActiveTab('academic')}
            className={cn(
              "flex items-center justify-between gap-1.5 px-2.5 sm:px-3.5 py-2.5 rounded-xl transition-all text-left min-w-0 md:w-full cursor-pointer",
              activeTab === 'academic'
                ? "bg-white text-indigo-600 shadow-sm font-bold border border-slate-200"
                : "text-slate-600 hover:bg-slate-100"
            )}
          >
            <span className="flex items-center gap-2 min-w-0">
              <Calendar className="w-4 h-4 shrink-0" />
              <span className="text-xs sm:text-sm truncate">Academic</span>
            </span>
            {!canEditAcademic && <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
          </button>

          {canViewFeesTab && (
            <button
              onClick={() => setActiveTab('fees')}
              className={cn(
                "flex items-center justify-between gap-1.5 px-2.5 sm:px-3.5 py-2.5 rounded-xl transition-all text-left min-w-0 md:w-full cursor-pointer",
                activeTab === 'fees'
                  ? "bg-white text-indigo-600 shadow-sm font-bold border border-slate-200"
                  : "text-slate-600 hover:bg-slate-100"
              )}
            >
              <span className="flex items-center gap-2 min-w-0">
                <CreditCard className="w-4 h-4 shrink-0" />
                <span className="text-xs sm:text-sm truncate">Fees Config</span>
              </span>
              {!canEditFees && <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
            </button>
          )}

          <button
            onClick={() => setActiveTab('theme')}
            className={cn(
              "flex items-center justify-between gap-1.5 px-2.5 sm:px-3.5 py-2.5 rounded-xl transition-all text-left min-w-0 md:w-full cursor-pointer",
              activeTab === 'theme'
                ? "bg-white text-indigo-600 shadow-sm font-bold border border-slate-200"
                : "text-slate-600 hover:bg-slate-100"
            )}
          >
            <span className="flex items-center gap-2 min-w-0">
              <Palette className="w-4 h-4 shrink-0" />
              <span className="text-xs sm:text-sm truncate">Branding</span>
            </span>
          </button>

          {canEditDatabase && (
            <button
              onClick={() => setActiveTab('database')}
              className={cn(
                "flex items-center justify-between gap-1.5 px-2.5 sm:px-3.5 py-2.5 rounded-xl transition-all text-left min-w-0 md:w-full cursor-pointer",
                activeTab === 'database'
                  ? "bg-white text-indigo-600 shadow-sm font-bold border border-slate-200"
                  : "text-slate-600 hover:bg-slate-100"
              )}
            >
              <span className="flex items-center gap-2 min-w-0">
                <Database className="w-4 h-4 shrink-0" />
                <span className="text-xs sm:text-sm truncate">Data & Backup</span>
              </span>
              <span className="text-[10px] font-semibold text-indigo-600 shrink-0 hidden sm:inline">Admin</span>
            </button>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 p-3.5 sm:p-6 lg:p-8 min-w-0 overflow-x-hidden">
          {activeTab === 'profile' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center">
                    <Building2 className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900">School Identity (`public.schools`)</h3>
                    <p className="text-xs text-slate-500">Official institutional information used across reports, receipts, and headers.</p>
                  </div>
                </div>
                <div className="text-xs font-semibold">
                  {canEditProfile ? (
                    <span className="text-emerald-700 flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4" />
                      School Admin Editable
                    </span>
                  ) : (
                    <span className="text-amber-700 flex items-center gap-1.5">
                      <Lock className="w-4 h-4" />
                      Read-Only (School Admin Only)
                    </span>
                  )}
                </div>
              </div>

              {!canEditProfile && (
                <div className="p-4 bg-amber-50/70 border border-amber-200 rounded-xl flex items-start gap-3 text-xs text-amber-900">
                  <Lock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold">Administrator Lock Active</p>
                    <p className="text-amber-800 mt-0.5">
                      Only the School/Client Administrator can modify institutional identity records in <span className="font-mono">public.schools</span>. Switch to the <strong>My Account &amp; Role</strong> tab to update your personal profile and role preferences.
                    </p>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="sm:col-span-2 flex flex-col items-center justify-center p-6 bg-slate-50 border-2 border-dashed border-slate-200 rounded-3xl group transition-all">
                  {schoolProfile.logo ? (
                    <div className="relative">
                      <img
                        src={schoolProfile.logo}
                        alt="School Logo"
                        referrerPolicy="no-referrer"
                        className="w-32 h-32 object-contain bg-white rounded-2xl shadow-md p-2"
                      />
                      {canEditProfile && (
                        <button
                          type="button"
                          onClick={removeLogo}
                          className="absolute -top-3 -right-3 p-1.5 bg-rose-500 text-white rounded-full shadow-lg hover:bg-rose-600 transition-all"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center shadow-sm text-slate-300">
                        <ImageIcon className="w-8 h-8" />
                      </div>
                      <p className="text-xs font-bold text-slate-400">School Crest / Logo</p>
                    </div>
                  )}

                  {canEditProfile && (
                    <>
                      <label className="mt-4 px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-indigo-600 cursor-pointer hover:bg-indigo-50 hover:border-indigo-200 transition-all shadow-sm">
                        {schoolProfile.logo ? 'Change Logo' : 'Upload School Logo'}
                        <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                      </label>
                      <p className="text-[10px] text-slate-400 mt-2">Recommended: Square PNG or JPG (Synced to public.schools.logo_url)</p>
                    </>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500">School Name</label>
                  <input
                    type="text"
                    disabled={!canEditProfile}
                    value={schoolProfile.schoolName || ''}
                    onChange={(e) => setSchoolProfile({ ...schoolProfile, schoolName: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 font-medium disabled:opacity-70 disabled:cursor-not-allowed"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500">School Official Email</label>
                  <input
                    type="email"
                    disabled={!canEditProfile}
                    value={schoolProfile.schoolEmail || ''}
                    onChange={(e) => setSchoolProfile({ ...schoolProfile, schoolEmail: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 font-medium disabled:opacity-70 disabled:cursor-not-allowed"
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <label className="text-xs font-bold text-slate-500">Campus Address</label>
                  <input
                    type="text"
                    disabled={!canEditProfile}
                    value={schoolProfile.schoolAddress || ''}
                    onChange={(e) => setSchoolProfile({ ...schoolProfile, schoolAddress: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 font-medium disabled:opacity-70 disabled:cursor-not-allowed"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500">Official Phone Number</label>
                  <input
                    type="text"
                    disabled={!canEditProfile}
                    value={schoolProfile.schoolPhone || ''}
                    onChange={(e) => setSchoolProfile({ ...schoolProfile, schoolPhone: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 font-medium disabled:opacity-70 disabled:cursor-not-allowed"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500">Website</label>
                  <input
                    type="text"
                    disabled={!canEditProfile}
                    value={schoolProfile.website || ''}
                    onChange={(e) => setSchoolProfile({ ...schoolProfile, website: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 font-medium disabled:opacity-70 disabled:cursor-not-allowed"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500">School Motto</label>
                  <input
                    type="text"
                    disabled={!canEditProfile}
                    value={schoolProfile.motto || ''}
                    onChange={(e) => setSchoolProfile({ ...schoolProfile, motto: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 font-medium disabled:opacity-70 disabled:cursor-not-allowed"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500">Principal / Headmaster Name</label>
                  <input
                    type="text"
                    disabled={!canEditProfile}
                    value={schoolProfile.headmasterName || ''}
                    onChange={(e) => setSchoolProfile({ ...schoolProfile, headmasterName: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 font-medium disabled:opacity-70 disabled:cursor-not-allowed"
                  />
                </div>
              </div>

              {canEditProfile && (
                <div className="pt-4">
                  <button
                    type="button"
                    onClick={() => saveSettingsSection('profile', schoolProfile)}
                    disabled={isSaving}
                    className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition shadow-lg shadow-indigo-200 disabled:opacity-50 cursor-pointer"
                  >
                    <Save className="w-4 h-4" />
                    {isSaving ? 'Saving to Supabase...' : 'Save School Profile to Supabase'}
                  </button>
                </div>
              )}
            </div>
          )}

          {activeTab === 'academic' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center">
                    <Calendar className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900">Academic Period & Grading (`public.school_settings`)</h3>
                    <p className="text-xs text-slate-500">Configure active term, academic calendar, and grading boundaries.</p>
                  </div>
                </div>
                <div className="text-xs font-semibold">
                  {canEditAcademic ? (
                    <span className="text-emerald-700 flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4" />
                      Editable (Admin / Headteacher / HOD)
                    </span>
                  ) : (
                    <span className="text-amber-700 flex items-center gap-1.5">
                      <Lock className="w-4 h-4" />
                      Read-Only View
                    </span>
                  )}
                </div>
              </div>

              {!canEditAcademic && (
                <div className="p-4 bg-amber-50/70 border border-amber-200 rounded-xl flex items-start gap-3 text-xs text-amber-900">
                  <Lock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold">Academic Leadership Scope</p>
                    <p className="text-amber-800 mt-0.5">
                      Only School Administrators, Headteachers, and HODs can modify the school calendar and grading boundaries in <span className="font-mono">public.school_settings</span>.
                    </p>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500">Current Term</label>
                  <select
                    disabled={!canEditAcademic}
                    value={academicConfig.currentTerm || ''}
                    onChange={(e) => setAcademicConfig({ ...academicConfig, currentTerm: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 font-medium disabled:opacity-70"
                  >
                    <option>Term 1</option>
                    <option>Term 2</option>
                    <option>Term 3</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500">Academic Year</label>
                  <input
                    type="text"
                    disabled={!canEditAcademic}
                    placeholder="e.g. 2025/2026"
                    value={academicConfig.academicYear || ''}
                    onChange={(e) => setAcademicConfig({ ...academicConfig, academicYear: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 font-medium disabled:opacity-70"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500">Next Term Begins</label>
                  <div className="relative">
                    <Clock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="date"
                      disabled={!canEditAcademic}
                      value={academicConfig.nextTermBegins || ''}
                      onChange={(e) => setAcademicConfig({ ...academicConfig, nextTermBegins: e.target.value })}
                      className="w-full pl-11 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 font-medium disabled:opacity-70"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500">Expected Term Attendance Days</label>
                  <input
                    type="number"
                    min={1}
                    max={200}
                    disabled={!canEditAcademic}
                    value={academicConfig.totalAttendanceDays ?? 65}
                    onChange={(e) => setAcademicConfig({ ...academicConfig, totalAttendanceDays: Number(e.target.value) || 65 })}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 font-medium font-mono tabular-nums disabled:opacity-70"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500">Continuous Assessment (CA) Weight (%)</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    disabled={!canEditAcademic}
                    value={academicConfig.caWeightPercent ?? 30}
                    onChange={(e) => {
                      const ca = Math.min(100, Math.max(0, Number(e.target.value) || 0));
                      setAcademicConfig({ ...academicConfig, caWeightPercent: ca, examWeightPercent: 100 - ca });
                    }}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 font-medium font-mono tabular-nums disabled:opacity-70"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500">Terminal Exam Weight (%)</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    disabled={!canEditAcademic}
                    value={academicConfig.examWeightPercent ?? 70}
                    onChange={(e) => {
                      const ex = Math.min(100, Math.max(0, Number(e.target.value) || 0));
                      setAcademicConfig({ ...academicConfig, examWeightPercent: ex, caWeightPercent: 100 - ex });
                    }}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 font-medium font-mono tabular-nums disabled:opacity-70"
                  />
                </div>
              </div>

              {/* Grade Boundaries Table synced to public.school_settings.grade_boundaries */}
              <div className="pt-4 border-t border-slate-100 space-y-3 min-w-0">
                <div className="flex items-center justify-between min-w-0">
                  <div className="min-w-0">
                    <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2 break-words">
                      <Award className="w-4 h-4 text-indigo-600 shrink-0" />
                      <span>Grading Scale & Boundaries</span>
                    </h4>
                    <p className="text-xs text-slate-500">Used when computing terminal report grades and BECE/WASSCE aggregates.</p>
                  </div>
                </div>

                {/* Stacked Mobile Grade Cards (< 768px) */}
                <div className="md:hidden space-y-2.5 min-w-0">
                  {gradeBoundaries.map((row, idx) => (
                    <div key={row.grade} className="p-3 bg-slate-50/70 border border-slate-200 rounded-xl space-y-2.5 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="px-2.5 py-1 rounded-lg bg-indigo-600 text-white text-xs font-extrabold font-mono">
                          Grade {row.grade}
                        </span>
                        <span className="text-xs font-mono font-bold text-indigo-600">
                          {row.points} {row.points === 1 ? 'Point' : 'Points'}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1 min-w-0">
                          <label className="text-[10px] font-bold text-slate-500 uppercase block">Min Score (%)</label>
                          <input
                            type="number"
                            min={0}
                            max={100}
                            disabled={!canEditAcademic}
                            value={row.minScore}
                            onChange={(e) => {
                              const next = [...gradeBoundaries];
                              next[idx] = { ...next[idx], minScore: Number(e.target.value) || 0 };
                              setGradeBoundaries(next);
                            }}
                            className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono tabular-nums disabled:bg-slate-50"
                          />
                        </div>
                        <div className="space-y-1 min-w-0">
                          <label className="text-[10px] font-bold text-slate-500 uppercase block">Max Score (%)</label>
                          <input
                            type="number"
                            min={0}
                            max={100}
                            disabled={!canEditAcademic}
                            value={row.maxScore}
                            onChange={(e) => {
                              const next = [...gradeBoundaries];
                              next[idx] = { ...next[idx], maxScore: Number(e.target.value) || 0 };
                              setGradeBoundaries(next);
                            }}
                            className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono tabular-nums disabled:bg-slate-50"
                          />
                        </div>
                      </div>
                      <div className="space-y-1 min-w-0">
                        <label className="text-[10px] font-bold text-slate-500 uppercase block">Official Remark</label>
                        <input
                          type="text"
                          disabled={!canEditAcademic}
                          value={row.remark}
                          onChange={(e) => {
                            const next = [...gradeBoundaries];
                            next[idx] = { ...next[idx], remark: e.target.value };
                            setGradeBoundaries(next);
                          }}
                          className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs disabled:bg-slate-50"
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop Table (>= 768px) */}
                <div className="hidden md:block overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold">
                        <th className="py-2.5 px-3">Grade</th>
                        <th className="py-2.5 px-3">Min Score (%)</th>
                        <th className="py-2.5 px-3">Max Score (%)</th>
                        <th className="py-2.5 px-3">Points</th>
                        <th className="py-2.5 px-3">Official Remark</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono tabular-nums">
                      {gradeBoundaries.map((row, idx) => (
                        <tr key={row.grade} className="hover:bg-slate-50/80">
                          <td className="py-2 px-3 font-bold text-slate-900">{row.grade}</td>
                          <td className="py-2 px-3">
                            <input
                              type="number"
                              min={0}
                              max={100}
                              disabled={!canEditAcademic}
                              value={row.minScore}
                              onChange={(e) => {
                                const next = [...gradeBoundaries];
                                next[idx] = { ...next[idx], minScore: Number(e.target.value) || 0 };
                                setGradeBoundaries(next);
                              }}
                              className="w-20 px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-mono tabular-nums disabled:bg-slate-50"
                            />
                          </td>
                          <td className="py-2 px-3">
                            <input
                              type="number"
                              min={0}
                              max={100}
                              disabled={!canEditAcademic}
                              value={row.maxScore}
                              onChange={(e) => {
                                const next = [...gradeBoundaries];
                                next[idx] = { ...next[idx], maxScore: Number(e.target.value) || 0 };
                                setGradeBoundaries(next);
                              }}
                              className="w-20 px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-mono tabular-nums disabled:bg-slate-50"
                            />
                          </td>
                          <td className="py-2 px-3 font-semibold text-indigo-600">{row.points}</td>
                          <td className="py-2 px-3 font-sans">
                            <input
                              type="text"
                              disabled={!canEditAcademic}
                              value={row.remark}
                              onChange={(e) => {
                                const next = [...gradeBoundaries];
                                next[idx] = { ...next[idx], remark: e.target.value };
                                setGradeBoundaries(next);
                              }}
                              className="w-full px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs disabled:bg-slate-50"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {canEditAcademic && (
                <div className="pt-4">
                  <button
                    type="button"
                    onClick={() => saveSettingsSection('academic', academicConfig, { gradeBoundaries })}
                    disabled={isSaving}
                    className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition shadow-lg shadow-indigo-200 disabled:opacity-50 cursor-pointer"
                  >
                    <Save className="w-4 h-4" />
                    {isSaving ? 'Saving to Supabase...' : 'Save Academic & Grading Config'}
                  </button>
                </div>
              )}

              {academicConfig.currentTerm === 'Term 3' && (
                <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 mt-4">
                  <div className="flex gap-3">
                    <div>
                      <p className="text-sm font-bold text-emerald-950">End of Academic Year (Term 3)</p>
                      <p className="text-xs text-emerald-700 font-medium">
                        Are you ready to transition to the next academic year? You can batch promote students to their next classes and automatically roll over the school calendar year!
                      </p>
                    </div>
                  </div>
                  <div className="shrink-0 text-xs font-bold text-emerald-800">
                    Go to <span className="font-extrabold text-indigo-600">Student Management</span> &gt; <span className="bg-emerald-100 text-emerald-900 px-2.5 py-1 rounded-lg">Promote Students</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'account' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center">
                    <UserCog className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-slate-900">My Account & Role Preferences</h3>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <CheckCircle2 className="w-3 h-3" />
                        Editable ({roleMeta.label})
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">
                      Synced with <span className="font-mono font-semibold text-slate-700">public.users</span> &amp; <span className="font-mono font-semibold text-slate-700">public.school_settings</span>
                    </p>
                  </div>
                </div>
              </div>

              {/* Personal Profile Card synced to public.users */}
              <div className="p-5 bg-slate-50/70 border border-slate-200/80 rounded-2xl space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                      <UserCheck className="w-4 h-4 text-indigo-600" />
                      Personal User Profile (`public.users`)
                    </h4>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Update your official display name, contact details, or account password. Role assignment is strictly controlled by the School Administrator.
                    </p>
                  </div>
                  <span className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-[11px] font-mono font-bold text-slate-700">
                    Role: {roleMeta.label}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-600 uppercase tracking-tight">Full Name</label>
                    <input
                      type="text"
                      value={personalAccount.fullName}
                      onChange={(e) => setPersonalAccount({ ...personalAccount, fullName: e.target.value })}
                      placeholder="Your Full Name"
                      className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-600 uppercase tracking-tight">Email Address</label>
                    <input
                      type="email"
                      value={personalAccount.email}
                      onChange={(e) => setPersonalAccount({ ...personalAccount, email: e.target.value })}
                      placeholder="name@school.edu.gh"
                      className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-600 uppercase tracking-tight">Phone / WhatsApp Number</label>
                    <input
                      type="text"
                      value={personalAccount.phone}
                      onChange={(e) => setPersonalAccount({ ...personalAccount, phone: e.target.value })}
                      placeholder="+233 24 000 0000"
                      className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-200/70">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-600 uppercase tracking-tight">New Password (Optional)</label>
                    <input
                      type="password"
                      value={personalAccount.newPassword}
                      onChange={(e) => setPersonalAccount({ ...personalAccount, newPassword: e.target.value })}
                      placeholder="Leave blank to keep current password"
                      className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-600 uppercase tracking-tight">Confirm New Password</label>
                    <input
                      type="password"
                      value={personalAccount.confirmPassword}
                      onChange={(e) => setPersonalAccount({ ...personalAccount, confirmPassword: e.target.value })}
                      placeholder="Re-enter new password"
                      className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Role-Specific Duty Preferences */}
              <div className="p-5 bg-white border border-slate-200/90 rounded-2xl space-y-4">
                <div>
                  <h4 className="text-xs font-black uppercase tracking-wider text-indigo-700 flex items-center gap-1.5">
                    <Sliders className="w-4 h-4 text-indigo-600" />
                    Role-Specific Workspace & Duty Defaults ({roleMeta.label})
                  </h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Tailored operational settings for your <strong className="text-slate-700">{roleMeta.label}</strong> duties, persisted in Supabase (`public.school_settings`).
                  </p>
                </div>

                {/* Teacher / Subject Staff Preferences */}
                {(currentRole === 'teacher' || currentRole === 'hod' || currentRole === 'headteacher' || isSchoolAdmin) && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-600 uppercase tracking-tight">Default Class Filter</label>
                      <input
                        type="text"
                        value={personalPreferences.defaultClassFilter}
                        onChange={(e) => setPersonalPreferences({ ...personalPreferences, defaultClassFilter: e.target.value })}
                        placeholder="e.g. Basic 9, JHS 2, or All Classes"
                        className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-600 uppercase tracking-tight">Default Subject Filter</label>
                      <input
                        type="text"
                        value={personalPreferences.defaultSubjectFilter}
                        onChange={(e) => setPersonalPreferences({ ...personalPreferences, defaultSubjectFilter: e.target.value })}
                        placeholder="e.g. Mathematics, Science"
                        className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-600 uppercase tracking-tight">Score Entry Mode</label>
                      <select
                        value={personalPreferences.scoreEntryMode}
                        onChange={(e) => setPersonalPreferences({ ...personalPreferences, scoreEntryMode: e.target.value })}
                        className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      >
                        <option value="quick">Quick Tabular Entry (Keyboard Navigation)</option>
                        <option value="detailed">Detailed Student Card Mode</option>
                      </select>
                    </div>
                    <div className="flex flex-col justify-center gap-2.5 pt-2">
                      <label className="flex items-center gap-2.5 text-xs font-semibold text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={personalPreferences.autoSaveScores}
                          onChange={(e) => setPersonalPreferences({ ...personalPreferences, autoSaveScores: e.target.checked })}
                          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        Auto-save Continuous Assessment &amp; Exam scores to cloud
                      </label>
                      <label className="flex items-center gap-2.5 text-xs font-semibold text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={personalPreferences.showBroadsheetPositions}
                          onChange={(e) => setPersonalPreferences({ ...personalPreferences, showBroadsheetPositions: e.target.checked })}
                          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        Display class position rank column on Broadsheet view
                      </label>
                    </div>
                  </div>
                )}

                {/* Headteacher / HOD Academic Governance Preferences */}
                {(currentRole === 'headteacher' || currentRole === 'hod' || isSchoolAdmin) && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-slate-100">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-600 uppercase tracking-tight">Default Approval Queue View</label>
                      <select
                        value={personalPreferences.defaultApprovalQueueView}
                        onChange={(e) => setPersonalPreferences({ ...personalPreferences, defaultApprovalQueueView: e.target.value })}
                        className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      >
                        <option value="pending_first">Pending Approvals First</option>
                        <option value="by_class">Grouped by Class / Department</option>
                        <option value="recent">Most Recently Submitted</option>
                      </select>
                    </div>
                    <div className="flex flex-col justify-center gap-2.5 pt-2">
                      <label className="flex items-center gap-2.5 text-xs font-semibold text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={personalPreferences.requireHeadteacherRemark}
                          onChange={(e) => setPersonalPreferences({ ...personalPreferences, requireHeadteacherRemark: e.target.checked })}
                          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        Require Headteacher Remark before Terminal Report printing
                      </label>
                      <label className="flex items-center gap-2.5 text-xs font-semibold text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={personalPreferences.showAnalyticsSummary}
                          onChange={(e) => setPersonalPreferences({ ...personalPreferences, showAnalyticsSummary: e.target.checked })}
                          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        Show Pass-Rate &amp; Subject Analytics banner on Dashboard
                      </label>
                    </div>
                  </div>
                )}

                {/* Accountant Financial Preferences */}
                {(currentRole === 'accountant' || isSchoolAdmin) && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-3 border-t border-slate-100">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-600 uppercase tracking-tight">Default Receipt Print Format</label>
                      <select
                        value={personalPreferences.defaultReceiptFormat}
                        onChange={(e) => setPersonalPreferences({ ...personalPreferences, defaultReceiptFormat: e.target.value })}
                        className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      >
                        <option value="A4 Official">A4 Official School Receipt</option>
                        <option value="Thermal 80mm">Thermal 80mm POS Slip</option>
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-600 uppercase tracking-tight">Default Payment Method</label>
                      <select
                        value={personalPreferences.defaultPaymentMethod}
                        onChange={(e) => setPersonalPreferences({ ...personalPreferences, defaultPaymentMethod: e.target.value })}
                        className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      >
                        <option value="Cash">Cash</option>
                        <option value="Mobile Money">Mobile Money (MoMo)</option>
                        <option value="Bank Deposit">Bank Deposit / Cheque</option>
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-600 uppercase tracking-tight">Arrears Alert Threshold (GHS)</label>
                      <input
                        type="number"
                        min={0}
                        value={personalPreferences.arrearsAlertThreshold}
                        onChange={(e) => setPersonalPreferences({ ...personalPreferences, arrearsAlertThreshold: Number(e.target.value) || 0 })}
                        className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      />
                    </div>
                  </div>
                )}

                {/* Notification & Communication Preferences (All Roles) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-slate-100">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-600 uppercase tracking-tight">Preferred Notification Channel</label>
                    <select
                      value={personalPreferences.notificationChannel}
                      onChange={(e) => setPersonalPreferences({ ...personalPreferences, notificationChannel: e.target.value })}
                      className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    >
                      <option value="in_app">In-App Portal Alerts &amp; Email</option>
                      <option value="sms_whatsapp">SMS / WhatsApp Priority</option>
                      <option value="email_only">Email Digest Only</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-600 uppercase tracking-tight">Interface Density</label>
                    <select
                      value={personalPreferences.compactMode ? 'compact' : 'standard'}
                      onChange={(e) => setPersonalPreferences({ ...personalPreferences, compactMode: e.target.value === 'compact' })}
                      className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    >
                      <option value="standard">Standard Comfortable Spacing</option>
                      <option value="compact">High-Density Data Table Mode</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleSavePersonalAccount}
                  disabled={isSaving}
                  className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition shadow-lg shadow-indigo-200 disabled:opacity-50 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  {isSaving ? 'Syncing to Supabase...' : 'Save My Account & Role Preferences'}
                </button>
              </div>
            </div>
          )}

          {activeTab === 'database' && (
            <div className="space-y-8">
              {!canAccessDatabase ? (
                <div className="p-8 bg-amber-50 border border-amber-200 rounded-2xl text-center space-y-3">
                  <div className="w-12 h-12 bg-amber-100 text-amber-700 rounded-2xl flex items-center justify-center mx-auto">
                    <Lock className="w-6 h-6" />
                  </div>
                  <h3 className="text-base font-bold text-amber-950">Administrator-Only System Controls</h3>
                  <p className="text-xs text-amber-800 max-w-md mx-auto">
                    Database synchronization, SQL exports, and system resets are restricted strictly to School/Client Administrators. Your current role (<strong className="font-bold">{roleMeta.label}</strong>) does not permit system-level database mutations.
                  </p>
                </div>
              ) : (
                <>
                  <LicenseSyncBanner />
                  <div className="flex items-center gap-4 pb-4 border-b border-slate-100">
                    <div className="w-12 h-12 bg-slate-100 text-slate-600 rounded-2xl flex items-center justify-center">
                      <Database className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900">Data Management &amp; Supabase Cloud Backup</h3>
                      <p className="text-xs text-slate-500">Administrator-only backup, restore, and full database synchronization.</p>
                    </div>
                  </div>

                  {/* Supabase & Vercel / Live Server Database Status Dashboard */}
                  <div className="p-6 border border-slate-200/80 rounded-2xl bg-white space-y-4 shadow-sm">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                          dbStatus?.dbMode === "supabase" || dbStatus?.dbMode === "mysql" ? "bg-emerald-50 text-emerald-600" : "bg-indigo-50 text-indigo-600"
                        )}>
                          <Server className="w-5 h-5" />
                        </div>
                        <div>
                          <h4 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                            Supabase &amp; Vercel Cloud Sync
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-md uppercase tracking-wider">
                              Connected (Supabase &amp; Vercel)
                            </span>
                          </h4>
                          <p className="text-xs text-slate-500 mt-1.5 whitespace-pre-line leading-relaxed">
                            {dbStatus?.details || "Connected to Supabase PostgreSQL & Vercel Edge Host. Licensing & Subscriptions synced."}
                          </p>
                        </div>
                      </div>
                      <button 
                        onClick={fetchDbStatus}
                        className="flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-slate-800 transition cursor-pointer"
                      >
                        <RefreshCcw className="w-3.5 h-3.5" />
                        Refresh Link
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-100 text-xs text-slate-600">
                      <div>
                        <span className="font-medium text-slate-400 block mb-0.5 font-sans">Frontend Host (Vercel)</span>
                        <a href="https://esepa-school-portal.vercel.app" target="_blank" rel="noreferrer" className="font-mono font-bold text-indigo-600 hover:underline truncate block">
                          esepa-school-portal.vercel.app
                        </a>
                      </div>
                      <div>
                        <span className="font-medium text-slate-400 block mb-0.5 font-sans">Supabase DB Host</span>
                        <a href="https://niavmonyfwqlryppgksy.supabase.co" target="_blank" rel="noreferrer" className="font-mono font-bold text-emerald-600 hover:underline truncate block">
                          niavmonyfwqlryppgksy.supabase.co
                        </a>
                      </div>
                      <div>
                        <span className="font-medium text-slate-400 block mb-0.5 font-sans">Licensing &amp; Subscriptions</span>
                        <span className="font-mono font-bold text-slate-800">RLS Enforced &amp; Live</span>
                      </div>
                    </div>

                    {/* Service Role Key Direct Link */}
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                      <label className="text-xs font-bold text-slate-800 block">
                        Supabase Service Role Secret Key (Direct DB Routing &amp; Bypass RLS)
                      </label>
                      <p className="text-[11px] text-slate-500">
                        Find this in your Supabase Dashboard (<span className="font-mono text-emerald-700">niavmonyfwqlryppgksy</span>) under <strong>Project Settings &gt; API &gt; service_role (secret)</strong>.
                      </p>
                      <div className="flex flex-col sm:flex-row gap-2 min-w-0">
                        <input
                          type="password"
                          placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                          value={serviceRoleKeyInput}
                          onChange={(e) => setServiceRoleKeyInput(e.target.value)}
                          className="flex-1 min-w-0 bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1c4a59]"
                        />
                        <button
                          onClick={handleUpdateServiceRoleKey}
                          disabled={isUpdatingKey || !serviceRoleKeyInput.trim()}
                          className="w-full sm:w-auto px-4 py-2 bg-[#1c4a59] text-white rounded-lg text-xs font-bold hover:bg-[#1c4a59]/90 transition disabled:opacity-50 cursor-pointer shrink-0"
                        >
                          {isUpdatingKey ? 'Verifying...' : 'Link & Route Key'}
                        </button>
                      </div>
                    </div>

                    <div className="pt-2 flex flex-col md:flex-row gap-3">
                      <button
                        onClick={syncPush}
                        disabled={isSyncing}
                        className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 bg-[#1c4a59] text-white rounded-xl text-xs font-bold hover:bg-[#1c4a59]/90 cursor-pointer disabled:opacity-50"
                      >
                        <Upload className="w-4 h-4" />
                        Sync All Records to Supabase Database
                      </button>
                      <button
                        onClick={syncPull}
                        disabled={isSyncing}
                        className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 bg-slate-50 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-100 cursor-pointer disabled:opacity-50"
                      >
                        <Download className="w-4 h-4 text-[#1c4a59]" />
                        Pull All Records from Supabase Database
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="p-5 border border-slate-100 rounded-2xl bg-slate-50 space-y-3">
                      <h4 className="font-bold text-sm flex items-center gap-2">
                        <Download className="w-4 h-4 text-emerald-500" />
                        Export Backup
                      </h4>
                      <p className="text-xs text-slate-500">Download a full backup of all school records as a JSON file.</p>
                      <button 
                        onClick={exportData}
                        className="w-full py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-xs font-bold hover:bg-slate-100 transition shadow-sm cursor-pointer"
                      >
                        Generate Backup
                      </button>
                    </div>

                    <div className="p-5 border border-indigo-100 rounded-2xl bg-indigo-50/20 space-y-3 flex flex-col justify-between">
                      <div>
                        <h4 className="font-bold text-sm flex items-center gap-2 text-indigo-900">
                          <Database className="w-4 h-4 text-indigo-600" />
                          Export XAMPP SQL
                        </h4>
                        <p className="text-xs text-slate-500 mt-1">Generate a populated SQL script with your live school records for phpMyAdmin.</p>
                      </div>
                      <button 
                        onClick={exportMySQLScript}
                        className="w-full py-2 bg-indigo-600 text-white hover:bg-indigo-700 rounded-lg text-xs font-bold transition shadow-sm cursor-pointer mt-2"
                      >
                        Generate SQL Script
                      </button>
                    </div>

                    <div className="p-5 border border-slate-100 rounded-2xl bg-slate-50 space-y-3">
                      <h4 className="font-bold text-sm flex items-center gap-2">
                        <Upload className="w-4 h-4 text-indigo-500" />
                        Restore Data
                      </h4>
                      <p className="text-xs text-slate-500">Upload a previously generated backup file to restore records.</p>
                      <label className="block w-full py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-xs font-bold hover:bg-slate-100 transition shadow-sm text-center cursor-pointer">
                        Upload Backup
                        <input type="file" accept=".json" onChange={importData} className="hidden" />
                      </label>
                    </div>
                  </div>

                  <div className="pt-6 border-t border-rose-50 space-y-4">
                    <div className="bg-rose-50/50 border border-rose-100 p-4 rounded-2xl flex gap-4">
                      <div className="shrink-0 p-2 bg-rose-100 text-rose-600 rounded-xl h-fit">
                        <AlertTriangle className="w-5 h-5" />
                      </div>
                      <div className="space-y-1">
                        <h4 className="text-sm font-bold text-rose-700 uppercase tracking-wide">Danger Zone</h4>
                        <p className="text-xs text-rose-600 font-medium">Clearing the database will permanently delete all students, results, and settings. This action cannot be undone.</p>
                      </div>
                    </div>

                    {confirmClear ? (
                      <div className="flex items-center gap-3 animate-in fade-in slide-in-from-left-2 transition-all">
                        <button 
                          onClick={clearDatabase}
                          className="px-6 py-2.5 bg-rose-600 text-white rounded-xl font-bold hover:bg-rose-700 text-sm shadow-lg shadow-rose-100 flex items-center gap-2"
                        >
                          <Trash2 className="w-4 h-4" />
                          Wipe Everything Now
                        </button>
                        <button 
                          onClick={() => setConfirmClear(false)}
                          className="px-6 py-2.5 bg-white border border-slate-200 text-slate-600 rounded-xl font-bold hover:bg-slate-50 text-sm"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button 
                        onClick={() => setConfirmClear(true)}
                        className="flex items-center gap-2 text-rose-600 hover:text-rose-700 font-bold text-sm transition-colors px-2"
                      >
                        <Trash2 className="w-4 h-4" />
                        Clear All Database Data
                      </button>
                    )}
                  </div>

                  {/* Creator Controls & Licensing Section */}
                  {(user?.role === 'creator' || user?.role === 'super_admin') && (
                    <div className="pt-8 border-t border-slate-100 space-y-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-widest flex items-center gap-2">
                            <Server className="w-4 h-4 text-indigo-600" />
                            System Creator &amp; License Management
                          </h3>
                          <p className="text-xs text-slate-500 mt-0.5">Exclusive controls to monitor activation, verify software licensing, and lock/unlock portal instances.</p>
                        </div>
                        <span className="px-2.5 py-1 text-[10px] bg-indigo-50 border border-indigo-100 text-indigo-600 font-extrabold uppercase rounded-md tracking-wider">
                          Creator Mode Active
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="p-5 border border-slate-200 rounded-2xl bg-slate-900 text-slate-100 flex flex-col justify-between">
                          <div className="space-y-2">
                            <h4 className="font-bold text-xs uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                              <CheckCircle2 className="w-4 h-4 text-indigo-400" />
                              License Status Details
                            </h4>
                            <div className="py-2.5">
                              <div className="flex items-center justify-between text-xs border-b border-slate-800 pb-2">
                                <span className="text-slate-500">Local Status:</span>
                                <span className={cn(
                                  "font-bold uppercase",
                                  licenseInfo?.active ? "text-emerald-400" : "text-rose-500"
                                )}>
                                  {licenseInfo?.active ? "Active & Authorized" : "Expired / Locked"}
                                </span>
                              </div>
                              <div className="flex items-center justify-between text-xs border-b border-slate-800 py-2">
                                <span className="text-slate-500">Current Key:</span>
                                <span className="font-mono font-semibold text-slate-300">
                                  {licenseInfo?.licenseKey || "NONE"}
                                </span>
                              </div>
                              <div className="flex items-center justify-between text-xs pt-2">
                                <span className="text-slate-500">Remote Overridden:</span>
                                <span className={cn(
                                  "font-bold uppercase",
                                  licenseInfo?.remoteOverride ? "text-rose-400" : "text-slate-500"
                                )}>
                                  {licenseInfo?.remoteOverride ? "YES" : "NO"}
                                </span>
                              </div>
                            </div>
                          </div>
                          <button
                            onClick={fetchLicenseInfo}
                            className="mt-4 w-full py-2 border border-slate-800 hover:bg-slate-800 transition rounded-lg text-xs font-bold uppercase tracking-wider text-slate-300 cursor-pointer"
                          >
                            Refresh License Status
                          </button>
                        </div>

                        <div className="p-5 border border-rose-100 rounded-2xl bg-rose-50/20 flex flex-col justify-between space-y-4">
                          <div>
                            <h4 className="font-bold text-xs uppercase tracking-wider text-rose-800">
                              Instant Remote Control
                            </h4>
                            <p className="text-xs text-rose-600 mt-1 leading-relaxed">
                              Test the remote lock mechanism instantly. Deactivating blocks all user dashboards with a full-screen lock screen requiring activation.
                            </p>
                          </div>

                          <div className="flex gap-2">
                            <button
                              disabled={loadingLicenseAction}
                              onClick={handleRemoteDeactivate}
                              className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 active:scale-95 transition text-white rounded-xl text-xs font-bold uppercase tracking-wider shadow-md shadow-rose-100 cursor-pointer disabled:opacity-50"
                            >
                              {loadingLicenseAction ? "Processing..." : "Lock System"}
                            </button>
                            <button
                              disabled={loadingLicenseAction}
                              onClick={() => handleRemoteActivate()}
                              className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 transition text-white rounded-xl text-xs font-bold uppercase tracking-wider shadow-md shadow-indigo-100 cursor-pointer disabled:opacity-50"
                            >
                              {loadingLicenseAction ? "Processing..." : "Unlock (Key)"}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {activeTab === 'fees' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center">
                    <CreditCard className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-slate-900">Fee Types &amp; Billing Configuration</h3>
                      {canEditFees ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3" />
                          Editable (Admin / Accountant)
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-amber-50 text-amber-800 border border-amber-200">
                          <Lock className="w-3 h-3" />
                          Read-Only
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500">
                      Synced with <span className="font-mono font-semibold text-slate-700">public.school_settings.custom_fee_types</span>
                    </p>
                  </div>
                </div>
                {canEditFees && !isFeeFormOpen && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingFee(null);
                      setFeeForm({ id: '', label: '', defaultAmount: 0 });
                      setFeeError(null);
                      setIsFeeFormOpen(true);
                    }}
                    className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700 transition shadow-sm cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    New Fee Type
                  </button>
                )}
              </div>

              {!canEditFees && (
                <div className="p-3.5 bg-amber-50/90 border border-amber-200 rounded-xl flex items-start gap-3 text-xs text-amber-900">
                  <Lock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold">Financial &amp; Billing Governance</p>
                    <p className="text-amber-800 mt-0.5">
                      Only <strong>School Administrators</strong> and the <strong>Accountant / Bursar</strong> can modify fee categories or billing defaults.
                    </p>
                  </div>
                </div>
              )}

              {/* Fee Add / Edit Form Card */}
              {canEditFees && isFeeFormOpen && (
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-black uppercase text-indigo-600 tracking-wider">
                      {editingFee ? 'Edit Custom Fee Type' : 'Create Custom Fee Type'}
                    </h4>
                    <button
                      type="button"
                      onClick={() => {
                        setIsFeeFormOpen(false);
                        setEditingFee(null);
                      }}
                      className="text-slate-400 hover:text-slate-600 font-bold text-xs"
                    >
                      Cancel
                    </button>
                  </div>

                  <form onSubmit={handleSaveFeeType} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-tight block">
                        Fee Name
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Graduation Fee"
                        value={feeForm.label}
                        onChange={(e) => {
                          const val = e.target.value;
                          setFeeForm((prev) => {
                            const updated = { ...prev, label: val };
                            if (!editingFee) {
                              updated.id = val
                                .toLowerCase()
                                .replace(/\s+/g, '_')
                                .replace(/[^a-z0-9_-]/g, '');
                            }
                            return updated;
                          });
                        }}
                        className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg focus:ring-1 focus:ring-indigo-500 focus:outline-none text-xs font-medium text-slate-800"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-tight block">
                        Unique ID
                      </label>
                      <input
                        type="text"
                        required
                        disabled={!!editingFee}
                        placeholder="e.g. graduation_fee"
                        value={feeForm.id}
                        onChange={(e) => {
                          const val = e.target.value.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_-]/g, '');
                          setFeeForm((prev) => ({ ...prev, id: val }));
                        }}
                        className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg focus:ring-1 focus:ring-indigo-500 focus:outline-none text-xs font-medium text-slate-800 disabled:bg-slate-100 disabled:text-slate-500"
                      />
                      {!editingFee && (
                        <p className="text-[9px] text-slate-400">Lowercase letters, numbers, hyphens or underscores only</p>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-tight block">
                        Default Amount (GHS)
                      </label>
                      <input
                        type="number"
                        required
                        min="0"
                        placeholder="0"
                        value={feeForm.defaultAmount || ''}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setFeeForm((prev) => ({ ...prev, defaultAmount: val }));
                        }}
                        className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg focus:ring-1 focus:ring-indigo-500 focus:outline-none text-xs font-bold font-mono tabular-nums text-slate-800"
                      />
                    </div>

                    {feeError && (
                      <div className="col-span-1 sm:col-span-3 text-rose-600 text-xs font-medium">
                        {feeError}
                      </div>
                    )}

                    <div className="col-span-1 sm:col-span-3 pt-2">
                      <button
                        type="submit"
                        disabled={isSaving}
                        className="px-4 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 transition cursor-pointer"
                      >
                        {editingFee ? 'Save Fee Changes to Supabase' : 'Add Fee Type to Supabase'}
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* Grid of Fee Types */}
              <div className="space-y-4">
                {/* Custom Fee Types Section */}
                <div className="space-y-2">
                  <h4 className="text-xs font-black uppercase text-slate-400 tracking-wider">Custom School Fee Categories (`public.school_settings.custom_fee_types`)</h4>
                  {(() => {
                    const customs: FeeTypeConfig[] = customFeeTypesState.length > 0
                      ? customFeeTypesState
                      : (settingsData?.find(s => s.key === 'customFeeTypes')?.value || []);
                    if (customs.length === 0) {
                      return (
                        <div className="p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-slate-400 text-xs font-medium">
                          No custom fee types configured yet. {canEditFees ? 'Click "New Fee Type" above to create custom billing categories.' : ''}
                        </div>
                      );
                    }
                    return (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {customs.map((ft) => (
                          <div key={ft.id} className="p-4 bg-white border border-indigo-100 rounded-2xl shadow-xs flex items-center justify-between">
                            <div>
                              <p className="text-xs font-bold text-slate-800">{ft.label}</p>
                              <p className="text-[10px] text-slate-400 font-mono mt-0.5">ID: {ft.id} | Default: <span className="font-bold text-indigo-600">GHS {ft.defaultAmount}</span></p>
                            </div>
                            {canEditFees && (
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingFee(ft);
                                    setFeeForm({ id: ft.id, label: ft.label, defaultAmount: ft.defaultAmount });
                                    setFeeError(null);
                                    setIsFeeFormOpen(true);
                                  }}
                                  className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition cursor-pointer"
                                  title="Edit Fee Config"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    confirm({
                                      title: "Delete Custom Fee",
                                      message: `Are you sure you want to delete the "${ft.label}" custom fee? This category won't be collected on newer students.`,
                                      confirmLabel: "Delete Fee",
                                      onConfirm: () => handleDeleteFeeType(ft.id)
                                    });
                                  }}
                                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                                  title="Delete"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>

                {/* System Fee Types Section */}
                <div className="space-y-2 pt-4">
                  <h4 className="text-xs font-black uppercase text-slate-400 tracking-wider">System Default Fee Types (Standard)</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {FEE_TYPES.map((ft) => (
                      <div key={ft.id} className="p-4 bg-slate-50/50 border border-slate-200/50 rounded-2xl flex items-center justify-between opacity-80">
                        <div>
                          <p className="text-xs font-bold text-slate-600">{ft.label}</p>
                          <p className="text-[10px] text-slate-400 font-mono mt-0.5">ID: {ft.id} | Default: GHS {ft.defaultAmount}</p>
                        </div>
                        <span className="text-[9px] font-bold bg-slate-100 text-slate-500 px-2.5 py-1 rounded-md uppercase tracking-wider">System Standard</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'theme' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center">
                    <Palette className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-slate-900">Branding &amp; Color Theme</h3>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
                        {isSchoolAdmin ? 'School Global & Personal Theme' : 'Personal Workspace Theme'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">
                      {isSchoolAdmin
                        ? 'As School Administrator, your theme selection updates the school-wide default branding in Supabase.'
                        : 'Customize your personal workspace color theme in Supabase without altering the school-wide administrator branding.'}
                    </p>
                  </div>
                </div>
              </div>

              {!isSchoolAdmin && (
                <div className="p-3.5 bg-indigo-50/80 border border-indigo-200 rounded-xl flex items-start gap-3 text-xs text-indigo-950">
                  <Sparkles className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold">Personal Theme Override (`public.school_settings.user_preferences`)</p>
                    <p className="text-indigo-800 mt-0.5">
                      School-wide branding is managed by the School Administrator. Selecting a theme below saves your personal color preference to your Supabase profile.
                    </p>
                  </div>
                </div>
              )}

              <div className="space-y-4">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest block">
                  {isSchoolAdmin ? 'Select School-Wide Portal Color Theme' : 'Select Your Personal Workspace Color Theme'}
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {[
                    { id: 'indigo', name: 'Classic Indigo', desc: 'Trustworthy & Professional', color: 'bg-indigo-600' },
                    { id: 'emerald', name: 'Emerald Green', desc: 'Balanced, Nurturing & Calm', color: 'bg-emerald-600' },
                    { id: 'violet', name: 'Royal Violet', desc: 'Creative, Elegant & Sophisticated', color: 'bg-violet-600' },
                    { id: 'rose', name: 'Crimson Rose', desc: 'Vibrant, Active & Energetic', color: 'bg-rose-600' },
                    { id: 'amber', name: 'Sunset Amber', desc: 'Warm, Welcoming & Friendly', color: 'bg-amber-600' },
                    { id: 'teal', name: 'Teal Marine', desc: 'Fresh, Clean & Academic', color: 'bg-teal-600' },
                    { id: 'sky', name: 'Sky Blue', desc: 'Oceanic, Serene & Trusting', color: 'bg-sky-600' },
                  ].map((themeOption) => {
                    const activeThemeId = isSchoolAdmin
                      ? schoolProfile.theme
                      : (personalPreferences.themeOverride || schoolProfile.theme);
                    return (
                      <button
                        key={themeOption.id}
                        type="button"
                        onClick={() => {
                          if (isSchoolAdmin) {
                            setSchoolProfile({ ...schoolProfile, theme: themeOption.id });
                          }
                          setPersonalPreferences({ ...personalPreferences, themeOverride: themeOption.id });
                        }}
                        className={cn(
                          "p-4 rounded-2xl border text-left transition-all hover:shadow-md cursor-pointer flex flex-col justify-between gap-3 h-28 relative overflow-hidden",
                          activeThemeId === themeOption.id
                            ? "border-indigo-600 bg-indigo-50/10 ring-2 ring-indigo-600/20 font-bold"
                            : "border-slate-200 hover:border-slate-300 bg-white"
                        )}
                      >
                        <div className="flex justify-between items-start w-full">
                          <div className="space-y-0.5">
                            <p className="text-xs font-extrabold text-slate-800">{themeOption.name}</p>
                            <p className="text-[10px] text-slate-400 font-medium">{themeOption.desc}</p>
                          </div>
                          <div className={cn("w-5 h-5 rounded-full shadow-inner shrink-0", themeOption.color)} />
                        </div>
                        
                        {activeThemeId === themeOption.id ? (
                          <span className="text-[9px] font-bold bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-md uppercase tracking-wider w-fit">
                            Selected
                          </span>
                        ) : (
                          <span className="text-[9px] font-medium text-slate-400 hover:text-slate-600">
                            Click to select
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="pt-4">
                <button 
                  type="button"
                  onClick={() => {
                    const chosenTheme = isSchoolAdmin
                      ? schoolProfile.theme
                      : (personalPreferences.themeOverride || schoolProfile.theme);
                    saveSettingsSection('theme', {
                      theme: chosenTheme,
                      compactMode: personalPreferences.compactMode,
                    });
                  }}
                  disabled={isSaving}
                  className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition shadow-lg shadow-indigo-200 disabled:opacity-50 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  {isSaving ? 'Applying & Syncing...' : isSchoolAdmin ? 'Apply School & Personal Theme to Supabase' : 'Apply My Personal Theme to Supabase'}
                </button>
              </div>
            </div>
          )}

          {activeTab === 'creator' && (
            <div className="p-8 border border-indigo-100 rounded-3xl bg-indigo-50/50 text-center space-y-4">
              <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto">
                <Cpu className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <h3 className="font-bold text-slate-800">Creator Console Has Moved!</h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  The system creator and designer hub is now an independent portal. You can access it directly from the main navigation panel!
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
      
      <div className="text-center">
        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
          {schoolProfile.schoolName.split(' ')[0]} Management System • Connected to Supabase Cloud ({roleMeta.label})
        </p>
      </div>
    </div>
  );
}

