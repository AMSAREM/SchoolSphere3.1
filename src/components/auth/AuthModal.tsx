import React from 'react';
import { X } from 'lucide-react';
import { AuthScreens } from './AuthScreens';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTab?: 'signin' | 'register_org' | 'join_invite';
  inviteToken?: string;
  onSuccess?: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  defaultTab = 'signin',
  inviteToken,
  onSuccess
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className="relative w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-3xl shadow-xl border border-[#bac4c6] bg-[#f6f8f7] focus:outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 z-20 p-2 rounded-full text-[#6a7f84] hover:text-[#1f2a2e] hover:bg-white border border-transparent hover:border-[#bac4c6] transition-colors cursor-pointer"
          aria-label="Close auth dialog"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Embedded Canonical Auth Screen */}
        <div className="p-2 sm:p-4">
          <AuthScreens
            defaultTab={defaultTab}
            inviteToken={inviteToken}
            onSuccess={() => {
              if (onSuccess) onSuccess();
              onClose();
            }}
          />
        </div>
      </div>
    </div>
  );
};
