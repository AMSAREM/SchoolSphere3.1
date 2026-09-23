import React, { useState, useEffect, FormEvent } from 'react';
import { 
  Building2, 
  Lock, 
  Mail, 
  User as UserIcon, 
  KeyRound, 
  Eye, 
  EyeOff, 
  ArrowRight, 
  CheckCircle2, 
  ShieldCheck, 
  Sparkles, 
  AlertCircle, 
  Loader2, 
  GraduationCap,
  School as SchoolIcon,
  Check,
  CheckCheck,
  Zap,
  Globe2,
  Users
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { validateEmail, EmailValidationResult } from '../../lib/emailValidation';
import { EmailValidationFeedback } from './EmailValidationFeedback';
import { mapAuthErrorMessage } from '../../lib/authTelemetry';

interface AuthGateScreenProps {
  defaultTab?: 'signin' | 'register_org' | 'join_invite';
  inviteToken?: string;
  onSuccess?: () => void;
}

export const AuthGateScreen: React.FC<AuthGateScreenProps> = ({
  defaultTab = 'signin',
  inviteToken: initialInviteToken = '',
  onSuccess
}) => {
  const { signInWithPassword, registerOrganization, joinWithInviteToken } = useAuth();
  const [activeTab, setActiveTab] = useState<'signin' | 'register_org' | 'join_invite'>(defaultTab);

  // Sign In State
  const [signInEmail, setSignInEmail] = useState('');
  const [signInPassword, setSignInPassword] = useState('');
  const [showSignInPassword, setShowSignInPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [signInEmailValidation, setSignInEmailValidation] = useState<EmailValidationResult | null>(null);

  // Register Organization State
  const [orgName, setOrgName] = useState('');
  const [facilityType, setFacilityType] = useState('School');
  const [facilityCode, setFacilityCode] = useState('');
  const [adminFullName, setAdminFullName] = useState('');
  const [orgEmail, setOrgEmail] = useState('');
  const [orgPassword, setOrgPassword] = useState('');
  const [showOrgPassword, setShowOrgPassword] = useState(false);
  const [orgEmailValidation, setOrgEmailValidation] = useState<EmailValidationResult | null>(null);

  // Join with Invite State
  const [inviteToken, setInviteToken] = useState(initialInviteToken);
  const [isVerifyingToken, setIsVerifyingToken] = useState(false);
  const [tokenVerifiedData, setTokenVerifiedData] = useState<{
    valid: boolean;
    organization?: { id: string; name: string; slug: string };
    role?: string;
    email?: string;
  } | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [inviteFullName, setInviteFullName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [invitePassword, setInvitePassword] = useState('');
  const [showInvitePassword, setShowInvitePassword] = useState(false);
  const [inviteEmailValidation, setInviteEmailValidation] = useState<EmailValidationResult | null>(null);

  // Form Submission Status
  const [isPending, setIsPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Real-time email validation effect for Sign In
  useEffect(() => {
    if (!signInEmail) {
      setSignInEmailValidation(null);
      return;
    }
    const res = validateEmail(signInEmail);
    setSignInEmailValidation(res);
  }, [signInEmail]);

  // Real-time email validation effect for Org Register
  useEffect(() => {
    if (!orgEmail) {
      setOrgEmailValidation(null);
      return;
    }
    const res = validateEmail(orgEmail);
    setOrgEmailValidation(res);
  }, [orgEmail]);

  // Real-time email validation effect for Invite
  useEffect(() => {
    if (!inviteEmail) {
      setInviteEmailValidation(null);
      return;
    }
    const res = validateEmail(inviteEmail);
    setInviteEmailValidation(res);
  }, [inviteEmail]);

  // Debounced token verification
  useEffect(() => {
    const trimmed = inviteToken.trim();
    if (!trimmed || trimmed.length < 5) {
      setTokenVerifiedData(null);
      setTokenError(null);
      return;
    }

    const timer = setTimeout(async () => {
      setIsVerifyingToken(true);
      setTokenError(null);
      try {
        const res = await fetch('/api/auth/verify-invite', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: trimmed })
        });
        const data = await res.json();
        if (res.ok && data.success && data.valid) {
          setTokenVerifiedData(data);
          if (data.email) {
            setInviteEmail(data.email);
          }
        } else {
          setTokenVerifiedData(null);
          setTokenError(data.error || 'Invalid or expired invitation token');
        }
      } catch (err: any) {
        setTokenVerifiedData(null);
        setTokenError('Failed to connect to verification server');
      } finally {
        setIsVerifyingToken(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [inviteToken]);

  // Switch tabs and clear messages
  const handleTabChange = (tab: 'signin' | 'register_org' | 'join_invite') => {
    setActiveTab(tab);
    setErrorMessage(null);
    setSuccessMessage(null);
  };

  // Quick fill preset credentials for instant testing
  const handleQuickFill = (email: string, pass: string) => {
    setSignInEmail(email);
    setSignInPassword(pass);
    setErrorMessage(null);
  };

  // Sign In Submit
  const handleSignInSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (isPending) return;
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!signInEmail || !signInPassword) {
      setErrorMessage('Please enter both your work email/username and password.');
      return;
    }

    if (signInEmailValidation?.isDisposable) {
      setErrorMessage('Disposable temporary emails are not permitted.');
      return;
    }

    setIsPending(true);
    try {
      const res = await signInWithPassword(signInEmail, signInPassword);
      if (res.success) {
        setSuccessMessage('Authentication successful. Redirecting to workspace...');
        if (onSuccess) onSuccess();
      } else {
        setErrorMessage(mapAuthErrorMessage(res.error));
      }
    } catch (err: any) {
      setErrorMessage(mapAuthErrorMessage(err.message));
    } finally {
      setIsPending(false);
    }
  };

  // Register Org Submit
  const handleRegisterOrgSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (isPending) return;
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!orgName.trim() || !adminFullName.trim() || !orgEmail.trim() || !orgPassword) {
      setErrorMessage('Please fill in all required fields.');
      return;
    }

    if (orgPassword.length < 8) {
      setErrorMessage('Password must be at least 8 characters long.');
      return;
    }

    if (orgEmailValidation && !orgEmailValidation.isValid) {
      setErrorMessage(orgEmailValidation.syntaxError || 'Please provide a valid work email.');
      return;
    }

    if (orgEmailValidation?.isDisposable) {
      setErrorMessage('Temporary throwaway emails are prohibited for institutional accounts.');
      return;
    }

    setIsPending(true);
    try {
      const res = await registerOrganization({
        organizationName: orgName.trim(),
        facilityType,
        facilityCode: facilityCode.trim(),
        adminFullName: adminFullName.trim(),
        email: orgEmail.trim(),
        password: orgPassword
      });

      if (res.success) {
        setSuccessMessage('School organization registered successfully! Redirecting...');
        if (onSuccess) onSuccess();
      } else {
        setErrorMessage(mapAuthErrorMessage(res.error));
      }
    } catch (err: any) {
      setErrorMessage(mapAuthErrorMessage(err.message));
    } finally {
      setIsPending(false);
    }
  };

  // Join with Invite Submit
  const handleJoinInviteSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (isPending) return;
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!inviteToken.trim() || !inviteFullName.trim() || !inviteEmail.trim() || !invitePassword) {
      setErrorMessage('Please fill in all fields to complete your team registration.');
      return;
    }

    if (invitePassword.length < 8) {
      setErrorMessage('Password must be at least 8 characters long.');
      return;
    }

    setIsPending(true);
    try {
      const res = await joinWithInviteToken({
        token: inviteToken.trim(),
        fullName: inviteFullName.trim(),
        email: inviteEmail.trim(),
        password: invitePassword
      });

      if (res.success) {
        setSuccessMessage('Staff account provisioned successfully! Redirecting...');
        if (onSuccess) onSuccess();
      } else {
        setErrorMessage(mapAuthErrorMessage(res.error));
      }
    } catch (err: any) {
      setErrorMessage(mapAuthErrorMessage(err.message));
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto z-10 font-sans">
      {/* Main Dribbble-Style Login Card Container */}
      <div className="bg-white rounded-3xl shadow-2xl shadow-slate-200/70 border border-slate-200/80 overflow-hidden grid grid-cols-1 lg:grid-cols-12 transition-all">
        
        {/* Left Column: Form Section */}
        <div className="lg:col-span-7 p-6 sm:p-10 flex flex-col justify-between">
          <div>
            {/* Brand Header */}
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-[#F8FFE5] border border-[#06D6A0]/40 flex items-center justify-center shadow-xs overflow-hidden p-1.5">
                <img 
                  src="/sch sphere logo1.png" 
                  alt="SchoolSphere Logo" 
                  className="w-full h-full object-contain pointer-events-none select-none" 
                  referrerPolicy="no-referrer" 
                />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-extrabold text-xl tracking-tight text-slate-900 leading-tight">
                    School<span className="text-[#1B9AAA]">Sphere</span>
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#F8FFE5] text-[#14727D] border border-[#06D6A0]/30 uppercase tracking-wider">
                    v3.2
                  </span>
                </div>
                <p className="text-[11px] font-semibold text-slate-500">
                  Institutional Cloud Operating System
                </p>
              </div>
            </div>

            {/* Dynamic Welcome Heading */}
            <div className="mb-6">
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                {activeTab === 'signin' && 'Welcome back 👋'}
                {activeTab === 'register_org' && 'Register School 🏛️'}
                {activeTab === 'join_invite' && 'Join School Team 🎓'}
              </h1>
              <p className="text-sm text-slate-500 mt-1.5 font-medium">
                {activeTab === 'signin' && 'Please enter your institutional account details to sign in.'}
                {activeTab === 'register_org' && 'Set up a dedicated multi-tenant school workspace with isolated data.'}
                {activeTab === 'join_invite' && 'Enter your staff invitation token to activate your portal account.'}
              </p>
            </div>

            {/* Dribbble Segmented Pill Tabs */}
            <div className="grid grid-cols-3 gap-1 bg-slate-100/90 p-1.5 rounded-2xl border border-slate-200/60 mb-6">
              <button
                type="button"
                disabled={isPending}
                onClick={() => handleTabChange('signin')}
                className={`py-2.5 text-xs sm:text-sm font-bold rounded-xl transition-all duration-200 cursor-pointer ${
                  activeTab === 'signin'
                    ? 'bg-white text-slate-900 shadow-sm border border-slate-200/50'
                    : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/50'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => handleTabChange('register_org')}
                className={`py-2.5 text-xs sm:text-sm font-bold rounded-xl transition-all duration-200 cursor-pointer ${
                  activeTab === 'register_org'
                    ? 'bg-white text-slate-900 shadow-sm border border-slate-200/50'
                    : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/50'
                }`}
              >
                Register Org
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => handleTabChange('join_invite')}
                className={`py-2.5 text-xs sm:text-sm font-bold rounded-xl transition-all duration-200 cursor-pointer ${
                  activeTab === 'join_invite'
                    ? 'bg-white text-slate-900 shadow-sm border border-slate-200/50'
                    : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/50'
                }`}
              >
                Join Team
              </button>
            </div>

            {/* Error Banner */}
            {errorMessage && (
              <div className="mb-5 p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs sm:text-sm flex items-start gap-2.5 animate-in fade-in duration-200">
                <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                <div className="flex-1 font-semibold">{errorMessage}</div>
              </div>
            )}

            {/* Success Banner */}
            {successMessage && (
              <div className="mb-5 p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs sm:text-sm flex items-start gap-2.5 animate-in fade-in duration-200">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <div className="flex-1 font-semibold">{successMessage}</div>
              </div>
            )}

            {/* TAB 1: SIGN IN */}
            {activeTab === 'signin' && (
              <form onSubmit={handleSignInSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Email Address or Username
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      disabled={isPending}
                      value={signInEmail}
                      onChange={(e) => setSignInEmail(e.target.value)}
                      placeholder="admin@school.edu.gh or username"
                      required
                      className="w-full pl-10 pr-4 py-3 bg-slate-50/70 hover:bg-slate-50 border border-slate-250 focus:bg-white rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1B9AAA] focus:border-transparent transition-all disabled:opacity-50 font-medium"
                    />
                  </div>
                  {signInEmail.includes('@') && (
                    <EmailValidationFeedback
                      result={signInEmailValidation}
                      onApplyCorrection={(c) => setSignInEmail(c)}
                    />
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Password
                    </label>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type={showSignInPassword ? 'text' : 'password'}
                      disabled={isPending}
                      value={signInPassword}
                      onChange={(e) => setSignInPassword(e.target.value)}
                      placeholder="••••••••••••"
                      required
                      className="w-full pl-10 pr-10 py-3 bg-slate-50/70 hover:bg-slate-50 border border-slate-250 focus:bg-white rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1B9AAA] focus:border-transparent transition-all disabled:opacity-50 font-medium"
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setShowSignInPassword(!showSignInPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer p-1 transition-colors"
                      title={showSignInPassword ? "Hide password" : "Show password"}
                    >
                      {showSignInPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Helper Row: Remember Me & Quick Help */}
                <div className="flex items-center justify-between pt-1 pb-1 text-xs">
                  <label className="flex items-center gap-2 text-slate-600 font-semibold cursor-pointer select-none">
                    <input 
                      type="checkbox" 
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="w-4 h-4 rounded-md border-slate-300 text-[#06D6A0] focus:ring-[#1B9AAA] cursor-pointer"
                    />
                    <span>Remember this device</span>
                  </label>
                  <span className="text-[#1B9AAA] hover:text-[#14727D] font-bold cursor-pointer hover:underline">
                    Need Help?
                  </span>
                </div>

                {/* Primary Submit Button */}
                <button
                  type="submit"
                  disabled={isPending}
                  className="w-full py-3.5 px-5 bg-[#06D6A0] hover:bg-[#05b889] active:bg-[#049b73] text-[#022c22] font-bold rounded-xl text-sm transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-[#06D6A0]/25 hover:shadow-xl hover:shadow-[#06D6A0]/35 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer active:scale-[0.99]"
                >
                  {isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-[#022c22]" />
                      <span>Authenticating...</span>
                    </>
                  ) : (
                    <>
                      <span>Sign In to Workspace</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>

                {/* Quick Fill Demo Role Shortcuts */}
                <div className="pt-4 border-t border-slate-100">
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 text-center">
                    Quick Demo Credentials
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleQuickFill('school_admin', 'july94bab')}
                      className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-[#F8FFE5] text-slate-700 hover:text-[#14727D] border border-slate-200 text-[11px] font-bold transition-all cursor-pointer"
                    >
                      Admin
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickFill('ebenezer', 'july94bab')}
                      className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-[#F8FFE5] text-slate-700 hover:text-[#14727D] border border-slate-200 text-[11px] font-bold transition-all cursor-pointer"
                    >
                      Headmaster
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickFill('alice', 'july94bab')}
                      className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-[#F8FFE5] text-slate-700 hover:text-[#14727D] border border-slate-200 text-[11px] font-bold transition-all cursor-pointer"
                    >
                      Teacher
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickFill('kofi', 'july94bab')}
                      className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-[#F8FFE5] text-slate-700 hover:text-[#14727D] border border-slate-200 text-[11px] font-bold transition-all cursor-pointer"
                    >
                      Accountant
                    </button>
                  </div>
                </div>
              </form>
            )}

            {/* TAB 2: REGISTER ORGANIZATION */}
            {activeTab === 'register_org' && (
              <form onSubmit={handleRegisterOrgSubmit} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    School / Institution Name
                  </label>
                  <div className="relative">
                    <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      disabled={isPending}
                      value={orgName}
                      onChange={(e) => setOrgName(e.target.value)}
                      placeholder="e.g. Prempeh Academy"
                      required
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-50/70 hover:bg-slate-50 border border-slate-250 focus:bg-white rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1B9AAA] transition-all disabled:opacity-50 font-medium"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Facility Type
                    </label>
                    <select
                      disabled={isPending}
                      value={facilityType}
                      onChange={(e) => setFacilityType(e.target.value)}
                      className="w-full px-3 py-2.5 bg-slate-50/70 border border-slate-250 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1B9AAA] transition-all disabled:opacity-50 font-medium cursor-pointer"
                    >
                      <option value="School">K-12 School</option>
                      <option value="College">College / Univ</option>
                      <option value="Vocational">Vocational</option>
                      <option value="Enterprise">Enterprise Academy</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Campus Code (Optional)
                    </label>
                    <input
                      type="text"
                      disabled={isPending}
                      value={facilityCode}
                      onChange={(e) => setFacilityCode(e.target.value)}
                      placeholder="e.g. MAIN-01"
                      className="w-full px-3 py-2.5 bg-slate-50/70 border border-slate-250 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1B9AAA] transition-all disabled:opacity-50 font-medium"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Administrator Full Name
                  </label>
                  <div className="relative">
                    <UserIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      disabled={isPending}
                      value={adminFullName}
                      onChange={(e) => setAdminFullName(e.target.value)}
                      placeholder="e.g. Dr. Kwame Mensah"
                      required
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-50/70 hover:bg-slate-50 border border-slate-250 focus:bg-white rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1B9AAA] transition-all disabled:opacity-50 font-medium"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Official Work Email
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="email"
                      disabled={isPending}
                      value={orgEmail}
                      onChange={(e) => setOrgEmail(e.target.value)}
                      placeholder="admin@school.edu.gh"
                      required
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-50/70 hover:bg-slate-50 border border-slate-250 focus:bg-white rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1B9AAA] transition-all disabled:opacity-50 font-medium"
                    />
                  </div>
                  <EmailValidationFeedback
                    result={orgEmailValidation}
                    onApplyCorrection={(c) => setOrgEmail(c)}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Admin Password (Min 8 Characters)
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type={showOrgPassword ? 'text' : 'password'}
                      disabled={isPending}
                      value={orgPassword}
                      onChange={(e) => setOrgPassword(e.target.value)}
                      placeholder="••••••••••••"
                      required
                      minLength={8}
                      className="w-full pl-10 pr-10 py-2.5 bg-slate-50/70 hover:bg-slate-50 border border-slate-250 focus:bg-white rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1B9AAA] transition-all disabled:opacity-50 font-medium"
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setShowOrgPassword(!showOrgPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer p-1"
                    >
                      {showOrgPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isPending}
                  className="w-full py-3.5 px-5 bg-[#06D6A0] hover:bg-[#05b889] text-[#022c22] font-bold rounded-xl text-sm transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-[#06D6A0]/25 cursor-pointer disabled:opacity-50"
                >
                  {isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-[#022c22]" />
                      <span>Provisioning Organization...</span>
                    </>
                  ) : (
                    <>
                      <span>Create Organization Workspace</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            )}

            {/* TAB 3: JOIN WITH INVITE TOKEN */}
            {activeTab === 'join_invite' && (
              <form onSubmit={handleJoinInviteSubmit} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Invitation Token
                  </label>
                  <div className="relative">
                    <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      disabled={isPending}
                      value={inviteToken}
                      onChange={(e) => setInviteToken(e.target.value)}
                      placeholder="inv_xxxxxxxxxxxxxxxx"
                      required
                      className="w-full pl-10 pr-9 py-2.5 bg-slate-50/70 hover:bg-slate-50 border border-slate-250 focus:bg-white rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1B9AAA] transition-all disabled:opacity-50 font-mono font-medium"
                    />
                    {isVerifyingToken && (
                      <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#1B9AAA] animate-spin" />
                    )}
                  </div>

                  {tokenVerifiedData && (
                    <div className="mt-2 p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2 animate-in fade-in">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <div>
                        <p className="font-bold">
                          Verified Campus: {tokenVerifiedData.organization?.name}
                        </p>
                        <p className="text-[11px] text-emerald-700">
                          Designated role: <strong className="capitalize text-emerald-900">{tokenVerifiedData.role}</strong>
                        </p>
                      </div>
                    </div>
                  )}

                  {tokenError && (
                    <div className="mt-1.5 text-xs text-rose-600 flex items-center gap-1.5 font-medium">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0 text-rose-500" />
                      <span>{tokenError}</span>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Your Full Name
                  </label>
                  <div className="relative">
                    <UserIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      disabled={isPending}
                      value={inviteFullName}
                      onChange={(e) => setInviteFullName(e.target.value)}
                      placeholder="e.g. Grace Ansah"
                      required
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-50/70 hover:bg-slate-50 border border-slate-250 focus:bg-white rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1B9AAA] transition-all disabled:opacity-50 font-medium"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Your Work Email
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="email"
                      disabled={isPending}
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="grace@school.edu.gh"
                      required
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-50/70 hover:bg-slate-50 border border-slate-250 focus:bg-white rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1B9AAA] transition-all disabled:opacity-50 font-medium"
                    />
                  </div>
                  <EmailValidationFeedback
                    result={inviteEmailValidation}
                    onApplyCorrection={(c) => setInviteEmail(c)}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Create Password (Min 8 Characters)
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type={showInvitePassword ? 'text' : 'password'}
                      disabled={isPending}
                      value={invitePassword}
                      onChange={(e) => setInvitePassword(e.target.value)}
                      placeholder="••••••••••••"
                      required
                      minLength={8}
                      className="w-full pl-10 pr-10 py-2.5 bg-slate-50/70 hover:bg-slate-50 border border-slate-250 focus:bg-white rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1B9AAA] transition-all disabled:opacity-50 font-medium"
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setShowInvitePassword(!showInvitePassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer p-1"
                    >
                      {showInvitePassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isPending}
                  className="w-full py-3.5 px-5 bg-[#06D6A0] hover:bg-[#05b889] text-[#022c22] font-bold rounded-xl text-sm transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-[#06D6A0]/25 cursor-pointer disabled:opacity-50"
                >
                  {isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-[#022c22]" />
                      <span>Activating Profile...</span>
                    </>
                  ) : (
                    <>
                      <span>Join Workspace</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            )}
          </div>

          {/* Card Footer Security Assurance */}
          <div className="mt-8 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <div className="flex items-center gap-1.5 font-medium">
              <ShieldCheck className="w-4 h-4 text-[#06D6A0]" />
              <span>Multi-Tenant Row-Level Security</span>
            </div>
            <span className="font-semibold text-slate-400">Ghana Cloud Region</span>
          </div>
        </div>

        {/* Right Column: Dribbble Aesthetic Visual Showcase Panel */}
        <div className="hidden lg:flex lg:col-span-5 p-8 bg-gradient-to-br from-[#1B9AAA] via-[#14727D] to-[#0b4d54] text-white flex-col justify-between rounded-2xl m-3 relative overflow-hidden shadow-inner">
          {/* Subtle Ambient Glows */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-[#06D6A0]/20 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-[#FFC43D]/15 rounded-full blur-3xl pointer-events-none" />

          {/* Top Badge */}
          <div className="relative z-10">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/15 backdrop-blur-md border border-white/20 text-xs font-bold text-white shadow-xs">
              <Sparkles className="w-3.5 h-3.5 text-[#FFC43D]" />
              <span>Enterprise Campus Cloud</span>
            </div>
          </div>

          {/* Floating UI Widget Showcase */}
          <div className="relative z-10 my-8 space-y-4">
            {/* Live Status Card */}
            <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/20 shadow-lg text-white">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center">
                    <GraduationCap className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white">Institutional Sync</h4>
                    <p className="text-[10px] text-white/70">Single Source of Truth</p>
                  </div>
                </div>
                <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#06D6A0]/20 text-[#06D6A0] text-[10px] font-extrabold border border-[#06D6A0]/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#06D6A0] animate-pulse" />
                  ONLINE
                </span>
              </div>

              {/* Progress metrics */}
              <div className="space-y-2 text-xs">
                <div className="flex justify-between text-white/90 font-medium text-[11px]">
                  <span>Term 2 Grade Processing</span>
                  <span className="font-bold text-[#FFC43D]">98.4%</span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-white/20 overflow-hidden">
                  <div className="w-[98.4%] h-full bg-[#06D6A0] rounded-full" />
                </div>
              </div>
            </div>

            {/* Features Pill List */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 bg-white/10 backdrop-blur-xs px-3.5 py-2 rounded-xl border border-white/10 text-xs">
                <Check className="w-3.5 h-3.5 text-[#06D6A0] shrink-0" />
                <span className="font-semibold text-white/90">Isolated Row-Level Security (RLS)</span>
              </div>
              <div className="flex items-center gap-2 bg-white/10 backdrop-blur-xs px-3.5 py-2 rounded-xl border border-white/10 text-xs">
                <Check className="w-3.5 h-3.5 text-[#06D6A0] shrink-0" />
                <span className="font-semibold text-white/90">Zero Network Failure Offline Caching</span>
              </div>
              <div className="flex items-center gap-2 bg-white/10 backdrop-blur-xs px-3.5 py-2 rounded-xl border border-white/10 text-xs">
                <Check className="w-3.5 h-3.5 text-[#06D6A0] shrink-0" />
                <span className="font-semibold text-white/90">WAEC & MoE Compliant Transcripts</span>
              </div>
            </div>
          </div>

          {/* Bottom Testimonial / Footnote */}
          <div className="relative z-10 pt-4 border-t border-white/15">
            <p className="text-xs text-white/80 leading-relaxed font-medium">
              &ldquo;Connecting campus administrators, teachers, and finance teams across Ghana on a single resilient platform.&rdquo;
            </p>
            <div className="flex items-center gap-2 mt-2 text-[11px] text-[#FFC43D] font-bold">
              <Users className="w-3.5 h-3.5" />
              <span>Over 120+ Educational Campuses Active</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
