import { useState, FormEvent, useMemo, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { motion, AnimatePresence } from 'motion/react';
import LandingPage from './LandingPage';
import landingIllustration from '../assets/images/landing_illustration_1783005854385.jpg';
import { DoodleBackground } from './DoodleBackground';
import { 
  Cpu, 
  Key, 
  Sparkles, 
  ShieldCheck, 
  Shield,
  ArrowRight, 
  Check, 
  Users, 
  Lock, 
  Server, 
  AlertTriangle, 
  CheckCircle2, 
  Activity, 
  RefreshCcw, 
  ArrowLeft, 
  Building, 
  Phone, 
  Mail, 
  MapPin,
  LockKeyhole,
  Terminal,
  FileSpreadsheet,
  LogIn,
  School
} from 'lucide-react';
import { cn } from '../lib/utils';
import { db } from '../db/schema';
import { useNotifications } from '../contexts/NotificationContext';

interface GetStartedProps {
  onEnterSchoolPortal: () => void;
  onActivationSuccess: () => void;
  licenseKey: string;
  isLicensed: boolean;
  lockAnnouncement: string;
}

const computeLicenseHash = (key: string): string => {
  if (!key) return '';
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    const char = key.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  const part1 = Math.abs(hash).toString(16).padStart(8, '0');
  const part2 = Math.abs(hash * 31).toString(16).padStart(8, '0');
  const part3 = Math.abs(hash * 97).toString(16).padStart(8, '0');
  const part4 = Math.abs(hash * 139).toString(16).padStart(8, '0');
  const fullHex = `${part1}${part2}${part3}${part4}`.toUpperCase();
  return `SHA-256: ${fullHex.slice(0, 8)}-${fullHex.slice(8, 16)}-${fullHex.slice(16, 24)}-${fullHex.slice(24, 32)}`;
};

export default function GetStarted({ 
  onEnterSchoolPortal, 
  onActivationSuccess,
  licenseKey,
  isLicensed,
  lockAnnouncement
}: GetStartedProps) {
  const { login, register } = useAuth();
  const { showToast } = useNotifications();

  const [currentView, setCurrentView] = useState<'landing' | 'activation'>(
    !isLicensed ? 'activation' : 'landing'
  );

  useEffect(() => {
    const checkHash = () => {
      if (
        window.location.hash === '#creator' || 
        window.location.hash === '#creator-login' || 
        window.location.search.includes('creator=true')
      ) {
        onEnterSchoolPortal();
      }
    };
    checkHash();
    window.addEventListener('hashchange', checkHash);
    return () => window.removeEventListener('hashchange', checkHash);
  }, [onEnterSchoolPortal]);

  // Activation & Wizard Setup States
  const [licenseInput, setLicenseInput] = useState<string>('');
  const [activating, setActivating] = useState<boolean>(false);
  const [activationError, setActivationError] = useState<string>('');
  const [isSettingUp, setIsSettingUp] = useState<boolean>(false);
  const [setupStep, setSetupStep] = useState<number>(1);
  const [setupLicenseInfo, setSetupLicenseInfo] = useState<any>(null);

  // Setup Wizard Inputs
  const [setupSchoolName, setSetupSchoolName] = useState<string>('');
  const [setupSchoolPhone, setSetupSchoolPhone] = useState<string>('');
  const [setupSchoolEmail, setSetupSchoolEmail] = useState<string>('');
  const [setupSchoolAddress, setSetupSchoolAddress] = useState<string>('');
  const [setupSchoolLogo, setSetupSchoolLogo] = useState<string>('https://cdn.pixabay.com/photo/2016/10/06/19/03/graduation-cap-1719744_1280.png');
  const [setupAcademicYear, setSetupAcademicYear] = useState<string>('2026/2027');
  const [setupCurrentTerm, setSetupCurrentTerm] = useState<string>('Term 1');

  // Setup Admin Credentials
  const [setupAdminName, setSetupAdminName] = useState<string>('Head Administrator');
  const [setupAdminEmail, setSetupAdminEmail] = useState<string>('');
  const [setupAdminUser, setSetupAdminUser] = useState<string>('admin');
  const [setupAdminPass, setSetupAdminPass] = useState<string>('');
  const [setupAdminConfirmPass, setSetupAdminConfirmPass] = useState<string>('');
  const [setupAdminError, setSetupAdminError] = useState<string>('');

  // Onboarding Mode (default to direct password setup so admins can set credentials and log in immediately)
  const [activationMode, setActivationMode] = useState<'magic_link' | 'password'>('password');
  const [magicLinkSent, setMagicLinkSent] = useState<boolean>(false);
  const [magicSentEmail, setMagicSentEmail] = useState<string>('');
  const [magicActionLink, setMagicActionLink] = useState<string | null>(null);
  const [provisionedSession, setProvisionedSession] = useState<{ user: any; token: string; school?: any } | null>(null);

  // Additional Interactive States
  const [showAbout, setShowAbout] = useState<boolean>(false);
  const [showContact, setShowContact] = useState<boolean>(false);
  const [showVideoTour, setShowVideoTour] = useState<boolean>(false);
  const [videoTourStep, setVideoTourStep] = useState<number>(0);

  // Live License Key Validation State
  const [licenseValidation, setLicenseValidation] = useState<{
    checking: boolean;
    checked: boolean;
    valid: boolean;
    used: boolean;
    schoolName?: string;
    tier?: string;
    error?: string;
  }>({
    checking: false,
    checked: false,
    valid: false,
    used: false
  });

  // Debounced live key validation
  useEffect(() => {
    const trimmed = licenseInput.trim().toUpperCase();
    if (!trimmed || trimmed.length < 6) {
      setLicenseValidation({ checking: false, checked: false, valid: false, used: false });
      return;
    }

    const timer = setTimeout(async () => {
      setLicenseValidation(prev => ({ ...prev, checking: true }));
      try {
        const res = await fetch('/api/license/validate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ licenseKey: trimmed })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          const isSuspendedOrRevoked = data.status === 'suspended' || data.status === 'revoked';
          const isKeyUsed = !!(data.used && data.activatedAt);
          if (isSuspendedOrRevoked) {
            setLicenseValidation({
              checking: false,
              checked: true,
              valid: false,
              used: false,
              schoolName: data.schoolName || '',
              tier: data.tier || 'Standard',
              error: 'This license key is currently suspended. Please contact administration.'
            });
          } else {
            setLicenseValidation({
              checking: false,
              checked: true,
              valid: true,
              used: isKeyUsed,
              schoolName: data.schoolName || '',
              tier: data.tier || 'Standard'
            });
            if (data.schoolName && !setupSchoolName) {
              setSetupSchoolName(data.schoolName);
            }
          }
        } else {
          setLicenseValidation({
            checking: false,
            checked: true,
            valid: false,
            used: false,
            error: data.error || 'Invalid or unrecognized license key'
          });
        }
      } catch (err: any) {
        setLicenseValidation({
          checking: false,
          checked: true,
          valid: false,
          used: false,
          error: 'License verification service unreachable'
        });
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [licenseInput]);

  // Handle license key validation & Option B unified activation
  const handleActivate = async (e: FormEvent) => {
    e.preventDefault();
    if (!licenseInput.trim()) {
      setActivationError("Please enter a valid license key.");
      return;
    }

    if (isLicensed && licenseValidation.checked && licenseValidation.used) {
      setActivationError(`This license key has already been used and activated for "${licenseValidation.schoolName || 'another school'}". License keys are strictly single-use.`);
      return;
    }

    if (setupAdminPass && setupAdminPass !== setupAdminConfirmPass) {
      setActivationError("Master passwords do not match. Please verify.");
      return;
    }

    if (setupAdminPass && setupAdminPass.length < 4) {
      setActivationError("Password must be at least 4 characters long.");
      return;
    }

    setActivating(true);
    setActivationError('');
    let activatedData: any = null;
    let activatedSchool: any = null;

    try {
      const targetEmail = setupAdminEmail.trim() || setupSchoolEmail.trim();
      let currentSchoolId: string | undefined;
      try {
        const storedSchool = localStorage.getItem('esepa_active_school');
        if (storedSchool) {
          const parsed = JSON.parse(storedSchool);
          if (parsed?.id) currentSchoolId = String(parsed.id);
        }
      } catch {}
      const token = localStorage.getItem('esepa_auth_token');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/license/activate', {
        method: 'POST',
        headers,
        body: JSON.stringify({ 
          licenseKey: licenseInput.trim().toUpperCase(),
          schoolId: currentSchoolId,
          adminUser: setupAdminUser.trim().toLowerCase() || 'admin',
          adminPassword: setupAdminPass || 'admin123',
          adminFullName: setupAdminName.trim() || 'Head Administrator',
          schoolName: setupSchoolName.trim(),
          schoolPhone: setupSchoolPhone.trim(),
          schoolEmail: targetEmail,
          adminEmail: targetEmail,
          schoolAddress: setupSchoolAddress.trim(),
          academicYear: setupAcademicYear.trim() || '2026/2027',
          currentTerm: setupCurrentTerm.trim() || 'Term 1',
          redirectUrl: window.location.origin
        })
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        activatedData = data.license;
        activatedSchool = data.school;
      } else if (data?.error) {
        setActivationError(data.error);
        setActivating(false);
        return;
      } else {
        setActivationError("Activation request failed. Please check your credentials.");
        setActivating(false);
        return;
      }
    } catch (err: any) {
      console.warn("Server activate fetch catch:", err);
      setActivationError("Network error contacting activation database: " + (err.message || 'Check server connection'));
      setActivating(false);
      return;
    }

    if (activatedData) {
      localStorage.setItem('esepa_active_license', JSON.stringify(activatedData));
      localStorage.removeItem('esepa_generated_licenses');
      localStorage.removeItem('school_license_override');
      window.dispatchEvent(new CustomEvent('esepa_license_status_changed', { detail: activatedData }));
      setSetupLicenseInfo(activatedData);
      
      const effectiveSchoolName = setupSchoolName.trim().toUpperCase() || (activatedData.schoolName || 'SCHOOL SPHERE ACADEMY').toUpperCase();
      setSetupSchoolName(effectiveSchoolName);

      // Save local active school state
      const activeSchoolObj = {
        id: activatedSchool?.id || activatedData?.school_id || '00000000-0000-0000-0000-000000000001',
        name: effectiveSchoolName,
        slug: effectiveSchoolName.toLowerCase().replace(/[^a-z0-9]/g, '-'),
        email: setupAdminEmail.trim() || setupSchoolEmail.trim() || `admin@${effectiveSchoolName.toLowerCase().replace(/[^a-z0-9]/g, '-')}.edu.gh`,
        phone: setupSchoolPhone.trim() || '+233 24 000 0000',
        address: setupSchoolAddress.trim() || 'Ghana',
        logo_url: setupSchoolLogo.trim() || 'https://cdn.pixabay.com/photo/2016/10/06/19/03/graduation-cap-1719744_1280.png',
        status: 'active'
      };
      localStorage.setItem('esepa_active_school', JSON.stringify(activeSchoolObj));

      // Save school profile settings
      try {
        const existingProfile = await db.settings.where('key').equals('schoolProfile').first();
        const profileValue = {
          schoolName: effectiveSchoolName,
          schoolPhone: activeSchoolObj.phone,
          schoolEmail: activeSchoolObj.email,
          schoolAddress: activeSchoolObj.address,
          logo: activeSchoolObj.logo_url
        };
        if (existingProfile) {
          await db.settings.update(existingProfile.id!, { value: profileValue });
        } else {
          await db.settings.add({ key: 'schoolProfile', value: profileValue });
        }

        const existingAcademic = await db.settings.where('key').equals('academicConfig').first();
        const academicValue = {
          academicYear: setupAcademicYear.trim() || '2026/2027',
          currentTerm: setupCurrentTerm.trim() || 'Term 1',
          nextTermBegins: '2026-09-08'
        };
        if (existingAcademic) {
          await db.settings.update(existingAcademic.id!, { value: academicValue });
        } else {
          await db.settings.add({ key: 'academicConfig', value: academicValue });
        }
      } catch (dbSettingsErr) {
        console.warn("Settings sync catch:", dbSettingsErr);
      }

      // Authenticate user directly via backend multi-tenant Auth login scoped to the newly activated school
      const username = setupAdminUser.trim().toLowerCase() || 'admin';
      const password = setupAdminPass || 'admin123';
      const loginSuccess = await login(username, password, activeSchoolObj.id);

      if (loginSuccess) {
        showToast(
          setupAdminEmail.trim() || setupSchoolEmail.trim()
            ? "License activated & magic link dispatched to your email! Logging into portal..."
            : "License successfully activated & authenticated via Supabase database! School is now active.",
          "success"
        );
        setActivating(false);
        onActivationSuccess();
        return;
      } else {
        showToast(
          setupAdminEmail.trim() || setupSchoolEmail.trim()
            ? "License activated & magic link dispatched to your email! Please log in."
            : "License activated in database! Please log in with your new admin credentials.",
          "info"
        );
        setActivating(false);
        onActivationSuccess();
        return;
      }
    } else if (!activationError) {
      setActivationError("Invalid activation key. Please enter a valid serial key.");
    }
    setActivating(false);
  };

  // Passwordless Supabase Magic Link Onboarding
  const handleMagicActivation = async (e: FormEvent) => {
    e.preventDefault();
    if (!licenseInput.trim()) {
      setActivationError("Please enter a valid license key.");
      return;
    }
    if (!setupAdminEmail.trim() || !setupAdminEmail.includes('@')) {
      setActivationError("Please enter a valid institutional administrator email address.");
      return;
    }
    if (licenseValidation.checked && licenseValidation.used) {
      setActivationError(`This license key has already been used and activated for "${licenseValidation.schoolName || 'another school'}". License keys are strictly single-use.`);
      return;
    }

    setActivating(true);
    setActivationError('');

    try {
      const res = await fetch('/api/license/onboard-magic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          licenseKey: licenseInput.trim().toUpperCase(),
          email: setupAdminEmail.trim().toLowerCase(),
          fullName: setupAdminName.trim() || 'Head Administrator',
          schoolName: setupSchoolName.trim() || 'SCHOOL SPHERE ACADEMY',
          schoolPhone: setupSchoolPhone.trim() || '+233 24 000 0000',
          academicYear: setupAcademicYear.trim() || '2026/2027',
          currentTerm: setupCurrentTerm.trim() || 'Term 1',
          redirectUrl: window.location.origin
        })
      });

      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        setMagicSentEmail(setupAdminEmail.trim().toLowerCase());
        setMagicLinkSent(true);
        if (data.magicLinkUrl) {
          setMagicActionLink(data.magicLinkUrl);
        }
        if (data.user && data.token) {
          setProvisionedSession({ user: data.user, token: data.token, school: data.school });
        }
        if (data.license) {
          localStorage.setItem('esepa_active_license', JSON.stringify(data.license));
          window.dispatchEvent(new CustomEvent('esepa_license_status_changed', { detail: data.license }));
        }
        if (data.school) {
          localStorage.setItem('esepa_active_school', JSON.stringify(data.school));
        }
        showToast("School activated! You can sign in via the magic link or proceed directly to your portal.", "success");
      } else {
        setActivationError(data?.error || "Failed to dispatch magic link. Please check your credentials.");
      }
    } catch (err: any) {
      setActivationError("Network error sending magic link: " + (err.message || "Unknown error"));
    } finally {
      setActivating(false);
    }
  };

  // Complete multi-step setup wizard
  const handleCompleteSetup = async () => {
    try {
      const keyToUse = setupLicenseInfo?.licenseKey || setupLicenseInfo?.key || licenseInput.trim().toUpperCase();
      
      // 1. Activate in database
      const clientEmail = setupAdminEmail.trim() || setupSchoolEmail.trim();
      const res = await fetch('/api/license/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          licenseKey: keyToUse,
          adminUser: setupAdminUser.trim().toLowerCase() || 'admin',
          adminPassword: setupAdminPass || 'admin123',
          adminFullName: setupAdminName.trim() || 'Head Administrator',
          schoolName: setupSchoolName.trim().toUpperCase() || 'SCHOOL SPHERE ACADEMY',
          schoolPhone: setupSchoolPhone.trim() || '+233 24 000 0000',
          schoolEmail: clientEmail,
          adminEmail: clientEmail,
          schoolAddress: setupSchoolAddress.trim(),
          academicYear: setupAcademicYear.trim() || '2026/2027',
          currentTerm: setupCurrentTerm.trim() || 'Term 1',
          redirectUrl: window.location.origin
        })
      });

      const data = await res.json().catch(() => null);
      if (!res.ok && data?.error) {
        showToast(`Setup error: ${data.error}`, "error");
        return;
      }

      // 2. Add or update school profile settings
      const profileValue = {
        schoolName: setupSchoolName.trim().toUpperCase() || 'SCHOOL SPHERE ACADEMY',
        schoolPhone: setupSchoolPhone.trim() || '+233 24 000 0000',
        schoolEmail: setupSchoolEmail.trim() || 'info@schoolsphere.edu.gh',
        schoolAddress: setupSchoolAddress.trim() || 'Accra, Ghana',
        logo: setupSchoolLogo.trim() || 'https://cdn.pixabay.com/photo/2016/10/06/19/03/graduation-cap-1719744_1280.png'
      };

      // Save active school object in localStorage
      const activeSchoolObj = {
        id: data?.school?.id || setupLicenseInfo?.school_id || '00000000-0000-0000-0000-000000000001',
        name: profileValue.schoolName,
        slug: profileValue.schoolName.toLowerCase().replace(/[^a-z0-9]/g, '-'),
        email: profileValue.schoolEmail,
        phone: profileValue.schoolPhone,
        address: profileValue.schoolAddress,
        logo_url: profileValue.logo,
        status: 'active'
      };
      localStorage.setItem('esepa_active_school', JSON.stringify(activeSchoolObj));

      const existingProfile = await db.settings.where('key').equals('schoolProfile').first();
      if (existingProfile) {
        await db.settings.update(existingProfile.id!, { value: profileValue });
      } else {
        await db.settings.add({ key: 'schoolProfile', value: profileValue });
      }

      // 3. Add academic configuration
      const existingAcademic = await db.settings.where('key').equals('academicConfig').first();
      const academicValue = {
        academicYear: setupAcademicYear.trim() || '2026/2027',
        currentTerm: setupCurrentTerm.trim() || 'Term 1',
        nextTermBegins: '2026-09-08'
      };
      if (existingAcademic) {
        await db.settings.update(existingAcademic.id!, { value: academicValue });
      } else {
        await db.settings.add({ key: 'academicConfig', value: academicValue });
      }

      // 4. Authenticate registered admin via backend multi-tenant login scoped to the newly activated school
      const effectiveUser = setupAdminUser.trim().toLowerCase() || 'admin';
      const effectivePass = setupAdminPass || 'admin123';
      await login(effectiveUser, effectivePass, activeSchoolObj.id);

      // 5. Complete
      onActivationSuccess();
      showToast("Activation completed! School Sphere Suite is fully authorized.", "success");
    } catch (err: any) {
      showToast(`Guided setup error: ${err.message}`, "error");
    }
  };



  if (currentView === 'landing') {
    return (
      <>
        <LandingPage
          onEnterSchoolPortal={onEnterSchoolPortal}
          onOpenActivation={() => {
            setLicenseInput('');
            setCurrentView('activation');
          }}
          onOpenCreatorLogin={onEnterSchoolPortal}
          onOpenAbout={() => setShowAbout(true)}
          onOpenContact={() => setShowContact(true)}
          onOpenVideoTour={() => {
            setVideoTourStep(0);
            setShowVideoTour(true);
          }}
          isLicensed={isLicensed}
        />

        {/* Interactive Modal Overlays */}
        {showAbout && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white dark:bg-slate-900 rounded-2xl p-6 sm:p-8 max-w-md w-full border border-slate-200 dark:border-slate-800 shadow-2xl relative text-left"
            >
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4 mb-4">
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 uppercase tracking-tight">About SchoolSphere</h3>
                <button 
                  onClick={() => setShowAbout(false)}
                  className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-slate-600 transition cursor-pointer"
                >
                  X
                </button>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                SchoolSphere 3.1 is an educational management suite engineered for modern schools, featuring intelligent Class Placement balancing, continuous assessment report cards, mobile money tuition reconciliation, and Supabase cloud persistence.
              </p>
              <div className="mt-6">
                <button 
                  onClick={() => setShowAbout(false)}
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold uppercase tracking-wider transition shadow-sm cursor-pointer"
                >
                  Close Window
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {showContact && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white dark:bg-slate-900 rounded-2xl p-6 sm:p-8 max-w-md w-full border border-slate-200 dark:border-slate-800 shadow-2xl relative text-left"
            >
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4 mb-4">
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 uppercase tracking-tight">Institutional Support</h3>
                <button 
                  onClick={() => setShowContact(false)}
                  className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-slate-600 transition cursor-pointer"
                >
                  X
                </button>
              </div>
              <div className="space-y-4 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                <p>
                  Need administrative serial keys, customized reports, or dedicated server deployment setups? Our engineering team is active and ready to assist you.
                </p>
                <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Direct Support</span>
                  <a href="mailto:akokosolutions24@gmail.com" className="text-indigo-600 dark:text-indigo-400 font-extrabold text-xs hover:underline">
                    akokosolutions24@gmail.com
                  </a>
                </div>
              </div>
              <div className="mt-6">
                <button 
                  onClick={() => setShowContact(false)}
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold uppercase tracking-wider transition shadow-sm cursor-pointer"
                >
                  Close Window
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {showVideoTour && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white dark:bg-slate-900 rounded-2xl p-6 sm:p-8 max-w-lg w-full border border-slate-200 dark:border-slate-800 shadow-2xl relative text-left flex flex-col"
            >
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4 mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-indigo-600 animate-pulse" />
                  <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 uppercase tracking-tight">SchoolSphere Guided Tour</h3>
                </div>
                <button 
                  onClick={() => setShowVideoTour(false)}
                  className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-slate-600 transition cursor-pointer"
                >
                  X
                </button>
              </div>

              <div className="min-h-[160px] flex flex-col justify-center py-4 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                {videoTourStep === 0 && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
                    <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-indigo-600 dark:text-indigo-400 block">01 / Overview</span>
                    <h4 className="text-base font-bold text-slate-800 dark:text-slate-100">Intelligent School Management</h4>
                    <p>
                      SchoolSphere 3.1 integrates student records, intelligent Class Placement balancing, terminal reports, and Mobile Money collections with direct Supabase cloud sync.
                    </p>
                  </motion.div>
                )}

                {videoTourStep === 1 && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
                    <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-indigo-600 dark:text-indigo-400 block">02 / Class Creator</span>
                    <h4 className="text-base font-bold text-slate-800 dark:text-slate-100">Automated Class Placement</h4>
                    <p>
                      Balance academic ability, gender ratio, behavior, and special educational needs across parallel classes automatically with custom teacher logic rules.
                    </p>
                  </motion.div>
                )}

                {videoTourStep === 2 && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
                    <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-indigo-600 dark:text-indigo-400 block">03 / Continuous Assessment</span>
                    <h4 className="text-base font-bold text-slate-800 dark:text-slate-100">Terminal Report Sheets</h4>
                    <p>
                      Generate print-ready terminal reports with automated 30% CA + 70% Exam calculation, class rankings, and teacher remarks in seconds.
                    </p>
                  </motion.div>
                )}

                {videoTourStep === 3 && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
                    <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-indigo-600 dark:text-indigo-400 block">04 / Financial Control</span>
                    <h4 className="text-base font-bold text-slate-800 dark:text-slate-100">Fee Registries & MoMo</h4>
                    <p>
                      Collect tuition via MTN MoMo, Telecel Cash, and Paystack with instant digital receipts and automated SMS payment reminders to parents.
                    </p>
                  </motion.div>
                )}
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800 mt-4 shrink-0">
                <div className="flex gap-1.5">
                  {[0, 1, 2, 3].map((idx) => (
                    <div 
                      key={idx} 
                      className={`h-1.5 rounded-full transition-all ${idx === videoTourStep ? 'bg-indigo-600 w-5' : 'bg-slate-200 dark:bg-slate-700 w-2'}`} 
                    />
                  ))}
                </div>
                <div className="flex gap-2">
                  {videoTourStep > 0 && (
                    <button
                      onClick={() => setVideoTourStep(prev => prev - 1)}
                      className="px-4 py-1.5 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-lg text-xs font-bold uppercase tracking-wider cursor-pointer"
                    >
                      Back
                    </button>
                  )}
                  {videoTourStep < 3 ? (
                    <button
                      onClick={() => setVideoTourStep(prev => prev + 1)}
                      className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold uppercase tracking-wider shadow-md shadow-indigo-600/10 cursor-pointer"
                    >
                      Next
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        setShowVideoTour(false);
                        onEnterSchoolPortal();
                      }}
                      className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold uppercase tracking-wider shadow-lg shadow-emerald-600/10 cursor-pointer"
                    >
                      Enter Portal
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </>
    );
  }

  return (
    <div className="min-h-screen w-full flex flex-col justify-between bg-[#f6f8f7] text-[#1f2a2e] relative font-sans select-none p-4 sm:p-6 md:p-8 overflow-hidden">
      <DoodleBackground opacity={0.06} />

      {/* Top Navbar */}
      <div className="w-full max-w-4xl mx-auto flex items-center justify-between pb-4 border-b border-[#bac4c6] shrink-0 relative z-10">
        <div 
          className="flex items-center gap-2.5 cursor-pointer select-none" 
          onClick={() => setCurrentView('landing')}
        >
          <div className="w-9 h-9 rounded-xl bg-white border border-[#bac4c6] p-1 flex items-center justify-center shadow-xs">
            <img src="/sch sphere logo1.png" alt="Logo" className="w-full h-full object-contain pointer-events-none select-none" />
          </div>
          <span className="font-bold text-lg tracking-tight text-[#1c4a59]">
            School<span className="text-[#faae57]">Sphere</span>
          </span>
        </div>

        <button
          onClick={() => setCurrentView('landing')}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#6a7f84] hover:text-[#1c4a59] transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Return to Landing Page</span>
        </button>
      </div>

      {/* Main Form Views */}
      <div className="flex-1 flex flex-col justify-center items-center py-6 relative z-10">
        <AnimatePresence mode="wait">
          {/* VIEW 2: LICENSE ACTIVATION & WIZARD FORM */}
          {currentView === 'activation' && (
            <motion.div
              key="activation"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.25 }}
              className="w-full max-w-2xl bg-white border border-[#bac4c6] rounded-3xl p-6 sm:p-8 shadow-sm relative z-10 flex flex-col space-y-6 text-left"
            >
              
              {/* Back Button */}
              {!isSettingUp && (
                <button
                  onClick={() => setCurrentView('landing')}
                  className="flex items-center gap-2 text-xs font-bold text-[#6a7f84] hover:text-[#1c4a59] transition-colors cursor-pointer self-start"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back to Gateways</span>
                </button>
              )}

              {/* SETUP WIZARD ACTIVE STATE */}
              {isSettingUp ? (
                <div className="space-y-6">
                  {/* Stepper Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 bg-indigo-55 border border-indigo-100 rounded-xl text-indigo-600">
                        <Sparkles className="w-5 h-5 animate-pulse" />
                      </div>
                      <div>
                        <h2 className="text-base font-black text-slate-900 uppercase tracking-tight">Implementation Portal</h2>
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Creator Guided Setup Wizard</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-1.5 rounded-full border border-slate-200">
                      {[1, 2, 3, 4, 5].map(step => (
                        <div 
                          key={step} 
                          className={cn(
                            "w-5 h-5 rounded-full text-[10px] font-black flex items-center justify-center transition-all duration-300",
                            setupStep === step ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30 ring-2 ring-indigo-500/10" :
                            setupStep > step ? "bg-emerald-100 text-emerald-700 border border-emerald-200" :
                            "bg-white text-slate-400 border border-slate-200"
                          )}
                        >
                          {setupStep > step ? <Check className="w-3 h-3" /> : step}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Wizard Step 1: Verification Info */}
                  {setupStep === 1 && (
                    <div className="space-y-5">
                      <div className="space-y-1">
                        <h3 className="text-sm font-bold uppercase tracking-wide text-indigo-600">Step 1: License Verified</h3>
                        <p className="text-xs text-slate-500">Review the entitlements and modules allocated to your school profile by the Creator.</p>
                      </div>

                      <div className="bg-slate-50 rounded-2xl border border-slate-100 p-5 space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                          <div>
                            <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest block">School Entitlement</span>
                            <span className="text-xs font-black text-slate-800 mt-0.5 block truncate">{setupLicenseInfo?.schoolName || 'SCHOOL SPHERE ACADEMY'}</span>
                          </div>
                          <div>
                            <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest block">System Activation Key</span>
                            <span className="text-xs font-mono font-bold text-indigo-600 mt-0.5 block truncate">••••-••••-••••-•••• (SECURED)</span>
                          </div>
                          <div>
                            <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest block">Subscription Tier</span>
                            <span className="text-xs font-bold text-slate-700 mt-0.5 block">{setupLicenseInfo?.tier || 'Standard Edition'}</span>
                          </div>
                          <div>
                            <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest block">Expiration Period</span>
                            <span className="text-xs font-bold text-slate-700 mt-0.5 block">
                              {setupLicenseInfo?.expiryDate ? new Date(setupLicenseInfo.expiryDate).toLocaleDateString() : 'Lifetime Perpetual'}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <h4 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Active Modules Included</h4>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 bg-slate-50/50 p-3 rounded-2xl border border-slate-200">
                          {[
                            { id: 'students', label: 'Student Records' },
                            { id: 'academic', label: 'Academic Registries' },
                            { id: 'timetable', label: 'School Timetable' },
                            { id: 'attendance', label: 'Attendance' },
                            { id: 'results', label: 'Results Terminal' },
                            { id: 'exam_analysis', label: 'Exam Analysis' },
                            { id: 'reports', label: 'Report Sheets' },
                            { id: 'fees', label: 'Fees & Payments' },
                            { id: 'siren', label: 'Siren Console' },
                            { id: 'evoting', label: 'E-Voting' },
                            { id: 'inventory', label: 'Inventory Management' },
                          ].map((m) => {
                            const isPurchased = !setupLicenseInfo?.activeModules || setupLicenseInfo.activeModules.length === 0 || setupLicenseInfo.activeModules.includes(m.id);
                            return (
                              <div 
                                key={m.id}
                                className={cn(
                                  "flex items-center gap-2 px-3 py-2 rounded-xl text-[11px] font-bold border transition-all",
                                  isPurchased 
                                    ? "bg-indigo-50/60 border-indigo-100 text-indigo-700"
                                    : "bg-slate-50/50 border-slate-200 text-slate-400 line-through opacity-60"
                                )}
                              >
                                <div className={cn("w-1.5 h-1.5 rounded-full", isPurchased ? "bg-indigo-600" : "bg-slate-300")} />
                                <span className="truncate">{m.label}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <div className="pt-2 flex justify-end">
                        <button
                          onClick={() => setSetupStep(2)}
                          className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer shadow-lg shadow-indigo-600/15"
                        >
                          Continue Setup
                          <ArrowRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Wizard Step 2: Custom School Profile */}
                  {setupStep === 2 && (
                    <div className="space-y-4">
                      <div className="space-y-1">
                        <h3 className="text-sm font-bold uppercase tracking-wide text-indigo-600">Step 2: Customize School Identity</h3>
                        <p className="text-xs text-slate-500">Configure public school meta details. This determines what prints on report cards, billing files and fee receipts.</p>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Official School Name</label>
                          <input 
                            type="text"
                            value={setupSchoolName}
                            onChange={(e) => setSetupSchoolName(e.target.value)}
                            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs text-slate-800 focus:outline-none focus:border-indigo-500 focus:bg-white"
                            placeholder="e.g. Accra Science & Tech Academy"
                            required
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">School Logo URL</label>
                          <input 
                            type="text"
                            value={setupSchoolLogo}
                            onChange={(e) => setSetupSchoolLogo(e.target.value)}
                            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 focus:outline-none focus:border-indigo-500 focus:bg-white"
                            placeholder="e.g. https://domain.com/logo.png"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Telephone / Contact Phone</label>
                          <input 
                            type="text"
                            value={setupSchoolPhone}
                            onChange={(e) => setSetupSchoolPhone(e.target.value)}
                            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 focus:outline-none focus:border-indigo-500 focus:bg-white"
                            placeholder="+233 24 000 0000"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">School Official Email</label>
                          <input 
                            type="email"
                            value={setupSchoolEmail}
                            onChange={(e) => setSetupSchoolEmail(e.target.value)}
                            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 focus:outline-none focus:border-indigo-500 focus:bg-white"
                            placeholder="info@school.edu"
                          />
                        </div>

                        <div className="space-y-1 sm:col-span-2">
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">School Physical Address</label>
                          <input 
                            type="text"
                            value={setupSchoolAddress}
                            onChange={(e) => setSetupSchoolAddress(e.target.value)}
                            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 focus:outline-none focus:border-indigo-500 focus:bg-white"
                            placeholder="Accra, Ghana"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Initial Academic Year</label>
                          <select
                            value={setupAcademicYear}
                            onChange={(e) => setSetupAcademicYear(e.target.value)}
                            className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 font-bold focus:outline-none focus:border-indigo-500 focus:bg-white"
                          >
                            <option value="2025/2026">2025/2026 Session</option>
                            <option value="2026/2027">2026/2027 Session</option>
                            <option value="2027/2028">2027/2028 Session</option>
                          </select>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Initial Term</label>
                          <select
                            value={setupCurrentTerm}
                            onChange={(e) => setSetupCurrentTerm(e.target.value)}
                            className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 font-bold focus:outline-none focus:border-indigo-500 focus:bg-white"
                          >
                            <option value="Term 1">First Term (Term 1)</option>
                            <option value="Term 2">Second Term (Term 2)</option>
                            <option value="Term 3">Third Term (Term 3)</option>
                          </select>
                        </div>
                      </div>

                      <div className="pt-4 flex justify-between border-t border-slate-100">
                        <button
                          onClick={() => setSetupStep(1)}
                          className="px-5 py-2 bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 rounded-xl text-xs font-bold uppercase tracking-wider cursor-pointer"
                        >
                          Back
                        </button>
                        <button
                          onClick={() => {
                            if (!setupSchoolName.trim()) {
                              showToast("Please enter an official school name.", "error");
                              return;
                            }
                            setSetupStep(3);
                          }}
                          className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer shadow-lg"
                        >
                          Next Step
                          <ArrowRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Wizard Step 3: Admin User Setup */}
                  {setupStep === 3 && (
                    <div className="space-y-4">
                      <div className="space-y-1">
                        <h3 className="text-sm font-bold uppercase tracking-wide text-indigo-600">Step 3: Establish Master Administrator</h3>
                        <p className="text-xs text-slate-500">Configure super administrator credentials. This login will bypass standard controls to manage overall system settings.</p>
                      </div>

                      <div className="space-y-3.5 bg-slate-50/50 p-5 rounded-2xl border border-slate-200">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Administrator Full Name</label>
                          <input 
                            type="text"
                            value={setupAdminName}
                            onChange={(e) => setSetupAdminName(e.target.value)}
                            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs text-slate-800 focus:outline-none focus:border-indigo-500 focus:bg-white"
                            placeholder="e.g. Principal Elena Mensah"
                            required
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Login Username</label>
                          <input 
                            type="text"
                            value={setupAdminUser}
                            onChange={(e) => {
                              setSetupAdminUser(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''));
                              setSetupAdminError('');
                            }}
                            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs text-slate-800 focus:outline-none focus:border-indigo-500 focus:bg-white"
                            placeholder="e.g. admin_cape"
                            required
                          />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Password</label>
                            <input 
                              type="password"
                              value={setupAdminPass}
                              onChange={(e) => {
                                setSetupAdminPass(e.target.value);
                                setSetupAdminError('');
                              }}
                              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-850 focus:outline-none focus:border-indigo-500 focus:bg-white"
                              placeholder="••••••••"
                              required
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Confirm Password</label>
                            <input 
                              type="password"
                              value={setupAdminConfirmPass}
                              onChange={(e) => {
                                setSetupAdminConfirmPass(e.target.value);
                                setSetupAdminError('');
                              }}
                              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-850 focus:outline-none focus:border-indigo-500 focus:bg-white"
                              placeholder="••••••••"
                              required
                            />
                          </div>
                        </div>

                        {setupAdminError && (
                          <p className="text-xs text-rose-600 font-semibold bg-rose-50/5 p-3 rounded-xl border border-rose-200">
                            {setupAdminError}
                          </p>
                        )}
                      </div>

                      <div className="pt-4 flex justify-between border-t border-slate-100">
                        <button
                          onClick={() => setSetupStep(2)}
                          className="px-5 py-2 bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 rounded-xl text-xs font-bold uppercase tracking-wider cursor-pointer"
                        >
                          Back
                        </button>
                        <button
                          onClick={() => {
                            if (!setupAdminName.trim()) {
                              setSetupAdminError("Full Name is required.");
                              return;
                            }
                            if (!setupAdminUser.trim()) {
                              setSetupAdminError("Username is required.");
                              return;
                            }
                            if (setupAdminPass.length < 6) {
                              setSetupAdminError("Password must be at least 6 characters.");
                              return;
                            }
                            if (setupAdminPass !== setupAdminConfirmPass) {
                              setSetupAdminError("Passwords do not match.");
                              return;
                            }
                            setSetupStep(4);
                          }}
                          className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer shadow-lg shadow-indigo-600/15"
                        >
                          Next Step
                          <ArrowRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Wizard Step 4: System Handshake & Diagnostics */}
                  {setupStep === 4 && (
                    <div className="space-y-4">
                      <div className="space-y-1">
                        <h3 className="text-sm font-bold uppercase tracking-wide text-indigo-600">Step 4: Database Provisioning & Diagnostics</h3>
                        <p className="text-xs text-slate-500">Initiating system-level index tests and cryptographic signatures to structure directories.</p>
                      </div>

                      <div className="space-y-3 bg-slate-50 border border-slate-200 p-5 rounded-2xl font-mono text-[11px] text-slate-700">
                        <div className="flex items-center justify-between py-1 border-b border-slate-200/60">
                          <span className="flex items-center gap-2">
                            <Terminal className="w-3.5 h-3.5 text-slate-400 animate-pulse" />
                            <span>[SYSTEM] Dexie Index Handshake</span>
                          </span>
                          <span className="text-emerald-600 font-bold">READY (OK)</span>
                        </div>
                        <div className="flex items-center justify-between py-1 border-b border-slate-200/60">
                          <span className="flex items-center gap-2">
                            <Lock className="w-3.5 h-3.5 text-slate-400" />
                            <span>[SYSTEM] Local Key Derivation</span>
                          </span>
                          <span className="text-emerald-600 font-bold">ESTABLISHED</span>
                        </div>
                        <div className="flex items-center justify-between py-1 border-b border-slate-200/60">
                          <span className="flex items-center gap-2">
                            <FileSpreadsheet className="w-3.5 h-3.5 text-slate-400" />
                            <span>[SYSTEM] Database Tables Partition</span>
                          </span>
                          <span className="text-emerald-600 font-bold">VERIFIED</span>
                        </div>
                        <div className="flex items-center justify-between py-1">
                          <span className="flex items-center gap-2">
                            <Activity className="w-3.5 h-3.5 text-indigo-500 animate-pulse" />
                            <span>[SYSTEM] Cloud Sync Stream Pipe</span>
                          </span>
                          <span className="text-indigo-600 font-bold">ACTIVE & SYNCED</span>
                        </div>
                      </div>

                      <div className="bg-indigo-50/50 p-5 border border-indigo-100 rounded-2xl text-slate-700 leading-relaxed space-y-1">
                        <span className="text-[9px] font-extrabold uppercase tracking-widest text-indigo-600 block">System Verification Statement</span>
                        <p className="text-xs italic">
                          "Accra SchoolSphere Suite has configured and activated the custom system registers. Local schema pipelines are established."
                        </p>
                      </div>

                      <div className="pt-4 flex justify-between border-t border-slate-100">
                        <button
                          onClick={() => setSetupStep(3)}
                          className="px-5 py-2 bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 rounded-xl text-xs font-bold uppercase tracking-wider cursor-pointer"
                        >
                          Back
                        </button>
                        <button
                          onClick={() => setSetupStep(5)}
                          className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer shadow-md shadow-indigo-600/15 animate-pulse"
                        >
                          Proceed to Launch
                          <ArrowRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Wizard Step 5: Complete & Launch */}
                  {setupStep === 5 && (
                    <div className="space-y-4">
                      <div className="space-y-1">
                        <h3 className="text-sm font-bold uppercase tracking-wide text-emerald-600">Step 5: Launch Administrative Portal</h3>
                        <p className="text-xs text-slate-500">Configuration is complete. Please double-check the school profile summary before deployment.</p>
                      </div>

                      <div className="bg-slate-50 rounded-2xl border border-slate-200 p-5 space-y-3 text-xs">
                        <div className="flex justify-between">
                          <span className="text-slate-500 font-bold">School Name:</span>
                          <span className="text-slate-800 font-black uppercase truncate max-w-[250px]">{setupSchoolName}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500 font-bold">Master Administrator:</span>
                          <span className="text-slate-800 font-bold truncate max-w-[250px]">{setupAdminName}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500 font-bold">Admin Username:</span>
                          <span className="text-indigo-600 font-mono font-bold">{setupAdminUser}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500 font-bold">Academic Year:</span>
                          <span className="text-slate-800 font-bold">{setupAcademicYear} ({setupCurrentTerm})</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500 font-bold">License Status:</span>
                          <span className="text-emerald-600 font-bold uppercase tracking-widest">VALID ENTERPRISE</span>
                        </div>
                      </div>

                      <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl text-[11px] text-emerald-700 text-center font-bold">
                         Local database schema and master directories partitions generated successfully.
                      </div>

                      <div className="pt-4 flex justify-between border-t border-slate-100">
                        <button
                          onClick={() => setSetupStep(4)}
                          className="px-5 py-2 bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 rounded-xl text-xs font-bold uppercase tracking-wider cursor-pointer"
                        >
                          Back
                        </button>
                        <button
                          onClick={handleCompleteSetup}
                          className="px-8 py-3 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 cursor-pointer shadow-lg shadow-emerald-600/15"
                        >
                          <Sparkles className="w-4 h-4" />
                          Initialize & Launch Portal
                        </button>
                      </div>
                    </div>
                  )}

                </div>
              ) : (
                
                /* LICENSE KEY INPUT GATE (OPTION B: LICENSE KEY + HEAD ADMIN SETUP) */
                <div className="space-y-6">
                  <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                    <div className="p-2.5 bg-indigo-50 border border-indigo-100 rounded-xl text-indigo-600">
                      <Key className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="text-base font-black text-slate-900 uppercase tracking-tight">School Activation & Admin Setup</h2>
                      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Option B: Activate License & Provision Master Admin</p>
                    </div>
                  </div>

                  {magicLinkSent ? (
                    <div className="bg-emerald-50 border border-emerald-200/80 rounded-2xl p-6 text-center space-y-4 animate-in fade-in zoom-in-95 duration-200">
                      <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
                        <Mail className="w-6 h-6" />
                      </div>
                      <div>
                        <h3 className="text-base font-black text-emerald-900 uppercase tracking-tight">
                          Magic Sign-In Link Sent!
                        </h3>
                        <p className="text-xs text-emerald-700 font-medium mt-1.5 max-w-md mx-auto leading-relaxed">
                          We provisioned your school tenant with Administrator privileges and sent an authentication link to:
                        </p>
                        <div className="inline-block mt-2 px-3 py-1.5 bg-emerald-100/70 border border-emerald-300 rounded-xl font-mono text-xs font-bold text-emerald-900">
                          {magicSentEmail}
                        </div>
                      </div>

                      <div className="bg-white/80 border border-emerald-200 rounded-xl p-4 text-left text-xs text-slate-700 space-y-2">
                        <div className="flex items-center gap-2 font-bold text-slate-900">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                          <span>What happens next:</span>
                        </div>
                        <ol className="list-decimal list-inside space-y-1 text-slate-600 pl-1 text-[11px]">
                          <li>Open the inbox for <strong className="text-slate-800">{magicSentEmail}</strong> and click the sign-in link, OR</li>
                          <li>Sign in on the Login screen using <strong className="text-slate-800">{magicSentEmail}</strong> and your <strong>License Key</strong> (or <code className="bg-slate-100 px-1 rounded">admin123</code>) as the password.</li>
                        </ol>
                      </div>

                      <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                        <button
                          type="button"
                          onClick={async () => {
                            const keyTrimmed = licenseInput.trim().toUpperCase();
                            const schoolId = provisionedSession?.school?.id;
                            const ok = await login(magicSentEmail || 'admin', keyTrimmed || 'admin123', schoolId);
                            if (ok) {
                              setMagicLinkSent(false);
                              onActivationSuccess();
                            } else {
                              setMagicLinkSent(false);
                              onActivationSuccess();
                            }
                          }}
                          className="w-full sm:w-auto px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider cursor-pointer shadow-md"
                        >
                          Enter Admin Portal Now
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleMagicActivation(e)}
                          disabled={activating}
                          className="w-full sm:w-auto px-5 py-2.5 bg-white hover:bg-slate-100 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-bold uppercase tracking-wider cursor-pointer disabled:opacity-50"
                        >
                          {activating ? "Resending Link..." : "Resend Magic Link"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setMagicLinkSent(false);
                            onActivationSuccess();
                          }}
                          className="w-full sm:w-auto px-5 py-2.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold uppercase tracking-wider cursor-pointer"
                        >
                          Go to Login Screen
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 p-4 border border-slate-200/80 rounded-2xl">
                        {lockAnnouncement || "Enter your issued Software License Key and configure your administrator account to activate your school instance live in the database."}
                      </p>

                      {/* Onboarding Method Switcher */}
                      <div className="flex rounded-xl p-1 bg-slate-100 border border-slate-200 text-xs font-bold">
                        <button
                          type="button"
                          onClick={() => setActivationMode('magic_link')}
                          className={cn(
                            "flex-1 py-2 px-3 rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer",
                            activationMode === 'magic_link'
                              ? "bg-white text-indigo-700 shadow-sm border border-slate-200/60 font-black"
                              : "text-slate-600 hover:text-slate-900"
                          )}
                        >
                          <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                          <span>Passwordless Magic Link</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setActivationMode('password')}
                          className={cn(
                            "flex-1 py-2 px-3 rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer",
                            activationMode === 'password'
                              ? "bg-white text-indigo-700 shadow-sm border border-slate-200/60 font-black"
                              : "text-slate-600 hover:text-slate-900"
                          )}
                        >
                          <Key className="w-3.5 h-3.5 text-slate-500" />
                          <span>Direct Password Setup</span>
                        </button>
                      </div>

                      <form onSubmit={activationMode === 'magic_link' ? handleMagicActivation : handleActivate} className="space-y-4">
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <label className="text-[10px] font-extrabold text-slate-600 uppercase tracking-widest block ml-1">
                              1. System License Key <span className="text-rose-500">*</span>
                            </label>
                            <span className="text-[9px] font-bold uppercase tracking-wider text-indigo-600">
                              Single-Use Token
                            </span>
                          </div>
                          <input
                            type="text"
                            placeholder="ESEPA-XXXX-XXXX-XXXX"
                            value={licenseInput}
                            onChange={(e) => setLicenseInput(e.target.value)}
                            className={cn(
                              "w-full px-4 py-3 bg-slate-50 border rounded-xl text-center font-mono text-sm font-black tracking-widest uppercase transition",
                              licenseValidation.checked && licenseValidation.used
                                ? "border-amber-400 bg-amber-50/40 text-amber-800 focus:border-amber-500"
                                : licenseValidation.checked && licenseValidation.valid && !licenseValidation.used
                                ? "border-emerald-400 bg-emerald-50/40 text-emerald-800 focus:border-emerald-500"
                                : "border-slate-200 text-indigo-600 focus:border-indigo-500 focus:bg-white"
                            )}
                            required
                          />

                          {/* Live License Key Validation Indicators */}
                          {licenseValidation.checking && (
                            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 mt-1 ml-1 animate-pulse">
                              <RefreshCcw className="w-3.5 h-3.5 animate-spin text-indigo-500" />
                              <span>Checking license key against central database...</span>
                            </div>
                          )}
                          {licenseValidation.checked && licenseValidation.valid && !licenseValidation.used && (
                            <div className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-xl mt-1">
                              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                              <span> Verified Valid & Unused License Key ({licenseValidation.tier})</span>
                            </div>
                          )}
                          {licenseValidation.checked && licenseValidation.used && (
                            <div className="flex items-start gap-1.5 text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-300 px-3 py-2 rounded-xl mt-1">
                              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                              <div>
                                <span className="block font-black"> License Key Already Used</span>
                                <span className="text-[10px] font-medium text-amber-700">
                                  This serial key has already been activated for "{licenseValidation.schoolName || 'another institution'}". License keys are strictly single-use and cannot be activated again.
                                </span>
                              </div>
                            </div>
                          )}
                          {licenseValidation.checked && !licenseValidation.valid && !licenseValidation.checking && (
                            <div className="flex items-center gap-1.5 text-[11px] font-bold text-rose-600 bg-rose-50 border border-rose-200 px-3 py-1.5 rounded-xl mt-1">
                              <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
                              <span>{licenseValidation.error || "Invalid license key format or key not found in registry."}</span>
                            </div>
                          )}
                        </div>

                        <div className="bg-slate-50/70 p-4 rounded-2xl border border-slate-200/90 space-y-3.5">
                          <div className="flex items-center gap-2 border-b border-slate-200/60 pb-2">
                            <Shield className="w-4 h-4 text-indigo-600" />
                            <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider">2. School & Administrator Details</h3>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <label className="text-[9px] font-black uppercase tracking-wider text-slate-500">School / Academy Name</label>
                              <input
                                type="text"
                                placeholder="e.g. Accra Academy"
                                value={setupSchoolName}
                                onChange={(e) => setSetupSchoolName(e.target.value)}
                                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-indigo-500"
                              />
                            </div>

                            <div className="space-y-1">
                              <label className="text-[9px] font-black uppercase tracking-wider text-slate-500">Official Phone Number <span className="text-rose-500">*</span></label>
                              <input
                                type="tel"
                                placeholder="e.g. +233 24 123 4567"
                                value={setupSchoolPhone}
                                onChange={(e) => setSetupSchoolPhone(e.target.value)}
                                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-indigo-500"
                                required
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <label className="text-[9px] font-black uppercase tracking-wider text-slate-500">Academic Year <span className="text-rose-500">*</span></label>
                              <input
                                type="text"
                                placeholder="e.g. 2026/2027"
                                value={setupAcademicYear}
                                onChange={(e) => setSetupAcademicYear(e.target.value)}
                                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-indigo-500"
                                required
                              />
                            </div>

                            <div className="space-y-1">
                              <label className="text-[9px] font-black uppercase tracking-wider text-slate-500">Current Term / Semester <span className="text-rose-500">*</span></label>
                              <select
                                value={setupCurrentTerm}
                                onChange={(e) => setSetupCurrentTerm(e.target.value)}
                                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-indigo-500"
                              >
                                <option value="Term 1">Term 1</option>
                                <option value="Term 2">Term 2</option>
                                <option value="Term 3">Term 3</option>
                                <option value="Semester 1">Semester 1</option>
                                <option value="Semester 2">Semester 2</option>
                              </select>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <label className="text-[9px] font-black uppercase tracking-wider text-slate-500">Head Admin Full Name</label>
                              <input
                                type="text"
                                placeholder="e.g. Principal Elena Mensah"
                                value={setupAdminName}
                                onChange={(e) => setSetupAdminName(e.target.value)}
                                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-indigo-500"
                              />
                            </div>

                            <div className="space-y-1">
                              <label className="text-[9px] font-black uppercase tracking-wider text-slate-500">Admin Email {activationMode === 'magic_link' && <span className="text-rose-500">*</span>}</label>
                              <input
                                type="email"
                                placeholder="e.g. admin@school.edu.gh"
                                value={setupAdminEmail}
                                onChange={(e) => setSetupAdminEmail(e.target.value)}
                                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-indigo-500"
                                required={activationMode === 'magic_link'}
                              />
                            </div>
                          </div>

                          {activationMode === 'password' && (
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 border-t border-slate-200/50">
                              <div className="space-y-1">
                                <label className="text-[9px] font-black uppercase tracking-wider text-slate-500">Admin Username <span className="text-rose-500">*</span></label>
                                <input
                                  type="text"
                                  placeholder="e.g. admin"
                                  value={setupAdminUser}
                                  onChange={(e) => setSetupAdminUser(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-mono text-xs font-bold text-slate-800 focus:outline-none focus:border-indigo-500"
                                  required
                                />
                              </div>

                              <div className="space-y-1">
                                <label className="text-[9px] font-black uppercase tracking-wider text-slate-500">Master Password <span className="text-rose-500">*</span></label>
                                <input
                                  type="password"
                                  placeholder="••••••••"
                                  value={setupAdminPass}
                                  onChange={(e) => setSetupAdminPass(e.target.value)}
                                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-indigo-500"
                                  required
                                />
                              </div>

                              <div className="space-y-1">
                                <label className="text-[9px] font-black uppercase tracking-wider text-slate-500">Confirm Password <span className="text-rose-500">*</span></label>
                                <input
                                  type="password"
                                  placeholder="••••••••"
                                  value={setupAdminConfirmPass}
                                  onChange={(e) => setSetupAdminConfirmPass(e.target.value)}
                                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-indigo-500"
                                  required
                                />
                              </div>
                            </div>
                          )}
                        </div>

                        {activationError && (
                          <p className="text-xs text-rose-600 font-semibold bg-rose-50 border border-rose-200 p-3 rounded-xl">
                            {activationError}
                          </p>
                        )}

                        <button
                          type="submit"
                          disabled={activating || (licenseValidation.checked && licenseValidation.used)}
                          className="w-full py-3.5 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 active:scale-[0.98] transition-all rounded-xl text-xs font-black uppercase tracking-wider text-white shadow-lg shadow-indigo-500/10 cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                          {activationMode === 'magic_link' ? (
                            <>
                              <Mail className="w-4 h-4 text-emerald-300" />
                              {activating 
                                ? "Provisioning Tenant & Sending Magic Link..." 
                                : licenseValidation.checked && licenseValidation.used 
                                ? "License Already Used (Single-Use Only)" 
                                : "Activate School & Send Magic Link"}
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-4 h-4 text-emerald-300" />
                              {activating 
                                ? "Activating School in Database..." 
                                : licenseValidation.checked && licenseValidation.used 
                                ? "License Already Used (Single-Use Only)" 
                                : "Activate School & Complete Setup"}
                            </>
                          )}
                        </button>
                      </form>
                    </>
                  )}
                </div>
              )}

            </motion.div>
          )}
        </AnimatePresence>

      </div>

    {/* Interactive Modal Overlays */}
    {showAbout && (
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full border border-slate-100 shadow-2xl relative text-left"
        >
          <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
            <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">About SchoolSphere</h3>
            <button 
              onClick={() => setShowAbout(false)}
              className="w-8 h-8 rounded-full bg-slate-50 hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 transition cursor-pointer"
            >
              X
            </button>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            SchoolSphere v1.4 Enterprise is a cutting-edge school management system engineered to operate with ultra-low latency, high performance, and seamless cloud synchronizations.
            <br /><br />
            Featuring deep integrations of automated gradebook sheets, streamlined fee accounts, real-time warning broadcast alarm modules, and cloud admin backup capabilities.
          </p>
          <div className="mt-6">
            <button 
              onClick={() => setShowAbout(false)}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition shadow-lg shadow-indigo-600/10 cursor-pointer"
            >
              Close Window
            </button>
          </div>
        </motion.div>
      </div>
    )}

    {showContact && (
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full border border-slate-100 shadow-2xl relative text-left"
        >
          <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
            <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">Get in Touch</h3>
            <button 
              onClick={() => setShowContact(false)}
              className="w-8 h-8 rounded-full bg-slate-50 hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 transition cursor-pointer"
            >
              X
            </button>
          </div>
          <div className="space-y-4 text-xs text-slate-600 leading-relaxed">
            <p>
              Need administrative serial keys, customized reports, or dedicated server deployment setups? Our engineering team is active and ready to assist you.
            </p>
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Direct Support</span>
              <a href="mailto:akokosolutions24@gmail.com" className="text-indigo-600 font-extrabold text-xs hover:underline">
                akokosolutions24@gmail.com
              </a>
            </div>
          </div>
          <div className="mt-6">
            <button 
              onClick={() => setShowContact(false)}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition shadow-lg shadow-indigo-600/10 cursor-pointer"
            >
              Close Window
            </button>
          </div>
        </motion.div>
      </div>
    )}

    {showVideoTour && (
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white rounded-3xl p-6 sm:p-8 max-w-lg w-full border border-slate-100 shadow-2xl relative text-left flex flex-col"
        >
          <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-rose-505 bg-rose-500 animate-pulse" />
              <h3 className="text-base font-black text-slate-900 uppercase tracking-tight">SchoolSphere Guided Tour</h3>
            </div>
            <button 
              onClick={() => setShowVideoTour(false)}
              className="w-8 h-8 rounded-full bg-slate-50 hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 transition cursor-pointer"
            >
              X
            </button>
          </div>

          <div className="min-h-[160px] flex flex-col justify-center py-4 text-xs text-slate-600 leading-relaxed">
            {videoTourStep === 0 && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
                <span className="text-[9px] font-black uppercase tracking-widest text-indigo-600 block">01 / Introduction</span>
                <h4 className="text-base font-black text-slate-800 uppercase tracking-tight">The Modern Command Gate</h4>
                <p>
                  Welcome to the SchoolSphere suite. Our high-performance data pipelines guarantee instantaneous page loads and automated syncing.
                </p>
              </motion.div>
            )}

            {videoTourStep === 1 && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
                <span className="text-[9px] font-black uppercase tracking-widest text-indigo-600 block">02 / Academic Modules</span>
                <h4 className="text-base font-black text-slate-800 uppercase tracking-tight">Unified Gradebook System</h4>
                <p>
                  Generate report cards, log daily class attendances, track course curriculums, and analyze class performance indexes using customizable visual analytics.
                </p>
              </motion.div>
            )}

            {videoTourStep === 2 && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
                <span className="text-[9px] font-black uppercase tracking-widest text-indigo-600 block">03 / Financial Control</span>
                <h4 className="text-base font-black text-slate-800 uppercase tracking-tight">Fee Registries & Billing</h4>
                <p>
                  Track parent payments, issue invoice statements, generate fee summaries, and maintain school assets with real-time logging and auditing records.
                </p>
              </motion.div>
            )}

            {videoTourStep === 3 && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
                <span className="text-[9px] font-black uppercase tracking-widest text-indigo-600 block">04 / Campus Security</span>
                <h4 className="text-base font-black text-slate-800 uppercase tracking-tight">Built-in Warning Sirens</h4>
                <p>
                  Trigger scheduled lesson bells, log safety drills, or sound urgent lockdown/weather warning alarms directly from the central command board to campus speakers.
                </p>
              </motion.div>
            )}
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-slate-100 mt-4 shrink-0">
            <div className="flex gap-1.5">
              {[0, 1, 2, 3].map((idx) => (
                <div 
                  key={idx} 
                  className={`w-2 h-2 rounded-full transition-all ${idx === videoTourStep ? 'bg-indigo-600 w-4' : 'bg-slate-200'}`} 
                />
              ))}
            </div>
            <div className="flex gap-2">
              {videoTourStep > 0 && (
                <button
                  onClick={() => setVideoTourStep(prev => prev - 1)}
                  className="px-4 py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-lg text-xs font-bold uppercase tracking-wider cursor-pointer"
                >
                  Back
                </button>
              )}
              {videoTourStep < 3 ? (
                <button
                  onClick={() => setVideoTourStep(prev => prev + 1)}
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold uppercase tracking-wider shadow-md shadow-indigo-600/10 cursor-pointer"
                >
                  Next
                </button>
              ) : (
                <button
                  onClick={() => {
                    setShowVideoTour(false);
                    onEnterSchoolPortal();
                  }}
                  className="px-4 py-1.5 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 text-white rounded-lg text-xs font-bold uppercase tracking-wider shadow-lg shadow-emerald-600/10 cursor-pointer"
                >
                  Enter Portal
                </button>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    )}

      {/* Footer support credits */}
      <div className="p-6 relative z-10 w-full border-t border-slate-200/60 flex flex-col sm:flex-row justify-between items-center gap-4 text-[10px] text-slate-500 font-semibold tracking-wider uppercase">
        <span 
          onClick={onEnterSchoolPortal} 
          className="cursor-pointer hover:text-indigo-600 transition-colors"
          title="Click to access login portal"
        >
          Instance ID: schoolsphere-academy-live-prod
        </span>
        <span>
          Licensing support: <a href="mailto:akokosolutions24@gmail.com" className="text-indigo-600 hover:underline">akokosolutions24@gmail.com</a>
        </span>
      </div>

    </div>
  );
}
