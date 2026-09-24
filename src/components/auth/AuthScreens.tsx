import React, { useState, useEffect, FormEvent, useMemo } from 'react';
import { 
  Building2, 
  Lock, 
  Mail, 
  User as UserIcon, 
  Eye, 
  EyeOff, 
  ArrowRight, 
  CheckCircle2, 
  ShieldCheck, 
  AlertCircle, 
  Loader2, 
  ArrowLeft,
  KeyRound,
  Sparkles,
  Globe,
  HelpCircle,
  Send,
  School as SchoolIcon
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { validateEmail, EmailValidationResult } from '../../lib/emailValidation';
import { EmailValidationFeedback } from './EmailValidationFeedback';
import { mapAuthErrorMessage } from '../../lib/authTelemetry';
import { PrivacyPolicyModal } from '../legal/PrivacyPolicyModal';
import { TermsOfServiceModal } from '../legal/TermsOfServiceModal';
import { SiteMapModal } from '../legal/SiteMapModal';
import { openCookiePreferences } from '../legal/CookieConsentBanner';
import { authApi } from '../../lib/api';
import { cn } from '../../lib/utils';
import { DoodleBackground } from '../DoodleBackground';

export interface AuthScreensProps {
  onBackToGetStarted?: () => void;
  defaultTab?: 'signin' | 'register_org' | 'join_invite';
  inviteToken?: string;
  onSuccess?: () => void;
}

export function AuthScreens({
  onBackToGetStarted,
  defaultTab = 'signin',
  inviteToken: initialInviteToken = '',
  onSuccess
}: AuthScreensProps) {
  const urlParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const tokenFromUrl = urlParams.get('token') || urlParams.get('invite') || initialInviteToken || '';
  const initialActiveTab = tokenFromUrl ? 'join_invite' : ((urlParams.get('tab') as any) || defaultTab);

  const { handleLogin, registerOrganization, joinWithInviteToken } = useAuth();

  // Active Tab: 'signin' | 'register_org' | 'join_invite' | 'forgot'
  const [activeTab, setActiveTab] = useState<'signin' | 'register_org' | 'join_invite' | 'forgot'>(initialActiveTab);

  // Common UI State
  const [isPending, setIsPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Auto-detected school state
  const [detectedSchool, setDetectedSchool] = useState<{
    id: string;
    name: string;
    slug?: string;
    logo_url?: string;
    theme?: string;
  } | null>(null);

  // --- SIGN IN STATE ---
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  // --- REGISTER ORGANIZATION STATE ---
  const [subdomainSlug, setSubdomainSlug] = useState('');
  const [orgName, setOrgName] = useState('');
  const [facilityType, setFacilityType] = useState('Senior High School');
  const [facilityCode, setFacilityCode] = useState('');
  const [adminFullName, setAdminFullName] = useState('');
  const [orgEmail, setOrgEmail] = useState('');
  const [orgPassword, setOrgPassword] = useState('');
  const [showOrgPassword, setShowOrgPassword] = useState(false);
  const [orgEmailValidation, setOrgEmailValidation] = useState<EmailValidationResult | null>(null);

  // --- JOIN WITH INVITE STATE ---
  const [inviteToken, setInviteToken] = useState(tokenFromUrl);
  const [isVerifyingToken, setIsVerifyingToken] = useState(false);
  const [tokenVerifiedData, setTokenVerifiedData] = useState<{
    valid: boolean;
    organization?: { id: string; name: string; slug: string };
    role?: string;
    email?: string;
  } | null>(null);
  const [inviteFullName, setInviteFullName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [invitePassword, setInvitePassword] = useState('');
  const [showInvitePassword, setShowInvitePassword] = useState(false);
  const [inviteEmailValidation, setInviteEmailValidation] = useState<EmailValidationResult | null>(null);

  // --- FORGOT PASSWORD STATE ---
  const [forgotInput, setForgotInput] = useState('');
  const [forgotSent, setForgotSent] = useState(false);

  // --- COMPLIANCE MODALS ---
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [showSiteMap, setShowSiteMap] = useState(false);

  // Live Auto-Detection: Debounce lookup of school via /api/auth/resolve-school
  useEffect(() => {
    const clean = identifier.trim().toLowerCase();
    if (!clean || clean.length < 2) {
      setDetectedSchool(null);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/auth/resolve-school?input=${encodeURIComponent(clean)}`);
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.school) {
            setDetectedSchool(data.school);
          } else {
            setDetectedSchool(null);
          }
        }
      } catch (e) {
        setDetectedSchool(null);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [identifier]);

  // Real-time email validation for Registration
  useEffect(() => {
    if (!orgEmail) {
      setOrgEmailValidation(null);
      return;
    }
    const res = validateEmail(orgEmail);
    setOrgEmailValidation(res);
  }, [orgEmail]);

  // Real-time email validation for Invite
  useEffect(() => {
    if (!inviteEmail) {
      setInviteEmailValidation(null);
      return;
    }
    const res = validateEmail(inviteEmail);
    setInviteEmailValidation(res);
  }, [inviteEmail]);

  // Token auto-verification for invite
  useEffect(() => {
    const cleanToken = inviteToken.trim();
    if (!cleanToken || cleanToken.length < 6) {
      setTokenVerifiedData(null);
      return;
    }

    let active = true;
    const verifyToken = async () => {
      setIsVerifyingToken(true);
      try {
        const res = await fetch(`/api/auth/verify-invite?token=${encodeURIComponent(cleanToken)}`);
        const json = await res.json();
        if (active) {
          if (res.ok && json.valid) {
            setTokenVerifiedData(json);
            if (json.email && !inviteEmail) setInviteEmail(json.email);
            setErrorMessage(null);
          } else {
            setTokenVerifiedData({ valid: false });
            setErrorMessage(json.error || 'Invitation code is expired or invalid.');
          }
        }
      } catch (err: any) {
        if (active) {
          setTokenVerifiedData({ valid: false });
          setErrorMessage('Could not verify invitation token.');
        }
      } finally {
        if (active) setIsVerifyingToken(false);
      }
    };

    const timer = setTimeout(verifyToken, 400);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [inviteToken]);

  // Auto-generate subdomain slug from org name if user hasn't typed one
  const handleOrgNameChange = (val: string) => {
    setOrgName(val);
    if (!subdomainSlug || subdomainSlug === orgName.toLowerCase().replace(/[^a-z0-9]/g, '')) {
      const generated = val.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20);
      setSubdomainSlug(generated);
    }
  };

  // --- SUBMISSIONS ---

  // 1. Sign In Submit
  const handleSignInSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!identifier.trim() || !password) {
      setErrorMessage('Please enter both identifier and password.');
      return;
    }

    setIsPending(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const res = await handleLogin(identifier.trim(), password, detectedSchool?.id);
      if (res.success) {
        setSuccessMessage('Authentication successful. Redirecting to workspace...');
        if (onSuccess) onSuccess();
      } else {
        setErrorMessage(mapAuthErrorMessage(res.error || 'Invalid credentials.'));
      }
    } catch (err: any) {
      setErrorMessage(mapAuthErrorMessage(err?.message || 'Authentication failed. Please verify your connection.'));
    } finally {
      setIsPending(false);
    }
  };

  // 2. Register School Submit
  const handleRegisterOrgSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!orgName.trim() || !adminFullName.trim() || !orgEmail.trim() || !orgPassword) {
      setErrorMessage('Please complete all required fields.');
      return;
    }
    if (orgPassword.length < 8) {
      setErrorMessage('Administrator password must be at least 8 characters long.');
      return;
    }
    if (orgEmailValidation && !orgEmailValidation.isValid) {
      setErrorMessage(orgEmailValidation.syntaxError || 'Please provide a valid institutional email.');
      return;
    }

    setIsPending(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const cleanSlug = subdomainSlug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '') || 
        orgName.trim().toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 16);

      const res = await registerOrganization({
        organizationName: orgName.trim(),
        facilityType,
        facilityCode: facilityCode.trim() || cleanSlug.toUpperCase(),
        adminFullName: adminFullName.trim(),
        email: orgEmail.trim().toLowerCase(),
        password: orgPassword,
        subdomain: cleanSlug
      });

      if (res.success) {
        setSuccessMessage(`Campus "${orgName}" created successfully! Initializing admin session...`);
        if (onSuccess) onSuccess();
      } else {
        setErrorMessage(res.error || 'Failed to provision institution. Please check fields.');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Organization registration failed.');
    } finally {
      setIsPending(false);
    }
  };

  // 3. Join with Invite Submit
  const handleJoinInviteSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!inviteToken.trim() || !inviteFullName.trim() || !inviteEmail.trim() || !invitePassword) {
      setErrorMessage('Please complete all required invitation fields.');
      return;
    }
    if (invitePassword.length < 8) {
      setErrorMessage('Password must be at least 8 characters.');
      return;
    }

    setIsPending(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const res = await joinWithInviteToken({
        token: inviteToken.trim(),
        fullName: inviteFullName.trim(),
        email: inviteEmail.trim().toLowerCase(),
        password: invitePassword
      });

      if (res.success) {
        setSuccessMessage('Invitation accepted! Joining your institution...');
        if (onSuccess) onSuccess();
      } else {
        setErrorMessage(res.error || 'Unable to join with this invite token.');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to join institution.');
    } finally {
      setIsPending(false);
    }
  };

  // 4. Forgot Password Submit
  const handleForgotSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!forgotInput.trim()) {
      setErrorMessage('Please enter your email or username.');
      return;
    }

    setIsPending(true);
    setErrorMessage(null);
    try {
      await authApi.forgotPassword(forgotInput.trim());
      setForgotSent(true);
      setSuccessMessage('Password recovery instructions sent if an account matches.');
    } catch (err: any) {
      setErrorMessage(err?.message || 'Unable to process password recovery at this time.');
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f6f8f7] flex flex-col justify-between p-4 sm:p-6 lg:p-8 font-sans selection:bg-[#faae57] selection:text-[#1f2a2e] relative overflow-hidden">
      <DoodleBackground opacity={0.06} />
      
      {/* Top Bar Navigation */}
      <div className="w-full max-w-md mx-auto flex items-center justify-between pt-2 pb-4">
        {onBackToGetStarted ? (
          <button
            type="button"
            onClick={onBackToGetStarted}
            className="inline-flex items-center gap-2 px-3 py-2 bg-white text-[#1c4a59] hover:text-[#1f2a2e] rounded-xl text-xs font-bold border border-[#bac4c6] shadow-xs active:scale-[0.97] transition-all min-h-[44px]"
          >
            <ArrowLeft className="w-4 h-4 text-[#1c4a59]" />
            <span>Command Gate</span>
          </button>
        ) : <div />}

        <div className="flex items-center gap-1.5 px-3 py-1 bg-white border border-[#bac4c6] rounded-xl text-xs font-bold text-[#1c4a59] shadow-xs">
          <ShieldCheck className="w-3.5 h-3.5 text-[#06d6a0]" />
          <span>Institutional Portal</span>
        </div>
      </div>

      {/* Main Centered Auth Form Container */}
      <div className="w-full max-w-md mx-auto my-auto">
        
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-16 h-16 rounded-2xl bg-white border border-[#bac4c6] p-2 shadow-xs flex items-center justify-center mb-3">
            <img 
              src="/sch sphere logo1.png" 
              alt="SchoolSphere" 
              className="w-full h-full object-contain pointer-events-none" 
            />
          </div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-[#1c4a59]">SchoolSphere</h1>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-[#e1c594] text-[#1f2a2e] border border-[#e4ae67]">
              3.1
            </span>
          </div>
          <p className="text-xs text-[#6a7f84] font-medium mt-1">
            Enterprise Academic & Campus Management Suite
          </p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-3xl border border-[#bac4c6] shadow-sm p-6 sm:p-8">
          
          {/* Navigation Tabs (Sign In, Register School, Join with Invite) */}
          <div className="flex items-center p-1 bg-[#f6f8f7] rounded-2xl border border-[#bac4c6] mb-6">
            <button
              type="button"
              onClick={() => {
                setActiveTab('signin');
                setErrorMessage(null);
                setSuccessMessage(null);
              }}
              className={cn(
                "flex-1 py-2 px-3 text-xs font-bold rounded-xl transition-all min-h-[38px] text-center",
                activeTab === 'signin' 
                  ? "bg-[#1c4a59] text-white shadow-xs" 
                  : "text-[#6a7f84] hover:text-[#1c4a59]"
              )}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('register_org');
                setErrorMessage(null);
                setSuccessMessage(null);
              }}
              className={cn(
                "flex-1 py-2 px-3 text-xs font-bold rounded-xl transition-all min-h-[38px] text-center",
                activeTab === 'register_org' 
                  ? "bg-[#1c4a59] text-white shadow-xs" 
                  : "text-[#6a7f84] hover:text-[#1c4a59]"
              )}
            >
              Register School
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('join_invite');
                setErrorMessage(null);
                setSuccessMessage(null);
              }}
              className={cn(
                "flex-1 py-2 px-3 text-xs font-bold rounded-xl transition-all min-h-[38px] text-center",
                activeTab === 'join_invite' 
                  ? "bg-[#1c4a59] text-white shadow-xs" 
                  : "text-[#6a7f84] hover:text-[#1c4a59]"
              )}
            >
              Invite Token
            </button>
          </div>

          {/* Error & Success Banners */}
          {errorMessage && (
            <div className="mb-5 p-3.5 bg-rose-50 border border-[#ef476f]/30 rounded-xl flex items-start gap-2.5 text-xs text-[#ef476f] font-medium animate-in fade-in duration-200">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-[#ef476f]" />
              <span className="flex-1 leading-snug">{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="mb-5 p-3.5 bg-emerald-50 border border-[#06d6a0]/40 rounded-xl flex items-start gap-2.5 text-xs text-emerald-800 font-medium animate-in fade-in duration-200">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-[#06d6a0]" />
              <span className="flex-1 leading-snug">{successMessage}</span>
            </div>
          )}

          {/* TAB 1: SIGN IN */}
          {activeTab === 'signin' && (
            <form onSubmit={handleSignInSubmit} className="space-y-4">
              
              {/* Real-Time School Auto-Detection Banner */}
              {detectedSchool && (
                <div className="flex items-center gap-3 p-3 bg-[#f6f8f7] rounded-2xl border border-[#bac4c6] shadow-2xs">
                  <div className="w-10 h-10 rounded-xl bg-white border border-[#bac4c6] flex items-center justify-center overflow-hidden p-1 shrink-0">
                    {detectedSchool.logo_url ? (
                      <img src={detectedSchool.logo_url} alt={detectedSchool.name} className="w-full h-full object-contain" />
                    ) : (
                      <Building2 className="w-5 h-5 text-[#1c4a59]" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-[#06d6a0] shrink-0 animate-pulse" />
                      <p className="text-xs font-bold text-[#1c4a59] truncate uppercase tracking-tight">
                        {detectedSchool.name}
                      </p>
                    </div>
                    <p className="text-[11px] text-[#6a7f84] truncate">
                      {detectedSchool.slug ? `${detectedSchool.slug}.schoolsphere` : 'Verified Institution'} • Auto-Detected
                    </p>
                  </div>
                </div>
              )}

              {/* Username or Email Input */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#1f2a2e] block">
                  Username or Institutional Email
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#6a7f84]">
                    <UserIcon className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    required
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="e.g. admin or teacher@school.edu.gh"
                    className="w-full pl-10 pr-4 py-3 bg-[#f6f8f7] border border-[#bac4c6] rounded-xl text-sm font-medium text-[#1f2a2e] placeholder-[#6a7f84] focus:outline-none focus:border-[#1c4a59] focus:bg-white transition-all min-h-[44px]"
                  />
                </div>
              </div>

              {/* Password Input */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-[#1f2a2e]">Password</label>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('forgot');
                      setForgotInput(identifier);
                      setErrorMessage(null);
                    }}
                    className="text-xs font-bold text-[#1c4a59] hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#6a7f84]">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your account password"
                    className="w-full pl-10 pr-11 py-3 bg-[#f6f8f7] border border-[#bac4c6] rounded-xl text-sm font-medium text-[#1f2a2e] placeholder-[#6a7f84] focus:outline-none focus:border-[#1c4a59] focus:bg-white transition-all min-h-[44px]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-[#6a7f84] hover:text-[#1c4a59] cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Session Persistence */}
              <div className="flex items-center justify-between py-1">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-4 h-4 text-[#1c4a59] border-[#bac4c6] rounded focus:ring-0 cursor-pointer"
                  />
                  <span className="text-xs text-[#6a7f84] font-medium">Keep this device authenticated</span>
                </label>
              </div>

              {/* Primary Action Button (CTA #faae57 with dark text) */}
              <button
                type="submit"
                disabled={isPending}
                className="w-full bg-[#faae57] hover:bg-[#e4ae67] text-[#1f2a2e] font-bold py-3.5 px-6 rounded-xl transition-all shadow-sm active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2 min-h-[44px] cursor-pointer text-sm"
              >
                {isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-[#1f2a2e]" />
                    <span>Verifying Credentials...</span>
                  </>
                ) : (
                  <>
                    <span>Sign In to School</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

            </form>
          )}

          {/* TAB 2: REGISTER SCHOOL */}
          {activeTab === 'register_org' && (
            <form onSubmit={handleRegisterOrgSubmit} className="space-y-4">
              
              {/* Institution Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#1f2a2e] block">
                  Institution Name <span className="text-[#ef476f]">*</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#6a7f84]">
                    <Building2 className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    required
                    value={orgName}
                    onChange={(e) => handleOrgNameChange(e.target.value)}
                    placeholder="e.g. Achimota Senior High School"
                    className="w-full pl-10 pr-4 py-3 bg-[#f6f8f7] border border-[#bac4c6] rounded-xl text-sm font-medium text-[#1f2a2e] placeholder-[#6a7f84] focus:outline-none focus:border-[#1c4a59] focus:bg-white transition-all min-h-[44px]"
                  />
                </div>
              </div>

              {/* Subdomain Slug (Per B.7: Register captures subdomain slug + first admin) */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-[#1f2a2e]">Campus Subdomain Slug</label>
                  <span className="text-[11px] text-[#6a7f84]">Pre-login identifier</span>
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#6a7f84]">
                    <Globe className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    required
                    value={subdomainSlug}
                    onChange={(e) => setSubdomainSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                    placeholder="e.g. achimota"
                    className="w-full pl-10 pr-32 py-3 bg-[#f6f8f7] border border-[#bac4c6] rounded-xl text-sm font-medium text-[#1f2a2e] placeholder-[#6a7f84] focus:outline-none focus:border-[#1c4a59] focus:bg-white transition-all min-h-[44px]"
                  />
                  <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-xs text-[#6a7f84] font-mono">
                    .schoolsphere
                  </div>
                </div>
              </div>

              {/* Facility Type & Code */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#1f2a2e] block">Category</label>
                  <select
                    value={facilityType}
                    onChange={(e) => setFacilityType(e.target.value)}
                    className="w-full px-3 py-3 bg-[#f6f8f7] border border-[#bac4c6] rounded-xl text-xs font-medium text-[#1f2a2e] focus:outline-none focus:border-[#1c4a59] focus:bg-white transition-all min-h-[44px]"
                  >
                    <option value="Senior High School">Senior High School</option>
                    <option value="Basic / Primary">Basic / Primary</option>
                    <option value="Junior High School">Junior High School</option>
                    <option value="International Academy">International Academy</option>
                    <option value="Tertiary / College">Tertiary / College</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#1f2a2e] block">School Code</label>
                  <input
                    type="text"
                    value={facilityCode}
                    onChange={(e) => setFacilityCode(e.target.value.toUpperCase())}
                    placeholder="e.g. ACH-01"
                    className="w-full px-3 py-3 bg-[#f6f8f7] border border-[#bac4c6] rounded-xl text-xs font-medium text-[#1f2a2e] placeholder-[#6a7f84] focus:outline-none focus:border-[#1c4a59] focus:bg-white transition-all min-h-[44px]"
                  />
                </div>
              </div>

              {/* Administrator Full Name */}
              <div className="space-y-1.5 pt-1">
                <label className="text-xs font-bold text-[#1f2a2e] block">
                  Lead Administrator Name <span className="text-[#ef476f]">*</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#6a7f84]">
                    <UserIcon className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    required
                    value={adminFullName}
                    onChange={(e) => setAdminFullName(e.target.value)}
                    placeholder="e.g. Dr. Kwame Mensah"
                    className="w-full pl-10 pr-4 py-3 bg-[#f6f8f7] border border-[#bac4c6] rounded-xl text-sm font-medium text-[#1f2a2e] placeholder-[#6a7f84] focus:outline-none focus:border-[#1c4a59] focus:bg-white transition-all min-h-[44px]"
                  />
                </div>
              </div>

              {/* Administrator Email */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#1f2a2e] block">
                  Institutional Email <span className="text-[#ef476f]">*</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#6a7f84]">
                    <Mail className="w-4 h-4" />
                  </div>
                  <input
                    type="email"
                    required
                    value={orgEmail}
                    onChange={(e) => setOrgEmail(e.target.value)}
                    placeholder="admin@school.edu.gh"
                    className="w-full pl-10 pr-4 py-3 bg-[#f6f8f7] border border-[#bac4c6] rounded-xl text-sm font-medium text-[#1f2a2e] placeholder-[#6a7f84] focus:outline-none focus:border-[#1c4a59] focus:bg-white transition-all min-h-[44px]"
                  />
                </div>
                <EmailValidationFeedback 
                  result={orgEmailValidation} 
                  onApplyCorrection={(c) => setOrgEmail(c)} 
                />
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#1f2a2e] block">
                  Account Password <span className="text-[#ef476f]">*</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#6a7f84]">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type={showOrgPassword ? 'text' : 'password'}
                    required
                    value={orgPassword}
                    onChange={(e) => setOrgPassword(e.target.value)}
                    placeholder="Min. 8 characters"
                    className="w-full pl-10 pr-11 py-3 bg-[#f6f8f7] border border-[#bac4c6] rounded-xl text-sm font-medium text-[#1f2a2e] placeholder-[#6a7f84] focus:outline-none focus:border-[#1c4a59] focus:bg-white transition-all min-h-[44px]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowOrgPassword(!showOrgPassword)}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-[#6a7f84] hover:text-[#1c4a59] cursor-pointer"
                  >
                    {showOrgPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Primary Action Button (CTA #faae57) */}
              <button
                type="submit"
                disabled={isPending}
                className="w-full bg-[#faae57] hover:bg-[#e4ae67] text-[#1f2a2e] font-bold py-3.5 px-6 rounded-xl transition-all shadow-sm active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2 min-h-[44px] cursor-pointer text-sm"
              >
                {isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-[#1f2a2e]" />
                    <span>Provisioning School...</span>
                  </>
                ) : (
                  <>
                    <span>Register Institution</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          )}

          {/* TAB 3: JOIN WITH INVITE */}
          {activeTab === 'join_invite' && (
            <form onSubmit={handleJoinInviteSubmit} className="space-y-4">
              
              {/* Invite Token */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-[#1f2a2e]">Invitation Token</label>
                  {isVerifyingToken && (
                    <span className="text-[11px] text-[#1c4a59] flex items-center gap-1 font-medium">
                      <Loader2 className="w-3 h-3 animate-spin" /> Verifying...
                    </span>
                  )}
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#6a7f84]">
                    <KeyRound className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    required
                    value={inviteToken}
                    onChange={(e) => setInviteToken(e.target.value.trim())}
                    placeholder="Enter your security token"
                    className="w-full pl-10 pr-4 py-3 bg-[#f6f8f7] border border-[#bac4c6] rounded-xl text-sm font-mono text-[#1f2a2e] placeholder-[#6a7f84] focus:outline-none focus:border-[#1c4a59] focus:bg-white transition-all min-h-[44px]"
                  />
                </div>
              </div>

              {/* Verified Token Institution Display */}
              {tokenVerifiedData?.valid && (
                <div className="p-3 bg-[#f6f8f7] border border-[#bac4c6] rounded-xl text-xs flex items-center gap-2 text-[#1c4a59]">
                  <CheckCircle2 className="w-4 h-4 text-[#06d6a0] shrink-0" />
                  <span className="font-semibold truncate">
                    Invitation for <strong>{tokenVerifiedData.organization?.name || 'Authorized Campus'}</strong> ({tokenVerifiedData.role || 'Staff'})
                  </span>
                </div>
              )}

              {/* Full Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#1f2a2e] block">Your Full Name</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#6a7f84]">
                    <UserIcon className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    required
                    value={inviteFullName}
                    onChange={(e) => setInviteFullName(e.target.value)}
                    placeholder="e.g. Samuel Osei"
                    className="w-full pl-10 pr-4 py-3 bg-[#f6f8f7] border border-[#bac4c6] rounded-xl text-sm font-medium text-[#1f2a2e] placeholder-[#6a7f84] focus:outline-none focus:border-[#1c4a59] focus:bg-white transition-all min-h-[44px]"
                  />
                </div>
              </div>

              {/* Email */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#1f2a2e] block">Your Email Address</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#6a7f84]">
                    <Mail className="w-4 h-4" />
                  </div>
                  <input
                    type="email"
                    required
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="you@email.com"
                    className="w-full pl-10 pr-4 py-3 bg-[#f6f8f7] border border-[#bac4c6] rounded-xl text-sm font-medium text-[#1f2a2e] placeholder-[#6a7f84] focus:outline-none focus:border-[#1c4a59] focus:bg-white transition-all min-h-[44px]"
                  />
                </div>
                <EmailValidationFeedback 
                  result={inviteEmailValidation} 
                  onApplyCorrection={(c) => setInviteEmail(c)} 
                />
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#1f2a2e] block">Choose Password</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#6a7f84]">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type={showInvitePassword ? 'text' : 'password'}
                    required
                    value={invitePassword}
                    onChange={(e) => setInvitePassword(e.target.value)}
                    placeholder="Min. 8 characters"
                    className="w-full pl-10 pr-11 py-3 bg-[#f6f8f7] border border-[#bac4c6] rounded-xl text-sm font-medium text-[#1f2a2e] placeholder-[#6a7f84] focus:outline-none focus:border-[#1c4a59] focus:bg-white transition-all min-h-[44px]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowInvitePassword(!showInvitePassword)}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-[#6a7f84] hover:text-[#1c4a59] cursor-pointer"
                  >
                    {showInvitePassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Primary Action Button (CTA #faae57) */}
              <button
                type="submit"
                disabled={isPending}
                className="w-full bg-[#faae57] hover:bg-[#e4ae67] text-[#1f2a2e] font-bold py-3.5 px-6 rounded-xl transition-all shadow-sm active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2 min-h-[44px] cursor-pointer text-sm"
              >
                {isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-[#1f2a2e]" />
                    <span>Validating Invitation...</span>
                  </>
                ) : (
                  <>
                    <span>Accept Invite & Join</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          )}

          {/* TAB 4: FORGOT PASSWORD */}
          {activeTab === 'forgot' && (
            <form onSubmit={handleForgotSubmit} className="space-y-4">
              <div className="flex items-center gap-2 pb-1 border-b border-[#bac4c6]">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('signin');
                    setErrorMessage(null);
                    setSuccessMessage(null);
                  }}
                  className="text-xs font-bold text-[#1c4a59] hover:underline flex items-center gap-1"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Back to Sign In
                </button>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#1f2a2e] block">
                  Account Username or Email
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#6a7f84]">
                    <Mail className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    required
                    value={forgotInput}
                    onChange={(e) => setForgotInput(e.target.value)}
                    placeholder="e.g. admin or staff@school.edu.gh"
                    className="w-full pl-10 pr-4 py-3 bg-[#f6f8f7] border border-[#bac4c6] rounded-xl text-sm font-medium text-[#1f2a2e] placeholder-[#6a7f84] focus:outline-none focus:border-[#1c4a59] focus:bg-white transition-all min-h-[44px]"
                  />
                </div>
                <p className="text-[11px] text-[#6a7f84]">
                  Enter your registered username or email to receive password recovery instructions.
                </p>
              </div>

              {/* Primary Action Button (CTA #faae57) */}
              <button
                type="submit"
                disabled={isPending || forgotSent}
                className="w-full bg-[#faae57] hover:bg-[#e4ae67] text-[#1f2a2e] font-bold py-3.5 px-6 rounded-xl transition-all shadow-sm active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2 min-h-[44px] cursor-pointer text-sm"
              >
                {isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-[#1f2a2e]" />
                    <span>Processing Request...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>Send Reset Instructions</span>
                  </>
                )}
              </button>
            </form>
          )}

        </div>

        {/* Security & Multi-Role Note */}
        <div className="mt-4 px-2 flex items-center justify-center gap-2 text-center text-[11px] text-[#6a7f84]">
          <ShieldCheck className="w-3.5 h-3.5 text-[#06d6a0] shrink-0" />
          <span>Role-Based Access Control enforced directly via Supabase RLS</span>
        </div>
      </div>

      {/* Global Compliance & Regulatory Footer */}
      <footer className="w-full max-w-2xl mx-auto pt-6 pb-2 border-t border-[#bac4c6] mt-8 text-center sm:flex sm:items-center sm:justify-between text-xs text-[#6a7f84]">
        <p>© {new Date().getFullYear()} SchoolSphere 3.1 & Akoko Solutions</p>
        <div className="flex flex-wrap items-center justify-center gap-3 mt-2 sm:mt-0 font-medium">
          <button
            type="button"
            onClick={() => setShowPrivacy(true)}
            className="hover:text-[#1c4a59] transition-colors cursor-pointer"
          >
            Privacy Policy
          </button>
          <span>•</span>
          <button
            type="button"
            onClick={() => setShowTerms(true)}
            className="hover:text-[#1c4a59] transition-colors cursor-pointer"
          >
            Terms of Service
          </button>
          <span>•</span>
          <button
            type="button"
            onClick={() => openCookiePreferences()}
            className="hover:text-[#1c4a59] transition-colors cursor-pointer"
          >
            Cookie Settings
          </button>
          <span>•</span>
          <button
            type="button"
            onClick={() => setShowSiteMap(true)}
            className="hover:text-[#1c4a59] transition-colors cursor-pointer"
          >
            Site Map
          </button>
        </div>
      </footer>

      {/* Regulatory Modals */}
      <PrivacyPolicyModal isOpen={showPrivacy} onClose={() => setShowPrivacy(false)} />
      <TermsOfServiceModal isOpen={showTerms} onClose={() => setShowTerms(false)} />
      <SiteMapModal
        isOpen={showSiteMap}
        onClose={() => setShowSiteMap(false)}
        onOpenPrivacy={() => setShowPrivacy(true)}
        onOpenTerms={() => setShowTerms(true)}
        onOpenCookies={() => openCookiePreferences()}
      />
    </div>
  );
}
