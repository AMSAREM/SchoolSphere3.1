import React, { useState, useEffect, useMemo } from 'react';
import { Clock, Key, Mail, Phone, X, Check, AlertTriangle, ArrowRight, ShieldCheck, Copy, RefreshCw } from 'lucide-react';
import { cn } from '../lib/utils';
import { activateTenantLicense } from '../lib/licenseSync';
import { useNotifications } from '../contexts/NotificationContext';

interface ClientTrialBannerProps {
  schoolId?: string | null;
  schoolName: string;
  licenseTier?: string;
  durationMonths?: string | number | null;
  expiryDate?: number | null;
  createdAt?: number | null;
  isTrial?: boolean;
  onActivationSuccess: () => Promise<void> | void;
}

export const ClientTrialBanner: React.FC<ClientTrialBannerProps> = ({
  schoolId,
  schoolName,
  licenseTier = 'Standard',
  durationMonths,
  expiryDate,
  createdAt,
  isTrial = false,
  onActivationSuccess
}) => {
  const { showToast } = useNotifications();
  const [now, setNow] = useState<number>(() => Date.now());
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [licenseKeyInput, setLicenseKeyInput] = useState<string>('');
  const [isActivating, setIsActivating] = useState<boolean>(false);
  const [activationError, setActivationError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const storageScopeKey = useMemo(() => {
    const cleanId = String(schoolId || schoolName || 'default').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    return `schoolsphere_trial_dismissed_${cleanId}`;
  }, [schoolId, schoolName]);

  const fallbackExpiryStorageKey = useMemo(() => {
    const cleanId = String(schoolId || schoolName || 'default').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    return `schoolsphere_trial_fallback_expiry_${cleanId}`;
  }, [schoolId, schoolName]);

  const [isDismissedInSession, setIsDismissedInSession] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(storageScopeKey) === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      setIsDismissedInSession(sessionStorage.getItem(storageScopeKey) === 'true');
    } catch {
      setIsDismissedInSession(false);
    }
  }, [storageScopeKey]);

  // Tick every 30 seconds for live tabular countdown
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  // Determine effective expiration timestamp
  const effectiveExpiryDate = useMemo(() => {
    if (String(durationMonths || '').toLowerCase() === 'perpetual') {
      return null;
    }
    if (expiryDate && Number(expiryDate) > 0) {
      return Number(expiryDate);
    }
    if (!isTrial) {
      return null;
    }
    if (createdAt && Number(createdAt) > 0) {
      return Number(createdAt) + 30 * 24 * 60 * 60 * 1000;
    }
    try {
      const existingFallback = localStorage.getItem(fallbackExpiryStorageKey);
      if (existingFallback && Number(existingFallback) > 0) {
        return Number(existingFallback);
      }
      const generated = Date.now() + 30 * 24 * 60 * 60 * 1000;
      localStorage.setItem(fallbackExpiryStorageKey, String(generated));
      return generated;
    } catch {
      return Date.now() + 30 * 24 * 60 * 60 * 1000;
    }
  }, [expiryDate, createdAt, isTrial, durationMonths, fallbackExpiryStorageKey]);

  const countdown = useMemo(() => {
    if (!effectiveExpiryDate) return null;
    const diffMs = Math.max(0, effectiveExpiryDate - now);
    const totalMinutes = Math.floor(diffMs / (1000 * 60));
    const totalHours = diffMs / (1000 * 60 * 60);
    const days = Math.floor(totalMinutes / (60 * 24));
    const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
    const minutes = totalMinutes % 60;
    const isWithin30Days = diffMs <= 30 * 24 * 60 * 60 * 1000;
    const isCritical = totalHours <= 72; // Final 3 days (<= 72 hours)

    return {
      diffMs,
      days,
      hours,
      minutes,
      totalHours,
      isWithin30Days,
      isCritical,
      formattedExpiry: new Date(effectiveExpiryDate).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      })
    };
  }, [effectiveExpiryDate, now]);

  const isExplicitTrialAccount = useMemo(() => {
    if (String(durationMonths || '').toLowerCase() === 'perpetual') return false;
    return (
      Boolean(isTrial) ||
      String(durationMonths || '') === '1' ||
      String(licenseTier || '').toLowerCase().includes('trial')
    );
  }, [isTrial, durationMonths, licenseTier]);

  const shouldDisplayBanner = useMemo(() => {
    if (String(durationMonths || '').toLowerCase() === 'perpetual') return false;
    if (!countdown) return false;
    return isExplicitTrialAccount || countdown.isWithin30Days;
  }, [countdown, isExplicitTrialAccount, durationMonths]);

  if (!shouldDisplayBanner || !countdown) {
    return null;
  }

  // Dismissal is allowed until the final 3 days (isCritical)
  const canDismiss = !countdown.isCritical;
  if (isDismissedInSession && canDismiss && !isModalOpen) {
    return null;
  }

  const handleDismiss = () => {
    if (!canDismiss) return;
    try {
      sessionStorage.setItem(storageScopeKey, 'true');
    } catch {}
    setIsDismissedInSession(true);
  };

  const handleCopy = (value: string, label: string) => {
    navigator.clipboard?.writeText(value);
    setCopiedField(label);
    showToast(`${label} copied to clipboard`, 'success');
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleActivateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanKey = licenseKeyInput.trim().toUpperCase();
    if (!cleanKey) {
      setActivationError('Please enter a valid ESEPA license key.');
      return;
    }
    setIsActivating(true);
    setActivationError(null);
    try {
      const result = await activateTenantLicense(cleanKey, schoolId, {
        schoolName
      });
      if (result.success) {
        showToast('License key activated! Subscription status updated.', 'success');
        setLicenseKeyInput('');
        setIsModalOpen(false);
        await onActivationSuccess();
      } else {
        setActivationError(result.error || 'Could not validate or activate this license key.');
      }
    } catch (err: any) {
      setActivationError(err?.message || 'Network error while activating license key.');
    } finally {
      setIsActivating(false);
    }
  };

  const statusLabel = isExplicitTrialAccount ? 'Client Trial Period' : 'Subscription Renewal Window';

  return (
    <>
      <div
        role="region"
        aria-label="Subscription and Trial Status Banner"
        className={cn(
          'w-full min-h-9 py-1.5 px-3 sm:px-6 lg:px-8 flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 text-xs z-35 shrink-0 transition-colors duration-150 print:hidden border-b',
          countdown.isCritical
            ? 'bg-[#DC2626] text-white border-white/20'
            : 'bg-[#1c4a59] text-white border-[#faae57]/30'
        )}
      >
        {/* Left & Center: Status + Unboxed Metadata with Middot Separators + Tabular Countdown */}
        <div className="flex items-center gap-2 min-w-0 flex-1 flex-wrap sm:flex-nowrap">
          {countdown.isCritical ? (
            <AlertTriangle className="w-3.5 h-3.5 text-amber-200 shrink-0" />
          ) : (
            <Clock className="w-3.5 h-3.5 text-[#faae57] shrink-0" />
          )}

          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-wrap sm:flex-nowrap text-[11px] sm:text-xs leading-tight">
            <span className="font-semibold tracking-tight whitespace-nowrap">
              {countdown.isCritical ? 'Urgent: Expiring Soon' : statusLabel}
            </span>
            <span aria-hidden="true" className="text-white/50">·</span>
            <span className="text-white/90 whitespace-nowrap">
              {licenseTier || 'Standard'} Edition
            </span>
            <span aria-hidden="true" className="text-white/50">·</span>
            <span
              className={cn(
                'font-mono tabular-nums font-semibold whitespace-nowrap',
                countdown.isCritical ? 'text-amber-200' : 'text-[#faae57]'
              )}
            >
              {String(countdown.days).padStart(2, '0')}d {String(countdown.hours).padStart(2, '0')}h {String(countdown.minutes).padStart(2, '0')}m left
            </span>
            <span aria-hidden="true" className="hidden md:inline text-white/50">·</span>
            <span className="hidden md:inline text-white/80 whitespace-nowrap">
              Expires {countdown.formattedExpiry}
            </span>
          </div>
        </div>

        {/* Right: Primary Upgrade & Contact Action + Conditional Session Dismiss */}
        <div className="flex items-center gap-2 shrink-0 ml-auto">
          <button
            type="button"
            id="btn-open-trial-upgrade-modal"
            onClick={() => {
              setActivationError(null);
              setIsModalOpen(true);
            }}
            className={cn(
              'px-3 py-1 rounded-lg text-[11px] font-semibold tracking-tight transition-colors duration-150 flex items-center gap-1.5 whitespace-nowrap cursor-pointer',
              countdown.isCritical
                ? 'bg-white text-[#DC2626] hover:bg-amber-50'
                : 'bg-[#faae57] text-[#1f2a2e] hover:bg-[#e4ae67]'
            )}
          >
            <Key className="w-3 h-3 shrink-0" />
            <span>Upgrade / Contact</span>
          </button>

          {canDismiss && (
            <button
              type="button"
              onClick={handleDismiss}
              className="p-1 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors duration-150 cursor-pointer"
              title="Dismiss reminder for this session (stays pinned during final 3 days)"
              aria-label="Dismiss trial banner for this session"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Upgrade & Contact Support Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/65 backdrop-blur-xs animate-in fade-in duration-150 print:hidden">
          <div className="bg-white border border-[#bac4c6] rounded-2xl max-w-lg w-full overflow-hidden shadow-xl">
            {/* Modal Header */}
            <div className="bg-[#1c4a59] text-white px-6 py-4 flex items-center justify-between border-b border-[#bac4c6]/30">
              <div className="space-y-0.5">
                <h2 className="text-base font-semibold tracking-tight text-white">
                  Upgrade Subscription &amp; Support
                </h2>
                <p className="text-xs text-white/75">
                  {schoolName} · {licenseTier || 'Standard'} Edition
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                aria-label="Close Upgrade and Contact modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-6 max-h-[85vh] overflow-y-auto">
              {/* Countdown Telemetry Strip */}
              <div
                className={cn(
                  'p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3',
                  countdown.isCritical
                    ? 'bg-red-50 border-red-200 text-red-950'
                    : 'bg-[#f6f8f7] border-[#bac4c6] text-[#1f2a2e]'
                )}
              >
                <div className="space-y-0.5">
                  <span className="text-xs font-medium text-[#6a7f84]">
                    {isExplicitTrialAccount ? 'Trial Time Remaining' : 'Subscription Time Remaining'}
                  </span>
                  <div className="text-lg font-mono tabular-nums font-semibold tracking-tight">
                    {String(countdown.days).padStart(2, '0')}d : {String(countdown.hours).padStart(2, '0')}h : {String(countdown.minutes).padStart(2, '0')}m
                  </div>
                </div>
                <div className="sm:text-right space-y-0.5">
                  <span className="text-xs font-medium text-[#6a7f84]">Expiration Date</span>
                  <div className="text-xs font-semibold text-[#1c4a59]">
                    {countdown.formattedExpiry}
                  </div>
                </div>
              </div>

              {/* Direct License Key Activation Form */}
              <form onSubmit={handleActivateKey} className="space-y-3">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="modal-license-key-input"
                    className="text-xs font-semibold text-[#1f2a2e] flex items-center gap-1.5"
                  >
                    <ShieldCheck className="w-4 h-4 text-[#1c4a59]" />
                    <span>Have a New License Key? Activate Immediately</span>
                  </label>
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    id="modal-license-key-input"
                    type="text"
                    value={licenseKeyInput}
                    onChange={(e) => {
                      setLicenseKeyInput(e.target.value.toUpperCase());
                      if (activationError) setActivationError(null);
                    }}
                    placeholder="ESEPA-XXXX-XXXX-XXXX"
                    className="flex-1 px-3.5 py-2.5 bg-[#f6f8f7] border border-[#bac4c6] rounded-xl font-mono text-xs text-[#1f2a2e] placeholder:text-[#6a7f84]/70 focus:outline-hidden focus:border-[#1c4a59]"
                  />
                  <button
                    type="submit"
                    disabled={isActivating || !licenseKeyInput.trim()}
                    className="px-4 py-2.5 bg-[#1c4a59] hover:bg-[#163b47] disabled:opacity-50 text-white rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
                  >
                    {isActivating ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#faae57]" />
                        <span>Activating...</span>
                      </>
                    ) : (
                      <>
                        <span>Activate Key</span>
                        <ArrowRight className="w-3.5 h-3.5 text-[#faae57]" />
                      </>
                    )}
                  </button>
                </div>
                {activationError && (
                  <p className="text-xs text-[#DC2626] font-medium">
                    {activationError}
                  </p>
                )}
              </form>

              <div className="border-t border-[#bac4c6]/60 pt-5 space-y-3">
                <div className="space-y-0.5">
                  <h3 className="text-xs font-semibold text-[#1f2a2e]">
                    Request Full License or Subscription Renewal
                  </h3>
                  <p className="text-xs text-[#6a7f84]">
                    Contact <span className="font-semibold text-[#1c4a59]">SchoolSphere Team / Emmanuel Amoako</span> to purchase or extend your institutional license key.
                  </p>
                </div>

                <div className="space-y-2 text-xs">
                  {/* Email Channel */}
                  <div className="flex items-center justify-between gap-2 p-3 rounded-xl bg-[#f6f8f7] border border-[#bac4c6]/80">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Mail className="w-4 h-4 text-[#1c4a59] shrink-0" />
                      <div className="min-w-0">
                        <div className="text-[11px] text-[#6a7f84]">Official Support &amp; Licensing Email</div>
                        <a
                          href="mailto:amoakoemmanuel@hotmail.com?subject=SchoolSphere%20License%20Upgrade%20Request"
                          className="font-mono font-semibold text-[#1c4a59] hover:underline truncate block"
                        >
                          amoakoemmanuel@hotmail.com
                        </a>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopy('amoakoemmanuel@hotmail.com', 'Email address')}
                      className="px-2.5 py-1.5 rounded-lg bg-white border border-[#bac4c6] text-[#1f2a2e] hover:bg-slate-50 text-[11px] font-medium flex items-center gap-1 shrink-0 cursor-pointer"
                    >
                      {copiedField === 'Email address' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3 text-[#6a7f84]" />}
                      <span>{copiedField === 'Email address' ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>

                  {/* Phone Channels */}
                  <div className="flex items-center justify-between gap-2 p-3 rounded-xl bg-[#f6f8f7] border border-[#bac4c6]/80">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Phone className="w-4 h-4 text-[#1c4a59] shrink-0" />
                      <div className="min-w-0">
                        <div className="text-[11px] text-[#6a7f84]">Direct Licensing Hotlines (SchoolSphere Team)</div>
                        <div className="font-mono tabular-nums font-semibold text-[#1c4a59] flex items-center gap-2 flex-wrap">
                          <a href="tel:0551187045" className="hover:underline">0551187045</a>
                          <span aria-hidden="true" className="text-[#6a7f84]">·</span>
                          <a href="tel:0554234590" className="hover:underline">0554234590</a>
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopy('0551187045 / 0554234590', 'Phone numbers')}
                      className="px-2.5 py-1.5 rounded-lg bg-white border border-[#bac4c6] text-[#1f2a2e] hover:bg-slate-50 text-[11px] font-medium flex items-center gap-1 shrink-0 cursor-pointer"
                    >
                      {copiedField === 'Phone numbers' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3 text-[#6a7f84]" />}
                      <span>{copiedField === 'Phone numbers' ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3.5 bg-[#f6f8f7] border-t border-[#bac4c6]/70 flex items-center justify-between text-xs">
              <span className="text-[#6a7f84]">
                SchoolSphere Team / Emmanuel Amoako
              </span>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-1.5 rounded-lg bg-white border border-[#bac4c6] text-[#1f2a2e] hover:bg-slate-100 font-semibold transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
