import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Cookie, ShieldCheck, Check, Settings, X, ChevronRight, Lock, Database, Sliders } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface CookiePreferences {
  essential: boolean; // Always true
  functional: boolean;
  diagnostics: boolean;
  timestamp: string;
}

const STORAGE_KEY = 'esepa_cookie_consent_v1';

export function CookieConsentBanner() {
  const [showBanner, setShowBanner] = useState(false);
  const [showPreferencesModal, setShowPreferencesModal] = useState(false);
  const [preferences, setPreferences] = useState<CookiePreferences>({
    essential: true,
    functional: true,
    diagnostics: true,
    timestamp: new Date().toISOString()
  });

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) {
        // Show after a brief delay for smoother entry
        const timer = setTimeout(() => setShowBanner(true), 1200);
        return () => clearTimeout(timer);
      } else {
        const parsed = JSON.parse(stored);
        setPreferences(parsed);
      }
    } catch (e) {
      setShowBanner(true);
    }

    // Allow any button or link across the app to reopen Cookie Preferences
    const handleOpenPreferences = () => {
      setShowPreferencesModal(true);
    };

    window.addEventListener('open-cookie-preferences', handleOpenPreferences);
    return () => window.removeEventListener('open-cookie-preferences', handleOpenPreferences);
  }, []);

  const saveConsent = (prefs: CookiePreferences) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch (e) {}
    setPreferences(prefs);
    setShowBanner(false);
    setShowPreferencesModal(false);
  };

  const handleAcceptAll = () => {
    saveConsent({
      essential: true,
      functional: true,
      diagnostics: true,
      timestamp: new Date().toISOString()
    });
  };

  const handleRejectNonEssential = () => {
    saveConsent({
      essential: true,
      functional: false,
      diagnostics: false,
      timestamp: new Date().toISOString()
    });
  };

  const handleSavePreferences = () => {
    saveConsent({
      ...preferences,
      essential: true,
      timestamp: new Date().toISOString()
    });
  };

  return (
    <>
      {/* Floating Bottom Cookie Consent Notice */}
      <AnimatePresence>
        {showBanner && !showPreferencesModal && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.98 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="fixed bottom-20 lg:bottom-5 left-3 sm:left-6 right-3 sm:right-auto sm:max-w-xl z-50 pointer-events-auto"
          >
            <div className="bg-white/95 backdrop-blur-md border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-2xl shadow-slate-900/15 flex flex-col gap-3.5 text-left">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#06D6A0]/15 text-[#065f46] flex items-center justify-center shrink-0 border border-[#06D6A0]/30 mt-0.5">
                  <Cookie className="w-5 h-5 text-[#1B9AAA]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-sm font-black text-slate-900 tracking-tight">Institutional Privacy & Cookie Notice</h4>
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                      GDPR & Act 843
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                    SchoolSphere uses strictly necessary cookies and local storage tokens for secure session authentication, tenant isolation, and offline cache resilience.
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100 sm:justify-end">
                <button
                  type="button"
                  onClick={() => setShowPreferencesModal(true)}
                  className="px-3 py-2 rounded-xl text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200 transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Sliders className="w-3.5 h-3.5 text-slate-500" />
                  <span>Customize</span>
                </button>
                <button
                  type="button"
                  onClick={handleRejectNonEssential}
                  className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-100 border border-slate-200 transition-colors cursor-pointer"
                >
                  Only Essential
                </button>
                <button
                  type="button"
                  onClick={handleAcceptAll}
                  className="px-4 py-2 rounded-xl text-xs font-extrabold bg-[#06D6A0] hover:bg-[#05b88a] text-slate-950 shadow-sm active:scale-95 transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4 text-slate-950 stroke-[2.5]" />
                  <span>Accept All</span>
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Detailed Cookie Preferences Modal */}
      <AnimatePresence>
        {showPreferencesModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-xs overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-white rounded-3xl border border-slate-200 max-w-xl w-full p-5 sm:p-7 shadow-2xl relative text-left my-auto"
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-[#1B9AAA]/10 border border-[#1B9AAA]/30 text-[#1B9AAA] flex items-center justify-center">
                    <Settings className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-extrabold text-slate-900 tracking-tight">Cookie & Storage Preferences</h3>
                    <p className="text-xs text-slate-500 font-medium">Manage how data is stored on your device</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPreferencesModal(false)}
                  className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-colors cursor-pointer"
                  title="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Cookie Categories List */}
              <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
                {/* 1. Essential */}
                <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/70 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Lock className="w-4 h-4 text-[#1B9AAA]" />
                      <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">Strictly Necessary (Required)</span>
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-[#06D6A0]/15 text-[#065f46] border border-[#06D6A0]/30">
                      Always Active
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Essential for secure authentication, institutional tenant isolation (Row-Level Security), cryptographic tokens, and prevention of cross-site request forgery. These cannot be disabled.
                  </p>
                </div>

                {/* 2. Functional & Offline Cache */}
                <div className="p-4 rounded-2xl border border-slate-200 bg-white hover:border-slate-300 transition-colors space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Database className="w-4 h-4 text-emerald-600" />
                      <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">Offline Cache & Functional</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={preferences.functional}
                        onChange={(e) => setPreferences({ ...preferences, functional: e.target.checked })}
                        className="sr-only peer"
                      />
                      <div className="w-10 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#06D6A0]"></div>
                    </label>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Stores cached student biodata, attendance logs, and marks locally via indexed databases (Dexie) so teachers can continue grading without network interruption.
                  </p>
                </div>

                {/* 3. Diagnostics & Latency Monitoring */}
                <div className="p-4 rounded-2xl border border-slate-200 bg-white hover:border-slate-300 transition-colors space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-indigo-600" />
                      <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">Cloud Sync Diagnostics</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={preferences.diagnostics}
                        onChange={(e) => setPreferences({ ...preferences, diagnostics: e.target.checked })}
                        className="sr-only peer"
                      />
                      <div className="w-10 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#06D6A0]"></div>
                    </label>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Monitors cloud database latency to automatically alert campus administrators in case of internet instability or packet loss.
                  </p>
                </div>
              </div>

              {/* Footer Controls */}
              <div className="flex items-center justify-between gap-3 pt-5 mt-5 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleRejectNonEssential}
                  className="text-xs font-bold text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
                >
                  Reject Optional
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleAcceptAll}
                    className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-100 border border-slate-200 transition-colors cursor-pointer"
                  >
                    Accept All
                  </button>
                  <button
                    type="button"
                    onClick={handleSavePreferences}
                    className="px-4 py-2 rounded-xl text-xs font-black bg-[#1B9AAA] hover:bg-[#14727D] text-white shadow-md active:scale-95 transition-all cursor-pointer"
                  >
                    Save Preferences
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}

export function openCookiePreferences() {
  window.dispatchEvent(new CustomEvent('open-cookie-preferences'));
}
