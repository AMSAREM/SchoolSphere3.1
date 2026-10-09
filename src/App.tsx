/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo, useRef, FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { 
  Users, 
  BookOpen, 
  CheckCircle, 
  CreditCard, 
  LayoutDashboard, 
  Settings as SettingsIcon, 
  Wifi, 
  RefreshCcw,
  Database,
  LogOut,
  ChevronRight,
  ChevronDown,
  Menu,
  X,
  FileText,
  Briefcase,
  ShieldAlert,
  Siren,
  Volume2,
  VolumeX,
  Calendar,
  Award,
  MessageSquare,
  Vote,
  Package,
  Cpu,
  Building,
  Check,
  ArrowRight,
  Lock,
  Server,
  Key,
  Sparkles,
  Activity,
  ClipboardCheck,
  UserCheck,
  Wallet,
  Bed,
  GraduationCap
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { db, purgeDemoRecordsFromDb } from './db/schema';
import { initRealtimeAndAutoSync, syncAllDataFromBackend } from './lib/syncService';
import { sirenApi } from './lib/api';
import Dashboard from './components/Dashboard';
import StudentManagement from './components/StudentManagement';
import AttendanceTerminal from './components/AttendanceTerminal';
import ResultsTerminal from './components/ResultsTerminal';
import FeeManagement from './components/FeeManagement';
import AcademicManagement from './components/AcademicManagement';
import ReportTerminal from './components/ReportTerminal';
import Settings from './components/Settings';
import UserManagement from './components/UserManagement';
import SirenTerminal from './components/SirenTerminal';
import TimetableManagement from './components/TimetableManagement';
import ExamAnalysis from './components/ExamAnalysis';
import EVoting from './components/EVoting';
import InventoryManagement from './components/InventoryManagement';
import CreatorHub from './components/CreatorHub';
import SchoolManagement from './components/SchoolManagement';
import TenantSwitcher from './components/TenantSwitcher';
import LessonNotes from './components/LessonNotes';
import DutyRosterManagement from './components/DutyRosterManagement';
import PayrollManagement from './components/PayrollManagement';
import BoardingManagement from './components/BoardingManagement';
import AssessmentsManager from './components/assessments/AssessmentsManager';
import SmsModule from './components/SmsModule';
import { PWAInstallButton } from './components/PWAInstallButton';
import { OfflineIndicator } from './components/OfflineIndicator';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { AuthScreens } from './components/auth/AuthScreens';
import { SecurityProfileModal } from './components/auth/SecurityProfileModal';
import { PermissionGuard } from './components/auth/PermissionGuard';
import GetStarted from './components/GetStarted';
import { NotificationProvider, useNotifications } from './contexts/NotificationContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { CookieConsentBanner } from './components/legal/CookieConsentBanner';
import { DoodleBackground } from './components/DoodleBackground';
import { MobileBottomNav } from './components/MobileBottomNav';
import { fetchTenantLicenseStatus, purgeLegacyLicenseCaches } from './lib/licenseSync';
import { ClientTrialBanner } from './components/ClientTrialBanner';
import { ClientSupportWidget } from './components/ClientSupportWidget';
import { getPageIdentity } from './lib/pageMetadata';

type View =
  | 'dashboard'
  | 'students'
  | 'attendance'
  | 'results'
  | 'assessments'
  | 'sms'
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
  | 'creator'
  | 'school_management';

const ALL_DEFAULT_MODULES = [
  'students',
  'academic',
  'timetable',
  'duty_roster',
  'payroll',
  'boarding',
  'lesson_notes',
  'attendance',
  'results',
  'assessments',
  'sms',
  'exam_analysis',
  'reports',
  'fees',
  'siren',
  'evoting',
  'inventory',
  'settings',
  'users'
];

function AppContent() {
  const { user, school, logout, isLoading: authLoading, switchRole, login, register } = useAuth();
  const { showToast } = useNotifications();
  const [activeView, setActiveView] = useState<View>(() => {
    return (localStorage.getItem('esepa_active_view') as View) || 'dashboard';
  });

  const [isSecurityModalOpen, setIsSecurityModalOpen] = useState(false);

  const [showGetStarted, setShowGetStarted] = useState<boolean>(() => {
    return !localStorage.getItem('esepa_user');
  });

  // Creator Control and License Verification States
  const [isLicensed, setIsLicensed] = useState<boolean>(true);
  const [checkingLicense, setCheckingLicense] = useState<boolean>(true);
  const [licenseKey, setLicenseKey] = useState<string>('');
  const [licenseTier, setLicenseTier] = useState<string>('Standard');
  const [licenseDurationMonths, setLicenseDurationMonths] = useState<string | number | null>(null);
  const [licenseExpiryDate, setLicenseExpiryDate] = useState<number | null>(null);
  const [licenseCreatedAt, setLicenseCreatedAt] = useState<number | null>(null);
  const [isTrialLicense, setIsTrialLicense] = useState<boolean>(false);
  const [lockAnnouncement, setLockAnnouncement] = useState<string>('');
  const [activeModules, setActiveModules] = useState<string[]>(ALL_DEFAULT_MODULES);

  const checkLicenseStatus = async () => {
    purgeLegacyLicenseCaches();
    try {
      let userRole = user?.role || '';
      let targetSchoolId = school?.id || user?.school_id || '';
      if (!userRole || !targetSchoolId) {
        try {
          const stored = localStorage.getItem('esepa_user');
          if (stored) {
            const parsed = JSON.parse(stored);
            if (!userRole) userRole = parsed.role || '';
            if (!targetSchoolId) targetSchoolId = parsed.school_id || parsed.schoolId || '';
          }
        } catch (e) {}
      }
      if (!targetSchoolId) {
        try {
          const activeSchoolRaw = localStorage.getItem('esepa_active_school');
          if (activeSchoolRaw) {
            const parsed = JSON.parse(activeSchoolRaw);
            if (parsed?.id) targetSchoolId = String(parsed.id);
          }
        } catch (e) {}
      }

      const data = await fetchTenantLicenseStatus(targetSchoolId || null, userRole || null);
      if (data) {
        setIsLicensed(Boolean(data.active));
        setLicenseKey(data.licenseKey || '');
        setLicenseTier(data.tier || 'Standard');
        setLicenseDurationMonths(data.durationMonths ?? null);
        setLicenseExpiryDate(data.expiryDate ? Number(data.expiryDate) : null);
        setLicenseCreatedAt(data.createdAt ? Number(data.createdAt) : null);
        setIsTrialLicense(Boolean(data.isTrial));
        setLockAnnouncement(data.lockAnnouncement || data.announcement || '');
        if (data.activeModules && Array.isArray(data.activeModules) && data.activeModules.length > 0) {
          setActiveModules(data.activeModules);
        } else {
          setActiveModules(ALL_DEFAULT_MODULES);
        }
        return;
      }
      setActiveModules(ALL_DEFAULT_MODULES);
    } catch (err) {
      console.warn("Failed to retrieve license status from backend, using default modules:", err);
      setActiveModules(ALL_DEFAULT_MODULES);
    } finally {
      setCheckingLicense(false);
    }
  };

  const handleLogout = () => {
    logout();
    setLicenseKey('');
  };

  useEffect(() => {
    checkLicenseStatus();
    const handleLicenseEvent = () => {
      checkLicenseStatus();
    };
    window.addEventListener('esepa_license_status_changed', handleLicenseEvent);
    window.addEventListener('esepa_licenses_updated', handleLicenseEvent);
    const heartbeat = setInterval(() => {
      checkLicenseStatus();
    }, 15000);
    return () => {
      window.removeEventListener('esepa_license_status_changed', handleLicenseEvent);
      window.removeEventListener('esepa_licenses_updated', handleLicenseEvent);
      clearInterval(heartbeat);
    };
  }, [user?.id, user?.role, user?.school_id, school?.id]);

  useEffect(() => {
    localStorage.setItem('esepa_active_view', activeView);
  }, [activeView]);

  useEffect(() => {
    if (user && (user.role === 'creator' || user.role === 'super_admin')) {
      setActiveView('creator');
      setShowGetStarted(false);
    } else if (user && user.role === 'admin') {
      setActiveView('dashboard');
      setShowGetStarted(false);
    }
  }, [user]);

  const [isSyncing, setIsSyncing] = useState(false);
  const [supabaseConnected, setSupabaseConnected] = useState<boolean | null>(true);
  const [supabaseChecking, setSupabaseChecking] = useState(false);
  const [supabaseDetails, setSupabaseDetails] = useState<string>('https://niavmonyfwqlryppgksy.supabase.co');
  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth > 1024);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);

  const settings = useLiveQuery(() => db.settings.toArray()) || [];
  const schoolProfile = useMemo(() => {
    const profile = settings.find(s => s.key === 'schoolProfile')?.value;
    if (school?.name) {
      return {
        ...(profile || {}),
        schoolName: school.name,
        logo: school.logo_url || (school as any).logo || profile?.logo || '/sch sphere logo1.png'
      };
    }
    return profile || { schoolName: 'SchoolSphere Portal', logo: '/sch sphere logo1.png' };
  }, [settings, school]);
  const activeSirenBroadcast = useMemo(() => 
    settings.find(s => s.key === 'activeSirenBroadcast')?.value,
    [settings]
  );
  const schoolName = schoolProfile.schoolName;
  const schoolLogo = schoolProfile.logo || '/sch sphere logo1.png';

  const academicConfig = useMemo(() => {
    return settings.find(s => s.key === 'academicConfig')?.value;
  }, [settings]);

  const currentAcademicYear =
    academicConfig?.academicYear ||
    schoolProfile?.academic_year ||
    (school as any)?.academic_year ||
    '2026/2027';

  const currentTermName =
    academicConfig?.currentTerm ||
    schoolProfile?.current_term ||
    (school as any)?.current_term ||
    'Term 1';

  const activePageMeta = useMemo(
    () => getPageIdentity(activeView, user?.role),
    [activeView, user?.role]
  );

  useEffect(() => {
    if (showGetStarted && !user) {
      document.title = 'Welcome & Portal Access — SchoolSphere Management System';
    } else if (!user) {
      document.title = 'Sign In & Institutional Onboarding — SchoolSphere Management System';
    } else {
      document.title = `${activePageMeta.title} — ${schoolName} | SchoolSphere`;
    }
  }, [activePageMeta.title, schoolName, showGetStarted, user]);

  // Uniform design tokens for SchoolSphere palette (#f6f8f7 canvas background, #1c4a59 institutional surface, #faae57 CTA)
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--color-background', '#f6f8f7');
    root.style.setProperty('--color-primary-surface', '#1c4a59');
    root.style.setProperty('--color-cta', '#faae57');
    root.style.setProperty('--color-muted', '#6a7f84');
    root.style.setProperty('--color-body', '#1f2a2e');
    root.style.setProperty('--color-border', '#bac4c6');
    root.style.setProperty('--color-secondary-accent', '#e4ae67');
  }, []);

  // State and Refs for global alarm synthesis and timetable triggers
  const isMutedSetting = settings.find(s => s.key === 'isGloballyMuted');
  const isGloballyMuted = isMutedSetting?.value === true;

  const setIsGloballyMuted = async (muted: boolean) => {
    const existing = await db.settings.where('key').equals('isGloballyMuted').first();
    if (existing) {
      await db.settings.update(existing.id!, { value: muted });
    } else {
      await db.settings.add({ key: 'isGloballyMuted', value: muted });
    }
  };
  const mediaAudioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioNodesRef = useRef<{
    oscillators: OscillatorNode[];
    gainNode: GainNode | null;
    lfo: OscillatorNode | null;
    intervalId: any;
  }>({
    oscillators: [],
    gainNode: null,
    lfo: null,
    intervalId: null
  });

  const stopGlobalAudioSynth = () => {
    if (mediaAudioRef.current) {
      try {
        mediaAudioRef.current.pause();
        mediaAudioRef.current.currentTime = 0;
      } catch (e) {}
      mediaAudioRef.current = null;
    }

    if (audioNodesRef.current.oscillators.length) {
      audioNodesRef.current.oscillators.forEach(o => {
        try { o.stop(); } catch (e) {}
      });
      audioNodesRef.current.oscillators = [];
    }

    if (audioNodesRef.current.lfo) {
      try { audioNodesRef.current.lfo.stop(); } catch (e) {}
      audioNodesRef.current.lfo = null;
    }

    if (audioNodesRef.current.intervalId) {
      clearInterval(audioNodesRef.current.intervalId);
      audioNodesRef.current.intervalId = null;
    }

    if (audioCtxRef.current) {
      try {
        audioCtxRef.current.close();
      } catch (e) {}
      audioCtxRef.current = null;
    }
  };

  const startGlobalAudioSynth = (type: string) => {
    if (isGloballyMuted) return;
    try {
      stopGlobalAudioSynth();

      const acousticVolume = settings.find(s => s.key === 'acousticVolume')?.value ?? 0.5;

      if (type.startsWith('recorded:')) {
        const audioId = type.split(':')[1];
        const recordedAudioListSetting = settings.find(s => s.key === 'recordedAudioList');
        const recordedAudioList = (recordedAudioListSetting?.value || []) as Array<{ id: string; name: string; base64?: string; audioUrl?: string }>;
        const targetTrack = recordedAudioList.find(r => r.id === audioId);
        const audioSource = activeSirenBroadcast?.audioUrl || targetTrack?.audioUrl || targetTrack?.base64;
        if (audioSource) {
          const audio = new Audio(audioSource);
          audio.volume = acousticVolume;
          mediaAudioRef.current = audio;
          audio.onended = async () => {
            const existingBroadcast = await db.settings.where('key').equals('activeSirenBroadcast').first();
            if (existingBroadcast && existingBroadcast.value?.type === type) {
              await sirenApi.squelch({ logEntry: null });
            }
          };
          audio.play().catch(err => {
            console.error("Intercom recorded speech announcement failed:", err);
          });
        }
        return;
      }

      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtxClass) return;
      
      const ctx = new AudioCtxClass();
      audioCtxRef.current = ctx;

      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(acousticVolume * 0.4, ctx.currentTime);
      masterGain.connect(ctx.destination);
      audioNodesRef.current.gainNode = masterGain;

      const oscillators: OscillatorNode[] = [];

      if (type === 'lockdown') {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(550, ctx.currentTime);
        
        const lfo = ctx.createOscillator();
        lfo.frequency.setValueAtTime(1.2, ctx.currentTime);
        
        const lfoGain = ctx.createGain();
        lfoGain.gain.setValueAtTime(160, ctx.currentTime);

        lfo.connect(lfoGain);
        lfoGain.connect(osc.frequency);
        osc.connect(masterGain);

        osc.start();
        lfo.start();

        oscillators.push(osc);
        audioNodesRef.current.lfo = lfo;

      } else if (type === 'fire') {
        const playSweep = () => {
          if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') return;
          const now = audioCtxRef.current.currentTime;
          const osc1 = audioCtxRef.current.createOscillator();
          const osc2 = audioCtxRef.current.createOscillator();
          const burstGain = audioCtxRef.current.createGain();
          
          osc1.type = 'sine';
          osc1.frequency.setValueAtTime(2400, now);
          osc1.frequency.exponentialRampToValueAtTime(1200, now + 0.18);

          osc2.type = 'triangle';
          osc2.frequency.setValueAtTime(2410, now);
          osc2.frequency.exponentialRampToValueAtTime(1210, now + 0.18);

          burstGain.gain.setValueAtTime(0, now);
          burstGain.gain.linearRampToValueAtTime(1, now + 0.01);
          burstGain.gain.linearRampToValueAtTime(0.8, now + 0.08);
          burstGain.gain.linearRampToValueAtTime(0, now + 0.18);

          osc1.connect(burstGain);
          osc2.connect(burstGain);
          
          if (audioNodesRef.current.gainNode) {
            burstGain.connect(audioNodesRef.current.gainNode);
          }

          osc1.start(now);
          osc2.start(now);
          osc1.stop(now + 0.2);
          osc2.stop(now + 0.2);
        };

        playSweep();
        audioNodesRef.current.intervalId = setInterval(playSweep, 290);

      } else if (type === 'weather') {
        const mainOsc = ctx.createOscillator();
        const subOsc = ctx.createOscillator();
        
        mainOsc.type = 'sawtooth';
        mainOsc.frequency.setValueAtTime(400, ctx.currentTime);
        
        subOsc.type = 'sine';
        subOsc.frequency.setValueAtTime(404, ctx.currentTime);

        const lfo = ctx.createOscillator();
        lfo.frequency.setValueAtTime(2.5, ctx.currentTime);
        const lfoGain = ctx.createGain();
        lfoGain.gain.setValueAtTime(15, ctx.currentTime);

        lfo.connect(lfoGain);
        lfoGain.connect(mainOsc.frequency);
        lfoGain.connect(subOsc.frequency);

        mainOsc.connect(masterGain);
        subOsc.connect(masterGain);

        mainOsc.start();
        subOsc.start();
        lfo.start();

        oscillators.push(mainOsc, subOsc);
        audioNodesRef.current.lfo = lfo;

      } else if (type === 'bell') {
        const frequencies = [440, 554.37, 659.25, 880, 1200];
        const now = ctx.currentTime;
        
        frequencies.forEach((f, i) => {
          const osc = ctx.createOscillator();
          osc.type = i === 1 ? 'sawtooth' : 'sine';
          osc.frequency.setValueAtTime(f, now);
          
          const individualGain = ctx.createGain();
          const decay = 2.0 / (i + 1);
          
          individualGain.gain.setValueAtTime(i === 0 ? 0.6 : 0.25, now);
          individualGain.gain.exponentialRampToValueAtTime(0.0001, now + decay + 0.5);
          
          osc.connect(individualGain);
          individualGain.connect(masterGain);
          
          osc.start(now);
          osc.stop(now + decay + 1.0);
          oscillators.push(osc);
        });

      } else if (type === 'allclear') {
        const notes = [349.23, 440.00, 523.25, 698.46];
        const now = ctx.currentTime;

        notes.forEach((f, index) => {
          const osc = ctx.createOscillator();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(f, now + (index * 0.18));
          
          const individualGain = ctx.createGain();
          individualGain.gain.setValueAtTime(0, now);
          individualGain.gain.linearRampToValueAtTime(0.5, now + (index * 0.18) + 0.05);
          individualGain.gain.exponentialRampToValueAtTime(0.0001, now + (index * 0.18) + 1.6);
          
          osc.connect(individualGain);
          individualGain.connect(masterGain);
          
          osc.start(now + (index * 0.18));
          osc.stop(now + (index * 0.18) + 2.0);
          oscillators.push(osc);
        });
      }

      audioNodesRef.current.oscillators = oscillators;
    } catch (err) {
      console.error("Global Synthesizer error:", err);
    }
  };

  useEffect(() => {
    localStorage.setItem('esepa_global_muted', String(isGloballyMuted));
    if (activeSirenBroadcast && !isGloballyMuted) {
      startGlobalAudioSynth(activeSirenBroadcast.type);
    } else {
      stopGlobalAudioSynth();
    }
    return () => stopGlobalAudioSynth();
  }, [activeSirenBroadcast, isGloballyMuted, settings]);

  // Timetable Scheduled bells background scanner effect
  useEffect(() => {
    const scanInterval = setInterval(async () => {
      const scheduleSetting = settings.find(s => s.key === 'bellSchedule');
      if (!scheduleSetting) return;

      const scheduleList = scheduleSetting.value || [];
      const enabledBells = scheduleList.filter((b: any) => b.enabled);
      if (enabledBells.length === 0) return;

      const now = new Date();
      const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const currentDay = weekdays[now.getDay()];
      
      const currentHour = String(now.getHours()).padStart(2, '0');
      const currentMin = String(now.getMinutes()).padStart(2, '0');
      const currentTimeString = `${currentHour}:${currentMin}`;

      const matchingBell = enabledBells.find((b: any) => 
        b.time === currentTimeString && b.days.includes(currentDay)
      );

      if (matchingBell) {
        const bLockSetting = settings.find(s => s.key === 'bellScheduleState');
        const lastTriggered = bLockSetting?.value?.lastTriggered;
        const triggerKey = `${currentDay}-${currentTimeString}-${matchingBell.id}`;

        if (lastTriggered !== triggerKey) {
          // Lock trigger first for this minute
          const lockObj = { lastTriggered: triggerKey, timestamp: Date.now() };
          const existingLock = await db.settings.where('key').equals('bellScheduleState').first();
          if (existingLock) {
            await db.settings.update(existingLock.id!, { value: lockObj });
          } else {
            await db.settings.add({ key: 'bellScheduleState', value: lockObj });
          }

          // Resolve audioUrl if recorded audio is selected for this bell
          let audioUrl: string | undefined;
          const alarmType = matchingBell.alarmType || 'bell';
          if (alarmType.startsWith('recorded:')) {
            const audioId = alarmType.split(':')[1];
            const recordedAudioListSetting = settings.find(s => s.key === 'recordedAudioList');
            const recordedAudioList = (recordedAudioListSetting?.value || []) as Array<{ id: string; audioUrl?: string; base64?: string }>;
            const targetTrack = recordedAudioList.find(r => r.id === audioId);
            audioUrl = targetTrack?.audioUrl || targetTrack?.base64;
          }

          // Trigger activeSirenBroadcast across all devices via Supabase API + local cache
          const activeBroadcastPayload = {
            type: alarmType,
            label: `${matchingBell.label}`,
            customMsg: `Timetable shift bell trigger: ${matchingBell.label}. Please adjust activities accordingly.`,
            isDrill: false,
            triggeredBy: 'School Timetable System',
            timestamp: Date.now(),
            ...(audioUrl ? { audioUrl } : {})
          };

          const logEntry = {
            id: `LOG-${Date.now()}`,
            type: alarmType,
            label: `Scheduled Bell: ${matchingBell.label}`,
            triggeredBy: 'School Timetable System',
            role: 'system',
            customMsg: `Class Timetable transition automatic trigger: ${matchingBell.label}.`,
            timestamp: Date.now(),
            isDrill: false
          };

          await sirenApi.triggerBroadcast({
            broadcast: activeBroadcastPayload,
            logEntry,
            bellScheduleState: lockObj
          });

          // Also keep localStorage backup synced
          try {
            const savedLogs = localStorage.getItem('esepa_siren_logs');
            let logsArr = [];
            if (savedLogs) logsArr = JSON.parse(savedLogs);
            localStorage.setItem('esepa_siren_logs', JSON.stringify([logEntry, ...logsArr].slice(0, 250)));
          } catch (e) {
            console.error("Failed to write schedule log:", e);
          }
        }
      }
    }, 6000);

    return () => clearInterval(scanInterval);
  }, [settings]);

  // Auto Dismiss chimes (bell/allclear) after 12 seconds
  useEffect(() => {
    if (activeSirenBroadcast && (activeSirenBroadcast.type === 'bell' || activeSirenBroadcast.type === 'allclear')) {
      const timer = setTimeout(async () => {
        const existingBroadcast = await db.settings.where('key').equals('activeSirenBroadcast').first();
        if (existingBroadcast && existingBroadcast.value?.timestamp === activeSirenBroadcast.timestamp) {
          await sirenApi.squelch({ logEntry: null });
        }
      }, 12000);
      return () => clearTimeout(timer);
    }
  }, [activeSirenBroadcast]);

  // Poll Siren Console state from Supabase every 10 seconds so multi-device broadcasts stay synchronized
  useEffect(() => {
    if (!user) return;
    sirenApi.getState().catch(() => {});
    const pollInterval = setInterval(() => {
      if (navigator.onLine) {
        sirenApi.getState().catch(() => {});
      }
    }, 10000);
    return () => clearInterval(pollInterval);
  }, [user]);

  useEffect(() => {
    purgeDemoRecordsFromDb(school?.id);
  }, [school?.id]);

  // Initialize Live Supabase Realtime & Auto-Sync Engine
  useEffect(() => {
    const cleanup = initRealtimeAndAutoSync();
    return () => {
      cleanup?.();
    };
  }, []);

  const viewContainerRef = useRef<HTMLDivElement | null>(null);
  const pullStartYRef = useRef<number | null>(null);
  const pullStartXRef = useRef<number | null>(null);
  const [pullDistance, setPullDistance] = useState(0);
  const [dismissedAlertTimestamp, setDismissedAlertTimestamp] = useState<number | null>(null);
  const PULL_THRESHOLD = 58;

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      // Pull and reconcile latest remote database updates in-place from Supabase/Server
      // Never push stale local state over remote database to prevent reverting edits
      const success = await syncAllDataFromBackend(undefined, true);
      if (success) {
        showToast("Database synchronized. Loaded latest updates from cloud.", "success");
      } else {
        showToast("Database synchronized locally.", "info");
      }
    } catch (error: any) {
      console.warn("Sync error:", error);
      showToast("Sync completed locally.", "info");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleTouchStartPull = (e: React.TouchEvent<HTMLDivElement>) => {
    if (activeView === 'creator' || isSyncing) return;
    const container = viewContainerRef.current;
    if (!container || container.scrollTop > 2) {
      pullStartYRef.current = null;
      return;
    }
    const touch = e.touches[0];
    if (touch) {
      pullStartYRef.current = touch.clientY;
      pullStartXRef.current = touch.clientX;
    }
  };

  const handleTouchMovePull = (e: React.TouchEvent<HTMLDivElement>) => {
    if (pullStartYRef.current === null || isSyncing) return;
    const container = viewContainerRef.current;
    if (!container || container.scrollTop > 2) {
      pullStartYRef.current = null;
      if (pullDistance !== 0) setPullDistance(0);
      return;
    }
    const touch = e.touches[0];
    if (!touch) return;
    const deltaY = touch.clientY - pullStartYRef.current;
    const deltaX = Math.abs(touch.clientX - (pullStartXRef.current ?? touch.clientX));

    // Only engage pull-to-refresh on predominantly vertical downward drags
    if (deltaY > 6 && deltaY > deltaX * 1.2) {
      const damped = Math.min(Math.round(deltaY * 0.45), 92);
      setPullDistance(damped);
    } else if (deltaY <= 0 && pullDistance > 0) {
      setPullDistance(0);
    }
  };

  const handleTouchEndPull = async () => {
    if (pullStartYRef.current === null) return;
    pullStartYRef.current = null;
    pullStartXRef.current = null;
    const finalPull = pullDistance;
    setPullDistance(0);
    if (finalPull >= PULL_THRESHOLD && !isSyncing) {
      await handleSync();
      checkSupabaseConnection();
    }
  };

  const checkSupabaseConnection = async () => {
    setSupabaseChecking(true);
    try {
      const res = await fetch('/api/db/status');
      if (res.ok) {
        const data = await res.json();
        const isConnected = data.dbMode === 'supabase' || Boolean(data.supabase?.connected);
        setSupabaseConnected(isConnected);
        if (data.supabase?.url) {
          setSupabaseDetails(data.supabase.url);
        }
      } else {
        setSupabaseConnected(false);
      }
    } catch {
      setSupabaseConnected(false);
    } finally {
      setSupabaseChecking(false);
    }
  };

  // Check Supabase connection on load and periodically every 15 seconds
  useEffect(() => {
    checkSupabaseConnection();
    const interval = setInterval(checkSupabaseConnection, 15000);
    return () => clearInterval(interval);
  }, []);

  // Periodic auto-sync every 30 minutes
  useEffect(() => {
    const intervalId = setInterval(() => {
      console.log("Triggering scheduled periodic auto-sync...");
      handleSync();
      checkSupabaseConnection();
    }, 1800000); // 30 minutes

    return () => clearInterval(intervalId);
  }, []);

  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
      if (window.innerWidth < 1024) {
        setSidebarOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    // Scroll to top when view changes
    const container = document.querySelector('.overflow-y-auto');
    if (container) container.scrollTo(0, 0);
  }, [activeView]);

  const handleNavClick = (view: View) => {
    setActiveView(view);
    setMobileMenuOpen(false);
  };

  const navItems = useMemo(() => {
    let baseItems = [];
    if (user?.role === 'super_admin') {
      baseItems = [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { id: 'students', label: 'Students', icon: Users },
        { id: 'academic', label: 'Academic', icon: Briefcase },
        { id: 'assessments', label: 'Assessments & SBA', icon: GraduationCap },
        { id: 'timetable', label: 'School Timetable', icon: Calendar },
        { id: 'duty_roster', label: 'Duty Roster', icon: UserCheck },
        { id: 'lesson_notes', label: 'Lesson Notes', icon: ClipboardCheck },
        { id: 'attendance', label: 'Attendance', icon: CheckCircle },
        { id: 'results', label: 'Results Terminal', icon: BookOpen },
        { id: 'exam_analysis', label: 'Exam Analysis', icon: Award },
        { id: 'sms', label: 'Bulk SMS & Alerts', icon: MessageSquare },
        { id: 'reports', label: 'Reports', icon: FileText },
        { id: 'fees', label: 'Fees & Payments', icon: CreditCard },
        { id: 'payroll', label: 'Staff Payroll', icon: Wallet },
        { id: 'boarding', label: 'Boarding System', icon: Bed },
        { id: 'siren', label: 'Siren Console', icon: Siren },
        { id: 'evoting', label: 'E-Voting Portal', icon: Vote },
        { id: 'inventory', label: 'Inventory Registry', icon: Package },
        { id: 'users', label: 'User Management', icon: ShieldAlert },
        { id: 'settings', label: 'Settings', icon: SettingsIcon },
      ];
    } else if (user?.role === 'admin') {
      baseItems = [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { id: 'students', label: 'Students', icon: Users },
        { id: 'academic', label: 'Academic', icon: Briefcase },
        { id: 'assessments', label: 'Assessments & SBA', icon: GraduationCap },
        { id: 'timetable', label: 'School Timetable', icon: Calendar },
        { id: 'duty_roster', label: 'Duty Roster', icon: UserCheck },
        { id: 'lesson_notes', label: 'Lesson Notes', icon: ClipboardCheck },
        { id: 'attendance', label: 'Attendance', icon: CheckCircle },
        { id: 'results', label: 'Results Terminal', icon: BookOpen },
        { id: 'exam_analysis', label: 'Exam Analysis', icon: Award },
        { id: 'sms', label: 'Bulk SMS & Alerts', icon: MessageSquare },
        { id: 'reports', label: 'Reports', icon: FileText },
        { id: 'fees', label: 'Fees & Payments', icon: CreditCard },
        { id: 'payroll', label: 'Staff Payroll', icon: Wallet },
        { id: 'boarding', label: 'Boarding System', icon: Bed },
        { id: 'siren', label: 'Siren Console', icon: Siren },
        { id: 'evoting', label: 'E-Voting Portal', icon: Vote },
        { id: 'inventory', label: 'Inventory Registry', icon: Package },
        { id: 'users', label: 'User Management', icon: ShieldAlert },
        { id: 'settings', label: 'Settings', icon: SettingsIcon },
      ];
    } else if (user?.role === 'headteacher') {
      baseItems = [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { id: 'students', label: 'Students', icon: Users },
        { id: 'academic', label: 'Academic', icon: Briefcase },
        { id: 'assessments', label: 'Assessments & SBA', icon: GraduationCap },
        { id: 'timetable', label: 'School Timetable', icon: Calendar },
        { id: 'duty_roster', label: 'Duty Roster', icon: UserCheck },
        { id: 'lesson_notes', label: 'Lesson Notes', icon: ClipboardCheck },
        { id: 'attendance', label: 'Attendance', icon: CheckCircle },
        { id: 'results', label: 'Results Terminal', icon: BookOpen },
        { id: 'exam_analysis', label: 'Exam Analysis', icon: Award },
        { id: 'sms', label: 'Parent SMS Alerts', icon: MessageSquare },
        { id: 'reports', label: 'Reports', icon: FileText },
        { id: 'fees', label: 'Fees & Payments', icon: CreditCard },
        { id: 'payroll', label: 'Staff Payroll', icon: Wallet },
        { id: 'boarding', label: 'Boarding System', icon: Bed },
        { id: 'siren', label: 'Siren Console', icon: Siren },
        { id: 'evoting', label: 'E-Voting Portal', icon: Vote },
        { id: 'inventory', label: 'Inventory Registry', icon: Package },
        { id: 'settings', label: 'Settings', icon: SettingsIcon },
      ];
    } else if ((user?.role as string) === 'hod') {
      baseItems = [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { id: 'students', label: 'Students', icon: Users },
        { id: 'academic', label: 'Academic', icon: Briefcase },
        { id: 'assessments', label: 'Assessments & SBA', icon: GraduationCap },
        { id: 'timetable', label: 'School Timetable', icon: Calendar },
        { id: 'duty_roster', label: 'Duty Roster', icon: UserCheck },
        { id: 'lesson_notes', label: 'Lesson Notes & Vetting', icon: ClipboardCheck },
        { id: 'attendance', label: 'Attendance', icon: CheckCircle },
        { id: 'results', label: 'Results Terminal', icon: BookOpen },
        { id: 'exam_analysis', label: 'Exam Analysis', icon: Award },
        { id: 'reports', label: 'Reports', icon: FileText },
        { id: 'payroll', label: 'My Payslips', icon: Wallet },
        { id: 'boarding', label: 'Boarding System', icon: Bed },
        { id: 'siren', label: 'Siren Console', icon: Siren },
        { id: 'settings', label: 'Settings', icon: SettingsIcon },
      ];
    } else if (user?.role === 'teacher') {
      baseItems = [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { id: 'assessments', label: 'Assessments & SBA', icon: GraduationCap },
        { id: 'students', label: 'Students', icon: Users },
        { id: 'timetable', label: 'School Timetable', icon: Calendar },
        { id: 'duty_roster', label: 'Duty Roster', icon: UserCheck },
        { id: 'lesson_notes', label: 'Lesson Notes', icon: ClipboardCheck },
        { id: 'attendance', label: 'Attendance', icon: CheckCircle },
        { id: 'results', label: 'Results Terminal', icon: BookOpen },
        { id: 'exam_analysis', label: 'Exam Analysis', icon: Award },
        { id: 'reports', label: 'Reports', icon: FileText },
        { id: 'payroll', label: 'My Payslips', icon: Wallet },
        { id: 'boarding', label: 'Boarding System', icon: Bed },
        { id: 'siren', label: 'Siren Console', icon: Siren },
        { id: 'settings', label: 'Settings', icon: SettingsIcon },
      ];
    } else if (user?.role === 'accountant' || (user?.role as string) === 'bursar') {
      baseItems = [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { id: 'students', label: 'Students', icon: Users },
        { id: 'fees', label: 'Fees & Payments', icon: CreditCard },
        { id: 'payroll', label: 'Staff Payroll', icon: Wallet },
        { id: 'sms', label: 'Debtor SMS Alerts', icon: MessageSquare },
        { id: 'boarding', label: 'Boarding System', icon: Bed },
        { id: 'reports', label: 'Reports', icon: FileText },
        { id: 'inventory', label: 'Inventory Registry', icon: Package },
      ];
    } else if (user?.role === 'student') {
      baseItems = [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { id: 'assessments', label: 'My Assessments', icon: GraduationCap },
        { id: 'timetable', label: 'School Timetable', icon: Calendar },
        { id: 'results', label: 'Results Terminal', icon: BookOpen },
        { id: 'exam_analysis', label: 'Exam Analysis', icon: Award },
        { id: 'fees', label: 'Fees & Payments', icon: CreditCard },
        { id: 'evoting', label: 'E-Voting Portal', icon: Vote },
      ];
    } else if (user?.role === 'parent') {
      baseItems = [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { id: 'assessments', label: 'Ward Assessments', icon: GraduationCap },
        { id: 'timetable', label: 'School Timetable', icon: Calendar },
        { id: 'attendance', label: 'Attendance', icon: CheckCircle },
        { id: 'results', label: 'Results Terminal', icon: BookOpen },
        { id: 'fees', label: 'Fees & Payments', icon: CreditCard },
      ];
    } else {
      baseItems = [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard }
      ];
    }

    if ((user?.role as string) === 'creator' || (user?.role as string) === 'super_admin') {
      baseItems.push({ id: 'creator', label: 'Creator Console', icon: Cpu });
      baseItems.push({ id: 'school_management', label: 'Tenants & Schools', icon: Building });
    }

    const filteredItems = baseItems.filter(item => {
      const isCore = ['dashboard', 'assessments', 'sms', 'duty_roster', 'payroll', 'boarding', 'lesson_notes', 'settings', 'users', 'creator', 'school_management'].includes(item.id);
      return isCore || activeModules.includes(item.id);
    });

    return filteredItems;
  }, [user, activeModules]);

  // Enforce view boundary based on user role
  useEffect(() => {
    if (user) {
      const isAllowed = navItems.some(item => item.id === activeView);
      if (!isAllowed) {
        setActiveView('dashboard');
      }
    }
  }, [user, activeView, navItems]);

  if (authLoading || checkingLicense) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-[#f6f8f7] relative overflow-hidden">
        <DoodleBackground opacity={0.06} />
        <RefreshCcw className="w-10 h-10 text-[#1c4a59] animate-spin mb-4 relative z-10" />
        <p className="text-slate-600 font-bold text-sm animate-pulse tracking-widest uppercase relative z-10">Initializing System...</p>
      </div>
    );
  }

  if (showGetStarted && !user) {
    return (
      <GetStarted
        onEnterSchoolPortal={() => setShowGetStarted(false)}
        onActivationSuccess={async () => {
          await checkLicenseStatus();
          setShowGetStarted(false);
        }}
        licenseKey={licenseKey}
        isLicensed={isLicensed}
        lockAnnouncement={lockAnnouncement}
      />
    );
  }

  if (!user) {
    return <AuthScreens onBackToGetStarted={() => setShowGetStarted(true)} />;
  }

  const isCreator = (user?.role as string) === 'creator' || (user?.role as string) === 'super_admin';

  if (isCreator) {
    if (activeView !== 'creator') {
      setActiveView('creator');
    }
    if (showGetStarted) {
      setShowGetStarted(false);
    }
  }

  if (!isLicensed && !isCreator) {
    return (
      <GetStarted
        onEnterSchoolPortal={() => setShowGetStarted(false)}
        onActivationSuccess={async () => {
          await checkLicenseStatus();
          setShowGetStarted(false);
        }}
        licenseKey={licenseKey}
        isLicensed={isLicensed}
        lockAnnouncement={lockAnnouncement}
      />
    );
  }

  return (
    <div className="flex h-dvh min-h-dvh max-w-[100vw] w-full bg-[#f6f8f7] overflow-x-hidden overflow-y-hidden font-sans print:h-auto print:overflow-visible relative safe-top">
      <DoodleBackground opacity={0.04} />
      {/* Mobile Menu Overlay */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setMobileMenuOpen(false)}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-40 lg:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      {activeView !== 'creator' && (
        <motion.aside 
          initial={false}
          animate={{ 
            width: (sidebarOpen || mobileMenuOpen) ? 290 : (windowWidth < 1024 ? 0 : 120),
            x: (windowWidth < 1024 && !mobileMenuOpen) ? -290 : 0
          }}
          className={cn(
            "bg-white border-r border-[#bac4c6] text-[#1f2a2e] flex flex-col z-50 fixed lg:static h-full shadow-xs",
            windowWidth < 1024 && !mobileMenuOpen ? "pointer-events-none" : "pointer-events-auto"
          )}
        >
          <div className={cn(
            "flex flex-col gap-4 border-b border-[#bac4c6] shrink-0 transition-all duration-300 relative",
            (sidebarOpen || mobileMenuOpen) ? "p-6 items-center" : "p-4 items-center"
          )}>
            <div className={cn(
              "flex items-center justify-between w-full",
              !(sidebarOpen || mobileMenuOpen) && "justify-center"
            )}>
              <div className={cn(
                "flex items-center gap-3 w-full",
                (sidebarOpen || mobileMenuOpen) ? "flex-col text-center justify-center" : "flex-row justify-center"
              )}>
                {(sidebarOpen || mobileMenuOpen) ? (
                  <motion.div 
                     initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex flex-col items-center py-2"
                  >
                    <img 
                      src="/sch sphere logo1.png" 
                      alt="School Sphere Logo" 
                      className="w-14 h-14 rounded-full object-cover pointer-events-none mb-3 select-none filter drop-shadow-xs sharpen-image" 
                      referrerPolicy="no-referrer" 
                    />
                    <span className="font-bold text-2xl tracking-tight leading-none text-[#1c4a59] select-none">
                      School<span className="text-[#faae57]">Sphere</span>
                    </span>
                    <span className="text-[10px] font-bold text-[#6a7f84] uppercase tracking-widest mt-2 select-none">
                      Manager Suite
                    </span>
                  </motion.div>
                ) : (
                  <div className="w-12 h-12 rounded-full bg-[#f6f8f7] border border-[#bac4c6] flex items-center justify-center p-1 shadow-xs hover:bg-white transition-colors">
                    <img 
                      src="/sch sphere logo1.png" 
                      alt="School Sphere Logo" 
                      className="w-9 h-9 rounded-full object-cover pointer-events-none select-none sharpen-image" 
                      referrerPolicy="no-referrer" 
                    />
                  </div>
                )}
              </div>
              {mobileMenuOpen && (
                <button 
                  onClick={() => setMobileMenuOpen(false)}
                  className="lg:hidden p-2 text-[#6a7f84] hover:text-[#1c4a59] transition-colors absolute top-4 right-4"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>

            {(sidebarOpen || mobileMenuOpen) && (
              <div className="flex items-center gap-3 bg-[#f6f8f7] p-2.5 rounded-xl border border-[#bac4c6] w-full">
                <div className="w-7 h-7 rounded-lg bg-white flex items-center justify-center overflow-hidden shrink-0 border border-[#bac4c6]">
                  {schoolLogo ? (
                    <img src={schoolLogo} alt={schoolName} className="w-full h-full object-contain p-0.5" />
                  ) : (
                    <BookOpen className="w-3.5 h-3.5 text-[#1c4a59]" />
                  )}
                </div>
                <div className="min-w-0 flex-1 text-left">
                  <p className="text-[11px] font-bold text-[#1c4a59] uppercase tracking-wider truncate leading-none">
                    {schoolName}
                  </p>
                  <p className="text-[9px] text-[#807654] font-bold tracking-wide mt-1 uppercase leading-none">Active Worksite</p>
                </div>
              </div>
            )}
          </div>

          <nav className="flex-1 mt-4 px-3 space-y-1.5 overflow-y-auto no-scrollbar">
            {navItems.map((item) => {
              const isActive = activeView === item.id;
              return (
                <button
                  key={item.id}
                  id={`nav-${item.id}`}
                  onClick={() => handleNavClick(item.id as View)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl transition-all duration-200 group relative min-h-[44px] cursor-pointer",
                    isActive 
                      ? "bg-[#1c4a59] text-white shadow-[0_4px_14px_rgba(28,74,89,0.2)] font-bold" 
                      : "text-[#6a7f84] hover:bg-[#f6f8f7] hover:text-[#1c4a59] font-medium"
                  )}
                >
                  <item.icon className={cn(
                    "w-5 h-5 flex-shrink-0 transition-colors",
                    isActive ? "text-[#faae57]" : "text-[#807654] group-hover:text-[#1c4a59]"
                  )} />
                  {(sidebarOpen || mobileMenuOpen) && (
                    <motion.span 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="font-bold text-sm tracking-wide whitespace-nowrap flex-1 text-left flex items-center justify-between"
                    >
                      <span>{item.label}</span>
                      {item.id === 'assessments' && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-[#faae57] text-[#1c4a59] leading-none ml-2 tracking-wider">
                          NEW
                        </span>
                      )}
                    </motion.span>
                  )}
                  {isActive && (sidebarOpen || mobileMenuOpen) && (
                    <span className="w-2 h-2 rounded-full bg-[#faae57] shrink-0" />
                  )}
                  {!sidebarOpen && windowWidth >= 1024 && !mobileMenuOpen && (
                    <div className="absolute left-16 bg-[#1c4a59] text-white px-3 py-2 rounded-xl text-xs opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-30 pointer-events-none font-bold shadow-md border border-[#faae57]/30 flex items-center gap-1.5">
                      <span>{item.label}</span>
                      {item.id === 'assessments' && (
                        <span className="bg-[#faae57] text-[#1c4a59] text-[9px] px-1 py-0.5 rounded font-black">
                          NEW
                        </span>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </nav>

          <div className="p-4 border-t border-[#bac4c6] hidden lg:block shrink-0">
            <button 
              id="toggle-sidebar"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="w-full flex items-center justify-center p-2.5 rounded-xl hover:bg-[#f6f8f7] text-[#6a7f84] transition-colors min-h-[44px]"
            >
              <ChevronRight className={cn("w-5 h-5 transition-transform duration-300", sidebarOpen && "rotate-180")} />
            </button>
          </div>
        </motion.aside>
      )}

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full min-w-0 max-w-full overflow-hidden w-full print:block print:h-auto print:overflow-visible">
        {/* Global Emergency Alert Marquee Indicator (Swipeable to dismiss on touch screens) */}
        {activeSirenBroadcast && dismissedAlertTimestamp !== activeSirenBroadcast.timestamp && (
          <motion.div
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.7}
            onDragEnd={(_, info) => {
              if (Math.abs(info.offset.x) > 85 || Math.abs(info.velocity.x) > 420) {
                setDismissedAlertTimestamp(activeSirenBroadcast.timestamp || Date.now());
              }
            }}
            className={cn(
              "min-h-10 py-1.5 sm:py-0 text-white font-extrabold flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 px-3 sm:px-6 lg:px-8 select-none animate-pulse shrink-0 text-xs sm:text-sm tracking-wide shadow-sm uppercase overflow-hidden z-40 relative touch-pan-y",
              activeSirenBroadcast.type === 'lockdown' ? 'bg-red-600' :
              activeSirenBroadcast.type === 'fire' ? 'bg-orange-600' :
              activeSirenBroadcast.type === 'weather' ? 'bg-amber-600' :
              activeSirenBroadcast.type === 'allclear' ? 'bg-emerald-600' :
              'bg-indigo-600'
            )}
          >
            <div className="flex items-center gap-2 truncate min-w-0 flex-1">
              <span className="flex h-2 w-2 relative shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
              </span>
              <span className="font-extrabold text-[10px] sm:text-xs tracking-wider shrink-0 uppercase">
                {activeSirenBroadcast.isDrill ? '[DRILL RUN]' : '[ALERT]'} {activeSirenBroadcast.label}: 
              </span>
              <span className="truncate font-bold tracking-wide text-[10px] sm:text-xs text-white/95 lowercase first-letter:uppercase">
                "{activeSirenBroadcast.customMsg || 'Attention: Follow instructions immediately.'}"
              </span>
            </div>
            
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              <button
                onClick={() => setIsGloballyMuted(!isGloballyMuted)}
                className="text-[9px] font-black tracking-widest bg-white/20 hover:bg-white text-white hover:text-slate-900 px-2 sm:px-2.5 py-1 rounded-md transition-colors uppercase shadow-sm flex items-center gap-1"
                title={isGloballyMuted ? "Unmute campus speaker locally" : "Mute campus speaker locally"}
              >
                {isGloballyMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                {isGloballyMuted ? "Unmute" : "Mute Tab"}
              </button>
              
              <button 
                onClick={async () => {
                  await sirenApi.squelch({
                    logEntry: {
                      id: 'LOG-STOP-' + Date.now(),
                      type: 'ALL SIRENS SQUELCHED [GLOBAL BANNER]',
                      details: 'Emergency and PA audio streams terminated from global alert banner.',
                      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                      date: new Date().toISOString().split('T')[0],
                      user: user?.fullName || user?.username || 'Duty Officer'
                    }
                  });
                }}
                className="text-[9px] font-black tracking-widest bg-red-900/60 hover:bg-white text-white hover:text-red-700 px-2 sm:px-2.5 py-1 rounded-md transition-colors uppercase shadow-sm border border-white/30"
              >
                Squelch All
              </button>

              <button 
                onClick={() => setActiveView('siren')}
                className="text-[9px] font-black tracking-widest bg-white/20 hover:bg-white text-white hover:text-slate-900 px-2 sm:px-2.5 py-1 rounded-md transition-colors uppercase shadow-sm animate-pulse-subtle"
              >
                Open Siren
              </button>
            </div>
          </motion.div>
        )}

        {/* Client Trial & Approaching Expiry Top Banner */}
        {!isCreator && activeView !== 'creator' && (
          <ClientTrialBanner
            schoolId={school?.id || user?.school_id || null}
            schoolName={schoolName}
            licenseTier={licenseTier}
            durationMonths={licenseDurationMonths}
            expiryDate={licenseExpiryDate}
            createdAt={licenseCreatedAt}
            isTrial={isTrialLicense}
            onActivationSuccess={checkLicenseStatus}
          />
        )}

        {/* Header */}
        {/* Header */}
        {activeView !== 'creator' && (
          <header className="h-14 sm:h-16 bg-white border-b border-[#bac4c6]/40 flex items-center justify-between gap-2 sm:gap-4 px-3 sm:px-6 lg:px-8 z-30 shrink-0 min-w-0 w-full select-none">
            {/* Left: Navigation Toggle & Contextual Breadcrumb */}
            <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
              <button 
                onClick={() => setMobileMenuOpen(true)}
                className="lg:hidden w-9 h-9 sm:w-10 sm:h-10 -ml-1 sm:ml-0 flex items-center justify-center shrink-0 text-[#1c4a59] hover:bg-[#f6f8f7] rounded-xl transition-colors cursor-pointer active:scale-95"
                title="Open Navigation"
                aria-label="Open Navigation Menu"
              >
                <Menu className="w-5 h-5 text-[#1c4a59]" />
              </button>

              {/* Multi-Tenant Switcher - Restricted strictly to Creator */}
              {((user?.role as string) === 'creator' || (user?.role as string) === 'super_admin') ? (
                <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                  <TenantSwitcher 
                    currentSchoolName={schoolName}
                    userRole={user.role}
                    username={user.username}
                    onSwitchTenant={async (tenant) => {
                      try {
                        await db.settings.put({
                          key: 'schoolProfile',
                          value: {
                            schoolName: tenant.name || tenant.schoolName,
                            logo: tenant.logo_url || schoolLogo || 'https://cdn.pixabay.com/photo/2016/10/06/19/03/graduation-cap-1719744_1280.png',
                            email: `admin@${tenant.slug}.edu.gh`,
                            academic_year: tenant.academic_year || '2026/2027',
                            current_term: tenant.current_term || 'Term 1'
                          }
                        });
                      } catch (e) {}
                      checkLicenseStatus();
                      handleSync();
                    }}
                    onOpenTenantManagement={() => setActiveView('school_management')}
                  />
                  <div className="hidden sm:flex items-center gap-1.5 shrink-0 min-w-0">
                    <span className="text-[#bac4c6] text-xs select-none" aria-hidden="true">/</span>
                    <span className="text-[11px] font-semibold text-[#6a7f84] uppercase tracking-wider whitespace-nowrap">
                      {activePageMeta.category}
                    </span>
                    <span className="text-[#bac4c6] text-xs select-none" aria-hidden="true">/</span>
                    <span
                      data-testid="header-page-name"
                      className="text-xs sm:text-sm font-bold text-[#1c4a59] whitespace-nowrap truncate max-w-[200px] lg:max-w-[320px]"
                    >
                      {activePageMeta.title}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                  {/* Tablet & Desktop Breadcrumb (sm+) */}
                  <div className="hidden sm:flex items-center gap-2 min-w-0">
                    <span className="text-xs font-semibold text-[#6a7f84] uppercase tracking-wider whitespace-nowrap">
                      {activePageMeta.category}
                    </span>
                  </div>

                  {/* Mobile Title & Context (< sm) */}
                  <div className="sm:hidden min-w-0 flex-1">
                    <h1
                      data-testid="header-page-name"
                      className="text-xs font-bold text-[#1c4a59] truncate leading-tight"
                    >
                      {activePageMeta.title}
                    </h1>
                    <p className="text-[10px] font-medium text-[#6a7f84] uppercase tracking-wider truncate leading-tight mt-0.5">
                      {activePageMeta.category}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Right: Cloud SyncChip, Profile & Controls */}
            <div className="flex items-center gap-1 sm:gap-2 shrink-0">
              {/* Creator-only subtle DB indicator dot */}
              {((user?.role as string) === 'creator' || (user?.role as string) === 'super_admin') && (
                <button
                  type="button" 
                  id="supabase-status-indicator"
                  onClick={checkSupabaseConnection}
                  title={
                    supabaseConnected === null 
                      ? "Supabase DB: Checking connection..." 
                      : supabaseConnected 
                        ? `Supabase DB: Connected (${supabaseDetails || 'Online'})` 
                        : "Supabase DB: Disconnected • Click to retry"
                  }
                  className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl hover:bg-[#f6f8f7] flex items-center justify-center transition-colors cursor-pointer relative shrink-0 text-[#1c4a59] active:scale-95"
                >
                  <Database className="w-4 h-4 text-[#1c4a59]" />
                  <span
                    className={cn(
                      "w-2 h-2 rounded-full absolute top-1.5 right-1.5 ring-2 ring-white",
                      supabaseConnected === true 
                        ? "bg-[#06D6A0]" 
                        : supabaseConnected === false 
                          ? "bg-[#EF476F]" 
                          : "bg-[#FFC43D]"
                    )}
                  />
                </button>
              )}

              {/* SyncChip - Cloud Synchronization status & trigger */}
              <button 
                id="manual-sync"
                onClick={async () => {
                  if (isSyncing) return;
                  await handleSync();
                  checkSupabaseConnection();
                }}
                disabled={isSyncing}
                className="h-8 sm:h-9 px-2 sm:px-3 rounded-full bg-[#f6f8f7] hover:bg-[#e1c594]/25 text-[#1c4a59] flex items-center gap-1.5 text-xs font-medium transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed shrink-0 active:scale-95"
                title="Synchronize with Cloud Database"
              >
                <span
                  className={cn(
                    "w-1.5 h-1.5 rounded-full shrink-0 transition-colors",
                    isSyncing ? "bg-[#faae57] animate-pulse" : "bg-[#06d6a0]"
                  )}
                />
                <RefreshCcw className={cn("w-3.5 h-3.5 text-[#6a7f84] shrink-0 transition-transform", isSyncing && "animate-spin text-[#1c4a59]")} />
                <span className="hidden md:inline font-semibold text-xs whitespace-nowrap">
                  {isSyncing ? 'Syncing...' : 'Synced'}
                </span>
              </button>

              <div className="h-4 sm:h-5 w-px bg-[#bac4c6]/40 mx-0.5 sm:mx-1 shrink-0" />

              {/* Profile Avatar & Info */}
              <button
                type="button"
                onClick={() => setIsSecurityModalOpen(true)}
                className="flex items-center gap-2 h-8 sm:h-9 px-1 sm:px-1.5 rounded-xl hover:bg-[#f6f8f7] transition-colors text-left cursor-pointer active:scale-95 shrink-0 group"
                title="View Profile & Security"
              >
                <div className="w-8 h-8 rounded-full bg-[#1c4a59] text-[#faae57] flex items-center justify-center font-bold text-xs shrink-0 select-none">
                  {user.fullName ? user.fullName[0]?.toUpperCase() : (user.username?.[0]?.toUpperCase() || 'U')}
                </div>
                <div className="hidden lg:block text-left min-w-0 pr-1">
                  <p className="text-xs font-bold text-[#1f2a2e] leading-tight group-hover:text-[#1c4a59] transition-colors truncate max-w-[130px]">
                    {user.fullName || user.username}
                  </p>
                  <p className="text-[10px] text-[#6a7f84] font-medium uppercase tracking-wider truncate leading-tight mt-0.5">
                    {user.role?.replace('_', ' ')}
                  </p>
                </div>
              </button>

              {/* Logout Button */}
              <button 
                type="button"
                onClick={handleLogout}
                className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl hover:bg-rose-50 text-[#6a7f84] hover:text-[#ef476f] flex items-center justify-center shrink-0 transition-colors cursor-pointer active:scale-95"
                title="Log Out"
                aria-label="Log Out"
              >
                <LogOut className="w-4 h-4 transition-colors" />
              </button>
            </div>
          </header>
        )}

        {/* View Container with Touch Pull-to-Refresh */}
        <div
          ref={viewContainerRef}
          onTouchStart={handleTouchStartPull}
          onTouchMove={handleTouchMovePull}
          onTouchEnd={handleTouchEndPull}
          onTouchCancel={handleTouchEndPull}
          className={cn(
            "flex-1 relative w-full min-w-0 max-w-full overflow-x-hidden print:p-0 print:overflow-visible print:h-auto print:block",
            activeView === 'creator' ? "p-0 overflow-hidden" : "overflow-y-auto p-2.5 sm:p-6 lg:p-8 pb-mobile-safe-content lg:pb-8"
          )}
        >
          {/* Pull-to-Refresh Visual Indicator */}
          {(pullDistance > 0 || isSyncing) && activeView !== 'creator' && (
            <div
              className="flex items-center justify-center overflow-hidden transition-all duration-150 print:hidden"
              style={{ height: isSyncing ? 46 : pullDistance, marginBottom: (pullDistance > 8 || isSyncing) ? 10 : 0 }}
            >
              <div className={cn(
                "inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-bold shadow-md border transition-all max-w-full",
                isSyncing || pullDistance >= PULL_THRESHOLD
                  ? "bg-[#1c4a59] text-white border-[#faae57]/50"
                  : "bg-white text-[#1c4a59] border-[#bac4c6]"
              )}>
                <RefreshCcw
                  className={cn(
                    "w-3.5 h-3.5 text-[#faae57] shrink-0 transition-transform",
                    isSyncing && "animate-spin"
                  )}
                  style={!isSyncing ? { transform: `rotate(${Math.min(pullDistance * 4, 360)}deg)` } : undefined}
                />
                <span className="truncate">
                  {isSyncing
                    ? "Synchronizing cloud database..."
                    : pullDistance >= PULL_THRESHOLD
                    ? "Release to sync cloud"
                    : "Pull down to sync"}
                </span>
              </div>
            </div>
          )}



          <AnimatePresence mode="wait">
            <motion.div
              key={activeView}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className={cn(
                "w-full min-w-0 max-w-full overflow-x-hidden print:h-auto print:block",
                activeView === 'creator' ? "h-full w-full" : "min-h-full max-w-7xl mx-auto w-full pb-4 lg:pb-0"
              )}
            >
              <ErrorBoundary key={activeView}>
                {activeView === 'dashboard' && <Dashboard onViewChange={setActiveView} />}
                {activeView === 'students' && <StudentManagement />}
                {activeView === 'academic' && <AcademicManagement onNavigate={(target) => setActiveView(target as View)} />}
                {activeView === 'timetable' && <TimetableManagement />}
                {activeView === 'duty_roster' && <DutyRosterManagement />}
                {activeView === 'lesson_notes' && (
                  <LessonNotes
                    showToast={showToast}
                    currentUser={user}
                    onNavigate={(target) => setActiveView(target as View)}
                  />
                )}
                {activeView === 'attendance' && <AttendanceTerminal />}
                {activeView === 'results' && <ResultsTerminal onNavigate={(target) => setActiveView(target as View)} />}
                {activeView === 'assessments' && <AssessmentsManager />}
                {activeView === 'sms' && <SmsModule />}
                {activeView === 'exam_analysis' && <ExamAnalysis />}
                {activeView === 'reports' && <ReportTerminal />}
                {activeView === 'fees' && <FeeManagement />}
                {activeView === 'payroll' && <PayrollManagement />}
                {activeView === 'boarding' && <BoardingManagement />}
                {activeView === 'siren' && <SirenTerminal />}
                {activeView === 'users' && (
                  <PermissionGuard permission="users:create" onNavigateHome={() => setActiveView('dashboard')}>
                    <UserManagement />
                  </PermissionGuard>
                )}
                {activeView === 'settings' && <Settings />}
                {activeView === 'evoting' && <EVoting />}
                {activeView === 'inventory' && <InventoryManagement />}
                {activeView === 'school_management' && (
                  ((user?.role as string) === 'creator' || (user?.role as string) === 'super_admin') ? (
                    <SchoolManagement 
                      onSwitchSchool={async (tenant) => {
                        try {
                          await db.settings.put({
                            key: 'schoolProfile',
                            value: {
                              schoolName: tenant.name || tenant.schoolName,
                              logo: tenant.logo || schoolLogo || 'https://cdn.pixabay.com/photo/2016/10/06/19/03/graduation-cap-1719744_1280.png',
                              email: `admin@${tenant.slug}.edu.gh`,
                              academic_year: tenant.academic_year || '2026/2027',
                              current_term: tenant.current_term || 'Term 1'
                            }
                          });
                        } catch (e) {}
                        checkLicenseStatus();
                        handleSync();
                      }}
                    />
                  ) : (
                    <div className="bg-white rounded-3xl p-12 text-center border border-slate-200 max-w-lg mx-auto shadow-sm space-y-4 my-12">
                      <div className="w-16 h-16 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mx-auto">
                        <ShieldAlert className="w-8 h-8" />
                      </div>
                      <h2 className="text-lg font-black uppercase text-slate-800">Creator Access Required</h2>
                      <p className="text-xs text-slate-500 font-medium">Multi-tenant switching and institution tenant management are restricted strictly to Creator accessibility.</p>
                      <button onClick={() => setActiveView('dashboard')} className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold uppercase transition">Return to Dashboard</button>
                    </div>
                  )
                )}
                {activeView === 'creator' && (
                  <CreatorHub 
                    onLicenseChange={checkLicenseStatus} 
                    onExit={() => {
                      handleLogout();
                      setShowGetStarted(true);
                      setActiveView('dashboard');
                    }} 
                  />
                )}
              </ErrorBoundary>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Floating Mobile Bottom Navigation Bar (< 1024px) with Hardware Safe-Area Dock */}
        {activeView !== 'creator' && navItems.length > 1 && (
          <MobileBottomNav
            activeView={activeView}
            onNavigate={(view) => handleNavClick(view as View)}
            navItems={navItems}
            mobileMenuOpen={mobileMenuOpen}
            onOpenMobileMenu={() => setMobileMenuOpen(true)}
          />
        )}
      </main>

      {/* Security & Role Privileges Modal */}
      <SecurityProfileModal 
        isOpen={isSecurityModalOpen} 
        onClose={() => setIsSecurityModalOpen(false)} 
      />

      {/* Floating Support & Issue Ticketing Desk for Client Staff & Admins */}
      {!isCreator && activeView !== 'creator' && (
        <ClientSupportWidget
          user={user}
          schoolId={school?.id || user?.school_id || null}
          schoolName={schoolName}
          onNotify={(msg, type) => showToast(msg, type || 'info')}
        />
      )}

      {/* Connectivity & Offline Status Indicator */}
      <OfflineIndicator />
    </div>
  );
}

export default function App() {
  return (
    <NotificationProvider>
      <AuthProvider>
        <AppContent />
        <CookieConsentBanner />
      </AuthProvider>
    </NotificationProvider>
  );
}
