import React, { useState, useEffect, useRef } from 'react';
import { 
  Megaphone, 
  Volume2, 
  VolumeX, 
  AlertTriangle, 
  Flame, 
  CloudLightning, 
  Bell, 
  CheckCircle, 
  LogOut, 
  History, 
  Trash2, 
  Radio,
  FileSpreadsheet,
  Clock,
  User,
  ShieldCheck,
  Zap,
  Play,
  Square,
  Calendar,
  Edit2,
  Plus,
  Mic,
  Upload,
  Pause,
  Cloud,
  RefreshCcw,
  Database
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useNotifications } from '../contexts/NotificationContext';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../db/schema';
import { useLiveQuery } from 'dexie-react-hooks';
import { sirenApi } from '../lib/api';

// Type definitions for alarms
type AlarmType = 'lockdown' | 'fire' | 'weather' | 'bell' | 'allclear';

interface AlarmConfig {
  id: AlarmType;
  label: string;
  description: string;
  severity: 'critical' | 'warning' | 'info' | 'success';
  icon: any;
  colorClass: string;
  bgPulseClass: string;
  strobeColors: string[];
}

interface AlertLog {
  id: string;
  type: AlarmType | string;
  label?: string;
  triggeredBy?: string;
  user?: string;
  role?: string;
  customMsg?: string;
  details?: string;
  timestamp: number;
  time?: string;
  date?: string;
  duration?: string;
  isDrill?: boolean;
}

const ALARM_TYPES: AlarmConfig[] = [
  {
    id: 'lockdown',
    label: 'Lockdown Siren',
    description: 'Active threat warning. Sounds a double-modulation classic emergency security sweep. Alerts visual stroboscopes.',
    severity: 'critical',
    icon: AlertTriangle,
    colorClass: 'bg-red-600 text-white',
    bgPulseClass: 'bg-red-500/15',
    strobeColors: ['rgba(239, 68, 68, 0.45)', 'rgba(59, 130, 246, 0.45)']
  },
  {
    id: 'fire',
    label: 'Fire Drill / Evaculate',
    description: 'Immediate evacuation alarm. Plays a high-frequency piercing sweep pulsating at 3.5Hz rhythm cycles.',
    severity: 'critical',
    icon: Flame,
    colorClass: 'bg-orange-600 text-white',
    bgPulseClass: 'bg-orange-500/15',
    strobeColors: ['rgba(249, 115, 22, 0.5)', 'rgba(239, 68, 68, 0.1)']
  },
  {
    id: 'weather',
    label: 'Weather Warning',
    description: 'Severe meteorological warning. Generates a deep, pulsating, classic horn siren for active tornado/hurricane warnings.',
    severity: 'warning',
    icon: CloudLightning,
    colorClass: 'bg-amber-600 text-white',
    bgPulseClass: 'bg-amber-500/15',
    strobeColors: ['rgba(245, 158, 11, 0.4)', 'rgba(0, 0, 0, 0.05)']
  },
  {
    id: 'bell',
    label: 'School Period Bell',
    description: 'Class period notification. Emulates a classic metallic brass bell strike with fast decay ring modulator frequencies.',
    severity: 'info',
    icon: Bell,
    colorClass: 'bg-indigo-600 text-white',
    bgPulseClass: 'bg-indigo-500/10',
    strobeColors: ['rgba(99, 102, 241, 0.2)', 'rgba(99, 102, 241, 0.02)']
  },
  {
    id: 'allclear',
    label: 'All Clear Chime',
    description: 'Resolves ongoing alarms. Plays a soothing, major-arpeggio warm harmonic chime sequence to restore safe state.',
    severity: 'success',
    icon: CheckCircle,
    colorClass: 'bg-emerald-600 text-white',
    bgPulseClass: 'bg-emerald-500/15',
    strobeColors: ['rgba(16, 185, 129, 0.3)', 'rgba(16, 185, 129, 0.02)']
  }
];

