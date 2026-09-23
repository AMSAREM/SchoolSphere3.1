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
  UserCheck, 
  Layers, 
  GraduationCap
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

  // Sign In Submit
  const handleSignInSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (isPending) return;
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!signInEmail || !signInPassword) {
      setErrorMessage('Please enter both your work email and password.');
      return;
    }

    if (signInEmailValidation?.isDisposable) {
      setErrorMessage('Disposable emails are not permitted.');
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
      setErrorMessage('Temporary throwaway emails are prohibited for enterprise accounts.');
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
        setSuccessMessage('Organization registered successfully! Welcome to your new workspace.');
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
        setSuccessMessage('Account provisioned successfully! Redirecting to your organization...');
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
    <div className="min-h-screen w-full bg-slate-950 text-slate-100 flex flex-col justify-center items-center p-4 sm:p-6 lg:p-8 relative selection:bg-indigo-500 selection:text-white">
      {/* Background Subtle Gradient Blobs */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-72 h-72 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* Main Container */}
      <div className="w-full max-w-lg z-10">
        {/* Brand Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center p-3 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-600 shadow-xl shadow-indigo-600/20 mb-3 border border-indigo-400/20">
            <GraduationCap className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
            SchoolSphere Enterprise
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Institutional Cloud Workspace & Multi-Tenant Access
          </p>
        </div>

        {/* Auth Card */}
        <div className="bg-slate-900/90 backdrop-blur-xl border border-slate-800 rounded-2xl shadow-2xl p-6 sm:p-8">
          {/* Navigation Tabs */}
          <div className="grid grid-cols-3 gap-1 bg-slate-950/80 p-1 rounded-xl border border-slate-800/80 mb-6">
            <button
              type="button"
              disabled={isPending}
              onClick={() => handleTabChange('signin')}
              className={`py-2 text-xs sm:text-sm font-medium rounded-lg transition-all cursor-pointer ${
                activeTab === 'signin'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => handleTabChange('register_org')}
              className={`py-2 text-xs sm:text-sm font-medium rounded-lg transition-all cursor-pointer ${
                activeTab === 'register_org'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              Register Org
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => handleTabChange('join_invite')}
              className={`py-2 text-xs sm:text-sm font-medium rounded-lg transition-all cursor-pointer ${
                activeTab === 'join_invite'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              Join Team
            </button>
          </div>

          {/* Feedback Banners */}
          {errorMessage && (
            <div className="mb-5 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs sm:text-sm flex items-start gap-2.5 animate-in fade-in duration-200">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div className="flex-1">{errorMessage}</div>
            </div>
          )}

          {successMessage && (
            <div className="mb-5 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs sm:text-sm flex items-start gap-2.5 animate-in fade-in duration-200">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div className="flex-1">{successMessage}</div>
            </div>
          )}

          {/* TAB 1: SIGN IN */}
          {activeTab === 'signin' && (
            <form onSubmit={handleSignInSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Work Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="email"
                    disabled={isPending}
                    value={signInEmail}
                    onChange={(e) => setSignInEmail(e.target.value)}
                    placeholder="name@organization.com"
                    required
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-950/60 border border-slate-800 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all disabled:opacity-50"
                  />
                </div>
                <EmailValidationFeedback
                  result={signInEmailValidation}
                  onApplyCorrection={(c) => setSignInEmail(c)}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type={showSignInPassword ? 'text' : 'password'}
                    disabled={isPending}
                    value={signInPassword}
                    onChange={(e) => setSignInPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    className="w-full pl-10 pr-10 py-2.5 bg-slate-950/60 border border-slate-800 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all disabled:opacity-50"
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowSignInPassword(!showSignInPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 cursor-pointer"
                  >
                    {showSignInPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isPending}
                className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-medium rounded-lg text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/25 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Signing In...</span>
                  </>
                ) : (
                  <>
                    <span>Sign In to Workspace</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          )}

          {/* TAB 2: REGISTER ORGANIZATION */}
          {activeTab === 'register_org' && (
            <form onSubmit={handleRegisterOrgSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Organization / School Name
                </label>
                <div className="relative">
                  <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="text"
                    disabled={isPending}
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    placeholder="e.g. Prempeh Academy"
                    required
                    className="w-full pl-10 pr-4 py-2 bg-slate-950/60 border border-slate-800 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all disabled:opacity-50"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                    Facility Type
                  </label>
                  <select
                    disabled={isPending}
                    value={facilityType}
                    onChange={(e) => setFacilityType(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950/60 border border-slate-800 rounded-lg text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all disabled:opacity-50"
                  >
                    <option value="School">K-12 School</option>
                    <option value="College">College / Univ</option>
                    <option value="Vocational">Vocational</option>
                    <option value="Enterprise">Enterprise Academy</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                    Campus / Code (Optional)
                  </label>
                  <input
                    type="text"
                    disabled={isPending}
                    value={facilityCode}
                    onChange={(e) => setFacilityCode(e.target.value)}
                    placeholder="e.g. CAMPUS-A"
                    className="w-full px-3 py-2 bg-slate-950/60 border border-slate-800 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all disabled:opacity-50"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Administrator Full Name
                </label>
                <div className="relative">
                  <UserIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="text"
                    disabled={isPending}
                    value={adminFullName}
                    onChange={(e) => setAdminFullName(e.target.value)}
                    placeholder="e.g. Dr. Kwame Mensah"
                    required
                    className="w-full pl-10 pr-4 py-2 bg-slate-950/60 border border-slate-800 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all disabled:opacity-50"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Official Work Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="email"
                    disabled={isPending}
                    value={orgEmail}
                    onChange={(e) => setOrgEmail(e.target.value)}
                    placeholder="admin@school.edu.gh"
                    required
                    className="w-full pl-10 pr-4 py-2 bg-slate-950/60 border border-slate-800 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all disabled:opacity-50"
                  />
                </div>
                <EmailValidationFeedback
                  result={orgEmailValidation}
                  onApplyCorrection={(c) => setOrgEmail(c)}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Admin Password (Min 8 Characters)
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type={showOrgPassword ? 'text' : 'password'}
                    disabled={isPending}
                    value={orgPassword}
                    onChange={(e) => setOrgPassword(e.target.value)}
                    placeholder="••••••••••••"
                    required
                    minLength={8}
                    className="w-full pl-10 pr-10 py-2 bg-slate-950/60 border border-slate-800 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all disabled:opacity-50"
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowOrgPassword(!showOrgPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 cursor-pointer"
                  >
                    {showOrgPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <div className="flex items-center gap-1.5 mt-1 text-[11px] text-slate-400">
                  <ShieldCheck className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                  <span>Automatically creates workspace and configures workspace admin role</span>
                </div>
              </div>

              <button
                type="submit"
                disabled={isPending}
                className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-medium rounded-lg text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/25 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Bootstrapping Organization...</span>
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
            <form onSubmit={handleJoinInviteSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Invitation Token
                </label>
                <div className="relative">
                  <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="text"
                    disabled={isPending}
                    value={inviteToken}
                    onChange={(e) => setInviteToken(e.target.value)}
                    placeholder="inv_xxxxxxxxxxxxxxxx"
                    required
                    className="w-full pl-10 pr-9 py-2 bg-slate-950/60 border border-slate-800 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all disabled:opacity-50 font-mono"
                  />
                  {isVerifyingToken && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-400 animate-spin" />
                  )}
                </div>

                {/* Token Verification Status Feedback */}
                {tokenVerifiedData && (
                  <div className="mt-2 p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center gap-2 animate-in fade-in">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <div>
                      <p className="font-semibold">
                        Invitation Verified: {tokenVerifiedData.organization?.name}
                      </p>
                      <p className="text-[11px] text-emerald-300/80">
                        Joining as designated role: <strong className="capitalize text-white">{tokenVerifiedData.role}</strong>
                      </p>
                    </div>
                  </div>
                )}

                {tokenError && (
                  <div className="mt-1.5 text-xs text-rose-400 flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{tokenError}</span>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Your Full Name
                </label>
                <div className="relative">
                  <UserIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="text"
                    disabled={isPending}
                    value={inviteFullName}
                    onChange={(e) => setInviteFullName(e.target.value)}
                    placeholder="e.g. Grace Ansah"
                    required
                    className="w-full pl-10 pr-4 py-2 bg-slate-950/60 border border-slate-800 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all disabled:opacity-50"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Your Work Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="email"
                    disabled={isPending}
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="grace@school.edu.gh"
                    required
                    className="w-full pl-10 pr-4 py-2 bg-slate-950/60 border border-slate-800 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all disabled:opacity-50"
                  />
                </div>
                <EmailValidationFeedback
                  result={inviteEmailValidation}
                  onApplyCorrection={(c) => setInviteEmail(c)}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Create Password (Min 8 Characters)
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type={showInvitePassword ? 'text' : 'password'}
                    disabled={isPending}
                    value={invitePassword}
                    onChange={(e) => setInvitePassword(e.target.value)}
                    placeholder="••••••••••••"
                    required
                    minLength={8}
                    className="w-full pl-10 pr-10 py-2 bg-slate-950/60 border border-slate-800 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all disabled:opacity-50"
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowInvitePassword(!showInvitePassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 cursor-pointer"
                  >
                    {showInvitePassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isPending}
                className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-medium rounded-lg text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/25 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Activating Account...</span>
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

          {/* Footer note */}
          <div className="mt-6 pt-5 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500">
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
              <span>Multi-Tenant Row-Level Security</span>
            </div>
            <span>v3.2 Enterprise Auth</span>
          </div>
        </div>
      </div>
    </div>
  );
};
