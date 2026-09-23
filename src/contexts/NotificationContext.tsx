import { createContext, useContext, useState, ReactNode, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { toast, Toaster } from 'sonner';
import { AlertCircle } from 'lucide-react';

export type NotificationType = 'success' | 'error' | 'info';

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm?: () => void;
  onCancel?: () => void;
}

interface NotificationContextType {
  showToast: (message: string, type?: NotificationType) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [confirmState, setConfirmState] = useState<(ConfirmOptions & { resolve: (val: boolean) => void }) | null>(null);

  const showToast = useCallback((message: string, type: NotificationType = 'info') => {
    if (type === 'success') {
      toast.success(message);
    } else if (type === 'error') {
      toast.error(message);
    } else {
      toast(message);
    }
  }, []);

  const triggerConfirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setConfirmState({
        ...options,
        resolve
      });
    });
  }, []);

  const handleConfirm = () => {
    if (confirmState) {
      if (confirmState.onConfirm) {
        confirmState.onConfirm();
      }
      confirmState.resolve(true);
      setConfirmState(null);
    }
  };

  const handleCancel = () => {
    if (confirmState) {
      if (confirmState.onCancel) {
        confirmState.onCancel();
      }
      confirmState.resolve(false);
      setConfirmState(null);
    }
  };

  return (
    <NotificationContext.Provider value={{ showToast, confirm: triggerConfirm }}>
      {children}

      {/* Emil Kowalski's Sonner Toast Stack */}
      <Toaster 
        position="bottom-right"
        richColors
        closeButton
        toastOptions={{
          className: 'font-sans text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-800 shadow-lg',
          duration: 4000
        }}
      />

      {/* Anti-Slop High-Contrast Confirmation Modal */}
      <AnimatePresence>
        {confirmState && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={handleCancel}
              className="absolute inset-0 bg-slate-950/70 backdrop-blur-xs"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
              className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden"
              role="dialog"
              aria-modal="true"
            >
              <div className="p-6 space-y-5">
                <div className="flex items-start gap-3.5">
                  <div className="w-9 h-9 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800/60 flex items-center justify-center shrink-0 text-indigo-600 dark:text-indigo-400">
                    <AlertCircle className="w-5 h-5" />
                  </div>
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 tracking-tight leading-snug">
                      {confirmState.title}
                    </h3>
                    <p className="text-xs font-normal text-slate-600 dark:text-slate-400 leading-relaxed">
                      {confirmState.message}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800/80">
                  <button
                    type="button"
                    onClick={handleCancel}
                    className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer"
                  >
                    {confirmState.cancelLabel || 'Cancel'}
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirm}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white transition-colors text-xs font-semibold rounded-lg shadow-xs cursor-pointer"
                  >
                    {confirmState.confirmLabel || 'Confirm Action'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
}