export default function SirenTerminal() {
  const { user } = useAuth();
  const { showToast, confirm } = useNotifications();
  
  // Tab states for manually triggering vs timetable management vs custom recordings
  const [activeSubTab, setActiveSubTab] = useState<'triggers' | 'timetable' | 'recordings'>('triggers');

  const [activeAlarm, setActiveAlarm] = useState<AlarmType | null>(null);
  const [customAnnouncement, setCustomAnnouncement] = useState('');
  const [isDrill, setIsDrill] = useState(false);
  const [logs, setLogs] = useState<AlertLog[]>([]);
  const [activeStrobeColor, setActiveStrobeColor] = useState('transparent');
  const [pulseCount, setPulseCount] = useState(0);

  // Timetable bell scheduler form states
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [bellEditingId, setBellEditingId] = useState<string | null>(null);
  const [bellLabel, setBellLabel] = useState('');
  const [bellTime, setBellTime] = useState('08:00');
  const [bellEndTime, setBellEndTime] = useState('08:45');
  const [bellCategory, setBellCategory] = useState<'period_start' | 'break' | 'dismissal' | 'assembly'>('period_start');
  const [bellDays, setBellDays] = useState<string[]>(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']);
  const [bellTone, setBellTone] = useState<string>('bell');
  const [isSyncingTimetable, setIsSyncingTimetable] = useState(false);
  const [classDayFilter, setClassDayFilter] = useState<'today' | 'all'>('today');
  const [liveNow, setLiveNow] = useState<Date>(() => new Date());

  // Load database settings and volume level reactively
  const settingsArray = useLiveQuery(() => db.settings.toArray()) || [];

  // Cloud Sync states
  const [cloudSyncStatus, setCloudSyncStatus] = useState<'synced' | 'syncing' | 'offline' | 'queued'>('syncing');
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [isUploadingAudio, setIsUploadingAudio] = useState(false);
  const [dbTableInfo, setDbTableInfo] = useState<any | null>(null);
  const [showDbTablesModal, setShowDbTablesModal] = useState(false);
  const [isProvisioningTables, setIsProvisioningTables] = useState(false);
  const volumeSaveTimerRef = useRef<any>(null);

  // Audio recordings list (check both recordedAudioList and sirenRecordings for seamless compatibility)
  const recordingsSetting = settingsArray.find(s => s.key === 'recordedAudioList') || settingsArray.find(s => s.key === 'sirenRecordings');
  const recordedAudios = (recordingsSetting?.value || []) as Array<{
    id: string;
    name: string;
    title?: string;
    base64: string;
    audioUrl?: string;
    storagePath?: string;
    mimeType?: string;
    duration?: number;
    timestamp: number;
  }>;

  // MediaRecorder states
  const [isRecording, setIsRecording] = useState(false);
  const [recordDuration, setRecordDuration] = useState(0);
  const [recordTimerId, setRecordTimerId] = useState<any>(null);
  const [newRecordingName, setNewRecordingName] = useState('');
  const recordDurationRef = useRef<number>(0);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Local playing audio states (for previewing in this tab)
  const [previewPlayingId, setPreviewPlayingId] = useState<string | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      // Cleanup preview and timers when unmounting
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
      }
      if (recordTimerId) {
        clearInterval(recordTimerId);
      }
      if (volumeSaveTimerRef.current) {
        clearTimeout(volumeSaveTimerRef.current);
      }
    };
  }, [recordTimerId]);

  const startMicRecording = async () => {
    try {
      audioChunksRef.current = [];
      recordDurationRef.current = 0;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        
        // Stop stream tracks
        stream.getTracks().forEach((track) => track.stop());

        // Convert blob to base64 and persist to Supabase via server API
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          setIsUploadingAudio(true);
          setCloudSyncStatus('syncing');
          try {
            const base64data = reader.result as string;
            const recordingName = newRecordingName.trim() || `Voice Note - ${new Date().toLocaleTimeString('en-US', { hour12: false })}`;
            const newId = `rec-${Date.now()}`;
            const newRecord = {
              id: newId,
              name: recordingName,
              title: recordingName,
              base64: base64data,
              mimeType: 'audio/webm',
              duration: recordDurationRef.current || recordDuration || 1,
              timestamp: Date.now()
            };

            const logEntry: AlertLog = {
              id: `LOG-REC-${Date.now()}`,
              type: 'bell',
              label: `Recorded Voice Note: ${recordingName}`,
              customMsg: `New voice announcement recorded and saved to Supabase (${newRecord.duration}s).`,
              isDrill: false,
              triggeredBy: user?.fullName || user?.username || 'Campus Administrator',
              role: user?.role || 'admin',
              timestamp: Date.now()
            };

            const res = await sirenApi.saveRecording({
              recording: newRecord,
              logEntry
            });

            setNewRecordingName('');
            if (res?.queued) {
              setCloudSyncStatus('queued');
              showToast(`Saved "${recordingName}" locally (queued for Supabase sync when online).`, "info");
            } else {
              setCloudSyncStatus('synced');
              setLastSyncedAt(Date.now());
              showToast(`Saved "${recordingName}" to Supabase Cloud Storage & Database!`, "success");
            }
          } catch (err) {
            console.error("Failed to save recording to Supabase:", err);
            setCloudSyncStatus('offline');
            showToast("Saved recording locally; will retry Supabase sync automatically.", "info");
          } finally {
            setIsUploadingAudio(false);
          }
        };
      };

      recorder.start();
      setIsRecording(true);
      setRecordDuration(0);

      const tid = setInterval(() => {
        setRecordDuration((prev) => {
          const next = prev + 1;
          recordDurationRef.current = next;
          if (prev >= 59) {
            // Auto stop at max duration limit (60s)
            stopMicRecording();
            return 60;
          }
          return next;
        });
      }, 1000);
      setRecordTimerId(tid);

      showToast("Recording broadcasting announcement started!", "info");
    } catch (err: any) {
      console.error("Recording error:", err);
      showToast("Unable to use microphone. Check browser permissions or upload an audio file instead.", "error");
    }
  };

  const stopMicRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch (e) {}
    }
    setIsRecording(false);
    if (recordTimerId) {
      clearInterval(recordTimerId);
      setRecordTimerId(null);
    }
  };

  const handleAudioUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 8 * 1024 * 1024) {
      showToast("Audio file is too large! Maximum limit is 8MB.", "error");
      return;
    }

    const name = file.name.replace(/\.[^/.]+$/, ""); // strip extension

    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = async () => {
      setIsUploadingAudio(true);
      setCloudSyncStatus('syncing');
      try {
        const base64 = reader.result as string;
        const newRecord = {
          id: `rec-${Date.now()}`,
          name: name || "Uploaded Announcement",
          title: name || "Uploaded Announcement",
          base64,
          mimeType: file.type || 'audio/mpeg',
          timestamp: Date.now()
        };

        const logEntry: AlertLog = {
          id: `LOG-UPL-${Date.now()}`,
          type: 'bell',
          label: `Uploaded Audio Chime: ${newRecord.name}`,
          customMsg: `Audio file "${file.name}" uploaded and persisted to Supabase Cloud.`,
          isDrill: false,
          triggeredBy: user?.fullName || user?.username || 'Campus Administrator',
          role: user?.role || 'admin',
          timestamp: Date.now()
        };

        const res = await sirenApi.saveRecording({
          recording: newRecord,
          logEntry
        });

        if (res?.queued) {
          setCloudSyncStatus('queued');
          showToast(`Audio "${name}" saved locally & queued for Supabase sync!`, "info");
        } else {
          setCloudSyncStatus('synced');
          setLastSyncedAt(Date.now());
          showToast(`Audio "${name}" uploaded to Supabase Cloud Storage & Database!`, "success");
        }
      } catch (err) {
        console.error("Failed to upload audio to Supabase:", err);
        setCloudSyncStatus('offline');
        showToast(`Audio "${name}" cached locally.`, "info");
      } finally {
        setIsUploadingAudio(false);
        e.target.value = '';
      }
    };
    reader.onerror = () => {
      showToast("Failed to parse the selected audio file.", "error");
    };
  };

  const handleDeleteRecording = async (id: string, name: string) => {
    const okay = await confirm({
      title: "Delete Custom Audio?",
      message: `Permanently delete "${name}" from Supabase Cloud and local cache? Schedule items or active triggers using this audio will no longer play.`,
      confirmLabel: "Delete Recording"
    });
    if (!okay) return;

    // stop preview if playing
    if (previewPlayingId === id && previewAudioRef.current) {
      previewAudioRef.current.pause();
      setPreviewPlayingId(null);
    }

    setCloudSyncStatus('syncing');
    const res = await sirenApi.deleteRecording(id, name);
    if (res?.queued) {
      setCloudSyncStatus('queued');
    } else {
      setCloudSyncStatus('synced');
      setLastSyncedAt(Date.now());
    }
    showToast(`Deleted "${name}" from Siren Console & Supabase`, "info");
  };

  const handlePreviewPlay = (item: any) => {
    if (previewPlayingId === item.id) {
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
        previewAudioRef.current = null;
      }
      setPreviewPlayingId(null);
    } else {
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
      }

      const audioSrc = item.audioUrl || item.base64;
      const audio = new Audio(audioSrc);
      audio.volume = acousticVolume;
      audio.onended = () => {
        setPreviewPlayingId(null);
      };
      audio.onerror = () => {
        // Fallback to base64 if remote audioUrl failed
        if (item.audioUrl && item.base64 && audio.src !== item.base64) {
          audio.src = item.base64;
          audio.play().catch(() => setPreviewPlayingId(null));
        } else {
          setPreviewPlayingId(null);
        }
      };
      previewAudioRef.current = audio;
      setPreviewPlayingId(item.id);
      audio.play().catch(err => {
        console.error("Playback failed:", err);
        showToast("Audio playback blocked. Interactive triggers are required by your browser.", "error");
        setPreviewPlayingId(null);
      });
    }
  };

  const handleBroadcastRecordedAudio = async (item: any) => {
    setCloudSyncStatus('syncing');
    const displayName = item.name || item.title || 'Recorded Announcement';
    const payload = {
      type: `recorded:${item.id}`,
      label: displayName,
      customMsg: `LIVE INTERCOM MESSAGE: "${displayName}". Please listen to the speaker.`,
      isDrill: false,
      triggeredBy: user?.fullName || user?.username || 'Campus Administrator',
      timestamp: Date.now(),
      audioUrl: item.audioUrl || '',
      base64: item.base64 || ''
    };

    const logEntry: AlertLog = {
      id: `LOG-INT-${Date.now()}`,
      type: `recorded:${item.id}`,
      label: `Intercom Broadcast: ${displayName}`,
      customMsg: payload.customMsg,
      isDrill: false,
      triggeredBy: user?.fullName || user?.username || 'Campus Administrator',
      role: user?.role || 'admin',
      timestamp: Date.now()
    };

    const res = await sirenApi.triggerBroadcast({
      broadcast: payload,
      logEntry
    });

    if (res?.queued) {
      setCloudSyncStatus('queued');
      showToast(`Broadcasting "${displayName}" locally (queued for cloud sync).`, "info");
    } else {
      setCloudSyncStatus('synced');
      setLastSyncedAt(Date.now());
      showToast(`Broadcasting "${displayName}" live across all school devices via Supabase!`, "success");
    }
  };
  const volumeSetting = settingsArray.find(s => s.key === 'acousticVolume');
  const acousticVolume = volumeSetting?.value ?? 0.5;

  const isMutedSetting = settingsArray.find(s => s.key === 'isGloballyMuted');
  const isGloballyMuted = isMutedSetting?.value === true;

  const setIsGloballyMuted = async (muted: boolean) => {
    const existing = await db.settings.where('key').equals('isGloballyMuted').first();
    if (existing) {
      await db.settings.update(existing.id!, { value: muted });
    } else {
      await db.settings.add({ key: 'isGloballyMuted', value: muted });
    }
  };

  useEffect(() => {
    const clockTimer = setInterval(() => {
      setLiveNow(new Date());
    }, 10000);
    return () => clearInterval(clockTimer);
  }, []);

  const timetableSlotsSetting = settingsArray.find(s => s.key === 'timetable_slots');
  const schoolTimetableSlots = (Array.isArray(timetableSlotsSetting?.value) ? timetableSlotsSetting.value : []) as Array<{
    id: string;
    classId: string;
    subjectName: string;
    teacherName: string;
    day: string;
    startTime: string;
    endTime: string;
    room?: string;
  }>;

  const scheduleSetting = settingsArray.find(s => s.key === 'bellSchedule');
  const rawBellSchedule = (scheduleSetting?.value || []) as Array<{
    id: string;
    label: string;
    time: string;
    endTime?: string;
    category?: 'period_start' | 'break' | 'dismissal' | 'assembly' | 'custom';
    days: string[];
    alarmType: AlarmType;
    enabled: boolean;
    linkedSlots?: Array<{
      id: string;
      classId: string;
      subjectName: string;
      teacherName: string;
      day: string;
      startTime: string;
      endTime: string;
      room?: string;
    }>;
  }>;

  // Enrich each Period Bell with linked School Timetable classes/subjects and category/endTime
  const bellSchedule = rawBellSchedule.map((b) => {
    const normTime = String(b.time || '08:00').slice(0, 5);
    const matchingLocalSlots = schoolTimetableSlots.filter(
      (s) => String(s.startTime || '').slice(0, 5) === normTime
    );
    const mergedSlotsMap = new Map<string, any>();
    for (const s of [...(Array.isArray(b.linkedSlots) ? b.linkedSlots : []), ...matchingLocalSlots]) {
      if (!s || !s.classId || !s.subjectName) continue;
      const key = `${s.day}|${s.classId}|${s.subjectName}|${String(s.startTime || '').slice(0, 5)}`;
      if (!mergedSlotsMap.has(key)) {
        mergedSlotsMap.set(key, s);
      }
    }
    const linkedSlots = Array.from(mergedSlotsMap.values());
    const lowerLabel = String(b.label || '').toLowerCase();
    const category: 'period_start' | 'break' | 'dismissal' | 'assembly' =
      b.category && b.category !== 'custom'
        ? b.category
        : linkedSlots.length > 0
        ? 'period_start'
        : /dismissal|closing|departure|end of school/i.test(lowerLabel)
        ? 'dismissal'
        : /break|recess|lunch|snack|intermission/i.test(lowerLabel)
        ? 'break'
        : /assembly|devotion|parade/i.test(lowerLabel)
        ? 'assembly'
        : 'period_start';

    let endTime = b.endTime ? String(b.endTime).slice(0, 5) : '';
    if (!endTime) {
      if (linkedSlots.length > 0) {
        endTime = linkedSlots.reduce(
          (acc: string, s: any) => (String(s.endTime || '').slice(0, 5) > acc ? String(s.endTime || '').slice(0, 5) : acc),
          String(linkedSlots[0].endTime || '').slice(0, 5)
        );
      } else {
        const [hh, mm] = normTime.split(':').map((n) => parseInt(n || '0', 10) || 0);
        const dur = category === 'break' ? 30 : category === 'assembly' ? 20 : category === 'dismissal' ? 15 : 45;
        const tot = Math.min(23 * 60 + 59, hh * 60 + mm + dur);
        endTime = `${String(Math.floor(tot / 60)).padStart(2, '0')}:${String(tot % 60).padStart(2, '0')}`;
      }
    }

    return {
      ...b,
      time: normTime,
      endTime,
      category,
      linkedSlots
    };
  });

  const currentWeekdayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][liveNow.getDay()];
  const currentHHMM = `${String(liveNow.getHours()).padStart(2, '0')}:${String(liveNow.getMinutes()).padStart(2, '0')}`;

  // Determine which bell is ACTIVE NOW and which is NEXT BELL today
  const activePeriodBell = bellSchedule.find(
    (b) =>
      b.enabled &&
      b.days.includes(currentWeekdayName) &&
      currentHHMM >= b.time &&
      currentHHMM < (b.endTime || b.time)
  );
  const nextUpcomingBellToday = bellSchedule.find(
    (b) => b.enabled && b.days.includes(currentWeekdayName) && b.time > currentHHMM
  );

  const handleSyncSchoolTimetable = async (silent = false) => {
    setIsSyncingTimetable(true);
    setCloudSyncStatus('syncing');
    try {
      const res = await sirenApi.syncWithTimetable({
        bellSchedule: rawBellSchedule,
        forceFromTimetable: true
      });
      setCloudSyncStatus('synced');
      setLastSyncedAt(Date.now());
      if (!silent) {
        const stats = res?.timetableStats;
        if (stats) {
          showToast(
            `Synced ${stats.periodStartBells} period start bells, ${stats.breakBells} break chimes & dismissal bell across ${stats.linkedSlotsCount} School Timetable classes!`,
            'success'
          );
        } else {
          showToast('Synchronized Period Bell Timetable with School Timetable!', 'success');
        }
      }
    } catch (err: any) {
      console.error('Failed to sync with School Timetable:', err);
      setCloudSyncStatus('offline');
      if (!silent) {
        showToast(err?.message || 'Could not sync with School Timetable.', 'error');
      }
    } finally {
      setIsSyncingTimetable(false);
    }
  };

  const DEFAULT_BELLS = [
    { id: 'bell-1', label: 'Morning General Assembly', time: '07:30', endTime: '08:00', category: 'assembly', days: ['Monday', 'Friday'], alarmType: 'bell', enabled: true },
    { id: 'bell-2', label: 'Period 1 Start', time: '08:00', endTime: '08:45', category: 'period_start', days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], alarmType: 'bell', enabled: true },
    { id: 'bell-3', label: 'Mid-Morning Play Break', time: '10:00', endTime: '10:30', category: 'break', days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], alarmType: 'allclear', enabled: true },
    { id: 'bell-4', label: 'Lunch Recess Intermission', time: '12:00', endTime: '13:00', category: 'break', days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], alarmType: 'allclear', enabled: true },
    { id: 'bell-5', label: 'Afternoon Period 5 Resume', time: '13:00', endTime: '13:45', category: 'period_start', days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], alarmType: 'bell', enabled: true },
    { id: 'bell-6', label: 'Closing & Campus Dismissal', time: '15:30', endTime: '15:45', category: 'dismissal', days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], alarmType: 'bell', enabled: true },
  ];

  const handleSeedDefaults = async () => {
    setCloudSyncStatus('syncing');
    const res = await sirenApi.saveBells(DEFAULT_BELLS, {
      id: `LOG-BELLS-${Date.now()}`,
      type: 'bell',
      label: 'Loaded Standard Period Bell Templates',
      customMsg: '6 standard school period bells configured and synced to Supabase.',
      isDrill: false,
      triggeredBy: user?.fullName || user?.username || 'Campus Administrator',
      role: user?.role || 'admin',
      timestamp: Date.now()
    });
    if (res?.queued) {
      setCloudSyncStatus('queued');
    } else {
      setCloudSyncStatus('synced');
      setLastSyncedAt(Date.now());
    }
    showToast("Loaded standard school period bells & saved to Supabase!", "success");
  };

  const handleToggleBell = async (id: string) => {
    setCloudSyncStatus('syncing');
    const newList = bellSchedule.map((b: any) => 
      b.id === id ? { ...b, enabled: !b.enabled } : b
    );
    const res = await sirenApi.saveBells(newList);
    if (res?.queued) {
      setCloudSyncStatus('queued');
    } else {
      setCloudSyncStatus('synced');
      setLastSyncedAt(Date.now());
    }
  };

  const handleSaveBell = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bellLabel.trim()) {
      showToast("Please enter a clear label for the period ring", "error");
      return;
    }
    if (bellDays.length === 0) {
      showToast("Please select at least one day", "error");
      return;
    }

    let newList = [...bellSchedule];
    if (bellEditingId) {
      newList = newList.map((b: any) => 
        b.id === bellEditingId 
          ? { ...b, label: bellLabel.trim(), time: bellTime, endTime: bellEndTime, category: bellCategory, days: bellDays, alarmType: bellTone as AlarmType }
          : b
      );
    } else {
      newList.push({
        id: `bell-${Date.now()}`,
        label: bellLabel.trim(),
        time: bellTime,
        endTime: bellEndTime,
        category: bellCategory,
        days: bellDays,
        alarmType: bellTone as AlarmType,
        enabled: true,
        linkedSlots: []
      });
    }

    // Sort by time ascending
    newList.sort((a: any, b: any) => a.time.localeCompare(b.time));

    setCloudSyncStatus('syncing');
    const res = await sirenApi.saveBells(newList, {
      id: `LOG-BELL-${Date.now()}`,
      type: 'bell',
      label: bellEditingId ? `Updated Bell: ${bellLabel.trim()}` : `Added Bell: ${bellLabel.trim()}`,
      customMsg: `Scheduled for ${bellTime} - ${bellEndTime} on ${bellDays.join(', ')}.`,
      isDrill: false,
      triggeredBy: user?.fullName || user?.username || 'Campus Administrator',
      role: user?.role || 'admin',
      timestamp: Date.now()
    });

    if (res?.queued) {
      setCloudSyncStatus('queued');
    } else {
      setCloudSyncStatus('synced');
      setLastSyncedAt(Date.now());
    }

    showToast(bellEditingId ? "Scheduled bell updated & synced with School Timetable!" : "New scheduled bell saved & synced with School Timetable!", "success");
    setIsFormOpen(false);
    setBellEditingId(null);
    setBellLabel('');
    setBellTime('08:00');
    setBellEndTime('08:45');
    setBellCategory('period_start');
    setBellDays(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']);
    setBellTone('bell');
  };

  const handleStartEditBell = (b: any) => {
    setBellEditingId(b.id);
    setBellLabel(b.label);
    setBellTime(b.time);
    setBellEndTime(b.endTime || '08:45');
    setBellCategory(b.category || 'period_start');
    setBellDays(b.days);
    setBellTone(b.alarmType || 'bell');
    setIsFormOpen(true);
  };

  const handleDeleteBell = async (id: string) => {
    const targetBell = bellSchedule.find((b: any) => b.id === id);
    const okay = await confirm({
      title: "Remove Period Bell?",
      message: "Are you sure you want to delete this scheduled bell alert from the school timetable and Supabase database? This cannot be undone.",
      confirmLabel: "Delete Ring"
    });
    if (!okay) return;

    setCloudSyncStatus('syncing');
    const res = await sirenApi.deleteBell(id, targetBell?.label);
    if (res?.queued) {
      setCloudSyncStatus('queued');
    } else {
      setCloudSyncStatus('synced');
      setLastSyncedAt(Date.now());
    }
    showToast("Scheduled bell deleted from Supabase", "info");
  };

  const handleTestRing = async (type: AlarmType | string, label: string) => {
    setCloudSyncStatus('syncing');
    let audioUrl: string | undefined;
    if (typeof type === 'string' && type.startsWith('recorded:')) {
      const audioId = type.split(':')[1];
      const targetRec = recordedAudios.find(r => r.id === audioId);
      audioUrl = targetRec?.audioUrl || targetRec?.base64;
    }

    const payload = {
      type,
      label: `${label} (Manual Playback Test)`,
      customMsg: `Testing active timetable ring chime. Confirm intercom is functioning properly.`,
      isDrill: true,
      triggeredBy: user?.fullName || user?.username || 'Administrator (Manual Test)',
      timestamp: Date.now(),
      ...(audioUrl ? { audioUrl } : {})
    };

    const testLog: AlertLog = {
      id: `LOG-TEST-${Date.now()}`,
      type,
      label: `${label} (Playback Test)`,
      customMsg: payload.customMsg,
      isDrill: true,
      triggeredBy: user?.fullName || user?.username || 'Administrator',
      role: user?.role || 'admin',
      timestamp: Date.now()
    };

    const res = await sirenApi.triggerBroadcast({
      broadcast: payload,
      logEntry: testLog
    });

    if (res?.queued) {
      setCloudSyncStatus('queued');
    } else {
      setCloudSyncStatus('synced');
      setLastSyncedAt(Date.now());
    }
    showToast(`Simulating ring chime for "${label}" across campus devices`, "info");
  };

  // Strobe effect tracking
  const strobeIntervalRef = useRef<any>(null);

  // Sync logs reactively from Dexie settings (`sirenLogs`) with fallback to localStorage
  const dbLogsSetting = settingsArray.find(s => s.key === 'sirenLogs');
  useEffect(() => {
    if (dbLogsSetting && Array.isArray(dbLogsSetting.value)) {
      setLogs(dbLogsSetting.value);
      try {
        localStorage.setItem('esepa_siren_logs', JSON.stringify(dbLogsSetting.value.slice(0, 250)));
      } catch (e) {}
    } else {
      const savedLogs = localStorage.getItem('esepa_siren_logs');
      if (savedLogs) {
        try {
          setLogs(JSON.parse(savedLogs));
        } catch (e) {
          console.error("Failed to parse siren logs:", e);
        }
      }
    }
  }, [dbLogsSetting]);

  // Hydrate Siren Console state from Supabase on mount and migrate any local-only records
  const handleCloudSync = async (silent = false) => {
    setCloudSyncStatus('syncing');
    try {
      const remoteState = await sirenApi.getState();
      const localBellsEntry = await db.settings.where('key').equals('bellSchedule').first();
      const localRecsEntry = await db.settings.where('key').equals('recordedAudioList').first();
      const localLogsEntry = await db.settings.where('key').equals('sirenLogs').first();
      const localVolEntry = await db.settings.where('key').equals('acousticVolume').first();

      let localLogs: any[] = Array.isArray(localLogsEntry?.value) ? localLogsEntry.value : [];
      if (localLogs.length === 0) {
        try {
          const raw = localStorage.getItem('esepa_siren_logs');
          if (raw) localLogs = JSON.parse(raw);
        } catch (e) {}
      }

      const localBells = Array.isArray(localBellsEntry?.value) ? localBellsEntry.value : [];
      const localRecs = Array.isArray(localRecsEntry?.value) ? localRecsEntry.value : [];

      if (remoteState) {
        const remoteBells = Array.isArray(remoteState.sirenBells) ? remoteState.sirenBells : [];
        const remoteRecs = Array.isArray(remoteState.sirenRecordings) ? remoteState.sirenRecordings : [];
        const remoteLogs = Array.isArray(remoteState.sirenLogs) ? remoteState.sirenLogs : [];

        // Check if any local recordings need to be uploaded to Supabase Storage
        for (const rec of localRecs) {
          if (rec && rec.id && rec.base64 && !rec.audioUrl) {
            await sirenApi.saveRecording({ recording: rec });
          }
        }

        // If local has bells, recordings, or logs not yet on server, push merged state
        if (
          (localBells.length > remoteBells.length) ||
          (localRecs.length > remoteRecs.length) ||
          (localLogs.length > remoteLogs.length) ||
          !silent
        ) {
          const syncRes = await sirenApi.syncState({
            sirenBells: localBells.length > 0 ? localBells : remoteBells,
            sirenRecordings: localRecs.length > 0 ? localRecs : remoteRecs,
            sirenLogs: localLogs.length > 0 ? localLogs : remoteLogs,
            acousticVolume: typeof localVolEntry?.value === 'number' ? localVolEntry.value : remoteState.acousticVolume
          });
          if (syncRes?.queued) {
            setCloudSyncStatus('queued');
            if (!silent) showToast("Offline: Siren Console data queued for Supabase sync.", "info");
            return;
          }
        }

        if (remoteState.dbStatus) {
          setDbTableInfo(remoteState.dbStatus);
        } else {
          sirenApi.getDbStatus().then((statusRes) => {
            if (statusRes?.dbStatus) setDbTableInfo(statusRes.dbStatus);
          }).catch(() => {});
        }

        setCloudSyncStatus('synced');
        setLastSyncedAt(remoteState.updatedAt || Date.now());
        if (!silent) {
          showToast("Siren Console synchronized with Supabase Database!", "success");
        }
      } else {
        // Offline or unreachable — queue local state
        setCloudSyncStatus(navigator.onLine ? 'queued' : 'offline');
        if (!silent) {
          showToast("Saved locally. Will sync to Supabase automatically when connection is restored.", "info");
        }
      }
    } catch (err) {
      console.error("Siren cloud sync failed:", err);
      setCloudSyncStatus('offline');
      if (!silent) {
        showToast("Could not reach Supabase server; using local cache.", "error");
      }
    }
  };

  useEffect(() => {
    handleCloudSync(true);
  }, []);

  // Sync active alarm from global broadcast state in db settings
  const activeGlobalBroadcast = settingsArray?.find(s => s.key === 'activeSirenBroadcast')?.value;

  useEffect(() => {
    if (activeGlobalBroadcast) {
      if (activeGlobalBroadcast.type !== activeAlarm) {
        setActiveAlarm(activeGlobalBroadcast.type);
        setCustomAnnouncement(activeGlobalBroadcast.customMsg || '');
        setIsDrill(activeGlobalBroadcast.isDrill || false);
      }
    } else {
      if (activeAlarm) {
        setActiveAlarm(null);
      }
    }
  }, [activeGlobalBroadcast]);

  // Handle strobe lighting updates
  useEffect(() => {
    if (activeAlarm) {
      const config = ALARM_TYPES.find(a => a.id === activeAlarm);
      if (config) {
        const colors = config.strobeColors;
        let index = 0;
        strobeIntervalRef.current = setInterval(() => {
          setActiveStrobeColor(colors[index % colors.length]);
          setPulseCount(p => p + 1);
          index++;
        }, activeAlarm === 'lockdown' ? 400 : activeAlarm === 'fire' ? 280 : 600);
      }
    } else {
      if (strobeIntervalRef.current) {
        clearInterval(strobeIntervalRef.current);
      }
      setActiveStrobeColor('transparent');
      setPulseCount(0);
    }

    return () => {
      if (strobeIntervalRef.current) clearInterval(strobeIntervalRef.current);
    };
  }, [activeAlarm]);

  // Live volume adjust slider saved to IndexedDb settings + debounced to Supabase
  const handleVolumeChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    const existing = await db.settings.where('key').equals('acousticVolume').first();
    if (existing) {
      await db.settings.update(existing.id!, { value: val });
    } else {
      await db.settings.add({ key: 'acousticVolume', value: val });
    }

    if (volumeSaveTimerRef.current) {
      clearTimeout(volumeSaveTimerRef.current);
    }
    volumeSaveTimerRef.current = setTimeout(async () => {
      const res = await sirenApi.saveSettings({ acousticVolume: val });
      if (!res?.queued) {
        setCloudSyncStatus('synced');
        setLastSyncedAt(Date.now());
      }
    }, 600);
  };

  // Trigger Campus-Wide Broadcast & Save to Supabase
  const handleTriggerAlarm = async (type: AlarmType) => {
    const config = ALARM_TYPES.find(a => a.id === type)!;

    // For critical lockdown/fire alarms, enforce confirmation modal
    if (config.severity === 'critical') {
      const isConfirmed = await confirm({
        title: `EMERGENCY ALARM TRIGGER: ${config.label.toUpperCase()}`,
        message: `Are you sure you want to sound the "${config.label}" alarm campus-wide? This will broadcast visual warning alerts and activate acoustic synthesizers across all connected school devices via Supabase.`,
        confirmLabel: `Activate ${config.label}`
      });
      if (!isConfirmed) return;
    }

    try {
      setCloudSyncStatus('syncing');
      const broadcastValue = {
        type,
        label: config.label,
        customMsg: customAnnouncement.trim(),
        isDrill,
        triggeredBy: user?.fullName || user?.username || 'Administrator',
        timestamp: Date.now()
      };

      const newLog: AlertLog = {
        id: `LOG-${Date.now()}`,
        type,
        label: config.label,
        customMsg: customAnnouncement.trim() || 'Standard broadcast triggered.',
        isDrill,
        triggeredBy: user?.fullName || user?.username || 'Elena (Admin)',
        role: user?.role || 'admin',
        timestamp: Date.now()
      };

      const updatedLogs = [newLog, ...logs].slice(0, 250);
      setLogs(updatedLogs);
      localStorage.setItem('esepa_siren_logs', JSON.stringify(updatedLogs));
      setActiveAlarm(type);

      const res = await sirenApi.triggerBroadcast({
        broadcast: broadcastValue,
        logEntry: newLog
      });

      if (res?.queued) {
        setCloudSyncStatus('queued');
        showToast(`Activated Warning: ${config.label} (queued for Supabase sync)`, 'info');
      } else {
        setCloudSyncStatus('synced');
        setLastSyncedAt(Date.now());
        showToast(`Activated Global Warning: ${config.label} across all campus devices!`, 'success');
      }
    } catch (err) {
      console.error(err);
      setCloudSyncStatus('offline');
      showToast('Failed to trigger alert.', 'error');
    }
  };

  // Squelch active globally across all devices & Supabase
  const handleStopAlarm = async () => {
    try {
      setCloudSyncStatus('syncing');
      const stopLog: AlertLog = {
        id: `LOG-STOP-${Date.now()}`,
        type: 'allclear',
        label: 'All Sirens Squelched [STOP]',
        customMsg: 'Active campus alarm and intercom broadcast terminated by administrator.',
        isDrill,
        triggeredBy: user?.fullName || user?.username || 'Administrator',
        role: user?.role || 'admin',
        timestamp: Date.now()
      };

      setActiveAlarm(null);
      setCustomAnnouncement('');
      setIsDrill(false);

      const res = await sirenApi.squelch({ logEntry: stopLog });
      if (res?.queued) {
        setCloudSyncStatus('queued');
      } else {
        setCloudSyncStatus('synced');
        setLastSyncedAt(Date.now());
      }

      showToast('All campus siren alarms deactivated across all devices & saved to Supabase.', 'info');
    } catch (err) {
      console.error(err);
      showToast('Failed to stop alarm.', 'error');
    }
  };

  const handleClearLogs = async () => {
    const isConfirmed = await confirm({
      title: "Clear Security & Broadcast Logs?",
      message: "Are you sure you want to permanently delete all historic campus security drill and alarm logs from Supabase and local storage?",
      confirmLabel: "Clear All Logs"
    });
    if (!isConfirmed) return;

    setCloudSyncStatus('syncing');
    setLogs([]);
    localStorage.removeItem('esepa_siren_logs');
    const res = await sirenApi.clearLogs();
    if (res?.queued) {
      setCloudSyncStatus('queued');
    } else {
      setCloudSyncStatus('synced');
      setLastSyncedAt(Date.now());
    }
    showToast('Security logs wiped from Supabase & local cache.', 'info');
  };

  const getSeverityBadgeClass = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-rose-50 border border-rose-200 text-rose-700';
      case 'warning': return 'bg-amber-50 border border-amber-200 text-amber-700';
      case 'info': return 'bg-indigo-50 border border-indigo-200 text-indigo-700';
      case 'success': return 'bg-emerald-50 border border-emerald-200 text-emerald-700';
      default: return 'bg-slate-50 border border-slate-200 text-slate-700';
    }
  };

  return (
    <div className="space-y-6 select-none relative pb-12">
      {/* Full layout ambient strobe border for active alerts */}
      {activeAlarm && (
        <div 
          className="fixed inset-0 pointer-events-none transition-colors duration-200 z-50 mix-blend-color"
          style={{ 
            backgroundColor: activeStrobeColor,
            border: `12px solid ${activeStrobeColor}`
          }}
        />
      )}

      {/* Header section with live animation */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6 relative overflow-hidden">
        {activeAlarm && (
          <div className="absolute right-0 top-0 bottom-0 w-32 bg-gradient-to-l from-red-500/10 to-transparent flex items-center justify-end pr-8 pointer-events-none">
            <Radio className="w-12 h-12 text-rose-500 animate-ping absolute" />
            <Radio className="w-12 h-12 text-rose-600/70" />
          </div>
        )}
        <div className="space-y-1 relative z-10">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="p-2 rounded-xl bg-indigo-50 border border-indigo-100/80 text-indigo-600 block">
              <Megaphone className="w-6 h-6" />
            </span>
            <span className="text-xs font-black tracking-widest text-indigo-600 uppercase">Emergency Alert Console</span>
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${
              cloudSyncStatus === 'synced' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
              cloudSyncStatus === 'syncing' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' :
              cloudSyncStatus === 'queued' ? 'bg-amber-50 text-amber-700 border-amber-200' :
              'bg-slate-100 text-slate-600 border-slate-200'
            }`}>
              <Database className={`w-3 h-3 ${cloudSyncStatus === 'syncing' ? 'animate-spin' : ''}`} />
              {cloudSyncStatus === 'synced' ? 'Supabase Cloud Synced' :
               cloudSyncStatus === 'syncing' ? 'Syncing with Supabase...' :
               cloudSyncStatus === 'queued' ? 'Queued for Supabase Sync' :
               'Local Cache Mode'}
            </span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight pt-1">
            CAMPUS-WIDE SIREN & BROADCAST
          </h2>
          <p className="text-slate-500 text-sm max-w-2xl font-medium pt-1">
            Emergency warning & PA intercom console backed by Supabase Database & Cloud Storage. Sound lockdowns, automate timetable period bells, record voice broadcasts, and synchronize logs across all school devices.
          </p>
          {lastSyncedAt && (
            <p className="text-[11px] font-bold text-slate-400 pt-0.5">
              Last synced with Supabase server: {new Date(lastSyncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </p>
          )}
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={async () => {
              setShowDbTablesModal(!showDbTablesModal);
              if (!dbTableInfo) {
                try {
                  const res = await sirenApi.getDbStatus();
                  if (res?.dbStatus) setDbTableInfo(res.dbStatus);
                } catch {}
              }
            }}
            className="px-3.5 py-3 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 font-extrabold text-xs rounded-xl transition-all flex items-center justify-center gap-2 shadow-2xs"
            title="Inspect connected Supabase tables for the Siren Console"
          >
            <Database className="w-4 h-4 text-emerald-600" />
            Supabase Tables
          </button>

          <button
            type="button"
            onClick={() => handleCloudSync(false)}
            disabled={cloudSyncStatus === 'syncing'}
            className="px-3.5 py-3 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-extrabold text-xs rounded-xl transition-all flex items-center justify-center gap-2 shadow-2xs disabled:opacity-60"
            title="Synchronize all triggers, bell schedules, recordings, and logs with Supabase"
          >
            <RefreshCcw className={`w-4 h-4 text-indigo-600 ${cloudSyncStatus === 'syncing' ? 'animate-spin' : ''}`} />
            Sync Cloud
          </button>

          {activeAlarm ? (
            <button
              id="deactivate-siren"
              onClick={handleStopAlarm}
              className="px-6 py-4 bg-red-600 hover:bg-red-700 text-white font-extrabold text-sm rounded-xl transition-all shadow-lg shadow-red-600/20 active:scale-95 flex items-center justify-center gap-2 group animate-pulse"
            >
              <VolumeX className="w-5 h-5 group-hover:scale-110 transition-transform" />
              SQUELCH ALL SIRENS [STOP]
            </button>
          ) : (
            <div className="flex items-center gap-2.5 bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl">
              <span className="h-3 w-3 rounded-full bg-emerald-500 border border-emerald-300 animate-pulse" />
              <span className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">Campus Secure & Safe</span>
            </div>
          )}
        </div>
      </div>

      {/* Connected Supabase Tables Inspector & Provisioning Panel */}
      <AnimatePresence>
        {showDbTablesModal && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-slate-900 text-white border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-lg space-y-4"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-sm font-black uppercase tracking-wider text-emerald-400 flex items-center gap-2">
                  <Database className="w-4 h-4" />
                  Connected Supabase Database Tables & Storage (Siren Console)
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  All Siren triggers, period bell timetables, recorded voice announcements, and audit logs are persisted to these Supabase resources via the Express server.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  disabled={isProvisioningTables}
                  onClick={async () => {
                    setIsProvisioningTables(true);
                    try {
                      const res = await sirenApi.provisionTables();
                      if (res?.dbStatus) setDbTableInfo(res.dbStatus);
                      await handleCloudSync(true);
                      showToast("Siren Console tables seeded and synchronized with Supabase!", "success");
                    } catch (e: any) {
                      showToast(e?.message || "Failed to provision Siren Console tables", "error");
                    } finally {
                      setIsProvisioningTables(false);
                    }
                  }}
                  className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs rounded-lg transition-all disabled:opacity-50"
                >
                  {isProvisioningTables ? 'Seeding & Syncing...' : 'Seed & Verify Tables'}
                </button>
                {dbTableInfo?.sqlMigration && (
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(dbTableInfo.sqlMigration);
                      showToast("Copied Siren Console SQL schema to clipboard (run in Supabase SQL Editor if needed).", "info");
                    }}
                    className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-lg border border-slate-700 transition-all"
                  >
                    Copy SQL Schema
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowDbTablesModal(false)}
                  className="px-2.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white font-bold text-xs rounded-lg"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
              <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-3.5 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-emerald-400">public.broadcasts</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-500/20 text-emerald-300">
                    {dbTableInfo?.tables?.broadcasts !== false ? 'Connected' : 'Ready'}
                  </span>
                </div>
                <p className="text-slate-400 text-[11px]">
                  Stores live emergency sirens, lockdowns, drills, PA broadcasts, and active status across devices.
                </p>
              </div>

              <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-3.5 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-emerald-400">public.school_settings</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-500/20 text-emerald-300">
                    {dbTableInfo?.tables?.school_settings !== false ? 'Connected' : 'Ready'}
                  </span>
                </div>
                <p className="text-slate-400 text-[11px]">
                  Persists <code className="text-slate-200">streams.siren_console</code> (period bell schedule, recordings list, volume & mute state).
                </p>
              </div>

              <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-3.5 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-emerald-400">timetable_entries / periods</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-500/20 text-emerald-300">
                    2-Way Linked
                  </span>
                </div>
                <p className="text-slate-400 text-[11px]">
                  Two-way synchronized with School Timetable class slots, break/recess chimes, and dismissal bells.
                </p>
              </div>

              <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-3.5 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-emerald-400">public.audit_logs</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-500/20 text-emerald-300">
                    {dbTableInfo?.tables?.audit_logs !== false ? 'Connected' : 'Ready'}
                  </span>
                </div>
                <p className="text-slate-400 text-[11px]">
                  Records every siren trigger, squelch event, timetable update, and audio recording action.
                </p>
              </div>

              <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-3.5 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-emerald-400">storage: siren-audio</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-500/20 text-emerald-300">
                    {dbTableInfo?.storageBucketSirenAudio !== false ? 'Active Bucket' : 'Auto-Created'}
                  </span>
                </div>
                <p className="text-slate-400 text-[11px]">
                  Supabase Cloud Storage bucket hosting recorded voice announcements and custom bell chime files.
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Active Siren Banner Broadcast Visual */}
      <AnimatePresence>
        {activeAlarm && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={`border rounded-2xl p-6 relative overflow-hidden shadow-md flex flex-col md:flex-row items-center justify-between gap-6 ${
              activeAlarm === 'lockdown' ? 'bg-red-50 border-red-200 text-red-900' :
              activeAlarm === 'fire' ? 'bg-orange-50 border-orange-200 text-orange-900' :
              activeAlarm === 'weather' ? 'bg-amber-50 border-amber-200 text-amber-900' :
              activeAlarm === 'allclear' ? 'bg-emerald-50 border-emerald-200 text-emerald-950' :
              'bg-indigo-50 border-indigo-200 text-indigo-950'
            }`}
          >
            <div className="flex items-center gap-4">
              <div className={`p-4 rounded-2xl shrink-0 animate-bounce ${
                activeAlarm === 'lockdown' ? 'bg-red-600 text-white shadow-md shadow-red-500/20' :
                activeAlarm === 'fire' ? 'bg-orange-600 text-white shadow-md shadow-orange-500/20' :
                activeAlarm === 'weather' ? 'bg-amber-600 text-white' :
                'bg-indigo-600 text-white'
              }`}>
                <AlertTriangle className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs uppercase font-extrabold tracking-widest px-2.5 py-0.5 rounded-full bg-red-600 text-white animate-pulse">
                    {isDrill ? 'DRILL IN PROGRESS' : 'ACTIVE EMERGENCY'}
                  </span>
                  <span className="text-xs font-bold text-slate-500">
                    Triggered by {activeGlobalBroadcast?.triggeredBy || 'Elena (Admin)'}
                  </span>
                </div>
                <h3 className="text-xl font-black tracking-tight">{activeGlobalBroadcast?.label || 'Active Siren Alert'}</h3>
                <p className="text-sm font-semibold opacity-90 italic">
                  "{activeGlobalBroadcast?.customMsg || 'Attention: Follow safety guidelines and shelter or relocate immediately.'}"
                </p>
              </div>
            </div>

            {/* Synth Acoustic visual waves */}
            <div className="shrink-0 flex items-center gap-6">
              <div className="flex items-end gap-1.5 h-10 w-24">
                {[1, 2, 3, 4, 5, 6, 7].map((bar) => (
                  <div
                    key={bar}
                    className={`w-2.5 rounded-full ${
                      activeAlarm === 'lockdown' ? 'bg-red-600' :
                      activeAlarm === 'fire' ? 'bg-orange-600' :
                      'bg-indigo-600'
                    }`}
                    style={{
                      height: `${10 + Math.abs(Math.sin((pulseCount / 2) + bar) * 30)}px`,
                      transition: 'height 0.15s ease-in-out'
                    }}
                  />
                ))}
              </div>

              {/* Individual sound monitor mute */}
              <button
                onClick={() => setIsGloballyMuted(!isGloballyMuted)}
                className="px-4 py-2 text-xs font-black rounded-lg bg-white/80 hover:bg-white text-slate-800 flex items-center gap-1.5 border border-slate-200 shadow-sm"
                title="Silence sound locally inside this tab"
              >
                {isGloballyMuted ? <VolumeX className="w-4 h-4 text-red-650" /> : <Volume2 className="w-4 h-4 text-slate-650" />}
                {isGloballyMuted ? "Unmute Campus Speaker" : "Mute Tab Speaker"}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tab Switcher - Manual Emergency vs Scheduled Timetable Bells */}
      <div className="flex border-b border-slate-250 gap-6 overflow-x-auto pb-1">
        <button
          onClick={() => setActiveSubTab('triggers')}
          className={`pb-3 text-xs sm:text-sm font-extrabold tracking-wider uppercase border-b-2 transition-all flex items-center gap-2 shrink-0 ${
            activeSubTab === 'triggers' 
              ? 'border-indigo-600 text-indigo-600' 
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          <Radio className="w-4 h-4" />
          Active Sirens & Broadcast
        </button>
        <button
          onClick={() => setActiveSubTab('timetable')}
          className={`pb-3 text-xs sm:text-sm font-extrabold tracking-wider uppercase border-b-2 transition-all flex items-center gap-2 shrink-0 ${
            activeSubTab === 'timetable' 
              ? 'border-indigo-600 text-indigo-600' 
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
          id="tab-timetable-bell"
        >
          <Calendar className="w-4 h-4" />
          Period Bell Timetable ({bellSchedule.length})
        </button>
        <button
          onClick={() => setActiveSubTab('recordings')}
          className={`pb-3 text-xs sm:text-sm font-extrabold tracking-wider uppercase border-b-2 transition-all flex items-center gap-2 shrink-0 ${
            activeSubTab === 'recordings' 
              ? 'border-indigo-600 text-indigo-600' 
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
          id="tab-recordings"
        >
          <Mic className="w-4 h-4" />
          Recorded Announcements ({recordedAudios.length})
        </button>
      </div>

      {/* Control Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left 2 cols: Dynamic Tab content (Trigger alarms or Timetable bell schedule) */}
        <div className="lg:col-span-2 space-y-6">
          {activeSubTab === 'triggers' && (
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
              <h3 className="text-md font-black text-slate-950 uppercase tracking-wider flex items-center gap-2">
                <Radio className="w-5 h-5 text-indigo-600" />
                1. Construct Alarm Settings & Announcements
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-extrabold text-slate-500 uppercase tracking-widest">
                    Custom Broadcast Message (Appears visual everywhere)
                  </label>
                  <textarea
                    value={customAnnouncement}
                    onChange={(e) => setCustomAnnouncement(e.target.value)}
                    placeholder="e.g. Active Lockdown Drill. Complete security protocols, locked doors, clear the hallways."
                    className="w-full h-24 border border-slate-200 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 resize-none font-medium text-slate-800"
                  />
                </div>

                <div className="flex flex-col justify-between p-4 bg-slate-50 border border-slate-100 rounded-2xl gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-extrabold text-slate-500 uppercase tracking-widest">Acoustic Audio Settings</span>
                      <span className="text-xs font-mono font-bold text-slate-600">{Math.round(acousticVolume * 100)}% volume</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <Volume2 className="w-4 h-4 text-slate-400" />
                      <input 
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={acousticVolume}
                        onChange={handleVolumeChange}
                        className="w-full accent-indigo-600 h-1.5 bg-slate-200 rounded-lg cursor-pointer"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between border-t border-slate-200/60 pt-3">
                    <div className="space-y-0.5">
                      <span className="text-xs font-extrabold text-slate-800">Trigger as Drill/Simulation</span>
                      <p className="text-[10px] text-slate-500">Will mark the alarm header clearly as a school safety drill.</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="sr-only peer"
                        checked={isDrill}
                        onChange={(e) => setIsDrill(e.target.checked)}
                      />
                      <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                    </label>
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100 space-y-4">
                <span className="text-xs font-extrabold text-slate-500 uppercase tracking-widest block">
                  2. Tap Trigger to broadcast & Play sound
                </span>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {ALARM_TYPES.map((alarm) => {
                    const Icon = alarm.icon;
                    const isCurrentlyActive = activeAlarm === alarm.id;
                    
                    return (
                      <div 
                        key={alarm.id}
                        className={`border rounded-2xl p-4 flex flex-col justify-between transition-all group ${
                          isCurrentlyActive 
                            ? 'border-red-500 bg-red-50/20 shadow-sm' 
                            : 'border-slate-200/80 hover:border-slate-300 hover:bg-slate-50/50'
                        }`}
                      >
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className={`p-1.5 rounded-lg text-xs leading-none font-bold uppercase ${
                              alarm.id === 'lockdown' ? 'bg-red-100 text-red-700' :
                              alarm.id === 'fire' ? 'bg-orange-100 text-orange-700' :
                              alarm.id === 'weather' ? 'bg-amber-100 text-amber-700' :
                              alarm.id === 'allclear' ? 'bg-emerald-100 text-emerald-700' :
                              'bg-indigo-100 text-indigo-700'
                            }`}>
                              {alarm.severity}
                            </span>
                            
                            {isCurrentlyActive && (
                              <span className="h-2 w-2 rounded-full bg-red-600 animate-ping" />
                            )}
                          </div>
                          <h4 className="text-sm font-black text-slate-900 flex items-center gap-1.5">
                            <Icon className={`w-4 h-4 ${
                              alarm.id === 'lockdown' ? 'text-red-600' :
                              alarm.id === 'fire' ? 'text-orange-600' :
                              'text-slate-500 group-hover:text-indigo-600'
                            }`} />
                            {alarm.label}
                          </h4>
                          <p className="text-xs text-slate-500 leading-relaxed font-medium">
                            {alarm.description}
                          </p>
                        </div>

                        <div className="pt-4 flex items-center gap-2">
                          {isCurrentlyActive ? (
                            <button
                              onClick={handleStopAlarm}
                              className="w-full py-2 bg-slate-900 text-white font-bold text-xs rounded-xl hover:bg-black transition-all flex items-center justify-center gap-1"
                            >
                              <Square className="w-3.5 h-3.5" />
                              Stop Sound
                            </button>
                          ) : (
                            <button
                              onClick={() => handleTriggerAlarm(alarm.id)}
                              className={`w-full py-2 font-black text-xs rounded-xl flex items-center justify-center gap-1 transition-all shadow-sm ${
                                alarm.id === 'lockdown' ? 'bg-red-600 text-white hover:bg-red-700 shadow-red-600/10' :
                                alarm.id === 'fire' ? 'bg-orange-600 text-white hover:bg-orange-700 shadow-orange-600/10' :
                                alarm.id === 'weather' ? 'bg-amber-600 text-white hover:bg-amber-700' :
                                alarm.id === 'allclear' ? 'bg-emerald-600 text-white hover:bg-emerald-700' :
                                'bg-indigo-600 text-white hover:bg-indigo-700'
                              }`}
                            >
                              <Play className="w-3 h-3 fill-current" />
                              ACTIVATE ALARM
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {activeSubTab === 'timetable' && (
            <div className="space-y-6">
              {/* Timetable Header & Two-Way School Timetable Sync Bar */}
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-md font-black text-slate-950 uppercase tracking-wider flex items-center gap-2">
                        <Calendar className="w-5 h-5 text-indigo-600" />
                        Automated Period Bell Timetable
                      </h3>
                      <span className="text-xs font-semibold text-emerald-700">
                        · Connected to School Timetable ({schoolTimetableSlots.length} class slots)
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 font-semibold leading-relaxed">
                      Two-way synchronized with the Academic School Timetable. Period start bells, break/recess chimes, and dismissal bells update automatically across campus.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleSyncSchoolTimetable(false)}
                      disabled={isSyncingTimetable}
                      className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-xl transition-all flex items-center gap-1.5 whitespace-nowrap disabled:opacity-60"
                      title="Two-way sync period start bells, break chimes, and dismissal bell with the School Timetable"
                      type="button"
                    >
                      <RefreshCcw className={`w-3.5 h-3.5 ${isSyncingTimetable ? 'animate-spin' : ''}`} />
                      {isSyncingTimetable ? 'Syncing Timetable...' : 'Sync School Timetable'}
                    </button>

                    <button
                      onClick={handleSeedDefaults}
                      className="px-3.5 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl transition-all whitespace-nowrap"
                      title="Reset timetable bells back to standard Ghanaian period templates"
                      type="button"
                    >
                      Use Templates
                    </button>

                    <button
                      onClick={() => {
                        setBellEditingId(null);
                        setBellLabel('');
                        setBellTime('08:00');
                        setBellEndTime('08:45');
                        setBellCategory('period_start');
                        setBellDays(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']);
                        setBellTone('bell');
                        setIsFormOpen(!isFormOpen);
                      }}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all shadow-md shadow-indigo-600/15 flex items-center gap-1.5 whitespace-nowrap"
                      type="button"
                    >
                      <Plus className="w-4 h-4" />
                      {isFormOpen ? 'Minimize Form' : 'Add Chime'}
                    </button>
                  </div>
                </div>

                {/* Live Active Period & Next Bell Status Strip */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 border-t border-slate-100">
                  <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl flex items-center justify-between">
                    <div className="space-y-0.5">
                      <span className="text-[11px] font-bold text-slate-500">Campus Clock · {currentWeekdayName}</span>
                      <div className="font-mono tabular-nums text-base font-black text-slate-900">
                        {liveNow.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                    <Clock className="w-5 h-5 text-slate-400" />
                  </div>

                  <div className={`p-3.5 border rounded-xl flex items-center justify-between ${
                    activePeriodBell
                      ? 'bg-emerald-50/70 border-emerald-200'
                      : 'bg-slate-50 border-slate-200/80'
                  }`}>
                    <div className="space-y-0.5 min-w-0">
                      <span className="text-[11px] font-bold text-emerald-700">
                        {activePeriodBell ? 'Active Period Now' : 'Current Campus Status'}
                      </span>
                      <div className="text-xs font-black text-slate-900 truncate">
                        {activePeriodBell
                          ? `${activePeriodBell.label} (${activePeriodBell.time} – ${activePeriodBell.endTime})`
                          : 'Between Scheduled Periods'}
                      </div>
                    </div>
                    {activePeriodBell && (
                      <span className="h-2.5 w-2.5 rounded-full bg-emerald-600 animate-ping shrink-0 ml-2" />
                    )}
                  </div>

                  <div className="p-3.5 bg-indigo-50/60 border border-indigo-100 rounded-xl flex items-center justify-between">
                    <div className="space-y-0.5 min-w-0">
                      <span className="text-[11px] font-bold text-indigo-700">Next Scheduled Chime</span>
                      <div className="text-xs font-black text-slate-900 truncate font-mono tabular-nums">
                        {nextUpcomingBellToday
                          ? `${nextUpcomingBellToday.time} · ${nextUpcomingBellToday.label}`
                          : 'All Today’s Bells Completed'}
                      </div>
                    </div>
                    <Bell className="w-4 h-4 text-indigo-600 shrink-0 ml-2" />
                  </div>
                </div>
              </div>

              {/* Form Expandable */}
              <AnimatePresence>
                {isFormOpen && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <form 
                      onSubmit={handleSaveBell}
                      className="bg-slate-50 border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-4"
                    >
                      <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest flex items-center gap-1.5 border-b border-slate-200 pb-2">
                        <Plus className="w-4 h-4 text-indigo-600" />
                        {bellEditingId ? 'Modifying Registered Period Ring' : 'Add New Automatic Timetable Bell Alert'}
                      </h4>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                        <div className="space-y-1.5 lg:col-span-2">
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">
                            Ring Chime Label
                          </label>
                          <input
                            type="text"
                            value={bellLabel}
                            onChange={(e) => setBellLabel(e.target.value)}
                            placeholder="e.g. Period 1 Start or Morning Break"
                            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-semibold text-slate-800 bg-white"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">
                            Bell Event Type
                          </label>
                          <select
                            value={bellCategory}
                            onChange={(e) => {
                              const nextCat = e.target.value as 'period_start' | 'break' | 'dismissal' | 'assembly';
                              setBellCategory(nextCat);
                              if (nextCat === 'break') setBellTone('allclear');
                              else if (nextCat === 'period_start' || nextCat === 'dismissal') setBellTone('bell');
                            }}
                            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-semibold text-slate-800 bg-white"
                          >
                            <option value="period_start">Period Start Bell</option>
                            <option value="break">Break / Recess Chime</option>
                            <option value="dismissal">School Dismissal Bell</option>
                            <option value="assembly">Morning Assembly</option>
                          </select>
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">
                            Start & End Time
                          </label>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="time"
                              value={bellTime}
                              required
                              onChange={(e) => setBellTime(e.target.value)}
                              className="w-full border border-slate-200 rounded-xl px-2.5 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-mono tabular-nums font-semibold text-slate-800 bg-white"
                            />
                            <span className="text-xs text-slate-400">–</span>
                            <input
                              type="time"
                              value={bellEndTime}
                              onChange={(e) => setBellEndTime(e.target.value)}
                              className="w-full border border-slate-200 rounded-xl px-2.5 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-mono tabular-nums font-semibold text-slate-800 bg-white"
                            />
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">
                            Intercom Siren Chime Sound
                          </label>
                          <select
                            value={bellTone}
                            onChange={(e) => setBellTone(e.target.value)}
                            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-semibold text-slate-800 bg-white"
                          >
                            <optgroup label="Core Alarm Sirens & Chimes">
                              <option value="bell">Standard Period Bell Strike</option>
                              <option value="allclear">Musical Comfort Chord (Recess/Play)</option>
                              <option value="weather">Severe Weather Warning Drone</option>
                              <option value="fire">Piercing Emergency Sweep (Fire Alert)</option>
                            </optgroup>
                            {recordedAudios.length > 0 && (
                              <optgroup label="Your Custom Recorded Announcements">
                                {recordedAudios.map(audio => (
                                  <option key={audio.id} value={`recorded:${audio.id}`}>
                                    {audio.name}
                                  </option>
                                ))}
                              </optgroup>
                            )}
                          </select>
                        </div>
                      </div>

                      {/* Weekday Selection checkboxes */}
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">
                          Trigger on Weekdays
                        </label>
                        <div className="flex flex-wrap gap-1.5">
                          {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((day) => {
                            const isChecked = bellDays.includes(day);
                            return (
                              <button
                                type="button"
                                key={day}
                                onClick={() => {
                                  if (isChecked) {
                                    setBellDays(bellDays.filter(d => d !== day));
                                  } else {
                                    setBellDays([...bellDays, day]);
                                  }
                                }}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                                  isChecked 
                                    ? 'bg-indigo-600 border-indigo-600 text-white' 
                                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                                }`}
                              >
                                {day.slice(0, 3)}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200/60">
                        <button
                          type="button"
                          onClick={() => {
                            setIsFormOpen(false);
                            setBellEditingId(null);
                          }}
                          className="px-4 py-2 hover:bg-slate-200 text-slate-600 text-xs font-black uppercase tracking-wider rounded-xl transition-all"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all shadow-md shadow-indigo-600/10"
                        >
                          {bellEditingId ? 'Save Changes' : 'Register Chime'}
                        </button>
                      </div>
                    </form>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Empty State Seed prompt */}
              {bellSchedule.length === 0 && (
                <div className="text-center py-12 bg-white border border-slate-100 rounded-2xl p-8">
                  <Calendar className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <h3 className="text-sm font-black text-slate-800 uppercase tracking-wide">No scheduled timetabled rings configured</h3>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto mt-2 leading-relaxed">
                    Sync directly with your School Timetable to generate period start bells, break chimes, and dismissal bells automatically, or load standard templates.
                  </p>
                  <div className="mt-4 flex items-center justify-center gap-3">
                    <button
                      onClick={() => handleSyncSchoolTimetable(false)}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all inline-flex items-center gap-1.5"
                      type="button"
                    >
                      <RefreshCcw className="w-4 h-4" />
                      Sync School Timetable
                    </button>
                    <button
                      onClick={handleSeedDefaults}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all shadow-md shadow-indigo-600/10 inline-flex items-center gap-1.5"
                      type="button"
                    >
                      <Plus className="w-4 h-4" />
                      Pre-load Standard Period Bells
                    </button>
                  </div>
                </div>
              )}

              {/* Scheduled Bells List */}
              {bellSchedule.length > 0 && (
                <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 shadow-sm space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                    <div className="space-y-0.5">
                      <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest">
                        Registered Time Schedule Run ({bellSchedule.length} bells)
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        Showing linked classes & subjects from the School Timetable for each period bell
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                        <button
                          type="button"
                          onClick={() => setClassDayFilter('today')}
                          className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-colors whitespace-nowrap ${
                            classDayFilter === 'today'
                              ? 'bg-white text-slate-900 shadow-2xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          Today ({currentWeekdayName.slice(0, 3)})
                        </button>
                        <button
                          type="button"
                          onClick={() => setClassDayFilter('all')}
                          className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-colors whitespace-nowrap ${
                            classDayFilter === 'all'
                              ? 'bg-white text-slate-900 shadow-2xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          All Week
                        </button>
                      </div>

                      <div className="text-[10px] font-bold text-slate-500 flex items-center gap-1 whitespace-nowrap">
                        <span className="h-1.5 w-1.5 bg-emerald-500 rounded-full animate-ping" />
                        Active & Armed
                      </div>
                    </div>
                  </div>

                  <div className="divide-y divide-slate-100">
                    {bellSchedule.map((b) => {
                      const isActiveNow = activePeriodBell?.id === b.id;
                      const isNextBell = !isActiveNow && nextUpcomingBellToday?.id === b.id;
                      const allLinkedSlots = Array.isArray(b.linkedSlots) ? b.linkedSlots : [];
                      const filteredLinkedSlots =
                        classDayFilter === 'today' && ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].includes(currentWeekdayName)
                          ? allLinkedSlots.filter((s) => s.day === currentWeekdayName)
                          : allLinkedSlots;
                      const displaySlots = filteredLinkedSlots.length > 0 ? filteredLinkedSlots : allLinkedSlots;

                      const categoryLabel =
                        b.category === 'break'
                          ? 'Break / Recess'
                          : b.category === 'dismissal'
                          ? 'School Dismissal'
                          : b.category === 'assembly'
                          ? 'Morning Assembly'
                          : 'Period Start';

                      return (
                        <div 
                          key={b.id}
                          className={`py-4 px-3 -mx-3 rounded-xl flex flex-col gap-3 transition-colors ${
                            isActiveNow
                              ? 'bg-emerald-50/60 border border-emerald-200/80'
                              : isNextBell
                              ? 'bg-indigo-50/40'
                              : b.enabled
                              ? 'opacity-100 hover:bg-slate-50/60'
                              : 'opacity-60 bg-slate-50/20'
                          }`}
                        >
                          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div className="flex items-start sm:items-center gap-3.5 min-w-0">
                              {/* Clock Block */}
                              <div className={`px-3.5 py-2 rounded-xl flex flex-col items-center justify-center shrink-0 shadow-2xs border ${
                                isActiveNow
                                  ? 'bg-emerald-700 text-white border-emerald-600'
                                  : b.category === 'break'
                                  ? 'bg-amber-600 text-white border-amber-500'
                                  : b.category === 'dismissal'
                                  ? 'bg-rose-700 text-white border-rose-600'
                                  : 'bg-slate-900 text-white border-slate-800'
                              }`}>
                                <span className="font-mono tabular-nums text-xs sm:text-sm font-black tracking-tight">{b.time}</span>
                                {b.endTime && (
                                  <span className="font-mono tabular-nums text-[9px] font-semibold opacity-80">
                                    to {b.endTime}
                                  </span>
                                )}
                              </div>

                              <div className="space-y-1 min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <h5 className="text-sm font-black text-slate-900 truncate">
                                    {b.label}
                                  </h5>
                                  {isActiveNow && (
                                    <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700">
                                      · ACTIVE PERIOD NOW
                                    </span>
                                  )}
                                  {isNextBell && (
                                    <span className="text-[10px] font-black uppercase tracking-wider text-indigo-600">
                                      · NEXT BELL TODAY
                                    </span>
                                  )}
                                </div>

                                {/* Clean unboxed metadata row */}
                                <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 font-semibold">
                                  <span className={
                                    b.category === 'break' ? 'text-amber-700 font-bold' :
                                    b.category === 'dismissal' ? 'text-rose-700 font-bold' :
                                    'text-indigo-700 font-bold'
                                  }>
                                    {categoryLabel}
                                  </span>
                                  <span aria-hidden="true">·</span>
                                  <span>
                                    Tone: {b.alarmType.startsWith('recorded:') ? 'Recorded Voice Announcement' : b.alarmType}
                                  </span>
                                  <span aria-hidden="true">·</span>
                                  <span>
                                    {b.days.map((d: string) => d.slice(0, 3)).join(', ')}
                                  </span>
                                  {allLinkedSlots.length > 0 && (
                                    <>
                                      <span aria-hidden="true">·</span>
                                      <span className="text-emerald-700 font-bold tabular-nums">
                                        {allLinkedSlots.length} scheduled {allLinkedSlots.length === 1 ? 'class' : 'classes'}
                                      </span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Actions bar for each row */}
                            <div className="flex items-center justify-end gap-2.5 self-end md:self-auto shrink-0">
                              <div className="flex items-center gap-1.5 mr-2">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                  {b.enabled ? 'Armed' : 'Disarmed'}
                                </span>
                                <label className="relative inline-flex items-center cursor-pointer">
                                  <input 
                                    type="checkbox" 
                                    className="sr-only peer"
                                    checked={b.enabled}
                                    onChange={() => handleToggleBell(b.id)}
                                  />
                                  <div className="w-10 h-5.5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4.5 after:w-4.5 after:transition-all peer-checked:bg-indigo-600"></div>
                                </label>
                              </div>

                              <button
                                onClick={() => handleTestRing(b.alarmType, b.label)}
                                className="p-1 px-2 text-xs font-extrabold bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 rounded-lg transition-all inline-flex items-center gap-1 text-[11px] whitespace-nowrap"
                                title="Strike this chime now over active intercom speakers for testing"
                                type="button"
                              >
                                <Volume2 className="w-3.5 h-3.5" />
                                Test Ring
                              </button>

                              <button 
                                onClick={() => handleStartEditBell(b)}
                                className="p-1.5 bg-slate-50 hover:bg-slate-100 text-slate-500 hover:text-indigo-600 border border-slate-200 rounded-lg transition-all"
                                title="Edit Bell Chime Details"
                                type="button"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>

                              <button 
                                onClick={() => handleDeleteBell(b.id)}
                                className="p-1.5 bg-slate-50 hover:bg-red-50 text-slate-500 hover:text-red-650 border border-slate-200 hover:border-red-200 rounded-lg transition-all"
                                title="Remove Period from Timetable"
                                type="button"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          {/* Linked School Timetable Classes & Subjects Row */}
                          {displaySlots.length > 0 && (
                            <div className="pl-0 sm:pl-16 pt-2 border-t border-slate-100">
                              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-600">
                                <span className="text-[11px] font-bold text-slate-400">
                                  {filteredLinkedSlots.length > 0 && classDayFilter === 'today'
                                    ? `${currentWeekdayName} Classes:`
                                    : 'Scheduled Classes:'}
                                </span>
                                {displaySlots.slice(0, 6).map((slot, sIdx) => (
                                  <span key={`${slot.id}-${sIdx}`} className="inline-flex items-center gap-1 text-xs">
                                    <strong className="font-bold text-slate-900">{slot.classId}</strong>
                                    <span>{slot.subjectName}</span>
                                    {slot.teacherName && (
                                      <span className="text-slate-400">({slot.teacherName})</span>
                                    )}
                                    {classDayFilter === 'all' && (
                                      <span className="text-slate-400 font-mono text-[10px]">[{slot.day.slice(0, 3)}]</span>
                                    )}
                                    {sIdx < Math.min(displaySlots.length, 6) - 1 && (
                                      <span className="text-slate-300 ml-2" aria-hidden="true">·</span>
                                    )}
                                  </span>
                                ))}
                                {displaySlots.length > 6 && (
                                  <span className="text-xs font-bold text-indigo-600">
                                    +{displaySlots.length - 6} more classes
                                  </span>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeSubTab === 'recordings' && (
            <div className="space-y-6">
              {/* Header Box */}
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <h3 className="text-md font-black text-slate-950 uppercase tracking-wider flex items-center gap-2">
                      <Mic className="w-5 h-5 text-indigo-600" />
                      Recorded Audio Intercom & Playback
                    </h3>
                    <p className="text-xs text-slate-500 font-semibold leading-relaxed">
                      Record live vocal announcements or upload pre-recorded chimes for campus-wide alerts or scheduled bells.
                    </p>
                  </div>
                </div>

                {/* Practical info banner */}
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex items-start gap-2 text-[11px] text-slate-800 leading-relaxed font-semibold">
                  <span className="text-indigo-600 text-sm"></span>
                  <span>
                    <strong>Voice Intercom Broadcast:</strong> You can record announcements directly from your browser microphone or upload any standard classroom audio message. These custom sounds can then be played live across all client computers instantly or automated through the bell scheduler!
                  </span>
                </div>
              </div>

              {/* Grid: Recorder Panel vs File Uploader */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* 1. Microphone Recorder */}
                <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-sm space-y-4 flex flex-col justify-between">
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
                      <Mic className="text-indigo-600 w-4.5 h-4.5" />
                      <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">Direct Microphone Recorder</h4>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">
                        Recording Title / Name
                      </label>
                      <input
                        type="text"
                        value={newRecordingName}
                        onChange={(e) => setNewRecordingName(e.target.value)}
                        placeholder="e.g. Daily Devotion Broadcast"
                        className="w-full border border-slate-200 rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-semibold text-slate-800"
                        disabled={isRecording}
                      />
                    </div>

                    {isRecording ? (
                      <div className="p-4 bg-red-50 border border-red-100 rounded-xl flex flex-col items-center justify-center space-y-3.5">
                        <div className="flex items-center gap-2">
                          <span className="h-3 w-3 rounded-full bg-red-600 animate-ping" />
                          <span className="text-xs font-black text-red-700 uppercase tracking-widest">RECORDING LIVE AUDIO</span>
                        </div>

                        {/* Animated waveform effect */}
                        <div className="flex items-end justify-center gap-1 h-8 px-4">
                          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((bar) => (
                            <motion.div
                              key={bar}
                              className="w-1 bg-red-500 rounded-full"
                              animate={{
                                height: [8, 28, 14, 32, 8][bar % 5],
                              }}
                              transition={{
                                repeat: Infinity,
                                duration: 0.4 + (bar * 0.05),
                                ease: "easeInOut"
                              }}
                            />
                          ))}
                        </div>

                        <span className="font-mono text-lg font-black text-red-900">
                          {String(Math.floor(recordDuration / 60)).padStart(2, '0')}:
                          {String(recordDuration % 60).padStart(2, '0')} / 01:00
                        </span>
                        
                        <p className="text-[10px] text-red-650 font-bold text-center">
                          Max voice limit 60 seconds. Say your announcement in a clear voice.
                        </p>
                      </div>
                    ) : (
                      <div className="p-6 bg-slate-50 border border-slate-100 border-dashed rounded-xl flex flex-col items-center justify-center text-center space-y-2">
                        <div className="bg-slate-200 text-slate-600 p-2 rounded-full">
                          <Mic className="w-5 h-5" />
                        </div>
                        <p className="text-xs text-slate-500 font-semibold">Microphone Ready</p>
                        <p className="text-[10px] text-slate-400 max-w-[200px]">
                          Click Below to start recording your microphone and save custom audio.
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="pt-4 border-t border-slate-100">
                    {isRecording ? (
                      <button
                        type="button"
                        onClick={stopMicRecording}
                        className="w-full py-3 bg-red-600 hover:bg-red-700 text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-md shadow-red-600/10 flex items-center justify-center gap-1.5"
                      >
                        <Square className="w-4 h-4 fill-current" />
                        Stop and Save Announcement
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={startMicRecording}
                        className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-md shadow-indigo-600/15 flex items-center justify-center gap-1.5"
                      >
                        <Play className="w-4 h-4 fill-current" />
                        Start Voice Recording
                      </button>
                    )}
                  </div>
                </div>

                {/* 2. File Uploader */}
                <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-sm space-y-4 flex flex-col justify-between">
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
                      <Upload className="text-indigo-600 w-4.5 h-4.5" />
                      <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">Upload Pre-recorded File</h4>
                    </div>

                    <p className="text-xs text-slate-500 font-semibold leading-relaxed">
                      Don't want to record right now? Select an existing audio chime (MP3, WAV, OGG, or M4A format) from your local computer storage instead.
                    </p>

                    <div className="border-2 border-dashed border-slate-200 hover:border-indigo-400 rounded-xl p-6 transition-all text-center relative group">
                      <input
                        type="file"
                        accept="audio/*"
                        onChange={handleAudioUpload}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                      <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2 group-hover:text-indigo-600 transition-colors" />
                      <span className="text-xs font-extrabold text-slate-700 block mt-1 hover:text-indigo-600 transition-colors">
                        Choose Audio File
                      </span>
                      <span className="text-[10px] text-slate-400 mt-1 block">
                        Drag and drop files or browse (Max 8MB limit)
                      </span>
                    </div>

                    <div className="text-[10px] text-slate-500 leading-relaxed font-semibold bg-indigo-50/40 p-3 rounded-lg border border-indigo-100/40">
                       <strong>Format Note:</strong> For maximum browser interoperability and loud audio transmission, standard MP3 or high quality WAV files are highly recommended.
                    </div>
                  </div>
                </div>
              </div>

              {/* 3. Audio Records List */}
              <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                    <Megaphone className="w-4 h-4 text-slate-600" />
                    Custom Recorded & Uploaded Libraries ({recordedAudios.length})
                  </h4>
                </div>

                {recordedAudios.length === 0 ? (
                  <div className="text-center py-10">
                    <History className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                    <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">No voice announcements recorded yet</p>
                    <p className="text-[10px] text-slate-400 max-w-[280px] mx-auto mt-1">
                      Start recording above, or import a pre-recorded broadcast bell file to fill this dashboard space.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {recordedAudios.map((item) => {
                      const isPreviewing = previewPlayingId === item.id;
                      return (
                        <div 
                          key={item.id}
                          className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors hover:bg-slate-50/30 px-1"
                        >
                          <div className="flex items-center gap-3">
                            <span className="p-2 bg-indigo-50 border border-indigo-100 rounded-lg text-indigo-700 shrink-0">
                              <Mic className="w-4 h-4" />
                            </span>
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <h5 className="text-sm font-black text-slate-900 leading-snug">
                                  {item.name || item.title}
                                </h5>
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-black uppercase ${
                                  item.audioUrl
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                    : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                                }`}>
                                  <Cloud className="w-2.5 h-2.5" />
                                  {item.audioUrl ? 'Supabase Storage' : 'Supabase DB'}
                                </span>
                              </div>
                              <p className="text-[10px] text-slate-400 font-semibold mt-0.5">
                                Created: {new Date(item.timestamp || Date.now()).toLocaleDateString()} {new Date(item.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                {item.duration ? ` • ${item.duration}s` : ''}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                            {/* Play Preview button */}
                            <button
                              type="button"
                              onClick={() => handlePreviewPlay(item)}
                              className={`p-1.5 px-3 text-xs font-extrabold rounded-lg border transition-all inline-flex items-center gap-1 ${
                                isPreviewing 
                                  ? 'bg-red-50 hover:bg-red-100 border-red-200 text-red-700 font-black' 
                                  : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
                              }`}
                              title={isPreviewing ? "Stop Previewing Locally" : "Listen Preview Locally"}
                            >
                              {isPreviewing ? (
                                <>
                                  <Square className="w-3.5 h-3.5 fill-current" />
                                  Stop Preview
                                </>
                              ) : (
                                <>
                                  <Play className="w-3.5 h-3.5 fill-current" />
                                  Listen Preview
                                </>
                              )}
                            </button>

                            {/* Global Broadcast Broadcast Button */}
                            <button
                              type="button"
                              onClick={() => handleBroadcastRecordedAudio(item)}
                              className="p-1.5 px-3 bg-indigo-600 hover:bg-indigo-700 border border-transparent text-white text-xs font-black uppercase tracking-wider rounded-lg transition-all shadow-sm flex items-center gap-1"
                              title="Broadcast this recorded voice over all active teacher monitors & classroom intercom systems immediately"
                            >
                              <Megaphone className="w-3.5 h-3.5 fill-current" />
                              Broadcast Intercom
                            </button>

                            {/* Delete button */}
                            <button
                              type="button"
                              onClick={() => handleDeleteRecording(item.id, item.name || item.title || 'Recording')}
                              className="p-1.5 bg-slate-50 hover:bg-red-50 text-slate-400 hover:text-red-500 border border-slate-200 hover:border-red-200 rounded-lg transition-all"
                              title="Remove custom audio recording from system"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right 1 col: Alarm Logs and Drills metadata */}
        <div className="space-y-6">
          
          {/* Quick Guide */}
          <div className="bg-gradient-to-br from-indigo-900 to-slate-900 text-white border-0 rounded-2xl p-6 shadow-md relative overflow-hidden">
            <div className="absolute right-0 bottom-0 opacity-15 transform translate-y-12 translate-x-4">
              <ShieldCheck className="w-48 h-48" />
            </div>
            
            <span className="text-[10px] font-black tracking-widest uppercase text-indigo-300">Operational Guide</span>
            <h3 className="text-lg font-black tracking-tight mt-1 mb-2">Campus Security Standard</h3>
            <p className="text-xs text-indigo-100 leading-relaxed font-semibold">
              Warning signals utilize highly-piercing acoustic frequencies built on pure synthesis and Supabase Cloud Storage for recorded intercom broadcasts.
            </p>

            <ul className="mt-4 space-y-2.5 text-xs text-slate-300 font-medium">
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 font-bold">•</span>
                <span>All triggers, period bells, voice recordings, and audit logs are automatically saved to Supabase.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 font-bold">•</span>
                <span>Active emergency states and intercom broadcasts sync across all opened school devices in real time.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 font-bold">•</span>
                <span>Use <strong>"All Clear"</strong> or <strong>"Squelch All Sirens"</strong> to reset active campus alerts safely.</span>
              </li>
            </ul>
          </div>

          {/* Alarm History Log */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-md font-black text-slate-950 uppercase tracking-wider flex items-center gap-2">
                <History className="w-5 h-5 text-indigo-600" />
                Trigger Logs ({logs.length})
              </h3>
              {logs.length > 0 && (
                <button 
                  onClick={handleClearLogs}
                  className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg transition-colors hover:bg-red-50 border border-transparent hover:border-red-100"
                  title="Clear Log History"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>

            {logs.length === 0 ? (
              <div className="text-center py-8 border-2 border-dashed border-slate-100 rounded-xl">
                <History className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">No school warning logs</p>
                <p className="text-[10px] text-slate-400 mt-1">Alert events are captured here and synced to Supabase</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1 no-scrollbar">
                {logs.map((log) => {
                  const alarmConfig = ALARM_TYPES.find(a => a.id === log.type);
                  const Icon = alarmConfig?.icon || AlertTriangle;
                  const logTitle = log.label || log.type || 'Campus Broadcast Event';
                  const logMessage = log.customMsg || log.details || 'Broadcast event logged in Supabase.';
                  const logActor = log.triggeredBy || log.user || 'System';
                  const logRole = log.role || 'admin';
                  const logTimeDisplay = log.timestamp
                    ? new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    : (log.time || '');
                  
                  return (
                    <div 
                      key={log.id}
                      className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl space-y-2 hover:bg-slate-100/50 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${
                          log.isDrill ? 'bg-indigo-50 text-indigo-600 border border-indigo-200' : 'bg-red-50 text-red-600 border border-red-200'
                        }`}>
                          {log.isDrill ? 'Drill Run' : 'Real Event'}
                        </span>
                        <div className="flex items-center gap-1 text-[10px] font-bold text-slate-400">
                          <Clock className="w-3.5 h-3.5" />
                          {logTimeDisplay}
                        </div>
                      </div>

                      <div className="flex items-start gap-2">
                        <span className={`p-1.5 rounded-lg text-slate-800 ${getSeverityBadgeClass(alarmConfig?.severity || 'info')}`}>
                          <Icon className="w-3.5 h-3.5" />
                        </span>
                        <div className="space-y-0.5">
                          <h4 className="text-xs font-black text-slate-900">{logTitle}</h4>
                          <p className="text-[10px] text-slate-500 font-semibold leading-relaxed">
                            "{logMessage}"
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 pt-1.5 border-t border-slate-200/50 mt-1">
                        <User className="w-3 h-3 text-slate-400" />
                        <span className="text-[9px] text-slate-500 font-semibold line-clamp-1">
                          Triggered by {logActor} ({logRole})
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
