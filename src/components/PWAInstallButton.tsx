import React, { useState } from 'react';
import { Download, Share, PlusSquare, X, CheckCircle, Smartphone } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { cn } from '../lib/utils';

interface PWAInstallButtonProps {
  className?: string;
  variant?: 'landing' | 'header' | 'banner';
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  className,
  variant = 'landing',
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [showGeneralGuide, setShowGeneralGuide] = useState(false);

  // If already running as an installed standalone PWA, suppress the prompt
  if (isInstalled) {
    return null;
  }

  const handleInstallClick = async () => {
    if (isInstallable) {
      await install();
    } else if (isIOS) {
      setShowIOSGuide(true);
    } else {
      setShowGeneralGuide(true);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleInstallClick}
        title="Install SchoolSphere App on your device for fast offline access"
        className={cn(
          "inline-flex items-center gap-2 font-semibold transition-all cursor-pointer select-none",
          variant === 'landing' &&
            "px-3.5 py-2 text-xs text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/70 hover:bg-indigo-100 dark:hover:bg-indigo-900/80 border border-indigo-200 dark:border-indigo-800 rounded-lg shadow-2xs hover:scale-[1.02] active:scale-[0.98]",
          variant === 'header' &&
            "px-2.5 sm:px-3 py-1.5 text-xs text-indigo-700 dark:text-indigo-300 bg-indigo-50/80 dark:bg-indigo-950/50 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 border border-indigo-200 dark:border-indigo-800 rounded-lg shadow-2xs",
          variant === 'banner' &&
            "px-4 py-2 text-sm text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl shadow-md",
          className
        )}
      >
        <Download className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
        <span>{isIOS ? 'Install App (iOS)' : 'Install App'}</span>
      </button>

      {/* iOS Safari Installation Guide Modal */}
      {showIOSGuide && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200"
          onClick={() => setShowIOSGuide(false)}
        >
          <div 
            className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowIOSGuide(false)}
              className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-100 dark:border-indigo-800 flex items-center justify-center text-indigo-600">
                <Smartphone className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white leading-tight">Install SchoolSphere</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">Add to iPhone or iPad Home Screen</p>
              </div>
            </div>

            <ol className="space-y-3 text-xs text-slate-600 dark:text-slate-300">
              <li className="flex items-start gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900/60 font-bold text-indigo-600 text-[10px]">
                  1
                </span>
                <div>
                  Tap the <strong className="font-semibold text-slate-900 dark:text-white inline-flex items-center gap-1"><Share className="w-3 h-3 text-indigo-500" /> Share</strong> button in Safari's bottom toolbar.
                </div>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900/60 font-bold text-indigo-600 text-[10px]">
                  2
                </span>
                <div>
                  Scroll down the share sheet and tap <strong className="font-semibold text-slate-900 dark:text-white inline-flex items-center gap-1"><PlusSquare className="w-3 h-3 text-indigo-500" /> Add to Home Screen</strong>.
                </div>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900/60 font-bold text-indigo-600 text-[10px]">
                  3
                </span>
                <div>
                  Tap <strong className="font-semibold text-slate-900 dark:text-white">Add</strong> in the top right corner. SchoolSphere will launch directly like a native app!
                </div>
              </li>
            </ol>

            <button
              onClick={() => setShowIOSGuide(false)}
              className="mt-5 w-full rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 text-xs font-bold transition shadow-sm cursor-pointer"
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {/* Desktop / Android Fallback Modal when browser prompt is managed */}
      {showGeneralGuide && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200"
          onClick={() => setShowGeneralGuide(false)}
        >
          <div 
            className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowGeneralGuide(false)}
              className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-100 dark:border-indigo-800 flex items-center justify-center text-indigo-600">
                <Download className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white leading-tight">Install SchoolSphere</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">Desktop & Mobile Web App</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed mb-4">
              You can install SchoolSphere directly using your browser's install button in the address bar (Chrome, Edge, Brave), or via browser menu <strong className="text-slate-900 dark:text-white">Settings &rarr; Install School Sphere</strong>.
            </p>

            <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-emerald-800 dark:text-emerald-300 text-xs">
              <CheckCircle className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>Offline-ready with instant cached load times and fast access.</span>
            </div>

            <button
              onClick={() => setShowGeneralGuide(false)}
              className="mt-5 w-full rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 text-xs font-bold transition shadow-sm cursor-pointer"
            >
              Understood
            </button>
          </div>
        </div>
      )}
    </>
  );
};
