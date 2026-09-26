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
  Sparkles
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { db, purgeDemoRecordsFromDb } from './db/schema';
import { initRealtimeAndAutoSync, syncAllDataFromBackend } from './lib/syncService';
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

type View = 'dashboard' | 'students' | 'attendance' | 'results' | 'fees' | 'academic' | 'settings' | 'reports' | 'users' | 'siren' | 'timetable' | 'exam_analysis' | 'evoting' | 'inventory' | 'creator' | 'school_management';

const ALL_DEFAULT_MODULES = [
  'students',
  'academic',
  'timetable',
  'attendance',
  'results',
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
  const [lockAnnouncement, setLockAnnouncement] = useState<string>('');
  const [activeModules, setActiveModules] = useState<string[]>(ALL_DEFAULT_MODULES);

  const checkLicenseStatus = async () => {
    try {
      let userRole = '';
      try {
        const stored = localStorage.getItem('esepa_user');
        if (stored) {
          const parsed = JSON.parse(stored);
          userRole = parsed.role || '';
        }
      } catch (e) {}

      const token = localStorage.getItem('esepa_auth_token');
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch(`/api/license/status?role=${encodeURIComponent(userRole)}`, { headers });
      if (res.ok) {
        const contentType = res.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const data = await res.json();
          setIsLicensed(data.active ?? true);
          setLicenseKey(data.licenseKey || '');
          setLockAnnouncement(data.lockAnnouncement || '');
          if (data.activeModules && Array.isArray(data.activeModules) && data.activeModules.length > 0) {
            setActiveModules(data.activeModules);
          } else {
            setActiveModules(ALL_DEFAULT_MODULES);
          }
          return;
        }
      }
      // Static host fallback (e.g., Vercel static deployment returning HTML for /api)
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
  }, []);

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
        const recordedAudioList = (recordedAudioListSetting?.value || []) as Array<{ id: string; name: string; base64: string }>;
        const targetTrack = recordedAudioList.find(r => r.id === audioId);
        if (targetTrack) {
          const audio = new Audio(targetTrack.base64);
          audio.volume = acousticVolume;
          mediaAudioRef.current = audio;
          audio.onended = async () => {
            const existingBroadcast = await db.settings.where('key').equals('activeSirenBroadcast').first();
            if (existingBroadcast && existingBroadcast.value?.type === type) {
              await db.settings.delete(existingBroadcast.id!);
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

          // Trigger activeSirenBroadcast!
          const activeBroadcastPayload = {
            type: matchingBell.alarmType || 'bell',
            label: `${matchingBell.label}`,
            customMsg: `Timetable shift bell trigger: ${matchingBell.label}. Please adjust activities accordingly.`,
            isDrill: false,
            triggeredBy: 'School Timetable System',
            timestamp: Date.now()
          };

          const existingBroadcast = await db.settings.where('key').equals('activeSirenBroadcast').first();
          if (existingBroadcast) {
            await db.settings.update(existingBroadcast.id!, { value: activeBroadcastPayload });
          } else {
            await db.settings.add({ key: 'activeSirenBroadcast', value: activeBroadcastPayload });
          }

          // Append to local warnings log
          try {
            const savedLogs = localStorage.getItem('esepa_siren_logs');
            let logsArr = [];
            if (savedLogs) logsArr = JSON.parse(savedLogs);
            const logEntry = {
              id: `LOG-${Date.now()}`,
              type: matchingBell.alarmType || 'bell',
              label: `Scheduled Bell: ${matchingBell.label}`,
              triggeredBy: 'School Timetable System',
              role: 'system',
              customMsg: `Class Timetable transition automatic trigger: ${matchingBell.label}.`,
              timestamp: Date.now(),
              isDrill: false
            };
            localStorage.setItem('esepa_siren_logs', JSON.stringify([logEntry, ...logsArr]));
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
          await db.settings.delete(existingBroadcast.id!);
        }
      }, 12000);
      return () => clearTimeout(timer);
    }
  }, [activeSirenBroadcast]);

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
        { id: 'timetable', label: 'School Timetable', icon: Calendar },
        { id: 'attendance', label: 'Attendance', icon: CheckCircle },
        { id: 'results', label: 'Results Terminal', icon: BookOpen },
        { id: 'exam_analysis', label: 'Exam Analysis', icon: Award },
        { id: 'reports', label: 'Reports', icon: FileText },
        { id: 'fees', label: 'Fees & Payments', icon: CreditCard },
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
        { id: 'timetable', label: 'School Timetable', icon: Calendar },
        { id: 'attendance', label: 'Attendance', icon: CheckCircle },
        { id: 'results', label: 'Results Terminal', icon: BookOpen },
        { id: 'exam_analysis', label: 'Exam Analysis', icon: Award },
        { id: 'reports', label: 'Reports', icon: FileText },
        { id: 'fees', label: 'Fees & Payments', icon: CreditCard },
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
        { id: 'timetable', label: 'School Timetable', icon: Calendar },
        { id: 'attendance', label: 'Attendance', icon: CheckCircle },
        { id: 'results', label: 'Results Terminal', icon: BookOpen },
        { id: 'exam_analysis', label: 'Exam Analysis', icon: Award },
        { id: 'reports', label: 'Reports', icon: FileText },
        { id: 'fees', label: 'Fees & Payments', icon: CreditCard },
        { id: 'siren', label: 'Siren Console', icon: Siren },
        { id: 'evoting', label: 'E-Voting Portal', icon: Vote },
        { id: 'inventory', label: 'Inventory Registry', icon: Package },
        { id: 'settings', label: 'Settings', icon: SettingsIcon },
      ];
    } else if (user?.role === 'teacher') {
      baseItems = [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { id: 'students', label: 'Students', icon: Users },
        { id: 'timetable', label: 'School Timetable', icon: Calendar },
        { id: 'attendance', label: 'Attendance', icon: CheckCircle },
        { id: 'results', label: 'Results Terminal', icon: BookOpen },
        { id: 'exam_analysis', label: 'Exam Analysis', icon: Award },
        { id: 'reports', label: 'Reports', icon: FileText },
        { id: 'siren', label: 'Siren Console', icon: Siren },
        { id: 'settings', label: 'Settings', icon: SettingsIcon },
      ];
    } else if (user?.role === 'accountant') {
      baseItems = [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { id: 'students', label: 'Students', icon: Users },
        { id: 'fees', label: 'Fees & Payments', icon: CreditCard },
        { id: 'reports', label: 'Reports', icon: FileText },
        { id: 'inventory', label: 'Inventory Registry', icon: Package },
      ];
    } else if (user?.role === 'student') {
      baseItems = [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { id: 'timetable', label: 'School Timetable', icon: Calendar },
        { id: 'results', label: 'Results Terminal', icon: BookOpen },
        { id: 'exam_analysis', label: 'Exam Analysis', icon: Award },
        { id: 'fees', label: 'Fees & Payments', icon: CreditCard },
        { id: 'evoting', label: 'E-Voting Portal', icon: Vote },
      ];
    } else if (user?.role === 'parent') {
      baseItems = [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
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
      const isCore = ['dashboard', 'settings', 'users', 'creator', 'school_management'].includes(item.id);
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
    <div className="flex h-screen bg-[#f6f8f7] overflow-hidden font-sans print:h-auto print:overflow-visible relative">
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
                      className="font-bold text-sm tracking-wide whitespace-nowrap flex-1 text-left"
                    >
                      {item.label}
                    </motion.span>
                  )}
                  {isActive && (sidebarOpen || mobileMenuOpen) && (
                    <span className="w-2 h-2 rounded-full bg-[#faae57] shrink-0" />
                  )}
                  {!sidebarOpen && windowWidth >= 1024 && !mobileMenuOpen && (
                    <div className="absolute left-16 bg-[#1c4a59] text-white px-3 py-2 rounded-xl text-xs opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-30 pointer-events-none font-bold shadow-md border border-[#faae57]/30">
                      {item.label}
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
      <main className="flex-1 flex flex-col h-full overflow-hidden w-full print:block print:h-auto print:overflow-visible">
        {/* Global Emergency Alert Marquee Indicator */}
        {activeSirenBroadcast && (
          <div className={cn(
            "h-10 text-white font-extrabold flex items-center justify-between px-4 sm:px-6 lg:px-8 select-none animate-pulse shrink-0 text-xs sm:text-sm tracking-wide shadow-sm uppercase overflow-hidden z-40 relative",
            activeSirenBroadcast.type === 'lockdown' ? 'bg-red-600' :
            activeSirenBroadcast.type === 'fire' ? 'bg-orange-600' :
            activeSirenBroadcast.type === 'weather' ? 'bg-amber-600' :
            activeSirenBroadcast.type === 'allclear' ? 'bg-emerald-600' :
            'bg-indigo-600'
          )}>
            <div className="flex items-center gap-2 truncate">
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
            
            <div className="flex items-center gap-2 shrink-0 ml-3">
              <button
                onClick={() => setIsGloballyMuted(!isGloballyMuted)}
                className="text-[9px] font-black tracking-widest bg-white/20 hover:bg-white text-white hover:text-slate-900 px-2.5 py-1 rounded-md transition-colors uppercase shadow-sm flex items-center gap-1"
                title={isGloballyMuted ? "Unmute campus speaker locally" : "Mute campus speaker locally"}
              >
                {isGloballyMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                {isGloballyMuted ? "Unmute" : "Mute Tab"}
              </button>
              
              <button 
                onClick={() => setActiveView('siren')}
                className="text-[9px] font-black tracking-widest bg-white/20 hover:bg-white text-white hover:text-slate-900 px-2.5 py-1 rounded-md transition-colors uppercase shadow-sm animate-pulse-subtle"
              >
                Open Siren
              </button>
            </div>
          </div>
        )}

        {/* Header */}
        {activeView !== 'creator' && (
          <header className="h-16 bg-white border-b border-[#bac4c6] flex items-center justify-between px-4 sm:px-6 lg:px-8 z-30 shrink-0 shadow-2xs">
            <div className="flex items-center gap-2.5 sm:gap-4 overflow-hidden min-w-0">
              <button 
                onClick={() => setMobileMenuOpen(true)}
                className="lg:hidden p-2 text-[#6a7f84] hover:bg-[#f6f8f7] hover:text-[#1c4a59] rounded-xl transition-all cursor-pointer min-h-[44px]"
                title="Open Navigation"
              >
                <Menu className="w-5 h-5" />
              </button>

              {/* Multi-Tenant Switcher - Restricted strictly to Creator */}
              {((user?.role as string) === 'creator' || (user?.role as string) === 'super_admin') ? (
                <>
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
                  <div className="hidden lg:flex items-center gap-2">
                    <div className="h-4 w-px bg-[#bac4c6] mx-1" />
                    <span className="px-3 py-1 rounded-full bg-[#1c4a59] text-[#faae57] text-xs font-bold capitalize shadow-2xs">
                      {activeView.replace('_', ' ').replace('-', ' ')}
                    </span>
                  </div>
                </>
              ) : (
                <div className="flex items-center gap-3 min-w-0">
                  {schoolLogo && (
                    <div className="w-8 h-8 rounded-xl overflow-hidden border border-[#bac4c6] shadow-2xs bg-white p-1 shrink-0 flex items-center justify-center">
                      <img src={schoolLogo} alt="Logo" className="w-full h-full object-contain" />
                    </div>
                  )}
                  <h1 className="text-xs sm:text-base font-bold text-[#1c4a59] uppercase truncate max-w-[120px] xs:max-w-[180px] sm:max-w-none tracking-tight">
                    {schoolName}
                  </h1>
                  <div className="hidden sm:block h-4 w-px bg-[#bac4c6] mx-1" />
                  <span className="hidden sm:inline-flex px-3 py-1 rounded-full bg-[#1c4a59] text-[#faae57] text-xs font-bold capitalize shadow-2xs">
                    {activeView.replace('_', ' ').replace('-', ' ')}
                  </span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
              {/* Supabase Database Connection Indicator - Visible ONLY for Creator accessibility */}
              {((user?.role as string) === 'creator' || (user?.role as string) === 'super_admin') && (
                <button
                  type="button" 
                  id="supabase-status-indicator"
                  onClick={checkSupabaseConnection}
                  title={
                    supabaseConnected === null 
                      ? "Supabase DB: Checking connection..." 
                      : supabaseConnected 
                        ? `Supabase DB: Connected (${supabaseDetails || 'Online'}) • Click to re-check` 
                        : "Supabase DB: Disconnected • Click to retry connection"
                  }
                  className={cn(
                    "flex items-center gap-1.5 sm:gap-2 p-1.5 sm:px-3 sm:py-1.5 rounded-xl border text-xs font-bold cursor-pointer transition-all select-none shadow-2xs active:scale-95",
                    supabaseConnected === true 
                      ? "bg-[#06D6A0]/10 border-[#06D6A0]/35 text-[#047857] hover:bg-[#06D6A0]/20" 
                      : supabaseConnected === false 
                        ? "bg-[#EF476F]/10 border-[#EF476F]/35 text-[#b91c1c] hover:bg-[#EF476F]/20"
                        : "bg-[#FFC43D]/15 border-[#FFC43D]/40 text-[#92400e]"
                  )}
                >
                  {/* Status Indicator Dot */}
                  <span className="relative flex h-2 w-2">
                    <span 
                      className={cn(
                        "relative inline-flex rounded-full h-2 w-2",
                        supabaseConnected === true 
                          ? "bg-[#06D6A0] animate-pulse" 
                          : supabaseConnected === false 
                            ? "bg-[#EF476F]" 
                            : "bg-[#FFC43D]"
                      )} 
                    />
                  </span>

                  <div className="flex items-center gap-1.5">
                    <Database className={cn(
                      "w-3.5 h-3.5",
                      supabaseConnected === true ? "text-[#06D6A0]" : supabaseConnected === false ? "text-[#EF476F]" : "text-[#FFC43D]"
                    )} />
                    <span className="hidden md:inline font-bold tracking-tight text-[11px]">
                      Supabase
                    </span>
                    <span className="hidden sm:inline text-[10px] font-extrabold uppercase tracking-wider">
                      {supabaseChecking 
                        ? "Checking..." 
                        : supabaseConnected === true 
                          ? "Connected" 
                          : supabaseConnected === false 
                            ? "Disconnected" 
                            : "Connecting"}
                    </span>
                  </div>
                </button>
              )}

              <PWAInstallButton variant="header" />

              <button 
                id="manual-sync"
                onClick={async () => {
                  if (isSyncing) return;
                  await handleSync();
                  checkSupabaseConnection();
                }}
                disabled={isSyncing}
                className="flex items-center gap-1.5 p-1.5 sm:px-3 sm:py-1.5 rounded-xl border border-[#bac4c6] bg-white hover:bg-[#f6f8f7] text-[#1c4a59] active:scale-[0.98] transition-all text-xs font-bold shadow-2xs cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed min-h-[44px]"
                title="Synchronize with Cloud Database (Fetch Latest Updates)"
              >
                <RefreshCcw className={cn("w-3.5 h-3.5 text-[#6a7f84] transition-transform", isSyncing && "animate-spin text-[#1c4a59]")} />
                <span className="hidden md:inline text-xs tracking-tight font-bold">
                  {isSyncing ? 'Syncing...' : 'Sync Database'}
                </span>
              </button>

              <div className="h-6 w-px bg-[#bac4c6] hidden sm:block" />
              
              <div className="flex items-center gap-1.5 sm:gap-2">
                <button
                  type="button"
                  onClick={() => setIsSecurityModalOpen(true)}
                  className="flex items-center gap-2 p-1 sm:px-2.5 sm:py-1.5 rounded-xl hover:bg-[#f6f8f7] transition-colors text-left group cursor-pointer min-h-[44px]"
                  title="View Profile, Permissions & Change Password"
                >
                  <div className="w-8 h-8 rounded-xl bg-[#1c4a59] text-[#faae57] border border-[#faae57]/40 flex items-center justify-center font-bold text-xs shadow-2xs group-hover:bg-[#163b47] transition-colors">
                    {user.fullName ? user.fullName[0]?.toUpperCase() : (user.username?.[0]?.toUpperCase() || 'U')}
                  </div>
                  <div className="text-left hidden sm:block">
                    <p className="text-xs font-bold text-[#1f2a2e] leading-tight group-hover:text-[#1c4a59] transition-colors truncate max-w-[120px]">
                      {user.fullName || user.username}
                    </p>
                    <p className="text-[10px] text-[#807654] font-bold uppercase tracking-wider mt-0.5">
                      {user.role?.replace('_', ' ')}
                    </p>
                  </div>
                </button>
                <button 
                  type="button"
                  onClick={handleLogout}
                  className="w-9 h-9 rounded-xl bg-[#f6f8f7] hover:bg-[#ef476f]/10 hover:border-[#ef476f]/30 border border-[#bac4c6] flex items-center justify-center shrink-0 transition-colors group cursor-pointer min-h-[44px]"
                  title="Log Out"
                >
                  <LogOut className="w-4 h-4 text-[#6a7f84] group-hover:text-[#ef476f] transition-colors" />
                </button>
              </div>
            </div>
          </header>
        )}

        {/* View Container */}
        <div className={cn(
          "flex-1 relative print:p-0 print:overflow-visible print:h-auto print:block",
          activeView === 'creator' ? "p-0 overflow-hidden" : "overflow-y-auto p-4 sm:p-6 lg:p-8 pb-24 lg:pb-8"
        )}>
          <AnimatePresence mode="wait">
            <motion.div
              key={activeView}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className={cn(
                "print:h-auto print:block",
                activeView === 'creator' ? "h-full w-full" : "h-full max-w-7xl mx-auto w-full"
              )}
            >
              <ErrorBoundary key={activeView}>
                {activeView === 'dashboard' && <Dashboard onViewChange={setActiveView} />}
                {activeView === 'students' && <StudentManagement />}
                {activeView === 'academic' && <AcademicManagement />}
                {activeView === 'timetable' && <TimetableManagement />}
                {activeView === 'attendance' && <AttendanceTerminal />}
                {activeView === 'results' && <ResultsTerminal />}
                {activeView === 'exam_analysis' && <ExamAnalysis />}
                {activeView === 'reports' && <ReportTerminal />}
                {activeView === 'fees' && <FeeManagement />}
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

        {/* Floating Mobile Bottom Navigation Bar (< 1024px) */}
        {activeView !== 'creator' && navItems.length > 1 && (
          <div className="lg:hidden fixed bottom-3 left-3 right-3 z-30 print:hidden pointer-events-none">
            <div className="max-w-md mx-auto bg-white border border-[#bac4c6]/90 rounded-full px-3 py-2 shadow-[0_8px_28px_rgba(28,74,89,0.16)] flex items-center justify-around pointer-events-auto">
              {navItems.slice(0, 2).map((item) => {
                const isActive = activeView === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleNavClick(item.id as View)}
                    className={cn(
                      "flex flex-col items-center justify-center min-w-[52px] min-h-[44px] rounded-full transition-all cursor-pointer px-2",
                      isActive ? "text-[#1c4a59]" : "text-[#6a7f84] hover:text-[#1c4a59]"
                    )}
                  >
                    <item.icon className={cn("w-5 h-5", isActive && "text-[#1c4a59] stroke-[2.5]")} />
                    <span className={cn(
                      "text-[9px] mt-0.5 tracking-tight truncate max-w-[56px]",
                      isActive ? "font-extrabold text-[#1c4a59]" : "font-semibold text-[#6a7f84]"
                    )}>
                      {item.label.split(' ')[0]}
                    </span>
                  </button>
                );
              })}

              {/* Central Raised Warm Amber FAB */}
              {(() => {
                const fabTarget: View =
                  user.role === 'teacher' ? 'attendance' :
                  user.role === 'accountant' ? 'fees' :
                  user.role === 'parent' ? 'fees' :
                  user.role === 'student' ? 'timetable' :
                  'students';
                const effectiveTarget = navItems.some(i => i.id === fabTarget) ? fabTarget : (navItems[0]?.id as View || 'dashboard');
                const FabIcon = navItems.find(i => i.id === effectiveTarget)?.icon || LayoutDashboard;
                return (
                  <button
                    type="button"
                    onClick={() => handleNavClick(effectiveTarget)}
                    className="w-12 h-12 -mt-5 rounded-full bg-[#faae57] hover:bg-[#e4ae67] text-[#1f2a2e] shadow-[0_6px_18px_rgba(250,174,87,0.45)] border-2 border-white flex items-center justify-center transition-transform active:scale-95 cursor-pointer shrink-0"
                    title="Quick Action"
                  >
                    <FabIcon className="w-5 h-5 stroke-[2.5]" />
                  </button>
                );
              })()}

              {navItems.slice(2, 3).map((item) => {
                const isActive = activeView === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleNavClick(item.id as View)}
                    className={cn(
                      "flex flex-col items-center justify-center min-w-[52px] min-h-[44px] rounded-full transition-all cursor-pointer px-2",
                      isActive ? "text-[#1c4a59]" : "text-[#6a7f84] hover:text-[#1c4a59]"
                    )}
                  >
                    <item.icon className={cn("w-5 h-5", isActive && "text-[#1c4a59] stroke-[2.5]")} />
                    <span className={cn(
                      "text-[9px] mt-0.5 tracking-tight truncate max-w-[56px]",
                      isActive ? "font-extrabold text-[#1c4a59]" : "font-semibold text-[#6a7f84]"
                    )}>
                      {item.label.split(' ')[0]}
                    </span>
                  </button>
                );
              })}

              <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                className={cn(
                  "flex flex-col items-center justify-center min-w-[52px] min-h-[44px] rounded-full transition-all cursor-pointer px-2",
                  mobileMenuOpen ? "text-[#1c4a59]" : "text-[#6a7f84] hover:text-[#1c4a59]"
                )}
              >
                <Menu className="w-5 h-5" />
                <span className="text-[9px] mt-0.5 font-semibold tracking-tight">More</span>
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Security & Role Privileges Modal */}
      <SecurityProfileModal 
        isOpen={isSecurityModalOpen} 
        onClose={() => setIsSecurityModalOpen(false)} 
      />

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
