import React from 'react';
import { AlertTriangle, Sparkles, CheckCircle2, ShieldAlert } from 'lucide-react';
import { EmailValidationResult } from '../../lib/emailValidation';

interface EmailValidationFeedbackProps {
  result: EmailValidationResult | null;
  onApplyCorrection: (correctedEmail: string) => void;
  className?: string;
  showSuccessState?: boolean;
}

export const EmailValidationFeedback: React.FC<EmailValidationFeedbackProps> = ({
  result,
  onApplyCorrection,
  className = '',
  showSuccessState = false
}) => {
  if (!result || !result.normalizedEmail) {
    return null;
  }

  // 1. Disposable Email Warning
  if (result.isDisposable) {
    return (
      <div className={`mt-1.5 flex items-start gap-1.5 text-xs text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-md p-2 animate-in fade-in duration-150 ${className}`}>
        <ShieldAlert className="w-4 h-4 shrink-0 text-rose-500 mt-0.5" />
        <div className="flex-1">
          <p className="font-semibold">Disposable address detected</p>
          <p className="text-[11px] text-rose-600/90 dark:text-rose-300 leading-snug">
            {result.disposableWarning || 'Temporary throwaway email addresses are not permitted. Please use an authentic organization email.'}
          </p>
        </div>
      </div>
    );
  }

  // 2. Syntax Error
  if (!result.isValid && result.syntaxError) {
    return (
      <div className={`mt-1.5 flex items-center gap-1.5 text-xs text-rose-600 dark:text-rose-400 animate-in fade-in duration-150 ${className}`}>
        <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-rose-500" />
        <span>{result.syntaxError}</span>
      </div>
    );
  }

  // 3. Typo Detected (Offers One-Click Correction)
  if (result.hasTypo && result.suggestedCorrection) {
    return (
      <div className={`mt-1.5 flex items-center justify-between gap-2 text-xs bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-amber-800 dark:text-amber-300 rounded-md px-2.5 py-1.5 animate-in fade-in duration-150 ${className}`}>
        <div className="flex items-center gap-1.5 truncate">
          <Sparkles className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
          <span className="truncate">
            Did you mean <strong className="font-semibold text-amber-900 dark:text-amber-200 underline decoration-amber-400">{result.suggestedCorrection}</strong>?
          </span>
        </div>
        <button
          type="button"
          onClick={() => onApplyCorrection(result.suggestedCorrection!)}
          className="shrink-0 px-2 py-0.5 text-[11px] font-bold bg-amber-600 hover:bg-amber-700 text-white rounded shadow-2xs transition-colors cursor-pointer"
        >
          Fix typo
        </button>
      </div>
    );
  }

  // 4. Valid State (optional subtle indicator)
  if (result.isValid && showSuccessState) {
    return (
      <div className={`mt-1 flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 ${className}`}>
        <CheckCircle2 className="w-3 h-3 shrink-0" />
        <span>Valid business email address</span>
      </div>
    );
  }

  return null;
};
